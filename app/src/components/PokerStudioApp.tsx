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
  Spade,
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
  const [activeTab, setActiveTab] = useState<TabId>("trainer");
  const [showQuickHub, setShowQuickHub] = useState<boolean>(true);
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

    fetch("/api/coach")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.hasEnvKey === "boolean") setHasEnvKey(d.hasEnvKey);
      })
      .catch(() => {});
  }, []);

  const canonicalSpots = useMemo(() => {
    const curriculumSpots = getDidacticAndUnsolvedSpots();
    const adaptedLegacy = spots.map((s) =>
      adaptLegacyRangeSpotToCanonical(s as LegacyRangeSpot),
    );
    const merged = [
      ...verifiedSpots,
      ...realSolvedSpots,
      ...curriculumSpots,
      ...adaptedLegacy,
    ];
    const seen = new Set<string>();
    return merged.filter((sp) => {
      if (seen.has(sp.spotId)) return false;
      seen.add(sp.spotId);
      return true;
    });
  }, [spots, verifiedSpots, realSolvedSpots]);

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
    setActiveTab(next.activeTab);
  };

  const dueSummary = useMemo(() => {
    const refTs =
      nowMs ??
      adaptiveRecords[0]?.timestamp ??
      history[0]?.timestamp ??
      1794500000000;
    const trainerDue = computeSpacedRepetitionSchedule(
      adaptiveRecords,
      refTs,
    ).filter((s) => s.isDueNow);
    const fatalDue = getFatalErrorSchedule(fatalAttempts, refTs).filter(
      (s) => s.isDueNow,
    );
    const scored = history.filter((h) => h.status !== "unsolved");
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
      totalHands: history.length,
      bestCount,
      mixCount,
      errorCount,
      accuracyPct,
    };
  }, [adaptiveRecords, fatalAttempts, history, nowMs]);

  const hasAnyKey = Boolean(apiKey.trim()) || hasEnvKey;

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "hand-library",
      label: "Biblioteca de Mãos",
      icon: <BookOpen className="w-3.5 h-3.5" />,
    },
    {
      id: "trainer",
      label: "Modo Trainer",
      icon: <Target className="w-4 h-4" />,
    },
    {
      id: "curriculum",
      label: "Currículo & 18 Aulas",
      icon: <BookOpen className="w-4 h-4" />,
      badge: 18,
    },
    {
      id: "fatal-errors",
      label: "Erros Fatais",
      icon: <AlertTriangle className="w-4 h-4" />,
      badge: 20,
    },
    {
      id: "replayer",
      label: "Replayer",
      icon: <Clapperboard className="w-4 h-4" />,
    },
    {
      id: "explorer",
      label: "Explorador de Ranges",
      icon: <Grid3X3 className="w-4 h-4" />,
      badge: spots.length,
    },
    {
      id: "math",
      label: "Lab EV & ICM",
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      id: "math-lab",
      label: "Laboratório Matemático",
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      id: "coach",
      label: "AI Poker Coach",
      icon: <Sparkles className="w-4 h-4" />,
    },
    {
      id: "stats",
      label: "Diagnóstico & Leaks",
      icon: <BarChart3 className="w-4 h-4" />,
      badge:
        adaptiveRecords.length > 0
          ? adaptiveRecords.length
          : history.length > 0
            ? history.length
            : undefined,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#101112] text-[#F4F5F5]">
      {/* Aviso fixo de Estudo Offline (Regra 9 / Critério 11) */}
      <div className="bg-[#090B0C] border-b border-[#292C2F] px-4 py-1 text-[0.6875rem] text-[#A1F5AE] flex items-center justify-center gap-2 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-[#18B88D] shrink-0" />
        <span>
          <strong>
            Uso exclusivo para estudo offline e revisão pós-sessão.
          </strong>{" "}
          Não oferece HUD, captura de tela de mesas ou assistência em tempo real
          durante jogos ativos.
        </span>
      </div>

      {/* Header / Navbar Estilo GTO Wizard */}
      <header
        className={`${
          activeTab === "replayer" || activeTab === "hand-library"
            ? "relative lg:sticky"
            : "sticky"
        } top-0 z-30 border-b border-[#292C2F] bg-[#090B0C]/95 backdrop-blur-md`}
      >
        <div className="max-w-[1440px] mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2.5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#18B88D] flex items-center justify-center shadow-md">
              <Spade className="w-4 h-4 text-[#090B0C] fill-[#090B0C]/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-[#F4F5F5]">
                  PDF de Poker
                </h1>
                <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[#18B88D]/15 border border-[#18B88D]/40 text-[#A1F5AE] font-bold">
                  Study Lab V2
                </span>
              </div>
              <p className="text-[0.65rem] text-[#A1A6AA]">
                {canonicalSpots.length} spots · 18 aulas · {totalChunks} trechos
                · {videos.length} vídeos locais
              </p>
            </div>
          </div>

          {/* Navegação por Abas */}
          <nav
            data-tour="navigation"
            aria-label="Áreas de estudo"
            className="flex flex-wrap items-center gap-1 bg-[#191B1D] border border-[#292C2F] rounded-xl p-1"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-tour={tab.id}
                  aria-current={active ? "page" : undefined}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    active
                      ? "bg-[#18B88D] text-[#090B0C] shadow"
                      : "text-[#A1A6AA] hover:text-[#F4F5F5] hover:bg-[#202224]"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[0.6rem] px-1.5 py-0.2 rounded-full font-mono ${
                        active
                          ? "bg-[#090B0C]/25 text-[#090B0C] font-extrabold"
                          : "bg-[#090B0C] text-[#A1A6AA]"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-1.5">
            <AccessibilityControls />
            <button
              type="button"
              onClick={() => setShowQuickHub((v) => !v)}
              className="flex min-h-8 items-center gap-1 rounded-xl border border-[#292C2F] bg-[#191B1D] px-2.5 py-1.5 text-xs font-bold text-[#A1F5AE] hover:bg-[#202224]"
              title="Mostrar ou recolher central de ações rápidas"
            >
              <Zap className="h-3.5 w-3.5" />
              Acesso rápido
              {showQuickHub ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setTourOrigin(activeTab)}
              className="flex min-h-8 items-center gap-1.5 rounded-xl border border-[#18B88D]/50 bg-[#18B88D]/10 px-2.5 py-1.5 text-xs font-semibold text-[#A1F5AE] hover:bg-[#18B88D]/20"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden="true" />
              Fazer um tour
            </button>
            {/* Status API + Engrenagem */}
            <button
              data-tour="settings"
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                hasAnyKey
                  ? "bg-[#191B1D] border-[#18B88D]/50 text-[#A1F5AE] hover:bg-[#202224]"
                  : "bg-[#191B1D] border-[#F1BE60]/50 text-[#F1BE60] hover:bg-[#202224]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  hasAnyKey ? "bg-[#18B88D]" : "bg-[#F1BE60] animate-pulse"
                }`}
              />
              <span>{hasAnyKey ? model : "Configurar AI Studio"}</span>
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* CENTRAL DE TREINAMENTO RÁPIDO (Inspirada nas Imagens 04 e 08 do GTO Wizard) */}
      {showQuickHub && (
        <section
          aria-label="Central de treinamento rápido"
          className="border-b border-[#292C2F] bg-[#090B0C]/80"
        >
          <div className="max-w-[1440px] mx-auto px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRequestedSubView("table");
                    setRequestedInteractiveMode(null);
                    setRequestedPresetFilter({
                      street: "ALL",
                      sessionTargetHands: 10,
                    });
                    setActiveTab("trainer");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#18B88D] hover:bg-[#22ce9f] px-4 py-2 text-xs font-extrabold text-[#090B0C] shadow-lg transition"
                >
                  <Play className="w-4 h-4 fill-current" />
                  COMEÇAR A TREINAR
                </button>

                {/* Cartões de Atalho de 1 Clique */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("table");
                      setRequestedInteractiveMode(null);
                      setRequestedPresetFilter({
                        street: "PREFLOP",
                        sessionTargetHands: 10,
                      });
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F4F5F5] transition"
                  >
                    Treinar pré-flop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("table");
                      setRequestedInteractiveMode(null);
                      setRequestedPresetFilter({
                        street: "POSTFLOP",
                        sessionTargetHands: 10,
                      });
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F4F5F5] transition"
                  >
                    Treinar pós-flop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("range-builder");
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#A1F5AE] transition flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Construtor de ranges
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("pot-odds");
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F1BE60] transition"
                  >
                    Exercício de matemática
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedSubView("interactive");
                      setRequestedInteractiveMode("microlessons");
                      setActiveTab("trainer");
                    }}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F4F5F5] transition"
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
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F4F5F5] transition flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#F1BE60]" />
                    Revisar erros
                    {dueSummary.totalDueCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-[#F1BE60]/20 px-1.5 py-0.2 font-mono text-[0.625rem] text-[#F1BE60]">
                        {dueSummary.totalDueCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("hand-library")}
                    className="rounded-lg bg-[#191B1D] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-bold text-[#F4F5F5] transition"
                  >
                    Revisar mãos
                  </button>
                </div>
              </div>

              {/* Placar Resumido Estilo GTO Wizard (Mãos, Precisão, Melhor, Mix, Desvios) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-3 rounded-xl bg-[#191B1D] border border-[#292C2F] px-3 py-1.5">
                  <div>
                    <span className="text-[0.6rem] uppercase text-[#A1A6AA] block">
                      Mãos
                    </span>
                    <strong className="font-mono text-sm text-white">
                      {dueSummary.totalHands}
                    </strong>
                  </div>
                  <div className="h-5 w-px bg-[#292C2F]" />
                  <div>
                    <span className="text-[0.6rem] uppercase text-[#A1A6AA] block">
                      Precisão
                    </span>
                    <strong className="font-mono text-sm text-[#A1F5AE]">
                      {dueSummary.accuracyPct !== null
                        ? `${dueSummary.accuracyPct}%`
                        : "—"}
                    </strong>
                  </div>
                  <div className="h-5 w-px bg-[#292C2F]" />
                  <div className="flex items-center gap-1.5 text-[0.6875rem] font-mono">
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#18B88D]/20 text-[#A1F5AE]"
                      title="Melhor jogada"
                    >
                      ✓ {dueSummary.bestCount}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#F1BE60]/20 text-[#F1BE60]"
                      title="Mix válido"
                    >
                      ≈ {dueSummary.mixCount}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#EF6666]/20 text-[#EF6666]"
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
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-4">
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
              onSendToLab={(scenario) => {
                setLabScenario(scenario);
                setLabRequest((n) => n + 1);
                setActiveTab("math-lab");
              }}
            />
          </Suspense>
        )}

        {activeTab === "explorer" && <RangeExplorerView spots={spots} />}

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
