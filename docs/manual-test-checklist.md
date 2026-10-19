# Manual test checklist (real browsers and devices)

Automated tests cover Node and headless Chromium with a fake microphone. These need a human. Start `cd test-page && npm run dev`; mic needs `localhost` or HTTPS.

For each browser: Chrome, Safari (macOS), Firefox (and later: Android Chrome, iOS Safari).

- [ ] Page loads and shows `Loaded "<phrase>"`.
- [ ] **Start listening** shows the permission prompt; accepting starts the graph moving.
- [ ] Saying the phrase normally raises the score past the red line and increments Detections once.
- [ ] Saying other speech for 30 s causes no detection (note any false triggers with the button).
- [ ] Threshold slider changes the red line instantly; at 0.99 the phrase no longer fires.
- [ ] Stop, then Start again works without reloading.
- [ ] Deny the permission: a clear red message appears, no console error loop.
- [ ] Upload a WAV: detections listed with times; moving the slider updates the result.
- [ ] Export manifest downloads a `manifest.json` with the chosen threshold.
- [ ] Safari: confirm audio keeps flowing (AudioContext not stuck suspended).

Record results per browser/date below.

| Date | Browser/OS | Result | Notes |
|------|-----------|--------|-------|
| 2026-10-19 | Chrome / macOS | Pass (owner, informal) | "prometheus" at threshold 0.75, normal and slow speech. Full checklist not walked. Safari and Firefox not tried. |
