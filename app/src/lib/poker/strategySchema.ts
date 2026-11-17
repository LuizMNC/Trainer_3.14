import { getAll169Hands, getHandCombos } from "./cards.ts";
import type { GameFormat, GameVariant, Street } from "./stateEngine.ts";

export type CurriculumTrackId =
  | "PREFLOP_RFI"
  | "FLOP_CBET_IP_VS_BB"
  | "TURN_RIVER_CBET_IP_VS_BB"
  | "PREFLOP_VS_RFI"
  | "PREFLOP_BB_DEFENSE"
  | "PREFLOP_SB_VS_BB"
  | "POSTFLOP_BB_VS_CBET";

export type StrategyStatus =
  | "VERIFIED"
  | "IMPORTED_CHART_NO_EV"
  | "DIDACTIC_DEMO"
  | "UNSOLVED";

export type StrategyUnit = "bbEV" | "chips" | "$EV";

export interface SolutionAssumptions {
  format: GameFormat;
  variant: GameVariant;
  playersInitial: number;
  effectiveStackBb: number;
  anteBbPerPlayer: number;
  rakePct: number;
  betSizingsLabel: string;
  icmMode: "chipEV" | "ICM" | "PKO_BOUNTY";
  solverName: string;
  solverVersion?: string;
  convergenceTargetPct?: number;
  achievedExploitabilityPct?: number;
  board?: string[];
  potSizeBb?: number;
  heroPosition?: string;
  villainPosition?: string | null;
  actionHistorySignature?: string;
  rangesSignature?: string;
  rangesSourceRef?: string;
}

export interface SolutionSource {
  providerType: "ImportedVerifiedSolution" | "SolverAdapter" | "DidacticDemo" | "ChartImport" | "NoSolution";
  label: string;
  fileOrReference: string;
  importedAtIso: string;
  generatedAtIso?: string;
  licenseNote?: string;
  fileSha256?: string;
  configSha256?: string;
  rangesSha256?: string;
  evAvailable?: boolean;
}

export interface MatrixCellDeviation {
  hand: string;
  sum: number;
  deltaFromOne: number;
  category: "ROUNDING_RESIDUAL" | "EXTRACTION_LOSS_MINOR" | "EXTRACTION_LOSS_SEVERE" | "INVALID_DISTRIBUTION";
  detail: string;
}

export interface MatrixIntegrityAudit {
  totalCells: number;
  exactCellsCount: number;
  roundingResidualsCount: number;
  minorExtractionLossCount: number;
  severeExtractionLossCount: number;
  unreliableCellsCount: number;
  hasUnreliableCells: boolean;
  flaggedCells: MatrixCellDeviation[];
  sourceReference: string;
  neverAutoNormalized: true;
}

export interface ReferenceStrategy {
  status: StrategyStatus;
  evUnit: StrategyUnit | null;
  actionFrequencies: Record<string, number> | null;
  actionEv: Record<string, number> | null;
  matrixFrequencies?: Record<string, Record<string, number>> | null;
  matrixEv?: Record<string, Record<string, number>> | null;
  comboBreakdown?: Record<string, Record<string, Record<string, number>>> | null;
  evUnavailableReason?: string;
  solutionSource: SolutionSource | null;
  assumptions: SolutionAssumptions | null;
  assumptionsHash: string | null;
  validationWarnings?: string[];
  integrityAudit?: MatrixIntegrityAudit;
}

export interface LessonMetadata {
  trackId: CurriculumTrackId;
  concepts: string[];
  interpretationSource: string;
  conceptualGuidance: string;
}

export interface CanonicalAction {
  name: string;
  color: string;
  pct?: number;
}

