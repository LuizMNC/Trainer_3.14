"""Biblioteca local no MESMO SQLite PHH1. Extensão aditiva versionada, sem regras novas."""
from __future__ import annotations

import base64
from datetime import date, datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from tempfile import NamedTemporaryFile
from typing import Any
import zlib

from . import pokerstars, store
from .importer import import_phh

ROOT = Path(__file__).resolve().parents[2]
LIBRARY_VERSION = 1
MAX_JSON = 6 * 1024 * 1024
MAX_BACKUP = 64 * 1024 * 1024
MAX_BATCH_FILES = 500
MAX_BATCH_BYTES = 48 * 1024 * 1024


class LibraryError(Exception):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _pack_blob(data: bytes | str) -> bytes:
    raw = data.encode("utf-8") if isinstance(data, str) else bytes(data)
    return zlib.compress(raw, level=6)


def _unpack_bytes(raw: bytes | str) -> bytes:
    if isinstance(raw, (bytes, memoryview)):
        raw_bytes = bytes(raw)
        if raw_bytes.startswith(b"\x78"):
            return zlib.decompress(raw_bytes)
        return raw_bytes
    return str(raw).encode("utf-8")


def _unpack_text(raw: bytes | str) -> str:
    return _unpack_bytes(raw).decode("utf-8", errors="strict")


def validate_json(raw: bytes) -> dict:
    """Executa o decoder TypeScript existente inclusive em chamadas diretas Python."""
    if len(raw) > MAX_JSON:
        raise LibraryError("JSON acima de 6 MiB.")
    try:
        result = subprocess.run([os.environ.get("POKER_LIBRARY_NODE", "node"), str(ROOT / "app/src/lib/server/canonicalValidationCli.mjs")],
                                input=raw, capture_output=True, timeout=12, cwd=ROOT, check=False)
        output = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        raise LibraryError("Decoder canônico indisponível; use Node 24.22+ com suporte a TypeScript.") from exc
    if result.returncode != 0 or output.get("ok") is not True:
        raise LibraryError(str(output.get("error", "JSON incompatível.")))
    return output["hand"]


def reported(value: dict) -> Any:
    return value.get("value") if value.get("status") != "MISSING" else None


def summary(hand: dict, record_id: str, kind: str, file_name: str | None, imported: str) -> dict:
    metadata = hand["metadata"]
    played = None
    try:
        parts = [metadata.get(k) for k in ("year", "month", "day")]
        if all(type(v) is int for v in parts):
            played = date(*parts).isoformat()
    except ValueError:
        pass
    played_time = None
    raw_time = metadata.get("time")
    if isinstance(raw_time, dict) and raw_time.get("tomlType") == "time" and isinstance(raw_time.get("value"), str):
        try:
            played_time = time.fromisoformat(raw_time["value"]).isoformat()
        except ValueError:
            pass
    scale = hand["amountPolicy"]["decimalPlaces"]
    blind = str(Decimal(hand["table"]["minBetAtoms"]).scaleb(-scale).normalize())
    ps_meta = metadata.get("pokerstars") if isinstance(metadata.get("pokerstars"), dict) else {}
    tournament_id = metadata.get("tournamentId") if isinstance(metadata.get("tournamentId"), str) else ps_meta.get("tournamentId")
    buy_in = ps_meta.get("buyIn") if isinstance(ps_meta.get("buyIn"), str) else None
    language = ps_meta.get("language") if isinstance(ps_meta.get("language"), str) else None
    has_bounty = bool(ps_meta.get("bounties"))
    game_format_obj = hand["gameFormat"]
    game_format_val = reported(game_format_obj)
    game_format_reason = game_format_obj.get("reason") if isinstance(game_format_obj, dict) else None
    if not game_format_reason and isinstance(ps_meta.get("gameFormatReason"), str):
        game_format_reason = ps_meta.get("gameFormatReason")
    return {"recordId": record_id, "canonicalRecordId": hand["recordId"], "handId": reported(hand["source"]["handId"]),
            "fileName": file_name, "provenance": kind, "playedDate": played, "playedTime": played_time,
            "timeZone": metadata.get("time_zone") if isinstance(metadata.get("time_zone"), str) else None,
            "importedAtUtc": imported, "playerCount": len(hand["players"]), "variant": hand["variant"],
            "gameFormat": game_format_val, "gameFormatStatus": game_format_obj.get("status", "MISSING"),
            "gameFormatReason": game_format_reason, "tournamentId": tournament_id, "buyIn": buy_in,
            "language": language, "hasBounty": has_bounty, "decimalPlaces": scale,
            "currency": reported(hand["amountPolicy"]["currency"]), "blindsAtoms": hand["table"]["rawBlindsAtoms"],
            "antesAtoms": hand["table"]["rawAntesAtoms"], "bigBlind": blind,
            "players": [{"label": p["sourceLabel"], "name": reported(p["name"]), "position": reported(p["position"]),
                         "positionStatus": p["position"]["status"], "initialStackAtoms": p["initialStackAtoms"]} for p in hand["players"]],
            "board": hand["ending"]["board"], "status": hand["integrity"]["status"]}


