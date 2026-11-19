"""Testes unitários e de integração do importador nativo PokerStars (ZIP/TXT PT-BR e EN)."""
from __future__ import annotations

import io
import json
import sqlite3
import stat
from tempfile import TemporaryDirectory
import unittest
from pathlib import Path
import zipfile
import zlib

from . import library, pokerstars


PT_MTT_HAND_1 = """Mão PokerStars #2626300001: Torneio #9001001, $2.20+$2.20+$0.50 USD Hold'em No Limit - Nível III (25/50) - 2026/11/10 19:30:00 BRT [2026/11/10 17:30:00 ET]
Mesa '9001001 1' 8-max Lugar #3 é o botão
Lugar 1: Alice (1500 em fichas, Bounty de $2.20)
Lugar 2: Bruno (1500 em fichas, Bounty de $2.20)
Lugar 3: Hero (1200 em fichas, Bounty de $2.20)
Alice: coloca ante 5
Bruno: coloca ante 5
Hero: coloca ante 5
Alice: paga o small blind 25
Bruno: paga o big blind 50
*** CARTAS DA MÃO ***
Hero recebe [As Kd]
Hero: aumenta 75 para 125
Alice: desiste
Bruno: iguala 75
*** FLOP *** [Ah 7c 2d]
Bruno: passa
Hero: aposta 150
Bruno: aumenta 300 para 450
Hero: iguala 300
*** TURN *** [Ah 7c 2d] [Ks]
Bruno: passa
Hero: aposta 620 e está all-in
Bruno: desiste
Aposta não-igualada (620) voltou para Hero
Hero recebeu 1190 do pote
Hero: não mostra a mão
*** SUMÁRIO ***
Total pote 1190 | comissão 0
Board [Ah 7c 2d Ks]
Lugar 1: Alice (small blind) desistiu antes do Flop (não apostou)
Lugar 2: Bruno (big blind) desistiu no Turn
Lugar 3: Hero (botão) arrecadou (1190)
"""


EN_MTT_SIDEPOT_HAND = """PokerStars Hand #2626300002: Tournament #9001001, $2.20+$2.20+$0.50 USD Hold'em No Limit - Level IV (50/100) - 2026/11/10 19:40:00 ET
Table '9001001 2' 8-max Seat #1 is the button
Seat 1: Hero (2000 in chips, $2.20 bounty)
Seat 2: Shorty (310 in chips, $2.20 bounty)
Seat 3: Mid (810 in chips, $2.20 bounty)
Shorty: posts the ante 10
Mid: posts the ante 10
Hero: posts the ante 10
Shorty: posts small blind 50
Mid: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Qs Qh]
Hero: raises 700 to 800
Shorty: calls 250 and is all-in
Mid: calls 700 and is all-in
Uncalled bet (0) returned to Hero
*** FLOP *** [Qc 5d 2s]
*** TURN *** [Qc 5d 2s] [9h]
*** RIVER *** [Qc 5d 2s 9h] [Jd]
*** SHOW DOWN ***
Mid: shows [Ad Kd] (a pair of Queens - missing straight)
Hero: shows [Qs Qh] (three of a kind, Queens)
Hero collected 1000 from side pot
Shorty: shows [Ac 8c] (high card Ace)
Hero collected 930 from main pot
Shorty finished the tournament in 18th place
Hero wins $1.10 for eliminating Shorty and their own bounty increases by $1.10 to $3.30
*** SUMMARY ***
Total pot 1930 Main pot 930. Side pot 1000. | Rake 0
Board [Qc 5d 2s 9h Jd]
Seat 1: Hero (button) showed [Qs Qh] and won (1930) with three of a kind, Queens
Seat 2: Shorty (small blind) showed [Ac 8c] and lost
Seat 3: Mid (big blind) showed [Ad Kd] and lost
"""


