# Relatório consolidado — TreinerLM / Projeto-Poker

**Data de referência:** 17/11/2026, America/Fortaleza.  
**Base do levantamento:** código e estado Git desta pasta, documentação técnica, evidências locais e histórico dos chats relacionados ao projeto.  
**Verificação atual:** 219 testes TypeScript e 78 testes Python aprovados; TypeScript e ESLint sem erros.

## 1. Situação geral

O projeto evoluiu de um treinador de ranges para um ambiente integrado de estudo de poker, com foco em torneios MTT: treino pré-flop e pós-flop, exploração de ranges, biblioteca SQLite, reprodução de mãos, laboratório matemático, conteúdos educativos, diagnóstico de dificuldades e assistente de IA opcional.

A interface atual organiza os recursos em sete áreas: **Treinar, Ranges MTT, Biblioteca, Replayer, Laboratório, Estudos e Estatísticas**. Algumas áreas reúnem mais de um módulo, como o Trainer e o Treiner Limpo, ou o currículo, Erros Fatais e TheNerdEinsten.

A aplicação usa Next.js 15, React 19 e TypeScript. O pipeline de históricos usa Python, PokerKit e SQLite. Existe também um iniciador para Windows. O núcleo de estudo funciona localmente; a consulta a provedores externos de IA depende de conexão e de uma chave pessoal.

O escopo implementado é estudo e revisão pós-sessão. A cobertura estratégica continua delimitada pelas referências disponíveis: ter um replayer, uma calculadora ou um chat não significa possuir uma solução GTO para qualquer mão.

## 2. Base técnica, matemática e integridade GTO

Foram implementados e auditados:

- Baralho de 52 cartas, 169 classes de mãos e 1.326 combinações físicas.
- Contagem combinatória, remoção de cartas bloqueadas e identificação de ações legais.
- Modelagem de stacks, apostas, all-ins e potes laterais.
- Pot odds, fold equity, MDF simplificado, proporção de blefes em modelo polarizado, ICM de Malmuth-Harville e Bubble Factor.
- Modelo educacional de PKO com conversão explícita de bounty para fichas equivalentes.
- Contratos de estratégias, importação/exportação de referências e controles de proveniência.
- Avaliação de estratégias mistas e aderência ao mix pela distância de variação total, evitando tratar uma ação minoritária válida como erro automático.
- Diagnóstico por posição/stack e repetição espaçada.

Uma correção central foi retirar a classificação de solução verificada de cenários sintéticos e bloquear EV inventado. O sistema distingue **referência verificada**, **chart importado sem EV**, **demonstração didática** e **situação sem solução**. A existência de frequências em um chart não autoriza calcular perda de EV.

Também foram corrigidas validações, cálculos de blockers e controles de importação para impedir a promoção de exemplos didáticos a solver real apenas pela mudança de um rótulo.

**Fontes:** [Arquitetura e evolução](ARQUITETURA_E_PLANO.md), [auditoria GTO](AUDITORIA_GTO_VERIFICADO.md) e [homologação da Fase 1](CODEX_FASE1_HOMOLOGACAO.md).

## 3. Ranges e primeira solução real de solver

O arquivo original de ranges possui **229 matrizes**. A auditoria classificou **216 como MTT** e **13 como Spin & Go**. As matrizes Spin foram preservadas no acervo original para rastreabilidade e excluídas dos fluxos ativos de treino MTT.

As 216 matrizes MTT cobrem stacks de **14, 17, 20, 30, 50 e 100 BB**, distribuídas em **42 RFI, 168 contra RFI e 6 contra limp**, na referência MTT 8-max com ante de 0,125 BB.

Foi integrada uma solução pós-flop real do TexasSolver para **BTN contra BB, pote com um único raise pré-flop, 30 BB, chipEV, flop Ah Kd 7c**. Os artefatos registram 101 classes, 563 combos e exploitability reportada de aproximadamente 0,41485%. Foram preservados entrada, saída bruta, logs, manifesto e bundle canônico.

A CLI utilizada exporta frequências, mas não fornece EV individual por ação. Por isso, essa referência não habilita uma perda de EV numérica onde os dados não existem. O adaptador também suporta importação de CSV do Desktop Postflop com validações próprias.

A auditoria encontrou **23 células com perda relevante de frequência na extração**, incluindo duas cuja soma é 0,964. Foram adicionados avisos, classificação de integridade e proteção de sorteio/avaliação. O resíduo não é transformado silenciosamente em Fold nem atribuído à ação dominante. **A recuperação dos valores ausentes na fonte permanece pendente.**

