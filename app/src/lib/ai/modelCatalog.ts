import type { AiModel, ProviderId } from "./types.ts";

/** Capability sources reviewed 2026-11-17. IDs are ALWAYS intersected with live discovery.
 * Unknown image capabilities stay disabled; there is deliberately no guessed fallback model.
 */
export const MODEL_DOCUMENTATION = {
  gemini: "https://ai.google.dev/api/models",
  openai: "https://developers.openai.com/api/docs/models",
  anthropic: "https://platform.claude.com/docs/en/api/models/list",
  deepseek: "https://api-docs.deepseek.com/api/list-models/",
  groq: "https://console.groq.com/docs/models",
  openrouter: "https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties",
  mistral: "https://docs.mistral.ai/api/endpoint/models",
  ollama: "https://docs.ollama.com/api/tags",
} satisfies Record<ProviderId, string>;

export const DISCOVERY_NOTICE = "Modelos consultados no provedor. A listagem não garante quota nem permissão de inferência; teste a conexão com o modelo escolhido. Imagens ficam desativadas quando a capacidade não é confirmada. Nenhum provedor foi homologado com chave real nesta instalação.";

/** Conversational IDs explicitly documented by the Responses schema/model pages.
 * https://developers.openai.com/api/reference/resources/responses/methods/create
 * Retired o1/o3-mini, chat-only, research, coding and media models are excluded.
 * Dated snapshots are accepted only when returned by authenticated discovery.
 */
const OPENAI_RESPONSES_MODELS = new Set([
  "gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-sol", "gpt-6-luna",
  "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano",
  "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano",
  "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini",
]);

// Hosted Gemma 4 explicitly supports systemInstruction; legacy Gemma uses only user/model turns.
// https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
const GEMMA_HOSTED_CHAT_MODELS = new Set(["gemma-4-31b-it", "gemma-4-26b-a4b-it"]);

export function isSafeModelId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(id) && !id.includes("..") && !id.includes("://");
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
export function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }
export function finite(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }

/** The local Ollama endpoint can proxy cloud inference. Keep those entries out of local mode,
 * including aliases identified by metadata rather than by their displayed name.
 * https://docs.ollama.com/cloud/models
 * https://github.com/ollama/ollama/blob/main/api/types.go (ListModelResponse / ShowResponse)
 */
export function isRemoteOllamaModel(raw: Record<string, unknown>): boolean {
  return [raw.id, raw.name, raw.model].some((value) => typeof value === "string" && /(?:^|[:/_-])cloud(?:$|[:/_-])/i.test(value)) ||
    [raw.remote_model, raw.remote_host].some((value) => value !== undefined && value !== null && value !== "");
}

export function normalizeModel(provider: ProviderId, raw: Record<string, unknown>): AiModel | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw.name === "string" ? raw.name.replace(/^models\//, "") : "";
  if (!isSafeModelId(id)) return null;
  const capabilities = record(raw.capabilities);
  const architecture = record(raw.architecture);
  const input = strings(raw.input_modalities ?? architecture.input_modalities);
  const output = strings(raw.output_modalities ?? architecture.output_modalities);
  let text = false;
  let images = input.includes("image");
  switch (provider) {
    case "gemini":
      text = strings(raw.supportedGenerationMethods).includes("generateContent") && (id.startsWith("gemini-") || GEMMA_HOSTED_CHAT_MODELS.has(id)) && !/(image|tts|audio|robotics|computer-use|embedding)/i.test(id);
      // Gemini's model list does not expose modalities. Restrict vision to the documented Flash model.
      images = id === "gemini-3.8-flash" || id === "gemini-2.5-flash" || id === "gemini-2.5-pro";
      break;
    case "openai":
      text = OPENAI_RESPONSES_MODELS.has(id.replace(/-\d{4}-\d{2}-\d{2}$/, ""));
      images = text;
      break;
    case "anthropic":
      text = id.startsWith("claude-") && raw.lifecycle !== "retired" && raw.lifecycle !== "deprecated";
      // Official vision guide explicitly lists all current Claude models / Messages API.
      images = true;
      break;
    case "deepseek":
      text = (output.length ? output.includes("text") : /^deepseek-(chat|reasoner)$/.test(id)) && (!input.length || input.includes("text"));
      break;
    case "groq":
      text = raw.active !== false && /^(llama-|meta-llama\/llama-|openai\/gpt-oss-|qwen\/qwen|moonshotai\/kimi-|gemma|mixtral)/i.test(id) && !/(guard|safeguard|whisper|tts|prompt|orpheus|compound)/i.test(id);
      break;
    case "openrouter":
      text = input.includes("text") && output.includes("text") && (!Array.isArray(raw.endpoints) || strings(raw.endpoints).includes("/api/v1/chat/completions"));
      break;
    case "mistral":
      text = capabilities.completion_chat === true && raw.archived !== true;
      images = capabilities.vision === true;
      break;
    case "ollama":
      text = !isRemoteOllamaModel(raw) && strings(raw.capabilities).includes("completion");
      images = strings(raw.capabilities).includes("vision");
      break;
  }
  if (!text) return null;
  return {
    id, provider, name: typeof raw.displayName === "string" ? raw.displayName : typeof raw.display_name === "string" ? raw.display_name : typeof raw.name === "string" && provider !== "gemini" ? raw.name : id,
    text, images, streaming: true, availability: "descoberto; teste de inferência necessário",
    limitations: images ? [] : ["Envio de imagens desativado: capacidade não confirmada para este modelo."],
    contextTokens: finite(raw.context_length ?? raw.max_context_length ?? raw.inputTokenLimit ?? raw.max_input_tokens ?? raw.context_window),
  };
}
