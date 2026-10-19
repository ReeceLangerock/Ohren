/** Fires when the score stays at/above threshold for `patience` consecutive frames, then stays quiet for `cooldownMs`. */
export class Detector {
	private run = 0;
	private quietUntil = -Infinity;

	constructor(
		public threshold: number,
		private patience: number,
		private cooldownMs: number,
	) {}

	/** `tMs` is audio time (end of the frame just scored). */
	update(score: number, tMs: number): boolean {
		if (tMs < this.quietUntil) return false;
		this.run = score >= this.threshold ? this.run + 1 : 0;
		if (this.run < this.patience) return false;
		this.run = 0;
		this.quietUntil = tMs + this.cooldownMs;
		return true;
	}
}
