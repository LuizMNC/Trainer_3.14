import { parseCard, type PlayingCard } from "./cards.ts";
import type { CanonicalHand, HandEvent, HandSnapshot } from "./handHistorySchema.ts";
import { validateCanonicalHand } from "./handHistoryValidation.ts";

export const UNREPLAYABLE_HAND_MESSAGE =
  "Não foi possível reproduzir esta mão. Alguns dados do histórico estão incompletos.";

export type ReplayPerspective = { kind: "public" } | { kind: "player"; playerIndex: number } | { kind: "recorded" };
export interface ReplayFrame {
  cursor: number; // 0 = antes do primeiro evento; N = depois do evento N−1.
  snapshot: HandSnapshot;
  event: HandEvent | null;
  visibleCards: (string|null)[][];
  dealt: boolean[];
  publicCards: boolean[];
  contributionsAtoms: string[];
  returnedAtoms: string[];
  awardsAtoms: string[];
  atEnd: boolean;
  completed: boolean;
  showdown: boolean;
}

export function safeParseCard(code: string | null | undefined): PlayingCard | null {
  if (typeof code !== "string" || !code.trim()) return null;
  try {
    return parseCard(code);
  } catch {
    return null;
  }
}

export function safeBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function safeFormatAtoms(
  value: unknown,
  decimalPlaces: number,
  fallback = "—",
): string {
  try {
    if (typeof value !== "string" && typeof value !== "bigint") return fallback;
    return formatAtoms(value, decimalPlaces);
  } catch {
    return fallback;
  }
}

export function assessHandReplayability(
  value: unknown,
):
  | { ok: true; hand: CanonicalHand; warnings: string[] }
  | { ok: false; summary: string; detail: string } {
  let hand: CanonicalHand;
  try {
    hand = validateCanonicalHand(value);
  } catch (err) {
    return {
      ok: false,
      summary: UNREPLAYABLE_HAND_MESSAGE,
      detail: err instanceof Error ? err.message : "Estrutura canônica inválida.",
    };
  }

  const n = hand.players.length;
  if (n < 2 || n > 9) {
    return {
      ok: false,
      summary: UNREPLAYABLE_HAND_MESSAGE,
      detail: `Número de jogadores (${n}) fora do intervalo suportado (2–9).`,
    };
  }
  if (!Array.isArray(hand.events) || hand.events.length === 0) {
    return {
      ok: false,
      summary: UNREPLAYABLE_HAND_MESSAGE,
      detail: "Nenhum evento cronológico registrado para reprodução.",
    };
  }
  if (!Array.isArray(hand.table?.rawBlindsAtoms) || hand.table.rawBlindsAtoms.length < 2) {
    return {
      ok: false,
      summary: UNREPLAYABLE_HAND_MESSAGE,
      detail: "Blinds iniciais ausentes ou incompletos na configuração da mesa.",
    };
  }

  for (let i = 0; i < hand.events.length; i++) {
    const ev = hand.events[i];
    if (!ev || !ev.before || !ev.after) {
      return {
        ok: false,
        summary: UNREPLAYABLE_HAND_MESSAGE,
        detail: `Evento ${i + 1} sem estado anterior/posterior completo.`,
      };
    }
    if (
      ev.before.stacksAtoms.length !== n ||
      ev.before.betsAtoms.length !== n ||
      ev.before.folded.length !== n ||
      ev.after.stacksAtoms.length !== n ||
      ev.after.betsAtoms.length !== n ||
      ev.after.folded.length !== n ||
      ev.paidAtoms.length !== n ||
      ev.returnedAtoms.length !== n ||
      ev.awardedAtoms.length !== n
    ) {
      return {
        ok: false,
        summary: UNREPLAYABLE_HAND_MESSAGE,
        detail: `Dimensão dos vetores do evento ${i + 1} diverge dos ${n} assentos da mão.`,
      };
    }
    for (const c of ev.after.board) {
      if (!safeParseCard(c)) {
        return {
          ok: false,
          summary: UNREPLAYABLE_HAND_MESSAGE,
          detail: `Carta de board inválida no evento ${i + 1}: "${String(c)}".`,
        };
      }
    }
  }

  const warnings: string[] = [...(hand.integrity.warnings ?? [])];
  if (hand.integrity.status === "VALIDATED_PARTIAL" || !hand.results.complete) {
    warnings.push("Histórico com validação parcial: o trecho disponível será exibido sem resultado final.");
  }

  return { ok: true, hand, warnings };
}

export function buildReplayFrameSafe(
  hand: CanonicalHand,
  cursor: number,
  perspective: ReplayPerspective,
): { ok: true; frame: ReplayFrame } | { ok: false; summary: string; detail: string } {
  try {
    const safeCursor = Math.min(hand.events.length, Math.max(0, Math.trunc(Number.isFinite(cursor) ? cursor : 0)));
    const safePerspective =
      perspective.kind === "player" && !hand.players[perspective.playerIndex]
        ? ({ kind: "public" } as const)
        : perspective;
    return { ok: true, frame: buildReplayFrame(hand, safeCursor, safePerspective) };
  } catch (err) {
    return {
      ok: false,
      summary: UNREPLAYABLE_HAND_MESSAGE,
      detail: err instanceof Error ? err.message : "Falha ao montar estado da mesa.",
    };
  }
}

