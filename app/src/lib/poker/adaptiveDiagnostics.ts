import type { Street } from "./stateEngine.ts";
import type { DecisionClassification } from "./drillEvaluator.ts";
import { isSpotIdExcludedFromMtt } from "./mttCatalog.ts";
import type {
  CanonicalSpot,
  CurriculumTrackId,
  StrategyStatus,
  StrategyUnit,
} from "./strategySchema.ts";

export type TrainerModeId = "LEARNING" | "GTO_TECHNICAL";

export type ConfidenceLevel = "baixa" | "media" | "alta";

export type TournamentFormatCategory =
  | "MTT_CHEV"
  | "MTT_ICM"
  | "PKO"
  | "SNG_SPIN"
  | "CASH";

export type LeakTaxonomyId =
  | "missed_value_bets"
  | "overbluff"
  | "underdefend_bb"
  | "bad_3bet_size"
  | "icm_call_errors"
  | "pko_coverage_errors"
  | "preflop_rfi_deviation"
  | "postflop_cbet_error";

export interface ReferenceStrategySnapshot {
  status: StrategyStatus;
  dominantAction: string | null;
  dominantFreq: number | null;
  chosenFreq: number | null;
  actionFrequencies: Record<string, number> | null;
  actionEv: Record<string, number> | null;
}

export interface AdaptiveExerciseRecord {
  attemptId: string;
  timestamp: number;
  trainerMode: TrainerModeId;
  spotId: string;
  spotName: string;
  trackId: CurriculumTrackId;
  spotType: string;
  handClass: string;
  chosenAction: string;
  referenceStrategySummary: ReferenceStrategySnapshot;
  evLoss: number | null;
  evUnit: StrategyUnit | null;
  confidenceLevel: ConfidenceLevel;
  heroPosition: string;
  effectiveStackBb: number;
  tournamentFormat: TournamentFormatCategory;
  street: Street;
  classification: DecisionClassification;
  isAcceptable: boolean;
  leakCategory: LeakTaxonomyId | null;
}

export interface ClassifiedLeakSummary {
  leakCategory: LeakTaxonomyId;
  label: string;
  description: string;
  occurrences: number;
  frequencyOfTotalErrors: number;
  avgEvLoss: number | null;
  blindSpotCount: number; // erros cometidos com confiança 'alta'
  topAffectedSpots: string[];
  impactScore: number;
}

/** Entrada mínima compartilhada pelo treinador e pelos quizzes conceituais. */
export interface SpacedRepetitionRecord<TTrack = CurriculumTrackId> {
  spotId: string;
  spotName: string;
  trackId: TTrack;
  timestamp: number;
  confidenceLevel: ConfidenceLevel;
  evLoss: number | null;
  isAcceptable: boolean;
}

export interface SpacedRepetitionItem<TTrack = CurriculumTrackId> {
  spotId: string;
  spotName: string;
  trackId: TTrack;
  boxLevel: 0 | 1 | 2 | 3 | 4 | 5;
  intervalDays: number;
  lastAttemptAt: number;
  nextReviewAt: number;
  isDueNow: boolean;
  attemptsCount: number;
  avgEvLoss: number | null;
  lastConfidence: ConfidenceLevel;
  priorityScore: number;
  reason: string;
}

export interface DimensionProgressItem {
  key: string;
  label: string;
  attempts: number;
  acceptableCount: number;
  accuracyPct: number;
  avgEvLoss: number | null;
  evLossCount: number;
  highConfidencePct: number;
  sampleConfidence: "amostra_insuficiente (<10)" | "amostra_em_formacao (10-29)" | "amostra_solida (>=30)";
}

export interface DimensionalProgressReport {
  totalAttempts: number;
  overallAccuracyPct: number;
  overallAvgEvLoss: number | null;
  provenanceCompletenessPct: number;
  byPosition: DimensionProgressItem[];
  byStack: DimensionProgressItem[];
  byFormat: DimensionProgressItem[];
  byStreet: DimensionProgressItem[];
}

export const ADAPTIVE_STORAGE_KEY_V2 = "reglife_poker_adaptive_diag_v2" as const;

