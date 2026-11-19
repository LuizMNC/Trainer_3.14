"use client";

import React from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk .* failed/i.test(error?.message ?? "");

  return (
    <div className="min-h-screen bg-[#05070B] text-[#F8FAFC] flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-[#EF4444]/60 bg-[#090D16] p-6 space-y-4">
        <h1 className="text-lg font-extrabold text-[#FCA5A5]">
          {isChunk
            ? "Atualização detectada na interface local do TreinerLM"
            : "Ocorreu uma falha ao exibir esta tela"}
        </h1>
        <p className="text-sm text-[#CBD5E1]">
          {isChunk
            ? "Uma versão mais recente dos arquivos foi gerada enquanto a aba estava aberta. Recarregue a página para sincronizar."
            : "Os dados locais no SQLite não foram alterados."}
        </p>
        {error?.message && (
          <p className="text-xs font-mono text-[#94A3B8] break-all rounded-lg border border-[#1E293B] bg-[#05070B] p-3">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => (typeof window !== "undefined" ? window.location.reload() : reset())}
            className="rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] px-4 py-2 text-xs font-bold text-white"
          >
            Recarregar TreinerLM
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-[#1E293B] bg-[#05070B] hover:border-[#60A5FA] px-4 py-2 text-xs font-bold text-[#F8FAFC]"
          >
            Tentar recuperar tela
          </button>
        </div>
      </div>
    </div>
  );
}
