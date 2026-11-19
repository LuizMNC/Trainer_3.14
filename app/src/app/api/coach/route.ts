import { NextRequest, NextResponse } from "next/server";
import { searchKnowledge, searchVideos } from "@/lib/rag";
import { getProvider, listProviders } from "@/lib/ai/providerRegistry";
import { DISCOVERY_NOTICE, isSafeModelId, record } from "@/lib/ai/modelCatalog";
import { ASSISTANT_SYSTEM_PROMPT, DECISION_LEVELS, formatSpotContextForPrompt, isStrategyStatus } from "@/lib/ai/assistantPrompt";
import { AiError, AI_SECURITY_HEADERS, AI_TIMEOUT_MS, assertAiOrigin, enforceAiRateLimit, isLoopback, MAX_AI_BODY_BYTES, ollamaEnabled, publicAiError } from "@/lib/ai/security";
import type { AiMessage, AiRequest } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { ...AI_SECURITY_HEADERS, ...(status === 429 ? { "Retry-After": "60" } : {}) } }); }

export async function GET(req: NextRequest) {
  try {
    assertAiOrigin(req);
    const localOllamaEnabled = ollamaEnabled() && isLoopback(new URL(req.url));
    return json({ ok: true, providers: listProviders().filter((provider) => !provider.localOnly || localOllamaEnabled), localOllamaEnabled, studyOnly: true, notice: DISCOVERY_NOTICE });
  } catch (error) { const safe = publicAiError(error); return json({ error: safe.error }, safe.status); }
}

