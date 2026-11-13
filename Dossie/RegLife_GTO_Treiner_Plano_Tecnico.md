# Dossiê técnico — RegLife → GTO Trainer pessoal no Antigravity

**Data da pesquisa:** 12/11/2026  
**Canal solicitado:** https://www.youtube.com/@RegLife  
**Status da evidência:** acesso ao índice integral e às transcrições do canal **não confirmado**. O dossiê utiliza materiais públicos verificáveis da RegLife (site e blog), além de propostas técnicas próprias identificadas como tal. Não confunda elementos do catálogo comercial com conteúdo efetivamente visualizado em vídeos.

## 1. Síntese e distinção das fontes

### Confirmado em publicações oficiais da RegLife

1. O ciclo de estudo **ETJ — Estuda, Treina, Joga**, com ênfase em treino deliberado e repetição de spots, é apresentado pela escola. Há menção ao **Reg Life Sim**, ferramenta de treinamento própria. Fonte: https://reglife.com.br/site-2026-sobre/
2. O **Protocolo Micro Stakes (MTT)** prioriza sete categorias: **RFI**, **c-bet IP contra BB no flop**, **c-bet no turn e river IP contra BB**, **versus RFI**, **defesa de BB**, **blind war pré-flop SB vs BB** e **defesa do BB contra c-bet**. Cada spot recebe teoria, explicação causal, explorações e treino. A página menciona 27 treinos, mas estes não foram acessados diretamente. Fonte: https://reglife.com.br/prt/
3. A página oficial sobre **ranges** apresenta as categorias linear, polarizado, condensado e merged, e destaca posição e stack efetivo. Há referência a **216 tabelas pré-flop** (42 RFI e 174 vs RFI, em 14/17/20/30/50/100bb); o link histórico de download não estava funcional nesta pesquisa, portanto não possuímos as matrizes numéricas. Fonte: https://blog.reglife.com.br/ranges/
4. Em **GTO x Explorável**, a escola defende usar a teoria como linha de base para detectar e explorar tendências concretas; também discute consistência de sizing e a diferença entre o melhor EV de uma mão isolada e o equilíbrio de uma estratégia por range. Fonte: https://reglife.com.br/blog/gto-x-exploravel-como-joga-um-profissional/
5. O artigo **Pot Odds** apresenta exercícios de risco e recompensa, cálculos do limiar de call e exercícios de bluff. Fonte: https://reglife.com.br/blog/pot-odds-3-exemplos-praticos-para-turbinar-seus-lucros/
6. O artigo sobre **ICM** trata da diferença entre chipEV e $EV, dos payjumps e de como todos os stacks influenciam as decisões em MTT. Fonte: https://blog.reglife.com.br/icm-o-conceito-mais-importante-para-ganhar-dinheiro-em-torneios-de-poker/
7. No catálogo público do curso **SNG**, são mencionados início/middle/late game, push/fold, resteal, defesa de BB, ICM, risk premium, 3-handed, heads-up, bankroll e nove treinos. Isso descreve **temas**, não a disponibilidade pública das soluções numéricas. Fonte: https://reglife.com.br/sng/
8. A escola classifica ferramentas de estudo em calculadoras de equity, bancos de mãos/trackers e solvers. Fonte: https://reglife.com.br/blog/softwares-de-poker-5-melhores-opcoes-para-iniciantes/

### Recomendações de engenharia, não atribuídas à RegLife

Implementar um GTO Trainer independente com replayer, matriz de 169 mãos, frequências mistas, avaliação por EV loss, banco versionado de soluções, simulação de ICM, telemetria de leaks, repetição espaçada, modo exploit com hipóteses testáveis e ingestão de materiais públicos do canal. Nenhuma dessas implementações específicas foi copiada de software proprietário.

## 2. Limites e regras inegociáveis

