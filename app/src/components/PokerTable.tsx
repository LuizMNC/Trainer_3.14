"use client";

import React from "react";
import { POSITIONS_8MAX, type PlayingCard as Card, type LegacyRangeSpot } from "@/lib/poker";

interface PokerTableProps {
  spot: LegacyRangeSpot;
  cards: [Card, Card];
  rngValue: number;
  useRng: boolean;
  board?: string[];
  potBbOverride?: number | null;
  anteLabel?: string;
  formatLabel?: string;
  animationKey?: number;
  heroAction?: string | null;
}

const SEAT_COORDS: { top: string; left: string }[] = [
  { top: "82%", left: "50%" }, // 0: Herói (Base central)
  { top: "72%", left: "16%" }, // 1: Esquerda inferior
  { top: "42%", left: "8%" },  // 2: Esquerda média
  { top: "16%", left: "23%" }, // 3: Topo esquerdo
  { top: "12%", left: "50%" }, // 4: Topo central
  { top: "16%", left: "77%" }, // 5: Topo direito
  { top: "42%", left: "92%" }, // 6: Direita média
  { top: "72%", left: "84%" }, // 7: Direita inferior
];

function FourColorCard({
  rank,
  suit,
  size = "md",
  index = 0,
}: {
  rank: string;
  suit: string;
  size?: "sm" | "md" | "lg";
  index?: number;
}) {
  const bgBySuit: Record<string, string> = {
    s: "bg-[#2B3036] border-[#4B535D] text-white",
    h: "bg-[#B82E2E] border-[#E05252] text-white",
    d: "bg-[#2358A6] border-[#4B83D8] text-white",
    c: "bg-[#1F8244] border-[#3EB369] text-white",
  };
  const dims =
    size === "lg"
      ? "w-12 h-16 sm:w-14 sm:h-[4.5rem] text-lg sm:text-xl"
      : size === "md"
        ? "w-10 h-14 sm:w-12 sm:h-16 text-base sm:text-lg"
        : "w-7 h-9 text-xs";

  return (
    <div
      style={{ "--card-index": index } as React.CSSProperties}
      className={`poker-dealt-card relative rounded-lg ${
        bgBySuit[suit] ?? "bg-[#2B3036] border-[#4B535D] text-white"
      } border-2 shadow-[0_6px_16px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center font-extrabold select-none shrink-0`}
    >
      <div className={`${dims} flex flex-col items-center justify-center leading-none`}>
        <span className="tracking-tighter font-mono">{rank}</span>
        <span className="text-[0.75em] mt-0.5 opacity-95">
          {suit === "s" ? "♠" : suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "c" ? "♣" : suit}
        </span>
      </div>
    </div>
  );
}

function buildTableContext(spot: LegacyRangeSpot, potBbOverride?: number | null) {
  const heroIdx = POSITIONS_8MAX.indexOf(
    spot.heroPosition as (typeof POSITIONS_8MAX)[number],
  );
  const safeHeroIdx = heroIdx === -1 ? 5 : heroIdx;

  let villainPos = "";
  const spotTypeStr = String(spot.spotType);
  if (spotTypeStr === "vs_rfi") {
    const m = spot.id.match(/vs_([a-z0-9]+)_rfi/i);
    if (m) villainPos = m[1].toUpperCase();
  } else if (spotTypeStr === "vs_limp") {
    villainPos = "SB";
  } else if (spotTypeStr === "vs_shove") {
    villainPos = spot.heroPosition === "BB" ? "SB" : "BTN";
  } else if (
    spotTypeStr === "flop_cbet_ip" ||
    spotTypeStr === "turn_cbet_ip" ||
    spotTypeStr === "bb_vs_cbet"
  ) {
    villainPos = spot.heroPosition === "BTN" ? "BB" : "BTN";
  }

  const villainIdx = villainPos
    ? POSITIONS_8MAX.indexOf(villainPos as (typeof POSITIONS_8MAX)[number])
    : -1;

  let potBb = 2.5;
  if (typeof potBbOverride === "number") {
    potBb = potBbOverride;
  } else if (spot.spotType === "vs_rfi") {
    potBb = 4.6;
  } else if (spot.spotType === "vs_limp") {
    potBb = 3.0;
  } else if (spot.spotType === "vs_shove") {
    potBb = spot.stackBb + 1.5;
  }

  return { safeHeroIdx, villainPos, villainIdx, potBb };
}

