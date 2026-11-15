# Fase 2B — Replayer visual interativo

Data da execução: 13/11/2026, America/Fortaleza. Alguns artefatos registram 14/11 em UTC, que corresponde à mesma sessão local. Os instantes de ingestão dos exemplos são os produzidos pelo importador; não foram usados como datas das mãos.

**Resultado:** Fase 2B implementada e disponível para homologação. O replayer consome `CanonicalHand` 1.0.0, possui validação runtime, perspectivas temporais, controles interativos e entrada de JSON local. Não foi iniciada a Fase 2C. Este documento registra implementação e verificações desta execução, sem substituir uma homologação técnica independente.

## 1. Auditoria inicial e preservação

Foram examinados os relatórios `CODEX_FASE2A_BANCO_MAOS.md` e `CODEX_FASE2A_HOMOLOGACAO.md`, o esquema e adaptador TypeScript, `importer.py`, a persistência/CLI e fixtures Python, além da navegação e componentes visuais existentes. Os relatórios anteriores orientaram os limites; as evidências novas abaixo vêm da leitura dos arquivos, comparação de hashes e execução atual dos testes.

Pontos determinantes encontrados no contrato:

- `players[].holeCards` é um agregado final; não representa conhecimento disponível desde o início.
- O board de cada snapshot é a fonte do frame; `ending.board` não pode preencher frames anteriores.
- `potAtoms` inclui as apostas pendentes em `betsAtoms`.
- `pots` representa a liquidação final, sem camadas intermediárias por evento.
- Operações de identificação de devolução, destinação de prêmio e crédito no stack não são pagamentos adicionais a reaplicar.
- Posição e assento podem estar ausentes ou inferidos. A ordem canônica deve ser preservada.

O Git já continha trabalho das fases anteriores. Antes da implementação, foram registrados HEAD, status e hashes de **146 arquivos preexistentes** em [baseline.json](fase2b-evidencias/baseline.json). O controle usa esse snapshot, pois comparar somente com HEAD confundiria mudanças anteriores com esta fase.

Na conferência final, **144 desses arquivos permanecem byte a byte iguais**. Somente dois arquivos preexistentes mudaram nesta fase:

| Arquivo | Alteração delimitada |
|---|---|
| `app/src/components/PokerStudioApp.tsx` | Ícone/aba Replayer, carregamento com `lazy`/`Suspense` e renderização condicional; cabeçalho sem fixação no móvel somente enquanto essa aba está ativa |
| `app/src/lib/studyNavigation.ts` | Inclusão de `replayer` na união `TabId` |

As cópias anteriores desses dois arquivos estão em `fase2b-evidencias/antes/`. [integridade.json](fase2b-evidencias/integridade.json) contém hashes anteriores/atuais, exemplos, contagem de frames e resultados de interação. Não foram alterados importador, esquema 1.0.0, adaptador anterior, SQLite, motor de cartas/estados/matemática, avaliador de drills, currículo RegLife, catálogo Erros Fatais, ranges ou soluções de solver. As alterações já existentes nesses módulos foram preservadas.

## 2. Arquitetura visual e integração

O módulo é isolado em `ReplayerView.tsx` e `ReplayerView.module.css`. Reutiliza React, ícones Lucide, `parseCard` do motor de cartas e a linguagem visual de painéis, cores e tipografia da aplicação. Não foram adicionadas dependências nem modificados os scripts de pacote.

O componente de mesa anterior pressupõe a disposição do treinador e informações próprias de um spot/hero. Reutilizá-lo diretamente exigiria preencher contexto inexistente nas mãos importadas. Por isso foi criada uma mesa de apresentação independente, sem regras de apostas: no desktop, distribui os participantes ao redor do board; no móvel, usa cartões de jogadores em duas colunas. A ordem é relativa à fonte, sem atribuir assentos físicos fictícios. Nomes ausentes usam `sourceLabel`; posições ausentes/`OTHER` são indicadas como não informadas; inferências recebem marcação. O dealer é mostrado apenas para `BTN` ou `BTN/SB` conhecidos no contrato.

