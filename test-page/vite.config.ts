import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLES = join(ROOT, "bundles");
const WAKEWORD = join(ROOT, "trainer", ".venv", "bin", "wakeword");
const CLIPS = join(homedir(), ".cache", "wakeword-toolkit", "model");
const PHRASE = /^[a-z0-9]+( [a-z0-9]+)*$/i;
const LOG_LIMIT = 20_000;

type Job = { phrase: string; log: string; running: boolean; code?: number; bundle?: string };
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

function startTraining(phrase: string, threshold: number): Job {
	const slug = phrase.toLowerCase().replace(/ /g, "_");
	const j: Job = { phrase, log: "", running: true, bundle: `/${slug}.wakeword` };
	const append = (d: Buffer) => (j.log = (j.log + d).slice(-LOG_LIMIT));
	child = spawn(WAKEWORD, ["train", phrase, "--out", join(BUNDLES, `${slug}.wakeword`), "--threshold", String(threshold)]);
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
				const { phrase = "", threshold = 0.5 } = await readJson(req);
				if (!PHRASE.test(phrase.trim()) || phrase.length > 40) return send(res, 400, { error: "Use letters, numbers and spaces only (40 characters max)." });
				if (!existsSync(WAKEWORD)) return send(res, 500, { error: "Trainer is not set up. Run trainer/setup.sh first." });
				const p = phrase.trim().replace(/\s+/g, " ");
				if (route === "POST /preflight") {
					return execFile(WAKEWORD, ["preflight", p], (_e, out, err) => send(res, 200, { output: (out + err).trim() }));
				}
				if (route === "POST /train") {
					if (job?.running) return send(res, 409, { error: `Already training "${job.phrase}".` });
					if (existsSync(join(BUNDLES, `${p.toLowerCase().replace(/ /g, "_")}.wakeword`))) return send(res, 409, { error: "A bundle with that name already exists. Delete or rename it first." });
					if (!(threshold >= 0.05 && threshold <= 0.99)) return send(res, 400, { error: "Threshold must be between 0.05 and 0.99." });
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
