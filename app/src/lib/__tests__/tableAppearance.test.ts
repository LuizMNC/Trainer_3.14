import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { POSITIONS_8MAX, type RangeSpot } from "../poker.ts";
import {
  buildFeltGradient,
  DEFAULT_TABLE_APPEARANCE,
  getOpponentScientistName,
  normalizeHexColor,
  sanitizeTableAppearance,
  SCIENTIST_BY_POSITION,
  shadeHexColor,
} from "../poker/tableAppearance.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:")
    ) {
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

const { PokerTable } = await import("../../components/PokerTable.tsx");

describe("Personalização da mesa e oponentes cientistas (TreinerLM)", () => {
  it("normaliza e sombreia cores hexadecimais arbitrárias com fallback seguro", () => {
    assert.equal(normalizeHexColor("#abc", "#14332B"), "#AABBCC");
    assert.equal(normalizeHexColor("  #7a1f3d ", "#14332B"), "#7A1F3D");
    assert.equal(normalizeHexColor("invalido", "#14332B"), "#14332B");

    assert.notEqual(shadeHexColor("#7A1F3D", 1.18), "#7A1F3D");
    const gradient = buildFeltGradient("#7A1F3D");
    assert.match(gradient, /^radial-gradient\(ellipse at center,/);
  });

  it("sanitiza configurações inválidas preservando opções válidas de mesa, cartas e fichas", () => {
    assert.deepEqual(sanitizeTableAppearance(null), DEFAULT_TABLE_APPEARANCE);

    const sanitized = sanitizeTableAppearance({
      presetId: "custom",
      feltColor: "#7a1f3d",
      railColor: "#123",
      cardStyle: "classic-two",
      chipStyle: "neon-pro",
    });
    assert.deepEqual(sanitized, {
      presetId: "custom",
      feltColor: "#7A1F3D",
      railColor: "#112233",
      cardStyle: "classic-two",
      chipStyle: "neon-pro",
    });

    const withInvalidStyles = sanitizeTableAppearance({
      feltColor: "nope",
      railColor: "",
      cardStyle: "hologram",
      chipStyle: "plastic",
    });
    assert.equal(withInvalidStyles.feltColor, DEFAULT_TABLE_APPEARANCE.feltColor);
    assert.equal(withInvalidStyles.railColor, DEFAULT_TABLE_APPEARANCE.railColor);
    assert.equal(withInvalidStyles.cardStyle, DEFAULT_TABLE_APPEARANCE.cardStyle);
    assert.equal(withInvalidStyles.chipStyle, DEFAULT_TABLE_APPEARANCE.chipStyle);
  });

  it("atribui os 8 cientistas famosos às posições 8-max", () => {
    const expectedScientists = [
      "Newton",
      "Einstein",
      "Curie",
      "Tesla",
      "Euler",
      "Gauss",
      "Noether",
      "Turing",
    ];
    for (let index = 0; index < POSITIONS_8MAX.length; index++) {
      const position = POSITIONS_8MAX[index];
      assert.equal(
        SCIENTIST_BY_POSITION[position],
        expectedScientists[index],
      );
      assert.equal(
        getOpponentScientistName(position, index),
        expectedScientists[index],
      );
    }
    assert.equal(getOpponentScientistName("DESCONHECIDA", 2), "Curie");
  });

  it("renderiza PokerTable com TreinerLM na mesa, nomes científicos nos oponentes e cor personalizada", () => {
    const spot: RangeSpot = {
      id: "btn-vs-bb-srp-30bb",
      name: "BTN vs BB SRP 30BB chipEV",
      stackBb: 30,
      heroPosition: "BTN",
      villainPosition: "BB",
      spotType: "vs_rfi",
      source: "texassolver",
      actions: [],
      matrix: {},
    };

    const markup = renderToStaticMarkup(
      createElement(PokerTable, {
        spot,
        cards: [
          { rank: "8", suit: "♠" },
          { rank: "8", suit: "♦" },
        ],
        rngValue: 50,
        useRng: true,
        board: ["Ah", "Kd", "7c"],
        potBbOverride: 5.7,
        anteLabel: "Ante 0.125bb",
        formatLabel: "MTT 8-Max",
        heroAction: "Bet_33pct",
        appearance: {
          presetId: "custom",
          feltColor: "#7A1F3D",
          railColor: "#2C1018",
          cardStyle: "classic-two",
          chipStyle: "neon-pro",
        },
      }),
    );

    assert.match(markup, /TreinerLM/);
    assert.doesNotMatch(markup, /PDF de Poker/);
    assert.ok(
      markup.includes("#7A1F3D") || markup.includes("2C1018") || markup.includes("radial-gradient"),
      "Cor personalizada do feltro/aro deve ser aplicada na mesa",
    );
    assert.match(markup, /Você/);
    for (const scientist of [
      "Newton",
      "Einstein",
      "Curie",
      "Tesla",
      "Euler",
      "Noether",
      "Turing",
    ]) {
      assert.ok(markup.includes(scientist), `Cientista ${scientist} ausente na mesa`);
    }
    // Gauss está mapeado para BTN, que neste spot é o Hero ("Você")
    assert.ok(!markup.includes("Gauss"), "Assento do Hero não deve exibir nome de oponente");
  });
});
