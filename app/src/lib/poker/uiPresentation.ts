/**
 * Utilitários compartilhados de apresentação UI/UX, acessibilidade WCAG AA
 * e padronização linguística em português brasileiro (pt-BR) para o TreinerLM.
 */

export type ActionVisualRole =
  | "fold"
  | "call"
  | "check"
  | "limp"
  | "bet"
  | "raise"
  | "allin"
  | "neutral";

export interface ActionVisualStyle {
  role: ActionVisualRole;
  /** Cor de fundo hexadecimal; utilizar sempre o par `text` correspondente. */
  bg: string;
  /** Cor de fundo ao passar o cursor ou selecionar. */
  hoverBg: string;
  /** Cor de borda de destaque. */
  border: string;
  /** Cor de texto de alto contraste (WCAG AA/AAA). */
  text: string;
  /** Abreviação curta acessível para matriz/badges (daltônico-safe). */
  shortGlyph: string;
  /** Nome da categoria em pt-BR. */
  categoryLabel: string;
  /** Classes Tailwind para botões de decisão consistentes. */
  buttonClass: string;
}

const ACTION_STYLES: Record<ActionVisualRole, ActionVisualStyle> = {
  fold: {
    role: "fold",
    bg: "#1D4ED8",
    hoverBg: "#1E40AF",
    border: "#3B82F6",
    text: "#FFFFFF",
    shortGlyph: "F",
    categoryLabel: "Fold",
    buttonClass:
      "bg-[#1D4ED8] hover:bg-[#1E40AF] border-[#3B82F6] text-white",
  },
  call: {
    role: "call",
    bg: "#047857",
    hoverBg: "#065F46",
    border: "#22C55E",
    text: "#FFFFFF",
    shortGlyph: "C",
    categoryLabel: "Call",
    buttonClass:
      "bg-[#047857] hover:bg-[#065F46] border-[#22C55E] text-white",
  },
  check: {
    role: "check",
    bg: "#475569",
    hoverBg: "#334155",
    border: "#94A3B8",
    text: "#FFFFFF",
    shortGlyph: "X",
    categoryLabel: "Check",
    buttonClass:
      "bg-[#475569] hover:bg-[#334155] border-[#94A3B8] text-white",
  },
  limp: {
    role: "limp",
    bg: "#FACC15",
    hoverBg: "#EAB308",
    border: "#FACC15",
    text: "#111827",
    shortGlyph: "L",
    categoryLabel: "Limp",
    buttonClass:
      "bg-[#FACC15] hover:bg-[#EAB308] border-[#FACC15] text-[#111827]",
  },
  bet: {
    role: "bet",
    bg: "#C2410C",
    hoverBg: "#9A3412",
    border: "#FB923C",
    text: "#FFFFFF",
    shortGlyph: "B",
    categoryLabel: "Bet",
    buttonClass:
      "bg-[#C2410C] hover:bg-[#9A3412] border-[#FB923C] text-white",
  },
  raise: {
    role: "raise",
    bg: "#B91C1C",
    hoverBg: "#991B1B",
    border: "#F87171",
    text: "#FFFFFF",
    shortGlyph: "R",
    categoryLabel: "Raise",
    buttonClass:
      "bg-[#B91C1C] hover:bg-[#991B1B] border-[#F87171] text-white",
  },
  allin: {
    role: "allin",
    bg: "#6D28D9",
    hoverBg: "#5B21B6",
    border: "#A78BFA",
    text: "#FFFFFF",
    shortGlyph: "A",
    categoryLabel: "All-in",
    buttonClass:
      "bg-[#6D28D9] hover:bg-[#5B21B6] border-[#A78BFA] text-white",
  },
  neutral: {
    role: "neutral",
    bg: "#1E293B",
    hoverBg: "#334155",
    border: "#64748B",
    text: "#F8FAFC",
    shortGlyph: "•",
    categoryLabel: "Ação",
    buttonClass:
      "bg-[#1E293B] hover:bg-[#334155] border-[#64748B] text-[#F8FAFC]",
  },
};

