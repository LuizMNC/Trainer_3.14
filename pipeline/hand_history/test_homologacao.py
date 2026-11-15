"""Auditoria independente limitada: aritmética exata, ranking por enumeração e regressões.

O ranking de cinco cartas abaixo é somente oráculo de teste, sem PokerKit,
sequenciamento de apostas, solver, equity, recomendação ou uso no aplicativo.
"""
from __future__ import annotations

from collections import Counter
from contextlib import closing
from decimal import Inexact, ROUND_DOWN, localcontext
from hashlib import sha256
from itertools import combinations
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from .importer import MAX_ATOMS, import_phh
from .store import StoreError, import_into_database, read_hand
from .test_hand_history import HU_DEAL, THREE_DEAL, fixture, hand

ROOT = Path(__file__).resolve().parents[2]
EXTERNAL = ROOT / "docs/homologacao-fase2a/externos"
RANKS = "23456789TJQKA"


def five_card_rank(cards: tuple[str, ...]) -> tuple[int, ...]:
    if len(cards) != 5 or len(set(cards)) != 5:
        raise ValueError("Referência exige cinco cartas distintas.")
    values = [RANKS.index(c[0]) + 2 for c in cards]
    counts = Counter(values)
    groups = sorted(((count, rank) for rank, count in counts.items()), reverse=True)
    descending = tuple(sorted(values, reverse=True))
    unique = sorted(counts)
    straight = 5 if unique == [2, 3, 4, 5, 14] else (unique[-1] if len(unique) == 5 and unique[-1] - unique[0] == 4 else 0)
    flush = len({c[1] for c in cards}) == 1
    if straight and flush:
        return (8, straight)
    if groups[0][0] == 4:
        return (7, groups[0][1], groups[1][1])
    if [g[0] for g in groups] == [3, 2]:
        return (6, groups[0][1], groups[1][1])
    if flush:
        return (5, *descending)
    if straight:
        return (4, straight)
    if groups[0][0] == 3:
        return (3, groups[0][1], *sorted((r for count, r in groups[1:]), reverse=True))
    if [g[0] for g in groups[:2]] == [2, 2]:
        return (2, *sorted((groups[0][1], groups[1][1]), reverse=True), groups[2][1])
    if groups[0][0] == 2:
        return (1, groups[0][1], *sorted((r for count, r in groups[1:]), reverse=True))
    return (0, *descending)


def seven_card_rank(cards: list[str]) -> tuple[int, ...]:
    if len(cards) != 7 or len(set(cards)) != 7:
        raise ValueError("Referência exige sete cartas distintas.")
    return max(five_card_rank(c) for c in combinations(cards, 5))


def validated(raw: bytes, *, complete: bool = True) -> dict:
    result = import_phh(raw)
    assert result["ok"], result["issues"]
    h = result["hand"]
    assert h is not None and h["results"]["complete"] == complete
    return h


