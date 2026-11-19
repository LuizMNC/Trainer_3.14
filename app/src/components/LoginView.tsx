"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

interface LoginViewProps {
  configured: boolean;
  nextPath: string;
}

export function LoginView({ configured, nextPath }: LoginViewProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || submitting) return;

    if (!password) {
      setErrorMsg("Digite a senha de acesso para continuar.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          remember,
          next: nextPath,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; next?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setErrorMsg(
          payload?.error ?? "Não foi possível validar a senha. Tente novamente.",
        );
        setSubmitting(false);
        return;
      }

      const destination = payload.next || nextPath || "/";
      window.location.assign(new URL(destination, window.location.origin).toString());
    } catch {
      setErrorMsg("Falha de conexão ao validar o acesso. Tente novamente.");
      setSubmitting(false);
    }
  }

  return (
    <div className="treiner-theme studio-login relative min-h-screen flex flex-col bg-[#05070B] text-[#F8FAFC] overflow-x-hidden">
      <div className="h-[3px] w-full bg-gradient-to-r from-[#DC2626] via-[#2563EB] to-[#DC2626]" />

      {/* Brilho sutil do tema vermelho e azul */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-[20rem] rounded-full bg-[#2563EB]/12 blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 w-[28rem] h-[18rem] rounded-full bg-[#DC2626]/10 blur-3xl" />
      </div>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10 sm:px-6">
        <section
          aria-labelledby="login-heading"
          className="w-full max-w-md rounded-2xl border border-[#1E293B] bg-[#090D16]/95 p-6 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur-md"
        >
          <div className="flex items-center gap-3.5 mb-6">
            <div
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#DC2626] via-[#1D4ED8] to-[#2563EB] p-[1.5px] shadow-[0_0_20px_rgba(37,99,235,0.45)] shrink-0"
              aria-hidden="true"
            >
              <div className="w-full h-full rounded-[14px] bg-[#05070B] flex items-center justify-center">
                <span className="text-[1.65rem] leading-none font-black font-serif text-[#F8FAFC] select-none">
                  π
                </span>
              </div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  id="login-heading"
                  className="text-xl font-extrabold tracking-tight text-[#F8FAFC]"
                >
                  TreinerLM
                </h1>
                <span className="text-[0.6875rem] px-2 py-0.5 rounded bg-[#2563EB]/20 border border-[#3B82F6]/50 text-[#93C5FD] font-bold">
                  Acesso Privado
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">
                Plataforma de estudos GTO exclusiva para torneios MTT
              </p>
            </div>
          </div>

          {!configured ? (
            <div
              role="alert"
              className="rounded-xl border border-[#F59E0B]/45 bg-[#F59E0B]/10 p-4 text-xs text-[#FDE68A] space-y-2.5"
            >
              <div className="flex items-center gap-2 font-bold text-[#FBBF24]">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Senha de acesso ainda não configurada na Vercel</span>
              </div>
              <p className="leading-relaxed text-[#E2E8F0]">
                Por segurança, o acesso permanece bloqueado até você definir a
                variável de ambiente{" "}
                <code className="px-1.5 py-0.5 rounded bg-[#05070B] border border-[#26334A] text-[#93C5FD]">
                  TREINERLM_ACCESS_PASSWORD
                </code>{" "}
                no projeto da Vercel.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[#CBD5E1]">
                <li>
                  Acesse o painel do projeto na Vercel →{" "}
                  <strong>Settings → Environment Variables</strong>.
                </li>
                <li>
                  Crie a variável{" "}
                  <code className="px-1 rounded bg-[#05070B]">
                    TREINERLM_ACCESS_PASSWORD
                  </code>{" "}
                  com a senha desejada.
                </li>
                <li>Faça um novo deploy (Redeploy) em Production.</li>
              </ol>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="treinerlm-password"
                  className="block text-xs font-semibold text-[#CBD5E1] mb-1.5"
                >
                  Senha de acesso
                </label>
                <div className="relative">
                  <input
                    id="treinerlm-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    autoFocus
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="Digite a senha compartilhada"
                    disabled={submitting}
                    className="w-full min-h-11 rounded-xl border border-[#26334A] bg-[#05070B] pl-3.5 pr-11 py-2.5 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#3B82F6] focus:ring-2 focus:ring-[#2563EB]/30 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Ocultar senha" : "Mostrar senha"
                    }
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#131B2C] transition"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={submitting}
                  className="w-4 h-4 rounded border-[#26334A] bg-[#05070B] accent-[#2563EB]"
                />
                <span>Manter acesso conectado neste dispositivo (30 dias)</span>
              </label>

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-[#EF4444]/45 bg-[#DC2626]/15 px-3.5 py-2.5 text-xs font-medium text-[#FCA5A5]"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-11 rounded-xl bg-gradient-to-r from-[#DC2626] to-[#2563EB] border border-[#60A5FA]/70 px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_22px_rgba(37,99,235,0.35)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#60A5FA] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Validando acesso...</span>
                  </>
                ) : (
                  <>
                    <LockKeyhole className="w-4 h-4" />
                    <span>Entrar no TreinerLM</span>
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[#1E293B] flex items-center justify-between gap-2 text-[0.7rem] text-[#94A3B8]">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
              <span>Estudo offline MTT</span>
            </span>
            <span>Desenvolvido por Luiz Miguel N. C.</span>
          </div>
        </section>
      </main>
    </div>
  );
}
