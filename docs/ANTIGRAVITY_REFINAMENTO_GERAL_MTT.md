# TREINERLM (`Projeto-Poker`) — Relatório Técnico de Refinamento Geral, Padronização MTT-Only e Estabilização (2026)

**Repositório:** `Projeto-Poker` (interface desktop/web **TreinerLM**)  
**Branch / Baseline Git:** `main` · commit `7a0d5d8` (nenhum commit automático foi criado; nenhuma alteração destrutiva executada)  
**Autoria das auditorias anteriores validadas:** `docs/AUDITORIA_GERAL_ESTADO_ATUAL_2026.md`, `docs/AUDITORIA_VISUAL_TIPOGRAFICA_2026.md`, `docs/AUDITORIA_BACKLOG_PRIORIZADO.md`, `docs/AUDITORIA_INVENTARIO_FUNCIONALIDADES.csv`, `docs/AUDITORIA_TOKENS_VISUAIS.csv`  
**Inventário detalhado de ranges:** [`docs/AUDITORIA_RANGES_MTT_ONLY.md`](./AUDITORIA_RANGES_MTT_ONLY.md)  
**Idioma:** Português brasileiro (pt-BR)

---

## 1. Controle, Preservação de Dados e Baseline

Antes de qualquer alteração no código, o baseline do repositório foi registrado e todos os arquivos críticos de dados do usuário e soluções GTO originais tiveram seus resumos criptográficos (`SHA-256`) medidos e verificados:

| Ativo Protegido | Papel | SHA-256 Verificado (Antes = Depois) |
|---|---|---|
| `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3` | Banco SQLite pessoal da Biblioteca de Mãos | `4135CFA81B7FE4F8927708E77ED66F665F3C0DAC5474D042D75FF74D56E5FB1A` |
| `app/src/data/ranges_gto.json` | 229 charts originais extraídos (MTT + Spin) | `D46652C5BFE3CED09073FA68544E134683499F18EABDABEF8202D9EE351CB60E` |
| `app/src/data/verified_ahkd7c_texassolver.json` | Solução pós-flop TexasSolver (`Ah Kd 7c`) | `868EF9FB8E6371F12DDE7749170015AF4FACCA70AF92DC33AA45251CDD0B3EDA` |

Durante todos os testes em navegador real (Microsoft Edge via CDP) e APIs locais (`/api/hand-library`), utilizou-se exclusivamente um banco temporário descartável em diretório de trabalho isolado (`POKER_LIBRARY_DATABASE` fora do diretório do repositório) e perfil temporário de navegador. Nenhuma mão pessoal do usuário, frequência de chart ou manifesto TexasSolver foi modificada.

---

## 2. Regra Definitiva de Escopo: Exclusivamente Torneios MTT

Foi implementada a camada central [`app/src/lib/poker/mttCatalog.ts`](../app/src/lib/poker/mttCatalog.ts) com classificação explícita em quatro categorias (`MTT_CONFIRMED`, `SPIN_AND_GO_CONFIRMED`, `CASH_GAME_CONFIRMED`, `FORMAT_UNKNOWN`), vedando a classificação por stack ou número de jogadores e jamais promovendo registros desconhecidos a MTT.

### 2.1 Inventário Classificado de `ranges_gto.json`

- **Total bruto preservado em arquivo:** `229` spots (`38.701` células)
- **`MTT_CONFIRMED`:** `216` spots (`PDF - Ranges RFI e vs RFI.pdf`, 8-Max, `Ante 0,125 BB`, stacks `[14, 17, 20, 30, 50, 100]` BB):
  - `42` spots `rfi`
  - `168` spots `vs_rfi`
  - `6` spots `vs_limp`
- **`SPIN_AND_GO_CONFIRMED` (excluídos dos treinos ativos):** `13` spots (`4. Pré-Flop/*.png`, 3-Max Spin & Go em `3/5/10/15 BB`, `push_fold` / `vs_shove` / `vs_limp` / `rfi`)
- **`CASH_GAME_CONFIRMED`:** `0` spots
- **`FORMAT_UNKNOWN`:** `0` spots

### 2.2 Catálogo Canônico Ativo e Exclusão em Cadeia

