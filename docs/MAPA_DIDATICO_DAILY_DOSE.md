# Mapa Didático — *Daily Dose of GTO* (334 Lições → Treinamento Interativo pt-BR)

## 1. Visão Geral e Princípios de Adaptação

O livro **`Daily Dose of GTO - Book.pdf`** possui **1.293 páginas** e **349 entradas de sumário** distribuídas em **11 capítulos** (totalizando **334 lições temáticas** além de seções introdutórias e encerramento).

Seguindo a diretriz de **aprendizado ativo (`MENOS TEXTO. MAIS AÇÃO. MAIS VISUALIZAÇÃO. MAIS TREINAMENTO.`)** e respeito integral a direitos autorais e integridade epistemológica:

1. **Sem reprodução integral de texto ou tabelas proprietárias:** nenhum texto literal longo ou chart proprietário do livro foi copiado para o frontend.
2. **Tradução pedagógica para exercícios práticos em português brasileiro (`pt-BR`):** os 11 capítulos e 10 formatos pedagógicos do livro foram destilados em **microlições interativas originais** (com no máximo 3 frases de contexto antes da decisão) e **5 laboratórios de treino prático**.
3. **Rastreabilidade de página e capítulo:** cada microlição referencia o capítulo, o tema original e a página aproximada do PDF (`p. XXXX`) para consulta opcional pelo estudante.
4. **Honestidade epistemológica:** exercícios conceituais, quizzes de linha/morfologia e simulações paramétricas são explicitamente rotulados (`EDUCATIONAL_HEURISTIC`, `EXACT_ENUMERATION`, `MODEL_BASED_EV`, `IMPORTED_CHART_NO_EV` ou `VERIFIED`), jamais inventando frequências ou EVs de solver.

---

## 2. Mapeamento Estrutural dos 11 Capítulos do PDF (`1.293` páginas)

