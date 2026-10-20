import { Detector } from "../runtime-web/src/detector";
import { WakeWord } from "../runtime-web/src/index";
import { $, decodeTo16kMono } from "./ui";

const SR = 16000;
const FRAME = 1280;
const GAP_S = 2;
const PER_SPLIT = 20;

type Clip = { positive: boolean; url: string; start: number; end: number };
type Run = { clips: Clip[]; frames: number[]; patience: number; cooldown: number };
let run: Run | undefined;

async function listClips(slug: string, split: string): Promise<string[]> {
	const res = await fetch(`/clip-files/${slug}/${split}`);
	if (!res.ok) throw new Error(`No ${split} clips for "${slug}". Synthetic tests only exist for wake words trained on this machine.`);
	return ((await res.json()) as { files: string[] }).files.slice(0, PER_SPLIT).map((f) => `/clip-files/${slug}/${split}/${f}`);
}

/** Replays the detector over each clip's frames at the current threshold and draws the results. */
export function scoreSynthetic(threshold: number) {
	if (!run) return;
	const { clips, frames, patience, cooldown } = run;
	const heard = (c: Clip) => {
		const d = new Detector(threshold, patience, cooldown);
		return frames.slice(c.start, c.end).some((s, i) => d.update(s, (i + 1) * 80));
	};
	const rows = clips.map((c) => ({ c, ok: heard(c) === c.positive }));
	const rate = (positive: boolean) => {
		const set = rows.filter((r) => r.c.positive === positive);
		return `${set.filter((r) => r.ok).length}/${set.length}`;
	};
	$("synthSummary").textContent = `Heard in ${rate(true)} positive clips · correctly ignored ${rate(false)} negative clips (threshold ${threshold.toFixed(2)})`;
	$("synthList").replaceChildren(
		...rows.map(({ c, ok }) => {
			const row = document.createElement("div");
			row.className = "clip";
			row.innerHTML = `<span class="mark ${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"}</span><span>${c.positive ? "should trigger" : "should not"}</span><audio controls preload="none" src="${c.url}"></audio>`;
			return row;
		}),
	);
}

/** Scores a sample of the trainer's synthetic positive and negative test clips with the loaded bundle. */
export async function runSynthetic(bundleUrl: string, phrase: string, threshold: number) {
	const slug = phrase.trim().toLowerCase().replace(/\s+/g, "_");
	const urls = [
		...(await listClips(slug, "positive_test")).map((url) => ({ positive: true, url })),
		...(await listClips(slug, "negative_test")).map((url) => ({ positive: false, url })),
	];
	// One long recording with silence between clips, so the model runs once instead of once per clip.
	const gap = new Float32Array(GAP_S * SR);
	const parts: Float32Array[] = [gap];
	const clips: Clip[] = [];
	let at = gap.length;
	for (const { positive, url } of urls) {
		const pcm = await decodeTo16kMono(await (await fetch(url)).blob());
		clips.push({ positive, url, start: Math.floor(at / FRAME), end: Math.ceil((at + pcm.length + SR) / FRAME) });
		parts.push(pcm, gap);
		at += pcm.length + gap.length;
	}
	const all = new Float32Array(at);
	let o = 0;
	for (const p of parts) {
		all.set(p, o);
		o += p.length;
	}

	const probe = await WakeWord.load(bundleUrl);
	const frames: number[] = [];
	probe.on("score", (e) => frames.push(e.score));
	await probe.processAudio(all);
	probe.dispose();
	const m = probe.bundle.manifest;
	run = { clips, frames, patience: m.patienceFrames, cooldown: m.cooldownMs };
	scoreSynthetic(threshold);
}
