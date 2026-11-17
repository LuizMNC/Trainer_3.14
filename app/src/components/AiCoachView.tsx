"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Film,
  ImagePlus,
  Loader2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { VideoEntry } from "@/lib/rag";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  imagePreviewUrl?: string;
  sourcesUsed?: string[];
  relatedVideos?: VideoEntry[];
  model?: string;
  error?: boolean;
}

interface AiCoachViewProps {
  apiKey: string;
  model: string;
  hasEnvKey: boolean;
  totalChunks: number;
  videos: VideoEntry[];
  onOpenSettings: () => void;
}

const QUICK_PROMPTS = [
  "Quais os 5 erros de ICM que devo evitar na reta final de um MTT?",
  "Como muda meu range de RFI e defesa em 14BB–20BB comparado a 50BB–100BB no MTT?",
  "Quais conceitos de 3-bet polarizada vs linear se aplicam em BTN vs CO no MTT?",
  "Como defender o Big Blind no MTT 8-Max contra abertura do BTN com 30BB?",
];

export function AiCoachView({
  apiKey,
  model,
  hasEnvKey,
  totalChunks,
  videos,
  onOpenSettings,
}: AiCoachViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [previousInteractionId, setPreviousInteractionId] = useState<
    string | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [videoSearch, setVideoSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const msgSeqRef = useRef<number>(0);

  const hasAnyKey = Boolean(apiKey.trim()) || hasEnvKey;

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
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
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
    setMessages([]);
    setPreviousInteractionId(undefined);
    clearImage();
  };

  const sendMessage = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? input).trim();
    if (!textToSend && !imageBase64) return;
    if (loading) return;

    msgSeqRef.current += 1;
    const msgId = msgSeqRef.current;
    const userMsg: ChatMessage = {
      id: `u_${msgId}`,
      role: "user",
      text: textToSend || "Analise esta imagem de poker / range.",
      imagePreviewUrl: imagePreviewUrl ?? undefined,
    };

    const currentImgBase64 = imageBase64;
    const currentImgMime = imageMimeType;

    setMessages((prev) => [...prev, userMsg]);
    if (!overridePrompt) setInput("");
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
          prompt: userMsg.text,
          model,
          apiKey: apiKey || undefined,
          previousInteractionId,
          imageBase64: currentImgBase64 ?? undefined,
          imageMimeType: currentImgBase64 ? currentImgMime : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        msgSeqRef.current += 1;
        const errId = msgSeqRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: `e_${errId}`,
            role: "assistant",
            text:
              data.error ??
              "Erro ao consultar o Google AI Studio. Verifique sua chave de API.",
            error: true,
          },
        ]);
      } else {
        msgSeqRef.current += 1;
        const replyId = msgSeqRef.current;
        setPreviousInteractionId(data.interactionId || undefined);
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${replyId}`,
            role: "assistant",
            text: data.text,
            sourcesUsed: data.sourcesUsed ?? [],
            relatedVideos: data.relatedVideos ?? [],
            model: data.model,
          },
        ]);
      }
    } catch {
      msgSeqRef.current += 1;
      const netErrId = msgSeqRef.current;
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${netErrId}`,
          role: "assistant",
          text: "Falha de rede ao se comunicar com /api/coach.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Chat principal */}
      <div className="lg:col-span-8 flex flex-col rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden min-h-[620px] max-h-[82vh]">
        {/* Header do Coach */}
        <div className="px-4 py-3 border-b border-[#1E293B] flex flex-wrap items-center justify-between gap-2 bg-[#05070B]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#2563EB]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                AI Poker Coach (Gemini Interactions API)
              </h2>
              <p className="text-[0.6875rem] text-slate-400">
                Base RAG local com{" "}
                <span className="text-[#60A5FA] font-semibold">
                  {totalChunks} trechos
                </span>{" "}
                dos seus PDFs e livros · Modelo{" "}
                <span className="font-mono text-slate-300">{model}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetChat}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-[#141D2F] hover:bg-[#1E293B] text-slate-200 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Nova Conversa
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition ${
                hasAnyKey
                  ? "bg-[#0F1B33] border-[#2563EB]/60 text-sky-200 hover:bg-[#162647]"
                  : "bg-[#2B0B11] border-[#DC2626]/70 text-red-200 hover:bg-[#3A1018]"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              {hasAnyKey ? "API Conectada" : "Configurar API Key"}
            </button>
          </div>
        </div>

        {/* Área de mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasAnyKey && (
            <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-amber-200 leading-relaxed">
                <strong>Chave do Google AI Studio necessária:</strong> cole sua{" "}
                <code className="px-1 py-0.5 rounded bg-slate-900 text-amber-300">
                  GEMINI_API_KEY
                </code>{" "}
                nas Configurações (ou em{" "}
                <code className="px-1 py-0.5 rounded bg-slate-900 text-amber-300">
                  app/.env.local
                </code>
                ) para conversar com o Coach e analisar prints de mãos.
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
              >
                Informar Chave Agora
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="py-6 flex flex-col items-center text-center gap-4">
              <div className="max-w-lg space-y-1.5">
                <h3 className="text-base font-bold text-slate-100">
                  Estudo offline de MTT: GTO, ICM e pós-flop com sua base local
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Uso exclusivo para estudo e revisão pós-sessão (nunca durante mãos ativas).
                  Cada pergunta busca trechos reais indexados nos seus materiais locais (
                  <em>Dicionário do Poker</em>, <em>E-book ICM</em>,{" "}
                  <em>5 Erros em Retas Finais</em>, <em>Ranges MTT 8-Max</em> e os
                  volumes indexados de Fitzgerald, Crawford, Hissa/Caputo e Leo Bello). Você
                  também pode{" "}
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
                    onClick={() => sendMessage(q)}
                    className="text-left p-3 rounded-xl bg-[#05070B] hover:bg-[#101829] border border-[#1E293B] hover:border-[#3B82F6]/60 text-xs text-slate-300 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1.5 ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#2563EB]/20 border border-[#3B82F6]/50 text-slate-100"
                      : m.error
                        ? "bg-[#2B0B11] border border-[#DC2626]/60 text-red-200"
                        : "bg-[#05070B] border border-[#1E293B] text-slate-200"
                  }`}
                >
                  {m.imagePreviewUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.imagePreviewUrl}
                      alt="Print anexado"
                      className="max-h-60 rounded-lg border border-slate-700 mb-2 object-contain"
                    />
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>

                  {m.sourcesUsed && m.sourcesUsed.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.6875rem] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1 mr-1">
                        <BookOpen className="w-3 h-3" /> Fontes usadas:
                      </span>
                      {m.sourcesUsed.map((src) => (
                        <span
                          key={src}
                          className="text-[0.6875rem] px-2 py-0.5 rounded-md bg-[#0F1B33] border border-[#2563EB]/40 text-sky-200"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}

                  {m.relatedVideos && m.relatedVideos.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-1">
                      <span className="text-[0.6875rem] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                        <Film className="w-3 h-3" /> Vídeos relacionados na sua
                        pasta:
                      </span>
                      {m.relatedVideos.map((v) => (
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
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-[#60A5FA] px-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Consultando base de conhecimento e Gemini ({model})...
            </div>
          )}
        </div>

        {/* Input + Upload de Imagem */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/70 space-y-2">
          {imagePreviewUrl && (
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreviewUrl}
                alt="Prévia do print"
                className="h-14 w-20 object-cover rounded-lg border border-slate-700"
              />
              <div className="flex-1 text-xs text-slate-300">
                Imagem anexada ({imageMimeType}). Será enviada junto com sua
                pergunta ao Gemini Vision.
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
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadImageFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Anexar print de mão, HUD ou range (PNG/JPG)"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition shrink-0"
            >
              <ImagePlus className="w-4 h-4" />
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder="Pergunte sobre um spot GTO, cole um print de mão (Ctrl+V) ou envie a descrição de uma jogada..."
              className="flex-1 bg-[#05070B] border border-[#26334A] rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none focus:border-[#3B82F6]"
            />

            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && !imageBase64)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-sm flex items-center gap-1.5 transition shrink-0"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar: Catálogo das Aulas em Vídeo (recolhível via details) */}
      <details open className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 flex flex-col gap-3 lg:max-h-[82vh] group">
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
                      setInput(
                        `Resuma os principais conceitos e recomendações práticas sobre "${v.title}" (${v.category}).`,
                      )
                    }
                    className="text-[0.6875rem] text-slate-400 hover:text-[#60A5FA] underline shrink-0"
                  >
                    Perguntar ao Coach
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
