# TREINERLM (`Projeto-Poker`) — Correções Finais Pós-Homologação Independente (MTT-Only, Integridade, Persistência, Segurança e UI)

**Repositório:** `Projeto-Poker` (**TreinerLM · Estúdio Offline MTT**)  
**Branch / Baseline Git:** `main` · commit `7a0d5d8` (nenhum commit automático criado; nenhum comando destrutivo executado)  
**Homologação de referência:** [`docs/CODEX_HOMOLOGACAO_REFINAMENTO_MTT.md`](./CODEX_HOMOLOGACAO_REFINAMENTO_MTT.md) (parecer anterior: *Aprovado com Ressalvas*)  
**Relatórios base lidos integralmente:** [`docs/ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md`](./ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md), [`docs/AUDITORIA_RANGES_MTT_ONLY.md`](./AUDITORIA_RANGES_MTT_ONLY.md), [`docs/AUDITORIA_BACKLOG_PRIORIZADO.md`](./AUDITORIA_BACKLOG_PRIORIZADO.md)  
**Idioma:** Português brasileiro (pt-BR)

---

## 1. Controle de Baseline, Preservação de Ativos e Integridade dos Dados

Todos os ativos originais protegidos foram conferidos via `SHA-256` antes e depois de todas as alterações e permaneceram **bit a bit inalterados**:

| Ativo Protegido | Finalidade | SHA-256 Medido (Baseline = Atual) | Estado |
|---|---|---|---|
| `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3` | Banco SQLite pessoal da Biblioteca de Mãos | `4135CFA81B7FE4F8927708E77ED66F665F3C0DAC5474D042D75FF74D56E5FB1A` | Preservado |
| `app/src/data/ranges_gto.json` | Acervo bruto extraído (`229` spots / `38.701` células) | `D46652C5BFE3CED09073FA68544E134683499F18EABDABEF8202D9EE351CB60E` | Preservado (sem normalização automática) |
| `app/src/data/verified_ahkd7c_texassolver.json` | Dump pós-flop verificado TexasSolver (`Ah Kd 7c`) | `868EF9FB8E6371F12DDE7749170015AF4FACCA70AF92DC33AA45251CDD0B3EDA` | Preservado |

Todos os testes de navegador e SQLite usaram bancos descartáveis fora do repositório (`POKER_LIBRARY_DATABASE` temporário em `%TEMP%`) e perfis efêmeros do Microsoft Edge.

---

## 2. Matriz de Rastreabilidade das Ressalvas do Codex

