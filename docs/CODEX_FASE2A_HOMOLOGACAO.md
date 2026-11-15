# Homologação técnica da Fase 2A — Banco de mãos

**Data local:** 13/11/2026 — America/Fortaleza. Evidências em UTC.

**Resultado: APROVADA COM RESSALVAS**, após três correções pontuais no importador e esclarecimento documental do contrato. A aprovação cobre o perfil `PHH_NT_SUBSET_1`, as sequências e invariantes exercitadas, sem suporte integral ao PHH ou certificação de todas as regras de salas. O contrato `CanonicalHand` é uma base suficientemente estável de armazenamento e eventos para planejar a Fase 2B, com as condições de consumo temporal e validação runtime descritas na seção 8. A Fase 2B e a interface de replay não foram iniciadas.

## 1. Método, arquivos examinados e controle

Foram lidos o relatório `docs/CODEX_FASE2A_BANCO_MAOS.md`, os módulos `pipeline/hand_history/importer.py`, `store.py`, `cli.py`, os contratos `app/src/lib/poker/handHistorySchema.ts` e `handHistoryAdapter.ts`, as oito fixtures e os testes Python/TypeScript associados. Foram confrontados os contratos do treinador (`stateEngine.ts`, `cards.ts`, `strategySchema.ts`, `solverAdapter.ts`) e a forma de importação dos módulos. Os resultados anteriores foram tratados como histórico, não como prova desta homologação.

Funções centrais examinadas: `parse_document`, `exact_number`, `Session.atoms`, `snapshot`, `step`, `drain`, `action`, `parse_action_return`, `import_phh`, `connect`, `import_into_database`, `read_hand`, `cli.main` e `crossCheckHandWithExistingEngine`. A correção adiciona `integer_atoms` para conversão exata.

Antes de editar foram executados `git status --short`, `git diff --stat` e a busca por instruções locais. O repositório já continha Fase 1 e Fase 2A sem commit. O snapshot `docs/homologacao-fase2a/baseline.json` registra HEAD `8af89a4fdf341e9ef79324fc21ee0035d423ef27`, status e hashes de **117 arquivos preexistentes**. Nenhuma alteração anterior foi revertida.

A comparação final autoriza e identifica somente dois arquivos preexistentes alterados:

1. `pipeline/hand_history/importer.py`: três defeitos reproduzidos corrigidos.
2. `app/src/lib/poker/handHistorySchema.ts`: dois comentários sobre conhecimento temporal; sem mudança de campos ou versão.

Os outros **115 arquivos** ficaram com os mesmos bytes. Isso inclui `store.py`, `cli.py`, `handHistoryAdapter.ts`, testes anteriores, manifests, Fase 1, treinador, cartas, estado, matemática, currículo RegLife, ranges, contratos/adaptadores de estratégia, bundle e artefatos TexasSolver. Não houve atualização de dependência ou alteração de EV.

As versões iniciais usadas na reprodução estão em `docs/homologacao-fase2a/antes/`, conferidas contra o SHA-256 do snapshot. O diff verificável é `correcoes.diff`. Relatórios e logs anteriores foram preservados. O verificador original da Fase 2A foi executado por um wrapper que guarda sua nova saída nesta pasta e restaura os dois arquivos de evidência originais, byte a byte.

## 2. Arquitetura e separação de responsabilidades

Confirmado no código:

- PokerKit aplica as regras cronológicas e avalia showdowns apenas no pipeline Python offline. Não é executado pelo treinador nem introduzido no bundle Next.js.
- O importador cria `NoLimitTexasHoldem` sem automations e chama `parse_action` diretamente. `HandHistory.state_actions`, que pode reparar sequências, não é usado. Cada ação reportada deve produzir exatamente uma operação; `drain` executa somente operações obrigatórias permitidas por `can_*`.
- O motor TypeScript continua independente. A ponte reutiliza cartas, posições e side pots para uma conferência limitada de dados já validados; não é um importador JSON arbitrário nem outro motor cronológico.
- `CanonicalHand` não possui `ReferenceStrategy`. Os históricos saem com `gtoAnalysis="NOT_EVALUATED"` e `evLoss=null`. `VALIDATED_COMPLETE` significa término legal/reconciliado, não estratégia `VERIFIED`.
- Não há fluxo dos históricos para a API de coach, solver, HUD ou cliente de poker.

