export const RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

export type Rank = (typeof RANKS)[number];

export type SuitSymbol = "♠" | "♥" | "♦" | "♣";
export type SuitCode = "s" | "h" | "d" | "c";

export const SUIT_SYMBOLS: readonly SuitSymbol[] = ["♠", "♥", "♦", "♣"];
export const SUIT_CODES: readonly SuitCode[] = ["s", "h", "d", "c"];

const SYMBOL_TO_CODE: Record<SuitSymbol, SuitCode> = {
  "♠": "s",
  "♥": "h",
  "♦": "d",
  "♣": "c",
};

const CODE_TO_SYMBOL: Record<SuitCode, SuitSymbol> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export interface PlayingCard {
  rank: Rank;
  suit: SuitSymbol;
}

export interface CardCombo {
  cards: [string, string];
  handClass: string;
}

export function isRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

export function normalizeCardCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length !== 2) {
    throw new Error(`Carta inválida: "${input}". Esperado formato como "As" ou "A♠".`);
  }
  const rank = trimmed[0].toUpperCase();
  const rawSuit = trimmed[1];
  if (!isRank(rank)) {
    throw new Error(`Rank inválido na carta "${input}".`);
  }
  if (rawSuit in SYMBOL_TO_CODE) {
    return `${rank}${SYMBOL_TO_CODE[rawSuit as SuitSymbol]}`;
  }
  const lowerSuit = rawSuit.toLowerCase();
  if ((SUIT_CODES as readonly string[]).includes(lowerSuit)) {
    return `${rank}${lowerSuit}`;
  }
  throw new Error(`Naipe inválido na carta "${input}".`);
}

export function parseCard(input: string): PlayingCard {
  const code = normalizeCardCode(input);
  return {
    rank: code[0] as Rank,
    suit: CODE_TO_SYMBOL[code[1] as SuitCode],
  };
}

export function cardToCode(card: PlayingCard | string): string {
  if (typeof card === "string") return normalizeCardCode(card);
  return `${card.rank}${SYMBOL_TO_CODE[card.suit]}`;
}

export function formatCardDisplay(card: string): PlayingCard {
  return parseCard(card);
}

export function validateDeckUnique(cards: readonly (string | PlayingCard)[]): {
  valid: boolean;
  normalized: string[];
  duplicates: string[];
  error?: string;
} {
  const seen = new Set<string>();
  const normalized: string[] = [];
  const duplicates: string[] = [];

  for (const c of cards) {
    let code: string;
    try {
      code = cardToCode(c);
    } catch (err) {
      return {
        valid: false,
        normalized,
        duplicates,
        error: err instanceof Error ? err.message : "Carta inválida.",
      };
    }
    if (seen.has(code)) {
      duplicates.push(code);
    } else {
      seen.add(code);
    }
    normalized.push(code);
  }

  if (duplicates.length > 0) {
    return {
      valid: false,
      normalized,
      duplicates,
      error: `Cartas duplicadas detectadas: ${duplicates.join(", ")}.`,
    };
  }

  return { valid: true, normalized, duplicates: [] };
}

export function cellToHand(r: number, c: number): string {
  if (r < 0 || r > 12 || c < 0 || c > 12) {
    throw new Error(`Índice de célula fora da grade 13x13: (${r}, ${c}).`);
  }
  if (r === c) return `${RANKS[r]}${RANKS[c]}`;
  if (r < c) return `${RANKS[r]}${RANKS[c]}s`;
  return `${RANKS[c]}${RANKS[r]}o`;
}

export function getHandCombos(hand: string): number {
  if (hand.length === 2) return 6;
  return hand.endsWith("s") ? 4 : 12;
}

export function getAll169Hands(): string[] {
  const list: string[] = [];
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      list.push(cellToHand(r, c));
    }
  }
  return list;
}

