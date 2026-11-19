"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { VideoEntry } from "@/lib/rag";
import type { ProviderId } from "@/lib/ai/types";
import type { CanonicalSpot } from "@/lib/poker/strategySchema";
import { readCoachResponse } from "@/lib/ai/client";
import {
  emptyProviderConfig,
  isConfigTested,
  PROVIDER_NAMES,
  type ProviderConfigs,
} from "@/lib/ai/clientStorage";
import {
  ASSISTANT_NAME,
  formatProviderModel,
} from "@/lib/ai/assistantIdentity";
import {
  evidenceToSpotContext,
  resolveEvidenceForQuestion,
  type SpotEvidence,
} from "@/lib/ai/provenance";
import {
  AssistantResponseCard,
  SpotIdentificationBar,
  TheNerdEinstenHeader,
} from "./AssistantResponseCard";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  questionText?: string;
  evidence?: SpotEvidence | null;
  streaming?: boolean;
  imagePreviewUrl?: string;
  sourcesUsed?: string[];
  relatedVideos?: VideoEntry[];
  model?: string;
  provider?: string;
  error?: boolean;
}

export interface PendingHandAnalysis {
  prompt: string;
  evidence: SpotEvidence | null;
  nonce: number;
}

export interface AiCoachViewProps {
  provider: ProviderId;
  providers: ProviderId[];
  configs: ProviderConfigs;
  onProviderChange: (provider: ProviderId) => void;
  onModelChange: (model: string) => void;
  totalChunks: number;
  videos: VideoEntry[];
  onOpenSettings: () => void;
  canonicalSpots?: CanonicalSpot[];
  pendingHandAnalysis?: PendingHandAnalysis | null;
  onClearPendingHandAnalysis?: () => void;
  onLaunchSpotDrill?: (spotId: string) => void;
  initialDraftPrompt?: { text: string; key: number; evidence?: SpotEvidence | null } | null;
}

const QUICK_PROMPTS = [
  "Dei fold com AA no SB contra abertura do HJ com 30 BB. Foi certo?",
  "Quais os 5 erros de ICM que devo evitar na reta final de um MTT?",
  "Como muda meu range de RFI e defesa em 14BB–20BB comparado a 50BB–100BB no MTT?",
  "No river o pote tinha 10 BB e o vilão apostou 5 BB. Qual a equidade mínima e o MDF?",
];

