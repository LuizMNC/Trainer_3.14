export * from "./poker/cards.ts";
export * from "./poker/stateEngine.ts";
export * from "./poker/strategySchema.ts";
export * from "./poker/mttCatalog.ts";
export * from "./poker/mathEngine.ts";
export * from "./poker/drillEvaluator.ts";
export * from "./poker/reglifeCatalog.ts";
export * from "./poker/spotReasoning.ts";
export * from "./poker/solverAdapter.ts";
export * from "./poker/solverFormats.ts";
export * from "./poker/adaptiveDiagnostics.ts";
export * from "./poker/uiPresentation.ts";
export * from "./poker/trainerStorage.ts";

import {
  cellToHand,
  getAll169Hands,
  getHandCombos,
  RANKS,
} from "./poker/cards.ts";

export type SpotType = "rfi" | "vs_rfi" | "vs_limp" | "push_fold" | "vs_shove";

export interface RangeAction {
  name: string;
  color: string;
  pct: number;
}

export type HandDistribution = Record<string, number>;

export interface RangeSpot {
  id: string;
  name: string;
  stackBb: number;
  heroPosition: string;
  villainPosition: string | null;
  spotType: SpotType;
  source: string;
  actions: RangeAction[];
  matrix: Record<string, HandDistribution>;
}

export interface RangesDataset {
  version: string;
  totalSpots: number;
  stacks: number[];
  spots: RangeSpot[];
}

export const POSITIONS_8MAX = ["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"] as const;

export const POSITION_LABELS: Record<string, string> = {
  UTG: "UTG",
  MP: "UTG+1 / MP",
  LJ: "Lojack (LJ)",
  HJ: "Hijack (HJ)",
  CO: "Cutoff (CO)",
  BTN: "Button (BTN)",
  SB: "Small Blind (SB)",
  BB: "Big Blind (BB)",
};

export type Suit = "♠" | "♥" | "♦" | "♣";

export type DrillDifficulty = "borderline" | "mixed" | "all";

export function isMixedHand(dist: HandDistribution): boolean {
  const freqs = Object.values(dist);
  const maxFreq = Math.max(...freqs, 0);
  return maxFreq > 0 && maxFreq < 0.96;
}

export function getDominantAction(dist: HandDistribution): { action: string; freq: number } {
  let bestAction = "Fold";
  let bestFreq = -1;
  for (const [action, freq] of Object.entries(dist)) {
    if (freq > bestFreq) {
      bestFreq = freq;
      bestAction = action;
    }
  }
  return { action: bestAction, freq: Math.max(0, bestFreq) };
}

export function isBorderlineHand(hand: string, spot: RangeSpot): boolean {
  const dist = spot.matrix[hand];
  if (!dist) return false;
  if (isMixedHand(dist)) return true;

  const r1 = RANKS.indexOf(hand[0] as (typeof RANKS)[number]);
  const r2 = RANKS.indexOf(hand[1] as (typeof RANKS)[number]);
  const row = hand.length === 2 ? r1 : hand.endsWith("s") ? r1 : r2;
  const col = hand.length === 2 ? r1 : hand.endsWith("s") ? r2 : r1;

  const dom = getDominantAction(dist).action;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < 13 && nc >= 0 && nc < 13) {
      const nh = cellToHand(nr, nc);
      const nDist = spot.matrix[nh];
      if (!nDist) continue;
      const nDom = getDominantAction(nDist).action;
      if (nDom !== dom) return true;
    }
  }
  return false;
}

export function pickDrillHand(
  spot: RangeSpot,
  difficulty: DrillDifficulty,
  rng: () => number = Math.random,
): string {
  const matrixKeys = Object.keys(spot.matrix ?? {});
  const hands = matrixKeys.length > 0 ? getAll169Hands().filter((h) => spot.matrix[h] !== undefined) : getAll169Hands();
  let pool: string[] = [];

  if (difficulty === "mixed") {
    pool = hands.filter((h) => isMixedHand(spot.matrix[h] || {}));
  }
  if (difficulty === "borderline" || (difficulty === "mixed" && pool.length < 6)) {
    const borderline = hands.filter((h) => isBorderlineHand(h, spot));
    if (borderline.length >= 4) pool = borderline;
  }
  if (pool.length === 0) {
    pool = hands;
  }

  let totalWeight = 0;
  const weights = pool.map((h) => {
    const w = getHandCombos(h);
    totalWeight += w;
    return w;
  });

  let roll = rng() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[0];
}

export interface DecisionEvaluation {
  status: "correct" | "mixed" | "error";
  chosenFreq: number;
  bestAction: string;
  bestFreq: number;
  rngMatch: boolean | null;
  rngTargetAction: string | null;
  headline: string;
  detail: string;
}

