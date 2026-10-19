import { expect, test } from "vitest";
import { wav } from "./testdata";
import { WORKLET_SOURCE } from "./worklet";

/** Runs the real worklet source with stubs; returns the 16 kHz chunks it posts for `input` sampled at `rate`. */
function runWorklet(input: Float32Array, rate: number): Float32Array {
	const chunks: Float32Array[] = [];
	let Proc!: new () => { process(i: Float32Array[][]): boolean };
	class AudioWorkletProcessor {
		port = { postMessage: (c: Float32Array) => chunks.push(c) };
	}
	new Function(
		"AudioWorkletProcessor",
		"registerProcessor",
		"sampleRate",
		WORKLET_SOURCE,
	)(
		AudioWorkletProcessor,
		(_: string, c: typeof Proc) => {
			Proc = c;
		},
		rate,
	);
	const p = new Proc();
	for (let i = 0; i < input.length; i += 128)
		p.process([[input.subarray(i, i + 128)]]);
	const out = new Float32Array(chunks.length * 1280);
	chunks.forEach((c, i) => {
		out.set(c, i * 1280);
	});
	return out;
}

/** Band-limited upsample by an integer factor (linear interpolation of speech is fine for a test signal). */
function upsample(x: Float32Array, k: number): Float32Array {
	const y = new Float32Array(x.length * k);
	for (let i = 0; i < y.length; i++) {
		const a = Math.floor(i / k);
		const f = (i % k) / k;
		y[i] = x[a] * (1 - f) + (x[Math.min(a + 1, x.length - 1)] ?? 0) * f;
	}
	return y;
}

for (const rate of [48000, 32000]) {
	test(`${rate} Hz mic resamples to 16 kHz matching the source audio`, () => {
		const ref = wav("pos_jarvis_samantha");
		const out = runWorklet(upsample(ref, rate / 16000), rate);
		// The kernel adds a fixed delay of a few output samples; find it, then compare.
		let best = { lag: 0, err: Infinity };
		for (let lag = 0; lag <= 16; lag++) {
			let e = 0;
			const n = Math.min(out.length - lag, ref.length) - 1280;
			for (let i = 1280; i < n; i++) e += (out[i + lag] - ref[i]) ** 2;
			e /= n;
			if (e < best.err) best = { lag, err: e };
		}
		let power = 0;
		for (const v of ref) power += v * v;
		power /= ref.length;
		expect(best.err / power).toBeLessThan(0.01); // < -20 dB error vs signal power
	});
}
