import { getHandCombos, RANKS, SUIT_CODES, validateDeckUnique } from "./cards.ts";
import type { GameFormat, Street } from "./stateEngine.ts";
import type { CurriculumTrackId } from "./strategySchema.ts";
import type { ExternalSolverPayloadV1 } from "./solverAdapter.ts";

export interface TexasSolverActionSpec {
  rawAction: string;
  actionName: string;
  color: string;
  sizeBb?: number;
  sizePctPot?: number;
}

export interface TexasSolverRunManifest {
  schema: string;
  generatedAtIso: string;
  solver: {
    name: string;
    version: string;
    license: string;
    executableName: string;
    executableSha256: string;
    evExportedByCli: boolean;
  };
  scenario: {
    spotId: string;
    spotName: string;
    format: GameFormat;
    variant: "NLHE";
    playersInitial: number;
    postflopPlayers: number;
    heroPosition: string;
    villainPosition: string | null;
    street: Street;
    board: string[];
    blinds: { sbBb: number; bbBb: number };
    anteBbPerPlayer: number;
    rakePct: number;
    startingStackBb: number;
    openRaiseBb: number;
    potSizeBb: number;
    effectiveStackBb: number;
    solverUnitsScaleFactor: number;
    actionHistory: { street: Street; position: string; action: string; sizeBb?: number }[];
    rangesSource: {
      file: string;
      fileSha256: string;
      ipSpotId: string;
      ipAction: string;
      ipClassesCount: number;
      ipCombosSolvedNode: number;
      oopSpotId: string;
      oopAction: string;
      oopClassesCount: number;
      note: string;
    };
  };
  treeParameters: {
    oopFlop: string;
    ipFlop: string;
    turnSizes: string;
    riverSizes: string;
    allinThreshold: number;
    useIsomorphism: boolean;
    resolvedNodePath: string[];
    nodeActions: TexasSolverActionSpec[];
  };
  convergence: {
    targetExploitabilityPct: number;
    maxIterationsConfigured: number;
    achievedExploitabilityPct: number | null;
    finalStdoutLine?: string | null;
    logRecords: { exploitibility: number; iteration: number; time_ms: number }[];
  };
  runtime: {
    elapsedSeconds: number;
    threads: number;
    maxWorkingSetMb: number;
    maxPrivateMemoryMb: number;
  };
  hashes: {
    solverInputSha256: string;
    rawOutputSha256: string;
    convergenceLogSha256: string | null;
    rangesSourceSha256: string;
  };
}

export interface TexasSolverBundleV1 {
  schemaVersion: "1.1.0";
  bundleType: "TEXASSOLVER_NODE_FREQUENCIES_ONLY";
  manifest: TexasSolverRunManifest;
  ipActionSpecs: TexasSolverActionSpec[];
  matrixFrequencies: Record<string, Record<string, number>>;
  comboBreakdown: Record<string, Record<string, Record<string, number>>>;
  matrixEv: null;
  evUnit: null;
}

export interface DesktopPostflopCsvMetadata {
  spotId: string;
  spotName: string;
  trackId: CurriculumTrackId;
  spotType: string;
  format: GameFormat;
  effectiveStackBb: number;
  blinds: { sbBb: number; bbBb: number };
  anteBbPerPlayer: number;
  rakePct: number;
  playersCount: number;
  seats: { seatIndex: number; position: string; stackBb: number }[];
  heroPosition: string;
  villainPosition: string | null;
  actionHistory: { street: Street; position: string; action: string; sizeBb?: number }[];
  street: Street;
  board: string[];
  potSizeBb: number;
  toCallBb: number;
  solverVersion: string;
  abstraction: string;
  convergenceTargetPct: number;
  achievedExploitabilityPct: number;
  createdAtIso: string;
  fileOrReference: string;
  fileSha256: string;
  configSha256?: string;
  heroRangeRef: string;
  villainRangeRef: string;
}

const VALID_RANKS = new Set<string>(RANKS);
const VALID_SUITS = new Set<string>(SUIT_CODES);
const ACTION_COLORS = ["#22c55e", "#f43f5e", "#dc2626", "#3b82f6", "#a855f7"];

export async function computeSha256Hex(content: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("WebCrypto subtle.digest indisponível neste ambiente.");
  }
  const bytes = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

export function combo4ToHandClass(combo: string): string {
  const c = combo.trim();
  if (c.length !== 4) {
    throw new Error(`Combo inválido: '${combo}' (esperado 4 caracteres como AsKd).`);
  }
  const r1 = c[0];
  const s1 = c[1];
  const r2 = c[2];
  const s2 = c[3];
  if (!VALID_RANKS.has(r1) || !VALID_SUITS.has(s1) || !VALID_RANKS.has(r2) || !VALID_SUITS.has(s2)) {
    throw new Error(`Combo com carta inválida: '${combo}'.`);
  }
  if (c.slice(0, 2) === c.slice(2, 4)) {
    throw new Error(`Combo com carta duplicada: '${combo}'.`);
  }
  const i1 = RANKS.indexOf(r1 as (typeof RANKS)[number]);
  const i2 = RANKS.indexOf(r2 as (typeof RANKS)[number]);
  if (i1 <= i2) {
    if (r1 === r2) return `${r1}${r2}`;
    return `${r1}${r2}${s1 === s2 ? "s" : "o"}`;
  }
  return `${r2}${r1}${s1 === s2 ? "s" : "o"}`;
}

