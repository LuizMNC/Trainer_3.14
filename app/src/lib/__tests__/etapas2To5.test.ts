import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AdaptiveExerciseRecord,
  classifyAndRankLeaks,
  classifyAttemptLeak,
  computeDimensionalProgress,
  computeSpacedRepetitionSchedule,
} from "../poker/adaptiveDiagnostics.ts";
import { parseCard } from "../poker/cards.ts";
import {
  assertSpotAllowedInTechnicalGtoMode,
  evaluateDrillDecision,
} from "../poker/drillEvaluator.ts";
import {
  calculatePolarizedRiverBluffFraction,
  createSeededRng,
} from "../poker/mathEngine.ts";
import {
  getLessonBySpotNumber,
  getLessonsByTrackId,
  REGLIFE_18_LESSONS,
  REGLIFE_CATALOG_METADATA,
  REGLIFE_SUPPLEMENTAL_VIDEOS,
} from "../poker/reglifeCatalog.ts";
import {
  buildVerifiedSolverReferenceCatalog,
  type ExternalSolverPayloadV1,
  importExternalSolverSolution,
  SOLVER_ADAPTER_VERSION,
} from "../poker/solverAdapter.ts";
import {
  analyzeSpotReasoning,
  compareActionSizings,
} from "../poker/spotReasoning.ts";
import {
  CURRICULUM_MODULES,
  getDidacticAndUnsolvedSpots,
} from "../curriculum.ts";

describe("ETAPA 2 — Integração do Currículo RegLife (18 Aulas + 7 Vídeos Complementares)", () => {
  it("17. preserva as 7 trilhas fundamentais e vincula as 18 aulas da série RegLife", () => {
    assert.equal(CURRICULUM_MODULES.length, 7);
    assert.equal(REGLIFE_18_LESSONS.length, 18);
    assert.equal(REGLIFE_SUPPLEMENTAL_VIDEOS.length, 7);
    assert.equal(REGLIFE_CATALOG_METADATA.seriesTotalLessons, 18);
    assert.equal(REGLIFE_CATALOG_METADATA.supplementalVideosCount, 7);

    const validTrackIds = new Set(CURRICULUM_MODULES.map((t) => t.id));
    for (let i = 1; i <= 18; i++) {
      const lesson = getLessonBySpotNumber(i);
      assert.ok(lesson, `Aula Spot #${i} deve existir`);
      assert.ok(
        validTrackIds.has(lesson.trackId),
        `Aula #${i} deve apontar para trilha válida`,
      );
      assert.ok(lesson.coreConcept.length > 10);
      assert.ok(lesson.url.startsWith("https://www.youtube.com/watch?v="));
      assert.ok(lesson.examples.length >= 1);
      assert.equal(lesson.quiz.options.length, 4);
      assert.ok(lesson.exercises.length >= 1);

      // Separação epistêmica obrigatória: educacional vs heurística explorativa vs especificação GTO
      assert.ok(lesson.separationOfDomains.educationalConcept.length > 10);
      assert.ok(lesson.separationOfDomains.exploitativeHeuristic.length > 10);
      assert.ok(lesson.separationOfDomains.mathematicalGtoSpec.length > 10);

      // Nenhum exercício educacional apresenta modo GTO_TECHNICAL sem solver real
      for (const ex of lesson.exercises) {
        assert.equal(
          ex.recommendedMode,
          "LEARNING",
          `Exercício ${ex.id} da Aula #${i} deve operar em modo LEARNING`,
        );
      }
    }

    // Confirma que todas as 7 trilhas possuem aulas vinculadas
    for (const track of CURRICULUM_MODULES) {
      const lessons = getLessonsByTrackId(track.id);
      assert.ok(
        lessons.length >= 1,
        `Trilha ${track.id} deve ter ao menos 1 aula RegLife vinculada`,
      );
    }
  });

  it("18. identifica estritamente as 15 aulas com transcrição verificada e as 3 sem transcrição (Spots 01, 07 e 08)", () => {
    const analyzed = REGLIFE_18_LESSONS.filter((l) => l.hasVerifiedTranscript);
    const unavailable = REGLIFE_18_LESSONS.filter((l) => !l.hasVerifiedTranscript);

    assert.equal(analyzed.length, 15);
    assert.equal(unavailable.length, 3);

    const unavailableNumbers = unavailable
      .map((l) => l.spotNumber)
      .sort((a, b) => a - b);
    assert.deepEqual(unavailableNumbers, [1, 7, 8]);

    const unavailableVideoIds = unavailable.map((l) => l.videoId);
    assert.deepEqual(unavailableVideoIds, [
      "_Wl17geMXmc",
      "teUFXaRa27E",
      "CUNOCNobeZo",
    ]);

    for (const u of unavailable) {
      assert.equal(u.transcriptStatus, "indisponível");
      assert.equal(u.evidenceType, "METADATA_HYPOTHESIS");
      assert.equal(u.timestamps.length, 0);
      assert.ok(
        u.unverifiedWarning &&
          u.unverifiedWarning.toLowerCase().includes("transcrição"),
        `Spot #${u.spotNumber} sem transcrição deve exibir alerta explícito`,
      );
    }

    for (const a of analyzed) {
      assert.equal(a.transcriptStatus, "analisada");
      assert.equal(a.evidenceType, "VIDEO_CONCEPT");
      assert.ok(
        a.timestamps.length >= 1,
        `Spot #${a.spotNumber} com transcrição analisada deve ter timestamps verificados`,
      );
    }
  });
});

