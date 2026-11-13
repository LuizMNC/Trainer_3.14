"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Eye,
  Flame,
  Gauge,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  ShieldCheck,
  Shuffle,
  Sparkles,
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
import type { HandHistoryItem } from "./StatsView";

interface TrainerViewProps {
  canonicalSpots: CanonicalSpot[];
  apiKey: string;
  model: string;
  requestedSpotId?: string | null;
  requestedMode?: TrainerModeId | null;
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
    label: "UNSOLVED — CONCEITUAL",
    cls: "bg-amber-500/15 border-amber-500/40 text-amber-200",
  },
};

export function TrainerView({
  canonicalSpots,
  apiKey,
  model,
  requestedSpotId,
  requestedMode,
  onClearRequestedSpot,
  onRecordHistory,
  onRecordAdaptiveAttempt,
  onImportVerifiedSpot,
  onOpenSettings,
}: TrainerViewProps) {
  // ETAPA 3: Dois modos independentes (Aprendizagem vs GTO Técnico)
  // Inicia em LEARNING quando não há soluções VERIFIED carregadas por padrão
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
  const [difficulty, setDifficulty] = useState<DrillDifficulty>("borderline");

  // Randomizador de frequências (com suporte a seed reproduzível)
  const [useRng, setUseRng] = useState<boolean>(true);
  const [rngSeed, setRngSeed] = useState<string>("reglife-seed-01");
  const [useSeededRng, setUseSeededRng] = useState<boolean>(false);
  const seededStepRef = useRef<number>(1);

  // Nível de confiança para diagnóstico adaptativo (ETAPA 5)
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>("media");
  const [peekMatrix, setPeekMatrix] = useState<boolean>(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importResultNotice, setImportResultNotice] = useState<string | null>(null);
  const [csvSpotName, setCsvSpotName] = useState("BTN vs BB SRP 30BB chipEV — Ah Kd 7c (Desktop Postflop)");
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
    // Regra 5 da Etapa 3: No Modo GTO Técnico, impedir apresentação de spots não-VERIFIED!
    const basePool =
      trainerMode === "GTO_TECHNICAL" ? verifiedOnlySpots : canonicalSpots;

    const res = basePool.filter((s) => {
      if (trainerMode === "LEARNING") {
        if (sourceFilter === "didactic" && s.referenceStrategy.status !== "DIDACTIC_DEMO")
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
      // Guarda estrita da Etapa 3 Item 5:
      if (targetMode === "GTO_TECHNICAL") {
        const check = assertSpotAllowedInTechnicalGtoMode(spot);
        if (!check.allowed) {
          setBlockedSpotWarning(check.reason ?? "Spot bloqueado no Modo GTO Técnico.");
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
      setRngValue(nextRng);
      setEvaluation(null);
      setChosenAction(null);
      setCoachExplanation(null);
      setCoachError(null);
      setCoachSources([]);
      setPeekMatrix(false);
    },
    [difficulty, trainerMode, verifiedOnlySpots, computeNextRngRoll],
  );

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
    if (requestedSpotId) {
      const target = canonicalSpots.find((s) => s.spotId === requestedSpotId);
      if (target) {
        queueMicrotask(() => {
          const effectiveMode: TrainerModeId =
            requestedMode ??
            (target.referenceStrategy.status === "VERIFIED" ? "GTO_TECHNICAL" : "LEARNING");
          setTrainerMode(effectiveMode);
          dealSpecificSpot(target, effectiveMode);
          onClearRequestedSpot?.();
        });
      }
      return;
    }
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
  ]);

  const handleModeSwitch = (nextMode: TrainerModeId) => {
    setTrainerMode(nextMode);
    if (nextMode === "GTO_TECHNICAL" && currentSpot.referenceStrategy.status !== "VERIFIED") {
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

      const nowTs = 1794500000000 + attemptSeqRef.current * 1000;
      attemptSeqRef.current += 1;

      if (res.gtoScored) {
        const isGood = res.classification !== "ev_error";
        setSessionTotal((t) => t + 1);
        if (isGood) {
          setSessionRight((r) => r + 1);
          setStreak((s) => s + 1);
        } else {
          setStreak(0);
        }

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

  // Atalhos de teclado
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

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
  }, [currentSpot, evaluation, dealNextHand, handleAction]);

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
        setImportResultNotice(`Arquivo '${file.name}' carregado (${file.size} bytes). Clique em Validar & Importar.`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    setImportResultNotice(null);
    const trimmed = importJsonText.trim();
    if (!trimmed) {
      setImportError("Cole um JSON (SolverAdapter v1.1 / TexasSolver Bundle) ou carregue um CSV do Desktop Postflop.");
      return;
    }

    try {
      // Detecta CSV exportado pelo Desktop Postflop (`Hand,Weight,Combos,...`)
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
              stackBb: pos === "BTN" || pos === "BB" ? (Number.isFinite(effStack) ? effStack : 27.9) : 30,
            })),
            heroPosition: "BTN",
            villainPosition: "BB",
            actionHistory: [
              { street: "PREFLOP", position: "BTN", action: "Raise", sizeBb: 2.1 },
              { street: "PREFLOP", position: "BB", action: "Call", sizeBb: 2.1 },
              { street: "FLOP", position: "BB", action: "Check" },
            ],
            street: boardCards.length === 4 ? "TURN" : boardCards.length === 5 ? "RIVER" : "FLOP",
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
            setImportError(`Falha ao validar CSV Desktop Postflop: ${csvParsed.errors.join(" | ")}`);
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

      // Suporta bundle auditável gerado por `pipeline/solve_texassolver.py`
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

      // Suporta o contrato versionado completo SolverAdapter v1.1.0
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
      icmMode: "ICM", // ERRO PROPOSITAL: ICM com bbEV e sem payoutsUsd
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
        AA: { Call: 0.6, Fold: 0.2 }, // ERRO PROPOSITAL: soma = 0.80 != 1.0
      },
      matrixEv: {
        AA: { Call: 1.0, Fold: 5.0 }, // ERRO PROPOSITAL: Fold tem EV muito maior que Call
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

  // Raciocínio de Blockers, Range Advantage, Nut Advantage, Realização de Equidade e Comparação de Sizings (ETAPA 3)
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

  return (
    <div className="flex flex-col gap-5">
      {/* Seletor de Modos Independentes (ETAPA 3): Modo Aprendizagem vs Modo GTO Técnico */}
      <div className="rounded-2xl bg-slate-900/95 border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 p-1.5 rounded-xl">
          <button
            type="button"
            onClick={() => handleModeSwitch("LEARNING")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              trainerMode === "LEARNING"
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <div className="text-left">
              <div>Modo Aprendizagem (Pedagógico)</div>
              <div className="text-[10px] font-normal opacity-80">
                Fixação de aulas, conceitos e heurísticas ({canonicalSpots.length} spots)
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch("GTO_TECHNICAL")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              trainerMode === "GTO_TECHNICAL"
                ? "bg-emerald-600 text-white shadow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <div className="text-left">
              <div>Modo GTO Técnico (Soluções Verificadas)</div>
              <div className="text-[10px] font-normal opacity-80">
                Exclusivo status VERIFIED: Frequências, EV e EV Loss ({verifiedOnlySpots.length}{" "}
                spots)
              </div>
            </div>
          </button>
        </div>

        {/* Seletor de Confiança do Aluno (ETAPA 5) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            Sua Confiança na Decisão:
          </span>
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {(
              [
                { id: "baixa", label: "Baixa (Dúvida)", activeCls: "bg-amber-600 text-white" },
                { id: "media", label: "Média", activeCls: "bg-sky-600 text-white" },
                { id: "alta", label: "Alta (Convicção)", activeCls: "bg-emerald-600 text-white" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setConfidenceLevel(c.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                  confidenceLevel === c.id
                    ? c.activeCls
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alerta de Bloqueio caso o usuário tente abrir spot didático/não resolvido no Modo GTO Técnico */}
      {blockedSpotWarning && (
        <div className="rounded-xl bg-amber-950/50 border border-amber-500/60 p-3.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300 block">
                Guarda de Integridade do Modo GTO Técnico (Regra 5 da Etapa 3)
              </span>
              {blockedSpotWarning}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBlockedSpotWarning(null)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-[11px]"
          >
            Entendi
          </button>
        </div>
      )}

      {/* Barra de Filtros e Randomizador */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          {trainerMode === "LEARNING" ? (
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-indigo-300 font-medium outline-none"
            >
              <option value="all">Todas as Fontes ({canonicalSpots.length})</option>
              <option value="verified">Soluções Verificadas ({verifiedOnlySpots.length})</option>
              <option value="didactic">Demo Didática (Sintética — Sem EV de Solver)</option>
              <option value="chart">Charts Locais (229 s/ EV)</option>
              <option value="unsolved">Spots UNSOLVED (Conceitual)</option>
            </select>
          ) : (
            <span className="rounded-lg bg-emerald-950/60 border border-emerald-600/50 px-2.5 py-1.5 text-xs text-emerald-300 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Filtro Travado: Apenas VERIFIED ({verifiedOnlySpots.length})
            </span>
          )}

          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">Formato: Todos</option>
            <option value="MTT">MTT (6-Max / 8-Max)</option>
            <option value="SNG">SNG / Spin (3-Max)</option>
          </select>

          <select
            value={stackFilter}
            onChange={(e) => setStackFilter(e.target.value)}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">Todos os Stacks</option>
            <option value="14">14 BB</option>
            <option value="15">15 BB</option>
            <option value="17">17 BB</option>
            <option value="20">20 BB</option>
            <option value="30">30 BB</option>
            <option value="50">50 BB</option>
            <option value="100">100 BB</option>
            <option value="spin">Spin &amp; Go (3-15 BB)</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">Spots ({filteredSpots.length})</option>
            <option value="rfi">RFI (Open Raise)</option>
            <option value="vs_rfi">vs RFI / ICM / PKO</option>
            <option value="vs_limp">BB vs SB Limp</option>
            <option value="flop_cbet_ip">Flop C-Bet IP</option>
            <option value="turn_cbet_ip">Turn / River Barrel IP</option>
            <option value="bb_vs_cbet">BB vs C-Bet</option>
            <option value="push_fold">Spin Push/Fold</option>
            <option value="vs_shove">Spin vs Shove</option>
          </select>

          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">Todas Posições</option>
            {POSITIONS_8MAX.map((p) => (
              <option key={p} value={p}>
                Herói: {p}
              </option>
            ))}
          </select>

          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as DrillDifficulty)}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-amber-300 font-medium outline-none"
          >
            <option value="borderline">Foco: Mãos Marginais</option>
            <option value="mixed">Foco: Estratégias Mistas</option>
            <option value="all">Aleatória (169)</option>
          </select>

          <button
            type="button"
            onClick={() => setUseRng((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
              useRng
                ? "bg-indigo-500/20 border-indigo-400/60 text-indigo-200"
                : "bg-slate-950 border-slate-700 text-slate-400"
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            RNG {useRng ? `ON (${rngValue})` : "OFF"}
          </button>

          {useRng && (
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
              <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSeededRng}
                  onChange={(e) => setUseSeededRng(e.target.checked)}
                  className="accent-indigo-500"
                />
                Seed:
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
                  className="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono text-indigo-200 outline-none"
                />
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-slate-950 border border-emerald-600/50 text-emerald-300 hover:bg-emerald-950/40 transition"
          >
            <Upload className="w-3.5 h-3.5" />
            SolverAdapter v{SOLVER_ADAPTER_VERSION}
          </button>
        </div>

        {/* Placar ao vivo */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono font-bold text-amber-300">{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5">
            <span className="text-slate-400">Sessão:</span>
            <span className="font-mono font-bold text-emerald-400">
              {sessionRight}/{sessionTotal} ({sessionPct}%)
            </span>
          </div>
          {mixedAttempts.length > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-lg bg-slate-950 border border-indigo-500/30 px-2.5 py-1.5"
              title="Aderência acumulada às frequências mistas (1 - distância L1/2)"
            >
              <span className="text-indigo-300">Mix:</span>
              <span className="font-mono font-bold text-white">
                {adherence.adherencePct}% ({mixedAttempts.length})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bloqueio Estrito quando Modo GTO Técnico está ativo sem nenhuma solução VERIFIED carregada */}
      {trainerMode === "GTO_TECHNICAL" &&
        (verifiedOnlySpots.length === 0 ||
          currentSpot.referenceStrategy.status !== "VERIFIED") && (
          <div className="rounded-2xl bg-rose-950/50 border-2 border-rose-500/60 p-5 text-xs text-rose-100 flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-start gap-3 max-w-3xl">
              <Lock className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-rose-300 text-sm block">
                  Bloqueio de Integridade — Modo GTO Técnico Exige Solução VERIFIED de Solver Real
                </span>
                <p className="text-rose-200/90 leading-relaxed">
                  Nenhuma solução <code className="font-mono text-white">VERIFIED</code> está carregada no catálogo padrão (os 9 cenários sintéticos anteriores foram reclassificados na Auditoria de Integridade como <code className="font-mono text-indigo-200">DIDACTIC_DEMO</code> ou <code className="font-mono text-amber-200">UNSOLVED</code> por não possuírem arquivo/execução real de solver externo). Os botões de decisão e a pontuação de EV loss estão bloqueados neste modo até que uma solução verificada seja importada via <code className="font-mono text-emerald-300">SolverAdapter v{SOLVER_ADAPTER_VERSION}</code>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleModeSwitch("LEARNING")}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
              >
                Usar Modo Aprendizagem
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
              >
                Importar Solução (SolverAdapter)
              </button>
            </div>
          </div>
        )}

      {/* Área Principal */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Coluna Esquerda */}
        <div className="xl:col-span-7 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-bold ${badge.cls}`}
                >
                  {badge.label}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {currentSpot.format} · {currentSpot.variant} · Ante{" "}
                  {currentSpot.anteBbPerPlayer}bb ·{" "}
                  {currentSpot.referenceStrategy.assumptions?.icmMode ?? "chipEV"}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                {currentSpot.name}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={currentSpot.spotId}
                onChange={(e) => {
                  const found = filteredSpots.find((s) => s.spotId === e.target.value);
                  if (found) dealSpecificSpot(found);
                }}
                className="max-w-[220px] rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
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
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sortear Mão
              </button>
            </div>
          </div>

          <PokerTable
            spot={legacyCurrent}
            cards={cards}
            rngValue={rngValue}
            useRng={useRng}
            board={currentSpot.board}
            potBbOverride={currentSpot.potBb}
            anteLabel={`Ante ${currentSpot.anteBbPerPlayer}bb`}
            formatLabel={`${currentSpot.format} ${currentSpot.playersInitial}-Max`}
          />

          {/* Proveniência e Hipóteses explícitas */}
          <div className="rounded-xl bg-slate-900/75 border border-slate-800 px-3.5 py-2 text-[11px] text-slate-400 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Fonte:{" "}
                <strong className="text-slate-200">
                  {currentSpot.referenceStrategy.solutionSource?.label ?? "Nenhuma"}
                </strong>
              </span>
              <span className="font-mono">
                Hash: {currentSpot.referenceStrategy.assumptionsHash ?? "UNSOLVED"} | Unidade:{" "}
                <strong className={currentSpot.referenceStrategy.evUnit ? "text-emerald-300" : "text-amber-300"}>
                  {currentSpot.referenceStrategy.evUnit ?? "Sem EV (EV loss desabilitado)"}
                </strong>
              </span>
            </div>
            {(currentSpot.referenceStrategy.solutionSource?.fileSha256 ||
              currentSpot.referenceStrategy.assumptions?.rangesSignature ||
              typeof currentSpot.referenceStrategy.assumptions?.achievedExploitabilityPct === "number") && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 border-t border-slate-800/70 pt-1">
                <span>
                  {currentSpot.referenceStrategy.assumptions?.rangesSignature
                    ? `Ranges: ${currentSpot.referenceStrategy.assumptions.rangesSignature}`
                    : ""}
                </span>
                <span>
                  {typeof currentSpot.referenceStrategy.assumptions?.achievedExploitabilityPct === "number"
                    ? `Exploitability: ${currentSpot.referenceStrategy.assumptions.achievedExploitabilityPct.toFixed(3)}% | `
                    : ""}
                  {currentSpot.referenceStrategy.solutionSource?.fileSha256
                    ? `SHA-256: ${currentSpot.referenceStrategy.solutionSource.fileSha256.slice(0, 12)}...`
                    : ""}
                </span>
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {currentSpot.legalActions.map((act, idx) => {
              const isChosen = chosenAction === act.name;
              const isBest = evaluation?.bestAction === act.name;
              const freqVal = currentHandDist?.[act.name];
              const evVal = currentHandEvMap?.[act.name];
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
                    borderColor: isChosen
                      ? "#fbbf24"
                      : evaluation && isBest
                        ? "#22c55e"
                        : undefined,
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-xl py-3 px-4 font-bold text-white border transition shadow-md ${
                    evaluation
                      ? isChosen || isBest
                        ? "bg-slate-800 ring-2 ring-amber-400/50"
                        : "bg-slate-900/50 border-slate-800 opacity-50"
                      : "bg-slate-900 hover:bg-slate-800 border-slate-700 hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                >
                  <span
                    className="w-full h-1 rounded-full mb-2"
                    style={{ backgroundColor: act.color }}
                  />
                  <span className="text-sm">{act.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {evaluation && !isUnsolved && freqVal !== undefined
                      ? `${Math.round(freqVal * 100)}%${
                          evVal !== undefined && currentSpot.referenceStrategy.evUnit
                            ? ` (${evVal >= 0 ? "+" : ""}${evVal.toFixed(2)} ${currentSpot.referenceStrategy.evUnit})`
                            : ""
                        }`
                      : `Tecla ${idx + 1}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Barra Visual de Partição do Randomizador de Frequências (quando revelado) */}
          {evaluation && !isUnsolved && currentHandDist && useRng && (
            <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
                  Partição do Randomizador [1..100] para {handClass} (Rolagem:{" "}
                  <strong className="text-indigo-300 font-mono">{rngValue}</strong>)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Alvo RNG: <strong className="text-white">{evaluation.rngTargetAction}</strong>
                </span>
              </div>
              <div className="relative h-5 w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex">
                {currentSpot.legalActions.map((act) => {
                  const pct = Math.round((currentHandDist[act.name] ?? 0) * 100);
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={act.name}
                      style={{ width: `${pct}%`, backgroundColor: act.color }}
                      className="h-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden whitespace-nowrap"
                      title={`${act.name}: ${pct}%`}
                    >
                      {pct >= 12 ? `${act.name} ${pct}%` : ""}
                    </div>
                  );
                })}
                {/* Marcador da rolagem */}
                <div
                  style={{ left: `${Math.min(99, Math.max(1, rngValue))}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_#fff]"
                />
              </div>
            </div>
          )}

          {/* Card de Resultado / Conceitual */}
          {evaluation && (
            <div
              className={`rounded-2xl border p-4 flex flex-col gap-3 shadow-lg ${
                evaluation.classification === "exact_primary"
                  ? "bg-emerald-950/50 border-emerald-500/60"
                  : evaluation.classification === "unsolved"
                    ? "bg-slate-900 border-amber-500/50"
                    : evaluation.classification === "ev_error"
                      ? "bg-rose-950/40 border-rose-500/60"
                      : "bg-amber-950/40 border-amber-500/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {evaluation.classification === "ev_error" ? (
                    <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                  ) : evaluation.classification === "unsolved" ? (
                    <BookOpen className="w-6 h-6 text-amber-300 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2
                      className={`w-6 h-6 shrink-0 mt-0.5 ${
                        evaluation.classification === "exact_primary"
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }`}
                    />
                  )}
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {evaluation.headline}
                    </h3>
                    <p className="text-sm text-slate-200 mt-0.5">
                      {evaluation.detail}
                    </p>
                    {evaluation.gtoScored && !evaluation.evScored && evaluation.evUnavailableReason && (
                      <p className="text-[11px] text-amber-300 mt-1 font-medium">
                        {evaluation.evUnavailableReason}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">
                      <strong className="text-slate-300">Guia conceitual:</strong>{" "}
                      {currentSpot.lesson.conceptualGuidance}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={askCoach}
                    disabled={coachLoading}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {coachLoading ? "Analisando..." : "Explicar com AI Coach"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dealNextHand()}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition shadow"
                  >
                    Próxima Mão (Espaço)
                  </button>
                </div>
              </div>

              {/* Comparação Matemática de Sizings (Item 3 da Etapa 3) */}
              {reasoning.sizingComparison.available && (
                <div className="rounded-xl bg-slate-950/85 border border-slate-800 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Scale className="w-4 h-4" />
                      Comparação de Sizings / Ações ({handClass} — Unidade:{" "}
                      {reasoning.sizingComparison.evUnit})
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Melhor EV: {reasoning.sizingComparison.bestAction} (
                      {reasoning.sizingComparison.bestEv?.toFixed(3)}{" "}
                      {reasoning.sizingComparison.evUnit})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {reasoning.sizingComparison.options.map((opt) => (
                      <div
                        key={opt.actionName}
                        className={`rounded-lg border p-2.5 text-xs ${
                          opt.viability === "OPTIMAL"
                            ? "bg-emerald-950/35 border-emerald-600/50 text-emerald-200"
                            : opt.viability === "VIABLE_SIMPLIFICATION"
                              ? "bg-indigo-950/35 border-indigo-500/50 text-indigo-200"
                              : opt.viability === "MODERATE_LOSS"
                                ? "bg-amber-950/35 border-amber-500/50 text-amber-200"
                                : "bg-rose-950/35 border-rose-600/50 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>{opt.actionName}</span>
                          <span className="font-mono">{Math.round(opt.frequency * 100)}%</span>
                        </div>
                        <div className="font-mono text-[11px] mt-1">
                          EV: {opt.ev >= 0 ? "+" : ""}
                          {opt.ev.toFixed(3)} {reasoning.sizingComparison.evUnit} | ΔEV: -
                          {opt.deltaEvFromBest.toFixed(3)}
                          {opt.deltaPctOfPot !== null ? ` (${opt.deltaPctOfPot}% pote)` : ""}
                        </div>
                        <p className="text-[10px] opacity-90 mt-1">{opt.interpretation}</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-[10px] text-slate-400 italic">
                    {reasoning.sizingComparison.reSolveCaveat}
                  </p>
                </div>
              )}

              {coachError && (
                <div className="rounded-xl bg-rose-950/80 border border-rose-700/70 p-3 text-xs text-rose-200 flex items-center justify-between gap-2">
                  <span>{coachError}</span>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="underline font-bold text-white shrink-0"
                  >
                    Configurar Chave
                  </button>
                </div>
              )}

              {coachExplanation && (
                <div className="rounded-xl bg-slate-950/90 border border-indigo-500/40 p-4 text-sm text-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-1.5">
                      <Brain className="w-4 h-4" /> Análise do AI Poker Coach ({model})
                    </span>
                    {coachSources.length > 0 && (
                      <span className="text-slate-400 font-normal">
                        Fontes: {Array.from(new Set(coachSources)).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                    {coachExplanation}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Painel de Raciocínio Estruturado (ETAPA 3 Item 4): Blockers, Range Advantage, Nut Advantage e Realização de Equidade */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3.5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Decomposição Técnica: Blockers · Range Advantage · Nut Advantage · Realização
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Mão: <strong className="text-white">{handClass}</strong> (
                {reasoning.blocker.heroCardsFormatted})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* 1. Range Advantage */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-300">
                    1. Range Advantage{" "}
                    <span className="text-[9px] font-mono text-slate-400">
                      ({reasoning.rangeAdvantage.computationType})
                    </span>
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    Líder: {reasoning.rangeAdvantage.leader} ({reasoning.rangeAdvantage.score > 0 ? "+" : ""}
                    {reasoning.rangeAdvantage.score})
                  </span>
                </div>
                <p className="font-semibold text-white">{reasoning.rangeAdvantage.headline}</p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {reasoning.rangeAdvantage.rationale}
                </p>
              </div>

              {/* 2. Nut Advantage */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-300">
                    2. Nut Advantage{" "}
                    <span className="text-[9px] font-mono text-slate-400">
                      ({reasoning.nutAdvantage.computationType})
                    </span>
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    Líder: {reasoning.nutAdvantage.leader} ({reasoning.nutAdvantage.score > 0 ? "+" : ""}
                    {reasoning.nutAdvantage.score})
                  </span>
                </div>
                <p className="font-semibold text-white">{reasoning.nutAdvantage.headline}</p>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {reasoning.nutAdvantage.rationale}
                </p>
              </div>

              {/* 3. Blockers & Card Removal */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300">
                    3. Blockers &amp; Card Removal{" "}
                    <span className="text-[9px] font-mono text-emerald-400">
                      ({reasoning.blocker.combinatoricsType})
                    </span>
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/40 text-amber-200">
                    Score Blefe Heurístico: {reasoning.blocker.riverBluffCandidateHeuristic.score100}/100
                  </span>
                </div>
                <p className="text-slate-200 text-[11px] leading-relaxed">
                  {reasoning.blocker.blockerSummary}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {reasoning.blocker.blockedValueClasses.map((b) => (
                    <span
                      key={b.hand}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        b.reductionPct > 0
                          ? "bg-amber-950/50 border-amber-600/40 text-amber-200"
                          : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                    >
                      {b.hand}: {b.remainingCombos}/{b.baseCombos} (-{b.reductionPct}%)
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  {reasoning.blocker.riverBluffCandidateHeuristic.epistemicWarning}
                </p>
              </div>

              {/* 4. Realização de Equidade */}
              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300">4. Realização de Equidade (R)</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-sky-950/60 border border-sky-700/40 text-sky-200">
                    {reasoning.equityRealization.positionalStatus} · R ≈{" "}
                    {reasoning.equityRealization.estimatedFactor}x
                  </span>
                </div>
                <p className="font-semibold text-white">{reasoning.equityRealization.headline}</p>
                <ul className="space-y-1 text-[11px] text-slate-400 list-disc list-inside">
                  {reasoning.equityRealization.factors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Direita: Matriz 13x13 */}
        <div className="xl:col-span-5 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">
              Matriz 13&times;13 do Spot
            </h3>
            {!evaluation && !isUnsolved && (
              <button
                type="button"
                onClick={() => setPeekMatrix((v) => !v)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-300 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                {peekMatrix ? "Ocultar" : "Espiar Range"}
              </button>
            )}
          </div>

          {currentSpot.referenceStrategy.validationWarnings && (
            <div className="mb-3 rounded-lg bg-amber-950/40 border border-amber-600/40 px-3 py-2 text-[11px] text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Aviso de validação: {currentSpot.referenceStrategy.validationWarnings.join("; ")}
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
              evUnit={currentSpot.referenceStrategy.evUnit}
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
            <div className="aspect-square rounded-xl bg-slate-950/80 border border-dashed border-slate-700 flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Matriz oculta durante a decisão
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Defina sua confiança e escolha sua ação na mesa (teclas 1–4) para revelar a distribuição de referência, o EV por ação e a comparação de sizings.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal do SolverAdapter v1.0 (ETAPA 4) */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Adaptador Versionado de Soluções — SolverAdapter v{SOLVER_ADAPTER_VERSION} (ETAPA 4)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Valida formato, stack, blinds, antes, rake, assentos, histórico, board, pote, sizings, unidade de EV, soma de frequências e consistência de equilíbrio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-300">
                  Aceita <strong>JSON (SolverAdapter v{SOLVER_ADAPTER_VERSION} / Bundle TexasSolver)</strong> ou{" "}
                  <strong>CSV exportado do Desktop Postflop</strong>. Dados sem evidência permanecem{" "}
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl bg-slate-950/80 border border-slate-800 p-2.5 text-[11px]">
                <label className="col-span-2 flex flex-col gap-1 text-slate-400">
                  <span>Nome do Spot (para CSV Desktop Postflop)</span>
                  <input
                    type="text"
                    value={csvSpotName}
                    onChange={(e) => setCsvSpotName(e.target.value)}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Board</span>
                  <input
                    type="text"
                    value={csvBoardText}
                    onChange={(e) => setCsvBoardText(e.target.value)}
                    className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-slate-200"
                  />
                </label>
                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Pot / Stack (BB)</span>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={csvPotBb}
                      onChange={(e) => setCsvPotBb(e.target.value)}
                      className="w-1/2 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-slate-200"
                    />
                    <input
                      type="text"
                      value={csvStackBb}
                      onChange={(e) => setCsvStackBb(e.target.value)}
                      className="w-1/2 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-slate-200"
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-slate-400">
                  <span>Ver. / Exploit %</span>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={csvVersion}
                      onChange={(e) => setCsvVersion(e.target.value)}
                      className="w-1/2 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-slate-200"
                    />
                    <input
                      type="text"
                      value={csvExploitPct}
                      onChange={(e) => setCsvExploitPct(e.target.value)}
                      className="w-1/2 rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-slate-200"
                    />
                  </div>
                </label>
              </div>

              <textarea
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                rows={10}
                placeholder='Cole JSON {"schemaVersion": "1.1.0", ...} / canonical_bundle.json ou carregue CSV "Hand,Weight,Combos,Equity,EV,Check %,Check EV,..."'
                className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 font-mono text-[11px] text-slate-200 outline-none focus:border-emerald-500"
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
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
              >
                Validar &amp; Importar via SolverAdapter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