def index_hand(connection: sqlite3.Connection, hand: dict, record_id: str, kind: str, file_name: str | None, imported: str) -> None:
    info = summary(hand, record_id, kind, file_name, imported)
    connection.execute("INSERT INTO library_index VALUES (?,?,?,?,?,?,?,?,?,?)", (
        record_id, kind, str(info["handId"]) if info["handId"] is not None else "", file_name or "", info["playerCount"], info["playedDate"],
        imported, info["status"], info["bigBlind"], dumps(info)))
    connection.executemany("INSERT INTO library_players VALUES (?,?,?,?)", [
        (record_id, i, (p["name"] or p["label"]).lower(), p["position"]) for i, p in enumerate(info["players"])])


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = store.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=3000")
    try:
        version = connection.execute("SELECT name FROM sqlite_master WHERE name='library_schema'").fetchone()
        if version:
            versions = connection.execute("SELECT version FROM library_schema").fetchall()
            if len(versions) != 1 or versions[0][0] != LIBRARY_VERSION:
                raise LibraryError("Extensão da biblioteca incompatível; nenhum registro foi substituído.")
        else:
            # Migração aditiva 0 -> 1, transacional. Não altera hands, application_id ou user_version PHH1.
            with connection:
                statements = [
                    "CREATE TABLE library_schema(version INTEGER NOT NULL)",
                    "CREATE TABLE library_index(record_id TEXT PRIMARY KEY, kind TEXT NOT NULL, hand_id TEXT NOT NULL, file_name TEXT NOT NULL, player_count INTEGER NOT NULL, played_date TEXT, imported_at TEXT NOT NULL, status TEXT NOT NULL, blind_key TEXT NOT NULL, summary_json TEXT NOT NULL)",
                    "CREATE TABLE library_json(record_id TEXT PRIMARY KEY REFERENCES library_index(record_id) ON DELETE CASCADE, raw_json BLOB NOT NULL, sha256 TEXT NOT NULL, canonical_json TEXT NOT NULL)",
                    "CREATE TABLE library_pokerstars(record_id TEXT PRIMARY KEY REFERENCES library_index(record_id) ON DELETE CASCADE, ps_hand_id TEXT UNIQUE NOT NULL, tournament_id TEXT, table_name TEXT, game_format TEXT, raw_text BLOB NOT NULL, sha256 TEXT NOT NULL, phh_toml BLOB NOT NULL, canonical_json TEXT NOT NULL)",
                    "CREATE TABLE library_study(record_id TEXT PRIMARY KEY REFERENCES library_index(record_id) ON DELETE CASCADE, note TEXT NOT NULL, favorite INTEGER NOT NULL, pending INTEGER NOT NULL, last_reviewed TEXT, updated_at TEXT NOT NULL)",
                    "CREATE TABLE library_tags(record_id TEXT NOT NULL REFERENCES library_index(record_id) ON DELETE CASCADE, tag TEXT NOT NULL COLLATE NOCASE, PRIMARY KEY(record_id,tag))",
                    "CREATE TABLE library_players(record_id TEXT NOT NULL REFERENCES library_index(record_id) ON DELETE CASCADE, player_index INTEGER NOT NULL, name TEXT NOT NULL, position TEXT, PRIMARY KEY(record_id,player_index))",
                    "CREATE INDEX library_imported ON library_index(imported_at,record_id)",
                    "CREATE INDEX library_played ON library_index(played_date,record_id)",
                    "CREATE INDEX library_status ON library_index(status,player_count,blind_key)",
                    "CREATE INDEX library_tag ON library_tags(tag,record_id)",
                    "CREATE INDEX library_position ON library_players(position,record_id)",
                    "CREATE INDEX library_ps_tid ON library_pokerstars(tournament_id,record_id)",
                    "CREATE INDEX library_ps_fmt ON library_pokerstars(game_format,record_id)",
                ]
                connection.execute("BEGIN IMMEDIATE")
                for statement in statements:
                    connection.execute(statement)
                connection.execute("INSERT INTO library_schema VALUES (?)", (LIBRARY_VERSION,))
        # Extensão aditiva segura em bancos v1 já existentes antes do importador PokerStars.
        if not connection.execute("SELECT name FROM sqlite_master WHERE name='library_pokerstars'").fetchone():
            with connection:
                connection.execute("CREATE TABLE IF NOT EXISTS library_pokerstars(record_id TEXT PRIMARY KEY REFERENCES library_index(record_id) ON DELETE CASCADE, ps_hand_id TEXT UNIQUE NOT NULL, tournament_id TEXT, table_name TEXT, game_format TEXT, raw_text BLOB NOT NULL, sha256 TEXT NOT NULL, phh_toml BLOB NOT NULL, canonical_json TEXT NOT NULL)")
                connection.execute("CREATE INDEX IF NOT EXISTS library_ps_tid ON library_pokerstars(tournament_id,record_id)")
                connection.execute("CREATE INDEX IF NOT EXISTS library_ps_fmt ON library_pokerstars(game_format,record_id)")
        # Também encontra importações feitas posteriormente pelo CLI PHH1 original.
        # Só reconstrói registros ainda não indexados, sem carregar eventos dos demais.
        pending = connection.execute("SELECT h.record_id FROM hands h WHERE NOT EXISTS(SELECT 1 FROM library_index i WHERE i.record_id=h.record_id)").fetchall()
        for row in pending:
            # read_hand abre sua própria conexão. Não manter escrita aberta entre releituras:
            # cache spill de um índice grande pode obter EXCLUSIVE e bloquear a própria validação.
            hand = store.read_hand(path, row[0])
            with connection:
                index_hand(connection, hand, row[0], "PHH_RECONSTRUCTED", reported(hand["source"]["fileName"]), hand["source"]["importedAtUtc"])
        return connection
    except Exception:
        connection.close()
        raise


def import_file(path: Path, raw: bytes, name: str, file_format: str) -> dict:
    if not isinstance(name, str) or not 1 <= len(name) <= 160 or any(c in name for c in ("/", "\\", "\0", "\r", "\n")):
        raise LibraryError("Nome de arquivo inválido; caminhos não são aceitos.")
    if file_format not in ("phh", "json"):
        return {"status": "UNSUPPORTED", "message": "Somente PHH e JSON canônico são suportados."}
    if not raw or len(raw) > (1_048_576 if file_format == "phh" else MAX_JSON):
        return {"status": "INVALID", "message": "Arquivo vazio ou acima do limite por formato."}
    if file_format == "phh":
        result = import_phh(raw, name)
        if not result["ok"]:
            return {"status": result["status"], "message": "; ".join(f'{i["code"]}: {i["message"]}' for i in result["issues"])}
        hand = result["hand"]
        record_id, kind = hand["recordId"], "PHH_RECONSTRUCTED"
    else:
        try:
            hand = validate_json(raw)
        except LibraryError as exc:
            unsupported = str(exc).startswith(("schemaVersion:","profile:","variant:","integrity.validatorVersion:"))
            return {"status": "UNSUPPORTED" if unsupported else "INVALID", "message": str(exc)}
        record_id, kind = "json-sha256:" + sha256(raw).hexdigest(), "JSON_UNAUTHENTICATED"
    connection = connect(path)
    try:
        with connection:
            previous = connection.execute("SELECT kind FROM library_index WHERE record_id=?", (record_id,)).fetchone()
            if previous:
                # Uma duplicação não encobre corrupção e não muda anotações/proveniência.
                read(path, record_id)
                return {"status": "DUPLICATE", "recordId": record_id, "message": "Os mesmos bytes já estão armazenados."}
            if file_format == "phh":
                old = connection.execute("SELECT raw_phh FROM hands WHERE record_id=?", (record_id,)).fetchone()
                if old:
                    if bytes(old[0]) != raw:
                        raise LibraryError("Fonte existente divergente.")
                    hand = store.read_hand(path, record_id)
                else:
                    # Mesma tabela/contrato do store PHH1, na transação da indexação.
                    connection.execute("INSERT INTO hands VALUES (?,?,?,?,?,?)", (record_id, hand["source"]["sha256"], hand["schemaVersion"], hand["source"]["importedAtUtc"], raw, dumps(hand)))
            index_hand(connection, hand, record_id, kind, name, hand["source"]["importedAtUtc"] if file_format == "phh" else now())
            if file_format == "json":
                connection.execute("INSERT INTO library_json VALUES (?,?,?,?)", (record_id, raw, sha256(raw).hexdigest(), dumps(hand)))
        return {"status": "IMPORTED", "recordId": record_id, "message": "PHH reconstruído pelo motor; autoria não autenticada." if file_format == "phh" else "JSON estruturalmente válido; origem não autenticada."}
    finally:
        connection.close()


