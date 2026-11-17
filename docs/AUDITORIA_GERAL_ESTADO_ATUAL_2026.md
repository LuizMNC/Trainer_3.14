# AUDITORIA TÉCNICA GERAL E DIAGNÓSTICO DO ESTADO ATUAL — `Projeto-Poker` (`TreinerLM`)

**Data da auditoria:** 16/11/2026  
**Escopo:** Auditoria independente, estritamente não destrutiva e baseada em evidências diretas de código-fonte, artefatos em disco, banco SQLite (cópia descartável / leitura `mode=ro`), suítes de testes automatizados, build de produção, benchmarks reproduzíveis e inspeção em navegador real nos 4 viewports (`1920×1080`, `1440×900`, `768×1024` e `390×844`).  
**Regra cumprida:** Nenhuma correção de código, reformulação de interface, migração destrutiva, alteração de soluções GTO, modificação do SQLite pessoal (`%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`) ou commit Git foi executado nesta sessão.

---

## 1. RESUMO EXECUTIVO

O **`Projeto-Poker` (atualmente denominado `TreinerLM` na interface web)** evoluiu substancialmente além da etapa documentada nos relatórios originais: trata-se hoje de uma plataforma local robusta de estudo de poker offline em **Next.js 15.5.29 / React 19.1.0 / TypeScript 5.8.3 / Tailwind CSS 3.4.17**, acoplada a um **pipeline Python 3.15.0 + PokerKit 0.7.7 + SQLite (`PHH1`)** e a um **iniciador nativo Windows** com Job Objects e isolamento loopback.

Em linha geral, o **núcleo de engenharia e de integridade científica/GTO está acima da média**:
- Todas as suítes automatizadas existentes executadas nesta auditoria passaram integralmente: **130/130 testes TypeScript** (`npm test`), **71/71 testes Python do pipeline PHH/SQLite**, **8/8 testes do iniciador Windows**, **ESLint (`npm run lint`) com 0 erros**, **TypeScript (`npm run typecheck`) com 0 erros** e **build de produção (`npm run build`) sem erros**.
- A política de proveniência GTO foi preservada rigorosamente: existe **1 solução pós-flop real embarcada e auditável** (`verified_ahkd7c_texassolver.json`, SHA-256 idêntico ao `canonical_bundle.json` do pipeline TexasSolver), com `matrixEv = null` e `evUnit = null` explicitamente preservados; os 9 spots sintéticos antigos continuam revogados (`3 DIDACTIC_DEMO` sem EV e `6 UNSOLVED`); e os 20 cartões de `Erros Fatais` mantêm `evLossBb = null` e `automaticDiagnosisAllowed = false`.

Contudo, **dois commits recentes em `main` (`2412db0` e `7a0d5d8`, de 15/11/2026) ainda não constam na documentação (`docs/`)**, alteraram profundamente a identidade visual, a navegação e a superfície de código (incluindo a criação de uma nova aba **`Treiner Limpo`** e reestilização para o tema **vermelho/preto/azul**) e introduziram ou deixaram expostos **defeitos funcionais, inconsistências matemáticas/estatísticas, falhas de sincronização entre módulos e dívida visual**:
1. **Acesso Rápido (Quick Hub) quebrado para sub-abas do `TrainerView`:** Clicar em atalhos do menu "Acesso rápido" para sub-abas já montadas (`Construtor de ranges` após voltar à `Mesa de Decisão`, ou `Exercício de matemática (Pot Odds)` a partir do `Construtor de ranges`) fecha o menu e **não navega**.
2. **`Treiner Limpo` (`CleanRangeTrainerView`) perde progresso ao trocar de aba e usa avaliador legado:** Ao contrário do `Modo Trainer`, não persiste em `localStorage`, descarta contador/sequência ao desmontar, usa `evaluateDecision` legado (que pune frequências mistas `< 5%` como erro) e exibe `stackBb` no rótulo onde `PokerTable` espera info de ante (`"Memorização · 14 BB"`).
3. **`Explorador de Ranges` abre em estado contraditório:** O botão de stack `100 BB` nasce ativo enquanto `primarySpotId` aponta para `14BB - RFI UTG` (`spots[0]`), dessincronizando seletor de stack e matriz exibida.
4. **Falha matemática em `computeMixedAdherenceStats`:** Em sessões reais com múltiplas mãos/spots no `TrainerView`, a função compara a distribuição acumulada heterogênea contra a distribuição-alvo **apenas da última tentativa**, corrompendo a métrica de aderência ao mix.
5. **Escala dupla implícita (`0.25x`) no modelo PKO e ausência de guarda `Number.isFinite` em fórmulas base de `mathEngine.ts`:** `evaluatePkoBountyModel` aplica fator `0.5` de bounty imediato **e** `bountyChipFactor` padrão `0.5` (`25%` do equivalente), sem expor `bountyChipFactor` na UI; e `calculatePotOdds`/`calculateBluffBreakevenFoldEquity`/`calculateSimplifiedMdf` aceitam `NaN` retornando `NaN` silenciosamente.
6. **`StatsView` declara `"MAIOR LEAK POR POSIÇÃO: BTN (100%)"` mesmo com 100% de acerto**, pois não exige ao menos 1 erro (`pct < 100`) nem múltiplas posições.
7. **`Replayer` e `Biblioteca de Mãos` não sincronizam marcação de revisão**, porque `"☆ Marcar para revisão"` no `ReplayerView` grava somente em `localStorage`, enquanto a `Biblioteca` lê a coluna `pending` no SQLite.
8. **`AI Poker Coach` anuncia livros ausentes no índice RAG (`knowledge_base.json`)** — cita *Modern Poker Theory*, *Play Optimal Poker 1 & 2* e *The Grinder's Manual*, embora os 322 trechos reais indexem 4 PDFs da RegLife e 4 outros livros (Fitzgerald, Crawford, Hissa/Bastter/Caputo e Leo Bello) — e a rota `/api/coach` não utiliza a guarda `assertLibraryAccess` aplicada às demais APIs locais.
9. **Reestilização visual e README incompletos:** Vários componentes (`StatsView`, `InteractiveDrillsLab`, `HandLibraryView`, `RangeExplorerView`, `ReplayerView.module.css`) mantêm cores residuais `#191B1D`/`#292C2F` do tema antigo, a barra de abas sofre recorte horizontal até em `1920×1080` devido ao container `max-w-[1460px]`, no mobile (`390×844`) o cabeçalho sticky + faixa anti-RTA consome ~23,8% da altura da tela (`~201 px` de `844 px`), e o iniciador Windows (`launcher.pyw` / `Prepare-GTOTrainer.ps1`) permanece com identidade `"♠ GTO Trainer"` em verde esmeralda.

---

## 2. ESTADO DO REPOSITÓRIO GIT E PROTEÇÃO DO AMBIENTE

| Item verificado | Valor observado em disco / Git |
|---|---|
| Workspace aberto pelo usuário | `C:\Users\lmnaz\OneDrive\Desktop\Repositório Github` (contém pastas irmãs fora do repo: `Guia-Ranges-TreinerLM`, `backups`, `rea`) |
| Raiz verdadeira do repositório Git | `C:\Users\lmnaz\OneDrive\Desktop\Repositório Github\Projeto-Poker` |
| Branch / Tracking | `main` (`origin/main` sincronizado) |
| Commit `HEAD` | `7a0d5d8bc54328a5f56576724a85728aac7b47d0` (`2026-11-15 03:14:46 -0300`, autor `LuizMNC`) — `feat(TreinerLM): aba Treiner Limpo, tema vermelho/preto/azul, responsividade iPad/celular e paineis recolhiveis` |
| Tag existente | `etapa-6-verified` (apontando para `8af89a4fdf341e9ef79324fc21ee0035d423ef27`) |
| Estado inicial do `working tree` | **Limpo** (`nothing to commit, working tree clean`), **187 arquivos rastreados** |
| Alterações não commitadas prévias | Nenhuma |
| Diretórios ignorados presentes em disco | `app/.next/`, `app/node_modules/`, `app/next-env.d.ts`, `app/tsconfig.tsbuildinfo`, `pipeline/__pycache__/`, `pipeline/hand_history/.venv/`, `pipeline/hand_history/__pycache__/`, `windows/__pycache__/` |
| Materiais binários externos ausentes no repo | **Nenhum arquivo `.pdf` encontrado** em `Repositório Github` (`Daily Dose of GTO - Book.pdf`, PDFs RegLife, EPUBs e vídeos citados nos scripts não estão presentes no workspace). Diretórios históricos de evidência `docs/homologacao-fase1/`, `docs/fase2*-evidencias/` e `docs/fase3-evidencias/` também não existem no checkout atual. |
| Banco SQLite pessoal (`AppData`) | `C:\Users\lmnaz\AppData\Local\Projeto-Poker\hand-library.sqlite3` — `81.920 bytes`, última modificação `14/11/2026 19:57:52`, `PRAGMA user_version=1`, `PRAGMA application_id=0x50484831`, `library_schema=1`, **0 mãos** (`hands=0`, `library_index=0`, `library_study=0`). **Preservado byte a byte** antes e depois da auditoria. |

### Histórico completo de commits no repositório
1. `8af89a4fdf341e9ef79324fc21ee0035d423ef27` (`2026-11-12 21:35:38 -0300`, tag `etapa-6-verified`) — `chore(backup): snapshot completo Projeto-Poker ate Etapa 6` (`63` arquivos).
2. `e7d3ba079cc6e87b6a83302bd22225c53eef0f97` (`2026-11-15 01:14:10 -0300`) — `feat: GTO Trainer completo pronto para GitHub` (`135` arquivos alterados, `+32.139/-1.506`).
3. `2412db02e478e0a0ef9b543f41bc17b76cf98c92` (`2026-11-15 02:28:31 -0300`) — `feat(TreinerLM): tema personalizavel de mesa/cartas/fichas, oponentes cientistas, icone pi e tela cheia` (`16` arquivos, `+934/-84`). **Não documentado em `docs/`.**
4. `7a0d5d8bc54328a5f56576724a85728aac7b47d0` (`2026-11-15 03:14:46 -0300`, `HEAD -> main, origin/main`) — `feat(TreinerLM): aba Treiner Limpo, tema vermelho/preto/azul, responsividade iPad/celular e paineis recolhiveis` (`29` arquivos, `+2.724/-1.436`). **Não documentado em `docs/`.**

---

## 3. VISÃO GERAL DA ARQUITETURA ATUAL

