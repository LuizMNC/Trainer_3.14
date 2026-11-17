import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { searchKnowledge, searchVideos } from "@/lib/rag";
import {
  assertCoachAccess,
  limitedBody,
  PayloadTooLargeError,
} from "@/lib/server/libraryAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const MAX_COACH_BODY_BYTES = 6 * 1024 * 1024; // 6 MiB físico (texto + print)
const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_BASE64_CHARS = 5_600_000;
const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const COACH_RATE_WINDOW_MS = 60_000;
const COACH_RATE_LIMIT = 20;
const recentPostTimestamps: number[] = [];

function checkCoachRateLimit(now = Date.now()): boolean {
  while (
    recentPostTimestamps.length > 0 &&
    now - recentPostTimestamps[0] > COACH_RATE_WINDOW_MS
  ) {
    recentPostTimestamps.shift();
  }
  if (recentPostTimestamps.length >= COACH_RATE_LIMIT) {
    return false;
  }
  recentPostTimestamps.push(now);
  return true;
}

const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-4-argon",
  "gemini-4-carbon",
]);

export async function GET(req: NextRequest) {
  try {
    assertCoachAccess(req);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Acesso recusado." },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  const hasEnvKey = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim(),
  );
  return NextResponse.json(
    {
      ok: true,
      hasEnvKey,
      studyOnly: true,
      defaultModel: "gemini-3.8-flash",
      availableModels: Array.from(ALLOWED_MODELS),
    },
    { headers: SECURITY_HEADERS },
  );
}

interface CoachRequestBody {
  prompt: string;
  model?: string;
  apiKey?: string;
  previousInteractionId?: string;
  imageBase64?: string;
  imageMimeType?: string;
  spotContext?: {
    spotName?: string;
    stackBb?: number;
    heroPosition?: string;
    villainPosition?: string | null;
    spotType?: string;
    handClass?: string;
    cardsText?: string;
    chosenAction?: string;
    gtoDistribution?: Record<string, number>;
    rngValue?: number | null;
  };
}

