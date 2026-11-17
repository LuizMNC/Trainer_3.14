# HOMOLOGAÇÃO TÉCNICA INDEPENDENTE — REFINAMENTO `TREINERLM` (`Projeto-Poker` · MTT-ONLY)

**Data da homologação:** 16/11/2026  
**Escopo auditado:** Revisão técnica independente das alterações implementadas após `HEAD 7a0d5d8` (relatadas em `docs/ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md` e `docs/AUDITORIA_RANGES_MTT_ONLY.md`, confrontadas com as auditorias baseline `docs/AUDITORIA_GERAL_ESTADO_ATUAL_2026.md` e `docs/AUDITORIA_VISUAL_TIPOGRAFICA_2026.md`).  
**Regra cumprida:** Nenhum arquivo de código-fonte, estilo, range GTO, manifesto de solver, banco SQLite pessoal ou histórico Git foi alterado nesta homologação. Somente este documento foi criado.  
**Parecer Global:** **APROVADO COM RESSALVAS** *(o núcleo MTT-Only, segurança CSRF, matemática base e navegador desktop evoluíram significativamente e todas as suítes automatizadas passam, porém existem lacunas reais em histórico legado Spin no `StatsView`, proteção de células incompletas no Trainer, persistência divergente entre `Modo Trainer` e `Treiner Limpo`, corte da 7ª aba em tablet `768×1024`, microtipografia/tema residual `#090B0C`/`#292C2F`, inconsistência documental `GTO Trainer.lnk` vs `TreinerLM.lnk` e hipóteses PKO simplificadas).*

---

## Baseline e Preservação Conferidos

| Ativo Verificado | Hash SHA-256 (Início = Fim da Homologação) |
|---|---|
| `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3` | `4135CFA81B7FE4F8927708E77ED66F665F3C0DAC5474D042D75FF74D56E5FB1A` |
| `app/src/data/ranges_gto.json` | `D46652C5BFE3CED09073FA68544E134683499F18EABDABEF8202D9EE351CB60E` |
| `app/src/data/verified_ahkd7c_texassolver.json` | `868EF9FB8E6371F12DDE7749170015AF4FACCA70AF92DC33AA45251CDD0B3EDA` |

- `git rev-parse --short HEAD`: `7a0d5d8` (`main`), sem commits novos criados.

---

## 1. Correções Verificadas

As correções abaixo foram confirmadas diretamente no código-fonte, por scripts analíticos independentes e/ou em execução real sobre build de produção (`next start` + Microsoft Edge CDP headless + requisições HTTP):

1. **Classificação por evidência e filtragem do catálogo pré-flop (`app/src/lib/poker/mttCatalog.ts`, `ranges_gto.json`):**
   - Os **216** charts classificados como `MTT_CONFIRMED` possuem prefixo de origem explícito e verificável (`"PDF - Ranges RFI e vs RFI.pdf"`), estrutura 8-Max e `Ante 0,125 BB` (`42` `rfi`, `168` `vs_rfi`, `6` `vs_limp` em stacks `14/17/20/30/50/100 BB`).
   - Os **13** charts `SPIN_AND_GO_CONFIRMED` (`4. Pré-Flop/*.png`, prefixo `spin_`) foram excluídos da camada ativa sem usar número de jogadores/stack como critério isolado e sem promoção automática de `FORMAT_UNKNOWN` (`0` Cash, `0` Unknown).
   - O catálogo canônico ativo soma exatamente **230** spots MTT deduplicados (`216` `IMPORTED_CHART_NO_EV` + `1` `VERIFIED` TexasSolver `Ah Kd 7c` + `4` `DIDACTIC_DEMO` + `9` `UNSOLVED`), preservando inteiramente a distinção de proveniência e bloqueio de EV sintético.
   - Todos os `linkedSpotId`s vinculados em `CURRICULUM_MODULES` (`7`), `REGLIFE_18_LESSONS` (`23`), `DAILY_DOSE_MICROLESSONS` (`12`) e `FATAL_ERRORS` (`practiceSpotIds`) resolvem para spots existentes no catálogo ativo (`0` links quebrados).
   - `computeSpacedRepetitionSchedule` (`adaptiveDiagnostics.ts:352`) ignora `isSpotIdExcludedFromMtt(rec.spotId)`.
2. **Aderência mista baseada em TVD (`app/src/lib/poker/drillEvaluator.ts:381-460`):**
   - `computeMixedAdherenceStats` agrupa por `(spotId, hand, canonicalTargetSignature)`, calcula `TVD_g = 0,5 × sum_a |obs_g(a) - target_g(a)|` e agrega pela média ponderada por `n_g`.
   - Testado com permutação completa (ordem direta = reversa = `95%`), grupo unitário (`70%` em alvo `0.7/0.3`; `2%` em ação rara `0.02`) e múltiplas distribuições-alvo. A UI separa corretamente `Mix` (%) e nunca o rotula como `EV` ou `EV loss`.