def check_id(record_id: Any) -> str:
    if not isinstance(record_id, str) or not re.fullmatch(r"(?:phh|json|ps)-sha256:[a-f0-9]{64}", record_id):
        raise LibraryError("Identificador inválido.")
    return record_id


def _read_pokerstars(connection: sqlite3.Connection, path: Path, record_id: str, entry: sqlite3.Row) -> dict:
    row = connection.execute("SELECT * FROM library_pokerstars WHERE record_id=?", (record_id,)).fetchone()
    if row is None:
        raise LibraryError("Histórico PokerStars armazenado corrompido.")
    try:
        raw_text_bytes = _unpack_bytes(row["raw_text"])
    except zlib.error as exc:
        raise LibraryError("Histórico PokerStars armazenado corrompido.") from exc
    if sha256(raw_text_bytes).hexdigest() != row["sha256"] or record_id != "ps-sha256:" + row["sha256"]:
        raise LibraryError("Histórico PokerStars armazenado corrompido.")
    try:
        saved = json.loads(_unpack_text(row["canonical_json"]))
    except (ValueError, TypeError, zlib.error, UnicodeDecodeError) as exc:
        raise LibraryError("JSON canônico PokerStars corrompido.") from exc
    if not isinstance(saved, dict) or not isinstance(saved.get("source"), dict):
        raise LibraryError("Estrutura PokerStars corrompida no banco.")
    try:
        block_text = raw_text_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise LibraryError("Codificação PokerStars armazenada corrompida.") from exc
    parsed = pokerstars.parse_pokerstars_block({
        "fileName": entry["file_name"],
        "rawText": block_text,
        "rawBytes": raw_text_bytes,
        "sha256": row["sha256"],
    })
    if not parsed.get("ok"):
        raise LibraryError("Histórico PokerStars armazenado falhou na revalidação.")
    known_tables: dict[str, set[str]] = {}
    if row["tournament_id"]:
        tbl_rows = connection.execute("SELECT DISTINCT table_name FROM library_pokerstars WHERE tournament_id=? AND table_name IS NOT NULL", (row["tournament_id"],)).fetchall()
        known_tables[row["tournament_id"]] = {r[0] for r in tbl_rows if r[0]}
    tid_ev = pokerstars.collect_tournament_evidence([parsed], known_tables)
    fmt_field, fmt_reason = pokerstars.classify_hand_format(parsed, tid_ev)
    rebuilt = pokerstars.reconstruct_pokerstars_hand(parsed, fmt_field, fmt_reason)
    if not rebuilt.get("ok"):
        raise LibraryError("Reconstrução PokerStars divergiu da validação atual.")
    expected = rebuilt["hand"]
    expected["source"]["importedAtUtc"] = saved["source"].get("importedAtUtc")
    expected["source"]["fileName"] = saved["source"].get("fileName")
    # Se o formato foi comprovado em lote multi-mesa original (mesmo se outra mesa tiver sido excluída depois),
    # preserva a evidência de gameFormat consistente com row["game_format"] enquanto audita 100% dos eventos/stacks/potes.
    saved_fmt = saved.get("gameFormat")
    saved_fmt_val = saved_fmt.get("value") if isinstance(saved_fmt, dict) and saved_fmt.get("status") != "MISSING" else None
    if saved_fmt_val != row["game_format"]:
        raise LibraryError("Modalidade PokerStars diverge do índice armazenado.")
    if isinstance(saved_fmt, dict):
        expected["gameFormat"] = saved_fmt
        if isinstance(expected.get("metadata"), dict) and isinstance(expected["metadata"].get("pokerstars"), dict):
            saved_reason = saved.get("metadata", {}).get("pokerstars", {}).get("gameFormatReason")
            if isinstance(saved_reason, str):
                expected["metadata"]["pokerstars"]["gameFormatReason"] = saved_reason
        if isinstance(saved.get("integrity"), dict) and isinstance(saved["integrity"].get("warnings"), list):
            expected["integrity"]["warnings"] = saved["integrity"]["warnings"]
    if dumps(saved) != dumps(expected):
        saved_dump = json.dumps(saved, sort_keys=True, ensure_ascii=False, allow_nan=False)
        exp_dump = json.dumps(expected, sort_keys=True, ensure_ascii=False, allow_nan=False)
        if saved_dump != exp_dump:
            raise LibraryError("Canônico PokerStars diverge do histórico original.")
    return {"hand": saved, "provenance": entry["kind"], "fileName": entry["file_name"], "recordId": record_id}


def read(path: Path, record_id: str) -> dict:
    check_id(record_id)
    connection = connect(path)
    try:
        entry = connection.execute("SELECT * FROM library_index WHERE record_id=?", (record_id,)).fetchone()
        if entry is None:
            raise LibraryError("Mão não encontrada.")
        if entry["kind"] == "PHH_RECONSTRUCTED":
            hand = store.read_hand(path, record_id)
        elif entry["kind"] == "POKERSTARS_RECONSTRUCTED":
            return _read_pokerstars(connection, path, record_id, entry)
        else:
            row = connection.execute("SELECT * FROM library_json WHERE record_id=?", (record_id,)).fetchone()
            if row is None or sha256(row["raw_json"]).hexdigest() != row["sha256"] or record_id != "json-sha256:" + row["sha256"]:
                raise LibraryError("JSON original corrompido.")
            hand = validate_json(row["raw_json"])
            if dumps(hand) != row["canonical_json"]:
                raise LibraryError("Canônico diverge do JSON original.")
        return {"hand": hand, "provenance": entry["kind"], "fileName": entry["file_name"], "recordId": record_id}
    finally:
        connection.close()


