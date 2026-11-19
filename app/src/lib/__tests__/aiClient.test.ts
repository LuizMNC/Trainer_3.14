import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyProviderConfig, isConfigTested, loadProviderConfigs, persistProviderConfig, removeProviderConfig } from "../ai/clientStorage.ts";
import { readCoachResponse } from "../ai/client.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}

describe("Credenciais individuais do Assistente de IA", () => {
  it("usa sessão por padrão, mantém provedores independentes e não migra a chave legada", () => {
    const session = memoryStorage(), local = memoryStorage();
    local.setItem("projeto_poker_gemini_key_v1", "legacy-test-secret");
    const gemini = { ...emptyProviderConfig(), apiKey: "gemini-test-secret", model: "modelo-teste", testedModel: "modelo-teste" };
    const openai = { ...emptyProviderConfig(), apiKey: "openai-test-secret", model: "outro-modelo" };
    persistProviderConfig("gemini", gemini, session, local);
    persistProviderConfig("openai", openai, session, local);
    const configs = loadProviderConfigs(session, local);
    assert.equal(local.values.size, 0);
    assert.equal(configs.gemini?.apiKey, gemini.apiKey);
    assert.equal(configs.openai?.apiKey, openai.apiKey);
    assert.equal(configs.anthropic, undefined);
    assert.equal(isConfigTested(configs.gemini), true);
    assert.equal(isConfigTested(configs.openai), false);
    assert.equal(isConfigTested({ ...gemini, model: "outro-modelo" }), false);
    assert.equal(loadProviderConfigs(memoryStorage(), local).gemini, undefined);
  });

  it("lembrar no navegador exige opt-in, reteste e a remoção apaga ambas as durações", () => {
    const session = memoryStorage(), local = memoryStorage();
    const config = { ...emptyProviderConfig(), apiKey: "test-secret", model: "modelo-teste", testedModel: "modelo-teste" };
    persistProviderConfig("groq", config, session, local);
    persistProviderConfig("groq", { ...config, storage: "local" }, session, local);
    assert.equal(session.values.size, 0);
    assert.equal(local.values.size, 1);
    assert.equal(loadProviderConfigs(session, local).groq?.apiKey, config.apiKey);
    assert.equal(isConfigTested(loadProviderConfigs(session, local).groq), false);
    persistProviderConfig("groq", config, session, local);
    assert.equal(local.values.size, 0);
    removeProviderConfig("groq", session, local);
    assert.equal(loadProviderConfigs(session, local).groq, undefined);
  });

  it("ignora armazenamento malformado e capacidades atribuídas a outro provedor", () => {
    const session = memoryStorage(), local = memoryStorage();
    session.setItem("treinerlm_ai_provider_v1_openai", "{bad-json");
    local.setItem("treinerlm_ai_provider_v1_gemini", JSON.stringify({ apiKey: "test", model: "model", models: [{ id: "model", name: "Model", provider: "openai", text: true, images: true, streaming: true }] }));
    const configs = loadProviderConfigs(session, local);
    assert.equal(configs.openai, undefined);
    assert.deepEqual(configs.gemini?.models, []);
  });
});

describe("Respostas progressivas do Assistente", () => {
  it("recompõe NDJSON e caracteres UTF-8 entre chunks e preserva as fontes", async () => {
    const payload = new TextEncoder().encode('{"type":"delta","text":"Olá "}\n{"type":"delta","text":"MTT"}\n{"type":"done","model":"model","sourcesUsed":["Livro"]}\n');
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (let i = 0; i < payload.length; i += 2) controller.enqueue(payload.slice(i, i + 2));
      controller.close();
    } });
    const deltas: string[] = [];
    const reply = await readCoachResponse(new Response(body, { headers: { "content-type": "application/x-ndjson" } }), (value) => deltas.push(value));
    assert.deepEqual(deltas, ["Olá ", "Olá MTT"]);
    assert.equal(reply.text, "Olá MTT");
    assert.deepEqual(reply.sourcesUsed, ["Livro"]);
  });

  it("não trata stream truncado, cancelado, vazio ou erro upstream como resposta concluída", async () => {
    await assert.rejects(readCoachResponse(new Response('{"type":"delta","text":"parcial"}\n', { headers: { "content-type": "application/x-ndjson" } }), () => {}), /interrompida/);
    await assert.rejects(readCoachResponse(new Response('{"type":"error","error":"Quota atingida"}\n', { headers: { "content-type": "application/x-ndjson" } }), () => {}), /Quota atingida/);
    await assert.rejects(readCoachResponse(Response.json({ text: "" }), () => {}), /vazia/);
    const controller = new AbortController();
    const body = new ReadableStream({ start(stream) { controller.signal.addEventListener("abort", () => stream.error(new DOMException("cancelled", "AbortError"))); } });
    const pending = readCoachResponse(new Response(body, { headers: { "content-type": "application/x-ndjson" } }), () => {});
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  });
});
