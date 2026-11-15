# Homologação técnica — Fase 1 / Erros Fatais

**Data local:** 12/11/2026 — America/Fortaleza. Os arquivos de evidência usam timestamps UTC explícitos.

**Estado final: APROVADA COM RESSALVAS**, após as correções abaixo. A aba educativa da Fase 1 foi verificada, sem regressão relevante identificada no comportamento exercitado. As ressalvas delimitam a certificação: armazenamento recente e local, três vínculos de prática, ausência de EV por ação no solver embarcado, automação de navegador dependente do ambiente e limite temporal do painel legado descrito na seção 8. Não foi iniciada a Fase 2.

## 1. Método e controle das alterações

A revisão confrontou as afirmações de `CODEX_FASE1_ERROS_FATAIS.md` com arquivos, execução de funções, testes e interação real. Resultados anteriores não foram usados como prova de aprovação atual.

Antes da primeira edição foram executados `git status --short`, `git diff --stat` e os diffs de `drillEvaluator.ts`, `TrainerView.tsx` e `adaptiveDiagnostics.ts`. O projeto já continha a implementação da Fase 1 sem commit: quatro arquivos rastreados modificados e onze arquivos novos. Esses arquivos não foram revertidos nem substituídos por versões do HEAD.

O snapshot [baseline.json](homologacao-fase1/baseline.json) registra HEAD `8af89a4fdf341e9ef79324fc21ee0035d423ef27`, status inicial e SHA-256 de **74 arquivos**. A comparação final identifica exatamente sete arquivos desse snapshot alterados por esta auditoria. Os arquivos `PokerStudioApp.tsx` e `TrainerView.tsx`, incluindo a correção anterior de navegação, não foram modificados nesta homologação.

O verificador [verificar-evidencias.mjs](homologacao-fase1/verificar-evidencias.mjs) é reproduzível a partir da raiz:

```powershell
node docs/homologacao-fase1/verificar-evidencias.mjs
```

Ele verifica **20 arquivos protegidos** contra o snapshot e gera [evidencias.json](homologacao-fase1/evidencias.json). Isso inclui catálogo original e cópia, ranges, bundle, seis artefatos de execução, cartas, estado de jogo, adaptadores, contratos, matemática, currículo RegLife e manifests de dependências. Todos permaneceram com os mesmos bytes. Nenhuma dependência foi adicionada.

## 2. Integridade e proveniência verificadas

### Catálogo

`Dossie/CATALOGO_ERROS_FATAIS_GTO.json` e `app/src/data/fatalErrorsCatalog.json` têm o mesmo SHA-256:

```text
48766a67795ab5a32ced0008d1b81987e8ffc141c5b1c3a5190e7f46eb29b17e
```

Foram comparados os bytes, os 20 IDs únicos EF01–EF20 e cada campo original com o cartão enriquecido em `fatalErrorsCatalog.ts`. Os complementos de explicação, dificuldade, contraponto, pergunta e relação temática são identificados como editoriais. Todos os cartões preservam:

- `evidenceStatus=EDUCATIONAL_HEURISTIC`;
- `gtoReferenceStatus=UNSOLVED`;
- `verifiedSolverSpotId=null`, `evLossBb=null`;
- `automaticDiagnosisAllowed=false`.

Todas as 60 alternativas dos quizzes foram avaliadas. `scoreFatalErrorQuiz` retorna sempre `evLoss=null` e `gtoScored=false`; carregar/salvar uma resposta reconstrói o acerto e descarta EV e campos extras adulterados. O fluxo de quiz não chama o registro de exercícios GTO do treinador.

### Catálogo de estratégias embarcado

Contagem obtida executando os construtores/adaptadores atuais, sem incluir caches privados ou importações de terceiros:

| Status | Quantidade |
|---|---:|
| VERIFIED | 1 |
| DIDACTIC_DEMO | 5 |
| IMPORTED_CHART_NO_EV | 229 |
| UNSOLVED | 8 |