function buildActionBreadcrumbs(
  spot: LegacyRangeSpot,
  villainPos: string,
  board: string[],
  potBb: number,
  heroAction?: string | null,
) {
  const steps: { pos: string; action: string; active?: boolean; isStreet?: boolean }[] = [];
  if (spot.spotType === "rfi" || spot.spotType === "push_fold") {
    steps.push({ pos: "MESA", action: "Fold até Herói" });
  } else if (spot.spotType === "vs_rfi") {
    steps.push({ pos: villainPos || "VILÃO", action: "Raise 2.1" });
  } else if (spot.spotType === "vs_limp") {
    steps.push({ pos: "SB", action: "Limp 1.0" });
  } else if (spot.spotType === "vs_shove") {
    steps.push({ pos: villainPos || "SB", action: `All-in ${spot.stackBb}` });
  } else {
    steps.push({ pos: "BTN", action: "Raise 2.1" });
    steps.push({ pos: "BB", action: "Call" });
    if (board.length >= 3) {
      steps.push({
        pos: board.length === 3 ? "FLOP" : board.length === 4 ? "TURN" : "RIVER",
        action: `${potBb.toFixed(1)} BB · ${board.join(" ")}`,
        isStreet: true,
      });
    }
    if (spot.heroPosition === "BTN") {
      steps.push({ pos: "BB", action: "Check" });
    } else {
      steps.push({ pos: "BTN", action: "Bet 33%" });
    }
  }
  steps.push({
    pos: spot.heroPosition,
    action: heroAction ? heroAction : "Tomar ação",
    active: true,
  });
  return steps;
}

