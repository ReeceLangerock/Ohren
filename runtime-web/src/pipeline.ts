import * as ort from "onnxruntime-web";
import type { Bundle } from "./bundle";

const MEL_BINS = 32;
const EMB_DIM = 96;
const MEL_WINDOW = 76;
const MEL_CONTEXT = 480; // 3 mel hops of history, as upstream's streaming mode does
const WARMUP_SAMPLES = 4 * 16000;

ort.env.wasm.numThreads = 1; // single-threaded WASM: no COOP/COEP headers needed

/** Streams 1280-sample int16-scale frames through mel -> embedding -> classifier, one score per frame. */
export class Pipeline {
	private prev = new Float32Array(MEL_CONTEXT);
	private mel = new Float32Array(MEL_WINDOW * MEL_BINS).fill(1);
	private emb: Float32Array[] = [];

	private constructor(
		private bundle: Bundle,
		private melSession: ort.InferenceSession,
		private embSession: ort.InferenceSession,
		private clfSession: ort.InferenceSession,
		private warm: Float32Array[],
	) {
		this.emb = warm.slice();
	}

	static async create(bundle: Bundle): Promise<Pipeline> {
		const [m, e, c] = await Promise.all(
			[bundle.melspec, bundle.embedding, bundle.classifier].map((b) =>
				ort.InferenceSession.create(b),
			),
		);
		const p = new Pipeline(bundle, m, e, c, []);
		// Upstream primes its embedding history with embeddings of low-level noise; do the same, deterministically.
		p.warm = await p.warmup();
		p.emb = p.warm.slice();
		return p;
	}

	private async warmup(): Promise<Float32Array[]> {
		let s = 1;
		const noise = new Float32Array(WARMUP_SAMPLES);
		for (let i = 0; i < noise.length; i++) {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0; // LCG
			noise[i] = (s / 2 ** 32) * 2000 - 1000;
		}
		const mel = await this.melspec(noise);
		const windows: Float32Array[] = [];
		for (let i = 0; i + MEL_WINDOW <= mel.length / MEL_BINS; i += 8) {
			windows.push(mel.subarray(i * MEL_BINS, (i + MEL_WINDOW) * MEL_BINS));
		}
		const batch = new Float32Array(windows.length * MEL_WINDOW * MEL_BINS);
		windows.forEach((w, i) => {
			batch.set(w, i * w.length);
		});
		const out = await this.embed(batch, windows.length);
		return windows.map((_, i) => out.slice(i * EMB_DIM, (i + 1) * EMB_DIM));
	}

	private async melspec(x: Float32Array): Promise<Float32Array> {
		const { scale, offset } = this.bundle.manifest.melspecTransform;
		const r = await this.melSession.run({
			input: new ort.Tensor("float32", x, [1, x.length]),
		});
		return Float32Array.from(
			Object.values(r)[0].data as Float32Array,
			(v) => v * scale + offset,
		);
	}

	private async embed(windows: Float32Array, n: number): Promise<Float32Array> {
		const r = await this.embSession.run({
			input_1: new ort.Tensor("float32", windows, [n, MEL_WINDOW, MEL_BINS, 1]),
		});
		return Object.values(r)[0].data as Float32Array;
	}

	/** `frame`: 1280 samples scaled like int16 (±32768). Returns the classifier score. */
	async push(frame: Float32Array): Promise<number> {
		const x = new Float32Array(MEL_CONTEXT + frame.length);
		x.set(this.prev);
		x.set(frame, MEL_CONTEXT);
		this.prev = frame.slice(frame.length - MEL_CONTEXT);

		const frames = await this.melspec(x);
		const keep = new Float32Array(MEL_WINDOW * MEL_BINS);
		const all = new Float32Array(this.mel.length + frames.length);
		all.set(this.mel);
		all.set(frames, this.mel.length);
		keep.set(all.subarray(all.length - keep.length));
		this.mel = keep;

		this.emb.push(await this.embed(this.mel, 1));
		const n = this.bundle.manifest.embeddingWindow;
		this.emb = this.emb.slice(-n);
		const input = new Float32Array(n * EMB_DIM);
		this.emb.forEach((v, i) => {
			input.set(v, i * EMB_DIM);
		});
		const r = await this.clfSession.run({
			[this.clfSession.inputNames[0]]: new ort.Tensor("float32", input, [
				1,
				n,
				EMB_DIM,
			]),
		});
		return (Object.values(r)[0].data as Float32Array)[0];
	}

	reset(): void {
		this.prev = new Float32Array(MEL_CONTEXT);
		this.mel = new Float32Array(MEL_WINDOW * MEL_BINS).fill(1);
		this.emb = this.warm.slice();
	}
}