Nenhuma demonstração do catálogo padrão foi promovida a VERIFIED. O único VERIFIED é o bundle TexasSolver. Os testes de contrato contêm fixtures sintéticas intencionais; elas não pertencem ao catálogo de estratégias distribuído e não são prova de uma execução externa.

### Bundle e dump TexasSolver

SHA-256 do bundle frontend, também idêntico a `pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/canonical_bundle.json`:

```text
868ef9fb8e6371f12dde7749170015af4facca70af92dc33aa45251cdd0b3eda
```

Hashes do manifesto recalculados contra os arquivos físicos:

| Arquivo | SHA-256 observado |
|---|---|
| `solver_input.txt` | `3320c8f95a9fd2e72f13d45d0fba8e3d090496dac726d286ee8ad32275581baa` |
| `texassolver_raw.json` | `b12c254b27653b943c7e03d3a37dd744f4f691b1ce46ef14a689070a36ded187` |
| `convergence_log.jsonl` | `3c03ac7b2512c6f461d53ded4e8e1bb192b71cdd248995f54493f48353dbf043` |
| `ranges_gto.json` | `d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e` |

O novo teste lê diretamente `raw.childrens.CHECK.strategy`: verifica as ações `CHECK`, `BET 19.000000`, `BET 43.000000`, compara **563 combos** e reconstitui as médias das **101 classes**, com tolerância de `5,1e-7` para o arredondamento a seis casas. O importador também foi executado, mantendo as verificações de cartas mortas e consistência já existentes.

No bundle, `matrixEv=null`, `evUnit=null` e `manifest.solver.evExportedByCli=false`. A avaliação de todas as 303 combinações classe/ação nos dois modos mantém `evLoss`, `bestEv`, `chosenEv` e unidade nulos. Nenhum valor de EV foi introduzido nos dados.

**Limite da evidência:** a convergência de aproximadamente 0,41485% consta dos logs/manifesto presentes e foi conferida como registro. Não foi repetida a execução do TexasSolver, auditado seu executável externo ou produzida uma prova independente de equilíbrio. Igualdade entre dump, bundle e hashes comprova consistência dos artefatos disponíveis, não uma nova execução do solver.

## 3. Arquivos e funções examinados

| Arquivo | Funções/caminhos examinados |
|---|---|
| `app/src/lib/poker/fatalErrorsCatalog.ts` | `validateSource`, construção dos 20 cartões, `getFatalErrorLessons`, `getFatalErrorPracticeSpots`. |
| `app/src/lib/poker/fatalErrorsStudy.ts` | `scoreFatalErrorQuiz`, `createFatalErrorAttempt`, `retainFatalErrorAttempts`, load/save, agenda, status e filtros. |
| `app/src/lib/poker/drillEvaluator.ts` | Guardas de modo/proveniência, `evaluateDrillDecision`, RNG, `computeMixedAdherenceStats`, `rankLeakSpots`. |
| `app/src/lib/poker/adaptiveDiagnostics.ts` | `computeSpacedRepetitionSchedule`, transições, prazos e confiança. |
| `app/src/lib/poker/fatalErrorsMath.ts` e `mathEngine.ts` | Pot odds, fold equity e MDF; entradas, fórmulas e arredondamento. |
| `FatalErrorsView.tsx`, `FatalErrorQuiz.tsx`, `FatalErrorCalculator.tsx` | Hidratação, confirmação, bloqueio de envio duplo, feedback, persistência, filtros, histórico e layout. |
| `TrainerView.tsx`, `PokerStudioApp.tsx`, `studyNavigation.ts` | Pedido/consumo de lançamento, seleção preservada, liberação após mudanças de controles, modos e separação dos registros. |
| `StatsView.tsx` | Separação das métricas, exibição de EV indisponível, rótulos de mix e referência temporal do painel legado. |
| `solverAdapter.ts`, `strategySchema.ts`, `solverFormats.ts`, `curriculum.ts`, `reglifeCatalog.ts` | Status do acervo, proveniência, importação do bundle e ausência de promoção dos exemplos. Não modificados. |
| `pipeline/solve_texassolver.py` e artefatos da execução | Estrutura de nó, mapeamento das ações, agregação, manifesto e hashes. Não executado um novo solve. |