def independent_audit(h: dict) -> dict:
    """Conferência dos eventos/pagamentos, sem chamar API/ranking PokerKit."""
    n = len(h["players"])
    initial = [int(p["initialStackAtoms"]) for p in h["players"]]
    totals = {key: [0]*n for key in ("paidAtoms", "returnedAtoms", "awardedAtoms")}
    previous = None
    for i, event in enumerate(h["events"]):
        assert event["sequence"] == i
        if previous is not None:
            assert previous == event["before"]
        for snapshot in (event["before"], event["after"]):
            assert len(snapshot["stacksAtoms"]) == n
            assert sum(map(int, snapshot["stacksAtoms"])) + int(snapshot["potAtoms"]) == sum(initial)
            # bets já estão no pote; somá-los novamente criaria fichas.
            assert sum(map(int, snapshot["betsAtoms"])) <= int(snapshot["potAtoms"])
        previous = event["after"]
        for key in totals:
            assert len(event[key]) == n
            for p, value in enumerate(event[key]):
                assert isinstance(value, str) and value.isascii() and value.isdecimal()
                totals[key][p] += int(value)
    assert previous == h["ending"]
    result = h["results"]
    gross, returned, awards = (list(map(int, result[k])) for k in ("grossContributionsAtoms", "returnedAtoms", "awardsAtoms"))
    net = [g-r for g, r in zip(gross, returned)]
    assert net == list(map(int, result["netContributionsAtoms"]))
    assert all(value >= 0 for value in net)
    assert totals == {"paidAtoms": gross, "returnedAtoms": returned, "awardedAtoms": awards}
    pot_awards = [0]*n
    independent_showdowns = []
    for pot in h["pots"]:
        distribution = list(map(int, pot["awardsAtoms"]))
        eligible = pot["eligiblePlayerIndices"]
        assert sum(distribution) == int(pot["amountAtoms"])
        assert all(amount == 0 or i in eligible for i, amount in enumerate(distribution))
        assert all(not h["ending"]["folded"][i] and not h["ending"]["mucked"][i] for i in eligible)
        for i, amount in enumerate(distribution):
            pot_awards[i] += amount
        if len(eligible) > 1:
            ranks = {}
            for player in eligible:
                cards = h["players"][player]["holeCards"]["value"]
                assert len(cards) == 2 and None not in cards
                ranks[player] = seven_card_rank(cards + h["ending"]["board"])
            best = max(ranks.values())
            winners = sorted(i for i, rank in ranks.items() if rank == best)
            share, remainder = divmod(int(pot["amountAtoms"]), len(winners))
            expected = [0]*n
            for order, player in enumerate(winners):
                expected[player] = share + int(order < remainder)
            assert distribution == expected, (distribution, expected)
            independent_showdowns.append({"potIndex": pot["index"], "ranks": ranks, "winnerIndices": winners, "awardsAtoms": list(map(str, expected))})
    if result["complete"]:
        final = list(map(int, result["computedFinalStacksAtoms"]))
        assert sum(final) == sum(initial)
        assert sum(net) == sum(awards) == sum(int(p["amountAtoms"]) for p in h["pots"])
        assert [stack-invested+prize for stack, invested, prize in zip(initial, net, awards)] == final
        assert pot_awards == awards
    else:
        assert result["computedFinalStacksAtoms"] is None
    assert h["integrity"]["gtoAnalysis"] == "NOT_EVALUATED" and h["integrity"]["evLoss"] is None
    return {"eventsChecked": len(h["events"]), "conservedInitialAtoms": str(sum(initial)),
            "grossAtoms": list(map(str, gross)), "returnedAtoms": list(map(str, returned)), "netAtoms": list(map(str, net)),
            "awardsAtoms": list(map(str, awards)), "finalStacksAtoms": result["computedFinalStacksAtoms"],
            "potAmountsAtoms": [p["amountAtoms"] for p in h["pots"]], "independentShowdowns": independent_showdowns}


class IndependentReferenceTests(unittest.TestCase):
    def test_rank_categories_and_wheel(self):
        cases = [("AsKsQsJsTs", (8,14)), ("AsAdAcAh2d", (7,14,2)), ("KsKdKc2h2d", (6,13,2)),
                 ("AsJs8s5s3s", (5,14,11,8,5,3)), ("As2d3c4h5s", (4,5)), ("9s8d7c6h5s", (4,9)),
                 ("QsQdQc8h7s", (3,12,8,7)), ("QsQd8c8h7s", (2,12,8,7)), ("AsAdQc8h7s", (1,14,12,8,7)),
                 ("AsKdQc8h7s", (0,14,13,12,8,7))]
        for packed, expected in cases:
            with self.subTest(cards=packed):
                self.assertEqual(five_card_rank(tuple(packed[i:i+2] for i in range(0,10,2))), expected)

    def test_all_eight_original_fixtures(self):
        expected = {
            "hu_fold": (["101","99"], ["2"]), "decimal_fold": (["101","99"], ["2"]),
            "three_way_allin": (["150","100","100"], ["150","100"]),
            "folded_sidepot": (["99","100","151","100"], ["151","100"]),
            "split_odd_ante": (["101","99","100"], ["5"]), "showdown_muck": (["98","102"], ["4"]),
        }
        # Referências analíticas por fixture, não calculadas pelo importador.
        ledgers = {
            "hu_fold": ([2,1], [1,0], [2,0], [[0]]),
            "decimal_fold": ([2,1], [1,0], [2,0], [[0]]),
            "three_way_allin": ([50,100,200], [0,0,100], [150,100,0], [[0,1,2],[1,2]]),
            "folded_sidepot": ([1,100,50,200], [0,0,0,100], [0,100,151,0], [[1,2,3],[1,3]]),
            "split_odd_ante": ([2,3,0], [0,0,0], [3,2,0], [[0,1]]),
            "showdown_muck": ([2,2], [0,0], [0,4], [[1]]),
        }
        for name, (final, pots) in expected.items():
            with self.subTest(name=name):
                h = validated(fixture(name))
                result = independent_audit(h)
                self.assertEqual(result["finalStacksAtoms"], final)
                self.assertEqual(result["potAmountsAtoms"], pots)
                gross, returned, awards, eligible = ledgers[name]
                self.assertEqual(result["grossAtoms"], list(map(str,gross)))
                self.assertEqual(result["returnedAtoms"], list(map(str,returned)))
                self.assertEqual(result["awardsAtoms"], list(map(str,awards)))
                self.assertEqual([p["eligiblePlayerIndices"] for p in h["pots"]], eligible)
        independent_audit(validated(fixture("partial_flop"), complete=False))
        self.assertEqual(import_phh(fixture("invalid_missing_call"))["status"], "INVALID")

    def test_external_original_bytes_and_classification(self):
        manifest = json.loads((EXTERNAL / "manifest.json").read_text())
        statuses = []
        for entry in manifest:
            path = ROOT / entry["localFile"]
            self.assertEqual(sha256(path.read_bytes()).hexdigest(), entry["sha256"])
            if path.suffix != ".phh":
                continue
            result = import_phh(path.read_bytes())
            expected = "UNSUPPORTED" if "arieh" in path.name else "VALIDATED_COMPLETE"
            self.assertEqual(result["status"], expected)
            statuses.append(result["status"])
            if result["hand"]:
                independent_audit(result["hand"])
        self.assertEqual(Counter(statuses), {"VALIDATED_COMPLETE":4, "UNSUPPORTED":1})

    def test_dwan_winner_independent_of_pokerkit(self):
        h = validated((EXTERNAL / "data__dwan-ivey-2009.phh").read_bytes())
        audited = independent_audit(h)
        ranks = audited["independentShowdowns"][0]["ranks"]
        self.assertEqual(ranks, {0:(4,5), 2:(4,7)})
        self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["572100","1997500","1109500"])

    def test_rank_oracle_detects_wrong_winner(self):
        h = validated(fixture("three_way_allin"))
        # Corrupção intencional apenas em memória: prova que o oráculo não só
        # aceita o vencedor que o próprio importador entregou.
        h["pots"][0]["awardsAtoms"] = ["0","150","0"]
        with self.assertRaises(AssertionError):
            independent_audit(h)


