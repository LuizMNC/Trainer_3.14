import type { DrillDifficulty, SpotType } from "../poker.ts";
import type { DecisionClassification, MixedAttemptRecord } from "./drillEvaluator.ts";
import { isSpotIdExcludedFromMtt } from "./mttCatalog.ts";
import type { ConfidenceLevel, TrainerModeId } from "./adaptiveDiagnostics.ts";

export const CLEAN_TRAINER_STORAGE_KEY = "treinerlm_clean_trainer_v1";
export const TRAINER_SESSION_STORAGE_KEY = "treinerlm_trainer_session_v1";

export const LEGACY_CLEAN_TRAINER_STORAGE_KEYS = [
  "poker_clean_trainer_state_v1",
  "treinerlm_clean_trainer_v0",
] as const;

export const LEGACY_TRAINER_SESSION_STORAGE_KEYS = [
  "treinerlm_trainer_session_v0",
] as const;

export type TrainerStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CleanSpotTypeFilter = "all" | SpotType;

export interface CleanTrainerSessionV1 {
  schemaVersion: 1;
  spotTypeFilter: CleanSpotTypeFilter;
  heroPosition: string;
  selectedSpotId: string | null;
  difficulty: DrillDifficulty;
  useRng: boolean;
  autoAdvance: boolean;
  totalCount: number;
  rightCount: number;
  streak: number;
  mixedAttempts: MixedAttemptRecord[];
  updatedAt: number;
}

export interface TrainerRecentDecisionItem {
  id: number;
  hand: string;
  action: string;
  headline: string;
  classification: DecisionClassification;
}

export interface TrainerSessionV1 {
  schemaVersion: 1;
  trainerMode: TrainerModeId;
  sourceFilter: "all" | "verified" | "chart" | "didactic" | "unsolved";
  streetFilter: "ALL" | "PREFLOP" | "POSTFLOP";
  formatFilter: "all" | "MTT_CHEV" | "MTT_ICM" | "MTT_PKO";
  stackFilter: string;
  typeFilter: "all" | SpotType;
  posFilter: string;
  difficulty: DrillDifficulty;
  useRng: boolean;
  useSeededRng: boolean;
  rngSeed: string;
  confidenceLevel: ConfidenceLevel;
  selectedSpotId: string | null;
  sessionTotal: number;
  sessionRight: number;
  streak: number;
  mixedAttempts: MixedAttemptRecord[];
  recentDecisions: TrainerRecentDecisionItem[];
  updatedAt: number;
}

const VALID_POSITIONS = new Set(["UTG", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]);
const VALID_SPOT_TYPES = new Set<SpotType>(["rfi", "vs_rfi", "vs_limp", "push_fold", "vs_shove"]);
const VALID_DIFFICULTIES = new Set<DrillDifficulty>(["all", "mixed", "borderline"]);
const VALID_CLASSIFICATIONS = new Set<DecisionClassification>([
  "exact_primary",
  "valid_mixed",
  "low_freq_acceptable",
  "ev_error",
  "unsolved",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeNonNegInt(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.min(10_000_000, Math.trunc(value));
}

export function parseMixedAttemptRecordStrict(
  raw: unknown,
  validSpotIds?: ReadonlySet<string>,
): MixedAttemptRecord | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.spotId !== "string" || raw.spotId.trim().length === 0) return null;
  if (isSpotIdExcludedFromMtt(raw.spotId)) return null;
  if (validSpotIds && !validSpotIds.has(raw.spotId)) return null;
  if (typeof raw.hand !== "string" || raw.hand.trim().length === 0 || raw.hand.length > 8) {
    return null;
  }
  if (typeof raw.chosenAction !== "string" || raw.chosenAction.trim().length === 0) {
    return null;
  }
  if (!isPlainObject(raw.targetDistribution)) return null;

  const entries = Object.entries(raw.targetDistribution);
  if (entries.length === 0) return null;

  const cleanTarget: Record<string, number> = {};
  for (const [act, freq] of entries) {
    if (
      !act ||
      typeof freq !== "number" ||
      !Number.isFinite(freq) ||
      freq < -1e-6 ||
      freq > 1 + 1e-6
    ) {
      return null;
    }
    cleanTarget[act] = Math.max(0, Math.min(1, freq));
  }

  let evLoss: number | null = null;
  if (raw.evLoss !== undefined && raw.evLoss !== null) {
    if (typeof raw.evLoss !== "number" || !Number.isFinite(raw.evLoss) || raw.evLoss < 0) {
      return null;
    }
    evLoss = raw.evLoss;
  }

  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp) && raw.timestamp >= 0
      ? Math.trunc(raw.timestamp)
      : 0;

  return {
    spotId: raw.spotId,
    hand: raw.hand,
    chosenAction: raw.chosenAction,
    targetDistribution: cleanTarget,
    evLoss,
    timestamp,
  };
}

