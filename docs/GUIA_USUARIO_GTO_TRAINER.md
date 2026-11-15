# Guia do usuário — GTO Trainer

Versão da entrega: Fase 3, 14/11/2026. A implementação está disponível para seu teste de navegador. A homologação visual ainda está pendente.

## Abrir e fechar no Windows

O atalho **GTO Trainer** já foi criado na Área de Trabalho deste computador.

1. Dê dois cliques no ícone de espadas verde.
2. Aguarde a janela GTO Trainer verificar o ambiente e iniciar o aplicativo.
3. O navegador padrão deve abrir somente depois de a página e a Biblioteca estarem prontas. O endereço será `http://127.0.0.1:3000`, ou outra porta local livre entre 3001 e 3020.
4. Mantenha a janela do iniciador aberta durante o uso. O botão **Abrir no navegador** permite reabrir a página.
5. Para sair, use **Encerrar GTO Trainer** ou feche a janela do iniciador. Fechar só a aba do navegador mantém o servidor aberto.

Um segundo lançamento com a instância pronta deve apenas reabrir sua página. Se ela ainda estiver iniciando, aguarde a janela existente. Não é necessário abrir terminal, executar `npm run dev` ou configurar variáveis manualmente.

O duplo clique e a abertura automática aguardam sua conferência: a configuração do atalho e o runtime de produção foram testados, mas a interação gráfica final não foi homologada pelo agente.

## Preparar pela primeira vez ou após atualizar

Nesta instalação as dependências e o build foram preparados. Para refazer a preparação ou instalar em um novo checkout:

1. Feche o GTO Trainer antes de recompilar.
2. Abra a pasta do projeto pelo Explorador de Arquivos.
3. Dê dois cliques em **Preparar GTO Trainer.vbs**.
4. Clique em **Preparar e criar atalho** e aguarde as etapas. A primeira instalação pode precisar de internet.
5. Após a confirmação, feche a preparação e use o ícone da Área de Trabalho.

A rotina verifica o ambiente Python do pipeline, instala PokerKit 0.7.7 quando necessário, prepara dependências Node ausentes, compila a versão de produção e cria o atalho. Ela não apaga a Biblioteca nem os estudos.

Ainda são necessários Node.js 24.22 ou superior com npm, Python com Tk/venv, PokerKit e os componentes Windows Script Host/VBScript e PowerShell/WinForms. O programa usa essas dependências já instaladas; não é um pacote independente delas. Este computador foi validado com Node 24.22.0 e o Python 3.15 existente no pipeline. Outras versões Python não foram homologadas nesta entrega.

Se mover a pasta do projeto, execute a preparação na nova pasta para atualizar o caminho absoluto do atalho. Não mova ou apague o ambiente Python isoladamente. Mantenha os arquivos do checkout disponíveis localmente caso use OneDrive.

## Quando não abrir

| Mensagem ou comportamento | O que fazer |
|---|---|
| Python/ambiente virtual ausente | Execute a preparação; se o Python base foi removido, reinstale-o com Tk antes |
| Node ausente ou antigo | Instale uma versão compatível e prepare novamente |
| Build ou dependências ausentes | Execute Preparar GTO Trainer.vbs |
| Banco incompatível/corrompido | Preserve o arquivo e seu backup; não o apague para tentar corrigir |
| Sem permissão | Confira acesso à pasta do projeto e à pasta de dados do seu perfil |
| Portas 3000–3020 ocupadas | Feche outras instâncias/serviços locais e tente novamente |
| Servidor saiu inesperadamente | Feche a janela e abra novamente; confira o log se repetir |
| Sem internet | Laboratórios e Biblioteca preparados continuam locais; instalação inicial e AI Coach podem precisar da rede |

Logs técnicos ficam em `%LOCALAPPDATA%\Projeto-Poker\launcher.log` e `preparation.log`. Revise esses arquivos antes de compartilhar, pois podem conter caminhos locais e informações de instalação. O aplicativo não deve reutilizar um serviço desconhecido só porque ele ocupa a porta esperada.

## Biblioteca de Mãos e importação

