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

from . import store
from .importer import import_phh

ROOT = Path(__file__).resolve().parents[2]
LIBRARY_VERSION = 1
MAX_JSON = 6 * 1024 * 1024
MAX_BACKUP = 32 * 1024 * 1024


class LibraryError(Exception):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


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
    return {"recordId": record_id, "canonicalRecordId": hand["recordId"], "handId": reported(hand["source"]["handId"]),
            "fileName": file_name, "provenance": kind, "playedDate": played, "playedTime": played_time,
            "timeZone": metadata.get("time_zone") if isinstance(metadata.get("time_zone"), str) else None,
            "importedAtUtc": imported, "playerCount": len(hand["players"]), "variant": hand["variant"],
            "gameFormat": reported(hand["gameFormat"]), "decimalPlaces": scale,
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
                    "CREATE TABLE library_study(record_id TEXT PRIMARY KEY REFERENCES library_index(record_id) ON DELETE CASCADE, note TEXT NOT NULL, favorite INTEGER NOT NULL, pending INTEGER NOT NULL, last_reviewed TEXT, updated_at TEXT NOT NULL)",
                    "CREATE TABLE library_tags(record_id TEXT NOT NULL REFERENCES library_index(record_id) ON DELETE CASCADE, tag TEXT NOT NULL COLLATE NOCASE, PRIMARY KEY(record_id,tag))",
                    "CREATE TABLE library_players(record_id TEXT NOT NULL REFERENCES library_index(record_id) ON DELETE CASCADE, player_index INTEGER NOT NULL, name TEXT NOT NULL, position TEXT, PRIMARY KEY(record_id,player_index))",
                    "CREATE INDEX library_imported ON library_index(imported_at,record_id)",
                    "CREATE INDEX library_played ON library_index(played_date,record_id)",
                    "CREATE INDEX library_status ON library_index(status,player_count,blind_key)",
                    "CREATE INDEX library_tag ON library_tags(tag,record_id)",
                    "CREATE INDEX library_position ON library_players(position,record_id)",
                ]
                connection.execute("BEGIN IMMEDIATE")
                for statement in statements:
                    connection.execute(statement)
                connection.execute("INSERT INTO library_schema VALUES (?)", (LIBRARY_VERSION,))
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
    if not isinstance(record_id, str) or not re.fullmatch(r"(?:phh|json)-sha256:[a-f0-9]{64}", record_id):
        raise LibraryError("Identificador inválido.")
    return record_id


def read(path: Path, record_id: str) -> dict:
    check_id(record_id)
    connection = connect(path)
    try:
        entry = connection.execute("SELECT * FROM library_index WHERE record_id=?", (record_id,)).fetchone()
        if entry is None:
            raise LibraryError("Mão não encontrada.")
        if entry["kind"] == "PHH_RECONSTRUCTED":
            hand = store.read_hand(path, record_id)
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
    allowed = {"q", "player", "players", "position", "playedFrom", "playedTo", "importedFrom", "importedTo", "blind", "status", "tag", "favorite", "notes", "pending", "sort", "page", "pageSize"}
    if not isinstance(filters, dict) or set(filters)-allowed:
        raise LibraryError("Filtro desconhecido.")
    clauses, values = [], []
    for key, value in filters.items():
        if not isinstance(value, str) or len(value)>160:
            raise LibraryError("Valor de filtro inválido.")
        if not value:
            continue
        if key == "q":
            clauses.append("(instr(lower(i.record_id || ' ' || i.hand_id || ' ' || i.file_name),?)>0)"); values.append(value.lower())
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
        stats = {"total": connection.execute("SELECT count(*) FROM library_index").fetchone()[0],
                 "complete": connection.execute("SELECT count(*) FROM library_index WHERE status='VALIDATED_COMPLETE'").fetchone()[0],
                 "partial": connection.execute("SELECT count(*) FROM library_index WHERE status='VALIDATED_PARTIAL'").fetchone()[0],
                 "favorites": connection.execute("SELECT count(*) FROM library_study WHERE favorite=1").fetchone()[0],
                 "pending": connection.execute("SELECT count(*) FROM library_study WHERE pending=1").fetchone()[0],
                 "byPlayers": [{"label":str(r[0]),"count":r[1]} for r in connection.execute("SELECT player_count,count(*) FROM library_index GROUP BY player_count ORDER BY player_count")],
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
        if path.stat().st_size > MAX_BACKUP: raise LibraryError("Backup pela interface limitado a 32 MiB; use sqlite3.Connection.backup localmente para acervos maiores.")
        with NamedTemporaryFile(dir=path.parent,suffix=".backup",delete=False) as file:
            temporary = Path(file.name)
        copy = sqlite3.connect(temporary)
        try: connection.backup(copy,pages=128)
        finally: copy.close()
        if temporary.stat().st_size > MAX_BACKUP: raise LibraryError("Backup acima de 32 MiB.")
        raw = temporary.read_bytes()
        return {"base64":base64.b64encode(raw).decode("ascii"),"sha256":sha256(raw).hexdigest(),"schemaVersion":LIBRARY_VERSION}
    finally:
        connection.close()
        if temporary is not None: temporary.unlink(missing_ok=True)
