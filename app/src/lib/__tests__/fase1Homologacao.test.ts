import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { FATAL_ERRORS, getFatalErrorPracticeSpots } from "../poker/fatalErrorsCatalog.ts";
import { createFatalErrorAttempt, FATAL_ERRORS_STORAGE_KEY, getFatalErrorSchedule, loadFatalErrorStudy, retainFatalErrorAttempts, saveFatalErrorStudy, scoreFatalErrorQuiz, type FatalErrorAttempt, type StudyStorage } from "../poker/fatalErrorsStudy.ts";
import { calculateFatalErrorModel } from "../poker/fatalErrorsMath.ts";
import { adaptLegacyRangeSpotToCanonical, computeMixedAdherenceStats, evaluateDrillDecision, importTexasSolverBundle, rankLeakSpots, type CanonicalSpot, type LegacyRangeSpot, type TexasSolverBundleV1 } from "../poker.ts";
import { getDidacticAndUnsolvedSpots } from "../curriculum.ts";

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const bundle = JSON.parse(readFileSync("src/data/verified_ahkd7c_texassolver.json", "utf8")) as TexasSolverBundleV1;
const imported = importTexasSolverBundle(bundle);
assert.equal(imported.ok, true);
const real = imported.spot;
const legacy = (JSON.parse(readFileSync("src/data/ranges_gto.json", "utf8")).spots as LegacyRangeSpot[]).map(adaptLegacyRangeSpotToCanonical);
const catalogue = [...getDidacticAndUnsolvedSpots(), ...legacy, real];
const card = FATAL_ERRORS[0];
const stamp = Date.UTC(2026, 10, 12, 23, 59, 59);
const day = 86400000;
function answer(id: string, correct: boolean, timestamp = stamp, confidenceLevel = "media"): FatalErrorAttempt {
  return createFatalErrorAttempt({ attemptId: id, errorId: card.id, quizId: card.quiz.id, timestamp,
    confidenceLevel, chosenIndex: correct ? card.quiz.correctIndex : (card.quiz.correctIndex + 1) % 3 });
}
function storageWith(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[FATAL_ERRORS_STORAGE_KEY, raw]]);
  const storage: StudyStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } };
  return { storage, values };
}

describe("Homologação — evidência extraída dos arquivos", () => {
  it("reconstitui as 101 médias e 563 combos diretamente do dump bruto, sem depender do relatório", () => {
    const raw = JSON.parse(readFileSync("../pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/texassolver_raw.json", "utf8"));
    const node = raw.childrens.CHECK.strategy;
    const actionNames = ["Check", "Bet_33pct", "Bet_75pct"];
    assert.deepEqual(node.actions, ["CHECK", "BET 19.000000", "BET 43.000000"]);
    let combos = 0;
    for (const [hand, breakdown] of Object.entries(bundle.comboBreakdown)) {
      const sums = [0, 0, 0];
      for (const [combo, dist] of Object.entries(breakdown)) {
        const original: number[] = node.strategy[combo];
        assert.ok(original);
        combos++;
        for (let i = 0; i < 3; i++) {
          assert.ok(Math.abs(original[i] - dist[actionNames[i]]) <= 5.1e-7);
          sums[i] += original[i];
        }
      }
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(sums[i] / Object.keys(breakdown).length - bundle.matrixFrequencies[hand][actionNames[i]]) <= 5.1e-7);
    }
    assert.equal(combos, 563);
    assert.equal(Object.keys(node.strategy).length, combos);
    assert.equal(Object.keys(bundle.matrixFrequencies).length, 101);
  });

  it("confere hashes do manifesto contra os artefatos físicos e a cópia do bundle", () => {
    const run = "../pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/";
    const hashes = bundle.manifest.hashes;
    assert.equal(sha(run + "solver_input.txt"), hashes.solverInputSha256);
    assert.equal(sha(run + "texassolver_raw.json"), hashes.rawOutputSha256);
    assert.equal(sha(run + "convergence_log.jsonl"), hashes.convergenceLogSha256);
    assert.equal(sha("src/data/ranges_gto.json"), hashes.rangesSourceSha256);
    assert.equal(sha(run + "canonical_bundle.json"), sha("src/data/verified_ahkd7c_texassolver.json"));
    assert.equal(sha("../Dossie/CATALOGO_ERROS_FATAIS_GTO.json"), sha("src/data/fatalErrorsCatalog.json"));
    assert.equal(bundle.matrixEv, null);
    assert.equal(bundle.evUnit, null);
    assert.equal(bundle.manifest.solver.evExportedByCli, false);
  });

  it("separa 229 charts, demonstrações, UNSOLVED e apenas a solução embarcada VERIFIED", () => {
    assert.equal(legacy.length, 229);
    assert.ok(legacy.every(s => s.referenceStrategy.status === "IMPORTED_CHART_NO_EV"));
    assert.ok(getDidacticAndUnsolvedSpots().every(s => s.referenceStrategy.status !== "VERIFIED"));
    assert.equal(catalogue.filter(s => s.referenceStrategy.status === "VERIFIED").length, 1);
    for (const c of FATAL_ERRORS) for (let i = 0; i < c.quiz.options.length; i++) {
      assert.equal(scoreFatalErrorQuiz(c, i).evLoss, null);
      assert.equal(scoreFatalErrorQuiz(c, i).gtoScored, false);
      assert.equal(c.gtoReferenceStatus, "UNSOLVED");
    }
  });
});

