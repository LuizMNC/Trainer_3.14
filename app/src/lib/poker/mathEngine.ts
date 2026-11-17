export interface PotOddsResult {
  requiredEquity: number;
  requiredEquityPct: number;
  totalPotAfterCall: number;
  formula: string;
  unit: "ratio";
  assumptions: string[];
}

export interface BluffBreakevenResult {
  requiredFoldEquity: number;
  requiredFoldEquityPct: number;
  formula: string;
  unit: "ratio";
  assumptions: string[];
}

export interface SimplifiedMdfResult {
  mdf: number;
  mdfPct: number;
  formula: string;
  caveat: string;
}

export interface PolarizedRiverBluffResult {
  bluffFraction: number;
  bluffFractionPct: number;
  valueFraction: number;
  valueFractionPct: number;
  valueToBluffRatio: number;
  formula: string;
  assumptions: string[];
}

export interface IcmResult {
  model: "Malmuth-Harville";
  stacks: number[];
  payouts: number[];
  totalPrizePool: number;
  icmValues: number[];
  finishProbabilities: number[][];
  assumptions: string[];
}

export interface BubbleFactorResult {
  bubbleFactor: number;
  requiredEquityAgainstEqualStack: number;
  riskPremiumPct: number;
  assumptions: string[];
}

export interface PkoBountyEvaluation {
  model: "PKO_BOUNTY_ADJUSTED";
  immediateBountyUsd: number;
  effectiveBountyChipFactor: number;
  bountyChipEquivalent: number;
  effectivePotWithBounty: number;
  adjustedRequiredEquity: number;
  formula: string;
  assumptions: string[];
}

export function calculatePotOdds(
  potBeforeBet: number,
  opposingBet: number,
  callAmount: number,
): PotOddsResult {
  if (
    ![potBeforeBet, opposingBet, callAmount].every(Number.isFinite) ||
    potBeforeBet < 0 ||
    opposingBet < 0 ||
    callAmount <= 0
  ) {
    throw new Error(
      "Entradas inválidas para pot odds: informe valores numéricos finitos com P ≥ 0, B ≥ 0 e C > 0.",
    );
  }
  const totalPotAfterCall = potBeforeBet + opposingBet + callAmount;
  if (!Number.isFinite(totalPotAfterCall) || totalPotAfterCall <= 0) {
    throw new Error("O pote total após o call excedeu os limites numéricos válidos.");
  }
  const requiredEquity = callAmount / totalPotAfterCall;
  return {
    requiredEquity,
    requiredEquityPct: Math.round(requiredEquity * 10000) / 100,
    totalPotAfterCall,
    formula: `${callAmount} / (${potBeforeBet} + ${opposingBet} + ${callAmount})`,
    unit: "ratio",
    assumptions: [
      "Realização de equidade de 100% (ex.: all-in ou check-down perfeito).",
      "Sem rake adicional nem ações/apostas futuras (implied/reverse implied odds = 0).",
    ],
  };
}

export function calculateBluffBreakevenFoldEquity(
  potBeforeBet: number,
  betAmount: number,
): BluffBreakevenResult {
  if (
    ![potBeforeBet, betAmount].every(Number.isFinite) ||
    potBeforeBet <= 0 ||
    betAmount <= 0
  ) {
    throw new Error(
      "Entradas inválidas para fold equity de blefe: informe valores numéricos finitos com P > 0 e B > 0.",
    );
  }
  const denominator = potBeforeBet + betAmount;
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error("Denominador inválido para fold equity de blefe.");
  }
  const requiredFoldEquity = betAmount / denominator;
  return {
    requiredFoldEquity,
    requiredFoldEquityPct: Math.round(requiredFoldEquity * 10000) / 100,
    formula: `${betAmount} / (${potBeforeBet} + ${betAmount})`,
    unit: "ratio",
    assumptions: [
      "Blefe puro com 0% de equidade quando pago.",
      "Nenhuma contribuição futura após o call (heads-up final street / all-in).",
    ],
  };
}

export function calculateSimplifiedMdf(
  potBeforeBet: number,
  betAmount: number,
): SimplifiedMdfResult {
  if (
    ![potBeforeBet, betAmount].every(Number.isFinite) ||
    potBeforeBet <= 0 ||
    betAmount <= 0
  ) {
    throw new Error(
      "Entradas inválidas para MDF: informe valores numéricos finitos com P > 0 e B > 0.",
    );
  }
  const denominator = potBeforeBet + betAmount;
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error("Denominador inválido para MDF.");
  }
  const mdf = potBeforeBet / denominator;
  return {
    mdf,
    mdfPct: Math.round(mdf * 10000) / 100,
    formula: `${potBeforeBet} / (${potBeforeBet} + ${betAmount})`,
    caveat:
      "Modelo simplificado [0,1] contra blefes puros sem equidade; em NLHE real com vantagem de range/nut e streets futuras, a defesa ótima pode ficar abaixo do MDF.",
  };
}