class PrecisionAndCompatibilityTests(unittest.TestCase):
    def test_decimal_context_cannot_round_source(self):
        raw = hand(HU_DEAL + ["p2 f"]).replace(b"[100, 100]", b"[123456.123456,123456.123456]")
        expected_initial = ["123456123456"]*2
        for precision in (1,6,28):
            with self.subTest(precision=precision), localcontext() as ctx:
                ctx.prec = precision
                ctx.rounding = ROUND_DOWN
                ctx.traps[Inexact] = True
                h = validated(raw)
                self.assertEqual([p["initialStackAtoms"] for p in h["players"]], expected_initial)
                self.assertEqual(h["results"]["computedFinalStacksAtoms"], ["123457123456","123455123456"])
                independent_audit(h)

    def test_exact_safe_boundary_six_places_and_overflow(self):
        # 2^53-1 total, sem arredondamento; prefixo mantém todas as fichas.
        raw = hand(HU_DEAL).replace(b"[100, 100]", f"[{MAX_ATOMS-100},100]".encode())
        h = validated(raw, complete=False)
        independent_audit(h)
        invalid = raw.replace(str(MAX_ATOMS-100).encode(), str(MAX_ATOMS-99).encode())
        self.assertEqual(import_phh(invalid)["issues"][0]["code"], "AMOUNT_OVERFLOW")
        tiny = hand(HU_DEAL + ["p2 f"]).replace(b"[1, 2]", b"[0.000001,0.000002]").replace(b"min_bet=2",b"min_bet=0.000002")
        self.assertEqual(validated(tiny)["results"]["returnedAtoms"], ["1","0"])

    def test_toml_recursion_and_size_are_structured_errors(self):
        nested = b'variant="NT"\nx=' + b"["*1200 + b"0" + b"]"*1200
        result = import_phh(nested)
        self.assertEqual(result["status"], "UNSUPPORTED")
        self.assertEqual(result["issues"][0]["code"], "PHH_NESTING_LIMIT")
        self.assertEqual(import_phh(b" "*1_048_577)["issues"][0]["code"], "INPUT_TOO_LARGE")

    def test_post_terminal_show_is_outside_profile_not_illegal_poker(self):
        result = import_phh(hand(HU_DEAL + ["p2 f", "p1 sm -"]))
        self.assertEqual(result["status"], "UNSUPPORTED")
        self.assertEqual(result["issues"][0]["code"], "POST_TERMINAL_SHOW_UNSUPPORTED")
        self.assertEqual(import_phh(hand(HU_DEAL + ["p2 f", "p1 cc"]))["status"], "INVALID")

    def test_full_raise_and_short_raise_boundary(self):
        kwargs = {"stacks":"[100,100,3]", "antes":"[0,0,0]", "blinds":"[1,2,0]"}
        # Aumento para 3 é incompleto (BB 2); calls continuam legais.
        short = validated(hand(THREE_DEAL + ["p3 cbr 3", "p1 cc", "p2 cc"], **kwargs), complete=False)
        self.assertEqual(short["ending"]["board"], [])
        self.assertEqual(short["results"]["grossContributionsAtoms"], ["3","3","3"])
        # p1 ainda não agiu, mas o perfil conservador exclui até esta reabertura.
        self.assertEqual(import_phh(hand(THREE_DEAL + ["p3 cbr 3", "p1 cbr 5"], **kwargs))["issues"][0]["code"], "SHORT_ALLIN_REOPEN_UNSUPPORTED")
        # Aumento mínimo completo (2 -> 4) não ativa a proteção.
        full = validated(hand(THREE_DEAL + ["p3 cbr 4", "p1 cbr 6"], stacks="[100,100,100]", antes="[0,0,0]", blinds="[1,2,0]"), complete=False)
        self.assertEqual(full["events"][-1]["amountAtoms"], "6")

    def test_short_raise_after_prior_actions_and_new_street(self):
        # 6 jogadores: p3 aumenta para 4, p4 paga; p5 all-in 5 (incompleto),
        # p6/SB/BB fold, p3 tenta reabrir. Guard permanece antes de qualquer repair.
        deal = ["d dh p1 2c3d","d dh p2 4c5d","d dh p3 AsAd","d dh p4 KsKd","d dh p5 QsQd","d dh p6 6c7d"]
        args = {"stacks":"[100,100,100,100,5,100]", "antes":"[0,0,0,0,0,0]", "blinds":"[1,2,0,0,0,0]"}
        actions = deal+["p3 cbr 4","p4 cc","p5 cbr 5","p6 f","p1 f","p2 f"]
        self.assertEqual(import_phh(hand(actions+["p3 cbr 8"], **args))["issues"][0]["code"], "SHORT_ALLIN_REOPEN_UNSUPPORTED")
        # Calls por quem já agiu são aceitos; nova street libera aposta completa.
        h = validated(hand(actions+["p3 cc","p4 cc","d db 8c9dTh","p3 cbr 2"], **args), complete=False)
        self.assertEqual(h["ending"]["street"], "FLOP")

    def test_future_cards_are_not_in_earlier_dealing_event(self):
        actions = ["d dh p1 ????", "d dh p2 AsKd", "p2 cbr 100", "p1 cc", "p1 sm 2c3d", "p2 sm -", "d db 4h5s7c", "d db 8h", "d db 9h"]
        h = validated(hand(actions))
        dealt = next(e for e in h["events"] if e["kind"] == "HoleDealing" and e["playerIndex"] == 0)
        revealed = next(e for e in h["events"] if e["kind"] == "HoleCardsShowingOrMucking" and e["playerIndex"] == 0)
        self.assertEqual(dealt["cards"], [None,None])
        self.assertEqual(revealed["cards"], ["2c","3d"])
        self.assertLess(dealt["sequence"], revealed["sequence"])
        self.assertEqual(h["players"][0]["holeCards"]["value"], ["2c","3d"])
        self.assertEqual(h["events"][0]["before"]["board"], [])
        # O agregado final contém futuro por definição; não é um frame de replay.


