# Fase 2C — Biblioteca de Mãos e integração com Replayer

Execução: 13–14/11/2026, America/Fortaleza. Evidências com instantes UTC. Esses instantes são de execução/importação, não datas inventadas das partidas.

**Resultado: implementada e pronta para auditoria no escopo documentado.** É possível importar múltiplos PHHs/JSONs, conservar seus bytes, pesquisar o acervo, persistir estudo, abrir a mão selecionada no Replayer e exportar fonte, canônico, metadados ou backup SQLite. Não foi executada uma homologação independente completa da Fase 2B, nem iniciada a Fase 3.

## 1. Auditoria inicial e decisões arquiteturais

Foram examinados o status/diff do Git, `pipeline/hand_history/store.py`, `importer.py`, `cli.py` e seus testes; `handHistorySchema.ts`, `handHistoryAdapter.ts`, `handHistoryValidation.ts`, `handReplay.ts`, `ReplayerView.tsx`, a navegação e persistências existentes. Foram lidos os relatórios das fases 1, 2A e 2B indicados no pedido. Relatórios anteriores serviram como contexto; as evidências desta entrega são as execuções e comparações abaixo.

A Fase 2A já oferecia importação PHH/PokerKit, identificação por bytes, reconstrução na leitura e SQLite. A Fase 2B já oferecia decoder runtime e frames com visibilidade temporal. Essas funções foram reutilizadas. O motor de poker, a semântica de `CanonicalHand` 1.0.0 e as soluções estratégicas não foram reescritos.

Decisões principais:

1. **Mesmo SQLite, extensão aditiva.** PHHs continuam na tabela `hands` do armazenamento PHH1. Índice de pesquisa e estudo pessoal ficam em tabelas auxiliares no mesmo arquivo.
2. **JSON sem PHH não imita fonte PHH.** Como `hands.raw_phh` é obrigatório e sua leitura reconstrói a fonte, JSONs ficam em uma tabela auxiliar própria, com seus bytes originais. Não se fabrica PHH para satisfazer o esquema anterior.
3. **Next.js é o único servidor.** Uma rota Node local conversa com um processo Python de duração limitada por stdin/stdout. Não há daemon Python, servidor de regras adicional ou SQLite aberto pelo navegador.
4. **Decoder único para canônicos.** A ponte Python invoca o decoder TypeScript existente por um CLI Node fixo. A leitura para o Replayer é novamente validada no backend e cliente. Não há parser PHH no frontend.
5. **Resumo primeiro, eventos sob demanda.** A listagem consulta um índice sem ledger/cartas privadas/eventos; o canônico completo é recuperado apenas para leitura/exportação da mão escolhida.
6. **Replayer existente.** A navegação envia ID e geração da seleção ao mesmo componente da Fase 2B; a sessão começa em zero e a política de perspectivas é preservada.

O banco padrão no Windows fica em `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`, fora do checkout que está em OneDrive. O caminho de um banco PHH1 já existente pode ser configurado pelo operador. Não se procura automaticamente por bancos pessoais nem se importa um acervo sem seleção explícita.

## 2. Integração Next.js, Python e SQLite

Fluxo de importação:

```text
Biblioteca → POST loopback, um arquivo por vez
          → limite de bytes + validação de acesso
          → spawn Python com argv fixo, shell:false
          → PHH: import_phh / PokerKit existente
            JSON: canonicalValidationCli.mjs / parseCanonicalHandText existente
          → transação SQLite por arquivo → resultado individual
```

`app/src/app/api/hand-library/route.ts` implementa leituras `list`, `read`, `export`, `backup` e escritas `import`, `study`, `clearStudy`, `delete`. A rota é dinâmica e usa runtime Node. Respostas não são cacheadas; não há CORS concedendo acesso a outros sites.

`libraryAccess.ts` exige habilitação explícita, URL/Host de loopback, cabeçalho `X-Poker-Library: local-v1`, GET/POST e origem compatível. POST exige `Origin`; origens divergentes e `Sec-Fetch-Site: cross-site` são recusados. Next pode normalizar `request.url` para localhost quando o navegador usa 127.0.0.1: ambos devem ser loopback e a origem é comparada com o Host real, mantendo a porta correspondente.

