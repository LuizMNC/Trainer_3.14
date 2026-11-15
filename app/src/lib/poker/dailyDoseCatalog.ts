import {
  getAll169Hands,
  getAvailableCombosForClass,
  getHandCombos,
  parseCard,
  type PlayingCard,
} from "./cards.ts";
import {
  calculateBluffBreakevenFoldEquity,
  calculatePotOdds,
  calculateSimplifiedMdf,
} from "./mathEngine.ts";
import { calculateLabEv } from "./labEv.ts";

const ALL_169_HANDS = getAll169Hands();

export type DailyDoseFormatType =
  | "POT_ODDS_VS_MDF"
  | "PURE_VS_FREQ_ERROR"
  | "BLOCKERS_MATTER"
  | "GUESS_THE_LINE"
  | "WHICH_HAND_MORE_EV"
  | "RANGE_MORPHOLOGY"
  | "EQUITY_REALIZATION"
  | "SIZING_MOTIFS"
  | "STACK_DEPTH_SPR"
  | "ICM_RISK_PREMIUM";

export type InteractiveModeId =
  | "range-builder"
  | "pot-odds"
  | "blockers"
  | "sizings"
  | "streets"
  | "microlessons";

export interface DailyDoseMicrolesson {
  id: string;
  title: string;
  bookChapter: string;
  bookPages: string;
  originalTopic: string;
  formatType: DailyDoseFormatType;
  formatLabel: string;
  evidenceBadge:
    | "VERIFIED"
    | "EXACT_ENUMERATION"
    | "MODEL_BASED_EV"
    | "IMPORTED_CHART_NO_EV"
    | "EDUCATIONAL_HEURISTIC";
  /** Regra de ouro: no máximo 3 frases curtas antes da pergunta. */
  shortContext: string;
  tableVisual: {
    street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
    heroPos: string;
    villainPos: string;
    effectiveStackBb: number;
    potBb: number;
    board: string[];
    heroCards: [string, string];
    actionLine: string;
  };
  question: string;
  options: readonly [string, string, string];
  correctIndex: 0 | 1 | 2;
  conciseFeedback: string;
  whyExplanation: string;
  mathBreakdown: string;
  linkedSpotId: string;
  linkedInteractiveMode: InteractiveModeId;
  linkedFatalErrorId?: string;
}