export const LEAK_TAXONOMY_META: Record<
  LeakTaxonomyId,
  { label: string; description: string }
> = {
  missed_value_bets: {
    label: "Perda de Valor (Missed Value)",
    description: "Check ou linha passiva quando a mão possui claro EV superior apostando/aumentando por valor.",
  },
  overbluff: {
    label: "Excesso de Agressão / Overbluff",
    description: "Aposta, raise ou all-in com mãos de 0% de frequência que deveriam ir para check ou fold.",
  },
  underdefend_bb: {
    label: "Overfold na Defesa do Big Blind",
    description: "Desistência excessiva no BB (pré-flop ou vs C-bet) ignorando pot odds e backdoors.",
  },
  bad_3bet_size: {
    label: "Desvio em Vs RFI / 3-Bet",
    description: "Escolha incorreta entre Call, 3-Bet e Fold ao enfrentar open raise.",
  },
  icm_call_errors: {
    label: "Erro de Pressão de ICM ($EV)",
    description: "Colisão marginal ou call/shove negativo em $EV ignorando o Bubble Factor.",
  },
  pko_coverage_errors: {
    label: "Erro de Cobertura e Bounty (PKO)",
    description: "Subestimar ou superestimar o valor do bounty em relação à cobertura de stacks.",
  },
  preflop_rfi_deviation: {
    label: "Desvio de Abertura Pré-Flop (RFI / Short Stack)",
    description: "Abrir mãos fora de range ou deixar de abrir/shovar mãos lucrativas em RFI.",
  },
  postflop_cbet_error: {
    label: "Erro de C-Bet / Sizing Pós-Flop",
    description: "Escolha de frequência ou sizing de continuação incompatível com a textura do board.",
  },
};

const SPACED_INTERVAL_DAYS: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function inferTournamentFormatCategory(spot: CanonicalSpot): TournamentFormatCategory {
  if (spot.format === "CASH") return "CASH";
  if (spot.format === "SNG" || spot.spotId.startsWith("spin_")) return "SNG_SPIN";
  const icmMode = spot.referenceStrategy.assumptions?.icmMode;
  if (icmMode === "PKO_BOUNTY" || spot.spotId.includes("pko")) return "PKO";
  if (icmMode === "ICM" || spot.spotId.includes("icm")) return "MTT_ICM";
  return "MTT_CHEV";
}

export function inferStackBucketLabel(stackBb: number): string {
  if (stackBb <= 15) return "<= 15 BB (Short/Push)";
  if (stackBb <= 22) return "17–20 BB (Re-steal)";
  if (stackBb <= 35) return "25–30 BB (Médio MTT)";
  if (stackBb <= 60) return "50 BB (Deep MTT)";
  return "100 BB ( Muito Deep)";
}

/**
 * Classifica o tipo de leak quando ocorre um erro (`ev_error`) em um exercício.
 */
export function classifyAttemptLeak(params: {
  spot: CanonicalSpot;
  chosenAction: string;
  bestAction: string | null;
  classification: DecisionClassification;
}): LeakTaxonomyId | null {
  const { spot, chosenAction, bestAction, classification } = params;
  if (classification !== "ev_error") return null;

  const formatCat = inferTournamentFormatCategory(spot);
  if (formatCat === "MTT_ICM") return "icm_call_errors";
  if (formatCat === "PKO") return "pko_coverage_errors";

  const chosenLower = chosenAction.toLowerCase();
  const bestLower = (bestAction ?? "").toLowerCase();

  if (spot.heroPosition === "BB" && chosenLower.includes("fold")) {
    return "underdefend_bb";
  }

  if (
    (chosenLower.includes("check") || chosenLower.includes("fold")) &&
    (bestLower.includes("bet") || bestLower.includes("raise") || bestLower.includes("allin"))
  ) {
    return spot.street === "PREFLOP" ? "preflop_rfi_deviation" : "missed_value_bets";
  }

  if (
    (chosenLower.includes("bet") || chosenLower.includes("raise") || chosenLower.includes("allin")) &&
    (bestLower.includes("check") || bestLower.includes("fold"))
  ) {
    return "overbluff";
  }

  if (spot.spotType === "vs_rfi") {
    return "bad_3bet_size";
  }

  if (spot.street !== "PREFLOP") {
    return "postflop_cbet_error";
  }

  return "preflop_rfi_deviation";
}