Ao mesclar e deduplicar por `spotId` em [`PokerStudioApp.tsx`](../app/src/components/PokerStudioApp.tsx):
- `216` charts MTT pré-flop confirmados (`IMPORTED_CHART_NO_EV`)
- `1` solução pós-flop real verificada no TexasSolver (`verified_ahkd7c_texassolver.json` — `BTN vs BB SRP 30BB chipEV — Ah Kd 7c`)
- `13` spots didáticos/conceituais MTT deduplicados (`DIDACTIC_DEMO` / `UNSOLVED` de `curriculum.ts` / `solverAdapter.ts`)
- **Total ativo no TreinerLM:** **`230` spots MTT**.

Os spots `spin_*` e qualquer entrada não-MTT são filtrados por `filterConfirmedMttLegacySpots`, `filterConfirmedMttCanonicalSpots` e `isSpotIdExcludedFromMtt` em:
- `PokerStudioApp.tsx` (contadores do header e seletores globais);
- `TrainerView.tsx` (remoção das opções `SNG` e `spin` e bloqueio explícito na importação JSON/CSV de spots Cash/SNG/desconhecidos);
- `CleanRangeTrainerView.tsx` (`mttSpots`, bloqueio de IDs excluídos inclusive na restauração de `localStorage`);
- `RangeExplorerView.tsx` (apenas stacks MTT `14/17/20/30/50/100 BB`, sem badge `(Spin)`, com seletores transparentes `MTT chipEV`, `MTT com ICM ($EV)` e `MTT PKO (Bounty)` indicando `"Sem solver"` quando indisponível localmente);
- `InteractiveDrillsLab.tsx` (apenas spots MTT);
- `adaptiveDiagnostics.ts` (`computeSpacedRepetitionSchedule` ignora registros com `isSpotIdExcludedFromMtt`).

---

## 3. Auditoria de Integridade das Matrizes (`strategySchema.ts`)

Para garantir transparência matemática absoluta sem auto-normalização silenciosa de `ranges_gto.json`, foi implementada `auditMatrixDistributionIntegrity` (`MatrixIntegrityAudit`) em [`app/src/lib/poker/strategySchema.ts`](../app/src/lib/poker/strategySchema.ts), anexada a `ReferenceStrategy.integrityAudit` sem alterar nenhum valor do JSON bruto (`neverAutoNormalized: true`):

- **Separação técnica entre erro de arredondamento e perda de extração:**
  - Arredondamento trivial (`|soma - 1| <= 0,002`): **337** células nos 216 spots MTT (em vez de inflar alarmes sobre os 360 totais antigos).
  - Desvio menor de extração (`0,002 < |soma - 1| <= 0,03`): **21** células no recorte MTT.
  - Desvio severo de extração (`|soma - 1| > 0,03`): **2** células em **2** spots (`17bb_sb_vs_utg_rfi` / `AA` com soma `0.964` e `20bb_btn_vs_mp_rfi` / `KK` com soma `0.964`).
- `RangeExplorerView.tsx` exibe aviso dedicado em pt-BR quando `integrityAudit.hasUnreliableCells` for verdadeiro, listando as células afetadas e preservando os números originais para auditoria.

---

## 4. Segurança e Controle dos Endpoints Locais

Para sanar o achado **`[P0-01]`** sobre a exposição do endpoint `/api/coach` sem exigir `POKER_LIBRARY_ENABLED`:

1. [`app/src/lib/server/libraryAccess.ts`](../app/src/lib/server/libraryAccess.ts):
   - Extraído helper compartilhado `assertLoopbackOriginAndHeaders` validando host loopback (`127.0.0.1` / `localhost` / `[::1]`), `Origin` coincidente em requisições mutáveis (`POST`), ausência de `Sec-Fetch-Site: cross-site` e cabeçalho específico de origem interna.
   - Criada função `assertCoachAccess(req)` exigindo cabeçalho `x-poker-coach: local-v1` (independentemente de `POKER_LIBRARY_ENABLED`).
2. [`app/src/app/api/coach/route.ts`](../app/src/app/api/coach/route.ts):
   - Aplica `assertCoachAccess(req)`;
   - Aplica **rate limiter** local (`20` requisições por minuto por origem, retornando `429`);
   - Impõe leitura limitada de corpo (`limitedBody(..., 6 MiB)` via helper de stream/tamanho);
   - Valida tamanho de prompt, quantidade de histórico e tipo/tamanho de imagem base64;
   - Redaciona qualquer fragmento de chave API em mensagens de erro retornadas ao cliente;
   - Restringe explicitamente as instruções do prompt de sistema ao **estudo offline de torneios MTT**.
3. [`AiCoachView.tsx`](../app/src/components/AiCoachView.tsx) e [`SettingsModal.tsx`](../app/src/components/SettingsModal.tsx) passaram a enviar `"X-Poker-Coach": "local-v1"` (assim como `TrainerView.tsx` na função `askCoach`).

