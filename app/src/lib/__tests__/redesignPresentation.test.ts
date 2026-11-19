import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replayMotionCue } from "../../components/replayMotion.ts";
import type { CanonicalHand } from "../poker/handHistorySchema.ts";

const names = ["hu_fold", "decimal_fold", "three_way_allin", "folded_sidepot", "split_odd_ante", "showdown_muck", "partial_flop", "late_reveal"];
const hands = names.map((name) => JSON.parse(readFileSync(`public/replays/${name}.json`, "utf8")) as CanonicalHand);

describe("Redesign — apresentação sem alteração dos históricos", () => {
  it("anima somente decisões reais ao avançar um evento e preserva seus dados", () => {
    const actions = new Set<string>();
    for (const hand of hands) for (const [index, event] of hand.events.entries()) {
      const before = JSON.stringify(event);
      const cue = replayMotionCue(event, index, index + 1, "step");
      if (cue) {
        actions.add(cue.action);
        assert.equal(cue.playerIndex, event.playerIndex);
        assert.ok(["Folding", "CheckingOrCalling", "CompletionBettingOrRaisingTo"].includes(event.kind));
      }
      assert.equal(JSON.stringify(event), before);
    }
    for (const action of ["fold", "call", "allin", "check"]) assert.ok(actions.has(action), action);
  });
  it("distingue bet, raise e all-in em entradas unitárias sem criar eventos no histórico", () => {
    const source = hands[2].events.find((event) => event.kind === "CompletionBettingOrRaisingTo")!;
    const event = structuredClone(source);
    event.after.allIn = event.after.allIn.map(() => false);
    event.before.betsAtoms = event.before.betsAtoms.map(() => "0");
    assert.equal(replayMotionCue(event, 5, 6, "step")?.action, "bet");
    event.before.betsAtoms[0] = "2";
    assert.equal(replayMotionCue(event, 5, 6, "step")?.action, "raise");
    event.after.allIn[event.playerIndex!] = true;
    assert.equal(replayMotionCue(event, 5, 6, "step")?.action, "allin");
  });
  it("bloqueia saltos, retrocessos, repetições e eventos automáticos", () => {
    for (const hand of hands) for (const [index, event] of hand.events.entries()) {
      assert.equal(replayMotionCue(event, index, index + 1, "none"), null);
      assert.equal(replayMotionCue(event, index + 1, index, "step"), null);
      assert.equal(replayMotionCue(event, index, index + 2, "step"), null);
      assert.equal(replayMotionCue(event, index, index, "step"), null);
      if (!["Folding", "CheckingOrCalling", "CompletionBettingOrRaisingTo"].includes(event.kind)) assert.equal(replayMotionCue(event, index, index + 1, "step"), null);
    }
    assert.equal(replayMotionCue(null, 0, 1, "step"), null);
  });
});
