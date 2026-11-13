import type { CurriculumTrackId } from "./strategySchema.ts";

export type TranscriptVerificationStatus = "analisada" | "indisponível";

export type EpistemicEvidenceType =
  | "VIDEO_CONCEPT"
  | "METADATA_HYPOTHESIS"
  | "EXPLOIT_HEURISTIC"
  | "SOLVER_REQUIRED";

export interface VideoTimestampRef {
  label: string;
  seconds: number;
  urlWithTimestamp: string;
  paraphraseNote: string;
}

export interface RegLifeLessonExample {
  scenarioTitle: string;
  tableContext: string;
  didacticAnalysis: string;
  pitfallToAvoid: string;
}

export interface RegLifeLessonQuiz {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  evidenceType: EpistemicEvidenceType;
}

export interface RegLifeLessonExercise {
  id: string;
  title: string;
  recommendedMode: "LEARNING" | "GTO_TECHNICAL";
  linkedSpotId: string;
  objective: string;
}

export interface EpistemicDomainSeparation {
  /** Conteúdo educacional / conceitual extraído da aula (ou aviso de metadados se sem transcrição) */
  educationalConcept: string;
  /** Heurística explorativa condicionada a leitura/amostra (nunca tratada como equilíbrio de Nash) */
  exploitativeHeuristic: string;
  /** Requisito matemático para solução GTO exata (o que depende de solver independente) */
  mathematicalGtoSpec: string;
}

export interface RegLifeSeriesLesson {
  spotNumber: number;
  videoId: string;
  title: string;
  publishedDate: string;
  url: string;
  moduleLabel: string;
  trackId: CurriculumTrackId;
  transcriptStatus: TranscriptVerificationStatus;
  hasVerifiedTranscript: boolean;
  publicSource: "vidIQ transcript" | "vidIQ metadata only";
  evidenceType: "VIDEO_CONCEPT" | "METADATA_HYPOTHESIS";
  unverifiedWarning: string | null;
  coreConcept: string;
  summaryOriginal: string;
  timestamps: VideoTimestampRef[];
  separationOfDomains: EpistemicDomainSeparation;
  examples: RegLifeLessonExample[];
  quiz: RegLifeLessonQuiz;
  exercises: RegLifeLessonExercise[];
}

export interface RegLifeSupplementalVideo {
  videoId: string;
  title: string;
  url: string;
  transcriptStatus: TranscriptVerificationStatus;
  summaryOriginal: string;
  timestamps: VideoTimestampRef[];
  softwareTranslation: string;
  epistemicCaveat: string;
}

export const REGLIFE_CATALOG_METADATA = {
  researchDate: "2026-11-12",
  channel: "Reg Life",
  channelHandle: "@RegLife",
  channelId: "UCVqx1385YLBq1N1Cc9WfVjQ",
  channelVideoCountSnapshot: 600,
  seriesTotalLessons: 18,
  verifiedTranscriptsCount: 15,
  metadataOnlyCount: 3,
  supplementalVideosCount: 7,
  disclaimer:
    "Os resumos e conceitos são paráfrases didáticas originais de materiais públicos; não constituem ranges numéricos ou saídas de solver licenciadas. Jamais converter heurísticas das aulas em GTO exato sem solução matemática independente.",
} as const;

