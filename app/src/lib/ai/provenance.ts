/**
 * Controle de proveniência e qualidade epistêmica do TheNerdEinsten.
 *
 * Tudo aqui é determinístico e independe do prompt: os dados do aplicativo
 * (charts, soluções verificadas, cálculos) prevalecem sobre o texto gerado.
 * O texto da IA é sempre tratado como "interpretação didática".
 */
import type { CanonicalSpot, StrategyStatus } from "../poker/strategySchema.ts";
import {
  calculateBluffBreakevenFoldEquity,
  calculatePotOdds,
  calculateSimplifiedMdf,
  type BluffBreakevenResult,
  type PotOddsResult,
  type SimplifiedMdfResult,
} from "../poker/mathEngine.ts";

export type EvidenceKind =
  | "MATH_VERIFIED"
  | "GTO_VERIFIED"
  | "CHART_NO_EV"
  | "DIDACTIC_DEMO"
  | "AI_INTERPRETATION"
  | "INSUFFICIENT_DATA";

export const EVIDENCE_LABELS: Record<EvidenceKind, { label: string; description: string }> = {
  MATH_VERIFIED: { label: "Cálculo matemático verificado", description: "Calculado pelas funções determinísticas do aplicativo, com premissas explícitas." },
  GTO_VERIFIED: { label: "Referência GTO verificada", description: "Solução de solver importada e validada (hash e premissas registrados)." },
  CHART_NO_EV: { label: "Chart importado sem EV", description: "Frequências de um chart importado. Não há EV por ação nem auditoria de solver." },
  DIDACTIC_DEMO: { label: "Demonstração didática", description: "Dados sintéticos para ensino. Não é solução de solver." },
  AI_INTERPRETATION: { label: "Interpretação didática da IA", description: "Texto gerado pelo modelo. Pode conter erros e não comprova nenhum número." },
  INSUFFICIENT_DATA: { label: "Sem dados suficientes", description: "O aplicativo não tem referência estratégica para esta situação." },
};

export function evidenceKindForStatus(status: StrategyStatus | null | undefined): EvidenceKind {
  switch (status) {
    case "VERIFIED": return "GTO_VERIFIED";
    case "IMPORTED_CHART_NO_EV": return "CHART_NO_EV";
    case "DIDACTIC_DEMO": return "DIDACTIC_DEMO";
    default: return "INSUFFICIENT_DATA";
  }
}

export type DecisionLevel = "aligned" | "mixed" | "deviation" | "severe_deviation" | "unknown";

export interface DecisionAssessment {
  level: DecisionLevel;
  headline: string;
  detail: string;
  /** Base da avaliação: referência do aplicativo ou heurística didática explícita. */
  basis: EvidenceKind | "HEURISTIC";
}

export interface ActionFrequency { action: string; frequency: number }

export interface SpotEvidence {
  spotId?: string;
  spotName: string;
  heroPosition: string;
  villainPosition: string | null;
  stackBb: number | null;
  street: string;
  spotType: string;
  handClass: string;
  cardsText?: string;
  chosenAction?: string | null;
  kind: EvidenceKind;
  status: StrategyStatus | null;
  sourceLabel: string | null;
  evAvailable: boolean;
  evUnit: string | null;
  /** Frequências da mão na referência, em ordem decrescente (0–1). */
  handFrequencies: ActionFrequency[] | null;
  handEv: Record<string, number> | null;
  chosenActionFrequency: number | null;
  preferredActions: string[];
  decision: DecisionAssessment;
  missingData: string[];
  icmMode: string | null;
}

type SpotLike = Pick<CanonicalSpot, "name" | "heroPosition" | "villainPosition" | "effectiveStackBb" | "street" | "spotType" | "referenceStrategy" | "legalActions"> & { spotId?: string };

export function isFoldAction(action: string | null | undefined): boolean {
  return typeof action === "string" && /^\s*fold\b/i.test(action);
}

const PREMIUM_NEVER_FOLD = new Set(["AA", "KK"]);

