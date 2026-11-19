"""Importador nativo e validador local para históricos textuais e ZIP do PokerStars (PT-BR e EN)."""
from __future__ import annotations

import collections
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import io
import os
import posixpath
import re
import stat
from typing import Any
import warnings
import zipfile

from pokerkit import Mode, NoLimitTexasHoldem, parse_action as pk_parse_action

from . import importer

MAX_ZIP_BYTES = 16 * 1024 * 1024
MAX_ZIP_ENTRIES = 500
MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024
MAX_ZIP_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_COMPRESSION_RATIO = 150
MAX_HAND_BYTES = 1_048_576

POSITIONS_ROTATED: dict[int, list[str]] = {
    2: ["BB", "BTN/SB"],
    3: ["SB", "BB", "BTN"],
    4: ["SB", "BB", "CO", "BTN"],
    5: ["SB", "BB", "HJ", "CO", "BTN"],
    6: ["SB", "BB", "LJ", "HJ", "CO", "BTN"],
    7: ["SB", "BB", "MP", "LJ", "HJ", "CO", "BTN"],
    8: ["SB", "BB", "UTG", "MP", "LJ", "HJ", "CO", "BTN"],
    9: ["SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN"],
}

RE_PS_SPLIT = re.compile(r"(?m)(?=^(?:PokerStars\s+(?:Hand|Game)|Mão PokerStars)\s+#\d+:)")
RE_HEADER_TOURN = re.compile(
    r"^(PokerStars\s+(?:Hand|Game)|Mão PokerStars)\s+#(\d+):\s+"
    r"(?:Tournament|Torneio)\s+#(\d+),\s+(.+?)\s+Hold'em No Limit\s+-\s+"
    r"(?:(?:Match Round|Ronda)\s+([IVXLCDM\d]+),\s*)?"
    r"(?:Level|Nível)\s+([IVXLCDM\d]+)\s+\(([^/]+)/([^)]+)\)\s+-\s+"
    r"(\d{4})/(\d{2})/(\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+(\S+)(?:\s+\[.*?\])?\s*$"
)
RE_HEADER_CASH = re.compile(
    r"^(PokerStars\s+(?:Hand|Game)|Mão PokerStars)\s+#(\d+):\s+"
    r"(?:Zoom\s+)?Hold'em No Limit\s+\(([^/]+)/([^)]+)\)\s+-\s+"
    r"(\d{4})/(\d{2})/(\d{2})\s+(\d{1,2}:\d{2}:\d{2})\s+(\S+)(?:\s+\[.*?\])?\s*$"
)
RE_TABLE = re.compile(
    r"^(?:Table|Mesa)\s+'([^']+)'\s+(\d+)-max(?:\s+\([^)]+\))?\s+(?:Seat|Lugar)\s+#(\d+)\s+(?:is the button|é o botão)\s*$"
)
RE_SEAT = re.compile(
    r"^(?:Seat|Lugar)\s+(\d+):\s+(.+?)\s+\(([^\d\s()]*)\s*(\d+(?:[.,]\d+)?)\s+(?:in chips|em fichas)"
    r"(?:,\s*(?:Bounty de\s+([^\d\s,)]*)\s*([\d.,]+)|([^\d\s,)]*)\s*([\d.,]+)\s+bounty))?\)(.*)$"
)
RE_DEALT_EN = re.compile(r"^Dealt to (.+?) \[([2-9TJQKA][cdhs] [2-9TJQKA][cdhs])\]$")
RE_DEALT_PT = re.compile(r"^(.+?) recebe \[([2-9TJQKA][cdhs] [2-9TJQKA][cdhs])\]$")
RE_UNCALLED = re.compile(
    r"^(?:Uncalled bet|Aposta não-igualada) \(([^\d\s()]*\s*[\d.,]+)\) (?:returned to|voltou para) (.+)$"
)
RE_TOTAL_POT = re.compile(
    r"^(?:Total pot|Total pote)\s+[^\d\s|]*([\d.,]+).*?\|\s*(?:Rake|comissão)\s+[^\d\s|]*([\d.,]+)\s*$"
)
RE_FINISH_PLACE = re.compile(
    r"^(.+?)\s+(?:finished the tournament in |terminou o torneio em |Acabou o torneio em )(\d+)"
)
RE_ELIM_BOUNTY_EN = re.compile(
    r"^(.+?) wins ([^\d\s]*\s*[\d.,]+) for eliminating (.+?) and their own bounty increases by ([^\d\s]*\s*[\d.,]+) to ([^\d\s]*\s*[\d.,]+)\s*$"
)
RE_ELIM_BOUNTY_PT = re.compile(
    r"^(.+?) ganha ([^\d\s]*\s*[\d.,]+) por eliminar (.+?) e seu próprio 'bounty' aumenta de [^\d\s]*\s*[\d.,]+ para ([^\d\s]*\s*[\d.,]+)\s*$"
)
RE_EXPLICIT_SPIN_RE = re.compile(r"\bspin\b|spin\s*&?\s*go|\bsit\s*&?\s*go\b|\bsng\b", re.IGNORECASE)
RE_EXPLICIT_MTT_RE = re.compile(r"\bmtt\b|multi[- ]?table", re.IGNORECASE)
RE_CARD_PAIR = re.compile(r"\[([2-9TJQKA][cdhs] [2-9TJQKA][cdhs])\]")
RE_CARD_ANY = re.compile(r"\[([^\]]+)\]")
RE_MONEY_TOKEN = re.compile(r"^[^\d\s]*\s*([\d.,]+)\s*$")


class PokerStarsZipError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def parse_money(raw: str) -> Decimal:
    cleaned = re.sub(r"[^\d.,]", "", raw.strip())
    if not cleaned:
        raise ValueError(f"Valor monetário inválido: {raw!r}")
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        # Vírgula decimal europeia/BR vs milhar
        after = cleaned.split(",")[-1]
        if len(after) in (1, 2):
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    value = Decimal(cleaned)
    if not value.is_finite() or value < 0 or value > importer.MAX_ATOMS:
        raise ValueError(f"Valor fora do intervalo seguro: {raw!r}")
    return value


def extract_currency_label(raw: str) -> str | None:
    s = raw.strip()
    for token, label in (("R$", "BRL"), ("US$", "USD"), ("$", "USD"), ("€", "EUR"), ("£", "GBP")):
        if token in s:
            return label
    return None


