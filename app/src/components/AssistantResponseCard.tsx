"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Film,
  GitCompare,
  Layers,
  MessageSquarePlus,
  Play,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { VideoEntry } from "@/lib/rag";
import {
  ASSISTANT_NAME,
  ASSISTANT_TAGLINE,
  formatProviderModel,
} from "@/lib/ai/assistantIdentity";
import {
  detectDivergences,
  EVIDENCE_LABELS,
  extractPotMathFromQuestion,
  formatFrequency,
  type DeterministicPotMath,
  type Divergence,
  type EvidenceKind,
  type SpotEvidence,
} from "@/lib/ai/provenance";
import {
  parseAssistantResponse,
  parsedToPlainText,
  type ParsedAssistantResponse,
  type ResponseSection,
} from "@/lib/ai/responseFormat";
import {
  formatActionLabelPtBr,
  getActionVisualStyle,
} from "@/lib/poker/uiPresentation";
import { AssistantMarkdown } from "./AssistantMarkdown";

/**
 * Ícone próprio do TheNerdEinsten (óculos geométricos de cientista + nó atômico/espadas).
 * Não utiliza logotipos ou marcas de terceiros.
 */
export function TheNerdEinstenIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <ellipse
        cx="14"
        cy="14"
        rx="11"
        ry="5.2"
        transform="rotate(-24 14 14)"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.25"
      />
      <ellipse
        cx="14"
        cy="14"
        rx="11"
        ry="5.2"
        transform="rotate(24 14 14)"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.25"
      />
      <circle cx="9.25" cy="14.5" r="4" fill="#0B1324" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18.75" cy="14.5" r="4" fill="#0B1324" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13.25 14.2H14.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 13.5L5.3 14.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24.5 13.5L22.7 14.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.25" cy="14.5" r="1.2" fill="#60A5FA" />
      <circle cx="18.75" cy="14.5" r="1.2" fill="#60A5FA" />
      <path d="M14 4.4L15.6 6.8H12.4L14 4.4Z" fill="#EF4444" />
    </svg>
  );
}

const PROVENANCE_STYLES: Record<EvidenceKind, { cls: string; dotCls: string }> = {
  MATH_VERIFIED: {
    cls: "bg-emerald-950/70 border-emerald-500/50 text-emerald-200",
    dotCls: "bg-emerald-400",
  },
  GTO_VERIFIED: {
    cls: "bg-blue-950/70 border-blue-500/50 text-sky-200",
    dotCls: "bg-sky-400",
  },
  CHART_NO_EV: {
    cls: "bg-amber-950/70 border-amber-500/50 text-amber-200",
    dotCls: "bg-amber-400",
  },
  DIDACTIC_DEMO: {
    cls: "bg-indigo-950/70 border-indigo-400/50 text-indigo-200",
    dotCls: "bg-indigo-400",
  },
  AI_INTERPRETATION: {
    cls: "bg-slate-900/90 border-violet-500/40 text-violet-200",
    dotCls: "bg-violet-400",
  },
  INSUFFICIENT_DATA: {
    cls: "bg-rose-950/70 border-rose-500/50 text-rose-200",
    dotCls: "bg-rose-400",
  },
};

export function ProvenanceBadge({
  kind,
  compact = false,
}: {
  kind: EvidenceKind;
  compact?: boolean;
}) {
  const info = EVIDENCE_LABELS[kind];
  const style = PROVENANCE_STYLES[kind];
  return (
    <span
      title={info.description}
      className={`inline-flex items-center gap-1.5 rounded-md border font-semibold ${
        compact ? "px-2 py-0.5 text-[0.65rem]" : "px-2.5 py-0.5 text-[0.6875rem]"
      } ${style.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dotCls}`} />
      {info.label}
    </span>
  );
}

export interface TheNerdEinstenHeaderProps {
  provider: string;
  model: string;
  totalChunks?: number;
  canChat?: boolean;
  hasMessages?: boolean;
  onResetChat?: () => void;
  onOpenSettings?: () => void;
  compact?: boolean;
}

