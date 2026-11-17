"use client";

import React, { useMemo, useState } from "react";
import { Calculator, Info, ShieldAlert } from "lucide-react";
import {
  calculateBluffBreakevenFoldEquity,
  calculateBubbleFactor,
  calculateIcm,
  calculatePolarizedRiverBluffFraction,
  calculatePotOdds,
  calculateSimplifiedMdf,
  evaluatePkoBountyModel,
  parseStrictFiniteList,
} from "@/lib/poker";

export function MathIcmLab() {
  // Pot odds / Bluff / MDF
  const [pot, setPot] = useState(10);
  const [bet, setBet] = useState(5);
  const [call, setCall] = useState(5);

  // ICM
  const [stacksInput, setStacksInput] = useState("1000, 1000, 1000, 1000");
  const [payoutsInput, setPayoutsInput] = useState("500, 300, 200, 0");
  const [icmWin, setIcmWin] = useState(360);
  const [icmLose, setIcmLose] = useState(0);
  const [icmFold, setIcmFold] = useState(250);

  // PKO
  const [pkoPot, setPkoPot] = useState(10000);
  const [pkoCall, setPkoCall] = useState(5000);
  const [pkoBounty, setPkoBounty] = useState(10);
  const [pkoStartingStack, setPkoStartingStack] = useState(10000);
  const [pkoStartingBounty, setPkoStartingBounty] = useState(10);
  const [pkoBountyFactor, setPkoBountyFactor] = useState(0.33);
  const [pkoCovers, setPkoCovers] = useState(true);

  const parseFiniteInput = (raw: string): number => {
    if (raw.trim() === "") return NaN;
    return Number(raw);
  };

  const mathResults = useMemo(() => {
    try {
      const potOdds = calculatePotOdds(pot, bet, call);
      const bluff = calculateBluffBreakevenFoldEquity(pot, bet);
      const mdf = calculateSimplifiedMdf(pot, bet);
      const riverPolar = calculatePolarizedRiverBluffFraction(pot, bet);
      return { ok: true as const, potOdds, bluff, mdf, riverPolar };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Parâmetros inválidos.",
      };
    }
  }, [pot, bet, call]);

  const icmResults = useMemo(() => {
    try {
      const stacks = parseStrictFiniteList(stacksInput, "Stacks (fichas)");
      const payouts = parseStrictFiniteList(payoutsInput, "Premiação");
      const icm = calculateIcm(stacks, payouts, "MTT");
      const bf = calculateBubbleFactor(icmWin, icmLose, icmFold);
      return { ok: true as const, icm, bf };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro ao calcular ICM.",
      };
    }
  }, [stacksInput, payoutsInput, icmWin, icmLose, icmFold]);

  const pkoResult = useMemo(() => {
    try {
      return {
        ok: true as const,
        data: evaluatePkoBountyModel({
          potWithoutBountyChips: pkoPot,
          callAmountChips: pkoCall,
          villainBountyUsd: pkoBounty,
          startingStackChips: pkoStartingStack,
          startingBountyUsd: pkoStartingBounty,
          heroCoversVillain: pkoCovers,
          bountyChipFactor: pkoBountyFactor,
        }),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro PKO.",
      };
    }
  }, [pkoPot, pkoCall, pkoBounty, pkoStartingStack, pkoStartingBounty, pkoBountyFactor, pkoCovers]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <Calculator className="w-5 h-5 text-[#60A5FA]" />
          <h2 className="text-xl font-bold text-[#F8FAFC] tracking-tight">
            Laboratório Matemático: Pot Odds, EV, ICM ($EV) e PKO
          </h2>
        </div>
        <p className="text-sm text-[#94A3B8] mt-1 leading-relaxed max-w-[70ch]">
          Todos os cálculos explicitam unidades (chipEV vs $EV) e hipóteses simplificadoras para torneios MTT. Nenhum modelo simplificado é apresentado como solução GTO completa.
        </p>
      </div>

      {/* Seção 1: Pot Odds, Bluff Fold Equity & MDF */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-4">
          <h3 className="text-base font-bold text-[#60A5FA]">
            1. Pot Odds, Fold Equity de Blefe e MDF (chipEV)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-300 font-medium block">Pote inicial (P)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={Number.isFinite(pot) ? pot : ""}
                onChange={(e) => setPot(parseFiniteInput(e.target.value))}
                className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-medium block">Aposta (B)</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={Number.isFinite(bet) ? bet : ""}
                onChange={(e) => setBet(parseFiniteInput(e.target.value))}
                className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-medium block">Call (C)</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={Number.isFinite(call) ? call : ""}
                onChange={(e) => setCall(parseFiniteInput(e.target.value))}
                className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>
          </div>

          {mathResults.ok ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                  <span className="text-[#94A3B8] block">Equidade Limiar (Pot Odds)</span>
                  <span className="text-lg font-extrabold font-mono tabular-nums text-[#60A5FA]">
                    {mathResults.potOdds.requiredEquityPct.toFixed(2)}%
                  </span>
                  <span className="block text-xs font-mono text-[#94A3B8] mt-0.5">
                    {mathResults.potOdds.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                  <span className="text-[#94A3B8] block">Fold Equity Blefe Puro</span>
                  <span className="text-lg font-extrabold font-mono tabular-nums text-[#F87171]">
                    {mathResults.bluff.requiredFoldEquityPct.toFixed(2)}%
                  </span>
                  <span className="block text-xs font-mono text-[#94A3B8] mt-0.5">
                    {mathResults.bluff.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                  <span className="text-[#94A3B8] block">MDF Simplificado</span>
                  <span className="text-lg font-extrabold font-mono tabular-nums text-sky-300">
                    {mathResults.mdf.mdfPct.toFixed(2)}%
                  </span>
                  <span className="block text-xs font-mono text-[#94A3B8] mt-0.5">
                    {mathResults.mdf.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3">
                  <span className="text-[#94A3B8] block">Fração de Blefe Polarizado (River)</span>
                  <span className="text-lg font-extrabold font-mono tabular-nums text-[#F87171]">
                    {mathResults.riverPolar.bluffFractionPct.toFixed(2)}% blefe /{" "}
                    {mathResults.riverPolar.valueFractionPct.toFixed(2)}% valor
                  </span>
                  <span className="block text-xs font-mono text-[#94A3B8] mt-0.5">
                    {mathResults.riverPolar.formula} · razão V:B ={" "}
                    {mathResults.riverPolar.valueToBluffRatio.toFixed(2)}:1
                  </span>
                </div>
              </div>

              <details className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 text-xs text-slate-300 group">
                <summary className="cursor-pointer font-semibold text-slate-200 flex items-center justify-between gap-1.5 list-none">
                  <span className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#60A5FA]" /> Hipóteses explícitas
                  </span>
                  <span className="text-xs text-[#60A5FA] group-open:hidden">Ver</span>
                  <span className="text-xs text-[#94A3B8] hidden group-open:inline">Ocultar</span>
                </summary>
                <div className="mt-2 pt-2 border-t border-[#1E293B] space-y-1 leading-relaxed">
                  {mathResults.potOdds.assumptions.map((a, i) => (
                    <p key={i}>• {a}</p>
                  ))}
                  <p className="text-[#FCA5A5]">• {mathResults.mdf.caveat}</p>
                </div>
              </details>
            </div>
          ) : (
            <div role="alert" className="rounded-xl bg-[#2B0B11] border border-[#DC2626]/60 p-3 text-xs text-[#FCA5A5] font-medium">
              {mathResults.error}
            </div>
          )}
        </div>

        {/* Seção 2: ICM Malmuth-Harville ($EV) */}
        <div className="lg:col-span-6 rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#F87171]">
              2. Modelo ICM Malmuth-Harville ($EV ≠ chipEV)
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#2B0B11] text-red-200 border border-[#DC2626]/40">
              Unidade: $EV
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-300 font-medium block">Stacks em fichas (separados por vírgula)</span>
              <input
                type="text"
                value={stacksInput}
                onChange={(e) => setStacksInput(e.target.value)}
                className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300 font-medium block">Premiação (valores em $)</span>
              <input
                type="text"
                value={payoutsInput}
                onChange={(e) => setPayoutsInput(e.target.value)}
                className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>
          </div>

          {icmResults.ok ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {icmResults.icm.icmValues.map((val, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-[#05070B] border border-[#1E293B] p-2.5 text-center"
                  >
                    <span className="text-xs text-[#94A3B8] block">
                      Jogador {i + 1} ({icmResults.icm.stacks[i]} fichas)
                    </span>
                    <span className="text-sm font-mono tabular-nums font-bold text-amber-300">
                      ${val.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#94A3B8] bg-[#05070B] border border-[#1E293B] rounded-lg px-3 py-2">
                <span>
                  Soma $EV: $
                  {icmResults.icm.icmValues.reduce((a, b) => a + b, 0).toFixed(2)}
                </span>
                <span>Premiação total: ${icmResults.icm.totalPrizePool.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-300 font-medium block">ICM na vitória ($EV)</span>
                  <input
                    type="number"
                    value={Number.isFinite(icmWin) ? icmWin : ""}
                    onChange={(e) => setIcmWin(parseFiniteInput(e.target.value))}
                    className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-2.5 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-medium block">ICM na derrota ($EV)</span>
                  <input
                    type="number"
                    value={Number.isFinite(icmLose) ? icmLose : ""}
                    onChange={(e) => setIcmLose(parseFiniteInput(e.target.value))}
                    className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-2.5 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-medium block">ICM no fold ($EV)</span>
                  <input
                    type="number"
                    value={Number.isFinite(icmFold) ? icmFold : ""}
                    onChange={(e) => setIcmFold(parseFiniteInput(e.target.value))}
                    className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-2.5 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Fator de Bolha (Bubble Factor):{" "}
                  <strong className="text-amber-300 font-mono tabular-nums">
                    {icmResults.bf.bubbleFactor.toFixed(2)}x
                  </strong>
                </span>
                <span>
                  Prêmio de Risco (vs flip 50%):{" "}
                  <strong className="text-[#FCA5A5] font-mono tabular-nums">
                    {icmResults.bf.riskPremiumPct >= 0 ? "+" : ""}
                    {icmResults.bf.riskPremiumPct.toFixed(2)}%
                  </strong>
                </span>
              </div>
            </div>
          ) : (
            <div role="alert" className="rounded-xl bg-[#2B0B11] border border-[#DC2626]/60 p-3 text-xs text-[#FCA5A5] font-medium">
              {icmResults.error}
            </div>
          )}
        </div>
      </div>

      {/* Seção 3: Engine Separado PKO */}
      <div className="rounded-2xl bg-[#090D16] border border-[#1E293B] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[#60A5FA]">
            3. Simulador Separado de Bounty MTT PKO (não usa ICM puro)
          </h3>
          <span className="text-xs text-[#FCA5A5] flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Aproximação heurística de PKO simétrico 50/50 — não substitui solver PKO completo
          </span>
        </div>
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          Hipótese estrutural: PKO progressivo simétrico 50/50 (50% captura imediata em dinheiro, 50% adicionada ao próprio bounty). Para formatos não 50/50 (Mystery/K.O. total), este fator não se aplica diretamente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-300 font-medium block">Pote sem bounty (fichas)</span>
            <input
              type="number"
              value={Number.isFinite(pkoPot) ? pkoPot : ""}
              onChange={(e) => setPkoPot(parseFiniteInput(e.target.value))}
              className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-300 font-medium block">Call necessário (fichas)</span>
            <input
              type="number"
              value={Number.isFinite(pkoCall) ? pkoCall : ""}
              onChange={(e) => setPkoCall(parseFiniteInput(e.target.value))}
              className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-300 font-medium block">Bounty do vilão ($)</span>
            <input
              type="number"
              value={Number.isFinite(pkoBounty) ? pkoBounty : ""}
              onChange={(e) => setPkoBounty(parseFiniteInput(e.target.value))}
              className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-300 font-medium block">Stack inicial (fichas)</span>
            <input
              type="number"
              value={Number.isFinite(pkoStartingStack) ? pkoStartingStack : ""}
              onChange={(e) => setPkoStartingStack(parseFiniteInput(e.target.value))}
              className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-300 font-medium block">Bounty inicial ($)</span>
            <input
              type="number"
              value={Number.isFinite(pkoStartingBounty) ? pkoStartingBounty : ""}
              onChange={(e) => setPkoStartingBounty(parseFiniteInput(e.target.value))}
              className="w-full min-h-[38px] rounded-lg bg-[#05070B] border border-[#26334A] px-3 py-1.5 text-sm text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#3B82F6]"
            />
          </label>
          <div className="space-y-1">
            <span className="text-slate-300 font-medium block">Fator do Bounty Inicial</span>
            <div className="flex items-center gap-1">
              {[0.25, 0.33, 0.5].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPkoBountyFactor(f)}
                  className={`flex-1 min-h-[38px] rounded-lg text-xs font-mono font-bold border transition ${
                    Math.abs(pkoBountyFactor - f) < 0.005
                      ? "bg-[#2563EB] border-[#60A5FA] text-white"
                      : "bg-[#05070B] border-[#1E293B] text-[#94A3B8] hover:text-white"
                  }`}
                >
                  {f.toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={pkoCovers}
            onChange={(e) => setPkoCovers(e.target.checked)}
            className="rounded border-slate-600 accent-[#2563EB]"
          />
          <span className="text-slate-200 font-medium">
            Herói cobre o stack do vilão (captura 50% imediato em dinheiro no PKO)
          </span>
        </label>

        {pkoResult.ok ? (
          <div className="rounded-xl bg-[#05070B] border border-[#1E293B] p-3.5 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Equivalente do bounty em fichas:{" "}
                <strong className="text-sky-300 font-mono tabular-nums">
                  +{Math.round(pkoResult.data.bountyChipEquivalent)} fichas
                </strong>
              </span>
              <span>
                Captura imediata (50%):{" "}
                <strong className="text-emerald-300 font-mono tabular-nums">
                  ${pkoResult.data.immediateBountyUsd.toFixed(2)}
                </strong>
              </span>
              <span>
                Equidade necessária ajustada:{" "}
                <strong className="text-[#60A5FA] font-mono tabular-nums text-sm">
                  {(pkoResult.data.adjustedRequiredEquity * 100).toFixed(2)}%
                </strong>
              </span>
            </div>
            <p className="text-xs font-mono text-[#94A3B8]">
              Fórmula: {pkoResult.data.formula} · Fator{" "}
              {pkoResult.data.effectiveBountyChipFactor.toFixed(2)}× do stack inicial por bounty
            </p>
          </div>
        ) : (
          <div role="alert" className="rounded-xl bg-[#2B0B11] border border-[#DC2626]/60 p-3 text-xs text-[#FCA5A5] font-medium">
            {pkoResult.error}
          </div>
        )}
      </div>
    </div>
  );
}
