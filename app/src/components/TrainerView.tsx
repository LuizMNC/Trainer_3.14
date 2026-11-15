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
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  Settings2,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
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
  computeMixedAdherenceStats,
  computeSha256Hex,
  type ConfidenceLevel,
  createSeededRng,
  type DrillDifficulty,
  type DrillEvaluationResult,
  evaluateDrillDecision,
  exportSpotMatrixToCsv,
  importExternalSolverSolution,
  importTexasSolverBundle,
  inferTournamentFormatCategory,
  type MixedAttemptRecord,
  parseDesktopPostflopCsvToPayload,
  pickDrillHand,
  type PlayingCard,
  POSITIONS_8MAX,
  type RangeSpot,
  sampleCardsForHand,
  SOLVER_ADAPTER_VERSION,
  type TexasSolverBundleV1,
  type TrainerModeId,
} from "@/lib/poker";
import { PokerTable } from "./PokerTable";
import { RangeMatrix } from "./RangeMatrix";
import { TrainingViewport } from "./TrainingViewport";
import { InteractiveDrillsLab, type InteractiveDrillTabId } from "./InteractiveDrillsLab";
import { shouldKeepLaunchedDrill } from "@/lib/studyNavigation";
import type { HandHistoryItem } from "./StatsView";

export type SelfReviewTag = "revisar_agora" | "preciso_praticar" | "ja_compreendi";

export interface TrainerViewProps {
  canonicalSpots: CanonicalSpot[];
  apiKey: string;
  model: string;
  requestedSpotId?: string | null;
  requestedMode?: TrainerModeId | null;
  requestedSubView?: "table" | "interactive" | null;
  requestedInteractiveMode?: InteractiveDrillTabId | null;
  requestedPresetFilter?: {
    street?: "PREFLOP" | "POSTFLOP" | "ALL";
    sessionTargetHands?: number;
  } | null;
  onClearRequestedSpot?: () => void;
  onRecordHistory: (item: HandHistoryItem) => void;
  onRecordAdaptiveAttempt?: (record: AdaptiveExerciseRecord) => void;
  onImportVerifiedSpot: (spot: CanonicalSpot) => void;
  onOpenSettings: () => void;
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
    label: "SOLUÇÃO VERIFICADA (SOLVER)",
    cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
  },
  DIDACTIC_DEMO: {
    label: "DEMO DIDÁTICA (NÃO É SOLVER OFICIAL)",
    cls: "bg-indigo-500/15 border-indigo-400/40 text-indigo-200",
  },
  IMPORTED_CHART_NO_EV: {
    label: "CHART LOCAL (FREQ. SEM TABELA EV)",
    cls: "bg-sky-500/15 border-sky-500/40 text-sky-200",
  },
  UNSOLVED: {
    label: "SEM SOLUÇÃO — CONCEITUAL",
    cls: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  },
};

function getActionWizardColors(actionName: string): {
  bg: string;
  hoverBg: string;
  border: string;
} {
  const lower = actionName.toLowerCase();
  if (lower.includes("fold")) {
    return {
      bg: "#387894",
      hoverBg: "#4289a8",
      border: "#539ec0",
    };
  }
  if (lower.includes("check") || lower.includes("call") || lower.includes("limp")) {
    return {
      bg: "#3FA65B",
      hoverBg: "#49b868",
      border: "#62cf80",
    };
  }
  if (lower.includes("all") || lower.includes("shove") || lower.includes("jam")) {
    return {
      bg: "#802222",
      hoverBg: "#962929",
      border: "#b33b3b",
    };
  }
  return {
    bg: "#C84343",
    hoverBg: "#d65050",
    border: "#e36b6b",
  };
}

