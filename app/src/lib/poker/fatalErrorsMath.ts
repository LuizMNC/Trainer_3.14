import { calculateBluffBreakevenFoldEquity, calculatePotOdds, calculateSimplifiedMdf } from "./mathEngine.ts";
import type { CalculatorKind } from "./fatalErrorsCatalog.ts";

export function calculateFatalErrorModel(kind: CalculatorKind, pot: number, bet: number) {
  if (![pot, bet, pot + 2 * bet].every(Number.isFinite) || pot <= 0 || bet <= 0) {
    throw new Error("Informe pote e aposta positivos e finitos, na mesma unidade.");
  }
  if (kind === "pot_odds") {
    const result = calculatePotOdds(pot, bet, bet);
    return { label: "Equidade mínima no modelo", percentage: result.requiredEquityPct, formula: "B / (P + 2B)", caveat: "Call C = B; realização de equidade de 100%. Não estima a equidade da sua mão ou as implied/reverse implied odds." };
  }
  if (kind === "bluff_fe") {
    const result = calculateBluffBreakevenFoldEquity(pot, bet);
    return { label: "Fold equity de equilíbrio do blefe puro", percentage: result.requiredFoldEquityPct, formula: "B / (P + B)", caveat: "Equidade zero quando pago; não estima a frequência real de fold nem resolve semiblefes." };
  }
  const result = calculateSimplifiedMdf(pot, bet);
  return { label: "MDF agregado do modelo", percentage: result.mdfPct, formula: "P / (P + B)", caveat: `${result.caveat} Não é obrigação de call de uma mão específica.` };
}
