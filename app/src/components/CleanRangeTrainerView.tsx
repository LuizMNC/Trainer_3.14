"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Flame,
  Grid3X3,
  Palette,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import {
  evaluateDecision,
  pickDrillHand,
  POSITIONS_8MAX,
  sampleCardsForHand,
  type DecisionEvaluation,
  type DrillDifficulty,
  type PlayingCard,
  type RangeSpot,
  type SpotType,
} from "@/lib/poker";
import {
  CARD_STYLE_OPTIONS,
  CHIP_STYLE_OPTIONS,
  DEFAULT_TABLE_APPEARANCE,
  loadTableAppearance,
  normalizeHexColor,
  saveTableAppearance,
  TABLE_COLOR_PRESETS,
  type CardStyleId,
  type ChipStyleId,
  type TableAppearanceConfig,
} from "@/lib/poker/tableAppearance";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { PokerTable } from "./PokerTable";
import { RangeMatrix } from "./RangeMatrix";

export type MemorizerSpotTypeFilter = "all" | SpotType;

export const MEMORIZER_SPOT_TYPE_OPTIONS: readonly {
  id: MemorizerSpotTypeFilter;
  label: string;
  shortLabel: string;
}[] = [
  { id: "all", label: "Todos", shortLabel: "Todos" },
  { id: "rfi", label: "RFI (Open Raise)", shortLabel: "RFI" },
  { id: "vs_rfi", label: "vs RFI (3-Bet / Call)", shortLabel: "vs RFI" },
  { id: "vs_limp", label: "vs Limp", shortLabel: "vs Limp" },
  { id: "push_fold", label: "Push / Fold", shortLabel: "Push/Fold" },
  { id: "vs_shove", label: "vs Shove", shortLabel: "vs Shove" },
];

export function filterMemorizerSpots(
  spots: readonly RangeSpot[],
  spotTypeFilter: MemorizerSpotTypeFilter,
  heroPosition: string | "all",
): RangeSpot[] {
  return spots.filter((spot) => {
    if (spotTypeFilter !== "all" && spot.spotType !== spotTypeFilter) return false;
    if (heroPosition !== "all" && spot.heroPosition !== heroPosition) return false;
    return true;
  });
}

export function getAvailablePositionsForType(
  spots: readonly RangeSpot[],
  spotTypeFilter: MemorizerSpotTypeFilter,
): Set<string> {
  const available = new Set<string>();
  for (const spot of spots) {
    if (spotTypeFilter === "all" || spot.spotType === spotTypeFilter) {
      available.add(spot.heroPosition);
    }
  }
  return available;
}

function getActionButtonStyle(actionName: string): string {
  const lower = actionName.toLowerCase();
  if (lower === "fold") {
    return "bg-[#090D16] hover:bg-[#111827] border-[#26334A] text-[#CBD5E1]";
  }
  if (lower.includes("call") || lower.includes("check")) {
    return "bg-[#1D4ED8] hover:bg-[#2563EB] border-[#60A5FA]/70 text-white shadow-[0_4px_16px_rgba(37,99,235,0.3)]";
  }
  return "bg-gradient-to-r from-[#DC2626] to-[#B91C1C] hover:from-[#EF4444] hover:to-[#DC2626] border-[#F87171]/70 text-white shadow-[0_4px_16px_rgba(220,38,38,0.32)]";
}

interface CleanRangeTrainerViewProps {
  spots: RangeSpot[];
}

