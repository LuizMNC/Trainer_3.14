"use client";

import React from "react";
import {
  formatActionLabelPtBr,
  POSITIONS_8MAX,
  type PlayingCard as Card,
  type LegacyRangeSpot,
} from "@/lib/poker";
import {
  buildFeltGradient,
  DEFAULT_TABLE_APPEARANCE,
  getOpponentScientistName,
  type CardStyleId,
  type ChipStyleId,
  type TableAppearanceConfig,
} from "@/lib/poker/tableAppearance";

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
  appearance?: TableAppearanceConfig;
}

const SEAT_COORDS: { top: string; left: string }[] = [
  { top: "83%", left: "50%" }, // 0: Herói (Base central)
  { top: "71%", left: "16%" }, // 1: Esquerda inferior
  { top: "45%", left: "11%" }, // 2: Esquerda média
  { top: "18%", left: "23%" }, // 3: Topo esquerdo
  { top: "12%", left: "50%" }, // 4: Topo central
  { top: "18%", left: "77%" }, // 5: Topo direito
  { top: "45%", left: "89%" }, // 6: Direita média
  { top: "71%", left: "84%" }, // 7: Direita inferior
];

const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

function getCardPalette(styleId: CardStyleId, suit: string): {
  container: string;
  suitColor: string;
  accentRing: string;
} {
  if (styleId === "classic-two") {
    const isRed = suit === "h" || suit === "d";
    return {
      container: "bg-[#FAF8F2] border-[#D7D2C5]",
      suitColor: isRed ? "text-[#C8232C]" : "text-[#17191E]",
      accentRing: "shadow-[0_6px_16px_rgba(0,0,0,0.45)]",
    };
  }
  if (styleId === "dark-gold") {
    const suitColors: Record<string, string> = {
      s: "text-[#E2E8F0]",
      h: "text-[#FB7185]",
      d: "text-[#60A5FA]",
      c: "text-[#34D399]",
    };
    return {
      container: "bg-[#111317] border-[#C9A449]",
      suitColor: suitColors[suit] ?? "text-[#E2E8F0]",
      accentRing: "shadow-[0_6px_18px_rgba(201,164,73,0.22)]",
    };
  }
  if (styleId === "high-contrast") {
    const suitColors: Record<string, string> = {
      s: "text-[#111317]",
      h: "text-[#DC2626]",
      d: "text-[#1D4ED8]",
      c: "text-[#15803D]",
    };
    return {
      container: "bg-white border-[#1E293B]",
      suitColor: suitColors[suit] ?? "text-[#111317]",
      accentRing: "shadow-[0_6px_18px_rgba(0,0,0,0.6)]",
    };
  }
  // Padrão: four-color
  const bgBySuit: Record<string, string> = {
    s: "bg-[#2B3036] border-[#4B535D] text-white",
    h: "bg-[#B82E2E] border-[#E05252] text-white",
    d: "bg-[#2358A6] border-[#4B83D8] text-white",
    c: "bg-[#1F8244] border-[#3EB369] text-white",
  };
  return {
    container: bgBySuit[suit] ?? "bg-[#2B3036] border-[#4B535D] text-white",
    suitColor: "text-white",
    accentRing: "shadow-[0_6px_16px_rgba(0,0,0,0.55)]",
  };
}

function StyledCard({
  rank,
  suit,
  size = "md",
  index = 0,
  cardStyle = "four-color",
}: {
  rank: string;
  suit: string;
  size?: "sm" | "md" | "lg";
  index?: number;
  cardStyle?: CardStyleId;
}) {
  const palette = getCardPalette(cardStyle, suit);
  const dims =
    size === "lg"
      ? "w-9 h-12 sm:w-[3.25rem] sm:h-[4.35rem] text-sm sm:text-xl"
      : size === "md"
        ? "w-8 h-11 sm:w-12 sm:h-16 text-xs sm:text-lg"
        : "w-7 h-9 text-xs";

  return (
    <div
      style={{ "--card-index": index } as React.CSSProperties}
      className={`poker-dealt-card relative rounded-lg ${palette.container} ${palette.suitColor} ${palette.accentRing} border-2 flex flex-col items-center justify-center font-extrabold select-none shrink-0`}
    >
      <div className={`${dims} flex flex-col items-center justify-center leading-none`}>
        <span className="tracking-tighter font-mono">{rank}</span>
        <span className="text-[0.78em] mt-0.5 opacity-95">
          {SUIT_SYMBOL[suit] ?? suit}
        </span>
      </div>
    </div>
  );
}

