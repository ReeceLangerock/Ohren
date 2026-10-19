# Licenses

Status: personal use only until the audit below is done. Not legal advice.

| Item | License | Notes |
|------|---------|-------|
| openWakeWord code | Apache 2.0 | Upstream repo, vendored/pinned in `trainer/third_party/` from M3. |
| openWakeWord pretrained models (`hey_jarvis` etc.) | CC BY-NC-SA 4.0 | **Non-commercial, share-alike.** Used for `bundles/hey_jarvis.wakeword` and test fixtures only. |
| `melspectrogram.onnx`, `embedding_model.onnx` | Unconfirmed | Embedding is derived from Google `speech_embedding` (Apache 2.0). Confirm the license of upstream's re-implemented files before any commercial use. |
| Upstream training data (negative features, RIRs, background audio) | Mixed / unknown | README attributes the NC license to this data. Audit each dataset before commercial use. |
| onnxruntime-web | MIT | |
| fflate | MIT | |
| Test fixtures | Generated with macOS `say` | Voice licensing differs per vendor; do not redistribute beyond personal testing without checking Apple's terms. |

Every bundle's manifest `license` field must state its own terms; bundles trained on upstream data are `non-commercial`.

## To do before commercial use
1. Confirm licenses of the mel/embedding ONNX files and each training dataset.
2. Decide whether to retrain on permissively licensed data (separate decision, ask the owner).
3. Replace TTS-fixtures from `say` with redistributable audio.