/** Reduz conhecimento e ledger; não aplica regras de poker nem recalcula snapshots. */
export function buildReplayFrame(hand: CanonicalHand, cursor: number, perspective: ReplayPerspective): ReplayFrame {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > hand.events.length) throw new Error("Frame fora do histórico.");
  if (perspective.kind === "player" && (!Number.isInteger(perspective.playerIndex) || !hand.players[perspective.playerIndex])) throw new Error("Perspectiva de jogador inválida.");
  const n = hand.players.length;
  const known = Array.from({length:n},()=>[null,null] as (string|null)[]);
  const dealt = Array<boolean>(n).fill(false), publicCards = [...dealt];
  const paid = Array<bigint>(n).fill(0n), returned = [...paid], awards = [...paid];
  let showdown = false;
  for (const event of hand.events.slice(0,cursor)) {
    const player = event.playerIndex;
    if (event.kind === "HoleDealing" && player !== null) { dealt[player]=true; known[player]=[...event.cards]; }
    if (event.kind === "HoleCardsShowingOrMucking" && player !== null) {
      showdown = true;
      if (event.cards.length) { known[player]=[...event.cards]; publicCards[player]=true; }
      // Muck não apaga uma revelação nem as cartas conhecidas da fonte.
    }
    event.paidAtoms.forEach((v,i)=>{paid[i]+=BigInt(v);});
    event.returnedAtoms.forEach((v,i)=>{returned[i]+=BigInt(v);});
    event.awardedAtoms.forEach((v,i)=>{awards[i]+=BigInt(v);});
  }
  const atEnd = cursor === hand.events.length;
  return { cursor, event: cursor ? hand.events[cursor-1] : null,
    snapshot: cursor ? hand.events[cursor-1].after : hand.events[0].before,
    visibleCards: known.map((cards,i)=>dealt[i] && (publicCards[i] || perspective.kind==="recorded" || (perspective.kind==="player" && perspective.playerIndex===i)) ? cards : [null,null]),
    dealt, publicCards, contributionsAtoms: paid.map((v,i)=>String(v-returned[i])), returnedAtoms: returned.map(String), awardsAtoms: awards.map(String),
    atEnd, completed: atEnd && hand.results.complete, showdown };
}

export function formatAtoms(value: string | bigint, decimalPlaces: number): string {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces<0 || decimalPlaces>6) throw new Error("Escala inválida.");
  const integer = typeof value === "bigint" ? value : (/^(0|[1-9]\d*)$/.test(value) ? BigInt(value) : null);
  if (integer === null) throw new Error("Átomos inválidos.");
  const digits = (integer<0n ? -integer : integer).toString().padStart(decimalPlaces+1,"0");
  const whole = (decimalPlaces ? digits.slice(0,-decimalPlaces) : digits).replace(/\B(?=(\d{3})+(?!\d))/g,".");
  return (integer<0n ? "−" : "")+whole+(decimalPlaces ? ","+digits.slice(-decimalPlaces) : "");
}

export const STREET_LABELS = { PREFLOP:"Pré-flop", FLOP:"Flop", TURN:"Turn", RIVER:"River" };
export function replayPlayerName(hand: CanonicalHand, player: number): string {
  const p = hand.players?.[player];
  if (!p) return `Jogador ${player + 1}`;
  return p.name?.status !== "MISSING" && p.name?.value?.trim() ? p.name.value : (p.sourceLabel || `p${player + 1}`);
}

/** Não inclui cartas privadas/board nem resultados futuros na lista cronológica. */
export function replayEventLabel(event: HandEvent | null): string {
  if (!event) return "Início da mão";
  const labels: Record<string,string> = { AntePosting:"Posta ante", BlindOrStraddlePosting:"Posta blind", BetCollection:"Coleta apostas", HoleDealing:"Distribui cartas privadas", BoardDealing:"Distribui board", Folding:"Fold", HoleCardsShowingOrMucking:event.cards.length ? "Revela cartas" : "Muck", CardBurning:"Burn desconhecido", RunoutCountSelection:"Define corrida de board", HandKilling:"Encerra mão sem prêmio", ChipsPushing:"Distribui prêmio no pote", ChipsPulling:"Credita fichas no stack", UncollectedBetReturn:"Identifica aposta não paga", NoOperation:"Comentário da fonte" };
  if (event.kind==="CheckingOrCalling") return event.amountAtoms==="0" ? "Check" : "Call";
  if (event.kind==="CompletionBettingOrRaisingTo") return event.before.betsAtoms.some(v=>BigInt(v)>0n) ? "Aumenta para" : "Aposta";
  return labels[event.kind] ?? "Operação registrada";
}

export const REPLAY_DELAYS = [2000,1000,500] as const;
export interface PlaybackState { cursor: number; playing: boolean; delayMs: number }
export type PlaybackAction = { type:"goto"; cursor:number } | { type:"play" } | { type:"pause" } | { type:"tick" } | { type:"speed"; delayMs:number };
export const INITIAL_PLAYBACK: PlaybackState = { cursor:0, playing:false, delayMs:1000 };
export function playbackTransition(state: PlaybackState, action: PlaybackAction, eventCount: number): PlaybackState {
  if (!Number.isInteger(eventCount)||eventCount<1) throw new Error("Histórico sem eventos.");
  if (action.type==="goto") {
    if (!Number.isFinite(action.cursor)) throw new Error("Frame inválido.");
    return { ...state,cursor:Math.min(eventCount,Math.max(0,Math.trunc(action.cursor))),playing:false };
  }
  if (action.type==="pause") return { ...state,playing:false };
  if (action.type==="play") return { ...state,playing:state.cursor<eventCount };
  if (action.type==="speed") return REPLAY_DELAYS.includes(action.delayMs as typeof REPLAY_DELAYS[number]) ? { ...state,delayMs:action.delayMs } : state;
  if (!state.playing) return state;
  const cursor = Math.min(eventCount,state.cursor+1);
  return { ...state,cursor,playing:cursor<eventCount };
}
