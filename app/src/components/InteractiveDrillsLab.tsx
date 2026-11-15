"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Grid,
  Layers,
  Play,
  Scale,
  Target,
  XCircle,
} from "lucide-react";
import {
  cellToHand as getHandClass,
  RANKS as RANK_LABELS,
} from "@/lib/poker/cards";
import type { CanonicalSpot, TrainerModeId } from "@/lib/poker";
import {
  BLOCKER_DRILL_SCENARIOS,
  DAILY_DOSE_MICROLESSONS,
  evaluateBlockerDrill,
  evaluatePotOddsDrill,
  evaluateRangeConstruction,
  evaluateSizingModelComparison,
  extractTargetActionWeights,
  POT_ODDS_DRILL_SCENARIOS,
  type InteractiveModeId,
} from "@/lib/poker/dailyDoseCatalog";

export type InteractiveDrillTabId = InteractiveModeId;

interface InteractiveDrillsLabProps {
  canonicalSpots: CanonicalSpot[];
  initialMode?: InteractiveModeId;
  initialTab?: InteractiveModeId;
  onLaunchSpotInTrainer?: (spotId: string, mode?: TrainerModeId) => void;
  onLaunchSpotInTable?: (spotId: string, mode?: TrainerModeId) => void;
}

const BRUSH_WEIGHTS = [
  { label: "0%", value: 0 },
  { label: "25%", value: 0.25 },
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
] as const;

