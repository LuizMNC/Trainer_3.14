export type CardStyleId =
  | "four-color"
  | "classic-two"
  | "dark-gold"
  | "high-contrast";

export type ChipStyleId = "casino-clay" | "neon-pro" | "classic-gold";

export interface TableAppearanceConfig {
  presetId: string;
  feltColor: string;
  railColor: string;
  cardStyle: CardStyleId;
  chipStyle: ChipStyleId;
}

export interface TableColorPreset {
  id: string;
  label: string;
  feltColor: string;
  railColor: string;
}

export const TABLE_APPEARANCE_STORAGE_KEY = "treinerlm_table_appearance_v1";

export const DEFAULT_TABLE_APPEARANCE: TableAppearanceConfig = {
  presetId: "red-black-blue",
  feltColor: "#0B1B36",
  railColor: "#991B1B",
  cardStyle: "four-color",
  chipStyle: "casino-clay",
};

export const TABLE_COLOR_PRESETS: readonly TableColorPreset[] = [
  { id: "red-black-blue", label: "TreinerLM (Preto, Azul & Vermelho)", feltColor: "#0B1B36", railColor: "#991B1B" },
  { id: "crimson-noir", label: "Preto & Vermelho", feltColor: "#240B12", railColor: "#DC2626" },
  { id: "casino-blue", label: "Azul Cassino", feltColor: "#122B4A", railColor: "#2563EB" },
  { id: "emerald", label: "Esmeralda GTO", feltColor: "#14332B", railColor: "#292C2F" },
  { id: "noir-gold", label: "Noir Dourado", feltColor: "#1B1C20", railColor: "#8A6B27" },
  { id: "quantum-purple", label: "Roxo Deepstack", feltColor: "#2A1845", railColor: "#4B356E" },
];

export const CARD_STYLE_OPTIONS: readonly {
  id: CardStyleId;
  label: string;
  hint: string;
}[] = [
  { id: "four-color", label: "4 Cores GTO", hint: "♠ cinza · ♥ vermelho · ♦ azul · ♣ verde" },
  { id: "classic-two", label: "Clássico 2 Cores", hint: "Face branca tradicional ♥♦ / ♠♣" },
  { id: "dark-gold", label: "Luxo Noir", hint: "Cartas escuras com aro dourado" },
  { id: "high-contrast", label: "Alto Contraste", hint: "Fundo branco sólido + 4 cores fortes" },
];

export const CHIP_STYLE_OPTIONS: readonly {
  id: ChipStyleId;
  label: string;
  hint: string;
}[] = [
  { id: "casino-clay", label: "Casino Clay", hint: "Fichas listradas de argila clássicas" },
  { id: "neon-pro", label: "Neon Pro", hint: "Aro luminoso de alto contraste" },
  { id: "classic-gold", label: "Clássico Dourado", hint: "Estilo High Stakes dourado e marfim" },
];

export const SCIENTIST_BY_POSITION: Readonly<Record<string, string>> = {
  UTG: "Newton",
  MP: "Einstein",
  LJ: "Curie",
  HJ: "Tesla",
  CO: "Euler",
  BTN: "Gauss",
  SB: "Noether",
  BB: "Turing",
};

const SCIENTIST_FALLBACK_LIST = [
  "Newton",
  "Einstein",
  "Curie",
  "Tesla",
  "Euler",
  "Gauss",
  "Noether",
  "Turing",
] as const;

export function getOpponentScientistName(position: string, seatIndex = 0): string {
  return (
    SCIENTIST_BY_POSITION[position] ??
    SCIENTIST_FALLBACK_LIST[Math.abs(seatIndex) % SCIENTIST_FALLBACK_LIST.length]
  );
}

export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function shadeHexColor(hex: string, factor: number): string {
  const safe = normalizeHexColor(hex, "#14332B");
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  const scale = (channel: number) =>
    Math.max(0, Math.min(255, Math.round(channel * factor)))
      .toString(16)
      .padStart(2, "0");
  return `#${scale(r)}${scale(g)}${scale(b)}`.toUpperCase();
}

export function buildFeltGradient(feltColor: string): string {
  const center = shadeHexColor(normalizeHexColor(feltColor, DEFAULT_TABLE_APPEARANCE.feltColor), 1.18);
  const mid = shadeHexColor(normalizeHexColor(feltColor, DEFAULT_TABLE_APPEARANCE.feltColor), 0.72);
  const edge = shadeHexColor(normalizeHexColor(feltColor, DEFAULT_TABLE_APPEARANCE.feltColor), 0.42);
  return `radial-gradient(ellipse at center, ${center} 0%, ${mid} 68%, ${edge} 100%)`;
}

export function sanitizeTableAppearance(raw: unknown): TableAppearanceConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TABLE_APPEARANCE };
  const candidate = raw as Partial<TableAppearanceConfig>;
  const validCards = new Set<CardStyleId>(["four-color", "classic-two", "dark-gold", "high-contrast"]);
  const validChips = new Set<ChipStyleId>(["casino-clay", "neon-pro", "classic-gold"]);
  return {
    presetId: typeof candidate.presetId === "string" && candidate.presetId.trim() ? candidate.presetId : "custom",
    feltColor: normalizeHexColor(candidate.feltColor ?? "", DEFAULT_TABLE_APPEARANCE.feltColor),
    railColor: normalizeHexColor(candidate.railColor ?? "", DEFAULT_TABLE_APPEARANCE.railColor),
    cardStyle: candidate.cardStyle && validCards.has(candidate.cardStyle) ? candidate.cardStyle : DEFAULT_TABLE_APPEARANCE.cardStyle,
    chipStyle: candidate.chipStyle && validChips.has(candidate.chipStyle) ? candidate.chipStyle : DEFAULT_TABLE_APPEARANCE.chipStyle,
  };
}

export function loadTableAppearance(): TableAppearanceConfig {
  if (typeof window === "undefined") return { ...DEFAULT_TABLE_APPEARANCE };
  try {
    const raw = window.localStorage.getItem(TABLE_APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TABLE_APPEARANCE };
    return sanitizeTableAppearance(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TABLE_APPEARANCE };
  }
}

export function saveTableAppearance(config: TableAppearanceConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TABLE_APPEARANCE_STORAGE_KEY, JSON.stringify(sanitizeTableAppearance(config)));
  } catch {
    // Ignora quota cheia em navegação privada
  }
}