---

## 5. Integridade Matemática, Combinatória e Estatística

1. **`[P0-02]` Aderência mista invariante à ordem (`drillEvaluator.ts`):**
   - `computeMixedAdherenceStats` em [`app/src/lib/poker/drillEvaluator.ts`](../app/src/lib/poker/drillEvaluator.ts) deixou de depender de chaves simples e ordem de chegada dos registros. Passou a agrupar tentativas por `(spotId, hand, canonicalTargetSignature)`, computar a distribuição empírica por grupo e calcular a aderência média ponderada pelo número de tentativas usando `1 - TVD_g` (Distância de Variação Total), garantindo invariância total à permutação das tentativas.
2. **`[P0-05]` Blindagem `Number.isFinite` (`mathEngine.ts`):**
   - `calculatePotOdds`, `calculateBluffBreakevenFoldEquity`, `calculateSimplifiedMdf` e demais funções numéricas em [`app/src/lib/poker/mathEngine.ts`](../app/src/lib/poker/mathEngine.ts) validam explicitamente `Number.isFinite`, lançando `Error` ao receber `NaN` ou `Infinity` (em vez de propagar `NaN` silenciosamente).
3. **`[P1-05]` Modelo PKO sem dupla atenuação (`mathEngine.ts` + `MathIcmLab.tsx`):**
   - Corrigido o cálculo em `evaluatePkoBountyModel` que anteriormente aplicava multiplicador de `0.5` sobre captura imediata e multiplicava novamente por `bountyChipFactor ?? 0.5` (resultando em `0.25x` oculto). Agora `bountyChipFactor` é aplicado uma única vez como fator configurável.
   - [`MathIcmLab.tsx`](../app/src/components/MathIcmLab.tsx) passou a exibir e permitir editar na UI os parâmetros `startingStackChips`, `startingBountyUsd` e `bountyChipFactor`.
4. **Combinatória real em `dailyDoseCatalog.ts`:**
   - `evaluateRangeBuilderExercise` (em [`app/src/lib/poker/dailyDoseCatalog.ts`](../app/src/lib/poker/dailyDoseCatalog.ts)) passou a ponderar `accuracyPct` e acertos pelos combos reais disponíveis no baralho (`totalAvailableDeckCombos`: `6` pares, `4` suited, `12` offsuit descontando bloqueios de board quando aplicável), corrigindo também `linkedSpotId`s quebrados.

---

## 6. Navegação, Sincronização de Estado e Persistência

1. **`[P2-01]` Arquitetura de 7 Domínios + Sub-barra Contextual (`PokerStudioApp.tsx`):**
   - As 11 abas antigas que sofriam corte horizontal foram consolidadas em **7 domínios principais** (`Treinar`, `Ranges MTT`, `Biblioteca`, `Replayer`, `Laboratório`, `Estudos`, `Estatísticas`) com memória por domínio (`lastDomainSubTab`) e sub-barra contextual preservando acesso direto a todos os submódulos, títulos SSR e atributos `data-tour`.
   - Em viewports `1280px–1535px` (incluindo `1440×900`), a barra alterna via `2xl:flex-row` para manter logo/utilitários acima da barra de 7 domínios, eliminando 100% do corte observado em `Estudos` e `Estatísticas`; em `1920×1080` permanece em linha única compacta (`110 px` de altura).
   - Em `<1024px` (tablet/mobile), o cabeçalho utiliza `relative lg:sticky` para liberar altura útil de estudo ao rolar a página.
2. **`[P0-04]` Roteamento ao vivo do Quick Hub ("Acesso rápido"):**
   - Introduzido `trainerRequestNonce` em `PokerStudioApp.tsx`, consumido com `lastHandledNonceRef` em `TrainerView.tsx` e `InteractiveDrillsLab.tsx`. Alternar entre `"Construtor de ranges"`, `"Exercício de matemática"` e `"Treinar pós-flop"` funciona integralmente mesmo quando `TrainerView` já está montado.