function parseSpotTypeFilterStrict(value: unknown, allowAll = true): CleanSpotTypeFilter | null {
  if (typeof value !== "string") return null;
  if (value === "all" && allowAll) return "all";
  if (VALID_SPOT_TYPES.has(value as SpotType)) return value as SpotType;
  return null;
}

export function createDefaultCleanTrainerSession(): CleanTrainerSessionV1 {
  return {
    schemaVersion: 1,
    spotTypeFilter: "rfi",
    heroPosition: "BTN",
    selectedSpotId: null,
    difficulty: "borderline",
    useRng: false,
    autoAdvance: false,
    totalCount: 0,
    rightCount: 0,
    streak: 0,
    mixedAttempts: [],
    updatedAt: 0,
  };
}

export function parseCleanTrainerSessionPayload(
  rawText: string | null | undefined,
  validSpotIds?: ReadonlySet<string>,
): {
  ok: boolean;
  session: CleanTrainerSessionV1 | null;
  migratedFromLegacy: boolean;
  reason?: string;
} {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "empty" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "invalid_json" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "invalid_shape" };
  }

  const schemaVersion = parsed.schemaVersion;
  const isLegacyV0 = schemaVersion === undefined;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    return {
      ok: false,
      session: null,
      migratedFromLegacy: false,
      reason: "unsupported_schema_version",
    };
  }

  const defaults = createDefaultCleanTrainerSession();
  const spotTypeFilter = parseSpotTypeFilterStrict(parsed.spotTypeFilter, true) ?? defaults.spotTypeFilter;
  const heroPosition =
    typeof parsed.heroPosition === "string" && VALID_POSITIONS.has(parsed.heroPosition)
      ? parsed.heroPosition
      : defaults.heroPosition;

  let selectedSpotId: string | null = null;
  if (
    typeof parsed.selectedSpotId === "string" &&
    parsed.selectedSpotId.trim().length > 0 &&
    !isSpotIdExcludedFromMtt(parsed.selectedSpotId) &&
    (!validSpotIds || validSpotIds.has(parsed.selectedSpotId))
  ) {
    selectedSpotId = parsed.selectedSpotId;
  }

  const difficulty =
    typeof parsed.difficulty === "string" && VALID_DIFFICULTIES.has(parsed.difficulty as DrillDifficulty)
      ? (parsed.difficulty as DrillDifficulty)
      : defaults.difficulty;

  const totalCount = toSafeNonNegInt(parsed.totalCount, 0);
  const rightCount = Math.min(totalCount, toSafeNonNegInt(parsed.rightCount, 0));
  const streak = Math.min(rightCount, toSafeNonNegInt(parsed.streak, 0));

  const mixedAttempts: MixedAttemptRecord[] = [];
  if (Array.isArray(parsed.mixedAttempts)) {
    for (const item of parsed.mixedAttempts) {
      const rec = parseMixedAttemptRecordStrict(item, validSpotIds);
      if (rec) mixedAttempts.push(rec);
    }
  }

  return {
    ok: true,
    migratedFromLegacy: isLegacyV0,
    session: {
      schemaVersion: 1,
      spotTypeFilter,
      heroPosition,
      selectedSpotId,
      difficulty,
      useRng: typeof parsed.useRng === "boolean" ? parsed.useRng : defaults.useRng,
      autoAdvance: typeof parsed.autoAdvance === "boolean" ? parsed.autoAdvance : defaults.autoAdvance,
      totalCount,
      rightCount,
      streak,
      mixedAttempts: mixedAttempts.slice(-150),
      updatedAt:
        typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) && parsed.updatedAt >= 0
          ? Math.trunc(parsed.updatedAt)
          : Date.now(),
    },
  };
}