- **Treinador de estudo, não assistência em tempo real.** Não sobrepor às mesas, não capturar a tela do poker client durante a sessão, não sugerir jogadas enquanto uma mão real está em andamento e não automatizar decisões/apostas.
- **Sem inventar estratégia:** nenhuma frequência GTO, equity, EV, risk premium ou $EV pode vir de um modelo de linguagem sem cálculo validado ou fonte legítima rastreável.
- **Respeitar direitos:** não copiar cursos pagos, matrizes proprietárias, vídeos, transcrições ou exportações de solvers sem permissão. Ideias de método podem inspirar arquitetura original; a solução numérica precisa ser gerada/licenciada.
- **Não prometer lucro ou invulnerabilidade:** GTO de poker de múltiplos jogadores com várias streets/abstrações é aproximado e dependente das hipóteses (rake, ante, stacks, ranges, sizing, número de jogadores, payout e precisão).
- **Preservar a base existente:** no Antigravity, primeiro inspecionar o repositório atual, stack, migrações, testes e módulos existentes. Não reconstruir do zero desnecessariamente.

## 3. Arquitetura funcional prioritária

### P0 — núcleo correto de treino (entregável antes da expansão)

**A. Motor de mãos e estado de jogo**
- Texas Hold'em NLHE; baralho 52 cartas sem duplicidades; ações válidas para cada street; blinds, antes, posições, stack efetivo, tamanho mínimo de raise, pote, all-in, side pots, multiway.
- Suporte explícito a formato: `MTT`, `SNG`, `CASH`, variante `NLHE`; número de assentos, estrutura de payout, rake no cash, ante e blinds.
- Variáveis imutáveis por decisão: jogadores ativos, suas posições, stacks, cartas expostas, hero hole cards, histórico das ações, street, bordas de elegibilidade para all-in e apostas.

**B. Matriz visual 13×13**
- 169 classes: pares na diagonal, suited acima (ou abaixo) e offsuit no outro triângulo.
- Combos máximos por classe: par 6, suited 4, offsuit 12; total 1.326 combos pré-flop. Reduzir conforme bloqueadores conhecidos; preservar validação de 52 cartas.
- Para cada classe/cenário exibir ações e frequências, p.ex. fold/call/raise pequeno/raise grande/shove (apenas se ação for legal).
- Importação/exportação de JSON e CSV com unidades documentadas; heatmap, filtros de stack e posição; comparação lado a lado GTO versus estratégia do usuário.
- Não preencher percentuais fictícios: caso não haja solução, estado `UNSOLVED`, sem pontuação GTO.

**C. Treinador de decisões**
- Selecionar cenário, apresentar mão e ações válidas, registrar escolha, revelar política de referência **somente após resposta**, explicar lógica e comparar EV.
- Para estratégias mistas, uma ação de frequência positiva não é necessariamente erro. Diferenciar escolha aceitável, baixa frequência e erro caro por `EV_loss`.
- Exibir frequências misturadas, `EV(action)`, `EV(best)` e perda da escolha na mesma unidade (`bb`, `chips`, `$EV`); distribuição de escolhas do jogador em lotes.
- Reamostrar cenários com histórico, evitar treinar só a mesma mão; fallback de aprendizagem conceitual quando não houver solução verificada.

**D. Sete trilhas iniciais**
1. `PREFLOP_RFI`: posição, stacks 14/17/20/30/50/100bb quando houver dados confiáveis; raise size, ante.
2. `FLOP_CBET_IP_VS_BB`: raise first in IP, single-raised pot, textura/pareamento/conectividade/suits do board, stack e sizing.
3. `TURN_RIVER_CBET_IP_VS_BB`: double-barrel, triple-barrel, runouts, nut advantage, blockers, polarização.
4. `PREFLOP_VS_RFI`: fold/call/3-bet/4-bet response, posição, stack, sizing e histórico.
5. `PREFLOP_BB_DEFENSE`: pot odds do BB, ante, multiway e blinds, defesa por origem do raise.
6. `PREFLOP_SB_VS_BB`: limp, iso-raise, RFI, limp/raise, shove/reshove apenas quando relevantes.
7. `POSTFLOP_BB_VS_CBET`: check-call, check-raise, check-fold e runouts.

