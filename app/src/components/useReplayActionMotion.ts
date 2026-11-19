"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { HandEvent } from "@/lib/poker/handHistorySchema";
import { replayMotionCue, type ReplayMotionIntent } from "./replayMotion";
import type { StudioMotion } from "./StudioMotion";

/** Anima somente elementos decorativos. A mão continua integralmente no motor existente. */
export function useReplayActionMotion({ tableRef, intentRef, cursor, event, delayMs, motion, playing, perspective }: {
  tableRef: RefObject<HTMLDivElement | null>;
  intentRef: RefObject<ReplayMotionIntent>;
  cursor: number;
  event: HandEvent | null;
  delayMs: number;
  motion: StudioMotion;
  playing: boolean;
  perspective: string;
}) {
  const previous = useRef(cursor);
  useEffect(() => {
    const cue = replayMotionCue(event, previous.current, cursor, intentRef.current);
    previous.current = cursor;
    intentRef.current = "none";
    if (!cue || motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const table = tableRef.current;
    const seat = table?.querySelector<HTMLElement>(`[data-testid="replay-player-${cue.playerIndex}"]`);
    const objects = seat?.querySelector<HTMLElement>("[data-replay-particles]");
    const label = seat?.querySelector<HTMLElement>("[data-replay-cue-label]");
    if (!table || !seat || !objects || !label || typeof objects.animate !== "function") return;
    const bounds = table.getBoundingClientRect();
    const origin = seat.getBoundingClientRect();
    // No celular os assentos são cartões em grade: a mesma projeção usa a posição visível real.
    const dx = bounds.left + bounds.width / 2 - (origin.left + origin.width / 2);
    const dy = bounds.top + bounds.height / 2 - (origin.top + origin.height / 2);
    const duration = Math.min(motion === "fast" ? 220 : 420, delayMs * .7);
    seat.dataset.motionActive = cue.action;
    label.textContent = cue.label;
    const animations: Animation[] = [label.animate([
      { opacity: 0, transform: "translate(-50%,4px)" },
      { opacity: 1, transform: "translate(-50%,0)", offset: .2 },
      { opacity: 1, offset: .8 }, { opacity: 0 },
    ], { duration, easing: "ease-out", fill: "both" })];
    if (cue.action !== "check") {
      const ratio = cue.action === "fold" ? .8 : .42;
      animations.push(objects.animate([
        { opacity: 0, transform: "translate(0,0) scale(.85)" },
        { opacity: 1, offset: .16 },
        { opacity: .95, offset: .72 },
        { opacity: 0, transform: `translate(${dx * ratio}px,${dy * ratio}px) scale(.6)` },
      ], { duration, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" }));
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = true;
    const clear = () => {
      animations.forEach((animation) => animation.cancel());
      delete seat.dataset.motionActive;
      label.textContent = "";
    };
    const preferenceChanged = () => { if (media.matches) clear(); };
    media.addEventListener("change", preferenceChanged);
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => { if (active) clear(); });
    return () => { active = false; media.removeEventListener("change", preferenceChanged); clear(); };
  }, [cursor, event, delayMs, motion, playing, perspective, intentRef, tableRef]);
}
