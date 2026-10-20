import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLES = join(ROOT, "bundles");
const WAKEWORD = process.env.OHREN_WAKEWORD ?? join(ROOT, "trainer", ".venv", "bin", "wakeword"); // env override is for testing the UI without a real run
const CLIPS = join(homedir(), ".cache", "wakeword-toolkit", "model");
const PHRASE = /^[a-z']+( [a-z']+)*$/i; // same rule as trainer/wakeword_trainer/preflight.py
const LOG_LIMIT = 20_000;

type Job = {
	phrase: string;
	log: string;
	step?: string;
	stepAt?: number;
	running: boolean;
	cancelled?: boolean;
	code?: number;
	bundle?: string;
	result?: Record<string, number>;
};
let job: Job | undefined;
let child: ChildProcess | undefined;

const send = (res: ServerResponse, status: number, body: unknown) => {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(body));
};

async function readJson(req: IncomingMessage) {
	let raw = "";
	for await (const chunk of req) raw += chunk;
	return JSON.parse(raw || "{}") as { phrase?: string; threshold?: number };
}

const preflight = (phrase: string) =>
	new Promise<{ ok: boolean; output: string }>((done) =>
		execFile(WAKEWORD, ["preflight", phrase], (e, out, err) => done({ ok: !e, output: (out + err).trim() })),
	);

function startTraining(phrase: string, threshold: number): Job {
	const slug = phrase.toLowerCase().replace(/ /g, "_");
	const j: Job = { phrase, log: "", running: true, bundle: `/${slug}.wakeword` };
	const append = (d: Buffer) => {
		for (const m of String(d).matchAll(/##STEP (\w+)/g)) {
			j.step = m[1];
			j.stepAt = Date.now();
		}
		for (const m of String(d).matchAll(/##RESULT (\{.*\})/g)) j.result = JSON.parse(m[1]);
		j.log = (j.log + d).slice(-LOG_LIMIT);
	};
	// detached: the trainer starts its own subprocesses, and cancelling has to stop the whole group.
	child = spawn(WAKEWORD, ["train", phrase, "--out", join(BUNDLES, `${slug}.wakeword`), "--threshold", String(threshold)], {
		env: { ...process.env, PYTHONUNBUFFERED: "1" },
		detached: true,
	});
	child.stdout?.on("data", append);
	child.stderr?.on("data", append);
	child.on("close", (code) => {
		j.running = false;
		j.code = code ?? 1;
		child = undefined;
	});
	return j;
}

// Dev only, bound to localhost by Vite. Runs the local trainer CLI and serves the files it produces.
const trainer = {
	name: "trainer-api",
	configureServer(server: import("vite").ViteDevServer) {
		server.middlewares.use("/api", async (req, res) => {
			const route = `${req.method} ${(req.url ?? "/").split("?")[0]}`;
			try {
				if (route === "GET /bundles") {
					const names = readdirSync(BUNDLES).filter((f) => f.endsWith(".wakeword")).sort();
					return send(res, 200, names);
				}
				if (route === "GET /train") return send(res, 200, job ?? null);
				if (req.method !== "POST") return send(res, 404, { error: "not found" });
				// A cross-site page can't send JSON without a CORS preflight, which this server never answers.
				if (!req.headers["content-type"]?.startsWith("application/json")) return send(res, 415, { error: "JSON only" });
				if (route === "POST /cancel") {
					if (!job?.running || !child?.pid) return send(res, 409, { error: "Nothing is training." });
					job.cancelled = true;
					process.kill(-child.pid, "SIGTERM");
					return send(res, 200, job);
				}
				const { phrase = "", threshold = 0.5 } = await readJson(req);
				if (!PHRASE.test(phrase.trim()) || phrase.length > 40) return send(res, 400, { error: "Use letters, apostrophes and spaces only (40 characters max)." });
				if (!existsSync(WAKEWORD)) return send(res, 500, { error: "Trainer is not set up. Run trainer/setup.sh first." });
				const p = phrase.trim().replace(/\s+/g, " ");
				if (route === "POST /preflight") return send(res, 200, { output: (await preflight(p)).output });
				if (route === "POST /train") {
					if (job?.running) return send(res, 409, { error: `Already training "${job.phrase}".` });
					if (existsSync(join(BUNDLES, `${p.toLowerCase().replace(/ /g, "_")}.wakeword`))) return send(res, 409, { error: "A bundle with that name already exists. Delete or rename it first." });
					if (!(threshold >= 0.05 && threshold <= 0.99)) return send(res, 400, { error: "Threshold must be between 0.05 and 0.99." });
					const check = await preflight(p); // rejects phrases the trainer would refuse, before any work starts
					if (!check.ok) return send(res, 400, { error: check.output.replace(/^error: /, "") });
					job = startTraining(p, threshold);
					return send(res, 200, job);
				}
				send(res, 404, { error: "not found" });
			} catch (e) {
				send(res, 500, { error: (e as Error).message });
			}
		});

		// GET /clip-files/<phrase>/<split> lists wavs (random sample); .../<file> streams one. Limited to the trainer cache.
		server.middlewares.use("/clip-files", (req, res) => {
			const p = normalize(join(CLIPS, decodeURIComponent((req.url ?? "/").split("?")[0])));
			if (!p.startsWith(CLIPS + sep)) {
				res.statusCode = 403;
				return res.end();
			}
			try {
				if (p.endsWith(".wav")) {
					res.setHeader("Content-Type", "audio/wav");
					return createReadStream(p).pipe(res);
				}
				const all = readdirSync(p).filter((f) => f.endsWith(".wav"));
				send(res, 200, { total: all.length, files: all.sort(() => Math.random() - 0.5).slice(0, 30) });
			} catch {
				res.statusCode = 404;
				res.end();
			}
		});
	},
};

// Serves ../bundles at / so the page can load /prometheus.wakeword; imports the runtime straight from source.
export default defineConfig({
	publicDir: "../bundles",
	plugins: [trainer],
	server: { fs: { allow: [".."] } },
	optimizeDeps: { exclude: ["onnxruntime-web"] },
});
