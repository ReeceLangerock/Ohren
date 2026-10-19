"""Writes a .wakeword bundle (zip of manifest.json + three ONNX files). The manifest is the only contract with the runtime."""
import json
import zipfile
from pathlib import Path

FORMAT_VERSION = 1


def write_bundle(out, name, phrase, melspec, embedding, classifier, embedding_window, license, trained_with, **overrides):
    manifest = {
        "formatVersion": FORMAT_VERSION,
        "name": name,
        "phrase": phrase,
        "sampleRate": 16000,
        "frameSamples": 1280,
        "embeddingWindow": embedding_window,
        "melspecTransform": {"scale": 0.1, "offset": 2},
        "threshold": 0.5,
        "patienceFrames": 2,
        "cooldownMs": 1500,
        "models": {"melspec": "melspec.onnx", "embedding": "embedding.onnx", "classifier": "classifier.onnx"},
        "trainedWith": trained_with,
        "license": license,
        **overrides,
    }
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        for key, src in (("melspec", melspec), ("embedding", embedding), ("classifier", classifier)):
            z.write(Path(src), manifest["models"][key])
    return manifest
