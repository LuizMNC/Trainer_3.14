"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  Gauge,
  HelpCircle,
  Layers,
  PlusCircle,
  Repeat,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  type AdaptiveExerciseRecord,
  classifyAndRankLeaks,
  computeDimensionalProgress,
  computeSpacedRepetitionSchedule,
  type DimensionProgressItem,
  formatActionLabelPtBr,
  formatSampleConfidencePtBr,
  isSpotIdExcludedFromMtt,
  pluralizePtBr,
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

export type HandReviewCategory = "revisar" | "errei" | "acertei" | "duvida";
export type HandReviewFilterId = "todas" | HandReviewCategory;

export interface CustomReviewHandEntry {
  id: string;
  timestamp: number;
  handClass: string;
  heroPosition: string;
  stackBb: number;
  spotId: string;
  spotName: string;
  chosenAction: string;
  category: HandReviewCategory;
  note: string;
}

interface StatsViewProps {
  history: HandHistoryItem[];
  adaptiveRecords?: AdaptiveExerciseRecord[];
  onClearHistory: () => void;
  onPracticeSpot?: (spotId: string, preferredMode?: TrainerModeId) => void;
}

const STORAGE_KEY_HAND_REVIEW_TAGS = "poker_stats_hand_review_tags_v1";
const STORAGE_KEY_CUSTOM_HANDS = "poker_stats_custom_hands_v1";
const STORAGE_KEY_TRAINER_SELF_REVIEW = "poker_trainer_self_review_tags_v1";

const HEATMAP_STACKS = [14, 17, 20, 25, 28, 30, 40, 50, 75, 100];

const SPOT_TYPE_LABELS: { key: string; label: string }[] = [
  { key: "rfi", label: "RFI (Open Raise)" },
  { key: "vs_rfi", label: "vs RFI (Call / 3-Bet)" },
  { key: "vs_limp", label: "BB vs SB Limp" },
  { key: "flop_cbet_ip", label: "Flop C-Bet IP vs BB" },
  { key: "bb_vs_cbet", label: "BB vs C-Bet" },
  { key: "river_polarized_bet", label: "River Polarizado" },
];

function formatTournamentFormatLabelPtBr(fmt: string): string {
  if (fmt === "MTT_CHEV") return "MTT chipEV";
  if (fmt === "MTT_ICM") return "MTT ICM ($EV)";
  if (fmt === "PKO" || fmt === "MTT_PKO") return "MTT PKO (Bounty)";
  if (fmt === "SNG_SPIN") return "Spin & Go (Arquivo legado)";
  if (fmt === "CASH") return "Cash Game (Arquivo legado)";
  return fmt;
}

type DimensionTab = "position" | "stack" | "format" | "street";

