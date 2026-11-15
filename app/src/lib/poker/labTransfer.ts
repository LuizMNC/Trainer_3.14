import type {ReplayFrame} from "./handReplay.ts";
import type {CanonicalHand} from "./handHistorySchema.ts";
export interface LabScenario {board:string[];players:{label:string;cards:string[]}[];source:string}
export function replayToLab(hand:CanonicalHand,frame:ReplayFrame):LabScenario {
  return {board:[...frame.snapshot.board],players:hand.players.filter(p=>!frame.snapshot.folded[p.index]).map(p=>({label:p.sourceLabel,cards:frame.visibleCards[p.index].filter((c):c is string=>c!==null)})),source:`Replayer: ${hand.recordId}; evento ${frame.cursor}; somente cartas visíveis nesta perspectiva. Jogadores sem cartas exigem entrada manual. Sem side pots ou avaliação GTO.`};
}
