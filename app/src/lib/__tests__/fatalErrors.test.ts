import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { FATAL_ERRORS, getFatalErrorLessons, getFatalErrorPracticeSpots } from "../poker/fatalErrorsCatalog.ts";
import { createFatalErrorAttempt, EMPTY_FATAL_FILTERS, FATAL_ERRORS_STORAGE_KEY, filterFatalErrors, getFatalErrorSchedule, getFatalErrorStatus, loadFatalErrorStudy, MAX_ATTEMPTS_PER_CARD, retainFatalErrorAttempts, saveFatalErrorStudy, scoreFatalErrorQuiz, type FatalErrorAttempt, type StudyStorage } from "../poker/fatalErrorsStudy.ts";
import { calculateFatalErrorModel } from "../poker/fatalErrorsMath.ts";
import { fatalErrorPracticeNavigation, shouldKeepLaunchedDrill, trainerNavigation } from "../studyNavigation.ts";
import { adaptLegacyRangeSpotToCanonical, evaluateDrillDecision, importTexasSolverBundle, type LegacyRangeSpot, type TexasSolverBundleV1 } from "../poker.ts";

const now = 1794500000000;
const day = 86400000;
const card = FATAL_ERRORS[0];
function attempt(index = card.quiz.correctIndex, timestamp = now, confidence = "media", id = card.id): FatalErrorAttempt {
  const target = FATAL_ERRORS.find(c => c.id === id)!;
  return createFatalErrorAttempt({ attemptId: `${id}:${timestamp}:${index}:${confidence}`, errorId: id, quizId: target.quiz.id, timestamp, chosenIndex: index, confidenceLevel: confidence });
}
function memoryStorage(): StudyStorage {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
const rawBundle = JSON.parse(readFileSync("src/data/verified_ahkd7c_texassolver.json", "utf8")) as TexasSolverBundleV1;
const real = importTexasSolverBundle(rawBundle).spot;
const legacy = JSON.parse(readFileSync("src/data/ranges_gto.json", "utf8"));
// O arquivo legado tem uma raiz spots; o teste exige a estrutura real documentada.
const legacyEntries: LegacyRangeSpot[] = legacy.spots;
const spots = [real, ...legacyEntries.filter(s => ["30bb_rfi_btn", "20bb_bb_vs_btn_rfi"].includes(s.id)).map(adaptLegacyRangeSpotToCanonical)];

describe("Fase 1 — Catálogo e integridade de evidência", () => {
  it("preserva byte a byte os 20 itens da fonte, sem promoção de GTO ou EV", () => {
    const sourceBytes = readFileSync("../Dossie/CATALOGO_ERROS_FATAIS_GTO.json");
    const copyBytes = readFileSync("src/data/fatalErrorsCatalog.json");
    assert.equal(createHash("sha256").update(copyBytes).digest("hex"), createHash("sha256").update(sourceBytes).digest("hex"));
    const source = JSON.parse(sourceBytes.toString("utf8"));
    assert.equal(FATAL_ERRORS.length, 20);
    assert.equal(new Set(FATAL_ERRORS.map(c => c.id)).size, 20);
    for (const item of source.items) {
      const enriched = FATAL_ERRORS.find(c => c.id === item.id)!;
      for (const key of Object.keys(item)) assert.deepEqual(enriched[key as keyof typeof enriched], item[key]);
      assert.equal(enriched.gtoReferenceStatus, "UNSOLVED");
      assert.equal(enriched.evLossBb, null);
      assert.equal(enriched.automaticDiagnosisAllowed, false);
      assert.ok(enriched.explanation && enriched.exception && enriched.quiz.explanation);
    }
  });

  it("relaciona somente aulas existentes e mantém ressalvas de transcrição", () => {
    for (const c of FATAL_ERRORS) {
      assert.equal(getFatalErrorLessons(c).length, c.lessons.length);
      for (const lesson of getFatalErrorLessons(c)) {
        if (!lesson.hasVerifiedTranscript) {
          assert.equal(lesson.evidenceType, "METADATA_HYPOTHESIS");
          assert.ok(lesson.unverifiedWarning);
        }
      }
    }
    assert.equal(getFatalErrorLessons(FATAL_ERRORS[18]).length, 0);
    assert.equal(getFatalErrorLessons(FATAL_ERRORS[19]).length, 0);
  });

  it("avalia todas as alternativas dos 20 quizzes sem pontuação GTO ou EV loss", () => {
    for (const c of FATAL_ERRORS) {
      assert.equal(new Set(c.quiz.options).size, c.quiz.options.length);
      for (let i = 0; i < c.quiz.options.length; i++) {
        const score = scoreFatalErrorQuiz(c, i);
        assert.equal(score.isCorrect, i === c.quiz.correctIndex);
        assert.equal(score.evLoss, null);
        assert.equal(score.gtoScored, false);
      }
      for (const invalid of [-1, 0.5, 3, NaN, Infinity]) assert.throws(() => scoreFatalErrorQuiz(c, invalid));
    }
  });

  it("não avalia a decisão pelo resultado da mão e não proíbe ações mistas", () => {
    const processCard = FATAL_ERRORS.find(c => c.id === "EF19")!;
    assert.equal(scoreFatalErrorQuiz(processCard, processCard.quiz.correctIndex).isCorrect, true);
    assert.match(processCard.explanation, /Ganhar não valida.*perder não invalida/);
    assert.match(FATAL_ERRORS[7].exception, /check presente no mix/);
    const summaryBefore = JSON.stringify(real);
    const nav = fatalErrorPracticeNavigation(FATAL_ERRORS[7], spots, real.spotId);
    assert.equal(nav?.requestedMode, "LEARNING");
    for (const chosenAction of ["Check", "Bet_33pct", "Bet_75pct"]) {
      const result = evaluateDrillDecision({ spot: real, handClass: "AA", chosenAction, mode: "GTO_TECHNICAL" });
      assert.equal(result.gtoScored, true);
      assert.equal(result.evScored, false);
      assert.equal(result.evLoss, null);
      assert.notEqual(result.classification, "ev_error");
    }
    assert.equal(JSON.stringify(real), summaryBefore);
  });
});

describe("Fase 1 — Filtros, respostas e repetição espaçada", () => {
  it("combina street, categoria, dificuldade e status e permite resultado vazio", () => {
    assert.equal(filterFatalErrors(FATAL_ERRORS, EMPTY_FATAL_FILTERS, [], now).length, 20);
    for (const c of FATAL_ERRORS) {
      const filtered = filterFatalErrors(FATAL_ERRORS, { street: c.category, category: c.classification, difficulty: c.difficulty, status: "new" }, [], now);
      assert.ok(filtered.includes(c));
      assert.ok(filtered.every(v => v.category === c.category && v.classification === c.classification && v.difficulty === c.difficulty));
    }
    assert.deepEqual(filterFatalErrors(FATAL_ERRORS, { ...EMPTY_FATAL_FILTERS, street: "Disciplina", category: "CONTEXTUAL" }, [], now), []);
    const wrong = attempt((card.quiz.correctIndex + 1) % 3);
    assert.deepEqual(filterFatalErrors(FATAL_ERRORS, { ...EMPTY_FATAL_FILTERS, status: "incorrect" }, [wrong], now).map(c => c.id), [card.id]);
    assert.equal(filterFatalErrors(FATAL_ERRORS, { ...EMPTY_FATAL_FILTERS, status: "new" }, [wrong], now).length, 19);
  });

  it("reutiliza Leitner: acertos avançam, erros retornam e o prazo muda o status", () => {
    const records = [attempt(), attempt(card.quiz.correctIndex, now + day), attempt(card.quiz.correctIndex, now + 4 * day)];
    const schedule = getFatalErrorSchedule(records, now + 4 * day)[0];
    assert.equal(schedule.boxLevel, 3);
    assert.equal(schedule.intervalDays, 7);
    assert.equal(schedule.avgEvLoss, null);
    assert.equal(getFatalErrorStatus(card, [], now), "new");
    assert.equal(getFatalErrorStatus(card, [records[0]], now), "learning");
    assert.equal(getFatalErrorStatus(card, records, now + 4 * day), "consolidated");
    assert.equal(getFatalErrorStatus(card, records, now + 11 * day), "review");
    const wrong = attempt((card.quiz.correctIndex + 1) % 3, now + 5 * day, "alta");
    assert.equal(getFatalErrorSchedule([...records, wrong], wrong.timestamp)[0].boxLevel, 0);
    assert.equal(getFatalErrorStatus(card, [...records, wrong], wrong.timestamp), "review");
    const lowConfidence = attempt(card.quiz.correctIndex, now + 5 * day, "baixa");
    assert.equal(getFatalErrorSchedule([...records, lowConfidence], lowConfidence.timestamp)[0].boxLevel, 1);
    const long = Array.from({ length: 9 }, (_, i) => attempt(card.quiz.correctIndex, now + i * day));
    assert.equal(getFatalErrorSchedule(long, now + 9 * day)[0].boxLevel, 5);
    assert.equal(getFatalErrorSchedule(long, now + 9 * day)[0].intervalDays, 30);
  });
});

describe("Fase 1 — Persistência defensiva", () => {
  it("restaura respostas incorretas e confiança após reabrir, sem sobrescrever histórico do treinador", () => {
    const storage = memoryStorage();
    storage.setItem("reglife_poker_adaptive_diag_v2", "histórico anterior");
    const records = [attempt(), attempt((card.quiz.correctIndex + 1) % 3, now + 1, "alta")];
    assert.equal(saveFatalErrorStudy(storage, records), null);
    const restored = loadFatalErrorStudy(storage);
    assert.equal(restored.warning, null);
    assert.deepEqual(restored.attempts, [...records].reverse());
    assert.equal(restored.attempts[0].isCorrect, false);
    assert.equal(restored.attempts[0].confidenceLevel, "alta");
    assert.equal(storage.getItem("reglife_poker_adaptive_diag_v2"), "histórico anterior");
  });

  it("recalcula acerto e descarta EV loss e campos adulterados da persistência", () => {
    const storage = memoryStorage();
    const wrong = attempt((card.quiz.correctIndex + 1) % 3);
    storage.setItem(FATAL_ERRORS_STORAGE_KEY, JSON.stringify({ version: 1, attempts: [{ ...wrong, isCorrect: true, evLoss: 999, gtoReferenceStatus: "VERIFIED" }, { ...wrong, errorId: "EF99" }, null] }));
    const loaded = loadFatalErrorStudy(storage);
    assert.ok(loaded.warning);
    assert.equal(loaded.attempts.length, 1);
    assert.equal(loaded.attempts[0].isCorrect, false);
    assert.equal(loaded.attempts[0].evLoss, null);
    assert.equal("gtoReferenceStatus" in loaded.attempts[0], false);
    assert.equal(saveFatalErrorStudy(storage, loaded.attempts), null);
    assert.equal(JSON.parse(storage.getItem(FATAL_ERRORS_STORAGE_KEY)!).attempts[0].evLoss, null);
  });

  it("tolera JSON corrompido, versão desconhecida e armazenamento bloqueado ou cheio", () => {
    const storage = memoryStorage();
    for (const value of ["{", "null", "[]", '{"version":2,"attempts":[]}']) {
      storage.setItem(FATAL_ERRORS_STORAGE_KEY, value);
      assert.deepEqual(loadFatalErrorStudy(storage).attempts, []);
      assert.ok(loadFatalErrorStudy(storage).warning);
    }
    const blocked: StudyStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); } };
    assert.ok(loadFatalErrorStudy(blocked).warning);
    assert.ok(saveFatalErrorStudy(blocked, [attempt()]));
    assert.throws(() => createFatalErrorAttempt({ ...attempt(), quizId: "antigo" }));
    assert.throws(() => createFatalErrorAttempt({ ...attempt(), timestamp: Infinity }));
    assert.throws(() => createFatalErrorAttempt({ ...attempt(), confidenceLevel: "certeza" }));
  });

  it("limita por cartão e deduplica sem apagar o estudo de outros temas", () => {
    const entries = Array.from({ length: 105 }, (_, i) => attempt(card.quiz.correctIndex, now + i));
    const other = attempt(FATAL_ERRORS[1].quiz.correctIndex, now, "media", "EF02");
    const retained = retainFatalErrorAttempts([...entries, entries[104], other]);
    assert.equal(retained.filter(a => a.errorId === card.id).length, MAX_ATTEMPTS_PER_CARD);
    assert.ok(retained.includes(other));
    assert.equal(retained[0].timestamp, now + 104);
  });
});