export function normalizeExternalActionName(rawHeaderAction: string, potSizeBb: number): {
  actionName: string;
  sizeBb?: number;
  sizePctPot?: number;
} {
  const clean = rawHeaderAction.trim();
  const up = clean.toUpperCase();
  if (up === "CHECK") return { actionName: "Check", sizeBb: 0, sizePctPot: 0 };
  if (up === "FOLD") return { actionName: "Fold", sizeBb: 0, sizePctPot: 0 };
  if (up === "CALL") return { actionName: "Call" };
  if (up === "ALLIN" || up === "ALL-IN") return { actionName: "Allin" };

  const m = /^(BET|RAISE)\s+([0-9]+(?:\.[0-9]+)?)$/i.exec(clean);
  if (m && potSizeBb > 0) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    const sizeBb = Number(m[2]);
    const pct = Math.round((sizeBb / potSizeBb) * 1000) / 10;
    const roundedPct = Math.round(pct);
    const labelPct = Math.abs(pct - 33.3) <= 2.5 ? 33 : Math.abs(pct - 75.0) <= 3 ? 75 : roundedPct;
    return {
      actionName: `${kind}_${labelPct}pct`,
      sizeBb,
      sizePctPot: pct,
    };
  }

  return { actionName: clean.replace(/\s+/g, "_") };
}

/**
 * Converte um CSV exportado pelo Desktop Postflop (`ResultTable.vue`:
 * `Hand,Weight,Combos[,Equity,EV,EQR][,<Action> %,<Action> EV,...]`)
 * para payload v1.1.0 auditável com frequências e EV por ação.
 */
