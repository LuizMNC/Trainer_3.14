"""Arquivo SQLite local. Sem migração automática nem comunicação de rede."""
from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from typing import Any

from .importer import import_phh

DB_VERSION = 1
APPLICATION_ID = 0x50484831  # PHH1


class StoreError(Exception):
    pass


def connect(path: Path, *, initialize: bool = True) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    try:
        current = connection.execute("PRAGMA user_version").fetchone()[0]
        app_id = connection.execute("PRAGMA application_id").fetchone()[0]
        tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        if current == 0 and app_id == 0 and not tables and initialize:
            with connection:
                connection.execute("""CREATE TABLE hands (
                    record_id TEXT PRIMARY KEY, source_sha256 TEXT UNIQUE NOT NULL,
                    schema_version TEXT NOT NULL, imported_at_utc TEXT NOT NULL,
                    raw_phh BLOB NOT NULL, canonical_json TEXT NOT NULL)""")
                connection.execute(f"PRAGMA user_version = {DB_VERSION}")
                connection.execute(f"PRAGMA application_id = {APPLICATION_ID}")
        elif current != DB_VERSION or app_id != APPLICATION_ID:
            raise StoreError("Banco incompatível; nenhuma migração ou substituição foi realizada.")
        return connection
    except Exception:
        connection.close()
        raise


def import_into_database(path: Path, raw: bytes, source_name: str | None = None) -> dict[str, Any]:
    result = import_phh(raw, source_name)
    if not result["ok"]:
        # Validação precede até a abertura do banco; não persiste entradas inválidas.
        return {"import": result, "stored": False, "duplicate": False}
    hand = result["hand"]
    assert hand is not None
    connection = connect(path)
    try:
        with connection:
            previous = connection.execute("SELECT raw_phh FROM hands WHERE record_id = ?", (hand["recordId"],)).fetchone()
            if previous:
                if bytes(previous[0]) != raw:
                    raise StoreError("Identificador existente com conteúdo divergente.")
                read_hand(path, hand["recordId"])
                return {"import": result, "stored": False, "duplicate": True}
            connection.execute("INSERT INTO hands VALUES (?, ?, ?, ?, ?, ?)", (
                hand["recordId"], hand["source"]["sha256"], hand["schemaVersion"], hand["source"]["importedAtUtc"],
                raw, json.dumps(hand, ensure_ascii=False, allow_nan=False, separators=(",", ":")),
            ))
        return {"import": result, "stored": True, "duplicate": False}
    finally:
        connection.close()


def read_hand(path: Path, record_id: str) -> dict[str, Any]:
    if not path.is_file():
        raise StoreError("Banco não encontrado.")
    connection = connect(path, initialize=False)
    try:
        row = connection.execute("SELECT raw_phh, canonical_json, source_sha256, schema_version, imported_at_utc FROM hands WHERE record_id = ?", (record_id,)).fetchone()
        if row is None:
            raise StoreError("Mão não encontrada.")
        raw, serialized, fingerprint, schema, imported_at = row
        if not isinstance(raw, bytes) or not isinstance(fingerprint, str) or sha256(raw).hexdigest() != fingerprint or record_id != "phh-sha256:" + fingerprint:
            raise StoreError("Proveniência corrompida no banco.")
        # Reconstrução evita confiar somente no JSON armazenado, inclusive se adulterado.
        rebuilt = import_phh(raw)
        if not rebuilt["ok"]:
            raise StoreError("Fonte armazenada não passa na validação atual.")
        try:
            saved = json.loads(serialized)
        except (ValueError, TypeError) as exc:
            raise StoreError("JSON canônico corrompido.") from exc
        expected = rebuilt["hand"]
        assert expected is not None
        if not isinstance(saved, dict) or not isinstance(saved.get("source"), dict):
            raise StoreError("Estrutura do JSON canônico corrompida.")
        name = saved["source"].get("fileName")
        if name != {"status": "MISSING"} and not (isinstance(name, dict) and set(name) == {"status", "value"} and name["status"] == "REPORTED" and isinstance(name["value"], str)):
            raise StoreError("Nome de origem inválido no JSON armazenado.")
        try:
            if not isinstance(imported_at, str) or datetime.fromisoformat(imported_at).utcoffset() != timedelta(0):
                raise ValueError("Timestamp inválido")
        except ValueError as exc:
            raise StoreError("Timestamp de ingestão inválido.") from exc
        expected["source"]["importedAtUtc"] = imported_at
        expected["source"]["fileName"] = name
        try:
            identical = json.dumps(saved, sort_keys=True, allow_nan=False) == json.dumps(expected, sort_keys=True, allow_nan=False)
        except ValueError as exc:
            raise StoreError("JSON canônico não finito.") from exc
        if not identical or schema != expected["schemaVersion"]:
            raise StoreError("JSON canônico divergente da fonte ou versão incompatível.")
        return saved
    finally:
        connection.close()
