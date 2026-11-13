"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Calculator,
  Grid3X3,
  Settings,
  ShieldCheck,
  Spade,
  Sparkles,
  Target,
} from "lucide-react";
import {
  ADAPTIVE_STORAGE_KEY_V2,
  type AdaptiveExerciseRecord,
  adaptLegacyRangeSpotToCanonical,
  type CanonicalSpot,
  isValidSha256Hex,
  type LegacyRangeSpot,
  type RangeSpot,
  type TrainerModeId,
} from "@/lib/poker";
import { getDidacticAndUnsolvedSpots } from "@/lib/curriculum";
import type { VideoEntry } from "@/lib/rag";
import { AiCoachView } from "./AiCoachView";
import { CurriculumView } from "./CurriculumView";
import { MathIcmLab } from "./MathIcmLab";
import { RangeExplorerView } from "./RangeExplorerView";
import { SettingsModal } from "./SettingsModal";
import { type HandHistoryItem, StatsView } from "./StatsView";
import { TrainerView } from "./TrainerView";

type TabId = "trainer" | "curriculum" | "explorer" | "math" | "coach" | "stats";

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
  const [history, setHistory] = useState<HandHistoryItem[]>([]);
  const [adaptiveRecords, setAdaptiveRecords] = useState<AdaptiveExerciseRecord[]>([]);
  const [verifiedSpots, setVerifiedSpots] = useState<CanonicalSpot[]>([]);
  const [requestedSpotId, setRequestedSpotId] = useState<string | null>(null);
  const [requestedMode, setRequestedMode] = useState<TrainerModeId | null>(null);

  const [apiKey, setApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("gemini-3.8-flash");
  const [hasEnvKey, setHasEnvKey] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
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
        const savedVerified = localStorage.getItem(STORAGE_KEY_VERIFIED);
        if (savedVerified) {
          const parsedV = JSON.parse(savedVerified);
          if (Array.isArray(parsedV)) {
            const sanitized = (parsedV as CanonicalSpot[]).filter((sp) => {
              if (sp?.referenceStrategy?.status !== "VERIFIED") return true;
              const sha = sp.referenceStrategy.solutionSource?.fileSha256;
              return Boolean(sp.referenceStrategy.assumptionsHash && isValidSha256Hex(sha));
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
    const merged = [...verifiedSpots, ...realSolvedSpots, ...curriculumSpots, ...adaptedLegacy];
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
    } catch {
      // Ignora
    }
  };

  const handleImportVerifiedSpot = (newSpot: CanonicalSpot) => {
    setVerifiedSpots((prev) => {
      const next = [newSpot, ...prev.filter((s) => s.spotId !== newSpot.spotId)];
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
    setRequestedSpotId(spotId);
    if (preferredMode) {
      setRequestedMode(preferredMode);
    } else {
      setRequestedMode(null);
    }
    setActiveTab("trainer");
  };

  const hasAnyKey = Boolean(apiKey.trim()) || hasEnvKey;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: "trainer",
      label: "Modo Trainer",
      icon: <Target className="w-4 h-4" />,
    },
    {
      id: "curriculum",
      label: "Currículo & 18 Aulas RegLife",
      icon: <BookOpen className="w-4 h-4" />,
      badge: 18,
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
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Aviso fixo de Estudo Offline (Regra 9 / Critério 11) */}
      <div className="bg-emerald-950/70 border-b border-emerald-800/60 px-4 py-1.5 text-[11px] text-emerald-200 flex items-center justify-center gap-2 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>
          <strong>Uso exclusivo para estudo offline e revisão pós-sessão.</strong>{" "}
          Não oferece HUD, captura de tela de mesas ou assistência em tempo real durante jogos ativos.
        </span>
      </div>

      {/* Header / Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/50">
              <Spade className="w-5 h-5 text-white fill-white/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight text-white">
                  Projeto-Poker
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                  Study Lab V2
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {canonicalSpots.length} spots · 18 aulas RegLife · {totalChunks} trechos · {videos.length} vídeos locais
              </p>
            </div>
          </div>

          {/* Navegação por Abas */}
          <nav className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    active
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        active
                          ? "bg-emerald-800/80 text-emerald-100"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Status API + Engrenagem */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              hasAnyKey
                ? "bg-slate-900 border-emerald-700/60 text-emerald-300 hover:bg-slate-800"
                : "bg-amber-950/50 border-amber-700/60 text-amber-200 hover:bg-amber-900/50"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                hasAnyKey ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
              }`}
            />
            <span>{hasAnyKey ? model : "Configurar AI Studio"}</span>
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-5">
        {activeTab === "trainer" && (
          <TrainerView
            canonicalSpots={canonicalSpots}
            apiKey={apiKey}
            model={model}
            requestedSpotId={requestedSpotId}
            requestedMode={requestedMode}
            onClearRequestedSpot={() => {
              setRequestedSpotId(null);
              setRequestedMode(null);
            }}
            onRecordHistory={handleRecordHistory}
            onRecordAdaptiveAttempt={handleRecordAdaptiveAttempt}
            onImportVerifiedSpot={handleImportVerifiedSpot}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {activeTab === "curriculum" && (
          <CurriculumView onLaunchDrill={handleLaunchDrill} />
        )}

        {activeTab === "explorer" && <RangeExplorerView spots={spots} />}

        {activeTab === "math" && <MathIcmLab />}

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