3. **Treiner Limpo (`CleanRangeTrainerView.tsx`):**
   - Migrado para `evaluateDrillDecision` (aceitando frequências `< 5%` como `low_freq_acceptable` sem inventar EV), com persistência verificada em `localStorage` (`treinerlm_clean_trainer_v1` + guarda `hasHydratedStorage`) sobrevivendo a troca de abas e **reload completo da página** (`1 -> 1`) e resetando corretamente para `0`.
   - `anteLabel` corrigido para `"Ante 0.125bb"` e `formatLabel="MTT 8-Max"`.
4. **Fórmulas matemáticas base (`mathEngine.ts`, `labEv.ts`, `MathLab`):**
   - Validação `Number.isFinite` confirmada lançando `Error` para `NaN`/`Infinity` em `calculatePotOdds`, `calculateBluffBreakevenFoldEquity`, `calculateSimplifiedMdf`, `calculatePolarizedRiverBluffFraction`, `calculateIcm`, `calculateBubbleFactor`, `evaluatePkoBountyModel` e `calculateLabEv`.
   - Verificação analítica independente exata para `Pot Odds` (`25%`), `Fold Equity` (`33,33%`), `MDF` (`66,67%`), `River Polar` (`25%`), `EV(call/bet/check/bluff/mix)` (`+30 / +40 / +30 / +10 / +35`) e enumeração exata no navegador (`AsAh vs KsKh` turn = `95.45%` em `0.003 s`).
   - Eliminação da dupla multiplicação `0.5` em `evaluatePkoBountyModel` (padrão `0.33` -> `+3.300` fichas; alternância `0.50` na UI -> `+5.000` fichas).
5. **Reordenamento e sincronização de estados chave:**
   - **Quick Hub (`PokerStudioApp` -> `TrainerView` -> `InteractiveDrillsLab`):** Roteamento com `trainerRequestNonce` funciona após montagem.
   - **`RangeExplorerView`:** Abertura sincronizada em `100 BB` (`100BB - RFI UTG`), zero badge `(Spin)`, seletores `MTT chipEV` / `MTT com ICM` / `MTT PKO` com aviso de ausência de solver, e banner de auditoria de matriz na página de `17bb_sb_vs_utg_rfi`.
   - **Modais `<dialog>`:** Tanto `SettingsModal` quanto o modal `Importar Solver` (`TrainerView`) fecham com `Escape` e devolvem o foco ao botão disparador (`settings` e `Importar Solver`).
   - **Mesa (`PokerTable.tsx`):** Assentos após Herói pré-flop exibem `"Aguarda"` (e `data-seat-state="awaiting"`) em vez de `"fold"` falso; `StatsView` mostra `"Nenhum leak detectado"` com `100%` de acerto (sem histórico Spin); `Currículo` exibe `"1 aula"` corretamente; `AiCoachView` cita estritamente os livros reais do índice local; `Replayer ↔ Biblioteca` sincronizam `pending` em SQLite e `"Enviar para Lab"` abre o cenário no `MathLab`.
6. **Segurança anti-CSRF de navegador em `/api/coach`:**
   - Rejeita `403` requisições sem `X-Poker-Coach: local-v1`, com `Origin` externo (`https://evil.example`), `Sec-Fetch-Site: cross-site`, ou incompatibilidade `http://localhost` vs `Host: 127.0.0.1`; valida `prompt <= 8000` (`400`), `imageMimeType` (`400`), rate limit de `20 req/min` (`429` da 21ª em diante) e teto de corpo de `6 MiB`.

---

## 2. Correções Parcialmente Verificadas

1. **Exclusão total de Spin & Go na visualização histórica (`StatsView.tsx` + `adaptiveDiagnostics.ts`):**
   - O catálogo ativo e o Leitner (`computeSpacedRepetitionSchedule`) filtram `spin_`, mas relatórios de histórico antigo no `StatsView` (`classifyAndRankLeaks`, `computeDimensionalProgress`, `unifiedReviewRows`) continuam exibindo linhas e contagens de Spin & Go e mantêm botão `"Treinar"` clicável que falha silenciosamente.
2. **Auditabilidade de células incompletas em `ranges_gto.json`:**
   - Implementada apenas como banner passivo no `RangeExplorerView`; **ausente** na prática dentro de `TrainerView` e `CleanRangeTrainerView` (explicado na Seção 3 e Seção 6).
3. **Piso tipográfico (`>= 11 px` / `0.6875rem`) e remoção do tema cinza legado:**
   - `#191B1D` foi zerado e CSS Modules (`ReplayerView.module.css`, `MathLab.module.css`) foram padronizados, **mas** `#090B0C`, `#292C2F`, `#A1A6AA`, `#6A7075` e classes `text-[0.6rem]`/`text-[0.625rem]`/`text-[0.65rem]` continuam disseminados em componentes centrais.
