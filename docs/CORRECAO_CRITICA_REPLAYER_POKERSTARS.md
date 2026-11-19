# TREINERLM — CORREÇÃO CRÍTICA DO REPLAYER POKERSTARS E ANÁLISE PÓS-SESSÃO

**Data:** 2026-11-17  
**Escopo:** Correção definitiva do erro fatal ao abrir mãos importadas no Replayer, auditoria completa das 3.022 mãos reais no SQLite, reconciliação 3.042 → 3.022, fortalecimento contra exceções em runtime e implementação da área compacta de Análise Pós-Sessão MTT-only.

---

## 1. Proteção de Dados e Preservação do Acervo Pessoal

Antes de qualquer modificação em código ou banco de dados, os dados reais do usuário foram localizados e protegidos:

- **Banco SQLite pessoal em uso:** `C:\Users\lmnaz\AppData\Local\Projeto-Poker\hand-library.sqlite3` (`%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`).
- **Backup consistente gerado via `sqlite3.Connection.backup`:**  
  `C:\Users\lmnaz\.gemini\antigravity\brain\d1ca3516-52cc-4715-8218-0962b19f6181\scratch\backups\hand-library-original-backup.sqlite3`
  - Tamanho do backup: `33.370.112` bytes (`PRAGMA integrity_check = ok`).
  - SHA-256 do arquivo de backup: `8159EE67630B1185BF189B973306F89B5E0B2E889A4C4467AE57F581637D0CC9`.
- **Verificação pós-execução do banco pessoal original (somente leitura `?mode=ro`):**
  - Tamanho mantido: `33.370.112` bytes, `mtime = 1794889726.9824302` (`17/11/2026 01:28:46`, anterior ao início desta manutenção).
  - SHA-256 do arquivo vivo: `A3F2A9A0EE1CB43803196EF0FDDE0E24DB6DC7D54F05A5FD6955316354505E3D` (`PRAGMA integrity_check = ok`).
  - Paridade exata linha a linha com o backup confirmada em todas as tabelas:
    - `library_index`: `3.022` registros (`equal=True`)
    - `library_pokerstars`: `3.022` registros (`equal=True`)
    - `library_players`: `21.091` registros (`equal=True`)
    - `hands`: `0` registros (`equal=True`)
  - Todos os testes E2E em navegador (incluindo inserção de uma mão sintética corrompida `#999999999999`) rodaram exclusivamente sobre cópia descartável (`scratch/replayer_e2e_copy.sqlite3`).
- **Ativos estratégicos preservados sem alteração:**
  - `app/src/data/ranges_gto.json`: `SHA-256 = D46652C5BFE3CED09073FA68544E134683499F18EABDABEF8202D9EE351CB60E`
  - `app/src/data/verified_ahkd7c_texassolver.json`: `SHA-256 = 868EF9FB8E6371F12DDE7749170015AF4FACCA70AF92DC33AA45251CDD0B3EDA`

---

## 2. Reprodução do Erro Crítico e Diagnóstico das Causas Raiz

O incidente reportado (`Application error: a client-side exception has occurred while loading 127.0.0.1` ao clicar em **"Abrir no Replayer"**) foi reproduzido diretamente no ambiente ativo (`http://127.0.0.1:3000`, evidência original em [`01_repro_live_3000.png`](screenshots/replayer-fix-2026/01_repro_live_3000.png)) e decomposto em duas causas raiz combinadas:

1. **Causa raiz #1 — Carregamento lazy (`React.lazy`) com chunk desatualizado/HTTP 400 sem `ErrorBoundary`:**
   - O processo servidor `PID 3904` (iniciado às `01:25:52`) servia HTML referenciando `/_next/static/chunks/app/page-6bfae21ed0d629ce.js`, cujo endpoint retornava **HTTP `400 BadRequest`** (`reactKeys: []`) depois que `app/.next` havia sido alterado em disco posteriormente (`BUILD_ID` reescrito às `01:37:57` e artefatos `vendor-chunks` de `next dev` às `01:51–01:52`, deixando `.next` sem `BUILD_ID`).
   - Em `app/src/components/PokerStudioApp.tsx`, `HandLibraryView` e `ReplayerView` eram carregados dinamicamente via `React.lazy(...)` dentro de `<Suspense>` sem nenhum `ErrorBoundary` e sem `app/src/app/error.tsx`. Qualquer falha de importação dinâmica (`ChunkLoadError`) ou exceção ao clicar em **"Abrir no Replayer"** derrubava a aplicação inteira no navegador, destruindo a barra de navegação e o retorno à Biblioteca.
