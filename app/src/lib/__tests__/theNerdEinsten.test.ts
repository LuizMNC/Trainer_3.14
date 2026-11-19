import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/node_modules/")) {
      return nextResolve(specifier, context);
    }
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate?.endsWith(".json") && existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href + "?json-esm", shortCircuit: true };
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
    if (url.endsWith("?json-esm")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${readFileSync(fileURLToPath(url.slice(0, -9)), "utf8")};`,
      };
    }
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
  ASSISTANT_NAME,
  ASSISTANT_TAGLINE,
  formatProviderModel,
  PROVIDER_DISPLAY_NAMES,
} = await import("../ai/assistantIdentity.ts");
const {
  ASSISTANT_SYSTEM_PROMPT,
  DEFAULT_ASSISTANT_PROMPT,
  formatSpotContextForPrompt,
} = await import("../ai/assistantPrompt.ts");
const {
  closeIncompleteMarkdown,
  latexToReadable,
  markdownToPlainText,
  parseAssistantResponse,
  parsedToPlainText,
  sanitizeAssistantUrl,
  validateStructuredAnalysis,
} = await import("../ai/responseFormat.ts");
const {
  buildSpotEvidence,
  computeDeterministicPotMath,
  detectDivergences,
  extractPotMathFromQuestion,
  parseHandQuestion,
  resolveEvidenceForQuestion,
} = await import("../ai/provenance.ts");
const { adaptLegacyRangeSpotToCanonical } = await import("../poker/strategySchema.ts");
const rangesData = (await import("../../data/ranges_gto.json")).default as unknown as {
  spots: Array<{
    id: string;
    name: string;
    stackBb: number;
    heroPosition: string;
    villainPosition: string | null;
    spotType: "rfi" | "vs_rfi" | "vs_limp" | "push_fold" | "vs_shove";
    source: string;
    actions: { name: string; color: string; pct: number }[];
    matrix: Record<string, Record<string, number>>;
  }>;
};
const { AssistantMarkdown } = await import("../../components/AssistantMarkdown.tsx");
const {
  AssistantResponseCard,
  TheNerdEinstenHeader,
} = await import("../../components/AssistantResponseCard.tsx");
const { AiCoachView } = await import("../../components/AiCoachView.tsx");
const { SettingsModal } = await import("../../components/SettingsModal.tsx");
const { emptyProviderConfig, PROVIDER_IDS } = await import("../ai/clientStorage.ts");

const canonicalSpots = rangesData.spots.map(adaptLegacyRangeSpotToCanonical);

describe("TheNerdEinsten — Identidade, Prompt Padrão, Provedores e Português Brasileiro", () => {
  it("mantém grafia exata TheNerdEinsten, subtítulo MTT e prompt padrão em português brasileiro", () => {
    assert.equal(ASSISTANT_NAME, "TheNerdEinsten");
    assert.equal(ASSISTANT_TAGLINE, "Assistente de estudos de poker — MTT");
    assert.equal(
      DEFAULT_ASSISTANT_PROMPT,
      "Você é TheNerdEinsten, um assistente de estudos de poker especializado em torneios MTT. Responda em português brasileiro, com clareza, objetividade e prioridade para explicações práticas. Primeiro apresente a conclusão, depois os fatores relevantes. Diferencie cálculos verificados, estratégias GTO, charts importados e interpretações didáticas. Nunca invente frequências, EV ou fontes. Não justifique automaticamente decisões ruins. Quando faltarem dados, explicite as limitações. Não ofereça assistência em tempo real durante partidas.",
    );
    assert.ok(ASSISTANT_SYSTEM_PROMPT.includes(DEFAULT_ASSISTANT_PROMPT));
  });

  it("formata metadados reais de qualquer provedor e modelo sem usar nome fixo", () => {
    assert.equal(
      formatProviderModel("openai", "gpt-oss-20b"),
      "Provedor: OpenAI | Modelo: gpt-oss-20b",
    );
    assert.equal(
      formatProviderModel("gemini", "gemini-2.5-flash"),
      "Provedor: Gemini | Modelo: gemini-2.5-flash",
    );
    assert.equal(
      formatProviderModel("anthropic", "claude-sonnet-4-20250514"),
      "Provedor: Claude | Modelo: claude-sonnet-4-20250514",
    );
    assert.equal(
      formatProviderModel("deepseek", ""),
      "Provedor: DeepSeek | Modelo: não selecionado",
    );

    for (const id of PROVIDER_IDS) {
      assert.ok(PROVIDER_DISPLAY_NAMES[id], `Faltando nome para provedor ${id}`);
      const headerHtml = renderToStaticMarkup(
        createElement(TheNerdEinstenHeader, {
          provider: id,
          model: `modelo-${id}`,
          totalChunks: 322,
          canChat: true,
        }),
      );
      assert.ok(headerHtml.includes("TheNerdEinsten"));
      assert.ok(headerHtml.includes("Assistente de estudos de poker — MTT"));
      assert.ok(
        headerHtml.includes(`Provedor: ${PROVIDER_DISPLAY_NAMES[id]} | Modelo: modelo-${id}`),
      );
    }

    const modalHtml = renderToStaticMarkup(
      createElement(SettingsModal, {
        isOpen: true,
        provider: "openai",
        providers: PROVIDER_IDS,
        configs: { openai: { ...emptyProviderConfig(), model: "gpt-oss-20b" } },
        onSave: () => true,
        onRemove: () => true,
        onClose: () => {},
      }),
    );
    assert.ok(modalHtml.includes("Configurações do TheNerdEinsten"));
  });
});

describe("TheNerdEinsten — Renderização Segura de Markdown, Fórmulas, Tabelas e Streaming", () => {
  it("renderiza títulos, negrito, itálico, listas, tabelas responsivas e fórmulas sem expor ### ou **", () => {
    const sample = [
      "### Conclusão tática",
      "",
      "Texto com **negrito importante**, *ênfase em itálico* e fórmula inline $\\frac{C}{P + B + C}$.",
      "",
      "- Posição fora de posição (SB)",
      "- Stack efetivo de 30 BB",
      "",
      "| Ação | Frequência | EV |",
      "|---|---|---|",
      "| 3-Bet | 100% | — |",
      "| Fold | 0% | — |",
      "",
      "$$",
      "MDF = \\frac{P}{P + B}",
      "$$",
    ].join("\n");

    const html = renderToStaticMarkup(
      createElement(AssistantMarkdown, { content: sample }),
    );
    assert.ok(!html.includes("###"));
    assert.ok(!html.includes("**negrito"));
    assert.match(html, /<h5[^>]*>Conclusão tática<\/h5>/);
    assert.match(html, /<strong[^>]*>negrito importante<\/strong>/);
    assert.match(html, /<em[^>]*>ênfase em itálico<\/em>/);
    assert.match(html, /<ul[^>]*>.*<li[^>]*>Posição fora de posição \(SB\)<\/li>/s);
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /tabular-nums/);
    assert.match(html, /role="math"/);
    assert.equal(latexToReadable("\\frac{C}{P + B + C}"), "C / (P + B + C)");
    assert.ok(html.includes("C / (P + B + C)"));
    assert.ok(html.includes("MDF = P / (P + B)"));
  });

  it("bloqueia links maliciosos (javascript:, data:, vbscript:) e ignora HTML potencialmente perigoso", () => {
    assert.equal(sanitizeAssistantUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeAssistantUrl("java\tscript:alert(1)"), null);
    assert.equal(sanitizeAssistantUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(sanitizeAssistantUrl("vbscript:msgbox(1)"), null);
    assert.equal(sanitizeAssistantUrl("//evil.example/phish"), null);
    assert.equal(sanitizeAssistantUrl("https://example.com/estudo"), "https://example.com/estudo");

    const dangerous = [
      "<script>window.pwned = true;</script>",
      '<img src="x" onerror="alert(1)" />',
      '<iframe src="https://evil.example"></iframe>',
      "[Clique malicioso](javascript:alert('xss'))",
      "[Data URI](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
      "[Link seguro](https://example.com/gto)",
    ].join("\n\n");

    const html = renderToStaticMarkup(
      createElement(AssistantMarkdown, { content: dangerous }),
    );
    assert.ok(!html.includes("<script"));
    assert.ok(!html.includes("<iframe"));
    assert.ok(!html.includes("onerror="));
    assert.ok(!html.includes("javascript:"));
    assert.ok(!html.includes("data:text/html"));
    assert.ok(html.includes("Clique malicioso"));
    assert.match(
      html,
      /<a href="https:\/\/example\.com\/gto" target="_blank" rel="noopener noreferrer nofollow"/,
    );
  });

  it("suporta streaming com Markdown incompleto sem quebrar a interface e produz cópia textual limpa", () => {
    const partialStream = "### Resposta rápida\n\nO **3-Bet com AA é obrigatório";
    const closed = closeIncompleteMarkdown(partialStream);
    assert.ok(!closed.endsWith("**"));
    const streamHtml = renderToStaticMarkup(
      createElement(AssistantMarkdown, { content: partialStream, streaming: true }),
    );
    assert.ok(!streamHtml.includes("###"));
    assert.ok(streamHtml.includes("3-Bet com AA é obrigatório"));

    const clean = markdownToPlainText(
      "### Resposta rápida\n\nDar **fold** com *AA* é um erro.\n\n---\n\n- Ponto 1\n- Ponto 2\n\nFórmula: $\\frac{5}{20} = 25\\%$",
    );
    assert.ok(!clean.includes("###"));
    assert.ok(!clean.includes("**"));
    assert.ok(!clean.includes("---"));
    assert.ok(clean.includes("• Ponto 1"));
    assert.ok(clean.includes("5 / 20 = 25%"));
  });
});

describe("TheNerdEinsten — Estrutura de Resposta, JSON Parcial/Inválido, Paredes de Texto e Estado Vazio/Carregando", () => {
  it("organiza respostas longas em Resposta rápida, O que importa e seções recolhíveis sem descartar conteúdo", () => {
    const longAnswer = [
      "## Resposta rápida",
      "Com AA no SB contra abertura do HJ a 30 BB, a ação do chart é 3-Bet (100%). Dar fold perde todo o valor do topo absoluto do range.",
      "",
      "## O que importa nesta mão",
      "- Posição: SB joga fora de posição pós-flop, incentivando 3-bet de tamanho polar/linear.",
      "- Stack efetivo: 30 BB permite construir pote imediato contra o range do HJ.",
      "- Bloqueadores: AA bloqueia as melhores mãos de continuação do vilão, mas tem equidade esmagadora.",
      "",
      "## Entenda o motivo",
      Array.from(
        { length: 8 },
        (_, i) =>
          `Parágrafo detalhado ${i + 1}: explicação aprofundada sobre realização de equidade, construção de range e resposta a 4-bet em torneios MTT.`,
      ).join("\n\n"),
      "",
      "## Ver a matemática",
      "A equidade mínima contra um shove segue $$\\frac{C}{P + B + C}$$.",
      "",
      "## Comparar ranges",
      "O HJ abre um range amplo enquanto o SB concentra 3-bets de valor em pares altos e broadways fortes.",
      "",
      "## Explorar alternativas",
      "O flat call só aparece em stacks mais curtos (20 BB) para manter mãos dominadas em jogo.",
      "",
      "## Limitações",
      "O chart é chipEV e não inclui dados de ICM ou leituras específicas do vilão.",
      "",
      "## Próxima ação",
      "Repita o spot de SB vs HJ em 20 BB e 30 BB para comparar a transição entre Call e 3-Bet.",
    ].join("\n");

    const parsed = parseAssistantResponse(longAnswer);
    assert.equal(parsed.kind, "structured");
    assert.ok(parsed.mainWordCount <= 180, `mainWordCount=${parsed.mainWordCount}`);
    assert.equal(parsed.deep.length, 4);
    assert.deepEqual(
      parsed.deep.map((s) => s.title),
      ["Entenda o motivo", "Ver a matemática", "Comparar ranges", "Explorar alternativas"],
    );

    // Na renderização inicial, as seções aprofundadas ficam recolhidas (sem parede de texto),
    // mas os botões de controle e todo o conteúdo permanecem acessíveis na cópia limpa.
    const cardHtml = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: longAnswer,
        provider: "openai",
        model: "gpt-oss-20b",
        sourcesUsed: ["Ranges MTT 8-Max"],
      }),
    );
    assert.ok(cardHtml.includes("Resposta rápida"));
    assert.ok(cardHtml.includes("O que importa nesta mão"));
    assert.ok(cardHtml.includes("Entenda o motivo"));
    assert.ok(cardHtml.includes("Ver a matemática"));
    assert.ok(cardHtml.includes("Comparar ranges"));
    assert.ok(cardHtml.includes("Explorar alternativas"));
    assert.ok(cardHtml.includes("Ver a fonte (1)"));
    assert.ok(cardHtml.includes("Expandir explicação"));
    assert.ok(cardHtml.includes("Copiar resposta"));
    assert.ok(!cardHtml.includes("Parágrafo detalhado 8"));

    const fullPlain = parsedToPlainText(parsed, longAnswer);
    assert.ok(fullPlain.includes("Parágrafo detalhado 8"));
  });

  it("valida JSON estruturado válido e trata JSON parcialmente inválido com mensagem segura e recuperação", () => {
    const validJson = JSON.stringify({
      resumo: "3-Bet é a ação padrão com AA em 30 BB.",
      contexto: "SB vs HJ, 30 BB efetivos.",
      fatores: ["Posição fora de posição", "Topo absoluto do range"],
      calculos: [{ descricao: "Frequência no chart", valor: "100% 3-Bet" }],
      explicacao: "Fora de posição com 30 BB, AA constrói o pote imediatamente.",
      sugestoes: ["Repetir o spot em 20 BB"],
      limitacoes: ["Chart sem EV de solver"],
    });
    const validated = validateStructuredAnalysis(JSON.parse(validJson));
    assert.equal(validated.ok, true);
    const parsedValid = parseAssistantResponse(validJson);
    assert.equal(parsedValid.kind, "json");
    assert.equal(parsedValid.warnings.length, 0);

    const brokenJson = '{"resumo": "Dar fold com AA é um erro grave em 30 BB.", "explicacao": "Texto truncado sem fechar chave...';
    const parsedBroken = parseAssistantResponse(brokenJson);
    assert.equal(parsedBroken.kind, "invalid_json");
    assert.ok(parsedBroken.warnings.length > 0);
    assert.ok(parsedBroken.quick.includes("Dar fold com AA é um erro grave"));
    assert.ok(parsedBroken.recoverable?.includes("Texto truncado"));

    const brokenHtml = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: brokenJson,
        provider: "openai",
        model: "gpt-oss-20b",
      }),
    );
    assert.ok(brokenHtml.includes("Visualizar conteúdo bruto recuperável"));
    assert.ok(brokenHtml.includes("Dar fold com AA é um erro grave"));
  });

  it("trata resposta vazia e estados de configuração/carregamento na visão principal", () => {
    const emptyParsed = parseAssistantResponse("   ");
    assert.equal(emptyParsed.kind, "empty");
    const emptyHtml = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: "",
        provider: "gemini",
        model: "gemini-2.5-flash",
      }),
    );
    assert.ok(emptyHtml.includes("O provedor não retornou texto na conclusão principal."));

    const viewHtml = renderToStaticMarkup(
      createElement(AiCoachView, {
        provider: "openai",
        providers: PROVIDER_IDS,
        configs: { openai: { ...emptyProviderConfig(), model: "gpt-oss-20b" } },
        onProviderChange: () => {},
        onModelChange: () => {},
        totalChunks: 322,
        videos: [{ title: "Aula 3bet", category: "Pré-Flop", relativePath: "pre/3bet.mp4", sizeMb: 120 }],
        onOpenSettings: () => {},
        canonicalSpots,
      }),
    );
    assert.ok(viewHtml.includes("TheNerdEinsten"));
    assert.ok(viewHtml.includes("Assistente de estudos de poker — MTT"));
    assert.ok(viewHtml.includes("Provedor: OpenAI | Modelo: gpt-oss-20b"));
    assert.ok(viewHtml.includes("Perguntar ao TheNerdEinsten"));
    assert.ok(viewHtml.includes("Configurar TheNerdEinsten"));
  });
});

describe("TheNerdEinsten — Qualidade Epistêmica, Cenário AA no SB vs HJ 30 BB e Cálculos Determinísticos", () => {
  it("avalia AA no SB vs HJ com 30 BB usando o chart real (IMPORTED_CHART_NO_EV) e sinaliza contradições da IA", () => {
    const question = "Dei fold com AA no SB contra abertura do HJ com 30 BB. Foi certo?";
    const parsedQ = parseHandQuestion(question);
    assert.equal(parsedQ.handClass, "AA");
    assert.equal(parsedQ.heroPosition, "SB");
    assert.equal(parsedQ.villainPosition, "HJ");
    assert.equal(parsedQ.stackBb, 30);
    assert.equal(parsedQ.action, "Fold");

    const evidence = resolveEvidenceForQuestion(question, canonicalSpots);
    assert.ok(evidence);
    const spot30SbHj = canonicalSpots.find((s) => s.spotId === "30bb_sb_vs_hj_rfi")!;
    const directEvidence = buildSpotEvidence({
      spot: spot30SbHj,
      handClass: "AA",
      chosenAction: "Fold",
    });
    assert.equal(directEvidence.decision.level, "severe_deviation");
    assert.equal(evidence.kind, "CHART_NO_EV");
    assert.equal(evidence.evAvailable, false);
    assert.equal(evidence.chosenAction, "Fold");
    assert.equal(evidence.chosenActionFrequency, 0);
    assert.deepEqual(evidence.preferredActions, ["3-Bet"]);
    assert.equal(evidence.decision.level, "severe_deviation");
    assert.ok(
      evidence.decision.headline.includes(
        "Dar fold com AA nessa situação parece uma decisão muito ruim nas condições usuais.",
      ),
    );

    // Se uma IA mal calibrada tentar justificar o fold ou inventar EV/frequências:
    const badAiReply = [
      "### Resposta rápida",
      "Dar fold com AA pode ser justificável perto da bolha com ICM extremo.",
      "- 3-Bet: 85% (+4.2 bb de EV)",
      "- Fold: 5% (0 bb)",
    ].join("\n");

    const divergences = detectDivergences(badAiReply, evidence);
    const kinds = new Set(divergences.map((d) => d.kind));
    assert.ok(kinds.has("ev_unverified"), "Deve detectar EV inventado em chart sem EV");
    assert.ok(kinds.has("frequency_mismatch"), "Deve detectar frequência divergente do chart");
    assert.ok(kinds.has("justifies_rejected_action"), "Deve detectar justificativa de ação 0%");
    assert.ok(kinds.has("unprovided_context"), "Deve detectar suposição de ICM/bolha não informada");

    const html = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: badAiReply,
        provider: "openai",
        model: "gpt-oss-20b",
        questionText: question,
        evidence,
      }),
    );
    assert.ok(html.includes("Divergência detectada — prevalecem os dados verificáveis do aplicativo"));
    assert.ok(html.includes("Chart importado sem EV"));
    assert.ok(html.includes("Interpretação didática da IA"));
    assert.ok(
      html.includes("Dar fold com AA nessa situação parece uma decisão muito ruim nas condições usuais."),
    );
  });

  it("testa AA no SB vs HJ com 30 BB sem spot carregado (UNSOLVED) sem forçar frequência ou EV inexistente", () => {
    const question = "Dei fold com AA no SB contra abertura do HJ com 30 BB. Foi certo?";
    const unsolvedEvidence = resolveEvidenceForQuestion(question, []);
    assert.ok(unsolvedEvidence);
    assert.equal(unsolvedEvidence.kind, "INSUFFICIENT_DATA");
    assert.equal(unsolvedEvidence.handFrequencies, null);
    assert.equal(unsolvedEvidence.handEv, null);
    assert.equal(unsolvedEvidence.evAvailable, false);
    assert.equal(unsolvedEvidence.decision.level, "severe_deviation");
    assert.equal(
      unsolvedEvidence.decision.headline,
      "Dar fold com AA nessa situação parece uma decisão muito ruim nas condições usuais.",
    );
    assert.equal(
      unsolvedEvidence.decision.detail,
      "Vou verificar quais informações temos antes de apresentar uma conclusão estratégica.",
    );

    const promptBlock = formatSpotContextForPrompt({
      spotName: unsolvedEvidence.spotName,
      stackBb: 30,
      heroPosition: "SB",
      villainPosition: "HJ",
      handClass: "AA",
      chosenAction: "Fold",
      strategyStatus: "UNSOLVED",
      evAvailable: false,
      decisionLevel: "severe_deviation",
    });
    assert.ok(promptBlock.includes("Frequências da referência: indisponíveis. Não cite frequências numéricas."));
    assert.ok(promptBlock.includes("EV: indisponível nesta referência. Não cite valores de EV."));

    const html = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: "## Resposta rápida\nDar fold com AA em 30 BB contra abertura do HJ é uma decisão muito ruim nas condições usuais; não há referência carregada neste cenário, portanto nenhum EV ou frequência numérica foi atribuído.",
        provider: "openai",
        model: "gpt-oss-20b",
        questionText: question,
        evidence: unsolvedEvidence,
      }),
    );
    assert.ok(html.includes("Sem dados suficientes"));
    assert.ok(!html.includes("Frequências da referência para AA"));
  });

  it("calcula pot odds, MDF e fold equity pelas funções matemáticas determinísticas somente quando há dados reais", () => {
    // Pergunta sem valores de pote/aposta não gera cartão de pot odds inventado:
    assert.equal(
      extractPotMathFromQuestion("Dei fold com AA no SB contra abertura do HJ com 30 BB."),
      null,
    );

    // Pergunta com pote = 10 BB e aposta = 5 BB calcula 25% de equidade mínima exata:
    const math = extractPotMathFromQuestion(
      "No river o pote antes da aposta era 10 BB e o vilão fez uma aposta de 5 BB.",
    );
    assert.ok(math);
    assert.equal(math.potBeforeBet, 10);
    assert.equal(math.opposingBet, 5);
    assert.equal(math.callAmount, 5);
    assert.equal(math.potOdds.requiredEquityPct, 25);
    assert.equal(math.mdf?.mdfPct, 66.67);
    assert.equal(math.bluffBreakeven?.requiredFoldEquityPct, 33.33);

    const direct = computeDeterministicPotMath({ potBeforeBet: 10, opposingBet: 5, callAmount: 5 });
    assert.equal(direct?.potOdds.requiredEquityPct, 25);

    const html = renderToStaticMarkup(
      createElement(AssistantResponseCard, {
        text: "## Resposta rápida\nVocê precisa de 25% de equidade no cenário simplificado para pagar.",
        provider: "openai",
        model: "gpt-oss-20b",
        potMath: math,
      }),
    );
    assert.ok(html.includes("Cálculo matemático verificado"));
    assert.ok(html.includes("Pote antes da aposta"));
    assert.ok(html.includes("10 BB"));
    assert.ok(html.includes("5 BB"));
    assert.ok(html.includes("Equidade mínima no cenário simplificado"));
    assert.ok(html.includes("25%"));
  });
});
