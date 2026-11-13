import { getAll169Hands } from "./poker/cards.ts";
import { buildVerifiedSolverReferenceCatalog } from "./poker/solverAdapter.ts";
import {
  type CanonicalSpot,
  type CurriculumTrackId,
} from "./poker/strategySchema.ts";

export interface ExploitConditionalScenario {
  observation: string;
  sampleRequirement: string;
  hypothesis: string;
  candidateAdjustment: string;
  expectedEvShiftNote: string;
  counterExploitRisk: string;
}

export interface CurriculumModule {
  id: CurriculumTrackId;
  order: number;
  title: string;
  streetFocus: "PREFLOP" | "FLOP" | "TURN/RIVER";
  shortSummary: string;
  theoryShort: {
    heading: string;
    bullets: string[];
    keyMetrics: string[];
  };
  causalWhy: {
    heading: string;
    mechanisms: string[];
    commonMistake: string;
  };
  conditionalExploit: ExploitConditionalScenario;
  drillSpec: {
    linkedSpotId: string;
    hasVerifiedSolverSolution: boolean;
    demoNote: string;
  };
}

export const CURRICULUM_MODULES: CurriculumModule[] = [
  {
    id: "PREFLOP_RFI",
    order: 1,
    title: "1. RFI (Raise First In)",
    streetFocus: "PREFLOP",
    shortSummary:
      "Abertura em mesa rodada em fold considerando posição, stack efetivo, ante e risco de 3-bet.",
    theoryShort: {
      heading: "Estrutura de abertura por posição e stack",
      bullets: [
        "Posições iniciais (UTG/MP) enfrentam mais jogadores por agir e exigem mãos com boa jogabilidade ou alta força bruta.",
        "Posições finais (CO/BTN/SB) acumulam menos oponentes restantes, capturam blinds + antes com mais frequência e jogam em posição pós-flop (exceto SB).",
        "Em stacks curtos (14–20bb), a realização de equidade cai para suited connectors fracos e sobe o valor de bloqueadores (Ax/Kx offsuit) e pares.",
      ],
      keyMetrics: ["Fold Equity pré-flop", "Posição IP pós-flop", "Pressão de 3-bet atrás"],
    },
    causalWhy: {
      heading: "Por que o range muda tanto de UTG para BTN?",
      mechanisms: [
        "Com 7 jogadores atrás do UTG, a probabilidade combinada de alguém acordar com mão forte ou aplicar 3-bet é elevada.",
        "No BTN há apenas 2 jogadores (SB e BB) para passar, e mesmo quando o BB defende, o BTN terá posição em todas as streets pós-flop.",
        "Com ante de 0.125bb por jogador em 8-max (1bb extra morto no pote), o custo de risco-recompensa para roubar blinds melhora significativamente.",
      ],
      commonMistake:
        "Copiar tabela fixa de 100bb ao jogar com 17bb, abrindo suited gappers especulativos que serão forçados a foldar contra re-shove.",
    },
    conditionalExploit: {
      observation: "BB e SB foldam muito acima da linha base contra opens de late position.",
      sampleRequirement: "Mínimo recomendado: >= 40 oportunidades de steal observadas na mesa/pool.",
      hypothesis: "Os blinds não estão defendendo 3-bet nem defendendo o BB em frequência suficiente.",
      candidateAdjustment:
        "Expandir o range de RFI no CO/BTN/SB com mãos de bloqueador (Kx/Qx/Ax fracos) enquanto a mesa mantiver passividade.",
      expectedEvShiftNote: "Ganho direto de fichas sem showdown pelo excesso de folds pré-flop.",
      counterExploitRisk:
        "Se um regular no SB/BB perceber o aumento de RFI e começar a aplicar 3-bet/resteal agressivo, o open amplo perde EV rapidamente.",
    },
    drillSpec: {
      linkedSpotId: "didactic_rfi_btn_30bb_v1",
      hasVerifiedSolverSolution: false,
      demoNote:
        "Inclui drill didático funcional de demonstração (30bb BTN RFI) + acesso aos 229 charts locais importados.",
    },
  },
  {
    id: "FLOP_CBET_IP_VS_BB",
    order: 2,
    title: "2. C-Bet Flop IP vs BB",
    streetFocus: "FLOP",
    shortSummary:
      "Continuação em posição (Single-Raised Pot) modulando frequência e sizing conforme textura do board e vantagem de range.",
    theoryShort: {
      heading: "Vantagem de range, vantagem de nuts e textura",
      bullets: [
        "Em boards secos com carta alta (ex.: A-K-7 rainbow, K-7-2 rainbow), o agressor pré-flop concentra mais combos fortes (AA/KK/AK/AQ) — permitindo c-bet frequente e sizing menor.",
        "Em boards baixos e conectados (ex.: 7-6-5 two-tone), o BB atinge mais dois pares, trincas e combos de sequência/draw, reduzindo a vantagem do agressor e favorecendo check-back ou polarização.",
        "A escolha entre sizing pequeno (25%–33%) e grande (66%–75%+) depende de quanto o range de valor deseja construir pote versus proteger equidade.",
      ],
      keyMetrics: ["Range Advantage", "Nut Advantage", "SPR e textura do flop"],
    },
    causalWhy: {
      heading: "Por que não dar c-bet 100% em todo flop?",
      mechanisms: [
        "Quando o board favorece a região média do BB, apostar mãos médias/fracas sem seleção infla o pote fora de vantagem e sofre check-raises lucrativos.",
        "Checar mãos de showdown médio protege o range de check-back IP para não ser atacado no turn.",
      ],
      commonMistake:
        "Aplicar c-bet automática de 1/3 pote em boards 6-5-4 ou 9-8-6 supondo que o agressor sempre tem vantagem.",
    },
    conditionalExploit: {
      observation: "BB folda em excesso para c-bet de 33% em flops secos e raramente aplica check-raise por blefe.",
      sampleRequirement: ">= 30 flops IP vs BB em pool/oponente semelhante.",
      hypothesis: "O defensor joga 'fit-or-fold' no flop e desiste de backdoors/overcards que deveriam pagar.",
      candidateAdjustment:
        "Aumentar frequência de c-bet pequena (25%–33%) com air e backdoors sem showdown value.",
      expectedEvShiftNote: "Captura imediata de dead money quando o bluff breakeven (~25% para bet 33%) é superado.",
      counterExploitRisk:
        "Oponentes agressivos de check-raise exploram c-bets muito largas punindo air e mãos marginais.",
    },
    drillSpec: {
      linkedSpotId: "didactic_flop_cbet_btn_vs_bb_v1",
      hasVerifiedSolverSolution: false,
      demoNote:
        "Drill didático pós-flop com board explícito (Ah Kd 7c), card removal em tempo real e cálculo de EV loss didático.",
    },
  },
  {
    id: "TURN_RIVER_CBET_IP_VS_BB",
    order: 3,
    title: "3. C-Bet Turn & River IP vs BB",
    streetFocus: "TURN/RIVER",
    shortSummary:
      "Double e triple barrel guiados por runout, polarização, nut advantage e bloqueadores de call/fold.",
    theoryShort: {
      heading: "Transição de range condensado para polarizado",
      bullets: [
        "No turn e river, o SPR cai e as apostas ficam mais polarizadas: mãos muito fortes para valor + blefes selecionados com equidade ou bloqueadores relevantes.",
        "Cartas altas que completam draws ou mudam o topo do range alteram quem detém a vantagem de nuts.",
        "No river, bons blefes bloqueiam o topo do range de call do BB e não bloqueiam o range que o BB pretende foldar.",
      ],
      keyMetrics: ["Mudança de equidade por runout", "Blockers de call/fold", "Razão valor : blefe pelo sizing"],
    },
    causalWhy: {
      heading: "Por que o bloqueador importa tanto no river?",
      mechanisms: [
        "No river não há mais cartas por vir; o valor de um blefe depende exclusivamente da fold equity contra o range restante do vilão.",
        "Segurar uma carta que reduz os combos de top pair/two pair/flush do vilão aumenta a proporção relativa de mãos fracas que foldam.",
      ],
      commonMistake:
        "Continuar barreling no turn apenas por ter dado c-bet no flop, ignorando que o turn conectou fortemente o range de check-call do BB.",
    },
    conditionalExploit: {
      observation: "Vilão paga flop muito largo (float excessivo) mas overfolda no turn ou river contra overbets/2º barrel.",
      sampleRequirement: ">= 25 situações de turn/river observadas.",
      hypothesis: "O defensor está 'elástico' no flop por medo de ser blefado, mas joga honesto quando o pote cresce.",
      candidateAdjustment:
        "Selecionar mais double barrels polarizados em cartas que favorecem o agressor (overcards, cartas que completam brocas do IP).",
      expectedEvShiftNote: "Fold equity elevada no turn compensa a redução de folds no flop.",
      counterExploitRisk:
        "Se o vilão começar a dar check-call leve até o river ('station'), blefar demais destrói EV.",
    },
    drillSpec: {
      linkedSpotId: "unsolved_turn_barrel_btn_vs_bb_v1",
      hasVerifiedSolverSolution: false,
      demoNote:
        "Estado UNSOLVED por padrão: exige importação de solução verificada (ex.: export JSON de solver pós-flop) para habilitar pontuação GTO.",
    },
  },
  {
    id: "PREFLOP_VS_RFI",
    order: 4,
    title: "4. Versus RFI (Call / 3-Bet / Fold)",
    streetFocus: "PREFLOP",
    shortSummary:
      "Resposta a um Open Raise considerando posição relativa, stack efetivo, gap concept e risco de squeeze atrás.",
    theoryShort: {
      heading: "Construção de 3-bet linear vs polarizada",
      bullets: [
        "Em posições com vários jogadores atrás (ex.: HJ/CO vs UTG), flat call sofre risco de squeeze e favorece ranges de 3-bet/fold mais estreitos e lineares.",
        "No BTN contra CO/HJ, há menos risco de squeeze e posição garantida pós-flop, permitindo flat call com mãos que jogam bem em pote multiway ou heads-up.",
        "Contra stacks de 14–25bb, sizings de 3-bet não all-in ficam comprometidos e aumentam os re-shoves com bloqueadores.",
      ],
      keyMetrics: ["Gap Concept", "Risco de Squeeze", "Linearidade vs Polarização"],
    },
    causalWhy: {
      heading: "Por que não dar flat call com mãos offsuit dominadas contra UTG?",
      mechanisms: [
        "Contra um range estreito de UTG, KJo/ATo frequentemente enfrentam domínio de kicker (AK/AQ/KQ) e perdem grandes potes quando acertam top pair.",
        "Além disso, jogadores em posição posterior ou nos blinds podem aplicar squeeze e forçar o fold pré-flop sem realizar equidade.",
      ],
      commonMistake:
        "Dar call em excesso de posições intermediárias com AJo/KQo por parecerem 'cartas bonitas', ignorando dominação.",
    },
    conditionalExploit: {
      observation: "O abridor original abre muito largo e folda demais para 3-bet.",
      sampleRequirement: ">= 35 opens do vilão com resposta observada a 3-bet.",
      hypothesis: "RFI inflado sem ajuste defensivo contra 3-bet gera lucro imediato na 3-bet em posição.",
      candidateAdjustment:
        "Adicionar combos de 3-bet com bloqueadores Ax/Kx suited ou offsuit que não seriam lucrativos como flat call.",
      expectedEvShiftNote: "Aumento de EV pré-flop por fold equity antes do flop.",
      counterExploitRisk:
        "4-bets mais agressivos do abridor punem 3-bets light com mãos sem jogabilidade.",
    },
    drillSpec: {
      linkedSpotId: "30bb_btn_vs_co_rfi",
      hasVerifiedSolverSolution: false,
      demoNote: "Conectado aos spots vs RFI extraídos localmente (frequências sem tabela de EV).",
    },
  },
  {
    id: "PREFLOP_BB_DEFENSE",
    order: 5,
    title: "5. Defesa do Big Blind (BB)",
    streetFocus: "PREFLOP",
    shortSummary:
      "Cálculo de pot odds do BB, impacto do ante, closing the action e ajuste por posição do agressor.",
    theoryShort: {
      heading: "Desconto do BB e realização de equidade OOP",
      bullets: [
        "O BB já investiu 1bb e normalmente fecha a ação contra um open sem outros callers, pagando apenas (open - 1bb) para disputar (open + 1.5bb + antes).",
        "Embora as pot odds sejam atrativas, jogar fora de posição reduz a realização de equidade — mãos conectadas e suited realizam muito melhor que lixo offsuit desconectado.",
        "Contra UTG (range forte), a defesa do BB precisa ser muito mais seletiva do que contra BTN (range amplo).",
      ],
      keyMetrics: ["Pot Odds pré-flop", "Realização de Equidade OOP", "Origem do Open"],
    },
    causalWhy: {
      heading: "Por que a defesa do BB despenca quando há 3-bet ou open gigante?",
      mechanisms: [
        "Quando o sizing de open sobe (ex.: 2bb → 3bb) ou o ante some, as pot odds pioram drasticamente e o limiar de equidade necessária para pagar aumenta.",
        "Mãos offsuit fracas não compensam o desconto quando o agressor representa range forte ou cobra caro para ver o flop.",
      ],
      commonMistake:
        "Defender qualquer duas cartas com base na frase 'BB tem boas odds', ignorando realização OOP contra UTG.",
    },
    conditionalExploit: {
      observation: "O abridor no BTN/CO desiste com muita frequência pós-flop após c-bet única ou checa demais em turn.",
      sampleRequirement: ">= 30 mãos pós-flop contra o perfil.",
      hypothesis: "Realização de equidade do BB aumenta acima do teórico porque o IP não pressiona turns e rivers.",
      candidateAdjustment:
        "Defender mãos suited/conectadas na borda inferior do call e disputar potes pós-flop via probe/delayed stab.",
      expectedEvShiftNote: "Maior realização de equidade compensa estar fora de posição.",
      counterExploitRisk:
        "Contra oponentes que aplicam múltiplos barrels agressivos, mãos marginais no BB sangram fichas.",
    },
    drillSpec: {
      linkedSpotId: "30bb_bb_vs_btn_rfi",
      hasVerifiedSolverSolution: false,
      demoNote: "Conectado aos spots BB vs RFI do acervo local + calculadora de Pot Odds.",
    },
  },
  {
    id: "PREFLOP_SB_VS_BB",
    order: 6,
    title: "6. Blind War Pré-Flop (SB vs BB)",
    streetFocus: "PREFLOP",
    shortSummary:
      "Dinâmica assimétrica SB vs BB: limp, iso-raise, RFI de SB e shove/reshove por stack.",
    theoryShort: {
      heading: "Ranges amplos e estratégia mista limp/raise",
      bullets: [
        "Com todos os outros jogadores em fold, SB e BB disputam o pote com ranges muito mais largos que em qualquer outro confronto.",
        "Em stacks intermediários (14–30bb), uma estratégia equilibrada do SB frequentemente combina limp e open-raise para proteger o range de limp contra iso-raises do BB.",
        "Do lado do BB contra limp do SB, o BB fecha a ação com check gratuito ou constrói range de iso-raise polarizado/linear dependendo do stack.",
      ],
      keyMetrics: ["Proteção do range de limp", "Iso-raise vs Check", "Stacks de reshove"],
    },
    causalWhy: {
      heading: "Por que o SB precisa proteger seu range de limp com mãos fortes ou check-calls?",
      mechanisms: [
        "Se o SB só der limp com mãos fracas e der raise com todas as fortes, o BB pode aplicar iso-raise em altíssima frequência com lucro automático.",
        "Misturar armadilhas (limp-raise/limp-call forte) mantém o BB sob controle.",
      ],
      commonMistake:
        "No BB, aplicar iso-raise apenas com o topo absoluto ou dar iso-raise automático com lixo sem plano pós-flop.",
    },
    conditionalExploit: {
      observation: "SB dá limp com frequência alta e folda demais contra iso-raise de 3bb–3.5bb.",
      sampleRequirement: ">= 25 limps de SB observados.",
      hypothesis: "O range de limp do SB está desprotegido (fraco e sem limp-shove/limp-3bet).",
      candidateAdjustment:
        "Aumentar frequência de iso-raise no BB com mãos jogáveis e blockers fortes, reduzindo checks passivos.",
      expectedEvShiftNote: "Captura do pote pré-flop e iniciativa em posição contra range capado.",
      counterExploitRisk:
        "Um SB atento passa a fazer limp-3bet/limp-shove com topo do range se o BB abusar do iso-raise.",
    },
    drillSpec: {
      linkedSpotId: "30bb_bb_vs_sb_limp",
      hasVerifiedSolverSolution: false,
      demoNote: "Conectado aos spots SB vs BB (RFI e vs Limp) extraídos localmente.",
    },
  },
  {
    id: "POSTFLOP_BB_VS_CBET",
    order: 7,
    title: "7. Defesa do BB vs C-Bet",
    streetFocus: "FLOP",
    shortSummary:
      "Construção de check-call, check-raise e check-fold do Big Blind diante de diferentes sizings de continuação.",
    theoryShort: {
      heading: "Equilíbrio entre check-call, check-raise e fold",
      bullets: [
        "Contra c-bet pequena (25%–33%), o BB recebe ótimas pot odds e defende com alta frequência usando pares, draws, backdoor flush/straight draws e overcards.",
        "O range de check-raise no flop combina mãos muito fortes (dois pares+, sets, top pairs fortes em certos boards) com semi-blefes de boa equidade ou backdoors.",
        "MDF não deve ser aplicado cegamente: contra c-bet em boards onde o IP tem enorme vantagem de nuts, foldar acima de 1 - MDF pode ser ótimo.",
      ],
      keyMetrics: ["Pot Odds da defesa", "Backdoor equity", "Check-raise por valor e semi-blefe"],
    },
    causalWhy: {
      heading: "Por que check-raise com backdoor draws em vez de apenas draws prontos?",
      mechanisms: [
        "Backdoor flush + overcard retém equidade quando pago e permite continuar barreling em muitos turns que melhoram o draw.",
        "Além disso, equilibrar check-raises impede que o IP dê c-bet impunemente com 100% do range.",
      ],
      commonMistake:
        "Dar check-fold em todo erro de par contra c-bet de 25%–33%, ou dar check-raise apenas com trinca/dois pares (range super transparente).",
    },
    conditionalExploit: {
      observation: "Agressor aplica c-bet de 33% em quase 100% dos flops e desiste no turn quando não acerta.",
      sampleRequirement: ">= 30 spots BB vs c-bet contra o jogador/pool.",
      hypothesis: "O range de c-bet do IP está diluído com excesso de ar que não suporta pressão.",
      candidateAdjustment:
        "Ampliar check-raises semi-blefe em boards baixos/médios conectados e aplicar probe bets no turn após check-back/check-call.",
      expectedEvShiftNote: "Captura de potes inflados por c-bets fracas do oponente.",
      counterExploitRisk:
        "Contra agressores que reduzem c-bet e protegem o range, check-raise excessivo encontra mãos fortes.",
    },
    drillSpec: {
      linkedSpotId: "unsolved_bb_vs_cbet_flop_v1",
      hasVerifiedSolverSolution: false,
      demoNote:
        "Estado UNSOLVED por padrão: exige solução verificada importada para pontuar frequências GTO; ensina conceitos e matemática de pot odds.",
    },
  },
];