| Item da Homologação | Severidade | Resolução Aplicada | Evidência / Arquivos |
|---|---|---|---|
| 23 células MTT com desvio `> 0,002` (`0,964` em `17bb/AA` e `20bb/KK`) sem guarda no treino ativo | Crítica (`P1`) | Bloqueio automático de correção nas células graves/inválidas (`INCOMPLETE_SEVERE`/`INVALID`) e bloqueio contra `ev_error` falso em ações `0%` nas células `INCOMPLETE_MINOR`; alerta claro em pt-BR | [`strategySchema.ts`](../app/src/lib/poker/strategySchema.ts), [`drillEvaluator.ts`](../app/src/lib/poker/drillEvaluator.ts), [`TrainerView.tsx`](../app/src/components/TrainerView.tsx), [`CleanRangeTrainerView.tsx`](../app/src/components/CleanRangeTrainerView.tsx), [`InteractiveDrillsLab.tsx`](../app/src/components/InteractiveDrillsLab.tsx) |
| `pickRngTargetAction` desviava déficit (`96,4..100`) para a ação dominante | Alta (`P1`) | Retorna `null` quando `rngValue` cai na faixa sem massa completa (`sum < 0,998`); tolera resíduo trivial `<= 0,002` apenas no último ramo positivo | [`drillEvaluator.ts`](../app/src/lib/poker/drillEvaluator.ts) |
| Métrica de aderência mista (`TVD`) herdava piso de erro em células incompletas | Alta (`P1`) | `computeMixedAdherenceStats` exclui tentativas com soma divergente `> 0,002` (`reliableAttempts`, `incompleteExcludedAttempts`, `hasIncompleteData`) e valida registros malformados | [`drillEvaluator.ts`](../app/src/lib/poker/drillEvaluator.ts), [`TrainerView.tsx`](../app/src/components/TrainerView.tsx), [`CleanRangeTrainerView.tsx`](../app/src/components/CleanRangeTrainerView.tsx) |
| `StatsView` retinha label `"Spin"`, contaminava métricas com `spin_*` históricos e mantinha botão `"Treinar"` quebrado | Crítica (`P1`) | Label atualizado para `"Por Formato (chipEV / ICM / PKO)"`; históricos `spin_*`/Cash isolados de `summary`, Leitner, leaks e progresso; card histórico exibe `"Não disponível no MTT"` em vez de treino ativo; histórico bruto permanece intacto e mesclado sem duplicação | [`StatsView.tsx`](../app/src/components/StatsView.tsx), [`PokerStudioApp.tsx`](../app/src/components/PokerStudioApp.tsx) |
| Fallback silencioso ou `TypeError` em spots desconhecidos/ausentes ou links antigos de Spin | Alta (`P1`) | `classifyCanonicalSpot` trata `referenceStrategy` ausente como `FORMAT_UNKNOWN`; `isSpotIdExcludedFromMtt` verifica prefixo + metadados/proveniência; `resolveActiveMttSpot` exibe `"Este exercício não está disponível no modo MTT."` sem substituição silenciosa | [`mttCatalog.ts`](../app/src/lib/poker/mttCatalog.ts), [`TrainerView.tsx`](../app/src/components/TrainerView.tsx) |
| Assimetria de persistência e `mixedAttempts` entre `Modo Trainer` e `Treiner Limpo` | Alta (`P2`) | Criado módulo estrito `trainerStorage.ts` (`schemaVersion: 1`, migração automática de v0, saneamento contra JSON corrompido, arrays e `spin_*`); `TrainerView` agora persiste sessão completa e calcula `mixedAttempts` também para charts pré-flop MTT íntegros | [`trainerStorage.ts`](../app/src/lib/poker/trainerStorage.ts), [`TrainerView.tsx`](../app/src/components/TrainerView.tsx), [`CleanRangeTrainerView.tsx`](../app/src/components/CleanRangeTrainerView.tsx) |
| Filtros mortos `push_fold`/`vs_shove` no `TrainerView` sem spots no acervo MTT | Média (`P2`) | `<option>` exibidos dinamicamente apenas quando existirem spots desse tipo no catálogo ativo | [`TrainerView.tsx`](../app/src/components/TrainerView.tsx) |
| Inputs ICM (`stacksInput`, `payoutsInput`) descartavam tokens inválidos (`"1000, abc"`) e hipótese PKO 50/50 pouco explícita | Média (`P2`) | Criado `parseStrictFiniteList` em `mathEngine.ts` (erro explícito em pt-BR sem descartar entradas ruins) + aviso explícito da hipótese PKO simétrico 50/50 | [`mathEngine.ts`](../app/src/lib/poker/mathEngine.ts), [`MathIcmLab.tsx`](../app/src/components/MathIcmLab.tsx) |
| Contrato HTTP em `/api/coach`: `500` em payload `> 6 MiB` e falta de validação em `previousInteractionId` / `spotContext` | Alta (`P2`) | Criado `PayloadTooLargeError` -> HTTP `413`; validação rígida com HTTP `400` para JSON/UTF-8 malformado, `previousInteractionId`, `spotContext` (`<= 16 KB`, `stackBb`, `rngValue`, `gtoDistribution`), e base64 de imagem; redação ampliada de chaves em mensagens de erro | [`libraryAccess.ts`](../app/src/lib/server/libraryAccess.ts), [`coach/route.ts`](../app/src/app/api/coach/route.ts), [`hand-library/route.ts`](../app/src/app/api/hand-library/route.ts) |
| Navbar cortava 7ª aba (`Estatísticas`) em `768×1024`; `18` textos `< 11px` em desktop e paleta cinza legada `#090B0C`/`#292C2F`/`#6A7075` | Média (`P2`) | `nav` responsivo com `flex-wrap lg:flex-nowrap`; `h1` elevado para `text-base sm:text-lg`; zero textos `< 10,5px` no desktop (`1920×1080` e `1440×900`); unificação de `HandLibraryView`, `StatsView`, `TrainerView`, `ReplayerView.module.css`, `CurriculumView`, `AiCoachView`, `InteractiveDrillsLab` e `PokerTable` | [`PokerStudioApp.tsx`](../app/src/components/PokerStudioApp.tsx), [`HandLibraryView.tsx`](../app/src/components/HandLibraryView.tsx), [`StatsView.tsx`](../app/src/components/StatsView.tsx), [`ReplayerView.module.css`](../app/src/components/ReplayerView.module.css) |
| Divergência entre scripts Windows (`GTO Trainer.lnk`) e `README.md` (`TreinerLM.lnk`) | Baixa (`P3`) | `Prepare-GTOTrainer.ps1` e `Verify-GTOShortcut.ps1` migrados para `TreinerLM.lnk` (removendo `GTO Trainer.lnk` legado na instalação); `Launch-GTOTrainer.vbs` renomeado para título `TreinerLM`; `actualDoubleClickTest` mantido como `PENDING_USER_TEST` | [`Prepare-GTOTrainer.ps1`](../windows/Prepare-GTOTrainer.ps1), [`Verify-GTOShortcut.ps1`](../windows/Verify-GTOShortcut.ps1), [`Launch-GTOTrainer.vbs`](../windows/Launch-GTOTrainer.vbs) |