Os motores de cartas, estado, ICM/PKO e importadores também passaram pela suíte anterior completa; isso é teste de regressão nos casos existentes, não auditoria exaustiva de todas as possíveis mãos ou árvores.

## 4. Problemas reproduzidos e correções

| ID / prioridade | Reprodução objetiva | Correção e regressão |
|---|---|---|
| H01 — P1 | Clone adversarial em memória com rótulo VERIFIED, sem `solutionSource` e com EV injetado: em LEARNING retornava `gtoScored=true`, `evLoss=2`. | A mesma guarda de proveniência agora se aplica ao VERIFIED nos dois modos. Fixture bloqueada sem EV; solução embarcada e importações válidas continuam passando. |
| H02 — P1 | Ler payload `version=2` devolvia sessão vazia; salvar uma resposta substituía o original por `version=1`. JSON corrompido também era sobrescrito. | Antes de gravar, conferir formato/versão presentes. Conteúdo incompatível/corrompido é preservado byte a byte, com aviso e estudo apenas na sessão. Sem migração destrutiva. |
| H03 — P2 | Primeiro acerto de confiança baixa ficava na caixa 0. Em 110 acertos, com cinco médios seguidos de baixos, histórico completo dava caixa 1, mas últimas 100 respostas davam caixa 0. | Acerto com baixa confiança fixa caixa 1. O teste compara caixa e prazo antes/depois da retenção. Intervalos e demais transições preservados. |
| H04 — P2 | Acerto seguido de erro com o mesmo timestamp, armazenados do mais novo para o mais antigo: agendador processava o erro antes do acerto, terminando na caixa 1. | A ponte dos quizzes inverte a coleção antes da ordenação cronológica estável; último envio prevalece em empate, inclusive após recarga. |
| H05 — P2 | O limite guarda 100 respostas por cartão, enquanto os indicadores superiores diziam “respostas registradas”/“acertos conceituais” sem delimitar a janela. | Rótulos de respostas/acertos recentes, nota explícita sobre 100 por cartão e histórico “nesta janela”. Nenhum contador cumulativo fictício foi criado. |
| H06 — P1 | `rankLeakSpots([{evLoss:null,isError:true,...}])` retornava `avgEvLoss=1`, obtido da taxa de erro. | EV médio permanece `null`. A taxa de erro é usada somente no fator heurístico de prioridade, preservando o mesmo `impactScore` e ordenação. |
| H07 — P2 | Renderização de histórico real de frequências sem EV exibia “(+EV)” e “Mix (+EV)”. Também observado no navegador. | Textos agora indicam presença no mix e “Mix válido”, sem afirmar rentabilidade financeira ou EV conhecido. Teste de renderização e nova conferência no navegador. |

Reprodução inicial: [testes-antes.log](homologacao-fase1/testes-antes.log) registra 14 casos, nove aprovados e cinco falhas; duas falhas têm a mesma causa H03. H06/H07 foram reproduzidos depois em [testes-antes-complementares.log](homologacao-fase1/testes-antes-complementares.log), com 21 casos e duas falhas. H05 foi confirmado pela retenção e pela leitura dos rótulos; recebeu asserções de renderização da janela.

O teste antigo de `etapa1Audit.test.ts` promovia uma fixture DIDACTIC_DEMO a VERIFIED apenas trocando o status, com proveniência nula, e esperava EV numérico. Sua expectativa foi corrigida para bloquear a promoção; não foram mudados os valores de EV da fixture ou de qualquer estratégia. Os testes de importação de EV da Etapa 6 continuam ativos. Não foram removidos testes ou verificações de lint/tipos.

