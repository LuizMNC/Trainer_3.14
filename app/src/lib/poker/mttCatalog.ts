import type { CanonicalSpot, LegacyRangeSpot } from "./strategySchema.ts";

export type RangeFormatClassification =
  | "MTT_CONFIRMED"
  | "SPIN_AND_GO_CONFIRMED"
  | "CASH_GAME_CONFIRMED"
  | "FORMAT_UNKNOWN";

export type MttModality = "MTT_CHEV" | "MTT_ICM" | "MTT_PKO";

export interface RangeFormatAuditEntry {
  spotId: string;
  spotName: string;
  classification: RangeFormatClassification;
  modality: MttModality | "EXCLUDED_SPIN_AND_GO" | "EXCLUDED_CASH_GAME" | "EXCLUDED_UNKNOWN";
  tableSizeLabel: string;
  includedInMttApp: boolean;
  evidence: string;
}

const SPIN_PNG_SOURCES = new Set([
  "4. Pré-Flop/Botão.png",
  "4. Pré-Flop/Cutoff.png",
  "4. Pré-Flop/Botao - Call.png",
  "4. Pré-Flop/BigBlind - Call.png",
]);

const SPIN_RE = /\bspin\b|spin\s*&?\s*go|\bsng\b|sit\s*&?\s*go|jackpot/i;
const CASH_RE = /\bcash(?:\s+game)?\b|\bnl\d+\b/i;

export const UNAVAILABLE_MTT_EXERCISE_MESSAGE =
  "Este exercício não está disponível no modo MTT.";

/**
 * Classifica um spot legado (`ranges_gto.json`) estritamente por evidência explícita de origem e metadados.
 * Nunca promove formato desconhecido automaticamente a MTT e nunca classifica apenas por stack ou número de jogadores.
 */
export function classifyLegacyRangeSpot(spot: LegacyRangeSpot): RangeFormatAuditEntry {
  const source = (spot.source ?? "").trim();
  const idLower = (spot.id ?? "").toLowerCase();
  const name = spot.name ?? "";

  if (
    idLower.startsWith("spin_") ||
    SPIN_RE.test(name) ||
    SPIN_PNG_SOURCES.has(source) ||
    source.startsWith("4. Pré-Flop/")
  ) {
    return {
      spotId: spot.id,
      spotName: spot.name,
      classification: "SPIN_AND_GO_CONFIRMED",
      modality: "EXCLUDED_SPIN_AND_GO",
      tableSizeLabel: "3-Max Spin & Go (excl.)",
      includedInMttApp: false,
      evidence: `ID='${spot.id}', nome='${spot.name}', origem='${source}' (charts PNG 3-Max Spin & Go).`,
    };
  }

  if (CASH_RE.test(name) || CASH_RE.test(source) || idLower.startsWith("cash_")) {
    return {
      spotId: spot.id,
      spotName: spot.name,
      classification: "CASH_GAME_CONFIRMED",
      modality: "EXCLUDED_CASH_GAME",
      tableSizeLabel: "Cash Game (excl.)",
      includedInMttApp: false,
      evidence: `Marcador explícito de Cash Game em nome/origem ('${source}').`,
    };
  }

  if (source.startsWith("PDF - Ranges RFI e vs RFI.pdf")) {
    return {
      spotId: spot.id,
      spotName: spot.name,
      classification: "MTT_CONFIRMED",
      modality: "MTT_CHEV",
      tableSizeLabel: "MTT 8-Max (Ante 0.125 BB)",
      includedInMttApp: true,
      evidence: `Extraído de '${source}' (acervo MTT 8-Max chipEV, 14–100 BB, ante por jogador 0.125 BB, referenciado pelo manifesto TexasSolver).`,
    };
  }

  return {
    spotId: spot.id,
    spotName: spot.name,
    classification: "FORMAT_UNKNOWN",
    modality: "EXCLUDED_UNKNOWN",
    tableSizeLabel: "Formato desconhecido",
    includedInMttApp: false,
    evidence: `Origem '${source || "vazia"}' sem comprovação explícita de torneio MTT; não promovido automaticamente.`,
  };
}

