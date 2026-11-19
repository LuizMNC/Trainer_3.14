"use client";

import React from "react";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

interface ComponentErrorBoundaryProps {
  title?: string;
  description?: string;
  onBackToLibrary?: () => void;
  resetKey?: string | number | null;
  children: React.ReactNode;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  message: string;
  isChunkError: boolean;
}

export class ComponentErrorBoundary extends React.Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "", isChunkError: false };
  }

  static getDerivedStateFromError(error: unknown): ComponentErrorBoundaryState {
    const rawMsg =
      error instanceof Error ? error.message : String(error ?? "Erro inesperado.");
    const isChunkError =
      (error instanceof Error && error.name === "ChunkLoadError") ||
      /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(
        rawMsg,
      );
    return {
      hasError: true,
      message: rawMsg,
      isChunkError,
    };
  }

  componentDidUpdate(prevProps: ComponentErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: "", isChunkError: false });
    }
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const { title, description, onBackToLibrary } = this.props;
    return (
      <section
        role="alert"
        data-testid="panel-error-boundary"
        className="rounded-2xl border border-[#EF4444]/60 bg-[#090D16] p-6 text-[#F8FAFC] space-y-4"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-[#FCA5A5] shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <h2 className="text-base font-extrabold text-[#FCA5A5]">
              {title ?? "Não foi possível reproduzir esta mão. Alguns dados do histórico estão incompletos."}
            </h2>
            <p className="text-xs text-[#CBD5E1]">
              {this.state.isChunkError
                ? "O módulo desta tela foi atualizado no servidor enquanto a página estava aberta. Recarregue a interface ou tente novamente."
                : description ??
                  "O erro foi isolado neste painel para preservar o restante do TreinerLM e seus dados salvos."}
            </p>
            {this.state.message && (
              <p className="text-[0.6875rem] font-mono text-[#94A3B8] break-all rounded-lg border border-[#1E293B] bg-[#05070B] p-2.5">
                Detalhe técnico: {this.state.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBackToLibrary && (
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: "", isChunkError: false });
                onBackToLibrary();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B82F6] bg-[#2563EB] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1D4ED8] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar à Biblioteca
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (this.state.isChunkError && typeof window !== "undefined") {
                window.location.reload();
              } else {
                this.setState({ hasError: false, message: "", isChunkError: false });
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#05070B] px-3.5 py-2 text-xs font-bold text-[#F8FAFC] hover:border-[#60A5FA] transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {this.state.isChunkError ? "Recarregar página" : "Tentar novamente"}
          </button>
        </div>
      </section>
    );
  }
}
