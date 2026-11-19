import { comboToHandClass } from "./cards.ts";
import type { CanonicalHand, HandEvent } from "./handHistorySchema.ts";
import type { Street } from "./stateEngine.ts";
import {
  assessHandReplayability,
  replayEventLabel,
  replayPlayerName,
  safeBigInt,
  STREET_LABELS,
  type ReplayFrame,
} from "./handReplay.ts";
import type { CanonicalSpot, MatrixCellDeviation } from "./strategySchema.ts";
import { classifyActionRole, formatActionLabelPtBr } from "./uiPresentation.ts";

export interface DecisionMathAnalysis {
  hasDecision: boolean;
  street: Street;
  streetLabel: string;
  actorIndex: number | null;
  actorLabel: string;
  actorPosition: string | null;
  actionTitle: string;
  bigBlindAtoms: bigint;
  potBeforeAtoms: bigint;
  potBeforeBb: number | null;
  toCallAtoms: bigint;
  toCallBb: number | null;
  paidAtoms: bigint;
  paidBb: number | null;
  totalStreetBetAtoms: bigint | null;
  totalStreetBetBb: number | null;
  additionalWagerOverCallAtoms: bigint;
  additionalWagerOverCallBb: number | null;
  isBet: boolean;
  isRaise: boolean;
  isCall: boolean;
  isFold: boolean;
  isCheck: boolean;
  isAllIn: boolean;
  betPctOfPot: number | null;
  betPctBaseLabel: string | null;
  effectiveStackAtoms: bigint | null;
  effectiveStackBb: number | null;
  spr: number | null;
  minEquityForCallPct: number | null;
  potOddsRatio: string | null;
  villainMinEquityVsBetPct: number | null;
  activePlayersCount: number;
  hasAllInOrSidePot: boolean;
  previousStreetActions: string[];
  notes: string[];
}

export type ReferenceMatchKind =
  | "VERIFIED_GTO_SOLUTION"
  | "IMPORTED_CHART_NO_EV"
  | "MATHEMATICAL_AND_CONCEPTUAL_ONLY"
  | "NO_COMPATIBLE_SOLUTION";

export type FindingCategory =
  | "STRUCTURAL_ERROR"
  | "STRATEGY_DEVIATION"
  | "FREQUENCY_DEVIATION"
  | "EV_LOSS"
  | "INCONCLUSIVE"
  | "ALIGNED";

export interface MttReferenceAnalysis {
  kind: ReferenceMatchKind;
  headline: string;
  mttFormatDisclaimer: string;
  matchedSpotId: string | null;
  matchedSpotName: string | null;
  heroHandClass: string | null;
  chartFrequencies: Record<string, number> | null;
  chartSum: number | null;
  chartCellWarning: string | null;
  verifiedEvMap: Record<string, number> | null;
  evLossValue: number | null;
  evLossUnit: string | null;
  findingCategory: FindingCategory;
  findingLabel: string;
  findingSummary: string;
  limitations: string[];
  conceptualNotes: string[];
}

export const AI_PRACTICAL_QUESTIONS = [
  "Explique o tamanho desta aposta.",
  "Como avaliar meus pot odds?",
  "Como o stack efetivo influencia esta decisão?",
  "Que informações faltam para avaliar se o raise foi correto?",
] as const;

export function atomsToBb(atoms: bigint, bigBlindAtoms: bigint): number | null {
  if (bigBlindAtoms <= 0n) return null;
  // Usa escala milésima em bigint antes de dividir para preservar 3 casas sem overflow
  const scaled = (atoms * 1000n) / bigBlindAtoms;
  const rem = Number((atoms * 1000n) % bigBlindAtoms) / Number(bigBlindAtoms);
  return (Number(scaled) + rem) / 1000;
}

