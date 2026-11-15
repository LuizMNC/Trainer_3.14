# Projeto-Poker — GTO Study App & AI Poker Coach

Aplicação web pessoal de estudos GTO pré-flop construída diretamente sobre os materiais da sua pasta `Projeto-Poker`, com **Modo Trainer interativo**, **Explorador de Ranges (229 spots)** e **AI Poker Coach** integrado à API do **Google AI Studio (`@google/genai` — Interactions API)**.

---

## Estrutura Criada (arquivos originais intactos)

- `pipeline/extract_ranges.py` — Extrai pixel a pixel os 216 ranges de solver de `PDF - Ranges RFI e vs RFI.pdf` + 13 ranges de Spin & Go (3BB–100BB) para `app/src/data/ranges_gto.json` (229 spots).
- `pipeline/extract_knowledge.py` — Indexa os PDFs teóricos (*5 maiores erros no ICM*, *Dicionário de Poker*, *Ranges*) e os 4 livros `.epub` (*Modern Poker Theory*, *Play Optimal Poker 1 & 2*, *The Grinder's Manual*) + cataloga as 22 aulas em vídeo em `app/src/data/knowledge_base.json` (322 trechos + 22 vídeos).
- `app/` — Aplicação Next.js + TypeScript + Tailwind CSS:
  - **Modo Trainer:** Mesa 8-max interativa, filtros por stack/posição/tipo/dificuldade (*Qualquer mão* vs *Borderline / Mistas*), gerador RNG (1–100), atalhos de teclado (`1..5` ações, `Space` próxima mão), matriz 13×13 revelada após a decisão e botão *"Explicar com AI Coach"*.
  - **Explorador de Ranges:** Navegação completa dos 229 spots de 3BB a 100BB com comparação lado a lado entre dois spots.
  - **AI Poker Coach:** Chat multi-turn com Gemini (`gemini-3.8-flash` padrão) usando RAG sobre sua biblioteca local, suporte a **upload/cola (Ctrl+V) de prints** de mãos/tabelas via Gemini Vision e catálogo pesquisável das 22 aulas em vídeo.
  - **Estatísticas & Leaks:** Histórico salvo localmente (`localStorage`), precisão GTO e mapa de calor Posição × Stack.

---

## Como Rodar

### 1. Configurar sua chave do Google AI Studio (opcional por `.env.local` ou direto pela interface)

Obtenha uma chave em <https://aistudio.google.com/apikey>.

Você pode:
- **Pela interface (mais fácil):** Clique em **Configurar AI Studio** no canto superior direito da aplicação e cole sua chave; ou
- **Por arquivo `.env.local`:** Copie `app/.env.local.example` para `app/.env.local` e preencha:
  ```env
  GEMINI_API_KEY=sua_chave_aqui
  ```

### 2. Iniciar o servidor local

```bash
cd "c:\Users\lmnaz\OneDrive\Desktop\Repositório Github\Projeto-Poker\app"
npm run dev
```

Abra <http://localhost:3000> no navegador.

Na interface **PDF de Poker**, use **A+** e **A−** no topo para ajustar a fonte entre 100% e 150%. Clique no percentual para restaurar o tamanho padrão; a preferência é salva neste navegador. O botão **Fazer um tour** apresenta as áreas do site, com navegação por etapas, retorno à área inicial ao sair e fechamento pela tecla `Esc`.

No **Modo Trainer**, configure o cenário e clique em **Iniciar treino em tela cheia**. A mesa fica ao centro, com estatísticas da sessão e o range ao lado em telas maiores. Use **Configurar treino** para rever os filtros e **Esc** ou **Sair da tela cheia** para voltar, mantendo a mão e a sessão. As animações de cartas, fichas e resultados têm velocidades **Normal**, **Rápidas** e **Desligadas**, respeitando também a preferência de reduzir movimento do sistema. Quando o navegador não permite tela cheia nativa, o treino ocupa toda a janela.

---

## Como Re-executar a Extração (caso adicione novos materiais)

```bash
cd "c:\Users\lmnaz\OneDrive\Desktop\Repositório Github\Projeto-Poker"
python pipeline/extract_ranges.py
python pipeline/extract_knowledge.py
```
