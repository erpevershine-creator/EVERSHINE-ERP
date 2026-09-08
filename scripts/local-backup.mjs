import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import {
  encryptStream,
  decryptStream,
  signManifest,
  verifyManifest,
  validBackupId,
} from "./backup-crypto.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = "supabase_db_evershine-erp-m2-local",
  STORAGE = "supabase_storage_evershine-erp-m2-local";
const docker = path.join(
  process.env.LOCALAPPDATA ?? "",
  "Programs/DockerDesktop/resources/bin/docker.exe",
);
const psql = [
  "exec",
  "-i",
  DB,
  "psql",
  "-X",
  "-qAt",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
];
function command(args, input, exe = docker) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let chunks = [],
      size = 0,
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("COMMAND_TIMEOUT"));
    }, 180000);
    child.stdout.on("data", (b) => {
      size += b.length;
      if (size > 64 * 1024 * 1024) {
        child.kill();
        reject(Error("OUTPUT_LIMIT"));
      } else chunks.push(b);
    });
    child.stderr.on("data", (b) => {
      if (err.length < 4000) err += b.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("COMMAND_START_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else {
        const e = Error("COMMAND_FAILED");
        e.detail = err
          .split("\n")
          .filter((l) => /ERROR|FATAL|error:/.test(l))
          .map((l) => l.slice(0, 240))
          .slice(0, 2)
          .join(" ");
        reject(e);
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const query = (sql) => command(psql, sql);
function streamCommand(args) {
  const child = spawn(docker, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let err = "";
  const timer = setTimeout(() => child.kill(), 180000);
  const done = new Promise((resolve, reject) => {
    child.on("error", () => reject(Error("COMMAND_START_FAILED")));
    child.stderr.on("data", (b) => {
      if (err.length < 4000) err += b.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const e = Error("STREAM_COMMAND_FAILED");
        e.detail = err
          .split("\n")
          .filter((l) => /ERROR|error:/.test(l))
          .map((l) => l.slice(0, 240))
          .slice(0, 2)
          .join(" ");
        reject(e);
      }
    });
  });
  done.catch(() => {});
  return { child, done };
}
const schemas = "'public','private','auth','storage','supabase_migrations'";
const fingerprints = `select format('select jsonb_build_object(''table'',%L,''rows'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),''''))) from %I.%I t;',schemaname||'.'||tablename,schemaname,tablename) from pg_tables where schemaname in (${schemas}) order by schemaname,tablename\n\\gexec\n`;
async function captureSnapshot() {
  const proc = streamCommand(psql);
  let out = "";
  const ready = new Promise((resolve, reject) => {
    proc.child.stdout.on("data", (b) => {
      out += b.toString();
      if (out.includes("ERP_SNAPSHOT_READY")) resolve();
    });
    proc.done.catch(reject);
  });
  proc.child.stdin.write(
    "begin isolation level repeatable read read only;\nselect pg_export_snapshot();\n" +
      fingerprints +
      "select jsonb_build_object('object',bucket_id||'/'||name||'/'||version) from storage.objects order by id;\n\\echo ERP_SNAPSHOT_READY\n",
  );
  await ready;
  const lines = out.split(/\r?\n/).filter(Boolean),
    snapshot = lines[0];
  if (!/^[0-9A-F-]+$/i.test(snapshot)) throw Error("SNAPSHOT_INVALID");
  const objects = lines.filter((x) => x.startsWith("{")).map(JSON.parse);
  return {
    snapshot,
    tables: objects.filter((x) => x.table),
    objects: objects.filter((x) => x.object).map((x) => x.object),
    async close() {
      proc.child.stdin.end("rollback;\n");
      await proc.done;
    },
    kill() {
      proc.child.kill();
    },
  };
}
const inventoryCommand = "find . -type f -exec sha256sum {} \\; | sort";
async function storageIndex(container = STORAGE, dir = "/mnt") {
  return (
    await command([
      "exec",
      container,
      "sh",
      "-c",
      `cd ${dir} && ${inventoryCommand}`,
    ])
  )
    .toString()
    .trim();
}
async function main() {
  if (process.platform !== "win32" || process.argv[2] !== "run")
    throw Error("LOCAL_WINDOWS_ONLY");
  const id = validBackupId(process.argv[3] ?? "");
  if (
    !fs
      .readFileSync(path.join(root, "supabase/config.toml"), "utf8")
      .includes('project_id = "evershine-erp-m2-local"')
  )
    throw Error("WRONG_PROJECT");
  const folder = path.join(root, ".runtime/backups", id),
    clone = "evershine-restorecheck-" + id;
  let snapshot,
    cloneCreated = false,
    ownedJob = false,
    key,
    stage = "Preparing";
  const update = async (status, extra = "") =>
    query(
      `update public.local_backup_runs set status='${status}',stage='${stage}'${extra} where id='${id}';`,
    );
  try {
    const claimed = JSON.parse(
      (
        await query(
          `update public.local_backup_runs set status='running',stage='Preparing' where id='${id}' and status='queued' returning jsonb_build_object('id',id);`,
        )
      )
        .toString()
        .trim() || "null",
    );
    if (!claimed) throw Error("JOB_NOT_QUEUED");
    ownedJob = true;
    await query(`select private.assert_local_backup_authority('${id}');`);
    await fsp.mkdir(folder, { recursive: true });
    key = Buffer.from(
      (
        await command(
          [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            path.join(root, "scripts/backup-key.ps1"),
          ],
          undefined,
          "powershell.exe",
        )
      )
        .toString()
        .trim(),
      "base64",
    );
    if (key.length !== 32) throw Error("KEY_UNAVAILABLE");
    const image = (await command(["inspect", "--format", "{{.Image}}", DB]))
      .toString()
      .trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("IMAGE_INVALID");
    stage = "Capturing database and photos";
    await update("running");
    snapshot = await captureSnapshot();
    const beforeFiles = await storageIndex();
    for (const object of snapshot.objects) {
      if (!beforeFiles.split("\n").some((line) => line.endsWith("/" + object)))
        throw Error("STORAGE_OBJECT_MISSING");
    }
    const artifacts = {};
    artifacts.runtimeConfiguration = await encryptStream(
      Readable.from([
        JSON.stringify({
          config: fs.readFileSync(
            path.join(root, "supabase/config.toml"),
            "utf8",
          ),
          environment: fs.readFileSync(path.join(root, ".env.local"), "utf8"),
        }),
      ]),
      path.join(folder, "runtimeConfiguration.enc"),
      key,
    );
    async function capture(name, args) {
      const proc = streamCommand(args);
      proc.child.stdin.end();
      try {
        artifacts[name] = await encryptStream(
          proc.child.stdout,
          path.join(folder, name + ".enc"),
          key,
        );
        await proc.done;
      } catch (e) {
        proc.child.kill();
        throw e;
      }
    }
    await capture("database", [
      "exec",
      DB,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--format=custom",
      "--snapshot=" + snapshot.snapshot,
    ]);
    const roles = (
      await command([
        "exec",
        DB,
        "pg_dumpall",
        "-U",
        "postgres",
        "--roles-only",
        "--no-role-passwords",
      ])
    ).toString();
    artifacts.roles = await encryptStream(
      Readable.from([roles]),
      path.join(folder, "roles.enc"),
      key,
    );
    await capture("storage", [
      "exec",
      STORAGE,
      "tar",
      "-C",
      "/mnt",
      "-cf",
      "-",
      ".",
    ]);
    if (beforeFiles !== (await storageIndex()))
      throw Error("STORAGE_CHANGED_RETRY");
    artifacts.storageIndex = await encryptStream(
      Readable.from([beforeFiles]),
      path.join(folder, "storageIndex.enc"),
      key,
    );
    const tables = snapshot.tables;
    await snapshot.close();
    snapshot = null;
    const manifest = {
      format: 1,
      id,
      createdAt: new Date().toISOString(),
      image,
      tables,
      storageFiles: beforeFiles ? beforeFiles.split("\n").length : 0,
      artifacts,
    };
    const signature = signManifest(manifest, key);
    await fsp.writeFile(
      path.join(folder, "manifest.json"),
      JSON.stringify({ manifest, signature }, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    stage = "Verifying encrypted archives";
    await update("running");
    const saved = JSON.parse(
      await fsp.readFile(path.join(folder, "manifest.json"), "utf8"),
    );
    verifyManifest(saved.manifest, saved.signature, key);
    for (const [name, meta] of Object.entries(artifacts))
      await decryptStream(path.join(folder, name + ".enc"), meta, key);
    stage = "Restoring into isolated database";
    await update("running");
    // Exact source image, no exposed ports, no network, no live mounts or volumes.
    await command([
      "run",
      "-d",
      "--name",
      clone,
      "--label",
      "evershine.restorecheck=" + id,
      "--network",
      "none",
      "--user",
      "postgres",
      "--entrypoint",
      "sh",
      image,
      "-c",
      "initdb -D /tmp/erp-pg -U supabase_admin -A trust >/tmp/erp-init.log && exec postgres -D /tmp/erp-pg -c listen_addresses= -c unix_socket_directories=/tmp",
    ]);
    cloneCreated = true;
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        await command([
          "exec",
          clone,
          "pg_isready",
          "-h",
          "/tmp",
          "-U",
          "supabase_admin",
        ]);
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) throw Error("CLONE_START_FAILED");
    const cloneSql = (sql) =>
      command(
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
        sql,
      );
    await cloneSql(roles.replace(/^CREATE ROLE supabase_admin;\r?$/m, ""));
    // Use an empty database so schema/ACL restoration fails on every unexpected conflict.
    // pg_restore cleans only the new isolated database.
    const restore = streamCommand([
      "exec",
      "-i",
      clone,
      "pg_restore",
      "-h",
      "/tmp",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "--exit-on-error",
      "--clean",
      "--if-exists",
    ]);
    try {
      await decryptStream(
        path.join(folder, "database.enc"),
        artifacts.database,
        key,
        restore.child.stdin,
      );
      await restore.done;
    } catch (e) {
      restore.child.kill();
      throw e;
    }
    stage = "Comparing restored records and photos";
    await update("running");
    const restored = (await cloneSql(fingerprints))
      .toString()
      .split(/\r?\n/)
      .filter((x) => x.startsWith("{"))
      .map(JSON.parse);
    if (JSON.stringify(restored) !== JSON.stringify(tables))
      throw Error("RESTORED_DATA_MISMATCH");
    await command(["exec", clone, "mkdir", "/tmp/erp-files"]);
    const untar = streamCommand([
      "exec",
      "-i",
      clone,
      "tar",
      "-C",
      "/tmp/erp-files",
      "-xf",
      "-",
    ]);
    try {
      await decryptStream(
        path.join(folder, "storage.enc"),
        artifacts.storage,
        key,
        untar.child.stdin,
      );
      await untar.done;
    } catch (e) {
      untar.child.kill();
      throw e;
    }
    if ((await storageIndex(clone, "/tmp/erp-files")) !== beforeFiles)
      throw Error("RESTORED_PHOTO_MISMATCH");
    const checks = await cloneSql(
      "select (not has_table_privilege('anon','public.profiles','select') and not has_table_privilege('authenticated','public.profiles','update') and (select relrowsecurity from pg_class where oid='public.profiles'::regclass))::text;",
    );
    if (checks.toString().trim() !== "true")
      throw Error("RESTORED_ACCESS_CHECK_FAILED");
    stage = "Verified in isolated database";
    const digest = createHash("sha256")
      .update(JSON.stringify(saved))
      .digest("hex");
    const bytes = (
      await Promise.all(
        Object.keys(artifacts).map(
          async (n) => (await fsp.stat(path.join(folder, n + ".enc"))).size,
        ),
      )
    ).reduce((a, b) => a + b, 0);
    await query(
      `begin; update public.local_backup_runs set status='verified',stage='${stage}',finished_at=now(),archive_bytes=${bytes},table_count=${tables.length},storage_files=${manifest.storageFiles},manifest_sha256='${digest}' where id='${id}'; insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) select p.id,p.employee_name,'Local backup restore verified','local_backup',b.id::text,b.reason,jsonb_build_object('backup_id',b.id,'tables',b.table_count,'storage_files',b.storage_files,'manifest_sha256',b.manifest_sha256) from public.local_backup_runs b join public.profiles p on p.id=b.requester_id where b.id='${id}'; commit;`,
    );
    console.log(
      JSON.stringify({
        id,
        status: "verified",
        tables: tables.length,
        storageFiles: manifest.storageFiles,
        bytes,
      }),
    );
  } catch (e) {
    const code = /^[A-Z_]+$/.test(e.message) ? e.message : "BACKUP_FAILED";
    if (ownedJob)
      await query(
        `begin; update public.local_backup_runs set status='failed',stage='${stage}',error_code='${code}',finished_at=now() where id='${id}' and status in ('queued','running'); insert into public.audit_events(actor_id,actor_name,action,entity_type,entity_id,reason,after_data) select p.id,p.employee_name,'Local backup failed','local_backup',b.id::text,b.reason,jsonb_build_object('error_code',b.error_code) from public.local_backup_runs b join public.profiles p on p.id=b.requester_id where b.id='${id}' and b.status='failed'; commit;`,
      ).catch(() => {});
    if (ownedJob)
      await fsp
        .writeFile(
          path.join(folder, "diagnostic.json"),
          JSON.stringify({ stage, code, detail: e.detail }),
          { mode: 0o600 },
        )
        .catch(() => {});
    console.error(
      JSON.stringify({ id, status: "failed", stage, code, detail: e.detail }),
    );
    process.exitCode = 1;
  } finally {
    if (snapshot) snapshot.kill();
    if (key) key.fill(0);
    if (cloneCreated) {
      const label = (
        await command([
          "inspect",
          "--format",
          '{{index .Config.Labels "evershine.restorecheck"}}',
          clone,
        ]).catch(() => Buffer.from(""))
      )
        .toString()
        .trim();
      if (label === id)
        await command(["rm", "-f", "-v", clone]).catch(() => {});
    }
  }
}
main().catch(() => {
  console.error("LOCAL_BACKUP_START_FAILED");
  process.exitCode = 1;
});