describe("Fase 1 — Navegação e modelos matemáticos", () => {
  it("preserva o lançamento após consumir o pedido e libera sorteio ao alterar filtros ou modo", () => {
    const contextKey = JSON.stringify(["all", "all", "all", "all", "all", "borderline", false, "seed"]);
    const selection = { mode: "LEARNING" as const, contextKey };
    assert.equal(shouldKeepLaunchedDrill(null, "LEARNING", contextKey), false);
    assert.equal(shouldKeepLaunchedDrill(selection, "LEARNING", contextKey), true);
    assert.equal(shouldKeepLaunchedDrill(selection, "LEARNING", "filtros alterados"), false);
    assert.equal(shouldKeepLaunchedDrill(selection, "GTO_TECHNICAL", contextKey), false);
  });

  it("lança apenas vínculos disponíveis em aprendizagem e mantém a classificação do destino", () => {
    assert.equal(spots.length, 3);
    for (const id of ["EF01", "EF04", "EF08"]) {
      const c = FATAL_ERRORS.find(c => c.id === id)!;
      const linked = getFatalErrorPracticeSpots(c, spots);
      assert.equal(linked.length, 1);
      const nav = fatalErrorPracticeNavigation(c, spots, linked[0].spotId)!;
      assert.equal(nav.activeTab, "trainer");
      assert.equal(nav.requestedSpotId, linked[0].spotId);
      assert.equal(nav.requestedMode, "LEARNING");
      assert.equal(c.gtoReferenceStatus, "UNSOLVED");
      assert.equal(linked[0].referenceStrategy.status, id === "EF08" ? "VERIFIED" : "IMPORTED_CHART_NO_EV");
      assert.equal(fatalErrorPracticeNavigation(c, [], linked[0].spotId), null);
    }
    assert.equal(fatalErrorPracticeNavigation(FATAL_ERRORS[17], spots, real.spotId), null);
    assert.deepEqual(getFatalErrorPracticeSpots(FATAL_ERRORS[7], [{ ...real, board: ["8s", "7s", "5d"] }]), []);
    assert.deepEqual(getFatalErrorPracticeSpots(FATAL_ERRORS[7], [{ ...real, effectiveStackBb: 100 }]), []);
    assert.equal(trainerNavigation(real.spotId, "GTO_TECHNICAL").requestedMode, "GTO_TECHNICAL");
    assert.equal(trainerNavigation(real.spotId).requestedMode, null);
  });

  it("reproduz os limiares do dossiê e rejeita entradas inválidas", () => {
    assert.equal(calculateFatalErrorModel("pot_odds", 100, 50).percentage, 25);
    assert.equal(calculateFatalErrorModel("bluff_fe", 100, 50).percentage, 33.33);
    assert.equal(calculateFatalErrorModel("mdf", 100, 50).percentage, 66.67);
    assert.match(calculateFatalErrorModel("mdf", 100, 50).caveat, /Não é obrigação de call/);
    for (const kind of ["pot_odds", "bluff_fe", "mdf"] as const) {
      for (const bad of [0, -1, Infinity, NaN, Number.MAX_VALUE]) assert.throws(() => calculateFatalErrorModel(kind, bad, bad));
    }
    assert.deepEqual(FATAL_ERRORS.filter(c => c.calculator).map(c => c.id), ["EF04", "EF09", "EF14", "EF17"]);
  });
});
