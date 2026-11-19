import type { AiProvider, AiRequest, AiStreamEvent, ProviderContext } from "../types.ts";
import { isRemoteOllamaModel, isSafeModelId, normalizeModel, record, records } from "../modelCatalog.ts";
import { assertComplete, boundedJson, providerFetch, readLines, usage } from "./transport.ts";
import { AiError } from "../security.ts";

function payload(request: AiRequest, stream: boolean) {
  if (isRemoteOllamaModel({ id: request.model })) throw new AiError(403, "Ollama local aceita somente modelos locais. Modelos cloud não estão habilitados.");
  return { model: request.model, stream, options: { num_predict: request.maxOutputTokens ?? 4096 }, messages: [ { role: "system", content: request.system }, ...request.messages.map((message, index) => ({ ...message, ...(request.image && index === request.messages.length - 1 ? { images: [request.image.data] } : {}) })) ] };
}

export const ollamaProvider: AiProvider = {
  id: "ollama", name: "Ollama local", localOnly: true,
  async listModels(_apiKey, context) {
    const data = await boundedJson(await providerFetch("http://127.0.0.1:11434/api/tags", {}, context));
    const models = [];
    // Fixed local endpoint and bounded discovery. Never download or pull models automatically.
    for (const item of records(data.models).filter((entry) => !isRemoteOllamaModel(entry)).slice(0, 32)) {
      if (!isSafeModelId(item.name)) continue;
      const info = await boundedJson(await providerFetch("http://127.0.0.1:11434/api/show", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: item.name }) }, context));
      if (isRemoteOllamaModel(info)) continue;
      const model = normalizeModel("ollama", { ...info, id: item.name, name: item.name });
      if (model) models.push(model);
    }
    return models;
  },
  async verifyCredentials(request, context) { return this.send({ ...request, maxOutputTokens: 512 }, context); },
  async send(request, context) {
    const data = await boundedJson(await providerFetch("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(request, false)) }, context));
    const text = typeof record(data.message).content === "string" ? record(data.message).content as string : "";
    assertComplete(text, data.done === true && (!data.done_reason || data.done_reason === "stop"));
    return { text, model: request.model, provider: "ollama", usage: usage(data) };
  },
  async *stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent> {
    const response = await providerFetch("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(request, true)) }, context);
    let text = ""; let complete = false; let tokens;
    for await (const line of readLines(response)) {
      if (!line.trim()) continue;
      const event = record(JSON.parse(line));
      const delta = record(event.message).content;
      if (typeof delta === "string") { text += delta; yield { type: "delta", text: delta }; }
      if (event.done === true) { complete = !event.done_reason || event.done_reason === "stop"; tokens = usage(event); }
    }
    assertComplete(text, complete); yield { type: "done", usage: tokens };
  },
};
