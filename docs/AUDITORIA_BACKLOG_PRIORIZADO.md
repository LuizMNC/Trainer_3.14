# BACKLOG TÉCNICO PRIORIZADO — `Projeto-Poker` (`TreinerLM`)

**Data:** 16/11/2026  
**Base:** Diagnóstico comprovado na auditoria [`AUDITORIA_GERAL_ESTADO_ATUAL_2026.md`](AUDITORIA_GERAL_ESTADO_ATUAL_2026.md).  
**Escopo desta entrega:** Apenas planejamento e priorização. **Nenhuma implementação foi executada.**

---

## Sumário de Classificação por Natureza

| Categoria | Faixas | Objetivo |
|---|---|---|
| **Correções Obrigatórias** | `P0` e `P1` | Eliminar vulnerabilidade local de API, corrigir matemática/métricas corrompidas, restaurar fluxos de UI quebrados e alinhar dados/proveniência |
| **Melhorias Recomendadas** | `P2` | Reduzir fricção de navegação/mobile, concluir migração visual do tema, limpar dívida de OCR em `ranges_gto.json` e atualizar documentação |
| **Recursos Opcionais / Ideias Futuras** | `P2 (final)` e `P3` | Fatiamento modular de componentes grandes, automação E2E em navegador, novos solves pós-flop auditados e expansão didática |

---

## PRIORIDADE P0 — CORREÇÕES CRÍTICAS OBRIGATÓRIAS

### [P0-01] Proteger `POST /api/coach` com `assertLibraryAccess` e limite físico de payload *(Correção Obrigatória — Segurança)*
- **Descrição do problema:** Ao contrário de `/api/hand-library`, `/api/local-health` e `/api/local-session`, a rota `app/src/app/api/coach/route.ts` não chama `assertLibraryAccess`, aceitando requisições cross-origin para `127.0.0.1` caso o usuário tenha configurado `GEMINI_API_KEY` em `.env.local`.
- **Impacto:** Qualquer página externa aberta no navegador enquanto o app local estiver ativo pode disparar chamadas POST ao endpoint `/api/coach`, consumindo cota/créditos da API Gemini do usuário.
- **Evidência:** Ausência de `assertLibraryAccess` e `limitedBody` em `app/src/app/api/coach/route.ts` vs implementação padrão em `app/src/app/api/hand-library/route.ts` e `app/src/lib/server/libraryAccess.ts`.
- **Solução proposta:** Aplicar verificação de `Host` loopback, `Origin` igual ao host e header customizado (ex.: `X-Poker-Library` ou similar enviado por `AiCoachView`), além de limite de bytes na leitura do corpo JSON/imagem.
- **Arquivos/módulos impactados:** `app/src/app/api/coach/route.ts`, `app/src/lib/server/libraryAccess.ts`, `app/src/components/AiCoachView.tsx`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo; requer atualizar o cliente `AiCoachView` na mesma mudança e adicionar teste unitário equivalente ao `handLibrary.test.ts`.
- **Critérios de aceitação:** `POST /api/coach` com `Origin: http://evil.test` ou `Sec-Fetch-Site: cross-site` retorna HTTP `403`; chamadas legítimas do frontend continuam retornando `200`; teste automatizado cobrindo bloqueio e permissão passa em `npm test`.

### [P0-02] Corrigir cálculo agregado de `computeMixedAdherenceStats` *(Correção Obrigatória — Matemática GTO)*
- **Descrição do problema:** `TrainerView.tsx:726-741` acumula tentativas mistas de mãos e spots heterogêneos em um único array `mixedAttempts`, e `computeMixedAdherenceStats` (`app/src/lib/poker/drillEvaluator.ts:381`) compara toda a distribuição observada agregada contra `attempts[attempts.length - 1].targetDistribution` (somente o alvo da última mão).
- **Impacto:** A métrica **"Aderência ao Mix"** exibida na sidebar do `Modo Trainer` torna-se matematicamente inválida assim que duas mãos mistas diferentes são jogadas na mesma sessão.
- **Evidência:** `app/src/lib/poker/drillEvaluator.ts:369-410` e `app/src/components/TrainerView.tsx:726-741`.
- **Solução proposta:** Agrupar as tentativas por chave `(spotId, handClass)` antes de computar desvios L1/aderência (retornando média ponderada por grupo ou resumo do grupo da mão/spot ativo), preservando compatibilidade com testes unitários existentes.
- **Arquivos/módulos impactados:** `app/src/lib/poker/drillEvaluator.ts`, `app/src/components/TrainerView.tsx`, `app/src/lib/__tests__/pokerCore.test.ts` / `fase1Homologacao.test.ts`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo; função pura facilmente coberta por testes unitários com 2+ mãos/spots distintos.
- **Critérios de aceitação:** Teste novo com tentativas mistas de duas mãos diferentes (ex.: `AA` 80/20 e `AKs` 50/50) produz aderência esperada de 100% quando cada mão segue seu próprio alvo, sem depender da ordem no array.

