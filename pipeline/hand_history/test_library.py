import base64
from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from . import library,store

ROOT=Path(__file__).resolve().parents[2]
FIX=Path(__file__).parent/'fixtures'


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory()
        self.path=Path(self.tmp.name)/'hands.sqlite3'

    def tearDown(self): self.tmp.cleanup()

    @contextmanager
    def database(self):
        connection=store.connect(self.path)
        try:
            with connection: yield connection
        finally: connection.close()

    def ingest(self,name='hu_fold'):
        return library.import_file(self.path,(FIX/(name+'.phh')).read_bytes(),name+'.phh','phh')

    def annotate(self,rid,**extra):
        return library.update_study(self.path,rid,{'note':'Revisar tamanho; não é conclusão GTO.','tags':['River','river','Estudo'],'favorite':True,'pending':True,'markReviewed':False,**extra})

    def test_mixed_batch_independent_and_duplicate(self):
        statuses=[self.ingest(n)['status'] for n in ('hu_fold','invalid_missing_call','partial_flop','hu_fold')]
        unsupported=library.import_file(self.path,b"variant='XX'",'other.phh','phh')
        self.assertEqual(statuses,['IMPORTED','INVALID','IMPORTED','DUPLICATE'])
        self.assertEqual(unsupported['status'],'UNSUPPORTED')
        self.assertEqual(library.listing(self.path,{})['total'],2)

    def test_preserves_originals_across_metadata_and_reopen(self):
        rid=self.ingest()['recordId']
        with self.database() as con: before=tuple(con.execute('SELECT * FROM hands').fetchone())
        study=self.annotate(rid)
        self.assertEqual(study['tags'],['Estudo','river'])
        self.assertTrue(library.listing(self.path,{})['items'][0]['study']['favorite'])
        self.assertEqual(library.read(self.path,rid)['hand'],store.read_hand(self.path,rid))
        with self.database() as con: self.assertEqual(tuple(con.execute('SELECT * FROM hands').fetchone()),before)
        self.assertEqual(self.ingest()['status'],'DUPLICATE')
        self.assertEqual(library.listing(self.path,{})['items'][0]['study']['note'],study['note'])

    def test_additive_migration_preserves_legacy_rows_and_versions(self):
        old=store.import_into_database(self.path,(FIX/'hu_fold.phh').read_bytes(),'old.phh')
        with self.database() as con: before=tuple(con.execute('SELECT * FROM hands').fetchone())
        self.assertEqual(library.listing(self.path,{})['total'],1)
        with self.database() as con:
            self.assertEqual(tuple(con.execute('SELECT * FROM hands').fetchone()),before)
            self.assertEqual(con.execute('PRAGMA user_version').fetchone()[0],1)
            self.assertEqual(con.execute('SELECT version FROM library_schema').fetchone()[0],1)
        self.assertTrue(old['stored'])

    def test_unknown_extension_version_is_not_overwritten(self):
        self.ingest()
        with self.database() as con: con.execute('UPDATE library_schema SET version=999')
        with self.assertRaises(library.LibraryError): library.listing(self.path,{})
        with self.database() as con: self.assertEqual(con.execute('SELECT count(*) FROM hands').fetchone()[0],1)

    def test_later_original_cli_import_is_indexed_without_rewriting(self):
        library.connect(self.path).close()
        old=store.import_into_database(self.path,(FIX/'partial_flop.phh').read_bytes(),'later.phh')
        self.assertTrue(old['stored'])
        page=library.listing(self.path,{})
        self.assertEqual(page['total'],1)
        self.assertEqual(page['items'][0]['fileName'],'later.phh')
        self.assertEqual(page['items'][0]['status'],'VALIDATED_PARTIAL')

    def test_legacy_backfill_with_small_cache_does_not_lock_itself(self):
        for i in range(8):
            store.import_into_database(self.path,(FIX/'hu_fold.phh').read_bytes()+f'\n# cache {i}'.encode(),f'{i}.phh')
        original=store.connect
        def small_cache(path,**kwargs):
            connection=original(path,**kwargs)
            connection.execute('PRAGMA cache_size=1')
            return connection
        with patch('pipeline.hand_history.store.connect',side_effect=small_cache):
            self.assertEqual(library.listing(self.path,{})['total'],8)
        self.assertEqual(library.listing(self.path,{})['total'],8)

    def test_transaction_rolls_back_source_when_indexing_fails(self):
        library.connect(self.path).close()
        with self.database() as con:
            con.execute("CREATE TRIGGER block_index BEFORE INSERT ON library_index BEGIN SELECT RAISE(ABORT,'test'); END")
        with self.assertRaises(sqlite3.Error): self.ingest()
        with self.database() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM hands').fetchone()[0],0)
            self.assertEqual(con.execute('SELECT count(*) FROM library_index').fetchone()[0],0)

    def test_json_is_separate_untrusted_identity_and_keeps_bytes(self):
        raw=(ROOT/'app/public/replays/hu_fold.json').read_bytes()
        result=library.import_file(self.path,raw,'copy.json','json')
        self.assertEqual(result['status'],'IMPORTED')
        loaded=library.read(self.path,result['recordId'])
        self.assertEqual(loaded['provenance'],'JSON_UNAUTHENTICATED')
        self.assertEqual(base64.b64decode(library.export_hand(self.path,result['recordId'],'source')['base64']),raw)
        self.assertEqual(library.import_file(self.path,raw,'renamed.json','json')['status'],'DUPLICATE')
        self.ingest()
        self.assertEqual(library.listing(self.path,{})['total'],2)
        self.assertNotEqual(result['recordId'],loaded['hand']['recordId'])

    def test_edited_coherent_json_is_not_promoted_to_phh(self):
        hand=json.loads((ROOT/'app/public/replays/hu_fold.json').read_bytes())
        hand['players'][0]['name']={'status':'REPORTED','value':'<script>alert(1)</script>'}
        result=library.import_file(self.path,json.dumps(hand).encode(),'edited.json','json')
        self.assertEqual(result['status'],'IMPORTED')
        self.assertEqual(library.read(self.path,result['recordId'])['provenance'],'JSON_UNAUTHENTICATED')

    def test_json_rejected_with_existing_runtime_validator(self):
        for raw in (b'{',b'[]',b'{"ok":false,"issues":[]}',b'{"name":"\xff"}'):
            self.assertEqual(library.import_file(self.path,raw,'bad.json','json')['status'],'INVALID')
        hand=json.loads((ROOT/'app/public/replays/hu_fold.json').read_bytes())
        hand['integrity']['evLoss']=99
        self.assertEqual(library.import_file(self.path,json.dumps(hand).encode(),'ev.json','json')['status'],'INVALID')
        hand['integrity']['evLoss']=None
        hand['schemaVersion']='2.0.0'
        self.assertEqual(library.import_file(self.path,json.dumps(hand).encode(),'future.json','json')['status'],'UNSUPPORTED')
        self.assertFalse(self.path.exists())

    def test_unicode_chunk_boundary_is_not_corrupted(self):
        hand=json.loads((ROOT/'app/public/replays/hu_fold.json').read_bytes())
        hand['metadata']['author']='João ♥'*12000
        raw=json.dumps(hand,ensure_ascii=False).encode()
        self.assertEqual(library.validate_json(raw)['metadata'],hand['metadata'])

    def test_tampered_json_and_phh_are_rejected_at_read(self):
        rid=self.ingest()['recordId']
        with self.database() as con: con.execute("UPDATE hands SET raw_phh=? WHERE record_id=?",(b'altered',rid))
        with self.assertRaises(store.StoreError): library.read(self.path,rid)
        result=library.import_file(self.path,(ROOT/'app/public/replays/partial_flop.json').read_bytes(),'p.json','json')
        with self.database() as con: con.execute("UPDATE library_json SET canonical_json='{}'")
        with self.assertRaises(library.LibraryError): library.read(self.path,result['recordId'])

    def test_filters_combine_and_are_parameterized(self):
        rid=self.ingest()['recordId'];self.ingest('partial_flop');self.ingest('three_way_allin');self.annotate(rid)
        filters={'q':'hu_fold','players':'2','position':'BB','blind':'2','status':'VALIDATED_COMPLETE','tag':'RIVER','favorite':'yes','notes':'yes','pending':'yes','player':'Alice'}
        # La fixture usa os nomes realmente presentes, sem inventar jogador.
        player=library.listing(self.path,{'q':'hu_fold'})['items'][0]['players'][0]
        filters['player']=player['name'] or player['label']
        self.assertEqual(library.listing(self.path,filters)['total'],1)
        self.assertEqual(library.listing(self.path,{'q':"' OR 1=1 --"})['total'],0)
        self.assertEqual(library.listing(self.path,{'favorite':'no'})['total'],2)
        self.assertEqual(library.listing(self.path,{'status':'VALIDATED_PARTIAL'})['total'],1)
        for invalid in ({'sort':'DROP TABLE hands'},{'page':'-1'},{'playedFrom':'2026-02-31'},{'players':'100'},{'arbitrary':'yes'}):
            with self.assertRaises(library.LibraryError): library.listing(self.path,invalid)

    def test_reported_dates_and_import_dates_are_distinct(self):
        raw=(FIX/'hu_fold.phh').read_bytes()+b'\nyear=2020\nmonth=2\nday=29\ntime=12:34:56\n'
        self.assertEqual(library.import_file(self.path,raw,'date.phh','phh')['status'],'IMPORTED')
        item=library.listing(self.path,{'playedFrom':'2020-02-29','playedTo':'2020-02-29'})['items'][0]
        self.assertEqual(item['playedDate'],'2020-02-29');self.assertEqual(item['playedTime'],'12:34:56')
        self.assertEqual(library.listing(self.path,{'importedTo':'2020-02-29'})['total'],0)
        self.ingest('partial_flop')
        missing=library.listing(self.path,{'q':'partial_flop'})['items'][0]
        self.assertIsNone(missing['playedDate'])

    def test_summary_pagination_does_not_return_events(self):
        for n in range(125):
            self.assertEqual(library.import_file(self.path,(FIX/'hu_fold.phh').read_bytes()+f'\n# unique {n}'.encode(),f'{n}.phh','phh')['status'],'IMPORTED')
        page=library.listing(self.path,{'page':'2','pageSize':'50','sort':'identifier'})
        self.assertEqual(page['total'],125);self.assertEqual(len(page['items']),50)
        self.assertTrue(all('events' not in item and 'sourceActions' not in item for item in page['items']))
        self.assertEqual(page['stats']['byPlayers'],[{'label':'2','count':125}])

    def test_review_and_clear_annotations_preserve_hand(self):
        rid=self.ingest()['recordId'];self.annotate(rid)
        reviewed=self.annotate(rid,markReviewed=True)
        self.assertFalse(reviewed['pending']);self.assertIsNotNone(reviewed['lastReviewedAtUtc'])
        with self.assertRaises(library.LibraryError): library.remove(self.path,rid,'no',annotations_only=True)
        library.remove(self.path,rid,rid,annotations_only=True)
        self.assertEqual(library.listing(self.path,{})['items'][0]['study'],library.DEFAULT_STUDY)
        self.assertTrue(library.read(self.path,rid)['hand']['results']['complete'])

    def test_validation_of_notes_tags_and_ids(self):
        rid=self.ingest()['recordId']
        for bad in ({'note':'x'*5001},{'tags':['x'*41]},{'favorite':1},{'tags':'text'}):
            with self.assertRaises(library.LibraryError): self.annotate(rid,**bad)
        with self.assertRaises(library.LibraryError): library.read(self.path,"../../secret")
        with self.assertRaises(library.LibraryError): library.import_file(self.path,b'a','../bad.phh','phh')

    def test_safe_delete_is_atomic_and_cascades(self):
        rid=self.ingest()['recordId'];self.annotate(rid);self.ingest('partial_flop')
        with self.assertRaises(library.LibraryError): library.remove(self.path,rid,'')
        self.assertEqual(library.listing(self.path,{})['total'],2)
        library.remove(self.path,rid,rid)
        self.assertEqual(library.listing(self.path,{})['total'],1)
        with self.database() as con:
            for table in ('hands','library_study','library_tags','library_players'):
                self.assertEqual(con.execute(f'SELECT count(*) FROM {table} WHERE record_id=?',(rid,)).fetchone()[0],0)

    def test_exports_and_backup_roundtrip_without_restore_endpoint(self):
        rid=self.ingest()['recordId'];self.annotate(rid)
        source=library.export_hand(self.path,rid,'source')
        self.assertEqual(base64.b64decode(source['base64']),(FIX/'hu_fold.phh').read_bytes())
        canonical=json.loads(library.export_hand(self.path,rid,'canonical')['content'])
        self.assertEqual(canonical,store.read_hand(self.path,rid))
        self.assertEqual(json.loads(library.export_hand(self.path,rid,'study')['content'])['study']['favorite'],True)
        result=library.backup(self.path);raw=base64.b64decode(result['base64'])
        self.assertEqual(sha256(raw).hexdigest(),result['sha256'])
        copy=Path(self.tmp.name)/'backup.sqlite3';copy.write_bytes(raw)
        self.assertEqual(library.read(copy,rid)['hand'],canonical)
        self.assertEqual(library.listing(copy,{})['items'][0]['study']['tags'],['Estudo','river'])

    def test_cli_limits_commands_and_persists_in_another_process(self):
        rid=self.ingest()['recordId']
        command=[sys.executable,'-m','pipeline.hand_history.library_cli',str(self.path)]
        process=subprocess.run(command,input=json.dumps({'action':'read','recordId':rid}).encode(),capture_output=True,cwd=ROOT,timeout=20)
        self.assertEqual(process.returncode,0);self.assertEqual(json.loads(process.stdout)['data']['recordId'],rid)
        process=subprocess.run(command,input=b'{"action":"restore","path":"../secret"}',capture_output=True,cwd=ROOT,timeout=20)
        self.assertEqual(process.returncode,2)


if __name__=='__main__': unittest.main()