3. **`[P0-03]` Migração e persistência do `Treiner Limpo` (`CleanRangeTrainerView.tsx`):**
   - Substituído o avaliador legado `evaluateDecision` por `evaluateDrillDecision(adaptLegacyRangeSpotToCanonical(...))`, tratando ações válidas `< 5%` como `"low_freq_acceptable"` sem EV inventado.
   - Sorteio inicial alinhado ao filtro de dificuldade ativo via `pickInitialCleanHand` (usando o novo 3º parâmetro determinístico `rng` em `pickDrillHand`).
   - Corrigida a propriedade visual para `formatLabel="MTT 8-Max"` e `anteLabel="Ante 0.125bb"`.
   - Persistência completa (`spotTypeFilter`, `heroPosition`, `selectedSpotId`, `difficulty`, `useRng`, `autoAdvance`, `totalCount`, `rightCount`, `streak`, `mixedAttempts`) na chave `treinerlm_clean_trainer_v1`, protegida por flag React `hasHydratedStorage` que impede sobrescrita com zeros durante a montagem inicial.
4. **`[P1-01]` Sincronia inicial no `RangeExplorerView.tsx`:**
   - `primarySpotId` passou a inicializar procurando o primeiro spot MTT do `selectedStack` (`100 BB`), eliminando a divergência entre o botão `100 BB` destacado e a matriz `14BB` exibida na abertura.
5. **`[P1-04]` Sincronização bidirecional `Replayer` ↔ `Biblioteca` (`SQLite pending`):**
   - Em [`ReplayerView.tsx`](../app/src/components/ReplayerView.tsx), ao clicar `"☆ Marcar para revisão"` em uma mão vinda da Biblioteca (`libraryRecordId` presente), a alteração é persistida imediatamente no SQLite via `libraryWrite("study", ...)` preservando `note`, `tags` e `favorite` existentes, e dispara `onLibraryStudyChanged` -> `libraryStudyVersion` em `PokerStudioApp.tsx` para recarregar [`HandLibraryView.tsx`](../app/src/components/HandLibraryView.tsx).
6. **Sincronia de seleção em `CurriculumView.tsx`:**
   - Ao trocar de trilha no [`CurriculumView.tsx`](../app/src/components/CurriculumView.tsx), `selectedSpotNumber` é sincronizado automaticamente para o primeiro spot da nova trilha.

---

## 7. Mesa GTO, Fluxo de Ação e Estados de Assentos (`PokerTable.tsx`)

- **`[P1-03]` Estados reais por ordem de giro (`resolveSeatVisualState`):** Em [`PokerTable.tsx`](../app/src/components/PokerTable.tsx), assentos após o Herói pré-flop deixam de exibir falsamente `"fold"` (ex.: em `UTG RFI`, os assentos de `MP` até `BB` exibem `"Aguarda"` com seu stack real; em `BTN RFI`, `UTG..CO` exibem `"fold"` e `SB/BB` exibem `"Aguarda"`).
- Spots como `vs_shove` respeitam explicitamente `spot.villainPosition` para destacar o vilão correto na mesa.
- A faixa superior de sequência de ações (`aria-label="Sequência de ações da mão"`) passou a usar `flex-wrap sm:flex-nowrap` para evitar corte de pills como `FLOP 5.7 BB · Ah Kd 7c` e `RNG` em telas móveis (`390×844`).

---

## 8. Estatísticas, Diagnóstico de Leaks e Heatmap (`StatsView.tsx`)

- **`[P1-02]` Fim do falso leak com 100%:** `StatsView.tsx` filtra `worstPos` exigindo desvio real (`pct < 100`), exibindo `"Nenhum leak detectado"` quando o usuário não possui erros.
- **Ressalvas honestas de amostra pequena:** Exibição de aviso contextual para amostras com menos de `10` mãos (`formatSampleConfidencePtBr`).
- **Autoavaliação sem colisão:** `trainerSelfReview` e buscas no `StatsView` utilizam preferencialmente `rec.attemptId`, evitando colisões ao repetir a mesma mão (`spotId::handClass`).
- **Formulário manual desacoplado:** Mãos inseridas manualmente não herdam mais o ID fixo do TexasSolver (`Ah Kd 7c`), utilizando `spotId: "manual_custom_review"`.
- **Heatmap alinhado a MTT:** `HEATMAP_STACKS` ajustado para `[14, 17, 20, 25, 28, 30, 40, 50, 75, 100]` BB e rótulos legados `Spin Push/Fold` substituídos por descritores MTT compatíveis.
- **Responsividade & Pluralização:** Inclusão de layout em cards para telas `<640px` e substituição de strings como `"0 mão"` / `"mão(s)"` por `pluralizePtBr`.

---

## 9. Sistema Visual WCAG AA, Tipografia Offline e Unificação do Tema

