"""
Extrator de Ranges GTO de Alta Precisão para o Projeto-Poker.

Lê os 216 spots de solver de 'PDF - Ranges RFI e vs RFI.pdf' (14, 17, 20, 30, 50 e 100 BBs),
além das matrizes de Spin & Go (3, 5, 10, 15 BBs) e charts complementares em '4. Pré-Flop/'.
Gera um JSON unificado e validado para o Modo Trainer e Explorador de Ranges.
"""

import io
import json
import os
import re
from collections import Counter
from pathlib import Path
import pymupdf
from PIL import Image

BASE_DIR = Path(r"c:\Users\lmnaz\OneDrive\Desktop\Repositório Github\Projeto-Poker")
PDF_PATH = BASE_DIR / "PDF - Ranges RFI e vs RFI.pdf"
OUT_PATH = BASE_DIR / "app" / "src" / "data" / "ranges_gto.json"

RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]

# Sequência canônica exata dos 36 spots por stack no PDF (corrige 4 typos do PDF original)
CANONICAL_SPOTS = [
    ("RFI UTG", "UTG", None, "rfi"),
    ("MP vs UTG RFI", "MP", "UTG", "vs_rfi"),
    ("LJ vs UTG RFI", "LJ", "UTG", "vs_rfi"),
    ("HJ vs UTG RFI", "HJ", "UTG", "vs_rfi"),
    ("CO vs UTG RFI", "CO", "UTG", "vs_rfi"),
    ("BTN vs UTG RFI", "BTN", "UTG", "vs_rfi"),
    ("SB vs UTG RFI", "SB", "UTG", "vs_rfi"),
    ("BB vs UTG RFI", "BB", "UTG", "vs_rfi"),
    ("RFI MP", "MP", None, "rfi"),
    ("LJ vs MP RFI", "LJ", "MP", "vs_rfi"),
    ("HJ vs MP RFI", "HJ", "MP", "vs_rfi"),
    ("CO vs MP RFI", "CO", "MP", "vs_rfi"),
    ("BTN vs MP RFI", "BTN", "MP", "vs_rfi"),
    ("SB vs MP RFI", "SB", "MP", "vs_rfi"),
    ("BB vs MP RFI", "BB", "MP", "vs_rfi"),
    ("RFI LJ", "LJ", None, "rfi"),
    ("HJ vs LJ RFI", "HJ", "LJ", "vs_rfi"),
    ("CO vs LJ RFI", "CO", "LJ", "vs_rfi"),
    ("BTN vs LJ RFI", "BTN", "LJ", "vs_rfi"),
    ("SB vs LJ RFI", "SB", "LJ", "vs_rfi"),
    ("BB vs LJ RFI", "BB", "LJ", "vs_rfi"),
    ("RFI HJ", "HJ", None, "rfi"),
    ("CO vs HJ RFI", "CO", "HJ", "vs_rfi"),
    ("BTN vs HJ RFI", "BTN", "HJ", "vs_rfi"),
    ("SB vs HJ RFI", "SB", "HJ", "vs_rfi"),
    ("BB vs HJ RFI", "BB", "HJ", "vs_rfi"),
    ("RFI CO", "CO", None, "rfi"),
    ("BTN vs CO RFI", "BTN", "CO", "vs_rfi"),
    ("SB vs CO RFI", "SB", "CO", "vs_rfi"),
    ("BB vs CO RFI", "BB", "CO", "vs_rfi"),
    ("RFI BTN", "BTN", None, "rfi"),
    ("SB vs BTN RFI", "SB", "BTN", "vs_rfi"),
    ("BB vs BTN RFI", "BB", "BTN", "vs_rfi"),
    ("RFI SB", "SB", None, "rfi"),
    ("BB vs SB RFI", "BB", "SB", "vs_rfi"),
    ("BB vs SB Limp", "BB", "SB", "vs_limp"),
]

# Paleta fixa do solver nas imagens do PDF
PALETTE = {
    "crimson_4": (171, 23, 23),   # All-in quando há 4 tons de vermelho
    "crimson_3": (194, 41, 41),   # Raise grande quando há 3-4 tons
    "crimson_2": (216, 59, 59),   # All-in / 3-bet / Raise maior (quando há 2 tons)
    "coral_1":   (245, 83, 83),   # Raise padrão / Open / 3-bet menor
    "green":     (90, 185, 102),  # Call / Check / Limp
    "blue":      (59, 128, 155),  # Fold
}


