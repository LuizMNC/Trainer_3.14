import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import rangesData from "../../data/ranges_gto.json" with { type: "json" };
import solverData from "../../data/verified_ahkd7c_texassolver.json" with { type: "json" };
import {
  adaptLegacyRangeSpotToCanonical,
  classifyCanonicalSpot,
  classifyCellDistributionIntegrity,
  CLEAN_TRAINER_STORAGE_KEY,
  computeMixedAdherenceStats,
  evaluateDrillDecision,
  evaluatePkoBountyModel,
  filterConfirmedMttCanonicalSpots,
  filterConfirmedMttLegacySpots,
  getSpotHandIntegrityIssue,
  importTexasSolverBundle,
  isSpotIdExcludedFromMtt,
  LEGACY_CLEAN_TRAINER_STORAGE_KEYS,
  LEGACY_TRAINER_SESSION_STORAGE_KEYS,
  loadCleanTrainerSession,
  loadTrainerSession,
  parseCleanTrainerSessionPayload,
  parseMixedAttemptRecordStrict,
  parseStrictFiniteList,
  parseTrainerSessionPayload,
  pickRngTargetAction,
  resolveActiveMttSpot,
  saveCleanTrainerSession,
  saveTrainerSession,
  TRAINER_SESSION_STORAGE_KEY,
  type CanonicalSpot,
  type LegacyRangeSpot,
  type TexasSolverBundleV1,
  type TrainerStorageLike,
  UNAVAILABLE_MTT_EXERCISE_MESSAGE,
} from "../poker.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/node_modules/")) {
      return nextResolve(specifier, context);
    }
    if (specifier.endsWith(".css")) {
      return {
        url: "data:text/javascript,export default new Proxy({},{get:(_,p)=>String(p)});",
        shortCircuit: true,
      };
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate) {
      if (path.extname(candidate) === ".json" && existsSync(candidate)) {
        return {
          url: pathToFileURL(candidate).href + "?mock-json-esm",
          shortCircuit: true,
        };
      }
      if (!path.extname(candidate)) {
        for (const extension of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          if (existsSync(candidate + extension)) {
            return nextResolve(pathToFileURL(candidate + extension).href, context);
          }
        }
      }
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("?mock-json-esm")) {
      const filePath = fileURLToPath(url.slice(0, -"?mock-json-esm".length));
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${readFileSync(filePath, "utf8")};`,
      };
    }
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
});

const { CleanRangeTrainerView } = await import("../../components/CleanRangeTrainerView.tsx");
const { TrainerView } = await import("../../components/TrainerView.tsx");
const { StatsView } = await import("../../components/StatsView.tsx");
const { PokerStudioApp } = await import("../../components/PokerStudioApp.tsx");
const { NextRequest } = await import("next/server.js");
const { POST: coachPost } = await import("../../app/api/coach/route.ts");

function makeMemoryStorage(): TrainerStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem(k: string) {
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      map.set(k, v);
    },
    removeItem(k: string) {
      map.delete(k);
    },
  };
}

const rawSpots = (rangesData as unknown as { spots: LegacyRangeSpot[] }).spots;
const mttLegacySpots = filterConfirmedMttLegacySpots(rawSpots);
const mttCanonicalSpots = filterConfirmedMttCanonicalSpots(
  mttLegacySpots.map((s) => adaptLegacyRangeSpotToCanonical(s)),
);
const verifiedBundleRes = importTexasSolverBundle(solverData as TexasSolverBundleV1);
if (!verifiedBundleRes.ok) {
  throw new Error(`Falha ao carregar solver verificado de teste: ${verifiedBundleRes.errors.join("; ")}`);
}
const verifiedPostflop = verifiedBundleRes.spot;

const BASELINE_RANGES_SHA256 =
  "d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e";
const BASELINE_VERIFIED_SOLVER_SHA256 =
  "868ef9fb8e6371f12dde7749170015af4facca70af92dc33aa45251cdd0b3eda";

describe("Pós-Homologação MTT 2026 — Preservação, Integridade, Persistência e Segurança", () => {
  it("preserva SHA-256 original de ranges_gto.json e verified_ahkd7c_texassolver.json sem auto-normalização", () => {
    const rangesSha = createHash("sha256")
      .update(readFileSync(path.resolve("src/data/ranges_gto.json")))
      .digest("hex");
    const solverSha = createHash("sha256")
      .update(readFileSync(path.resolve("src/data/verified_ahkd7c_texassolver.json")))
      .digest("hex");

    assert.equal(rangesSha, BASELINE_RANGES_SHA256);
    assert.equal(solverSha, BASELINE_VERIFIED_SOLVER_SHA256);

    const aaSpot = rawSpots.find((s) => s.id === "17bb_sb_vs_utg_rfi");
    const kkSpot = rawSpots.find((s) => s.id === "20bb_btn_vs_mp_rfi");
    assert.ok(aaSpot && kkSpot);
    const aaSum = Object.values(aaSpot.matrix.AA).reduce((a, b) => a + b, 0);
    const kkSum = Object.values(kkSpot.matrix.KK).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(aaSum - 0.964) < 0.001);
    assert.ok(Math.abs(kkSum - 0.964) < 0.001);
  });

  it("classifica corretamente soma = 1, resíduo <= 0,002 e desvios graves (0,964) e menores (0,976/0,988)", () => {
    const exact = classifyCellDistributionIntegrity({ Raise: 0.7, Fold: 0.3 }, ["Raise", "Fold"], "KQs");
    assert.equal(exact.status, "COMPLETE");

    const rounding = classifyCellDistributionIntegrity(
      { Raise: 0.699, Fold: 0.3 },
      ["Raise", "Fold"],
      "KJs",
    );
    assert.equal(rounding.status, "ROUNDING_ONLY");

    const minor = classifyCellDistributionIntegrity(
      { Raise: 0.976, Fold: 0 },
      ["Raise", "Fold"],
      "KTs",
    );
    assert.equal(minor.status, "INCOMPLETE_MINOR");

    const minor988 = classifyCellDistributionIntegrity(
      { Call: 0.588, Fold: 0.4 },
      ["Call", "Fold"],
      "Q9s",
    );
    assert.equal(minor988.status, "INCOMPLETE_MINOR");

    const spot17 = mttCanonicalSpots.find((s) => s.spotId === "17bb_sb_vs_utg_rfi")!;
    const spot20 = mttCanonicalSpots.find((s) => s.spotId === "20bb_btn_vs_mp_rfi")!;
    const aaIssue = getSpotHandIntegrityIssue(spot17, "AA");
    const kkIssue = getSpotHandIntegrityIssue(spot20, "KK");
    assert.ok(aaIssue && aaIssue.category === "EXTRACTION_LOSS_SEVERE");
    assert.ok(kkIssue && kkIssue.category === "EXTRACTION_LOSS_SEVERE");
  });

  it("bloqueia correção automática em células graves (17bb/AA e 20bb/KK = 0,964) e não inventa EV nem pune ações minoritárias ausentes", () => {
    const spot17 = mttCanonicalSpots.find((s) => s.spotId === "17bb_sb_vs_utg_rfi")!;
    const spot20 = mttCanonicalSpots.find((s) => s.spotId === "20bb_btn_vs_mp_rfi")!;

    for (const [spot, hand] of [
      [spot17, "AA"],
      [spot20, "KK"],
    ] as const) {
      for (const action of spot.legalActions) {
        const res = evaluateDrillDecision({
          spot,
          handClass: hand,
          chosenAction: action.name,
          rngValue: 98,
          useRng: true,
          mode: "LEARNING",
          enforceIntegrityGuard: true,
        });
        assert.equal(res.integrityStatus, "INCOMPLETE_SEVERE");
        assert.equal(res.integrityBlocked, true);
        assert.notEqual(res.classification, "ev_error");
        assert.equal(res.gtoScored, false);
        assert.equal(res.evLoss, null);
        assert.equal(res.rngTargetAction, null);
        assert.ok(res.integrityWarning && res.integrityWarning.includes("extração"));
      }
    }

    // Caso de perda menor (0,976): não pode punir automaticamente ação 0% (que pode ter perdido minoritária)
    const minorSpot = mttCanonicalSpots.find((s) =>
      Object.values(s.referenceStrategy.matrixFrequencies ?? {}).some((dist) => {
        const sum = Object.values(dist).reduce((a, b) => a + b, 0);
        return Math.abs(sum - 1) > 0.002 && Math.abs(sum - 1) <= 0.03;
      }),
    )!;
    assert.ok(minorSpot);
    const [minorHand, minorDist] = Object.entries(minorSpot.referenceStrategy.matrixFrequencies!).find(
      ([, dist]) => {
        const sum = Object.values(dist).reduce((a, b) => a + b, 0);
        return Math.abs(sum - 1) > 0.002 && Math.abs(sum - 1) <= 0.03;
      },
    )!;
    const zeroAct = minorSpot.legalActions.find((a) => (minorDist[a.name] ?? 0) === 0);
    if (zeroAct) {
      const blockedMinor = evaluateDrillDecision({
        spot: minorSpot,
        handClass: minorHand,
        chosenAction: zeroAct.name,
        mode: "LEARNING",
        enforceIntegrityGuard: true,
      });
      assert.equal(blockedMinor.integrityStatus, "INCOMPLETE_MINOR");
      assert.equal(blockedMinor.integrityBlocked, true);
      assert.notEqual(blockedMinor.classification, "ev_error");
      assert.equal(blockedMinor.evLoss, null);
    }
  });

  it("pickRngTargetAction nunca converte massa ausente (96,4..100) na ação dominante", () => {
    const actions = ["Allin", "Raise", "Call", "Fold"];
    const dist0964 = { Allin: 0.964 };

    assert.equal(pickRngTargetAction(actions, dist0964, 50), "Allin");
    assert.equal(pickRngTargetAction(actions, dist0964, 96.4), "Allin");
    assert.equal(pickRngTargetAction(actions, dist0964, 98), null);
    assert.equal(pickRngTargetAction(actions, dist0964, 100), null);

    // Tolerância de resíduo de arredondamento (<= 0,002) continua resolvida sem retornar null no limite 100
    assert.equal(pickRngTargetAction(["Raise", "Fold"], { Raise: 0.7, Fold: 0.299 }, 100), "Fold");
  });

  it("computeMixedAdherenceStats exclui tentativas de células incompletas e rejeita entradas corrompidas", () => {
    const stats = computeMixedAdherenceStats([
      {
        spotId: "spot_ok",
        hand: "KQs",
        chosenAction: "Raise",
        targetDistribution: { Raise: 0.5, Fold: 0.5 },
        evLoss: null,
        timestamp: 1000,
      },
      {
        spotId: "spot_ok",
        hand: "KQs",
        chosenAction: "Fold",
        targetDistribution: { Raise: 0.5, Fold: 0.5 },
        evLoss: null,
        timestamp: 2000,
      },
      {
        spotId: "17bb_sb_vs_utg_rfi",
        hand: "AA",
        chosenAction: "Allin",
        targetDistribution: { Allin: 0.964 },
        evLoss: null,
        timestamp: 3000,
      },
      {
        spotId: "bad",
        hand: "AKo",
        chosenAction: "Raise",
        targetDistribution: [] as unknown as Record<string, number>,
        evLoss: null,
        timestamp: 4000,
      },
    ]);

    assert.equal(stats.attempts, 4);
    assert.equal(stats.reliableAttempts, 2);
    assert.equal(stats.reliableGroupsCount, 1);
    assert.equal(stats.incompleteExcludedAttempts, 2);
    assert.equal(stats.hasIncompleteData, true);
    assert.equal(stats.adherencePct, 100);
  });

  it("persistência v1 do Trainer e Treiner Limpo valida esquema, migra v0, filtra Spin e sobrevive a JSON inválido", () => {
    const cleanStorage = makeMemoryStorage();
    assert.equal(parseCleanTrainerSessionPayload("{invalid").ok, false);
    assert.equal(parseCleanTrainerSessionPayload("[]").ok, false);
    assert.equal(parseCleanTrainerSessionPayload("null").ok, false);
    assert.equal(
      parseCleanTrainerSessionPayload(JSON.stringify({ schemaVersion: 99 })).ok,
      false,
    );
    assert.equal(parseMixedAttemptRecordStrict({ spotId: "spin_3max_15bb", hand: "AA", chosenAction: "Call", targetDistribution: { Call: 1 }, evLoss: null, timestamp: 1 }), null);
    assert.equal(parseMixedAttemptRecordStrict({ spotId: "30bb_rfi_btn", hand: "AA", chosenAction: "Raise", targetDistribution: { Raise: 1.5 }, evLoss: null, timestamp: 1 }), null);

    // Migração automática do formato legado v0 (sem schemaVersion)
    cleanStorage.setItem(
      LEGACY_CLEAN_TRAINER_STORAGE_KEYS[0],
      JSON.stringify({
        spotTypeFilter: "rfi",
        heroPosition: "BTN",
        selectedSpotId: "spin_15bb_sb",
        totalCount: 4,
        rightCount: 99,
        streak: 12,
        mixedAttempts: [
          {
            spotId: "spin_15bb_sb",
            hand: "AA",
            chosenAction: "Allin",
            targetDistribution: { Allin: 1 },
            evLoss: null,
            timestamp: 100,
          },
          {
            spotId: "30bb_rfi_btn",
            hand: "KTs",
            chosenAction: "Raise",
            targetDistribution: { Raise: 0.6, Fold: 0.4 },
            evLoss: null,
            timestamp: 200,
          },
        ],
      }),
    );

    const validIds = new Set(mttLegacySpots.map((s) => s.id));
    const migrated = loadCleanTrainerSession(cleanStorage, validIds);
    assert.equal(migrated.migratedFromLegacy, true);
    assert.ok(migrated.session);
    assert.equal(migrated.session.schemaVersion, 1);
    assert.equal(migrated.session.selectedSpotId, null);
    assert.equal(migrated.session.rightCount, 4);
    assert.equal(migrated.session.streak, 4);
    assert.equal(migrated.session.mixedAttempts.length, 1);
    assert.equal(cleanStorage.getItem(LEGACY_CLEAN_TRAINER_STORAGE_KEYS[0]), null);
    assert.ok(cleanStorage.getItem(CLEAN_TRAINER_STORAGE_KEY));

    // Corrompe v1 -> não crasha e limpa storage inválido
    cleanStorage.setItem(CLEAN_TRAINER_STORAGE_KEY, "{broken");
    assert.equal(loadCleanTrainerSession(cleanStorage, validIds).session, null);
    assert.equal(cleanStorage.getItem(CLEAN_TRAINER_STORAGE_KEY), null);

    // Persistência v1 de TrainerView
    const trainerStorage = makeMemoryStorage();
    trainerStorage.setItem(
      LEGACY_TRAINER_SESSION_STORAGE_KEYS[0],
      JSON.stringify({
        trainerMode: "LEARNING",
        selectedSpotId: "30bb_rfi_btn",
        formatFilter: "chipEV",
        sessionTotal: 6,
        sessionRight: 5,
        streak: 3,
      }),
    );
    const canonicalIds = new Set(mttCanonicalSpots.map((s) => s.spotId));
    const loadedTrainer = loadTrainerSession(trainerStorage, canonicalIds);
    assert.equal(loadedTrainer.migratedFromLegacy, true);
    assert.equal(loadedTrainer.session?.formatFilter, "MTT_CHEV");
    assert.equal(loadedTrainer.session?.selectedSpotId, "30bb_rfi_btn");
    assert.equal(loadedTrainer.session?.sessionTotal, 6);
    assert.ok(trainerStorage.getItem(TRAINER_SESSION_STORAGE_KEY));

    saveCleanTrainerSession(migrated.session, cleanStorage);
    saveTrainerSession(loadedTrainer.session!, trainerStorage);
    assert.equal(parseTrainerSessionPayload("{corrupted").ok, false);
  });

  it("isola Spin/SNG/Cash por metadados/proveniência, evita TypeError em strategy ausente e alerta exercício indisponível", () => {
    const unknownClass = classifyCanonicalSpot({
      id: "custom_1",
      referenceStrategy: {},
    } as unknown as CanonicalSpot);
    assert.equal(unknownClass.classification, "FORMAT_UNKNOWN");
    assert.equal(unknownClass.includedInMttApp, false);
    assert.equal(isSpotIdExcludedFromMtt("spin_3max_10bb"), true);
    assert.equal(
      isSpotIdExcludedFromMtt("spot_generic_1", "Heads-Up Jackpot SNG 20bb", "spinandgo_pack.json"),
      true,
    );
    assert.equal(isSpotIdExcludedFromMtt("30bb_rfi_btn", "BTN 30BB RFI (MTT 8-Max)"), false);

    const unavailable = resolveActiveMttSpot("spin_3max_15bb_hu", mttCanonicalSpots);
    assert.equal(unavailable.spot, null);
    assert.equal(unavailable.unavailableMessage, UNAVAILABLE_MTT_EXERCISE_MESSAGE);

    const htmlTrainer = renderToStaticMarkup(
      createElement(TrainerView, {
        canonicalSpots: [verifiedPostflop, ...mttCanonicalSpots.slice(0, 5)],
        apiKey: "",
        model: "gemini-3.8-flash",
        onRecordHistory: () => {},
        onImportVerifiedSpot: () => {},
        onOpenSettings: () => {},
      }),
    );
    assert.ok(htmlTrainer.includes("Treinador Prático") || htmlTrainer.includes("Mesa de Decisão"));

    const htmlClean = renderToStaticMarkup(
      createElement(CleanRangeTrainerView, { spots: mttLegacySpots }),
    );
    assert.ok(htmlClean.includes("Treiner Limpo"));

    // StatsView & PokerStudioApp com registro histórico Spin preservado
    const spinLegacyHistory = [
      {
        id: "old-spin-1",
        timestamp: 1_790_000_000_000,
        spotId: "spin_3max_15bb_sb",
        spotName: "Spin & Go 3-Max SB vs BB",
        stackBb: 15,
        heroPosition: "SB",
        spotType: "push_fold",
        hand: "K8o",
        chosenAction: "Fold",
        bestAction: "Allin",
        status: "error" as const,
        chosenFreq: 0,
        evLoss: null,
        evUnit: null,
      },
    ];
    const htmlStats = renderToStaticMarkup(
      createElement(StatsView, {
        history: spinLegacyHistory,
        onClearHistory: () => {},
        onPracticeSpot: () => {},
      }),
    );
    assert.ok(!htmlStats.includes("chipEV / ICM / PKO / Spin"));
    assert.ok(htmlStats.includes("Por Formato (chipEV / ICM / PKO)"));
    assert.ok(htmlStats.includes("Não disponível no MTT"));

    const htmlApp = renderToStaticMarkup(
      createElement(PokerStudioApp, {
        spots: mttLegacySpots.slice(0, 8),
        realSolvedSpots: [verifiedPostflop],
        totalChunks: 10,
        videos: [],
      }),
    );
    assert.ok(htmlApp.includes("md:flex-wrap") || htmlApp.includes("flex-wrap"));
  });

  it("valida estritamente listas no Lab ICM e explicita hipóteses estruturais PKO 50/50", () => {
    assert.deepEqual(parseStrictFiniteList("1000, 1500, 500", "Stacks"), [1000, 1500, 500]);
    assert.throws(() => parseStrictFiniteList("1000, abc", "Stacks"), /inválido/i);
    assert.throws(() => parseStrictFiniteList("", "Premiação"), /Informe ao menos um número/i);
    assert.throws(() => parseStrictFiniteList("500,,300", "Premiação"), /vírgulas extras|vazio/i);

    const pko = evaluatePkoBountyModel({
      potWithoutBountyChips: 10000,
      callAmountChips: 5000,
      villainBountyUsd: 20,
      startingStackChips: 10000,
      startingBountyUsd: 10,
      heroCoversVillain: true,
      bountyChipFactor: 0.33,
    });
    assert.ok(pko.assumptions.some((a) => a.includes("50/50")));
    assert.throws(
      () =>
        evaluatePkoBountyModel({
          potWithoutBountyChips: 10000,
          callAmountChips: 5000,
          villainBountyUsd: 10,
          startingStackChips: 10000,
          startingBountyUsd: 10,
          heroCoversVillain: true,
          bountyChipFactor: 1.5,
        }),
      /0 e 1/,
    );
  });

  it("rota /api/coach aplica 403, 400 (JSON/previousInteractionId/spotContext/base64), 413 (>6 MiB) e 429", async () => {
    const makeCoachReq = (body: BodyInit | null, extraHeaders: Record<string, string> = {}) =>
      new NextRequest("http://127.0.0.1:3000/api/coach", {
        method: "POST",
        headers: {
          Host: "127.0.0.1:3000",
          Origin: "http://127.0.0.1:3000",
          "X-Poker-Coach": "local-v1",
          ...extraHeaders,
        },
        body,
      });

    // 403 CSRF / header ausente
    const r403 = await coachPost(
      makeCoachReq(JSON.stringify({ prompt: "teste" }), { Origin: "http://evil.test" }),
    );
    assert.equal(r403.status, 403);

    // 413 payload > 6 MiB por Content-Length
    const r413Header = await coachPost(
      makeCoachReq("{}", { "content-length": String(7 * 1024 * 1024) }),
    );
    assert.equal(r413Header.status, 413);

    // 400 JSON malformado
    const r400Json = await coachPost(makeCoachReq("{broken"));
    assert.equal(r400Json.status, 400);

    // 400 previousInteractionId inválido
    const r400Prev = await coachPost(
      makeCoachReq(JSON.stringify({ prompt: "teste", previousInteractionId: "bad id !?" })),
    );
    assert.equal(r400Prev.status, 400);

    // 400 spotContext inválido (> 16 KB)
    const r400Ctx = await coachPost(
      makeCoachReq(
        JSON.stringify({
          prompt: "teste",
          spotContext: { spotName: "X".repeat(20_000) },
        }),
      ),
    );
    assert.equal(r400Ctx.status, 400);

    // 400 gtoDistribution fora de 0..1
    const r400Dist = await coachPost(
      makeCoachReq(
        JSON.stringify({
          prompt: "teste",
          spotContext: { gtoDistribution: { Raise: 1.4 } },
        }),
      ),
    );
    assert.equal(r400Dist.status, 400);

    // 400 imageBase64 malformado
    const r400Img = await coachPost(
      makeCoachReq(
        JSON.stringify({
          prompt: "teste",
          apiKey: "fake-key-for-validation-check",
          imageBase64: "not valid base64 $$$",
          imageMimeType: "image/png",
        }),
      ),
    );
    assert.equal(r400Img.status, 400);

    // 429 ao exceder 20 requisições na janela de 1 min
    let hit429 = false;
    for (let i = 0; i < 25; i++) {
      const res = await coachPost(makeCoachReq("{bad"));
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert.equal(hit429, true);
  });
});
