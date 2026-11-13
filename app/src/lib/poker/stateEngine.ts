import { validateDeckUnique } from "./cards.ts";

export type GameFormat = "MTT" | "SNG" | "CASH";
export type GameVariant = "NLHE";
export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

export interface PlayerSeatState {
  position: string;
  stackBb: number;
  investedTotalBb: number;
  investedStreetBb: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
  revealedCards?: [string, string] | null;
}

export interface ActionRecord {
  street: Street;
  position: string;
  action: string;
  amountBb?: number;
}

export interface GameState {
  format: GameFormat;
  variant: GameVariant;
  playersInitial: number;
  street: Street;
  smallBlindBb: number;
  bigBlindBb: number;
  anteBbPerPlayer: number;
  rakePct?: number;
  potBb: number;
  currentBetBb: number;
  minRaiseIncrementBb: number;
  board: string[];
  heroPosition: string;
  heroCards: [string, string];
  actingPosition: string;
  players: PlayerSeatState[];
  actionHistory: ActionRecord[];
}

export interface LegalActionSpec {
  id: string;
  kind: "fold" | "check" | "call" | "bet" | "raise" | "allin";
  label: string;
  amountBb: number;
  toCallBb: number;
}

export interface SidePotLayer {
  amountBb: number;
  eligiblePositions: string[];
}

export interface StateValidationResult {
  valid: boolean;
  errors: string[];
}

const EXPECTED_BOARD_COUNT: Record<Street, number> = {
  PREFLOP: 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
};