def cell_hand_and_combos(r: int, c: int):
    if r == c:
        return RANKS[r] + RANKS[c], 6
    if r < c:
        return RANKS[r] + RANKS[c] + "s", 4
    return RANKS[c] + RANKS[r] + "o", 12


def classify_rgb(r: int, g: int, b: int):
    best_k = None
    best_d = 999999
    for k, (pr, pg, pb) in PALETTE.items():
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < best_d:
            best_d = d
            best_k = k
    return best_k if best_d < 3600 else None


def find_grid_bounds(pil: Image.Image):
    w, h = pil.size
    px = pil.load()

    # Linhas verticais escuras da grade (x0..~1114)
    v_candidates = []
    for x in range(int(w * 0.65)):
        dark = 0
        for y in range(25, h - 25, 15):
            r, g, b = px[x, y]
            if max(r, g, b) < 95 and abs(r - g) < 18 and abs(g - b) < 18:
                dark += 1
        if dark >= (h - 50) // 15 * 0.78:
            v_candidates.append(x)

    vlines = []
    for x in v_candidates:
        if not vlines or x - vlines[-1][-1] > 10:
            vlines.append([x])
        else:
            vlines[-1].append(x)
    v_centers = [int(sum(g) / len(g)) for g in vlines]
    x_right = [x for x in v_centers if 1070 <= x <= 1140]
    x0 = 0
    x1 = x_right[0] if x_right else 1114

    h_candidates = []
    for y in range(h):
        dark = 0
        for x in range(20, x1 - 20, 20):
            r, g, b = px[x, y]
            if max(r, g, b) < 95 and abs(r - g) < 18 and abs(g - b) < 18:
                dark += 1
        if dark >= (x1 - 40) // 20 * 0.78:
            h_candidates.append(y)

    hlines = []
    for y in h_candidates:
        if not hlines or y - hlines[-1][-1] > 10:
            hlines.append([y])
        else:
            hlines[-1].append(y)
    h_centers = [int(sum(g) / len(g)) for g in hlines]
    y0 = h_centers[0] if h_centers and h_centers[0] < 10 else 0
    inner_h = [y for y in h_centers if 55 <= y <= 75]
    if inner_h:
        row_h = inner_h[0] - y0
        y1 = min(h, int(round(y0 + row_h * 13)))
    else:
        y1 = h
    return x0, y0, x1, y1


def detect_legend_colors(pil: Image.Image):
    """Detecta quais cores de ação aparecem nas caixas da legenda (canto superior direito)."""
    w, h = pil.size
    px = pil.load()
    found = Counter()
    for y in range(int(h * 0.08), int(h * 0.29), 6):
        for x in range(int(w * 0.59), w - 8, 8):
            k = classify_rgb(*px[x, y])
            if k:
                found[k] += 1
    return {k for k, cnt in found.items() if cnt >= 12}


def extract_matrix(pil: Image.Image):
    x0, y0, x1, y1 = find_grid_bounds(pil)
    px = pil.load()
    cw = (x1 - x0) / 13.0
    ch = (y1 - y0) / 13.0

    cells = {}
    totals = Counter()

    for r in range(13):
        for c in range(13):
            hand, combos = cell_hand_and_combos(r, c)
            # +1 para pular a borda de 1px sem cortar barras finas na esquerda
            cx0 = int(round(x0 + c * cw)) + 1
            cx1 = int(round(x0 + (c + 1) * cw))
            # Faixa central limpa entre o nome da mão (topo) e o EV (rodapé)
            cy0 = int(round(y0 + r * ch + ch * 0.42))
            cy1 = int(round(y0 + r * ch + ch * 0.62))

            col_counts = Counter()
            for x in range(cx0, cx1):
                votes = Counter()
                for y in range(cy0, cy1):
                    k = classify_rgb(*px[x, y])
                    if k:
                        votes[k] += 1
                if votes:
                    col_counts[votes.most_common(1)[0][0]] += 1

            tot = sum(col_counts.values()) or 1
            dist = {}
            for k, v in col_counts.items():
                pct = round(v / tot, 4)
                if pct >= 0.01:
                    dist[k] = pct
                    totals[k] += combos * (v / tot)

            # Normaliza para somar exatamente 1.0
            s = sum(dist.values())
            if s > 0:
                dist = {k: round(v / s, 3) for k, v in dist.items()}
            cells[hand] = dist

    summary = {k: round(v / 1326.0 * 100, 1) for k, v in totals.items()}
    return cells, summary