export function parseDesktopPostflopCsvToPayload(
  csvText: string,
  meta: DesktopPostflopCsvMetadata,
): { ok: true; payload: Partial<ExternalSolverPayloadV1> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { ok: false, errors: ["CSV Desktop Postflop vazio ou sem linhas de dados."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const handIdx = headers.indexOf("Hand");
  const weightIdx = headers.indexOf("Weight");
  const combosIdx = headers.indexOf("Combos");
  if (handIdx < 0) errors.push("Coluna obrigatória 'Hand' ausente no CSV Desktop Postflop.");

  const freqCols = new Map<string, number>();
  const evCols = new Map<string, number>();
  const rawActionOrder: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.endsWith(" %")) {
      const act = h.slice(0, -2).trim();
      freqCols.set(act, i);
      if (!rawActionOrder.includes(act)) rawActionOrder.push(act);
    } else if (h.endsWith(" EV")) {
      const act = h.slice(0, -3).trim();
      evCols.set(act, i);
    }
  }

  if (rawActionOrder.length < 2) {
    errors.push("Esperadas pelo menos 2 colunas de ação ('<Action> %') no CSV Desktop Postflop.");
  }
  for (const act of rawActionOrder) {
    if (!evCols.has(act)) {
      errors.push(`Coluna de EV '${act} EV' ausente no CSV Desktop Postflop (necessária para EV loss).`);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const normalizedSpecs = rawActionOrder.map((raw, idx) => {
    const spec = normalizeExternalActionName(raw, meta.potSizeBb);
    return {
      raw,
      actionName: spec.actionName,
      sizeBb: spec.sizeBb,
      sizePctPot: spec.sizePctPot,
      color: ACTION_COLORS[idx % ACTION_COLORS.length],
    };
  });

  const seenNames = new Set<string>();
  for (const s of normalizedSpecs) {
    if (seenNames.has(s.actionName)) {
      return { ok: false, errors: [`Ação normalizada duplicada '${s.actionName}' no cabeçalho CSV.`] };
    }
    seenNames.add(s.actionName);
  }

  const deadCards = new Set(meta.board);
  const classAgg = new Map<
    string,
    { weightSum: number; freqSums: Record<string, number>; evSums: Record<string, number> }
  >();

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(",").map((c) => c.trim());
    if (cells.length < headers.length) {
      errors.push(`Linha ${r + 1}: número de colunas (${cells.length}) menor que o cabeçalho (${headers.length}).`);
      continue;
    }
    const rawHand = cells[handIdx];
    const rowWeight = weightIdx >= 0 ? Number(cells[weightIdx]) : 1;
    const rowCombos = combosIdx >= 0 ? Number(cells[combosIdx]) : getHandCombos(rawHand);
    if (!Number.isFinite(rowWeight) || rowWeight < 0) {
      errors.push(`Linha ${r + 1} (${rawHand}): Weight inválido.`);
      continue;
    }
    if (rowWeight === 0) continue; // Mão fora do range pré-flop do herói neste nó

    let handClass = rawHand;
    if (rawHand.length === 4) {
      const c1 = rawHand.slice(0, 2);
      const c2 = rawHand.slice(2, 4);
      if (deadCards.has(c1) || deadCards.has(c2)) {
        errors.push(`Linha ${r + 1}: combo '${rawHand}' colide com carta do board [${meta.board.join(", ")}].`);
        continue;
      }
      handClass = combo4ToHandClass(rawHand);
    }

    const rowWeightTotal = rowWeight * (Number.isFinite(rowCombos) && rowCombos > 0 ? rowCombos : 1);
    const freqRow: Record<string, number> = {};
    const evRow: Record<string, number> = {};
    let rowFreqSum = 0;

    for (const s of normalizedSpecs) {
      const pctVal = Number(cells[freqCols.get(s.raw)!]);
      const evVal = Number(cells[evCols.get(s.raw)!]);
      if (!Number.isFinite(pctVal) || !Number.isFinite(evVal)) {
        errors.push(`Linha ${r + 1} (${rawHand}): valor não numérico em '${s.raw}'.`);
        break;
      }
      const prob = pctVal / 100;
      freqRow[s.actionName] = prob;
      evRow[s.actionName] = evVal;
      rowFreqSum += prob;
    }

    if (Math.abs(rowFreqSum - 1.0) > 0.015) {
      errors.push(`Linha ${r + 1} (${rawHand}): soma das frequências (${(rowFreqSum * 100).toFixed(2)}%) diverge de 100%.`);
      continue;
    }

    const acc = classAgg.get(handClass) ?? {
      weightSum: 0,
      freqSums: Object.fromEntries(normalizedSpecs.map((s) => [s.actionName, 0])),
      evSums: Object.fromEntries(normalizedSpecs.map((s) => [s.actionName, 0])),
    };
    acc.weightSum += rowWeightTotal;
    for (const s of normalizedSpecs) {
      acc.freqSums[s.actionName] += freqRow[s.actionName] * rowWeightTotal;
      acc.evSums[s.actionName] += evRow[s.actionName] * rowWeightTotal;
    }
    classAgg.set(handClass, acc);
  }

  if (errors.length > 0 || classAgg.size === 0) {
    return { ok: false, errors: errors.length > 0 ? errors : ["Nenhuma mão com Weight > 0 encontrada no CSV."] };
  }

  const matrixFrequencies: Record<string, Record<string, number>> = {};
  const matrixEv: Record<string, Record<string, number>> = {};
  for (const [handClass, acc] of classAgg.entries()) {
    matrixFrequencies[handClass] = {};
    matrixEv[handClass] = {};
    for (const s of normalizedSpecs) {
      matrixFrequencies[handClass][s.actionName] = Number((acc.freqSums[s.actionName] / acc.weightSum).toFixed(6));
      matrixEv[handClass][s.actionName] = Number((acc.evSums[s.actionName] / acc.weightSum).toFixed(4));
    }
  }

  const payload: Partial<ExternalSolverPayloadV1> = {
    schemaVersion: "1.1.0",
    spotId: meta.spotId,
    spotName: meta.spotName,
    trackId: meta.trackId,
    spotType: meta.spotType,
    format: meta.format,
    variant: "NLHE",
    effectiveStackBb: meta.effectiveStackBb,
    blinds: meta.blinds,
    anteBbPerPlayer: meta.anteBbPerPlayer,
    rakePct: meta.rakePct,
    playersCount: meta.playersCount,
    seats: meta.seats,
    heroPosition: meta.heroPosition,
    villainPosition: meta.villainPosition,
    actionHistory: meta.actionHistory,
    street: meta.street,
    board: meta.board,
    potSizeBb: meta.potSizeBb,
    toCallBb: meta.toCallBb,
    sizings: normalizedSpecs.map((s) => ({
      actionName: s.actionName,
      color: s.color,
      sizeBb: s.sizeBb,
      sizePctPot: s.sizePctPot,
    })),
    evUnit: "bbEV",
    icmMode: "chipEV",
    ranges: {
      heroRangeDescription: meta.heroRangeRef,
      villainRangeDescription: meta.villainRangeRef,
      sourceReference: meta.fileOrReference,
    },
    provenance: {
      solverName: "Desktop Postflop",
      solverVersion: meta.solverVersion,
      abstraction: meta.abstraction,
      convergenceTargetPct: meta.convergenceTargetPct,
      achievedExploitabilityPct: meta.achievedExploitabilityPct,
      createdAtIso: meta.createdAtIso,
      license: "AGPL-3.0",
      fileOrReference: meta.fileOrReference,
      fileSha256: meta.fileSha256,
      configSha256: meta.configSha256,
    },
    scope: classAgg.size === 169 ? "FULL_169_MATRIX" : "EXPLICIT_HAND_SUBSET",
    matrixFrequencies,
    matrixEv,
  };

  return { ok: true, payload };
}

export function validateBoardStrings(board: string[], street: Street): string[] {
  const expected: Record<Street, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };
  const errs: string[] = [];
  if (board.length !== expected[street]) {
    errs.push(`Board inválido para ${street}: esperado ${expected[street]} cartas, recebido ${board.length}.`);
  }
  const d = validateDeckUnique(board);
  if (!d.valid) errs.push(d.error ?? "Board com cartas inválidas.");
  return errs;
}
