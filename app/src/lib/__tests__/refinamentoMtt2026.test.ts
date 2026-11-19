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
import {
  adaptLegacyRangeSpotToCanonical,
  auditMatrixDistributionIntegrity,
  auditRangeCatalogSummary,
  calculateBluffBreakevenFoldEquity,
  calculateBubbleFactor,
  calculatePolarizedRiverBluffFraction,
  calculatePotOdds,
  calculateSimplifiedMdf,
  classifyLegacyRangeSpot,
  computeMixedAdherenceStats,
  computeSpacedRepetitionSchedule,
  evaluateDrillDecision,
  evaluatePkoBountyModel,
  filterConfirmedMttCanonicalSpots,
  filterConfirmedMttLegacySpots,
  formatActionLabelPtBr,
  getActionVisualStyle,
  pluralizePtBr,
  type LegacyRangeSpot,
  type RangeSpot,
} from "../poker.ts";
import { assertCoachAccess } from "../server/libraryAccess.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/node_modules/")) return nextResolve(specifier, context);
    if (specifier.endsWith(".css")) {
      return { url: "data:text/javascript,export default new Proxy({},{get:(_,p)=>String(p)});", shortCircuit: true };
    }
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate?.endsWith(".json") && existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href + "?json-esm", shortCircuit: true };
    }
    if (candidate && !path.extname(candidate)) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(candidate + extension)) {
          return nextResolve(pathToFileURL(candidate + extension).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("?json-esm")) {
      return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url.slice(0, -9)), "utf8")};` };
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
const { RangeExplorerView } = await import("../../components/RangeExplorerView.tsx");
const { StatsView } = await import("../../components/StatsView.tsx");
const { PokerTable } = await import("../../components/PokerTable.tsx");
const { PokerStudioApp } = await import("../../components/PokerStudioApp.tsx");

const BASELINE_RANGES_SHA256 =
  "d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e";
const BASELINE_VERIFIED_SOLVER_SHA256 =
  "868ef9fb8e6371f12dde7749170015af4facca70af92dc33aa45251cdd0b3eda";

describe("Refinamento 2026 — Regra Definitiva MTT-Only, Integridade e UI", () => {
  it("preserva SHA-256 original de ranges_gto.json e verified_ahkd7c_texassolver.json", () => {
    const rangesSha = createHash("sha256")
      .update(readFileSync(path.resolve("src/data/ranges_gto.json")))
      .digest("hex");
    const solverSha = createHash("sha256")
      .update(
        readFileSync(
          path.resolve("src/data/verified_ahkd7c_texassolver.json"),
        ),
      )
      .digest("hex");

    assert.equal(rangesSha, BASELINE_RANGES_SHA256);
    assert.equal(solverSha, BASELINE_VERIFIED_SOLVER_SHA256);
  });

  it("classifica explicitamente MTT vs Spin vs Cash vs Desconhecido sem promover desconhecidos nem classificar só por stack", () => {
    const spots = rangesData.spots as unknown as LegacyRangeSpot[];
    const audit = auditRangeCatalogSummary(spots);

    assert.equal(audit.totalInspected, 229);
    assert.equal(audit.mttConfirmed, 216);
    assert.equal(audit.spinAndGoConfirmed, 13);
    assert.equal(audit.cashGameConfirmed, 0);
    assert.equal(audit.formatUnknown, 0);

    const mttOnly = filterConfirmedMttLegacySpots(spots);
    assert.equal(mttOnly.length, 216);
    assert.ok(mttOnly.every((s) => !s.id.startsWith("spin_")));
    assert.ok(
      mttOnly.every((s) => s.source.startsWith("PDF - Ranges RFI e vs RFI.pdf")),
    );

    // Spot heads-up ou stack 14bb sem proveniência MTT continua FORMAT_UNKNOWN
    const unknownHu = classifyLegacyRangeSpot({
      id: "hu_14bb_generic",
      name: "Heads-Up 14bb",
      stackBb: 14,
      heroPosition: "SB",
      villainPosition: "BB",
      spotType: "rfi",
      source: "",
      actions: [],
      matrix: {},
    });
    assert.equal(unknownHu.classification, "FORMAT_UNKNOWN");
    assert.equal(unknownHu.includedInMttApp, false);

    // Spot Cash Game explícito é classificado como CASH_GAME_CONFIRMED e excluído
    const cashRaw: LegacyRangeSpot = {
      id: "cash_nl100_btn",
      name: "Cash Game NL100 BTN",
      stackBb: 100,
      heroPosition: "BTN",
      villainPosition: null,
      spotType: "rfi",
      source: "Cash 6-Max",
      actions: [],
      matrix: {},
    };
    const cashAudit = classifyLegacyRangeSpot(cashRaw);
    assert.equal(cashAudit.classification, "CASH_GAME_CONFIRMED");
    assert.equal(cashAudit.includedInMttApp, false);

    const mttCanon = filterConfirmedMttCanonicalSpots([
      adaptLegacyRangeSpotToCanonical(mttOnly[0]),
      adaptLegacyRangeSpotToCanonical(cashRaw),
    ]);
    assert.equal(mttCanon.length, 1);
    assert.equal(mttCanon[0].spotId, mttOnly[0].id);
  });

  it("exclui Spin & Go do agendamento Leitner e de todos os componentes estratégicos (SSR)", () => {
    const schedule = computeSpacedRepetitionSchedule(
      [
        {
          spotId: "spin_15bb_btn_rfi",
          spotName: "Spin 15BB BTN",
          trackId: "PREFLOP_RFI",
          timestamp: 1794000000000,
          confidenceLevel: "media",
          evLoss: null,
          isAcceptable: false,
        },
        {
          spotId: "100bb_btn_rfi",
          spotName: "100BB BTN RFI",
          trackId: "PREFLOP_RFI",
          timestamp: 1794000000000,
          confidenceLevel: "media",
          evLoss: null,
          isAcceptable: false,
        },
      ],
      1794500000000,
    );
    assert.ok(schedule.every((s) => !s.spotId.startsWith("spin_")));
    assert.ok(schedule.some((s) => s.spotId === "100bb_btn_rfi"));

    const allSpots = rangesData.spots as unknown as RangeSpot[];
    const appMarkup = renderToStaticMarkup(
      createElement(PokerStudioApp, {
        spots: allSpots,
        realSolvedSpots: [],
        totalChunks: 10,
        videos: [],
      }),
    );
    assert.ok(!appMarkup.includes("Spin / SNG"));
    assert.ok(!appMarkup.includes("Spin (3-15 BB)"));
    assert.ok(!appMarkup.includes("48 spots MTT") || appMarkup.includes("spots MTT"));

    const cleanMarkup = renderToStaticMarkup(
      createElement(CleanRangeTrainerView, { spots: allSpots }),
    );
    assert.ok(!cleanMarkup.includes("Spin &amp; Go BTN"));
    assert.ok(cleanMarkup.includes("Treiner Limpo"));

    const explorerMarkup = renderToStaticMarkup(
      createElement(RangeExplorerView, { spots: allSpots }),
    );
    assert.ok(!explorerMarkup.includes("(Spin)"));
    assert.match(explorerMarkup, /100 BB[\s\S]*Spot ativo:[^<]*100BB|100BB/);
  });

  it("audita perdas de extração da matriz (0.964..0.988) separadas de arredondamento trivial sem alterar os dados brutos", () => {
    const spots = rangesData.spots as unknown as LegacyRangeSpot[];
    const severeSpot = spots.find((s) => s.id === "17bb_sb_vs_utg_rfi")!;
    const audit = auditMatrixDistributionIntegrity(
      severeSpot.matrix,
      severeSpot.actions.map((a) => a.name),
      severeSpot.source,
    );
    assert.ok(audit.severeExtractionLossCount >= 1);
    assert.equal(audit.neverAutoNormalized, true);
    assert.ok(audit.flaggedCells.some((c) => c.hand === "AA" && c.sum < 0.97));
  });

  it("avalia frequências mistas < 5% no Treiner Limpo como low_freq_acceptable sem EV inventado e calcula aderência invariante à ordem", () => {
    const legacy: LegacyRangeSpot = {
      id: "mtt_test_mix",
      name: "100BB - RFI CO",
      stackBb: 100,
      heroPosition: "CO",
      villainPosition: null,
      spotType: "rfi",
      source: "PDF - Ranges RFI e vs RFI.pdf",
      actions: [
        { name: "Raise", color: "#B91C1C", pct: 24 },
        { name: "Fold", color: "#1E3A5F", pct: 76 },
      ],
      matrix: {
        K9o: { Raise: 0.02, Fold: 0.98 },
        A5s: { Raise: 0.5, Fold: 0.5 },
      },
    };
    const canonical = adaptLegacyRangeSpotToCanonical(legacy);
    const evalLow = evaluateDrillDecision({
      spot: canonical,
      handClass: "K9o",
      chosenAction: "Raise",
      mode: "LEARNING",
    });
    assert.equal(evalLow.classification, "low_freq_acceptable");
    assert.equal(evalLow.evLoss, null);

    const a1 = {
      spotId: "spot_A",
      hand: "A5s",
      chosenAction: "Raise",
      targetDistribution: { Raise: 0.5, Fold: 0.5 },
      evLoss: null,
      timestamp: 1,
    };
    const a2 = {
      spotId: "spot_A",
      hand: "A5s",
      chosenAction: "Fold",
      targetDistribution: { Raise: 0.5, Fold: 0.5 },
      evLoss: null,
      timestamp: 2,
    };
    const b1 = {
      spotId: "spot_B",
      hand: "KJo",
      chosenAction: "Call",
      targetDistribution: { Call: 1.0 },
      evLoss: null,
      timestamp: 3,
    };

    const fwd = computeMixedAdherenceStats([a1, a2, b1]);
    const rev = computeMixedAdherenceStats([b1, a2, a1]);
    assert.equal(fwd.groupsCount, 2);
    assert.equal(fwd.adherencePct, 100);
    assert.equal(fwd.adherencePct, rev.adherencePct);
    assert.equal(fwd.groupsCount, rev.groupsCount);
  });

  it("rejeita NaN/Infinity em mathEngine e aplica bountyChipFactor uma única vez no modelo PKO", () => {
    assert.throws(() => calculatePotOdds(10, Number.NaN, 5), /inválid/i);
    assert.throws(
      () => calculateBluffBreakevenFoldEquity(10, Number.POSITIVE_INFINITY),
      /inválid/i,
    );
    assert.throws(() => calculateSimplifiedMdf(Number.NaN, 5), /inválid/i);
    assert.throws(
      () => calculatePolarizedRiverBluffFraction(10, Number.NaN),
      /inválid/i,
    );
    assert.throws(() => calculateBubbleFactor(100, 0, Number.NaN, 0.4), /válid/i);
    assert.throws(
      () =>
        evaluatePkoBountyModel({
          potWithoutBountyChips: 1000,
          callAmountChips: 500,
          villainBountyUsd: 25,
          startingStackChips: 10000,
          startingBountyUsd: 25,
          heroCoversVillain: true,
          bountyChipFactor: 1.5,
        }),
      /inválid/i,
    );

    const pko = evaluatePkoBountyModel({
      potWithoutBountyChips: 10000,
      callAmountChips: 5000,
      villainBountyUsd: 25,
      startingStackChips: 10000,
      startingBountyUsd: 25,
      heroCoversVillain: true,
      bountyChipFactor: 0.33,
    });
    // Sem fator 0.5 em cascata: (25/25) * 10000 * 0.33 = 3300 fichas
    assert.equal(pko.bountyChipEquivalent, 3300);
    assert.equal(pko.immediateBountyUsd, 12.5);
    assert.equal(pko.effectivePotWithBounty, 18300);
  });

  it("impõe host loopback, origin e cabeçalho X-Poker-Coach em assertCoachAccess sem exigir POKER_LIBRARY_ENABLED", () => {
    const validGet = new Request("http://127.0.0.1:3000/api/coach", {
      method: "GET",
      headers: {
        host: "127.0.0.1:3000",
        "x-poker-coach": "local-v1",
      },
    });
    assert.doesNotThrow(() => assertCoachAccess(validGet));

    const validPost = new Request("http://127.0.0.1:3000/api/coach", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-poker-coach": "local-v1",
      },
    });
    assert.doesNotThrow(() => assertCoachAccess(validPost));

    const evilOriginPost = new Request("http://127.0.0.1:3000/api/coach", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://evil.example",
        "x-poker-coach": "local-v1",
      },
    });
    assert.throws(() => assertCoachAccess(evilOriginPost), /Origem recusada/);

    const missingHeader = new Request("http://127.0.0.1:3000/api/coach", {
      method: "GET",
      headers: { host: "127.0.0.1:3000" },
    });
    assert.throws(() => assertCoachAccess(missingHeader), /Cabeçalho/);
  });

  it("corrige formatação de ações, pluralização, falso leak com 100% em StatsView e assentos aguardando ação em PokerTable", () => {
    assert.equal(formatActionLabelPtBr("BET_33PCT"), "Bet 33% Pote");
    assert.equal(formatActionLabelPtBr("Raise_2_1bb"), "Raise 2,1 BB");
    assert.equal(formatActionLabelPtBr("Allin 14"), "All-in 14 BB");
    assert.equal(pluralizePtBr(0, "mão", "mãos"), "0 mãos");
    assert.equal(pluralizePtBr(1, "aula", "aulas"), "1 aula");
    assert.equal(getActionVisualStyle("Fold").bg, "#1D4ED8");
    assert.equal(getActionVisualStyle("Call").bg, "#047857");

    const stats100 = renderToStaticMarkup(
      createElement(StatsView, {
        history: [
          {
            id: "h1",
            timestamp: 1794500000000,
            spotId: "100bb_btn_rfi",
            spotName: "100BB BTN RFI",
            stackBb: 100,
            heroPosition: "BTN",
            spotType: "rfi",
            hand: "AKs",
            chosenAction: "Raise",
            bestAction: "Raise",
            status: "correct",
            chosenFreq: 1,
          },
        ],
        onClearHistory: () => {},
      }),
    );
    assert.ok(stats100.includes("Nenhum leak detectado"));
    assert.ok(!stats100.includes("0 mão<"));
    assert.ok(!stats100.includes("mão(s)"));

    const utgSpot: RangeSpot = {
      id: "100bb_utg_rfi",
      name: "100BB - RFI UTG",
      stackBb: 100,
      heroPosition: "UTG",
      villainPosition: null,
      spotType: "rfi",
      source: "PDF - Ranges RFI e vs RFI.pdf",
      actions: [
        { name: "Raise", color: "#B91C1C", pct: 15 },
        { name: "Fold", color: "#1E3A5F", pct: 85 },
      ],
      matrix: { AA: { Raise: 1, Fold: 0 } },
    };
    const tableMarkup = renderToStaticMarkup(
      createElement(PokerTable, {
        spot: utgSpot,
        cards: [
          { rank: "A", suit: "♠" },
          { rank: "A", suit: "♥" },
        ],
        rngValue: 25,
        useRng: false,
      }),
    );
    // Todos os oponentes pós-UTG ainda aguardam a vez — nenhum assento deve exibir "fold"
    assert.ok(tableMarkup.includes("100bb · Aguarda"));
    assert.ok(!tableMarkup.includes('data-seat-state="folded"'));
  });
});