def parse_stack_pages(doc: pymupdf.Document):
    # Mapeia cada stack às suas páginas de conteúdo
    stack_blocks = []
    cur_stack = None
    for pg_idx in range(8, len(doc) - 1):  # ignora capa/intro (1-8) e banner final (123)
        page = doc[pg_idx]
        txt = page.get_text()
        m = re.search(r"(\d+)\s+big blinds efetivos", txt, re.IGNORECASE)
        if m and len([im for im in page.get_images(full=True) if im[2] > 600]) == 0:
            cur_stack = int(m.group(1))
            stack_blocks.append((cur_stack, []))
        elif cur_stack is not None:
            big_imgs = [im for im in page.get_images(full=True) if im[2] > 600]
            # Ordena imagens de cima para baixo pela posição Y na página
            img_infos = []
            for im in big_imgs:
                xref = im[0]
                rects = page.get_image_rects(xref)
                y_top = rects[0].y0 if rects else 0
                img_infos.append((y_top, xref))
            img_infos.sort(key=lambda t: t[0])
            for _, xref in img_infos:
                stack_blocks[-1][1].append((pg_idx + 1, xref, txt))
    return stack_blocks


def parse_action_labels(
    spot_type: str,
    stack: int,
    present_keys: set,
    spot_name: str,
    spot_summary_line: str,
):
    """
    Mapeia apenas as cores realmente presentes na matriz (sem botões 0%) para rótulos
    claros de ação com base no tipo de spot, stack e texto da página.
    """
    reds = [k for k in ["crimson_4", "crimson_3", "crimson_2", "coral_1"] if k in present_keys]
    mapping = {}
    low_meta = spot_summary_line.lower()
    has_allin_meta = ("all-in" in low_meta) or ("all in" in low_meta) or ("shove" in low_meta)

    if "green" in present_keys:
        if spot_type == "rfi":
            mapping["green"] = "Limp" if "SB" in spot_name else "Call"
        elif spot_type == "vs_limp":
            mapping["green"] = "Check"
        else:
            mapping["green"] = "Call"

    if "blue" in present_keys:
        mapping["blue"] = "Fold"

    if spot_type == "rfi":
        if len(reds) == 1:
            mapping[reds[0]] = "Raise"
        elif len(reds) == 2:
            mapping[reds[0]] = f"Allin {stack}"
            mapping[reds[1]] = "Raise"
        elif len(reds) >= 3:
            mapping[reds[0]] = f"Allin {stack}"
            for i, rk in enumerate(reds[1:], 1):
                mapping[rk] = f"Raise ({i})"
    elif spot_type == "vs_rfi":
        if len(reds) == 1:
            mapping[reds[0]] = f"Allin {stack}" if (stack <= 17 or has_allin_meta) else "3-Bet"
        elif len(reds) == 2:
            mapping[reds[0]] = f"Allin {stack}"
            mapping[reds[1]] = "3-Bet"
        elif len(reds) >= 3:
            mapping[reds[0]] = f"Allin {stack}"
            for i, rk in enumerate(reds[1:], 1):
                mapping[rk] = f"3-Bet ({i})"
    elif spot_type == "vs_limp":
        if len(reds) == 1:
            mapping[reds[0]] = "Raise"
        elif len(reds) == 2:
            mapping[reds[0]] = f"Allin {stack}" if (stack <= 30 or has_allin_meta) else "Raise Big"
            mapping[reds[1]] = "Raise"
        elif len(reds) == 3:
            mapping[reds[0]] = f"Allin {stack}" if (stack <= 30 or has_allin_meta) else "Raise Large"
            mapping[reds[1]] = "Raise Big"
            mapping[reds[2]] = "Raise"
        elif len(reds) >= 4:
            mapping[reds[0]] = f"Allin {stack}"
            mapping[reds[1]] = "Raise Large"
            mapping[reds[2]] = "Raise Big"
            mapping[reds[3]] = "Raise"

    return mapping