function getDefaultBrowserStorage(): TrainerStorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadCleanTrainerSession(
  storage: TrainerStorageLike | null = getDefaultBrowserStorage(),
  validSpotIds?: ReadonlySet<string>,
): { session: CleanTrainerSessionV1 | null; migratedFromLegacy: boolean } {
  if (!storage) return { session: null, migratedFromLegacy: false };
  try {
    const primaryRaw = storage.getItem(CLEAN_TRAINER_STORAGE_KEY);
    if (primaryRaw !== null) {
      const parsed = parseCleanTrainerSessionPayload(primaryRaw, validSpotIds);
      if (parsed.ok && parsed.session) {
        if (parsed.migratedFromLegacy) {
          saveCleanTrainerSession(parsed.session, storage);
        }
        return { session: parsed.session, migratedFromLegacy: parsed.migratedFromLegacy };
      }
      // Dado corrompido ou incompatível é removido com segurança em vez de quebrar a UI.
      storage.removeItem(CLEAN_TRAINER_STORAGE_KEY);
    }

    for (const legacyKey of LEGACY_CLEAN_TRAINER_STORAGE_KEYS) {
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const parsed = parseCleanTrainerSessionPayload(legacyRaw, validSpotIds);
      if (parsed.ok && parsed.session) {
        saveCleanTrainerSession(parsed.session, storage);
        storage.removeItem(legacyKey);
        return { session: parsed.session, migratedFromLegacy: true };
      }
      storage.removeItem(legacyKey);
    }
  } catch {
    // Storage indisponível (sandbox/private mode)
  }
  return { session: null, migratedFromLegacy: false };
}

