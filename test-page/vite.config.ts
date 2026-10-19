import { readdirSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, sep } from "node:path";
import { defineConfig } from "vite";

const CLIPS = join(homedir(), ".cache", "wakeword-toolkit", "model");

// Dev only: GET /clip-files/<phrase>/<split> lists wavs (random sample), GET /clip-files/<phrase>/<split>/<file> streams one.
const clips = {
	name: "training-clips",
	configureServer(server: import("vite").ViteDevServer) {
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
				const pick = all.sort(() => Math.random() - 0.5).slice(0, 30);
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ total: all.length, files: pick }));
			} catch {
				res.statusCode = 404;
				res.end();
			}
		});
	},
};

// Serves ../bundles at / so the page can load /hey_jarvis.wakeword; imports the runtime straight from source.
export default defineConfig({
	publicDir: "../bundles",
	plugins: [clips],
	server: { fs: { allow: [".."] } },
	optimizeDeps: { exclude: ["onnxruntime-web"] },
});