describe("Homologação — avaliador e frequências", () => {
  it("ranking sem EV usa taxa de erro apenas para prioridade e mantém EV médio indisponível", () => {
    const [rank] = rankLeakSpots([{ spotId: "chart-no-ev", evLoss: null, isError: true }]);
    assert.equal(rank.avgEvLoss, null);
    assert.equal(rank.errorRate, 1);
    assert.equal(rank.impactScore, 1);
  });

  it("avalia todas as 303 decisões reais, inclusive <5%, intermediárias e >=90%, sem fabricar EV", () => {
    const before = JSON.stringify(real);
    const seen = new Set<string>();
    for (const [handClass, dist] of Object.entries(real.referenceStrategy.matrixFrequencies!)) {
      for (const [chosenAction, freq] of Object.entries(dist)) {
        for (const mode of ["LEARNING", "GTO_TECHNICAL"] as const) {
          const result = evaluateDrillDecision({ spot: real, handClass, chosenAction, mode, useRng: true, rngValue: 100 });
          assert.equal(result.gtoScored, true);
          assert.equal(result.evLoss, null);
          assert.equal(result.evScored, false);
          assert.equal(result.bestEv, null);
          assert.equal(result.chosenEv, null);
          assert.equal(result.evUnit, null);
          assert.equal(result.classification, freq >= .9 ? "exact_primary" : freq < .25 && freq < Math.max(...Object.values(dist)) - .15 ? "low_freq_acceptable" : "valid_mixed");
          seen.add(freq < .05 ? "rare" : freq < .9 ? "mixed" : "high");
        }
      }
    }
    assert.deepEqual([...seen].sort(), ["high", "mixed", "rare"]);
    assert.equal(JSON.stringify(real), before);
  });

  it("ações zero em charts são desvios de frequência sem EV, e modo técnico bloqueia todos os não verificados", () => {
    let zeros = 0;
    for (const spot of catalogue.filter(s => s.referenceStrategy.status !== "VERIFIED")) {
      const matrix = spot.referenceStrategy.matrixFrequencies ?? {};
      const handClass = Object.keys(matrix)[0] ?? "AA";
      for (const action of spot.legalActions) {
        const blocked = evaluateDrillDecision({ spot, handClass, chosenAction: action.name, mode: "GTO_TECHNICAL" });
        assert.equal(blocked.gtoScored, false);
        assert.equal(blocked.evLoss, null);
        assert.equal(blocked.classification, "unsolved");
      }
      for (const [hand, distribution] of Object.entries(matrix)) for (const { name: chosenAction } of spot.legalActions) {
        const frequency = distribution[chosenAction] ?? 0;
        const learning = evaluateDrillDecision({ spot, handClass: hand, chosenAction, mode: "LEARNING" });
        assert.equal(learning.evLoss, null);
        assert.equal(learning.gtoScored, false);
        if (frequency === 0) { assert.equal(learning.classification, "ev_error"); zeros++; }
      }
    }
    assert.ok(zeros > 1000);
  });

  it("aceitar ação rara não valida jogá-la sempre: aderência acumulada detecta o excesso", () => {
    const distribution = real.referenceStrategy.matrixFrequencies!.AA;
    assert.ok(distribution.Check > 0 && distribution.Check < .05);
    const attempts = Array.from({ length: 100 }, (_, i) => ({ spotId: real.spotId, hand: "AA", chosenAction: "Check", targetDistribution: distribution, evLoss: null, timestamp: i }));
    const stats = computeMixedAdherenceStats(attempts);
    assert.ok(stats.adherencePct < 5);
    assert.equal(stats.observedDistribution.Check, 1);
    assert.equal(evaluateDrillDecision({ spot: real, handClass: "AA", chosenAction: "Check" }).classification, "low_freq_acceptable");
  });

  it("não pontua nem calcula EV para um rótulo VERIFIED sem proveniência em nenhum modo", () => {
    // Fixture adversarial em memória, nunca adicionada ao catálogo/arquivos de solver.
    const invalid: CanonicalSpot = { ...real, referenceStrategy: { ...real.referenceStrategy,
      solutionSource: null, matrixEv: { AA: { Check: 0, Bet_33pct: 1, Bet_75pct: 2 } }, evUnit: "bbEV" } };
    for (const mode of ["LEARNING", "GTO_TECHNICAL"] as const) {
      const result = evaluateDrillDecision({ spot: invalid, handClass: "AA", chosenAction: "Check", mode });
      assert.equal(result.gtoScored, false);
      assert.equal(result.evLoss, null);
      assert.equal(result.evScored, false);
      assert.equal(result.bestEv, null);
      assert.equal(result.chosenEv, null);
    }
  });
});