def action_color_hex(action_name: str, color_key: str = "") -> str:
    if color_key == "crimson_4":
        return "#991b1b"
    if color_key == "crimson_3":
        return "#b91c1c"
    if color_key == "crimson_2":
        return "#dc2626"
    if color_key == "coral_1":
        return "#f43f5e"
    low = action_name.lower()
    if "allin" in low or "shove" in low:
        return "#dc2626"
    if "large" in low or "big" in low:
        return "#b91c1c"
    if "raise" in low or "3-bet" in low or "bet" in low:
        return "#f43f5e"
    if "limp" in low:
        return "#eab308"
    if "call" in low or "check" in low:
        return "#22c55e"
    return "#3b82f6"


def extract_spot_meta_for_image(page_text: str, spot_pos_on_page: int) -> str:
    """Extrai o trecho de texto da página correspondente à 1ª ou 2ª imagem."""
    lines = [
        l.strip()
        for l in page_text.splitlines()
        if l.strip()
        and "Comunidade" not in l
        and "YouTube" not in l
        and "distribuição" not in l
    ]
    blocks = []
    cur = []
    for l in lines:
        if re.match(r"^\d+\s*bbs\s*-", l, re.IGNORECASE):
            if cur:
                blocks.append(" | ".join(cur))
            cur = [l]
        else:
            cur.append(l)
    if cur:
        blocks.append(" | ".join(cur))
    if spot_pos_on_page < len(blocks):
        return blocks[spot_pos_on_page]
    return " | ".join(lines)


def extract_pdf_ranges():
    doc = pymupdf.open(PDF_PATH)
    stack_blocks = parse_stack_pages(doc)
    spots_out = []

    for stack, img_list in stack_blocks:
        print(f"Processando stack {stack}bb: {len(img_list)} imagens encontradas...")
        page_img_counter = Counter()
        for idx, (pg_num, xref, page_text) in enumerate(img_list):
            if idx >= len(CANONICAL_SPOTS):
                print(f"  AVISO: imagem extra na pag {pg_num} (idx={idx}), ignorada.")
                continue
            pos_on_page = page_img_counter[pg_num]
            page_img_counter[pg_num] += 1
            meta_line = extract_spot_meta_for_image(page_text, pos_on_page)

            spot_title, hero_pos, villain_pos, spot_type = CANONICAL_SPOTS[idx]
            base = doc.extract_image(xref)
            pil = Image.open(io.BytesIO(base["image"])).convert("RGB")

            cells, raw_summary = extract_matrix(pil)
            present_keys = {k for k, v in raw_summary.items() if v > 0.0}
            color_map = parse_action_labels(
                spot_type, stack, present_keys, spot_title, meta_line
            )

            # Mapeia nome de ação -> cor hex distinta
            name_to_hex = {}
            for ck, aname in color_map.items():
                name_to_hex[aname] = action_color_hex(aname, ck)

            # Converte chaves de cor internas para nomes de ação reais
            named_cells = {}
            for hand, dist in cells.items():
                nd = {}
                for ck, prob in dist.items():
                    if ck not in color_map:
                        continue
                    aname = color_map[ck]
                    nd[aname] = round(nd.get(aname, 0.0) + prob, 3)
                if not nd:
                    nd = {"Fold": 1.0}
                named_cells[hand] = nd

            named_summary = {}
            for ck, pct in raw_summary.items():
                if ck not in color_map:
                    continue
                aname = color_map[ck]
                named_summary[aname] = round(named_summary.get(aname, 0.0) + pct, 1)

            # Ordena ações: agressivas -> passivas -> fold
            def sort_key(a):
                al = a.lower()
                if "allin" in al or "shove" in al:
                    return (0, a)
                if "large" in al or "big" in al:
                    return (1, a)
                if "raise" in al or "3-bet" in al:
                    return (2, a)
                if "limp" in al or "call" in al or "check" in al:
                    return (3, a)
                return (4, a)

            ordered_actions = sorted(set(color_map.values()), key=sort_key)

            # Gera ID único amigável
            slug = spot_title.lower().replace(" ", "_")
            spot_id = f"{stack}bb_{slug}"

            spots_out.append({
                "id": spot_id,
                "name": f"{stack}BB - {spot_title}",
                "stackBb": stack,
                "heroPosition": hero_pos,
                "villainPosition": villain_pos,
                "spotType": spot_type,
                "source": f"PDF - Ranges RFI e vs RFI.pdf (pág. {pg_num})",
                "actions": [
                    {
                        "name": a,
                        "color": name_to_hex.get(a, action_color_hex(a)),
                        "pct": named_summary.get(a, 0.0),
                    }
                    for a in ordered_actions
                ],
                "matrix": named_cells,
            })

    return spots_out


