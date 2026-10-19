# Quickstart

```ts
import { WakeWord } from "wakeword-runtime";

const ww = await WakeWord.load("/models/hey_jarvis.wakeword");
ww.on("detect", (e) => console.log("heard it", e.score, e.timestamp));
await ww.start(); // call from a click handler; asks for the microphone
// ww.stop(); ww.setThreshold(0.6); ww.dispose();
```

- Serve the page over HTTPS (or `localhost`); browsers block the microphone otherwise.
- `start()` rejects with a readable message if the microphone is denied or missing.
- No server, key or network call is needed after the bundle is fetched.
- To feed audio yourself (tests, files): `await ww.processAudio(float32Mono16k)`.

## Tune it
```
cd test-page && npm i && npm run dev
```
Load a bundle, say the phrase, drag the threshold slider, tap **False trigger** when it misfires, then **Export manifest** and put the new `threshold` into your bundle's `manifest.json`.

## Develop
```
cd runtime-web && npm i && npx playwright install chromium && npm test   # Node + headless Chromium
cd test-page && npm i && npm run e2e                                      # fake microphone, real browser
```