Abra **Biblioteca de Mãos**. Use a opção de importação e selecione PHHs compatíveis com o pipeline ou JSONs canônicos produzidos pelo projeto. Arquivos comerciais arbitrários, backups SQLite e exportações de anotações não são equivalentes a um JSON canônico.

O lote aceita até 20 arquivos e 20 MiB somados. Cada PHH tem limite de 1 MiB e cada JSON, 6 MiB. A interface informa por arquivo se foi importado, duplicado, inválido ou não suportado. Não tente corrigir um erro simplesmente reenviando sem ler o motivo. Caso haja timeout, confira a Biblioteca antes de repetir: a escrita pode já ter terminado.

Você pode filtrar mãos, abrir o Replayer, salvar nota, tags, favorito e pendência de revisão. Validação da mão significa conferência legal/estrutural dentro do perfil suportado; não significa que a estratégia é GTO nem autentica a sala de origem.

## Replayer e envio de cenário

Na Biblioteca, use **Abrir no Replayer**, ou entre na aba **Replayer** e escolha um exemplo. Também é possível abrir um JSON canônico local.

Use reproduzir, pausa, próximo/anterior e a barra de eventos. A perspectiva pública mostra cartas privadas apenas quando reveladas; a perspectiva de jogador mostra suas cartas conhecidas; a visão completa pós-sessão mostra o que a fonte conhece até aquele evento.

**Enviar cenário ao Laboratório** transfere o board e as cartas visíveis naquele ponto. Não antecipa cartas futuras, não inventa o range de um adversário e não avalia decisões GTO. Campos vazios/incompletos devem ser preenchidos manualmente. O laboratório precisa de 2–6 jogadores e considera um pote comum, sem side pots.

## Equidade Exata

Entre em **Laboratório Matemático → Equidade Exata**.

1. Para começar, escolha **AA × KK no turn**.
2. Confira jogador 1 `AsAh`, jogador 2 `KsKh` e board `2c 3d 7h 9s`.
3. Clique em **Estimar trabalho**. O esperado é 44 resultados finais.
4. Clique em **Calcular equidade exata**. O esperado é aproximadamente **95,4545%** para J1 e **4,5455%** para J2.

O seletor visual do board fica em **Selecionar cartas de board**. Cartas mortas têm seletor equivalente. Não repita uma carta no board, nas mortas ou no mesmo combo.

O editor de cada jogador permite clicar na matriz 13×13, escolher um peso para novas seleções, adicionar combos específicos e editar seus pesos. Também aceita texto:

```text
AA, AKs:0.5, QJs:0.25
```

Uma mão específica usa `AsAh`, com quatro caracteres juntos. Uma classe como `AA` representa seis combos; `AKs`, quatro; `AKo`, doze, antes dos blockers. Pesos são frações: 0,5 significa metade do peso de 1. Na entrada textual use ponto decimal. Zero exclui o combo do sorteio; o menor peso positivo aceito é 0,000000001. Não use `AA,AsAh` no mesmo range, pois isso sobrepõe o mesmo combo.

**Remover bloqueados** elimina combos atingidos por board/cartas mortas. Abaixo da execução, a contagem conjunta também considera colisões entre jogadores. Os ranges não são multiplicados permitindo repetir uma carta entre duas mãos.

Importar frequências existentes requer escolher um spot e uma ação. A frequência agregada da ação vira peso dos combos da classe, com origem identificada. Isso não reconstrói automaticamente o range de chegada nem transforma uma entrada manual em VERIFIED.

Se a enumeração for grande demais, o sistema a recusa e explica o limite. Você pode reduzir os ranges, fornecer mais cartas do board ou selecionar **Monte Carlo** explicitamente. Não há simulação automática escondida atrás de um resultado chamado exato.

## Monte Carlo

Selecione **Monte Carlo**, mantendo os mesmos ranges, board e mortas.

1. Defina uma seed, por exemplo `meu-estudo-1`.
2. Escolha 1.000 ou 10.000 amostras para iniciar.
3. Clique em **Executar Monte Carlo**.
4. Observe progresso, resultado e curva de convergência. Use **Cancelar cálculo** para interromper.
5. Repita com 100.000 ou 1.000.000 quando viável. Experimentos compatíveis ficam sobrepostos no gráfico.