## 5. Avaliador e navegação

Das 303 frequências por classe/ação no bundle real: **101 são positivas abaixo de 5%, 199 estão entre 5% e 90%, três são ≥90%; nenhuma é exatamente zero**. Todas foram exercitadas em LEARNING e GTO_TECHNICAL. Frequência zero, inclusive ação omitida numa célula esparsa, foi testada nos charts reais; continua sendo desvio da política de referência, com EV nulo. Todos os charts/demos/UNSOLVED permanecem bloqueados em modo técnico.

Aceitação e aderência foram testadas separadamente: `Check` de AA integra o mix com frequência `0,033357`, mas escolhê-lo 100 vezes produz aderência inferior a 5%. Aceitar uma ocorrência não autoriza transformar a ação em regra universal. O teste de RNG também exercita ação válida diferente da ação sorteada.

| Cartão | Destino real | Herói / vilão | Stack efetivo | Street / board | Pote do adaptador |
|---|---|---|---:|---|---:|
| EF01 | `30bb_rfi_btn` | BTN / sem vilão específico | 30 BB | PREFLOP / vazio | 2,5 BB |
| EF04 | `20bb_bb_vs_btn_rfi` | BB / BTN | 20 BB | PREFLOP / vazio | 4,5 BB |
| EF08 | `verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet` | BTN / BB | 27,9 BB remanescentes | FLOP / Ah Kd 7c | 5,7 BB |

Os dois potes pré-flop vêm da adaptação do chart; não constituem nova saída de solver. O stack inicial de referência do nó EF08 é 30 BB; 27,9 BB é o stack remanescente do nó.

Os três destinos foram abertos por cliques reais em Aprendizagem, sem promoção dos cartões. Após EF01 foram alterados fonte, stack 20, posição BB, dificuldade, ativação de seed, texto da seed e modo. Os novos sorteios respeitaram os filtros; modo técnico mostrou o único VERIFIED; voltar a Aprendizagem retomou o conjunto filtrado. Não foi necessário modificar `TrainerView.tsx`.

## 6. Persistência, repetição e matemática

Testes reproduzíveis verificam recarga, JSON inválido, itens malformados, duplicação de IDs, quota/leitura bloqueadas, versão incompatível, proteção de outras chaves e descarte de acerto/EV adulterados. O formato continua `version=1`, sem migração. A proteção de versão é feita também na gravação, não apenas ao montar a tela.

Retenção é por cartão: contadores representam até 100 respostas recentes, não totais acumulados. Os 20 cartões podem manter até 2.000 registros. Depois da correção H03, o cenário de 110 respostas conserva caixa/prazo ao reter 100; contadores completos e retidos continuam intencionalmente diferentes. Não se reconstrói um total vitalício a partir de dados descartados.

Com relógio injetado na função, foram testados `vencimento−1 ms`, instante exato de vencimento, passagem de meia-noite, passagem de ano e retorno do relógio. Os intervalos são durações de 24 horas, não mera troca da data do calendário. A agenda da aba usa o relógio atual na montagem, respostas e atualização de 60 segundos. O teste de empate de timestamp é independente do relógio físico.

| Calculadora | Fórmula | P=100; B=50 |
|---|---|---:|
| EF04 / EF09 | `B/(P+2B)` com call C=B | 25% |
| EF14 | `B/(P+B)` | 33,33% |
| EF17 | `P/(P+B)` | 66,67% |

Hipóteses visíveis: HU final/all-in, sem rake, side pots ou ações futuras, sem ICM/PKO; realização integral para o call; equidade zero quando pago para blefe puro. MDF não é obrigação de call de uma mão. Não há estimativa de equidade, fold rate ou recomendação automática.