---

## 3. Integridade das Frequências MTT (`strategySchema.ts` & `drillEvaluator.ts`)

1. **Separação rigorosa de tolerâncias (`classifyCellDistributionIntegrity`):**
   - `COMPLETE`: desvio `<= 1e-6` em ações legais válidas.
   - `ROUNDING_ONLY`: `1e-6 < |soma - 1| <= 0,002` — aceito como arredondamento numérico trivial de impressão/exportação.
   - `INCOMPLETE_MINOR`: `0,002 < |soma - 1| <= 0,03` (ex.: células `0,976` e `0,988`).
   - `INCOMPLETE_SEVERE`: `|soma - 1| > 0,03` (ex.: `17bb_sb_vs_utg_rfi / AA` e `20bb_btn_vs_mp_rfi / KK`, ambos com soma **`0,964`**).
   - `INVALID`: frequência negativa/`> 1`/`NaN`, ação desconhecida ou célula ausente.
2. **Preservação dos dados originais:** `ranges_gto.json` e a matriz exibida em tela mantêm exatamente as frequências originais extraídas — nenhuma normalização artificial ou preenchimento em ação dominante ocorre.
3. **Regra de avaliação protegida (`enforceIntegrityGuard: true` na UI):**
   - Quando a célula é `INCOMPLETE_SEVERE` ou `INVALID`: bloqueia automaticamente qualquer pontuação/erro (`integrityBlocked: true`, `gtoScored: false`, `evScored: false`, `evLoss: null`, `classification: "unsolved"`), preserva o gráfico para estudo visual e exibe alerta em pt-BR.
   - Quando a célula é `INCOMPLETE_MINOR`: não marca `0%` como `ev_error` (pois a ação minoritária pode ter sido perdida na extração), bloqueando a punição com alerta claro; ações visíveis `> 0` informam sua frequência extraída acompanhadas de aviso de extração parcial.

---

## 4. Correção do Sorteador RNG e Métrica de Aderência Mista

- **`pickRngTargetAction(orderedActions, dist, rngValue)`:** agora retorna `string | null`. Quando a soma das frequências acumuladas é `< 0,998` e `rngValue` ultrapassa a soma extraída (ex.: `98` em célula de soma `0,964`), retorna estritamente `null` em vez de atribuir o déficit de `3,6%` à ação dominante. Apenas quando a soma está dentro do resíduo de arredondamento (`0,998..1,002`) o valor `100` resolve para a última ação positiva.
- **`computeMixedAdherenceStats(attempts)`:** ignora registros malformados/corrompidos sem lançar exceções, exclui do cálculo de TVD qualquer tentativa cujo `targetDistribution` tenha desvio `> 0,002` em relação a `1,0`, e expõe `reliableAttempts`, `reliableGroupsCount`, `incompleteExcludedAttempts` e `hasIncompleteData`.
- **`TrainerView` & `CleanRangeTrainerView`:** agora gravam `mixedAttempts` tanto em spots verificados quanto em charts pré-flop MTT íntegros (apenas `COMPLETE` e `ROUNDING_ONLY`), excluindo células incompletas.

---

## 5. Isolamento Retroativo de Spin/Cash e Navegação Segura

