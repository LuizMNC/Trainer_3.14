"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";
import examples from "@/data/replayExamples.json";
import type { CanonicalHand } from "@/lib/poker/handHistorySchema";
import { MAX_REPLAY_JSON_BYTES, parseCanonicalHandText } from "@/lib/poker/handHistoryValidation";
import {
  assessHandReplayability,
  buildReplayFrameSafe,
  INITIAL_PLAYBACK,
  playbackTransition,
  replayEventLabel,
  replayPlayerName,
  safeBigInt,
  safeFormatAtoms,
  safeParseCard,
  STREET_LABELS,
  UNREPLAYABLE_HAND_MESSAGE,
  type PlaybackAction,
  type ReplayPerspective,
} from "@/lib/poker/handReplay";
import {
  AI_PRACTICAL_QUESTIONS,
  analyzeDecisionSizing,
  analyzeMttReferenceAndFindings,
  buildSafeAiQuestionPayload,
  formatBb,
  formatPct,
} from "@/lib/poker/postSessionAnalysis";
import type { CanonicalSpot } from "@/lib/poker/strategySchema";
import { replayToLab, type LabScenario } from "@/lib/poker/labTransfer";
import { formatActionFrequencyPtBr, formatActionLabelPtBr } from "@/lib/poker/uiPresentation";
import {
  libraryRequest,
  libraryWrite,
  readLibraryReplay,
  runLatest,
  type LibraryListing,
  type StudyMetadata,
} from "@/lib/handLibraryClient";
import { CollapsiblePanel } from "./CollapsiblePanel";
import styles from "./ReplayerView.module.css";
import { useStudioMotion } from "./StudioMotion";
import { useReplayActionMotion } from "./useReplayActionMotion";
import type { ReplayMotionIntent } from "./replayMotion";

interface LoadedHand {
  hand: CanonicalHand;
  label: string;
  kind: "example" | "local" | "library-phh" | "library-pokerstars" | "library-json";
  key: number;
  libraryRecordId?: string;
  warnings: string[];
}

function ReplayCard({ code, dealt = true }: { code: string | null; dealt?: boolean }) {
  if (!code) {
    return (
      <span
        className={`${styles.card} ${styles.cardBack}`}
        aria-label={dealt ? "Carta oculta ou desconhecida" : "Carta não distribuída"}
      >
        {dealt ? "♠" : "—"}
      </span>
    );
  }
  const card = safeParseCard(code);
  if (!card) {
    return (
      <span
        className={`${styles.card} ${styles.cardBack}`}
        aria-label="Carta ilegível na fonte"
        title={`Carta não reconhecida: ${code}`}
      >
        ?
      </span>
    );
  }
  const suitBg =
    card.suit === "♥"
      ? "#C83E3E"
      : card.suit === "♦"
        ? "#2563EB"
        : card.suit === "♣"
          ? "#2E8B57"
          : "#26292B";
  return (
    <span
      className={styles.card}
      style={{ backgroundColor: suitBg, color: "#FFFFFF", borderColor: "rgba(255,255,255,0.22)" }}
      aria-label={code}
    >
      <strong>{card.rank}</strong>
      <span>{card.suit}</span>
    </span>
  );
}

