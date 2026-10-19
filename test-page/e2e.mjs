// End-to-end check in real headless Chromium: fake microphone playing a fixture, threshold slider on a WAV, mic denial.
import { createServer } from "vite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => resolve(here, "../fixtures", `${n}.wav`);
const server = await createServer({ root: here, server: { port: 5199 }, logLevel: "error" });
await server.listen();
const url = "http://localhost:5199/";

async function page(browser, ctxOpts = {}) {
	const ctx = await browser.newContext(ctxOpts);
	const p = await ctx.newPage();
	p.on("pageerror", (e) => console.log("pageerror:", e.message));
	await p.goto(url);
	await p.waitForFunction(() => document.getElementById("status").textContent.startsWith("Loaded"), null, { timeout: 60000 });
	return p;
}
const launch = (file) =>
	chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${fixture(file)}`] });

let failed = false;
const check = async (name, fn) => {
	try { await fn(); console.log("ok  ", name); } catch (e) { failed = true; console.log("FAIL", name, "\n", e.message); }
};

await check("fake mic playing the phrase triggers a detection", async () => {
	const b = await launch("pos_jarvis_samantha");
	const p = await page(b, { permissions: ["microphone"] });
	await p.click("#start");
	await p.waitForFunction(() => Number(document.getElementById("hits").textContent) >= 1, null, { timeout: 15000 });
	await b.close();
});

await check("fake mic playing other speech triggers nothing", async () => {
	const b = await launch("neg_speech");
	const p = await page(b, { permissions: ["microphone"] });
	await p.click("#start");
	await p.waitForTimeout(8000);
	assert.equal(await p.textContent("#hits"), "0");
	await b.close();
});

await check("threshold slider changes WAV result without reloading", async () => {
	const b = await launch("neg_silence");
	const p = await page(b);
	await p.setInputFiles("#file", fixture("pos_jarvis_daniel")); // score ramps up over several frames
	await p.waitForFunction(() => document.getElementById("fileOut").textContent.includes("detection"), null, { timeout: 30000 });
	const firstHit = async () => Number((await p.textContent("#fileOut")).match(/at ([\d.]+)s/)?.[1]);
	const low = await firstHit();
	await p.$eval("#thr", (el) => { el.value = "0.97"; el.dispatchEvent(new Event("input")); });
	const high = await firstHit();
	assert.ok(low > 0 && high > low, `expected a later detection at a higher threshold (low=${low}, high=${high})`);
	await b.close();
});

await check("denied microphone shows a clear message", async () => {
	// Headless Chromium can't show a permission prompt, so stub the rejection a real denial produces.
	const b = await chromium.launch();
	const p = await page(b);
	await p.evaluate(() => {
		navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
	});
	await p.click("#start");
	await p.waitForFunction(() => document.getElementById("status").className === "err", null, { timeout: 10000 });
	assert.match(await p.textContent("#status"), /permission was denied/i);
	await b.close();
});

await server.close();
process.exit(failed ? 1 : 0);