2. **Causa raiz #2 — Vetores de exceção não capturada na renderização do Replayer e da Biblioteca:**
   - `ReplayerView` e helpers em `handReplay.ts` invocavam diretamente `buildReplayFrame(...)`, `parseCard(...)`, `formatAtoms(...)` e `BigInt(...)` dentro do fluxo de renderização sem captura segura nem validação prévia de invariantes (`events` vazios, índices nulos ou arrays divergentes).
   - Na tabela `library_index.summary_json`, valores de `bigBlind` serializados pelo Python com `Decimal.normalize()` podiam aparecer em notação científica (`"3E+1"`, `"8E+1"`), o que causa `SyntaxError` em `BigInt("3E+1")` caso seja passado direto para formatadores baseados em inteiros sem sinais.

---

## 3. Auditoria de Reprodutibilidade das 3.022 Mãos Importadas

- **Validação exaustiva de frames (`check_all_3022_replay.mjs`):** todas as **3.022 mãos reais** armazenadas no SQLite (somando **115.372 frames** individuais) passaram em `validateCanonicalHand` + `buildReplayFrame` nas perspectivas `public`, `recorded` e `player: 0`, com **0 falhas** (`failuresCount = 0`).
- **Leitura via ponte `library.read` em amostra estratificada (45 mãos de 2 a 9 jogadores + formato `UNKNOWN`):** **0 erros**.

---

## 4. Reconciliação Transparente: 3.042 Mãos no ZIP vs. 3.022 no SQLite

A diferença entre as **3.042 mãos** presentes nos 97 arquivos `.txt` do arquivo ZIP e as **3.022 mãos** persistidas no banco local decorre estritamente de recusas explícitas (`UNSUPPORTED`), sem descarte silencioso nem reparo artificial:

| Etapa / Motivo | Quantidade |
|---|---:|
| Mãos identificadas no ZIP original | 3.042 |
| Duplicatas ignoradas | 0 |
| Recusadas: `SHORT_ALLIN_REOPEN_UNSUPPORTED` | 6 |
| Recusadas: `RAISE_OVER_EFFECTIVE_ALLIN` | 5 |
| Recusadas: `SITOUT_ALLIN_FOLD` | 5 |
| Recusadas: `IMPLICIT_BB_CHECK_MISSING` | 3 |
| Recusadas: `AWARD_CONSERVATION_DIVERGENCE` | 1 |
| **Total recusado (`UNSUPPORTED`)** | **20** |
| **Mãos validadas e gravadas (`VALIDATED_COMPLETE`)** | **3.022** |

Composição das 3.022 mãos gravadas no SQLite:
- **Por modalidade:** `MTT` comprovado = `2.681`; `NULL / UNKNOWN` = `341`.
- **Por número de jogadores:** 2 (`134`), 3 (`218`), 4 (`14`), 5 (`70`), 6 (`155`), 7 (`656`), 8 (`1.734`), 9 (`41`).

---

## 5. Isolamento de Falhas, ErrorBoundary e Recuperação

- Criado [`ComponentErrorBoundary.tsx`](../app/src/components/ComponentErrorBoundary.tsx) para isolar falhas de renderização e `ChunkLoadError` nos módulos críticos (`HandLibraryView` e `ReplayerView`) em `PokerStudioApp.tsx`.
- Criado [`error.tsx`](../app/src/app/error.tsx) como limite global de erro do Next.js App Router totalmente em português brasileiro.
- Substituídos `React.lazy(() => import("./HandLibraryView"))` e `React.lazy(() => import("./ReplayerView"))` em [`PokerStudioApp.tsx`](../app/src/components/PokerStudioApp.tsx) por importação estática, eliminando quebras de chunk tardio ao alternar abas ou clicar em **"Abrir no Replayer"**.
- Em erro de carregamento ou renderização, o usuário visualiza o título exato `"Não foi possível reproduzir esta mão. Alguns dados do histórico estão incompletos."`, o detalhe técnico e ações de recuperação diretas (**`Voltar à Biblioteca`** e **`Carregar exemplo válido`**), sem perder o restante do aplicativo.

---