4. **Identidade `TreinerLM` no ecossistema Windows (`windows/` + `README.md`):**
   - `launcher.pyw` e `Prepare-GTOTrainer.ps1` atualizaram a janela GUI e ícone (`π`), porém o arquivo `.lnk` criado, mensagens de erro e `Verify-GTOShortcut.ps1` continuam referenciando `"GTO Trainer"`, divergindo do `README.md`.
5. **Reprodutibilidade completa de cabeçalho e navegação responsiva:**
   - Corrigido plenamente em `1280×800`, `1440×900` e `1920×1080`, mas em `768×1024` a última aba (`Estatísticas`) continua parcialmente cortada dentro do scroll horizontal da `<nav>`, e em `390×844` o cabeçalho completo inicial mede `200 px` (embora não seja `sticky` no mobile).

---

## 3. Defeitos Ainda Existentes

| ID | Severidade | Localização exata | Evidência objetiva e impacto |
|---|---|---|---|
| **HOM-01** | **Média / Alta (MTT-Only)** | `StatsView.tsx:315-382, 1041-1048, 1473`, `TrainerView.tsx:706`, `mttCatalog.ts:200` | **(a)** Registros históricos `spin_*` gravados antes do refinamento no `localStorage` continuam alimentando KPIs/leaks/tabelas no `StatsView` e geram um **botão `"Treinar"` quebrado** (clicar navega para `Treinar`, mas `TrainerView` não encontra o ID excluído e cai silenciosamente no spot TexasSolver padrão sem aviso). **(b)** `StatsView.tsx:1473` ainda exibe `"Por Formato (chipEV / ICM / PKO / Spin)"`. **(c)** `isSpotIdExcludedFromMtt` só bloqueia prefixo `spin_`/`cash_`, ignorando potenciais IDs `sng_` ou importados que tenham `spin` no meio do nome. |
| **HOM-02** | **Média / Alta (Integridade GTO)** | `TrainerView.tsx`, `CleanRangeTrainerView.tsx`, `drillEvaluator.ts:78-94` | As **23 células MTT** com perda de extração (`> 0,002`, especialmente `17bb_sb_vs_utg_rfi / AA` e `20bb_btn_vs_mp_rfi / KK` com soma `0,964`) são sorteadas normalmente nos treinos sem alerta visual nem proteção de avaliação (detalhes na Seção 6). |
| **HOM-03** | **Média (Dados & Estado)** | `TrainerView.tsx:530, 808`, `CleanRangeTrainerView.tsx:275-282` | **(a)** Diferente do `Treiner Limpo`, o `Modo Trainer` mantém `mixedAttempts` e `sessionTotal` apenas em `useState`: trocar de aba (`Treinar -> Biblioteca -> Treinar`) **zera** o placar (`1 -> 0`) e apaga `Aderência ao Mix`; além disso `if (res.gtoScored)` faz o `Modo Trainer` **ignorar** as 216 matrizes pré-flop MTT na aderência ao mix. **(b)** Na restauração de `treinerlm_clean_trainer_v1`, `CleanRangeTrainerView` não valida se `m.targetDistribution` é objeto válido — dado corrompido causaria `TypeError` em `Object.entries(...)` no `computeMixedAdherenceStats`. |
| **HOM-04** | **Média (Segurança / HTTP Semântico)** | `coach/route.ts:285`, `coach/route.ts:125,260,282` | **(a)** Quando `limitedBody` excede `6 MiB`, `/api/coach` captura a exceção no `catch` genérico e devolve **HTTP `500`** (`{"error":"Entrada acima do limite."}`) em vez de `413`. **(b)** Não há validação de tamanho/formato de `previousInteractionId` nem de profundidade/tamanho de `spotContext` (apenas o limite global de 6 MiB) nem validação de base64 decodificável antes de chamar a SDK. **(c)** `classifyCanonicalSpot` (`mttCatalog.ts:110`) acessa `spot.referenceStrategy.solutionSource` sem opcional, podendo lançar `TypeError` caso um JSON corrompido do `localStorage` chegue sem `referenceStrategy`. |
| **HOM-05** | **Baixa / Média (UI & UX)** | `StatsView.tsx`, `HandLibraryView.tsx`, `TrainerView.tsx`, `PokerStudioApp.tsx`, `MathIcmLab.tsx`, `Windows/README` | **(a)** `StatsView.tsx:1473` (`Spin`), `<option value="push_fold">` / `<option value="vs_shove">` vazios no filtro do `TrainerView.tsx:1988-1989`. **(b)** Tema legado `#090B0C`/`#292C2F`/`#6A7075` e 18 nós `< 11px` ativos na tela do Trainer (`0.6rem`..`0.65rem`). **(c)** `StatsView` em tablet `768×1024` cortado na `<nav>` (`navScrollWidth 804 > 718`). **(d)** `MathIcmLab.tsx:59-66` ignora silenciosamente tokens não-numéricos em `stacksInput`/`payoutsInput` (`"1000, abc"` -> `[1000]`). **(e)** `README.md` cita `TreinerLM.lnk`, mas `Prepare-GTOTrainer.ps1` e `Verify-GTOShortcut.ps1` criam/validam **`GTO Trainer.lnk`**. |

