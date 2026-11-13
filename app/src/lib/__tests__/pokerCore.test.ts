import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  cellToHand,
  countAvailableCombosByClass,
  generateAll1326Combos,
  getAll169Hands,
  getAvailableCombosForClass,
  sampleCardsForHand,
  validateDeckUnique,
} from "../poker/cards.ts";
import {
  computeSidePots,
  getLegalActions,
  isLegalActionId,
  validateGameState,
  type GameState,
} from "../poker/stateEngine.ts";
import {
  assertNotPkoForStandardIcm,
  calculateBluffBreakevenFoldEquity,
  calculateBubbleFactor,
  calculateIcm,
  calculatePotOdds,
  calculateSimplifiedMdf,
  evaluatePkoBountyModel,
} from "../poker/mathEngine.ts";
import {
  adaptLegacyRangeSpotToCanonical,
  exportSpotMatrixToCsv,
  ImportedVerifiedProvider,
  NoSolutionProvider,
  parseSpotMatrixCsv,
  validateAndBuildVerifiedStrategy,
  validateHandDistribution,
  type LegacyRangeSpot,
} from "../poker/strategySchema.ts";
import {
  computeMixedAdherenceStats,
  evaluateDrillDecision,
  rankLeakSpots,
} from "../poker/drillEvaluator.ts";
import {
  CURRICULUM_MODULES,
  getDidacticAndUnsolvedSpots,
} from "../curriculum.ts";

test("13x13 grid has exactly 169 classes and 1326 physical combos (78 pairs, 312 suited, 936 offsuit)", () => {
  const hands = getAll169Hands();
  assert.equal(hands.length, 169);
  assert.equal(new Set(hands).size, 169);
  assert.equal(cellToHand(0, 0), "AA");
  assert.equal(cellToHand(0, 1), "AKs");
  assert.equal(cellToHand(1, 0), "AKo");

  const combos = generateAll1326Combos();
  assert.equal(combos.length, 1326);

  let pairs = 0;
  let suited = 0;
  let offsuit = 0;
  for (const c of combos) {
    if (c.handClass.length === 2) pairs++;
    else if (c.handClass.endsWith("s")) suited++;
    else offsuit++;
  }
  assert.equal(pairs, 78);
  assert.equal(suited, 312);
  assert.equal(offsuit, 936);
});

test("Card removal and blockers remove exact combos and prevent duplicate cards", () => {
  // Ah dead removes 3 combos of AA (leaves 3), 1 combo of AKs (leaves 3), 3 combos of AKo (leaves 9)
  const aaLeft = getAvailableCombosForClass("AA", ["Ah"]);
  assert.equal(aaLeft.length, 3);
  for (const c of aaLeft) {
    assert.ok(!c.cards.includes("Ah"));
  }

  const aksLeft = getAvailableCombosForClass("AKs", ["Ah"]);
  assert.equal(aksLeft.length, 3);

  const akoLeft = getAvailableCombosForClass("AKo", ["Ah"]);
  assert.equal(akoLeft.length, 9);

  const counts = countAvailableCombosByClass(["Ah", "Kd", "7c"]);
  assert.equal(counts.byClass.AA, 3);
  assert.equal(counts.byClass.AKs, 2); // AhKh e AdKd bloqueados -> restam AsKs, AcKc
  assert.equal(counts.byClass.AKo, 7); // 12 - (Ah + Kd removem 6 menos 1 sobreposto AhKd = 5) = 7
  // 52 - 3 = 49 cartas disponíveis -> C(49, 2) = 1176 combos!
  assert.equal(counts.totalCombos, 1176);

  const sampled = sampleCardsForHand("AA", ["Ah", "Ad"], () => 0);
  const check = validateDeckUnique(["Ah", "Ad", sampled[0], sampled[1]]);
  assert.equal(check.valid, true);
  assert.deepEqual(check.duplicates, []);
});

test("Card removal throws when 0 combos remain for a hand class", () => {
  assert.throws(() => sampleCardsForHand("AA", ["Ah", "Ad", "Ac"]), /Nenhum combo disponível/);
  const deckDup = validateDeckUnique(["As", "Kd", "As"]);
  assert.equal(deckDup.valid, false);
  assert.deepEqual(deckDup.duplicates, ["As"]);
});

