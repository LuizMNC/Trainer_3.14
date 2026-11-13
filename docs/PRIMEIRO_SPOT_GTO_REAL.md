# ETAPA 6 — Primeira Solução GTO Real e Verificável (`PRIMEIRO_SPOT_GTO_REAL.md`)

**Data:** 12 de novembro de 2026  
**Escopo:** Transição da plataforma para suportar soluções GTO pós-flop produzidas por solver real verificável, ponta a ponta: **Configuração do cenário → Execução/Importação auditável → Validação de integridade → Visualização 13×13 + combos → Treinamento com política honesta de EV loss**.

---

## 1. Auditoria do Adaptador Existente e Correções Aplicadas

Foram inspecionados os arquivos [solverAdapter.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/solverAdapter.ts), [strategySchema.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/strategySchema.ts), [drillEvaluator.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/drillEvaluator.ts), [poker.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker.ts), [TrainerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/TrainerView.tsx), [PokerStudioApp.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/PokerStudioApp.tsx) e [RangeMatrix.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/RangeMatrix.tsx).

### Lacunas identificadas e corrigidas

1. **Remoção de bypass legado e botão sintético na interface ([TrainerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/TrainerView.tsx)):**
   - Havia fallback chamando `validateAndBuildVerifiedStrategy` na importação da UI e um botão de exemplo sintético (`"Carregar Exemplo Válido (VERIFIED)"`). Ambos foram removidos. O modal de importação agora aceita exclusivamente JSON (`SolverAdapter v1.1.0` / bundle `TexasSolver`) ou arquivo CSV exportado do `Desktop Postflop`, além de manter o teste negativo (`Testar Payload Inconsistente (-> UNSOLVED)`).
2. **Endurecimento criptográfico e estrutural do contrato (`SOLVER_ADAPTER_VERSION = "1.1.0"`):**
   - [strategySchema.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/strategySchema.ts) e [solverAdapter.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/solverAdapter.ts) passaram a exigir **SHA-256 válido (64 hex)** (`provenance.fileSha256`), data ISO válida (`createdAtIso`), nomes/referências não-sintéticos (rejeitando placeholders e rótulos como `synthetic`, `mock`, `manual`, `solveradapter.ts#*`), metadados explícitos de ranges (`ranges`), histórico de ações não-vazio no pós-flop, `potSizeBb >= sbBb + bbBb + playersCount * anteBbPerPlayer`, unicidade de assentos e consistência legal contra `toCallBb` (`Fold`/`Call` proibidos com `toCallBb === 0`; `Check`/`Bet` proibidos com `toCallBb > 0`; `sizeBb <= effectiveStackBb`).
   - `SolutionAssumptions` e `computeAssumptionsHash` passaram a incluir `board`, `potSizeBb`, `heroPosition`, `villainPosition`, `actionHistorySignature`, `rangesSignature` e `rangesSourceRef`.
3. **Separação explícita entre frequência GTO e disponibilidade de EV ([drillEvaluator.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/drillEvaluator.ts)):**
   - Adicionados `evScored: boolean` e `evUnavailableReason?: string`.
   - `assertSpotAllowedInTechnicalGtoMode` e `evaluateDrillDecision(mode: "GTO_TECHNICAL")` bloqueiam não apenas spots sem `status === "VERIFIED"`, mas também qualquer objeto `VERIFIED` adulterado sem `assumptionsHash` ou `solutionSource` autêntico.
4. **Sanitização de cache local e suporte a subsets pós-flop ([PokerStudioApp.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/PokerStudioApp.tsx), [poker.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker.ts), [RangeMatrix.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/RangeMatrix.tsx)):**
   - [PokerStudioApp.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/PokerStudioApp.tsx) descarta entradas antigas em `localStorage` (`STORAGE_KEY_VERIFIED`) que não possuam `assumptionsHash` e SHA-256 válido de 64 caracteres hexadecimais.
   - `pickDrillHand` e `isBorderlineHand` em [poker.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker.ts) agora sorteiam mãos estritamente dentro das chaves presentes em `spot.matrix` quando o spot é um subset pós-flop (`< 169` classes), impedindo o sorteio de mãos inexistentes no range (ex.: `72o` no C-Bet do BTN).

