# AUDITORIA DE INTEGRIDADE — GTO TRAINER (`AUDITORIA_GTO_VERIFICADO.md`)

**Data da Auditoria:** 12 de novembro de 2026  
**Escopo:** Auditoria integral de autenticidade das estratégias GTO, integrações do currículo RegLife (18 aulas + 7 vídeos complementares), motores matemáticos, interfaces e integridade do acervo legado (`ranges_gto.json`).

---

## Declaração Explícita de Autenticidade (Conclusão Executiva)

> **DECLARAÇÃO FORMAL:**  
> Os **nove spots** anteriormente declarados como `VERIFIED` na função `buildVerifiedSolverReferenceCatalog` (`src/lib/poker/solverAdapter.ts`) **NÃO foram produzidos por execução real de um solver externo** (como PioSOLVER, MonkerSolver, HoldemResources Calculator ou GTO Wizard), nem importados de arquivos/dumps rastreáveis de soluções de equilíbrio.  
> Todos os nove cenários foram **construídos manualmente em código TypeScript** por meio de laços determinísticos (`for (const h of allHands)`) divididos em 3 a 4 baldes de mãos (*buckets*) com frequências e valores de EV redigidos manualmente para satisfazer as regras aritméticas do validador (`soma = 1.000` e `ΔEV <= 0.08` nas ações mistas) e acompanhados de metadados de proveniência internos fictícios (`"SolverAdapter Reference Tree"`, `"SolverAdapter Postflop Reference"`, `"SolverAdapter ICM Engine"` e `"SolverAdapter PKO Bounty Engine"`).
>
> **Ação Corretiva Executada:**  
> 1. **Revogação Integral de `VERIFIED`:** Os 9 spots tiveram sua classificação `VERIFIED` **integralmente retirada** e seus mapas sintéticos de EV (`matrixEv`) removidos (`null`).  
> 2. **Reclassificação Rigorosa:**  
>    - **3 cenários** foram reclassificados como **`DIDACTIC_DEMO`** (exemplos sintéticos claramente identificados no título e nos metadados, com `matrixEv: null` e `evUnit: null`, impedidos de gerar `EV loss` GTO).  
>    - **6 cenários** foram reclassificados como **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`, `evUnit: null`).  
> 3. **Bloqueio de Pontuação de EV Loss sem Solver:** `drillEvaluator.ts` e `spotReasoning.ts` foram corrigidos para exigir estritamente `status === "VERIFIED"` antes de computar qualquer `evLoss`, `bestEv`, `chosenEv` ou comparação numérica de sizings.  
> 4. **Bloqueio de Proveniência Sintética no Adaptador:** `importExternalSolverSolution` (`solverAdapter.ts`) agora rejeita explicitamente nomes de solvers internos/sintéticos (`SolverAdapter *`, `DidacticDemoEngine`, `Synthetic`, `Mock`, `Manual`) e referências auto-apontadas (`solverAdapter.ts#*`).  
> 5. **Posicionamento Honesto da Aplicação:** Esta aplicação **não é um solver GTO completo** e não inclui dumps proprietários de solvers pós-flop/ICM/PKO embutidos por padrão; ela opera como treinador conceitual/pedagógico e explorador de ranges pré-flop importados (`IMPORTED_CHART_NO_EV`), dispondo de um adaptador validador (`SolverAdapter v1.0.0`) pronto para receber exportações legítimas quando fornecidas pelo usuário.

---

## 1. Auditoria Individual dos Nove Spots Anteriormente Declarados `VERIFIED`

### 1.1 Tabela Individual de Auditoria dos 9 Spots