function getFriendlyVerdictPtBr(res: DrillEvaluationResult): {
  badge: string;
  shortTitle: string;
} {
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
  requestedSpotId,
  requestedMode,
  requestedSubView,
  requestedInteractiveMode,
  requestedPresetFilter,
  onClearRequestedSpot,
  onRecordHistory,
  onRecordAdaptiveAttempt,
  onImportVerifiedSpot,
  onOpenSettings,
}: TrainerViewProps) {
  const [subView, setSubView] = useState<"table" | "interactive">("table");
  const [interactiveTab, setInteractiveTab] = useState<InteractiveDrillTabId>("range-builder");

  const [isTraining, setIsTraining] = useState(false);
  const [showTrainingSettings, setShowTrainingSettings] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [motion, setMotion] = useState<"normal" | "fast" | "off">("normal");
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

  const handleSetSelfReview = (spotId: string, hand: string, tag: SelfReviewTag) => {
    const key = `${spotId}::${hand}`;
    setSelfReviewMap((prev) => {
      const next = { ...prev, [key]: tag };
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

  const verifiedOnlySpots = useMemo(
    () => canonicalSpots.filter((s) => s.referenceStrategy.status === "VERIFIED"),
    [canonicalSpots],
  );

  const filteredSpots = useMemo(() => {
    const basePool =
      trainerMode === "GTO_TECHNICAL" ? verifiedOnlySpots : canonicalSpots;

    const res = basePool.filter((s) => {
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

      if (formatFilter !== "all" && s.format !== formatFilter) return false;

      if (stackFilter === "spin") {
        if (s.format !== "SNG") return false;
      } else if (stackFilter !== "all") {
        if (Math.round(s.effectiveStackBb) !== Number(stackFilter)) return false;
      }

      if (typeFilter !== "all" && s.spotType !== typeFilter) return false;
      if (posFilter !== "all" && s.heroPosition !== posFilter) return false;
      return true;
    });
    return res.length > 0 ? res : basePool;
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

  useEffect(() => {
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
          }
        }
        if (typeof requestedPresetFilter.sessionTargetHands === "number") {
          setSessionTargetHands(requestedPresetFilter.sessionTargetHands);
        }
      }
    });
  }, [requestedSubView, requestedInteractiveMode, requestedPresetFilter]);

  useEffect(() => {
    if (requestedSpotId) {
      const target = canonicalSpots.find((s) => s.spotId === requestedSpotId);
      if (target) {
        queueMicrotask(() => {
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
      }
      return;
    }
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
      });
      setChosenAction(actionName);
      setEvaluation(res);
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

      const isGood = res.classification !== "ev_error";
      setSessionTotal((t) => t + 1);
      if (isGood) {
        setSessionRight((r) => r + 1);
        setStreak((s) => s + 1);
      } else {
        setStreak(0);
      }

      if (res.gtoScored) {
        const dist = currentSpot.referenceStrategy.matrixFrequencies?.[handClass];
        if (dist && Object.values(dist).some((v) => v > 0.02 && v < 0.96)) {
          setMixedAttempts((prev) => [
            ...prev,
            {
              spotId: currentSpot.spotId,
              hand: handClass,
              chosenAction: actionName,
              targetDistribution: dist,
              evLoss: res.evLoss,
              timestamp: nowTs,
            },
          ]);
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
          attemptId: `adapt-${attemptSeqRef.current}`,
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

  const askCoach = async () => {
    setCoachLoading(true);
    setCoachError(null);
    try {
      const dist = currentSpot.referenceStrategy.matrixFrequencies?.[handClass];
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          model,
          prompt:
            currentSpot.referenceStrategy.status === "UNSOLVED"
              ? `Este spot está em estado UNSOLVED (sem solução de solver). Explique os conceitos teóricos para ${handClass} em ${currentSpot.name} SEM inventar frequências numéricas de GTO ou EV.`
              : `Acabei de jogar esta mão no Modo ${trainerMode}. Explique o raciocínio teórico para ${handClass} em ${currentSpot.name} (${currentSpot.referenceStrategy.status}), considerando posição, stack, vantagem de range/nuts e bloqueadores.`,
          spotContext: {
            spotName: currentSpot.name,
            stackBb: currentSpot.effectiveStackBb,
            heroPosition: currentSpot.heroPosition,
            villainPosition: currentSpot.villainPosition,
            spotType: currentSpot.spotType,
            handClass,
            cardsText: `${cards[0].rank}${cards[0].suit} ${cards[1].rank}${cards[1].suit}`,
            chosenAction: chosenAction ?? undefined,
            gtoDistribution: dist,
            rngValue: useRng ? rngValue : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCoachError(data.error || "Falha ao consultar o AI Coach.");
      } else {
        setCoachExplanation(data.text);
        setCoachSources(data.sourcesUsed || []);
      }
    } catch {
      setCoachError("Erro de rede ao conectar com o servidor local.");
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

  const currentSelfReviewKey = `${currentSpot.spotId}::${handClass}`;
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
              <div className="flex items-center gap-1.5 rounded-xl bg-[#090B0C] border border-[#292C2F] p-1">
                <button
                  type="button"
                  onClick={() => setSubView("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    subView === "table"
                      ? "bg-[#18B88D] text-[#090B0C] shadow"
                      : "text-[#A1A6AA] hover:text-white"
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
                      ? "bg-[#18B88D] text-[#090B0C] shadow"
                      : "text-[#A1A6AA] hover:text-white"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Treinos Interativos &amp; Daily Dose (6 Modos)
                </button>
              </div>
            )}
          </div>

          <div className="trainer-session-tools">
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
                  className="px-2.5 py-1 rounded-lg bg-[#191B1D] border border-[#292C2F] text-slate-300 hover:text-white text-[0.6875rem]"
                >
                  Entendi
                </button>
              </div>
            )}

            {/* Meta de Sessão Rápida Concluída */}
            {sessionTargetHands > 0 && sessionTotal >= sessionTargetHands && (
              <div className="rounded-xl bg-[#18B88D]/15 border border-[#18B88D]/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-[#A1F5AE]" />
                  <div>
                    <p className="text-xs font-bold text-[#F4F5F5]">
                      Meta da sessão atingida! ({sessionTotal}/{sessionTargetHands} mãos ·{" "}
                      {sessionPct}% de precisão)
                    </p>
                    <p className="text-[0.6875rem] text-[#A1A6AA]">
                      Você pode continuar praticando livremente ou iniciar um novo bloco.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetSessionStats}
                    className="px-3 py-1.5 rounded-lg bg-[#18B88D] text-[#090B0C] font-bold text-xs"
                  >
                    Nova Sessão ({sessionTargetHands} mãos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionTargetHands(0)}
                    className="px-3 py-1.5 rounded-lg bg-[#191B1D] border border-[#292C2F] text-xs text-[#F4F5F5]"
                  >
                    Modo Livre
                  </button>
                </div>
              </div>
            )}

            {/* LAYOUT DE 3 COLUNAS ESTILO GTO WIZARD: CONTROLES & STATS (ESQ) · MESA & AÇÃO (CENTRO) · MATRIZ 13x13 (DIR) */}
            <div className="trainer-workspace grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* COLUNA ESQUERDA: Controles Compactos + Placar da Sessão */}
              <aside
                className="xl:col-span-3 flex flex-col gap-3 rounded-2xl bg-[#191B1D] border border-[#292C2F] p-3.5 shadow-lg"
                aria-label="Controles e Estatísticas da Sessão"
              >
                {/* Seletor de Modo: GTO Técnico vs Aprendizagem */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#A1A6AA]">
                      Modo de Estudo
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="text-[0.625rem] font-bold text-[#A1F5AE] hover:underline flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      Importar Solver
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#090B0C] border border-[#292C2F] p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleModeSwitch("GTO_TECHNICAL")}
                      className={`flex flex-col items-start px-2.5 py-2 rounded-lg text-left transition ${
                        trainerMode === "GTO_TECHNICAL"
                          ? "bg-[#18B88D] text-[#090B0C] font-bold"
                          : "text-[#A1A6AA] hover:text-white"
                      }`}
                    >
                      <span className="text-[0.6875rem] font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        GTO Técnico
                      </span>
                      <span className="text-[0.58rem] opacity-85">
                        Verificados ({verifiedOnlySpots.length})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch("LEARNING")}
                      className={`flex flex-col items-start px-2.5 py-2 rounded-lg text-left transition ${
                        trainerMode === "LEARNING"
                          ? "bg-[#387894] text-white font-bold"
                          : "text-[#A1A6AA] hover:text-white"
                      }`}
                    >
                      <span className="text-[0.6875rem] font-bold flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        Aprendizagem
                      </span>
                      <span className="text-[0.58rem] opacity-85">
                        Catálogo ({canonicalSpots.length})
                      </span>
                    </button>
                  </div>
                </div>

                {/* Sessões Rápidas (5, 10, 20 min ou Livre) */}
                <div className="space-y-1.5 border-t border-[#292C2F] pt-2.5">
                  <div className="flex items-center justify-between text-[0.6875rem]">
                    <span className="font-bold uppercase tracking-wider text-[#A1A6AA]">
                      Meta da Sessão
                    </span>
                    <button
                      type="button"
                      onClick={resetSessionStats}
                      className="text-[0.625rem] text-[#A1A6AA] hover:text-white flex items-center gap-1"
                      title="Zerar placar da sessão atual"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reiniciar
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1 bg-[#090B0C] border border-[#292C2F] p-1 rounded-xl text-[0.65rem]">
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
                            ? "bg-[#292C2F] text-[#A1F5AE] border border-[#18B88D]/40"
                            : "text-[#A1A6AA] hover:text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {sessionTargetHands > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[0.625rem] font-mono text-[#A1A6AA]">
                        <span>Progresso</span>
                        <span>
                          {Math.min(sessionTotal, sessionTargetHands)}/{sessionTargetHands} mãos
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#090B0C] overflow-hidden">
                        <div
                          className="h-full bg-[#18B88D] transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((sessionTotal / sessionTargetHands) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Filtros Rápidos + Recolhível de Filtros Avançados */}
                <div className="space-y-2 border-t border-[#292C2F] pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#A1A6AA]">
                      Cenário &amp; Filtros
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedFilters((v) => !v)}
                      className="text-[0.65rem] text-[#A1F5AE] hover:underline flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {showAdvancedFilters ? "Menos filtros" : "Mais filtros"}
                    </button>
                  </div>

                  {/* Filtro rápido Street: Todas / Pré-Flop / Pós-Flop */}
                  <div className="grid grid-cols-3 gap-1 bg-[#090B0C] border border-[#292C2F] p-1 rounded-xl text-[0.65rem]">
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
                            ? "bg-[#292C2F] text-white"
                            : "text-[#A1A6AA] hover:text-white"
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
                      className="rounded-lg bg-[#090B0C] border border-[#292C2F] px-2 py-1.5 text-[0.6875rem] text-[#F1BE60] font-semibold outline-none"
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
                          ? "bg-[#202224] border-[#18B88D]/50 text-[#A1F5AE]"
                          : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA]"
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
                          className="w-full rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-xs text-slate-200 outline-none"
                        >
                          <option value="all">
                            Todas as Fontes ({canonicalSpots.length})
                          </option>
                          <option value="verified">
                            Soluções Verificadas ({verifiedOnlySpots.length})
                          </option>
                          <option value="chart">Charts Locais (229 s/ EV)</option>
                          <option value="didactic">Demo Didática (Sintética)</option>
                          <option value="unsolved">Sem Solução (Conceitual)</option>
                        </select>
                      )}

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          aria-label="Filtrar por formato"
                          value={formatFilter}
                          onChange={(e) => setFormatFilter(e.target.value)}
                          className="rounded-lg bg-[#090B0C] border border-[#292C2F] px-2 py-1.5 text-xs text-slate-200 outline-none"
                        >
                          <option value="all">Formato: Todos</option>
                          <option value="MTT">MTT (6/8-Max)</option>
                          <option value="SNG">Spin / SNG</option>
                        </select>

                        <select
                          aria-label="Filtrar por stack"
                          value={stackFilter}
                          onChange={(e) => setStackFilter(e.target.value)}
                          className="rounded-lg bg-[#090B0C] border border-[#292C2F] px-2 py-1.5 text-xs text-slate-200 outline-none"
                        >
                          <option value="all">Stack: Todos</option>
                          <option value="14">14 BB</option>
                          <option value="15">15 BB</option>
                          <option value="17">17 BB</option>
                          <option value="20">20 BB</option>
                          <option value="28">28 BB (SRP)</option>
                          <option value="30">30 BB</option>
                          <option value="50">50 BB</option>
                          <option value="100">100 BB</option>
                          <option value="spin">Spin (3-15 BB)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <select
                          aria-label="Filtrar por tipo de spot"
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value)}
                          className="rounded-lg bg-[#090B0C] border border-[#292C2F] px-2 py-1.5 text-xs text-slate-200 outline-none"
                        >
                          <option value="all">Ação: Todas ({filteredSpots.length})</option>
                          <option value="rfi">RFI (Open)</option>
                          <option value="vs_rfi">vs RFI / 3-Bet</option>
                          <option value="vs_limp">BB vs SB Limp</option>
                          <option value="flop_cbet_ip">Flop C-Bet IP</option>
                          <option value="turn_cbet_ip">Turn / River Barrel</option>
                          <option value="bb_vs_cbet">BB vs C-Bet</option>
                          <option value="push_fold">Push / Fold</option>
                          <option value="vs_shove">vs Shove</option>
                        </select>

                        <select
                          aria-label="Filtrar por posição do herói"
                          value={posFilter}
                          onChange={(e) => setPosFilter(e.target.value)}
                          className="rounded-lg bg-[#090B0C] border border-[#292C2F] px-2 py-1.5 text-xs text-slate-200 outline-none"
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
                        <div className="flex items-center justify-between gap-2 bg-[#090B0C] border border-[#292C2F] rounded-lg px-2.5 py-1.5">
                          <label className="flex items-center gap-1.5 text-[0.6875rem] text-[#A1A6AA] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useSeededRng}
                              onChange={(e) => setUseSeededRng(e.target.checked)}
                              className="accent-[#18B88D]"
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
                              className="w-28 bg-[#191B1D] border border-[#292C2F] rounded px-1.5 py-0.5 text-[0.6875rem] font-mono text-[#A1F5AE] outline-none"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Seletor Compacto de Confiança */}
                <div className="space-y-1.5 border-t border-[#292C2F] pt-2.5">
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#A1A6AA] flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-[#F1BE60]" />
                    Sua Confiança
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-[#090B0C] border border-[#292C2F] rounded-xl p-1">
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
                            ? "bg-[#292C2F] text-white border border-[#363A3D]"
                            : "text-[#A1A6AA] hover:text-white"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Placar Estilo GTO Wizard (Mãos, Moves, Score %) */}
                <div className="space-y-2 border-t border-[#292C2F] pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[#A1A6AA]">
                      Estatísticas da Sessão
                    </span>
                    <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#F1BE60]">
                      <Flame className="w-3.5 h-3.5" />
                      {streak}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-2">
                      <div className="text-[0.6rem] uppercase text-[#A1A6AA]">Mãos</div>
                      <div className="text-base font-extrabold font-mono text-white">
                        {sessionTotal}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-2">
                      <div className="text-[0.6rem] uppercase text-[#A1A6AA]">Acertos</div>
                      <div className="text-base font-extrabold font-mono text-[#A1F5AE]">
                        {sessionRight}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-2">
                      <div className="text-[0.6rem] uppercase text-[#A1A6AA]">Precisão</div>
                      <div className="text-base font-extrabold font-mono text-white">
                        {sessionTotal > 0 ? `${sessionPct}%` : "—"}
                      </div>
                    </div>
                  </div>

                  {mixedAttempts.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-[0.6875rem]">
                      <span className="text-[#A1A6AA]">Aderência ao Mix:</span>
                      <span className="font-mono font-bold text-[#A1F5AE]">
                        {adherence.adherencePct}% ({mixedAttempts.length} mãos)
                      </span>
                    </div>
                  )}

                  {/* Histórico curto da sessão */}
                  {recentDecisions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[0.625rem] font-bold uppercase tracking-wider text-[#A1A6AA]">
                        Últimas decisões
                      </div>
                      <ol className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {recentDecisions.map((d) => (
                          <li
                            key={d.id}
                            className="flex items-center justify-between rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1 text-[0.6875rem]"
                          >
                            <span className="font-mono font-bold text-white">
                              {d.hand} ·{" "}
                              <span className="text-[#A1F5AE]">{d.action}</span>
                            </span>
                            <span
                              className={`text-[0.625rem] font-semibold ${
                                d.classification === "ev_error"
                                  ? "text-[#EF6666]"
                                  : d.classification === "exact_primary"
                                    ? "text-[#A1F5AE]"
                                    : "text-[#F1BE60]"
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
                    </div>
                  )}
                </div>
              </aside>

              {/* COLUNA CENTRAL: Mesa + Botões de Ação + Feedback Enxuto Pós-Decisão */}
              <div
                className={`${
                  showRangePanel ? "xl:col-span-5" : "xl:col-span-9"
                } flex flex-col gap-3`}
              >
                {/* Cabeçalho Compacto do Spot */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#191B1D] border border-[#292C2F] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[0.6rem] px-2 py-0.5 rounded border font-bold ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[0.65rem] font-mono text-[#A1A6AA]">
                        {currentSpot.format} · {currentSpot.effectiveStackBb}bb ·{" "}
                        {currentSpot.referenceStrategy.assumptions?.icmMode ?? "chipEV"}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#F4F5F5] truncate">
                      {currentSpot.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      aria-label="Selecionar spot"
                      value={currentSpot.spotId}
                      onChange={(e) => {
                        const found = filteredSpots.find(
                          (s) => s.spotId === e.target.value,
                        );
                        if (found) dealSpecificSpot(found);
                      }}
                      className="max-w-[180px] sm:max-w-[210px] rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1.5 text-xs text-[#F4F5F5] outline-none"
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
                      className="flex items-center gap-1 rounded-lg bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] px-2.5 py-1.5 text-xs font-semibold text-[#F4F5F5] transition"
                      title="Sortear nova mão"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Sortear
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRangePanel((v) => !v)}
                      className="hidden xl:flex items-center gap-1 rounded-lg bg-[#090B0C] hover:bg-[#202224] border border-[#292C2F] px-2.5 py-1.5 text-xs font-semibold text-[#A1A6AA] hover:text-white transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
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
                />

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
                              : "#191B1D"
                            : wizColors.bg,
                          borderColor: isChosen
                            ? "#F1BE60"
                            : evaluation && isBest
                              ? "#A1F5AE"
                              : wizColors.border,
                        }}
                        className={`relative flex flex-col items-center justify-center rounded-xl py-3 px-4 font-extrabold text-white border-2 transition shadow-md ${
                          evaluation
                            ? isChosen || isBest
                              ? "ring-2 ring-[#F1BE60]/60 opacity-100"
                              : "opacity-45"
                            : "hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0"
                        }`}
                      >
                        <span className="text-sm sm:text-base tracking-wide uppercase">
                          {act.name.replace(/_/g, " ")}
                        </span>
                        <span className="text-[0.65rem] text-white/90 font-mono mt-0.5">
                          {evaluation && !isUnsolved && freqVal !== undefined
                            ? `${Math.round(freqVal * 100)}%${
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
                        ? "bg-[#191B1D] border-[#18B88D]/70"
                        : evaluation.classification === "unsolved"
                          ? "bg-[#191B1D] border-[#F1BE60]/60"
                          : evaluation.classification === "ev_error"
                            ? "bg-[#191B1D] border-[#EF6666]/70"
                            : "bg-[#191B1D] border-[#F1BE60]/70"
                    }`}
                  >
                    {/* Linha 1: Veredito Claro + Botões Repetir Mão e Próxima Mão */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {evaluation.classification === "ev_error" ? (
                          <XCircle className="w-7 h-7 text-[#EF6666] shrink-0 mt-0.5" />
                        ) : evaluation.classification === "unsolved" ? (
                          <BookOpen className="w-7 h-7 text-[#F1BE60] shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2
                            className={`w-7 h-7 shrink-0 mt-0.5 ${
                              evaluation.classification === "exact_primary"
                                ? "text-[#18B88D]"
                                : "text-[#F1BE60]"
                            }`}
                          />
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[0.65rem] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                                evaluation.classification === "exact_primary"
                                  ? "bg-[#18B88D]/20 text-[#A1F5AE]"
                                  : evaluation.classification === "ev_error"
                                    ? "bg-[#EF6666]/20 text-[#EF6666]"
                                    : "bg-[#F1BE60]/20 text-[#F1BE60]"
                              }`}
                            >
                              {friendlyVerdict.badge}
                            </span>
                            <span className="text-xs font-mono text-[#A1A6AA]">
                              Mão: <strong className="text-white">{handClass}</strong> · Sua
                              ação:{" "}
                              <strong className="text-white">{chosenAction}</strong>
                            </span>
                          </div>
                          <h4 className="font-extrabold text-[#F4F5F5] text-base mt-1">
                            {friendlyVerdict.shortTitle}
                          </h4>
                          <p className="text-xs text-[#A1A6AA] mt-0.5 leading-relaxed">
                            {evaluation.detail}
                          </p>
                        </div>
                      </div>

                      {/* Ações Principais de Loop Rápido */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={repeatCurrentHand}
                          className="flex items-center gap-1.5 rounded-xl bg-[#202224] hover:bg-[#292C2F] border border-[#363A3D] px-3.5 py-2.5 text-xs font-bold text-[#F4F5F5] transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Repetir mão
                        </button>
                        <button
                          type="button"
                          onClick={() => dealNextHand()}
                          className="flex items-center gap-1.5 rounded-xl bg-[#18B88D] hover:bg-[#22ce9f] px-4 py-2.5 text-xs font-extrabold text-[#090B0C] transition shadow-lg"
                        >
                          Próxima mão (Espaço)
                        </button>
                      </div>
                    </div>

                    {/* Barra Visual de Partição das Frequências (se houver distribuição conhecida) */}
                    {!isUnsolved && currentHandDist && (
                      <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[0.6875rem]">
                          <span className="text-[#A1A6AA] font-semibold">
                            Frequências de referência para{" "}
                            <strong className="text-white">{handClass}</strong>
                            {useRng ? ` (Rolagem RNG: ${rngValue})` : ""}
                          </span>
                          {useRng && evaluation.rngTargetAction && (
                            <span className="font-mono text-[#A1F5AE]">
                              Alvo RNG: <strong>{evaluation.rngTargetAction}</strong>
                            </span>
                          )}
                        </div>
                        <div className="relative h-5 w-full rounded-lg overflow-hidden bg-[#191B1D] border border-[#292C2F] flex">
                          {currentSpot.legalActions.map((act) => {
                            const pct = Math.round(
                              (currentHandDist[act.name] ?? 0) * 100,
                            );
                            if (pct <= 0) return null;
                            const wizColors = getActionWizardColors(act.name);
                            return (
                              <div
                                key={act.name}
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: wizColors.bg,
                                }}
                                className="h-full flex items-center justify-center text-[0.625rem] font-bold text-white overflow-hidden whitespace-nowrap"
                                title={`${act.name}: ${pct}%`}
                              >
                                {pct >= 12 ? `${act.name} ${pct}%` : ""}
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
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#292C2F] pt-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#A1A6AA] mr-1">
                          Autoavaliação:
                        </span>
                        {(
                          [
                            {
                              id: "revisar_agora",
                              label: "Revisar agora",
                              activeCls:
                                "bg-[#EF6666]/20 border-[#EF6666] text-[#EF6666]",
                            },
                            {
                              id: "preciso_praticar",
                              label: "Preciso praticar",
                              activeCls:
                                "bg-[#F1BE60]/20 border-[#F1BE60] text-[#F1BE60]",
                            },
                            {
                              id: "ja_compreendi",
                              label: "Já compreendi",
                              activeCls:
                                "bg-[#18B88D]/20 border-[#18B88D] text-[#A1F5AE]",
                            },
                          ] as const
                        ).map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() =>
                              handleSetSelfReview(
                                currentSpot.spotId,
                                handClass,
                                tag.id,
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-[0.65rem] font-bold border transition ${
                              currentSelfReviewTag === tag.id
                                ? tag.activeCls
                                : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white"
                            }`}
                          >
                            {tag.label}
                          </button>
                        ))}
                      </div>

                      {/* Botão AI Coach */}
                      <button
                        type="button"
                        onClick={askCoach}
                        disabled={coachLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 text-[0.6875rem] font-bold text-white transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {coachLoading ? "Analisando..." : "Explicar com AI Coach"}
                      </button>
                    </div>

                    {/* BOTÕES DE REVELAÇÃO PROGRESSIVA (Sob Demanda) */}
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-[#292C2F] pt-2.5">
                      <button
                        type="button"
                        aria-expanded={openWhyPanel}
                        onClick={() => setOpenWhyPanel((v) => !v)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold border transition ${
                          openWhyPanel
                            ? "bg-[#292C2F] border-[#18B88D]/50 text-[#A1F5AE]"
                            : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white"
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
                            ? "bg-[#292C2F] border-[#18B88D]/50 text-[#A1F5AE]"
                            : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white"
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
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold bg-[#090B0C] border border-[#292C2F] text-[#A1A6AA] hover:text-white transition"
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
                            ? "bg-[#292C2F] border-[#18B88D]/50 text-[#A1F5AE]"
                            : "bg-[#090B0C] border-[#292C2F] text-[#A1A6AA] hover:text-white"
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

                    {/* PAINEL PROGRESSIVO 1: ENTENDA O MOTIVO (Conceito, Range/Nut Advantage, Blockers, Realização) */}
                    {openWhyPanel && (
                      <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-3.5 space-y-3 text-xs">
                        <p className="text-[#F4F5F5] leading-relaxed">
                          <strong className="text-[#A1F5AE]">Guia conceitual:</strong>{" "}
                          {currentSpot.lesson.conceptualGuidance}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div className="rounded-lg bg-[#191B1D] border border-[#292C2F] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#A1F5AE]">
                                1. Vantagem de Range
                              </span>
                              <span className="font-mono text-[0.625rem] text-[#A1A6AA]">
                                Líder: {reasoning.rangeAdvantage.leader}
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {reasoning.rangeAdvantage.headline}
                            </p>
                            <p className="text-[#A1A6AA] text-[0.6875rem]">
                              {reasoning.rangeAdvantage.rationale}
                            </p>
                          </div>

                          <div className="rounded-lg bg-[#191B1D] border border-[#292C2F] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-indigo-300">
                                2. Vantagem de Nuts
                              </span>
                              <span className="font-mono text-[0.625rem] text-[#A1A6AA]">
                                Líder: {reasoning.nutAdvantage.leader}
                              </span>
                            </div>
                            <p className="font-semibold text-white">
                              {reasoning.nutAdvantage.headline}
                            </p>
                            <p className="text-[#A1A6AA] text-[0.6875rem]">
                              {reasoning.nutAdvantage.rationale}
                            </p>
                          </div>

                          <div className="rounded-lg bg-[#191B1D] border border-[#292C2F] p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#F1BE60]">
                                3. Blockers ({reasoning.blocker.combinatoricsType})
                              </span>
                              <span className="font-mono text-[0.625rem] text-[#F1BE60]">
                                Score: {reasoning.blocker.riverBluffCandidateHeuristic.score100}/100
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {reasoning.blocker.blockedValueClasses.map((b) => (
                                <span
                                  key={b.hand}
                                  className="text-[0.6rem] font-mono px-1.5 py-0.5 rounded bg-[#090B0C] border border-[#292C2F] text-[#F4F5F5]"
                                >
                                  {b.hand}: {b.remainingCombos}/{b.baseCombos} (-{b.reductionPct}%)
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-lg bg-[#191B1D] border border-[#292C2F] p-2.5 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sky-300">
                                4. Realização de Equidade (R)
                              </span>
                              <span className="font-mono text-[0.625rem] text-sky-200">
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
                      <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-3.5 space-y-2.5 text-xs">
                        {reasoning.sizingComparison.available ? (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#A1F5AE] flex items-center gap-1.5">
                                <Scale className="w-4 h-4" />
                                Comparação de Sizings / Ações ({handClass} — Unidade:{" "}
                                {reasoning.sizingComparison.evUnit})
                              </span>
                              <span className="text-[0.6875rem] font-mono text-[#A1A6AA]">
                                Melhor EV: {reasoning.sizingComparison.bestAction} (
                                {reasoning.sizingComparison.bestEv?.toFixed(3)}{" "}
                                {reasoning.sizingComparison.evUnit})
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {reasoning.sizingComparison.options.map((opt) => (
                                <div
                                  key={opt.actionName}
                                  className="rounded-lg bg-[#191B1D] border border-[#292C2F] p-2.5"
                                >
                                  <div className="flex items-center justify-between font-bold text-white">
                                    <span>{opt.actionName}</span>
                                    <span className="font-mono text-[#A1F5AE]">
                                      {Math.round(opt.frequency * 100)}%
                                    </span>
                                  </div>
                                  <div className="font-mono text-[0.6875rem] text-[#A1A6AA] mt-1">
                                    EV: {opt.ev >= 0 ? "+" : ""}
                                    {opt.ev.toFixed(3)} {reasoning.sizingComparison.evUnit} |
                                    ΔEV: -{opt.deltaEvFromBest.toFixed(3)}
                                  </div>
                                  <p className="text-[0.625rem] text-[#A1A6AA] mt-1">
                                    {opt.interpretation}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1 text-[#A1A6AA]">
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
                      <div className="rounded-xl bg-[#090B0C] border border-[#292C2F] p-3 text-[0.6875rem] text-[#A1A6AA] space-y-1">
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
                            <strong className="text-[#A1F5AE]">
                              {currentSpot.referenceStrategy.evUnit ??
                                "Sem EV (EV loss desabilitado)"}
                            </strong>
                          </span>
                        </div>
                        {(currentSpot.referenceStrategy.solutionSource?.fileSha256 ||
                          currentSpot.referenceStrategy.assumptions?.rangesSignature ||
                          typeof currentSpot.referenceStrategy.assumptions
                            ?.achievedExploitabilityPct === "number") && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.625rem] font-mono border-t border-[#292C2F] pt-1">
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
                      <div className="rounded-xl bg-[#090B0C] border border-indigo-500/40 p-3.5 text-sm text-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold border-b border-[#292C2F] pb-2">
                          <span className="flex items-center gap-1.5">
                            <Brain className="w-4 h-4" /> Análise do AI Poker Coach (
                            {model})
                          </span>
                          {coachSources.length > 0 && (
                            <span className="text-slate-400 font-normal">
                              Fontes: {Array.from(new Set(coachSources)).join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed text-[0.8125rem]">
                          {coachExplanation}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA: Matriz 13x13 & Info do Range (Oculta antes da decisão) */}
              {showRangePanel && (
                <div className="trainer-range-panel xl:col-span-4 rounded-2xl bg-[#191B1D] border border-[#292C2F] p-3.5 shadow-xl">
                  <div className="flex items-center justify-between mb-2.5">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#F4F5F5]">
                        Matriz 13&times;13 · {currentSpot.heroPosition}
                      </h3>
                      <p className="text-[0.65rem] text-[#A1A6AA]">
                        {evaluation || peekMatrix
                          ? `Mão ativa: ${handClass}`
                          : "Protegida contra spoiler antes da decisão"}
                      </p>
                    </div>
                    {!evaluation && !isUnsolved && (
                      <button
                        type="button"
                        onClick={() => setPeekMatrix((v) => !v)}
                        className="flex items-center gap-1 rounded-lg bg-[#090B0C] border border-[#292C2F] px-2.5 py-1 text-[0.6875rem] text-[#A1A6AA] hover:text-[#F1BE60] transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {peekMatrix ? "Ocultar" : "Espiar Range"}
                      </button>
                    )}
                  </div>

                  {currentSpot.referenceStrategy.validationWarnings && (
                    <div className="mb-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 px-2.5 py-1.5 text-[0.65rem] text-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Aviso de validação:{" "}
                        {currentSpot.referenceStrategy.validationWarnings.join("; ")}
                      </span>
                    </div>
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
                    <div className="aspect-square rounded-xl bg-[#090B0C] border border-dashed border-[#292C2F] flex flex-col items-center justify-center text-center p-6 gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#18B88D]/10 border border-[#18B88D]/30 flex items-center justify-center text-[#A1F5AE]">
                        <Brain className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[#F4F5F5]">
                          Estratégia oculta antes da decisão
                        </p>
                        <p className="text-[0.6875rem] text-[#A1A6AA] max-w-xs leading-relaxed">
                          Tome sua decisão nos botões abaixo da mesa (ou teclas{" "}
                          <kbd className="px-1 py-0.5 rounded bg-[#191B1D] border border-[#292C2F] font-mono text-white">
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

        {/* Modal do SolverAdapter v1.1 */}
        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-[#191B1D] border border-[#292C2F] shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#292C2F] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Adaptador Versionado de Soluções — SolverAdapter v
                    {SOLVER_ADAPTER_VERSION}
                  </h3>
                  <p className="text-[0.6875rem] text-[#A1A6AA]">
                    Valida formato, stack, blinds, antes, rake, assentos, histórico,
                    board, pote, sizings, unidade de EV, soma de frequências e
                    consistência de equilíbrio.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="p-1 rounded-lg text-[#A1A6AA] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-300">
                    Aceita{" "}
                    <strong>
                      JSON (SolverAdapter v{SOLVER_ADAPTER_VERSION} / Bundle
                      TexasSolver)
                    </strong>{" "}
                    ou <strong>CSV exportado do Desktop Postflop</strong>. Dados sem
                    evidência permanecem{" "}
                    <code className="text-amber-300">UNSOLVED</code>.
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-600/50 text-emerald-300 font-semibold hover:bg-emerald-900/60 cursor-pointer flex items-center gap-1.5">
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
                      className="px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-600/50 text-amber-300 font-semibold hover:bg-amber-900/60"
                    >
                      Testar Payload Inconsistente (&rarr; UNSOLVED)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl bg-[#090B0C] border border-[#292C2F] p-2.5 text-[0.6875rem]">
                  <label className="col-span-2 flex flex-col gap-1 text-[#A1A6AA]">
                    <span>Nome do Spot (para CSV Desktop Postflop)</span>
                    <input
                      type="text"
                      value={csvSpotName}
                      onChange={(e) => setCsvSpotName(e.target.value)}
                      className="rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 text-slate-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[#A1A6AA]">
                    <span>Board</span>
                    <input
                      type="text"
                      value={csvBoardText}
                      onChange={(e) => setCsvBoardText(e.target.value)}
                      className="rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 font-mono text-slate-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[#A1A6AA]">
                    <span>Pot / Stack (BB)</span>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={csvPotBb}
                        onChange={(e) => setCsvPotBb(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 font-mono text-slate-200"
                      />
                      <input
                        type="text"
                        value={csvStackBb}
                        onChange={(e) => setCsvStackBb(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 font-mono text-slate-200"
                      />
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[#A1A6AA]">
                    <span>Ver. / Exploit %</span>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={csvVersion}
                        onChange={(e) => setCsvVersion(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 font-mono text-slate-200"
                      />
                      <input
                        type="text"
                        value={csvExploitPct}
                        onChange={(e) => setCsvExploitPct(e.target.value)}
                        className="w-1/2 rounded-lg bg-[#191B1D] border border-[#292C2F] px-2 py-1 font-mono text-slate-200"
                      />
                    </div>
                  </label>
                </div>

                <textarea
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  rows={10}
                  placeholder='Cole JSON {"schemaVersion": "1.1.0", ...} / canonical_bundle.json ou carregue CSV "Hand,Weight,Combos,Equity,EV,Check %,Check EV,..."'
                  className="w-full rounded-xl bg-[#090B0C] border border-[#292C2F] p-3 font-mono text-[0.6875rem] text-slate-200 outline-none focus:border-[#18B88D]"
                />
                {importError && (
                  <div className="rounded-xl bg-rose-950/60 border border-rose-700 p-3 text-rose-200 leading-relaxed">
                    {importError}
                  </div>
                )}
                {importResultNotice && (
                  <div className="rounded-xl bg-emerald-950/60 border border-emerald-700 p-3 text-emerald-200">
                    {importResultNotice}
                  </div>
                )}
              </div>
              <div className="px-5 py-3.5 border-t border-[#292C2F] bg-[#090B0C] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-[#A1A6AA] hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  className="px-4 py-2 rounded-xl bg-[#18B88D] hover:bg-[#22ce9f] text-xs font-extrabold text-[#090B0C]"
                >
                  Validar &amp; Importar via SolverAdapter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TrainingViewport>
  );
}