1. **Fonte offline local & números tabulares (`layout.tsx`, `globals.css`, `MathLab.module.css`):**
   - Substituída qualquer dependência externa de fontes por stack local nítido para Windows/desktop (`"Segoe UI Variable Text"`, `"Segoe UI"`, `"Inter"`, system-ui) e monoespaçada tabular (`"Cascadia Mono"`, `"Consolas"`, monospace + `font-variant-numeric: tabular-nums`) sem causar layout shift em modo offline.
   - Removido piso sub-11px nas folhas CSS (`globals.css`, `MathLab.module.css`, `ReplayerView.module.css`), adotando `0.6875rem` (`11 px`) como piso mínimo nos textos de apoio. *(Nota de inventário: uma linha pontual secundária em `TrainerView.tsx` manteve classe inline residual `text-[0.625rem]` para badge secundário).*
2. **Paleta semântica WCAG AA com glifos acessíveis a daltonismo (`uiPresentation.ts`, `RangeMatrix.tsx`, `TrainerView.tsx`, `CleanRangeTrainerView.tsx`):**
   - `Fold`: `#1E3A5F` (borda `#3B82F6`, glifo `F`)
   - `Call`: `#15803D` (borda `#22C55E`, glifo `C`)
   - `Check`: `#15803D` (borda `#22C55E`, glifo `X`)
   - `Limp`: `#A16207` (borda `#FACC15`, glifo `L`)
   - `Bet`: `#B91C1C` (borda `#F87171`, glifo `B`)
   - `Raise`: `#B91C1C` (borda `#F87171`, glifo `R`)
   - `All-in`: `#7F1D1D` (borda `#FCA5A5`, glifo `A`)
3. **Unificação do tema escuro:**
   - **Zero** ocorrências restantes do antigo cinza `#191B1D` em todo `app/src/`.
   - Superfícies primárias padronizadas em `#05070B` (canvas), `#090D16` (cards/modais) e `#1E293B`/`#26334A` (bordas) em `StatsView`, `InteractiveDrillsLab`, `RangeExplorerView`, `ReplayerView.module.css`, `HandLibraryView` e modais. *(Obs.: bordas secundárias pontuais `border-[#292C2F]` permaneceram apenas em blocos internos específicos de `HandLibraryView.tsx`, `StatsView.tsx`, `TrainerView.tsx` e no preset intencional `"Esmeralda GTO"` de `tableAppearance.ts`).*

---

## 10. Acessibilidade de Modais, Teclado e Interação Touch

- **`SettingsModal.tsx` e Modal de Importação (`TrainerView.tsx`):** Migrados para elemento HTML nativo `<dialog>` com `showModal()`/`close()`, fechamento automático via `Esc` e `backdrop`, rolagem segura (`max-h-[88dvh]`) e **retorno automático do foco** para o botão disparador após fechamento.
- **`InteractiveDrillsLab.tsx` e `RangeMatrix.tsx`:** Adicionados manipuladores `onPointerDown` / `onPointerEnter` / `touch-action` para pintura contínua da matriz 13×13 por toque/mouse; removidos os cortes `.slice(0, 60)` e `.slice(0, 15)` na lista de spots em favor de busca e toggle de exibição completa; corrigido rótulo `"RFI (sem vilão ativo)"` quando `villainPosition === null`.

---

## 11. Linguagem 100% pt-BR e Honestidade Documental

- Centralização em [`app/src/lib/poker/uiPresentation.ts`](../app/src/lib/poker/uiPresentation.ts) de:
  - `formatActionLabelPtBr` (traduzindo chaves internas como `BET 33PCT` -> `"Bet 33% pote"`, `CHECK` -> `"Check"`, etc.);
  - `pluralizePtBr` (eliminando `"1 aulas"`, `"0 mão"`, `"mão(s)"`);
  - `formatSampleConfidencePtBr` (substituindo tokens como `amostra_solida` por `"Amostra sólida"`);
  - `formatStrategySourceBadgePtBr` (substituindo badges crus como `IMPORTED_CHART_NO_EV` por `"Tabela pré-flop · Sem EV"`).
- Em [`AiCoachView.tsx`](../app/src/components/AiCoachView.tsx), removida menção a livros não indexados no `knowledge_base.json` e listadas apenas as obras realmente indexadas (*Dicionário do Poker*, *E-book ICM*, *5 Erros em Retas Finais*, *Ranges MTT 8-Max*, Fitzgerald, Crawford, Hissa/Caputo e Leo Bello).
- Substituído `card removal` por `"remoção de cartas"` em `RangeMatrix.tsx`.
- [`README.md`](../README.md) completamente reescrito em pt-BR refletindo o nome **TreinerLM**, os 7 domínios, escopo MTT-Only e os comandos reais de verificação.

