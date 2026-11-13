"use client";

import React from "react";
import { buildTableContext, parseCard, PlayingCard, RangeSpot } from "@/lib/poker";

interface PokerTableProps {
  spot: RangeSpot;
  cards: [PlayingCard, PlayingCard];
  rngValue: number | null;
  useRng: boolean;
  board?: string[];
  potBbOverride?: number | null;
  anteLabel?: string;
  formatLabel?: string;
}

const SEAT_COORDS: { x: string; y: string }[] = [
  { x: "18%", y: "14%" }, // 0
  { x: "50%", y: "7%" },  // 1
  { x: "82%", y: "14%" }, // 2
  { x: "93%", y: "50%" }, // 3
  { x: "82%", y: "86%" }, // 4
  { x: "50%", y: "92%" }, // 5 (Hero fixo embaixo)
  { x: "18%", y: "86%" }, // 6
  { x: "7%", y: "50%" },  // 7
];

function CardChip({ card, small = false }: { card: PlayingCard; small?: boolean }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg bg-white shadow-lg border border-slate-300 select-none ${
        small
          ? "w-9 h-12 sm:w-10 sm:h-14"
          : "w-11 h-16 sm:w-12 sm:h-[68px]"
      } ${isRed ? "text-rose-600" : "text-slate-900"}`}
    >
      <span className={`${small ? "text-sm" : "text-base sm:text-lg"} font-extrabold leading-none`}>
        {card.rank}
      </span>
      <span className={`${small ? "text-base" : "text-lg sm:text-xl"} leading-none mt-0.5`}>
        {card.suit}
      </span>
    </div>
  );
}

export function PokerTable({
  spot,
  cards,
  rngValue,
  useRng,
  board = [],
  potBbOverride = null,
  anteLabel,
  formatLabel,
}: PokerTableProps) {
  const { seats, potBb, scenarioText } = buildTableContext(spot);
  const heroIdx = Math.max(0, seats.findIndex((s) => s.isHero));

  const rotatedSeats = seats.map((_, slotIdx) => {
    const originalIdx = (heroIdx + (slotIdx - 5) + seats.length) % seats.length;
    return seats[originalIdx];
  });

  const displayPot = potBbOverride !== null ? `${potBbOverride} BB` : potBb;

  return (
    <div className="flex flex-col gap-3">
      {/* Mesa Oval */}
      <div className="relative w-full aspect-[16/10] min-h-[300px] sm:min-h-[340px] rounded-2xl bg-slate-950/90 border border-slate-800 p-4 overflow-hidden shadow-2xl">
        {/* Feltro verde cassino */}
        <div className="absolute inset-8 sm:inset-11 rounded-[999px] bg-gradient-to-b from-emerald-900 via-[#0d3b2a] to-emerald-950 border-[8px] border-[#1f2937] shadow-[inset_0_0_50px_rgba(0,0,0,0.75)] flex flex-col items-center justify-center gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/60 font-bold">
            {formatLabel ?? "MTT 8-Max"} {anteLabel ? `· ${anteLabel}` : ""}
          </div>

          {board.length > 0 && (
            <div className="flex items-center gap-1.5 my-0.5">
              {board.map((c) => {
                const parsed = parseCard(c);
                return <CardChip key={c} card={parsed} small />;
              })}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-full bg-black/45 border border-emerald-500/30 px-4 py-1 backdrop-blur-sm">
            <span className="text-xs text-slate-300 font-medium">POTE</span>
            <span className="text-sm font-mono font-bold text-amber-300">{displayPot}</span>
          </div>

          {useRng && rngValue !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-900/80 border border-indigo-400/40 px-3 py-0.5 text-xs">
              <span className="text-indigo-300 font-semibold">RNG:</span>
              <span className="font-mono font-bold text-white">{rngValue}</span>
            </div>
          )}
        </div>

        {/* Assentos 8-Max */}
        {rotatedSeats.map((seat, slotIdx) => {
          const pos = SEAT_COORDS[slotIdx];
          const isFolded = seat.statusText === "Fold";
          return (
            <div
              key={seat.position}
              style={{ left: pos.x, top: pos.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10"
            >
              {seat.isHero && (
                <div className="flex items-center gap-1.5 -mb-1 z-20">
                  <CardChip card={cards[0]} />
                  <CardChip card={cards[1]} />
                </div>
              )}

              <div
                className={`relative min-w-[78px] sm:min-w-[92px] rounded-xl px-2.5 py-1.5 text-center border backdrop-blur-md transition ${
                  seat.isHero
                    ? "bg-amber-500/20 border-amber-400 shadow-lg shadow-amber-500/20"
                    : seat.isVillain
                      ? "bg-rose-950/85 border-rose-500/80 shadow-md shadow-rose-500/20"
                      : isFolded
                        ? "bg-slate-900/50 border-slate-800 opacity-50"
                        : "bg-slate-900/85 border-slate-700"
                }`}
              >
                {seat.isDealer && (
                  <span
                    title="Dealer Button"
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-300 text-slate-950 font-black text-[10px] flex items-center justify-center border border-amber-500 shadow"
                  >
                    D
                  </span>
                )}

                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className={`text-xs font-bold ${
                      seat.isHero
                        ? "text-amber-300"
                        : seat.isVillain
                          ? "text-rose-300"
                          : "text-slate-200"
                    }`}
                  >
                    {seat.position}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {spot.stackBb}bb
                  </span>
                </div>

                <div
                  className={`text-[10px] font-medium truncate ${
                    seat.isHero
                      ? "text-emerald-300 font-bold"
                      : seat.isVillain
                        ? "text-rose-200 font-semibold"
                        : "text-slate-400"
                  }`}
                >
                  {seat.chipBet && (seat.isVillain || seat.position === "SB" || seat.position === "BB")
                    ? `${seat.statusText === "Aguarda" ? "" : seat.statusText + " "}${seat.chipBet}`
                    : seat.statusText}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Descrição contextual do spot */}
      <div className="rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="text-slate-200 font-medium">
          {board.length > 0
            ? `${spot.name} — Board [${board.join(" ")}] (${spot.stackBb} BB efetivos)`
            : scenarioText}
        </span>
        <span className="text-slate-400 font-mono text-xs">{spot.source}</span>
      </div>
    </div>
  );
}
