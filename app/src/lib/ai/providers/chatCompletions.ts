import type { AiProvider, AiRequest, AiStreamEvent, ProviderContext, ProviderId } from "../types.ts";
import { normalizeModel, record, records } from "../modelCatalog.ts";
import { assertComplete, boundedJson, imageUrl, jsonHeaders, providerFetch, readSse, usage } from "./transport.ts";
import { AiError } from "../security.ts";

interface ChatAdapterConfig { id: ProviderId; name: string; modelsUrl: string; chatUrl: string }

/** Only the wire format is shared. Endpoints, discovery and parameter differences remain explicit. */
export function createChatCompletionsProvider(config: ChatAdapterConfig): AiProvider {
  function payload(request: AiRequest, stream: boolean) {
    return {
      model: request.model, stream,
      // Groq migrated reasoning models to max_completion_tokens; other APIs use max_tokens.
      ...(config.id === "groq" ? { max_completion_tokens: request.maxOutputTokens ?? 4096 } : { max_tokens: request.maxOutputTokens ?? 4096 }),
      ...(config.id === "openrouter" ? { provider: { allow_fallbacks: false }, route: undefined } : {}),
      messages: [ { role: "system", content: request.system }, ...request.messages.map((message, index) => ({ role: message.role,
        content: request.image && index === request.messages.length - 1 ? [ { type: "text", text: message.content }, { type: "image_url", image_url: { url: imageUrl(request) } } ] : message.content,
      })) ],
    };
  }
  return {
    id: config.id, name: config.name,
    async listModels(apiKey, context) {
      const data = await boundedJson(await providerFetch(config.modelsUrl, { headers: jsonHeaders(apiKey) }, context));
      return records(data.data).map((model) => normalizeModel(config.id, model)).filter((model) => model !== null);
    },
    async verifyCredentials(request, context) { return this.send({ ...request, maxOutputTokens: 512 }, context); },
    async send(request, context) {
      const data = await boundedJson(await providerFetch(config.chatUrl, { method: "POST", headers: jsonHeaders(request.apiKey), body: JSON.stringify(payload(request, false)) }, context));
      const choice = records(data.choices)[0] ?? {};
      const content = record(choice.message).content;
      const text = typeof content === "string" ? content : "";
      assertComplete(text, choice.finish_reason === "stop");
      return { text, model: request.model, provider: config.id, usage: usage(data.usage ?? record(data.x_groq).usage) };
    },
    async *stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent> {
      const response = await providerFetch(config.chatUrl, { method: "POST", headers: jsonHeaders(request.apiKey), body: JSON.stringify(payload(request, true)) }, context);
      let text = ""; let finish = false; let transportDone = false; let tokens;
      for await (const event of readSse(response)) {
        if (event.error) throw new AiError(502, "O provedor interrompeu a resposta. O trecho recebido pode estar incompleto.");
        if (event.type === "transport.done") transportDone = true;
        const choice = records(event.choices)[0] ?? {};
        const delta = record(choice.delta).content;
        if (typeof delta === "string") { text += delta; yield { type: "delta", text: delta }; }
        if (choice.finish_reason === "stop") finish = true;
        else if (choice.finish_reason) throw new AiError(502, "O provedor atingiu um limite ou bloqueou a resposta. O trecho recebido pode estar incompleto.");
        if (event.usage || record(event.x_groq).usage) tokens = usage(event.usage ?? record(event.x_groq).usage);
      }
      assertComplete(text, finish && transportDone); yield { type: "done", usage: tokens };
    },
  };
}