describe("Homologação — persistência e relógio controlado", () => {
  it("preserva bytes de versões incompatíveis e JSON corrompido ao tentar salvar", () => {
    for (const raw of ['{"version":2,"attempts":[],"future":"preservar"}', '{"version":0,"attempts":[]}', "{"]) {
      const { storage, values } = storageWith(raw);
      assert.ok(loadFatalErrorStudy(storage).warning);
      assert.ok(saveFatalErrorStudy(storage, [answer("session", true)]));
      assert.equal(values.get(FATAL_ERRORS_STORAGE_KEY), raw);
    }
  });

  it("primeiro acerto de confiança baixa vai à caixa 1 e não à revisão imediata", () => {
    const schedule = getFatalErrorSchedule([answer("low", true, stamp, "baixa")], stamp)[0];
    assert.equal(schedule.boxLevel, 1);
    assert.equal(schedule.intervalDays, 1);
    assert.equal(schedule.isDueNow, false);
  });

  it("empate de timestamp mantém a ordem real de envio inclusive após serializar e carregar", () => {
    const oldest = answer("first", true);
    const newest = answer("second", false);
    const recent = retainFatalErrorAttempts([newest, oldest]);
    const { storage } = storageWith();
    assert.equal(saveFatalErrorStudy(storage, recent), null);
    for (const entries of [recent, loadFatalErrorStudy(storage).attempts]) {
      assert.equal(getFatalErrorSchedule(entries, stamp)[0].boxLevel, 0);
      assert.equal(getFatalErrorSchedule(entries, stamp)[0].isDueNow, true);
    }
  });

  it("retenção de 100 respostas não altera caixa/prazo e os contadores representam a janela", () => {
    const history = Array.from({ length: 110 }, (_, i) => answer(`a${i}`, true, stamp + i * 1000, i < 5 ? "media" : "baixa")).reverse();
    const kept = retainFatalErrorAttempts(history);
    assert.equal(kept.length, 100);
    assert.equal(history.length, 110);
    const full = getFatalErrorSchedule(history, stamp + day)[0];
    const window = getFatalErrorSchedule(kept, stamp + day)[0];
    assert.equal(full.boxLevel, window.boxLevel);
    assert.equal(full.nextReviewAt, window.nextReviewAt);
    assert.equal(window.attemptsCount, 100);
    assert.equal(full.attemptsCount, 110);
  });

  it("vence no instante exato, atravessa meia-noite e ano sem antecipar a revisão", () => {
    for (const timestamp of [stamp, Date.UTC(2026, 11, 31, 23, 59, 59)]) {
      const entries = [answer("boundary", true, timestamp)];
      assert.equal(getFatalErrorSchedule(entries, timestamp + 1000)[0].isDueNow, false);
      assert.equal(getFatalErrorSchedule(entries, timestamp + day - 1)[0].isDueNow, false);
      assert.equal(getFatalErrorSchedule(entries, timestamp + day)[0].isDueNow, true);
      assert.equal(getFatalErrorSchedule(entries, timestamp - day)[0].isDueNow, false);
    }
  });

  it("deduplica, rejeita respostas malformadas e não altera outra chave de armazenamento", () => {
    const valid = answer("same-id", false);
    const { storage } = storageWith(JSON.stringify({ version: 1, attempts: [valid, valid, null, {}, { ...valid, chosenIndex: 99 }, { ...valid, timestamp: "yesterday" }] }));
    storage.setItem("reglife_poker_adaptive_diag_v2", "preservado");
    const restored = loadFatalErrorStudy(storage);
    assert.equal(restored.attempts.length, 1);
    assert.ok(restored.warning);
    assert.equal(restored.attempts[0].isCorrect, false);
    assert.equal(restored.attempts[0].evLoss, null);
    assert.equal(saveFatalErrorStudy(storage, restored.attempts), null);
    assert.equal(storage.getItem("reglife_poker_adaptive_diag_v2"), "preservado");
  });
});