---

## 4. Possíveis Regressões

1. **Filtros `Push / Fold` e `vs Shove` vazios no `TrainerView` (`1988-1989`):** Com a remoção dos 13 spots Spin & Go, selecionar `Push / Fold` ou `vs Shove` no `<select>` do `Modo Trainer` produz lista vazia e força fallback silencioso, enquanto o `CleanRangeTrainerView` teve o cuidado de desabilitar os botões indisponíveis.
2. **Remoção do parâmetro implícito `0.5 × 0.5` em PKO (`mathEngine.ts:418`):** O novo padrão `0.33` em `evaluatePkoBountyModel` produz `+3.300` fichas (vs `+2.500` antigos) e `27,32%` de equidade ajustada. Embora mais coerente com literatura PKO 50/50 clássica, qualquer expectativa antiga baseada em `0.25x` muda de valor (documentado, mas altera números padrão).
3. **Priorização de `"Segoe UI Variable", "Segoe UI"` sobre `Inter` em `globals.css`:** Garante métrica local estável no Windows sem CDN, mas no macOS/Linux a largura de botões da `<nav>` pode variar ligeiramente em relação aos `718 px` limítrofes de `768×1024`.

---

## 5. Resultados dos Testes Executados Nesta Homologação

Todos os comandos abaixo foram executados diretamente sobre o estado atual do projeto nesta sessão de homologação:

| Verificação | Comando / Escopo | Resultado Direto Observado |
|---|---|---|
| **TypeScript Check** | `cd app && npm run typecheck` (`tsc --noEmit`) | **PASSOU** (EXIT 0, 0 erros) |
| **ESLint** | `cd app && npm run lint` (`eslint .`) | **PASSOU** (EXIT 0, 0 erros) |
| **Suíte Unitária TS (`app/`)** | `cd app && npm test` (`node --test src/lib/__tests__/*.test.ts`) | **PASSOU — 138/138** em **27 suítes** (`fail 0`, `skipped 0`, `15.26s`) |
| **Pipeline Python (`hand_history`)** | `.\pipeline\hand_history\.venv\Scripts\python.exe -m unittest discover -s pipeline\hand_history -t . -p "test_*.py"` | **PASSOU — 71/71 (`OK`)** em `10.039s` |
| **Launcher Python (`windows/`)** | `.\pipeline\hand_history\.venv\Scripts\python.exe -m unittest windows\test_launcher.py` | **PASSOU — 8/8 (`OK`)** em `13.545s` |
| **Atalho Windows** | `powershell -ExecutionPolicy Bypass -File windows\Verify-GTOShortcut.ps1` | **7/7 booleanos `true`** · `actualDoubleClickTest: "PENDING_USER_TEST"` |
| **Script Analítico Independente** | `scratch/audit_independent.mts` (ranges, 23 células MTT, TVD, PKO, `NaN`, `linkedSpotIds`) | **EXECUTADO (EXIT 0)** — confirmou 216/13/230 spots, 0 broken links, 23 desvios MTT, TVD invariante, 8 rejeições `NaN/Inf` |
| **HTTP Segurança `/api/coach`** | `scratch/verify_homolog.mjs` Parte A (servidor `next start` em `127.0.0.1:3197`) | Validados `403` anti-CSRF, `400` validações, `429` rate limit (21ª req), **achado `500` no payload >6MiB** e `GET 200` por processo local com header fixo |
| **Navegador Real Edge CDP** | `verify_homolog.mjs` + `verify_homolog_part2.mjs` (`1920`, `1440`, `1280`, `768`, `390`) | `0` console/page/HTTP errors; confirmados fluxos positivos **e** reproduzidos `HOM-01`, `HOM-03` e corte `Estatísticas` em `768px`; *(nota: no run 1 em `390px`, clique em `MathLab` deu timeout por espera curta antes do lazy-load; no run 2 em `1440px`, `MathLab` completou em `0.003s` com `95.45%`)* |

---

## 6. Riscos de Integridade GTO e Análise das 23 Células MTT (`> 0,002`)

### 6.1 Diagnóstico exato das 23 células desviantes em `ranges_gto.json`

