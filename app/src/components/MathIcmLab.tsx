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
  const [pkoCovers, setPkoCovers] = useState(true);

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
      const stacks = stacksInput
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
      const payouts = payoutsInput
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n));
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
          startingStackChips: 10000,
          startingBountyUsd: 10,
          heroCoversVillain: pkoCovers,
        }),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Erro PKO.",
      };
    }
  }, [pkoPot, pkoCall, pkoBounty, pkoCovers]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">
            Laboratório Matemático: Pot Odds, EV, ICM ($EV) e PKO
          </h2>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Todos os cálculos explicitam unidades (chipEV vs $EV) e hipóteses simplificadoras. Nenhum modelo simplificado é apresentado como solução GTO completa.
        </p>
      </div>

      {/* Seção 1: Pot Odds, Bluff Fold Equity & MDF */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4">
          <h3 className="text-sm font-bold text-emerald-300">
            1. Pot Odds, Fold Equity de Blefe e MDF (chipEV)
          </h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400 block">Pote inicial (P)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={pot}
                onChange={(e) => setPot(Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400 block">Aposta (B)</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400 block">Call (C)</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={call}
                onChange={(e) => setCall(Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
              />
            </label>
          </div>

          {mathResults.ok ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400 block">Equidade Limiar (Pot Odds)</span>
                  <span className="text-lg font-extrabold font-mono text-emerald-400">
                    {mathResults.potOdds.requiredEquityPct.toFixed(2)}%
                  </span>
                  <span className="block text-[0.625rem] font-mono text-slate-500 mt-0.5">
                    {mathResults.potOdds.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400 block">Fold Equity Blefe Puro</span>
                  <span className="text-lg font-extrabold font-mono text-amber-300">
                    {mathResults.bluff.requiredFoldEquityPct.toFixed(2)}%
                  </span>
                  <span className="block text-[0.625rem] font-mono text-slate-500 mt-0.5">
                    {mathResults.bluff.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400 block">MDF Simplificado</span>
                  <span className="text-lg font-extrabold font-mono text-indigo-300">
                    {mathResults.mdf.mdfPct.toFixed(2)}%
                  </span>
                  <span className="block text-[0.625rem] font-mono text-slate-500 mt-0.5">
                    {mathResults.mdf.formula}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <span className="text-slate-400 block">Fração de Blefe Polarizado (River)</span>
                  <span className="text-lg font-extrabold font-mono text-rose-300">
                    {mathResults.riverPolar.bluffFractionPct.toFixed(2)}% blefe /{" "}
                    {mathResults.riverPolar.valueFractionPct.toFixed(2)}% valor
                  </span>
                  <span className="block text-[0.625rem] font-mono text-slate-500 mt-0.5">
                    {mathResults.riverPolar.formula} · razão V:B ={" "}
                    {mathResults.riverPolar.valueToBluffRatio.toFixed(2)}:1
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-[0.6875rem] text-slate-300 space-y-1">
                <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-emerald-400" /> Hipóteses explícitas
                </div>
                {mathResults.potOdds.assumptions.map((a, i) => (
                  <p key={i}>• {a}</p>
                ))}
                <p className="text-amber-300/90">• {mathResults.mdf.caveat}</p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-rose-300">{mathResults.error}</div>
          )}
        </div>

        {/* Seção 2: ICM Malmuth-Harville ($EV) */}
        <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-300">
              2. Modelo ICM Malmuth-Harville ($EV ≠ chipEV)
            </h3>
            <span className="text-[0.625rem] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/30">
              Unidade: $EV
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400 block">Stacks (separados por vírgula)</span>
              <input
                type="text"
                value={stacksInput}
                onChange={(e) => setStacksInput(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400 block">Premiação ($ payouts)</span>
              <input
                type="text"
                value={payoutsInput}
                onChange={(e) => setPayoutsInput(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
              />
            </label>
          </div>

          {icmResults.ok ? (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {icmResults.icm.icmValues.map((val, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-center"
                  >
                    <span className="text-[0.625rem] text-slate-400 block">
                      Jogador {i + 1} ({icmResults.icm.stacks[i]} ch)
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-300">
                      ${val.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] font-mono text-slate-400 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
                <span>
                  Soma $EV: $
                  {icmResults.icm.icmValues.reduce((a, b) => a + b, 0).toFixed(2)}
                </span>
                <span>Prize Pool: ${icmResults.icm.totalPrizePool.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[0.6875rem]">
                <label className="space-y-1">
                  <span className="text-slate-400 block">ICM Win ($EV)</span>
                  <input
                    type="number"
                    value={icmWin}
                    onChange={(e) => setIcmWin(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">ICM Lose ($EV)</span>
                  <input
                    type="number"
                    value={icmLose}
                    onChange={(e) => setIcmLose(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-400 block">ICM Fold ($EV)</span>
                  <input
                    type="number"
                    value={icmFold}
                    onChange={(e) => setIcmFold(Number(e.target.value))}
                    className="w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-white font-mono"
                  />
                </label>
              </div>

              <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Bubble Factor:{" "}
                  <strong className="text-amber-300 font-mono">
                    {icmResults.bf.bubbleFactor.toFixed(2)}x
                  </strong>
                </span>
                <span>
                  Risk Premium (vs 50% flip):{" "}
                  <strong className="text-rose-300 font-mono">
                    +{icmResults.bf.riskPremiumPct.toFixed(2)}%
                  </strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-rose-300">{icmResults.error}</div>
          )}
        </div>
      </div>

      {/* Seção 3: Engine Separado PKO */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-indigo-300">
            3. Simulador Separado de Bounty PKO (não usa ICM puro)
          </h3>
          <span className="text-[0.6875rem] text-amber-300 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> PKO exige ajuste de bounty — não confundir com GTO puro
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-400 block">Pote sem bounty (fichas)</span>
            <input
              type="number"
              value={pkoPot}
              onChange={(e) => setPkoPot(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 block">Call necessário (fichas)</span>
            <input
              type="number"
              value={pkoCall}
              onChange={(e) => setPkoCall(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 block">Bounty do vilão ($)</span>
            <input
              type="number"
              value={pkoBounty}
              onChange={(e) => setPkoBounty(Number(e.target.value))}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-white font-mono"
            />
          </label>
          <label className="flex items-center gap-2 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={pkoCovers}
              onChange={(e) => setPkoCovers(e.target.checked)}
              className="rounded border-slate-600"
            />
            <span className="text-slate-200 font-medium">Herói cobre o vilão</span>
          </label>
        </div>

        {pkoResult.ok ? (
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span>
              Equivalente do bounty em fichas:{" "}
              <strong className="text-indigo-300 font-mono">
                +{Math.round(pkoResult.data.bountyChipEquivalent)} fichas
              </strong>
            </span>
            <span>
              Equidade necessária ajustada:{" "}
              <strong className="text-emerald-400 font-mono">
                {(pkoResult.data.adjustedRequiredEquity * 100).toFixed(2)}%
              </strong>
            </span>
            <span className="text-slate-400 text-[0.6875rem]">
              {pkoResult.data.assumptions[0]}
            </span>
          </div>
        ) : (
          <div className="text-xs text-rose-300">{pkoResult.error}</div>
        )}
      </div>
    </div>
  );
}