---

## 2. Escolha e Preparação do Solver

| Solver Avaliado | Licença | Execução CLI / Windows | Exportação de Frequência e EV | Decisão na Etapa 6 |
|---|---|---|---|---|
| **TexasSolver v0.2.0** (`bupticybee/TexasSolver`) | AGPL-3.0 | **CLI headless nativa** (`console_solver.exe --input_file ... --mode holdem`) | Exporta árvore JSON (`dump_result`) com **frequências por combo**, mas **não exporta EVs por ação na CLI** (`evExportedByCli = false`) | **Escolhido para execução real automatizada**, mantendo o executável **fora** do repositório Git (`--solver-exe` / `TEXASSOLVER_EXE`) |
| **Desktop Postflop v0.2.7** (`b-inary/desktop-postflop`) | AGPL-3.0 | Aplicação GUI Tauri (sem modo CLI automatizado) | Exporta CSV (`ResultTable.vue`: `Hand,Weight,Combos[,Equity,EV,EQR][,<Action> %,<Action> EV,...]`) **com frequências e EV por ação** | **Suportado como importador auditável com EV loss** via `parseDesktopPostflopCsvToPayload` + SHA-256 |
| **Solvers comerciais proprietários** (ex.: `PioSOLVER` / `Simple Postflop`) | Proprietária / Paga | REST / CLI apenas em licenças pagas ou limitadas | Exportação proprietária | Não integrados para manter reprodutibilidade gratuita/aberta e conformidade de licença |

### Requisitos observados em ambiente Windows local
- Memória privada de pico medida pelo wrapper durante a árvore completa descrita abaixo: **`1771.3 MB`** (`WorkingSet64` pico de **`1603.2 MB`**) usando **`4` threads** e isomorfismo ativado (`set_use_isomorphism 1`).
- Conformidade AGPL-3.0: o binário `console_solver.exe` e seus recursos não são versionados no repositório; apenas o orquestrador [solve_texassolver.py](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solve_texassolver.py) e os artefatos de saída auditáveis (`solver_input.txt`, `texassolver_raw.json`, logs, manifestos e bundle JSON) são armazenados.

---

## 3. Configuração do Primeiro Cenário Real (`BTN vs BB SRP 30BB chipEV`)

- **Identificador (`spotId`):** `verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet`
- **Modelo e Formato:** MTT 8-Max, modelo `chipEV`, `rakePct = 0.0`, stack inicial de referência **`30.0 BB`**, blinds **`0.5 / 1.0 BB`**, ante por jogador **`0.125 BB`** (`8 × 0.125 BB = 1.0 BB` de antes na mesa *(inferido para estrutura 8-Max BBA consistente com os parâmetros do catálogo)*).
- **Histórico de ações até o nó resolvido (`actionHistory`):**
  1. `PREFLOP`: `UTG`, `MP`, `LJ`, `HJ`, `CO` → `Fold`
  2. `PREFLOP`: `BTN` → `Raise 2.1 BB`
  3. `PREFLOP`: `SB` → `Fold`
  4. `PREFLOP`: `BB` → `Call 2.1 BB`
  5. `FLOP` (`Ah Kd 7c`): `BB` → `Check` (`resolvedNodePath: ["CHECK"]`)
