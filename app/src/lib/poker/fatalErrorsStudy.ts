import { computeSpacedRepetitionSchedule, type ConfidenceLevel } from "./adaptiveDiagnostics.ts";
import { FATAL_ERRORS, type Difficulty, type ErrorClassification, type FatalErrorCard, type FatalErrorId, type FatalStreet } from "./fatalErrorsCatalog.ts";

export const FATAL_ERRORS_STORAGE_KEY = "projeto_poker_fatal_errors_v1";
export const MAX_ATTEMPTS_PER_CARD = 100;
export type StudyStatus = "new" | "review" | "learning" | "consolidated";
export const STUDY_STATUS_LABELS: Record<StudyStatus, string> = {
  new: "Não estudado", review: "Revisar agora", learning: "Em estudo", consolidated: "Consolidado",
};

export interface FatalErrorAttempt {
  attemptId: string;
  errorId: FatalErrorId;
  quizId: string;
  timestamp: number;
  chosenIndex: number;
  confidenceLevel: ConfidenceLevel;
  isCorrect: boolean;
  // Quizzes não fornecem EV por ação, independentemente do resultado.
  evLoss: null;
}

export interface StudyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FatalErrorFilters {
  street: FatalStreet | "all";
  category: ErrorClassification | "all";
  difficulty: Difficulty | "all";
  status: StudyStatus | "incorrect" | "all";
}

export const EMPTY_FATAL_FILTERS: FatalErrorFilters = {
  street: "all", category: "all", difficulty: "all", status: "all",
};

export function scoreFatalErrorQuiz(card: FatalErrorCard, chosenIndex: number) {
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= card.quiz.options.length) {
    throw new Error("Alternativa inválida.");
  }
  return {
    isCorrect: chosenIndex === card.quiz.correctIndex,
    explanation: card.quiz.explanation,
    evLoss: null,
    gtoScored: false,
  } as const;
}

export function createFatalErrorAttempt(input: {
  attemptId: string; errorId: string; quizId: string; timestamp: number;
  chosenIndex: number; confidenceLevel: string;
}): FatalErrorAttempt {
  const card = FATAL_ERRORS.find(c => c.id === input.errorId);
  if (!card || card.quiz.id !== input.quizId || !input.attemptId?.trim() ||
    !Number.isFinite(input.timestamp) || input.timestamp < 0 || input.timestamp > 8.64e15 ||
    !["baixa", "media", "alta"].includes(input.confidenceLevel)) {
    throw new Error("Tentativa conceitual inválida.");
  }
  const result = scoreFatalErrorQuiz(card, input.chosenIndex);
  return {
    attemptId: input.attemptId, errorId: card.id, quizId: card.quiz.id,
    timestamp: input.timestamp, chosenIndex: input.chosenIndex,
    confidenceLevel: input.confidenceLevel as ConfidenceLevel,
    isCorrect: result.isCorrect, evLoss: null,
  };
}

/** Mantém as 100 respostas mais recentes de cada cartão, sem perder outros cartões. */
export function retainFatalErrorAttempts(attempts: readonly FatalErrorAttempt[]): FatalErrorAttempt[] {
  const counts = new Map<FatalErrorId, number>();
  const seen = new Set<string>();
  return [...attempts].sort((a, b) => b.timestamp - a.timestamp).filter(a => {
    const count = counts.get(a.errorId) ?? 0;
    if (seen.has(a.attemptId) || count >= MAX_ATTEMPTS_PER_CARD) return false;
    seen.add(a.attemptId);
    counts.set(a.errorId, count + 1);
    return true;
  });
}

export function loadFatalErrorStudy(storage: StudyStorage): { attempts: FatalErrorAttempt[]; warning: string | null } {
  try {
    const raw = storage.getItem(FATAL_ERRORS_STORAGE_KEY);
    if (!raw) return { attempts: [], warning: null };
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || !("version" in payload) || payload.version !== 1 ||
      !("attempts" in payload) || !Array.isArray(payload.attempts)) throw new Error("Formato inválido.");
    const attempts: FatalErrorAttempt[] = [];
    let discarded = false;
    for (const item of payload.attempts) {
      try {
        // Reconstrói resultado; nunca confia em isCorrect ou EV persistidos.
        attempts.push(createFatalErrorAttempt(item));
      } catch { discarded = true; }
    }
    return { attempts: retainFatalErrorAttempts(attempts), warning: discarded ? "Respostas locais inválidas foram ignoradas." : null };
  } catch {
    return { attempts: [], warning: "Não foi possível ler o progresso local. O estudo continua nesta sessão." };
  }
}

export function saveFatalErrorStudy(storage: StudyStorage, attempts: readonly FatalErrorAttempt[]): string | null {
  try {
    const existing = storage.getItem(FATAL_ERRORS_STORAGE_KEY);
    if (existing !== null) {
      try {
        const payload: unknown = JSON.parse(existing);
        if (!payload || typeof payload !== "object" || !("version" in payload) || payload.version !== 1 ||
          !("attempts" in payload) || !Array.isArray(payload.attempts)) throw new Error("Formato incompatível.");
      } catch {
        return "Dados locais incompatíveis ou corrompidos foram preservados. Novas respostas ficam apenas nesta sessão.";
      }
    }
    // A gravação também reconstrói os resultados para impedir EV injetado.
    const safe = retainFatalErrorAttempts(attempts.map(a => createFatalErrorAttempt(a)));
    storage.setItem(FATAL_ERRORS_STORAGE_KEY, JSON.stringify({ version: 1, attempts: safe }));
    return null;
  } catch {
    return "O progresso está apenas nesta sessão: não foi possível salvar no navegador.";
  }
}

export function getFatalErrorSchedule(attempts: readonly FatalErrorAttempt[], now: number) {
  // A persistência mantém os envios mais novos primeiro. Em timestamps iguais,
  // Leitner deve processar o envio antigo antes do novo, inclusive após recarga.
  return computeSpacedRepetitionSchedule([...attempts].reverse().map(a => ({
    spotId: `fatal:${a.errorId}`, spotName: FATAL_ERRORS.find(c => c.id === a.errorId)!.title,
    trackId: "FATAL_ERRORS" as const, timestamp: a.timestamp, confidenceLevel: a.confidenceLevel,
    evLoss: null, isAcceptable: a.isCorrect,
  })), now);
}

export function getFatalErrorStatus(card: FatalErrorCard, attempts: readonly FatalErrorAttempt[], now: number): StudyStatus {
  const review = getFatalErrorSchedule(attempts.filter(a => a.errorId === card.id), now)[0];
  if (!review) return "new";
  if (review.isDueNow) return "review";
  return review.boxLevel >= 3 ? "consolidated" : "learning";
}

export function filterFatalErrors(cards: readonly FatalErrorCard[], filters: FatalErrorFilters, attempts: readonly FatalErrorAttempt[], now: number): FatalErrorCard[] {
  return cards.filter(card =>
    (filters.street === "all" || card.category === filters.street) &&
    (filters.category === "all" || card.classification === filters.category) &&
    (filters.difficulty === "all" || card.difficulty === filters.difficulty) &&
    (filters.status === "all" || (filters.status === "incorrect"
      ? attempts.some(a => a.errorId === card.id && !a.isCorrect)
      : getFatalErrorStatus(card, attempts, now) === filters.status)),
  );
}
