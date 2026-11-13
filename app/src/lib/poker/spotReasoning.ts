import {
  getAvailableCombosForClass,
  getHandCombos,
  parseCard,
  RANKS,
  type PlayingCard,
} from "./cards.ts";
import type { CanonicalSpot, StrategyUnit } from "./strategySchema.ts";

export interface BlockerImpactDetail {
  handClass: string;
  heroCardsFormatted: string;
  combinatoricsType: "EXACT_COMBINATORICS";
  blockedValueClasses: { hand: string; baseCombos: number; remainingCombos: number; reductionPct: number }[];
  unblockedFoldRegionNote: string;
  blockerSummary: string;
  riverBluffCandidateHeuristic: {
    computationType: "HEURISTIC_MODEL";
    score100: number;
    label: "Forte Candidato Heurístico" | "Candidato Neutro" | "Mau Candidato (Showdown/Bloqueia Folds)";
    explanation: string;
    epistemicWarning: "HEURISTIC_EXPLANATION_ONLY — Esta pontuação é didática e jamais declara um blefe como GTO sem solver.";
  };
}

export interface AdvantageAnalysis {
  computationType: "HEURISTIC_MODEL";
  epistemicNote: string;
  leader: "HERO" | "VILLAIN" | "BALANCED";
  score: number; // -100 (vilão) a +100 (herói)
  headline: string;
  rationale: string;
}

export interface EquityRealizationAnalysis {
  computationType: "HEURISTIC_MODEL";
  epistemicNote: string;
  tier: "ALTA" | "MEDIA" | "BAIXA";
  estimatedFactor: number; // ex.: 1.12 em posição suited vs 0.72 OOP offsuit
  positionalStatus: "IP (Em Posição)" | "OOP (Fora de Posição)" | "Pré-Flop Steal/Defesa";
  headline: string;
  factors: string[];
}

export interface SizingOptionComparison {
  actionName: string;
  frequency: number;
  ev: number;
  deltaEvFromBest: number;
  deltaPctOfPot: number | null;
  viability: "OPTIMAL" | "VIABLE_SIMPLIFICATION" | "MODERATE_LOSS" | "COSTLY_ERROR";
  interpretation: string;
}

export interface SizingComparisonReport {
  available: boolean;
  evUnit: StrategyUnit | null;
  bestAction: string | null;
  bestEv: number | null;
  options: SizingOptionComparison[];
  reSolveCaveat: string;
}

export interface SpotConceptualReasoning {
  blocker: BlockerImpactDetail;
  rangeAdvantage: AdvantageAnalysis;
  nutAdvantage: AdvantageAnalysis;
  equityRealization: EquityRealizationAnalysis;
  sizingComparison: SizingComparisonReport;
}

const LATE_POSITIONS = new Set(["CO", "BTN"]);
const EARLY_POSITIONS = new Set(["UTG", "UTG+1", "MP", "LJ"]);

function isHeroInPositionPostflop(heroPos: string, villainPos: string | null): boolean {
  if (!villainPos) return heroPos === "BTN" || heroPos === "CO";
  if (heroPos === "BTN") return true;
  if (heroPos === "SB") return false;
  if (villainPos === "SB") return true;
  if (villainPos === "BB") return heroPos !== "SB";
  const order = ["SB", "BB", "UTG", "MP", "LJ", "HJ", "CO", "BTN"];
  return order.indexOf(heroPos) > order.indexOf(villainPos);
}

/**
 * Compara matematicamente múltiplos sizings/ações quando há dados de EV verificados ou didáticos explícitos.
 */
