import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  getAll169Hands,
  getAvailableCombosForClass,
  countAvailableCombosByClass,
} from "../poker/cards.ts";
import {
  validateGameState,
  getLegalActions,
  isLegalActionId,
  computeSidePots,
  type GameState,
} from "../poker/stateEngine.ts";
import {
  calculatePotOdds,
  calculateBluffBreakevenFoldEquity,
  calculateSimplifiedMdf,
  calculateIcm,
  calculateBubbleFactor,
  assertNotPkoForStandardIcm,
  evaluatePkoBountyModel,
} from "../poker/mathEngine.ts";
import {
  adaptLegacyRangeSpotToCanonical,
  type CanonicalSpot,
  type LegacyRangeSpot,
} from "../poker/strategySchema.ts";
import {
  evaluateDrillDecision,
  computeMixedAdherenceStats,
} from "../poker/drillEvaluator.ts";

describe("ETAPA 1 — Auditoria dos 229 spots de ranges_gto.json", () => {
  const rangesPath = path.resolve(process.cwd(), "src/data/ranges_gto.json");
  const parsedJson = JSON.parse(fs.readFileSync(rangesPath, "utf8")) as {
    version: string;
    totalSpots: number;
    spots: LegacyRangeSpot[];
  };
  const rawSpots = parsedJson.spots;

  it("11. Audita todos os 229 spots (38.701 células) e comprova as anomalias 0.964 em 17bb_sb_vs_utg_rfi/AA e 20bb_btn_vs_mp_rfi/KK", () => {
    assert.equal(rawSpots.length, 229, "Deve conter exatamente 229 spots");

    let totalCells = 0;
    let exactOneCount = 0;
    let roundingToleranceCount = 0; // 0 < |sum - 1| <= 0.002 (0.999 ou 1.001)
    let subBarDropMinorCount = 0;   // 0.970 <= sum < 0.998 (0.976 e 0.988)
    const severeAnomalies: Array<{
      spotId: string;
      hand: string;
      sum: number;
      freqs: Record<string, number>;
    }> = [];

    for (const spot of rawSpots) {
      const hands = Object.keys(spot.matrix);
      assert.equal(hands.length, 169, `Spot ${spot.id} deve ter 169 classes de mãos`);

      for (const hand of hands) {
        totalCells++;
        const freqs = spot.matrix[hand];
        const sum = Number(
          Object.values(freqs)
            .reduce((acc, v) => acc + v, 0)
            .toFixed(6),
        );
        const diff = Math.abs(sum - 1.0);

        if (diff === 0) {
          exactOneCount++;
        } else if (diff <= 0.002) {
          roundingToleranceCount++;
        } else if (sum >= 0.97 && sum < 0.998) {
          subBarDropMinorCount++;
        } else {
          severeAnomalies.push({ spotId: spot.id, hand, sum, freqs });
        }
      }
    }

    assert.equal(totalCells, 38701);
    assert.equal(exactOneCount, 38341);
    assert.equal(roundingToleranceCount, 337);
    assert.equal(subBarDropMinorCount, 21);

    // As duas únicas células com soma < 0.97 são exatamente as citadas na auditoria (soma = 0.964)
    assert.equal(severeAnomalies.length, 2);
    assert.deepEqual(
      severeAnomalies.map((a) => `${a.spotId}/${a.hand}`).sort(),
      ["17bb_sb_vs_utg_rfi/AA", "20bb_btn_vs_mp_rfi/KK"],
    );
    assert.equal(severeAnomalies[0].sum, 0.964);
    assert.equal(severeAnomalies[1].sum, 0.964);

    // Verifica que o adaptador canônico detecta e registra warning explícito sem mascarar/normalizar silenciosamente
    const spot17 = rawSpots.find((s) => s.id === "17bb_sb_vs_utg_rfi")!;
    const canonical17 = adaptLegacyRangeSpotToCanonical(spot17);
    assert.ok(
      canonical17.referenceStrategy.validationWarnings?.some(
        (w) => w.includes("AA") && w.includes("0.964"),
      ),
      "Deve registrar warning de soma 0.964 para AA em 17bb_sb_vs_utg_rfi",
    );

    const spot20 = rawSpots.find((s) => s.id === "20bb_btn_vs_mp_rfi")!;
    const canonical20 = adaptLegacyRangeSpotToCanonical(spot20);
    assert.ok(
      canonical20.referenceStrategy.validationWarnings?.some(
        (w) => w.includes("KK") && w.includes("0.964"),
      ),
      "Deve registrar warning de soma 0.964 para KK em 20bb_btn_vs_mp_rfi",
    );
  });
});

