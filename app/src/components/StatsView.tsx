"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Compass,
  Gauge,
  Layers,
  Repeat,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import {
  type AdaptiveExerciseRecord,
  classifyAndRankLeaks,
  computeDimensionalProgress,
  computeSpacedRepetitionSchedule,
  type DimensionProgressItem,
  POSITIONS_8MAX,
  rankLeakSpots,
  type StrategyStatus,
  type StrategyUnit,
  type TrainerModeId,
} from "@/lib/poker";

export interface HandHistoryItem {
  id: string;
  timestamp: number;
  spotId: string;
  spotName: string;
  stackBb: number;
  heroPosition: string;
  spotType: string;
  hand: string;
  chosenAction: string;
  bestAction: string;
  status: "correct" | "mixed" | "error" | "unsolved";
  chosenFreq: number;
  evLoss?: number | null;
  evUnit?: StrategyUnit | null;
  strategyStatus?: StrategyStatus;
}

interface StatsViewProps {
  history: HandHistoryItem[];
  adaptiveRecords?: AdaptiveExerciseRecord[];
  onClearHistory: () => void;
  onPracticeSpot?: (spotId: string, preferredMode?: TrainerModeId) => void;
}

const HEATMAP_STACKS = [14, 17, 20, 30, 50, 100];

const SPOT_TYPE_LABELS: { key: string; label: string }[] = [
  { key: "rfi", label: "RFI (Open Raise)" },
  { key: "vs_rfi", label: "vs RFI (Call / 3-Bet)" },
  { key: "vs_limp", label: "BB vs SB Limp" },
  { key: "flop_cbet_ip", label: "Flop C-Bet IP vs BB" },
  { key: "bb_vs_cbet", label: "BB vs C-Bet" },
  { key: "river_polarized_bet", label: "River Polarizado" },
  { key: "push_fold", label: "Spin Push/Fold" },
  { key: "vs_shove", label: "Spin vs Shove" },
];

type DimensionTab = "position" | "stack" | "format" | "street";