| Capítulo | Intervalo de Páginas | Nº de Lições | Eixo Pedagógico Central | Integração no Aplicativo (`Projeto-Poker`) |
| :--- | :---: | :---: | :--- | :--- |
| **Cap. 1 — Fundamentals** | `p. 4 – 73` | 30 | Pot Odds, Implied Odds, Equity Buckets, Backdoors, Estratégias Mistas, Nut Advantage, Blockers, Morfologia de Ranges, MDF vs Pot Odds, Indiferença, Realização de Equidade (EQR), Erros Puros vs Erros de Frequência. | **Treino de Pot Odds**, **Treino de Blockers**, **Construtor de Ranges 13×13**, **Modo Trainer (RNG & Aderência Mista)** e **Erros Fatais (`EF01`–`EF06`)**. |
| **Cap. 2 — Quizzes** | `p. 74 – 184` | 31 | *Guess the hand*, *Which set has the most EV?*, *Over-realizing equity*, *Where do pot odds and MDF meet?*, *Linear vs Polarized 3-betting*, *Range vs Range*, *Perfect polarity*, *Overfolding and MDF*, *Balancing bluffs*. | **Microlições Interativas ("Adivinhe a Linha / Mão")**, **Treino de Sizings** e **Laboratório Matemático (EV & Sensibilidade)**. |
| **Cap. 3 — Spots** | `p. 185 – 289` | 31 | Push-fold, 3-bet shoving pocket pairs, C-bet IP/OOP, Monotone/Paired boards, Delayed C-bet, BvB, Defesa contra overbets, Block bets, Comparação de blockers de flush draw, Sets vs Overpairs. | **Treino por Street (Pré-flop, Flop, Turn, River)**, **Modo Trainer (`ranges_gto.json` + spot real `Ah Kd 7c`)** e **Erros Fatais (`EF07`–`EF14`)**. |
| **Cap. 4 — Streets** | `p. 290 – 391` | 28 | Progressão entre streets: RFI short/deep, defesa do BB, C-bet em boards baixos conectados, Turn probes, Check-back river, Block bets OOP e defesa contra 3-barrels. | **Treino de Decisões por Street**, **Currículo (Trilhas 1 a 5)** e **Replayer de Mãos**. |
| **Cap. 5 — Advanced Concepts** | `p. 392 – 525` | 31 | Construção Bet-Bet-Jam, Indiferença real, Ruído de solver (*Solver noise*), MDF contra draws e showdown value, Precisão de solver, ICM, Risk Premium, *The Vluff*, AKQ Game e `[0,1]` Game. | **Lab EV & ICM (Malmuth-Harville, Bubble Factor, Risk Premium, PKO)**, **Guarda do `SolverAdapter v1.1.0`** e **Erros Fatais (`EF17`–`EF20`)**. |
| **Cap. 6 — Equity** | `p. 526 – 647` | 29 | Distribuições simétricas, polarizadas e *staircase*, Equity Buckets, *Guess the line! #1/#2*, *Guess the move! #1/#2/#3*, *What is EQR?*, Realização em boards Broadway e impacto de stack depth na EQR. | **Laboratório Matemático (Equidade Exata & Monte Carlo)**, **Decomposição Técnica (Range/Nut Advantage & EQR)** e **Microlições Daily Dose**. |
| **Cap. 7 — Stack Depth** | `p. 648 – 774` | 30 | Limp de mãos premium, Shove de suited connectors, Turn shoves short-stack, C-bet em Spins, Heurísticas deepstack UTG vs BB, Limiares de value shove por SPR. | **Filtro Rápido de Stack (`14BB`–`100BB` e `Spin & Go`)**, **Explorador de Ranges (Comparação Lado a Lado)** e **Trilha 7 (Spin & Go)**. |
| **Cap. 8 — Tactics** | `p. 775 – 909` | 31 | Quando fazer range-bet no flop, Como contra-atacar range-bettors, Probe OOP em boards A-high, Turn barrel após C-bet pequena, Overdefend pre / Overfold post, Check-raise em flops A-high secos, Overbet vs ranges condensados. | **Spot Verificado Real (`BTN vs BB SRP 30bb — Flop Ah Kd 7c`)**, **Treino de Sizings** e **Currículo (18 Aulas)**. |
| **Cap. 9 — Offense vs Defense** | `p. 910 – 1034` | 31 | Delay C-bet OOP em 3BP, Defesa contra double/triple-barrels, Aproveitamento de Nut Advantage no turn, Bluff-catching river, Cenários de 3-handed ICM, Defesa contra block bets. | **Treino de Decisões por Street (`Turn` / `River`)**, **Erros Fatais (`EF11`–`EF18`)** e **Diagnóstico Adaptativo de Leaks**. |
| **Cap. 10 — Formats** | `p. 1035 – 1153` | 30 | Diferenças entre MTT, Cash e Spin & Go, Estruturas de rake, Min-open vs Shove, Defesa do BB sob ICM, Construção de estratégias de C-bet em MTTs, 4-bet como chip leader, BvB mid-stack. | **Filtros de Formato (`MTT`, `Spin/SNG`, `chipEV`, `ICM`, `PKO`)**, **Lab ICM/PKO** e **Construtor de Ranges**. |
| **Cap. 11 — All Stars** | `p. 1154 – 1290` | 32 | Síntese das lições mais importantes: Métricas fundamentais, Matemática básica do GTO, Indiferença e estratégias mistas, EQR em cold-calls, *Double-Plateau Distribution*, *Why check back good draws?*, *Shortstack Triple Barrel Math*, *Block-calling the river*. | **Painel "Treinar Agora" (Sessões Rápidas de 5/10/20 min)**, **Agenda Leitner Unificada** e **Conjunto Principal de Microlições Interativas**. |

---

## 3. Os 10 Formatos Pedagógicos Incorporados ao Treinador

