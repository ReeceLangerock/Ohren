# Bundle format v1

A `.wakeword` file is a zip with `manifest.json` and three ONNX files named by the manifest. It is the only contract between the trainer and the runtime.

```json
{
  "formatVersion": 1,
  "name": "hey_jarvis",
  "phrase": "hey jarvis",
  "sampleRate": 16000,
  "frameSamples": 1280,
  "embeddingWindow": 16,
  "melspecTransform": { "scale": 0.1, "offset": 2 },
  "threshold": 0.5,
  "patienceFrames": 2,
  "cooldownMs": 1500,
  "models": { "melspec": "melspec.onnx", "embedding": "embedding.onnx", "classifier": "classifier.onnx" },
  "trainedWith": "openWakeWord v0.5.1 pretrained",
  "license": "CC-BY-NC-SA-4.0 (non-commercial, ...)"
}
```

| Field | Meaning |
|-------|---------|
| `formatVersion` | The runtime rejects any value it does not know. |
| `embeddingWindow` | N: how many 96-dim embeddings (80 ms each) the classifier takes as input. |
| `melspecTransform` | Applied to melspec output: `x * scale + offset`. |
| `threshold` / `patienceFrames` / `cooldownMs` | Fire when the score is at least `threshold` for `patienceFrames` consecutive 80 ms frames, then stay quiet for `cooldownMs`. |

Pipeline (see `upstream-notes.md`): 16 kHz mono audio, 1280-sample frames (with 480 samples of history) go to the melspec model, the last 76 mel frames go to the embedding model, the last N embeddings go to the classifier.
Model IO names: melspec input `input`; embedding input `input_1`; the classifier's first input is looked up by position.
Writer: `trainer/bundle.py`. Reader: `runtime-web/src/bundle.ts`.
