# Fase 2A — Fundação do banco de mãos

**Data:** 13/11/2026, America/Fortaleza. Evidências geradas com timestamps UTC.

**Estado: pronta para auditoria dentro do perfil `PHH_NT_SUBSET_1`.** É possível importar, reconstruir, validar e armazenar localmente os exemplos documentados abaixo. Não se declara suporte completo ao PHH. Esta entrega termina na Fase 2A; não inclui interface de banco, replayer visual, estatísticas, diagnóstico GTO ou Fase 2B.

## 1. Auditoria inicial e arquitetura adotada

Foram consultados `docs/ARQUITETURA_E_PLANO.md`, `docs/AUDITORIA_GTO_VERIFICADO.md`, `docs/PRIMEIRO_SPOT_GTO_REAL.md`, os relatórios de implementação/homologação da Fase 1 e `Dossie/DOSSIER_GITHUB_POKER_METODOS_NUMERICOS.md`. Afirmações desses relatórios são contexto; os resultados desta fase foram executados novamente.

Foram examinados os módulos reais e seus testes: `cards.ts` (`normalizeCardCode`, `validateDeckUnique`), `stateEngine.ts` (`validateGameState`, `getLegalActions`, `getPositionsForSeatCount`, `computeSidePots`, `roundBb`), `mathEngine.ts`, `strategySchema.ts`, `solverAdapter.ts` e os testes de núcleo, auditoria, solver e Fase 1. Também foi inspecionado o diff preexistente antes das edições.

Conclusões extraídas do código:

- O motor TypeScript representa estados pontuais, valida cartas/valores e oferece ações legais. Não é um redutor cronológico completo e não avalia a força de mãos em showdown.
- Seus valores são números em BB, com arredondamento a três casas em partes do motor. Não servem como armazenamento monetário exato arbitrário.
- `mathEngine.ts` contém modelos matemáticos de estudo; não deve ser convertido em avaliador de showdown ou em estimador de EV de históricos.
- `CanonicalSpot`/`ReferenceStrategy` e os adaptadores de solver representam soluções estratégicas. Um histórico válido não é uma solução GTO e usa um contrato separado.

Foi escolhido um **adaptador Python isolado para PokerKit**, em vez de escrever outro motor de regras em TypeScript. O pipeline existente já contém ferramentas Python. A única dependência nova é PokerKit 0.7.7, MIT, fixada por versão e SHA-256, instalada em ambiente virtual próprio. Nenhum pacote npm, configuração de lint ou script existente foi alterado.

Fluxo implementado:

```text
PHH bruto local (UTF-8/TOML)
  -> validação do perfil, tipos, recursos e precisão
  -> Decimal -> átomos inteiros
  -> State PokerKit, operação a operação, sem reparo de decisões
  -> ledger, snapshots, cartas, conservação e resultados declarados
  -> CanonicalHand 1.0.0 / JSON
  -> SQLite local opcional, com fonte bruta preservada
  -> releitura com hash e reconstrução da fonte
```

A ponte TypeScript é somente leitura. Reutiliza `cards.ts`, `getPositionsForSeatCount` e `computeSidePots` para conferências limitadas; não cria um `GameState` com herói, modalidade ou cartas fictícias. Não foi ligada à interface do treinador nem à API de coach.

## 2. Bibliotecas avaliadas e proveniência

Pesquisa realizada em fontes primárias durante esta execução, e conferida com a distribuição instalada quando aplicável.

| Projeto | Versão/referência observada | Licença e interface | Decisão |
|---|---|---|---|
| PHH Standard | Documentação estável **0.0.2**; não é a versão do dataset | MIT; especificação TOML, códigos de variante e ações textuais | Formato de entrada prioritário, com perfil explicitamente menor que a especificação |
| PokerKit | **0.7.7**, publicado em 12/10/2026; 0.7.8 ainda descrito como trabalho em andamento no changelog consultado | MIT; Python >=3.11, API de estados e parser de ações; sem dependências transitivas obrigatórias nos metadados desta distribuição | Motor de regras externo ao treinador, fixado por hash |
| PHH Dataset | Release **v3**, referência curta `e2ec038` na página de releases | MIT no repositório; arquivos PHH, não uma biblioteca executável | Adequado a testes futuros após seleção/proveniência por fonte. Não baixado nem incorporado nesta fase |
| FPDB-3 | Release **v3.10.0**, referência `550af42`; o `pyproject.toml` consultado em `development` ainda declara 3.9.1 | AGPL-3.0-or-later no manifesto; Python >=3.11, dependências de desktop/banco e recursos de tracker/HUD | Não incorporado, instalado ou copiado. Escopo e obrigações distintos da fundação mínima |

