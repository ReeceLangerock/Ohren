import { $, api, setDisabled } from "./ui";

type Job = {
	phrase: string;
	log: string;
	step?: string;
	stepAt?: number;
	running: boolean;
	cancelled?: boolean;
	code?: number;
	bundle?: string;
	result?: { accuracy?: number; recall?: number; falsePositivesPerHour?: number; targetFalsePositivesPerHour?: number };
};

/** Stage names match `step()` in trainer/wakeword_trainer/train.py. */
const STEPS = [
	{ id: "check", title: "Check the phrase", note: "Warns if it is short or common enough to false-trigger." },
	{ id: "data", title: "Get training data", note: "First run only: the speech generator and background audio. The 17 GB of speech features download in the background during the next steps." },
	{ id: "generate", title: "Generate synthetic speech", note: "A text-to-speech model says your phrase thousands of times in many voices, plus similar-sounding phrases to learn to ignore. About 13 minutes." },
	{ id: "augment", title: "Add noise and echo", note: "Mixes the clips with background noise and room reverb so it works in real rooms." },
	{ id: "train", title: "Train the model", note: "Teaches a small classifier to tell your phrase from everything else. About 10 minutes." },
	{ id: "package", title: "Package the bundle", note: "Writes one .wakeword file with the models and settings." },
];

const phrase = () => $<HTMLInputElement>("phrase").value.trim();
const threshold = () => Number($<HTMLInputElement>("trainThr").value);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Progress bars use \r to redraw one line; keep only the latest state of each line. */
const latest = (log: string) => log.split("\n").map((l) => l.split("\r").pop() ?? "").filter(Boolean);
const tidy = (log: string) => latest(log).filter((l) => !l.startsWith("##STEP")).slice(-14).join("\n");

/** Percent of the running step, from the last progress bar printed since that step began. */
function stepPercent(log: string): number | undefined {
	const marker = log.lastIndexOf("##STEP");
	const lines = latest(marker < 0 ? log : log.slice(marker)).filter((l) => !l.startsWith("[download]"));
	const m = lines.at(-1)?.match(/(\d{1,3})%/);
	return m ? Math.min(100, Number(m[1])) : undefined;
}

/** The background feature download, until its last file finishes. */
function downloadNote(log: string): string | undefined {
	const last = latest(log).filter((l) => l.startsWith("[download]")).at(-1)?.match(/\[download\] (\S+): (\d+)%/);
	if (!last || (last[2] === "100" && last[1].startsWith("validation"))) return undefined;
	return `Downloading ${last[1]}: ${last[2]}%`;
}

const elapsed = (since: number) => {
	const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
	return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

function show(msg: string, err = false) {
	$("trainMsg").textContent = msg;
	$("trainMsg").className = err ? "err" : "help";
}

/** Marks each step done, active or pending from the job's current step. */
function renderSteps(job?: Job) {
	const at = STEPS.findIndex((s) => s.id === job?.step);
	const finished = job && !job.running && job.code === 0;
	$("steps").replaceChildren(
		...STEPS.map((s, i) => {
			const state = finished || i < at ? "done" : i === at ? (job?.running ? "active" : "failed") : "pending";
			const li = document.createElement("li");
			li.className = state;
			li.innerHTML = `<b>${s.title}</b><span>${s.note}</span>`;
			if (state === "active" && job) {
				const p = stepPercent(job.log);
				const extra = [job.stepAt ? elapsed(job.stepAt) : "", p === undefined ? "" : `${p}%`, downloadNote(job.log) ?? ""].filter(Boolean);
				li.insertAdjacentHTML("beforeend", `<progress max="100" ${p === undefined ? "" : `value="${p}"`}></progress><span>${extra.join(" · ")}</span>`);
			}
			return li;
		}),
	);
}

function summary(job: Job): string {
	const r = job.result;
	if (!r || r.recall === undefined || r.falsePositivesPerHour === undefined) return `Done. "${job.phrase}" is ready and loaded below.`;
	const target = r.targetFalsePositivesPerHour === undefined ? "" : ` (target ${r.targetFalsePositivesPerHour})`;
	return `Done. "${job.phrase}" is ready and loaded below. On held-out data it hears ${pct(r.recall)} of spoken phrases with ${r.falsePositivesPerHour.toFixed(2)} false triggers per hour${target}. Tune the threshold below to trade the two off.`;
}

function failure(job: Job): string {
	if (job.cancelled) return "Training was cancelled.";
	const lines = latest(job.log).filter((l) => !l.startsWith("##"));
	const reason = [...lines].reverse().find((l) => /error|failed/i.test(l)) ?? lines.at(-1) ?? "";
	return `Training failed at "${STEPS.find((s) => s.id === job.step)?.title ?? "start"}". ${reason}`;
}

function render(job: Job) {
	$("logBox").hidden = false;
	$("log").textContent = tidy(job.log);
	$("log").scrollTop = $("log").scrollHeight;
	setDisabled(["train", "check"], job.running);
	$("cancel").hidden = !job.running;
	renderSteps(job);
	if (job.running) show(`Training "${job.phrase}". This takes 25 to 40 minutes; you can leave this page open or reload it.`);
}

/** Starts the training card. `onDone` is called with the new bundle's URL when training succeeds. */
export function initTrain(onDone: (bundleUrl: string) => void) {
	let timer: number | undefined;
	renderSteps();

	async function poll() {
		const job = await api<Job | null>("/train").catch(() => null);
		if (!job) return;
		render(job);
		if (job.running) {
			timer = window.setTimeout(poll, 2000);
		} else if (job.code === 0) {
			show(summary(job));
			onDone(job.bundle as string);
		} else {
			show(failure(job), !job.cancelled);
			($("logBox") as HTMLDetailsElement).open = !job.cancelled;
		}
	}

	$("check").onclick = async () => {
		try {
			show((await api<{ output: string }>("/preflight", { phrase: phrase() })).output);
		} catch (e) {
			show((e as Error).message, true);
		}
	};

	$("train").onclick = async () => {
		try {
			render(await api<Job>("/train", { phrase: phrase(), threshold: threshold() }));
			clearTimeout(timer);
			timer = window.setTimeout(poll, 2000);
		} catch (e) {
			show((e as Error).message, true);
		}
	};

	$("cancel").onclick = async () => {
		if (!confirm("Stop training? Progress inside the current step is lost; finished steps are kept for next time.")) return;
		try {
			await api("/cancel", {});
		} catch (e) {
			show((e as Error).message, true);
		}
	};

	// Resume an in-progress run after a reload.
	void api<Job | null>("/train").then((job) => {
		if (job?.running) void poll();
	}).catch(() => {});
}