**O servidor deve ser iniciado com bind em 127.0.0.1, conforme a seção de execução.** As verificações HTTP complementam esse bind; não o substituem e não constituem autenticação multiusuário. Não publicar a API por proxy/túnel ou hospedar esse backend como serviço público. Por padrão, sem `POKER_LIBRARY_ENABLED=1`, todas as operações da Biblioteca são recusadas e nenhum banco é criado por ela.

`libraryBridge.ts` permite até três operações em execução/espera por processo Node, serializa os subprocessos, limita cada execução Python a 30 s e stdout a 64 MiB. O executável e caminho do banco vêm de configuração do operador, nunca de query/body. Usa argv separados, `shell:false`, janela oculta no Windows e comandos Python admitidos explicitamente. A UI não escolhe caminhos de leitura/escrita no sistema.

`library_cli.py` recebe um único comando JSON por stdin; os bytes do arquivo são codificados em base64 nessa ponte local. Diagnósticos de armazenamento são apresentados sem encaminhar tracebacks ou conteúdo privado ao navegador. Os textos de históricos/notas são renderizados como texto React; não há HTML executável, `eval` ou montagem de comando a partir deles.

## 3. Persistência e migração

`store.py`, `DB_VERSION=1`, application ID PHH1 e a tabela `hands` original permanecem inalterados. A Biblioteca usa uma versão independente, **`library_schema.version=1`**, para sua extensão:

| Tabela | Responsabilidade |
|---|---|
| `hands`, existente | Bytes PHH e canônico do importador, com identificação/ingestão originais |
| `library_schema` | Versão da extensão; versões desconhecidas são recusadas |
| `library_index` | ID interno, tipo de proveniência, ID reportado, arquivo, participantes, datas, status, blind e resumo sem eventos |
| `library_json` | Bytes JSON originais, hash dos bytes e representação decodificada, sem fonte PHH fictícia |
| `library_players` | Nome/identificador e posição para pesquisa |
| `library_study` | Nota, favorito, pendência, última revisão UTC e instante de edição |
| `library_tags` | Tags separadas, com índice de pesquisa |

A migração 0→1 da extensão cria tabelas/índices em transação; não substitui, renomeia ou apaga tabelas anteriores. O preenchimento do índice valida cada PHH antigo com `store.read_hand` e confirma cada entrada separadamente. É retomável: em cada conexão, somente IDs de `hands` ainda não indexados são reconstruídos. Isso também permite encontrar importações posteriores feitas pelo CLI PHH1 original.

PHH novo, índice e jogadores são gravados juntos, na mesma transação por arquivo. JSON, índice e jogadores também são atômicos. Falha na indexação reverte a inclusão da fonte; um teste com trigger confirma esse comportamento. Notas/tags são salvas em transação própria, sem alterar fonte, ledger ou canônico. Exclusão de mão remove seus metadados associados; remover somente estudo preserva o histórico.

Deduplicação é por **bytes**, não por equivalência semântica:

- PHH usa `phh-sha256:<hash dos bytes>`, conforme Fase 2A.
- JSON usa ID interno `json-sha256:<hash do arquivo recebido>`. O `recordId` canônico declarado continua intacto dentro da mão, mas não pode sobrescrever/deduplicar indevidamente um PHH pelo hash que ele afirma ter.
- Mudar espaços, comentários, envelope ou instante serializado pode produzir outro registro. Um nome diferente com os mesmos bytes não substitui o arquivo/nome inicial nem suas notas.

Na leitura, PHH é reconstruído pela função original e confrontado com o canônico salvo. JSON tem hash/ID dos bytes conferidos, é decodificado novamente e comparado com a cópia armazenada. Alterações/corrupção são recusadas. Essa verificação de JSON continua sendo estrutural: não recupera uma fonte PHH ausente.

## 4. Funcionalidades da interface

A nova aba **Biblioteca de Mãos** apresenta cartões responsivos com ID reportado ou interno, arquivo, importação UTC, data/horário reportados quando disponíveis, quantidade de jogadores, NLHE, modalidade/unidade quando informadas, blinds/antes, stacks iniciais, jogadores/posições conhecidas, board ao fim do registro, status e estudo pessoal.

Dados ausentes recebem “não informado/a”. A data da partida exige ano, mês e dia válidos; não é substituída pela data de importação. O horário TOML é lido da representação tipada de metadados do pipeline, sem inferir timezone. Posições inferidas são marcadas; `OTHER` não vira posição específica. Os valores são formatados com a função inteira `formatAtoms`, sem conversão monetária para float.