Auditoria programática direta nas `36.504` células dos `216` spots MTT revelou:
- `337` células têm resíduo de arredondamento `<= 0,002`.
- **`21` células** apresentam perda menor (`0,002 < delta <= 0,03`, sendo 20 com soma `0,988` e `50bb_sb_vs_mp_rfi / AKo` com soma `0,976` apenas em `3-Bet`).
- **`2` células** apresentam perda severa (`delta = 0,036`, soma **`0,964`**):
  1. **`17bb_sb_vs_utg_rfi / AA`:** `{"Allin 17": 0.571, "Call": 0.393}` (`soma = 0,964`; déficit `0,036` = `3/84`; ações legais `[Allin 17, Call, Fold]`).
  2. **`20bb_btn_vs_mp_rfi / KK`:** `{"Call": 0.952, "Allin 20": 0.012}` (`soma = 0,964`; déficit `0,036` = `3/84`; ações legais `[Allin 20, Call, Fold]`).

*(Lista completa verificada também em `17bb_co_vs_utg_rfi/KK`, `17bb_sb_vs_utg_rfi/{AQs,KJs,QTs}`, `17bb_bb_vs_utg_rfi/{AA,AKs,KK}`, `20bb_btn_vs_utg_rfi/{AKs,AQs,KK,QQ}`, `20bb_btn_vs_mp_rfi/{AKs,AQs,A9s,QQ}`, `20bb_co_vs_hj_rfi/AJs`, `30bb_rfi_lj/33`, `30bb_bb_vs_sb_limp/A7o`, `100bb_bb_vs_sb_limp/{KQo,93o}`.)*

### 6.2 Avaliações indevidas possíveis e proposta de mitigação segura

- **Risco real comprovado no Trainer / Treiner Limpo:**
  1. Caso `extract_ranges.py` tenha descartado uma ação rara abaixo do corte global (~`1,2%–3,6%`, por ex. `Call` em `50bb_sb_vs_mp_rfi / AKo`, `Allin` em `17bb_bb_vs_utg_rfi / AA` ou `20bb_btn_vs_utg_rfi / KK`), o JSON registra `0` implícito, levando `evaluateDrillDecision` a **reprovar como `"ev_error"`** um aluno que tome exatamente essa ação minoritária.
  2. `pickRngTargetAction(..., 98)` (`drillEvaluator.ts:78-94`) falha em atingir o acumulado `<= 100` (`acc` máximo `96,4%`) e **atribui silenciosamente o intervalo `[96.5..100]` à ação dominante** (`Allin 17` ou `Call`), distorcendo o sorteio RNG.
  3. Em `computeMixedAdherenceStats`, como a frequência empírica soma `1,0` e a referência soma `0,964`, cria-se um **piso artificial insuperável de `TVD >= 0,018`** (aderência máxima `98,2%`) para `17bb_sb_vs_utg_rfi / AA`.
  4. Embora não alterem `EV` (pois `evUnit` e `matrixEv` permanecem `null` em `IMPORTED_CHART_NO_EV`), **`TrainerView` e `CleanRangeTrainerView` silenciam completamente o `integrityAudit`** que apenas o `RangeExplorerView` exibe.
- **Correção segura recomendada (sem alterar `ranges_gto.json` nem quebrar SHA-256):**
  - Exibir aviso explícito de integridade em `TrainerView` e `CleanRangeTrainerView` sempre que `integrityAudit.flaggedCells` contiver a `handClass` ativa;
  - Bloquear pontuação automática (`classification = "unsolved"` ou selo `"Dados de extração incompletos (96,4%)"`) e excluir células com `EXTRACTION_LOSS_SEVERE` (`> 0,03`) do cálculo de `computeMixedAdherenceStats` e do `pickRngTargetAction`, preservando 100% os dados originais em disco.

### 6.3 Riscos do Modelo PKO e Loopback

- **PKO:** O cálculo em `evaluatePkoBountyModel` assume implicitamente estrutura **PKO 50/50 simétrica** onde o valor nominal de `startingBountyUsd` equivale à contribuição do jogador para a premiação regular (`50%` reg + `50%` bounty). Em torneios com divisão assimétrica (ex.: `$70` regular + `$20` bounty), não há parâmetro `regularBuyInUsd` na UI nem ressalva explícita dessa simetria nas `assumptions`, além de manter `immediateBountyUsd` fixado em `0.5 × villainBountyUsd`.
- **Segurança `/api/coach`:** Em modelo de ameaças de loopback local, `X-Poker-Coach: local-v1` + `Origin` previnem eficazmente CSRF cross-origin vindo de abas externas do navegador, **mas** como `"local-v1"` é um cabeçalho estático público no código cliente (não um segredo criptográfico), qualquer processo local rodando sob a sessão do usuário pode reproduzir a requisição e consumir a `GEMINI_API_KEY` do `.env.local`.

---

## 7. Problemas Visuais, Tipográficos e Responsivos

