# Arquitetura, Auditoria e Evolução Técnica V2 — Projeto-Poker (Study Lab)

> **Política de Uso:** Ferramenta exclusivamente dedicada a **estudo offline e revisão pós-sessão**. Não possui HUD, overlay, captura de tela de mesas ou assistência em tempo real (RTA) durante mãos de poker.

---

## ETAPA 1 — Relatório de Auditoria, Causa Raiz (`0.964`) e Limitações Matemáticas

### 1. Inspeção Completa dos Módulos da Primeira Implementação

Todos os módulos criados/atualizados na implementação anterior foram inspecionados linha a linha:

| Arquivo | Papel Arquitetural | Status na Auditoria |
|---|---|---|
| `app/src/lib/poker/cards.ts` | Baralho de 52 cartas (`validateDeckUnique`), 169 classes de mãos (`getAll169Hands`), 1.326 combos físicos (`generateAll1326Combos`) e filtragem de bloqueadores (`getAvailableCombosForClass`, `countAvailableCombosByClass`, `sampleCardsForHand`). | Auditado e validado (incluindo assimetria suited/offsuit/pares sob *card removal* e conservação `C(45,2) = 990` com 7 cartas mortas). |
| `app/src/lib/poker/stateEngine.ts` | Modelo `GameState` (`MTT`, `SNG`, `CASH`, `NLHE`), validação estrutural (`validateGameState`), ações legais (`getLegalActions`, `isLegalActionId`) e cálculo de *side pots* (`computeSidePots`). | Auditado e validado com casos extremos de *incomplete all-in* (`stack < minRaise`), *short call* (`stack < currentBet`) e *side pots* com múltiplos *all-ins* empatados + fichas mortas de jogadores *folded*. |
| `app/src/lib/poker/mathEngine.ts` | Pot Odds, Fold Equity de blefe puro, MDF simplificado, fração de blefe polarizado no river (`calculatePolarizedRiverBluffFraction`), RNG reproduzível por seed (`createSeededRng`), ICM exato de **Malmuth-Harville** (`calculateIcm`), Bubble Factor (`calculateBubbleFactor`), guarda anti-PKO (`assertNotPkoForStandardIcm`) e modelo dedicado de bounty PKO (`evaluatePkoBountyModel`). | Auditado, expandido na Etapa 3 e validado. Limitações matemáticas explícitas documentadas na Seção 1.4 abaixo. |
| `app/src/lib/poker/strategySchema.ts` | Contrato canônico `CanonicalSpot`, `ReferenceStrategy`, provedores (`ImportedVerifiedProvider`, `DidacticDemoProvider`, `NoSolutionProvider`), adaptador `adaptLegacyRangeSpotToCanonical`, hash FNV-1a (`computeAssumptionsHash`) e importação/exportação CSV. | Auditado e validado. Preserva `ranges_gto.json` intacto como `IMPORTED_CHART_NO_EV` e registra `validationWarnings` explícitos sem normalização silenciosa. |
| `app/src/lib/poker/drillEvaluator.ts` | Avaliação justa de estratégias mistas (`evaluateDrillDecision`), bloqueio de spots não verificados no Modo GTO Técnico (`assertSpotAllowedInTechnicalGtoMode`), cálculo de `EV_loss` em `bbEV` ou `$EV`, aderência acumulada (`computeMixedAdherenceStats` via distância L1 / TVD) e priorização adaptativa de leaks (`rankLeakSpots`). | Auditado, expandido na Etapa 3 e validado. |
| `app/src/lib/curriculum.ts` | Currículo de 7 trilhas fundamentais em PT-BR + spots `VERIFIED`, `DIDACTIC_DEMO` (com tabela de EV didática) e `UNSOLVED` (bloqueados para pontuação GTO). | Auditado e integrado ao catálogo do `SolverAdapter` na Etapa 4. |
| `app/src/components/*` | `PokerStudioApp.tsx`, `CurriculumView.tsx`, `TrainerView.tsx`, `RangeExplorerView.tsx`, `RangeMatrix.tsx`, `PokerTable.tsx`, `MathIcmLab.tsx`, `StatsView.tsx`, `AiCoachView.tsx`. | Auditados, evoluídos nas Etapas 2–5 e verificados com ESLint Flat Config (`eslint.config.mjs`) sem *warnings* ou erros de hidratação/pureza de hooks. |

