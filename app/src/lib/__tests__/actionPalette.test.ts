import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { getActionDistributionVisual, getActionVisualStyle, formatActionFrequencyPtBr } from "../poker/uiPresentation.ts";
import type { RangeSpot } from "../poker.ts";

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

const { RangeMatrix } = await import("../../components/RangeMatrix.tsx");
const { PokerTable } = await import("../../components/PokerTable.tsx");

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

const spot: RangeSpot = {
  id: "palette-fixture", name: "Paleta", stackBb: 14, heroPosition: "SB", villainPosition: null,
  spotType: "rfi", source: "TEST_ONLY",
  actions: [
    { name: "All-in", color: "#old", pct: 20 },
    { name: "Raise", color: "#old", pct: 20 },
    { name: "Limp", color: "#old", pct: 60 },
  ],
  matrix: { AA: { Limp: 1 }, AKs: { Limp: 0.125, Raise: 0.25, "All-in": 0.625 }, AQs: { Limp: 0.125 } },
};

describe("Paleta semântica global de ações", () => {
  it("preserva os sete pares obrigatórios e contraste WCAG AA em texto normal", () => {
    const expected = [
      ["All-in", "#6D28D9", "#FFFFFF"], ["Raise", "#B91C1C", "#FFFFFF"],
      ["Limp", "#FACC15", "#111827"], ["Fold", "#1D4ED8", "#FFFFFF"],
      ["Call", "#047857", "#FFFFFF"], ["Check", "#475569", "#FFFFFF"],
      ["Bet", "#C2410C", "#FFFFFF"],
    ];
    for (const [action, bg, text] of expected) {
      const visual = getActionVisualStyle(action);
      assert.equal(visual.bg, bg);
      assert.equal(visual.text, text);
      assert.ok(contrast(bg, text) >= 4.5, `${action}: ${contrast(bg, text)}`);
      assert.ok(contrast(visual.hoverBg, text) >= 4.5, `${action} hover`);
      assert.ok(visual.shortGlyph);
    }
    for (const alias of ["ALL_IN", "All in 14bb", "Shove"]) assert.equal(getActionVisualStyle(alias).bg, "#6D28D9");
    assert.equal(getActionVisualStyle("Raise_2_1bb").bg, "#B91C1C");
    assert.equal(getActionVisualStyle("Limp 1,0 BB").text, "#111827");
  });

  it("desenha frequências pequenas e resíduos sem normalizar, arredondar ou inventar Fold", () => {
    const distribution = Object.freeze({ Limp: 0.00125, Raise: 0.25 });
    const visual = getActionDistributionVisual(distribution, ["Limp", "Raise", "Fold"]);
    assert.ok(visual.background.includes("#FACC15 0% 0.125%"));
    assert.ok(visual.background.includes(`#B91C1C 0.125% ${(0.00125 + 0.25) * 100}%`));
    assert.ok(visual.background.includes(`#1E293B ${(0.00125 + 0.25) * 100}% 100%`));
    assert.ok(!visual.background.includes("#1D4ED8"));
    assert.equal(visual.incomplete, true);
    assert.equal(visual.total, 0.25125);
    assert.equal(formatActionFrequencyPtBr(0.00125), "0,125%");
    assert.deepEqual(distribution, { Limp: 0.00125, Raise: 0.25 });
    assert.equal(getActionDistributionVisual({ Raise: 1.1 }).total, 1.1);
    assert.equal(getActionDistributionVisual({ Limp: 1 }).text, "#111827");
    assert.equal(getActionDistributionVisual({ Limp: 0.5, Raise: 0.5 }).labelBackground, "#111827");
  });

  it("renderiza legenda com texto escuro no Limp e descrição acessível das misturas/incompletas", () => {
    const before = JSON.stringify(spot);
    const html = renderToStaticMarkup(createElement(RangeMatrix, { spot }));
    assert.ok(html.includes("background-color:#FACC15;color:#111827"));
    assert.ok(html.includes("#6D28D9"));
    assert.ok(html.includes("#B91C1C"));
    assert.ok(html.includes("Limp 12,5%"));
    assert.ok(html.includes("Raise 25%"));
    assert.ok(html.includes("All-in 62,5%"));
    assert.ok(html.includes("Distribuição incompleta ou inválida: total 12,5%; sem normalização"));
    assert.ok(html.includes('aria-label="AKs'));
    assert.equal(JSON.stringify(spot), before);
    assert.ok(!html.includes("#old"));
  });

  it("usa o mesmo par amarelo/escuro nas ações da mesa e feedback do herói", () => {
    const html = renderToStaticMarkup(createElement(PokerTable, {
      spot: { ...spot, spotType: "vs_limp", heroPosition: "BB", villainPosition: "SB" },
      cards: [{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }], rngValue: 50, useRng: false, heroAction: "Limp",
    }));
    assert.ok(html.includes("background-color:#FACC15;color:#111827"));
    assert.ok(html.includes("Sua ação:"));
    assert.ok(html.includes("Limp 1,0 BB"));
  });
});