export function ReplayerView({
  librarySelection,
  mttSpots = [],
  onLibraryStudyChanged,
  onSendToLab,
  onBackToLibrary,
  onConsultAi,
}: {
  librarySelection?: { recordId: string; requestKey: number } | null;
  mttSpots?: readonly CanonicalSpot[];
  onLibraryStudyChanged?: () => void;
  onSendToLab?: (scenario: LabScenario) => void;
  onBackToLibrary?: () => void;
  onConsultAi?: (draftPrompt: string) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedHand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ summary: string; detail: string } | null>(null);
  const [exampleId, setExampleId] = useState(examples[0]?.id ?? "");
  const request = useRef({ version: 0 });

  const loadExample = useCallback(async (id: string) => {
    setLoading(true);
    setLoaded(null);
    setError(null);
    setExampleId(id);
    await runLatest(
      request.current,
      async () => {
        const example = examples.find((e) => e.id === id);
        if (!example) throw new Error("Exemplo local inexistente.");
        const response = await fetch(example.path, { cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível ler o exemplo local.");
        const raw = await response.text();
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        const hash = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
        if (hash !== example.canonicalSha256) {
          throw new Error("O exemplo difere da cópia gerada pelo pipeline.");
        }
        const parsed = parseCanonicalHandText(raw);
        if (parsed.source.sha256 !== example.sourceSha256) {
          throw new Error("Proveniência do exemplo incompatível com o catálogo local.");
        }
        const check = assessHandReplayability(parsed);
        if (!check.ok) {
          throw new Error(`${check.summary} (${check.detail})`);
        }
        return { hand: check.hand, label: example.label, kind: "example" as const, warnings: check.warnings };
      },
      (value, key) => setLoaded({ ...value, key }),
      (e) =>
        setError({
          summary: UNREPLAYABLE_HAND_MESSAGE,
          detail: e instanceof Error ? e.message : "Não foi possível carregar o exemplo local.",
        }),
      () => setLoading(false),
    );
  }, []);

  const loadLibrary = useCallback(async (recordId: string) => {
    setLoading(true);
    setLoaded(null);
    setError(null);
    setExampleId("");
    await runLatest(
      request.current,
      async () => {
        const result = await readLibraryReplay(recordId);
        const check = assessHandReplayability(result.hand);
        if (!check.ok) {
          throw new Error(check.detail);
        }
        return {
          hand: check.hand,
          label: result.fileName || result.recordId,
          kind:
            result.provenance === "PHH_RECONSTRUCTED"
              ? ("library-phh" as const)
              : result.provenance === "POKERSTARS_RECONSTRUCTED"
                ? ("library-pokerstars" as const)
                : ("library-json" as const),
          libraryRecordId: result.recordId,
          warnings: check.warnings,
        };
      },
      (value, key) => setLoaded({ ...value, key }),
      (e) =>
        setError({
          summary: UNREPLAYABLE_HAND_MESSAGE,
          detail: e instanceof Error ? e.message : "Não foi possível abrir a mão da Biblioteca.",
        }),
      () => setLoading(false),
    );
  }, []);

  useEffect(() => {
    let active = true;
    const controller = request.current;
    queueMicrotask(() => {
      if (!active) return;
      if (librarySelection) {
        void loadLibrary(librarySelection.recordId);
      } else if (examples[0]?.id) {
        void loadExample(examples[0].id);
      } else {
        setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.version++;
    };
  }, [loadExample, loadLibrary, librarySelection]);

  async function loadFile(file: File) {
    setLoading(true);
    setLoaded(null);
    setError(null);
    setExampleId("");
    await runLatest(
      request.current,
      async () => {
        if (file.size > MAX_REPLAY_JSON_BYTES) throw new Error("Arquivo acima do limite de 6 MiB.");
        const parsed = parseCanonicalHandText(await file.text());
        const check = assessHandReplayability(parsed);
        if (!check.ok) throw new Error(check.detail);
        return { hand: check.hand, label: file.name, kind: "local" as const, warnings: check.warnings };
      },
      (value, key) => setLoaded({ ...value, key }),
      (e) =>
        setError({
          summary: UNREPLAYABLE_HAND_MESSAGE,
          detail: e instanceof Error ? e.message : "JSON recusado na validação canônica.",
        }),
      () => setLoading(false),
    );
  }

  return (
    <section className={styles.root} aria-label="Replayer de mãos">
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>REVISÃO PÓS-SESSÃO</p>
          <h2>
            <Clapperboard size={22} /> Replayer
          </h2>
          <p>Explore a sequência registrada, um evento de cada vez, com análise matemática e validação estrita.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBackToLibrary && (
            <button
              type="button"
              onClick={onBackToLibrary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#26334A] bg-[#090D16] px-3 py-1.5 text-xs font-bold text-[#F8FAFC] hover:border-[#60A5FA] transition"
            >
              <ArrowLeft size={14} />
              Voltar à Biblioteca
            </button>
          )}
          <span className={styles.badge}>Estudo offline · sem avaliação estratégica inventada</span>
        </div>
      </header>

      <div className={styles.sourceBar}>
        <label>
          Exemplo do pipeline
          <select
            aria-label="Exemplo do pipeline"
            value={exampleId}
            disabled={loading}
            onChange={(e) => void loadExample(e.target.value)}
          >
            <option value="" disabled>
              Escolha um exemplo
            </option>
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.upload}>
          <Upload size={16} />
          <span>Abrir JSON local</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Abrir JSON canônico local"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void loadFile(file);
            }}
          />
        </label>
        <p>Leitura no navegador. O arquivo escolhido não é enviado a serviços.</p>
      </div>

      {loading && (
        <p className={styles.notice} role="status">
          Conferindo integridade do histórico para reprodução…
        </p>
      )}

      {error && (
        <div className={styles.error} role="alert" data-testid="replay-error-box">
          <strong>Histórico recusado no Replayer</strong>
          <p>{error.summary}</p>
          <p>Detalhe técnico: {error.detail}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onBackToLibrary && (
              <button
                type="button"
                onClick={onBackToLibrary}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B82F6] bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1D4ED8]"
              >
                <ArrowLeft size={14} />
                Voltar à Biblioteca
              </button>
            )}
            {examples[0]?.id && (
              <button
                type="button"
                onClick={() => void loadExample(examples[0]!.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#05070B] px-3 py-1.5 text-xs font-bold text-[#F8FAFC]"
              >
                <RotateCcw size={14} />
                Carregar exemplo válido
              </button>
            )}
          </div>
        </div>
      )}

      {loaded && (
        <ReplaySession
          key={loaded.key}
          loaded={loaded}
          mttSpots={mttSpots}
          onLibraryStudyChanged={onLibraryStudyChanged}
          onSendToLab={onSendToLab}
          onBackToLibrary={onBackToLibrary}
          onConsultAi={onConsultAi}
        />
      )}
    </section>
  );
}