A interface apresenta stacks, cartas, apostas pendentes, pote total, blinds/antes, street, ator do evento e próximo participante quando informado, fold, all-in, muck e showdown. O painel explica em português o evento, seu valor e movimentos registrados. A lista diferencia ações da fonte e operações automáticas. Não há avaliação estratégica ou recomendação de ação.

Controles implementados: início, anterior, próximo, fim, play/pause, progresso selecionável, velocidades 0,5×/1×/2× e seleção de evento na lista. Selecionar um frame ou mudar perspectiva pausa a reprodução. O timer é cancelado ao pausar, trocar intervalo, trocar mão ou desmontar a sessão. A reprodução para no último evento, inclusive em prefixos parciais. A lista rola dentro do próprio painel, sem deslocar a página durante o play.

Há transições CSS leves, destaque do participante e tratamento de `prefers-reduced-motion`. Os valores vêm dos frames, independentemente das transições. O layout tem tratamento para 2–9 participantes; para 7–9 no desktop, a mesa ganha altura para evitar sobreposição. No móvel, o cabeçalho da aplicação deixa de ficar fixo somente no Replayer, preservando espaço para a mesa.

## 3. Construção dos frames e precisão

`buildReplayFrame`, em `handReplay.ts`, recebe uma mão validada, cursor e perspectiva. Cursor **0** usa `events[0].before`; cursor **N** usa `events[N-1].after`. Os estados não são recalculados nem obtidos da animação. Avançar e retroceder são consultas determinísticas à mesma sequência.

Somente conhecimento das cartas e somas do ledger são reduzidos pelos eventos já alcançados. Não existe um segundo motor de regras: legalidade do histórico PHH continua a cargo do pipeline PokerKit da Fase 2A. O adaptador de side pots existente foi examinado, mas não foi usado para inventar camadas por frame.

Os valores permanecem strings de átomos. A soma e a formatação usam `BigInt`, com escala de 0–6 casas do contrato e separadores em português, sem passagem por `Number` para cálculos monetários. Deltas negativos são formatados explicitamente. O validador mantém o teto conservador de `2^53−1` átomos do perfil, inclusive para a soma inicial dos stacks.

Tratamentos importantes:

- O total exibido é exatamente `snapshot.potAtoms`; `betsAtoms` não é somado novamente.
- Contribuição líquida acumula `paidAtoms − returnedAtoms`, separadamente de prêmio destinado e variação do stack.
- `UncollectedBetReturn` identifica a devolução no ledger, sem criar outro crédito no stack.
- `ChipsPushing` destina prêmio; `ChipsPulling` realiza o crédito físico, conforme os snapshots.
- No fold, o prêmio normalizado pode incluir a parcela própria retida. Ele não deve ser somado novamente ao stack nem tratado como lucro líquido.
- Principal, laterais, elegíveis e pagamentos de `hand.pots` aparecem **somente no fim de mão completa**. Antes disso, o total corrente é exibido e a limitação é informada.
- `VALIDATED_PARTIAL` termina sem vencedor, stacks finais calculados ou liquidação fictícia.

## 4. Política de visibilidade das cartas

| Perspectiva | Informação permitida no frame |
|---|---|
| Pública, padrão | Cartas privadas ocultas até `HoleCardsShowingOrMucking` com revelação alcançada |
| Jogador escolhido | As próprias cartas conhecidas a partir do respectivo `HoleDealing`, além das revelações públicas já alcançadas |
| Completa pós-sessão, explícita | Cartas conhecidas na sequência já alcançada, inclusive privadas de outros jogadores; identificação de que não representa conhecimento público |

