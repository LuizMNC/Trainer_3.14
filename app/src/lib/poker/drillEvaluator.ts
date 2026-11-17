import {
  classifyCellDistributionIntegrity,
  type CanonicalSpot,
  type StrategyStatus,
  type StrategyUnit,
} from "./strategySchema.ts";

export type DecisionClassification =
  | "exact_primary"
  | "valid_mixed"
  | "low_freq_acceptable"
  | "ev_error"
  | "unsolved";

export type CellIntegrityStatus =
  | "COMPLETE"
  | "ROUNDING_ONLY"
  | "INCOMPLETE_MINOR"
  | "INCOMPLETE_SEVERE"
  | "INVALID"
  | "UNSOLVED";

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
  integrityStatus: CellIntegrityStatus;
  integrityBlocked: boolean;
  integrityWarning: string | null;
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
  groupsCount: number;
  reliableAttempts: number;
  reliableGroupsCount: number;
  incompleteExcludedAttempts: number;
  hasIncompleteData: boolean;
  observedDistribution: Record<string, number>;
  targetDistribution: Record<string, number>;
  adherencePct: number;
}

export interface LeakPriorityItem {
  spotId: string;
  attempts: number;
  avgEvLoss: number | null;
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
): string | null {
  if (!Number.isFinite(rngValue) || rngValue < 0 || rngValue > 100) {
    return null;
  }
  let acc = 0;
  let lastPositiveAction: string | null = null;
  for (const name of orderedActions) {
    const rawFreq = dist[name] ?? 0;
    if (!Number.isFinite(rawFreq) || rawFreq < 0) continue;
    const pct = rawFreq * 100;
    if (pct > 0) {
      acc += pct;
      lastPositiveAction = name;
      if (rngValue <= acc || Math.abs(rngValue - acc) < 0.01) {
        return name;
      }
    }
  }
  const sum = acc / 100;
  // Somente tolera resíduo numérico trivial de arredondamento (<= 0,002) no limite superior.
  // Nunca converte massa de probabilidade ausente em frequência da ação dominante.
  if (sum >= 0.998 && sum <= 1.002 && rngValue <= 100 && lastPositiveAction) {
    return lastPositiveAction;
  }
  return null;
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
  enforceIntegrityGuard?: boolean;
}): DrillEvaluationResult {
  const {
    spot,
    handClass,
    chosenAction,
    rngValue = null,
    useRng = false,
    mode = "LEARNING",
    enforceIntegrityGuard = false,
  } = params;
  const ref = spot.referenceStrategy;

  // O rótulo VERIFIED sozinho não autoriza pontuação nem EV no modo educativo.
  if (mode === "GTO_TECHNICAL" || ref.status === "VERIFIED") {
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
        integrityStatus: "UNSOLVED",
        integrityBlocked: false,
        integrityWarning: null,
        headline: mode === "GTO_TECHNICAL"
          ? `BLOQUEADO NO MODO GTO TÉCNICO (${ref.status})`
          : "REFERÊNCIA SEM PROVENIÊNCIA — pontuação e EV desativados",
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
      integrityStatus: "UNSOLVED",
      integrityBlocked: false,
      integrityWarning: null,
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
      integrityStatus: "UNSOLVED",
      integrityBlocked: false,
      integrityWarning: null,
      headline: "UNSOLVED — Mão sem solução neste spot",
      detail: `Nenhuma distribuição encontrada para ${handClass} em ${spot.name}.`,
    };
  }

  const orderedNames = spot.legalActions.map((a) => a.name);
  const integrityCheck = classifyCellDistributionIntegrity(dist, orderedNames, handClass);
  const integrityStatus: CellIntegrityStatus = integrityCheck.status;
  const pctSumLabel = (integrityCheck.sum * 100).toFixed(1);
  const missingPctLabel = (integrityCheck.deltaFromOne * 100).toFixed(1);
  const chosenFreq = dist[chosenAction] ?? 0;
  const { action: domAction, freq: domFreq } = getDominantActionFromDist(dist);

  const baseIntegrityWarning =
    integrityStatus === "INVALID"
      ? `Distribuição inválida para ${handClass} (soma ${pctSumLabel}%). Correção automática bloqueada para estudo seguro.`
      : integrityStatus === "INCOMPLETE_SEVERE"
        ? `Distribuição incompleta na extração (${handClass} soma ${pctSumLabel}%; faltam ${missingPctLabel}%). Estude o gráfico; correção automática bloqueada.`
        : integrityStatus === "INCOMPLETE_MINOR"
          ? `Distribuição com perda menor na extração (${handClass} soma ${pctSumLabel}%; diferença de ${missingPctLabel}%). Ações com 0% não são punidas automaticamente.`
          : null;

  const shouldBlockForIntegrity =
    enforceIntegrityGuard &&
    (integrityStatus === "INVALID" ||
      integrityStatus === "INCOMPLETE_SEVERE" ||
      (integrityStatus === "INCOMPLETE_MINOR" && chosenFreq === 0));

  if (shouldBlockForIntegrity) {
    return {
      gtoScored: false,
      evScored: false,
      evUnavailableReason:
        "Correção automática bloqueada devido à integridade insuficiente da distribuição nesta célula.",
      strategyStatus: ref.status,
      classification: "unsolved",
      chosenAction,
      chosenFreq,
      bestAction: domAction,
      bestFreq: domFreq,
      chosenEv: null,
      bestEv: null,
      evLoss: null,
      evUnit: null,
      rngMatch: null,
      rngTargetAction: null,
      integrityStatus,
      integrityBlocked: true,
      integrityWarning: baseIntegrityWarning,
      headline: "Correção bloqueada — dados incompletos",
      detail: `${handClass} neste spot soma ${pctSumLabel}% (esperado 100%). Os dados originais foram preservados sem normalização; consulte a frequência visível apenas como referência de estudo.`,
    };
  }

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
      integrityStatus,
      integrityBlocked: false,
      integrityWarning: baseIntegrityWarning,
      headline: `Ação Principal (${Math.round(chosenFreq * 100)}%)${sourceTag}`,
      detail: `${handClass} escolhe ${chosenAction} com ${Math.round(chosenFreq * 100)}% de frequência.${evSuffix}`,
    };
  }

  // Estratégia mista: qualquer ação com frequência positiva não é erro bruto; se EV loss ~ 0, é indiferente / +EV válido!
  if (chosenFreq >= 0.05 || (chosenFreq > 0 && (evLoss === null || evLoss <= 0.02))) {
    const isLowFreq = chosenFreq < 0.25 && chosenFreq < domFreq - 0.15;
    const classification: DecisionClassification = isLowFreq
      ? "low_freq_acceptable"
      : "valid_mixed";

    const rngNote =
      useRng && rngTargetAction && rngTargetAction !== chosenAction
        ? ` Nota de calibração RNG (${rngValue}): a rolagem apontou ${rngTargetAction}, mas sua ação ainda faz parte do mix válido.`
        : useRng && rngValue !== null && rngTargetAction === null
          ? ` Nota de calibração RNG (${rngValue}): o valor caiu na faixa sem massa de probabilidade completa; nenhuma ação foi inventada.`
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
      integrityStatus,
      integrityBlocked: false,
      integrityWarning: baseIntegrityWarning,
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
    integrityStatus,
    integrityBlocked: false,
    integrityWarning: baseIntegrityWarning,
    headline: `Desvio da Política de Referência${sourceTag}`,
    detail: `${chosenAction} tem ${Math.round(chosenFreq * 100)}% para ${handClass}. Ação principal: ${bestAction} (${Math.round(domFreq * 100)}%).${evSuffix}`,
  };
}