O catálogo canônico documentado reúne 230 spots MTT: 216 charts sem EV, uma referência TexasSolver, quatro demonstrações didáticas e nove situações sem solução.

**Fontes:** [Primeiro spot real](PRIMEIRO_SPOT_GTO_REAL.md), [auditoria MTT-only](AUDITORIA_RANGES_MTT_ONLY.md) e [correções após homologação](ANTIGRAVITY_CORRECOES_POS_HOMOLOGACAO_MTT.md).

## 4. Treinadores e recursos educativos

### Trainer e Treiner Limpo

- Treino com referência, randomizador de 1 a 100, seleção de cenários e feedback de estratégia mista.
- Separação entre aprendizagem e modo técnico, com bloqueio de referências inadequadas para pontuação GTO.
- Treiner Limpo voltado à memorização das matrizes MTT.
- Persistência local de sessão, tentativas e aderência, com validação dos dados recuperados do navegador.
- Treino em tela cheia, mesa central, estatísticas e painel de range.
- Animações de cartas, fichas e feedback, com opções normal, rápida ou desligada.
- Saída por Esc preservando a sessão.

### Treinos Interativos e Daily Dose

Foram criados seis modos: Daily Dose, construtor de ranges 13×13, Pot Odds/MDF, blockers, comparador de sizings e C-Bet Flop. Os exercícios se conectam aos conceitos e às referências disponíveis, com diferenciação entre cálculo, modelo e estratégia importada.

### Currículo, fontes e Erros Fatais

- Currículo com 18 aulas e organização por trilhas.
- Índice local documentado no README com 322 trechos e 22 vídeos locais.
- Catálogo de 20 Erros Fatais, com cartões, exercícios, progresso e revisão espaçada.
- Integração com exercícios compatíveis quando há vínculo real; temas sem referência não recebem um spot inventado.
- Dossiês de planejamento, métodos numéricos e análise de materiais em `Dossie/`.

Os indicadores educativos foram separados dos exercícios técnicos para evitar misturar quiz conceitual com acerto GTO ou EV real.

**Fontes:** [Fase 1](CODEX_FASE1_ERROS_FATAIS.md), [homologação](CODEX_FASE1_HOMOLOGACAO.md) e [mapa didático](MAPA_DIDATICO_DAILY_DOSE.md).

## 5. Banco de mãos, Biblioteca e importação PokerStars

### Pipeline e Biblioteca

A Fase 2A criou a base de importação, validação cronológica e representação canônica de históricos. Foram adicionados controles de precisão monetária por unidades inteiras, conservação de fichas, cartas conhecidas por evento e diagnósticos de formatos não suportados.

A Fase 2C integrou uma Biblioteca SQLite local com:

- Importação de PHH e JSON canônico, mantendo a distinção de proveniência.
- Importação em lote, identificação de duplicatas e resultados individuais.
- Pesquisa, filtros, notas, tags, favoritos e marcação para revisão.
- Abertura no Replayer, exportação e backup SQLite.
- Migrações aditivas, transações e proteção de acesso local.

O banco padrão é `%LOCALAPPDATA%\Projeto-Poker\hand-library.sqlite3`. A Biblioteca depende do backend Python/SQLite local e de habilitação explícita; ela não se torna uma biblioteca em nuvem ao publicar a interface.

### PokerStars TXT e ZIP

Foi acrescentado um importador bilíngue PT-BR/inglês para históricos PokerStars, incluindo ZIP, vários TXT, análise prévia, progresso, cancelamento, deduplicação e filtros por torneio/modalidade. A extração de ZIP possui controles de segurança e limites de tamanho.

O lote real documentado foi reconciliado da seguinte forma:

| Resultado | Quantidade |
|---|---:|
| Mãos identificadas | 3.042 |
| Mãos validadas e gravadas | 3.022 |
| Mãos recusadas por limitações ou divergências | 20 |
| Duplicatas no lote original | 0 |

As 20 recusas foram discriminadas: seis reaberturas após all-in curto não suportadas, cinco raises acima do all-in efetivo, cinco casos de sit-out/all-in/fold, três checks implícitos de BB ausentes e uma divergência de conservação na distribuição do pote.

