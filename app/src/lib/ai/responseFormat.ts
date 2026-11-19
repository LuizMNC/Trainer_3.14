/**
 * Contrato de apresentação das respostas do TheNerdEinsten.
 *
 * O formato principal é "Markdown com seções canônicas": funciona com
 * streaming e com todos os provedores (nem todos oferecem saída JSON
 * confiável). Quando o provedor devolve JSON, ele é validado por esquema;
 * JSON inválido ou parcial nunca quebra a interface e o conteúdo recuperável
 * continua acessível. Nenhum conteúdo é descartado silenciosamente.
 */

export type SectionKey =
  | "quick" | "factors" | "support" | "why" | "math" | "ranges"
  | "sources" | "alternatives" | "next" | "limitations" | "other";

export interface ResponseSection {
  key: SectionKey;
  title: string;
  body: string;
}

export type ParsedKind = "structured" | "markdown" | "json" | "invalid_json" | "empty";

export interface ParsedAssistantResponse {
  kind: ParsedKind;
  /** Resposta rápida (sempre visível). */
  quick: string;
  /** Fatores relevantes (sempre visíveis). */
  factors: string;
  /** Números/frequências citados pela IA (painel compacto, rotulado como IA). */
  support: string;
  /** Seções aprofundadas, inicialmente recolhidas. */
  deep: ResponseSection[];
  next: string;
  limitations: string;
  /** Avisos de formato exibidos ao usuário (ex.: JSON inválido). */
  warnings: string[];
  /** Conteúdo bruto recuperável (JSON inválido). */
  recoverable?: string;
  wordCount: number;
  mainWordCount: number;
}

export const DEEP_SECTION_LABELS: Record<Exclude<SectionKey, "quick" | "factors" | "support" | "next" | "limitations">, string> = {
  why: "Entenda o motivo",
  math: "Ver a matemática",
  ranges: "Comparar ranges",
  sources: "Ver a fonte",
  alternatives: "Explorar alternativas",
  other: "Mais detalhes",
};

/** Orçamento da resposta principal (resposta rápida + fatores). */
export const MAIN_WORD_TARGET = { min: 80, max: 180 } as const;
const FALLBACK_PREVIEW_WORDS = 120;

