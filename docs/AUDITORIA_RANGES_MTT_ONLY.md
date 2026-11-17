# AUDITORIA DE RANGES E PADRONIZAÇÃO EXCLUSIVA PARA TORNEIOS MTT (`MTT-ONLY`)

**Projeto:** `Projeto-Poker` / **TreinerLM**  
**Data:** 16/11/2026  
**Regra de escopo aplicada:** Os treinos estratégicos e seletores de ranges do **TreinerLM** exibem e treinam **exclusivamente conjuntos com proveniência confirmada de torneios Multi-Table Tournament (MTT)**. Todos os arquivos de origem (`ranges_gto.json`, `verified_ahkd7c_texassolver.json`, gráficos e históricos SQLite) permanecem intactos para auditabilidade.

---

## 1. INVENTÁRIO COMPLETO E CLASSIFICAÇÃO POR EVIDÊNCIA

A classificação foi implementada em [`app/src/lib/poker/mttCatalog.ts`](../app/src/lib/poker/mttCatalog.ts) seguindo critérios estritos:
- Classificação baseada em **origem declarada (`source` / `solutionSource.fileOrReference`)**, **formato explícito (`format` / `assumptions.format`)** e **nomenclatura/ID auditáveis**.
- **Nunca classifica apenas por stack efetivo ou tamanho da mesa** (um heads-up ou spot de 14 BB pode ser de MTT ou Spin).
- **Nunca promove `FORMAT_UNKNOWN` automaticamente a `MTT_CONFIRMED`**.
- **Nunca altera frequências nem adapta artificialmente ranges de Spin & Go para simular MTT**.

### 1.1 Resumo Quantitativo do Acervo Auditado

| Conjunto / Arquivo | Total Inspecionado | `MTT_CONFIRMED` | `SPIN_AND_GO_CONFIRMED` | `CASH_GAME_CONFIRMED` | `FORMAT_UNKNOWN` | Ação na UI Estratégica |
|---|---:|---:|---:|---:|---:|---|
| `app/src/data/ranges_gto.json` (pré-flop extraído) | **229** | **216** | **13** | 0 | 0 | Exibidos apenas os **216 MTT** |
| `app/src/data/verified_ahkd7c_texassolver.json` (TexasSolver pós-flop real) | **1** | **1** (`VERIFIED`, `chipEV`) | 0 | 0 | 0 | Exibido no Modo GTO Técnico e Construtor |
| `curriculum.ts` + `solverAdapter.ts` (catálogo didático / conceitual) | **13** deduplicados | **13** (`4 DIDACTIC_DEMO`, `9 UNSOLVED`) | 0 | 0 | 0 | Exibidos apenas no Modo Aprendizagem |
| **Catálogo Estratégico Unificado em Runtime (`PokerStudioApp`)** | **243 brutos → 230 ativos** | **230 MTT ativos** | **13 excluídos** | **0** | **0** | **100% MTT** nos treinos e explorador |

> **Observação sobre modalidades MTT no catálogo ativo (230 spots deduplicados):**
> - **MTT chipEV (`MTT_CHEV`):** 216 matrizes pré-flop (PDF 8-Max com Ante `0.125 BB`) + 1 pós-flop TexasSolver (`Ah Kd 7c`) + 7 spots didáticos/UNSOLVED (`chipEV`).
> - **MTT com ICM (`MTT_ICM`):** 2 cenários conceituais `UNSOLVED` (`verified_icm_ft_6max_20bb_sb_vs_btn_v1`, `verified_icm_50pct_field_30bb_co_vs_mp_v1`) — sem solver ICM inventado.
> - **MTT PKO / Bounty (`MTT_PKO`):** 1 cenário conceitual `UNSOLVED` (`verified_pko_8max_25bb_btn_vs_sb_shove_v1`) + modelo matemático heurístico dedicado e separado no `Lab EV & ICM` (`evaluatePkoBountyModel`).
> - Os badges antigos do `Explorador` e do `TrainerView` permitem filtrar explicitamente entre `MTT chipEV`, `MTT ICM ($EV)` e `MTT PKO (Bounty)`, exibindo aviso honesto de ausência de solver quando ICM/PKO não possui matriz resolvida.