Cada trilha possui **quatro telas**: teoria curta, por quê, exploit sob hipótese específica e treino com feedback. Esta ordem é uma adaptação da estrutura publicada, sem reproduzir as aulas.

### P1 — aprofundamento avançado

**E. Matemática e visualização de EV**
- `pot_odds_required = call / (pot_before_bet + opposing_bet + call)` para call que realiza equity integral, ignorando rake e futuras decisões. Ex.: pote 10, aposta 5, call 5 ⇒ 25%.
- `bluff_fold_equity_breakeven = bet / (pot_before_bet + bet)` para blefe puro, zero equity quando pago, sem outras contribuições; ex.: aposta 5 em pote 10 ⇒ 33,33% folds.
- `MDF = pot_before_bet/(pot_before_bet + bet)` só no modelo simplificado de defesa contra blefes puros; não transformar em mandamento universal.
- Treinos de outs, equity exata versus ranges, pot odds, implied odds, reverse implied odds, blockers e equity realization. Regra `x4/x2` é **aproximação didática**, não substituto da equity e depende do número de cartas ainda por vir.
- Explicações separadas para `chipEV`, `bbEV`, `$EV`; não misturar as métricas.

**F. ICM e situações de pressão de premiação**
- Para SNG/MTT perto dos payjumps, receber *todos* os stacks relevantes e vetor de prêmios; calcular probabilidades de posições por modelo ICM e `ICM_EV` antes/depois de cenários.
- Treinar bolha, ITM, short-handed, FT, 3-handed, heads-up, push/fold, call de shove, resteal, overcalls e multiway all-in.
- `risk_premium` e `bubble_factor` devem ser calculados por modelos documentados e mostrar hipóteses. ICM padrão não representa perfeitamente efeitos de habilidade, future game e formato bounty.
- Para **PKO**, projetar engine separado que considere bounty; não simular PKO usando payout puro de ICM e chamá-lo de GTO.

**G. Solver e gestão de soluções**
- Criar interface `StrategyProvider` com implementações `ImportedVerifiedSolution`, `SolverAdapter` e `NoSolution`.
- Postflop: considerar um adaptador para solução local com **TexasSolver** ou outro motor equivalente validado, sujeito à licença e compatibilidade; conferir AGPL-3.0 antes de distribuir/servir código. O TexasSolver oferece exportação de estratégia para JSON, segundo seu README. Não assumir que um motor de pós-flop resolve automaticamente preflop ou MTT multiway/ICM completo.
- Para motor de estado e avaliação de mãos em stack Python, avaliar **PokerKit** (biblioteca MIT para simulação/avaliação), respeitando a arquitetura atual. PokerKit não é solver GTO.
- Importação de resultados verificáveis, com check de soma de frequências, versões da árvore, sizings permitidos, tolerância, report de convergência, identificação do modo chipEV/ICM e hash do arquivo.
- UI sempre expõe `Fonte: solver X / arquivo Y`, data, rake, número de jogadores, ranges iniciais, stacks, árvore e precisão. Políticas fora dessas hipóteses são inválidas para pontuação GTO.

**H. Replayer e leaks**
- Importar históricos de mãos fornecidos pelo usuário ou provenientes de plataformas em conformidade com os termos aplicáveis.
- Parser modular de hand histories, normalização, deduplicação, reconstrução street by street e validação de side pots.
- Leaks por posição, stack, spot, board, sizing e street; estatísticas como VPIP/PFR/3-bet e fold/c-bet apenas quando definidas corretamente e amostra informada.
- Separar `desvio da solução` de `erro comprovadamente custoso`; não atribuir stats com amostras pequenas a certeza exploratória.
- Gerar lista de exercícios personalizados a partir de erros recorrentes, ponderando frequência do spot e impacto em EV.

### P2 — evolução orientada por dados