Fontes: [PHH Standard e licença](https://github.com/uoftcprg/phh-std), [campos obrigatórios PHH](https://phh.readthedocs.io/en/stable/required.html), [campos opcionais PHH](https://phh.readthedocs.io/en/stable/optional.html), [distribuição PokerKit](https://pypi.org/project/pokerkit/0.7.7/), [API/notação PokerKit](https://pokerkit.readthedocs.io/en/stable/notation.html), [changelog PokerKit](https://github.com/uoftcprg/pokerkit/blob/main/CHANGELOG.rst), [dataset e suas fontes](https://github.com/uoftcprg/phh-dataset), [releases do dataset](https://github.com/uoftcprg/phh-dataset/releases), [release FPDB](https://github.com/jejellyroll-fr/fpdb-3/releases/tag/v3.10.0), [manifesto FPDB consultado](https://raw.githubusercontent.com/jejellyroll-fr/fpdb-3/development/pyproject.toml).

Manutenção: PokerKit e FPDB apresentam releases recentes nas fontes consultadas. PHH é especificação e o dataset tem seu próprio ciclo de publicação; não foram tratados como dependências de runtime com o mesmo versionamento. A diferença entre o manifesto FPDB e a página de release foi preservada, sem escolher silenciosamente um como prova do outro.

Atribuição da dependência: PokerKit, Universal, Open, Free, and Transparent Computer Poker Research Group, copyright 2023–2026; licença MIT incluída na distribuição instalada. O código da dependência permanece no ambiente virtual, não foi vendorizado. A adoção foi pela API pública; nenhum código AGPL foi adicionado. Não foi encontrado um arquivo de licença geral do aplicativo nesta inspeção; este relatório não redefine a licença do projeto ou dos componentes antigos.

O wheel autorizado pelo perfil é `pokerkit-0.7.7-py3-none-any.whl`, SHA-256:

```text
4e946cc5c48558a9a4583f3a00f13960bd5b719144643104642031552c59ec76
```

O hash foi consultado nos [metadados oficiais PyPI](https://pypi.org/pypi/pokerkit/0.7.7/json) e verificado por `pip --require-hashes`. Registro: `docs/fase2a-evidencias/python-dependency.log`.

### Ressalva do motor e ausência de reparos

O changelog 0.7.8 anuncia correção adicional para aumentos após all-in curto. O perfil bloqueia **qualquer nova ação `cbr` na mesma street depois de um aumento incompleto**, retornando `UNSUPPORTED/SHORT_ALLIN_REOPEN_UNSUPPORTED`. Calls e folds continuam sujeitos ao motor. O bloqueio é conservador: também exclui algumas sequências legalmente possíveis. Não se declara esse problema resolvido em 0.7.7.

A inspeção da distribuição local identificou que o iterador `HandHistory.state_actions` pode inserir ações para reparar históricos. Ele **não é utilizado**. O importador cria `NoLimitTexasHoldem.create_state` sem automations e usa `parse_action` sobre o estado. Cada ação da fonte deve gerar exatamente uma operação. Somente tarefas obrigatórias liberadas por `can_*` são executadas pelo adaptador: antes, blinds, coleta, burn desconhecido, seleção de uma corrida, descarte de mãos perdedoras e movimentação de fichas. Não insere check, call, fold, cartas privadas ou board ausentes.

## 3. Modelo canônico, versão e valores

Contrato explícito: `app/src/lib/poker/handHistorySchema.ts`. Produtor: `pipeline/hand_history/importer.py`.

| Campo/grupo | Conteúdo e política |
|---|---|
| `schemaVersion`, `profile` | `1.0.0`, `PHH_NT_SUBSET_1`; banco tem versão independente 1 |
| `recordId`, `source` | Identidade por SHA-256 dos bytes originais, tamanho, nome de arquivo sem caminho completo, ID reportado quando existe e instante de importação UTC |
| `targetStandardVersion` | Alvo do parser (0.0.2); não afirma que a fonte declarou uma versão |
| `variant`, `gameFormat` | NLHE; modalidade fica `MISSING`, inclusive quando o motor usa política `CASH_GAME` |
| `amountPolicy` | Inteiros não negativos em strings decimais, com escala explícita; moeda somente se reportada |
| `table`, `players` | Blinds/antes originais, mínimo, ante trimming, ordem PHH, assentos físicos e nomes quando presentes, stacks iniciais e cartas |
| `sourceActions`, `events` | Texto original das ações, sequência, índice de origem, operação, jogador, valores pagos/devolvidos/premiados e estados antes/depois |
| `ending` | Street do estado, board conhecido, stacks, apostas pendentes, pote, próximo ator, folds, mucks e all-ins |
| `pots` | Pote principal e laterais na liquidação, elegíveis antes de descartar mãos perdedoras e prêmios por jogador |
| `results` | Contribuições brutas, devoluções, contribuições líquidas, prêmios e stacks finais somente quando concluída |
| `integrity`, `metadata` | Motor/versão, hipóteses, avisos, status de validação e metadados opcionais preservados |

`Observed<T>` distingue `REPORTED`, `INFERRED` (com motivo) e `MISSING` (sem valor). Uma carta explicitamente desconhecida é `null` numa mão reportada, não uma carta escolhida aleatoriamente. Cartas posteriormente reveladas são conciliadas com as já conhecidas; eventos anteriores preservam o conhecimento daquele momento. Muck não apaga cartas conhecidas e é distinto de fold.

Índices canônicos são base zero; `sourceLabel` conserva p1..pN. PHH inverte a atribuição dos arrays de blinds/antes em heads-up: p1 é BB e p2 BTN/SB. Para três ou mais jogadores, p1 SB, p2 BB e o último BTN. Assentos não são ordenados numericamente. O produtor identifica os papéis intermediários como `OTHER`, conservando sua ordem; a ponte TypeScript calcula os nomes posicionais relativos com a função existente, sem afirmar assentos físicos ausentes.

Valores TOML monetários são lidos como `Decimal`, nunca `float`. A escala comum considera valores monetários e alvos `cbr`, preservando casas explícitas até seis. Todos os cálculos do motor usam inteiros atômicos. A soma dos stacks iniciais e cada quantidade escalada não podem superar **2^53−1**. Por exemplo, a fixture de centésimos representa 1,00 como `"100"` e 0,02 como `"2"`, com escala 2. Nenhuma conversão automática em moeda, lucro financeiro ou EV é feita.

Em `CompletionBettingOrRaisingTo`, `amountAtoms` é o **alvo total da street**; `paidAtoms` é o incremento efetivamente retirado do stack. Snapshots são estados operacionais: a street pode já ser a próxima antes de seu board ser distribuído. `potAtoms` inclui apostas ainda não coletadas; não deve ser somado novamente a `betsAtoms` para conservação.

### Conversão de potes e devoluções

PokerKit pode manter fora de `state.pots` a aposta do único sobrevivente quando todos os adversários dão fold. O adaptador concilia essa representação: apenas o excesso sobre a maior aposta adversária é devolvido, e a parcela paga pelos adversários integra o pote e o prêmio. A anotação `UncollectedBetReturn` é derivada, com snapshots iguais; é classificação no ledger, não um segundo crédito no stack. A transferência física ocorre nas operações do motor.

Potes são capturados antes de `HandKilling`, para não confundir uma mão perdedora no showdown com alguém que nunca foi elegível. Mucks explícitos já retiram elegibilidade. Os testes verificam essa distinção, os valores de cada pote e suas distribuições.

## 4. Subconjunto PHH implementado

Entrada: uma mão por arquivo, UTF-8/TOML, `variant="NT"`, 2–9 jogadores, stacks iniciais positivos e conhecidos, SB>0, BB>=SB, `min_bet=BB`, sem straddles/dead blinds. Arrays de stacks, antes e blinds devem ter um item por jogador. Antes podem ser não uniformes e limitados pelo stack; `ante_trimming_status` explícito é encaminhado ao motor. Quando omitido, a política false é registrada como inferida.

Campos obrigatórios: `variant`, `antes`, `blinds_or_straddles`, `min_bet`, `starting_stacks`, `actions`.

O perfil aceita os opcionais textuais de autoria, evento, URL, local/endereço, fuso e moeda; dia/mês/ano, nível, hand/table, nomes, assentos, quantidade de assentos, horário, `finishing_stacks` e `ante_trimming_status`. A allowlist completa é `OPTIONAL` em `importer.py`. Tipos, assentos únicos e datas civis completas são validados. Fuso, URL e moeda são metadados reportados; não são consultados em serviços externos ou convertidos em recomendações.

Ações aceitas:

- Distribuição inicial: um `d dh pN CARTAS` por jogador, p1..pN nessa ordem, exatamente duas cartas; `????` ou uma carta conhecida e uma desconhecida são possíveis.
- `pN cc`, `pN cbr VALOR`, `pN f`: check/call conforme o estado, aposta/aumento para alvo total e fold. Ator, valores, mínimo, stack e etapa são verificados pelo motor.
- `d db CARTAS`: flop inteiro de três cartas, turn/river de uma, sempre conhecidas.
- `pN sm CARTAS`, `pN sm -`, `pN sm`: revelar cartas compatíveis, mostrar as já conhecidas ou muck explícito. O timing deve ser aceito pelo motor; nas fixtures de all-in as revelações precedem o runout.
- Strings vazias/comentários e comentários após `#`, preservados na fonte.

Limites de recursos: 1 MiB, até 500 ações e 2.000 caracteres por ação. Valores `cbr` textuais usam decimal não negativo sem notação científica, até seis casas; zero ainda precisa passar pela legalidade do motor. Booleanos/strings não são convertidos em fichas. Negativos, NaN, infinito, duplicação de cartas, arrays incoerentes, ações fora de ordem e stacks finais contraditórios são rejeitados. Avisos do motor são tratados conservadoramente como erros de importação.

Resultados possíveis:

- `VALIDATED_COMPLETE`: sequência terminada, distribuição conferida e conservação exata.
- `VALIDATED_PARTIAL`: prefixo legal; não prova que a mão terminou. Sem stacks finais computados, vencedor inventado ou liquidação forçada. `pots` fica vazio enquanto a liquidação não começou; o pote corrente está no snapshot.
- `INVALID`: inconsistência, com código, mensagem, campo e índice de ação quando disponíveis.
- `UNSUPPORTED`: formato/variante/recurso fora do perfil, sem descarte silencioso de campos relevantes.

Não suportados: outras variantes, arquivos de salas comerciais, ZIP/lotes, stacks desconhecidos/infinitos, múltiplos boards/runouts, rake, straddles/dead blinds, distribuição parcial de flop, board desconhecido, mais de nove jogadores, reabertura no caso delimitado de all-in curto, campos desconhecidos e opcionais como `winnings`, `time_limit`, `time_banks`. A rejeição de `winnings` é deliberada: esta fase não interpreta pagamentos financeiros nem tenta conciliar semânticas externas de ganhos.

## 5. Persistência, integridade e finalidade

`store.py` usa `sqlite3` da biblioteca padrão. A tabela `hands` guarda ID, hash único, versão do esquema, instante de importação, bytes PHH originais e JSON canônico. Importação valida antes de abrir/criar o banco. Inserções são transacionais. Repetir os mesmos bytes é duplicação; mudar comentários já produz outra identidade. Não se promete deduplicação semântica por ID de sala.

`PRAGMA user_version=1` e `application_id=PHH1` distinguem este banco. Bancos incompatíveis são recusados, sem migração ou substituição. Releitura confere hash/identidade, reconstrói o histórico pelo importador e compara o JSON com essa reconstrução, exceto contexto de ingestão (nome de arquivo e horário da importação). O contexto também é validado: nome tem estrutura tipada e timestamp UTC deve coincidir com a coluna de ingestão. A comparação distingue tipos JSON, inclusive booleano versus inteiro. Isso também ocorre ao detectar duplicatas. Erros de arquivo/SQLite geram diagnóstico local; nenhum registro inválido é “consertado” para persistir.

O SHA-256 identifica os bytes recebidos; não autentica o autor, a sala, a veracidade histórica ou a modalidade. O banco não tem assinatura, criptografia ou anonimização automática. Os metadados podem conter informações pessoais e ficam locais, assim como a fonte original. O diretório `local/`, bancos SQLite e ambiente virtual são ignorados pelo Git desta ferramenta. Escolha armazenamento fora de pastas sincronizadas para históricos pessoais; o repositório desta execução está no OneDrive. Nesta execução foram usados somente exemplos sintéticos próprios e bancos temporários.

Não há sockets, HTTP, monitoramento de pastas, integração com clientes, HUD, captura ao vivo ou decisão de mesa neste fluxo. O teste de importação com conexões de socket bloqueadas passou. A instalação inicial da dependência pode usar PyPI; importar/exportar mãos depois dela funciona offline. Nenhum histórico pessoal foi enviado a serviços externos. A API de coach existente não recebe dados deste módulo.

`integrity.gtoAnalysis="NOT_EVALUATED"` e `evLoss=null` em todas as saídas. Validação de regras não usa as classes `VERIFIED`, `DIDACTIC_DEMO`, `IMPORTED_CHART_NO_EV` ou `UNSOLVED` de estratégias. Não são criados ranges, estratégias, pontuações GTO ou diagnósticos financeiros.

## 6. Utilização e reprodução

Na raiz do repositório, com Python >=3.11 e Node compatível com os testes TypeScript existentes:

```powershell
python -m venv pipeline/hand_history/.venv
pipeline/hand_history/.venv/Scripts/python.exe -m pip install --no-deps --only-binary=:all: --require-hashes -r pipeline/hand_history/requirements.txt

# Validar e imprimir JSON no stdout; não cria banco.
pipeline/hand_history/.venv/Scripts/python.exe -m pipeline.hand_history.cli import pipeline/hand_history/fixtures/hu_fold.phh

# Banco local opcional, com diretório de destino previamente criado.
pipeline/hand_history/.venv/Scripts/python.exe -m pipeline.hand_history.cli import pipeline/hand_history/fixtures/hu_fold.phh --database C:/PokerStudyLocal/hands.sqlite3

# Substitua o ID pelo recordId devolvido na importação.
pipeline/hand_history/.venv/Scripts/python.exe -m pipeline.hand_history.cli export C:/PokerStudyLocal/hands.sqlite3 phh-sha256:HASH_DA_FONTE

pipeline/hand_history/.venv/Scripts/python.exe -m unittest pipeline.hand_history.test_hand_history -v
node docs/fase2a-evidencias/verificar-fase2a.mjs

Set-Location app
npm test
npm run lint
npm run typecheck
npm run build
```

CLI retorna código 0 para sucesso e 2 para rejeição/erro diagnosticado; sucesso pode ser parcial, portanto confira `status`. `export` devolve o JSON canônico, não reconverte para PHH. A fonte bruta permanece no banco. As funções `import_phh`, `import_into_database` e `read_hand` também podem ser usadas diretamente em Python.

Em sistemas POSIX use `.venv/bin/python`. Para os testes Node e o verificador, `POKER_HH_PYTHON` pode indicar outro executável com a mesma dependência fixada. A ausência de ambiente Python não causa skip silencioso dos testes de integração. Para instalação completamente offline, obtenha previamente o wheel cujo hash consta acima e use `pip --no-index --find-links DIRETORIO_DOS_WHEELS` com os mesmos requisitos; não é necessário acesso a dataset/servidor de poker. O ambiente virtual não é distribuído pelo Git.

## 7. Fixtures, testes e resultados efetivamente observados

Todas as fixtures foram criadas nesta fase para testar regras, **não foram extraídas do dataset nem representam estratégias GTO**.

| Fixture em `pipeline/hand_history/fixtures/` | Referência analítica e resultado observado |
|---|---|
| `hu_fold.phh` | HU, p1 BB; assentos físicos 4/2. SB desiste. Pote 2, excesso 1 devolvido a BB; stacks 101/99 |
| `decimal_fold.phh` | Mesma lógica em centésimos, sem erro binário; átomos finais 101/99, escala 2 |
| `three_way_allin.phh` | AA/KK/QQ com stacks 50/100/200, board baixo; principal 150 para AA, lateral 100 para KK, 100 devolvidos a QQ; finais 150/100/100 |
| `folded_sidepot.phh` | SB folded deixa 1; principal 151 para AA, lateral 100 para KK, excesso 100 devolvido; finais 99/100/151/100 |
| `split_odd_ante.phh` | Ante não uniforme; royal no board; pote 5 dividido 3/2 por ordem do motor; finais 101/99/100 |
| `showdown_muck.phh` | Muck de p1, cartas conhecidas preservadas; pote 4 para p2; finais 98/102 |
| `partial_flop.phh` | Prefixo legal aguardando p2 no flop; nenhum resultado final fabricado |
| `invalid_missing_call.phh` | Board antes das ações pré-flop; `INVALID/ILLEGAL_ACTION`, índice 2; nenhuma ação inserida |

Casos adicionais são montados nos testes: bet/raise/call/fold em múltiplas streets; short call e blind parcial; calls após all-in curto e bloqueio de reabertura; carta repetida, contagem inválida e mudança indevida no showdown; desconhecidos sem força de mão fabricada; metadados/assentos/data; precisão, não finitos, negativos e overflow; formatos/recursos excluídos; comentários; conservação antes/depois de cada evento; matriz de folds com antes e alvos diferentes; duplicação, releitura, corrupção de JSON/fonte, banco incompatível, rollback e erros de armazenamento; CLI import/export e códigos de diagnóstico.

| Comando executado | Resultado observado | Evidência |
|---|---|---|
| Python `unittest` | **33 testes passaram**, sem falhas | `docs/fase2a-evidencias/python-tests.log` |
| `npm test` | **73 testes passaram**, 17 suites, zero falhas/skips; 10 testes novos de integração | `docs/fase2a-evidencias/npm-test.log` |
| `npm run lint` | Código 0, sem erros ou warnings de ESLint | `docs/fase2a-evidencias/npm-lint.log` |
| `npm run typecheck` | Código 0, sem erros de tipos | `docs/fase2a-evidencias/npm-typecheck.log` |
| `npm run build` | Código 0; compilação, tipos e geração das 5 páginas concluídas | `docs/fase2a-evidencias/npm-build.log` |
| Verificador de evidências | 87 arquivos preexistentes conferidos, **zero alterações**; 8 fixtures reimportadas | `docs/fase2a-evidencias/evidencias.json` |

Ambiente observado (também em `docs/fase2a-evidencias/ambiente.json`): Windows, Python **3.15.0**, SQLite **3.53.4**, PokerKit **0.7.7**, Node **24.22.0**, Next.js **15.5.29**. O pacote declara Python >=3.11; os classificadores publicados inspecionados enumeram até 3.13. O sucesso local em 3.15 não é certificação de todas as versões/plataformas. O aviso legado `MODULE_TYPELESS_PACKAGE_JSON` do Node continua nos testes e não foi silenciado.

O build foi precedido de limpeza apenas dos artefatos gerados de `app/.next`, com verificação de caminhos e preservação de cache, por causa das particularidades do OneDrive já registradas. Não houve supressão de lint, tipos ou testes. Não foi feita nova inspeção visual do treinador: não há UI nova nesta fase; a evidência de regressão é a suíte existente e a preservação byte a byte dos arquivos.

A conferência independente em TypeScript passou para cartas e side pots das cinco fixtures completas sem antes. É limitada a valores representáveis exatamente em milésimos de BB e a no máximo 100.000 BB por quantidade projetada. Para ante, prefixo parcial ou precisão incompatível retorna `UNAVAILABLE`, sem arredondar e aprovar. Divergência real de cartas/potes e versão incompatível também têm testes negativos. PokerKit é o motor principal desta entrega; reexecutar sua API não é apresentado como um segundo oráculo independente de regras/showdown.

## 8. Arquivos criados e controle das alterações

**Nenhum arquivo preexistente foi editado por esta fase.** O Git já continha alterações da Fase 1/homologação, que foram preservadas. `baseline.json` registra status inicial, HEAD `8af89a4fdf341e9ef79324fc21ee0035d423ef27` e hashes dos 87 arquivos. O diff rastreado ao término continua sendo o preexistente; os arquivos desta fase são novos.

Arquivos novos:

- `app/src/lib/poker/handHistorySchema.ts`: contrato canônico tipado, valores observados e resultados de importação.
- `app/src/lib/poker/handHistoryAdapter.ts`: conferência de leitura com cartas, posições e side pots existentes.
- `app/src/lib/__tests__/handHistory.test.ts`: dez testes de integração real com o CLI Python e os motores TypeScript.
- `pipeline/hand_history/__init__.py`, `.gitignore`, `requirements.txt`: pacote isolado, arquivos locais excluídos e dependência fixada.
- `pipeline/hand_history/importer.py`: parser restrito, orquestração rigorosa do motor, ledger e representação canônica.
- `pipeline/hand_history/store.py`: banco local, transações, duplicação, versões e releitura auditada.
- `pipeline/hand_history/cli.py`: comandos locais import/export e diagnósticos JSON.
- `pipeline/hand_history/test_hand_history.py`: 33 testes Python.
- As oito fixtures listadas na seção 7.
- `docs/CODEX_FASE2A_BANCO_MAOS.md`: este relatório.
- `docs/fase2a-evidencias/baseline.json`, `verificar-fase2a.mjs`, `evidencias.json`, `ambiente.json`, `hu_fold.canonical.json`, `python-dependency.log`, `python-tests.log`, `npm-test.log`, `npm-lint.log`, `npm-typecheck.log`, `npm-build.log`.

O exemplo `hu_fold.canonical.json` é saída efetivamente gerada, com todos os eventos, e não uma representação desenhada manualmente para ilustrar o contrato. Reexecutar o verificador atualiza timestamps/evidências, sem modificar fontes ou dados do treinador.

Cartas, estado, matemática, currículo RegLife, catálogo de erros, avaliador, navegação, contratos/adaptadores de solver, ranges, bundle e artefatos originais TexasSolver permaneceram com os mesmos bytes do snapshot. Não foram criados EVs por ação para o TexasSolver nem modificadas suas soluções.

## 9. Riscos residuais e recomendações para a Fase 2B

O perfil é intencionalmente restrito. Não há cobertura de formatos comerciais, amostra real do PHH Dataset, múltiplas plataformas/versões Python ou variações de regras de salas. Dependências podem conter defeitos; a ressalva concreta de all-in curto foi delimitada, não corrigida por uma regra caseira. A política de ficha ímpar é a do motor/ordem PHH, sem pretensão de representar todas as salas. Históricos com rake não declarado podem parecer um prefixo sem resultados externos suficientes para confronto; a hipótese sem rake sempre acompanha a saída.

Não existe importação em massa, índice analítico, edição de mãos, decodificador runtime para JSON arbitrário no frontend ou migração automática. O TypeScript recebe saída confiável do importador, não substitui a validação do PHH. O banco armazena dados pessoais em texto legível e não oferece backup/criptografia. Fonte e hash permitem rastreio, não prova de autenticidade de uma sala ou avaliação de qualidade estratégica.

Para uma futura Fase 2B, recomenda-se auditar este contrato/ledger, acrescentar amostras externas pequenas com licença e proveniência verificadas, comparar showdowns com outro avaliador independente, validar uma versão estável que resolva a reabertura após all-in curto e definir políticas de sala antes de ampliar o perfil. Depois, projetar a interface de consulta/replay apenas sobre eventos validados e introduzir validação runtime na fronteira JSON correspondente. Essas recomendações **não foram implementadas** nesta entrega.

**Conclusão:** os exemplos documentados podem ser importados e validados offline, com fonte preservada, valores exatos e liquidação testada, sem modificar o treinador ou promover históricos a evidência GTO. A entrega encerra a Fase 2A e está disponível para auditoria do subconjunto declarado.
