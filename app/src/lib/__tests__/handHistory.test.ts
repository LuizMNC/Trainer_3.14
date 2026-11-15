import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { crossCheckHandWithExistingEngine } from "../poker/handHistoryAdapter.ts";
import type { CanonicalHand, HandImportResult } from "../poker/handHistorySchema.ts";

const root = resolve("..");
const python = process.env.POKER_HH_PYTHON ?? resolve(root, "pipeline/hand_history/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
function ingest(name: string): HandImportResult {
  const source = `pipeline/hand_history/fixtures/${name}.phh`;
  const executed = spawnSync(python, ["-m", "pipeline.hand_history.cli", "import", source], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.ifError(executed.error);
  assert.ok(executed.status === 0 || executed.status === 2, `Configure o Python/PokerKit conforme docs/CODEX_FASE2A_BANCO_MAOS.md: ${executed.stderr}`);
  return JSON.parse(executed.stdout) as HandImportResult;
}
function valid(name: string): CanonicalHand {
  const result = ingest(name);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.ok(result.hand);
  return result.hand;
}

describe("Fase 2A — ponte real Python/TypeScript, sem estratégias GTO", () => {
  for (const fixture of ["hu_fold", "decimal_fold", "three_way_allin", "folded_sidepot", "showdown_muck"]) {
    it(`confere cartas e side pots com motor existente: ${fixture}`, () => {
      const hand = valid(fixture);
      assert.equal(hand.schemaVersion, "1.0.0");
      const check = crossCheckHandWithExistingEngine(hand);
      assert.equal(check.knownCardsValid, true);
      assert.equal(check.sidePots.status, "MATCH", check.sidePots.reason);
      assert.equal(hand.integrity.gtoAnalysis, "NOT_EVALUATED");
      assert.equal(hand.integrity.evLoss, null);
      assert.equal("referenceStrategy" in hand, false);
      assert.equal(JSON.stringify(hand).includes('"VERIFIED"'), false);
      const raw = readFileSync(resolve(root, `pipeline/hand_history/fixtures/${fixture}.phh`));
      const hash = createHash("sha256").update(raw).digest("hex");
      assert.equal(hand.source.sha256, hash);
      assert.equal(hand.recordId, `phh-sha256:${hash}`);
      assert.equal(hand.source.byteLength, raw.length);
      assert.equal(hand.events.every((event, i) => event.sequence === i), true);
      assert.equal(hand.results.computedFinalStacksAtoms?.reduce((a, b) => a + BigInt(b), 0n), hand.players.reduce((a, b) => a + BigInt(b.initialStackAtoms), 0n));
    });
  }
  it("não certifica projeções incompatíveis: ante e prefixo parcial", () => {
    const ante = valid("split_odd_ante");
    assert.deepEqual(ante.results.awardsAtoms, ["3", "2", "0"]);
    assert.equal(crossCheckHandWithExistingEngine(ante).sidePots.status, "UNAVAILABLE");
    const partial = valid("partial_flop");
    assert.equal(partial.integrity.status, "VALIDATED_PARTIAL");
    assert.equal(partial.results.computedFinalStacksAtoms, null);
    assert.equal(crossCheckHandWithExistingEngine(partial).sidePots.status, "UNAVAILABLE");
  });
  it("rejeita sequência incompleta em vez de inserir decisões", () => {
    const result = ingest("invalid_missing_call");
    assert.equal(result.ok, false);
    assert.equal(result.hand, null);
    assert.equal(result.issues[0].code, "ILLEGAL_ACTION");
    assert.equal(result.issues[0].actionIndex, 2);
  });
  it("preserva posição PHH e assento físico, independente da ordem numérica", () => {
    const hand = valid("hu_fold");
    assert.deepEqual(hand.players.map(p => p.seat), [{ status: "REPORTED", value: 4 }, { status: "REPORTED", value: 2 }]);
    assert.deepEqual(crossCheckHandWithExistingEngine(hand).positionsInPhhOrder, ["BB", "BTN/SB"]);
    assert.equal(hand.players[0].holeCards.status, "REPORTED");
    assert.deepEqual(hand.players[0].holeCards.value, [null, null]);
  });
  it("confere divergências reais de cartas/potes sem alterar o histórico", () => {
    const hand = valid("hu_fold");
    const original = JSON.stringify(hand);
    const tampered = structuredClone(hand);
    tampered.pots[0].amountAtoms = "3";
    assert.equal(crossCheckHandWithExistingEngine(tampered).sidePots.status, "MISMATCH");
    tampered.ending.board = ["As", "As", "2c"];
    assert.equal(crossCheckHandWithExistingEngine(tampered).knownCardsValid, false);
    assert.equal(JSON.stringify(hand), original);
  });
  it("recusa projeção de precisão incompatível e versão futura", () => {
    const hand = valid("hu_fold");
    hand.table.minBetAtoms = "3";
    assert.equal(crossCheckHandWithExistingEngine(hand).sidePots.status, "UNAVAILABLE");
    const future = { ...hand, schemaVersion: "2.0.0" } as unknown as CanonicalHand;
    assert.throws(() => crossCheckHandWithExistingEngine(future), /incompatível/);
  });
});
