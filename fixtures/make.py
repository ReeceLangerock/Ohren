"""Regenerate WAV fixtures (macOS only: uses `say` + `afconvert`). 16 kHz mono int16, padded with silence.

usage: python make.py   (needs numpy)
"""
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).parent
SR = 16000
POS = {"pos_jarvis_samantha": ("Samantha", "hey jarvis"), "pos_jarvis_daniel": ("Daniel", "hey jarvis"),
       "pos_jarvis_karen": ("Karen", "hey jarvis")}
NEG = {"neg_travis": ("Samantha", "hey travis"), "neg_service": ("Daniel", "hey service"),
       "neg_speech": ("Moira", "the weather today is mostly cloudy with a chance of rain in the afternoon and "
                              "the evening news will cover the local election results")}


def say(voice, text):
    with tempfile.TemporaryDirectory() as d:
        a, w = f"{d}/a.aiff", f"{d}/a.wav"
        subprocess.run(["say", "-v", voice, "-o", a, text], check=True)
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", a, w], check=True)
        with wave.open(w) as f:
            return np.frombuffer(f.readframes(f.getnframes()), np.int16)


def write(name, x):
    pad = lambda s: np.zeros(int(s * SR), np.int16)
    x = np.concatenate([pad(2), x, pad(2.5)])
    with wave.open(str(OUT / f"{name}.wav"), "wb") as f:
        f.setnchannels(1), f.setsampwidth(2), f.setframerate(SR)
        f.writeframes(x.tobytes())


for name, (voice, text) in {**POS, **NEG}.items():
    write(name, say(voice, text))
rng = np.random.default_rng(0)  # deterministic noise
write("neg_silence", np.zeros(5 * SR, np.int16))
write("neg_noise", (rng.normal(0, 2000, 8 * SR)).astype(np.int16))
