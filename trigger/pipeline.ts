import { logger, schedules } from "@trigger.dev/sdk";
import { python } from "@trigger.dev/python";

async function mila(args: string[]) {
  const result = await python.runScript("./pipeline/run.py", args, {
    env: { MILA_DATA_DIR: "/tmp/mila", PYTHONUNBUFFERED: "1" },
  });
  logger.info(`mila ${args.join(" ")}`, { stdout: result.stdout.slice(-6000), stderr: result.stderr.slice(-3000) });
  return { stdout: result.stdout.slice(-2000) };
}

// CBSL publishes the Daily Price Report in the evening on trading days. Poll every 30 minutes from 15:00 to
// 21:00 Sri Lanka time; the job is idempotent (new reports only, forecast only when prices change).
export const daily = schedules.task({
  id: "mila-daily",
  cron: { pattern: "0,30 15-20 * * 1-5", timezone: "Asia/Colombo" },
  run: async () => mila(["daily"]),
});

// Twice-weekly digest (Monday and Thursday evening, after the report). Dry-run until an SMS gateway is set.
export const digest = schedules.task({
  id: "mila-digest",
  cron: { pattern: "45 20 * * 1,4", timezone: "Asia/Colombo" },
  run: async () => mila(["digest", "--send"]),
});