PHHs exibem “conferido pelo motor · autoria não autenticada”. JSONs exibem “conferência estrutural; origem não autenticada”. Validade legal ou estrutural não é prova da autoria/site de origem e não corresponde a `VERIFIED` estratégico.

O editor permite nota de até 5.000 caracteres, até 20 tags de 1–40 caracteres, favorito e revisão pendente. A interface usa vírgulas para separar tags; tags duplicadas no mesmo salvamento são conciliadas. “Marcar como revisada” registra o instante UTC do servidor e remove a pendência. Remoção de estudo e exclusão de mão exigem confirmação com identificação do registro e opção de cancelar; o backend exige que `confirm` coincida com o ID.

O painel apresenta total, completas, parciais, favoritos, pendências e barras simples por participantes e mês UTC de importação. A distribuição mensal mostra os 12 meses mais recentes **com registros**, não necessariamente uma janela de 12 meses consecutivos. Os totais referem-se ao acervo inteiro, enquanto filtros afetam a lista. Não há winrate, lucro, ROI, EV ou pontuação de decisões.

## 5. Importação em lote e limites

O seletor aceita múltiplos arquivos; cada um gera seu próprio resultado: importado, duplicado, inválido, não suportado ou erro de leitura/armazenamento. O resumo e o motivo de cada rejeição ficam visíveis. Um arquivo recusado não reverte os arquivos anteriores nem impede os seguintes.

| Limite | Política implementada |
|---|---|
| Lote da interface | Até 20 arquivos e 20 MiB somados, antes do envio |
| PHH | Até 1 MiB por arquivo, perfil original `PHH_NT_SUBSET_1` |
| JSON | Até 6 MiB por arquivo; UTF-8 válido e contrato do Replayer |
| Trabalho do lote | Janela de 120 s para o cliente; cada chamada usa no máximo 35 s ou o tempo restante |
| Subprocesso | 30 s por operação; decoder Node interno com timeout de 12 s |
| Concorrência | Até três operações em execução/espera por processo Next, executadas sequencialmente |
| Paginação | Padrão 20; máximo 50 resumos por página |
| Backup via interface | Até 32 MiB de SQLite; resposta do processo até 64 MiB |

Os limites anteriores do perfil permanecem: 2–9 jogadores, 500 ações-fonte, escala até seis casas, teto de átomos e proteção conservadora de all-in curto. Não se ampliou rake, straddles, runouts, variantes ou formatos comerciais.

JSON pode ser canônico direto ou envelope único aceito pelo decoder da Fase 2B. Backup SQLite e exportação de estudo não são JSONs canônicos importáveis pelo seletor. Codificações diferentes de UTF-8 e JSON malformado são recusadas; não se substituem bytes inválidos por nomes/cartas inventados. Versões/perfis/variantes incompatíveis recebem diagnóstico de não suportado. Valores de EV/GTO fabricados são recusados pelo decoder.

Timeout do navegador não garante que uma transação local já iniciada foi cancelada. Conferir a Biblioteca antes de repetir uma operação com resposta indeterminada; a deduplicação protege o reenvio dos mesmos bytes. Não existe transação única para todo o lote nem retry automático de escrita.

## 6. Pesquisa, ordenação e desempenho

Filtros combináveis: identificador/arquivo, jogador, participantes, posição conhecida, intervalo de datas da mão, intervalo de importação UTC, big blind exato, completa/parcial, tag exata, favorito, nota textual e pendência de revisão. Completa/parcial é o status de validação dos registros armazenados; arquivos rejeitados aparecem no resultado do lote e não são persistidos como mãos inválidas.

Ordenações disponíveis: importação recente/antiga, data reportada recente/antiga, participantes e identificador reportado. Datas de mão ausentes ficam ao fim nas ordenações correspondentes. Valores de ordenação são mapeados para cláusulas fixas; filtros/dados usam parâmetros SQLite. Não se interpola SQL fornecido pelo usuário. A pesquisa textual não é busca fonética ou sem acentos; tags são buscadas pelo texto exato, com a semântica `NOCASE` do SQLite, limitada principalmente a ASCII.

Há índices para ingestão, datas reportadas, status/participantes/blind, tags e posições. A listagem busca resumos, sem canônico completo/ações/eventos; o estudo consultado é limitado aos registros da página. Não há cálculo de estratégia a partir da pesquisa.

