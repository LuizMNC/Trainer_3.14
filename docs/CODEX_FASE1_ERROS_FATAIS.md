# Fase 1 — Aba Erros Fatais

Implementação para estudo offline, restrita ao catálogo educativo, fixação e revisão espaçada. Referências consultadas: `docs/ARQUITETURA_E_PLANO.md`, `docs/AUDITORIA_GTO_VERIFICADO.md`, `docs/PRIMEIRO_SPOT_GTO_REAL.md`, `Dossie/DOSSIER_GITHUB_POKER_METODOS_NUMERICOS.md` e `Dossie/CATALOGO_ERROS_FATAIS_GTO.json`.

## Funcionalidades

- Nova aba **Erros Fatais**, preservando as seis abas existentes.
- Importação dos 20 cartões EF01–EF20. `app/src/data/fatalErrorsCatalog.json` é uma cópia integral da fonte em `Dossie`, conferida por SHA-256 no teste. Nenhum campo original foi modificado.
- Filtros combináveis por street/contexto, categoria de evidência, dificuldade didática e status de estudo. Multiway e Disciplina são contextos próprios; categoria usa as quatro classificações documentadas do catálogo. Inclui filtro de respostas incorretas e estado vazio.
- Cada cartão apresenta mecanismo, sinal de risco, exemplo original, correção, contraponto e quiz com três alternativas. Perguntas, explicações complementares, dificuldade e contrapontos são conteúdo editorial didático, identificado na interface; não são dados de solver ou novas transcrições.
- Confiança declarada antes da resposta, confirmação explícita, feedback explicativo e possibilidade de repetir. Um bloqueio impede dois registros pelo mesmo envio. O feedback permanece visível se a resposta alterar o status filtrado.
- Progresso, acertos conceituais e respostas incorretas, com data, alternativa e confiança. O histórico mostra as cinco respostas incorretas mais recentes por cartão.
- Persistência versionada em `projeto_poker_fatal_errors_v1`, separada dos registros GTO existentes. Recuperação defensiva de JSON inválido, versões desconhecidas e respostas malformadas; erro de quota ou bloqueio de armazenamento gera aviso. Resultados são recalculados ao carregar e salvar: `isCorrect` ou EV adulterados não são aceitos.
- Uso do mesmo `computeSpacedRepetitionSchedule` do treinador, agora com contrato mínimo genérico, sem alterar seu algoritmo. Caixas 0–5 e intervalos de 0/1/3/7/14/30 dias; erros retornam à caixa 0, confiança baixa restringe o avanço, confiança média/alta avança. Status “Consolidado” significa caixa ≥3 enquanto a revisão não venceu. A agenda é atualizada a cada resposta e a cada minuto com a aba aberta.
- Relações temáticas com aulas RegLife existentes, seus conceitos e links. Aulas sem transcrição mantêm `METADATA_HYPOTHESIS` e aviso original. EF19/EF20 indicam que não há aula específica documentada.
- Lançamento de prática em **Modo Aprendizagem**, somente para vínculos explícitos presentes no catálogo atual: EF01 → `30bb_rfi_btn`; EF04 → `20bb_bb_vs_btn_rfi`; EF08 → `verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet`. A navegação confere posição, street, stack e, no pós-flop, board/pote do cenário vinculado. Não procura similaridades amplas nem presume equivalência de GTO. Outros temas exibem indisponibilidade de lançamento direto e continuam com quiz.
- Calculadoras limitadas a EF04/EF09 (pot odds), EF14 (fold equity de blefe puro) e EF17 (MDF), reutilizando `mathEngine.ts`. Entradas positivas/limitadas a números finitos; fórmulas e hipóteses visíveis. Para P=100 e B=50: pot odds 25%, fold equity 33,33%, MDF 66,67%. P é o pote antes da aposta; call C=B. Modelos HU finais, sem rake, side pots, ações futuras ou ICM/PKO. Não estimam equidade de mãos, fold rate ou estratégia ótima.
- Interface em português, controles rotulados, radios agrupados, mensagens acessíveis e grades adaptáveis a telas pequenas.