/**
 * Classifica e ordena os principais leaks por frequência, impacto de EV e fator de confiança.
 */
export function classifyAndRankLeaks(
  records: readonly AdaptiveExerciseRecord[],
): ClassifiedLeakSummary[] {
  const errorRecords = records.filter((r) => !r.isAcceptable && r.leakCategory !== null);
  if (errorRecords.length === 0) return [];

  const grouped = new Map<
    LeakTaxonomyId,
    {
      count: number;
      evLossSum: number;
      evLossCount: number;
      blindSpots: number;
      weightedImpactSum: number;
      spotCounts: Map<string, number>;
    }
  >();

  for (const r of errorRecords) {
    const cat = r.leakCategory!;
    const g = grouped.get(cat) ?? {
      count: 0,
      evLossSum: 0,
      evLossCount: 0,
      blindSpots: 0,
      weightedImpactSum: 0,
      spotCounts: new Map<string, number>(),
    };

    g.count += 1;
    if (r.evLoss !== null) {
      g.evLossSum += r.evLoss;
      g.evLossCount += 1;
    }
    if (r.confidenceLevel === "alta") {
      g.blindSpots += 1;
    }

    // Peso de confiança: errar com confiança alta é um ponto cego grave (1.35x);
    // errar com confiança baixa sinaliza lacuna conceitual reconhecida (1.15x).
    const confWeight =
      r.confidenceLevel === "alta" ? 1.35 : r.confidenceLevel === "baixa" ? 1.15 : 1.0;
    const baseLoss = r.evLoss !== null ? Math.max(0.05, r.evLoss) : 0.25;
    g.weightedImpactSum += baseLoss * confWeight;

    g.spotCounts.set(r.spotName, (g.spotCounts.get(r.spotName) ?? 0) + 1);
    grouped.set(cat, g);
  }

  const summaries: ClassifiedLeakSummary[] = [];
  for (const [cat, g] of grouped.entries()) {
    const meta = LEAK_TAXONOMY_META[cat];
    const freq = round4(g.count / errorRecords.length);
    const avgEvLoss = g.evLossCount > 0 ? round4(g.evLossSum / g.evLossCount) : null;
    const topSpots = Array.from(g.spotCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    const impactScore = round4(g.weightedImpactSum * (0.5 + freq));

    summaries.push({
      leakCategory: cat,
      label: meta.label,
      description: meta.description,
      occurrences: g.count,
      frequencyOfTotalErrors: freq,
      avgEvLoss,
      blindSpotCount: g.blindSpots,
      topAffectedSpots: topSpots,
      impactScore,
    });
  }

  return summaries.sort((a, b) => b.impactScore - a.impactScore);
}

/**
 * Calcula a agenda de repetição espaçada (Leitner adaptativo por EV loss e confiança).
 */
export function computeSpacedRepetitionSchedule<TTrack = CurriculumTrackId>(
  records: readonly SpacedRepetitionRecord<TTrack>[],
  nowMs: number = Date.now(),
): SpacedRepetitionItem<TTrack>[] {
  if (records.length === 0) return [];

  // Ordena cronologicamente para simular a evolução da caixa de Leitner de cada spot
  const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);

  const stateBySpot = new Map<
    string,
    {
      spotName: string;
      trackId: TTrack;
      box: 0 | 1 | 2 | 3 | 4 | 5;
      lastAttemptAt: number;
      attempts: number;
      evLossSum: number;
      evLossCount: number;
      lastConfidence: ConfidenceLevel;
      lastWasError: boolean;
    }
  >();

  for (const rec of sorted) {
    if (isSpotIdExcludedFromMtt(rec.spotId)) continue;
    const prev = stateBySpot.get(rec.spotId) ?? {
      spotName: rec.spotName,
      trackId: rec.trackId,
      box: 0 as 0 | 1 | 2 | 3 | 4 | 5,
      lastAttemptAt: rec.timestamp,
      attempts: 0,
      evLossSum: 0,
      evLossCount: 0,
      lastConfidence: rec.confidenceLevel,
      lastWasError: false,
    };

    prev.attempts += 1;
    prev.lastAttemptAt = rec.timestamp;
    prev.lastConfidence = rec.confidenceLevel;

    if (rec.evLoss !== null) {
      prev.evLossSum += rec.evLoss;
      prev.evLossCount += 1;
    }

    const significantEvLoss = rec.evLoss !== null && rec.evLoss > 0.05;
    if (!rec.isAcceptable || significantEvLoss) {
      // Erro ou perda significativa de EV -> retorna imediatamente para Box 0 (revisão imediata)
      prev.box = 0;
      prev.lastWasError = true;
    } else if (rec.confidenceLevel === "baixa") {
      // Acertou mas com baixa confiança -> mantém em Box 1 (1 dia) para consolidar
      prev.box = 1;
      prev.lastWasError = false;
    } else {
      // Acertou com confiança média/alta -> avança uma caixa até o limite 5 (30 dias)
      prev.box = Math.min(5, prev.box + 1) as 0 | 1 | 2 | 3 | 4 | 5;
      prev.lastWasError = false;
    }

    stateBySpot.set(rec.spotId, prev);
  }

  const schedule: SpacedRepetitionItem<TTrack>[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const [spotId, st] of stateBySpot.entries()) {
    const intervalDays = SPACED_INTERVAL_DAYS[st.box];
    const nextReviewAt = st.lastAttemptAt + intervalDays * DAY_MS;
    const isDueNow = st.box === 0 || nowMs >= nextReviewAt;
    const avgEvLoss = st.evLossCount > 0 ? round4(st.evLossSum / st.evLossCount) : null;

    const overdueFactor = isDueNow ? 2.0 : Math.max(0.1, 1 - (nextReviewAt - nowMs) / (7 * DAY_MS));
    const lossWeight = avgEvLoss !== null ? 1 + avgEvLoss * 3 : st.lastWasError ? 1.8 : 1.0;
    const confWeight = st.lastConfidence === "baixa" ? 1.3 : 1.0;
    const priorityScore = round4(overdueFactor * lossWeight * confWeight * (6 - st.box));

    let reason = `Caixa ${st.box} (intervalo ${intervalDays}d)`;
    if (st.box === 0) {
      reason = "Revisão Imediata — Erro ou EV Loss relevante na última tentativa";
    } else if (st.lastConfidence === "baixa") {
      reason = "Revisão Prioritária — Acertou com baixa confiança declarada";
    } else if (isDueNow) {
      reason = `Prazo de revisão atingido (${intervalDays}d)`;
    }

    schedule.push({
      spotId,
      spotName: st.spotName,
      trackId: st.trackId,
      boxLevel: st.box,
      intervalDays,
      lastAttemptAt: st.lastAttemptAt,
      nextReviewAt,
      isDueNow,
      attemptsCount: st.attempts,
      avgEvLoss,
      lastConfidence: st.lastConfidence,
      priorityScore,
      reason,
    });
  }

  return schedule.sort((a, b) => b.priorityScore - a.priorityScore);
}

