# Importador Nativo PokerStars (ZIP e TXT PT-BR/EN) — TreinerLM

Documentação técnica da extensão nativa da **Biblioteca de Mãos** e do **Replayer** do TreinerLM para importar históricos originais do PokerStars em arquivos `.zip` e `.txt` (português brasileiro e inglês), preservando integralmente o contrato existente para `.phh` e `.json` canônicos e a integridade do acervo pessoal SQLite.

---

## 1. Visão Geral e Arquitetura

O importador amplia a cadeia **Frontend React → API Route Next.js → Bridge Local → Pipeline Python → Motor PokerKit 0.7.7 → Validador Canônico TypeScript → SQLite `PHH1`** sem enfraquecer nenhuma garantia de conservação de fichas ou rastreabilidade:

1. **Seleção segura e expansão (`app/src/components/HandLibraryView.tsx`, `app/src/lib/handLibraryClient.ts`, `pipeline/hand_history/pokerstars.py`)**:
   - Aceita múltiplos arquivos simultâneos (`.zip`, `.txt`, `.phh`, `.json`).
   - Recusa na camada Python qualquer entrada `.txt` com sintaxe PHH TOML (`FORMAT_MISMATCH`) e qualquer entrada `.phh` com cabeçalho PokerStars (`FORMAT_MISMATCH`), impedindo confusão de formatos pela extensão.
2. **Análise e reconstrução em passo único (`pipeline/hand_history/pokerstars.py` + `pipeline/hand_history/importer.py`)**:
   - Separa blocos individuais de um `.txt` (`split_pokerstars_file`), rejeitando arquivos vazios, binários/UTF-8 inválidos ou preâmbulos corrompidos (`EMPTY_FILE`, `ENCODING_INVALID`, `CORRUPT_PREAMBLE`) sem descartar mãos válidas subsequentes no mesmo arquivo.
   - Reconstrói cada mão em **passo único** diretamente sobre `importer.Session` (PokerKit `0.7.7` no perfil `PHH_NT_SUBSET_1`), gerando também a representação PHH TOML determinística para auditoria.
   - Corrige em `importer._allocate_pot_awards` a distribuição sequencial de múltiplos potes após encerramento (`HandKilling`) em all-ins de múltiplas vias.
   - Confronta rigorosamente os potes líquidos, apostas não-igualadas devolvidas (`Uncalled bet` / `Aposta não-igualada`), board final e total do pote contra o `*** SUMMARY ***`/`*** SUMÁRIO ***` reportado na fonte. Se houver qualquer divergência matemática ou evento fora do perfil estrito, a mão é **honestamente rejeitada** com diagnóstico estruturado — sem inventar cartas, ações nem resultados.
3. **Validação cruzada no contrato canônico (`app/src/lib/poker/handHistorySchema.ts`, `handHistoryValidation.ts`)**:
   - Estende `CanonicalHand` com `"POKERSTARS"` em `source.format` e `HandEvent.origin`, além de `"PS_TEXT_1"` em `source.targetStandardVersion` e prefixo `ps-sha256:<hex64>` em `recordId`.
   - Toda mão reconstruída foi validada em lote pelo validador runtime `validateCanonicalHand` em TypeScript.
4. **Persistência aditiva SQLite v1 (`pipeline/hand_history/library.py`)**:
   - Mantém `DB_VERSION = 1`, `APPLICATION_ID = 0x50484831` e `LIBRARY_VERSION = 1`.
   - Cria de forma aditiva a tabela `library_pokerstars` (foreign key `ON DELETE CASCADE` em `library_index`) armazenando `ps_hand_id UNIQUE`, `tournament_id`, `table_name`, `game_format`, `raw_text`, `sha256`, `phh_toml` e `canonical_json` compactados com `zlib` (`_pack_blob` / `_unpack_bytes`).
   - A compactação reduziu o banco com 3.022 mãos de `149,80 MiB` (sem compressão) para **`31,82 MiB`**, permitindo backup pela interface (`MAX_BACKUP = 64 MiB`; limite de resposta stdout no bridge aumentado para `128 MiB`).

---

## 2. Segurança de ZIP e Isolamento

Todas as inspeções de `.zip` ocorrem em memória via `pokerstars.extract_zip_entries`, sem jamais extrair arquivos diretamente para o sistema de arquivos:

- **Limites estruturais**: ZIP máximo `16 MiB` (`MAX_ZIP_BYTES`), máximo `500` entradas por ZIP (`MAX_ZIP_ENTRIES`), máximo `10 MiB` por entrada (`MAX_ZIP_ENTRY_BYTES`), teto de `64 MiB` descompactados totais (`MAX_ZIP_UNCOMPRESSED_BYTES`) e razão de compressão máxima de `150:1` (`MAX_COMPRESSION_RATIO`).
- **Contadores em fluxo real**: leitura em blocos de `64 KiB` verificando os bytes reais inflados contra `MAX_ZIP_ENTRY_BYTES` e `MAX_ZIP_UNCOMPRESSED_BYTES` (`ZIP_BOMB_STREAM` / `ZIP_BOMB_TOTAL`), não confiando em cabeçalhos `file_size` falsificados.
- **Rejeição de caminhos maliciosos e links**: bloqueia `..`, barras invertidas `\`, caminhos absolutos `/` ou `X:`, caracteres de controle (`ZIP_UNSAFE_PATH`), links simbólicos Unix `S_ISLNK` (`ZIP_SYMLINK`) e entradas criptografadas `flag_bits & 0x1` (`ZIP_ENCRYPTED`). Entradas de extensões alheias (ex.: `.csv`) são ignoradas e registradas como `ZIP_ENTRY_SKIPPED` sem abortar o restante do ZIP.

---

## 3. Classificação Não-Presuntiva de Modalidade (MTT-Only)

Para proteger o catálogo estratégico e as análises exclusivas de torneios MTT (`TreinerLM`):

- **`CASH`**: cabeçalhos de cash game sem `#Tournament`/`#Torneio`.
- **`SNG`**: apenas quando há rótulo explícito (`Spin & Go`, `Spin`, `Sit & Go`, `SNG`) no cabeçalho ou nome do arquivo.
- **`MTT`**: somente quando há rótulo explícito ou **comprovação objetiva multi-mesa** no lote ou já registrada no SQLite para o mesmo `tournamentId` (`table_number >= 2`, `>= 2` nomes distintos de mesa observados no torneio, registro de jogador movido de outra mesa ou colocação final reportada maior que a lotação da mesa).
- **`UNKNOWN` (`gameFormat.status = "MISSING"`)**: mesas `3-max` sem rótulo explícito e mesas únicas `8-max` sem evidência multi-mesa **não são promovidas** automaticamente nem a `Spin & Go` nem a `MTT`. Todas as mãos `UNKNOWN`, `SNG` e `CASH` carregam aviso explícito em `integrity.warnings` indicando que não são vinculadas às referências estratégicas MTT.

---

## 4. Desduplicação, Fluxo em Duas Etapas e Cancelamento Seguro

- **Duplicatas por PokerStars Hand ID e SHA-256**:
  - A chave `ps_hand_id UNIQUE` impede reinserção da mesma mão — tanto idêntica (reimportação do mesmo ZIP/TXT, validada em caminho rápido por `sha256`) quanto com texto diferente (ex.: versão PT-BR e versão EN do mesmo `#HandID`).
  - Reimportações nunca sobrescrevem a mão armazenada nem apagam notas, favoritos, tags ou status de revisão (`library_study` / `library_tags`).
- **Fluxo guiado na interface (`HandLibraryView.tsx`)**:
  1. **Selecionar** `.zip`, `.txt`, `.phh` ou `.json`.
  2. **Analisar (`action=analyzeBatch`)**: executa via NDJSON streaming em tempo real sem criar nem alterar o SQLite em disco; exibe 6 indicadores pré-importação (arquivos encontrados, mãos identificadas, válidas, problemas, duplicatas, total a importar), quebra por formato/idioma e painel expansível com motivos de rejeição.
  3. **Confirmar importação (`action=commitBatch`)**: grava em lotes transacionais de `100` mãos com barra de progresso contínua (`processedFiles / totalFiles`).
- **Cancelamento seguro**: o botão **Cancelar operação** aciona `AbortController` no cliente; a API encerra o processo Python (`child.kill()`) via `libraryStreamCommand`, descartando transações abertas sem corromper o SQLite e preservando apenas lotes já comitados anteriormente.

---

## 5. Resultados Reais com o Arquivo de Amostra do Usuário

Arquivo testado: `HH20261116_T4047894208_No_Limit_Hold'em_US$_1,80_+_US$_0,20.zip` (`658.985` bytes compactados; `5.419.504` bytes descompactados).

### 5.1 Números gerais observados no ZIP real

