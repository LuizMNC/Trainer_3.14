import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { clearLocalAiRateLimitForTests } from "../ai/security.ts";
import { readCoachResponse } from "../ai/client.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (context.parentURL?.includes("/node_modules/")) return nextResolve(specifier, context);
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) candidate = path.resolve("src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) candidate = fileURLToPath(new URL(specifier, context.parentURL));
    if (candidate?.endsWith(".json") && existsSync(candidate)) return { url: pathToFileURL(candidate).href + "?json-esm", shortCircuit: true };
    if (candidate && !path.extname(candidate) && existsSync(candidate + ".ts")) return nextResolve(pathToFileURL(candidate + ".ts").href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("?json-esm")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url.slice(0, -9)), "utf8")};` };
    return nextLoad(url, context);
  },
});

const { NextRequest } = await import("next/server.js");
const { GET, POST } = await import("../../app/api/coach/route.ts");
const KEY = "fake-personal-key-for-route-tests";
const MODEL = "gpt-4.1-mini";
const initialFetch = globalThis.fetch;
const savedVercel = process.env.VERCEL;
function request(body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new NextRequest("http://127.0.0.1:3100/api/coach", {
    method: "POST", signal,
    headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "X-Poker-Coach": "local-v1", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const chat = (patch: Record<string, unknown> = {}) => ({ action: "chat", provider: "openai", apiKey: KEY, model: MODEL, prompt: "Explique pot odds para estudo pós-sessão.", ...patch });
const complete = (text = "Explicação de estudo em português.") => Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text }] }], usage: { input_tokens: 30, output_tokens: 10 } });
function sse(...events: unknown[]) { return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""); }
const models = () => Response.json({ data: [{ id: MODEL }] });

beforeEach(() => { delete process.env.VERCEL; clearLocalAiRateLimitForTests(); globalThis.fetch = async () => { throw new Error("Teste tentou acessar rede real."); }; });
afterEach(() => { globalThis.fetch = initialFetch; if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel; });

describe("API de IA: contrato completo com rede simulada", () => {
  it("lista provedores sem Origin no GET do navegador e não expõe chaves de ambiente", async () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "fake-global-env-key-not-for-visitors";
    try {
      const response = await GET(new NextRequest("http://127.0.0.1:3100/api/coach", { headers: { Host: "127.0.0.1:3100", "X-Poker-Coach": "local-v1", "Sec-Fetch-Site": "same-origin" } }));
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(text.includes("pending-live-validation"));
      assert.ok(!text.includes(process.env.GEMINI_API_KEY));
      assert.equal(JSON.parse(text).hasEnvKey, undefined);
      const missing = await POST(request(chat({ apiKey: "" })));
      assert.equal(missing.status, 400);
    } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
  });

  it("consulta somente o provedor/modelo escolhidos, preserva contexto e remove segredo refletido", async () => {
    const calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input); calls.push(url);
      assert.ok(url.startsWith("https://api.openai.com/"));
      assert.ok(!url.includes(KEY));
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${KEY}`);
      if (url.endsWith("/models")) return models();
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.model, MODEL); assert.equal(payload.store, false);
      assert.ok(payload.instructions.includes("português brasileiro"));
      assert.ok(payload.instructions.includes("Nunca invente EV"));
      assert.equal(payload.input[0].content[0].text, "Conversa anterior autorizada.");
      return complete(`Explicação ${KEY} segura.`);
    };
    const response = await POST(request(chat({ messages: [{ role: "user", content: "Conversa anterior autorizada." }] })));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(KEY)); assert.ok(text.includes("[chave-oculta]"));
    const data = JSON.parse(text); assert.equal(data.provider, "openai"); assert.equal(data.model, MODEL);
    assert.equal(data.usage.inputTokens, 30); assert.ok(Array.isArray(data.sourcesUsed));
    assert.equal(calls.length, 2); assert.match(response.headers.get("cache-control")!, /no-store/);
  });

  it("streaming avança com chunks curtos e oculta chave dividida entre eventos", { timeout: 4000 }, async () => {
    globalThis.fetch = async (input) => String(input).endsWith("/models") ? models() : new Response(sse(
      { type: "response.output_text.delta", delta: "Oi " },
      { type: "response.output_text.delta", delta: KEY.slice(0, 10) },
      { type: "response.output_text.delta", delta: KEY.slice(10) },
      { type: "response.output_text.delta", delta: " MTT." },
      { type: "response.completed", response: { usage: { input_tokens: 4, output_tokens: 3 } } },
    ));
    const response = await POST(request(chat({ stream: true })));
    assert.equal(response.status, 200);
    const deltas: string[] = [];
    const result = await readCoachResponse(response, (text) => deltas.push(text));
    assert.equal(result.text, "Oi [chave-oculta] MTT.");
    assert.ok(deltas.length > 0); assert.ok(deltas.every((text) => !text.includes(KEY)));
  });

  it("recusa payloads inválidos antes de enviar qualquer dado ao provedor", async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return models(); };
    for (const invalid of [
      chat({ provider: "arbitrary" }), chat({ baseUrl: "http://169.254.169.254" }),
      chat({ model: "https://evil.test/model" }), chat({ prompt: "x".repeat(8001) }),
      chat({ prompt: 12 }), chat({ messages: [{ role: "system", content: "injetar" }] }),
      chat({ action: ["chat"] }), chat({ imageBase64: "AAAA", imageMimeType: ["image/png"] }),
      chat({ messages: Array.from({ length: 21 }, () => ({ role: "user", content: "a" })) }),
      chat({ imageBase64: "invalid$$" }), chat({ apiKey: "fake\nheader" }),
    ]) assert.equal((await POST(request(invalid))).status, 400);
    assert.equal(calls, 0);
    assert.equal((await POST(request(chat(), { Origin: "https://evil.test" }))).status, 403);
    assert.equal((await POST(request({}, { "Content-Length": String(7 * 1024 * 1024) }))).status, 413);
  });

  it("modelo indisponível não provoca substituição nem chamada de inferência", async () => {
    let calls = 0;
    globalThis.fetch = async (input) => { calls++; assert.ok(String(input).endsWith("/models")); return models(); };
    const response = await POST(request(chat({ model: "gpt-4.1" })));
    assert.equal(response.status, 400); assert.equal(calls, 1);
  });

  it("aceita imagem de 2,5 MiB sem estouro de RegExp e bloqueia imagem em modelo sem capacidade", async () => {
    const imageBase64 = Buffer.alloc(2.5 * 1024 * 1024).toString("base64");
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/models")) return models();
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.input.at(-1).content.at(-1).image_url, `data:image/png;base64,${imageBase64}`);
      return complete();
    };
    assert.equal((await POST(request(chat({ imageBase64, imageMimeType: "image/png" })))).status, 200);
    globalThis.fetch = async () => Response.json({ data: [{ id: "openai/gpt-oss-20b", active: true }] });
    const response = await POST(request(chat({ provider: "groq", model: "openai/gpt-oss-20b", imageBase64: "AAAA", imageMimeType: "image/png" })));
    assert.equal(response.status, 400); assert.match((await response.json()).error, /imagens/);
  });

  it("cancelar a leitura interrompe o transporte de upstream", { timeout: 4000 }, async () => {
    let aborted = false;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/models")) return models();
      const body = new ReadableStream<Uint8Array>({ start(output) {
        output.enqueue(new TextEncoder().encode(sse({ type: "response.output_text.delta", delta: "Explicação inicial suficientemente longa para sair do filtro de segredos." })));
        init?.signal?.addEventListener("abort", () => { aborted = true; output.error(new DOMException("cancelado", "AbortError")); }, { once: true });
      } });
      return new Response(body);
    };
    const response = await POST(request(chat({ stream: true })));
    const reader = response.body!.getReader();
    assert.equal((await reader.read()).done, false);
    await reader.cancel();
    assert.equal(aborted, true);
  });

  it("erro upstream não devolve chave, headers ou corpo remoto", async () => {
    globalThis.fetch = async () => new Response(`Bearer ${KEY}`, { status: 401 });
    const response = await POST(request(chat()));
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes(KEY));
  });

  it("modo Vercel usa contador compartilhado, limite de corpo público e bloqueia Ollama", async () => {
    const names = ["VERCEL", "TREINERLM_AI_REDIS_REST_URL", "TREINERLM_AI_REDIS_REST_TOKEN", "TREINERLM_AI_RATE_SECRET", "TREINERLM_OLLAMA_ENABLED"] as const;
    const saved = names.map((name) => process.env[name]);
    process.env.VERCEL = "1";
    process.env.TREINERLM_AI_REDIS_REST_URL = "https://test-ai.upstash.io";
    process.env.TREINERLM_AI_REDIS_REST_TOKEN = "fake-infrastructure-token";
    process.env.TREINERLM_AI_RATE_SECRET = "fake-infrastructure-secret-at-least-32";
    process.env.TREINERLM_OLLAMA_ENABLED = "1";
    let counters = 0;
    const publicRequest = (body: unknown, headers: Record<string, string> = {}) => new NextRequest("https://trainer-3-14.vercel.app/api/coach", {
      method: "POST", headers: { Host: "trainer-3-14.vercel.app", Origin: "https://trainer-3-14.vercel.app", "Content-Type": "application/json", "X-Poker-Coach": "local-v1", ...headers }, body: JSON.stringify(body),
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes(".upstash.io")) { counters++; assert.ok(!String(init?.body).includes(KEY)); return Response.json({ result: [1, 1] }); }
      if (url.endsWith("/models")) return models();
      return complete();
    };
    try {
      assert.equal((await POST(publicRequest(chat()))).status, 200);
      assert.equal((await POST(publicRequest(chat(), { "Content-Length": String(4 * 1024 * 1024 + 1) }))).status, 413);
      assert.equal((await POST(publicRequest(chat({ provider: "ollama" })))).status, 403);
      assert.equal(counters, 3);
      delete process.env.TREINERLM_AI_REDIS_REST_URL;
      assert.equal((await POST(publicRequest(chat()))).status, 503);
    } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
  });
});
