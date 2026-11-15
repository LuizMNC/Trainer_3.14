# Fase 3A, 3B, 3C e iniciador Windows — relatório técnico

Data: 14/11/2026, America/Fortaleza. **Implementação entregue para homologação; testes de navegador e interação gráfica pendentes do usuário**, conforme sua orientação nesta tarefa. Este relatório não declara homologação visual, duplo clique efetivamente observado ou validação em celular. Não foi iniciada a Fase 4.

## 1. Auditoria e preservação

Foram lidos os relatórios anteriores, os contratos de cartas, estado e estratégia, os adaptadores TexasSolver, o motor matemático, o importador Python, o armazenamento PHH1, a ponte local e os fluxos Biblioteca/Replayer. Já havia alterações sem commit das fases anteriores; nenhuma foi revertida.

`fase3-evidencias/baseline.json` registra HEAD `8af89a4fdf341e9ef79324fc21ee0035d423ef27`, status inicial e SHA-256 de 223 arquivos capturados, incluindo o próprio gerador do baseline. A comparação em `integridade.json` permite somente três mudanças em arquivos capturados:

- `app/src/components/PokerStudioApp.tsx`: nova aba e transferência explícita de cenário.
- `app/src/components/ReplayerView.tsx`: botão de transferência da perspectiva atual.
- `app/src/lib/studyNavigation.ts`: identificador da nova aba.

Os outros 220 arquivos capturados permanecem idênticos. Isso inclui cartas, estado, `mathEngine.ts`, contratos/adaptadores GTO, treinador, estatísticas, currículo, catálogos, ranges, fixtures, Biblioteca Python e artefatos TexasSolver. Os manifests e o lockfile de dependências não foram alterados. O marcador inicial de banco utilizou LOCALAPPDATA redirecionado pelo sandbox; isso foi identificado e registrado. A conferência final verificou separadamente o perfil Windows real, onde o banco padrão também não foi encontrado. Todos os ensaios de escrita usam bancos separados, sem criar ou abrir para escrita o banco pessoal padrão.

## 2. Arquitetura

O Laboratório Matemático é uma aba adicional carregada sob demanda. Suas seções são Equidade Exata, Monte Carlo e EV e Sensibilidade. A aba anterior **Lab EV & ICM** foi preservada.

O editor usa `cards.ts`; as calculadoras usam as fórmulas existentes de pot odds, fold equity e MDF de `mathEngine.ts`. O gerador determinístico existente também é reutilizado. O novo avaliador de showdown tem implementação independente, conferida contra PokerKit 0.7.7. Ele não substitui o motor cronológico nem os validadores de históricos.

Estimativa de trabalho e cálculos combinatórios rodam em um Web Worker. Não há serviço Python adicional para equidade. Python continua responsável pelo pipeline e pela Biblioteca SQLite. A aplicação mantém um processo Next.js em loopback, com duas rotas locais pequenas para prontidão autenticada e detecção de encerramento.

## 3. Avaliação de mãos

`labEvaluator.ts` avalia diretamente 5–7 cartas com contagens de ranks, máscaras de naipe e desempates lexicográficos. Categorias: carta alta, par, dois pares, trinca, sequência, flush, full house, quadra e straight flush. Royal flush é o straight flush mais alto. A sequência A2345 tem carta alta cinco. Um segundo trio pode fornecer o par do full house.

Scores maiores vencem; scores iguais dividem o pote. `evaluateHand` valida cartas e duplicações. O caminho interno `evaluateIds` pressupõe a entrada já validada pelo motor de equidade, evitando repetir validação em cada showdown.

A conferência independente usa 1.505 mãos de cinco, seis e sete cartas, incluindo raridades determinísticas, e 1.504 comparações adjacentes após ordenação. Nenhuma divergência foi encontrada contra `StandardHighHand.from_game` do PokerKit. Essa amostragem não constitui prova formal de todas as mãos possíveis.

## 4. Equidade exata e pesos

Aceitam-se 2–6 participantes, cada um com mão específica ou range de combos ponderados; board vazio, flop, turn ou river; e cartas mortas. Cartas são normalizadas pelo motor existente. Cartas repetidas no board/mortas, combos com a mesma carta duas vezes, combos sobrepostos no mesmo range, ranges vazios após blockers e configurações conjuntas impossíveis são recusados.

