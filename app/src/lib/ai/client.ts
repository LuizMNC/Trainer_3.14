import type { VideoEntry } from "../rag";

export interface CoachReply {
  text: string;
  model?: string;
  provider?: string;
  sourcesUsed?: string[];
  relatedVideos?: VideoEntry[];
}

export async function coachRequest<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/coach", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Poker-Coach": "local-v1" },
    body: JSON.stringify(body), signal, cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Não foi possível consultar o provedor.");
  return data as T;
}

export async function readCoachResponse(response: Response, onDelta: (text: string) => void): Promise<CoachReply> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Não foi possível consultar o provedor.");
  }
  if (!response.headers.get("content-type")?.includes("ndjson")) {
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    if (typeof data.text !== "string" || !data.text.trim()) throw new Error("O provedor retornou uma resposta vazia.");
    return data as CoachReply;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Resposta sem conteúdo.");
  const decoder = new TextDecoder();
  let pending = "", text = "";
  let completed: CoachReply | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error || "O provedor interrompeu a resposta.");
    if (event.type === "delta" && typeof event.text === "string") { text += event.text; onDelta(text); }
    if (event.type === "done") completed = { ...event, text: typeof event.text === "string" ? event.text : text };
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) { consume(pending.slice(0, newline)); pending = pending.slice(newline + 1); }
      if (chunk.done) break;
      if (pending.length > 2_000_000 || text.length > 2_000_000) throw new Error("A resposta excedeu o limite de tamanho.");
    }
    consume(pending);
    if (!completed || !completed.text.trim()) throw new Error("A resposta foi interrompida antes de terminar. O texto parcial não está completo.");
    return completed;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