Mesma seed, entradas, ordem dos combos e versão reproduzem a sequência. Alterar só o número de amostras permite estudar prefixos dessa sequência. Alterar a seed cria outra execução determinística. Mais amostras não garantem uma precisão específica em qualquer situação.

O cálculo tem limites de tempo, tentativas e trabalho. Ranges com muitas colisões podem ser recusados por baixa aceitação. Resultados parciais de uma execução cancelada não são apresentados como experimentos concluídos.

Mantenha a página conectada ao servidor local durante a execução. Ao fechar o iniciador, um cálculo ativo deve ser cancelado após a detecção da perda de conexão, em poucos segundos.

## Como ler equidade e incerteza

- **Vitória**: frequência de vencedor único.
- **Empate**: frequência em que esse jogador participa de uma divisão.
- **Equidade**: fração média do pote; num empate de três jogadores, cada um recebe 1/3.
- **Erro-padrão**: estimativa da variabilidade da média das frações do pote; pode ser zero em uma amostra sem variação, sem provar que eventos raros são impossíveis.
- **IC 95% · Hoeffding**: intervalo conservador para uma variável entre zero e um. Ele continua com largura positiva mesmo em uma amostra constante. Não é uma promessa de que exatamente 95% dos resultados individuais cairão nesse intervalo.

O nível de confiança diz respeito à cobertura em repetições sob as hipóteses do método. Não representa uma probabilidade posterior de o parâmetro fixo estar dentro de um intervalo observado. A curva não tem uma banda simultânea certificada: os intervalos são pontuais.

A exportação registra também uma aproximação normal, que tem limitações em amostras com eventos raros. Equidade exata não tem erro de amostragem; continua condicionada aos ranges, cartas e hipóteses fornecidos.

Use **Exportar experimento completo** para guardar entradas, método, seed, versão, limites, resultados e curva. Os últimos seis experimentos ficam apenas na sessão do laboratório; sair da aba/recarregar pode perdê-los. Eles não são inseridos nos registros GTO do Trainer.

## EV e Sensibilidade

Entre na terceira seção do laboratório. O modelo usa fichas e EV incremental no ponto da decisão:

```text
EV(call) = e × (P + B + C) − C
EV(fold) = 0
EV(blefe puro) = f × P − (1−f) × B
EV(bet) = f × P + c × [q × (P + 2B) − B] − K
EV(check) = ec × P
```

P é o pote antes da aposta; B, a aposta; C, o call. Equidades e probabilidades são frações de zero a um. Fold e call precisam somar um; ajuste os dois campos ou use **Normalizar fold e call** conscientemente. O modelo não inclui raises, rake, side pots ou apostas futuras.

K é um custo adicional fixo ao apostar. O check assume check-down e realização integral da equidade ec. O blefe puro assume equidade zero quando pago e custo adicional zero, independentemente dos campos do bet. O mix combina bet/check pela frequência m fornecida por você.

Com P=10, B=C=5 e e=0,25, EV(call)=0. Com e=0,50, EV(call)=5. Com e=0, EV(call)=−5. Para blefe puro com P=10 e B=5, fold de 1/3 é break-even; fold de zero dá EV −5 e fold de um dá EV +10.

Escolha o parâmetro do gráfico para ver sua sensibilidade. Ao variar fold ou call no gráfico, o outro ramo é explicitamente 1−x; os demais parâmetros ficam fixos. Salve cenários com diferentes sizings/equidades e compare suas entradas e resultados. Exporte a comparação para conservá-la.

O maior EV de um modelo simplificado só é maior **sob suas hipóteses**. Isso não comprova a melhor estratégia GTO real. EV monetário, ICM e PKO são INDISPONÍVEIS neste novo modelo. A aba anterior **Lab EV & ICM** continua separada, com suas próprias entradas e limitações.

## Backup e proteção dos dados

A Biblioteca fica em:

```text
%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3
```