def expand_hand_notation(token: str):
    """Expande notação de range tipo '22+', 'A5s+', 'K9o+', 'Ax', '98s' para lista de mãos 13x13."""
    token = token.strip().replace(",", "")
    if not token:
        return []
    if token.lower() in ("ax", "kx", "qx", "jx", "tx"):
        hi = token[0].upper()
        hi_idx = RANKS.index(hi)
        res = []
        for lo_idx in range(hi_idx + 1, 13):
            res.append(hi + RANKS[lo_idx] + "s")
            res.append(hi + RANKS[lo_idx] + "o")
        return res

    # Ex: '22+' -> todos os pares >= 22
    m_pair = re.fullmatch(r"([AKQJT2-9])\1(\+?)", token)
    if m_pair:
        r = m_pair.group(1)
        idx = RANKS.index(r)
        if m_pair.group(2) == "+":
            return [RANKS[i] * 2 for i in range(0, idx + 1)]
        return [r * 2]

    # Ex: 'A8s+' ou 'KTo+'
    m_hand = re.fullmatch(r"([AKQJT2-9])([AKQJT2-9])([so])(\+?)", token)
    if m_hand:
        r1, r2, so, plus = m_hand.groups()
        i1, i2 = RANKS.index(r1), RANKS.index(r2)
        if plus == "+":
            return [r1 + RANKS[j] + so for j in range(i1 + 1, i2 + 1)]
        return [r1 + r2 + so]

    return []


