"use client";

import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BarChart3,
  AlertTriangle,
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Compass,
  Grid3X3,
  Layers,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import {
  ADAPTIVE_STORAGE_KEY_V2,
  type AdaptiveExerciseRecord,
  adaptLegacyRangeSpotToCanonical,
  type CanonicalSpot,
  computeSpacedRepetitionSchedule,
  filterConfirmedMttCanonicalSpots,
  filterConfirmedMttLegacySpots,
  isSpotIdExcludedFromMtt,
  isValidSha256Hex,
  type LegacyRangeSpot,
  type RangeSpot,
  type TrainerModeId,
} from "@/lib/poker";
import {
  getFatalErrorSchedule,
  loadFatalErrorStudy,
  type FatalErrorAttempt,
} from "@/lib/poker/fatalErrorsStudy";
import { getDidacticAndUnsolvedSpots } from "@/lib/curriculum";
import type { VideoEntry } from "@/lib/rag";
import { AiCoachView } from "./AiCoachView";
import { CleanRangeTrainerView } from "./CleanRangeTrainerView";
import { CurriculumView } from "./CurriculumView";
import { MathIcmLab } from "./MathIcmLab";
import { RangeExplorerView } from "./RangeExplorerView";
import { SettingsModal } from "./SettingsModal";
import { AccessibilityControls } from "./AccessibilityControls";
import { SiteTour } from "./SiteTour";
import { type HandHistoryItem, StatsView } from "./StatsView";
import { TrainerView } from "./TrainerView";
import type { InteractiveDrillTabId } from "./InteractiveDrillsLab";
import { FatalErrorsView } from "./FatalErrorsView";
import { trainerNavigation, type TabId } from "@/lib/studyNavigation";
import type { LabScenario } from "@/lib/poker/labTransfer";

const ReplayerView = lazy(() =>
  import("./ReplayerView").then((module) => ({ default: module.ReplayerView })),
);
const HandLibraryView = lazy(() =>
  import("./HandLibraryView").then((module) => ({
    default: module.HandLibraryView,
  })),
);
const MathLab = lazy(() =>
  import("./MathLab").then((module) => ({ default: module.MathLab })),
);

interface PokerStudioAppProps {
  spots: RangeSpot[];
  realSolvedSpots?: CanonicalSpot[];
  totalChunks: number;
  videos: VideoEntry[];
}

const STORAGE_KEY_HISTORY = "projeto_poker_history_v1";
const STORAGE_KEY_API = "projeto_poker_gemini_key_v1";
const STORAGE_KEY_MODEL = "projeto_poker_gemini_model_v1";
const STORAGE_KEY_VERIFIED = "projeto_poker_verified_spots_v1";

