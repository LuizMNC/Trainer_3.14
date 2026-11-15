import type { CanonicalHand, HandEvent, HandSnapshot } from "./handHistorySchema.ts";

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
  const p = hand.players[player];
  return p.name.status!=="MISSING" && p.name.value.trim() ? p.name.value : p.sourceLabel;
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
