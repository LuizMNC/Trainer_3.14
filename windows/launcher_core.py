"""Iniciador local: stdlib, produção Next.js e árvore de processos sob Windows Job."""
from __future__ import annotations
import ctypes
from contextlib import closing
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import sqlite3
import subprocess
import time
import threading
import urllib.error
import urllib.request

APP_ID = "gto-trainer-local-v1"
CREATE_NO_WINDOW = 0x08000000

class LaunchError(Exception):
    pass

def installation(root: Path, node: str | None = None) -> tuple[str, Path]:
    root = root.resolve()
    executable = node if node is not None else shutil.which("node")
    if not executable or not Path(executable).is_file():
        raise LaunchError("Node.js ausente. Instale Node.js 24.22 ou superior e prepare novamente o GTO Trainer.")
    python = root / "pipeline/hand_history/.venv/Scripts/python.exe"
    if not python.is_file():
        raise LaunchError("Ambiente Python do pipeline ausente. Abra Preparar GTO Trainer.vbs na pasta do projeto.")
    if not (root / "app/node_modules/next/dist/bin/next").is_file():
        raise LaunchError("Dependências Next.js ausentes. Execute a preparação inicial.")
    if not (root / "app/.next/BUILD_ID").is_file():
        raise LaunchError("Build de produção ausente. Abra Preparar GTO Trainer.vbs para compilar o aplicativo.")
    try:
        probe = subprocess.run([str(python), "-c", "import pokerkit,sqlite3,tkinter; from importlib.metadata import version; assert version('pokerkit')=='0.7.7'"], capture_output=True, timeout=15, creationflags=CREATE_NO_WINDOW)
        version = subprocess.run([executable, "-p", "process.versions.node"],capture_output=True,timeout=10,creationflags=CREATE_NO_WINDOW)
        if probe.returncode:
            raise LaunchError("Python, Tk ou PokerKit 0.7.7 indisponível. Execute a preparação inicial.")
        if version.returncode or tuple(map(int,version.stdout.decode().strip().split('.'))) < (24,22,0):
            raise LaunchError("Node.js 24.22 ou superior é necessário (decoder TypeScript da Biblioteca).")
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        raise LaunchError("Não foi possível executar Node/Python. Confira permissões e dependências.") from exc
    return executable, python

def data_directory() -> Path:
    path=Path(os.environ.get("LOCALAPPDATA",str(Path.home()/"AppData/Local")))/"Projeto-Poker"
    path.mkdir(parents=True,exist_ok=True)
    return path

def verify_database(path: Path) -> None:
    """Nunca recria nem remove um banco existente. Leitura de integridade antes do start."""
    try:
        path.parent.mkdir(parents=True,exist_ok=True)
        if path.exists():
            with closing(sqlite3.connect(path.as_uri()+"?mode=ro",uri=True,timeout=3)) as db:
                if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                    raise LaunchError("SQLite falhou na verificação de integridade. Restaure um backup; o banco foi preservado.")
                version=db.execute("PRAGMA user_version").fetchone()[0]
                application=db.execute("PRAGMA application_id").fetchone()[0]
                tables={row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                # Identificadores do contrato existente em pipeline/hand_history/store.py.
                if tables and (version!=1 or application!=0x50484831):
                    raise LaunchError("Banco incompatível com a Biblioteca PHH1. Nenhum arquivo foi substituído; confira o banco configurado.")
                if 'library_schema' in tables and db.execute("SELECT version FROM library_schema").fetchall()!=[(1,)]:
                    raise LaunchError("Versão da Biblioteca incompatível. Seus dados foram preservados; use uma versão compatível do aplicativo.")
        if not os.access(path.parent,os.W_OK) or (path.exists() and not os.access(path,os.W_OK)):
            raise LaunchError("Sem permissão de escrita na Biblioteca local.")
    except (OSError,sqlite3.Error) as exc:
        raise LaunchError("Não foi possível acessar o SQLite local. Confira permissões, espaço livre e integridade. O arquivo não foi apagado.") from exc

def select_port(preferred: int = 3000) -> int:
    # Não reutiliza o serviço encontrado. Uma corrida de bind posterior é tratada como erro.
    for port in [preferred, *range(preferred+1,preferred+21)]:
        with socket.socket() as sock:
            try:
                sock.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
                sock.bind(("127.0.0.1",port))
                return port
            except OSError:
                continue
    raise LaunchError("Portas locais 3000–3020 ocupadas. Feche outro aplicativo e tente novamente.")

def authenticated_health(url: str, token: str, instance: str, timeout: float = 3) -> bool:
    try:
        req=urllib.request.Request(url+"/api/local-health",headers={"X-Poker-Launch":token,"X-Poker-Library":"local-v1"})
        # Sem proxy de rede ou redirecionamento para serviço desconhecido.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs): return None
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        with opener.open(req,timeout=timeout) as response:
            data=json.loads(response.read(4096))
        return data.get("application")==APP_ID and data.get("instance")==instance and data.get("library")=="ready"
    except urllib.error.HTTPError as exc:
        exc.close();return False
    except (OSError,ValueError,urllib.error.URLError):
        return False

def browser_ready(url: str) -> bool:
    try:
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url,timeout=3) as response:
            return response.status==200 and b"<title>PDF de Poker</title>" in response.read(1_000_000)
    except (OSError,urllib.error.URLError): return False

def identity(root: Path) -> str:
    return hashlib.sha256((str(root.resolve()).casefold()+os.environ.get("USERNAME","")).encode()).hexdigest()[:20]

