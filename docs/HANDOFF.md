# Handoff: wake word toolkit (as of 2026-10-19)

Read this first in a new session. Owner: Rece. Design doc: the "Wake Word Toolkit: Technical Design Document v0.1" the owner pasted (not in the repo); the approved plan is `~/.claude/plans/review-this-you-are-zany-sparrow.md`. Owner wants **personal use now, maybe commercial later** (upstream models/data are CC BY-NC-SA, see `LICENSES.md`), **web first**, current phrase **"prometheus"** (switched from "hey rocky", see Model quality).

## Status
| Milestone | State |
|---|---|
| M0 scaffold + upstream study | Done. `docs/upstream-notes.md` |
| M1 runtime + pretrained model | Done. Tests pass in Node and headless Chromium |
| M2 mic + test page | Done. Owner tried Chrome by hand. Safari/Firefox still open: `docs/manual-test-checklist.md` |
| M3 trainer | Done. `trainer/setup.sh` verified (rebuilds the venv first try) and "prometheus" trained end to end |
| M4 accuracy gate | Not started. Owner is not sure it is needed; "prometheus" works well live, including slow speech |
| M5/M6 Capacitor, native, background | Deferred by owner |

Git: see `git log`. `trainer/third_party/openWakeWord` is a submodule pinned at `368c037`.

## Run things
```
cd runtime-web && npm test            # vitest, Node + headless Chromium (needs: npx playwright install chromium)
cd runtime-web && npm run lint && npm run typecheck
cd test-page && npm run e2e           # real Chromium, fake mic playing fixtures
cd test-page && npm run dev           # tuning page: http://localhost:5173/?bundle=/prometheus.wakeword
                                      # listen to training clips: http://localhost:5173/clips.html (open via http, not file://)
cd trainer && .venv/bin/pytest -q && .venv/bin/ruff check .   # pytest/ruff: uv pip install -p .venv/bin/python pytest ruff
trainer/.venv/bin/wakeword train "prometheus" --out bundles/prometheus.wakeword --threshold 0.75   # see docs/training.md
```
Stop a stray dev server with `pkill -f "vite --port 5173"`. A stale one on 5173 makes a new one pick 5174.

## Layout
- `runtime-web/src/`: `wakeword.ts` (API), `pipeline.ts` (mel, embedding, classifier streaming), `detector.ts` (patience and cooldown), `bundle.ts`/`manifest.ts` (zip and validation), `mic.ts` + `worklet.ts` (AudioWorklet capture and resampler, worklet is a string so tests run the exact code), `testdata.ts` (Vite-inlined fixtures so one test file runs in Node and browser).
- `test-page/`: `main.ts`, `index.html`, `e2e.mjs`, `clips.html` (dev-only clip listener, served by a small plugin in `vite.config.ts` at `/clip-files`, limited to `~/.cache/wakeword-toolkit/model`). Serves `bundles/` at `/`.
- `trainer/wakeword_trainer/`: `cli.py`, `train.py` (orchestration), `preflight.py`, `env.py`, `bundle.py` (the only writer of the manifest), `fetch_audio.py`, `piper_shim.py`, `run_upstream.py`, `pretrained.py`.
- `fixtures/make.py` regenerates WAV fixtures with macOS `say` (macOS only).
- `bundles/`: `hey_jarvis.wakeword` (pretrained, used by tests), `hey_rocky.wakeword` and `prometheus.wakeword` (trained locally, non-commercial, `prometheus` has threshold 0.75). `*.report.json` is git-ignored.
- Bundle spec: `docs/bundle-spec.md`. Classifier window `embeddingWindow` (N=16 embeddings = 1.28 s of audio) is in the manifest.

## Environment notes
- Datasets are cached in `~/.cache/wakeword-toolkit` (about 35 GB). Disk had 39 GB free at last check.
- Upstream caches features: if `model/<phrase>/*.npy` exist it **skips augmentation and feature generation**. Delete those `.npy` files after changing clips.
- Training subprocess needs `PYTORCH_JIT=0` and the fork start method on macOS (handled in `train.py` / `run_upstream.py`).
- macOS `say` voices differ per machine; fixtures were regenerated with Samantha, Daniel, Karen, Moira.