Benchmark reproduzido com **1.000 PHHs sintéticos importados pelo armazenamento original**, em banco temporário:

- Geração/armazenamento da amostra: 18,98 s.
- Primeira extensão/preenchimento do índice + consulta: 17,22 s.
- Consulta subsequente, página 30 com 20 itens: **24,7 ms**.
- Resposta: **17.897 bytes**, sem eventos ou `sourceActions`.

Evidências: `fase2c-evidencias/desempenho.py` e `desempenho.json`. Medidas locais, não garantia de desempenho para qualquer hardware/tamanho de mão. O primeiro preenchimento reconstrói fontes e pode levar mais tempo em acervos grandes; entradas já confirmadas não são refeitas na próxima tentativa.

## 7. Biblioteca → Replayer

`PokerStudioApp` conserva uma seleção `{recordId, requestKey}` e abre a aba existente. `ReplayerView` recupera a mão sob demanda por `readLibraryReplay`. O backend revalida o canônico; o cliente repete `validateCanonicalHand` antes de disponibilizá-lo à sessão.

`runLatest` compartilha uma geração entre cargas de exemplo, arquivo e Biblioteca. Resposta antiga, erro antigo e finalização antiga não substituem a seleção recente. A desmontagem invalida a geração. Cada mão aceita cria nova `ReplaySession`, cursor zero e perspectiva pública; o timer da sessão anterior é cancelado pelo cleanup existente.

`buildReplayFrame`, snapshots, ledger, `formatAtoms` e as perspectivas da Fase 2B são reutilizados sem alterar a matemática. Cartas continuam ocultas antes da distribuição/revelação aplicável; a visão completa não antecipa cartas conhecidas apenas em evento futuro. Muck preserva conhecimento legítimo. Potes finais só aparecem na liquidação completa e prefixos não ganham resultado.

A classificação de proveniência da Biblioteca é mostrada separadamente do canônico. Um JSON sem PHH não vira fonte autenticada ao abrir no Replayer. `gtoAnalysis="NOT_EVALUATED"` e `evLoss=null` permanecem preservados; não há análise GTO automática.

## 8. Exportação e backup

Por mão, há três exportações distintas:

1. **Original PHH/JSON:** bytes recebidos, sem normalização; JSON original não é renomeado como PHH.
2. **Canônico JSON:** representação decodificada/validada, sem inserir anotações. Reimportar esse arquivo como JSON mantém classificação não autenticada sem a fonte PHH.
3. **Metadados JSON:** envelope `poker-study/1`, com ID, proveniência e estudo; não se apresenta como canônico nem altera o histórico.

**Backup SQLite** usa `sqlite3.Connection.backup`, incluindo fontes, canônicos, índice e estudo em uma cópia consistente, com limite de 32 MiB na interface. O arquivo temporário gerado tem caminho controlado pelo backend e é removido após leitura. Exportar não sobrescreve o banco corrente. Testes abrem a cópia em outro caminho, revalidam uma mão e confrontam suas tags/notas.

**Não há endpoint ou botão de restauração, mescla ou substituição de banco nesta entrega.** Para inspecionar um backup, pare a aplicação, preserve o banco corrente, copie o backup para um **novo caminho** e configure `POKER_LIBRARY_DATABASE` para essa cópia. As versões são verificadas na abertura e as mãos são revalidadas na leitura. Isso não é restauração automática nem validação exaustiva de todas as linhas do backup. Não sobrescrever silenciosamente o banco original. Para acervos maiores que o limite da UI, usar a API SQLite de backup localmente, com administração explícita do caminho de destino.

## 9. Testes e evidências desta execução

Ambiente observado: Windows, Node 24.22.0, Next 15.5.29, Python 3.15.0 e PokerKit 0.7.7 já instalado. Nenhuma dependência npm/Python nova foi adicionada nesta fase.