export function inferCanonicalMttModality(spot: CanonicalSpot): MttModality {
  const icmMode = spot.referenceStrategy.assumptions?.icmMode;
  const idLower = spot.spotId.toLowerCase();
  const nameLower = spot.name.toLowerCase();

  if (icmMode === "PKO_BOUNTY" || idLower.includes("pko") || /\bpko\b|bounty/i.test(nameLower)) {
    return "MTT_PKO";
  }
  if (icmMode === "ICM" || idLower.includes("icm") || /\bicm\b|bubble|mesa final/i.test(nameLower)) {
    return "MTT_ICM";
  }
  return "MTT_CHEV";
}

/**
 * Classifica um spot canônico (`CanonicalSpot`) conforme proveniência, formato explícito e modalidade MTT.
 */
export function classifyCanonicalSpot(spot: CanonicalSpot): RangeFormatAuditEntry {
  const ref = spot?.referenceStrategy;
  const srcRef = (ref?.solutionSource?.fileOrReference ?? "").trim();
  const idLower = (spot?.spotId ?? "").toLowerCase();
  const name = spot?.name ?? "";
  const explicitFormat = ref?.assumptions?.format ?? spot?.format;

  if (!ref || typeof ref !== "object") {
    return {
      spotId: spot?.spotId ?? "",
      spotName: name,
      classification: "FORMAT_UNKNOWN",
      modality: "EXCLUDED_UNKNOWN",
      tableSizeLabel: "Formato desconhecido",
      includedInMttApp: false,
      evidence: "Spot sem estrutura referenceStrategy válida; não promovido automaticamente a MTT.",
    };
  }

  if (
    explicitFormat === "SNG" ||
    idLower.startsWith("spin_") ||
    idLower.startsWith("sng_") ||
    SPIN_RE.test(idLower) ||
    SPIN_RE.test(name) ||
    SPIN_PNG_SOURCES.has(srcRef) ||
    srcRef.startsWith("4. Pré-Flop/")
  ) {
    return {
      spotId: spot.spotId,
      spotName: spot.name,
      classification: "SPIN_AND_GO_CONFIRMED",
      modality: "EXCLUDED_SPIN_AND_GO",
      tableSizeLabel: `${spot.playersInitial}-Max Spin/SNG (excl.)`,
      includedInMttApp: false,
      evidence: `Formato='${String(explicitFormat)}', origem='${srcRef || spot.spotId}' identificado como Spin & Go / SNG.`,
    };
  }

  if (
    explicitFormat === "CASH" ||
    CASH_RE.test(name) ||
    CASH_RE.test(srcRef) ||
    CASH_RE.test(idLower) ||
    idLower.startsWith("cash_")
  ) {
    return {
      spotId: spot.spotId,
      spotName: spot.name,
      classification: "CASH_GAME_CONFIRMED",
      modality: "EXCLUDED_CASH_GAME",
      tableSizeLabel: "Cash Game (excl.)",
      includedInMttApp: false,
      evidence: `Formato='${String(explicitFormat)}', origem='${srcRef || spot.spotId}' identificado como Cash Game.`,
    };
  }

  const hasMttProvenance =
    explicitFormat === "MTT" &&
    (srcRef.startsWith("PDF - Ranges RFI e vs RFI.pdf") ||
      srcRef.includes("texassolver") ||
      srcRef.startsWith("curriculum.ts#") ||
      srcRef.startsWith("solverAdapter.ts#") ||
      ref.status === "VERIFIED" ||
      ref.status === "UNSOLVED" ||
      ref.status === "DIDACTIC_DEMO");

  if (hasMttProvenance) {
    const modality = inferCanonicalMttModality(spot);
    return {
      spotId: spot.spotId,
      spotName: spot.name,
      classification: "MTT_CONFIRMED",
      modality,
      tableSizeLabel: `${spot.playersInitial}-Max MTT (Ante ${spot.anteBbPerPlayer} BB)`,
      includedInMttApp: true,
      evidence: `Formato explícito MTT (${modality}, ${spot.playersInitial}-Max) com origem auditável '${srcRef || "catálogo curricular"}'.`,
    };
  }

  return {
    spotId: spot.spotId,
    spotName: spot.name,
    classification: "FORMAT_UNKNOWN",
    modality: "EXCLUDED_UNKNOWN",
    tableSizeLabel: "Formato desconhecido",
    includedInMttApp: false,
    evidence: `Formato '${String(explicitFormat)}' ou origem '${srcRef}' sem comprovação explícita de MTT.`,
  };
}