describe("ETAPA 3 — Evolução do Treinador (Modos, RNG, Sizing Comparison e Raciocínio)", () => {
  it("19. separa Modo Aprendizagem de Modo GTO Técnico e bloqueia spots não verificados no Modo GTO Técnico", () => {
    const allCurriculumSpots = getDidacticAndUnsolvedSpots();
    const didacticSpot = allCurriculumSpots.find(
      (s) => s.referenceStrategy.status === "DIDACTIC_DEMO",
    )!;
    const unsolvedSpot = allCurriculumSpots.find(
      (s) => s.referenceStrategy.status === "UNSOLVED",
    )!;

    assert.ok(didacticSpot);
    assert.ok(unsolvedSpot);

    const checkDidactic = assertSpotAllowedInTechnicalGtoMode(didacticSpot);
    assert.equal(checkDidactic.allowed, false);
    assert.ok(checkDidactic.reason?.includes("DIDACTIC_DEMO"));

    const checkUnsolved = assertSpotAllowedInTechnicalGtoMode(unsolvedSpot);
    assert.equal(checkUnsolved.allowed, false);

    // Avaliar spot DIDACTIC_DEMO em modo LEARNING funciona como benchmark didático, mas NUNCA gera EV loss GTO
    const firstAction = didacticSpot.legalActions[0].name;
    const evalLearning = evaluateDrillDecision({
      spot: didacticSpot,
      handClass: "AA",
      chosenAction: firstAction,
      mode: "LEARNING",
    });
    assert.equal(evalLearning.strategyStatus, "DIDACTIC_DEMO");
    assert.equal(evalLearning.gtoScored, false);
    assert.equal(evalLearning.evLoss, null);
    assert.equal(evalLearning.bestEv, null);
    assert.equal(evalLearning.chosenEv, null);

    // Avaliar spot DIDACTIC_DEMO em modo GTO_TECHNICAL bloqueia pontuação GTO (gtoScored = false)
    const blockedInGto = evaluateDrillDecision({
      spot: didacticSpot,
      handClass: "AA",
      chosenAction: firstAction,
      mode: "GTO_TECHNICAL",
    });
    assert.equal(blockedInGto.gtoScored, false);
    assert.equal(blockedInGto.classification, "unsolved");
    assert.ok(blockedInGto.headline.includes("BLOQUEADO NO MODO GTO TÉCNICO"));

    // Importar um dump válido de solver externo gera status VERIFIED e permite pontuação GTO_TECHNICAL
    const externalVerifiedRes = importExternalSolverSolution({
      schemaVersion: SOLVER_ADAPTER_VERSION,
      spotId: "ext_verified_flop_test_v1",
      spotName: "[EXT SOLVER] Flop Ah Kd 7c BTN vs BB",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      effectiveStackBb: 27.9,
      blinds: { sbBb: 0.5, bbBb: 1 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 2,
      seats: [
        { seatIndex: 0, position: "BTN/SB", stackBb: 27.9 },
        { seatIndex: 1, position: "BB", stackBb: 27.9 },
      ],
      heroPosition: "BTN/SB",
      villainPosition: "BB",
      actionHistory: [
        { street: "PREFLOP", position: "BTN/SB", action: "Raise", sizeBb: 2.1 },
        { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
        { street: "FLOP", position: "BB", action: "Check" },
      ],
      street: "FLOP",
      board: ["Ah", "Kd", "7c"],
      potSizeBb: 5.7,
      toCallBb: 0,
      sizings: [
        { actionName: "Bet_75pct", color: "#dc2626", sizePctPot: 75 },
        { actionName: "Bet_33pct", color: "#f43f5e", sizePctPot: 33 },
        { actionName: "Check", color: "#22c55e", sizeBb: 0 },
      ],
      evUnit: "bbEV",
      icmMode: "chipEV",
      ranges: {
        heroRangeDescription: "30bb_rfi_btn Raise (101 classes)",
        villainRangeDescription: "30bb_bb_vs_btn_rfi Call (132 classes)",
        sourceReference: "app/src/data/ranges_gto.json",
      },
      provenance: {
        solverName: "PioSOLVER",
        solverVersion: "2.0.9",
        abstraction: "HU Flop AhKd7c exact cfr dump",
        convergenceTargetPct: 0.1,
        achievedExploitabilityPct: 0.04,
        createdAtIso: "2026-11-12T00:00:00.000Z",
        license: "User Local Export",
        fileOrReference: "piosolver_ahkd7c_subset.json",
        fileSha256: "c".repeat(64),
      },
      scope: "EXPLICIT_HAND_SUBSET",
      matrixFrequencies: {
        AA: { Bet_75pct: 0.38, Bet_33pct: 0.62, Check: 0 },
      },
      matrixEv: {
        AA: { Bet_75pct: 4.19, Bet_33pct: 4.18, Check: 3.45 },
      },
    });
    assert.equal(externalVerifiedRes.ok, true);
    const verifiedSpot = externalVerifiedRes.spot;
    const checkVerified = assertSpotAllowedInTechnicalGtoMode(verifiedSpot);
    assert.equal(checkVerified.allowed, true);

    const evalVerified = evaluateDrillDecision({
      spot: verifiedSpot,
      handClass: "AA",
      chosenAction: "Bet_75pct",
      mode: "GTO_TECHNICAL",
    });
    assert.equal(evalVerified.strategyStatus, "VERIFIED");
    assert.equal(evalVerified.gtoScored, true);
    assert.equal(evalVerified.evLoss, 0);
    assert.equal(evalVerified.classification, "valid_mixed");
  });

  it("20. suporta randomizador determinístico (createSeededRng) e fração de blefe polarizado no river", () => {
    const rngA = createSeededRng("reglife-seed-42");
    const rngB = createSeededRng("reglife-seed-42");

    const seqA = [rngA.nextRoll100(), rngA.nextRoll100(), rngA.nextRoll100()];
    const seqB = [rngB.nextRoll100(), rngB.nextRoll100(), rngB.nextRoll100()];
    assert.deepEqual(seqA, seqB);
    for (const r of seqA) {
      assert.ok(r >= 1 && r <= 100);
    }

    // Pot-size bet no river (B = P): blefe polarizado = B / (P + 2B) = 1 / 3 = 33.33%
    const polarPot = calculatePolarizedRiverBluffFraction(10, 10);
    assert.equal(polarPot.bluffFractionPct, 33.33);
    assert.equal(polarPot.valueFractionPct, 66.67);
    assert.equal(polarPot.valueToBluffRatio, 2);
  });

  it("21. compara sizings apenas para spots VERIFIED e distingue combinatória exata de blockers de modelos heurísticos", () => {
    const reclassifiedCatalog = buildVerifiedSolverReferenceCatalog();
    const flopDemoSpot = reclassifiedCatalog.find(
      (s) => s.spotId === "verified_postflop_btn_vs_bb_ahkd7c_v1",
    );
    assert.ok(flopDemoSpot);
    assert.equal(flopDemoSpot.referenceStrategy.status, "DIDACTIC_DEMO");

    // Como o spot do catálogo padrão é DIDACTIC_DEMO, compareActionSizings bloqueia comparação numérica de EV
    const demoSizingReport = compareActionSizings(flopDemoSpot, "AA");
    assert.equal(demoSizingReport.available, false);

    // Quando importamos solução VERIFIED real, compareActionSizings calcula ΔEV corretamente
    const externalVerifiedRes = importExternalSolverSolution({
      schemaVersion: SOLVER_ADAPTER_VERSION,
      spotId: "ext_verified_sizing_test_v1",
      spotName: "[EXT SOLVER] Flop Ah Kd 7c Sizing Test",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      effectiveStackBb: 27.9,
      blinds: { sbBb: 0.5, bbBb: 1 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 2,
      seats: [
        { seatIndex: 0, position: "BTN/SB", stackBb: 27.9 },
        { seatIndex: 1, position: "BB", stackBb: 27.9 },
      ],
      heroPosition: "BTN/SB",
      villainPosition: "BB",
      actionHistory: [
        { street: "PREFLOP", position: "BTN/SB", action: "Raise", sizeBb: 2.1 },
        { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
        { street: "FLOP", position: "BB", action: "Check" },
      ],
      street: "FLOP",
      board: ["Ah", "Kd", "7c"],
      potSizeBb: 5.7,
      toCallBb: 0,
      sizings: [
        { actionName: "Bet_75pct", color: "#dc2626", sizePctPot: 75 },
        { actionName: "Bet_33pct", color: "#f43f5e", sizePctPot: 33 },
        { actionName: "Check", color: "#22c55e", sizeBb: 0 },
      ],
      evUnit: "bbEV",
      icmMode: "chipEV",
      ranges: {
        heroRangeDescription: "30bb_rfi_btn Raise (101 classes)",
        villainRangeDescription: "30bb_bb_vs_btn_rfi Call (132 classes)",
        sourceReference: "app/src/data/ranges_gto.json",
      },
      provenance: {
        solverName: "PioSOLVER",
        solverVersion: "2.0.9",
        abstraction: "HU Flop AhKd7c exact cfr dump",
        convergenceTargetPct: 0.1,
        achievedExploitabilityPct: 0.04,
        createdAtIso: "2026-11-12T00:00:00.000Z",
        license: "User Local Export",
        fileOrReference: "piosolver_ahkd7c_subset.json",
        fileSha256: "c".repeat(64),
      },
      scope: "EXPLICIT_HAND_SUBSET",
      matrixFrequencies: {
        AA: { Bet_75pct: 0.38, Bet_33pct: 0.62, Check: 0 },
      },
      matrixEv: {
        AA: { Bet_75pct: 4.19, Bet_33pct: 4.18, Check: 3.45 },
      },
    });
    const sizingReport = compareActionSizings(externalVerifiedRes.spot, "AA");
    assert.equal(sizingReport.available, true);
    assert.equal(sizingReport.bestAction, "Bet_75pct");
    assert.ok(sizingReport.reSolveCaveat.includes("re-solve"));

    const checkOption = sizingReport.options.find(
      (o) => o.actionName === "Check",
    );
    assert.ok(checkOption);
    assert.ok(checkOption.deltaEvFromBest > 0.1);

    // Combinatória exata no board Ah Kd 7c com herói segurando As 5s:
    // AA tem 2 Ases mortos (Ah no board + As na mão) -> resta apenas 1 combo (AdAc), -83%!
    const reasoning = analyzeSpotReasoning(flopDemoSpot, "A5s", [
      parseCard("As"),
      parseCard("5s"),
    ]);
    assert.equal(reasoning.blocker.combinatoricsType, "EXACT_COMBINATORICS");
    const aaBlocked = reasoning.blocker.blockedValueClasses.find((b) => b.hand === "AA")!;
    assert.equal(aaBlocked.remainingCombos, 1);
    assert.equal(aaBlocked.reductionPct, 83);
    assert.ok(reasoning.blocker.blockerSummary.includes("para 1 combos (-83%)"));

    assert.equal(reasoning.rangeAdvantage.computationType, "HEURISTIC_MODEL");
    assert.equal(reasoning.nutAdvantage.computationType, "HEURISTIC_MODEL");
    assert.equal(reasoning.equityRealization.computationType, "HEURISTIC_MODEL");
    assert.equal(reasoning.rangeAdvantage.leader, "HERO");
    assert.equal(reasoning.nutAdvantage.leader, "HERO");
    assert.ok(reasoning.equityRealization.estimatedFactor >= 1.0);
    assert.ok(
      reasoning.blocker.riverBluffCandidateHeuristic.epistemicWarning.startsWith(
        "HEURISTIC_EXPLANATION_ONLY",
      ),
    );
  });
});

describe("ETAPA 4 — Integração de Soluções e Auditoria dos 9 Spots Reclassificados", () => {
  it("22. comprova que os 9 spots sintéticos tiveram a classificação VERIFIED revogada (3 DIDACTIC_DEMO sem EV + 6 UNSOLVED) e rejeita proveniência interna/sintética", () => {
    const catalog = buildVerifiedSolverReferenceCatalog();
    assert.equal(catalog.length, 9);

    const verifiedCount = catalog.filter((s) => s.referenceStrategy.status === "VERIFIED").length;
    const didacticCount = catalog.filter((s) => s.referenceStrategy.status === "DIDACTIC_DEMO").length;
    const unsolvedCount = catalog.filter((s) => s.referenceStrategy.status === "UNSOLVED").length;

    assert.equal(verifiedCount, 0, "Nenhum spot sintético pode permanecer como VERIFIED");
    assert.equal(didacticCount, 3);
    assert.equal(unsolvedCount, 6);

    for (const spot of catalog) {
      assert.notEqual(spot.referenceStrategy.status, "VERIFIED");
      assert.equal(spot.referenceStrategy.matrixEv, null, "Nenhum dos 9 spots reclassificados pode manter matrixEv sintética");
      assert.equal(spot.referenceStrategy.evUnit, null);
    }
  });

  it("23. mantém payloads incompatíveis ou incompletos estritamente como UNSOLVED sem inventar ranges, frequências ou EVs", () => {
    const badPayload: ExternalSolverPayloadV1 = {
      schemaVersion: SOLVER_ADAPTER_VERSION,
      spotId: "broken_icm_spot",
      spotName: "Broken ICM Spot",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      effectiveStackBb: 20,
      blinds: { sbBb: 0.5, bbBb: 1 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 6,
      seats: [
        { seatIndex: 0, position: "BTN", stackBb: 20 },
        { seatIndex: 1, position: "SB", stackBb: 20 },
        { seatIndex: 2, position: "BB", stackBb: 20 },
      ],
      heroPosition: "BTN",
      villainPosition: "BB",
      actionHistory: [],
      street: "PREFLOP",
      board: [],
      potSizeBb: 2.5,
      toCallBb: 1,
      sizings: [
        { actionName: "Allin", color: "#ef4444", sizeBb: 20 },
        { actionName: "Fold", color: "#475569", sizeBb: 0 },
      ],
      evUnit: "bbEV", // ERRO: ICM exige $EV
      icmMode: "ICM",
      ranges: {
        heroRangeDescription: "BTN push range",
        villainRangeDescription: "BB call range",
        sourceReference: "hrc_broken_fixture",
      },
      provenance: {
        solverName: "HRC",
        solverVersion: "3.2",
        abstraction: "6max",
        convergenceTargetPct: 0.1,
        achievedExploitabilityPct: 0.05,
        createdAtIso: "2026-11-12T00:00:00Z",
        license: "Test",
        fileOrReference: "hrc_broken_export.json",
        fileSha256: "d".repeat(64),
      },
      scope: "EXPLICIT_HAND_SUBSET",
      matrixFrequencies: {
        AA: { Allin: 0.6, Fold: 0.2 }, // ERRO: soma = 0.80 != 1.0
      },
      matrixEv: {
        AA: { Allin: 5.0, Fold: 0.0 },
      },
    };

    const result = importExternalSolverSolution(badPayload);
    assert.equal(result.ok, false);
    assert.equal(result.status, "UNSOLVED");
    assert.equal(result.spot.referenceStrategy.status, "UNSOLVED");
    assert.equal(result.spot.referenceStrategy.matrixFrequencies, null);
    assert.equal(result.spot.referenceStrategy.matrixEv, null);
    assert.ok(result.errors.length >= 2);

    // Também rejeita proveniência sintética/interna mesmo se soma de frequências e EVs forem consistentes
    const syntheticAttempt = importExternalSolverSolution({
      ...badPayload,
      playersCount: 3,
      evUnit: "bbEV",
      icmMode: "chipEV",
      provenance: {
        ...badPayload.provenance,
        solverName: "SolverAdapter Reference Tree",
        fileOrReference: "solverAdapter.ts#synthetic_test",
      },
      matrixFrequencies: {
        AA: { Allin: 1.0, Fold: 0.0 },
      },
      matrixEv: {
        AA: { Allin: 5.0, Fold: 0.0 },
      },
    });
    assert.equal(syntheticAttempt.ok, false);
    assert.equal(syntheticAttempt.status, "UNSOLVED");
    assert.ok(
      syntheticAttempt.errors.some((e) =>
        e.includes("Proveniência sintética/genérica rejeitada"),
      ),
    );
  });
});

describe("ETAPA 5 — Diagnóstico Adaptativo (Leaks, Repetição Espaçada e Progresso Multidimensional)", () => {
  const sampleRecords: AdaptiveExerciseRecord[] = [
    {
      attemptId: "rec_1",
      timestamp: 1794500000000,
      trainerMode: "GTO_TECHNICAL",
      spotId: "verified_icm_ft_6max_20bb_sb_vs_btn_v1",
      spotName: "[GTO VERIFICADO - ICM $EV] Mesa Final 6-Max — SB 20BB vs BTN Open",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      handClass: "AQo",
      chosenAction: "Allin_20bb",
      referenceStrategySummary: {
        status: "VERIFIED",
        dominantAction: "Fold",
        dominantFreq: 1.0,
        chosenFreq: 0.0,
        actionFrequencies: { Allin_20bb: 0, Fold: 1 },
        actionEv: { Allin_20bb: -4.6, Fold: 0 },
      },
      evLoss: 4.6,
      evUnit: "$EV",
      confidenceLevel: "alta", // Ponto cego!
      heroPosition: "SB",
      effectiveStackBb: 20,
      tournamentFormat: "MTT_ICM",
      street: "PREFLOP",
      classification: "ev_error",
      isAcceptable: false,
      leakCategory: "icm_call_errors",
    },
    {
      attemptId: "rec_2",
      timestamp: 1794500010000,
      trainerMode: "GTO_TECHNICAL",
      spotId: "verified_postflop_bb_vs_btn_cbet_8s7s5d_v1",
      spotName: "[GTO VERIFICADO] Flop 8s 7s 5d — BB vs C-Bet 33% do BTN",
      trackId: "POSTFLOP_BB_VS_CBET",
      spotType: "bb_vs_cbet",
      handClass: "A7s",
      chosenAction: "Check_Fold",
      referenceStrategySummary: {
        status: "VERIFIED",
        dominantAction: "Check_Call",
        dominantFreq: 0.85,
        chosenFreq: 0.0,
        actionFrequencies: { Check_Raise: 0.15, Check_Call: 0.85, Check_Fold: 0 },
        actionEv: { Check_Raise: 2.41, Check_Call: 2.42, Check_Fold: 0 },
      },
      evLoss: 2.42,
      evUnit: "bbEV",
      confidenceLevel: "media",
      heroPosition: "BB",
      effectiveStackBb: 27.9,
      tournamentFormat: "MTT_CHEV",
      street: "FLOP",
      classification: "ev_error",
      isAcceptable: false,
      leakCategory: "underdefend_bb",
    },
    {
      attemptId: "rec_3",
      timestamp: 1794500020000,
      trainerMode: "GTO_TECHNICAL",
      spotId: "verified_mtt_8max_30bb_btn_rfi_v1",
      spotName: "[GTO VERIFICADO] 30BB - BTN RFI (8-Max chipEV)",
      trackId: "PREFLOP_RFI",
      spotType: "rfi",
      handClass: "AA",
      chosenAction: "Raise_2_1bb",
      referenceStrategySummary: {
        status: "VERIFIED",
        dominantAction: "Raise_2_1bb",
        dominantFreq: 1.0,
        chosenFreq: 1.0,
        actionFrequencies: { Raise_2_1bb: 1, Fold: 0 },
        actionEv: { Raise_2_1bb: 8.42, Fold: 0 },
      },
      evLoss: 0,
      evUnit: "bbEV",
      confidenceLevel: "alta",
      heroPosition: "BTN",
      effectiveStackBb: 30,
      tournamentFormat: "MTT_CHEV",
      street: "PREFLOP",
      classification: "exact_primary",
      isAcceptable: true,
      leakCategory: null,
    },
  ];

  it("24. classifica leaks por frequência, impacto de EV e ponto cego de confiança", () => {
    const catalog = buildVerifiedSolverReferenceCatalog();
    const icmSpot = catalog.find(
      (s) => s.spotId === "verified_icm_ft_6max_20bb_sb_vs_btn_v1",
    )!;
    const detected = classifyAttemptLeak({
      spot: icmSpot,
      chosenAction: "Allin_20bb",
      bestAction: "Fold",
      classification: "ev_error",
    });
    assert.equal(detected, "icm_call_errors");

    const ranked = classifyAndRankLeaks(sampleRecords);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0].leakCategory, "icm_call_errors");
    assert.equal(ranked[0].blindSpotCount, 1);
    assert.ok(ranked[0].impactScore > ranked[1].impactScore);
  });

  it("25. agenda repetição espaçada (Leitner) e acompanha progresso por Posição, Stack, Formato e Street", () => {
    const schedule = computeSpacedRepetitionSchedule(
      sampleRecords,
      1794500020000,
    );
    assert.equal(schedule.length, 3);

    // Spots com erro vão para Caixa 0 (isDueNow = true)
    const icmItem = schedule.find(
      (s) => s.spotId === "verified_icm_ft_6max_20bb_sb_vs_btn_v1",
    )!;
    assert.equal(icmItem.boxLevel, 0);
    assert.equal(icmItem.isDueNow, true);

    // Spot acertado com confiança alta avança para Caixa 1 (intervalo 1 dia)
    const btnItem = schedule.find(
      (s) => s.spotId === "verified_mtt_8max_30bb_btn_rfi_v1",
    )!;
    assert.equal(btnItem.boxLevel, 1);
    assert.equal(btnItem.intervalDays, 1);
    assert.equal(btnItem.isDueNow, false);

    // Progresso multidimensional (Posição, Stack, Formato, Street)
    const progress = computeDimensionalProgress(sampleRecords);
    assert.equal(progress.totalAttempts, 3);
    assert.equal(progress.provenanceCompletenessPct, 100);
    assert.equal(progress.byPosition.length, 3); // SB, BB, BTN
    assert.equal(progress.byStack.length, 2); // 17-20BB e 25-30BB
    assert.equal(progress.byFormat.length, 2); // MTT_ICM e MTT_CHEV
    assert.equal(progress.byStreet.length, 2); // PREFLOP e FLOP
  });
});