| Verificação | Resultado observado | Arquivo em `fase2c-evidencias/` |
|---|---|---|
| `npm test` | **102 testes**, 23 suites, zero falhas/cancelamentos/skips | `npm-test.log` |
| Reexecução focada final da Biblioteca | **8 testes passaram**, incluindo a ponte real após a correção de indexação | `node-library-final.log` |
| Python unittest completo | **71 testes passaram**, incluindo 20 novos da Biblioteca | `python-tests.log` |
| `npm run lint` | Código 0, sem erros/warnings ESLint | `npm-lint.log` |
| `npm run typecheck` | Código 0 | `npm-typecheck.log` |
| `npm run build` | Código 0; compilação, tipos/lint, páginas 5/5 e nova rota dinâmica concluídos | `npm-build.log` |
| Preservação por hash | **183 preexistentes conferidos; 179 inalterados; quatro integrações esperadas** | `baseline.json`, `integridade.json`, `verificar.mjs` |
| Navegador real | **19 checks aprovados**, desktop e móvel; console final sem erros observados | `interacoes-browser.json`, `interacoes.md` |
| Download da fonte PHH | 351 bytes, idênticos à fixture original; SHA-256 conferido | `exportacao-browser.json` |
| Mil registros | Índice inicial e página posterior sem ledger na resposta | `desempenho.json` |

Os oito testes Node novos incluem fronteira local/CSRF, limites reais sem `Content-Length`, continuidade de lote, duplicados/recusas/falhas de armazenamento, limite de quantidade/tamanho, respostas assíncronas em ordem inversa, desmontagem, validação na recuperação e um fluxo real dos handlers Next → processo Python → SQLite. Esse fluxo testa persistência, organização, confirmação de exclusão, backup e frames com conservação financeira/cartas ocultas.

Os 20 testes Python novos cobrem armazenamento e duplicação, migração aditiva e importações posteriores pelo CLI, preservação byte a byte, transação com trigger de falha, cache pequeno no preenchimento de índice, JSON não autenticado/adulterado, UTF-8 inclusive fronteiras de chunks, versões incompatíveis, rejeição de EV, pesquisa combinada e injeção SQL, datas, paginação com 125 registros, revisão/notas/tags, exclusão com cascata, exportação/backup e leitura em outro processo. Os 51 testes Python e 94 Node anteriores continuaram passando, sem alterações nos seus testes.

O build final mantém a rota principal em 108 kB / First Load JS 211 kB, com carregamento lazy da Biblioteca. O primeiro build no sandbox não avançou da inicialização e foi interrompido; o build final foi executado fora do sandbox, com saída/código registrados. `npm-build-sandbox-inicial.log` não é apresentado como build aprovado. O aviso legado `MODULE_TYPELESS_PACKAGE_JSON` aparece nos testes Node; não foi silenciado. `git diff --check` não encontrou erros de whitespace, somente avisos de conversão LF/CRLF do Git.

## 10. Testes reais e capturas

O navegador Chromium integrado executou ações de interface reais em **1440×1000** e **390×844**, sobre banco separado de fixtures. Foram observados: lote misto e motivo de rejeição; notas, tags e favorito; filtros combinados e estado vazio; recarga com persistência; confirmação/cancelamento de exclusão; download de fonte; abertura de PHH/JSON no Replayer em zero; cartas próprias depois da distribuição; liquidação HU 101/99 com pote zero; prefixo com pote 4 sem resultado; play/pause no móvel; registro de revisão; revelação tardia e retorno; Erros Fatais e Treinador preservados.

As medições de largura ficaram dentro dos dois viewports. O registro final de console não contém erros observados. Ações logo após hidratação e seletores ambíguos foram corrigidos/repetidos antes de registrar aprovação. A demora do seletor de arquivos/download da ferramenta não foi usada como prova de falha do produto: o lote e os bytes baixados foram efetivamente conferidos.

Exclusão efetiva, remoção de metadados, duplicação e backup completo foram verificados nos testes de backend/API; no navegador, verificou-se o cancelamento da confirmação e o download da fonte. Não se afirma ter baixado todas as opções de exportação nem exercitado toda a matriz de testes em cada viewport. A integração não equivale à homologação completa independente da Fase 2B.

Capturas de viewport:

- [Desktop — painel e filtros](fase2c-evidencias/biblioteca-desktop.jpg).
- [Desktop — registros e integração](fase2c-evidencias/biblioteca-desktop-registros.jpg).
- [Móvel — entrada e indicadores](fase2c-evidencias/biblioteca-mobile.jpg).
- [Móvel — registro organizado](fase2c-evidencias/biblioteca-mobile-registro.jpg).
- [Móvel — controles do Replayer](fase2c-evidencias/biblioteca-replayer-mobile.jpg).

