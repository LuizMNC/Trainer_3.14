"""RPC por stdin/stdout, sem servidor, caminhos de arquivo ou comandos enviados pelo navegador."""
import base64
import json
from pathlib import Path
import signal
import sqlite3
import sys

from . import library
from .store import StoreError

MAX_CLI_INPUT = 64 * 1024 * 1024 + 1


def _decode_batch_files(raw_files: list) -> list:
    if not isinstance(raw_files, list):
        raise library.LibraryError("Lista de arquivos inválida.")
    decoded = []
    for entry in raw_files:
        if not isinstance(entry, dict) or not isinstance(entry.get("name"), str) or not isinstance(entry.get("format"), str) or not isinstance(entry.get("base64"), str):
            raise library.LibraryError("Entrada de arquivo inválida no lote.")
        decoded.append({
            "name": entry["name"],
            "format": entry["format"].lower(),
            "raw": base64.b64decode(entry["base64"], validate=True),
        })
    return decoded


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    cancelled = False

    def _on_signal(_signum, _frame):
        nonlocal cancelled
        cancelled = True

    for sig_name in ("SIGTERM", "SIGINT"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, _on_signal)
            except (OSError, ValueError):
                pass

    try:
        if len(sys.argv) != 2: raise library.LibraryError("Configure o caminho local do banco no backend.")
        request = json.loads(sys.stdin.buffer.read(MAX_CLI_INPUT))
        action = request.get("action")
        stream = bool(request.get("stream"))
        path = Path(sys.argv[1])

        def emit_progress(info: dict) -> None:
            if stream:
                print(library.dumps({"event": "progress", "data": info}), flush=True)

        if action == "list": result = library.listing(path,request.get("filters",{}))
        elif action == "read": result = library.read(path,request.get("recordId"))
        elif action == "import": result = library.import_file(path,base64.b64decode(request["base64"],validate=True),request["name"],request["format"])
        elif action == "analyzeBatch":
            files = _decode_batch_files(request.get("files"))
            result = library.analyze_import_batch(path, files, progress_cb=emit_progress if stream else None, check_cancelled=lambda: cancelled)
        elif action == "commitBatch":
            files = _decode_batch_files(request.get("files"))
            result = library.commit_import_batch(path, files, progress_cb=emit_progress if stream else None, check_cancelled=lambda: cancelled)
        elif action == "study": result = library.update_study(path,request.get("recordId"),request.get("study"))
        elif action in ("delete","clearStudy"): result = library.remove(path,request.get("recordId"),request.get("confirm"),annotations_only=action=="clearStudy")
        elif action == "export": result = library.export_hand(path,request.get("recordId"),request.get("part"))
        elif action == "backup": result = library.backup(path)
        else: raise library.LibraryError("Operação não suportada.")

        if stream:
            print(library.dumps({"event": "done", "ok": True, "data": result}), flush=True)
        else:
            print(library.dumps({"ok":True,"data":result}))
        return 0
    except (library.LibraryError, StoreError, ValueError, TypeError, KeyError) as exc:
        print(library.dumps({"ok":False,"error":str(exc)}), flush=True); return 2
    except (OSError,sqlite3.Error):
        print(library.dumps({"ok":False,"error":"Falha de armazenamento local; verifique permissões, espaço e integridade do SQLite."}), flush=True); return 2


if __name__ == "__main__":
    raise SystemExit(main())