DEFAULT_STUDY = {"note": "", "favorite": False, "pending": False, "lastReviewedAtUtc": None, "tags": []}


def study(connection: sqlite3.Connection, record_id: str) -> dict:
    row = connection.execute("SELECT * FROM library_study WHERE record_id=?", (record_id,)).fetchone()
    value = dict(DEFAULT_STUDY)
    if row:
        value.update(note=row["note"], favorite=bool(row["favorite"]), pending=bool(row["pending"]), lastReviewedAtUtc=row["last_reviewed"])
    value["tags"] = [r[0] for r in connection.execute("SELECT tag FROM library_tags WHERE record_id=? ORDER BY tag COLLATE NOCASE", (record_id,))]
    return value


def update_study(path: Path, record_id: str, value: dict) -> dict:
    check_id(record_id)
    if not isinstance(value, dict) or set(value) != {"note", "favorite", "pending", "tags", "markReviewed"}:
        raise LibraryError("Campos de estudo inválidos.")
    if not isinstance(value["note"], str) or len(value["note"]) > 5000 or any(type(value[k]) is not bool for k in ("favorite", "pending", "markReviewed")):
        raise LibraryError("Nota/indicadores inválidos; limite de 5.000 caracteres.")
    if not isinstance(value["tags"], list) or len(value["tags"]) > 20 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 40 or any(ord(c)<32 for c in t) for t in value["tags"]):
        raise LibraryError("Até 20 tags, com 1–40 caracteres cada.")
    tags = list({t.strip().casefold(): t.strip() for t in value["tags"]}.values())
    connection = connect(path)
    try:
        with connection:
            if not connection.execute("SELECT 1 FROM library_index WHERE record_id=?", (record_id,)).fetchone():
                raise LibraryError("Mão não encontrada.")
            old = study(connection, record_id)
            reviewed = now() if value["markReviewed"] else old["lastReviewedAtUtc"]
            connection.execute("INSERT INTO library_study VALUES (?,?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET note=excluded.note,favorite=excluded.favorite,pending=excluded.pending,last_reviewed=excluded.last_reviewed,updated_at=excluded.updated_at",
                               (record_id, value["note"], int(value["favorite"]), int(False if value["markReviewed"] else value["pending"]), reviewed, now()))
            connection.execute("DELETE FROM library_tags WHERE record_id=?", (record_id,))
            connection.executemany("INSERT INTO library_tags VALUES (?,?)", [(record_id, tag) for tag in tags])
        return study(connection, record_id)
    finally:
        connection.close()


def remove(path: Path, record_id: str, confirm: str, *, annotations_only: bool = False) -> dict:
    check_id(record_id)
    if confirm != record_id:
        raise LibraryError("Confirmação explícita da mão obrigatória.")
    connection = connect(path)
    try:
        with connection:
            row = connection.execute("SELECT kind FROM library_index WHERE record_id=?", (record_id,)).fetchone()
            if not row:
                raise LibraryError("Mão não encontrada.")
            if annotations_only:
                connection.execute("DELETE FROM library_study WHERE record_id=?", (record_id,))
                connection.execute("DELETE FROM library_tags WHERE record_id=?", (record_id,))
            else:
                connection.execute("DELETE FROM library_index WHERE record_id=?", (record_id,))
                if row[0] == "PHH_RECONSTRUCTED":
                    connection.execute("DELETE FROM hands WHERE record_id=?", (record_id,))
        return {"removed": True}
    finally:
        connection.close()


def filters_sql(filters: dict) -> tuple[str, list, int, int, str]:
    allowed = {"q", "player", "players", "position", "playedFrom", "playedTo", "importedFrom", "importedTo", "blind", "status", "tag", "favorite", "notes", "pending", "tournament", "format", "sort", "page", "pageSize"}
    if not isinstance(filters, dict) or set(filters)-allowed:
        raise LibraryError("Filtro desconhecido.")
    clauses, values = [], []
    for key, value in filters.items():
        if not isinstance(value, str) or len(value)>160:
            raise LibraryError("Valor de filtro inválido.")
        if not value:
            continue
        if key == "q":
            clauses.append("(instr(lower(i.record_id || ' ' || i.hand_id || ' ' || i.file_name || ' ' || COALESCE(json_extract(i.summary_json,'$.tournamentId'),'')),?)>0)"); values.append(value.lower())
        elif key == "tournament":
            clauses.append("EXISTS(SELECT 1 FROM library_pokerstars ps WHERE ps.record_id=i.record_id AND instr(lower(COALESCE(ps.tournament_id,'')),?)>0)"); values.append(value.lower())
        elif key == "format":
            if value not in ("MTT", "SNG", "CASH", "UNKNOWN"): raise LibraryError("Modalidade de filtro inválida.")
            if value == "UNKNOWN":
                clauses.append("json_extract(i.summary_json,'$.gameFormat') IS NULL")
            else:
                clauses.append("json_extract(i.summary_json,'$.gameFormat')=?"); values.append(value)
        elif key in ("player", "position"):
            clauses.append("EXISTS(SELECT 1 FROM library_players p WHERE p.record_id=i.record_id AND " + ("instr(p.name,?)>0" if key=="player" else "p.position=?") + ")"); values.append(value.lower() if key=="player" else value)
        elif key == "players":
            if value not in [str(n) for n in range(2,10)]: raise LibraryError("Quantidade de jogadores inválida.")
            clauses.append("i.player_count=?"); values.append(int(value))
        elif key in ("playedFrom","playedTo","importedFrom","importedTo"):
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",value): raise ValueError()
                date.fromisoformat(value)
            except ValueError as exc: raise LibraryError("Data de filtro inválida.") from exc
            column = "i.played_date" if key.startswith("played") else "substr(i.imported_at,1,10)"
            clauses.append(column+(">=?" if key.endswith("From") else "<=?")); values.append(value)
        elif key == "blind":
            if not re.fullmatch(r"\d{1,16}(?:\.\d{1,6})?",value): raise LibraryError("Blind inválido; use ponto decimal.")
            clauses.append("i.blind_key=?"); values.append(str(Decimal(value).normalize()))
        elif key == "status":
            if value not in ("VALIDATED_COMPLETE","VALIDATED_PARTIAL"): raise LibraryError("Status inválido.")
            clauses.append("i.status=?"); values.append(value)
        elif key == "tag":
            clauses.append("EXISTS(SELECT 1 FROM library_tags t WHERE t.record_id=i.record_id AND t.tag=? COLLATE NOCASE)"); values.append(value)
        elif key in ("favorite","pending","notes"):
            if value not in ("yes","no"): raise LibraryError("Indicador de filtro inválido.")
            condition = "length(s.note)>0" if key=="notes" else ("s.favorite=1" if key=="favorite" else "s.pending=1")
            clauses.append(("NOT " if value=="no" else "")+"EXISTS(SELECT 1 FROM library_study s WHERE s.record_id=i.record_id AND "+condition+")")
    try:
        page, size = int(filters.get("page","1")), int(filters.get("pageSize","20"))
        if not 1<=page<=100000 or not 1<=size<=50: raise ValueError()
    except ValueError as exc: raise LibraryError("Paginação inválida.") from exc
    orders = {"imported_desc":"i.imported_at DESC,i.record_id", "imported_asc":"i.imported_at ASC,i.record_id", "played_desc":"i.played_date IS NULL,i.played_date DESC,i.record_id", "played_asc":"i.played_date IS NULL,i.played_date ASC,i.record_id", "players":"i.player_count,i.record_id", "identifier":"i.hand_id,i.record_id"}
    if filters.get("sort","imported_desc") not in orders: raise LibraryError("Ordenação inválida.")
    return (" WHERE "+" AND ".join(clauses) if clauses else ""), values, page, size, orders[filters.get("sort","imported_desc")]