export interface CanonicalSpot {
  spotId: string;
  name: string;
  trackId: CurriculumTrackId;
  spotType: string;
  format: GameFormat;
  variant: GameVariant;
  playersInitial: number;
  street: Street;
  board: string[];
  heroPosition: string;
  villainPosition: string | null;
  heroCards: [string, string] | null;
  effectiveStackBb: number;
  anteBbPerPlayer: number;
  potBb: number | null;
  legalActions: CanonicalAction[];
  referenceStrategy: ReferenceStrategy;
  lesson: LessonMetadata;
}

export interface LegacyRangeSpot {
  id: string;
  name: string;
  stackBb: number;
  heroPosition: string;
  villainPosition: string | null;
  spotType: "rfi" | "vs_rfi" | "vs_limp" | "push_fold" | "vs_shove";
  source: string;
  actions: { name: string; color: string; pct: number }[];
  matrix: Record<string, Record<string, number>>;
}

export interface StrategyProvider {
  readonly providerName: string;
  getStrategy(spotId: string): ReferenceStrategy;
}

export function computeAssumptionsHash(assumptions: SolutionAssumptions): string {
  const canonicalObj: Record<string, unknown> = {
    format: assumptions.format,
    variant: assumptions.variant,
    playersInitial: assumptions.playersInitial,
    effectiveStackBb: assumptions.effectiveStackBb,
    anteBbPerPlayer: assumptions.anteBbPerPlayer,
    rakePct: assumptions.rakePct,
    betSizingsLabel: assumptions.betSizingsLabel,
    icmMode: assumptions.icmMode,
    solverName: assumptions.solverName,
    solverVersion: assumptions.solverVersion ?? "",
    convergenceTargetPct: assumptions.convergenceTargetPct ?? null,
  };
  if (assumptions.board && assumptions.board.length > 0) canonicalObj.board = assumptions.board;
  if (typeof assumptions.potSizeBb === "number") canonicalObj.potSizeBb = assumptions.potSizeBb;
  if (assumptions.heroPosition) canonicalObj.heroPosition = assumptions.heroPosition;
  if (assumptions.villainPosition !== undefined) canonicalObj.villainPosition = assumptions.villainPosition;
  if (assumptions.actionHistorySignature) canonicalObj.actionHistorySignature = assumptions.actionHistorySignature;
  if (assumptions.rangesSignature) canonicalObj.rangesSignature = assumptions.rangesSignature;
  if (assumptions.rangesSourceRef) canonicalObj.rangesSourceRef = assumptions.rangesSourceRef;

  const canonical = JSON.stringify(canonicalObj);

  // FNV-1a 64-bit determinístico (browser + Node sem dependências)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `fnv1a_${part1}${part2}`;
}

export function validateHandDistribution(
  dist: Record<string, number>,
  legalActionNames?: readonly string[],
  tolerance = 0.02,
): { valid: boolean; sum: number; errors: string[] } {
  const errors: string[] = [];
  let sum = 0;

  for (const [action, freq] of Object.entries(dist)) {
    if (!Number.isFinite(freq) || freq < -1e-6 || freq > 1 + 1e-6) {
      errors.push(`Frequência inválida para '${action}': ${freq} (esperado 0..1).`);
    }
    if (legalActionNames && !legalActionNames.includes(action)) {
      errors.push(`Ação '${action}' não pertence às ações legais [${legalActionNames.join(", ")}].`);
    }
    sum += freq;
  }

  if (Math.abs(sum - 1) > tolerance) {
    errors.push(`Soma das frequências (${sum.toFixed(4)}) diverge de 1.0 além da tolerância (${tolerance}).`);
  }

  return {
    valid: errors.length === 0,
    sum: Math.round(sum * 10000) / 10000,
    errors,
  };
}

export class NoSolutionProvider implements StrategyProvider {
  readonly providerName = "NoSolution";

  getStrategy(): ReferenceStrategy {
    return {
      status: "UNSOLVED",
      evUnit: null,
      actionFrequencies: null,
      actionEv: null,
      matrixFrequencies: null,
      matrixEv: null,
      solutionSource: {
        providerType: "NoSolution",
        label: "UNSOLVED — Sem solução verificada carregada",
        fileOrReference: "none",
        importedAtIso: new Date(0).toISOString(),
      },
      assumptions: null,
      assumptionsHash: null,
    };
  }
}

