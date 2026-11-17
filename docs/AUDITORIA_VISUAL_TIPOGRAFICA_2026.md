# AUDITORIA VISUAL, TIPOGRÁFICA E DE DESIGN SYSTEM — `Projeto-Poker` (`TreinerLM`)

**Data da auditoria:** 16/11/2026  
**Escopo:** Auditoria estritamente não destrutiva de tipografia, hierarquia visual, nomenclatura pt-BR, formas geométricas, espaçamentos, cores/contraste, Mesa de Poker, Range Explorer, modais, responsividade e Design System no estado atual (`HEAD 7a0d5d8bc54328a5f56576724a85728aac7b47d0`).  
**Regra cumprida:** Nenhum arquivo de código, estilo, fonte, cálculo, estratégia GTO, banco SQLite ou documentação anterior foi modificado.

---

## 1. RESUMO EXECUTIVO

O **`TreinerLM` (`Projeto-Poker`)** passou por duas reestilizações visuais recentes ainda não documentadas (`2412db0` e `7a0d5d8`, de 15/11/2026) que substituíram a identidade original verde-esmeralda/grafite (`#18B88D` / `#101112`) por um tema escuro azul/vermelho/preto (`#05070B` / `#2563EB` / `#DC2626`) e adicionaram a 11ª aba (**Treiner Limpo**), painéis recolhíveis e personalização de mesa.

Sob o ponto de vista de **Design System e tipografia**, o aplicativo apresenta hoje **três sistemas visuais coexistindo sem unificação**:
1. **Novo tema global (`globals.css` / `PokerStudioApp` / `CleanRangeTrainerView` / `CollapsiblePanel`):** fundo `#05070B`, cards `#090D16`, bordas `#1E293B`/`#26334A`, gradientes `#DC2626 → #2563EB` e raios `rounded-xl`/`rounded-2xl`.
2. **Resíduos do tema cinza-grafite legado (`StatsView`, `HandLibraryView`, `TrainerView` modal, `InteractiveDrillsLab`, `ReplayerView.module.css`):** centenas de ocorrências de `#191B1D`, `#292C2F`, `#090B0C`, `#A1A6AA` e `#F4F5F5` lado a lado com cards novos (ex.: na fileira de KPIs de `StatsView.tsx:1088-1163`, 4 de 5 cards são cinza legado e 1 é azul escuro novo).
3. **CSS Modules independentes (`MathLab.module.css` e `ReplayerView.module.css`)** e variáveis em `globals.css:15-16` ainda nomeadas `--gto-accent-green` / `--gto-selection-green` contendo valores **azuis** (`#60a5fa`, `#2563eb`).

Principais achados críticos de UI/Tipografia:
- **Tipografia principal (`Inter`) não está carregada:** `layout.tsx` não usa `next/font` nem `@font-face`; `document.fonts.check("16px Inter")` retorna `false`, fazendo a interface renderizar em **`Segoe UI` / `system-ui`** no Windows.
- **Abuso sistemático de microtipografia (`< 12 px`):** `text-xs` (`12 px`) domina `289` usos de corpo/botão/rótulo, acompanhado por mais de `60` declarações entre **`8 px` (`0.5rem`) e `11 px` (`0.6875rem`)**, inclusive em células de matriz (`8.32 px` no mobile), assentos da mesa (`8.32–9.28 px`) e `<kbd>` (`9.6 px`).
- **Falhas de contraste WCAG AA e conflito semântico de cor nas ações:** `RangeMatrix` aplica `#FFFFFF` sobre fundo `#EAB308` (`1.92:1`), `#22C55E` (`2.28:1`), `#F43F5E` (`3.67:1`) e `#3B82F6` (`3.68:1`); no `Modo Trainer`, o botão `Check/Call` (`#FFFFFF` sobre `#3FA65B`) registra **`3.08:1`**. Além disso, **Azul significa `Fold` na matriz e no `Modo Trainer`, mas significa `Call/Check` nos botões do `Treiner Limpo`**.
- **Inconsistência e exposição de termos técnicos em inglês/snake_case:** Strings como `BET 33PCT`, `amostra_insuficiente (<10)`, `IMPORTED_CHART_NO_EV`, `PHH_NT_SUBSET_1`, `Study Lab V2` e erros gramaticais (`1 aulas`, `0 mão`) aparecem diretamente para o usuário final.
- **Cabeçalho e modais com atrito de layout:** 11 abas sofrem corte horizontal sem indicador visual abaixo de `1280 px` (até `1015 px`), o header móvel consome ~`18,5%–23,8%` da tela `390×844`, e o `SettingsModal` + modal `Importar Solver` não usam `<dialog>` nativo, bloqueiam `Esc` e carecem de `aria-modal="true"` e rolagem interna (`max-h`).

---

## 2. FONTES ATUAIS

