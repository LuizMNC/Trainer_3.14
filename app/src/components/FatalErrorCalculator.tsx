"use client";

import { useState } from "react";
import type { CalculatorKind } from "@/lib/poker/fatalErrorsCatalog";
import { calculateFatalErrorModel } from "@/lib/poker/fatalErrorsMath";

export function FatalErrorCalculator({ kind }: { kind: CalculatorKind }) {
  const [pot, setPot] = useState("100");
  const [bet, setBet] = useState("50");
  let result: ReturnType<typeof calculateFatalErrorModel> | null = null;
  try { result = calculateFatalErrorModel(kind, Number(pot), Number(bet)); } catch { /* Mensagem abaixo */ }
  return (
    <section className="rounded-xl border border-sky-800 bg-sky-950/20 p-4 space-y-3" aria-label="Calculadora didática">
      <h3 className="font-bold text-sky-200">Calculadora didática · modelo estático</h3>
      <p className="text-xs text-slate-300">Heads-up, river ou all-in final, sem rake, sem side pots, sem ações futuras e sem ICM/PKO. P é o pote antes da aposta B. Valores na mesma unidade.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">Pote antes da aposta (P)
          <input className="mt-1 w-full rounded bg-slate-950 border border-slate-700 p-2" type="number" min="0.01" step="any" value={pot} onChange={e => setPot(e.target.value)} />
        </label>
        <label className="text-sm">Aposta (B)
          <input className="mt-1 w-full rounded bg-slate-950 border border-slate-700 p-2" type="number" min="0.01" step="any" value={bet} onChange={e => setBet(e.target.value)} />
        </label>
      </div>
      <div aria-live="polite" className="text-sm">
        {result ? <><p className="text-sky-200 font-semibold">{result.label}: {result.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</p><p className="font-mono text-xs mt-1">{result.formula}</p><p className="text-xs text-slate-300 mt-2">{result.caveat}</p></> : <p className="text-amber-200">Informe pote e aposta positivos e finitos.</p>}
      </div>
      <p className="text-xs text-slate-400">Conta aritmética sob hipóteses explícitas. Não fornece estratégia GTO, recomendação de ação ou EV loss.</p>
    </section>
  );
}