### [P0-03] Migrar `Treiner Limpo` para `drillEvaluator.ts` e persistir progresso da sessão *(Correção Obrigatória — Integridade Funcional)*
- **Descrição do problema:** `CleanRangeTrainerView.tsx` usa o avaliador legado `evaluateDecision` (`app/src/lib/poker.ts:155-238`), que reprova qualquer ação mista com frequência `< 5%`, ignora filtro de dificuldade no deal inicial (`Object.keys(matrix)[0]` = `AA`), exibe `stackBb` dentro de `anteLabel` (`linha 689`) e perde todo o contador/sequência ao trocar de aba.
- **Impacto:** O usuário perde todo progresso ao navegar entre abas (reproduzido ao vivo) e recebe veredito de erro incoerente em frequências mistas válidas de 1%–4,9%.
- **Evidência:** `app/src/components/CleanRangeTrainerView.tsx:136-162, 689`, `app/src/lib/poker.ts:155-238`, `step_24.png`.
- **Solução proposta:** Substituir `evaluateDecision` por `evaluateDrillDecision` (`drillEvaluator.ts` respeitando proveniência `IMPORTED_CHART_NO_EV`), sortear carta inicial respeitando o filtro selecionado, corrigir prop `anteLabel` e persistir contadores/histórico em `localStorage` ou no histórico unificado de `PokerStudioApp`.
- **Arquivos/módulos impactados:** `app/src/components/CleanRangeTrainerView.tsx`, `app/src/components/PokerStudioApp.tsx`, `app/src/lib/poker.ts`, `app/src/lib/__tests__/cleanRangeTrainer.test.ts`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Médio (toca estado do módulo mais novo; mitigável mantendo `CleanRangeTrainerView` isolado até validação completa).
- **Critérios de aceitação:** Trocar para outra aba e retornar ao `Treiner Limpo` mantém `Memorizadas`, `Acertos` e `Sequência`; ações positivas `< 5%` são classificadas como frequência mista baixa e nunca como erro puro; remoção ou marcação explícita de desuso em `evaluateDecision`.

### [P0-04] Consertar roteamento de sub-abas pelo "Acesso rápido" (Quick Hub) *(Correção Obrigatória — Navegação)*
- **Descrição do problema:** `PokerStudioApp.tsx` não limpa `requestedSubView`, `requestedInteractiveMode` nem `requestedPresetFilter` em `handleClearRequestedSpot`, e `InteractiveDrillsLab.tsx:59-61` lê `initialTab` apenas no `useState` inicial (sem `useEffect` nem `key`).
- **Impacto:** Reproduzido ao vivo em `1920×1080`: atalhos do menu "Acesso rápido" falham silenciosamente após o usuário visitar e sair de `Construtor de ranges` ou ao alternar entre modos internos com `InteractiveDrillsLab` já montado.
- **Evidência:** `PokerStudioApp.tsx:127-130, 627-644`, `TrainerView.tsx:232, 601-622, 1280-1283`, `InteractiveDrillsLab.tsx:59-61`.
- **Solução proposta:** Encapsular o pedido de navegação com um `requestNonce` numérico incremental (`{ id, subView, interactiveMode, preset, nonce }`), consumir via `useEffect` em `TrainerView` e sincronizar `activeMode` em `InteractiveDrillsLab` (ou aplicar `key` / callback controlado).
- **Arquivos/módulos impactados:** `app/src/components/PokerStudioApp.tsx`, `app/src/components/TrainerView.tsx`, `app/src/components/InteractiveDrillsLab.tsx`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo.
- **Critérios de aceitação:** Sequências `Acesso rápido -> Construtor -> Mesa de Decisão -> Acesso rápido -> Construtor` e `Construtor -> Acesso rápido -> Exercício de matemática` navegam em 100% dos cliques.

