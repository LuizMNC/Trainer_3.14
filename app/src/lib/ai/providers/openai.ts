import type { AiProvider, AiRequest, AiStreamEvent, ProviderContext } from "../types.ts";
import { normalizeModel, record, records } from "../modelCatalog.ts";
import { assertComplete, boundedJson, imageUrl, jsonHeaders, providerFetch, readSse, textBlocks, usage } from "./transport.ts";
import { AiError } from "../security.ts";

function payload(request: AiRequest, stream: boolean) {
  return {
    model: request.model, instructions: request.system, store: false, stream,
    max_output_tokens: request.maxOutputTokens ?? 4096,
    input: request.messages.map((message, index) => ({ role: message.role,
      content: message.role === "user" ? [
        { type: "input_text", text: message.content },
        ...(request.image && index === request.messages.length - 1 ? [{ type: "input_image", image_url: imageUrl(request), detail: "auto" }] : []),
      ] : [{ type: "output_text", text: message.content }],
    })),
  };
}

export const openaiProvider: AiProvider = {
  id: "openai", name: "OpenAI",
  async listModels(apiKey, context) {
    const data = await boundedJson(await providerFetch("https://api.openai.com/v1/models", { headers: jsonHeaders(apiKey) }, context));
    return records(data.data).map((model) => normalizeModel("openai", model)).filter((model) => model !== null);
  },
  async verifyCredentials(request, context) { return this.send({ ...request, maxOutputTokens: 512 }, context); },
  async send(request, context) {
    const data = await boundedJson(await providerFetch("https://api.openai.com/v1/responses", { method: "POST", headers: jsonHeaders(request.apiKey), body: JSON.stringify(payload(request, false)) }, context));
    const text = records(data.output).map((item) => textBlocks(item.content)).join("");
    assertComplete(text, data.status === "completed");
    return { text, model: request.model, provider: "openai", usage: usage(data.usage) };
  },
  async *stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent> {
    const response = await providerFetch("https://api.openai.com/v1/responses", { method: "POST", headers: jsonHeaders(request.apiKey), body: JSON.stringify(payload(request, true)) }, context);
    let complete = false; let text = ""; let tokens;
    for await (const event of readSse(response)) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") { text += event.delta; yield { type: "delta", text: event.delta }; }
      if (event.type === "response.completed") { complete = true; tokens = usage(record(event.response).usage); }
      if (["response.failed", "response.incomplete", "error"].includes(String(event.type))) throw new AiError(502, "O provedor interrompeu a resposta ou atingiu o limite de saída. O trecho recebido pode estar incompleto.");
    }
    assertComplete(text, complete); yield { type: "done", usage: tokens };
  },
};
