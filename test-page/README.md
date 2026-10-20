# Ohren UI

One local page to train a wake word, test it and tune it.

```
cd trainer && ./setup.sh          # once: Python environment for training
cd ../test-page && npm i && npm run dev     # http://localhost:5173
npm run e2e                                  # headless Chromium with a fake microphone
```

1. **Train:** type a phrase, check it, press Train. The page runs the trainer on this machine (25 to 40 minutes; 35 GB of disk the first time) and shows its log. The finished bundle lands in `../bundles/` and loads automatically. Progress survives a page reload.
2. **Tune:** say the phrase with the mic and drag the threshold.
3. **Test:** score a sample of the trainer's synthetic positive and negative clips, or upload a WAV. Results update as you drag the threshold.
4. **Save:** export the manifest and copy the `threshold` into the bundle.

The training and clip endpoints exist only in the Vite dev server, on localhost. Use `localhost` or HTTPS or the browser blocks the microphone.
