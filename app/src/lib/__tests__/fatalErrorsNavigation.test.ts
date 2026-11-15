import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { FATAL_ERRORS } from "../poker/fatalErrorsCatalog.ts";

// O runner existente é node:test. Usa apenas o TypeScript já instalado para
// renderizar os componentes TSX reais no servidor, sem nova dependência.
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) candidate = path.resolve("src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) candidate = fileURLToPath(new URL(specifier, context.parentURL));
    if (candidate && !path.extname(candidate)) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(candidate + extension)) return nextResolve(pathToFileURL(candidate + extension).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  },
});

const { PokerStudioApp } = await import("../../components/PokerStudioApp.tsx");
const { FatalErrorsView } = await import("../../components/FatalErrorsView.tsx");
const { FatalErrorQuiz } = await import("../../components/FatalErrorQuiz.tsx");
const { FatalErrorCalculator } = await import("../../components/FatalErrorCalculator.tsx");
const { StatsView } = await import("../../components/StatsView.tsx");

describe("Fase 1 — Navegação e renderização dos componentes reais", () => {
  it("estatísticas de frequências sem EV não afirmam rentabilidade +EV e exibem Limpar tudo e filtros de revisão", () => {
    const markup = renderToStaticMarkup(createElement(StatsView, {
      history: [{ id: "frequency-only", timestamp: 1794500000000,
        spotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
        spotName: "TexasSolver: frequências sem EV", stackBb: 27.9, heroPosition: "BTN",
        spotType: "flop_cbet_ip", hand: "AA", chosenAction: "Check", bestAction: "Bet_33pct",
        status: "mixed", chosenFreq: .033357, evLoss: null, evUnit: null, strategyStatus: "VERIFIED" }],
      onClearHistory() {},
    }));
    assert.ok(!markup.includes("(+EV)"));
    assert.match(markup, /Mix válido/);
    for (const label of ["Limpar tudo", "Colocar mão na revisão", "Todas as mãos", "Precisam revisar", "Errei", "Acertei", "Fiquei em dúvida"]) {
      assert.ok(markup.includes(label), `Faltando label em StatsView: ${label}`);
    }
  });

  it("inclui a nova aba e preserva as seis abas existentes", () => {
    const markup = renderToStaticMarkup(createElement(PokerStudioApp, { spots: [], totalChunks: 0, videos: [] }));
    for (const label of ["Erros Fatais", "Modo Trainer", "Currículo &amp; 18 Aulas", "Explorador de Ranges", "Lab EV &amp; ICM", "AI Poker Coach", "Diagnóstico &amp; Leaks"]) assert.ok(markup.includes(label), label);
    assert.match(markup, /PDF de Poker/);
    assert.doesNotMatch(markup, /reglife/i);
    for (const label of ["Aumentar fonte", "Diminuir fonte", "Restaurar tamanho padrão da fonte", "Fazer um tour"]) assert.ok(markup.includes(label), label);
  });

  it("renderiza catálogo, quatro filtros, vínculos e estado inicial antes da hidratação", () => {
    const markup = renderToStaticMarkup(createElement(FatalErrorsView, { spots: [], onLaunchDrill() {} }));
    assert.equal((markup.match(/aria-pressed=/g) ?? []).length, 20);
    for (const label of ["Street / contexto", "Categoria de evidência", "Dificuldade didática", "Status de estudo", "Exceção / contraponto didático", "METADATA_HYPOTHESIS", "UNSOLVED", "Sem spot compatível", "Carregando progresso local"]) assert.ok(markup.includes(label), label);
    assert.match(markup, /<fieldset disabled=""/);
    assert.match(markup, /grid-cols-1 sm:grid-cols-2/);
    assert.match(markup, /lg:grid-cols-/);
    assert.match(markup, /respostas recentes/);
    assert.match(markup, /não representam totais cumulativos/);
  });

  it("cada quiz renderiza três opções com rótulos e exige confirmação explícita", () => {
    for (const card of FATAL_ERRORS) {
      const markup = renderToStaticMarkup(createElement(FatalErrorQuiz, { card, ready: true, onAnswer() {} }));
      assert.equal((markup.match(/type="radio"/g) ?? []).length, 3);
      assert.match(markup, /Confiança antes de responder/);
      assert.match(markup, /disabled=""[^>]*>Confirmar resposta/);
      assert.ok(!markup.includes("Resposta correta."));
    }
  });

  it("calculadoras exibem modelos com restrições, sem recomendação de ação", () => {
    for (const kind of ["pot_odds", "bluff_fe", "mdf"] as const) {
      const markup = renderToStaticMarkup(createElement(FatalErrorCalculator, { kind }));
      assert.match(markup, /Heads-up, river ou all-in final, sem rake, sem side pots/);
      assert.match(markup, /Não fornece estratégia GTO/);
      assert.match(markup, /aria-live="polite"/);
    }
  });
});