Foram testados zero, negativos, NaN, ±Infinity, menor positivo representável e extremos com overflow do denominador. Extremos que não podem ser representados com denominador finito são rejeitados. Escalas `1e-300`, `0,01`, `1`, `1e100`, `1e300` preservam os resultados analíticos; aposta do tamanho do pote retorna 33,33%/50%/50%. Resultados arredondados a duas casas percentuais. Nenhuma fórmula ou valor educacional precisou ser alterado.

## 7. Validação efetivamente executada nesta auditoria

Comandos em `app/`, após as correções finais:

| Comando | Resultado observado | Evidência |
|---|---|---|
| `npm test` | **63/63**, 16 suítes, zero falhas/cancelados/pulados, saída 0 | [npm-test.log](homologacao-fase1/npm-test.log) |
| `npm run lint` | Zero erros/avisos ESLint, saída 0 | [npm-lint.log](homologacao-fase1/npm-lint.log) |
| `npm run typecheck` | Sem erros, saída 0 | [npm-typecheck.log](homologacao-fase1/npm-typecheck.log) |
| `npm run build` | Next.js 15.5.29, compilação 6,3 s, validação de lint/tipos, 5/5 páginas, saída 0 | [npm-build.log](homologacao-fase1/npm-build.log) |

Rota `/`: 107 kB, First Load JS 210 kB. O build final foi executado fora do sandbox após encerrar o servidor de testes e limpar somente os artefatos gerados de `app/.next`, preservando cache, com verificação dos caminhos absolutos. Isso evita os problemas ambientais de OneDrive/EPERM/readlink já registrados; não foram desativados lint, tipos ou testes. `NEXT_TELEMETRY_DISABLED=1` foi apenas variável do processo. O aviso Node `MODULE_TYPELESS_PACKAGE_JSON` permanece e não altera a saída de sucesso.

Foram adicionados **17 casos** aos 46 existentes: 16 em `fase1Homologacao.test.ts` e um caso de rótulo em `fatalErrorsNavigation.test.ts`. O relatório anterior de 46 testes é histórico, não o resultado desta execução. O arquivo `testes-homologacao.log` registra uma execução intermediária de 15 casos; a evidência final completa é `npm-test.log`.

### Interação real, separada do build

Origem isolada `http://127.0.0.1:3102`, sem reutilização do progresso da validação anterior. Foram executadas ações por locators e asserções no navegador, conforme o [roteiro reproduzível](homologacao-fase1/interacoes.md):

- Confirmação desabilitada antes da escolha; envio duplo gerou somente um registro.
- Quatro filtros combinados, resultado vazio, limpeza e seleção dos cartões.
- EF01 incorreto com confiança alta: feedback, alternativa no histórico e caixa 0; feedback preservado após mudança de status.
- EF14 correto com confiança baixa: caixa 1 e prazo de um dia. Foram observadas 21 respostas desse cartão após repetições, todas restauradas após recarga.
- EF01 e EF14 restaurados nos filtros “Com respostas incorretas” e “Em estudo”.
- Três lançamentos e controles do treinador descritos na seção 5.
- Quatro calculadoras, aviso de aposta zero e ressalvas estratégicas.
- No diagnóstico havia **um exercício do treinador**, EV médio “—” e “Mix válido”, apesar dos **22 quizzes**; separação dos registros confirmada.
- Abertura das seis abas anteriores sem erro de renderização. Não foi enviada pergunta ao serviço externo de AI nem feita nova importação de solver.
- Móvel 390×844: largura útil e largura de conteúdo de 382 px, sem rolagem horizontal. Desktop também inspecionado; viewport restaurado.
- Nenhum erro de console observado na conferência final.

Um lote de 25 repetições excedeu o tempo da ferramenta de automação e foi interrompido após 20 repetições concluídas, mais a resposta inicial. O teste de 100/110 respostas foi comprovado pela suíte automatizada de funções; **não** se declara concluído um stress de 100 envios na UI. Não houve exceção do aplicativo nesse episódio.

## 8. Riscos residuais e ressalvas