| # | Identificador (`spotId`) | Cenário Completo | Origem Exata das Frequências e EVs | Nome/Versão Declarados Antes | Arquivo de Solução Original / Registro de Execução | Evidência de Convergência / Precisão | Natureza Real do Dado | Classificação Anterior | **Classificação Final Pós-Auditoria** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `verified_mtt_8max_30bb_btn_rfi_v1` | MTT 8-Max, 30BB efetivos, blinds 0.5/1, ante 0.125bb, rake 0%, Pré-Flop BTN RFI (`Raise_2_1bb` vs `Fold`), pote 2.5bb | Construído manualmente em código (`solverAdapter.ts`): `pureBtnOpen` (52 classes com `freq=1.0`, `EV=4.95/1.55/0.68`), `mixedBtnOpen` (16 classes com `EV=0.004`), resto `Fold` (`EV=-0.24`) | `SolverAdapter Reference Tree v1.0.0` (fictício) | **Inexistente** (apontava para `solverAdapter.ts#verified_mtt_8max_30bb_btn_rfi_v1`) | **Nenhuma** (`achievedExploitabilityPct: 0.08` era constante literal em código) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`DIDACTIC_DEMO`** (`matrixEv: null`, sem EV loss GTO) |
| 2 | `verified_mtt_8max_15bb_btn_rfi_short_v1` | MTT 8-Max, 15BB efetivos, blinds 0.5/1, ante 0.125bb, rake 0%, Pré-Flop BTN Short Stack (`Allin_15bb` vs `Raise_2bb` vs `Fold`), pote 2.5bb | Construído manualmente em 4 buckets fixos (`AA/KK/QQ/AKs` `85/15`; 24 classes `25/75`; 11 classes `60/20/20`; resto `Fold`) com EVs fixos (`3.42`, `0.85`, `0.01`, `-0.28`) | `SolverAdapter Reference Tree v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_mtt_8max_15bb_btn_rfi_short_v1`) | **Nenhuma** (`0.09%` literal hardcoded, `actionHistory: []` incompleto para BTN) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`DIDACTIC_DEMO`** (`matrixEv: null`, sem EV loss GTO) |
| 3 | `verified_mtt_8max_20bb_bb_vs_btn_v1` | MTT 8-Max, 20BB efetivos, blinds 0.5/1, ante 0.125bb, rake 0%, Pré-Flop BB vs BTN Open 2bb (`Allin_20bb` vs `Call` vs `Fold`), pote 4.5bb | Construído manualmente em 3 buckets (`16` mãos topo `88% Allin / 12% Call`; todas as `s` + 14 mãos `80% Call / 20% Fold`; resto `Fold`) com EVs fixos (`2.15`, `0.01`, `-1.10`) | `SolverAdapter Reference Tree v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_mtt_8max_20bb_bb_vs_btn_v1`) | **Nenhuma** (`0.07%` literal hardcoded; contradiz o chart real `20bb_bb_vs_btn_rfi` de `ranges_gto.json`) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`; usar `20bb_bb_vs_btn_rfi` como `IMPORTED_CHART_NO_EV`) |
| 4 | `verified_postflop_btn_vs_bb_ahkd7c_v1` | MTT 8-Max, 27.9BB efetivos, Flop `Ah Kd 7c`, SRP BTN IP vs BB (`Bet_75pct`, `Bet_33pct`, `Check`), pote 5.7bb | Construído manualmente em 4 buckets (`isTopValue` `62/38/0`, `isAx` `82/0/18`, `isMediumShowdown` `32/0/68`, resto `55/0/45`) com EVs fixos por bucket (`4.19`, `2.42`, `1.52`, `0.52`) | `SolverAdapter Postflop Reference v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_postflop_btn_vs_bb_ahkd7c_v1`) | **Nenhuma** (`0.11%` literal hardcoded; inclui todas as 169 mãos no flop sem filtrar o range pré-flop do BTN) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`DIDACTIC_DEMO`** (`matrixEv: null`, sem EV loss GTO) |
| 5 | `verified_postflop_bb_vs_btn_cbet_8s7s5d_v1` | MTT 8-Max, 27.9BB efetivos, Flop `8s 7s 5d`, BB vs BTN C-Bet 33% (`Check_Raise 6.2bb`, `Check_Call 1.9bb`, `Check_Fold`), pote 7.6bb | Construído manualmente em 3 buckets (`isOverpairOrSet` `65/35/0`, `has8or7or5 || suited` `15/85/0`, resto `0/20/80`) com EVs fixos (`3.25`, `1.20`, `0.01`) | `SolverAdapter Postflop Reference v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_postflop_bb_vs_btn_cbet_8s7s5d_v1`) | **Nenhuma** (`0.12%` literal hardcoded; inclui `AA/KK` com 100% de peso no flat call do BB e `72s/32s` em check-call) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`) |
| 6 | `verified_river_polarized_btn_vs_bb_v1` | MTT 8-Max, 19.5BB efetivos, River `Ah Kd 7c 4s 2h`, BTN IP vs BB (`Bet_75pct`, `Check`), pote 22.5bb | Construído manualmente em 3 buckets (`isStrongValue` `100% Bet, EV 8.4`, `isBluffBlocker` `65% Bet / 35% Check, EV 0.02/0.01`, resto `100% Check, EV 1.1`) | `SolverAdapter Postflop Reference v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_river_polarized_btn_vs_bb_v1`) | **Nenhuma** (`0.05%` literal hardcoded; aritmética do pote inconsistente: `5.7 + 3.8 + 13.0 = 22.5`, stack restante seria `19.5`, mas sem subgame real) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`) |
| 7 | `verified_icm_ft_6max_20bb_sb_vs_btn_v1` | MTT Mesa Final 6-Max ICM (`$EV`), SB (20BB) vs BTN (38BB) Open 2.1bb; stacks `[LJ:42, HJ:8, CO:15, BTN:38, SB:20, BB:19]`; payouts `[$1000, $680, $460, $310, $210, $150]` | Construído manualmente em 3 buckets (`8` mãos `100% Allin, +$14.50`; `7` mãos `60% Allin / 40% Fold, +$0.02`; `154` mãos `100% Fold, -$4.80`) | `SolverAdapter ICM Engine v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_icm_ft_6max_20bb_sb_vs_btn_v1`) | **Nenhuma** (`0.06%` literal hardcoded; não houve resolução de árvore Malmuth-Harville FGS/CFR) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`) |
| 8 | `verified_icm_50pct_field_30bb_co_vs_mp_v1` | MTT 8-Max ICM (`$EV`), 50% field restante, CO (30BB) vs MP (30BB) Open 2.1bb (`ThreeBet_6bb`, `Call`, `Fold`); stacks `30BB` todos; payouts `[$500, $320, $210, $140, $100, $75, $60, $50]` | Construído manualmente extrapolando a frase `"71% call / 29% raise"` da Aula 18 (~02:40) para um bucket inteiro de 10 mãos (`JJ, TT, 99, AQs, AJs, ATs, KQs, KJs, QJs, JTs`) com `EV = +$1.82` fixo | `SolverAdapter ICM Engine v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_icm_50pct_field_30bb_co_vs_mp_v1`) | **Nenhuma** (`0.07%` literal hardcoded; viola diretamente a diretriz de não transformar o exemplo `71/29` da aula em tabela de solver) | **Construído manualmente / Extrapolação indevida de aula** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`) |
| 9 | `verified_pko_8max_25bb_btn_vs_sb_shove_v1` | MTT PKO 8-Max (`$EV`), BTN (25BB, bounty `$37.50`) cobrindo SB (14BB shove, bounty `$62.50`) após BTN abrir 2bb (`Call_14bb` vs `Fold`), pote 18bb | Construído manualmente em 3 buckets (`27` mãos `100% Call, +$8.60`; `12` mãos `68% Call / 32% Fold, +$0.02`; `130` mãos `100% Fold, -$3.20`) | `SolverAdapter PKO Bounty Engine v1.0.0` (fictício) | **Inexistente** (`solverAdapter.ts#verified_pko_8max_25bb_btn_vs_sb_shove_v1`) | **Nenhuma** (`0.08%` literal hardcoded; `potSizeBb: 18.0` divergia de `2.0 + 14.0 + 1.0 + 1.0 = 18.0` sem estrutura de premiação regular acoplada ao bounty) | **Construído manualmente / Sintético** | `VERIFIED` (Indevido) | **`UNSOLVED`** (`matrixFrequencies: null`, `matrixEv: null`) |

