# Dossiê técnico — GitHub, dados de mãos e métodos numéricos para o Projeto-Poker

**Pesquisa pública:** 12/11/2026  
**Objetivo:** orientar a evolução de um treinador de estudo offline e uma nova aba "Erros Fatais".  
**Base do projeto informada nos relatórios do usuário:** Next.js 15 / React 19 / TypeScript / Tailwind CSS, `cards.ts`, `stateEngine.ts`, `strategySchema.ts`, `solverAdapter.ts`, `drillEvaluator.ts`, `adaptiveDiagnostics.ts`, `TrainerView.tsx`, `CurriculumView.tsx`.

> **Limites da avaliação:** repositórios externos foram examinados por suas páginas e documentação pública, não houve clone, benchmark local ou execução dos códigos externos. O repositório privado/local do usuário não foi fornecido para auditoria direta. Licenças e termos de dados devem ser revisados antes de redistribuição/serviço.

## Resumo executivo

1. **Primeiro consertar a autenticidade matemática:** o projeto atualmente não possui nenhuma solução externa de GTO comprovada segundo a auditoria anterior. Os nove exemplos antes ditos verificados foram reclassificados (3 DIDACTIC_DEMO, 6 UNSOLVED). Evite repetir o erro.
2. **Separar três camadas:** dados de históricos e engine de regras, modelos matemáticos/solver verificados, e heurísticas educacionais. A camada de dados **não** prova GTO.
3. **Criar aba Erros Fatais:** catálogo contextual, exercícios, detector pós-sessão e revisão adaptativa; não usar durante partidas nem prover assistência em tempo real.
4. **Escolher o primeiro solver real:** TexasSolver CLI para pipeline reprodutível de heads-up pós-flop; postflop-solver Rust como alternativa experimental. Ambos usam licenças copyleft AGPL e requerem avaliação de integração legal.
5. **Usar métodos numéricos para robustez:** Monte Carlo, intervalos de confiança, variância, testes de sensibilidade, otimização, CFR e avaliação de estratégia; nada disso cria um solver correto por si só.

## Repositórios candidatos verificados