| Métrica | Valor observado |
| :--- | :---: |
| Arquivos `.txt` dentro do ZIP | `97` (0 ignorados / 0 não-TXT) |
| Total de mãos identificadas | `3.042` (`2.342` PT-BR · `700` EN) |
| Torneios distintos detectados | `96` |
| Distribuição por lotação (mãos válidas/parseáveis) | `8-max`: `2.507` parsed (+ `5` sit-out all-in = `2.512`) · `3-max`: `333` · `9-max`: `149` · `7-max`: `35` · `4-max`: `13` |
| **Mãos válidas e importadas** | **`3.022`** (`2.326` PT-BR · `696` EN) |
| **Modalidades detectadas (válidas)** | **`MTT comprovado`: `2.681`** · **`Formato desconhecido`: `341`** (`333` em `3-max` sem evidência + `8` de mesa única) · `Spin/SNG`: `0` · `Cash`: `0` |
| **Paridade `validateCanonicalHand` (TS)** | **`3.022 / 3.022`** (`0` falhas) |
| Mãos rejeitadas com diagnóstico (`UNSUPPORTED`) | **`20`** |
| Tempo de análise (`analyzeBatch`, Python CLI) | `15,66 s` |
| Tempo de gravação (`commitBatch`, SQLite com `zlib`) | `22,31 s` |
| Re-análise com detecção de `3.022` duplicatas | `1,16 s` (`totalToImport = 0`) |
| Tamanho do SQLite após importar `3.022` mãos | **`31,82 MiB`** (de `149,80 MiB` antes da compressão `zlib`) |
| Backup SQLite (`library.backup`) | Validado (`44.493.484` caracteres base64, SHA-256 íntegro) |

Top 5 torneios no lote de teste: `#4046789324` (`232` mãos válidas, `$2.45+$2.45+$0.60 USD`, MTT), `#4046521887` (`186`, MTT), `#4046520983` (`148`, MTT), `#4045280535` (`136`, MTT) e `#4044647705` (`134`, MTT).

### 5.2 Detalhamento completo das 20 mãos rejeitadas (`UNSUPPORTED`)

Nenhuma dessas 20 mãos teve correção silenciosa ou invenção de eventos; todas receberam diagnóstico explícito:

| # | Hand ID | Arquivo | Código | Motivo técnico observado |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `262735087696` | `HH20261116 T4046789324 No Limit Hold'em US$ 4,90 + US$ 0,60.txt` | `SITOUT_ALLIN_FOLD` | Jogador `joe 2324` em sit out já all-in nos blinds/antes quando o PokerStars registrou `: desiste`/`: folds`. |
| 2 | `262735453114` | `HH20261116 T4046789324 No Limit Hold'em US$ 4,90 + US$ 0,60.txt` | `SITOUT_ALLIN_FOLD` | Jogador `Embezel1952` em sit out já all-in nos blinds/antes quando o PokerStars registrou fold. |
| 3 | `262714140258` | `HH20261114 T4046521887 No Limit Hold'em US$ 1,96 + US$ 0,24.txt` | `SITOUT_ALLIN_FOLD` | Jogador `Mack8751` em sit out já all-in nos blinds/antes quando o PokerStars registrou fold. |
| 4 | `262705211624` | `HH20261113 T4046521937 No Limit Hold'em US$ 1,47 + US$ 0,18.txt` | `SITOUT_ALLIN_FOLD` | Jogador `xannex26` em sit out já all-in nos blinds/antes quando o PokerStars registrou fold. |
| 5 | `262639894465` | `HH20261107 T4044647736 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `SITOUT_ALLIN_FOLD` | Jogador `jacka999` em sit out já all-in nos blinds/antes quando o PokerStars registrou fold. |
| 6 | `262717366866` | `HH20261114 T4047479918 No Limit Hold'em US$ 1,84 + US$ 0,16.txt` | `IMPLICIT_BB_CHECK_MISSING` | Fonte omitiu decisão do Big Blind diante de all-in curto pré-flop antes do runout. |
| 7 | `262692911935` | `HH20261112 T4046936617 No Limit Hold'em US$ 4,60 + US$ 0,40.txt` | `IMPLICIT_BB_CHECK_MISSING` | Fonte omitiu decisão do Big Blind diante de all-in curto pré-flop antes do runout. |
| 8 | `262736715917` | `HH20261116 T4047899380 No Limit Hold'em US$ 0,90 + US$ 0,10.txt` | `IMPLICIT_BB_CHECK_MISSING` | Fonte omitiu decisão do Big Blind diante de all-in curto pré-flop antes do runout. |
| 9 | `262710735105` | `HH20261114 T4045280535 No Limit Hold'em US$ 3,92 + US$ 0,48.txt` | `RAISE_OVER_EFFECTIVE_ALLIN` | Aumento registrado acima do máximo igualável pelos oponentes ativos. |
| 10 | `262681397695` | `HH20261111 T4046676393 No Limit Hold'em US$ 1,84 + US$ 0,16.txt` | `RAISE_OVER_EFFECTIVE_ALLIN` | Aumento registrado acima do máximo igualável pelos oponentes ativos. |
| 11 | `262640111996` | `HH20261107 T4044647736 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `RAISE_OVER_EFFECTIVE_ALLIN` | Aumento registrado acima do máximo igualável pelos oponentes ativos. |
| 12 | `262638935691` | `HH20261107 T4043547794 No Limit Hold'em US$ 3,92 + US$ 0,48.txt` | `RAISE_OVER_EFFECTIVE_ALLIN` | Aumento registrado acima do máximo igualável pelos oponentes ativos. |
| 13 | `262559950730` | `HH20261030 T4043066725 No Limit Hold'em US$ 4,90 + US$ 0,60.txt` | `RAISE_OVER_EFFECTIVE_ALLIN` | Aumento registrado acima do máximo igualável pelos oponentes ativos. |
| 14 | `262705301052` | `HH20261113 T4046523960 No Limit Hold'em US$ 0,50 + US$ 0,05.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto (excluída explicitamente por `PHH_NT_SUBSET_1`). |
| 15 | `262661033139` | `HH20261109 T4045282498 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto. |
| 16 | `262640172875` | `HH20261107 T4044647736 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto. |
| 17 | `262637198169` | `HH20261107 T4044647705 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto. |
| 18 | `262578219175` | `HH20261101 T4037367655 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto. |
| 19 | `262573044299` | `HH20261031 T4043067117 No Limit Hold'em US$ 1,96 + US$ 0,24.txt` | `SHORT_ALLIN_REOPEN_UNSUPPORTED` | Reabertura de agressão na mesma street após all-in incompleto. |
| 20 | `262637625885` | `HH20261107 T4044647705 No Limit Hold'em US$ 2,94 + US$ 0,36.txt` | `AWARD_CONSERVATION_DIVERGENCE` | BB all-in parcial (`235 < 250`) gerou divergência de conservação entre cálculo (`1582`) e reportado pela fonte (`1612`) para `Luiz MNC`. |