def strip_allin_suffix(rest: str) -> tuple[str, bool]:
    for suffix in (" e está all-in", " and is all-in"):
        if rest.endswith(suffix):
            return rest[: -len(suffix)].strip(), True
    return rest.strip(), False


def looks_like_phh(text: str) -> bool:
    head = text.lstrip()[:1200]
    return bool(re.search(r'(?m)^\s*variant\s*=\s*["\']', head) and re.search(r'(?m)^\s*actions\s*=\s*\[', head))


def looks_like_pokerstars(text: str) -> bool:
    return bool(RE_PS_SPLIT.search(text))


def safe_zip_entry_name(name: str) -> str:
    if not name or len(name) > 240 or any(ord(c) < 32 for c in name) or "\\" in name:
        raise PokerStarsZipError("ZIP_UNSAFE_PATH", f"Entrada ZIP com caminho inseguro: {name!r}")
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        raise PokerStarsZipError("ZIP_UNSAFE_PATH", f"Entrada ZIP com caminho absoluto proibida: {name!r}")
    normalized = posixpath.normpath(name)
    parts = normalized.split("/")
    if normalized in ("", ".") or ".." in parts or any(p == "" for p in parts):
        raise PokerStarsZipError("ZIP_UNSAFE_PATH", f"Tentativa de path traversal no ZIP: {name!r}")
    return normalized


