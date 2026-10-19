# Training a wake word locally

Tested on macOS (Apple Silicon, M3 Pro, 19 GB RAM, Python 3.11 via uv). Linux/NVIDIA should also work. Windows: use WSL2.

```
trainer/setup.sh                                   # once: brew/apt deps, venv, packages
trainer/.venv/bin/wakeword preflight "prometheus"  # warns about short or common phrases
trainer/.venv/bin/wakeword train "prometheus" --out prometheus.wakeword   # optional: --config config.yaml, --threshold 0.75
```

Output: the `.wakeword` bundle plus `prometheus.report.json` (manifest, settings, warnings).

## Cost
- **One time (cached in `~/.cache/wakeword-toolkit`, ~35 GB free disk recommended):** 17.3 GB negative features, 185 MB validation features, 204 MB Piper voice, room impulse responses, 500 AudioSet clips.
- **Per phrase, measured on the M3 Pro with defaults (10,000 clips, 50,000 steps):** about 13 min clip generation, ~10 min features and training. Roughly 25 to 40 minutes.

## Quality (defaults, synthetic training data only)
- "prometheus": upstream validation recall 48%, accuracy 74%, 0.27 false triggers per hour (target 0.2). Works well live, including slow speech; threshold 0.75 chosen by ear with the test page.
- "hey rocky" (first run): recall 60%, accuracy 80%, 1.33 false triggers per hour. Fired on "rocky" alone and missed slow speech, so a short phrase with a weak first word is a poor choice.
- Use `--threshold` to write the tuned value into the bundle.
- Real-voice evaluation (M4) has not been done.

## Things that broke and how they are handled (see code comments)
- Piper v2 (what upstream expects) has no Apple Silicon wheel: `piper_shim.py` adapts Piper v3.2.0 (adds MPS GPU) and resamples its 22.05 kHz output to 16 kHz.
- TorchScript fuser crashes on Apple GPUs: training subprocesses run with `PYTORCH_JIT=0`.
- macOS multiprocessing default (spawn) cannot pickle upstream's lambdas: `run_upstream.py` forces fork.
- torchaudio 2.9+ needs torchcodec to load audio: pinned to torch/torchaudio 2.8.0.
- Upstream's `--convert_to_tflite` is always on (`default="False"` is truthy) and fails without TensorFlow after the ONNX is saved: tolerated when the ONNX exists.
- Upstream's AudioSet URL is gone and the FMA dataset needs remote code: AudioSet is read from one parquet shard, FMA is skipped.
- Never put marker files inside the audio folders: upstream loads everything in them as audio.