| Propriedade | Valor encontrado no código e build (`app/.next/static/css/0fd44454ca3ce20d.css`) | Diagnóstico |
|---|---|---|
| **Família principal (`globals.css:27-35`)** | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | **`Inter` não existe no projeto.** Sem `next/font/google`, sem `@font-face` e sem arquivos `.woff2`/`.ttf`. |
| **Família computada no browser** | `document.fonts.check("16px Inter") === false`; no Windows 11 recai sobre **`Segoe UI` / `system-ui`**. | Em diferentes sistemas operacionais o usuário vê fontes distintas (`Segoe UI` no Windows, `SF Pro` no macOS, `Roboto`/fallback no Linux), alterando métricas de largura de abas e células. |
| **Fontes secundárias (`font-mono`)** | Tailwind: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace` | Usada extensivamente (`cards`, `RangeMatrix`, stacks, potes, tabelas, badges). Em `MathLab.module.css:16`, `<textarea>` usa `font-family: monospace` genérico em vez de pilha unificada. |
| **Fonte `font-serif`** | `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif` | Usada exclusivamente em 2 pontos para desenhar o símbolo **`π`** (`PokerStudioApp.tsx:439, 855` e `PokerTable.tsx:381`). |
| **Pesos carregados / aplicados** | `400` (`normal`), `500` (`medium`), `600` (`semibold`), `700` (`bold`), `750` (CSS `globals.css:104`), `800` (`extrabold`), `900` (`black`) | Peso `750` não existe em `Segoe UI` nem sem fonte variável; `semibold`/`bold`/`extrabold` competem entre si em todo o painel reduzindo contraste hierárquico. |
| **Dependência remota & desempenho** | Nenhuma requisição externa de fonte (0 chamadas CDN). | Excelente para modo 100% offline, porém carregar `Inter` local via `next/font/local` (ou `@fontsource-variable/inter`) mantém funcionamento offline sem custo de rede e garante métricas consistentes com `tabular-nums`. |

**Comparativo para sessões longas de estudo (Inter / Geist / IBM Plex Sans):**  
- **`Inter` (via `next/font/google` no build ou auto-hospedada offline):** excelente legibilidade em `12–16 px`, suporte nativo a `font-variant-numeric: tabular-nums` e `slashed-zero` (`cv05`/`ss01`), licença OFL 1.1, custo de alteração muito baixo (`1` importação em `layout.tsx`), mantendo consistência caso empacotada localmente para o executável Windows offline.  
- **`Geist Sans` + `Geist Mono` (`next/font` ou pacote npm `geist`):** estética moderna alinhada a ferramentas técnicas/Vercel, excelente alinhamento tabular em números de EV/frequência e compatibilidade offline total ao instalar o pacote local `geist` (licença MIT/OFL), sem depender de download em runtime.

---

## 3. TAMANHOS TIPOGRÁFICOS ENCONTRADOS

Levantamento completo no código-fonte (`app/src/components/**` e `app/src/app/*.css`):

| Classe / Declaração | Equivalente (zoom 100%) | Ocorrências | Onde aparece principalmente | Avaliação vs Referência |
|---|---|---|---|---|
| `0.5rem` (`MathLab.module.css:40`) | **8,0 px** | 1 | Células da matriz 13×13 no mobile (`max-width: 760px`) | **Crítico (muito abaixo do legível)** |
| `text-[0.52rem]` / `text-[0.55rem]` | **8,3 px – 8,8 px** | 4 | `RangeMatrix` mobile (`h-5`/`h-6`) e `PokerTable` mobile (badge posição/stack) | **Crítico** |
| `0.5625rem` (`ReplayerView.module.css`) | **9,0 px** | 9 | `.tableNote`, rótulos de assento, `.eventTag`, badges do Replayer | **Muito pequeno (< 11 px)** |
| `text-[0.58rem]` / `text-[0.6rem]` | **9,3 px – 9,6 px** | 7+ | Nome do cientista mobile (`PokerTable`), badges `Study Lab V2`, `Verificados (1)`, `<kbd>` | **Muito pequeno** |
| `text-[0.625rem]` / `0.625rem` | **10,0 px** | 25+ | Sub-rótulos, `eyebrow`, tags `CSV`/`JSON`, stacks `14bb`, células `RangeMatrix` compacta | **Subdimensionado para leitura prolongada** |
| `text-[0.65rem]` / `0.6875rem` | **10,4 px – 11,0 px** | 30+ | Subtítulos de painéis recolhíveis, presets `5m (10)`, fontes de cards, tooltips | **Abaixo de 12 px (metadados recomendados: 12–13 px)** |
| `text-xs` / `0.75rem` | **12,0 px** | **304** | **Textos principais de parágrafo, botões primários/secundários, abas de navegação, filtros, inputs, tabelas** | **Sobrecarregado:** mesmo tamanho é usado para metadados, botões e corpo textual (referência espera `13–15 px` em botões e `14–16 px` no corpo) |
| `text-sm` / `0.875rem` | **14,0 px** | 84 | Títulos de subseções (`SettingsModal`, `MathIcmLab`), opções de quiz, alguns cards | Bom para corpo/controles, pouco utilizado como padrão |
| `text-base` / `1rem` | **16,0 px** | 20 | Títulos de cards (`StatsView`, `RangeExplorer`, `InteractiveDrillsLab`), cartas desktop no Replayer | Adequado para títulos de painéis (`16–18 px`) |
| `text-lg` / `text-xl` | **18,0 px – 20,0 px** | 21 | `h2` (`SiteTour`, `MathIcmLab`, `Erros Fatais`), `PokerTable` pote/cartas | Bom para cabeçalhos secundários |
| `text-2xl` / `text-3xl` / `1.625rem` | **24,0 – 30,0 px** | 8 | KPIs numéricos (`StatsView`), título `Replayer` (`26 px`), `Treiner Limpo` (`h2` usa `text-base sm:text-lg` = `16–18 px`!) | Falta padronização entre títulos `h2` de tela (`14 px` em `StatsView`/`Settings`, `16–18 px` no Trainer, `24–26 px` em `MathLab`/`Replayer`) |

**Achado-chave:** Há **35 escalas tipográficas diferentes** espalhadas entre Tailwind padrão e tamanhos arbitrários `[0.xxxrem]`. Enquanto um título de tela (`<h2>`) em `ReplayerView` mede `26 px` (`1.625rem`), em `StatsView` (`605`) e `TrainerView` (`1405` visto como `"Mesa de Decisão Rápida"`) o `<h2>` mede `16 px` (`text-base`) — **o mesmo tamanho de um botão ou dado num card** — e o `<h1>` global `"TreinerLM"` mede apenas **`14 px`** (`text-sm`, `PokerStudioApp.tsx:446`).

---

## 4. HIERARQUIA TIPOGRÁFICA

1. **Inversão de peso hierárquico no cabeçalho e títulos:** O `<h1>` (`TreinerLM`, `14 px` `font-extrabold`) é menor que badges numéricos de cards (`24 px`), menor que o título do `Replayer` (`26 px`) e do mesmo tamanho que botões de ação.
2. **Saturação de negrito (`font-bold` / `font-extrabold` / `font-black`):** Quase todo botão secundário, pill de filtro, label de assento e cabeçalho de formulário usa `font-bold` (`700`) ou `font-extrabold` (`800`), diluindo o destaque do CTA principal.
3. **Uso excessivo de `UPPERCASE` com microfonte:** Eyebrows, badges e títulos de KPI (`MÃOS PONTUADAS`, `TREINER LIMPO · MEMORIZAÇÃO DE RANGES`, `FILTROS DE ERROS`) usam caixa alta em `10–12 px` (`tracking-wider`/`tracking-[0.26em]`). Em blocos com múltiplos painéis abertos (`StatsView`, `Erros Fatais`), isso cria ruído visual.
4. **Linhas longas e quebras inadequadas:** Em `Currículo & 18 Aulas` e `Erros Fatais`, parágrafos didáticos ocupam `100%` da coluna direita (~`850–950 px` de largura em desktop) com `text-xs`/`text-sm` sem `max-w-prose` (`65ch`), dificultando leitura corrida. Na `RangeMatrix` compacta (`step_26`), `"Bet_33pct"` e `"IMPORTED_CHART_NO_EV (Sem Tabela EV)"` competem em altura com títulos de spot.
5. **Centralização desnecessária vs alinhamento misto:** Em `AiCoachView` a tela inicial centraliza subtítulos em bloco médio; em `StatsView` e `ReplayerView` cartões de KPI misturam alinhamento à esquerda (`StatsView`) com métricas centralizadas (`MathIcmLab` jogadores e `Erros Fatais` topo).

### Escala tipográfica centralizada recomendada
- **`--font-sans`:** `Inter` (auto-hospedada via `next/font/local`) com `font-variant-numeric: tabular-nums` ativo em dados numéricos.
- **`display / h2` (Título de tela):** `22 px` (`1.375rem`), peso `700`, `line-height: 1.25`, `tracking: -0.02em`.
- **`heading / h3` (Título de painel/card):** `16 px` (`1rem`), peso `700`, `line-height: 1.35`, `tracking: -0.01em`.
- **`subheading / label` (Seções internas):** `14 px` (`0.875rem`), peso `600`, `line-height: 1.4`.
- **`body` (Texto corrido e explicações):** `14 px` (`0.875rem`), peso `400/500`, `line-height: 1.55` (`max-w-[68ch]`).
- **`control` (Botões, abas, inputs, filtros):** `13–14 px` (`0.8125–0.875rem`), peso `600` (CTA `700`).
- **`meta / caption` (Metadados e badges — piso mínimo):** `12 px` (`0.75rem`), peso `500/600`, `line-height: 1.4` (**proibir `< 11 px` exceto dentro de células 13×13 no mobile**, onde o piso seguro é `10.5–11 px`).

---

## 5. ESCRITA E NOMENCLATURA — PORTUGUÊS BRASILEIRO

Auditoria de textos visíveis no JSX/TSX de todos os componentes:

### Problemas comprovados na interface
1. **Strings técnicas cruas e `snake_case` expostas ao jogador:**
   - Botões de ação no `Modo Trainer` pós-flop (`TrainerView.tsx:2185`, `step_24`): exibem **`BET 33PCT`**, **`BET 75PCT`** e legendas **`Bet_33pct`**, **`Bet_75pct`** (ou **`Raise_2_1bb`** em demos) em vez de linguagem natural (`Aposta 33%`, `Aposta 75%`, `Raise 2,1 BB`).
   - Tabela dimensional de `StatsView.tsx:159` (`final_step_67.png`): imprime **`amostra_insuficiente (<10)`**, **`amostra_em_formacao`** e **`amostra_solida`** literalmente em `snake_case` sem acentos!
   - `InteractiveDrillsLab.tsx:1351-1352`: quando `villainPosition === null` (spots RFI), renderiza **`Herói: BTN vs `** (vazio/null).
   - Tags de status técnicas usadas como badges principais sem explicação amigável ao usuário comum: **`IMPORTED_CHART_NO_EV`**, **`VERIFIED`**, **`UNSOLVED`**, **`DIDACTIC_DEMO`**, **`MODEL_BASED_EV`**, **`EXACT_ENUMERATION`**, **`PHH_NT_SUBSET_1`**, **`VALIDATED_COMPLETE`**, **`VALIDATED_PARTIAL`** (úteis em tooltip técnico ou linha auxiliar, ruidosas em destaque primário).
2. **Inglês desnecessário e mistura PT/EN:**
   - **`Study Lab V2`** (`PokerStudioApp.tsx:450`), **`Fazer um tour` / `Tour`** (`491-492`), **`AI Poker Coach`** (`366`), **`Play` / `Feedback` / `Preset` / `Seeds` / `Backup SQLite`** (aceitável em contexto técnico, mas `"Backup SQLite"` → `"Cópia de segurança (SQLite)"` ou tooltip claro), **`Range Builder`** (`InteractiveDrillsLab.tsx:352`), **`(card removal)`** (`RangeMatrix.tsx:254` → `"remoção de cartas"`), **`chips`** (`MathIcmLab` usa `"fichas"`, mas usa **`Prize Pool`** `L266`, **`ICM Win / Lose / Fold`** `L271-289`, **`Bubble Factor`**, **`Risk Premium`** sem tradução curta em tooltip), **`unsolved`** (`StatsView.tsx:1098`), **`Timing` / `Overbet` / `Block Bet`**.
3. **Erros de concordância gramatical e pluralização:**
   - `CurriculumView.tsx:415` (`step_43_shot_1`): **`"1 aulas"`** (`2. C-Bet Flop IP vs BB`).
   - `StatsView.tsx:1440` (`final_step_67.png`): **`"0 mão"`** e **`"1 mão(s) registrada(s)"`**, além de **`"1 mãos jogadas"`** (`StatsView.tsx:1160`, `step_45_shot_3`).
   - `StatsView.tsx:1129-1131`: `"1 mãos bbEV"`.
4. **Capitalização, abreviações e truncamento inconsistentes:**
   - `"TreinerLM"` (grafia própria mantida) vs `"Treiner Limpo"` vs `"Treinador GTO"` — mistura `"Treiner"` e `"Treinador"` no mesmo cabeçalho.
   - `"Acertos: —"` no `Treiner Limpo` (`CleanRangeTrainerView`) vs `"Precisão Aceitável"` no `StatsView` vs `"Precisão"` no `Quick Hub`.
   - Abreviações telegráficas: `"0 princ. · 1 mix · 0 desvios"`, `"c/ Transcrição"`, `"p/ detalhes"`, `"p/ fixar"`, `"1000 ch"` (`MathIcmLab:252`).
   - Termo técnico `"Allin 14"` (sem hífen) nos botões vindos de `ranges_gto.json` vs `"All-in"` no `Replayer` e `PokerTable`.

### Glossário recomendado de nomenclatura pt-BR

| Termo atual na UI | Recomendação pt-BR (preservando jargão padrão) | Observação / Tooltip |
|---|---|---|
| `Study Lab V2` | `Estúdio de Estudo Offline` (ou subtítulo `Laboratório Offline`) | Evita inglês desnecessário no logo |
| `BET 33PCT` / `Bet_75pct` | `Bet 33%` / `Bet 75%` (ou `Aposta 33% Pote`) | Formatador na camada de UI sem alterar IDs internos |
| `Raise_2_1bb` / `Allin 14` | `Raise 2,1 BB` / `All-in 14 BB` | Padroniza vírgula/espaço/hífen |
| `amostra_insuficiente (<10)` | `Amostra insuficiente (< 10 mãos)` | Remover `snake_case` da camada visual |
| `amostra_em_formacao` / `amostra_solida` | `Amostra em formação` / `Amostra consistente` | Mapeamento de rótulo em `StatsView.tsx` |
| `IMPORTED_CHART_NO_EV (Sem Tabela EV)` | `Tabela importada · Sem EV` (+ código em tooltip) | Preserva proveniência exata em linguagem humana |
| `VERIFIED` / `UNSOLVED` / `DIDACTIC_DEMO` | `Solução de Solver Verificada` / `Não solucionado` / `Demo didática` | Exibir badge técnico apenas em detalhe expansível |
| `Range Builder` (`InteractiveDrillsLab:352`) | `Construtor de Ranges` | Remove subtítulo em inglês duplicado |
| `card removal` (`RangeMatrix:254`) | `remoção de cartas (blockers)` | Termo natural pt-BR |
| `Prize Pool` (`MathIcmLab:266`) | `Premiação total` | Coerência com `"Premiação"` do campo acima |
| `ICM Win / Lose / Fold` | `ICM Vitória / Derrota / Fold ($EV)` | Clareza para iniciantes |
| `1 aulas` / `0 mão` / `1 mão(s) registrada(s)` | Função `pluralize(n, "aula", "aulas")` / `"mão"` / `"mãos"` | Corrige concordância em 3 telas |

---

## 6. AUDITORIA DAS FORMAS GEOMÉTRICAS

### Botões
- **Inconsistência crítica de alturas e raios:**
  - `AccessibilityControls` e `PokerStudioApp` usam `min-h-9` (`36 px`, `< 44 px` recomendados para toque), `rounded-xl` (`12 px`), enquanto abas usam `min-h-[36px] rounded-lg` (`8 px`).
  - `CleanRangeTrainerView` alterna `min-h-[34px] rounded-lg` (reset), `min-h-[38px] rounded-xl` (filtros/posições) e `min-h-[50px] rounded-xl` (ações principais).
  - `TrainerView` ações usam `py-3 px-4 rounded-xl` (~`64 px` de altura com 2 linhas), `CollapsiblePanel` usa `min-h-[44px] rounded-2xl`, `MathLab` usa `padding: 7px 12px; border-radius: 8px` (~`32 px` altura), `Replayer` usa `border-radius: 8px` / `99px` (play).
- **Ícones e destaque CTA:** Os botões CTA usam gradiente `from-[#DC2626] to-[#2563EB]` em `PokerStudioApp`, `SettingsModal`, `StatsView` (`Colocar mão na revisão`), `CleanRangeTrainerView` (`RFI`), `InteractiveDrillsLab` (`tablist`), **mas** `FATAL_ERRORS`, `CurriculumView` e `InteractiveDrillsLab` (`Treinar Spot Agora`) usam azul sólido `#2563EB` — e **aplicar gradiente vermelho→azul tanto em CTAs de ação quanto em pílulas de filtro ativas (`CleanRangeTrainerView:403`, `RangeExplorerView:90`, aba ativa do header)** reduz a distinção entre *estado selecionado* e *botão de ação principal*.

### Cards
- **Mistura de raios (`rounded-xl` `12 px`, `rounded-2xl` `16 px`, `14 px` em CSS Modules) e superfícies:**
  - Padrão novo: `rounded-2xl bg-[#090D16] border-[#1E293B] p-4` (`StatsView` topo, `RangeExplorer`, `MathIcmLab`).
  - Padrão legado coexistente: `rounded-xl bg-[#191B1D] border-[#292C2F]` (`HandLibraryView`, `StatsView` cards KPIs 1/3/4/5, `InteractiveDrillsLab:280`, `ReplayerView.module.css:56-58`).
  - Padrão `Erros Fatais` topo: `bg-slate-900 border-amber-900/70 p-4 sm:p-6`.

### Modais e Diálogos
Foram inspecionados os **3 mecanismos distintos** existentes no app:
1. **`SettingsModal.tsx` (Configurar AI Studio):**
   - Usa `<div>` fixo com `backdrop-blur-sm` (`fixed inset-0 z-50 ... p-4`), card `w-full max-w-lg rounded-2xl bg-[#090D16]`.
   - **Falhas:** **Não** usa `<dialog>`, não possui `role="dialog"` nem `aria-modal="true"`, **não fecha com tecla `Escape`** (reproduzido ao vivo), não gerencia foco ao abrir/fechar, e não possui `max-h-[90dvh] overflow-y-auto` para telas pequenas com altura reduzida.
2. **Modal `Importar Solver` (`TrainerView.tsx:2770-2916`):**
   - Usa `<div>` fixo `w-full max-w-3xl rounded-2xl bg-[#191B1D] border-[#292C2F]` (tema cinza **legado** inteiro!), também sem `<dialog>`, sem `Escape`, sem `max-h`/`overflow-y-auto`, e com blocos internos `#090B0C` + botão gradiente novo no rodapé.
3. **`SiteTour.tsx` (`<dialog className="site-tour">` em `globals.css:57-69`) e `TrainingViewport.tsx` (`<dialog className="trainer-fullscreen">`):**
   - Ambos usam `<dialog>` nativo com `showModal()`, fecham com `Esc` e restauram foco (`TrainingViewport`) ou travam scroll (`SiteTour` fixa em `inset: auto 1rem 1rem auto`, `width: min(28rem, calc(100% - 2rem))`, `max-height: calc(100dvh - 2rem)`). Excelente padrão — que deveria governar também `SettingsModal` e `Importar Solver`.

### Inputs, Filtros e Seletores
- Mistura de inputs sem largura/altura padronizada: `py-1 px-2` (`28–30 px` no modal `Importar Solver` e `MathIcmLab:276`), `py-1.5 px-2.5` (`32–34 px` no `StatsView` / `MathIcmLab`), `py-2 px-3` (`36 px` no `SettingsModal` / `RangeExplorer`), `p-2` (`FatalErrorsView`), `padding: 7px 9px` (`MathLab.module.css:15`) e `min-h-[38px]` (`CleanRangeTrainerView:452`).
- Em `SettingsModal.tsx:134`, placeholder usa `text-slate-600` (`#475569` em `#05070B`, contraste `2.66:1`, falha WCAG!).
- No `MathLab.tsx:17`, o seletor de cartas abre 52 botões numa grade `13×4` (`s.deck`) com `padding: 5px 0; font-size: 0.75rem`, funcional porém sem agrupamento visual por naipe e com largura pequena para toque no mobile (`~23 px` por botão em `390 px`!).

---

## 7. ESPAÇAMENTO, PROPORÇÃO E ALINHAMENTO

1. **Barra superior (`PokerStudioApp.tsx:423-557`) vs viewport:**
   - **`1440×900` / `1920×1080` (`>= 1280 px`):** Em `1440×900` o `<header>` mede `113 px` (`12,6%` da altura de `900 px`), acomodando as 11 abas em 1 linha (`nav = 1392 px × 46 px`). Entretanto, entre **`768 px` e `1279 px`** (incluindo **`1015×955`** medido nas capturas reais e iPads em paisagem `1024×768`), a classe `xl:flex-wrap` não ativa, `<nav>` fica em `flex-nowrap overflow-x-auto no-scrollbar`, e **a aba `"Explorador de Ranges"` fica literalmente cortada ao meio na borda direita** sem barra de rolagem visível (`step_24.png`, `step_43_shot_1.png`), ocultando as últimas 4 abas!
   - **`768×1024` (Tablet retrato):** O `<header>` sobe para **`157 px`** (+ `~45 px` do banner anti-RTA = `202 px`, `19,7%` da altura).
   - **`390×844` (Mobile):** O `<header>` mede **`156,27 px`** e com a faixa de aviso offline no topo chega a **`~201 px` (`23,8%` dos `844 px`)**. Ao abrir o `Acesso rápido` (`step_51_shot_1` em `390×844`), topo + Quick Hub + filtro do `Treiner Limpo` empurram toda a mesa de poker para fora da dobra inicial!
2. **Proporção e tabelas em `390×844`:**
   - Embora a página (`body`/`documentElement`) não gere overflow horizontal graças a `overflow-x: clip` e containers `overflow-x-auto`, tabelas com `white-space: nowrap` ou muitas colunas em **`Diagnóstico & Leaks`** (`931 px` tabela de revisão, `933 px` heatmap de 7 colunas no `StatsView`) e **`Explorador de Ranges`** (grade `13×13` ou painel comparador) forçam rolagem horizontal dentro dos cards em `390×844`. No `Explorador de Ranges` (`RangeExplorerView`), a grade `13×13` com `minmax(0, 1fr)` espreme cada célula em ~`24 px` de largura no mobile (sem rolagem, porém minúscula) ou amplia conforme conteúdo em outros containers.
3. **Densidade desequilibrada entre telas:** `Treiner Limpo` e `Modo Trainer` têm excelente recolhimento progressivo via `CollapsiblePanel`, enquanto `StatsView` (`1.471` linhas no componente) e `Currículo` empilham múltiplos cards altos exigindo rolagem longa para atingir ações secundárias.

### Escala de espaçamento unificada recomendada (`4 / 8 / 12 / 16 / 24 / 32 px`)
- `4 px` (`gap-1` / `p-1`): entre células de matriz, ícones e rótulos internos compactos.
- `8 px` (`gap-2` / `p-2`): entre botões de toolbar, tags, chips de filtro e campos adjacentes.
- `12 px` (`gap-3` / `p-3`): espaçamento interno de subcards, tabelas compactas e grupos de formulário.
- `16 px` (`gap-4` / `p-4`): padding padrão de cards/painéis em mobile/desktop (`p-4`), gap entre colunas da mesa e sidebars.
- `24 px` (`gap-6` / `p-6`): separação entre seções verticais de uma tela e padding de modais em desktop.
- `32 px` (`gap-8` / `p-8`): apenas respiro de topo/rodapé ou destaque de estados vazios.

---

## 8. AUDITORIA DAS CORES E CONTRASTE

### Medições WCAG 2.1 calculadas (luminância relativa exata)

| Par de cores analisado (Texto sobre Fundo) | Razão WCAG | Critério Normal (≥ 4.5:1) | Onde ocorre |
|---|---|---|---|
| `#F8FAFC` sobre `#05070B` (fundo principal) | **19,27 : 1** | **PASSA AAA** | Textos principais em fundo base |
| `#F8FAFC` sobre `#090D16` (cards/topbar) | **18,57 : 1** | **PASSA AAA** | Cabeçalhos e painéis novos |
| `#94A3B8` sobre `#05070B` / `#090D16` / `#131B2C` | **7,86 / 7,58 / 6,71 : 1** | **PASSA AA/AAA** | Textos secundários no tema novo |
| `#FFFFFF` sobre `#2563EB` / `#1D4ED8` / `#DC2626` | **5,17 / 6,70 / 4,83 : 1** | **PASSA AA** | Botões CTA azul e vermelho |
| `#FCA5A5` sobre `#2B0B11` | **9,55 : 1** | **PASSA AAA** | Badges/alertas de erro e risco |
| `#64748B` (`slate-500`) sobre `#090D16` / `#0F172A` | **4,08 : 1 / 3,75 : 1** | **FALHA AA normal** | Placeholders (`RangeExplorerView`), sub-rótulos de fórmulas (`MathIcmLab:155,164,173,183`), ícones/timings |
| `#6A7075` sobre `#191B1D` | **3,44 : 1** | **FALHA AA normal** | Metadados legados |
| `#475569` (`slate-600`) sobre `#05070B` | **2,66 : 1** | **FALHA AA** | Placeholder `AIzaSy...` (`SettingsModal:134`) |
| `#FFFFFF` sobre **`#3FA65B`** (`Check/Call/Limp`) | **3,08 : 1** | **FALHA AA texto normal** | Botão `CHECK` no `Modo Trainer` (`TrainerView.tsx:167`, subtexto `10.4 px`) |
| `#FFFFFF` sobre **`#F43F5E`** (`Raise / 3-Bet`) | **3,67 : 1** | **FALHA AA texto normal** | Células da `RangeMatrix` (`10–12 px` e `8.32 px` no mobile!) |
| `#FFFFFF` sobre **`#3B82F6`** (`Fold`) | **3,68 : 1** | **FALHA AA texto normal** | Células azuis da `RangeMatrix` |
| `#FFFFFF` sobre **`#22C55E`** (`Call / Check`) | **2,28 : 1** | **FALHA AA** | Células verdes da `RangeMatrix` (dependem de `drop-shadow` para leitura) |
| `#FFFFFF` sobre **`#EAB308`** (`Limp`) | **1,92 : 1** | **FALHA AA grave** | Células amarelas de `Limp` na `RangeMatrix` (`extract_ranges.py:316`) |

### Dois problemas de Design System nas cores
1. **Conflito semântico de ações entre módulos:**
   - No `Modo Trainer` (`getActionWizardColors`) e na `RangeMatrix`: **Fold = Azul** (`#387894` / `#3B82F6`), **Check/Call = Verde** (`#3FA65B` / `#22C55E`), **Bet/Raise = Coral/Vermelho** (`#C84343` / `#F43F5E` / `#DC2626`), **All-in = Vinho** (`#802222` / `#991B1B`).
   - Nos botões do **`Treiner Limpo`** (`CleanRangeTrainerView.tsx:82-91`): **Fold = Preto/Azul-marinho (`#090D16`)**, **Check/Call = Azul (`#1D4ED8`)**, **Raise/All-in = Vermelho (`#DC2626`)**.  
   Um aluno que treina `Treiner Limpo` com a `Matriz 13×13` aberta vê **botão azul para Call** exatamente acima de **células azuis para Fold**!
2. **Tokens enganosos e sobras visuais:** `globals.css:15-16` mantém `--gto-accent-green: #60a5fa` e `--gto-selection-green: #2563eb`, e `tailwind.config.ts:12-17` mantém apenas a paleta `felt` verde antiga (`#081c15..#184e3b`) sem uso alinhado ao tema atual `#0B1B36`. Além disso, `StatsView`, `HandLibraryView`, `InteractiveDrillsLab`, `TrainerView` e `ReplayerView.module.css` preservam blocos `#191B1D`/`#292C2F`/`#090B0C`.
3. **Dependência exclusiva de cor em estados e matriz:** Em `RangeMatrix`, as células diferenciam ações exclusivamente por faixa de gradiente de cor; adicionar ícone/atalho de letra nos botões (`F`, `C`, `R`, `A`) e tooltip explícito + contraste escurecido nos fundos das células garante acessibilidade para daltônicos.

---

## 9. MESA DE POKER E RANGE EXPLORER

### Mesa de Poker (`PokerTable.tsx` vs `ReplayerView`)
Existem **duas implementações distintas de mesa** no aplicativo:
- **`PokerTable.tsx` (`Modo Trainer` e `Treiner Limpo`):**
  - Proporção fixa responsiva: `aspect-[4/3]` (`min-h-[295px]`) no mobile e `16/9` (`min-h-[420px] max-h-[510px]`) em `lg:`. No desktop (`1440×900`), medidas reais confirmadas: `.poker-table-stage` **`900 × 450 px`**; no mobile (`390×844`): **`358 × 288 px`**.
  - **Cartas (`StyledCard`):** Mobile `lg` = `36×48 px` (`sm:` `52×69.6 px`); board `md` = `32×44 px` (`sm:` `48×64 px`) com 4 paletas (`four-color`, `classic-two`, `dark-gold`, `high-contrast`). Excelente clareza e legibilidade de naipes nos cards do centro.
  - **Assentos 8-Max (`SEAT_COORDS`):** No mobile (`390×844`), todos os assentos cabem dentro da caixa `358×288` (`x: 25.4 px` a `363.2 px` observado pelo browser), porém as pílulas ficam bastante compactas (`fontSize` nome `~9.3 px` em código / ~`52–65 px` largura) e **exibem `"fold"` erroneamente nos jogadores posteriores em aberturas `UTG`/`MP`**, criando confusão visual na leitura da mesa (`step_24`, `step_47_shot_1`, `step_51`). Além disso, no `Treiner Limpo`, `anteLabel` recebe `${currentSpot.stackBb} BB`, exibindo `"Memorização · 14 BB"` em vez do ante real.
- **`ReplayerView.tsx` + `ReplayerView.module.css`:**
  - Geometria e estilo próprios (mesa `#17191B → #101112` no desktop e `#0B1B36` **só** no `@media` mobile! `border-radius: 5px` nas cartas vs `8px` de `PokerTable`, chip cards distintos e fontes de `0.5625rem = 9 px`). Deveria compartilhar tokens visuais comuns de cartas/feltro/pote com `PokerTable`.

### Range Explorer (`RangeExplorerView.tsx` + `RangeMatrix.tsx`)
- **Células 13×13:**
  - Código: `compact ? "h-5 sm:h-6 text-[0.52rem] sm:text-[0.625rem]" : "h-6 sm:h-9 text-[0.55rem] sm:text-xs"`.
  - No desktop (`1015–1440 px`), células são largas (`~46–69 px` largura × `24–36 px` altura), confortáveis para leitura; porém no mobile (`390×844`), 13 colunas comprimem cada célula a ~`24–27 px` de largura com fonte **`8,32–8,8 px`** e **`hover` (`onMouseEnter`) inoperante em toque** (obrigando toque direto que dispara seleção quando há handler `onSelectHand`).
- **Cores e contraste nas células:** Como provado na Seção 8, células `Limp` (`#EAB308`), `Call` (`#22C55E`), `Raise` (`#F43F5E`) e `Fold` (`#3B82F6`) com texto `#FFFFFF` não atingem WCAG AA `4,5:1`, agravado em barras divididas por múltiplos stops de gradiente.
- **Bug visual de estado inicial (`RangeExplorerView.tsx:33-56`):** O botão de stack **`100 BB`** abre selecionado em destaque vermelho→azul enquanto o dropdown, o título e a matriz exibem **`14BB - RFI UTG`**, induzindo erro visual imediato de leitura.

---

## 10. AUDITORIA POR MÓDULO (12 MÓDULOS)

| # | Módulo | Fontes e Tamanhos Predominantes | Problemas Tipográficos, Formas, Alinhamento e Contraste | Recomendações Principais |
|---|---|---|---|---|
| 1 | **Dashboard / Header Global** (`PokerStudioApp.tsx`) | `Inter`→`Segoe UI`; `h1` `14px`, abas `12px`, badges `9.6px`, aviso `11px` | `h1` menor que títulos internos; 11 abas cortam à direita entre `768–1279 px` sem scrollbar visível; header + banner consomem `~23,8%` em `390×844`; termo `Study Lab V2` | Aumentar `h1` para `18–20 px`; agrupar 11 abas em 5–6 seções; compactar header mobile; trocar `Study Lab V2` por rótulo pt-BR |
| 2 | **Modo Trainer** (`TrainerView.tsx`) | `Segoe UI` + `font-mono`; `h2` `16–18px`, ações `14–16px`, sidebar `10–12px` | `BET 33PCT`/`BET 75PCT` crus; `#3FA65B` no `CHECK` (`3.08:1` WCAG); `#191B1D` nos botões desabilitados pós-ação e no modal `Importar Solver`; sub-rótulo `0.58rem` (`9.3px`) | Formatar nomes de ação; escurecer verde do botão `Call/Check`; unificar tema do modal Solver e convertê-lo para `<dialog>` |
| 3 | **Range Explorer** (`RangeExplorerView.tsx`, `RangeMatrix.tsx`) | `Segoe UI` + `font-mono`; título `16px`, legenda `12px`, células `8.8–12px` | Botão `100 BB` destacado com matriz `14BB` aberta; células `Limp`/`Call`/`Raise`/`Fold` falham WCAG AA; `compareMode` usa `bg-slate-900` diferente do card principal `#090D16` | Alinhar stack inicial; escurecer tons das células ou ajustar cor/outline do texto; exibir tooltip clicável no mobile |
| 4 | **Biblioteca de Mãos** (`HandLibraryView.tsx`) | `Segoe UI` + `font-mono`; `h2` `20–24px`, KPIs `18px`, corpo/lista `12px` | **Quase todo o módulo usa tema cinza legado** (`#191B1D`, `#292C2F`, `#090B0C`, `#A1A6AA`); exibe `VALIDATED_COMPLETE` / `PHH_NT_SUBSET_1` crus | Migrar superfície `#191B1D`→`#090D16` e `#292C2F`→`#1E293B` via tokens; traduzir badges técnicos |
| 5 | **Replayer** (`ReplayerView.tsx` + `.module.css`) | `Segoe UI` + `font-mono`; `h2` `26px`, mesa `9–21px`, eventos `11–13px` | CSS Module isolado com 9 ocorrências de `9px` (`0.5625rem`), fundo mesa `#101112` no desktop vs `#0B1B36` no mobile, controles `#191B1D`, botão `"Marcar"` estilizado inline (`style={{...}}`) | Unificar palette da mesa e CSS Module com `--gto-bg-*`; elevar fonte mínima para `11–12 px` |
| 6 | **Laboratório Matemático** (`MathLab.tsx` + `.module.css`) | `Segoe UI` + `font-mono`/`monospace`; `h2` `24px`, matrix `10px` (`8px` mobile) | `.matrix button` cai para **`8 px` (`0.5rem`)** em `max-width: 760px`; `.deck` de 52 cartas aperta no mobile; `<textarea>` usa `monospace` sem pilha completa | Aumentar fonte da grade 13×13 mobile (ou rolagem/zoom suave); padronizar inputs/botões (`min-h: 36–40px`) |
| 7 | **Laboratório EV / ICM** (`MathIcmLab.tsx`) | `Segoe UI` + `font-mono`; `h2` `18px`, `h3` `14px`, KPIs `18px`, fórmulas `10px` | Textos em inglês (`Prize Pool`, `ICM Win/Lose/Fold`, `Bubble Factor`); fórmulas em `text-[0.625rem] text-slate-500` (`4.08:1`, falha AA pequeno); inputs sem `min-h` uniforme (`px-2 py-1` vs `px-3 py-1.5`) | Padronizar inputs `h-9/h-10`; subir cor das fórmulas de `slate-500` para `#94A3B8` (`7.58:1`); traduzir rótulos financeiros |
| 8 | **Currículo RegLife** (`CurriculumView.tsx`) | `Segoe UI` + `font-mono`; `h2` `18px`, abas `12px`, texto `12–14px` | Texto `"1 aulas"` (`Spot 2`); linhas didáticas longas sem `max-w-prose`; excesso de bordas empilhadas no painel de aula | Corrigir pluralização; aplicar `max-w-3xl leading-relaxed` em blocos de leitura e espaçamento consistente |
| 9 | **Erros Fatais** (`FatalErrorsView.tsx`, `Quiz`, `Calculator`) | `Segoe UI` + `font-mono`; `h2` `20px`, título cartão `18px`, corpo `12–14px` | Card topo em `bg-slate-900 border-amber-900/70` destoa do tema `#090D16`; badge técnico `EDUCATIONAL_HEURISTIC · UNSOLVED` em vermelho texto corrido (`L142`) | Alinhar fundo aos tokens `#090D16`; transformar linha de metadados em tags estruturadas discretas |
| 10 | **Estatísticas (`Diagnóstico & Leaks`)** (`StatsView.tsx`) | `Segoe UI` + `font-mono`; `h2` `16px`, KPIs `20–24px`, tabelas `12px` | Mistura 4 KPIs `#191B1D` com 1 card `#090D16`; exibe `amostra_insuficiente (<10)`, `"0 mão"`, `"1 mão(s)"`, `"1 mãos jogadas"`; tabelas `931–933px` transbordam container no `390×844` | Migrar todos os `#191B1D`/`#292C2F` para tokens novos; formatar rótulos `amostra_*`; corrigir pluralização; resumir tabela no mobile em cards empilhados |
| 11 | **Configurações e Modais** (`SettingsModal.tsx`, `SiteTour.tsx`) | `Segoe UI` + `font-mono`; títulos `14px`/`18px`, campos `12–14px` | `SettingsModal` usa `<div>` sem `role="dialog"`, sem `Escape`, sem `max-h` scroll, placeholder `slate-600` (`2.66:1`). `SiteTour` usa `<dialog>` correto (mas no mobile `inset: auto 1rem 1rem auto` merece centralização limpa) | Migrar `SettingsModal` e `Importar Solver` para `<dialog>` acessível; corrigir cor do placeholder (`#64748B`→`#94A3B8`) |
| 12 | **Novas telas (`Treiner Limpo`, `Treinos Interativos`, `AI Coach`)** | `Segoe UI` + `font-mono`; `h2` `16–18px`, botões `12–14px` | **Treiner Limpo:** Botões azul=Call / preto=Fold conflitam com matriz; pílulas usam gradiente idêntico ao CTA; **Treinos Interativos:** barra de submodos `#191B1D` legado, `"vs null"`, `Treino Prático A · Range Builder`; **AI Coach:** lista 3 livros errados no texto | Alinhar paleta de ações `Fold/Call/Raise` entre `Treiner Limpo`, `Modo Trainer` e `RangeMatrix`; atualizar barra `tablist` para `#090D16`; corrigir texto RAG |

---

## 11. SCREENSHOTS E EVIDÊNCIAS (DIFERENCIAÇÃO METODOLÓGICA)

Para rigor absoluto na auditoria, as medições distinguem **origem do código**, **observação direta nos arquivos PNG verificados** e **telemetria relatada pelo subagente de navegador**:

1. **Verificações de Código e Build (100% determinísticas em disco):**
   - `app/src/app/layout.tsx`, `app/src/app/globals.css`, `app/.next/static/css/0fd44454ca3ce20d.css` (`63.978 B`, confirma ausência de `@font-face` / `next/font`, presença de `Inter, ui-sans-serif...`, `monospace` no `d0139285a74be41b.css`).
   - `audit_styles.py` (censo completo de `app/src/`: `289` usos `text-xs`, `259` `#1E293B`, `109+` hexes legados `#191B1D`/`#292C2F`/`#A1A6AA` concentrados em `StatsView`, `HandLibraryView`, `TrainerView`, `ReplayerView.module.css`, `InteractiveDrillsLab`).
   - `wcag_contrast.py` (cálculo exato das razões WCAG 2.1 citadas na Seção 8).
2. **Screenshots diretamente inspecionados (caminhos reais das sessões de navegador em `127.0.0.1:3199`):**
   - **Desktop `1015×955` (dimensão PNG real confirmada via cabeçalho PNG IHDR nas sessões):**
     - `918eb654.../step_4.png` (`Modo Trainer` pós-decisão com `BET 33PCT` / `BET 75PCT` e `CHECK 0%`)
     - `918eb654.../step_24.png` (`Treiner Limpo` mostrando recorte direito `"Explorador de Rang"` na barra `<nav>`, mesa `UTG RFI` com todos os assentos exibindo `fold`)
     - `918eb654.../step_28.png` (`Replayer` cabeçalho/rodapé), `step_32.png` (`Replayer` mão `three_way_allin` com `★ Marcada para revisão`)
     - `918eb654.../step_41.png` (`Laboratório Matemático` cálculo `AsAh vs KsKh` turn `95.45%`)
     - `918eb654.../step_43_shot_1..3` (`Currículo` com `"1 aulas"`, `Erros Fatais`, `Explorador de Ranges` com `100 BB` iluminado exibindo `14BB`)
     - `918eb654.../step_45_shot_1..3` (`Lab EV & ICM`, `AI Coach` citando 3 livros ausentes, `Diagnóstico & Leaks` com `"BTN (100%)"`)
     - `cb4e19b0.../step_24_shot_1` (botões `CHECK`/`BET 33PCT`/`BET 75PCT` e `Modo de Estudo`), `step_26_shot_1` (`MATRIZ 13×13 - BTN` expandida), `step_30_shot_1` (`Opções de Memorização & Aparência`), `step_57_shot_1` (`SettingsModal` completo), `final_step_67.png` (`1024×576`, `StatsView` mostrando `amostra_insuficiente (<10)`, `"0 mão"`, heatmap todo `—`).
   - **Tablet `768×1024` (dimensão PNG verificada):**
     - `918eb654.../step_47_shot_1_tablet_768_treiner_limpo.png` e `step_47_shot_2_tablet_768_modo_trainer.png` (`0 px` overflow horizontal na página; header `157 px`).
   - **Mobile `390×844` (dimensão PNG verificada):**
     - `918eb654.../step_49_shot_1..5` (`Treiner Limpo`, `Modo Trainer`, `Explorador de Ranges`, `Replayer`, `Biblioteca de Mãos`) e `cb4e19b0.../step_51_shot_1` (`Treiner Limpo` com Quick Hub empurrando a mesa totalmente abaixo da dobra).
3. **Divergência corrigida da telemetria automatizada do subagente (`cb4e19b0`):**
   - O subagente relatou overflow de `SettingsModal` (`width: 510px`) e `SiteTour` (`left: 543px`) atribuindo ao viewport `390×844`, mas a inspeção direta das dimensões dos arquivos PNG (`step_57_shot_1...` e `step_59_shot_1...`) provou que esses screenshots foram capturados em `1015×955` (não em `390×844`), e a leitura direta de `SettingsModal.tsx:95` (`w-full max-w-lg`) e `globals.css:61` (`width: min(28rem, calc(100% - 2rem))`) confirma que ambos respeitam `390px` horizontalmente (o problema real de `SettingsModal` é falta de `<dialog>`, `Escape` e `max-h` vertical para alturas curtas). Da mesma forma, o subagente listou `scrollWidth` em tabelas de `StatsView` (`931/933 px`), o que é coerente com `overflow-x-auto` ao redor da tabela e não gera overflow de página (`body`), mas obriga rolagem horizontal interna no celular.

---

## 12. DESIGN SYSTEM RECOMENDADO (ATUAL VS PROPOSTO)

| Dimensão | Sistema Atual (Fragmentado) | Sistema Proposto (Consolidado) | Justificativa |
|---|---|---|---|
| **Fonte UI Principal** | `Inter` não carregada → `Segoe UI` (Windows) | **`Inter` auto-hospedada (`next/font/local`)** c/ `tabular-nums` | Consistência multiplataforma, zero rede externa, alinhamento numérico tabular perfeito |
| **Fonte Numérica / Cartas** | `font-mono` Tailwind vs `monospace` nu (`MathLab.module.css`) | **`--font-mono` única** (`JetBrains Mono` local ou stack Tailwind com `tabular-nums`) | Padroniza cartas, stacks, matriz e `<textarea>` de ranges |
| **Tokens CSS Semânticos** | `--gto-accent-green: #60a5fa` (nome verde, hex azul!) + 31 hexes soltos + legado `#191B1D` | Renomear para `--color-brand-primary: #2563EB`, `--color-brand-danger: #DC2626`, `--color-surface-base: #05070B`, `--color-surface-card: #090D16`, `--color-surface-elevated: #111827`, `--color-border-subtle: #1E293B` | Elimina #191B1D/#292C2F por tokenização única e remove dívida de nomes |
| **Cores das Ações de Poker (ÚNICA em todo app)** | Conflito: `Call` = verde (`Trainer`) / azul (`Treiner Limpo`); `Fold` = azul (`Trainer`/`Matrix`) / preto (`Treiner Limpo`); contrastes `1.92–3.68:1` na matriz | **`Fold`: `#1E3A5F` (azul-marinho texto `#E2E8F0`, `>=9:1`)** · **`Check/Call`: `#15803D` (verde AA `>=5.1:1`)** · **`Bet/Raise`: `#B91C1C` (vermelho AA `>=6.4:1`)** · **`All-in`: `#7F1D1D` (`>=10:1`)** · **`Limp`: `#A16207` (`>=4.9:1`)** | Unifica botões do `Treiner Limpo`, `Modo Trainer` e legenda da `RangeMatrix` com contraste WCAG AA real (`>= 4.5:1`), acrescentando prefixo/ícone de letra (`F/C/R/A`) |
| **Escala Tipográfica** | 35 tamanhos (`8 px` a `30 px`), 289× `12 px` para tudo | 6 degraus rígidos (`12 / 13 / 14 / 16 / 20 / 24 px`; exceção `10.5–11 px` só na matriz mobile 13×13) | Garante leitura em estudo longo e hierarquia clara entre título, ação e metadado |
| **Botões e Controles** | Alturas `28–64 px`, raios `3px..99px` | **3 tamanhos:** `sm (32 px)` inline, `md (38–40 px)` formulários/filtros, `lg (48 px)` decisões na mesa; **2 raios:** `8 px` controles / `12–16 px` cards/modais; CTA único gradiente só na ação primária da tela | Traz coesão visual imediata estilo estúdio profissional |
| **Modais** | Misto de `<dialog>` (`SiteTour`) e `<div>` sem `Esc` (`SettingsModal`, `Importar Solver`) | Padrão único `<dialog>` nativo acessível com `Esc`, `max-h-[88dvh] overflow-y-auto`, largura `w-[min(100%-2rem,520px)]` | Garante acessibilidade por teclado, foco e segurança em mobile |

---

## 13. PROBLEMAS PRIORIZADOS (`P1 / P2 / P3`)

*(Classificação conforme critérios visuais solicitados: **P1** legibilidade/contraste/interface prejudicada; **P2** inconsistência visual relevante; **P3** acabamento estético.)*

| ID | Prioridade | Tela / Módulo | Componente | Situação Atual | Situação Recomendada | Motivo | Evidência | Custo | Risco |
|---|---|---|---|---|---|---|---|---|---|
| **VIS-01** | **P1** | `RangeExplorer`, `Treiner Limpo`, `Modo Trainer` | `RangeMatrix.tsx`, `extract_ranges.py` | Texto branco em `Limp #EAB308` (`1.92:1`), `Call #22C55E` (`2.28:1`), `Raise #F43F5E` (`3.67:1`) e `Fold #3B82F6` (`3.68:1`) + fonte `8.3–8.8 px` no mobile | Escurecer tons das ações na matriz (ou usar texto escuro `#05070B` em `Limp`/`Call` claro e `#FFF` em `Fold`/`Raise` profundos) e piso `>= 10.5 px` / tooltip por toque | Falha grave WCAG AA em células de leitura principal | `wcag_contrast.py`, `RangeMatrix.tsx:138` | Baixo | Baixo |
| **VIS-02** | **P1** | `Modo Trainer` vs `Treiner Limpo` | `TrainerView.tsx`, `CleanRangeTrainerView.tsx`, `RangeMatrix.tsx` | Azul = `Call` no `Treiner Limpo`, Azul = `Fold` no `Modo Trainer` e na `RangeMatrix`; botão `CHECK` (`#3FA65B`) falha AA (`3.08:1`) | Alinhar tabela única de cores para ações (`Fold`, `Check/Call`, `Bet/Raise`, `All-in`) com WCAG AA (`>= 4.5:1`) e sigla acessória | Evita erro de condicionamento visual e atende WCAG | `CleanRangeTrainerView.tsx:82-91`, `TrainerView.tsx:157-184` | Baixo | Baixo |
| **VIS-03** | **P1** | Global (Header / Navbar) | `PokerStudioApp.tsx` | 11 abas cortam à direita entre `768–1279 px` sem barra visível; header + faixa ocupam ~`23,8%` do `390×844` | Agrupar em 5–6 domínios primários com sub-abas contextuais ou menu compacto mobile; permitir recolher aviso offline após 1ª confirmação | Recupera visibilidade total de navegação e área útil da mesa | `step_24.png`, `step_49_shot_1`, `PokerStudioApp.tsx:423-557` | Médio | Médio |
| **VIS-04** | **P1** | Todas as telas (`Settings`, `MathLab`, `Replayer`, `PokerTable`) | `MathLab.module.css`, `ReplayerView.module.css`, `PokerTable.tsx`, `SettingsModal.tsx` | Mais de `60` declarações `< 12 px` chegando a **`8 px`** (`MathLab`), `9 px` (`Replayer`), `9.3 px` (`PokerTable`) e placeholder `slate-600` (`2.66:1`) | Elevar escala base e metadados para piso `12 px` (`>= 10.5 px` apenas em grade 13×13 mobile) e placeholder `#94A3B8`/`#64748B` ajustado | Melhora drasticamente conforto em sessões longas e WCAG | `audit_styles.py`, `wcag_contrast.py`, `MathLab.module.css:40` | Baixo | Baixo |
| **VIS-05** | **P1** | Modais (`Configurações`, `Importar Solver`) | `SettingsModal.tsx`, `TrainerView.tsx` | `<div>` fixo sem `role="dialog"`, sem fechamento por `Esc` e sem `max-h` scroll interno | Converter ambos para `<dialog>` nativo seguindo o padrão de `SiteTour.tsx` | Acessibilidade de teclado, leitor de tela e prevenção de corte vertical | `SettingsModal.tsx:94-233`, `TrainerView.tsx:2770-2915` | Baixo | Baixo |
| **VIS-06** | **P1** | `Explorador de Ranges` | `RangeExplorerView.tsx` | Pill `100 BB` iluminado enquanto exibe `14BB - RFI UTG` | Sincronizar estado inicial `primarySpotId` com `selectedStack` | Elimina contradição visual imediata de leitura | `step_43_shot_3`, `RangeExplorerView.tsx:33-56` | Baixo | Baixo |
| **VIS-07** | **P1** | `Diagnóstico & Leaks` | `StatsView.tsx` | Declara `"MAIOR LEAK: BTN (100%)"` com 0 erros; tabelas `931/933 px` exigem scroll horizontal extenso no mobile | Exibir `"Nenhum leak"` quando `pct === 100`; converter tabela de revisão para lista de cards em `< 640 px` | Evita falso diagnóstico visual e melhora uso mobile | `step_45_shot_3`, `final_step_67.png`, `StatsView.tsx` | Médio | Baixo |
| **VIS-08** | **P2** | `StatsView`, `HandLibrary`, `InteractiveDrillsLab`, `Replayer`, `TrainerView` | CSS inline / `ReplayerView.module.css` | Mistura `#191B1D`/`#292C2F`/`#090B0C`/`#A1A6AA` (109+ refs em 6 arquivos) com o tema novo `#090D16`/`#1E293B` | Substituir valores hex legados pelos tokens `--gto-*` em `globals.css` / Tailwind | Restaura coesão de sistema entre todas as abas | `audit_styles.py`, `StatsView.tsx:1089-1155` | Baixo | Baixo |
| **VIS-09** | **P2** | Tipografia Global | `layout.tsx`, `globals.css` | Declara `Inter` sem carregá-la (`document.fonts.check("16px Inter") === false`), caindo em `Segoe UI`; `--gto-accent-green` é azul | Empacotar `Inter` localmente (`next/font/local` / `@fontsource-variable/inter`) e renomear variáveis CSS enganosas | Estabiliza largura de abas/células entre OSs com `tabular-nums` | `layout.tsx`, `globals.css:15-35` | Baixo | Baixo |
| **VIS-10** | **P2** | `Modo Trainer`, `StatsView`, `Currículo`, `Drills`, `MathIcmLab` | `TrainerView.tsx`, `StatsView.tsx`, `CurriculumView.tsx`, `InteractiveDrillsLab.tsx` | Rótulos crus `BET 33PCT`, `amostra_insuficiente`, `"1 aulas"`, `"0 mão"`, `"Herói: BTN vs "`, inglês residual (`Prize Pool`, `Range Builder`, `Study Lab V2`) | Criar formatador pt-BR compartilhado e função `pluralize` | Profissionaliza linguagem para jogadores brasileiros | `audit_copy_and_css.py`, `step_24_shot_1`, `final_step_67.png` | Baixo | Baixo |
| **VIS-11** | **P2** | `Treiner Limpo` / `Modo Trainer` | `PokerTable.tsx` | Assentos não atuantes após Herói exibem `"fold"`; `Treiner Limpo` mostra `stackBb` em `anteLabel`; `Replayer` usa mesa separada | Exibir `"fold"` apenas para quem já desistiu antes do Herói; corrigir `anteLabel`; alinhar cores/cartas entre `PokerTable` e `Replayer` | Coerência visual de poker real | `PokerTable.tsx:477`, `step_30_shot_1` | Médio | Baixo |
| **VIS-12** | **P3** | `Treiner Limpo` / `Dashboard` / `Windows` | `CleanRangeTrainerView.tsx`, `launcher.pyw`, `Prepare-GTOTrainer.ps1` | Gradiente vermelho-azul usado em filtros selecionados compete com CTAs; iniciador Windows ainda verde `"♠ GTO Trainer"`; `<h1>` pequeno (`14px`) | Reservar gradiente apenas para CTAs principais (filtros selecionados em azul sólido/borda); alinhar título/ícone Windows para `TreinerLM` | Acabamento estético e hierarquia visual refinada | `CleanRangeTrainerView.tsx:403`, `launcher.pyw:26-30` | Baixo | Baixo |

---

## 14. MELHORIAS RÁPIDAS (GANHO GLOBAL VIA TOKENS E CAMADAS LEVES)

Sem refatorar dezenas de componentes isoladamente, **5 ajustes cirúrgicos geram ganho imediato em quase todo o aplicativo**:
1. **Empacotamento offline de fonte em `app/src/app/layout.tsx` + tokens reais em `app/src/app/globals.css`:** carregar `Inter` local (`@fontsource-variable/inter` ou arquivo `.woff2` em `app/src/app/fonts/` via `next/font/local`), ativar `font-variant-numeric: tabular-nums`, corrigir nomes dos CSS custom properties (`--gto-accent-green` → `--color-accent-primary`) e padronizar `font-size` base dos seletores globais (`select`, `input`, `button`).
2. **Passada única de substituição de tokens legados:** substituir `#191B1D → var(--color-surface-card)` (`#090D16`), `#292C2F → var(--color-border-subtle)` (`#1E293B`), `#090B0C → var(--color-surface-base)` (`#05070B`) e `#A1A6AA → var(--color-text-secondary)` (`#94A3B8`) nos 6 arquivos remanescentes (`StatsView`, `HandLibraryView`, `TrainerView`, `InteractiveDrillsLab`, `ReplayerView.module.css`, `PokerTable`) harmonizando instantaneamente todas as 11 telas.
3. **Ajuste de paleta com contraste AA em `RangeMatrix.tsx`, `extract_ranges.py` e `TrainerView.tsx`:** ajustar os hexes das ações de poker e remover `#3FA65B` (`3.08:1`) e `#EAB308` c/ branco (`1.92:1`).
4. **Dicionário único de formatação de rótulos em `app/src/lib/poker/` (`formatActionLabelPtBr`, `formatSampleQualityPtBr`, `pluralPtBr`):** elimina `BET 33PCT`, `amostra_insuficiente`, `"1 aulas"`, `"0 mão"` e `"Herói: BTN vs "` sem reescrever fluxos de treino.
5. **Envolver `SettingsModal` e `Importar Solver` em componente `<ModalDialog>` único com `<dialog>`:** resolve acessibilidade, `Esc`, `max-h` mobile e estilo unificado em 1 só componente.

---

## 15. REFINAMENTOS MAIS PROFUNDOS (ESTRATÉGICOS)

1. **Consolidação da barra de navegação (`11` abas → `5–6` áreas primárias com sub-navegação):** Agrupar `Treiner Limpo`, `Modo Trainer` e `Treinos Interativos` sob **Treinar**; `Currículo`, `Erros Fatais` e `AI Coach` sob **Estudar**; `Lab EV & ICM` e `Laboratório Matemático` sob **Laboratórios** — eliminando o corte horizontal de abas entre `768–1279 px` e reduzindo a altura do cabeçalho no mobile de ~`201 px` (`23,8%`) para <`110 px`.
2. **Unificação da camada visual `PokerTable` ↔ `ReplayerView`:** Reaproveitar `StyledCard` e tokens de feltro/pote entre a mesa de treino e o Replayer (preservando os rótulos auditáveis específicos de átomos do Replayer).
3. **Cards responsivos para tabelas densas em `< 640 px`:** Transformar a lista de revisão e o heatmap do `StatsView` em cartões empilháveis no celular para acabar com a rolagem horizontal de tabelas de `931–933 px`.
4. **Limitação de largura de leitura (`max-w-[68ch]`) em módulos didáticos:** Tornar `Currículo` e `Erros Fatais` substancialmente mais confortáveis em telas ultrawide (`1920 px`).

---

## 16. RISCOS DE ALTERAÇÃO

1. **Risco em testes existentes (`cleanRangeTrainer.test.ts`, `fatalErrorsNavigation.test.ts`, `tableAppearance.test.ts`):** Testes de renderização estática e asserções de texto podem buscar rótulos literais atuais (ex.: nomes de abas, `Study Lab V2` ou classes/textos específicos). Toda mudança de copy ou agrupamento de navegação exigirá revisão conjunta dos testes de UI.
2. **Risco de regressão no contraste de cores personalizadas pelo usuário:** Como o usuário pode escolher cores livres de feltro/aro (`tableAppearance.ts`), mudar cores dos botões de ação não deve depender de transparências sobre o feltro; botões devem preservar fundo opaco próprio com borda contrastante.
3. **Risco de dependência externa ao carregar `Inter`:** Jamais usar `<link>` externo sem fallback local nem `next/font/google` se o pipeline de build offline do executável Windows (`Prepare-GTOTrainer.ps1`) puder rodar sem internet; o carregamento **precisa ser via `next/font/local` com arquivo `.woff2` commitado no repositório** para manter a premissa 100% offline.
4. **Risco em CSS Modules isolados (`ReplayerView.module.css` e `MathLab.module.css`):** Como usam seletores específicos e `@media` próprios (sem Tailwind), alterar tokens em `globals.css` só os afetará se suas regras forem apontadas explicitamente para `var(--gto-*)` / `--color-*`.

---

## RESUMO PARA REVISÃO PELO CHATGPT

*(Síntese objetiva do estado visual, tipográfico e de Design System de `Projeto-Poker` / `TreinerLM`, commit `7a0d5d8bc54328a5f56576724a85728aac7b47d0`, auditado em 16/11/2026 sem alterações no código)*

1. **Fontes:** `layout.tsx` não importa fontes (`next/font` ausente); `globals.css:27` pede `Inter, ui-sans-serif, system-ui, ...`, mas `document.fonts.check("16px Inter")` retorna **`false`** e a interface renderiza em **`Segoe UI`** (Windows) com `font-mono` padrão Tailwind (`MathLab.module.css` usa `monospace` genérico). Recomenda-se embutir **`Inter` variável via `next/font/local`** (100% offline) com `tabular-nums`.
2. **Escala tipográfica e hierarquia:** Censo de código revelou **35 tamanhos distintos** (`8 px` a `30 px`), com sobrecarga de **`text-xs` (`12 px`, 304 ocorrências)** para texto corrido/botões/inputs e **`>60` declarações sub-`12 px`** chegando a `8 px` (`MathLab.module.css:40`), `8.3–8.8 px` (`RangeMatrix` mobile), `9 px` (`ReplayerView.module.css`) e `9.3 px` (`PokerTable`). `<h1>` (`14 px`) é menor que `<h2>` do `Replayer` (`26 px`) e do mesmo porte de `<h2>` do `StatsView`/`Trainer` (`16 px`).
3. **Cores, contraste e semântica (WCAG 2.1):**
   - **Falhas WCAG AA comprovadas:** `RangeMatrix` (`#FFFFFF` sobre `Limp #EAB308` = **`1.92:1`**, `Call #22C55E` = **`2.28:1`**, `Raise #F43F5E` = **`3.67:1`**, `Fold #3B82F6` = **`3.68:1`**); botão `CHECK` no `Modo Trainer` (`#FFFFFF` sobre `#3FA65B` = **`3.08:1`**); placeholder `#475569` em `SettingsModal` (**`2.66:1`**); e fórmulas `slate-500` em `MathIcmLab` (`3.75–4.08:1`).
   - **Conflito de significado entre telas:** Azul significa **`Fold`** na `RangeMatrix` e no `Modo Trainer`, mas significa **`Call/Check`** nos botões do **`Treiner Limpo`** (onde `Fold` é preto `#090D16`).
   - **Migração visual incompleta:** `StatsView` (4 de 5 KPIs), `HandLibraryView`, `InteractiveDrillsLab`, `ReplayerView.module.css` e o modal `Importar Solver` retêm `#191B1D`/`#292C2F`/`#090B0C` misturados ao novo `#090D16`/`#1E293B`; variáveis de `globals.css:15-16` ainda se chamam `--gto-accent-green` com hexes azuis.
4. **Nomenclatura pt-BR e escrita:** Ocorrem rótulos técnicos crus (`BET 33PCT`, `amostra_insuficiente (<10)`, `IMPORTED_CHART_NO_EV`, `PHH_NT_SUBSET_1`), inglês misturado (`Study Lab V2`, `Range Builder`, `Prize Pool`, `ICM Win/Lose/Fold`, `card removal`), erros de concordância (`"1 aulas"`, `"0 mão"`, `"1 mão(s) registrada(s)"`) e string quebrada `"Herói: BTN vs "` (`villainPosition === null`).
5. **Layout, formas e responsividade observados (`1440×900`, `1015×955`, `768×1024`, `390×844`):** Abaixo de `1280 px` (inclusive iPad paisagem e capturas `1015×955`), as **11 abas cortam `"Explorador de Ranges"` na borda direita** sem barra de rolagem visível; no `390×844`, cabeçalho + aviso ocupam ~**`23,8%` (`~201 px`)** da altura útil; modais `SettingsModal` e `Importar Solver` não usam `<dialog>`, ignoram `Esc` e carecem de `max-h`; `PokerTable` exibe `"fold"` em assentos ainda por agir após UTG; e `StatsView` declara `"MAIOR LEAK: BTN (100%)"` com zero desvios e exibe tabelas de `931–933 px` exigindo rolagem horizontal no mobile.

*(Ver tabela token-a-token completa em [`docs/AUDITORIA_TOKENS_VISUAIS.csv`](AUDITORIA_TOKENS_VISUAIS.csv).)*