def listing(path: Path, filters: dict) -> dict:
    where, values, page, size, order = filters_sql(filters)
    connection = connect(path)
    try:
        total = connection.execute("SELECT count(*) FROM library_index i"+where,values).fetchone()[0]
        rows = connection.execute("SELECT i.record_id,i.summary_json FROM library_index i"+where+" ORDER BY "+order+" LIMIT ? OFFSET ?",[*values,size,(page-1)*size]).fetchall()
        items = [{**json.loads(row["summary_json"]), "study": study(connection,row["record_id"])} for row in rows]
        tournaments_rows = connection.execute(
            "SELECT tournament_id, COALESCE(MAX(json_extract(summary_json,'$.buyIn')), ''), MAX(game_format), count(*) "
            "FROM library_pokerstars ps JOIN library_index i ON i.record_id=ps.record_id "
            "WHERE ps.tournament_id IS NOT NULL AND ps.tournament_id != '' "
            "GROUP BY ps.tournament_id ORDER BY MAX(i.imported_at) DESC LIMIT 200"
        ).fetchall()
        fmt_rows = connection.execute(
            "SELECT COALESCE(json_extract(summary_json,'$.gameFormat'),'UNKNOWN') AS fmt, count(*) "
            "FROM library_index GROUP BY fmt ORDER BY count(*) DESC"
        ).fetchall()
        stats = {"total": connection.execute("SELECT count(*) FROM library_index").fetchone()[0],
                 "complete": connection.execute("SELECT count(*) FROM library_index WHERE status='VALIDATED_COMPLETE'").fetchone()[0],
                 "partial": connection.execute("SELECT count(*) FROM library_index WHERE status='VALIDATED_PARTIAL'").fetchone()[0],
                 "favorites": connection.execute("SELECT count(*) FROM library_study WHERE favorite=1").fetchone()[0],
                 "pending": connection.execute("SELECT count(*) FROM library_study WHERE pending=1").fetchone()[0],
                 "byPlayers": [{"label":str(r[0]),"count":r[1]} for r in connection.execute("SELECT player_count,count(*) FROM library_index GROUP BY player_count ORDER BY player_count")],
                 "byFormat": [{"label":r[0],"count":r[1]} for r in fmt_rows],
                 "tournaments": [{"tournamentId":r[0],"buyIn":r[1] or None,"gameFormat":r[2],"count":r[3]} for r in tournaments_rows],
                 "byImportMonth": [{"label":r[0],"count":r[1]} for r in connection.execute("SELECT substr(imported_at,1,7),count(*) FROM library_index GROUP BY 1 ORDER BY 1 DESC LIMIT 12")]}
        return {"items": items,"total":total,"page":page,"pageSize":size,"stats":stats}
    finally:
        connection.close()


def export_hand(path: Path, record_id: str, part: str) -> dict:
    loaded = read(path,record_id)
    connection = connect(path)
    try:
        if part == "canonical": return {"content":dumps(loaded["hand"]),"format":"json","provenance":loaded["provenance"]}
        if part == "study": return {"content":dumps({"schemaVersion":"poker-study/1","recordId":record_id,"provenance":loaded["provenance"],"study":study(connection,record_id)}),"format":"json"}
        if part != "source": raise LibraryError("Tipo de exportação inválido.")
        if loaded["provenance"] == "PHH_RECONSTRUCTED":
            raw = connection.execute("SELECT raw_phh FROM hands WHERE record_id=?",(record_id,)).fetchone()[0]
            fmt = "phh"
        elif loaded["provenance"] == "POKERSTARS_RECONSTRUCTED":
            try:
                raw = _unpack_bytes(connection.execute("SELECT raw_text FROM library_pokerstars WHERE record_id=?",(record_id,)).fetchone()[0])
            except zlib.error as exc:
                raise LibraryError("Histórico PokerStars armazenado corrompido.") from exc
            fmt = "txt"
        else:
            raw = connection.execute("SELECT raw_json FROM library_json WHERE record_id=?",(record_id,)).fetchone()[0]
            fmt = "json"
        return {"base64":base64.b64encode(raw).decode("ascii"),"format":fmt,"sha256":sha256(raw).hexdigest()}
    finally:
        connection.close()