---

## 12. Alinhamento do Iniciador Windows (`windows/`)

- [`windows/launcher.pyw`](../windows/launcher.pyw): Título e janela gráfica atualizados para **`TreinerLM`** com paleta `#05070B` / `#DC2626` / `#2563EB` e texto `"Estúdio Offline MTT"`.
- [`windows/Prepare-GTOTrainer.ps1`](../windows/Prepare-GTOTrainer.ps1) e [`windows/gto-trainer.ico`](../windows/gto-trainer.ico): Ícone regenerado com emblema **`π`** sobre fundo `#05070B` e bordas `#DC2626` / `#2563EB`, preservando o nome técnico interno do atalho/mutex quando exigido pelo contrato de [`windows/Verify-GTOShortcut.ps1`](../windows/Verify-GTOShortcut.ps1) para garantir compatibilidade regressiva integral.

---

## 13. Rastreabilidade do Backlog das Auditorias Anteriores

| ID Backlog | Escopo | Status Atual |
|---|---|---|
| `P0-01` | Blindagem de `/api/coach` (`assertCoachAccess` + rate limit + tamanho) | **Resolvido** |
| `P0-02` | Aderência mista invariante à ordem em `drillEvaluator.ts` | **Resolvido** |
| `P0-03` | Migrar `Treiner Limpo` para `evaluateDrillDecision` + persistência | **Resolvido** |
| `P0-04` | Roteamento ao vivo pelo Quick Hub ("Acesso rápido") via `nonce` | **Resolvido** |
| `P0-05` | Validar `Number.isFinite` em fórmulas base de `mathEngine.ts` | **Resolvido** |
| `P1-01` | Sincronizar stack inicial (`100 BB`) e spots no `RangeExplorerView` | **Resolvido** |
| `P1-02` | Corrigir falso leak `100%`, formulário manual, heatmap e colisão em `StatsView` | **Resolvido** |
| `P1-03` | Exibir `"Aguarda"` após Herói e respeitar `villainPosition` em `PokerTable` | **Resolvido** |
| `P1-04` | Sincronizar `"Marcar para revisão"` `ReplayerView` ↔ SQLite `HandLibraryView` | **Resolvido** |
| `P1-05` | Corrigir duplo `0.5` em PKO + UI configurável e citações reais no `AiCoachView` | **Resolvido** |
| `P2-01` | Consolidar 11 abas em 7 domínios e eliminar corte em `1440×900` | **Resolvido** |
| `P2-02` | Migrar paleta escura, pt-BR em badges/ações e alinhar launcher `TreinerLM` | **Resolvido** *(com pequenas bordas `#292C2F` documentadas)* |
| `P2-03` | Corrigir `InteractiveDrillsLab`, combos em `dailyDoseCatalog` e `CurriculumView` | **Resolvido** |
| `P2-04` | Documentar desvios de extração `0.964` + atualizar `README.md` e `docs/` | **Resolvido** |

---

## 14. Inventário Completo de Arquivos Modificados e Criados

- **Novos módulos e testes em `app/`:**
  - `app/src/lib/poker/mttCatalog.ts`
  - `app/src/lib/poker/uiPresentation.ts`
  - `app/src/lib/__tests__/refinamentoMtt2026.test.ts` (8 testes automatizados específicos do refinamento)
- **Módulos e APIs corrigidos em `app/`:**
  - `app/src/lib/poker.ts`, `app/src/lib/poker/adaptiveDiagnostics.ts`, `app/src/lib/poker/dailyDoseCatalog.ts`, `app/src/lib/poker/drillEvaluator.ts`, `app/src/lib/poker/mathEngine.ts`, `app/src/lib/poker/strategySchema.ts`, `app/src/lib/server/libraryAccess.ts`, `app/src/app/api/coach/route.ts`
- **Interface, estilos e componentes em `app/`:**
  - `app/src/app/globals.css`, `app/src/app/layout.tsx`, `app/src/components/MathLab.module.css`, `app/src/components/ReplayerView.module.css`
  - `app/src/components/AiCoachView.tsx`, `CleanRangeTrainerView.tsx`, `CurriculumView.tsx`, `HandLibraryView.tsx`, `InteractiveDrillsLab.tsx`, `MathIcmLab.tsx`, `PokerStudioApp.tsx`, `PokerTable.tsx`, `RangeExplorerView.tsx`, `RangeMatrix.tsx`, `ReplayerView.tsx`, `SettingsModal.tsx`, `StatsView.tsx`, `TrainerView.tsx`