describe("Homologação — destinos e matemática analítica", () => {
  it("confere os três contextos reais e não modifica o status das referências", () => {
    for (const id of ["EF01", "EF04", "EF08"]) {
      const c = FATAL_ERRORS.find(c => c.id === id)!;
      const before = JSON.stringify(catalogue);
      const [target] = getFatalErrorPracticeSpots(c, catalogue);
      assert.ok(target);
      assert.equal(target.heroPosition, id === "EF04" ? "BB" : "BTN");
      assert.equal(target.effectiveStackBb, id === "EF01" ? 30 : id === "EF04" ? 20 : 27.9);
      assert.equal(target.street, id === "EF08" ? "FLOP" : "PREFLOP");
      assert.deepEqual(target.board, id === "EF08" ? ["Ah", "Kd", "7c"] : []);
      if (id === "EF08") assert.equal(target.potBb, 5.7);
      assert.equal(target.referenceStrategy.status, id === "EF08" ? "VERIFIED" : "IMPORTED_CHART_NO_EV");
      assert.equal(c.gtoReferenceStatus, "UNSOLVED");
      assert.equal(JSON.stringify(catalogue), before);
    }
  });

  it("fórmulas, precisão e invariância de escala sem recomendações estratégicas", () => {
    for (const scale of [1e-300, .01, 1, 1e100, 1e300]) {
      assert.equal(calculateFatalErrorModel("pot_odds", 100 * scale, 50 * scale).percentage, 25);
      assert.equal(calculateFatalErrorModel("bluff_fe", 100 * scale, 50 * scale).percentage, 33.33);
      assert.equal(calculateFatalErrorModel("mdf", 100 * scale, 50 * scale).percentage, 66.67);
    }
    assert.equal(calculateFatalErrorModel("pot_odds", 100, 100).percentage, 33.33);
    assert.equal(calculateFatalErrorModel("bluff_fe", 100, 100).percentage, 50);
    assert.equal(calculateFatalErrorModel("mdf", 100, 100).percentage, 50);
    assert.equal(calculateFatalErrorModel("pot_odds", Number.MIN_VALUE, Number.MIN_VALUE).percentage, 33.33);
    for (const kind of ["pot_odds", "bluff_fe", "mdf"] as const) for (const invalid of [0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      assert.throws(() => calculateFatalErrorModel(kind, invalid, invalid));
      assert.throws(() => calculateFatalErrorModel(kind, 100, invalid));
    }
  });
});