## 6. Endurecimento de Runtime (`handReplay.ts`, `ReplayerView.tsx`, `HandLibraryView.tsx`)

Em [`handReplay.ts`](../app/src/lib/poker/handReplay.ts):
- Exportada a constante `UNREPLAYABLE_HAND_MESSAGE`.
- Adicionadas as funções seguras `safeParseCard`, `safeBigInt`, `safeFormatAtoms`, `assessHandReplayability` e `buildReplayFrameSafe`.
- Endurecida `replayPlayerName` para lidar com índices ausentes ou fora de faixa (`Jogador N+1`).

Em [`ReplayerView.tsx`](../app/src/components/ReplayerView.tsx) e [`HandLibraryView.tsx`](../app/src/components/HandLibraryView.tsx):
- Substituídas chamadas diretas a `BigInt`/`formatAtoms`/`parseCard` por versões seguras (`safeFormatAtoms` em blinds/stacks, evitando quebra por strings inválidas ou notação científica).
- Adicionados os botões **`Voltar à Biblioteca`** (topo e painel de erro) e **`Reiniciar mão`** na barra de transporte.
- Adicionado aviso explícito para históricos parciais (`VALIDATED_PARTIAL` / `!frame.completed`) para jamais simular conclusão inexistente.

---

## 7. Arquitetura Visual em Duas Áreas (Reprodução + Análise Pós-Sessão)

O Replayer passa a separar claramente:
1. **Área 1 — Reprodução (`aria-label="Área de reprodução da mão"`):** mesa gráfica com feltro, assentos proporcionais de 2 a 9 jogadores, cartas ocultas ou reveladas conforme perspectiva (`Visão pública`, `Jogador: ...`, `Visão completa pós-sessão`), board progressivo por street, pote total/side pots, controles de navegação (`Voltar ao início`, `Evento anterior`, `Reproduzir`/`Pausar`, `Próximo evento`, `Ir ao final`, `Reiniciar mão`, seletor de velocidade) e linha do tempo cronológica em `Sequência da mão`.
2. **Área 2 — Análise Pós-Sessão da Decisão (`CollapsiblePanel` recolhido por padrão):** preserva o protagonismo visual da mesa e expande sob demanda três blocos objetivos:
   - **1. Aposta, Stack & Pot Odds**
   - **2. Ranges MTT & Avaliação**
   - **3. TheNerdEinsten (Pós-Sessão)**

---

## 8. Análise Matemática Determinística (`postSessionAnalysis.ts`)

