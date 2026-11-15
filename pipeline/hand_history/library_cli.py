"""RPC por stdin/stdout, sem servidor, caminhos de arquivo ou comandos enviados pelo navegador."""
import base64
import json
from pathlib import Path
import sqlite3
import sys

from . import library
from .store import StoreError


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        if len(sys.argv) != 2: raise library.LibraryError("Configure o caminho local do banco no backend.")
        request = json.loads(sys.stdin.buffer.read(9*1024*1024+1))
        action = request.get("action")
        path = Path(sys.argv[1])
        if action == "list": result = library.listing(path,request.get("filters",{}))
        elif action == "read": result = library.read(path,request.get("recordId"))
        elif action == "import": result = library.import_file(path,base64.b64decode(request["base64"],validate=True),request["name"],request["format"])
        elif action == "study": result = library.update_study(path,request.get("recordId"),request.get("study"))
        elif action in ("delete","clearStudy"): result = library.remove(path,request.get("recordId"),request.get("confirm"),annotations_only=action=="clearStudy")
        elif action == "export": result = library.export_hand(path,request.get("recordId"),request.get("part"))
        elif action == "backup": result = library.backup(path)
        else: raise library.LibraryError("Operação não suportada.")
        print(library.dumps({"ok":True,"data":result}))
        return 0
    except (library.LibraryError, StoreError, ValueError, TypeError, KeyError) as exc:
        print(library.dumps({"ok":False,"error":str(exc)})); return 2
    except (OSError,sqlite3.Error):
        print(library.dumps({"ok":False,"error":"Falha de armazenamento local; verifique permissões, espaço e integridade do SQLite."})); return 2


if __name__ == "__main__":
    raise SystemExit(main())
