import { WORKLET_NAME, WORKLET_SOURCE } from "./worklet";

export interface Mic {
	stop(): void;
}

/** Opens the microphone and calls `onChunk` with 1280-sample, 16 kHz mono Float32 chunks in [-1, 1]. */
export async function startMic(
	onChunk: (c: Float32Array) => void,
): Promise<Mic> {
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error(
			"Microphone access is not available here. Use HTTPS (or localhost) in a modern browser.",
		);
	}
	let stream: MediaStream;
	try {
		// Keep echo cancellation (speakers may be playing); AGC and noise suppression would distort the model's input.
		stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: false,
				autoGainControl: false,
			},
		});
	} catch (e) {
		const name = (e as DOMException).name;
		if (name === "NotAllowedError" || name === "SecurityError") {
			throw new Error(
				"Microphone permission was denied. Allow microphone access for this site and try again.",
			);
		}
		if (name === "NotFoundError") throw new Error("No microphone was found.");
		throw new Error(`Could not start the microphone: ${(e as Error).message}`);
	}
	const ctx = new AudioContext();
	const url = URL.createObjectURL(
		new Blob([WORKLET_SOURCE], { type: "text/javascript" }),
	);
	try {
		await ctx.audioWorklet.addModule(url);
	} finally {
		URL.revokeObjectURL(url);
	}
	const node = new AudioWorkletNode(ctx, WORKLET_NAME, { numberOfOutputs: 0 });
	node.port.onmessage = (e) => onChunk(e.data);
	ctx.createMediaStreamSource(stream).connect(node);
	await ctx.resume(); // Safari/Chrome start suspended until a user gesture; start() must be called from one
	return {
		stop() {
			for (const t of stream.getTracks()) t.stop();
			node.disconnect();
			void ctx.close();
		},
	};
}