export function normalizeHeading(value: string): string {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[*_`#:>]/g, " ")
    .replace(/^[\s\p{Extended_Pictographic}\p{S}\p{P}]*(?:[a-e]\s*[.)-]\s+|\d+\s*[.)-]\s*)?/u, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING_RULES: Array<[SectionKey, RegExp]> = [
  ["quick", /^(resposta rapida|resposta curta|resumo|conclusao( principal)?|veredito|em resumo)\b/],
  ["factors", /^(o que importa|fatores( relevantes| considerados| principais)?|pontos[- ]chave|pontos principais|contexto da mao)\b/],
  ["support", /^(informacoes de apoio|numeros( disponiveis)?|dados( disponiveis| de apoio)?|calculos verificaveis|frequencias( estimadas| da referencia)?)\b/],
  ["math", /^(ver a matematica|matematica|calculos?|conta)\b/],
  ["ranges", /^(comparar ranges|comparacao de ranges|ranges?( do adversario| envolvidos)?)\b/],
  ["sources", /^(ver a fonte|fontes?( utilizadas| usadas)?|referencias( estrategicas)?)\b/],
  ["alternatives", /^(explorar alternativas|alternativas|outras linhas|outras acoes)\b/],
  ["next", /^(proxima acao|proximo exercicio|proximos passos|sugestoes de estudo|o que treinar|para treinar)\b/],
  ["limitations", /^(limitacoes|dados insuficientes|o que falta|ressalvas|cuidados)\b/],
  ["why", /^(entenda o motivo|explicacao( aprofundada| detalhada)?|por que|porque|raciocinio|avaliacao da decisao|analise( da mao| da decisao)?)\b/],
];

export function classifyHeading(title: string): SectionKey {
  const normalized = normalizeHeading(title);
  for (const [key, rule] of HEADING_RULES) if (rule.test(normalized)) return key;
  return "other";
}

export function countWords(text: string): number {
  const cleaned = markdownToPlainText(text);
  const matches = cleaned.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu);
  return matches ? matches.length : 0;
}

const FENCE = /^\s*(```|~~~)/;
const SEPARATOR = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** Linhas de cabeçalho Markdown ou linhas apenas em negrito ("**Resumo**"). */
function headingOf(line: string): { level: number; title: string } | null {
  const atx = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  if (atx) return { level: atx[1].length, title: atx[2].trim() };
  const bold = /^\s{0,3}(?:\*\*|__)([^*_\n]{2,60})(?:\*\*|__)\s*:?\s*$/.exec(line);
  if (bold) return { level: 4, title: bold[1].trim() };
  return null;
}

interface RawSection { title: string | null; lines: string[] }

function splitSections(markdown: string): RawSection[] {
  const sections: RawSection[] = [{ title: null, lines: [] }];
  let inFence = false;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    const heading = !inFence ? headingOf(line) : null;
    if (heading) { sections.push({ title: heading.title, lines: [] }); continue; }
    if (!inFence && SEPARATOR.test(line)) continue; // separadores excessivos: as seções já separam
    sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function tidy(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function splitParagraphs(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && !line.trim()) { if (current.length) { blocks.push(current.join("\n")); current = []; } continue; }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

function emptyParsed(kind: ParsedKind): ParsedAssistantResponse {
  return { kind, quick: "", factors: "", support: "", deep: [], next: "", limitations: "", warnings: [], wordCount: 0, mainWordCount: 0 };
}

function finalize(parsed: ParsedAssistantResponse, fullText: string): ParsedAssistantResponse {
  parsed.wordCount = countWords(fullText);
  parsed.mainWordCount = countWords(`${parsed.quick}\n${parsed.factors}`);
  return parsed;
}

/** Converte o texto Markdown em seções; fallback seguro quando não há títulos reconhecidos. */
export function parseMarkdownResponse(markdown: string): ParsedAssistantResponse {
  const text = tidy(markdown);
  if (!text) return emptyParsed("empty");
  const raw = splitSections(text);
  const parsed = emptyParsed("structured");
  const buckets = new Map<SectionKey, ResponseSection>();
  let recognized = 0;
  const preface = tidy(raw[0].lines.join("\n"));

  for (const section of raw.slice(1)) {
    const body = tidy(section.lines.join("\n"));
    const key = classifyHeading(section.title ?? "");
    if (key !== "other") recognized += 1;
    if (!body) continue;
    const existing = buckets.get(key);
    if (existing && key !== "other") existing.body = `${existing.body}\n\n${body}`;
    else if (key === "other") buckets.set(`other:${buckets.size}` as SectionKey, { key, title: section.title ?? "Mais detalhes", body });
    else buckets.set(key, { key, title: section.title ?? DEEP_SECTION_LABELS.other, body });
  }

  if (recognized === 0) {
    // Fallback: Markdown livre. Prévia curta + restante recolhível (nada é descartado).
    const cleaned = tidy(splitSections(text).map((s) => [s.title ? `### ${s.title}` : "", ...s.lines].join("\n")).join("\n"));
    const result = emptyParsed("markdown");
    if (countWords(cleaned) <= MAIN_WORD_TARGET.max) { result.quick = cleaned; return finalize(result, text); }
    const blocks = splitParagraphs(cleaned);
    const preview: string[] = [];
    let words = 0;
    while (blocks.length && (preview.length === 0 || words + countWords(blocks[0]) <= FALLBACK_PREVIEW_WORDS)) {
      const block = blocks.shift() as string;
      preview.push(block); words += countWords(block);
    }
    result.quick = preview.join("\n\n");
    if (blocks.length) result.deep.push({ key: "other", title: "Continuação da resposta", body: blocks.join("\n\n") });
    return finalize(result, text);
  }

  const take = (key: SectionKey) => { const value = buckets.get(key); buckets.delete(key); return value?.body ?? ""; };
  parsed.quick = take("quick");
  if (preface) {
    if (!parsed.quick) parsed.quick = preface;
    else parsed.deep.push({ key: "other", title: "Introdução", body: preface });
  }
  parsed.factors = take("factors");
  parsed.support = take("support");
  parsed.next = take("next");
  parsed.limitations = take("limitations");
  const order: SectionKey[] = ["why", "math", "ranges", "alternatives", "sources"];
  for (const key of order) {
    const section = buckets.get(key);
    if (section) { parsed.deep.push({ ...section, title: DEEP_SECTION_LABELS[key as keyof typeof DEEP_SECTION_LABELS] }); buckets.delete(key); }
  }
  for (const section of buckets.values()) parsed.deep.push(section);
  if (!parsed.quick && parsed.deep.length) {
    // Sem resposta rápida explícita: promove o primeiro parágrafo, sem perder o resto.
    const first = parsed.deep[0];
    const blocks = splitParagraphs(first.body);
    parsed.quick = blocks.shift() ?? "";
    if (blocks.length) first.body = blocks.join("\n\n"); else parsed.deep.shift();
  }
  return finalize(parsed, text);
}

// ---------------------------------------------------------------------------
// JSON estruturado (opcional, quando o provedor o devolve)
// ---------------------------------------------------------------------------

export interface StructuredCalculation { descricao: string; valor: string; premissas?: string[] }
export interface StructuredAnalysis {
  resumo: string;
  contexto?: string;
  avaliacao?: string;
  fatores?: string[];
  calculos?: StructuredCalculation[];
  referencias?: string[];
  explicacao?: string;
  sugestoes?: string[];
  limitacoes?: string[];
}

const STRUCTURED_KEYS = new Set(["resumo", "contexto", "avaliacao", "fatores", "calculos", "referencias", "explicacao", "sugestoes", "limitacoes"]);
const MAX_FIELD = 6000;

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_FIELD;
}
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 && value.every(isShortString);
}

export function validateStructuredAnalysis(value: unknown): { ok: true; value: StructuredAnalysis } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["O conteúdo não é um objeto."] };
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!STRUCTURED_KEYS.has(key)) errors.push(`Campo desconhecido: ${key}.`);
  if (!isShortString(record.resumo) || !record.resumo.trim()) errors.push("Campo obrigatório ausente: resumo.");
  for (const key of ["contexto", "avaliacao", "explicacao"]) if (record[key] !== undefined && !isShortString(record[key])) errors.push(`Campo inválido: ${key}.`);
  for (const key of ["fatores", "referencias", "sugestoes", "limitacoes"]) if (record[key] !== undefined && !isStringList(record[key])) errors.push(`Lista inválida: ${key}.`);
  if (record.calculos !== undefined) {
    const ok = Array.isArray(record.calculos) && record.calculos.length <= 12 && record.calculos.every((item) => {
      const calc = item as Record<string, unknown>;
      return calc && typeof calc === "object" && isShortString(calc.descricao) && isShortString(calc.valor) && (calc.premissas === undefined || isStringList(calc.premissas));
    });
    if (!ok) errors.push("Lista inválida: calculos.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: record as unknown as StructuredAnalysis };
}

function bulletList(items: string[] | undefined): string {
  return (items ?? []).map((item) => `- ${item.trim()}`).join("\n");
}

export function structuredToMarkdownSections(value: StructuredAnalysis): ParsedAssistantResponse {
  const parsed = emptyParsed("json");
  parsed.quick = value.resumo.trim();
  parsed.factors = [value.contexto?.trim(), bulletList(value.fatores)].filter(Boolean).join("\n\n");
  parsed.support = (value.calculos ?? []).map((calc) => `- **${calc.descricao.trim()}:** ${calc.valor.trim()}${calc.premissas?.length ? ` (premissas: ${calc.premissas.join("; ")})` : ""}`).join("\n");
  if (value.avaliacao?.trim() || value.explicacao?.trim()) parsed.deep.push({ key: "why", title: DEEP_SECTION_LABELS.why, body: [value.avaliacao?.trim(), value.explicacao?.trim()].filter(Boolean).join("\n\n") });
  if (value.referencias?.length) parsed.deep.push({ key: "sources", title: DEEP_SECTION_LABELS.sources, body: bulletList(value.referencias) });
  parsed.next = bulletList(value.sugestoes);
  parsed.limitations = bulletList(value.limitacoes);
  const all = [parsed.quick, parsed.factors, parsed.support, ...parsed.deep.map((d) => d.body), parsed.next, parsed.limitations].join("\n");
  return finalize(parsed, all);
}

/** Extrai o JSON candidato: objeto puro ou bloco ```json. */
export function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)(?:\n```)?\s*$/i.exec(trimmed);
  if (fenced && fenced[1].trim().startsWith("{")) return fenced[1].trim();
  if (trimmed.startsWith("{")) return trimmed;
  return null;
}

/** Recupera campos de texto de um JSON truncado/inválido sem executar nada. */
export function recoverJsonFields(candidate: string): string {
  const out: string[] = [];
  const pattern = /"(resumo|contexto|avaliacao|explicacao)"\s*:\s*"((?:[^"\\]|\\.)*)"?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(candidate))) {
    let value = match[2];
    try { value = JSON.parse(`"${value}"`); } catch { value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"'); }
    if (value.trim()) out.push(value.trim());
  }
  return out.join("\n\n");
}

export function parseAssistantResponse(text: string): ParsedAssistantResponse {
  if (!text || !text.trim()) return emptyParsed("empty");
  const candidate = extractJsonCandidate(text);
  if (candidate) {
    let value: unknown;
    try { value = JSON.parse(candidate); } catch { value = undefined; }
    const validated = value === undefined ? null : validateStructuredAnalysis(value);
    if (validated?.ok) return structuredToMarkdownSections(validated.value);
    const parsed = emptyParsed("invalid_json");
    const recovered = recoverJsonFields(candidate);
    parsed.quick = recovered;
    parsed.recoverable = candidate;
    parsed.warnings.push(validated && !validated.ok
      ? `A resposta estruturada não seguiu o formato esperado (${validated.errors.slice(0, 2).join(" ")}). Exibindo o conteúdo recuperável.`
      : "A resposta estruturada veio incompleta ou inválida. Exibindo o conteúdo recuperável; nenhum dado foi tratado como verificado.");
    return finalize(parsed, recovered || candidate);
  }
  return parseMarkdownResponse(text);
}

// ---------------------------------------------------------------------------
// Streaming e texto limpo
// ---------------------------------------------------------------------------

/** Fecha marcações abertas para que Markdown parcial (streaming) não exiba símbolos soltos. */
export function closeIncompleteMarkdown(text: string): string {
  let output = text;
  const fences = output.split("\n").filter((line) => FENCE.test(line)).length;
  if (fences % 2 === 1) return `${output}\n\`\`\``;
  const displayMath = (output.match(/\$\$/g) ?? []).length;
  if (displayMath % 2 === 1) output += "\n$$";
  const lines = output.split("\n");
  let last = lines[lines.length - 1];
  const withoutCode = last.replace(/`[^`]*`/g, "");
  if ((withoutCode.match(/\*\*/g) ?? []).length % 2 === 1) {
    const index = last.lastIndexOf("**");
    last = last.slice(0, index) + last.slice(index + 2);
  }
  if ((last.match(/`/g) ?? []).length % 2 === 1) last += "`";
  // Link ainda incompleto: mostra apenas o texto, sem colchetes.
  last = last.replace(/\[([^\]]*)\]\([^)]*$/, "$1").replace(/\[([^\]]*)$/, "$1");
  lines[lines.length - 1] = last;
  return lines.join("\n");
}