export function TheNerdEinstenHeader({
  provider,
  model,
  totalChunks,
  canChat = false,
  hasMessages = false,
  onResetChat,
  onOpenSettings,
  compact = false,
}: TheNerdEinstenHeaderProps) {
  const metadataLabel = formatProviderModel(provider, model);
  return (
    <div
      className={`px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2.5 bg-[#05070B]/90 ${
        compact ? "rounded-t-xl" : ""
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1E3A8A]/45 via-[#0F172A] to-[#7F1D1D]/35 border border-[#3B82F6]/45 flex items-center justify-center text-[#93C5FD] shrink-0 shadow-inner">
          <TheNerdEinstenIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
              {ASSISTANT_NAME}
            </h2>
            <span className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded-md bg-[#111C33] border border-[#2563EB]/40 text-sky-200">
              {ASSISTANT_TAGLINE}
            </span>
          </div>
          <p className="text-[0.6875rem] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
            <span className="font-mono text-slate-300">{metadataLabel}</span>
            {typeof totalChunks === "number" && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Base local:{" "}
                  <strong className="text-[#60A5FA] font-semibold">
                    {totalChunks} trechos
                  </strong>
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasMessages && onResetChat && (
          <button
            type="button"
            onClick={onResetChat}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#141D2F] hover:bg-[#1E293B] text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Nova pergunta
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
              canChat
                ? "bg-[#0F1B33] border-[#2563EB]/60 text-sky-200 hover:bg-[#162647]"
                : "bg-[#2B0B11] border-[#DC2626]/70 text-red-200 hover:bg-[#3A1018]"
            }`}
          >
            {canChat ? `Configurações do ${ASSISTANT_NAME}` : `Configurar ${ASSISTANT_NAME}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Identificação compacta do spot e da mão avaliada. */
export function SpotIdentificationBar({ evidence }: { evidence: SpotEvidence }) {
  return (
    <div className="rounded-xl bg-[#090E1A] border border-[#1E293B] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <span className="font-bold text-slate-100">{evidence.spotName}</span>
        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700/80 font-mono text-sky-300 font-bold">
          {evidence.handClass}
          {evidence.cardsText ? ` (${evidence.cardsText})` : ""}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-900/80 text-slate-300">
          {evidence.heroPosition}
          {evidence.villainPosition ? ` vs ${evidence.villainPosition}` : ""}
        </span>
        {evidence.stackBb !== null && (
          <span className="px-2 py-0.5 rounded bg-slate-900/80 font-mono text-slate-300">
            {evidence.stackBb} BB
          </span>
        )}
        {evidence.chosenAction && (
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
            Ação: <strong>{formatActionLabelPtBr(evidence.chosenAction)}</strong>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ProvenanceBadge kind={evidence.kind} compact />
      </div>
    </div>
  );
}

/** Barra proporcional e painel de frequências + comparação de ações da referência. */
export function ActionFrequenciesPanel({ evidence }: { evidence: SpotEvidence }) {
  const freqs = evidence.handFrequencies;
  if (!freqs || freqs.length === 0) return null;

  const activeFreqs = freqs.filter((f) => f.frequency > 0);
  const chosen = evidence.chosenAction;
  const best = evidence.preferredActions[0] ?? freqs[0]?.action;

  return (
    <div className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          Frequências da referência para {evidence.handClass}
        </span>
        <ProvenanceBadge kind={evidence.kind} compact />
      </div>

      {/* Barra de estratégia */}
      {activeFreqs.length > 0 && (
        <div
          aria-label={`Barra de estratégia para ${evidence.handClass}`}
          className="h-3 w-full rounded-lg overflow-hidden flex bg-slate-950 border border-slate-800"
        >
          {activeFreqs.map((item) => {
            const style = getActionVisualStyle(item.action);
            const widthPct = Math.max(2, Math.round(item.frequency * 1000) / 10);
            return (
              <div
                key={item.action}
                style={{ width: `${widthPct}%`, backgroundColor: style.bg }}
                title={`${formatActionLabelPtBr(item.action)}: ${formatFrequency(item.frequency)}`}
                className="h-full transition-all"
              />
            );
          })}
        </div>
      )}

      {/* Grade de frequências por ação */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {freqs.map((item) => {
          const style = getActionVisualStyle(item.action);
          const isChosen = chosen === item.action;
          const ev =
            evidence.evAvailable && evidence.handEv && typeof evidence.handEv[item.action] === "number"
              ? evidence.handEv[item.action]
              : null;
          return (
            <div
              key={item.action}
              className={`rounded-lg px-2.5 py-1.5 border text-xs flex flex-col justify-between ${
                isChosen
                  ? "bg-slate-900 border-sky-400/70"
                  : "bg-[#05070B] border-slate-800/90"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: style.bg }}
                  />
                  {formatActionLabelPtBr(item.action)}
                </span>
                {isChosen && (
                  <span className="text-[0.625rem] uppercase font-bold text-sky-300 shrink-0">
                    Sua ação
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1 font-mono tabular-nums">
                <span className="text-sm font-extrabold text-white">
                  {formatFrequency(item.frequency)}
                </span>
                {ev !== null && (
                  <span className="text-[0.6875rem] text-emerald-300">
                    {ev >= 0 ? `+${ev.toFixed(2)}` : ev.toFixed(2)} {evidence.evUnit ?? "bb"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Painel de comparação quando o aluno escolheu uma ação diferente da principal */}
      {chosen && best && (
        <div className="rounded-lg bg-[#05070B] border border-slate-800/90 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <GitCompare className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Sua escolha:{" "}
              <strong className="text-white">{formatActionLabelPtBr(chosen)}</strong> (
              <span className="font-mono">{formatFrequency(evidence.chosenActionFrequency ?? 0)}</span>)
            </span>
            <span aria-hidden="true">vs</span>
            <span>
              Ação da referência:{" "}
              <strong className="text-emerald-300">{formatActionLabelPtBr(best)}</strong> (
              <span className="font-mono">
                {formatFrequency(freqs.find((f) => f.action === best)?.frequency ?? 0)}
              </span>
              )
            </span>
          </span>
          {!evidence.evAvailable && (
            <span className="text-[0.6875rem] text-amber-300">
              Sem EV por ação (apenas frequências do chart)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Cartão determinístico de Pot Odds, MDF e Fold Equity quando há valores reais de pote e aposta. */
export function PotOddsCard({ math }: { math: DeterministicPotMath }) {
  const fmt = (n: number) =>
    `${Number.isInteger(n) ? n : Number(n.toFixed(2)).toString().replace(".", ",")} ${math.unit}`;
  const fmtPct = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}%`;

  return (
    <div className="rounded-xl bg-[#071118] border border-emerald-500/35 p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5 text-emerald-400" />
          Informações de pot odds
        </span>
        <ProvenanceBadge kind="MATH_VERIFIED" compact />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
        <div className="rounded-lg bg-[#05070B] border border-slate-800 px-2.5 py-1.5">
          <div className="text-[0.65rem] font-sans text-slate-400">Pote antes da aposta</div>
          <div className="text-xs font-bold text-slate-100">{fmt(math.potBeforeBet)}</div>
        </div>
        <div className="rounded-lg bg-[#05070B] border border-slate-800 px-2.5 py-1.5">
          <div className="text-[0.65rem] font-sans text-slate-400">Aposta</div>
          <div className="text-xs font-bold text-slate-100">{fmt(math.opposingBet)}</div>
        </div>
        <div className="rounded-lg bg-[#05070B] border border-slate-800 px-2.5 py-1.5">
          <div className="text-[0.65rem] font-sans text-slate-400">Valor para pagar</div>
          <div className="text-xs font-bold text-slate-100">{fmt(math.callAmount)}</div>
        </div>
        <div className="rounded-lg bg-[#05070B] border border-emerald-500/40 px-2.5 py-1.5">
          <div className="text-[0.65rem] font-sans text-emerald-300">
            Equidade mínima no cenário simplificado
          </div>
          <div className="text-sm font-extrabold text-emerald-200">
            {fmtPct(math.potOdds.requiredEquityPct)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-slate-300">
        <span>
          Fórmula: <code className="font-mono text-emerald-200">{math.potOdds.formula}</code>
        </span>
        {math.mdf && (
          <span>
            MDF simplificado:{" "}
            <strong className="font-mono text-slate-100">{fmtPct(math.mdf.mdfPct)}</strong>
          </span>
        )}
        {math.bluffBreakeven && (
          <span>
            Fold equity mínima (blefe puro):{" "}
            <strong className="font-mono text-slate-100">
              {fmtPct(math.bluffBreakeven.requiredFoldEquityPct)}
            </strong>
          </span>
        )}
      </div>

      <p className="text-[0.6875rem] text-slate-400">
        Premissas: {math.potOdds.assumptions.join(" ")}
      </p>
    </div>
  );
}

/** Alerta de divergência epistêmica quando a IA contradiz a referência determinística. */
export function DivergenceAlert({ divergences }: { divergences: Divergence[] }) {
  if (!divergences.length) return null;
  return (
    <div
      role="alert"
      className="rounded-xl bg-amber-950/60 border border-amber-500/60 p-3 space-y-1.5 text-xs text-amber-100"
    >
      <div className="font-bold flex items-center gap-1.5 text-amber-200">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        Divergência detectada — prevalecem os dados verificáveis do aplicativo
      </div>
      <ul className="list-disc pl-4 space-y-1 text-[0.75rem] text-amber-100/95">
        {divergences.map((d, idx) => (
          <li key={`${d.kind}_${idx}`}>{d.message}</li>
        ))}
      </ul>
    </div>
  );
}

/** Alerta de dados insuficientes ou limitações do cenário. */
export function InsufficientDataAlert({
  evidence,
  limitationsMarkdown,
}: {
  evidence?: SpotEvidence | null;
  limitationsMarkdown?: string;
}) {
  const missing = evidence?.missingData ?? [];
  if (!missing.length && !limitationsMarkdown?.trim() && evidence?.kind !== "INSUFFICIENT_DATA") {
    return null;
  }
  return (
    <div className="rounded-xl bg-[#0A0F1D] border border-amber-500/35 p-2.5 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-bold text-amber-200 flex items-center gap-1.5 text-[0.72rem]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          Limitações e dados não informados neste cenário
        </span>
        {evidence?.kind === "INSUFFICIENT_DATA" && (
          <ProvenanceBadge kind="INSUFFICIENT_DATA" compact />
        )}
      </div>
      {missing.length > 0 && (
        <ul className="list-disc pl-4 space-y-0.5 text-[0.72rem] text-slate-300">
          {missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {limitationsMarkdown && limitationsMarkdown.trim() && (
        <div className="pt-1 border-t border-slate-800/80">
          <AssistantMarkdown content={limitationsMarkdown} />
        </div>
      )}
    </div>
  );
}

export interface AssistantResponseCardProps {
  text: string;
  streaming?: boolean;
  provider?: string;
  model?: string;
  questionText?: string;
  evidence?: SpotEvidence | null;
  potMath?: DeterministicPotMath | null;
  sourcesUsed?: string[];
  relatedVideos?: VideoEntry[];
  onRepeatSpot?: () => void;
  onCompareAnotherAction?: (suggestedPrompt: string) => void;
  onTrainSimilarHands?: () => void;
  onReviewDecision?: () => void;
  onContinueConversation?: (suggestedPrompt?: string) => void;
  onNewQuestion?: () => void;
  onSendToPostSessionAnalysis?: () => void;
}

export function AssistantResponseCard({
  text,
  streaming = false,
  provider,
  model,
  questionText = "",
  evidence = null,
  potMath: explicitPotMath = null,
  sourcesUsed = [],
  relatedVideos = [],
  onRepeatSpot,
  onCompareAnotherAction,
  onTrainSimilarHands,
  onReviewDecision,
  onContinueConversation,
  onNewQuestion,
  onSendToPostSessionAnalysis,
}: AssistantResponseCardProps) {
  const parsed: ParsedAssistantResponse = useMemo(
    () => parseAssistantResponse(text),
    [text],
  );
  const divergences = useMemo(
    () => (streaming ? [] : detectDivergences(text, evidence)),
    [text, evidence, streaming],
  );
  const potMath = useMemo(
    () => explicitPotMath ?? (questionText ? extractPotMathFromQuestion(questionText) : null),
    [explicitPotMath, questionText],
  );

  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
  const [showSources, setShowSources] = useState(false);
  const [showRecoverableRaw, setShowRecoverableRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const deepSections: ResponseSection[] = parsed.deep;
  const allDeepOpen =
    deepSections.length > 0 &&
    deepSections.every((section, idx) => Boolean(openKeys[`${section.key}_${idx}`]));

  const toggleSection = (id: string) => {
    setOpenKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllDeep = () => {
    const nextState = !allDeepOpen;
    const next: Record<string, boolean> = {};
    deepSections.forEach((section, idx) => {
      next[`${section.key}_${idx}`] = nextState;
    });
    setOpenKeys(next);
  };

  const handleCopyClean = async () => {
    const clean = parsedToPlainText(parsed, text);
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const uniqueSources = useMemo(() => {
    const list = [...sourcesUsed];
    if (evidence?.sourceLabel && !list.includes(evidence.sourceLabel)) {
      list.unshift(evidence.sourceLabel);
    }
    return Array.from(new Set(list));
  }, [sourcesUsed, evidence]);

  const comparePrompt = useMemo(() => {
    if (!evidence) return "Compare as ações alternativas neste spot e explique o que muda.";
    const alt =
      evidence.preferredActions[0] ??
      evidence.handFrequencies?.find((f) => f.action !== evidence.chosenAction)?.action ??
      "a linha principal";
    return `Compare ${evidence.chosenAction ?? "minha ação"} com ${alt} para ${evidence.handClass} em ${evidence.spotName} (${evidence.stackBb ?? ""} BB).`;
  }, [evidence]);

  const decisionToneCls =
    evidence?.decision.level === "severe_deviation"
      ? "bg-rose-950/55 border-rose-500/60 text-rose-100"
      : evidence?.decision.level === "deviation"
        ? "bg-amber-950/55 border-amber-500/60 text-amber-100"
        : evidence?.decision.level === "aligned"
          ? "bg-emerald-950/45 border-emerald-500/50 text-emerald-100"
          : "bg-[#090F1E] border-[#2563EB]/45 text-slate-100";

  return (
    <div className="w-full max-w-[68ch] space-y-3 text-slate-200">
      {/* Cabeçalho compacto da resposta com origem (Provedor | Modelo) e selo epistêmico */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-800/90">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
            <TheNerdEinstenIcon className="w-4 h-4 text-sky-400" />
            Análise do {ASSISTANT_NAME}
          </span>
          <ProvenanceBadge kind="AI_INTERPRETATION" compact />
        </div>
        <span className="text-[0.6875rem] font-mono text-slate-400">
          {formatProviderModel(provider, model)}
        </span>
      </div>

      {/* Identificação do spot quando houver evidência determinística */}
      {evidence && <SpotIdentificationBar evidence={evidence} />}

      {/* Alerta imediato de qualidade epistêmica / divergência */}
      <DivergenceAlert divergences={divergences} />

      {/* Aviso de JSON inválido/parcial com conteúdo recuperável */}
      {parsed.warnings.length > 0 && (
        <div
          role="alert"
          className="rounded-xl bg-amber-950/50 border border-amber-500/50 p-3 text-xs text-amber-100 space-y-1.5"
        >
          <p className="font-semibold">{parsed.warnings.join(" ")}</p>
          {parsed.recoverable && (
            <div>
              <button
                type="button"
                onClick={() => setShowRecoverableRaw((v) => !v)}
                className="underline font-semibold text-amber-200 hover:text-white"
              >
                {showRecoverableRaw
                  ? "Ocultar conteúdo bruto recuperável"
                  : "Visualizar conteúdo bruto recuperável"}
              </button>
              {showRecoverableRaw && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 border border-slate-800 p-2 font-mono text-[0.6875rem] text-slate-300 whitespace-pre-wrap">
                  {parsed.recoverable}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* A. RESPOSTA RÁPIDA (sempre visível primeiro) */}
      <section
        aria-label="Resposta rápida"
        className={`rounded-xl border p-3.5 space-y-2 ${decisionToneCls}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Resposta rápida
          </span>
          {evidence && evidence.decision.basis !== "INSUFFICIENT_DATA" && (
            <ProvenanceBadge
              kind={
                evidence.decision.basis === "HEURISTIC"
                  ? "AI_INTERPRETATION"
                  : evidence.decision.basis
              }
              compact
            />
          )}
        </div>

        {/* Veredito determinístico do aplicativo (nunca substituído pela IA) */}
        {evidence && evidence.chosenAction && (
          <div className="rounded-lg bg-slate-950/75 border border-slate-800/90 px-3 py-2 text-xs space-y-0.5">
            <p className="font-bold text-white">{evidence.decision.headline}</p>
            <p className="text-slate-300 text-[0.75rem]">{evidence.decision.detail}</p>
          </div>
        )}

        {parsed.quick ? (
          <AssistantMarkdown content={parsed.quick} streaming={streaming} />
        ) : (
          !streaming && (
            <p className="text-xs text-slate-400">
              O provedor não retornou texto na conclusão principal.
            </p>
          )
        )}
      </section>

      {/* B. O QUE IMPORTA NESTA MÃO */}
      {parsed.factors && (
        <section
          aria-label="O que importa nesta mão"
          className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3 space-y-1.5"
        >
          <h4 className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-sky-300">
            O que importa nesta mão
          </h4>
          <AssistantMarkdown content={parsed.factors} streaming={streaming} />
        </section>
      )}

      {/* C. INFORMAÇÕES DE APOIO (somente dados realmente disponíveis) */}
      {evidence?.handFrequencies && <ActionFrequenciesPanel evidence={evidence} />}
      {potMath && <PotOddsCard math={potMath} />}
      {parsed.support && (
        <section
          aria-label="Informações de apoio"
          className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3 space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-sky-400" />
              Números citados na resposta
            </span>
            <ProvenanceBadge kind="AI_INTERPRETATION" compact />
          </div>
          <AssistantMarkdown content={parsed.support} streaming={streaming} />
        </section>
      )}

      {/* Alertas de dados insuficientes e limitações */}
      <InsufficientDataAlert
        evidence={evidence}
        limitationsMarkdown={parsed.limitations}
      />

      {/* D. EXPLICAÇÃO APROFUNDADA (inicialmente recolhida; controles sob demanda) */}
      {(deepSections.length > 0 || uniqueSources.length > 0 || relatedVideos.length > 0) && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {deepSections.map((section, idx) => {
              const id = `${section.key}_${idx}`;
              const isOpen = Boolean(openKeys[id]);
              return (
                <button
                  key={id}
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleSection(id)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
                    isOpen
                      ? "bg-[#2563EB]/25 border-[#3B82F6]/70 text-sky-200"
                      : "bg-[#090E1A] border-[#1E293B] text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  {section.title}
                  {isOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              );
            })}

            {(uniqueSources.length > 0 || relatedVideos.length > 0) && (
              <button
                type="button"
                aria-expanded={showSources}
                onClick={() => setShowSources((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition ${
                  showSources
                    ? "bg-[#2563EB]/25 border-[#3B82F6]/70 text-sky-200"
                    : "bg-[#090E1A] border-[#1E293B] text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Ver a fonte ({uniqueSources.length + relatedVideos.length})
              </button>
            )}

            {deepSections.length > 0 && (
              <button
                type="button"
                onClick={toggleAllDeep}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition"
              >
                {allDeepOpen ? "Recolher explicação" : "Expandir explicação"}
              </button>
            )}
          </div>

          {/* Seções aprofundadas abertas */}
          {deepSections.map((section, idx) => {
            const id = `${section.key}_${idx}`;
            if (!openKeys[id]) return null;
            return (
              <section
                key={id}
                aria-label={section.title}
                className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    {section.title}
                  </h4>
                  <button
                    type="button"
                    onClick={() => toggleSection(id)}
                    className="text-[0.6875rem] text-slate-400 hover:text-white"
                  >
                    Recolher
                  </button>
                </div>
                <AssistantMarkdown content={section.body} streaming={streaming} />
              </section>
            );
          })}

          {/* Painel recolhível de fontes e vídeos */}
          {showSources && (uniqueSources.length > 0 || relatedVideos.length > 0) && (
            <section
              aria-label="Fontes utilizadas"
              className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3 space-y-2 text-xs"
            >
              {uniqueSources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.6875rem] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1 mr-1">
                    <BookOpen className="w-3 h-3" /> Fontes utilizadas:
                  </span>
                  {uniqueSources.map((src) => (
                    <span
                      key={src}
                      className="text-[0.6875rem] px-2 py-0.5 rounded-md bg-[#0F1B33] border border-[#2563EB]/40 text-sky-200"
                    >
                      {src}
                    </span>
                  ))}
                </div>
              )}

              {relatedVideos.length > 0 && (
                <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/80">
                  <span className="text-[0.6875rem] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                    <Film className="w-3 h-3" /> Vídeos relacionados na pasta local:
                  </span>
                  {relatedVideos.map((v) => (
                    <div
                      key={v.relativePath}
                      className="text-[0.6875rem] text-slate-300 flex items-center justify-between gap-2 bg-slate-900/70 px-2 py-1 rounded"
                    >
                      <span className="truncate">{v.title}</span>
                      <span className="text-[0.6875rem] text-slate-400 shrink-0">
                        {v.relativePath}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* E. PRÓXIMA AÇÃO + CONTROLES DE INTERAÇÃO */}
      <div className="rounded-xl bg-[#070B14] border border-[#1E293B] p-3 space-y-2">
        {parsed.next && (
          <div className="text-xs space-y-1">
            <span className="text-[0.6875rem] font-extrabold uppercase tracking-wider text-emerald-300">
              Próxima ação sugerida
            </span>
            <AssistantMarkdown content={parsed.next} streaming={streaming} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {onRepeatSpot && (
              <button
                type="button"
                onClick={onRepeatSpot}
                className="inline-flex items-center gap-1 rounded-lg bg-[#141D2F] hover:bg-[#1E293B] border border-[#2563EB]/40 px-2.5 py-1 text-[0.72rem] font-semibold text-sky-200 transition"
              >
                <RotateCcw className="w-3 h-3" />
                Repetir o spot
              </button>
            )}
            {onCompareAnotherAction && (
              <button
                type="button"
                onClick={() => onCompareAnotherAction(comparePrompt)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-200 transition"
              >
                <GitCompare className="w-3 h-3" />
                Comparar outra ação
              </button>
            )}
            {onTrainSimilarHands && (
              <button
                type="button"
                onClick={onTrainSimilarHands}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-200 transition"
              >
                <Play className="w-3 h-3" />
                Treinar mãos semelhantes
              </button>
            )}
            {onReviewDecision && (
              <button
                type="button"
                onClick={onReviewDecision}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-200 transition"
              >
                Revisar a decisão
              </button>
            )}
            {onSendToPostSessionAnalysis && (
              <button
                type="button"
                onClick={onSendToPostSessionAnalysis}
                className="inline-flex items-center gap-1 rounded-lg bg-[#141D2F] hover:bg-[#1E293B] border border-[#2563EB]/40 px-2.5 py-1 text-[0.72rem] font-semibold text-sky-200 transition"
              >
                <MessageSquarePlus className="w-3 h-3" />
                Enviar mão para análise pós-sessão
              </button>
            )}
            {onContinueConversation && (
              <button
                type="button"
                onClick={() => onContinueConversation()}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-200 transition"
              >
                Continuar conversa
              </button>
            )}
            {onNewQuestion && (
              <button
                type="button"
                onClick={onNewQuestion}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-300 transition"
              >
                Nova pergunta
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyClean}
            aria-label="Copiar resposta limpa"
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 px-2.5 py-1 text-[0.72rem] font-medium text-slate-200 transition"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copiar resposta
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