export const REGLIFE_18_LESSONS: readonly RegLifeSeriesLesson[] = [
  {
    spotNumber: 1,
    videoId: "_Wl17geMXmc",
    title: "Quais mãos ABRIR em cada POSIÇÃO no poker?",
    publishedDate: "2026-06-02",
    url: "https://www.youtube.com/watch?v=_Wl17geMXmc",
    moduleLabel: "RFI por posição",
    trackId: "PREFLOP_RFI",
    transcriptStatus: "indisponível",
    hasVerifiedTranscript: false,
    publicSource: "vidIQ metadata only",
    evidenceType: "METADATA_HYPOTHESIS",
    unverifiedWarning:
      "Transcrição indisponível nesta auditoria: apenas título, data e URL foram confirmados via metadados. O vínculo com RFI por posição é uma hipótese de categorização; nenhuma instrução ou frase foi atribuída aos instrutores sem verificação.",
    coreConcept:
      "Fundamentos estruturais de Raise First In (RFI) modulados pela posição na mesa, número de oponentes restantes por agir, stack efetivo e presença de ante.",
    summaryOriginal:
      "Treinar ranges RFI por posição, tamanho de stack e ante; só o título foi confirmado, não a explicação.",
    timestamps: [],
    separationOfDomains: {
      educationalConcept:
        "Conceito fundamental de poker (não extraído de fala transcrita desta aula): quanto mais jogadores restam para agir à esquerda, mais estreito e seletivo precisa ser o range de abertura.",
      exploitativeHeuristic:
        "Expandir steal em posições finais quando os blinds demonstram overfold consistente em amostra relevante (>= 40 oportunidades), retraindo contra 3-bettors agressivos.",
      mathematicalGtoSpec:
        "As frequências exatas de RFI e o EV de cada combo exigem árvore pré-flop resolvida para o stack efetivo, estrutura de ante (ex.: 0.125bb por jogador em 8-max) e rake/ICM aplicável.",
    },
    examples: [
      {
        scenarioTitle: "Comparação estrutural UTG vs BTN (30BB 8-Max)",
        tableContext: "MTT 8-Max, ante 12.5%, pote inicial 2.5bb.",
        didacticAnalysis:
          "No UTG restam 7 jogadores para agir; mãos offsuit médias sofrem dominação e 3-bets. No BTN restam apenas SB e BB e o herói jogará em posição todo o pós-flop.",
        pitfallToAvoid:
          "Atribuir porcentagens fixas de RFI à aula 01 sem transcrição ou usar um único chart de 100bb para qualquer profundidade.",
      },
    ],
    quiz: {
      id: "quiz_spot_01",
      question:
        "Qual é o status epistemológico correto da Aula 01 (_Wl17geMXmc) no catálogo auditado do GTO Trainer?",
      options: [
        "Possui apenas metadados confirmados (título/URL); conceitos gerais de RFI são estudados sem atribuir falas não verificadas ao vídeo",
        "Fornece todas as tabelas exatas de EV de solver para 8-max e 9-max",
        "Recomenda abrir exatamente 25% das mãos do UTG em qualquer stack",
        "Substitui soluções matemáticas de ICM em mesas finais",
      ],
      correctIndex: 0,
      explanation:
        "A Aula 01 não teve transcrição disponível na extração pública; por rigor técnico, é categorizada como hipótese por título (METADATA_HYPOTHESIS) sem fabricar citações.",
      evidenceType: "METADATA_HYPOTHESIS",
    },
    exercises: [
      {
        id: "ex_spot_01_a",
        title: "Fixação Conceitual: RFI no BTN 30BB (Demo Didática)",
        recommendedMode: "LEARNING",
        linkedSpotId: "didactic_rfi_btn_30bb_v1",
        objective: "Compreender a borda de abertura no BTN e o papel de mãos em estratégia mista (sem EV de solver).",
      },
      {
        id: "ex_spot_01_b",
        title: "Estudo em Planilha Importada: 30BB RFI BTN (Chart Sem EV)",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_rfi_btn",
        objective: "Praticar frequências pré-flop importadas de ranges_gto.json (IMPORTED_CHART_NO_EV).",
      },
    ],
  },
  {
    spotNumber: 2,
    videoId: "8TlB6tdjaGQ",
    title: "Como jogar com poucas fichas no poker",
    publishedDate: "2026-06-04",
    url: "https://www.youtube.com/watch?v=8TlB6tdjaGQ",
    moduleLabel: "RFI short stack",
    trackId: "PREFLOP_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Em stacks curtos (short stack), o RFI divide-se entre open-raise menor (min-raise), open-shove (all-in direto) e fold, dependendo da posição, bloqueadores e retenção de equidade quando pago.",
    summaryOriginal:
      "RFI e shove/fold em stacks curtos; comparação de estruturas e escolhas de fold/open/shove; o trainer da escola visa fixar aulas, sem expor EV detalhado.",
    timestamps: [
      {
        label: "~20:55 / ~21:00",
        seconds: 1255,
        urlWithTimestamp: "https://www.youtube.com/watch?v=8TlB6tdjaGQ&t=1255s",
        paraphraseNote:
          "Explicação de que o treinador pedagógico da escola foca em fixar o conteúdo da aula (fold/open/shove), e não em exibir tabelas completas de EV de solver.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Com poucas fichas (ex.: 14bb–17bb), mãos que têm excelente bloqueador e equidade bruta mas jogam mal pós-flop (ou não suportam 3-bet) frequentemente preferem open-shove, enquanto o topo absoluto e parte das mãos de borda equilibram o min-raise.",
      exploitativeHeuristic:
        "Se os jogadores atrás raramente aplicam 3-bet re-shove light, o min-raise captura blinds arriscando apenas 2bb em vez de 14bb–17bb.",
      mathematicalGtoSpec:
        "A divisão exata entre min-raise e open-shove em 8–25bb depende das soluções de equilíbrio para cada posição (`stack_bb`, `players_left_to_act`, `ante`, `cEV_or_ICM`).",
    },
    examples: [
      {
        scenarioTitle: "14BB UTG/MP: Open Min-Raise vs Open Shove",
        tableContext: "MTT 8-Max, 14BB efetivos, ante 0.125bb.",
        didacticAnalysis:
          "Pares médios (77–88) e broadways offsuit/suited vulneráveis a re-shoves (ex.: AJo, KQs/KJs em certas posições) ganham muito ao negar realização de equidade via shove direto, enquanto AA/KK lideram a linha de min-raise/induce.",
        pitfallToAvoid:
          "Achar que abaixo de 15bb toda abertura é exclusivamente push-or-fold puro em qualquer posição.",
      },
    ],
    quiz: {
      id: "quiz_spot_02",
      question:
        "Segundo a análise da Aula 02 (~20:55), qual distinção arquitetural é fundamental para um treinador inspirado nesse currículo?",
      options: [
        "Separar o Modo Aprendizagem (fixação conceitual da aula) do Modo GTO Técnico (que exige solução verificada com EV por ação)",
        "Tratar qualquer resposta de quiz didático como se tivesse EV exato de solver",
        "Proibir o uso de min-raise com menos de 20 big blinds em todas as posições",
        "Ignorar o tamanho do ante e o número de jogadores atrás ao decidir entre open e shove",
      ],
      correctIndex: 0,
      explanation:
        "Na Aula 02 (~20:55), é explicitado que o trainer da escola serve como instrumento de fixação pedagógica e não como solver de EV detalhado — motivo pelo qual nosso sistema separa o Modo Aprendizagem do Modo GTO Técnico.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_02_a",
        title: "Estudo Short Stack: 14BB RFI UTG (Raise vs All-in 14 vs Fold)",
        recommendedMode: "LEARNING",
        linkedSpotId: "14bb_rfi_utg",
        objective: "Analisar a divisão entre min-raise e open-shove com 14BB (chart importado sem EV).",
      },
      {
        id: "ex_spot_02_b",
        title: "Estudo Short Stack: 14BB RFI BTN (Planilha Importada Sem EV)",
        recommendedMode: "LEARNING",
        linkedSpotId: "14bb_rfi_btn",
        objective: "Praticar decisão short-stack no BTN em chart importado (IMPORTED_CHART_NO_EV).",
      },
    ],
  },
  {
    spotNumber: 3,
    videoId: "MDqwP3-j1wk",
    title: "Como SIMPLIFICAR sua estratégia de Continuation Bet no poker",
    publishedDate: "2026-06-05",
    url: "https://www.youtube.com/watch?v=MDqwP3-j1wk",
    moduleLabel: "C-bet flop IP vs BB",
    trackId: "FLOP_CBET_IP_VS_BB",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "A estratégia de C-bet em posição contra o BB depende da interação entre textura do board (high-card seco vs conectado médio/baixo) e os ranges de quem abriu (ex.: UTG vs BTN). Simplificações de sizing só são válidas quando a perda de EV (`ΔEV`) em relação à árvore completa é mínima.",
    summaryOriginal:
      "Vantagem de range, diferença UTG versus BTN, textura média vs high-card, sizings de 1/3 a 1/2 pot e simplificação com pequena perda de EV em certos spots.",
    timestamps: [
      {
        label: "~03:45",
        seconds: 225,
        urlWithTimestamp: "https://www.youtube.com/watch?v=MDqwP3-j1wk&t=225s",
        paraphraseNote:
          "Discussão sobre como diferenças mínimas de EV entre sizings (ex.: 1/3 vs 1/2 pot) em certos flops permitem simplificar a execução humana com baixo custo teórico.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "O abridor de posições iniciais (UTG) chega ao flop com range muito mais concentrado em cartas altas do que o BTN; já em boards médios/conectados, o BB iguala ou supera a proporção de dois pares/sequências, obrigando mais checks.",
      exploitativeHeuristic:
        "Simplificar para um único sizing pequeno em boards secos onde o pool de recreativos folda excessivamente ou não constrói range de check-raise balanceado.",
      mathematicalGtoSpec:
        "Quantificar o custo de uma simplificação exige comparar `EV(sizing_ótimo) - EV(sizing_simplificado)` sob a mesma árvore e premissas de solver.",
    },
    examples: [
      {
        scenarioTitle: "Flop A-K-7 rainbow vs Flop 8-7-5 two-tone (BTN vs BB)",
        tableContext: "SRP 30BB efetivos, pote 5.5bb.",
        didacticAnalysis:
          "Em Ah Kd 7c, o IP possui enorme vantagem de range e de nuts (AA, KK, AK), permitindo alta frequência de c-bet. Em 8s 7s 5d, o BB tem todos os combos de 87, 75, 85, 96s e 64s, exigindo alta frequência de check do agressor.",
        pitfallToAvoid:
          "Transformar 'apostar 1/3 do pote' em regra universal para qualquer flop e qualquer posição.",
      },
    ],
    quiz: {
      id: "quiz_spot_03",
      question:
        "Quando é tecnicamente legítimo simplificar múltiplos sizings de C-bet no flop para um único sizing prático?",
      options: [
        "Quando a diferença de EV (ΔEV = EV_ótimo - EV_simplificado) naquele tipo de textura e confronto de ranges é comprovadamente mínima e a execução fica mais precisa",
        "Sempre, pois o tamanho da aposta no flop nunca altera o EV em No-Limit Hold'em",
        "Em qualquer board baixo conectado (ex.: 7-6-5), apostando 100% do range a 1/3 do pote",
        "Apenas quando o herói está fora de posição sem vantagem de range",
      ],
      correctIndex: 0,
      explanation:
        "A simplificação de sizing se apoia no baixo custo de EV (ΔEV pequeno) em texturas específicas, nunca no desconhecimento da textura ou na aplicação cega de 1/3 pot em todo flop.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_03_a",
        title: "Drill Conceitual (Demo Sintética): Flop Ah Kd 7c",
        recommendedMode: "LEARNING",
        linkedSpotId: "didactic_flop_cbet_btn_vs_bb_v1",
        objective: "Estudar vantagem de range/nuts e remoção de cartas em exemplo didático (sem EV loss GTO).",
      },
      {
        id: "ex_spot_03_b",
        title: "Demo Sintética Adicional: Flop Ah Kd 7c (Sem Solver)",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_postflop_btn_vs_bb_ahkd7c_v1",
        objective: "Explorar visualmente a partição pedagógica de ações no flop (DIDACTIC_DEMO).",
      },
    ],
  },
  {
    spotNumber: 4,
    videoId: "XhPmzrQhFlY",
    title: "Quando continuar apostando no TURN?",
    publishedDate: "2026-06-06",
    url: "https://www.youtube.com/watch?v=XhPmzrQhFlY",
    moduleLabel: "Double barrel turn",
    trackId: "TURN_RIVER_CBET_IP_VS_BB",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Após aplicar C-bet no flop e receber call do BB, os dois ranges se estreitam. No turn, a decisão de aplicar o segundo barrel exige dividir a mão em três baldes: valor forte, showdown médio (que prefere controlar o pote via check) e semiblefes com equidade/blockers.",
    summaryOriginal:
      "Após C-bet flop e call do BB; separar mãos fortes para valor, mãos médias de showdown e bluffs com bloqueadores/equity. Comparar sizings e EV.",
    timestamps: [
      {
        label: "~06:20",
        seconds: 380,
        urlWithTimestamp: "https://www.youtube.com/watch?v=XhPmzrQhFlY&t=380s",
        paraphraseNote:
          "Referência ao papel didático do treino para consolidar a lógica da aula.",
      },
      {
        label: "~08:35",
        seconds: 515,
        urlWithTimestamp: "https://www.youtube.com/watch?v=XhPmzrQhFlY&t=515s",
        paraphraseNote:
          "Separação entre valor forte, showdown médio e candidatos a blefe/semiblefe conforme a carta do turn.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "No turn, mãos de força média que batem parte do range de call do flop mas são dominadas quando pagas em duas streets grandes costumam ir para o check-back, enquanto draws com equidade e bons blockers alimentam a faixa de barrel.",
      exploitativeHeuristic:
        "Contra defensores que pagam muito flop ('floats' largos) e desistem de pares fracos no turn, aumentar a agressividade em cartas altas/overcards que favorecem o agressor.",
      mathematicalGtoSpec:
        "A frequência exata de double barrel e o sizing ótimo (ex.: 66% vs 75% vs overbet) dependem da transição exata de equidade no runout calculada em solver.",
    },
    examples: [
      {
        scenarioTitle: "Turn tijolo vs Turn que completa draws no BB",
        tableContext: "Flop Ah Kd 7c -> Turn 4s (pote 9.1bb, efetivo 26.1bb).",
        didacticAnalysis:
          "Num turn 4s desconectado, o agressor mantém vantagem de nuts (AA, KK, AK, AQ) e pode pressionar com sizing polarizado. Já pares médios (ex.: KK/QQ em board com Ás ou Kx fraco) avaliam proteção versus controle de pote.",
        pitfallToAvoid:
          "Apostar automaticamente no turn mãos de showdown médio que só fazem mãos piores foldarem e mãos melhores pagarem.",
      },
    ],
    quiz: {
      id: "quiz_spot_04",
      question:
        "Na transição do flop para o turn (Aula 04, ~08:35), como o range do agressor em posição costuma se reorganizar?",
      options: [
        "Separa-se em valor forte (continua apostando), valor médio de showdown (tende a checar para realizar equidade/controlar pote) e blefes/semiblefes selecionados por equidade e blockers",
        "Mantém exatamente a mesma frequência de aposta pequena com 100% das mãos que apostaram no flop",
        "Checa todas as mãos de valor forte e aposta apenas mãos sem nenhuma equidade",
        "Desiste de todos os draws para nunca sofrer check-raise all-in",
      ],
      correctIndex: 0,
      explanation:
        "Ao enfrentar o range filtrado de check-call do BB no flop, o turn exige maior polarização: valor forte e bons semiblefes apostam, enquanto mãos médias de showdown frequentemente checam.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_04_a",
        title: "Estudo Conceitual: Turn Barrel em Ah Kd 7c 4s",
        recommendedMode: "LEARNING",
        linkedSpotId: "unsolved_turn_barrel_btn_vs_bb_v1",
        objective: "Classificar mãos nos 3 baldes (valor forte, showdown médio, semiblefe).",
      },
    ],
  },
  {
    spotNumber: 5,
    videoId: "bmN0dwGdWSE",
    title: "A ARTE de apostar no RIVER",
    publishedDate: "2026-06-07",
    url: "https://www.youtube.com/watch?v=bmN0dwGdWSE",
    moduleLabel: "River e polarização",
    trackId: "TURN_RIVER_CBET_IP_VS_BB",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "No river não há cartas futuras: o range de apostas torna-se polarizado. Apostas por valor precisam ter >50% de equidade contra o range que PAGA (não contra o range total), e bons blefes saem da base sem valor de showdown que bloqueia o range de call/nuts do vilão e desbloqueia o range de fold.",
    summaryOriginal:
      "River IP vs BB: polarização, valor vs pior range pagador, seleção de blefes pelo bottom do range, blockers de nuts e unblockers dos folds.",
    timestamps: [
      {
        label: "~03:10",
        seconds: 190,
        urlWithTimestamp: "https://www.youtube.com/watch?v=bmN0dwGdWSE&t=190s",
        paraphraseNote:
          "Critério para aposta por valor no river: ser favorito contra o range que dá call, distinguindo valor de meramente ter uma mão boa contra o range total.",
      },
      {
        label: "~04:30",
        seconds: 270,
        urlWithTimestamp: "https://www.youtube.com/watch?v=bmN0dwGdWSE&t=270s",
        paraphraseNote:
          "Seleção de candidatos a blefe a partir do fundo do range, priorizando blockers das mãos fortes do oponente e unblockers das mãos que foldam.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "No river, `river_bluff_candidate_score` combina três fatores qualitativos: (1) ausência de showdown value suficiente para vencer no check, (2) bloquear combos de call/nuts do defensor, (3) não bloquear combos de draws falhados/mãos fracas que o defensor vai foldar.",
      exploitativeHeuristic:
        "Contra jogadores que pagam pouco no river (overfold a sizings grandes), expandir os blefes do fundo do range; contra 'calling stations', cortar blefes e expandir thin value bets.",
      mathematicalGtoSpec:
        "No modelo matemático polarizado de river (heads-up, sem rake), a fração de blefes no range de aposta é `B / (P + 2B)` (deixando o bluff-catcher indiferente com pot odds `B / (P + 2B)`). Porém, um score heurístico de blocker NUNCA substitui a resolução completa do river em solver.",
    },
    examples: [
      {
        scenarioTitle: "Matemática do River Polarizado (Pote 100, Aposta 100)",
        tableContext: "River HU, P = 100bb, aposta B = 100bb (pot-sized bet).",
        didacticAnalysis:
          "O defensor precisa de `100 / (100 + 200) = 33,33%` de equidade para pagar. Logo, um range perfeitamente polarizado do agressor contém `66,67%` de combos de valor e `33,33%` de combos de blefe (proporção 2:1 valor:blefe).",
        pitfallToAvoid:
          "Blefar no river segurando as cartas do flush draw que falhou (bloqueando justamente os folds automáticos do vilão).",
      },
    ],
    quiz: {
      id: "quiz_spot_05",
      question:
        "Em um river heads-up sem rake onde o pote é P = 20bb e o agressor faz uma aposta polarizada de B = 10bb (meio pote), qual é a fração teórica de blefes dentro do range de aposta `B / (P + 2B)`?",
      options: [
        "25% de blefes e 75% de valor (pois o defensor precisa de 10 / (20 + 20) = 25% de equidade para dar call)",
        "50% de blefes e 50% de valor",
        "33,33% de blefes e 66,67% de valor",
        "66,67% de blefes e 33,33% de valor",
      ],
      correctIndex: 0,
      explanation:
        "Com P = 20 e B = 10, o pote final após o call é P + 2B = 40. O caller precisa vencer 10 / 40 = 25% das vezes; portanto, no modelo polarizado simplificado, 25% das apostas são blefes.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_05_a",
        title: "Estudo Conceitual (UNSOLVED): River Polarizado e Blockers",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_river_polarized_btn_vs_bb_v1",
        objective: "Analisar matematicamente a fração de blefes B/(P+2B) e contagem exata de blockers no river (sem EV inventado).",
      },
    ],
  },
  {
    spotNumber: 6,
    videoId: "XD0Y_ZeNSKk",
    title: "Range Linear ou Polarizado? Aprenda de Uma Vez",
    publishedDate: "2026-06-07",
    url: "https://www.youtube.com/watch?v=XD0Y_ZeNSKk",
    moduleLabel: "Vs RFI / 3-bet",
    trackId: "PREFLOP_VS_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "A construção do range contra um open raise (Linear/Merged vs Polarizado) depende de haver ou não range de flat call lucrativo, da posição relativa, dos jogadores restantes para agir (risco de squeeze) e da profundidade de stack.",
    summaryOriginal:
      "Estrutura de 3-bet, escolha de sizing conforme profundidade, blockers, ranges polarizados e linhas call/3-bet/shove; preservar condicionantes.",
    timestamps: [
      {
        label: "~01:40",
        seconds: 100,
        urlWithTimestamp: "https://www.youtube.com/watch?v=XD0Y_ZeNSKk&t=100s",
        paraphraseNote:
          "Diferenciação entre estrutura linear (topo contínuo de valor e jogabilidade) e estrutura polarizada (topo de valor + blefes com blockers na borda do fold), além do ajuste de sizing pela profundidade.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Categorias como `linear`, `polarizado`, `condensado` e `merged` são rótulos descritivos da morfologia do range: quando não temos range de call (ou queremos evitar squeeze OOP), a 3-bet tende a ser mais linear; quando mantemos um range amplo de flat call (ex.: BTN), a 3-bet usa o topo de valor mais mãos na borda do call/fold com bons blockers.",
      exploitativeHeuristic:
        "Contra vilões que foldam muito para 3-bet, polarizar mais a 3-bet usando mãos da borda inferior com bloqueadores (Axs/Kxs/Axo); contra vilões que pagam quase toda 3-bet, usar range linear de alta equidade pós-flop.",
      mathematicalGtoSpec:
        "Em soluções modernas de solver com stacks médios de MTT, muitas mãos misturam Call e 3-Bet simultaneamente; portanto, 'linear vs polarizado' é uma lente explicativa e não substitui as frequências por combo.",
    },
    examples: [
      {
        scenarioTitle: "30BB BTN vs CO RFI vs 30BB SB vs UTG RFI",
        tableContext: "MTT 8-Max, 30BB efetivos.",
        didacticAnalysis:
          "No BTN vs CO, o herói tem posição garantida e mantém um range robusto de flat call, mesclando 3-bets de valor e blefes com blockers. Já em posições intermediárias ou SB contra UTG, o risco de jogar fora de posição ou sofrer squeeze comprime o flat call.",
        pitfallToAvoid:
          "Aplicar 3-bet polarizada com lixo desconectado quando o stack efetivo é curto demais para gerar fold equity ou quando o vilão nunca folda.",
      },
    ],
    quiz: {
      id: "quiz_spot_06",
      question:
        "Por que a classificação entre range 'Linear' e 'Polarizado' (Aula 06, ~01:40) deve ser tratada como categoria explicativa condicional?",
      options: [
        "Porque depende da existência de range de flat call, posição, risco de squeeze e profundidade de stack — e em solvers reais há frequências mistas entre call e 3-bet",
        "Porque em GTO puro todo range de 3-bet é 100% linear em qualquer posição e stack",
        "Porque nunca é permitido dar flat call no botão em torneios MTT",
        "Porque o tamanho da 3-bet é idêntico a 20bb e a 100bb de stack efetivo",
      ],
      correctIndex: 0,
      explanation:
        "A forma do range emerge dos incentivos do spot (posição, jogadores atrás, stack e resposta do vilão), servindo como guia pedagógico para entender as frequências do solver.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_06_a",
        title: "Estudo Vs RFI: 30BB BTN vs CO RFI",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_btn_vs_co_rfi",
        objective: "Observar a distribuição entre Call, 3-Bet e Fold em posição.",
      },
    ],
  },
  {
    spotNumber: 7,
    videoId: "teUFXaRa27E",
    title: "Como dominar a posição mais LUCRATIVA do poker",
    publishedDate: "2026-06-10",
    url: "https://www.youtube.com/watch?v=teUFXaRa27E",
    moduleLabel: "Posição (tema a validar)",
    trackId: "PREFLOP_RFI",
    transcriptStatus: "indisponível",
    hasVerifiedTranscript: false,
    publicSource: "vidIQ metadata only",
    evidenceType: "METADATA_HYPOTHESIS",
    unverifiedWarning:
      "Transcrição indisponível nesta pesquisa (somente título e URL confirmados). Nota: o título publicado no YouTube traz numeração '/20' por discrepância editorial da playlist original. Nenhuma recomendação específica foi atribuída à fala do vídeo sem transcrição verificada.",
    coreConcept:
      "Vantagem posicional no No-Limit Hold'em (tipicamente associada ao Botão / Late Position): agir por último em todas as streets pós-flop maximiza a realização de equidade e a eficiência de captura de potes.",
    summaryOriginal:
      "Somente título confirmado; não afirmar quais decisões/posições são ensinadas sem transcrição.",
    timestamps: [],
    separationOfDomains: {
      educationalConcept:
        "Princípio geral de teoria dos jogos em NLHE (sem atribuição de transcrição a este vídeo): agir depois do oponente em todas as streets permite controlar o tamanho do pote, cobrar draws e realizar mais equidade.",
      exploitativeHeuristic:
        "Pressionar blinds passivos e usar a vantagem de informação em posição para extrair valor fino ou aplicar floats controlados.",
      mathematicalGtoSpec:
        "O EV esperado por posição (BTN sendo a posição de maior ganho líquido fora dos blinds) decorre da soma de EV da árvore completa resolvida.",
    },
    examples: [
      {
        scenarioTitle: "Impacto de Agir por Último (IP vs OOP)",
        tableContext: "Comparação teórica de realização de equidade.",
        didacticAnalysis:
          "Uma mesma mão marginal (ex.: K8s ou Q9s) realiza substancialmente mais equidade no BTN do que fora de posição no SB ou UTG.",
        pitfallToAvoid:
          "Inventar regras ou números supostamente ditos na Aula 07 enquanto a transcrição permanecer indisponível.",
      },
    ],
    quiz: {
      id: "quiz_spot_07",
      question:
        "Qual cuidado de integridade de dados foi adotado para a Aula 07 (teUFXaRa27E)?",
      options: [
        "Sinalizar 'Transcrição Indisponível (Apenas Metadados)' e não atribuir heurísticas específicas à fala do instrutor sem verificação",
        "Simular uma transcrição automática inventando porcentagens de abertura",
        "Excluir a aula do índice de 18 spots da série",
        "Marcar o vídeo como solução oficial de solver verificada",
      ],
      correctIndex: 0,
      explanation:
        "Preservamos os 18 vídeos no catálogo com URL verificável e sinalizamos de forma transparente os 3 vídeos (01, 07 e 08) cuja legenda não estava acessível.",
      evidenceType: "METADATA_HYPOTHESIS",
    },
    exercises: [
      {
        id: "ex_spot_07_a",
        title: "Estudo Posicional: 30BB BTN RFI",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_rfi_btn",
        objective: "Comparar a largura do range no BTN com posições iniciais.",
      },
    ],
  },
  {
    spotNumber: 8,
    videoId: "CUNOCNobeZo",
    title: "O Guia Definitivo do Small Blind",
    publishedDate: "2026-06-11",
    url: "https://www.youtube.com/watch?v=CUNOCNobeZo",
    moduleLabel: "Small Blind",
    trackId: "PREFLOP_SB_VS_BB",
    transcriptStatus: "indisponível",
    hasVerifiedTranscript: false,
    publicSource: "vidIQ metadata only",
    evidenceType: "METADATA_HYPOTHESIS",
    unverifiedWarning:
      "Transcrição indisponível nesta pesquisa (somente título e URL confirmados). Assim como na Aula 07, o título original exibe '/20'. O módulo de Small Blind apoia-se nos conceitos verificados da Aula 10 e nas soluções matemáticas do sistema, sem atribuir falas não verificadas à Aula 08.",
    coreConcept:
      "Estudo da posição de Small Blind (SB): desconto parcial de 0.5bb pré-flop contrabalançado pela desvantagem posicional absoluta (agir primeiro em todas as streets pós-flop).",
    summaryOriginal:
      "Somente título confirmado; preparar módulo SB e validar conteúdo antes de citar instruções específicas.",
    timestamps: [],
    separationOfDomains: {
      educationalConcept:
        "Conceito estrutural do SB (sem atribuição de fala não transcrita à Aula 08): no SB contra open raise, jogar fora de posição sem fechar a ação (BB ainda por agir) exige cautela com flat calls; em blind war (SB vs BB), mistura-se limp, raise e shove conforme o stack.",
      exploitativeHeuristic:
        "Ajustar a agressividade do SB conforme a tendência do BB de aplicar iso-raise contra limps ou foldar excessivamente contra steal.",
      mathematicalGtoSpec:
        "As frequências exatas de SB vs RFI e SB First-In exigem resolução específica para o stack efetivo e estrutura de ante.",
    },
    examples: [
      {
        scenarioTitle: "SB vs Open Raise vs SB First-In",
        tableContext: "MTT 8-Max, 20BB–30BB.",
        didacticAnalysis:
          "Contra um open de MP/CO, o SB ainda tem o BB atrás e jogará OOP o pós-flop inteiro; já quando a mesa roda em fold até o SB, resta apenas o BB.",
        pitfallToAvoid:
          "Citar regras específicas como se fossem transcrição da Aula 08 antes de validar a legenda do vídeo.",
      },
    ],
    quiz: {
      id: "quiz_spot_08",
      question:
        "Qual é a principal assimetria estrutural que define o jogo no Small Blind (SB)?",
      options: [
        "Possui 0.5bb já investido pré-flop, mas agirá fora de posição (primeiro a falar) no flop, turn e river contra qualquer jogador ativo",
        "Sempre age por último no flop, turn e river",
        "Recebe melhores pot odds do que o Big Blind e sempre fecha a ação pré-flop contra um open",
        "Não participa da disputa pelos antes em torneios MTT",
      ],
      correctIndex: 0,
      explanation:
        "Embora tenha investido meio blind, o SB sofre desvantagem posicional em todas as streets pós-flop e ainda tem o BB atrás quando enfrenta um open raise.",
      evidenceType: "METADATA_HYPOTHESIS",
    },
    exercises: [
      {
        id: "ex_spot_08_a",
        title: "Estudo SB: 20BB RFI SB (Limp vs Raise vs All-in vs Fold)",
        recommendedMode: "LEARNING",
        linkedSpotId: "20bb_rfi_sb",
        objective: "Inspecionar a composição de limp, raise e shove no SB com 20BB.",
      },
    ],
  },
  {
    spotNumber: 9,
    videoId: "XFedj2lGVag",
    title: "O ERRO MAIS CARO do poker está no BIG BLIND",
    publishedDate: "2026-06-12",
    url: "https://www.youtube.com/watch?v=XFedj2lGVag",
    moduleLabel: "Defesa BB vs RFI",
    trackId: "PREFLOP_BB_DEFENSE",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "A defesa do Big Blind (BB) é o spot mais frequente de torneios e varia drasticamente conforme a posição do abridor (UTG vs BTN), o tamanho do open, o stack efetivo, a presença de ante e a transição de chipEV para ICM.",
    summaryOriginal:
      "Defesa BB muda com posição do abridor, stack e chipEV/ICM; mãos suited, Axs, 3-bets polarizadas e borda de defesa.",
    timestamps: [
      {
        label: "~03:10",
        seconds: 190,
        urlWithTimestamp: "https://www.youtube.com/watch?v=XFedj2lGVag&t=190s",
        paraphraseNote:
          "Variação da largura de defesa do BB segundo a posição do open raiser, odds oferecidas pelo pote com ante e retenção de equidade das mãos suited e Axs.",
      },
      {
        label: "~07:00",
        seconds: 420,
        urlWithTimestamp: "https://www.youtube.com/watch?v=XFedj2lGVag&t=420s",
        paraphraseNote:
          "Treinamento de decisões na borda de defesa e misturas entre call e 3-bet/all-in conforme o stack efetivo.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "No BB contra um único open (closing the action), o desconto de 1bb mais os antes geram pot odds excelentes (ex.: pagar 1bb para disputar 4.5bb = 22,2% de equidade bruta), mas mãos suited conectadas realizam muito mais equidade OOP do que mãos offsuit desconectadas.",
      exploitativeHeuristic:
        "Se o abridor usa sizing maior que o padrão ou aplica c-bet/double barrel com muita precisão, retrair o fundo offsuit da defesa; se o abridor joga 'one-and-done' pós-flop, defender toda a borda suited.",
      mathematicalGtoSpec:
        "Sob ICM (bolha/FT), o Bubble Factor eleva a equidade mínima necessária além das pot odds em fichas, contraindo tanto os calls marginais quanto os 3-bet shoves de maior variância.",
    },
    examples: [
      {
        scenarioTitle: "BB vs UTG RFI vs BB vs BTN RFI (30BB)",
        tableContext: "MTT 8-Max, 30BB, open 2.0bb, ante 0.125bb (pote total após call = 4.5bb).",
        didacticAnalysis:
          "Apesar das pot odds aritméticas serem idênticas (1.0 / 4.5 = 22.2%), contra UTG o range adversário é tão forte que mãos fracas têm péssima equidade e baixa realização; contra BTN, o range adversário é amplo e a defesa do BB se expande substancialmente.",
        pitfallToAvoid:
          "Defender exatamente o mesmo range contra UTG e contra BTN só porque o tamanho da aposta foi 2bb em ambos.",
      },
    ],
    quiz: {
      id: "quiz_spot_09",
      question:
        "Por que o Big Blind defende muito mais mãos contra um open de 2bb do BTN do que contra um open de 2bb do UTG, mesmo tendo as mesmas pot odds imediatas em fichas?",
      options: [
        "Porque o range do BTN é muito mais amplo, elevando a equidade bruta e a realização de equidade das mãos do BB em comparação ao range forte do UTG",
        "Porque o ante só entra no pote quando o BTN abre",
        "Porque o BB age em posição pós-flop contra o BTN, mas fora de posição contra o UTG",
        "Porque contra o UTG é proibido dar flat call no Big Blind",
      ],
      correctIndex: 0,
      explanation:
        "A decisão no BB depende tanto das pot odds quanto da equidade da nossa mão contra o range do abridor e de quanto dessa equidade realizaremos fora de posição.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_09_a",
        title: "Comparação Prática: 30BB BB vs BTN RFI (Chart Importado)",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_bb_vs_btn_rfi",
        objective: "Praticar a borda de defesa (Call vs 3-Bet vs Fold) no BB contra o BTN com 30BB.",
      },
      {
        id: "ex_spot_09_b",
        title: "Comparação Prática: 20BB BB vs BTN RFI (Chart Importado Sem EV)",
        recommendedMode: "LEARNING",
        linkedSpotId: "20bb_bb_vs_btn_rfi",
        objective: "Comparar Call, 3-Bet All-in e Fold no BB com 20BB na planilha importada (IMPORTED_CHART_NO_EV).",
      },
    ],
  },
  {
    spotNumber: 10,
    videoId: "wcOJ7SiU67A",
    title: "O spot que MAIS CONFUNDE jogadores de poker",
    publishedDate: "2026-06-15",
    url: "https://www.youtube.com/watch?v=wcOJ7SiU67A",
    moduleLabel: "Blind War / SB",
    trackId: "PREFLOP_SB_VS_BB",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Na Guerra de Blinds (SB vs BB), o processo mental eficiente divide a decisão em duas etapas: primeiro definir se a mão entra no pote ou dá fold; depois escolher a linha ótima entre limp, raise e all-in conforme o stack efetivo.",
    summaryOriginal:
      "Treino SB vs BB: decidir primeiro jogar ou foldar, depois escolher limp, raise e shove; larguras de ranges dependem de stacks e da posição.",
    timestamps: [
      {
        label: "~01:20",
        seconds: 80,
        urlWithTimestamp: "https://www.youtube.com/watch?v=wcOJ7SiU67A&t=80s",
        paraphraseNote:
          "Estruturação do raciocínio SB vs BB (eliminar ações inviáveis e escolher entre limp/raise/shove); menção a sizings pessoais (3.5x/3x/2.5x) que são preferências do instrutor e não padrão universal GTO.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Como todos os outros jogadores já foldaram e há 1.5bb + antes no pote, o SB joga uma fração muito alta do baralho, dividindo o range entre limp (protegido com traps de limp-raise/limp-call) e open-raise/shove.",
      exploitativeHeuristic:
        "Sizings fixos sugeridos em aula (como 3.5x em stacks profundos ou 2.5x em stacks menores) funcionam como simplificações práticas de execução humana, mas devem ser adaptados à reação do BB.",
      mathematicalGtoSpec:
        "Os sizings de open do SB (2.5x, 3.0x, 3.5x) não são dogmas universais: a árvore do solver deve parametrizar `SB_FIRST_IN`, `BB_VS_SB_LIMP`, `BB_VS_SB_RAISE` e `SB_VS_ISO`.",
    },
    examples: [
      {
        scenarioTitle: "30BB SB First-In e 30BB BB vs SB Limp",
        tableContext: "MTT 8-Max, 30BB efetivos, pote inicial 2.5bb.",
        didacticAnalysis:
          "O SB não pode colocar todas as mãos fortes apenas no open-raise, caso contrário seu range de limp fica 100% capado e vulnerável a iso-raises constantes do BB.",
        pitfallToAvoid:
          "Tratar o sizing pessoal mencionado pelo instrutor (3.5x/3x/2.5x) como única resposta matematicamente correta em qualquer solver.",
      },
    ],
    quiz: {
      id: "quiz_spot_10",
      question:
        "Por que uma estratégia equilibrada de Small Blind em stacks médios/curtos protege o range de limp incluindo mãos fortes (limp-traps)?",
      options: [
        "Para impedir que o Big Blind aplique iso-raise lucrativamente com altíssima frequência contra um range de limp que seria 100% fraco e capado",
        "Porque em No-Limit Hold'em é proibido dar raise do Small Blind com AA ou KK",
        "Porque o Small Blind sempre fala depois do Big Blind no flop",
        "Porque o limp dobra automaticamente o valor do ante",
      ],
      correctIndex: 0,
      explanation:
        "Se todas as mãos fortes derem open-raise, o range de limp fica desprotegido e o BB pode explorar com iso-raises agressivos em posição.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_10_a",
        title: "Estudo Blind War: 30BB RFI SB",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_rfi_sb",
        objective: "Praticar a escolha entre Limp, Raise e Fold no SB com 30BB.",
      },
      {
        id: "ex_spot_10_b",
        title: "Estudo Blind War: 30BB BB vs SB Limp",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_bb_vs_sb_limp",
        objective: "Treinar a resposta do BB (Raise vs Check) diante do limp do SB.",
      },
    ],
  },
  {
    spotNumber: 11,
    videoId: "rSJlFHUlIQE",
    title: "O que fazer do Big Blind quando tomar uma C-Bet",
    publishedDate: "2026-06-18",
    url: "https://www.youtube.com/watch?v=rSJlFHUlIQE",
    moduleLabel: "Defesa BB vs C-bet",
    trackId: "POSTFLOP_BB_VS_CBET",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Ao defender o BB contra uma C-bet no flop, classifique sua mão por categoria de equidade (par feito, overcards com backdoor, gutshot, OESD, flush draw) e compare check-call, check-raise (valor e semiblefe) e check-fold segundo o sizing enfrentado.",
    summaryOriginal:
      "Classificar par/overs/draws; comparar check-call, check-raise e fold; size do adversário, equity e possibilidade de valor/semiblefe.",
    timestamps: [
      {
        label: "~00:10",
        seconds: 10,
        urlWithTimestamp: "https://www.youtube.com/watch?v=rSJlFHUlIQE&t=10s",
        paraphraseNote:
          "Introdução ao problema de enfrentar a C-bet fora de posição no Big Blind.",
      },
      {
        label: "~01:20",
        seconds: 80,
        urlWithTimestamp: "https://www.youtube.com/watch?v=rSJlFHUlIQE&t=80s",
        paraphraseNote:
          "Categorização de pares, overcards e draws (brocas, pontas, flush draws) para distribuir entre check-call, check-raise e fold.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Contra sizings pequenos (ex.: 1/3 do pote), o BB precisa defender amplamente usando pares, draws diretos e combinações de overcards + backdoor flush/straight draws, reservando dois pares+, trincas e parte dos draws/backdoors para o check-raise.",
      exploitativeHeuristic:
        "Frases didáticas como 'não foldar nenhum draw para bet pequena' servem como atalho de aula contra c-bets automáticas de 1/3, mas não são dogma absoluto contra sizings grandes ou ranges super fortes.",
      mathematicalGtoSpec:
        "A frequência exata de check-raise e check-call varia conforme a textura do flop, a posição do agressor (UTG vs BTN) e o sizing da C-bet.",
    },
    examples: [
      {
        scenarioTitle: "Defesa em Flop Conectado 8s 7s 5d vs Flop Seco Ah Kd 7c",
        tableContext: "BB vs BTN C-bet 33% (pote 5.5bb, aposta 1.8bb).",
        didacticAnalysis:
          "Em 8s 7s 5d, o BB possui grande densidade de dois pares, sequências e combos de par + draw, sustentando alta frequência de check-raise. Em Ah Kd 7c, o range do BB está em severa desvantagem de nuts e defende predominantemente em check-call e mais folds.",
        pitfallToAvoid:
          "Aplicar o mesmo percentual de check-raise em qualquer textura ou tratar 'nunca foldar draw' como lei inviolável contra apostas de 75%–100% do pote.",
      },
    ],
    quiz: {
      id: "quiz_spot_11",
      question:
        "Ao enfrentar uma C-bet pequena (ex.: 33% do pote) no Big Blind (Aula 11, ~01:20), como o range de check-raise deve ser construído?",
      options: [
        "Combinando mãos de valor forte (dois pares, trincas, top pairs fortes dependendo da textura) com semiblefes selecionados (draws e combos com backdoors/blockers)",
        "Apenas com trincas e sequências prontas, sem nenhum semiblefe",
        "Fazendo check-raise com 100% dos pares baixos e dando fold em todos os flush draws",
        "Baseando-se unicamente na fórmula do MDF sem olhar para a textura do board",
      ],
      correctIndex: 0,
      explanation:
        "Um range de check-raise saudável equilibra mãos de valor que querem construir pote e proteger equidade com semiblefes que possuem equidade/backdoors caso recebam call.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_11_a",
        title: "Estudo Conceitual (UNSOLVED): BB vs C-Bet em 8s 7s 5d",
        recommendedMode: "LEARNING",
        linkedSpotId: "unsolved_bb_vs_cbet_flop_v1",
        objective: "Analisar categorias de mãos, MDF e pot odds na defesa do BB contra C-bet (sem frequências inventadas).",
      },
    ],
  },
  {
    spotNumber: 12,
    videoId: "3rQpUIKUUgc",
    title: "O erro silencioso dos potes MULTIWAY",
    publishedDate: "2026-06-19",
    url: "https://www.youtube.com/watch?v=3rQpUIKUUgc",
    moduleLabel: "Multiway pré-flop/BB",
    trackId: "PREFLOP_BB_DEFENSE",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Quando há um abridor e um ou mais callers antes do Big Blind (pote multiway), as pot odds brutas melhoram, mas a realização de equidade cai drasticamente para mãos offsuit dominadas; valorizam-se mãos suited/conectadas que fazem nuts e oportunidades de squeeze.",
    summaryOriginal:
      "Defesa BB contra abertura e caller, realização de equidade, odds, squeeze e diferenças entre posição final e inicial.",
    timestamps: [
      {
        label: "~01:20",
        seconds: 80,
        urlWithTimestamp: "https://www.youtube.com/watch?v=3rQpUIKUUgc&t=80s",
        paraphraseNote:
          "Contraste entre pot odds atrativas no BB contra raise + call e a perda severa de realização de equidade em potes com múltiplos jogadores.",
      },
      {
        label: "~12:00",
        seconds: 720,
        urlWithTimestamp: "https://www.youtube.com/watch?v=3rQpUIKUUgc&t=720s",
        paraphraseNote:
          "Diferença entre enfrentar abridor/caller de posições iniciais versus posições finais e seleção de mãos para squeeze vs call.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Em potes multiway (3+ jogadores), top pair com kicker médio/fraco perde muito valor porque a probabilidade de alguém ter dois pares, trinca ou top pair superior cresce; mãos suited conectadas e pares pequenos ganham visibilidade por buscarem mãos fortes multiway, enquanto o topo e bloqueadores selecionados executam o squeeze.",
      exploitativeHeuristic:
        "Aplicar squeeze mais frequente contra um abridor de late position e um caller passivo que capou o próprio range ao apenas pagar.",
      mathematicalGtoSpec:
        "Fórmulas e soluções heads-up NÃO se aplicam diretamente a potes multiway: o cálculo multiway exige motor/solver com múltiplos agentes ativos e controle rigoroso de side pots.",
    },
    examples: [
      {
        scenarioTitle: "BB diante de Open 2bb + Call 2bb (Pote Multiway)",
        tableContext: "MTT 8-Max, 30BB, CO abre 2bb, BTN paga 2bb, ação no BB.",
        didacticAnalysis:
          "O BB paga 1bb para disputar um pote de 6.5bb (15,4% de pot odds brutas), mas mãos offsuit desconectadas (ex.: K7o, Q8o) sofrem dominação dupla contra dois ranges e realizam muito menos que 15%.",
        pitfallToAvoid:
          "Usar a tabela de defesa heads-up do BB ou aplicar MDF de 2 jogadores em um pote com 3 jogadores.",
      },
    ],
    quiz: {
      id: "quiz_spot_12",
      question:
        "Qual é o 'erro silencioso' mais comum ao defender o Big Blind contra um open raise seguido de um flat call (Aula 12, ~01:20)?",
      options: [
        "Olhar apenas para as pot odds brutas melhores e pagar com mãos offsuit fracas/dominadas que têm péssima realização de equidade em potes multiway",
        "Dar squeeze com AA e KK quando há fichas mortas no pote",
        "Preferir mãos suited conectadas e pares que conseguem acertar mãos fortes contra múltiplos vilões",
        "Considerar as posições originais do abridor e do caller antes de decidir",
      ],
      correctIndex: 0,
      explanation:
        "Em potes multiway, a necessidade de fazer uma mão realmente forte no showdown reduz o valor de cartas altas offsuit dominadas e valoriza conectividade suited e squeezes bem estruturados.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_12_a",
        title: "Estudo Comparativo: Defesa do BB vs CO RFI (30BB)",
        recommendedMode: "LEARNING",
        linkedSpotId: "30bb_bb_vs_co_rfi",
        objective: "Comparar as mãos suited vs offsuit na borda de defesa do BB.",
      },
    ],
  },
  {
    spotNumber: 13,
    videoId: "qGBrI6k9JDg",
    title: "Um erro aqui custa CARO",
    publishedDate: "2026-06-20",
    url: "https://www.youtube.com/watch?v=qGBrI6k9JDg",
    moduleLabel: "Resposta a 3-bet",
    trackId: "PREFLOP_VS_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Quando você dá open raise e sofre uma 3-bet (especialmente ficando fora de posição), o pote cresce com SPR reduzido: combos offsuit perdem jogabilidade e sofrem dominação, enquanto suiteds bem conectados, pares e 4-bets/shoves com bloqueadores compõem a defesa.",
    summaryOriginal:
      "Defender contra 3-bet fora de posição, jogabilidade suited, pares, 4-bet, shove; distinguir middle position e late position.",
    timestamps: [
      {
        label: "~00:45",
        seconds: 45,
        urlWithTimestamp: "https://www.youtube.com/watch?v=qGBrI6k9JDg&t=45s",
        paraphraseNote:
          "Impacto de defender contra 3-bet fora de posição: piora acentuada de combos offsuit, papel dos suiteds/pares e distinção entre posições intermediárias e finais.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Sofrer 3-bet fora de posição (ex.: CO abre e BTN dá 3-bet) reduz a realização de equidade: mãos como AJo/KQo tornam-se armadilhas caras como call OOP, enquanto AQs/KQs/JTs e pares médios retêm melhor equidade e A5s/AK/QQ+ ancoram as 4-bets.",
      exploitativeHeuristic:
        "Contra jogadores recreativos cuja 3-bet é 100% topo de valor (QQ+, AK), foldar disciplinadamente todas as mãos médias e blefes de 4-bet.",
      mathematicalGtoSpec:
        "A subárvore `RFI -> 3BET -> 4BET / CALL / FOLD` depende do sizing exato da 3-bet, do SPR resultante e da largura do RFI original.",
    },
    examples: [
      {
        scenarioTitle: "AJo vs ATs diante de 3-Bet em Posição",
        tableContext: "MTT 8-Max, 40BB–50BB, Herói abre CO, BTN aplica 3-bet.",
        didacticAnalysis:
          "ATs possui conectividade, flush draw nut e realiza equidade muito melhor em pote 3-betado OOP do que AJo, que frequentemente está dominado por AK/AQ no range de 3-bet.",
        pitfallToAvoid:
          "Pagar 3-bet fora de posição com broadways offsuit (KJo, QJo, ATo) só porque você já abriu a mão.",
      },
    ],
    quiz: {
      id: "quiz_spot_13",
      question:
        "Ao abrir de posição intermediária/final e enfrentar uma 3-bet de um jogador em posição (Aula 13, ~00:45), que grupo de mãos sofre a maior perda de desempenho como flat call fora de posição?",
      options: [
        "Combos offsuit médios/altos vulneráveis à dominação (como ATo, KJo, QJo), que realizam mal a equidade fora de posição contra um range filtrado",
        "Pares premium como AA e KK",
        "Combos suited conectados de topo como AKs e AQs",
        "Qualquer mão suited, pois naipes nunca importam em potes 3-betados",
      ],
      correctIndex: 0,
      explanation:
        "Fora de posição com SPR menor e contra um range forte de 3-bet, mãos offsuit sem conectividade extra sofrem dominação severa e baixa realização de equidade.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_13_a",
        title: "Estudo de Ranges de 3-Bet: 50BB BTN vs CO RFI",
        recommendedMode: "LEARNING",
        linkedSpotId: "50bb_btn_vs_co_rfi",
        objective: "Visualizar com quais mãos o BTN pressiona o CO em 50BB.",
      },
    ],
  },
  {
    spotNumber: 14,
    videoId: "LWmqhJqCIcw",
    title: "O maior LUCRO do poker vem DAQUI",
    publishedDate: "2026-06-24",
    url: "https://www.youtube.com/watch?v=LWmqhJqCIcw",
    moduleLabel: "Vs C-bet em posição",
    trackId: "POSTFLOP_BB_VS_CBET",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Defender contra a C-bet estando EM POSIÇÃO (após pagar um open pré-flop no BTN/CO) permite realizar muito mais equidade do que no BB: o tamanho da aposta, a força relativa da mão e os backdoors determinam as frequências de fold, call e raise.",
    summaryOriginal:
      "Drill de defesa a C-bet IP; tamanho da aposta, força relativa, backdoors e frequências fold/call/raise; estado pré-flop já determinado.",
    timestamps: [
      {
        label: "~00:20",
        seconds: 20,
        urlWithTimestamp: "https://www.youtube.com/watch?v=LWmqhJqCIcw&t=20s",
        paraphraseNote:
          "Explicação de que um drill pós-flop parte de um estado e histórico pré-flop já definidos na árvore, avaliando a decisão condicional naquele nó.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Qualquer nó pós-flop em uma árvore de jogo é condicional ao histórico pré-flop definido nas premissas (`preflop_history`); estar em posição aumenta o lucro dos calls com pares médios, floats com backdoors e raises por valor/semiblefe.",
      exploitativeHeuristic:
        "Quando o agressor fora de posição dá c-bet grande apenas com valor e c-bet pequena com range fraco (sizing tell), atacar o sizing pequeno com floats e raises em posição.",
      mathematicalGtoSpec:
        "O motor deve instanciar cenários condicionais registrando explicitamente as premissas do histórico pré-flop (`assumptions`), sem exigir que a trajetória anterior seja a preferência pessoal do usuário.",
    },
    examples: [
      {
        scenarioTitle: "Defesa IP vs C-Bet (Nó Condicional Pós-Flop)",
        tableContext: "CO abriu 2bb, BTN pagou, blinds foldaram -> Flop 5.5bb, CO faz C-bet.",
        didacticAnalysis:
          "Mesmo que em algum stack você preferisse 3-betar parte de um combo pré-flop, se o combo chega ao flop na linha de flat call com frequência > 0, a decisão pós-flop deve ser avaliada a partir dos ranges reais que atingem aquele flop.",
        pitfallToAvoid:
          "Recusar-se a estudar o nó pós-flop dizendo 'eu nunca daria call pré-flop com essa mão' quando ela faz parte do range condicional do cenário.",
      },
    ],
    quiz: {
      id: "quiz_spot_14",
      question:
        "Segundo a Aula 14 (~00:20), como um treinador técnico deve tratar um cenário pós-flop cuja ação pré-flop já foi pré-determinada?",
      options: [
        "Instanciar o nó condicional registrando explicitamente o histórico pré-flop e os ranges que chegam ao flop, avaliando a melhor decisão a partir daquele estado",
        "Ignorar o histórico pré-flop e supor que ambos os jogadores têm 100% das 169 mãos no flop",
        "Cancelar o exercício se o usuário preferisse outra ação pré-flop",
        "Usar as mesmas frequências de defesa fora de posição do Big Blind",
      ],
      correctIndex: 0,
      explanation:
        "Em teoria dos jogos sequenciais, cada subjogo pós-flop é resolvido condicionalmente aos ranges que percorreram o ramo pré-flop especificado.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_14_a",
        title: "Estudo Pós-Flop em Posição: Flop Ah Kd 7c",
        recommendedMode: "LEARNING",
        linkedSpotId: "didactic_flop_cbet_btn_vs_bb_v1",
        objective: "Analisar o impacto da posição e dos backdoors na árvore de flop.",
      },
    ],
  },
  {
    spotNumber: 15,
    videoId: "7DQn3EMEwCA",
    title: "Como ajustar seus ranges para torneios PKOs",
    publishedDate: "2026-06-25",
    url: "https://www.youtube.com/watch?v=7DQn3EMEwCA",
    moduleLabel: "PKO RFI",
    trackId: "PREFLOP_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Em torneios PKO (Progressive Knockout), o range de RFI não depende apenas da posição e do stack efetivo: ele varia conforme quantos jogadores à esquerda o herói cobre, o tamanho dos bounties em jogo e a capacidade de pagar 3-bet shoves.",
    summaryOriginal:
      "RFI PKO varia conforme jogadores cobertos à esquerda, bounties e capacidade de defender 3-bets; não confundir com ranges Vanilla.",
    timestamps: [
      {
        label: "~00:15",
        seconds: 15,
        urlWithTimestamp: "https://www.youtube.com/watch?v=7DQn3EMEwCA&t=15s",
        paraphraseNote:
          "Explicação direta de que em PKO os ranges de abertura mudam conforme quem está à esquerda e quem cobre quem na mesa.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Quando o herói cobre a maioria dos jogadores por agir à sua esquerda, o valor extra de disputar os bounties deles aumenta o EV de abrir mais mãos que suportam all-in; quando o herói é coberto por stacks maiores atrás, ele próprio vira alvo de caça a bounties e precisa contrair aberturas marginais.",
      exploitativeHeuristic:
        "Em fields recreativos de PKO onde stacks grandes pagam all-ins com mãos muito fracas para tentar ganhar qualquer bounty, valorizar mãos de alta carta/pares que dominam o range de gamble.",
      mathematicalGtoSpec:
        "Um estado de PKO exige o vetor completo da mesa (`stack_per_seat`, `bounty_per_seat`, `bounty_type`, `payout_structure`). É proibido usar charts Vanilla ou ICM padrão como se fossem GTO para PKO.",
    },
    examples: [
      {
        scenarioTitle: "Herói 45BB Cobrindo a Mesa vs Herói 22BB Coberto por Todos",
        tableContext: "MTT PKO 8-Max, ação no CO.",
        didacticAnalysis:
          "Com 45BB cobrindo BTN (18BB), SB (15BB) e BB (20BB), o CO pode abrir mais largo e dar call lucrativo em re-shoves graças ao Bounty Power. Com 22BB sendo coberto por BTN (60BB) e BB (55BB), o CO sofrerá 3-bets e shoves mais largos e deve abrir mais seletivo.",
        pitfallToAvoid:
          "Usar a mesma tabela estática de RFI para ambos os cenários ou aplicar Malmuth-Harville puro ignorando bounties.",
      },
    ],
    quiz: {
      id: "quiz_spot_15",
      question:
        "De acordo com a Aula 15 (~00:15), qual variável adicional é indispensável para determinar o range de RFI em um torneio PKO?",
      options: [
        "O vetor de stacks e bounties dos jogadores que ainda vão agir à esquerda (quantos oponentes o herói cobre versus quantos cobrem o herói)",
        "Apenas o stack do próprio herói, exatamente igual a um torneio Vanilla chipEV",
        "Somente o prêmio de 1º lugar sem olhar para os bounties",
        "O histórico de mãos de Cash Game 100bb com rake de 5%",
      ],
      correctIndex: 0,
      explanation:
        "Em PKO, cobrir os jogadores à esquerda adiciona equidade monetária de bounty ao pote, enquanto ser coberto por eles aumenta o risco de sofrer 3-bet/shove.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_15_a",
        title: "Estudo Conceitual PKO (UNSOLVED): Cobertura de Bounty",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_pko_8max_25bb_btn_vs_sb_shove_v1",
        objective: "Compreender por que um estado PKO exige vetor completo de bounties e não possui solução Vanilla equivalente.",
      },
    ],
  },
  {
    spotNumber: 16,
    videoId: "uHVh5p-KGeI",
    title: "Como ajustar seus OPEN RAISES em torneios Vanilla",
    publishedDate: "2026-06-26",
    url: "https://www.youtube.com/watch?v=uHVh5p-KGeI",
    moduleLabel: "Vanilla RFI / ICM",
    trackId: "PREFLOP_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Em torneios Vanilla (sem bounty), cobrir os jogadores à esquerda NÃO gera prêmio imediato em dinheiro por eliminação; sob pressão de ICM (bolha, pré-FT, FT), o Risk Premium faz com que perder fichas custe mais $EV do que ganhar a mesma quantidade de fichas.",
    summaryOriginal:
      "Vanilla com pressão de ICM; cobertura sem bounty não traz mesmo incentivo de jogar mais loose do PKO; comparar etapas e stacks.",
    timestamps: [
      {
        label: "~02:00",
        seconds: 120,
        urlWithTimestamp: "https://www.youtube.com/watch?v=uHVh5p-KGeI&t=120s",
        paraphraseNote:
          "Contraste direto entre PKO e Vanilla: no Vanilla não há recompensa direta de bounty ao eliminar um short stack.",
      },
      {
        label: "~07:15",
        seconds: 435,
        urlWithTimestamp: "https://www.youtube.com/watch?v=uHVh5p-KGeI&t=435s",
        paraphraseNote:
          "Como a pressão de ICM altera os ranges de open raise e a capacidade de pagar re-shoves dependendo da distribuição de stacks.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Em torneios Vanilla sob ICM, um stack médio enfrenta alto Bubble Factor contra stacks maiores e precisa evitar colisões marginais contra re-shoves, enquanto o chip leader usa a pressão de eliminação para roubar blinds de stacks médios.",
      exploitativeHeuristic:
        "Pressionar stacks médios que estão visivelmente 'travados' esperando payjumps na bolha ou na mesa final.",
      mathematicalGtoSpec:
        "Comparar o mesmo estado de mesa em `CHIP_EV`, `VANILLA_ICM` ($EV via Malmuth-Harville/solver ICM) e `PKO` demonstra matematicamente como o `risk_premium` altera as frequências.",
    },
    examples: [
      {
        scenarioTitle: "Mesma Mesa em ChipEV vs Vanilla ICM vs PKO",
        tableContext: "Herói CO com 25BB: em PKO cobre 2 shorts; em Vanilla ICM há 2 shorts de 6BB na bolha da FT.",
        didacticAnalysis:
          "Em PKO, cobrir os shorts incentiva disputar potes contra eles. Em Vanilla ICM com 2 shorts de 6BB prestes a cair, colidir o stack de 25BB contra o CL de 60BB tem um Bubble Factor altíssimo, contraindo o range de open/call.",
        pitfallToAvoid:
          "Jogar torneio Vanilla como se ganhasse bounty por eliminar oponentes ou jogar PKO com medo excessivo de ICM no início do torneio.",
      },
    ],
    quiz: {
      id: "quiz_spot_16",
      question:
        "Por que cobrir os jogadores à esquerda em um torneio Vanilla com ICM (Aula 16, ~02:00) não produz o mesmo ajuste de abrir mais mãos para pagar all-in visto no PKO?",
      options: [
        "Porque no Vanilla não existe prêmio imediato de bounty pela eliminação e, sob ICM, as fichas perdidas em um all-in valem mais em $EV do que as fichas ganhas",
        "Porque em torneios Vanilla é proibido eliminar outros jogadores antes do heads-up",
        "Porque em Vanilla o Bubble Factor é sempre menor que 0.5",
        "Porque em Vanilla todas as mãos têm exatamente 50% de equidade",
      ],
      correctIndex: 0,
      explanation:
        "Sem bounty imediato, eliminar um oponente em Vanilla só beneficia indiretamente via payjump compartilhado com toda a mesa, enquanto a concavidade do ICM penaliza severamente a perda de fichas.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_16_a",
        title: "Estudo Conceitual ICM (UNSOLVED): Pressão de Bolha e Mesa Final",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_icm_ft_6max_20bb_sb_vs_btn_v1",
        objective: "Estudar o impacto de Bubble Factor e Risk Premium sem inventar matrizes de solver ICM.",
      },
    ],
  },
  {
    spotNumber: 17,
    videoId: "gH3KxLljdts",
    title: "Como enfrentar open raises em PKOs",
    publishedDate: "2026-06-27",
    url: "https://www.youtube.com/watch?v=gH3KxLljdts",
    moduleLabel: "PKO vs RFI",
    trackId: "PREFLOP_VS_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "Ao enfrentar um open raise em PKO, sua reação (flat call, 3-bet, re-shove ou fold) depende de três relações de cobertura: (1) se você cobre o abridor, (2) como o range do abridor mudou pela cobertura dele sobre a mesa, e (3) quem ainda falta agir atrás de você.",
    summaryOriginal:
      "Responder ao open considerando stack do abridor e dos demais, quem cobre quem e incentives de bounty; expandir e contrair a defesa.",
    timestamps: [
      {
        label: "~00:15",
        seconds: 15,
        urlWithTimestamp: "https://www.youtube.com/watch?v=gH3KxLljdts&t=15s",
        paraphraseNote:
          "Avaliação de quem cobre quem ao reagir a um open raise em torneio PKO.",
      },
      {
        label: "~02:00",
        seconds: 120,
        urlWithTimestamp: "https://www.youtube.com/watch?v=gH3KxLljdts&t=120s",
        paraphraseNote:
          "Como um abridor coberto por toda a mesa tende a abrir mais tight, enquanto um abridor que cobre a mesa abre mais wide — e o impacto dos jogadores restantes atrás.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Se o abridor é coberto por todos, o range de RFI dele já é mais forte; se você também não o cobre, não há bounty em disputa para você. Por outro lado, quando você cobre um abridor de stack curto/médio e tem bounty relevante em jogo, as odds efetivas melhoram para 3-bet/isolamento e calls.",
      exploitativeHeuristic:
        "Isolar (3-bet/shove) quando você cobre um short stack com bounty alto e os jogadores atrás de você têm stacks menores que o seu, desencorajando a entrada deles.",
      mathematicalGtoSpec:
        "A defesa vs RFI em PKO requer parametrizar `covered_by_hero`, `hero_covered_by`, `players_behind` e `bounty`; jamais reutilizar charts Vanilla.",
    },
    examples: [
      {
        scenarioTitle: "Enfrentar Open de Jogador Coberto vs Jogador que Cobre Você",
        tableContext: "MTT PKO, MP (16BB, bounty grande) abre 2bb; Herói no BTN tem 35BB.",
        didacticAnalysis:
          "O Herói cobre o MP e disputa o bounty dele; além disso, aplicar 3-bet/isolamento no BTN força SB e BB a enfrentarem um stack de 35BB caso queiram disputar o bounty.",
        pitfallToAvoid:
          "Dar flat call passivo com mãos vulneráveis quando há stacks grandes nos blinds prontos para aplicar squeeze visando tanto o bounty do abridor quanto o seu.",
      },
    ],
    quiz: {
      id: "quiz_spot_17",
      question:
        "Na Aula 17 (~02:00), como a relação de cobertura do próprio ABRIDOR afeta a leitura do range dele em um PKO?",
      options: [
        "Um abridor coberto por todos na mesa tende a abrir um range mais forte (tight), enquanto um abridor que cobre toda a mesa tem incentivo para abrir mais amplo (wide)",
        "Um abridor coberto por todos abre 100% das mãos porque não tem nada a perder",
        "A cobertura não altera o range de quem abre, apenas de quem está no Big Blind",
        "Em PKO todos os jogadores abrem exatamente os mesmos ranges de Cash Game",
      ],
      correctIndex: 0,
      explanation:
        "Quem é coberto por todos sabe que sofrerá mais calls e 3-bets pela caça ao seu bounty, precisando abrir um range mais sólido; já o chip leader pode abrir mais amplo.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_17_a",
        title: "Estudo Conceitual PKO (UNSOLVED): Resposta a Agressão com Bounty",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_pko_8max_25bb_btn_vs_sb_shove_v1",
        objective: "Analisar a equidade necessária com e sem cobertura de bounty usando a calculadora auxiliar.",
      },
    ],
  },
  {
    spotNumber: 18,
    videoId: "hE4XL3gMEls",
    title: "O Erro de ICM Que Está Custando Seu Lucro",
    publishedDate: "2026-06-28",
    url: "https://www.youtube.com/watch?v=hE4XL3gMEls",
    moduleLabel: "ICM / vs RFI",
    trackId: "PREFLOP_VS_RFI",
    transcriptStatus: "analisada",
    hasVerifiedTranscript: true,
    publicSource: "vidIQ transcript",
    evidenceType: "VIDEO_CONCEPT",
    unverifiedWarning: null,
    coreConcept:
      "O efeito do ICM não existe apenas na bolha estrita ou na mesa final: ele já atua em estágios intermediários do torneio (ex.: 50% do field restante). Além disso, em soluções de equilíbrio sob ICM, mãos em estratégia mista (ex.: 71% call / 29% raise em um spot específico) possuem EV quase idêntico entre as ações misturadas.",
    summaryOriginal:
      "Diferença chipEV vs situação 50% left; exemplos de mistura 71% call/29% raise com EV aproximado igual num spot particular; teoria como base.",
    timestamps: [
      {
        label: "~01:20",
        seconds: 80,
        urlWithTimestamp: "https://www.youtube.com/watch?v=hE4XL3gMEls&t=80s",
        paraphraseNote:
          "Demonstração de que o ICM já modifica decisões muito antes da mesa final (ex.: com 50% do field restante).",
      },
      {
        label: "~02:40",
        seconds: 160,
        urlWithTimestamp: "https://www.youtube.com/watch?v=hE4XL3gMEls&t=160s",
        paraphraseNote:
          "Exemplo ilustrativo de solução mista (~71% call / ~29% raise) com EV praticamente igual entre as duas opções naquele spot específico.",
      },
    ],
    separationOfDomains: {
      educationalConcept:
        "Em uma estratégia mista verdadeira no equilíbrio de Nash, todas as ações jogadas com frequência positiva têm o mesmo EV (`EV_loss ≈ 0`). Escolher a ação de 29% em vez da ação de 71% em uma mão única NÃO é um erro de EV; o que importa é a perda de EV (`EV_loss`) e a calibração das frequências ao longo de uma amostra.",
      exploitativeHeuristic:
        "Quando duas ações têm EV idêntico no solver (indiferença no equilíbrio), o jogador humano pode desempatar a favor da linha que melhor explora a tendência específica do vilão.",
      mathematicalGtoSpec:
        "O exemplo '71% call / 29% raise' pertence exclusivamente ao spot lido na aula e NÃO deve ser importado como regra universal. O treinador deve exibir `freq_by_action`, `EV_by_action`, `ev_unit: '$EV'`, `assumptions_hash` e `ICM_stage`.",
    },
    examples: [
      {
        scenarioTitle: "Indiferença em Estratégia Mista (71% Call / 29% Raise)",
        tableContext: "Spot ICM com duas ações ativas no equilíbrio.",
        didacticAnalysis:
          "Se `EV(Call) = +$1.82` e `EV(Raise) = +$1.82` enquanto `EV(Fold) = $0.00`, tanto Call quanto Raise têm `EV_loss = $0.00`. Um bom treinador jamais pune a escolha de 29% como 'erro grave', distinguindo claramente 'menor frequência no mix' de 'erro real de EV'.",
        pitfallToAvoid:
          "Decorar '71% call / 29% raise' como número mágico aplicável a qualquer mão ou punir o aluno em 100% quando ele escolhe a ação secundária de um mix indiferente.",
      },
    ],
    quiz: {
      id: "quiz_spot_18",
      question:
        "Na Aula 18 (~02:40), o instrutor mostra um spot específico onde uma mão divide ~71% Call e ~29% Raise com EV praticamente idêntico. Como o avaliador do GTO Trainer deve julgar essa situação?",
      options: [
        "Ambas as ações do mix têm EV loss próximo de zero em uma decisão individual; distingue-se uma opção de menor frequência de um erro real de EV, e nunca se aplica o '71/29' como regra genérica fora daquele spot",
        "Considerar a ação de 29% como um erro grave que zera a pontuação do aluno",
        "Aplicar 71% Call e 29% Raise para todas as 169 mãos do baralho em qualquer torneio",
        "Ignorar o ICM até restarem exatamente 3 jogadores no torneio",
      ],
      correctIndex: 0,
      explanation:
        "Pelo princípio da indiferença nas estratégias mistas em equilíbrio, ações com frequência positiva possuem EV equivalente; o erro real consiste em escolher uma ação com 0% de frequência e EV inferior.",
      evidenceType: "VIDEO_CONCEPT",
    },
    exercises: [
      {
        id: "ex_spot_18_a",
        title: "Estudo Conceitual ICM (UNSOLVED): Estratégia Mista e Indiferença",
        recommendedMode: "LEARNING",
        linkedSpotId: "verified_icm_50pct_field_30bb_co_vs_mp_v1",
        objective: "Compreender por que ações mistas em equilíbrio possuem Δ$EV ≈ 0 sem extrapolar o exemplo 71/29 da aula.",
      },
    ],
  },
];

