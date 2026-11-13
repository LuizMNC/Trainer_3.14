import type {
  CanonicalSpot,
  StrategyStatus,
  StrategyUnit,
} from "./strategySchema.ts";

export type DecisionClassification =
  | "exact_primary"
  | "valid_mixed"
  | "low_freq_acceptable"
  | "ev_error"
  | "unsolved";

export interface DrillEvaluationResult {
  gtoScored: boolean;
  evScored: boolean;
  evUnavailableReason?: string;
  strategyStatus: StrategyStatus;
  classification: DecisionClassification;
  chosenAction: string;
  chosenFreq: number | null;
  bestAction: string | null;
  bestFreq: number | null;
  chosenEv: number | null;
  bestEv: number | null;
  evLoss: number | null;
  evUnit: StrategyUnit | null;
  rngMatch: boolean | null;
  rngTargetAction: string | null;
  headline: string;
  detail: string;
}

export interface MixedAttemptRecord {
  spotId: string;
  hand: string;
  chosenAction: string;
  targetDistribution: Record<string, number>;
  evLoss: number | null;
  timestamp: number;
}

export interface MixedAdherenceSummary {
  attempts: number;
  observedDistribution: Record<string, number>;
  targetDistribution: Record<string, number>;
  adherencePct: number;
}

