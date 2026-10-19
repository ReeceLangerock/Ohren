import { expect, test } from "vitest";
import { Detector } from "./detector";

const run = (d: Detector, scores: number[]) =>
	scores.map((s, i) => d.update(s, (i + 1) * 80)).filter(Boolean).length;

test("needs `patience` consecutive frames over threshold", () => {
	expect(run(new Detector(0.5, 2, 0), [0.9, 0.1, 0.9, 0.1, 0.9])).toBe(0);
	expect(run(new Detector(0.5, 2, 0), [0.9, 0.9, 0.1])).toBe(1);
});

test("cooldown suppresses repeats, then re-arms", () => {
	const d = new Detector(0.5, 1, 500);
	expect(run(d, Array(5).fill(0.9))).toBe(1); // 80..400 ms: one fire at 80, quiet until 580
	expect(run(d, Array(20).fill(0.9))).toBeGreaterThan(0); // keeps ticking past the cooldown
});

test("threshold can change at runtime", () => {
	const d = new Detector(0.9, 1, 0);
	expect(d.update(0.6, 80)).toBe(false);
	d.threshold = 0.5;
	expect(d.update(0.6, 160)).toBe(true);
});