---

### 2. Configuração do ESLint e Verificação (`lint`, `typecheck`, `test`, `build`)

- **Problema identificado:** O `next lint` legado com `.eslintrc.json` e `eslint-config-next@16.x` falhava com erro de serialização circular (`Converting circular structure to JSON`).
- **Correção aplicada:**
  1. Criado `app/eslint.config.mjs` no padrão **ESLint v9 Flat Config**, importando `eslint-config-next/core-web-vitals` e `eslint-config-next/typescript`.
  2. Atualizado script `"lint": "eslint ."` em `app/package.json`.
  3. Corrigidos avisos/erros de pureza e efeitos do React 19 Compiler (`react-hooks/purity` e `react-hooks/set-state-in-effect`).
- **Resultados verificados (Etapas 1 a 5):**
  - `npm run lint`: **0 erros, 0 warnings**
  - `npm run typecheck`: **0 erros (`tsc --noEmit`)**
  - `npm test`: **25/25 testes passando em 6 suítes (`pokerCore.test.ts` [10] + `etapa1Audit.test.ts` [6] + `etapas2To5.test.ts` [9])**
  - `npm run build`: **Compilação de produção Next.js 15 concluída com sucesso**

---

### 3. Auditoria Completa dos 229 Spots de `ranges_gto.json` e Causa Raiz do `0.964`

Foram auditadas todas as **38.701 células** (`229 spots × 169 classes de mãos`) de `app/src/data/ranges_gto.json`:

| Categoria de Soma das Frequências na Célula | Quantidade de Células | % do Total (38.701) | Diagnóstico Técnico |
|---|---:|---:|---|
| `soma === 1.000` (exata) | **38.341** | `99,070%` | Células de ação pura (`1.0`) ou divisões que arredondam exatamente para `1.000`. |
| `0 < \|soma - 1.0\| <= 0.002` (`0.999` ou `1.001`) | **337** | `0,871%` | Arredondamento independente a 3 casas decimais (`round(v / s, 3)`) em células com 2 ou 3 cores em `pipeline/extract_ranges.py` (linha 200). |
| `0.976 <= soma <= 0.988` (`20` em `0.988`, `1` em `0.976`) | **21** | `0,054%` | Perda de 1 coluna (`1/84 ≈ 0.012`) ou 2 colunas (`2/84 ≈ 0.024`) de pixels na transição cromática entre barras ou anti-aliasing de fonte, descartadas após normalização. |
| `soma === 0.964` (`\|soma - 1.0\| = 0.036`) | **2** | `0,005%` | **`17bb_sb_vs_utg_rfi/AA`** (`Allin 17: 0.571, Call: 0.393`) e **`20bb_btn_vs_mp_rfi/KK`** (`Call: 0.952, Allin 20: 0.012`). |

#### Causa Raiz Exata das Células `17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK` (`soma = 0.964`)

1. **Amostragem horizontal de 84 colunas de pixels por célula (`extract_matrix`, linhas 179–196 de `pipeline/extract_ranges.py`):**
   - Na fronteira entre a barra vermelha de All-in (`crimson_2`, RGB `216, 59, 59`) e a barra verde de Call (`green`, RGB `90, 185, 102`), somada ao anti-aliasing do PDF renderizado a `scale=2.0`, exatamente **3 colunas de pixels** (`3 / 84 = 0.035714... ≈ 0.036`) possuem cor intermediária classificada como `coral_1` (RGB `245, 83, 83`).
2. **Normalização prematura ANTES da filtragem de ações do spot (`extract_matrix`, linhas 198–200):**
   - `extract_matrix` normaliza os contadores da célula dividindo pelo total `s = 84` **incluindo a cor espúria `coral_1`**.
3. **Truncamento no `raw_summary` global e descarte silencioso (`extract_pdf_ranges`, linhas 203 e 369–388):**
   - Como `coral_1` aparece apenas como ruído de borda (`0.016%` da matriz), `raw_summary['coral_1']` arredonda para **`0.0`**, excluindo `coral_1` do `color_map` sem renormalizar as ações legítimas da célula (`0.571 + 0.393 = 0.964` e `0.952 + 0.012 = 0.964`).