## Integridade GTO

Todos os cartões preservam `EDUCATIONAL_HEURISTIC`, `UNSOLVED`, `verifiedSolverSpotId=null`, `evLossBb=null` e `automaticDiagnosisAllowed=false`. O lançamento de um treino VERIFIED não promove o cartão nem seu exemplo. Quizzes retornam `gtoScored=false` e `evLoss=null`; seus acertos não entram em métricas de GTO, leaks de mãos ou EV do painel existente.

O catálogo de ranges importados, o bundle TexasSolver, o adaptador, o motor de cartas e o currículo RegLife permanecem intactos. A solução TexasSolver continua com frequências verificadas e sem EV por ação.

Foi corrigido um caso no avaliador existente: ações com frequência positiva abaixo de 5%, sem EV por ação disponível, passavam para a classificação `ev_error`. Agora permanecem no mix aceitável. O ajuste não muda frequências, EVs ou arquivos de solução; tem teste com o `Check` de AA do bundle real. Aderência a frequências continua sendo necessária: aceitar uma ação do mix não significa recomendá-la em 100% das ocorrências.

A verificação com cliques reais também encontrou um problema anterior do treinador: ao consumir o pedido de lançamento, seu efeito sorteava outro spot. A seleção solicitada agora é preservada após a limpeza do pedido; mudanças explícitas em filtros, dificuldade, seed ou modo continuam liberando novo sorteio. Os três destinos da aba foram conferidos no navegador após a correção.

Não há classificação por resultado de showdown, novo diagnóstico automático de mãos, novas estratégias GTO, HUD, assistência durante partidas, código de repositórios externos ou dependências novas. Replayer, banco de mãos, Monte Carlo e novos solvers ficaram fora desta fase.

## Arquivos

| Arquivo | Alteração |
|---|---|
| `app/src/components/PokerStudioApp.tsx` | Nova aba e conexão com a navegação atual do treinador. |
| `app/src/components/TrainerView.tsx` | Preservação do cenário solicitado ao consumir o pedido de navegação. |
| `app/src/components/FatalErrorsView.tsx` | Catálogo, filtros, detalhe, agenda, histórico e persistência da aba. |
| `app/src/components/FatalErrorQuiz.tsx` | Exercício conceitual, confiança, confirmação e feedback. |
| `app/src/components/FatalErrorCalculator.tsx` | Campos e resultados dos modelos didáticos. |
| `app/src/data/fatalErrorsCatalog.json` | Cópia integral do catálogo fornecido. |
| `app/src/lib/poker/fatalErrorsCatalog.ts` | Tipos, validação do catálogo, complementos editoriais, aulas e vínculos de prática. |
| `app/src/lib/poker/fatalErrorsStudy.ts` | Avaliação de quizzes, registros, persistência, filtros, status e integração Leitner. |
| `app/src/lib/poker/fatalErrorsMath.ts` | Validação de entradas e uso das fórmulas existentes. |
| `app/src/lib/studyNavigation.ts` | Tipagem das abas e navegação de prática validada. |
| `app/src/lib/poker/adaptiveDiagnostics.ts` | Contrato mínimo genérico para reutilizar Leitner sem inventar metadados de mãos. |
| `app/src/lib/poker/drillEvaluator.ts` | Correção da classificação de ações raras do mix sem EV disponível. |
| `app/src/lib/__tests__/fatalErrors.test.ts` | Integridade, filtros, quizzes, Leitner, persistência, navegação e matemática. |
| `app/src/lib/__tests__/fatalErrorsNavigation.test.ts` | Renderização dos componentes reais, abas, controles e modelos. Usa TypeScript e React DOM já instalados. |
| `docs/CODEX_FASE1_ERROS_FATAIS.md` | Este relatório. |

## Validação

Comandos executados em `app/`:

