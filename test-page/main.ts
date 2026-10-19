import { Detector } from "../runtime-web/src/detector";
import { WakeWord } from "../runtime-web/src/index";

const $ = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;
const status = (msg: string, err = false) => {
	$("status").textContent = msg;
	$("status").className = err ? "err" : "";
};

let ww: WakeWord | undefined;
let bundleUrl = "";
let hits = 0;
let falses = 0;
const scores: number[] = []; // rolling live scores, one per 80 ms
const MAX = 150; // 12 s of history on the graph

function draw() {
	const c = $<HTMLCanvasElement>("graph");
	const g = c.getContext("2d");
	if (!g) return;
	const dark = matchMedia("(prefers-color-scheme: dark)").matches;
	g.clearRect(0, 0, c.width, c.height);
	g.strokeStyle = dark ? "#6cf" : "#07c";
	g.lineWidth = 3;
	g.beginPath();
	scores.forEach((s, i) => {
		const x = (i / (MAX - 1)) * c.width;
		const y = c.height - s * c.height;
		if (i === 0) g.moveTo(x, y);
		else g.lineTo(x, y);
	});
	g.stroke();
	const t = Number($<HTMLInputElement>("thr").value);
	g.strokeStyle = "#e74c3c";
	g.setLineDash([12, 8]);
	g.beginPath();
	g.moveTo(0, c.height - t * c.height);
	g.lineTo(c.width, c.height - t * c.height);
	g.stroke();
	g.setLineDash([]);
}

async function load() {
	ww?.dispose();
	bundleUrl = $<HTMLInputElement>("bundle").value;
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
		if (scores.length > MAX) scores.shift();
		draw();
	});
	ww.on("detect", () => {
		$("hits").textContent = String(++hits);
	});
	for (const id of ["thr", "start", "false", "file", "export"])
		$<HTMLInputElement>(id).disabled = false;
	status(`Loaded "${m.phrase}". Press Start and say it.`);
	draw();
}

$<HTMLInputElement>("bundle").value =
	new URLSearchParams(location.search).get("bundle") ??
	$<HTMLInputElement>("bundle").value;
$("load").onclick = load;
$("thr").oninput = () => {
	const t = Number($<HTMLInputElement>("thr").value);
	$("thrOut").textContent = t.toFixed(2);
	ww?.setThreshold(t);
	draw();
	if (lastFile) reportFile();
};
$("start").onclick = async () => {
	try {
		await ww?.start();
		$<HTMLButtonElement>("start").disabled = true;
		$<HTMLButtonElement>("stop").disabled = false;
		status("Listening…");
	} catch (e) {
		status((e as Error).message, true);
	}
};
$("stop").onclick = () => {
	ww?.stop();
	$<HTMLButtonElement>("start").disabled = false;
	$<HTMLButtonElement>("stop").disabled = true;
	status("Stopped.");
};
$("false").onclick = () => {
	$("falses").textContent = String(++falses);
};

// --- WAV analysis: score the whole file once, then replay the detector at the current threshold on every slider move.
let lastFile:
	| {
			name: string;
			frames: number[];
			cfg: { patience: number; cooldown: number };
	  }
	| undefined;

function reportFile() {
	if (!lastFile) return;
	const t = Number($<HTMLInputElement>("thr").value);
	const d = new Detector(t, lastFile.cfg.patience, lastFile.cfg.cooldown);
	const at = lastFile.frames.flatMap((s, i) =>
		d.update(s, (i + 1) * 80) ? [((i + 1) * 0.08).toFixed(2)] : [],
	);
	$("fileOut").textContent =
		`${lastFile.name}: ${at.length} detection(s)${at.length ? ` at ${at.join("s, ")}s` : ""} (threshold ${t.toFixed(2)}, peak score ${Math.max(...lastFile.frames).toFixed(2)})`;
}

$("file").onchange = async (ev) => {
	const f = (ev.target as HTMLInputElement).files?.[0];
	if (!f) return;
	status("Analyzing…");
	const decoded = await new AudioContext().decodeAudioData(
		await f.arrayBuffer(),
	);
	const off = new OfflineAudioContext(
		1,
		Math.ceil(decoded.duration * 16000),
		16000,
	);
	const src = off.createBufferSource();
	src.buffer = decoded;
	src.connect(off.destination);
	src.start();
	const pcm = (await off.startRendering()).getChannelData(0);
	const probe = await WakeWord.load(bundleUrl);
	const frames: number[] = [];
	probe.on("score", (e) => frames.push(e.score));
	await probe.processAudio(pcm);
	const m = probe.bundle.manifest;
	lastFile = {
		name: f.name,
		frames,
		cfg: { patience: m.patienceFrames, cooldown: m.cooldownMs },
	};
	status("Done.");
	reportFile();
};

$("export").onclick = () => {
	if (!ww) return;
	const manifest = {
		...ww.bundle.manifest,
		threshold: Number($<HTMLInputElement>("thr").value),
	};
	const a = document.createElement("a");
	a.href = URL.createObjectURL(
		new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
	);
	a.download = "manifest.json";
	a.click();
};

(window as unknown as { ready: Promise<void> }).ready = load();
