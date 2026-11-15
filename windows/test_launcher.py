import hashlib
from contextlib import contextmanager
import json
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.request
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from launcher_core import LaunchError,Runtime,installation,select_port,verify_database,reopen_existing,authenticated_health,Job

ROOT=Path(__file__).resolve().parent.parent
@contextmanager
def connection(path):
    conn=sqlite3.connect(path)
    try:
        with conn:yield conn
    finally:conn.close()

class LauncherTests(unittest.TestCase):
    def test_missing_dependencies_and_build_without_touching_checkout(self):
        with tempfile.TemporaryDirectory(prefix="GTO caminho com espaço á ") as folder:
            root=Path(folder)
            with self.assertRaisesRegex(LaunchError,"Node.js ausente"):installation(root,node=str(root/"absent.exe"))
            with self.assertRaisesRegex(LaunchError,"Ambiente Python"):installation(root)
            python=root/"pipeline/hand_history/.venv/Scripts/python.exe";python.parent.mkdir(parents=True);python.touch()
            with self.assertRaisesRegex(LaunchError,"Next.js ausentes"):installation(root)
            next_cli=root/"app/node_modules/next/dist/bin/next";next_cli.parent.mkdir(parents=True);next_cli.touch()
            with self.assertRaisesRegex(LaunchError,"Build de produção ausente"):installation(root)
    def test_port_occupied_chooses_another_loopback(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",3000));sock.listen()
            self.assertNotEqual(select_port(),3000)
    def test_all_ports_occupied(self):
        with patch("launcher_core.socket.socket") as factory:
            factory.return_value.__enter__.return_value.bind.side_effect=OSError("occupied")
            with self.assertRaisesRegex(LaunchError,"ocupadas"):select_port()
    def test_corrupt_database_is_never_recreated(self):
        with tempfile.TemporaryDirectory() as folder:
            db=Path(folder)/"test.sqlite3";db.write_bytes(b"not a database")
            before=db.read_bytes()
            with self.assertRaises(LaunchError):verify_database(db)
            self.assertEqual(before,db.read_bytes())
    def test_foreign_sqlite_database_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"foreign.sqlite3"
            with connection(path) as conn:conn.execute("create table unrelated(value text)")
            before=path.read_bytes()
            with self.assertRaisesRegex(LaunchError,"incompatível"):verify_database(path)
            self.assertEqual(before,path.read_bytes())
    def test_job_closes_owned_process(self):
        job=Job();p=subprocess.Popen([shutil.which("node"),"-e","setInterval(()=>{},1000)"],creationflags=0x08000000)
        try:job.assign(p);job.close();p.wait(timeout=10);self.assertIsNotNone(p.returncode)
        finally:job.close();p.kill() if p.poll() is None else None

class ProductionTests(unittest.TestCase):
    def test_production_readiness_auth_origin_persistence_and_restart(self):
        with tempfile.TemporaryDirectory(prefix="GTO-3-integration-") as folder:
            home=Path(folder);db=home/"library.sqlite3"
            # Inicializa o contrato PHH1 real antes da sentinela. Um SQLite arbitrário
            # deve ser recusado pelo pipeline, não tratado como Biblioteca válida.
            from pipeline.hand_history.library import listing as library_listing
            library_listing(db,{})
            with connection(db) as conn:conn.execute("create table preserved_test(value text)");conn.execute("insert into preserved_test values ('preservar após reinício')")
            def request(url,body=None,origin=None,token=None):
                headers={"X-Poker-Library":"local-v1"}
                if body is not None:headers["Content-Type"]="application/json"
                if origin:headers["Origin"]=origin
                if token:headers["X-Poker-Launch"]=token
                req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers=headers)
                try:
                    with urllib.request.urlopen(req,timeout=15) as response:return response.status,json.loads(response.read())
                except urllib.error.HTTPError as exc:
                    try:return exc.code,json.loads(exc.read())
                    finally:exc.close()
            blocker=socket.socket();blocker.bind(("127.0.0.1",3000));blocker.listen()
            runtime=Runtime(ROOT,database=db,home=home)
            try:
                runtime.start();runtime.wait_ready();self.assertNotEqual(runtime.url,"http://127.0.0.1:3000")
                self.assertEqual(reopen_existing(ROOT,home),runtime.url)
                self.assertFalse(authenticated_health(runtime.url,"wrong",runtime.instance))
                self.assertEqual(request(runtime.url+"/api/local-session")[1],{"application":"gto-trainer-session-v1"})
                self.assertEqual(request(runtime.url+"/api/hand-library",body={"action":"list","filters":{}},origin="http://evil.test")[0],403)
                self.assertEqual(request(runtime.url+"/api/hand-library",origin=runtime.url)[0],200)
                # Importação real PHH no banco descartável, seguida de reinício.
                fixture=ROOT/"pipeline/hand_history/fixtures/hu_fold.phh"
                req=urllib.request.Request(runtime.url+"/api/hand-library?action=import",data=fixture.read_bytes(),headers={"X-Poker-Library":"local-v1","Origin":runtime.url,"X-File-Format":"phh","X-File-Name":"teste-fase3.phh"})
                with urllib.request.urlopen(req,timeout=30) as response:imported=json.loads(response.read())
                self.assertTrue(imported["ok"])
                listing=request(runtime.url+"/api/hand-library",origin=runtime.url)[1]
                self.assertTrue(listing["ok"])
                # A persistência é coberta pela mão importada e uma tabela independente do esquema.
                self.assertTrue(db.exists());process=runtime.process
                runtime.stop();self.assertIsNotNone(process.poll());self.assertIsNone(reopen_existing(ROOT,home))
                with connection(db) as conn:self.assertEqual(conn.execute("select value from preserved_test").fetchone()[0],"preservar após reinício")
                digest=hashlib.sha256(db.read_bytes()).hexdigest()
                second=Runtime(ROOT,database=db,home=home)
                try:
                    second.start();second.wait_ready()
                    self.assertEqual(request(second.url+"/api/hand-library",origin=second.url)[1],listing)
                    with connection(db) as conn:self.assertEqual(conn.execute("select count(*) from preserved_test").fetchone(),(1,))
                finally:second.stop()
                self.assertEqual(hashlib.sha256(db.read_bytes()).hexdigest(),digest)
            finally:runtime.stop();blocker.close()
    def test_unexpected_exit_is_detected_and_database_survives(self):
        with tempfile.TemporaryDirectory(prefix="GTO-3-exit-") as folder:
            runtime=Runtime(ROOT,home=Path(folder))
            try:
                runtime.start();runtime.wait_ready()
                before=runtime.database.read_bytes()
                runtime.process.kill();runtime.process.wait(timeout=10)
                with self.assertRaisesRegex(LaunchError,"terminou durante"):runtime.wait_ready(timeout=1)
                runtime.stop()
                self.assertEqual(before,runtime.database.read_bytes())
            finally:runtime.stop()

if __name__=="__main__":unittest.main(verbosity=2)