### 1.2 Detalhamento da Configuração e Falhas de Autenticidade por Spot

1. **`verified_mtt_8max_30bb_btn_rfi_v1`:**
   - **Configuração declarada:** 8-Max MTT, stacks `[30, 30, 30, 30, 30, 30, 30, 30]`, blinds `0.5/1.0`, ante `0.125`, rake `0%`, histórico `UTG..CO Fold`, board `[]`, sizings `Raise_2_1bb` e `Fold`.
   - **Diagnóstico:** Todas as 42 mãos não-pares do conjunto `pureBtnOpen` recebiam exatamente o mesmo EV (`+0.68 bbEV`) e todas as 101 mãos de fold recebiam exatamente `-0.24 bbEV`. Em um solver real, `AKs` e `65s` jamais têm o mesmo EV de abertura (`+0.68 bbEV`), e `72o` jamais tem o mesmo EV de raise que `Q6s` (`-0.24 bbEV`).
   - **Decisão:** Reclassificado para `DIDACTIC_DEMO` sem `matrixEv` (`null`).

2. **`verified_mtt_8max_15bb_btn_rfi_short_v1`:**
   - **Configuração declarada:** 8-Max MTT, stacks `15BB`, blinds `0.5/1.0`, ante `0.125`, rake `0%`, `actionHistory: []` (ausente dos 5 folds anteriores até o BTN), sizings `Allin_15bb`, `Raise_2bb`, `Fold`.
   - **Diagnóstico:** Dividia as 169 mãos em apenas 4 valores de EV possíveis.
   - **Decisão:** Reclassificado para `DIDACTIC_DEMO` sem `matrixEv` (`null`).

