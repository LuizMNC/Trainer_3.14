import type { AiModel, ProviderId } from "./types.ts";

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  gemini: "Gemini", openai: "OpenAI", anthropic: "Claude", deepseek: "DeepSeek",
  groq: "Groq", openrouter: "OpenRouter", mistral: "Mistral", ollama: "Ollama local",
};
export const PROVIDER_IDS = Object.keys(PROVIDER_NAMES) as ProviderId[];
export type StorageMode = "session" | "local";
export interface ProviderConfig {
  apiKey: string;
  model: string;
  models: AiModel[];
  storage: StorageMode;
  testedModel?: string;
}
export type ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>;
export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const PREFIX = "treinerlm_ai_provider_v1_";
export const ACTIVE_PROVIDER_KEY = "treinerlm_ai_active_provider_v1";

export function emptyProviderConfig(): ProviderConfig {
  return { apiKey: "", model: "", models: [], storage: "session" };
}

function decodeConfig(raw: string | null, provider: ProviderId, storage: StorageMode): ProviderConfig | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.apiKey !== "string" || typeof parsed.model !== "string") return undefined;
    const models: AiModel[] = Array.isArray(parsed.models) ? parsed.models.filter((m: AiModel) =>
      m && m.provider === provider && typeof m.id === "string" && typeof m.name === "string" &&
      m.text === true && typeof m.images === "boolean" && typeof m.streaming === "boolean") : [];
    // Uma chave lembrada precisa de novo teste ao abrir outra sessão.
    return { apiKey: parsed.apiKey, model: parsed.model, models, storage,
      testedModel: storage === "session" && parsed.testedModel === parsed.model ? parsed.model : undefined };
  } catch { return undefined; }
}

export function loadProviderConfigs(session: BrowserStorage, local: BrowserStorage): ProviderConfigs {
  // O formato antigo salvava Gemini permanentemente sem consentimento explícito.
  local.removeItem("projeto_poker_gemini_key_v1");
  local.removeItem("projeto_poker_gemini_model_v1");
  const configs: ProviderConfigs = {};
  for (const provider of PROVIDER_IDS) {
    const key = PREFIX + provider;
    const config = decodeConfig(session.getItem(key), provider, "session") ?? decodeConfig(local.getItem(key), provider, "local");
    if (config) configs[provider] = config;
  }
  return configs;
}

export function persistProviderConfig(provider: ProviderId, config: ProviderConfig, session: BrowserStorage, local: BrowserStorage): void {
  const key = PREFIX + provider;
  const value = JSON.stringify(config);
  // Remove primeiro a cópia na outra duração, para não ressuscitar uma chave antiga.
  (config.storage === "local" ? session : local).removeItem(key);
  (config.storage === "local" ? local : session).setItem(key, value);
}

export function removeProviderConfig(provider: ProviderId, session: BrowserStorage, local: BrowserStorage): void {
  session.removeItem(PREFIX + provider);
  local.removeItem(PREFIX + provider);
}

export function isConfigTested(config: ProviderConfig | undefined, localProvider = false): boolean {
  return Boolean(config?.model && config.testedModel === config.model && (localProvider || config.apiKey.trim()));
}
