# TreinerLM (`Projeto-Poker`) — Estúdio Offline de Poker MTT

Aplicação web e desktop local para estudo **offline** e exclusivo de torneios **Multi-Table Tournament (MTT 8-Max, Ante 0,125 BB)**, desenvolvida por **Luiz Miguel N. C.** com arquitetura **Next.js 15 + React 19 + TypeScript**, pipeline **Python + SQLite** para histórico e replay de mãos e iniciador Windows nativo (`TreinerLM` / `π`).

> **Escopo de Uso e Integridade:** Ferramenta estritamente voltada a revisão pós-sessão e treinamento offline de MTT. Não possui captura de tela, leitura de mesas ao vivo, HUD nem assistência em tempo real (anti-RTA).

---

## Principais Módulos (7 Domínios)

1. **Treinar** (`Modo Trainer` + `Treiner Limpo`):
   - **Modo Trainer (`TrainerView`):** Prática com solução GTO pós-flop verificada no TexasSolver (`Ah Kd 7c`, `BTN vs BB SRP 30BB chipEV`), importação de bundles JSON (`SolverAdapter v1.1` / TexasSolver CLI / CSV do Desktop Postflop), randomizador RNG `[1..100]`, filtro de dificuldade e submodo de **Treinos Interativos & Daily Dose** (6 modos: Daily Dose, Construtor 13×13, Pot Odds/MDF, Blockers, Comparador de Sizings e C-Bet Flop).
   - **Treiner Limpo (`CleanRangeTrainerView`):** Palco focado na memorização das **216 matrizes pré-flop MTT confirmadas**, com avaliação via `drillEvaluator.ts`, aderência mista ponderada (`1 - TVD`), persistência automática em `localStorage` (`treinerlm_clean_trainer_v1`) e personalização visual da mesa.
2. **Ranges MTT** (`RangeExplorerView`):
   - Explorador exclusivo das **216 matrizes pré-flop MTT** (`14`, `17`, `20`, `30`, `50` e `100 BB` — `42` RFI, `168` vs RFI, `6` vs Limp), comparador lado a lado, auditoria de integridade de soma por célula e seletores de modalidade (`MTT chipEV`, `MTT com ICM ($EV)` e `MTT PKO`, com aviso honesto quando sem solver local).
   - *Regra MTT-Only:* Os `13` spots históricos de Spin & Go presentes em `app/src/data/ranges_gto.json` são preservados sem alteração para rastreabilidade criptográfica (`SHA-256`), porém filtrados e bloqueados em todos os treinos, exploradores e agendamento Leitner pela camada `app/src/lib/poker/mttCatalog.ts`.
3. **Biblioteca** (`HandLibraryView`):
   - Ingestão de arquivos de histórico de mãos (`.txt` / `.phh`) via pipeline Python em SQLite local (`%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`), filtros de estudo, marcação de revisão e exportação segura.
4. **Replayer** (`ReplayerView`):
   - Replay rua a rua com controle de velocidade, análise de pot odds/MDF/SPR, envio de cenários para o Laboratório e sincronização bidirecional de `"Marcar para revisão"` com o SQLite da Biblioteca.
5. **Laboratório** (`MathIcmLab` + `MathLab`):
   - Simuladores de EV, Pot Odds, Fold Equity, MDF, ICM (Malmuth-Harville), Bubble Factor, modelo PKO com `bountyChipFactor` explícito, **Equidade Exata** e **Monte Carlo**.
6. **Estudos** (`Currículo RegLife`, `Erros Fatais` e `AI Coach`):
   - **18 aulas** estruturadas no Currículo RegLife, catálogo de **Erros Fatais**, índice local com **322 trechos** e **22 vídeos locais** (materiais curados de estudo como *Dicionário do Poker*, *E-book ICM*, *5 Erros em Retas Finais*, *Ranges MTT 8-Max*, Fitzgerald, Crawford, Hissa/Caputo e Leo Bello) + integração opcional via Google AI Studio (`GEMINI_API_KEY`).
7. **Estatísticas** (`StatsView`):
   - Diagnóstico taxonômico de leaks por posição/stack, mapa de calor MTT (`14 BB` a `100 BB`), agenda de repetição espaçada (Sistema Leitner) e fila de revisão manual de mãos.

---

## Pré-requisitos e Instalação Local

- **Node.js** `>= 22` e `npm`
- **Python** `>= 3.11` com ambiente virtual em `pipeline/hand_history/.venv`
- *(Opcional)* Chave `GEMINI_API_KEY` em `app/.env.local` ou na modal **Configurar IA** para habilitar o `AI Coach`

### Executar a aplicação Web (`app/`)

```bash
cd app
npm install
npm run dev
```

Ou em modo produção local:

```bash
cd app
npm run build
npm run start
```

Variáveis úteis do backend local:
- `POKER_LIBRARY_ENABLED=1` — habilita os endpoints da Biblioteca de Mãos (`/api/hand-library`)
- `POKER_LIBRARY_DATABASE` — caminho alternativo do arquivo SQLite para testes/estudos isolados
- `POKER_HH_PYTHON` — caminho explícito do executável Python da `.venv`

### Iniciar via Desktop Windows (`windows/`)

Para preparar ou validar o atalho da Área de Trabalho (`TreinerLM.lnk`):

```powershell
powershell -ExecutionPolicy Bypass -File .\windows\Prepare-GTOTrainer.ps1
powershell -ExecutionPolicy Bypass -File .\windows\Verify-GTOShortcut.ps1
```

O iniciador `windows/launcher.pyw` sobe o servidor Next.js local em loopback (`127.0.0.1`), protege a porta com mutex de instância única e abre a interface no navegador padrão.

---

## Testes e Verificação

### 1. Typecheck, Lint, Suíte Unitária TypeScript e Build (`app/`)

```bash
cd app
npm run typecheck
npm run lint
npm test
npm run build
```

### 2. Suítes Python (Pipeline de Histórico de Mãos e Launcher Windows)

Executar a partir da raiz do repositório (`Projeto-Poker`):

```powershell
.\pipeline\hand_history\.venv\Scripts\python.exe -m unittest discover -s pipeline\hand_history -t . -p "test_*.py"
.\pipeline\hand_history\.venv\Scripts\python.exe -m unittest windows\test_launcher.py
```

---

## Documentação e Auditorias (`docs/`)

- [docs/AUDITORIA_GERAL_ESTADO_ATUAL_2026.md](docs/AUDITORIA_GERAL_ESTADO_ATUAL_2026.md) — Diagnóstico arquitetural e funcional inicial
- [docs/AUDITORIA_VISUAL_TIPOGRAFICA_2026.md](docs/AUDITORIA_VISUAL_TIPOGRAFICA_2026.md) — Auditoria tipográfica e de Design System
- [docs/AUDITORIA_RANGES_MTT_ONLY.md](docs/AUDITORIA_RANGES_MTT_ONLY.md) — Inventário, classificação e auditoria de integridade dos ranges MTT vs Spin & Go
- [docs/ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md](docs/ANTIGRAVITY_REFINAMENTO_GERAL_MTT.md) — Relatório técnico completo de correções, padronização visual/MTT-Only e verificações