export function comboToHandClass(c1: string, c2: string): string {
  const n1 = normalizeCardCode(c1);
  const n2 = normalizeCardCode(c2);
  if (n1 === n2) {
    throw new Error(`Combo inválido com carta duplicada: ${n1}.`);
  }
  const r1 = n1[0] as Rank;
  const r2 = n2[0] as Rank;
  const s1 = n1[1];
  const s2 = n2[1];
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);

  if (i1 === i2) return `${r1}${r2}`;
  const hi = i1 < i2 ? r1 : r2;
  const lo = i1 < i2 ? r2 : r1;
  return `${hi}${lo}${s1 === s2 ? "s" : "o"}`;
}

export function expandHandClassToCombos(handClass: string): CardCombo[] {
  if (!/^[AKQJT2-9]{2}[so]?$/.test(handClass)) {
    throw new Error(`Classe de mão inválida: "${handClass}".`);
  }
  const r1 = handClass[0] as Rank;
  const r2 = handClass[1] as Rank;
  const i1 = RANKS.indexOf(r1);
  const i2 = RANKS.indexOf(r2);

  if (handClass.length === 2) {
    if (r1 !== r2) {
      throw new Error(`Par inválido: "${handClass}".`);
    }
    const combos: CardCombo[] = [];
    for (let a = 0; a < SUIT_CODES.length; a++) {
      for (let b = a + 1; b < SUIT_CODES.length; b++) {
        combos.push({
          cards: [`${r1}${SUIT_CODES[a]}`, `${r2}${SUIT_CODES[b]}`],
          handClass,
        });
      }
    }
    return combos;
  }

  if (i1 >= i2) {
    throw new Error(`Ordem de ranks inválida em "${handClass}" (esperado carta maior primeiro).`);
  }

  const suited = handClass.endsWith("s");
  const combos: CardCombo[] = [];
  if (suited) {
    for (const s of SUIT_CODES) {
      combos.push({
        cards: [`${r1}${s}`, `${r2}${s}`],
        handClass,
      });
    }
  } else {
    for (const s1 of SUIT_CODES) {
      for (const s2 of SUIT_CODES) {
        if (s1 !== s2) {
          combos.push({
            cards: [`${r1}${s1}`, `${r2}${s2}`],
            handClass,
          });
        }
      }
    }
  }
  return combos;
}

export function generateAll1326Combos(): CardCombo[] {
  const all: CardCombo[] = [];
  for (const hand of getAll169Hands()) {
    all.push(...expandHandClassToCombos(hand));
  }
  return all;
}

export function getAvailableCombosForClass(
  handClass: string,
  deadCards: readonly (string | PlayingCard)[] = [],
): CardCombo[] {
  const check = validateDeckUnique(deadCards);
  if (!check.valid) {
    throw new Error(check.error ?? "Cartas mortas inválidas.");
  }
  const deadSet = new Set(check.normalized);
  return expandHandClassToCombos(handClass).filter(
    (c) => !deadSet.has(c.cards[0]) && !deadSet.has(c.cards[1]),
  );
}

export function countAvailableCombosByClass(
  deadCards: readonly (string | PlayingCard)[] = [],
): { byClass: Record<string, number>; totalCombos: number } {
  const check = validateDeckUnique(deadCards);
  if (!check.valid) {
    throw new Error(check.error ?? "Cartas mortas inválidas.");
  }
  const deadSet = new Set(check.normalized);
  const byClass: Record<string, number> = {};
  let totalCombos = 0;

  for (const hand of getAll169Hands()) {
    const avail = expandHandClassToCombos(hand).filter(
      (c) => !deadSet.has(c.cards[0]) && !deadSet.has(c.cards[1]),
    ).length;
    byClass[hand] = avail;
    totalCombos += avail;
  }

  return { byClass, totalCombos };
}

export function sampleCardsForHand(
  handClass: string,
  deadCards: readonly (string | PlayingCard)[] = [],
  rng: () => number = Math.random,
): [PlayingCard, PlayingCard] {
  const available = getAvailableCombosForClass(handClass, deadCards);
  if (available.length === 0) {
    throw new Error(
      `Nenhum combo disponível para ${handClass} após card removal (${deadCards.length} cartas mortas).`,
    );
  }
  const picked = available[Math.floor(rng() * available.length)];
  return [parseCard(picked.cards[0]), parseCard(picked.cards[1])];
}