Cada configuração legal h tem peso W(h) = produto dos pesos individuais. Seu peso é normalizado sobre **todas as configurações conjuntas legais**, excluindo colisões entre jogadores. Para cada configuração, os runouts restantes têm probabilidade uniforme. A equidade de um jogador é a média ponderada de sua fração do pote: 1 se vence sozinho, 1/k se divide entre k vencedores, 0 caso contrário.

Boards são enumerados como combinações não ordenadas, sem armazenar seus conjuntos completos em memória. Como se calcula apenas o showdown final, todas as permutações de um mesmo conjunto têm a mesma contribuição; o fator k! das sequências ordenadas cancela na normalização. Isso não modela decisões intermediárias no turn/river.

O resultado inclui combos originais, combos com peso positivo após board/cartas mortas, configurações conjuntas legais quando contáveis, runouts por configuração, total de resultados e frequências ponderadas de vitória/empate. Vitória significa vencedor único; empate significa participação em empate e não deve ser somado às vitórias dos demais jogadores como se fossem eventos mutuamente exclusivos.

O termo EXACT_ENUMERATION identifica enumeração exaustiva, **não aritmética racional arbitrária**. Contagens grandes são preservadas em strings decimais calculadas com BigInt. Pesos e somas usam IEEE-754, com tolerância nos testes. Pesos aceitos: zero ou valores entre 10⁻⁹ e 1, evitando produtos que subfluam a zero no limite de seis jogadores.

## 5. Editor de ranges

A matriz 13×13 permite incluir/remover classes. O painel de combos permite escolher duas cartas e editar frequências individuais. Também há entrada textual, remoção de bloqueados e importação das frequências de uma ação de um spot existente, identificando spot, ação e fonte.

Gramática: `AA, AKs:0.5, AsKh:1`. Classes seguem a ordem de ranks do projeto. Não há expansão de `+`, intervalos como `22-99` ou porcentagens comerciais. Uma mão específica usa quatro caracteres, por exemplo `AsAh`, sem espaço entre as duas cartas. Sobreposições como `AA,AsAh` são recusadas.

Os contadores individuais do editor consideram board e cartas mortas. Colisões entre ranges são eliminadas na configuração conjunta, cuja contagem aparece na estimativa. A comparação de dois ranges mostra combos compartilhados. Importar frequência agregada de uma ação usa esse valor como peso de cada combo da classe; não recupera automaticamente o range de chegada ou a estratégia específica por combo de um solver. Isso continua sendo entrada de estudo com fonte identificada, sem certificação VERIFIED.

## 6. Monte Carlo e distribuição conjunta

Cada tentativa propõe combos independentes segundo os respectivos pesos. Se houver colisão, **toda a tentativa é rejeitada**, inclusive os combos já sorteados. Somente repetir o jogador que colidiu produziria viés; esse algoritmo não é usado.

Após aceitar o conjunto de mãos, uma permutação parcial de Fisher–Yates sorteia o board entre as cartas restantes. Assim, sob o modelo de sorteios uniformes, a distribuição aceita é proporcional ao produto dos pesos condicionado à legalidade. Ranges de baixa aceitação podem atingir os limites de tentativas/tempo; nesse caso, a execução termina com erro, descartando a certificação do parcial.

Seed, ordem dos combos, versão do algoritmo e quantidade de amostras definem a sequência no ambiente especificado. A execução é serial; não há política de seeds paralelas. Entradas textuais equivalentes são expandidas e ordenadas pelo parser. Chamadores diretos da API TypeScript devem preservar a ordem das combinações. Tempo de execução não é reproduzível.

## 7. Estatística e convergência

Para cada jogador, X é a fração do pote, em [0,1]. Média e variância amostral são atualizadas por Welford. O erro-padrão é sqrt(s²/n), incluindo corretamente frações como 1/2 e 1/3. Não se usa automaticamente p(1−p) para essa variável.

O intervalo mostrado na tabela é o **IC pontual conservador de Hoeffding de 95%**:

`[max(0, média − sqrt(ln(40)/(2n))), min(1, média + sqrt(ln(40)/(2n)))]`.

Ele usa apenas X ∈ [0,1] e a hipótese de amostras independentes. O gerador é pseudoaleatório determinístico, não uma fonte ideal de independência física. A exportação também registra a aproximação normal `média ± 1,9599639845 × EP`, que pode degenerar em eventos raros e não é o intervalo principal da tabela.

Os intervalos são pontuais, não bandas simultâneas para a curva nem garantias de precisão ou autorização de parada opcional pelo resultado observado. A interface permite 1 mil, 10 mil, 100 mil e 1 milhão de amostras; a API aceita inteiros de 100 a 1 milhão. Comparações com exato aparecem quando há um experimento exato da mesma configuração entre os últimos seis resultados da sessão.