---

## 2. DETALHAMENTO DOS RANGES MTT CONFIRMADOS (216 PRÉ-FLOP)

- **Proveniência:** `PDF - Ranges RFI e vs RFI.pdf` (múltiplas páginas citadas explicitamente em `spot.source` e referenciadas também pelo manifesto de solução MTT 8-Max `AhKd7c`).
- **Estrutura de mesa:** 8-Max MTT (`UTG`, `UTG+1`/`MP`, `LJ`, `HJ`, `CO`, `BTN`, `SB`, `BB`), Ante por jogador `0.125 BB`.
- **Stacks efetivos cobertos:** `14 BB`, `17 BB`, `20 BB`, `30 BB`, `50 BB`, `100 BB`.
- **Situações (`spotType`):**
  - `rfi`: **42 spots** (Open Raise / All-in 14 BB em MTT)
  - `vs_rfi`: **168 spots** (Call / 3-Bet / Squeeze contra abertura)
  - `vs_limp`: **6 spots** (Iso-raise / Check do BB contra Limp do SB)
- **Auditoria de integridade numérica das 36.504 células MTT:**
  - `337` células possuem desvio residual trivial de arredondamento de OCR (`<= 0.002`).
  - `21` células possuem perda leve de soma na extração (`0.002 < |1 - soma| <= 0.03`).
  - `2` células em `2` spots (`17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK`) apresentam soma `0.964` (`> 0.03` de perda de extração).
  - **Nenhuma célula foi normalizada artificialmente em `ranges_gto.json`** (SHA-256 preservado: `d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e`). A função `auditMatrixDistributionIntegrity()` em `strategySchema.ts` separa agora os dois casos para transparência na interface do `Explorador de Ranges`.

---

## 3. RELAÇÃO COMPLETA DOS 13 SPOTS EXCLUÍDOS (`SPIN_AND_GO_CONFIRMED`)

Todos os **13 spots** abaixo provêm de screenshots PNG de tabelas 3-Max de Spin & Go (`4. Pré-Flop/*.png`), foram classificados como `SPIN_AND_GO_CONFIRMED` e **excluídos da UI estratégica, seletores, presets e agendamento de repetição espaçada**, sem alteração do JSON original:

| # | `spotId` | Nome no JSON | Origem (`source`) | Stack | Tipo | Classificação |
|---:|---|---|---|---:|---|---|
| 1 | `spin_15bb_btn_shove` | Spin&Go 15BB - BTN Shove | `4. Pré-Flop/Botão.png` | 15 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 2 | `spin_10bb_btn_shove` | Spin&Go 10BB - BTN Shove | `4. Pré-Flop/Botão.png` | 10 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 3 | `spin_5bb_btn_shove` | Spin&Go 5BB - BTN Shove | `4. Pré-Flop/Botão.png` | 5 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 4 | `spin_3bb_btn_shove` | Spin&Go 3BB - BTN Shove | `4. Pré-Flop/Botão.png` | 3 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 5 | `spin_15bb_co_shove` | Spin&Go 15BB - CO Shove | `4. Pré-Flop/Cutoff.png` | 15 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 6 | `spin_10bb_co_shove` | Spin&Go 10BB - CO Shove | `4. Pré-Flop/Cutoff.png` | 10 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 7 | `spin_5bb_co_shove` | Spin&Go 5BB - CO Shove | `4. Pré-Flop/Cutoff.png` | 5 BB | `push_fold` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 8 | `spin_15bb_btn_call` | Spin&Go 15BB - BTN vs Shove Call | `4. Pré-Flop/Botao - Call.png` | 15 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 9 | `spin_10bb_btn_call` | Spin&Go 10BB - BTN vs Shove Call | `4. Pré-Flop/Botao - Call.png` | 10 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 10 | `spin_5bb_btn_call` | Spin&Go 5BB - BTN vs Shove Call | `4. Pré-Flop/Botao - Call.png` | 5 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 11 | `spin_15bb_bb_call` | Spin&Go 15BB - BB vs Shove Call | `4. Pré-Flop/BigBlind - Call.png` | 15 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 12 | `spin_10bb_bb_call` | Spin&Go 10BB - BB vs Shove Call | `4. Pré-Flop/BigBlind - Call.png` | 10 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |
| 13 | `spin_5bb_bb_call` | Spin&Go 5BB - BB vs Shove Call | `4. Pré-Flop/BigBlind - Call.png` | 5 BB | `vs_shove` | `SPIN_AND_GO_CONFIRMED` (Excluído) |