export function formatBb(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: value < 10 ? 1 : 1, maximumFractionDigits: 2 })} BB`;
}

export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function normalizedPosition(hand: CanonicalHand, index: number | null): string | null {
  if (index === null) return null;
  const p = hand.players[index];
  if (!p || p.position.status === "MISSING" || p.position.value === "OTHER") return null;
  return p.position.value;
}

function summarizePreviousActions(hand: CanonicalHand, cursor: number, bigBlindAtoms: bigint): string[] {
  const limit = Math.min(cursor - 1, hand.events.length);
  const out: string[] = [];
  for (let i = 0; i < limit; i++) {
    const ev = hand.events[i];
    if (!ev) continue;
    if (
      ev.kind !== "CheckingOrCalling" &&
      ev.kind !== "CompletionBettingOrRaisingTo" &&
      ev.kind !== "Folding"
    ) {
      continue;
    }
    const pos = normalizedPosition(hand, ev.playerIndex);
    const who = pos ?? (ev.playerIndex !== null ? replayPlayerName(hand, ev.playerIndex) : "Jogador");
    const streetTag = STREET_LABELS[ev.before.street] ?? ev.before.street;
    let actText = replayEventLabel(ev);
    if (ev.kind === "CompletionBettingOrRaisingTo" && ev.amountAtoms !== null && bigBlindAtoms > 0n) {
      const bb = atomsToBb(safeBigInt(ev.amountAtoms), bigBlindAtoms);
      actText = `${actText} ${formatBb(bb)}`;
    } else if (ev.kind === "CheckingOrCalling" && ev.amountAtoms !== null && safeBigInt(ev.amountAtoms) > 0n && bigBlindAtoms > 0n) {
      const bb = atomsToBb(safeBigInt(ev.amountAtoms), bigBlindAtoms);
      actText = `Call ${formatBb(bb)}`;
    }
    out.push(`${streetTag}: ${who} · ${actText}`);
  }
  return out;
}

export function analyzeDecisionSizing(
  hand: CanonicalHand,
  frame: ReplayFrame,
): DecisionMathAnalysis {
  const bigBlindAtoms = safeBigInt(hand.table.minBetAtoms, 0n);
  const ev: HandEvent | null = frame.event;
  const prevActions = summarizePreviousActions(hand, frame.cursor, bigBlindAtoms);

  if (!ev) {
    const pot0 = safeBigInt(frame.snapshot.potAtoms);
    return {
      hasDecision: false,
      street: frame.snapshot.street,
      streetLabel: STREET_LABELS[frame.snapshot.street] ?? frame.snapshot.street,
      actorIndex: null,
      actorLabel: "Início da mão",
      actorPosition: null,
      actionTitle: "Estado inicial",
      bigBlindAtoms,
      potBeforeAtoms: pot0,
      potBeforeBb: atomsToBb(pot0, bigBlindAtoms),
      toCallAtoms: 0n,
      toCallBb: 0,
      paidAtoms: 0n,
      paidBb: 0,
      totalStreetBetAtoms: null,
      totalStreetBetBb: null,
      additionalWagerOverCallAtoms: 0n,
      additionalWagerOverCallBb: 0,
      isBet: false,
      isRaise: false,
      isCall: false,
      isFold: false,
      isCheck: false,
      isAllIn: false,
      betPctOfPot: null,
      betPctBaseLabel: null,
      effectiveStackAtoms: null,
      effectiveStackBb: null,
      spr: null,
      minEquityForCallPct: null,
      potOddsRatio: null,
      villainMinEquityVsBetPct: null,
      activePlayersCount: frame.snapshot.folded.filter((f) => !f).length,
      hasAllInOrSidePot: frame.snapshot.allIn.some(Boolean) || hand.pots.length > 1,
      previousStreetActions: [],
      notes: ["Avance para um evento de decisão (fold, check, call, bet ou raise) para ver métricas matemáticas da jogada."],
    };
  }

  const n = hand.players.length;
  const actor = ev.playerIndex;
  const actorPosition = normalizedPosition(hand, actor);
  const actorLabel = actor !== null ? replayPlayerName(hand, actor) : "Dealer / Motor";
  const potBeforeAtoms = safeBigInt(ev.before.potAtoms);
  const activeIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!ev.before.folded[i]) activeIndices.push(i);
  }
  const activePlayersCount = activeIndices.length;
  const hasAllInOrSidePot =
    ev.before.allIn.some(Boolean) || ev.after.allIn.some(Boolean) || hand.pots.length > 1;

  const isPlayerDecision =
    actor !== null &&
    (ev.kind === "Folding" ||
      ev.kind === "CheckingOrCalling" ||
      ev.kind === "CompletionBettingOrRaisingTo");

  const betsBefore = ev.before.betsAtoms.map((v) => safeBigInt(v));
  const maxBetBefore = betsBefore.reduce((a, b) => (b > a ? b : a), 0n);

  let toCallAtoms = 0n;
  let paidAtoms = 0n;
  let totalStreetBetAtoms: bigint | null = null;
  let additionalWagerOverCallAtoms = 0n;
  let effectiveStackAtoms: bigint | null = null;
  let spr: number | null = null;
  let betPctOfPot: number | null = null;
  let betPctBaseLabel: string | null = null;
  let minEquityForCallPct: number | null = null;
  let potOddsRatio: string | null = null;
  let villainMinEquityVsBetPct: number | null = null;
  const notes: string[] = [];

  if (actor !== null) {
    const actorPriorBet = betsBefore[actor] ?? 0n;
    const actorStackBefore = safeBigInt(ev.before.stacksAtoms[actor]);
    const rawToCall = maxBetBefore > actorPriorBet ? maxBetBefore - actorPriorBet : 0n;
    toCallAtoms = rawToCall < actorStackBefore ? rawToCall : actorStackBefore;
    paidAtoms = safeBigInt(ev.paidAtoms[actor]);
    totalStreetBetAtoms = safeBigInt(ev.after.betsAtoms[actor]);
    additionalWagerOverCallAtoms = paidAtoms > toCallAtoms ? paidAtoms - toCallAtoms : 0n;

    const actorTotalAhead = actorStackBefore + actorPriorBet;
    let maxOppAhead = 0n;
    let hasLiveOpp = false;
    for (const j of activeIndices) {
      if (j === actor) continue;
      hasLiveOpp = true;
      const oppAhead = safeBigInt(ev.before.stacksAtoms[j]) + (betsBefore[j] ?? 0n);
      if (oppAhead > maxOppAhead) maxOppAhead = oppAhead;
    }
    if (hasLiveOpp) {
      const ceiling = actorTotalAhead < maxOppAhead ? actorTotalAhead : maxOppAhead;
      effectiveStackAtoms = ceiling > actorPriorBet ? ceiling - actorPriorBet : 0n;
      if (potBeforeAtoms > 0n) {
        spr = Math.round((Number(effectiveStackAtoms) / Number(potBeforeAtoms)) * 100) / 100;
      }
    }

    if (toCallAtoms > 0n && potBeforeAtoms > 0n) {
      const potWithCall = potBeforeAtoms + toCallAtoms;
      minEquityForCallPct = Math.round((Number(toCallAtoms) / Number(potWithCall)) * 1000) / 10;
      const oddsVal = Number(potWithCall - toCallAtoms) / Number(toCallAtoms);
      potOddsRatio = `${oddsVal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} : 1`;
    }
  }

  const isBet = ev.kind === "CompletionBettingOrRaisingTo" && maxBetBefore === 0n && paidAtoms > 0n;
  const isRaise = ev.kind === "CompletionBettingOrRaisingTo" && maxBetBefore > 0n;
  const isCall = ev.kind === "CheckingOrCalling" && paidAtoms > 0n;
  const isCheck = ev.kind === "CheckingOrCalling" && paidAtoms === 0n;
  const isFold = ev.kind === "Folding";
  const isAllIn = actor !== null && Boolean(ev.after.allIn[actor]) && paidAtoms > 0n;

  if (isBet && potBeforeAtoms > 0n) {
    betPctOfPot = Math.round((Number(paidAtoms) / Number(potBeforeAtoms)) * 1000) / 10;
    betPctBaseLabel = "Pote antes da aposta";
    const oppFinalPot = potBeforeAtoms + paidAtoms + paidAtoms;
    villainMinEquityVsBetPct = Math.round((Number(paidAtoms) / Number(oppFinalPot)) * 1000) / 10;
  } else if (isRaise) {
    const potAfterCall = potBeforeAtoms + toCallAtoms;
    if (potAfterCall > 0n && additionalWagerOverCallAtoms > 0n) {
      betPctOfPot = Math.round((Number(additionalWagerOverCallAtoms) / Number(potAfterCall)) * 1000) / 10;
      betPctBaseLabel = "Pote após igualar (pote + valor a pagar)";
    } else if (potBeforeAtoms > 0n && paidAtoms > 0n) {
      betPctOfPot = Math.round((Number(paidAtoms) / Number(potBeforeAtoms)) * 1000) / 10;
      betPctBaseLabel = "Pote antes do aumento";
    }
    if (totalStreetBetAtoms !== null && totalStreetBetAtoms !== paidAtoms) {
      notes.push(
        `Incremento pago agora (${formatBb(atomsToBb(paidAtoms, bigBlindAtoms))}) distinto do alvo total na street (${formatBb(atomsToBb(totalStreetBetAtoms, bigBlindAtoms))}).`,
      );
    }
  } else if (isCall && potBeforeAtoms > 0n) {
    betPctOfPot = Math.round((Number(paidAtoms) / Number(potBeforeAtoms)) * 1000) / 10;
    betPctBaseLabel = "Pote atual enfrentado";
  }

  if (hasAllInOrSidePot) {
    notes.push("Mão envolve all-in ou múltiplos potes; stacks efetivos e pot odds aplicam-se apenas até o teto igualável.");
  }
  if (!isPlayerDecision) {
    notes.push("Evento operacional/automático; selecione uma ação voluntária na sequência para análise de decisão.");
  }

  return {
    hasDecision: isPlayerDecision,
    street: ev.before.street,
    streetLabel: STREET_LABELS[ev.before.street] ?? ev.before.street,
    actorIndex: actor,
    actorLabel,
    actorPosition,
    actionTitle: replayEventLabel(ev),
    bigBlindAtoms,
    potBeforeAtoms,
    potBeforeBb: atomsToBb(potBeforeAtoms, bigBlindAtoms),
    toCallAtoms,
    toCallBb: atomsToBb(toCallAtoms, bigBlindAtoms),
    paidAtoms,
    paidBb: atomsToBb(paidAtoms, bigBlindAtoms),
    totalStreetBetAtoms,
    totalStreetBetBb: totalStreetBetAtoms !== null ? atomsToBb(totalStreetBetAtoms, bigBlindAtoms) : null,
    additionalWagerOverCallAtoms,
    additionalWagerOverCallBb: atomsToBb(additionalWagerOverCallAtoms, bigBlindAtoms),
    isBet,
    isRaise,
    isCall,
    isFold,
    isCheck,
    isAllIn,
    betPctOfPot,
    betPctBaseLabel,
    effectiveStackAtoms,
    effectiveStackBb: effectiveStackAtoms !== null ? atomsToBb(effectiveStackAtoms, bigBlindAtoms) : null,
    spr,
    minEquityForCallPct,
    potOddsRatio,
    villainMinEquityVsBetPct,
    activePlayersCount,
    hasAllInOrSidePot,
    previousStreetActions: prevActions,
    notes,
  };
}

interface PreflopStructure {
  openRaiserPos: string | null;
  raisesCount: number;
  limpsOrCallsBeforeActor: number;
  isHeadsUpPostflopSrp: boolean;
  lastPreflopAggressorPos: string | null;
  lastPreflopCallerPos: string | null;
}

function inspectPreflopContext(hand: CanonicalHand, cursor: number): PreflopStructure {
  const limit = Math.min(cursor - 1, hand.events.length);
  let raisesCount = 0;
  let openRaiserPos: string | null = null;
  let limpsOrCalls = 0;
  let lastAggPos: string | null = null;
  let lastCallerPos: string | null = null;

  for (let i = 0; i < limit; i++) {
    const ev = hand.events[i];
    if (!ev || ev.before.street !== "PREFLOP") continue;
    const pos = normalizedPosition(hand, ev.playerIndex);
    if (ev.kind === "CompletionBettingOrRaisingTo") {
      raisesCount += 1;
      if (raisesCount === 1) openRaiserPos = pos;
      lastAggPos = pos;
    } else if (ev.kind === "CheckingOrCalling" && safeBigInt(ev.paidAtoms[ev.playerIndex ?? -1]) > 0n) {
      limpsOrCalls += 1;
      lastCallerPos = pos;
    }
  }

  return {
    openRaiserPos,
    raisesCount,
    limpsOrCallsBeforeActor: limpsOrCalls,
    isHeadsUpPostflopSrp: raisesCount === 1 && limpsOrCalls === 1,
    lastPreflopAggressorPos: lastAggPos,
    lastPreflopCallerPos: lastCallerPos,
  };
}

function findMatchingActionFrequency(
  cellDist: Record<string, number>,
  math: DecisionMathAnalysis,
): { matchedKey: string | null; freq: number | null } {
  const keys = Object.keys(cellDist);
  if (!keys.length) return { matchedKey: null, freq: null };
  const targetRole = math.isFold
    ? "fold"
    : math.isCheck
      ? "check"
      : (math.isBet || math.isRaise) && math.isAllIn
        ? "allin"
        : math.isCall
          ? "call"
          : math.isRaise
            ? "raise"
            : math.isBet
              ? "bet"
              : "neutral";

  const exactRole = keys.find((k) => classifyActionRole(k) === targetRole);
  if (exactRole) return { matchedKey: exactRole, freq: cellDist[exactRole] ?? null };
  if (targetRole === "allin") {
    const raiseFallback = keys.find((k) => classifyActionRole(k) === "raise");
    if (raiseFallback) return { matchedKey: raiseFallback, freq: cellDist[raiseFallback] ?? null };
  }
  return { matchedKey: null, freq: null };
}

export function analyzeMttReferenceAndFindings(
  hand: CanonicalHand,
  frame: ReplayFrame,
  math: DecisionMathAnalysis,
  mttSpots: readonly CanonicalSpot[],
): MttReferenceAnalysis {
  const mttFormatDisclaimer =
    hand.gameFormat.status === "REPORTED" || hand.gameFormat.status === "INFERRED"
      ? hand.gameFormat.value === "MTT"
        ? "MTT comprovado identifica apenas o formato multi-mesa do torneio; isso não comprova estratégia GTO nem garante correspondência com os charts locais."
        : `Modalidade identificada na fonte: ${hand.gameFormat.value}. Ranges Spin & Go ou Cash Game nunca substituem referências MTT.`
      : "Modalidade não comprovada na fonte (Formato desconhecido); excluída de comparações com ranges MTT.";

  const replayCheck = assessHandReplayability(hand);
  if (!replayCheck.ok) {
    return {
      kind: "NO_COMPATIBLE_SOLUTION",
      headline: "Não há solução GTO compatível com esta situação.",
      mttFormatDisclaimer,
      matchedSpotId: null,
      matchedSpotName: null,
      heroHandClass: null,
      chartFrequencies: null,
      chartSum: null,
      chartCellWarning: null,
      verifiedEvMap: null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "STRUCTURAL_ERROR",
      findingLabel: "Erro estrutural",
      findingSummary: replayCheck.detail,
      limitations: [replayCheck.summary],
      conceptualNotes: [],
    };
  }

  if (hand.gameFormat.status === "MISSING" || hand.gameFormat.value !== "MTT") {
    return {
      kind: "NO_COMPATIBLE_SOLUTION",
      headline: "Não há solução GTO compatível com esta situação.",
      mttFormatDisclaimer,
      matchedSpotId: null,
      matchedSpotName: null,
      heroHandClass: null,
      chartFrequencies: null,
      chartSum: null,
      chartCellWarning: null,
      verifiedEvMap: null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "INCONCLUSIVE",
      findingLabel: "Análise inconclusiva",
      findingSummary:
        hand.gameFormat.status === "MISSING"
          ? "Sem comprovação objetiva de torneio MTT; nenhum range MTT ou Spin & Go é aplicado."
          : `Mão classificada como ${hand.gameFormat.value}; fora do escopo exclusivo MTT do TreinerLM.`,
      limitations: [
        "Disponível apenas análise matemática objetiva de pote, pot odds e stacks efetivos.",
      ],
      conceptualNotes: buildConceptualGuidance(hand, frame, math),
    };
  }

  if (!math.hasDecision || math.actorIndex === null) {
    return {
      kind: "MATHEMATICAL_AND_CONCEPTUAL_ONLY",
      headline: "Não há solução GTO compatível com esta situação.",
      mttFormatDisclaimer,
      matchedSpotId: null,
      matchedSpotName: null,
      heroHandClass: null,
      chartFrequencies: null,
      chartSum: null,
      chartCellWarning: null,
      verifiedEvMap: null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "INCONCLUSIVE",
      findingLabel: "Análise inconclusiva",
      findingSummary: "Selecione uma decisão voluntária de jogador (fold, check, call, bet ou raise) para verificar referências.",
      limitations: [],
      conceptualNotes: buildConceptualGuidance(hand, frame, math),
    };
  }

  // Cartas visíveis do ator nesta perspectiva ou na fonte conhecida?
  // Respeitamos estritamente o que a fonte conhece em hand.players[actor].holeCards
  const actorCards = frame.visibleCards[math.actorIndex];
  let heroHandClass: string | null = null;
  if (actorCards && actorCards[0] && actorCards[1]) {
    try {
      heroHandClass = comboToHandClass(actorCards[0], actorCards[1]);
    } catch {
      heroHandClass = null;
    }
  }

  const preflopCtx = inspectPreflopContext(hand, frame.cursor);
  const stackBb = math.effectiveStackBb;
  const nPlayers = hand.table.playerCount;
  const actorPos = math.actorPosition;

  // 1) Tenta correspondência estrita pós-flop com Solução VERIFIED (somente se todos os parâmetros críticos baterem)
  if (math.street !== "PREFLOP" && actorPos) {
    const board = frame.snapshot.board;
    const verifiedMatch = mttSpots.find((sp) => {
      if (sp.referenceStrategy.status !== "VERIFIED") return false;
      if (sp.format !== "MTT" || sp.street !== math.street) return false;
      if (!preflopCtx.isHeadsUpPostflopSrp || math.activePlayersCount !== 2) return false;
      if (sp.heroPosition !== actorPos) return false;
      const expectedVillain =
        actorPos === preflopCtx.lastPreflopAggressorPos
          ? preflopCtx.lastPreflopCallerPos
          : preflopCtx.lastPreflopAggressorPos;
      if (sp.villainPosition && expectedVillain && sp.villainPosition !== expectedVillain) return false;
      if (sp.board.length !== board.length || !sp.board.every((c, idx) => c === board[idx])) return false;
      if (stackBb === null || Math.abs(stackBb - sp.effectiveStackBb) > sp.effectiveStackBb * 0.25) return false;
      return true;
    });

    if (verifiedMatch) {
      const ref = verifiedMatch.referenceStrategy;
      const rawCell = heroHandClass ? ref.matrixFrequencies?.[heroHandClass] ?? null : null;
      const cellEv = heroHandClass ? ref.matrixEv?.[heroHandClass] ?? null : null;
      const cellSum = rawCell
        ? Object.values(rawCell).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
        : null;
      return evaluateMatchedStrategy({
        kind: "VERIFIED_GTO_SOLUTION",
        headline: `Solução GTO verificada compatível: ${verifiedMatch.name}`,
        mttFormatDisclaimer,
        spot: verifiedMatch,
        heroHandClass,
        rawCell,
        cellSum,
        cellEv,
        math,
        limitations: [
          "Comparação válida sob premissas chipEV 30 BB SRP do solver importado.",
        ],
        conceptualNotes: buildConceptualGuidance(hand, frame, math),
      });
    }
  }

  // 2) Tenta correspondência pré-flop com charts MTT importados (sem EV!)
  // Requer: 8 jogadores na mesa (ou seatCount=8? NÃO presumimos 8-max completo quando há apenas 3-7 ativos!),
  // posição definida, sem limps nem 3-bets anteriores e stack efetivo próximo (+/- 20%) de um stack do catálogo.
  if (math.street === "PREFLOP" && actorPos && nPlayers === 8 && stackBb !== null) {
    let targetType: "rfi" | "vs_rfi" | null = null;
    let villainPos: string | null = null;
    if (preflopCtx.raisesCount === 0 && preflopCtx.limpsOrCallsBeforeActor === 0) {
      targetType = "rfi";
    } else if (preflopCtx.raisesCount === 1 && preflopCtx.limpsOrCallsBeforeActor === 0 && preflopCtx.openRaiserPos) {
      targetType = "vs_rfi";
      villainPos = preflopCtx.openRaiserPos;
    }

    if (targetType) {
      const candidates = mttSpots.filter(
        (sp) =>
          sp.format === "MTT" &&
          sp.playersInitial === 8 &&
          sp.spotType === targetType &&
          sp.heroPosition === actorPos &&
          (targetType === "rfi" || sp.villainPosition === villainPos) &&
          sp.referenceStrategy.status === "IMPORTED_CHART_NO_EV",
      );

      let best: CanonicalSpot | null = null;
      let bestDiff = Infinity;
      for (const c of candidates) {
        const diff = Math.abs(c.effectiveStackBb - stackBb);
        if (diff <= c.effectiveStackBb * 0.2 && diff < bestDiff) {
          best = c;
          bestDiff = diff;
        }
      }

      if (best) {
        const rawCell = heroHandClass ? best.referenceStrategy.matrixFrequencies?.[heroHandClass] ?? null : null;
        const cellSum = rawCell
          ? Object.values(rawCell).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
          : null;
        const auditFlag: MatrixCellDeviation | undefined = heroHandClass
          ? best.referenceStrategy.integrityAudit?.flaggedCells?.find((f) => f.hand === heroHandClass)
          : undefined;

        const limitations = [
          `Comparação didática com chart importado (${best.effectiveStackBb} BB 8-Max chipEV, ante 0,125 BB); stack efetivo real nesta ação: ${formatBb(stackBb)}.`,
          "Charts importados não contêm valores de EV por ação: não é calculada perda de EV.",
          "Fatores de ICM, bounties (PKO) e reads de mesa não são modelados neste chart.",
        ];
        if (auditFlag) {
          limitations.push(`Auditoria da célula ${heroHandClass}: soma ${cellSum?.toFixed(3)} (${auditFlag.detail}).`);
        }

        return evaluateMatchedStrategy({
          kind: "IMPORTED_CHART_NO_EV",
          headline: `Comparação com chart MTT importado: ${best.name}`,
          mttFormatDisclaimer,
          spot: best,
          heroHandClass,
          rawCell,
          cellSum,
          cellEv: null,
          math,
          limitations,
          conceptualNotes: buildConceptualGuidance(hand, frame, math),
        });
      }
    }
  }

  const mismatchReasons: string[] = [];
  if (nPlayers !== 8 && math.street === "PREFLOP") {
    mismatchReasons.push(`Mesa com ${nPlayers} jogadores; os charts MTT locais modelam 8 jogadores ativos com ante 0,125 BB.`);
  }
  if (math.street === "PREFLOP" && (preflopCtx.limpsOrCallsBeforeActor > 0 || preflopCtx.raisesCount >= 2)) {
    mismatchReasons.push("Sequência pré-flop com limps, múltiplos calls ou 3-bet+ está além dos spots RFI / vs RFI do acervo.");
  }
  if (math.street !== "PREFLOP") {
    mismatchReasons.push("Não há solução de solver carregada especificamente para este board, posições e stack.");
  }
  if (!actorPos) {
    mismatchReasons.push("Posição tática exata indisponível para correspondência estrita.");
  }

  return {
    kind: "NO_COMPATIBLE_SOLUTION",
    headline: "Não há solução GTO compatível com esta situação.",
    mttFormatDisclaimer,
    matchedSpotId: null,
    matchedSpotName: null,
    heroHandClass,
    chartFrequencies: null,
    chartSum: null,
    chartCellWarning: null,
    verifiedEvMap: null,
    evLossValue: null,
    evLossUnit: null,
    findingCategory: "INCONCLUSIVE",
    findingLabel: "Análise inconclusiva",
    findingSummary:
      mismatchReasons[0] ??
      "Os parâmetros da decisão (posições, sequência de ações, board ou stack) não correspondem a nenhuma solução verificada ou chart compatível.",
    limitations: mismatchReasons,
    conceptualNotes: buildConceptualGuidance(hand, frame, math),
  };
}

function evaluateMatchedStrategy({
  kind,
  headline,
  mttFormatDisclaimer,
  spot,
  heroHandClass,
  rawCell,
  cellSum,
  cellEv,
  math,
  limitations,
  conceptualNotes,
}: {
  kind: "VERIFIED_GTO_SOLUTION" | "IMPORTED_CHART_NO_EV";
  headline: string;
  mttFormatDisclaimer: string;
  spot: CanonicalSpot;
  heroHandClass: string | null;
  rawCell: Record<string, number> | null;
  cellSum: number | null;
  cellEv: Record<string, number> | null;
  math: DecisionMathAnalysis;
  limitations: string[];
  conceptualNotes: string[];
}): MttReferenceAnalysis {
  if (!heroHandClass || !rawCell) {
    return {
      kind,
      headline,
      mttFormatDisclaimer,
      matchedSpotId: spot.spotId,
      matchedSpotName: spot.name,
      heroHandClass,
      chartFrequencies: null,
      chartSum: null,
      chartCellWarning: heroHandClass ? "Célula sem distribuição no chart." : "Cartas fechadas ocultas na perspectiva atual; selecione a visão do jogador ou revelada para comparar a mão específica.",
      verifiedEvMap: null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "INCONCLUSIVE",
      findingLabel: "Análise inconclusiva",
      findingSummary: heroHandClass
        ? `A mão ${heroHandClass} não consta na matriz deste spot.`
        : "Cartas privadas do ator ocultas na perspectiva atual; exibição limitada ao panorama do spot.",
      limitations,
      conceptualNotes,
    };
  }

  const incompleteCell = cellSum !== null && Math.abs(cellSum - 1) > 0.015;
  const chartCellWarning = incompleteCell
    ? `Distribuição incompleta na célula (${cellSum?.toFixed(3)}): possível perda na extração original; não normalizada automaticamente.`
    : null;

  const { matchedKey, freq } = findMatchingActionFrequency(rawCell, math);
  const dominantEntry = Object.entries(rawCell).sort((a, b) => b[1] - a[1])[0];
  const dominantLabel = dominantEntry ? formatActionLabelPtBr(dominantEntry[0]) : "—";

  if (incompleteCell) {
    return {
      kind,
      headline,
      mttFormatDisclaimer,
      matchedSpotId: spot.spotId,
      matchedSpotName: spot.name,
      heroHandClass,
      chartFrequencies: rawCell,
      chartSum: cellSum,
      chartCellWarning,
      verifiedEvMap: kind === "VERIFIED_GTO_SOLUTION" ? cellEv : null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "INCONCLUSIVE",
      findingLabel: "Análise inconclusiva",
      findingSummary: `A célula ${heroHandClass} soma ${(cellSum! * 100).toFixed(1)}% (<100%), impedindo apontar desvio confiável.`,
      limitations,
      conceptualNotes,
    };
  }

  if (kind === "VERIFIED_GTO_SOLUTION" && cellEv && matchedKey && dominantEntry) {
    const chosenEv = cellEv[matchedKey];
    const bestEv = Math.max(...Object.values(cellEv).filter(Number.isFinite));
    const evDiff = Number.isFinite(chosenEv) && Number.isFinite(bestEv) ? Math.max(0, bestEv - chosenEv) : null;
    const evUnit = spot.referenceStrategy.evUnit ?? "bbEV";

    if (freq !== null && freq === 0 && evDiff !== null && evDiff > 0.01) {
      return {
        kind,
        headline,
        mttFormatDisclaimer,
        matchedSpotId: spot.spotId,
        matchedSpotName: spot.name,
        heroHandClass,
        chartFrequencies: rawCell,
        chartSum: cellSum,
        chartCellWarning,
        verifiedEvMap: cellEv,
        evLossValue: Math.round(evDiff * 1000) / 1000,
        evLossUnit: evUnit,
        findingCategory: "EV_LOSS",
        findingLabel: "Perda de EV",
        findingSummary: `Na solução verificada, ${heroHandClass} prefere ${dominantLabel} (${Math.round(dominantEntry[1] * 100)}%); perda estimada no modelo: ${evDiff.toFixed(2)} ${evUnit}.`,
        limitations,
        conceptualNotes,
      };
    }
  }

  if (freq === null || freq === 0) {
    return {
      kind,
      headline,
      mttFormatDisclaimer,
      matchedSpotId: spot.spotId,
      matchedSpotName: spot.name,
      heroHandClass,
      chartFrequencies: rawCell,
      chartSum: cellSum,
      chartCellWarning,
      verifiedEvMap: kind === "VERIFIED_GTO_SOLUTION" ? cellEv : null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "STRATEGY_DEVIATION",
      findingLabel: "Desvio de estratégia",
      findingSummary: `Ação ${math.actionTitle} está com 0% para ${heroHandClass} nesta referência (predominante: ${dominantLabel} · ${Math.round((dominantEntry?.[1] ?? 0) * 100)}%).`,
      limitations,
      conceptualNotes,
    };
  }

  if (freq < (dominantEntry?.[1] ?? 1) - 0.15) {
    return {
      kind,
      headline,
      mttFormatDisclaimer,
      matchedSpotId: spot.spotId,
      matchedSpotName: spot.name,
      heroHandClass,
      chartFrequencies: rawCell,
      chartSum: cellSum,
      chartCellWarning,
      verifiedEvMap: kind === "VERIFIED_GTO_SOLUTION" ? cellEv : null,
      evLossValue: null,
      evLossUnit: null,
      findingCategory: "FREQUENCY_DEVIATION",
      findingLabel: "Desvio de frequência",
      findingSummary: `Ação escolhida aparece em mix minoritário (${Math.round(freq * 100)}%) para ${heroHandClass}; principal: ${dominantLabel} (${Math.round((dominantEntry?.[1] ?? 0) * 100)}%).`,
      limitations,
      conceptualNotes,
    };
  }

  return {
    kind,
    headline,
    mttFormatDisclaimer,
    matchedSpotId: spot.spotId,
    matchedSpotName: spot.name,
    heroHandClass,
    chartFrequencies: rawCell,
    chartSum: cellSum,
    chartCellWarning,
    verifiedEvMap: kind === "VERIFIED_GTO_SOLUTION" ? cellEv : null,
    evLossValue: null,
    evLossUnit: null,
    findingCategory: "ALIGNED",
    findingLabel: "Alinhado à referência",
    findingSummary: `Ação coerente com a frequência principal (${Math.round(freq * 100)}%) para ${heroHandClass} neste chart.`,
    limitations,
    conceptualNotes,
  };
}

function buildConceptualGuidance(
  hand: CanonicalHand,
  frame: ReplayFrame,
  math: DecisionMathAnalysis,
): string[] {
  const notes: string[] = [];
  if (math.effectiveStackBb !== null) {
    if (math.effectiveStackBb <= 15) {
      notes.push("Zona short-stack (<= 15 BB): fold equity e comprometimento de stack dominam decisões de push/fold.");
    } else if (math.effectiveStackBb <= 30) {
      notes.push("Stack efetivo intermediário (15–30 BB): atenção a tamanhos de 3-bet/c-bet que preservem espaço ou definam compromisso all-in.");
    } else {
      notes.push("Stack efetivo profundo (> 30 BB): SPR maior amplia a importância de jogabilidade pós-flop e controle de pote.");
    }
  }
  if (math.minEquityForCallPct !== null) {
    notes.push(`Referência imediata de pot odds: ${formatPct(math.minEquityForCallPct)} de equidade mínima sem ação futura (em street com ação restante, avalie realização de equidade e odds implícitos).`);
  }
  if (frame.snapshot.board.length >= 3) {
    notes.push(`Board ${frame.snapshot.board.join(" ")} com ${math.activePlayersCount} jogador(es) ativos.`);
  }
  if (hand.metadata && typeof hand.metadata === "object" && "pokerstars" in hand.metadata) {
    const ps = hand.metadata.pokerstars as { bounties?: unknown };
    if (ps?.bounties && typeof ps.bounties === "object" && Object.keys(ps.bounties).length > 0) {
      notes.push("Torneio PKO/bounty: coberturas de stack alteram ligeiramente as pot odds necessárias para calls all-in em eliminação.");
    }
  }
  return notes;
}

export function buildSafeAiQuestionPayload(
  hand: CanonicalHand,
  frame: ReplayFrame,
  math: DecisionMathAnalysis,
  ref: MttReferenceAnalysis,
  question: string,
): string {
  const lines: string[] = [
    question.trim(),
    "",
    "[DADOS CALCULADOS NA DECISÃO — SEM IDENTIFICADORES PESSOAIS]",
    `- Modalidade na fonte: ${hand.gameFormat.status === "MISSING" ? "Desconhecida" : hand.gameFormat.value} (${hand.table.playerCount} jogadores na mesa)`,
    `- Street: ${math.streetLabel}${frame.snapshot.board.length ? ` | Board: ${frame.snapshot.board.join(" ")}` : " | Pré-flop"}`,
    `- Ator: ${math.actorPosition ?? "Posição não informada"} | Ação registrada: ${math.actionTitle}`,
    `- Pote antes da ação: ${formatBb(math.potBeforeBb)}`,
    `- Stack efetivo: ${formatBb(math.effectiveStackBb)}${math.spr !== null ? ` | SPR: ${math.spr.toLocaleString("pt-BR")}` : ""}`,
  ];

  if (math.toCallBb !== null && math.toCallAtoms > 0n) {
    lines.push(`- Valor a pagar: ${formatBb(math.toCallBb)} | Pot odds: ${math.potOddsRatio ?? "—"} (equidade mínima sem ação futura: ${formatPct(math.minEquityForCallPct)})`);
  }
  if (math.paidBb !== null && math.paidAtoms > 0n) {
    lines.push(`- Valor investido nesta ação: ${formatBb(math.paidBb)}${math.betPctOfPot !== null ? ` (${formatPct(math.betPctOfPot)} · base: ${math.betPctBaseLabel})` : ""}`);
  }
  if (ref.heroHandClass) {
    lines.push(`- Mão visível do ator: ${ref.heroHandClass}`);
  }
  if (math.previousStreetActions.length > 0) {
    lines.push(`- Ações anteriores na mão: ${math.previousStreetActions.slice(-5).join(" ; ")}`);
  }

  lines.push("");
  lines.push("[STATUS DA REFERÊNCIA GTO LOCAL]");
  if (ref.kind === "VERIFIED_GTO_SOLUTION") {
    lines.push(`- Solução verificada compatível: ${ref.matchedSpotName} (${ref.findingLabel}: ${ref.findingSummary})`);
  } else if (ref.kind === "IMPORTED_CHART_NO_EV") {
    lines.push(`- Comparação com chart importado (sem EV): ${ref.matchedSpotName} (${ref.findingLabel}: ${ref.findingSummary})`);
  } else {
    lines.push("- Não há solução GTO compatível com esta situação no acervo local.");
  }

  lines.push("");
  lines.push("[PEDIDO DE ANÁLISE DIDÁTICA]");
  lines.push("Baseie-se nos números calculados acima. Não invente frequências GTO ou EVs não informados e explique claramente o que for interpretação conceitual sua.");
  return lines.join("\n");
}
