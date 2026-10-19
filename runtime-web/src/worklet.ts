/**
 * AudioWorklet source (a string, so the library ships no extra file). Resamples the mic to 16 kHz with a
 * windowed-sinc low-pass and posts Float32Array chunks of 1280 samples to the main thread.
 * Kept as a string so tests can evaluate the exact code the browser runs.
 */
export const WORKLET_NAME = "wakeword-capture";

export const WORKLET_SOURCE = `
const OUT_RATE = 16000, CHUNK = 1280, HALF = 8; // HALF: kernel half-width in output samples
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / OUT_RATE;
    this.width = Math.ceil(HALF * Math.max(this.ratio, 1));
    this.buf = new Float32Array(0); // input history
    this.pos = 0;                   // input position of the next output sample, relative to buf[0]
    this.out = new Float32Array(CHUNK);
    this.n = 0;
  }
  kernel(d) { // d: distance in input samples
    const cut = Math.min(1, 1 / this.ratio);
    const a = d * cut, w = this.width;
    if (Math.abs(d) >= w) return 0;
    const sinc = a === 0 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a);
    return cut * sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / w));
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const merged = new Float32Array(this.buf.length + ch.length);
    merged.set(this.buf); merged.set(ch, this.buf.length);
    this.buf = merged;
    while (this.pos + this.width < this.buf.length) {
      let s = 0;
      if (this.ratio === 1) s = this.buf[Math.round(this.pos)];
      else {
        const c = Math.floor(this.pos);
        for (let k = c - this.width + 1; k <= c + this.width; k++) {
          if (k >= 0) s += this.buf[k] * this.kernel(k - this.pos);
        }
      }
      this.out[this.n++] = s;
      if (this.n === CHUNK) { this.port.postMessage(this.out, [this.out.buffer]); this.out = new Float32Array(CHUNK); this.n = 0; }
      this.pos += this.ratio;
    }
    const drop = Math.max(0, Math.floor(this.pos) - this.width);
    if (drop > 0) { this.buf = this.buf.slice(drop); this.pos -= drop; }
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", Capture);
`;