| Comando | Resultado |
|---|---|
| `npm test` | 46 testes aprovados, 12 suítes, nenhuma falha; 29 testes anteriores e 17 novos. |
| `npm run lint` | Aprovado, sem erros ou avisos ESLint. |
| `npm run typecheck` | Aprovado. |
| `npm run build` | Aprovado após a última alteração: Next.js 15.5.29, webpack em 10,1 s, lint/tipos aprovados, 5/5 páginas geradas, saída 0. Rota `/`: 107 kB; First Load JS: 210 kB. |

Cobertura adicional: comparação integral do catálogo por hash e campo; todas as alternativas dos 20 quizzes; cruzamento dos quatro filtros; erros/avanço/vencimento/limite de Leitner; recarga do progresso; adulteração de acerto e EV; JSON corrompido; quota; deduplicação e retenção; links ausentes/contextos diferentes; preservação dos status de origem; bloqueio de EV no bundle TexasSolver; manutenção das seis abas existentes e renderização inicial antes da hidratação.

O runner Node mantém o aviso preexistente `MODULE_TYPELESS_PACKAGE_JSON`; não afeta o resultado e não foi alterado o formato de módulos do projeto para eliminá-lo. Os testes de componentes usam renderização estática; não simulam cliques num DOM de navegador.

Verificação adicional com cliques reais no navegador, usando o servidor restrito a `127.0.0.1:3101`: resposta incorreta de EF01 com revisão imediata; feedback mantido sob filtro “Não estudado”; persistência da resposta após troca de aba e recarga; acerto de EF14 com avanço para caixa 1; restauração do filtro “Em estudo”; lançamento correto dos três destinos; combinação de filtros com resultado vazio; rejeição de aposta zero na calculadora. Viewport móvel de 390×844 verificado sem rolagem horizontal (largura de conteúdo igual à largura útil: 382 px); apresentação desktop também inspecionada. Nenhum erro de console foi observado nessa conferência. São verificações manuais assistidas, complementares aos testes automatizados.

Houve falhas ambientais nas tentativas de build: limpeza bloqueada de `.next/static`, `EPERM` ao criar diretório e `EINVAL/readlink` em artefatos gerados na pasta do OneDrive. Foram conferidos os caminhos absolutos dentro de `app/.next`, limpos apenas os artefatos gerados (preservando o cache) e repetido `npm run build` fora do sandbox, com sucesso após a última alteração. Não houve mudança de configuração do projeto nem desativação de lint ou tipos para contornar verificações. O servidor de validação foi encerrado.

## Limitações

- Armazenamento por navegador/origem, sem sincronização ou backup. Mantém até 100 tentativas recentes por cartão; contadores e agenda usam esse histórico retido. Limpar os dados do navegador apaga o progresso. Com armazenamento bloqueado, os registros sobrevivem somente enquanto a aba de estudo está montada.
- EF01, EF04 e EF08 têm lançamentos diretos; os outros cartões não ganham spots fictícios. Importações arbitrárias de solver não são vinculadas automaticamente.
- A categoria de evidência é distinta da dificuldade editorial. Nenhuma delas representa severidade em bb ou um ranking financeiro de erros.
- Equidade efetiva de draws, implied odds, ICM completo e PKO não são resolvidos pelas calculadoras desta aba.
- A revisão aparece dentro de Erros Fatais, reutilizando o agendador existente, e não é misturada ao painel de diagnóstico de mãos.

## Como usar

1. No terminal, entre em `app` e execute `npm run dev`.
2. Abra o endereço indicado pelo Next.js e selecione **Erros Fatais**.
3. Combine os filtros e escolha um cartão. Leia o exemplo, a correção e as exceções.
4. Selecione uma alternativa e sua confiança; clique em **Confirmar resposta**. O resultado entra no histórico e na agenda Leitner.
5. Consulte **Revisar agora**, o próximo prazo e **Últimas respostas incorretas**. Use **Com respostas incorretas** para selecionar lacunas de estudo.
6. Nos cartões com cenário vinculado, clique em **Iniciar no treinador**. O modo será Aprendizagem e o status do cenário continuará explícito.
7. Nas calculadoras disponíveis, varie P e B somente sob as hipóteses mostradas; o número é um limiar do modelo, não uma decisão automática.