export function saveCleanTrainerSession(
  session: Omit<CleanTrainerSessionV1, "schemaVersion" | "updatedAt"> & {
    schemaVersion?: 1;
    updatedAt?: number;
  },
  storage: TrainerStorageLike | null = getDefaultBrowserStorage(),
): void {
  if (!storage) return;
  try {
    const normalizedRight = Math.min(
      toSafeNonNegInt(session.totalCount),
      toSafeNonNegInt(session.rightCount),
    );
    const payload: CleanTrainerSessionV1 = {
      schemaVersion: 1,
      spotTypeFilter: session.spotTypeFilter,
      heroPosition: session.heroPosition,
      selectedSpotId:
        session.selectedSpotId && !isSpotIdExcludedFromMtt(session.selectedSpotId)
          ? session.selectedSpotId
          : null,
      difficulty: session.difficulty,
      useRng: Boolean(session.useRng),
      autoAdvance: Boolean(session.autoAdvance),
      totalCount: toSafeNonNegInt(session.totalCount),
      rightCount: normalizedRight,
      streak: Math.min(normalizedRight, toSafeNonNegInt(session.streak)),
      mixedAttempts: session.mixedAttempts
        .map((m) => parseMixedAttemptRecordStrict(m))
        .filter((m): m is MixedAttemptRecord => m !== null)
        .slice(-150),
      updatedAt: session.updatedAt ?? Date.now(),
    };
    storage.setItem(CLEAN_TRAINER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora falha de cota
  }
}

export function createDefaultTrainerSession(): TrainerSessionV1 {
  return {
    schemaVersion: 1,
    trainerMode: "GTO_TECHNICAL",
    sourceFilter: "all",
    streetFilter: "ALL",
    formatFilter: "all",
    stackFilter: "all",
    typeFilter: "all",
    posFilter: "all",
    difficulty: "borderline",
    useRng: true,
    useSeededRng: false,
    rngSeed: "pdf-poker-seed-01",
    confidenceLevel: "media",
    selectedSpotId: null,
    sessionTotal: 0,
    sessionRight: 0,
    streak: 0,
    mixedAttempts: [],
    recentDecisions: [],
    updatedAt: 0,
  };
}

export function parseTrainerSessionPayload(
  rawText: string | null | undefined,
  validSpotIds?: ReadonlySet<string>,
): {
  ok: boolean;
  session: TrainerSessionV1 | null;
  migratedFromLegacy: boolean;
  reason?: string;
} {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "empty" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "invalid_json" };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, session: null, migratedFromLegacy: false, reason: "invalid_shape" };
  }

  const schemaVersion = parsed.schemaVersion;
  const isLegacyV0 = schemaVersion === undefined;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    return {
      ok: false,
      session: null,
      migratedFromLegacy: false,
      reason: "unsupported_schema_version",
    };
  }

  const defaults = createDefaultTrainerSession();
  const trainerMode: TrainerModeId =
    parsed.trainerMode === "LEARNING" || parsed.trainerMode === "GTO_TECHNICAL"
      ? parsed.trainerMode
      : defaults.trainerMode;

  const sourceFilter =
    parsed.sourceFilter === "all" ||
    parsed.sourceFilter === "verified" ||
    parsed.sourceFilter === "chart" ||
    parsed.sourceFilter === "didactic" ||
    parsed.sourceFilter === "unsolved"
      ? parsed.sourceFilter
      : defaults.sourceFilter;

  const streetFilter =
    parsed.streetFilter === "ALL" ||
    parsed.streetFilter === "PREFLOP" ||
    parsed.streetFilter === "POSTFLOP"
      ? parsed.streetFilter
      : defaults.streetFilter;

  const rawFormat = parsed.formatFilter;
  const formatFilter: TrainerSessionV1["formatFilter"] =
    rawFormat === "all" ||
    rawFormat === "MTT_CHEV" ||
    rawFormat === "MTT_ICM" ||
    rawFormat === "MTT_PKO"
      ? rawFormat
      : rawFormat === "chipEV"
        ? "MTT_CHEV"
        : rawFormat === "ICM"
          ? "MTT_ICM"
          : rawFormat === "PKO"
            ? "MTT_PKO"
            : defaults.formatFilter;

  const stackFilter =
    parsed.stackFilter === "all" ||
    (typeof parsed.stackFilter === "string" && /^\d+$/.test(parsed.stackFilter))
      ? parsed.stackFilter
      : defaults.stackFilter;

  const typeFilter = parseSpotTypeFilterStrict(parsed.typeFilter, true) ?? defaults.typeFilter;
  const posFilter =
    parsed.posFilter === "all" ||
    (typeof parsed.posFilter === "string" && VALID_POSITIONS.has(parsed.posFilter))
      ? parsed.posFilter
      : defaults.posFilter;

  const difficulty =
    typeof parsed.difficulty === "string" && VALID_DIFFICULTIES.has(parsed.difficulty as DrillDifficulty)
      ? (parsed.difficulty as DrillDifficulty)
      : defaults.difficulty;

  const confidenceLevel: ConfidenceLevel =
    parsed.confidenceLevel === "baixa" ||
    parsed.confidenceLevel === "media" ||
    parsed.confidenceLevel === "alta"
      ? parsed.confidenceLevel
      : defaults.confidenceLevel;

  let selectedSpotId: string | null = null;
  if (
    typeof parsed.selectedSpotId === "string" &&
    parsed.selectedSpotId.trim().length > 0 &&
    !isSpotIdExcludedFromMtt(parsed.selectedSpotId) &&
    (!validSpotIds || validSpotIds.has(parsed.selectedSpotId))
  ) {
    selectedSpotId = parsed.selectedSpotId;
  }

  const sessionTotal = toSafeNonNegInt(parsed.sessionTotal, 0);
  const sessionRight = Math.min(sessionTotal, toSafeNonNegInt(parsed.sessionRight, 0));
  const streak = Math.min(sessionRight, toSafeNonNegInt(parsed.streak, 0));

  const mixedAttempts: MixedAttemptRecord[] = [];
  if (Array.isArray(parsed.mixedAttempts)) {
    for (const item of parsed.mixedAttempts) {
      const rec = parseMixedAttemptRecordStrict(item, validSpotIds);
      if (rec) mixedAttempts.push(rec);
    }
  }

  const recentDecisions: TrainerRecentDecisionItem[] = [];
  if (Array.isArray(parsed.recentDecisions)) {
    for (const item of parsed.recentDecisions) {
      if (
        isPlainObject(item) &&
        typeof item.id === "number" &&
        Number.isFinite(item.id) &&
        typeof item.hand === "string" &&
        item.hand.length > 0 &&
        typeof item.action === "string" &&
        typeof item.headline === "string" &&
        typeof item.classification === "string" &&
        VALID_CLASSIFICATIONS.has(item.classification as DecisionClassification)
      ) {
        recentDecisions.push({
          id: Math.trunc(item.id),
          hand: item.hand,
          action: item.action,
          headline: item.headline,
          classification: item.classification as DecisionClassification,
        });
      }
    }
  }

  const rngSeed =
    typeof parsed.rngSeed === "string" && parsed.rngSeed.trim().length > 0
      ? parsed.rngSeed.slice(0, 120)
      : defaults.rngSeed;

  return {
    ok: true,
    migratedFromLegacy: isLegacyV0,
    session: {
      schemaVersion: 1,
      trainerMode,
      sourceFilter,
      streetFilter,
      formatFilter,
      stackFilter,
      typeFilter,
      posFilter,
      difficulty,
      useRng: typeof parsed.useRng === "boolean" ? parsed.useRng : defaults.useRng,
      useSeededRng:
        typeof parsed.useSeededRng === "boolean" ? parsed.useSeededRng : defaults.useSeededRng,
      rngSeed,
      confidenceLevel,
      selectedSpotId,
      sessionTotal,
      sessionRight,
      streak,
      mixedAttempts: mixedAttempts.slice(-150),
      recentDecisions: recentDecisions.slice(0, 8),
      updatedAt:
        typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) && parsed.updatedAt >= 0
          ? Math.trunc(parsed.updatedAt)
          : Date.now(),
    },
  };
}