export const REGLIFE_SUPPLEMENTAL_VIDEOS: readonly RegLifeSupplementalVideo[] = [
  {
    videoId: "OhSfmpjRgg8",
    title: "O robô que venceu os melhores do mundo nunca tentou EXPLORAR ninguém",
    url: "https://www.youtube.com/watch?v=OhSfmpjRgg8",
    transcriptStatus: "analisada",
    summaryOriginal:
      "GTO como base, cautela com exploits sem amostras; menção a Libratus e Pluribus; a descrição do robô é argumento do apresentador, não validação independente.",
    timestamps: [
      {
        label: "~02:20",
        seconds: 140,
        urlWithTimestamp: "https://www.youtube.com/watch?v=OhSfmpjRgg8&t=140s",
        paraphraseNote:
          "Argumento pedagógico de consolidar a própria estratégia base antes de tentar explorar tendências sem amostra.",
      },
    ],
    softwareTranslation:
      "Priorizar o diagnóstico de 'Meus Leaks contra a Linha Base' antes de sugerir desvios explorativos, exigindo amostra mínima para qualquer exploit.",
    epistemicCaveat:
      "A interpretação histórica sobre Libratus/Pluribus é um argumento retórico do apresentador na aula, não uma prova acadêmica de que agentes de IA jamais ajustem subjogos.",
  },
  {
    videoId: "7BSZPyqKUHI",
    title: "O jeito CERTO de BLEFAR no POKER",
    url: "https://www.youtube.com/watch?v=7BSZPyqKUHI",
    transcriptStatus: "analisada",
    summaryOriginal:
      "MDF em heads-up river simplificado e frequência ótima de blefe segundo sizing; distinguir pot odds, MDF e composição do range de aposta.",
    timestamps: [
      {
        label: "~01:05",
        seconds: 65,
        urlWithTimestamp: "https://www.youtube.com/watch?v=7BSZPyqKUHI&t=65s",
        paraphraseNote: "Introdução ao conceito de frequência mínima de defesa (MDF) contra blefes.",
      },
      {
        label: "~03:10",
        seconds: 190,
        urlWithTimestamp: "https://www.youtube.com/watch?v=7BSZPyqKUHI&t=190s",
        paraphraseNote:
          "Relação entre tamanho da aposta, pot odds do defensor e proporção ótima de blefes no river.",
      },
    ],
    softwareTranslation:
      "Calculadora interativa que exibe simultaneamente `Pot Odds = B/(P+2B)`, `Fold Equity Breakeven = B/(P+B)`, `MDF = P/(P+B)` e `Fração Polarizada de Blefe no River = B/(P+2B)` com todas as ressalvas explícitas.",
    epistemicCaveat:
      "As fórmulas de MDF e fração polarizada aplicam-se ao jogo estático de river heads-up sem rake; não usar sem ressalvas no flop/turn ou sob ICM.",
  },
  {
    videoId: "zzviYVuIk5o",
    title: "Você está ERRANDO no PKO",
    url: "https://www.youtube.com/watch?v=zzviYVuIk5o",
    transcriptStatus: "analisada",
    summaryOriginal:
      "Incentivos de bounty, cobertura, risco de ser eliminado e diferença entre início e final do torneio; valores heurísticos de conversão de bounty não são soluções universais.",
    timestamps: [
      {
        label: "~00:10",
        seconds: 10,
        urlWithTimestamp: "https://www.youtube.com/watch?v=zzviYVuIk5o&t=10s",
        paraphraseNote:
          "Discussão sobre cobertura de stacks, valor de continuar vivo no torneio e variação do poder de compra do bounty entre o início e a fase final.",
      },
    ],
    softwareTranslation:
      "Separar o simulador heurístico de Bounty Power (`bountyChipFactor` ajustável por estágio do torneio) das soluções completas de solver PKO.",
    epistemicCaveat:
      "Fatores de conversão de bounty em fichas (ex.: 0.33 a 0.50 do starting stack) são aproximações didáticas e não substituem um solver PKO multi-way com ICM.",
  },
  {
    videoId: "bsBVa-tQE7g",
    title: "2 softwares de POKER que você PRECISA usar",
    url: "https://www.youtube.com/watch?v=bsBVa-tQE7g",
    transcriptStatus: "analisada",
    summaryOriginal:
      "Palestrante cita Holdem Resources Calculator/HRC para pré-flop e multiway e GTO Wizard para pós-flop heads-up; são menções, não licença de integração.",
    timestamps: [],
    softwareTranslation:
      "Arquitetura de adaptador desacoplado (`SolverAdapter`) distinguindo motores pré-flop/ICM/PKO de motores pós-flop heads-up.",
    epistemicCaveat:
      "Menções em vídeo não concedem licença comercial nem acesso a bancos proprietários de terceiros.",
  },
  {
    videoId: "0KWMp6iTIBU",
    title: "Do open raise ao ICM: por que jogar pela glória custa dinheiro",
    url: "https://www.youtube.com/watch?v=0KWMp6iTIBU",
    transcriptStatus: "analisada",
    summaryOriginal:
      "Decisões como maximização de EV/$EV em vez de priorizar colocação; módulo de custo de erro sob ICM.",
    timestamps: [
      {
        label: "~00:15",
        seconds: 15,
        urlWithTimestamp: "https://www.youtube.com/watch?v=0KWMp6iTIBU&t=15s",
        paraphraseNote:
          "Foco em maximizar o retorno financeiro esperado ($EV) na estrutura de premiação em vez de buscar acumular fichas a qualquer custo ('jogar pela cravada').",
      },
    ],
    softwareTranslation:
      "Exibição de `$EV`, `Bubble Factor` e perda financeira esperada (`Δ$EV`) em cenários de mesa final e bolha.",
    epistemicCaveat:
      "Exige estrutura de payouts explícita e unidade `$EV` estritamente separada de `bbEV`.",
  },
  {
    videoId: "jYlP-mJcjUg",
    title: "RTA, IA e trapaceiros: O futuro do poker online",
    url: "https://www.youtube.com/watch?v=jYlP-mJcjUg",
    transcriptStatus: "analisada",
    summaryOriginal:
      "Distinguir estudo legítimo de RTA/assistência em tempo real; o software proposto deve impedir uso assistivo em mesas ativas.",
    timestamps: [
      {
        label: "~00:15",
        seconds: 15,
        urlWithTimestamp: "https://www.youtube.com/watch?v=jYlP-mJcjUg&t=15s",
        paraphraseNote:
          "Definição de RTA (Real-Time Assistance) e por que ferramentas éticas devem operar exclusivamente fora das mesas em tempo de estudo/revisão.",
      },
    ],
    softwareTranslation:
      "Política anti-RTA rigorosa: nenhum HUD, nenhuma captura automática de tela de clientes de poker, uso 100% voltado a estudo offline e revisão pós-sessão.",
    epistemicCaveat:
      "Regra ética e de conformidade obrigatória em todos os módulos da aplicação.",
  },
  {
    videoId: "In1WBxeHEn8",
    title: "O conceito que TODO JOGADOR de poker precisa entender",
    url: "https://www.youtube.com/watch?v=In1WBxeHEn8",
    transcriptStatus: "analisada",
    summaryOriginal:
      "Exemplos de VPIP, read de ranges, uso de randomização para frequências mistas; cautela com explorações baseadas em amostra.",
    timestamps: [
      {
        label: "~01:00",
        seconds: 60,
        urlWithTimestamp: "https://www.youtube.com/watch?v=In1WBxeHEn8&t=60s",
        paraphraseNote: "Leitura de frequências (como VPIP) e construção de ranges.",
      },
      {
        label: "~05:40",
        seconds: 340,
        urlWithTimestamp: "https://www.youtube.com/watch?v=In1WBxeHEn8&t=340s",
        paraphraseNote:
          "Uso de randomizador (1–100) para executar estratégias mistas na prática e cautela com desvios baseados em amostras pequenas.",
      },
    ],
    softwareTranslation:
      "Randomizador reproduzível por seed (`1..100`), barra de partição de ações mistas e cálculo de intervalo de confiança amostral antes de apontar desvios de frequência.",
    epistemicCaveat:
      "O randomizador auxilia a execução da frequência de equilíbrio, mas em uma única mão qualquer ação com mesmo EV máximo tem EV loss zero.",
  },
];

export function getLessonsByTrackId(trackId: CurriculumTrackId): RegLifeSeriesLesson[] {
  return REGLIFE_18_LESSONS.filter((lesson) => lesson.trackId === trackId);
}

export function getLessonBySpotNumber(spotNumber: number): RegLifeSeriesLesson | undefined {
  return REGLIFE_18_LESSONS.find((lesson) => lesson.spotNumber === spotNumber);
}
