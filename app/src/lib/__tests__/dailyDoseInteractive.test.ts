import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  adaptLegacyRangeSpotToCanonical,
  importTexasSolverBundle,
  type LegacyRangeSpot,
  type TexasSolverBundleV1,
} from "../poker.ts";
import {
  BLOCKER_DRILL_SCENARIOS,
  DAILY_DOSE_MICROLESSONS,
  evaluateBlockerDrill,
  evaluatePotOddsDrill,
  evaluateRangeConstruction,
  evaluateSizingModelComparison,
  extractTargetActionWeights,
  POT_ODDS_DRILL_SCENARIOS,
} from "../poker/dailyDoseCatalog.ts";
import { getAll169Hands } from "../poker/cards.ts";

const bundle = JSON.parse(
  readFileSync("src/data/verified_ahkd7c_texassolver.json", "utf8"),
) as TexasSolverBundleV1;
const verifiedSpot = importTexasSolverBundle(bundle).spot;
const legacySpots = (
  JSON.parse(readFileSync("src/data/ranges_gto.json", "utf8"))
    .spots as LegacyRangeSpot[]
).map(adaptLegacyRangeSpotToCanonical);

describe("Daily Dose of GTO & Treinos Interativos — Validação Matemática e Pedagógica", () => {
  it("contém 12 microlições curtas (máx 3 frases por shortContext) com opções explícitas", () => {
    assert.equal(DAILY_DOSE_MICROLESSONS.length, 12);
    for (const lesson of DAILY_DOSE_MICROLESSONS) {
      assert.ok(lesson.id.startsWith("DD"));
      assert.equal(lesson.options.length, 3);
      assert.ok(lesson.correctIndex >= 0 && lesson.correctIndex < 3);
      const sentences = lesson.shortContext
        .split(/\.\s+/)
        .filter((s) => s.trim().length > 0);
      assert.ok(
        sentences.length <= 3,
        `Lição ${lesson.id} excede 3 frases: ${sentences.length}`,
      );
    }
  });

  it("avalia construção de range 13×13 ponderada por combos (6/4/12) sem inventar EV", () => {
    const spot =
      legacySpots.find((s) => s.spotId === "30bb_rfi_btn") ?? legacySpots[0];
    const targetAction = spot.legalActions[0].name;
    const targetWeights = extractTargetActionWeights(
      spot.referenceStrategy.matrixFrequencies ?? {},
      targetAction,
    );

    const exactMatch = evaluateRangeConstruction(
      targetWeights,
      targetWeights,
      spot.board,
    );
    assert.equal(exactMatch.accuracyPct, 100);
    assert.equal(exactMatch.matchCount, 169);
    assert.equal(exactMatch.overIncluded.length, 0);
    assert.equal(exactMatch.underIncluded.length, 0);

    const emptySelection: Record<string, number> = {};
    for (const h of getAll169Hands()) {
      emptySelection[h] = 0;
    }
    const emptyRes = evaluateRangeConstruction(
      emptySelection,
      targetWeights,
      spot.board,
    );
    assert.equal(emptyRes.userWeightedCombos, 0);
    if (emptyRes.targetWeightedCombos > 0) {
      assert.ok(emptyRes.underIncluded.length > 0);
    }
  });

  it("funciona também sobre a solução verificada real do TexasSolver (Ah Kd 7c)", () => {
    assert.equal(verifiedSpot.referenceStrategy.status, "VERIFIED");
    const weights = extractTargetActionWeights(
      verifiedSpot.referenceStrategy.matrixFrequencies ?? {},
      "Bet_33pct",
    );
    const res = evaluateRangeConstruction(
      weights,
      weights,
      verifiedSpot.board,
    );
    assert.equal(res.accuracyPct, 100);
    assert.equal(res.totalAvailableDeckCombos, 1176); // C(49,2) = 1176 combos no flop
  });

  it("treino de Pot Odds calcula equidade mínima, MDF e Bluff Break-Even analiticamente", () => {
    assert.ok(POT_ODDS_DRILL_SCENARIOS.length >= 6);
    for (const sc of POT_ODDS_DRILL_SCENARIOS) {
      const exactEq =
        (sc.villainBetBb / (sc.potBeforeBetBb + 2 * sc.villainBetBb)) * 100;
      const res = evaluatePotOddsDrill(
        sc.potBeforeBetBb,
        sc.villainBetBb,
        exactEq,
      );
      assert.equal(res.grade, "EXATO");
      assert.ok(res.mdfPct > 0 && res.mdfPct < 100);
      assert.ok(res.bluffBreakevenPct > 0 && res.bluffBreakevenPct < 100);
    }
  });

  it("treino de Blockers enumera exatamente os combos restantes via getAvailableCombosForClass", () => {
    assert.ok(BLOCKER_DRILL_SCENARIOS.length >= 3);
    for (const sc of BLOCKER_DRILL_SCENARIOS) {
      const res = evaluateBlockerDrill(sc);
      assert.ok(res.boardCombosOnly > 0);
      assert.ok(
        res.candidateABlocked > 0 || res.candidateBBlocked > 0,
      );
      assert.notEqual(res.betterBlocker, "TIE");
    }
  });

  it("comparador de sizings usa calculateLabEv (MODEL_BASED_EV) e identifica o melhor EV do modelo", () => {
    const res = evaluateSizingModelComparison({
      potBb: 10,
      sizingAPct: 33,
      foldFreqA: 0.34,
      eqWhenCalledA: 0.44,
      sizingBPct: 75,
      foldFreqB: 0.52,
      eqWhenCalledB: 0.38,
      checkEquity: 0.35,
    });
    const maxEv = Math.max(res.evABb, res.evBBb, res.evCheckBb);
    if (res.recommendedByModel === "SIZING_A") assert.equal(res.evABb, maxEv);
    if (res.recommendedByModel === "SIZING_B") assert.equal(res.evBBb, maxEv);
    if (res.recommendedByModel === "CHECK") assert.equal(res.evCheckBb, maxEv);
  });
});
