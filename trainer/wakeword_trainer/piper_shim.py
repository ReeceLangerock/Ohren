"""Copied into the piper-sample-generator checkout as generate_samples.py.

Upstream openWakeWord's train.py does `from generate_samples import generate_samples` (the Piper v2.0.0 layout).
Piper v3.x moved it into a package, needs the model passed in, writes 22.05 kHz clips (upstream expects 16 kHz),
and only v3.x supports Apple GPUs (MPS). This adapter keeps upstream's call unchanged.
"""
from pathlib import Path

import numpy as np
import scipy.io.wavfile
import scipy.signal
from piper_sample_generator.__main__ import generate_samples as _generate

MODEL = Path(__file__).parent / "models" / "en_US-libritts_r-medium.pt"


def to_16k(folder):
    for f in Path(folder).glob("*.wav"):
        sr, x = scipy.io.wavfile.read(f)
        if sr != 16000:
            y = scipy.signal.resample_poly(x.astype(np.float32), 16000, sr)
            scipy.io.wavfile.write(f, 16000, np.clip(y, -32768, 32767).astype(np.int16))


def generate_samples(*args, **kwargs):
    _generate(*args, model=MODEL, **kwargs)
    to_16k(kwargs["output_dir"])
