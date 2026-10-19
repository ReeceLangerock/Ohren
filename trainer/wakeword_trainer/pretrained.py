"""Turn an upstream pretrained openWakeWord .onnx model into a .wakeword bundle.

usage: python -m wakeword_trainer.pretrained hey_jarvis "hey jarvis" bundles/hey_jarvis.wakeword
"""
import sys
import urllib.request
from pathlib import Path

import onnxruntime as ort

from .bundle import write_bundle

BASE = "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/"
CACHE = Path(__file__).parent.parent / ".cache"


def fetch(name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        urllib.request.urlretrieve(BASE + name, path)
    return path


def main(name, phrase, out):
    clf = fetch(f"{name}_v0.1.onnx")
    window = ort.InferenceSession(str(clf)).get_inputs()[0].shape[1]
    write_bundle(
        out, name, phrase, fetch("melspectrogram.onnx"), fetch("embedding_model.onnx"), clf, window,
        license="CC-BY-NC-SA-4.0 (non-commercial, upstream openWakeWord pretrained model)",
        trained_with="openWakeWord v0.5.1 pretrained",
    )


if __name__ == "__main__":
    main(*sys.argv[1:4])