function buildDidacticRfiBtn30bbMatrix(): {
  frequencies: Record<string, Record<string, number>>;
} {
  const frequencies: Record<string, Record<string, number>> = {};

  const pureOpen = new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
    "QJs", "QTs", "Q9s", "Q8s",
    "JTs", "J9s", "J8s",
    "T9s", "T8s", "98s", "97s", "87s", "76s", "65s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
    "KQo", "KJo", "KTo",
    "QJo", "QTo",
    "JTo",
  ]);

  const mixedOpen = new Map<string, number>([
    ["44", 0.75],
    ["33", 0.55],
    ["22", 0.45],
    ["K6s", 0.7],
    ["K5s", 0.65],
    ["Q7s", 0.45],
    ["J7s", 0.4],
    ["T7s", 0.5],
    ["86s", 0.55],
    ["75s", 0.45],
    ["54s", 0.65],
    ["A7o", 0.6],
    ["A6o", 0.35],
    ["A5o", 0.7],
    ["A4o", 0.5],
    ["K9o", 0.65],
    ["Q9o", 0.4],
    ["J9o", 0.35],
    ["T9o", 0.5],
  ]);

  for (const hand of getAll169Hands()) {
    if (pureOpen.has(hand)) {
      frequencies[hand] = { Raise_2_1bb: 1, Fold: 0 };
    } else if (mixedOpen.has(hand)) {
      const rFreq = mixedOpen.get(hand)!;
      const fFreq = Math.round((1 - rFreq) * 1000) / 1000;
      frequencies[hand] = { Raise_2_1bb: rFreq, Fold: fFreq };
    } else {
      frequencies[hand] = { Raise_2_1bb: 0, Fold: 1 };
    }
  }

  return { frequencies };
}