1. **Microtipografia `< 11 px` persistente:** O relatório anterior previu piso mínimo de `0.6875rem` (`11 px`), porém inspeção DOM em `1920×1080` contabilizou **`18` elementos visíveis `< 11 px`** logo na tela inicial (`9.6 px` em `MÃOS`/`ACERTOS`/`PRECISÃO`/`Solução Verificada`, `10 px` nos chips de assento da mesa e `10.4 px` nos filtros), além de ocorrências adicionais em `StatsView`, `HandLibraryView`, `CurriculumView`, `AiCoachView` e `InteractiveDrillsLab`.
2. **Restos de tema legado `#090B0C` / `#292C2F` / `#6A7075`:** Concentrados em `HandLibraryView.tsx` (cards de metadados/favoritos), `StatsView.tsx` (formulário de adição manual e cartões móveis de revisão), `TrainerView.tsx` (subdivisores e painel de histórico/coach) e `ReplayerView.module.css:204` (`#6A7075`, contraste limítrofe/insuficiente para AA normal).
3. **Hierarquia `<h1>` subdimensionada:** O logo `<h1>TreinerLM</h1>` permanece em `14 px` (`text-sm`), menor que `<h2>` das telas (`16–26 px`).
4. **Navbar cortada em Tablet `768×1024`:** Medição real no Edge confirmou `navScrollWidth = 804 px > navClientWidth = 718 px`, ocultando/cortando o botão **`Estatísticas`** na borda direita sem indicador visual de rolagem.
5. **Dobra inicial Mobile (`390×844`):** Sem ocultar o aviso anti-RTA, `<header>` soma `200 px` no topo (~`23,7%` da altura inicial), empurrando a mesa do `Modo Trainer` para `tableTop = 784 px` (quase inteiramente fora da primeira tela; ao menos deixou de ser `sticky` em `< 1024px`, liberando a rolagem).
6. **Fonte `Inter` dependente do sistema:** `globals.css` prioriza `"Segoe UI Variable", "Segoe UI"` sem embarcar `.woff2` via `next/font/local`; funciona perfeitamente em Windows 11, mas varia de métrica em outros sistemas operacionais.

---

## 8. Pontos que Exigem Teste Manual pelo Usuário

1. **Duplo clique real no atalho do Windows (`actualDoubleClickTest = PENDING_USER_TEST`):** Testar fisicamente abrir `"GTO Trainer.lnk"` (ícone `π`) na Área de Trabalho e confirmar abertura da janela `TreinerLM`, inicialização no navegador padrão, e encerramento limpo do Node/Next ao clicar `"Encerrar TreinerLM"`.
2. **Consulta real com chave Google AI Studio (`GEMINI_API_KEY` válida):** Testar envio real de texto e print (`Ctrl+V`) no `AI Poker Coach` e no botão `"Perguntar ao Coach"` no `TrainerView` (não testado contra a API externa do Google por política estritamente offline/sem consumo de credencial real).
3. **Interação touch física em smartphone/tablet (`pointer` drag):** Validar sensação tátil real ao arrastar o dedo na grade 13×13 do `Construtor de Ranges` (`InteractiveDrillsLab`) e ao rolar o Comparador 2× em `RangeExplorerView`.
4. **Persistência visual de longa sessão com mãos reais do SQLite pessoal:** Testar com um histórico real `.phh`/`.json` se filtros de revisão, marcação `"Marcar para revisão"` no Replayer e `"Enviar para Lab"` preservam velocidade confortável no uso cotidiano.

---

## 9. Classificação por Prioridade das Ações Pendentes

- **Prioridade P1 (Recomendadas antes de considerar 100% fechado):**
  1. Bloquear/sinalizar em `TrainerView` e `CleanRangeTrainerView` as `23` células com perda de extração (especialmente `17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK`) para impedir falsos `ev_error` e desvio de `pickRngTargetAction`.
  2. Filtrar `spin_*`/`sng`/`cash_*` em **todo** o `StatsView` (incluindo `classifyAndRankLeaks`, `computeDimensionalProgress` e `unifiedReviewRows`), remover `"Spin"` da aba `format` (`StatsView:1473`) e impedir ou sinalizar tentativas antigas de clicar `"Treinar"` em spots excluídos.
  3. Tornar `isSpotIdExcludedFromMtt` resiliente (`spin`/`sng`/`cash` além de prefixo) e adicionar guarda defensiva `spot?.referenceStrategy?.solutionSource` em `classifyCanonicalSpot`.
  4. Alinhar definitivamente nome do atalho no Desktop (`TreinerLM.lnk` vs `GTO Trainer.lnk`) entre `Prepare-GTOTrainer.ps1`, `Verify-GTOShortcut.ps1`, `Launch-GTOTrainer.vbs` e `README.md`.