Os gráficos permitem inspecionar valores com o ponteiro e sobrepor experimentos compatíveis com amostras/seeds diferentes. A interação em dispositivos de toque e a apresentação responsiva aguardam o teste do usuário.

## 8. EV e convenções

EV é incremental ao ponto da decisão. Custos passados não são subtraídos novamente. Valores monetários não são inferidos de fichas.

| Variável | Significado |
|---|---|
| P | Pote antes da aposta |
| B | Aposta adversária no call, ou nossa aposta no modelo de bet |
| C | Quantia necessária para pagar |
| e | Equidade do call final |
| f / c | Frequências explícitas de fold/call contra nosso bet |
| q | Equidade quando nosso bet recebe call |
| ec | Equidade realizada no check-down |
| K | Custo adicional fixo do bet, aplicado em ambos os ramos |
| m | Frequência hipotética de bet no mix bet/check |

Modelos implementados:

- `EV(call) = e(P+B+C) − C`; para C=B, `e(P+2B) − B`.
- `EV(fold) = 0`.
- `EV(blefe puro) = fP − cB`, com q=0 e K=0 por definição desse modelo.
- `EV(bet) = fP + c[q(P+2B) − B] − K`.
- `EV(check) = ecP`, supondo check-down e realização integral.
- `EV(mix) = mEV(bet) + (1−m)EV(check)`.

Fold e call precisam somar um; raises não são suportados. A interface bloqueia o resultado se a distribuição for inválida e oferece normalização **explícita**. Sliders não completam silenciosamente o outro ramo. No gráfico, ao variar f ou c, a relação complementar 1−x é declarada no texto.

Pot odds, fold equity break-even e MDF reutilizam as funções anteriores. O break-even do bet é mostrado somente quando definido e dentro de [0,1]. A sensibilidade seleciona EV(call), EV(bet), EV(check) ou EV(mix) conforme o parâmetro. Cenários salvos conservam todas as entradas e podem ser exportados para comparação de sizings e hipóteses. Não há recomendação GTO derivada de escolher o maior desses valores.

Valores aceitos: montantes positivos de 10⁻⁶ a 10¹²; custo adicional de zero a 10¹²; probabilidades de zero a um; tolerância da soma f+c de 10⁻¹⁰. O eixo de sensibilidade respeita o teto de montantes.

## 9. ICM, PKO e proveniência

O contrato matemático distingue EXACT_ENUMERATION, MONTE_CARLO_ESTIMATE, MODEL_BASED_EV, SOLVER_REFERENCE e EDUCATIONAL_ONLY. Os novos cálculos produzem os três primeiros conforme o método. Exemplos são identificados como entradas didáticas; resultados exatos sobre esses exemplos continuam sendo enumerações condicionais, sem certificação de estratégia.

Equidade exportada inclui entradas/ranges/fontes/pesos, versão, método, seed, limites, hipóteses, tempo, tentativas, resultados e evolução. Modelos de EV exportam entradas, fórmulas/hipóteses, unidade, versão e limites.

No novo modelo, EV monetário, ICM e PKO retornam INDISPONÍVEL. As calculadoras anteriores permanecem na aba antiga e não recebem dados inferidos dos novos motores. Os novos arquivos não escrevem `matrixEv`, `evLoss` ou registros de exercícios GTO. A referência TexasSolver continua sem EV individual por ação, com seus bytes e proveniência preservados.

## 10. Integração com Biblioteca e Replayer

O caminho Biblioteca → Abrir no Replayer → Enviar cenário ao Laboratório aproveita os fluxos anteriores. A ação envia somente board e cartas visíveis na perspectiva/evento atual, dos jogadores ainda ativos. Participantes sem cartas ficam com campo vazio ou incompleto e exigem entrada manual. Não são inferidos ranges, cartas privadas futuras, potes ou ações GTO.

O laboratório disputa um pote comum; não calcula side pots. Transferir uma mão com liquidação lateral não significa reproduzir seus prêmios. Não há integração nova com o coach externo nem alteração do contrato de históricos. Trainer, Range Explorer, Erros Fatais, Currículo e Estatísticas mantêm as implementações anteriores; seus testes automatizados passaram. O teste visual dessas abas permanece pendente.

## 11. Limites e execução