export function isConfirmedMttLegacySpot(spot: LegacyRangeSpot): boolean {
  return classifyLegacyRangeSpot(spot).classification === "MTT_CONFIRMED";
}

export function isConfirmedMttCanonicalSpot(spot: CanonicalSpot): boolean {
  return classifyCanonicalSpot(spot).classification === "MTT_CONFIRMED";
}

export function filterConfirmedMttLegacySpots(spots: readonly LegacyRangeSpot[]): LegacyRangeSpot[] {
  return spots.filter(isConfirmedMttLegacySpot);
}

export function filterConfirmedMttCanonicalSpots(spots: readonly CanonicalSpot[]): CanonicalSpot[] {
  return spots.filter(isConfirmedMttCanonicalSpot);
}

export function isSpotIdExcludedFromMtt(
  spotId: string,
  spotName?: string | null,
  sourceRef?: string | null,
  explicitFormat?: string | null,
): boolean {
  const lower = (spotId ?? "").trim().toLowerCase();
  const name = (spotName ?? "").trim();
  const source = (sourceRef ?? "").trim();
  const fmt = (explicitFormat ?? "").trim().toUpperCase();

  if (fmt === "SNG" || fmt === "SNG_SPIN" || fmt === "CASH") return true;
  if (lower.startsWith("spin_") || lower.startsWith("sng_") || lower.startsWith("cash_")) {
    return true;
  }
  if (
    SPIN_RE.test(lower) ||
    SPIN_RE.test(name) ||
    SPIN_PNG_SOURCES.has(source) ||
    source.startsWith("4. Pré-Flop/")
  ) {
    return true;
  }
  if (CASH_RE.test(lower) || CASH_RE.test(name) || CASH_RE.test(source)) {
    return true;
  }
  return false;
}

/**
 * Resolve acesso direto a um spot por identificador apenas quando confirmado no catálogo MTT ativo.
 * Nunca promove spots desconhecidos nem escolhe outro spot automaticamente.
 */
export function resolveActiveMttSpot(
  spotId: string | null | undefined,
  activeCanonicalSpots: readonly CanonicalSpot[],
): { spot: CanonicalSpot | null; unavailableMessage: string | null } {
  const cleanId = (spotId ?? "").trim();
  if (!cleanId) return { spot: null, unavailableMessage: null };
  if (isSpotIdExcludedFromMtt(cleanId)) {
    return { spot: null, unavailableMessage: UNAVAILABLE_MTT_EXERCISE_MESSAGE };
  }
  const found =
    activeCanonicalSpots.find(
      (s) => s.spotId === cleanId && isConfirmedMttCanonicalSpot(s),
    ) ?? null;
  if (!found) {
    return { spot: null, unavailableMessage: UNAVAILABLE_MTT_EXERCISE_MESSAGE };
  }
  return { spot: found, unavailableMessage: null };
}

export function auditRangeCatalogSummary(
  legacySpots: readonly LegacyRangeSpot[],
  canonicalExtraSpots: readonly CanonicalSpot[] = [],
) {
  const legacyAudit = legacySpots.map(classifyLegacyRangeSpot);
  const extraAudit = canonicalExtraSpots.map(classifyCanonicalSpot);
  const all = [...legacyAudit, ...extraAudit];

  return {
    totalInspected: all.length,
    mttConfirmed: all.filter((e) => e.classification === "MTT_CONFIRMED").length,
    spinAndGoConfirmed: all.filter((e) => e.classification === "SPIN_AND_GO_CONFIRMED").length,
    cashGameConfirmed: all.filter((e) => e.classification === "CASH_GAME_CONFIRMED").length,
    formatUnknown: all.filter((e) => e.classification === "FORMAT_UNKNOWN").length,
    byModality: {
      MTT_CHEV: all.filter((e) => e.modality === "MTT_CHEV").length,
      MTT_ICM: all.filter((e) => e.modality === "MTT_ICM").length,
      MTT_PKO: all.filter((e) => e.modality === "MTT_PKO").length,
    },
    entries: all,
  };
}

export const MTT_MODALITY_LABELS: Record<MttModality, string> = {
  MTT_CHEV: "MTT chipEV",
  MTT_ICM: "MTT com ICM ($EV)",
  MTT_PKO: "MTT PKO (Bounty)",
};
