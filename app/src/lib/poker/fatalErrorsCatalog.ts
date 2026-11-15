import rawCatalog from "../../data/fatalErrorsCatalog.json" with { type: "json" };
import { REGLIFE_18_LESSONS } from "./reglifeCatalog.ts";
import type { CanonicalSpot } from "./strategySchema.ts";

export type FatalErrorId = `EF${"01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19" | "20"}`;
export type FatalStreet = "Pré-flop" | "Flop" | "Turn" | "River" | "Multiway" | "Disciplina";
export type Difficulty = "Básica" | "Intermediária" | "Avançada";
export type ErrorClassification = "CONTEXTUAL" | "QUANTIFIABLE_WITH_INPUTS" | "MATHEMATICAL_MODEL_MISUSE" | "PROCESS";
export type CalculatorKind = "pot_odds" | "bluff_fe" | "mdf";

export interface FatalErrorSource {
  id: FatalErrorId;
  category: FatalStreet;
  title: string;
  classification: ErrorClassification;
  riskSignal: string;
  correctiveStudy: string;
  sampleScenario: string;
  evidenceStatus: "EDUCATIONAL_HEURISTIC";
  gtoReferenceStatus: "UNSOLVED";
  verifiedSolverSpotId: null;
  evLossBb: null;
  automaticDiagnosisAllowed: false;
}

interface TeachingNotes {
  difficulty: Difficulty;
  explanation: string;
  exception: string;
  question: string;
  misconception: string;
  lessons: readonly number[];
  practiceSpotIds?: readonly string[];
  calculator?: CalculatorKind;
}

export interface FatalErrorCard extends FatalErrorSource, TeachingNotes {
  quiz: {
    id: string;
    question: string;
    options: readonly string[];
    correctIndex: number;
    explanation: string;
  };
}