function PokerChipStack({
  chipStyle,
  count = 3,
  compact = false,
}: {
  chipStyle: ChipStyleId;
  count?: number;
  compact?: boolean;
}) {
  const paletteByStyle: Record<
    ChipStyleId,
    { fill: string[]; border: string; inner: string; ring: string }
  > = {
    "casino-clay": {
      fill: ["#DC2626", "#2563EB", "#111827"],
      border: "#F8FAFC",
      inner: "#05070B",
      ring: "border-dashed",
    },
    "neon-pro": {
      fill: ["#05070B", "#0F172A", "#1E1B4B"],
      border: "#3B82F6",
      inner: "#EF4444",
      ring: "border-solid",
    },
    "classic-gold": {
      fill: ["#C9A449", "#FAF3DC", "#9A7421"],
      border: "#FFFBEB",
      inner: "#29200C",
      ring: "border-dotted",
    },
  };

  const theme = paletteByStyle[chipStyle];
  const sizeCls = compact ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <span
      className="inline-flex items-center -space-x-1.5 shrink-0"
      data-chip-style={chipStyle}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <span
          key={idx}
          style={{
            backgroundColor: theme.fill[idx % theme.fill.length],
            borderColor: theme.border,
            boxShadow:
              chipStyle === "neon-pro"
                ? "0 0 6px rgba(34,211,238,0.65)"
                : "0 1px 3px rgba(0,0,0,0.7)",
          }}
          className={`${sizeCls} rounded-full border-[2px] ${theme.ring} flex items-center justify-center`}
        >
          <span
            style={{ backgroundColor: theme.inner }}
            className="w-1.5 h-1.5 rounded-full opacity-80"
          />
        </span>
      ))}
    </span>
  );
}

