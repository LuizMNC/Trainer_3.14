import { validateDeckUnique } from "./cards.ts";
import { computeSidePots, getPositionsForSeatCount } from "./stateEngine.ts";
import type { CanonicalHand } from "./handHistorySchema.ts";

export interface HandEngineCrossCheck {
  knownCardsValid: boolean;
  positionsInPhhOrder: string[];
  sidePots: { status: "MATCH" | "MISMATCH" | "UNAVAILABLE"; reason?: string };
}

/** Leitura de saída já validada pelo importador, sem executar decisões nem criar GameState fictício.
 * Não é decoder para JSON arbitrário nem segundo certificador cronológico.
 */
export function crossCheckHandWithExistingEngine(hand: CanonicalHand): HandEngineCrossCheck {
  if (hand.schemaVersion !== "1.0.0" || hand.profile !== "PHH_NT_SUBSET_1") {
    throw new Error("Versão de histórico incompatível.");
  }
  const n = hand.table.playerCount;
  const positions = getPositionsForSeatCount(n);
  const sb = positions.indexOf("SB");
  const positionsInPhhOrder = n === 2 ? ["BB", "BTN/SB"] : [...positions.slice(sb), ...positions.slice(0, sb)];
  const known = hand.players.flatMap(p => p.holeCards.status === "MISSING" ? [] : p.holeCards.value.filter((c): c is string => c !== null));
  known.push(...hand.ending.board);
  const base = { knownCardsValid: validateDeckUnique(known).valid, positionsInPhhOrder };
  const unavailable = (reason: string): HandEngineCrossCheck => ({ ...base, sidePots: { status: "UNAVAILABLE", reason } });
  if (!hand.results.complete) return unavailable("Prefixo sem liquidação final.");
  if (hand.table.rawAntesAtoms.some(a => a !== "0")) return unavailable("Projeção de side pots com antes fora do contrato legado.");

  // O motor legado arredonda BB a 3 casas. Não arredondar silenciosamente os átomos.
  const bigBlind = BigInt(hand.table.minBetAtoms);
  const toExactBb = (amount: string): number => {
    if (!/^(0|[1-9]\d*)$/.test(amount) || bigBlind <= 0n) throw new Error("Átomos inválidos.");
    const milli = BigInt(amount) * 1000n;
    if (milli % bigBlind !== 0n || milli / bigBlind > 100_000_000n) throw new Error("Precisão/range fora da projeção BB legada.");
    return Number(milli / bigBlind) / 1000;
  };
  try {
    const pots = computeSidePots(hand.players.map((p, i) => ({
      position: positionsInPhhOrder[i],
      investedTotalBb: toExactBb(hand.results.netContributionsAtoms[p.index]),
      folded: hand.ending.folded[p.index] || hand.ending.mucked[p.index],
    })));
    const match = pots.length === hand.pots.length && pots.every((p, i) => {
      const canonical = hand.pots[i];
      const eligible = canonical.eligiblePlayerIndices.map(index => positionsInPhhOrder[index]);
      return Math.abs(p.amountBb - toExactBb(canonical.amountAtoms)) < 1e-9 &&
        p.eligiblePositions.length === eligible.length && p.eligiblePositions.every((position, j) => position === eligible[j]);
    });
    return { ...base, sidePots: { status: match ? "MATCH" : "MISMATCH" } };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "Projeção indisponível.");
  }
}