---

## 6. Limitações Conhecidas e Escopo

1. **Modalidade de torneio em mesa única**: torneios importados isoladamente com apenas 1 mesa sem indicação explícita (`3-max` sem rótulo Spin & Go ou `8-max` com 1 mesa e sem colocação > assentos/movimento de mesa) permanecem marcados como `UNKNOWN` (`Formato desconhecido`) por segurança. Caso mesas adicionais do mesmo torneio sejam importadas depois, novas mãos daquele torneio passam a reconhecer `MTT` automaticamente.
2. **Mãos com rake > 0**: o perfil canônico `PHH_NT_SUBSET_1` é sem comissão/rake (`RAKE_UNSUPPORTED`). Históricos de cash com rake ou torneios com discrepância de blind parcial / reabertura após short all-in são recusados com diagnóstico claro em vez de mascarados.
3. **Limites por lote na interface web**: até `500` arquivos e `48 MiB` no envio JSON ao `/api/hand-library`, com `MAX_ZIP_BYTES = 16 MiB` por arquivo `.zip` e `MAX_BACKUP = 64 MiB` no backup via navegador.

---

## 7. Verificações Executadas e Evidências Visuais

Todas as validações abaixo foram executadas após a última edição de código, utilizando bancos SQLite temporários descartáveis sem alterar o banco pessoal (`%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`, preservado com 0 mãos e apenas migração aditiva de esquema), nem os arquivos GTO protegidos (`ranges_gto.json` SHA-256 `D46652C5BFE3CED09073FA68544E134683499F18EABDABEF8202D9EE351CB60E`, `verified_ahkd7c_texassolver.json` SHA-256 `868EF9FB8E6371F12DDE7749170015AF4FACCA70AF92DC33AA45251CDD0B3EDA`):

