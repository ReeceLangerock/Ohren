import { strFromU8, unzipSync } from "fflate";
import { type Manifest, parseManifest } from "./manifest";

export interface Bundle {
	manifest: Manifest;
	melspec: Uint8Array;
	embedding: Uint8Array;
	classifier: Uint8Array;
}

export function readBundle(bytes: Uint8Array): Bundle {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes);
	} catch {
		throw new Error("Invalid bundle: not a zip file");
	}
	if (!files["manifest.json"])
		throw new Error("Invalid bundle: manifest.json missing");
	const manifest = parseManifest(strFromU8(files["manifest.json"]));
	const get = (k: keyof Manifest["models"]) => {
		const f = files[manifest.models[k]];
		if (!f) throw new Error(`Invalid bundle: ${manifest.models[k]} missing`);
		return f;
	};
	return {
		manifest,
		melspec: get("melspec"),
		embedding: get("embedding"),
		classifier: get("classifier"),
	};
}
