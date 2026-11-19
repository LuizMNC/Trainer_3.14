"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Expand,
  Flame,
  Gauge,
  Layers,
  Lock,
  Minimize2,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Target,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  type AdaptiveExerciseRecord,
  analyzeSpotReasoning,
  assertSpotAllowedInTechnicalGtoMode,
  type CanonicalSpot,
  classifyAttemptLeak,
  classifyCanonicalSpot,
  classifyCellDistributionIntegrity,
  clearTrainerSession,
  computeMixedAdherenceStats,
  computeSha256Hex,
  type ConfidenceLevel,
  createSeededRng,
  type DrillDifficulty,
  type DrillEvaluationResult,
  evaluateDrillDecision,
  exportSpotMatrixToCsv,
  formatActionFrequencyPtBr,
  formatActionLabelPtBr,
  formatSampleConfidencePtBr,
  getActionVisualStyle,
  getSpotHandIntegrityIssue,
  importExternalSolverSolution,
  importTexasSolverBundle,
  inferCanonicalMttModality,
  inferTournamentFormatCategory,
  loadTrainerSession,
  type MixedAttemptRecord,
  MTT_MODALITY_LABELS,
  parseDesktopPostflopCsvToPayload,
  pickDrillHand,
  type PlayingCard,
  pluralizePtBr,
  POSITIONS_8MAX,
  type RangeSpot,
  resolveActiveMttSpot,
  sampleCardsForHand,
  saveTrainerSession,
  SOLVER_ADAPTER_VERSION,
  type TexasSolverBundleV1,
  type TrainerModeId,
  UNAVAILABLE_MTT_EXERCISE_MESSAGE,
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
import { PokerTable } from "./PokerTable";
import { RangeMatrix } from "./RangeMatrix";
import { useStudioMotion } from "./StudioMotion";
import { TrainingViewport } from "./TrainingViewport";
import { InteractiveDrillsLab, type InteractiveDrillTabId } from "./InteractiveDrillsLab";
import { shouldKeepLaunchedDrill } from "@/lib/studyNavigation";
import type { HandHistoryItem } from "./StatsView";
import type { ProviderId } from "@/lib/ai/types";
import { ASSISTANT_NAME } from "@/lib/ai/assistantIdentity";
import {
  buildSpotEvidence,
  evidenceToSpotContext,
  type SpotEvidence,
} from "@/lib/ai/provenance";
import {
  AssistantResponseCard,
  TheNerdEinstenIcon,
} from "./AssistantResponseCard";

export type SelfReviewTag = "revisar_agora" | "preciso_praticar" | "ja_compreendi";

export interface TrainerViewProps {
  canonicalSpots: CanonicalSpot[];
  apiKey: string;
  model: string;
  provider?: ProviderId;
  credentialTested?: boolean;
  requestedSpotId?: string | null;
  requestedMode?: TrainerModeId | null;
  requestedSubView?: "table" | "interactive" | null;
  requestedInteractiveMode?: InteractiveDrillTabId | null;
  requestedPresetFilter?: {
    street?: "PREFLOP" | "POSTFLOP" | "ALL";
    sessionTargetHands?: number;
  } | null;
  requestNonce?: number;
  onClearRequestedSpot?: () => void;
  onRecordHistory: (item: HandHistoryItem) => void;
  onRecordAdaptiveAttempt?: (record: AdaptiveExerciseRecord) => void;
  onImportVerifiedSpot: (spot: CanonicalSpot) => void;
  onOpenSettings: () => void;
  onSendHandToAssistant?: (payload: { prompt: string; evidence: SpotEvidence }) => void;
}

