import type { AiProvider, ProviderId } from "./types.ts";
import { PROVIDER_IDS } from "./types.ts";
import { geminiProvider } from "./providers/gemini.ts";
import { openaiProvider } from "./providers/openai.ts";
import { anthropicProvider } from "./providers/anthropic.ts";
import { deepseekProvider } from "./providers/deepseek.ts";
import { groqProvider } from "./providers/groq.ts";
import { openrouterProvider } from "./providers/openrouter.ts";
import { mistralProvider } from "./providers/mistral.ts";
import { ollamaProvider } from "./providers/ollama.ts";
import { AiError, ollamaEnabled } from "./security.ts";

const registry = { gemini: geminiProvider, openai: openaiProvider, anthropic: anthropicProvider, deepseek: deepseekProvider, groq: groqProvider, openrouter: openrouterProvider, mistral: mistralProvider, ollama: ollamaProvider } satisfies Record<ProviderId, AiProvider>;

export function isProviderId(value: unknown): value is ProviderId { return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value); }
export function getProvider(value: unknown): AiProvider {
  if (!isProviderId(value)) throw new AiError(400, "Selecione um provedor de IA válido.");
  if (value === "ollama" && !ollamaEnabled()) throw new AiError(403, "Ollama exige ativação explícita na instalação local e não está disponível na Vercel.");
  return registry[value];
}
export function listProviders() {
  return PROVIDER_IDS.filter((id) => id !== "ollama" || ollamaEnabled()).map((id) => ({ id, name: registry[id].name, localOnly: id === "ollama", status: "pending-live-validation" as const }));
}