/**
 * Calcula a fração ótima de blefes em um range de aposta perfeitamente polarizado no river (heads-up, sem rake):
 * bluff_fraction = B / (P + 2B), deixando o bluff-catcher do defensor indiferente com pot odds B / (P + 2B).
 */
export function calculatePolarizedRiverBluffFraction(
  potBeforeBet: number,
  betAmount: number,
): PolarizedRiverBluffResult {
  if (
    ![potBeforeBet, betAmount].every(Number.isFinite) ||
    potBeforeBet <= 0 ||
    betAmount <= 0
  ) {
    throw new Error(
      "Entradas inválidas para fração polarizada no river: informe valores numéricos finitos com P > 0 e B > 0.",
    );
  }
  const totalAfterCall = potBeforeBet + 2 * betAmount;
  if (!Number.isFinite(totalAfterCall) || totalAfterCall <= 0) {
    throw new Error("Pote total inválido para fração polarizada no river.");
  }
  const bluffFraction = betAmount / totalAfterCall;
  const valueFraction = (potBeforeBet + betAmount) / totalAfterCall;
  const valueToBluffRatio = (potBeforeBet + betAmount) / betAmount;
  return {
    bluffFraction,
    bluffFractionPct: Math.round(bluffFraction * 10000) / 100,
    valueFraction,
    valueFractionPct: Math.round(valueFraction * 10000) / 100,
    valueToBluffRatio: Math.round(valueToBluffRatio * 1000) / 1000,
    formula: `${betAmount} / (${potBeforeBet} + 2 * ${betAmount})`,
    assumptions: [
      "Modelo de river heads-up perfeitamente polarizado (valor tem 100% de equidade e blefe tem 0% quando pago).",
      "Sem rake, sem side pots e sem streets futuras.",
    ],
  };
}

/**
 * Gerador pseudoaleatório determinístico reproduzível por seed (xmur3 + mulberry32)
 * para rolagem de estratégias mistas auditáveis (1..100).
 */
export function createSeededRng(seedInput: string | number): {
  nextFloat: () => number;
  nextRoll100: () => number;
} {
  const str = String(seedInput);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return {
    nextFloat: () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      const t = (h ^= h >>> 16) >>> 0;
      return t / 4294967296;
    },
    nextRoll100: () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      const t = (h ^= h >>> 16) >>> 0;
      return Math.floor((t / 4294967296) * 100) + 1;
    },
  };
}

export function parseStrictFiniteList(raw: string, fieldLabel: string): number[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`Informe ao menos um número finito válido em ${fieldLabel}.`);
  }
  const tokens = trimmed.split(",");
  const parsed: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].trim();
    if (!token) {
      throw new Error(
        `Item ${i + 1} em ${fieldLabel} está vazio. Remova vírgulas extras ou informe um número finito.`,
      );
    }
    const num = Number(token);
    if (!Number.isFinite(num)) {
      throw new Error(
        `Valor inválido em ${fieldLabel}: '${token}'. Informe apenas números finitos separados por vírgula.`,
      );
    }
    parsed.push(num);
  }
  return parsed;
}

export function assertNotPkoForStandardIcm(tournamentType: string): void {
  if (tournamentType.toUpperCase().includes("PKO") || tournamentType.toUpperCase().includes("BOUNTY")) {
    throw new Error(
      "ICM padrão (Malmuth-Harville) não pode ser aplicado como GTO em torneios PKO/Bounty. Use o modelo específico PKO.",
    );
  }
}

/**
 * Calcula valores ICM ($EV) pelo algoritmo exato de Malmuth-Harville com memoização de subconjuntos.
 * Suporta até 10 jogadores ativos de forma determinística e instantânea.
 */
