import type { ProviderId } from "./types.ts";

/**
 * Identidade pública do assistente do TreinerLM.
 * O nome representa o assistente, independentemente do provedor/modelo real,
 * que continua sempre identificado como metadado secundário.
 * Nomes técnicos internos (AiCoachView, /api/coach, X-Poker-Coach) são
 * preservados por compatibilidade.
 */
export const ASSISTANT_NAME = "TheNerdEinsten" as const;
export const ASSISTANT_TAGLINE = "Assistente de estudos de poker — MTT";

export const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  gemini: "Gemini", openai: "OpenAI", anthropic: "Claude", deepseek: "DeepSeek",
  groq: "Groq", openrouter: "OpenRouter", mistral: "Mistral", ollama: "Ollama local",
};

export function providerDisplayName(provider: string | undefined | null): string {
  if (!provider) return "não informado";
  return (PROVIDER_DISPLAY_NAMES as Record<string, string>)[provider] ?? provider;
}

/** Ex.: "Provedor: OpenAI | Modelo: gpt-oss-20b". Nunca usa um nome de modelo fixo. */
export function formatProviderModel(provider: string | undefined | null, model: string | undefined | null): string {
  const modelLabel = typeof model === "string" && model.trim() ? model.trim() : "não selecionado";
  return `Provedor: ${providerDisplayName(provider)} | Modelo: ${modelLabel}`;
}
