/** Homologação real explícita. Não faz parte de npm test; pode gerar custo. */
const keyNames = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  ollama: null,
};

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  const provider = args.includes("--provider") ? option("--provider") : "";
  const model = args.includes("--model") ? option("--model") : "";
  const port = args.includes("--port") ? option("--port") : "3000";
  if (!Object.hasOwn(keyNames, provider) || !model || !/^\d{1,5}$/.test(port) || +port < 1 || +port > 65535) {
    throw new Error("Uso: npm run test:ai:live -- --provider gemini --model ID_REAL [--port 3000].");
  }
  if (process.env.TREINERLM_AI_LIVE_TEST !== "1") {
    throw new Error("Defina TREINERLM_AI_LIVE_TEST=1 para autorizar a chamada real, que pode consumir quota e gerar custos.");
  }
  const keyName = keyNames[provider];
  const apiKey = keyName ? process.env[keyName]?.trim() : "";
  if (keyName && !apiKey) throw new Error(`Defina ${keyName} somente no ambiente deste processo. Não coloque a chave em argumentos ou arquivos de teste.`);
  const origin = `http://127.0.0.1:${port}`;
  const request = async (action) => {
    const response = await fetch(`${origin}/api/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Poker-Coach": "local-v1", Origin: origin },
      body: JSON.stringify({ action, provider, apiKey, model }),
      redirect: "error",
      signal: AbortSignal.timeout(65_000),
    });
    const data = await response.json();
    // Nunca imprimir payload, erros brutos de rede, resposta do provedor ou chave.
    if (!response.ok) throw new Error(`Ação ${action} recusada (HTTP ${response.status}). Consulte a mensagem segura na interface.`);
    return data;
  };
  const discovery = await request("models");
  if (!discovery.models?.some((entry) => entry.id === model && entry.text)) {
    throw new Error("O ID informado não está na descoberta de modelos de texto desta credencial. Nenhum modelo alternativo foi chamado.");
  }
  const result = await request("test");
  if (!result.ok || result.model !== model) throw new Error("A resposta não confirmou o teste do modelo solicitado.");
  process.stdout.write(`Chamada real confirmada para ${provider}, modelo ${model}. Credenciais e conteúdo omitidos.\n`);
}

main().catch((error) => {
  const safe = error instanceof Error && !/fetch|network|socket/i.test(error.message)
    ? error.message
    : "Falha de rede na homologação local. Nenhum detalhe sensível foi registrado.";
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
});