def extract_zip_entries(raw_zip: bytes, archive_name: str = "arquivo.zip") -> dict[str, Any]:
    if not raw_zip or len(raw_zip) > MAX_ZIP_BYTES:
        raise PokerStarsZipError("ZIP_SIZE_LIMIT", f"ZIP '{archive_name}' vazio ou acima do limite de 16 MiB.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_zip))
    except zipfile.BadZipFile as exc:
        raise PokerStarsZipError("ZIP_CORRUPT", f"Arquivo ZIP inválido ou corrompido: {archive_name}.") from exc

    with zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise PokerStarsZipError("ZIP_TOO_MANY_ENTRIES", f"ZIP excede o limite de {MAX_ZIP_ENTRIES} entradas.")
        entries: list[dict[str, Any]] = []
        skipped: list[dict[str, str]] = []
        total_uncompressed = 0

        for info in infos:
            if info.is_dir():
                continue
            safe_name = safe_zip_entry_name(info.filename)
            if safe_name.startswith("__MACOSX/") or posixpath.basename(safe_name).startswith("._"):
                continue
            mode = (info.external_attr >> 16) & 0o170000
            if stat.S_ISLNK(mode):
                raise PokerStarsZipError("ZIP_SYMLINK", f"Link simbólico proibido no ZIP: {safe_name}.")
            if info.flag_bits & 0x1:
                raise PokerStarsZipError("ZIP_ENCRYPTED", f"ZIP criptografado não é suportado: {safe_name}.")
            if info.file_size > MAX_ZIP_ENTRY_BYTES:
                raise PokerStarsZipError("ZIP_ENTRY_TOO_LARGE", f"Entrada '{safe_name}' excede 10 MiB descompactados.")
            if info.file_size > 1_048_576 and info.compress_size > 0 and (info.file_size / info.compress_size) > MAX_COMPRESSION_RATIO:
                raise PokerStarsZipError("ZIP_BOMB_RATIO", f"Taxa de compressão suspeita em '{safe_name}'.")

            buf = bytearray()
            try:
                with zf.open(info, "r") as member:
                    while True:
                        chunk = member.read(65_536)
                        if not chunk:
                            break
                        if len(buf) + len(chunk) > MAX_ZIP_ENTRY_BYTES:
                            raise PokerStarsZipError("ZIP_BOMB_STREAM", f"Descompactação real de '{safe_name}' excedeu 10 MiB.")
                        if total_uncompressed + len(chunk) > MAX_ZIP_UNCOMPRESSED_BYTES:
                            raise PokerStarsZipError("ZIP_BOMB_TOTAL", "ZIP excedeu o teto de 64 MiB descompactados.")
                        buf.extend(chunk)
                        total_uncompressed += len(chunk)
            except (zipfile.BadZipFile, RuntimeError, EOFError, OSError) as exc:
                raise PokerStarsZipError("ZIP_CORRUPT_MEMBER", f"Falha ao ler '{safe_name}' no ZIP: {exc}") from exc

            ext = posixpath.splitext(safe_name)[1].lower().lstrip(".")
            if ext in ("txt", "phh", "json"):
                entries.append({"name": safe_name, "baseName": posixpath.basename(safe_name), "format": ext, "raw": bytes(buf)})
            else:
                skipped.append({"name": safe_name, "reason": f"Extensão não suportada dentro do ZIP (.{ext or 'sem_extensão'})."})
        return {"entries": entries, "skipped": skipped, "totalUncompressedBytes": total_uncompressed}


def split_pokerstars_file(raw: bytes, file_name: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Separa mãos PokerStars de um .txt sem descartar blocos não reconhecidos."""
    if not raw or not raw.strip():
        return [], [{"fileName": file_name, "handId": None, "status": "INVALID", "code": "EMPTY_FILE", "message": "Arquivo .txt vazio."}]
    try:
        text = raw.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        return [], [{"fileName": file_name, "handId": None, "status": "INVALID", "code": "ENCODING_INVALID", "message": "Arquivo .txt não está codificado em UTF-8 válido."}]

    if not text.strip():
        return [], [{"fileName": file_name, "handId": None, "status": "INVALID", "code": "EMPTY_FILE", "message": "Arquivo .txt sem conteúdo."}]

    if looks_like_phh(text) and not looks_like_pokerstars(text):
        return [], [{
            "fileName": file_name,
            "handId": None,
            "status": "UNSUPPORTED",
            "code": "FORMAT_MISMATCH",
            "message": "Conteúdo parece PHH (TOML). Use extensão .phh para importar históricos PHH; .txt é exclusivo para PokerStars.",
        }]

    matches = list(RE_PS_SPLIT.finditer(text))
    if not matches:
        return [], [{
            "fileName": file_name,
            "handId": None,
            "status": "INVALID",
            "code": "UNRECOGNIZED_POKERSTARS_TXT",
            "message": "Nenhuma mão PokerStars identificada neste arquivo .txt.",
        }]

    rejected: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    preamble = text[: matches[0].start()].strip()
    if preamble:
        rejected.append({
            "fileName": file_name,
            "handId": None,
            "status": "INVALID",
            "code": "CORRUPT_PREAMBLE",
            "message": "Trecho de texto antes do primeiro cabeçalho PokerStars reconhecido.",
        })

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        if not chunk:
            continue
        raw_chunk = chunk.encode("utf-8")
        if len(raw_chunk) > MAX_HAND_BYTES:
            hm = re.search(r"#(\d+):", chunk[:120])
            rejected.append({
                "fileName": file_name,
                "handId": hm.group(1) if hm else None,
                "status": "UNSUPPORTED",
                "code": "INPUT_TOO_LARGE",
                "message": "Bloco da mão excede 1 MiB.",
            })
            continue
        blocks.append({"fileName": file_name, "rawText": chunk, "rawBytes": raw_chunk, "sha256": sha256(raw_chunk).hexdigest()})
    return blocks, rejected


def parse_pokerstars_block(block: dict[str, Any]) -> dict[str, Any]:
    """Interpreta textualmente um bloco único de histórico PokerStars sem executar o motor."""
    raw_text: str = block["rawText"]
    file_name: str = block["fileName"]
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    if not lines:
        return {"ok": False, "status": "INVALID", "code": "EMPTY_HAND", "message": "Bloco de mão vazio.", "fileName": file_name, "handId": None}

    first = lines[0]
    m_tourn = RE_HEADER_TOURN.match(first)
    m_cash = None if m_tourn else RE_HEADER_CASH.match(first)
    if not m_tourn and not m_cash:
        hm = re.search(r"#(\d+):", first)
        return {
            "ok": False,
            "status": "INVALID",
            "code": "BAD_HEADER",
            "message": f"Cabeçalho PokerStars não suportado ou malformado: {first[:140]}",
            "fileName": file_name,
            "handId": hm.group(1) if hm else None,
        }

    if m_tourn:
        prefix, hand_id, tourn_id, buyin, round_label, level_label, sb_s, bb_s, yr, mo, dy, tm_s, tz = m_tourn.groups()
        language = "pt-BR" if prefix.startswith("Mão") else "en"
        is_cash = False
        currency = extract_currency_label(buyin)
    else:
        assert m_cash is not None
        prefix, hand_id, sb_s, bb_s, yr, mo, dy, tm_s, tz = m_cash.groups()
        language = "pt-BR" if prefix.startswith("Mão") else "en"
        tourn_id, buyin, round_label, level_label = None, None, None, None
        is_cash = True
        currency = extract_currency_label(first)

    try:
        sb_val = parse_money(sb_s)
        bb_val = parse_money(bb_s)
    except ValueError as exc:
        return {"ok": False, "status": "INVALID", "code": "BAD_BLINDS_HEADER", "message": str(exc), "fileName": file_name, "handId": hand_id}

    if len(lines) < 2:
        return {"ok": False, "status": "INVALID", "code": "TRUNCATED_HAND", "message": "Mão sem linha de mesa.", "fileName": file_name, "handId": hand_id}

    m_tbl = RE_TABLE.match(lines[1])
    if not m_tbl:
        return {"ok": False, "status": "INVALID", "code": "BAD_TABLE_LINE", "message": f"Linha de mesa inválida: {lines[1][:120]}", "fileName": file_name, "handId": hand_id}

    table_name, max_seats_s, btn_seat_s = m_tbl.groups()
    seat_count = int(max_seats_s)
    button_seat = int(btn_seat_s)
    if not (2 <= seat_count <= 9):
        return {"ok": False, "status": "UNSUPPORTED", "code": "SEAT_COUNT_UNSUPPORTED", "message": f"Mesa {seat_count}-max fora do perfil suportado (2 a 9 assentos).", "fileName": file_name, "handId": hand_id}

    table_number: int | None = None
    if " " in table_name:
        tail = table_name.rsplit(" ", 1)[1]
        if tail.isdigit():
            table_number = int(tail)

    idx = 2
    seat_infos: list[dict[str, Any]] = []
    moved_from_another_table = False
    while idx < len(lines) and not lines[idx].startswith("*** "):
        line = lines[idx]
        m_s = RE_SEAT.match(line)
        if not m_s:
            break
        snum, pname, chip_curr, chips_s, b_curr_pt, b_pt, b_curr_en, b_en, tail = m_s.groups()
        if not currency and chip_curr:
            currency = extract_currency_label(chip_curr)
        try:
            stack = parse_money(chips_s)
        except ValueError as exc:
            return {"ok": False, "status": "INVALID", "code": "BAD_STACK", "message": str(exc), "fileName": file_name, "handId": hand_id}
        tail_l = tail.lower()
        is_out = ("out of hand" in tail_l) or ("fora da mão" in tail_l)
        if "moved from another table" in tail_l or "chegando para o small blind" in tail_l:
            moved_from_another_table = True
        bounty_raw = b_pt or b_en
        seat_infos.append({
            "seat": int(snum),
            "name": pname,
            "stack": stack,
            "bounty": f"${bounty_raw}" if bounty_raw else None,
            "out": is_out,
            "sittingOut": ("sitting out" in tail_l) or ("está sit out" in tail_l),
        })
        idx += 1

    active_seats = [s for s in seat_infos if not s["out"]]
    if not (2 <= len(active_seats) <= 9):
        return {"ok": False, "status": "INVALID", "code": "PLAYER_COUNT", "message": f"Esperados 2 a 9 jogadores ativos; encontrados {len(active_seats)}.", "fileName": file_name, "handId": hand_id}

    if len({s["seat"] for s in seat_infos}) != len(seat_infos) or any(not (1 <= s["seat"] <= seat_count) for s in seat_infos):
        return {"ok": False, "status": "INVALID", "code": "SEATS_INVALID", "message": "Assentos inconsistentes com a lotação declarada.", "fileName": file_name, "handId": hand_id}

    name_to_seat = {s["name"]: s for s in active_seats}
    names_desc = sorted(name_to_seat, key=len, reverse=True)
    antes_posted: dict[str, Decimal] = {}
    sb_posts: list[tuple[str, Decimal]] = []
    bb_posts: list[tuple[str, Decimal]] = []
    sitout_allin_players: set[str] = set()

    while idx < len(lines) and not lines[idx].startswith("*** "):
        line = lines[idx]
        idx += 1
        matched_player = next((p for p in names_desc if line.startswith(p + ": ")), None)
        if matched_player is None:
            continue
        rest, is_allin = strip_allin_suffix(line[len(matched_player) + 2:])
        if rest.startswith(("posts the ante ", "coloca ante ")):
            amt = parse_money(rest.split()[-1])
            antes_posted[matched_player] = antes_posted.get(matched_player, Decimal(0)) + amt
            if is_allin and name_to_seat[matched_player]["sittingOut"]:
                sitout_allin_players.add(matched_player)
        elif rest.startswith(("posts small blind ", "paga o small blind ")):
            amt = parse_money(rest.split()[-1])
            sb_posts.append((matched_player, amt))
            if is_allin and name_to_seat[matched_player]["sittingOut"]:
                sitout_allin_players.add(matched_player)
        elif rest.startswith(("posts big blind ", "paga o big blind ")):
            amt = parse_money(rest.split()[-1])
            bb_posts.append((matched_player, amt))
            if is_allin and name_to_seat[matched_player]["sittingOut"]:
                sitout_allin_players.add(matched_player)
        elif "small & big" in rest or "dead" in rest or "straddle" in rest:
            return {"ok": False, "status": "UNSUPPORTED", "code": "DEAD_BLIND_UNSUPPORTED", "message": f"Blind morto ou straddle fora do perfil: {line}", "fileName": file_name, "handId": hand_id}
        else:
            return {"ok": False, "status": "UNSUPPORTED", "code": "PREFLOP_POST_UNSUPPORTED", "message": f"Postagem pré-flop não reconhecida: {line}", "fileName": file_name, "handId": hand_id}

    if len(sb_posts) != 1 or len(bb_posts) != 1 or sb_posts[0][0] == bb_posts[0][0]:
        return {"ok": False, "status": "UNSUPPORTED", "code": "BLIND_STRUCTURE_UNSUPPORTED", "message": "Perfil exige exatamente um Small Blind e um Big Blind distintos.", "fileName": file_name, "handId": hand_id}

    sb_name, bb_name = sb_posts[0][0], bb_posts[0][0]
    n = len(active_seats)
    by_seat = sorted(active_seats, key=lambda s: s["seat"])
    if n == 2:
        p_order = [name_to_seat[bb_name], name_to_seat[sb_name]]
    else:
        sb_idx = next(i for i, s in enumerate(by_seat) if s["name"] == sb_name)
        p_order = by_seat[sb_idx:] + by_seat[:sb_idx]
        if p_order[1]["name"] != bb_name:
            return {"ok": False, "status": "UNSUPPORTED", "code": "DEAD_BUTTON_UNSUPPORTED", "message": "Ordem entre Small Blind e Big Blind indica botão morto fora do perfil.", "fileName": file_name, "handId": hand_id}

    name_to_pidx = {p["name"]: i for i, p in enumerate(p_order)}
    max_ante = max(antes_posted.values(), default=Decimal(0))
    antes_arr: list[Decimal] = []
    for p in p_order:
        if p["name"] in antes_posted:
            if min(p["stack"], max_ante) != antes_posted[p["name"]]:
                return {"ok": False, "status": "INVALID", "code": "ANTE_MISMATCH", "message": f"Ante de {p['name']} ({antes_posted[p['name']]}) diverge do esperado.", "fileName": file_name, "handId": hand_id}
            antes_arr.append(max_ante)
        elif max_ante > 0:
            return {"ok": False, "status": "UNSUPPORTED", "code": "PARTIAL_ANTES_UNSUPPORTED", "message": f"Jogador {p['name']} não postou ante em mão com antes.", "fileName": file_name, "handId": hand_id}
        else:
            antes_arr.append(Decimal(0))

    has_hole_section = False
    has_summary = False
    sec = "PRE"
    hero_cards: dict[str, str] = {}
    showdown_cards: dict[int, str] = {}
    mucked_players: set[int] = set()
    flow: list[tuple[Any, ...]] = []
    collected: collections.Counter[str] = collections.Counter()
    returned_reported: collections.Counter[str] = collections.Counter()
    voluntary_reveals: list[dict[str, str]] = []
    eliminations: list[dict[str, Any]] = []
    max_finish_place = 0
    summary_pot: Decimal | None = None
    rake_reported: Decimal = Decimal(0)
    summary_board: list[str] | None = None

    while idx < len(lines):
        line = lines[idx]
        idx += 1
        if line.startswith("*** "):
            if "HOLE CARDS" in line or "CARTAS DA MÃO" in line:
                has_hole_section = True
                sec = "PREFLOP"
            elif "FLOP" in line:
                m = RE_CARD_PAIR.search(line) or re.search(r"\[([2-9TJQKA][cdhs](?: [2-9TJQKA][cdhs]){2})\]", line)
                if not m:
                    return {"ok": False, "status": "INVALID", "code": "BAD_FLOP", "message": f"Flop inválido: {line}", "fileName": file_name, "handId": hand_id}
                flow.append(("DB", m.group(1).replace(" ", "")))
                sec = "FLOP"
            elif "TURN" in line or "RIVER" in line:
                cards_found = RE_CARD_ANY.findall(line)
                if len(cards_found) < 2 or not re.fullmatch(r"[2-9TJQKA][cdhs]", cards_found[-1].strip()):
                    return {"ok": False, "status": "INVALID", "code": "BAD_TURN_RIVER", "message": f"Carta de street inválida: {line}", "fileName": file_name, "handId": hand_id}
                flow.append(("DB", cards_found[-1].strip()))
                sec = "TURN" if "TURN" in line else "RIVER"
            elif "SHOW DOWN" in line or "SHOWDOWN" in line:
                sec = "SHOWDOWN"
            elif "SUMMARY" in line or "SUMÁRIO" in line:
                has_summary = True
                sec = "SUMMARY"
            elif "FIRST" in line or "SECOND" in line:
                return {"ok": False, "status": "UNSUPPORTED", "code": "RUN_IT_TWICE_UNSUPPORTED", "message": "Múltiplas corridas de board (Run It Twice) fora do perfil.", "fileName": file_name, "handId": hand_id}
            else:
                return {"ok": False, "status": "UNSUPPORTED", "code": "UNKNOWN_SECTION", "message": f"Seção desconhecida: {line}", "fileName": file_name, "handId": hand_id}
            continue

        if sec == "SUMMARY":
            m_tot = RE_TOTAL_POT.match(line)
            if m_tot:
                summary_pot = parse_money(m_tot.group(1))
                rake_reported = parse_money(m_tot.group(2))
            elif line.startswith(("Board [", "Mesa [")):
                mb = RE_CARD_ANY.search(line)
                if mb:
                    summary_board = mb.group(1).split()
            continue

        m_d1 = RE_DEALT_EN.match(line)
        m_d2 = RE_DEALT_PT.match(line)
        if m_d1 or m_d2:
            m_d = m_d1 or m_d2
            assert m_d is not None
            pname = m_d.group(1)
            if pname in name_to_pidx:
                hero_cards[pname] = m_d.group(2).replace(" ", "")
            continue

        m_u = RE_UNCALLED.match(line)
        if m_u:
            returned_reported[m_u.group(2).strip()] += parse_money(m_u.group(1))
            continue

        m_fin = RE_FINISH_PLACE.match(line)
        if m_fin:
            place = int(m_fin.group(2))
            max_finish_place = max(max_finish_place, place)
            eliminations.append({"player": m_fin.group(1), "place": place})
            continue

        m_elim_en = RE_ELIM_BOUNTY_EN.match(line)
        m_elim_pt = None if m_elim_en else RE_ELIM_BOUNTY_PT.match(line)
        if m_elim_en or m_elim_pt:
            me = m_elim_en or m_elim_pt
            assert me is not None
            eliminations.append({"eliminator": me.group(1), "bountyWon": me.group(2).strip(), "eliminated": me.group(3).strip()})
            continue

        # Coleta de pote
        collected_match = None
        for pname in names_desc:
            if line.startswith(pname + " collected ") or line.startswith(pname + " recebeu "):
                mc = re.match(r"^" + re.escape(pname) + r"\s+(?:collected|recebeu)\s+[^\d\s]*\s*([\d.,]+)\s+(?:from|do)\s+.+$", line)
                if mc:
                    collected[pname] += parse_money(mc.group(1))
                    collected_match = pname
                    break
        if collected_match:
            continue

        matched_player = next((p for p in names_desc if line.startswith(p + ": ")), None)
        if matched_player is None:
            # Mensagens informativas conhecidas (desconectado/reconectado/timeout/torneio venceu/eliminado)
            lower = line.lower()
            if any(tok in lower for tok in ("is disconnected", "está sem ligação", "is connected", "está ligado", "has timed out", "gastou o tempo", "is sitting out", "está sit out", "has returned", "voltou", "will be allowed", "poderá jogar", "finished the tournament", "terminou o torneio", "wins the tournament", "ganhou o torneio", "vence o torneio", "ganha um bilhete", "vence a recompensa")):
                continue
            return {"ok": False, "status": "UNSUPPORTED", "code": "UNRECOGNIZED_LINE", "message": f"Linha não reconhecida na mão: {line[:120]}", "fileName": file_name, "handId": hand_id}

        rest_raw = line[len(matched_player) + 2:]
        if rest_raw.startswith(('said, "', 'disse, "')):
            continue
        rest, _ = strip_allin_suffix(rest_raw)
        pidx = name_to_pidx[matched_player]

        if sec in ("PREFLOP", "FLOP", "TURN", "RIVER"):
            if rest in ("folds", "desiste"):
                if matched_player in sitout_allin_players:
                    return {
                        "ok": False,
                        "status": "UNSUPPORTED",
                        "code": "SITOUT_ALLIN_FOLD",
                        "message": f"Jogador em sit out ({matched_player}) já estava all-in nos blinds/antes quando o PokerStars registrou fold.",
                        "fileName": file_name,
                        "handId": hand_id,
                    }
                flow.append(("FOLD", pidx))
            elif re.fullmatch(r"(?:folds|desiste)\s+\[([^\]]+)\]", rest):
                if matched_player in sitout_allin_players:
                    return {
                        "ok": False,
                        "status": "UNSUPPORTED",
                        "code": "SITOUT_ALLIN_FOLD",
                        "message": f"Jogador em sit out ({matched_player}) já estava all-in nos blinds/antes.",
                        "fileName": file_name,
                        "handId": hand_id,
                    }
                mc = re.search(r"\[([^\]]+)\]", rest)
                if mc:
                    voluntary_reveals.append({"player": matched_player, "cards": mc.group(1), "context": "fold"})
                flow.append(("FOLD", pidx))
            elif rest in ("checks", "passa") or rest.startswith(("calls ", "iguala ")):
                flow.append(("CC", pidx))
            elif rest.startswith(("bets ", "aposta ")):
                tok = rest.split()[-1]
                flow.append(("CBR", pidx, parse_money(tok), line))
            elif rest.startswith(("raises ", "aumenta ")):
                mr = re.match(r"^(?:raises|aumenta)\s+[^\d\s]*\s*[\d.,]+\s+(?:to|para)\s+[^\d\s]*\s*([\d.,]+)$", rest)
                if not mr:
                    return {"ok": False, "status": "INVALID", "code": "BAD_RAISE", "message": f"Aumento inválido: {line}", "fileName": file_name, "handId": hand_id}
                flow.append(("CBR", pidx, parse_money(mr.group(1)), line))
            elif rest in ("doesn't show hand", "não mostra a mão", "mucks hand", "esconde a mão"):
                mucked_players.add(pidx)
            elif rest.startswith(("shows [", "mostra [")):
                mc = RE_CARD_ANY.search(rest)
                if mc:
                    cards_text = mc.group(1).strip()
                    if re.fullmatch(r"[2-9TJQKA][cdhs] [2-9TJQKA][cdhs]", cards_text) and sec == "SHOWDOWN":
                        showdown_cards[pidx] = cards_text.replace(" ", "")
                    else:
                        voluntary_reveals.append({"player": matched_player, "cards": cards_text, "context": "post_hand_show"})
            else:
                return {"ok": False, "status": "UNSUPPORTED", "code": "UNSUPPORTED_ACTION", "message": f"Ação não suportada na mão: {line}", "fileName": file_name, "handId": hand_id}
        elif sec == "SHOWDOWN":
            if rest.startswith(("shows [", "mostra [")):
                ms = re.match(r"^(?:shows|mostra) \[([2-9TJQKA][cdhs] [2-9TJQKA][cdhs])\]", rest)
                if not ms:
                    return {"ok": False, "status": "INVALID", "code": "BAD_SHOWDOWN_CARDS", "message": f"Showdown malformado: {line}", "fileName": file_name, "handId": hand_id}
                showdown_cards[pidx] = ms.group(1).replace(" ", "")
            elif rest in ("mucks hand", "esconde a mão", "doesn't show hand", "não mostra a mão"):
                mucked_players.add(pidx)
            else:
                return {"ok": False, "status": "UNSUPPORTED", "code": "UNSUPPORTED_SHOWDOWN_LINE", "message": f"Evento de showdown não suportado: {line}", "fileName": file_name, "handId": hand_id}

    if not has_hole_section:
        return {"ok": False, "status": "INVALID", "code": "MISSING_HOLE_SECTION", "message": "Mão sem seção de cartas iniciais (*** HOLE CARDS ***).", "fileName": file_name, "handId": hand_id}

    if rake_reported > 0:
        return {"ok": False, "status": "UNSUPPORTED", "code": "RAKE_UNSUPPORTED", "message": f"Comissão/rake diferente de zero ({rake_reported}) não é suportada pelo perfil sem rake.", "fileName": file_name, "handId": hand_id}

    if not has_summary and (collected or returned_reported):
        return {"ok": False, "status": "INVALID", "code": "TRUNCATED_SUMMARY_MISSING", "message": "Histórico reivindica pote sem *** SUMMARY *** íntegro.", "fileName": file_name, "handId": hand_id}

    return {
        "ok": True,
        "handId": hand_id,
        "tournamentId": tourn_id,
        "buyIn": buyin,
        "round": round_label,
        "level": level_label,
        "isCash": is_cash,
        "language": language,
        "currency": currency,
        "year": int(yr),
        "month": int(mo),
        "day": int(dy),
        "time": tm_s if len(tm_s.split(":")[0]) == 2 else "0" + tm_s,
        "timeZone": tz,
        "sb": sb_val,
        "bb": bb_val,
        "tableName": table_name,
        "tableNumber": table_number,
        "seatCount": seat_count,
        "buttonSeat": button_seat,
        "movedFromAnotherTable": moved_from_another_table,
        "maxFinishPlace": max_finish_place,
        "headerLine": first,
        "fileName": file_name,
        "rawText": raw_text,
        "rawBytes": block["rawBytes"],
        "sha256": block["sha256"],
        "pOrder": p_order,
        "antesArr": antes_arr,
        "heroCards": hero_cards,
        "showdownCards": showdown_cards,
        "muckedPlayers": mucked_players,
        "flow": flow,
        "hasSummary": has_summary,
        "collected": dict(collected),
        "returnedReported": dict(returned_reported),
        "summaryPot": summary_pot,
        "summaryBoard": summary_board,
        "voluntaryReveals": voluntary_reveals,
        "eliminations": eliminations,
    }


def collect_tournament_evidence(parsed_list: list[dict[str, Any]], known_tables_by_tid: dict[str, set[str]] | None = None) -> dict[str, dict[str, Any]]:
    evidence: dict[str, dict[str, Any]] = {}
    if known_tables_by_tid:
        for tid, tbls in known_tables_by_tid.items():
            evidence[tid] = {"tables": set(tbls), "maxTableNumber": 0, "moved": False, "placeExceeded": False}
            for t in tbls:
                if " " in t and t.rsplit(" ", 1)[1].isdigit():
                    evidence[tid]["maxTableNumber"] = max(evidence[tid]["maxTableNumber"], int(t.rsplit(" ", 1)[1]))

    for item in parsed_list:
        if not item.get("ok") or not item.get("tournamentId"):
            continue
        tid = item["tournamentId"]
        ev = evidence.setdefault(tid, {"tables": set(), "maxTableNumber": 0, "moved": False, "placeExceeded": False})
        ev["tables"].add(item["tableName"])
        if item["tableNumber"] is not None:
            ev["maxTableNumber"] = max(ev["maxTableNumber"], item["tableNumber"])
        if item["movedFromAnotherTable"]:
            ev["moved"] = True
        if item["maxFinishPlace"] > item["seatCount"]:
            ev["placeExceeded"] = True
    return evidence


def classify_hand_format(parsed: dict[str, Any], tid_evidence: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], str]:
    """Classifica modalidade sem promover 3-max a Spin & Go nem 8-max de mesa única a MTT."""
    if parsed["isCash"]:
        return importer.field("CASH"), "Jogo Cash Game identificado pelas blinds diretas sem torneio."

    header_and_file = f"{parsed['headerLine']} {parsed['fileName']}"
    if RE_EXPLICIT_SPIN_RE.search(header_and_file):
        return importer.field("SNG"), "Rótulo explícito de Spin & Go / Sit & Go / SNG na fonte."
    if RE_EXPLICIT_MTT_RE.search(header_and_file):
        return importer.field("MTT"), "Rótulo explícito de torneio multi-mesa (MTT) na fonte."

    tid = parsed.get("tournamentId")
    ev = tid_evidence.get(tid or "", {})
    reasons: list[str] = []
    if ev.get("maxTableNumber", 0) >= 2:
        reasons.append(f"mesa #{ev['maxTableNumber']} indica múltiplas mesas")
    if len(ev.get("tables", set())) >= 2:
        reasons.append(f"{len(ev['tables'])} mesas distintas observadas no torneio #{tid}")
    if ev.get("placeExceeded"):
        reasons.append("colocação final acima da lotação máxima da mesa")
    if ev.get("moved"):
        reasons.append("registro de jogador movido de outra mesa")

    if reasons:
        return importer.field("MTT", inferred="; ".join(reasons) + "."), "; ".join(reasons) + "."
    return importer.field(present=False), f"Torneio #{tid or '?'} ({parsed['seatCount']}-max, mesa única observada) sem comprovação objetiva de MTT ou Spin & Go."


def _phh_num(d: Decimal) -> str:
    if d == d.to_integral_value():
        return str(int(d))
    return format(d.normalize(), "f")


def _toml_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def reconstruct_pokerstars_hand(parsed: dict[str, Any], game_format_field: dict[str, Any], format_reason: str) -> dict[str, Any]:
    """Executa a mão PokerStars em passo único via importer.Session e verifica conservação contra a fonte."""
    hand_id = parsed["handId"]
    file_name = parsed["fileName"]
    p_order = parsed["pOrder"]
    antes_arr = parsed["antesArr"]
    sb_val = parsed["sb"]
    bb_val = parsed["bb"]
    n = len(p_order)
    use_ante_trim = any(a > 0 for a in antes_arr)

    nums = [sb_val, bb_val, *antes_arr, *(p["stack"] for p in p_order)]
    for act in parsed["flow"]:
        if act[0] == "CBR":
            nums.append(act[2])
    scale = max(0, max(-Decimal(v).as_tuple().exponent for v in nums))

    if scale > 6:
        return {"ok": False, "status": "UNSUPPORTED", "code": "PRECISION_UNSUPPORTED", "message": "São suportadas até seis casas decimais.", "fileName": file_name, "handId": hand_id}
    if any(importer.integer_atoms(p["stack"], scale) <= 0 for p in p_order) or any(importer.integer_atoms(v, scale) > importer.MAX_ATOMS for v in nums):
        return {"ok": False, "status": "INVALID", "code": "AMOUNT_OVERFLOW", "message": "Stacks ou valores fora dos limites seguros.", "fileName": file_name, "handId": hand_id}
    if sum(importer.integer_atoms(p["stack"], scale) for p in p_order) > importer.MAX_ATOMS:
        return {"ok": False, "status": "INVALID", "code": "AMOUNT_OVERFLOW", "message": "Soma dos stacks excede limite seguro.", "fileName": file_name, "handId": hand_id}

    hh_parts = parsed["time"].split(":")
    try:
        from datetime import time as dt_time
        parsed_time = dt_time(int(hh_parts[0]), int(hh_parts[1]), int(hh_parts[2]))
    except ValueError:
        return {"ok": False, "status": "INVALID", "code": "BAD_TIME", "message": f"Horário inválido: {parsed['time']}", "fileName": file_name, "handId": hand_id}

    doc_stub: dict[str, Any] = {
        "variant": "NT",
        "antes": list(antes_arr),
        "blinds_or_straddles": [sb_val, bb_val] + [Decimal(0)] * (n - 2),
        "min_bet": bb_val,
        "starting_stacks": [p["stack"] for p in p_order],
        "ante_trimming_status": use_ante_trim,
        "players": [p["name"] for p in p_order],
        "seats": [p["seat"] for p in p_order],
        "seat_count": parsed["seatCount"],
        "hand": hand_id,
        "table": parsed["tableName"],
        "year": parsed["year"],
        "month": parsed["month"],
        "day": parsed["day"],
        "time": parsed_time,
        "time_zone_abbreviation": parsed["timeZone"],
        "actions": [],
    }
    if parsed["currency"]:
        doc_stub["currency"] = parsed["currency"]

    phh_actions: list[str] = []
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            session = importer.Session(doc_stub, scale)
            session.event_origin = "POKERSTARS"
            session.allow_fold_on_check = True
            session.drain(None)

            def push_act(act_str: str) -> None:
                idx = len(phh_actions)
                phh_actions.append(act_str)
                session.action(act_str.split(), idx)

            for i, p in enumerate(p_order):
                cards = parsed["heroCards"].get(p["name"], "????")
                push_act(f"d dh p{i + 1} {cards}")

            def flush_showdown() -> None:
                while session.state.status and session.state.showdown_index is not None:
                    sidx = session.state.showdown_index
                    cards = parsed["showdownCards"].get(sidx)
                    push_act(f"p{sidx + 1} sm {cards}" if cards else f"p{sidx + 1} sm")

            for item in parsed["flow"]:
                kind = item[0]
                if kind == "DB":
                    flush_showdown()
                    if not session.state.can_deal_board():
                        return {
                            "ok": False,
                            "status": "UNSUPPORTED",
                            "code": "IMPLICIT_BB_CHECK_MISSING",
                            "message": "Fonte omitiu decisão automática de Big Blind contra all-in curto antes do runout; nenhuma ação implícita é inserida.",
                            "fileName": file_name,
                            "handId": hand_id,
                        }
                    push_act(f"d db {item[1]}")
                elif kind == "FOLD":
                    _, pidx = item
                    if session.state.actor_index != pidx:
                        if session.state.stacks[pidx] == 0:
                            return {
                                "ok": False,
                                "status": "UNSUPPORTED",
                                "code": "SITOUT_ALLIN_FOLD",
                                "message": "Jogador já estava all-in nos blinds/antes quando a fonte registrou fold.",
                                "fileName": file_name,
                                "handId": hand_id,
                            }
                        return {"ok": False, "status": "INVALID", "code": "ACTOR_MISMATCH", "message": "Ordem de fold diverge do ator ativo.", "fileName": file_name, "handId": hand_id}
                    push_act(f"p{pidx + 1} f")
                elif kind == "CC":
                    _, pidx = item
                    if session.state.actor_index != pidx:
                        return {"ok": False, "status": "INVALID", "code": "ACTOR_MISMATCH", "message": "Ordem de check/call diverge do ator ativo.", "fileName": file_name, "handId": hand_id}
                    push_act(f"p{pidx + 1} cc")
                elif kind == "CBR":
                    _, pidx, target_dec, raw_line = item
                    if session.state.actor_index != pidx:
                        return {"ok": False, "status": "INVALID", "code": "ACTOR_MISMATCH", "message": "Ordem de aposta/raise diverge do ator ativo.", "fileName": file_name, "handId": hand_id}
                    push_act(f"p{pidx + 1} cbr {_phh_num(target_dec)}")
            flush_showdown()
    except importer.ImportFailure as exc:
        msg = exc.issue["message"]
        if exc.issue["code"] == "ILLEGAL_ACTION" and "no reason to complete, bet, or raise" in msg:
            return {
                "ok": False,
                "status": "UNSUPPORTED",
                "code": "RAISE_OVER_EFFECTIVE_ALLIN",
                "message": "Aumento registrado acima do máximo igualável pelos oponentes ativos; fora das regras estritas do motor.",
                "fileName": file_name,
                "handId": hand_id,
            }
        return {"ok": False, "status": "UNSUPPORTED" if exc.unsupported else "INVALID", "code": exc.issue["code"], "message": msg, "fileName": file_name, "handId": hand_id}
    except (ValueError, IndexError) as exc:
        return {"ok": False, "status": "INVALID", "code": "ENGINE_SEQUENCE_ERROR", "message": str(exc), "fileName": file_name, "handId": hand_id}

    if parsed["hasSummary"] and session.state.status:
        return {
            "ok": False,
            "status": "INVALID",
            "code": "INCOMPLETE_ACTION_WITH_SUMMARY",
            "message": "Mão possui sumário final, porém o estado do motor permaneceu inconclusivo após todas as ações.",
            "fileName": file_name,
            "handId": hand_id,
        }

    doc_stub["actions"] = phh_actions
    # Gera PHH TOML auditável de forma determinística
    toml_lines = [
        'variant = "NT"',
        f"antes = [{', '.join(_phh_num(a) for a in antes_arr)}]",
        f"blinds_or_straddles = [{_phh_num(sb_val)}, {_phh_num(bb_val)}" + (", 0" * (n - 2)) + "]",
        f"min_bet = {_phh_num(bb_val)}",
        f"starting_stacks = [{', '.join(_phh_num(p['stack']) for p in p_order)}]",
        f"ante_trimming_status = {'true' if use_ante_trim else 'false'}",
        f"players = [{', '.join(_toml_str(p['name']) for p in p_order)}]",
        f"seats = [{', '.join(str(p['seat']) for p in p_order)}]",
        f"seat_count = {parsed['seatCount']}",
        f"hand = {_toml_str(hand_id)}",
        f"table = {_toml_str(parsed['tableName'])}",
        f"year = {parsed['year']}",
        f"month = {parsed['month']}",
        f"day = {parsed['day']}",
        f"time = {parsed['time']}",
        f"time_zone_abbreviation = {_toml_str(parsed['timeZone'])}",
    ]
    if parsed["currency"]:
        toml_lines.append(f"currency = {_toml_str(parsed['currency'])}")
    toml_lines.append(f"actions = [{', '.join(_toml_str(a) for a in phh_actions)}]")
    phh_bytes = ("\n".join(toml_lines) + "\n").encode("utf-8")

    ps_sha256 = parsed["sha256"]
    record_id = "ps-sha256:" + ps_sha256
    source_override = {
        "format": "POKERSTARS",
        "targetStandardVersion": "PS_TEXT_1",
        "sha256": ps_sha256,
        "byteLength": len(parsed["rawBytes"]),
        "fileName": importer.field(file_name, present=bool(file_name)),
        "handId": importer.field(hand_id),
        "importedAtUtc": datetime.now(timezone.utc).isoformat(),
    }
    roles = list(POSITIONS_ROTATED.get(n, []))
    if n >= 3 and len(roles) == n and p_order[-1]["seat"] != parsed["buttonSeat"]:
        roles = ["SB", "BB"] + ["OTHER"] * (n - 2)
    bounties_map = {p["name"]: p["bounty"] for p in p_order if p.get("bounty")}
    ps_meta: dict[str, Any] = {
        "language": parsed["language"],
        "tableNumber": parsed["tableNumber"],
        "buttonSeat": parsed["buttonSeat"],
        "maxSeats": parsed["seatCount"],
        "gameFormatReason": format_reason,
    }
    if parsed["tournamentId"]:
        ps_meta["tournamentId"] = parsed["tournamentId"]
    if parsed["buyIn"]:
        ps_meta["buyIn"] = parsed["buyIn"]
    if parsed["level"]:
        ps_meta["level"] = parsed["level"]
    if parsed["round"]:
        ps_meta["round"] = parsed["round"]
    if bounties_map:
        ps_meta["bounties"] = bounties_map
    if parsed["eliminations"]:
        ps_meta["eliminations"] = parsed["eliminations"]
    if parsed["voluntaryReveals"]:
        ps_meta["voluntaryReveals"] = parsed["voluntaryReveals"]

    extra_meta = {"pokerstars": ps_meta, "tournamentId": parsed["tournamentId"]}
    extra_warnings: list[str] = []
    if game_format_field.get("value") != "MTT":
        if game_format_field.get("status") == "MISSING":
            extra_warnings.append("Modalidade não comprovada na fonte (formato desconhecido); não associado a referências estratégicas MTT.")
        elif game_format_field.get("value") in ("SNG", "CASH"):
            extra_warnings.append(f"Modalidade {game_format_field['value']} excluída das referências estratégicas MTT do TreinerLM.")

    try:
        result = importer.finalize_session_result(
            session, doc_stub, scale, len(parsed["rawBytes"]), ps_sha256, file_name,
            record_id_override=record_id, source_override=source_override,
            game_format_field=game_format_field, extra_metadata=extra_meta,
            extra_warnings=extra_warnings, roles_override=roles,
        )
    except importer.ImportFailure as exc:
        return {"ok": False, "status": "UNSUPPORTED" if exc.unsupported else "INVALID", "code": exc.issue["code"], "message": exc.issue["message"], "fileName": file_name, "handId": hand_id}

    hand = result["hand"]
    assert hand is not None

    def _atoms(val: Decimal) -> int:
        return importer.integer_atoms(val, scale)

    if hand["results"]["complete"]:
        for i, p in enumerate(p_order):
            expected_award = _atoms(parsed["collected"].get(p["name"], Decimal(0)))
            actual_award = int(hand["results"]["awardsAtoms"][i])
            if expected_award != actual_award:
                return {
                    "ok": False, "status": "UNSUPPORTED", "code": "AWARD_CONSERVATION_DIVERGENCE",
                    "message": f"Prêmio calculado ({actual_award}) diverge do reportado no PokerStars ({expected_award}) para {p['name']}.",
                    "fileName": file_name, "handId": hand_id,
                }
            expected_ret = _atoms(parsed["returnedReported"].get(p["name"], Decimal(0)))
            actual_ret = int(hand["results"]["returnedAtoms"][i])
            if expected_ret != actual_ret:
                return {
                    "ok": False, "status": "INVALID", "code": "RETURN_CONSERVATION_DIVERGENCE",
                    "message": f"Devolução calculada ({actual_ret}) diverge da reportada ({expected_ret}) para {p['name']}.",
                    "fileName": file_name, "handId": hand_id,
                }
        if parsed["summaryBoard"] is not None and parsed["summaryBoard"] != hand["ending"]["board"]:
            return {"ok": False, "status": "INVALID", "code": "SUMMARY_BOARD_MISMATCH", "message": "Board final no sumário diverge do reconstruído nas streets.", "fileName": file_name, "handId": hand_id}
        if parsed["summaryPot"] is not None:
            total_awards = sum(int(x) for x in hand["results"]["awardsAtoms"])
            if _atoms(parsed["summaryPot"]) != total_awards:
                return {"ok": False, "status": "INVALID", "code": "SUMMARY_POT_MISMATCH", "message": "Total do pote no sumário diverge da soma dos prêmios distribuídos.", "fileName": file_name, "handId": hand_id}

    return {
        "ok": True,
        "status": result["status"],
        "hand": hand,
        "phhToml": phh_bytes,
        "rawText": parsed["rawBytes"],
        "psHandId": hand_id,
        "tournamentId": parsed["tournamentId"],
        "gameFormat": game_format_field.get("value") if game_format_field.get("status") != "MISSING" else None,
        "fileName": file_name,
        "handId": hand_id,
        "language": parsed["language"],
    }