> **Decisão de Engenharia (Regra 5 da Etapa 1):** Os dados brutos de `ranges_gto.json` **não foram normalizados artificialmente**. Eles permanecem preservados como evidência auditável (`status: "IMPORTED_CHART_NO_EV"`), e `adaptLegacyRangeSpotToCanonical` emite `validationWarnings` explícitos.

---

### 4. Limitações Matemáticas Documentadas

1. **Equações de Pot Odds, Fold Equity de Blefe, Fração Polarizada no River e MDF (`app/src/lib/poker/mathEngine.ts`):**
   - Assumem um modelo estático de **1 street final (river ou all-in)**, **heads-up**, **sem rake**, **sem side pots** e com **100% de realização de equidade** (`R = 1.0`).
   - Em *streets* não-finais (flop/turn), a defesa ótima do solver diverge do MDF teórico (`P / (P + B)`) devido à realização futura de equidade e vantagem posicional/de nuts.
2. **Modelo ICM de Malmuth-Harville (`calculateIcm` e `calculateBubbleFactor`):**
   - Limitado a `<= 10` jogadores ativos por usar programação dinâmica exata por máscara de bits (`O(m · 2^m)`).
   - Ignora rotação futura dos blinds, assimetria de habilidade (*skill edge*) e colisões multiway futuras.
3. **Modelo de Bounty em Torneios PKO (`evaluatePkoBountyModel`):**
   - Converte o *bounty imediato capturável* (`50%` quando `heroCoversVillain === true`) em fichas equivalentes via `bountyChipFactor`, mas **não substitui uma árvore de solver PKO completa**.
4. **Comparação de Sizings (`compareActionSizings` em `app/src/lib/poker/spotReasoning.ts`):**
   - Mede o $\Delta EV$ de cada sizing mantendo fixa a estratégia do oponente na árvore atual; suprimir um sizing do range inteiro altera a resposta ótima do vilão e exige *re-solve* completo para quantificação global.

---

## ETAPA 2 — Integração do Currículo RegLife (`app/src/lib/poker/reglifeCatalog.ts` e `app/src/components/CurriculumView.tsx`)

1. **Preservação das 7 Trilhas Fundamentais:** Mantidas integralmente (`PREFLOP_RFI`, `FLOP_CBET_IP_VS_BB`, `TURN_RIVER_CBET_IP_VS_BB`, `PREFLOP_VS_RFI`, `PREFLOP_BB_DEFENSE`, `PREFLOP_SB_VS_BB`, `POSTFLOP_BB_VS_CBET`).
2. **Integração das 18 Aulas da Série RegLife (`REGLIFE_18_LESSONS`) + 7 Vídeos Complementares (`REGLIFE_SUPPLEMENTAL_VIDEOS`):**
   - Cada uma das 18 aulas está vinculada a uma trilha existente e apresenta: **conceito central**, **link oficial do vídeo**, **timestamps verificados** (nas 15 aulas com transcrição analisada), **exemplos práticos de mesa**, **quiz interativo de 4 alternativas com explicação** e **exercícios vinculados** com lançamento direto no Treinador.
3. **Transparência Epistêmica sobre Transcrições:**
   - **15 aulas com transcrição verificada (`transcriptStatus: "analisada"`, `hasVerifiedTranscript: true`, `evidenceType: "VIDEO_CONCEPT"`):** Spots 02, 03, 04, 05, 06, 09, 10, 11, 12, 13, 14, 15, 16, 17 e 18.
   - **3 aulas sem transcrição pública verificada (`transcriptStatus: "indisponível"`, `hasVerifiedTranscript: false`, `evidenceType: "METADATA_HYPOTHESIS"`):**
     - **Spot #01 (`_Wl17geMXmc`)** — RFI por posição;
     - **Spot #07 (`teUFXaRa27E`)** — Defesa contra C-bet no Turn;
     - **Spot #08 (`CUNOCNobeZo`)** — Defesa contra C-bet no River.
   - Essas 3 unidades exibem um alerta âmbar explícito informando que o conteúdo deriva exclusivamente de título/metadados públicos e do encadeamento pedagógico da série.
