"""Shared naming helpers for pre-generated, locally served lesson audio."""

import hashlib
import re


def normalise_speech(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def audio_name(language, text):
    if language not in {"ka", "fr"}:
        raise ValueError("Langue audio inconnue")
    normalized = normalise_speech(text)
    digest = hashlib.sha256(f"{language}\0{normalized}".encode("utf-8")).hexdigest()
    return f"{digest}.wav"
