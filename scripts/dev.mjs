import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      EVERSHINE_LOCAL_REVIEW: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
const scheduler =
  process.platform === "win32"
    ? spawn(
        process.execPath,
        [path.join(root, "scripts/backup-scheduler.mjs")],
        { cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
      )
    : null;
scheduler?.on("error", () =>
  console.error("Local foundation scheduler unavailable"),
);
scheduler?.stdin.on("error", () => {});
const stopScheduler = () => scheduler?.stdin.end();
child.on("error", (error) => {
  stopScheduler();
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  stopScheduler();
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => {
  stopScheduler();
  child.kill("SIGINT");
});
process.on("SIGTERM", () => {
  stopScheduler();
  child.kill("SIGTERM");
});
