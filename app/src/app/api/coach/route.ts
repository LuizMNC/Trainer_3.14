import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { searchKnowledge, searchVideos } from "@/lib/rag";

const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-4-argon",
  "gemini-4-carbon",
]);

export async function GET() {
  const hasEnvKey = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim(),
  );
  return NextResponse.json({
    ok: true,
    hasEnvKey,
    defaultModel: "gemini-3.8-flash",
    availableModels: Array.from(ALLOWED_MODELS),
  });
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
    const body = (await req.json()) as CoachRequestBody;
    const apiKey =
      body.apiKey?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Nenhuma chave da API do Google AI Studio configurada. Adicione GEMINI_API_KEY no arquivo .env.local ou informe sua chave nas Configurações (ícone de engrenagem).",
        },
        { status: 400 },
      );
    }

    if (!body.prompt?.trim() && !body.imageBase64) {
      return NextResponse.json(
        { error: "Envie uma pergunta ou uma imagem para análise." },
        { status: 400 },
      );
    }

    const model =
      body.model && ALLOWED_MODELS.has(body.model) ? body.model : "gemini-3.8-flash";

    // Busca contexto real nos PDFs e livros da pasta Projeto-Poker
    const ragQuery = [
      body.prompt ?? "",
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

    const systemInstruction = `Você é um Coach Profissional de Poker GTO e Explorativo (em Português do Brasil).
Suas explicações devem ser didáticas, objetivas e matematicamente rigorosas.
REGRAS FUNDAMENTAIS:
1. Quando receber a "Estratégia GTO Real do Solver", NUNCA contradiga ou invente frequências diferentes — use-as como verdade absoluta e explique o PORQUÊ teórico por trás daquela frequência (ex: bloqueadores, realizabilidade de equidade, posição IP/OOP, pot odds, MDF, pressão de ICM, SPR ou construção de range polarizado/linear).
2. Quando citar conceitos teóricos, apoie-se nos trechos do material de estudo do aluno fornecidos abaixo, citando a fonte quando útil.
3. Estruture a resposta com títulos curtos, bullets objetivos e uma conclusão prática aplicável nas mesas.`;

    const fullUserText = [
      spotSummary,
      `TRECHOS DO MATERIAL DE ESTUDO DO ALUNO (Projeto-Poker):\n${knowledgeBlock}`,
      videoBlock ? `AULAS EM VÍDEO RELACIONADAS NA PASTA:\n${videoBlock}` : "",
      `PERGUNTA / PEDIDO DO ALUNO:\n${body.prompt || "Analise esta imagem de poker e explique a melhor estratégia."}`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n");

    const ai = new GoogleGenAI({ apiKey });

    const inputPayload = body.imageBase64
      ? [
          { type: "text" as const, text: fullUserText },
          {
            type: "image" as const,
            data: body.imageBase64,
            mime_type: body.imageMimeType || "image/png",
          },
        ]
      : fullUserText;

    const interaction = await ai.interactions.create({
      model,
      input: inputPayload,
      system_instruction: systemInstruction,
      ...(body.previousInteractionId
        ? { previous_interaction_id: body.previousInteractionId }
        : {}),
    });

    const text =
      interaction.output_text ||
      "Não foi possível extrair resposta textual do modelo.";

    return NextResponse.json({
      text,
      interactionId: interaction.id,
      model,
      sourcesUsed: knowledgeHits.map((k) => k.source),
      relatedVideos: videoHits,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Erro ao consultar a API do Google AI Studio.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