Implementada em [`analyzeDecisionSizing`](../app/src/lib/poker/postSessionAnalysis.ts#L196) usando aritmética exata `BigInt` convertida para BBs via `bigBlindAtoms`:
- **Aposta (`bet`):** `% do pote = paidAtoms / potBeforeAtoms` (base: *"Pote antes da aposta"*).
- **Aumento (`raise`):** `% do pote = additionalWagerOverCallAtoms / (potBeforeAtoms + toCallAtoms)` (base: *"Pote após igualar (pote + valor a pagar)"*), distinguindo explicitamente o incremento pago nesta ação (`paidBb`) do alvo total apostado na street (`totalStreetBetBb`).
- **Call:** `minEquityForCallPct = toCallAtoms / (potBeforeAtoms + toCallAtoms)` e razão `potOddsRatio`.
- **Stack efetivo e SPR:** calculados sobre os jogadores ainda ativos na mão (`!folded`), com nota explícita quando houver `all-in` ou múltiplos potes indicando que o stack efetivo e as pot odds valem até o teto igualável.

---

## 9. Correspondência Estrita de Ranges Exclusivamente MTT

Implementada em [`analyzeMttReferenceAndFindings`](../app/src/lib/poker/postSessionAnalysis.ts#L455):
- Consome apenas `canonicalSpots` filtrados por `filterConfirmedMttCanonicalSpots` + solução pós-flop verificada (`verified_ahkd7c_texassolver.json`).
- **Regra anti-contaminação:** históricos marcados como Spin & Go (`SNG`), Cash Game (`CASH`) ou formato desconhecido (`MISSING`/`UNKNOWN`) são bloqueados imediatamente de comparação com ranges MTT; tampouco se força matriz 8-max sobre mesas de 3–7 ou 9 jogadores.
- **Pré-flop 8-max (`IMPORTED_CHART_NO_EV`):** compara apenas `RFI` e `vs_rfi` limpos (sem limps/3-bets anteriores) dentro de ±20% de stack efetivo, mantendo obrigatoriamente `evLossValue = null` e exibindo limitação explícita de que os charts pré-flop importados não contêm valores de EV.
- **Pós-flop verificado (`VERIFIED_GTO_SOLUTION`):** aplica-se somente quando há correspondência estrita de formato `MTT`, street pós-flop, `heads-up SRP`, posições (herói e vilão), board completo idêntico e stack efetivo compatível.
- **Sem correspondência estrita:** exibe exatamente a mensagem `"Não há solução GTO compatível com esta situação."`.

---

## 10. Classificação Honesta de Achados e Limitações

Toda decisão recebe uma categoria fechada sem confundir heurística com GTO de solver:
- `VERIFIED_OPTIMAL` / `VERIFIED_DEVIATION` (exclusivo quando existe solver `VERIFIED`)
- `STRATEGY_DEVIATION` / `CONCEPTUAL_REVIEW` (desvio de frequência de chart importado sem EV ou revisão matemática determinística)
- `INCONCLUSIVE` (quando o spot está fora de cobertura de solver/chart ou em evento operacional/automático)
- `STRUCTURAL_ERROR` (mão recusada na validação estrita)

---

## 11. Integração Manual e Sanitizada com o TheNerdEinsten

- [`buildSafeAiQuestionPayload`](../app/src/lib/poker/postSessionAnalysis.ts) gera um rascunho em português brasileiro removendo nicks reais (substituídos por identificadores funcionais por assento/posição, como `Jogador p6 (CO)`), ID da mão, ID do torneio, nome do arquivo e `recordId`/`sha256`.
- O usuário pode inspecionar o texto completo em **`Pré-visualizar resumo sanitizado`** e clicar em **`Enviar rascunho ao TheNerdEinsten`**.
- [`AiCoachView.tsx`](../app/src/components/AiCoachView.tsx) recebe `initialDraftPrompt` e apenas preenche o campo `<textarea>` para revisão e clique manual em **Enviar**, sem nunca disparar chamadas automáticas à API de IA.

---

## 12. Inventário de Arquivos da Entrega e Estado Git

Principais arquivos criados/modificados nesta entrega:
- Criados:
  - [`app/src/components/ComponentErrorBoundary.tsx`](../app/src/components/ComponentErrorBoundary.tsx)
  - [`app/src/app/error.tsx`](../app/src/app/error.tsx)
  - [`app/src/lib/poker/postSessionAnalysis.ts`](../app/src/lib/poker/postSessionAnalysis.ts)
  - [`app/src/lib/__tests__/replayerCriticalAndAnalysis.test.ts`](../app/src/lib/__tests__/replayerCriticalAndAnalysis.test.ts)
- Alterados nesta etapa:
  - [`app/next.config.ts`](../app/next.config.ts) (suporte opcional a `NEXT_DIST_DIR` para builds de teste isolados)
  - [`app/src/lib/poker/handReplay.ts`](../app/src/lib/poker/handReplay.ts)
  - [`app/src/components/ReplayerView.tsx`](../app/src/components/ReplayerView.tsx)
  - [`app/src/components/HandLibraryView.tsx`](../app/src/components/HandLibraryView.tsx)
  - [`app/src/components/PokerStudioApp.tsx`](../app/src/components/PokerStudioApp.tsx)
  - [`app/src/components/AiCoachView.tsx`](../app/src/components/AiCoachView.tsx)

O repositório também mantém alterações anteriores da etapa do importador/auth/TheNerdEinsten ainda não commitadas no worktree (`git status -s`), respeitando integralmente a instrução de não realizar commits automáticos.

---

## 13. Verificações Automatizadas Pós-Edição

Todas as checagens finais abaixo foram executadas após a última edição de código e configuração:

| Verificação | Comando executado | Resultado observado |
|---|---|---|
| TypeScript (`tsc`) | `cd app && npm run typecheck` | Código `0` (0 erros) |
| ESLint (`eslint .`) | `cd app && npm run lint` | Código `0` (0 erros; apenas 1 warning pré-existente em `TrainerView.tsx:28`) |
| Suíte focada Replayer/Biblioteca/PS | `node --test src/lib/__tests__/replayerCriticalAndAnalysis.test.ts src/lib/__tests__/pokerstarsImport.test.ts src/lib/__tests__/handReplay.test.ts src/lib/__tests__/handLibrary.test.ts src/lib/__tests__/handHistory.test.ts` | **45/45 testes aprovados** (8 suítes, 0 falhas) |
| Suíte TypeScript completa | `cd app && npm test` | **219/219 testes aprovados** (42 suítes, 0 falhas, 0 ignorados) |
| Suíte Python pipeline | `.\pipeline\hand_history\.venv\Scripts\python.exe -m unittest discover -s pipeline\hand_history -t . -p "test_*.py" -v` | **78/78 testes aprovados** (`OK` em 50,43s) |
| Build de produção final (`app/.next`) | `cd app && npm run build` | Código `0` (`app/.next` reconstruído com `BUILD_ID` íntegro; 0 erros; 3 warnings pré-existentes de ESLint em `TrainerView.tsx` e `theNerdEinsten.test.ts`) |

---

## 14. Verificação Real em Navegador (Edge CDP · Multi-Viewport)

Executada com servidor Next.js em produção isolado (`NEXT_DIST_DIR=.next-e2e` na porta livre `61985`, posteriormente limpo e substituído pelo build final em `app/.next`) conectado à cópia descartável das **3.022 mãos reais**, com `--disable-extensions`:

- **Fluxo Biblioteca → "Abrir no Replayer":** testado com sucesso na mão exata reportada (`#262736640300`, 7-max) e consecutivamente em amostras reais de **3** (`#262717758431`), **6** (`#262736339072`), **7** (`#262736323898`), **8** (`#262736302112`) e **9** (`#262705137949`) jogadores.
- **Painel de Análise & Assistente de IA:** expansão de **Análise Pós-Sessão da Decisão** (`analysisVerified = true`), conferência de pot odds/sizing e abertura de rascunho sanitizado no TheNerdEinsten sem envio automático e sem vazamento de nicks, ID da mão, torneio ou `ps-sha256` (`aiSanitizationVerified = true`).
- **Isolamento de mão corrompida:** abertura da mão sintética `#999999999999` exibiu alerta gracioso (`Histórico recusado no Replayer`) com retorno pela própria UI (`Voltar à Biblioteca`) e abertura imediata da mão válida seguinte sem recarregar a página (`corruptIsolationVerified = true`).
- **Telemetria limpa:** `consoleErrors = []`, `pageErrors = []`, `unexpectedHttpFailures = []` (apenas o retorno HTTP `400` esperado da mão sintética `#999999999999`).
- **Responsividade (sem overflow horizontal):**
  - `1440×900` (`desktop`): `hasOverflow = false`
  - `1920×1080` (`wide`): `innerWidth = 1920`, `scrollWidth = 1912`, `hasOverflow = false`
  - `768×1024` (`tablet`): `innerWidth = 768`, `scrollWidth = 760`, `hasOverflow = false`
  - `390×844` (`mobile`): `innerWidth = 390`, `scrollWidth = 390`, `hasOverflow = false`
- **Evidências visuais inspecionadas em `docs/screenshots/replayer-fix-2026/`:**
  - `01_repro_live_3000.png` (reprodução da falha original em `127.0.0.1:3000`)
  - `02_replayer_262736640300_1440.png` (mão `#262736640300` aberta sem crash)
  - `03_replayer_analysis_expanded_1440.png` (mesa + painel de Análise Pós-Sessão expandido)
  - `04_ai_draft_sanitized_1440.png` (rascunho sanitizado no TheNerdEinsten sem autoenvio)
  - `05_replayer_9max_1440.png` (mesa 9-max em showdown com múltiplos potes)
  - `06_corrupt_hand_graceful_1440.png` (aviso não fatal de erro com retorno à Biblioteca)
  - `07_replayer_1920.png`, `08_replayer_tablet_768.png`, `09_replayer_mobile_390.png` (validação visual multi-viewport)

---

## 15. Estado Residual e Orientação Operacional

- O processo antigo do servidor local que já respondia em `http://127.0.0.1:3000` (`PID 3904`) foi preservado intacto durante toda a manutenção para não interromper o ambiente do usuário; após os testes, `app/.next` foi recompilado do zero com `BUILD_ID` e chunks sincronizados.
- Caso ainda exista uma aba aberta servida pelo processo antigo `PID 3904`, basta reiniciar o inicializador/servidor do TreinerLM uma única vez para carregar o build corrigido em `127.0.0.1:3000`.