EN_HAND_2_ALT_TEXT_SAME_ID = """PokerStars Hand #2626300001: Tournament #9001001, $2.20+$2.20+$0.50 USD Hold'em No Limit - Level III (25/50) - 2026/11/10 17:30:00 ET
Table '9001001 1' 8-max Seat #3 is the button
Seat 1: Alice (1500 in chips, $2.20 bounty)
Seat 2: Bruno (1500 in chips, $2.20 bounty)
Seat 3: Hero (1200 in chips, $2.20 bounty)
Alice: posts the ante 5
Bruno: posts the ante 5
Hero: posts the ante 5
Alice: posts small blind 25
Bruno: posts big blind 50
*** HOLE CARDS ***
Dealt to Hero [As Kd]
Hero: raises 75 to 125
Alice: folds
Bruno: calls 75
*** FLOP *** [Ah 7c 2d]
Bruno: checks
Hero: bets 150
Bruno: raises 300 to 450
Hero: calls 300
*** TURN *** [Ah 7c 2d] [Ks]
Bruno: checks
Hero: bets 620 and is all-in
Bruno: folds
Uncalled bet (620) returned to Hero
Hero collected 1190 from pot
Hero: doesn't show hand
*** SUMMARY ***
Total pot 1190 | Rake 0
Board [Ah 7c 2d Ks]
Seat 1: Alice (small blind) folded before Flop (didn't bet)
Seat 2: Bruno (big blind) folded on the Turn
Seat 3: Hero (button) collected (1190)
"""


THREE_MAX_SINGLE_TABLE_AMBIGUOUS = """PokerStars Hand #2626300003: Tournament #9002002, $1.80+$0.20 USD Hold'em No Limit - Level I (10/20) - 2026/11/10 18:00:00 ET
Table '9002002 1' 3-max Seat #1 is the button
Seat 1: P1 (500 in chips)
Seat 2: P2 (500 in chips)
Seat 3: P3 (500 in chips)
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
Dealt to P1 [Jh Js]
P1: folds
P2: calls 10
P3: checks
*** FLOP *** [4d 5h 9c]
P2: checks
P3: checks
*** TURN *** [4d 5h 9c] [2s]
P2: checks
P3: checks
*** RIVER *** [4d 5h 9c 2s] [Kd]
P2: checks
P3: checks
*** SHOW DOWN ***
P2: shows [7c 8c] (high card King)
P3: shows [Ah 6d] (high card Ace)
P3 collected 40 from pot
*** SUMMARY ***
Total pot 40 | Rake 0
Board [4d 5h 9c 2s Kd]
Seat 1: P1 (button) folded before Flop (didn't bet)
Seat 2: P2 (small blind) showed [7c 8c] and lost
Seat 3: P3 (big blind) showed [Ah 6d] and won (40)
"""


EIGHT_MAX_SINGLE_TABLE_AMBIGUOUS = """PokerStars Hand #2626300004: Tournament #9003003, $4.40+$0.50 USD Hold'em No Limit - Level I (10/20) - 2026/11/10 18:10:00 ET
Table '9003003 1' 8-max Seat #1 is the button
Seat 1: P1 (1500 in chips)
Seat 2: P2 (1500 in chips)
Seat 3: P3 (1500 in chips)
P2: posts small blind 10
P3: posts big blind 20
*** HOLE CARDS ***
P1: folds
P2: folds
Uncalled bet (10) returned to P3
P3 collected 20 from pot
*** SUMMARY ***
Total pot 20 | Rake 0
"""


EIGHT_MAX_SECOND_TABLE = """PokerStars Hand #2626300005: Tournament #9003003, $4.40+$0.50 USD Hold'em No Limit - Level I (10/20) - 2026/11/10 18:12:00 ET
Table '9003003 2' 8-max Seat #1 is the button
Seat 1: P4 (1500 in chips)
Seat 2: P5 (1500 in chips)
P4: posts small blind 10
P5: posts big blind 20
*** HOLE CARDS ***
P4: folds
Uncalled bet (10) returned to P5
P5 collected 20 from pot
*** SUMMARY ***
Total pot 20 | Rake 0
"""


THREE_MAX_EXPLICIT_SPIN = THREE_MAX_SINGLE_TABLE_AMBIGUOUS.replace(
    "#2626300003: Tournament #9002002, $1.80+$0.20 USD",
    "#2626300006: Tournament #9004004, Spin & Go $5 USD",
).replace("9002002 1", "9004004 1")