export function loadTrainerSession(
  storage: TrainerStorageLike | null = getDefaultBrowserStorage(),
  validSpotIds?: ReadonlySet<string>,
): { session: TrainerSessionV1 | null; migratedFromLegacy: boolean } {
  if (!storage) return { session: null, migratedFromLegacy: false };
  try {
    const raw = storage.getItem(TRAINER_SESSION_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseTrainerSessionPayload(raw, validSpotIds);
      if (parsed.ok && parsed.session) {
        if (parsed.migratedFromLegacy) {
          saveTrainerSession(parsed.session, storage);
        }
        return { session: parsed.session, migratedFromLegacy: parsed.migratedFromLegacy };
      }
      storage.removeItem(TRAINER_SESSION_STORAGE_KEY);
    }

    for (const legacyKey of LEGACY_TRAINER_SESSION_STORAGE_KEYS) {
      const legacyRaw = storage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const parsed = parseTrainerSessionPayload(legacyRaw, validSpotIds);
      if (parsed.ok && parsed.session) {
        saveTrainerSession(parsed.session, storage);
        storage.removeItem(legacyKey);
        return { session: parsed.session, migratedFromLegacy: true };
      }
      storage.removeItem(legacyKey);
    }
  } catch {
    // Storage indisponível
  }
  return { session: null, migratedFromLegacy: false };
}

export function saveTrainerSession(
  session: Omit<TrainerSessionV1, "schemaVersion" | "updatedAt"> & {
    schemaVersion?: 1;
    updatedAt?: number;
  },
  storage: TrainerStorageLike | null = getDefaultBrowserStorage(),
): void {
  if (!storage) return;
  try {
    const normalizedTotal = toSafeNonNegInt(session.sessionTotal);
    const normalizedRight = Math.min(normalizedTotal, toSafeNonNegInt(session.sessionRight));
    const payload: TrainerSessionV1 = {
      schemaVersion: 1,
      trainerMode: session.trainerMode,
      sourceFilter: session.sourceFilter,
      streetFilter: session.streetFilter,
      formatFilter: session.formatFilter,
      stackFilter: session.stackFilter,
      typeFilter: session.typeFilter,
      posFilter: session.posFilter,
      difficulty: session.difficulty,
      useRng: Boolean(session.useRng),
      useSeededRng: Boolean(session.useSeededRng),
      rngSeed: session.rngSeed.slice(0, 120),
      confidenceLevel: session.confidenceLevel,
      selectedSpotId:
        session.selectedSpotId && !isSpotIdExcludedFromMtt(session.selectedSpotId)
          ? session.selectedSpotId
          : null,
      sessionTotal: normalizedTotal,
      sessionRight: normalizedRight,
      streak: toSafeNonNegInt(session.streak),
      mixedAttempts: session.mixedAttempts
        .map((m) => parseMixedAttemptRecordStrict(m))
        .filter((m): m is MixedAttemptRecord => m !== null)
        .slice(-150),
      recentDecisions: session.recentDecisions.slice(0, 8),
      updatedAt: session.updatedAt ?? Date.now(),
    };
    storage.setItem(TRAINER_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora falha de cota
  }
}

export function clearTrainerSession(
  storage: TrainerStorageLike | null = getDefaultBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(TRAINER_SESSION_STORAGE_KEY);
  } catch {
    // Ignora
  }
}
