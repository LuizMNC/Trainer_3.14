"""
Extrator de Conhecimento Teórico para o AI Coach (RAG Local).

Extrai texto estruturado dos PDFs (Dicionário do Poker, Ebook ICM, 5 Erros em Retas Finais,
Introdução de Ranges) e dos livros EPUB em 'livros/', gerando chunks pesquisáveis em
'app/src/data/knowledge_base.json' para enriquecer as respostas da API do AI Studio.
"""

import json
import os
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
import pymupdf

BASE_DIR = Path(r"c:\Users\lmnaz\OneDrive\Desktop\Repositório Github\Projeto-Poker")
OUT_PATH = BASE_DIR / "app" / "src" / "data" / "knowledge_base.json"


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip = True
        elif tag in ("p", "h1", "h2", "h3", "h4", "li", "div", "br"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", raw)).strip()


def html_to_text(html_str: str) -> str:
    p = _HTMLTextExtractor()
    p.feed(html_str)
    return p.text()


def chunk_text(text: str, source: str, category: str, max_chars: int = 900):
    # Normaliza quebras de linha preservando parágrafos e quebrando blocos longos por frases
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    raw_blocks = [b.strip() for b in re.split(r"\n{2,}", text) if len(b.strip()) > 30]

    # Se um bloco ainda for muito grande (ex: PDF com quebras simples '\n'), fatia por linhas/frases
    pieces = []
    for block in raw_blocks:
        if len(block) <= max_chars:
            pieces.append(block)
        else:
            cur = ""
            for line in block.splitlines():
                line = line.strip()
                if not line:
                    continue
                if len(cur) + len(line) + 1 <= max_chars:
                    cur = f"{cur} {line}".strip()
                else:
                    if len(cur) > 30:
                        pieces.append(cur)
                    while len(line) > max_chars:
                        pieces.append(line[:max_chars])
                        line = line[max_chars:]
                    cur = line
            if len(cur) > 30:
                pieces.append(cur)

    chunks = []
    buf = ""
    for piece in pieces:
        if len(buf) + len(piece) + 2 <= max_chars:
            buf = f"{buf}\n\n{piece}".strip()
        else:
            if buf:
                chunks.append({"source": source, "category": category, "text": buf})
            buf = piece
    if buf:
        chunks.append({"source": source, "category": category, "text": buf})
    return chunks


def extract_pdf_chunks(filename: str, category: str, page_range=None):
    path = BASE_DIR / filename
    if not path.exists():
        return []
    doc = pymupdf.open(path)
    pages = page_range if page_range is not None else range(len(doc))
    full_text = []
    for i in pages:
        if 0 <= i < len(doc):
            t = doc[i].get_text().strip()
            # Remove rodapés repetitivos
            t = re.sub(r"A distribuição não autorizada deste material é proibida\.?", "", t)
            t = re.sub(r"Comunidade Reg Life - Todos os direitos reservados", "", t)
            t = re.sub(r"© REG LIFE.*", "", t)
            if t.strip():
                full_text.append(t.strip())
    return chunk_text("\n\n".join(full_text), filename, category)


def extract_epub_chunks():
    livros_dir = BASE_DIR / "livros"
    if not livros_dir.exists():
        return []
    chunks = []
    for epub_path in sorted(livros_dir.glob("*.epub")):
        book_title = epub_path.stem.split(" - ")[0:2]
        short_name = " - ".join(book_title)
        try:
            with zipfile.ZipFile(epub_path) as z:
                html_files = sorted(
                    n for n in z.namelist()
                    if n.lower().endswith((".html", ".xhtml", ".htm"))
                    and "toc" not in n.lower()
                    and "cover" not in n.lower()
                )
                book_texts = []
                for hf in html_files:
                    raw = z.read(hf).decode("utf-8", errors="ignore")
                    txt = html_to_text(raw)
                    if len(txt) > 150:
                        book_texts.append(txt)
                # Limita a amostra representativa por livro para manter o JSON ágil (~40 chunks/livro)
                book_chunks = chunk_text("\n\n".join(book_texts), short_name, "livro", max_chars=900)
                chunks.extend(book_chunks[:45])
                print(f"EPUB '{short_name}': {len(book_chunks)} chunks totais (indexados {min(45, len(book_chunks))})")
        except Exception as exc:
            print(f"Erro ao ler {epub_path.name}: {exc}")
    return chunks


def extract_video_catalog():
    """Cataloga os títulos das 22 vídeo-aulas para referência cruzada no AI Coach."""
    videos = []
    for folder, cat in [("4. Pré-Flop", "Aula Pré-Flop"), ("Estudo do POKER", "Corte / Análise Pós-Flop")]:
        d = BASE_DIR / folder
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if p.suffix.lower() in (".mov", ".mp4"):
                rel = str(p.relative_to(BASE_DIR))
                videos.append({
                    "title": p.stem.replace("_", " "),
                    "category": cat,
                    "relativePath": rel,
                    "sizeMb": round(p.stat().st_size / (1024 * 1024), 1),
                })
    return videos


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    chunks = []
    chunks.extend(extract_pdf_chunks("PDF - Ranges RFI e vs RFI.pdf", "ranges_teoria", page_range=range(2, 8)))
    chunks.extend(extract_pdf_chunks("Reg-Life-ebook-ICM.pdf", "icm"))
    chunks.extend(extract_pdf_chunks("5-erros-que-voce-esta-cometendo-em-retas-finais.pdf", "reta_final"))
    chunks.extend(extract_pdf_chunks("Reg-Life_Dicionario-do-Poker.pdf", "dicionario"))
    chunks.extend(extract_epub_chunks())

    videos = extract_video_catalog()

    # Adiciona IDs sequenciais
    for idx, ch in enumerate(chunks):
        ch["id"] = f"kb_{idx:04d}"

    payload = {
        "totalChunks": len(chunks),
        "totalVideos": len(videos),
        "chunks": chunks,
        "videos": videos,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"\nCONCLUIDO! {len(chunks)} chunks teóricos + {len(videos)} vídeos catalogados em {OUT_PATH}")


if __name__ == "__main__":
    main()