- **Desktop Windows & Documentação:**
  - `windows/launcher.pyw`, `windows/Prepare-GTOTrainer.ps1`, `windows/gto-trainer.ico`
  - `README.md`, `docs/AUDITORIA_RANGES_MTT_ONLY.md`, `docs/ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md`
  - Evidências visuais em `docs/screenshots/refinamento-2026/antes/` (8 PNGs) e `depois/` (8 PNGs)

---

## 15. Verificações Técnicas Executadas (Pós-Edição Final)

*(Resultados detalhados na execução final sem edições posteriores descrita no tópico 17 e no resumo abaixo.)*

1. **TypeScript (`tsc --noEmit`):** zero erros.
2. **ESLint (`eslint .`):** zero erros/avisos bloqueantes.
3. **Testes Next.js/TypeScript (`node --test src/lib/__tests__/*.test.ts`):** **138 testes aprovados / 0 falhas / 0 pulados em 27 suítes** (crescimento de 130 para **138** com os 8 testes novos em `refinamentoMtt2026.test.ts`).
4. **Build de Produção (`next build`):** compilado com sucesso (Next.js `15.5.29`, `/` com `160 kB` + `263 kB` First Load JS).
5. **Testes Python Pipeline (`pipeline/hand_history`):** **71 testes executados e aprovados** (`python.exe -m unittest discover -s pipeline\hand_history -t . -p "test_*.py"`).
6. **Testes Python Launcher (`windows/test_launcher.py`):** **8 testes executados e aprovados**.
7. **Verificação do atalho Windows (`windows/Verify-GTOShortcut.ps1`):** aprovado (`shortcutExists=true`, ícone/alvo/WorkingDirectory validados).

---

## 16. Verificação em Navegador Real (Edge Headless via CDP) & Comparativo Antes vs Depois

Executado contra build de produção (`next start`) em servidor loopback isolado (`http://127.0.0.1:3198`) com SQLite temporário e `localStorage` limpo, registrando:
- **`consoleErrors: []`**, **`pageErrors: []`**, **`httpFailures: []`**
- **`1920×1080` (`01_trainer_1920x1080.png`):** `7` botões de domínio, `headerHeight: 110 px`, zero overflow horizontal (`1920 <= 1920`), zero opções SNG/Spin no DOM. Quick Hub validado ao vivo (`Construtor de ranges` -> `Exercício de matemática` -> `Treinar pós-flop`). Modal `Configurar IA` (`<dialog>`) validada fechando com `Esc` e retornando foco ao botão `[data-tour="settings"]`. Sincronização bidirecional `Biblioteca` ↔ `Replayer` validada alterando `"Revisão pendente"` no SQLite temporário.
- **`1440×900` (`02`, `03`, `04`, `05`):** Navbar dos 7 domínios **100% sem corte** (`nav unclipped: true`). No `Treiner Limpo`, `UTG RFI` exibe `"Aguarda"` em vez de falso `"fold"`, mostra `"MTT 8-Max · Ante 0.125bb"` e persiste `Memorizadas: 1` ao trocar para `Ranges MTT` e voltar. No `Range Explorer`, abre diretamente em `100BB - RFI UTG`, exibe seletores `MTT PKO` / `MTT com ICM` e zero ocorrências de `(Spin)`. No `StatsView`, zero plural quebrado e zero falso leak (`"Nenhum leak detectado"`).
- **`768×1024` (`06_treiner_limpo_768x1024.png`):** Zero overflow horizontal da página (`scrollWidth: 760 <= innerWidth: 768`). *(Obs.: na largura exata `768 px`, o botão final `"Estatísticas"` ainda utiliza rolagem horizontal interna suave no container `<nav>`).*
- **`390×844` (`07_trainer_390x844.png`, `08_treiner_limpo_390x844.png`):** Zero overflow horizontal (`scrollWidth: 390 <= 390`). Faixa de sequência da mão (`BTN Open Raise | BB Call | FLOP 5.7 BB · Ah Kd 7c | BB Check | BTN Sua vez | RNG: 92`) quebrada em múltiplas linhas sem corte à direita. *(Obs.: em `390×844` sem ocultar o aviso offline, a `<header>` mede `200 px` no topo antes de rolar — não sendo mais `sticky` em `<1024px`, ela sai naturalmente da viewport ao rolar).*

---