export function AiCoachView({
  provider,
  providers,
  configs,
  onProviderChange,
  onModelChange,
  totalChunks,
  videos,
  onOpenSettings,
  canonicalSpots = [],
  pendingHandAnalysis = null,
  onClearPendingHandAnalysis,
  onLaunchSpotDrill,
  initialDraftPrompt = null,
}: AiCoachViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationProvider, setConversationProvider] = useState(provider);
  const [transferHistory, setTransferHistory] = useState(false);
  const [input, setInput] = useState("");
  const [stagedEvidence, setStagedEvidence] = useState<SpotEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [videoSearch, setVideoSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageReaderRef = useRef<FileReader | null>(null);
  const msgSeqRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const lastHandNonceRef = useRef<number>(-1);
  const lastDraftKeyRef = useRef<number>(-1);

  const config = configs[provider] ?? emptyProviderConfig();
  const { apiKey, model } = config;
  const canChat = isConfigTested(config, provider === "ollama");
  const activeModel = config.models.find((m) => m.id === model);
  const supportsImages = Boolean(activeModel?.images);
  const visibleMessages = conversationProvider === provider ? messages : [];

  useEffect(() => () => {
    abortRef.current?.abort();
    imageReaderRef.current?.abort();
  }, []);

  useEffect(() => {
    if (conversationProvider === provider) return;
    abortRef.current?.abort();
    imageReaderRef.current?.abort();
    queueMicrotask(() => {
      setMessages([]);
      setConversationProvider(provider);
      setTransferHistory(false);
      setImageBase64(null);
      setImagePreviewUrl(null);
      setInput("");
    });
  }, [provider, conversationProvider]);

  useEffect(() => {
    if (!initialDraftPrompt || initialDraftPrompt.key === lastDraftKeyRef.current) {
      return;
    }
    lastDraftKeyRef.current = initialDraftPrompt.key;
    queueMicrotask(() => {
      setInput(initialDraftPrompt.text);
      setStagedEvidence(initialDraftPrompt.evidence ?? null);
      textareaRef.current?.focus();
    });
  }, [initialDraftPrompt]);

  useEffect(() => {
    if (!pendingHandAnalysis || pendingHandAnalysis.nonce === lastHandNonceRef.current) {
      return;
    }
    lastHandNonceRef.current = pendingHandAnalysis.nonce;
    queueMicrotask(() => {
      setInput(pendingHandAnalysis.prompt);
      setStagedEvidence(pendingHandAnalysis.evidence);
      onClearPendingHandAnalysis?.();
      textareaRef.current?.focus();
    });
  }, [pendingHandAnalysis, onClearPendingHandAnalysis]);

  const filteredVideos = useMemo(() => {
    const q = videoSearch.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q),
    );
  }, [videos, videoSearch]);

  const loadImageFile = (file: File) => {
    setAttachmentError("");
    if (!supportsImages) {
      setAttachmentError(
        "Este modelo aceita somente texto. Selecione e teste um modelo com suporte a imagens.",
      );
      return;
    }
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2.5 * 1024 * 1024
    ) {
      setAttachmentError("Use PNG, JPEG ou WebP de até 2,5 MiB.");
      return;
    }
    imageReaderRef.current?.abort();
    const reader = new FileReader();
    imageReaderRef.current = reader;
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx !== -1) {
        setImagePreviewUrl(dataUrl);
        setImageMimeType(file.type || "image/png");
        setImageBase64(dataUrl.slice(commaIdx + 1));
      }
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    imageReaderRef.current?.abort();
    setImageBase64(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadImageFile(file);
          return;
        }
      }
    }
  };

  const handleResetChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationProvider(provider);
    setInput("");
    setStagedEvidence(null);
    setTransferHistory(false);
    clearImage();
  };

  const switchProvider = (next: ProviderId) => {
    if (next === provider || loading) return;
    setMessages(
      transferHistory
        ? visibleMessages
            .filter((m) => !m.error)
            .map((m) => ({ ...m, imagePreviewUrl: undefined }))
        : [],
    );
    setConversationProvider(next);
    setInput("");
    clearImage();
    setTransferHistory(false);
    onProviderChange(next);
  };

  const focusInputWith = (nextPrompt?: string) => {
    if (typeof nextPrompt === "string") setInput(nextPrompt);
    textareaRef.current?.focus();
  };

  const sendMessage = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? input).trim();
    if (!textToSend && !imageBase64) return;
    if (pendingRef.current || !canChat) return;
    if (imageBase64 && !supportsImages) {
      setAttachmentError("Remova a imagem: o modelo selecionado aceita somente texto.");
      return;
    }
    pendingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    msgSeqRef.current += 1;
    const msgId = msgSeqRef.current;
    const userQuestion = textToSend || "Analise esta imagem de poker / range.";
    const activeEvidence =
      stagedEvidence ?? resolveEvidenceForQuestion(userQuestion, canonicalSpots);

    const userMsg: ChatMessage = {
      id: `u_${msgId}`,
      role: "user",
      text: userQuestion,
      imagePreviewUrl: imagePreviewUrl ?? undefined,
    };

    const currentImgBase64 = imageBase64;
    const currentImgMime = imageMimeType;
    const useStreaming = Boolean(activeModel?.streaming);

    const assistantId = `a_${msgId}`;
    let partial = "";
    setConversationProvider(provider);
    setMessages([
      ...visibleMessages,
      userMsg,
      {
        id: assistantId,
        role: "assistant",
        text: "",
        questionText: userQuestion,
        evidence: activeEvidence,
        streaming: useStreaming,
        model,
        provider,
      },
    ]);
    if (!overridePrompt) setInput("");
    setStagedEvidence(null);
    clearImage();
    setLoading(true);

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
          prompt: userMsg.text,
          model,
          apiKey,
          messages: visibleMessages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.text })),
          spotContext: activeEvidence ? evidenceToSpotContext(activeEvidence) : undefined,
          imageBase64: currentImgBase64 ?? undefined,
          imageMimeType: currentImgBase64 ? currentImgMime : undefined,
          stream: useStreaming,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await readCoachResponse(res, (text) => {
        partial = text;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text, streaming: true } : m,
          ),
        );
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, ...data, text: data.text, streaming: false }
            : m,
        ),
      );
    } catch (error) {
      const message = controller.signal.aborted
        ? "Resposta cancelada. O texto parcial está incompleto; o provedor pode ter consumido quota."
        : error instanceof Error
          ? error.message
          : "Falha de rede ao consultar o servidor TreinerLM.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                text: partial ? `${partial}\n\n${message}` : message,
                streaming: false,
                error: true,
              }
            : m,
        ),
      );
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Coluna principal do TheNerdEinsten */}
      <div className="lg:col-span-8 min-w-0 flex flex-col rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden min-h-[620px] lg:max-h-[88vh]">
        <TheNerdEinstenHeader
          provider={provider}
          model={model}
          totalChunks={totalChunks}
          canChat={canChat}
          hasMessages={visibleMessages.length > 0}
          onResetChat={handleResetChat}
          onOpenSettings={onOpenSettings}
        />

        {/* Seleção de provedor e modelo ativo */}
        <div className="p-3 border-b border-slate-800 space-y-2 bg-[#070B14]/70">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="min-w-0 text-xs text-slate-300">
              Provedor de IA
              <select
                aria-label="Provedor de IA ativo"
                value={provider}
                disabled={loading}
                onChange={(event) => switchProvider(event.target.value as ProviderId)}
                className="mt-1 block w-full min-w-0 rounded-lg bg-slate-950 border border-slate-700 p-2"
              >
                {providers.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_NAMES[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs text-slate-300">
              Modelo ativo
              <select
                aria-label="Modelo de IA ativo"
                value={model}
                disabled={loading || !config.models.length}
                onChange={(event) => {
                  clearImage();
                  onModelChange(event.target.value);
                }}
                className="mt-1 block w-full min-w-0 rounded-lg bg-slate-950 border border-slate-700 p-2"
              >
                <option value="">Configure um modelo</option>
                {config.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex gap-2 items-start text-xs text-slate-300">
            <input
              type="checkbox"
              checked={transferHistory}
              disabled={loading || !visibleMessages.length}
              onChange={(event) => setTransferHistory(event.target.checked)}
              className="mt-0.5"
            />
            Ao trocar de provedor, compartilhar o texto desta conversa com o novo provedor
            (imagens não são transferidas).
          </label>
          <p className="text-xs text-slate-400">
            A troca inicia uma conversa vazia por padrão. Histórico pessoal nunca é enviado
            automaticamente. Ao clicar em Enviar, pergunta, contexto determinístico da mão e
            anexos selecionados seguem para o provedor escolhido.
          </p>
          {visibleMessages.length > 0 && (
            <button
              type="button"
              onClick={handleResetChat}
              className="text-xs text-slate-300 underline"
            >
              Limpar histórico
            </button>
          )}
        </div>

        {/* Área de mensagens */}
        <div
          role="log"
          aria-label={`Conversa com ${ASSISTANT_NAME}`}
          aria-live="polite"
          aria-busy={loading}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {!canChat && (
            <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-amber-200 leading-relaxed">
                <strong>Configuração ainda não testada:</strong> informe sua chave em
                Configurações do {ASSISTANT_NAME}, consulte os modelos, selecione um e clique
                em Testar conexão. O teste faz uma chamada real. Nenhuma integração é
                considerada operacional apenas por testes simulados.
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Configurar {ASSISTANT_NAME}
              </button>
            </div>
          )}

          {visibleMessages.length === 0 ? (
            <div className="py-5 flex flex-col items-center text-center gap-4">
              <div className="max-w-xl space-y-1.5">
                <h3 className="text-base font-bold text-slate-100">
                  Conversar com {ASSISTANT_NAME}: estudo pós-sessão de MTT
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Uso exclusivo para estudo e revisão pós-sessão (nunca durante mãos ativas).
                  O {ASSISTANT_NAME} apresenta primeiro a conclusão rápida e os fatores que
                  importam, diferencia <strong>cálculos matemáticos verificados</strong>,{" "}
                  <strong>referências GTO verificadas</strong>,{" "}
                  <strong>charts importados sem EV</strong> e{" "}
                  <strong>interpretações didáticas da IA</strong>, e mantém o aprofundamento
                  recolhido para evitar paredes de texto. Você também pode{" "}
                  <strong className="text-slate-100">
                    colar (Ctrl+V) ou anexar um print
                  </strong>{" "}
                  de mão ou tabela de range.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => focusInputWith(q)}
                    className="text-left p-3 rounded-xl bg-[#05070B] hover:bg-[#101829] border border-[#1E293B] hover:border-[#3B82F6]/60 text-xs text-slate-300 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            visibleMessages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                {m.role === "user" ? (
                  <div className="max-w-[85%] sm:max-w-[68ch] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-[#2563EB]/20 border border-[#3B82F6]/50 text-slate-100">
                    {m.imagePreviewUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={m.imagePreviewUrl}
                        alt="Print anexado"
                        className="max-h-60 rounded-lg border border-slate-700 mb-2 object-contain"
                      />
                    )}
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  </div>
                ) : m.error ? (
                  <div className="w-full max-w-[68ch] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[#2B0B11] border border-[#DC2626]/60 text-red-200 space-y-1.5">
                    <div className="text-[0.6875rem] font-mono text-red-300/90">
                      {formatProviderModel(m.provider ?? provider, m.model ?? model)}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  </div>
                ) : (
                  <div className="w-full max-w-[72ch] rounded-2xl bg-[#05070B] border border-[#1E293B] p-4 shadow-lg">
                    <AssistantResponseCard
                      text={m.text}
                      streaming={m.streaming}
                      provider={m.provider ?? provider}
                      model={m.model ?? model}
                      questionText={m.questionText}
                      evidence={m.evidence}
                      sourcesUsed={m.sourcesUsed}
                      relatedVideos={m.relatedVideos}
                      onRepeatSpot={
                        m.evidence?.spotId && onLaunchSpotDrill
                          ? () => onLaunchSpotDrill(m.evidence!.spotId!)
                          : undefined
                      }
                      onCompareAnotherAction={(suggested) => focusInputWith(suggested)}
                      onTrainSimilarHands={
                        m.evidence?.spotId && onLaunchSpotDrill
                          ? () => onLaunchSpotDrill(m.evidence!.spotId!)
                          : () =>
                              focusInputWith(
                                m.evidence
                                  ? `Quais mãos semelhantes a ${m.evidence.handClass} devo treinar em ${m.evidence.spotName}?`
                                  : "Quais mãos semelhantes devo treinar neste spot?",
                              )
                      }
                      onContinueConversation={() => focusInputWith()}
                      onNewQuestion={handleResetChat}
                    />
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 text-xs text-[#60A5FA] px-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {ASSISTANT_NAME} consultando ({formatProviderModel(provider, model)})…
              </span>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold"
              >
                Cancelar geração
              </button>
            </div>
          )}
        </div>

        {/* Mão preparada para análise pós-sessão + Input + Upload de Imagem */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/70 space-y-2">
          {stagedEvidence && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[0.6875rem] text-sky-300 font-semibold px-1">
                <span>
                  Mão vinculada para análise pós-sessão (enviada somente ao clicar em Enviar):
                </span>
                <button
                  type="button"
                  onClick={() => setStagedEvidence(null)}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                  Desvincular mão
                </button>
              </div>
              <SpotIdentificationBar evidence={stagedEvidence} />
            </div>
          )}

          {imagePreviewUrl && (
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Prévia do print"
                className="h-14 w-20 object-cover rounded-lg border border-slate-700"
              />
              <div className="flex-1 text-xs text-slate-300">
                Imagem anexada ({imageMimeType}). Será enviada junto com sua pergunta a{" "}
                {PROVIDER_NAMES[provider]} somente ao clicar em Enviar.
              </div>
              <button
                type="button"
                onClick={clearImage}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Remover imagem"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadImageFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!supportsImages || loading}
              aria-label="Anexar imagem para revisão pós-sessão"
              title={
                supportsImages
                  ? "Anexar imagem para revisão pós-sessão (até 2,5 MiB)"
                  : "Modelo sem suporte a imagens"
              }
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition shrink-0 disabled:opacity-40"
            >
              <ImagePlus className="w-4 h-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              aria-label={`Pergunta para o ${ASSISTANT_NAME}`}
              maxLength={8000}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder={`Perguntar ao ${ASSISTANT_NAME} sobre uma decisão ou mão encerrada…`}
              className="min-w-0 flex-1 bg-[#05070B] border border-[#26334A] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none focus:border-[#3B82F6]"
            />

            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={!canChat || loading || (!input.trim() && !imageBase64)}
              className="px-2 sm:px-4 py-2.5 rounded-xl bg-blue-700 hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-sm flex items-center gap-1.5 transition shrink-0"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
          {!supportsImages && (
            <p className="text-xs text-slate-400">
              O modelo selecionado aceita somente texto ou ainda não teve a capacidade de
              imagens confirmada.
            </p>
          )}
          {attachmentError && (
            <p role="alert" className="text-xs text-red-200">
              {attachmentError}
            </p>
          )}
        </div>
      </div>

      {/* Sidebar: Catálogo das Aulas em Vídeo (recolhível via details) */}
      <details
        open
        className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-col gap-3 lg:max-h-[82vh] group"
      >
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-[#60A5FA]" />
            <h3 className="text-sm font-bold text-slate-100">
              Biblioteca de Aulas ({videos.length})
            </h3>
          </div>
          <span className="text-[0.6875rem] px-2 py-0.5 rounded bg-[#141D2F] text-sky-200 font-semibold group-open:hidden">
            Abrir
          </span>
          <span className="text-[0.6875rem] px-2 py-0.5 rounded bg-[#141D2F] text-slate-400 font-semibold hidden group-open:inline">
            Recolher
          </span>
        </summary>

        <div className="flex flex-col gap-3 mt-2 overflow-hidden">
          <input
            type="text"
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            placeholder="Filtrar vídeo por tema ou pasta..."
            className="w-full bg-[#05070B] border border-[#1E293B] focus:border-[#3B82F6] outline-none rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
          />

          <div className="max-h-[380px] lg:max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {filteredVideos.map((v) => (
              <div
                key={v.relativePath}
                className="p-2.5 rounded-xl bg-[#05070B] border border-[#1E293B] flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-200 leading-snug">
                    {v.title}
                  </span>
                  <span className="text-[0.6875rem] font-mono text-slate-400 shrink-0">
                    {v.sizeMb} MB
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.6875rem] text-[#60A5FA] truncate">
                    {v.category}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      focusInputWith(
                        `Resuma os principais conceitos e recomendações práticas sobre "${v.title}" (${v.category}).`,
                      )
                    }
                    className="text-[0.6875rem] text-slate-400 hover:text-[#60A5FA] underline shrink-0"
                  >
                    Perguntar ao {ASSISTANT_NAME}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
