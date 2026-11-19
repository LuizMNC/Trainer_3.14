import { createHmac } from "node:crypto";

export class AiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "AiError"; this.status = status; }
}

export const AI_SECURITY_HEADERS = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
export const MAX_AI_BODY_BYTES = 6 * 1024 * 1024;
export const MAX_AI_RESPONSE_BYTES = 8 * 1024 * 1024;
export const AI_TIMEOUT_MS = 55_000;

export function isLoopback(url: URL): boolean { return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); }
export function ollamaEnabled(): boolean { return !process.env.VERCEL && process.env.TREINERLM_OLLAMA_ENABLED === "1"; }

export function assertAiOrigin(req: Request): void {
  const target = new URL(req.url);
  const host = req.headers.get("host");
  if (!host || !/^[A-Za-z0-9.[\]:-]+$/.test(host)) throw new AiError(403, "Host da requisição inválido.");
  let address: URL;
  try { address = new URL(`${target.protocol}//${host}`); } catch { throw new AiError(403, "Host da requisição inválido."); }
  const local = isLoopback(target) && isLoopback(address) && target.port === address.port && !process.env.VERCEL;
  if (!local && target.host !== address.host) throw new AiError(403, "Host da requisição não autorizado.");
  const source = req.headers.get("origin");
  if (req.headers.get("x-poker-coach") !== "local-v1" || (req.method !== "GET" && !source) || source === "null") throw new AiError(403, "Origem da requisição não autorizada.");
  let origin: URL;
  try { origin = new URL(source ?? address.origin); } catch { throw new AiError(403, "Origem inválida."); }
  if ((source && origin.origin !== source) || origin.origin !== address.origin || req.headers.get("sec-fetch-site") === "cross-site") throw new AiError(403, "Origem da requisição não autorizada.");
  if (local && ["http:", "https:"].includes(target.protocol)) return;
  if (target.protocol !== "https:" || origin.protocol !== "https:") throw new AiError(403, "HTTPS é obrigatório para usar IA no site público.");
  const allowed = new Set(["https://trainer-3-14.vercel.app"]);
  for (const value of [process.env.TREINERLM_PUBLIC_ORIGIN, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined]) {
    if (!value) continue;
    try { const parsed = new URL(value); if (parsed.protocol === "https:" && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash) allowed.add(parsed.origin); } catch { /* Invalid owner configuration grants no extra origins. */ }
  }
  if (!allowed.has(origin.origin)) throw new AiError(403, "Origem pública não autorizada pelo proprietário.");
}

/** Never expose upstream error messages, stack traces, headers, URLs or payloads to clients. */
export function publicAiError(error: unknown): { status: number; error: string } {
  if (error instanceof AiError) return { status: error.status, error: error.message };
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return { status: 408, error: "Consulta cancelada ou tempo de resposta excedido. Tente novamente por ação explícita." };
  return { status: 502, error: "Falha de rede ou resposta inválida do provedor. Verifique a conexão e tente novamente." };
}

export function upstreamStatus(status: number): AiError {
  if (status === 401 || status === 403) return new AiError(401, "Chave inválida ou sem permissão para este recurso no provedor.");
  if (status === 404) return new AiError(400, "Modelo indisponível ou sem acesso. Atualize a lista e escolha um modelo.");
  if (status === 429 || status === 402) return new AiError(429, "Quota, saldo ou limite do provedor atingido. Consulte sua conta.");
  if (status === 400 || status === 422) return new AiError(400, "O provedor recusou os parâmetros ou o conteúdo para este modelo. Confira o modelo e as capacidades.");
  return new AiError(502, "O provedor está indisponível ou retornou uma resposta inesperada.");
}

const localWindows = new Map<string, { since: number; count: number }>();

export async function enforceAiRateLimit(req: Request, fetcher: typeof fetch = fetch): Promise<void> {
  const local = isLoopback(new URL(req.url)) && !process.env.VERCEL;
  if (local) {
    const now = Date.now();
    const key = "local-computer";
    const entry = localWindows.get(key);
    const current = !entry || now - entry.since >= 60_000 ? { since: now, count: 0 } : entry;
    current.count += 1;
    localWindows.set(key, current);
    if (current.count > 20) throw new AiError(429, "Limite temporário do TheNerdEinsten: 20 consultas por minuto. Aguarde um minuto.");
    return;
  }
  // Public deployments require a shared atomic counter. Instance memory is not a serverless limit.
  const endpoint = process.env.TREINERLM_AI_REDIS_REST_URL;
  const token = process.env.TREINERLM_AI_REDIS_REST_TOKEN;
  const secret = process.env.TREINERLM_AI_RATE_SECRET;
  if (!endpoint || !token || !secret || secret.length < 32) throw new AiError(503, "O proprietário precisa configurar o controle de abuso compartilhado para habilitar a IA neste site.");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new AiError(503, "Controle de abuso temporariamente indisponível."); }
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new AiError(503, "Controle de abuso temporariamente indisponível.");
  // Vercel overwrites x-vercel-forwarded-for. Other public hosts share one conservative bucket.
  const address = process.env.VERCEL ? req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ?? "unknown" : "public-host";
  const identity = createHmac("sha256", secret).update(address).digest("hex");
  const bucket = Math.floor(Date.now() / 60_000);
  const script = "local a=redis.call('INCR',KEYS[1]); if a==1 then redis.call('EXPIRE',KEYS[1],120) end; local b=redis.call('INCR',KEYS[2]); if b==1 then redis.call('EXPIRE',KEYS[2],120) end; return {a,b}";
  try {
    const response = await fetcher(url, { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.any([req.signal, AbortSignal.timeout(4000)]), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(["EVAL", script, "2", `treinerlm:ai:${bucket}:${identity}`, `treinerlm:ai:${bucket}:global`]) });
    if (!response.ok) throw new Error("counter unavailable");
    const value: unknown = await response.json();
    const result = value && typeof value === "object" && "result" in value ? value.result : null;
    if (!Array.isArray(result) || result.length !== 2 || result.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 1)) throw new Error("counter invalid");
    if (result[0] > 20 || result[1] > 200) throw new AiError(429, "Limite temporário do TheNerdEinsten atingido. Aguarde um minuto.");
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError(503, "Controle de abuso temporariamente indisponível. Nenhuma consulta foi enviada ao provedor.");
  }
}

export function clearLocalAiRateLimitForTests(): void { localWindows.clear(); }
