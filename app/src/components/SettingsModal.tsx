"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  apiKey: string;
  model: string;
  hasEnvKey: boolean;
  onSave: (apiKey: string, model: string) => void;
  onClose: () => void;
}

const MODEL_OPTIONS = [
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash (Recomendado)",
    desc: "Equilíbrio ideal entre velocidade, custo e análise multimodal.",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    desc: "Respostas instantâneas para feedback rápido durante o grind.",
  },
  {
    id: "gemini-4-argon",
    label: "Gemini 4 Argon",
    desc: "Raciocínio estratégico mais profundo para spots complexos.",
  },
  {
    id: "gemini-4-carbon",
    label: "Gemini 4 Carbon",
    desc: "Modelo avançado para revisão detalhada de livros e mãos.",
  },
];

export function SettingsModal({
  isOpen,
  apiKey,
  model,
  hasEnvKey,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      previousFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      if (!dialog.open) dialog.showModal();
      queueMicrotask(() => closeButtonRef.current?.focus());
    } else if (dialog.open) {
      dialog.close();
      const prev = previousFocusRef.current;
      requestAnimationFrame(() => prev?.focus());
    }
    return () => {
      if (dialog.open) dialog.close();
      const prev = previousFocusRef.current;
      requestAnimationFrame(() => prev?.focus());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Poker-Coach": "local-v1",
        },
        body: JSON.stringify({
          prompt:
            "Responda apenas com: Conexão com AI Poker Coach OK! (1 linha).",
          model: draftModel,
          apiKey: draftKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setTestResult({
          ok: false,
          message: data.error ?? "Falha ao autenticar no Google AI Studio.",
        });
      } else {
        setTestResult({
          ok: true,
          message: `Conectado com sucesso (${data.model})!`,
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: "Erro de conexão com o servidor local.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(100%-2rem,32rem)] max-h-[88dvh] rounded-2xl bg-[#090D16] border border-[#26334A] p-0 text-[#F8FAFC] shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm overflow-hidden"
    >
      <div className="flex flex-col max-h-[88dvh]">
        <div className="px-5 py-4 border-b border-[#1E293B] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#60A5FA]" />
            <h2 id="settings-modal-title" className="text-sm font-bold text-[#F8FAFC]">
              Configurações — Google AI Studio (Gemini API)
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar configurações"
            onClick={onClose}
            className="p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#141D2F]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {hasEnvKey && (
            <div className="rounded-xl bg-[#0F1B33] border border-[#2563EB]/50 p-3 text-xs text-sky-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#60A5FA]" />
              <span>
                Chave <code>GEMINI_API_KEY</code> detectada automaticamente via{" "}
                <code>.env.local</code>. O campo abaixo é opcional para
                sobrescrever na sessão.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="settings-gemini-key" className="text-xs font-semibold text-slate-200 block">
              API Key do Google AI Studio
            </label>
            <div className="flex items-center gap-2">
              <input
                id="settings-gemini-key"
                type={showKey ? "text" : "password"}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="AIzaSy..."
                className="flex-1 bg-[#05070B] border border-[#26334A] rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-[#7E8EA4] focus:outline-none focus:border-[#3B82F6]"
              />
              <button
                type="button"
                aria-label={showKey ? "Ocultar chave API" : "Mostrar chave API"}
                onClick={() => setShowKey((s) => !s)}
                className="p-2 rounded-xl bg-[#141D2F] hover:bg-[#1E293B] text-slate-200"
                title={showKey ? "Ocultar" : "Mostrar"}
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[0.6875rem] text-[#94A3B8]">
              Salva apenas no seu navegador (<code>localStorage</code>) ou no
              arquivo local{" "}
              <code className="text-slate-300">app/.env.local</code>. Obtenha em{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[#60A5FA] underline"
              >
                aistudio.google.com/apikey
              </a>
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-200 block">
              Modelo Gemini
            </span>
            <div className="space-y-2">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraftModel(opt.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition ${
                    draftModel === opt.id
                      ? "bg-[#0F1B33] border-[#3B82F6] text-white"
                      : "bg-[#05070B] border-[#1E293B] text-slate-300 hover:border-[#334155]"
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[0.6875rem] text-[#94A3B8]">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {testResult && (
            <div
              className={`rounded-xl p-3 text-xs border ${
                testResult.ok
                  ? "bg-[#0F1B33] border-[#2563EB]/60 text-sky-200"
                  : "bg-[#2B0B11] border-[#DC2626]/60 text-red-200"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[#1E293B] bg-[#05070B]/90 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-2 rounded-xl bg-[#141D2F] hover:bg-[#1E293B] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Testar Conexão
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-[#CBD5E1] hover:text-white text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draftKey.trim(), draftModel);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] hover:brightness-110 text-white text-xs font-bold transition shadow"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