## 17. Verificação Final de Integridade Pós-Refinamento

- **`git status`:** apenas alterações esperadas dos arquivos do escopo de refinamento e relatórios/evidências em `docs/`, sobre commit base intacto `7a0d5d8` (`main`).
- **`SHA-256` final idêntico ao inicial** para o banco SQLite pessoal, `ranges_gto.json` e `verified_ahkd7c_texassolver.json`.

---

## 18. Limitações Remanescentes e Backlog Futuro (`P3`)

Mantidos fora do escopo intencional de estabilização atual para futura evolução:
- **`[P3-01]`** Unificação completa de fila adaptativa Leitner entre `Treiner Limpo`, `Daily Dose`, `Erros Fatais` e `Modo Trainer`.
- **`[P3-02]`** Fatiamento modular de arquivos longos (`TrainerView.tsx`, `StatsView.tsx`, `InteractiveDrillsLab.tsx`) e validação JSON pura em `library.py` sem subprocesso Node por arquivo.
- **`[P3-03]`** Expansão de soluções GTO verificadas pós-flop reais (turn/river, boards baixos/pareados/monotônicos, cenários **MTT ICM / PKO com solver real**), atualmente sinalizados honestamente como `"Sem solver"` na interface.
- **`[P3-04]`** Refinamento secundário opcional: remover `text-[0.625rem]` residual em `TrainerView.tsx` e os últimos `border-[#292C2F]` em `HandLibraryView.tsx` / `StatsView.tsx` / `TrainerView.tsx`, além de compactar ainda mais o cabeçalho inicial em `390×844` (ex.: recolher por padrão o aviso anti-RTA após primeira ciência em telas `<640px`).

---

## RESUMO PARA REVISÃO PELO CHATGPT

- **Objetivo cumprido:** Refinamento geral, estabilização de testes/segurança/matemática, unificação visual WCAG AA (`TreinerLM`) e imposição estrita de escopo **MTT-Only** em toda a interface ativa sem alterar `ranges_gto.json`, `verified_ahkd7c_texassolver.json` ou o banco SQLite pessoal.
- **Inventário MTT vs Spin & Go:** De `229` ranges em `ranges_gto.json`, exatamente `216` são `MTT_CONFIRMED` (`42` rfi, `168` vs_rfi, `6` vs_limp; stacks `14/17/20/30/50/100 BB`; `Ante 0,125 BB`) e `13` são `SPIN_AND_GO_CONFIRMED` (preservados em disco porém filtrados em `mttCatalog.ts`, componentes e agenda Leitner; `0` Cash, `0` Desconhecido). Somando `1` solução TexasSolver verificada (`Ah Kd 7c`) e `13` spots conceituais/didáticos MTT deduplicados por `spotId`, o catálogo ativo contém **`230` spots MTT**.
- **Integridade matemática & segurança:** `assertCoachAccess` + rate limiter (`20 req/min`) + limite de `6 MiB` em `/api/coach`; `Number.isFinite` em `mathEngine.ts`; remoção do duplo `0.5` em PKO (`bountyChipFactor` único configurável na UI); `computeMixedAdherenceStats` agrupado por `(spotId, hand, canonicalTargetSignature)` e invariante à ordem; combinatória real em `dailyDoseCatalog.ts`; auditoria `auditMatrixDistributionIntegrity` separando `337` resíduos triviais (`<=0,002`) de `21` desvios menores e `2` desvios severos (`0.964` em `17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK`).
- **UI/UX, estado e acessibilidade:** 7 domínios na barra superior (zero corte em `1440×900` e `1920×1080`), persistência `hasHydratedStorage` + avaliador `evaluateDrillDecision` no `Treiner Limpo`, sincronia `100 BB` no `Range Explorer`, sincronia SQLite `Replayer ↔ Biblioteca`, `"Aguarda"` em assentos após Herói em `PokerTable`, fim do falso leak com `100%` em `StatsView`, `<dialog>` semântico com retorno de foco no `Esc`, fonte offline local e paleta WCAG AA daltônico-safe.
- **Evidências objetivas:** `tsc --noEmit`, `eslint .`, **`138/138` testes TypeScript/Next.js** (27 suítes), `next build`, **`71/71` testes Python pipeline**, **`8/8` testes launcher Windows**, `Verify-GTOShortcut.ps1` e suíte Edge headless CDP em `1920×1080`, `1440×900`, `768×1024` e `390×844` com `0` erros de console/rede e capturas Antes vs Depois em `docs/screenshots/refinamento-2026/`.