### [P0-05] Validar `Number.isFinite` em fórmulas base de `mathEngine.ts` *(Correção Obrigatória — Robustez Numérica)*
- **Descrição do problema:** `calculatePotOdds`, `calculateBluffBreakevenFoldEquity` e `calculateSimplifiedMdf` verificam `< 0` ou `<= 0`, deixando `NaN` e `Infinity` passarem sem erro.
- **Impacto:** Chamadas diretas à API matemática (como `calculatePotOdds(NaN, 50, 50)`) propagam `NaN` silenciosamente sem lançar erro, divergindo do contrato de `labEv.ts`.
- **Evidência:** Executado em `scratch/benchmark_math.mjs`: `calculatePotOdds(NaN, 50, 50)` retornou `{ requiredEquity: NaN }`.
- **Solução proposta:** Exigir `[...].every(Number.isFinite)` no início dessas funções em `app/src/lib/poker/mathEngine.ts`.
- **Arquivos/módulos impactados:** `app/src/lib/poker/mathEngine.ts`, `app/src/lib/__tests__/pokerCore.test.ts`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo.
- **Critérios de aceitação:** Passar `NaN` ou `Infinity` a `calculatePotOdds`, `calculateBluffBreakevenFoldEquity` ou `calculateSimplifiedMdf` lança `Error`; todos os testes existentes permanecem aprovados.

---

## PRIORIDADE P1 — CORREÇÕES IMPORTANTES RECOMENDADAS

### [P1-01] Sincronizar stack inicial (`100 BB` vs `14BB`) e incluir spots verificados no `Explorador de Ranges` *(Correção Obrigatória)*
- **Descrição do problema:** `RangeExplorerView.tsx:33-56` define `selectedStack = 100` enquanto `primarySpotId` nasce em `spots[0].id` (`"14bb_rfi_utg"`), mostrando botão `100 BB` ativo acima de uma matriz `14BB`. Além disso, recebe apenas os 229 charts pré-flop.
- **Evidência:** Capturas `step_43_shot_3_explorador_ranges_1440x900.png` e `step_49_shot_3_mobile_390_explorador_ranges.png`; código `RangeExplorerView.tsx:33-56`.
- **Solução proposta:** Inicializar `primarySpotId` usando o mesmo stack selecionado (`spots.find(s => s.stackBb === initialStack)?.id`) e permitir explorar também o spot pós-flop verificado (`Ah Kd 7c`).
- **Arquivos/módulos impactados:** `app/src/components/RangeExplorerView.tsx`, `app/src/components/PokerStudioApp.tsx`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo.
- **Critérios de aceitação:** Ao abrir o `Explorador de Ranges`, o stack destacado no filtro coincide sempre com o spot renderizado e suas opções no `<select>`.

### [P1-02] Corrigir lógica de "Maior Leak por Posição", formulário manual e heatmap no `StatsView` *(Correção Obrigatória)*
- **Descrição do problema:** (a) `summary.worstPos` elege `BTN (100%)` como `"MAIOR LEAK POR POSIÇÃO"` mesmo com zero erros; (b) `handleAddCustomHand` fixa `spotId` em `"verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet"`; (c) `HEATMAP_STACKS` omite `28 BB` (`27.9` arredondado) e stacks Spin (`3/5/10/15 BB`); (d) `trainerSelfReview` colide quando a mesma `spotId::handClass` é jogada várias vezes.
- **Evidência:** `step_45_shot_3_diagnostico_leaks_1440x900.png`, `StatsView.tsx:254, 382, 552-564`.
- **Solução proposta:** Filtrar `worstPos` para posições com pelo menos 1 desvio (`pct < 100`), desacoplar `spotId` em entradas manuais (usando `"manual_custom_review"` ou seletor explícito), ajustar faixas de stack do heatmap e indexar autoavaliação por `attemptId`.
- **Arquivos/módulos impactados:** `app/src/components/StatsView.tsx`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo/Médio (atenção à retrocompatibilidade de dados salvos no `localStorage`).
- **Critérios de aceitação:** Sessão com `100%` de aderência válida exibe `"Nenhum leak detectado"` no card; mão manual adicionada não herda `spotId` do TexasSolver.