export function classifyActionRole(action: string): ActionVisualRole {
  const norm = action.trim().toLowerCase();
  if (!norm) return "neutral";
  if (norm.startsWith("fold")) return "fold";
  if (norm.startsWith("check")) return "check";
  if (norm.startsWith("call")) return "call";
  if (norm.includes("limp")) return "limp";
  if (
    norm.includes("allin") ||
    norm.includes("all-in") ||
    norm.includes("all_in") ||
    norm.includes("all in") ||
    norm.includes("shove")
  ) {
    return "allin";
  }
  if (norm.startsWith("bet") || norm.includes("cbet")) return "bet";
  if (
    norm.includes("raise") ||
    norm.includes("3bet") ||
    norm.includes("3-bet") ||
    norm.includes("4bet") ||
    norm.includes("4-bet") ||
    norm.includes("iso") ||
    norm.includes("squeeze") ||
    norm.includes("open")
  ) {
    return "raise";
  }
  return "neutral";
}

export function getActionVisualStyle(action: string): ActionVisualStyle {
  return ACTION_STYLES[classifyActionRole(action)];
}

/** Apresentação apenas: mantém as frequências originais, inclusive os resíduos. */
export function getActionDistributionVisual(
  distribution: Record<string, number>,
  actionOrder: readonly string[] = [],
): {
  background: string;
  text: string;
  labelBackground: string | undefined;
  incomplete: boolean;
  total: number;
} {
  const orderedActions = [...new Set([...actionOrder, ...Object.keys(distribution)])];
  const stops: string[] = [];
  let total = 0;
  let singleStyle: ActionVisualStyle | undefined;
  for (const action of orderedActions) {
    const frequency = distribution[action];
    if (!Number.isFinite(frequency) || frequency <= 0) continue;
    const visual = getActionVisualStyle(action);
    // Não arredonda os limites nem preenche com Fold o que não foi informado.
    stops.push(`${visual.bg} ${total * 100}% ${(total + frequency) * 100}%`);
    total += frequency;
    singleStyle = visual;
  }
  const incomplete = Math.abs(total - 1) > 0.000001;
  const mixedBackground = stops.length > 1 || incomplete;
  if (total < 1) {
    stops.push(`${ACTION_STYLES.neutral.bg} ${total * 100}% 100%`);
  }
  return {
    background: `linear-gradient(to right, ${stops.join(", ")})`,
    text: mixedBackground ? "#FFFFFF" : (singleStyle?.text ?? "#FFFFFF"),
    // Em células mistas o rótulo tem fundo próprio para não cruzar o amarelo com texto branco.
    labelBackground: mixedBackground ? "#111827" : undefined,
    incomplete,
    total,
  };
}

export function formatActionFrequencyPtBr(frequency: number): string {
  return `${Number((frequency * 100).toPrecision(12)).toLocaleString("pt-BR", {
    maximumFractionDigits: 10,
  })}%`;
}

/**
 * Converte identificadores técnicos de ação (ex.: `BET_33PCT`, `Raise_2_1bb`,
 * `Allin 14`, `CALL`) em rótulos legíveis e consistentes em português do Brasil.
 */
