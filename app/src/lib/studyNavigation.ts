import type { TrainerModeId } from "./poker/adaptiveDiagnostics.ts";
import { getFatalErrorPracticeSpots, type FatalErrorCard } from "./poker/fatalErrorsCatalog.ts";
import type { CanonicalSpot } from "./poker/strategySchema.ts";

export type TabId = "clean-trainer" | "trainer" | "curriculum" | "fatal-errors" | "replayer" | "hand-library" | "explorer" | "math" | "math-lab" | "coach" | "stats";

export function shouldKeepLaunchedDrill(
  selection: { mode: TrainerModeId; contextKey: string } | null,
  mode: TrainerModeId,
  contextKey: string,
): boolean {
  return selection !== null && selection.mode === mode && selection.contextKey === contextKey;
}

export function trainerNavigation(spotId: string, preferredMode?: TrainerModeId) {
  return { activeTab: "trainer" as const, requestedSpotId: spotId, requestedMode: preferredMode ?? null };
}

export function fatalErrorPracticeNavigation(card: FatalErrorCard, spots: readonly CanonicalSpot[], spotId: string) {
  if (!getFatalErrorPracticeSpots(card, spots).some(s => s.spotId === spotId)) return null;
  // Estudo do tema não promove o cartão a VERIFIED nem muda a solução de destino.
  return trainerNavigation(spotId, "LEARNING");
}