---

## 4. PONTOS DE BLOQUEIO E FILTRAGEM IMPLEMENTADOS NA APLICAÇÃO

1. **Orquestrador Principal (`PokerStudioApp.tsx`):** Filtra `spots` por `filterConfirmedMttLegacySpots` (`216` MTT) e `canonicalSpots` por `filterConfirmedMttCanonicalSpots` (`230` MTT) antes de distribuir para todos os módulos.
2. **Treiner Limpo (`CleanRangeTrainerView.tsx`):** Opera apenas sobre `mttSpots`; botões `Push/Fold` e `vs Shove` permanecem desabilitados com aviso de indisponibilidade MTT; `localStorage` rejeita IDs `spin_*` / `cash_*` salvos anteriormente.
3. **Modo Trainer (`TrainerView.tsx`):** Opções `<option value="SNG">` e `<option value="spin">` removidas; substituídas por seletor de **Modalidade MTT** (`chipEV`, `ICM ($EV)`, `PKO`) e stacks dinâmicos MTT (`14`, `17`, `20`, `28`, `30`, `50`, `100`). O importador externo `SolverAdapter` bloqueia a entrada de payloads `SNG` ou `CASH` no pool ativo de treino.
4. **Explorador de Ranges (`RangeExplorerView.tsx`):** Badges `(Spin)` removidos; abre exclusivamente nos 6 stacks MTT (`14..100 BB`), com comparador limitado aos 216 spots MTT e seletor explícito de modalidade.
5. **Construtor de Ranges & Decisões por Street (`InteractiveDrillsLab.tsx`):** Aplicam `filterConfirmedMttCanonicalSpots` sobre todos os cenários exibidos.
6. **Repetição Espaçada (`adaptiveDiagnostics.ts`):** `computeSpacedRepetitionSchedule` ignora qualquer registro legado `spin_*` ou `cash_*` remanescente em `localStorage`.
7. **AI Coach (`AiCoachView.tsx` e `api/coach/route.ts`):** System prompt ajustado para estudo offline exclusivo de torneios MTT (chipEV, ICM e PKO); sugestão rápida de Spin & Go substituída por cenário MTT 30 BB.
8. **Estatísticas (`StatsView.tsx`):** Rótulos estratégicos atualizados para MTT 8-Max (`SPOT_TYPE_LABELS` e `HEATMAP_STACKS = [14, 17, 20, 25, 28, 30, 40, 50, 75, 100]`). Registros históricos antigos de Spin/Cash eventualmente já gravados no `localStorage` passam a ser rotulados como arquivo legado, sem poluir os treinos ativos.

---

## 5. VERIFICAÇÃO EM TESTES AUTOMATIZADOS E INTEGRIDADE DOS ARTEFATOS

- Suíte dedicada em `app/src/lib/__tests__/refinamentoMtt2026.test.ts` valida:
  - Contagens exatas (`229` legados = `216` MTT + `13` Spin + `0` Cash + `0` Unknown);
  - Não promoção de spots HU/14 BB sem proveniência MTT e exclusão de spots Cash explícitos;
  - Remoção completa de `Spin` em SSR para `PokerStudioApp`, `CleanRangeTrainerView` e `RangeExplorerView`, e no agendador Leitner;
  - Preservação bit-a-bit do SHA-256 original de `app/src/data/ranges_gto.json` (`d46652c5...cb60e`) e `app/src/data/verified_ahkd7c_texassolver.json` (`868ef9fb...3eda`).
