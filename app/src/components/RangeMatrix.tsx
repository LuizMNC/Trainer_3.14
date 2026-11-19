"use client";

import React, { useMemo, useState } from "react";
import { Download, Lock } from "lucide-react";
import {
  cellToHand,
  countAvailableCombosByClass,
  formatActionLabelPtBr,
  formatActionFrequencyPtBr,
  getActionDistributionVisual,
  getActionVisualStyle,
  getHandCombos,
  isMixedHand,
  RangeSpot,
} from "@/lib/poker";

interface RangeMatrixProps {
  spot: RangeSpot;
  activeHand?: string | null;
  compact?: boolean;
  deadCards?: string[];
  unsolved?: boolean;
  evUnit?: string | null;
  matrixEv?: Record<string, Record<string, number>> | null;
  comboBreakdown?: Record<string, Record<string, Record<string, number>>> | null;
  onSelectHand?: (hand: string) => void;
  onExportCsv?: () => void;
  onExportJson?: () => void;
}

export function RangeMatrix({
  spot,
  activeHand,
  compact = false,
  deadCards = [],
  unsolved = false,
  evUnit = null,
  matrixEv = null,
  comboBreakdown = null,
  onSelectHand,
  onExportCsv,
  onExportJson,
}: RangeMatrixProps) {
  const [hoveredHand, setHoveredHand] = useState<string | null>(null);
  const [selectedTouchHand, setSelectedTouchHand] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "mixed" | "active">("all");

  const comboStats = useMemo(() => {
    try {
      return countAvailableCombosByClass(deadCards);
    } catch {
      return countAvailableCombosByClass([]);
    }
  }, [deadCards]);

  const isPartialPostflopRange = useMemo(() => {
    const count = Object.keys(spot.matrix ?? {}).length;
    return count > 0 && count < 169;
  }, [spot.matrix]);

  const inspectedHand = hoveredHand || selectedTouchHand || activeHand || "AA";
  const inspectedInMatrix = Boolean(spot.matrix[inspectedHand]);
  const inspectedDist = spot.matrix[inspectedHand] || {};
  const inspectedEv = matrixEv?.[inspectedHand] ?? null;
  const inspectedCombos = comboBreakdown?.[inspectedHand] ?? null;
  const baseCombos = getHandCombos(inspectedHand);
  const availCombos = comboStats.byClass[inspectedHand] ?? baseCombos;

  if (unsolved) {
    return (
      <div className="rounded-xl bg-slate-950/90 border border-amber-500/40 p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
        <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-300">
          <Lock className="w-5 h-5" />
        </div>
        <div>
          <span className="inline-block px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono text-[0.6875rem] font-bold mb-1.5">
            UNSOLVED
          </span>
          <h4 className="text-sm font-bold text-slate-100">
            Sem solução verificada para este spot
          </h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
            Para evitar frequências ou EVs fictícios, a matriz 13&times;13 permanece
            bloqueada até que uma solução válida seja importada.
          </p>
        </div>
        {deadCards.length > 0 && (
          <div className="text-[0.6875rem] font-mono text-slate-300 bg-[#090D16] border border-[#1E293B] rounded-lg px-3 py-1.5">
            Remoção de cartas ativa ({deadCards.join(" ")}): {comboStats.totalCombos} / 1326 combos disponíveis
          </div>
        )}
      </div>
    );
  }

  const renderCells = () => {
    const nodes: React.ReactNode[] = [];
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const hand = cellToHand(r, c);
        const hasEntry = Boolean(spot.matrix[hand]);
        const isOutOfRange = isPartialPostflopRange && !hasEntry;
        const dist = spot.matrix[hand] || {};
        const isActive = activeHand === hand;
        const isInspected = hoveredHand === hand;
        const avail = comboStats.byClass[hand] ?? getHandCombos(hand);

        const visual = getActionDistributionVisual(dist, spot.actions.map((act) => act.name));
        const description = isOutOfRange
          ? `${hand} (${avail}/${getHandCombos(hand)} combos): Fora do range pré-flop neste nó`
          : `${hand} (${avail}/${getHandCombos(hand)} combos): ${Object.entries(dist)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${formatActionLabelPtBr(k)} ${formatActionFrequencyPtBr(v)}`)
              .join(" | ")}${visual.incomplete ? ` | Distribuição incompleta ou inválida: total ${formatActionFrequencyPtBr(visual.total)}; sem normalização` : ""}`;

        const foldFreq = dist["Fold"] ?? 0;
        const dimmed =
          avail === 0 ||
          isOutOfRange ||
          (filterMode === "mixed" && !isMixedHand(dist)) ||
          (filterMode === "active" && foldFreq >= 0.98);
        const isTapped = selectedTouchHand === hand;

        nodes.push(
          <button
            key={hand}
            type="button"
            onMouseEnter={() => setHoveredHand(hand)}
            onMouseLeave={() => setHoveredHand(null)}
            onFocus={() => setHoveredHand(hand)}
            onClick={() => {
              setSelectedTouchHand((prev) => (prev === hand ? null : hand));
              onSelectHand?.(hand);
            }}
            style={{ background: isOutOfRange ? "#0f172a" : visual.background, color: visual.text }}
            aria-label={description}
            className={`relative flex items-center justify-center select-none transition-all duration-100 rounded-[3px] border touch-manipulation ${
              compact
                ? "min-h-[24px] sm:h-6 text-[0.65rem] sm:text-[0.6875rem]"
                : "min-h-[27px] sm:h-9 text-[0.6875rem] sm:text-xs"
            } font-bold font-mono tabular-nums shadow-inner ${
              isActive
                ? "ring-2 ring-amber-300 border-amber-200 z-10 scale-105 shadow-lg shadow-amber-500/30"
                : isTapped || isInspected
                  ? "ring-2 ring-white border-white z-10"
                  : isOutOfRange
                    ? "border-slate-800/70 border-dashed"
                    : "border-black/45 hover:border-white/75"
            } ${dimmed ? (isOutOfRange ? "opacity-35" : "opacity-20") : "opacity-100"}`}
            title={description}
          >
            <span className="tracking-tight leading-none rounded-sm px-0.5" style={{ backgroundColor: visual.labelBackground }}>
              {hand}
            </span>
          </button>,
        );
      }
    }
    return nodes;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho com Legenda de Ações WCAG AA, Exportação e Filtro */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {spot.actions.map((act) => {
            const visual = getActionVisualStyle(act.name);
            return (
              <div
                key={act.name}
                className="flex items-center gap-1.5 rounded-md bg-[#090D16] border border-[#26334A] px-2.5 py-1 text-xs"
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-sm text-[0.6875rem] font-mono font-bold border border-white/25"
                  style={{ backgroundColor: visual.bg, color: visual.text }}
                  aria-hidden="true"
                >
                  {visual.shortGlyph}
                </span>
                <span className="font-semibold text-[#F8FAFC]">
                  {formatActionLabelPtBr(act.name)}
                </span>
                <span className="text-[#CBD5E1] font-mono tabular-nums">{act.pct}%</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(onExportCsv || onExportJson) && (
            <div className="flex items-center gap-1">
              {onExportCsv && (
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="flex items-center gap-1 rounded-md bg-[#090D16] border border-[#26334A] hover:border-[#3B82F6] px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-200"
                  title="Exportar matriz 169 em CSV com unidades documentadas"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
              )}
              {onExportJson && (
                <button
                  type="button"
                  onClick={onExportJson}
                  className="flex items-center gap-1 rounded-md bg-[#090D16] border border-[#26334A] hover:border-[#3B82F6] px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-200"
                  title="Exportar spot completo em JSON canônico"
                >
                  <Download className="w-3 h-3" /> JSON
                </button>
              )}
            </div>
          )}

          <div className="flex items-center rounded-lg bg-[#05070B] p-0.5 border border-[#1E293B] text-[0.6875rem]">
            {(
              [
                ["all", "Tudo"],
                ["active", "Jogáveis"],
                ["mixed", "Mistas"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilterMode(id)}
                className={`px-2 py-1 rounded-md transition ${
                  filterMode === id
                    ? "bg-[#2563EB] text-white font-semibold"
                    : "text-[#94A3B8] hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grade 13x13 */}
      <div
        className="grid grid-cols-13 gap-[2px] bg-[#05070B] p-1.5 rounded-xl border border-[#1E293B] shadow-xl overflow-x-auto"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {renderCells()}
      </div>

      {/* Detalhe da Mão Inspecionada + Remoção de Cartas (fixo p/ toque ou mouse) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#090D16] border border-[#26334A] px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-[#131B2C] font-mono font-bold text-amber-300 text-sm">
            {inspectedHand}
          </span>
          <span className="text-[#94A3B8] font-mono tabular-nums">
            {deadCards.length > 0
              ? `${availCombos}/${baseCombos} combos (remoção de cartas)`
              : `${baseCombos} combos`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!inspectedInMatrix && isPartialPostflopRange ? (
            <span className="text-[#94A3B8] italic">
              Fora do range pré-flop (Fold antes deste nó)
            </span>
          ) : (
            Object.entries(inspectedDist)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([action, prob]) => {
                const visual = getActionVisualStyle(action);
                const evVal = inspectedEv?.[action];
                return (
                  <span key={action} className="flex items-center gap-1.5 font-mono tabular-nums">
                    <span
                      className="h-2.5 w-2.5 rounded-sm border border-white/25"
                      style={{ backgroundColor: visual.bg }}
                    />
                    <span className="text-[#F8FAFC] font-semibold">
                      {formatActionLabelPtBr(action)}:
                    </span>
                    <span className="text-white">{formatActionFrequencyPtBr(prob)}</span>
                    {evVal !== undefined && evUnit && (
                      <span className="text-sky-300/95 text-[0.6875rem]">
                        ({evVal >= 0 ? "+" : ""}
                        {evVal.toFixed(2)} {evUnit})
                      </span>
                    )}
                  </span>
                );
              })
          )}
        </div>
      </div>

      {inspectedCombos && Object.keys(inspectedCombos).length > 0 && (
        <div className="rounded-lg bg-[#05070B] border border-[#1E293B] px-3 py-2 text-[0.6875rem] font-mono text-slate-300 space-y-1">
          <div className="text-[#94A3B8] uppercase tracking-wider font-semibold">
            Frequências exatas por combo ({inspectedHand})
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(inspectedCombos)
              .slice(0, 12)
              .map(([combo, dist]) => (
                <span
                  key={combo}
                  className="px-2 py-0.5 rounded bg-[#090D16] border border-[#1E293B] text-slate-200"
                >
                  <strong className="text-amber-300">{combo}</strong>:{" "}
                  {Object.entries(dist)
                    .filter(([, p]) => p > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([a, p]) => `${formatActionLabelPtBr(a)} ${formatActionFrequencyPtBr(p)}`)
                    .join(" / ")}
                </span>
              ))}
          </div>
        </div>
      )}

      {deadCards.length > 0 && (
        <div className="text-[0.6875rem] text-slate-400 font-mono flex items-center justify-between px-1">
          <span>Bloqueadores ativos: {deadCards.join(" ")}</span>
          <span>{comboStats.totalCombos} / 1326 combos disponíveis</span>
        </div>
      )}
    </div>
  );
}
