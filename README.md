# Ohren

Train your own wake word on a laptop and run it anywhere. Ohren is a friendlier front end to [openWakeWord](https://github.com/dscripka/openWakeWord): one command turns a phrase into a small `.wakeword` file, and a runtime loads that file and listens.

Status: early. Works on macOS (training) and in browsers (runtime). The repo has no license of its own yet, and trained bundles are non-commercial (see [LICENSES.md](LICENSES.md)).

## Parts
| Dir | What it is |
|---|---|
| `trainer/` | Python CLI. `wakeword train "prometheus" --out prometheus.wakeword` downloads data once, trains locally, writes a bundle. |
| `runtime-web/` | TypeScript runtime (onnxruntime-web). Loads a bundle, listens to the mic, fires a `detect` event. |
| `test-page/` | Tuning page: live score graph, threshold slider, WAV upload, and a viewer for the training clips. |
| `bundles/` | Trained bundles. The only contract between trainer and runtime is the manifest inside ([docs/bundle-spec.md](docs/bundle-spec.md)). |

## Try it
```
cd test-page && npm i && npm run dev     # open http://localhost:5173/?bundle=/prometheus.wakeword
```
```ts
import { WakeWord } from "wakeword-runtime";
const ww = await WakeWord.load("/prometheus.wakeword");
ww.on("detect", (e) => console.log("heard it", e.score));
await ww.start(); // from a click handler
```
More: [quickstart](docs/quickstart.md).

## Train your own
```
trainer/setup.sh                                                     # once
trainer/.venv/bin/wakeword train "your phrase" --out your.wakeword --threshold 0.7
```
Needs about 35 GB of disk for cached datasets; a first model takes 25 to 40 minutes on an M-series Mac. Pick a distinctive phrase of three or more syllables ("prometheus" worked, "hey rocky" did not). Details and measured quality: [docs/training.md](docs/training.md).

## Docs
[docs/HANDOFF.md](docs/HANDOFF.md) (current state, read first) · [training](docs/training.md) · [bundle spec](docs/bundle-spec.md) · [upstream notes](docs/upstream-notes.md) · [manual test checklist](docs/manual-test-checklist.md) · [licenses](LICENSES.md)