## Model quality (defaults: 10,000 clips, 50,000 steps, about 25 min)
| | prometheus | hey rocky |
|---|---|---|
| Upstream validation recall | 48% | 60% |
| accuracy | 74% | 80% |
| false triggers per hour | 0.27 | 1.33 |

- **"hey rocky"** fired on "rocky" alone and missed slow speech. "prometheus" (four syllables, distinctive) fixed both in the owner's live test. Threshold 0.5 was too forgiving; 0.75 chosen by ear. Recall on synthetic test clips is low, but the live result is good.

## Verified upstream facts (read from source; useful if quality needs work)
- **Window length is not a setting.** N=16 comes from `total_length` (median clip + 750 ms, minimum 32,000 samples = 2 s), which upstream recomputes unconditionally (`train.py:754`). A larger window (about 44,000 samples gives N=24, 1.92 s) needs an override in `run_upstream.py`. The runtime already reads N from the model. Owner chose not to change it.
- **Clips longer than `total_length` are truncated from the end** (`augment_clips`), so keep recordings under about 2 s.
- **`custom_negative_phrases` needs repetition.** Piper cycles the text list in order and upstream puts custom phrases first, so each listed phrase yields one clip. Repeat each 200 to 300 times in the YAML (via `--config`) to matter.
- Augmentation already applies room impulse responses (MIT RIRs), AudioSet background noise, colored noise, EQ, pitch shift and distortion to every training clip. Do not add reverb to recordings.
- Possible extra data (not used, licenses unverified): SLR28 (RIRs), MUSAN (noise), added through `rir_paths` / `background_paths`. Common Voice / LibriSpeech would be for an M4 false-trigger test, not training.

## NEXT: Ohren as a local always-on service (owner goals, 2026-10-19)
- Run **in the background on the Mac** (not just a browser tab): a local service doing wake word, plus **TTS and STT**. Shell is open: Tauri, Electron, Capacitor, or gpui.
- **Open source** Ohren as an easier way to create, train and save wake word models (a friendlier openWakeWord). The owner's own app will use the "prometheus" bundle.
- Later: **Android only** (no iOS) and maybe **ESP32**; on ESP32 the TTS/STT is offloaded to another machine.
- Constraints to carry in: the bundle manifest stays the only contract; the runtime must not import trainer code. Background listening needs a native process (a browser page loses the mic with the tab). Phone and ESP32 are unresolved design questions, see the prompt the owner was given in the session of 2026-10-19 and verify its claims before relying on them.

## Optional later: real recordings and M4
Only if the model proves weak in daily use.
1. **Recorder page** in `test-page/` reusing `startMic` (so recordings match the detection capture path). Auto-trim silence, playback, delete. A Vite plugin writes 16 kHz 16-bit WAVs to `recordings/<phrase_slug>/pos|neg/NNNN.wav` (add `recordings/` to `.gitignore`, it is personal voice data).
2. **`wakeword train --recordings DIR`**: copy `pos` clips into `model/<phrase>/positive_train` repeated about 20 to 50 times under unique names, `neg` into `negative_train`; hold out about 30% (by filename) as the test set and list them in `report.json`. Plan for 60 or more positives, or the held-out set is too small to mean anything.
3. **M4 evaluation:** miss rate on held-out positives, false triggers per hour on a long negative recording. Targets: at most 10% misses, at most 1 false trigger per 2 hours. Do not reuse upstream's training negatives.

Tests first. Keep the three-part separation: the runtime never imports trainer code; the manifest is the only contract.

## Open questions for the owner
- Custom or cloned TTS voices: not built. If wanted, verify licenses and Mac support first.
- Commercial later: needs replacing the YouTube-derived upstream negatives with permissively licensed data and a license audit (`LICENSES.md`).
- Owner has a Windows PC (would use WSL2 + NVIDIA); not needed so far.
- A web training UI was asked about and not built (CLI only).

## Decisions made (so they are not re-litigated)
- Upstream is pinned as a submodule, not forked.
- Colab path was dropped; local Mac training works (`docs/training.md`).
- Bundles keep all three ONNX files (about 2 to 3 MB each, well under the 5 MB goal).
- Single-threaded onnxruntime-web WASM (no COOP/COEP headers needed).
- FMA music dataset skipped (needs `trust_remote_code`); AudioSet slice only.
- Classifier window stays at N=16.