| Recurso | Limite |
|---|---|
| Participantes | 2–6 |
| Combos por jogador | 1.326 |
| Texto por range | 60.000 caracteres / 1.500 entradas |
| Entrada serializada do motor | 2 MiB |
| Pré-contagem de configurações | Até 100.000 candidatas |
| Showdowns exatos | Até 250.000 |
| Monte Carlo | Até 1.000.000 amostras / 5.000.000 tentativas |
| Tempo do motor | 60 segundos |
| Watchdog externo do worker | 65 segundos |
| Resultados retidos na sessão | Últimos seis |
| Histórico da curva | Até 220 checkpoints e ponto final |

Quando a contagem conjunta ultrapassa o teto, mostra-se um limite superior inteiro de trabalho e recusa-se o exato; não há troca automática para Monte Carlo. Não se materializam boards. A memória é limitada estruturalmente por entrada, combos, configurações e checkpoints; **não foi imposto um limite de RSS do sistema operacional ao Web Worker**. O consumo real depende do navegador.

Há um worker por instância ativa do laboratório, cancelado por botão, desmontagem ou watchdog. Isso não é um limite global entre várias abas do navegador. Durante um cálculo, um heartbeat local verifica o servidor a cada três segundos, com timeout de dois segundos; a perda de conexão termina o worker e descarta o parcial. Essa reação visual ao fechamento do iniciador aguarda teste do usuário. Fechar a página também termina seus workers.

## 12. Iniciador Windows

A implementação usa Python/Tk do ambiente existente, Windows Script Host, PowerShell/WinForms para preparação e um ícone `.ico` desenhado com APIs nativas. Não há Electron, PyInstaller ou novo pacote instalado no projeto.

O atalho **GTO Trainer** foi criado na Área de Trabalho pelo instalador. Ele aponta para `wscript.exe` e um caminho absoluto do bootstrap no checkout; o diretório de trabalho do clique não é necessário. `shortcut.json` confirma existência, destino, bootstrap, ícone e diretório de trabalho. O duplo clique real e a abertura automática do navegador ainda precisam ser conferidos pelo usuário.

O bootstrap inicia `pythonw.exe`, sem terminal. O iniciador verifica Node 24.22+, Python/Tk, PokerKit 0.7.7, dependências Next e BUILD_ID. Em seguida verifica o SQLite existente, configura ambiente local, escolhe porta entre 3000 e 3020, inicia produção explicitamente em `127.0.0.1`, autentica `/api/local-health` e verifica a página antes de abrir o navegador padrão.

Usa diretamente `node .../next start --hostname 127.0.0.1 --port N`, equivalente ao comando do script `npm run start`, evitando um processo npm intermediário. Não utiliza o servidor de desenvolvimento.

Um mutex Windows impede duas instâncias do mesmo checkout/usuário. Um segundo lançamento só reabre a URL se a instância conhecida responder com o token local e a identidade esperados; serviços desconhecidos não são reutilizados. O estado temporário não inclui históricos e é removido ao encerrar. O token não vai para o navegador nem para logs.

## 13. Encerramento, falhas e persistência

O processo Next é associado imediatamente a um Windows Job com KILL_ON_JOB_CLOSE. O encerramento termina a árvore do servidor, incluindo subprocessos da Biblioteca. O clique em Encerrar ou o fechamento da janela do iniciador usa esse caminho. Fechar somente a aba do navegador deixa o servidor aberto, como informado na janela.

O runtime detecta saída inesperada durante prontidão, e a GUI monitora o processo após iniciar. A inicialização pode ser cancelada durante o fechamento. Falhas mostram mensagens sobre dependências, build, permissões, SQLite, portas e timeout. Uma corrida posterior à seleção de porta causa falha de start; não há reutilização do ocupante.

O banco padrão é `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`. Não é removido, recriado ou substituído ao iniciar/encerrar. A checagem usa conexão read-only, quick_check e identificação PHH1; a extensão da Biblioteca é verificada quando existente. Inicialização/migração aditiva legítima permanece responsabilidade do pipeline anterior. Um banco SQLite de outro aplicativo é recusado e preservado.

Logs ficam em `%LOCALAPPDATA%\Projeto-Poker`: `launcher.log`, com rotação na próxima abertura acima de 2 MiB, e `preparation.log`. O log de preparação reúne saída técnica de pip/build; não se deve publicá-lo sem revisão. Nenhum histórico é deliberadamente registrado pelo iniciador.

