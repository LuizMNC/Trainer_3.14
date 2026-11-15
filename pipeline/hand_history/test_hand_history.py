"""Fixtures próprias, resultados analíticos e API real PokerKit; nenhuma rede."""
from __future__ import annotations

from contextlib import closing
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from .importer import MAX_BYTES, import_phh
from .store import StoreError, import_into_database, read_hand

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> bytes:
    return (FIXTURES / (name + ".phh")).read_bytes()


def hand(actions: list[str], *, stacks: str = "[100, 100]", antes: str = "[0, 0]", blinds: str = "[1, 2]") -> bytes:
    return (f'variant="NT"\nantes={antes}\nblinds_or_straddles={blinds}\nmin_bet=2\nstarting_stacks={stacks}\nactions=' + json.dumps(actions)).encode()


HU_DEAL = ["d dh p1 2c3d", "d dh p2 AsKd"]
THREE_DEAL = ["d dh p1 2c3d", "d dh p2 KsKd", "d dh p3 AsAd"]


class RulesTests(unittest.TestCase):
    def valid(self, raw: bytes, complete: bool = True):
        result = import_phh(raw)
        self.assertTrue(result["ok"], result["issues"])
        h = result["hand"]
        self.assertEqual(h["results"]["complete"], complete)
        initial = sum(int(p["initialStackAtoms"]) for p in h["players"])
        for event in h["events"]:
            for snapshot in (event["before"], event["after"]):
                self.assertEqual(sum(map(int, snapshot["stacksAtoms"])) + int(snapshot["potAtoms"]), initial)
            self.assertEqual(event["sequence"], h["events"].index(event))
        self.assertEqual(h["integrity"]["evLoss"], None)
        self.assertEqual(h["integrity"]["gtoAnalysis"], "NOT_EVALUATED")
        if complete:
            self.assertEqual(sum(map(int, h["results"]["computedFinalStacksAtoms"])), initial)
            self.assertEqual(sum(map(int, h["results"]["netContributionsAtoms"])), sum(map(int, h["results"]["awardsAtoms"])))
            for pot in h["pots"]:
                self.assertEqual(int(pot["amountAtoms"]), sum(map(int, pot["awardsAtoms"])))
        return h

    def rejected(self, raw: bytes, status: str = "INVALID", code: str | None = None):
        result = import_phh(raw)
        self.assertFalse(result["ok"], result)
        self.assertEqual(result["status"], status)
        self.assertIsNone(result["hand"])
        if code:
            self.assertEqual(result["issues"][0]["code"], code)
        return result

    def test_hu_blinds_order_and_fold_refund(self):
        h = self.valid(fixture("hu_fold"))
        self.assertEqual([p["position"]["value"] for p in h["players"]], ["BB", "BTN/SB"])
        self.assertEqual([p["seat"]["value"] for p in h["players"]], [4, 2])
        self.assertEqual(h["events"][0]["playerIndex"], 0)
        self.assertEqual(h["events"][0]["amountAtoms"], "2")
        self.assertEqual(h["results"]["returnedAtoms"], ["1", "0"])
        self.assertEqual(h["results"]["awardsAtoms"], ["2", "0"])
        self.assertEqual(h["players"][0]["holeCards"]["value"], [None, None])

    def test_decimal_exact_atoms(self):
        h = self.valid(fixture("decimal_fold"))
        self.assertEqual(h["amountPolicy"]["decimalPlaces"], 2)
        self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["101", "99"])
        self.assertEqual(h["amountPolicy"]["currency"], {"status": "MISSING"})
        self.assertEqual(h["gameFormat"], {"status": "MISSING"})

    def test_three_way_allin_sidepots(self):
        h = self.valid(fixture("three_way_allin"))
        self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["150", "100", "100"])
        self.assertEqual(h["results"]["returnedAtoms"], ["0", "0", "100"])
        self.assertEqual([p["amountAtoms"] for p in h["pots"]], ["150", "100"])
        self.assertEqual([p["eligiblePlayerIndices"] for p in h["pots"]], [[0, 1, 2], [1, 2]])
        self.assertTrue(any(any(e["after"]["allIn"]) for e in h["events"]))

    def test_folded_dead_money(self):
        h = self.valid(fixture("folded_sidepot"))
        self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["99", "100", "151", "100"])
        self.assertEqual([p["eligiblePlayerIndices"] for p in h["pots"]], [[1, 2, 3], [1, 3]])
        self.assertEqual(h["results"]["returnedAtoms"], ["0", "0", "0", "100"])

    def test_split_odd_ante_and_checkdown(self):
        h = self.valid(fixture("split_odd_ante"))
        self.assertEqual(h["results"]["awardsAtoms"], ["3", "2", "0"])
        self.assertEqual(h["ending"]["board"], ["As", "Ks", "Qs", "Js", "Ts"])
        self.assertEqual([e["paidAtoms"] for e in h["events"] if e["kind"] == "AntePosting"], [["0", "1", "0"]])

    def test_partial_no_invented_result(self):
        h = self.valid(fixture("partial_flop"), False)
        self.assertEqual(h["ending"]["actorIndex"], 1)
        self.assertEqual(h["ending"]["street"], "FLOP")
        self.assertIsNone(h["results"]["computedFinalStacksAtoms"])
        self.assertEqual(h["pots"], [])
        self.assertEqual(h["results"]["awardsAtoms"], ["0", "0"])

    def test_bet_raise_call_and_fold(self):
        h = self.valid(hand(HU_DEAL + ["p2 cbr 6", "p1 cbr 18", "p2 cc", "d db 4h5s7c", "p1 cc", "p2 cbr 10", "p1 f"]))
        self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["82", "118"])
        self.assertEqual(h["results"]["netContributionsAtoms"], ["18", "18"])
        self.assertEqual(h["results"]["returnedAtoms"], ["0", "10"])
        self.assertEqual(h["pots"][0]["amountAtoms"], "36")

    def test_short_call_and_short_blind(self):
        h = self.valid(hand(HU_DEAL + ["p2 cbr 100", "p1 cc", "p1 sm -", "p2 sm -", "d db 4h5s7c", "d db 8h", "d db 9h"], stacks="[3,100]"))
        self.assertEqual(h["results"]["returnedAtoms"], ["0", "97"])
        short = hand(HU_DEAL, stacks="[1,100]")
        h = self.valid(short, False)
        self.assertEqual(h["events"][0]["amountAtoms"], "1")

    def test_short_raise_calls_accepted_reopen_explicitly_excluded(self):
        base = THREE_DEAL + ["p3 cbr 3"]
        raw = hand(base + ["p1 cc", "p2 cc"], stacks="[100,100,3]", antes="[0,0,0]", blinds="[1,2,0]")
        self.valid(raw, False)
        self.rejected(hand(base + ["p1 cbr 5"], stacks="[100,100,3]", antes="[0,0,0]", blinds="[1,2,0]"), "UNSUPPORTED", "SHORT_ALLIN_REOPEN_UNSUPPORTED")

    def test_comments_and_unknown_card_reveal(self):
        actions = ["# anotação", "d dh p1 ????", "d dh p2 AsKd", "p2 cc # paga", "p1 cc", "d db 4h5s7c", "p1 cc", "p2 cc", "d db 8h", "p1 cc", "p2 cc", "d db 9h", "p1 cc", "p2 cc", "p1 sm 2c3d", "p2 sm -", "# fim"]
        h = self.valid(hand(actions))
        self.assertEqual(h["players"][0]["holeCards"]["value"], ["2c", "3d"])
        self.assertEqual(h["sourceActions"], actions)

    def test_wrong_actor(self):
        r = self.rejected(hand(HU_DEAL + ["p1 cc"]), code="ILLEGAL_ACTION")
        self.assertEqual(r["issues"][0]["actionIndex"], 2)

    def test_missing_actions_never_repaired(self):
        self.rejected(fixture("invalid_missing_call"), code="ILLEGAL_ACTION")

    def test_illegal_raises_and_player(self):
        for action in ("p2 cbr 3", "p2 cbr 101", "p9 cc"):
            with self.subTest(action=action):
                self.rejected(hand(HU_DEAL + [action]))

    def test_cards_unique_and_counts(self):
        for actions in (["d dh p1 AsAd", "d dh p2 AsKd"], ["d dh p1 AsAs", "d dh p2 2c3d"], ["d dh p1 As", "d dh p2 2c3d"], HU_DEAL + ["p2 cc", "p1 cc", "d db As4h5c"], HU_DEAL + ["p2 cc", "p1 cc", "d db 4h"]):
            with self.subTest(actions=actions):
                self.rejected(hand(actions))
        self.rejected(hand(HU_DEAL + ["p2 cc", "p1 cc", "d db ??????"]), "UNSUPPORTED", "UNKNOWN_BOARD")

    def test_unknown_hands_cannot_fabricate_showdown(self):
        actions = ["d dh p1 ????", "d dh p2 ????", "p2 cbr 100", "p1 cc", "p1 sm -", "p2 sm -", "d db 4h5s7c", "d db 8h", "d db 9h"]
        self.rejected(hand(actions))

    def test_show_cannot_replace_known_cards(self):
        actions = HU_DEAL + ["p2 cbr 100", "p1 cc", "p1 sm 2c4d"]
        self.rejected(hand(actions), code="SHOWDOWN_CARDS")

    def test_muck_is_not_fold_and_preserves_known_cards(self):
        h = self.valid(fixture("showdown_muck"))
        self.assertEqual(h["ending"]["folded"], [False, False])
        self.assertEqual(h["ending"]["mucked"], [True, False])
        self.assertEqual(h["players"][0]["holeCards"]["value"], ["2c", "3d"])
        self.assertEqual(h["pots"][0]["eligiblePlayerIndices"], [1])

    def test_action_after_end_and_reported_results(self):
        raw = fixture("hu_fold")
        self.rejected(raw.replace(b'"p2 f"]', b'"p2 f", "p1 cc"]'), code="ACTION_AFTER_END")
        self.rejected(raw.replace(b'[101, 99]', b'[100, 100]'), code="FINAL_STACKS_MISMATCH")

    def test_non_finite_negative_precision_overflow(self):
        base = hand(HU_DEAL)
        for value in (b"nan", b"inf", b"-1", b"true", b'"100"', b"9007199254740991", b"0"):
            with self.subTest(value=value):
                self.rejected(base.replace(b'[100, 100]', b'[' + value + b', 100]'))
        self.rejected(base.replace(b'[100, 100]', b'[1.0000001, 100]'), "UNSUPPORTED", "PRECISION_UNSUPPORTED")

    def test_unsupported_features_and_malformed_input(self):
        base = hand(HU_DEAL)
        self.rejected(base.replace(b'"NT"', b'"PO"'), "UNSUPPORTED")
        for extra in (b"\nrake=1", b"\nwinnings=[0,0]", b"\nstarting_board_count=2"):
            with self.subTest(extra=extra):
                self.rejected(base + extra, "UNSUPPORTED", "FIELD_UNSUPPORTED")
        self.rejected(b'variant="NT"\nx=[', code="PHH_SYNTAX")
        self.rejected(b'\xff', code="PHH_SYNTAX")
        self.rejected(b'variant="NT"', code="MISSING_FIELD")
        self.rejected(b" " * (MAX_BYTES + 1), "UNSUPPORTED", "INPUT_TOO_LARGE")
        self.rejected(hand(HU_DEAL + ["p2 xyz"]), "UNSUPPORTED")
        self.rejected(hand(HU_DEAL + ["p2 cbr 1e2"]), code="ACTION_AMOUNT")

    def test_blinds_antes_and_deal_order(self):
        self.rejected(hand(THREE_DEAL, stacks="[100,100,100]", antes="[0,0,0]", blinds="[1,2,4]"), "UNSUPPORTED", "BLINDS_UNSUPPORTED")
        self.rejected(hand(list(reversed(HU_DEAL))), code="DEAL_ORDER")
        self.rejected(hand(HU_DEAL, antes="[0]"), code="ARRAY_LENGTH")
        h = self.valid(hand(HU_DEAL, antes="[1,2]"), False)
        postings = [e for e in h["events"] if e["kind"] == "AntePosting"]
        self.assertEqual([(e["playerIndex"], e["amountAtoms"]) for e in postings], [(0, "2"), (1, "1")])
        for trim in (b"true", b"false"):
            short = hand(THREE_DEAL, stacks="[1,100,100]", antes="[2,2,2]", blinds="[1,2,0]") + b"\nante_trimming_status=" + trim
            limited = self.valid(short, False)
            self.assertEqual(limited["ending"]["stacksAtoms"], ["0", "96", "98"])
            self.assertEqual(limited["table"]["anteTrimming"]["status"], "REPORTED")

    def test_provenance_version_and_dependency(self):
        raw = fixture("hu_fold")
        h = self.valid(raw)
        self.assertEqual(h["source"]["sha256"], sha256(raw).hexdigest())
        self.assertEqual(h["schemaVersion"], "1.0.0")
        self.assertEqual(h["profile"], "PHH_NT_SUBSET_1")
        with patch("pipeline.hand_history.importer.version", return_value="0.7.8"):
            self.rejected(raw, "UNSUPPORTED", "DEPENDENCY_VERSION")

    def test_fold_refund_matrix_with_antes(self):
        for ante in (0, 1, 3):
            for target in (4, 10, 50, 100):
                with self.subTest(ante=ante, target=target):
                    h = self.valid(hand(THREE_DEAL + [f"p3 cbr {target}", "p1 f", "p2 f"], stacks="[200,200,200]", antes=str([ante]*3), blinds="[1,2,0]"))
                    self.assertEqual(h["results"]["returnedAtoms"], ["0", "0", str(target-2)])
                    self.assertEqual(h["results"]["computedFinalStacksAtoms"], [str(199-ante), str(198-ante), str(203+2*ante)])
                    self.assertEqual(h["pots"][0]["amountAtoms"], str(5+3*ante))

    def test_metadata_invalid_seats_dates_and_resource_limits(self):
        raw = hand(HU_DEAL)
        for extra in (b"\nseats=[1,1]", b"\nseats=[1,10]", b"\nplayers=[1,2]", b"\nseat_count=1", b"\nante_trimming_status=1", b"\ntime=1", b"\nhand=[]", b"\nmonth=13", b"\nday=30\nmonth=2\nyear=2026"):
            with self.subTest(extra=extra):
                self.rejected(raw + extra)
        self.rejected(hand(HU_DEAL + ["# comment"] * 500), code="ACTIONS_TYPE")
        self.rejected(raw + b"\nhand=9007199254740992", "UNSUPPORTED", "IDENTIFIER_RANGE")
        h = self.valid(raw + b'\ntime=12:34:56\ncurrency="USD"\n', False)
        self.assertEqual(h["metadata"]["time"], {"tomlType": "time", "value": "12:34:56"})
        self.assertEqual(h["amountPolicy"]["currency"], {"status": "REPORTED", "value": "USD"})

    def test_import_does_not_require_network(self):
        with patch("socket.socket.connect", side_effect=AssertionError("rede proibida")), patch("socket.create_connection", side_effect=AssertionError("rede proibida")):
            self.valid(fixture("three_way_allin"))


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.path = Path(self.temp.name) / "hands.sqlite3"

    def tearDown(self):
        self.temp.cleanup()

    def test_roundtrip_reload_and_duplicate_no_write(self):
        first = import_into_database(self.path, fixture("hu_fold"), "exemplo.phh")
        key = first["import"]["hand"]["recordId"]
        saved = read_hand(self.path, key)
        self.assertEqual(saved, first["import"]["hand"])
        before = self.path.read_bytes()
        duplicate = import_into_database(self.path, fixture("hu_fold"), "outro-nome.phh")
        self.assertTrue(duplicate["duplicate"])
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(read_hand(self.path, key), saved)

    def test_invalid_never_creates_database(self):
        result = import_into_database(self.path, fixture("invalid_missing_call"))
        self.assertFalse(result["stored"])
        self.assertFalse(self.path.exists())

    def test_incompatible_database_not_migrated(self):
        with closing(sqlite3.connect(self.path)) as c, c:
            c.execute("CREATE TABLE unrelated (x TEXT)")
            c.execute("PRAGMA user_version=99")
        before = self.path.read_bytes()
        with self.assertRaises(StoreError):
            import_into_database(self.path, fixture("hu_fold"))
        self.assertEqual(self.path.read_bytes(), before)

    def test_corrupted_source_and_json(self):
        data = import_into_database(self.path, fixture("hu_fold"))
        key = data["import"]["hand"]["recordId"]
        original = data["import"]["hand"]
        malformed_source = [{**original, "source": {**original["source"], **replacement}} for replacement in ({"fileName": 123}, {"importedAtUtc": "inválido"})]
        bool_index = {**original, "players": [{**p, "index": False} if i == 0 else p for i, p in enumerate(original["players"])]}
        for corrupt in ("{", "[]", '{"source": []}', *[json.dumps(h) for h in [*malformed_source, bool_index, {**original, "variant": "PLO"}]]):
            with self.subTest(corrupt=corrupt):
                with closing(sqlite3.connect(self.path)) as c, c:
                    c.execute("UPDATE hands SET canonical_json=?", (corrupt,))
                with self.assertRaises(StoreError):
                    read_hand(self.path, key)
        with closing(sqlite3.connect(self.path)) as c, c:
            c.execute("UPDATE hands SET raw_phh=?", (b"alterado",))
        with self.assertRaisesRegex(StoreError, "Proveniência"):
            read_hand(self.path, key)

    def test_duplicate_cannot_hide_corruption(self):
        import_into_database(self.path, fixture("hu_fold"))
        with closing(sqlite3.connect(self.path)) as c, c:
            c.execute("UPDATE hands SET canonical_json='{}'")
        before = self.path.read_bytes()
        with self.assertRaises(StoreError):
            import_into_database(self.path, fixture("hu_fold"))
        self.assertEqual(self.path.read_bytes(), before)

    def test_transaction_rollback_on_failure(self):
        data = import_into_database(self.path, fixture("hu_fold"))
        with closing(sqlite3.connect(self.path)) as c, c:
            c.execute("CREATE TRIGGER reject_insert BEFORE INSERT ON hands BEGIN SELECT RAISE(ABORT, 'test'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            import_into_database(self.path, fixture("decimal_fold"))
        with closing(sqlite3.connect(self.path)) as c, c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM hands").fetchone()[0], 1)
        self.assertEqual(read_hand(self.path, data["import"]["hand"]["recordId"]), data["import"]["hand"])

    def test_storage_error_and_cli_diagnostics(self):
        with self.assertRaises(sqlite3.OperationalError):
            import_into_database(self.path / "missing" / "x.sqlite3", fixture("hu_fold"))

    def test_cli_import_export_and_rejection(self):
        command = [sys.executable, "-m", "pipeline.hand_history.cli"]
        imported = subprocess.run(command + ["import", str(FIXTURES / "hu_fold.phh"), "--database", str(self.path)], capture_output=True, text=True, encoding="utf-8", check=True)
        result = json.loads(imported.stdout)
        self.assertTrue(result["stored"])
        exported = subprocess.run(command + ["export", str(self.path), result["import"]["hand"]["recordId"]], capture_output=True, text=True, encoding="utf-8", check=True)
        self.assertEqual(json.loads(exported.stdout)["hand"], result["import"]["hand"])
        rejected = subprocess.run(command + ["import", str(FIXTURES / "invalid_missing_call.phh")], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(rejected.returncode, 2)
        self.assertEqual(json.loads(rejected.stdout)["issues"][0]["code"], "ILLEGAL_ACTION")
        missing = subprocess.run(command + ["import", "arquivo-inexistente.phh"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(missing.returncode, 2)
        self.assertEqual(json.loads(missing.stdout)["issues"][0]["code"], "LOCAL_STORAGE")
        without_dependency = subprocess.run([sys.executable, "-S", "-m", "pipeline.hand_history.cli", "import", str(FIXTURES / "hu_fold.phh")], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(without_dependency.returncode, 2)
        self.assertEqual(json.loads(without_dependency.stdout)["issues"][0]["code"], "DEPENDENCY_MISSING")
        self.assertNotIn("Traceback", without_dependency.stderr)


if __name__ == "__main__":
    unittest.main()