function renderDimensionTable(items: DimensionProgressItem[], emptyLabel: string) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-slate-500 py-4 text-center">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-slate-400 border-b border-slate-800">
            <th className="py-2 px-2">Dimensão</th>
            <th className="py-2 px-2 text-right">Exercícios</th>
            <th className="py-2 px-2 text-right">Precisão Aceitável</th>
            <th className="py-2 px-2 text-right">EV Loss Médio</th>
            <th className="py-2 px-2 text-right">Confiança Alta</th>
            <th className="py-2 px-2 text-right">Qualidade da Amostra</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.key}
              className="border-b border-slate-800/60 hover:bg-slate-800/30"
            >
              <td className="py-2 px-2 font-bold text-slate-200">{item.label}</td>
              <td className="py-2 px-2 text-right font-mono text-slate-300">
                {item.attempts}
              </td>
              <td className="py-2 px-2 text-right font-mono">
                <span
                  className={`font-bold ${
                    item.accuracyPct >= 80
                      ? "text-emerald-400"
                      : item.accuracyPct >= 60
                        ? "text-amber-300"
                        : "text-rose-400"
                  }`}
                >
                  {item.accuracyPct.toFixed(1)}%
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono text-amber-300">
                {item.avgEvLoss !== null
                  ? `${item.avgEvLoss.toFixed(3)} (${item.evLossCount})`
                  : "—"}
              </td>
              <td className="py-2 px-2 text-right font-mono text-indigo-300">
                {item.highConfidencePct.toFixed(0)}%
              </td>
              <td className="py-2 px-2 text-right">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    item.sampleConfidence.startsWith("amostra_solida")
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                      : item.sampleConfidence.startsWith("amostra_em_formacao")
                        ? "bg-amber-950/80 text-amber-300 border border-amber-700/50"
                        : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {item.sampleConfidence}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatsView({
  history,
  adaptiveRecords = [],
  onClearHistory,
  onPracticeSpot,
}: StatsViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [dimensionTab, setDimensionTab] = useState<DimensionTab>("position");

  const effectiveAdaptiveRecords = useMemo<AdaptiveExerciseRecord[]>(() => {
    if (adaptiveRecords.length > 0) return adaptiveRecords;
    return history.map((h) => ({
      attemptId: h.id,
      timestamp: h.timestamp,
      trainerMode: h.strategyStatus === "VERIFIED" ? "GTO_TECHNICAL" : "LEARNING",
      spotId: h.spotId,
      spotName: h.spotName,
      trackId: "PREFLOP_RFI",
      spotType: h.spotType,
      handClass: h.hand,
      chosenAction: h.chosenAction,
      referenceStrategySummary: {
        status: h.strategyStatus ?? "IMPORTED_CHART_NO_EV",
        dominantAction: h.bestAction,
        dominantFreq: null,
        chosenFreq: h.chosenFreq,
        actionFrequencies: null,
        actionEv: null,
      },
      evLoss: h.evLoss ?? null,
      evUnit: h.evUnit ?? null,
      confidenceLevel: "media",
      heroPosition: h.heroPosition,
      effectiveStackBb: h.stackBb,
      tournamentFormat: h.spotId.startsWith("spin_")
        ? "SNG_SPIN"
        : h.spotId.includes("pko")
          ? "PKO"
          : h.spotId.includes("icm")
            ? "MTT_ICM"
            : "MTT_CHEV",
      street: h.spotId.includes("river")
        ? "RIVER"
        : h.spotId.includes("flop") || h.spotId.includes("cbet")
          ? "FLOP"
          : "PREFLOP",
      classification:
        h.status === "correct"
          ? "exact_primary"
          : h.status === "mixed"
            ? "valid_mixed"
            : h.status === "unsolved"
              ? "unsolved"
              : "ev_error",
      isAcceptable: h.status !== "error",
      leakCategory: h.status === "error" ? "preflop_rfi_deviation" : null,
    }));
  }, [adaptiveRecords, history]);

  const adaptiveAnalysis = useMemo(() => {
    const refNowMs =
      effectiveAdaptiveRecords[0]?.timestamp ??
      history[0]?.timestamp ??
      1794500000000;
    const classifiedLeaks = classifyAndRankLeaks(effectiveAdaptiveRecords);
    const spacedSchedule = computeSpacedRepetitionSchedule(
      effectiveAdaptiveRecords,
      refNowMs,
    );
    const dimensionalProgress = computeDimensionalProgress(
      effectiveAdaptiveRecords,
    );
    return {
      classifiedLeaks,
      spacedSchedule,
      dimensionalProgress,
    };
  }, [effectiveAdaptiveRecords, history]);

  const summary = useMemo(() => {
    const scored = history.filter((h) => h.status !== "unsolved");
    const total = scored.length;
    const exact = scored.filter((h) => h.status === "correct").length;
    const mixed = scored.filter((h) => h.status === "mixed").length;
    const errors = scored.filter((h) => h.status === "error").length;
    const unsolvedCount = history.length - total;

    const accuracy =
      total > 0 ? Math.round(((exact + mixed) / total) * 100) : 0;

    // EV loss agregado separando unidades (bbEV vs $EV)
    const bbLossItems = scored.filter(
      (h) => typeof h.evLoss === "number" && h.evUnit === "bbEV",
    );
    const totalBbLoss = bbLossItems.reduce((acc, h) => acc + (h.evLoss ?? 0), 0);
    const avgBbLoss =
      bbLossItems.length > 0 ? totalBbLoss / bbLossItems.length : null;

    const usdLossItems = scored.filter(
      (h) => typeof h.evLoss === "number" && h.evUnit === "$EV",
    );
    const totalUsdLoss = usdLossItems.reduce((acc, h) => acc + (h.evLoss ?? 0), 0);
    const avgUsdLoss =
      usdLossItems.length > 0 ? totalUsdLoss / usdLossItems.length : null;

    const byPos: Record<string, { ok: number; total: number }> = {};
    const byType: Record<string, { ok: number; total: number }> = {};
    const byCell: Record<string, { ok: number; total: number }> = {};

    for (const h of scored) {
      const ok = h.status !== "error" ? 1 : 0;
      if (!byPos[h.heroPosition]) byPos[h.heroPosition] = { ok: 0, total: 0 };
      byPos[h.heroPosition].ok += ok;
      byPos[h.heroPosition].total += 1;

      if (!byType[h.spotType]) byType[h.spotType] = { ok: 0, total: 0 };
      byType[h.spotType].ok += ok;
      byType[h.spotType].total += 1;

      const roundedStack = Math.round(h.stackBb);
      const cellKey = `${h.heroPosition}_${roundedStack}`;
      if (!byCell[cellKey]) byCell[cellKey] = { ok: 0, total: 0 };
      byCell[cellKey].ok += ok;
      byCell[cellKey].total += 1;
    }

    const posEntries = Object.entries(byPos)
      .filter(([, v]) => v.total > 0)
      .map(([pos, v]) => ({
        pos,
        pct: Math.round((v.ok / v.total) * 100),
        total: v.total,
      }))
      .sort((a, b) => b.pct - a.pct);

    const bestPos = posEntries[0] ?? null;
    const worstPos =
      posEntries.length > 0 ? posEntries[posEntries.length - 1] : null;

    const adaptiveLeaks = rankLeakSpots(
      scored.map((h) => ({
        spotId: h.spotId,
        evLoss: h.evLoss ?? null,
        isError: h.status === "error",
      })),
    ).slice(0, 5);

    const spotNames = new Map(history.map((h) => [h.spotId, h.spotName]));

    return {
      total,
      unsolvedCount,
      exact,
      mixed,
      errors,
      accuracy,
      avgBbLoss,
      bbLossSample: bbLossItems.length,
      avgUsdLoss,
      usdLossSample: usdLossItems.length,
      byPos,
      byType,
      byCell,
      bestPos,
      worstPos,
      adaptiveLeaks,
      spotNames,
    };
  }, [history]);

  if (history.length === 0 && effectiveAdaptiveRecords.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-10 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-emerald-400">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">
          Nenhum exercício registrado ainda
        </h2>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          Jogue algumas mãos na aba <strong>Modo Trainer</strong> para alimentar o{" "}
          <strong>Diagnóstico Adaptativo (Etapa 5)</strong>: histórico persistente com
          nível de confiança, taxonomia de leaks por frequência/impacto, repetição
          espaçada (Leitner) e progresso multidimensional.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Mãos Pontuadas
          </div>
          <div className="text-2xl font-extrabold text-slate-100 mt-1">
            {summary.total}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.exact} princ. · {summary.mixed} mix · {summary.errors} desvios
            {summary.unsolvedCount > 0 ? ` · ${summary.unsolvedCount} unsolved` : ""}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Aderência Válida
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            {summary.accuracy}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Inclui estratégias mistas válidas (+EV)
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            EV Loss Médio
          </div>
          <div className="text-xl font-extrabold text-amber-300 mt-1 font-mono">
            {summary.avgBbLoss !== null
              ? `${summary.avgBbLoss.toFixed(3)} bb`
              : summary.avgUsdLoss !== null
                ? `${summary.avgUsdLoss.toFixed(3)} $EV`
                : "—"}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.bbLossSample > 0
              ? `${summary.bbLossSample} mãos bbEV`
              : summary.usdLossSample > 0
                ? `${summary.usdLossSample} mãos $EV`
                : "Jogue spots com EV"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Proveniência Verificada
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 mt-1 font-mono">
            {adaptiveAnalysis.dimensionalProgress.provenanceCompletenessPct.toFixed(0)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Proporção jogada em spots VERIFIED
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            Maior Leak por Posição
          </div>
          <div className="text-2xl font-extrabold text-rose-300 mt-1">
            {summary.worstPos
              ? `${summary.worstPos.pos} (${summary.worstPos.pct}%)`
              : "—"}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary.worstPos ? `${summary.worstPos.total} mãos jogadas` : ""}
          </div>
        </div>
      </div>

      {/* ETAPA 5 (Item 3): Classificação Taxonômica de Leaks por Frequência, Impacto e Confiança */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-rose-400" />
            Diagnóstico Taxonômico de Leaks (Frequência &times; Impacto de EV &times; Ponto Cego de Confiança)
          </h3>
          <span className="text-[11px] text-slate-400">
            Erros com confiança &ldquo;alta&rdquo; recebem peso 1.35&times; (ponto cego)
          </span>
        </div>

        {adaptiveAnalysis.classifiedLeaks.length === 0 ? (
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Nenhum leak classificado até o momento. Continue praticando para gerar o ranking taxonômico de desvios.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {adaptiveAnalysis.classifiedLeaks.map((leak, idx) => (
              <div
                key={leak.leakCategory}
                className="rounded-xl bg-slate-950/90 border border-slate-800 p-3.5 flex flex-col justify-between gap-2.5 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      #{idx + 1} · Impacto {leak.impactScore.toFixed(3)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {leak.occurrences} erro(s) ({Math.round(leak.frequencyOfTotalErrors * 100)}%)
                    </span>
                  </div>
                  <div className="font-bold text-slate-100 text-sm">
                    {leak.label}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {leak.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>EV Loss médio:</span>
                    <strong className="font-mono text-amber-300">
                      {leak.avgEvLoss !== null ? `${leak.avgEvLoss.toFixed(3)}` : "Sem EV"}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Pontos cegos (conf. alta):</span>
                    <strong
                      className={`font-mono ${
                        leak.blindSpotCount > 0 ? "text-rose-400" : "text-slate-400"
                      }`}
                    >
                      {leak.blindSpotCount}
                    </strong>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    Spots: {leak.topAffectedSpots.join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ETAPA 5 (Item 4): Fila de Repetição Espaçada (Leitner Adaptativo) */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-emerald-400" />
            Agenda de Repetição Espaçada (Sistema Leitner Adaptativo · Caixas 0 a 5)
          </h3>
          <span className="text-[11px] text-slate-400">
            Intervalos: 0d (revisão imediata) · 1d · 3d · 7d · 14d · 30d
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {adaptiveAnalysis.spacedSchedule.slice(0, 9).map((item) => (
            <div
              key={item.spotId}
              className={`rounded-xl border p-3 flex items-center justify-between gap-2.5 text-xs ${
                item.isDueNow
                  ? "bg-amber-950/25 border-amber-700/50"
                  : "bg-slate-950/80 border-slate-800"
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      item.isDueNow
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-950 text-emerald-300 border border-emerald-700/40"
                    }`}
                  >
                    Caixa {item.boxLevel} ({item.intervalDays}d)
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.isDueNow ? "Revisar Agora" : "Agendado"}
                  </span>
                </div>
                <div className="font-bold text-slate-100 truncate">
                  {item.spotName}
                </div>
                <div className="text-[10px] text-slate-400">
                  {item.reason} · Conf. última:{" "}
                  <strong className="text-slate-200 uppercase">
                    {item.lastConfidence}
                  </strong>
                </div>
              </div>

              {onPracticeSpot && (
                <button
                  type="button"
                  onClick={() => onPracticeSpot(item.spotId)}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shrink-0 transition"
                >
                  Treinar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ETAPA 5 (Item 5): Progresso Multidimensional por Posição, Stack, Formato e Street */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-400" />
            Progresso Multidimensional: Posição, Stack, Formato de Torneio e Street
          </h3>

          <div className="flex flex-wrap items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {(
              [
                { id: "position", label: "Por Posição" },
                { id: "stack", label: "Por Stack Efetivo" },
                { id: "format", label: "Por Formato (chipEV / ICM / PKO / Spin)" },
                { id: "street", label: "Por Street (Pré / Flop / Turn / River)" },
              ] as { id: DimensionTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDimensionTab(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                  dimensionTab === tab.id
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {dimensionTab === "position" &&
          renderDimensionTable(
            adaptiveAnalysis.dimensionalProgress.byPosition,
            "Sem registros por posição.",
          )}
        {dimensionTab === "stack" &&
          renderDimensionTable(
            adaptiveAnalysis.dimensionalProgress.byStack,
            "Sem registros por faixa de stack.",
          )}
        {dimensionTab === "format" &&
          renderDimensionTable(
            adaptiveAnalysis.dimensionalProgress.byFormat,
            "Sem registros por formato de torneio.",
          )}
        {dimensionTab === "street" &&
          renderDimensionTable(
            adaptiveAnalysis.dimensionalProgress.byStreet,
            "Sem registros por street.",
          )}
      </div>

      {/* Heatmap Posição x Stack + Tipo de Spot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
          <h3 className="text-sm font-bold text-slate-100 mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            Mapa de Precisão: Posição &times; Stack Efetivo (MTT 8-Max)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left py-1.5 px-2 font-semibold">
                    Posição
                  </th>
                  {HEATMAP_STACKS.map((st) => (
                    <th key={st} className="text-center py-1.5 px-2 font-mono">
                      {st}BB
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS_8MAX.map((pos) => (
                  <tr key={pos} className="border-t border-slate-800/70">
                    <td className="py-1.5 px-2 font-bold text-slate-200">
                      {pos}
                    </td>
                    {HEATMAP_STACKS.map((st) => {
                      const cell = summary.byCell[`${pos}_${st}`];
                      if (!cell || cell.total === 0) {
                        return (
                          <td key={st} className="p-1 text-center">
                            <div className="rounded-lg bg-slate-950/60 border border-slate-800/60 py-1.5 text-slate-600 font-mono">
                              —
                            </div>
                          </td>
                        );
                      }
                      const pct = Math.round((cell.ok / cell.total) * 100);
                      const colorClass =
                        pct >= 80
                          ? "bg-emerald-950/70 border-emerald-700/60 text-emerald-300"
                          : pct >= 55
                            ? "bg-amber-950/70 border-amber-700/60 text-amber-300"
                            : "bg-rose-950/70 border-rose-700/60 text-rose-300";
                      return (
                        <td key={st} className="p-1 text-center">
                          <div
                            className={`rounded-lg border py-1.5 font-mono font-bold ${colorClass}`}
                            title={`${cell.ok}/${cell.total} acertos`}
                          >
                            {pct}%
                            <span className="block text-[9px] font-normal opacity-75">
                              ({cell.total})
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 mb-3">
              Desempenho por Tipo de Spot
            </h3>
            <div className="space-y-3">
              {SPOT_TYPE_LABELS.map((t) => {
                const stats = summary.byType[t.key];
                const pct =
                  stats && stats.total > 0
                    ? Math.round((stats.ok / stats.total) * 100)
                    : 0;
                return (
                  <div key={t.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">
                        {t.label}
                      </span>
                      <span className="font-mono text-slate-400">
                        {stats ? `${pct}% (${stats.total})` : "0 mão"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${stats ? pct : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar histórico persistente
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-300">Confirmar?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearHistory();
                    setConfirmClear(false);
                  }}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  Sim, apagar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ETAPA 5 (Itens 1 e 2): Histórico Persistente de Exercícios com Confiança e Estratégia de Referência */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-400" />
            Histórico Persistente de Exercícios ({Math.min(effectiveAdaptiveRecords.length, 40)} registros mais recentes)
          </h3>
          <span className="text-[11px] text-slate-400">
            Inclui modo do treinador, estratégia de referência, EV loss e nível de confiança declarado
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="py-2 px-2">Modo</th>
                <th className="py-2 px-2">Spot</th>
                <th className="py-2 px-2">Street / Formato</th>
                <th className="py-2 px-2">Mão</th>
                <th className="py-2 px-2">Sua Ação</th>
                <th className="py-2 px-2">Ref. Dominante</th>
                <th className="py-2 px-2 text-right">Freq.</th>
                <th className="py-2 px-2 text-right">EV Loss</th>
                <th className="py-2 px-2 text-center">Confiança</th>
                <th className="py-2 px-2 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {effectiveAdaptiveRecords.slice(0, 40).map((rec) => (
                <tr
                  key={rec.attemptId}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30"
                >
                  <td className="py-2 px-2">
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        rec.trainerMode === "GTO_TECHNICAL"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-700/50"
                          : "bg-indigo-950 text-indigo-300 border border-indigo-700/50"
                      }`}
                    >
                      {rec.trainerMode === "GTO_TECHNICAL" ? "GTO" : "APREND."}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-200 font-medium">
                    {rec.spotName}
                  </td>
                  <td className="py-2 px-2 text-[11px] text-slate-400 font-mono">
                    {rec.street} · {rec.tournamentFormat}
                  </td>
                  <td className="py-2 px-2 font-mono font-bold text-amber-300">
                    {rec.handClass}
                  </td>
                  <td className="py-2 px-2 text-slate-200">
                    {rec.chosenAction}
                  </td>
                  <td className="py-2 px-2 text-slate-400">
                    {rec.referenceStrategySummary.dominantAction ?? "—"}
                    <span className="block text-[9px] text-slate-500 font-mono">
                      [{rec.referenceStrategySummary.status}]
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-slate-300">
                    {rec.referenceStrategySummary.chosenFreq !== null
                      ? `${Math.round(rec.referenceStrategySummary.chosenFreq * 100)}%`
                      : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-slate-300">
                    {typeof rec.evLoss === "number" && rec.evUnit
                      ? `${rec.evLoss.toFixed(3)} ${rec.evUnit}`
                      : "—"}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        rec.confidenceLevel === "alta"
                          ? "bg-indigo-950 text-indigo-300 border border-indigo-700/50"
                          : rec.confidenceLevel === "baixa"
                            ? "bg-amber-950 text-amber-300 border border-amber-700/50"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {rec.confidenceLevel}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rec.classification === "exact_primary"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                          : rec.classification === "valid_mixed" ||
                              rec.classification === "low_freq_acceptable"
                            ? "bg-amber-950 text-amber-300 border border-amber-700/60"
                            : rec.classification === "unsolved"
                              ? "bg-slate-800 text-slate-300 border border-slate-700"
                              : "bg-rose-950 text-rose-300 border border-rose-700/60"
                      }`}
                    >
                      {rec.classification === "exact_primary"
                        ? "Principal"
                        : rec.classification === "valid_mixed" ||
                            rec.classification === "low_freq_acceptable"
                          ? "Mix (+EV)"
                          : rec.classification === "unsolved"
                            ? "Unsolved"
                            : "Desvio"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