3. **`verified_mtt_8max_20bb_bb_vs_btn_v1`:**
   - **Configuração declarada:** 8-Max MTT, stacks `20BB`, blinds `0.5/1.0`, ante `0.125`, histórico `BTN Raise 2bb, SB Fold`, sizings `Allin_20bb`, `Call`, `Fold`.
   - **Diagnóstico:** Atribuía `80% Call / 20% Fold` com `EV = +0.01 bbEV` para **qualquer** mão suited não-premium (incluindo `72s`, `62s`, `52s`, `42s`, `32s`) e contradizia a própria tabela real importada em `ranges_gto.json` (`20bb_bb_vs_btn_rfi`).
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`). Os exercícios da Aula 09 apontam agora para o chart real `20bb_bb_vs_btn_rfi` (`IMPORTED_CHART_NO_EV`).

4. **`verified_postflop_btn_vs_bb_ahkd7c_v1`:**
   - **Configuração declarada:** Flop `Ah Kd 7c`, SRP 30BB (`effectiveStackBb: 27.9`), `BTNRaise 2.1bb -> BBCall 2.1bb -> BBCheck`, pote `5.7bb`, sizings `Bet_75pct`, `Bet_33pct`, `Check`.
   - **Diagnóstico:** Atribuía frequências e EVs para todas as 169 classes de mãos (incluindo mãos como `72o`, `83o`, `92o` que têm frequência 0% de RFI no BTN pré-flop) usando 4 constantes fixas de EV.
   - **Decisão:** Reclassificado para `DIDACTIC_DEMO` sem `matrixEv` (`null`).

5. **`verified_postflop_bb_vs_btn_cbet_8s7s5d_v1`:**
   - **Configuração declarada:** Flop `8s 7s 5d`, SRP 30BB (`effectiveStackBb: 27.9`), `BTN Bet_33pct (1.9bb)`, pote `7.6bb`, `toCallBb: 1.9bb`, sizings `Check_Raise (6.2bb)`, `Check_Call (1.9bb)`, `Check_Fold`.
   - **Diagnóstico:** Incluía `AA`, `KK`, `QQ`, `JJ`, `TT` no range de flat call pré-flop do BB e atribuía `85% Check-Call / 15% Check-Raise` para toda mão suited do baralho.
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`).

6. **`verified_river_polarized_btn_vs_bb_v1`:**
   - **Configuração declarada:** River `Ah Kd 7c 4s 2h`, pote `22.5bb`, stack efetivo `19.5bb`, sizings `Bet_75pct` e `Check`.
   - **Diagnóstico:** Construído com 3 baldes fixos de mãos para simular polarização.
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`). A matemática exata da fração de blefes no river (`B / (P + 2B)`) e da remoção de cartas (`EXACT_COMBINATORICS`) permanece disponível para estudo sem inventar matrizes de solver.

7. **`verified_icm_ft_6max_20bb_sb_vs_btn_v1`:**
   - **Configuração declarada:** Mesa Final 6-Max ICM, stacks `[LJ:42, HJ:8, CO:15, BTN:38, SB:20, BB:19]`, payouts `[$1000, $680, $460, $310, $210, $150]`, `BTN Raise 2.1bb`, `SB Allin_20bb vs Fold`.
   - **Diagnóstico:** Os valores de `$EV` (`+$14.50`, `+$0.02`, `-$4.80`) foram digitados manualmente sem cálculo de árvore ICM sobre os payouts informados.
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`).

