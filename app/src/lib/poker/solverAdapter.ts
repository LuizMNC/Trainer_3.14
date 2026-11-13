import { getAll169Hands, getAvailableCombosForClass, validateDeckUnique } from "./cards.ts";
import { getPositionsForSeatCount, type GameFormat, type GameVariant, type Street } from "./stateEngine.ts";
import {
  type CanonicalAction,
  type CanonicalSpot,
  computeAssumptionsHash,
  type CurriculumTrackId,
  type SolutionAssumptions,
  type StrategyUnit,
} from "./strategySchema.ts";
import {
  combo4ToHandClass,
  isValidSha256Hex,
  type TexasSolverBundleV1,
} from "./solverFormats.ts";

export const SOLVER_ADAPTER_VERSION = "1.1.0" as const;

export interface ExternalSolverSeatSpec {
  seatIndex: number;
  position: string;
  stackBb: number;
  bountyUsd?: number;
}

export interface ExternalSolverActionHistoryStep {
  street: Street;
  position: string;
  action: string;
  sizeBb?: number;
}

export interface ExternalSolverSizingSpec {
  actionName: string;
  color?: string;
  sizeBb?: number;
  sizePctPot?: number;
}

export interface ExternalSolverPayloadV1 {
  schemaVersion: string;
  spotId: string;
  spotName: string;
  trackId: CurriculumTrackId;
  spotType: string;
  format: GameFormat;
  variant: GameVariant;
  effectiveStackBb: number;
  blinds: {
    sbBb: number;
    bbBb: number;
  };
  anteBbPerPlayer: number;
  rakePct: number;
  playersCount: number;
  seats: ExternalSolverSeatSpec[];
  heroPosition: string;
  villainPosition: string | null;
  actionHistory: ExternalSolverActionHistoryStep[];
  street: Street;
  board: string[];
  potSizeBb: number;
  toCallBb: number;
  sizings: ExternalSolverSizingSpec[];
  evUnit: StrategyUnit;
  icmMode: "chipEV" | "ICM" | "PKO_BOUNTY";
  payoutsUsd?: number[];
  ranges: {
    heroRangeDescription: string;
    villainRangeDescription: string;
    sourceReference: string;
  };
  provenance: {
    solverName: string;
    solverVersion: string;
    abstraction: string;
    convergenceTargetPct: number;
    achievedExploitabilityPct: number;
    createdAtIso: string;
    license: string;
    fileOrReference: string;
    fileSha256: string;
    configSha256?: string;
  };
  /** Escopo da solução: matriz completa de 169 classes ou subconjunto explícito de mãos resolvidas */
  scope: "FULL_169_MATRIX" | "EXPLICIT_HAND_SUBSET";
  matrixFrequencies: Record<string, Record<string, number>>;
  matrixEv: Record<string, Record<string, number>>;
  conceptualGuidance?: string;
}

const STREET_ORDER: Record<Street, number> = {
  PREFLOP: 0,
  FLOP: 1,
  TURN: 2,
  RIVER: 3,
};

const PLACEHOLDER_FILE_REFS = new Set([
  "none",
  "unknown",
  "test",
  "test.json",
  "broken.json",
  "mock.json",
  "invalid",
  "dummy.json",
]);

export interface SolverImportResult {
  ok: boolean;
  status: "VERIFIED" | "UNSOLVED";
  spot: CanonicalSpot;
  errors: string[];
  warnings: string[];
  assumptionsHash: string | null;
  adapterVersion: string;
}

const EXPECTED_BOARD_LENGTH: Record<Street, number> = {
  PREFLOP: 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
};

const DEFAULT_ACTION_COLORS = ["#dc2626", "#f43f5e", "#22c55e", "#3b82f6", "#a855f7"];

/**
 * Valida a consistência entre frequências e EVs em uma célula resolvida pelo solver:
 * 1. Todas as ações devem pertencer a legalActions.
 * 2. Soma das frequências deve ser 1.0 ± freqTolerance.
 * 3. Em equilíbrio de Nash convergido, qualquer ação com frequência >= 0.08 não pode ter EV
 *    substancialmente inferior ao maxEV (bestEv - ev <= maxIndifferenceEvDelta).
 * 4. Nenhuma ação com frequência 0% pode ter EV estritamente maior que a melhor ação ativa.
 */