test("GameState engine rejects duplicate cards, negative pot, negative stack, and computes legal actions + side pots", () => {
  const baseState: GameState = {
    format: "MTT",
    variant: "NLHE",
    playersInitial: 4,
    street: "FLOP",
    smallBlindBb: 0.5,
    bigBlindBb: 1,
    anteBbPerPlayer: 0.125,
    potBb: 5.5,
    currentBetBb: 4,
    minRaiseIncrementBb: 4,
    board: ["Ah", "Kd", "7c"],
    heroPosition: "BTN",
    heroCards: ["As", "Qs"],
    actingPosition: "BTN",
    players: [
      { position: "CO", stackBb: 0, investedTotalBb: 10, investedStreetBb: 4, folded: false, allIn: true, isHero: false },
      { position: "BTN", stackBb: 25, investedTotalBb: 6, investedStreetBb: 0, folded: false, allIn: false, isHero: true },
      { position: "SB", stackBb: 0, investedTotalBb: 0.5, investedStreetBb: 0, folded: true, allIn: false, isHero: false },
      { position: "BB", stackBb: 18, investedTotalBb: 20, investedStreetBb: 4, folded: false, allIn: false, isHero: false },
    ],
    actionHistory: [],
  };

  assert.equal(validateGameState(baseState).valid, true);

  const dupState: GameState = {
    ...baseState,
    heroCards: ["Ah", "Qs"], // Ah already on board
  };
  assert.equal(validateGameState(dupState).valid, false);

  const negPotState: GameState = { ...baseState, potBb: -1 };
  assert.equal(validateGameState(negPotState).valid, false);

  const negStackState: GameState = {
    ...baseState,
    players: baseState.players.map((p) => (p.isHero ? { ...p, stackBb: -0.5 } : p)),
  };
  assert.equal(validateGameState(negStackState).valid, false);

  // Legal actions check: BTN faces 4 BB bet with 25 BB behind -> min raise to 8 BB
  const legal = getLegalActions(baseState, [6, 10, 25]);
  const ids = legal.map((a) => a.id);
  assert.ok(ids.includes("fold"));
  assert.ok(ids.includes("call_4"));
  assert.ok(!ids.includes("raise_6bb"), "6bb is below min-raise (8bb)");
  assert.ok(ids.includes("raise_10bb"));
  assert.ok(ids.includes("allin_25bb"));
  assert.equal(isLegalActionId(baseState, "check"), false);

  // Short stack effective call cap (never over-call without side pot)
  const shortHeroState: GameState = {
    ...baseState,
    players: baseState.players.map((p) => (p.isHero ? { ...p, stackBb: 2.5 } : p)),
  };
  const shortLegal = getLegalActions(shortHeroState);
  const callAction = shortLegal.find((a) => a.kind === "allin");
  assert.ok(callAction);
  assert.equal(callAction.amountBb, 2.5);

  // Side pot reconstruction
  const pots = computeSidePots(
    [
      { position: "UTG", investedTotalBb: 10, folded: false },
      { position: "CO", investedTotalBb: 30, folded: false },
      { position: "BTN", investedTotalBb: 30, folded: false },
      { position: "SB", investedTotalBb: 2, folded: true },
    ],
    1,
  );
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amountBb, 33); // 10*3 + 2 (SB fold) + 1 (dead) = 33
  assert.deepEqual(pots[0].eligiblePositions, ["UTG", "CO", "BTN"]);
  assert.equal(pots[1].amountBb, 40); // (30-10)*2 = 40
  assert.deepEqual(pots[1].eligiblePositions, ["CO", "BTN"]);
});

test("Pot odds, bluff breakeven fold equity, and simplified MDF formulas match specification", () => {
  const po = calculatePotOdds(10, 5, 5);
  assert.equal(po.requiredEquity, 0.25);
  assert.equal(po.requiredEquityPct, 25);

  const fe = calculateBluffBreakevenFoldEquity(10, 5);
  assert.ok(Math.abs(fe.requiredFoldEquity - 1 / 3) < 1e-12);

  const mdf = calculateSimplifiedMdf(10, 5);
  assert.ok(Math.abs(mdf.mdf - 2 / 3) < 1e-12);
});