8. **`verified_icm_50pct_field_30bb_co_vs_mp_v1`:**
   - **Configuração declarada:** 8-Max ICM (50% do field restante), stacks `30BB` para todos os 8 assentos, payouts `[$500, $320, $210, $140, $100, $75, $60, $50]`, `MP Raise 2.1bb`, `CO ThreeBet_6bb vs Call vs Fold`.
   - **Diagnóstico:** Extrapolava a citação didática da Aula 18 (~02:40, onde o apresentador menciona uma mão específica dividindo `71% Call / 29% Raise`) para 10 mãos diferentes com `$EV = +$1.82` fixo.
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`).

9. **`verified_pko_8max_25bb_btn_vs_sb_shove_v1`:**
   - **Configuração declarada:** 8-Max PKO, stacks e bounties `[UTG:35/$25, MP:28/$25, LJ:22/$37.5, HJ:19/$25, CO:31/$50, BTN:25/$37.5, SB:14/$62.5, BB:12/$25]`, `BTN Raise 2bb -> SB Allin 14bb -> BB Fold`, `Call_14bb vs Fold`.
   - **Diagnóstico:** Os valores `+$8.60`, `+$0.02` e `-$3.20` foram atribuídos manualmente em 3 grupos de mãos sem motor de resolução de árvore PKO multi-way.
   - **Decisão:** Reclassificado para `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`).

---

## 2. Auditoria das Integrações RegLife (`reglifeCatalog.ts`)

1. **Conferência Integral das 18 Aulas Principais e 7 Vídeos Complementares:**
   - Todos os **18 vídeos da série** (`Spot 01` a `Spot 18`) e os **7 vídeos complementares** foram confrontados contra `Dossie/RegLife_catalogo_videos_para_GTO.json` e `Dossie/RegLife_GTO_Analise_Videos_Antigravity_V2.md`.
   - **IDs do YouTube, títulos, datas de publicação (`2026-06-03` a `2026-06-28`), URLs e vínculos com as 7 trilhas fundamentais (`CURRICULUM_MODULES`)** conferem 100% com o catálogo de referência.
   - Todos os **timestamps** das 15 aulas com transcrição verificada (`Spot 02` `~20:55`, `Spot 03` `~03:45`, `Spot 04` `~06:20 / ~08:35`, `Spot 05` `~03:10 / ~04:30`, `Spot 06` `~01:40`, `Spot 09` `~03:10 / ~07:00`, `Spot 10` `~01:20`, `Spot 11` `~00:10 / ~01:20`, `Spot 12` `~01:20 / ~12:00`, `Spot 13` `~00:45`, `Spot 14` `~00:20`, `Spot 15` `~00:15`, `Spot 16` `~02:00 / ~07:15`, `Spot 17` `~00:15 / ~02:00`, `Spot 18` `~01:20 / ~02:40`) e dos vídeos complementares (`OhSfmpjRgg8`, `7BSZPyqKUHI`, `zzviYVuIk5o`, `bsBVa-tQE7g`, `0KWMp6iTIBU`, `jYlP-mJcjUg`, `In1WBxeHEn8`) estão preservados com links diretos `&t=...s` e paráfrases fiéis.

2. **Proteção Epistêmica das Aulas 01, 07 e 08 (Sem Transcrição Verificada):**
   - **Aula 01 (`_Wl17geMXmc`)**, **Aula 07 (`teUFXaRa27E`)** e **Aula 08 (`CUNOCNobeZo`)** permanecem marcadas com `transcriptStatus: "indisponível"`, `hasVerifiedTranscript: false`, `publicSource: "vidIQ metadata only"`, `evidenceType: "METADATA_HYPOTHESIS"`, `timestamps: []` e alerta visual obrigatório (`unverifiedWarning`), incluindo a nota sobre a numeração editorial `/20` nos títulos das Aulas 07 e 08. Nenhuma citação ou conclusão de transcrição lhes é atribuída.

3. **Remoção de Frequências/EVs Inventados nos Exercícios Educacionais:**
   - Todos os exercícios vinculados às 18 aulas em `reglifeCatalog.ts` foram auditados e atualizados para `recommendedMode: "LEARNING"`, removendo rótulos que prometiam `"Treino GTO Técnico (Solução Verificada)"` sobre os antigos spots sintéticos e vinculando os treinos pré-flop às planilhas reais importadas (`30bb_rfi_btn`, `14bb_rfi_utg`, `14bb_rfi_btn`, `20bb_bb_vs_btn_rfi` — `IMPORTED_CHART_NO_EV`) ou a cenários conceituais `UNSOLVED` / `DIDACTIC_DEMO` sem EV.

---

## 3. Auditoria Matemática

| Domínio Matemático | Módulo / Função | Fórmula / Propriedade Verificada | Limitações e Hipóteses Documentadas no Código | Status |
|---|---|---|---|---|
| **Pot Odds** | `mathEngine.ts` (`calculatePotOdds`) | `requiredEquity = C / (P_atual + C)` (onde `P_atual = P_antes + B`) | Equidade bruta em fichas; não inclui realização pós-flop (`R != 1`), rake, multiway nem Bubble Factor ICM. | **Aprovado** |
| **Fold Equity Breakeven** | `mathEngine.ts` (`calculateBluffBreakevenFoldEquity`) | `α = R / (P + R)` (blefe puro com 0% de equidade quando pago) | Para semiblefes com equidade `E > 0` quando pagos, o ponto de equilíbrio cai abaixo de `α`. | **Aprovado** |
| **MDF (Frequência Mínima de Defesa)** | `mathEngine.ts` (`calculateSimplifiedMdf`) | `MDF = P / (P + B) = 1 - α` (identidade `α + MDF = 1` testada de `0.25x` a `2.0x` pote) | Exclusivo para modelo simplificado HU de river com blefes de 0% de equidade vs bluff-catchers puros. Não substitui árvores multi-street com vantagem de range/nuts assimétrica nem ICM. | **Aprovado** |
| **Fração de Blefe Polarizado no River** | `mathEngine.ts` (`calculatePolarizedRiverBluffFraction`) | `b / (v + b) = B / (P + 2B)`, `v / b = (P + B) / B` | Modelo de brinquedo `[0,1]` no river HU sem rake e com ranges perfeitamente polarizados vs condensados. | **Aprovado** |
| **Card Removal, Combos e Bloqueadores** | `cards.ts` (`generateAll1326Combos`, `getAvailableCombosForClass`, `countAvailableCombosByClass`) | `169` classes; `1.326` combos (`78` pares, `312` suited, `936` offsuit); com `k` cartas mortas no board, restam `C(52 - k, 2)` combos (`1.176` no flop, `1.081` no turn, `990` no river). | Em `spotReasoning.ts`, o resumo textual de blockers foi corrigido para usar a contagem combinatória dinâmica exata (`EXACT_COMBINATORICS`) considerando simultaneamente a mão do herói e as cartas já presentes no board (ex.: `As5s` em `Ah Kd 7c` reduz `AA` de `6` para `1` combo, `-83%`). | **Corrigido e Aprovado** |
| **Ações Legais, Min-Raise, All-In e Side Pots** | `stateEngine.ts` (`validateGameState`, `getLegalActions`, `computeSidePots`) | Valida unicidade de cartas, potes/stacks não-negativos, `callAmount = min(stack, toCall)`, `minRaiseTotal = currentBet + minRaiseIncrement`, incomplete all-in quando `stack < minRaise`, e camadas de side pots por nível de investimento elegível. | Em `computeSidePots`, quando o maior investidor está `folded: false`, o excesso não chamado (se houver antes de igualar a rua) fica em camada elegível apenas para ele. | **Aprovado** |
| **ICM, Risk Premium e PKO** | `mathEngine.ts` (`calculateIcm`, `calculateBubbleFactor`, `evaluatePkoBountyModel`, `assertNotPkoForStandardIcm`) | Malmuth-Harville recursivo exato com conservação estrita da premiação (`Σ $EV = Σ payouts`), `BF = Loss_$EV / Gain_$EV`, `Eq_min = BF / (BF + 1)`, e bloqueio de Malmuth-Harville puro em torneios `PKO`. | Limitado a `<= 9` jogadores na mesa (`O(N!)`). `calculateIcm` e `evaluatePkoBountyModel` são calculadoras estáticas de estado/all-in e não resolvem subjogos pós-flop. | **Aprovado** |
| **Estratégias Mistas e Randomização** | `mathEngine.ts` (`createSeededRng`), `drillEvaluator.ts` (`evaluateDrillDecision`, `computeMixedAdherenceStats`) | PRNG determinístico (`xmur3` + `mulberry32`) em `[1..100]`; partição cumulativa das frequências; `adherencePct = (1 - 0.5 * Σ|f_emp - f_gto|) * 100`. | A pontuação de `evLoss` e `gtoScored = true` agora só é emitida quando `referenceStrategy.status === "VERIFIED"`. | **Corrigido e Aprovado** |
| **Comparação de Sizings** | `spotReasoning.ts` (`compareActionSizings`) | `ΔEV = EV(melhor_sizing) - EV(sizing_escolhido)` e `% do pote` | Agora exige estritamente `spot.referenceStrategy.status === "VERIFIED"`. Inclui aviso explícito de que remover um sizing de todo o range exige *re-solve* da árvore. | **Corrigido e Aprovado** |
| **Distinção Cálculo Exato vs Modelo Heurístico** | `spotReasoning.ts` (`analyzeSpotReasoning`) | `blocker.combinatoricsType = "EXACT_COMBINATORICS"` vs `rangeAdvantage.computationType = "HEURISTIC_MODEL"`, `nutAdvantage.computationType = "HEURISTIC_MODEL"`, `equityRealization.computationType = "HEURISTIC_MODEL"` | Cada estrutura declara explicitamente no código e na interface se é combinatória exata ou modelo qualitativo heurístico. | **Corrigido e Aprovado** |
| **Classificação de Leaks e Repetição Espaçada** | `adaptiveDiagnostics.ts` (`classifyAndRankLeaks`, `computeSpacedRepetitionSchedule`, `computeDimensionalProgress`) | Ranking composto por frequência de erro, EV loss (somente quando `VERIFIED`) e erro com confiança alta (*blind spot*); agendamento Leitner em caixas `0..4` (`Imediato, 1d, 3d, 7d, 14d`). | Registros sem solução `VERIFIED` têm `evLoss: null` e são classificados apenas por divergência pedagógica, sem inflar métricas de perda de EV. | **Aprovado** |

---

## 4. Auditoria das Interfaces

1. **`TrainerView.tsx` (Modo Aprendizagem vs Modo GTO Técnico):**
   - Inicializa em **`Modo Aprendizagem (LEARNING)`** quando o catálogo padrão possui `0` spots `VERIFIED`.
   - Ao alternar para **`Modo GTO Técnico (GTO_TECHNICAL)`** sem soluções `VERIFIED` carregadas, exibe um **Banner de Bloqueio de Integridade** em destaque explicando que os 9 cenários sintéticos foram reclassificados na auditoria e **desabilita todos os botões de ação** até que um arquivo `VERIFIED` real seja importado via `SolverAdapter v1.0.0`.
   - Nenhum spot `DIDACTIC_DEMO` ou `IMPORTED_CHART_NO_EV` exibe `EV loss` como se fosse resultado de solver (`gtoScored: false`, `evLoss: null`).
   - Exibe os selos explícitos `(EXACT_COMBINATORICS)` e `(HEURISTIC_MODEL)` nos cartões de decomposição técnica.
   - Exibe avisos de validação (`validationWarnings`) sempre que uma matriz apresenta perda de frequência nas células legadas.

2. **`RangeExplorerView.tsx` (Explorador de Ranges 13×13):**
   - Rotula todos os 229 spots de `ranges_gto.json` com o badge `IMPORTED_CHART_NO_EV (Sem Tabela EV)`.
   - Exibe um **Aviso de Auditoria (Dados Legados Não Normalizados)** visível no topo da matriz sempre que o spot selecionado contém qualquer uma das 23 células com soma de frequências divergente de `1.000` (como `17bb_sb_vs_utg_rfi` e `20bb_btn_vs_mp_rfi`).

3. **`CurriculumView.tsx`, `StatsView.tsx` e `MathIcmLab.tsx`:**
   - Navegação entre as 7 trilhas, 18 aulas da série RegLife, filtro de transcrição (`Todas (18)`, `Com Transcrição Verificada (15)`, `Apenas Metadados (3)`), 7 vídeos complementares, quizzes interativos com explicação imediata e botões de prática funcionando em `Modo Aprendizagem`.

---

## 5. Integridade dos Dados Legados (`ranges_gto.json`)

- **Total auditado:** `229` spots × `169` mãos = **`38.701` células**.
- **Distribuição exata das somas de frequências (comprovada pelo teste automatizado #11 em `etapa1Audit.test.ts`):**
  - `38.678` células (`99,94%`) possuem soma `1.000` (ou `0.999`/`1.001` por arredondamento de 3 casas decimais).
  - **`23` células (`0,06%`)** possuem perda de frequência superior ao arredondamento simples e **foram mantidas intactas (não normalizadas por estimativa)**:
    - **`20` células** com soma `0.988` (perda de `1,2%`).
    - **`1` célula** com soma `0.976` (perda de `2,4%`): `20bb_co_vs_utg_rfi/JJ` (`Fold: 0.085, Call: 0.720, 3-Bet: 0.171`).
    - **`2` células** com soma `0.964` (perda de `3,6%`):
      1. `17bb_sb_vs_utg_rfi` — mão **`AA`** (`Fold: 0.0, Call: 0.159, Allin: 0.805` -> soma `0.964`, faltando a fração de 3-bet não-all-in omitida no scraper de origem).
      2. `20bb_btn_vs_mp_rfi` — mão **`KK`** (`Fold: 0.0, Call: 0.134, 3-Bet: 0.830` -> soma `0.964`).
- Todos os `229` spots de `ranges_gto.json` recebem exclusivamente o status **`IMPORTED_CHART_NO_EV`**, nunca sendo apresentados nem pontuados como soluções `VERIFIED`.

---

## 6. Testes Executados, Resultados de Lint / Typecheck / Build, Correções Aplicadas e Pendências

### 6.1 Resultados Verificáveis de Execução

| Verificação | Comando Executado | Resultado | Detalhes |
|---|---|---|---|
| **Testes Automatizados** | `npm test` (`node --test src/lib/__tests__/*.test.ts`) | **PASS (`25/25` testes em `6` suítes, `0` falhas)** | `pokerCore.test.ts` (10 testes), `etapa1Audit.test.ts` (6 testes), `etapas2To5.test.ts` (9 testes) |
| **Checagem de Tipos** | `npm run typecheck` (`tsc --noEmit`) | **PASS (`exit code 0`)** | Zero erros de TypeScript em toda a aplicação |
| **Linter** | `npm run lint` (`eslint .`) | **PASS (`exit code 0`)** | Zero erros ou warnings de ESLint (Flat Config Next.js 15 + TypeScript) |
| **Build de Produção** | `npm run build` (`next build`) | **PASS (`exit code 0`)** | Compilação otimizada e geração estática/dinâmica concluídas sem erros |

### 6.2 Problemas Encontrados e Correções Aplicadas Nesta Auditoria

1. **Problema 1 (Crítico — 9 spots `VERIFIED` sintéticos em `solverAdapter.ts`):**
   - **Causa:** `buildVerifiedSolverReferenceCatalog` construía 9 matrizes em TypeScript com 3–4 buckets de mãos e EVs inventados, rotulando-os como `VERIFIED`.
   - **Correção:** Revogada a classificação `VERIFIED` dos 9 spots (3 reclassificados como `DIDACTIC_DEMO` com `matrixEv: null` e 6 reclassificados como `UNSOLVED` com `matrixFrequencies: null, matrixEv: null`). Adicionada trava em `importExternalSolverSolution` que rejeita nomes de solvers sintéticos/internos.
2. **Problema 2 (Crítico — `DIDACTIC_DEMO` gerava pontuação de `EV loss` em `drillEvaluator.ts` e `curriculum.ts`):**
   - **Causa:** `drillEvaluator.ts` permitia `gtoScored = true` e cálculo de `evLoss` para `DIDACTIC_DEMO`, e `curriculum.ts` continha `matrixEv` inventada em `didactic_rfi_btn_30bb_v1` e `didactic_flop_cbet_btn_vs_bb_v1`.
   - **Correção:** `drillEvaluator.ts` agora restringe `gtoScored = true` e o cálculo de `evLoss`/`bestEv`/`chosenEv` exclusivamente a `ref.status === "VERIFIED"`. As matrizes `evs` sintéticas de `curriculum.ts` foram removidas (`matrixEv: null`, `evUnit: null`).
3. **Problema 3 (`compareActionSizings` aceitava `DIDACTIC_DEMO` e `blockerSummary` usava texto pré-flop fixo em `spotReasoning.ts`):**
   - **Causa:** `compareActionSizings` não verificava `ref.status === "VERIFIED"`, e `blockerSummary` exibia `"reduz AA de 6 para 3 combos (-50%)"` mesmo quando o board já continha um Ás (`Ah Kd 7c`).
   - **Correção:** `compareActionSizings` agora exige `ref.status === "VERIFIED"`. `blockerSummary` passa a reportar os números dinâmicos exatos de `blockedValueClasses` (`EXACT_COMBINATORICS`), e os módulos de vantagem de range/nuts e realização de equidade foram explicitamente marcados com `computationType: "HEURISTIC_MODEL"`.
4. **Problema 4 (Exercícios em `reglifeCatalog.ts` apontavam para `GTO_TECHNICAL` nos spots sintéticos):**
   - **Correção:** Todos os exercícios das 18 aulas foram ajustados para `recommendedMode: "LEARNING"`, apontando para planilhas reais importadas (`IMPORTED_CHART_NO_EV`) ou spots conceituais (`DIDACTIC_DEMO` / `UNSOLVED`).

### 6.3 Pendências Técnicas Reais (Para Evolução Futura com Solvers Externos)

1. **Importação de Dumps Reais de Solvers Externos (`VERIFIED`):** O catálogo padrão atualmente contém `0` soluções `VERIFIED`. Para habilitar exercícios no `Modo GTO Técnico` com pontuação de `EV loss` real, é necessário exportar arquivos JSON reais de solvers externos (PioSOLVER, MonkerSolver, HRC, GTO Wizard com permissão de uso) no formato `ExternalSolverPayloadV1` e importá-los via `SolverAdapter v1.0.0`.
2. **Transcrição das Aulas 01, 07 e 08:** Caso as legendas oficiais dos vídeos `_Wl17geMXmc`, `teUFXaRa27E` e `CUNOCNobeZo` sejam disponibilizadas futuramente, seus resumos e timestamps poderão migrar de `METADATA_HYPOTHESIS` para `VIDEO_CONCEPT`.
3. **Recuperação na Fonte das 23 Células Incompletas de `ranges_gto.json`:** As 23 células com soma `< 0.995` (especialmente `17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK` com `0.964`) permanecem sinalizadas com aviso visível até que os dados brutos de origem daquelas ações omitidas sejam reexportados da fonte original.
