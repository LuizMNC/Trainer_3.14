"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, Columns2, Search } from "lucide-react";
import {
  adaptLegacyRangeSpotToCanonical,
  exportSpotMatrixToCsv,
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
}

export function RangeExplorerView({ spots }: RangeExplorerViewProps) {
  const stacks = useMemo(
    () => Array.from(new Set(spots.map((s) => s.stackBb))).sort((a, b) => a - b),
    [spots],
  );

  const [selectedStack, setSelectedStack] = useState<number>(
    stacks.includes(100) ? 100 : stacks[0],
  );
  const [search, setSearch] = useState("");
  const [compareMode, setCompareMode] = useState(false);

  const spotsInStack = useMemo(
    () =>
      spots.filter(
        (s) =>
          s.stackBb === selectedStack &&
          s.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [spots, selectedStack, search],
  );

  const [primarySpotId, setPrimarySpotId] = useState<string>(spots[0]?.id ?? "");
  const [secondarySpotId, setSecondarySpotId] = useState<string>(
    spots.find((s) => s.stackBb === 14)?.id ?? spots[1]?.id ?? "",
  );

  const primarySpot =
    spots.find((s) => s.id === primarySpotId) ?? spotsInStack[0] ?? spots[0];
  const secondarySpot =
    spots.find((s) => s.id === secondarySpotId) ?? spots[1] ?? spots[0];

  const primaryCanonical = useMemo(
    () => adaptLegacyRangeSpotToCanonical(primarySpot as LegacyRangeSpot),
    [primarySpot],
  );
  const secondaryCanonical = useMemo(
    () => adaptLegacyRangeSpotToCanonical(secondarySpot as LegacyRangeSpot),
    [secondarySpot],
  );

  const handleSelectStack = (st: number) => {
    setSelectedStack(st);
    const firstInStack = spots.find((s) => s.stackBb === st);
    if (firstInStack) setPrimarySpotId(firstInStack.id);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de Stacks + Modo Comparação */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 font-semibold mr-1">
            Stack Efetivo:
          </span>
          {stacks.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleSelectStack(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedStack === st
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-600"
              }`}
            >
              {st} BB {st <= 15 && st !== 14 ? "(Spin)" : ""}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setCompareMode((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
            compareMode
              ? "bg-amber-500/20 border-amber-400 text-amber-200"
              : "bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          <Columns2 className="w-3.5 h-3.5" />
          {compareMode ? "Comparador Ativo" : "Comparar 2 Spots"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Lista Lateral de Spots */}
        <div className="lg:col-span-4 rounded-2xl bg-slate-900/90 border border-slate-800 p-3 flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar spot (ex: BTN, BB vs CO, RFI)..."
              className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="max-h-[560px] overflow-y-auto space-y-1 pr-1">
            {spotsInStack.map((sp) => {
              const active = primarySpot.id === sp.id;
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => setPrimarySpotId(sp.id)}
                  className={`w-full text-left rounded-xl px-3 py-2 text-xs transition flex items-center justify-between border ${
                    active
                      ? "bg-emerald-600/20 border-emerald-500 text-white font-semibold"
                      : "bg-slate-950/60 border-transparent hover:border-slate-700 text-slate-300"
                  }`}
                >
                  <span className="truncate">{sp.name}</span>
                  <span className="text-[0.625rem] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 ml-2">
                    {sp.spotType.replace("_", " ")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Visualização da Matriz (Simples ou Comparação) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div
            className={`grid gap-4 ${
              compareMode ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"
            }`}
          >
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {primarySpot.name}
                  </h3>
                  <p className="text-xs text-slate-400">{primarySpot.source}</p>
                </div>
                <span className="text-[0.625rem] px-2 py-0.5 rounded border font-bold bg-sky-500/15 border-sky-500/40 text-sky-200">
                  IMPORTED_CHART_NO_EV (Sem Tabela EV)
                </span>
              </div>
              {primaryCanonical.referenceStrategy.validationWarnings && (
                <div className="mb-3 rounded-lg bg-amber-950/40 border border-amber-600/40 px-3 py-2 text-[0.6875rem] text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    <strong>Aviso de Auditoria (Dados Legados Não Normalizados):</strong>{" "}
                    {primaryCanonical.referenceStrategy.validationWarnings.join("; ")}
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

            {compareMode && (
              <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-xl">
                <div className="mb-3">
                  <label className="block text-[0.6875rem] text-amber-300 font-semibold mb-1">
                    Spot para Comparação:
                  </label>
                  <select
                    value={secondarySpot.id}
                    onChange={(e) => setSecondarySpotId(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-white outline-none"
                  >
                    {spots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                {secondaryCanonical.referenceStrategy.validationWarnings && (
                  <div className="mb-3 rounded-lg bg-amber-950/40 border border-amber-600/40 px-3 py-2 text-[0.6875rem] text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      <strong>Aviso de Auditoria:</strong>{" "}
                      {secondaryCanonical.referenceStrategy.validationWarnings.join("; ")}
                    </span>
                  </div>
                )}
                <RangeMatrix spot={secondarySpot} compact />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