def backup(path: Path) -> dict:
    connection = connect(path)
    temporary = None
    try:
        if path.stat().st_size > MAX_BACKUP: raise LibraryError("Backup pela interface limitado a 64 MiB; use sqlite3.Connection.backup localmente para acervos maiores.")
        with NamedTemporaryFile(dir=path.parent,suffix=".backup",delete=False) as file:
            temporary = Path(file.name)
        copy = sqlite3.connect(temporary)
        try: connection.backup(copy,pages=128)
        finally: copy.close()
        if temporary.stat().st_size > MAX_BACKUP: raise LibraryError("Backup acima de 64 MiB.")
        raw = temporary.read_bytes()
        return {"base64":base64.b64encode(raw).decode("ascii"),"sha256":sha256(raw).hexdigest(),"schemaVersion":LIBRARY_VERSION}
    finally:
        connection.close()
        if temporary is not None: temporary.unlink(missing_ok=True)


def _safe_upload_name(name: str) -> str:
    if not isinstance(name, str) or not 1 <= len(name) <= 180 or any(c in name for c in ("/", "\\", "\0", "\r", "\n")):
        raise LibraryError("Nome de arquivo inválido; caminhos não são aceitos.")
    return name


def _load_existing_index(path: Path) -> tuple[set[str], dict[str, tuple[str, str, str | None]], dict[str, set[str]]]:
    """Lê apenas índices existentes sem criar arquivo SQLite durante pré-análise."""
    if not path.is_file():
        return set(), {}, {}
    connection = connect(path)
    try:
        existing_records = {r[0] for r in connection.execute("SELECT record_id FROM library_index")}
        ps_ids = {
            r[0]: (r[1], r[2], r[3])
            for r in connection.execute("SELECT ps_hand_id, record_id, sha256, game_format FROM library_pokerstars")
        }
        known_tables: dict[str, set[str]] = {}
        for tid, tbl in connection.execute("SELECT tournament_id, table_name FROM library_pokerstars WHERE tournament_id IS NOT NULL AND table_name IS NOT NULL"):
            known_tables.setdefault(tid, set()).add(tbl)
        return existing_records, ps_ids, known_tables
    finally:
        connection.close()