function canonicalTargetSignature(dist: Record<string, number>): string {
  return Object.entries(dist)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([a, v]) => `${a}:${v.toFixed(4)}`)
    .join("|");
}

/**
 * Mede aderência às frequências mistas agrupando tentativas por contexto homogêneo `(spotId, hand, distribuição-alvo)`:
 * - Dentro de cada grupo g com n_g tentativas, calcula TVD_g = 0.5 * sum_a |obs_g(a) - target_g(a)| e aderência A_g = max(0, 1 - TVD_g).
 * - Agrega entre grupos pela média ponderada por número de tentativas: A_total = sum_g(n_g * A_g) / N.
 * Essa métrica é invariante à ordem das tentativas e evita comparar mãos/spots distintos contra apenas a última tentativa.
 */
export function computeMixedAdherenceStats(
  attempts: readonly MixedAttemptRecord[],
): MixedAdherenceSummary {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return {
      attempts: 0,
      groupsCount: 0,
      reliableAttempts: 0,
      reliableGroupsCount: 0,
      incompleteExcludedAttempts: 0,
      hasIncompleteData: false,
      observedDistribution: {},
      targetDistribution: {},
      adherencePct: 100,
    };
  }

  const grouped = new Map<
    string,
    {
      count: number;
      countsByAction: Record<string, number>;
      targetDistribution: Record<string, number>;
    }
  >();

  const globalCounts: Record<string, number> = {};
  const globalWeightedTarget: Record<string, number> = {};
  let reliableAttempts = 0;
  let incompleteExcludedAttempts = 0;

  for (const a of attempts) {
    if (
      !a ||
      typeof a !== "object" ||
      typeof a.spotId !== "string" ||
      typeof a.hand !== "string" ||
      typeof a.chosenAction !== "string" ||
      !a.targetDistribution ||
      typeof a.targetDistribution !== "object" ||
      Array.isArray(a.targetDistribution)
    ) {
      incompleteExcludedAttempts += 1;
      continue;
    }

    const entries = Object.entries(a.targetDistribution);
    let targetSum = 0;
    let validDist = entries.length > 0;
    const cleanTarget: Record<string, number> = {};
    for (const [act, tgt] of entries) {
      if (typeof tgt !== "number" || !Number.isFinite(tgt) || tgt < -1e-6 || tgt > 1 + 1e-6) {
        validDist = false;
        break;
      }
      const clamped = Math.max(0, Math.min(1, tgt));
      cleanTarget[act] = clamped;
      targetSum += clamped;
    }

    if (!validDist || Math.abs(targetSum - 1) > 0.002) {
      incompleteExcludedAttempts += 1;
      continue;
    }

    reliableAttempts += 1;
    globalCounts[a.chosenAction] = (globalCounts[a.chosenAction] ?? 0) + 1;
    for (const [act, tgt] of Object.entries(cleanTarget)) {
      globalWeightedTarget[act] = (globalWeightedTarget[act] ?? 0) + tgt;
    }

    const groupKey = `${a.spotId}::${a.hand}::${canonicalTargetSignature(cleanTarget)}`;
    const group = grouped.get(groupKey) ?? {
      count: 0,
      countsByAction: {},
      targetDistribution: cleanTarget,
    };
    group.count += 1;
    group.countsByAction[a.chosenAction] = (group.countsByAction[a.chosenAction] ?? 0) + 1;
    grouped.set(groupKey, group);
  }

  if (reliableAttempts === 0) {
    return {
      attempts: attempts.length,
      groupsCount: 0,
      reliableAttempts: 0,
      reliableGroupsCount: 0,
      incompleteExcludedAttempts,
      hasIncompleteData: incompleteExcludedAttempts > 0,
      observedDistribution: {},
      targetDistribution: {},
      adherencePct: incompleteExcludedAttempts > 0 ? 0 : 100,
    };
  }

  let weightedAdherenceSum = 0;
  for (const g of grouped.values()) {
    const actions = new Set([
      ...Object.keys(g.targetDistribution),
      ...Object.keys(g.countsByAction),
    ]);
    let l1 = 0;
    for (const act of actions) {
      const obs = (g.countsByAction[act] ?? 0) / g.count;
      const tgt = g.targetDistribution[act] ?? 0;
      l1 += Math.abs(obs - tgt);
    }
    const tvd = l1 / 2;
    const groupAdherence = Math.max(0, 1 - tvd);
    weightedAdherenceSum += g.count * groupAdherence;
  }

  const observedDistribution: Record<string, number> = {};
  for (const [act, cnt] of Object.entries(globalCounts)) {
    observedDistribution[act] = round4(cnt / reliableAttempts);
  }
  const targetDistribution: Record<string, number> = {};
  for (const [act, wSum] of Object.entries(globalWeightedTarget)) {
    targetDistribution[act] = round4(wSum / reliableAttempts);
  }

  const adherencePct = Math.max(
    0,
    Math.round((weightedAdherenceSum / reliableAttempts) * 1000) / 10,
  );

  return {
    attempts: attempts.length,
    groupsCount: grouped.size,
    reliableAttempts,
    reliableGroupsCount: grouped.size,
    incompleteExcludedAttempts,
    hasIncompleteData: incompleteExcludedAttempts > 0,
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
      g.evLossCount > 0 ? round4(g.evLossSum / g.evLossCount) : null;
    const lowConfidence = Math.min(1, 0.3 + errorRate * 0.7);
    // Fallback heurístico apenas para ordenar a revisão, nunca como EV medido.
    const priorityLoss = avgEvLoss ?? round4(errorRate);
    const impactScore = round4(spotFreq * Math.max(priorityLoss, errorRate * 0.5) * lowConfidence);
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