- **Estado do nó de decisão (`BTN` IP no Flop):**
  - **Pote no flop:** `0.5 (SB) + 2.1 (BB) + 2.1 (BTN) + 1.0 (antes) = 5.7 BB`
  - **Stack efetivo remanescente:** `30.0 - 2.1 = 27.9 BB`
  - **Escala `10×` no TexasSolver (`solverUnitsScaleFactor = 10.0`):** `set_pot 57` e `set_effective_stack 279` (`1 unidade = 0.1 BB`). Esse escalonamento evita arredondamento grosseiro de `1.9 BB` para `2.0 BB`, resultando exatamente nas ações de nó **`CHECK` (`0.0 BB`)**, **`BET 19.000000` (`Bet_33pct`, `1.9 BB` / `33.3%` do pote)** e **`BET 43.000000` (`Bet_75pct`, `4.3 BB` / `75.4%` do pote)**.
- **Ranges pré-flop rastreáveis ([ranges_gto.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/data/ranges_gto.json)):**
  - SHA-256 do arquivo de origem: `d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e`
  - **IP (`BTN`):** spot `30bb_rfi_btn`, ação `Raise` — **101 classes de mãos** (exatamente **563 combos vivos** no board `Ah Kd 7c`, conforme verificado no manifesto).
  - **OOP (`BB`):** spot `30bb_bb_vs_btn_rfi`, ação `Call` — **132 classes de mãos**.
- **Árvore de apostas configurada em [solver_input.txt](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/solver_input.txt):**
  - `oop,flop`: `raise,100` (check-only antes da ação IP; donk bet omitido por restrição de RAM)
  - `ip,flop`: `bet,33,75` e `raise,100`
  - `turn` (OOP e IP): `bet,66` e `raise,100`
  - `river` (OOP e IP): `bet,75` e `raise,100`
  - `set_allin_threshold 0.67`, `set_use_isomorphism 1`, `set_thread_num 4`, `set_accuracy 0.5`, `set_max_iteration 100`, `set_dump_rounds 1`

---

## 4. Execução, Arquivos Gerados, Convergência e Integridade (SHA-256)

### Comando reproduzível
```bash
python pipeline/solve_texassolver.py --solver-exe <caminho/para/console_solver.exe>
```

### Artefatos gerados e integridade verificada
| Arquivo / Referência | Papel | Tamanho / Escopo | SHA-256 |
|---|---|---|---|
| `console_solver.exe` (externo ao Git) | Executável `TexasSolver v0.2.0` (AGPL-3.0) | Executável Windows | `8b74cd6f687387a9ea6c567591642cfe0bfca88360a1748ff7c7db769d0c5c1a` |
| [ranges_gto.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/data/ranges_gto.json) | Fonte dos ranges pré-flop `BTN` e `BB` | 229 spots | `d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e` |
| [solver_input.txt](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/solver_input.txt) | Script de entrada gerado pelo pipeline | `1849 B` | `3320c8f95a9fd2e72f13d45d0fba8e3d090496dac726d286ee8ad32275581baa` |
| [texassolver_raw.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/texassolver_raw.json) | Saída bruta `dump_result` do solver | `248100 B` | `b12c254b27653b943c7e03d3a37dd744f4f691b1ce46ef14a689070a36ded187` |
| [convergence_log.jsonl](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/convergence_log.jsonl) | Curva iterativa de exploitability | `424 B` | `3c03ac7b2512c6f461d53ded4e8e1bb192b71cdd248995f54493f48353dbf043` |
| [solver_stdout.log](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/solver_stdout.log) | Registro de saída do `console_solver.exe` | `83331 B` | — |
| [run_manifest.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/run_manifest.json) | Manifesto auditável da execução | `4931 B` | — |
| [canonical_bundle.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp/canonical_bundle.json) & [verified_ahkd7c_texassolver.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/data/verified_ahkd7c_texassolver.json) | Bundle importado pelo frontend (`101` classes / `563` combos) | `85139 B` | Incorpora os 4 hashes acima em `manifest.hashes` |