A auditoria posterior registra **2.681 mãos MTT comprovadas e 341 de formato desconhecido** entre as 3.022 gravadas. Formato desconhecido não é promovido automaticamente a MTT. Esses números descrevem o banco auditado naquela manutenção; este levantamento não abriu nem alterou o banco pessoal.

Foram registrados testes de reimportação idempotente, backup, filtros e abertura das mãos no Replayer, usando bancos descartáveis. O relatório da correção crítica também documenta backup consistente e conferência de preservação do banco pessoal.

**Fontes:** [Fase 2A](CODEX_FASE2A_BANCO_MAOS.md), [homologação 2A](CODEX_FASE2A_HOMOLOGACAO.md), [Biblioteca](CODEX_FASE2C_BIBLIOTECA_MAOS.md) e [importador PokerStars](IMPORTADOR_POKERSTARS_ZIP_TXT.md).

## 6. Replayer e análise pós-sessão

A Fase 2B implementou reprodução por eventos/ruas, navegação, velocidade, linha do tempo, exemplos e perspectivas de visualização. As cartas seguem o conhecimento temporal do histórico, evitando revelar antecipadamente cartas que só aparecem depois.

Na correção crítica mais recente foram acrescentados:

- Proteções contra cartas, índices e valores monetários inválidos.
- Avaliação segura da possibilidade de reproduzir uma mão.
- Isolamento de falhas de renderização e tratamento global de erros.
- Recuperação pela interface com retorno à Biblioteca ou carregamento de exemplo válido.
- Importações estáticas de Biblioteca/Replayer para reduzir falhas de carregamento tardio de chunks.
- Botões para reiniciar mão e retornar à Biblioteca.
- Avisos para históricos parciais.

Foi criada uma área recolhível de **Análise Pós-Sessão da Decisão**, com sizing, stack efetivo, SPR, pot odds e comparação com referências compatíveis.

A correspondência estratégica é restrita: charts pré-flop exigem condições compatíveis; a solução pós-flop exige compatibilidade de formato, posições, board, tipo de pote e stack. Históricos Cash, Spin e desconhecidos não são comparados automaticamente a ranges MTT. Sem cobertura, a interface informa: **“Não há solução GTO compatível com esta situação.”**

A integração com TheNerdEinsten gera um resumo sanitizado, removendo nicks e identificadores, para revisão manual. Abrir o rascunho não dispara uma consulta externa.

O relatório registra testes de navegador com mãos reais de três, seis, sete, oito e nove jogadores, isolamento de uma mão corrompida e quatro resoluções sem overflow horizontal.

**Fontes:** [Replayer original](CODEX_FASE2B_REPLAYER.md) e [correção crítica e análise pós-sessão](CORRECAO_CRITICA_REPLAYER_POKERSTARS.md).

## 7. Laboratório matemático — Fase 3

Foram integrados motores de equidade exata, Monte Carlo e EV/sensibilidade, executados em Web Worker para permitir progresso e cancelamento.

- Equidade para dois a seis participantes, mãos específicas ou ranges ponderados, board e cartas mortas.
- Validação de colisões de cartas e configurações impossíveis.
- Divisão de pote em empates.
- Monte Carlo com seed, evolução da estimativa e medidas de incerteza.
- Modelos explícitos de EV de call, fold, bet, check, blefe e mistura bet/check.
- Gráficos de sensibilidade, comparação de experimentos e exportação dos parâmetros/resultados.
- Transferência de cartas visíveis do Replayer para o Laboratório.

O avaliador foi comparado historicamente ao PokerKit em 1.505 mãos, sem divergências na amostra. Exemplos analíticos incluem empate em royal flush de 50%/50% e AA contra KK no turn de aproximadamente 95,45%/4,55%.

As limitações são explícitas: o motor de equidade trabalha com um pote comum; os modelos de EV usam hipóteses declaradas e não substituem uma árvore estratégica. As calculadoras anteriores de ICM/PKO permanecem disponíveis, mas os novos motores não inferem automaticamente EV monetário, ICM ou PKO a partir de uma mão.

**Fontes:** [Fase 3 completa](CODEX_FASE3_COMPLETA.md) e [guia do usuário](GUIA_USUARIO_GTO_TRAINER.md).

## 8. IA multiprovedor e TheNerdEinsten

O coach inicialmente limitado ao Gemini foi reorganizado com um contrato comum e adaptadores para **Gemini, OpenAI, Claude, DeepSeek, Groq, OpenRouter e Mistral**, além de **Ollama local opcional**.

