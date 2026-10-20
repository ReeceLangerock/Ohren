import { $, api, setDisabled } from "./ui";

type Job = { phrase: string; log: string; step?: string; running: boolean; code?: number; bundle?: string };

/** Stage names match `step()` in trainer/wakeword_trainer/train.py. */
const STEPS = [
	{ id: "check", title: "Check the phrase", note: "Warns if it is short or common enough to false-trigger." },
	{ id: "data", title: "Get training data", note: "First run only: downloads about 17 GB of speech features, room echoes and background noise." },
	{ id: "generate", title: "Generate synthetic speech", note: "A text-to-speech model says your phrase thousands of times in many voices, plus similar-sounding phrases to learn to ignore. About 13 minutes." },
	{ id: "augment", title: "Add noise and echo", note: "Mixes the clips with background noise and room reverb so it works in real rooms." },
	{ id: "train", title: "Train the model", note: "Teaches a small classifier to tell your phrase from everything else. About 10 minutes." },
	{ id: "package", title: "Package the bundle", note: "Writes one .wakeword file with the models and settings." },
];

const phrase = () => $<HTMLInputElement>("phrase").value.trim();
const threshold = () => Number($<HTMLInputElement>("trainThr").value);

/** Progress bars use \r to redraw one line; show only the latest state of each line. */
const tidy = (log: string) =>
	log.split("\n").map((l) => l.split("\r").pop()).filter((l) => l && !l.startsWith("##STEP")).slice(-14).join("\n");

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
			return li;
		}),
	);
}

function render(job: Job) {
	$("logBox").hidden = false;
	$("log").textContent = tidy(job.log);
	$("log").scrollTop = $("log").scrollHeight;
	setDisabled(["train", "check"], job.running);
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
			show(`Done. "${job.phrase}" is ready and loaded below.`);
			onDone(job.bundle as string);
		} else {
			show("Training failed. See the log above.", true);
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

	// Resume an in-progress run (or show the last result) after a reload.
	void api<Job | null>("/train").then((job) => {
		if (job?.running) void poll();
	}).catch(() => {});
}