### Curva real de convergência observada
- Tempo total de execução do processo: **`272.83s`** (`239.388s` de CFR reportado pelo solver até a iteração 60; pico de commit RAM **`1771.3 MB`** / Working Set **`1603.2 MB`**).
- Alvo configurado: `< 0.5%` de exploitability do pote; linha final em stdout: `"Total exploitability 0.41485 precent"`:
  - Iteração `10` (`62.601s`): `11.919278%`
  - Iteração `20` (`98.016s`): `4.352471%`
  - Iteração `30` (`134.828s`): `1.813564%`
  - Iteração `40` (`170.738s`): `0.955941%`
  - Iteração `50` (`205.124s`): `0.600663%`
  - Iteração `60` (`239.388s`): **`0.414850%`**

### Exemplos de estratégias de equilíbrio obtidas (nó Flop C-Bet IP do BTN)
- `AA`: `Check 0.033357`, `Bet_33pct 0.723422`, `Bet_75pct 0.243221`
- `AKs`: `Check 0.000986`, `Bet_33pct 0.632291`, `Bet_75pct 0.366723`
- `KK`: `Check 0.019752`, `Bet_33pct 0.964992`, `Bet_75pct 0.015255`
- `77`: `Check 0.001246`, `Bet_33pct 0.622423`, `Bet_75pct 0.37633`
- `QTs`: `Check 0.012248`, `Bet_33pct 0.217355`, `Bet_75pct 0.770397`

---

## 5. Como a Solução é Validada e Importada

1. **Bundle `TexasSolver` ([solverAdapter.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/solverAdapter.ts) — `importTexasSolverBundle`):**
   - Valida formato SHA-256 (64 hex) para `solverInputSha256`, `rawOutputSha256`, `rangesSourceSha256` e `executableSha256`.
   - Rejeita o bundle caso `matrixEv` seja preenchida enquanto `evExportedByCli === false` (impedindo EVs injetados/fabricados).
   - Valida que todas as `101` classes em `matrixFrequencies` somam `1.0 ± 0.005`, que cada classe possui o número exato de combos livres devolvido por `getAvailableCombosForClass(hc, ["Ah", "Kd", "7c"])`, que **nenhum combo usa carta morta do board** (`563` combos validados), e que a média dos combos bate com `matrixFrequencies` (`<= 0.002`).
   - Em [page.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/app/page.tsx), o bundle [verified_ahkd7c_texassolver.json](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/data/verified_ahkd7c_texassolver.json) passa por `importTexasSolverBundle` antes de ser entregue a `<PokerStudioApp />`.
2. **CSV do `Desktop Postflop` ([solverFormats.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/solverFormats.ts) — `parseDesktopPostflopCsvToPayload` + `computeSha256Hex`):**
   - Lê colunas `<Action> %` e `<Action> EV`, ignora linhas com `Weight = 0`, detecta colisões com o board em combos de 4 caracteres, agrega por `Weight × Combos`, calcula automaticamente SHA-256 via WebCrypto no carregamento do arquivo na UI e submete o payload ao `importExternalSolverSolution` (`v1.1.0`) para validação completa e cálculo de `EV loss` real.

---

## 6. O que Funciona Hoje na Interface e no Treinador

