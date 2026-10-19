import { expect, test } from "vitest";
import { type DetectEvent, WakeWord } from "./index";
import { bundle, wav } from "./testdata";

/** Feeds audio in 80 ms chunks like a live stream; returns detections and the slowest wall-clock chunk. */
async function stream(name: string) {
	const fresh = await WakeWord.load(bundle("hey_jarvis"));
	const hits: DetectEvent[] = [];
	fresh.on("detect", (e) => hits.push(e));
	const x = wav(name);
	let worstMs = 0;
	for (let i = 0; i < x.length; i += 1280) {
		const t = performance.now();
		await fresh.processAudio(x.subarray(i, i + 1280));
		worstMs = Math.max(worstMs, performance.now() - t);
	}
	return { hits, worstMs, x };
}

for (const n of [
	"pos_jarvis_samantha",
	"pos_jarvis_daniel",
	"pos_jarvis_karen",
]) {
	test(`${n}: exactly one detection`, async () =>
		expect((await stream(n)).hits).toHaveLength(1));
}
for (const n of [
	"neg_travis",
	"neg_service",
	"neg_speech",
	"neg_silence",
	"neg_noise",
]) {
	test(`${n}: no detection`, async () =>
		expect((await stream(n)).hits).toHaveLength(0));
}

test("detection latency after end of phrase is under 200 ms", async () => {
	const { hits, worstMs, x } = await stream("pos_jarvis_samantha");
	let end = x.length - 1;
	while (Math.abs(x[end]) < 0.01) end--;
	const endMs = (end / 16000) * 1000;
	const latency = hits[0].timestamp - endMs + worstMs; // audio wait + worst-case compute for a frame
	console.log({ endMs, detectMs: hits[0].timestamp, worstMs, latency });
	expect(latency).toBeLessThan(200);
});