export function calculateIcm(
  stacks: readonly number[],
  payouts: readonly number[],
  tournamentType: "MTT" | "SNG" = "MTT",
): IcmResult {
  assertNotPkoForStandardIcm(tournamentType);

  if (stacks.length === 0) {
    throw new Error("Lista de stacks não pode ser vazia.");
  }
  if (stacks.length > 10) {
    throw new Error("ICM exato de Malmuth-Harville limitado a 10 stacks nesta função.");
  }
  if (stacks.some((s) => !Number.isFinite(s) || s < 0)) {
    throw new Error("Todos os stacks devem ser números finitos não-negativos.");
  }
  if (payouts.some((p) => !Number.isFinite(p) || p < 0)) {
    throw new Error("Todos os prêmios devem ser números finitos não-negativos.");
  }

  const n = stacks.length;
  const totalChips = stacks.reduce((a, b) => a + b, 0);
  if (totalChips <= 0) {
    throw new Error("Soma dos stacks deve ser maior que zero.");
  }

  const normalizedPayouts = Array.from({ length: n }, (_, i) => payouts[i] ?? 0);
  const totalPrizePool = normalizedPayouts.reduce((a, b) => a + b, 0);

  const positiveIndices = stacks
    .map((s, idx) => (s > 0 ? idx : -1))
    .filter((idx) => idx >= 0);

  const finishProbabilities: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );

  // Jogadores com 0 fichas ocupam as últimas colocações em ordem simétrica
  const zeroIndices = stacks
    .map((s, idx) => (s === 0 ? idx : -1))
    .filter((idx) => idx >= 0);

  if (zeroIndices.length > 0) {
    const startPlace = positiveIndices.length;
    const share = 1 / zeroIndices.length;
    for (const zi of zeroIndices) {
      for (let place = startPlace; place < n; place++) {
        finishProbabilities[zi][place] = share;
      }
    }
  }

  const m = positiveIndices.length;
  if (m > 0) {
    const posStacks = positiveIndices.map((i) => stacks[i]);
    const memo = new Map<number, number[][]>();

    const solve = (mask: number): number[][] => {
      const cached = memo.get(mask);
      if (cached) return cached;

      const active: number[] = [];
      let maskTotal = 0;
      for (let i = 0; i < m; i++) {
        if ((mask & (1 << i)) !== 0) {
          active.push(i);
          maskTotal += posStacks[i];
        }
      }

      const k = active.length;
      const dist: number[][] = Array.from({ length: m }, () =>
        Array.from({ length: k }, () => 0),
      );

      if (k === 1) {
        dist[active[0]][0] = 1;
        memo.set(mask, dist);
        return dist;
      }

      for (const winner of active) {
        const pFirst = posStacks[winner] / maskTotal;
        dist[winner][0] += pFirst;

        const subDist = solve(mask ^ (1 << winner));
        for (const other of active) {
          if (other === winner) continue;
          for (let place = 0; place < k - 1; place++) {
            dist[other][place + 1] += pFirst * subDist[other][place];
          }
        }
      }

      memo.set(mask, dist);
      return dist;
    };

    const fullMask = (1 << m) - 1;
    const posDist = solve(fullMask);
    for (let i = 0; i < m; i++) {
      const origIdx = positiveIndices[i];
      for (let place = 0; place < m; place++) {
        finishProbabilities[origIdx][place] = posDist[i][place];
      }
    }
  }

  const icmValues = finishProbabilities.map((probs) => {
    let ev = 0;
    for (let place = 0; place < n; place++) {
      ev += probs[place] * normalizedPayouts[place];
    }
    return ev;
  });

  return {
    model: "Malmuth-Harville",
    stacks: [...stacks],
    payouts: normalizedPayouts,
    totalPrizePool,
    icmValues,
    finishProbabilities,
    assumptions: [
      "Modelo Malmuth-Harville independente (probabilidade de 1º lugar proporcional ao stack).",
      "Não considera vantagem de habilidade, posição futura na mesa ou bounties (PKO).",
    ],
  };
}