### Stack e versões confirmadas no ambiente de auditoria
- **Frontend / App Web (`app/`):** Next.js `^15.3.0` (instalado `15.5.29`), React `^19.1.0`, React DOM `^19.1.0`, TypeScript `^5.8.3`, Tailwind CSS `^3.4.17`, `lucide-react ^0.511.0`, `@google/genai ^2.29.1`, ESLint `^9.39.4` + `eslint-config-next ^16.4.6`.
- **Runtime JavaScript / Python:** Node.js **`v24.22.0`** (obrigatório `>= 24.22.0` para executar `.ts` diretamente no CLI/testes), Python **`3.15.0`** no `.venv` em `pipeline/hand_history/.venv`, **`pokerkit==0.7.7`** (fixado por hash SHA-256 em `requirements.txt`), **`SQLite 3`** stdlib + **`Tkinter`** stdlib.
- **Pipeline offline opcional (não instalado em `.venv`):** Scripts `extract_ranges.py`, `extract_knowledge.py` (`pymupdf`, `PIL`) e `solve_texassolver.py` (`console_solver.exe` externo AGPL-3.0, ausente no repo).
- **Iniciador Windows (`windows/` + raiz):** `Launch-GTOTrainer.vbs` → `launcher.pyw` (GUI Tkinter + Mutex `Local\GTOTrainer-<id>`) → `launcher_core.py` (Win32 Job Object `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, bind exclusivo `127.0.0.1:3000..3020`, inicia `next start` em produção com `POKER_LIBRARY_ENABLED=1`, `POKER_LAUNCH_TOKEN` e `POKER_LAUNCH_INSTANCE`).

### Diagrama verificável da arquitetura atual

```text
+-------------------------------------------------------------------------+
|                    INICIADOR WINDOWS (windows/)                         |
|  Preparar GTO Trainer.vbs -> Prepare-GTOTrainer.ps1 (venv, npm ci/build)|
|  GTO Trainer.lnk -> Launch-GTOTrainer.vbs -> launcher.pyw (Tkinter)     |
|     -> launcher_core.py (Win32 Job Object + Token loopback 127.0.0.1)   |
+-----------------------------------+-------------------------------------+
                                    | inicia & monitora (/api/local-health)
                                    v
+-------------------------------------------------------------------------+
|                 NEXT.JS APP SERVER (app/src/app/)                       |
|  SSR/SPA Shell: layout.tsx -> page.tsx -> PokerStudioApp.tsx (11 abas)  |
|                                                                         |
|  API Routes (Node Runtime):                                             |
|  ├─ GET/POST /api/hand-library (guarda assertLibraryAccess + 20 MiB cap)|
|  ├─ GET      /api/local-health (token X-Poker-Launch + readiness bridge)|
|  ├─ GET      /api/local-session (identidade de sessão)                  |
|  └─ POST     /api/coach (Gemini Interactions API + local RAG; SEM guarda|
|                          assertLibraryAccess!)                          |
+--------------+-----------------------------------+----------------------+
               | RPC JSON stdin/stdout             | Web Worker & Browser
               | (libraryBridge.ts)                | Storage (localStorage)
               v                                   v
+----------------------------------+  +-----------------------------------+
| PIPELINE PYTHON & SQLITE (PHH1)  |  | NAVEGADOR DO USUÁRIO (Client-side)|
| pipeline/hand_history/           |  | - Estado React por aba            |
|  ├─ library_cli.py -> library.py |  | - lab.worker.ts (Enumeração Exata |
|  ├─ store.py <-> SQLite local    |  |   e Monte Carlo c/ seed & Hoeff.) |
|  ├─ importer.py <-> PokerKit0.7.7|  | - localStorage (histórico Trainer,|
|  └─ canonicalValidationCli.mjs   |  |   autoavaliação, Erros Fatais,    |
|     (sub-chamada Node ao TS)     |  |   marcações Replayer, API Key)    |
+----------------------------------+  +-----------------------------------+
```

### Fluxo de dados principais e riscos arquiteturais
1. **Estratégias e Treino:** `data/ranges_gto.json` (229 charts importados de PDF/imagens Spin) + `data/verified_ahkd7c_texassolver.json` (1 spot solver pós-flop) + `curriculum.ts` (3 demos didáticas + 6 spots `UNSOLVED`) convergem em `PokerStudioApp` via `solverAdapter.ts`. Enquanto `TrainerView` usa `drillEvaluator.ts` (com bloqueio de `GTO_TECHNICAL` para não verificados e persistência em `localStorage`), `CleanRangeTrainerView` usa `evaluateDecision` legado (`poker.ts`) e descarta histórico ao desmontar.
2. **Históricos PHH/JSON e Biblioteca:** Arquivos `.phh` ou `.json` enviados pelo navegador passam por `limitador de tamanho (limitedBody)` + `assertLibraryAccess` (loopback, `Origin`, `Sec-Fetch-Site`, `X-Poker-Library: local-v1`), são processados em processo Python efêmero (`library_cli.py`), validados por **PokerKit 0.7.7** (para `.phh`) ou via sub-chamada ao decoder TypeScript (`canonicalValidationCli.mjs`, para `.json`) e gravados atomicamente no SQLite `PHH1`.
3. **Laboratório Matemático:** `MathLab.tsx` despacha execuções para `lab.worker.ts` (Web Worker sem bloqueio de UI) e recebe cenários do `ReplayerView` via callback `replayToLab` (`labTransfer.ts`) no `PokerStudioApp`.

---

## 4. INVENTÁRIO COMPLETO DE ARQUIVOS E MÓDULOS

| Área | Arquivos principais | Finalidade comprovada | Limitações / Riscos |
|---|---|---|---|
| **App & API (`app/src/app/`)** | `layout.tsx`, `page.tsx`, `globals.css`, `icon.svg`, `api/coach/route.ts`, `api/hand-library/route.ts`, `api/local-health/route.ts`, `api/local-session/route.ts` | Shell UI tema escuro azul/vermelho/preto e endpoints locais | `api/coach/route.ts` não passa por `assertLibraryAccess` |
| **Componentes UI (`app/src/components/`, 24 arquivos)** | `PokerStudioApp.tsx`, `CleanRangeTrainerView.tsx`, `CollapsiblePanel.tsx`, `TrainerView.tsx`, `InteractiveDrillsLab.tsx`, `PokerTable.tsx`, `TrainingViewport.tsx`, `RangeMatrix.tsx`, `RangeExplorerView.tsx`, `CurriculumView.tsx`, `FatalErrorsView.tsx`, `FatalErrorQuiz.tsx`, `FatalErrorCalculator.tsx`, `HandLibraryView.tsx`, `ReplayerView.tsx` + `.module.css`, `MathIcmLab.tsx`, `MathLab.tsx` + `.module.css`, `StatsView.tsx`, `AiCoachView.tsx`, `SiteTour.tsx`, `SettingsModal.tsx`, `AccessibilityControls.tsx` | 11 abas de estudo, mesa visual, matriz 13×13, painéis recolhíveis, replayer e lab matemático | Container monolítico (`PokerStudioApp`), restos de tema `#191B1D`/`#292C2F`, abas excedendo largura do navbar |
| **Motores e Catálogos (`app/src/lib/` + `poker/`, 30 arquivos TS + `server/` 3 arq.)** | `poker.ts`, `curriculum.ts`, `rag.ts`, `studyNavigation.ts`, `handLibraryClient.ts`, `lab.worker.ts`, `poker/*` (24 módulos: `cards`, `stateEngine`, `mathEngine`, `drillEvaluator`, `strategySchema`, `solverAdapter`, `solverFormats`, `spotReasoning`, `adaptiveDiagnostics`, `tableAppearance`, `reglifeCatalog`, `dailyDoseCatalog`, `fatalErrorsCatalog/Math/Study`, `handHistorySchema/Adapter/Validation`, `handReplay`, `labEvaluator/Ranges/Equity/Ev/Transfer`), `server/{libraryAccess.ts,libraryBridge.ts,canonicalValidationCli.mjs}` | Núcleo de regras, combinatória, enumeração exata/MC, EV/ICM/PKO, proveniência GTO, Leitner, validação PHH/JSON | Bugs em `computeMixedAdherenceStats`, `poker.ts` (`evaluateDecision`), `mathEngine.ts` (NaN & PKO double 0.5x), `dailyDoseCatalog.ts` (`accuracyPct`) |
| **Dados embarcados (`app/src/data/` & `app/public/replays/`)** | `ranges_gto.json` (1.100.528 B), `verified_ahkd7c_texassolver.json` (85.139 B), `fatalErrorsCatalog.json` (12.741 B), `knowledge_base.json` (273.308 B), `replayExamples.json` (3.365 B), 9 JSONs em `app/public/replays/` | Charts importados, 1 solve TexasSolver real, catálogo Erros Fatais, RAG e 8 replays (+1 diagnóstico inválido) | `ranges_gto.json` contém 360 células com soma `!= 1.0` (23 > 0,002, mín `0.964`) |
| **Pipeline Python (`pipeline/`)** | `extract_ranges.py`, `extract_knowledge.py`, `solve_texassolver.py`, `solver_runs/ahkd7c_btn_vs_bb_30bb_srp/*`, `hand_history/{importer.py,store.py,library.py,library_cli.py,cli.py,generate_replay_examples.py,requirements.txt}` + `fixtures/*` (9 `.phh`) | Importação PHH via PokerKit `0.7.7`, SQLite `PHH1`, geração de replays e run TexasSolver | Scripts de extração PDF/EPUB dependem de PDFs ausentes no Git e deps (`pymupdf`, `PIL`) fora de `requirements.txt` |
| **Iniciador Windows (`windows/` + raiz)** | `Preparar GTO Trainer.vbs`, `Launch-GTOTrainer.vbs`, `Prepare-GTOTrainer.ps1`, `Verify-GTOShortcut.ps1`, `launcher.pyw`, `launcher_core.py` | Setup guiado, atalho Desktop, servidor loopback Next + Job Object | GUI/ícone ainda com nome `"GTO Trainer"` e verde esmeralda antigo |
| **Testes automatizados** | `14` arquivos `.test.ts` em `app/src/lib/__tests__/`, `4` arquivos `test_*.py` em `pipeline/hand_history/`, `windows/test_launcher.py` | Verificação unitária, matemática, segurança HTTP e integração Next↔Python↔SQLite | Falta cobertura E2E de browser real (React interactions, Quick Hub, responsividade mobile) |
| **Documentação e Dossiês (`docs/`, `Dossie/`)** | `README.md`, 13 `.md` em `docs/`, 5 arquivos em `Dossie/` + `docs/screenshots/` + `docs/homologacao-fase2a/externos/` | Planos, auditorias históricas, homologações e guias | Desatualizados em relação a `2412db0` e `7a0d5d8` |

---

## 5. INVENTÁRIO DE FUNCIONALIDADES E STATUS REAL

*(Detalhamento completo linha a linha no entregável complementar [`AUDITORIA_INVENTARIO_FUNCIONALIDADES.csv`](AUDITORIA_INVENTARIO_FUNCIONALIDADES.csv).)*

Resumo das classificações comprovadas:
- **IMPLEMENTADA E TESTADA:** Biblioteca de Mãos SQLite (`PHH1` + filtros + export + backup sem restore na UI), Replayer canônico de eventos PHH/JSON (`8` fixtures + upload JSON), Importador PHH (`PokerKit 0.7.7`, side pots, devoluções), Laboratório Matemático (`labEquity` exato e Monte Carlo com seed/Hoeffding/Welford + `labEv` + Worker + transferência do Replayer), Catálogo `Erros Fatais` (20 cartões, quizzes, calculadoras, Leitner), Adaptação de `verified_ahkd7c_texassolver.json` e parser CSV Desktop Postflop (`solverFormats.ts`), Iniciador Windows (`launcher_core.py` + Job Object).
- **IMPLEMENTADA, MAS SEM TESTE SUFICIENTE:** `Modo Trainer` (fluxo UI completo), `Treiner Limpo` (tem apenas testes de filtro/render estático; sem persistência, sem teste de interação real e usando avaliador legado `evaluateDecision`), `Explorador de Ranges` (bug de stack inicial dessincronizado + sem cobertura dos spots pós-flop/verificados), `Diagnóstico & Leaks / StatsView` (bug de `MAIOR LEAK` com 100%, bug de formulário manual fixo, bug matemático de `computeMixedAdherenceStats` multi-mão), `Treinos Interativos & Daily Dose` (`slice(0,60)`, `accuracyPct` não ponderada por combos, UI bug `vs null`), `Lab EV & ICM` (PKO com duplo fator 0.5x sem controle na UI e `MathEngine` sem check `Number.isFinite`), `AI Poker Coach` (sem testes unitários na rota `/api/coach`, falta de guarda `assertLibraryAccess`, texto desatualizado sobre livros do RAG), `Currículo & 18 Aulas` (gramática `"1 aulas"`, sincronia de seleção de spot).
- **PARCIALMENTE IMPLEMENTADA:** Acesso Rápido (Quick Hub) — funciona parcialmente para troca de aba principal, falha em sub-abas de `TrainerView` / `InteractiveDrillsLab`; Personalização de Mesa — funciona no `Modo Trainer`/`PokerTable`, mas não há acesso ao botão de personalização no `Treiner Limpo`, e iniciador Windows segue desatualizado visualmente; Sincronização Replayer ↔ Biblioteca — marcação `"Marcar para revisão"` no Replayer fica isolada em `localStorage` e não atualiza `pending` no SQLite.
- **PLANEJADA OU DOCUMENTADA, MAS NÃO IMPLEMENTADA:** Soluções GTO adicionais além do spot `Ah Kd 7c` (Desktop Postflop/TexasSolver para turns/rivers/multiway/ICM), módulo PKO completo multiway com árvores solver, e automação local de extração direta de `Daily Dose of GTO - Book.pdf` (PDF ausente).
- **OBSOLETA OU DUPLICADA:** Função legada `evaluateDecision` (`app/src/lib/poker.ts:155-238`, reintroduzida em uso ativo pelo `CleanRangeTrainerView.tsx` apesar da existência superior de `drillEvaluator.ts`).

---

## 6. MUDANÇAS RECENTES E DIVERGÊNCIAS EM RELAÇÃO À DOCUMENTAÇÃO

Os relatórios em `docs/` cobrem até o consolidado de `e7d3ba0` (Fases 1, 2A, 2B, 2C, 3, Refinamento Antigravity e Guia do Usuário). **Os dois commits seguintes em `main` (`2412db0` e `7a0d5d8`) não foram documentados.** Além disso, documentos antigos citam pastas de evidência (`docs/homologacao-fase1/`, `docs/fase2*-evidencias/`, `docs/fase3-evidencias/`) que não constam no checkout atual.

| Módulo | Estado anterior documentado | Estado atual comprovado | Mudança encontrada | Evidência | Risco |
|---|---|---|---|---|---|
| **Identidade / Branding** | `"PDF de Poker"` / `"GTO Trainer"` com tema esmeralda `#18B88D` / `#101112` | `"TreinerLM · Study Lab V2"` com ícone `π` vermelho/azul e crédito `"Desenvolvido por Luiz Miguel N. C."` | Rebranding web completo nos commits `2412db0` e `7a0d5d8`; iniciador Windows e key CSS `pdf_de_poker_font_size_v1` permaneceram antigos | `layout.tsx`, `icon.svg`, `PokerStudioApp.tsx`, `AccessibilityControls.tsx:5`, `launcher.pyw:26-30`, `README.md` | **Baixo/Médio** — desalinhamento entre atalho Windows `"GTO Trainer"` e app `"TreinerLM"` |
| **Navegação & Abas** | 7 ou 10 abas (`ANTIGRAVITY_REFINAMENTO` / `GUIA_USUARIO` / `FASE2C`) | **11 abas** com inserção de **`Treiner Limpo`** (`clean-trainer`) na 2ª posição | Adicionada aba `Treiner Limpo`, alterado rótulo `"Tutor IA"`/`"AI Coach"` e barra de acesso rápido (`showQuickHub`) inicia recolhida | `PokerStudioApp.tsx`, `diff_7a0d5d8.patch`, `SiteTour.tsx` | **Médio** — 11 abas estouram horizontalmente o cabeçalho em desktop (`1440` e `1920`) e aumentam header no mobile |
| **Aba `Treiner Limpo`** | Inexistente nos relatórios e no `GUIA_USUARIO_GTO_TRAINER.md` | Nova aba de memorização rápida (`CleanRangeTrainerView.tsx` + `CollapsiblePanel.tsx`) | Criada no commit `7a0d5d8` com filtros por `spotType` e 8 posições, mesa limpa e matriz recolhida | `CleanRangeTrainerView.tsx`, `cleanRangeTrainer.test.ts` | **Alto** — usa `evaluateDecision` legado (erro <5%), sem persistência, zera ao sair da aba |
| **Mesa de Poker (`PokerTable`) & Tema** | Feltro verde esmeralda, assentos genéricos `"UTG"`, `"CO"`, `"BTN"` | Feltro azul `#0B1B36`/borda `#991B1B` personalizável (`tableAppearance.ts`), watermark `π TREINERLM`, 8 oponentes cientistas (`Newton`, `Einstein`, etc.) | Implementado sistema completo de customização de mesa/cartas/fichas (`2412db0`) + novo tema padrão (`7a0d5d8`) | `tableAppearance.ts`, `tableAppearance.test.ts`, `PokerTable.tsx`, `TrainerView.tsx` | **Médio** — assentos não atuantes ainda exibem `"fold"` antes do turno em `PokerTable.tsx:418,477`; tema híbrido residual |
| **TrainerView / Telas e UI** | Sidebar aberta por padrão, cores `#191B1D`/`#18B88D` | Sidebar com painéis recolhíveis (`CollapsiblePanel`), tela cheia (`TrainingViewport` em `<dialog>`), cores `#05070B`/`#2563EB`/`#DC2626` | Conversão parcial de CSS para paleta `#090D16` / `#1E293B`; sobras `#191B1D`/`#292C2F` em vários subpainéis | `TrainerView.tsx`, `TrainingViewport.tsx`, `StatsView.tsx`, `InteractiveDrillsLab.tsx`, `HandLibraryView.tsx`, `ReplayerView.module.css` | **Baixo/Médio** — inconsistência visual entre painéis atualizados e legados |
| **Quick Hub / Sub-roteamento** | Botões diretos em um fluxo único do Trainer | Atalhos tentam controlar sub-abas de `TrainerView` e `InteractiveDrillsLab` | `handleClearRequestedSpot` limpa só spot/modo, não `requestedSubView`/`requestedInteractiveMode`; `InteractiveDrillsLab` ignora mudanças posteriores da prop `initialTab` | `PokerStudioApp.tsx:127-130,627-644`, `TrainerView.tsx:232,601-622`, `InteractiveDrillsLab.tsx:59-61` | **Alto** — defeito funcional reproduzido ao vivo no browser |
| **Iniciador Windows (`launcher_core.py`)** | Validava exatamente `<title>PDF de Poker</title>` na resposta HTTP | Aceita `<title>TreinerLM</title>` **ou** `<title>PDF de Poker</title>` | Alteração em `launcher_core.py:107` no commit `2412db0`; `launcher.pyw` e `Prepare-GTOTrainer.ps1` inalterados | `git show 2412db0 -- windows/launcher_core.py` | **Baixo** — funcionalmente compatível, visualmente desatualizado no desktop Windows |
| **README & Documentação** | Descreve fluxo até Fase 3 / `PDF de Poker` -> atualizado só `TreinerLM` em `2412db0` | Ainda menciona 10 abas / omite `Treiner Limpo`, cita livros incorretos no RAG (`AiCoachView`) e omite `POKER_LIBRARY_ENABLED=1` completo | Divergência crescente entre `docs/` + `README.md` e código real pós-`7a0d5d8` | `README.md`, `docs/*.md`, `AiCoachView.tsx:288-292` | **Médio** — confunde manutenção e revisores externos |

---

## 7. ERROS E DEFEITOS FUNCIONAIS REPRODUZIDOS

### DEF-01 — Atalhos do "Acesso rápido" (Quick Hub) não navegam entre sub-abas do `Modo Trainer` quando o componente já está montado
- **Módulo:** Navegação global / `Modo Trainer` (`PokerStudioApp`, `TrainerView`, `InteractiveDrillsLab`).
- **Severidade:** **Alta**.
- **Comportamento esperado:** Clicar em `Construtor de ranges` ou `Exercício de matemática` no menu "Acesso rápido" deve levar o usuário à sub-aba solicitada sempre que clicado, mesmo que ele já tenha alternado manualmente para `Mesa de Decisão` ou esteja em outro modo dentro de `Treinos Interativos`.
- **Comportamento observado (reproduzido no navegador a `1920×1080`):**
  1. Acesso rápido → `Construtor de ranges` (abre ok).
  2. Troca manual dentro do `TrainerView` para `Mesa de Decisão`.
  3. Acesso rápido → `Construtor de ranges`: o menu recolhe e **permanece em `Mesa de Decisão`**.
  4. Em `Construtor de ranges` (`InteractiveDrillsLab` montado), Acesso rápido → `Exercício de matemática`: o menu recolhe e **continua preso em `Construtor de Ranges 13×13`**.
- **Arquivos envolvidos:** `app/src/components/PokerStudioApp.tsx` (linhas 127–130, 627–644), `app/src/components/TrainerView.tsx` (linhas 232, 601–622, 1280–1283), `app/src/components/InteractiveDrillsLab.tsx` (linhas 59–61).
- **Causa provável:** `handleClearRequestedSpot` não limpa `requestedSubView`/`requestedInteractiveMode`, impedindo novo disparo do `useEffect` por igualdade de props; e `InteractiveDrillsLab` usa `useState(initialTab ?? ...)` sem `useEffect` de sincronização ou `key={interactiveTab}` no JSX pai.
- **Recomendação de correção:** Utilizar contador/nonce de navegação explícito no pedido de navegação (ou limpar todos os campos em `onClearRequestedSpot`) e sincronizar `activeMode` em `InteractiveDrillsLab` (via `useEffect` ou `key`).

### DEF-02 — `Treiner Limpo` descarta completamente o progresso da sessão ao trocar de aba
- **Módulo:** `Treiner Limpo` (`CleanRangeTrainerView`).
- **Severidade:** **Alta**.
- **Comportamento esperado:** Sequência de acertos e mãos praticadas na sessão devem persistir entre trocas de abas e alimentar estatísticas/diagnóstico (ou, no mínimo, sobreviver à desmontagem).
- **Comportamento observado (reproduzido no navegador a `1920×1080`):** Após acertar 1 mão (`Sequência: 1`, `Memorizadas: 1`, `Acertos: 100%`), navegar para `Modo Trainer` e voltar a `Treiner Limpo` **zera completamente** o contador (`Memorizadas: 0`, `Acertos: —`, `Sequência: 0`).
- **Arquivos envolvidos:** `app/src/components/CleanRangeTrainerView.tsx` (linhas 160–162), `app/src/components/PokerStudioApp.tsx` (linhas 741–743).
- **Causa provável:** `totalCount`, `rightCount` e `streak` vivem apenas em `useState` local dentro de um componente que é desmontado quando `activeTab !== "clean-trainer"`, sem gravar no estado global ou `localStorage`.
- **Recomendação de correção:** Elevar estado/persistência para `PokerStudioApp` (ou `localStorage` dedicado) e registrar decisões em estrutura compatível com `StatsView`.

### DEF-03 — `Treiner Limpo` aplica regra de avaliação legada que pune frequências mistas `< 5%`
- **Módulo:** `Treiner Limpo` (`CleanRangeTrainerView` + `poker.ts`).
- **Severidade:** **Alta (conceitual/funcional)**.
- **Comportamento esperado:** Qualquer ação com frequência positiva na estratégia de referência deveria ser tratada de acordo com a política do treinador (sem marcar mistura rara como erro puro), com sorteio inicial alinhado ao filtro de dificuldade.
- **Comportamento observado:** `CleanRangeTrainerView.tsx` importa `evaluateDecision` (`app/src/lib/poker.ts:155-238`), cuja regra na linha `199` (`if (chosenFreq >= 0.05)`) classifica frequências entre `0.001` e `0.049` como `"error"`. Além disso, a carga inicial (`136-153`) pega sempre `Object.keys(currentSpot.matrix)[0]` (`AA`) com RNG `() => 0` ignorando o nível de dificuldade selecionado (`borderline`). Também passa `stackBb` para `anteLabel` (`linha 689`), exibindo `"Memorização · 14 BB"`.
- **Recomendação de correção:** Migrar avaliação para `drillEvaluator.ts` (`evaluateDrillDecision`), sortear mão inicial respeitando filtro de dificuldade e passar `ante` ou omissão explícita em `anteLabel`.

### DEF-04 — `Explorador de Ranges` inicia com botão `100 BB` selecionado exibindo spot `14BB - RFI UTG`
- **Módulo:** `Explorador de Ranges` (`RangeExplorerView`).
- **Severidade:** **Média**.
- **Comportamento esperado:** O botão de stack ativo e a lista de opções devem corresponder ao spot exibido na matriz e no `<select>`.
- **Comportamento observado (reproduzido nos screenshots `1440×900` `step_43_shot_3` e `390×844` `step_49_shot_3`):** O botão **`100 BB`** aparece iluminado (gradiente vermelho-azul ativo) enquanto o título e a matriz exibem **`14BB - RFI UTG`** e o seletor informa `(36 opções)` referentes a `100 BB`.
- **Arquivos envolvidos:** `app/src/components/RangeExplorerView.tsx` (linhas 33–35, 50, 55–56).
- **Causa provável:** `selectedStack` inicializa em `100` (`stacks.includes(100) ? 100 : stacks[0]`), mas `primarySpotId` inicializa em `spots[0]?.id` (`"14bb_rfi_utg"`), e `spots.find(s => s.id === primarySpotId)` encontra `"14bb_rfi_utg"` fora de `spotsInStack`. Adicionalmente, o `Explorador de Ranges` recebe somente `spots` (229 charts pré-flop), omitindo o spot real verificado `Ah Kd 7c`!
- **Recomendação de correção:** Inicializar `primarySpotId` a partir de `spots.find(s => s.stackBb === initialStack)?.id` (e passar `allSpots` incluindo verificados ou filtro dedicado).

### DEF-05 — `PokerTable` exibe `"fold"` em jogadores que ainda vão agir após o Herói
- **Módulo:** Visualização de mesa (`PokerTable`).
- **Severidade:** **Média**.
- **Comportamento esperado:** Em um spot `UTG RFI`, apenas o Herói está em decisão (ou blinds já postados atrás), e jogadores após UTG (`MP`..`BTN`) ainda **não** desistiram da mão. Em `vs_shove`, o vilão deve respeitar `spot.villainPosition`.
- **Comportamento observado (reproduzido em `step_24.png` / `step_47_shot_1` / `step_49_shot_1`):** Na abertura `14BB - RFI UTG`, todos os 7 oponentes (`MP`, `LJ`, `HJ`, `CO`, `BTN`, `SB`, `BB`) exibem o texto **`fold`**, inclusive à esquerda do Herói (`MP` até `BB`) antes de UTG agir.
- **Arquivos envolvidos:** `app/src/components/PokerTable.tsx` (linhas 206–221, 418, 477).
- **Causa provável:** O cálculo do oponente ativo ignora `spot.villainPosition` diretamente para vários `spotType`s, e a renderização usa `const isActive = isHero || isVillain; {isActive ? stack : "fold"}` para todos os demais assentos sem considerar ordem pré-flop relativa.
- **Recomendação de correção:** Derivar estado de cada assento conforme ordem da mesa, `spot.heroPosition`, `spot.villainPosition` (e histórico pós-flop) em vez de marcar todos os outros assentos como `"fold"`.

### DEF-06 — `computeMixedAdherenceStats` corrompe aderência agregada quando há mais de uma mão/spot na sessão
- **Módulo:** Avaliador GTO (`drillEvaluator.ts` + `TrainerView.tsx`).
- **Severidade:** **Alta (integridade métrica)**.
- **Comportamento esperado:** Comparar frequências observadas apenas dentro de grupos homogêneos `(spotId, handClass)` ou contra a média ponderada dos respectivos alvos.
- **Comportamento observado:** `TrainerView.tsx:726-741` concatena todas as tentativas mistas de diferentes mãos e spots em um único vetor `mixedAttempts`, e `drillEvaluator.ts:381` extrai `const targetDistribution = attempts[attempts.length - 1].targetDistribution`, comparando toda a sessão acumulada contra o alvo da **última** mão mista sorteada.
- **Arquivos envolvidos:** `app/src/lib/poker/drillEvaluator.ts` (linhas 369–410), `app/src/components/TrainerView.tsx` (linhas 726–741).
- **Recomendação de correção:** Agrupar por `(spotId, handClass)` (ou computar divergência média por tentativa / grupo homogêneo) antes de chamar `computeMixedAdherenceStats`.

### DEF-07 — Marcação `"☆ Marcar para revisão"` no `Replayer` não sincroniza com SQLite / `Biblioteca de Mãos`
- **Módulo:** `Replayer` ↔ `Biblioteca de Mãos`.
- **Severidade:** **Média**.
- **Comportamento esperado:** Marcar uma mão aberta da Biblioteca no Replayer deveria refletir em `"Revisão pendente"` na `Biblioteca de Mãos` (e vice-versa).
- **Comportamento observado (reproduzido ao vivo entre `step_32.png` e `step_49_shot_5.png`):** Ao abrir `three_way_allin.json` pela Biblioteca e clicar `"☆ Marcar para revisão"` no Replayer (`★ Marcada para revisão`), ao retornar à `Biblioteca de Mãos`, o card continua exibindo **`Revisão pendente: 0`**.
- **Arquivos envolvidos:** `app/src/components/ReplayerView.tsx` (linhas 89, 105, 161), `app/src/components/HandLibraryView.tsx`.
- **Causa provável:** `ReplayerView` grava apenas em `localStorage` (`poker_replayer_marked_hands_v1`) e nunca invoca a ação `study` (`POST /api/hand-library`) para mãos originadas da Biblioteca.

### DEF-08 — `StatsView` declara `"MAIOR LEAK POR POSIÇÃO: BTN (100%)"` com 0 erros e fixa `spotId` no cadastro manual
- **Módulo:** `Diagnóstico & Leaks` (`StatsView.tsx`).
- **Severidade:** **Média**.
- **Comportamento esperado:** Não apontar uma posição com `100%` de aderência válida como "Maior Leak"; e respeitar a posição/stack/nome ao adicionar mão manualmente na revisão.
- **Comportamento observado (reproduzido em `step_45_shot_3_diagnostico_leaks_1440x900.png`):** Com 1 mão válida jogada no BTN (`Mix válido`, `Aderência Válida: 100%`), o card exibe **`MAIOR LEAK POR POSIÇÃO: BTN (100%)`**. Além disso: `handleAddCustomHand` (`linha 254`) grava `spotId: "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet"` fixo; `HEATMAP_STACKS = [14, 17, 20, 30, 50, 100]` omite `28 BB` (arredondamento de `27.9` do spot TexasSolver), `15 BB` e `3–10 BB`; `trainerSelfReview` é indexado por `spotId::handClass` colidindo entre repetições da mesma mão.
- **Arquivos envolvidos:** `app/src/components/StatsView.tsx` (linhas 254, 382, 552–564 e heatmap).

### DEF-09 — Outros defeitos funcionais verificados no código
- **DEF-09a (`InteractiveDrillsLab.tsx`):** Construtor trunca em `.slice(0, 60)` (escondendo 169+ spots dos ~232 disponíveis); decisões por street truncam em `.slice(0, 15)`; linha `1352` exibe `"Herói: BTN vs "` quando `villainPosition` é `null`; pintura por arraste (`onMouseEnter` nas linhas `122-124`) alterna células já pintadas de volta para `0` e não possui suporte a toque (`touch`).
- **DEF-09b (`CurriculumView.tsx`):** Em `activeStep === "lessons"`, `selectedSpotNumber` padrão (`2`) ao trocar para trilhas cujo primeiro spot é outro (`ex.: 3` ou `9`) deixa os botões sem destaque ativo enquanto exibe `trackLessons[0]`; erro gramatical `"1 aulas"` em `2. C-Bet Flop IP vs BB`.
- **DEF-09c (`AiCoachView.tsx`):** Descrição inicial (`linhas 289-292`) lista livros inexistentes no `knowledge_base.json`.

---

## 8. AUDITORIA MATEMÁTICA E NUMÉRICA

### Verificações analíticas independentes executadas
Todos os testes executados em Node.js `v24.22.0` (`scratch/benchmark_math.mjs` + suíte `npm test`):
1. **Pot Odds, Blefe Puro e MDF (`mathEngine.ts`):**
   - `calculatePotOdds(100, 50, 50)` = **`25%`** (`50 / (100 + 50 + 50)`, exato).
   - `calculateBluffBreakevenFoldEquity(100, 50)` = **`33,33%`** (`50 / (100 + 50)` = `1/3`).
   - `calculateSimplifiedMdf(100, 50)` = **`66,67%`** (`100 / (100 + 50)` = `2/3`), identidade `FE + MDF = 1.000000000000` verificada.
   - **Falha de validação descoberta:** `calculatePotOdds(NaN, 50, 50)` **não lança exceção** e retorna `requiredEquity: NaN`, pois `if (potBeforeBet < 0 ...)` é falso para `NaN`/`Infinity`. O mesmo ocorre em `calculateBluffBreakevenFoldEquity` e `calculateSimplifiedMdf` (em contraste com `labEv.ts`, que valida explicitamente `Number.isFinite` e rejeita `NaN`/`Infinity`).
2. **ICM Malmuth-Harville e Bubble Factor (`mathEngine.ts`):**
   - Teste analítico independente `[5000, 3000, 2000]` com prêmios `[500, 300, 200]`:
     - Cálculo manual exato: `EV(A) = 0,5×500 + (0,3×5/7 + 0,2×5/8)×300 + (1 − 0,5 − 0,3392857)×200 = 383,928571`; `EV(B) = 327,500000`; `EV(C) = 288,571429`; soma = `1000,000000`.
     - Saída comprovada de `calculateIcm`: `[383.928571, 327.5, 288.571429]`, soma `1000.000000`. Conservação e concavidade validadas.
3. **Modelo PKO (`evaluatePkoBountyModel` em `mathEngine.ts:352-382`):**
   - **Achado matemático importante:** Com `potWithoutBountyChips=10000`, `callAmountChips=5000`, `villainBountyUsd=10`, `startingStackChips=10000`, `startingBountyUsd=10`, `heroCoversVillain=true` (usando padrão na UI em `MathIcmLab.tsx:70-89` que **não** expõe input para `bountyChipFactor`), a função calcula:
     - `chipsPerDollar = 10000 / 10 = 1000`
     - `immediateBountyUsd = 10 * 0.5 = $5`
     - `bountyChipEquivalent = 5 * 1000 * (bountyChipFactor ?? 0.5) = 2500 fichas` (reduzindo a equidade necessária de `33,33%` para `28,57%`).
   - O código aplica **dois fatores `0.5` em cascata** (`0.5` na captura imediata em USD + `0.5` de `bountyChipFactor`), resultando em apenas `25%` do starting stack por bounty inicial (abaixo dos `33%–50%` tradicionalmente atribuídos a 1 starting bounty citado inclusive em `reglifeCatalog.ts:1481`, ou dos `5.000` chips caso `$1` do regular pool = `1.000` chips e apenas o `$5` cash fosse convertido sem segundo desconto `0.5`). Embora seja um modelo heurístico explícito, **o segundo `0.5` não fica claro nem configurável no `MathIcmLab`**.
4. **Laboratório Matemático (`labEvaluator.ts`, `labEquity.ts`, `labEv.ts`, `labRanges.ts`):**
   - Enumeração exata de `AsAh vs KsKh` no turn `2c 3d 7h 9s` (`44` runouts): retornou exatamente **`0.954545` (`42/44`)** tanto no benchmark CLI (`7,34 ms`) quanto no browser (`2 ms`).
   - Monte Carlo utiliza RNG determinístico (`createSeededRng` em `mathEngine.ts`), rejeição conjunta de tupla em caso de colisão de cartas (evitando viés sequencial em ranges incompatíveis), variância de Welford sobre frações de pote (`1/k` para empates) e intervalo de confiança conservador de Hoeffding `± sqrt(ln(40)/(2n))` além de registro da aproximação normal. Limites rígidos: 2–6 jogadores, 250.000 outcomes exatos, 1.000.000 amostras MC, 5.000.000 tentativas, 60 s timeout, 2 MiB JSON.
5. **Avaliação do Construtor de Ranges (`dailyDoseCatalog.ts:630,662`):**
   - `userWeightedCombos` e `targetWeightedCombos` ponderam corretamente por combos disponíveis após remoção de blockers (`6/4/12`), porém **`accuracyPct` calcula `1 - totalError / 169` dando o mesmo peso a `AA` (6 combos) e `AKo` (12 combos) ou `AKs` (4 combos)** — distorção leve na nota exibida quando há muitos erros em mãos offsuit vs pares.
6. **Conservação de fichas no Pipeline PHH (`importer.py` + `handHistoryValidation.ts`):**
   - Usa inteiros atômicos base-10 (`string`) com escala fixa de até 6 casas decimais e `MAX_ATOMS = 2^53 - 1`, sem `float`. Validado duplamente por PokerKit `0.7.7` (Python) e `validateCanonicalHand` (TypeScript).

---

## 9. AUDITORIA DE INTEGRIDADE E PROVENIÊNCIA GTO

Confirmação rigorosa das classes de proveniência exigidas:

| Classe / Fonte | Ocorrências reais no sistema | Rastreabilidade & EV | Verificação direta na auditoria |
|---|---|---|---|
| **`VERIFIED`** | **1 spot pós-flop embarcado** (`verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet`) + suporte a importação externa validada (`Desktop Postflop` CSV ou bundle `TexasSolver` v1.1.0 com SHA-256). | **`matrixEv = null`, `evUnit = null`**, `evLoss = null`. CLI TexasSolver `0.2.0` (`console_solver.exe`) exporta apenas frequências; 563 combos pós-remoção do board `Ah Kd 7c`, exploitability final `0.41485%` em 60 iterações (`272,83 s`, 4 threads). | SHA-256 de `app/src/data/verified_ahkd7c_texassolver.json` idêntico ao de `pipeline/solver_runs/.../canonical_bundle.json`: `868ef9fb...b3eda`. `importTexasSolverBundle` (`solverAdapter.ts:1314`) rejeita explicitamente qualquer `matrixEv` injetada. |
| **`IMPORTED_CHART_NO_EV`** | **229 charts pré-flop** (`ranges_gto.json`: `216` do PDF 14/17/20/30/50/100 BB + `13` Spin & Go PNG 3/5/10/15 BB). | `matrixEv = null`, sem pontuação de `EV_loss`. | **Descoberta de integridade de dados:** Entre `38.701` células de `ranges_gto.json`, **`360` células não somam `1.0`** (`23` com desvio `> 0.002`), chegando a **`0.964`** (`17bb_sb_vs_utg_rfi/AA` e `20bb_btn_vs_mp_rfi/KK`). Causa provada em `extract_ranges.py:203,369,384-385`: cores muito raras tiveram resumo arredondado para `0.0%` e foram filtradas fora de `color_map`, subtraindo ~1,2%–3,6% da célula sem renormalizar. |
| **`DIDACTIC_DEMO`** | **3 demonstrações didáticas** (`curriculum.ts` / `solverAdapter.ts`). | Sem EV de solver; bloqueadas no `Modo GTO Técnico`. | Verificado em `pokerCore.test.ts` e `etapas2To5.test.ts`: `gtoScored = false`, `evLoss = null`. |
| **`UNSOLVED`** | **6 spots não resolvidos** (antigos spots sintéticos reclassificados) + payloads incompletos. | Bloqueiam cálculo de acerto e EV; usados apenas como referência conceitual. | Verificado em código e testes (`UNSOLVED` recusa scoring). |
| **`EDUCATIONAL_HEURISTIC`** | **20 cartões `Erros Fatais`** (`fatalErrorsCatalog.json` idêntico byte-a-byte ao do `Dossie/`, SHA-256 `48766a...17e`) + **18 aulas + 7 vídeos RegLife** (`reglifeCatalog.ts`). | `evLossBb = null`, `automaticDiagnosisAllowed = false`. Separação explícita entre aulas com transcrição (`15`) e apenas metadados (`3`: Spots `01`, `07`, `08`). | Confirmado visualmente (`Erros Fatais` + `Currículo`) e em `fatalErrors.test.ts`. |
| **`EXACT_ENUMERATION` / `MONTE_CARLO_ESTIMATE` / `MODEL_BASED_EV`** | Motor `Laboratório Matemático` (`labEquity.ts` / `labEv.ts`), `Lab EV & ICM` e `Treinos Interativos` (Pot Odds, Blockers, Sizings). | Proveniência impressa explicitamente junto às hipóteses (sem rake, sem ações futuras, não substitui Nash). | Verificado no código e na interface (`step_41.png`, `step_45_shot_1`). |

**Verificação crítica:** Nenhuma frequência sintética ou EV fabricado aparece rotulado como solução `VERIFIED`. Além disso, `computeMixedAdherenceStats` (DEF-06) e o gap de `ranges_gto.json` (`0.964`) não violam a separação de proveniência, mas exigem correção matemática/sanitização.

---

## 10. AUDITORIA VISUAL, USABILIDADE E UI/UX

A partir da inspeção direta das capturas de tela em `1920×1080`, `1440×900`, `768×1024` e `390×844`:

### Avaliação estética e comparativa (referência visual GTO Wizard no escopo do projeto)
- **Identidade visual & Tema (`7a0d5d8`):** Fundo profundo `#05070B` / `#090D16` com gradientes azul `#2563EB` e vermelho `#DC2626`, tipografia limpa (`Inter`/system + monoespaçada nas cartas/métricas) e bom contraste geral em textos principais. Entretanto, a transição do tema antigo (`#101112` / `#191B1D` / `#292C2F` em estilo GTO Wizard cinza-grafite/esmeralda) ficou **inacabada**: subpainéis de `StatsView`, `HandLibraryView`, `InteractiveDrillsLab` e `ReplayerView.module.css` (`56,68,69`) ainda usam fundos cinza-chumbo antigos, gerando costura visual visível.
- **Navegação & Topbar (Problema estrutural em todos os viewports):**
  - Mesmo em **`1920×1080`** (`step_24.png`), o wrapper `max-w-[1460px]` força as **11 abas** dentro de uma faixa horizontal única com `overflow-x-auto`: a aba `"Explorador de Ranges"` aparece **cortada na borda direita (`"Explorador de Rang"`)** e as últimas 4 abas (`Lab EV & ICM`, `Laboratório Matemático`, `AI Poker Coach`, `Diagnóstico & Leaks`) ficam ocultas fora da janela até que o usuário role a barra horizontalmente!
  - Em **`390×844` (Mobile)**: Embora **não haja overflow horizontal da página** (`scrollWidth <= innerWidth`, verificado em `Treiner Limpo`, `Modo Trainer`, `Explorador de Ranges`, `Replayer` e `Biblioteca de Mãos`: `382 px` / `390 px`), o `<header>` sticky (`156,27 px`) + faixa anti-RTA somam **~23,8% da altura útil da tela (`844 px`)**. Na prática (`step_49_shot_1_mobile_390_treiner_limpo.png`), sobra pouco espaço para a mesa, e no `Treiner Limpo` móvel os assentos laterais (`Curie LJ` e `Noether SB`) encostam na borda vermelha do feltro enquanto as cartas do Herói (`2 2`) ficam quase coladas no corte inferior antes dos botões.
- **Respostas às perguntas centrais de UX:**
  - *É fácil iniciar um treino?* **Sim em 1 clique** no `Modo Trainer` ou `Treiner Limpo`, desde que esteja na barra superior; porém escolher um spot específico fora do default envolve menus densos.
  - *O usuário precisa navegar por muitos menus?* **Sim**, há 11 abas primárias + sub-abas internas no `Modo Trainer` + 6 sub-modos em `Treinos Interativos` + `Acesso rápido` colapsado (e com defeito DEF-01).
  - *A mesa ocupa espaço suficiente?* Em `1920×1080` e `768×1024` sim; em `1440×900` quando o feedback abre ou sidebar expande há bastante rolagem; em `390×844` o cabeçalho fixo comprime bastante a área útil acima da dobra.
  - *As ações são visualmente claras?* **Parcialmente**: no `Treiner Limpo`, rótulos são claros (`Allin 14`, `Raise`, `Fold`); no `Modo Trainer` pós-flop (`step_4.png`), os botões mostram strings internas brutas como **`BET 33PCT`** e **`BET 75PCT`** em caixa alta em vez de `"Bet 33% pote"` ou `"Aposta 1,9 BB (33%)"`.
  - *As explicações são excessivamente longas?* Foram bem recolhidas em `CollapsiblePanel` / `<details>` no `7a0d5d8`, porém **`Currículo & 18 Aulas`** e **`Erros Fatais`** ainda carregam blocos textuais extensos antes da interação prática.
  - *Existem termos em inglês desnecessários?* Sim, apesar do foco em pt-BR: `"chips"`, `"c-bet"`, `"overfold"`, `"showdown value"`, `"bluff-catcher"`, `"Study Lab V2"`, `"BET 33PCT"`/`"BET 75PCT"`, `"amostra_solida"`/`"amostra_em_formacao"` (identificador snake_case exibido como badge literal na tabela de `StatsView.tsx:159`!), além de badges `IMPORTED_CHART_NO_EV` / `VALIDATED_COMPLETE` visíveis na UI sem tradução amigável complementar.

### Matriz resumida de medições por viewport (verificadas via navegador em `127.0.0.1:3199`)

| Viewport | Abas testadas | Overflow horizontal (`body` vs `innerWidth`) | Observações visuais chave confirmadas em screenshot |
|---|---|---|---|
| **Desktop `1920×1080`** | `Modo Trainer`, `Treiner Limpo`, `Acesso rápido` | 0 px na página (`max-w-[1460px]` interno recorta navbar) | Navbar esconde últimas 4 abas atrás de scroll horizontal; `Treiner Limpo` inicia matriz recolhida; mesa mostra `fold` nos assentos atrás de UTG |
| **Desktop `1440×900`** | Todas as 11 abas (`Biblioteca`, `Replayer`, `Lab Matemático`, `Currículo`, `Erros Fatais`, `Explorador`, `Lab EV/ICM`, `Coach`, `Stats`) | 0 px na página (navbar idem recortada) | `StatsView` exibe `"MAIOR LEAK: BTN (100%)"`; `Explorador` marca `100 BB` mostrando `14BB`; `Coach` cita 3 livros inexistentes no RAG; `Currículo` mostra `"1 aulas"` |
| **Tablet `768×1024`** | `Treiner Limpo`, `Modo Trainer` | 0 px (`760 px` vs `768 px`), `<header> = 157 px` (`y = 45 px`) | Mesa `Treiner Limpo` fica bem proporcionada e legível com botões `Allin 14 / Raise / Fold` inteiros abaixo |
| **Mobile `390×844`** | `Treiner Limpo`, `Modo Trainer`, `Explorador`, `Replayer`, `Biblioteca` | 0 px (`382–390 px` vs `390 px`), `<header> = 156,27 px` (~18,5%; **23,8%** somado ao banner) | Sem estouro lateral; matriz `13×13` apertada (`font ~8-9px`), cabeçalho alto comprime a mesa, assentos laterais tocam a borda no `Treiner Limpo` |

---

## 11. AUDITORIA PEDAGÓGICA E ORGANIZAÇÃO DO CONTEÚDO

- **Escopo real das fontes examinadas:** O livro `Daily Dose of GTO - Book.pdf` **não está presente no repositório**; portanto seu conteúdo integral não foi presumido nem auditado diretamente — auditamos exclusivamente o arquivo `docs/MAPA_DIDATICO_DAILY_DOSE.md` e a implementação em `app/src/lib/poker/dailyDoseCatalog.ts` (`12` microlições `DD01..DD12`). Também auditamos `reglifeCatalog.ts` (`18 aulas + 7 vídeos complementares`), `fatalErrorsCatalog.ts` (`20 cartões`) e `knowledge_base.json` (`322` trechos).
- **Ciclo `VISUALIZAR → DECIDIR → RECEBER FEEDBACK → ENTENDER → REPETIR`:**
  - **Onde funciona melhor:** Nos **`Treinos Interativos & Daily Dose`** (`InteractiveDrillsLab`), onde cada microlição `DD01..DD12` limita o contexto a até 3 frases curtas, apresenta mesa visual estática, pergunta objetiva, feedback imediato e explicação matemática sob demanda (`CONCEITO CURTO` → prática). No **`Modo Trainer` (`DecisionTable`)** e **`Treiner Limpo`**, o fluxo visual → decisão → feedback funciona muito bem em velocidade de repetição, embora no `Treiner Limpo` o "Entender" e "Repetir com memória adaptativa" sejam prejudicados pela ausência de persistência (DEF-02).
  - **Onde há fragmentação pedagógica:**
    1. Os **3 pilares de treino prático** estão espalhados em lugares desconexos: `Treiner Limpo` (aba própria), `Mesa de Decisão` e `Treinos Interativos` (sub-abas de `Modo Trainer`), `Quizzes de Aulas` (`Currículo`), e `Quizzes/Calculadoras` (`Erros Fatais`).
    2. Há **sobreposição temática** entre os quizzes das 18 aulas `RegLife`, os 20 cartões `Erros Fatais` e as 12 microlições `Daily Dose` (por exemplo: Pot Odds vs MDF e Defesa de BB aparecem nos 3 módulos de forma independente, embora `Erros Fatais` mantenha vínculos pontuais para apenas 3 spots práticos: `EF01`, `EF04`, `EF08`).
    3. **Repetição espaçada (Leitner):** Bem fundamentada no código (`adaptiveDiagnostics.ts`, 5 caixas com intervalos crescentes e tie-break cronológico testado), mas **fragmentada**: existe uma instância isolada no `Erros Fatais` (`projeto_poker_fatal_errors_v1`), outra no `Modo Trainer` / `StatsView`, e **nenhuma** no `Treiner Limpo` ou nas `12 Microlições Daily Dose`.
    4. `Daily Dose` usa `tableVisual` em cartões simples sem interação direta de mesa e o `Construtor de Ranges` aplica `slice(0, 60)`, limitando o vínculo entre todas as aulas/stacks e o construtor.

---

## 12. DESEMPENHO, BENCHMARKS E ESCALABILIDADE

**Ambiente de medição:** `Intel(R) Core(TM) i5-9300H @ 2.40GHz` (8 cores lógicos), `7,87 GB` RAM, `Windows 11 (win32 10.0.26300)`, `Node.js v24.22.0`, `Python 3.15.0`.

### Resultados medidos objetivamente
- **Build de produção (`npm run build`):** `70.738 ms` total (`Compiled successfully in 14.9s`).
  - Rota `/` cresceu para **`150 kB` (route size) / `254 kB` First Load JS** (vs **`108 kB / 212 kB`** registrado em `preparation.log` antes dos commits `2412db0` e `7a0d5d8`, um aumento de `+42 kB` em First Load JS pelo empacotamento estático de componentes client-side e `ranges_gto.json`).
  - Rotas de API (`coach`, `hand-library`, `local-health`, `local-session`): `133 B / 104 kB` compartilhados.
- **Engine de Equidade (`labEquity.ts` via Node CLI em `scratch/benchmark_math.mjs` e via browser Worker):**
  - Enumeração exata turn (`AsAh vs KsKh`, board `2c 3d 7h 9s`, `44` runouts): **`7,34 ms`** em CLI Node / **`2 ms`** no Web Worker em Chrome.
  - Monte Carlo (`AA,KK,QQ,AKs,AKo` vs `JJ,TT,99,AQs,AQo`, pré-flop):
    - `1.000` amostras: **`86,3 ms`** (`SE = 0,01493`)
    - `10.000` amostras: **`288,1 ms`** (`SE = 0,00462`)
    - `100.000` amostras: **`2.253,5 ms`** (`SE = 0,00147`)
    - `1.000.000` amostras: **`11.129,5 ms`** (`~11,1 s`, `SE = 0,00046`, dentro do teto de `60.000 ms`).
- **Pipeline SQLite (`benchmark_sqlite.py` em disco temporário descartável):**
  - Importação `.phh` (`hu_fold.phh`): **`100,9 ms`**
  - Importação `.json` canônico (`three_way_allin.json`, aciona subprocesso `node canonicalValidationCli.mjs`): **`189,8 ms`**
  - Listagem (`listing`): **`3,5 ms`** (`2` mãos)
  - Leitura + revalidação PHH: **`5,1 ms`** | Atualização `study`: **`4,1 ms`**.
- **Riscos de escalabilidade:**
  1. `PokerStudioApp.tsx` importa `ranges_gto.json` (`1,1 MB`), `knowledge_base.json` (`273 KB`) e renderiza todo o shell como Client Component, inflando o bundle inicial para `254 kB` e retardando hidratação em hardware modesto se novos bundles forem embarcados estaticamente.
  2. Em `library.py:38-50,194-210`, cada importação ou leitura individual de mão no formato `JSON_UNAUTHENTICATED` spawna um **novo processo Node.js** (`canonicalValidationCli.mjs`), custando ~150–200 ms por mão (gargalo visível em lotes de 20 arquivos JSON ou listagens seguidas de leitura).
  3. Em `StatsView.tsx`, tabelas e filtros são paginados/truncados (`slice(0, 50)`, `slice(0, 9)`), enquanto o `localStorage` cresce sem compressão até limites por tentativa (`100` por cartão em Erros Fatais; sem limite explícito observado para `history` acumulado no `StatsView` além de cortes no cliente).

---

## 13. INTEGRAÇÃO WINDOWS, INICIALIZAÇÃO E SEGURANÇA LOCAL

- **Ciclo Windows (`Preparar GTO Trainer.vbs` / `Prepare-GTOTrainer.ps1` / `Launch-GTOTrainer.vbs` / `launcher.pyw` / `launcher_core.py`):**
  - Verificação estática do atalho (`Verify-GTOShortcut.ps1`): todas as 7 propriedades válidas (`shortcutExists=true`, `wscript.exe`, caminho absoluto para `Launch-GTOTrainer.vbs`, `workingDirectoryMatches=true`, ícone presente), ficando apenas `actualDoubleClickTest = "PENDING_USER_TEST"`.
  - **Pontos fortes de segurança e resiliência:** Vincula `next start` exclusivamente a `127.0.0.1` (`select_port` usa `SO_EXCLUSIVEADDRUSE`), isola processos em **Win32 Job Object** (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), usa `Mutex` por checkout+usuário, grava segredo aleatório efêmero `token`/`instance` em JSON local (nunca entregue ao navegador), valida `PRAGMA quick_check`, `user_version=1`, `application_id=0x50484831` sem **nunca** apagar ou recriar bancos corrompidos/incompatíveis.
  - **Descompasso visual Windows vs Web:** Tanto `launcher.pyw` quanto `Prepare-GTOTrainer.ps1` exibem título **`"♠ GTO Trainer"`** em verde esmeralda (`#0f172a` / `#34d399` / `#6ee7b7`), em desacordo com o branding web **`π TreinerLM`** (azul/vermelho/preto). Além disso, `launcher_core.py:43` exige **Node.js `>= 24.22.0`** exatamente no limite do ambiente atual (`v24.22.0`).
- **Segurança das rotas HTTP e armazenamentos locais:**
  - `/api/hand-library`, `/api/local-health` e `/api/local-session` validam `assertLibraryAccess` (loopback `Host`, `Origin`, `Sec-Fetch-Site`, `X-Poker-Library: local-v1`) e limite físico de stream (`20 MiB` via `limitedBody`, ignorando `Content-Length` falsificado).
  - **Vulnerabilidade de borda em `/api/coach` (`app/src/app/api/coach/route.ts`):** Diferentemente das rotas da Biblioteca, `/api/coach` **não** invoca `assertLibraryAccess`. Embora o iniciador Windows escute apenas em `127.0.0.1`, qualquer página externa aberta no navegador do usuário enquanto o app roda com `GEMINI_API_KEY` configurada no `.env.local` pode disparar `POST http://127.0.0.1:3000/api/coach` via `fetch`/`form` (CSRF cross-origin) consumindo cota da chave local (ou obtendo resposta se CORS padrão/fetch simples não ler, ainda assim gerando consumo e chamadas à API Gemini).
  - **Armazenamento da chave API Gemini (`SettingsModal.tsx`):** Persiste chave pessoal em `localStorage` em texto claro (`projeto_poker_gemini_key_v1`) e envia no body ao backend local — aceitável apenas em uso estritamente local por conveniência, devendo preferir `.env.local` e sempre proteger `/api/coach` contra CSRF cross-origin.

---

## 14. QUALIDADE DE CÓDIGO E COBERTURA DE TESTES

Todos os checks abaixo foram executados sobre o estado inalterado do código (`HEAD 7a0d5d8`):

| Verificação | Comando executado | Resultado real observado | Tempo / Detalhes |
|---|---|---|---|
| **Suíte TypeScript (`app/`)** | `npm test` (`node --test src/lib/__tests__/*.test.ts`) | **130/130 passaram** (`26` suítes, `0` falhas, `0` ignorados/pulados) | `24.331 ms` wall (`22.414 ms` runner) |
| **ESLint (`app/`)** | `npm run lint` | **EXIT 0** (0 erros, 0 avisos bloqueantes) | `41.276 ms` |
| **TypeScript Check (`app/`)** | `npm run typecheck` (`tsc --noEmit`) | **EXIT 0** (0 erros de tipo) | `6.268 ms` |
| **Build de Produção (`app/`)** | `npm run build` (`next build`) | **EXIT 0** (`✓ Compiled successfully in 14.9s`) | `70.738 ms`; `/` = `150 kB` / `254 kB` FLJS |
| **Pipeline Python (`pipeline/hand_history/`)** | `python -m unittest discover -s pipeline/hand_history -t . -p "test_*.py" -v` | **71/71 passaram (`OK`)** | `16.900 s` (`18.965 ms` wall) |
| **Iniciador Windows (`windows/`)** | `python -m unittest discover -s windows -t windows -p "test_*.py" -v` | **8/8 passaram (`OK`)** | `14.820 s` (`15.567 ms` wall) |
| **Verificação estática do atalho** | `powershell -File windows\Verify-GTOShortcut.ps1` | **7/7 checks `true`** (`actualDoubleClickTest: PENDING_USER_TEST`) | Somente leitura |
| **Auditoria dinâmica em Browser** | Servidor `next start` em `127.0.0.1:3199` + `browser` em 4 viewports | **0 erros de JS console/hidratação; 0 HTTP 4xx/5xx** (2 aborts de rota ao trocar abas rapidamente); defeitos DEF-01, DEF-02, DEF-04, DEF-05, DEF-07, DEF-08 reproduzidos | — |

**Lacunas de cobertura identificadas:**
1. Não há testes E2E (Playwright) verificando cliques reais em `Quick Hub`, persistência de `CleanRangeTrainerView` entre trocas de aba, responsividade/altura do cabeçalho ou sincronia `Replayer ↔ Biblioteca`.
2. **`windows/test_launcher.py` falha** se descoberto a partir da raiz sem `-t windows` porque `windows/` não possui `__init__.py` (embora funcione ao apontar `-t windows` ou rodar o arquivo direto).
3. Não existem testes unitários para `/api/coach` nem para validação `NaN` em `mathEngine.ts`.

---

## 15. MATRIZ DE PONTUAÇÃO POR MÓDULO (0 A 5)

### Rubrica explícita usada na avaliação
- **0:** Inexistente / apenas rascunho não funcional.
- **1:** Protótipo visual ou estrutural quebrado/inseguro no uso real.
- **2:** Parcialmente implementado com defeitos funcionais ou conceituais graves.
- **3:** Funcional para o fluxo principal, mas com falhas moderadas de borda, inconsistência visual, regressões ou falta de testes.
- **4:** Sólido, bem testado e consistente, com melhorias pontuais de UX/polimento ou lacunas menores.
- **5:** Referência de arquitetura, correção formal verificada, UX fluida sem atritos e ampla cobertura de testes.

| Módulo | Arquitetura e Código | Correção Matemática / GTO | Qualidade Visual e UX | Robustez e Testes | Média | Diagnóstico sintético |
|---|---|---|---|---|---|---|
| **Iniciador Windows & Infra (`windows/`)** | 4.5 | N/A (5.0 segurança infra) | 3.0 | 4.5 | **4.25** | Job Object, Mutex e preservação SQLite exemplares; branding ainda `"GTO Trainer"` verde |
| **Importador PHH / PokerKit / SQLite** | 4.8 | 4.8 | 4.0 | 4.8 | **4.60** | Melhor engenharia do projeto; átomos exatos e conservação rígida (`71` testes); revalidação JSON spawna Node |
| **Replayer Canônico** | 4.5 | 4.8 | 3.8 | 4.5 | **4.40** | Temporalmente íntegro (sem vazar cartas futuras); revisão isolada em `localStorage` e resto CSS `#191B1D` |
| **Laboratório Matemático (`MathLab`)** | 4.5 | 4.7 | 3.8 | 4.7 | **4.43** | Enumeração exata, MC c/ Hoeffding/Welford e Worker bem isolados; UI densa no mobile |
| **Biblioteca de Mãos (`HandLibrary`)** | 4.5 | 4.5 | 3.7 | 4.5 | **4.30** | Filtros completos, backup seguro, race control; falta sincronizar revisão do Replayer e unificar CSS |
| **Erros Fatais (`FatalErrors`)** | 4.3 | 4.5 | 3.7 | 4.5 | **4.25** | Proveniência anti-leak impecável e Leitner robusto; textos extensos e vínculo com apenas 3 spots práticos |
| **Modo Trainer (`TrainerView`)** | 3.5 | 4.0 | 3.5 | 3.0 | **3.50** | Suporta provedores reais e personalização, mas arquivo gigante (`2.920` linhas), DEF-01 (Quick Hub), DEF-05 (assentos `"fold"`), DEF-06 (mix stats) |
| **Treinos Interativos & Daily Dose** | 3.6 | 4.0 | 3.4 | 3.5 | **3.63** | Boa proposta didática; DEF-01 no sub-roteamento, `.slice(0,60)`, `accuracyPct` não ponderada por combos, erro `"vs null"` |
| **Lab EV & ICM (`MathIcmLab`)** | 3.8 | 3.6 | 3.8 | 3.5 | **3.68** | ICM Malmuth-Harville exato; PKO aplica duplo `0.5` pouco claro sem input na UI; `mathEngine` aceita `NaN` |
| **Currículo & 18 Aulas RegLife** | 4.0 | 4.5 | 3.4 | 3.8 | **3.93** | Separação epistêmica exemplar (`15` transcrições vs `3` metadados); `"1 aulas"`, sync de seleção, muita leitura |
| **Explorador de Ranges** | 3.5 | 4.0 | 3.5 | 2.5 | **3.38** | Exportações e comparação úteis; abre marcando `100 BB` no spot `14BB` (DEF-04) e omite spot solver real `Ah Kd 7c` |
| **Diagnóstico & Leaks (`StatsView`)** | 3.2 | 3.5 | 3.0 | 2.8 | **3.13** | Boa estrutura Leitner + dimensional; `"MAIOR LEAK: BTN (100%)"` (DEF-08), form fixo no TexasSolver spot, CSS residual |
| **Treiner Limpo (`CleanRangeTrainer`)** | 2.8 | 2.5 | 3.8 | 2.2 | **2.83** | Visual limpo elogiável, porém perde progresso ao sair da aba (DEF-02) e usa avaliador legado `<5%` (DEF-03) |
| **AI Poker Coach (`AiCoachView` + API)** | 3.5 | 3.5 | 3.8 | 2.0 | **3.20** | Bom suporte a prints/RAG local; rota `/api/coach` sem `assertLibraryAccess`, zero testes, e UI anuncia 3 livros inexistentes no RAG |

---

## 16. DIAGNÓSTICO DO POTENCIAL ATUAL DO PROJETO

O **`Projeto-Poker` (`TreinerLM`)** já superou a barreira mais difícil e mais raramente bem resolvida em projetos pessoais de poker: **possui engenharia numérica honesta, importação canônica rigorosa e integridade epistêmica auditável**. Ele **não** é apenas um protótipo de tela: possui motores reais em produção local capazes de certificar mãos PHH via PokerKit, simular equity por Monte Carlo com controle estatístico sério e consumir dumps reais de solver pós-flop sem inventar EV.

Entretanto, entre o núcleo matemático/backend (nota ~4,5) e a camada de orquestração/interface (`Treiner Limpo`, `Quick Hub`, `StatsView`, `Explorador de Ranges`, nota ~2,8–3,5) abriu-se uma **lacuna clássica de acoplamento acelerado**: funcionalidades novas foram acrescentadas rapidamente sobre `PokerStudioApp` e `TrainerView` sem refatoração prévia de roteamento/estado e sem testes ponta-a-ponta de navegador. Fechar esses ~10 defeitos pontuais de cola e usabilidade elevaria imediatamente o produto do patamar *"ferramenta técnica promissora com arestas visíveis"* para um **"estúdio pessoal coeso de nível profissional"**.

---

## 17. PONTOS FORTES ATUAIS

1. **Rigor científico e anti-alucinação GTO incomum:** Separação clara de `VERIFIED`, `IMPORTED_CHART_NO_EV`, `DIDACTIC_DEMO`, `UNSOLVED`, `EXACT_ENUMERATION`, `MONTE_CARLO_ESTIMATE`, `MODEL_BASED_EV` e `EDUCATIONAL_HEURISTIC`, respaldada por testes automáticos que proíbem EV sintético.
2. **Qualidade notável da camada PHH / PokerKit / SQLite:** Aritmética inteira em átomos sem floats, conservação estrita de fichas verificada frame a frame, schema versionado `PHH1`, reconstrução auditável sem mutar bytes originais e zero crash mesmo sob entradas malformadas.
3. **Motor matemático real e transparente:** `labEquity.ts` e `labEv.ts` explicitam versões, seeds, limites, variância de Welford, intervalo conservador de Hoeffding e hipóteses exatas dentro de um Web Worker não bloqueante.
4. **Engenharia defensiva do executável Windows:** Job Objects, exclusividade de porta loopback, prevenção contra corrupção de banco, zero dependência de internet para todo o núcleo de estudo.
5. **Reorientação prática recente em evolução correta:** Os novos `Treinos Interativos & Daily Dose`, `CollapsiblePanel`, `Treiner Limpo` e personalização de mesa mostram clara busca por transformar texto excessivo em prática rápida `Visualizar → Decidir → Entender`.

---

## 18. RISCOS TÉCNICOS E DÍVIDAS ACUMULADAS

1. **Monolito de estado UI (`TrainerView.tsx` 2.920 linhas, `InteractiveDrillsLab.tsx` 1.606 linhas, `StatsView.tsx` 1.471 linhas, `PokerStudioApp.tsx` 889 linhas):** Acoplamento de props/effects entre pai e filhos já produz bugs reais (DEF-01, DEF-04, DEF-08).
2. **Dívida de extração dos dados históricos (`ranges_gto.json`):** 360 células com soma diferente de `1.0` (`23` com desvio > 0,002 até `0.964`) persistem no catálogo importado de PDF.
3. **Acoplamento Node↔Python na leitura de JSON da Biblioteca (`library.py:38-50`):** Subprocesso Node por validação gera latência e risco caso `node` não esteja no `PATH` com versão `>= 24.22.0` fora do launcher.
4. **Endurecimento pendente em `/api/coach`:** Falta validação `assertLibraryAccess` nesta rota local quando `GEMINI_API_KEY` estiver configurada no `.env.local`.
5. **Ausência de cobertura automatizada de fluxos React/DOM (Playwright):** Todos os 209 testes (`130` TS + `71` Python + `8` Windows) validam lógica e SSR estático, deixando interações reais de estado em navegador descobertas.
6. **Inconsistência visual e de copy pós-commits `2412db0` e `7a0d5d8`:** Mistura de cores legadas (`#191B1D`/`#292C2F`), navbar com 11 itens transbordando horizontalmente no desktop, cabeçalho alto no mobile, texto desatualizado sobre livros RAG e branding misto `GTO Trainer` vs `TreinerLM`.

---

## 19. RECOMENDAÇÕES ESTRATÉGICAS (SEM EXECUÇÃO NESTA AUDITORIA)

1. **Consolidar o produto antes de adicionar novas abas ou soluções:** Congelar novas features até zerar os defeitos `P0` e `P1` listados no backlog (`Quick Hub`, persistência e avaliador do `Treiner Limpo`, `computeMixedAdherenceStats`, guarda CSRF de `/api/coach`, guarda `NaN` em `mathEngine`, sync de stack do `Explorador` e `StatsView`).
2. **Modularizar `TrainerView` e unificar o núcleo de treino:** Unir `Treiner Limpo` e `Modo Trainer` sob o mesmo motor `drillEvaluator.ts` + persistência unificada (mantendo o modo visual minimalista do `Treiner Limpo` como preset de apresentação, em vez de duplicar avaliador e perder histórico).
3. **Reorganizar a arquitetura de informação de 11 abas:** Agrupar as 11 abas em **5–6 domínios principais** no topo (ex.: `Treinar` [Limpo / Completo / Interativos], `Explorar Ranges`, `Biblioteca & Replayer`, `Estudar` [Currículo / Erros Fatais / AI Coach], `Laboratórios` [Matemático / EV & ICM], `Diagnóstico`) — eliminando recorte da navbar no desktop e reduzindo drasticamente a altura do cabeçalho mobile.
4. **Saneamento único de `ranges_gto.json` e copy factual:** Renormalizar (com auditoria transparente e documentação no script) ou marcar explicitamente desvios residuais de OCR/pixel nas 23 células `!= 1.0`, corrigir a lista real de livros citada no `AiCoachView` e concluir a migração visual/branding (`#191B1D` → `#090D16`, `TreinerLM` no launcher Windows).
5. **Adicionar testes E2E mínimos (Playwright ou Testing Library interativo):** Cobrir ao menos os fluxos que falharam silenciosamente até hoje (Acesso rápido, troca de abas no Treiner Limpo, Range Explorer stack inicial, mobile viewport).

---

## 20. PLANO DE AÇÃO PRIORIZADO (VISÃO EXECUTIVA)

*(Especificação completa com critérios de aceitação, dependências e arquivos em [`AUDITORIA_BACKLOG_PRIORIZADO.md`](AUDITORIA_BACKLOG_PRIORIZADO.md).)*

- **P0 — Crítico / Correções imediatas obrigatórias:**
  1. Proteger `POST /api/coach` com `assertLibraryAccess` (mesma fronteira CSRF/Origin loopback das outras rotas).
  2. Corrigir `computeMixedAdherenceStats` e sua chamada em `TrainerView` para agrupar por `(spotId, handClass)`.
  3. Unificar avaliador do `Treiner Limpo` com `drillEvaluator.ts` e persistir progresso em estado global/`localStorage`.
  4. Corrigir roteamento do `Acesso rápido` (`PokerStudioApp` ↔ `TrainerView` ↔ `InteractiveDrillsLab`).
  5. Adicionar validação `Number.isFinite` em `calculatePotOdds`, `calculateBluffBreakevenFoldEquity` e `calculateSimplifiedMdf`.
- **P1 — Alto / Correções recomendadas essenciais:**
  6. Sincronizar `selectedStack` e `primarySpotId` inicial no `RangeExplorerView` e incluir spots verificados.
  7. Corrigir `"MAIOR LEAK POR POSIÇÃO: BTN (100%)"`, `spotId` hardcoded manual e `trainerSelfReview` em `StatsView`.
  8. Corrigir `PokerTable` para não rotular assentos futuros como `"fold"` antes do turno e respeitar `villainPosition`.
  9. Sincronizar `"Marcar para revisão"` do `ReplayerView` com SQLite (`pending`) quando a mão vier da Biblioteca.
  10. Corrigir cópia factual dos livros no `AiCoachView` e documentar/expor fator PKO (`bountyChipFactor`) no `MathIcmLab`.
- **P2 — Médio / Melhorias de UX, código e testes:**
  11. Reorganizar navegação das 11 abas (acabar com recorte no desktop e compactar cabeçalho mobile).
  12. Remover cores residuais `#191B1D`/`#292C2F`, traduzir rótulos técnicos (`BET 33PCT`, `amostra_solida`) e alinhar branding Windows para `TreinerLM`.
  13. Corrigir bugs menores (`InteractiveDrillsLab` `slice(0,60)`, `vs null`, drag touch, `dailyDoseCatalog` `accuracyPct` ponderada por combos, `CurriculumView` `"1 aulas"`).
  14. Saneamento/documentação das 360 células com soma `!= 1.0` em `ranges_gto.json` e atualização completa de `README.md` + `docs/`.
- **P3 — Baixo / Evolução futura:**
  15. Fatiar componentes gigantes, adicionar suíte E2E browser e expandir banco de soluções pós-flop verificadas (`TexasSolver` / `Desktop Postflop`).

---

## RESUMO PARA REVISÃO PELO CHATGPT

*(Bloco sintético autossuficiente para submissão a um segundo arquiteto revisor externo)*

### Contexto Verificado (`Projeto-Poker` / `TreinerLM`, commit `7a0d5d8bc54328a5f56576724a85728aac7b47d0`)
- **Arquitetura real:** App Next.js `15.5.29` (React 19.1, TypeScript 5.8.3, Tailwind CSS 3.4.17) + pipeline offline Python `3.15.0` (`PokerKit 0.7.7`, SQLite `PHH1`) + iniciador Windows (`launcher.pyw` + Win32 Job Objects em `127.0.0.1:3000..3020`). Repo `main` limpo com 187 arquivos rastreados; nenhum arquivo `.pdf` no checkout; DB pessoal em `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3` intacto (`81.920 B`, `0` mãos).
- **Verificações executadas em 16/11/2026 com 100% de passagem:** `npm test` (`130/130`, `24,3 s`), `npm run lint` (`0` erros, `41,3 s`), `npm run typecheck` (`0` erros, `6,3 s`), `npm run build` (`70,7 s`, rota `/` `150 kB` / `254 kB` FLJS), Python `pipeline/hand_history` (`71/71` em `16,9 s`), Windows `windows/test_launcher.py` (`8/8` em `14,8 s`), mais testes live em Chrome nos viewports `1920×1080`, `1440×900`, `768×1024` e `390×844` (`0` erros JS, `0` falhas HTTP).

### Principais Descobertas para Decisão Arquitetural Externa
1. **Dois commits não documentados (`2412db0`, `7a0d5d8`) mudaram substancialmente o sistema:** rebranding `"TreinerLM"`, tema azul/vermelho/preto, customização de mesa com 8 cientistas, painéis recolhíveis e adição da **11ª aba (`Treiner Limpo`)** — deixando a documentação `docs/` e o iniciador Windows (`"♠ GTO Trainer"` verde) defasados e aumentando o First Load JS de `/` em `+42 kB` (`212 → 254 kB`).
2. **Defeitos funcionais e matemáticos comprovados em código e runtime:**
   - **Segurança `/api/coach`:** Única rota API que não aplica `assertLibraryAccess`, ficando vulnerável a chamadas cross-origin (`CSRF`) para `127.0.0.1` caso `GEMINI_API_KEY` exista no `.env.local`.
   - **`computeMixedAdherenceStats` (`drillEvaluator.ts:381` + `TrainerView.tsx:729`):** Agrega tentativas mistas de mãos/spots diferentes e compara contra o `targetDistribution` apenas da última tentativa.
   - **Acesso Rápido (`PokerStudioApp` → `TrainerView` → `InteractiveDrillsLab`):** Reproduzido ao vivo que cliques para `Construtor de ranges` (após sair dele) ou `Exercício de matemática` (com `InteractiveDrillsLab` já montado) fecham o popover sem trocar de vista.
   - **`Treiner Limpo` (`CleanRangeTrainerView.tsx`):** Usa o avaliador legado `poker.ts:155-238` (pune `< 5%` como erro), perde todo o placar/sequência ao trocar de aba, inicia sempre em `AA` ignorando dificuldade e passa `stackBb` como `anteLabel`.
   - **`RangeExplorerView.tsx:33-56`:** Inicia com pilha `100 BB` selecionada enquanto renderiza `14BB - RFI UTG`.
   - **`StatsView.tsx:254,382,562`:** Declara `"MAIOR LEAK POR POSIÇÃO: BTN (100%)"` quando todas as jogadas foram válidas; formulário manual fixa `spotId` no spot TexasSolver; heatmap ignora stack `28` (`27.9 BB`).
   - **`mathEngine.ts`:** `calculatePotOdds`/`calculateBluffBreakevenFoldEquity`/`calculateSimplifiedMdf` retornam `NaN` sem lançar erro para entrada não finita; `evaluatePkoBountyModel` multiplica duas vezes por `0.5` (`0.25` do starting stack por bounty, sem expor `bountyChipFactor` na UI `MathIcmLab`).
   - **`PokerTable.tsx:418,477`:** Rotula todos os assentos não-Hero/não-Vilão como `"fold"`, até atrás de UTG antes da abertura.
   - **`ReplayerView` ↔ `HandLibraryView`:** `"Marcar para revisão"` no Replayer grava em `localStorage`, ignorando `pending` do SQLite.
   - **`ranges_gto.json`:** `360/38.701` células somam `!= 1.0` (`23` desvios `> 0.002`, até `0.964`) por filtragem de cores raras em `extract_ranges.py:369,384`.
   - **`AiCoachView.tsx:289-292`:** UI informa 3 livros famosos ausentes no índice real `knowledge_base.json` (`322` trechos de outras 8 fontes).
3. **Veredito para o revisor externo:** O núcleo PHH/PokerKit/SQLite, a engine de equidade (`exact` + `MC` c/ Hoeffding) e a governança de proveniência GTO (`matrixEv: null` mantido rigorosamente no único solve `Ah Kd 7c`) formam uma base de alta confiança. As prioridades antes de expandir conteúdo devem ser: **(a)** fechar o gap de segurança em `/api/coach`, **(b)** corrigir os bugs de estado/matemática listados em `P0/P1` unificando `Treiner Limpo` com `drillEvaluator`, **(c)** consolidar a navegação de 11 abas que já transborda até em `1920×1080` e ocupa `23,8%` do mobile `390×844`.