export function PokerStudioApp({
  spots,
  realSolvedSpots = [],
  totalChunks,
  videos,
}: PokerStudioAppProps) {
  const [activeTab, setActiveTabState] = useState<TabId>("trainer");
  const [lastDomainSubTab, setLastDomainSubTab] = useState<{
    treinar: "trainer" | "clean-trainer";
    laboratorio: "math" | "math-lab";
    estudos: "curriculum" | "fatal-errors" | "coach";
  }>({
    treinar: "trainer",
    laboratorio: "math",
    estudos: "curriculum",
  });
  const setActiveTab = useCallback((nextTab: TabId) => {
    setActiveTabState(nextTab);
    if (nextTab === "trainer" || nextTab === "clean-trainer") {
      setLastDomainSubTab((prev) => ({ ...prev, treinar: nextTab }));
    } else if (nextTab === "math" || nextTab === "math-lab") {
      setLastDomainSubTab((prev) => ({ ...prev, laboratorio: nextTab }));
    } else if (
      nextTab === "curriculum" ||
      nextTab === "fatal-errors" ||
      nextTab === "coach"
    ) {
      setLastDomainSubTab((prev) => ({ ...prev, estudos: nextTab }));
    }
  }, []);
  const [showQuickHub, setShowQuickHub] = useState<boolean>(false);
  const [showOfflineNotice, setShowOfflineNotice] = useState<boolean>(true);
  const [labScenario, setLabScenario] = useState<LabScenario | null>(null);
  const [labRequest, setLabRequest] = useState(0);
  const [librarySelection, setLibrarySelection] = useState<{
    recordId: string;
    requestKey: number;
  } | null>(null);
  const [history, setHistory] = useState<HandHistoryItem[]>([]);
  const [adaptiveRecords, setAdaptiveRecords] = useState<
    AdaptiveExerciseRecord[]
  >([]);
  const [fatalAttempts, setFatalAttempts] = useState<FatalErrorAttempt[]>([]);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [verifiedSpots, setVerifiedSpots] = useState<CanonicalSpot[]>([]);
  const [requestedSpotId, setRequestedSpotId] = useState<string | null>(null);
  const [requestedMode, setRequestedMode] = useState<TrainerModeId | null>(null);
  const [requestedSubView, setRequestedSubView] = useState<
    "table" | "interactive" | null
  >(null);
  const [requestedInteractiveMode, setRequestedInteractiveMode] =
    useState<InteractiveDrillTabId | null>(null);
  const [requestedPresetFilter, setRequestedPresetFilter] = useState<{
    street?: "PREFLOP" | "POSTFLOP" | "ALL";
    sessionTargetHands?: number;
  } | null>(null);
  const [trainerRequestNonce, setTrainerRequestNonce] = useState<number>(0);
  const [libraryStudyVersion, setLibraryStudyVersion] = useState<number>(0);

  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("gemini-3.8-flash");
  const [hasEnvKey, setHasEnvKey] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [tourOrigin, setTourOrigin] = useState<TabId | null>(null);

  const handleClearRequestedSpot = useCallback(() => {
    setRequestedSpotId(null);
    setRequestedMode(null);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setNowMs(Date.now());
        const savedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (savedHistory) {
          const parsed = JSON.parse(savedHistory);
          if (Array.isArray(parsed)) setHistory(parsed);
        }
        const savedAdaptive = localStorage.getItem(ADAPTIVE_STORAGE_KEY_V2);
        if (savedAdaptive) {
          const parsedAdaptive = JSON.parse(savedAdaptive);
          if (Array.isArray(parsedAdaptive)) setAdaptiveRecords(parsedAdaptive);
        }
        const loadedFatal = loadFatalErrorStudy(window.localStorage);
        setFatalAttempts(loadedFatal.attempts);

        const savedVerified = localStorage.getItem(STORAGE_KEY_VERIFIED);
        if (savedVerified) {
          const parsedV = JSON.parse(savedVerified);
          if (Array.isArray(parsedV)) {
            const sanitized = (parsedV as CanonicalSpot[]).filter((sp) => {
              if (sp?.referenceStrategy?.status !== "VERIFIED") return true;
              const sha = sp.referenceStrategy.solutionSource?.fileSha256;
              return Boolean(
                sp.referenceStrategy.assumptionsHash && isValidSha256Hex(sha),
              );
            });
            setVerifiedSpots(sanitized);
          }
        }
        const savedKey = localStorage.getItem(STORAGE_KEY_API);
        if (savedKey) setApiKey(savedKey);
        const savedModel = localStorage.getItem(STORAGE_KEY_MODEL);
        if (savedModel) setModel(savedModel);
      } catch {
        // Ignora erro de localStorage
      }
    });

    fetch("/api/coach", {
      headers: { "X-Poker-Coach": "local-v1" },
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.hasEnvKey === "boolean") setHasEnvKey(d.hasEnvKey);
      })
      .catch(() => {});
  }, []);

  const mttSpots = useMemo(() => filterConfirmedMttLegacySpots(spots), [spots]);

  const canonicalSpots = useMemo(() => {
    const curriculumSpots = getDidacticAndUnsolvedSpots();
    const adaptedLegacy = mttSpots.map((s) =>
      adaptLegacyRangeSpotToCanonical(s as LegacyRangeSpot),
    );
    const merged = [
      ...verifiedSpots,
      ...realSolvedSpots,
      ...curriculumSpots,
      ...adaptedLegacy,
    ];
    const seen = new Set<string>();
    const deduped = merged.filter((sp) => {
      if (seen.has(sp.spotId)) return false;
      seen.add(sp.spotId);
      return true;
    });
    return filterConfirmedMttCanonicalSpots(deduped);
  }, [mttSpots, verifiedSpots, realSolvedSpots]);

  const handleRecordHistory = (item: HandHistoryItem) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, 500);
      try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
      } catch {
        // Ignora quota
      }
      return next;
    });
  };

  const handleRecordAdaptiveAttempt = (record: AdaptiveExerciseRecord) => {
    setAdaptiveRecords((prev) => {
      const next = [record, ...prev].slice(0, 500);
      try {
        localStorage.setItem(ADAPTIVE_STORAGE_KEY_V2, JSON.stringify(next));
      } catch {
        // Ignora quota
      }
      return next;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    setAdaptiveRecords([]);
    try {
      localStorage.removeItem(STORAGE_KEY_HISTORY);
      localStorage.removeItem(ADAPTIVE_STORAGE_KEY_V2);
      localStorage.removeItem("poker_trainer_self_review_tags_v1");
      localStorage.removeItem("poker_stats_hand_review_tags_v1");
      localStorage.removeItem("poker_stats_custom_hands_v1");
    } catch {
      // Ignora
    }
  };

  const handleImportVerifiedSpot = (newSpot: CanonicalSpot) => {
    setVerifiedSpots((prev) => {
      const next = [
        newSpot,
        ...prev.filter((s) => s.spotId !== newSpot.spotId),
      ];
      try {
        localStorage.setItem(STORAGE_KEY_VERIFIED, JSON.stringify(next));
      } catch {
        // Ignora quota
      }
      return next;
    });
  };

  const handleSaveSettings = (newKey: string, newModel: string) => {
    setApiKey(newKey);
    setModel(newModel);
    try {
      if (newKey) localStorage.setItem(STORAGE_KEY_API, newKey);
      else localStorage.removeItem(STORAGE_KEY_API);
      localStorage.setItem(STORAGE_KEY_MODEL, newModel);
    } catch {
      // Ignora
    }
  };

  const handleLaunchDrill = (spotId: string, preferredMode?: TrainerModeId) => {
    const next = trainerNavigation(spotId, preferredMode);
    setRequestedSubView("table");
    setRequestedInteractiveMode(null);
    setRequestedPresetFilter(null);
    setRequestedSpotId(next.requestedSpotId);
    setRequestedMode(next.requestedMode);
    setTrainerRequestNonce((n) => n + 1);
    setActiveTab(next.activeTab);
  };

  const dueSummary = useMemo(() => {
    const activeSpotIds = new Set(canonicalSpots.map((s) => s.spotId));
    const mttAdaptive = adaptiveRecords.filter(
      (r) =>
        r.tournamentFormat !== "SNG_SPIN" &&
        r.tournamentFormat !== "CASH" &&
        !isSpotIdExcludedFromMtt(r.spotId, r.spotName),
    );
    const mttHistory = history.filter(
      (h) => !isSpotIdExcludedFromMtt(h.spotId, h.spotName),
    );
    const refTs =
      nowMs ??
      mttAdaptive[0]?.timestamp ??
      mttHistory[0]?.timestamp ??
      1794500000000;
    const trainerDue = computeSpacedRepetitionSchedule(
      mttAdaptive,
      refTs,
    ).filter((s) => s.isDueNow && activeSpotIds.has(s.spotId));
    const fatalDue = getFatalErrorSchedule(fatalAttempts, refTs).filter(
      (s) => s.isDueNow,
    );
    const scored = mttHistory.filter((h) => h.status !== "unsolved");
    const bestCount = scored.filter((h) => h.status === "correct").length;
    const mixCount = scored.filter((h) => h.status === "mixed").length;
    const errorCount = scored.filter((h) => h.status === "error").length;
    const accuracyPct =
      scored.length > 0
        ? Math.round(((bestCount + mixCount) / scored.length) * 100)
        : null;
    return {
      trainerDueCount: trainerDue.length,
      fatalDueCount: fatalDue.length,
      totalDueCount: trainerDue.length + fatalDue.length,
      firstDueSpotId: trainerDue[0]?.spotId ?? null,
      totalHands: mttHistory.length,
      bestCount,
      mixCount,
      errorCount,
      accuracyPct,
    };
  }, [adaptiveRecords, canonicalSpots, fatalAttempts, history, nowMs]);

  const hasAnyKey = Boolean(apiKey.trim()) || hasEnvKey;

  const activeDomain =
    activeTab === "trainer" || activeTab === "clean-trainer"
      ? "treinar"
      : activeTab === "explorer"
        ? "ranges"
        : activeTab === "hand-library"
          ? "biblioteca"
          : activeTab === "replayer"
            ? "replayer"
            : activeTab === "math" || activeTab === "math-lab"
              ? "laboratorio"
              : activeTab === "curriculum" ||
                  activeTab === "fatal-errors" ||
                  activeTab === "coach"
                ? "estudos"
                : "estatisticas";

  const statsBadge =
    adaptiveRecords.length > 0
      ? adaptiveRecords.length
      : history.length > 0
        ? history.length
        : undefined;

  const domainNavItems: {
    id: string;
    domain: typeof activeDomain;
    label: string;
    targetTab: TabId;
    dataTour: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "treinar",
      domain: "treinar",
      label: "Treinar",
      targetTab: lastDomainSubTab.treinar,
      dataTour: "domain-treinar",
      icon: <Target className="w-4 h-4" />,
    },
    {
      id: "ranges",
      domain: "ranges",
      label: "Ranges MTT",
      targetTab: "explorer",
      dataTour: "explorer",
      icon: <Grid3X3 className="w-4 h-4" />,
      badge: mttSpots.length,
    },
    {
      id: "biblioteca",
      domain: "biblioteca",
      label: "Biblioteca",
      targetTab: "hand-library",
      dataTour: "hand-library",
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: "replayer",
      domain: "replayer",
      label: "Replayer",
      targetTab: "replayer",
      dataTour: "replayer",
      icon: <Clapperboard className="w-4 h-4" />,
    },
    {
      id: "laboratorio",
      domain: "laboratorio",
      label: "Laboratório",
      targetTab: lastDomainSubTab.laboratorio,
      dataTour: "domain-laboratorio",
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      id: "estudos",
      domain: "estudos",
      label: "Estudos",
      targetTab: lastDomainSubTab.estudos,
      dataTour: "domain-estudos",
      icon: <Sparkles className="w-4 h-4" />,
      badge: 18,
    },
    {
      id: "estatisticas",
      domain: "estatisticas",
      label: "Estatísticas",
      targetTab: "stats",
      dataTour: "stats",
      icon: <BarChart3 className="w-4 h-4" />,
      badge: statsBadge,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#05070B] text-[#F8FAFC]">
      <div className="h-[3px] w-full bg-gradient-to-r from-[#DC2626] via-[#2563EB] to-[#DC2626]" />
      {/* Aviso de Estudo Offline (compacto e recolhível) */}
      {showOfflineNotice ? (
        <div className="bg-[#090D16] border-b border-[#1E293B] px-3 sm:px-5 py-1 text-xs text-[#93C5FD] flex items-center justify-between gap-2">
          <div className="flex items-center justify-center gap-2 mx-auto text-center">
            <ShieldCheck className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
            <span>
              <strong>
                Uso exclusivo para estudo offline de MTT.
              </strong>{" "}
              <span className="hidden sm:inline">
                Sem HUD, captura de mesas ou assistência em tempo real durante jogos ativos.
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowOfflineNotice(false)}
            className="text-[0.6875rem] font-semibold text-[#CBD5E1] hover:text-white px-2 py-0.5 rounded border border-[#26334A] shrink-0"
            title="Recolher aviso"
          >
            Ocultar
          </button>
        </div>
      ) : (
        <div className="bg-[#090D16] border-b border-[#1E293B] px-3 py-0.5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowOfflineNotice(true)}
            className="text-[0.6875rem] text-[#60A5FA] hover:underline flex items-center gap-1"
          >
            <ShieldCheck className="w-3 h-3 text-[#EF4444]" />
            Estudo offline
          </button>
        </div>
      )}

      {/* Header / Navbar Preto, Azul e Vermelho */}
      <header className="relative lg:sticky top-0 z-30 border-b border-[#1E293B] bg-[#06080E]/95 backdrop-blur-md shadow-[0_6px_28px_rgba(0,0,0,0.65)]">
        <div className="w-full px-3 sm:px-5 lg:px-7 py-2 flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Logo */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-[#DC2626] via-[#1D4ED8] to-[#2563EB] p-[1.5px] shadow-[0_0_14px_rgba(37,99,235,0.4)] shrink-0"
                aria-hidden="true"
              >
                <div className="w-full h-full rounded-[10px] bg-[#05070B] flex items-center justify-center">
                  <span className="text-[1.2rem] leading-none font-black font-serif text-[#F8FAFC] select-none">
                    π
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-[#F8FAFC]">
                    TreinerLM
                  </h1>
                  <span className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-[#2563EB]/20 border border-[#3B82F6]/50 text-[#93C5FD] font-bold">
                    Estúdio Offline MTT
                  </span>
                  <span className="hidden md:inline-block 2xl:hidden text-[0.6875rem] px-1.5 py-0.5 rounded bg-[#DC2626]/15 border border-[#DC2626]/45 text-[#FCA5A5] font-semibold">
                    Desenvolvido por Luiz Miguel N. C.
                  </span>
                </div>
                <p className="hidden sm:block text-[0.6875rem] text-[#94A3B8] truncate font-mono tabular-nums">
                  {canonicalSpots.length} spots MTT · 18 aulas · {totalChunks} trechos
                  · {videos.length} vídeos locais
                </p>
              </div>
            </div>

            {/* Botões de utilidade */}
            <div className="flex flex-wrap items-center gap-1.5 2xl:order-3">
              <AccessibilityControls />
              <button
                type="button"
                aria-expanded={showQuickHub}
                onClick={() => setShowQuickHub((v) => !v)}
                className={`flex min-h-9 items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                  showQuickHub
                    ? "border-[#3B82F6] bg-[#2563EB]/20 text-[#93C5FD]"
                    : "border-[#26334A] bg-[#090D16] text-[#93C5FD] hover:bg-[#131B2C]"
                }`}
                title="Mostrar ou recolher central de ações rápidas"
              >
                <Zap className="h-3.5 w-3.5 text-[#EF4444]" />
                <span className="hidden sm:inline">Acesso rápido</span>
                {showQuickHub ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setTourOrigin(activeTab)}
                className="flex min-h-9 items-center gap-1.5 rounded-xl border border-[#2563EB]/50 bg-[#2563EB]/15 px-2.5 py-1.5 text-xs font-semibold text-[#93C5FD] hover:bg-[#2563EB]/25"
              >
                <Compass className="h-3.5 w-3.5 text-[#F87171]" aria-hidden="true" />
                <span className="hidden md:inline">Fazer um tour</span>
                <span className="md:hidden">Tour</span>
              </button>
              <button
                data-tour="settings"
                type="button"
                onClick={() => setSettingsOpen(true)}
                className={`flex min-h-9 items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  hasAnyKey
                    ? "bg-[#090D16] border-[#2563EB]/55 text-[#93C5FD] hover:bg-[#131B2C]"
                    : "bg-[#090D16] border-[#DC2626]/55 text-[#FCA5A5] hover:bg-[#131B2C]"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasAnyKey ? "bg-[#3B82F6]" : "bg-[#EF4444] animate-pulse"
                  }`}
                />
                <span className="hidden sm:inline">
                  {hasAnyKey ? model : "Configurar IA"}
                </span>
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Navegação Principal Simplificada em 7 Domínios */}
          <nav
            data-tour="navigation"
            aria-label="Áreas principais de estudo"
            className="flex flex-wrap lg:flex-nowrap overflow-x-auto no-scrollbar items-center gap-1 bg-[#0A0E17] border border-[#1E293B] rounded-xl p-1 2xl:order-2"
          >
            {domainNavItems.map((item) => {
              const active = activeDomain === item.domain;
              return (
                <button
                  key={item.id}
                  data-tour={item.dataTour}
                  aria-current={active ? "page" : undefined}
                  type="button"
                  onClick={() => setActiveTab(item.targetTab)}
                  className={`shrink-0 flex items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition ${
                    active
                      ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white shadow-[0_2px_12px_rgba(37,99,235,0.35)]"
                      : "text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-[#131B2C]"
                  }`}
                >
                  {item.icon}
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[0.6875rem] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                        active
                          ? "bg-black/30 text-white font-extrabold"
                          : "bg-[#05070B] text-[#94A3B8]"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sub-barra Contextual de Submódulos por Domínio */}
        <div className="border-t border-[#141D2F] bg-[#070A12] px-3 sm:px-5 lg:px-7 py-1.5">
          <div
            className={`${
              activeDomain === "treinar" ? "flex" : "hidden"
            } flex-wrap items-center gap-1.5`}
          >
            <button
              type="button"
              data-tour="trainer"
              onClick={() => setActiveTab("trainer")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "trainer"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <Target className="w-3.5 h-3.5 text-[#60A5FA]" />
              Modo Trainer
            </button>
            <button
              type="button"
              data-tour="clean-trainer"
              onClick={() => setActiveTab("clean-trainer")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "clean-trainer"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#F87171]" />
              Treiner Limpo
            </button>
          </div>

          <div
            className={`${
              activeDomain === "laboratorio" ? "flex" : "hidden"
            } flex-wrap items-center gap-1.5`}
          >
            <button
              type="button"
              data-tour="math"
              onClick={() => setActiveTab("math")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "math"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-[#60A5FA]" />
              Lab EV &amp; ICM
            </button>
            <button
              type="button"
              data-tour="math-lab"
              onClick={() => setActiveTab("math-lab")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "math-lab"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-[#F87171]" />
              Laboratório Matemático
            </button>
          </div>

          <div
            className={`${
              activeDomain === "estudos" ? "flex" : "hidden"
            } flex-wrap items-center gap-1.5`}
          >
            <button
              type="button"
              data-tour="curriculum"
              onClick={() => setActiveTab("curriculum")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "curriculum"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#60A5FA]" />
              Currículo &amp; 18 Aulas
            </button>
            <button
              type="button"
              data-tour="fatal-errors"
              onClick={() => setActiveTab("fatal-errors")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "fatal-errors"
                  ? "bg-[#DC2626]/25 border-[#EF4444] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-[#F87171]" />
              Erros Fatais
              <span className="text-[0.6875rem] font-mono text-[#FCA5A5]">20</span>
            </button>
            <button
              type="button"
              data-tour="coach"
              onClick={() => setActiveTab("coach")}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                activeTab === "coach"
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#60A5FA]" />
              AI Poker Coach
            </button>
          </div>

          <div
            className={`${
              activeDomain === "ranges" ? "flex" : "hidden"
            } items-center justify-between text-xs text-[#94A3B8]`}
          >
            <span className="font-semibold text-[#CBD5E1]">
              Explorador de Ranges · {mttSpots.length} matrizes MTT 8-Max confirmadas
            </span>
          </div>

          <div
            className={`${
              activeDomain === "biblioteca" ? "flex" : "hidden"
            } items-center justify-between text-xs text-[#94A3B8]`}
          >
            <span className="font-semibold text-[#CBD5E1]">
              Biblioteca de Mãos · Acervo local SQLite e tags de revisão
            </span>
          </div>

          <div
            className={`${
              activeDomain === "replayer" ? "flex" : "hidden"
            } items-center justify-between text-xs text-[#94A3B8]`}
          >
            <span className="font-semibold text-[#CBD5E1]">
              Replayer Ação por Ação · Sincronizado com a Biblioteca e o Laboratório
            </span>
          </div>

          <div
            className={`${
              activeDomain === "estatisticas" ? "flex" : "hidden"
            } items-center justify-between text-xs text-[#94A3B8]`}
          >
            <span className="font-semibold text-[#CBD5E1]">
              Diagnóstico &amp; Leaks · Repetição espaçada e análise por posição
            </span>
          </div>
        </div>
      </header>

      {/* CENTRAL DE TREINAMENTO RÁPIDO (Recolhida por padrão p/ zero poluição visual) */}
      {showQuickHub && (
        <section
          aria-label="Central de treinamento rápido"
          className="border-b border-[#1E293B] bg-[#080B12]/95"
        >
          <div className="w-full px-3 sm:px-5 lg:px-7 py-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("clean-trainer")}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 px-4 py-2 text-xs font-extrabold text-white shadow-lg transition"
                >
                  <Layers className="w-4 h-4" />
                  TREINER LIMPO (RANGES)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRequestedSpotId(null);
                    setRequestedMode(null);
                    setRequestedSubView("table");
                    setRequestedInteractiveMode(null);
                    setRequestedPresetFilter({
                      street: "ALL",
                      sessionTargetHands: 10,
                    });
                    setTrainerRequestNonce((n) => n + 1);
                    setActiveTab("trainer");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] hover:bg-[#3B82F6] px-4 py-2 text-xs font-extrabold text-white shadow-lg transition"
                >
                  <Play className="w-4 h-4 fill-current" />
                  COMEÇAR A TREINAR
                </button>

                {/* Cartões de Atalho de 1 Clique */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSpotId(null);
                      setRequestedMode(null);
                      setRequestedSubView("table");
                      setRequestedInteractiveMode(null);
                      setRequestedPresetFilter({
                        street: "PREFLOP",
                        sessionTargetHands: 10,
                      });
                      setTrainerRequestNonce((n) => n + 1);
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#1E293B] px-2.5 py-1.5 text-xs font-bold text-[#F8FAFC] transition"
                  >
                    Treinar pré-flop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSpotId(null);
                      setRequestedMode(null);
                      setRequestedSubView("table");
                      setRequestedInteractiveMode(null);
                      setRequestedPresetFilter({
                        street: "POSTFLOP",
                        sessionTargetHands: 10,
                      });
                      setTrainerRequestNonce((n) => n + 1);
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#1E293B] px-2.5 py-1.5 text-xs font-bold text-[#F8FAFC] transition"
                  >
                    Treinar pós-flop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("range-builder");
                      setRequestedPresetFilter(null);
                      setTrainerRequestNonce((n) => n + 1);
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#2563EB]/45 px-2.5 py-1.5 text-xs font-bold text-[#93C5FD] transition flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Construtor de ranges
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("pot-odds");
                      setRequestedPresetFilter(null);
                      setTrainerRequestNonce((n) => n + 1);
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#1E293B] px-2.5 py-1.5 text-xs font-bold text-[#F59E0B] transition"
                  >
                    Exercício de matemática
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("microlessons");
                      setRequestedPresetFilter(null);
                      setTrainerRequestNonce((n) => n + 1);
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#1E293B] px-2.5 py-1.5 text-xs font-bold text-[#F8FAFC] transition"
                  >
                    Daily Dose (12 lições)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (dueSummary.firstDueSpotId) {
                        handleLaunchDrill(dueSummary.firstDueSpotId);
                      } else {
                        setActiveTab("stats");
                      }
                    }}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#DC2626]/45 px-2.5 py-1.5 text-xs font-bold text-[#FCA5A5] transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#EF4444]" />
                    Revisar erros
                    {dueSummary.totalDueCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-[#DC2626]/25 px-1.5 py-0.2 font-mono text-[0.6875rem] text-[#FCA5A5]">
                        {dueSummary.totalDueCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("hand-library")}
                    className="rounded-lg bg-[#0F1522] hover:bg-[#162033] border border-[#1E293B] px-2.5 py-1.5 text-xs font-bold text-[#F8FAFC] transition"
                  >
                    Revisar mãos
                  </button>
                </div>
              </div>

              {/* Placar Resumido (Mãos, Precisão, Melhor, Mix, Desvios) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-3 rounded-xl bg-[#0F1522] border border-[#1E293B] px-3 py-1.5">
                  <div>
                    <span className="text-[0.6875rem] uppercase text-[#94A3B8] block">
                      Mãos
                    </span>
                    <strong className="font-mono text-sm text-white">
                      {dueSummary.totalHands}
                    </strong>
                  </div>
                  <div className="h-5 w-px bg-[#1E293B]" />
                  <div>
                    <span className="text-[0.6875rem] uppercase text-[#94A3B8] block">
                      Precisão
                    </span>
                    <strong className="font-mono text-sm text-[#60A5FA]">
                      {dueSummary.accuracyPct !== null
                        ? `${dueSummary.accuracyPct}%`
                        : "—"}
                    </strong>
                  </div>
                  <div className="h-5 w-px bg-[#1E293B]" />
                  <div className="flex items-center gap-1.5 text-[0.6875rem] font-mono">
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#2563EB]/25 text-[#93C5FD]"
                      title="Melhor jogada"
                    >
                      ✓ {dueSummary.bestCount}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#FCD34D]"
                      title="Mix válido"
                    >
                      ≈ {dueSummary.mixCount}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#DC2626]/25 text-[#FCA5A5]"
                      title="Desvio"
                    >
                      ✕ {dueSummary.errorCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-3 sm:py-4">
        {activeTab === "clean-trainer" && (
          <CleanRangeTrainerView spots={mttSpots} />
        )}

        {activeTab === "trainer" && (
          <TrainerView
            canonicalSpots={canonicalSpots}
            apiKey={apiKey}
            model={model}
            requestedSpotId={requestedSpotId}
            requestedMode={requestedMode}
            requestedSubView={requestedSubView}
            requestedInteractiveMode={requestedInteractiveMode}
            requestedPresetFilter={requestedPresetFilter}
            requestNonce={trainerRequestNonce}
            onClearRequestedSpot={handleClearRequestedSpot}
            onRecordHistory={handleRecordHistory}
            onRecordAdaptiveAttempt={handleRecordAdaptiveAttempt}
            onImportVerifiedSpot={handleImportVerifiedSpot}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {activeTab === "curriculum" && (
          <CurriculumView onLaunchDrill={handleLaunchDrill} />
        )}

        {activeTab === "fatal-errors" && (
          <FatalErrorsView
            spots={canonicalSpots}
            onLaunchDrill={handleLaunchDrill}
          />
        )}

        {activeTab === "hand-library" && (
          <Suspense
            fallback={
              <p role="status" className="text-sm text-slate-300">
                Carregando biblioteca…
              </p>
            }
          >
            <HandLibraryView
              refreshVersion={libraryStudyVersion}
              onOpenReplay={(recordId) => {
                setLibrarySelection((old) => ({
                  recordId,
                  requestKey: (old?.requestKey ?? 0) + 1,
                }));
                setActiveTab("replayer");
              }}
            />
          </Suspense>
        )}
        {activeTab === "replayer" && (
          <Suspense
            fallback={
              <p role="status" className="text-sm text-slate-300">
                Carregando replayer…
              </p>
            }
          >
            <ReplayerView
              librarySelection={librarySelection}
              onLibraryStudyChanged={() =>
                setLibraryStudyVersion((v) => v + 1)
              }
              onSendToLab={(scenario) => {
                setLabScenario(scenario);
                setLabRequest((n) => n + 1);
                setActiveTab("math-lab");
              }}
            />
          </Suspense>
        )}

        {activeTab === "explorer" && (
          <RangeExplorerView
            spots={mttSpots}
            verifiedCanonicalSpots={canonicalSpots}
          />
        )}

        {activeTab === "math" && <MathIcmLab />}
        {activeTab === "math-lab" && (
          <Suspense
            fallback={
              <p role="status" className="text-sm text-slate-300">
                Carregando laboratório…
              </p>
            }
          >
            <MathLab
              key={labRequest}
              spots={canonicalSpots}
              scenario={labScenario}
            />
          </Suspense>
        )}

        {activeTab === "coach" && (
          <AiCoachView
            apiKey={apiKey}
            model={model}
            hasEnvKey={hasEnvKey}
            totalChunks={totalChunks}
            videos={videos}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {activeTab === "stats" && (
          <StatsView
            history={history}
            adaptiveRecords={adaptiveRecords}
            onClearHistory={handleClearHistory}
            onPracticeSpot={handleLaunchDrill}
          />
        )}
      </main>

      <footer className="w-full border-t border-[#1E293B] bg-[#06080E] py-3 px-3 sm:px-5 lg:px-7">
        <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-gradient-to-br from-[#DC2626] to-[#2563EB] text-white font-serif font-bold">
              π
            </span>
            <span className="font-bold text-[#F8FAFC]">TreinerLM</span>
            <span>· Laboratório GTO Offline &amp; Revisão</span>
          </div>
          <span className="font-semibold text-[#CBD5E1]">
            Desenvolvido por Luiz Miguel N. C.
          </span>
        </div>
      </footer>

      {tourOrigin !== null && (
        <SiteTour
          onNavigate={setActiveTab}
          onClose={() => {
            setActiveTab(tourOrigin);
            setTourOrigin(null);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          isOpen={settingsOpen}
          apiKey={apiKey}
          model={model}
          hasEnvKey={hasEnvKey}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
