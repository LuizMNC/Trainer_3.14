import kbData from "@/data/knowledge_base.json";

export interface KnowledgeChunk {
  id: string;
  source: string;
  category: string;
  text: string;
}

export interface VideoEntry {
  title: string;
  category: string;
  relativePath: string;
  sizeMb: number;
}

export interface KnowledgeBase {
  totalChunks: number;
  totalVideos: number;
  chunks: KnowledgeChunk[];
  videos: VideoEntry[];
}

const kb = kbData as KnowledgeBase;

const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos", "para", "com",
  "por", "que", "uma", "um", "uns", "umas", "como", "mais", "mas", "se", "ao",
  "ou", "e", "o", "a", "os", "as", "the", "and", "of", "to", "in", "is", "for",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+_-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

export function searchKnowledge(query: string, topK = 4): KnowledgeChunk[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return kb.chunks.slice(0, topK);

  const scored = kb.chunks.map((chunk) => {
    const normText = chunk.text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    for (const tok of qTokens) {
      if (normText.includes(tok)) {
        score += tok.length >= 4 ? 3 : 1.5;
        // Bônus se aparecer mais de uma vez
        const first = normText.indexOf(tok);
        if (normText.indexOf(tok, first + tok.length) !== -1) {
          score += 1;
        }
      }
    }
    // Leve prioridade para materiais curtos em PT-BR (ICM, 5 erros, Dicionário, Ranges)
    if (chunk.category !== "livro" && score > 0) {
      score *= 1.15;
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}

export function searchVideos(query: string, limit = 3): VideoEntry[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return kb.videos.slice(0, limit);

  return kb.videos
    .map((video) => {
      const hay = `${video.title} ${video.category}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const score = qTokens.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
      return { video, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.video);
}

export function getKnowledgeSummary() {
  return {
    totalChunks: kb.totalChunks,
    totalVideos: kb.totalVideos,
    videos: kb.videos,
  };
}
