import type { HandEvent } from "../lib/poker/handHistorySchema.ts";

export type ReplayMotionIntent = "step" | "none";
export interface ReplayMotionCue {
  playerIndex: number;
  action: "fold" | "call" | "bet" | "raise" | "allin" | "check";
  label: string;
}

/** Projeção visual de uma operação real. Não altera snapshots ou eventos. */
export function replayMotionCue(event: HandEvent | null, previousCursor: number, cursor: number, intent: ReplayMotionIntent): ReplayMotionCue | null {
  if (intent !== "step" || cursor !== previousCursor + 1 || !event || event.playerIndex === null) return null;
  const playerIndex = event.playerIndex;
  if (event.kind === "Folding") return { playerIndex, action: "fold", label: "FOLD" };
  if (event.kind !== "CheckingOrCalling" && event.kind !== "CompletionBettingOrRaisingTo") return null;
  if (event.after.allIn[playerIndex] && !event.before.allIn[playerIndex]) return { playerIndex, action: "allin", label: "ALL-IN" };
  if (event.kind === "CheckingOrCalling") return event.amountAtoms === "0"
    ? { playerIndex, action: "check", label: "CHECK" }
    : { playerIndex, action: "call", label: "CALL" };
  return event.before.betsAtoms.some((amount) => amount !== "0")
    ? { playerIndex, action: "raise", label: "RAISE" }
    : { playerIndex, action: "bet", label: "BET" };
}