export class DidacticDemoProvider implements StrategyProvider {
  readonly providerName = "DidacticDemo";
  private readonly store: Map<string, ReferenceStrategy>;

  constructor(entries: Record<string, ReferenceStrategy>) {
    this.store = new Map(Object.entries(entries));
  }

  getStrategy(spotId: string): ReferenceStrategy {
    return this.store.get(spotId) ?? new NoSolutionProvider().getStrategy();
  }
}

export interface VerifiedSolutionImportPayload {
  spotId: string;
  evUnit: StrategyUnit;
  legalActions: string[];
  assumptions: SolutionAssumptions;
  solutionSourceLabel: string;
  fileOrReference: string;
  fileSha256: string;
  convergenceExploitabilityPct?: number;
  matrixFrequencies: Record<string, Record<string, number>>;
  matrixEv: Record<string, Record<string, number>>;
}

const FORBIDDEN_SYNTHETIC_SOLVERS_RE = /(synthetic|mock|manual|didactic|dummy|fake|exemplo|teste|solveradapter reference)/i;
const FORBIDDEN_PLACEHOLDER_REFS = new Set(["none", "unknown", "test", "test.json", "broken.json", "invalid", "mock.json"]);

export function validateAndBuildVerifiedStrategy(
  payload: VerifiedSolutionImportPayload,
  tolerance = 0.02,
): { ok: true; strategy: ReferenceStrategy } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!payload.spotId?.trim()) errors.push("spotId obrigatório.");
  if (!["bbEV", "chips", "$EV"].includes(payload.evUnit)) {
    errors.push(`Unidade de EV inválida: ${payload.evUnit}.`);
  }
  if (!payload.legalActions || payload.legalActions.length < 2) {
    errors.push("Pelo menos 2 ações legais são obrigatórias.");
  }
  if (!payload.assumptions?.solverName?.trim()) {
    errors.push("Nome do solver obrigatório nas hipóteses da solução.");
  } else if (FORBIDDEN_SYNTHETIC_SOLVERS_RE.test(payload.assumptions.solverName)) {
    errors.push(`Proveniência sintética/teste rejeitada: '${payload.assumptions.solverName}'.`);
  }

  const fileRefClean = (payload.fileOrReference ?? "").trim().toLowerCase();
  if (!fileRefClean || fileRefClean.startsWith("solveradapter.ts#") || FORBIDDEN_PLACEHOLDER_REFS.has(fileRefClean)) {
    errors.push("Referência de arquivo ('fileOrReference') ausente ou genérica.");
  }
  if (typeof payload.fileSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(payload.fileSha256.trim())) {
    errors.push("Hash criptográfico SHA-256 ('fileSha256', 64 hex) obrigatório para integridade do dump.");
  }

  if (
    payload.assumptions.icmMode === "ICM" &&
    payload.evUnit !== "$EV"
  ) {
    errors.push("Soluções em modo ICM devem usar unidade '$EV', nunca 'bbEV'.");
  }
  if (
    payload.assumptions.icmMode === "chipEV" &&
    payload.evUnit === "$EV"
  ) {
    errors.push("Soluções chipEV não devem declarar '$EV' sem conversão monetária explícita.");
  }
  if (!payload.matrixEv || Object.keys(payload.matrixEv).length === 0) {
    errors.push("Tabela 'matrixEv' obrigatória para promover solução genérica a VERIFIED.");
  }

  const allHands = getAll169Hands();
  let invalidCellCount = 0;
  for (const hand of allHands) {
    const dist = payload.matrixFrequencies?.[hand];
    if (!dist) {
      invalidCellCount++;
      if (invalidCellCount <= 5) {
        errors.push(`Mão ausente na matriz: ${hand}.`);
      }
      continue;
    }
    const check = validateHandDistribution(dist, payload.legalActions, tolerance);
    if (!check.valid) {
      invalidCellCount++;
      if (invalidCellCount <= 5) {
        errors.push(`${hand}: ${check.errors.join(" ")}`);
      }
    }
    const evCell = payload.matrixEv?.[hand];
    if (!evCell) {
      invalidCellCount++;
      if (invalidCellCount <= 5) {
        errors.push(`EV ausente na matriz para a mão ${hand}.`);
      }
    } else {
      for (const act of payload.legalActions) {
        const evVal = evCell[act];
        if (typeof evVal !== "number" || !Number.isFinite(evVal)) {
          errors.push(`EV ausente ou inválido em ${hand} -> ${act}.`);
        }
      }
      for (const act of Object.keys(evCell)) {
        if (!payload.legalActions.includes(act)) {
          errors.push(`Ação '${act}' em matrixEv não pertence às ações legais (${hand}).`);
        }
      }
    }
  }
  if (invalidCellCount > 5) {
    errors.push(`... e mais ${invalidCellCount - 5} células com problemas de validação.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const assumptionsHash = computeAssumptionsHash(payload.assumptions);

  return {
    ok: true,
    strategy: {
      status: "VERIFIED",
      evUnit: payload.evUnit,
      actionFrequencies: null,
      actionEv: null,
      matrixFrequencies: payload.matrixFrequencies,
      matrixEv: payload.matrixEv,
      solutionSource: {
        providerType: "ImportedVerifiedSolution",
        label: payload.solutionSourceLabel,
        fileOrReference: payload.fileOrReference,
        importedAtIso: new Date().toISOString(),
        fileSha256: payload.fileSha256.toLowerCase(),
        evAvailable: true,
      },
      assumptions: {
        ...payload.assumptions,
        achievedExploitabilityPct: payload.convergenceExploitabilityPct,
      },
      assumptionsHash,
    },
  };
}

export class ImportedVerifiedProvider implements StrategyProvider {
  readonly providerName = "ImportedVerifiedSolution";
  private readonly solutions = new Map<string, ReferenceStrategy>();

  register(payload: VerifiedSolutionImportPayload): { ok: true } | { ok: false; errors: string[] } {
    const res = validateAndBuildVerifiedStrategy(payload);
    if (!res.ok) return res;
    this.solutions.set(payload.spotId, res.strategy);
    return { ok: true };
  }

  getStrategy(spotId: string): ReferenceStrategy {
    return this.solutions.get(spotId) ?? new NoSolutionProvider().getStrategy();
  }
}

export function mapLegacySpotTypeToTrack(spot: LegacyRangeSpot): CurriculumTrackId {
  if (spot.spotType === "rfi") return "PREFLOP_RFI";
  if (spot.spotType === "vs_limp" || (spot.heroPosition === "BB" && spot.villainPosition === "SB")) {
    return "PREFLOP_SB_VS_BB";
  }
  if (spot.heroPosition === "BB") return "PREFLOP_BB_DEFENSE";
  return "PREFLOP_VS_RFI";
}

export function classifyCellDistributionIntegrity(
  dist: Record<string, number> | null | undefined,
  legalActionNames: readonly string[],
  handClass: string,
): {
  status: "COMPLETE" | "ROUNDING_ONLY" | "INCOMPLETE_MINOR" | "INCOMPLETE_SEVERE" | "INVALID";
  sum: number;
  deltaFromOne: number;
  deviation: MatrixCellDeviation | null;
} {
  if (!dist || typeof dist !== "object") {
    const deviation: MatrixCellDeviation = {
      hand: handClass,
      sum: 0,
      deltaFromOne: 1,
      category: "INVALID_DISTRIBUTION",
      detail: `Mão ausente na matriz (${handClass})`,
    };
    return { status: "INVALID", sum: 0, deltaFromOne: 1, deviation };
  }

  const check = validateHandDistribution(dist, legalActionNames, 0.002);
  const sum = check.sum;
  const diff = Math.round(Math.abs(sum - 1) * 10000) / 10000;
  const hasActionErrors = check.errors.some((e) => !e.includes("Soma das frequências"));

  if (hasActionErrors) {
    const deviation: MatrixCellDeviation = {
      hand: handClass,
      sum,
      deltaFromOne: diff,
      category: "INVALID_DISTRIBUTION",
      detail: check.errors.join(" "),
    };
    return { status: "INVALID", sum, deltaFromOne: diff, deviation };
  }
  if (diff <= 1e-6) {
    return { status: "COMPLETE", sum, deltaFromOne: diff, deviation: null };
  }
  if (diff <= 0.002) {
    return {
      status: "ROUNDING_ONLY",
      sum,
      deltaFromOne: diff,
      deviation: {
        hand: handClass,
        sum,
        deltaFromOne: diff,
        category: "ROUNDING_RESIDUAL",
        detail: `${handClass}: soma=${sum} (resíduo trivial de arredondamento)`,
      },
    };
  }
  if (diff <= 0.03) {
    return {
      status: "INCOMPLETE_MINOR",
      sum,
      deltaFromOne: diff,
      deviation: {
        hand: handClass,
        sum,
        deltaFromOne: diff,
        category: "EXTRACTION_LOSS_MINOR",
        detail: `${handClass}: soma=${sum} (perda menor na extração > 0,002)`,
      },
    };
  }
  return {
    status: "INCOMPLETE_SEVERE",
    sum,
    deltaFromOne: diff,
    deviation: {
      hand: handClass,
      sum,
      deltaFromOne: diff,
      category: "EXTRACTION_LOSS_SEVERE",
      detail: `${handClass}: soma=${sum} (perda relevante na extração)`,
    },
  };
}

export function getSpotHandIntegrityIssue(
  spot: CanonicalSpot | null | undefined,
  handClass: string,
): MatrixCellDeviation | null {
  if (!spot || !spot.referenceStrategy?.matrixFrequencies) return null;
  if (spot.referenceStrategy.status === "UNSOLVED") return null;
  const audited = spot.referenceStrategy.integrityAudit?.flaggedCells.find(
    (c) => c.hand === handClass,
  );
  if (audited) return audited;

  const dist = spot.referenceStrategy.matrixFrequencies[handClass];
  if (!dist) return null;
  const checked = classifyCellDistributionIntegrity(
    dist,
    spot.legalActions.map((a) => a.name),
    handClass,
  );
  if (
    checked.deviation &&
    checked.deviation.category !== "ROUNDING_RESIDUAL"
  ) {
    return checked.deviation;
  }
  return null;
}

export function auditMatrixDistributionIntegrity(
  matrix: Record<string, Record<string, number>>,
  legalActionNames: readonly string[],
  sourceReference: string,
): MatrixIntegrityAudit {
  const hands = getAll169Hands();
  let exactCellsCount = 0;
  let roundingResidualsCount = 0;
  let minorExtractionLossCount = 0;
  let severeExtractionLossCount = 0;
  const flaggedCells: MatrixCellDeviation[] = [];

  for (const hand of hands) {
    const dist = matrix[hand];
    if (!dist) {
      severeExtractionLossCount++;
      flaggedCells.push({
        hand,
        sum: 0,
        deltaFromOne: 1,
        category: "INVALID_DISTRIBUTION",
        detail: `Mão ausente na matriz (${hand})`,
      });
      continue;
    }

    const check = validateHandDistribution(dist, legalActionNames, 0.002);
    const sum = check.sum;
    const diff = Math.round(Math.abs(sum - 1) * 10000) / 10000;
    const hasActionErrors = check.errors.some((e) => !e.includes("Soma das frequências"));

    if (hasActionErrors) {
      severeExtractionLossCount++;
      flaggedCells.push({
        hand,
        sum,
        deltaFromOne: diff,
        category: "INVALID_DISTRIBUTION",
        detail: check.errors.join(" "),
      });
    } else if (diff <= 1e-6) {
      exactCellsCount++;
    } else if (diff <= 0.002) {
      roundingResidualsCount++;
    } else if (diff <= 0.03) {
      minorExtractionLossCount++;
      flaggedCells.push({
        hand,
        sum,
        deltaFromOne: diff,
        category: "EXTRACTION_LOSS_MINOR",
        detail: `${hand}: soma=${sum} (perda menor na extração > 0,002)`,
      });
    } else {
      severeExtractionLossCount++;
      flaggedCells.push({
        hand,
        sum,
        deltaFromOne: diff,
        category: "EXTRACTION_LOSS_SEVERE",
        detail: `${hand}: soma=${sum} (perda relevante na extração)`,
      });
    }
  }

  const unreliableCellsCount = minorExtractionLossCount + severeExtractionLossCount;
  return {
    totalCells: hands.length,
    exactCellsCount,
    roundingResidualsCount,
    minorExtractionLossCount,
    severeExtractionLossCount,
    unreliableCellsCount,
    hasUnreliableCells: unreliableCellsCount > 0,
    flaggedCells,
    sourceReference,
    neverAutoNormalized: true,
  };
}

export function adaptLegacyRangeSpotToCanonical(spot: LegacyRangeSpot): CanonicalSpot {
  const isSpin = spot.id.startsWith("spin_");
  const playersInitial = isSpin ? 3 : 8;
  const anteBbPerPlayer = isSpin ? 0 : 0.125;
  const potBb =
    spot.spotType === "rfi"
      ? 1.5 + playersInitial * anteBbPerPlayer
      : spot.spotType === "vs_limp"
        ? 2.0 + playersInitial * anteBbPerPlayer
        : spot.spotType === "vs_rfi"
          ? (spot.stackBb >= 50 ? 2.3 : 2.0) + 1.5 + playersInitial * anteBbPerPlayer
          : null;

  const legalActionNames = spot.actions.map((a) => a.name);
  const integrityAudit = auditMatrixDistributionIntegrity(
    spot.matrix,
    legalActionNames,
    spot.source,
  );
  const warnings: string[] = [];
  for (const hand of getAll169Hands()) {
    const dist = spot.matrix[hand];
    if (!dist) {
      warnings.push(`Mão ausente: ${hand}`);
      continue;
    }
    const check = validateHandDistribution(dist, legalActionNames, 0.03);
    if (!check.valid) {
      warnings.push(`${hand}: soma=${check.sum}`);
    }
  }

  const assumptions: SolutionAssumptions = {
    format: isSpin ? "SNG" : "MTT",
    variant: "NLHE",
    playersInitial,
    effectiveStackBb: spot.stackBb,
    anteBbPerPlayer,
    rakePct: 0,
    betSizingsLabel: spot.actions.map((a) => a.name).join(" / "),
    icmMode: "chipEV",
    solverName: "Chart Extrator (PDF/PNG local, sem EV de solver)",
  };

  const trackId = mapLegacySpotTypeToTrack(spot);

  return {
    spotId: spot.id,
    name: spot.name,
    trackId,
    spotType: spot.spotType,
    format: isSpin ? "SNG" : "MTT",
    variant: "NLHE",
    playersInitial,
    street: "PREFLOP",
    board: [],
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    heroCards: null,
    effectiveStackBb: spot.stackBb,
    anteBbPerPlayer,
    potBb,
    legalActions: spot.actions.map((a) => ({
      name: a.name,
      color: a.color,
      pct: a.pct,
    })),
    referenceStrategy: {
      status: "IMPORTED_CHART_NO_EV",
      evUnit: null,
      actionFrequencies: null,
      actionEv: null,
      matrixFrequencies: spot.matrix,
      matrixEv: null,
      solutionSource: {
        providerType: "ChartImport",
        label: "Frequências extraídas de chart local (sem tabela EV de solver)",
        fileOrReference: spot.source,
        importedAtIso: "2026-11-12T00:00:00.000Z",
      },
      assumptions,
      assumptionsHash: computeAssumptionsHash(assumptions),
      validationWarnings: warnings.length > 0 ? warnings : undefined,
      integrityAudit,
    },
    lesson: {
      trackId,
      concepts: [spot.spotType.toUpperCase(), spot.heroPosition, `${spot.stackBb}BB`],
      interpretationSource: spot.source,
      conceptualGuidance:
        "Frequências extraídas de material local de estudo. Use como referência de frequência pré-flop; não há EV numérico por ação neste registro.",
    },
  };
}

export function exportSpotMatrixToCsv(spot: CanonicalSpot): string {
  const actions = spot.legalActions.map((a) => a.name);
  const header = [
    "# format=" + spot.format,
    `variant=${spot.variant}`,
    `stack_bb=${spot.effectiveStackBb}`,
    `ante_bb_per_player=${spot.anteBbPerPlayer}`,
    `status=${spot.referenceStrategy.status}`,
    `ev_unit=${spot.referenceStrategy.evUnit ?? "NONE"}`,
    `assumptions_hash=${spot.referenceStrategy.assumptionsHash ?? "NONE"}`,
  ].join("; ");

  const columns = ["hand", "combos_base", ...actions.map((a) => `freq_${a}`)].join(",");
  const rows: string[] = [header, columns];
  const matrix = spot.referenceStrategy.matrixFrequencies ?? {};

  for (const hand of getAll169Hands()) {
    const dist = matrix[hand] ?? {};
    const vals = actions.map((a) => ((dist[a] ?? 0)).toFixed(4));
    rows.push([hand, String(getHandCombos(hand)), ...vals].join(","));
  }
  return rows.join("\n");
}

export function parseSpotMatrixCsv(
  csvText: string,
): { ok: true; handsCount: number; matrixFrequencies: Record<string, Record<string, number>>; actions: string[] } | { ok: false; errors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length < 2) {
    return { ok: false, errors: ["CSV vazio ou sem cabeçalho de colunas."] };
  }

  const header = lines[0].split(",").map((c) => c.trim());
  const handIdx = header.indexOf("hand");
  if (handIdx === -1) {
    return { ok: false, errors: ["Coluna 'hand' não encontrada no CSV."] };
  }

  const actionCols = header
    .map((col, idx) => ({ col, idx }))
    .filter((x) => x.col.startsWith("freq_"));

  if (actionCols.length < 2) {
    return { ok: false, errors: ["CSV precisa de ao menos 2 colunas 'freq_<acao>'."] };
  }

  const actions = actionCols.map((x) => x.col.slice(5));
  const matrixFrequencies: Record<string, Record<string, number>> = {};
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());
    const hand = parts[handIdx];
    if (!hand) continue;
    const dist: Record<string, number> = {};
    for (const ac of actionCols) {
      const val = Number(parts[ac.idx]);
      if (!Number.isFinite(val)) {
        errors.push(`Linha ${i + 1} (${hand}): valor numérico inválido em ${ac.col}.`);
      } else {
        dist[ac.col.slice(5)] = val;
      }
    }
    const check = validateHandDistribution(dist, actions, 0.02);
    if (!check.valid) {
      errors.push(`Linha ${i + 1} (${hand}): ${check.errors.join(" ")}`);
    }
    matrixFrequencies[hand] = dist;
  }

  if (Object.keys(matrixFrequencies).length !== 169) {
    errors.push(
      `CSV deve conter exatamente 169 classes de mãos (encontradas ${Object.keys(matrixFrequencies).length}).`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.slice(0, 12) };
  }

  return {
    ok: true,
    handsCount: Object.keys(matrixFrequencies).length,
    matrixFrequencies,
    actions,
  };
}
