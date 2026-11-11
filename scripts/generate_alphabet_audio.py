#!/usr/bin/env python3
"""Generate short audio clips that pronounce each Georgian letter sound."""

import argparse
import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
tts_spec = importlib.util.spec_from_file_location("kartuli_tts", ROOT / "app" / "tts.py")
tts_helpers = importlib.util.module_from_spec(tts_spec)
tts_spec.loader.exec_module(tts_helpers)
audio_name = tts_helpers.audio_name


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Regenerate existing clips.")
    args = parser.parse_args()

    output_root = Path(os.environ.get("KARTULI_AUDIO_DIR", ROOT / "instance" / "audio")) / "ka"
    output_root.mkdir(parents=True, exist_ok=True)
    espeak = os.environ.get("ESPEAK_NG_BIN", "espeak-ng")
    letters = json.loads((ROOT / "content" / "alphabet.json").read_text(encoding="utf-8"))
    generated = 0

    for item in letters:
        text = item["letter"]
        target = output_root / audio_name("ka", text)
        if target.is_file() and target.stat().st_size and not args.force:
            continue
        with tempfile.NamedTemporaryFile(dir=output_root, suffix=".wav", delete=False) as temporary:
            temporary_path = Path(temporary.name)
        try:
            subprocess.run(
                [espeak, "-v", "ka", "-s", "138", "-z", "-w", str(temporary_path), text],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            temporary_path.replace(target)
            generated += 1
        finally:
            temporary_path.unlink(missing_ok=True)

    print(f"Terminé : {generated} sons géorgiens générés.")


if __name__ == "__main__":
    main()