- **Classificação robusta (`mttCatalog.ts`):** `classifyCanonicalSpot` trata `referenceStrategy` ausente ou parcial com encadeamento opcional e retorna `FORMAT_UNKNOWN` sem lançar `TypeError`. `isSpotIdExcludedFromMtt` passa a inspecionar também metadados/nome/proveniência (`\bsng\b`, `sit & go`, `jackpot`, `spin & go`, `cash game`) além dos prefixos `spin_`/`sng_`/`cash_`.
- **Links, favoritos e atalhos inválidos (`resolveActiveMttSpot`):** tentativas de abrir um `spotId` excluído ou inexistente exibem um banner explícito com a mensagem `"Este exercício não está disponível no modo MTT."` e botões manuais para o usuário escolher um exercício MTT válido — sem substituição silenciosa em segundo plano.
- **`StatsView` e `PokerStudioApp`:** registros históricos não-MTT eventualmente salvos no navegador do usuário são preservados intactos (e mesclados a partir de `projeto_poker_history_v1` + `reglife_poker_adaptive_diag_v2` sem duplicação), mas são completamente isolados dos cálculos ativos de precisão, EV loss, classificação de leaks, repetição espaçada e barras do Acesso Rápido, exibindo o selo `"Não disponível no MTT"` na listagem.

---

## 6. Persistência Estrita v1 nos Dois Treinadores

Em [`app/src/lib/poker/trainerStorage.ts`](../app/src/lib/poker/trainerStorage.ts):
- Chaves versionadas: `treinerlm_clean_trainer_v1` (`CleanRangeTrainerView`) e `treinerlm_trainer_session_v1` (`TrainerView`), ambas com `schemaVersion: 1`.
- Migração automática de payloads legados v0 (sem `schemaVersion`, inclusive remoção de `selectedSpotId` e `mixedAttempts` referentes a `spin_*` e normalização de filtros antigos `chipEV`/`ICM`/`PKO`).
- Validação defensiva contra JSON truncado, `null`, arrays de topo, versões desconhecidas (`schemaVersion !== 1`), frequências fora de `[0, 1]`, objetos não-planos em `targetDistribution` e contadores inconsistentes (`rightCount > totalCount`, `streak > rightCount`).

---

## 7. Motores Matemáticos (`MathIcmLab.tsx` & `mathEngine.ts`)

- **`parseStrictFiniteList(raw, fieldLabel)`:** rejeita string vazia, vírgulas duplas (`"500,,300"`) ou tokens não numéricos (`"1000, abc"`) lançando erro explícito em pt-BR no card ICM do `MathIcmLab`, eliminando o descarte silencioso anterior.
- **PKO MTT (`evaluatePkoBountyModel`):** exibe tanto nas premissas retornadas quanto na interface da Seção 3 a hipótese de **PKO progressivo simétrico 50/50** (50% captura imediata, 50% adicionada ao bounty), explicitando que estruturas não-50/50 (ex.: Mystery Bounty / K.O. total) não se enquadram diretamente no modelo.

---

## 8. Segurança das Rotas Locais e Limitações Documentadas

- **`PayloadTooLargeError` (`libraryAccess.ts`):** `limitedBody` passa a lançar `PayloadTooLargeError`, mapeada para **HTTP `413`** em [`app/src/app/api/coach/route.ts`](../app/src/app/api/coach/route.ts) e [`app/src/app/api/hand-library/route.ts`](../app/src/app/api/hand-library/route.ts) quando o payload excede o teto físico (`6 MiB` / limites de rota).
- **Validações estritas em `/api/coach`:** retorna **HTTP `400`** para UTF-8/JSON inválido, corpo não-objeto, `previousInteractionId` fora do padrão seguro (`1..160` caracteres `[A-Za-z0-9._:-]`), `spotContext` malformado ou acima de `16 KB`, `stackBb`/`rngValue`/`gtoDistribution` fora dos intervalos válidos e `imageBase64` fora de base64 válido. Mensagens de erro mascaram chaves (`AIza...`, `Bearer ...`, `apiKey=...`).
- **Limitações honestas documentadas (fora de escopo local mono-usuário):** o cabeçalho `X-Poker-Coach: local-v1` atua como defesa anti-CSRF cross-origin no navegador em loopback (`localhost`/`127.0.0.1`), não como autenticação criptográfica entre processos na mesma máquina; além disso, o armazenamento opcional da chave Gemini no navegador (`localStorage`) depende de uso em estação pessoal confiável (a alternativa recomendada para máxima proteção é configurar `GEMINI_API_KEY` em `.env.local`).