async function bodyJson(req: Request, signal: AbortSignal): Promise<Record<string, unknown>> {
  const limit = isLoopback(new URL(req.url)) && !process.env.VERCEL ? MAX_AI_BODY_BYTES : 4 * 1024 * 1024;
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) throw new AiError(413, "Corpo da requisição excede o limite permitido (4 MiB no site público; 6 MiB local).");
  const reader = req.body?.getReader();
  if (!reader) throw new AiError(400, "Envie um objeto JSON válido.");
  const chunks: Uint8Array[] = []; let length = 0;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new AiError(413, "Corpo da requisição excede o limite permitido (4 MiB no site público; 6 MiB local).");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new AiError(400, "Corpo da requisição inválido: UTF-8 ou JSON malformado."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiError(400, "Corpo da requisição inválido: esperado objeto JSON.");
    return value as Record<string, unknown>;
  } finally { signal.removeEventListener("abort", onAbort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

const FIELDS = new Set(["action", "provider", "apiKey", "model", "prompt", "messages", "imageBase64", "imageMimeType", "stream", "spotContext", "previousInteractionId"]);

function validateLegacyContext(body: Record<string, unknown>): void {
  if (body.previousInteractionId !== undefined && body.previousInteractionId !== "" && (typeof body.previousInteractionId !== "string" || body.previousInteractionId.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(body.previousInteractionId))) throw new AiError(400, "Identificador de conversa inválido.");
  if (body.spotContext == null) return;
  if (typeof body.spotContext !== "object" || Array.isArray(body.spotContext) || JSON.stringify(body.spotContext).length > 16_384) throw new AiError(400, "Contexto do exercício inválido ou maior que 16 KB.");
  const spot = record(body.spotContext);
  if (spot.stackBb !== undefined && (typeof spot.stackBb !== "number" || !Number.isFinite(spot.stackBb) || spot.stackBb <= 0 || spot.stackBb > 10_000)) throw new AiError(400, "Stack do exercício inválido.");
  if (spot.rngValue != null && (typeof spot.rngValue !== "number" || !Number.isFinite(spot.rngValue) || spot.rngValue < 0 || spot.rngValue > 100)) throw new AiError(400, "RNG do exercício inválido.");
  if (spot.gtoDistribution !== undefined) {
    if (!spot.gtoDistribution || typeof spot.gtoDistribution !== "object" || Array.isArray(spot.gtoDistribution)) throw new AiError(400, "Distribuição de ações inválida.");
    const entries = Object.entries(spot.gtoDistribution);
    if (entries.length > 16 || entries.some(([key, value]) => key.length > 100 || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) throw new AiError(400, "Frequência inválida na distribuição de ações.");
  }
  if (spot.strategyStatus !== undefined && !isStrategyStatus(spot.strategyStatus)) throw new AiError(400, "Status da referência estratégico inválido.");
  if (spot.evAvailable !== undefined && typeof spot.evAvailable !== "boolean") throw new AiError(400, "Indicador de EV inválido.");
  if (spot.chosenActionFrequency != null && (typeof spot.chosenActionFrequency !== "number" || !Number.isFinite(spot.chosenActionFrequency) || spot.chosenActionFrequency < 0 || spot.chosenActionFrequency > 1)) throw new AiError(400, "Frequência da ação escolhida inválida.");
  if (spot.decisionLevel !== undefined && (typeof spot.decisionLevel !== "string" || !(DECISION_LEVELS as readonly string[]).includes(spot.decisionLevel))) throw new AiError(400, "Nível de avaliação da decisão inválido.");
  if (spot.missingData !== undefined && (!Array.isArray(spot.missingData) || spot.missingData.length > 12 || spot.missingData.some((item) => typeof item !== "string" || item.length > 300))) throw new AiError(400, "Lista de dados ausentes inválida.");
}

function messages(body: Record<string, unknown>): AiMessage[] {
  if (body.messages === undefined) return [];
  if (!Array.isArray(body.messages) || body.messages.length > 20) throw new AiError(400, "Envie no máximo 20 mensagens anteriores por consulta.");
  let total = 0;
  return body.messages.map((item) => {
    const value = record(item);
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string" || !value.content.trim() || value.content.length > 8000 || Object.keys(value).some((key) => !["role", "content"].includes(key))) throw new AiError(400, "Histórico inválido: use mensagens de usuário/assistente com até 8.000 caracteres.");
    total += value.content.length;
    if (total > 32_000) throw new AiError(400, "O histórico excede 32.000 caracteres. Inicie uma nova conversa.");
    return { role: value.role, content: value.content };
  });
}

function image(body: Record<string, unknown>): AiRequest["image"] {
  if (body.imageBase64 === undefined || body.imageBase64 === "") return undefined;
  const data = body.imageBase64;
  const mime = body.imageMimeType ?? "image/png";
  // Evitar repetição de grupos sobre milhões de caracteres (estouro da pilha de RegExp).
  if (typeof data !== "string" || data.length > 5_600_000 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || typeof mime !== "string" || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) throw new AiError(400, "Imagem inválida. Use PNG, JPEG, WEBP ou GIF dentro do limite permitido.");
  return { data, mime };
}

const SYSTEM = ASSISTANT_SYSTEM_PROMPT;

/** Hold back a key-length suffix so even a reflected secret split across stream chunks is removed. */
function secretFilter(secret: string) {
  let buffer = "";
  return (delta: string, final = false) => {
    buffer += delta;
    if (!secret) { const all = buffer; buffer = ""; return all; }
    buffer = buffer.split(secret).join("[chave-oculta]");
    const length = final ? buffer.length : Math.max(0, buffer.length - secret.length + 1);
    const output = buffer.slice(0, length); buffer = buffer.slice(length); return output;
  };
}

export async function POST(req: NextRequest) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const signal = AbortSignal.any([req.signal, controller.signal]);
  try {
    assertAiOrigin(req);
    timeout = setTimeout(() => controller.abort(new DOMException("Tempo excedido", "TimeoutError")), AI_TIMEOUT_MS);
    await enforceAiRateLimit(req);
    const body = await bodyJson(req, signal);
    if (Object.keys(body).some((field) => !FIELDS.has(field))) throw new AiError(400, "A requisição contém campos não permitidos.");
    validateLegacyContext(body);
    const previous = messages(body);
    const attachedImage = image(body);
    const action = body.action ?? "chat";
    if (typeof action !== "string" || !["models", "test", "chat"].includes(action)) throw new AiError(400, "Operação de IA inválida.");
    if (body.stream !== undefined && typeof body.stream !== "boolean") throw new AiError(400, "Opção de streaming inválida.");
    const provider = getProvider(body.provider);
    if (provider.localOnly && !isLoopback(new URL(req.url))) throw new AiError(403, "Ollama só pode ser usado pelo servidor da instalação local.");
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if ((!provider.localOnly && !apiKey) || apiKey.length > 1024 || /[\x00-\x20\x7f]/.test(apiKey)) throw new AiError(400, "Informe a chave pessoal do provedor selecionado nas configurações.");
    if (action !== "models" && !isSafeModelId(body.model)) throw new AiError(400, "Selecione um ID de modelo válido da lista do provedor.");
    if (body.prompt !== undefined && typeof body.prompt !== "string") throw new AiError(400, "Pergunta inválida: envie um texto.");
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length > 8000) throw new AiError(400, "Pergunta excede o limite de 8.000 caracteres.");
    if (action === "chat" && !prompt && !attachedImage) throw new AiError(400, "Envie uma pergunta ou imagem para revisão pós-sessão.");
    const context = { signal };
    const availableModels = await provider.listModels(apiKey, context);
    if (action === "models") return json({ models: availableModels, notice: DISCOVERY_NOTICE, provider: provider.id });
    const model = availableModels.find((candidate) => candidate.id === body.model);
    if (!model) throw new AiError(400, "Modelo indisponível, incompatível com chat ou sem acesso. Atualize a lista de modelos.");
    if (attachedImage && !model.images) throw new AiError(400, "O modelo selecionado não tem suporte confirmado a imagens. Escolha outro modelo explicitamente ou remova a imagem.");
    const knowledgeHits = action === "chat" ? searchKnowledge(prompt, 4) : [];
    const videoHits = action === "chat" ? searchVideos(prompt, 3) : [];
    const userText = action === "test" ? "Responda somente: Conexão OK." : [
      body.spotContext ? formatSpotContextForPrompt(record(body.spotContext)) : "",
      knowledgeHits.length ? `Trechos didáticos da biblioteca do aplicativo:\n${knowledgeHits.map((hit, index) => `[Fonte ${index + 1}: ${hit.source}]\n${hit.text}`).join("\n\n")}` : "",
      `Pergunta do aluno:\n${prompt || "Explique esta imagem para revisão pós-sessão."}`,
    ].filter(Boolean).join("\n\n---\n\n");
    const request: AiRequest = { apiKey, model: model.id, system: SYSTEM, messages: [...(action === "test" ? [] : previous), { role: "user", content: userText }], image: action === "chat" ? attachedImage : undefined };
    const metadata = { model: model.id, provider: provider.id, sourcesUsed: knowledgeHits.map((hit) => hit.source), relatedVideos: videoHits };
    if (action === "chat" && body.stream === true && model.streaming) {
      const filter = secretFilter(apiKey);
      const iterator = provider.stream(request, context);
      const encoder = new TextEncoder();
      const activeTimeout = timeout;
      timeout = undefined;
      let stopped = false;
      const stream = new ReadableStream<Uint8Array>({
        async pull(output) {
          if (stopped) return;
          try {
            // O filtro pode reter um chunk inteiro; continuar lendo até produzir saída.
            while (!stopped) {
              const next = await iterator.next();
              if (stopped) return;
              if (next.done) throw new AiError(502, "Resposta interrompida antes da conclusão. O trecho recebido pode estar incompleto.");
              if (next.value.type === "delta") {
                const text = filter(next.value.text);
                if (!text) continue;
                output.enqueue(encoder.encode(JSON.stringify({ type: "delta", text }) + "\n"));
                return;
              }
              const remaining = filter("", true);
              if (remaining) output.enqueue(encoder.encode(JSON.stringify({ type: "delta", text: remaining }) + "\n"));
              output.enqueue(encoder.encode(JSON.stringify({ type: "done", ...metadata, usage: next.value.usage }) + "\n"));
              stopped = true; output.close(); clearTimeout(activeTimeout); await iterator.return(undefined);
            }
          } catch (error) {
            if (stopped) return;
            const safe = publicAiError(error);
            output.enqueue(encoder.encode(JSON.stringify({ type: "error", error: safe.error }) + "\n"));
            stopped = true; output.close(); clearTimeout(activeTimeout); controller.abort();
          }
        },
        async cancel() { stopped = true; controller.abort(); clearTimeout(activeTimeout); await iterator.return(undefined); },
      });
      return new Response(stream, { headers: { ...AI_SECURITY_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" } });
    }
    const answer = action === "test" ? await provider.verifyCredentials(request, context) : await provider.send(request, context);
    const text = apiKey ? answer.text.split(apiKey).join("[chave-oculta]") : answer.text;
    return json({ ...answer, text, ...metadata, ...(action === "test" ? { ok: true } : {}) });
  } catch (error) {
    const safe = publicAiError(error); return json({ error: safe.error }, safe.status);
  } finally { if (timeout) clearTimeout(timeout); }
}