Foram implementados descoberta autenticada de modelos, seleção explícita, teste de conexão, streaming, cancelamento e erros tratados. Cada usuário fornece sua chave; o servidor não usa uma chave global como substituta.

A configuração é independente por provedor. O armazenamento padrão dura a sessão; a persistência no navegador depende de escolha explícita. Foram adicionadas validações de origem, destinos fixos, limites de conteúdo e controles de abuso. No ambiente público, a IA depende de contador compartilhado Redis; ausência ou falha desse contador bloqueia a consulta antes de chamar o provedor. O adaptador Ollama bloqueia modelos identificados como remotos/cloud.

O assistente recebeu a identidade **TheNerdEinsten**, com provedor/modelo visíveis, renderização de Markdown, tabelas e fórmulas, cópia de texto limpo e respostas organizadas em conclusão, fatores relevantes e explicação aprofundada recolhível.

Também foram adicionados:

- Tratamento de Markdown em streaming e JSON parcial/inválido.
- Bloqueio de HTML e links perigosos no conteúdo gerado.
- Selos para diferenciar matemática verificada, referência GTO, chart sem EV, demonstração, interpretação da IA e dados insuficientes.
- Veredito determinístico e alertas quando a resposta diverge da referência ou inventa EV.
- Caso de teste específico para AA no SB contra HJ com 30 BB, com e sem chart carregado.

**Situação da homologação:** os adaptadores e os fluxos têm testes simulados, mas não há homologação registrada com credenciais reais para cada provedor/modelo. As últimas alterações multiprovedor também não têm publicação confirmada. Um script separado, `npm run test:ai:live`, foi preparado para testes reais autorizados.

**Fontes:** [IA multiprovedor e cores](ANTIGRAVITY_IA_MULTIPROVEDOR_CORES_RANGES.md) e [refinamento TheNerdEinsten](REFINAMENTO_THENERDEINSTEN.md).

## 9. Interface, acessibilidade, autenticação e Windows

Foram realizadas sucessivas revisões visuais: tema vermelho/preto/azul, personalização de mesa/cartas/fichas, oponentes cientistas, identidade π, painéis recolhíveis e layouts para desktop, tablet e celular.

O histórico registra a substituição do nome público RegLife por “PDF de Poker” nos textos solicitados, controle de fonte e tour guiado. A identidade principal posteriormente consolidada no aplicativo é **TreinerLM**; nomes técnicos legados ainda existem no código e em documentos históricos.

A paleta de ações foi centralizada: **All-in roxo, Raise vermelho, Limp amarelo, Fold azul, Call verde, Check cinza e Bet laranja**. Os testes registram contraste adequado dos pares de texto/fundo e preservação dos segmentos de frequência, inclusive pequenos resíduos.

Foi implementado acesso por senha para publicação, com página de login, sessão assinada, logout, proteção por middleware e bloqueio na Vercel quando a senha não está configurada. Isso é implementação local conferida no código; a configuração efetiva da produção não foi inspecionada neste levantamento.

No Windows foram criados scripts de preparação/verificação, atalho, ícone e iniciador do servidor em loopback, com identificação de instância, prontidão e encerramento de processos. O histórico contém confirmação do usuário de que o ícone abriu corretamente. O ciclo completo do iniciador da revisão atual não foi repetido neste relatório.

Há capturas e registros de validação visual em diversas pastas de evidências, incluindo `docs/ia-multiprovedor-cores/` e `docs/screenshots/`.

## 10. Guia HTML separado registrado no histórico

O chat **“Criar guia de ranges de poker”** registra a criação de um guia independente com comparação de ranges, mão fixada, modo compacto, imagens originais, auditoria, anotações, favoritos, histórico, backup, importação de soluções, mãos PokerStars e ajuste de fonte de 80% a 150%.

O histórico registra 27 testes aprovados na evolução desse guia e duas correções documentadas a partir das imagens, preservando os valores originais.

**Limite desta confirmação:** `guia/index.html` não existe na pasta atual consultada. Assim, essa entrega é registrada como trabalho histórico; sua presença e funcionamento nesta cópia do projeto não foram confirmados. As lacunas de fontes específicas de ICM/PKO e de algumas situações contra shove/multiway também constam daquele histórico.

## 11. Validação executada para este relatório