---

## 9. Resumo das Verificações Executadas (Todas Após as Edições Finais)

| Verificação | Comando / Escopo | Resultado Observado |
|---|---|---|
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | **Aprovado (`0` erros)** |
| ESLint | `npm run lint` (`eslint .`) | **Aprovado (`0` erros / `0` warnings)** |
| Testes TypeScript / Next.js | `npm test` (28 suítes, incluindo [`posHomologacaoMtt2026.test.ts`](../app/src/lib/__tests__/posHomologacaoMtt2026.test.ts)) | **147 / 147 aprovados (`0` falhas, `0` pulados)** |
| Build de Produção | `npm run build` (`next build`) | **Compilado em `10,1 s`, exit `0`** |
| Testes Python PHH / SQLite | `python -m unittest discover -s pipeline/hand_history -t . -p "test*.py" -v` | **71 / 71 aprovados em `9,052 s`** |
| Testes Iniciador Windows | `python -m unittest -v windows/test_launcher.py` | **8 / 8 aprovados em `13,726 s`** |
| Navegador Real (Edge Headless CDP, `next start` + SQLite temp) | Viewports `1920×1080`, `1440×900`, `768×1024`, `390×844` + 8 fluxos E2E completos | **100% aprovado (`docOverflow: false`, `navClippedButtons: []`, `microTextCount: 0`, `0` erros console/exceções/HTTP `>= 400`)** |
| Atalho Desktop Windows | `Prepare-GTOTrainer.ps1 -InstallShortcutOnly` + `Verify-GTOShortcut.ps1` | **7/7 checagens estruturais `true` (`TreinerLM.lnk`); `actualDoubleClickTest: PENDING_USER_TEST`** |

---

## 10. Status do Atalho Windows e Itens Pendentes de Ação Humana

- `TreinerLM.lnk` criado na Área de Trabalho apontando para `wscript.exe` -> `windows/Launch-GTOTrainer.vbs` com ícone `windows/gto-trainer.ico` e diretório de trabalho na raiz do projeto; qualquer `GTO Trainer.lnk` antigo na Área de Trabalho foi removido na instalação.
- **Pendente de teste manual do usuário:** execução real por duplo clique em `TreinerLM.lnk` pelo usuário final em sessão interativa do Windows (`actualDoubleClickTest = PENDING_USER_TEST`).

---

## 11. Resumo Executivo para Revisão Independente (ChatGPT)

- **Parecer após correções:** Todas as ressalvas críticas (`P1`), médias (`P2`) e a divergência de atalho (`P3`) apontadas em [`CODEX_HOMOLOGACAO_REFINAMENTO_MTT.md`](./CODEX_HOMOLOGACAO_REFINAMENTO_MTT.md) foram corrigidas sem alterar `ranges_gto.json`, `verified_ahkd7c_texassolver.json` ou o banco pessoal `hand-library.sqlite3` (hashes `SHA-256` verificados idênticos antes e depois).
- **Pontos-chave auditáveis:**
  1. Células incompletas (`17bb_sb_vs_utg_rfi/AA`, `20bb_btn_vs_mp_rfi/KK` em `0,964` e desvios minoritários `0,976`/`0,988`) permanecem visíveis para estudo, mas têm correção automática e fabricação de RNG/TVD bloqueadas em `drillEvaluator.ts`, `TrainerView.tsx`, `CleanRangeTrainerView.tsx` e `InteractiveDrillsLab.tsx`.
  2. `StatsView` e `PokerStudioApp` removem integralmente rótulos/métricas de Spin & Go das estatísticas ativas mantendo arquivos históricos intactos e seguros contra lançamento indevido.
  3. `TrainerView` e `CleanRangeTrainerView` compartilham persistência estrita `schemaVersion: 1` com saneamento e migração v0 via `trainerStorage.ts`.
  4. `/api/coach` aplica respostas HTTP semanticamente corretas (`400`/`403`/`413`/`429`), mantendo com transparência as fronteiras inerentes a um aplicativo desktop/localhost sem backend multiusuário.
  5. Interface responsiva em `1920×1080`, `1440×900`, `768×1024` e `390×844` validada em navegador real sem corte de abas ou microtipografia (`< 10,5px`) e `147/147` + `71/71` + `8/8` testes verdes.