A visão completa adota política conservadora: **também não antecipa uma carta conhecida somente por revelação futura**. Uma carta distribuída como desconhecida continua desconhecida até o evento que a informa. Nenhuma perspectiva revela cartas antes da distribuição. Muck não apaga conhecimento anterior nem o transforma automaticamente em conhecimento público.

Os frames não consultam `players[].holeCards` para antecipar cartas nem `ending.board` para completar streets. A lista cronológica usa rótulos sem códigos de cartas e não renderiza as strings brutas de `sourceActions`, que podem conter cartas privadas ou futuras. O objeto canônico completo continua contendo seus dados finais para auditoria; esta política governa a apresentação, não é um mecanismo de sigilo criptográfico contra quem inspeciona o arquivo.

Foi adicionada `late_reveal.phh`: p1 recebe cartas desconhecidas, que só são informadas no showdown. Seus estados são gerados pelo importador real. Os testes comprovam ausência de antecipação e ocultação novamente ao retroceder para antes da revelação.

## 5. Entrada e validação runtime

`handHistoryValidation.ts` fornece `parseCanonicalHandText` e `validateCanonicalHand`. Aceita um `CanonicalHand` diretamente ou envelopes de uma mão `{ok:true, hand}` com campos opcionais `status`/`issues` compatíveis. Recusa o envelope de diagnóstico inválido do pipeline, apresentando seu código, por exemplo `ILLEGAL_ACTION`. Não lê banco SQLite nem lotes de mãos.

A fronteira confere, entre outros:

- Limite de 6 MiB UTF-8, 2–9 jogadores, até 500 ações-fonte e 2.048 eventos; metadados com profundidade máxima 16.
- Versão, perfil NLHE suportado, variante, modo, identificação PokerKit 0.7.7 e classificação de integridade compatível com resultado completo/parcial.
- Tipos exatos, campos admitidos nos objetos do contrato, `Observed<T>`, IDs, hash em formato esperado, instante UTC e data civil válida. Não há coerção de arrays/strings para enums ou de números para valores monetários.
- Strings de átomos, escala, limites, arrays e índices, ordem e continuidade dos snapshots e cobertura das ações-fonte.
- Cartas válidas e únicas, distribuição/revelação coerente, board temporal e concordância entre agregado final e eventos.
- Máscaras, conservação `stacks + pot`, apostas contidas no pote, débitos/créditos e ledger, elegibilidade e pagamentos finais. Prefixos não podem trazer resultado final fabricado.
- `gtoAnalysis` permanece `NOT_EVALUATED` e `evLoss` permanece `null`.

**Conferir estrutura não autentica a origem e não reexecuta todas as regras de apostas.** Um JSON editado de maneira coerente pode passar nessas verificações. Todo arquivo selecionado recebe o aviso “estrutura conferida; origem não autenticada”, mesmo que contenha um campo afirmando validação PokerKit. O SHA declarado no arquivo não prova posse nem autenticidade da fonte PHH.

Para os exemplos distribuídos, a UI compara SHA-256 dos bytes do JSON com o manifesto local e confronta o hash da fonte declarado. Os testes Python refazem a importação das fixtures e comparam a saída, descontando apenas o instante de uma nova ingestão. Isso comprova consistência dos artefatos locais; não é assinatura externa de autoria.

O arquivo pessoal é lido por `File.text()` no navegador. Não há upload nem requisição contendo seu conteúdo. O único fetch acrescentado é o dos exemplos estáticos da própria aplicação. Falha de leitura/validação remove a sessão anterior e mostra diagnóstico. Um contador de requisição impede que uma carga assíncrona antiga substitua a seleção mais recente.

## 6. Exemplos e geração reproduzível

`generate_replay_examples.py` usa o importador existente, sem estados manuais:

| Fixture | Finalidade |
|---|---|
| `hu_fold.phh` | Fold heads-up, devolução e liquidação |
| `decimal_fold.phh` | Centésimos exatos, stacks finais 1,01 e 0,99 |
| `three_way_allin.phh` | All-ins e potes finais 150 + 100 |
| `folded_sidepot.phh` | Contribuição de jogador em fold, principal 151 e lateral 100 |
| `split_odd_ante.phh` | Ante e empate com distribuição indivisível 3/2 |
| `showdown_muck.phh` | Muck e distinção de conhecimento público/registrado |
| `partial_flop.phh` | Prefixo até flop; último pote 4, sem liquidação |
| `late_reveal.phh`, nova | Desconhecidas na distribuição, revelação posterior |

O manifesto `app/src/data/replayExamples.json` registra hashes do canônico e PHH. `app/public/replays/` contém oito mãos e o diagnóstico `invalid_missing_call.json`, que não contém mão válida. Uma fixture adicional de prefixo de nove jogadores, em `docs/fase2b-evidencias/layout-9p.phh` e `.json`, foi gerada pelo mesmo pipeline para testar layout e abertura de arquivo; não amplia o catálogo nem o perfil.

O gerador grava cada arquivo por substituição atômica e possui teste de falha de escrita. O conjunto manifesto/arquivos não é uma transação única: **gere antes de iniciar o servidor ou build**. Em caso de versões desencontradas, a UI recusa o exemplo por hash divergente.

## 7. Testes executados nesta fase

Ambiente observado: Windows, Node 24.22.0, Next 15.5.29, Python 3.15.0 e PokerKit 0.7.7 no ambiente virtual já existente. Nenhum pacote novo foi instalado para o Replayer.

| Verificação | Resultado observado | Evidência em `fase2b-evidencias/` |
|---|---|---|
| `npm test` | **94 passaram**, 20 suites, zero falhas/cancelamentos/skips | `npm-test.log` |
| Python unittest | **51 passaram** | `python-tests.log` |
| `npm run lint` | Código 0, sem erros ou avisos ESLint | `npm-lint.log` |
| `npm run typecheck` | Código 0 | `npm-typecheck.log` |
| `npm run build` | Compilação concluída, tipos/lint e geração 5/5; rota principal 108 kB, First Load JS 211 kB | `npm-build.log` |
| Verificador de preservação e exemplos | 146 arquivos conferidos; apenas os dois pontos de integração diferem; **8 exemplos e 165 frames** com conservação | `integridade.json`, `verificar-fase2b.mjs` |
| Interação real em navegador | **22 checks automatizados passaram**, 11 por viewport, além das observações complementares | `interacoes-browser.json`, `replay-browser-checks.mjs` |
| `git diff --check` | Sem erros de whitespace; apenas avisos do Git sobre futura conversão LF/CRLF em arquivos já presentes | Execução no repositório |

Os 21 testes novos de Node em `handReplay.test.ts` abrangem nove casos de validação, nove de frames/visibilidade/dinheiro e três de controles. Incluem versões e tipos inválidos, enums como arrays, data inexistente, overflow, corrupção de sequências/máscaras/cartas, side pots e prefixos incoerentes, rejeição de EV/GTO fabricados, progressão/regressão, streets, conservação, devoluções, destinação versus crédito, muck, revelação tardia e velocidades. Os 73 testes anteriores continuam passando sem edição dos seus testes nesta fase.

Os três testes Python novos conferem saídas contra reimportação real e hashes, diagnóstico inválido sem canônico e escrita atômica com falha simulada. Os 48 testes anteriores também passaram, mantendo as verificações do importador, regras, persistência e limites homologados na Fase 2A.

Problemas encontrados e corrigidos durante a implementação:

- A importação estática inicial do componente fazia o harness Node de navegação tentar resolver o alias do manifesto/CSS. Foi corrigida com carregamento `lazy`/`Suspense`, sem enfraquecer testes. `npm-test-inicial.log` preserva essa execução preliminar; o resultado final é o de 94 testes.
- Sobreposição de jogadores em mesa com nove participantes: altura/disposição corrigidas e novamente medidas em desktop/móvel.
- Após recusar arquivo local, o mesmo exemplo padrão não podia ser reselecionado sem trocar outra opção: o seletor agora fica sem exemplo ativo ao abrir arquivo. Recuperação reproduzida no navegador.
- Cabeçalho móvel fixo consumia área de leitura: ajuste limitado à aba Replayer e novas capturas.
- Regenerar um manifesto durante o servidor de desenvolvimento expôs leitura transitória de JSON incompleto. O gerador ganhou substituição atômica e teste de falha. Não foi alterado o importador.

Nenhuma solução de solver, range ou dado de fixture anterior foi ajustado para fazer verificações passarem.

## 8. Interação real e evidências visuais

Foi usado navegador Chromium integrado, com interface real em `localhost:3010`, viewports **1440×1000** e **390×844**. A validação não se limita a SSR ou build. A automação usa seletores/ações documentados do navegador e DOM visível; não lê estado interno do React.

Em ambos os tamanhos foram exercitados início, seleção cronológica, avanço/retorno, perspectiva e distribuição, play/pause a 2× com passagem real do tempo, revelação tardia e retorno, decimais, principal/lateral, muck, prefixo e barra de progresso. Os 22 resultados estão individualizados no JSON.

Observações adicionais registradas: arquivo inválido recusado sem frame remanescente; reabertura do mesmo exemplo; velocidade 0,5×; parada automática no fim parcial; Home/End no controle de progresso; contribuição em fold e ficha ímpar; navegação para Erros Fatais e Treinador e retorno ao Replayer. Em nove participantes, as medidas finais registraram **zero sobreposições entre cartões de jogadores** e largura da página dentro do viewport nos dois tamanhos. Isso não equivale a provar ausência de qualquer problema em todos os tamanhos possíveis.

O registro final de console não contém erros observados. Duas leituras preliminares feitas durante recarga de desenvolvimento/antes de renderização foram descartadas como montagem inválida do teste e preservadas em `discardedSetupObservations`; os mesmos cenários foram repetidos após aguardar o estado visível. Não foram contadas como checks aprovados.

Capturas de viewport, não de página inteira:

- [Desktop — all-ins e sequência](fase2b-evidencias/replayer-desktop.jpg), 1440×1000.
- [Móvel — mesa do prefixo no flop](fase2b-evidencias/replayer-mobile.jpg), 390×844.
- [Móvel — controles e aviso de prefixo](fase2b-evidencias/replayer-mobile-controls.jpg), 390×844.

O servidor de desenvolvimento foi encerrado e o viewport restaurado após os testes. `replay-browser-checks.mjs` exporta `runReplayChecks(tab, {viewport})`, reproduzível com um handle de aba da ferramenta CUA e servidor local. Não é um executável Playwright independente nem um teste automaticamente incluído em `npm test`; as APIs de navegador utilizadas são fornecidas pelo ambiente de interação. Não foi adicionada dependência de automação ao aplicativo.

## 9. Arquivos desta entrega

Preexistentes alterados: somente `PokerStudioApp.tsx` e `studyNavigation.ts`, conforme seção 1.

Novos arquivos de implementação/testes:

- `app/src/components/ReplayerView.tsx` e `ReplayerView.module.css`.
- `app/src/lib/poker/handReplay.ts` e `handHistoryValidation.ts`.
- `app/src/lib/__tests__/handReplay.test.ts`.
- `app/src/data/replayExamples.json`.
- `app/public/replays/hu_fold.json`, `decimal_fold.json`, `three_way_allin.json`, `folded_sidepot.json`, `split_odd_ante.json`, `showdown_muck.json`, `partial_flop.json`, `late_reveal.json` e `invalid_missing_call.json`.
- `pipeline/hand_history/generate_replay_examples.py`, `test_replay_examples.py` e `fixtures/late_reveal.phh`.
- Este relatório e `docs/fase2b-evidencias/`: snapshot, duas cópias anteriores, logs finais/preliminar identificado, verificador e resultado de integridade, script/registro de interação, fixture adicional de layout e três capturas.