export function formatActionLabelPtBr(action: string): string {
  const raw = action.trim();
  if (!raw) return "Ação";

  const low = raw.toLowerCase();
  if (low === "fold") return "Fold";
  if (low === "check") return "Check";
  if (low === "call") return "Call";
  if (low === "limp") return "Limp";
  if (low === "all-in" || low === "all_in" || low === "allin") {
    return "All-in";
  }
  if (low === "shove") return "All-in (Shove)";

  // Allin 14 / Allin_14bb / All-in 25bb
  const allinMatch = raw.match(
    /^(?:all[\s_-]*in|shove)[\s_-]*([0-9]+(?:[.,_][0-9]+)?)(?:\s*bb)?$/i,
  );
  if (allinMatch) {
    const val = allinMatch[1].replace("_", ",").replace(".", ",");
    return `All-in ${val} BB`;
  }

  // Bet_33pct / BET_75PCT / Bet 33% / Bet_33
  const betPctMatch = raw.match(
    /^bet[\s_-]*([0-9]+(?:[.,_][0-9]+)?)\s*(?:pct|%)?$/i,
  );
  if (betPctMatch && (low.includes("pct") || low.includes("%"))) {
    const pct = betPctMatch[1].replace("_", ",").replace(".", ",");
    return `Bet ${pct}% Pote`;
  }

  const betBbMatch = raw.match(/^bet[\s_-]*([0-9]+(?:[.,_][0-9]+)?)\s*bb$/i);
  if (betBbMatch) {
    const val = betBbMatch[1].replace("_", ",").replace(".", ",");
    return `Bet ${val} BB`;
  }

  // Raise_2_1bb / Raise 2.1 / Raise_3x / Raise 2.5x
  const raiseBbMatch = raw.match(
    /^raise[\s_-]*([0-9]+(?:[.,_][0-9]+)?)\s*bb$/i,
  );
  if (raiseBbMatch) {
    const val = raiseBbMatch[1].replace("_", ",").replace(".", ",");
    return `Raise ${val} BB`;
  }

  const raiseXMatch = raw.match(/^raise[\s_-]*([0-9]+(?:[.,_][0-9]+)?)\s*x$/i);
  if (raiseXMatch) {
    const val = raiseXMatch[1].replace("_", ",").replace(".", ",");
    return `Raise ${val}x`;
  }

  const raiseNumMatch = raw.match(/^raise[\s_-]+([0-9]+(?:[.,_][0-9]+)?)$/i);
  if (raiseNumMatch) {
    const val = raiseNumMatch[1].replace("_", ",").replace(".", ",");
    return `Raise ${val} BB`;
  }

  const threeBetMatch = raw.match(
    /^(3|4|5)[\s_-]*bet(?:[\s_-]*([0-9]+(?:[.,_][0-9]+)?)(bb|x|pct|%)?)?$/i,
  );
  if (threeBetMatch) {
    const level = `${threeBetMatch[1]}-Bet`;
    if (!threeBetMatch[2]) return level;
    const size = threeBetMatch[2].replace("_", ",").replace(".", ",");
    const unit = (threeBetMatch[3] || "").toLowerCase();
    if (unit === "bb") return `${level} ${size} BB`;
    if (unit === "pct" || unit === "%") return `${level} ${size}% Pote`;
    if (unit === "x") return `${level} ${size}x`;
    return `${level} ${size}`;
  }

  // Fallback limpo preservando capitalização legível
  return raw
    .replace(/_/g, " ")
    .replace(/\b(\d+)pct\b/gi, "$1% Pote")
    .replace(/\bbb\b/gi, "BB");
}

/**
 * Pluralização exata em português brasileiro (evita "1 mãos", "0 mão", "1 aulas").
 */
export function pluralizePtBr(
  count: number,
  singular: string,
  plural: string,
): string {
  const safe = Number.isFinite(count) ? Math.trunc(count) : 0;
  return `${safe} ${Math.abs(safe) === 1 ? singular : plural}`;
}

/**
 * Traduz identificadores internos ou contagens de amostra para aviso estatístico honesto.
 */
export function formatSampleConfidencePtBr(
  confidenceOrCount: string | number,
): string {
  if (typeof confidenceOrCount === "number") {
    const n = Number.isFinite(confidenceOrCount)
      ? Math.max(0, Math.trunc(confidenceOrCount))
      : 0;
    if (n < 10) return "Amostra insuficiente (< 10 mãos)";
    if (n < 30) return "Amostra em formação (10–29 mãos)";
    return "Amostra consistente (>= 30 mãos)";
  }

  const norm = confidenceOrCount.trim().toLowerCase();
  if (norm.includes("insuficiente")) {
    return "Amostra insuficiente (< 10 mãos)";
  }
  if (norm.includes("formacao") || norm.includes("formação")) {
    return "Amostra em formação (10–29 mãos)";
  }
  if (norm.includes("solida") || norm.includes("sólida") || norm.includes("consistente")) {
    return "Amostra consistente (>= 30 mãos)";
  }
  return confidenceOrCount;
}

/**
 * Converte tags de origem de solução em descrições amigáveis em pt-BR.
 */
export function formatStrategySourceBadgePtBr(sourceTag?: string | null): string {
  if (!sourceTag) return "Referência MTT";
  const norm = sourceTag.trim().toUpperCase();
  if (norm === "IMPORTED_CHART_NO_EV") return "Tabela pré-flop · Sem EV";
  if (norm === "TEXAS_SOLVER_VERIFIED" || norm === "VERIFIED_TEXASSOLVER") {
    return "Solver Pós-flop Verificado";
  }
  if (norm === "REAL_TEXAS_SOLVER" || norm === "SOLVER_REAL") {
    return "TexasSolver Real";
  }
  if (norm === "CURRICULUM_DIDACTIC") {
    return "Material Didático RegLife";
  }
  return sourceTag.replace(/_/g, " ");
}