- **Visualização da Matriz 13×13 e Combos ([RangeMatrix.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/RangeMatrix.tsx)):** exibe os splits de `Check`, `Bet_33pct` (`1.9 BB`) e `Bet_75pct` (`4.3 BB`), distingue visualmente células sem entrada no range de RFI do BTN (sem rotulá-las erroneamente como `Fold 100%`), e detalha cada combo individual vivo (ex.: `AsKs`, `AcKc` para `AKs`) ao inspecionar uma mão.
- **Modo GTO Técnico (`GTO_TECHNICAL`) e Randomizador ([TrainerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/components/TrainerView.tsx)):** o primeiro spot real fica liberado para estudo em `GTO_TECHNICAL` com randomizador RNG (`1..100`), barra de proveniência exibindo prefixo SHA-256, exploitability atingida (`0.41485%`) e ranges de origem.
- **Bloqueio mantido para spots não verificados:** os `3 DIDACTIC_DEMO`, os `6 UNSOLVED` e os `229 IMPORTED_CHART_NO_EV` permanecem bloqueados no `Modo GTO Técnico`.
- **Política honesta de EV loss ([drillEvaluator.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Repositório%20Github/Projeto-Poker/app/src/lib/poker/drillEvaluator.ts)):**
  - Para o spot `TexasSolver v0.2.0 CLI`: `gtoScored = true`, porém **`evScored = false`, `evLoss = null`, `evUnit = null`**, com mensagem explícita na interface explicando que a CLI do TexasSolver não exporta EVs por ação.
  - Para CSV importado do `Desktop Postflop` (ou JSON `v1.1.0` com `matrixEv` autêntica): `evScored = true`, **`evLoss` numérico real em `bbEV` e comparação matemática de sizings (`compareActionSizings`) ficam ativos**.

---

## 7. Limitações Conhecidas

1. **Ausência de EV por ação no `TexasSolver v0.2.0` CLI:** `dump_result` exporta apenas estratégias (`strategy`); habilitar `EV loss` numérico no mesmo spot exige importação de CSV gerado externamente pelo `Desktop Postflop` (GUI) ou outro solver externo que exporte EV por ação.
2. **Ausência de CLI no `Desktop Postflop v0.2.7`:** o suporte está pronto para importação e verificação (`parseDesktopPostflopCsvToPayload`), mas a execução dessa árvore com EV depende de rodagem externa manual na GUI do Desktop Postflop.
3. **Orçamento de memória (`<= ~1.8 GB` vs teto de `2.3 GB`):** a árvore foi resolvida com `oop,flop` sem donk bet e 1 sizing no Turn (`66%`) e River (`75%`), convergindo em `0.41485%` (alvo `< 0.5%`). Árvores multi-sizing profundas ou precisões `<= 0.1%` exigem mais memória RAM e maior tempo de execução.
4. **Cobertura de nó único:** apenas o primeiro nó de decisão IP (`BB Check -> BTN Action` no flop `Ah Kd 7c`) está embarcado; nós subsequentes (face a check-raise, turn, river) não foram embarcados no bundle inicial.
5. **Agregação por classe em `solve_texassolver.py`:** o agregador calcula a média uniforme sobre os combos vivos da mesma classe; isso é exato enquanto todos os combos daquela classe tiverem o mesmo peso pré-flop de entrada em `30bb_rfi_btn`.
6. **Ante 8-Max (`0.125 BB`):** adotada de forma explícita e consistente com o histórico de pote `5.7 BB` do catálogo do projeto.

---

## 8. Resultados Reais Observados de Testes, Lint, Typecheck e Build

Todos os comandos abaixo foram executados após a última edição em `Projeto-Poker/app`:

| Verificação | Comando | Resultado Observado |
|---|---|---|
| **Testes automatizados** | `npm test` (`node --test src/lib/__tests__/*.test.ts`) | **29/29 testes passando em 7 suítes**, `0` falhas, `0` cancelados, `0` pulados (`721.75 ms`), cobrindo `pokerCore.test.ts` (`10`), `etapa1Audit.test.ts` (`6` em 2 suítes), `etapas2To5.test.ts` (`9` em 4 suítes) e `etapa6RealSolver.test.ts` (`4` em 1 suíte). |
| **Lint estático** | `npm run lint` (`eslint .`) | **0 erros, 0 warnings** (código de saída `0`). |
| **Checagem de tipos** | `npm run typecheck` (`tsc --noEmit`) | **0 erros** (código de saída `0`). |
| **Build de produção** | `npm run build` (`next build`, Next.js `15.5.29`) | **Compilado com sucesso em `10.9s`**, validação de tipos/lint OK, `5/5` páginas estáticas geradas (`/` com `94.3 kB` / `197 kB` First Load JS; código de saída `0`). |
