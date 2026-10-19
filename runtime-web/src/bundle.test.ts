import { strToU8, zipSync } from "fflate";
import { expect, test } from "vitest";
import { readBundle } from "./bundle";

const manifest = (over = {}) => ({
	formatVersion: 1,
	name: "x",
	phrase: "x",
	sampleRate: 16000,
	frameSamples: 1280,
	embeddingWindow: 16,
	melspecTransform: { scale: 0.1, offset: 2 },
	threshold: 0.5,
	patienceFrames: 2,
	cooldownMs: 1500,
	models: { melspec: "m.onnx", embedding: "e.onnx", classifier: "c.onnx" },
	trainedWith: "t",
	license: "l",
	...over,
});
const zip = (m: object, extra: Record<string, Uint8Array> = {}) =>
	zipSync({
		"manifest.json": strToU8(JSON.stringify(m)),
		"m.onnx": new Uint8Array(1),
		"e.onnx": new Uint8Array(1),
		"c.onnx": new Uint8Array(1),
		...extra,
	});

test("accepts a valid bundle", () =>
	expect(readBundle(zip(manifest())).manifest.name).toBe("x"));
test("rejects unknown formatVersion", () =>
	expect(() => readBundle(zip(manifest({ formatVersion: 2 })))).toThrow(
		/Unsupported bundle formatVersion 2/,
	));
test("rejects non-zip", () =>
	expect(() => readBundle(new Uint8Array(10))).toThrow(/not a zip/));
test("rejects missing model file", () =>
	expect(() =>
		readBundle(
			zip(
				manifest({
					models: {
						melspec: "m.onnx",
						embedding: "e.onnx",
						classifier: "nope.onnx",
					},
				}),
			),
		),
	).toThrow(/nope.onnx missing/));
