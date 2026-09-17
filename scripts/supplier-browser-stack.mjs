import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".runtime", "supplier-browser");
const supabaseDir = path.join(runtime, "supabase");
const project = "evershine-supplier-browser-20260916";
const network = project;
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");
const docker =
  process.platform === "win32"
    ? "C:\\Users\\DELL\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe"
    : "docker";

async function prepare() {
  await mkdir(supabaseDir, { recursive: true });
  let config = await readFile(
    path.join(root, "supabase", "config.toml"),
    "utf8",
  );
  const replacements = [
    ['project_id = "evershine-erp-m2-local"', `project_id = "${project}"`],
    ["55320", "55620"],
    ["55321", "55621"],
    ["55322", "55622"],
    ["55323", "55623"],
    ["55324", "55624"],
    ["55327", "55627"],
    ["55329", "55629"],
    ["58083", "58086"],
    ["http://127.0.0.1:3000", "http://127.0.0.1:3200"],
    ["http://localhost:3000", "http://127.0.0.1:3200"],
  ];
  for (const [from, to] of replacements) config = config.replaceAll(from, to);
  if (
    !config.includes(`project_id = "${project}"`) ||
    !config.includes("port = 55621")
  ) {
    throw new Error("ISOLATED_SUPPLIER_CONFIG_REQUIRED");
  }
  await writeFile(path.join(supabaseDir, "config.toml"), config);
  await rm(path.join(supabaseDir, "migrations"), {
    recursive: true,
    force: true,
  });
  await cp(
    path.join(root, "supabase", "migrations"),
    path.join(supabaseDir, "migrations"),
    { recursive: true },
  );
  await writeFile(
    path.join(supabaseDir, "seed.sql"),
    "-- Synthetic Supplier browser stack; intentionally empty.\n",
  );
}

function ensureNetwork() {
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

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      signal
        ? reject(new Error(`Supabase stopped by ${signal}`))
        : resolve(code ?? 1),
    );
  });
}

await prepare();
ensureNetwork();
const command = process.argv[2];
let code;
if (command === "start") {
  code = await run([
    "start",
    "--workdir",
    runtime,
    "--network-id",
    network,
    "-x",
    "realtime,imgproxy,studio,mailpit,edge-runtime,logflare,vector,supavisor",
  ]);
} else if (command === "reset") {
  code = await run([
    "db",
    "reset",
    "--workdir",
    runtime,
    "--network-id",
    network,
  ]);
} else {
  throw new Error(
    "Usage: node scripts/supplier-browser-stack.mjs <start|reset>",
  );
}
process.exitCode = code;
