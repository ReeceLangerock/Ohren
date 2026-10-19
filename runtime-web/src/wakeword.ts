import { type Bundle, readBundle } from "./bundle";
import { Detector } from "./detector";
import { type Mic, startMic } from "./mic";
import { Pipeline } from "./pipeline";

export interface DetectEvent {
	score: number;
	/** Audio time in ms since start/reset, at the end of the frame that triggered. */
	timestamp: number;
}
type Handlers = {
	detect: ((e: DetectEvent) => void)[];
	score: ((e: DetectEvent) => void)[];
};

const FRAME = 1280;

export class WakeWord {
	private handlers: Handlers = { detect: [], score: [] };
	private pending = new Float32Array(0);
	private frames = 0;
	private queue: Promise<unknown> = Promise.resolve();
	private mic?: Mic;

	private constructor(
		readonly bundle: Bundle,
		private pipeline: Pipeline,
		private detector: Detector,
	) {}

	static async load(source: string | Uint8Array): Promise<WakeWord> {
		let bytes: Uint8Array;
		if (typeof source === "string") {
			const res = await fetch(source);
			if (!res.ok)
				throw new Error(`Could not load bundle ${source}: HTTP ${res.status}`);
			bytes = new Uint8Array(await res.arrayBuffer());
		} else {
			bytes = source;
		}
		const bundle = readBundle(bytes);
		const m = bundle.manifest;
		return new WakeWord(
			bundle,
			await Pipeline.create(bundle),
			new Detector(m.threshold, m.patienceFrames, m.cooldownMs),
		);
	}

	/** `detect` fires on a wake word; `score` fires for every frame (used by the tuning page). */
	on(event: keyof Handlers, fn: (e: DetectEvent) => void): void {
		this.handlers[event].push(fn);
	}

	setThreshold(t: number): void {
		this.detector.threshold = t;
	}

	/** Feed mono 16 kHz audio in [-1, 1]. Calls are processed in order; the promise resolves once this chunk is scored. */
	processAudio(samples: Float32Array): Promise<void> {
		const run = this.queue.then(() => this.consume(samples));
		this.queue = run.catch(() => {});
		return run;
	}

	private async consume(samples: Float32Array): Promise<void> {
		const buf = new Float32Array(this.pending.length + samples.length);
		buf.set(this.pending);
		buf.set(samples, this.pending.length);
		let i = 0;
		for (; i + FRAME <= buf.length; i += FRAME) {
			const frame = buf.subarray(i, i + FRAME).map((v) => v * 32768);
			const score = await this.pipeline.push(frame);
			const e = { score, timestamp: (++this.frames * FRAME * 1000) / 16000 };
			for (const h of this.handlers.score) h(e);
			if (this.detector.update(score, e.timestamp))
				for (const h of this.handlers.detect) h(e);
		}
		this.pending = buf.slice(i);
	}

	/** Asks for mic permission and begins listening. Call from a user gesture (click) so the browser allows audio. */
	async start(): Promise<void> {
		if (this.mic) return;
		this.mic = await startMic((c) => {
			void this.processAudio(c);
		});
	}

	stop(): void {
		this.mic?.stop();
		this.mic = undefined;
	}

	dispose(): void {
		this.stop();
		this.handlers = { detect: [], score: [] };
	}
}