4. **Separação Tripla de Domínios (`separationOfDomains`):**
   - Cada aula separa visualmente: (a) **Conteúdo Educacional**, (b) **Heurística Explorativa Condicionada** e (c) **Especificação Matemática GTO Exata**.

---

## ETAPA 3 — Evolução do Treinador (`app/src/lib/poker/spotReasoning.ts`, `drillEvaluator.ts`, `mathEngine.ts` e `TrainerView.tsx`)

1. **Dois Modos Independentes de Treino (`LEARNING` vs `GTO_TECHNICAL`):**
   - **Modo Aprendizagem (`LEARNING`):** Permite praticar com todo o catálogo (`VERIFIED`, `DIDACTIC_DEMO`, `IMPORTED_CHART_NO_EV` e `UNSOLVED`), priorizando compreensão causal, quizzes e fixação conceitual.
   - **Modo GTO Técnico (`GTO_TECHNICAL`):** Filtra e exige estritamente spots com status `VERIFIED`. Qualquer tentativa de avaliar um spot não verificado em `GTO_TECHNICAL` é bloqueada por `assertSpotAllowedInTechnicalGtoMode` e `evaluateDrillDecision`.
2. **Estratégias Mistas e Randomizador Reproduzível (`createSeededRng`):**
   - Suporte a seed determinística opcional (ex.: `reglife-seed-42`) para reproduzir sequências exatas de rolagens `1..100`, acompanhada de barra visual de partição de frequências das ações legais.
3. **Comparação Matemática de Sizings (`compareActionSizings`):**
   - Quando há múltiplos sizings com EV conhecido na matriz da mão, exibe tabela comparativa com `EV`, `ΔEV vs Melhor Ação`, `% do Pote` e classificação (`OPTIMAL`, `VIABLE_SIMPLIFICATION`, `MODERATE_LOSS`, `COSTLY_ERROR`), acompanhada da nota metodológica sobre *re-solve*.
4. **Painel de Raciocínio Estruturado (`analyzeSpotReasoning`):**
   - Apresenta **Range Advantage**, **Nut Advantage**, **Blockers & Card Removal** (com `riverBluffCandidateHeuristic` explicitamente rotulado como `HEURISTIC_EXPLANATION_ONLY`) e **Realização de Equidade (`R`)**.

---

## ETAPA 4 — Integração de Soluções (`app/src/lib/poker/solverAdapter.ts`)

1. **Adaptador Versionado (`SOLVER_ADAPTER_VERSION = "1.0.0"`, `importExternalSolverSolution`):**
   - Valida rigorosamente: `schemaVersion`, `format`, `variant`, `effectiveStackBb`, `blinds`, `anteBbPerPlayer`, `rakePct`, `playersCount`, `seats` (incluindo `bountyUsd` obrigatório em `PKO_BOUNTY` e `payoutsUsd` obrigatório em `ICM`), `heroPosition`, `villainPosition`, `actionHistory`, `board` compatível com a `street` e sem cartas duplicadas, `potSizeBb`, `sizings` e compatibilidade entre `icmMode` e `evUnit` (`bbEV` vs `$EV`).
2. **Verificação de Soma de Frequências e Consistência de Equilíbrio de EV (`validateCellFrequencyAndEvConsistency`):**
   - Verifica `soma = 1.0 ± 0.005` por célula.
   - Verifica consistência de indiferença de Nash: nenhuma ação com frequência ativa significativa (`>= 8%`) pode ter EV substancialmente inferior à melhor ação, e nenhuma ação com `0%` de frequência pode ter EV estritamente superior à melhor ação ativa.
3. **Proveniência e Hash Determinístico (`assumptionsHash`):**
   - Registra `solverName`, `solverVersion`, `abstraction`, `convergenceTargetPct`, `achievedExploitabilityPct`, `license` e gera hash determinístico FNV-1a (`fnv1a_...`).
4. **Preservação Estrita de Soluções Incompletas/Incompatíveis como `UNSOLVED`:**
   - Qualquer falha de validação mantém o spot com `status: "UNSOLVED"`, `matrixFrequencies: null` e `matrixEv: null`, sem jamás inventar ranges, frequências ou EVs.
