"""A UI deve reproduzir saídas reais do pipeline, não estados feitos à mão."""
from hashlib import sha256
from datetime import datetime
import json
from pathlib import Path
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch

from .importer import import_phh
from .generate_replay_examples import atomic_write

ROOT = Path(__file__).resolve().parents[2]


class ReplayExamplesTests(unittest.TestCase):
    def test_atomic_write_does_not_truncate_previous_file_on_failure(self):
        with TemporaryDirectory() as tmp:
            path=Path(tmp)/"example.json"
            path.write_bytes(b'{"previous":true}')
            with patch("pipeline.hand_history.generate_replay_examples.os.replace",side_effect=OSError("falha simulada")):
                with self.assertRaises(OSError):
                    atomic_write(path,b'{"new":true}')
            self.assertEqual(path.read_bytes(),b'{"previous":true}')
            self.assertEqual(list(Path(tmp).iterdir()),[path])
            atomic_write(path,b'{"new":true}')
            self.assertEqual(path.read_bytes(),b'{"new":true}')

    def test_examples_equal_pipeline_and_manifest_hashes(self):
        manifest = json.loads((ROOT / "app/src/data/replayExamples.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest),8)
        self.assertEqual(len({m["id"] for m in manifest}),8)
        for entry in manifest:
            with self.subTest(example=entry["id"]):
                raw = (Path(__file__).parent / "fixtures" / (entry["id"] + ".phh")).read_bytes()
                output = (ROOT / "app/public" / entry["path"].lstrip("/")).read_bytes()
                result = import_phh(raw, entry["id"] + ".phh")
                self.assertTrue(result["ok"])
                expected = result["hand"]
                generated = json.loads(output)
                self.assertIsNotNone(datetime.fromisoformat(generated["source"]["importedAtUtc"]).utcoffset())
                # Instantes de duas importações distintas são contexto de ingestão.
                expected["source"]["importedAtUtc"] = generated["source"]["importedAtUtc"]
                self.assertEqual(generated,expected)
                self.assertEqual(sha256(raw).hexdigest(),entry["sourceSha256"])
                self.assertEqual(sha256(output).hexdigest(),entry["canonicalSha256"])

    def test_invalid_example_has_no_canonical_hand(self):
        output=json.loads((ROOT/"app/public/replays/invalid_missing_call.json").read_text(encoding="utf-8"))
        self.assertFalse(output["ok"])
        self.assertIsNone(output["hand"])
        self.assertEqual(output["issues"][0]["code"],"ILLEGAL_ACTION")


if __name__ == "__main__":
    unittest.main()