/** Evita que valores monetários (R$ 10, US$ 5) sejam interpretados como fórmula e normaliza delimitadores LaTeX. */
export function prepareMarkdown(text: string): string {
  return text
    .replace(/\b(R|US|U)\$/g, "$1\\$")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([^\n]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
}

const LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\times/g, "×"], [/\\cdot/g, "·"], [/\\div/g, "÷"], [/\\geq?/g, "≥"], [/\\leq?/g, "≤"],
  [/\\approx/g, "≈"], [/\\neq/g, "≠"], [/\\pm/g, "±"], [/\\%/g, "%"], [/\\,|\\;|\\!/g, " "],
  [/\\left|\\right/g, ""], [/\\Rightarrow|\\implies/g, "⇒"], [/\\rightarrow|\\to/g, "→"],
];

/** Converte LaTeX simples em notação legível (sem executar ou injetar HTML). */
export function latexToReadable(source: string): string {
  let text = source.trim();
  for (let i = 0; i < 4 && /\\frac\{/.test(text); i += 1) {
    text = text.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const wrap = (value: string) => (/^[\w.,%]+$/.test(value.trim()) ? value.trim() : `(${value.trim()})`);
      return `${wrap(a)} / ${wrap(b)}`;
    });
  }
  text = text.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1").replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  for (const [pattern, replacement] of LATEX_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

