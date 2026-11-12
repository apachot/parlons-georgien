#!/usr/bin/env python3
"""Pre-generate audio for the curated Georgian and French course phrases."""

import json
import argparse
import importlib.util
import os
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kartuli_tts", ROOT / "app" / "tts.py")
tts_helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts_helpers)
audio_name = tts_helpers.audio_name
normalise_speech = tts_helpers.normalise_speech

CONTENT = ROOT / "content"


def phrases():
    found = {"ka": set(), "fr": set()}

    def visit(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"ka", "example", "sound_example", "text"} and isinstance(child, str):
                    found["ka"].add(normalise_speech(child))
                elif key in {"fr", "example_fr"} and isinstance(child, str):
                    found["fr"].add(normalise_speech(child))
                elif key == "examples" and isinstance(child, list):
                    for pair in child:
                        if isinstance(pair, list) and len(pair) >= 2:
                            found["ka"].add(normalise_speech(pair[0]))
                            found["fr"].add(normalise_speech(pair[1]))
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    for path in CONTENT.glob("*.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        if path.name == "vocabulary.json" and isinstance(data, dict):
            uncertain = set(data.get("uncertain_ids", []))
            fields = data["fields"]
            data = [dict(zip(fields, row)) for row in data["items"] if row[0] not in uncertain]
        visit(data)
    return {language: sorted(text for text in texts if text) for language, texts in found.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    output_root = Path(os.environ.get("KARTULI_AUDIO_DIR", ROOT / "instance" / "audio"))
    espeak = os.environ.get("ESPEAK_NG_BIN", "espeak-ng")
    ka_model = Path(os.environ.get(
        "PIPER_KA_MODEL",
        ROOT / "instance" / "tts-voices" / "ka_GE-natia-medium.onnx",
    ))
    fr_model = Path(os.environ.get(
        "PIPER_FR_MODEL",
        ROOT / "instance" / "tts-voices" / "fr_FR-siwis-medium.onnx",
    ))
    from piper import PiperVoice

    if not fr_model.is_file():
        raise SystemExit(f"Modèle Piper français absent : {fr_model}")
    french_voice = PiperVoice.load(str(fr_model))
    georgian_voice = None
    if ka_model.is_file():
        georgian_voice = PiperVoice.load(str(ka_model))
    audio_phrases = phrases()
    totals = {"ka": 0, "fr": 0}
    for language, texts in audio_phrases.items():
        target_dir = output_root / language
        target_dir.mkdir(parents=True, exist_ok=True)
        for text in texts:
            target = target_dir / audio_name(language, text)
            if target.is_file() and target.stat().st_size:
                continue
            with tempfile.NamedTemporaryFile(dir=target_dir, suffix=".wav", delete=False) as temp:
                temporary = Path(temp.name)
            try:
                if language == "ka" and georgian_voice is None:
                    subprocess.run(
                        [espeak, "-v", "ka", "-s", "138", "-w", str(temporary), text],
                        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                    )
                else:
                    with wave.open(str(temporary), "wb") as wav_file:
                        voice = georgian_voice if language == "ka" else french_voice
                        voice.synthesize_wav(text, wav_file)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
            totals[language] += 1
            completed = totals["ka"] + totals["fr"]
            if completed % 25 == 0:
                print(f"{completed} extraits générés…", flush=True)
    print(f"Terminé : {totals['ka']} extraits géorgiens et {totals['fr']} français.")


if __name__ == "__main__":
    main()