### [P1-03] Corrigir exibição de assentos `"fold"` antes do turno e `villainPosition` em `PokerTable.tsx` *(Correção Obrigatória)*
- **Descrição do problema:** Todos os assentos que não são Herói nem Vilão mostram `"fold"` mesmo antes da ação chegar neles (ex.: UTG RFI exibe MP..BB já em fold em `step_24.png`), e `vs_shove` ignora `spot.villainPosition` (`PokerTable.tsx:206-221, 418, 477`).
- **Solução proposta:** Usar explicitamente `spot.villainPosition` quando disponível e distinguir assentos que já desistiram antes do Herói (exibir `"fold"`) dos assentos que ainda vão agir depois do Herói (exibir stack / `"aguardando"`).
- **Arquivos/módulos impactados:** `app/src/components/PokerTable.tsx`, `app/src/lib/__tests__/tableAppearance.test.ts`.
- **Dependências:** Nenhuma.
- **Risco da alteração:** Baixo.
- **Critérios de aceitação:** Em `UTG RFI`, os 7 jogadores seguintes exibem seus stacks/posição (não `"fold"`); em `BTN RFI`, `UTG..CO` exibem `"fold"` e `SB/BB` ficam ativos.

### [P1-04] Sincronizar `"Marcar para revisão"` do `ReplayerView` com SQLite (`pending`) na `Biblioteca de Mãos` *(Correção Obrigatória)*
- **Descrição do problema:** A marcação `"☆ Marcar para revisão"` no `ReplayerView` salva apenas em `localStorage` (`poker_replayer_marked_hands_v1`), mantendo `Revisão pendente: 0` na `Biblioteca de Mãos` para mãos carregadas do SQLite.
- **Evidência:** Reproduzido entre `step_32.png` e `step_49_shot_5_mobile_390_biblioteca_maos.png`.
- **Solução proposta:** Quando a mão exibida no `ReplayerView` tiver origem na `Biblioteca` (`libraryRecordId` presente), persistir alternância via `POST /api/hand-library` (`action: "study"`) e refletir estado atualizado no `HandLibraryView`.
- **Arquivos/módulos impactados:** `app/src/components/ReplayerView.tsx`, `app/src/components/HandLibraryView.tsx`, `app/src/components/PokerStudioApp.tsx`.
- **Dependências:** Backend Biblioteca ativo (`POKER_LIBRARY_ENABLED=1`).
- **Risco da alteração:** Baixo.
- **Critérios de aceitação:** Marcar/desmarcar revisão no Replayer de mão da Biblioteca atualiza `pending` no SQLite e altera imediatamente o contador `"Revisão pendente"` na aba `Biblioteca de Mãos`.

### [P1-05] Explicitar fator PKO no `MathIcmLab` e corrigir texto factual do RAG no `AiCoachView` *(Correção Obrigatória)*
- **Descrição do problema:** (a) `evaluatePkoBountyModel` aplica `0.5` de captura imediata e novamente `bountyChipFactor ?? 0.5` (resultado `0.25x`), mas `MathIcmLab.tsx:70-89` não expõe nem documenta esse parâmetro na UI; (b) `AiCoachView.tsx:289-292` afirma indexar *Modern Poker Theory*, *Play Optimal Poker 1 & 2* e *The Grinder's Manual*, livros que não existem em `knowledge_base.json`.
- **Solução proposta:** Revisar a fórmula PKO para deixar transparente/editável o fator de conversão de bounty na UI (e confirmar se `0.5 * 0.5` deve virar fator único configurável `0.33–0.50` com `startingStack`); atualizar a lista de livros exibida em `AiCoachView` com os títulos reais presentes em `knowledge_base.json`.
- **Arquivos/módulos impactados:** `app/src/lib/poker/mathEngine.ts`, `app/src/components/MathIcmLab.tsx`, `app/src/components/AiCoachView.tsx`.
- **Dependências:** Validação matemática da regra PKO desejada pelo autor.
- **Risco da alteração:** Baixo/Médio (se alterar comportamento padrão de `evaluatePkoBountyModel`, atualizar teste correspondente em `pokerCore.test.ts` de forma documentada).
- **Critérios de aceitação:** Fórmula PKO e fator exibidos claramente e parametrizáveis na UI; `AiCoachView` cita estritamente fontes verificáveis em `knowledge_base.json`.