function buildDidacticFlopCbetMatrix(): {
  frequencies: Record<string, Record<string, number>>;
} {
  const frequencies: Record<string, Record<string, number>> = {};

  // Board didático: Ah Kd 7c (flop seco high-card, alta vantagem do IP BTN vs BB)
  for (const hand of getAll169Hands()) {
    const r1 = hand[0];
    const r2 = hand[1];
    const isStrongValue =
      hand === "AA" || hand === "KK" || hand === "77" || hand === "AKs" || hand === "AKo" || hand === "A7s" || hand === "K7s";
    const isMediumShowdown =
      hand === "QQ" || hand === "JJ" || hand === "TT" || hand === "99" || hand === "88" || (r1 === "K" && r2 !== "A");
    const isAx = r1 === "A";

    if (isStrongValue) {
      frequencies[hand] = { Bet_33pct: 0.65, Bet_75pct: 0.35, Check: 0 };
    } else if (isAx) {
      frequencies[hand] = { Bet_33pct: 0.85, Bet_75pct: 0, Check: 0.15 };
    } else if (isMediumShowdown) {
      frequencies[hand] = { Bet_33pct: 0.35, Bet_75pct: 0, Check: 0.65 };
    } else if (hand.endsWith("s") && (r1 === "Q" || r1 === "J" || r1 === "T")) {
      // Broadways / backdoors misturam c-bet pequena e check
      frequencies[hand] = { Bet_33pct: 0.7, Bet_75pct: 0, Check: 0.3 };
    } else {
      frequencies[hand] = { Bet_33pct: 0.5, Bet_75pct: 0, Check: 0.5 };
    }
  }

  return { frequencies };
}