export function validateCellFrequencyAndEvConsistency(params: {
  hand: string;
  frequencies: Record<string, number>;
  evs: Record<string, number>;
  legalActionNames: readonly string[];
  freqTolerance?: number;
  maxIndifferenceEvDelta?: number;
}): { valid: boolean; errors: string[] } {
  const {
    hand,
    frequencies,
    evs,
    legalActionNames,
    freqTolerance = 0.005,
    maxIndifferenceEvDelta = 0.08,
  } = params;

  const errors: string[] = [];
  let freqSum = 0;

  for (const [act, freq] of Object.entries(frequencies)) {
    if (!legalActionNames.includes(act)) {
      errors.push(`${hand}: ação '${act}' em frequencies não pertence às ações legais.`);
    }
    if (!Number.isFinite(freq) || freq < -1e-6 || freq > 1 + 1e-6) {
      errors.push(`${hand}: frequência inválida (${freq}) para '${act}'.`);
    }
    freqSum += freq;
  }

  if (Math.abs(freqSum - 1.0) > freqTolerance) {
    errors.push(
      `${hand}: soma das frequências (${freqSum.toFixed(4)}) diverge de 1.0 além da tolerância (${freqTolerance}).`,
    );
  }

  for (const act of legalActionNames) {
    if (evs[act] === undefined || !Number.isFinite(evs[act])) {
      errors.push(`${hand}: EV numérico ausente ou inválido para a ação legal '${act}'.`);
    }
  }

  for (const act of Object.keys(evs)) {
    if (!legalActionNames.includes(act)) {
      errors.push(`${hand}: ação '${act}' em matrixEv não pertence às ações legais.`);
    }
  }

  if (errors.length === 0) {
    let maxActiveEv = -Infinity;
    let maxOverallEv = -Infinity;

    for (const act of legalActionNames) {
      const f = frequencies[act] ?? 0;
      const ev = evs[act];
      if (ev > maxOverallEv) maxOverallEv = ev;
      if (f > 0.01 && ev > maxActiveEv) maxActiveEv = ev;
    }

    // Verifica se alguma ação de 0% tem EV maior que a melhor ação ativa
    if (maxOverallEv - maxActiveEv > maxIndifferenceEvDelta) {
      errors.push(
        `${hand}: inconsistência de equilíbrio — ação com frequência ~0% possui EV (${maxOverallEv.toFixed(3)}) superior à ação escolhida (${maxActiveEv.toFixed(3)}).`,
      );
    }

    // Verifica indiferença nas ações mistas com frequência relevante (>= 8%)
    for (const act of legalActionNames) {
      const f = frequencies[act] ?? 0;
      const ev = evs[act];
      if (f >= 0.08 && maxOverallEv - ev > maxIndifferenceEvDelta) {
        errors.push(
          `${hand}: inconsistência de estratégia mista — ação '${act}' tem frequência ${(f * 100).toFixed(1)}%, mas seu EV (${ev.toFixed(3)}) é muito inferior ao ótimo (${maxOverallEv.toFixed(3)}, Δ=${(maxOverallEv - ev).toFixed(3)} > ${maxIndifferenceEvDelta}).`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Adaptador versionado (ETAPA 4) para importar resultados de solvers externos.
 * Se qualquer pré-requisito falhar ou estiver incompleto, mantém o spot como UNSOLVED
 * e JAMAIS inventa frequências, ranges ou EVs.
 */
export function importExternalSolverSolution(
  payload: Partial<ExternalSolverPayloadV1>,
  options?: { freqTolerance?: number; maxIndifferenceEvDelta?: number },
): SolverImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.schemaVersion !== SOLVER_ADAPTER_VERSION) {
    errors.push(
      `Versão do schema incompatível: recebido '${String(payload.schemaVersion)}', esperado '${SOLVER_ADAPTER_VERSION}'.`,
    );
  }

  if (!payload.spotId?.trim()) errors.push("Campo 'spotId' é obrigatório.");
  if (!payload.spotName?.trim()) errors.push("Campo 'spotName' é obrigatório.");
  if (!payload.format || !["MTT", "SNG", "CASH"].includes(payload.format)) {
    errors.push(`Formato inválido: '${String(payload.format)}' (esperado MTT, SNG ou CASH).`);
  }
  if (payload.variant !== "NLHE") {
    errors.push(`Variante inválida: '${String(payload.variant)}' (esperado NLHE).`);
  }
  if (
    typeof payload.effectiveStackBb !== "number" ||
    !Number.isFinite(payload.effectiveStackBb) ||
    payload.effectiveStackBb <= 0
  ) {
    errors.push("Stack efetivo ('effectiveStackBb') deve ser um número positivo.");
  }

  if (
    !payload.blinds ||
    typeof payload.blinds.sbBb !== "number" ||
    typeof payload.blinds.bbBb !== "number" ||
    payload.blinds.sbBb < 0 ||
    payload.blinds.bbBb <= 0
  ) {
    errors.push("Blinds ('blinds.sbBb' >= 0 e 'blinds.bbBb' > 0) são obrigatórios.");
  }

  if (
    typeof payload.anteBbPerPlayer !== "number" ||
    !Number.isFinite(payload.anteBbPerPlayer) ||
    payload.anteBbPerPlayer < 0
  ) {
    errors.push("Ante ('anteBbPerPlayer') deve ser um número >= 0.");
  }

  if (
    typeof payload.rakePct !== "number" ||
    !Number.isFinite(payload.rakePct) ||
    payload.rakePct < 0 ||
    payload.rakePct > 0.25
  ) {
    errors.push("Rake ('rakePct') deve estar no intervalo [0, 0.25].");
  }

  if (
    typeof payload.playersCount !== "number" ||
    payload.playersCount < 2 ||
    payload.playersCount > 9
  ) {
    errors.push("Número de jogadores ('playersCount') deve estar entre 2 e 9.");
  } else {
    const validPositions = getPositionsForSeatCount(payload.playersCount);
    if (!payload.seats || payload.seats.length !== payload.playersCount) {
      errors.push(
        `Lista de assentos ('seats') deve conter exatamente ${payload.playersCount} jogadores.`,
      );
    } else {
      const seenIndices = new Set<number>();
      const seenPositions = new Set<string>();
      for (const s of payload.seats) {
        if (!Number.isFinite(s.stackBb) || s.stackBb <= 0) {
          errors.push(`Assento ${s.position} possui stack inválido (${s.stackBb}).`);
        }
        if (!validPositions.includes(s.position)) {
          errors.push(
            `Posição '${s.position}' não é canônica para mesa de ${payload.playersCount} jogadores (${validPositions.join(", ")}).`,
          );
        }
        if (seenIndices.has(s.seatIndex)) {
          errors.push(`Índice de assento duplicado: ${s.seatIndex}.`);
        }
        if (seenPositions.has(s.position)) {
          errors.push(`Posição duplicada em seats: '${s.position}'.`);
        }
        seenIndices.add(s.seatIndex);
        seenPositions.add(s.position);
      }
      if (payload.heroPosition && !seenPositions.has(payload.heroPosition)) {
        errors.push(`Posição do herói '${payload.heroPosition}' não existe nos assentos informados.`);
      }
      if (payload.villainPosition && !seenPositions.has(payload.villainPosition)) {
        errors.push(`Posição do vilão '${payload.villainPosition}' não existe nos assentos informados.`);
      }
    }
    if (payload.heroPosition && !validPositions.includes(payload.heroPosition)) {
      errors.push(`Posição do herói '${payload.heroPosition}' inválida para ${payload.playersCount}-max.`);
    }
    if (payload.villainPosition && !validPositions.includes(payload.villainPosition)) {
      errors.push(`Posição do vilão '${payload.villainPosition}' inválida para ${payload.playersCount}-max.`);
    }
    if (payload.heroPosition && payload.villainPosition && payload.heroPosition === payload.villainPosition) {
      errors.push("Posição do herói e do vilão não podem ser idênticas.");
    }
  }

  const street = payload.street ?? "PREFLOP";
  if (!["PREFLOP", "FLOP", "TURN", "RIVER"].includes(street)) {
    errors.push(`Street inválida: '${String(street)}'.`);
  } else {
    const board = payload.board ?? [];
    const expectedLen = EXPECTED_BOARD_LENGTH[street];
    if (board.length !== expectedLen) {
      errors.push(
        `Board incompatível com a street ${street}: esperado ${expectedLen} cartas, recebido ${board.length}.`,
      );
    }
    const deckCheck = validateDeckUnique(board);
    if (!deckCheck.valid) {
      errors.push(`Board contém cartas inválidas ou duplicadas: ${deckCheck.error}`);
    }
  }

  if (!Array.isArray(payload.actionHistory)) {
    errors.push("Histórico de ações ('actionHistory') deve ser um array.");
  } else {
    if (street !== "PREFLOP" && payload.actionHistory.length === 0) {
      errors.push(`Cenário pós-flop (${street}) exige 'actionHistory' não vazio para rastrear o pote.`);
    }
    const validSeatPosSet = new Set((payload.seats ?? []).map((s) => s.position));
    let lastStreetOrd = 0;
    let hasPreflopAction = false;
    for (let idx = 0; idx < payload.actionHistory.length; idx++) {
      const step = payload.actionHistory[idx];
      if (!step || !["PREFLOP", "FLOP", "TURN", "RIVER"].includes(step.street)) {
        errors.push(`Histórico[${idx}]: street inválida.`);
        continue;
      }
      if (step.street === "PREFLOP") hasPreflopAction = true;
      const ord = STREET_ORDER[step.street];
      if (ord < lastStreetOrd || ord > STREET_ORDER[street]) {
        errors.push(`Histórico[${idx}]: ordem de street inválida (${step.street} em cenário ${street}).`);
      }
      lastStreetOrd = ord;
      if (validSeatPosSet.size > 0 && !validSeatPosSet.has(step.position)) {
        errors.push(`Histórico[${idx}]: posição '${step.position}' fora dos assentos informados.`);
      }
      const actLow = (step.action ?? "").trim().toLowerCase();
      if (!/^(fold|check|call|bet|raise|allin|all-in)/.test(actLow)) {
        errors.push(`Histórico[${idx}]: ação não reconhecida '${step.action}'.`);
      }
      if (/^(bet|raise)/.test(actLow) && (typeof step.sizeBb !== "number" || !Number.isFinite(step.sizeBb) || step.sizeBb <= 0)) {
        errors.push(`Histórico[${idx}]: ação '${step.action}' exige 'sizeBb' positivo.`);
      }
    }
    if (street !== "PREFLOP" && payload.actionHistory.length > 0 && !hasPreflopAction) {
      errors.push("Histórico pós-flop deve incluir ações pré-flop rastreáveis.");
    }
  }

  if (
    typeof payload.potSizeBb !== "number" ||
    !Number.isFinite(payload.potSizeBb) ||
    payload.potSizeBb <= 0
  ) {
    errors.push("Tamanho do pote ('potSizeBb') deve ser positivo.");
  } else if (
    payload.blinds &&
    typeof payload.anteBbPerPlayer === "number" &&
    typeof payload.playersCount === "number"
  ) {
    const minDeadPot =
      payload.blinds.sbBb + payload.blinds.bbBb + payload.anteBbPerPlayer * payload.playersCount;
    if (payload.potSizeBb + 1e-6 < minDeadPot) {
      errors.push(
        `Inconsistência de pote: potSizeBb (${payload.potSizeBb}) menor que blinds+antes iniciais (${minDeadPot.toFixed(2)}).`,
      );
    }
  }

  if (
    typeof payload.toCallBb !== "number" ||
    !Number.isFinite(payload.toCallBb) ||
    payload.toCallBb < 0
  ) {
    errors.push("Valor para pagar ('toCallBb') deve ser >= 0.");
  }

  if (!Array.isArray(payload.sizings) || payload.sizings.length < 2) {
    errors.push("Árvore de sizings ('sizings') deve conter pelo menos 2 ações legais.");
  } else if (typeof payload.toCallBb === "number" && Number.isFinite(payload.toCallBb)) {
    for (const s of payload.sizings) {
      const aLow = (s.actionName ?? "").trim().toLowerCase();
      if (payload.toCallBb === 0 && (aLow === "fold" || aLow === "call" || aLow.startsWith("raise"))) {
        errors.push(`Ação ilegal '${s.actionName}' quando toCallBb = 0 (use Check ou Bet).`);
      }
      if (payload.toCallBb > 0 && (aLow === "check" || aLow.startsWith("bet"))) {
        errors.push(`Ação ilegal '${s.actionName}' enfrentando aposta (toCallBb = ${payload.toCallBb} > 0).`);
      }
      if (
        typeof s.sizeBb === "number" &&
        typeof payload.effectiveStackBb === "number" &&
        s.sizeBb > payload.effectiveStackBb + 0.05
      ) {
        errors.push(`Sizing '${s.actionName}' (${s.sizeBb} BB) excede o stack efetivo (${payload.effectiveStackBb} BB).`);
      }
    }
  }

  if (!payload.evUnit || !["bbEV", "chips", "$EV"].includes(payload.evUnit)) {
    errors.push(`Unidade de EV inválida: '${String(payload.evUnit)}' (esperado bbEV, chips ou $EV).`);
  }

  if (payload.icmMode === "ICM") {
    if (payload.evUnit !== "$EV") {
      errors.push("Soluções com icmMode='ICM' exigem obrigatoriamente evUnit='$EV'.");
    }
    if (!Array.isArray(payload.payoutsUsd) || payload.payoutsUsd.length < 2) {
      errors.push("Soluções ICM exigem estrutura de premiação explícita ('payoutsUsd').");
    }
  } else if (payload.icmMode === "chipEV" && payload.evUnit === "$EV") {
    errors.push("Soluções chipEV não podem declarar evUnit='$EV' sem modelo monetário.");
  } else if (payload.icmMode === "PKO_BOUNTY") {
    const hasBounties = payload.seats?.some((s) => typeof s.bountyUsd === "number" && s.bountyUsd > 0);
    if (!hasBounties) {
      errors.push("Soluções PKO_BOUNTY exigem vetor de 'bountyUsd' explícito nos assentos ('seats').");
    }
  }

  if (
    !payload.ranges ||
    !payload.ranges.heroRangeDescription?.trim() ||
    !payload.ranges.villainRangeDescription?.trim() ||
    !payload.ranges.sourceReference?.trim()
  ) {
    errors.push("Ranges explícitos de entrada ('ranges.heroRangeDescription', 'villainRangeDescription', 'sourceReference') são obrigatórios.");
  }

  if (
    !payload.provenance ||
    !payload.provenance.solverName?.trim() ||
    !payload.provenance.solverVersion?.trim() ||
    !payload.provenance.abstraction?.trim()
  ) {
    errors.push(
      "Proveniência incompleta: 'solverName', 'solverVersion' e 'abstraction' são obrigatórios.",
    );
  } else {
    const lowerSolver = payload.provenance.solverName.trim().toLowerCase();
    const fileRefLower = (payload.provenance.fileOrReference ?? "").trim().toLowerCase();
    const forbiddenSyntheticSolvers = [
      "solveradapter reference tree",
      "solveradapter postflop reference",
      "solveradapter icm engine",
      "solveradapter pko bounty engine",
      "didacticdemoengine",
      "synthetic",
      "mock",
      "manual",
      "dummy",
      "fake",
      "exemplo",
    ];
    if (
      forbiddenSyntheticSolvers.some((forbidden) => lowerSolver.includes(forbidden)) ||
      !fileRefLower ||
      fileRefLower.startsWith("solveradapter.ts#") ||
      PLACEHOLDER_FILE_REFS.has(fileRefLower)
    ) {
      errors.push(
        `Proveniência sintética/genérica rejeitada ('${payload.provenance.solverName}' / '${payload.provenance.fileOrReference}'). Apenas dumps reais de solvers externos auditáveis podem receber status VERIFIED.`,
      );
    }
    if (!isValidSha256Hex(payload.provenance.fileSha256)) {
      errors.push("Hash criptográfico SHA-256 ('provenance.fileSha256', 64 caracteres hex) é obrigatório para validar integridade.");
    }
    if (payload.provenance.configSha256 !== undefined && !isValidSha256Hex(payload.provenance.configSha256)) {
      errors.push("Hash 'provenance.configSha256' inválido (esperado 64 hex).");
    }
    if (!payload.provenance.createdAtIso || Number.isNaN(Date.parse(payload.provenance.createdAtIso))) {
      errors.push("Data ISO válida ('provenance.createdAtIso') é obrigatória.");
    }
    if (
      typeof payload.provenance.convergenceTargetPct !== "number" ||
      !Number.isFinite(payload.provenance.convergenceTargetPct) ||
      payload.provenance.convergenceTargetPct < 0
    ) {
      errors.push("Critério de convergência ('convergenceTargetPct') inválido.");
    }
    if (
      typeof payload.provenance.achievedExploitabilityPct !== "number" ||
      !Number.isFinite(payload.provenance.achievedExploitabilityPct) ||
      payload.provenance.achievedExploitabilityPct < 0 ||
      payload.provenance.achievedExploitabilityPct > 25
    ) {
      errors.push("Exploitability atingida ('achievedExploitabilityPct') inválida ou acima do limite aceitável (0..25%).");
    }
  }

  const legalActionNames = (payload.sizings ?? []).map((s) => s.actionName);
  const legalActions: CanonicalAction[] = (payload.sizings ?? []).map((s, idx) => ({
    name: s.actionName,
    color: s.color ?? DEFAULT_ACTION_COLORS[idx % DEFAULT_ACTION_COLORS.length],
  }));

  if (!payload.matrixFrequencies || !payload.matrixEv) {
    errors.push("Matrizes 'matrixFrequencies' e 'matrixEv' são obrigatórias.");
  } else if (legalActionNames.length >= 2) {
    const expectedHands =
      payload.scope === "EXPLICIT_HAND_SUBSET"
        ? Object.keys(payload.matrixFrequencies)
        : getAll169Hands();

    if (expectedHands.length === 0) {
      errors.push("Nenhuma mão fornecida em 'matrixFrequencies'.");
    }

    let cellErrCount = 0;
    const boardArr = payload.board ?? [];
    for (const hand of expectedHands) {
      if (boardArr.length > 0 && getAvailableCombosForClass(hand, boardArr).length === 0) {
        cellErrCount++;
        if (cellErrCount <= 5) {
          errors.push(`Mão '${hand}' possui 0 combos possíveis após remoção das cartas do board [${boardArr.join(", ")}].`);
        }
        continue;
      }
      const freqDist = payload.matrixFrequencies[hand];
      const evDist = payload.matrixEv[hand];
      if (!freqDist || !evDist) {
        cellErrCount++;
        if (cellErrCount <= 5) {
          errors.push(`Mão '${hand}' ausente em matrixFrequencies ou matrixEv (proibido inventar dados).`);
        }
        continue;
      }
      const cellValidation = validateCellFrequencyAndEvConsistency({
        hand,
        frequencies: freqDist,
        evs: evDist,
        legalActionNames,
        freqTolerance: options?.freqTolerance ?? 0.005,
        maxIndifferenceEvDelta: options?.maxIndifferenceEvDelta ?? 0.08,
      });
      if (!cellValidation.valid) {
        cellErrCount++;
        if (cellErrCount <= 5) {
          errors.push(...cellValidation.errors);
        }
      }
    }
    if (cellErrCount > 5) {
      errors.push(`... e mais ${cellErrCount - 5} mãos falharam na validação de frequência/EV.`);
    }
  }

  const fallbackTrack: CurriculumTrackId = payload.trackId ?? "PREFLOP_RFI";

  // Se houver qualquer erro de validação, mantém o spot estritamente como UNSOLVED sem inventar dados!
  if (errors.length > 0) {
    const unsolvedSpot: CanonicalSpot = {
      spotId: payload.spotId || "unsolved_invalid_import",
      name: payload.spotName || "[UNSOLVED] Importação Incompleta/Incompatível",
      trackId: fallbackTrack,
      spotType: payload.spotType || "rfi",
      format: payload.format ?? "MTT",
      variant: "NLHE",
      playersInitial: payload.playersCount ?? 8,
      street: street,
      board: payload.board ?? [],
      heroPosition: payload.heroPosition ?? "BTN",
      villainPosition: payload.villainPosition ?? null,
      heroCards: null,
      effectiveStackBb: payload.effectiveStackBb ?? 30,
      anteBbPerPlayer: payload.anteBbPerPlayer ?? 0.125,
      potBb: payload.potSizeBb ?? null,
      legalActions:
        legalActions.length >= 2
          ? legalActions
          : [
              { name: "Fold", color: "#3b82f6" },
              { name: "Call", color: "#22c55e" },
            ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Rejeitado pelo SolverAdapter v1.0 (incompleto ou inconsistente)",
          fileOrReference: payload.provenance?.fileOrReference ?? "invalid_payload",
          importedAtIso: new Date().toISOString(),
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: errors,
      },
      lesson: {
        trackId: fallbackTrack,
        concepts: ["UNSOLVED", "Validação de Solver"],
        interpretationSource: "SolverAdapterV1",
        conceptualGuidance:
          "Esta estratégia foi mantida como UNSOLVED porque o arquivo importado estava incompleto ou apresentou inconsistências de frequência/EV. Nenhum dado foi inventado.",
      },
    };

    return {
      ok: false,
      status: "UNSOLVED",
      spot: unsolvedSpot,
      errors,
      warnings,
      assumptionsHash: null,
      adapterVersion: SOLVER_ADAPTER_VERSION,
    };
  }

  const historySig = (payload.actionHistory ?? [])
    .map((h) => `${h.street}:${h.position}:${h.action}${h.sizeBb !== undefined ? `@${h.sizeBb}` : ""}`)
    .join("|");
  const assumptions: SolutionAssumptions = {
    format: payload.format!,
    variant: payload.variant!,
    playersInitial: payload.playersCount!,
    effectiveStackBb: payload.effectiveStackBb!,
    anteBbPerPlayer: payload.anteBbPerPlayer!,
    rakePct: payload.rakePct!,
    betSizingsLabel: payload.sizings!.map((s) => s.actionName).join(" / "),
    icmMode: payload.icmMode!,
    solverName: payload.provenance!.solverName,
    solverVersion: payload.provenance!.solverVersion,
    convergenceTargetPct: payload.provenance!.convergenceTargetPct,
    achievedExploitabilityPct: payload.provenance!.achievedExploitabilityPct,
    board: [...(payload.board ?? [])],
    potSizeBb: payload.potSizeBb!,
    heroPosition: payload.heroPosition!,
    villainPosition: payload.villainPosition ?? null,
    actionHistorySignature: historySig,
    rangesSignature: `${payload.ranges!.heroRangeDescription} vs ${payload.ranges!.villainRangeDescription}`,
    rangesSourceRef: payload.ranges!.sourceReference,
  };

  const assumptionsHash = computeAssumptionsHash(assumptions);

  const verifiedSpot: CanonicalSpot = {
    spotId: payload.spotId!,
    name: payload.spotName!,
    trackId: fallbackTrack,
    spotType: payload.spotType!,
    format: payload.format!,
    variant: payload.variant!,
    playersInitial: payload.playersCount!,
    street: street,
    board: [...(payload.board ?? [])],
    heroPosition: payload.heroPosition!,
    villainPosition: payload.villainPosition ?? null,
    heroCards: null,
    effectiveStackBb: payload.effectiveStackBb!,
    anteBbPerPlayer: payload.anteBbPerPlayer!,
    potBb: payload.potSizeBb!,
    legalActions,
    referenceStrategy: {
      status: "VERIFIED",
      evUnit: payload.evUnit!,
      actionFrequencies: null,
      actionEv: null,
      matrixFrequencies: payload.matrixFrequencies!,
      matrixEv: payload.matrixEv!,
      solutionSource: {
        providerType: "SolverAdapter",
        label: `${payload.provenance!.solverName} v${payload.provenance!.solverVersion} (${payload.provenance!.abstraction})`,
        fileOrReference: payload.provenance!.fileOrReference,
        importedAtIso: new Date().toISOString(),
        generatedAtIso: payload.provenance!.createdAtIso,
        licenseNote: payload.provenance!.license,
        fileSha256: payload.provenance!.fileSha256.toLowerCase(),
        configSha256: payload.provenance!.configSha256?.toLowerCase(),
        evAvailable: true,
      },
      assumptions,
      assumptionsHash,
      validationWarnings: warnings.length > 0 ? warnings : undefined,
    },
    lesson: {
      trackId: fallbackTrack,
      concepts: [
        payload.spotType!.toUpperCase(),
        payload.icmMode!,
        `${payload.effectiveStackBb}BB`,
        `EV: ${payload.evUnit!}`,
      ],
      interpretationSource: `${payload.provenance!.solverName} (${assumptionsHash})`,
      conceptualGuidance:
        payload.conceptualGuidance ??
        `Solução verificada importada via SolverAdapter v${SOLVER_ADAPTER_VERSION} com unidade ${payload.evUnit!} e hash de premissas ${assumptionsHash}.`,
    },
  };

  return {
    ok: true,
    status: "VERIFIED",
    spot: verifiedSpot,
    errors: [],
    warnings,
    assumptionsHash,
    adapterVersion: SOLVER_ADAPTER_VERSION,
  };
}

/**
 * Catálogo reclassificado após Auditoria de Integridade:
 * - Os 9 cenários anteriormente declarados como VERIFIED foram construídos manualmente em código
 *   (3–4 buckets de mãos com frequências e EVs sintéticos) sem execução real de solver externo.
 * - A classificação VERIFIED foi integralmente revogada dos 9 spots:
 *   - 3 cenários foram reclassificados como DIDACTIC_DEMO (exemplos sintéticos explicitamente identificados,
 *     sem matrixEv e sem geração de EV loss GTO).
 *   - 6 cenários foram reclassificados como UNSOLVED (sem matrizes inventadas de frequência ou EV).
 */
export function buildVerifiedSolverReferenceCatalog(): CanonicalSpot[] {
  const allHands = getAll169Hands();

  // 1. verified_mtt_8max_30bb_btn_rfi_v1 -> Reclassificado para DIDACTIC_DEMO (sem EV)
  const btn30Freq: Record<string, Record<string, number>> = {};
  const pureBtnOpen = new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
    "QJs", "QTs", "Q9s", "Q8s",
    "JTs", "J9s", "J8s",
    "T9s", "T8s", "98s", "97s", "87s", "76s", "65s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
    "KQo", "KJo", "KTo", "QJo", "QTo", "JTo",
  ]);
  const mixedBtnOpen = new Map<string, number>([
    ["44", 0.78], ["33", 0.6], ["22", 0.45],
    ["K6s", 0.72], ["K5s", 0.65], ["Q7s", 0.48], ["J7s", 0.42],
    ["T7s", 0.52], ["86s", 0.58], ["75s", 0.46], ["54s", 0.68],
    ["A7o", 0.62], ["A5o", 0.74], ["K9o", 0.66], ["Q9o", 0.42], ["T9o", 0.54],
  ]);

  for (const h of allHands) {
    if (pureBtnOpen.has(h)) {
      btn30Freq[h] = { Raise_2_1bb: 1, Fold: 0 };
    } else if (mixedBtnOpen.has(h)) {
      const r = mixedBtnOpen.get(h)!;
      const f = Number((1 - r).toFixed(3));
      btn30Freq[h] = { Raise_2_1bb: r, Fold: f };
    } else {
      btn30Freq[h] = { Raise_2_1bb: 0, Fold: 1 };
    }
  }

  // 2. verified_mtt_8max_15bb_btn_rfi_short_v1 -> Reclassificado para DIDACTIC_DEMO (sem EV)
  const btn15Freq: Record<string, Record<string, number>> = {};
  for (const h of allHands) {
    if (h === "AA" || h === "KK" || h === "QQ" || h === "AKs") {
      btn15Freq[h] = { Raise_2bb: 0.85, Allin_15bb: 0.15, Fold: 0 };
    } else if (
      ["JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22", "AQs", "AJs", "ATs", "A9s", "A8s", "A5s", "AKo", "AQo", "AJo", "ATo", "KQs", "KJs", "KTs", "QJs"].includes(h)
    ) {
      btn15Freq[h] = { Raise_2bb: 0.25, Allin_15bb: 0.75, Fold: 0 };
    } else if (["K9s", "QTs", "JTs", "T9s", "A7s", "A6s", "A4s", "A3s", "A2s", "KQo", "KJo"].includes(h)) {
      btn15Freq[h] = { Raise_2bb: 0.6, Allin_15bb: 0.2, Fold: 0.2 };
    } else {
      btn15Freq[h] = { Raise_2bb: 0, Allin_15bb: 0, Fold: 1 };
    }
  }

  // 4. verified_postflop_btn_vs_bb_ahkd7c_v1 -> Reclassificado para DIDACTIC_DEMO (sem EV)
  const flopAhKd7cFreq: Record<string, Record<string, number>> = {};
  for (const h of allHands) {
    const r1 = h[0];
    const r2 = h[1];
    const isTopValue = ["AA", "KK", "77", "AKs", "AKo", "A7s", "K7s", "AQs"].includes(h);
    const isMediumShowdown = ["QQ", "JJ", "TT", "99", "88", "KQs", "KJs", "KTs", "KQo"].includes(h);
    const isAx = r1 === "A" || r2 === "A";

    if (isTopValue) {
      flopAhKd7cFreq[h] = { Bet_33pct: 0.62, Bet_75pct: 0.38, Check: 0 };
    } else if (isAx) {
      flopAhKd7cFreq[h] = { Bet_33pct: 0.82, Bet_75pct: 0, Check: 0.18 };
    } else if (isMediumShowdown) {
      flopAhKd7cFreq[h] = { Bet_33pct: 0.32, Bet_75pct: 0, Check: 0.68 };
    } else {
      flopAhKd7cFreq[h] = { Bet_33pct: 0.55, Bet_75pct: 0, Check: 0.45 };
    }
  }

  const auditWarning =
    "Classificação VERIFIED revogada na Auditoria de Integridade: cenário construído manualmente em código sem dump de solver externo auditável.";

  const reclassifiedSpots: CanonicalSpot[] = [
    {
      spotId: "verified_mtt_8max_30bb_btn_rfi_v1",
      name: "[DEMO SINTÉTICA — SEM SOLVER] 30BB - BTN RFI (8-Max Ilustrativo)",
      trackId: "PREFLOP_RFI",
      spotType: "rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "PREFLOP",
      board: [],
      heroPosition: "BTN",
      villainPosition: null,
      heroCards: null,
      effectiveStackBb: 30,
      anteBbPerPlayer: 0.125,
      potBb: 2.5,
      legalActions: [
        { name: "Raise_2_1bb", color: "#f43f5e" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "DIDACTIC_DEMO",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: btn30Freq,
        matrixEv: null,
        solutionSource: {
          providerType: "DidacticDemo",
          label: "Exemplo Sintético Construído Manualmente (Sem Solver Real — Não gera EV Loss GTO)",
          fileOrReference: "solverAdapter.ts#verified_mtt_8max_30bb_btn_rfi_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
          licenseNote: "Exemplo sintético para demonstração pedagógica — NÃO É SOLUÇÃO GTO VERIFICADA",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "PREFLOP_RFI",
        concepts: ["DEMO SINTÉTICA", "RFI", "MISTURA PEDAGÓGICA"],
        interpretationSource: "DidacticDemo (Reclassificado na Auditoria)",
        conceptualGuidance:
          "AVISO DE AUDITORIA: Este spot é uma demonstração sintética construída manualmente para estudo pedagógico de estratégias mistas no BTN. Não provém de um solver real e não gera pontuação de EV loss GTO.",
      },
    },
    {
      spotId: "verified_mtt_8max_15bb_btn_rfi_short_v1",
      name: "[DEMO SINTÉTICA — SEM SOLVER] 15BB - BTN Short Stack (Min-Raise vs Jam vs Fold)",
      trackId: "PREFLOP_RFI",
      spotType: "rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "PREFLOP",
      board: [],
      heroPosition: "BTN",
      villainPosition: null,
      heroCards: null,
      effectiveStackBb: 15,
      anteBbPerPlayer: 0.125,
      potBb: 2.5,
      legalActions: [
        { name: "Allin_15bb", color: "#dc2626" },
        { name: "Raise_2bb", color: "#f43f5e" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "DIDACTIC_DEMO",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: btn15Freq,
        matrixEv: null,
        solutionSource: {
          providerType: "DidacticDemo",
          label: "Exemplo Sintético Construído Manualmente (Sem Solver Real — Não gera EV Loss GTO)",
          fileOrReference: "solverAdapter.ts#verified_mtt_8max_15bb_btn_rfi_short_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
          licenseNote: "Exemplo sintético para demonstração pedagógica — NÃO É SOLUÇÃO GTO VERIFICADA",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "PREFLOP_RFI",
        concepts: ["DEMO SINTÉTICA", "SHORT STACK", "OPEN-SHOVE VS MIN-RAISE"],
        interpretationSource: "DidacticDemo (Reclassificado na Auditoria)",
        conceptualGuidance:
          "AVISO DE AUDITORIA: Demonstração sintética de divisão entre Min-Raise e Open-Shove com 15BB inspirada na Aula 02. Não provém de um solver real e não gera EV loss GTO.",
      },
    },
    {
      spotId: "verified_mtt_8max_20bb_bb_vs_btn_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] 20BB - BB vs BTN Open 2bb",
      trackId: "PREFLOP_BB_DEFENSE",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "PREFLOP",
      board: [],
      heroPosition: "BB",
      villainPosition: "BTN",
      heroCards: null,
      effectiveStackBb: 20,
      anteBbPerPlayer: 0.125,
      potBb: 4.5,
      legalActions: [
        { name: "Allin_20bb", color: "#dc2626" },
        { name: "Call", color: "#22c55e" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_mtt_8max_20bb_bb_vs_btn_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [
          auditWarning,
          "Para defesa do BB 20BB com frequências reais importadas (sem EV), utilize o spot legado '20bb_bb_vs_btn_rfi' (IMPORTED_CHART_NO_EV).",
        ],
      },
      lesson: {
        trackId: "PREFLOP_BB_DEFENSE",
        concepts: ["UNSOLVED", "BB DEFENSE", "POT ODDS"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot mantido como UNSOLVED após revogação de dados sintéticos. Para estudar as frequências importadas da planilha pré-flop, selecione o spot '20BB - BB vs BTN RFI' (IMPORTED_CHART_NO_EV).",
      },
    },
    {
      spotId: "verified_postflop_btn_vs_bb_ahkd7c_v1",
      name: "[DEMO SINTÉTICA — SEM SOLVER] Flop Ah Kd 7c — BTN C-Bet IP vs BB",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "FLOP",
      board: ["Ah", "Kd", "7c"],
      heroPosition: "BTN",
      villainPosition: "BB",
      heroCards: null,
      effectiveStackBb: 27.9,
      anteBbPerPlayer: 0.125,
      potBb: 5.7,
      legalActions: [
        { name: "Bet_75pct", color: "#dc2626" },
        { name: "Bet_33pct", color: "#f43f5e" },
        { name: "Check", color: "#22c55e" },
      ],
      referenceStrategy: {
        status: "DIDACTIC_DEMO",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: flopAhKd7cFreq,
        matrixEv: null,
        solutionSource: {
          providerType: "DidacticDemo",
          label: "Exemplo Sintético Construído Manualmente (Sem Solver Real — Não gera EV Loss GTO)",
          fileOrReference: "solverAdapter.ts#verified_postflop_btn_vs_bb_ahkd7c_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
          licenseNote: "Exemplo sintético para demonstração pedagógica — NÃO É SOLUÇÃO GTO VERIFICADA",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "FLOP_CBET_IP_VS_BB",
        concepts: ["DEMO SINTÉTICA", "CBET IP", "RANGE ADVANTAGE"],
        interpretationSource: "DidacticDemo (Reclassificado na Auditoria)",
        conceptualGuidance:
          "AVISO DE AUDITORIA: Demonstração sintética de C-bet em board Ah Kd 7c para ilustrar conceitos da Aula 03. Não provém de um solver pós-flop real e não gera pontuação de EV loss GTO.",
      },
    },
    {
      spotId: "verified_postflop_bb_vs_btn_cbet_8s7s5d_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] Flop 8s 7s 5d — BB vs C-Bet 33% do BTN",
      trackId: "POSTFLOP_BB_VS_CBET",
      spotType: "bb_vs_cbet",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "FLOP",
      board: ["8s", "7s", "5d"],
      heroPosition: "BB",
      villainPosition: "BTN",
      heroCards: null,
      effectiveStackBb: 27.9,
      anteBbPerPlayer: 0.125,
      potBb: 7.6,
      legalActions: [
        { name: "Check_Raise", color: "#dc2626" },
        { name: "Check_Call", color: "#22c55e" },
        { name: "Check_Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_postflop_bb_vs_btn_cbet_8s7s5d_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "POSTFLOP_BB_VS_CBET",
        concepts: ["UNSOLVED", "MDF", "CHECK-RAISE", "NUT ADVANTAGE"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot pós-flop mantido como UNSOLVED por ausência de solução real de solver pós-flop. Utilize para estudo conceitual de MDF (75% vs 33% pot) e vantagem de nuts em boards baixos conectados (Aula 11).",
      },
    },
    {
      spotId: "verified_river_polarized_btn_vs_bb_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] River Ah Kd 7c 4s 2h — BTN River Polarizado vs BB",
      trackId: "TURN_RIVER_CBET_IP_VS_BB",
      spotType: "turn_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "RIVER",
      board: ["Ah", "Kd", "7c", "4s", "2h"],
      heroPosition: "BTN",
      villainPosition: "BB",
      heroCards: null,
      effectiveStackBb: 19.5,
      anteBbPerPlayer: 0.125,
      potBb: 22.5,
      legalActions: [
        { name: "Bet_75pct", color: "#dc2626" },
        { name: "Check", color: "#22c55e" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_river_polarized_btn_vs_bb_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "TURN_RIVER_CBET_IP_VS_BB",
        concepts: ["UNSOLVED", "RIVER POLARIZADO", "RAZÃO BLEFE/VALOR", "BLOCKERS"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot de river mantido como UNSOLVED por ausência de solução real de solver. A matemática exata do jogo de brinquedo polarizado (para bet de 75% do pote: α = 0.75/1.75 = 42.86% de folds; fração de blefes b/(v+b) = 0.75/2.50 = 30.0%) e a contagem exata de blockers permanecem disponíveis para estudo conceitual (Aula 05).",
      },
    },
    {
      spotId: "verified_icm_ft_6max_20bb_sb_vs_btn_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] Mesa Final 6-Max ICM — SB 20BB vs BTN Open",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 6,
      street: "PREFLOP",
      board: [],
      heroPosition: "SB",
      villainPosition: "BTN",
      heroCards: null,
      effectiveStackBb: 20,
      anteBbPerPlayer: 0.125,
      potBb: 4.35,
      legalActions: [
        { name: "Allin_20bb", color: "#dc2626" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver ICM Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_icm_ft_6max_20bb_sb_vs_btn_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "PREFLOP_VS_RFI",
        concepts: ["UNSOLVED", "VANILLA ICM", "BUBBLE FACTOR", "RISK PREMIUM"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot ICM mantido como UNSOLVED por ausência de árvore pré-flop resolvida por solver ICM externo (ex.: HRC/ICMIZER). Utilize o Laboratório Matemático & ICM (Malmuth-Harville) para calcular Bubble Factor e Risk Premium estáticos (Aula 16).",
      },
    },
    {
      spotId: "verified_icm_50pct_field_30bb_co_vs_mp_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] 50% Field Left ICM — CO 30BB vs MP Open",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "PREFLOP",
      board: [],
      heroPosition: "CO",
      villainPosition: "MP",
      heroCards: null,
      effectiveStackBb: 30,
      anteBbPerPlayer: 0.125,
      potBb: 4.6,
      legalActions: [
        { name: "ThreeBet_6bb", color: "#f43f5e" },
        { name: "Call", color: "#22c55e" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver ICM Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_icm_50pct_field_30bb_co_vs_mp_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "PREFLOP_VS_RFI",
        concepts: ["UNSOLVED", "ICM MID-STAGE", "INDIFERENÇA EM MIX"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot mantido como UNSOLVED por ausência de arquivo de solução real do HRC citado na Aula 18 (~02:40). Nenhum range ou EV foi inventado para substituir o solver original.",
      },
    },
    {
      spotId: "verified_pko_8max_25bb_btn_vs_sb_shove_v1",
      name: "[UNSOLVED — SEM SOLUÇÃO DE SOLVER] PKO 25BB BTN (Cobrindo) vs SB 14BB Shove",
      trackId: "PREFLOP_VS_RFI",
      spotType: "vs_rfi",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "PREFLOP",
      board: [],
      heroPosition: "BTN",
      villainPosition: "SB",
      heroCards: null,
      effectiveStackBb: 14,
      anteBbPerPlayer: 0.125,
      potBb: 18.0,
      legalActions: [
        { name: "Call_14bb", color: "#22c55e" },
        { name: "Fold", color: "#3b82f6" },
      ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Sem Solução de Solver PKO Verificada (Reclassificado na Auditoria)",
          fileOrReference: "solverAdapter.ts#verified_pko_8max_25bb_btn_vs_sb_shove_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: [auditWarning],
      },
      lesson: {
        trackId: "PREFLOP_VS_RFI",
        concepts: ["UNSOLVED", "PKO BOUNTY POWER", "COBERTURA DE STACK"],
        interpretationSource: "Reclassificado na Auditoria de Integridade",
        conceptualGuidance:
          "Spot PKO mantido como UNSOLVED por ausência de solução real de solver PKO com vetor de bounties completo. Estude a conversão de Bounty em Fichas e redução de equidade necessária no Laboratório Matemático (Aulas 15 e 17).",
      },
    },
  ];

  return reclassifiedSpots;
}

/**
 * Importa e valida rigorosamente um bundle gerado a partir do TexasSolver v0.2.0 CLI.
 * Valida: hashes SHA-256 (config, dump bruto e arquivo de ranges), convergência CFR,
 * consistência do cenário (blinds, antes, pote, stack, board e actionHistory),
 * remoção exata de cartas mortas em cada combo (comboBreakdown) e soma=1 das frequências.
 * Preserva matrixEv = null e evUnit = null (sem jamais fabricar EVs ausentes no dump CLI).
 */
export function importTexasSolverBundle(
  bundle: Partial<TexasSolverBundleV1>,
  options?: { freqTolerance?: number },
): SolverImportResult {
  const errors: string[] = [];
  const freqTolerance = options?.freqTolerance ?? 0.005;

  if (bundle.schemaVersion !== "1.1.0" || bundle.bundleType !== "TEXASSOLVER_NODE_FREQUENCIES_ONLY") {
    errors.push(
      `Bundle TexasSolver inválido: esperado schemaVersion '1.1.0' e bundleType 'TEXASSOLVER_NODE_FREQUENCIES_ONLY'.`,
    );
  }
  const m = bundle.manifest;
  if (!m || !m.solver || !m.scenario || !m.hashes || !m.convergence || !m.treeParameters) {
    errors.push("Manifesto completo do TexasSolver ('manifest') é obrigatório.");
  } else {
    if (m.solver.name !== "TexasSolver" || !m.solver.version?.trim()) {
      errors.push(`Solver inválido no manifesto: '${m.solver?.name}'.`);
    }
    if (!m.generatedAtIso || Number.isNaN(Date.parse(m.generatedAtIso))) {
      errors.push("Data de geração ISO inválida em manifest.generatedAtIso.");
    }
    if (
      !isValidSha256Hex(m.hashes.solverInputSha256) ||
      !isValidSha256Hex(m.hashes.rawOutputSha256) ||
      !isValidSha256Hex(m.hashes.rangesSourceSha256)
    ) {
      errors.push("Hashes SHA-256 obrigatórios ausentes ou inválidos (solverInput, rawOutput, rangesSource).");
    }
    if (
      typeof m.convergence.achievedExploitabilityPct !== "number" ||
      !Number.isFinite(m.convergence.achievedExploitabilityPct) ||
      m.convergence.achievedExploitabilityPct < 0
    ) {
      errors.push("Exploitability atingida ausente ou inválida em manifest.convergence.");
    }
    if (!Array.isArray(m.convergence.logRecords) || m.convergence.logRecords.length === 0) {
      errors.push("Log de convergência CFR vazio — impossível auditar iterações reais do solver.");
    }
    const deckCheck = validateDeckUnique(m.scenario.board ?? []);
    if (!deckCheck.valid || (m.scenario.board ?? []).length !== EXPECTED_BOARD_LENGTH[m.scenario.street]) {
      errors.push(`Board inválido em manifest.scenario.board: ${deckCheck.error ?? "comprimento incorreto"}.`);
    }
    if (!m.scenario.potSizeBb || m.scenario.potSizeBb <= 0 || !m.scenario.effectiveStackBb || m.scenario.effectiveStackBb <= 0) {
      errors.push("Pot ou stack efetivo inválido em manifest.scenario.");
    }
    if (!Array.isArray(m.scenario.actionHistory) || m.scenario.actionHistory.length === 0) {
      errors.push("Histórico de ações ausente em manifest.scenario.actionHistory.");
    }
    if (!m.scenario.rangesSource?.ipSpotId || !m.scenario.rangesSource?.oopSpotId) {
      errors.push("Identificadores de ranges de entrada (ipSpotId / oopSpotId) ausentes.");
    }
  }

  const actionSpecs = bundle.ipActionSpecs ?? [];
  if (actionSpecs.length < 2) {
    errors.push("Esperadas pelo menos 2 ações legais em ipActionSpecs.");
  }
  const legalActionNames = actionSpecs.map((a) => a.actionName);
  const legalActions: CanonicalAction[] = actionSpecs.map((a, idx) => ({
    name: a.actionName,
    color: a.color ?? DEFAULT_ACTION_COLORS[idx % DEFAULT_ACTION_COLORS.length],
  }));

  if (bundle.matrixEv !== null && bundle.matrixEv !== undefined) {
    errors.push("Bundle TexasSolver CLI não deve declarar matrixEv inventada quando evExportedByCli=false.");
  }

  const freqMap = bundle.matrixFrequencies ?? {};
  const comboMap = bundle.comboBreakdown ?? {};
  const classKeys = Object.keys(freqMap);
  if (classKeys.length === 0) {
    errors.push("matrixFrequencies vazia no bundle TexasSolver.");
  }

  if (m?.scenario?.board && legalActionNames.length >= 2 && classKeys.length > 0) {
    const boardSet = new Set(m.scenario.board);
    for (const hc of classKeys) {
      const dist = freqMap[hc];
      let sum = 0;
      for (const [act, p] of Object.entries(dist)) {
        if (!legalActionNames.includes(act)) {
          errors.push(`Ação '${act}' fora de ipActionSpecs em ${hc}.`);
        }
        if (!Number.isFinite(p) || p < -1e-6 || p > 1 + 1e-6) {
          errors.push(`Probabilidade inválida para ${hc} -> ${act}: ${p}.`);
        }
        sum += p;
      }
      if (Math.abs(sum - 1.0) > freqTolerance) {
        errors.push(`Classe ${hc}: soma das frequências (${sum.toFixed(4)}) diverge de 1.0.`);
      }

      const combosForClass = comboMap[hc];
      if (!combosForClass) {
        errors.push(`Detalhamento de combos ausente para classe ${hc}.`);
        continue;
      }
      const expectedCombos = getAvailableCombosForClass(hc, m.scenario.board);
      const comboKeys = Object.keys(combosForClass);
      if (comboKeys.length !== expectedCombos.length) {
        errors.push(
          `Classe ${hc}: esperado ${expectedCombos.length} combos livres no board [${m.scenario.board.join(", ")}], obtido ${comboKeys.length}.`,
        );
      }
      const meanCheck: Record<string, number> = Object.fromEntries(legalActionNames.map((a) => [a, 0]));
      for (const combo of comboKeys) {
        const c1 = combo.slice(0, 2);
        const c2 = combo.slice(2, 4);
        if (boardSet.has(c1) || boardSet.has(c2)) {
          errors.push(`Combo ilegal '${combo}' contém carta morta do board.`);
          continue;
        }
        if (combo4ToHandClass(combo) !== hc) {
          errors.push(`Combo '${combo}' não pertence à classe '${hc}'.`);
          continue;
        }
        const cDist = combosForClass[combo];
        let cSum = 0;
        for (const act of legalActionNames) {
          const val = cDist[act] ?? 0;
          cSum += val;
          meanCheck[act] += val / comboKeys.length;
        }
        if (Math.abs(cSum - 1.0) > freqTolerance) {
          errors.push(`Combo ${combo}: soma (${cSum.toFixed(4)}) diverge de 1.0.`);
        }
      }
      for (const act of legalActionNames) {
        if (Math.abs((dist[act] ?? 0) - meanCheck[act]) > 0.002) {
          errors.push(`Classe ${hc} (${act}): média dos combos diverge da matriz agregada.`);
          break;
        }
      }
    }
  }

  if (errors.length > 0 || !m) {
    const unsolvedSpot: CanonicalSpot = {
      spotId: m?.scenario?.spotId || "unsolved_texassolver_invalid",
      name: m?.scenario?.spotName || "[UNSOLVED] Bundle TexasSolver Inválido",
      trackId: "FLOP_CBET_IP_VS_BB",
      spotType: "flop_cbet_ip",
      format: m?.scenario?.format ?? "MTT",
      variant: "NLHE",
      playersInitial: m?.scenario?.playersInitial ?? 8,
      street: m?.scenario?.street ?? "FLOP",
      board: m?.scenario?.board ?? [],
      heroPosition: m?.scenario?.heroPosition ?? "BTN",
      villainPosition: m?.scenario?.villainPosition ?? "BB",
      heroCards: null,
      effectiveStackBb: m?.scenario?.effectiveStackBb ?? 27.9,
      anteBbPerPlayer: m?.scenario?.anteBbPerPlayer ?? 0.125,
      potBb: m?.scenario?.potSizeBb ?? 5.7,
      legalActions:
        legalActions.length >= 2
          ? legalActions
          : [
              { name: "Check", color: "#22c55e" },
              { name: "Bet_33pct", color: "#f43f5e" },
            ],
      referenceStrategy: {
        status: "UNSOLVED",
        evUnit: null,
        actionFrequencies: null,
        actionEv: null,
        matrixFrequencies: null,
        matrixEv: null,
        solutionSource: {
          providerType: "NoSolution",
          label: "UNSOLVED — Bundle TexasSolver rejeitado na validação",
          fileOrReference: m?.hashes?.rawOutputSha256 ?? "invalid_texassolver_bundle",
          importedAtIso: new Date().toISOString(),
        },
        assumptions: null,
        assumptionsHash: null,
        validationWarnings: errors,
      },
      lesson: {
        trackId: "FLOP_CBET_IP_VS_BB",
        concepts: ["UNSOLVED", "Integridade de Solver"],
        interpretationSource: "SolverAdapterV1.1",
        conceptualGuidance:
          "Este bundle TexasSolver foi rejeitado na validação de integridade/consistência e mantido estritamente como UNSOLVED.",
      },
    };
    return {
      ok: false,
      status: "UNSOLVED",
      spot: unsolvedSpot,
      errors,
      warnings: [],
      assumptionsHash: null,
      adapterVersion: SOLVER_ADAPTER_VERSION,
    };
  }

  const historySig = m.scenario.actionHistory
    .map((h) => `${h.street}:${h.position}:${h.action}${h.sizeBb !== undefined ? `@${h.sizeBb}` : ""}`)
    .join("|");
  const rangesSummary = `IP ${m.scenario.rangesSource.ipSpotId} (${m.scenario.rangesSource.ipAction}, ${m.scenario.rangesSource.ipClassesCount} mãos / ${m.scenario.rangesSource.ipCombosSolvedNode} combos) vs OOP ${m.scenario.rangesSource.oopSpotId} (${m.scenario.rangesSource.oopAction}, ${m.scenario.rangesSource.oopClassesCount} mãos)`;

  const assumptions: SolutionAssumptions = {
    format: m.scenario.format,
    variant: "NLHE",
    playersInitial: m.scenario.playersInitial,
    effectiveStackBb: m.scenario.effectiveStackBb,
    anteBbPerPlayer: m.scenario.anteBbPerPlayer,
    rakePct: m.scenario.rakePct,
    betSizingsLabel: legalActionNames.join(" / "),
    icmMode: "chipEV",
    solverName: m.solver.name,
    solverVersion: m.solver.version,
    convergenceTargetPct: m.convergence.targetExploitabilityPct,
    achievedExploitabilityPct: m.convergence.achievedExploitabilityPct ?? undefined,
    board: [...m.scenario.board],
    potSizeBb: m.scenario.potSizeBb,
    heroPosition: m.scenario.heroPosition,
    villainPosition: m.scenario.villainPosition,
    actionHistorySignature: historySig,
    rangesSignature: rangesSummary,
    rangesSourceRef: m.scenario.rangesSource.file,
  };

  const assumptionsHash = computeAssumptionsHash(assumptions);
  const warnings = [
    `TexasSolver v${m.solver.version} CLI exporta apenas frequências de equilíbrio (evExportedByCli=false): EV por ação e EV loss permanecem desabilitados neste spot sem estimar valores artificiais. Exploitability final: ${m.convergence.achievedExploitabilityPct?.toFixed(3)}%.`,
  ];

  const verifiedSpot: CanonicalSpot = {
    spotId: m.scenario.spotId,
    name: m.scenario.spotName,
    trackId: "FLOP_CBET_IP_VS_BB",
    spotType: "flop_cbet_ip",
    format: m.scenario.format,
    variant: "NLHE",
    playersInitial: m.scenario.playersInitial,
    street: m.scenario.street,
    board: [...m.scenario.board],
    heroPosition: m.scenario.heroPosition,
    villainPosition: m.scenario.villainPosition,
    heroCards: null,
    effectiveStackBb: m.scenario.effectiveStackBb,
    anteBbPerPlayer: m.scenario.anteBbPerPlayer,
    potBb: m.scenario.potSizeBb,
    legalActions,
    referenceStrategy: {
      status: "VERIFIED",
      evUnit: null,
      actionFrequencies: null,
      actionEv: null,
      matrixFrequencies: freqMap,
      matrixEv: null,
      comboBreakdown: comboMap,
      evUnavailableReason: warnings[0],
      solutionSource: {
        providerType: "SolverAdapter",
        label: `TexasSolver v${m.solver.version} (C-Bet IP pós-flop | ${m.scenario.rangesSource.ipCombosSolvedNode} combos)`,
        fileOrReference: `pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/texassolver_raw.json`,
        importedAtIso: new Date().toISOString(),
        generatedAtIso: m.generatedAtIso,
        licenseNote: `${m.solver.license} (execução local CLI, sem binários no repositório)`,
        fileSha256: m.hashes.rawOutputSha256.toLowerCase(),
        configSha256: m.hashes.solverInputSha256.toLowerCase(),
        rangesSha256: m.hashes.rangesSourceSha256.toLowerCase(),
        evAvailable: false,
      },
      assumptions,
      assumptionsHash,
      validationWarnings: warnings,
    },
    lesson: {
      trackId: "FLOP_CBET_IP_VS_BB",
      concepts: [
        "SOLVER REAL (TEXASSOLVER v0.2.0)",
        "C-BET IP VS BB SRP 30BB",
        "BOARD Ah Kd 7c (DRY HIGH-CARD)",
        "FREQUÊNCIAS COMBO-LEVEL VERIFICADAS",
      ],
      interpretationSource: `TexasSolver v${m.solver.version} (${assumptionsHash})`,
      conceptualGuidance: `Estratégia GTO de equilíbrio obtida via TexasSolver CLI v${m.solver.version} (AGPL-3.0) em 30BB chipEV SRP (pote ${m.scenario.potSizeBb}bb, stack efetivo ${m.scenario.effectiveStackBb}bb, ranges ${rangesSummary}). Exploitability atingida: ${m.convergence.achievedExploitabilityPct?.toFixed(3)}%. Observação de integridade: como a CLI do TexasSolver v0.2.0 exporta apenas frequências (sem EV por ação), o EV loss numérico fica desligado até importação de dump com EV (ex.: Desktop Postflop CSV).`,
    },
  };

  return {
    ok: true,
    status: "VERIFIED",
    spot: verifiedSpot,
    errors: [],
    warnings,
    assumptionsHash,
    adapterVersion: SOLVER_ADAPTER_VERSION,
  };
}
