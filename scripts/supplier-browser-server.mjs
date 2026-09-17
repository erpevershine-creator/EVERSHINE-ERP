import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".runtime", "supplier-browser");
const config = await readFile(
  path.join(runtime, "supabase", "config.toml"),
  "utf8",
);
if (!config.includes('project_id = "evershine-supplier-browser-20260916"'))
  throw new Error("ISOLATED_PROJECT_REQUIRED");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const status = JSON.parse(
  execFileSync(
    process.execPath,
    [cli, "status", "--workdir", runtime, "--output", "json"],
    { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  ).toString(),
);
if (
  status.API_URL !== "http://127.0.0.1:55621" ||
  !status.ANON_KEY ||
  !status.SERVICE_ROLE_KEY
)
  throw new Error("ISOLATED_API_REQUIRED");

const server = spawn(
  process.execPath,
  [
    path.join(root, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
      SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY,
      EVERSHINE_LOCAL_REVIEW: "1",
      EVERSHINE_AUTH_REQUIRED: "1",
      EVERSHINE_TEST_DIST_DIR: ".next-supplier-browser",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
process.on("SIGINT", () => server.kill());
process.on("SIGTERM", () => server.kill());
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