def _expand_batch_inputs(files: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not isinstance(files, list) or not 1 <= len(files) <= MAX_BATCH_FILES:
        raise LibraryError(f"Lote deve conter entre 1 e {MAX_BATCH_FILES} arquivos.")
    total_raw = sum(len(f.get("raw", b"")) for f in files)
    if total_raw > MAX_BATCH_BYTES:
        raise LibraryError("Tamanho total enviado excede o limite de 48 MiB.")

    expanded: list[dict[str, Any]] = []
    pre_errors: list[dict[str, Any]] = []
    for item in files:
        name = _safe_upload_name(item["name"])
        fmt = str(item.get("format", "")).lower()
        raw = item.get("raw", b"")
        if fmt == "zip":
            try:
                zres = pokerstars.extract_zip_entries(raw, name)
                for sk in zres["skipped"]:
                    pre_errors.append({
                        "fileName": sk["name"], "handId": None, "status": "UNSUPPORTED",
                        "code": "ZIP_ENTRY_SKIPPED", "message": sk["reason"],
                    })
                for ent in zres["entries"]:
                    expanded.append({
                        "displayName": ent["baseName"][:160],
                        "archivePath": f"{name} -> {ent['name']}",
                        "format": ent["format"],
                        "raw": ent["raw"],
                    })
            except pokerstars.PokerStarsZipError as exc:
                pre_errors.append({
                    "fileName": name, "handId": None,
                    "status": "UNSUPPORTED" if exc.code in ("ZIP_ENCRYPTED", "ZIP_ENTRY_SKIPPED") else "INVALID",
                    "code": exc.code, "message": exc.message,
                })
        elif fmt in ("txt", "phh", "json"):
            expanded.append({"displayName": name[:160], "archivePath": name, "format": fmt, "raw": raw})
        else:
            pre_errors.append({
                "fileName": name, "handId": None, "status": "UNSUPPORTED",
                "code": "UNSUPPORTED_FILE_EXTENSION", "message": f"Formato '{fmt or 'desconhecido'}' não suportado. Envie ZIP, TXT PokerStars, PHH ou JSON.",
            })
    if len(expanded) > MAX_BATCH_FILES * 2:
        raise LibraryError("Quantidade total de arquivos expandidos excede o limite seguro de 1.000 entradas.")
    return expanded, pre_errors


def _run_batch_pipeline(
    path: Path,
    files: list[dict[str, Any]],
    *,
    commit: bool,
    progress_cb: Any = None,
    check_cancelled: Any = None,
) -> dict[str, Any]:
    expanded, issues_list = _expand_batch_inputs(files)
    existing_records, existing_ps_ids, known_tables = _load_existing_index(path)

    # Passo 1: separa arquivos .txt (PokerStars) de .phh/.json e pré-extrai evidências de torneio no lote
    txt_parsed_per_entry: list[tuple[dict[str, Any], list[dict[str, Any]]]] = []
    all_ps_parsed: list[dict[str, Any]] = []
    for entry in expanded:
        if entry["format"] == "txt":
            blocks, split_errs = pokerstars.split_pokerstars_file(entry["raw"], entry["displayName"])
            issues_list.extend(split_errs)
            entry_parsed: list[dict[str, Any]] = []
            for blk in blocks:
                p = pokerstars.parse_pokerstars_block(blk)
                if p.get("ok"):
                    entry_parsed.append(p)
                    all_ps_parsed.append(p)
                else:
                    issues_list.append(p)
            txt_parsed_per_entry.append((entry, entry_parsed))

    tid_evidence = pokerstars.collect_tournament_evidence(all_ps_parsed, known_tables)
    non_txt_entries = [e for e in expanded if e["format"] != "txt"]
    total_files = len(expanded)

    seen_ps_meta: dict[str, tuple[str, str]] = {}
    seen_record_ids: set[str] = set()
    stats_counts = {
        "filesFound": len(expanded),
        "zipEntries": sum(1 for e in expanded if " -> " in e["archivePath"]),
        "txtFiles": sum(1 for e in expanded if e["format"] == "txt"),
        "phhFiles": sum(1 for e in expanded if e["format"] == "phh"),
        "jsonFiles": sum(1 for e in expanded if e["format"] == "json"),
        "handsIdentified": len(all_ps_parsed) + sum(1 for i in issues_list if i.get("handId")) + len(non_txt_entries),
        "validHands": 0,
        "problemHands": len(issues_list),
        "duplicates": 0,
        "totalToImport": 0,
        "importedHands": 0,
        "cancelled": False,
    }
    formats_detected = {"MTT": 0, "SNG": 0, "CASH": 0, "UNKNOWN": 0}
    languages_detected = {"pt-BR": 0, "en": 0}
    tournaments_map: dict[str, dict[str, Any]] = {}
    issue_code_counts: dict[str, int] = {}
    for iss in issues_list:
        c = iss.get("code", "ERROR")
        issue_code_counts[c] = issue_code_counts.get(c, 0) + 1

    pending_to_write: list[dict[str, Any]] = []
    connection: sqlite3.Connection | None = None
    processed_files = 0

    def emit_progress(phase: str, current_file: str) -> None:
        if progress_cb:
            progress_cb({
                "phase": phase,
                "processedFiles": processed_files,
                "totalFiles": total_files,
                "currentFile": current_file,
                **stats_counts,
            })

    def flush_pending() -> None:
        nonlocal connection
        if not commit or not pending_to_write:
            return
        if connection is None:
            connection = connect(path)
        try:
            with connection:
                for rec in pending_to_write:
                    kind = rec["storeKind"]
                    if kind == "POKERSTARS_RECONSTRUCTED":
                        hand = rec["hand"]
                        rid = hand["recordId"]
                        if connection.execute("SELECT 1 FROM library_index WHERE record_id=?", (rid,)).fetchone():
                            continue
                        if connection.execute("SELECT 1 FROM library_pokerstars WHERE ps_hand_id=?", (rec["psHandId"],)).fetchone():
                            continue
                        index_hand(connection, hand, rid, kind, rec["fileName"], hand["source"]["importedAtUtc"])
                        connection.execute(
                            "INSERT INTO library_pokerstars VALUES (?,?,?,?,?,?,?,?,?)",
                            (
                                rid, rec["psHandId"], rec["tournamentId"], rec["tableName"], rec["gameFormat"],
                                _pack_blob(rec["rawText"]), hand["source"]["sha256"], _pack_blob(rec["phhToml"]), _pack_blob(dumps(hand)),
                            ),
                        )
                        stats_counts["importedHands"] += 1
                    elif kind == "PHH_RECONSTRUCTED":
                        hand = rec["hand"]
                        rid = hand["recordId"]
                        if connection.execute("SELECT 1 FROM library_index WHERE record_id=?", (rid,)).fetchone():
                            continue
                        if not connection.execute("SELECT 1 FROM hands WHERE record_id=?", (rid,)).fetchone():
                            connection.execute(
                                "INSERT INTO hands VALUES (?,?,?,?,?,?)",
                                (rid, hand["source"]["sha256"], hand["schemaVersion"], hand["source"]["importedAtUtc"], rec["raw"], dumps(hand)),
                            )
                        index_hand(connection, hand, rid, kind, rec["fileName"], hand["source"]["importedAtUtc"])
                        stats_counts["importedHands"] += 1
                    elif kind == "JSON_UNAUTHENTICATED":
                        hand = rec["hand"]
                        rid = rec["recordId"]
                        if connection.execute("SELECT 1 FROM library_index WHERE record_id=?", (rid,)).fetchone():
                            continue
                        index_hand(connection, hand, rid, kind, rec["fileName"], now())
                        connection.execute("INSERT INTO library_json VALUES (?,?,?,?)", (rid, rec["raw"], sha256(rec["raw"]).hexdigest(), dumps(hand)))
                        stats_counts["importedHands"] += 1
        finally:
            pending_to_write.clear()

    try:
        for entry, entry_parsed in txt_parsed_per_entry:
            if check_cancelled and check_cancelled():
                stats_counts["cancelled"] = True
                break
            for p in entry_parsed:
                if check_cancelled and check_cancelled():
                    stats_counts["cancelled"] = True
                    break
                ps_id = p.get("handId") or ""
                p_sha = p.get("sha256") or ""
                rid = f"ps-sha256:{p_sha}"
                fmt_field, fmt_reason = pokerstars.classify_hand_format(p, tid_evidence)
                classified_fmt = fmt_field.get("value") if fmt_field.get("status") != "MISSING" else None

                existing_match = existing_ps_ids.get(ps_id)
                same_batch_match = seen_ps_meta.get(ps_id)
                fast_dup_fmt: str | None = None
                if existing_match and existing_match[1] == p_sha and existing_match[0] in existing_records:
                    fast_dup_fmt = classified_fmt or existing_match[2] or "UNKNOWN"
                elif same_batch_match and same_batch_match[0] == p_sha:
                    fast_dup_fmt = classified_fmt or same_batch_match[1] or "UNKNOWN"

                if fast_dup_fmt is not None:
                    stats_counts["validHands"] += 1
                    formats_detected[fast_dup_fmt] = formats_detected.get(fast_dup_fmt, 0) + 1
                    languages_detected[p["language"]] = languages_detected.get(p["language"], 0) + 1
                    if p.get("tournamentId"):
                        tinfo = tournaments_map.setdefault(
                            p["tournamentId"],
                            {"tournamentId": p["tournamentId"], "buyIn": p.get("buyIn"), "gameFormat": fast_dup_fmt if fast_dup_fmt != "UNKNOWN" else None, "validCount": 0},
                        )
                        tinfo["validCount"] += 1
                        if fast_dup_fmt == "MTT":
                            tinfo["gameFormat"] = "MTT"
                    seen_ps_meta.setdefault(ps_id, (p_sha, fast_dup_fmt))
                    seen_record_ids.add(rid)
                    stats_counts["duplicates"] += 1
                    continue

                rebuilt = pokerstars.reconstruct_pokerstars_hand(p, fmt_field, fmt_reason)
                if not rebuilt["ok"]:
                    stats_counts["problemHands"] += 1
                    code = rebuilt["code"]
                    issue_code_counts[code] = issue_code_counts.get(code, 0) + 1
                    if len(issues_list) < 250:
                        issues_list.append({
                            "fileName": rebuilt["fileName"],
                            "handId": rebuilt["handId"],
                            "status": rebuilt["status"],
                            "code": code,
                            "message": rebuilt["message"],
                        })
                    continue

                hand = rebuilt["hand"]
                ps_id = rebuilt["psHandId"]
                rid = hand["recordId"]
                stats_counts["validHands"] += 1
                fmt_key = rebuilt["gameFormat"] or "UNKNOWN"
                formats_detected[fmt_key] = formats_detected.get(fmt_key, 0) + 1
                languages_detected[rebuilt["language"]] = languages_detected.get(rebuilt["language"], 0) + 1

                if rebuilt["tournamentId"]:
                    tinfo = tournaments_map.setdefault(
                        rebuilt["tournamentId"],
                        {"tournamentId": rebuilt["tournamentId"], "buyIn": p.get("buyIn"), "gameFormat": rebuilt["gameFormat"], "validCount": 0},
                    )
                    tinfo["validCount"] += 1
                    if rebuilt["gameFormat"] == "MTT":
                        tinfo["gameFormat"] = "MTT"

                is_dup = (ps_id in existing_ps_ids) or (rid in existing_records) or (ps_id in seen_ps_meta) or (rid in seen_record_ids)
                seen_ps_meta.setdefault(ps_id, (p_sha, fmt_key))
                seen_record_ids.add(rid)
                if is_dup:
                    stats_counts["duplicates"] += 1
                    continue

                stats_counts["totalToImport"] += 1
                if commit:
                    pending_to_write.append({
                        "storeKind": "POKERSTARS_RECONSTRUCTED",
                        "hand": hand,
                        "psHandId": ps_id,
                        "tournamentId": rebuilt["tournamentId"],
                        "tableName": p.get("tableName"),
                        "gameFormat": rebuilt["gameFormat"],
                        "rawText": rebuilt["rawText"],
                        "phhToml": rebuilt["phhToml"],
                        "fileName": entry["displayName"],
                    })
                    if len(pending_to_write) >= 100:
                        flush_pending()
            if stats_counts["cancelled"]:
                break
            processed_files += 1
            emit_progress("commit" if commit else "analyze", entry["displayName"])

        if not stats_counts["cancelled"]:
            for entry in non_txt_entries:
                if check_cancelled and check_cancelled():
                    stats_counts["cancelled"] = True
                    break
                fmt = entry["format"]
                raw = entry["raw"]
                name = entry["displayName"]
                if not raw or len(raw) > (1_048_576 if fmt == "phh" else MAX_JSON):
                    stats_counts["problemHands"] += 1
                    issue_code_counts["INPUT_SIZE"] = issue_code_counts.get("INPUT_SIZE", 0) + 1
                    if len(issues_list) < 250:
                        issues_list.append({"fileName": name, "handId": None, "status": "INVALID", "code": "INPUT_SIZE", "message": "Arquivo vazio ou acima do limite."})
                    processed_files += 1
                    emit_progress("commit" if commit else "analyze", name)
                    continue
                if fmt == "phh":
                    if raw.lstrip()[:200].decode("utf-8", errors="ignore").startswith(("PokerStars", "Mão PokerStars")):
                        stats_counts["problemHands"] += 1
                        issue_code_counts["FORMAT_MISMATCH"] = issue_code_counts.get("FORMAT_MISMATCH", 0) + 1
                        if len(issues_list) < 250:
                            issues_list.append({"fileName": name, "handId": None, "status": "UNSUPPORTED", "code": "FORMAT_MISMATCH", "message": "Histórico textual PokerStars com extensão .phh; use extensão .txt."})
                        processed_files += 1
                        emit_progress("commit" if commit else "analyze", name)
                        continue
                    res = import_phh(raw, name)
                    if not res["ok"]:
                        stats_counts["problemHands"] += 1
                        code = res["issues"][0]["code"]
                        issue_code_counts[code] = issue_code_counts.get(code, 0) + 1
                        if len(issues_list) < 250:
                            issues_list.append({"fileName": name, "handId": None, "status": res["status"], "code": code, "message": res["issues"][0]["message"]})
                    else:
                        hand = res["hand"]
                        assert hand is not None
                        rid = hand["recordId"]
                        stats_counts["validHands"] += 1
                        formats_detected["UNKNOWN"] += 1
                        is_dup = (rid in existing_records) or (rid in seen_record_ids)
                        seen_record_ids.add(rid)
                        if is_dup:
                            stats_counts["duplicates"] += 1
                        else:
                            stats_counts["totalToImport"] += 1
                            if commit:
                                pending_to_write.append({"storeKind": "PHH_RECONSTRUCTED", "hand": hand, "raw": raw, "fileName": name})
                else:
                    try:
                        hand = validate_json(raw)
                        rid = "json-sha256:" + sha256(raw).hexdigest()
                        stats_counts["validHands"] += 1
                        gf = reported(hand["gameFormat"]) or "UNKNOWN"
                        formats_detected[gf] = formats_detected.get(gf, 0) + 1
                        is_dup = (rid in existing_records) or (rid in seen_record_ids)
                        seen_record_ids.add(rid)
                        if is_dup:
                            stats_counts["duplicates"] += 1
                        else:
                            stats_counts["totalToImport"] += 1
                            if commit:
                                pending_to_write.append({"storeKind": "JSON_UNAUTHENTICATED", "hand": hand, "raw": raw, "recordId": rid, "fileName": name})
                    except LibraryError as exc:
                        stats_counts["problemHands"] += 1
                        issue_code_counts["INVALID_JSON"] = issue_code_counts.get("INVALID_JSON", 0) + 1
                        if len(issues_list) < 250:
                            issues_list.append({"fileName": name, "handId": None, "status": "INVALID", "code": "INVALID_JSON", "message": str(exc)})
                processed_files += 1
                emit_progress("commit" if commit else "analyze", name)

        if commit and not stats_counts["cancelled"]:
            flush_pending()
    finally:
        if connection is not None:
            connection.close()

    return {
        **stats_counts,
        "formatsDetected": formats_detected,
        "languagesDetected": languages_detected,
        "tournamentsDetected": sorted(tournaments_map.values(), key=lambda t: (-t["validCount"], t["tournamentId"]))[:100],
        "issueCodeCounts": issue_code_counts,
        "issues": issues_list[:250],
    }


def analyze_import_batch(path: Path, files: list[dict[str, Any]], progress_cb: Any = None, check_cancelled: Any = None) -> dict[str, Any]:
    return _run_batch_pipeline(path, files, commit=False, progress_cb=progress_cb, check_cancelled=check_cancelled)


def commit_import_batch(path: Path, files: list[dict[str, Any]], progress_cb: Any = None, check_cancelled: Any = None) -> dict[str, Any]:
    return _run_batch_pipeline(path, files, commit=True, progress_cb=progress_cb, check_cancelled=check_cancelled)