export interface LeakPriorityItem {
  spotId: string;
  attempts: number;
  avgEvLoss: number;
  errorRate: number;
  impactScore: number;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function getDominantActionFromDist(dist: Record<string, number>): {
  action: string;
  freq: number;
} {
  let bestAction = "Fold";
  let bestFreq = -1;
  for (const [act, freq] of Object.entries(dist)) {
    if (freq > bestFreq) {
      bestFreq = freq;
      bestAction = act;
    }
  }
  return { action: bestAction, freq: Math.max(0, bestFreq) };
}

export function pickRngTargetAction(
  orderedActions: readonly string[],
  dist: Record<string, number>,
  rngValue: number,
): string {
  let acc = 0;
  for (const name of orderedActions) {
    const pct = (dist[name] ?? 0) * 100;
    if (pct > 0) {
      acc += pct;
      if (rngValue <= acc || Math.abs(rngValue - acc) < 0.01) {
        return name;
      }
    }
  }
  return getDominantActionFromDist(dist).action;
}

export function assertSpotAllowedInTechnicalGtoMode(spot: CanonicalSpot): {
  allowed: boolean;
  reason?: string;
} {
  const ref = spot.referenceStrategy;
  if (ref.status !== "VERIFIED") {
    return {
      allowed: false,
      reason: `Spot '${spot.name}' possui status '${ref.status}'. O Modo GTO Técnico exige estritamente soluções com status 'VERIFIED' (frequências validadas, origem rastreável e hash de premissas).`,
    };
  }
  if (
    !ref.assumptionsHash ||
    !ref.solutionSource ||
    ref.solutionSource.providerType === "DidacticDemo" ||
    ref.solutionSource.providerType === "NoSolution"
  ) {
    return {
      allowed: false,
      reason: `Spot '${spot.name}' declarado VERIFIED sem proveniência rastreável ou assumptionsHash válido — bloqueado por segurança no Modo GTO Técnico.`,
    };
  }
  return { allowed: true };
}

/**
 * Avalia decisão do aluno preservando justiça em estratégias mistas:
 * uma ação +EV de menor frequência não é punida como erro puro; pontua-se EV loss e aderência acumulada.
 * No modo GTO_TECHNICAL, bloqueia qualquer spot cujo status não seja estritamente VERIFIED.
 */
export function evaluateDrillDecision(params: {
  spot: CanonicalSpot;
  handClass: string;
  chosenAction: string;
  rngValue?: number | null;
  useRng?: boolean;
  mode?: "LEARNING" | "GTO_TECHNICAL";
}): DrillEvaluationResult {
  const {
    spot,
    handClass,
    chosenAction,
    rngValue = null,
    useRng = false,
    mode = "LEARNING",
  } = params;
  const ref = spot.referenceStrategy;

  if (mode === "GTO_TECHNICAL") {
    const gate = assertSpotAllowedInTechnicalGtoMode(spot);
    if (!gate.allowed) {
      return {
        gtoScored: false,
        evScored: false,
        evUnavailableReason: gate.reason,
        strategyStatus: ref.status,
        classification: "unsolved",
        chosenAction,
        chosenFreq: null,
        bestAction: null,
        bestFreq: null,
        chosenEv: null,
        bestEv: null,
        evLoss: null,
        evUnit: null,
        rngMatch: null,
        rngTargetAction: null,
        headline: `BLOQUEADO NO MODO GTO TÉCNICO (${ref.status})`,
        detail:
          gate.reason ??
          `O spot '${spot.name}' não atende aos critérios de verificação para o Modo GTO Técnico.`,
      };
    }
  }

  if (ref.status === "UNSOLVED") {
    return {
      gtoScored: false,
      evScored: false,
      strategyStatus: "UNSOLVED",
      classification: "unsolved",
      chosenAction,
      chosenFreq: null,
      bestAction: null,
      bestFreq: null,
      chosenEv: null,
      bestEv: null,
      evLoss: null,
      evUnit: null,
      rngMatch: null,
      rngTargetAction: null,
      headline: "UNSOLVED — Modo Conceitual (sem pontuação GTO)",
      detail: `Não há política de solver verificada para ${spot.name}. Leia a orientação conceitual abaixo; nenhuma frequência ou EV foi inventado.`,
    };
  }

  const dist =
    ref.actionFrequencies ??
    ref.matrixFrequencies?.[handClass] ??
    null;

  if (!dist) {
    return {
      gtoScored: false,
      evScored: false,
      strategyStatus: "UNSOLVED",
      classification: "unsolved",
      chosenAction,
      chosenFreq: null,
      bestAction: null,
      bestFreq: null,
      chosenEv: null,
      bestEv: null,
      evLoss: null,
      evUnit: null,
      rngMatch: null,
      rngTargetAction: null,
      headline: "UNSOLVED — Mão sem solução neste spot",
      detail: `Nenhuma distribuição encontrada para ${handClass} em ${spot.name}.`,
    };
  }

  const chosenFreq = dist[chosenAction] ?? 0;
  const { action: domAction, freq: domFreq } = getDominantActionFromDist(dist);

  // REGRA DE AUDITORIA DE INTEGRIDADE:
  // Apenas soluções matematicamente comprovadas (status === "VERIFIED") podem gerar
  // pontuação GTO (gtoScored = true) ou cálculo de EV / EV loss.
  // Quando status === "VERIFIED" mas matrixEv === null (ex.: TexasSolver CLI v0.2.0),
  // evLoss permanece estritamente null (evScored = false) sem jamais inventar EVs.
  const isVerifiedSolver = ref.status === "VERIFIED";
  const evMap = isVerifiedSolver
    ? (ref.actionEv ?? ref.matrixEv?.[handClass] ?? null)
    : null;

  let bestAction = domAction;
  let bestEv: number | null = null;
  let chosenEv: number | null = null;
  let evLoss: number | null = null;
  const effectiveEvUnit: StrategyUnit | null = isVerifiedSolver && evMap ? ref.evUnit : null;

  if (isVerifiedSolver && evMap && Object.keys(evMap).length > 0) {
    let maxEv = -Infinity;
    let maxAct = domAction;
    for (const [act, val] of Object.entries(evMap)) {
      if (val > maxEv) {
        maxEv = val;
        maxAct = act;
      }
    }
    bestEv = round4(maxEv);
    bestAction = maxAct;
    chosenEv = evMap[chosenAction] !== undefined ? round4(evMap[chosenAction]) : null;
    if (chosenEv !== null) {
      evLoss = Math.max(0, round4(bestEv - chosenEv));
    }
  }

  const evScored = isVerifiedSolver && evLoss !== null;
  const evUnavailableReason =
    isVerifiedSolver && !evScored
      ? (ref.evUnavailableReason ??
          "Solução verificada sem tabela de EV por ação (EV loss desabilitado; nenhum EV estimado).")
      : undefined;

  const orderedNames = spot.legalActions.map((a) => a.name);
  const rngTargetAction =
    useRng && rngValue !== null ? pickRngTargetAction(orderedNames, dist, rngValue) : null;
  const rngMatch = useRng && rngTargetAction !== null ? rngTargetAction === chosenAction : null;

  const sourceTag =
    ref.status === "DIDACTIC_DEMO"
      ? " [Demo Sintética — Sem EV de Solver]"
      : ref.status === "IMPORTED_CHART_NO_EV"
        ? " [Chart Local s/ EV]"
        : isVerifiedSolver && !evScored
          ? " [Solver CLI — Frequências GTO s/ EV]"
          : "";

  const evSuffix =
    evScored && evLoss !== null && effectiveEvUnit
      ? ` | EV loss: ${evLoss.toFixed(3)} ${effectiveEvUnit} (melhor: ${bestAction} = ${bestEv?.toFixed(3)} ${effectiveEvUnit})`
      : isVerifiedSolver && !evScored
        ? " | EV loss: indisponível (dump sem EV por ação)"
        : "";

  if (chosenFreq >= 0.9) {
    return {
      gtoScored: isVerifiedSolver,
      evScored,
      evUnavailableReason,
      strategyStatus: ref.status,
      classification: "exact_primary",
      chosenAction,
      chosenFreq,
      bestAction,
      bestFreq: domFreq,
      chosenEv,
      bestEv,
      evLoss,
      evUnit: effectiveEvUnit,
      rngMatch,
      rngTargetAction,
      headline: `Ação Principal (${Math.round(chosenFreq * 100)}%)${sourceTag}`,
      detail: `${handClass} escolhe ${chosenAction} com ${Math.round(chosenFreq * 100)}% de frequência.${evSuffix}`,
    };
  }

  // Estratégia mista: qualquer ação com frequência positiva não é erro bruto; se EV loss ~ 0, é indiferente / +EV válido!
  if (chosenFreq >= 0.05 || (chosenFreq > 0 && evLoss !== null && evLoss <= 0.02)) {
    const isLowFreq = chosenFreq < 0.25 && chosenFreq < domFreq - 0.15;
    const classification: DecisionClassification = isLowFreq
      ? "low_freq_acceptable"
      : "valid_mixed";

    const rngNote =
      useRng && rngTargetAction && rngTargetAction !== chosenAction
        ? ` Nota de calibração RNG (${rngValue}): a rolagem apontou ${rngTargetAction}, mas sua ação ainda faz parte do mix válido.`
        : "";

    return {
      gtoScored: isVerifiedSolver,
      evScored,
      evUnavailableReason,
      strategyStatus: ref.status,
      classification,
      chosenAction,
      chosenFreq,
      bestAction,
      bestFreq: domFreq,
      chosenEv,
      bestEv,
      evLoss,
      evUnit: effectiveEvUnit,
      rngMatch,
      rngTargetAction,
      headline: isLowFreq
        ? `Mix de Menor Frequência Aceitável (${Math.round(chosenFreq * 100)}%)${sourceTag}`
        : `Estratégia Mista Válida (${Math.round(chosenFreq * 100)}%)${sourceTag}`,
      detail: `${handClass} mistura: ${Object.entries(dist)
        .filter(([, v]) => v >= 0.01)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
        .join(" / ")}.${evSuffix}${rngNote}`,
    };
  }

  return {
    gtoScored: isVerifiedSolver,
    evScored,
    evUnavailableReason,
    strategyStatus: ref.status,
    classification: "ev_error",
    chosenAction,
    chosenFreq,
    bestAction,
    bestFreq: domFreq,
    chosenEv,
    bestEv,
    evLoss,
    evUnit: effectiveEvUnit,
    rngMatch,
    rngTargetAction,
    headline: `Desvio da Política de Referência${sourceTag}`,
    detail: `${chosenAction} tem ${Math.round(chosenFreq * 100)}% para ${handClass}. Ação principal: ${bestAction} (${Math.round(domFreq * 100)}%).${evSuffix}`,
  };
}

/**
 * Mede aderência às frequências mistas ao longo de N tentativas usando distância L1 (1 - TVD).
 */
export function computeMixedAdherenceStats(
  attempts: readonly MixedAttemptRecord[],
): MixedAdherenceSummary {
  if (attempts.length === 0) {
    return {
      attempts: 0,
      observedDistribution: {},
      targetDistribution: {},
      adherencePct: 100,
    };
  }

  const targetDistribution = attempts[attempts.length - 1].targetDistribution;
  const counts: Record<string, number> = {};
  for (const a of attempts) {
    counts[a.chosenAction] = (counts[a.chosenAction] ?? 0) + 1;
  }

  const allActions = new Set([
    ...Object.keys(targetDistribution),
    ...Object.keys(counts),
  ]);

  const observedDistribution: Record<string, number> = {};
  let l1 = 0;
  for (const act of allActions) {
    const obs = (counts[act] ?? 0) / attempts.length;
    const tgt = targetDistribution[act] ?? 0;
    observedDistribution[act] = round4(obs);
    l1 += Math.abs(obs - tgt);
  }

  const tvd = l1 / 2;
  const adherencePct = Math.max(0, Math.round((1 - tvd) * 1000) / 10);

  return {
    attempts: attempts.length,
    observedDistribution,
    targetDistribution,
    adherencePct,
  };
}

/**
 * Prioriza spots para revisão adaptativa: frequência do spot * EV loss médio * baixa confiança.
 */
export function rankLeakSpots(
  attempts: readonly {
    spotId: string;
    evLoss: number | null;
    isError: boolean;
  }[],
): LeakPriorityItem[] {
  const total = attempts.length;
  if (total === 0) return [];

  const grouped = new Map<
    string,
    { attempts: number; evLossSum: number; evLossCount: number; errors: number }
  >();

  for (const a of attempts) {
    const cur = grouped.get(a.spotId) ?? {
      attempts: 0,
      evLossSum: 0,
      evLossCount: 0,
      errors: 0,
    };
    cur.attempts += 1;
    if (a.evLoss !== null) {
      cur.evLossSum += a.evLoss;
      cur.evLossCount += 1;
    }
    if (a.isError) cur.errors += 1;
    grouped.set(a.spotId, cur);
  }

  const items: LeakPriorityItem[] = [];
  for (const [spotId, g] of grouped.entries()) {
    const spotFreq = g.attempts / total;
    const errorRate = g.errors / g.attempts;
    const avgEvLoss =
      g.evLossCount > 0 ? round4(g.evLossSum / g.evLossCount) : round4(errorRate);
    const lowConfidence = Math.min(1, 0.3 + errorRate * 0.7);
    const impactScore = round4(spotFreq * Math.max(avgEvLoss, errorRate * 0.5) * lowConfidence);
    items.push({
      spotId,
      attempts: g.attempts,
      avgEvLoss,
      errorRate: round4(errorRate),
      impactScore,
    });
  }

  return items.sort((a, b) => b.impactScore - a.impactScore);
}
