import type { AiProvider, AiRequest, AiStreamEvent, ProviderContext } from "../types.ts";
import { normalizeModel, record, records } from "../modelCatalog.ts";
import { assertComplete, boundedJson, providerFetch, readSse, textBlocks, usage } from "./transport.ts";
import { AiError } from "../security.ts";

function headers(apiKey: string) { return { Authorization: `Bearer ${apiKey}`, "anthropic-version": "2026-10-21", "Content-Type": "application/json" }; }
function payload(request: AiRequest, stream: boolean) {
  return { model: request.model, system: request.system, max_tokens: request.maxOutputTokens ?? 4096, stream,
    messages: request.messages.map((message, index) => ({ role: message.role, content: [
      ...(request.image && index === request.messages.length - 1 ? [{ type: "image", source: { type: "base64", media_type: request.image.mime, data: request.image.data } }] : []),
      { type: "text", text: message.content },
    ] })),
  };
}

export const anthropicProvider: AiProvider = {
  id: "anthropic", name: "Claude",
  async listModels(apiKey, context) {
    const data = await boundedJson(await providerFetch("https://api.anthropic.com/v1/models?limit=1000", { headers: headers(apiKey) }, context));
    if (data.has_more) throw new AiError(502, "Lista de modelos muito extensa. Tente novamente mais tarde.");
    return records(data.data).map((model) => normalizeModel("anthropic", model)).filter((model) => model !== null);
  },
  async verifyCredentials(request, context) { return this.send({ ...request, maxOutputTokens: 512 }, context); },
  async send(request, context) {
    const data = await boundedJson(await providerFetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: headers(request.apiKey), body: JSON.stringify(payload(request, false)) }, context));
    const text = textBlocks(data.content); assertComplete(text, data.stop_reason === "end_turn" || data.stop_reason === "stop_sequence");
    return { text, model: request.model, provider: "anthropic", usage: usage(data.usage) };
  },
  async *stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent> {
    const response = await providerFetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: headers(request.apiKey), body: JSON.stringify(payload(request, true)) }, context);
    let text = ""; let complete = false; let reason = ""; let tokens = {};
    for await (const event of readSse(response)) {
      if (event.type === "message_start") tokens = { ...tokens, ...usage(record(event.message).usage) };
      if (event.type === "content_block_delta" && record(event.delta).type === "text_delta") {
        const delta = record(event.delta).text;
        if (typeof delta === "string") { text += delta; yield { type: "delta", text: delta }; }
      }
      if (event.type === "message_delta") { reason = String(record(event.delta).stop_reason ?? ""); tokens = { ...tokens, ...usage(event.usage) }; }
      if (event.type === "message_stop") complete = true;
      if (event.type === "error") throw new AiError(502, "O Claude interrompeu a resposta. O trecho recebido pode estar incompleto.");
    }
    assertComplete(text, complete && ["end_turn", "stop_sequence"].includes(reason)); yield { type: "done", usage: tokens };
  },
};
