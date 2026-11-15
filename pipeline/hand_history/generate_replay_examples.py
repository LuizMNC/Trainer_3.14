"""Gera exemplos do replayer pelo importador real, sem inventar animações/estados.

Execute da raiz: python -m pipeline.hand_history.generate_replay_examples
"""
from hashlib import sha256
import json
from pathlib import Path
import os
from tempfile import NamedTemporaryFile

from .importer import import_phh

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = [
    ("hu_fold", "Heads-up · fold e devolução"),
    ("decimal_fold", "Valores em centésimos"),
    ("three_way_allin", "Três all-ins · dois potes"),
    ("folded_sidepot", "Side pot · contribuição de jogador em fold"),
    ("split_odd_ante", "Empate · ante e ficha indivisível"),
    ("showdown_muck", "Showdown · muck"),
    ("partial_flop", "Prefixo parcial · flop"),
    ("late_reveal", "Cartas desconhecidas · revelação no showdown"),
]


def atomic_write(path: Path, content: bytes) -> None:
    """Nunca expõe um JSON parcialmente escrito ao servidor/compilador local."""
    temporary: Path | None = None
    try:
        with NamedTemporaryFile(dir=path.parent, prefix="." + path.name + ".", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            file.write(content)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> None:
    output = ROOT / "app/public/replays"
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, label in EXAMPLES:
        raw = (Path(__file__).parent / "fixtures" / (name + ".phh")).read_bytes()
        result = import_phh(raw, name + ".phh")
        if not result["ok"]:
            raise RuntimeError(result["issues"])
        canonical = result["hand"]
        serialized = (json.dumps(canonical, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        atomic_write(output / (name + ".json"), serialized)
        manifest.append({"id": name, "label": label, "path": "/replays/" + name + ".json",
                         "canonicalSha256": sha256(serialized).hexdigest(), "sourceSha256": sha256(raw).hexdigest(),
                         "status": result["status"], "source": "Fixture sintética de regras; não é estratégia GTO."})
    atomic_write(ROOT / "app/src/data/replayExamples.json", (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    invalid = import_phh((Path(__file__).parent / "fixtures/invalid_missing_call.phh").read_bytes())
    assert not invalid["ok"]
    atomic_write(output / "invalid_missing_call.json", (json.dumps(invalid, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f"{len(manifest)} exemplos canônicos e um diagnóstico inválido gerados pelo pipeline.")


if __name__ == "__main__":
    main()
