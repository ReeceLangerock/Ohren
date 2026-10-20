import { Detector } from "../runtime-web/src/detector";
import { WakeWord } from "../runtime-web/src/index";
import { runSynthetic, scoreSynthetic } from "./synthetic";
import { initTrain } from "./train";
import { $, decodeTo16kMono, setDisabled } from "./ui";

const threshold = () => Number($<HTMLInputElement>("thr").value);
const status = (msg: string, err = false) => {
	$("status").textContent = msg;
	$("status").className = err ? "err" : "";
};

const FRAME_MS = 80;
const HISTORY = 150; // frames on the graph: 12 s

let ww: WakeWord | undefined;
let bundleUrl = "";
let hits = 0;
let falses = 0;
const scores: number[] = [];

// --- Live score graph

function draw() {
	const canvas = $<HTMLCanvasElement>("graph");
	const g = canvas.getContext("2d");
	if (!g) return;
	const { width: w, height: h } = canvas;
	const css = getComputedStyle(document.documentElement);
	const y = (score: number) => h - score * h;

	g.clearRect(0, 0, w, h);
	g.lineWidth = 3;

	g.strokeStyle = css.getPropertyValue("--accent");
	g.beginPath();
	scores.forEach((s, i) => {
		const x = (i / (HISTORY - 1)) * w;
		if (i === 0) g.moveTo(x, y(s));
		else g.lineTo(x, y(s));
	});
	g.stroke();

	g.strokeStyle = css.getPropertyValue("--danger");
	g.setLineDash([12, 8]);
	g.beginPath();
	g.moveTo(0, y(threshold()));
	g.lineTo(w, y(threshold()));
	g.stroke();
	g.setLineDash([]);
}

// --- Bundle loading and live listening

async function load() {
	ww?.dispose();
	bundleUrl = $<HTMLSelectElement>("bundle").value;
	status("Loading…");
	try {
		ww = await WakeWord.load(bundleUrl);
	} catch (e) {
		status((e as Error).message, true);
		return;
	}
	const m = ww.bundle.manifest;
	$<HTMLInputElement>("thr").value = String(m.threshold);
	$("thrOut").textContent = m.threshold.toFixed(2);
	ww.on("score", (e) => {
		scores.push(e.score);
		if (scores.length > HISTORY) scores.shift();
		draw();
	});
	ww.on("detect", () => {
		$("hits").textContent = String(++hits);
	});
	setDisabled(["thr", "start", "false", "file", "synth", "export"], false);
	status(`Loaded "${m.phrase}". Press Start and say it.`);
	draw();
}

$("load").onclick = load;

$("thr").oninput = () => {
	$("thrOut").textContent = threshold().toFixed(2);
	ww?.setThreshold(threshold());
	draw();
	reportFile();
	scoreSynthetic(threshold());
};

$("synth").onclick = async () => {
	if (!ww) return;
	status("Scoring synthetic clips…");
	try {
		await runSynthetic(bundleUrl, ww.bundle.manifest.phrase, threshold());
		status("Done.");
	} catch (e) {
		status((e as Error).message, true);
	}
};

$("start").onclick = async () => {
	try {
		await ww?.start();
		setDisabled(["start"], true);
		setDisabled(["stop"], false);
		status("Listening…");
	} catch (e) {
		status((e as Error).message, true);
	}
};

$("stop").onclick = () => {
	ww?.stop();
	setDisabled(["start"], false);
	setDisabled(["stop"], true);
	status("Stopped.");
};

$("false").onclick = () => {
	$("falses").textContent = String(++falses);
};

// --- WAV analysis: score the whole file once, then replay the detector at the current threshold on every slider move.

type FileScores = {
	name: string;
	frames: number[];
	patience: number;
	cooldown: number;
};
let lastFile: FileScores | undefined;

function reportFile() {
	if (!lastFile) return;
	const { name, frames, patience, cooldown } = lastFile;
	const d = new Detector(threshold(), patience, cooldown);
	const times = frames.flatMap((s, i) =>
		d.update(s, (i + 1) * FRAME_MS) ? [(((i + 1) * FRAME_MS) / 1000).toFixed(2)] : [],
	);
	const where = times.length ? ` at ${times.join("s, ")}s` : "";
	$("fileOut").textContent =
		`${name}: ${times.length} detection(s)${where} (threshold ${threshold().toFixed(2)}, peak score ${Math.max(...frames).toFixed(2)})`;
}

$("file").onchange = async (ev) => {
	const f = (ev.target as HTMLInputElement).files?.[0];
	if (!f) return;
	status("Analyzing…");
	const pcm = await decodeTo16kMono(f);
	const probe = await WakeWord.load(bundleUrl);
	const frames: number[] = [];
	probe.on("score", (e) => frames.push(e.score));
	await probe.processAudio(pcm);
	const m = probe.bundle.manifest;
	lastFile = { name: f.name, frames, patience: m.patienceFrames, cooldown: m.cooldownMs };
	status("Done.");
	reportFile();
};

// --- Export

$("export").onclick = () => {
	if (!ww) return;
	const manifest = { ...ww.bundle.manifest, threshold: threshold() };
	const a = document.createElement("a");
	a.href = URL.createObjectURL(
		new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
	);
	a.download = "manifest.json";
	a.click();
};

// --- Boot

/** Fills the bundle list from bundles/ and selects `pick` (adding it if the server doesn't list it). */
async function refreshBundles(pick?: string) {
	const select = $<HTMLSelectElement>("bundle");
	const names: string[] = await fetch("/api/bundles").then((r) => r.json()).catch(() => []);
	const urls = names.map((n) => `/${n}`);
	if (pick && !urls.includes(pick)) urls.push(pick);
	select.replaceChildren(...urls.map((u) => new Option(u.slice(1).replace(".wakeword", ""), u)));
	if (pick) select.value = pick;
}

initTrain(async (bundleUrl) => {
	await refreshBundles(bundleUrl);
	await load();
});

await refreshBundles(new URLSearchParams(location.search).get("bundle") ?? undefined);
(window as unknown as { ready: Promise<void> }).ready = load();