// Complementos editoriais desta fase: perguntas, contrapontos, dificuldade e
// relações temáticas. Não são transcrições, soluções ou diagnósticos de mãos.
const notes: Record<FatalErrorId, TeachingNotes> = {
  EF01: {
    difficulty: "Básica", lessons: [1, 2], practiceSpotIds: ["30bb_rfi_btn"],
    explanation: "A mesma mão enfrenta ranges e quantidades de jogadores diferentes conforme a posição; uma tabela fora do contexto não justifica a abertura.",
    exception: "Uma abertura marginal pode integrar uma estratégia mista ou um ajuste explorativo condicionado; isso não autoriza abri-la em toda posição.",
    question: "Antes de transferir um range de BTN para UTG, qual revisão é necessária?",
    misconception: "Usar o mesmo range, pois as cartas da mão não mudaram.",
  },
  EF02: {
    difficulty: "Intermediária", lessons: [6, 13],
    explanation: "Broadways dominadas podem ganhar potes pequenos e perder potes grandes contra mãos superiores; posição e ranges que ainda podem agir alteram o valor do call.",
    exception: "Um call pode ser adequado com preço, ranges e condições favoráveis. O nome da mão sozinho não determina fold.",
    question: "Um broadway offsuit enfrenta open de UTG. O que fundamenta a análise do call?",
    misconception: "Duas cartas altas tornam o call obrigatório contra qualquer posição.",
  },
  EF03: {
    difficulty: "Intermediária", lessons: [6, 13],
    explanation: "O tamanho da 3-bet altera o preço oferecido e o stack restante. Repetir um multiplicador ignora diferenças entre cenários IP e OOP.",
    exception: "Um sizing único pode ser uma simplificação estudada para um contexto delimitado; não prova que sirva para todos os stacks.",
    question: "Ao mudar de IP para OOP e de 100 para 15 BB, como revisar o sizing de 3-bet?",
    misconception: "Manter sempre o mesmo multiplicador do open sem revisar o contexto.",
  },
  EF04: {
    difficulty: "Básica", lessons: [9], practiceSpotIds: ["20bb_bb_vs_btn_rfi"], calculator: "pot_odds",
    explanation: "O desconto do BB muda o preço do call, mas equidade bruta e equidade realizável não são iguais quando ainda há decisões futuras.",
    exception: "Uma mão com preço aparentemente bom pode foldar por baixa realização, rake ou ICM; pot odds não são uma ordem de call.",
    question: "Pot odds favoráveis bastam para justificar qualquer defesa do BB?",
    misconception: "Sim: o desconto garante que qualquer mão realize toda a equidade.",
  },
  EF05: {
    difficulty: "Avançada", lessons: [16, 18],
    explanation: "Em torneios, fichas e dinheiro não têm relação linear. Payouts e stacks dos outros jogadores podem mudar o custo de uma eliminação.",
    exception: "Algumas decisões podem coincidir nos modelos chipEV e ICM; a coincidência precisa de contexto e não valida copiar toda a tabela.",
    question: "Qual informação falta ao aplicar uma tabela chipEV diretamente numa mesa final?",
    misconception: "Nenhuma: dobrar fichas sempre dobra o valor financeiro.",
  },
  EF06: {
    difficulty: "Avançada", lessons: [15, 17],
    explanation: "O bounty imediato depende da cobertura. Seu valor precisa ser analisado junto do risco e da premiação regular.",
    exception: "A presença de bounty não torna todo call correto; sem cobertura ou com prêmio pequeno, o incentivo pode ser limitado.",
    question: "Que condições precisam ser consideradas antes de ampliar um call por bounty?",
    misconception: "A existência de qualquer bounty torna todo call lucrativo.",
  },
  EF07: {
    difficulty: "Intermediária", lessons: [2, 6],
    explanation: "Blockers alteram combinações possíveis, mas um shove também depende de quanto o adversário folda e da equidade quando há call.",
    exception: "Um shove pode ser adequado com pouca fold equity se a equidade quando pago compensar; a fórmula de blefe puro não resolve esse caso.",
    question: "Segurar um Ás prova que um shove de 15 BB é lucrativo?",
    misconception: "Sim: bloquear ases dispensa analisar o range de call.",
  },
  EF08: {
    difficulty: "Básica", lessons: [3, 14],
    practiceSpotIds: ["verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet"],
    explanation: "Ser o agressor pré-flop não garante vantagem em todas as texturas. A frequência de c-bet depende do nó, dos ranges e das ações disponíveis.",
    exception: "Apostar com frequência muito alta pode ser válido num nó específico. Isso não autoriza c-betar todos os boards nem punir um check presente no mix.",
    question: "Uma estratégia aposta muito num flop. Que conclusão pode ser transferida para outros flops?",
    misconception: "O agressor pré-flop deve apostar sempre, em qualquer textura.",
  },
  EF09: {
    difficulty: "Intermediária", lessons: [11, 14], calculator: "pot_odds",
    explanation: "Outs aparentes podem melhorar a mão e ainda perder para uma mão superior; apostas futuras mudam o preço efetivo de perseguir um draw.",
    exception: "Implied odds ou opções futuras podem justificar um call que a conta estática não captura; precisam ser fundamentadas.",
    question: "Um flush draw tem outs aparentes. O que falta para justificar o call?",
    misconception: "Basta contar outs, sem considerar o preço ou a força do range rival.",
  },
  EF10: {
    difficulty: "Básica", lessons: [3, 11, 14],
    explanation: "Uma overpair é forte em termos absolutos, mas sua força relativa depende de quais mãos chegam ao nó e continuam contra a ação.",
    exception: "Uma overpair pode ser uma aposta de valor clara contra determinado range; a textura conectada sozinha não exige fold.",
    question: "Como avaliar uma overpair num board conectado?",
    misconception: "Overpair equivale às nuts independentemente dos ranges.",
  },
  EF11: {
    difficulty: "Intermediária", lessons: [11],
    explanation: "O check-raise altera o range que continua e o tamanho do pote. Sem motivo claro, pode expulsar mãos piores e manter mãos melhores.",
    exception: "Blefes e negação de equidade podem justificar check-raise sem valor imediato; precisam de contexto, não apenas agressividade.",
    question: "Qual justificativa deve ser examinada ao preparar um check-raise?",
    misconception: "Aumentar sempre, porque agressividade por si só garante lucro.",
  },
  EF12: {
    difficulty: "Intermediária", lessons: [4, 5],
    explanation: "A carta do turn modifica ranges e possibilidades do river. Um segundo barrel sem reavaliação pode criar um pote sem plano para as próximas respostas.",
    exception: "Um plano pode incluir apostar turn e desistir em certos rivers; não exige blefar em todos os runouts.",
    question: "Que plano deve acompanhar o segundo barrel?",
    misconception: "Se apostou flop e turn, deve apostar qualquer river.",
  },
  EF13: {
    difficulty: "Avançada", lessons: [4, 5],
    explanation: "Um blocker pode remover valor ou remover folds desejáveis. Sua utilidade depende das combinações que o adversário mantém e abandona.",
    exception: "Blockers podem desempatar candidatos de blefe num contexto estudado; não são garantia isolada de rentabilidade.",
    question: "Qual cuidado é necessário ao usar blockers para escolher um blefe?",
    misconception: "Qualquer carta que bloqueie valor torna o blefe automaticamente correto.",
  },
  EF14: {
    difficulty: "Básica", lessons: [5], calculator: "bluff_fe",
    explanation: "No blefe puro final, o risco precisa ser compensado pelos folds. O limiar aritmético não informa a frequência real de fold do oponente.",
    exception: "Com equidade quando pago, o modelo de blefe puro deixa de representar o problema completo; não transferir o limiar sem ajustes.",
    question: "Pote 100, blefe puro 50 no river: qual fold equity empata o investimento?",
    misconception: "50%, pois a aposta é metade do pote.",
  },
  EF15: {
    difficulty: "Intermediária", lessons: [5],
    explanation: "Uma leitura de muitos calls precisa de amostra e segmentação. Poucas mãos podem refletir cartas fortes, não um padrão estável.",
    exception: "Mesmo um adversário que paga muito pode foldar uma parte específica do range; um rótulo de perfil não proíbe todo blefe.",
    question: "Dois calls observados bastam para concluir que alguém nunca folda river?",
    misconception: "Sim: duas mãos definem com certeza o perfil e todos os ranges.",
  },
  EF16: {
    difficulty: "Intermediária", lessons: [5],
    explanation: "Ganhar no showdown não implica receber call de mãos piores. A aposta muda a composição do range que chega ao showdown.",
    exception: "Thin value pode ser adequado se mãos piores pagarem em condições suficientes; mãos médias não são checks universais.",
    question: "Uma mão ganha de parte do range rival. O que ainda falta para justificar value bet?",
    misconception: "Nada: ter showdown value obriga a apostar por valor.",
  },
  EF17: {
    difficulty: "Avançada", lessons: [5, 11], calculator: "mdf",
    explanation: "MDF descreve defesa agregada num modelo restrito contra blefes puros; não identifica quais mãos devem pagar num range real.",
    exception: "Uma frequência agregada de defesa pode coincidir com o MDF sob as hipóteses do modelo; isso não torna cada bluff-catcher um call obrigatório.",
    question: "Como interpretar o MDF de um modelo HU de river?",
    misconception: "É uma obrigação de call para qualquer mão, board e adversário.",
  },
  EF18: {
    difficulty: "Avançada", lessons: [12],
    explanation: "Com mais oponentes, mudam os ranges conjuntos e a chance de alguém continuar. Uma solução HU não resolve uma árvore multiway.",
    exception: "Uma mesma ação pode ser apropriada em HU e multiway por razões diferentes; a coincidência não comprova equivalência de estratégias.",
    question: "Uma solução BTN vs BB pode ser usada como prova de GTO num pote com três jogadores?",
    misconception: "Sim: basta ignorar o terceiro jogador e manter as frequências.",
  },
  EF19: {
    difficulty: "Básica", lessons: [],
    explanation: "O resultado de uma mão contém variância. Ganhar não valida um blefe e perder não invalida uma decisão fundamentada.",
    exception: "Resultados em amostra ampla podem motivar investigação; ainda exigem análise do processo e das condições, não julgamento de uma mão isolada.",
    question: "Uma decisão perdeu após um bad beat. Como revisar sua qualidade?",
    misconception: "Marcar como erro porque perdeu, mesmo sem examinar a decisão.",
  },
  EF20: {
    difficulty: "Básica", lessons: [],
    explanation: "Aumentar risco para recuperar perdas pode afastar a sessão do plano. O exercício trata de rotina e limites pessoais, sem diagnóstico clínico.",
    exception: "Revisar limites deliberadamente fora da sessão difere de aumentá-los por impulso após perdas; nenhuma rotina promete lucro.",
    question: "Ao sentir impulso de elevar o ABI para recuperar perdas, qual revisão de processo cabe?",
    misconception: "Elevar imediatamente o risco até recuperar o dinheiro perdido.",
  },
};

