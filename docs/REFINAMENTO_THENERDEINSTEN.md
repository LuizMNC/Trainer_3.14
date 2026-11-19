# Relatório de Refinamento — TheNerdEinsten (TreinerLM)

## 1. Componentes Modificados e Criados

### Novos módulos e componentes
- [assistantIdentity.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/ai/assistantIdentity.ts): define a identidade oficial `TheNerdEinsten`, o subtítulo `"Assistente de estudos de poker — MTT"` e a função `formatProviderModel(provider, model)` (`"Provedor: <Provedor> | Modelo: <modelo>"`).
- [assistantPrompt.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/ai/assistantPrompt.ts): centraliza o prompt padrão de sistema do `TheNerdEinsten`, as instruções de formato canônico e a serialização determinística de `spotContext` com rótulos de proveniência (`formatSpotContextForPrompt`).
- [responseFormat.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/ai/responseFormat.ts): implementa o parser de respostas em seções canônicas (`parseAssistantResponse`, `parseMarkdownResponse`), validação de esquema JSON (`validateStructuredAnalysis`, `structuredToMarkdownSections`), recuperação segura de JSON parcial/inválido (`recoverJsonFields`), fechamento de Markdown em streaming (`closeIncompleteMarkdown`), conversão legível de fórmulas LaTeX (`latexToReadable`), limpeza textual para cópia (`markdownToPlainText`, `parsedToPlainText`) e sanitização de URLs (`sanitizeAssistantUrl`).
- [provenance.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/ai/provenance.ts): implementa o controle determinístico de qualidade epistêmica (`buildSpotEvidence`, `resolveEvidenceForQuestion`, `detectDivergences`, `extractPotMathFromQuestion`, `computeDeterministicPotMath`), integrando as funções matemáticas existentes (`calculatePotOdds`, `calculateSimplifiedMdf`, `calculateBluffBreakevenFoldEquity`) sem modificar os motores matemáticos.
- [AssistantMarkdown.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/AssistantMarkdown.tsx): renderizador seguro baseado em `react-markdown`, `remark-gfm` e `remark-math`, com `skipHtml`, bloqueio de protocolos perigosos, tabelas responsivas com rolagem horizontal própria e alinhamento numérico (`tabular-nums`).
- [AssistantResponseCard.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/AssistantResponseCard.tsx): reúne os componentes visuais do assistente (`TheNerdEinstenIcon`, `TheNerdEinstenHeader`, `ProvenanceBadge`, `SpotIdentificationBar`, `ActionFrequenciesPanel`, `PotOddsCard`, `DivergenceAlert`, `InsufficientDataAlert` e `AssistantResponseCard`).
- [theNerdEinsten.test.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/__tests__/theNerdEinsten.test.ts): suíte de testes automatizados cobrindo identidade, renderização Markdown, segurança contra XSS/links maliciosos, streaming, JSON parcial/inválido, controle epistêmico e o caso `AA` no `SB vs HJ` com `30 BB`.