1. **Escopo matemático:** frequências verificadas não fornecem EV por ação. Nenhuma pontuação financeira real do spot TexasSolver foi homologada; somente indisponibilidade de EV e consistência de frequências/artefatos. Testes CSV/EV positivos existentes são testes de contrato com fixtures, não novos solves reais.
2. **Dados locais:** não há sincronização, backup, total vitalício ou restauração automática de versão incompatível. Essa versão é preservada e novas respostas ficam na sessão; armazenamento indisponível perde a sessão ao desmontar a aba. Não se certifica resistência a adulteração deliberada de todo o cache de estratégias; o caminho normal depende dos importadores validadores.
3. **Automação:** testes de funções e renderização estão em `npm test`; interação real usou o navegador conectado e não um runner E2E de CI instalado no projeto. O roteiro reproduz os seletores/assertivas, mas requer esse ambiente. Não foi adicionada uma dependência apenas para suprir o runner.
4. **Painel legado:** em `StatsView.tsx`, a agenda antiga ainda passa o timestamp do exercício mais recente como `nowMs` (`adaptiveAnalysis`), em vez de um relógio atual. Isso foi observado no código do snapshot inicial, não introduzido nesta auditoria. A passagem do tempo desse painel não foi homologada por um teste de UI prolongado. A agenda de **Erros Fatais** usa relógio atual; a função compartilhada teve os vencimentos testados com relógio controlado. Não foi ampliado o escopo para refazer a temporalidade do painel antigo.
5. **Cobertura:** 17 temas permanecem sem lançamento direto, por ausência de vínculo explícito compatível. Não foram inventados spots, regras universais, EVs ou novas transcrições para aumentar a cobertura.

As ressalvas delimitam a aprovação da **aba educativa da Fase 1**. Não há defeito crítico aberto identificado nesse fluxo após as correções; esta conclusão não certifica todo o aplicativo, o serviço remoto de AI ou todos os dados que um usuário venha a importar.

## 9. Lista de arquivos alterados nesta homologação

Arquivos existentes no snapshot inicial, com alteração efetiva nesta auditoria:

1. `app/src/components/FatalErrorsView.tsx` — nomes dos indicadores e nota sobre a janela.
2. `app/src/components/StatsView.tsx` — dois rótulos de mix sem alegação de +EV.
3. `app/src/lib/poker/fatalErrorsStudy.ts` — proteção de escrita e ordem de empates.
4. `app/src/lib/poker/adaptiveDiagnostics.ts` — caixa 1 no acerto com confiança baixa.
5. `app/src/lib/poker/drillEvaluator.ts` — proveniência nos dois modos e EV médio nulo no ranking sem dados.
6. `app/src/lib/__tests__/etapa1Audit.test.ts` — expectativa correta para fixture promovida sem proveniência.
7. `app/src/lib/__tests__/fatalErrorsNavigation.test.ts` — regressões de rótulos e janela.

Novos arquivos:

- `app/src/lib/__tests__/fase1Homologacao.test.ts` — 16 testes de evidência e regressão.
- `docs/CODEX_FASE1_HOMOLOGACAO.md` — este relatório.
- `docs/homologacao-fase1/baseline.json`, `evidencias.json`, `verificar-evidencias.mjs` — controle por hash e verificador.
- `docs/homologacao-fase1/interacoes.md` — reprodução da conferência funcional.
- `docs/homologacao-fase1/npm-test.log`, `npm-lint.log`, `npm-typecheck.log`, `npm-build.log` — validação final.
- `docs/homologacao-fase1/testes-antes.log`, `testes-antes-complementares.log`, `testes-homologacao.log` — reproduções e execução intermediária.

O relatório anterior foi preservado como registro histórico. Nenhuma solução, range, valor de EV, fórmula, conteúdo original do catálogo, licença ou dependência foi alterado para acomodar testes. Não houve replayer, banco de mãos, Monte Carlo, novo solver, HUD ou assistência em tempo real.