SITOUT_ALLIN_FOLD_HAND = """Mão PokerStars #2626300007: Torneio #9005005, $2+$0.20 USD Hold'em No Limit - Nível V (50/100) - 2026/11/10 20:00:00 BRT [2026/11/10 18:00:00 ET]
Mesa '9005005 1' 8-max Lugar #1 é o botão
Lugar 1: P1 (1000 em fichas)
Lugar 2: OutGuy (5 em fichas) está sit out
Lugar 3: P3 (1000 em fichas)
OutGuy: coloca ante 5 e está all-in
P1: coloca ante 10
P3: coloca ante 10
OutGuy: paga o small blind 0
P3: paga o big blind 100
*** CARTAS DA MÃO ***
P1: desiste
OutGuy: desiste
Uncalled bet (100) returned to P3
*** SUMÁRIO ***
Total pote 25 | comissão 0
"""


SHORT_ALLIN_REOPEN_HAND = """PokerStars Hand #2626300008: Tournament #9005006, $5+$0.50 USD Hold'em No Limit - Level II (25/50) - 2026/11/10 20:05:00 ET
Table '9005006 1' 8-max Seat #1 is the button
Seat 1: P1 (2000 in chips)
Seat 2: P2 (2000 in chips)
Seat 3: Short (120 in chips)
P2: posts small blind 25
Short: posts big blind 50
*** HOLE CARDS ***
P1: raises 50 to 100
P2: calls 75
Short: raises 20 to 120 and is all-in
P1: raises 180 to 300
P2: folds
Uncalled bet (180) returned to P1
P1 collected 340 from pot
*** SUMMARY ***
Total pot 340 | Rake 0
"""


PHH_SAMPLE = b'''variant = "NT"
ante_trimming_status = false
antes = [0, 0]
blinds_or_straddles = [50, 100]
min_bet = 100
starting_stacks = [1000, 1000]
actions = ["d dh p1 ????", "d dh p2 ????", "p1 f"]
players = ["A", "B"]
'''


