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
      <div className="text-xs text-[#A1A6AA] py-4 text-center">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-[#A1A6AA] border-b border-[#292C2F]">
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
              className="border-b border-[#292C2F]/60 hover:bg-[#202224]"
            >
              <td className="py-2 px-2 font-bold text-[#F4F5F5]">{item.label}</td>
              <td className="py-2 px-2 text-right font-mono text-slate-300">
                {item.attempts}
              </td>
              <td className="py-2 px-2 text-right font-mono">
                <span
                  className={`font-bold ${
                    item.accuracyPct >= 80
                      ? "text-[#A1F5AE]"
                      : item.accuracyPct >= 60
                        ? "text-[#F1BE60]"
                        : "text-[#EF6666]"
                  }`}
                >
                  {item.accuracyPct.toFixed(1)}%
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono text-[#F1BE60]">
                {item.avgEvLoss !== null
                  ? `${item.avgEvLoss.toFixed(3)} (${item.evLossCount})`
                  : "—"}
              </td>
              <td className="py-2 px-2 text-right font-mono text-indigo-300">
                {item.highConfidencePct.toFixed(0)}%
              </td>
              <td className="py-2 px-2 text-right">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[0.625rem] font-semibold ${
                    item.sampleConfidence.startsWith("amostra_solida")
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/50"
                      : item.sampleConfidence.startsWith("amostra_em_formacao")
                        ? "bg-amber-950/80 text-amber-300 border border-amber-700/50"
                        : "bg-[#090B0C] text-[#A1A6AA] border border-[#292C2F]"
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
      spotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
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
      nowMs ??
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
  }, [effectiveAdaptiveRecords, history, nowMs]);

  // Unifica as mãos jogadas + mãos colocadas manualmente e calcula a categoria de revisão de cada uma
  const unifiedReviewRows = useMemo(() => {
    const dueSpotIds = new Set(
      adaptiveAnalysis.spacedSchedule.filter((s) => s.isDueNow).map((s) => s.spotId),
    );

    const fromAttempts = effectiveAdaptiveRecords.map((rec) => {
      const explicitTag = manualTags[rec.attemptId];
      const selfTag = trainerSelfReview[`${rec.spotId}::${rec.handClass}`];

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

      return {
        id: rec.attemptId,
        isCustom: false,
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

  return (
    <div className="flex flex-col gap-5">
      {/* BARRA SUPERIOR DE COMANDO: TÍTULO, BOTÃO "ADICIONAR MÃO" E BOTÃO "LIMPAR TUDO" */}
      <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#18B88D]/15 border border-[#18B88D]/40 flex items-center justify-center text-[#A1F5AE]">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#F4F5F5]">
              Diagnóstico &amp; Leaks · Gestão de Revisão de Mãos
            </h2>
            <p className="text-xs text-[#A1A6AA]">
              Filtre e classifique as mãos que <strong className="text-[#F4F5F5]">precisam revisar</strong>, que você{" "}
              <strong className="text-[#EF6666]">errou</strong>,{" "}
              <strong className="text-[#A1F5AE]">acertou</strong> ou{" "}
              <strong className="text-[#F1BE60]">ficou em dúvida</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-[#18B88D] hover:bg-[#22ce9f] text-[#090B0C] font-extrabold text-xs px-3.5 py-2 transition shadow"
          >
            <PlusCircle className="w-4 h-4" />
            {showAddForm ? "Fechar formulário" : "Colocar mão na revisão"}
          </button>

          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              data-testid="stats-clear-all-btn"
              className="flex items-center gap-1.5 rounded-xl bg-[#202224] hover:bg-rose-950/70 border border-[#363A3D] hover:border-rose-600/60 text-xs font-bold text-[#EF6666] px-3.5 py-2 transition"
            >
              <Trash2 className="w-4 h-4" />
              Limpar tudo
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-rose-950/80 border border-rose-600/70 px-3 py-1.5">
              <span className="text-xs font-bold text-rose-200">
                Apagar todo o histórico e marcações?
              </span>
              <button
                type="button"
                onClick={handleClearAllEverything}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition"
              >
                Sim, limpar tudo
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1 rounded-lg bg-[#191B1D] text-slate-300 hover:text-white text-xs font-semibold transition"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FORMULÁRIO COMPACTO PARA COLOCAR / REGISTRAR MÃO MANUALMENTE */}
      {showAddForm && (
        <form
          onSubmit={handleAddCustomHand}
          className="rounded-2xl bg-[#191B1D] border border-[#18B88D]/50 p-4 space-y-3 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[#292C2F] pb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#A1F5AE]">
              Colocar Mão para Revisão (Errei · Acertei · Fiquei em dúvida · Precisa revisar)
            </span>
            <span className="text-[0.6875rem] text-[#A1A6AA]">
              Salvo automaticamente no seu navegador
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs">
            <label className="space-y-1">
              <span className="text-[#A1A6AA] font-semibold">Mão (ex: AKo, 97s)</span>
              <input
                type="text"
                value={newHandClass}
                onChange={(e) => setNewHandClass(e.target.value)}
                placeholder="AKo"
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 font-mono text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[#A1A6AA] font-semibold">Posição</span>
              <select
                value={newHeroPos}
                onChange={(e) => setNewHeroPos(e.target.value)}
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-white"
              >
                {POSITIONS_8MAX.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[#A1A6AA] font-semibold">Stack (BB)</span>
              <input
                type="number"
                min={1}
                max={300}
                value={newStackBb}
                onChange={(e) => setNewStackBb(Number(e.target.value) || 30)}
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 font-mono text-white"
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-[#A1A6AA] font-semibold">Cenário / Spot</span>
              <input
                type="text"
                value={newSpotName}
                onChange={(e) => setNewSpotName(e.target.value)}
                placeholder="Ex: BTN vs BB SRP Flop Ah Kd 7c"
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[#A1A6AA] font-semibold">Sua Ação</span>
              <input
                type="text"
                value={newChosenAction}
                onChange={(e) => setNewChosenAction(e.target.value)}
                placeholder="Ex: Call / Bet 33%"
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
            <div className="sm:col-span-5 space-y-1">
              <span className="text-[#A1A6AA] font-semibold block">
                Classificar esta mão como:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { id: "revisar", label: "Precisa revisar", cls: "border-amber-500/60 text-amber-300" },
                    { id: "errei", label: "Errei", cls: "border-rose-500/60 text-rose-300" },
                    { id: "acertei", label: "Acertei", cls: "border-emerald-500/60 text-emerald-300" },
                    { id: "duvida", label: "Fiquei em dúvida", cls: "border-indigo-500/60 text-indigo-300" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewCategory(opt.id)}
                    className={`py-1.5 px-2 rounded-lg font-bold border text-[0.6875rem] transition ${
                      newCategory === opt.id
                        ? `${opt.cls} bg-[#292C2F]`
                        : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="sm:col-span-5 space-y-1">
              <span className="text-[#A1A6AA] font-semibold">
                Observação / Dúvida (opcional)
              </span>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ex: Fiquei em dúvida entre c-bet 33% e check back..."
                className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-white"
              />
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-[#18B88D] hover:bg-[#22ce9f] text-[#090B0C] font-extrabold text-xs transition"
              >
                Salvar Mão
              </button>
            </div>
          </div>
        </form>
      )}

      {/* BARRA DE FILTROS DE MÃOS: TODAS | PRECISAM REVISAR | ERREI | ACERTEI | FIQUEI EM DÚVIDA */}
      <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#A1F5AE]" />
            <h3 className="text-sm font-bold text-[#F4F5F5]">
              Filtro de Mãos por Status de Revisão
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#A1A6AA] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar mão (ex: AKo), spot ou nota..."
                className="rounded-xl bg-[#090B0C] border border-[#292C2F] pl-8 pr-3 py-1.5 text-xs text-[#F4F5F5] outline-none focus:border-[#18B88D]"
              />
            </div>

            <select
              aria-label="Filtrar mãos por posição"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="rounded-xl bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-xs text-[#F4F5F5] outline-none"
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
                activeCls: "bg-[#18B88D] text-[#090B0C] border-[#18B88D]",
              },
              {
                id: "revisar",
                label: "Precisam revisar",
                count: filterCounts.revisar,
                icon: <BookmarkCheck className="w-3.5 h-3.5" />,
                activeCls: "bg-amber-500 text-[#090B0C] border-amber-400",
              },
              {
                id: "errei",
                label: "Errei",
                count: filterCounts.errei,
                icon: <XCircle className="w-3.5 h-3.5" />,
                activeCls: "bg-[#EF6666] text-[#090B0C] border-[#EF6666]",
              },
              {
                id: "acertei",
                label: "Acertei",
                count: filterCounts.acertei,
                icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                activeCls: "bg-[#18B88D] text-[#090B0C] border-[#A1F5AE]",
              },
              {
                id: "duvida",
                label: "Fiquei em dúvida",
                count: filterCounts.duvida,
                icon: <HelpCircle className="w-3.5 h-3.5" />,
                activeCls: "bg-indigo-500 text-white border-indigo-400",
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
                    : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white hover:bg-[#202224]"
                }`}
              >
                {pill.icon}
                <span>{pill.label}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 font-mono text-[0.65rem] ${
                    active
                      ? "bg-black/25 text-current"
                      : "bg-[#191B1D] text-[#F4F5F5]"
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
          <div className="rounded-xl bg-[#090B0C] border border-dashed border-[#292C2F] p-6 text-center space-y-2">
            <p className="text-xs font-bold text-[#F4F5F5]">
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
            <p className="text-[0.6875rem] text-[#A1A6AA]">
              Jogue mãos no <strong>Modo Trainer</strong> ou clique em{" "}
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="text-[#A1F5AE] underline font-bold"
              >
                Colocar mão na revisão
              </button>{" "}
              acima para registrar mãos que você errou, acertou ou ficou em dúvida.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#292C2F] bg-[#090B0C]">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="text-[#A1A6AA] border-b border-[#292C2F] bg-[#141618]">
                  <th className="py-2.5 px-2.5">Mão / Posição</th>
                  <th className="py-2.5 px-2.5">Spot / Cenário</th>
                  <th className="py-2.5 px-2.5">Sua Ação vs Ref.</th>
                  <th className="py-2.5 px-2.5 text-center">Resultado Técnico</th>
                  <th className="py-2.5 px-2.5">
                    Marcar / Colocar Status (Revisar · Errei · Acertei · Dúvida)
                  </th>
                  <th className="py-2.5 px-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviewRows.slice(0, 50).map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#292C2F]/60 hover:bg-[#191B1D] transition-colors"
                  >
                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                      <span className="font-mono font-extrabold text-sm text-[#F1BE60]">
                        {row.handClass}
                      </span>
                      <span className="ml-2 text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-[#202224] border border-[#363A3D] text-[#F4F5F5]">
                        {row.heroPosition} · {row.stackBb}bb
                      </span>
                    </td>

                    <td className="py-2.5 px-2.5">
                      <div className="font-bold text-[#F4F5F5]">{row.spotName}</div>
                      <div className="text-[0.65rem] text-[#A1A6AA] font-mono">
                        {row.street} · {row.tournamentFormat}
                        {row.note ? ` · Nota: "${row.note}"` : ""}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5">
                      <div className="text-[#F4F5F5]">
                        Escolheu: <strong className="text-[#A1F5AE]">{row.chosenAction}</strong>
                      </div>
                      <div className="text-[0.65rem] text-[#A1A6AA] font-mono">
                        Ref: {row.dominantAction}
                        {row.chosenFreq !== null
                          ? ` (${Math.round(row.chosenFreq * 100)}%)`
                          : ""}
                        {typeof row.evLoss === "number" && row.evUnit
                          ? ` · EV Loss: ${row.evLoss.toFixed(3)} ${row.evUnit}`
                          : ""}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[0.625rem] font-bold ${
                          row.classification === "exact_primary"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-700/60"
                            : row.classification === "valid_mixed" ||
                                row.classification === "low_freq_acceptable"
                              ? "bg-amber-950 text-amber-300 border border-amber-700/60"
                              : row.classification === "unsolved"
                                ? "bg-slate-800 text-slate-300 border border-slate-700"
                                : "bg-rose-950 text-rose-300 border border-rose-700/60"
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

                    <td className="py-2.5 px-2.5">
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
                              activeCls: "bg-rose-500/25 border-rose-400 text-rose-200",
                            },
                            {
                              id: "acertei",
                              label: "Acertei",
                              activeCls: "bg-emerald-500/25 border-emerald-400 text-emerald-200",
                            },
                            {
                              id: "duvida",
                              label: "Dúvida",
                              activeCls: "bg-indigo-500/25 border-indigo-400 text-indigo-200",
                            },
                          ] as const
                        ).map((btn) => {
                          const isCurrent = row.category === btn.id;
                          return (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={() => handleSetManualTag(row.id, btn.id)}
                              className={`px-2 py-1 rounded-lg text-[0.65rem] font-bold border transition ${
                                isCurrent
                                  ? btn.activeCls
                                  : "bg-[#141618] border-[#292C2F] text-[#A1A6AA] hover:text-white"
                              }`}
                            >
                              {btn.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {onPracticeSpot && (
                          <button
                            type="button"
                            onClick={() => onPracticeSpot(row.spotId)}
                            className="px-2.5 py-1 rounded-lg bg-[#18B88D] hover:bg-[#22ce9f] text-[#090B0C] font-extrabold text-[0.6875rem] transition"
                          >
                            Treinar
                          </button>
                        )}
                        {row.isCustom && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomHand(row.id)}
                            title="Remover mão manual"
                            className="p-1 rounded-lg bg-[#191B1D] hover:bg-rose-950 text-[#A1A6AA] hover:text-rose-300 border border-[#292C2F]"
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
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#A1A6AA] font-semibold">
            Mãos Pontuadas
          </div>
          <div className="text-2xl font-extrabold text-[#F4F5F5] mt-1">
            {summary.total}
          </div>
          <div className="text-[0.6875rem] text-[#A1A6AA] mt-1">
            {summary.exact} princ. · {summary.mixed} mix · {summary.errors} desvios
            {summary.unsolvedCount > 0 ? ` · ${summary.unsolvedCount} unsolved` : ""}
          </div>
        </div>

        <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#A1A6AA] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#18B88D]" />
            Aderência Válida
          </div>
          <div className="text-2xl font-extrabold text-[#A1F5AE] mt-1">
            {summary.accuracy}%
          </div>
          <div className="text-[0.6875rem] text-[#A1A6AA] mt-1">
            Inclui ações presentes no mix de referência
          </div>
        </div>

        <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#A1A6AA] font-semibold flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-[#F1BE60]" />
            EV Loss Médio
          </div>
          <div className="text-xl font-extrabold text-[#F1BE60] mt-1 font-mono">
            {summary.avgBbLoss !== null
              ? `${summary.avgBbLoss.toFixed(3)} bb`
              : summary.avgUsdLoss !== null
                ? `${summary.avgUsdLoss.toFixed(3)} $EV`
                : "—"}
          </div>
          <div className="text-[0.6875rem] text-[#A1A6AA] mt-1">
            {summary.bbLossSample > 0
              ? `${summary.bbLossSample} mãos bbEV`
              : summary.usdLossSample > 0
                ? `${summary.usdLossSample} mãos $EV`
                : "Jogue spots com EV"}
          </div>
        </div>

        <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#A1A6AA] font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Proveniência Verificada
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 mt-1 font-mono">
            {adaptiveAnalysis.dimensionalProgress.provenanceCompletenessPct.toFixed(0)}%
          </div>
          <div className="text-[0.6875rem] text-[#A1A6AA] mt-1">
            Proporção jogada em spots VERIFIED
          </div>
        </div>

        <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <div className="text-[0.6875rem] uppercase tracking-wider text-[#A1A6AA] font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-[#EF6666]" />
            Maior Leak por Posição
          </div>
          <div className="text-2xl font-extrabold text-[#EF6666] mt-1">
            {summary.worstPos
              ? `${summary.worstPos.pos} (${summary.worstPos.pct}%)`
              : "—"}
          </div>
          <div className="text-[0.6875rem] text-[#A1A6AA] mt-1">
            {summary.worstPos ? `${summary.worstPos.total} mãos jogadas` : ""}
          </div>
        </div>
      </div>

      {/* ETAPA 5 (Item 3): Classificação Taxonômica de Leaks por Frequência, Impacto e Confiança */}
      <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F4F5F5] flex items-center gap-2">
            <Target className="w-4 h-4 text-[#EF6666]" />
            Diagnóstico Taxonômico de Leaks (Frequência &times; Impacto de EV &times; Ponto Cego de Confiança)
          </h3>
          <span className="text-[0.6875rem] text-[#A1A6AA]">
            Erros com confiança &ldquo;alta&rdquo; recebem peso 1.35&times; (ponto cego)
          </span>
        </div>

        {adaptiveAnalysis.classifiedLeaks.length === 0 ? (
          <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-4 text-xs text-[#A1F5AE] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Nenhum leak classificado até o momento. Continue praticando para gerar o ranking taxonômico de desvios.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {adaptiveAnalysis.classifiedLeaks.map((leak, idx) => (
              <div
                key={leak.leakCategory}
                className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-3.5 flex flex-col justify-between gap-2.5 text-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[0.625rem] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      #{idx + 1} · Impacto {leak.impactScore.toFixed(3)}
                    </span>
                    <span className="text-[0.625rem] font-mono text-[#A1A6AA]">
                      {leak.occurrences} erro(s) ({Math.round(leak.frequencyOfTotalErrors * 100)}%)
                    </span>
                  </div>
                  <div className="font-bold text-[#F4F5F5] text-sm">
                    {leak.label}
                  </div>
                  <p className="text-[0.6875rem] text-[#A1A6AA] leading-relaxed">
                    {leak.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#292C2F] space-y-1 text-[0.6875rem]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>EV Loss médio:</span>
                    <strong className="font-mono text-[#F1BE60]">
                      {leak.avgEvLoss !== null ? `${leak.avgEvLoss.toFixed(3)}` : "Sem EV"}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Pontos cegos (conf. alta):</span>
                    <strong
                      className={`font-mono ${
                        leak.blindSpotCount > 0 ? "text-[#EF6666]" : "text-[#A1A6AA]"
                      }`}
                    >
                      {leak.blindSpotCount}
                    </strong>
                  </div>
                  <div className="text-[0.625rem] text-[#A1A6AA] truncate">
                    Spots: {leak.topAffectedSpots.join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ETAPA 5 (Item 4): Fila de Repetição Espaçada (Leitner Adaptativo) */}
      <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#F4F5F5] flex items-center gap-2">
            <Repeat className="w-4 h-4 text-[#18B88D]" />
            Agenda de Repetição Espaçada (Sistema Leitner Adaptativo · Caixas 0 a 5)
          </h3>
          <span className="text-[0.6875rem] text-[#A1A6AA]">
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
                  : "bg-[#090B0C] border-[#292C2F]"
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[0.625rem] font-mono font-bold px-1.5 py-0.5 rounded ${
                      item.isDueNow
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "bg-emerald-950 text-emerald-300 border border-emerald-700/40"
                    }`}
                  >
                    Caixa {item.boxLevel} ({item.intervalDays}d)
                  </span>
                  <span className="text-[0.625rem] text-[#A1A6AA] flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.isDueNow ? "Revisar Agora" : "Agendado"}
                  </span>
                </div>
                <div className="font-bold text-[#F4F5F5] truncate">
                  {item.spotName}
                </div>
                <div className="text-[0.625rem] text-[#A1A6AA]">
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
                  className="px-2.5 py-1.5 rounded-lg bg-[#18B88D] hover:bg-[#22ce9f] text-[#090B0C] font-extrabold text-[0.6875rem] shrink-0 transition"
                >
                  Treinar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ETAPA 5 (Item 5): Progresso Multidimensional por Posição, Stack, Formato e Street */}
      <div className="rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#F4F5F5] flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-400" />
            Progresso Multidimensional: Posição, Stack, Formato de Torneio e Street
          </h3>

          <div className="flex flex-wrap items-center gap-1 bg-[#090B0C] border border-[#292C2F] rounded-xl p-1">
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
                className={`px-2.5 py-1 rounded-lg text-[0.6875rem] font-semibold transition ${
                  dimensionTab === tab.id
                    ? "bg-[#18B88D] text-[#090B0C] font-bold"
                    : "text-[#A1A6AA] hover:text-white"
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
        <div className="lg:col-span-8 rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4">
          <h3 className="text-sm font-bold text-[#F4F5F5] mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#18B88D]" />
            Mapa de Precisão: Posição &times; Stack Efetivo (MTT 8-Max)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[#A1A6AA]">
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
                  <tr key={pos} className="border-t border-[#292C2F]/70">
                    <td className="py-1.5 px-2 font-bold text-[#F4F5F5]">
                      {pos}
                    </td>
                    {HEATMAP_STACKS.map((st) => {
                      const cell = summary.byCell[`${pos}_${st}`];
                      if (!cell || cell.total === 0) {
                        return (
                          <td key={st} className="p-1 text-center">
                            <div className="rounded-lg bg-[#090B0C] border border-[#292C2F]/60 py-1.5 text-slate-600 font-mono">
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
                            <span className="block text-[0.5625rem] font-normal opacity-75">
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

        <div className="lg:col-span-4 rounded-2xl bg-[#191B1D] border border-[#292C2F] p-4 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#F4F5F5] mb-3">
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
                      <span className="font-mono text-[#A1A6AA]">
                        {stats ? `${pct}% (${stats.total})` : "0 mão"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#090B0C] overflow-hidden">
                      <div
                        className="h-full bg-[#18B88D] transition-all"
                        style={{ width: `${stats ? pct : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#292C2F] flex items-center justify-between">
            <span className="text-[0.6875rem] text-[#A1A6AA] flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-[#18B88D]" />
              {unifiedReviewRows.length} mão(s) registrada(s)
            </span>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="flex items-center gap-1.5 text-xs text-[#EF6666] hover:underline font-semibold transition"
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