| # | Formato Original (*Daily Dose of GTO*) | Referência no PDF | Como Funciona no Aplicativo (`pt-BR`) | Motor / Fonte de Verdade |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Adivinhe a Mão / Adivinhe a Linha** (*Guess the hand / line / move*) | Cap. 2 (`p. 76`), Cap. 6 (`p. 549, 554, 598–604`) | Apresenta o board, posições, SPR e a linha de ação; o aluno identifica qual classe de mão ou ação compõe aquele ramo antes de revelar a explicação. | `dailyDoseCatalog.ts` + `RangeMatrix` |
| **2** | **Qual Mão ou Ação Tem Maior EV / Prioridade?** (*Which set has the most EV?*) | Cap. 2 (`p. 79`), Cap. 3 (`p. 287`), Cap. 8 (`p. 840`) | Compara duas classes de mãos no mesmo board (ex.: trinca baixa vs trinca alta, ou top pair com diferentes kickers/blockers) e pede a escolha antes de abrir a decomposição. | `cards.ts` + `verified_ahkd7c_texassolver.json` |
| **3** | **Pot Odds vs MDF** (*Visualizing MDF and Pot odds / MDF vs Pot Odds*) | Cap. 1 (`p. 21, 62`), Cap. 2 (`p. 86`), Cap. 5 (`p. 428, 512`) | **Treino de Pot Odds** com pote e aposta dinâmicos + microlição contrastando preço direto de call (`B / (P + 2B)`) e defesa mínima contra blefe puro (`P / (P + B)`). | `mathEngine.ts` (`computePotOdds`, `computeSimplifiedMdf`) |
| **4** | **Morfologia de Ranges (Linear, Polarizado, Condensado)** | Cap. 1 (`p. 53`), Cap. 2 (`p. 110, 132`), Cap. 6 (`p. 536–545, 561`) | **Construtor de Ranges 13×13** + microlições onde o usuário classifica ou desenha a estrutura linear vs polarizada vs condensada e compara com o range de referência. | `RangeBuilder` + `ranges_gto.json` |
| **5** | **Equidade vs Realização de Equidade (EQR)** | Cap. 1 (`p. 70`), Cap. 2 (`p. 83, 114`), Cap. 6 (`p. 626–645`), Cap. 11 (`p. 1168`) | Exercício prático mostrando por que mãos com mesma equidade bruta realizam frações diferentes (`R > 1` IP conectada vs `R < 1` OOP dominada). | `spotReasoning.ts` + `labEquity.ts` |
| **6** | **Quando Blockers Realmente Importam** (*When do blockers actually matter?*) | Cap. 1 (`p. 50, 57`), Cap. 3 (`p. 278–284`), Cap. 11 (`p. 1281`) | **Treino de Blockers**: dado um board e um range-alvo de valor ou fold do vilão, o usuário escolhe qual mão bloqueia mais combos reais; o motor enumera as combinações exatas restantes. | `cards.ts` (`getAvailableCombosForClass` — `EXACT_ENUMERATION`) |
| **7** | **Erros Puros vs Erros de Frequência** (*Pure mistakes vs frequency mistakes*) | Cap. 1 (`p. 72`), Cap. 2 (`p. 143`), Cap. 5 (`p. 407, 410`), Cap. 11 (`p. 1164`) | Diferencia visualmente no feedback do Trainer uma ação com `0%` de frequência (erro puro) de uma ação presente no mix com frequência positiva (`Mix válido` + medidor de aderência acumulada). | `drillEvaluator.ts` + `computeMixedAdherenceStats` |
| **8** | **Sizing em SRP e 3-Bet Pots** (*C-bet sizing / Overbet sizing motifs*) | Cap. 2 (`p. 93, 97`), Cap. 5 (`p. 440`), Cap. 8 (`p. 777, 791, 891`) | **Treino de Sizings**: comparação interativa entre sizing pequeno (`33%`) e grande (`75%` / overbet) com sliders de fold equity e equidade quando pago (`MODEL_BASED_EV`). | `labEv.ts` (`calculateLabEv`) + `spotReasoning.ts` |
| **9** | **Efeito da Profundidade de Stack (SPR)** | Cap. 2 (`p. 168`), Cap. 4 (`p. 299`), Cap. 6 (`p. 645`), Cap. 7 (`p. 648–774`), Cap. 11 (`p. 1251`) | Comparação prática de ranges pré-flop (`14BB`, `20BB`, `30BB`, `50BB`, `100BB`) no **Construtor de Ranges** e no **Explorador de Ranges**, destacando a transição de linear/shove para pós-flop manobrável. | `ranges_gto.json` (229 spots auditados) |
| **10** | **ICM, Risk Premium e Torneios vs Cash** | Cap. 3 (`p. 267`), Cap. 5 (`p. 444, 481`), Cap. 9 (`p. 989`), Cap. 10 (`p. 1116`), Cap. 11 (`p. 1217`) | Microlições e simulador demonstrando como o **Bubble Factor** eleva a equidade mínima necessária acima do `chipEV` e por que PKO exige ajuste de bounty separado. | `mathEngine.ts` (`computeMalmuthHarvilleIcm`, `computeBubbleFactor`, `computePkoBountyAdjustment`) |

