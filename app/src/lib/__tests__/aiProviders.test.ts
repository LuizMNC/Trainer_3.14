import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getProvider, listProviders } from "../ai/providerRegistry.ts";
import { normalizeModel } from "../ai/modelCatalog.ts";
import { AiError, assertAiOrigin, clearLocalAiRateLimitForTests, enforceAiRateLimit, publicAiError } from "../ai/security.ts";
import { providerFetch } from "../ai/providers/transport.ts";
import type { AiRequest, ProviderId } from "../ai/types.ts";

const TEST_KEY = "personal-test-credential-never-real";
const sse = (...events: unknown[]) => events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join("");
const signal = () => new AbortController().signal;
const request = (model: string, apiKey = TEST_KEY): AiRequest => ({ apiKey, model, system: "Somente estudo pós-sessão em pt-BR.", messages: [{ role: "user", content: "Explique pot odds." }] });

const fixtures: { id: ProviderId; model: string; list: unknown; response: unknown; stream: string; path: string }[] = [
  { id: "gemini", model: "gemini-3.8-flash", path: ":generateContent", list: { models: [{ name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }] }, response: { candidates: [{ content: { parts: [{ text: "Olá" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }, stream: sse({ candidates: [{ content: { parts: [{ text: "Olá" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }) },
  { id: "openai", model: "gpt-4.1-mini", path: "/responses", list: { data: [{ id: "gpt-4.1-mini" }, { id: "text-embedding-3-small" }, { id: "gpt-image-1" }] }, response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Olá" }] }], usage: { input_tokens: 4, output_tokens: 2 } }, stream: sse({ type: "response.output_text.delta", delta: "Olá" }, { type: "response.completed", response: { usage: { input_tokens: 4, output_tokens: 2 } } }) },
  { id: "anthropic", model: "claude-sonnet-4-20250514", path: "/messages", list: { data: [{ id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet", lifecycle: "active" }, { id: "claude-old", lifecycle: "retired" }] }, response: { content: [{ type: "text", text: "Olá" }], stop_reason: "end_turn", usage: { input_tokens: 4, output_tokens: 2 } }, stream: sse({ type: "message_start", message: { usage: { input_tokens: 4 } } }, { type: "content_block_delta", delta: { type: "text_delta", text: "Olá" } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }, { type: "message_stop" }) },
  { id: "deepseek", model: "deepseek-flash", path: "/chat/completions", list: { data: [{ id: "deepseek-flash", input_modalities: ["text", "image"], output_modalities: ["text"] }, { id: "embedding", input_modalities: ["text"], output_modalities: ["embedding"] }] }, response: { choices: [{ message: { content: "Olá" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, stream: sse({ choices: [{ delta: { content: "Olá" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, "[DONE]") },
  { id: "groq", model: "openai/gpt-oss-20b", path: "/chat/completions", list: { data: [{ id: "openai/gpt-oss-20b", active: true }, { id: "whisper-large-v3" }, { id: "openai/gpt-oss-safeguard-20b" }] }, response: { choices: [{ message: { content: "Olá" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, stream: sse({ choices: [{ delta: { content: "Olá" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], x_groq: { usage: { prompt_tokens: 4, completion_tokens: 2 } } }, "[DONE]") },
  { id: "openrouter", model: "openai/gpt-4.1-mini", path: "/chat/completions", list: { data: [{ id: "openai/gpt-4.1-mini", name: "OpenAI GPT", architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, endpoints: ["/api/v1/chat/completions"] }, { id: "image-generator", architecture: { input_modalities: ["text"], output_modalities: ["image"] } }] }, response: { choices: [{ message: { content: "Olá" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2, cost: 0.0001 } }, stream: sse({ choices: [{ delta: { content: "Olá" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, "[DONE]") },
  { id: "mistral", model: "mistral-small-latest", path: "/chat/completions", list: { data: [{ id: "mistral-small-latest", capabilities: { completion_chat: true, vision: true } }, { id: "mistral-embed", capabilities: { completion_chat: false } }] }, response: { choices: [{ message: { content: "Olá" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, stream: sse({ choices: [{ delta: { content: "Olá" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2 } }, "[DONE]") },
  { id: "ollama", model: "installed-local-model:latest", path: "/api/chat", list: { models: [{ name: "installed-local-model:latest" }] }, response: { message: { content: "Olá" }, done: true, done_reason: "stop", prompt_eval_count: 4, eval_count: 2 }, stream: JSON.stringify({ message: { content: "Olá" }, done: false }) + "\n" + JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 4, eval_count: 2 }) + "\n" },
];

describe("adaptadores de IA: testes simulados, sem homologação real", () => {
  for (const fixture of fixtures) {
    it(`${fixture.id}: descobre apenas chat, envia, verifica chave e transmite com parâmetros próprios`, async () => {
      const savedOllama = process.env.TREINERLM_OLLAMA_ENABLED; const savedVercel = process.env.VERCEL;
      process.env.TREINERLM_OLLAMA_ENABLED = "1"; delete process.env.VERCEL;
      const calls: { url: string; init?: RequestInit }[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        const url = String(input); calls.push({ url, init });
        assert.ok(!url.includes(TEST_KEY), "credencial jamais vai na URL");
        assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
        if (/\/models(?:\?|\/user$|$)/.test(url) || url.endsWith("/api/tags")) return Response.json(fixture.list);
        if (url.endsWith("/api/show")) return Response.json({ capabilities: ["completion", "vision"] });
        const payload = JSON.parse(String(init?.body));
        if (fixture.id === "gemini") assert.ok(url.includes(`/models/${fixture.model}:`));
        else assert.equal(payload.model, fixture.model);
        if (payload.stream === true || url.includes("streamGenerateContent")) return new Response(fixture.stream, { headers: { "Content-Type": fixture.id === "ollama" ? "application/x-ndjson" : "text/event-stream" } });
        return Response.json(fixture.response);
      };
      try {
        const provider = getProvider(fixture.id); const context = { signal: signal(), fetcher };
        const models = await provider.listModels(TEST_KEY, context);
        assert.equal(models.length, 1); assert.equal(models[0].id, fixture.model);
        const result = await provider.send(request(fixture.model), context);
        assert.equal(result.text, "Olá"); assert.equal(result.provider, fixture.id); assert.equal(result.usage?.inputTokens, 4);
        assert.equal((await provider.verifyCredentials(request(fixture.model), context)).text, "Olá");
        const events = []; for await (const event of provider.stream(request(fixture.model), context)) events.push(event);
        assert.deepEqual(events.filter((event) => event.type === "delta").map((event) => event.text).join(""), "Olá");
        assert.equal(events.at(-1)?.type, "done");
        const final = events.at(-1);
        assert.ok(final?.type === "done");
        assert.equal(final.usage?.inputTokens, 4);
        assert.equal(final.usage?.outputTokens, 2);
        const chat = calls.find((call) => call.url.includes(fixture.path)); assert.ok(chat);
        const payload = JSON.parse(String(chat.init?.body));
        const headers = new Headers(chat.init?.headers);
        if (fixture.id === "gemini") { assert.equal(headers.get("x-goog-api-key"), TEST_KEY); assert.ok(payload.systemInstruction); assert.ok(payload.contents); }
        else if (fixture.id !== "ollama") assert.equal(headers.get("authorization"), `Bearer ${TEST_KEY}`);
        if (fixture.id === "openai") { assert.equal(payload.store, false); assert.ok(payload.input); assert.equal(payload.messages, undefined); }
        if (fixture.id === "anthropic") { assert.equal(headers.get("anthropic-version"), "2026-10-21"); assert.ok(payload.system); assert.ok(payload.max_tokens); }
        if (fixture.id === "groq") { assert.ok(payload.max_completion_tokens); assert.equal(payload.max_tokens, undefined); }
        if (fixture.id === "openrouter") { assert.equal(payload.provider.allow_fallbacks, false); assert.ok(calls[0].url.endsWith("/models/user")); }
      } finally {
        if (savedOllama === undefined) delete process.env.TREINERLM_OLLAMA_ENABLED; else process.env.TREINERLM_OLLAMA_ENABLED = savedOllama;
        if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
      }
    });
    if (fixture.id !== "ollama") {
      it(`${fixture.id}: recusa chave inválida/quota/modelo sem ecoar erros secretos`, async () => {
        for (const [status, expected] of [[401, 401], [429, 429], [404, 400], [500, 502]]) {
          const fetcher: typeof fetch = async () => new Response(JSON.stringify({ error: TEST_KEY }), { status });
          await assert.rejects(() => getProvider(fixture.id).send(request(fixture.model), { signal: signal(), fetcher }), (error: unknown) => {
            const safe = publicAiError(error); assert.equal(safe.status, expected); assert.ok(!safe.error.includes(TEST_KEY)); return true;
          });
        }
      });
    }
  }
  it("duas credenciais simultâneas não compartilham headers, contexto nem respostas", async () => {
    const seen: string[] = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const auth = new Headers(init?.headers).get("authorization") ?? ""; seen.push(auth);
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: auth.endsWith("visitor-A") ? "A" : "B" }] }] });
    };
    const provider = getProvider("openai");
    const replies = await Promise.all([provider.send(request("gpt-4.1-mini", "visitor-A"), { signal: signal(), fetcher }), provider.send(request("gpt-4.1-mini", "visitor-B"), { signal: signal(), fetcher })]);
    assert.deepEqual(seen.sort(), ["Bearer visitor-A", "Bearer visitor-B"]); assert.deepEqual(replies.map((reply) => reply.text), ["A", "B"]);
  });
  it("respostas incompletas e streams sem conclusão são recusados", async () => {
    const provider = getProvider("openai");
    await assert.rejects(() => provider.send(request("gpt-4.1-mini"), { signal: signal(), fetcher: async () => Response.json({ status: "incomplete", output: [{ content: [{ type: "output_text", text: "parcial" }] }] }) }), /interrompida/);
    const stream = provider.stream(request("gpt-4.1-mini"), { signal: signal(), fetcher: async () => new Response(sse({ type: "response.output_text.delta", delta: "parcial" })) });
    await assert.rejects(async () => { for await (const event of stream) void event; }, /interrompida/);
  });
  it("cancelamento propaga o signal ao transporte e erro de rede é sanitizado", async () => {
    const abort = new AbortController();
    const fetcher: typeof fetch = async (_input, init) => { assert.equal(init?.signal, abort.signal); abort.abort(); throw new DOMException("Segredo " + TEST_KEY, "AbortError"); };
    await assert.rejects(() => getProvider("openai").send(request("gpt-4.1-mini"), { signal: abort.signal, fetcher }), (error: unknown) => { const safe = publicAiError(error); assert.equal(safe.status, 408); assert.ok(!safe.error.includes(TEST_KEY)); return true; });
    assert.ok(!publicAiError(new Error(TEST_KEY)).error.includes(TEST_KEY));
  });
  it("capacidades desconhecidas desativam imagens e IDs perigosos/modelos especializados são excluídos", () => {
    assert.equal(normalizeModel("openai", { id: "gpt-5.7-new" }), null);
    assert.equal(normalizeModel("openai", { id: "gpt-6-luna" })?.images, true);
    for (const id of ["https://evil.test/model", "../model", "text-embedding-3-small", "gpt-4o-audio-preview", "gpt-5-codex", "gpt-5-chat-latest", "o1-preview", "o3-mini"]) assert.equal(normalizeModel("openai", { id }), null);
  });
  it("Gemini oferece somente Gemma hospedados com systemInstruction documentado, sem aceitar famílias antigas ou desconhecidas", async () => {
    const ids = ["gemini-3.8-flash", "gemma-4-31b-it", "gemma-4-26b-a4b-it", "gemma-3-27b-it", "gemma-2-9b-it", "gemma-4-unknown-it", "gemini-3.1-flash-image"];
    const fetcher: typeof fetch = async () => Response.json({ models: ids.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ["generateContent"] })) });
    const models = await getProvider("gemini").listModels(TEST_KEY, { signal: signal(), fetcher });
    assert.deepEqual(models.map((model) => model.id), ["gemini-3.8-flash", "gemma-4-31b-it", "gemma-4-26b-a4b-it"]);
    for (const id of ids.slice(1, 3)) assert.ok(normalizeModel("gemini", { id, supportedGenerationMethods: ["generateContent"] })?.text);
    assert.equal(normalizeModel("gemini", { id: "gemma-4-31b-it", supportedGenerationMethods: ["embedContent"] }), null);
  });
  it("Ollama omite cloud e aliases remotos em tags/show antes de oferecer inferência", async () => {
    const savedOllama = process.env.TREINERLM_OLLAMA_ENABLED; const savedVercel = process.env.VERCEL;
    process.env.TREINERLM_OLLAMA_ENABLED = "1"; delete process.env.VERCEL;
    const shown: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/api/tags")) return Response.json({ models: [
        { name: "local:latest" }, { name: "gemma4:cloud" }, { name: "gpt-oss:120b-cloud" },
        { name: "friendly-alias", model: "gemma4:cloud" }, { name: "tag-remote-model", remote_model: "gemma4:31b" },
        { name: "tag-remote-host", remote_host: "https://ollama.com" },
        { name: "show-remote-model" }, { name: "show-remote-host" }, { name: "show-redirected-name" },
      ] });
      assert.ok(String(input).endsWith("/api/show"), "nenhuma inferência ou download durante descoberta");
      const model = String(JSON.parse(String(init?.body)).model); shown.push(model);
      if (model === "show-remote-model") return Response.json({ capabilities: ["completion"], remote_model: "gemma4:31b" });
      if (model === "show-remote-host") return Response.json({ capabilities: ["completion"], remote_host: "https://ollama.com" });
      if (model === "show-redirected-name") return Response.json({ capabilities: ["completion"], model: "gemma4:cloud" });
      return Response.json({ capabilities: ["completion", "vision"] });
    };
    try {
      const models = await getProvider("ollama").listModels("", { signal: signal(), fetcher });
      assert.deepEqual(models.map((model) => model.id), ["local:latest"]);
      assert.deepEqual(shown, ["local:latest", "show-remote-model", "show-remote-host", "show-redirected-name"]);
      for (const entry of [{ id: "gemma4:cloud" }, { id: "alias", remote_model: "gemma4:31b" }, { id: "alias", remote_host: "https://ollama.com" }]) assert.equal(normalizeModel("ollama", { ...entry, capabilities: ["completion"] }), null);
    } finally {
      if (savedOllama === undefined) delete process.env.TREINERLM_OLLAMA_ENABLED; else process.env.TREINERLM_OLLAMA_ENABLED = savedOllama;
      if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
    }
  });
  it("Ollama rejeita IDs cloud também nas chamadas diretas send/stream sem executar fetch", async () => {
    const savedOllama = process.env.TREINERLM_OLLAMA_ENABLED; const savedVercel = process.env.VERCEL;
    process.env.TREINERLM_OLLAMA_ENABLED = "1"; delete process.env.VERCEL;
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
    try {
      const provider = getProvider("ollama");
      for (const model of ["gemma4:cloud", "gpt-oss:120b-cloud", "account/cloud/model"]) {
        await assert.rejects(() => provider.send(request(model, ""), { signal: signal(), fetcher }), (error: unknown) => publicAiError(error).status === 403);
        await assert.rejects(async () => { for await (const event of provider.stream(request(model, ""), { signal: signal(), fetcher })) void event; }, (error: unknown) => publicAiError(error).status === 403);
      }
      assert.equal(calls, 0);
    } finally {
      if (savedOllama === undefined) delete process.env.TREINERLM_OLLAMA_ENABLED; else process.env.TREINERLM_OLLAMA_ENABLED = savedOllama;
      if (savedVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = savedVercel;
    }
  });
});

function req(url = "http://127.0.0.1:3000/api/coach", extra: Record<string, string> = {}, method = "POST") { const target = new URL(url); return new Request(url, { method, headers: { Host: target.host, Origin: target.origin, "X-Poker-Coach": "local-v1", ...extra } }); }

describe("segurança de IA e controle de abuso", () => {
  it("aceita público HTTPS autorizado e loopback, inclusive normalização do Next; rejeita CSRF e host forjado", () => {
    assert.doesNotThrow(() => assertAiOrigin(req()));
    assert.doesNotThrow(() => assertAiOrigin(req("http://localhost:3000/api/coach", { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" })));
    assert.doesNotThrow(() => assertAiOrigin(req("https://trainer-3-14.vercel.app/api/coach")));
    const get = req(undefined, {}, "GET"); get.headers.delete("origin"); assert.doesNotThrow(() => assertAiOrigin(get));
    for (const value of [req(undefined, { Origin: "https://evil.test" }), req(undefined, { Host: "evil.test" }), req(undefined, { "X-Poker-Coach": "" }), req(undefined, { "Sec-Fetch-Site": "cross-site" }), req("https://evil.test/api/coach"), req("http://trainer-3-14.vercel.app/api/coach")]) assert.throws(() => assertAiOrigin(value), AiError);
    const missing = req(); missing.headers.delete("origin"); assert.throws(() => assertAiOrigin(missing), AiError);
  });
  it("destinos arbitrários e redirects nunca recebem credenciais", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return Response.json({}); };
    for (const url of ["http://169.254.169.254/latest", "https://evil.test/", "https://api.openai.com.evil.test/", "https://attacker@api.openai.com/v1/models", "http://127.0.0.1:11434/api/chat"]) await assert.rejects(() => providerFetch(url, {}, { signal: signal(), fetcher }), AiError);
    assert.equal(calls, 0);
  });
  it("Ollama exige opt-in e fica oculto/bloqueado na Vercel mesmo com opt-in", () => {
    const prevEnabled = process.env.TREINERLM_OLLAMA_ENABLED; const prevVercel = process.env.VERCEL;
    try {
      delete process.env.TREINERLM_OLLAMA_ENABLED; assert.throws(() => getProvider("ollama"));
      process.env.TREINERLM_OLLAMA_ENABLED = "1"; process.env.VERCEL = "1";
      assert.throws(() => getProvider("ollama")); assert.ok(!listProviders().some((provider) => provider.id === "ollama"));
    } finally { if (prevEnabled === undefined) delete process.env.TREINERLM_OLLAMA_ENABLED; else process.env.TREINERLM_OLLAMA_ENABLED = prevEnabled; if (prevVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = prevVercel; }
  });
  it("local limita 20/min; público sem contador durável falha fechado", async () => {
    clearLocalAiRateLimitForTests(); for (let i = 0; i < 20; i++) await enforceAiRateLimit(req());
    await assert.rejects(() => enforceAiRateLimit(req()), (error: unknown) => publicAiError(error).status === 429);
    clearLocalAiRateLimitForTests();
    const previous = process.env.TREINERLM_AI_REDIS_REST_URL;
    delete process.env.TREINERLM_AI_REDIS_REST_URL;
    try { await assert.rejects(() => enforceAiRateLimit(req("https://trainer-3-14.vercel.app/api/coach")), (error: unknown) => publicAiError(error).status === 503); }
    finally { if (previous !== undefined) process.env.TREINERLM_AI_REDIS_REST_URL = previous; }
  });
  it("contador serverless é atômico, usa buckets com expiração e não recebe credencial pessoal/IP puro", async () => {
    const names = ["TREINERLM_AI_REDIS_REST_URL", "TREINERLM_AI_REDIS_REST_TOKEN", "TREINERLM_AI_RATE_SECRET", "VERCEL"] as const;
    const saved = names.map((name) => process.env[name]);
    process.env.TREINERLM_AI_REDIS_REST_URL = "https://example-test.upstash.io"; process.env.TREINERLM_AI_REDIS_REST_TOKEN = "infrastructure-test-token"; process.env.TREINERLM_AI_RATE_SECRET = "infrastructure-test-signing-secret-32"; process.env.VERCEL = "1";
    try {
      const fetcher: typeof fetch = async (_url, init) => { const text = String(init?.body); const body = JSON.parse(text); assert.equal(body[0], "EVAL"); assert.ok(text.includes("EXPIRE")); assert.ok(!text.includes("203.0.113.40")); assert.ok(!text.includes(TEST_KEY)); return Response.json({ result: [1, 1] }); };
      await enforceAiRateLimit(req("https://trainer-3-14.vercel.app/api/coach", { "x-vercel-forwarded-for": "203.0.113.40" }), fetcher);
      await assert.rejects(() => enforceAiRateLimit(req("https://trainer-3-14.vercel.app/api/coach"), async () => Response.json({ result: [21, 50] })), (error: unknown) => publicAiError(error).status === 429);
      await assert.rejects(() => enforceAiRateLimit(req("https://trainer-3-14.vercel.app/api/coach"), async () => { throw new Error(TEST_KEY); }), (error: unknown) => publicAiError(error).status === 503);
    } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
  });
});
