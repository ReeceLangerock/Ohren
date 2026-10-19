# Upstream notes (openWakeWord, read from source at HEAD)

Status: M0 in progress. Source read: `openwakeword/utils.py`, `model.py`, `__init__.py`. Not yet verified by running (see "Open").

## Pipeline (confirmed in `utils.py` `AudioFeatures`)
1. Audio: 16 kHz mono int16. Chunks of 1280 samples (80 ms).
2. `melspectrogram.onnx`: input name `input`, float32 `[1, samples]` holding **raw int16-scale values** (not normalised to ±1). Output squeezed to `[frames, 32]`, frames ≈ `samples/160 - 3` (10 ms hop). Post-transform: `spec / 10 + 2`.
3. `embedding_model.onnx`: input name `input_1`, float32 `[batch, 76, 32, 1]`, output 96-dim per window. Windows are 76 mel frames, stride 8 (80 ms), so one embedding per 80 ms chunk.
4. Classifier: input `[1, N, 96]` where **N is read from each model's input shape** (`model.py:156`), so it varies per model. Output is a score in 0..1.
5. Streaming state: mel buffer starts as `ones((76, 32))`, and the feature buffer is warmed with embeddings of random noise (`utils.py:165-178`). The JS runtime must replicate this warm-up or the first detections will differ.

## Corrections to the design doc
- `train.py` **is** inside the pip package (`openwakeword/train.py`); only the TTS generator (`piper-sample-generator`) and datasets are external.
- Manifest needs `embeddingWindow` (N) and `melspecTransform: {scale: 0.1, offset: 2}`. `frameSamples: 1280` stays.
- Upstream ships `.tflite` by default in v0.5.1 release assets; `.onnx` variants exist for pretrained models and are what the bundle converter should fetch.

## Licenses (from README)
- Code: Apache 2.0.
- Pretrained models: CC BY-NC-SA 4.0 (training data of unknown or restrictive licence). Personal use only for now.
- Embedding backbone is based on Google `speech_embedding` (Apache 2.0). Confirm separately for `LICENSES.md`.

## M0 results (verified by running)
- **Spike passed**: melspec + embedding + `hey_jarvis` classifier under onnxruntime-web WASM (Node) match Python onnxruntime: embedding diff 5e-5, score diff 3e-7. Same tests also pass in headless Chromium.
- Melspec output dims are `[1, 1, frames, 32]` (frames is `dims[2]`).
- `hey_jarvis` classifier: input `x.1` `[1, 16, 96]`, output `[1, 1]`. Bundle is ~3.0 MB.
- Per-frame compute is under 10 ms in Node; end-of-phrase to detection is ~125 ms (including 80 ms frame wait + patience).
- Streaming matches upstream: each 1280-sample frame is run with 480 samples of history, giving 8 mel frames, one embedding per frame, classifier on the last N embeddings. Embedding history is primed with embeddings of seeded noise.

## Training (read from `automatic_model_training.ipynb`)
- **Linux only** (Piper TTS dependency); needs a GPU in practice. Steps: `train.py --generate_clips`, `--augment_clips`, `--train_model`, driven by a YAML config. Output `<output_dir>/<model_name>.onnx`.
- Data: MIT RIRs, AudioSet + FMA background audio, precomputed ACAV100M features (~2000 h) and a validation feature file, all from Hugging Face. Several GB.
- Upstream pins old dependencies (`speechbrain==0.5.14`, `tensorflow-cpu==2.8.1`, ...). They may not install on current Colab Python; expect to adjust `trainer/requirements.txt` on the first real run. The toolkit omits the tensorflow pins since it only needs the ONNX output.