function validateSource(value: unknown): asserts value is FatalErrorSource[] {
  if (!Array.isArray(value) || value.length !== 20) throw new Error("Catálogo deve conter 20 cartões.");
  const expectedIds = Object.keys(notes);
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || !expectedIds.includes(item.id) || ids.has(item.id) ||
      !["Pré-flop", "Flop", "Turn", "River", "Multiway", "Disciplina"].includes(item.category) ||
      !Object.hasOwn(rawCatalog.classificationLevels, item.classification) ||
      ![item.title, item.riskSignal, item.correctiveStudy, item.sampleScenario].every(v => typeof v === "string" && v.trim()) ||
      item.evidenceStatus !== "EDUCATIONAL_HEURISTIC" || item.gtoReferenceStatus !== "UNSOLVED" ||
      item.verifiedSolverSpotId !== null || item.evLossBb !== null || item.automaticDiagnosisAllowed !== false) {
      throw new Error("Catálogo educacional inválido ou com evidência não permitida.");
    }
    ids.add(item.id);
  }
}

validateSource(rawCatalog.items);
export const FATAL_ERRORS_NOTICE = rawCatalog.notice;
export const CLASSIFICATION_LABELS: Record<ErrorClassification, string> = rawCatalog.classificationLevels;
export const FATAL_ERRORS: readonly FatalErrorCard[] = rawCatalog.items.map((source) => {
  const teaching = notes[source.id];
  const correct = source.id === "EF14" ? "33,33%: risco 50 / (pote 100 + risco 50)." : source.correctiveStudy;
  const correctIndex = Number(source.id.slice(2)) % 3;
  const options = [teaching.misconception, "Decidir somente por quem venceu a última mão."];
  options.splice(correctIndex, 0, correct);
  return {
    ...source, ...teaching,
    quiz: {
      id: `${source.id}:concept:v1`, question: teaching.question, options, correctIndex,
      explanation: `${teaching.explanation} ${source.correctiveStudy} ${teaching.exception}`,
    },
  };
});

export function getFatalErrorLessons(card: FatalErrorCard) {
  return REGLIFE_18_LESSONS.filter(lesson => card.lessons.includes(lesson.spotNumber));
}

/** Vínculos explícitos de prática, nunca equivalência automática de GTO. */
export function getFatalErrorPracticeSpots(card: FatalErrorCard, spots: readonly CanonicalSpot[]): CanonicalSpot[] {
  return (card.practiceSpotIds ?? []).flatMap(id => {
    const spot = spots.find(s => s.spotId === id);
    if (!spot) return [];
    if (card.id === "EF08" && (spot.street !== "FLOP" || spot.heroPosition !== "BTN" ||
      spot.villainPosition !== "BB" || spot.effectiveStackBb !== 27.9 || spot.potBb !== 5.7 ||
      spot.board.join(" ") !== "Ah Kd 7c")) return [];
    if ((card.id === "EF01" || card.id === "EF04") && (spot.street !== "PREFLOP" ||
      spot.heroPosition !== (card.id === "EF01" ? "BTN" : "BB") ||
      spot.effectiveStackBb !== (card.id === "EF01" ? 30 : 20) ||
      (card.id === "EF04" && spot.villainPosition !== "BTN"))) return [];
    return [spot];
  });
}