Use a opção de backup da Biblioteca para criar uma cópia consistente, respeitando o limite de 32 MiB dessa exportação. Guarde-a em outro local confiável. Como alternativa, encerre completamente o GTO Trainer antes de copiar o arquivo SQLite manualmente. Se houver arquivos auxiliares de uma conexão ainda ativa, não assuma que copiar só o `.sqlite3` produz um backup consistente.

O iniciador não apaga ou recria um banco existente. Um erro de integridade exige diagnóstico ou restauração de backup, não exclusão do original. Para restaurar manualmente, feche o aplicativo, preserve uma cópia do arquivo atual e coloque uma cópia compatível do backup no caminho correto.

Histórico de estudo do Trainer e configurações anteriores também usam localStorage do navegador. Não são incluídos automaticamente no backup SQLite. Não limpe dados do site se quiser preservá-los. Navegadores, `localhost`, `127.0.0.1` e portas diferentes têm armazenamentos distintos: um histórico aparentemente vazio em outra origem não significa que o antigo foi apagado.

## Seu roteiro de teste de navegador

Faça primeiro em desktop e depois em largura de celular, por exemplo 390×844 nas ferramentas do navegador. O servidor permanece em loopback; testar responsividade não significa expor a Biblioteca na rede ou acessar pelo telefone de outra máquina.

| Teste | Resultado esperado |
|---|---|
| Abrir o atalho com servidor parado | Janela do iniciador; navegador abre após prontidão; sem terminal |
| Segundo lançamento | Reabre a mesma instância, sem outro servidor |
| Biblioteca → importar fixture PHH compatível | Mão listada; sem avaliação GTO automática |
| Abrir Replayer, avançar/voltar e mudar perspectiva | Board e cartas respeitam o evento e a perspectiva |
| Enviar cenário com cartas desconhecidas | Campos desconhecidos não são completados automaticamente |
| Empate no royal | J1=50%, J2=50%; ambos empatam em 100% dos casos |
| AA × KK no turn | 44 resultados; 95,4545% × 4,5455% |
| Range ponderado | J1=66,6667%, J2=33,3333% |
| Pré-flop AA × KK em Equidade Exata | Recusa por limite, sem troca automática para Monte Carlo |
| MC com seed fixa, repetido | Mesmas estimativas e contagens, desconsiderando tempo |
| MC 1k, 10k, 100k e 1M | Curvas/intervalos e progresso; precisão sem promessa automática |
| Cancelar MC | Worker para e parcial não vira resultado concluído |
| Fechar iniciador durante cálculo longo | Servidor encerra; cálculo é cancelado após perda de conexão |
| EV(call) P=10, B=C=5, e=0,25 | Zero |
| Fold + call diferentes de 1 | Cálculo bloqueado; normalização só após seu clique |
| Sensibilidade ec/m | Gráfico muda EV(check)/EV(mix) |
| Trocar pelas abas antigas | Trainer, Ranges, Erros Fatais, Currículo, Estatísticas e ICM continuam acessíveis |
| Encerrar e reabrir com mão/notas salvas | Biblioteca e anotações permanecem |
| Celular | Controles utilizáveis; tabela pode rolar horizontalmente; página sem conteúdo cortado |

Anote para cada falha: navegador e versão, resolução, passos, entradas usadas, mensagem exibida e resultado esperado. Se medir desempenho, separe o tempo de cálculo informado pelo motor do tempo até a tela terminar de desenhar. Antes de compartilhar imagens/logs, oculte mãos, nomes, notas ou configurações pessoais.

## Limites de GTO

EXACT_ENUMERATION significa cálculo exaustivo da equidade condicionada às entradas. MONTE_CARLO_ESTIMATE significa estimativa com incerteza. MODEL_BASED_EV significa cálculo sob um modelo declarado. Nenhum desses rótulos certifica uma estratégia GTO.

Um range manual não recebe VERIFIED. A solução TexasSolver existente mantém sua proveniência e continua sem EV individual por ação quando a exportação não o fornece. Os laboratórios não preenchem `matrixEv` nem `evLoss` com aproximações.

O programa é para estudo offline e revisão pós-sessão; não oferece HUD, captura ou automação de ações em jogos ativos. A Fase 4 não foi iniciada.
