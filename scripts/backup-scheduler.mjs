// Supervised by the local development server. No user token or cloud scheduler.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const workers = [
  [fileURLToPath(new URL("./local-backup.mjs", import.meta.url)), "tick"],
  [fileURLToPath(new URL("./password-expiry-reminders.mjs", import.meta.url))],
  [fileURLToPath(new URL("./approval-deadline-jobs.mjs", import.meta.url))],
];
let stopped = false,
  timer;
function stop() {
  stopped = true;
  clearTimeout(timer);
}
process.stdin.resume();
process.stdin.on("end", stop);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function tick() {
  if (stopped) return;
  for (const [worker, ...args] of workers) {
    await new Promise((resolve) => {
      const job = spawn(process.execPath, [worker, ...args], {
        windowsHide: true,
        stdio: "ignore",
      });
      job.once("error", resolve);
      job.once("exit", resolve);
    });
  }
  if (!stopped) timer = setTimeout(tick, 60000);
}
await tick();