### Componentes e rotas existentes atualizados
- [AiCoachView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/AiCoachView.tsx): cabeçalho `TheNerdEinsten`, resolução automática de evidência determinística da pergunta, vinculação de mão enviada para revisão pós-sessão e renderização estruturada via `AssistantResponseCard`.
- [TrainerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/TrainerView.tsx): botões `"Perguntar ao TheNerdEinsten"` e `"Enviar mão para análise pós-sessão"`, envio de `spotContext` enriquecido com proveniência e exibição da resposta com `AssistantResponseCard`.
- [PokerStudioApp.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/PokerStudioApp.tsx): renomeação da aba e atalhos para `TheNerdEinsten`, integração do fluxo de envio de mãos do Trainer/Replayer para análise pós-sessão e conexão dos botões `"Repetir o spot"` / `"Treinar mãos semelhantes"`.
- [ReplayerView.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/ReplayerView.tsx), [SettingsModal.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/SettingsModal.tsx), [SiteTour.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/components/SiteTour.tsx), [layout.tsx](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/app/layout.tsx), [security.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/lib/ai/security.ts) e [route.ts](file:///c:/Users/lmnaz/OneDrive/Desktop/Reposit%C3%B3rio%20Github/Projeto-Poker/app/src/app/api/coach/route.ts): padronização visual e contratual para `TheNerdEinsten`.

---

## 2. Renomeação da Identidade

Todas as referências públicas visíveis ao usuário (`AI Coach`, `AI Poker Coach`, `Assistente de IA`, `Coach`) foram substituídas pela grafia oficial exata:

- **Nome oficial:** `TheNerdEinsten`
- **Subtítulo no cabeçalho do chat:** `Assistente de estudos de poker — MTT`
- **Rótulos de ação e configuração:**
  - `Perguntar ao TheNerdEinsten`
  - `Análise do TheNerdEinsten`
  - `Conversar com TheNerdEinsten`
  - `Configurações do TheNerdEinsten` / `Configurar TheNerdEinsten`
- **Metadado de origem sempre visível:** `Provedor: <Nome> | Modelo: <id>` (ex.: `Provedor: OpenAI | Modelo: gpt-oss-20b`), sem ocultar o provedor real nem fixar um nome único de modelo.
- **Compatibilidade técnica preservada:** identificadores internos como `AiCoachView`, `/api/coach`, `X-Poker-Coach` e chaves de `sessionStorage`/`localStorage` foram mantidos.

---

## 3. Melhorias de Renderização

- **Eliminação de Markdown bruto:** títulos (`#`, `##`, `###`), negrito (`**`), itálico (`*`), listas (`-`, `1.`), citações (`>`), código inline/bloco e separadores (`---`) são convertidos em elementos React sem exibir símbolos de formatação na tela.
- **Tabelas responsivas com alinhamento numérico:** envolvidas em contêiner com `overflow-x-auto` próprio (`max-w-full`) e detecção automática de células numéricas (`text-right font-mono tabular-nums`), impedindo rolagem horizontal global.
- **Fórmulas matemáticas legíveis:** expressões `$...$`, `$$...$$`, `\(...\)` e `\[...\]` são processadas por `remark-math` e formatadas por `latexToReadable` (ex.: `\frac{C}{P + B + C}` → `C / (P + B + C)`), protegendo valores monetários (`R$`, `US$`).
- **Suporte a streaming:** `closeIncompleteMarkdown` fecha delimitadores pendentes (`**`, `` ` ``, `$$`, blocos de código e links incompletos) a cada chunk recebido.

---

## 4. Novo Padrão de Respostas

As respostas do `TheNerdEinsten` seguem a hierarquia progressiva:

1. **A. Resposta rápida:** conclusão principal em destaque (1–3 frases) precedida pelo veredito determinístico do aplicativo quando há spot/mão identificada.
2. **B. O que importa nesta mão:** lista enxuta dos fatores relevantes (posição, stack efetivo, pot odds, range do adversário, ação anterior, blockers e ICM quando aplicável).
3. **C. Informações de apoio:**
   - Painel de frequências e barra proporcional de estratégia (`ActionFrequenciesPanel`) quando há referência carregada.
   - Painel de comparação entre a ação escolhida pelo aluno e a ação principal da referência.
   - Cartão determinístico de pot odds, MDF e fold equity (`PotOddsCard`) somente quando há valores reais de pote e aposta.
4. **D. Explicação aprofundada (inicialmente recolhida):** controles sob demanda para `Entenda o motivo`, `Ver a matemática`, `Comparar ranges`, `Ver a fonte`, `Explorar alternativas` e `Expandir explicação` / `Recolher explicação`.
5. **E. Próxima ação e interações:** botões para `Repetir o spot`, `Comparar outra ação`, `Treinar mãos semelhantes`, `Revisar a decisão`, `Enviar mão para análise pós-sessão`, `Continuar conversa`, `Nova pergunta` e `Copiar resposta` (que copia texto limpo, sem símbolos Markdown).

---

## 5. Integração com Diferentes Provedores

- Suporte integral aos provedores registrados (`Gemini`, `OpenAI`, `Claude`, `DeepSeek`, `Groq`, `OpenRouter`, `Mistral` e `Ollama local`).
- O contrato aceita tanto respostas em Markdown estruturado quanto respostas JSON validadas por esquema (`validateStructuredAnalysis`), sem exigir que todos os provedores suportem saída estruturada proprietária.
- Quando um provedor retorna JSON truncado ou inválido, a interface exibe aviso claro e recupera os campos legíveis (`recoverJsonFields`), permitindo inspecionar o conteúdo bruto recuperável sem quebrar a página.

---

## 6. Segurança da Renderização

- `skipHtml` ativo no `ReactMarkdown`: tags HTML arbitrárias (`<script>`, `<iframe>`, `<img onerror=...>`, `<svg onload=...>`) geradas pela IA são descartadas.
- Nenhum uso de `dangerouslySetInnerHTML` com conteúdo da IA.
- `sanitizeAssistantUrl` permite exclusivamente `http:`, `https:`, `mailto:` e âncoras/caminhos relativos locais, bloqueando `javascript:`, `data:`, `vbscript:`, URLs protocol-relative (`//`) e ofuscações com caracteres de controle.
- Imagens externas em Markdown são substituídas por indicador textual seguro para evitar rastreamento não autorizado.

---

## 7. Controle de Autenticidade GTO e Qualidade Epistêmica

- **Distinção visual explícita por selos (`ProvenanceBadge`):**
  - `Cálculo matemático verificado` (`MATH_VERIFIED`)
  - `Referência GTO verificada` (`GTO_VERIFIED`)
  - `Chart importado sem EV` (`CHART_NO_EV`)
  - `Demonstração didática` (`DIDACTIC_DEMO`)
  - `Interpretação didática da IA` (`AI_INTERPRETATION`)
  - `Sem dados suficientes` (`INSUFFICIENT_DATA`)
- **Tratamento do caso AA no SB vs HJ com 30 BB:**
  - Quando consultado com o catálogo carregado (`30bb_sb_vs_hj_rfi`), o sistema identifica que a referência é um `Chart importado sem EV` onde `AA` tem `3-Bet: 100%` e `Fold: 0%`, exibindo imediatamente: *"Dar fold com AA nessa situação parece uma decisão muito ruim nas condições usuais."*
  - Quando consultado sem spot carregado (`UNSOLVED`), o sistema classifica como `Sem dados suficientes`, preserva o alerta crítico sobre o fold de `AA` e **não** inventa frequências nem EV.
  - Se o texto da IA tentar justificar uma ação com `0%` na referência, inventar EV em um chart sem EV, divergir em mais de 5 pontos percentuais das frequências da referência ou assumir ICM/bolha não informados, `detectDivergences` exibe o alerta `Divergência detectada — prevalecem os dados verificáveis do aplicativo`.

---

## 8. Comparação Visual Antes/Depois

Capturas salvas em `docs/screenshots/thenerdeinsten-2026/` nos quatro viewports exigidos (`1920×1080`, `1440×900`, `768×1024` e `390×844`):

- **Antes (`before_chat_*.png`):** cabeçalho genérico `"Assistente de IA · Estudo MTT"`, aba `"AI Poker Coach"`, símbolos `###`, `**` e `---` aparentes, tabela Markdown bruta em texto corrido e ausência de alerta epistêmico quando a resposta tentava justificar fold de `AA` com números inventados.
- **Depois (`after_chat_*.png`):** cabeçalho `"TheNerdEinsten — Assistente de estudos de poker — MTT"` com `"Provedor: OpenAI | Modelo: gpt-oss-20b"`, identificação do spot `30BB - SB vs HJ RFI` (`Chart importado sem EV`), alerta de divergência epistêmica em destaque, cartão de `Resposta rápida` com veredito determinístico, painel de frequências (`3-Bet 100%`, `Fold 0%`), comparação `Sua escolha: Fold (0%) vs Ação da referência: 3-Bet (100%)` e seções aprofundadas recolhíveis sem rolagem horizontal global.

---

## 9. Testes Executados

1. `npm test`: todas as suítes em `src/lib/__tests__/*.test.ts` executadas, incluindo a nova suíte `theNerdEinsten.test.ts` (11 cenários cobrindo Markdown, negrito, títulos, tabelas, listas, fórmulas, streaming, JSON inválido, links maliciosos, HTML perigoso, respostas longas, respostas vazias, múltiplos provedores, metadados de modelo, português brasileiro, estados de carregamento, conteúdo sem referência GTO, contradições IA vs estratégia determinística e o caso AA no SB vs HJ 30 BB com e sem chart).
2. `npm run lint`: aprovado sem erros ou avisos.
3. `npm run typecheck`: aprovado (`tsc --noEmit` sem erros).
4. `npm run build`: build de produção do Next.js validado.
5. Verificação visual automatizada nos viewports `1920×1080`, `1440×900`, `768×1024` e `390×844` sem rolagem horizontal global.

---

## 10. Pendências

- Nenhuma pendência bloqueante. Os motores matemáticos, as soluções TexasSolver, os ranges originais e o banco SQLite pessoal não foram alterados.