| Projeto | Licença declarada / nota | Uso recomendado | Prioridade | Limitação específica |
|---|---|---|---|---|
| [PokerKit](https://github.com/uoftcprg/pokerkit) | MIT | Motor de regras e validação cruzada de mãos/side pots | Muito alta | Python; NÃO é solver GTO. Biblioteca de pesquisa com testes extensivos. |
| [PHH Standard](https://github.com/uoftcprg/phh-std) | MIT | Formato canônico para histórico e replayer | Muito alta | Formato neutro; preservar arquivo bruto e origem. |
| [PHH Dataset](https://github.com/uoftcprg/phh-dataset) | MIT no repositório; verificar cada fonte de dados | Fixtures reais/históricos para parser e replayer | Muito alta | GitHub contém subconjunto; Zenodo v3 completo 20,3 GB, ACPC sintético e mãos cash antigas; não são soluções GTO nem uma amostra atual de MTT. |
| [TexasSolver](https://github.com/bupticybee/TexasSolver) | AGPL-3.0 | Primeiro pipeline real de solver HU pós-flop | Muito alta | C++ Windows/macOS/Linux; CLI e export JSON anunciados. Confirmar licença/termos para distribuição, modificação e serviços. |
| [postflop-solver](https://github.com/b-inary/postflop-solver) | AGPL-3.0-or-later | Motor Rust com Discounted CFR; segunda implementação para comparar | Alta | Desenvolvimento suspenso desde 2023; API pode sofrer mudanças; uso embutido precisa revisão legal. |
| [Desktop Postflop](https://github.com/b-inary/desktop-postflop) | AGPL-3.0-or-later | Interface alternativa e comparação de solves | Média | Projeto suspenso desde 2023; não usar como único backend de produção. |
| [OpenSpiel](https://github.com/google-deepmind/open_spiel) | Apache-2.0 | CFR, exploitability e experimentos com jogos de informação imperfeita | Alta | Framework de pesquisa e jogos-modelo; não equivale a solver MTT NLHE completo. |
| [RLCard](https://github.com/datamllab/rlcard) | MIT | Bancada experimental de agentes e RL | Média | Útil para experimentos acadêmicos, não para certificar ranges GTO. |
| [FPDB-3](https://github.com/jejellyroll-fr/fpdb-3) | AGPL-3.0 | Estudo de parsers, históricos, relatórios e replayer | Alta | Não copiar HUD/captura em tempo real; trabalhar apenas com importação offline e revisar licenças. |
| [poker-engine-ts](https://github.com/Ge-limin/poker-engine-ts) | MIT | Referência de reducer de ações, event sourcing e testes de invariantes | Alta | Repositório relativamente novo/pequeno; executar testes e revisão de segurança antes de incorporar. |
| [poker-eval](https://github.com/pokerinfra/poker-eval) | MIT | Avaliador Rust/WASM como oráculo de testes de força das mãos | Média | Candidato novo com poucas contribuições; cruzar com PokerKit e avaliação exaustiva. |
| [Treys](https://github.com/ihendley/treys) | MIT | Oráculo simples em Python de força das mãos | Média | Avaliador, não solver. |
| [hand-history-analyzer](https://github.com/poker-apprentice/hand-history-analyzer) | Verificar LICENSE | Inspiração para estatísticas pós-sessão | Média | Revisar compatibilidade de formatos e manutenção. |

**Observação de licença:** MIT/Apache geralmente permitem ampla reutilização com preservação de avisos; AGPL impõe obrigações específicas ao modificar/distribuir e oferecer software em rede. A separação por processo ou serviço não garante ausência de obrigações. Revisar com especialista antes de distribuir, incorporar ou hospedar. O README do TexasSolver menciona exigências próprias de licença comercial para algumas integrações.

## Bases de mãos de Texas Hold'em

- **PHH Standard**: [repositório](https://github.com/uoftcprg/phh-std). Utilizar como representação intermediária versionada para converter históricos, com status de parser, validação de ações legais, potes, blinds, antes, moedas e mãos parciais.
- **PHH Dataset**: [GitHub](https://github.com/uoftcprg/phh-dataset) fornece subconjunto; [Zenodo versão 3 (2025)](https://zenodo.org/records/17136841) publica arquivo completo de aproximadamente **20,3 GB**. Inclui centenas de milhões de mãos de competições entre agentes e 21.605.687 mãos anonimizadas de cash online de julho de 2009, além de 10 mil mãos Pluribus e algumas mãos de torneios. **Não** é uma base representativa do field atual de MTT. Há duplicatas explícitas em partes da ACPC.
- **Não importar tudo indiscriminadamente:** começar com amostra pequena de arquivos licenciados; validar filtros NLHE/MTT, deduplicar por ID/origem, e particionar por formato. Não treinar estimadores de jogadores atuais em partidas simuladas/antigas sem calibração temporal.
- **Históricos pessoais**: importar apenas arquivos localmente fornecidos e autorizados pelo titular, com anonimização de nomes, sem transmissão não consentida a terceiros. Preferir processamento pós-sessão.
- **Dados ausentes:** não inventar cartas de adversários não reveladas nem avaliar decisões como GTO baseando-se apenas em quem venceu a mão.

### Fluxo de dados sugerido

`HH .txt/.zip/PHH -> Parser de origem -> Normalização PHH -> Validador de estado (PokerKit como oráculo independente) -> banco local -> Replay -> Detector de padrões -> Solver *opcional* -> EV loss se e somente se verificado -> Revisão Leitner`

Campos mínimos: `handId, sourceRoom, importedAt, format, gameType, tableSize, blinds, ante, payoutInfo, bountyInfo, seat, stack, position, timestamp, street, board, holeCardsKnown, actionHistory, amountToCall, pot, result, heroDecision, provenance`.

## Nova aba "Erros Fatais" / Anti-Leaks

**Conceito:** não listar "mãos proibidas" nem produzir regra genérica do tipo "nunca blefar". Cada cartão exige cenário, hipótese, mecanismo do erro, correção e origem da evidência. Só categorizar como erro GTO medido quando o contexto coincide com uma solução solver rastreável.

### Catálogo inicial de 20 temas

| ID | Grupo | Erro ou risco a estudar | Classe |
|---|---|---|---|
| EF01 | Pré-flop | Ignorar a posição e o range de abertura | CONTEXTUAL |
| EF02 | Pré-flop | Defender mãos dominadas automaticamente contra posição inicial | CONTEXTUAL |
| EF03 | Pré-flop | Usar sempre o mesmo tamanho de 3-bet | CONTEXTUAL |
| EF04 | Pré-flop | Ignorar pot odds e composição do range na defesa do Big Blind | QUANTIFIABLE_WITH_INPUTS |
| EF05 | Pré-flop | Aplicar ranges chipEV em bubble ou mesa final sem ajuste | CONTEXTUAL |
| EF06 | Pré-flop | Ignorar bounties e a cobertura de stacks no PKO | CONTEXTUAL |
| EF07 | Pré-flop | Dar all-in sem avaliar fold equity e os ranges de call | QUANTIFIABLE_WITH_INPUTS |
| EF08 | Flop | C-betar automaticamente 100% dos flops | CONTEXTUAL |
| EF09 | Flop | Pagar draw sem preço suficiente | QUANTIFIABLE_WITH_INPUTS |
| EF10 | Flop | Confundir força absoluta com força relativa ao range | CONTEXTUAL |
| EF11 | Flop | Check-raise sem motivo de valor ou blefe defensável | CONTEXTUAL |
| EF12 | Turn | Apostar segundo barrel sem plano para o river | CONTEXTUAL |
| EF13 | Turn | Usar blockers de forma isolada como prova de blefe | CONTEXTUAL |
| EF14 | River | Blefar sem verificar fold equity necessária | QUANTIFIABLE_WITH_INPUTS |
| EF15 | River | Overblefar contra range que quase nunca folda | CONTEXTUAL |
| EF16 | River | Confundir showdown value com mão obrigatória de value bet | CONTEXTUAL |
| EF17 | River | Aplicar MDF como obrigação de call em qualquer situação | MATHEMATICAL_MODEL_MISUSE |
| EF18 | Multiway | Aplicar estratégia heads-up sem adaptar para multiway | CONTEXTUAL |
| EF19 | Disciplina | Avaliar a qualidade de uma decisão pelo resultado de uma mão | PROCESS |
| EF20 | Disciplina | Jogar em tilt ou fora dos limites planejados | PROCESS |

A especificação completa de cada cartão (gatilho, correção e exemplo) está em `CATALOGO_ERROS_FATAIS_GTO.json`. **Todos começam com** `evidenceStatus=EDUCATIONAL_HEURISTIC`, `gtoReferenceStatus=UNSOLVED`, `evLossBb=null` e `automaticDiagnosisAllowed=false`.

### Interface recomendada

- **Top 10 armadilhas** — cartões curtos com nível: matemática exata no modelo, hipótese contextual, ou disciplina. Sem ranking fictício de EV.
- **Filtros:** Pré-flop / Flop / Turn / River / Multiway / MTT-ICM / PKO / Disciplina.
- **Modo Aprender:** causa do erro, condições necessárias, exemplo, contraponto (quando a aparente 'má jogada' seria válida), vídeo RegLife de referência e quiz.
- **Treinar sem solver:** cenários conceituais sem `EV loss` nem alegação de GTO.
- **Revisar minhas mãos:** importação offline de históricos, marcação como 'suspeita a revisar' quando há sinais contextuais; só rotular desvio GTO após resolver/importar spot equivalente e conferir range/ações.
- **Minhas tendências:** por categoria, amostra, confiança, tipo de erro, EV loss apenas onde calculado; manter separação entre processo e resultados de curto prazo.
- **Checklist pré-sessão (estático):** posição/stack/ICM/PKO/pot odds/range/plano das streets, sem integração com mesas reais.

### Contratos de dados

Cada erro: `id, category, title, classification, riskSignal, correctiveStudy, sampleScenario, evidenceStatus, gtoReferenceStatus, verifiedSolverSpotId, evLossBb, automaticDiagnosisAllowed`.  
Se houver solver validado, uma análise pode agregar `contextHash, solverId, solverVersion, solutionHash, actionBestEv, actionChosenEv, unit, evLoss, accuracyFlags`. Nunca atualizar automaticamente um exemplo para VERIFIED.

### Critérios de detecção confiável

1. **Modelo aritmético reproduzível**: conta exata sob hipóteses explícitas (pot odds, min-raise, side pot, colisão de cartas). Resultado sinaliza inconsistência da justificativa, não necessariamente erro GTO.
2. **Solver validado**: cenário e ranges equivalentes, proveniência e convergência suficientes; então possível calcular `EV_loss = max_a EV(a) - EV(a_escolhida)` na mesma unidade.
3. **Estatística populacional**: detecta tendência (por exemplo c-bet excessiva em amostra segmentada), não estratégia ótima; incluir intervalo de confiança e tamanho da amostra.
4. **Heurística contextual**: material didático e quiz, nunca pontuação GTO exata.
5. **Disciplina**: autoavaliação e decisões de processo; evitar rótulos clínicos ou inferências pessoais.

## Física, matemática e engenharia aplicadas corretamente

### 1. Combinação exata e probabilidade

Para cartas conhecidas, enumerar **combos físicos** e possíveis boards respeitando card removal. `equity = P(vencer) + 0,5 P(empatar)` em heads-up com divisão igual do pote. Para mais jogadores, ponderar empates conforme fração de pote recebida.

### 2. Monte Carlo e incerteza estatística

Estimar equity amostrando ranges ponderados, cartas desconhecidas e runouts válidos. Guardar seed e número de amostras. Para probabilidade binária a aproximação de 95% é `p ± 1.96 * sqrt(p(1-p)/N)`; em simulações com empates e pesos, estimar erro-padrão pelas observações/repetições e tamanho amostral efetivo.

Exemplo: `p=0,50`, `N=100.000` -> aproximadamente `±0,31 ponto percentual` de margem a 95% sob amostragem independente Bernoulli. **Isso não mede o erro de modelagem do range adversário.**

### 3. Cálculo de EV e preço do call

Se pote antes da aposta é `P` e aposta adversária `B`, o herói paga `C=B` no HU e não há outros fluxos, **pot odds de call** = `B/(P+2B)`; para `P=100`, `B=50`: `25%`. Um blefe de equidade zero com risco `B` para ganhar o pote `P` precisa de fold rate `B/(P+B)`; com os mesmos valores: `33,33%`.

Para call all-in simplificado: `EV(call) = equity*(P+B) - (1-equity)*B` se empate ignorado, valores medidos antes do call; incorporar rake e efeitos futuros quando aplicáveis.

### 4. Sensibilidade e otimização robusta

Variar posição, ranges, bet sizes, SPR, fold rates, ICM e bounty. Relatar fronteiras em que a decisão mais rentável muda. Não usar diferenças de EV menores do que a incerteza numérica como prova de escolha superior.

### 5. Teoria dos jogos e algoritmos numéricos

CFR/CFR+/Discounted CFR, regret matching, self-play, exploitability/NashConv em jogos apropriados. Reproduzir benchmarks nos jogos pequenos Kuhn/Leduc e apenas depois aproximar NLHE. `OpenSpiel` é referência acadêmica; `TexasSolver` e `postflop-solver` visam resolver subgames pós-flop HU mais práticos.

### 6. Engenharia de software e verificação numérica

- Invariantes: 52 cartas únicas, 1.326 combos iniciais, conservação de fichas, side pots, legalidade, soma de frequências e ausência de EV sintético.
- Property-based tests com sequências aleatórias de ações, especialmente em multiway all-in e devolução de uncalled bets.
- Comparação de oráculos: engine TypeScript vs PokerKit e/ou avaliador Rust; logs de casos discordantes.
- Testes metamórficos: renomear naipes mantendo simetria quando a textura é equivalente, reordenar assentos preservando contexto relativo, alterações de escala em fichas compatíveis.
- Seed reprodutível, versão da solução, precisão numérica e snapshot de entrada/saída em cada experimento.

## Arquitetura proposta para o projeto atual

```text
Projeto-Poker/
├── app/src/components/
│   ├── FatalErrorsView.tsx                  # nova aba
│   ├── HandReplayView.tsx                   # próxima fase
│   └── ...componentes atuais preservados
├── app/src/lib/poker/
│   ├── fatalErrorsCatalog.ts               # esquema de lições/contexto
│   ├── fatalErrorsEvaluator.ts             # detecção baseada em evidência
│   ├── handHistorySchema.ts                # representação PHH normalizada
│   ├── numericEquity.ts                    # módulo aritmético/Monte Carlo
│   ├── solverAdapter.ts                    # preservar/reusar validadores
│   └── ...módulos existentes preservados
├── app/src/data/
│   └── fatalErrorsCatalog.json
├── worker-python/                          # opcional, somente offline
│   ├── hand_history_import.py
│   └── pokerkit_validation.py
├── docs/
│   ├── AUDITORIA_GTO_VERIFICADO.md
│   ├── ARQUITETURA_E_PLANO.md
│   └── PESQUISA_OPEN_SOURCE_ANTILEAKS.md
└── pipeline/
```

**Banco sugerido:** SQLite para usuários locais e datasets pequenos, DuckDB/Parquet para análise colunar histórica grande; não criar importação automática de grandes ZIPs de 20,3 GB. Segregar armazenamento de dados pessoais e logs de solução.

## Plano incremental recomendado

| Fase | Entrega | Critério para aprovar |
|---|---|---|
| A | Análise de licença, esquema e catálogo da aba | 20 cartões, sem dados GTO inventados, todas as referências rastreáveis |
| B | Nova aba educativa | Interface funcional com filtros, quiz, testes e leitner, sem RTA |
| C | Importação HH e replayer | Fixtures PHH e histórico local; side pots e potes fechando corretamente |
| D | Motor numérico | Equidade exata/Monte Carlo com CIs, validação cruzada e tests |
| E | Solver externo real | Um spot HU flop reproduzido com entrada, solve, arquivo, convergência, JSON e EV verificável |
| F | Auditoria pós-sessão | Detecção condicionada a contextos compatíveis e analytics anti-leaks |

## Fontes principais pesquisadas

- https://github.com/uoftcprg/pokerkit
- https://github.com/uoftcprg/phh-std
- https://github.com/uoftcprg/phh-dataset
- https://zenodo.org/records/17136841
- https://github.com/bupticybee/TexasSolver
- https://github.com/b-inary/postflop-solver
- https://github.com/b-inary/desktop-postflop
- https://github.com/google-deepmind/open_spiel
- https://github.com/datamllab/rlcard
- https://github.com/Ge-limin/poker-engine-ts
- https://github.com/pokerinfra/poker-eval
- https://github.com/jejellyroll-fr/fpdb-3
- https://github.com/ihendley/treys
- https://github.com/poker-apprentice/hand-history-analyzer

**Acompanhamento:** toda atualização que dependa do próprio projeto requer acesso à versão atual do repositório; os relatórios prévios são evidências declarativas, não testes independentes.