class PersistenceAuditTests(unittest.TestCase):
    def test_nested_sqlite_json_is_diagnostic_not_traceback(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp)/"hands.sqlite3"
            r = import_into_database(path, fixture("hu_fold"))
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE hands SET canonical_json=?", ("["*1200+"0"+"]"*1200,))
            with self.assertRaises(StoreError):
                read_hand(path, r["import"]["hand"]["recordId"])
            process = subprocess.run([sys.executable,"-m","pipeline.hand_history.cli","export",str(path),r["import"]["hand"]["recordId"]], capture_output=True, text=True, encoding="utf-8")
            self.assertEqual(process.returncode,2)
            self.assertEqual(json.loads(process.stdout)["issues"][0]["code"], "LOCAL_STORAGE")
            self.assertNotIn("Traceback",process.stderr)

    def test_unknown_schema_and_rollback_preserve_existing_bytes(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp)/"hands.sqlite3"
            r = import_into_database(path,fixture("hu_fold"))
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("UPDATE hands SET schema_version='99.0.0'")
            previous = path.read_bytes()
            with self.assertRaises(StoreError):
                read_hand(path,r["import"]["hand"]["recordId"])
            self.assertEqual(path.read_bytes(),previous)

    def test_partial_roundtrip_is_not_promoted(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp)/"hands.sqlite3"
            result = import_into_database(path,fixture("partial_flop"))
            h = read_hand(path,result["import"]["hand"]["recordId"])
            self.assertEqual(h["integrity"]["status"],"VALIDATED_PARTIAL")
            self.assertFalse(h["results"]["complete"])
            self.assertIsNone(h["results"]["computedFinalStacksAtoms"])


if __name__ == "__main__":
    unittest.main()
