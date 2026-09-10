import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { checkIsolatedAuth } from "./foundation-auth-check.mjs";

// Read the existing schema/reference catalogue only. Never copy account data,
// provider secrets, Storage objects or backup archives into the validation DB.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docker = path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe");
const source = "supabase_db_evershine-erp-m2-local";
const clone = `evershine-foundation-check-${randomUUID()}`;
const label = "evershine.foundation-check";
const exec = promisify(execFile);
async function run(args, input) {
  if (input === undefined) return (await exec(docker, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true })).stdout;
  return new Promise((resolve, reject) => {
    const child = execFile(docker, args, { maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${args[0]} failed: ${stderr}`));
      else resolve(stdout);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const sqlArgs = (name) => ["exec", "-i", name, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...(name === clone ? ["-h", "/tmp"] : [])];
let created = false;
const extraContainers = [];
const candidateSql = new Map();
const report = { kind: "schema-only-isolated-foundation-check", startedAt: new Date().toISOString(), sourceFiles: {}, migrations: [], tests: [], noNetwork: true, noLiveMounts: true, noAccountDataCopied: true };
try {
  for (const file of ["scripts/foundation-db-check.mjs", "scripts/foundation-auth-check.mjs"]) {
    report.sourceFiles[file] = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
  }
  // Include exact candidate hashes: HEAD alone omits uncommitted fixes, and
  // the source database may already contain some migration versions.
  for (const directory of ["supabase/migrations", "supabase/tests"]) {
    for (const file of (await readdir(path.join(root, directory))).filter(file => file.endsWith(".sql")).sort()) {
      const relative = `${directory}/${file}`;
      const bytes = await readFile(path.join(root, relative));
      report.sourceFiles[relative] = createHash("sha256").update(bytes).digest("hex");
      candidateSql.set(relative, bytes.toString("utf8"));
    }
  }
  const image = (await run(["inspect", "--format", "{{.Image}}", source])).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("Invalid source image identity");
  report.image = image;
  const applied = new Set((await run(sqlArgs(source), "select version from supabase_migrations.schema_migrations order by version;")).trim().split(/\r?\n/));
  const roles = await run(["exec", source, "pg_dumpall", "-U", "supabase_admin", "--roles-only", "--no-role-passwords"]);
  const schema = await run(["exec", source, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "--schema-only"]);
  const catalogue = await run(["exec", source, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "--data-only", "-t", "public.pages", "-t", "public.positions", "-t", "public.position_page_permissions", "-t", "public.position_action_permissions", "-t", "auth.schema_migrations"]);
  await run(["run", "-d", "--name", clone, "--label", `${label}=${clone}`, "--network", "none", "--user", "postgres", "--entrypoint", "sh", image, "-c", "initdb -D /tmp/erp-pg -U supabase_admin -A trust >/tmp/erp-init.log && exec postgres -D /tmp/erp-pg -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp"]);
  created = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { await run(["exec", clone, "pg_isready", "-h", "/tmp", "-U", "supabase_admin"]); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw Error("Isolated database did not start");
  await run(sqlArgs(clone), roles.replace(/^CREATE ROLE supabase_admin;\r?$/m, ""));
  await run(sqlArgs(clone), schema);
  await run(sqlArgs(clone), catalogue);
  // Runtime singleton state is synthetic; no live scheduler/connector state is copied.
  await run(sqlArgs(clone), `
    insert into private.recovery_throttle default values;
    insert into public.local_backup_schedule default values;
    insert into public.locations(code,name,location_type,display_order) values
      ('head-office','Head Office','office',1),('operations-warehouse','Operations Warehouse','warehouse',2),('reserve-warehouse','Reserve Warehouse','warehouse',3);
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('profile-photos','profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
    create extension if not exists pgtap with schema extensions;
  `);
  for (const file of [...candidateSql.keys()].filter(file => file.startsWith("supabase/migrations/")).map(file => file.split("/").at(-1)).sort()) {
    if (!file.endsWith(".sql") || applied.has(file.split("_")[0])) continue;
    await run(sqlArgs(clone), `begin;\n${candidateSql.get(`supabase/migrations/${file}`)}\ncommit;`);
    report.migrations.push(file);
  }
  for (const file of [...candidateSql.keys()].filter(file => file.startsWith("supabase/tests/") && file.endsWith(".test.sql")).map(file => file.split("/").at(-1)).sort()) {
    const output = await run(sqlArgs(clone), candidateSql.get(`supabase/tests/${file}`));
    const planned = Number(output.match(/^1\.\.(\d+)\s*$/m)?.[1]);
    const passed = (output.match(/^ok \d+\b/gm) ?? []).length;
    if (!planned || passed !== planned || /^not ok|^# Looks like/m.test(output)) throw Error(`${file}: ${output}`);
    report.tests.push({ file, assertions: passed, status: "pass" });
    console.log(`${file}: ${passed}/${planned} passed`);
  }
  if (process.argv.includes("--auth")) {
    report.auth = await checkIsolatedAuth({ run, clone, sql: input => run(sqlArgs(clone), input), label, register: name => extraContainers.push(name) });
    console.log(`Isolated Auth: ${report.auth.checks.length} workflows passed`);
  }
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const name of extraContainers.reverse()) {
    const owned = (await run(["inspect", "--format", `{{index .Config.Labels "${label}"}}`, name])).trim();
    if (owned !== name) throw Error("Auth cleanup refused: container identity mismatch");
    await run(["rm", "-f", "-v", name]);
  }
  if (created) {
    const owned = (await run(["inspect", "--format", `{{index .Config.Labels "${label}"}}`, clone])).trim();
    if (owned !== clone) throw Error("Cleanup refused: container identity mismatch");
    await run(["rm", "-f", "-v", clone]);
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(path.join(root, ".runtime/evidence"), { recursive: true });
  await writeFile(path.join(root, ".runtime/evidence/foundation-db-check.json"), JSON.stringify(report, null, 2));
}