function pct(value: number): string {
  const rounded = Math.round(value * 1000) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1).replace(".", ",")}%`;
}

export function formatFrequency(value: number): string { return pct(value); }

/** Avaliação heurística, explicitamente rotulada, para casos extremos sem referência. */
export function premiumFoldHeuristic(handClass: string, action: string | null | undefined, street: string, stackBb: number | null): DecisionAssessment | null {
  if (!isFoldAction(action) || !PREMIUM_NEVER_FOLD.has(handClass) || street !== "PREFLOP") return null;
  if (stackBb !== null && stackBb < 8) return null;
  return {
    level: "severe_deviation",
    headline: `Dar fold com ${handClass} nessa situação parece uma decisão muito ruim nas condições usuais.`,
    detail: "Vou verificar quais informações temos antes de apresentar uma conclusão estratégica.",
    basis: "HEURISTIC",
  };
}

export function buildSpotEvidence(input: { spot: SpotLike; handClass: string; chosenAction?: string | null; cardsText?: string }): SpotEvidence {
  const { spot, handClass } = input;
  const strategy = spot.referenceStrategy;
  const kind = evidenceKindForStatus(strategy?.status);
  const cell = kind === "INSUFFICIENT_DATA" ? undefined : strategy?.matrixFrequencies?.[handClass];
  const evAvailable = Boolean(strategy?.status === "VERIFIED" && (strategy.matrixEv?.[handClass] || strategy.actionEv) && strategy.evUnit && strategy.solutionSource?.evAvailable !== false);
  const legalNames = (spot.legalActions ?? []).map((a) => a.name);
  let handFrequencies: ActionFrequency[] | null = null;
  if (cell && typeof cell === "object") {
    const names = new Set([...legalNames, ...Object.keys(cell)]);
    handFrequencies = [...names]
      .map((action) => ({ action, frequency: Number.isFinite(cell[action]) ? Math.max(0, Math.min(1, cell[action])) : 0 }))
      .sort((a, b) => b.frequency - a.frequency);
  }
  const chosen = input.chosenAction ?? null;
  const chosenActionFrequency = handFrequencies && chosen ? handFrequencies.find((f) => f.action === chosen)?.frequency ?? 0 : null;
  const top = handFrequencies?.[0]?.frequency ?? 0;
  const preferredActions = handFrequencies ? handFrequencies.filter((f) => f.frequency > 0 && f.frequency >= top - 0.05).map((f) => f.action) : [];
  const stackBb = Number.isFinite(spot.effectiveStackBb) ? spot.effectiveStackBb : null;
  const icmMode = strategy?.assumptions?.icmMode ?? null;

  let decision: DecisionAssessment = { level: "unknown", headline: "Sem referência para avaliar a decisão.", detail: "O aplicativo não tem frequências verificáveis para esta mão.", basis: "INSUFFICIENT_DATA" };
  if (handFrequencies && chosen) {
    const freq = chosenActionFrequency ?? 0;
    const best = preferredActions.join(" / ") || "—";
    const label = EVIDENCE_LABELS[kind].label.toLowerCase();
    if (freq >= 0.5) decision = { level: "aligned", headline: `${chosen} é a ação principal da referência para ${handClass} (${pct(freq)}).`, detail: `Base: ${label}.`, basis: kind };
    else if (freq >= 0.1) decision = { level: "mixed", headline: `${chosen} faz parte de uma estratégia mista (${pct(freq)}).`, detail: `Ação mais frequente: ${best}. Base: ${label}.`, basis: kind };
    else if (freq > 0) decision = { level: "deviation", headline: `${chosen} é rara na referência para ${handClass} (${pct(freq)}).`, detail: `Ação mais frequente: ${best}. Base: ${label}.`, basis: kind };
    else decision = { level: "severe_deviation", headline: `A referência carregada não usa ${chosen} com ${handClass} neste spot (0%).`, detail: `Ação indicada: ${best}. Base: ${label}.`, basis: kind };
  }
  const heuristic = premiumFoldHeuristic(handClass, chosen, spot.street, stackBb);
  if (heuristic && (decision.level === "unknown" || decision.level === "severe_deviation")) {
    decision = decision.level === "severe_deviation"
      ? { ...decision, headline: heuristic.headline, detail: `${decision.headline} ${decision.detail}` }
      : heuristic;
  }

  const missingData: string[] = [];
  if (kind === "INSUFFICIENT_DATA") missingData.push("Não há solução ou chart de referência para este spot.");
  if (!evAvailable) missingData.push(kind === "CHART_NO_EV" ? "EV por ação indisponível: o chart importado traz apenas frequências." : "EV por ação indisponível nesta referência.");
  if (!icmMode || icmMode === "chipEV") missingData.push("Fase do torneio, estrutura de premiação e pressão de ICM não informadas (referência em chipEV ou sem premissa declarada).");
  if (spot.street === "PREFLOP" && spot.villainPosition && kind !== "GTO_VERIFIED") missingData.push(`Range real de abertura do ${spot.villainPosition} e leituras do adversário não fornecidos.`);
  if (handFrequencies && !cell) missingData.push(`A referência não contém a mão ${handClass}.`);

  return {
    spotId: spot.spotId,
    spotName: spot.name,
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    stackBb,
    street: spot.street,
    spotType: spot.spotType,
    handClass,
    cardsText: input.cardsText,
    chosenAction: chosen,
    kind,
    status: strategy?.status ?? null,
    sourceLabel: strategy?.solutionSource?.label ?? null,
    evAvailable,
    evUnit: evAvailable ? strategy?.evUnit ?? null : null,
    handFrequencies,
    handEv: evAvailable ? strategy?.matrixEv?.[handClass] ?? null : null,
    chosenActionFrequency,
    preferredActions,
    decision,
    missingData,
    icmMode,
  };
}

/** Campos enviados ao servidor (sem dados pessoais); o servidor revalida tudo. */
export function evidenceToSpotContext(evidence: SpotEvidence, extra: { rngValue?: number | null } = {}): Record<string, unknown> {
  return {
    spotName: evidence.spotName,
    stackBb: evidence.stackBb ?? undefined,
    heroPosition: evidence.heroPosition,
    villainPosition: evidence.villainPosition ?? undefined,
    spotType: evidence.spotType,
    street: evidence.street,
    handClass: evidence.handClass,
    cardsText: evidence.cardsText,
    chosenAction: evidence.chosenAction ?? undefined,
    gtoDistribution: evidence.handFrequencies ? Object.fromEntries(evidence.handFrequencies.map((f) => [f.action, f.frequency])) : undefined,
    rngValue: extra.rngValue ?? null,
    strategyStatus: evidence.status ?? "UNSOLVED",
    evAvailable: evidence.evAvailable,
    sourceLabel: evidence.sourceLabel ?? undefined,
    chosenActionFrequency: evidence.chosenActionFrequency,
    decisionLevel: evidence.decision.level,
    missingData: evidence.missingData.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Identificação do spot em perguntas livres do chat
// ---------------------------------------------------------------------------

const POSITIONS = ["UTG+1", "UTG+2", "UTG1", "UTG2", "UTG", "LJ", "MP", "HJ", "CO", "BTN", "SB", "BB"];
const RANKS = "AKQJT98765432";

export interface HandQuestion {
  handClass: string | null;
  heroPosition: string | null;
  villainPosition: string | null;
  stackBb: number | null;
  action: string | null;
}

function normalizeHand(token: string): string | null {
  const t = token.toUpperCase().replace(/10/g, "T");
  const pair = /^([AKQJT2-9])\1$/.exec(t);
  if (pair) return t;
  const m = /^([AKQJT2-9])([AKQJT2-9])([SO])?$/.exec(t);
  if (!m || m[1] === m[2]) return null;
  const [hi, lo] = RANKS.indexOf(m[1]) < RANKS.indexOf(m[2]) ? [m[1], m[2]] : [m[2], m[1]];
  return `${hi}${lo}${m[3] ? m[3].toLowerCase() : ""}`;
}

/** Extrai mão, posições, stack e ação de uma pergunta em português. Não adivinha o que não está escrito. */
export function parseHandQuestion(text: string): HandQuestion {
  const source = ` ${text.replace(/\s+/g, " ")} `;
  let handClass: string | null = null;
  const handMatch = /(?:^|[\s(,;:])((?:[AKQJT2-9]|10){2}[so]?)(?=[\s),.;:!?]|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = handMatch.exec(source))) {
    const raw = m[1];
    const ranks = raw.replace(/[so]$/i, "");
    // Letras de carta em maiúsculas (evita palavras comuns); "30 BB" é stack.
    if (ranks !== ranks.toUpperCase()) continue;
    if (/^\s*(bb|big)/i.test(source.slice(m.index + m[0].length))) continue;
    const hand = normalizeHand(raw);
    if (hand) { handClass = hand; break; }
  }
  const stack = /(\d{1,3}(?:[.,]\d+)?)\s*(?:bb|big blinds?)\b/i.exec(source);
  const stackBb = stack ? Number(stack[1].replace(",", ".")) : null;

  const found: Array<{ pos: string; index: number }> = [];
  for (const pos of POSITIONS) {
    const re = new RegExp(`(^|[^A-Za-z0-9+])${pos.replace("+", "\\+")}(?![A-Za-z0-9+])`, "g");
    let pm: RegExpExecArray | null;
    while ((pm = re.exec(source))) {
      const index = pm.index + pm[1].length;
      // "30 BB" é stack, não posição.
      if (pos === "BB" && /\d\s*$/.test(source.slice(0, index))) continue;
      if (!found.some((f) => index >= f.index && index < f.index + f.pos.length)) found.push({ pos: pos.replace(/^UTG(\d)$/, "UTG+$1"), index });
    }
  }
  found.sort((a, b) => a.index - b.index);
  let heroPosition: string | null = null;
  let villainPosition: string | null = null;
  const vs = /\b(UTG\+?\d?|LJ|MP|HJ|CO|BTN|SB|BB)\s*(?:vs\.?|versus|contra(?: (?:a|o) (?:abertura|open|raise) d[oa])?)\s*(?:o |a |abertura d[oa] )?(UTG\+?\d?|LJ|MP|HJ|CO|BTN|SB|BB)\b/i.exec(source);
  if (vs) { heroPosition = vs[1].toUpperCase(); villainPosition = vs[2].toUpperCase(); }
  else if (found.length >= 2) { heroPosition = found[0].pos; villainPosition = found[1].pos; }
  else if (found.length === 1) heroPosition = found[0].pos;

  let action: string | null = null;
  if (/\b(fold|foldei|foldar|dei fold|larguei|desisti)\b/i.test(source)) action = "Fold";
  else if (/\b(3-?bet|3bet|tribet|reaumentei)\b/i.test(source)) action = "3-Bet";
  else if (/\b(all-?in|shove|empurrei)\b/i.test(source)) action = "All-in";
  else if (/\b(call|paguei|dei call)\b/i.test(source)) action = "Call";

  return { handClass, heroPosition, villainPosition, stackBb: stackBb !== null && Number.isFinite(stackBb) ? stackBb : null, action };
}

/** Procura um spot pré-flop correspondente; exige posições e stack exatos (sem aproximações). */
export function findSpotForQuestion<T extends SpotLike & { spotId: string }>(spots: T[], question: HandQuestion): T | null {
  if (!question.heroPosition || !question.villainPosition || question.stackBb === null) return null;
  const candidates = spots.filter((s) => s.street === "PREFLOP" && s.heroPosition === question.heroPosition && s.villainPosition === question.villainPosition && s.effectiveStackBb === question.stackBb);
  return candidates.find((s) => s.spotType === "vs_rfi") ?? candidates[0] ?? null;
}

/** Mapeia a ação citada para o nome de ação legal do spot (ex.: "All-in" → "Allin 30"). */
export function matchLegalAction(action: string | null, legal: string[]): string | null {
  if (!action) return null;
  const key = action.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return legal.find((name) => normalized(name) === key)
    ?? legal.find((name) => (key === "allin" ? /^allin/.test(normalized(name)) : normalized(name).startsWith(key)))
    ?? null;
}

/**
 * Resolve evidência determinística a partir de uma pergunta em texto livre.
 * Se o spot existir em `spots`, usa a referência real (ex.: CHART_NO_EV ou GTO_VERIFIED).
 * Se não existir, retorna cenário `INSUFFICIENT_DATA` sem inventar frequências ou EV.
 */
export function resolveEvidenceForQuestion<T extends SpotLike & { spotId: string }>(
  questionText: string,
  spots: T[] = [],
): SpotEvidence | null {
  const q = parseHandQuestion(questionText);
  if (!q.handClass) return null;
  const matched = findSpotForQuestion(spots, q);
  if (matched) {
    const legal = (matched.legalActions ?? []).map((a) => a.name);
    const chosenAction = matchLegalAction(q.action, legal) ?? q.action;
    return buildSpotEvidence({
      spot: matched,
      handClass: q.handClass,
      chosenAction,
    });
  }
  if (!q.heroPosition && !q.villainPosition && q.stackBb === null && !q.action) {
    return null;
  }
  const titleParts = [
    q.stackBb !== null ? `${q.stackBb}BB` : null,
    q.heroPosition,
    q.villainPosition ? `vs ${q.villainPosition}` : null,
  ].filter(Boolean);
  const unsolvedSpot: SpotLike = {
    name: titleParts.length ? titleParts.join(" - ") : "Cenário informado pelo aluno",
    heroPosition: q.heroPosition ?? "Herói",
    villainPosition: q.villainPosition,
    effectiveStackBb: q.stackBb ?? Number.NaN,
    street: "PREFLOP",
    spotType: "vs_rfi",
    legalActions: [],
    referenceStrategy: {
      status: "UNSOLVED",
      evUnit: null,
      actionFrequencies: null,
      actionEv: null,
      solutionSource: null,
      assumptions: null,
      assumptionsHash: null,
    },
  };
  return buildSpotEvidence({
    spot: unsolvedSpot,
    handClass: q.handClass,
    chosenAction: q.action,
  });
}

// ---------------------------------------------------------------------------
// Divergências entre texto da IA e dados determinísticos
// ---------------------------------------------------------------------------

export type DivergenceKind = "ev_unverified" | "frequency_mismatch" | "justifies_rejected_action" | "unprovided_context" | "unverified_numbers";

export interface Divergence { kind: DivergenceKind; message: string }

function actionPattern(action: string): RegExp {
  const n = action.toLowerCase();
  if (n.startsWith("fold")) return /\b(fold|foldar|desistir)\b/i;
  if (n.startsWith("call")) return /\b(call|pagar|paga)\b/i;
  if (n.startsWith("check")) return /\bcheck\b/i;
  if (/^(allin|all-in|all in|shove|jam)/.test(n)) return /\b(all[- ]?in|shove|jam)\b/i;
  if (/3-?bet/.test(n)) return /\b3[- ]?bet\b/i;
  if (/4-?bet/.test(n)) return /\b4[- ]?bet\b/i;
  if (/^(raise|open|rfi)/.test(n)) return /\b(raise|open|aumentar|abrir)\b/i;
  if (/^bet/.test(n)) return /\bbet\b/i;
  return new RegExp(`\\b${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

const EV_LINE = /\bEV\b[^\n]{0,40}?[+−-]?\d+(?:[.,]\d+)?|[+−-]?\d+(?:[.,]\d+)?\s*(?:bb|BB)\s*(?:de\s+)?EV\b/;
const SIGNED_DECIMAL = /(^|[\s|(])[+−]\d+(?:[.,]\d+)?(?:\s*bb)?(?=[\s|)]|$)/im;

export function mentionsUnverifiedEv(text: string): boolean {
  return text.split("\n").some((line) => EV_LINE.test(line)) || (/\bEV\b/.test(text) && SIGNED_DECIMAL.test(text));
}

/** Compara a resposta da IA com os dados do aplicativo e lista divergências (dados verificáveis prevalecem). */
export function detectDivergences(aiText: string, evidence: SpotEvidence | null): Divergence[] {
  const text = aiText ?? "";
  if (!text.trim()) return [];
  const out: Divergence[] = [];
  const add = (d: Divergence) => { if (!out.some((x) => x.kind === d.kind && x.message === d.message)) out.push(d); };

  if (!evidence) {
    const hasPctClaims = /\b(GTO|solver|frequ[eê]ncia)\b/i.test(text) && /\d{1,3}(?:[.,]\d+)?\s*%/.test(text);
    if (mentionsUnverifiedEv(text) || hasPctClaims) add({ kind: "unverified_numbers", message: "A resposta cita EV ou frequências sem uma referência carregada no aplicativo. Trate esses números como não verificados." });
    return out;
  }

  if (!evidence.evAvailable && mentionsUnverifiedEv(text)) {
    add({ kind: "ev_unverified", message: "A IA citou valores de EV, mas a referência carregada não possui EV. Esses valores não são verificáveis e foram desconsiderados." });
  }

  if (evidence.handFrequencies) {
    for (const line of text.split("\n")) {
      if (/\b(range|do range|geral|total|em média)\b/i.test(line)) continue;
      const percents = [...line.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((x) => Number(x[1].replace(",", ".")));
      if (percents.length !== 1) continue;
      const mentioned = evidence.handFrequencies.filter((f) => actionPattern(f.action).test(line));
      if (mentioned.length !== 1) continue;
      const ref = mentioned[0].frequency * 100;
      if (Math.abs(ref - percents[0]) > 5) {
        add({ kind: "frequency_mismatch", message: `A IA citou ${mentioned[0].action} ≈ ${percents[0]}% para ${evidence.handClass}, mas a referência do aplicativo indica ${pct(mentioned[0].frequency)}. Prevalece a referência.` });
      }
    }
    for (const f of evidence.handFrequencies.filter((x) => x.frequency === 0)) {
      const action = actionPattern(f.action).source;
      const affirm = new RegExp(`(${action})[^.\\n]{0,80}?(é|foi|seria|pode ser|parece)\\s+(considerad[oa]\\s+)?(o\\s+|a\\s+|uma\\s+)?(correto|corret[ao]|a melhor|melhor|justific|aceit[aá]vel|razo[aá]vel|[oó]tim|boa|v[aá]lid)`, "i");
      const affirm2 = new RegExp(`(justific[aá]vel|justificad[oa]|corret[oa]|aceit[aá]vel)[^.\\n]{0,60}?(${action})`, "i");
      if (affirm.test(text) || affirm2.test(text)) {
        add({ kind: "justifies_rejected_action", message: `A IA sugere que ${f.action} pode ser correto, mas a referência carregada usa ${f.action} 0% com ${evidence.handClass} neste spot. Prevalece a referência do aplicativo.` });
      }
    }
  }

  if ((!evidence.icmMode || evidence.icmMode === "chipEV") && /\b(bolha|bubble|ICM|mesa final|reta final|premia[cç][aã]o)\b/i.test(text)) {
    add({ kind: "unprovided_context", message: "A IA mencionou ICM, bolha ou fase do torneio, mas esses dados não foram informados nesta mão. Trate como hipótese, não como fato." });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cálculos determinísticos verificados (pot odds, MDF, fold equity)
// ---------------------------------------------------------------------------

export interface DeterministicPotMath {
  unit: "BB" | "fichas";
  potBeforeBet: number;
  opposingBet: number;
  callAmount: number;
  potOdds: PotOddsResult;
  mdf: SimplifiedMdfResult | null;
  bluffBreakeven: BluffBreakevenResult | null;
}

export function computeDeterministicPotMath(params: {
  potBeforeBet: number;
  opposingBet: number;
  callAmount?: number;
  unit?: "BB" | "fichas";
}): DeterministicPotMath | null {
  const { potBeforeBet, opposingBet, unit = "BB" } = params;
  const callAmount = params.callAmount ?? opposingBet;
  if (![potBeforeBet, opposingBet, callAmount].every((n) => typeof n === "number" && Number.isFinite(n)) || potBeforeBet <= 0 || opposingBet <= 0 || callAmount <= 0) {
    return null;
  }
  try {
    const potOdds = calculatePotOdds(potBeforeBet, opposingBet, callAmount);
    const mdf = opposingBet === callAmount ? calculateSimplifiedMdf(potBeforeBet, opposingBet) : null;
    const bluffBreakeven = opposingBet === callAmount ? calculateBluffBreakevenFoldEquity(potBeforeBet, opposingBet) : null;
    return { unit, potBeforeBet, opposingBet, callAmount, potOdds, mdf, bluffBreakeven };
  } catch {
    return null;
  }
}

/**
 * Extrai pote e aposta somente quando explicitamente informados pelo aluno na pergunta.
 * Nunca inventa exemplos genéricos quando a mão não traz esses valores.
 */
export function extractPotMathFromQuestion(text: string): DeterministicPotMath | null {
  const normalized = text.replace(/\s+/g, " ");
  const potMatch = /\bpote(?:\s+antes\s+da\s+aposta|\s+de|\s+era|\s+tinha|\s*:)*\s*(\d+(?:[.,]\d+)?)\s*(bb|big\s*blinds?|fichas)?\b/i.exec(normalized);
  const betMatch = /\b(?:aposta|apostou|bet|all[- ]?in|shove)(?:\s+de|\s+foi|\s*:)*\s*(\d+(?:[.,]\d+)?)\s*(bb|big\s*blinds?|fichas)?\b/i.exec(normalized);
  if (!potMatch || !betMatch) return null;
  const potBeforeBet = Number(potMatch[1].replace(",", "."));
  const opposingBet = Number(betMatch[1].replace(",", "."));
  const callMatch = /\b(?:pagar|call|valor\s+para\s+pagar)(?:\s+de|\s+é|\s*:)*\s*(\d+(?:[.,]\d+)?)\s*(bb|big\s*blinds?|fichas)?\b/i.exec(normalized);
  const callAmount = callMatch ? Number(callMatch[1].replace(",", ".")) : opposingBet;
  const rawUnit = (potMatch[2] || betMatch[2] || "BB").toLowerCase();
  const unit: "BB" | "fichas" = rawUnit.startsWith("ficha") ? "fichas" : "BB";
  return computeDeterministicPotMath({ potBeforeBet, opposingBet, callAmount, unit });
}