- **Prioridade P2 (Consistência Funcional, Segurança e UI):**
  5. Decidir política do `Modo Trainer`: persistir `mixedAttempts`/sessão no `localStorage` como o `Treiner Limpo` (ou explicitar na UI que `Aderência ao Mix` é apenas da sessão atual e não cobre charts sem solver) + validar `typeof m.targetDistribution === "object"` no `CleanRangeTrainerView`.
  6. Retornar `413` em `/api/coach` quando exceder `6 MiB` e validar formato/tamanho de `previousInteractionId` e `spotContext`.
  7. Resolver corte da 7ª aba (`Estatísticas`) em `768×1024` (ex.: `px-2 md:px-2` ou rótulo compacto `Stats` em `md:`/`lg:` antes de `xl:`) e remover os últimos restos `#090B0C`/`#292C2F`/`#6A7075` + textos `0.6rem`/`0.625rem`/`0.65rem` em `HandLibraryView`, `StatsView`, `TrainerView`, `PokerStudioApp` e `ReplayerView.module.css`.
  8. Documentar claramente no `MathIcmLab` a hipótese de estrutura PKO 50/50 simétrica (ou adicionar campo opcional de prize pool regular / entrada livre do fator PKO) e validar tokens inválidos em `stacksInput`/`payoutsInput`.
- **Prioridade P3 (Evolução):**
  9. Unificar fila Leitner entre `Treiner Limpo`, `Daily Dose`, `Erros Fatais` e `Modo Trainer`; modularizar `TrainerView`/`StatsView`/`InteractiveDrillsLab`; adicionar soluções pós-flop verificadas MTT ICM e PKO.

---

## 10. Parecer Final por Área e Módulo

| Área / Módulo | Classificação Final | Justificativa Objetiva |
|---|---|---|
| **1. Ranges Exclusivamente MTT** | **APROVADA COM RESSALVAS** | `216` MTT confirmados e `13` Spin excluídos em todo o catálogo ativo (`230` spots, `0` links quebrados), mas `StatsView` ainda exibe/abre histórico Spin e `TrainerView` mantém `<option>` `push_fold`/`vs_shove` vazios. |
| **2. Integridade dos Charts (`ranges_gto.json`)** | **APROVADA COM RESSALVAS** | Hashes intactos e auditoria precisa (`23` MTT `>0.002`, `2` graves `0.964`), visível no `RangeExplorerView`; porém **sem proteção/aviso no `TrainerView` e `CleanRangeTrainerView`** durante sorteio RNG e avaliação. |
| **3. Estratégias Mistas & `Treiner Limpo`** | **APROVADA COM RESSALVAS** | Métrica TVD invariante à ordem validada matematicamente e persistência + `evaluateDrillDecision` aprovadas no `Treiner Limpo`; porém `Modo Trainer` perde `mixedAttempts` ao trocar de aba e falta validação defensiva em `targetDistribution` restaurado. |
| **4. Motor Matemático (`MathEngine`, `MathIcmLab`, `MathLab`)** | **APROVADA COM RESSALVAS** | Pot Odds, Fold Equity, MDF, ICM, EV e Enumeração Exata 100% validados analiticamente e com guarda `NaN/Infinity`; ressalvas apenas na hipótese 50/50 implícita do modelo PKO e filtro silencioso em `stacksInput`. |
| **5. Segurança (`/api/coach` e APIs locais)** | **APROVADA COM RESSALVAS** | CSRF cross-origin bloqueado (`403`), rate limit (`429`) e validações funcionais; limitações naturais de header fixo em loopback local, retorno `500` em payload >6MiB (ideal `413`) e chave cliente em `localStorage`. |
| **6. Navegação & Quick Hub (`PokerStudioApp`)** | **APROVADA COM RESSALVAS** | 7 domínios eliminam corte em `1280×800`, `1440×900` e `1920×1080`, Quick Hub corrigido; ressalva pelo corte da 7ª aba (`Estatísticas`) em `768×1024` e cabeçalho `200 px` no `390×844`. |
| **7. Range Explorer & Mesa (`RangeExplorer`, `PokerTable`)** | **APROVADA COM RESSALVAS** | Sync `100 BB`, comparação MTT, `Aguarda` após Herói e wrap mobile aprovados; pendente apenas propagar alerta de integridade das 23 células para o palco de treino. |
| **8. Biblioteca & Replayer (`HandLibrary`, `Replayer`)** | **APROVADA COM RESSALVAS** | Pipeline PHH/SQLite `71/71`, sync `pending` e envio ao Laboratório aprovados; mantém tema cinza legado `#090B0C`/`#292C2F`/`#6A7075` em subcards da Biblioteca. |
| **9. Estatísticas (`StatsView`)** | **REPROVADA** *(para fechamento definitivo)* | Corrigiu falso leak `100%`, `attemptId` e card manual, porém **retém label `"Spin"` na aba de formatos, processa dados históricos de Spin com botão `"Treinar"` quebrado e mantém blocos `#090B0C`/`#292C2F` + microtipografia `<11px`**. |
| **10. Estudos (`Currículo`, `Erros Fatais`, `AI Coach`)** | **APROVADA COM RESSALVAS** | `"1 aula"` e lista real de livros corrigidos, links 100% válidos e quizzes íntegros; ressalva apenas por tokens `0.625rem`/`0.65rem` em metadados e badge técnica explícita no cabeçalho de `Erros Fatais`. |
| **11. Modais & Acessibilidade (`SettingsModal`, `Importar Solver`)** | **APROVADA** | Ambos migrados para `<dialog>` semântico nativo, com fechamento funcional em `Escape` e retorno exato do foco ao disparador. |
| **12. Iniciador Windows (`windows/`)** | **APROVADA COM RESSALVAS** | Segurança/Job Object/SQLite impecáveis (`8/8` testes + `7/7` shortcut checks) e UI Tk alinhada para `TreinerLM` (`π`), porém arquivo `.lnk` segue `GTO Trainer.lnk` contra `TreinerLM.lnk` documentado no `README.md` e aguarda teste manual de duplo clique. |