Estes resultados foram obtidos agora sobre os arquivos atuais, sem modificar a implementação:

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm test` | **219/219 aprovados**, 42 suítes; zero falhas, cancelamentos ou ignorados | [Log TypeScript](RELATORIO_TESTES_ATUAL_2026-11-17.log) |
| `npm run typecheck` | **Aprovado**, saída 0 | [Log de tipos](RELATORIO_TYPECHECK_ATUAL_2026-11-17.log) |
| `npm run lint` | **Aprovado**, saída 0, sem avisos emitidos | [Log ESLint](RELATORIO_LINT_ATUAL_2026-11-17.log) |
| Testes Python de `pipeline/hand_history` | **78/78 aprovados** | [Log Python](RELATORIO_PYTHON_ATUAL_2026-11-17.log) |
| SHA-256 dos dois arquivos de referência | **Coincidem com os registros anteriores** | Hashes abaixo |

Hashes conferidos:

```text
ranges_gto.json
d46652c5bfe3ced09073fa68544e134683499f18eabdabef8202d9ee351cb60e

verified_ahkd7c_texassolver.json
868ef9fb8e6371f12dde7749170015af4facca70af92dc33aa45251cdd0b3eda
```

Build de produção, testes de navegador, launcher e comparações externas possuem aprovações em registros anteriores, mas **não foram executados novamente neste levantamento**. Tampouco foram feitas chamadas reais de IA, publicação, escrita no banco pessoal ou execução nova do TexasSolver.

Os relatórios antigos mostram contagens diferentes de testes porque representam etapas distintas. Por exemplo, o relatório de IA registra 200 testes; a execução atual completa registra 219. O log antigo de typecheck da etapa de IA contém um erro transitório de arquivos gerados durante o build; a execução atual de tipos terminou com sucesso.

## 12. Estado Git e marcos versionados

O HEAD observado é **`acca276`**, de 16/11/2026. Os principais marcos registrados são:

| Data | Commit | Marco |
|---|---|---|
| 12/11/2026 | `8af89a4` | Snapshot do projeto até a Etapa 6 |
| 15/11/2026 | `e7d3ba0` | GTO Trainer completo preparado para GitHub |
| 15/11/2026 | `2412db0` | Personalização visual, cientistas, π e tela cheia |
| 15/11/2026 | `7a0d5d8` | Treiner Limpo, tema e responsividade |
| 16/11/2026 | `e072b8c` | MTT-only, integridade, persistência e design system |
| 16/11/2026 | `acca276` | Merge preservando o README atualizado |

Antes da criação deste relatório, havia **33 arquivos rastreados modificados**, além de arquivos e diretórios novos ainda não rastreados. As alterações locais abrangem autenticação, IA, interface, Biblioteca, importador PokerStars, Replayer, testes e documentação.

Portanto, parte importante do trabalho existe no workspace e ainda não está consolidada no HEAD. A presença de commits locais não comprova push ou deploy. Este levantamento não criou commit, não enviou mudanças ao remoto e não publicou o site.

## 13. Pendências e próximos passos fundamentados

1. **Homologar a IA real:** testar, com autorização e credenciais adequadas, os provedores/modelos efetivamente pretendidos. Confirmar descoberta, inferência, streaming e cancelamento.
2. **Validar publicação:** configurar e testar autenticação e contador compartilhado de IA no ambiente de preview; confirmar os fluxos antes de promover a versão pública.
3. **Consolidar as alterações locais:** revisar o conjunto de mudanças ainda sem commit e preparar um marco versionado reproduzível.
4. **Recuperar as 23 células incompletas na fonte:** manter as proteções atuais até existir evidência para corrigir as frequências.
5. **Ampliar referências estratégicas reais:** adicionar novos solves pós-flop e cobertura específica de ICM/PKO e de cenários pré-flop ausentes. Os cálculos existentes não preenchem essa lacuna automaticamente.
6. **Decidir a evolução das 20 mãos recusadas:** ampliar o parser e seus testes quando houver interesse em suportar esses casos, preservando a recusa explícita enquanto não houver validação suficiente.
7. **Localizar o guia HTML separado**, caso deva fazer parte da entrega atual.
8. **Manutenção futura:** avaliar unificação do progresso de repetição espaçada, redução de componentes extensos e continuidade da automação de fluxos completos no navegador. São itens de evolução presentes nos backlogs; não foram implementados por este relatório.

## 14. Arquivos gerados neste levantamento

Esta atividade acrescentou somente o relatório consolidado e quatro logs de verificação na pasta `docs/`. As implementações anteriores foram preservadas. Os documentos citados ao longo do texto oferecem o detalhamento técnico e as evidências específicas de cada fase.
