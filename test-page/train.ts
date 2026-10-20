import { $, api, setDisabled } from "./ui";

type Job = { phrase: string; log: string; running: boolean; code?: number; bundle?: string };

const phrase = () => $<HTMLInputElement>("phrase").value.trim();
const threshold = () => Number($<HTMLInputElement>("trainThr").value);

/** Progress bars use \r to redraw one line; show only the latest state of each line. */
const tidy = (log: string) =>
	log.split("\n").map((l) => l.split("\r").pop()).filter(Boolean).slice(-14).join("\n");

function show(msg: string, err = false) {
	$("trainMsg").textContent = msg;
	$("trainMsg").className = err ? "err" : "help";
}

function render(job: Job) {
	$("log").hidden = false;
	$("log").textContent = tidy(job.log);
	$("log").scrollTop = $("log").scrollHeight;
	setDisabled(["train", "check"], job.running);
	if (job.running) show(`Training "${job.phrase}"… this takes 25 to 40 minutes. You can leave this page open or reload it.`);
}

/** Starts the training card. `onDone` is called with the new bundle's URL when training succeeds. */
export function initTrain(onDone: (bundleUrl: string) => void) {
	let timer: number | undefined;

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