Registros de estudo do navegador não são apagados. Entretanto, localStorage depende do navegador e da origem: trocar localhost por 127.0.0.1 ou usar outra porta pode mostrar um histórico diferente. O histórico antigo continua na origem anterior; não há migração automática entre origens. A Biblioteca SQLite é compartilhada pelo mesmo caminho configurado.

## 14. Preparação e dependências

O arquivo **Preparar GTO Trainer.vbs**, na raiz, abre uma rotina gráfica para criar o ambiente virtual se necessário, instalar/verificar PokerKit com hash fixado, instalar dependências Node ausentes, compilar produção, criar o atalho e validar o runtime. Não exige comandos digitados pelo usuário. Não pede privilégios administrativos para seus arquivos no perfil/checkout.

A rotina foi executada em modo `-PrepareOnly`, que usa o mesmo corpo da ação da janela sem exigir interação gráfica. Esse teste valida o pipeline de preparação, não a experiência visual dos diálogos. Etapas têm limite de dez minutos; falha orienta consultar o log. Feche o iniciador antes de recompilar/atualizar o checkout.

Continuam necessários: Windows com Windows Script Host/VBScript e Windows PowerShell/WinForms, Node.js 24.22+ com npm, Python 3.11+ com Tk e venv funcional, PokerKit 0.7.7 e dependências do lockfile. Este ambiente usa Node 24.22.0 e o Python 3.15 existente no pipeline; não foram homologadas todas as versões Python. Primeira instalação pode exigir internet; uso matemático/Biblioteca após preparar é local. O coach Gemini existente depende de internet quando acionado explicitamente.

**Não é um pacote independente de Node/Python.** Se mover o checkout, recrie o atalho pela rotina na nova pasta. Não se alterou globalmente a política de execução do Windows; a preparação usa opção de processo para executar seu script local.

## 15. Testes e evidências

Resultados finais estão nos logs em `fase3-evidencias/`:

| Verificação | Resultado |
|---|---|
| `npm test` | 116 testes aprovados, incluindo 14 do laboratório |
| `npm run lint` | Aprovado, sem avisos no estado final |
| `npm run typecheck` | Aprovado |
| `npm run build` | Produção compilada, incluindo rotas locais |
| Python unittest do pipeline | 71 testes aprovados |
| unittest do iniciador | 8 testes aprovados |
| Conferência independente PokerKit | 1 teste aprovado; 1.505 mãos |
| Preparação `-PrepareOnly` | Aprovada |
| Atalho e ícone | Existência/configuração verificadas; abertura gráfica pendente |
| Navegador desktop/celular | PENDENTE DO USUÁRIO |

Cobertura matemática: categorias, royal, wheel, kickers, 100%/0%, divisão multiway, conservação do pote, blockers, duplicações, pesos condicionais, ranges incompatíveis, contagens grandes, limites, cancelamento, seeds fixas, reprodução e convergência. Um caso com frações variáveis {0,1/2} verifica a variância de equity sem assumir Bernoulli.

Referências analíticas: AA×KK no turn `2c 3d 7h 9s` tem 44 rivers e AA vence 42: 95,454545…%. Range `AsAh:1,QsQh:0.5` contra `KsKh` no board `2c 3d 7h 9s Jc` tem equidade 2/3 para J1. O caso com colisões ponderadas tem equidade 1/11, distinguindo a distribuição correta da amostragem sequencial enviesada. Não foram usados dados sintéticos de solver como oráculo GTO.

Cobertura do iniciador: dependências/build ausentes, porta ocupada, todas as portas indisponíveis, banco inválido/estrangeiro preservado, Job encerrando processo, prontidão real em produção/porta alternativa, autenticação, Host/Origin existente, importação PHH, persistência após reinício e saída inesperada. Dados são de fixtures em diretórios temporários; a proteção do caminho pessoal decorre do isolamento explícito dos testes, com conferência final separada do perfil real.

## 16. Benchmarks

`benchmark.mjs` executa casos pequenos, médios e 1k/10k/100k/1M em Node e grava `benchmarks.json` com tempo e resultado. As medidas incluem os yields cooperativos do motor; não incluem renderização React, worker startup, desenho de SVG ou interação gráfica. Use o JSON como referência da execução registrada, não como promessa de tempo em outro computador. O caso de um milhão foi efetivamente executado dentro do limite de 60 s.

Execução final em Node 24.22.0, com mãos específicas AsAh × KsKh; o caso exato médio usa flop 2c 3d 7h e os Monte Carlo usam turn 2c 3d 7h 9s:

| Caso | Resultados/amostras | Tempo do motor |
|---|---:|---:|
| Exato, river | 1 | 1,44 ms |
| Exato, flop | 990 | 11,19 ms |
| Monte Carlo | 1.000 | 24,82 ms |
| Monte Carlo | 10.000 | 159,14 ms |
| Monte Carlo | 100.000 | 1.499,57 ms |
| Monte Carlo | 1.000.000 | 6.439,75 ms |

As medições do navegador/renderização desktop e celular são **pendentes**, conforme o usuário assumiu esses testes. Não há benchmark de renderização inventado ou evidência visual reaproveitada de fases anteriores.

## 17. Arquivos e problemas corrigidos

Arquivos novos principais:

- `app/src/lib/poker/labEvaluator.ts`, `labRanges.ts`, `labEquity.ts`, `labEv.ts`, `labTransfer.ts`.
- `app/src/lib/lab.worker.ts` e `app/src/lib/__tests__/mathLab.test.ts`.
- `app/src/components/MathLab.tsx` e `MathLab.module.css`.
- `app/src/app/api/local-health/route.ts` e `local-session/route.ts`.
- `windows/launcher_core.py`, `launcher.pyw`, `Launch-GTOTrainer.vbs`, `Prepare-GTOTrainer.ps1`, `Verify-GTOShortcut.ps1`, `test_launcher.py`, `gto-trainer.ico`.
- `Preparar GTO Trainer.vbs`, estes dois guias e `docs/fase3-evidencias/`.

Problemas encontrados/corrigidos durante validação: formato inicial de mão específica nos exemplos; caminho de fixture de replay; adaptação de strings para o avaliador PokerKit; fechamento explícito da conexão read-only SQLite; filtros numéricos da nova rota de saúde quando o contrato exigia texto; fixture SQLite sem identificação PHH1; sensibilidade de check/mix e teto de montantes; contagens maiores que o inteiro seguro JavaScript; piso numérico de pesos e cancelamento após perda do servidor. Nenhum teste anterior foi enfraquecido.

O primeiro build no sandbox ficou parado antes da compilação; foi interrompido e repetido fora dele, como exige o ambiente Windows para os processos filhos do Next. Os logs de falha inicial não são apresentados como êxitos.

## 18. Riscos residuais e não entregues

- Homologação visual, acessibilidade, toque, responsividade e duplo clique real aguardam o usuário. A automação de Windows foi interrompida por Esc e não foi retomada após o usuário assumir o navegador.
- O wrapper gráfico de preparação e a abertura automática do navegador não foram observados até seu resultado final. Runtime, rotina de preparação e configuração do atalho foram testados separadamente.
- Não há suporte a side pots no laboratório, Omaha, múltiplos runouts, rake ou ações futuras nos modelos novos.
- Não há solver, ICM/PKO completo, estratégia GTO calculada, HUD, captura de mesa ou automação de jogo.
- Não há limite global de workers entre abas, quota de RSS do navegador, empacotamento independente, assinatura de executável ou instalador offline completo.
- Portas alternativas preservam as validações locais e passaram por HTTP, mas mudam a origem do localStorage.
- Interrupção forçada de uma escrita SQLite depende das garantias transacionais existentes; não há teste de corte físico de energia.
- Rotinas de primeira instalação podem depender de internet e permissões do perfil. VBScript pode estar desabilitado em outras instalações Windows.

## 19. Recomendações de homologação e referências

Use o roteiro do `GUIA_USUARIO_GTO_TRAINER.md` e registre navegador, resolução, cenário, resultado observado e tempo. Primeiro confira o atalho/iniciador e a Biblioteca, depois os exemplos analíticos e cancelamento. Repita a navegação nas abas preservadas e os cenários em largura de celular. Não marque esta entrega como homologada antes dessa conferência.

Para reproduzir a integridade na raiz: `node docs/fase3-evidencias/verificar.mjs`. O comando não regrava evidências das fases anteriores. Para desenvolvedores, os logs registram os comandos npm/unittest e os scripts de conferência/benchmark são reproduzíveis.

Fontes primárias consultadas: [avaliação de mãos no PokerKit 0.7.7](https://pokerkit.readthedocs.io/en/stable/evaluation.html), [Hoeffding, Probability Inequalities for Sums of Bounded Random Variables](https://www.tandfonline.com/doi/abs/10.1080/01621459.1963.10500830) e [NIST, Confidence Limits for the Mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm). As fórmulas implementadas e suas hipóteses estão registradas acima e nas exportações locais.
