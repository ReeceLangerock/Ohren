export const $ = <T extends HTMLElement>(id: string) =>
	document.getElementById(id) as T;

export const setDisabled = (ids: string[], disabled: boolean) =>
	ids.forEach((id) => ($<HTMLButtonElement>(id).disabled = disabled));

let audioCtx: AudioContext | undefined;

/** Decode any audio file to 16 kHz mono PCM. */
export async function decodeTo16kMono(file: Blob): Promise<Float32Array> {
	audioCtx ??= new AudioContext();
	const decoded = await audioCtx.decodeAudioData(await file.arrayBuffer());
	const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
	const src = off.createBufferSource();
	src.buffer = decoded;
	src.connect(off.destination);
	src.start();
	return (await off.startRendering()).getChannelData(0);
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(`/api${path}`, body === undefined ? undefined : {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const json = await res.json();
	if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
	return json as T;
}