function buildDimensionSlice(
  records: readonly AdaptiveExerciseRecord[],
  keyFn: (r: AdaptiveExerciseRecord) => { key: string; label: string },
  orderedKeys?: readonly { key: string; label: string }[],
): DimensionProgressItem[] {
  const map = new Map<
    string,
    {
      label: string;
      attempts: number;
      acceptable: number;
      evLossSum: number;
      evLossCount: number;
      highConfCount: number;
    }
  >();

  if (orderedKeys) {
    for (const k of orderedKeys) {
      map.set(k.key, {
        label: k.label,
        attempts: 0,
        acceptable: 0,
        evLossSum: 0,
        evLossCount: 0,
        highConfCount: 0,
      });
    }
  }

  for (const r of records) {
    const { key, label } = keyFn(r);
    const cur = map.get(key) ?? {
      label,
      attempts: 0,
      acceptable: 0,
      evLossSum: 0,
      evLossCount: 0,
      highConfCount: 0,
    };
    cur.attempts += 1;
    if (r.isAcceptable) cur.acceptable += 1;
    if (r.evLoss !== null) {
      cur.evLossSum += r.evLoss;
      cur.evLossCount += 1;
    }
    if (r.confidenceLevel === "alta") cur.highConfCount += 1;
    map.set(key, cur);
  }

  const list: DimensionProgressItem[] = [];
  for (const [key, g] of map.entries()) {
    if (g.attempts === 0 && !orderedKeys) continue;
    const accuracyPct = g.attempts > 0 ? Math.round((g.acceptable / g.attempts) * 1000) / 10 : 0;
    const avgEvLoss = g.evLossCount > 0 ? round4(g.evLossSum / g.evLossCount) : null;
    const highConfidencePct =
      g.attempts > 0 ? Math.round((g.highConfCount / g.attempts) * 1000) / 10 : 0;
    const sampleConfidence: DimensionProgressItem["sampleConfidence"] =
      g.attempts < 10
        ? "amostra_insuficiente (<10)"
        : g.attempts < 30
          ? "amostra_em_formacao (10-29)"
          : "amostra_solida (>=30)";

    list.push({
      key,
      label: g.label,
      attempts: g.attempts,
      acceptableCount: g.acceptable,
      accuracyPct,
      avgEvLoss,
      evLossCount: g.evLossCount,
      highConfidencePct,
      sampleConfidence,
    });
  }

  return list.filter((item) => item.attempts > 0);
}