**I. Modo exploit com hipóteses**
- Perfil do adversário/field importado (posição, amostra, definição da estatística, período/limites, viés da amostra).
- Comparar estratégia base GTO vs cenário exploratório, mantendo a fonte dos ranges ou da simulação.
- UI explica: `observação`, `tamanho da amostra`, `hipótese`, `resposta candidata`, `mudança estimada de EV` e `risco de contraexploração`.
- Quando não houver dados, modo exploit se limita a exercícios hipotéticos claramente rotulados, sem afirmar tendências populacionais reais.

**J. Plano personalizado de estudo**
- ETJ adaptado a um treinador: **Aprender → Treinar → Revisar**; registrar tempo, acertos, EV loss e consistência.
- Repetição espaçada sugerida 1/3/7/14/30 dias e algoritmo adaptativo por retenção. Isto é uma proposta do projeto, não uma cadência declarada pela RegLife.
- Dashboard de progresso por sete trilhas; priorizar fraquezas = frequência do spot × perda média de EV × baixa confiança no domínio.
- Revisão semanal, metas de processo (sessões de treino, spots dominados), sem prometer rentabilidade.

**K. Canal RegLife como fonte de conhecimento vivo (quando acessível)**
- Usar YouTube Data API para identificar canal e playlist de uploads, paginar `playlistItems.list` e coletar metadata `videos.list`: título, URL, data de publicação, descrição, duração, tags.
- Importar transcrições *somente* por meios permitidos e disponíveis (por exemplo, conteúdo que o usuário legitimamente disponibilize, ou ferramenta autorizada). A API oficial de captions não garante download de legendas de vídeos de terceiros.
- Produzir notas originais por vídeo com: `vídeo`, `url`, `timestamp`, `tema`, `situação`, `variáveis`, `insight`, `tipo de evidência`, `teste proposto` e `ação de engenharia`.
- Separar `fato apresentado no vídeo`, `heurística do apresentador`, `resultado de solver demonstrado` e `interpretação do agente`; exigir revisão humana para transformar heurística em regra de treino.
- Não usar transcrições publicadas sem direitos como corpus reembalado; registrar apenas resumos e proposições de estudo com origem.

## 4. Modelo de dados recomendado

```json
{
  "spot_id": "mtt_rfi_btn_30bb_v1",
  "spot_type": "PREFLOP_RFI",
  "format": "MTT",
  "variant": "NLHE",
  "players_initial": 8,
  "street": "PREFLOP",
  "hero_position": "BTN",
  "hero_cards": ["As", "Kd"],
  "effective_stack_bb": 30,
  "ante_bb_per_player": 0.125,
  "pot_bb": null,
  "legal_actions": ["fold", "raise_2bb", "raise_2_3bb"],
  "reference_strategy": {
    "status": "UNSOLVED",
    "action_frequencies": null,
    "action_ev_bb": null,
    "solution_source": null,
    "assumptions_hash": null
  },
  "lesson": {
    "concepts": ["RFI", "posicao", "stack_efetivo"],
    "interpretation_source": "https://reglife.com.br/prt/"
  }
}
```

**Importante:** esse JSON é só um esquema ilustrativo, **não** uma solução válida do spot. Variáveis de pote, antes, estrutura e ações exigem validação pelas regras; ações e sizings reais devem ser derivados do state engine. `null` evita fabricar dados.

Tabelas/entidades sugeridas: `scenarios`, `game_states`, `actions`, `strategy_solutions`, `solution_assumptions`, `lesson_cards`, `training_attempts`, `user_leak_metrics`, `hand_histories`, `source_registry`, `video_insights`. Usar IDs estáveis, hashes e migrações.

## 5. Critérios de aceite e testes

