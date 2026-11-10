import { defineConfig } from "@trigger.dev/sdk";
import { aptGet } from "@trigger.dev/build/extensions/core";
import { pythonExtension } from "@trigger.dev/python/extension";

// The scheduler is a thin TypeScript shell: every step runs in the Python package under pipeline/.
export default defineConfig({
  project: "proj_xecfeplxjqjfqujhletk",
  dirs: ["./trigger"],
  runtime: "node",
  maxDuration: 1800,
  machine: "medium-1x",
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },
  },
  build: {
    extensions: [
      aptGet({ packages: ["libgomp1"] }), // OpenMP runtime for LightGBM
      pythonExtension({
        requirementsFile: "./requirements.txt",
        devPythonBinaryPath: "./pipeline/.venv/bin/python",
        scripts: ["./pipeline/run.py", "./pipeline/src/**/*.py"],
      }),
    ],
  },
});