---

## PRIORIDADE P2 — MELHORIAS RECOMENDADAS E DÍVIDA TÉCNICA

### [P2-01] Reorganizar arquitetura de navegação (11 abas → agrupamento por domínios) e compactar header mobile *(Melhoria Recomendada — UI/UX)*
- **Problema:** As 11 abas estouram horizontalmente até em desktop `1920×1080` (`max-w-[1460px]`), escondendo 4 módulos atrás de rolagem horizontal, e o cabeçalho ocupa ~23,8% da tela em `390×844` (`~201 px` de `844 px`).
- **Solução proposta:** Agrupar as abas principais em 5–6 seções no topo com sub-navegação contextual e compactar a barra superior no mobile (mover aviso anti-RTA persistente para rodapé/popover após ciência inicial e mesclar controles auxiliares).
- **Arquivos/módulos impactados:** `app/src/components/PokerStudioApp.tsx`, `app/src/app/globals.css`, `app/src/components/SiteTour.tsx`.
- **Risco:** Médio (altera fluxo principal de navegação; testar tour e atalhos).
- **Critérios de aceitação:** Todas as seções visíveis sem corte horizontal em `1440×900` e `1920×1080`; cabeçalho total `<= 15%` da altura em `390×844` com mesa visível acima da dobra.

### [P2-02] Concluir migração do tema escuro, traduzir termos internos e alinhar branding do iniciador Windows *(Melhoria Recomendada)*
- **Problema:** Restos `#191B1D`/`#292C2F` em `StatsView`, `InteractiveDrillsLab`, `HandLibraryView` e `ReplayerView.module.css`; strings técnicas brutas na UI (`BET 33PCT`, `amostra_solida`, `"1 aulas"`); iniciador Windows (`launcher.pyw` / `Prepare-GTOTrainer.ps1`) ainda estilizado em verde esmeralda com nome `"♠ GTO Trainer"`.
- **Solução proposta:** Padronizar classes CSS no tema `#090D16`/`#1E293B`, criar formatador amigável pt-BR para ações (`Bet 33% pote`) e qualidade de amostra (`Amostra em formação`), corrigir pluralização em `CurriculumView` e atualizar título/ícone do launcher Windows para `TreinerLM`.
- **Arquivos/módulos impactados:** `TrainerView.tsx`, `StatsView.tsx`, `InteractiveDrillsLab.tsx`, `HandLibraryView.tsx`, `CurriculumView.tsx`, `ReplayerView.module.css`, `windows/launcher.pyw`, `windows/Prepare-GTOTrainer.ps1`.
- **Risco:** Baixo.
- **Critérios de aceitação:** Inspeção visual limpa sem contraste de caixas cinza antigas nem rótulos técnicos crus expostos ao usuário final.

### [P2-03] Corrigir defeitos pontuais em `InteractiveDrillsLab`, `dailyDoseCatalog` e `CurriculumView` *(Melhoria Recomendada)*
- **Problema:** `InteractiveDrillsLab.tsx` limita spots a `slice(0, 60)` e `slice(0, 15)`, exibe `"Herói: BTN vs "` quando `villainPosition` é `null` e não suporta toque contínuo ao pintar matriz; `dailyDoseCatalog.ts` calcula `accuracyPct` sem ponderar por combos (`6/4/12`); `CurriculumView` não reajusta `selectedSpotNumber` ao trocar de trilha.
- **Solução proposta:** Remover cortes fixos usando filtro de stack/posição ou virtualização leve; esconder `"vs ..."` quando `villainPosition === null`; ponderar `accuracyPct` por combos disponíveis; sincronizar `selectedSpotNumber` com o primeiro spot da trilha selecionada.
- **Arquivos/módulos impactados:** `app/src/components/InteractiveDrillsLab.tsx`, `app/src/lib/poker/dailyDoseCatalog.ts`, `app/src/components/CurriculumView.tsx`.
- **Risco:** Baixo.
- **Critérios de aceitação:** Construtor acessa todos os 229+ spots; `accuracyPct` reflete peso combinatório; troca de trilha sempre destaca a aula exibida.

