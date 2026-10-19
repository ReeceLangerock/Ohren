import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const shared = {
	assetsInclude: ["**/*.wakeword"],
	test: { include: ["src/**/*.test.ts"], testTimeout: 60_000 },
};

// Same tests run twice: in Node and in headless Chromium. Detection counts must match.
export default defineConfig({
	test: {
		projects: [
			{ ...shared, test: { ...shared.test, name: "node" } },
			{
				...shared,
				optimizeDeps: { exclude: ["onnxruntime-web"] },
				test: {
					...shared.test,
					name: "browser",
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [{ browser: "chromium" }],
					},
				},
			},
		],
	},
});