5. **Auditoria de Integridade dos 9 Spots Anteriormente Declarados `VERIFIED` (`buildVerifiedSolverReferenceCatalog` — veja `docs/AUDITORIA_GTO_VERIFICADO.md`):**
   - Na Auditoria de Integridade, foi comprovado que os 9 spots anteriormente declarados como `VERIFIED` foram construídos manualmente em código sem execução de solver externo. A classificação `VERIFIED` foi **integralmente revogada**:
     - **3 spots reclassificados como `DIDACTIC_DEMO` (sem `matrixEv` e sem geração de EV loss GTO):**
       - `verified_mtt_8max_30bb_btn_rfi_v1`
       - `verified_mtt_8max_15bb_btn_rfi_short_v1`
       - `verified_postflop_btn_vs_bb_ahkd7c_v1`
     - **6 spots reclassificados como `UNSOLVED` (`matrixFrequencies: null`, `matrixEv: null`):**
       - `verified_mtt_8max_20bb_bb_vs_btn_v1`
       - `verified_postflop_bb_vs_btn_cbet_8s7s5d_v1`
       - `verified_river_polarized_btn_vs_bb_v1`
       - `verified_icm_ft_6max_20bb_sb_vs_btn_v1`
       - `verified_icm_50pct_field_30bb_co_vs_mp_v1`
       - `verified_pko_8max_25bb_btn_vs_sb_shove_v1`

---

## ETAPA 5 — Diagnóstico Adaptativo (`app/src/lib/poker/adaptiveDiagnostics.ts` e `app/src/components/StatsView.tsx`)

1. **Histórico Persistente Estruturado (`ADAPTIVE_STORAGE_KEY_V2`):**
   - Persiste cada exercício com `trainerMode`, `spotId`, `handClass`, `chosenAction`, `referenceStrategySummary` (`status`, `dominantAction`, `chosenFreq`), `evLoss`, `evUnit` e `confidenceLevel` (`baixa`, `media`, `alta`).
2. **Taxonomia e Ranking de Leaks (`classifyAttemptLeak`, `classifyAndRankLeaks`):**
   - Classifica erros em 8 categorias (`missed_value_bets`, `overbluff`, `underdefend_bb`, `bad_3bet_size`, `icm_call_errors`, `pko_coverage_errors`, `preflop_rfi_deviation`, `postflop_cbet_error`) e ranqueia por frequência, EV loss médio e peso de ponto cego (`1.35×` quando o aluno erra com confiança `alta`).
3. **Repetição Espaçada Leitner Adaptativa (`computeSpacedRepetitionSchedule`):**
   - Caixas `0` a `5` com intervalos de `0, 1, 3, 7, 14 e 30 dias`.
   - Erros ou `EV loss > 0.05` retornam o spot imediatamente para a **Caixa 0 (`Revisar Agora`)**; acertos com confiança `baixa` permanecem na **Caixa 1 (`1 dia`)** para consolidação; acertos com confiança `media`/`alta` avançam de caixa.
4. **Acompanhamento Multidimensional (`computeDimensionalProgress`):**
   - Relatórios tabulares e indicadores de qualidade amostral (`amostra_insuficiente (<10)`, `amostra_em_formacao (10-29)`, `amostra_solida (>=30)`) segmentados por:
     - **Posição** (`UTG` a `BB`)
     - **Stack Efetivo** (`<=15 BB`, `17–20 BB`, `25–30 BB`, `50 BB`, `100 BB`)
     - **Formato de Torneio** (`MTT Vanilla chipEV`, `MTT Vanilla ICM $EV`, `MTT PKO Bounty`, `Spin & Go / SNG`)
     - **Street** (`PREFLOP`, `FLOP`, `TURN`, `RIVER`)

---

## ETAPA 6 — Primeira Solução GTO Real e Verificável (`pipeline/solve_texassolver.py`, `solverFormats.ts` e `verified_ahkd7c_texassolver.json`)

> Documentação completa em [PRIMEIRO_SPOT_GTO_REAL.md](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/docs/PRIMEIRO_SPOT_GTO_REAL.md).