### [P2-04] Sanear desvios de soma (`0.964`) em `ranges_gto.json` e atualizar documentação (`README.md` + `docs/`) *(Melhoria Recomendada)*
- **Problema:** `extract_ranges.py:203,369,384` eliminou cores raras arredondadas a `0.0%` no sumário global sem renormalizar a célula, gerando 360 células `!= 1.0` (`23` com desvio `> 0,002`, mínimo `0.964`). Além disso, `README.md` e `docs/` estão desatualizados frente a `2412db0` e `7a0d5d8`.
- **Solução proposta:** Documentar formalmente o resíduo do extrator de pixels e, caso o PDF original esteja disponível em ambiente do autor, corrigir o pipeline de extração (não remover `ck` antes de renormalizar ou registrar ruído OCR como resíduo explícito); atualizar `README.md` com instruções completas das 11 abas e variáveis `POKER_LIBRARY_*`.
- **Arquivos/módulos impactados:** `pipeline/extract_ranges.py`, `app/src/data/ranges_gto.json`, `README.md`, `docs/GUIA_USUARIO_GTO_TRAINER.md`.
- **Risco:** Baixo/Médio (mudança em `ranges_gto.json` altera SHA-256 usado pelo manifesto `pipeline/solver_runs/ahkd7c.../run_manifest.json` — **não alterar `ranges_gto.json` sem re-auditar vínculo do manifesto**!).
- **Critérios de aceitação:** Documentação 100% alinhada ao estado atual; se `ranges_gto.json` for regenerado no futuro, todas as 38.701 células somam `1.0 ± 0.002` com manifesto coerente.

---

## PRIORIDADE P3 — RECURSOS OPCIONAIS E EVOLUÇÃO FUTURA

### [P3-01] Unificar motor de repetição espaçada (Leitner) entre `Treiner Limpo`, `Daily Dose`, `Erros Fatais` e `Modo Trainer` *(Recurso Opcional)*
- Unificar progresso de retenção sob fila adaptativa única no diagnóstico, evitando quatro armazenamentos fragmentados.

### [P3-02] Fatiar `TrainerView` / `StatsView` / `InteractiveDrillsLab` e criar suíte E2E em Playwright *(Recurso Opcional — Qualidade de Software)*
- Quebrar arquivos de ~1.500–2.900 linhas em subcomponentes testáveis e automatizar fluxos de clique real em desktop e mobile `390×844`.
- Adicionar `__init__.py` ou ajuste documentado para `unittest discover` em `windows/`, além de otimizar validação JSON em `library.py` (processo persistente ou validador puro evitando spawn Node a cada arquivo).

### [P3-03] Expandir acervo de soluções GTO reais pós-flop (TexasSolver / Desktop Postflop) *(Ideia Futura)*
- Adicionar novos boards representativos (board baixo conectado, pareado, monotônico, turn/river) via `pipeline/solve_texassolver.py` e/ou `Desktop Postflop` mantendo `run_manifest.json` e hashes SHA-256 rastreáveis.
- Incorporar carregamento dinâmico (`dynamic import` / rotas sob demanda) para evitar inflar o First Load JS de `/` (`254 kB`).

### [P3-04] Afinar vínculo `Biblioteca SQLite ↔ Backup/Restore` e testes reais do PDF `Daily Dose` *(Ideia Futura)*
- Avaliar inclusão segura de fluxo de restauração com dupla confirmação em janela isolada/CLI para o backup SQLite gerado pela Biblioteca, além de ampliar exercícios interativos caso novos capítulos verificados do material didático sejam curados.