| Verificação | Resultado |
| :--- | :--- |
| `python -m unittest discover -s pipeline\hand_history -t . -p "test_*.py" -v` | **`78 / 78` testes aprovados** (inclui 7 testes novos de segurança ZIP, formato, conservação, modalidade, duplicatas e cancelamento em `test_pokerstars.py`). |
| `npm run typecheck` (`tsc --noEmit`) | **Aprovado (`0` erros)** |
| `npm run lint` (`eslint .`) | **Aprovado (`0` erros)** |
| `npm run build` (`next build`) | **Aprovado (`10` rotas geradas sem erro)** |
| `node --test src/lib/__tests__/pokerstarsImport.test.ts src/lib/__tests__/handLibrary.test.ts src/lib/__tests__/handHistory.test.ts src/lib/__tests__/handReplay.test.ts` (e dentro de `npm test`) | **Todas as suítes da Biblioteca/PokerStars/Replayer/Contrato aprovadas** (`158 / 160` no total do repositório; as únicas 2 falhas são pré-existentes e alheias a esta tarefa: `aiProviders.test.ts` e `posHomologacaoMtt2026.test.ts` falham ao carregar `app/src/lib/ai/security.ts:4` devido a syntax `public readonly` incompatível com strip-only no Node 24). |
| `python -m unittest windows.test_launcher` | 6 aprovados; 2 falhas esperadas no momento da execução apenas por conflito de porta (`WinError 10048` em `127.0.0.1:3000` já ocupado pela instância local em execução). |
| **Teste E2E em navegador real (Edge + `next start` + SQLite temporário)** | **Aprovado (`ok: true`, banco final `31,84 MiB`)**: cancelamento durante análise sem criar banco, análise completa do ZIP real (`3.042` / `3.022` / `20`), gravação em SQLite, reimportação idempotente (`3.022` duplicadas / `0` a importar), seleção simultânea de múltiplos `.txt` PT/EN (`+2`), filtros por torneio `#4046789324` (`232` mãos) e modalidade `MTT comprovado`, `Backup SQLite` HTTP 200, marcação de favorito e abertura no **Replayer**. Zero erros de console, exceções ou HTTP `>= 400`. |

### Evidências de Interface

- [Prévia de análise com o ZIP real (97 arquivos, 3.042 mãos, 3.022 válidas, 20 rejeitadas)](./screenshots/importador-ps-2026/01_previa_analise_zip_real.png)
- [Biblioteca filtrada no torneio #4046789324 (232 mãos MTT comprovado)](./screenshots/importador-ps-2026/02_biblioteca_filtros_mtt.png)
- [Replayer aberto em mão PokerStars importada do ZIP real](./screenshots/importador-ps-2026/03_replayer_pokerstars.png)

---

## 8. Arquivos Modificados e Criados nesta Tarefa

### Criados
- `pipeline/hand_history/pokerstars.py` — extração ZIP segura, splitter/parser bilíngue PT-BR/EN, classificador de modalidade não-presuntivo e reconstrução em passo único no `importer.Session`.
- `pipeline/hand_history/test_pokerstars.py` — suíte Python de segurança ZIP, detecção de formatos, side pots, devoluções, desduplicação e cancelamento.
- `app/src/lib/__tests__/pokerstarsImport.test.ts` — testes Next.js/API `analyzeBatch`/`commitBatch`, NDJSON stream, filtros SQLite, estudo, validação canônica e Replayer.
- `docs/IMPORTADOR_POKERSTARS_ZIP_TXT.md` — esta documentação.
- `docs/screenshots/importador-ps-2026/*.png` — capturas do fluxo E2E no navegador.

### Modificados
- `pipeline/hand_history/importer.py` — correção de `_allocate_pot_awards` para múltiplos potes e extração de `finalize_session_result` com suporte opt-in a `origin="POKERSTARS"`.
- `pipeline/hand_history/library.py` — tabela aditiva `library_pokerstars`, compactação `zlib`, desduplicação por `ps_hand_id`/`sha256`, pipeline `analyze_import_batch`/`commit_import_batch` e filtros `tournament`/`format`.
- `pipeline/hand_history/library_cli.py` — suporte a comandos em streaming NDJSON e cancelamento por sinal `SIGTERM`/`SIGINT`.
- `app/src/lib/poker/handHistorySchema.ts` — extensão do contrato `CanonicalHand` (`"POKERSTARS"`, `"PS_TEXT_1"`).
- `app/src/lib/poker/handHistoryValidation.ts` — validação de `ps-sha256:`, `PS_TEXT_1` e coerência de `event.origin`.
- `app/src/lib/server/libraryBridge.ts` — função `libraryStreamCommand`, cancelamento por `AbortSignal` e limite de resposta de `128 MiB`.
- `app/src/app/api/hand-library/route.ts` — rotas `analyzeBatch` e `commitBatch` com validação estrita e streaming `application/x-ndjson`.
- `app/src/lib/handLibraryClient.ts` — funções `encodeBatchFiles` e `runBatchImportStream`.
- `app/src/components/HandLibraryView.tsx` — fluxo guiado em etapas, progresso em tempo real, cancelamento, pré-diagnóstico e filtros por torneio/modalidade.
- `app/src/components/ReplayerView.tsx` — suporte a proveniência `library-pokerstars`, selo `REGISTRO POKERSTARS` e badges de torneio/modalidade.