1. Grade 13×13 totaliza 169 classes; todas as combinações físicas totalizam 1326 (pares 78, suited 312, offsuit 936).
2. Nenhum estado permite carta duplicada, pote negativo, ação ilegal, stack negativo ou call maior que o necessário para equiparar efetivamente a aposta sem tratar side pots.
3. Toda política **resolvida** possui frequências válidas (`0..1`) com soma 1 dentro da tolerância por mão e estado; resultados sem dados são **UNSOLVED**.
4. Tester de pot odds: `P=10,B=5,C=5` ⇒ equity limiar `0,25` apenas sob hipóteses simplificadoras.
5. Tester de bluff: `P=10,B=5` ⇒ fold equity de equilíbrio `1/3` para blefe sem equity quando pago.
6. Ranges com bloqueadores removem combos de maneira correta.
7. ICM: com quatro stacks iguais e premiação `[500, 300, 200, 0]` (total 1000), cada jogador deve valer 250 antes das ações, por simetria. A soma dos valores ICM deve ser igual ao prize pool definido, respeitadas as hipóteses do modelo.
8. Mostrar `bbEV` apenas para estratégia chipEV e `$EV` apenas para avaliação monetária em contexto de torneio; comparar métricas somente quando convertidas com método rastreável.
9. Evitar chamar qualquer política incompleta, manual ou gerada por IA de GTO.
10. Testes de regressão para importação, repetição espaçada, reconstrução de mão, versionamento de resultados e reprocessamento de fonte.
11. Exibir lembrete de uso **apenas fora de sessões reais**, sem assistência em tempo real.
12. A primeira entrega deve conter ao menos um treino funcional com **dados de teste claramente didáticos** e um fluxo separado que valide soluções reais importadas.

## 6. Sequência recomendada de implementação no Antigravity

**Etapa 0 — Auditoria:** ler README, estrutura do projeto, package manifests, banco/migrações, frontend, backend, testes e issues; gerar mapa do que já funciona e o que falta.

**Etapa 1 — Núcleo:** consertar/integrar state engine, range editor 13×13, normalização de spot e esquema da base de soluções. Cobertura de testes obrigatória.

**Etapa 2 — Trilhas MTT:** criar o currículo das sete áreas, explicações e drills originais; integrar importação de políticas verificadas; montar score por EV loss sem dados fictícios.

**Etapa 3 — Pós-flop:** replayer, boards e texturas, adapters de solver e cenários de c-bet; validar tree/assumptions.

**Etapa 4 — Torneios:** ICM, push/fold, final table; exportação de estudos e perfil de leaks.

**Etapa 5 — Conteúdo:** pipeline público de vídeos do RegLife e outros canais legais, com fontes verificáveis e revisão; nunca usar transcrição ausente como se tivesse sido vista.

**Etapa 6 — Qualidade:** testes end-to-end, instrumentação e documentação detalhada em português, com instruções para executá-lo no Antigravity.

## 7. Fontes e limites da pesquisa

- Canal solicitado: https://www.youtube.com/@RegLife — **lista integral/transcrições não acessíveis nesta sessão**.
- Escola/método ETJ: https://reglife.com.br/site-2026-sobre/
- Protocolo MTT e sete spots: https://reglife.com.br/prt/
- Ranges e menção às 216 tabelas: https://blog.reglife.com.br/ranges/ — download histórico não funcional em 12/11/2026.
- GTO x exploit: https://reglife.com.br/blog/gto-x-exploravel-como-joga-um-profissional/
- Pot odds: https://reglife.com.br/blog/pot-odds-3-exemplos-praticos-para-turbinar-seus-lucros/
- ICM: https://blog.reglife.com.br/icm-o-conceito-mais-importante-para-ganhar-dinheiro-em-torneios-de-poker/
- SNG e fases: https://reglife.com.br/sng/
- Ferramentas: https://reglife.com.br/blog/softwares-de-poker-5-melhores-opcoes-para-iniciantes/
- Padrões da YouTube API: https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list e https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- Opcional: TexasSolver https://github.com/bupticybee/TexasSolver — licença AGPL-3.0, verificar compatibilidade antes de integrar.
- Opcional: PokerKit https://github.com/uoftcprg/pokerkit — licença MIT; engine de simulação, não solver GTO.

**Fim do dossiê.**