def build_spin_and_go_spots():
    """
    Constrói os spots estruturados de Spin & Go (15, 10, 5, 3 BBs) presentes nos charts PNG
    da pasta '4. Pré-Flop/' (Felipe Carmanhani - Spin & Go Profissional).
    """
    all_169 = []
    for r in range(13):
        for c in range(13):
            h, _ = cell_hand_and_combos(r, c)
            all_169.append(h)

    raw_charts = [
        # (id, nome, stack, hero, villain, spotType, action_name, range_expr, source)
        ("spin_15bb_btn_shove", "Spin&Go 15BB - BTN Shove", 15, "BTN", None, "push_fold", "Allin 15",
         "22+ A2s+ A5o+ K8s+ KTo+ Q9s+ QTo+ J8s+ JTo T8s+ 98s 87s", "4. Pré-Flop/Botão.png"),
        ("spin_10bb_btn_shove", "Spin&Go 10BB - BTN Shove", 10, "BTN", None, "push_fold", "Allin 10",
         "22+ Ax K5s+ KTo+ Q8s+ QTo+ J8s+ JTo T7s+ 97s+ 87s 76s", "4. Pré-Flop/Botão.png"),
        ("spin_5bb_btn_shove", "Spin&Go 5BB - BTN Shove", 5, "BTN", None, "push_fold", "Allin 5",
         "22+ Ax K2s+ K5o+ Q5s+ Q9o+ J7s+ J9o+ T7s+ 97s+ 87s 76s", "4. Pré-Flop/Botão.png"),
        ("spin_3bb_btn_shove", "Spin&Go 3BB - BTN Shove", 3, "BTN", None, "push_fold", "Allin 3",
         "22+ Ax K2s+ K5o+ Q4s+ Q8o+ J7s+ J9o+ T9s T9o 98s", "4. Pré-Flop/Botão.png"),

        ("spin_15bb_co_shove", "Spin&Go 15BB - CO Shove", 15, "CO", None, "push_fold", "Allin 15",
         "22+ A3s+ ATo+ K9s+ KJo+ Q9s+ QJo J9s+ T9s 98s", "4. Pré-Flop/Cutoff.png"),
        ("spin_10bb_co_shove", "Spin&Go 10BB - CO Shove", 10, "CO", None, "push_fold", "Allin 10",
         "22+ A2s+ A7o+ K8s+ KTo+ Q9s+ QJo J8s+ JTo T8s+ 98s 87s", "4. Pré-Flop/Cutoff.png"),
        ("spin_5bb_co_shove", "Spin&Go 5BB - CO Shove", 5, "CO", None, "push_fold", "Allin 5",
         "22+ Ax K4s+ K9o+ Q8s+ QTo+ J8s+ JTo T8s+ 97s+ 87s", "4. Pré-Flop/Cutoff.png"),

        ("spin_15bb_btn_call", "Spin&Go 15BB - BTN vs Shove Call", 15, "BTN", "CO", "vs_shove", "Call",
         "66+ ATs+ AJo+ KQs", "4. Pré-Flop/Botao - Call.png"),
        ("spin_10bb_btn_call", "Spin&Go 10BB - BTN vs Shove Call", 10, "BTN", "CO", "vs_shove", "Call",
         "55+ A8s+ A9o+ KJs+ KQo", "4. Pré-Flop/Botao - Call.png"),
        ("spin_5bb_btn_call", "Spin&Go 5BB - BTN vs Shove Call", 5, "BTN", "CO", "vs_shove", "Call",
         "33+ A3s+ A7o+ KTs+ KJo QTs+", "4. Pré-Flop/Botao - Call.png"),

        ("spin_15bb_bb_call", "Spin&Go 15BB - BB vs Shove Call", 15, "BB", "SB", "vs_shove", "Call",
         "33+ Ax K8s+ K9o+ QTs+ QTo+ JTs", "4. Pré-Flop/BigBlind - Call.png"),
        ("spin_10bb_bb_call", "Spin&Go 10BB - BB vs Shove Call", 10, "BB", "SB", "vs_shove", "Call",
         "22+ Ax K2s+ K6o+ Q7s+ Q9o+ J8s+ JTo T9s", "4. Pré-Flop/BigBlind - Call.png"),
        ("spin_5bb_bb_call", "Spin&Go 5BB - BB vs Shove Call", 5, "BB", "SB", "vs_shove", "Call",
         "22+ Ax Kx Qx J2s+ J6o+ T5s+ T7o+ 96s+ 98o+ 86s+ 76s", "4. Pré-Flop/BigBlind - Call.png"),
    ]

    spots = []
    for sid, sname, stack, hero, villain, stype, aname, expr, src in raw_charts:
        active = set()
        for tok in expr.split():
            active.update(expand_hand_notation(tok))

        matrix = {}
        active_combos = 0
        for r in range(13):
            for c in range(13):
                h, combos = cell_hand_and_combos(r, c)
                if h in active:
                    matrix[h] = {aname: 1.0}
                    active_combos += combos
                else:
                    matrix[h] = {"Fold": 1.0}

        apct = round(active_combos / 1326.0 * 100, 1)
        fpct = round(100.0 - apct, 1)
        spots.append({
            "id": sid,
            "name": sname,
            "stackBb": stack,
            "heroPosition": hero,
            "villainPosition": villain,
            "spotType": stype,
            "source": src,
            "actions": [
                {"name": aname, "color": action_color_hex(aname), "pct": apct},
                {"name": "Fold", "color": action_color_hex("Fold"), "pct": fpct},
            ],
            "matrix": matrix,
        })
    return spots


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf_spots = extract_pdf_ranges()
    spin_spots = build_spin_and_go_spots()
    all_spots = pdf_spots + spin_spots

    payload = {
        "version": "1.0.0",
        "totalSpots": len(all_spots),
        "stacks": sorted({s["stackBb"] for s in all_spots}),
        "spots": all_spots,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"\nCONCLUIDO! {len(all_spots)} spots salvos em {OUT_PATH}")
    print(f"Stacks disponíveis: {payload['stacks']}")


if __name__ == "__main__":
    main()