1. **Endurecimento do Adaptador (`SOLVER_ADAPTER_VERSION = "1.1.0"`, `solverAdapter.ts` e `strategySchema.ts`):**
   - Passa a exigir hash SHA-256 criptográfico de 64 caracteres hexadecimais (`fileSha256`), data ISO válida (`createdAtIso`), metadados explícitos de ranges, histórico pré/pós-flop não vazio, validação de `potSizeBb >= blinds + antes`, consistência legal de `sizings` contra `toCallBb` e `effectiveStackBb`, além de bloqueio de cartas mortas do board.
   - Removidos da UI ([TrainerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/TrainerView.tsx)) o bypass legado `validateAndBuildVerifiedStrategy` e o botão sintético `"Carregar Exemplo Válido (VERIFIED)"`, mantendo sanitização em [PokerStudioApp.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/PokerStudioApp.tsx) para descartar caches antigos sem SHA-256.
2. **Pipeline Reproduzível com `TexasSolver v0.2.0` (AGPL-3.0, binário externo ao Git):**
   - [solve_texassolver.py](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solve_texassolver.py) configura o spot **BTN vs BB SRP 30BB chipEV no Flop `Ah Kd 7c`** com ranges de [ranges_gto.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/data/ranges_gto.json) (`30bb_rfi_btn` Raise = 101 classes / 563 combos vivos; `30bb_bb_vs_btn_rfi` Call = 132 classes), escala `10×` (`pot=57`, `effective_stack=279`), atingindo **`0.41485%` de exploitability em 60 iterações** (abaixo do alvo `0.5%`, pico de commit RAM `1771.3 MB`).
   - Como a CLI do `TexasSolver v0.2.0` não exporta EV por ação no JSON `dump_result`, `importTexasSolverBundle` preserva `matrixEv = null`, `evUnit = null` e `evScored = false` no `drillEvaluator.ts`, liberando o spot no Modo GTO Técnico apenas para frequências reais (`Check`, `Bet_33pct`, `Bet_75pct`) e combos individuais.
3. **Importador CSV do `Desktop Postflop` com `EV loss` real (`solverFormats.ts`):**
   - `parseDesktopPostflopCsvToPayload` e `computeSha256Hex` (WebCrypto) permitem importar arquivos `.csv` exportados do `Desktop Postflop` (`<Action> %` e `<Action> EV`), desbloqueando `EV loss` em `bbEV` e `compareActionSizings`.

---

## Pendências e Próximos Passos Recomendados (Roadmap Futuro)

1. **Obtenção das Transcrições Faltantes (Spots 01, 07 e 08):**
   - Quando as transcrições de `_Wl17geMXmc` (Spot 01), `teUFXaRa27E` (Spot 07) e `CUNOCNobeZo` (Spot 08) estiverem disponíveis por via autorizada, atualizar `reglifeCatalog.ts` de `METADATA_HYPOTHESIS` para `VIDEO_CONCEPT` com seus respectivos timestamps.
2. **Importação de EV por Ação via `Desktop Postflop` e Expansão Multi-Street (`Turn` e `River`):**
   - Exportar este mesmo spot (`BTN vs BB SRP 30BB Ah Kd 7c`) ou novas texturas/linhas (check-raise, turn, river) em CSV pelo `Desktop Postflop` (ou solver com exportação de EV) para ativar `evScored = true` e `EV loss` numérico além das frequências reais.
3. **Reextração Opcional do Pipeline PDF (`pipeline/extract_ranges.py`):**
   - Caso deseje regerar `ranges_gto.json` no futuro, restringir `classify_pixel` às cores detectadas na legenda da página (`detect_legend_colors`) antes de normalizar as 84 colunas por célula.

---

## Como Executar e Validar

```bash
cd app

# 1. Linter estático (ESLint v9 Flat Config + Next.js Core Web Vitals + TypeScript)
npm run lint

# 2. Checagem de tipos TypeScript
npm run typecheck

# 3. Suíte de testes unitários e auditoria (29 testes em 7 suítes)
npm test

# 4. Build de produção Next.js (verificado com Next.js 15.5.29)
npm run build
```
