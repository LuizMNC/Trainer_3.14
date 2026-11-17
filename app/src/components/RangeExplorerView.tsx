"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Columns2, Layers, Search } from "lucide-react";
import {
  adaptLegacyRangeSpotToCanonical,
  exportSpotMatrixToCsv,
  filterConfirmedMttLegacySpots,
  formatStrategySourceBadgePtBr,
  MTT_MODALITY_LABELS,
  type MttModality,
  type CanonicalSpot,
  type LegacyRangeSpot,
  RangeSpot,
} from "@/lib/poker";
import { RangeMatrix } from "./RangeMatrix";

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface RangeExplorerViewProps {
  spots: RangeSpot[];
  verifiedCanonicalSpots?: CanonicalSpot[];
}

export function RangeExplorerView({
  spots,
  verifiedCanonicalSpots = [],
}: RangeExplorerViewProps) {
  const mttSpots = useMemo(() => filterConfirmedMttLegacySpots(spots), [spots]);
  const [modality, setModality] = useState<MttModality>("MTT_CHEV");

  const stacks = useMemo(
    () =>
      Array.from(new Set(mttSpots.map((s) => s.stackBb))).sort((a, b) => a - b),
    [mttSpots],
  );

  const initialStack = stacks.includes(100) ? 100 : (stacks[0] ?? 100);
  const [selectedStack, setSelectedStack] = useState<number>(initialStack);
  const [showMobileSpotPicker, setShowMobileSpotPicker] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  const spotsInStack = useMemo(
    () =>
      mttSpots.filter(
        (s) =>
          s.stackBb === selectedStack &&
          s.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [mttSpots, selectedStack, search],
  );

  const [primarySpotId, setPrimarySpotId] = useState<string>(
    () =>
      mttSpots.find((s) => s.stackBb === initialStack)?.id ??
      mttSpots[0]?.id ??
      "",
  );
  const [secondarySpotId, setSecondarySpotId] = useState<string>(
    () => mttSpots.find((s) => s.stackBb === 14)?.id ?? mttSpots[1]?.id ?? "",
  );

  const primarySpot =
    spotsInStack.find((s) => s.id === primarySpotId) ??
    mttSpots.find(
      (s) => s.id === primarySpotId && s.stackBb === selectedStack,
    ) ??
    spotsInStack[0] ??
    mttSpots.find((s) => s.stackBb === selectedStack) ??
    mttSpots[0];

  const secondarySpot =
    mttSpots.find((s) => s.id === secondarySpotId) ?? mttSpots[1] ?? mttSpots[0];

  const primaryCanonical = useMemo(
    () =>
      primarySpot
        ? adaptLegacyRangeSpotToCanonical(primarySpot as LegacyRangeSpot)
        : null,
    [primarySpot],
  );
  const secondaryCanonical = useMemo(
    () =>
      secondarySpot
        ? adaptLegacyRangeSpotToCanonical(secondarySpot as LegacyRangeSpot)
        : null,
    [secondarySpot],
  );

  const handleSelectStack = (st: number) => {
    setSelectedStack(st);
    const firstInStack = mttSpots.find((s) => s.stackBb === st);
    if (firstInStack) setPrimarySpotId(firstInStack.id);
  };

  const solvedMttPostflopCount = useMemo(
    () =>
      verifiedCanonicalSpots.filter(
        (s) =>
          s.referenceStrategy.status === "VERIFIED" &&
          s.format === "MTT" &&
          s.street !== "PREFLOP",
      ).length,
    [verifiedCanonicalSpots],
  );

  if (!primarySpot || !primaryCanonical) {
    return (
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-6 text-center text-sm text-[#CBD5E1]">
        Nenhum spot MTT confirmado disponível no catálogo atual.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho Estratégico MTT-Only + Seletor de Modalidade */}
      <div className="rounded-2xl bg-[#090D16] border border-[#26334A] p-3.5 sm:p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[0.6875rem] uppercase tracking-[0.12em] font-extrabold text-[#60A5FA] block">
              Explorador Exclusivo de Torneios MTT · 8-Max (Ante 0,125 BB)
            </span>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Exibindo {mttSpots.length} matrizes MTT pré-flop confirmadas (Spin &amp; Go e Cash Game removidos dos treinos estratégicos).
              {solvedMttPostflopCount > 0 &&
                ` + ${solvedMttPostflopCount} solução(ões) pós-flop TexasSolver disponível(is) no Modo Trainer.`}
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Modalidade MTT"
          >
            {(["MTT_CHEV", "MTT_ICM", "MTT_PKO"] as const).map((mod) => {
              const active = modality === mod;
              const available = mod === "MTT_CHEV";
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModality(mod)}
                  className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                    active
                      ? "bg-[#2563EB]/25 border-[#3B82F6] text-white"
                      : available
                        ? "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:border-[#3B82F6]/60"
                        : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:border-[#F59E0B]/50"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>{MTT_MODALITY_LABELS[mod]}</span>
                  {!available && (
                    <span className="text-[0.6875rem] px-1.5 py-0.2 rounded bg-amber-950/70 border border-amber-500/40 text-amber-200">
                      Sem solver
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {modality !== "MTT_CHEV" ? (
          <div className="rounded-xl bg-[#1A1409] border border-amber-500/50 p-3.5 text-xs text-amber-100 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                {modality === "MTT_ICM"
                  ? "Nenhuma tabela pré-flop com solução de ICM ($EV) carregada neste acervo."
                  : "Nenhuma tabela pré-flop com solução de PKO / Bounty progressivo carregada neste acervo."}
              </p>
              <p className="text-amber-200/90">
                Por integridade matemática, o TreinerLM não substitui nem adapta silenciosamente matrizes de chipEV ou Spin &amp; Go para simular {MTT_MODALITY_LABELS[modality]}. Utilize o{" "}
                <strong>Lab EV &amp; ICM</strong> para cálculos de Fator de Bolha e valor de bounty, ou selecione{" "}
                <button
                  type="button"
                  onClick={() => setModality("MTT_CHEV")}
                  className="underline font-bold text-white hover:text-sky-200"
                >
                  MTT chipEV ({mttSpots.length} spots confirmados)
                </button>
                .
              </p>
            </div>
          </div>
        ) : (
          /* Barra de Stacks + Modo Comparação */
          <div className="pt-2 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[#CBD5E1] font-semibold mr-1">
                Stack Efetivo (MTT):
              </span>
              {stacks.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleSelectStack(st)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition ${
                    selectedStack === st
                      ? "bg-gradient-to-r from-[#DC2626] to-[#2563EB] text-white shadow"
                      : "bg-[#05070B] text-[#CBD5E1] border border-[#1E293B] hover:border-[#3B82F6]/60"
                  }`}
                >
                  {st} BB
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className={`min-h-[36px] flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                compareMode
                  ? "bg-[#2563EB]/25 border-[#3B82F6] text-sky-200"
                  : "bg-[#05070B] border-[#1E293B] text-[#CBD5E1] hover:border-[#334155]"
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              {compareMode ? "Comparador Ativo" : "Comparar 2 Spots MTT"}
            </button>
          </div>
        )}
      </div>

      {modality === "MTT_CHEV" && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Lista Lateral de Spots (recolhível no mobile/tablet) */}
        <div className="lg:col-span-4 rounded-2xl bg-[#090D16] border border-[#1E293B] p-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowMobileSpotPicker((v) => !v)}
            aria-expanded={showMobileSpotPicker}
            className="lg:hidden w-full flex items-center justify-between rounded-xl bg-[#05070B] border border-[#26334A] px-3 py-2 text-xs font-bold text-[#F8FAFC]"
          >
            <span className="truncate">
              Spot ativo: {primarySpot.name} ({spotsInStack.length} opções)
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#60A5FA] shrink-0 transition-transform ${
                showMobileSpotPicker ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`${
              showMobileSpotPicker ? "flex" : "hidden lg:flex"
            } flex-col gap-3`}
          >
            <div className="relative">
              <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Filtrar spots MTT no explorador"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar spot MTT (ex: BTN, BB vs CO, RFI)..."
                className="w-full rounded-lg bg-[#05070B] border border-[#26334A] pl-9 pr-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#7E8EA4] focus:border-[#3B82F6] outline-none"
              />
            </div>

            <div className="max-h-[360px] lg:max-h-[560px] overflow-y-auto space-y-1 pr-1">
              {spotsInStack.map((sp) => {
                const active = primarySpot.id === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => {
                      setPrimarySpotId(sp.id);
                      setShowMobileSpotPicker(false);
                    }}
                    className={`w-full text-left rounded-xl px-3 py-2 text-xs transition flex items-center justify-between border ${
                      active
                        ? "bg-[#0F1B33] border-[#3B82F6] text-white font-semibold"
                        : "bg-[#05070B] border-transparent hover:border-[#334155] text-[#CBD5E1]"
                    }`}
                  >
                    <span className="truncate">{sp.name}</span>
                    <span className="text-[0.6875rem] uppercase px-1.5 py-0.5 rounded bg-[#141D2F] text-sky-200 shrink-0 ml-2">
                      {sp.spotType.replace("_", " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visualização da Matriz (Simples ou Comparação) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div
            className={`grid gap-4 ${
              compareMode ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"
            }`}
          >
            <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-base font-bold text-[#F8FAFC]">
                    {primarySpot.name}
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    Origem: {primarySpot.source} · MTT 8-Max (Ante 0,125 BB)
                  </p>
                </div>
                <span className="text-[0.6875rem] px-2.5 py-0.5 rounded border font-bold bg-sky-500/15 border-sky-500/40 text-sky-200">
                  {formatStrategySourceBadgePtBr(primaryCanonical.referenceStrategy.status)}
                </span>
              </div>
              {primaryCanonical.referenceStrategy.integrityAudit?.hasUnreliableCells && (
                <div className="mb-3 rounded-lg bg-amber-950/45 border border-amber-600/45 px-3 py-2 text-xs text-amber-100 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    <strong>Auditoria da Matriz (dados originais preservados):</strong>{" "}
                    {primaryCanonical.referenceStrategy.integrityAudit.minorExtractionLossCount > 0 &&
                      `${primaryCanonical.referenceStrategy.integrityAudit.minorExtractionLossCount} célula(s) com perda de extração entre 0,2% e 3%. `}
                    {primaryCanonical.referenceStrategy.integrityAudit.severeExtractionLossCount > 0 &&
                      `${primaryCanonical.referenceStrategy.integrityAudit.severeExtractionLossCount} célula(s) com divergência > 3%. `}
                    Exemplos:{" "}
                    {primaryCanonical.referenceStrategy.integrityAudit.flaggedCells
                      .slice(0, 4)
                      .map((c) => `${c.hand} (soma ${(c.sum * 100).toFixed(1)}%)`)
                      .join(", ")}
                    .
                  </span>
                </div>
              )}
              <RangeMatrix
                spot={primarySpot}
                compact={compareMode}
                onExportCsv={() => {
                  downloadFile(
                    `${primarySpot.id}.csv`,
                    exportSpotMatrixToCsv(primaryCanonical),
                    "text/csv;charset=utf-8",
                  );
                }}
                onExportJson={() => {
                  downloadFile(
                    `${primarySpot.id}.json`,
                    JSON.stringify(primaryCanonical, null, 2),
                    "application/json",
                  );
                }}
              />
            </div>

            {compareMode && secondarySpot && secondaryCanonical && (
              <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 shadow-xl">
                <div className="mb-3">
                  <label
                    htmlFor="explorer-compare-spot"
                    className="block text-xs text-amber-300 font-semibold mb-1.5"
                  >
                    Spot MTT para Comparação:
                  </label>
                  <select
                    id="explorer-compare-spot"
                    value={secondarySpot.id}
                    onChange={(e) => setSecondarySpotId(e.target.value)}
                    className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-xs text-[#F8FAFC] outline-none focus:border-[#3B82F6]"
                  >
                    {mttSpots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.stackBb}BB · {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {secondaryCanonical.referenceStrategy.integrityAudit?.hasUnreliableCells && (
                  <div className="mb-3 rounded-lg bg-amber-950/45 border border-amber-600/45 px-3 py-2 text-xs text-amber-100 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      <strong>Auditoria da Matriz:</strong>{" "}
                      {secondaryCanonical.referenceStrategy.integrityAudit.unreliableCellsCount}{" "}
                      célula(s) com perda de soma na extração original (
                      {secondaryCanonical.referenceStrategy.integrityAudit.flaggedCells
                        .slice(0, 3)
                        .map((c) => `${c.hand} ${(c.sum * 100).toFixed(1)}%`)
                        .join(", ")}
                      ).
                    </span>
                  </div>
                )}
                <RangeMatrix spot={secondarySpot} compact />
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