O servidor de desenvolvimento foi encerrado e o viewport restaurado. O roteiro em `interacoes.md` permite reproduzir as ações; não foi adicionado um pacote Playwright independente. Os testes de comportamento não foram substituídos por SSR/build.

## 11. Problemas identificados e corrigidos

| Problema | Correção e evidência |
|---|---|
| Endereço 127.0.0.1 recusado indevidamente devido à URL normalizada pelo Next | Conferência de Host/origem local mantendo validação de porta; regressão de gate e navegação real |
| Índice legado em transação longa podia bloquear a própria reconstrução por outra conexão, reproduzido com mil registros | Validação antes de cada transação curta de indexação; regressão com `cache_size=1` e benchmark posterior aprovado |
| Importações posteriores pelo CLI original não entravam no índice inicial | Busca de IDs ainda não indexados em cada conexão; teste de persistência/visibilidade sem reescrita |
| Horário TOML preservado como objeto tipado não aparecia no resumo | Leitura do marcador `tomlType: time`, sem mudar o canônico; teste de data/horário |
| Labels de favorito/nota preenchida eram ambíguos para navegação acessível | Nomes acessíveis explícitos e ícone “Mão favorita”; edição/filtros repetidos no navegador |
| UTF-8 poderia ser truncado/substituído na leitura em chunks do novo CLI | Acúmulo limitado de bytes e decodificação fatal; testes Unicode grande e bytes inválidos |

As primeiras falhas de testes por conexões abertas no harness Python foram corrigidas fechando explicitamente as conexões de teste; não se alterou o armazenamento anterior para ocultar erros. Logs preliminares estão identificados como tais. Nenhum defeito crítico de matemática/GTO do Replayer anterior foi reproduzido durante esta integração; isso não declara ausência exaustiva de defeitos nessa fase.

## 12. Arquivos criados e alterados

Quatro arquivos preexistentes alterados nesta fase:

- `.gitignore`: ignora `.local/`, usada para bancos/artefatos locais de teste.
- `app/src/components/PokerStudioApp.tsx`: aba lazy Biblioteca, seleção para o Replayer e ajuste do cabeçalho móvel nessa aba.
- `app/src/components/ReplayerView.tsx`: entrada de seleção da Biblioteca, classificação de proveniência e guarda compartilhada de cargas.
- `app/src/lib/studyNavigation.ts`: novo `TabId`.

Novos arquivos de implementação/testes:

- `app/src/components/HandLibraryView.tsx`.
- `app/src/lib/handLibraryClient.ts`.
- `app/src/lib/server/libraryAccess.ts`, `libraryBridge.ts`, `canonicalValidationCli.mjs`.
- `app/src/app/api/hand-library/route.ts`.
- `app/src/lib/__tests__/handLibrary.test.ts`.
- `pipeline/hand_history/library.py`, `library_cli.py`, `test_library.py`.
- Este relatório e `docs/fase2c-evidencias/`: baseline/cópias anteriores, verificador, logs, benchmark, provas de interação/exportação e capturas.

O Git já tinha modificações/não rastreados das fases anteriores. A atribuição acima usa o baseline desta tarefa, não somente o diff contra HEAD. Os **179 demais arquivos monitorados** permanecem idênticos, incluindo relatórios/evidências anteriores, catálogo, fontes de exemplos, esquema, motores e bundle TexasSolver. Cópias dos quatro pontos de integração estão em `fase2c-evidencias/antes/`.

## 13. Execução completa no Windows

Reutilizar o ambiente Python e dependências já instalados na Fase 2A. Node **24.22.0** foi o executável efetivamente testado; a ponte usa execução nativa de arquivos TypeScript. Não se afirma compatibilidade com Node antigo sem esse suporte.

Se for uma instalação nova, na raiz do checkout, criar o ambiente **somente se ainda não existir** e instalar a dependência fixada:

```powershell
py -m venv pipeline/hand_history/.venv
pipeline/hand_history/.venv/Scripts/python.exe -m pip install --require-hashes -r pipeline/hand_history/requirements.txt
```

A instalação inicial pode exigir o pacote previamente baixado ou rede; o uso da Biblioteca após instalação funciona sem serviços externos. Não é necessário instalar outra biblioteca para esta fase.

Em um PowerShell aberto na raiz do projeto:

```powershell
$env:POKER_HH_PYTHON = Join-Path (Get-Location).Path 'pipeline\hand_history\.venv\Scripts\python.exe'
$env:POKER_LIBRARY_ENABLED = '1'
# Opcional: usar o caminho do seu banco PHH1 existente, ou outro caminho local explícito.
# Sem esta variável, usa LOCALAPPDATA\Projeto-Poker\hand-library.sqlite3.
# $env:POKER_LIBRARY_DATABASE = 'C:\CaminhoLocal\meu-acervo.sqlite3'
Set-Location app
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Abrir `http://127.0.0.1:3000`, selecionar **Biblioteca de Mãos**, importar os arquivos e consultar os resultados. A primeira abertura cria a extensão ou indexa o banco configurado; não importa fixtures automaticamente no acervo pessoal. O executável Python precisa existir e Node precisa estar disponível. Na ponte Next, o decoder usa o próprio executável Node do servidor; em uso direto do CLI Python, `POKER_LIBRARY_NODE` pode indicar o executável Node confiável do operador.

Para produção local, no mesmo ambiente de configuração e diretório `app`:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Manter o checkout completo, incluindo código Python e decoder TypeScript: não foi preparado deploy serverless/standalone contendo essas dependências. Não iniciar outro serviço Python. Encerrar com Ctrl+C; reiniciar com o mesmo caminho preserva o acervo. Com a variável de habilitação ausente, a Biblioteca informa configuração necessária e as outras abas continuam funcionando.

Para repetir as verificações, na raiz:

```powershell
pipeline/hand_history/.venv/Scripts/python.exe -m unittest pipeline.hand_history.test_hand_history pipeline.hand_history.test_homologacao pipeline.hand_history.test_replay_examples pipeline.hand_history.test_library -v
pipeline/hand_history/.venv/Scripts/python.exe docs/fase2c-evidencias/desempenho.py
node docs/fase2c-evidencias/verificar.mjs
Set-Location app
npm test
npm run lint
npm run typecheck
npm run build
```

O benchmark usa apenas banco temporário sintético. Não executar novamente `baseline.mjs` para substituir o baseline; ele foi criado antes das edições e se recusa a sobrescrever o arquivo existente.

## 14. Limitações e recomendações de homologação

- Biblioteca pessoal local, sem autenticação multiusuário, criptografia do SQLite ou sincronização. Usar bind loopback e caminho fora de pastas sincronizadas; o padrão Windows já fica fora do checkout OneDrive.
- Permanecem o perfil e as ressalvas da Fase 2A, incluindo o bloqueio conservador de novas agressões após aumento all-in incompleto. Não há suporte comercial, outras variantes, rake ou múltiplos runouts.
- JSON estruturalmente coerente e editado pode ser aceito, mas permanece não autenticado. PHH legal também não prova autoria externa. Não se verifica uma alegação de origem por apenas confiar em um hash declarado.
- Não há restauração/mescla por UI, importação de metadados de estudo exportados ou deduplicação semântica. Backups completos pela interface limitam-se a 32 MiB.
- Lotes não são atômicos como conjunto. Em timeout, consultar o banco antes de repetir; a fila é limitada por processo, não é um sistema de jobs distribuído.
- O preenchimento inicial de índice pode precisar de nova tentativa em acervos maiores que a janela de subprocesso. Cada mão já indexada é preservada; não se reduz a validação da fonte para ganhar desempenho.
- Filtros/playhead não são salvos ao sair da aba. Mãos e estudo persistem no SQLite. Não há autosave de rascunho nem controle de edição concorrente entre dois usuários/abas; salvar estudo substitui seus metadados com os valores explicitamente enviados.
- Testes reais cobrem Chromium e dois viewports, não todos os navegadores, dispositivos físicos ou tecnologias assistivas. O benchmark é uma amostra de mil mãos pequenas, não um teste de capacidade ilimitada.
- Não há HUD, captura ao vivo, comunicação com clientes de poker, decisões automatizadas, estatísticas avançadas ou diagnóstico GTO. Nenhum resultado de showdown é interpretado como prova de decisão correta.

Recomenda-se homologar com uma cópia de banco PHH1 existente, entradas adversariais adicionais, falhas de disco/timeout e concorrência, backup em outro caminho, uma matriz maior de acessibilidade/navegadores e repetição independente da integridade temporal/financeira do Replayer. A Fase 2B continua sem homologação técnica independente completa. **A execução termina na Fase 2C, sem avanço para a Fase 3.**