/**
 * Calcula o progresso multidimensional por Posição, Stack, Formato de Torneio e Street (Item 5 da Etapa 5).
 */
export function computeDimensionalProgress(
  records: readonly AdaptiveExerciseRecord[],
): DimensionalProgressReport {
  const total = records.length;
  const acceptable = records.filter((r) => r.isAcceptable).length;
  const overallAccuracyPct = total > 0 ? Math.round((acceptable / total) * 1000) / 10 : 0;

  let evSum = 0;
  let evCount = 0;
  let verifiedCount = 0;
  for (const r of records) {
    if (r.evLoss !== null) {
      evSum += r.evLoss;
      evCount += 1;
    }
    if (r.referenceStrategySummary.status === "VERIFIED") {
      verifiedCount += 1;
    }
  }

  const overallAvgEvLoss = evCount > 0 ? round4(evSum / evCount) : null;
  const provenanceCompletenessPct =
    total > 0 ? Math.round((verifiedCount / total) * 1000) / 10 : 0;

  const byPosition = buildDimensionSlice(records, (r) => ({
    key: r.heroPosition,
    label: `Posição ${r.heroPosition}`,
  }));

  const byStack = buildDimensionSlice(records, (r) => {
    const label = inferStackBucketLabel(r.effectiveStackBb);
    return { key: label, label };
  });

  const formatLabels: Record<TournamentFormatCategory, string> = {
    MTT_CHEV: "MTT Vanilla (chipEV)",
    MTT_ICM: "MTT Vanilla (ICM $EV)",
    PKO: "MTT PKO (Bounty)",
    SNG_SPIN: "Spin & Go / SNG (3-Max)",
    CASH: "Cash Game",
  };

  const byFormat = buildDimensionSlice(records, (r) => ({
    key: r.tournamentFormat,
    label: formatLabels[r.tournamentFormat] ?? r.tournamentFormat,
  }));

  const streetLabels: Record<Street, string> = {
    PREFLOP: "Pré-Flop",
    FLOP: "Flop",
    TURN: "Turn",
    RIVER: "River",
  };

  const byStreet = buildDimensionSlice(records, (r) => ({
    key: r.street,
    label: streetLabels[r.street] ?? r.street,
  }));

  return {
    totalAttempts: total,
    overallAccuracyPct,
    overallAvgEvLoss,
    provenanceCompletenessPct,
    byPosition,
    byStack,
    byFormat,
    byStreet,
  };
}
