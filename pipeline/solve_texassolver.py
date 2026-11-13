#!/usr/bin/env python3
"""
Executor reproduzível de cenários Hold'em pós-flop via TexasSolver CLI (AGPL-3.0).

Gera o arquivo de configuração a partir dos ranges rastreáveis em
`app/src/data/ranges_gto.json`, executa `console_solver.exe` externamente
(sem embutir binários no repositório), coleta o log JSONL de convergência,
calcula hashes SHA-256 e exporta o pacote auditável com frequências agregadas
por classe (169) e detalhamento por combo real (excluindo cartas mortas do board).

IMPORTANTE: TexasSolver v0.2.0 CLI (`dump_result`) exporta apenas frequências
de equilíbrio (`strategy`), não exporta EV por ação (`matrixEv`). Este script
preserva `matrixEv = null` e NUNCA inventa ou aproxima EVs.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Any

RANKS = "AKQJT98765432"
SUITS = "shdc"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def combo_to_hand_class(combo: str) -> str:
    """Converte combo de 4 caracteres (ex: 'AsKc', 'KsAs') na classe canônica ('AKo', 'AKs')."""
    if len(combo) != 4:
        raise ValueError(f"Combo inválido: {combo!r}")
    r1, s1, r2, s2 = combo[0], combo[1], combo[2], combo[3]
    i1, i2 = RANKS.index(r1), RANKS.index(r2)
    if i1 > i2:
        r1, r2 = r2, r1
        s1, s2 = s2, s1
    if r1 == r2:
        return f"{r1}{r2}"
    return f"{r1}{r2}{'s' if s1 == s2 else 'o'}"


def expected_live_combos(hand_class: str, dead_cards: set[str]) -> list[str]:
    """Enumera os combos exatos possíveis para a classe excluindo cartas do board."""
    r1, r2 = hand_class[0], hand_class[1]
    combos: list[str] = []
    if len(hand_class) == 2:
        for i, s1 in enumerate(SUITS):
            c1 = f"{r1}{s1}"
            if c1 in dead_cards:
                continue
            for s2 in SUITS[i + 1 :]:
                c2 = f"{r2}{s2}"
                if c2 not in dead_cards:
                    combos.append(f"{c1}{c2}")
    elif hand_class.endswith("s"):
        for s in SUITS:
            c1, c2 = f"{r1}{s}", f"{r2}{s}"
            if c1 not in dead_cards and c2 not in dead_cards:
                combos.append(f"{c1}{c2}")
    else:
        for s1 in SUITS:
            c1 = f"{r1}{s1}"
            if c1 in dead_cards:
                continue
            for s2 in SUITS:
                if s1 == s2:
                    continue
                c2 = f"{r2}{s2}"
                if c2 not in dead_cards:
                    combos.append(f"{c1}{c2}")
    return combos


def format_texassolver_range(matrix: dict[str, dict[str, float]], action_key: str) -> tuple[str, dict[str, float]]:
    parts: list[str] = []
    weights: dict[str, float] = {}
    for hand, dist in matrix.items():
        w = float(dist.get(action_key, 0.0))
        if w > 0.0:
            w_rounded = 1.0 if w >= 0.9999 else round(w, 4)
            weights[hand] = w_rounded
            parts.append(hand if w_rounded >= 0.9999 else f"{hand}:{w_rounded:.3f}")
    return ",".join(parts), weights


def action_label_from_texassolver(raw_action: str, pot_units: float, scale_factor: float) -> dict[str, Any]:
    raw_up = raw_action.strip().upper()
    if raw_up == "CHECK":
        return {"rawAction": raw_action, "actionName": "Check", "color": "#22c55e", "sizeBb": 0.0, "sizePctPot": 0.0}
    if raw_up == "FOLD":
        return {"rawAction": raw_action, "actionName": "Fold", "color": "#3b82f6", "sizeBb": 0.0, "sizePctPot": 0.0}
    if raw_up == "CALL":
        return {"rawAction": raw_action, "actionName": "Call", "color": "#22c55e"}
    if raw_up.startswith("BET ") or raw_up.startswith("RAISE "):
        parts = raw_up.split()
        amt_units = float(parts[1])
        size_bb = round(amt_units / scale_factor, 3)
        pct = round((amt_units / pot_units) * 100.0, 1)
        if abs(pct - 33.3) <= 2.5:
            canonical_name = "Bet_33pct" if raw_up.startswith("BET") else "Raise_33pct"
            color = "#f43f5e"
        elif abs(pct - 75.0) <= 3.0:
            canonical_name = "Bet_75pct" if raw_up.startswith("BET") else "Raise_75pct"
            color = "#dc2626"
        else:
            canonical_name = f"{'Bet' if raw_up.startswith('BET') else 'Raise'}_{round(pct)}pct"
            color = "#ef4444"
        return {
            "rawAction": raw_action,
            "actionName": canonical_name,
            "color": color,
            "sizeBb": size_bb,
            "sizePctPot": pct,
        }
    return {"rawAction": raw_action, "actionName": raw_action, "color": "#a855f7"}


def read_win_memory_mb(pid: int) -> tuple[float, float] | None:
    if sys.platform != "win32":
        return None
    ps = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f"Get-Process -Id {pid} -ErrorAction SilentlyContinue | Select-Object WorkingSet64, PrivateMemorySize64 | ConvertTo-Json",
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    if not ps:
        return None
    obj = json.loads(ps)
    ws = (obj.get("WorkingSet64") or 0) / (1024 * 1024)
    pm = (obj.get("PrivateMemorySize64") or 0) / (1024 * 1024)
    return ws, pm


def main() -> int:
    parser = argparse.ArgumentParser(description="Executa solver TexasSolver v0.2.0 para BTN vs BB SRP 30BB Ah Kd 7c.")
    parser.add_argument(
        "--solver-exe",
        default=os.environ.get("TEXASSOLVER_EXE", ""),
        help="Caminho para console_solver.exe externo (ou variável TEXASSOLVER_EXE).",
    )
    parser.add_argument("--ranges-json", default="app/src/data/ranges_gto.json")
    parser.add_argument("--output-dir", default="pipeline/solver_runs/ahkd7c_btn_vs_bb_30bb_srp")
    parser.add_argument("--board", default="Ah,Kd,7c")
    parser.add_argument("--pot-bb", type=float, default=5.7)
    parser.add_argument("--effective-stack-bb", type=float, default=27.9)
    parser.add_argument("--scale-factor", type=float, default=10.0, help="Fator de escala para evitar arredondamento inteiro grosseiro do TexasSolver (ex: 10 => 0.1bb/unidade).")
    parser.add_argument("--ip-flop-bets", default="33,75")
    parser.add_argument("--max-iterations", type=int, default=100)
    parser.add_argument("--accuracy", type=float, default=0.5)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--print-interval", type=int, default=10)
    parser.add_argument("--max-pm-mb", type=float, default=2300.0)
    parser.add_argument("--timeout-sec", type=int, default=900)
    args = parser.parse_args()

    if not args.solver_exe:
        print("ERRO: informe --solver-exe ou defina TEXASSOLVER_EXE apontando para console_solver.exe.", file=sys.stderr)
        return 2

    solver_exe = Path(args.solver_exe).resolve()
    if not solver_exe.exists():
        print(f"ERRO: console_solver.exe não encontrado em {solver_exe}", file=sys.stderr)
        return 2

    solver_dir = solver_exe.parent
    resources_dir = solver_dir / "resources"
    if not resources_dir.is_dir():
        print(f"ERRO: diretório resources não encontrado em {resources_dir}", file=sys.stderr)
        return 2

    ranges_path = Path(args.ranges_json).resolve()
    ranges_data = json.loads(ranges_path.read_text(encoding="utf-8"))
    spots_by_id = {s["id"]: s for s in ranges_data["spots"]}
    btn_spot = spots_by_id["30bb_rfi_btn"]
    bb_spot = spots_by_id["30bb_bb_vs_btn_rfi"]

    ip_range_str, ip_weights = format_texassolver_range(btn_spot["matrix"], "Raise")
    oop_range_str, oop_weights = format_texassolver_range(bb_spot["matrix"], "Call")

    board_cards = [c.strip() for c in args.board.split(",") if c.strip()]
    if len(board_cards) != 3:
        raise ValueError(f"Board deve ter 3 cartas no flop: {board_cards}")
    dead_cards = set(board_cards)

    pot_units = round(args.pot_bb * args.scale_factor)
    stack_units = round(args.effective_stack_bb * args.scale_factor)

    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = out_dir / "solver_input.txt"
    raw_dump_in_solver = solver_dir / "tmp_solve_output.json"
    tmp_log_in_solver = solver_dir / "tmp_log.txt"

    for p in (raw_dump_in_solver, tmp_log_in_solver):
        if p.exists():
            p.unlink()

    cfg_lines = [
        f"set_pot {pot_units}",
        f"set_effective_stack {stack_units}",
        f"set_board {','.join(board_cards)}",
        f"set_range_ip {ip_range_str}",
        f"set_range_oop {oop_range_str}",
        "set_bet_sizes oop,flop,raise,100",
        f"set_bet_sizes ip,flop,bet,{args.ip_flop_bets}",
        "set_bet_sizes ip,flop,raise,100",
        "set_bet_sizes oop,turn,bet,66",
        "set_bet_sizes oop,turn,raise,100",
        "set_bet_sizes ip,turn,bet,66",
        "set_bet_sizes ip,turn,raise,100",
        "set_bet_sizes oop,river,bet,75",
        "set_bet_sizes oop,river,raise,100",
        "set_bet_sizes ip,river,bet,75",
        "set_bet_sizes ip,river,raise,100",
        "set_allin_threshold 0.67",
        "build_tree",
        f"set_thread_num {args.threads}",
        f"set_accuracy {args.accuracy}",
        f"set_max_iteration {args.max_iterations}",
        f"set_print_interval {args.print_interval}",
        "set_use_isomorphism 1",
        "start_solve",
        "set_dump_rounds 1",
        f"dump_result {raw_dump_in_solver.name}",
    ]
    cfg_path.write_text("\n".join(cfg_lines) + "\n", encoding="utf-8", newline="\n")

    stdout_log_path = out_dir / "solver_stdout.log"
    t0 = time.time()
    max_ws_mb = 0.0
    max_pm_mb = 0.0
    aborted_reason: str | None = None

    with stdout_log_path.open("w", encoding="utf-8") as lf:
        proc = subprocess.Popen(
            [str(solver_exe), "--input_file", str(cfg_path), "--resource_dir", "resources", "--mode", "holdem"],
            cwd=str(solver_dir),
            stdin=subprocess.DEVNULL,
            stdout=lf,
            stderr=subprocess.STDOUT,
        )
        while proc.poll() is None:
            mem = read_win_memory_mb(proc.pid)
            if mem is not None:
                ws, pm = mem
                max_ws_mb = max(max_ws_mb, ws)
                max_pm_mb = max(max_pm_mb, pm)
                print(f"[{time.time()-t0:5.1f}s] WS={ws:.0f}MB PM={pm:.0f}MB", flush=True)
                if pm > args.max_pm_mb:
                    aborted_reason = f"Commit memory {pm:.0f}MB exceeded limit {args.max_pm_mb:.0f}MB"
                    proc.kill()
                    break
            if time.time() - t0 > args.timeout_sec:
                aborted_reason = f"Timeout after {args.timeout_sec}s"
                proc.kill()
                break
            time.sleep(3.0)

    elapsed = round(time.time() - t0, 2)
    if aborted_reason or proc.returncode != 0:
        print(f"ERRO na execução do solver: returncode={proc.returncode} reason={aborted_reason}", file=sys.stderr)
        return 1

    raw_output_path = out_dir / "texassolver_raw.json"
    conv_log_path = out_dir / "convergence_log.jsonl"
    shutil.move(str(raw_dump_in_solver), str(raw_output_path))
    if tmp_log_in_solver.exists():
        shutil.move(str(tmp_log_in_solver), str(conv_log_path))

    # Parseia o nó de decisão C-Bet IP do BTN (OOP check -> IP decision)
    raw_tree = json.loads(raw_output_path.read_text(encoding="utf-8"))
    if raw_tree.get("player") != 1 or "CHECK" not in raw_tree.get("childrens", {}):
        raise RuntimeError("Estrutura inesperada na raiz do dump TexasSolver: esperado OOP root -> CHECK -> IP.")

    ip_node = raw_tree["childrens"]["CHECK"]
    if ip_node.get("player") != 0:
        raise RuntimeError(f"Esperado nó IP (player=0) após OOP CHECK, obtido player={ip_node.get('player')}.")

    strat_block = ip_node["strategy"]
    raw_actions: list[str] = strat_block["actions"]
    combo_strategies: dict[str, list[float]] = strat_block["strategy"]

    action_specs = [action_label_from_texassolver(a, pot_units, args.scale_factor) for a in raw_actions]
    canonical_action_names = [a["actionName"] for a in action_specs]

    # Valida zero cartas mortas e agrega combos reais em classes (média uniforme sobre combos válidos no nó)
    grouped: dict[str, list[tuple[str, list[float]]]] = defaultdict(list)
    for combo, probs in combo_strategies.items():
        c1, c2 = combo[:2], combo[2:]
        if c1 in dead_cards or c2 in dead_cards:
            raise ValueError(f"Combo ilegal com carta morta do board detectado: {combo}")
        if len(probs) != len(canonical_action_names):
            raise ValueError(f"Combo {combo} tem {len(probs)} probabilidades vs {len(canonical_action_names)} ações.")
        hc = combo_to_hand_class(combo)
        grouped[hc].append((combo, probs))

    matrix_frequencies: dict[str, dict[str, float]] = {}
    combo_breakdown: dict[str, dict[str, dict[str, float]]] = {}
    for hc in sorted(grouped.keys()):
        items = grouped[hc]
        expected_cnt = len(expected_live_combos(hc, dead_cards))
        if len(items) != expected_cnt:
            raise ValueError(f"Classe {hc}: esperado {expected_cnt} combos vivos no board {board_cards}, obtido {len(items)}.")
        sums = [0.0] * len(canonical_action_names)
        combo_breakdown[hc] = {}
        for combo, probs in items:
            combo_breakdown[hc][combo] = {canonical_action_names[i]: round(float(probs[i]), 6) for i in range(len(probs))}
            for i, p in enumerate(probs):
                sums[i] += float(p)
        avg = [round(s / len(items), 6) for s in sums]
        matrix_frequencies[hc] = {canonical_action_names[i]: avg[i] for i in range(len(avg))}

    # Parseia convergência JSONL e stdout final
    conv_records: list[dict[str, Any]] = []
    if conv_log_path.exists():
        for line in conv_log_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                conv_records.append(json.loads(line))

    stdout_text = stdout_log_path.read_text(encoding="utf-8", errors="replace").replace("\r", "\n")
    final_exploit_match = None
    for line in stdout_text.splitlines():
        if "Total exploitability" in line:
            final_exploit_match = line.strip()

    achieved_exploitability_pct: float | None = None
    if final_exploit_match:
        tokens = final_exploit_match.split()
        for idx, tok in enumerate(tokens):
            if tok.lower().startswith("exploitability") and idx + 1 < len(tokens):
                try:
                    achieved_exploitability_pct = float(tokens[idx + 1])
                except ValueError:
                    pass
    elif conv_records:
        achieved_exploitability_pct = float(conv_records[-1]["exploitibility"])

    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "schema": "texassolver_run_manifest_v1",
        "generatedAtIso": generated_at,
        "solver": {
            "name": "TexasSolver",
            "version": "0.2.0",
            "license": "AGPL-3.0",
            "executableName": solver_exe.name,
            "executableSha256": sha256_file(solver_exe),
            "evExportedByCli": False,
        },
        "scenario": {
            "spotId": "verified_texassolver_mtt_8max_30bb_btn_vs_bb_srp_ahkd7c_cbet",
            "spotName": "BTN vs BB SRP 30BB chipEV — Flop Ah Kd 7c (BTN C-Bet IP)",
            "format": "MTT",
            "variant": "NLHE",
            "playersInitial": 8,
            "postflopPlayers": 2,
            "heroPosition": "BTN",
            "villainPosition": "BB",
            "street": "FLOP",
            "board": board_cards,
            "blinds": {"sbBb": 0.5, "bbBb": 1.0},
            "anteBbPerPlayer": 0.125,
            "rakePct": 0.0,
            "startingStackBb": 30.0,
            "openRaiseBb": 2.1,
            "potSizeBb": args.pot_bb,
            "effectiveStackBb": args.effective_stack_bb,
            "solverUnitsScaleFactor": args.scale_factor,
            "actionHistory": [
                {"street": "PREFLOP", "position": "UTG", "action": "Fold"},
                {"street": "PREFLOP", "position": "MP", "action": "Fold"},
                {"street": "PREFLOP", "position": "LJ", "action": "Fold"},
                {"street": "PREFLOP", "position": "HJ", "action": "Fold"},
                {"street": "PREFLOP", "position": "CO", "action": "Fold"},
                {"street": "PREFLOP", "position": "BTN", "action": "Raise", "sizeBb": 2.1},
                {"street": "PREFLOP", "position": "SB", "action": "Fold"},
                {"street": "PREFLOP", "position": "BB", "action": "Call", "sizeBb": 2.1},
                {"street": "FLOP", "position": "BB", "action": "Check"},
            ],
            "rangesSource": {
                "file": "app/src/data/ranges_gto.json",
                "fileSha256": sha256_file(ranges_path),
                "ipSpotId": "30bb_rfi_btn",
                "ipAction": "Raise",
                "ipClassesCount": len(ip_weights),
                "ipCombosSolvedNode": len(combo_strategies),
                "oopSpotId": "30bb_bb_vs_btn_rfi",
                "oopAction": "Call",
                "oopClassesCount": len(oop_weights),
                "note": "Preflop 8-Max 30BB extracted from 'PDF - Ranges RFI e vs RFI.pdf' (BTN open 2.1bb p.82; BB vs BTN call p.83).",
            },
        },
        "treeParameters": {
            "oopFlop": "check-only (donk omitted) / check-raise 100%",
            "ipFlop": f"bet {args.ip_flop_bets}% / raise 100%",
            "turnSizes": "bet 66% / raise 100%",
            "riverSizes": "bet 75% / raise 100%",
            "allinThreshold": 0.67,
            "useIsomorphism": True,
            "resolvedNodePath": ["CHECK"],
            "nodeActions": action_specs,
        },
        "convergence": {
            "targetExploitabilityPct": args.accuracy,
            "maxIterationsConfigured": args.max_iterations,
            "achievedExploitabilityPct": achieved_exploitability_pct,
            "finalStdoutLine": final_exploit_match,
            "logRecords": conv_records,
        },
        "runtime": {
            "elapsedSeconds": elapsed,
            "threads": args.threads,
            "maxWorkingSetMb": round(max_ws_mb, 1),
            "maxPrivateMemoryMb": round(max_pm_mb, 1),
        },
        "hashes": {
            "solverInputSha256": sha256_file(cfg_path),
            "rawOutputSha256": sha256_file(raw_output_path),
            "convergenceLogSha256": sha256_file(conv_log_path) if conv_log_path.exists() else None,
            "rangesSourceSha256": sha256_file(ranges_path),
        },
    }
    (out_dir / "run_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Pacote pronto para o SolverAdapter / frontend (com matrixEv explicitamente null por limitação do TexasSolver CLI)
    canonical_bundle = {
        "schemaVersion": "1.1.0",
        "bundleType": "TEXASSOLVER_NODE_FREQUENCIES_ONLY",
        "manifest": manifest,
        "ipActionSpecs": action_specs,
        "matrixFrequencies": matrix_frequencies,
        "comboBreakdown": combo_breakdown,
        "matrixEv": None,
        "evUnit": None,
    }
    (out_dir / "canonical_bundle.json").write_text(json.dumps(canonical_bundle, indent=2), encoding="utf-8")
    print(
        f"SUCESSO: elapsed={elapsed}s max_pm={max_pm_mb:.1f}MB exploitability={achieved_exploitability_pct}% combos={len(combo_strategies)} classes={len(matrix_frequencies)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