---

## 4. Catálogo de Microlições Interativas Implementadas no Frontend

As microlições estão implementadas em `app/src/lib/poker/dailyDoseCatalog.ts` e integradas diretamente ao hub de **Treinos Interativos** e ao **Modo Trainer**, respeitando a regra de **no máximo 3 frases curtas antes da tomada de decisão** e revelação progressiva (`Entenda o motivo`, `Ver a matemática`, `Comparar ranges`, `Consultar fonte`):

1. **`DD01` — Pot Odds vs MDF: Quando Usar Cada Fórmula?** (`Cap. 1, p. 21 & 62; Cap. 2, p. 86; Cap. 5, p. 512`) → Vinculado ao **Treino de Pot Odds** e `EF05`/`EF06`.
2. **`DD02` — Erros Puros vs Erros de Frequência em Estratégias Mistas** (`Cap. 1, p. 43 & 72; Cap. 5, p. 407`) → Vinculado ao spot real `verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet`.
3. **`DD03` — Quando Blockers Realmente Importam no Blefe e no Hero Call** (`Cap. 1, p. 50 & 57; Cap. 3, p. 278–284`) → Vinculado ao **Treino de Blockers** (`EXACT_ENUMERATION`).
4. **`DD04` — Adivinhe a Linha: Range-Bet Pequena vs Check-Back em Flop A-K-7 Rainbow** (`Cap. 2, p. 76 & 93; Cap. 8, p. 777 & 840`) → Vinculado ao spot `VERIFIED` `Ah Kd 7c` (`BTN vs BB 30bb`).
5. **`DD05` — Qual Trinca Prefere Apostar Maior? (Blockers de Continuamento)** (`Cap. 2, p. 79; Cap. 3, p. 287`) → Vinculado ao **Treino de Blockers** e ao spot `Ah Kd 7c`.
6. **`DD06` — Morfologia de Ranges: 3-Bet Linear vs 3-Bet Polarizado** (`Cap. 1, p. 53; Cap. 2, p. 110 & 132; Cap. 6, p. 545`) → Vinculado ao **Construtor de Ranges 13×13** (`30bb_btn_vs_co_rfi`).
7. **`DD07` — Equidade Bruta vs Realização de Equidade (EQR) Fora de Posição** (`Cap. 1, p. 70; Cap. 2, p. 83 & 114; Cap. 6, p. 626`) → Vinculado ao **Treino de Decisões por Street** (`BB vs BTN`).
8. **`DD08` — Sizing de Turn: Quando a Vantagem de Nuts Autoriza Overbet** (`Cap. 1, p. 48; Cap. 5, p. 440; Cap. 8, p. 891; Cap. 11, p. 1255`) → Vinculado ao **Treino de Sizings** (`MODEL_BASED_EV`).
9. **`DD09` — Efeito da Profundidade de Stack: 15 BB vs 50 BB no Botão** (`Cap. 2, p. 168; Cap. 4, p. 299; Cap. 7, p. 655; Cap. 10, p. 1091`) → Vinculado ao **Construtor de Ranges 13×13** (`15bb_rfi_btn` vs `50bb_rfi_btn`).
10. **`DD10` — ICM e Risk Premium: Por Que +chipEV Pode Ser -$EV na Reta Final** (`Cap. 5, p. 444 & 481; Cap. 9, p. 989; Cap. 10, p. 1116`) → Vinculado ao **Lab EV & ICM** e `EF17`/`EF18`.
11. **`DD11` — Por Que Dar Check-Back com Bons Draws em Posição?** (`Cap. 3, p. 209; Cap. 7, p. 667; Cap. 11, p. 1242`) → Vinculado ao **Treino de Decisões por Street (`Flop` / `Turn`)**.
12. **`DD12` — Defesa do Big Blind vs C-Bet Pequena: Overfold Pós-Flop** (`Cap. 8, p. 830; Cap. 9, p. 1012; Cap. 10, p. 1020`) → Vinculado ao **Treino de Decisões por Street (`BB vs C-Bet`)** e `EF09`.