Os demais arquivos que já apareciam modificados ou não rastreados no Git pertenciam ao estado inicial e não devem ser atribuídos a esta fase.

## 10. Utilização e reprodução

Na raiz, com o ambiente virtual da Fase 2A disponível, gerar exemplos **antes** de servir/compilar, quando necessário:

```powershell
pipeline/hand_history/.venv/Scripts/python.exe -m pipeline.hand_history.generate_replay_examples
pipeline/hand_history/.venv/Scripts/python.exe -m unittest pipeline.hand_history.test_hand_history pipeline.hand_history.test_homologacao pipeline.hand_history.test_replay_examples -v
node docs/fase2b-evidencias/verificar-fase2b.mjs
```

Uma nova geração altera o instante de ingestão e, portanto, os hashes do canônico e manifesto de maneira intencional. Para somente conferir a entrega, não é necessário regenerar: os testes reimportam e confrontam os exemplos já presentes.

No diretório `app`:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run dev
```

Abrir a aplicação e selecionar **Replayer**. Escolher um exemplo ou **Abrir JSON local**, selecionar a perspectiva e usar os controles. Para testar rejeição, abrir `app/public/replays/invalid_missing_call.json`. Para arquivo próprio, primeiro produzir/exportar uma mão pelo pipeline auditado da Fase 2A e selecionar seu JSON único. O navegador não importa PHH e não abre diretamente o banco SQLite.

Os arquivos pessoais ficam somente na memória da sessão. Sair da aba, recarregar ou trocar de mão reinicia a sessão; não existe biblioteca persistida nem salvamento de playhead nesta entrega.

## 11. Limitações, riscos e próxima homologação

- A validação runtime é defensiva e delimitada ao contrato/perfil atual; não substitui reconstrução da fonte pelo pipeline. Arquivos locais não são autenticados.
- Persistem as ressalvas da Fase 2A, inclusive a proteção conservadora de reabertura após all-in curto e os limites de rake, straddles, múltiplos runouts, outras variantes/modalidades e regras específicas de sala. O Replayer não amplia esse suporte.
- Não há composição intermediária confiável dos side pots no contrato atual; só a liquidação final é mostrada. Não há antecipação na perspectiva completa, mesmo após a distribuição, se a fonte só informou a carta em evento posterior.
- Dados ausentes continuam ausentes. Não foram inferidos novos assentos físicos, moedas, cartas ou posições para completar o desenho.
- A revisão funcional cobre o Chromium e os dois tamanhos documentados, com caso adicional de nove jogadores. Não foi feita homologação em todos os navegadores, tecnologias assistivas ou dispositivos físicos.
- São necessárias APIs modernas de `BigInt`, arquivos e Web Crypto; o uso local em localhost foi testado. Não foi implementado service worker/PWA ou instalação independente do servidor local.
- A geração é atômica por arquivo, não pelo conjunto inteiro; deve ocorrer antes do servidor/build. O hash confere consistência local, não autoria externa.
- Não foram implementados biblioteca completa, formatos comerciais, importação em massa, estatísticas, diagnóstico GTO/EV, HUD, captura ao vivo, integração com clientes de poker ou automação de ações. Nenhuma mão importada gera estratégia, EV ou pontuação GTO.

Para homologação, reproduzir os comandos, revisar o decoder com entradas adversariais adicionais e repetir os cenários temporais/financeiros e a interação em navegadores/dispositivos adicionais. Conferir especialmente o significado de prêmios versus créditos e a ausência de potes finais nos frames anteriores. Uma eventual Fase 2C deve ser especificada separadamente; integração de biblioteca/persistência, ampliação de formatos ou autenticação baseada na fonte exigem projeto próprio e não foram iniciadas automaticamente.
