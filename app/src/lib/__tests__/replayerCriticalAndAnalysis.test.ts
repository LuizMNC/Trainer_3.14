import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function resolveWithExtensions(basePath: string): string | null {
  for (const candidate of [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.json`]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = resolveWithExtensions(path.join(SRC_ROOT, specifier.slice(2)));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier) &&
      context.parentURL?.startsWith("file:")
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = resolveWithExtensions(path.resolve(parentDir, specifier));
      if (target) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export default new Proxy({}, { get: (_t, prop) => String(prop) });",
      };
    }
    if (url.endsWith(".json") && url.includes("replayExamples")) {
      return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
    }
    if (url.endsWith(".tsx")) {
      const filePath = fileURLToPath(url);
      const code = readFileSync(filePath, "utf8");
      const compiled = ts.transpileModule(code, {
        fileName: filePath,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      });
      return { format: "module", shortCircuit: true, source: compiled.outputText };
    }
    return nextLoad(url, context);
  },
});

const { ComponentErrorBoundary } = (await import(
  "../../components/ComponentErrorBoundary.tsx"
)) as typeof import("../../components/ComponentErrorBoundary.tsx");
const { ReplayerView } = (await import(
  "../../components/ReplayerView.tsx"
)) as typeof import("../../components/ReplayerView.tsx");
import type { CanonicalHand } from "../poker/handHistorySchema.ts";
import { parseCanonicalHandText } from "../poker/handHistoryValidation.ts";
import {
  assessHandReplayability,
  buildReplayFrame,
  buildReplayFrameSafe,
  replayPlayerName,
  safeFormatAtoms,
  safeParseCard,
  UNREPLAYABLE_HAND_MESSAGE,
} from "../poker/handReplay.ts";
import {
  AI_PRACTICAL_QUESTIONS,
  analyzeDecisionSizing,
  analyzeMttReferenceAndFindings,
  buildSafeAiQuestionPayload,
} from "../poker/postSessionAnalysis.ts";
import {
  adaptLegacyRangeSpotToCanonical,
  filterConfirmedMttCanonicalSpots,
  importTexasSolverBundle,
  type LegacyRangeSpot,
  type TexasSolverBundleV1,
} from "../poker.ts";

function loadSample(name: string): CanonicalHand {
  return parseCanonicalHandText(readFileSync(`public/replays/${name}.json`, "utf8"));
}

function makeMinimalCanonicalHand(opts: {
  players: number;
  gameFormat?: CanonicalHand["gameFormat"];
  complete?: boolean;
  streetAfterFlop?: boolean;
  includeRaise?: boolean;
  cardsVisibleToIdx?: number;
  withSidePot?: boolean;
  withReturn?: boolean;
}): CanonicalHand {
  const n = opts.players;
  const positionsMap: Record<number, string[]> = {
    3: ["SB", "BB", "BTN"],
    6: ["SB", "BB", "LJ", "HJ", "CO", "BTN"],
    7: ["SB", "BB", "MP", "LJ", "HJ", "CO", "BTN"],
    8: ["SB", "BB", "UTG", "MP", "LJ", "HJ", "CO", "BTN"],
    9: ["SB", "BB", "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN"],
  };
  const roles = positionsMap[n] ?? Array.from({ length: n }, (_, i) => (i === 0 ? "SB" : i === 1 ? "BB" : "OTHER"));
  const stack0 = "10000";
  const stacks0 = Array.from({ length: n }, () => stack0);
  const zeros = Array.from({ length: n }, () => "0");
  const falses = Array.from({ length: n }, () => false);
  const blinds = ["50", "100", ...Array.from({ length: Math.max(0, n - 2) }, () => "0")];

  const baseSnap = {
    street: "PREFLOP" as const,
    board: [] as string[],
    stacksAtoms: [...stacks0],
    betsAtoms: [...zeros],
    potAtoms: "0",
    actorIndex: null as number | null,
    folded: [...falses],
    mucked: [...falses],
    allIn: [...falses],
  };

  // Constrói eventos válidos de Blind, Blind, Deal x n, Folds até showdown/encerramento
  const events: CanonicalHand["events"] = [];
  let cur = structuredClone(baseSnap);
  let seq = 0;

  // SB post 50
  const sbPaid = [...zeros];
  sbPaid[0] = "50";
  const afterSb = structuredClone(cur);
  afterSb.stacksAtoms[0] = "9950";
  afterSb.betsAtoms[0] = "50";
  afterSb.potAtoms = "50";
  afterSb.actorIndex = null;
  events.push({
    sequence: seq++,
    sourceActionIndex: null,
    origin: "RULE_DERIVED",
    kind: "BlindOrStraddlePosting",
    playerIndex: 0,
    amountAtoms: "50",
    cards: [],
    paidAtoms: sbPaid,
    returnedAtoms: [...zeros],
    awardedAtoms: [...zeros],
    before: cur,
    after: afterSb,
  });
  cur = afterSb;

  // BB post 100
  const bbPaid = [...zeros];
  bbPaid[1] = "100";
  const afterBb = structuredClone(cur);
  afterBb.stacksAtoms[1] = "9900";
  afterBb.betsAtoms[1] = "100";
  afterBb.potAtoms = "150";
  afterBb.actorIndex = null;
  events.push({
    sequence: seq++,
    sourceActionIndex: null,
    origin: "RULE_DERIVED",
    kind: "BlindOrStraddlePosting",
    playerIndex: 1,
    amountAtoms: "100",
    cards: [],
    paidAtoms: bbPaid,
    returnedAtoms: [...zeros],
    awardedAtoms: [...zeros],
    before: cur,
    after: afterBb,
  });
  cur = afterBb;

  const sha = "a".repeat(64);
  const actions: string[] = [];
  for (let i = 0; i < n; i++) {
    const cards: [string | null, string | null] =
      i === (opts.cardsVisibleToIdx ?? 0) ? ["As", "Kd"] : [null, null];
    const next = structuredClone(cur);
    if (i === n - 1) {
      next.actorIndex = n > 2 ? 2 : 0;
    }
    actions.push(`d dh p${i + 1} ${cards[0] ? "AsKd" : "????"}`);
    events.push({
      sequence: seq++,
      sourceActionIndex: actions.length - 1,
      origin: "POKERSTARS",
      kind: "HoleDealing",
      playerIndex: i,
      amountAtoms: null,
      cards,
      paidAtoms: [...zeros],
      returnedAtoms: [...zeros],
      awardedAtoms: [...zeros],
      before: cur,
      after: next,
    });
    cur = next;
  }

  // Todos a partir do índice 2 dão fold (ou jogador 2 dá raise se includeRaise)
  for (let i = 2; i < n; i++) {
    const next = structuredClone(cur);
    next.folded[i] = true;
    next.actorIndex = i + 1 < n ? i + 1 : 0;
    actions.push(`p${i + 1} f`);
    events.push({
      sequence: seq++,
      sourceActionIndex: actions.length - 1,
      origin: "POKERSTARS",
      kind: "Folding",
      playerIndex: i,
      amountAtoms: null,
      cards: [],
      paidAtoms: [...zeros],
      returnedAtoms: [...zeros],
      awardedAtoms: [...zeros],
      before: cur,
      after: next,
    });
    cur = next;
  }

  // Se incomplete/partial, termina aqui no pré-flop sem resultado final
  if (opts.complete === false) {
    return {
      schemaVersion: "1.0.0",
      profile: "PHH_NT_SUBSET_1",
      recordId: `ps-sha256:${sha}`,
      source: {
        format: "POKERSTARS",
        targetStandardVersion: "PS_TEXT_1",
        sha256: sha,
        byteLength: 500,
        fileName: { status: "REPORTED", value: `mesa_${n}.txt` },
        handId: { status: "REPORTED", value: `99900${n}` },
        importedAtUtc: "2026-11-17T00:00:00+00:00",
      },
      variant: "NLHE",
      gameFormat: opts.gameFormat ?? { status: "INFERRED", value: "MTT", reason: "2 mesas observadas." },
      amountPolicy: { encoding: "UNSIGNED_INTEGER_STRING", decimalPlaces: 0, currency: { status: "REPORTED", value: "USD" } },
      table: {
        playerCount: n,
        seatCount: { status: "REPORTED", value: n },
        rawBlindsAtoms: blinds,
        rawAntesAtoms: [...zeros],
        minBetAtoms: "100",
        anteTrimming: { status: "REPORTED", value: false },
      },
      players: Array.from({ length: n }, (_, i) => ({
        index: i,
        sourceLabel: `p${i + 1}`,
        name: { status: "REPORTED", value: i === 0 ? "JogadorPrivadoReal" : `Player${i + 1}` },
        seat: { status: "REPORTED", value: i + 1 },
        position: { status: "INFERRED", value: roles[i]!, reason: "Rotação PHH" },
        initialStackAtoms: stack0,
        holeCards: {
          status: i === (opts.cardsVisibleToIdx ?? 0) ? "REPORTED" : "REPORTED",
          value: i === (opts.cardsVisibleToIdx ?? 0) ? ["As", "Kd"] : [null, null],
        },
      })),
      sourceActions: actions,
      events,
      ending: cur,
      pots: [],
      results: {
        complete: false,
        computedFinalStacksAtoms: null,
        reportedEndingStacksAtoms: { status: "MISSING" },
        grossContributionsAtoms: events.reduce((acc, e) => acc.map((v, idx) => String(BigInt(v) + BigInt(e.paidAtoms[idx]!))), [...zeros]),
        returnedAtoms: [...zeros],
        netContributionsAtoms: events.reduce((acc, e) => acc.map((v, idx) => String(BigInt(v) + BigInt(e.paidAtoms[idx]!))), [...zeros]),
        awardsAtoms: [...zeros],
      },
      integrity: {
        status: "VALIDATED_PARTIAL",
        validator: "PokerKit",
        validatorVersion: "0.7.7",
        engineMode: "CASH_GAME",
        gtoAnalysis: "NOT_EVALUATED",
        evLoss: null,
        assumptions: [],
        warnings: ["Trecho parcial."],
      },
      metadata: { tournamentId: "404000001" },
    };
  }

  // SB fold -> retorna 50 para BB e liquida no pré-flop
  const foldSb = structuredClone(cur);
  foldSb.folded[0] = true;
  foldSb.actorIndex = null;
  actions.push("p1 f");
  events.push({
    sequence: seq++,
    sourceActionIndex: actions.length - 1,
    origin: "POKERSTARS",
    kind: "Folding",
    playerIndex: 0,
    amountAtoms: null,
    cards: [],
    paidAtoms: [...zeros],
    returnedAtoms: [...zeros],
    awardedAtoms: [...zeros],
    before: cur,
    after: foldSb,
  });
  cur = foldSb;

  // BetCollection -> UncollectedBetReturn -> ChipsPushing -> ChipsPulling (espelha PokerKit/hu_fold)
  const colAfter = structuredClone(cur);
  colAfter.betsAtoms = [...zeros];
  colAfter.betsAtoms[1] = "100";
  events.push({
    sequence: seq++,
    sourceActionIndex: actions.length - 1,
    origin: "RULE_DERIVED",
    kind: "BetCollection",
    playerIndex: null,
    amountAtoms: null,
    cards: [],
    paidAtoms: [...zeros],
    returnedAtoms: [...zeros],
    awardedAtoms: [...zeros],
    before: cur,
    after: colAfter,
  });
  cur = colAfter;

  const retArr = [...zeros];
  retArr[1] = "50";
  events.push({
    sequence: seq++,
    sourceActionIndex: actions.length - 1,
    origin: "RULE_DERIVED",
    kind: "UncollectedBetReturn",
    playerIndex: null,
    amountAtoms: null,
    cards: [],
    paidAtoms: [...zeros],
    returnedAtoms: retArr,
    awardedAtoms: [...zeros],
    before: cur,
    after: cur,
  });

  const awd = [...zeros];
  awd[1] = "100";
  const pushAfter = structuredClone(cur);
  pushAfter.betsAtoms[1] = "150";
  events.push({
    sequence: seq++,
    sourceActionIndex: actions.length - 1,
    origin: "RULE_DERIVED",
    kind: "ChipsPushing",
    playerIndex: null,
    amountAtoms: null,
    cards: [],
    paidAtoms: [...zeros],
    returnedAtoms: [...zeros],
    awardedAtoms: awd,
    before: cur,
    after: pushAfter,
  });
  cur = pushAfter;

  const pullAfter = structuredClone(cur);
  pullAfter.betsAtoms = [...zeros];
  pullAfter.potAtoms = "0";
  pullAfter.stacksAtoms[1] = "10050";
  events.push({
    sequence: seq++,
    sourceActionIndex: actions.length - 1,
    origin: "RULE_DERIVED",
    kind: "ChipsPulling",
    playerIndex: 1,
    amountAtoms: "150",
    cards: [],
    paidAtoms: [...zeros],
    returnedAtoms: [...zeros],
    awardedAtoms: [...zeros],
    before: cur,
    after: pullAfter,
  });
  cur = pullAfter;

  const net = [...zeros];
  net[0] = "50";
  net[1] = "50";
  const gross = [...zeros];
  gross[0] = "50";
  gross[1] = "100";

  return {
    schemaVersion: "1.0.0",
    profile: "PHH_NT_SUBSET_1",
    recordId: `ps-sha256:${sha}`,
    source: {
      format: "POKERSTARS",
      targetStandardVersion: "PS_TEXT_1",
      sha256: sha,
      byteLength: 500,
      fileName: { status: "REPORTED", value: `mesa_${n}.txt` },
      handId: { status: "REPORTED", value: `88800${n}` },
      importedAtUtc: "2026-11-17T00:00:00+00:00",
    },
    variant: "NLHE",
    gameFormat: opts.gameFormat ?? { status: "INFERRED", value: "MTT", reason: "2 mesas observadas." },
    amountPolicy: { encoding: "UNSIGNED_INTEGER_STRING", decimalPlaces: 0, currency: { status: "REPORTED", value: "USD" } },
    table: {
      playerCount: n,
      seatCount: { status: "REPORTED", value: n },
      rawBlindsAtoms: blinds,
      rawAntesAtoms: [...zeros],
      minBetAtoms: "100",
      anteTrimming: { status: "REPORTED", value: false },
    },
    players: Array.from({ length: n }, (_, i) => ({
      index: i,
      sourceLabel: `p${i + 1}`,
      name: { status: "REPORTED", value: i === 0 ? "JogadorPrivadoReal" : `Player${i + 1}` },
      seat: { status: "REPORTED", value: i + 1 },
      position: { status: "INFERRED", value: roles[i]!, reason: "Rotação PHH" },
      initialStackAtoms: stack0,
      holeCards: {
        status: "REPORTED",
        value: i === (opts.cardsVisibleToIdx ?? 0) ? ["As", "Kd"] : [null, null],
      },
    })),
    sourceActions: actions,
    events,
    ending: cur,
    pots: [
      {
        index: 0,
        amountAtoms: "100",
        eligiblePlayerIndices: [1],
        awardsAtoms: awd,
        origin: "RULE_DERIVED",
      },
    ],
    results: {
      complete: true,
      computedFinalStacksAtoms: cur.stacksAtoms,
      reportedEndingStacksAtoms: { status: "REPORTED", value: cur.stacksAtoms },
      grossContributionsAtoms: gross,
      returnedAtoms: retArr,
      netContributionsAtoms: net,
      awardsAtoms: awd,
    },
    integrity: {
      status: "VALIDATED_COMPLETE",
      validator: "PokerKit",
      validatorVersion: "0.7.7",
      engineMode: "CASH_GAME",
      gtoAnalysis: "NOT_EVALUATED",
      evLoss: null,
      assumptions: [],
      warnings: [],
    },
    metadata: { tournamentId: "404000001" },
  };
}

describe("Correção Crítica Replayer + Análise Pós-Sessão (Etapas 4–12)", () => {
  it("ErrorBoundary captura ChunkLoadError e erro de reprodução sem derrubar o app e preserva retorno à Biblioteca", () => {
    const chunkState = ComponentErrorBoundary.getDerivedStateFromError(
      Object.assign(new Error("Loading chunk app_src_components_ReplayerView_tsx failed"), {
        name: "ChunkLoadError",
      }),
    );
    assert.equal(chunkState.hasError, true);
    assert.equal(chunkState.isChunkError, true);

    function ThrowingChild(): React.ReactNode {
      throw new Error("boom");
    }
    const boundary = new ComponentErrorBoundary({
      title: UNREPLAYABLE_HAND_MESSAGE,
      onBackToLibrary: () => {},
      children: createElement(ThrowingChild),
    });
    boundary.state = ComponentErrorBoundary.getDerivedStateFromError(new Error("events[0]: ausente"));
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
    assert.match(html, /Não foi possível reproduzir esta mão\. Alguns dados do histórico estão incompletos\./);
    assert.match(html, /Voltar à Biblioteca/);
    assert.match(html, /events\[0\]: ausente/);
  });

  it("assessHandReplayability e buildReplayFrameSafe nunca lançam exceções em mãos inválidas ou incompletas", () => {
    const invalidCases: unknown[] = [
      null,
      {},
      { schemaVersion: "1.0.0", profile: "PHH_NT_SUBSET_1" },
      (() => {
        const h = loadSample("hu_fold");
        return { ...h, events: [] };
      })(),
      (() => {
        const h = loadSample("hu_fold");
        const broken = structuredClone(h);
        broken.events[0]!.after.board = ["XX"];
        return broken;
      })(),
    ];

    for (const bad of invalidCases) {
      const assessed = assessHandReplayability(bad);
      assert.equal(assessed.ok, false);
      if (!assessed.ok) {
        assert.equal(assessed.summary, UNREPLAYABLE_HAND_MESSAGE);
        assert.ok(assessed.detail.length > 0);
      }
    }

    const h = loadSample("hu_fold");
    const safeOut = buildReplayFrameSafe(h, 9999, { kind: "player", playerIndex: 99 });
    assert.equal(safeOut.ok, true);
    assert.equal(safeFormatAtoms("invalid-atom", 2), "—");
    assert.equal(safeParseCard("??"), null);
    assert.equal(replayPlayerName(h, 99), "Jogador 100");
  });

  it("reproduz mãos com 3, 6, 7, 8 e 9 jogadores, encerramento pré-flop, parcial no flop, showdown, all-in, side pots, cartas ocultas e devoluções", () => {
    for (const count of [3, 6, 7, 8, 9]) {
      const h = makeMinimalCanonicalHand({ players: count });
      const check = assessHandReplayability(h);
      assert.equal(check.ok, true, `Falha em ${count} jogadores: ${check.ok ? "" : check.detail}`);
      const endFrame = buildReplayFrame(h, h.events.length, { kind: "public" });
      assert.equal(endFrame.completed, true);
      assert.equal(endFrame.snapshot.street, "PREFLOP");
      // Cartas privadas ocultas na perspectiva pública
      assert.deepEqual(endFrame.visibleCards[0], [null, null]);
      const p0Frame = buildReplayFrame(h, h.events.length, { kind: "player", playerIndex: 0 });
      assert.deepEqual(p0Frame.visibleCards[0], ["As", "Kd"]);
    }

    // Mão parcial no pré-flop e mão parcial do catálogo no flop
    const partialPre = makeMinimalCanonicalHand({ players: 6, complete: false });
    const partialPreCheck = assessHandReplayability(partialPre);
    assert.equal(partialPreCheck.ok, true);
    const partialPreEnd = buildReplayFrame(partialPre, partialPre.events.length, { kind: "public" });
    assert.equal(partialPreEnd.completed, false);
    assert.equal(partialPreEnd.atEnd, true);

    const partialFlop = loadSample("partial_flop");
    assert.equal(assessHandReplayability(partialFlop).ok, true);
    assert.equal(buildReplayFrame(partialFlop, partialFlop.events.length, { kind: "public" }).completed, false);

    // Exemplos reais de side pots, all-in, showdown e devoluções
    for (const sampleName of ["three_way_allin", "folded_sidepot", "showdown_muck", "hu_fold"]) {
      const h = loadSample(sampleName);
      assert.equal(assessHandReplayability(h).ok, true);
      const html = renderToStaticMarkup(createElement(ReplayerView, { onBackToLibrary: () => {} }));
      assert.match(html, /Voltar à Biblioteca/);
    }
  });

  it("calcula exatamente Pote 10 BB / Aposta 5 BB = 50% / Equidade mínima 25% e distingue incremento vs alvo no raise", () => {
    const h = makeMinimalCanonicalHand({ players: 3 });
    // Fabrica um frame de aposta em FLOP onde pote antes é 1000 (10 BB) e ator aposta 500 (5 BB)
    const betEvent = structuredClone(h.events[h.events.length - 1]!);
    betEvent.kind = "CompletionBettingOrRaisingTo";
    betEvent.playerIndex = 2;
    betEvent.amountAtoms = "500";
    betEvent.before.street = "FLOP";
    betEvent.before.board = ["Ah", "Kd", "2c"];
    betEvent.before.potAtoms = "1000";
    betEvent.before.betsAtoms = ["0", "0", "0"];
    betEvent.before.stacksAtoms = ["3000", "3000", "2500"];
    betEvent.before.folded = [false, false, false];
    betEvent.paidAtoms = ["0", "0", "500"];
    betEvent.after.potAtoms = "1500";
    betEvent.after.betsAtoms = ["0", "0", "500"];
    betEvent.after.stacksAtoms = ["3000", "3000", "2000"];

    const frame = {
      cursor: 5,
      snapshot: betEvent.after,
      event: betEvent,
      visibleCards: [
        [null, null],
        [null, null],
        ["As", "Kd"],
      ],
      dealt: [true, true, true],
      publicCards: [false, false, false],
      contributionsAtoms: ["500", "500", "1000"],
      returnedAtoms: ["0", "0", "0"],
      awardsAtoms: ["0", "0", "0"],
      atEnd: false,
      completed: false,
      showdown: false,
    };

    const m = analyzeDecisionSizing(h, frame);
    assert.equal(m.potBeforeBb, 10);
    assert.equal(m.paidBb, 5);
    assert.equal(m.betPctOfPot, 50);
    assert.equal(m.villainMinEquityVsBetPct, 25);
    assert.equal(m.effectiveStackBb, 25);
    assert.equal(m.spr, 2.5);
    assert.equal(m.activePlayersCount, 3);

    // Próximo jogador enfrenta pote 15 BB com 5 BB a pagar -> Equidade mínima para call = 5 / (15 + 5) = 25%
    const callEvent = structuredClone(betEvent);
    callEvent.kind = "CheckingOrCalling";
    callEvent.playerIndex = 1;
    callEvent.before = structuredClone(betEvent.after);
    callEvent.paidAtoms = ["0", "500", "0"];
    callEvent.after.potAtoms = "2000";
    callEvent.after.betsAtoms = ["0", "500", "500"];
    callEvent.after.stacksAtoms = ["3000", "2500", "2000"];
    const mCall = analyzeDecisionSizing(h, { ...frame, event: callEvent, snapshot: callEvent.after });
    assert.equal(mCall.toCallBb, 5);
    assert.equal(mCall.minEquityForCallPct, 25);

    // Raise com alvo 7 BB (já tinha 2 BB apostado antes -> paga incremento de 5 BB)
    const raiseEvent = structuredClone(betEvent);
    raiseEvent.kind = "CompletionBettingOrRaisingTo";
    raiseEvent.playerIndex = 1;
    raiseEvent.before.potAtoms = "1500";
    raiseEvent.before.betsAtoms = ["0", "200", "500"];
    raiseEvent.before.stacksAtoms = ["3000", "2800", "2000"];
    raiseEvent.paidAtoms = ["0", "500", "0"];
    raiseEvent.amountAtoms = "700";
    raiseEvent.after.betsAtoms = ["0", "700", "500"];
    raiseEvent.after.stacksAtoms = ["3000", "2300", "2000"];
    const mRaise = analyzeDecisionSizing(h, { ...frame, event: raiseEvent, snapshot: raiseEvent.after });
    assert.equal(mRaise.paidBb, 5);
    assert.equal(mRaise.totalStreetBetBb, 7);
    assert.equal(mRaise.toCallBb, 3);
  });

  it("respeita regra MTT-only: não usa Spin & Go/Desconhecido, não calcula EV loss sem solver verificado e sanitiza rascunho de IA", () => {
    const rawRanges = JSON.parse(readFileSync("src/data/ranges_gto.json", "utf8")) as { spots: LegacyRangeSpot[] };
    const texas = importTexasSolverBundle(
      JSON.parse(readFileSync("src/data/verified_ahkd7c_texassolver.json", "utf8")) as TexasSolverBundleV1,
    );
    const mttSpots = [
      ...filterConfirmedMttCanonicalSpots(rawRanges.spots.map(adaptLegacyRangeSpotToCanonical)),
      ...(texas.ok ? [texas.spot] : []),
    ];

    // 1. Mão com formato desconhecido nunca recebe range MTT nem Spin
    const unkHand = makeMinimalCanonicalHand({ players: 3, gameFormat: { status: "MISSING" } });
    const unkFrame = buildReplayFrame(unkHand, 6, { kind: "player", playerIndex: 0 });
    const unkMath = analyzeDecisionSizing(unkHand, unkFrame);
    const unkRef = analyzeMttReferenceAndFindings(unkHand, unkFrame, unkMath, mttSpots);
    assert.equal(unkRef.kind, "NO_COMPATIBLE_SOLUTION");
    assert.equal(unkRef.headline, "Não há solução GTO compatível com esta situação.");
    assert.equal(unkRef.findingCategory, "INCONCLUSIVE");
    assert.equal(unkRef.evLossValue, null);

    // 2. Mão MTT 8-max pré-flop (UTG RFI 100 BB) pode comparar chart importado SEM inventar EV loss
    const mtt8 = makeMinimalCanonicalHand({
      players: 8,
      gameFormat: { status: "INFERRED", value: "MTT", reason: "2 mesas no torneio." },
      cardsVisibleToIdx: 2,
    });
    // Testa decisão do índice 2 (UTG em 8-max: [SB, BB, UTG, ...]) no cursor 11 (p3 fold no template)
    const utgIdx = 2;
    const cursorUtg = mtt8.events.findIndex((e) => e.playerIndex === utgIdx && e.kind === "Folding") + 1;
    assert.ok(cursorUtg > 0);
    const f8 = buildReplayFrame(mtt8, cursorUtg, { kind: "player", playerIndex: utgIdx });
    const math8 = analyzeDecisionSizing(mtt8, f8);
    const ref8 = analyzeMttReferenceAndFindings(mtt8, f8, math8, mttSpots);
    assert.equal(ref8.kind, "IMPORTED_CHART_NO_EV");
    assert.equal(ref8.evLossValue, null);
    assert.equal(ref8.findingCategory, "STRATEGY_DEVIATION"); // AsKd (AKo) dando fold UTG 100BB
    assert.ok(ref8.limitations.some((l) => /não contêm valores de EV/i.test(l)));

    // 3. Payload para Assistente de IA remove nicks reais, torneio e IDs
    const draft = buildSafeAiQuestionPayload(mtt8, f8, math8, ref8, AI_PRACTICAL_QUESTIONS[0]);
    assert.ok(draft.includes(AI_PRACTICAL_QUESTIONS[0]));
    assert.equal(draft.includes("JogadorPrivadoReal"), false);
    assert.equal(draft.includes("888008"), false);
    assert.equal(draft.includes("404000001"), false);
    assert.equal(draft.includes("ps-sha256"), false);
  });
});
