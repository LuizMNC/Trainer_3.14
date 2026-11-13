# Extração aprofundada — canal RegLife → GTO Trainer no Google Antigravity

**Atualizado em 12/11/2026**  
**Origem:** [YouTube @RegLife](https://www.youtube.com/@RegLife) · canal `UCVqx1385YLBq1N1Cc9WfVjQ`  
**Evidência:** consulta a vídeos públicos e às transcrições acessíveis via vidIQ; o canal aparece com 600 vídeos no índice consultado. Foram identificados todos os 18 vídeos da série de junho/2026 e **15 transcrições da série** foram acessadas. As aulas 01, 07 e 08 não tiveram transcrição disponível nesta pesquisa, embora os metadados apareçam. Foram lidas ainda 7 transcrições complementares. **Não equivale a assistir a todos os ~600 vídeos**, nem dá acesso aos ranges da plataforma proprietária. A lista de datas e links pode ser processada pelo aplicativo a partir de `RegLife_catalogo_videos_para_GTO.json`.

## 1. Principal descoberta e prioridade

A série **Spot 01/18 a 18/18** aborda um currículo de MTT que cobre RFI por posição, short stack, C-bet flop/turn/river, 3-bet, defesa BB, blind war, potes multiway, defesa IP vs C-bet, PKO, Vanilla e ICM. Esse conjunto fornece uma **taxonomia pedagógica**, não um pacote de soluções matemáticas para copiar. Os títulos publicados dos spots 07 e 08 dizem `/20`; é uma discrepância dos próprios títulos dentro da sequência, e não prova de 20 episódios distintos.

**Distinção determinante:** no [Spot 02 aos ~21 minutos](https://www.youtube.com/watch?v=8TlB6tdjaGQ&t=1260s) e [Spot 04 aos ~6 minutos](https://www.youtube.com/watch?v=XhPmzrQhFlY&t=380s), instrutores descrevem o trainer da escola como instrumento de **fixação de aula**, não como solver que apresenta todos os números de EV. Portanto, sua aplicação deve ter dois modos: `DRILL_PEDAGOGICO` para revisar uma heurística explicada e `GTO_VERIFICADO` para avaliar frequências e EV obtidos de solução real.

## 2. Índice de 18 spots, com atribuição verificável

| Spot | Vídeo e fonte | Tema de implementação | Situação da transcrição |
|---|---|---|---|
| 01 | [Quais mãos ABRIR em cada POSIÇÃO no poker?](https://www.youtube.com/watch?v=_Wl17geMXmc) | RFI por posição | indisponível |
| 02 | [Como jogar com poucas fichas no poker](https://www.youtube.com/watch?v=8TlB6tdjaGQ) | RFI short stack | analisada |
| 03 | [Como SIMPLIFICAR sua estratégia de Continuation Bet no poker](https://www.youtube.com/watch?v=MDqwP3-j1wk) | C-bet flop IP vs BB | analisada |
| 04 | [Quando continuar apostando no TURN?](https://www.youtube.com/watch?v=XhPmzrQhFlY) | Double barrel turn | analisada |
| 05 | [A ARTE de apostar no RIVER](https://www.youtube.com/watch?v=bmN0dwGdWSE) | River e polarização | analisada |
| 06 | [Range Linear ou Polarizado? Aprenda de Uma Vez](https://www.youtube.com/watch?v=XD0Y_ZeNSKk) | Vs RFI / 3-bet | analisada |
| 07 | [Como dominar a posição mais LUCRATIVA do poker](https://www.youtube.com/watch?v=teUFXaRa27E) | Posição (tema a validar) | indisponível |
| 08 | [O Guia Definitivo do Small Blind](https://www.youtube.com/watch?v=CUNOCNobeZo) | Small Blind | indisponível |
| 09 | [O ERRO MAIS CARO do poker está no BIG BLIND](https://www.youtube.com/watch?v=XFedj2lGVag) | Defesa BB vs RFI | analisada |
| 10 | [O spot que MAIS CONFUNDE jogadores de poker](https://www.youtube.com/watch?v=wcOJ7SiU67A) | Blind War / SB | analisada |
| 11 | [O que fazer do Big Blind quando tomar uma C-Bet](https://www.youtube.com/watch?v=rSJlFHUlIQE) | Defesa BB vs C-bet | analisada |
| 12 | [O erro silencioso dos potes MULTIWAY](https://www.youtube.com/watch?v=3rQpUIKUUgc) | Multiway pré-flop/BB | analisada |
| 13 | [Um erro aqui custa CARO](https://www.youtube.com/watch?v=qGBrI6k9JDg) | Resposta a 3-bet | analisada |
| 14 | [O maior LUCRO do poker vem DAQUI](https://www.youtube.com/watch?v=LWmqhJqCIcw) | Vs C-bet em posição | analisada |
| 15 | [Como ajustar seus ranges para torneios PKOs](https://www.youtube.com/watch?v=7DQn3EMEwCA) | PKO RFI | analisada |
| 16 | [Como ajustar seus OPEN RAISES em torneios Vanilla](https://www.youtube.com/watch?v=uHVh5p-KGeI) | Vanilla RFI / ICM | analisada |
| 17 | [Como enfrentar open raises em PKOs](https://www.youtube.com/watch?v=gH3KxLljdts) | PKO vs RFI | analisada |
| 18 | [O Erro de ICM Que Está Custando Seu Lucro](https://www.youtube.com/watch?v=hE4XL3gMEls) | ICM / vs RFI | analisada |

### Aulas 01, 07 e 08

O índice lista esses três vídeos, mas a extração de legendas retornou indisponibilidade. Os módulos sugeridos a partir do título são **hipóteses de categorização**, não conhecimento extraído da fala dos professores. Não preencher o banco de heurísticas com conteúdo atribuído a essas três aulas sem verificação posterior.

## 3. Regras de poker identificadas nas transcrições — e sua tradução em software

### 02 — Open raise short stack
- **Base do conteúdo:** RFI com poucas fichas, shove, fold e alternativas de abertura, não apenas a força nominal da mão. O treino relaciona posição e stack; a aula cita o objetivo de reforçar conhecimento em vez de exibir EV de solver ([~20:55](https://www.youtube.com/watch?v=8TlB6tdjaGQ&t=1255s)).
- **Implementação:** `stack_bb`, `hero_position`, `players_left_to_act`, `ante`, `open_size`, `legal_actions`, `cEV_or_ICM`; testes para 8–25 BB apenas onde existirem soluções verificadas.

### 03 — C-bet flop IP vs BB
- **Base do conteúdo:** frequência da C-bet depende da textura do board e da distribuição dos ranges. Early position chega a certos flops com range mais forte do que BTN; boards médios permitem maior mistura de check e bet. Instrutor comenta que diferenças mínimas de EV podem justificar simplificação de sizing ([~3:45](https://www.youtube.com/watch?v=MDqwP3-j1wk&t=225s)).
- **Implementação:** `board_texture`, `range_advantage`, `nut_advantage`, `bet_size_tree`; painel "simplificação" com `EV_size_optimal - EV_size_simplified`. Não transformar "apostar 1/3" em regra geral.

### 04 — Turn barrel após C-bet e call
- **Base do conteúdo:** separar valor forte, bluff candidato e showdown médio; levar em conta cartas do turn, draws, blockers e possibilidade de realização de equidade ([~8:35](https://www.youtube.com/watch?v=XhPmzrQhFlY&t=515s)).
- **Implementação:** categorias de equidade e blockers, árvore flop→turn→river e quizzes de continuação vs check; frequência e EV devem vir de solver válido.

### 05 — River
- **Base do conteúdo:** river pode ser altamente polarizado, com apostas grandes em muitos spots. Blefes preferem o fundo do range e blockers de mãos fortes adversárias; valor depende do range que **paga** a aposta, não do range total ([~3:10](https://www.youtube.com/watch?v=bmN0dwGdWSE&t=190s), [~4:30](https://www.youtube.com/watch?v=bmN0dwGdWSE&t=270s)).
- **Implementação:** `river_bluff_candidate_score` como **explicação heurística**, calculado de rank relativo de showdown, blocker/unblocker e range de call. Resultado de blefe NÃO pode ser declarado GTO só pela pontuação heurística.

### 06 — Ranges lineares/polarizados e Vs RFI
- **Base do conteúdo:** exemplos de 3-bet por valor e blefe, blockers e profundidade alterando size de 3-bet. Posição e jogabilidade influenciam call e 3-bet ([~1:40](https://www.youtube.com/watch?v=XD0Y_ZeNSKk&t=100s)).
- **Implementação:** editor de ranges `linear`, `polarized`, `condensed`, `merged` como categorização explicativa; ações `fold/call/3bet/4bet/jam` e múltiplos sizings com EV.

### 09 — Defesa do Big Blind
- **Base do conteúdo:** odds de defesa, mãos suited, Axs, bloqueadores, stacks efetivos e diferença chipEV/ICM. O vídeo inclui treinamento de frequências mistas de call/3-bet ([~3:10](https://www.youtube.com/watch?v=XFedj2lGVag&t=190s), [~7:00](https://www.youtube.com/watch?v=XFedj2lGVag&t=420s)).
- **Implementação:** matriz de defesa por posição do agressor, size de open, 15/25/50/100 BB quando solucionados; separar `call`, `3bet`, `jam` e perdas de EV.

### 10 — Blind War pré-flop
- **Base do conteúdo:** range SB vs BB é muito amplo em vários cenários; primeiro eliminar as ações inviáveis, depois comparar limp/raise/shove e riscos segundo stacks. Instrutor apresenta referências pessoais de 3,5x/3x/2,5x que **não devem virar padrão universal GTO** ([~1:20](https://www.youtube.com/watch?v=wcOJ7SiU67A&t=80s)).
- **Implementação:** modos `SB_FIRST_IN`, `BB_VS_SB_LIMP`, `BB_VS_SB_RAISE`, `SB_VS_ISO`, com árvore de sizings configurável.

### 11 — BB versus C-bet
- **Base do conteúdo:** distinguir pares, duas overcards, gutshots, OESD e flush draws; escolher check-call, check-raise ou fold sob diferentes sizings e ranges; separar raise por valor de semiblefe ([~0:10](https://www.youtube.com/watch?v=rSJlFHUlIQE&t=10s), [~1:20](https://www.youtube.com/watch?v=rSJlFHUlIQE&t=80s)).
- **Implementação:** classificador de made hand e draws, ferramenta de equity, análise de blockers e defesa pós-flop por sizing; "não foldar nenhum draw" é simplificação de aula, não dogma.

### 12 — Multiway
- **Base do conteúdo:** BB contra raiser e caller muda odds e realização de equidade; destaque para squeeze e força das ranges que entram na mão. Defesa contra caller de posições iniciais é diferente da defesa contra posições finais ([~1:20](https://www.youtube.com/watch?v=3rQpUIKUUgc&t=80s), [~12:00](https://www.youtube.com/watch?v=3rQpUIKUUgc&t=720s)).
- **Implementação:** múltiplos adversários, side pots, ordem de ações, ranges condicionais; backend multiway separado de solver heads-up.

### 13 — Resposta a 3-bet
- **Base do conteúdo:** fora de posição, a jogabilidade de combos offsuit tende a piorar; suiteds e pares podem defender de forma distinta. Existem calls, 4-bets e shoves dependentes de efetivo e posição ([~0:45](https://www.youtube.com/watch?v=qGBrI6k9JDg&t=45s)).
- **Implementação:** subárvore `RFI → 3BET → 4BET / CALL / FOLD` com sizing, SPR e composição do range original.

### 14 — Defender C-bet em posição
- **Base do conteúdo:** ponto de partida é um estado pós-flop definido, mesmo se o usuário normalmente teria jogado diferente pré-flop; força relativa da mão, tamanho da aposta e backdoors moldam call/fold/raise ([~0:20](https://www.youtube.com/watch?v=LWmqhJqCIcw&t=20s)).
- **Implementação:** motor pode instanciar cenários condicionais de uma árvore, sem exigir que a trajetória anterior seja reproduzida pela estratégia pessoal. Marcar as hipóteses do histórico.

### 15 — PKO RFI
- **Base do conteúdo:** quanto mais stacks à esquerda o herói cobre, maior tende a ser o incentivo de disputar bounties, mas há interações com a possibilidade de defender contra 3-bets. A aula explicita que ranges PKO dependem de quem está à esquerda ([~0:15](https://www.youtube.com/watch?v=7DQn3EMEwCA&t=15s)).
- **Implementação:** vetor `stack_per_seat`, `bounty_per_seat`, `bounty_type`, `payout_structure`, `position`; regra de negócio não pode usar apenas effective stack e valor do bounty do abridor.

### 16 — Vanilla RFI e ICM
- **Base do conteúdo:** ao contrário do PKO, cobrir jogadores à esquerda não gera incentivo monetário direto de bounty. ICM pode restringir opens e bet-calls ([~2:00](https://www.youtube.com/watch?v=uHVh5p-KGeI&t=120s), [~7:15](https://www.youtube.com/watch?v=uHVh5p-KGeI&t=435s)).
- **Implementação:** comparar `same_table_state` em `CHIP_EV`, `VANILLA_ICM` e `PKO` (somente com modelos matemáticos adequados) e exibir como `RFI frequency`, `risk_premium` e EV variam.

### 17 — Versus open em PKO
- **Base do conteúdo:** agressor coberto por todos pode abrir mais tight; agressor que cobre todos pode abrir mais wide. Incentivos para reagir dependem dos jogadores que ainda podem agir e seus stacks ([~0:15](https://www.youtube.com/watch?v=gH3KxLljdts&t=15s), [~2:00](https://www.youtube.com/watch?v=gH3KxLljdts&t=120s)).
- **Implementação:** construtor de defesa vs RFI com ranges condicionais por `covered_by_hero`, `hero_covered_by`, `players_behind`, `bounty`; não reaproveitar chart Vanilla.

### 18 — ICM e estratégias mistas
- **Base do conteúdo:** vídeo mostra situações além do início do torneio, inclusive `50% left`; em um exemplo isolado, instrutor lê uma solução com aproximadamente **71% call e 29% raise** e EV muito semelhante entre as ações ([~1:20](https://www.youtube.com/watch?v=hE4XL3gMEls&t=80s), [~2:40](https://www.youtube.com/watch?v=hE4XL3gMEls&t=160s)). Essa porcentagem não é universal e **não deve ser importada como estratégia genérica**.
- **Implementação:** solver-backed trainer deve mostrar `freq_by_action`, `EV_by_action`, `is_mixed`, `context_hash`, `source_solution_id`, `ICM_stage`. Distinguir "ação com frequência menor" de "ação com EV substancialmente inferior".

## 4. Conteúdos adicionais relevantes fora da série

| Vídeo | Conteúdo verificado e tradução técnica |
|---|---|
| [O robô que venceu os melhores do mundo…](https://www.youtube.com/watch?v=OhSfmpjRgg8) | Enfatiza **consolidar a própria estratégia antes de explorar**, usando Libratus como analogia ([~2:20](https://www.youtube.com/watch?v=OhSfmpjRgg8&t=140s)); gerar painel "leaks meus" antes de "exploits do field". A interpretação histórica é do palestrante; não prova de que Libratus jamais explorou tendências. |
| [O jeito certo de blefar](https://www.youtube.com/watch?v=7BSZPyqKUHI) | Introduz MDF e frequência ótima de blefe em heads-up river ([~1:05](https://www.youtube.com/watch?v=7BSZPyqKUHI&t=65s), [~3:10](https://www.youtube.com/watch?v=7BSZPyqKUHI&t=190s)); criar calculadoras interativas com hipóteses explícitas. |
| [Você está errando no PKO](https://www.youtube.com/watch?v=zzviYVuIk5o) | Cobertura, bounty, EV de continuar no torneio, fase e agressividade ([~0:10](https://www.youtube.com/watch?v=zzviYVuIk5o&t=10s)); converter heurísticas em exercícios conceituais, não em fórmula universal do bounty. |
| [Dois softwares para estudar](https://www.youtube.com/watch?v=bsBVa-tQE7g) | O vídeo menciona **HRC (Holdem Resources Calculator)** para soluções pré-flop/multiway e **GTO Wizard** em pós-flop heads-up; usar como referência de separação de motores, sem inferir licenças ou integrações oficiais. |
| [Do open raise ao ICM](https://www.youtube.com/watch?v=0KWMp6iTIBU) | Raciocínio de expectativa de retorno, não "ganhar por glória"; exercícios com $EV, payouts e final tables ([~0:15](https://www.youtube.com/watch?v=0KWMp6iTIBU&t=15s)). |
| [RTA, IA e trapaceiros](https://www.youtube.com/watch?v=jYlP-mJcjUg) | Define RTA e critica seu uso em jogo real ([~0:15](https://www.youtube.com/watch?v=jYlP-mJcjUg&t=15s)); estruturar controles para **estudo offline/replay**, jamais overlay em mesas ativas. |
| [Conceito que todo jogador precisa entender](https://www.youtube.com/watch?v=In1WBxeHEn8) | Exemplos de VPIP e randomização de frequências ([~1:00](https://www.youtube.com/watch?v=In1WBxeHEn8&t=60s), [~5:40](https://www.youtube.com/watch?v=In1WBxeHEn8&t=340s)); criar randomizador reproduzível por seed, registro de amostra, e exigir amostras suficientes para exploitive stats. |

## 5. Especificação funcional proposta para seu software

### Modos independentes

1. **Estudo conceitual:** cenário, 2–4 conceitos, quiz com justificativa; não requer solução numérica.
2. **Drill GTO verificado:** estado completo, range do herói e do adversário, política mista e EV por ação importados de solver ou geração própria validada.
3. **Drill de simplificação:** escolher política com sizings reduzidos e comparar `ΔEV` sob a MESMA árvore/hipóteses de solver; qualquer quantificação precisa de re-solve quando a árvore muda de forma material.
4. **ICM/PKO:** stacks de toda a mesa, payout, bounty e fase; processar $EV por modelo apropriado; nunca igualar bounty bruto a stack sem contextualização.
5. **Review offline:** histórico de mãos, reconstrução legal do estado, categorização dos leaks, treino adaptativo. Desabilitar análise assistiva em mesas em andamento.

### Motor de dados: contrato mínimo

`Solution` deve conter: `format`, `variant`, `table_size`, `ante`, `blinds`, `rake`, `hero_position`, `players` (stacks por assento), `payouts`, `bounties`, `street`, `board`, `hero_hand`, `preflop_history`, `pot`, `to_call`, `action_tree`, `ranges`, `frequencies`, `EVs`, `unit`, `solver_name`, `solver_version`, `abstraction`, `tolerance`, `created_at`, `license`, `source_hash` e `validation_status`.

O banco não deve ter `GTO_CORRECT` se `validation_status != VERIFIED`. Uma heurística de vídeo deve ter `evidence_type = VIDEO_CONCEPT` e seus próprios `video_id`, `timestamp`, `paraphrase`, `confidence`; **jamais transformar transcrição em frequências GTO**.

### Matemática verificável (cenário simples de river, heads-up, sem rake nem side pot)

Com pote anterior à aposta `P` e bet do agressor `B`, em caso de call:
- **Pot odds para caller:** `equity_min = B/(P+2B)` (pressupõe realização integral da equidade, sem ações futuras).
- **Fold equity para blefe puro:** `FE_breakeven = B/(P+B)` se a aposta perde sempre quando recebe call.
- **MDF idealizada:** `MDF = P/(P+B)` para neutralizar blefes com zero equity, desconsiderando exceções de range e estratégias futuras.
- **Fração de blefes no range de apostas polarizado do river:** `bluffs/(bluffs+value) = B/(P+2B)` no modelo simplificado de bluff-catcher indiferente.

Exemplos: `P=20, B=10` dá `equity_min=25%`, `FE_breakeven=33,33%`, `MDF=66,67%`, `bluff_fraction=25%`. `P=100, B=100` dá `equity_min=33,33%`, `MDF=50%`, `bluff_fraction=33,33%`. **Não aplicar estas fórmulas sem ressalvas a multiway, ICM, PKO, rake, calls com realização incompleta ou árvores multi-street.**

### Métricas de treinamento

- `EV_loss(action) = max(EV(legal_actions)) - EV(action)` na MESMA unidade e cenário.
- `frequency_alignment` em blocos de decisões, comparando frequência empírica de escolha com política verificada e tamanho amostral.
- `worst_spots_by_loss`, `missed_value_bets`, `overbluff`, `underdefend_bb`, `bad_3bet_size`, `ICM_call_errors`, `PKO_coverage_errors`.
- `confidence_interval` ou indicador de amostra para não superinterpretar acertos em poucos exercícios.
- `spaced_repetition`: reexibir situações com perda alta, mas permitir treinar por tema e stack.
- `provenance_completeness`: percentual de cenários com solução válida, para não misturar quizzes explicativos com avaliação GTO.

### UX de uma questão

1. Mostrar mesa simulada, posições, fichas, antes, blinds, fase, payout/bounties quando aplicável, tamanho do pote e linha de ações.
2. Usuário decide fold/call/raise sizing/jam, sem enxergar a política referência.
3. Mostrar após resposta: política mista, EV das ações se VERIFIED, `EV_loss`, categoria do erro, explicação do range e referência.
4. Oferecer replay, comparação de ranges e "por que uma alternativa é aceitável"; destacar quando `EV_loss` é pequeno, independentemente de frequência.
5. Gravar decisão, contexto e tempo de resposta em histórico local.

## 6. Roteiro de engenharia (Antigravity)

**Etapa 0 — Auditoria do repositório.** Detectar frontend/backend, persistência, motor de mãos e testes; preservar funcionalidades e escolher migrações mínimas.

**Etapa 1 — RFI + matriz 13×13.** Estado válido e importação de soluções verificadas. Começar por chipEV pré-flop. Sem soluções: usar apenas exercício pedagógico.

**Etapa 2 — Pré-flop completo.** Vs RFI, BB, SB, 3-bet, response to 3-bet, short stack, squeezes e multiway conforme suporte de cálculo.

**Etapa 3 — Pós-flop.** C-bet flop/turn/river, BB vs C-bet, defesa IP, textura de board, blockers, ranges e abstração de sizing.

**Etapa 4 — Situações de torneio.** Vanilla ICM, risk premium, payouts, PKO bounties, stacks cobridores; solver ou simulador com premissas auditáveis.

**Etapa 5 — Replayer e personalização.** Importar histórico offline, medir leaks, repetição espaçada, rankings, currículo e recomendações.

**Etapa 6 — Validação.** Testes de regras do Hold'em, soma de probabilidades por estado, nenhuma carta duplicada, nenhuma ação ilegal, EVs na mesma unidade, ICM com conservação de probabilidades, comparação com casos de referência e testes UI.

## 7. Integração de fontes sem copiar o produto de terceiros

- Guardar link e timestamps de cada vídeo e paráfrases próprias; não hospedar transcrições integrais ou conteúdo pago sem licença.
- Não copiar identidade visual, marca, design nem banco proprietário RegLife/GTO Wizard/HRC.
- **Não transcrever as heurísticas como verdade universal**, pois variam com stacks, fases, jogos, ranges e árvore de ações.
- Registrar licença/termos de ferramentas externas antes de integrar APIs ou código; considerar requisitos GPL/AGPL na avaliação jurídica.
- Restringir a aplicação a estudo independente e pós-sessão, sem orientação de decisões em tempo real.

## 8. Checklist de aceite

- [ ] Todas as 18 aulas estão no catálogo com URL; 15 marcadas com transcrição acessível, 3 só metadados.
- [ ] Sete vídeos complementares registrados com links.
- [ ] Conteúdo transcrito tratado como **didática**, não importação de resultados GTO.
- [ ] Cada spot instanciado inclui posições, stacks, ante, payout, bounties, rake e árvore correspondente quando aplicáveis.
- [ ] UI apresenta ações legalmente disponíveis e não permite cartas repetidas.
- [ ] Frequências de referência somam 100% (tolerância configurada); soluções ausentes exibem `UNSOLVED`.
- [ ] EV e ΔEV mostram unidade; não se confundem chips com $EV.
- [ ] Painel de "simplificação" compara EV de soluções corretamente reavaliadas.
- [ ] Módulos PKO e ICM não são simulados com a mesma solução de chipEV.
- [ ] Importação de mãos só para revisão offline e treino.
- [ ] Dados locais e backups preservados nas migrações; testes automatizados aprovados.

**Referência adicional:** o arquivo anterior `RegLife_GTO_Treiner_Plano_Tecnico.md` complementa a pesquisa com fontes oficiais da escola e uma arquitetura inicial. Este documento **substitui a seção de limitação de acesso às transcrições** daquele relatório, já que o vidIQ passou a disponibilizar a amostra descrita acima.