Também foram mantidas as limitações reais da ponte: antes, prefixos parciais e quantidades não projetáveis exatamente em milésimos de BB retornam `UNAVAILABLE`. Ela não deve servir como autorização de JSON não confiável. Nenhuma restrição foi removida para aumentar aceitação.

## 3. Defeitos reproduzidos e correções

### P1 — Conversão monetária dependia da precisão global de Decimal

Reprodução: importar stacks `123456.123456` com `decimal.localcontext().prec=6`. A versão inicial retornava `VALIDATED_COMPLETE`, mas convertia o stack para `"123456000000"`, quando o valor correto na escala seis é `"123456123456"`. A conservação interna ainda passava porque o motor recebia números já arredondados. Portanto, a ausência de `float` não bastava para provar exatidão.

Correção: `integer_atoms` desloca coeficiente/expoente decimais com inteiros Python. O controle de overflow e `Session.atoms` usam a mesma conversão, sem multiplicação Decimal dependente do contexto do chamador. A escala permanece limitada a seis casas e o total a 2^53−1. Não foram relaxados limites nem corrigidos stacks para fazer testes passarem.

Regressão: contextos de precisão 1, 6 e 28, arredondamento `ROUND_DOWN` e trap `Inexact` ativo produzem os mesmos átomos corretos. Também foram exercitados o total exato 2^53−1, seu excesso de uma unidade e blinds de 0,000001/0,000002. O contexto externo não é modificado.

### P2 — Aninhamento TOML escapava do diagnóstico estruturado

Uma entrada abaixo de 1 MiB, com 1.200 arrays aninhados, produzia `RecursionError` não tratado em `tomllib`, em vez do resultado de importação. Agora retorna `UNSUPPORTED/PHH_NESTING_LIMIT`, sem mão canônica. O teste usa a entrada real, não apenas um mock da exceção. A documentação não promete aceitar aninhamento arbitrário.

### P2 — Revelação pós-liquidação recebia classificação de ilegalidade

`d dh p1 2c3d`, `d dh p2 AsKd`, `p2 f`, `p1 sm -` era classificado como `INVALID/ACTION_AFTER_END`. A especificação PHH prevê revelação depois de todos os adversários desistirem. Esse caminho continua fora do perfil implementado, mas passa a retornar **`UNSUPPORTED/POST_TERMINAL_SHOW_UNSUPPORTED`**, com índice 3. Uma decisão de aposta após o fim, como `p1 cc`, continua `INVALID`. O suporte não foi ampliado e nenhum pagamento foi refeito.

