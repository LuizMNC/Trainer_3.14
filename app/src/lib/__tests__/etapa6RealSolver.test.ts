import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assertSpotAllowedInTechnicalGtoMode,
  compareActionSizings,
  computeSha256Hex,
  evaluateDrillDecision,
  getAvailableCombosForClass,
  importExternalSolverSolution,
  importTexasSolverBundle,
  parseDesktopPostflopCsvToPayload,
  pickDrillHand,
  POSITIONS_8MAX,
  SOLVER_ADAPTER_VERSION,
  type CanonicalSpot,
  type ExternalSolverPayloadV1,
  type RangeSpot,
  type TexasSolverBundleV1,
} from "../poker.ts";

describe("ETAPA 6 — Solução GTO Real TexasSolver, Integridade e Desktop Postflop EV", () => {
  const bundlePath = path.resolve(
    process.cwd(),
    "src/data/verified_ahkd7c_texassolver.json",
  );
  const rawBundle = JSON.parse(readFileSync(bundlePath, "utf8")) as TexasSolverBundleV1;

  it("validação real do dump TexasSolver v0.2.0 (BTN vs BB SRP 30BB Ah Kd 7c)", () => {
    const res = importTexasSolverBundle(rawBundle);
    assert.equal(res.ok, true, `Erros inesperados: ${res.errors.join("; ")}`);
    assert.equal(res.status, "VERIFIED");
    assert.ok(res.assumptionsHash && res.assumptionsHash.startsWith("fnv1a_"));

    const spot = res.spot;
    assert.equal(spot.street, "FLOP");
    assert.deepEqual(spot.board, ["Ah", "Kd", "7c"]);
    assert.equal(spot.potBb, 5.7);
    assert.equal(spot.effectiveStackBb, 27.9);
    assert.equal(spot.heroPosition, "BTN");
    assert.equal(spot.villainPosition, "BB");

    // Proveniência, hashes criptográficos, convergência e preservação estrita de matrixEv = null
    assert.equal(spot.referenceStrategy.evUnit, null);
    assert.equal(spot.referenceStrategy.matrixEv, null);
    assert.equal(spot.referenceStrategy.solutionSource?.evAvailable, false);
    assert.match(spot.referenceStrategy.solutionSource?.fileSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.match(spot.referenceStrategy.solutionSource?.configSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.ok(
      typeof spot.referenceStrategy.assumptions?.achievedExploitabilityPct === "number" &&
        spot.referenceStrategy.assumptions.achievedExploitabilityPct < 0.5,
      "Exploitability atingida deve estar abaixo de 0.5%",
    );

    // 101 classes do range 30bb_rfi_btn e remoção exata das cartas do board em combos
    const freqMap = spot.referenceStrategy.matrixFrequencies!;
    assert.equal(Object.keys(freqMap).length, 101);
    const combos = spot.referenceStrategy.comboBreakdown!;
    assert.equal(Object.keys(combos.AKs).length, 2, "Ah e Kd estão no board -> restam 2 combos de AKs (AsKs, AcKc)");
    assert.equal(combos.AKs.AhKh, undefined);
    assert.equal(combos.AKs.AdKd, undefined);
    assert.equal(Object.keys(combos.AA).length, 3, "Ah no board -> restam 3 combos de AA");

    for (const [hc, cMap] of Object.entries(combos)) {
      const expected = getAvailableCombosForClass(hc, ["Ah", "Kd", "7c"]);
      assert.equal(Object.keys(cMap).length, expected.length);
    }

    // Liberado no Modo GTO Técnico para estudar frequências reais, porém EV loss fica estritamente null
    const gate = assertSpotAllowedInTechnicalGtoMode(spot);
    assert.equal(gate.allowed, true);

    const evalRes = evaluateDrillDecision({
      spot,
      handClass: "AA",
      chosenAction: "Bet_33pct",
      mode: "GTO_TECHNICAL",
    });
    assert.equal(evalRes.gtoScored, true);
    assert.equal(evalRes.evScored, false);
    assert.equal(evalRes.evLoss, null);
    assert.equal(evalRes.evUnit, null);
    assert.ok(evalRes.evUnavailableReason?.includes("TexasSolver"));

    // pickDrillHand só sorteia mãos que realmente chegam ao flop no range do BTN (nunca 72o)
    const legacyProxy: RangeSpot = {
      id: spot.spotId,
      name: spot.name,
      stackBb: spot.effectiveStackBb,
      heroPosition: spot.heroPosition,
      villainPosition: spot.villainPosition,
      spotType: "rfi",
      source: "TexasSolver",
      actions: spot.legalActions.map((a) => ({ name: a.name, color: a.color, pct: 0 })),
      matrix: freqMap,
    };
    for (let i = 0; i < 40; i++) {
      const picked = pickDrillHand(legacyProxy, "mixed");
      assert.ok(freqMap[picked] !== undefined, `Hand sorteada '${picked}' deve estar no range pós-flop do herói`);
    }
  });

  it("rejeita bundle TexasSolver adulterado (hash inválido, carta morta no board ou matrixEv injetada)", () => {
    const tamperedHash = structuredClone(rawBundle);
    tamperedHash.manifest.hashes.rawOutputSha256 = "not_sha256";
    const rHash = importTexasSolverBundle(tamperedHash);
    assert.equal(rHash.ok, false);
    assert.equal(rHash.status, "UNSOLVED");

    const tamperedEv = structuredClone(rawBundle) as unknown as Record<string, unknown>;
    tamperedEv.matrixEv = { AA: { Check: 1, Bet_33pct: 2, Bet_75pct: 2 } };
    const rEv = importTexasSolverBundle(tamperedEv as Partial<TexasSolverBundleV1>);
    assert.equal(rEv.ok, false);
    assert.equal(rEv.status, "UNSOLVED");

    const tamperedCombo = structuredClone(rawBundle);
    tamperedCombo.comboBreakdown.AKs["AhKh"] = { Check: 0, Bet_33pct: 0.5, Bet_75pct: 0.5 };
    const rCombo = importTexasSolverBundle(tamperedCombo);
    assert.equal(rCombo.ok, false);
    assert.equal(rCombo.status, "UNSOLVED");
  });

  it("rejeita payloads sem SHA-256, sem ranges, ação ilegal vs toCallBb ou Modo GTO Técnico sem hash", () => {
    const baseValid: ExternalSolverPayloadV1 = {
      schemaVersion: SOLVER_ADAPTER_VERSION,
      spotId: "neg_test_base",
      spotName: "Negative Validation Fixture",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      effectiveStackBb: 27.9,
      blinds: { sbBb: 0.5, bbBb: 1.0 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 8,
      seats: POSITIONS_8MAX.map((p, idx) => ({ seatIndex: idx, position: p, stackBb: 30 })),
      heroPosition: "BTN",
      villainPosition: "BB",
      actionHistory: [
        { street: "PREFLOP", position: "BTN", action: "Raise", sizeBb: 2.1 },
        { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
        { street: "FLOP", position: "BB", action: "Check" },
      ],
      street: "FLOP",
      board: ["Ah", "Kd", "7c"],
      potSizeBb: 5.7,
      toCallBb: 0,
      sizings: [
        { actionName: "Bet_33pct", color: "#f43f5e", sizeBb: 1.9, sizePctPot: 33.3 },
        { actionName: "Check", color: "#22c55e", sizeBb: 0, sizePctPot: 0 },
      ],
      evUnit: "bbEV",
      icmMode: "chipEV",
      ranges: {
        heroRangeDescription: "30bb_rfi_btn",
        villainRangeDescription: "30bb_bb_vs_btn_rfi",
        sourceReference: "ranges_gto.json",
      },
      provenance: {
        solverName: "Desktop Postflop",
        solverVersion: "0.2.7",
        abstraction: "Flop test",
        convergenceTargetPct: 0.5,
        achievedExploitabilityPct: 0.4,
        createdAtIso: "2026-11-12T20:00:00.000Z",
        license: "AGPL-3.0",
        fileOrReference: "desktop_postflop_ahkd7c.csv",
        fileSha256: "e".repeat(64),
      },
      scope: "EXPLICIT_HAND_SUBSET",
      matrixFrequencies: { AA: { Bet_33pct: 0.7, Check: 0.3 } },
      matrixEv: { AA: { Bet_33pct: 4.15, Check: 4.13 } },
    };

    // 1. Falha quando toCallBb === 0 mas sizing ilegal 'Fold' está presente
    const illegalAction = importExternalSolverSolution({
      ...baseValid,
      sizings: [
        { actionName: "Fold", color: "#3b82f6" },
        { actionName: "Check", color: "#22c55e", sizeBb: 0 },
      ],
      matrixFrequencies: { AA: { Fold: 0.0, Check: 1.0 } },
      matrixEv: { AA: { Fold: 0.0, Check: 3.5 } },
    });
    assert.equal(illegalAction.ok, false);
    assert.equal(illegalAction.status, "UNSOLVED");

    // 2. Falha quando histórico pós-flop está vazio ou pot menor que blinds+antes
    const noHistory = importExternalSolverSolution({
      ...baseValid,
      actionHistory: [],
      potSizeBb: 1.5,
    });
    assert.equal(noHistory.ok, false);
    assert.equal(noHistory.status, "UNSOLVED");

    // 3. Falha quando matrixEv é removida
    const noEv = importExternalSolverSolution({
      ...baseValid,
      matrixEv: undefined as unknown as Record<string, Record<string, number>>,
    });
    assert.equal(noEv.ok, false);
    assert.equal(noEv.status, "UNSOLVED");

    // 4. Modo GTO Técnico recusa objeto adulterado com status VERIFIED mas sem hash/fonte
    const forgedSpot: CanonicalSpot = {
      ...importExternalSolverSolution(baseValid).spot,
      referenceStrategy: {
        ...importExternalSolverSolution(baseValid).spot.referenceStrategy,
        assumptionsHash: null,
      },
    };
    assert.equal(assertSpotAllowedInTechnicalGtoMode(forgedSpot).allowed, false);
  });

  it("converte CSV do Desktop Postflop (com Action % e Action EV), valida SHA-256 e calcula EV loss real", async () => {
    // Fixture determinística no formato exato de ResultTable.vue do Desktop Postflop
    const sampleCsv = [
      "Hand,Weight,Combos,Equity,EV,EQR,Bet 4.3 %,Bet 4.3 EV,Bet 1.9 %,Bet 1.9 EV,Check %,Check EV",
      "AsAd,1.0,1,89.4,4.420,1.04,25.0,4.420,75.0,4.415,0.0,3.850",
      "AsAc,1.0,1,89.4,4.410,1.04,25.0,4.410,75.0,4.410,0.0,3.830",
      "AdAc,1.0,1,89.4,4.430,1.04,25.0,4.430,75.0,4.420,0.0,3.870",
      "72o,0.0,12,18.0,0.000,0.00,0.0,0.000,0.0,0.000,100.0,0.000",
    ].join("\n");

    const webSha = await computeSha256Hex(sampleCsv);
    const nodeSha = createHash("sha256").update(sampleCsv, "utf8").digest("hex");
    assert.equal(webSha, nodeSha);

    const parsed = parseDesktopPostflopCsvToPayload(sampleCsv, {
      spotId: "dp_csv_ahkd7c_aa_fixture",
      spotName: "Desktop Postflop CSV Ah Kd 7c",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: "MTT",
      effectiveStackBb: 27.9,
      blinds: { sbBb: 0.5, bbBb: 1.0 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 8,
      seats: POSITIONS_8MAX.map((p, idx) => ({ seatIndex: idx, position: p, stackBb: 30 })),
      heroPosition: "BTN",
      villainPosition: "BB",
      actionHistory: [
        { street: "PREFLOP", position: "BTN", action: "Raise", sizeBb: 2.1 },
        { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
        { street: "FLOP", position: "BB", action: "Check" },
      ],
      street: "FLOP",
      board: ["Ah", "Kd", "7c"],
      potSizeBb: 5.7,
      toCallBb: 0,
      solverVersion: "0.2.7",
      abstraction: "Desktop Postflop 16-bit CFR",
      convergenceTargetPct: 0.5,
      achievedExploitabilityPct: 0.35,
      createdAtIso: "2026-11-12T20:30:00.000Z",
      fileOrReference: "desktop_postflop_ahkd7c.csv",
      fileSha256: webSha,
      heroRangeRef: "30bb_rfi_btn",
      villainRangeRef: "30bb_bb_vs_btn_rfi",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const imported = importExternalSolverSolution(parsed.payload);
    assert.equal(imported.ok, true, `Erros: ${imported.errors.join("; ")}`);
    assert.equal(imported.status, "VERIFIED");

    // Deve excluir '72o' com Weight=0 e agregar AA dos 3 combos reais restantes
    assert.equal(imported.spot.referenceStrategy.matrixFrequencies?.["72o"], undefined);
    assert.ok(imported.spot.referenceStrategy.matrixEv?.AA);

    const bestEval = evaluateDrillDecision({
      spot: imported.spot,
      handClass: "AA",
      chosenAction: "Bet_75pct",
      mode: "GTO_TECHNICAL",
    });
    assert.equal(bestEval.gtoScored, true);
    assert.equal(bestEval.evScored, true);
    assert.equal(bestEval.evLoss, 0);

    const badCheck = evaluateDrillDecision({
      spot: imported.spot,
      handClass: "AA",
      chosenAction: "Check",
      mode: "GTO_TECHNICAL",
    });
    assert.equal(badCheck.gtoScored, true);
    assert.equal(badCheck.evScored, true);
    assert.ok(badCheck.evLoss !== null && badCheck.evLoss > 0.5, `EV loss esperado > 0.5 bbEV, obtido ${badCheck.evLoss}`);
    assert.equal(badCheck.evUnit, "bbEV");

    const sizingCmp = compareActionSizings(imported.spot, "AA");
    assert.equal(sizingCmp.available, true);
    assert.equal(sizingCmp.options.length, 3);
  });
});