export function getDidacticAndUnsolvedSpots(): CanonicalSpot[] {
  const rfiData = buildDidacticRfiBtn30bbMatrix();
  const cbetData = buildDidacticFlopCbetMatrix();

  return [
    {
      spotId: "didactic_rfi_btn_30bb_v1",
      name: "[DEMO DIDÁTICA — SEM SOLVER] 30BB - BTN RFI (8-Max MTT)",
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
        matrixFrequencies: rfiData.frequencies,
        matrixEv: null,
        solutionSource: {
          providerType: "DidacticDemo",
          label: "Dados de teste claramente didáticos (não é saída oficial de solver — sem EV Loss GTO)",
          fileOrReference: "curriculum.ts#didactic_rfi_btn_30bb_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
      },
      lesson: {
        trackId: "PREFLOP_RFI",
        concepts: ["RFI", "Posição BTN", "Ante 0.125bb", "Estratégia Mista (Demo Sintética)"],
        interpretationSource: "https://reglife.com.br/prt/",
        conceptualGuidance:
          "Drill de demonstração sintética com frequências mistas pedagógicas. Por não provir de um solver real, não gera pontuação de EV loss GTO.",
      },
    },
    {
      spotId: "didactic_flop_cbet_btn_vs_bb_v1",
      name: "[DEMO DIDÁTICA — SEM SOLVER] Flop Ah Kd 7c — BTN C-Bet IP vs BB (30BB)",
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
      potBb: 5.5,
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
        matrixFrequencies: cbetData.frequencies,
        matrixEv: null,
        solutionSource: {
          providerType: "DidacticDemo",
          label: "Dados de teste claramente didáticos pós-flop (board Ah Kd 7c — sem EV Loss GTO)",
          fileOrReference: "curriculum.ts#didactic_flop_cbet_btn_vs_bb_v1",
          importedAtIso: "2026-11-12T00:00:00.000Z",
        },
        assumptions: null,
        assumptionsHash: null,
      },
      lesson: {
        trackId: "FLOP_CBET_IP_VS_BB",
        concepts: ["C-Bet IP", "Board Seco A-K-7", "Card Removal", "Demo Sintética"],
        interpretationSource: "https://reglife.com.br/prt/",
        conceptualGuidance:
          "Observe como as cartas do board (Ah, Kd, 7c) removem combos físicos da grade 13x13. Demonstração sintética sem geração de EV loss GTO.",
      },
    },
    {
      spotId: "unsolved_turn_barrel_btn_vs_bb_v1",
      name: "[UNSOLVED] Turn Ah Kd 7c 4s — 2º Barrel IP vs BB",
      trackId: "TURN_RIVER_CBET_IP_VS_BB",
      spotType: "turn_cbet_ip",
      format: "MTT",
      variant: "NLHE",
      playersInitial: 8,
      street: "TURN",
      board: ["Ah", "Kd", "7c", "4s"],
      heroPosition: "BTN",
      villainPosition: "BB",
      heroCards: null,
      effectiveStackBb: 26.1,
      anteBbPerPlayer: 0.125,
      potBb: 9.1,
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
        solutionSource: null,
        assumptions: null,
        assumptionsHash: null,
      },
      lesson: {
        trackId: "TURN_RIVER_CBET_IP_VS_BB",
        concepts: ["Double Barrel", "Polarização no Turn", "Nut Advantage", "Modo UNSOLVED"],
        interpretationSource: "https://reglife.com.br/prt/",
        conceptualGuidance:
          "Spot propositalmente UNSOLVED: sem arquivo de solver validado, o treinador bloqueia pontuação GTO e exibe apenas estudo conceitual para não fabricar frequências ou EV.",
      },
    },
    {
      spotId: "unsolved_bb_vs_cbet_flop_v1",
      name: "[UNSOLVED] Flop 8s 7s 5d — BB Defesa vs C-Bet BTN",
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
      potBb: 5.5,
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
        solutionSource: null,
        assumptions: null,
        assumptionsHash: null,
      },
      lesson: {
        trackId: "POSTFLOP_BB_VS_CBET",
        concepts: ["BB vs C-Bet", "Board Conectado", "Check-Raise Semi-Blefe", "Modo UNSOLVED"],
        interpretationSource: "https://reglife.com.br/prt/",
        conceptualGuidance:
          "Em boards baixos e conectados (8s 7s 5d), o BB retém vantagem de dois pares e sequências. Importe uma solução verificada de solver para habilitar pontuação GTO.",
      },
    },
    ...buildVerifiedSolverReferenceCatalog(),
  ];
}
