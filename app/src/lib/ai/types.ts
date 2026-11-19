export const PROVIDER_IDS = ["gemini", "openai", "anthropic", "deepseek", "groq", "openrouter", "mistral", "ollama"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface AiModel {
  id: string;
  name: string;
  provider: ProviderId;
  text: boolean;
  images: boolean;
  streaming: boolean;
  limitations?: string[];
  availability?: string;
  contextTokens?: number;
}

export interface AiMessage { role: "user" | "assistant"; content: string }
export interface AiUsage { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number }
export interface AiReply { text: string; model: string; provider: ProviderId; usage?: AiUsage }
export type AiStreamEvent = { type: "delta"; text: string } | { type: "done"; usage?: AiUsage };
export interface AiRequest {
  apiKey: string;
  model: string;
  system: string;
  messages: AiMessage[];
  image?: { data: string; mime: string };
  maxOutputTokens?: number;
}
export interface ProviderContext { signal: AbortSignal; fetcher?: typeof fetch }
export interface AiProvider {
  id: ProviderId;
  name: string;
  localOnly?: boolean;
  listModels(apiKey: string, context: ProviderContext): Promise<AiModel[]>;
  verifyCredentials(request: AiRequest, context: ProviderContext): Promise<AiReply>;
  send(request: AiRequest, context: ProviderContext): Promise<AiReply>;
  stream(request: AiRequest, context: ProviderContext): AsyncGenerator<AiStreamEvent>;
}
