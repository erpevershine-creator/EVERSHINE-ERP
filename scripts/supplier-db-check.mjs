import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = "supabase_db_evershine-erp-m2-local";
const clone = "evershine-supplier-check-" + randomUUID();
const label = "evershine.supplier-check";
const exec = promisify(execFile);
const run = async (args, input) =>
  input === undefined
    ? (
        await exec("docker", args, {
          windowsHide: true,
          maxBuffer: 64 * 1024 * 1024,
          timeout: 120000,
        })
      ).stdout
    : new Promise((resolve, reject) => {
        const p = execFile(
          "docker",
          args,
          { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
          (err, out, stderr) =>
            err ? reject(Error(stderr || err.message)) : resolve(out),
        );
        p.stdin.on("error", () => {});
        p.stdin.end(input);
      });
const sql = (text) =>
  run(
    [
      "exec",
      "-i",
      clone,
      "psql",
      "-X",
      "-qAt",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
const report = {
  started: new Date().toISOString(),
  source,
  clone,
  schemaOnly: true,
  accountDataCopied: false,
  network: "none",
  tests: [],
  hashes: {},
};
let created = false;
try {
  const image = (
    await run(["inspect", "--format", "{{.Image}}", source])
  ).trim();
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const roles = await run([
    "exec",
    source,
    "pg_dumpall",
    "-U",
    "supabase_admin",
    "--roles-only",
    "--no-role-passwords",
  ]);
  const schema = await run([
    "exec",
    source,
    "pg_dump",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    "--schema-only",
  ]);
  await run([
    "run",
    "-d",
    "--name",
    clone,
    "--label",
    `${label}=${clone}`,
    "--network",
    "none",
    "--user",
    "postgres",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "initdb -D /tmp/erp-pg -U supabase_admin -A trust >/tmp/erp-init.log && exec postgres -D /tmp/erp-pg -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp",
  ]);
  created = true;
  for (let i = 0; i < 60; i++) {
    try {
      await sql("select 1;");
      break;
    } catch (err) {
      if (i === 59) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await sql(roles.replace(/^CREATE ROLE supabase_admin;\r?$/m, ""));
  await sql(schema);
  assert.equal(
    (
      await run([
        "inspect",
        "--format",
        `{{index .Config.Labels "${label}"}}`,
        clone,
      ])
    ).trim(),
    clone,
  );
  // Only this labelled disposable schema is rebuilt; live source receives reads only.
  await sql(
    "drop schema public cascade; drop schema if exists private cascade; create schema public; grant usage on schema public to postgres,anon,authenticated,service_role; create extension if not exists pgtap with schema public;",
  );
  for (const file of (await readdir(path.join(root, "supabase/migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const text = await readFile(
      path.join(root, "supabase/migrations", file),
      "utf8",
    );
    report.hashes[file] = createHash("sha256").update(text).digest("hex");
    await sql("begin;\n" + text + "\ncommit;");
  }
  for (const file of (await readdir(path.join(root, "supabase/tests")))
    .filter((f) => f.endsWith(".test.sql"))
    .sort()) {
    const text = await readFile(
      path.join(root, "supabase/tests", file),
      "utf8",
    );
    report.hashes[file] = createHash("sha256").update(text).digest("hex");
    const output = await sql(text);
    const planned = Number(output.match(/^1\.\.(\d+)\s*$/m)?.[1]);
    const passed = (output.match(/^ok \d+\b/gm) || []).length;
    if (!planned || planned !== passed || /^not ok|^# Looks like/m.test(output))
      throw Error(file + "\n" + output);
    report.tests.push({ file, passed });
    console.log(file, passed, "passed");
  }
  // Real concurrent database sessions, against synthetic fixture accounts only.
  const fixture = await readFile(
    path.join(root, "supabase/tests/009_supplier_workflow.test.sql"),
    "utf8",
  );
  const seed = fixture.slice(
    fixture.indexOf("create temporary table sf"),
    fixture.indexOf("select set_config('request.jwt.claims'"),
  );
  await sql(
    seed.replace("create temporary table sf", "create table public.sf"),
  );
  const f = JSON.parse(
    (await sql("select row_to_json(sf) from public.sf;")).trim(),
  );
  const claims = `select set_config('request.jwt.claims','${JSON.stringify({ sub: f.o, role: "authenticated", session_id: f.os })}',false);`;
  const literal = (x) =>
    "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
  const save = (id, version, payload, submit) =>
    sql(
      claims +
        `select public.save_supplier_package(${id ? `'${id}'` : "null"},${version},${literal(payload)},'Concurrency evidence',${submit},'${randomUUID()}');`,
    );
  const both = await Promise.all([
    save(null, 0, { ...f.payload, legalName: "Concurrent A" }, false),
    save(null, 0, { ...f.payload, legalName: "Concurrent B" }, false),
  ]);
  const rows = both.map((out) => JSON.parse(out.trim().split(/\r?\n/).at(-1)));
  assert.notEqual(rows[0].code, rows[1].code);
  const writes = await Promise.allSettled([
    save(rows[0].id, 1, { ...f.payload, legalName: "Concurrent A" }, true),
    save(
      rows[0].id,
      1,
      { ...f.payload, legalName: "Concurrent A changed" },
      true,
    ),
  ]);
  assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(writes.filter((r) => r.status === "rejected").length, 1);
  const request = JSON.parse(
    writes
      .find((r) => r.status === "fulfilled")
      .value.trim()
      .split(/\r?\n/)
      .at(-1),
  ).requestId;
  const decisions = await Promise.allSettled([
    sql(
      claims +
        `select public.decide_supplier_package(${request},'approve','Concurrent approve');`,
    ),
    sql(
      claims +
        `select public.decide_supplier_package(${request},'reject','Concurrent reject');`,
    ),
  ]);
  assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(decisions.filter((r) => r.status === "rejected").length, 1);
  report.concurrency = [
    "distinct codes under concurrent create",
    "one winner for expected-version concurrent save",
    "one winner for concurrent approve/reject",
  ];
  console.log("Concurrency: 3/3 passed");
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) {
    assert.equal(
      (
        await run([
          "inspect",
          "--format",
          `{{index .Config.Labels "${label}"}}`,
          clone,
        ])
      ).trim(),
      clone,
    );
    await run(["rm", "-f", "-v", clone]);
  }
  report.finished = new Date().toISOString();
  await mkdir(path.join(root, ".runtime/evidence"), { recursive: true });
  await writeFile(
    path.join(root, ".runtime/evidence/supplier-db-check.json"),
    JSON.stringify(report, null, 2),
  );
}
