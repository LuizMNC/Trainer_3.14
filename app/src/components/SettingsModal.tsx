"use client";

import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import type { AiModel, ProviderId } from "@/lib/ai/types";
import { coachRequest } from "@/lib/ai/client";
import { ASSISTANT_NAME } from "@/lib/ai/assistantIdentity";
import { emptyProviderConfig, PROVIDER_NAMES, type ProviderConfig, type ProviderConfigs } from "@/lib/ai/clientStorage";

interface SettingsModalProps {
  isOpen: boolean;
  provider: ProviderId;
  providers: ProviderId[];
  configs: ProviderConfigs;
  onSave: (provider: ProviderId, config: ProviderConfig) => boolean;
  onRemove: (provider: ProviderId) => boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, provider, providers, configs, onSave, onRemove, onClose }: SettingsModalProps) {
  const [selected, setSelected] = useState(provider);
  const [drafts, setDrafts] = useState<ProviderConfigs>(() => ({ ...configs }));
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const draft = drafts[selected] ?? emptyProviderConfig();
  const isLocal = selected === "ollama";
  const updateDraft = (patch: Partial<ProviderConfig>) => setDrafts((prev) => ({ ...prev, [selected]: { ...draft, ...patch } }));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    return () => { abortRef.current?.abort(); dialog?.close(); previous?.focus(); };
  }, [isOpen]);

  const queryProvider = async (action: "models" | "test") => {
    if ((!draft.apiKey.trim() && !isLocal) || busy) return;
    setBusy(true); setResult(null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      if (action === "models") {
        const data = await coachRequest<{ models: AiModel[]; notice?: string }>({ action, provider: selected, apiKey: draft.apiKey.trim() }, controller.signal);
        const models = data.models.filter((m) => m.provider === selected && m.text);
        updateDraft({ models, model: models.some((m) => m.id === draft.model) ? draft.model : "", testedModel: undefined });
        setNotice(data.notice ?? "Modelos retornados pela API com capacidade de chat. Acesso e quota são confirmados ao testar a conexão.");
        setResult({ ok: models.length > 0, message: models.length ? `${models.length} modelos de chat encontrados. Selecione um e teste a conexão.` : "A API não retornou modelos de chat utilizáveis com esta chave." });
      } else {
        await coachRequest({ action, provider: selected, apiKey: draft.apiKey.trim(), model: draft.model }, controller.signal);
        updateDraft({ testedModel: draft.model });
        setResult({ ok: true, message: `Chamada real concluída: ${PROVIDER_NAMES[selected]} / ${draft.model}. Salve para usar esta configuração.` });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        updateDraft({ testedModel: undefined });
        setResult({ ok: false, message: error instanceof Error ? error.message : "Falha de conexão com o servidor TreinerLM." });
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  if (!isOpen) return null;
  return (
    <dialog ref={dialogRef} aria-labelledby="settings-modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="m-auto w-[calc(100%-1rem)] sm:w-[min(100%-2rem,40rem)] max-h-[92dvh] rounded-2xl bg-[#090D16] border border-[#26334A] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75 overflow-hidden">
      <div className="flex flex-col max-h-[92dvh]">
        <div className="px-4 py-4 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <h2 id="settings-modal-title" className="text-sm font-bold flex items-center gap-2"><KeyRound className="w-4 h-4 shrink-0 text-sky-400" />Configurações do {ASSISTANT_NAME}</h2>
          <button type="button" aria-label="Fechar configurações" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto text-sm">
          <fieldset disabled={busy}>
            <legend className="text-xs font-semibold mb-2">Provedor de IA</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {providers.map((id) => <button key={id} type="button" aria-pressed={selected === id}
                onClick={() => { setSelected(id); setShowKey(false); setResult(null); setNotice(""); }}
                className={`px-2 py-2 rounded-xl border text-xs ${selected === id ? "border-blue-400 bg-blue-950 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{PROVIDER_NAMES[id]}</button>)}
            </div>
          </fieldset>
          <p className="text-xs text-slate-300 leading-relaxed">Cada provedor usa somente a sua própria chave. As integrações exigem teste com sua chave e modelo antes do uso. Nenhuma chave global substitui uma credencial ausente.</p>
          {isLocal ? <p className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-300">Ollama está habilitado pelo proprietário nesta instalação local. As chamadas usam o servidor local configurado, sem enviar o pedido à Vercel.</p> : <div>
            <label htmlFor="settings-api-key" className="text-xs font-semibold block mb-1.5">Chave API — {PROVIDER_NAMES[selected]}</label>
            <div className="flex gap-2">
              <input id="settings-api-key" autoComplete="off" spellCheck={false} disabled={busy} type={showKey ? "text" : "password"} value={draft.apiKey}
                onChange={(event) => { updateDraft({ apiKey: event.target.value, models: [], model: "", testedModel: undefined }); setResult(null); }}
                placeholder="Cole sua chave pessoal" className="min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono" />
              <button type="button" aria-label={showKey ? "Ocultar chave API" : "Mostrar chave API"} onClick={() => setShowKey(!showKey)} className="p-2 rounded-xl bg-slate-800">{showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
            </div>
          </div>}
          <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-3 text-xs text-amber-100 leading-relaxed">Ao testar ou enviar uma pergunta, a chave passa pelo servidor TreinerLM para acessar o provedor. Ela não é persistida no servidor. As chamadas, incluindo o teste de conexão, podem consumir quota e gerar custos na sua conta.</div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-0">
              <label htmlFor="settings-model" className="block text-xs font-semibold mb-1.5">Modelo</label>
              <select id="settings-model" value={draft.model} disabled={busy || !draft.models.length} onChange={(event) => { updateDraft({ model: event.target.value, testedModel: undefined }); setResult(null); }} className="w-full min-w-0 px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs">
                <option value="">Selecione um modelo</option>
                {draft.models.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.id}{m.images ? " · imagens" : " · texto"}</option>)}
              </select>
            </div>
            <button type="button" disabled={busy || (!isLocal && !draft.apiKey.trim())} onClick={() => queryProvider("models")} className="px-3 py-2 rounded-xl bg-slate-800 text-xs disabled:opacity-40">Consultar modelos</button>
          </div>
          {notice && <p className="text-xs text-slate-400">{notice}</p>}
          {draft.models.find((m) => m.id === draft.model)?.limitations?.map((limitation) => <p key={limitation} className="text-xs text-slate-400">{limitation}</p>)}
          <fieldset disabled={busy} className="space-y-2">
            <legend className="text-xs font-semibold mb-2">Armazenamento da chave</legend>
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="ai-storage" checked={draft.storage === "session"} onChange={() => updateDraft({ storage: "session" })} />Somente nesta sessão (padrão)</label>
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="ai-storage" checked={draft.storage === "local"} onChange={() => updateDraft({ storage: "local" })} />Lembrar neste navegador</label>
            {draft.storage === "local" && <p className="text-xs text-amber-200">A chave ficará armazenada sem criptografia no navegador. Pessoas com acesso ao perfil e scripts da página podem lê-la. Evite computadores compartilhados. Não há sincronização pelo TreinerLM.</p>}
          </fieldset>
          {result && <p role="status" className={`p-3 rounded-xl border text-xs ${result.ok ? "bg-emerald-950/30 border-emerald-700 text-emerald-100" : "bg-red-950/30 border-red-700 text-red-100"}`}>{result.message}</p>}
          {busy && <p role="status" className="text-xs text-sky-200 flex gap-2 items-center"><Loader2 className="w-4 h-4 animate-spin" />Consultando {PROVIDER_NAMES[selected]}…</p>}
        </div>
        <div className="p-3 border-t border-slate-800 flex flex-wrap items-center gap-2 shrink-0 bg-slate-950">
          <button type="button" disabled={busy || !draft.model || (!isLocal && !draft.apiKey.trim())} onClick={() => queryProvider("test")} className="px-3 py-2 text-xs rounded-xl bg-slate-800 disabled:opacity-40">Testar conexão</button>
          <button type="button" disabled={busy} onClick={() => { if (onRemove(selected)) { setDrafts((prev) => ({ ...prev, [selected]: emptyProviderConfig() })); setResult({ ok: true, message: "Chave e configuração removidas desta sessão e deste navegador." }); } else setResult({ ok: false, message: "O navegador bloqueou a remoção do armazenamento. Verifique as permissões do navegador." }); }} className="px-3 py-2 text-xs rounded-xl text-red-200 hover:bg-red-950">Remover chave</button>
          <button type="button" disabled={busy || !draft.model || (!isLocal && !draft.apiKey.trim())} onClick={() => { if (onSave(selected, { ...draft, apiKey: draft.apiKey.trim() })) onClose(); else setResult({ ok: false, message: "Não foi possível salvar. O navegador bloqueou o armazenamento; verifique suas permissões." }); }} className="sm:ml-auto px-3 py-2 text-xs rounded-xl bg-blue-700 text-white font-bold disabled:opacity-40">Salvar configuração</button>
        </div>
      </div>
    </dialog>
  );
}