export async function POST(req: NextRequest) {
  try {
    assertCoachAccess(req);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Acesso recusado." },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  if (!checkCoachRateLimit()) {
    return NextResponse.json(
      {
        error:
          "Limite temporário de consultas ao AI Coach atingido (máx. 20 por minuto). Aguarde alguns segundos.",
      },
      { status: 429, headers: SECURITY_HEADERS },
    );
  }

  try {
    const rawBytes = await limitedBody(req, MAX_COACH_BODY_BYTES);
    let parsed: unknown;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
      parsed = JSON.parse(decoded);
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisição inválido: UTF-8 ou JSON malformado." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Corpo da requisição inválido: esperado objeto JSON." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }
    const body = parsed as CoachRequestBody;

    if (body.previousInteractionId !== undefined && body.previousInteractionId !== "") {
      if (
        typeof body.previousInteractionId !== "string" ||
        body.previousInteractionId.length > 160 ||
        !/^[A-Za-z0-9._:-]+$/.test(body.previousInteractionId)
      ) {
        return NextResponse.json(
          { error: "Identificador previousInteractionId inválido." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
    }

    if (body.spotContext !== undefined && body.spotContext !== null) {
      if (typeof body.spotContext !== "object" || Array.isArray(body.spotContext)) {
        return NextResponse.json(
          { error: "Campo spotContext inválido: esperado objeto JSON." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      const spotJsonLen = JSON.stringify(body.spotContext).length;
      if (spotJsonLen > 16_384) {
        return NextResponse.json(
          { error: "Campo spotContext excede o limite de 16 KB." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      if (
        body.spotContext.stackBb !== undefined &&
        (typeof body.spotContext.stackBb !== "number" ||
          !Number.isFinite(body.spotContext.stackBb) ||
          body.spotContext.stackBb <= 0 ||
          body.spotContext.stackBb > 10_000)
      ) {
        return NextResponse.json(
          { error: "Campo spotContext.stackBb inválido." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      if (
        body.spotContext.rngValue !== undefined &&
        body.spotContext.rngValue !== null &&
        (typeof body.spotContext.rngValue !== "number" ||
          !Number.isFinite(body.spotContext.rngValue) ||
          body.spotContext.rngValue < 0 ||
          body.spotContext.rngValue > 100)
      ) {
        return NextResponse.json(
          { error: "Campo spotContext.rngValue inválido." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      if (body.spotContext.gtoDistribution !== undefined) {
        if (
          !body.spotContext.gtoDistribution ||
          typeof body.spotContext.gtoDistribution !== "object" ||
          Array.isArray(body.spotContext.gtoDistribution)
        ) {
          return NextResponse.json(
            { error: "Campo spotContext.gtoDistribution inválido." },
            { status: 400, headers: SECURITY_HEADERS },
          );
        }
        const entries = Object.entries(body.spotContext.gtoDistribution);
        if (entries.length > 16) {
          return NextResponse.json(
            { error: "Campo spotContext.gtoDistribution excede 16 ações." },
            { status: 400, headers: SECURITY_HEADERS },
          );
        }
        for (const [, p] of entries) {
          if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) {
            return NextResponse.json(
              { error: "Frequência inválida em spotContext.gtoDistribution." },
              { status: 400, headers: SECURITY_HEADERS },
            );
          }
        }
      }
    }

    const apiKey =
      (typeof body.apiKey === "string" ? body.apiKey.trim() : "") ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Nenhuma chave da API do Google AI Studio configurada. Adicione GEMINI_API_KEY no arquivo .env.local ou informe sua chave nas Configurações (ícone de engrenagem).",
        },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    const cleanPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const hasImage = typeof body.imageBase64 === "string" && body.imageBase64.length > 0;

    if (!cleanPrompt && !hasImage) {
      return NextResponse.json(
        { error: "Envie uma pergunta ou uma imagem para análise." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    if (cleanPrompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json(
        { error: `Pergunta excede o limite de ${MAX_PROMPT_CHARS} caracteres.` },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    if (hasImage) {
      if ((body.imageBase64?.length ?? 0) > MAX_IMAGE_BASE64_CHARS) {
        return NextResponse.json(
          { error: "Imagem anexada excede o limite permitido." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(body.imageBase64 ?? "")) {
        return NextResponse.json(
          { error: "Codificação base64 da imagem inválida." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
      const mime = body.imageMimeType || "image/png";
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        return NextResponse.json(
          { error: "Formato de imagem não suportado. Use PNG, JPEG, WEBP ou GIF." },
          { status: 400, headers: SECURITY_HEADERS },
        );
      }
    }

    const model =
      body.model && ALLOWED_MODELS.has(body.model) ? body.model : "gemini-3.8-flash";

    // Busca contexto real nos PDFs e livros da pasta Projeto-Poker
    const ragQuery = [
      cleanPrompt,
      body.spotContext?.spotName ?? "",
      body.spotContext?.heroPosition ?? "",
      body.spotContext?.villainPosition ?? "",
      body.spotContext?.spotType ?? "",
    ]
      .join(" ")
      .trim();

    const knowledgeHits = searchKnowledge(ragQuery, 4);
    const videoHits = searchVideos(ragQuery, 3);

    const knowledgeBlock =
      knowledgeHits.length > 0
        ? knowledgeHits
            .map((k, i) => `[Fonte ${i + 1}: ${k.source}]\n${k.text}`)
            .join("\n\n")
        : "Sem trechos específicos encontrados no índice local.";

    const videoBlock =
      videoHits.length > 0
        ? videoHits.map((v) => `- ${v.title} (${v.relativePath})`).join("\n")
        : "";

    let spotSummary = "";
    if (body.spotContext) {
      const s = body.spotContext;
      const distText = s.gtoDistribution
        ? Object.entries(s.gtoDistribution)
            .sort((a, b) => b[1] - a[1])
            .map(([act, p]) => `${act}: ${Math.round(p * 100)}%`)
            .join(" | ")
        : "";
      spotSummary = [
        `SPOT ATUAL DO TRAINER:`,
        `- Cenário: ${s.spotName ?? "N/A"} (Stack: ${s.stackBb ?? "?"}BB)`,
        `- Herói: ${s.heroPosition ?? "?"}${s.villainPosition ? ` vs Vilão: ${s.villainPosition}` : ""}`,
        s.handClass ? `- Mão: ${s.cardsText ?? s.handClass} (${s.handClass})` : "",
        s.chosenAction ? `- Decisão do Aluno: ${s.chosenAction}` : "",
        distText ? `- Estratégia GTO Real do Solver: ${distText}` : "",
        s.rngValue != null ? `- RNG Sorteado: ${s.rngValue}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    const systemInstruction = `Você é um Coach Profissional de Poker GTO e Explorativo focado em torneios MTT (em Português do Brasil), exclusivo para ESTUDO OFFLINE e REVISÃO PÓS-SESSÃO.
Suas explicações devem ser didáticas, objetivas e matematicamente rigorosas.
REGRAS FUNDAMENTAIS:
1. Recuse qualquer pedido de assistência em tempo real (RTA) durante mesas ou torneios ativos; oriente exclusivamente para estudo e revisão.
2. Quando receber a "Estratégia GTO Real do Solver", NUNCA contradiga ou invente frequências diferentes — use-as como verdade absoluta e explique o PORQUÊ teórico por trás daquela frequência (ex: bloqueadores, realizabilidade de equidade, posição IP/OOP, pot odds, MDF, pressão de ICM/PKO em MTT, SPR ou construção de range polarizado/linear).
3. Quando citar conceitos teóricos, apoie-se estritamente nos trechos do material de estudo fornecidos abaixo e NÃO invente livros ou fontes ausentes.
4. Estruture a resposta com títulos curtos, bullets objetivos e uma conclusão prática aplicável ao estudo de MTT.`;

    const fullUserText = [
      spotSummary,
      `TRECHOS DO MATERIAL DE ESTUDO DO ALUNO (Projeto-Poker):\n${knowledgeBlock}`,
      videoBlock ? `AULAS EM VÍDEO RELACIONADAS NA PASTA:\n${videoBlock}` : "",
      `PERGUNTA / PEDIDO DO ALUNO:\n${cleanPrompt || "Analise esta imagem de poker para revisão pós-sessão de MTT e explique os conceitos envolvidos."}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const ai = new GoogleGenAI({ apiKey });

    const inputPayload = hasImage
      ? [
          { type: "text" as const, text: fullUserText },
          {
            type: "image" as const,
            data: body.imageBase64!,
            mime_type: body.imageMimeType || "image/png",
          },
        ]
      : fullUserText;

    const interaction = await ai.interactions.create({
      model,
      input: inputPayload,
      system_instruction: systemInstruction,
      ...(typeof body.previousInteractionId === "string" && body.previousInteractionId
        ? { previous_interaction_id: body.previousInteractionId }
        : {}),
    });

    const text =
      interaction.output_text ||
      "Não foi possível extrair resposta textual do modelo.";

    return NextResponse.json(
      {
        text,
        interactionId: interaction.id,
        model,
        sourcesUsed: knowledgeHits.map((k) => k.source),
        relatedVideos: videoHits,
      },
      { headers: SECURITY_HEADERS },
    );
  } catch (err: unknown) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: "Corpo da requisição excede o limite máximo de 6 MiB." },
        { status: 413, headers: SECURITY_HEADERS },
      );
    }
    const rawMsg =
      err instanceof Error ? err.message : "Erro ao consultar a API do Google AI Studio.";
    const safeMsg = rawMsg
      .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[chave-oculta]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [chave-oculta]")
      .replace(/(?:api[_-]?key|x-goog-api-key)[=:\s]+[^\s,;]+/gi, "apiKey=[chave-oculta]");
    return NextResponse.json(
      { error: safeMsg },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}