export function InteractiveDrillsLab({
  canonicalSpots,
  initialMode,
  initialTab,
  onLaunchSpotInTrainer,
  onLaunchSpotInTable,
}: InteractiveDrillsLabProps) {
  const [activeMode, setActiveMode] = useState<InteractiveModeId>(
    initialTab ?? initialMode ?? "range-builder",
  );
  const launchSpot = (spotId: string, mode?: TrainerModeId) => {
    if (onLaunchSpotInTable) onLaunchSpotInTable(spotId, mode);
    else if (onLaunchSpotInTrainer) onLaunchSpotInTrainer(spotId, mode);
  };

  // ==========================================================================
  // A. CONSTRUTOR DE RANGES 13×13
  // ==========================================================================
  const builderSpots = useMemo(
    () =>
      canonicalSpots.filter(
        (s) =>
          s.referenceStrategy.status !== "UNSOLVED" &&
          s.referenceStrategy.matrixFrequencies &&
          Object.keys(s.referenceStrategy.matrixFrequencies).length > 0,
      ),
    [canonicalSpots],
  );

  const [builderSpotId, setBuilderSpotId] = useState<string>(() => {
    const preferred =
      builderSpots.find((s) => s.spotId.includes("ahkd7c")) ??
      builderSpots.find((s) => s.spotId === "30bb_rfi_btn") ??
      builderSpots[0];
    return preferred?.spotId ?? "";
  });

  const activeBuilderSpot = useMemo(
    () => builderSpots.find((s) => s.spotId === builderSpotId) ?? builderSpots[0],
    [builderSpots, builderSpotId],
  );

  const [targetActionName, setTargetActionName] = useState<string>("ACTIVE_NON_FOLD");
  const [brushWeight, setBrushWeight] = useState<number>(1);
  const [userWeights, setUserWeights] = useState<Record<string, number>>({});
  const [isPainting, setIsPainting] = useState(false);
  const [rangeCompared, setRangeCompared] = useState(false);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(false);

  const targetWeights = useMemo(() => {
    if (!activeBuilderSpot?.referenceStrategy.matrixFrequencies) return {};
    return extractTargetActionWeights(
      activeBuilderSpot.referenceStrategy.matrixFrequencies,
      targetActionName,
    );
  }, [activeBuilderSpot, targetActionName]);

  const rangeEval = useMemo(
    () =>
      evaluateRangeConstruction(
        userWeights,
        targetWeights,
        activeBuilderSpot?.board ?? [],
      ),
    [userWeights, targetWeights, activeBuilderSpot],
  );

  const applyCellPaint = (hand: string) => {
    setRangeCompared(false);
    setUserWeights((prev) => {
      const current = prev[hand] ?? 0;
      const next = current === brushWeight ? 0 : brushWeight;
      return { ...prev, [hand]: next };
    });
  };

  const applyQuickPreset = (preset: "pairs" | "broadways" | "ax_suited" | "clear") => {
    setRangeCompared(false);
    setShowReferenceOverlay(false);
    if (preset === "clear") {
      setUserWeights({});
      return;
    }
    const next: Record<string, number> = { ...userWeights };
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const h = getHandClass(r, c);
        if (preset === "pairs" && r === c) next[h] = brushWeight;
        if (preset === "broadways" && r <= 4 && c <= 4) next[h] = brushWeight;
        if (preset === "ax_suited" && r === 0 && c > 0) next[h] = brushWeight;
      }
    }
    setUserWeights(next);
  };

  // ==========================================================================
  // B. TREINO DE POT ODDS
  // ==========================================================================
  const [potOddsScenarioId, setPotOddsScenarioId] = useState<string>(
    POT_ODDS_DRILL_SCENARIOS[1].id,
  );
  const [potBeforeBet, setPotBeforeBet] = useState<number>(
    POT_ODDS_DRILL_SCENARIOS[1].potBeforeBetBb,
  );
  const [villainBet, setVillainBet] = useState<number>(
    POT_ODDS_DRILL_SCENARIOS[1].villainBetBb,
  );
  const [userPotOddsGuess, setUserPotOddsGuess] = useState<number>(20);
  const [potOddsSubmitted, setPotOddsSubmitted] = useState<boolean>(false);
  const [showPotOddsMath, setShowPotOddsMath] = useState<boolean>(false);

  const potOddsEval = useMemo(
    () => evaluatePotOddsDrill(potBeforeBet, villainBet, userPotOddsGuess),
    [potBeforeBet, villainBet, userPotOddsGuess],
  );

  const selectPotOddsScenario = (id: string) => {
    const found = POT_ODDS_DRILL_SCENARIOS.find((s) => s.id === id);
    if (!found) return;
    setPotOddsScenarioId(found.id);
    setPotBeforeBet(found.potBeforeBetBb);
    setVillainBet(found.villainBetBb);
    setPotOddsSubmitted(false);
    setShowPotOddsMath(false);
  };

  // ==========================================================================
  // C. TREINO DE BLOCKERS
  // ==========================================================================
  const [blockerScenarioIdx, setBlockerScenarioIdx] = useState<number>(0);
  const [blockerChoice, setBlockerChoice] = useState<"A" | "B" | null>(null);
  const [showBlockerTable, setShowBlockerTable] = useState<boolean>(false);

  const activeBlockerScenario =
    BLOCKER_DRILL_SCENARIOS[blockerScenarioIdx] ?? BLOCKER_DRILL_SCENARIOS[0];
  const blockerEval = useMemo(
    () => evaluateBlockerDrill(activeBlockerScenario),
    [activeBlockerScenario],
  );

  // ==========================================================================
  // D. TREINO DE SIZINGS
  // ==========================================================================
  const [sizingPot, setSizingPot] = useState<number>(10);
  const [sizingAPct, setSizingAPct] = useState<number>(33);
  const [foldFreqA, setFoldFreqA] = useState<number>(0.32);
  const [eqCalledA, setEqCalledA] = useState<number>(0.54);
  const [sizingBPct, setSizingBPct] = useState<number>(75);
  const [foldFreqB, setFoldFreqB] = useState<number>(0.48);
  const [eqCalledB, setEqCalledB] = useState<number>(0.46);
  const [checkEquity, setCheckEquity] = useState<number>(0.42);
  const [sizingUserChoice, setSizingUserChoice] = useState<
    "SIZING_A" | "SIZING_B" | "CHECK" | null
  >(null);
  const [showSizingMath, setShowSizingMath] = useState<boolean>(false);

  const sizingModel = useMemo(
    () =>
      evaluateSizingModelComparison({
        potBb: sizingPot,
        sizingAPct,
        foldFreqA,
        eqWhenCalledA: eqCalledA,
        sizingBPct,
        foldFreqB,
        eqWhenCalledB: eqCalledB,
        checkEquity,
      }),
    [
      sizingPot,
      sizingAPct,
      foldFreqA,
      eqCalledA,
      sizingBPct,
      foldFreqB,
      eqCalledB,
      checkEquity,
    ],
  );

  // ==========================================================================
  // E. TREINO POR STREET & MICROLIÇÕES DAILY DOSE
  // ==========================================================================
  const [streetFilter, setStreetFilter] = useState<"ALL" | "PREFLOP" | "FLOP" | "TURN" | "RIVER">(
    "FLOP",
  );
  const [matchupFilter, setMatchupFilter] = useState<"ALL" | "BTN_BB" | "SB_BB">("ALL");

  const streetSpots = useMemo(() => {
    return canonicalSpots.filter((s) => {
      if (streetFilter !== "ALL" && s.street !== streetFilter) return false;
      if (matchupFilter === "BTN_BB") {
        const pair = `${s.heroPosition}_${s.villainPosition}`;
        if (pair !== "BTN_BB" && pair !== "BB_BTN") return false;
      }
      if (matchupFilter === "SB_BB") {
        const pair = `${s.heroPosition}_${s.villainPosition}`;
        if (pair !== "SB_BB" && pair !== "BB_SB") return false;
      }
      return true;
    });
  }, [canonicalSpots, streetFilter, matchupFilter]);

  const [activeLessonId, setActiveLessonId] = useState<string>(
    DAILY_DOSE_MICROLESSONS[0].id,
  );
  const [lessonAnswers, setLessonAnswers] = useState<Record<string, number>>({});
  const [lessonExpandWhy, setLessonExpandWhy] = useState<Record<string, boolean>>({});
  const [lessonExpandMath, setLessonExpandMath] = useState<Record<string, boolean>>({});

  const activeLesson = useMemo(
    () =>
      DAILY_DOSE_MICROLESSONS.find((l) => l.id === activeLessonId) ??
      DAILY_DOSE_MICROLESSONS[0],
    [activeLessonId],
  );

  const selectedLessonOption = lessonAnswers[activeLesson.id];
  const isLessonAnswered = selectedLessonOption !== undefined;
  const isLessonCorrect = selectedLessonOption === activeLesson.correctIndex;

  return (
    <div
      className="flex flex-col gap-4"
      onMouseUp={() => setIsPainting(false)}
      onMouseLeave={() => setIsPainting(false)}
    >
      {/* Barra Compacta de Seleção do Treino Interativo */}
      <div className="rounded-xl bg-[#191B1D] border border-[#363A3D] p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Modos de treino interativo">
          {(
            [
              {
                id: "range-builder",
                label: "Construtor de Ranges 13×13",
                icon: <Grid className="w-3.5 h-3.5" />,
              },
              {
                id: "pot-odds",
                label: "Treino de Pot Odds",
                icon: <Calculator className="w-3.5 h-3.5" />,
              },
              {
                id: "blockers",
                label: "Treino de Blockers",
                icon: <Layers className="w-3.5 h-3.5" />,
              },
              {
                id: "sizings",
                label: "Treino de Sizings",
                icon: <Scale className="w-3.5 h-3.5" />,
              },
              {
                id: "streets",
                label: "Decisões por Street",
                icon: <Target className="w-3.5 h-3.5" />,
              },
              {
                id: "microlessons",
                label: "Microlições Daily Dose (12)",
                icon: <BookOpen className="w-3.5 h-3.5" />,
              },
            ] as const
          ).map((tab) => {
            const active = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveMode(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  active
                    ? "bg-[#18B88D] text-[#090B0C] shadow"
                    : "bg-[#202224] text-[#A1A6AA] hover:text-[#F4F5F5] border border-[#363A3D]"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <span className="text-[0.6875rem] font-mono text-[#A1A6AA] px-2">
          Prática ativa · Explicações sob demanda
        </span>
      </div>

      {/* =====================================================================
          MODO A: CONSTRUTOR DE RANGES 13×13 (ESTILO GTO WIZARD IMAGE 03)
      ===================================================================== */}
      {activeMode === "range-builder" && activeBuilderSpot && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Painel Esquerdo: Controles do Construtor */}
          <div className="lg:col-span-5 rounded-xl bg-[#202224] border border-[#363A3D] p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#363A3D] pb-3">
              <div>
                <span className="text-[0.625rem] uppercase tracking-wider font-bold text-[#A1F5AE]">
                  Treino Prático A · Range Builder
                </span>
                <h3 className="text-base font-bold text-[#F4F5F5]">
                  Construa o Range na Grade 13×13
                </h3>
              </div>
              <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-[#292C2F] border border-[#363A3D] text-[#A1F5AE]">
                {activeBuilderSpot.referenceStrategy.status}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="block space-y-1">
                <span className="text-[#A1A6AA] font-semibold">1. Cenário de Referência:</span>
                <select
                  value={activeBuilderSpot.spotId}
                  onChange={(e) => {
                    setBuilderSpotId(e.target.value);
                    setTargetActionName("ACTIVE_NON_FOLD");
                    setRangeCompared(false);
                    setShowReferenceOverlay(false);
                  }}
                  className="w-full rounded-lg bg-[#101112] border border-[#363A3D] px-3 py-2 text-xs text-[#F4F5F5] outline-none focus:border-[#18B88D]"
                >
                  {builderSpots.slice(0, 60).map((s) => (
                    <option key={s.spotId} value={s.spotId}>
                      [{s.referenceStrategy.status === "VERIFIED" ? "VERIFIED" : s.street}]{" "}
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-[#A1A6AA] font-semibold">2. Ação a Construir:</span>
                <select
                  value={targetActionName}
                  onChange={(e) => {
                    setTargetActionName(e.target.value);
                    setRangeCompared(false);
                  }}
                  className="w-full rounded-lg bg-[#101112] border border-[#363A3D] px-3 py-2 text-xs text-[#F4F5F5] outline-none focus:border-[#18B88D]"
                >
                  <option value="ACTIVE_NON_FOLD">
                    Range de Continuidade / Abertura (Todas exceto Fold)
                  </option>
                  {activeBuilderSpot.legalActions.map((act) => (
                    <option key={act.name} value={act.name}>
                      Ação específica: {act.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Pincel de Peso (% 0, 25, 50, 75, 100 — inspirado na Imagem 03) */}
            <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F4F5F5]">
                  Pincel de Frequência:
                </span>
                <span className="font-mono text-[#A1F5AE] font-bold">
                  {Math.round(brushWeight * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {BRUSH_WEIGHTS.map((w) => (
                  <button
                    key={w.label}
                    type="button"
                    onClick={() => setBrushWeight(w.value)}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition ${
                      brushWeight === w.value
                        ? "bg-[#18B88D] border-[#A1F5AE] text-[#090B0C]"
                        : "bg-[#202224] border-[#363A3D] text-[#A1A6AA] hover:text-white"
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => applyQuickPreset("pairs")}
                  className="px-2.5 py-1 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[0.6875rem] text-[#F4F5F5]"
                >
                  + Pares (22–AA)
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPreset("broadways")}
                  className="px-2.5 py-1 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[0.6875rem] text-[#F4F5F5]"
                >
                  + Broadways
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPreset("ax_suited")}
                  className="px-2.5 py-1 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[0.6875rem] text-[#F4F5F5]"
                >
                  + Ax Suited
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickPreset("clear")}
                  className="px-2.5 py-1 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[0.6875rem] text-[#EF6666]"
                >
                  Limpar Grade
                </button>
              </div>
            </div>

            {/* Contagem em tempo real */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg bg-[#101112] border border-[#363A3D] p-2.5">
                <span className="text-[#A1A6AA] block text-[0.6875rem]">Seu Range</span>
                <strong className="text-base font-mono text-[#F4F5F5]">
                  {rangeEval.userWeightedCombos} combos
                </strong>
                <span className="block text-[0.625rem] font-mono text-[#A1A6AA]">
                  {(
                    (rangeEval.userWeightedCombos /
                      Math.max(1, rangeEval.totalAvailableDeckCombos)) *
                    100
                  ).toFixed(1)}
                  % das mãos disponíveis
                </span>
              </div>
              <div className="rounded-lg bg-[#101112] border border-[#363A3D] p-2.5">
                <span className="text-[#A1A6AA] block text-[0.6875rem]">
                  Referência ({rangeCompared ? "Revelada" : "Oculta"})
                </span>
                <strong className="text-base font-mono text-[#A1F5AE]">
                  {rangeCompared
                    ? `${rangeEval.targetWeightedCombos} combos`
                    : "Confirme para ver"}
                </strong>
                <span className="block text-[0.625rem] font-mono text-[#A1A6AA]">
                  {activeBuilderSpot.board.length > 0
                    ? `Board: ${activeBuilderSpot.board.join(" ")}`
                    : `Pré-flop (1326 combos)`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRangeCompared(true)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#18B88D] hover:bg-[#A1F5AE] text-[#090B0C] font-extrabold text-xs transition shadow"
              >
                CONFIRMAR E COMPARAR RANGE
              </button>
              <button
                type="button"
                onClick={() => launchSpot(activeBuilderSpot.spotId)}
                className="py-2.5 px-3 rounded-lg bg-[#292C2F] hover:bg-[#363A3D] text-[#F4F5F5] font-bold text-xs transition"
              >
                Treinar na Mesa
              </button>
            </div>

            {/* Resultado Pós-Confirmação */}
            {rangeCompared && (
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#F4F5F5]">
                    Precisão da Construção:
                  </span>
                  <span className="text-lg font-mono font-extrabold text-[#A1F5AE]">
                    {rangeEval.accuracyPct}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[0.6875rem]">
                  <div className="rounded bg-emerald-950/50 border border-emerald-600/40 p-1.5 text-emerald-200">
                    <strong className="block font-mono text-sm">
                      {rangeEval.matchCount}
                    </strong>
                    Acertos
                  </div>
                  <div className="rounded bg-rose-950/50 border border-rose-600/40 p-1.5 text-rose-200">
                    <strong className="block font-mono text-sm">
                      {rangeEval.overIncluded.length}
                    </strong>
                    Excessos
                  </div>
                  <div className="rounded bg-amber-950/50 border border-amber-600/40 p-1.5 text-amber-200">
                    <strong className="block font-mono text-sm">
                      {rangeEval.underIncluded.length}
                    </strong>
                    Omissões
                  </div>
                </div>

                {rangeEval.overIncluded.length > 0 && (
                  <p className="text-[0.6875rem] text-rose-300">
                    <strong>Principais excessos:</strong>{" "}
                    {rangeEval.overIncluded
                      .slice(0, 8)
                      .map((c) => `${c.hand} (+${Math.round(c.delta * 100)}%)`)
                      .join(", ")}
                  </p>
                )}
                {rangeEval.underIncluded.length > 0 && (
                  <p className="text-[0.6875rem] text-amber-300">
                    <strong>Principais omissões:</strong>{" "}
                    {rangeEval.underIncluded
                      .slice(0, 8)
                      .map((c) => `${c.hand} (${Math.round(c.delta * 100)}%)`)
                      .join(", ")}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setShowReferenceOverlay((v) => !v)}
                  className="w-full py-1.5 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[#A1F5AE] font-semibold"
                >
                  {showReferenceOverlay
                    ? "Voltar para Visão de Diferenças (Acertos/Erros)"
                    : "Mostrar Pesos Exatos da Referência na Grade"}
                </button>
              </div>
            )}
          </div>

          {/* Coluna Direita: Grade 13×13 Interativa */}
          <div className="lg:col-span-7 rounded-xl bg-[#202224] border border-[#363A3D] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#F4F5F5]">
                Clique ou arraste nas células para pintar ({Math.round(brushWeight * 100)}%)
              </span>
              <div className="flex items-center gap-3 text-[0.6875rem] text-[#A1A6AA]">
                <span className="flex items-center gap-1">
                  <i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#18B88D]" /> Selecionado
                </span>
                {rangeCompared && (
                  <>
                    <span className="flex items-center gap-1 text-rose-300">
                      <i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#EF6666]" /> Excesso
                    </span>
                    <span className="flex items-center gap-1 text-amber-300">
                      <i className="inline-block w-2.5 h-2.5 rounded-sm bg-[#F1BE60]" /> Omissão
                    </span>
                  </>
                )}
              </div>
            </div>

            <div
              className="grid gap-[2px] bg-[#090B0C] p-1.5 rounded-xl border border-[#363A3D] select-none"
              style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
            >
              {RANK_LABELS.map((_, r) =>
                RANK_LABELS.map((__, c) => {
                  const hand = getHandClass(r, c);
                  const cellEval = rangeEval.cells[hand];
                  const uWeight = userWeights[hand] ?? 0;
                  const tWeight = targetWeights[hand] ?? 0;
                  const displayWeight =
                    rangeCompared && showReferenceOverlay ? tWeight : uWeight;

                  let borderClass = "border-[#292C2F]";
                  if (rangeCompared && !showReferenceOverlay) {
                    if (cellEval?.status === "over") borderClass = "border-[#EF6666] ring-1 ring-[#EF6666]";
                    else if (cellEval?.status === "under") borderClass = "border-[#F1BE60] ring-1 ring-[#F1BE60]";
                    else if (cellEval?.status === "match" && tWeight > 0)
                      borderClass = "border-[#A1F5AE]";
                  }

                  return (
                    <button
                      key={hand}
                      type="button"
                      onMouseDown={() => {
                        setIsPainting(true);
                        applyCellPaint(hand);
                      }}
                      onMouseEnter={() => {
                        if (isPainting) applyCellPaint(hand);
                      }}
                      style={{
                        background:
                          displayWeight > 0
                            ? `linear-gradient(to top, rgba(24, 184, 141, 0.85) ${displayWeight * 100}%, #191B1D ${displayWeight * 100}%)`
                            : "#191B1D",
                      }}
                      title={`${hand}: Seu peso ${Math.round(uWeight * 100)}%${
                        rangeCompared ? ` | Ref: ${Math.round(tWeight * 100)}%` : ""
                      }`}
                      className={`aspect-square rounded-[3px] border ${borderClass} flex flex-col items-center justify-center text-[0.625rem] sm:text-[0.6875rem] font-mono font-bold text-[#F4F5F5] transition-colors`}
                    >
                      <span>{hand}</span>
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO B: TREINO DE POT ODDS
      ===================================================================== */}
      {activeMode === "pot-odds" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#363A3D] pb-3">
              <div>
                <span className="text-[0.625rem] uppercase tracking-wider font-bold text-[#A1F5AE]">
                  Treino Prático B · Pot Odds &amp; MDF
                </span>
                <h3 className="text-base font-bold text-[#F4F5F5]">
                  Qual a Equidade Mínima para Pagar?
                </h3>
              </div>
              <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-[#292C2F] border border-[#363A3D] text-[#A1F5AE]">
                Fórmula Analítica Exata
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {POT_ODDS_DRILL_SCENARIOS.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => selectPotOddsScenario(sc.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                    potOddsScenarioId === sc.id
                      ? "bg-[#18B88D] border-[#A1F5AE] text-[#090B0C]"
                      : "bg-[#101112] border-[#363A3D] text-[#A1A6AA] hover:text-white"
                  }`}
                >
                  {sc.sizingLabel}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#A1A6AA]">Pote antes da aposta (BB)</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={potBeforeBet}
                  onChange={(e) => {
                    setPotBeforeBet(Math.max(0.5, Number(e.target.value) || 1));
                    setPotOddsSubmitted(false);
                  }}
                  className="w-full rounded-lg bg-[#101112] border border-[#363A3D] px-3 py-2 font-mono text-sm text-[#F4F5F5]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#A1A6AA]">Aposta do vilão (BB)</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={villainBet}
                  onChange={(e) => {
                    setVillainBet(Math.max(0.5, Number(e.target.value) || 1));
                    setPotOddsSubmitted(false);
                  }}
                  className="w-full rounded-lg bg-[#101112] border border-[#363A3D] px-3 py-2 font-mono text-sm text-[#F4F5F5]"
                />
              </label>
            </div>

            <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#F4F5F5] font-semibold">
                  Sua estimativa de Equidade Mínima (%):
                </span>
                <span className="text-lg font-mono font-extrabold text-[#A1F5AE]">
                  {userPotOddsGuess}%
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={0.5}
                value={userPotOddsGuess}
                onChange={(e) => {
                  setUserPotOddsGuess(Number(e.target.value));
                  setPotOddsSubmitted(false);
                }}
                className="w-full accent-[#18B88D]"
              />
              <div className="flex flex-wrap gap-1.5">
                {[16.7, 20, 25, 30, 33.3, 37.5].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setUserPotOddsGuess(preset);
                      setPotOddsSubmitted(false);
                    }}
                    className="px-2.5 py-1 rounded bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] font-mono text-xs text-[#F4F5F5]"
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPotOddsSubmitted(true)}
              className="w-full py-2.5 rounded-lg bg-[#18B88D] hover:bg-[#A1F5AE] text-[#090B0C] font-extrabold text-xs transition"
            >
              VERIFICAR RESPOSTA
            </button>
          </div>

          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            {/* Mesa / Visualização Rápida */}
            <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-5 text-center space-y-2">
              <span className="text-[0.6875rem] font-mono uppercase tracking-wider text-[#A1A6AA]">
                Cenário na Mesa
              </span>
              <div className="text-2xl font-mono font-extrabold text-[#F4F5F5]">
                Pote: {potBeforeBet} BB &rarr; Aposta: {villainBet} BB
              </div>
              <p className="text-xs text-[#A1A6AA]">
                Você precisa pagar <strong className="text-white">{villainBet} BB</strong>{" "}
                para disputar um pote final de{" "}
                <strong className="text-[#A1F5AE]">
                  {potBeforeBet + 2 * villainBet} BB
                </strong>
                .
              </p>
            </div>

            {potOddsSubmitted ? (
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-1 rounded font-bold ${
                      potOddsEval.grade === "EXATO"
                        ? "bg-emerald-950 text-[#A1F5AE] border border-emerald-600/50"
                        : potOddsEval.grade === "APROXIMADO"
                          ? "bg-amber-950 text-[#F1BE60] border border-amber-600/50"
                          : "bg-rose-950 text-[#EF6666] border border-rose-600/50"
                    }`}
                  >
                    {potOddsEval.grade === "EXATO"
                      ? "Boa decisão! Cálculo Exato"
                      : potOddsEval.grade === "APROXIMADO"
                        ? "Muito Próximo"
                        : "Revisar Fórmula"}
                  </span>
                  <span className="font-mono text-sm text-white">
                    Alvo: <strong>{potOddsEval.requiredEquityPct.toFixed(2)}%</strong> | Sua
                    resposta: <strong>{potOddsEval.userGuessPct}%</strong>
                  </span>
                </div>
                <p className="text-[#F4F5F5] leading-relaxed">{potOddsEval.explanation}</p>

                <button
                  type="button"
                  onClick={() => setShowPotOddsMath((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A1F5AE] hover:underline"
                >
                  {showPotOddsMath ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Ver a matemática (Pot Odds vs MDF)
                </button>

                {showPotOddsMath && (
                  <div className="rounded-lg bg-[#191B1D] border border-[#363A3D] p-3 space-y-1.5 font-mono text-[0.6875rem] text-[#A1A6AA]">
                    <p className="text-[#F4F5F5]">{potOddsEval.formula}</p>
                    <p>{potOddsEval.mdfFormula}</p>
                    <p>
                      Fold Equity de Breakeven (blefe 0% eq.):{" "}
                      {potOddsEval.bluffBreakevenPct.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-[#101112] border border-dashed border-[#363A3D] p-6 text-center text-xs text-[#A1A6AA]">
                Escolha o percentual de equidade mínima ao lado e clique em{" "}
                <strong className="text-[#F4F5F5]">Verificar Resposta</strong> para revelar a
                fórmula e o comparativo com o MDF.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO C: TREINO DE BLOCKERS (EXACT_ENUMERATION)
      ===================================================================== */}
      {activeMode === "blockers" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#363A3D] pb-3">
              <div>
                <span className="text-[0.625rem] uppercase tracking-wider font-bold text-[#A1F5AE]">
                  Treino Prático C · Remoção de Cartas
                </span>
                <h3 className="text-base font-bold text-[#F4F5F5]">
                  Qual Mão Bloqueia Mais o Range-Alvo?
                </h3>
              </div>
              <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-600/40 text-[#A1F5AE]">
                EXACT_ENUMERATION
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {BLOCKER_DRILL_SCENARIOS.map((sc, idx) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setBlockerScenarioIdx(idx);
                    setBlockerChoice(null);
                    setShowBlockerTable(false);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                    blockerScenarioIdx === idx
                      ? "bg-[#18B88D] border-[#A1F5AE] text-[#090B0C]"
                      : "bg-[#101112] border-[#363A3D] text-[#A1A6AA] hover:text-white"
                  }`}
                >
                  Cenário {idx + 1}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3.5 space-y-2 text-xs">
              <div className="font-bold text-[#F4F5F5]">{activeBlockerScenario.title}</div>
              <p className="text-[#A1A6AA]">{activeBlockerScenario.contextShort}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[0.6875rem]">
                <span className="px-2 py-0.5 rounded bg-[#202224] border border-[#363A3D] text-[#A1F5AE]">
                  Board: {activeBlockerScenario.board.join(" ")}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#202224] border border-[#363A3D] text-[#F4F5F5]">
                  Alvo: {activeBlockerScenario.targetRangeLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["A", "B"] as const).map((side) => {
                const cand =
                  side === "A"
                    ? activeBlockerScenario.candidateA
                    : activeBlockerScenario.candidateB;
                const selected = blockerChoice === side;
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setBlockerChoice(side)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selected
                        ? "bg-[#18B88D]/20 border-[#18B88D] text-[#F4F5F5]"
                        : "bg-[#101112] border-[#363A3D] text-[#A1A6AA] hover:border-[#A1F5AE]"
                    }`}
                  >
                    <span className="text-[0.625rem] font-mono uppercase text-[#A1F5AE] block">
                      Candidata {side}
                    </span>
                    <strong className="text-base font-bold text-[#F4F5F5] block mt-0.5">
                      {cand.label}
                    </strong>
                    <span className="text-xs font-mono text-[#A1A6AA]">
                      Cartas: {cand.cards.join(" ")} ({cand.handClass})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            {blockerChoice ? (
              <div className="space-y-3 text-xs">
                <div
                  className={`rounded-xl border p-3.5 ${
                    blockerChoice === blockerEval.betterBlocker
                      ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-100"
                      : "bg-amber-950/40 border-amber-600/50 text-amber-100"
                  }`}
                >
                  <strong className="text-sm block mb-1">
                    {blockerChoice === blockerEval.betterBlocker
                      ? "Boa decisão! Você identificou o bloqueador mais forte."
                      : `A Candidata ${blockerEval.betterBlocker} remove mais combinações do range-alvo.`}
                  </strong>
                  <p>
                    Fora do board ({blockerEval.boardCombosOnly} combos), a{" "}
                    <strong>Candidata A</strong> reduz o alvo para{" "}
                    <strong>
                      {blockerEval.candidateARemaining} combos (-
                      {blockerEval.candidateAReductionPct}%)
                    </strong>
                    , enquanto a <strong>Candidata B</strong> deixa{" "}
                    <strong>
                      {blockerEval.candidateBRemaining} combos (-
                      {blockerEval.candidateBReductionPct}%)
                    </strong>
                    .
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBlockerTable((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A1F5AE] hover:underline"
                >
                  {showBlockerTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Ver contagem exata por classe de mão
                </button>

                {showBlockerTable && (
                  <div className="overflow-x-auto rounded-lg border border-[#363A3D] bg-[#101112]">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#363A3D] text-[#A1A6AA]">
                          <th className="p-2">Classe</th>
                          <th className="p-2">Só Board</th>
                          <th className="p-2">Com Mão A</th>
                          <th className="p-2">Com Mão B</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blockerEval.perClassBreakdown.map((row) => (
                          <tr key={row.handClass} className="border-b border-[#292C2F]">
                            <td className="p-2 font-bold text-[#F4F5F5]">{row.handClass}</td>
                            <td className="p-2 text-[#A1A6AA]">{row.boardOnly}</td>
                            <td className="p-2 text-[#A1F5AE]">{row.withA}</td>
                            <td className="p-2 text-[#F1BE60]">{row.withB}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-[0.6875rem] text-[#A1A6AA] italic">
                  {activeBlockerScenario.strategicCaveat}
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-[#101112] border border-dashed border-[#363A3D] p-6 text-center text-xs text-[#A1A6AA]">
                Selecione a <strong className="text-white">Candidata A</strong> ou a{" "}
                <strong className="text-white">Candidata B</strong> ao lado para comparar a
                remoção exata de combinações (`cards.ts`).
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO D: TREINO DE SIZINGS (MODEL_BASED_EV)
      ===================================================================== */}
      {activeMode === "sizings" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#363A3D] pb-3">
              <div>
                <span className="text-[0.625rem] uppercase tracking-wider font-bold text-[#A1F5AE]">
                  Treino Prático D · Comparação de Sizings
                </span>
                <h3 className="text-base font-bold text-[#F4F5F5]">
                  Sizing Pequeno vs Sizing Grande (EV Modelado)
                </h3>
              </div>
              <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/40 text-[#F1BE60]">
                MODEL_BASED_EV (Não é Solver)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#A1A6AA]">Pote Inicial (BB): {sizingPot}</span>
                <input
                  type="range"
                  min={2}
                  max={50}
                  step={1}
                  value={sizingPot}
                  onChange={(e) => setSizingPot(Number(e.target.value))}
                  className="w-full accent-[#18B88D]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#A1A6AA]">
                  Equidade em Check: {Math.round(checkEquity * 100)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={checkEquity}
                  onChange={(e) => setCheckEquity(Number(e.target.value))}
                  className="w-full accent-[#18B88D]"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3 space-y-2">
                <div className="font-bold text-[#A1F5AE]">
                  Sizing A: {sizingAPct}% Pote ({sizingModel.betABb} BB)
                </div>
                <label className="block">
                  <span className="text-[#A1A6AA]">Sizing A (%): {sizingAPct}%</span>
                  <input
                    type="range"
                    min={20}
                    max={150}
                    step={5}
                    value={sizingAPct}
                    onChange={(e) => setSizingAPct(Number(e.target.value))}
                    className="w-full accent-[#18B88D]"
                  />
                </label>
                <label className="block">
                  <span className="text-[#A1A6AA]">
                    Fold do Vilão: {Math.round(foldFreqA * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.95}
                    step={0.02}
                    value={foldFreqA}
                    onChange={(e) => setFoldFreqA(Number(e.target.value))}
                    className="w-full accent-[#18B88D]"
                  />
                </label>
                <label className="block">
                  <span className="text-[#A1A6AA]">
                    Eq. quando pago: {Math.round(eqCalledA * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={eqCalledA}
                    onChange={(e) => setEqCalledA(Number(e.target.value))}
                    className="w-full accent-[#18B88D]"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3 space-y-2">
                <div className="font-bold text-[#F1BE60]">
                  Sizing B: {sizingBPct}% Pote ({sizingModel.betBBb} BB)
                </div>
                <label className="block">
                  <span className="text-[#A1A6AA]">Sizing B (%): {sizingBPct}%</span>
                  <input
                    type="range"
                    min={20}
                    max={150}
                    step={5}
                    value={sizingBPct}
                    onChange={(e) => setSizingBPct(Number(e.target.value))}
                    className="w-full accent-[#F1BE60]"
                  />
                </label>
                <label className="block">
                  <span className="text-[#A1A6AA]">
                    Fold do Vilão: {Math.round(foldFreqB * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.95}
                    step={0.02}
                    value={foldFreqB}
                    onChange={(e) => setFoldFreqB(Number(e.target.value))}
                    className="w-full accent-[#F1BE60]"
                  />
                </label>
                <label className="block">
                  <span className="text-[#A1A6AA]">
                    Eq. quando pago: {Math.round(eqCalledB * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={eqCalledB}
                    onChange={(e) => setEqCalledB(Number(e.target.value))}
                    className="w-full accent-[#F1BE60]"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <span className="font-semibold text-[#F4F5F5] block">
                Qual linha entrega o maior EV sob esses parâmetros?
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "SIZING_A", label: `Sizing A (${sizingAPct}%)` },
                    { id: "SIZING_B", label: `Sizing B (${sizingBPct}%)` },
                    { id: "CHECK", label: "Check" },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setSizingUserChoice(btn.id)}
                    className={`py-2 rounded-lg font-bold border transition ${
                      sizingUserChoice === btn.id
                        ? "bg-[#18B88D] border-[#A1F5AE] text-[#090B0C]"
                        : "bg-[#101112] border-[#363A3D] text-[#F4F5F5]"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3">
                <span className="text-[#A1A6AA] block text-[0.6875rem]">
                  EV Sizing A ({sizingAPct}%)
                </span>
                <strong className="text-lg font-mono text-[#A1F5AE]">
                  {sizingModel.evABb >= 0 ? "+" : ""}
                  {sizingModel.evABb.toFixed(2)} BB
                </strong>
                <span className="block text-[0.625rem] font-mono text-[#A1A6AA]">
                  FE min: {sizingModel.breakevenFoldAPct}%
                </span>
              </div>
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3">
                <span className="text-[#A1A6AA] block text-[0.6875rem]">
                  EV Sizing B ({sizingBPct}%)
                </span>
                <strong className="text-lg font-mono text-[#F1BE60]">
                  {sizingModel.evBBb >= 0 ? "+" : ""}
                  {sizingModel.evBBb.toFixed(2)} BB
                </strong>
                <span className="block text-[0.625rem] font-mono text-[#A1A6AA]">
                  FE min: {sizingModel.breakevenFoldBPct}%
                </span>
              </div>
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-3">
                <span className="text-[#A1A6AA] block text-[0.6875rem]">EV Check</span>
                <strong className="text-lg font-mono text-[#F4F5F5]">
                  +{sizingModel.evCheckBb.toFixed(2)} BB
                </strong>
                <span className="block text-[0.625rem] font-mono text-[#A1A6AA]">
                  Δ A vs B: {sizingModel.deltaEvBb.toFixed(2)} BB
                </span>
              </div>
            </div>

            {sizingUserChoice && (
              <div
                className={`rounded-xl border p-3 text-xs ${
                  sizingUserChoice === sizingModel.recommendedByModel
                    ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-100"
                    : "bg-amber-950/40 border-amber-600/50 text-amber-100"
                }`}
              >
                <strong>
                  {sizingUserChoice === sizingModel.recommendedByModel
                    ? "Boa leitura!"
                    : "Compare os números do modelo:"}
                </strong>{" "}
                Neste modelo de decisão única (`MODEL_BASED_EV`), a maior expectativa é{" "}
                <strong>{sizingModel.recommendedByModel}</strong>.
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSizingMath((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#A1F5AE] hover:underline"
            >
              {showSizingMath ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Ver nota metodológica (EV modelado vs Solver GTO)
            </button>

            {showSizingMath && (
              <p className="rounded-lg bg-[#101112] border border-[#363A3D] p-3 text-[0.6875rem] text-[#A1A6AA] leading-relaxed">
                <strong>Aviso Epistemológico (MODEL_BASED_EV):</strong> Este simulador calcula{" "}
                <code>EV(Bet) = f·P + (1-f)·[Eq_call·(P + 2B) - B]</code> a partir das
                frequências de fold e equidade informadas. Não representa uma árvore de solver
                em equilíbrio de Nash.
              </p>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO E: TREINO DE DECISÕES POR STREET (PRÉ, FLOP, TURN, RIVER)
      ===================================================================== */}
      {activeMode === "streets" && (
        <div className="rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#363A3D] pb-3">
            <div>
              <span className="text-[0.625rem] uppercase tracking-wider font-bold text-[#A1F5AE]">
                Treino Prático E · Decisões por Street
              </span>
              <h3 className="text-base font-bold text-[#F4F5F5]">
                Escolha a Street e o Confronto para Praticar na Mesa
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-[#101112] border border-[#363A3D] rounded-lg p-1">
                {(
                  [
                    { id: "ALL", label: "Todas" },
                    { id: "PREFLOP", label: "Pré-flop" },
                    { id: "FLOP", label: "Flop" },
                    { id: "TURN", label: "Turn" },
                    { id: "RIVER", label: "River" },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStreetFilter(st.id)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                      streetFilter === st.id
                        ? "bg-[#18B88D] text-[#090B0C]"
                        : "text-[#A1A6AA] hover:text-white"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-[#101112] border border-[#363A3D] rounded-lg p-1">
                {(
                  [
                    { id: "ALL", label: "Todas Posições" },
                    { id: "BTN_BB", label: "BTN vs BB" },
                    { id: "SB_BB", label: "SB vs BB" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMatchupFilter(m.id)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                      matchupFilter === m.id
                        ? "bg-[#292C2F] text-[#A1F5AE]"
                        : "text-[#A1A6AA] hover:text-white"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {streetSpots.slice(0, 15).map((spot) => {
              const isVerified = spot.referenceStrategy.status === "VERIFIED";
              return (
                <div
                  key={spot.spotId}
                  className="rounded-xl bg-[#101112] border border-[#363A3D] p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[0.625rem] font-mono font-bold px-2 py-0.5 rounded border ${
                          isVerified
                            ? "bg-emerald-950/60 border-emerald-500/50 text-[#A1F5AE]"
                            : "bg-[#202224] border-[#363A3D] text-[#A1A6AA]"
                        }`}
                      >
                        {spot.referenceStrategy.status}
                      </span>
                      <span className="text-[0.6875rem] font-mono text-[#A1A6AA]">
                        {spot.street} · {spot.effectiveStackBb} BB
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-[#F4F5F5]">{spot.name}</h4>
                    <p className="text-[0.6875rem] text-[#A1A6AA]">
                      Herói: <strong className="text-white">{spot.heroPosition}</strong> vs{" "}
                      {spot.villainPosition}
                      {spot.board.length > 0 ? ` · Board: ${spot.board.join(" ")}` : ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      launchSpot(
                        spot.spotId,
                        isVerified ? "GTO_TECHNICAL" : "LEARNING",
                      )
                    }
                    className="w-full py-2 rounded-lg bg-[#18B88D] hover:bg-[#A1F5AE] text-[#090B0C] font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Treinar Spot Agora
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODO F: MICROLIÇÕES INTERATIVAS DAILY DOSE OF GTO (12 LIÇÕES)
      ===================================================================== */}
      {activeMode === "microlessons" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Lista compacta das 12 microlições */}
          <div className="lg:col-span-4 rounded-xl bg-[#202224] border border-[#363A3D] p-3 space-y-1.5 max-h-[560px] overflow-y-auto">
            <div className="px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-[#A1F5AE]">
              Daily Dose of GTO · 12 Microlições Práticas
            </div>
            {DAILY_DOSE_MICROLESSONS.map((lesson) => {
              const active = lesson.id === activeLesson.id;
              const answered = lessonAnswers[lesson.id] !== undefined;
              const right = lessonAnswers[lesson.id] === lesson.correctIndex;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setActiveLessonId(lesson.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition text-xs ${
                    active
                      ? "bg-[#18B88D]/20 border-[#18B88D] text-[#F4F5F5]"
                      : "bg-[#101112] border-[#363A3D] text-[#A1A6AA] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[#A1F5AE]">{lesson.id}</span>
                    <span className="text-[0.625rem] font-mono text-[#A1A6AA]">
                      {lesson.bookPages}
                    </span>
                  </div>
                  <div className="font-bold text-[#F4F5F5] mt-0.5 line-clamp-1">
                    {lesson.title}
                  </div>
                  <div className="flex items-center justify-between text-[0.625rem] mt-1">
                    <span>{lesson.formatLabel}</span>
                    {answered && (
                      <span className={right ? "text-[#A1F5AE]" : "text-[#F1BE60]"}>
                        {right ? "✓ Concluída" : "Revisar"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Card interativo da microlição (Máximo de 3 frases antes da pergunta!) */}
          <div className="lg:col-span-8 rounded-xl bg-[#202224] border border-[#363A3D] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#363A3D] pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.625rem] font-mono font-bold px-2 py-0.5 rounded bg-[#101112] border border-[#363A3D] text-[#A1F5AE]">
                    {activeLesson.formatLabel}
                  </span>
                  <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-[#292C2F] text-[#F4F5F5]">
                    {activeLesson.evidenceBadge}
                  </span>
                  <span className="text-[0.6875rem] font-mono text-[#A1A6AA]">
                    Ref. PDF: {activeLesson.bookChapter} ({activeLesson.bookPages})
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#F4F5F5] mt-1">
                  {activeLesson.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => launchSpot(activeLesson.linkedSpotId)}
                className="px-3 py-1.5 rounded-lg bg-[#18B88D] hover:bg-[#A1F5AE] text-[#090B0C] font-extrabold text-xs flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Praticar na Mesa
              </button>
            </div>

            {/* Cenário Visual Compacto + Máx 3 frases */}
            <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span className="text-[#A1F5AE] font-bold">
                  {activeLesson.tableVisual.actionLine}
                </span>
                <span className="text-[#A1A6AA]">
                  Stack: {activeLesson.tableVisual.effectiveStackBb} BB · Pote:{" "}
                  {activeLesson.tableVisual.potBb} BB
                </span>
              </div>
              {activeLesson.tableVisual.board.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-[#A1A6AA]">Board:</span>
                  {activeLesson.tableVisual.board.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-0.5 rounded bg-[#202224] border border-[#363A3D] font-bold text-white"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs sm:text-sm text-[#F4F5F5] leading-relaxed">
                {activeLesson.shortContext}
              </p>
            </div>

            {/* Pergunta Interativa Imediata */}
            <div className="space-y-2.5">
              <h4 className="text-sm font-bold text-[#F4F5F5]">{activeLesson.question}</h4>
              <div className="space-y-2">
                {activeLesson.options.map((opt, idx) => {
                  const chosen = selectedLessonOption === idx;
                  const isCorrectOpt = idx === activeLesson.correctIndex;
                  let styleCls =
                    "bg-[#101112] border-[#363A3D] text-[#F4F5F5] hover:border-[#A1F5AE]";
                  if (isLessonAnswered) {
                    if (isCorrectOpt) {
                      styleCls = "bg-emerald-950/60 border-[#18B88D] text-[#A1F5AE]";
                    } else if (chosen) {
                      styleCls = "bg-rose-950/60 border-[#EF6666] text-rose-200";
                    }
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setLessonAnswers((prev) => ({
                          ...prev,
                          [activeLesson.id]: idx,
                        }))
                      }
                      className={`w-full text-left rounded-xl border p-3.5 text-xs sm:text-sm transition flex items-start gap-2.5 ${styleCls}`}
                    >
                      <span className="font-mono font-bold text-[#A1A6AA]">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feedback e Revelação Progressiva SOMENTE APÓS A RESPOSTA */}
            {isLessonAnswered && (
              <div className="rounded-xl bg-[#101112] border border-[#363A3D] p-4 space-y-3 text-xs">
                <div className="flex items-start gap-2">
                  {isLessonCorrect ? (
                    <CheckCircle2 className="w-5 h-5 text-[#A1F5AE] shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-[#F1BE60] shrink-0" />
                  )}
                  <div>
                    <strong className="text-sm text-[#F4F5F5] block">
                      {isLessonCorrect ? "Boa decisão!" : "Revisar o conceito:"}
                    </strong>
                    <p className="text-[#F4F5F5] mt-0.5 leading-relaxed">
                      {activeLesson.conciseFeedback}
                    </p>
                  </div>
                </div>

                {/* Botões de Revelação Progressiva */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#292C2F]">
                  <button
                    type="button"
                    onClick={() =>
                      setLessonExpandWhy((p) => ({
                        ...p,
                        [activeLesson.id]: !p[activeLesson.id],
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[#A1F5AE] font-bold flex items-center gap-1"
                  >
                    {lessonExpandWhy[activeLesson.id] ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    Entenda o motivo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLessonExpandMath((p) => ({
                        ...p,
                        [activeLesson.id]: !p[activeLesson.id],
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[#F1BE60] font-bold flex items-center gap-1"
                  >
                    {lessonExpandMath[activeLesson.id] ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    Ver a matemática
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMode(activeLesson.linkedInteractiveMode)}
                    className="px-3 py-1.5 rounded-lg bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] text-[#F4F5F5] font-semibold"
                  >
                    Abrir Laboratório Relacionado
                  </button>
                </div>

                {lessonExpandWhy[activeLesson.id] && (
                  <div className="rounded-lg bg-[#191B1D] border border-[#363A3D] p-3 text-[#F4F5F5] leading-relaxed">
                    <strong className="text-[#A1F5AE] block mb-1">
                      Por que isso acontece ({activeLesson.originalTopic}):
                    </strong>
                    {activeLesson.whyExplanation}
                  </div>
                )}

                {lessonExpandMath[activeLesson.id] && (
                  <div className="rounded-lg bg-[#191B1D] border border-[#363A3D] p-3 font-mono text-[#F1BE60] leading-relaxed">
                    {activeLesson.mathBreakdown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