describe("ETAPA 1 — Testes Ampliados: Card Removal, Ações Legais, All-In, Side Pots, ICM e EV Loss", () => {
  it("12. Card Removal: assimetria entre blockers em pares/suited/offsuit e conservação global de combos com board completo (5 cartas)", () => {
    // 1 carta morta de Ás (As) reduz:
    // - AA de 6 para 3 combos (-50%)
    // - AKs de 4 para 3 combos (-25%)
    // - AKo de 12 para 9 combos (-25%)
    assert.equal(getAvailableCombosForClass("AA", ["As"]).length, 3);
    assert.equal(getAvailableCombosForClass("AKs", ["As"]).length, 3);
    assert.equal(getAvailableCombosForClass("AKo", ["As"]).length, 9);

    // 1 Ás + 1 Rei do mesmo naipe (As, Ks):
    // - AKs perde apenas 1 combo (AsKs) -> restam 3 combos!
    // - AKo perde todos os combos com As (3) e todos com Ks (3) -> restam 6 combos!
    assert.equal(getAvailableCombosForClass("AKs", ["As", "Ks"]).length, 3);
    assert.equal(getAvailableCombosForClass("AKo", ["As", "Ks"]).length, 6);

    // 1 Ás + 1 Rei de naipes diferentes (As, Kh):
    // - AKs perde AsKs e AhKh -> restam 2 combos
    // - AKo perde AsKc, AsKd, AsKh, AcKh, AdKh (AsKh é contado uma vez) -> 12 - 5 = 7 combos
    assert.equal(getAvailableCombosForClass("AKs", ["As", "Kh"]).length, 2);
    assert.equal(getAvailableCombosForClass("AKo", ["As", "Kh"]).length, 7);

    // Com 5 cartas no board + 2 cartas do herói = 7 cartas mortas -> restam C(45, 2) = 990 combos totais
    const countsWith7Dead = countAvailableCombosByClass([
      "As",
      "Kd",
      "Qh",
      "Jc",
      "Ts",
      "9h",
      "2d",
    ]);
    assert.equal(countsWith7Dead.totalCombos, (45 * 44) / 2); // 990 combos
    assert.equal(Object.keys(countsWith7Dead.byClass).length, getAll169Hands().length);
  });

  it("13. Ações Legais e All-In: short-stack < minRaise (incomplete raise), exatamente = callAmount, e check/bet postflop", () => {
    // Caso A: Jogador tem stack restante (1.5bb) menor que o necessário para cobrir a aposta (currentBetBb = 3bb, investido = 0.5bb -> rawToCall = 2.5bb)
    // Só pode Fold ou All-in Call parcial (1.5bb)
    const shortCallState: GameState = {
      format: "MTT",
      variant: "NLHE",
      playersInitial: 2,
      street: "PREFLOP",
      smallBlindBb: 0.5,
      bigBlindBb: 1,
      anteBbPerPlayer: 0,
      potBb: 4.5,
      currentBetBb: 3,
      minRaiseIncrementBb: 2,
      board: [],
      heroPosition: "SB",
      heroCards: ["As", "Kd"],
      actingPosition: "SB",
      players: [
        {
          position: "BTN/SB",
          stackBb: 27,
          investedTotalBb: 3,
          investedStreetBb: 3,
          folded: false,
          allIn: false,
          isHero: false,
        },
        {
          position: "SB",
          stackBb: 1.5,
          investedTotalBb: 0.5,
          investedStreetBb: 0.5,
          folded: false,
          allIn: false,
          isHero: true,
        },
      ],
      actionHistory: [],
    };
    assert.equal(validateGameState(shortCallState).valid, true);
    const shortCallActions = getLegalActions(shortCallState, [6, 9]);
    assert.deepEqual(
      shortCallActions.map((a) => a.kind),
      ["fold", "allin"],
    );
    assert.equal(shortCallActions[1].amountBb, 1.5);
    assert.equal(isLegalActionId(shortCallState, "raise_6bb", [6, 9]), false);

    // Caso B: Jogador tem mais fichas que o call (rawToCall = 2.5bb, stackBb = 3.5bb -> total 4.0bb),
    // mas menos que minTotalBet (currentBet 3 + minRaiseIncrement 2 = 5.0bb).
    // Pode dar fold, call (2.5bb) ou allin incompleto (4.0bb total), mas NÃO raise normal
    const incompleteRaiseState: GameState = {
      ...shortCallState,
      players: [
        shortCallState.players[0],
        {
          ...shortCallState.players[1],
          stackBb: 3.5,
        },
      ],
    };
    const incompleteActions = getLegalActions(incompleteRaiseState, [5, 7]);
    assert.deepEqual(
      incompleteActions.map((a) => a.kind),
      ["fold", "call", "allin"],
    );
    assert.equal(incompleteActions[1].amountBb, 2.5);
    assert.equal(incompleteActions[2].id, "allin_4bb");

    // Caso C: Postflop sem aposta (currentBetBb = 0) -> check, bet (custom), allin (fold e call proibidos)
    const postflopCheckState: GameState = {
      format: "CASH",
      variant: "NLHE",
      playersInitial: 2,
      street: "FLOP",
      smallBlindBb: 0.5,
      bigBlindBb: 1,
      anteBbPerPlayer: 0,
      potBb: 6,
      currentBetBb: 0,
      minRaiseIncrementBb: 1,
      board: ["As", "Kd", "2c"],
      heroPosition: "BB",
      heroCards: ["Qh", "Jh"],
      actingPosition: "BB",
      players: [
        {
          position: "BTN/SB",
          stackBb: 97,
          investedTotalBb: 3,
          investedStreetBb: 0,
          folded: false,
          allIn: false,
          isHero: false,
        },
        {
          position: "BB",
          stackBb: 97,
          investedTotalBb: 3,
          investedStreetBb: 0,
          folded: false,
          allIn: false,
          isHero: true,
        },
      ],
      actionHistory: [],
    };
    const postflopActions = getLegalActions(postflopCheckState, [2, 4.5]);
    assert.deepEqual(
      postflopActions.map((a) => a.kind),
      ["check", "bet", "bet", "allin"],
    );
    assert.equal(isLegalActionId(postflopCheckState, "fold"), false);
    assert.equal(isLegalActionId(postflopCheckState, "call_0"), false);
  });

  it("14. Side Pots complexos: 5 jogadores com 2 all-ins de mesmo stack, 1 fold com fichas mortas e 2 over-stacks", () => {
    // UTG: all-in por 10bb
    // MP: all-in por 10bb (empate de nível de all-in -> não cria camada duplicada)
    // CO: folded após investir 6bb (dead money entra integralmente no main pot)
    // BTN: ativo investiu 25bb
    // BB: ativo investiu 25bb
    const pots = computeSidePots([
      { position: "UTG", investedTotalBb: 10, folded: false },
      { position: "MP", investedTotalBb: 10, folded: false },
      { position: "CO", investedTotalBb: 6, folded: true },
      { position: "BTN", investedTotalBb: 25, folded: false },
      { position: "BB", investedTotalBb: 25, folded: false },
    ]);

    // Camadas até 10bb têm os mesmos elegíveis [UTG, MP, BTN, BB] e são mescladas:
    // 4 * 10bb + 6bb (CO folded) = 46bb
    // Camada de 10bb a 25bb: BTN e BB contribuem 15bb cada = 30bb; elegíveis: [BTN, BB]
    assert.equal(pots.length, 2);
    assert.equal(pots[0].amountBb, 46);
    assert.deepEqual(pots[0].eligiblePositions, ["UTG", "MP", "BTN", "BB"]);
    assert.equal(pots[1].amountBb, 30);
    assert.deepEqual(pots[1].eligiblePositions, ["BTN", "BB"]);
  });

  it("15. ICM, Bubble Factor e PKO: concavidade do valor das fichas, WTA (BF = 1.0), stack zero e guarda PKO", () => {
    // 1. Em estrutura Winner-Take-All (100% para o 1º), $EV é proporcional às fichas e Bubble Factor = 1.0
    const wtaPayouts = [1000, 0, 0];
    const wtaRes = calculateIcm([5000, 3000, 2000], wtaPayouts);
    assert.ok(Math.abs(wtaRes.icmValues[0] - 500) < 1e-6);
    assert.ok(Math.abs(wtaRes.icmValues[1] - 300) < 1e-6);
    assert.ok(Math.abs(wtaRes.icmValues[2] - 200) < 1e-6);

    // Se P1 (3000) dobra contra P0 (5000) em WTA:
    // Win -> stacks [2000, 6000, 2000] -> $EV(P1) = 600
    // Lose -> stacks [8000, 0, 2000] -> $EV(P1) = 0
    // Fold -> $EV(P1) = 300
    const wtaBf = calculateBubbleFactor(600, 0, 300);
    assert.ok(Math.abs(wtaBf.bubbleFactor - 1.0) < 1e-6);
    assert.ok(Math.abs(wtaBf.requiredEquityAgainstEqualStack - 0.5) < 1e-6);

    // 2. Concavidade do ICM em premiação distribuída (dobrar as fichas < dobrar o $EV)
    const stdPayouts = [500, 300, 200];
    const equalIcm = calculateIcm([3000, 3000, 3000], stdPayouts);
    assert.ok(Math.abs(equalIcm.icmValues[0] - 333.3333) < 0.01);

    const doubleStackIcm = calculateIcm([6000, 0, 3000], stdPayouts);
    // Ao eliminar um jogador e dobrar o stack de 3000 para 6000:
    // Ganho de $EV (433.33 - 333.33 = +100) é menor que a perda de $EV se cair em 3º (333.33 - 200 = -133.33)
    const gain = doubleStackIcm.icmValues[0] - equalIcm.icmValues[0];
    const loss = equalIcm.icmValues[0] - 200;
    assert.ok(loss > gain, "Em ICM com múltiplos prêmios, a perda de $EV ao cair excede o ganho ao dobrar");
    const stdBf = calculateBubbleFactor(doubleStackIcm.icmValues[0], 200, equalIcm.icmValues[0]);
    assert.ok(Math.abs(stdBf.bubbleFactor - 4 / 3) < 1e-4);

    // 3. Guarda anti-PKO e cálculo de PKO Bounty Power
    assert.throws(() => assertNotPkoForStandardIcm("PKO"), /PKO/i);
    const pkoCovered = evaluatePkoBountyModel({
      potWithoutBountyChips: 20,
      callAmountChips: 18,
      villainBountyUsd: 75,
      startingStackChips: 50,
      startingBountyUsd: 25,
      heroCoversVillain: true,
      bountyChipFactor: 0.35,
    });
    const pkoUncovered = evaluatePkoBountyModel({
      potWithoutBountyChips: 20,
      callAmountChips: 18,
      villainBountyUsd: 75,
      startingStackChips: 50,
      startingBountyUsd: 25,
      heroCoversVillain: false,
      bountyChipFactor: 0.35,
    });
    assert.ok(pkoCovered.bountyChipEquivalent > 0);
    assert.equal(pkoUncovered.bountyChipEquivalent, 0);
    assert.ok(pkoCovered.adjustedRequiredEquity < pkoUncovered.adjustedRequiredEquity);
  });

  it("16. Matemática fundamental e EV Loss: identidade FE + MDF = 1, EV Loss em $EV vs bbEV e aderência de estratégia mista", () => {
    // Identidade fundamental para qualquer tamanho de aposta B no pote P:
    // PotOdds(P, B, C=B) = B / (P + 2B)
    // BreakevenFoldEquity(P, B) = B / (P + B)
    // MDF(P, B) = P / (P + B) -> BreakevenFoldEquity + MDF = 100%
    for (const ratio of [0.25, 0.33, 0.5, 0.75, 1.0, 1.5, 2.0]) {
      const pot = 100;
      const bet = pot * ratio;
      const fe = calculateBluffBreakevenFoldEquity(pot, bet);
      const mdf = calculateSimplifiedMdf(pot, bet);
      assert.ok(
        Math.abs(fe.requiredFoldEquity + mdf.mdf - 1.0) < 1e-9,
        `FE + MDF deve somar 1.0 para bet ratio ${ratio}`,
      );
      const po = calculatePotOdds(pot, bet, bet);
      assert.ok(Math.abs(po.requiredEquity - bet / (pot + 2 * bet)) < 1e-9);
    }

    // Avaliação de EV Loss em $EV (ICM spot)
    const icmSpot: CanonicalSpot = {
      spotId: "icm_test_spot",
      name: "Bolha FT - SB vs BTN Shove",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 6,
      street: "PREFLOP",
      board: [],
      heroPosition: "SB",
      villainPosition: "BTN",
      heroCards: ["As", "Kd"],
      effectiveStackBb: 20,
      anteBbPerPlayer: 0.125,
      potBb: 22.25,
      legalActions: [
        { name: "Fold", color: "#3b82f6" },
        { name: "Allin", color: "#ef4444" },
      ],
      referenceStrategy: {
        status: "DIDACTIC_DEMO",
        evUnit: "$EV",
        actionFrequencies: { Fold: 0.85, Allin: 0.15 },
        actionEv: { Fold: 0.0, Allin: -1.45 },
        solutionSource: null,
        assumptions: null,
        assumptionsHash: null,
      },
      lesson: {
        trackId: "PREFLOP_VS_RFI",
        concepts: ["ICM", "Bubble Factor"],
        interpretationSource: "Didactic test",
        conceptualGuidance: "Teste de EV Loss em $EV.",
      },
    };

    // Regra de Integridade: DIDACTIC_DEMO bloqueia pontuação de EV loss GTO
    const evalDidactic = evaluateDrillDecision({
      spot: icmSpot,
      handClass: "AKo",
      chosenAction: "Allin",
    });
    assert.equal(evalDidactic.gtoScored, false);
    assert.equal(evalDidactic.evLoss, null);

    // Somente status VERIFIED computa EV Loss em $EV
    const verifiedIcmSpot: CanonicalSpot = {
      ...icmSpot,
      referenceStrategy: {
        ...icmSpot.referenceStrategy,
        status: "VERIFIED",
      },
    };
    const evalUsd = evaluateDrillDecision({
      spot: verifiedIcmSpot,
      handClass: "AKo",
      chosenAction: "Allin",
    });
    assert.equal(evalUsd.gtoScored, true);
    assert.equal(evalUsd.classification, "low_freq_acceptable");
    assert.equal(evalUsd.evLoss, 1.45);
    assert.equal(evalUsd.evUnit, "$EV");

    // Aderência de estratégia mista: distribuição idêntica tem adherencePct = 100%
    const perfectStats = computeMixedAdherenceStats([
      {
        spotId: "s1",
        hand: "AA",
        chosenAction: "Raise",
        targetDistribution: { Raise: 0.75, Call: 0.25 },
        evLoss: 0,
        timestamp: 1,
      },
      {
        spotId: "s1",
        hand: "AA",
        chosenAction: "Raise",
        targetDistribution: { Raise: 0.75, Call: 0.25 },
        evLoss: 0,
        timestamp: 2,
      },
      {
        spotId: "s1",
        hand: "AA",
        chosenAction: "Raise",
        targetDistribution: { Raise: 0.75, Call: 0.25 },
        evLoss: 0,
        timestamp: 3,
      },
      {
        spotId: "s1",
        hand: "AA",
        chosenAction: "Call",
        targetDistribution: { Raise: 0.75, Call: 0.25 },
        evLoss: 0,
        timestamp: 4,
      },
    ]);
    assert.equal(perfectStats.adherencePct, 100);
  });
});
