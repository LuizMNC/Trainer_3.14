import type { AiProvider, AiRequest, AiStreamEvent, ProviderContext } from "../types.ts";
import { normalizeModel, record, records } from "../modelCatalog.ts";
import { assertComplete, boundedJson, providerFetch, readSse, usage } from "./transport.ts";
import { AiError } from "../security.ts";

function headers(apiKey: string) { return { "x-goog-api-key": apiKey, "Content-Type": "application/json" }; }
function payload(request: AiRequest) {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.messages.map((message, index) => ({ role: message.role === "assistant" ? "model" : "user", parts: [
      { text: message.content },
      ...(request.image && index === request.messages.length - 1 ? [{ inlineData: { mimeType: request.image.mime, data: request.image.data } }] : []),
    ] })),
    generationConfig: { maxOutputTokens: request.maxOutputTokens ?? 4096 },
  };
}
function result(data: Record<string, unknown>) {
  const candidate = records(data.candidates)[0] ?? {};
  return { text: records(record(candidate.content).parts).filter((part) => part.thought !== true).map((part) => typeof part.text === "string" ? part.text : "").join(""), reason: candidate.finishReason };
}
function endpoint(model: string, stream: boolean) { return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`; }

export const geminiProvider: AiProvider = {
  id: "gemini", name: "Gemini",
  async listModels(apiKey, context) {
    const collected = [];
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
      const data = await boundedJson(await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, { headers: headers(apiKey) }, context));
      collected.push(...records(data.models).map((model) => normalizeModel("gemini", model)).filter((model) => model !== null));
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
      if (!pageToken) return collected;
    }
    throw new AiError(502, "A lista de modelos excedeu o limite de páginas. Tente novamente mais tarde.");
  },
  async verifyCredentials(request, context) { return this.send({ ...request, maxOutputTokens: 512 }, context); },
  async send(request, context) {
    const data = await boundedJson(await providerFetch(endpoint(request.model, false), { method: "POST", headers: headers(request.apiKey), body: JSON.stringify(payload(request)) }, context));
    const answer = result(data); assertComplete(answer.text, answer.reason === "STOP");
    return { text: answer.text, model: request.model, provider: "gemini", usage: usage(data.usageMetadata) };
  },
  async *stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent> {
    const response = await providerFetch(endpoint(request.model, true), { method: "POST", headers: headers(request.apiKey), body: JSON.stringify(payload(request)) }, context);
    let text = ""; let complete = false; let tokens;
    for await (const event of readSse(response)) {
      const answer = result(event);
      if (answer.text) { text += answer.text; yield { type: "delta", text: answer.text }; }
      if (event.usageMetadata) tokens = usage(event.usageMetadata);
      if (answer.reason === "STOP") complete = true;
      else if (answer.reason || event.error || event.promptFeedback) throw new AiError(502, "O Gemini bloqueou ou interrompeu a resposta. O trecho recebido pode estar incompleto.");
    }
    assertComplete(text, complete); yield { type: "done", usage: tokens };
  },
};