export function CleanRangeTrainerView({ spots }: CleanRangeTrainerViewProps) {
  const [spotTypeFilter, setSpotTypeFilter] =
    useState<MemorizerSpotTypeFilter>("rfi");
  const availablePositions = useMemo(
    () => getAvailablePositionsForType(spots, spotTypeFilter),
    [spots, spotTypeFilter],
  );

  const [heroPosition, setHeroPosition] = useState<string>(() => {
    const first = POSITIONS_8MAX.find((pos) =>
      spots.some((s) => s.spotType === "rfi" && s.heroPosition === pos),
    );
    return first ?? spots[0]?.heroPosition ?? "BTN";
  });

  const matchingSpots = useMemo(() => {
    const byPos = filterMemorizerSpots(spots, spotTypeFilter, heroPosition);
    if (byPos.length > 0) return byPos;
    const byType = filterMemorizerSpots(spots, spotTypeFilter, "all");
    return byType.length > 0 ? byType : spots;
  }, [spots, spotTypeFilter, heroPosition]);

  const [selectedSpotId, setSelectedSpotId] = useState<string>(
    () => matchingSpots[0]?.id ?? "",
  );

  const currentSpot = useMemo(
    () =>
      matchingSpots.find((s) => s.id === selectedSpotId) ??
      matchingSpots[0] ??
      spots[0] ??
      null,
    [matchingSpots, selectedSpotId, spots],
  );

  const [difficulty, setDifficulty] = useState<DrillDifficulty>("borderline");
  const [useRng, setUseRng] = useState<boolean>(false);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(false);

  const [handClass, setHandClass] = useState<string>(() => {
    if (!currentSpot) return "AKs";
    const keys = Object.keys(currentSpot.matrix ?? {});
    return keys[0] ?? "AKs";
  });
  const [cards, setCards] = useState<[PlayingCard, PlayingCard]>(() => {
    const firstHand = currentSpot
      ? (Object.keys(currentSpot.matrix ?? {})[0] ?? "AKs")
      : "AKs";
    try {
      return sampleCardsForHand(firstHand, [], () => 0);
    } catch {
      return [
        { rank: "A", suit: "♠" },
        { rank: "K", suit: "♠" },
      ];
    }
  });
  const [rngValue, setRngValue] = useState<number>(50);
  const [dealKey, setDealKey] = useState<number>(0);

  const [chosenAction, setChosenAction] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<DecisionEvaluation | null>(null);

  const [totalCount, setTotalCount] = useState<number>(0);
  const [rightCount, setRightCount] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);

  const [showOptionsPanel, setShowOptionsPanel] = useState<boolean>(false);
  const [showMatrixPanel, setShowMatrixPanel] = useState<boolean>(false);

  const [tableAppearance, setTableAppearance] = useState<TableAppearanceConfig>(
    DEFAULT_TABLE_APPEARANCE,
  );
  const [feltHexInput, setFeltHexInput] = useState<string>(
    DEFAULT_TABLE_APPEARANCE.feltColor,
  );
  const [railHexInput, setRailHexInput] = useState<string>(
    DEFAULT_TABLE_APPEARANCE.railColor,
  );

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const saved = loadTableAppearance();
    queueMicrotask(() => {
      if (!active) return;
      setTableAppearance(saved);
      setFeltHexInput(saved.feltColor);
      setRailHexInput(saved.railColor);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, []);

  const updateTableAppearance = (patch: Partial<TableAppearanceConfig>) => {
    const next: TableAppearanceConfig = { ...tableAppearance, ...patch };
    saveTableAppearance(next);
    setTableAppearance(next);
    setFeltHexInput(next.feltColor);
    setRailHexInput(next.railColor);
  };

  const dealHandForSpot = useCallback(
    (spotToDeal: RangeSpot | null, nextDifficulty: DrillDifficulty = difficulty) => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      if (!spotToDeal) return;
      const nextHand = pickDrillHand(spotToDeal, nextDifficulty);
      const nextCards = sampleCardsForHand(nextHand, []);
      setHandClass(nextHand);
      setCards(nextCards);
      setRngValue(Math.floor(Math.random() * 100) + 1);
      setChosenAction(null);
      setEvaluation(null);
      setDealKey((k) => k + 1);
    },
    [difficulty],
  );

  const handleSpotTypeChange = (nextType: MemorizerSpotTypeFilter) => {
    setSpotTypeFilter(nextType);
    const nextAvail = getAvailablePositionsForType(spots, nextType);
    const nextPos = nextAvail.has(heroPosition)
      ? heroPosition
      : (POSITIONS_8MAX.find((pos) => nextAvail.has(pos)) ?? heroPosition);
    setHeroPosition(nextPos);
    const nextSpots = filterMemorizerSpots(spots, nextType, nextPos);
    const targetSpot = nextSpots[0] ?? spots[0] ?? null;
    if (targetSpot) {
      setSelectedSpotId(targetSpot.id);
      dealHandForSpot(targetSpot);
    }
  };

  const handlePositionChange = (pos: string) => {
    setHeroPosition(pos);
    const nextSpots = filterMemorizerSpots(spots, spotTypeFilter, pos);
    const targetSpot = nextSpots[0] ?? null;
    if (targetSpot) {
      setSelectedSpotId(targetSpot.id);
      dealHandForSpot(targetSpot);
    }
  };

  const handleSpotSelect = (spotId: string) => {
    const found = matchingSpots.find((s) => s.id === spotId) ?? null;
    if (!found) return;
    setSelectedSpotId(found.id);
    dealHandForSpot(found);
  };

  const handleChooseAction = useCallback(
    (actionName: string) => {
      if (!currentSpot || evaluation) return;
      const result = evaluateDecision(
        currentSpot,
        handClass,
        actionName,
        rngValue,
        useRng,
      );
      setChosenAction(actionName);
      setEvaluation(result);
      setTotalCount((n) => n + 1);
      if (result.status !== "error") {
        setRightCount((n) => n + 1);
        setStreak((n) => n + 1);
      } else {
        setStreak(0);
      }
      if (autoAdvance) {
        autoTimerRef.current = setTimeout(() => {
          dealHandForSpot(currentSpot);
        }, 1200);
      }
    },
    [
      autoAdvance,
      currentSpot,
      dealHandForSpot,
      evaluation,
      handClass,
      rngValue,
      useRng,
    ],
  );

  const actions = useMemo(() => {
    if (!currentSpot) return [];
    const list = [...currentSpot.actions];
    const hasFold = list.some((a) => a.name.toLowerCase() === "fold");
    if (!hasFold) {
      list.push({ name: "Fold", color: "#3b82f6", pct: 0 });
    }
    return list;
  }, [currentSpot]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (evaluation && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        dealHandForSpot(currentSpot);
        return;
      }
      if (!evaluation) {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < actions.length) {
          event.preventDefault();
          handleChooseAction(actions[index].name);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, currentSpot, dealHandForSpot, evaluation, handleChooseAction]);

  const accuracyPct =
    totalCount > 0 ? Math.round((rightCount / totalCount) * 100) : null;

  if (!currentSpot) {
    return (
      <div className="rounded-2xl bg-[#0A0E17] border border-[#1E293B] p-6 text-center text-sm text-[#94A3B8]">
        Nenhum spot de range disponível para memorização no momento.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4 max-w-5xl mx-auto w-full">
      {/* Barra Minimalista: Filtro de Situação (RFI / vs RFI / etc.) + Posição + Stack */}
      <section
        aria-label="Filtros do Treiner Limpo de Memorização"
        className="rounded-2xl bg-[#090D16] border border-[#26334A] p-3 sm:p-4 shadow-xl flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.14em] text-[#60A5FA] block">
              Treiner Limpo · Memorização de Ranges
            </span>
            <h2 className="text-sm sm:text-base font-extrabold text-[#F8FAFC]">
              {currentSpot.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1 font-mono text-[#F8FAFC]">
              Memorizadas: <strong>{totalCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#05070B] border border-[#2563EB]/45 px-2.5 py-1 font-mono text-[#93C5FD]">
              Acertos: <strong>{accuracyPct !== null ? `${accuracyPct}%` : "—"}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#05070B] border border-[#DC2626]/45 px-2.5 py-1 font-mono text-[#FCA5A5]">
              <Flame className="w-3.5 h-3.5 text-[#EF4444]" />
              {streak}
            </span>
            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTotalCount(0);
                  setRightCount(0);
                  setStreak(0);
                }}
                aria-label="Zerar placar do treiner limpo"
                title="Zerar placar"
                className="min-h-[34px] px-2 rounded-lg bg-[#05070B] border border-[#1E293B] text-[#94A3B8] hover:text-white hover:border-[#DC2626]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Linha 1: Tipo de Spot (RFI, vs RFI, etc.) */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tipo de situação">
          {MEMORIZER_SPOT_TYPE_OPTIONS.map((opt) => {
            const active = spotTypeFilter === opt.id;
            const hasAny =
              opt.id === "all" || spots.some((s) => s.spotType === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!hasAny}
                onClick={() => handleSpotTypeChange(opt.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  active
                    ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] border-[#60A5FA] text-white shadow-md"
                    : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white hover:border-[#2563EB]/60 disabled:opacity-35"
                }`}
              >
                <span className="sm:hidden">{opt.shortLabel}</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Linha 2: Posição do Herói + Seletor de Stack/Cenário + Botões recolhíveis */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div
            className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1.5"
            role="group"
            aria-label="Posição na mesa"
          >
            {POSITIONS_8MAX.map((pos) => {
              const enabled = availablePositions.has(pos);
              const active = heroPosition === pos && enabled;
              return (
                <button
                  key={pos}
                  type="button"
                  disabled={!enabled}
                  onClick={() => handlePositionChange(pos)}
                  title={
                    enabled
                      ? `Estudar ${pos}`
                      : `Sem spots cadastrados para ${pos} neste filtro`
                  }
                  className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl text-xs font-mono font-extrabold border transition ${
                    active
                      ? "bg-[#2563EB] border-[#93C5FD] text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                      : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:border-[#DC2626]/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  }`}
                >
                  {pos}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Selecionar cenário e stack"
              value={currentSpot.id}
              onChange={(event) => handleSpotSelect(event.target.value)}
              className="flex-1 sm:flex-initial min-h-[38px] rounded-xl bg-[#05070B] border border-[#26334A] px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] outline-none focus:border-[#3B82F6]"
            >
              {matchingSpots.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.stackBb}BB · {sp.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowOptionsPanel((v) => !v)}
              aria-expanded={showOptionsPanel}
              className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                showOptionsPanel
                  ? "bg-[#2563EB]/20 border-[#3B82F6] text-[#93C5FD]"
                  : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Opções</span>
            </button>
          </div>
        </div>
      </section>

      {/* Painel Recolhível de Opções & Aparência (fechado por padrão) */}
      {showOptionsPanel && (
        <CollapsiblePanel
          title="Opções de Memorização & Aparência da Mesa"
          icon={<Palette className="w-4 h-4" />}
          tone="blue"
          open={true}
          onToggle={(next) => setShowOptionsPanel(next)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-3">
              <div>
                <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#94A3B8] block mb-1.5">
                  Seleção de Mãos
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "borderline", label: "Bordas (Melhor p/ fixar)" },
                      { id: "mixed", label: "Mistas" },
                      { id: "all", label: "Aleatória (169)" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setDifficulty(item.id);
                        dealHandForSpot(currentSpot, item.id);
                      }}
                      className={`min-h-[38px] px-2 py-1.5 rounded-lg border text-[0.6875rem] font-bold transition ${
                        difficulty === item.id
                          ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                          : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUseRng((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-bold ${
                    useRng
                      ? "bg-[#2563EB]/20 border-[#3B82F6] text-[#93C5FD]"
                      : "bg-[#05070B] border-[#1E293B] text-[#94A3B8]"
                  }`}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  RNG {useRng ? `ON (${rngValue})` : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoAdvance((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-bold ${
                    autoAdvance
                      ? "bg-[#DC2626]/20 border-[#EF4444] text-[#FCA5A5]"
                      : "bg-[#05070B] border-[#1E293B] text-[#94A3B8]"
                  }`}
                >
                  Avanço automático: {autoAdvance ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#94A3B8] block">
                Cores da Mesa, Cartas &amp; Fichas
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TABLE_COLOR_PRESETS.slice(0, 4).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      updateTableAppearance({
                        presetId: preset.id,
                        feltColor: preset.feltColor,
                        railColor: preset.railColor,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[0.6875rem] font-semibold ${
                      tableAppearance.presetId === preset.id
                        ? "bg-[#2563EB]/20 border-[#3B82F6] text-white"
                        : "bg-[#05070B] border-[#1E293B] text-[#94A3B8]"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-white/30"
                      style={{ backgroundColor: preset.feltColor }}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1.5 bg-[#05070B] border border-[#1E293B] rounded-lg px-2 py-1">
                  <input
                    type="color"
                    aria-label="Cor da mesa no Treiner Limpo"
                    value={tableAppearance.feltColor}
                    onChange={(e) =>
                      updateTableAppearance({
                        presetId: "custom",
                        feltColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={feltHexInput}
                    maxLength={7}
                    onChange={(e) => {
                      setFeltHexInput(e.target.value);
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value.trim())) {
                        updateTableAppearance({
                          presetId: "custom",
                          feltColor: normalizeHexColor(
                            e.target.value,
                            tableAppearance.feltColor,
                          ),
                        });
                      }
                    }}
                    className="w-full bg-transparent font-mono text-xs text-white outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 bg-[#05070B] border border-[#1E293B] rounded-lg px-2 py-1">
                  <input
                    type="color"
                    aria-label="Cor do aro no Treiner Limpo"
                    value={tableAppearance.railColor}
                    onChange={(e) =>
                      updateTableAppearance({
                        presetId: "custom",
                        railColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-6 h-6 bg-transparent border-0 p-0 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={railHexInput}
                    maxLength={7}
                    onChange={(e) => {
                      setRailHexInput(e.target.value);
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value.trim())) {
                        updateTableAppearance({
                          presetId: "custom",
                          railColor: normalizeHexColor(
                            e.target.value,
                            tableAppearance.railColor,
                          ),
                        });
                      }
                    }}
                    className="w-full bg-transparent font-mono text-xs text-white outline-none"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Estilo das cartas"
                  value={tableAppearance.cardStyle}
                  onChange={(e) =>
                    updateTableAppearance({ cardStyle: e.target.value as CardStyleId })
                  }
                  className="min-h-[36px] rounded-lg bg-[#05070B] border border-[#1E293B] px-2 text-[0.6875rem] text-white"
                >
                  {CARD_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      Cartas: {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Estilo das fichas"
                  value={tableAppearance.chipStyle}
                  onChange={(e) =>
                    updateTableAppearance({ chipStyle: e.target.value as ChipStyleId })
                  }
                  className="min-h-[36px] rounded-lg bg-[#05070B] border border-[#1E293B] px-2 text-[0.6875rem] text-white"
                >
                  {CHIP_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      Fichas: {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CollapsiblePanel>
      )}

      {/* Palco Limpo: Apenas a Mesa + Ações Diretas */}
      <div className="flex flex-col gap-3">
        <PokerTable
          spot={currentSpot}
          cards={cards}
          rngValue={rngValue}
          useRng={useRng}
          animationKey={dealKey}
          heroAction={chosenAction}
          appearance={tableAppearance}
          formatLabel="Memorização"
          anteLabel={`${currentSpot.stackBb} BB`}
        />

        {/* Botões de Ação Táteis para Desktop, iPad e Celular */}
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-2.5"
          aria-label="Ações de memorização"
        >
          {actions.map((act, idx) => {
            const picked = chosenAction === act.name;
            const distFreq =
              currentSpot.matrix[handClass]?.[act.name] ??
              (act.name.toLowerCase() === "fold" &&
              !currentSpot.matrix[handClass]
                ? 1
                : 0);
            return (
              <button
                key={act.name}
                type="button"
                disabled={Boolean(evaluation)}
                onClick={() => handleChooseAction(act.name)}
                className={`lg:flex-1 min-h-[50px] px-4 py-2.5 rounded-xl border font-extrabold text-xs sm:text-sm transition flex items-center justify-between gap-2 touch-manipulation ${getActionButtonStyle(
                  act.name,
                )} ${
                  picked
                    ? "ring-2 ring-white scale-[1.01]"
                    : evaluation
                      ? "opacity-80"
                      : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/30 border border-white/20 text-[0.625rem] font-mono">
                    {idx + 1}
                  </kbd>
                  <span>{act.name}</span>
                </span>
                {evaluation && (
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-black/35">
                    {Math.round(distFreq * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feedback Instantâneo Pós-Decisão */}
        {evaluation && (
          <div
            role="status"
            className={`trainer-feedback rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
              evaluation.status === "correct"
                ? "bg-[#0D182C] border-[#2563EB] text-[#E0F2FE]"
                : evaluation.status === "mixed"
                  ? "bg-[#1A160B] border-[#F59E0B] text-[#FEF3C7]"
                  : "bg-[#240B12] border-[#DC2626] text-[#FEE2E2]"
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {evaluation.status === "error" ? (
                <XCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#60A5FA] shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="text-xs sm:text-sm font-extrabold">
                  {evaluation.headline} · <span className="font-mono">{handClass}</span>
                </div>
                <p className="text-xs opacity-90">{evaluation.detail}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => dealHandForSpot(currentSpot)}
                className="min-h-[42px] w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 px-4 py-2 text-xs font-extrabold text-white shadow-lg"
              >
                <span>Próxima mão</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Aba Recolhível do Chart 13x13 para Conferir e Fixar o Range */}
      <CollapsiblePanel
        title={`Consultar Matriz 13×13 para Fixar (${currentSpot.heroPosition} · ${handClass})`}
        subtitle="Mantenha recolhida para praticar sem cola, ou expanda para conferir o range completo."
        icon={<Grid3X3 className="w-4 h-4" />}
        tone="blue"
        open={showMatrixPanel}
        onToggle={setShowMatrixPanel}
        badge={
          <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[#05070B] border border-[#26334A] text-[#93C5FD] font-mono">
            {currentSpot.stackBb} BB
          </span>
        }
      >
        <RangeMatrix spot={currentSpot} activeHand={handClass} compact />
      </CollapsiblePanel>
    </div>
  );
}
