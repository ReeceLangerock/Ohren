// Test-only: fixtures inlined by Vite so the same test file runs in Node and in a real browser.
const wavs = import.meta.glob("../../fixtures/*.wav", {
	query: "?inline",
	import: "default",
	eager: true,
}) as Record<string, string>;
const bundles = import.meta.glob("../../bundles/*.wakeword", {
	query: "?inline",
	import: "default",
	eager: true,
}) as Record<string, string>;

const bytes = (dataUrl: string) =>
	Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) =>
		c.charCodeAt(0),
	);
const find = (m: Record<string, string>, name: string) => {
	const k = Object.keys(m).find((k) => k.endsWith(name));
	if (!k) throw new Error(`test data not found: ${name}`);
	return bytes(m[k]);
};

export const bundle = (name: string) => find(bundles, `${name}.wakeword`);

export function wav(name: string): Float32Array {
	const b = find(wavs, `${name}.wav`);
	const v = new DataView(b.buffer);
	let p = 12;
	while (String.fromCharCode(...b.subarray(p, p + 4)) !== "data")
		p += 8 + v.getUint32(p + 4, true);
	const n = v.getUint32(p + 4, true) / 2;
	return Float32Array.from(
		{ length: n },
		(_, i) => v.getInt16(p + 8 + i * 2, true) / 32768,
	);
}