---

## RESUMO INDEPENDENTE PARA REVISÃO PELO CHATGPT

- **Veredito Geral (`APROVADO COM RESSALVAS`):** Todas as suítes executadas nesta homologação passaram integralmente após o refinamento (`138/138` testes TypeScript/Next.js em 27 suítes, `tsc` 0 erros, `eslint` 0 erros, `71/71` Python PHH/SQLite, `8/8` launcher Windows e hashes `SHA-256` preservados em `hand-library.sqlite3`, `ranges_gto.json` e `verified_ahkd7c_texassolver.json`). Contudo, a inspeção independente de código e runtime reproduziu lacunas reais não apontadas no relatório do refinamento.
- **Pontos confirmados solidamente:** Exclusão dos `13` spots Spin & Go do acervo estratégico (`216` MTT + `1` TexasSolver `Ah Kd 7c` + `13` didáticos/UNSOLVED = `230` MTT ativos com `0` links quebrados em Currículo/Daily Dose/Erros Fatais); `computeMixedAdherenceStats` por `(spotId, hand, canonicalTargetSignature)` invariante à ordem com TVD; persistência real do `Treiner Limpo` sobre reload; fórmulas matemáticas (`Pot Odds`, `FE`, `MDF`, `ICM`, `EV`,Worker `Exact` `95.45%`) com rejeição `NaN/Infinity` e correção da dupla atenuação PKO; proteções anti-CSRF (`403`, `429`) em `/api/coach`; `<dialog>` com `Esc` e retorno de foco; sincronização `Replayer ↔ Biblioteca`; e `1440×900`/`1920×1080` sem corte na navbar.
- **Principais achados críticos/médios que impedem `APROVADA` plena:**
  1. **`StatsView` falha no isolamento retroativo MTT-Only e UI residual:** Continua exibindo `"Por Formato (chipEV / ICM / PKO / Spin)"`, processa registros históricos `spin_*` fora do Leitner e renderiza botão `"Treinar"` que cai silenciosamente no spot padrão quando clicado em mão histórica de Spin.
  2. **23 células MTT com desvio `> 0,002` (incluindo `0,964` em `17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK`) desprotegidas no treino ativo:** Apenas o `RangeExplorerView` exibe o aviso de integridade; no `TrainerView` e `CleanRangeTrainerView`, ações minoritárias omitidas pelo extrator podem gerar `ev_error` falso, `pickRngTargetAction(98)` desvia o déficit (`3,6%`) para a ação dominante e `TVD` herda piso `>= 0,018`.
  3. **Assimetria `Modo Trainer` vs `Treiner Limpo`:** `Modo Trainer` descarta `mixedAttempts`/`sessionTotal` ao trocar de aba (`useState`) e não grava charts pré-flop MTT em `mixedAttempts`; `CleanRangeTrainerView` não valida `typeof m.targetDistribution === "object"` ao hidratar `treinerlm_clean_trainer_v1`.
  4. **Segurança & Contrato HTTP em `/api/coach`:** Protege corretamente contra CSRF cross-site no navegador, mas `X-Poker-Coach: local-v1` é cabeçalho estático (não autentica processos locais), falta validação explícita de `previousInteractionId`/`spotContext`, e payload `> 6 MiB` retorna HTTP `500` em vez de `413`.
  5. **UI/Design System & Windows:** Ainda restam `18` nós `< 11px` na tela inicial (`9.6–10.4 px`), tokens legados `#090B0C`/`#292C2F`/`#6A7075` em `HandLibraryView` e `StatsView`, corte da 7ª aba (`Estatísticas`) na largura `768×1024`, e divergência entre `Prepare-GTOTrainer.ps1`/`Verify-GTOShortcut.ps1` (`GTO Trainer.lnk`) e `README.md` (`TreinerLM.lnk`), com duplo clique real pendente de teste humano.
