import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabase = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const network = "evershine-local-loopback";
const databaseContainer = "supabase_db_evershine-erp-m2-local";

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${executable} stopped by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

function ensureLoopbackNetwork() {
  try {
    execFileSync(docker, ["network", "inspect", network], { stdio: "ignore" });
  } catch {
    execFileSync(
      docker,
      [
        "network",
        "create",
        "--driver",
        "bridge",
        "--opt",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        "--opt",
        "com.docker.network.enable_ipv6=false",
        network,
      ],
      { stdio: "inherit" },
    );
  }
}

function connectRecreatedDatabase() {
  try {
    const attached = execFileSync(
      docker,
      ["inspect", "--format", "{{json .NetworkSettings.Networks}}", databaseContainer],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (!attached.includes(`\"${network}\"`)) {
      execFileSync(docker, ["network", "connect", network, databaseContainer], {
        stdio: "ignore",
      });
    }
  } catch {
    // During reset the database container briefly does not exist. The next poll retries.
  }
}

async function start() {
  ensureLoopbackNetwork();
  return run(process.execPath, [
    supabase,
    "start",
    "-x",
    "realtime,imgproxy,studio,mailpit,edge-runtime,logflare,vector,supavisor",
    "--network-id",
    network,
  ]);
}

async function reset() {
  ensureLoopbackNetwork();
  let monitoring = true;
  let connecting = false;
  const timer = setInterval(() => {
    if (!monitoring || connecting) return;
    connecting = true;
    try {
      connectRecreatedDatabase();
    } finally {
      connecting = false;
    }
  }, 300);

  try {
    const code = await run(process.execPath, [supabase, "db", "reset"]);
    connectRecreatedDatabase();
    return code;
  } finally {
    monitoring = false;
    clearInterval(timer);
  }
}

const command = process.argv[2];
if (!new Set(["start", "reset"]).has(command)) {
  throw new Error("Usage: node scripts/local-supabase.mjs <start|reset>");
}

const exitCode = command === "start" ? await start() : await reset();
process.exitCode = exitCode;