test("ICM Malmuth-Harville satisfies symmetry, total prize pool conservation, and PKO guard", () => {
  const icm = calculateIcm([1000, 1000, 1000, 1000], [500, 300, 200, 0]);
  assert.equal(icm.icmValues.length, 4);
  for (const val of icm.icmValues) {
    assert.ok(Math.abs(val - 250) < 1e-9);
  }
  const sumIcm = icm.icmValues.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumIcm - 1000) < 1e-9);

  // Asymmetric stacks still conserve exact prize pool
  const asym = calculateIcm([5000, 3000, 1500, 500], [500, 300, 200, 0]);
  const asymSum = asym.icmValues.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(asymSum - 1000) < 1e-9);
  assert.ok(asym.icmValues[0] > asym.icmValues[1]);
  assert.ok(asym.icmValues[1] > asym.icmValues[2]);
  assert.ok(asym.icmValues[2] > asym.icmValues[3]);

  // Bubble factor & risk premium
  const bf = calculateBubbleFactor(360, 0, 250); // gain 110, loss 250 -> BF = 2.2727
  assert.ok(Math.abs(bf.bubbleFactor - 250 / 110) < 1e-9);
  assert.ok(bf.riskPremiumPct > 15);

  // PKO rejection from standard ICM + separate PKO model
  assert.throws(() => assertNotPkoForStandardIcm("PKO"), /não pode ser aplicado/);
  const pko = evaluatePkoBountyModel({
    potWithoutBountyChips: 10000,
    callAmountChips: 5000,
    villainBountyUsd: 10,
    startingStackChips: 10000,
    startingBountyUsd: 10,
    heroCoversVillain: true,
  });
  assert.equal(pko.model, "PKO_BOUNTY_ADJUSTED");
  assert.ok(pko.adjustedRequiredEquity < 5000 / 15000);
});

test("Curriculum has 7 modules, didactic demo drills pass validation, and UNSOLVED blocks GTO scoring", () => {
  assert.equal(CURRICULUM_MODULES.length, 7);

  const spots = getDidacticAndUnsolvedSpots();
  const rfiDemo = spots.find((s) => s.spotId === "didactic_rfi_btn_30bb_v1")!;
  const flopDemo = spots.find((s) => s.spotId === "didactic_flop_cbet_btn_vs_bb_v1")!;
  const unsolved = spots.find((s) => s.spotId === "unsolved_turn_barrel_btn_vs_bb_v1")!;

  assert.equal(rfiDemo.referenceStrategy.status, "DIDACTIC_DEMO");
  assert.equal(flopDemo.referenceStrategy.status, "DIDACTIC_DEMO");
  assert.equal(unsolved.referenceStrategy.status, "UNSOLVED");
  assert.equal(rfiDemo.referenceStrategy.matrixEv, null);
  assert.equal(flopDemo.referenceStrategy.matrixEv, null);

  // Validate all 169 cells in both didactic drills sum to 1.0
  for (const sp of [rfiDemo, flopDemo]) {
    const actions = sp.legalActions.map((a) => a.name);
    for (const hand of getAll169Hands()) {
      const dist = sp.referenceStrategy.matrixFrequencies![hand];
      const chk = validateHandDistribution(dist, actions, 0.005);
      assert.equal(chk.valid, true, `${sp.spotId} ${hand}: ${chk.errors.join("; ")}`);
    }
  }

  // Regra de Integridade: DIDACTIC_DEMO avalia frequência pedagógica, mas NUNCA gera pontuação de EV loss GTO!
  const mixedRes = evaluateDrillDecision({
    spot: rfiDemo,
    handClass: "K6s",
    chosenAction: "Fold",
    rngValue: 20,
    useRng: true,
    mode: "LEARNING",
  });
  assert.equal(mixedRes.gtoScored, false);
  assert.notEqual(mixedRes.classification, "ev_error");
  assert.equal(mixedRes.evUnit, null);
  assert.equal(mixedRes.evLoss, null);

  // Error case in DIDACTIC_DEMO: 72o raising in BTN RFI is flagged as frequency error, but evLoss remains null
  const errRes = evaluateDrillDecision({
    spot: rfiDemo,
    handClass: "72o",
    chosenAction: "Raise_2_1bb",
    mode: "LEARNING",
  });
  assert.equal(errRes.classification, "ev_error");
  assert.equal(errRes.gtoScored, false);
  assert.equal(errRes.evLoss, null);

  // UNSOLVED refuses GTO scoring
  const unsolvedRes = evaluateDrillDecision({
    spot: unsolved,
    handClass: "AKs",
    chosenAction: "Bet_75pct",
  });
  assert.equal(unsolvedRes.gtoScored, false);
  assert.equal(unsolvedRes.classification, "unsolved");
  assert.equal(unsolvedRes.evLoss, null);
});

test("Mixed strategy adherence and adaptive leak ranking compute expected metrics", () => {
  const target = { Raise_2_1bb: 0.7, Fold: 0.3 };
  const attempts = [
    ...Array.from({ length: 7 }, (_, i) => ({
      spotId: "s1",
      hand: "K6s",
      chosenAction: "Raise_2_1bb",
      targetDistribution: target,
      evLoss: 0,
      timestamp: i,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      spotId: "s1",
      hand: "K6s",
      chosenAction: "Fold",
      targetDistribution: target,
      evLoss: 0.005,
      timestamp: 10 + i,
    })),
  ];

  const adherence = computeMixedAdherenceStats(attempts);
  assert.equal(adherence.adherencePct, 100);

  const ranked = rankLeakSpots([
    { spotId: "low_impact", evLoss: 0.05, isError: false },
    { spotId: "high_leak", evLoss: 0.45, isError: true },
    { spotId: "high_leak", evLoss: 0.35, isError: true },
  ]);
  assert.equal(ranked[0].spotId, "high_leak");
});