export function calculateBubbleFactor(
  icmIfWin: number,
  icmIfLose: number,
  icmIfFold: number,
  chipEvRequiredEquity = 0.5,
): BubbleFactorResult {
  if (
    ![icmIfWin, icmIfLose, icmIfFold, chipEvRequiredEquity].every(
      Number.isFinite,
    ) ||
    icmIfLose < 0 ||
    icmIfFold < icmIfLose
  ) {
    throw new Error(
      "Informe valores numéricos finitos válidos para ICM ($EV Win > Fold >= Lose >= 0).",
    );
  }
  const gain = icmIfWin - icmIfFold;
  const loss = icmIfFold - icmIfLose;
  if (gain <= 0) {
    throw new Error("Ganho de ICM ao vencer deve ser positivo para calcular Bubble Factor.");
  }
  const baselineEq = Math.min(0.99, Math.max(0.01, chipEvRequiredEquity));
  const bubbleFactor = Math.max(0, loss / gain);
  const reqEq = bubbleFactor / (bubbleFactor + 1);
  // Ajuste generalizado por odds em fichas: reqEqIcm = (BF * odds) / (BF * odds + 1)
  const chipOddsRatio = baselineEq / (1 - baselineEq);
  const adjustedReqEq = (bubbleFactor * chipOddsRatio) / (bubbleFactor * chipOddsRatio + 1);
  return {
    bubbleFactor,
    requiredEquityAgainstEqualStack: reqEq,
    riskPremiumPct: Math.round((adjustedReqEq - baselineEq) * 10000) / 100,
    assumptions: [
      `Risk premium calculado relativo ao baseline chipEV de ${(baselineEq * 100).toFixed(1)}%.`,
      "Baseado nos valores de $EV informados antes/depois do confronto.",
    ],
  };
}

/**
 * Modelo heurístico dedicado e separado para MTT PKO:
 * Converte bounties iniciais na cabeça do vilão (quando coberto pelo Herói) para fichas equivalentes
 * usando uma única aplicação de `bountyChipFactor` sobre `(villainBountyUsd / startingBountyUsd) * startingStackChips`.
 * Referência: em PKO 50/50 clássico, 50% do bounty é capturado em dinheiro imediato e o restante soma-se à cabeça do vencedor;
 * fatores típicos vão de 0.33 (início/meio com desconto de sobrevivência) a 0.50 (paridade direta dos 50% capturados).
 */
export function evaluatePkoBountyModel(params: {
  potWithoutBountyChips: number;
  callAmountChips: number;
  villainBountyUsd: number;
  startingStackChips: number;
  startingBountyUsd: number;
  heroCoversVillain: boolean;
  bountyChipFactor?: number;
}): PkoBountyEvaluation {
  const factor = params.bountyChipFactor ?? 0.33;
  if (
    ![
      params.potWithoutBountyChips,
      params.callAmountChips,
      params.villainBountyUsd,
      params.startingStackChips,
      params.startingBountyUsd,
      factor,
    ].every(Number.isFinite) ||
    params.potWithoutBountyChips < 0 ||
    params.callAmountChips <= 0 ||
    params.villainBountyUsd < 0 ||
    params.startingStackChips <= 0 ||
    params.startingBountyUsd <= 0 ||
    factor < 0 ||
    factor > 1
  ) {
    throw new Error(
      "Parâmetros inválidos para cálculo de PKO: verifique valores finitos positivos e fator entre 0 e 1.",
    );
  }
  const immediateBountyUsd = params.heroCoversVillain
    ? params.villainBountyUsd * 0.5
    : 0;
  const startingBountyUnits = params.villainBountyUsd / params.startingBountyUsd;
  const bountyChipEquivalent = params.heroCoversVillain
    ? startingBountyUnits * params.startingStackChips * factor
    : 0;
  const effectivePotWithBounty =
    params.potWithoutBountyChips + params.callAmountChips + bountyChipEquivalent;
  const adjustedRequiredEquity = params.callAmountChips / effectivePotWithBounty;

  return {
    model: "PKO_BOUNTY_ADJUSTED",
    immediateBountyUsd,
    effectiveBountyChipFactor: factor,
    bountyChipEquivalent,
    effectivePotWithBounty,
    adjustedRequiredEquity,
    formula: params.heroCoversVillain
      ? `(${params.villainBountyUsd} / ${params.startingBountyUsd}) × ${params.startingStackChips} × ${factor.toFixed(2)} = ${Math.round(bountyChipEquivalent)} fichas`
      : "Herói não cobre o vilão → 0 fichas equivalentes de bounty",
    assumptions: [
      "Modelo heurístico de conversão bounty-para-fichas sob estrutura PKO 50/50 simétrica (prize pool regular inicial igual ao starting bounty; não substitui solver PKO completo multiway com ICM).",
      `50% do bounty do vilão ($${immediateBountyUsd.toFixed(2)}) é capturado imediatamente em cash quando o Herói cobre (${params.heroCoversVillain ? "cobre" : "não cobre"}).`,
      `Fator de conversão aplicado uma única vez por bounty inicial (${factor.toFixed(2)} × starting stack = ${(factor * 100).toFixed(0)}%). Em torneios não-50/50 (ex.: Mystery Bounty ou bounty assimétrico), ajuste o fator manualmente.`,
    ],
  };
}