export function PokerTable({
  spot,
  cards,
  rngValue,
  useRng,
  board = [],
  potBbOverride,
  anteLabel = "Ante 0.125bb",
  formatLabel = "MTT 8-Max",
  animationKey = 0,
  heroAction = null,
}: PokerTableProps) {
  const { safeHeroIdx, villainPos, villainIdx, potBb } = buildTableContext(
    spot,
    potBbOverride,
  );
  const parsedBoard = board.map((b) => {
    try {
      return { rank: b.slice(0, -1), suit: b.slice(-1).toLowerCase() };
    } catch {
      return { rank: "?", suit: "s" };
    }
  });
  const breadcrumbs = buildActionBreadcrumbs(
    spot,
    villainPos,
    board,
    potBb,
    heroAction,
  );

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      {/* Faixa Superior de Sequência da Mão (Estilo GTO Wizard Imagens 05, 06, 07) */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto rounded-xl bg-[#090B0C] border border-[#363A3D] px-2.5 py-2 text-xs"
        aria-label="Sequência de ações da mão"
      >
        {breadcrumbs.map((step, i) => (
          <div
            key={`${step.pos}-${i}`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono whitespace-nowrap border ${
              step.active
                ? "bg-[#18B88D]/20 border-[#18B88D] text-[#A1F5AE] font-bold shadow-[0_0_12px_rgba(24,184,141,0.2)]"
                : step.isStreet
                  ? "bg-[#202224] border-[#363A3D] text-[#F4F5F5] font-semibold"
                  : "bg-[#191B1D] border-[#292C2F] text-[#A1A6AA]"
            }`}
          >
            <span className="text-[0.6875rem] uppercase">{step.pos}</span>
            <span className="text-xs font-bold text-[#F4F5F5]">{step.action}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {useRng && (
            <span
              title="Randomizador de estratégias mistas [1..100]"
              className="px-2.5 py-1 rounded-lg bg-[#202224] border border-[#363A3D] font-mono text-xs text-[#A1F5AE] font-bold"
            >
              RNG: {rngValue}
            </span>
          )}
          <span className="hidden sm:inline-block px-2 py-1 rounded-lg bg-[#191B1D] border border-[#292C2F] font-mono text-[0.6875rem] text-[#A1A6AA]">
            {formatLabel} · {anteLabel}
          </span>
        </div>
      </div>

      {/* Palco Principal da Mesa (Fundo #101112, feltro escuro minimalista) */}
      <div
        key={animationKey}
        className="poker-table-stage relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[380px] rounded-2xl bg-[#101112] border border-[#363A3D] shadow-2xl overflow-hidden flex items-center justify-center"
      >
        {/* Oval minimalista estilo GTO Wizard */}
        <div className="poker-table-felt absolute inset-5 sm:inset-7 rounded-[999px] bg-[radial-gradient(ellipse_at_center,#172321_0%,#121618_70%,#101112_100%)] border-[2px] border-[#292C2F] shadow-[inset_0_0_50px_rgba(0,0,0,0.85)]" />

        {/* Centro da Mesa: Identificação do Spot + Pote em Destaque + Board */}
        <div className="relative z-10 flex flex-col items-center gap-1.5 text-center px-3 -mt-3">
          <span className="text-[0.6875rem] font-medium text-[#A1A6AA] tracking-wide">
            {spot.heroPosition} vs {villainPos || "Mesa"} · {spot.stackBb} BB
          </span>

          <div className="text-base sm:text-xl font-extrabold font-mono text-[#F4F5F5] tracking-tight">
            {potBb.toFixed(1)} BB
          </div>

          {parsedBoard.length > 0 && (
            <div className="flex items-center gap-1.5 my-0.5">
              {parsedBoard.map((c, idx) => (
                <FourColorCard
                  key={`${c.rank}${c.suit}-${idx}`}
                  rank={c.rank}
                  suit={c.suit}
                  size="md"
                  index={idx + 2}
                />
              ))}
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#191B1D]/95 border border-[#363A3D] px-2.5 py-0.5 text-[0.6875rem] font-mono text-[#A1F5AE]">
            <span className="w-2 h-2 rounded-full bg-[#18B88D]" />
            Pote: {potBb.toFixed(1)} BB
          </div>
        </div>

        {/* 8 Assentos ao Redor da Mesa */}
        {POSITIONS_8MAX.map((pos, idx) => {
          const offset = (idx - safeHeroIdx + 8) % 8;
          const coord = SEAT_COORDS[offset];
          const isHero = idx === safeHeroIdx;
          const isVillain = idx === villainIdx;
          const isActive = isHero || isVillain;
          const isBtn = pos === "BTN";

          return (
            <div
              key={pos}
              style={{ top: coord.top, left: coord.left }}
              className={`poker-seat ${
                isHero ? "poker-seat-hero z-20" : "z-10"
              } absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-2`}
            >
              {/* Botão de Dealer (D) */}
              {isBtn && (
                <span
                  title="Botão (Dealer)"
                  className="w-5 h-5 rounded-full bg-[#F4F5F5] text-[#090B0C] font-extrabold text-[0.625rem] flex items-center justify-center shadow"
                >
                  D
                </span>
              )}

              {/* Círculo / Pílula de Posição e Stack */}
              <div
                data-awaiting={isHero && !heroAction}
                className={`poker-seat-label rounded-full px-3 py-1.5 border text-center transition-all ${
                  isHero
                    ? "bg-[#191B1D] border-2 border-[#18B88D] text-[#F4F5F5] shadow-[0_0_18px_rgba(24,184,141,0.35)] min-w-[4.6rem]"
                    : isVillain
                      ? "bg-[#191B1D] border-2 border-[#F1BE60] text-[#F4F5F5] shadow-[0_0_14px_rgba(241,190,96,0.25)] min-w-[4.4rem]"
                      : "bg-[#141618]/90 border border-[#292C2F] text-[#A1A6AA] opacity-65 min-w-[3.8rem]"
                }`}
              >
                <div className="text-[0.6875rem] font-extrabold tracking-tight leading-tight">
                  {pos}
                </div>
                <div
                  className={`text-[0.6875rem] font-mono leading-tight ${
                    isHero
                      ? "text-[#A1F5AE] font-bold"
                      : isVillain
                        ? "text-[#F1BE60] font-bold"
                        : "text-[#A1A6AA]"
                  }`}
                >
                  {isActive ? `${spot.stackBb}` : "fold"}
                </div>
              </div>

              {/* Cartas do Herói posicionadas ao lado do assento (como nas Imagens 05, 06 e 07) */}
              {isHero && (
                <div
                  className="poker-hero-cards flex items-center gap-1"
                  data-folded={heroAction?.toLowerCase() === "fold"}
                >
                  <FourColorCard
                    rank={cards[0].rank}
                    suit={cards[0].suit}
                    size="lg"
                    index={0}
                  />
                  <FourColorCard
                    rank={cards[1].rank}
                    suit={cards[1].suit}
                    size="lg"
                    index={1}
                  />
                </div>
              )}
            </div>
          );
        })}

        {heroAction && (
          <div className="poker-action-toast" role="status">
            Sua ação: <strong>{heroAction}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
