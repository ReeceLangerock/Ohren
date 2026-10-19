export interface Manifest {
	formatVersion: 1;
	name: string;
	phrase: string;
	sampleRate: 16000;
	frameSamples: 1280;
	embeddingWindow: number;
	melspecTransform: { scale: number; offset: number };
	threshold: number;
	patienceFrames: number;
	cooldownMs: number;
	models: { melspec: string; embedding: string; classifier: string };
	trainedWith: string;
	license: string;
}

const SUPPORTED_FORMAT = 1;

export function parseManifest(json: string): Manifest {
	// biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, validated field by field below
	let m: any;
	try {
		m = JSON.parse(json);
	} catch {
		throw new Error("Invalid bundle: manifest.json is not valid JSON");
	}
	if (m?.formatVersion !== SUPPORTED_FORMAT) {
		throw new Error(
			`Unsupported bundle formatVersion ${m?.formatVersion}; this runtime supports ${SUPPORTED_FORMAT}`,
		);
	}
	if (m.sampleRate !== 16000 || m.frameSamples !== 1280) {
		throw new Error(
			"Invalid bundle: only 16 kHz audio with 1280-sample frames is supported",
		);
	}
	for (const k of ["melspec", "embedding", "classifier"]) {
		if (typeof m.models?.[k] !== "string")
			throw new Error(`Invalid bundle: manifest.models.${k} missing`);
	}
	if (!Number.isInteger(m.embeddingWindow) || !m.melspecTransform) {
		throw new Error(
			"Invalid bundle: embeddingWindow or melspecTransform missing",
		);
	}
	return m as Manifest;
}