function buildTableContext(spot: LegacyRangeSpot, potBbOverride?: number | null) {
  const heroIdx = POSITIONS_8MAX.indexOf(
    spot.heroPosition as (typeof POSITIONS_8MAX)[number],
  );
  const safeHeroIdx = heroIdx === -1 ? 5 : heroIdx;

  let villainPos = spot.villainPosition?.trim().toUpperCase() ?? "";
  const spotTypeStr = String(spot.spotType);
  if (!villainPos) {
    if (spotTypeStr === "vs_rfi") {
      const m = spot.id.match(/vs_([a-z0-9+]+)_rfi/i);
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

type SeatVisualState = {
  kind: "hero" | "villain" | "awaiting" | "folded";
  statusText: string;
  showChips: boolean;
};

function resolveSeatVisualState(
  idx: number,
  safeHeroIdx: number,
  villainIdx: number,
  spot: LegacyRangeSpot,
  heroAction?: string | null,
): SeatVisualState {
  if (idx === safeHeroIdx) {
    if (heroAction) {
      const formatted = formatActionLabelPtBr(heroAction);
      return {
        kind: heroAction.toLowerCase() === "fold" ? "folded" : "hero",
        statusText: `${spot.stackBb}bb · ${formatted}`,
        showChips: heroAction.toLowerCase() !== "fold",
      };
    }
    return {
      kind: "hero",
      statusText: `${spot.stackBb}bb`,
      showChips: true,
    };
  }

  if (idx === villainIdx) {
    const label =
      spot.spotType === "vs_limp"
        ? "Limp"
        : spot.spotType === "vs_rfi"
          ? "Open"
          : spot.spotType === "vs_shove"
            ? "All-in"
            : "Vilão";
    return {
      kind: "villain",
      statusText: `${spot.stackBb}bb · ${label}`,
      showChips: true,
    };
  }

  const spotTypeStr = String(spot.spotType);
  const isPreflop =
    spotTypeStr === "rfi" ||
    spotTypeStr === "vs_rfi" ||
    spotTypeStr === "vs_limp" ||
    spotTypeStr === "push_fold" ||
    spotTypeStr === "vs_shove";

  if (isPreflop && idx > safeHeroIdx) {
    return {
      kind: "awaiting",
      statusText: `${spot.stackBb}bb · Aguarda`,
      showChips: true,
    };
  }

  return {
    kind: "folded",
    statusText: "Fold",
    showChips: false,
  };
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
    steps.push({ pos: villainPos || "VILÃO", action: "Open Raise" });
  } else if (spot.spotType === "vs_limp") {
    steps.push({ pos: "SB", action: "Limp 1,0 BB" });
  } else if (spot.spotType === "vs_shove") {
    steps.push({ pos: villainPos || "SB", action: `All-in ${spot.stackBb} BB` });
  } else {
    steps.push({ pos: "BTN", action: "Open Raise" });
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
      steps.push({ pos: "BTN", action: "Bet 33% Pote" });
    }
  }
  steps.push({
    pos: spot.heroPosition,
    action: heroAction ? formatActionLabelPtBr(heroAction) : "Sua vez",
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
  appearance = DEFAULT_TABLE_APPEARANCE,
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

  const feltStyle: React.CSSProperties = {
    background: buildFeltGradient(appearance.feltColor),
    borderColor: appearance.railColor,
  };

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      {/* Faixa Superior de Sequência da Mão */}
      <div
        className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:overflow-x-auto no-scrollbar rounded-xl bg-[#090D16] border border-[#26334A] px-2.5 py-2 text-xs"
        aria-label="Sequência de ações da mão"
      >
        {breadcrumbs.map((step, i) => (
          <div
            key={`${step.pos}-${i}`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono whitespace-nowrap border ${
              step.active
                ? "bg-[#2563EB]/25 border-[#3B82F6] text-[#93C5FD] font-bold shadow-[0_0_12px_rgba(37,99,235,0.28)]"
                : step.isStreet
                  ? "bg-[#151D2E] border-[#26334A] text-[#F8FAFC] font-semibold"
                  : "bg-[#0F1522] border-[#1E293B] text-[#94A3B8]"
            }`}
          >
            <span className="text-[0.6875rem] uppercase">{step.pos}</span>
            <span className="text-xs font-bold text-[#F8FAFC]">{step.action}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {useRng && (
            <span
              title="Randomizador de estratégias mistas [1..100]"
              className="px-2.5 py-1 rounded-lg bg-[#151D2E] border border-[#2563EB]/50 font-mono text-xs text-[#93C5FD] font-bold"
            >
              RNG: {rngValue}
            </span>
          )}
          <span className="hidden sm:inline-block px-2 py-1 rounded-lg bg-[#0F1522] border border-[#1E293B] font-mono text-[0.6875rem] text-[#94A3B8]">
            {formatLabel} · {anteLabel}
          </span>
        </div>
      </div>

      {/* Palco Principal da Mesa (cor do feltro e aro customizáveis) */}
      <div
        key={animationKey}
        className="poker-table-stage relative w-full aspect-[4/3] sm:aspect-[16/10] lg:aspect-[16/9] min-h-[295px] sm:min-h-[370px] lg:min-h-[420px] max-h-[510px] rounded-2xl bg-[#05070B] border border-[#26334A] shadow-2xl overflow-hidden flex items-center justify-center"
      >
        {/* Oval do Feltro com Cor Personalizável */}
        <div
          style={feltStyle}
          data-felt-color={appearance.feltColor}
          className="poker-table-felt absolute inset-3 sm:inset-6 lg:inset-7 rounded-[999px] border-[3px] sm:border-[4px] shadow-[inset_0_0_60px_rgba(0,0,0,0.85),0_0_26px_rgba(37,99,235,0.18)] transition-colors duration-200"
        >
          {/* Marca d'água central da mesa */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="text-base sm:text-3xl font-black tracking-[0.26em] uppercase text-white/[0.07] select-none">
              π TREINERLM
            </span>
          </div>
        </div>

        {/* Centro da Mesa: Marca TreinerLM + Spot + Fichas & Pote + Board */}
        <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-1.5 text-center px-2 sm:px-3 -mt-3 sm:-mt-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#05070B]/85 border border-[#2563EB]/45 px-2.5 py-0.5 text-[0.6875rem] font-extrabold tracking-wide text-[#93C5FD]">
            <span className="font-serif text-xs leading-none text-[#F87171]">π</span>
            <span>TreinerLM</span>
            <span className="text-white/40">·</span>
            <span className="text-[#F8FAFC]/95 font-semibold font-mono tabular-nums">
              {villainPos ? `${spot.heroPosition} vs ${villainPos}` : spot.heroPosition} · {spot.stackBb} BB
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-[#090D16]/90 border border-[#DC2626]/50 px-2.5 sm:px-3 py-0.5 sm:py-1 shadow-md">
            <PokerChipStack chipStyle={appearance.chipStyle} count={3} />
            <span className="text-xs sm:text-base font-extrabold font-mono tabular-nums text-[#F8FAFC] tracking-tight">
              Pote: {potBb.toFixed(1)} BB
            </span>
          </div>

          {parsedBoard.length > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5">
              {parsedBoard.map((c, idx) => (
                <StyledCard
                  key={`${c.rank}${c.suit}-${idx}`}
                  rank={c.rank}
                  suit={c.suit}
                  size="md"
                  index={idx + 2}
                  cardStyle={appearance.cardStyle}
                />
              ))}
            </div>
          )}
        </div>

        {/* 8 Assentos ao Redor da Mesa (Oponentes com nomes de cientistas famosos) */}
        {POSITIONS_8MAX.map((pos, idx) => {
          const offset = (idx - safeHeroIdx + 8) % 8;
          const coord = SEAT_COORDS[offset];
          const isHero = idx === safeHeroIdx;
          const isVillain = idx === villainIdx;
          const seatState = resolveSeatVisualState(
            idx,
            safeHeroIdx,
            villainIdx,
            spot,
            heroAction,
          );
          const isBtn = pos === "BTN";
          const scientistName = getOpponentScientistName(pos, idx);

          return (
            <div
              key={pos}
              style={{ top: coord.top, left: coord.left }}
              className={`poker-seat ${
                isHero ? "poker-seat-hero z-20" : "z-10"
              } absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2`}
            >
              {/* Botão de Dealer (D) */}
              {isBtn && (
                <span
                  title="Botão (Dealer)"
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-[#DC2626] to-[#2563EB] border border-white/80 text-white font-extrabold text-[0.6875rem] flex items-center justify-center shadow shrink-0"
                >
                  D
                </span>
              )}

              {/* Pílula do Jogador: Nome + Posição + Stack/Status */}
              <div
                data-awaiting={isHero && !heroAction}
                data-seat-state={seatState.kind}
                className={`poker-seat-label rounded-xl sm:rounded-2xl px-2 sm:px-2.5 py-0.5 sm:py-1 border text-center transition-all ${
                  isHero
                    ? "bg-[#090D16] border-2 border-[#3B82F6] text-[#F8FAFC] shadow-[0_0_18px_rgba(37,99,235,0.45)] sm:min-w-[5.4rem]"
                    : isVillain
                      ? "bg-[#090D16] border-2 border-[#DC2626] text-[#F8FAFC] shadow-[0_0_16px_rgba(220,38,38,0.4)] sm:min-w-[5.6rem]"
                      : seatState.kind === "awaiting"
                        ? "bg-[#0B111E]/95 border border-[#26334A] text-[#CBD5E1] opacity-90 sm:min-w-[5rem]"
                        : "bg-[#080B12]/90 border border-[#1E293B] border-dashed text-[#94A3B8] opacity-75 sm:min-w-[4.7rem]"
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[0.6875rem] font-extrabold tracking-tight leading-tight">
                  <span className="truncate max-w-[3.4rem] sm:max-w-none">{isHero ? "Você" : scientistName}</span>
                  <span
                    className={`text-[0.6875rem] px-1 py-0.2 rounded font-mono ${
                      isHero
                        ? "bg-[#2563EB]/25 text-[#93C5FD]"
                        : isVillain
                          ? "bg-[#DC2626]/25 text-[#FCA5A5]"
                          : "bg-white/5 text-[#CBD5E1]"
                    }`}
                  >
                    {pos}
                  </span>
                </div>
                <div
                  className={`flex items-center justify-center gap-1 text-[0.6875rem] font-mono tabular-nums leading-tight mt-0.5 ${
                    isHero
                      ? "text-[#93C5FD] font-bold"
                      : isVillain
                        ? "text-[#FCA5A5] font-bold"
                        : seatState.kind === "awaiting"
                          ? "text-[#CBD5E1]"
                          : "text-[#94A3B8]"
                  }`}
                >
                  {seatState.showChips && (
                    <PokerChipStack chipStyle={appearance.chipStyle} count={2} compact />
                  )}
                  <span>{seatState.statusText}</span>
                </div>
              </div>

              {/* Cartas do Herói posicionadas ao lado do assento */}
              {isHero && (
                <div
                  className="poker-hero-cards flex items-center gap-1"
                  data-folded={heroAction?.toLowerCase() === "fold"}
                >
                  <StyledCard
                    rank={cards[0].rank}
                    suit={cards[0].suit}
                    size="lg"
                    index={0}
                    cardStyle={appearance.cardStyle}
                  />
                  <StyledCard
                    rank={cards[1].rank}
                    suit={cards[1].suit}
                    size="lg"
                    index={1}
                    cardStyle={appearance.cardStyle}
                  />
                </div>
              )}
            </div>
          );
        })}

        {heroAction && (
          <div className="poker-action-toast" role="status">
            Sua ação: <strong>{formatActionLabelPtBr(heroAction)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