test("Verified solution importer enforces unit consistency, frequency sum=1, and CSV export/import roundtrip", () => {
  const spots = getDidacticAndUnsolvedSpots();
  const rfiDemo = spots[0];

  // CSV export & import roundtrip
  const csv = exportSpotMatrixToCsv(rfiDemo);
  const parsed = parseSpotMatrixCsv(csv);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.handsCount, 169);
    assert.deepEqual(parsed.actions, ["Raise_2_1bb", "Fold"]);
  }

  // Reject ICM mode claiming bbEV
  const dummyFreqs = Object.fromEntries(
    Object.keys(rfiDemo.referenceStrategy.matrixFrequencies!).map((h) => [
      h,
      { Raise_2_1bb: 1, Fold: 0 },
    ]),
  );
  const dummyEvs = Object.fromEntries(
    Object.keys(dummyFreqs).map((h) => [h, { Raise_2_1bb: 1.5, Fold: 0 }]),
  );
  const badUnit = validateAndBuildVerifiedStrategy({
    spotId: "bad_icm",
    evUnit: "bbEV",
    legalActions: ["Raise_2_1bb", "Fold"],
    assumptions: {
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      effectiveStackBb: 20,
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      betSizingsLabel: "2.1bb / Fold",
      icmMode: "ICM",
      solverName: "HRC",
    },
    solutionSourceLabel: "HRC Unit Rejection Fixture",
    fileOrReference: "hrc_bad_icm.json",
    fileSha256: "b".repeat(64),
    matrixFrequencies: dummyFreqs,
    matrixEv: dummyEvs,
  });
  assert.equal(badUnit.ok, false);

  // Reject missing SHA-256 hash or synthetic solver name
  const noHash = validateAndBuildVerifiedStrategy({
    spotId: "no_hash_reject",
    evUnit: "bbEV",
    legalActions: ["Raise_2_1bb", "Fold"],
    assumptions: {
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      effectiveStackBb: 30,
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      betSizingsLabel: "2.1bb / Fold",
      icmMode: "chipEV",
      solverName: "PioSOLVER",
    },
    solutionSourceLabel: "Pio Fixture",
    fileOrReference: "pio_missing_hash.json",
    fileSha256: "not-a-sha256",
    matrixFrequencies: dummyFreqs,
    matrixEv: dummyEvs,
  });
  assert.equal(noHash.ok, false);

  // Valid verified import with SHA-256 and EV matrix
  const provider = new ImportedVerifiedProvider();
  const okReg = provider.register({
    spotId: "verified_btn_30bb",
    evUnit: "bbEV",
    legalActions: ["Raise_2_1bb", "Fold"],
    assumptions: {
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      effectiveStackBb: 30,
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      betSizingsLabel: "2.1bb / Fold",
      icmMode: "chipEV",
      solverName: "PioSOLVER",
      solverVersion: "2.0.9",
    },
    solutionSourceLabel: "PioSOLVER 2.0.9 Fixture",
    fileOrReference: "pio_btn_30bb.json",
    fileSha256: "a".repeat(64),
    convergenceExploitabilityPct: 0.15,
    matrixFrequencies: dummyFreqs,
    matrixEv: dummyEvs,
  });
  assert.equal(okReg.ok, true);
  assert.equal(provider.getStrategy("verified_btn_30bb").status, "VERIFIED");
  assert.equal(new NoSolutionProvider().getStrategy().status, "UNSOLVED");
});

test("Legacy ranges_gto.json adapts cleanly and audits frequency sums honestly", () => {
  const jsonPath = resolve(process.cwd(), "src", "data", "ranges_gto.json");
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    totalSpots: number;
    spots: LegacyRangeSpot[];
  };

  assert.equal(raw.spots.length, 229);
  let spotsWithWarnings = 0;
  for (const leg of raw.spots) {
    const canonical = adaptLegacyRangeSpotToCanonical(leg);
    assert.equal(canonical.referenceStrategy.status, "IMPORTED_CHART_NO_EV");
    assert.equal(canonical.referenceStrategy.evUnit, null);
    if (canonical.referenceStrategy.validationWarnings?.length) {
      spotsWithWarnings++;
    }
  }
  // Auditoria detectou exatamente os 2 spots com 1 célula em 0.964 na extração de PDF
  assert.equal(spotsWithWarnings, 2);
});