export function compareActionSizings(
  spot: CanonicalSpot,
  handClass: string,
): SizingComparisonReport {
  const ref = spot.referenceStrategy;
  const dist = ref.actionFrequencies ?? ref.matrixFrequencies?.[handClass] ?? null;
  const evMap = ref.actionEv ?? ref.matrixEv?.[handClass] ?? null;

  const reSolveCaveat =
    "Nota Metodológica (Aula 03): A diferença ΔEV abaixo mede o custo da ação para esta mão mantendo fixa a estratégia do oponente na árvore atual. Remover um sizing de todo o range altera a resposta ótima do vilão e exige novo re-solve para quantificação global.";

  // Regra de Integridade: comparação numérica de EV entre sizings exige estritamente solução VERIFIED
  if (
    ref.status !== "VERIFIED" ||
    !dist ||
    !evMap ||
    Object.keys(evMap).length < 2
  ) {
    return {
      available: false,
      evUnit: ref.status === "VERIFIED" ? ref.evUnit : null,
      bestAction: null,
      bestEv: null,
      options: [],
      reSolveCaveat,
    };
  }

  let bestAction = "";
  let bestEv = -Infinity;
  for (const [act, val] of Object.entries(evMap)) {
    if (val > bestEv) {
      bestEv = val;
      bestAction = act;
    }
  }

  const options: SizingOptionComparison[] = Object.entries(evMap)
    .map(([actionName, ev]) => {
      const freq = dist[actionName] ?? 0;
      const deltaEv = Math.max(0, Math.round((bestEv - ev) * 10000) / 10000);
      const deltaPctOfPot =
        spot.potBb && spot.potBb > 0 && ref.evUnit === "bbEV"
          ? Math.round((deltaEv / spot.potBb) * 10000) / 100
          : null;

      let viability: SizingOptionComparison["viability"];
      let interpretation: string;

      if (deltaEv <= 0.005) {
        viability = "OPTIMAL";
        interpretation = "Ação ótima / indiferente no equilíbrio (ΔEV ≈ 0).";
      } else if (deltaEv <= 0.03) {
        viability = "VIABLE_SIMPLIFICATION";
        interpretation = `Simplificação viável para esta mão (perda marginal de ${deltaEv.toFixed(3)} ${ref.evUnit ?? ""}).`;
      } else if (deltaEv <= 0.12) {
        viability = "MODERATE_LOSS";
        interpretation = `Perda moderada (${deltaEv.toFixed(3)} ${ref.evUnit ?? ""}); evite simplificar sem leitura explorativa.`;
      } else {
        viability = "COSTLY_ERROR";
        interpretation = `Perda severa de EV (${deltaEv.toFixed(3)} ${ref.evUnit ?? ""}); sizing/ação inadequado.`;
      }

      return {
        actionName,
        frequency: freq,
        ev,
        deltaEvFromBest: deltaEv,
        deltaPctOfPot,
        viability,
        interpretation,
      };
    })
    .sort((a, b) => b.ev - a.ev);

  return {
    available: true,
    evUnit: ref.evUnit,
    bestAction,
    bestEv,
    options,
    reSolveCaveat,
  };
}

/**
 * Gera a análise completa de Blockers, Range Advantage, Nut Advantage, Realização de Equidade e Comparação de Sizings.
 */