/** Versão textual limpa para "Copiar resposta": sem símbolos de formatação. */
export function markdownToPlainText(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inFence = false;
  for (const raw of lines) {
    if (FENCE.test(raw)) { inFence = !inFence; continue; }
    if (inFence) { out.push(raw); continue; }
    let line = raw;
    if (SEPARATOR.test(line)) continue;
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue; // separador de tabela
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) { if (out.length && out[out.length - 1] !== "") out.push(""); line = heading[1]; }
    if (/^\s*\|.*\|\s*$/.test(line)) line = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join(" | ");
    line = line
      .replace(/^\s*>\s?/, "")
      .replace(/^(\s*)[-*+]\s+\[( |x)\]\s+/i, "$1• ")
      .replace(/^(\s*)[-*+]\s+/, "$1• ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => (label === url ? url : `${label} (${url})`))
      .replace(/\$\$([^$]+)\$\$/g, (_m, math: string) => latexToReadable(math))
      .replace(/\$([^$\n]+)\$/g, (_m, math: string) => latexToReadable(math))
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
      .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/<[^>]+>/g, "");
    out.push(line.replace(/\s+$/, ""));
  }
  return out.join("\n").replace(/^\$\$\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Texto limpo de uma resposta estruturada inteira (inclui seções recolhidas). */
export function parsedToPlainText(parsed: ParsedAssistantResponse, rawText: string): string {
  if (parsed.kind === "invalid_json" || parsed.kind === "empty") return markdownToPlainText(rawText);
  const parts: string[] = [];
  const push = (title: string, body: string) => { if (body.trim()) parts.push(`${title}\n${markdownToPlainText(body)}`); };
  if (parsed.kind === "markdown") return markdownToPlainText(rawText);
  push("Resposta rápida", parsed.quick);
  push("O que importa nesta mão", parsed.factors);
  push("Informações de apoio (citadas pela IA)", parsed.support);
  for (const section of parsed.deep) push(section.title, section.body);
  push("Limitações", parsed.limitations);
  push("Próxima ação", parsed.next);
  return parts.join("\n\n");
}

/** URLs permitidas em links gerados pela IA: somente http(s), mailto e âncoras/caminhos relativos. */
export function sanitizeAssistantUrl(url: string): string | null {
  const value = (url ?? "").trim();
  if (!value) return null;
  // Remove caracteres de controle/espaços usados para disfarçar esquemas (ex.: "java\tscript:").
  const compact = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (/^(#|\/(?!\/)|\.\.?\/)/.test(compact)) return compact;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (!scheme) return null;
  const protocol = scheme[1].toLowerCase();
  if (protocol !== "http" && protocol !== "https" && protocol !== "mailto") return null;
  try { return new URL(compact).href; } catch { return null; }
}