class Job:
    """JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: inclusive processos da Biblioteca."""
    def __init__(self):
        self.kernel=ctypes.WinDLL("kernel32",use_last_error=True)
        self.kernel.CreateJobObjectW.restype=wintypes.HANDLE
        self.kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,wintypes.LPCWSTR]
        self.kernel.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE]
        self.kernel.TerminateJobObject.argtypes=[wintypes.HANDLE,wintypes.UINT]
        self.kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        class Basic(ctypes.Structure):
            _fields_=[("PerProcessUserTimeLimit",ctypes.c_longlong),("PerJobUserTimeLimit",ctypes.c_longlong),("LimitFlags",wintypes.DWORD),("MinimumWorkingSetSize",ctypes.c_size_t),("MaximumWorkingSetSize",ctypes.c_size_t),("ActiveProcessLimit",wintypes.DWORD),("Affinity",ctypes.c_size_t),("PriorityClass",wintypes.DWORD),("SchedulingClass",wintypes.DWORD)]
        class Io(ctypes.Structure):
            _fields_=[(name,ctypes.c_ulonglong) for name in ("ReadOperationCount","WriteOperationCount","OtherOperationCount","ReadTransferCount","WriteTransferCount","OtherTransferCount")]
        class Extended(ctypes.Structure):
            _fields_=[("BasicLimitInformation",Basic),("IoInfo",Io),("ProcessMemoryLimit",ctypes.c_size_t),("JobMemoryLimit",ctypes.c_size_t),("PeakProcessMemoryUsed",ctypes.c_size_t),("PeakJobMemoryUsed",ctypes.c_size_t)]
        self.handle=self.kernel.CreateJobObjectW(None,None)
        info=Extended();info.BasicLimitInformation.LimitFlags=0x2000
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle,9,ctypes.byref(info),ctypes.sizeof(info)):
            self.close();raise LaunchError("Não foi possível proteger a árvore de processos do servidor.")
    def assign(self,process:subprocess.Popen):
        if not self.kernel.AssignProcessToJobObject(self.handle,int(process._handle)):
            process.kill();process.wait(timeout=10);raise LaunchError("Windows recusou o controle da árvore de processos. O servidor foi interrompido.")
    def close(self):
        if getattr(self,"handle",None):
            self.kernel.TerminateJobObject(self.handle,0)
            self.kernel.CloseHandle(self.handle);self.handle=None

class Runtime:
    def __init__(self,root:Path,database:Path|None=None,home:Path|None=None):
        self.root=root.resolve();self.home=home or data_directory();self.home.mkdir(parents=True,exist_ok=True)
        self.database=database or self.home/"hand-library.sqlite3"
        self.state_path=self.home/("launcher-"+identity(self.root)+".json")
        self.token=secrets.token_hex(32);self.instance=secrets.token_hex(16)
        self.process=None;self.job=None;self.log=None;self.url="";self.started=time.monotonic()
        self.cancelled=threading.Event()
    def start(self):
        node,python=installation(self.root);verify_database(self.database)
        if self.cancelled.is_set():raise LaunchError("Inicialização cancelada.")
        port=select_port();self.url=f"http://127.0.0.1:{port}"
        env={**os.environ,"NODE_ENV":"production","NEXT_TELEMETRY_DISABLED":"1","POKER_LIBRARY_ENABLED":"1","POKER_HH_PYTHON":str(python),"POKER_LIBRARY_DATABASE":str(self.database),"POKER_LAUNCH_TOKEN":self.token,"POKER_LAUNCH_INSTANCE":self.instance}
        log_path=self.home/"launcher.log"
        if log_path.exists() and log_path.stat().st_size>2*1024*1024:
            backup=self.home/"launcher.previous.log";os.replace(log_path,backup)
        self.log=log_path.open("ab",buffering=0)
        self.job=Job()
        try:
            self.process=subprocess.Popen([node,str(self.root/"app/node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",str(port)],cwd=self.root/"app",env=env,stdout=self.log,stderr=self.log,stdin=subprocess.DEVNULL,creationflags=CREATE_NO_WINDOW)
            self.job.assign(self.process)
            # Segredo local temporário; nunca entregue ao navegador nem gravado em log.
            self.state_path.write_text(json.dumps({"url":self.url,"token":self.token,"instance":self.instance}),encoding="utf-8")
        except BaseException:
            self.stop();raise
    def wait_ready(self,timeout=75):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            if self.cancelled.is_set():raise LaunchError("Inicialização cancelada.")
            if self.process.poll() is not None:raise LaunchError("O servidor terminou durante a inicialização. Veja launcher.log; confira build, porta e permissões.")
            if authenticated_health(self.url,self.token,self.instance) and browser_ready(self.url):return
            time.sleep(.3)
        raise LaunchError("A aplicação ou Biblioteca não ficou pronta em 75 s. Confira SQLite, Python e os logs locais.")
    def stop(self):
        self.cancelled.set()
        if self.job:self.job.close();self.job=None
        if self.process:
            try:self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:self.process.kill();self.process.wait(timeout=5)
            self.process=None
        if self.log:self.log.close();self.log=None
        # Não toca no SQLite, nos backups nem no armazenamento do navegador.
        try:
            if self.state_path.exists() and json.loads(self.state_path.read_text(encoding="utf-8")).get("instance")==self.instance:self.state_path.unlink()
        except (OSError,ValueError):pass

def reopen_existing(root:Path,home:Path|None=None)->str|None:
    path=(home or data_directory())/("launcher-"+identity(root)+".json")
    try:
        state=json.loads(path.read_text(encoding="utf-8"));url=state["url"]
        # Arquivo adulterado não pode dirigir o navegador a outra máquina.
        from urllib.parse import urlsplit
        parsed=urlsplit(url)
        if parsed.scheme!="http" or parsed.hostname!="127.0.0.1" or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:return None
        if authenticated_health(url,state["token"],state["instance"]):return url
    except (OSError,ValueError,KeyError):pass
    return None