function toLegacySpot(c: CanonicalSpot): RangeSpot {
  const matrix = c.referenceStrategy.matrixFrequencies ?? {};
  return {
    id: c.spotId,
    name: c.name,
    stackBb: c.effectiveStackBb,
    heroPosition: c.heroPosition,
    villainPosition: c.villainPosition,
    spotType: (c.spotType as RangeSpot["spotType"]) || "rfi",
    source: c.referenceStrategy.solutionSource?.label ?? "UNSOLVED",
    actions: c.legalActions.map((a) => ({
      name: a.name,
      color: a.color,
      pct: a.pct ?? 0,
    })),
    matrix,
  };
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_BADGES: Record<
  CanonicalSpot["referenceStrategy"]["status"],
  { label: string; cls: string }
> = {
  VERIFIED: {
    label: "Solução Verificada (Solver)",
    cls: "bg-[#2563EB]/20 border-[#3B82F6]/50 text-sky-200",
  },
  DIDACTIC_DEMO: {
    label: "Demo Didática (Sintética)",
    cls: "bg-indigo-500/15 border-indigo-400/40 text-indigo-200",
  },
  IMPORTED_CHART_NO_EV: {
    label: "Tabela pré-flop · Sem EV",
    cls: "bg-sky-500/15 border-sky-500/40 text-sky-200",
  },
  UNSOLVED: {
    label: "Sem Solução · Conceitual",
    cls: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  },
};

function getActionWizardColors(actionName: string): {
  bg: string;
  hoverBg: string;
  border: string;
  text: string;
  shortGlyph: string;
} {
  const style = getActionVisualStyle(actionName);
  return {
    bg: style.bg,
    hoverBg: style.hoverBg,
    border: style.border,
    text: style.text,
    shortGlyph: style.shortGlyph,
  };
}

function getFriendlyVerdictPtBr(res: DrillEvaluationResult): {
  badge: string;
  shortTitle: string;
} {
  if (res.integrityBlocked) {
    return {
      badge: "Integridade insuficiente",
      shortTitle: "Correção automática bloqueada: distribuição incompleta.",
    };
  }
  if (res.classification === "exact_primary") {
    return { badge: "Melhor jogada", shortTitle: "Boa decisão!" };
  }
  if (res.classification === "valid_mixed") {
    return { badge: "Jogada correta (Mix)", shortTitle: "Essa ação faz parte do mix." };
  }
  if (res.classification === "low_freq_acceptable") {
    return {
      badge: "Imprecisão leve",
      shortTitle: "Existe uma linha mais frequente neste spot.",
    };
  }
  if (res.classification === "unsolved") {
    return {
      badge: "Reflexão conceitual",
      shortTitle: "Cenário conceitual registrado para revisão.",
    };
  }
  return {
    badge: "Desvio importante",
    shortTitle: "Existe uma linha melhor neste spot.",
  };
}

const SELF_REVIEW_STORAGE_KEY = "poker_trainer_self_review_tags_v1";

export function TrainerView({
  canonicalSpots,
  apiKey,
  model,
  provider,
  credentialTested = false,
  requestedSpotId,
  requestedMode,
  requestedSubView,
  requestedInteractiveMode,
  requestedPresetFilter,
  requestNonce = 0,
  onClearRequestedSpot,
  onRecordHistory,
  onRecordAdaptiveAttempt,
  onImportVerifiedSpot,
  onOpenSettings,
  onSendHandToAssistant,
}: TrainerViewProps) {
  const [subView, setSubView] = useState<"table" | "interactive">("table");
  const [interactiveTab, setInteractiveTab] = useState<InteractiveDrillTabId>("range-builder");

  const [isTraining, setIsTraining] = useState(false);
  const [showTrainingSettings, setShowTrainingSettings] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const { motion, setMotion } = useStudioMotion();
  const nativeFullscreenRef = useRef(false);
  const trainingActiveRef = useRef(false);
  const [dealId, setDealId] = useState(0);
  const [recentDecisions, setRecentDecisions] = useState<
    {
      id: number;
      hand: string;
      action: string;
      headline: string;
      classification: DrillEvaluationResult["classification"];
    }[]
  >([]);

  // Presets de sessão rápida (5, 10, 20 min ou Livre)
  const [sessionTargetHands, setSessionTargetHands] = useState<number>(0); // 0 = Livre
  const [selfReviewMap, setSelfReviewMap] = useState<Record<string, SelfReviewTag>>({});

  // Painéis de revelação progressiva pós-decisão
  const [openWhyPanel, setOpenWhyPanel] = useState(false);
  const [openMathPanel, setOpenMathPanel] = useState(false);
  const [openSourcePanel, setOpenSourcePanel] = useState(false);
  const [showRangePanel, setShowRangePanel] = useState(true);
  const [showLeftMeta, setShowLeftMeta] = useState(false);
  const [showLeftFilters, setShowLeftFilters] = useState(true);
  const [showLeftConfidence, setShowLeftConfidence] = useState(false);
  const [showLeftStats, setShowLeftStats] = useState(true);
  const [showRecentList, setShowRecentList] = useState(false);
  const [showAppearancePanel, setShowAppearancePanel] = useState(false);
  const [tableAppearance, setTableAppearance] = useState<TableAppearanceConfig>(
    DEFAULT_TABLE_APPEARANCE,
  );
  const [feltHexInput, setFeltHexInput] = useState(
    DEFAULT_TABLE_APPEARANCE.feltColor,
  );
  const [railHexInput, setRailHexInput] = useState(
    DEFAULT_TABLE_APPEARANCE.railColor,
  );

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

  function updateTableAppearance(patch: Partial<TableAppearanceConfig>) {
    const next: TableAppearanceConfig = { ...tableAppearance, ...patch };
    saveTableAppearance(next);
    setTableAppearance(next);
    setFeltHexInput(next.feltColor);
    setRailHexInput(next.railColor);
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SELF_REVIEW_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          queueMicrotask(() => {
            setSelfReviewMap(parsed as Record<string, SelfReviewTag>);
          });
        }
      }
    } catch {
      // Ignora falha de leitura local
    }
  }, []);

  const handleSetSelfReview = (reviewKey: string, tag: SelfReviewTag) => {
    setSelfReviewMap((prev) => {
      const next = { ...prev, [reviewKey]: tag };
      try {
        window.localStorage.setItem(SELF_REVIEW_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignora falha de escrita local
      }
      return next;
    });
  };

  const stopTraining = useCallback(() => {
    trainingActiveRef.current = false;
    setIsTraining(false);
    if (nativeFullscreenRef.current) {
      nativeFullscreenRef.current = false;
      if (document.fullscreenElement === document.documentElement)
        void document.exitFullscreen().catch(() => {});
    }
  }, []);

  async function startTraining() {
    if (trainingActiveRef.current) return;
    trainingActiveRef.current = true;
    setShowTrainingSettings(false);
    setIsTraining(true);
    if (!document.fullscreenElement && document.fullscreenEnabled) {
      try {
        await document.documentElement.requestFullscreen();
        nativeFullscreenRef.current =
          document.fullscreenElement === document.documentElement;
        if (!trainingActiveRef.current && nativeFullscreenRef.current) {
          nativeFullscreenRef.current = false;
          await document.exitFullscreen();
        }
      } catch {
        // Ignora quando fullscreen nativo é bloqueado pelo navegador.
      }
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      if (nativeFullscreenRef.current && !document.fullscreenElement) {
        nativeFullscreenRef.current = false;
        trainingActiveRef.current = false;
        setIsTraining(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      trainingActiveRef.current = false;
      if (
        nativeFullscreenRef.current &&
        document.fullscreenElement === document.documentElement
      )
        void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const [trainerMode, setTrainerMode] = useState<TrainerModeId>(() =>
    canonicalSpots.some((s) => s.referenceStrategy.status === "VERIFIED")
      ? "GTO_TECHNICAL"
      : "LEARNING",
  );
  const [blockedSpotWarning, setBlockedSpotWarning] = useState<string | null>(null);
  const [unavailableExerciseNotice, setUnavailableExerciseNotice] = useState<string | null>(null);
  const [hasHydratedTrainerSession, setHasHydratedTrainerSession] = useState<boolean>(false);

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [stackFilter, setStackFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [posFilter, setPosFilter] = useState<string>("all");
  const [streetFilter, setStreetFilter] = useState<"ALL" | "PREFLOP" | "POSTFLOP">("ALL");
  const [difficulty, setDifficulty] = useState<DrillDifficulty>("borderline");

  // Randomizador de frequências (com suporte a seed reproduzível)
  const [useRng, setUseRng] = useState<boolean>(true);
  const [rngSeed, setRngSeed] = useState<string>("pdf-poker-seed-01");
  const [useSeededRng, setUseSeededRng] = useState<boolean>(false);
  const seededStepRef = useRef<number>(1);

  // Nível de confiança para diagnóstico adaptativo
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>("media");
  const [peekMatrix, setPeekMatrix] = useState<boolean>(false);

  const [importOpen, setImportOpen] = useState(false);
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importResultNotice, setImportResultNotice] = useState<string | null>(null);
  const [csvSpotName, setCsvSpotName] = useState(
    "BTN vs BB SRP 30BB chipEV — Ah Kd 7c (Desktop Postflop)",
  );
  const [csvBoardText, setCsvBoardText] = useState("Ah,Kd,7c");
  const [csvPotBb, setCsvPotBb] = useState("5.7");
  const [csvStackBb, setCsvStackBb] = useState("27.9");
  const [csvExploitPct, setCsvExploitPct] = useState("0.5");
  const [csvVersion, setCsvVersion] = useState("0.2.7");

  useEffect(() => {
    const dialog = importDialogRef.current;
    if (!dialog) return;
    if (importOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
      importTriggerRef.current?.focus();
    }
  }, [importOpen]);

  const verifiedOnlySpots = useMemo(
    () => canonicalSpots.filter((s) => s.referenceStrategy.status === "VERIFIED"),
    [canonicalSpots],
  );

  const mttPreflopChartCount = useMemo(
    () =>
      canonicalSpots.filter(
        (s) => s.referenceStrategy.status === "IMPORTED_CHART_NO_EV",
      ).length,
    [canonicalSpots],
  );

  const availableStacks = useMemo(
    () =>
      Array.from(
        new Set(canonicalSpots.map((s) => Math.round(s.effectiveStackBb))),
      ).sort((a, b) => a - b),
    [canonicalSpots],
  );

  const { filteredSpots, modalityUnavailableNotice } = useMemo(() => {
    const basePool =
      trainerMode === "GTO_TECHNICAL" ? verifiedOnlySpots : canonicalSpots;

    const matchWithoutModality = basePool.filter((s) => {
      if (trainerMode === "LEARNING") {
        if (
          sourceFilter === "didactic" &&
          s.referenceStrategy.status !== "DIDACTIC_DEMO"
        )
          return false;
        if (sourceFilter === "verified" && s.referenceStrategy.status !== "VERIFIED")
          return false;
        if (
          sourceFilter === "chart" &&
          s.referenceStrategy.status !== "IMPORTED_CHART_NO_EV"
        )
          return false;
        if (sourceFilter === "unsolved" && s.referenceStrategy.status !== "UNSOLVED")
          return false;
      }

      if (streetFilter === "PREFLOP" && s.street !== "PREFLOP") return false;
      if (streetFilter === "POSTFLOP" && s.street === "PREFLOP") return false;

      if (stackFilter !== "all") {
        if (Math.round(s.effectiveStackBb) !== Number(stackFilter)) return false;
      }

      if (typeFilter !== "all" && s.spotType !== typeFilter) return false;
      if (posFilter !== "all" && s.heroPosition !== posFilter) return false;
      return true;
    });

    const modalityFiltered =
      formatFilter === "all"
        ? matchWithoutModality
        : matchWithoutModality.filter(
            (s) => inferCanonicalMttModality(s) === formatFilter,
          );

    const unavailableNotice =
      formatFilter !== "all" && modalityFiltered.length === 0
        ? `Nenhuma solução ${
            MTT_MODALITY_LABELS[formatFilter as keyof typeof MTT_MODALITY_LABELS] ?? formatFilter
          } disponível neste filtro — exibindo spots chipEV equivalentes até importação de solver dedicado.`
        : null;

    const effective =
      modalityFiltered.length > 0
        ? modalityFiltered
        : matchWithoutModality.length > 0
          ? matchWithoutModality
          : basePool;

    return {
      filteredSpots: effective,
      modalityUnavailableNotice: unavailableNotice,
    };
  }, [
    trainerMode,
    verifiedOnlySpots,
    canonicalSpots,
    sourceFilter,
    streetFilter,
    formatFilter,
    stackFilter,
    typeFilter,
    posFilter,
  ]);

  const [currentSpot, setCurrentSpot] = useState<CanonicalSpot>(
    () =>
      verifiedOnlySpots[0] ??
      canonicalSpots.find((s) => s.spotId === "didactic_rfi_btn_30bb_v1") ??
      canonicalSpots[0],
  );
  const [handClass, setHandClass] = useState<string>("K6s");
  const [cards, setCards] = useState<[PlayingCard, PlayingCard]>([
    { rank: "K", suit: "♠" },
    { rank: "6", suit: "♠" },
  ]);
  const [rngValue, setRngValue] = useState<number>(42);
  const [evaluation, setEvaluation] = useState<DrillEvaluationResult | null>(null);
  const [chosenAction, setChosenAction] = useState<string | null>(null);

  const [streak, setStreak] = useState(0);
  const [sessionRight, setSessionRight] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [mixedAttempts, setMixedAttempts] = useState<MixedAttemptRecord[]>([]);
  const attemptSeqRef = useRef<number>(1);
  const launchedSelectionRef = useRef<{ mode: TrainerModeId; contextKey: string } | null>(
    null,
  );
  const autoDealContextKey = JSON.stringify([
    sourceFilter,
    streetFilter,
    formatFilter,
    stackFilter,
    typeFilter,
    posFilter,
    difficulty,
    useSeededRng,
    rngSeed,
  ]);

  const [coachLoading, setCoachLoading] = useState(false);
  const [coachExplanation, setCoachExplanation] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachSources, setCoachSources] = useState<string[]>([]);

  const computeNextRngRoll = useCallback(() => {
    if (useSeededRng && rngSeed.trim().length > 0) {
      const gen = createSeededRng(`${rngSeed.trim()}#${seededStepRef.current}`);
      seededStepRef.current += 1;
      return gen.nextRoll100();
    }
    return Math.floor(Math.random() * 100) + 1;
  }, [useSeededRng, rngSeed]);

  const dealSpecificSpot = useCallback(
    (spot: CanonicalSpot, targetMode: TrainerModeId = trainerMode) => {
      if (targetMode === "GTO_TECHNICAL") {
        const check = assertSpotAllowedInTechnicalGtoMode(spot);
        if (!check.allowed) {
          setBlockedSpotWarning(
            check.reason ?? "Spot bloqueado no Modo GTO Técnico.",
          );
          const fallbackVerified = verifiedOnlySpots[0];
          if (fallbackVerified) {
            spot = fallbackVerified;
          }
        } else {
          setBlockedSpotWarning(null);
        }
      } else {
        setBlockedSpotWarning(null);
      }

      const legacy = toLegacySpot(spot);
      const nextHand =
        spot.referenceStrategy.status === "UNSOLVED"
          ? "AKs"
          : pickDrillHand(legacy, difficulty);

      let nextCards: [PlayingCard, PlayingCard];
      try {
        nextCards = sampleCardsForHand(nextHand, spot.board);
      } catch {
        nextCards = sampleCardsForHand("22", spot.board);
      }

      const nextRng = computeNextRngRoll();
      setCurrentSpot(spot);
      setHandClass(nextHand);
      setCards(nextCards);
      setDealId((value) => value + 1);
      setRngValue(nextRng);
      setEvaluation(null);
      setChosenAction(null);
      setCurrentAttemptId(null);
      setCoachExplanation(null);
      setCoachError(null);
      setCoachSources([]);
      setPeekMatrix(false);
      setOpenWhyPanel(false);
      setOpenMathPanel(false);
      setOpenSourcePanel(false);
    },
    [difficulty, trainerMode, verifiedOnlySpots, computeNextRngRoll],
  );

  const repeatCurrentHand = useCallback(() => {
    setEvaluation(null);
    setChosenAction(null);
    setCoachExplanation(null);
    setCoachError(null);
    setCoachSources([]);
    setPeekMatrix(false);
    setOpenWhyPanel(false);
    setOpenMathPanel(false);
    setOpenSourcePanel(false);
    setRngValue(computeNextRngRoll());
  }, [computeNextRngRoll]);

  const resetSessionStats = useCallback(() => {
    setStreak(0);
    setSessionRight(0);
    setSessionTotal(0);
    setMixedAttempts([]);
    setRecentDecisions([]);
    clearTrainerSession();
  }, []);

  const dealNextHand = useCallback(
    (pool: CanonicalSpot[] = filteredSpots) => {
      const nextSpot = pool[Math.floor(Math.random() * pool.length)];
      if (nextSpot) {
        dealSpecificSpot(nextSpot);
      }
    },
    [filteredSpots, dealSpecificSpot],
  );

  const lastHandledNonceRef = useRef<number>(-1);
  useEffect(() => {
    const hasPending =
      requestNonce !== lastHandledNonceRef.current ||
      requestedSubView ||
      requestedInteractiveMode ||
      requestedPresetFilter;
    if (!hasPending) return;
    if (requestNonce === lastHandledNonceRef.current && lastHandledNonceRef.current > 0) {
      return;
    }
    lastHandledNonceRef.current = requestNonce;
    queueMicrotask(() => {
      if (requestedSubView) {
        setSubView(requestedSubView);
      }
      if (requestedInteractiveMode) {
        setSubView("interactive");
        setInteractiveTab(requestedInteractiveMode);
      }
      if (requestedPresetFilter) {
        if (requestedPresetFilter.street) {
          setStreetFilter(requestedPresetFilter.street);
          if (requestedPresetFilter.street === "PREFLOP") {
            setTrainerMode("LEARNING");
          } else if (requestedPresetFilter.street === "POSTFLOP") {
            setTrainerMode("GTO_TECHNICAL");
          }
        }
        if (typeof requestedPresetFilter.sessionTargetHands === "number") {
          setSessionTargetHands(requestedPresetFilter.sessionTargetHands);
        }
        if (
          (requestedSubView ?? "table") === "table" &&
          requestedPresetFilter.street
        ) {
          const targetMode: TrainerModeId =
            requestedPresetFilter.street === "PREFLOP"
              ? "LEARNING"
              : requestedPresetFilter.street === "POSTFLOP"
                ? "GTO_TECHNICAL"
                : trainerMode;
          const pool = canonicalSpots.filter((s) => {
            if (targetMode === "GTO_TECHNICAL" && s.referenceStrategy.status !== "VERIFIED") {
              return false;
            }
            if (requestedPresetFilter.street === "PREFLOP") return s.street === "PREFLOP";
            if (requestedPresetFilter.street === "POSTFLOP") return s.street !== "PREFLOP";
            return true;
          });
          const nextPool = pool.length > 0 ? pool : canonicalSpots;
          const picked = nextPool[0];
          if (picked) dealSpecificSpot(picked, targetMode);
        }
      }
    });
    // Intencionalmente dispara apenas quando há nova solicitação explícita do cabeçalho/hub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestNonce, requestedSubView, requestedInteractiveMode, requestedPresetFilter]);

  useEffect(() => {
    let active = true;
    const validSpotIds = new Set(canonicalSpots.map((s) => s.spotId));
    queueMicrotask(() => {
      if (!active) return;
      try {
        const { session: saved } = loadTrainerSession(undefined, validSpotIds);
        if (saved) {
          setTrainerMode(saved.trainerMode);
          setSourceFilter(saved.sourceFilter);
          setStreetFilter(saved.streetFilter);
          setFormatFilter(saved.formatFilter);
          setStackFilter(saved.stackFilter);
          setTypeFilter(saved.typeFilter);
          setPosFilter(saved.posFilter);
          setDifficulty(saved.difficulty);
          setUseRng(saved.useRng);
          setUseSeededRng(saved.useSeededRng);
          setRngSeed(saved.rngSeed);
          setConfidenceLevel(saved.confidenceLevel);
          setSessionTotal(saved.sessionTotal);
          setSessionRight(saved.sessionRight);
          setStreak(saved.streak);
          setMixedAttempts(saved.mixedAttempts);
          setRecentDecisions(saved.recentDecisions);

          if (!requestedSpotId && !requestedPresetFilter && saved.selectedSpotId) {
            const restoredSpot = canonicalSpots.find((s) => s.spotId === saved.selectedSpotId);
            if (restoredSpot) {
              const savedContextKey = JSON.stringify([
                saved.sourceFilter,
                saved.streetFilter,
                saved.formatFilter,
                saved.stackFilter,
                saved.typeFilter,
                saved.posFilter,
                saved.difficulty,
                saved.useSeededRng,
                saved.rngSeed,
              ]);
              launchedSelectionRef.current = {
                mode: saved.trainerMode,
                contextKey: savedContextKey,
              };
              dealSpecificSpot(restoredSpot, saved.trainerMode);
            }
          }
        }
      } catch {
        // Ignora falha de leitura local
      } finally {
        setHasHydratedTrainerSession(true);
      }
    });
    return () => {
      active = false;
    };
    // Hidrata apenas uma vez ao montar com o catálogo MTT carregado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasHydratedTrainerSession) return;
    saveTrainerSession({
      trainerMode,
      sourceFilter:
        sourceFilter === "verified" ||
        sourceFilter === "chart" ||
        sourceFilter === "didactic" ||
        sourceFilter === "unsolved"
          ? sourceFilter
          : "all",
      streetFilter,
      formatFilter:
        formatFilter === "MTT_CHEV" ||
        formatFilter === "MTT_ICM" ||
        formatFilter === "MTT_PKO"
          ? formatFilter
          : "all",
      stackFilter,
      typeFilter:
        typeFilter === "rfi" ||
        typeFilter === "vs_rfi" ||
        typeFilter === "vs_limp" ||
        typeFilter === "push_fold" ||
        typeFilter === "vs_shove"
          ? typeFilter
          : "all",
      posFilter,
      difficulty,
      useRng,
      useSeededRng,
      rngSeed,
      confidenceLevel,
      selectedSpotId: currentSpot?.spotId ?? null,
      sessionTotal,
      sessionRight,
      streak,
      mixedAttempts,
      recentDecisions,
    });
  }, [
    hasHydratedTrainerSession,
    trainerMode,
    sourceFilter,
    streetFilter,
    formatFilter,
    stackFilter,
    typeFilter,
    posFilter,
    difficulty,
    useRng,
    useSeededRng,
    rngSeed,
    confidenceLevel,
    currentSpot?.spotId,
    sessionTotal,
    sessionRight,
    streak,
    mixedAttempts,
    recentDecisions,
  ]);

  useEffect(() => {
    if (requestedSpotId) {
      const resolved = resolveActiveMttSpot(requestedSpotId, canonicalSpots);
      if (resolved.spot) {
        const target = resolved.spot;
        queueMicrotask(() => {
          setUnavailableExerciseNotice(null);
          const effectiveMode: TrainerModeId =
            requestedMode ??
            (target.referenceStrategy.status === "VERIFIED"
              ? "GTO_TECHNICAL"
              : "LEARNING");
          launchedSelectionRef.current = {
            mode: effectiveMode,
            contextKey: autoDealContextKey,
          };
          setSubView("table");
          setTrainerMode(effectiveMode);
          dealSpecificSpot(target, effectiveMode);
          onClearRequestedSpot?.();
        });
      } else {
        queueMicrotask(() => {
          setSubView("table");
          setUnavailableExerciseNotice(
            resolved.unavailableMessage ?? UNAVAILABLE_MTT_EXERCISE_MESSAGE,
          );
          launchedSelectionRef.current = {
            mode: trainerMode,
            contextKey: autoDealContextKey,
          };
          onClearRequestedSpot?.();
        });
      }
      return;
    }
    if (!hasHydratedTrainerSession) return;
    if (
      shouldKeepLaunchedDrill(
        launchedSelectionRef.current,
        trainerMode,
        autoDealContextKey,
      )
    )
      return;
    launchedSelectionRef.current = null;
    queueMicrotask(() => {
      dealNextHand(filteredSpots);
    });
  }, [
    hasHydratedTrainerSession,
    requestedSpotId,
    requestedMode,
    canonicalSpots,
    filteredSpots,
    dealSpecificSpot,
    dealNextHand,
    onClearRequestedSpot,
    trainerMode,
    autoDealContextKey,
  ]);

  const handleModeSwitch = (nextMode: TrainerModeId) => {
    setTrainerMode(nextMode);
    if (
      nextMode === "GTO_TECHNICAL" &&
      currentSpot.referenceStrategy.status !== "VERIFIED"
    ) {
      setBlockedSpotWarning(
        `O spot anterior ('${currentSpot.name}', status: ${currentSpot.referenceStrategy.status}) foi ocultado porque o Modo GTO Técnico exibe exclusivamente soluções VERIFIED.`,
      );
      if (verifiedOnlySpots[0]) {
        dealSpecificSpot(verifiedOnlySpots[0], "GTO_TECHNICAL");
      }
    } else {
      setBlockedSpotWarning(null);
    }
  };

  const handleAction = useCallback(
    (actionName: string) => {
      if (evaluation) return;
      const res = evaluateDrillDecision({
        spot: currentSpot,
        handClass,
        chosenAction: actionName,
        rngValue,
        useRng,
        mode: trainerMode,
        enforceIntegrityGuard: true,
      });
      setChosenAction(actionName);
      setEvaluation(res);

      if (res.integrityBlocked) {
        return;
      }

      setRecentDecisions((previous) =>
        [
          {
            id: attemptSeqRef.current,
            hand: handClass,
            action: actionName,
            headline: res.headline,
            classification: res.classification,
          },
          ...previous,
        ].slice(0, 8),
      );

      // CORREÇÃO DE BUG TEMPORAL: Usa Date.now() real para agendador Leitner e histórico
      const nowTs = Date.now();
      attemptSeqRef.current += 1;
      const attemptId = `adapt-${attemptSeqRef.current}-${nowTs}`;
      setCurrentAttemptId(attemptId);

      const isGood = res.classification !== "ev_error";
      setSessionTotal((t) => t + 1);
      if (isGood) {
        setSessionRight((r) => r + 1);
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
      }

      if (res.classification !== "unsolved") {
        const dist =
          currentSpot.referenceStrategy.actionFrequencies ??
          currentSpot.referenceStrategy.matrixFrequencies?.[handClass];
        if (dist) {
          const integrity = classifyCellDistributionIntegrity(
            dist,
            currentSpot.legalActions.map((a) => a.name),
            handClass,
          );
          if (
            (integrity.status === "COMPLETE" || integrity.status === "ROUNDING_ONLY") &&
            Object.values(dist).some((v) => v > 0.02 && v < 0.96)
          ) {
            setMixedAttempts((prev) =>
              [
                ...prev,
                {
                  spotId: currentSpot.spotId,
                  hand: handClass,
                  chosenAction: actionName,
                  targetDistribution: dist,
                  evLoss: res.evLoss,
                  timestamp: nowTs,
                },
              ].slice(-150),
            );
          }
        }
      }

      onRecordHistory({
        id: `attempt-${attemptSeqRef.current}`,
        timestamp: nowTs,
        spotId: currentSpot.spotId,
        spotName: currentSpot.name,
        stackBb: currentSpot.effectiveStackBb,
        heroPosition: currentSpot.heroPosition,
        spotType: currentSpot.spotType,
        hand: handClass,
        chosenAction: actionName,
        bestAction: res.bestAction ?? "—",
        status:
          res.classification === "unsolved"
            ? "unsolved"
            : res.classification === "exact_primary"
              ? "correct"
              : res.classification === "ev_error"
                ? "error"
                : "mixed",
        chosenFreq: res.chosenFreq ?? 0,
        evLoss: res.evLoss,
        evUnit: res.evUnit,
        strategyStatus: res.strategyStatus,
      });

      if (onRecordAdaptiveAttempt) {
        const dist =
          currentSpot.referenceStrategy.actionFrequencies ??
          currentSpot.referenceStrategy.matrixFrequencies?.[handClass] ??
          null;
        const evMap =
          currentSpot.referenceStrategy.actionEv ??
          currentSpot.referenceStrategy.matrixEv?.[handClass] ??
          null;
        const isAcceptable = res.classification !== "ev_error";
        const leakCat = classifyAttemptLeak({
          spot: currentSpot,
          chosenAction: actionName,
          bestAction: res.bestAction,
          classification: res.classification,
        });

        onRecordAdaptiveAttempt({
          attemptId,
          timestamp: nowTs,
          trainerMode,
          spotId: currentSpot.spotId,
          spotName: currentSpot.name,
          trackId: currentSpot.trackId,
          spotType: currentSpot.spotType,
          handClass,
          chosenAction: actionName,
          referenceStrategySummary: {
            status: currentSpot.referenceStrategy.status,
            dominantAction: res.bestAction,
            dominantFreq: res.bestFreq,
            chosenFreq: res.chosenFreq,
            actionFrequencies: dist,
            actionEv: evMap,
          },
          evLoss: res.evLoss,
          evUnit: res.evUnit,
          confidenceLevel,
          heroPosition: currentSpot.heroPosition,
          effectiveStackBb: currentSpot.effectiveStackBb,
          tournamentFormat: inferTournamentFormatCategory(currentSpot),
          street: currentSpot.street,
          classification: res.classification,
          isAcceptable,
          leakCategory: leakCat,
        });
      }
    },
    [
      evaluation,
      currentSpot,
      handClass,
      rngValue,
      useRng,
      trainerMode,
      confidenceLevel,
      onRecordHistory,
      onRecordAdaptiveAttempt,
    ],
  );

  // Atalhos de teclado na Mesa de Decisão
  useEffect(() => {
    if (subView !== "table") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (
        target?.closest(
          'input, textarea, select, button:not(:disabled), a, [contenteditable="true"]',
        )
      )
        return;

      if (e.code === "Space" && evaluation) {
        e.preventDefault();
        dealNextHand();
        return;
      }
      if (evaluation) return;

      const actions = currentSpot.legalActions;
      const num = Number(e.key);
      if (num >= 1 && num <= actions.length) {
        e.preventDefault();
        handleAction(actions[num - 1].name);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subView, currentSpot, evaluation, dealNextHand, handleAction]);

  const currentHandEvidence = useMemo(
    () =>
      buildSpotEvidence({
        spot: currentSpot,
        handClass,
        chosenAction,
        cardsText: `${cards[0].rank}${cards[0].suit} ${cards[1].rank}${cards[1].suit}`,
      }),
    [currentSpot, handClass, chosenAction, cards],
  );

  const askCoach = async () => {
    if (!provider || !credentialTested) {
      setCoachError(
        `Configure e teste sua chave e o modelo do ${ASSISTANT_NAME} antes de enviar este cenário.`,
      );
      onOpenSettings();
      return;
    }
    setCoachLoading(true);
    setCoachError(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Poker-Coach": "local-v1",
        },
        body: JSON.stringify({
          action: "chat",
          provider,
          apiKey: apiKey || undefined,
          model,
          prompt:
            currentSpot.referenceStrategy.status === "UNSOLVED"
              ? `Este spot está em estado UNSOLVED (sem solução de solver). Explique os conceitos teóricos para ${handClass} em ${currentSpot.name} SEM inventar frequências numéricas de GTO ou EV.`
              : `Acabei de jogar esta mão no Modo ${trainerMode} (minha ação: ${chosenAction ?? "não informada"}). Explique o raciocínio teórico para ${handClass} em ${currentSpot.name} (${currentSpot.referenceStrategy.status}), considerando posição, stack, vantagem de range/nuts e bloqueadores.`,
          spotContext: evidenceToSpotContext(currentHandEvidence, {
            rngValue: useRng ? rngValue : null,
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCoachError(data.error || `Falha ao consultar o ${ASSISTANT_NAME}.`);
      } else {
        setCoachExplanation(data.text);
        setCoachSources(data.sourcesUsed || []);
      }
    } catch {
      setCoachError("Erro de rede ao conectar com o servidor TreinerLM.");
    } finally {
      setCoachLoading(false);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImportJsonText(reader.result);
        setImportResultNotice(
          `Arquivo '${file.name}' carregado (${file.size} bytes). Clique em Validar & Importar.`,
        );
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    setImportResultNotice(null);
    const trimmed = importJsonText.trim();
    if (!trimmed) {
      setImportError(
        "Cole um JSON (SolverAdapter v1.1 / TexasSolver Bundle) ou carregue um CSV do Desktop Postflop.",
      );
      return;
    }

    try {
      if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
        if (firstLine.includes("Hand") && firstLine.includes("%")) {
          const sha256 = await computeSha256Hex(trimmed);
          const boardCards = csvBoardText
            .split(/[,\s]+/)
            .map((c) => c.trim())
            .filter(Boolean);
          const potSize = Number(csvPotBb);
          const effStack = Number(csvStackBb);
          const achExploit = Number(csvExploitPct);
          const csvParsed = parseDesktopPostflopCsvToPayload(trimmed, {
            spotId: `desktop_postflop_${sha256.slice(0, 10)}`,
            spotName: csvSpotName.trim() || "Desktop Postflop Imported Spot",
            trackId: "FLOP_CBET_IP_VS_BB",
            spotType: "flop_cbet_ip",
            format: "MTT",
            effectiveStackBb: Number.isFinite(effStack) ? effStack : 27.9,
            blinds: { sbBb: 0.5, bbBb: 1 },
            anteBbPerPlayer: 0.125,
            rakePct: 0,
            playersCount: 8,
            seats: POSITIONS_8MAX.map((pos, idx) => ({
              seatIndex: idx,
              position: pos,
              stackBb:
                pos === "BTN" || pos === "BB"
                  ? Number.isFinite(effStack)
                    ? effStack
                    : 27.9
                  : 30,
            })),
            heroPosition: "BTN",
            villainPosition: "BB",
            actionHistory: [
              { street: "PREFLOP", position: "BTN", action: "Raise", sizeBb: 2.1 },
              { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
              { street: "FLOP", position: "BB", action: "Check" },
            ],
            street:
              boardCards.length === 4
                ? "TURN"
                : boardCards.length === 5
                  ? "RIVER"
                  : "FLOP",
            board: boardCards,
            potSizeBb: Number.isFinite(potSize) ? potSize : 5.7,
            toCallBb: 0,
            solverVersion: csvVersion.trim() || "0.2.7",
            abstraction: `Desktop Postflop CSV export (${boardCards.join("")})`,
            convergenceTargetPct: 0.5,
            achievedExploitabilityPct: Number.isFinite(achExploit) ? achExploit : 0.5,
            createdAtIso: new Date().toISOString(),
            fileOrReference: `desktop_postflop_${sha256.slice(0, 12)}.csv`,
            fileSha256: sha256,
            heroRangeRef: "app/src/data/ranges_gto.json#30bb_rfi_btn",
            villainRangeRef: "app/src/data/ranges_gto.json#30bb_bb_vs_btn_rfi",
          });

          if (!csvParsed.ok) {
            setImportError(
              `Falha ao validar CSV Desktop Postflop: ${csvParsed.errors.join(" | ")}`,
            );
            return;
          }

          const adapterRes = importExternalSolverSolution(csvParsed.payload);
          if (classifyCanonicalSpot(adapterRes.spot).classification !== "MTT_CONFIRMED") {
            setImportError(
              "Apenas soluções de torneios MTT podem ser adicionadas aos treinos estratégicos do TreinerLM (Spin & Go e Cash Game não são aceitos).",
            );
            return;
          }
          onImportVerifiedSpot(adapterRes.spot);
          if (!adapterRes.ok) {
            setImportError(
              `CSV rejeitado pelo SolverAdapter v${adapterRes.adapterVersion} (-> UNSOLVED): ${adapterRes.errors.join(" | ")}`,
            );
            setTrainerMode("LEARNING");
            dealSpecificSpot(adapterRes.spot, "LEARNING");
            return;
          }
          setImportResultNotice(
            `CSV Desktop Postflop VERIFIED importado com EV por ação! SHA-256: ${sha256.slice(0, 12)}...`,
          );
          setImportOpen(false);
          setImportJsonText("");
          setTrainerMode("GTO_TECHNICAL");
          dealSpecificSpot(adapterRes.spot, "GTO_TECHNICAL");
          return;
        }
      }

      const parsed = JSON.parse(trimmed);

      if (parsed.bundleType === "TEXASSOLVER_NODE_FREQUENCIES_ONLY") {
        const tsRes = importTexasSolverBundle(parsed as Partial<TexasSolverBundleV1>);
        if (classifyCanonicalSpot(tsRes.spot).classification !== "MTT_CONFIRMED") {
          setImportError(
            "Apenas soluções de torneios MTT podem ser adicionadas aos treinos estratégicos do TreinerLM (Spin & Go e Cash Game não são aceitos).",
          );
          return;
        }
        onImportVerifiedSpot(tsRes.spot);
        if (!tsRes.ok) {
          setImportError(
            `Bundle TexasSolver rejeitado (-> UNSOLVED): ${tsRes.errors.join(" | ")}`,
          );
          setTrainerMode("LEARNING");
          dealSpecificSpot(tsRes.spot, "LEARNING");
          return;
        }
        setImportResultNotice(
          `Bundle TexasSolver VERIFIED (frequências reais; EV loss desabilitado por ausência de EV na CLI)! Hash: ${tsRes.assumptionsHash}`,
        );
        setImportOpen(false);
        setImportJsonText("");
        setTrainerMode("GTO_TECHNICAL");
        dealSpecificSpot(tsRes.spot, "GTO_TECHNICAL");
        return;
      }

      if (parsed.schemaVersion || parsed.provenance || parsed.sizings) {
        const adapterRes = importExternalSolverSolution(parsed);
        if (classifyCanonicalSpot(adapterRes.spot).classification !== "MTT_CONFIRMED") {
          setImportError(
            "Apenas soluções de torneios MTT podem ser adicionadas aos treinos estratégicos do TreinerLM (Spin & Go e Cash Game não são aceitos).",
          );
          return;
        }
        onImportVerifiedSpot(adapterRes.spot);
        if (!adapterRes.ok) {
          setImportError(
            `Mantido como UNSOLVED pelo SolverAdapter v${adapterRes.adapterVersion} (proibido inventar dados): ${adapterRes.errors.join(" | ")}`,
          );
          setTrainerMode("LEARNING");
          dealSpecificSpot(adapterRes.spot, "LEARNING");
          return;
        }
        setImportResultNotice(
          `Solução VERIFIED importada com sucesso! Hash: ${adapterRes.assumptionsHash}`,
        );
        setImportOpen(false);
        setImportJsonText("");
        setTrainerMode("GTO_TECHNICAL");
        dealSpecificSpot(adapterRes.spot, "GTO_TECHNICAL");
        return;
      }

      setImportError(
        "Formato legado sem proveniência/hash criptográfico foi bloqueado por segurança. Utilize SolverAdapter v1.1.0, Bundle TexasSolver CLI ou CSV do Desktop Postflop.",
      );
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Conteúdo inválido para importação.",
      );
    }
  };

  const loadBrokenSamplePayload = () => {
    setImportError(null);
    setImportResultNotice(null);
    const brokenSample = {
      schemaVersion: SOLVER_ADAPTER_VERSION,
      spotId: "broken_solver_import_test",
      spotName: "[TESTE DE REJEIÇÃO] Solução Inconsistente -> Vira UNSOLVED",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      effectiveStackBb: 25,
      blinds: { sbBb: 0.5, bbBb: 1 },
      anteBbPerPlayer: 0.125,
      rakePct: 0,
      playersCount: 8,
      seats: [],
      heroPosition: "BTN",
      villainPosition: "CO",
      actionHistory: [],
      street: "PREFLOP",
      board: [],
      potSizeBb: 4.5,
      toCallBb: 2,
      sizings: [
        { actionName: "Call", color: "#22c55e" },
        { actionName: "Fold", color: "#3b82f6" },
      ],
      evUnit: "bbEV",
      icmMode: "ICM",
      ranges: {
        heroRangeDescription: "",
        villainRangeDescription: "",
        sourceReference: "",
      },
      provenance: {
        solverName: "BrokenExport",
        solverVersion: "0.1",
        abstraction: "Incomplete",
        convergenceTargetPct: 1,
        achievedExploitabilityPct: 1,
        createdAtIso: "2026-11-12T12:00:00.000Z",
        license: "Test",
        fileOrReference: "broken.json",
        fileSha256: "0".repeat(64),
      },
      scope: "EXPLICIT_HAND_SUBSET",
      matrixFrequencies: {
        AA: { Call: 0.6, Fold: 0.2 },
      },
      matrixEv: {
        AA: { Call: 1.0, Fold: 5.0 },
      },
    };
    setImportJsonText(JSON.stringify(brokenSample, null, 2));
  };

  const legacyCurrent = useMemo(() => toLegacySpot(currentSpot), [currentSpot]);
  const sessionPct =
    sessionTotal > 0 ? Math.round((sessionRight / sessionTotal) * 100) : 100;
  const adherence = useMemo(
    () => computeMixedAdherenceStats(mixedAttempts),
    [mixedAttempts],
  );

  const reasoning = useMemo(
    () => analyzeSpotReasoning(currentSpot, handClass, cards),
    [currentSpot, handClass, cards],
  );
  const handIntegrityIssue = useMemo(
    () => getSpotHandIntegrityIssue(currentSpot, handClass),
    [currentSpot, handClass],
  );
  const hasPushFoldSpots = useMemo(
    () => canonicalSpots.some((s) => s.spotType === "push_fold"),
    [canonicalSpots],
  );
  const hasVsShoveSpots = useMemo(
    () => canonicalSpots.some((s) => s.spotType === "vs_shove"),
    [canonicalSpots],
  );

  const badge = STATUS_BADGES[currentSpot.referenceStrategy.status];
  const isUnsolved = currentSpot.referenceStrategy.status === "UNSOLVED";
  const currentHandDist =
    currentSpot.referenceStrategy.actionFrequencies ??
    currentSpot.referenceStrategy.matrixFrequencies?.[handClass] ??
    null;
  const currentHandEvMap =
    currentSpot.referenceStrategy.actionEv ??
    currentSpot.referenceStrategy.matrixEv?.[handClass] ??
    null;

  const currentSelfReviewKey =
    currentAttemptId ?? `${currentSpot.spotId}::${handClass}`;
  const currentSelfReviewTag = selfReviewMap[currentSelfReviewKey];
  const friendlyVerdict = evaluation ? getFriendlyVerdictPtBr(evaluation) : null;

  return (
    <TrainingViewport active={isTraining} onClose={stopTraining}>
      <div
        className={`trainer-experience flex flex-col gap-4 ${isTraining ? "trainer-focus" : ""}`}
        data-motion={motion}
      >
        {/* Barra Superior Compacta: Alternador Mesa de Decisão vs Treinos Interativos & Sessão */}
        <div className="trainer-session-bar">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="trainer-eyebrow">TREINADOR PRÁTICO · ESTUDO ATIVO</p>
              <h2 data-trainer-focus tabIndex={-1} className="trainer-session-title">
                {isTraining
                  ? "Sessão Imersiva de Treino"
                  : subView === "table"
                    ? "Mesa de Decisão Rápida"
                    : "Laboratório de Treinos Interativos & Daily Dose"}
              </h2>
            </div>

            {!isTraining && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[#05070B] border border-[#1E293B] p-1">
                <button
                  type="button"
                  onClick={() => setSubView("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    subView === "table"
                      ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white shadow"
                      : "text-[#94A3B8] hover:text-white"
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  Mesa de Decisão
                </button>
                <button
                  type="button"
                  onClick={() => setSubView("interactive")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    subView === "interactive"
                      ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white shadow"
                      : "text-[#94A3B8] hover:text-white"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Treinos Interativos &amp; Daily Dose (6 Modos)
                </button>
              </div>
            )}
          </div>

          <div className="trainer-session-tools">
            <button
              type="button"
              onClick={() => setShowAppearancePanel((open) => !open)}
              aria-expanded={showAppearancePanel}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                showAppearancePanel
                  ? "bg-[#2563EB]/20 border-[#3B82F6] text-[#93C5FD]"
                  : "bg-[#090D16] border-[#26334A] text-[#CBD5E1] hover:border-[#3B82F6]/60 hover:text-white"
              }`}
              title="Personalizar cores da mesa, estilos de cartas e fichas"
            >
              <Palette className="w-3.5 h-3.5 text-[#EF4444]" />
              <span>Personalizar mesa</span>
              <span
                className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                style={{ backgroundColor: tableAppearance.feltColor }}
                aria-hidden="true"
              />
            </button>
            <label className="trainer-motion-label">
              Animações
              <select
                aria-label="Velocidade das animações"
                value={motion}
                onChange={(event) =>
                  setMotion(event.target.value as typeof motion)
                }
              >
                <option value="normal">Normal</option>
                <option value="fast">Rápidas</option>
                <option value="off">Desligadas</option>
              </select>
            </label>
            {isTraining ? (
              <>
                <button
                  type="button"
                  aria-expanded={showTrainingSettings}
                  onClick={() => setShowTrainingSettings((value) => !value)}
                  className="trainer-tool-button"
                >
                  <Settings2 size={16} />
                  Configurar treino
                </button>
                <button
                  type="button"
                  onClick={stopTraining}
                  className="trainer-tool-button"
                >
                  <Minimize2 size={16} />
                  Sair da tela cheia <kbd>Esc</kbd>
                </button>
              </>
            ) : (
              subView === "table" && (
                <button
                  data-trainer-start
                  type="button"
                  onClick={startTraining}
                  className="trainer-start-button"
                >
                  <Play size={16} fill="currentColor" />
                  Tela cheia
                  <Expand size={15} />
                </button>
              )
            )}
          </div>
        </div>

        {/* SUB-VIEW 2: TREINOS INTERATIVOS & DAILY DOSE */}
        {subView === "interactive" && !isTraining ? (
          <InteractiveDrillsLab
            canonicalSpots={canonicalSpots}
            initialTab={interactiveTab}
            requestNonce={requestNonce}
            onLaunchSpotInTable={(spotId: string, mode?: TrainerModeId) => {
              const found = canonicalSpots.find((s) => s.spotId === spotId);
              setSubView("table");
              if (found) {
                const nextMode =
                  mode ??
                  (found.referenceStrategy.status === "VERIFIED"
                    ? "GTO_TECHNICAL"
                    : "LEARNING");
                setTrainerMode(nextMode);
                dealSpecificSpot(found, nextMode);
              }
            }}
          />
        ) : (
          <>
            {showAppearancePanel && (
              <section
                aria-label="Personalização visual da mesa"
                className="rounded-2xl bg-[#0A0E17] border border-[#26334A] p-4 shadow-xl flex flex-col gap-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#EF4444]" />
                    <h3 className="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                      Personalizar Mesa, Cartas &amp; Fichas (TreinerLM)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateTableAppearance({ ...DEFAULT_TABLE_APPEARANCE })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#05070B] border border-[#26334A] text-[0.6875rem] font-semibold text-[#CBD5E1] hover:text-white hover:border-[#3B82F6]"
                    >
                      Restaurar padrão
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAppearancePanel(false)}
                      className="px-2.5 py-1 rounded-lg bg-[#2563EB]/20 border border-[#3B82F6]/50 text-[0.6875rem] font-bold text-[#93C5FD] hover:bg-[#2563EB]/30"
                    >
                      Concluir
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Cores da mesa (presets + qualquer cor via seletor/hex) */}
                  <div className="space-y-2.5">
                    <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#94A3B8] block">
                      Cor da Mesa &amp; Borda (qualquer cor)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {TABLE_COLOR_PRESETS.map((preset) => {
                        const active =
                          tableAppearance.presetId === preset.id &&
                          tableAppearance.feltColor === preset.feltColor &&
                          tableAppearance.railColor === preset.railColor;
                        return (
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
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[0.6875rem] font-semibold transition-colors ${
                              active
                                ? "bg-[#2563EB]/25 border-[#3B82F6] text-sky-200"
                                : "bg-[#05070B] border-[#1E293B] text-[#D0D5DA] hover:border-[#334155]"
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full border border-white/30"
                              style={{ backgroundColor: preset.feltColor }}
                              aria-hidden="true"
                            />
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <label className="flex flex-col gap-1 text-[0.6875rem] text-[#C8CDD2]">
                        <span>Cor do pano (feltro)</span>
                        <div className="flex items-center gap-1.5 bg-[#121417] border border-[#2D3339] rounded-lg px-2 py-1">
                          <input
                            type="color"
                            aria-label="Selecionar qualquer cor da mesa"
                            value={tableAppearance.feltColor}
                            onChange={(event) =>
                              updateTableAppearance({
                                presetId: "custom",
                                feltColor: event.target.value.toUpperCase(),
                              })
                            }
                            className="w-7 h-6 rounded border-0 bg-transparent cursor-pointer p-0"
                          />
                          <input
                            type="text"
                            aria-label="Código hexadecimal da cor da mesa"
                            value={feltHexInput}
                            maxLength={7}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setFeltHexInput(raw);
                              if (/^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
                                updateTableAppearance({
                                  presetId: "custom",
                                  feltColor: normalizeHexColor(
                                    raw,
                                    tableAppearance.feltColor,
                                  ),
                                });
                              }
                            }}
                            onBlur={() =>
                              setFeltHexInput(tableAppearance.feltColor)
                            }
                            className="w-full bg-transparent text-xs font-mono text-[#F8FAFC] focus:outline-none"
                          />
                        </div>
                      </label>

                      <label className="flex flex-col gap-1 text-[0.6875rem] text-[#C8CDD2]">
                        <span>Cor do aro (borda)</span>
                        <div className="flex items-center gap-1.5 bg-[#121417] border border-[#2D3339] rounded-lg px-2 py-1">
                          <input
                            type="color"
                            aria-label="Selecionar qualquer cor da borda da mesa"
                            value={tableAppearance.railColor}
                            onChange={(event) =>
                              updateTableAppearance({
                                presetId: "custom",
                                railColor: event.target.value.toUpperCase(),
                              })
                            }
                            className="w-7 h-6 rounded border-0 bg-transparent cursor-pointer p-0"
                          />
                          <input
                            type="text"
                            aria-label="Código hexadecimal da cor da borda"
                            value={railHexInput}
                            maxLength={7}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setRailHexInput(raw);
                              if (/^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
                                updateTableAppearance({
                                  presetId: "custom",
                                  railColor: normalizeHexColor(
                                    raw,
                                    tableAppearance.railColor,
                                  ),
                                });
                              }
                            }}
                            onBlur={() =>
                              setRailHexInput(tableAppearance.railColor)
                            }
                            className="w-full bg-transparent text-xs font-mono text-[#F8FAFC] focus:outline-none"
                          />
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Estilos de cartas */}
                  <div className="space-y-2">
                    <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#94A3B8] block">
                      Estilo das Cartas
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {CARD_STYLE_OPTIONS.map((option) => {
                        const active = tableAppearance.cardStyle === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() =>
                              updateTableAppearance({
                                cardStyle: option.id as CardStyleId,
                              })
                            }
                            className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                              active
                                ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                                : "bg-[#05070B] border-[#1E293B] text-[#C8CDD2] hover:border-[#334155]"
                            }`}
                          >
                            <div className="text-xs font-bold">
                              {option.label}
                            </div>
                            <div className="text-[0.6875rem] text-[#94A3B8] mt-0.5">
                              {option.hint}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Estilos de fichas */}
                  <div className="space-y-2">
                    <span className="text-[0.6875rem] uppercase tracking-wider font-bold text-[#94A3B8] block">
                      Estilo das Fichas
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                      {CHIP_STYLE_OPTIONS.map((option) => {
                        const active = tableAppearance.chipStyle === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() =>
                              updateTableAppearance({
                                chipStyle: option.id as ChipStyleId,
                              })
                            }
                            className={`text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                              active
                                ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                                : "bg-[#05070B] border-[#1E293B] text-[#C8CDD2] hover:border-[#334155]"
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold">
                                {option.label}
                              </div>
                              <div className="text-[0.6875rem] text-[#94A3B8]">
                                {option.hint}
                              </div>
                            </div>
                            <span
                              className={`w-5 h-5 rounded-full shrink-0 border-2 ${
                                option.id === "neon-pro"
                                  ? "bg-[#090D16] border-[#22D3EE]"
                                  : option.id === "classic-gold"
                                    ? "bg-[#3B2608] border-[#FACC15]"
                                    : "bg-[#B91C1C] border-dashed border-white/90"
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {unavailableExerciseNotice && (
              <div
                role="alert"
                className="rounded-xl bg-amber-950/60 border border-amber-500/70 p-3.5 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold text-amber-200 block">
                      {unavailableExerciseNotice}
                    </span>
                    <span className="text-[0.6875rem] text-amber-200/90 block">
                      O modo exclusivo de torneios MTT do TreinerLM não substitui automaticamente exercícios excluídos ou inválidos. Escolha um exercício MTT válido abaixo:
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackMtt =
                        canonicalSpots.find((s) => s.spotId === "30bb_rfi_btn") ??
                        canonicalSpots.find((s) => s.street === "PREFLOP") ??
                        canonicalSpots[0];
                      setUnavailableExerciseNotice(null);
                      if (fallbackMtt) {
                        setTrainerMode("LEARNING");
                        dealSpecificSpot(fallbackMtt, "LEARNING");
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] text-white font-bold text-[0.6875rem]"
                  >
                    Escolher MTT Pré-Flop
                  </button>
                  {verifiedOnlySpots[0] && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnavailableExerciseNotice(null);
                        setTrainerMode("GTO_TECHNICAL");
                        dealSpecificSpot(verifiedOnlySpots[0], "GTO_TECHNICAL");
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#090D16] border border-[#3B82F6]/60 text-sky-200 hover:text-white font-bold text-[0.6875rem]"
                    >
                      Abrir Solver Verificado
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setUnavailableExerciseNotice(null)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#05070B] border border-[#1E293B] text-slate-300 hover:text-white text-[0.6875rem]"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            )}

            {/* Alerta de Bloqueio caso o usuário tente abrir spot didático/não resolvido no Modo GTO Técnico */}
            {blockedSpotWarning && (
              <div className="rounded-xl bg-amber-950/50 border border-amber-500/60 p-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-300 block">
                      Guarda de Integridade do Modo GTO Técnico
                    </span>
                    {blockedSpotWarning}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockedSpotWarning(null)}
                  className="px-2.5 py-1 rounded-lg bg-[#090D16] border border-[#1E293B] text-slate-300 hover:text-white text-[0.6875rem]"
                >
                  Entendi
                </button>
              </div>
            )}

            {/* Meta de Sessão Rápida Concluída */}
            {sessionTargetHands > 0 && sessionTotal >= sessionTargetHands && (
              <div className="rounded-xl bg-[#0D182C] border border-[#2563EB]/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#60A5FA]" />
                  <div>
                    <p className="text-xs font-bold text-[#F8FAFC]">
                      Meta da sessão atingida! ({sessionTotal}/{sessionTargetHands} mãos ·{" "}
                      {sessionPct}% de precisão)
                    </p>
                    <p className="text-[0.6875rem] text-[#94A3B8]">
                      Você pode continuar praticando livremente ou iniciar um novo bloco.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetSessionStats}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white font-bold text-xs"
                  >
                    Nova Sessão ({sessionTargetHands} mãos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionTargetHands(0)}
                    className="px-3 py-1.5 rounded-lg bg-[#090D16] border border-[#26334A] text-xs text-[#F8FAFC]"
                  >
                    Modo Livre
                  </button>
                </div>
              </div>
            )}

            {/* LAYOUT RESPONSIVO: CELULAR/IPAD RETRATO (1 col, mesa primeiro) · IPAD PAISAGEM (2 cols: mesa + matriz) · DESKTOP (3 cols) */}
            <div
              data-range-visible={showRangePanel}
              className={`trainer-workspace grid grid-cols-1 gap-4 items-start ${
                showRangePanel
                  ? "lg:grid-cols-[minmax(0,1fr)_minmax(345px,400px)] xl:grid-cols-[minmax(255px,300px)_minmax(0,1fr)_minmax(390px,465px)]"
                  : "xl:grid-cols-[minmax(255px,310px)_minmax(0,1fr)]"
              }`}
            >
              {/* COLUNA ESQUERDA: Controles Recolhíveis + Placar da Sessão */}
              <aside
                className="trainer-control-panel order-2 lg:col-span-2 xl:col-span-1 xl:order-1 flex flex-col gap-3 rounded-2xl bg-[#0A0E17] border border-[#1E293B] p-3.5 shadow-lg"
                aria-label="Controles e Estatísticas da Sessão"
              >
                {/* Seletor de Modo: GTO Técnico vs Aprendizagem */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Modo de Estudo
                    </span>
                    <button
                      ref={importTriggerRef}
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="text-[0.6875rem] font-bold text-[#60A5FA] hover:underline flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      Importar Solver
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#05070B] border border-[#1E293B] p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleModeSwitch("GTO_TECHNICAL")}
                      className={`flex flex-col items-start px-2.5 py-2 rounded-lg text-left transition ${
                        trainerMode === "GTO_TECHNICAL"
                          ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white font-bold shadow"
                          : "text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        GTO Técnico
                      </span>
                      <span className="text-[0.6875rem] opacity-90">
                        Verificados ({verifiedOnlySpots.length})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch("LEARNING")}
                      className={`flex flex-col items-start px-2.5 py-2 rounded-lg text-left transition ${
                        trainerMode === "LEARNING"
                          ? "bg-[#2563EB] text-white font-bold shadow"
                          : "text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        Aprendizagem
                      </span>
                      <span className="text-[0.6875rem] opacity-90">
                        Catálogo MTT ({canonicalSpots.length})
                      </span>
                    </button>
                  </div>
                </div>

                {/* Sessões Rápidas Recolhível */}
                <div className="space-y-1.5 border-t border-[#1E293B] pt-2.5">
                  <div className="flex items-center justify-between text-[0.6875rem]">
                    <button
                      type="button"
                      aria-expanded={showLeftMeta}
                      onClick={() => setShowLeftMeta((v) => !v)}
                      className="flex items-center gap-1 font-bold uppercase tracking-wider text-[#94A3B8] hover:text-white"
                    >
                      {showLeftMeta ? <ChevronUp className="w-3.5 h-3.5 text-[#60A5FA]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#60A5FA]" />}
                      Meta da Sessão
                    </button>
                    <button
                      type="button"
                      onClick={resetSessionStats}
                      className="text-[0.6875rem] text-[#94A3B8] hover:text-white flex items-center gap-1"
                      title="Zerar placar da sessão atual"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reiniciar
                    </button>
                  </div>
                  {showLeftMeta && (
                    <>
                      <div className="grid grid-cols-4 gap-1 bg-[#05070B] border border-[#1E293B] p-1 rounded-xl text-[0.6875rem]">
                        {[
                          { hands: 0, label: "Livre" },
                          { hands: 10, label: "5m (10)" },
                          { hands: 25, label: "10m (25)" },
                          { hands: 50, label: "20m (50)" },
                        ].map((preset) => (
                          <button
                            key={preset.hands}
                            type="button"
                            onClick={() => setSessionTargetHands(preset.hands)}
                            className={`py-1 rounded-lg font-bold transition ${
                              sessionTargetHands === preset.hands
                                ? "bg-[#2563EB]/25 text-[#93C5FD] border border-[#3B82F6]/60"
                                : "text-[#94A3B8] hover:text-white"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      {sessionTargetHands > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[0.6875rem] font-mono text-[#94A3B8]">
                            <span>Progresso</span>
                            <span>
                              {Math.min(sessionTotal, sessionTargetHands)}/{sessionTargetHands} mãos
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#05070B] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#DC2626] to-[#2563EB] transition-all"
                              style={{
                                width: `${Math.min(100, Math.round((sessionTotal / sessionTargetHands) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Filtros Recolhíveis */}
                <div className="space-y-2 border-t border-[#1E293B] pt-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      aria-expanded={showLeftFilters}
                      onClick={() => setShowLeftFilters((v) => !v)}
                      className="flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8] hover:text-white"
                    >
                      {showLeftFilters ? <ChevronUp className="w-3.5 h-3.5 text-[#60A5FA]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#60A5FA]" />}
                      Cenário &amp; Filtros
                    </button>
                    {showLeftFilters && (
                      <button
                        type="button"
                        onClick={() => setShowAdvancedFilters((v) => !v)}
                        className="text-[0.6875rem] text-[#60A5FA] hover:underline flex items-center gap-1"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        {showAdvancedFilters ? "Menos" : "Avançados"}
                      </button>
                    )}
                  </div>

                  {showLeftFilters && (
                    <>
                      {/* Filtro rápido Street: Todas / Pré-Flop / Pós-Flop */}
                      <div className="grid grid-cols-3 gap-1 bg-[#05070B] border border-[#1E293B] p-1 rounded-xl text-[0.6875rem]">
                        {(
                          [
                            { id: "ALL", label: "Todas" },
                            { id: "PREFLOP", label: "Pré-Flop" },
                            { id: "POSTFLOP", label: "Pós-Flop" },
                          ] as const
                        ).map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              setStreetFilter(st.id);
                              if (st.id === "PREFLOP" && trainerMode === "GTO_TECHNICAL") {
                                setTrainerMode("LEARNING");
                              }
                            }}
                            className={`py-1 rounded-lg font-bold transition ${
                              streetFilter === st.id
                                ? "bg-[#2563EB] text-white"
                                : "text-[#94A3B8] hover:text-white"
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          aria-label="Foco de dificuldade"
                          value={difficulty}
                          onChange={(e) => setDifficulty(e.target.value as DrillDifficulty)}
                          className="rounded-lg bg-[#05070B] border border-[#1E293B] px-2 py-1.5 text-[0.6875rem] text-[#F59E0B] font-semibold outline-none"
                        >
                          <option value="borderline">Mãos Marginais</option>
                          <option value="mixed">Estratégias Mistas</option>
                          <option value="all">Aleatória (169)</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => setUseRng((v) => !v)}
                          className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[0.6875rem] font-bold border transition ${
                            useRng
                              ? "bg-[#2563EB]/20 border-[#3B82F6]/60 text-[#93C5FD]"
                              : "bg-[#05070B] border-[#1E293B] text-[#94A3B8]"
                          }`}
                        >
                          <Shuffle className="w-3 h-3" />
                          RNG {useRng ? `ON (${rngValue})` : "OFF"}
                        </button>
                      </div>

                      {showAdvancedFilters && (
                        <div className="space-y-1.5 pt-1">
                          {trainerMode === "LEARNING" && (
                            <select
                              aria-label="Filtrar por fonte"
                              value={sourceFilter}
                              onChange={(e) => setSourceFilter(e.target.value)}
                              className="w-full rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                            >
                              <option value="all">
                                Todas as Fontes ({canonicalSpots.length})
                              </option>
                              <option value="verified">
                                Soluções Verificadas ({verifiedOnlySpots.length})
                              </option>
                              <option value="chart">
                                Charts Pré-Flop MTT ({mttPreflopChartCount} s/ EV)
                              </option>
                              <option value="didactic">Demo Didática (Sintética)</option>
                              <option value="unsolved">Sem Solução (Conceitual)</option>
                            </select>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              aria-label="Filtrar por modalidade MTT"
                              value={formatFilter}
                              onChange={(e) => setFormatFilter(e.target.value)}
                              className="rounded-lg bg-[#05070B] border border-[#1E293B] px-2 py-1.5 text-xs text-slate-200 outline-none"
                            >
                              <option value="all">Modalidade: Todo MTT</option>
                              <option value="MTT_CHEV">MTT chipEV</option>
                              <option value="MTT_ICM">MTT ICM ($EV)</option>
                              <option value="MTT_PKO">MTT PKO (Bounty)</option>
                            </select>

                            <select
                              aria-label="Filtrar por stack"
                              value={stackFilter}
                              onChange={(e) => setStackFilter(e.target.value)}
                              className="rounded-lg bg-[#05070B] border border-[#1E293B] px-2 py-1.5 text-xs text-slate-200 outline-none"
                            >
                              <option value="all">Stack: Todos</option>
                              {availableStacks.map((st) => (
                                <option key={st} value={String(st)}>
                                  {st} BB {st === 28 ? "(SRP ~27.9BB)" : ""}
                                </option>
                              ))}
                            </select>
                          </div>

                          {modalityUnavailableNotice && (
                            <div className="rounded-lg bg-amber-950/50 border border-amber-500/45 px-2.5 py-2 text-[0.6875rem] text-amber-100 leading-snug">
                              {modalityUnavailableNotice}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              aria-label="Filtrar por tipo de spot"
                              value={typeFilter}
                              onChange={(e) => setTypeFilter(e.target.value)}
                              className="rounded-lg bg-[#05070B] border border-[#1E293B] px-2 py-1.5 text-xs text-slate-200 outline-none"
                            >
                              <option value="all">Ação: Todas ({filteredSpots.length})</option>
                              <option value="rfi">RFI (Open)</option>
                              <option value="vs_rfi">vs RFI / 3-Bet</option>
                              <option value="vs_limp">BB vs SB Limp</option>
                              <option value="flop_cbet_ip">Flop C-Bet IP</option>
                              <option value="turn_cbet_ip">Turn / River Barrel</option>
                              <option value="bb_vs_cbet">BB vs C-Bet</option>
                              {hasPushFoldSpots && <option value="push_fold">Push / Fold</option>}
                              {hasVsShoveSpots && <option value="vs_shove">vs Shove</option>}
                            </select>

                            <select
                              aria-label="Filtrar por posição do herói"
                              value={posFilter}
                              onChange={(e) => setPosFilter(e.target.value)}
                              className="rounded-lg bg-[#05070B] border border-[#1E293B] px-2 py-1.5 text-xs text-slate-200 outline-none"
                            >
                              <option value="all">Posição: Todas</option>
                              {POSITIONS_8MAX.map((p) => (
                                <option key={p} value={p}>
                                  Herói: {p}
                                </option>
                              ))}
                            </select>
                          </div>

                          {useRng && (
                            <div className="flex items-center justify-between gap-2 bg-[#05070B] border border-[#1E293B] rounded-lg px-2.5 py-1.5">
                              <label className="flex items-center gap-1.5 text-[0.6875rem] text-[#94A3B8] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={useSeededRng}
                                  onChange={(e) => setUseSeededRng(e.target.checked)}
                                  className="accent-[#2563EB]"
                                />
                                Seed fixa:
                              </label>
                              {useSeededRng && (
                                <input
                                  type="text"
                                  value={rngSeed}
                                  onChange={(e) => {
                                    setRngSeed(e.target.value);
                                    seededStepRef.current = 1;
                                  }}
                                  placeholder="seed"
                                  className="w-28 bg-[#090D16] border border-[#1E293B] rounded px-1.5 py-0.5 text-[0.6875rem] font-mono text-[#93C5FD] outline-none"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Seletor Recolhível de Confiança */}
                <div className="space-y-1.5 border-t border-[#1E293B] pt-2.5">
                  <button
                    type="button"
                    aria-expanded={showLeftConfidence}
                    onClick={() => setShowLeftConfidence((v) => !v)}
                    className="w-full flex items-center justify-between text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8] hover:text-white"
                  >
                    <span className="flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-[#EF4444]" />
                      Sua Confiança ({confidenceLevel})
                    </span>
                    {showLeftConfidence ? <ChevronUp className="w-3.5 h-3.5 text-[#60A5FA]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#60A5FA]" />}
                  </button>
                  {showLeftConfidence && (
                    <div className="grid grid-cols-3 gap-1 bg-[#05070B] border border-[#1E293B] rounded-xl p-1">
                      {(
                        [
                          { id: "baixa", label: "Baixa" },
                          { id: "media", label: "Média" },
                          { id: "alta", label: "Alta" },
                        ] as const
                      ).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setConfidenceLevel(c.id)}
                          className={`py-1 rounded-lg text-[0.6875rem] font-bold transition ${
                            confidenceLevel === c.id
                              ? "bg-[#2563EB] text-white border border-[#60A5FA]"
                              : "text-[#94A3B8] hover:text-white"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Placar Recolhível (Mãos, Acertos, Precisão) */}
                <div className="space-y-2 border-t border-[#1E293B] pt-2.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      aria-expanded={showLeftStats}
                      onClick={() => setShowLeftStats((v) => !v)}
                      className="flex items-center gap-1 text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8] hover:text-white"
                    >
                      {showLeftStats ? <ChevronUp className="w-3.5 h-3.5 text-[#60A5FA]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#60A5FA]" />}
                      Estatísticas da Sessão
                    </button>
                    <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#F87171]">
                      <Flame className="w-3.5 h-3.5 text-[#EF4444]" />
                      {streak}
                    </span>
                  </div>

                  {showLeftStats && (
                    <>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-2">
                          <div className="text-[0.6875rem] uppercase text-[#94A3B8]">Mãos</div>
                          <div className="text-base font-extrabold font-mono text-white">
                            {sessionTotal}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#05070B] border border-[#2563EB]/45 p-2">
                          <div className="text-[0.6875rem] uppercase text-[#94A3B8]">Acertos</div>
                          <div className="text-base font-extrabold font-mono text-[#60A5FA]">
                            {sessionRight}
                          </div>
                        </div>
                        <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-2">
                          <div className="text-[0.6875rem] uppercase text-[#94A3B8]">Precisão</div>
                          <div className="text-base font-extrabold font-mono text-white">
                            {sessionTotal > 0 ? `${sessionPct}%` : "—"}
                          </div>
                        </div>
                      </div>

                      {mixedAttempts.length > 0 && (
                        <div className="flex flex-col gap-1 rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-2 text-[0.6875rem]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#CBD5E1] font-semibold">
                              Aderência ao Mix:
                            </span>
                            <span className="font-mono tabular-nums font-bold text-[#60A5FA]">
                              {adherence.reliableAttempts > 0 ? `${adherence.adherencePct}%` : "—"} ({adherence.reliableGroupsCount}{" "}
                              {adherence.reliableGroupsCount === 1 ? "cenário" : "cenários"} ·{" "}
                              {pluralizePtBr(adherence.reliableAttempts, "mão", "mãos")})
                            </span>
                          </div>
                          {adherence.incompleteExcludedAttempts > 0 && (
                            <span className="text-[0.6875rem] text-amber-300">
                              {adherence.incompleteExcludedAttempts} tentativa(s) de célula incompleta excluída(s) da métrica.
                            </span>
                          )}
                          {adherence.reliableAttempts > 0 && adherence.reliableAttempts < 10 && (
                            <span className="text-[0.6875rem] text-[#94A3B8]">
                              {formatSampleConfidencePtBr(adherence.reliableAttempts)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Histórico curto recolhível */}
                      {recentDecisions.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <button
                            type="button"
                            aria-expanded={showRecentList}
                            onClick={() => setShowRecentList((v) => !v)}
                            className="w-full flex items-center justify-between text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8] hover:text-white"
                          >
                            <span>Últimas decisões ({recentDecisions.length})</span>
                            {showRecentList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          {showRecentList && (
                            <ol className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {recentDecisions.map((d) => (
                                <li
                                  key={d.id}
                                  className="flex items-center justify-between rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1 text-[0.6875rem]"
                                >
                                  <span className="font-mono font-bold text-white">
                                    {d.hand} ·{" "}
                                    <span className="text-[#93C5FD]">{d.action}</span>
                                  </span>
                                  <span
                                    className={`text-[0.6875rem] font-semibold ${
                                      d.classification === "ev_error"
                                        ? "text-[#F87171]"
                                        : d.classification === "exact_primary"
                                          ? "text-[#60A5FA]"
                                          : "text-[#F59E0B]"
                                    }`}
                                  >
                                    {d.classification === "exact_primary"
                                      ? "Melhor"
                                      : d.classification === "ev_error"
                                        ? "Desvio"
                                        : "Mix"}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>

              {/* COLUNA CENTRAL: Mesa + Botões de Ação + Feedback Enxuto Pós-Decisão */}
              <div className="trainer-table-column order-1 xl:order-2 flex flex-col gap-3 min-w-0">
                {/* Cabeçalho Compacto do Spot */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#0A0E17] border border-[#1E293B] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[0.6875rem] px-2 py-0.5 rounded border font-bold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[0.6875rem] font-mono text-[#94A3B8]">
                        {currentSpot.format} · {currentSpot.effectiveStackBb}bb ·{" "}
                        {currentSpot.referenceStrategy.assumptions?.icmMode ?? "chipEV"}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC] truncate">
                      {currentSpot.name}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      aria-label="Selecionar spot"
                      value={currentSpot.spotId}
                      onChange={(e) => {
                        const found = filteredSpots.find(
                          (s) => s.spotId === e.target.value,
                        );
                        if (found) dealSpecificSpot(found);
                      }}
                      className="max-w-[165px] sm:max-w-[210px] rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1.5 text-xs text-[#F8FAFC] outline-none focus:border-[#3B82F6]"
                    >
                      {filteredSpots.map((s) => (
                        <option key={s.spotId} value={s.spotId}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => dealNextHand()}
                      className="flex items-center gap-1 rounded-lg bg-[#090D16] hover:bg-[#131B2C] border border-[#26334A] px-2.5 py-1.5 text-xs font-semibold text-[#F8FAFC] transition"
                      title="Sortear nova mão"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#60A5FA]" />
                      Sortear
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRangePanel((v) => !v)}
                      className="flex items-center gap-1 rounded-lg bg-[#05070B] hover:bg-[#131B2C] border border-[#1E293B] px-2.5 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-white transition"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#EF4444]" />
                      {showRangePanel ? "Ocultar 13×13" : "Mostrar 13×13"}
                    </button>
                  </div>
                </div>

                {/* MESA DE POKER ESTILO GTO WIZARD */}
                <PokerTable
                  spot={legacyCurrent}
                  cards={cards}
                  rngValue={rngValue ?? 50}
                  useRng={useRng}
                  board={currentSpot.board}
                  potBbOverride={currentSpot.potBb ?? undefined}
                  anteLabel={`Ante ${currentSpot.anteBbPerPlayer}bb`}
                  formatLabel={`${currentSpot.format} ${currentSpot.playersInitial}-Max`}
                  animationKey={dealId}
                  heroAction={chosenAction}
                  appearance={tableAppearance}
                />

                {handIntegrityIssue && (
                  <div
                    role="status"
                    className="rounded-xl bg-[#1B1406] border border-[#F59E0B]/60 px-3 py-2 text-xs text-[#FDE68A] flex items-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 text-[#FBBF24] shrink-0" />
                    <span>
                      Extração parcial nesta célula ({handClass}: soma {(handIntegrityIssue.sum * 100).toFixed(1)}%). A matriz continua visível para estudo, mas correções automáticas sem base são bloqueadas.
                    </span>
                  </div>
                )}

                {/* BOTÕES DE AÇÃO ESTILO GTO WIZARD (Fold Azul, Check/Call Verde, Bet/Raise Vermelho, All-in Vinho) */}
                <div
                  className="trainer-actions grid grid-cols-2 sm:grid-cols-3 gap-2.5"
                  aria-label="Escolha sua ação"
                >
                  {currentSpot.legalActions.map((act, idx) => {
                    const isChosen = chosenAction === act.name;
                    const isBest = evaluation?.bestAction === act.name;
                    const freqVal = currentHandDist?.[act.name];
                    const evVal = currentHandEvMap?.[act.name];
                    const wizColors = getActionWizardColors(act.name);

                    return (
                      <button
                        key={act.name}
                        type="button"
                        disabled={
                          Boolean(evaluation) ||
                          (trainerMode === "GTO_TECHNICAL" &&
                            currentSpot.referenceStrategy.status !== "VERIFIED")
                        }
                        onClick={() => handleAction(act.name)}
                        style={{
                          backgroundColor: evaluation
                            ? isChosen || isBest
                              ? wizColors.bg
                              : "#090D16"
                            : wizColors.bg,
                          borderColor: isChosen
                            ? "#F59E0B"
                            : evaluation && isBest
                              ? "#60A5FA"
                              : wizColors.border,
                          color: evaluation && !isChosen && !isBest ? "#F8FAFC" : wizColors.text,
                        }}
                        className={`relative flex flex-col items-center justify-center rounded-xl py-3 px-4 font-extrabold border-2 transition shadow-md ${
                          evaluation
                            ? isChosen || isBest
                              ? "ring-2 ring-[#F59E0B]/60 opacity-100"
                              : "opacity-55"
                            : "hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm sm:text-base tracking-wide">
                          <span
                            className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-current text-[0.6875rem] font-mono font-bold"
                            aria-hidden="true"
                          >
                            {wizColors.shortGlyph}
                          </span>
                          <span>{formatActionLabelPtBr(act.name)}</span>
                        </span>
                        <span className="text-[0.6875rem] font-mono tabular-nums mt-0.5">
                          {evaluation && !isUnsolved && freqVal !== undefined
                            ? `${formatActionFrequencyPtBr(freqVal)}${
                                evVal !== undefined &&
                                currentSpot.referenceStrategy.evUnit
                                  ? ` (${evVal >= 0 ? "+" : ""}${evVal.toFixed(2)} ${currentSpot.referenceStrategy.evUnit})`
                                  : ""
                              }`
                            : `Tecla ${idx + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* FEEDBACK IMEDIATO PÓS-DECISÃO + FLUXO "REPETIR MÃO" / "PRÓXIMA MÃO" + REVELAÇÃO PROGRESSIVA */}
                {evaluation && friendlyVerdict && (
                  <div
                    role="status"
                    className={`trainer-feedback rounded-2xl border p-4 flex flex-col gap-3.5 shadow-xl ${
                      evaluation.classification === "exact_primary"
                        ? "bg-[#0A0E17] border-[#2563EB]/80"
                        : evaluation.classification === "unsolved"
                          ? "bg-[#0A0E17] border-[#F59E0B]/60"
                          : evaluation.classification === "ev_error"
                            ? "bg-[#1A0B10] border-[#DC2626]/80"
                            : "bg-[#0A0E17] border-[#F59E0B]/70"
                    }`}
                  >
                    {/* Linha 1: Veredito Claro + Botões Repetir Mão e Próxima Mão */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {evaluation.integrityBlocked ? (
                          <ShieldAlert className="w-7 h-7 text-[#F59E0B] shrink-0 mt-0.5" />
                        ) : evaluation.classification === "ev_error" ? (
                          <XCircle className="w-7 h-7 text-[#EF4444] shrink-0 mt-0.5" />
                        ) : evaluation.classification === "unsolved" ? (
                          <BookOpen className="w-7 h-7 text-[#F59E0B] shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2
                            className={`w-7 h-7 shrink-0 mt-0.5 ${
                              evaluation.classification === "exact_primary"
                                ? "text-[#3B82F6]"
                                : "text-[#F59E0B]"
                            }`}
                          />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[0.6875rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                                evaluation.integrityBlocked
                                  ? "bg-[#F59E0B]/20 text-[#FCD34D]"
                                  : evaluation.classification === "exact_primary"
                                    ? "bg-[#2563EB]/25 text-[#93C5FD]"
                                    : evaluation.classification === "ev_error"
                                      ? "bg-[#DC2626]/25 text-[#FCA5A5]"
                                      : "bg-[#F59E0B]/20 text-[#FCD34D]"
                              }`}
                            >
                              {friendlyVerdict.badge}
                            </span>
                            <span className="text-xs font-mono text-[#94A3B8]">
                              Mão: <strong className="text-white">{handClass}</strong> · Sua
                              ação:{" "}
                              <strong className="text-white">{chosenAction}</strong>
                            </span>
                          </div>
                          <h4 className="font-extrabold text-[#F8FAFC] text-base mt-1">
                            {friendlyVerdict.shortTitle}
                          </h4>
                          <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
                            {evaluation.detail}
                          </p>
                          {evaluation.integrityWarning && !evaluation.integrityBlocked && (
                            <p className="text-[0.6875rem] text-[#FCD34D] mt-1">
                              {evaluation.integrityWarning}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Ações Principais de Loop Rápido */}
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={repeatCurrentHand}
                          className="flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl bg-[#090D16] hover:bg-[#131B2C] border border-[#26334A] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Repetir mão
                        </button>
                        <button
                          type="button"
                          onClick={() => dealNextHand()}
                          className="flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 px-4 py-2 text-xs font-extrabold text-white transition shadow-lg"
                        >
                          Próxima mão (Espaço)
                        </button>
                      </div>
                    </div>

                    {/* Barra Visual de Partição das Frequências (se houver distribuição conhecida) */}
                    {!isUnsolved && currentHandDist && (
                      <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[0.6875rem]">
                          <span className="text-[#94A3B8] font-semibold">
                            Frequências de referência para{" "}
                            <strong className="text-white">{handClass}</strong>
                            {useRng ? ` (Rolagem RNG: ${rngValue})` : ""}
                          </span>
                          {useRng && evaluation.rngTargetAction && (
                            <span className="font-mono text-[#93C5FD]">
                              Alvo RNG: <strong>{evaluation.rngTargetAction}</strong>
                            </span>
                          )}
                        </div>
                        <div className="relative h-5 w-full rounded-lg overflow-hidden bg-[#0F1522] border border-[#1E293B] flex">
                          {currentSpot.legalActions.map((act) => {
                            const pct = (currentHandDist[act.name] ?? 0) * 100;
                            if (pct <= 0) return null;
                            const wizColors = getActionWizardColors(act.name);
                            const labelPtBr = formatActionLabelPtBr(act.name);
                            return (
                              <div
                                key={act.name}
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: wizColors.bg,
                                  color: wizColors.text,
                                }}
                                className="h-full shrink-0 flex items-center justify-center text-[0.6875rem] font-bold font-mono tabular-nums overflow-hidden whitespace-nowrap"
                                title={`${labelPtBr}: ${pct}%`}
                              >
                                {pct >= 12 ? `${labelPtBr} ${pct}%` : ""}
                              </div>
                            );
                          })}
                          {useRng && (
                            <div
                              style={{
                                left: `${Math.min(99, Math.max(1, rngValue))}%`,
                              }}
                              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_#fff]"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Autoavaliação / Marcação Rápida de Revisão */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E293B] pt-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#94A3B8] mr-1">
                          Autoavaliação:
                        </span>
                        {(
                          [
                            {
                              id: "revisar_agora",
                              label: "Revisar agora",
                              activeCls:
                                "bg-[#EF4444]/20 border-[#EF4444] text-[#FCA5A5]",
                            },
                            {
                              id: "preciso_praticar",
                              label: "Preciso praticar",
                              activeCls:
                                "bg-[#F59E0B]/20 border-[#F59E0B] text-[#FCD34D]",
                            },
                            {
                              id: "ja_compreendi",
                              label: "Já compreendi",
                              activeCls:
                                "bg-[#2563EB]/25 border-[#3B82F6] text-[#93C5FD]",
                            },
                          ] as const
                        ).map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() =>
                              handleSetSelfReview(
                                currentSelfReviewKey,
                                tag.id,
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[0.6875rem] font-bold border transition ${
                              currentSelfReviewTag === tag.id
                                ? tag.activeCls
                                : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                            }`}
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>

                      {/* Botões TheNerdEinsten */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={askCoach}
                          disabled={coachLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] hover:bg-[#3B82F6] disabled:opacity-50 px-3 py-1.5 text-[0.6875rem] font-bold text-white transition"
                        >
                          <TheNerdEinstenIcon className="w-3.5 h-3.5" />
                          {coachLoading ? "Analisando..." : `Perguntar ao ${ASSISTANT_NAME}`}
                        </button>
                        {onSendHandToAssistant && (
                          <button
                            type="button"
                            onClick={() => {
                              stopTraining();
                              onSendHandToAssistant({
                                prompt: `Analise minha decisão (${chosenAction ?? "sem ação"}) com ${handClass} em ${currentSpot.name} (${currentSpot.effectiveStackBb} BB).`,
                                evidence: currentHandEvidence,
                              });
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-[#0F1B33] hover:bg-[#162647] border border-[#2563EB]/50 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-sky-200 transition"
                          >
                            Enviar mão para análise pós-sessão
                          </button>
                        )}
                      </div>
                    </div>

                    {/* BOTÕES DE REVELAÇÃO PROGRESSIVA (Sob Demanda) */}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-[#1E293B] pt-2.5">
                      <button
                        type="button"
                        aria-expanded={openWhyPanel}
                        onClick={() => setOpenWhyPanel((v) => !v)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold border transition ${
                          openWhyPanel
                            ? "bg-[#2563EB]/20 border-[#3B82F6]/60 text-[#93C5FD]"
                            : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {openWhyPanel ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        Entenda o motivo
                      </button>

                      <button
                        type="button"
                        aria-expanded={openMathPanel}
                        onClick={() => setOpenMathPanel((v) => !v)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold border transition ${
                          openMathPanel
                            ? "bg-[#2563EB]/20 border-[#3B82F6]/60 text-[#93C5FD]"
                            : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {openMathPanel ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        Ver a matemática
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRangePanel(true)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold bg-[#05070B] border border-[#1E293B] text-[#94A3B8] hover:text-white transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Mostrar estratégia / Comparar ranges
                      </button>

                      <button
                        type="button"
                        aria-expanded={openSourcePanel}
                        onClick={() => setOpenSourcePanel((v) => !v)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold border transition ${
                          openSourcePanel
                            ? "bg-[#DC2626]/20 border-[#EF4444]/60 text-[#FCA5A5]"
                            : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {openSourcePanel ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        Consultar fonte
                      </button>
                    </div>

                    {/* PAINEL PROGRESSIVO 1: ENTENDA O MOTIVO */}
                    {openWhyPanel && (
                      <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 space-y-3 text-xs">
                        <p className="text-[#F8FAFC] leading-relaxed">
                          <strong className="text-[#60A5FA]">Guia conceitual:</strong>{" "}
                          {currentSpot.lesson.conceptualGuidance}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div className="rounded-lg bg-[#090D16] border border-[#1E293B] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#60A5FA]">
                                1. Vantagem de Range
                              </span>
                              <span className="font-mono text-[0.6875rem] text-[#94A3B8]">
                                Líder: {reasoning.rangeAdvantage.leader}
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {reasoning.rangeAdvantage.headline}
                            </p>
                            <p className="text-[#CBD5E1] text-[0.6875rem] leading-relaxed">
                              {reasoning.rangeAdvantage.rationale}
                            </p>
                          </div>

                          <div className="rounded-lg bg-[#090D16] border border-[#1E293B] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-indigo-300">
                                2. Vantagem de Nuts
                              </span>
                              <span className="font-mono text-[0.6875rem] text-[#94A3B8]">
                                Líder: {reasoning.nutAdvantage.leader}
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {reasoning.nutAdvantage.headline}
                            </p>
                            <p className="text-[#CBD5E1] text-[0.6875rem] leading-relaxed">
                              {reasoning.nutAdvantage.rationale}
                            </p>
                          </div>

                          <div className="rounded-lg bg-[#090D16] border border-[#1E293B] p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#FCD34D]">
                                3. Blockers ({reasoning.blocker.combinatoricsType})
                              </span>
                              <span className="font-mono text-[0.6875rem] text-[#FCD34D]">
                                Score: {reasoning.blocker.riverBluffCandidateHeuristic.score100}/100
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {reasoning.blocker.blockedValueClasses.map((b) => (
                                <span
                                  key={b.hand}
                                  className="text-[0.6875rem] font-mono px-1.5 py-0.5 rounded bg-[#05070B] border border-[#1E293B] text-[#F8FAFC]"
                                >
                                  {b.hand}: {b.remainingCombos}/{b.baseCombos} (-{b.reductionPct}%)
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-lg bg-[#090D16] border border-[#1E293B] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sky-300">
                                4. Realização de Equidade (R)
                              </span>
                              <span className="font-mono text-[0.6875rem] text-sky-200">
                                {reasoning.equityRealization.positionalStatus} · R ≈{" "}
                                {reasoning.equityRealization.estimatedFactor}x
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {reasoning.equityRealization.headline}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PAINEL PROGRESSIVO 2: VER A MATEMÁTICA (Comparação de Sizings / EV) */}
                    {openMathPanel && (
                      <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 space-y-2.5 text-xs">
                        {reasoning.sizingComparison.available ? (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#60A5FA] flex items-center gap-1.5">
                                <Scale className="w-4 h-4" />
                                Comparação de Sizings / Ações ({handClass} — Unidade:{" "}
                                {reasoning.sizingComparison.evUnit})
                              </span>
                              <span className="text-[0.6875rem] font-mono text-[#94A3B8]">
                                Melhor EV: {reasoning.sizingComparison.bestAction} (
                                {reasoning.sizingComparison.bestEv?.toFixed(3)}{" "}
                                {reasoning.sizingComparison.evUnit})
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {reasoning.sizingComparison.options.map((opt) => (
                                <div
                                  key={opt.actionName}
                                  className="rounded-lg bg-[#090D16] border border-[#1E293B] p-2.5"
                                >
                                  <div className="flex items-center justify-between font-bold text-white">
                                    <span>{opt.actionName}</span>
                                    <span className="font-mono text-[#60A5FA]">
                                      {formatActionFrequencyPtBr(opt.frequency)}
                                    </span>
                                  </div>
                                  <div className="font-mono text-[0.6875rem] text-[#94A3B8] mt-1">
                                    EV: {opt.ev >= 0 ? "+" : ""}
                                    {opt.ev.toFixed(3)} {reasoning.sizingComparison.evUnit} |
                                    ΔEV: -{opt.deltaEvFromBest.toFixed(3)}
                                  </div>
                                  <p className="text-[0.6875rem] text-[#94A3B8] mt-1">
                                    {opt.interpretation}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1 text-[#94A3B8]">
                            <p className="font-semibold text-white">
                              Nota sobre EV neste cenário ({currentSpot.referenceStrategy.status}):
                            </p>
                            <p>
                              {evaluation.evUnavailableReason ??
                                "Este spot avalia aderência às frequências de referência sem fabricar tabela de EV numérico por ação."}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PAINEL PROGRESSIVO 3: CONSULTAR FONTE & PROVENIÊNCIA */}
                    {openSourcePanel && (
                      <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 text-[0.6875rem] text-[#94A3B8] space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Fonte:{" "}
                            <strong className="text-white">
                              {currentSpot.referenceStrategy.solutionSource?.label ??
                                "Nenhuma"}
                            </strong>
                          </span>
                          <span className="font-mono">
                            Hash:{" "}
                            {currentSpot.referenceStrategy.assumptionsHash ??
                              "UNSOLVED"}{" "}
                            | Unidade:{" "}
                            <strong className="text-[#60A5FA]">
                              {currentSpot.referenceStrategy.evUnit ??
                                "Sem EV (EV loss desabilitado)"}
                            </strong>
                          </span>
                        </div>
                        {(currentSpot.referenceStrategy.solutionSource?.fileSha256 ||
                          currentSpot.referenceStrategy.assumptions?.rangesSignature ||
                          typeof currentSpot.referenceStrategy.assumptions
                            ?.achievedExploitabilityPct === "number") && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] font-mono border-t border-[#1E293B] pt-1">
                            <span>
                              {currentSpot.referenceStrategy.assumptions
                                ?.rangesSignature
                                ? `Ranges: ${currentSpot.referenceStrategy.assumptions.rangesSignature}`
                                : ""}
                            </span>
                            <span>
                              {typeof currentSpot.referenceStrategy.assumptions
                                ?.achievedExploitabilityPct === "number"
                                ? `Exploitability: ${currentSpot.referenceStrategy.assumptions.achievedExploitabilityPct.toFixed(3)}% | `
                                : ""}
                              {currentSpot.referenceStrategy.solutionSource?.fileSha256
                                ? `SHA-256: ${currentSpot.referenceStrategy.solutionSource.fileSha256.slice(0, 12)}...`
                                : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {coachError && (
                      <div className="rounded-xl bg-rose-950/80 border border-rose-700/70 p-3 text-xs text-rose-200 flex items-center justify-between gap-2">
                        <span>{coachError}</span>
                        <button
                          type="button"
                          onClick={() => {
                            stopTraining();
                            onOpenSettings();
                          }}
                          className="underline font-bold text-white shrink-0"
                        >
                          Configurar Chave
                        </button>
                      </div>
                    )}

                    {coachExplanation && (
                      <div className="rounded-xl bg-[#05070B] border border-[#2563EB]/40 p-3.5 text-sm text-slate-200">
                        <AssistantResponseCard
                          text={coachExplanation}
                          provider={provider}
                          model={model}
                          evidence={currentHandEvidence}
                          sourcesUsed={coachSources}
                          onRepeatSpot={repeatCurrentHand}
                          onTrainSimilarHands={() => dealNextHand()}
                          onReviewDecision={() => setOpenWhyPanel(true)}
                          onSendToPostSessionAnalysis={
                            onSendHandToAssistant
                              ? () => {
                                  stopTraining();
                                  onSendHandToAssistant({
                                    prompt: `Analise minha decisão (${chosenAction ?? "sem ação"}) com ${handClass} em ${currentSpot.name} (${currentSpot.effectiveStackBb} BB).`,
                                    evidence: currentHandEvidence,
                                  });
                                }
                              : undefined
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA: Matriz 13x13 & Info do Range (Oculta antes da decisão) */}
              {showRangePanel && (
                <div className="trainer-range-panel order-3 rounded-2xl bg-[#0A0E17] border border-[#1E293B] p-3.5 shadow-xl">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#F8FAFC]">
                        Matriz 13&times;13 · {currentSpot.heroPosition}
                      </h3>
                      <p className="text-[0.6875rem] text-[#94A3B8]">
                        {evaluation || peekMatrix
                          ? `Mão ativa: ${handClass}`
                          : "Protegida contra spoiler antes da decisão"}
                      </p>
                    </div>
                    {!evaluation && !isUnsolved && (
                      <button
                        type="button"
                        onClick={() => setPeekMatrix((v) => !v)}
                        className="flex items-center gap-1 rounded-lg bg-[#05070B] border border-[#1E293B] px-2.5 py-1 text-[0.6875rem] text-[#94A3B8] hover:text-[#60A5FA] transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {peekMatrix ? "Ocultar" : "Espiar Range"}
                      </button>
                    )}
                  </div>

                  {currentSpot.referenceStrategy.validationWarnings && (
                    <details className="mb-2.5 rounded-lg bg-amber-950/35 border border-amber-600/40 px-2.5 py-1.5 text-[0.6875rem] text-amber-200">
                      <summary className="cursor-pointer flex items-center gap-1.5 font-semibold select-none">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Aviso de validação (clique p/ detalhes)</span>
                      </summary>
                      <p className="mt-1.5 opacity-90">
                        Aviso de validação:{" "}
                        {currentSpot.referenceStrategy.validationWarnings.join("; ")}
                      </p>
                    </details>
                  )}

                  {evaluation || peekMatrix || isUnsolved ? (
                    <RangeMatrix
                      spot={legacyCurrent}
                      activeHand={handClass}
                      compact
                      deadCards={currentSpot.board}
                      unsolved={isUnsolved}
                      evUnit={currentSpot.referenceStrategy.evUnit ?? undefined}
                      matrixEv={currentSpot.referenceStrategy.matrixEv}
                      comboBreakdown={currentSpot.referenceStrategy.comboBreakdown}
                      onExportCsv={
                        !isUnsolved
                          ? () =>
                              downloadTextFile(
                                `${currentSpot.spotId}.csv`,
                                exportSpotMatrixToCsv(currentSpot),
                                "text/csv;charset=utf-8",
                              )
                          : undefined
                      }
                      onExportJson={() =>
                        downloadTextFile(
                          `${currentSpot.spotId}.json`,
                          JSON.stringify(currentSpot, null, 2),
                          "application/json",
                        )
                      }
                    />
                  ) : (
                    <div className="aspect-square rounded-xl bg-[#05070B] border border-dashed border-[#26334A] flex flex-col items-center justify-center text-center p-6 gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#2563EB]/15 border border-[#3B82F6]/45 flex items-center justify-center text-[#60A5FA]">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[#F8FAFC]">
                          Estratégia oculta antes da decisão
                        </p>
                        <p className="text-[0.6875rem] text-[#94A3B8] max-w-xs leading-relaxed">
                          Tome sua decisão nos botões abaixo da mesa (ou teclas{" "}
                          <kbd className="px-1 py-0.5 rounded bg-[#090D16] border border-[#1E293B] font-mono text-white">
                            1–{currentSpot.legalActions.length}
                          </kbd>
                          ) para revelar a matriz 13&times;13 e as frequências exatas.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Modal Acessível do SolverAdapter v1.1 */}
        <dialog
          ref={importDialogRef}
          aria-labelledby="solver-import-title"
          onCancel={(e) => {
            e.preventDefault();
            setImportOpen(false);
          }}
          className="m-auto w-[min(100%-2rem,48rem)] max-h-[88dvh] rounded-2xl bg-[#090D16] border border-[#26334A] p-0 text-[#F8FAFC] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm overflow-hidden"
        >
          {importOpen && (
            <div className="flex flex-col max-h-[88dvh]">
              <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between shrink-0">
                <div>
                  <h3 id="solver-import-title" className="text-sm font-bold text-[#F8FAFC]">
                    Adaptador Versionado de Soluções MTT — SolverAdapter v
                    {SOLVER_ADAPTER_VERSION}
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    Valida formato MTT, stack, blinds, antes, rake, assentos, histórico,
                    board, pote, sizings, unidade de EV e soma de frequências.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Fechar modal de importação de solver"
                  onClick={() => setImportOpen(false)}
                  className="p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#131B2C]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 text-xs overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-300">
                    Aceita{" "}
                    <strong>
                      JSON (SolverAdapter v{SOLVER_ADAPTER_VERSION} / Bundle
                      TexasSolver)
                    </strong>{" "}
                    ou <strong>CSV exportado do Desktop Postflop</strong> para torneios MTT. Dados sem
                    evidência permanecem{" "}
                    <code className="text-amber-300">UNSOLVED</code>.
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1.5 rounded-lg bg-[#0D182C] border border-[#2563EB]/60 text-[#93C5FD] font-semibold hover:bg-[#2563EB]/25 cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3 h-3" />
                      Carregar Arquivo (.json/.csv)
                      <input
                        type="file"
                        accept=".json,.csv,text/csv,application/json"
                        onChange={handleImportFileChange}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={loadBrokenSamplePayload}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-950/70 border border-amber-600/50 text-amber-300 font-semibold hover:bg-amber-900/60"
                    >
                      Testar Payload Inconsistente (&rarr; UNSOLVED)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl bg-[#05070B] border border-[#1E293B] p-2.5 text-xs">
                  <label className="col-span-2 flex flex-col gap-1 text-[#CBD5E1]">
                    <span>Nome do Spot (para CSV Desktop Postflop)</span>
                    <input
                      type="text"
                      value={csvSpotName}
                      onChange={(e) => setCsvSpotName(e.target.value)}
                      className="rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 text-[#F8FAFC]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[#CBD5E1]">
                    <span>Board</span>
                    <input
                      type="text"
                      value={csvBoardText}
                      onChange={(e) => setCsvBoardText(e.target.value)}
                      className="rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 font-mono text-[#F8FAFC]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[#CBD5E1]">
                    <span>Pot / Stack (BB)</span>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        aria-label="Pote inicial em BB"
                        value={csvPotBb}
                        onChange={(e) => setCsvPotBb(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 font-mono text-[#F8FAFC]"
                      />
                      <input
                        type="text"
                        aria-label="Stack efetivo em BB"
                        value={csvStackBb}
                        onChange={(e) => setCsvStackBb(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 font-mono text-[#F8FAFC]"
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[#CBD5E1]">
                    <span>Ver. / Exploit %</span>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        aria-label="Versão do solver"
                        value={csvVersion}
                        onChange={(e) => setCsvVersion(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 font-mono text-[#F8FAFC]"
                      />
                      <input
                        type="text"
                        aria-label="Exploitabilidade percentual"
                        value={csvExploitPct}
                        onChange={(e) => setCsvExploitPct(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#090D16] border border-[#26334A] px-2 py-1 font-mono text-[#F8FAFC]"
                      />
                    </div>
                  </label>
                </div>

                <textarea
                  aria-label="Payload JSON ou CSV do solver"
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  rows={8}
                  placeholder='Cole JSON {"schemaVersion": "1.1.0", ...} / canonical_bundle.json ou carregue CSV "Hand,Weight,Combos,Equity,EV,Check %,Check EV,..."'
                  className="w-full rounded-xl bg-[#05070B] border border-[#26334A] p-3 font-mono text-xs text-[#F8FAFC] placeholder:text-[#7E8EA4] outline-none focus:border-[#3B82F6]"
                />
                {importError && (
                  <div className="rounded-xl bg-rose-950/60 border border-rose-700 p-3 text-rose-200 leading-relaxed">
                    {importError}
                  </div>
                )}
                {importResultNotice && (
                  <div className="rounded-xl bg-[#0D182C] border border-[#2563EB] p-3 text-blue-200">
                    {importResultNotice}
                  </div>
                )}
              </div>
              <div className="px-5 py-3.5 border-t border-[#1E293B] bg-[#05070B] flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-[#CBD5E1] hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 text-xs font-extrabold text-white"
                >
                  Validar &amp; Importar via SolverAdapter
                </button>
              </div>
            </div>
          )}
        </dialog>
      </div>
    </TrainingViewport>
  );
}
