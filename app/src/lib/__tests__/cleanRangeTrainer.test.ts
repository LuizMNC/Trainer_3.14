import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { POSITIONS_8MAX, type RangeSpot, type RangesDataset } from "../poker.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate && !path.extname(candidate)) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(candidate + extension)) {
          return nextResolve(pathToFileURL(candidate + extension).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
});

const {
  CleanRangeTrainerView,
  filterMemorizerSpots,
  getAvailablePositionsForType,
} = await import("../../components/CleanRangeTrainerView.tsx");
const { CollapsiblePanel } = await import("../../components/CollapsiblePanel.tsx");

function makeSpot(overrides: Partial<RangeSpot> & Pick<RangeSpot, "id" | "spotType" | "heroPosition">): RangeSpot {
  return {
    name: `${overrides.heroPosition} ${overrides.spotType.toUpperCase()} 40BB`,
    stackBb: 40,
    villainPosition: overrides.spotType === "rfi" ? null : "CO",
    source: "TEST_CHART_V1",
    actions: [
      { name: "Raise", color: "#ef4444", pct: 20 },
      { name: "Fold", color: "#3b82f6", pct: 80 },
    ],
    matrix: {
      AKs: { Raise: 1, Fold: 0 },
      "72o": { Raise: 0, Fold: 1 },
    },
    ...overrides,
  };
}

describe("Treiner Limpo — Filtros por tipo e posição + Painéis recolhíveis", () => {
  const sampleSpots: RangeSpot[] = [
    makeSpot({ id: "rfi_utg", spotType: "rfi", heroPosition: "UTG" }),
    makeSpot({ id: "rfi_btn", spotType: "rfi", heroPosition: "BTN" }),
    makeSpot({ id: "vs_rfi_bb", spotType: "vs_rfi", heroPosition: "BB" }),
    makeSpot({ id: "vs_limp_bb", spotType: "vs_limp", heroPosition: "BB" }),
    makeSpot({ id: "pf_sb", spotType: "push_fold", heroPosition: "SB", stackBb: 12 }),
    makeSpot({ id: "vs_shove_bb", spotType: "vs_shove", heroPosition: "BB", stackBb: 15 }),
  ];

  it("filtra spots corretamente por tipo (all, rfi, vs_rfi) e posição", () => {
    assert.equal(filterMemorizerSpots(sampleSpots, "all", "all").length, sampleSpots.length);

    const onlyRfi = filterMemorizerSpots(sampleSpots, "rfi", "all");
    assert.deepEqual(
      onlyRfi.map((s) => s.id),
      ["rfi_utg", "rfi_btn"],
    );

    const btnRfi = filterMemorizerSpots(sampleSpots, "rfi", "BTN");
    assert.deepEqual(
      btnRfi.map((s) => s.id),
      ["rfi_btn"],
    );

    const bbVsRfi = filterMemorizerSpots(sampleSpots, "vs_rfi", "BB");
    assert.deepEqual(
      bbVsRfi.map((s) => s.id),
      ["vs_rfi_bb"],
    );

    assert.equal(filterMemorizerSpots(sampleSpots, "rfi", "BB").length, 0);
  });

  it("retorna apenas as posições disponíveis para cada filtro de spotType", () => {
    const allPos = getAvailablePositionsForType(sampleSpots, "all");
    assert.deepEqual([...allPos].sort(), ["BB", "BTN", "SB", "UTG"]);

    const rfiPos = getAvailablePositionsForType(sampleSpots, "rfi");
    assert.deepEqual([...rfiPos].sort(), ["BTN", "UTG"]);

    const vsRfiPos = getAvailablePositionsForType(sampleSpots, "vs_rfi");
    assert.deepEqual([...vsRfiPos], ["BB"]);
  });

  it("renderiza CleanRangeTrainerView com mesa limpa, filtros RFI/vs RFI, 8 posições, matriz recolhida e sem EV inventado", () => {
    const dataset = JSON.parse(
      readFileSync(path.resolve("src/data/ranges_gto.json"), "utf8"),
    ) as RangesDataset;

    const markup = renderToStaticMarkup(
      createElement(CleanRangeTrainerView, { spots: dataset.spots }),
    );

    assert.ok(markup.includes("Treiner Limpo · Memorização de Ranges"));
    assert.ok(markup.includes("RFI"));
    assert.ok(markup.includes("vs RFI"));
    assert.ok(markup.includes("vs Limp"));
    assert.ok(markup.includes("Push/Fold"));
    assert.ok(markup.includes("vs Shove"));

    for (const pos of POSITIONS_8MAX) {
      assert.ok(markup.includes(`>${pos}<`), `Faltou botão da posição ${pos}`);
    }

    assert.ok(markup.includes("Consultar Matriz 13×13 para Fixar"));
    assert.match(markup, /aria-expanded="false"[^>]*>.*Consultar Matriz 13×13 para Fixar/s);

    // Charts de frequência pura não devem exibir EV ou bb/100 fabricados
    assert.ok(!markup.includes("+EV"));
    assert.ok(!markup.includes("EV Loss"));
    assert.ok(!markup.includes("bb/100"));
  });

  it("CollapsiblePanel respeita estado inicial recolhido por padrão vs defaultOpen=true e aria-expanded", () => {
    const collapsedMarkup = renderToStaticMarkup(
      createElement(
        CollapsiblePanel,
        { title: "Filtros Secundários" },
        createElement("p", null, "Conteúdo recolhido inicialmente"),
      ),
    );
    assert.ok(collapsedMarkup.includes("Filtros Secundários"));
    assert.ok(collapsedMarkup.includes('aria-expanded="false"'));
    assert.ok(!collapsedMarkup.includes("Conteúdo recolhido inicialmente"));

    const expandedMarkup = renderToStaticMarkup(
      createElement(
        CollapsiblePanel,
        { title: "Matriz Aberta", defaultOpen: true },
        createElement("p", null, "Conteúdo visível quando expandido"),
      ),
    );
    assert.ok(expandedMarkup.includes("Matriz Aberta"));
    assert.ok(expandedMarkup.includes('aria-expanded="true"'));
    assert.ok(expandedMarkup.includes("Conteúdo visível quando expandido"));
  });
});