def _zip_bytes(entries: list[tuple[str, bytes, zipfile.ZipInfo | None]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data, custom_info in entries:
            if custom_info is not None:
                zf.writestr(custom_info, data)
            else:
                zf.writestr(name, data)
    return buf.getvalue()


class PokerStarsZipSecurityTests(unittest.TestCase):
    def test_rejects_traversal_backslash_absolute_symlink_and_encrypted(self) -> None:
        bad_zips = [
            _zip_bytes([("../evil.txt", b"ok", zipfile.ZipInfo("../evil.txt"))]),
            _zip_bytes([("dir/../../evil.txt", b"ok", zipfile.ZipInfo("dir/../../evil.txt"))]),
            _zip_bytes([("/abs.txt", b"ok", zipfile.ZipInfo("/abs.txt"))]),
            _zip_bytes([("C:drive.txt", b"ok", zipfile.ZipInfo("C:drive.txt"))]),
            _zip_bytes([("bad\x07name.txt", b"ok", zipfile.ZipInfo("bad\x07name.txt"))]),
        ]
        for raw in bad_zips:
            with self.assertRaises(pokerstars.PokerStarsZipError) as ctx:
                pokerstars.extract_zip_entries(raw, "bad.zip")
            self.assertEqual(ctx.exception.code, "ZIP_UNSAFE_PATH")

        with self.assertRaises(pokerstars.PokerStarsZipError) as ctx_bs:
            pokerstars.safe_zip_entry_name("sub\\evil.txt")
        self.assertEqual(ctx_bs.exception.code, "ZIP_UNSAFE_PATH")

        info = zipfile.ZipInfo("link.txt")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.assertRaises(pokerstars.PokerStarsZipError) as ctx:
            pokerstars.extract_zip_entries(_zip_bytes([("link.txt", b"target", info)]), "sym.zip")
        self.assertEqual(ctx.exception.code, "ZIP_SYMLINK")

        enc_bytes = bytearray(_zip_bytes([("enc.txt", b"secret", None)]))
        enc_bytes[6] |= 0x01
        cd_idx = enc_bytes.index(b"PK\x01\x02")
        enc_bytes[cd_idx + 8] |= 0x01
        with self.assertRaises(pokerstars.PokerStarsZipError) as ctx:
            pokerstars.extract_zip_entries(bytes(enc_bytes), "enc.zip")
        self.assertEqual(ctx.exception.code, "ZIP_ENCRYPTED")

    def test_rejects_zip_bomb_by_stream_limit_without_trusting_header(self) -> None:
        big_payload = b"0" * (pokerstars.MAX_ZIP_ENTRY_BYTES + 4096)
        raw = _zip_bytes([("bomb.txt", big_payload, None)])
        with self.assertRaises(pokerstars.PokerStarsZipError) as ctx:
            pokerstars.extract_zip_entries(raw, "bomb.zip")
        self.assertIn(ctx.exception.code, ("ZIP_ENTRY_TOO_LARGE", "ZIP_BOMB_RATIO", "ZIP_BOMB_STREAM"))

        # Falsifica file_size no cabeçalho local/central (zip bomb disfarçada)
        zbuf = bytearray(raw)
        comp = zlib.compressobj(level=9, wbits=-15)
        deflated = comp.compress(big_payload) + comp.flush()
        # Constrói manualmente um ZIP mínimo com file_size falsificado no central dir + local header
        forged_buf = io.BytesIO()
        with zipfile.ZipFile(forged_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("forged.txt", big_payload)
        forged = bytearray(forged_buf.getvalue())
        real_size_le = len(big_payload).to_bytes(4, "little")
        fake_size_le = (128).to_bytes(4, "little")
        assert forged.count(real_size_le) >= 2
        patched = bytes(forged).replace(real_size_le, fake_size_le)
        with self.assertRaises(pokerstars.PokerStarsZipError) as ctx2:
            pokerstars.extract_zip_entries(patched, "forged-bomb.zip")
        self.assertIn(ctx2.exception.code, ("ZIP_BOMB_STREAM", "ZIP_CORRUPT_MEMBER"))

    def test_skips_unsupported_entries_and_preserves_txt(self) -> None:
        raw = _zip_bytes([
            ("readme.csv", b"a,b\n1,2\n", None),
            ("__MACOSX/._ghost.txt", b"ignored", None),
            ("hands/pt.txt", PT_MTT_HAND_1.encode("utf-8"), None),
        ])
        res = pokerstars.extract_zip_entries(raw, "mixed.zip")
        self.assertEqual(len(res["entries"]), 1)
        self.assertEqual(res["entries"][0]["format"], "txt")
        self.assertEqual(len(res["skipped"]), 1)
        self.assertEqual(res["skipped"][0]["name"], "readme.csv")


class PokerStarsParsingAndLibraryTests(unittest.TestCase):
    def test_never_confuses_txt_and_phh_and_rejects_corrupt_blocks(self) -> None:
        with TemporaryDirectory() as tmp:
            db = Path(tmp) / "lib.sqlite3"
            preview = library.analyze_import_batch(db, [
                {"name": "phh_as_txt.txt", "format": "txt", "raw": PHH_SAMPLE},
                {"name": "ps_as_phh.phh", "format": "phh", "raw": PT_MTT_HAND_1.encode("utf-8")},
                {"name": "empty.txt", "format": "txt", "raw": b""},
                {"name": "binary.txt", "format": "txt", "raw": b"\xff\xfe\x00\x01"},
                {"name": "corrupt_pre.txt", "format": "txt", "raw": ("junk preamble\n" + PT_MTT_HAND_1).encode("utf-8")},
            ])
            self.assertFalse(db.exists())
            self.assertGreaterEqual(preview["problemHands"], 5)
            self.assertEqual(preview["issueCodeCounts"].get("FORMAT_MISMATCH"), 2)
            self.assertEqual(preview["issueCodeCounts"].get("EMPTY_FILE"), 1)
            self.assertEqual(preview["issueCodeCounts"].get("ENCODING_INVALID"), 1)
            self.assertEqual(preview["issueCodeCounts"].get("CORRUPT_PREAMBLE"), 1)
            self.assertEqual(preview["validHands"], 1)  # mão após preâmbulo continua sendo lida sem descartar o restante

    def test_imports_zip_pt_and_en_sidepots_returns_and_bounties_with_exact_conservation(self) -> None:
        zip_raw = _zip_bytes([
            ("sessao/pt.txt", PT_MTT_HAND_1.encode("utf-8"), None),
            ("sessao/en.txt", EN_MTT_SIDEPOT_HAND.encode("utf-8"), None),
        ])
        with TemporaryDirectory() as tmp:
            db = Path(tmp) / "ps.sqlite3"
            prev = library.analyze_import_batch(db, [{"name": "lote.zip", "format": "zip", "raw": zip_raw}])
            self.assertFalse(db.exists())
            self.assertEqual(prev["filesFound"], 2)
            self.assertEqual(prev["validHands"], 2)
            self.assertEqual(prev["problemHands"], 0)
            self.assertEqual(prev["formatsDetected"]["MTT"], 2)
            self.assertEqual(prev["languagesDetected"], {"pt-BR": 1, "en": 1})

            com = library.commit_import_batch(db, [{"name": "lote.zip", "format": "zip", "raw": zip_raw}])
            self.assertEqual(com["importedHands"], 2)

            listed = library.listing(db, {"tournament": "9001001", "format": "MTT", "sort": "identifier"})
            self.assertEqual(listed["total"], 2)
            rids = [it["recordId"] for it in listed["items"]]

            hand1 = library.read(db, rids[0])["hand"]
            self.assertEqual(hand1["source"]["format"], "POKERSTARS")
            self.assertEqual(hand1["source"]["targetStandardVersion"], "PS_TEXT_1")
            self.assertEqual(hand1["results"]["returnedAtoms"], ["0", "0", "620"])
            self.assertEqual(hand1["results"]["awardsAtoms"], ["0", "0", "1190"])
            self.assertEqual(hand1["metadata"]["pokerstars"]["bounties"]["Hero"], "$2.20")

            hand2 = library.read(db, rids[1])["hand"]
            self.assertEqual(len(hand2["pots"]), 2)
            self.assertEqual(hand2["pots"][0]["index"], 0)
            self.assertEqual(hand2["pots"][0]["amountAtoms"], "930")
            self.assertEqual(hand2["pots"][0]["awardsAtoms"], ["0", "0", "930"])
            self.assertEqual(hand2["pots"][1]["index"], 1)
            self.assertEqual(hand2["pots"][1]["amountAtoms"], "1000")
            self.assertEqual(hand2["pots"][1]["awardsAtoms"], ["0", "0", "1000"])
            self.assertEqual(hand2["metadata"]["pokerstars"]["eliminations"][0], {"player": "Shorty", "place": 18})
            self.assertEqual(hand2["metadata"]["pokerstars"]["eliminations"][1]["eliminator"], "Hero")
            self.assertEqual(hand2["metadata"]["pokerstars"]["eliminations"][1]["bountyWon"], "$1.10")

            exp = library.export_hand(db, rids[0], "source")
            self.assertEqual(exp["format"], "txt")
            bkp = library.backup(db)
            self.assertTrue(len(bkp["base64"]) > 0)

    def test_modality_never_assumes_3max_spin_or_8max_single_table_mtt(self) -> None:
        with TemporaryDirectory() as tmp:
            db = Path(tmp) / "mod.sqlite3"
            # 1) 3-max sem rótulo Spin fica UNKNOWN; com rótulo Spin & Go vira SNG; 8-max de 1 mesa fica UNKNOWN
            res1 = library.commit_import_batch(db, [
                {"name": "3max.txt", "format": "txt", "raw": THREE_MAX_SINGLE_TABLE_AMBIGUOUS.encode("utf-8")},
                {"name": "spin.txt", "format": "txt", "raw": THREE_MAX_EXPLICIT_SPIN.encode("utf-8")},
                {"name": "mtt_t1.txt", "format": "txt", "raw": EIGHT_MAX_SINGLE_TABLE_AMBIGUOUS.encode("utf-8")},
            ])
            self.assertEqual(res1["importedHands"], 3)
            self.assertEqual(res1["formatsDetected"]["UNKNOWN"], 2)
            self.assertEqual(res1["formatsDetected"]["SNG"], 1)
            self.assertEqual(res1["formatsDetected"]["MTT"], 0)

            unk_items = library.listing(db, {"format": "UNKNOWN"})["items"]
            self.assertEqual(len(unk_items), 2)
            for item in unk_items:
                full = library.read(db, item["recordId"])["hand"]
                self.assertEqual(full["gameFormat"]["status"], "MISSING")
                self.assertTrue(any("não associado" in w for w in full["integrity"]["warnings"]))

            # 2) Importa segunda mesa do mesmo torneio 9003003 -> prova MTT pela existência de 2 mesas!
            res2 = library.commit_import_batch(db, [
                {"name": "mtt_t2.txt", "format": "txt", "raw": EIGHT_MAX_SECOND_TABLE.encode("utf-8")},
            ])
            self.assertEqual(res2["importedHands"], 1)
            self.assertEqual(res2["formatsDetected"]["MTT"], 1)

    def test_dedup_by_hand_id_and_cross_language_preserves_study_and_rejects_short_allin(self) -> None:
        with TemporaryDirectory() as tmp:
            db = Path(tmp) / "dedup.sqlite3"
            c1 = library.commit_import_batch(db, [
                {"name": "pt.txt", "format": "txt", "raw": PT_MTT_HAND_1.encode("utf-8")},
                {"name": "sitout.txt", "format": "txt", "raw": SITOUT_ALLIN_FOLD_HAND.encode("utf-8")},
                {"name": "reopen.txt", "format": "txt", "raw": SHORT_ALLIN_REOPEN_HAND.encode("utf-8")},
            ])
            self.assertEqual(c1["importedHands"], 1)
            self.assertEqual(c1["issueCodeCounts"].get("SITOUT_ALLIN_FOLD"), 1)
            self.assertEqual(c1["issueCodeCounts"].get("SHORT_ALLIN_REOPEN_UNSUPPORTED"), 1)

            rid = library.listing(db, {})["items"][0]["recordId"]
            library.update_study(db, rid, {
                "note": "Nota importante da revisão",
                "favorite": True,
                "pending": True,
                "tags": ["3bet", "turn"],
                "markReviewed": False,
            })

            # Reimporta mesmos bytes E versão EN com MESMO Hand ID #2626300001
            c2 = library.commit_import_batch(db, [
                {"name": "pt.txt", "format": "txt", "raw": PT_MTT_HAND_1.encode("utf-8")},
                {"name": "en_same_id.txt", "format": "txt", "raw": EN_HAND_2_ALT_TEXT_SAME_ID.encode("utf-8")},
            ])
            self.assertEqual(c2["importedHands"], 0)
            self.assertEqual(c2["duplicates"], 2)
            listed = library.listing(db, {})
            self.assertEqual(listed["total"], 1)
            st = listed["items"][0]["study"]
            self.assertEqual(st["note"], "Nota importante da revisão")
            self.assertTrue(st["favorite"])
            self.assertTrue(st["pending"])
            self.assertEqual(st["tags"], ["3bet", "turn"])

            # Cancela no segundo arquivo com Segurança de SQLite
            calls = 0

            def stop_after_one() -> bool:
                nonlocal calls
                calls += 1
                return calls >= 2

            cancelled = library.commit_import_batch(
                db,
                [
                    {"name": "f1.txt", "format": "txt", "raw": EIGHT_MAX_SINGLE_TABLE_AMBIGUOUS.encode("utf-8")},
                    {"name": "f2.txt", "format": "txt", "raw": EIGHT_MAX_SECOND_TABLE.encode("utf-8")},
                ],
                check_cancelled=stop_after_one,
            )
            self.assertTrue(cancelled["cancelled"])
            self.assertGreaterEqual(library.listing(db, {})["total"], 1)

            # Adulteração do blob comprimido deve ser recusada na leitura
            conn = sqlite3.connect(db)
            with conn:
                conn.execute("UPDATE library_pokerstars SET canonical_json = X'789c0000' WHERE record_id = ?", (rid,))
            conn.close()
            with self.assertRaises(library.LibraryError):
                library.read(db, rid)


if __name__ == "__main__":
    unittest.main()