export function getPositionsForSeatCount(count: number): string[] {
  if (count === 2) return ["BTN/SB", "BB"];
  if (count === 3) return ["BTN", "SB", "BB"];
  if (count === 4) return ["CO", "BTN", "SB", "BB"];
  if (count === 5) return ["HJ", "CO", "BTN", "SB", "BB"];
  if (count === 6) return ["LJ", "HJ", "CO", "BTN", "SB", "BB"];
  if (count === 7) return ["MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  if (count === 8) return ["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  if (count === 9) return ["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  throw new Error(`Número de assentos não suportado em NLHE: ${count}. Use entre 2 e 9.`);
}

export function validateGameState(state: GameState): StateValidationResult {
  const errors: string[] = [];

  if (state.variant !== "NLHE") {
    errors.push(`Variante não suportada: ${state.variant}.`);
  }
  if (state.playersInitial < 2 || state.playersInitial > 9) {
    errors.push(`playersInitial inválido (${state.playersInitial}); permitido 2..9.`);
  }
  if (state.players.length !== state.playersInitial) {
    errors.push(
      `Quantidade de jogadores (${state.players.length}) difere de playersInitial (${state.playersInitial}).`,
    );
  }
  if (state.smallBlindBb < 0 || state.bigBlindBb <= 0 || state.anteBbPerPlayer < 0) {
    errors.push("Blinds e ante não podem ser negativos (BB > 0).");
  }
  if (state.potBb < 0) {
    errors.push(`Pote negativo inválido: ${state.potBb} BB.`);
  }
  if (state.currentBetBb < 0 || state.minRaiseIncrementBb < 0) {
    errors.push("Aposta atual e incremento mínimo de raise não podem ser negativos.");
  }
  if (state.format === "CASH" && state.rakePct !== undefined && (state.rakePct < 0 || state.rakePct > 0.25)) {
    errors.push(`Rake fora da faixa esperada (0..0.25): ${state.rakePct}.`);
  }

  const expectedBoard = EXPECTED_BOARD_COUNT[state.street];
  if (state.board.length !== expectedBoard) {
    errors.push(
      `Street ${state.street} exige ${expectedBoard} cartas no board, recebido ${state.board.length}.`,
    );
  }

  const allCards: string[] = [...state.heroCards, ...state.board];
  for (const p of state.players) {
    if (p.stackBb < -1e-9) {
      errors.push(`Stack negativo para ${p.position}: ${p.stackBb} BB.`);
    }
    if (p.investedTotalBb < -1e-9 || p.investedStreetBb < -1e-9) {
      errors.push(`Contribuição negativa para ${p.position}.`);
    }
    if (p.revealedCards) {
      allCards.push(...p.revealedCards);
    }
  }

  const deckCheck = validateDeckUnique(allCards);
  if (!deckCheck.valid) {
    errors.push(deckCheck.error ?? "Baralho inválido.");
  }

  const heroCount = state.players.filter((p) => p.isHero).length;
  if (heroCount !== 1) {
    errors.push(`Estado deve ter exatamente 1 Hero, encontrado ${heroCount}.`);
  }

  const actor = state.players.find((p) => p.position === state.actingPosition);
  if (!actor) {
    errors.push(`Posição em ação '${state.actingPosition}' não encontrada na mesa.`);
  } else if (actor.folded || actor.allIn) {
    errors.push(`Jogador em ação '${actor.position}' não pode agir (folded=${actor.folded}, allIn=${actor.allIn}).`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getLegalActions(
  state: GameState,
  customRaiseSizesBb: number[] = [],
): LegalActionSpec[] {
  const validation = validateGameState(state);
  if (!validation.valid) {
    throw new Error(`Estado inválido: ${validation.errors.join(" ")}`);
  }

  const actor = state.players.find((p) => p.position === state.actingPosition)!;
  const rawToCall = Math.max(0, state.currentBetBb - actor.investedStreetBb);
  const effectiveCall = roundBb(Math.min(rawToCall, actor.stackBb));
  const actions: LegalActionSpec[] = [];

  if (rawToCall > 1e-9) {
    actions.push({
      id: "fold",
      kind: "fold",
      label: "Fold",
      amountBb: 0,
      toCallBb: effectiveCall,
    });
    actions.push({
      id: effectiveCall >= actor.stackBb - 1e-9 ? `allin_${effectiveCall}` : `call_${effectiveCall}`,
      kind: effectiveCall >= actor.stackBb - 1e-9 ? "allin" : "call",
      label:
        effectiveCall >= actor.stackBb - 1e-9
          ? `All-in Call (${effectiveCall} BB)`
          : `Call ${effectiveCall} BB`,
      amountBb: effectiveCall,
      toCallBb: effectiveCall,
    });
  } else {
    actions.push({
      id: "check",
      kind: "check",
      label: "Check",
      amountBb: 0,
      toCallBb: 0,
    });
  }

  const maxTotalStreetCommit = roundBb(actor.investedStreetBb + actor.stackBb);
  const canRaiseOrBet = actor.stackBb > effectiveCall + 1e-9;

  if (canRaiseOrBet) {
    const minTotalBet =
      state.currentBetBb > 0
        ? roundBb(state.currentBetBb + Math.max(state.bigBlindBb, state.minRaiseIncrementBb))
        : state.bigBlindBb;

    const kind = state.currentBetBb > 0 ? "raise" : "bet";
    const sortedTargets = Array.from(
      new Set(
        customRaiseSizesBb
          .map((s) => roundBb(s))
          .filter((s) => s >= minTotalBet - 1e-9 && s < maxTotalStreetCommit - 1e-9),
      ),
    ).sort((a, b) => a - b);

    for (const target of sortedTargets) {
      const added = roundBb(target - actor.investedStreetBb);
      actions.push({
        id: `${kind}_${target}bb`,
        kind,
        label: `${kind === "bet" ? "Bet" : "Raise"} ${target} BB`,
        amountBb: added,
        toCallBb: effectiveCall,
      });
    }

    // All-in é sempre legal se ainda há fichas além do call
    if (maxTotalStreetCommit > state.currentBetBb + 1e-9) {
      actions.push({
        id: `allin_${maxTotalStreetCommit}bb`,
        kind: "allin",
        label: `All-in ${maxTotalStreetCommit} BB`,
        amountBb: roundBb(actor.stackBb),
        toCallBb: effectiveCall,
      });
    }
  }

  return actions;
}

export function isLegalActionId(
  state: GameState,
  actionId: string,
  customRaiseSizesBb: number[] = [],
): boolean {
  const legal = getLegalActions(state, customRaiseSizesBb);
  return legal.some((a) => a.id === actionId);
}

/**
 * Reconstrói pote principal e side pots sem permitir over-call não tratado.
 */
export function computeSidePots(
  players: readonly Pick<PlayerSeatState, "position" | "investedTotalBb" | "folded">[],
  deadMoneyBb = 0,
): SidePotLayer[] {
  const contributors = players
    .filter((p) => p.investedTotalBb > 1e-9)
    .map((p) => ({ ...p }));

  const levels = Array.from(
    new Set(contributors.map((p) => roundBb(p.investedTotalBb))),
  ).sort((a, b) => a - b);

  const pots: SidePotLayer[] = [];
  let prevLevel = 0;

  for (const level of levels) {
    const slice = roundBb(level - prevLevel);
    if (slice <= 0) continue;

    let layerTotal = 0;
    const eligible: string[] = [];
    for (const p of contributors) {
      if (p.investedTotalBb >= level - 1e-9) {
        layerTotal = roundBb(layerTotal + slice);
        if (!p.folded) {
          eligible.push(p.position);
        }
      }
    }

    if (pots.length === 0 && deadMoneyBb > 0) {
      layerTotal = roundBb(layerTotal + deadMoneyBb);
    }

    // Mescla camadas consecutivas com exatamente os mesmos jogadores elegíveis
    const prev = pots[pots.length - 1];
    if (
      prev &&
      prev.eligiblePositions.length === eligible.length &&
      prev.eligiblePositions.every((pos, i) => pos === eligible[i])
    ) {
      prev.amountBb = roundBb(prev.amountBb + layerTotal);
    } else if (layerTotal > 0) {
      pots.push({ amountBb: layerTotal, eligiblePositions: eligible });
    }

    prevLevel = level;
  }

  if (pots.length === 0 && deadMoneyBb > 0) {
    pots.push({
      amountBb: roundBb(deadMoneyBb),
      eligiblePositions: players.filter((p) => !p.folded).map((p) => p.position),
    });
  }

  return pots;
}

export function roundBb(value: number): number {
  return Math.round(value * 1000) / 1000;
}