/** @deprecated Use `evaluateDrillDecision` de `./poker/drillEvaluator.ts`. Mantido apenas por compatibilidade histórica; não pune ações positivas < 5% no mix. */
export function evaluateDecision(
  spot: RangeSpot,
  hand: string,
  chosenAction: string,
  rngValue: number,
  useRng: boolean,
): DecisionEvaluation {
  const dist = spot.matrix[hand] || { Fold: 1 };
  const chosenFreq = dist[chosenAction] ?? 0;
  const { action: bestAction, freq: bestFreq } = getDominantAction(dist);

  let rngTargetAction: string | null = null;
  if (useRng) {
    let acc = 0;
    for (const act of spot.actions) {
      const f = (dist[act.name] ?? 0) * 100;
      if (f > 0) {
        acc += f;
        if (rngValue <= acc || Math.abs(rngValue - acc) < 0.01) {
          rngTargetAction = act.name;
          break;
        }
      }
    }
    if (!rngTargetAction) {
      rngTargetAction = bestAction;
    }
  }

  const rngMatch = useRng ? rngTargetAction === chosenAction : null;

  if (chosenFreq >= 0.9) {
    return {
      status: "correct",
      chosenFreq,
      bestAction,
      bestFreq,
      rngMatch,
      rngTargetAction,
      headline: "Jogada Principal!",
      detail: `${hand} escolhe ${chosenAction} em ${Math.round(chosenFreq * 100)}% das vezes neste spot.`,
    };
  }

  if (chosenFreq > 0) {
    if (useRng && rngTargetAction && rngTargetAction !== chosenAction) {
      return {
        status: "mixed",
        chosenFreq,
        bestAction,
        bestFreq,
        rngMatch: false,
        rngTargetAction,
        headline: "Ação válida no mix (fora do RNG)",
        detail: `${chosenAction} tem ${Math.round(chosenFreq * 100)}% de frequência. Com RNG ${rngValue}, a calibração apontaria ${rngTargetAction}.`,
      };
    }
    return {
      status: chosenFreq >= bestFreq - 0.02 ? "correct" : "mixed",
      chosenFreq,
      bestAction,
      bestFreq,
      rngMatch,
      rngTargetAction,
      headline: useRng ? "Jogada Mista alinhada ao RNG!" : "Jogada Mista válida!",
      detail: `${hand} divide estratégia: ${Object.entries(dist)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
        .join(" / ")}.`,
    };
  }

  return {
    status: "error",
    chosenFreq,
    bestAction,
    bestFreq,
    rngMatch,
    rngTargetAction,
    headline: "Fora da estratégia de referência",
    detail: `${chosenAction} tem ${Math.round(chosenFreq * 100)}% para ${hand} aqui. A principal ação é ${bestAction} (${Math.round(bestFreq * 100)}%).`,
  };
}

export interface TableSeat {
  position: string;
  isHero: boolean;
  isVillain: boolean;
  isDealer: boolean;
  statusText: string;
  chipBet?: string;
}

export function buildTableContext(spot: RangeSpot): {
  seats: TableSeat[];
  potBb: string;
  scenarioText: string;
} {
  const heroIdx = POSITIONS_8MAX.indexOf(spot.heroPosition as (typeof POSITIONS_8MAX)[number]);
  const villainIdx = spot.villainPosition
    ? POSITIONS_8MAX.indexOf(spot.villainPosition as (typeof POSITIONS_8MAX)[number])
    : -1;

  const seats: TableSeat[] = POSITIONS_8MAX.map((pos, idx) => {
    const isHero = pos === spot.heroPosition;
    const isVillain = pos === spot.villainPosition;
    let statusText = "Aguarda";
    let chipBet: string | undefined;

    if (pos === "SB") chipBet = "0.5 BB";
    if (pos === "BB") chipBet = "1.0 BB";

    if (spot.spotType === "rfi" || spot.spotType === "push_fold") {
      if (idx < heroIdx) statusText = "Fold";
      else if (isHero) statusText = "Sua vez";
    } else if (spot.spotType === "vs_rfi") {
      if (idx < villainIdx) statusText = "Fold";
      else if (isVillain) {
        statusText = "Open Raise";
        chipBet = spot.stackBb >= 50 ? "2.3 BB" : "2.0 BB";
      } else if (idx < heroIdx) {
        statusText = "Fold";
      } else if (isHero) {
        statusText = "Sua vez";
      }
    } else if (spot.spotType === "vs_limp") {
      if (idx < villainIdx) statusText = "Fold";
      else if (isVillain) {
        statusText = "Limp";
        chipBet = "1.0 BB";
      } else if (isHero) {
        statusText = "Sua vez (Option)";
      }
    } else if (spot.spotType === "vs_shove") {
      if (idx < villainIdx) statusText = "Fold";
      else if (isVillain) {
        statusText = "All-in";
        chipBet = `${spot.stackBb} BB`;
      } else if (idx < heroIdx) {
        statusText = "Fold";
      } else if (isHero) {
        statusText = "Sua vez";
      }
    }

    return {
      position: pos,
      isHero,
      isVillain,
      isDealer: pos === "BTN",
      statusText,
      chipBet,
    };
  });

  const potBb =
    spot.spotType === "vs_rfi"
      ? spot.stackBb >= 50
        ? "4.8 BB"
        : "4.5 BB"
      : spot.spotType === "vs_limp"
        ? "3.0 BB"
        : spot.spotType === "vs_shove"
          ? `${spot.stackBb + 1.5} BB`
          : "2.5 BB";

  let scenarioText = "";
  if (spot.spotType === "rfi") {
    scenarioText = `Rodada em fold até você no ${spot.heroPosition} (${spot.stackBb} BB efetivos).`;
  } else if (spot.spotType === "push_fold") {
    scenarioText = `MTT Push/Fold (${spot.stackBb} BB): rodada em fold até você no ${spot.heroPosition}.`;
  } else if (spot.spotType === "vs_rfi") {
    scenarioText = `${spot.villainPosition} abre Raise e todos foldam até você no ${spot.heroPosition} (${spot.stackBb} BB).`;
  } else if (spot.spotType === "vs_limp") {
    scenarioText = `Rodada em fold até o SB, que completa (Limp). Ação volta para você no ${spot.heroPosition} (${spot.stackBb} BB).`;
  } else {
    scenarioText = `${spot.villainPosition} vai All-in de ${spot.stackBb} BB. Decida no ${spot.heroPosition}.`;
  }

  return { seats, potBb, scenarioText };
}