export const DAILY_DOSE_MICROLESSONS: readonly DailyDoseMicrolesson[] = [
  {
    id: "DD01",
    title: "Pot Odds vs MDF: Quando Usar Cada Fórmula?",
    bookChapter: "Cap. 1 (Fundamentals) & Cap. 5 (Advanced)",
    bookPages: "p. 21, 62, 86, 512",
    originalTopic: "Visualizing MDF and Pot odds / Where do pot odds and MDF meet?",
    formatType: "POT_ODDS_VS_MDF",
    formatLabel: "Pot Odds vs MDF",
    evidenceBadge: "MODEL_BASED_EV",
    shortContext:
      "No river (pote 10 BB), o vilão aposta 5 BB (50% do pote) com um range polarizado. Você segura um bluff-catcher puro que só vence blefes.",
    tableVisual: {
      street: "RIVER",
      heroPos: "BB",
      villainPos: "BTN",
      effectiveStackBb: 25,
      potBb: 15,
      board: ["Ks", "9d", "4c", "2h", "7s"],
      heroCards: ["Qd", "9s"],
      actionLine: "Pote 10 BB · BTN aposta 5 BB · BB pagar 5 BB?",
    },
    question:
      "Qual é a equidade mínima necessária para pagar (Pot Odds) e a frequência mínima de defesa teórica (MDF)?",
    options: [
      "Pot Odds = 25,00% de equidade mínima; MDF = 66,67% do range.",
      "Pot Odds = 33,33% de equidade mínima; MDF = 50,00% do range.",
      "Pot Odds = 50,00% de equidade mínima; MDF = 75,00% do range.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Exato! Pagar 5 BB para disputar um pote final de 20 BB exige 25% de equidade, enquanto o MDF estático é 10 / (10 + 5) = 66,67%.",
    whyExplanation:
      "Pot Odds responde se a SUA mão específica tem equidade suficiente contra o range real do vilão. Já o MDF indica a fração teórica do seu range que precisaria continuar para impedir lucro automático com quaisquer duas cartas sem equidade.",
    mathBreakdown:
      "Eq_min = B / (P + 2B) = 5 / (10 + 10) = 25,00%. MDF = P / (P + B) = 10 / (10 + 5) = 66,67%. A razão de blefes equilibrada do agressor no river é 25% blefe : 75% valor (1:3).",
    linkedSpotId: "didactic_mtt_8max_30bb_bb_vs_btn_cbet_v1",
    linkedInteractiveMode: "pot-odds",
    linkedFatalErrorId: "EF05",
  },
  {
    id: "DD02",
    title: "Erros Puros vs Erros de Frequência em Estratégias Mistas",
    bookChapter: "Cap. 1 (Fundamentals) & Cap. 5 (Advanced)",
    bookPages: "p. 43, 72, 407, 1164",
    originalTopic: "Pure mistakes vs frequency mistakes / What is indifference actually?",
    formatType: "PURE_VS_FREQ_ERROR",
    formatLabel: "Erro Puro vs Frequência",
    evidenceBadge: "VERIFIED",
    shortContext:
      "No flop Ah Kd 7c (BTN vs BB, SRP 30 BB), a solução verificada do TexasSolver mistura Check e Bet 33% com diversas mãos. Uma ação com frequência positiva no equilíbrio tem o mesmo EV da ação principal.",
    tableVisual: {
      street: "FLOP",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 27.9,
      potBb: 5.7,
      board: ["Ah", "Kd", "7c"],
      heroCards: ["Qs", "Jc"],
      actionLine: "BTN Raise 2.1 BB · BB Call · Flop Ah Kd 7c · BB Check → BTN?",
    },
    question:
      "Qual a diferença matemática entre cometer um erro puro (ação 0%) e desviar na frequência de um mix?",
    options: [
      "Um erro puro perde EV na própria mão jogada; desviar num mix mantém EV imediato contra o equilíbrio, mas torna seu range explorável no longo prazo.",
      "Qualquer escolha abaixo da ação mais frequente perde exatamente a mesma quantidade de EV imediato.",
      "Estratégias mistas são apenas ruído do solver e qualquer ação sempre tem EV idêntico, mesmo as com 0%.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Em um ponto de indiferença, todas as ações com frequência positiva no mix têm o mesmo EV contra a estratégia de equilíbrio.",
    whyExplanation:
      "Escolher uma ação de 0% é um erro puro (perda imediata de EV). Já escolher sempre o mesmo lado de uma mão mista não perde EV naquela mão isolada contra o solver, mas desequilibra as frequências globais do seu range.",
    mathBreakdown:
      "Condição de equilíbrio de Nash em suporte misto: se P(a_1) > 0 e P(a_2) > 0, então EV(a_1) = EV(a_2) = EV*. Se P(a_3) = 0, geralmente EV(a_3) < EV*.",
    linkedSpotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
    linkedInteractiveMode: "streets",
    linkedFatalErrorId: "EF03",
  },
  {
    id: "DD03",
    title: "Quando Blockers Realmente Importam no Blefe?",
    bookChapter: "Cap. 1 (Fundamentals) & Cap. 3 (Spots)",
    bookPages: "p. 50, 57, 278–284",
    originalTopic: "When do blockers actually matter? / Blocking the missed flush draw",
    formatType: "BLOCKERS_MATTER",
    formatLabel: "Remoção de Cartas (Blockers)",
    evidenceBadge: "EXACT_ENUMERATION",
    shortContext:
      "Em um board final Ks Qs 8s 4d 2c (três espadas), você chega ao river sem valor de showdown e avalia um blefe grande contra o range de call do vilão. A remoção de cartas altera matematicamente os combos possíveis do oponente.",
    tableVisual: {
      street: "RIVER",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 40,
      potBb: 18,
      board: ["Ks", "Qs", "8s", "4d", "2c"],
      heroCards: ["As", "Td"],
      actionLine: "Board Ks Qs 8s 4d 2c · Vilão dá Check → Herói avalia blefe",
    },
    question:
      "Qual carta na mão do Herói remove mais combinações de nut flush (As Xs) do range de call do vilão?",
    options: [
      "Ter o Ás de espadas (As) bloqueia 100% dos nut flushes possíveis do vilão.",
      "Ter duas cartas de copas (Ah Th) bloqueia a mesma quantidade de flushes que As Td.",
      "Ter o Dois de paus (2s) remove mais combos de nut flush do que o Ás de espadas (As).",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Perfeito! Como Ks, Qs e 8s já estão na mesa, segurar As reduz de 9 para 0 os combos possíveis de nut flush (As Xs) do oponente.",
    whyExplanation:
      "Blockers têm impacto máximo em ranges estreitos (como river polarizado), especialmente quando uma única carta remove todas as combinações do topo do range de continuidade do vilão (nut flush blocker).",
    mathBreakdown:
      "Cartas de espadas restantes no baralho fora do board (Ks, Qs, 8s): 10 cartas. Sem As na mão do Herói, o vilão pode formar 9 combos de AsXs. Com As na mão do Herói: 0 combos de AsXs restantes (-100%).",
    linkedSpotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
    linkedInteractiveMode: "blockers",
    linkedFatalErrorId: "EF15",
  },
  {
    id: "DD04",
    title: "Adivinhe a Linha: Flop A-K-7 Rainbow em Posição (SRP 30 BB)",
    bookChapter: "Cap. 2 (Quizzes) & Cap. 8 (Tactics)",
    bookPages: "p. 76, 93, 777, 840",
    originalTopic: "Guess the move! / Should you rangebet these flops?",
    formatType: "GUESS_THE_LINE",
    formatLabel: "Adivinhe a Linha",
    evidenceBadge: "VERIFIED",
    shortContext:
      "BTN abre 2.1 BB com 30 BB efetivos e o BB paga. O flop vem Ah Kd 7c (duas cartas Broadway altas e secas) e o BB dá check.",
    tableVisual: {
      street: "FLOP",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 27.9,
      potBb: 5.7,
      board: ["Ah", "Kd", "7c"],
      heroCards: ["Ac", "Qd"],
      actionLine: "BTN vs BB SRP · Flop Ah Kd 7c · Pote 5.7 BB · BB Check → BTN",
    },
    question:
      "De acordo com a solução real do TexasSolver para este exato spot (Ah Kd 7c), como o BTN estrutura suas ações no flop?",
    options: [
      "Concentra a agressão majoritariamente no sizing pequeno (Bet 33% ~60,6%), mantendo ~35,5% de Check e apenas ~3,9% de Bet 75%.",
      "Usa exclusivamente overbet ou Bet 75% com 100% do range e nunca dá check.",
      "Dá check-back com 95% do range porque o BB tem mais ases e reis.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Na solução verificada do TexasSolver, o BTN usa Bet 33% em 60,6% do range, Check em 35,5% e Bet 75% em 3,9%.",
    whyExplanation:
      "Em flops A-K secos, o agressor em posição detém forte vantagem de range e de topo (AA, KK, AK, AQ), permitindo pressionar os pares médios e mãos desconectadas do BB com um sizing barato de 33% do pote.",
    mathBreakdown:
      "Agregado real TexasSolver v0.2.0 (563 combos): Bet_33pct = 60,6%, Check = 35,5%, Bet_75pct = 3,9% (Exploitability final = 0,468% do pote).",
    linkedSpotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
    linkedInteractiveMode: "streets",
    linkedFatalErrorId: "EF08",
  },
  {
    id: "DD05",
    title: "Qual Trinca Prefere Apostar Maior? (Sets e Remoção de Continuamento)",
    bookChapter: "Cap. 2 (Quizzes) & Cap. 3 (Spots)",
    bookPages: "p. 79, 287",
    originalTopic: "Which set has the most EV? / C-betting Sets vs Overpairs",
    formatType: "WHICH_HAND_MORE_EV",
    formatLabel: "Comparação de Mãos",
    evidenceBadge: "VERIFIED",
    shortContext:
      "Ainda no flop Ah Kd 7c (BTN vs BB, SRP 30 BB), compare a trinca de Ases (AA) com a trinca de Setes (77) no range do BTN. Uma delas bloqueia o topo do range de call do BB; a outra deixa todos os Ases e Reis disponíveis.",
    tableVisual: {
      street: "FLOP",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 27.9,
      potBb: 5.7,
      board: ["Ah", "Kd", "7c"],
      heroCards: ["7s", "7h"],
      actionLine: "Flop Ah Kd 7c · Comparar AA (3 combos) vs 77 (3 combos)",
    },
    question:
      "Qual das duas trincas utiliza frequência significativamente maior de Bet 75% na solução verificada do TexasSolver?",
    options: [
      "77 usa muito mais Bet 75% (~23,3%) do que AA (~0,6%), pois 77 não bloqueia os top pairs (Ax/Kx) que pagam apostas altas.",
      "AA aposta 75% em 100% das vezes porque é a mão mais forte possível.",
      "Ambas dão 100% de Check porque nunca devemos apostar trincas no flop.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Exato! No TexasSolver, 77 usa Bet 75% em 23,3% das vezes (e Bet 33% em 73,5%), enquanto AA usa Bet 33% em 96,1% e quase nunca Bet 75% (0,6%).",
    whyExplanation:
      "Quando você tem AA no board Ah Kd 7c, resta apenas um Ás no baralho, reduzindo drasticamente a chance de o BB ter Ax para pagar um sizing grande. Com 77, o BB tem todos os combos de Ax e Kx disponíveis para pagar caro.",
    mathBreakdown:
      "TexasSolver (Ah Kd 7c): AA → Bet_33pct 96,1%, Check 3,3%, Bet_75pct 0,6%. 77 → Bet_33pct 73,5%, Bet_75pct 23,3%, Check 3,2%.",
    linkedSpotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
    linkedInteractiveMode: "blockers",
  },
  {
    id: "DD06",
    title: "Morfologia de Ranges: 3-Bet Linear vs Polarizado",
    bookChapter: "Cap. 1 (Fundamentals) & Cap. 2 (Quizzes)",
    bookPages: "p. 53, 110, 132, 545",
    originalTopic: "Range Morphology / Linear vs Polarized 3-betting",
    formatType: "RANGE_MORPHOLOGY",
    formatLabel: "Morfologia de Ranges",
    evidenceBadge: "IMPORTED_CHART_NO_EV",
    shortContext:
      "Contra um open-raise de CO com 30 BB, o BTN pode defender pagando (flat call) ou aplicando 3-bet. A existência ou não de um range de call altera completamente o formato do range de 3-bet.",
    tableVisual: {
      street: "PREFLOP",
      heroPos: "BTN",
      villainPos: "CO",
      effectiveStackBb: 30,
      potBb: 4.5,
      board: [],
      heroCards: ["As", "5s"],
      actionLine: "MTT 30 BB · CO abre Raise · BTN decide entre Fold, Call e 3-Bet",
    },
    question:
      "Quando o jogador mantém um range de flat call em posição, qual morfologia seu range de 3-bet não-all-in tende a assumir?",
    options: [
      "Polarizado: combina o topo do range (valor forte) com blefes com bloqueadores e jogabilidade (ex.: A5s/K9s), deixando mãos médias no call.",
      "Condensado: 3-beta apenas pares médios (66–88) e dá call com AA e KK.",
      "Uniforme: 3-beta exatamente 50% de todas as 169 mãos da matriz sem distinção.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Quando existe range de call para mãos médias com boa realização pós-flop, a 3-bet se polariza entre topo de valor e blefes com blockers.",
    whyExplanation:
      "Mãos de força média-alta (como AQo, KQs, JTs, pares médios) retêm muito EV dando call em posição. Por isso, os blefes de 3-bet saem da borda do call/fold (como A5s–A2s ou Kxs/Qxs suited), criando uma estrutura polarizada.",
    mathBreakdown:
      "Morfologia Polarizada = Polo de Valor (topo de equidade) + Polo de Blefe (blockers + realização), separados por uma faixa central de Call (mãos condensadas).",
    linkedSpotId: "30bb_btn_vs_co_rfi",
    linkedInteractiveMode: "range-builder",
    linkedFatalErrorId: "EF02",
  },
  {
    id: "DD07",
    title: "Equidade Bruta vs Realização de Equidade (EQR)",
    bookChapter: "Cap. 1, Cap. 2 & Cap. 6 (Equity)",
    bookPages: "p. 70, 83, 114, 626–645",
    originalTopic: "Equity Realization / Over-realizing equity / What is EQR?",
    formatType: "EQUITY_REALIZATION",
    formatLabel: "Realização de Equidade (EQR)",
    evidenceBadge: "EDUCATIONAL_HEURISTIC",
    shortContext:
      "Duas mãos podem ter ~38% de equidade bruta pré-flop contra o range de abertura do BTN, mas capturar fatias muito diferentes do pote ao longo de flop, turn e river.",
    tableVisual: {
      street: "PREFLOP",
      heroPos: "BB",
      villainPos: "BTN",
      effectiveStackBb: 30,
      potBb: 4.5,
      board: [],
      heroCards: ["7s", "6s"],
      actionLine: "MTT 30 BB · BTN abre 2.1 BB · BB avalia defesa (Pot Odds ~26%)",
    },
    question:
      "Por que 76s realiza mais equidade (maior EQR) do que K2o na defesa do Big Blind contra o Botão?",
    options: [
      "Porque 76s tem conectividade e naipe único (faz flushes, straights e backdoors que continuam em múltiplas streets), enquanto K2o sofre dominação reversa e desiste em muitos flops.",
      "Porque 76s sempre vence K2o no pré-flop com 90% de equidade.",
      "Porque mãos offsuit desconectadas têm fator de realização R > 1,5 fora de posição.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Exato! Conectividade e suitedness geram draws e backdoors que permitem continuar sob pressão e capturar mais do que a equidade bruta.",
    whyExplanation:
      "A Realização de Equidade (EQR = Fração do pote conquistada / Equidade bruta) depende de posição, SPR, conectividade e ausência de dominação. Mãos dominadas fora de posição frequentemente abandonam sua equidade antes do showdown.",
    mathBreakdown:
      "EV_call ≈ R × Eq_bruta × Pote_final - Call. Se Pot Odds exige 26% de participação efetiva e Eq_bruta = 36%, uma mão com R = 0,85 entrega 30,6% (> 26%), enquanto R = 0,65 entrega apenas 23,4% (< 26%).",
    linkedSpotId: "30bb_bb_vs_btn_rfi",
    linkedInteractiveMode: "range-builder",
    linkedFatalErrorId: "EF04",
  },
  {
    id: "DD08",
    title: "Sizing de Apostas: Quando a Vantagem de Nuts Pede Aposta Grande?",
    bookChapter: "Cap. 5 (Advanced) & Cap. 8 (Tactics)",
    bookPages: "p. 48, 440, 891, 1255",
    originalTopic: "Nut advantage / Overbet sizing motifs / Overbetting vs condensed ranges",
    formatType: "SIZING_MOTIFS",
    formatLabel: "Comparação de Sizings",
    evidenceBadge: "MODEL_BASED_EV",
    shortContext:
      "Quando o range do defensor está condensado em pares médios/fracos (capado) e o agressor concentra todas as mãos nut (vantagem de nuts), o tamanho ótimo da aposta cresce.",
    tableVisual: {
      street: "TURN",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 45,
      potBb: 12,
      board: ["Ah", "Kd", "7c", "2s"],
      heroCards: ["As", "Kh"],
      actionLine: "Turn 2s (Brick) após C-bet no Flop · Pote 12 BB · BB Check → BTN",
    },
    question:
      "Qual o efeito matemático de aumentar o sizing de 33% para 75%–125% do pote com um range polarizado no turn/river?",
    options: [
      "Aumenta o fold equity exigido para o blefe empatar, piora o preço de call dos bluff-catchers do vilão e permite extrair mais EV com o topo do range.",
      "Reduz o valor extraído pelas mãos fortes e melhora as pot odds do oponente.",
      "Exige que o agressor tenha 0% de blefes na estratégia.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Sizings grandes cobram caro de ranges capados e permitem incluir uma proporção maior de blefes por combinação de valor no river.",
    whyExplanation:
      "Enquanto a vantagem de range global favorece apostas frequentes e pequenas (como no flop), a vantagem de nuts e a polarização no turn/river favorecem sizings grandes (75% a overbet) contra um oponente cujo topo de range está limitado.",
    mathBreakdown:
      "Para B = 33% Pote: FE_min = 25% e razão Blefe/Valor river = 20% blefe. Para B = 100% Pote: FE_min = 50% e razão Blefe/Valor river = 33,3% blefe.",
    linkedSpotId: "didactic_mtt_8max_30bb_btn_turn_barrel_v1",
    linkedInteractiveMode: "sizings",
    linkedFatalErrorId: "EF11",
  },
  {
    id: "DD09",
    title: "Efeito da Profundidade de Stack: 15 BB vs 50 BB no Botão",
    bookChapter: "Cap. 4 (Streets), Cap. 7 (Stack Depth) & Cap. 10 (Formats)",
    bookPages: "p. 168, 299, 655, 1091, 1251",
    originalTopic: "Adjusting RFI to short stacked / Min open or shove? / How stack depth impacts strategy",
    formatType: "STACK_DEPTH_SPR",
    formatLabel: "Profundidade de Stack (SPR)",
    evidenceBadge: "IMPORTED_CHART_NO_EV",
    shortContext:
      "Com 50 BB no BTN, você abre quase todas as mãos via min-raise. Com 14–15 BB, uma 3-bet dos blinds coloca todo o seu stack em risco.",
    tableVisual: {
      street: "PREFLOP",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 15,
      potBb: 2.5,
      board: [],
      heroCards: ["A5", "s"],
      actionLine: "MTT 8-Max · Stack Efetivo 15 BB · Rodada em Fold até o BTN",
    },
    question:
      "Como a redução do stack para 14–15 BB altera a construção do range de abertura (RFI) do Botão?",
    options: [
      "Divide o range entre min-raise (topo + blefes de raise/fold com blockers) e open-shove direto com mãos vulneráveis de alta equidade bruta (ex.: pares baixos/médios e alguns Ax/Kx).",
      "Amplia o range de min-raise para 100% das mãos porque o risco pós-flop desaparece.",
      "Elimina completamente o min-raise e obriga a dar limp com AA e KK.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Perfeito! Em stacks curtos (14–17 BB), pares baixos e mãos com boa equidade bruta mas difícil decisão contra 3-bet frequentemente preferem o open-shove para negar a realização de equidade dos blinds.",
    whyExplanation:
      "Dar raise/fold com 22–55 ou A7o desperdiça muita equidade quando o BB aplica 3-bet shove. O open-shove direto garante 100% da realização da sua equidade, enquanto o min-raise fica reservado para o topo (que paga o shove) e mãos com blockers (que dão raise/fold barato).",
    mathBreakdown:
      "Com 15 BB, um min-raise de 2 BB compromete 13,3% do stack. Se o vilão aplica 3-bet all-in, você precisa de ~42% de equidade para pagar os 13 BB restantes.",
    linkedSpotId: "15bb_rfi_btn",
    linkedInteractiveMode: "range-builder",
    linkedFatalErrorId: "EF01",
  },
  {
    id: "DD10",
    title: "ICM e Risk Premium: Quando +chipEV É -$EV na Reta Final",
    bookChapter: "Cap. 5 (Advanced), Cap. 9 & Cap. 10 (Formats)",
    bookPages: "p. 444, 481, 989, 1116, 1217",
    originalTopic: "Understanding ICM / Risk Premium / Final 3 ICM scenarios",
    formatType: "ICM_RISK_PREMIUM",
    formatLabel: "ICM & Risk Premium",
    evidenceBadge: "MODEL_BASED_EV",
    shortContext:
      "Em uma mesa final ou bolha de premiação com stacks curtos na mesa, perder todas as suas fichas custa muito mais em dólares ($EV) do que dobrar o stack ganha.",
    tableVisual: {
      street: "PREFLOP",
      heroPos: "BTN",
      villainPos: "CO",
      effectiveStackBb: 20,
      potBb: 4.5,
      board: [],
      heroCards: ["Ad", "Qc"],
      actionLine: "Mesa Final ICM · Stacks: 45 / 20 (CO) / 20 (BTN) / 6 BB · CO Shove 20 BB",
    },
    question:
      "Se o seu Bubble Factor contra o CO é 1,50x, qual é a equidade mínima necessária para pagar um all-in de 50/50 em fichas?",
    options: [
      "60,00% de equidade (Risk Premium de +10,00% acima dos 50% do chipEV).",
      "50,00% de equidade, pois ICM não altera decisões de call.",
      "40,00% de equidade, pois o stack curto de 6 BB reduz a exigência de call.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Com Bubble Factor = 1,50, a equidade mínima em $EV sobe para 1,50 / (1,50 + 1) = 60,00%.",
    whyExplanation:
      "Com um microstack de 6 BB prestes a ser eliminado, confrontar outro stack médio de 20 BB transfere $EV gratuitamente para o short stack toda vez que você é eliminado. Por isso seu range de call encolhe drasticamente.",
    mathBreakdown:
      "BF = Δ$EV_perda / Δ$EV_ganho = 1,50. Eq_min($EV) = BF / (BF + 1) = 1,50 / 2,50 = 60,00%. Risk Premium vs flip = 60% - 50% = +10,00%.",
    linkedSpotId: "didactic_mtt_8max_20bb_btn_vs_co_icm_v1",
    linkedInteractiveMode: "pot-odds",
    linkedFatalErrorId: "EF17",
  },
  {
    id: "DD11",
    title: "Por Que Dar Check-Back com Bons Draws em Posição?",
    bookChapter: "Cap. 3 (Spots), Cap. 7 & Cap. 11 (All Stars)",
    bookPages: "p. 209, 667, 1242",
    originalTopic: "Checking back the flop HU / Checking back turns with flush draws / Why check back good draws?",
    formatType: "GUESS_THE_LINE",
    formatLabel: "Proteção do Range de Check",
    evidenceBadge: "EDUCATIONAL_HEURISTIC",
    shortContext:
      "Se você apostar 100% dos seus flush draws e straight draws no flop e no turn, seu range de check-back ficará sem mãos fortes quando a carta do draw bater.",
    tableVisual: {
      street: "FLOP",
      heroPos: "BTN",
      villainPos: "BB",
      effectiveStackBb: 30,
      potBb: 5.5,
      board: ["Jh", "8h", "4c"],
      heroCards: ["Ah", "5h"],
      actionLine: "BTN vs BB SRP · Flop Jh 8h 4c · BB Check → BTN com Nut Flush Draw",
    },
    question:
      "Qual a vantagem estratégica de incluir parte dos draws (especialmente com Ás alto ou showdown value) na linha de check-back?",
    options: [
      "Protege o range de check para ter flushes no turn/river, evita ser forçado a largar a equidade contra um check-raise all-in e realiza 100% da carta gratuita.",
      "Garante que o oponente dê fold imediato no flop sem você precisar apostar.",
      "Draws nunca devem apostar em nenhuma situação porque têm 0% de equidade.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Exato! Misturar draws no check-back garante cobertura de board nas streets seguintes e protege sua equidade contra check-raises agressivos.",
    whyExplanation:
      "Cobertura de board (board coverage) exige que sua linha de check também contenha flushes quando a 3ª carta do naipe vier no turn, impedindo que o vilão possa aplicar overbet impunemente toda vez que o flush completar.",
    mathBreakdown:
      "Um flush draw no flop tem 9 outs (~19,1% do flop para o turn; ~35% até o river). Ao dar check-back em posição, você realiza gratuitamente a carta do turn sem risco de enfrentar check-raise.",
    linkedSpotId: "didactic_mtt_8max_30bb_btn_turn_barrel_v1",
    linkedInteractiveMode: "streets",
    linkedFatalErrorId: "EF10",
  },
  {
    id: "DD12",
    title: "Defesa do Big Blind vs C-Bet Pequena: Cuidado com o Overfold",
    bookChapter: "Cap. 8 (Tactics), Cap. 9 & Cap. 10 (Formats)",
    bookPages: "p. 830, 1012, 1020",
    originalTopic: "Overdefend pre - Overfold post / Defending vs c-bets with short stacks",
    formatType: "POT_ODDS_VS_MDF",
    formatLabel: "Defesa vs C-Bet",
    evidenceBadge: "EDUCATIONAL_HEURISTIC",
    shortContext:
      "Muitos jogadores pagam amplamente no Big Blind pré-flop, mas no flop largam qualquer mão que não acertou top pair ou flush draw direto diante de uma C-bet pequena de 33% do pote.",
    tableVisual: {
      street: "FLOP",
      heroPos: "BB",
      villainPos: "BTN",
      effectiveStackBb: 27.9,
      potBb: 7.6,
      board: ["Ks", "8d", "3c"],
      heroCards: ["Qd", "8s"],
      actionLine: "Flop Ks 8d 3c · Pote 5.7 BB · BTN aposta 1.9 BB (33%) → BB",
    },
    question:
      "Contra uma C-bet de 33% do pote em flop seco, que tipos de mãos precisam compor a defesa do Big Blind além de top pair?",
    options: [
      "Pares médios/baixos (2nd/3rd pair), gutshots, overcards com backdoor flush/straight draw e uma fração de check-raises por valor e blefe.",
      "Apenas trincas e dois pares; todos os segundos pares e backdoors são folds puros.",
      "100% das mãos pré-flop devem aplicar check-raise all-in.",
    ],
    correctIndex: 0,
    conciseFeedback:
      "Correto! Contra 33% do pote (Pot Odds de 20%), desistir de segundos pares e backdoors gera overfold severo que torna qualquer C-bet de 2 cartas lucrativa.",
    whyExplanation:
      "Diante de uma aposta de 1/3 do pote, o agressor só precisa de 25% de folds para empatar um blefe sem equidade. O BB precisa defender segundos/terceiros pares e mãos com backdoors para não ser explorado por range-bets.",
    mathBreakdown:
      "Aposta B = 0,33 P → FE_breakeven = 0,33 / 1,33 = 25,0%. MDF estático = 1 / 1,33 = 75,0%. Pot Odds direto = 0,33 / 1,66 = 20,0%.",
    linkedSpotId: "didactic_mtt_8max_30bb_bb_vs_btn_cbet_v1",
    linkedInteractiveMode: "streets",
    linkedFatalErrorId: "EF09",
  },
];

// ============================================================================
// A. CONSTRUTOR DE RANGES 13×13 (AVALIAÇÃO REAL DE COMBOS E DIFERENÇAS)
// ============================================================================

export interface RangeConstructionDiffCell {
  hand: string;
  userWeight: number;
  targetWeight: number;
  delta: number;
  availableCombos: number;
  status: "match" | "over" | "under" | "neutral_zero";
}

export interface RangeConstructionEvaluation {
  accuracyPct: number;
  userWeightedCombos: number;
  targetWeightedCombos: number;
  totalAvailableDeckCombos: number;
  matchCount: number;
  overIncluded: RangeConstructionDiffCell[];
  underIncluded: RangeConstructionDiffCell[];
  cells: Record<string, RangeConstructionDiffCell>;
}

/**
 * Extrai o peso de ação ativa (soma das ações que não são Fold/Check passivo quando há agressão,
 * ou a ação alvo selecionada) para cada uma das 169 classes.
 */
export function extractTargetActionWeights(
  matrix: Record<string, Record<string, number>>,
  targetAction?: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const hand of ALL_169_HANDS) {
    const dist = matrix[hand];
    if (!dist) {
      result[hand] = 0;
      continue;
    }
    if (targetAction && targetAction !== "ACTIVE_NON_FOLD") {
      result[hand] = Math.max(0, Math.min(1, dist[targetAction] ?? 0));
    } else {
      const nonFold = Object.entries(dist)
        .filter(([act]) => act.toLowerCase() !== "fold")
        .reduce((acc, [, v]) => acc + v, 0);
      result[hand] = Math.max(0, Math.min(1, nonFold));
    }
  }
  return result;
}

export function evaluateRangeConstruction(
  userWeights: Record<string, number>,
  targetWeights: Record<string, number>,
  deadCardStrings: string[] = [],
): RangeConstructionEvaluation {
  const deadCards: PlayingCard[] = [];
  for (const s of deadCardStrings) {
    try {
      deadCards.push(parseCard(s));
    } catch {
      // ignora carta inválida
    }
  }

  let totalError = 0;
  let userWeightedCombos = 0;
  let targetWeightedCombos = 0;
  let totalAvailableDeckCombos = 0;
  let matchCount = 0;
  const overIncluded: RangeConstructionDiffCell[] = [];
  const underIncluded: RangeConstructionDiffCell[] = [];
  const cells: Record<string, RangeConstructionDiffCell> = {};

  for (const hand of ALL_169_HANDS) {
    const u = Math.max(0, Math.min(1, userWeights[hand] ?? 0));
    const t = Math.max(0, Math.min(1, targetWeights[hand] ?? 0));
    const delta = Number((u - t).toFixed(4));
    const avail =
      deadCards.length > 0
        ? getAvailableCombosForClass(hand, deadCards).length
        : getHandCombos(hand);

    totalAvailableDeckCombos += avail;
    userWeightedCombos += u * avail;
    targetWeightedCombos += t * avail;
    totalError += Math.abs(delta);

    let status: RangeConstructionDiffCell["status"] = "match";
    if (u <= 0.02 && t <= 0.02) {
      status = "neutral_zero";
      matchCount++;
    } else if (Math.abs(delta) <= 0.15) {
      status = "match";
      matchCount++;
    } else if (delta > 0.15) {
      status = "over";
    } else {
      status = "under";
    }

    const cell: RangeConstructionDiffCell = {
      hand,
      userWeight: u,
      targetWeight: t,
      delta,
      availableCombos: avail,
      status,
    };
    cells[hand] = cell;
    if (status === "over") overIncluded.push(cell);
    if (status === "under") underIncluded.push(cell);
  }

  overIncluded.sort((a, b) => b.delta - a.delta);
  underIncluded.sort((a, b) => a.delta - b.delta);

  const accuracyPct = Number(
    Math.max(0, (1 - totalError / ALL_169_HANDS.length) * 100).toFixed(1),
  );

  return {
    accuracyPct,
    userWeightedCombos: Number(userWeightedCombos.toFixed(1)),
    targetWeightedCombos: Number(targetWeightedCombos.toFixed(1)),
    totalAvailableDeckCombos,
    matchCount,
    overIncluded,
    underIncluded,
    cells,
  };
}

// ============================================================================
// B. TREINO DE POT ODDS (CÁLCULO ANALÍTICO EXATO VIA mathEngine.ts)
// ============================================================================

export interface PotOddsDrillScenario {
  id: string;
  title: string;
  streetLabel: string;
  potBeforeBetBb: number;
  villainBetBb: number;
  sizingLabel: string;
  contextShort: string;
}

export const POT_ODDS_DRILL_SCENARIOS: readonly PotOddsDrillScenario[] = [
  {
    id: "po-25pct",
    title: "Block Bet de 25% do Pote no River",
    streetLabel: "RIVER",
    potBeforeBetBb: 12,
    villainBetBb: 3,
    sizingLabel: "25% Pote",
    contextShort: "Pote de 12 BB no river. O vilão faz uma block bet de 3 BB.",
  },
  {
    id: "po-33pct",
    title: "C-Bet Padrão de 33% do Pote em SRP",
    streetLabel: "FLOP",
    potBeforeBetBb: 6,
    villainBetBb: 2,
    sizingLabel: "33% Pote",
    contextShort: "Pote de 6 BB no flop. O agressor em posição aposta 2 BB.",
  },
  {
    id: "po-50pct",
    title: "Aposta de Meio Pote (50%)",
    streetLabel: "TURN",
    potBeforeBetBb: 10,
    villainBetBb: 5,
    sizingLabel: "50% Pote",
    contextShort: "Pote de 10 BB. O vilão aposta 5 BB e você decide se paga.",
  },
  {
    id: "po-75pct",
    title: "Barrel Geométrico de 75% do Pote",
    streetLabel: "TURN",
    potBeforeBetBb: 16,
    villainBetBb: 12,
    sizingLabel: "75% Pote",
    contextShort: "Pote de 16 BB no turn. O vilão aplica um segundo barrel de 12 BB.",
  },
  {
    id: "po-100pct",
    title: "Aposta do Tamanho do Pote (100%)",
    streetLabel: "RIVER",
    potBeforeBetBb: 20,
    villainBetBb: 20,
    sizingLabel: "100% Pote",
    contextShort: "Pote de 20 BB no river. O vilão aposta 20 BB (pote cheio).",
  },
  {
    id: "po-150pct",
    title: "Overbet Polarizada de 150% do Pote",
    streetLabel: "RIVER",
    potBeforeBetBb: 16,
    villainBetBb: 24,
    sizingLabel: "150% Pote",
    contextShort: "Pote de 16 BB no river. O vilão aplica uma overbet all-in de 24 BB.",
  },
];

export interface PotOddsDrillEvaluation {
  requiredEquityPct: number;
  mdfPct: number;
  bluffBreakevenPct: number;
  userGuessPct: number;
  absErrorPct: number;
  grade: "EXATO" | "APROXIMADO" | "REVISAR";
  formula: string;
  mdfFormula: string;
  explanation: string;
}

export function evaluatePotOddsDrill(
  potBeforeBetBb: number,
  villainBetBb: number,
  userGuessPct: number,
): PotOddsDrillEvaluation {
  const potOdds = calculatePotOdds(potBeforeBetBb, villainBetBb, villainBetBb);
  const mdf = calculateSimplifiedMdf(potBeforeBetBb, villainBetBb);
  const bluff = calculateBluffBreakevenFoldEquity(potBeforeBetBb, villainBetBb);

  const absErrorPct = Number(
    Math.abs(userGuessPct - potOdds.requiredEquityPct).toFixed(2),
  );
  const grade: PotOddsDrillEvaluation["grade"] =
    absErrorPct <= 1.2 ? "EXATO" : absErrorPct <= 3.5 ? "APROXIMADO" : "REVISAR";

  return {
    requiredEquityPct: potOdds.requiredEquityPct,
    mdfPct: mdf.mdfPct,
    bluffBreakevenPct: bluff.requiredFoldEquityPct,
    userGuessPct,
    absErrorPct,
    grade,
    formula: `Eq_min = ${villainBetBb} / (${potBeforeBetBb} + ${villainBetBb} + ${villainBetBb}) = ${villainBetBb} / ${potBeforeBetBb + 2 * villainBetBb} = ${potOdds.requiredEquityPct.toFixed(2)}%`,
    mdfFormula: `MDF = ${potBeforeBetBb} / (${potBeforeBetBb} + ${villainBetBb}) = ${mdf.mdfPct.toFixed(2)}%`,
    explanation:
      grade === "EXATO"
        ? `Cálculo preciso! Você precisa vencer pelo menos ${potOdds.requiredEquityPct.toFixed(2)}% das vezes no showdown (modelo estático sem rake/ações futuras).`
        : grade === "APROXIMADO"
          ? `Muito próximo (diferença de ${absErrorPct.toFixed(2)} p.p.). O valor exato é ${potOdds.requiredEquityPct.toFixed(2)}%.`
          : `Atenção ao denominador: o pote final após o seu call será ${potBeforeBetBb} + ${villainBetBb} + ${villainBetBb} = ${potBeforeBetBb + 2 * villainBetBb} BB, exigindo ${potOdds.requiredEquityPct.toFixed(2)}% de equidade.`,
  };
}

// ============================================================================
// C. TREINO DE BLOCKERS (ENUMERAÇÃO COMBINATÓRIA EXATA VIA cards.ts)
// ============================================================================

export interface BlockerDrillScenario {
  id: string;
  title: string;
  board: string[];
  targetRangeLabel: string;
  targetClasses: string[];
  candidateA: { label: string; cards: [string, string]; handClass: string };
  candidateB: { label: string; cards: [string, string]; handClass: string };
  contextShort: string;
  strategicCaveat: string;
}

export const BLOCKER_DRILL_SCENARIOS: readonly BlockerDrillScenario[] = [
  {
    id: "blk-ahkd7c-top",
    title: "Flop Ah Kd 7c: Bloqueando Topo do Range (AA, KK, AKs, AKo)",
    board: ["Ah", "Kd", "7c"],
    targetRangeLabel: "Topo do range (AA, KK, AKs, AKo)",
    targetClasses: ["AA", "KK", "AKs", "AKo"],
    candidateA: { label: "As Qs (Bloqueia Ás)", cards: ["As", "Qs"], handClass: "AQs" },
    candidateB: { label: "Qs Js (Sem Ás ou Rei)", cards: ["Qs", "Js"], handClass: "QJs" },
    contextShort:
      "Board Ah Kd 7c. Compare o efeito de segurar As Qs versus Qs Js sobre as combinações de AA, KK, AKs e AKo disponíveis para o oponente.",
    strategicCaveat:
      "Contagem combinatória exata (EXACT_ENUMERATION). Lembre-se: bloquear o topo do vilão reduz combos de valor, mas As Qs já possui forte valor de showdown/top pair.",
  },
  {
    id: "blk-broadway-straight",
    title: "River Ks Qd Jc Th 2s: Bloqueando Sequências com Ás (AK, AQ, AJ, AT)",
    board: ["Ks", "Qd", "Jc", "Th", "2s"],
    targetRangeLabel: "Sequências Broadway com Ás (AKs, AKo, AQs, AQo, AJs, AJo, ATs, ATo)",
    targetClasses: ["AKs", "AKo", "AQs", "AQo", "AJs", "AJo", "ATs", "ATo"],
    candidateA: { label: "Ad 5d (Contém Ás)", cards: ["Ad", "5d"], handClass: "A5s" },
    candidateB: { label: "9d 8d (Sem carta Broadway)", cards: ["9d", "8d"], handClass: "98s" },
    contextShort:
      "Board de 4 cartas para sequência (Ks Qd Jc Th 2s). Qual mão remove mais combos de sequência nut (Ax Broadway) do range adversário?",
    strategicCaveat:
      "Segurar um Ás remove 25% de todos os combos de sequência Broadway do vilão, sendo o principal bloqueador estrutural neste runout.",
  },
  {
    id: "blk-sets-overpairs",
    title: "Flop Ks Jh 4d: Bloqueando Top Pair e Sets (KK, JJ, AKs, AKo, KQs)",
    board: ["Ks", "Jh", "4d"],
    targetRangeLabel: "Sets altos e Top Pairs fortes (KK, JJ, AKs, AKo, KQs)",
    targetClasses: ["KK", "JJ", "AKs", "AKo", "KQs"],
    candidateA: { label: "Kc Qd (Bloqueia Rei e Dama)", cards: ["Kc", "Qd"], handClass: "KQo" },
    candidateB: { label: "9s 8s (Sem bloqueador alto)", cards: ["9s", "8s"], handClass: "98s" },
    contextShort:
      "Flop Ks Jh 4d. Compare quantos combos de KK, JJ, AKs, AKo e KQs restam para o vilão quando você segura Kc Qd versus 9s 8s.",
    strategicCaveat:
      "Kc Qd remove metade dos Reis restantes no baralho (reduzindo KK de 3 para 1 combo e AK de 12 para 8 combos).",
  },
];

export interface BlockerDrillComparisonResult {
  boardCombosOnly: number;
  candidateARemaining: number;
  candidateABlocked: number;
  candidateAReductionPct: number;
  candidateBRemaining: number;
  candidateBBlocked: number;
  candidateBReductionPct: number;
  betterBlocker: "A" | "B" | "TIE";
  perClassBreakdown: {
    handClass: string;
    boardOnly: number;
    withA: number;
    withB: number;
  }[];
}

export function evaluateBlockerDrill(
  scenario: BlockerDrillScenario,
): BlockerDrillComparisonResult {
  const boardCards = scenario.board.map(parseCard);
  const cardsA = [...boardCards, ...scenario.candidateA.cards.map(parseCard)];
  const cardsB = [...boardCards, ...scenario.candidateB.cards.map(parseCard)];

  let boardCombosOnly = 0;
  let candidateARemaining = 0;
  let candidateBRemaining = 0;
  const perClassBreakdown: BlockerDrillComparisonResult["perClassBreakdown"] = [];

  for (const cls of scenario.targetClasses) {
    const bCount = getAvailableCombosForClass(cls, boardCards).length;
    const aCount = getAvailableCombosForClass(cls, cardsA).length;
    const cBCount = getAvailableCombosForClass(cls, cardsB).length;
    boardCombosOnly += bCount;
    candidateARemaining += aCount;
    candidateBRemaining += cBCount;
    perClassBreakdown.push({
      handClass: cls,
      boardOnly: bCount,
      withA: aCount,
      withB: cBCount,
    });
  }

  const candidateABlocked = boardCombosOnly - candidateARemaining;
  const candidateBBlocked = boardCombosOnly - candidateBRemaining;
  const candidateAReductionPct =
    boardCombosOnly > 0
      ? Number(((candidateABlocked / boardCombosOnly) * 100).toFixed(1))
      : 0;
  const candidateBReductionPct =
    boardCombosOnly > 0
      ? Number(((candidateBBlocked / boardCombosOnly) * 100).toFixed(1))
      : 0;

  return {
    boardCombosOnly,
    candidateARemaining,
    candidateABlocked,
    candidateAReductionPct,
    candidateBRemaining,
    candidateBBlocked,
    candidateBReductionPct,
    betterBlocker:
      candidateABlocked > candidateBBlocked
        ? "A"
        : candidateBBlocked > candidateABlocked
          ? "B"
          : "TIE",
    perClassBreakdown,
  };
}

// ============================================================================
// D. TREINO DE SIZINGS (COMPARAÇÃO DE EV MODELADO VIA labEv.ts)
// ============================================================================

export interface SizingComparisonModelInput {
  potBb: number;
  sizingAPct: number;
  foldFreqA: number;
  eqWhenCalledA: number;
  sizingBPct: number;
  foldFreqB: number;
  eqWhenCalledB: number;
  checkEquity: number;
}

export interface SizingComparisonModelOutput {
  betABb: number;
  evABb: number;
  breakevenFoldAPct: number;
  betBBb: number;
  evBBb: number;
  breakevenFoldBPct: number;
  evCheckBb: number;
  recommendedByModel: "SIZING_A" | "SIZING_B" | "CHECK";
  deltaEvBb: number;
  curveA: { foldPct: number; evBb: number }[];
  curveB: { foldPct: number; evBb: number }[];
}

export function evaluateSizingModelComparison(
  input: SizingComparisonModelInput,
): SizingComparisonModelOutput {
  const pot = Math.max(0.5, input.potBb);
  const betABb = Number(((pot * Math.max(5, input.sizingAPct)) / 100).toFixed(2));
  const betBBb = Number(((pot * Math.max(5, input.sizingBPct)) / 100).toFixed(2));
  const foldA = Math.max(0, Math.min(1, input.foldFreqA));
  const foldB = Math.max(0, Math.min(1, input.foldFreqB));
  const eqA = Math.max(0, Math.min(1, input.eqWhenCalledA));
  const eqB = Math.max(0, Math.min(1, input.eqWhenCalledB));
  const checkEq = Math.max(0, Math.min(1, input.checkEquity));

  const resA = calculateLabEv({
    pot,
    bet: betABb,
    call: betABb,
    equity: eqA,
    fold: foldA,
    callFrequency: Number((1 - foldA).toFixed(6)),
    equityWhenCalled: eqA,
    checkEquity: checkEq,
    cost: 0,
    betFrequency: 1,
  });

  const resB = calculateLabEv({
    pot,
    bet: betBBb,
    call: betBBb,
    equity: eqB,
    fold: foldB,
    callFrequency: Number((1 - foldB).toFixed(6)),
    equityWhenCalled: eqB,
    checkEquity: checkEq,
    cost: 0,
    betFrequency: 1,
  });

  const curveA: { foldPct: number; evBb: number }[] = [];
  const curveB: { foldPct: number; evBb: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    const cA = calculateLabEv({
      pot,
      bet: betABb,
      call: betABb,
      equity: eqA,
      fold: f,
      callFrequency: Number((1 - f).toFixed(6)),
      equityWhenCalled: eqA,
      checkEquity: checkEq,
      cost: 0,
      betFrequency: 1,
    });
    const cB = calculateLabEv({
      pot,
      bet: betBBb,
      call: betBBb,
      equity: eqB,
      fold: f,
      callFrequency: Number((1 - f).toFixed(6)),
      equityWhenCalled: eqB,
      checkEquity: checkEq,
      cost: 0,
      betFrequency: 1,
    });
    curveA.push({ foldPct: i * 5, evBb: Number(cA.evBet.toFixed(3)) });
    curveB.push({ foldPct: i * 5, evBb: Number(cB.evBet.toFixed(3)) });
  }

  const evABb = Number(resA.evBet.toFixed(3));
  const evBBb = Number(resB.evBet.toFixed(3));
  const evCheckBb = Number(resA.evCheck.toFixed(3));
  const maxEv = Math.max(evABb, evBBb, evCheckBb);
  const recommendedByModel: SizingComparisonModelOutput["recommendedByModel"] =
    maxEv === evABb ? "SIZING_A" : maxEv === evBBb ? "SIZING_B" : "CHECK";

  return {
    betABb,
    evABb,
    breakevenFoldAPct: Number((resA.bluff.requiredFoldEquity * 100).toFixed(2)),
    betBBb,
    evBBb,
    breakevenFoldBPct: Number((resB.bluff.requiredFoldEquity * 100).toFixed(2)),
    evCheckBb,
    recommendedByModel,
    deltaEvBb: Number(Math.abs(evABb - evBBb).toFixed(3)),
    curveA,
    curveB,
  };
}