export function analyzeSpotReasoning(
  spot: CanonicalSpot,
  handClass: string,
  heroCards?: readonly (string | PlayingCard)[] | null,
): SpotConceptualReasoning {
  const deadCards: (string | PlayingCard)[] = [...spot.board];
  if (heroCards && heroCards.length === 2) {
    deadCards.push(heroCards[0], heroCards[1]);
  }

  const targetValueClasses = ["AA", "KK", "QQ", "AKs", "AKo", "AQs"];
  const blockedValueClasses = targetValueClasses.map((target) => {
    const baseCombos = getHandCombos(target);
    let remainingCombos = baseCombos;
    try {
      remainingCombos = getAvailableCombosForClass(target, deadCards).length;
    } catch {
      remainingCombos = baseCombos;
    }
    const reductionPct = Math.round(((baseCombos - remainingCombos) / baseCombos) * 100);
    return { hand: target, baseCombos, remainingCombos, reductionPct };
  });

  const r1 = handClass[0];
  const r2 = handClass[1];
  const isPair = handClass.length === 2;
  const isSuited = handClass.endsWith("s");
  const idx1 = RANKS.indexOf(r1 as (typeof RANKS)[number]);
  const idx2 = RANKS.indexOf(r2 as (typeof RANKS)[number]);
  const gap = Math.abs(idx1 - idx2);

  const hasAceBlocker = r1 === "A" || r2 === "A";
  const hasKingBlocker = r1 === "K" || r2 === "K";

  const boardRanks = spot.board.map((c) => {
    try {
      return parseCard(c).rank;
    } catch {
      return c[0];
    }
  });
  const hitsBoardPair = boardRanks.includes(r1 as (typeof RANKS)[number]) || boardRanks.includes(r2 as (typeof RANKS)[number]);

  let bluffScore = 45;
  if (hasAceBlocker) bluffScore += 25;
  else if (hasKingBlocker) bluffScore += 15;
  if (!isPair && !hitsBoardPair && idx2 >= 7) bluffScore += 18; // fundo do range sem showdown
  if (isPair && idx1 <= 4) bluffScore -= 35; // muito valor de showdown para blefar
  if (hitsBoardPair && idx1 <= 2) bluffScore -= 30;
  bluffScore = Math.max(5, Math.min(95, bluffScore));

  const bluffLabel: BlockerImpactDetail["riverBluffCandidateHeuristic"]["label"] =
    bluffScore >= 70
      ? "Forte Candidato Heurístico"
      : bluffScore >= 45
        ? "Candidato Neutro"
        : "Mau Candidato (Showdown/Bloqueia Folds)";

  const heroCardsFormatted =
    heroCards && heroCards.length === 2
      ? heroCards
          .map((c) => {
            const p = typeof c === "string" ? parseCard(c) : c;
            return `${p.rank}${p.suit}`;
          })
          .join(" ")
      : handClass;

  const aaEntry = blockedValueClasses.find((c) => c.hand === "AA")!;
  const kkEntry = blockedValueClasses.find((c) => c.hand === "KK")!;
  const aksEntry = blockedValueClasses.find((c) => c.hand === "AKs")!;
  const akoEntry = blockedValueClasses.find((c) => c.hand === "AKo")!;
  const akBase = aksEntry.baseCombos + akoEntry.baseCombos; // 16
  const akRem = aksEntry.remainingCombos + akoEntry.remainingCombos;
  const akRedPct = Math.round(((akBase - akRedSafe(akRem, akBase)) / akBase) * 100);

  function akRedSafe(rem: number, base: number): number {
    return Math.max(0, Math.min(base, rem));
  }

  const blocker: BlockerImpactDetail = {
    handClass,
    heroCardsFormatted,
    combinatoricsType: "EXACT_COMBINATORICS",
    blockedValueClasses,
    unblockedFoldRegionNote:
      idx2 >= 7
        ? `Carta baixa (${r2}) preserva combos médios/altos desconectados que o vilão folda sob pressão.`
        : `Cartas (${r1}${r2}) interagem com a região de broadways; avalie se o vilão folda pares baixos ou draws falhados.`,
    blockerSummary: hasAceBlocker
      ? `Combinatória exata (mão + board): AA reduzido de ${aaEntry.baseCombos} para ${aaEntry.remainingCombos} combos (-${aaEntry.reductionPct}%) e AK de ${akBase} para ${akRem} combos (-${akRedPct}%).`
      : hasKingBlocker
        ? `Combinatória exata (mão + board): KK reduzido de ${kkEntry.baseCombos} para ${kkEntry.remainingCombos} combos (-${kkEntry.reductionPct}%) e AK de ${akBase} para ${akRem} combos (-${akRedPct}%).`
        : `Combinatória exata (mão + board): AA permanece com ${aaEntry.remainingCombos}/${aaEntry.baseCombos} combos e KK com ${kkEntry.remainingCombos}/${kkEntry.baseCombos} combos.`,
    riverBluffCandidateHeuristic: {
      computationType: "HEURISTIC_MODEL",
      score100: bluffScore,
      label: bluffLabel,
      explanation:
        bluffScore >= 70
          ? `Combina bloqueador relevante de topo (${r1}) com baixo valor de showdown (${r2}), alinhado à heurística da Aula 05.`
          : bluffScore <= 35
            ? `Possui valor de showdown próprio (par/top pair); prefira extrair valor ou realizar showdown em vez de transformar em blefe sem necessidade.`
            : `Bloqueadores moderados; a decisão de blefar depende estritamente da frequência da árvore resolvida.`,
      epistemicWarning:
        "HEURISTIC_EXPLANATION_ONLY — Esta pontuação é didática e jamais declara um blefe como GTO sem solver.",
    },
  };

  // Range Advantage & Nut Advantage (Modelo Heurístico Qualitativo — não substitui equidade real de solver)
  const heuristicAdvantageNote =
    "HEURISTIC_MODEL — Estimativa pedagógica qualitativa baseada em posição e textura do board (não é cálculo de equidade de solver).";
  const highCardsOnBoard = boardRanks.filter((r) => ["A", "K", "Q"].includes(r)).length;
  const lowConnectedBoard =
    spot.board.length >= 3 &&
    boardRanks.every((r) => ["9", "8", "7", "6", "5", "4"].includes(r));

  let rangeAdvantage: AdvantageAnalysis;
  let nutAdvantage: AdvantageAnalysis;

  if (spot.street === "PREFLOP") {
    if (spot.spotType === "rfi") {
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "HERO",
        score: 35,
        headline: `Iniciativa de RFI (${spot.heroPosition})`,
        rationale: `Ao abrir em ${spot.heroPosition}, o herói representa o topo condensado/linear das 169 mãos contra os ranges ainda não filtrados atrás.`,
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "HERO",
        score: 45,
        headline: "100% dos pares de topo (AA/KK/QQ/AK) presentes no range de RFI",
        rationale: "O range de abertura detém todos os combos super-premium sem capagem prévia.",
      };
    } else if (spot.heroPosition === "BB") {
      const vsEarly = spot.villainPosition && EARLY_POSITIONS.has(spot.villainPosition);
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "VILLAIN",
        score: vsEarly ? -55 : -25,
        headline: `Defesa do BB contra range mais filtrado (${spot.villainPosition ?? "RFI"})`,
        rationale: vsEarly
          ? "Contra posições iniciais (UTG/MP), o range do abridor é muito forte e concentra equidade superior."
          : "Contra late position (CO/BTN), o range do abridor é amplo, reduzindo a desvantagem de range do BB.",
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "VILLAIN",
        score: -40,
        headline: "Agressor retém densidade superior de AA/KK/QQ/AK",
        rationale: "Se o BB apenas paga (flat call), seu range fica capado no topo e transfere a vantagem de nuts para o agressor.",
      };
    } else {
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "BALANCED",
        score: 10,
        headline: `Confronto seletivo (${spot.heroPosition} vs ${spot.villainPosition ?? "Mesa"})`,
        rationale: "O range que reage a um open precisa superar o Gap Concept, filtrando mãos dominadas.",
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "BALANCED",
        score: 15,
        headline: "Disputa pelo topo do range via 3-Bet/All-in",
        rationale: "Ambos os ranges preservam combos de topo antes de um flat call capar o range.",
      };
    }
  } else {
    // Postflop
    const heroIsAggressor = spot.spotType !== "bb_vs_cbet";
    if (highCardsOnBoard >= 2) {
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: heroIsAggressor ? "HERO" : "VILLAIN",
        score: heroIsAggressor ? 65 : -65,
        headline: `Board High-Card (${spot.board.join(" ")}) favorece fortemente o Agressor Pré-Flop`,
        rationale:
          "O agressor em posição chega ao flop com todos os combos de AA, KK, AK, AQ e KQ, enquanto o BB 3-beta grande parte dessas mãos pré-flop.",
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: heroIsAggressor ? "HERO" : "VILLAIN",
        score: heroIsAggressor ? 75 : -75,
        headline: "Vantagem maciça de Nuts para o Agressor IP",
        rationale:
          "Top sets (AA/KK) e top two pair (AK) estão concentrados no range do abridor, autorizando alta frequência de C-bet e barreling polarizado.",
      };
    } else if (lowConnectedBoard) {
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: heroIsAggressor ? "BALANCED" : "HERO",
        score: heroIsAggressor ? -15 : 20,
        headline: `Board Baixo Conectado (${spot.board.join(" ")}) nivela a equidade dos ranges`,
        rationale:
          "Muitas overcards não acertadas do agressor perdem equidade para os pares e conectores defendidos pelo BB.",
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: heroIsAggressor ? "VILLAIN" : "HERO",
        score: heroIsAggressor ? -45 : 45,
        headline: "Densidade de 2 Pares, Sequências e Sets Baixos favorece o Defensor (BB)",
        rationale:
          "O BB defende todos os suited connectors e gappers baixos (87s, 75s, 64s, 96s), obrigando o agressor IP a checar com alta frequência.",
      };
    } else {
      rangeAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: heroIsAggressor ? "HERO" : "VILLAIN",
        score: heroIsAggressor ? 30 : -30,
        headline: `Ligeira vantagem de range para o agressor em ${spot.board.join(" ")}`,
        rationale: "Overpairs e top pairs com melhores kickers mantêm o agressor à frente na média do range.",
      };
      nutAdvantage = {
        computationType: "HEURISTIC_MODEL",
        epistemicNote: heuristicAdvantageNote,
        leader: "BALANCED",
        score: 0,
        headline: "Nut Advantage compartilhada na textura intermediária",
        rationale: "Ambos os jogadores possuem trincas e possíveis dois pares/draws fortes neste board.",
      };
    }
  }

  // Equity Realization (R)
  const ip = isHeroInPositionPostflop(spot.heroPosition, spot.villainPosition);
  let realizationFactor = 1.0;
  const factors: string[] = [];

  if (ip) {
    realizationFactor += 0.12;
    factors.push("Agir por último (IP) permite controlar o pote, realizar check-back gratuito e cobrar draws.");
  } else {
    realizationFactor -= 0.14;
    factors.push("Jogar fora de posição (OOP) dificulta chegar ao showdown gratuitamente quando acerta par médio/fraco.");
  }

  if (isSuited) {
    realizationFactor += 0.08;
    factors.push("Mão suited adiciona ~3%–4% de equidade bruta e backdoor flush draws que continuam em mais flops.");
  } else if (!isPair) {
    realizationFactor -= 0.07;
    factors.push("Mão offsuit sem par realiza menos equidade por gerar menos draws e sofrer mais pressão em turns/rivers.");
  }

  if (isPair) {
    realizationFactor += 0.04;
    factors.push("Par de mão possui equidade imediata de showdown e potencial oculto de trinca (set mining).");
  } else if (gap <= 2 && idx2 <= 9) {
    realizationFactor += 0.05;
    factors.push("Conectividade alta (cartas próximas) aumenta a formação de sequências e draws fortes.");
  } else if (gap >= 4) {
    realizationFactor -= 0.05;
    factors.push("Cartas desconectadas (gap grande) reduzem a formação de dois pares e sequências.");
  }

  if (LATE_POSITIONS.has(spot.heroPosition) && spot.street === "PREFLOP") {
    factors.push("Poucos jogadores restantes atrás diminuem o risco de sofrer 3-bet/squeeze antes de ver o flop.");
  }

  realizationFactor = Math.round(Math.max(0.55, Math.min(1.28, realizationFactor)) * 100) / 100;
  const tier: EquityRealizationAnalysis["tier"] =
    realizationFactor >= 1.05 ? "ALTA" : realizationFactor >= 0.88 ? "MEDIA" : "BAIXA";

  const equityRealization: EquityRealizationAnalysis = {
    computationType: "HEURISTIC_MODEL",
    epistemicNote:
      "HEURISTIC_MODEL — O fator R é uma estimativa conceitual didática (posição, naipe, conectividade) e não substitui realização de equidade calculada em solver.",
    tier,
    estimatedFactor: realizationFactor,
    positionalStatus:
      spot.street === "PREFLOP"
        ? ip
          ? "IP (Em Posição)"
          : "OOP (Fora de Posição)"
        : ip
          ? "IP (Em Posição)"
          : "OOP (Fora de Posição)",
    headline: `Realização de Equidade ${tier} (Fator Heurístico R ≈ ${realizationFactor.toFixed(2)}x)`,
    factors,
  };

  const sizingComparison = compareActionSizings(spot, handClass);

  return {
    blocker,
    rangeAdvantage,
    nutAdvantage,
    equityRealization,
    sizingComparison,
  };
}
