import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workdir = path.join(root, ".runtime/browser-foundation");
const config = await readFile(path.join(workdir, "supabase/config.toml"), "utf8");
if (!config.includes('project_id = "evershine-foundation-browser-20260913"')) throw Error("ISOLATED_PROJECT_REQUIRED");
const status = JSON.parse(execFileSync(process.execPath, [path.join(root,"node_modules/supabase/dist/supabase.js"),"status","--workdir",workdir,"--output","json"], { windowsHide: true, stdio: ["ignore","pipe","ignore"] }).toString());
if (status.API_URL !== "http://127.0.0.1:55421" || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw Error("ISOLATED_API_REQUIRED");
// Credentials belong exclusively to the empty disposable stack; no .env file,
// main database access, backup worker or scheduler is started by this launcher.
const server = spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"dev","--webpack","--hostname","127.0.0.1","--port","3100"], {
  cwd: root, windowsHide: true, stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY, EVERSHINE_LOCAL_REVIEW:"1", EVERSHINE_AUTH_REQUIRED:"1", NEXT_TELEMETRY_DISABLED:"1" },
});
process.on("SIGINT",()=>server.kill());
process.on("SIGTERM",()=>server.kill());
server.on("exit",code=>{process.exitCode=code ?? 1;});