A referência é a seção de showdown da [PHH 0.0.2](https://phh.readthedocs.io/en/stable/required.html).

### P3 — Agregado final de cartas podia ser confundido com frame temporal

`players[].holeCards` é o agregado final de conhecimento da fonte; `sourceActionIndex` pode ser atualizado por um show `-` mesmo quando as cartas já eram conhecidas. Não representa necessariamente a primeira revelação. Um consumidor futuro que vinculasse esse agregado a todos os frames mostraria informações futuras ou esconderia cartas já conhecidas.

Não há replay atual que reproduza esse defeito de interface. Foi acrescentado somente um comentário no contrato e um teste temporal: distribuição `[null,null]` permanece desconhecida no evento original; `2c3d` aparece no evento de revelação posterior. A recomendação de consumo está na seção 8, sem criar interface ou nova API.

O JSON SQLite aninhado também foi testado: a versão original já o recusava com `StoreError` neste ambiente. **Não foi declarado um defeito inexistente nem alterado `store.py`.** `auditoria.json` distingue explicitamente esse teste das três reproduções corrigidas.

## 4. Conferência matemática das oito fixtures

Para cada evento foram conferidas continuidade `before`/`after`, vetores, não negatividade das movimentações e:

```text
soma(stacks do snapshot) + potAtoms = soma(stacks iniciais)
contribuição líquida[i] = contribuição bruta[i] − devolução[i]
stack final[i] = inicial[i] − contribuição líquida[i] + prêmio[i]
soma(contribuições líquidas) = soma(potes) = soma(prêmios), em mãos concluídas
```

`betsAtoms` já está incluído em `potAtoms`: somá-lo novamente cria fichas artificiais. Em cada pote, a distribuição soma seu valor e somente jogadores elegíveis recebem prêmios. A soma dos vetores de todos os eventos coincide com os agregados de `results`. Referências de contribuições, devoluções, prêmios, elegíveis, potes e finais foram escritas explicitamente nos testes, não extraídas dinamicamente do resultado do importador.

Valores abaixo são **átomos**, na ordem p1..pN. Na fixture decimal a escala é dois; nas outras, zero.

| Fixture | Bruta | Devolução | Líquida | Potes | Prêmios | Stacks finais |
|---|---|---|---|---|---|---|
| `hu_fold` | 2,1 | 1,0 | 1,1 | 2 | 2,0 | 101,99 |
| `decimal_fold` | 2,1 | 1,0 | 1,1 | 2 | 2,0 | 101,99 |
| `three_way_allin` | 50,100,200 | 0,0,100 | 50,100,100 | 150 + 100 | 150,100,0 | 150,100,100 |
| `folded_sidepot` | 1,100,50,200 | 0,0,0,100 | 1,100,50,100 | 151 + 100 | 0,100,151,0 | 99,100,151,100 |
| `split_odd_ante` | 2,3,0 | 0,0,0 | 2,3,0 | 5 | 3,2,0 | 101,99,100 |
| `showdown_muck` | 2,2 | 0,0 | 2,2 | 4 | 0,4 | 98,102 |

Referências adicionais:

- No HU, somente o excesso 1 do BB é devolvido; a parte paga pelo adversário integra o pote 2. `UncollectedBetReturn` é classificação no ledger com snapshots iguais. O crédito físico ocorre no motor, sem uma segunda devolução aplicada pelo auditor.
- No all-in triplo, o principal é `3×50=150`; o lateral é `2×(100−50)=100`; o excesso `200−100=100` retorna a p3. AA vence o principal e KK o lateral.
- Com SB folded, seu 1 permanece: `3×50+1=151`, mais o lateral 100. SB não é elegível. O total inicial 450 termina em `99+100+151+100=450`.
- No empate, `2+3=5` com ante não uniforme. O board royal empata p1/p2; divisão inteira 2 para cada e a ficha restante para p1 segundo a política PHH/motor declarada. Isso não certifica a convenção de todas as salas.
- `partial_flop`: dois stacks 98 mais pote 4 conservam 200; status `VALIDATED_PARTIAL`, sem stacks finais computados ou liquidação forçada.
- `invalid_missing_call`: status `INVALID`, índice 2; nenhuma mão ou decisão reparadora foi produzida.

### Independência da conferência

`test_homologacao.py` contém um pequeno **avaliador de teste** que enumera as 21 combinações de cinco entre sete cartas e compara categorias/kickers por contagens, sequência e naipe. Ele não chama PokerKit, não aplica regras de apostas, não calcula equity/EV e não é importado pelo aplicativo. Categorias, wheel e desempates básicos têm referências analíticas próprias. Um teste altera deliberadamente um premiado em memória e exige que a conferência falhe.

Esse avaliador confirmou **seis disputas de pote**: quatro nos dois casos de side pots, uma no empate e uma no histórico externo Ivey/Dwan. As mãos encerradas por folds/muck foram conferidas por elegibilidade e aritmética, sem atribuir vitória pela qualidade de uma decisão.

Isso é validação independente limitada de rankings/distribuições, **não** um segundo motor completo ou uma certificação exaustiva de NLHE. Os testes de legalidade cronológica ainda dependem do PokerKit e de sequências determinísticas de referência. Essa distinção permanece uma ressalva da homologação.

## 5. Compatibilidade PHH e amostra externa

O perfil foi comparado com os [campos e ações PHH 0.0.2](https://phh.readthedocs.io/en/stable/required.html) e seus [campos opcionais](https://phh.readthedocs.io/en/stable/optional.html). Conferidos: `NT`, ordem p1..pN, atribuição invertida de blinds/antes em HU, alvos totais `cbr`, check/call contextual, distribuição 3/1/1 do board, unknown `??`, show `-`, muck e prefixos legais.

As restrições do perfil continuam explícitas: DH completo ordenado, stacks conhecidos, no máximo nove jogadores, SB/BB sem straddle/dead blind, sem rake ou múltiplos boards, antes/escala delimitados, allowlist de campos e proteção de all-in curto. Um registro fora desse conjunto não precisa ser aceito para homologar o subconjunto. Ausência de modalidade continua `MISSING`; o modo `CASH_GAME` do motor é uma hipótese de execução, não prova de modalidade. Posições intermediárias `OTHER` conservam a ordem; nomes relativos podem ser inferidos pela ponte, sem criar assentos físicos.

Foi selecionada uma amostra pequena e previamente delimitada do **PHH Dataset, tag v3**: três mãos consecutivas 0/1/2 do diretório Pluribus/100, uma mão histórica NT e uma de outra variante. Não se editou nenhum arquivo para aumentar aceitação.

| Caminho no dataset | Classificação observada | Conferência |
|---|---|---|
| `data/pluribus/100/0.phh` | `VALIDATED_COMPLETE` | Pote 520, devolução 230 a p1; finais 10310/9900/10000/9790/10000/10000 |
| `data/pluribus/100/1.phh` | `VALIDATED_COMPLETE` | Pote 940, devolução 600 a p3; finais 9950/9555/10495/10000/10000/10000 |
| `data/pluribus/100/2.phh` | `VALIDATED_COMPLETE` | Pote 250, devolução 150 a p6; finais 9950/9900/10000/10000/10000/10150 |
| `data/dwan-ivey-2009.phh` | `VALIDATED_COMPLETE` | Pote 1109500; devolução 572100 a p1; finais 572100/1997500/1109500 |
| `data/arieh-yockey-2019.phh` | `UNSUPPORTED` | Variante F2L3D; `VARIANT_UNSUPPORTED`, sem tentar converter para NLHE |

Nas três primeiras mãos o total inicial/final é 60000. Na mão histórica, `1125600+2000000+553500=3679100`, igual ao total final. Contribuições líquidas `553500+2500+553500=1109500`. O avaliador independente encontrou sequência de cinco para Ivey e de sete para Dwan, confirmando o vencedor do pote. O stack de 2000000 é informação reportada no arquivo externo, não uma verificação da situação histórica real.

Não houve amostra externa `INVALID` ou `VALIDATED_PARTIAL` entre esses cinco originais; essas classes foram exercitadas nas fixtures e na persistência. Não se recortou ou corrompeu uma mão externa para fingir cobertura de outra categoria. Esta amostra não mede a aceitação do dataset inteiro ou de salas atuais.

Origem/licença: [PHH Dataset](https://github.com/uoftcprg/phh-dataset), [README v3](https://raw.githubusercontent.com/uoftcprg/phh-dataset/v3/README.md), [licença MIT v3](https://raw.githubusercontent.com/uoftcprg/phh-dataset/v3/LICENSE). Os arquivos estão em `docs/homologacao-fase2a/externos/`, com licença/atribuição preservadas. `manifest.json` registra URL raw de cada arquivo na tag v3, caminho, tamanho e SHA-256 integral. As origens individuais das mãos também permanecem nos comentários dos arquivos e no README. Isso fornece rastreabilidade da amostra, não autenticação de seus autores ou garantia de direitos de fontes além da licença declarada pelo repositório. Nenhum dado pessoal do usuário foi transmitido.

## 6. PokerKit e all-ins curtos

Versão instalada **0.7.7**, sem atualização. O wheel público foi baixado somente para conferência em pasta ignorada do ambiente virtual, sem reinstalação. Seu SHA-256 confere com o requisito fixado:

```text
4e946cc5c48558a9a4583f3a00f13960bd5b719144643104642031552c59ec76
```

Os **25 arquivos** do wheel comparados com a distribuição instalada não apresentaram divergência. `RECORD`, recriado pela instalação, foi excluído dessa comparação. Evidência: `pokerkit-distribution.json`, com URL do wheel e dos [metadados oficiais](https://pypi.org/pypi/pokerkit/0.7.7/json).

O [changelog consultado](https://github.com/uoftcprg/pokerkit/blob/main/CHANGELOG.rst) ainda descreve correção adicional de reabertura em 0.7.8 em desenvolvimento. A proteção `SHORT_ALLIN_REOPEN_UNSUPPORTED` não foi removida ou reduzida.

Testes novos distinguiram:

- BB 2 → alvo 4: aumento mínimo completo; novo aumento para 6 continua aceito.
- BB 2 → all-in 3: aumento incompleto; calls para 3 continuam aceitos.
- Nova agressão na mesma street após o aumento incompleto: `UNSUPPORTED`, inclusive em caso conservador onde o próximo jogador ainda não agiu.
- Seis jogadores: raise 4, call, all-in 5, folds e tentativa de reabertura por jogador que já agiu; recusada pela proteção. Calls permanecem aceitos.
- Após encerrar essa street por calls e distribuir flop, uma aposta mínima completa é permitida na nova street.

Esses testes delimitam o contrato do bloqueio; não provam que todas as reaberturas seriam ilegais no poker. A recusa deliberadamente conservadora permanece uma ressalva, não um defeito escondido ou motivo para ampliar o perfil.

## 7. Persistência, precisão, segurança e regressões

`store.py` e `cli.py` permaneceram byte a byte iguais. Foram reproduzidos roundtrip, recarga, deduplicação sem escrita, schema/application ID incompatíveis nos caminhos existentes, JSON/fonte adulterados, corrupção estrutural, falha transacional por trigger, erros de arquivo e códigos JSON do CLI. A nova auditoria inclui banco com versão canônica desconhecida e roundtrip de prefixo parcial, que permanece parcial.

A releitura confronta fonte bruta, SHA-256, versão, contexto de ingestão e JSON reconstruído. Não houve migração, descarte de fonte, exclusão de registro ou ajuste de valores. A política de nome/instante de ingestão não equivale a assinatura de autenticidade. Arquivos SQLite são locais e legíveis; duplicação é por bytes, não por equivalência de mãos.

Além dos limites monetários já citados, foram executados testes de NaN/infinito, negativos, booleanos, casas excessivas, JSON não numérico para índices, arrays/assentos incoerentes, cartas repetidas, entradas grandes e TOML inválido. O teste existente de importação com sockets bloqueados passou. Não há promoção automática de prefixos, estratégia GTO ou envio de mãos a serviços externos.

Resultados **desta execução**, com logs separados dos históricos:

| Comando/verificação | Resultado | Evidência em `docs/homologacao-fase2a/` |
|---|---|---|
| Python unittest, suíte original + auditoria | **48 testes passaram**: 33 originais e 15 novos | `python-tests.log` |
| `npm test` | **73 passaram**, 17 suites, zero falhas/skips | `npm-test.log` |
| `npm run lint` | Código 0, sem erros/warnings ESLint | `npm-lint.log` |
| `npm run typecheck` | Código 0 | `npm-typecheck.log` |
| `npm run build` | Código 0, compilação e geração das cinco páginas concluídas | `npm-build.log` |
| Verificador original Fase 2A | Código 0; 87 arquivos protegidos, zero alterações | `verificador-original.log`, `verificador-evidencias.json` |
| Snapshot desta homologação | 117 conferidos; somente os dois arquivos documentados diferem | `integridade.json` |
| Distribuição PokerKit | Hash correto, 25 arquivos sem divergência | `pokerkit-distribution.json` |

O build foi executado após limpar apenas artefatos gerados em `app/.next`, com paths verificados e cache preservado, devido ao ambiente OneDrive. O aviso legado do Node sobre `MODULE_TYPELESS_PACKAGE_JSON` continua nos testes; nenhuma verificação foi silenciada. Ambiente efetivamente usado: Windows, Python 3.15.0, PokerKit 0.7.7, Node 24.22.0 e Next 15.5.29. Não se afirma validação multiplataforma/Python 3.11–3.13.

O build não foi usado como prova de comportamento. A prova funcional veio dos comandos de import/export, execução das regras, invariantes, resultados analíticos, amostra externa e oráculo independente limitado. Não houve inspeção visual nova: não foi construída ou modificada interface nesta homologação.

## 8. Estabilidade do contrato e condições para uma futura Fase 2B

**Sim, `CanonicalHand` 1.0.0 está suficientemente estável como base de armazenamento, proveniência e sequência de eventos do subconjunto.** Não foi necessário alterar campos, esquema de banco ou migrar registros válidos. As correções mudam conversão incorreta em contexto decimal não padrão e diagnósticos de entradas recusadas. Registros que porventura tenham sido produzidos com arredondamento anterior não devem ser considerados corretos: a releitura exata recusará divergências, preservando a fonte para revisão/reimportação explícita.

O contrato **não é um frame de interface pronto para renderizar por associação direta**. Para uma futura reprodução:

| Elemento | Campo a usar e limite |
|---|---|
| Mesa/jogadores | `table`, `players.index/sourceLabel`, `name`, `seat`, `position`; respeitar `MISSING/INFERRED`, sem ordenar assentos numericamente |
| Stacks/apostas/pote | `event.before` ou `event.after`; `betsAtoms` está contido em `potAtoms`; usar escala inteira, sem converter para float arbitrário |
| Board | Board do snapshot do frame, nunca `ending.board` para frames anteriores |
| Cartas privadas | Acumular somente `HoleDealing` e `HoleCardsShowingOrMucking` já alcançados; não usar o agregado final de `players[].holeCards` como conhecimento inicial |
| Fold/muck/all-in | Máscaras do snapshot correspondente; muck não deve apagar o conhecimento já reportado |
| Ação e progresso | `sequence`, `sourceActionIndex`, `origin`, `kind`, alvo `amountAtoms` e incremento `paidAtoms`; operações derivadas não são decisões humanas inventadas |
| Potes laterais/prêmios | `pots` é visão da liquidação. Camadas intermediárias não estão em cada snapshot; não exibir os elegíveis/finais como se fossem conhecidos antes. O total corrente está disponível |

Cartas reportadas ao anotador tampouco significam informação disponível a todos os jogadores. A perspectiva de exibição e o acesso a dados finais precisam ser definidos na futura UI. O teste temporal confirmou que revelar cartas depois não altera o evento anterior, mas o objeto completo contém deliberadamente board/cartas/resultados finais para auditoria. Portanto, “não há vazamento em qualquer consumidor futuro” não foi declarado como comprovado.

A validação runtime deve ocorrer **na fronteira de ingestão de JSON antes de disponibilizá-lo ao frontend**: versão/perfil, tipos exatos, átomos, vetores/índices, cartas, `Observed<T>`, limites e invariantes precisam ser conferidos. Quando houver fonte PHH/banco, a reconstrução auditada no backend é a autoridade; um arquivo canônico exportado e editado não se torna confiável por um cast TypeScript ou pela ponte de side pots. Uma verificação defensiva no cliente pode complementar essa fronteira, sem substituir regras/proveniência.

Esse decoder, a política de perspectiva, frames com conhecimento temporal e eventuais camadas de potes intermediárias **não foram implementados**. São condições de desenho da Fase 2B, não alegações de funcionalidade entregue agora. Alterar semântica dos agregados existentes exigirá versionamento explícito; não se deve reinterpretar silenciosamente registros 1.0.0.

## 9. Evidências reproduzíveis, arquivos e limitações residuais

Na raiz do repositório:

```powershell
pipeline/hand_history/.venv/Scripts/python.exe -m unittest pipeline.hand_history.test_hand_history pipeline.hand_history.test_homologacao -v
pipeline/hand_history/.venv/Scripts/python.exe docs/homologacao-fase2a/auditar.py
node docs/homologacao-fase2a/verificar-evidencias.mjs
```

O segundo comando reproduz o comportamento antes/depois contra as cópias com hash conferido, testa as 13 entradas e grava `auditoria.json` e `correcoes.diff`. O terceiro executa o verificador anterior, preserva seu histórico e registra as diferenças do snapshot atual. `POKER_HH_PYTHON` continua disponível para selecionar o executável nos testes Node/verificadores. As amostras externas já estão locais: não há download durante esses testes.

Arquivos preexistentes alterados: `pipeline/hand_history/importer.py` e `app/src/lib/poker/handHistorySchema.ts`. Arquivos novos: `pipeline/hand_history/test_homologacao.py`, este relatório e os artefatos em `docs/homologacao-fase2a/` — snapshot, cópias iniciais conferidas, scripts de auditoria/verificação, diff, reproduções JSON, comparação da distribuição, logs desta execução, saídas do verificador e cinco amostras externas com README/licença/manifesto. `python-audit-initial.log` é um registro preliminar; o resultado final completo é `python-tests.log`.

Ressalvas remanescentes: amostra externa pequena e não estatística; regras de sala/ficha ímpar e modo de showdown delimitados; proteção conservadora de all-in curto; sem rake, straddles, múltiplos runouts, formatos comerciais ou stacks desconhecidos; sem avaliação independente exaustiva de toda a legalidade cronológica; validação runtime do futuro frontend ainda necessária; dados locais sem criptografia, deduplicação semântica ou assinatura de origem; nenhuma execução em outros sistemas/Python. Não houve nova homologação visual da Fase 1, cujos arquivos e testes foram preservados.

**Justificativa final:** os defeitos efetivamente reproduzidos foram corrigidos com regressões; as oito fixtures, a amostra externa e as identidades matemáticas passaram nesta execução; não foi identificada regressão relevante no escopo exercitado e a separação de autenticidade GTO permaneceu intacta. As limitações de cobertura e de consumo futuro justificam **APROVADA COM RESSALVAS**. A execução encerra nesta homologação, sem avanço para a Fase 2B.
