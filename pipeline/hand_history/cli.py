"""Uso: python -m pipeline.hand_history.cli import arquivo.phh [--database arquivo.sqlite3]."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3
import sys

try:
    from .importer import import_phh
    from .store import StoreError, import_into_database, read_hand
except ModuleNotFoundError as exc:
    if exc.name != "pokerkit":
        raise
    print(json.dumps({"ok": False, "status": "UNSUPPORTED", "hand": None, "issues": [{
        "code": "DEPENDENCY_MISSING", "message": "Instale o requirements.txt de pipeline/hand_history no ambiente Python isolado.",
        "field": None, "actionIndex": None,
    }]}))
    raise SystemExit(2) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Importação PHH local para estudo pós-sessão.")
    commands = parser.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("import")
    ingest.add_argument("source", type=Path)
    ingest.add_argument("--database", type=Path)
    export = commands.add_parser("export")
    export.add_argument("database", type=Path)
    export.add_argument("record_id")
    args = parser.parse_args()
    try:
        if args.command == "export":
            output = {"ok": True, "hand": read_hand(args.database, args.record_id)}
            success = True
        else:
            # Mesmo limite antes de ler arquivo grande para memória.
            with args.source.open("rb") as file:
                raw = file.read(1_048_577)
            if args.database:
                output = import_into_database(args.database, raw, args.source.name)
                success = output["import"]["ok"]
            else:
                output = import_phh(raw, args.source.name)
                success = output["ok"]
    except (OSError, sqlite3.Error, StoreError) as exc:
        output = {"ok": False, "status": "INVALID", "hand": None, "issues": [{"code": "LOCAL_STORAGE", "message": str(exc), "field": None, "actionIndex": None}]}
        success = False
    # stdout pode ser redirecionado a um arquivo JSON, sem enviar dados a serviços.
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, allow_nan=False))
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
