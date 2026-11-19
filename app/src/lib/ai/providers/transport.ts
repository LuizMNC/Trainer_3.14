import { AiError, MAX_AI_RESPONSE_BYTES, ollamaEnabled, upstreamStatus } from "../security.ts";
import { finite, record, records } from "../modelCatalog.ts";
import type { AiRequest, AiUsage, ProviderContext } from "../types.ts";

const ORIGINS = new Set(["https://generativelanguage.googleapis.com", "https://api.openai.com", "https://api.anthropic.com", "https://api.deepseek.com", "https://api.groq.com", "https://openrouter.ai", "https://api.mistral.ai"]);

export async function providerFetch(url: string, init: RequestInit, context: ProviderContext): Promise<Response> {
  const target = new URL(url);
  if ((!ORIGINS.has(target.origin) && !(ollamaEnabled() && target.origin === "http://127.0.0.1:11434")) || target.username || target.password) throw new AiError(403, "Destino do provedor não autorizado.");
  const response = await (context.fetcher ?? fetch)(url, { ...init, signal: context.signal, redirect: "error", cache: "no-store" });
  if (!response.ok) { await response.body?.cancel(); throw upstreamStatus(response.status); }
  return response;
}

export async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  let text = "";
  for await (const line of readLines(response)) text += line;
  try { return record(JSON.parse(text)); } catch { throw new AiError(502, "O provedor retornou dados inválidos."); }
}

export async function* readLines(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AiError(502, "O provedor retornou uma resposta vazia.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_AI_RESPONSE_BYTES) throw new AiError(502, "A resposta excedeu o limite de segurança.");
      pending += decoder.decode(part.value, { stream: true });
      let cut: number;
      while ((cut = pending.indexOf("\n")) !== -1) { yield pending.slice(0, cut).replace(/\r$/, ""); pending = pending.slice(cut + 1); }
    }
    pending += decoder.decode();
    if (pending) yield pending;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* readSse(response: Response): AsyncGenerator<Record<string, unknown>> {
  let data: string[] = [];
  for await (const line of readLines(response)) {
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    else if (line === "" && data.length) {
      const joined = data.join("\n"); data = [];
      if (joined === "[DONE]") { yield { type: "transport.done" }; continue; }
      try { yield record(JSON.parse(joined)); } catch { throw new AiError(502, "Fluxo de resposta inválido do provedor."); }
    }
  }
  if (data.length) throw new AiError(502, "Resposta interrompida antes da conclusão. O trecho recebido pode estar incompleto.");
}

export function usage(value: unknown): AiUsage | undefined {
  const source = record(value);
  const output: AiUsage = {
    inputTokens: finite(source.input_tokens ?? source.prompt_tokens ?? source.promptTokenCount ?? source.prompt_eval_count),
    outputTokens: finite(source.output_tokens ?? source.completion_tokens ?? source.candidatesTokenCount ?? source.eval_count),
    totalTokens: finite(source.total_tokens ?? source.totalTokenCount), costUsd: finite(source.cost),
  };
  // Deltas de consumo podem trazer apenas output: não apagar input já recebido.
  const defined = Object.fromEntries(Object.entries(output).filter(([, value]) => value !== undefined));
  return Object.keys(defined).length ? defined : undefined;
}

export function textBlocks(value: unknown): string { return records(value).filter((v) => v.type === "text" || v.type === "output_text").map((v) => typeof v.text === "string" ? v.text : "").join(""); }
export function assertComplete(text: string, complete: boolean): void { if (!complete || !text.trim()) throw new AiError(502, "Resposta vazia, bloqueada ou interrompida antes da conclusão. O trecho recebido pode estar incompleto."); }
export function imageUrl(request: AiRequest): string | undefined { return request.image ? `data:${request.image.mime};base64,${request.image.data}` : undefined; }
export function jsonHeaders(apiKey: string): Record<string, string> { return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }; }