function renderDimensionTable(items: DimensionProgressItem[], emptyLabel: string) {
  if (items.length === 0) {
    return (
      <div className="text-xs text-[#94A3B8] py-4 text-center">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-[#94A3B8] border-b border-[#1E293B]">
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
              className="border-b border-[#1E293B]/70 hover:bg-[#0D1322]"
            >
              <td className="py-2 px-2 font-bold text-[#F8FAFC]">{item.label}</td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                {item.attempts}
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums">
                <span
                  className={`font-bold ${
                    item.accuracyPct >= 80
                      ? "text-[#60A5FA]"
                      : item.accuracyPct >= 60
                        ? "text-amber-300"
                        : "text-[#F87171]"
                  }`}
                >
                  {item.accuracyPct.toFixed(1)}%
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-[#FCD34D]">
                {item.avgEvLoss !== null
                  ? `${item.avgEvLoss.toFixed(3)} (${item.evLossCount})`
                  : "—"}
              </td>
              <td className="py-2 px-2 text-right font-mono tabular-nums text-indigo-300">
                {item.highConfidencePct.toFixed(0)}%
              </td>
              <td className="py-2 px-2 text-right">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
                    item.sampleConfidence.startsWith("amostra_solida")
                      ? "bg-[#0F1B33] text-sky-200 border border-[#2563EB]/50"
                      : item.sampleConfidence.startsWith("amostra_em_formacao")
                        ? "bg-amber-950/80 text-amber-300 border border-amber-700/50"
                        : "bg-[#05070B] text-[#CBD5E1] border border-[#1E293B]"
                  }`}
                >
                  {formatSampleConfidencePtBr(item.sampleConfidence)}
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
  const [nowMs, setNowMs] = useState<number | null>(null);

  // Filtro de mãos: Todas | Precisam revisar | Errei | Acertei | Fiquei em dúvida
  const [reviewFilter, setReviewFilter] = useState<HandReviewFilterId>("todas");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Marcações manuais por tentativa/mão + mãos adicionadas manualmente pelo usuário
  const [manualTags, setManualTags] = useState<Record<string, HandReviewCategory>>({});
  const [trainerSelfReview, setTrainerSelfReview] = useState<Record<string, string>>({});
  const [customHands, setCustomHands] = useState<CustomReviewHandEntry[]>([]);

  // Formulário compacto para colocar/adicionar mão manualmente na lista de revisão
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newHandClass, setNewHandClass] = useState<string>("AKo");
  const [newHeroPos, setNewHeroPos] = useState<string>("BTN");
  const [newStackBb, setNewStackBb] = useState<number>(30);
  const [newSpotName, setNewSpotName] = useState<string>("BTN vs BB SRP 30BB");
  const [newChosenAction, setNewChosenAction] = useState<string>("Bet 33%");
  const [newCategory, setNewCategory] = useState<HandReviewCategory>("duvida");
  const [newNote, setNewNote] = useState<string>("");

  useEffect(() => {
    queueMicrotask(() => {
      setNowMs(Date.now());
      try {
        const rawTags = window.localStorage.getItem(STORAGE_KEY_HAND_REVIEW_TAGS);
        if (rawTags) {
          const parsed = JSON.parse(rawTags);
          if (parsed && typeof parsed === "object") {
            setManualTags(parsed as Record<string, HandReviewCategory>);
          }
        }
        const rawCustom = window.localStorage.getItem(STORAGE_KEY_CUSTOM_HANDS);
        if (rawCustom) {
          const parsedCustom = JSON.parse(rawCustom);
          if (Array.isArray(parsedCustom)) {
            setCustomHands(parsedCustom as CustomReviewHandEntry[]);
          }
        }
        const rawSelf = window.localStorage.getItem(STORAGE_KEY_TRAINER_SELF_REVIEW);
        if (rawSelf) {
          const parsedSelf = JSON.parse(rawSelf);
          if (parsedSelf && typeof parsedSelf === "object") {
            setTrainerSelfReview(parsedSelf as Record<string, string>);
          }
        }
      } catch {
        // Ignora erro de localStorage
      }
    });
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSetManualTag = (attemptId: string, category: HandReviewCategory) => {
    setManualTags((prev) => {
      const next = { ...prev, [attemptId]: category };
      try {
        window.localStorage.setItem(STORAGE_KEY_HAND_REVIEW_TAGS, JSON.stringify(next));
      } catch {
        // Ignora erro local
      }
      return next;
    });
  };

  const handleAddCustomHand = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHand = newHandClass.trim() || "AKo";
    const entry: CustomReviewHandEntry = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      handClass: cleanHand,
      heroPosition: newHeroPos,
      stackBb: Math.max(1, Number(newStackBb) || 30),
      spotId: "manual_custom_review",
      spotName: newSpotName.trim() || `${newHeroPos} · ${newStackBb}BB`,
      chosenAction: newChosenAction.trim() || "Revisar linha",
      category: newCategory,
      note: newNote.trim(),
    };
    setCustomHands((prev) => {
      const next = [entry, ...prev];
      try {
        window.localStorage.setItem(STORAGE_KEY_CUSTOM_HANDS, JSON.stringify(next));
      } catch {
        // Ignora erro local
      }
      return next;
    });
    setNewNote("");
    setShowAddForm(false);
  };

  const handleRemoveCustomHand = (id: string) => {
    setCustomHands((prev) => {
      const next = prev.filter((item) => item.id !== id);
      try {
        window.localStorage.setItem(STORAGE_KEY_CUSTOM_HANDS, JSON.stringify(next));
      } catch {
        // Ignora erro local
      }
      return next;
    });
  };

  const handleClearAllEverything = () => {
    onClearHistory();
    setManualTags({});
    setTrainerSelfReview({});
    setCustomHands([]);
    setReviewFilter("todas");
    setPositionFilter("ALL");
    setSearchQuery("");
    setConfirmClear(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY_HAND_REVIEW_TAGS);
      window.localStorage.removeItem(STORAGE_KEY_CUSTOM_HANDS);
      window.localStorage.removeItem(STORAGE_KEY_TRAINER_SELF_REVIEW);
    } catch {
      // Ignora erro local
    }
  };

  const { mttHistory, excludedHistoryCount } = useMemo(() => {
    const active: HandHistoryItem[] = [];
    let excluded = 0;
    for (const h of history) {
      if (isSpotIdExcludedFromMtt(h.spotId, h.spotName)) {
        excluded += 1;
      } else {
        active.push(h);
      }
    }
    return { mttHistory: active, excludedHistoryCount: excluded };
  }, [history]);

  const effectiveAdaptiveRecords = useMemo<AdaptiveExerciseRecord[]>(() => {
    const knownKeys = new Set(
      adaptiveRecords.map(
        (r) => `${r.timestamp}::${r.spotId}::${r.handClass}::${r.chosenAction}`,
      ),
    );
    const legacyFromHistory: AdaptiveExerciseRecord[] = history
      .filter(
        (h) =>
          !knownKeys.has(`${h.timestamp}::${h.spotId}::${h.hand}::${h.chosenAction}`),
      )
      .map((h) => ({
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
    return adaptiveRecords.length > 0
      ? [...adaptiveRecords, ...legacyFromHistory]
      : legacyFromHistory;
  }, [adaptiveRecords, history]);

  const { mttAdaptiveRecords, excludedAdaptiveCount } = useMemo(() => {
    const active: AdaptiveExerciseRecord[] = [];
    let excluded = 0;
    for (const r of effectiveAdaptiveRecords) {
      if (
        r.tournamentFormat === "SNG_SPIN" ||
        r.tournamentFormat === "CASH" ||
        isSpotIdExcludedFromMtt(r.spotId, r.spotName)
      ) {
        excluded += 1;
      } else {
        active.push(r);
      }
    }
    return { mttAdaptiveRecords: active, excludedAdaptiveCount: excluded };
  }, [effectiveAdaptiveRecords]);

  const adaptiveAnalysis = useMemo(() => {
    const refNowMs =
      nowMs ??
      mttAdaptiveRecords[0]?.timestamp ??
      mttHistory[0]?.timestamp ??
      1794500000000;
    const classifiedLeaks = classifyAndRankLeaks(mttAdaptiveRecords);
    const spacedSchedule = computeSpacedRepetitionSchedule(
      mttAdaptiveRecords,
      refNowMs,
    );
    const dimensionalProgress = computeDimensionalProgress(
      mttAdaptiveRecords,
    );
    return {
      classifiedLeaks,
      spacedSchedule,
      dimensionalProgress,
    };
  }, [mttAdaptiveRecords, mttHistory, nowMs]);

  // Unifica as mãos jogadas + mãos colocadas manualmente e calcula a categoria de revisão de cada uma
  const unifiedReviewRows = useMemo(() => {
    const dueSpotIds = new Set(
      adaptiveAnalysis.spacedSchedule.filter((s) => s.isDueNow).map((s) => s.spotId),
    );

    const fromAttempts = effectiveAdaptiveRecords.map((rec) => {
      const explicitTag = manualTags[rec.attemptId];
      const selfTag =
        trainerSelfReview[rec.attemptId] ??
        trainerSelfReview[`${rec.spotId}::${rec.handClass}`];

      let resolvedCategory: HandReviewCategory = "acertei";
      if (explicitTag) {
        resolvedCategory = explicitTag;
      } else if (selfTag === "revisar_agora") {
        resolvedCategory = "revisar";
      } else if (selfTag === "preciso_praticar") {
        resolvedCategory = "duvida";
      } else if (rec.classification === "ev_error" || !rec.isAcceptable) {
        resolvedCategory = "errei";
      } else if (
        rec.confidenceLevel === "baixa" ||
        rec.classification === "low_freq_acceptable" ||
        rec.classification === "unsolved"
      ) {
        resolvedCategory = "duvida";
      } else {
        resolvedCategory = "acertei";
      }

      const needsReview =
        resolvedCategory === "revisar" ||
        resolvedCategory === "errei" ||
        resolvedCategory === "duvida" ||
        dueSpotIds.has(rec.spotId);

      const isExcludedLegacy =
        rec.tournamentFormat === "SNG_SPIN" ||
        rec.tournamentFormat === "CASH" ||
        isSpotIdExcludedFromMtt(rec.spotId, rec.spotName);

      return {
        id: rec.attemptId,
        isCustom: false,
        isExcludedLegacy,
        timestamp: rec.timestamp,
        trainerMode: rec.trainerMode,
        spotId: rec.spotId,
        spotName: rec.spotName,
        street: rec.street,
        tournamentFormat: rec.tournamentFormat,
        heroPosition: rec.heroPosition,
        stackBb: rec.effectiveStackBb,
        handClass: rec.handClass,
        chosenAction: rec.chosenAction,
        dominantAction: rec.referenceStrategySummary.dominantAction ?? "—",
        strategyStatus: rec.referenceStrategySummary.status,
        chosenFreq: rec.referenceStrategySummary.chosenFreq,
        evLoss: rec.evLoss,
        evUnit: rec.evUnit,
        confidenceLevel: rec.confidenceLevel,
        classification: rec.classification,
        category: resolvedCategory,
        needsReview,
        note: "",
      };
    });

    const fromCustom = customHands.map((c) => ({
      id: c.id,
      isCustom: true,
      isExcludedLegacy: false,
      timestamp: c.timestamp,
      trainerMode: "LEARNING" as TrainerModeId,
      spotId: c.spotId,
      spotName: c.spotName,
      street: "PREFLOP",
      tournamentFormat: "MTT_CHEV",
      heroPosition: c.heroPosition,
      stackBb: c.stackBb,
      handClass: c.handClass,
      chosenAction: c.chosenAction,
      dominantAction: "Revisão manual",
      strategyStatus: "IMPORTED_CHART_NO_EV" as StrategyStatus,
      chosenFreq: null,
      evLoss: null,
      evUnit: null,
      confidenceLevel: c.category === "duvida" ? ("baixa" as const) : ("media" as const),
      classification:
        c.category === "errei"
          ? ("ev_error" as const)
          : c.category === "acertei"
            ? ("exact_primary" as const)
            : ("valid_mixed" as const),
      category: manualTags[c.id] ?? c.category,
      needsReview:
        (manualTags[c.id] ?? c.category) !== "acertei",
      note: c.note,
    }));

    return [...fromCustom, ...fromAttempts];
  }, [effectiveAdaptiveRecords, manualTags, trainerSelfReview, customHands, adaptiveAnalysis.spacedSchedule]);

  const filterCounts = useMemo(() => {
    let revisar = 0;
    let errei = 0;
    let acertei = 0;
    let duvida = 0;
    for (const r of unifiedReviewRows) {
      if (r.needsReview) revisar++;
      if (r.category === "errei") errei++;
      if (r.category === "acertei") acertei++;
      if (r.category === "duvida") duvida++;
    }
    return {
      todas: unifiedReviewRows.length,
      revisar,
      errei,
      acertei,
      duvida,
    };
  }, [unifiedReviewRows]);

  const filteredReviewRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedReviewRows.filter((row) => {
      if (reviewFilter === "revisar" && !row.needsReview) return false;
      if (reviewFilter === "errei" && row.category !== "errei") return false;
      if (reviewFilter === "acertei" && row.category !== "acertei") return false;
      if (reviewFilter === "duvida" && row.category !== "duvida") return false;
      if (positionFilter !== "ALL" && row.heroPosition !== positionFilter) return false;
      if (q) {
        const hay = `${row.handClass} ${row.spotName} ${row.heroPosition} ${row.chosenAction} ${row.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedReviewRows, reviewFilter, positionFilter, searchQuery]);

  const summary = useMemo(() => {
    const scored = mttHistory.filter((h) => h.status !== "unsolved");
    const total = scored.length;
    const exact = scored.filter((h) => h.status === "correct").length;
    const mixed = scored.filter((h) => h.status === "mixed").length;
    const errors = scored.filter((h) => h.status === "error").length;
    const unsolvedCount = mttHistory.length - total;

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
    const worstCandidate =
      posEntries.length > 0 ? posEntries[posEntries.length - 1] : null;
    const worstPos =
      worstCandidate && worstCandidate.pct < 100 ? worstCandidate : null;

    const adaptiveLeaks = rankLeakSpots(
      scored.map((h) => ({
        spotId: h.spotId,
        evLoss: h.evLoss ?? null,
        isError: h.status === "error",
      })),
    ).slice(0, 5);

    const spotNames = new Map(mttHistory.map((h) => [h.spotId, h.spotName]));

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
  }, [mttHistory]);

  return (
    <div className="flex flex-col gap-5">
      {/* BARRA SUPERIOR DE COMANDO: TÍTULO, BOTÃO "ADICIONAR MÃO" E BOTÃO "LIMPAR TUDO" */}
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2563EB]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#F8FAFC]">
              Diagnóstico &amp; Leaks · Gestão de Revisão de Mãos
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Filtre e classifique as mãos que <strong className="text-[#F8FAFC]">precisam revisar</strong>, que você{" "}
              <strong className="text-[#F87171]">errou</strong>,{" "}
              <strong className="text-[#60A5FA]">acertou</strong> ou{" "}
              <strong className="text-amber-300">ficou em dúvida</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 text-white font-extrabold text-xs px-3.5 py-2 transition shadow"
          >
            <PlusCircle className="w-4 h-4" />
            {showAddForm ? "Fechar formulário" : "Colocar mão na revisão"}
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              data-testid="stats-clear-all-btn"
              className="flex items-center gap-1.5 rounded-xl bg-[#05070B] hover:bg-[#2B0B11] border border-[#1E293B] hover:border-[#DC2626]/60 text-xs font-bold text-[#F87171] px-3.5 py-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              Limpar tudo
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-[#2B0B11] border border-[#DC2626]/70 px-3 py-1.5">
              <span className="text-xs font-bold text-red-200">
                Apagar todo o histórico e marcações?
              </span>
              <button
                type="button"
                onClick={handleClearAllEverything}
                className="px-2.5 py-1 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold transition"
              >
                Sim, limpar tudo
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1 rounded-lg bg-[#090D16] text-slate-300 hover:text-white text-xs font-semibold transition"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {(excludedHistoryCount > 0 || excludedAdaptiveCount > 0) && (
        <div
          role="status"
          className="rounded-xl bg-[#1B1406] border border-[#F59E0B]/55 px-3.5 py-2.5 text-xs text-[#FDE68A] flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-[#FBBF24] shrink-0" />
          <span>
            Exibindo indicadores exclusivos de torneios MTT.{" "}
            <strong>
              {Math.max(excludedHistoryCount, excludedAdaptiveCount)} registro(s) histórico(s) de outros formatos (ex.: Spin &amp; Go)
            </strong>{" "}
            permanece(m) preservado(s) no seu arquivo local, sem contaminar precisão, leaks ou revisão espaçada MTT.
          </span>
        </div>
      )}

      {/* FORMULÁRIO COMPACTO PARA COLOCAR / REGISTRAR MÃO MANUALMENTE */}
      {showAddForm && (
        <form
          onSubmit={handleAddCustomHand}
          className="rounded-2xl bg-[#090D16] border border-[#3B82F6]/50 p-4 space-y-3 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#60A5FA]">
              Colocar Mão para Revisão (Errei · Acertei · Fiquei em dúvida · Precisa revisar)
            </span>
            <span className="text-[0.6875rem] text-[#94A3B8]">
              Salvo automaticamente no seu navegador
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-[#94A3B8] font-semibold">Mão (ex: AKo, 97s)</span>
              <input
                type="text"
                value={newHandClass}
                onChange={(e) => setNewHandClass(e.target.value)}
                placeholder="AKo"
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 font-mono text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[#94A3B8] font-semibold">Posição</span>
              <select
                value={newHeroPos}
                onChange={(e) => setNewHeroPos(e.target.value)}
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-white"
              >
                {POSITIONS_8MAX.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[#94A3B8] font-semibold">Stack (BB)</span>
              <input
                type="number"
                min={1}
                max={300}
                value={newStackBb}
                onChange={(e) => setNewStackBb(Number(e.target.value) || 30)}
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 font-mono text-white"
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-[#94A3B8] font-semibold">Cenário / Spot</span>
              <input
                type="text"
                value={newSpotName}
                onChange={(e) => setNewSpotName(e.target.value)}
                placeholder="Ex: BTN vs BB SRP Flop Ah Kd 7c"
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[#94A3B8] font-semibold">Sua Ação</span>
              <input
                type="text"
                value={newChosenAction}
                onChange={(e) => setNewChosenAction(e.target.value)}
                placeholder="Ex: Call / Bet 33%"
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
            <div className="sm:col-span-5 space-y-1">
              <span className="text-[#94A3B8] font-semibold block">
                Classificar esta mão como:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { id: "revisar", label: "Precisa revisar", cls: "border-amber-500/60 text-amber-300" },
                    { id: "errei", label: "Errei", cls: "border-rose-500/60 text-rose-300" },
                    { id: "acertei", label: "Acertei", cls: "border-[#3B82F6]/60 text-sky-200" },
                    { id: "duvida", label: "Fiquei em dúvida", cls: "border-indigo-500/60 text-indigo-300" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewCategory(opt.id)}
                    className={`py-1.5 px-2 rounded-lg font-bold border text-[0.6875rem] transition ${
                      newCategory === opt.id
                        ? `${opt.cls} bg-[#1E293B]`
                        : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="sm:col-span-5 space-y-1">
              <span className="text-[#94A3B8] font-semibold">
                Observação / Dúvida (opcional)
              </span>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ex: Fiquei em dúvida entre c-bet 33% e check back..."
                className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-white"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white font-extrabold text-xs transition"
              >
                Salvar Mão
              </button>
            </div>
          </div>
        </form>
      )}

      {/* BARRA DE FILTROS DE MÃOS: TODAS | PRECISAM REVISAR | ERREI | ACERTEI | FIQUEI EM DÚVIDA */}
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#60A5FA]" />
            <h3 className="text-sm font-bold text-[#F8FAFC]">
              Filtro de Mãos por Status de Revisão
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar mão (ex: AKo), spot ou nota..."
                className="rounded-xl bg-[#05070B] border border-[#1E293B] pl-8 pr-3 py-1.5 text-xs text-[#F8FAFC] outline-none focus:border-[#3B82F6]"
              />
            </div>

            <select
              aria-label="Filtrar mãos por posição"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="rounded-xl bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-xs text-[#F8FAFC] outline-none"
            >
              <option value="ALL">Todas as posições</option>
              {POSITIONS_8MAX.map((p) => (
                <option key={p} value={p}>
                  Posição: {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pílulas de Filtro Solicitadas */}
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filtrar mãos por status de revisão"
        >
          {(
            [
              {
                id: "todas",
                label: "Todas as mãos",
                count: filterCounts.todas,
                icon: <Layers className="w-3.5 h-3.5" />,
                activeCls: "bg-[#2563EB] text-white border-[#3B82F6]",
              },
              {
                id: "revisar",
                label: "Precisam revisar",
                count: filterCounts.revisar,
                icon: <BookmarkCheck className="w-3.5 h-3.5" />,
                activeCls: "bg-amber-500 text-[#05070B] border-amber-400",
              },
              {
                id: "errei",
                label: "Errei",
                count: filterCounts.errei,
                icon: <XCircle className="w-3.5 h-3.5" />,
                activeCls: "bg-[#DC2626] text-white border-[#EF4444]",
              },
              {
                id: "acertei",
                label: "Acertei",
                count: filterCounts.acertei,
                icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                activeCls: "bg-[#2563EB] text-white border-[#60A5FA]",
              },
              {
                id: "duvida",
                label: "Fiquei em dúvida",
                count: filterCounts.duvida,
                icon: <HelpCircle className="w-3.5 h-3.5" />,
                activeCls: "bg-slate-200 text-[#05070B] border-white",
              },
            ] as const
          ).map((pill) => {
            const active = reviewFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setReviewFilter(pill.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold border transition ${
                  active
                    ? `${pill.activeCls} shadow`
                    : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white hover:bg-[#141D2F]"
                }`}
              >
                {pill.icon}
                <span>{pill.label}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 font-mono text-[0.6875rem] ${
                    active
                      ? "bg-black/25 text-current"
                      : "bg-[#141D2F] text-[#F8FAFC]"
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Lista / Tabela Interativa das Mãos Filtradas */}
        {filteredReviewRows.length === 0 ? (
          <div className="rounded-xl bg-[#05070B] border border-dashed border-[#1E293B] p-6 text-center space-y-2">
            <p className="text-xs font-bold text-[#F8FAFC]">
              Nenhuma mão encontrada para o filtro &ldquo;
              {reviewFilter === "todas"
                ? "Todas as mãos"
                : reviewFilter === "revisar"
                  ? "Precisam revisar"
                  : reviewFilter === "errei"
                    ? "Errei"
                    : reviewFilter === "acertei"
                      ? "Acertei"
                      : "Fiquei em dúvida"}
              &rdquo;.
            </p>
            <p className="text-[0.6875rem] text-[#94A3B8]">
              Jogue mãos no <strong>Modo Trainer</strong> ou clique em{" "}
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-[#60A5FA] underline font-bold"
              >
                Colocar mão na revisão
              </button>{" "}
              acima para registrar mãos que você errou, acertou ou ficou em dúvida.
            </p>
          </div>
        ) : (
          <>
            {/* Cartões empilhados no celular (< 640px) */}
            <div className="sm:hidden space-y-2.5">
              {filteredReviewRows.slice(0, 50).map((row) => (
                <div
                  key={`mobile-${row.id}`}
                  className="rounded-xl border border-[#1E293B] bg-[#090D16] p-3 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-[#FCD34D]">
                          {row.handClass}
                        </span>
                        <span className="text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-[#05070B] border border-[#26334A] text-[#F8FAFC]">
                          {row.heroPosition} · {row.stackBb}bb
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#F8FAFC] mt-1">
                        {row.spotName}
                      </div>
                      <div className="text-[0.6875rem] text-[#94A3B8] font-mono">
                        {row.street} · {formatTournamentFormatLabelPtBr(row.tournamentFormat)}
                      </div>
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[0.6875rem] font-bold shrink-0 ${
                        row.classification === "exact_primary"
                          ? "bg-[#0F1B33] text-sky-200 border border-[#2563EB]/60"
                          : row.classification === "valid_mixed" ||
                              row.classification === "low_freq_acceptable"
                            ? "bg-amber-950 text-amber-300 border border-amber-700/60"
                            : row.classification === "unsolved"
                              ? "bg-slate-800 text-slate-300 border border-slate-700"
                              : "bg-[#2B0B11] text-red-200 border border-[#DC2626]/60"
                      }`}
                    >
                      {row.classification === "exact_primary"
                        ? "Principal"
                        : row.classification === "valid_mixed" ||
                            row.classification === "low_freq_acceptable"
                          ? "Mix válido"
                          : row.classification === "unsolved"
                            ? "Sem solução"
                            : "Desvio"}
                    </span>
                  </div>

                  <div className="text-xs text-[#CBD5E1] bg-[#05070B] rounded-lg border border-[#1E293B] p-2">
                    <span>
                      Escolheu:{" "}
                      <strong className="text-[#60A5FA]">
                        {formatActionLabelPtBr(row.chosenAction)}
                      </strong>
                    </span>
                    {" · "}
                    <span className="font-mono text-[#94A3B8]">
                      Ref: {formatActionLabelPtBr(row.dominantAction)}
                      {row.chosenFreq !== null
                        ? ` (${Math.round(row.chosenFreq * 100)}%)`
                        : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          { id: "revisar", label: "Revisar" },
                          { id: "errei", label: "Errei" },
                          { id: "acertei", label: "Acertei" },
                          { id: "duvida", label: "Dúvida" },
                        ] as const
                      ).map((btn) => (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => handleSetManualTag(row.id, btn.id)}
                          className={`px-2 py-1 rounded-lg text-[0.6875rem] font-bold border ${
                            row.category === btn.id
                              ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                              : "bg-[#05070B] border-[#1E293B] text-[#94A3B8]"
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onPracticeSpot &&
                        !row.isCustom &&
                        row.spotId !== "manual_custom_review" &&
                        (row.isExcludedLegacy ? (
                          <span
                            className="px-2 py-1 rounded-lg bg-[#1B1406] border border-[#F59E0B]/50 text-[#FDE68A] font-semibold text-[0.6875rem]"
                            title="Este exercício não está disponível no modo MTT."
                          >
                            Não disponível no MTT
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onPracticeSpot(row.spotId)}
                            className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white font-extrabold text-[0.6875rem]"
                          >
                            Treinar
                          </button>
                        ))}
                      {row.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomHand(row.id)}
                          aria-label="Remover mão manual"
                          className="p-1.5 rounded-lg bg-[#05070B] hover:bg-rose-950 text-[#94A3B8] hover:text-rose-300 border border-[#1E293B]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabela completa em tablets e desktop (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-[#1E293B] bg-[#05070B]">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="text-[#CBD5E1] border-b border-[#1E293B] bg-[#090D16]">
                    <th className="py-2.5 px-3">Mão / Posição</th>
                    <th className="py-2.5 px-3">Spot / Cenário</th>
                    <th className="py-2.5 px-3">Sua Ação vs Ref.</th>
                    <th className="py-2.5 px-3 text-center">Resultado Técnico</th>
                    <th className="py-2.5 px-3">
                      Status de Revisão (Revisar · Errei · Acertei · Dúvida)
                    </th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReviewRows.slice(0, 50).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[#1E293B]/70 hover:bg-[#0D1322] transition-colors"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono font-extrabold text-sm text-[#FCD34D]">
                          {row.handClass}
                        </span>
                        <span className="ml-2 text-[0.6875rem] font-mono tabular-nums px-1.5 py-0.5 rounded bg-[#090D16] border border-[#26334A] text-[#F8FAFC]">
                          {row.heroPosition} · {row.stackBb}bb
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-bold text-[#F8FAFC]">{row.spotName}</div>
                        <div className="text-[0.6875rem] text-[#94A3B8] font-mono">
                          {row.street} · {formatTournamentFormatLabelPtBr(row.tournamentFormat)}
                          {row.note ? ` · Nota: "${row.note}"` : ""}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="text-[#F8FAFC]">
                          Escolheu:{" "}
                          <strong className="text-[#60A5FA]">
                            {formatActionLabelPtBr(row.chosenAction)}
                          </strong>
                        </div>
                        <div className="text-[0.6875rem] text-[#94A3B8] font-mono tabular-nums">
                          Ref: {formatActionLabelPtBr(row.dominantAction)}
                          {row.chosenFreq !== null
                            ? ` (${Math.round(row.chosenFreq * 100)}%)`
                            : ""}
                          {typeof row.evLoss === "number" && row.evUnit
                            ? ` · EV Loss: ${row.evLoss.toFixed(3)} ${row.evUnit}`
                            : ""}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[0.6875rem] font-bold ${
                            row.classification === "exact_primary"
                              ? "bg-[#0F1B33] text-sky-200 border border-[#2563EB]/60"
                              : row.classification === "valid_mixed" ||
                                  row.classification === "low_freq_acceptable"
                                ? "bg-amber-950 text-amber-300 border border-amber-700/60"
                                : row.classification === "unsolved"
                                  ? "bg-slate-800 text-slate-300 border border-slate-700"
                                  : "bg-[#2B0B11] text-red-200 border border-[#DC2626]/60"
                          }`}
                        >
                          {row.classification === "exact_primary"
                            ? "Principal"
                            : row.classification === "valid_mixed" ||
                                row.classification === "low_freq_acceptable"
                              ? "Mix válido"
                              : row.classification === "unsolved"
                                ? "Sem solução"
                                : "Desvio"}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {(
                            [
                              {
                                id: "revisar",
                                label: "Revisar",
                                activeCls: "bg-amber-500/25 border-amber-400 text-amber-200",
                              },
                              {
                                id: "errei",
                                label: "Errei",
                                activeCls: "bg-[#DC2626]/25 border-[#EF4444] text-red-200",
                              },
                              {
                                id: "acertei",
                                label: "Acertei",
                                activeCls: "bg-[#2563EB]/25 border-[#3B82F6] text-sky-200",
                              },
                              {
                                id: "duvida",
                                label: "Dúvida",
                                activeCls: "bg-slate-500/25 border-slate-300 text-slate-100",
                              },
                            ] as const
                          ).map((btn) => {
                            const isCurrent = row.category === btn.id;
                            return (
                              <button
                                key={btn.id}
                                type="button"
                                onClick={() => handleSetManualTag(row.id, btn.id)}
                                className={`px-2 py-1 rounded-lg text-[0.6875rem] font-bold border transition ${
                                  isCurrent
                                    ? btn.activeCls
                                    : "bg-[#090D16] border-[#1E293B] text-[#94A3B8] hover:text-white"
                                }`}
                              >
                                {btn.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {onPracticeSpot &&
                          !row.isCustom &&
                          row.spotId !== "manual_custom_review" ? (
                            row.isExcludedLegacy ? (
                              <span
                                className="inline-block px-2 py-1 rounded-lg bg-[#1B1406] border border-[#F59E0B]/50 text-[#FDE68A] font-semibold text-[0.6875rem]"
                                title="Este exercício não está disponível no modo MTT."
                              >
                                Não disponível no MTT
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onPracticeSpot(row.spotId)}
                                className="px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white font-extrabold text-[0.6875rem] transition"
                              >
                                Treinar
                              </button>
                            )
                          ) : row.isCustom ? (
                            <span className="text-[0.6875rem] text-[#94A3B8]">
                              Manual
                            </span>
                          ) : null}
                          {row.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomHand(row.id)}
                              title="Remover mão manual"
                              aria-label="Remover mão manual"
                              className="p-1.5 rounded-lg bg-[#090D16] hover:bg-rose-950 text-[#94A3B8] hover:text-rose-300 border border-[#1E293B]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#94A3B8] font-semibold">
            Mãos Pontuadas
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-[#F8FAFC] mt-1">
            {summary.total}
          </div>
          <div className="text-[0.6875rem] text-[#94A3B8] mt-1">
            {summary.exact} princ. · {summary.mixed} mix · {summary.errors} desvios
            {summary.unsolvedCount > 0 ? ` · ${summary.unsolvedCount} unsolved` : ""}
          </div>
        </div>

        <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#94A3B8] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#60A5FA]" />
            Aderência Válida
          </div>
          <div className="text-2xl font-extrabold font-mono tabular-nums text-[#60A5FA] mt-1">
            {summary.total > 0 ? `${summary.accuracy}%` : "—"}
          </div>
          <div className="text-[0.6875rem] text-[#94A3B8] mt-1">
            {summary.total > 0 && summary.total < 10
              ? `${formatSampleConfidencePtBr(summary.total)} · inclui ações válidas no mix`
              : "Inclui ações presentes no mix de referência"}
          </div>
        </div>

        <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#94A3B8] font-semibold flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-[#F59E0B]" />
            EV Loss Médio
          </div>
          <div className="text-xl font-extrabold text-[#FCD34D] mt-1 font-mono tabular-nums">
            {summary.avgBbLoss !== null
              ? `${summary.avgBbLoss.toFixed(3)} bb`
              : summary.avgUsdLoss !== null
                ? `${summary.avgUsdLoss.toFixed(3)} $EV`
                : "—"}
          </div>
          <div className="text-[0.6875rem] text-[#94A3B8] mt-1">
            {summary.bbLossSample > 0
              ? `${pluralizePtBr(summary.bbLossSample, "mão bbEV", "mãos bbEV")}${summary.bbLossSample < 10 ? " (amostra baixa)" : ""}`
              : summary.usdLossSample > 0
                ? `${pluralizePtBr(summary.usdLossSample, "mão $EV", "mãos $EV")}${summary.usdLossSample < 10 ? " (amostra baixa)" : ""}`
                : "Jogue spots com tabela de EV"}
          </div>
        </div>

        <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#94A3B8] font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Proveniência Verificada
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 mt-1 font-mono tabular-nums">
            {adaptiveAnalysis.dimensionalProgress.provenanceCompletenessPct.toFixed(0)}%
          </div>
          <div className="text-[0.6875rem] text-[#94A3B8] mt-1">
            Proporção jogada em spots verificados
          </div>
        </div>

        <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#94A3B8] font-semibold flex items-center gap-1">
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                summary.worstPos ? "text-[#F87171]" : "text-[#60A5FA]"
              }`}
            />
            Maior Leak por Posição
          </div>
          <div
            className={`text-xl sm:text-2xl font-extrabold mt-1 ${
              summary.worstPos ? "text-[#F87171]" : "text-[#60A5FA]"
            }`}
          >
            {summary.worstPos
              ? `${summary.worstPos.pos} (${summary.worstPos.pct}%)`
              : "Nenhum leak detectado"}
          </div>
          <div className="text-[0.6875rem] text-[#94A3B8] mt-1">
            {summary.worstPos
              ? `${pluralizePtBr(summary.worstPos.total, "mão jogada", "mãos jogadas")}${
                  summary.worstPos.total < 10
                    ? ` · ${formatSampleConfidencePtBr(summary.worstPos.total)}`
                    : ""
                }`
              : summary.bestPos
                ? `100% de precisão em ${pluralizePtBr(summary.total, "mão avaliada", "mãos avaliadas")}`
                : "Jogue algumas mãos para identificar leaks"}
          </div>
        </div>
      </div>

      {/* ETAPA 5 (Item 3): Classificação Taxonômica de Leaks por Frequência, Impacto e Confiança */}
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
            <Target className="w-4 h-4 text-[#F87171]" />
            Diagnóstico Taxonômico de Leaks (Frequência &times; Impacto de EV &times; Ponto Cego de Confiança)
          </h3>
          <span className="text-[0.6875rem] text-[#94A3B8]">
            Erros com confiança &ldquo;alta&rdquo; recebem peso 1.35&times; (ponto cego)
          </span>
        </div>

        {adaptiveAnalysis.classifiedLeaks.length === 0 ? (
          <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-4 text-xs text-[#60A5FA] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Nenhum leak classificado até o momento. Continue praticando para gerar o ranking taxonômico de desvios.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {adaptiveAnalysis.classifiedLeaks.map((leak, idx) => (
              <div
                key={leak.leakCategory}
                className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 flex flex-col justify-between gap-2.5 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.6875rem] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      #{idx + 1} · Impacto {leak.impactScore.toFixed(3)}
                    </span>
                    <span className="text-[0.6875rem] font-mono text-[#94A3B8]">
                      {leak.occurrences} erro(s) ({Math.round(leak.frequencyOfTotalErrors * 100)}%)
                    </span>
                  </div>
                  <div className="font-bold text-[#F8FAFC] text-sm">
                    {leak.label}
                  </div>
                  <p className="text-[0.6875rem] text-[#94A3B8] leading-relaxed">
                    {leak.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#1E293B] space-y-1 text-[0.6875rem]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>EV Loss médio:</span>
                    <strong className="font-mono text-[#F59E0B]">
                      {leak.avgEvLoss !== null ? `${leak.avgEvLoss.toFixed(3)}` : "Sem EV"}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Pontos cegos (conf. alta):</span>
                    <strong
                      className={`font-mono ${
                        leak.blindSpotCount > 0 ? "text-[#EF4444]" : "text-[#94A3B8]"
                      }`}
                    >
                      {leak.blindSpotCount}
                    </strong>
                  </div>
                  <div className="text-[0.6875rem] text-[#94A3B8] truncate">
                    Spots: {leak.topAffectedSpots.join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ETAPA 5 (Item 4): Fila de Repetição Espaçada (Leitner Adaptativo) */}
      <details open className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 group">
        <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
            <Repeat className="w-4 h-4 text-[#60A5FA]" />
            Agenda de Repetição Espaçada (Sistema Leitner Adaptativo · Caixas 0 a 5)
          </h3>
          <span className="text-[0.6875rem] text-[#94A3B8]">
            Intervalos: 0d · 1d · 3d · 7d · 14d · 30d
          </span>
        </summary>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
          {adaptiveAnalysis.spacedSchedule.slice(0, 9).map((item) => (
            <div
              key={item.spotId}
              className={`rounded-xl border p-3 flex items-center justify-between gap-2.5 text-xs ${
                item.isDueNow
                  ? "bg-[#2B0B11]/60 border-[#DC2626]/50"
                  : "bg-[#05070B] border-[#1E293B]"
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[0.6875rem] font-mono font-bold px-1.5 py-0.5 rounded ${
                      item.isDueNow
                        ? "bg-[#DC2626]/20 text-red-200 border border-[#DC2626]/40"
                        : "bg-[#0F1B33] text-sky-200 border border-[#2563EB]/40"
                    }`}
                  >
                    Caixa {item.boxLevel} ({item.intervalDays}d)
                  </span>
                  <span className="text-[0.6875rem] text-[#94A3B8] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.isDueNow ? "Revisar Agora" : "Agendado"}
                  </span>
                </div>
                <div className="font-bold text-[#F8FAFC] truncate">
                  {item.spotName}
                </div>
                <div className="text-[0.6875rem] text-[#94A3B8]">
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
                  className="px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white font-extrabold text-[0.6875rem] shrink-0 transition"
                >
                  Treinar
                </button>
              )}
            </div>
          ))}
        </div>
      </details>

      {/* ETAPA 5 (Item 5): Progresso Multidimensional por Posição, Stack, Formato e Street */}
      <details open className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-3 group">
        <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#60A5FA]" />
            Progresso Multidimensional: Posição, Stack, Formato de Torneio e Street
          </h3>
          <span className="text-[0.6875rem] text-[#60A5FA] group-open:hidden">Expandir</span>
          <span className="text-[0.6875rem] text-slate-400 hidden group-open:inline">Recolher</span>
        </summary>

        <div className="flex flex-wrap items-center gap-1 bg-[#05070B] border border-[#1E293B] rounded-xl p-1">
          {(
            [
              { id: "position", label: "Por Posição" },
              { id: "stack", label: "Por Stack Efetivo" },
              { id: "format", label: "Por Formato (chipEV / ICM / PKO)" },
              { id: "street", label: "Por Street (Pré / Flop / Turn / River)" },
            ] as { id: DimensionTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDimensionTab(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[0.6875rem] font-semibold transition ${
                dimensionTab === tab.id
                  ? "bg-[#2563EB] text-white font-bold"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
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
      </details>

      {/* Heatmap Posição x Stack + Tipo de Spot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4">
          <h3 className="text-sm font-bold text-[#F8FAFC] mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#60A5FA]" />
            Mapa de Precisão: Posição &times; Stack Efetivo (MTT 8-Max)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[#94A3B8]">
                  <th className="text-left py-1.5 px-2 font-semibold">
                    Posição
                  </th>
                  {HEATMAP_STACKS.map((st) => (
                    <th key={st} className="text-center py-1.5 px-1.5 font-mono tabular-nums">
                      {st === 28 ? "28BB (SRP)" : `${st}BB`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS_8MAX.map((pos) => (
                  <tr key={pos} className="border-t border-[#1E293B]">
                    <td className="py-1.5 px-2 font-bold text-[#F8FAFC]">
                      {pos}
                    </td>
                    {HEATMAP_STACKS.map((st) => {
                      const cell = summary.byCell[`${pos}_${st}`];
                      if (!cell || cell.total === 0) {
                        return (
                          <td key={st} className="p-1 text-center">
                            <div className="rounded-lg bg-[#05070B] border border-[#1E293B] py-1.5 text-slate-600 font-mono">
                              —
                            </div>
                          </td>
                        );
                      }
                      const pct = Math.round((cell.ok / cell.total) * 100);
                      const colorClass =
                        pct >= 80
                          ? "bg-[#0F1B33] border-[#2563EB]/60 text-sky-200"
                          : pct >= 55
                            ? "bg-amber-950/70 border-amber-700/60 text-amber-300"
                            : "bg-[#2B0B11] border-[#DC2626]/60 text-red-200";
                      return (
                        <td key={st} className="p-1 text-center">
                          <div
                            className={`rounded-lg border py-1.5 font-mono tabular-nums font-bold ${colorClass}`}
                            title={`${cell.ok}/${cell.total} acertos`}
                          >
                            {pct}%
                            <span className="block text-[0.6875rem] font-normal opacity-80">
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

        <div className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#F8FAFC] mb-3">
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
                      <span className="font-mono tabular-nums text-[#94A3B8]">
                        {stats ? `${pct}% (${stats.total})` : "0 mãos"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#05070B] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#DC2626] to-[#2563EB] transition-all"
                        style={{ width: `${stats ? pct : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between">
            <span className="text-[0.6875rem] text-[#94A3B8] flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-[#60A5FA]" />
              {pluralizePtBr(unifiedReviewRows.length, "mão registrada", "mãos registradas")}
            </span>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 text-xs text-[#F87171] hover:underline font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar tudo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