function ReplaySession({
  loaded,
  mttSpots,
  onLibraryStudyChanged,
  onSendToLab,
  onBackToLibrary,
  onConsultAi,
}: {
  loaded: LoadedHand;
  mttSpots: readonly CanonicalSpot[];
  onLibraryStudyChanged?: () => void;
  onSendToLab?: (scenario: LabScenario) => void;
  onBackToLibrary?: () => void;
  onConsultAi?: (draftPrompt: string) => void;
}) {
  const { hand } = loaded;
  const { motion, setMotion } = useStudioMotion();
  const tableRef = useRef<HTMLDivElement | null>(null);
  const motionIntent = useRef<ReplayMotionIntent>("none");
  const [playback, setPlayback] = useState(INITIAL_PLAYBACK);
  const [perspective, setPerspective] = useState<ReplayPerspective>({ kind: "public" });
  const [markedForReview, setMarkedForReview] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [libraryStudy, setLibraryStudy] = useState<StudyMetadata | null>(null);
  const [aiQuestion, setAiQuestion] = useState<string>(AI_PRACTICAL_QUESTIONS[0]);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const recordId = loaded.libraryRecordId;
    if (recordId) {
      void libraryRequest<LibraryListing>({ action: "list", q: recordId, pageSize: "10" })
        .then((listing) => {
          if (!active) return;
          const match = listing.items.find((it) => it.recordId === recordId);
          if (match) {
            setLibraryStudy(match.study);
            setMarkedForReview(match.study.pending);
          }
        })
        .catch(() => {});
    }
    try {
      const raw = window.localStorage.getItem("poker_replayer_marked_hands_v1");
      if (raw && !recordId) {
        const list = JSON.parse(raw) as unknown;
        queueMicrotask(() => {
          if (active) setMarkedForReview(Array.isArray(list) && list.includes(hand.recordId));
        });
      }
    } catch {
      // Ignora indisponibilidade de localStorage
    }
    return () => {
      active = false;
    };
  }, [hand.recordId, loaded.libraryRecordId]);

  const toggleMarkForReview = async () => {
    const next = !markedForReview;
    setMarkedForReview(next);
    setSyncStatus(null);
    try {
      const raw = window.localStorage.getItem("poker_replayer_marked_hands_v1");
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const safeList = Array.isArray(list) ? list : [];
      const updated = next
        ? Array.from(new Set([...safeList, hand.recordId]))
        : safeList.filter((id) => id !== hand.recordId);
      window.localStorage.setItem("poker_replayer_marked_hands_v1", JSON.stringify(updated));
    } catch {
      // Ignora erro local
    }
    if (loaded.libraryRecordId) {
      try {
        const listing = await libraryRequest<LibraryListing>({
          action: "list",
          q: loaded.libraryRecordId,
          pageSize: "10",
        });
        const currentStudy =
          listing.items.find((it) => it.recordId === loaded.libraryRecordId)?.study ??
          libraryStudy ?? { note: "", tags: [], favorite: false, pending: false, lastReviewedAtUtc: null };
        const saved = await libraryWrite<StudyMetadata>("study", {
          recordId: loaded.libraryRecordId,
          study: {
            note: currentStudy.note,
            tags: currentStudy.tags,
            favorite: currentStudy.favorite,
            pending: next,
            markReviewed: false,
          },
        });
        setLibraryStudy(saved);
        setMarkedForReview(saved.pending);
        setSyncStatus(
          saved.pending
            ? "Sincronizado com Biblioteca (Revisão pendente)"
            : "Sincronizado com Biblioteca (Revisão removida)",
        );
        onLibraryStudyChanged?.();
      } catch {
        setSyncStatus("Salvo apenas localmente no navegador (SQLite indisponível).");
      }
    }
  };

  const count = hand.events.length;
  const dispatch = useCallback(
    (action: PlaybackAction, visualIntent: ReplayMotionIntent = "none") => {
      motionIntent.current = action.type === "tick" ? "step" : visualIntent;
      setPlayback((state) => (count >= 1 ? playbackTransition(state, action, count) : state));
    },
    [count],
  );

  useEffect(() => {
    if (!playback.playing || count < 1) return;
    const timer = window.setTimeout(() => dispatch({ type: "tick" }), playback.delayMs);
    return () => window.clearTimeout(timer);
  }, [playback.playing, playback.cursor, playback.delayMs, dispatch, count]);

  const frameResult = useMemo(
    () => buildReplayFrameSafe(hand, playback.cursor, perspective),
    [hand, playback.cursor, perspective],
  );

  useReplayActionMotion({
    tableRef, intentRef: motionIntent, cursor: playback.cursor,
    event: frameResult.ok ? frameResult.frame.event : null,
    delayMs: playback.delayMs, motion, playing: playback.playing,
    perspective: perspective.kind === "player" ? `player:${perspective.playerIndex}` : perspective.kind,
  });

  const activeListItem = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const item = activeListItem.current;
    const container = list.current;
    if (!item || !container) return;
    const row = item.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    if (row.top < bounds.top) container.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) container.scrollTop += row.bottom - bounds.bottom;
  }, [playback.cursor]);

  if (!frameResult.ok) {
    return (
      <div className={styles.error} role="alert" data-testid="replay-frame-error">
        <strong>{frameResult.summary}</strong>
        <p>Detalhe técnico: {frameResult.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {onBackToLibrary && (
            <button
              type="button"
              onClick={onBackToLibrary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B82F6] bg-[#2563EB] px-3 py-1.5 text-xs font-bold text-white"
            >
              <ArrowLeft size={14} />
              Voltar à Biblioteca
            </button>
          )}
          <button
            type="button"
            onClick={() => setPlayback(INITIAL_PLAYBACK)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#05070B] px-3 py-1.5 text-xs font-bold text-[#F8FAFC]"
          >
            <RotateCcw size={14} />
            Reiniciar reprodução
          </button>
        </div>
      </div>
    );
  }

  const frame = frameResult.frame;
  const event = frame.event;
  const scale = hand.amountPolicy?.decimalPlaces ?? 0;
  const fmt = (value: unknown) => safeFormatAtoms(value, scale);
  const currency =
    hand.amountPolicy?.currency?.status === "MISSING"
      ? "unidades da fonte"
      : hand.amountPolicy?.currency?.value ?? "fichas";
  const isSourceOrigin = event?.origin === "PHH" || event?.origin === "POKERSTARS";
  const actor =
    event?.playerIndex !== null && event?.playerIndex !== undefined
      ? replayPlayerName(hand, event.playerIndex)
      : isSourceOrigin
        ? "Dealer / fonte"
        : "Motor";

  const selectedPerspective =
    perspective.kind === "player" ? `player:${perspective.playerIndex}` : perspective.kind;
  const goto = (cursor: number, animateStep = false) => dispatch({ type: "goto", cursor }, animateStep ? "step" : "none");
  const restart = () => {
    dispatch({ type: "pause" });
    dispatch({ type: "goto", cursor: 0 });
  };

  const mathAnalysis = analyzeDecisionSizing(hand, frame);
  const referenceAnalysis = analyzeMttReferenceAndFindings(hand, frame, mathAnalysis, mttSpots);
  const aiPayload = buildSafeAiQuestionPayload(hand, frame, mathAnalysis, referenceAnalysis, aiQuestion);

  function seat(index: number) {
    const player = hand.players[index];
    if (!player) return null;
    const phase = (2 * Math.PI * index) / Math.max(1, hand.players.length);
    const current = event?.playerIndex === index;
    const waiting = frame.snapshot.actorIndex === index;
    const position =
      player.position?.status === "MISSING" || player.position?.value === "OTHER"
        ? null
        : player.position?.value ?? null;
    const cardsForSeat = frame.visibleCards[index] ?? [null, null];
    const stackVal = frame.snapshot.stacksAtoms[index] ?? "0";
    const betVal = frame.snapshot.betsAtoms[index] ?? "0";
    const seatLabel =
      player.seat?.status && player.seat.status !== "MISSING" ? ` · assento ${player.seat.value}` : "";

    return (
      <article
        key={index}
        data-testid={`replay-player-${index}`}
        className={`${styles.seat} ${hand.players.length === 2 ? styles.headsUpSeat : ""} ${
          current ? styles.acted : ""
        } ${waiting ? styles.waiting : ""} ${frame.snapshot.folded[index] ? styles.folded : ""}`}
        style={
          {
            "--seat-x": `${50 + 41 * Math.sin(phase)}%`,
            "--seat-y": `${50 + 34 * Math.cos(phase)}%`,
          } as React.CSSProperties
        }
      >
        <div className={styles.playerLine}>
          <UserRound size={16} className={styles.avatar} aria-hidden="true" />
          <strong title={replayPlayerName(hand, index)}>{replayPlayerName(hand, index)}</strong>
          {(position === "BTN" || position === "BTN/SB") && (
            <span className={styles.dealer} aria-label="Dealer button inferido da posição">
              D
            </span>
          )}
        </div>
        <div className={styles.position}>
          {player.sourceLabel}
          {position ? ` · ${position}${player.position?.status === "INFERRED" ? "*" : ""}` : " · posição não informada"}
          {seatLabel}
        </div>
        <div className={styles.holeCards}>
          {cardsForSeat.map((c, i) => (
            <ReplayCard key={i} code={c} dealt={Boolean(frame.dealt[index])} />
          ))}
        </div>
        <div className={styles.stack}>
          <span>Stack</span>
          <strong data-testid={`stack-${index}`}>{fmt(stackVal)}</strong>
        </div>
        <div className={styles.bet}>
          Aposta pendente <b>{fmt(betVal)}</b>
        </div>
        <div className={styles.playerStatus}>
          {frame.snapshot.folded[index]
            ? "Fold"
            : frame.snapshot.mucked[index]
              ? "Muck"
              : frame.snapshot.allIn[index]
                ? "All-in"
                : waiting
                  ? "A agir"
                  : frame.publicCards[index]
                    ? "Cartas reveladas"
                    : "Em revisão"}
        </div>
        <span className={styles.motionLabel} data-replay-cue-label aria-hidden="true" />
        <span className={styles.motionObjects} data-replay-particles aria-hidden="true">
          <i /><i /><i />
        </span>
      </article>
    );
  }

  const gameFormatTag =
    hand.gameFormat?.status === "MISSING"
      ? "Modalidade desconhecida"
      : hand.gameFormat?.value === "MTT"
        ? "MTT comprovado"
        : hand.gameFormat?.value === "SNG"
          ? "Spin & Go / SNG (fora MTT)"
          : "Cash Game (fora MTT)";
  const tournamentMeta =
    typeof hand.metadata?.tournamentId === "string" ? `Torneio #${hand.metadata.tournamentId}` : null;
  const split = Math.ceil(hand.players.length / 2);
  const rawBlinds = hand.table?.rawBlindsAtoms ?? [];
  const rawAntes = hand.table?.rawAntesAtoms ?? [];

  const analysisQuickSummary = mathAnalysis.hasDecision
    ? `Pote: ${formatBb(mathAnalysis.potBeforeBb)} · ${
        mathAnalysis.paidAtoms > 0n
          ? `Aposta/Ação: ${formatBb(mathAnalysis.paidBb)}${
              mathAnalysis.betPctOfPot !== null ? ` (${formatPct(mathAnalysis.betPctOfPot)})` : ""
            }`
          : mathAnalysis.actionTitle
      }${
        mathAnalysis.minEquityForCallPct !== null
          ? ` · Eq. mín. call: ${formatPct(mathAnalysis.minEquityForCallPct)}`
          : ""
      } · ${referenceAnalysis.findingLabel}`
    : `${mathAnalysis.streetLabel} · ${referenceAnalysis.headline}`;

  const findingTone =
    referenceAnalysis.findingCategory === "STRUCTURAL_ERROR" || referenceAnalysis.findingCategory === "EV_LOSS"
      ? "text-[#FCA5A5] border-[#EF4444]/50 bg-[#EF4444]/10"
      : referenceAnalysis.findingCategory === "STRATEGY_DEVIATION" ||
          referenceAnalysis.findingCategory === "FREQUENCY_DEVIATION"
        ? "text-[#FCD34D] border-[#F59E0B]/50 bg-[#F59E0B]/10"
        : referenceAnalysis.findingCategory === "ALIGNED"
          ? "text-[#4ADE80] border-[#22C55E]/50 bg-[#22C55E]/10"
          : "text-[#93C5FD] border-[#3B82F6]/40 bg-[#2563EB]/10";

  return (
    <div className="space-y-4" data-replay-motion={motion}>
      <div className={styles.handHeader}>
        <div>
          <strong>{loaded.label}</strong>
          <p className={styles.provenance}>
            {loaded.kind === "example"
              ? "Exemplo sintético · cópia gerada pelo pipeline e hash conferido"
              : loaded.kind === "library-pokerstars"
                ? "Biblioteca · Histórico PokerStars reconstruído via PokerKit; sem avaliação GTO"
                : loaded.kind === "library-phh"
                  ? "Biblioteca · PHH reconstruído pelo motor; autoria não autenticada"
                  : "Arquivo local / Biblioteca JSON · estrutura conferida; origem não autenticada"}
            {tournamentMeta ? ` · ${tournamentMeta}` : ""} · {gameFormatTag}
          </p>
        </div>
        <span className={`${styles.badge} ${!hand.results.complete ? styles.partial : ""}`}>
          {hand.results.complete ? "Mão completa na fonte" : "Validação parcial · sem resultado final"}
        </span>
      </div>

      {!hand.results.complete && (
        <p className="rounded-xl border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-3.5 py-2 text-xs text-[#FDE68A]" role="status">
          Histórico com informações parciais: o Replayer exibe apenas os eventos confirmados até {STREET_LABELS[hand.ending.street] ?? hand.ending.street}, sem inventar ações nem resultado final.
        </p>
      )}

      <div className={styles.perspective}>
        {onSendToLab && (
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "pause" });
              onSendToLab(replayToLab(hand, frame));
            }}
          >
            Enviar cenário ao Laboratório
          </button>
        )}
        <button
          type="button"
          onClick={() => void toggleMarkForReview()}
          aria-pressed={markedForReview}
          style={{
            border: "1px solid #26334A",
            borderRadius: "8px",
            padding: "8px 12px",
            background: markedForReview ? "#2563EB25" : "#090D16",
            color: markedForReview ? "#93C5FD" : "#F8FAFC",
            fontSize: "0.75rem",
            fontWeight: 700,
          }}
        >
          {markedForReview ? "★ Marcada para revisão" : "☆ Marcar para revisão"}
        </button>
        {syncStatus && (
          <span className="text-[0.6875rem] text-[#93C5FD]" role="status">
            {syncStatus}
          </span>
        )}
        <label>
          Perspectiva
          <select
            aria-label="Perspectiva"
            value={selectedPerspective}
            onChange={(e) => {
              dispatch({ type: "pause" });
              const value = e.target.value;
              setPerspective(
                value.startsWith("player:")
                  ? { kind: "player", playerIndex: Number(value.slice(7)) }
                  : value === "recorded"
                    ? { kind: "recorded" }
                    : { kind: "public" },
              );
            }}
          >
            <option value="public">Visão pública</option>
            {hand.players.map((p) => (
              <option key={p.index} value={`player:${p.index}`}>
                Jogador: {replayPlayerName(hand, p.index)}
              </option>
            ))}
            <option value="recorded">Visão completa pós-sessão</option>
          </select>
        </label>
        <p>
          {perspective.kind === "public"
            ? "Cartas privadas ficam ocultas até a revelação pública."
            : perspective.kind === "player"
              ? "Mostra suas cartas conhecidas após a distribuição, além das revelações públicas."
              : "Todas as cartas conhecidas na fonte até este evento. Essa informação não era necessariamente pública."}
        </p>
      </div>

      {/* ÁREA 1: REPRODUÇÃO (Mesa + Controles + Linha do Tempo) */}
      <div className={styles.layout} aria-label="Área de reprodução da mão">
        <div className={styles.main}>
          <div className={styles.tableMeta}>
            <span>
              SB <b>{fmt(rawBlinds[0] ?? "0")}</b> · BB <b>{fmt(rawBlinds[1] ?? "0")}</b>
            </span>
            <span>Antes (configuração PHH): {rawAntes.map(fmt).join(" / ") || "0"}</span>
            <span>
              {currency} · escala {scale}
            </span>
          </div>
          <div
            ref={tableRef}
            className={styles.table}
            data-testid="replay-frame"
            data-cursor={frame.cursor}
            data-player-count={hand.players.length}
          >
            <div className={styles.felt} />
            {Array.from({ length: split }, (_, i) => seat(i))}
            <div className={styles.center}>
              <p className={styles.street}>
                {STREET_LABELS[frame.snapshot.street] ?? frame.snapshot.street}
                {frame.showdown ? " · showdown registrado" : ""}
                {frame.atEnd && !frame.showdown && frame.completed ? " · mão encerrada" : ""}
              </p>
              <div className={styles.board} aria-label="Board do evento atual">
                {frame.snapshot.board.length ? (
                  frame.snapshot.board.map((c, idx) => <ReplayCard key={`${c}-${idx}`} code={c} />)
                ) : (
                  <span className={styles.emptyBoard}>Board ainda não distribuído</span>
                )}
              </div>
              <div className={styles.pot}>
                <span>POTE TOTAL</span>
                <strong data-testid="replay-pot">{fmt(frame.snapshot.potAtoms)}</strong>
              </div>
              <span className={styles.potHint}>Inclui apostas pendentes</span>
            </div>
            {Array.from({ length: hand.players.length - split }, (_, i) => seat(i + split))}
          </div>
          <p className={styles.tableNote}>
            Distribuição visual relativa à ordem PHH. * Posição inferida da fonte. Assentos físicos aparecem somente quando informados.
          </p>
          <div className={styles.controls}>
            <div className={styles.transport}>
              <button
                type="button"
                aria-label="Voltar ao início"
                onClick={() => goto(0)}
                disabled={frame.cursor === 0}
              >
                <SkipBack size={18} />
              </button>
              <button
                type="button"
                aria-label="Evento anterior"
                onClick={() => goto(frame.cursor - 1)}
                disabled={frame.cursor === 0}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                className={styles.play}
                aria-label={playback.playing ? "Pausar" : "Reproduzir"}
                disabled={frame.atEnd}
                onClick={() => dispatch({ type: playback.playing ? "pause" : "play" })}
              >
                {playback.playing ? <Pause size={18} /> : <Play size={18} />}
                <span>{playback.playing ? "Pausar" : "Reproduzir"}</span>
              </button>
              <button
                type="button"
                aria-label="Próximo evento"
                onClick={() => goto(frame.cursor + 1, true)}
                disabled={frame.atEnd}
              >
                <ChevronRight size={20} />
              </button>
              <button
                type="button"
                aria-label="Ir ao final"
                onClick={() => goto(count)}
                disabled={frame.atEnd}
              >
                <SkipForward size={18} />
              </button>
              <button
                type="button"
                aria-label="Reiniciar mão"
                onClick={restart}
                disabled={frame.cursor === 0 && !playback.playing}
                title="Reiniciar mão"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <label className={styles.speed}>
              Velocidade
              <select
                aria-label="Velocidade de reprodução"
                value={playback.delayMs}
                onChange={(e) => dispatch({ type: "speed", delayMs: Number(e.target.value) })}
              >
                <option value={2000}>0,5× · 2 s</option>
                <option value={1000}>1× · 1 s</option>
                <option value={500}>2× · 0,5 s</option>
              </select>
            </label>
            <label className={styles.speed}>
              Animações
              <select aria-label="Animações do Replayer" value={motion} onChange={(e) => setMotion(e.target.value as typeof motion)}>
                <option value="normal">Normal</option>
                <option value="fast">Rápidas</option>
                <option value="off">Desligadas</option>
              </select>
            </label>
            <label className={styles.progress}>
              <span data-testid="replay-progress">
                {frame.cursor === 0 ? "Início" : `Evento ${frame.cursor} de ${count}`}
                {frame.atEnd ? (hand.results.complete ? " · fim da mão" : " · fim do trecho parcial") : ""}
              </span>
              <input
                aria-label="Progresso da mão"
                type="range"
                min={0}
                max={count}
                value={frame.cursor}
                onChange={(e) => goto(Number(e.target.value))}
              />
            </label>
          </div>
          {frame.completed && (
            <section className={styles.settlement} aria-label="Liquidação registrada">
              <h3>Potes liquidados na fonte</h3>
              {hand.pots.map((pot, i) => (
                <div key={pot.index}>
                  <strong>
                    {i === 0 ? "Principal" : `Lateral ${i}`}: {fmt(pot.amountAtoms)}
                  </strong>
                  <span>
                    Elegíveis: {pot.eligiblePlayerIndices.map((p) => replayPlayerName(hand, p)).join(", ")}
                  </span>
                  <span>
                    {pot.awardsAtoms
                      .map((value, p) =>
                        safeBigInt(value) > 0n ? `${replayPlayerName(hand, p)} recebeu ${fmt(value)}` : "",
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ))}
            </section>
          )}
          {!frame.completed && (
            <p className={styles.notice}>
              {frame.atEnd
                ? "O histórico termina neste ponto e não informa um resultado final."
                : "A composição final dos potes será exibida somente ao concluir uma mão completa."}
            </p>
          )}
        </div>

        <aside className={styles.aside}>
          <section className={styles.explanation} aria-label="Explicação do evento">
            <div className={styles.eventTag}>
              {!event
                ? "ESTADO INICIAL"
                : event.origin === "POKERSTARS"
                  ? "REGISTRO POKERSTARS"
                  : event.origin === "PHH"
                    ? "REGISTRO DA FONTE"
                    : "OPERAÇÃO AUTOMÁTICA"}
            </div>
            <h3>{replayEventLabel(event)}</h3>
            {event && (
              <p>
                {actor}
                {event.amountAtoms !== null ? ` · ${fmt(event.amountAtoms)} ${currency}` : ""}
              </p>
            )}
            {event?.kind === "CompletionBettingOrRaisingTo" && (
              <p>O valor da ação é o alvo total nesta street. O incremento pago está indicado abaixo.</p>
            )}
            {event?.kind === "UncollectedBetReturn" && (
              <p>
                Classificação da aposta não paga. O crédito físico aparece na coleta das fichas; este registro não adiciona um segundo crédito.
              </p>
            )}
            {event?.kind === "ChipsPushing" && (
              <p>Prêmio destinado no pote. O stack é atualizado no evento de crédito das fichas.</p>
            )}
            {event?.kind === "BetCollection" && (
              <p>
                Apostas passam à coleta do motor; somente o excesso devolvido aumenta o stack. O pote total já incluía essas apostas.
              </p>
            )}
            {event?.kind === "HoleDealing" && (
              <p>Duas cartas privadas distribuídas. A perspectiva escolhida controla sua visibilidade.</p>
            )}
            {event &&
              hand.players.map((p, i) => {
                const delta =
                  safeBigInt(event.after.stacksAtoms[i]) - safeBigInt(event.before.stacksAtoms[i]);
                const movements = [
                  safeBigInt(event.paidAtoms[i]) > 0n ? `Contribuiu ${fmt(event.paidAtoms[i])}` : "",
                  safeBigInt(event.returnedAtoms[i]) > 0n ? `Devolução ${fmt(event.returnedAtoms[i])}` : "",
                  safeBigInt(event.awardedAtoms[i]) > 0n ? `Prêmio ${fmt(event.awardedAtoms[i])}` : "",
                  delta !== 0n ? `Stack ${delta > 0n ? "+" : ""}${fmt(delta)}` : "",
                ].filter(Boolean);
                return movements.length ? (
                  <div className={styles.movement} key={p.index}>
                    <strong>{replayPlayerName(hand, i)}</strong>
                    <span>{movements.join(" · ")}</span>
                  </div>
                ) : null;
              })}
            <details>
              <summary>Contribuições até este evento</summary>
              {hand.players.map((p, i) => (
                <p key={p.index}>
                  {replayPlayerName(hand, i)}: líquida {fmt(frame.contributionsAtoms[i] ?? "0")} · devolução{" "}
                  {fmt(frame.returnedAtoms[i] ?? "0")} · prêmio destinado {fmt(frame.awardsAtoms[i] ?? "0")}
                </p>
              ))}
            </details>
          </section>
          <section className={styles.timeline} aria-label="Lista cronológica de eventos">
            <div className={styles.timelineTitle}>
              <h3>Sequência da mão</h3>
              <span>{count} eventos</span>
            </div>
            <div className={styles.eventList} ref={list}>
              <button
                type="button"
                className={frame.cursor === 0 ? styles.selectedEvent : ""}
                aria-current={frame.cursor === 0 ? "step" : undefined}
                onClick={() => goto(0)}
              >
                00 · Início da mão
              </button>
              {hand.events.map((e, i) => (
                <button
                  type="button"
                  ref={frame.cursor === i + 1 ? activeListItem : undefined}
                  key={e.sequence}
                  aria-label={`Selecionar evento ${i + 1}: ${replayEventLabel(e)}`}
                  aria-current={frame.cursor === i + 1 ? "step" : undefined}
                  className={`${frame.cursor === i + 1 ? styles.selectedEvent : ""} ${
                    e.origin === "RULE_DERIVED" ? styles.derivedEvent : ""
                  }`}
                  onClick={() => goto(i + 1)}
                >
                  <span className={styles.eventNumber}>{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{replayEventLabel(e)}</strong>
                    <small>
                      {e.playerIndex !== null
                        ? replayPlayerName(hand, e.playerIndex)
                        : e.origin === "PHH" || e.origin === "POKERSTARS"
                          ? "Dealer / fonte"
                          : "Motor"}{" "}
                      ·{" "}
                      {e.origin === "POKERSTARS"
                        ? "PokerStars"
                        : e.origin === "PHH"
                          ? "Fonte PHH"
                          : "Automático"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* ÁREA 2: ANÁLISE PÓS-SESSÃO (Compacta e Recolhível, mantendo a mesa em destaque) */}
      <CollapsiblePanel
        title="Análise Pós-Sessão da Decisão"
        subtitle={analysisQuickSummary}
        open={analysisOpen}
        onToggle={setAnalysisOpen}
        tone="blue"
        icon={<BarChart2 size={16} />}
        badge={
          <span className={`rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold ${findingTone}`}>
            {referenceAnalysis.findingLabel}
          </span>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs" data-testid="post-session-analysis-panel">
          {/* Bloco 1: Análise Matemática das Apostas */}
          <div className="rounded-xl border border-[#1E293B] bg-[#05070B] p-3.5 space-y-2">
            <h3 className="text-[0.75rem] font-extrabold uppercase tracking-wider text-[#60A5FA]">
              1. Aposta, Stack &amp; Pot Odds
            </h3>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[0.75rem]">
              <dt className="text-[#94A3B8]">Pote antes da ação:</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">{formatBb(mathAnalysis.potBeforeBb)}</dd>

              <dt className="text-[#94A3B8]">Valor a pagar (call):</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">{formatBb(mathAnalysis.toCallBb)}</dd>

              <dt className="text-[#94A3B8]">Investido nesta ação:</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">{formatBb(mathAnalysis.paidBb)}</dd>

              {mathAnalysis.totalStreetBetBb !== null && mathAnalysis.isRaise && (
                <>
                  <dt className="text-[#94A3B8]">Alvo total na street:</dt>
                  <dd className="font-mono font-bold text-[#FCD34D] text-right">
                    {formatBb(mathAnalysis.totalStreetBetBb)}
                  </dd>
                </>
              )}

              <dt className="text-[#94A3B8]">Tamanho (% do pote):</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">
                {mathAnalysis.betPctOfPot !== null ? formatPct(mathAnalysis.betPctOfPot) : "—"}
              </dd>

              <dt className="text-[#94A3B8]">Stack efetivo:</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">
                {formatBb(mathAnalysis.effectiveStackBb)}
              </dd>

              <dt className="text-[#94A3B8]">SPR:</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">
                {mathAnalysis.spr !== null ? mathAnalysis.spr.toLocaleString("pt-BR") : "—"}
              </dd>

              <dt className="text-[#94A3B8]">Jogadores ativos:</dt>
              <dd className="font-mono font-bold text-[#F8FAFC] text-right">
                {mathAnalysis.activePlayersCount}
                {mathAnalysis.hasAllInOrSidePot ? " (all-in/side pot)" : ""}
              </dd>
            </dl>

            {mathAnalysis.betPctBaseLabel && (
              <p className="text-[0.6875rem] text-[#94A3B8]">
                Base do % do pote: <span className="text-[#CBD5E1]">{mathAnalysis.betPctBaseLabel}</span>.
              </p>
            )}

            {mathAnalysis.minEquityForCallPct !== null && (
              <p className="rounded-lg border border-[#3B82F6]/30 bg-[#2563EB]/10 px-2.5 py-1.5 text-[0.6875rem] text-[#BFDBFE]">
                Equidade mínima para call, sem ação futura:{" "}
                <strong className="font-mono text-white">{formatPct(mathAnalysis.minEquityForCallPct)}</strong> (pot odds{" "}
                {mathAnalysis.potOddsRatio}).
              </p>
            )}
            {mathAnalysis.minEquityForCallPct === null && mathAnalysis.villainMinEquityVsBetPct !== null && (
              <p className="rounded-lg border border-[#3B82F6]/30 bg-[#2563EB]/10 px-2.5 py-1.5 text-[0.6875rem] text-[#BFDBFE]">
                Equidade mínima para call do oponente, sem ação futura:{" "}
                <strong className="font-mono text-white">{formatPct(mathAnalysis.villainMinEquityVsBetPct)}</strong>.
              </p>
            )}

            {mathAnalysis.previousStreetActions.length > 0 && (
              <details className="text-[0.6875rem] text-[#94A3B8]">
                <summary className="cursor-pointer font-semibold text-[#CBD5E1]">
                  Histórico anterior ({mathAnalysis.previousStreetActions.length})
                </summary>
                <ul className="mt-1 space-y-0.5 pl-2 border-l border-[#1E293B]">
                  {mathAnalysis.previousStreetActions.slice(-8).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            )}

            {mathAnalysis.notes.map((n, i) => (
              <p key={i} className="text-[0.6875rem] text-[#94A3B8]">
                • {n}
              </p>
            ))}
          </div>

          {/* Bloco 2: Ranges MTT e Classificação Honesta */}
          <div className="rounded-xl border border-[#1E293B] bg-[#05070B] p-3.5 space-y-2">
            <h3 className="text-[0.75rem] font-extrabold uppercase tracking-wider text-[#60A5FA]">
              2. Ranges MTT &amp; Avaliação
            </h3>
            <p className="font-bold text-[#F8FAFC]">{referenceAnalysis.headline}</p>
            <p className="text-[0.6875rem] text-[#94A3B8]">{referenceAnalysis.mttFormatDisclaimer}</p>

            <div className={`rounded-lg border p-2.5 space-y-1 ${findingTone}`}>
              <div className="font-extrabold text-[0.75rem]">{referenceAnalysis.findingLabel}</div>
              <p className="text-[0.6875rem] text-[#E2E8F0]">{referenceAnalysis.findingSummary}</p>
              {referenceAnalysis.evLossValue !== null && (
                <p className="text-[0.6875rem] font-mono">
                  EV Loss do modelo: {referenceAnalysis.evLossValue} {referenceAnalysis.evLossUnit}
                </p>
              )}
            </div>

            {referenceAnalysis.chartFrequencies && (
              <div className="space-y-1 rounded-lg border border-[#1E293B] bg-[#090D16] p-2.5">
                <p className="text-[0.6875rem] font-semibold text-[#CBD5E1]">
                  Mão {referenceAnalysis.heroHandClass} no chart ({referenceAnalysis.kind === "VERIFIED_GTO_SOLUTION" ? "Solução verificada" : "Chart importado · sem EV"}):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(referenceAnalysis.chartFrequencies).map(([act, freq]) => (
                    <span
                      key={act}
                      className="rounded border border-[#1E293B] bg-[#05070B] px-2 py-0.5 text-[0.6875rem] font-mono text-[#F8FAFC]"
                    >
                      {formatActionLabelPtBr(act)}: {formatActionFrequencyPtBr(freq)}
                    </span>
                  ))}
                </div>
                {referenceAnalysis.chartCellWarning && (
                  <p className="text-[0.6875rem] text-[#FCD34D]">{referenceAnalysis.chartCellWarning}</p>
                )}
              </div>
            )}

            {referenceAnalysis.limitations.length > 0 && (
              <ul className="space-y-0.5 text-[0.6875rem] text-[#94A3B8]">
                {referenceAnalysis.limitations.map((lim, i) => (
                  <li key={i}>• {lim}</li>
                ))}
              </ul>
            )}

            {referenceAnalysis.conceptualNotes.length > 0 && (
              <ul className="space-y-0.5 text-[0.6875rem] text-[#CBD5E1] pt-1 border-t border-[#1E293B]">
                {referenceAnalysis.conceptualNotes.map((c, i) => (
                  <li key={i}>• {c}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Bloco 3: TheNerdEinsten sob Ação Explícita */}
          <div className="rounded-xl border border-[#1E293B] bg-[#05070B] p-3.5 space-y-2.5">
            <h3 className="text-[0.75rem] font-extrabold uppercase tracking-wider text-[#60A5FA] flex items-center gap-1.5">
              <Sparkles size={14} /> 3. TheNerdEinsten (Pós-Sessão)
            </h3>
            <p className="text-[0.6875rem] text-[#94A3B8]">
              Envio exclusivamente manual. Nicks reais, número do torneio, arquivo e ID da mão são removidos antes de montar o rascunho.
            </p>
            <label className="block text-[0.6875rem] text-[#CBD5E1]">
              Pergunta prática
              <select
                aria-label="Pergunta prática para o TheNerdEinsten"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#26334A] bg-[#090D16] px-2.5 py-1.5 text-xs text-[#F8FAFC]"
              >
                {AI_PRACTICAL_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
            <details className="text-[0.6875rem] text-[#94A3B8]">
              <summary className="cursor-pointer font-semibold text-[#CBD5E1]">
                Pré-visualizar resumo sanitizado
              </summary>
              <pre className="mt-1.5 max-h-36 overflow-auto whitespace-pre-wrap rounded border border-[#1E293B] bg-[#090D16] p-2 text-[0.6875rem] text-[#CBD5E1]">
                {aiPayload}
              </pre>
            </details>
            {onConsultAi ? (
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: "pause" });
                  onConsultAi(aiPayload);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#3B82F6] bg-[#2563EB] hover:bg-[#1D4ED8] px-3 py-2 text-xs font-extrabold text-white transition"
              >
                <Sparkles size={14} />
                Enviar rascunho ao TheNerdEinsten
              </button>
            ) : (
              <p className="text-[0.6875rem] text-[#94A3B8]">
                Abra o TheNerdEinsten na aba Estudos para colar o resumo acima.
              </p>
            )}
          </div>
        </div>
      </CollapsiblePanel>
    </div>
  );
}
