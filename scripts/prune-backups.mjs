import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { backupRelativePath } from "./backup-folder.mjs";
import {
  validBackupId,
  verifyManifest,
  decryptStream,
} from "./backup-crypto.mjs";
import { planBackupRetention } from "../src/lib/backup-retention.ts";
const artifactNames = [
  "database",
  "roles",
  "storage",
  "storageIndex",
  "runtimeConfiguration",
];
const fileNames = new Set([
  "manifest.json",
  "diagnostic.json",
  ...artifactNames.map((n) => n + ".enc"),
]);
export async function archiveDirectory(base, backup, allowMissing = false) {
  const canonicalBase = await fs.realpath(base);
  const candidate = path.resolve(
    canonicalBase,
    backupRelativePath(backup.id, backup.created_at),
  );
  if (!candidate.startsWith(canonicalBase + path.sep))
    throw Error("UNSAFE_ARCHIVE_PATH");
  for (const folder of [path.dirname(candidate), candidate]) {
    try {
      const s = await fs.lstat(folder);
      if (
        !s.isDirectory() ||
        s.isSymbolicLink() ||
        (await fs.realpath(folder)) !== folder
      )
        throw Error("UNSAFE_ARCHIVE_PATH");
    } catch (e) {
      if (allowMissing && e.code === "ENOENT") return candidate;
      throw e;
    }
  }
  for (const entry of await fs.readdir(candidate, { withFileTypes: true }))
    if (!entry.isFile() || entry.isSymbolicLink() || !fileNames.has(entry.name))
      throw Error("UNEXPECTED_ARCHIVE_FILES");
  return candidate;
}
export async function verifyArchive(base, backup, key, full = true) {
  const folder = await archiveDirectory(base, backup);
  const saved = JSON.parse(
    await fs.readFile(path.join(folder, "manifest.json"), "utf8"),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(saved))
    .digest("hex");
  if (saved.manifest.id !== backup.id || digest !== backup.manifest_sha256)
    throw Error("ARCHIVE_IDENTITY_MISMATCH");
  verifyManifest(saved.manifest, saved.signature, key);
  if (
    Object.keys(saved.manifest.artifacts).sort().join(",") !==
    [...artifactNames].sort().join(",")
  )
    throw Error("INVALID_ARCHIVE_CONTENTS");
  if (full)
    for (const name of artifactNames)
      await decryptStream(
        path.join(folder, name + ".enc"),
        saved.manifest.artifacts[name],
        key,
      );
  return folder;
}
// Caller holds the same Windows worker lock used by all captures/reconciliation.
export async function maintainBackupRetention({
  root,
  query,
  getKey,
  replacementId = null,
  now = new Date(),
}) {
  const rows = JSON.parse(
    (
      await query(
        "select coalesce(jsonb_agg(jsonb_build_object('id',id,'origin',origin,'status',status,'created_at',created_at,'archive_state',archive_state,'prune_replacement_id',prune_replacement_id,'prune_checked_at',prune_checked_at,'manifest_sha256',manifest_sha256)), '[]') from public.local_backup_runs;",
      )
    ).toString(),
  );
  const byId = new Map(rows.map((b) => [b.id, b]));
  const pending = rows.filter(
    (b) =>
      b.archive_state === "pruning" &&
      (!b.prune_checked_at ||
        Date.parse(b.prune_checked_at) < now.getTime() - 30 * 60000),
  );
  const candidates = replacementId
    ? planBackupRetention(rows, now)
        .filter((p) => p.decision === "candidate")
        .map((p) => byId.get(p.id))
    : [];
  const targets = [...pending, ...candidates].slice(0, 20);
  if (!targets.length) return;
  const key = await getKey(),
    base = path.join(root, ".runtime/backups"),
    checked = new Set();
  for (const b of targets) {
    const id = validBackupId(b.id),
      replacement = byId.get(b.prune_replacement_id ?? replacementId);
    try {
      if (
        b.origin !== "scheduled" ||
        b.status !== "verified" ||
        !replacement ||
        replacement.id === id ||
        replacement.status !== "verified" ||
        replacement.archive_state !== "present" ||
        Date.parse(replacement.created_at) <= Date.parse(b.created_at)
      )
        throw Error("NO_SAFE_REPLACEMENT");
      const rid = validBackupId(replacement.id);
      if (!checked.has(rid)) {
        await verifyArchive(base, replacement, key);
        checked.add(rid);
      }
      let folder;
      if (b.archive_state === "present") {
        folder = await verifyArchive(base, b, key, false);
        const started = (
          await query(
            `with changed as (update public.local_backup_runs set archive_state='pruning',prune_replacement_id='${rid}',prune_started_at=now(),prune_checked_at=now(),prune_error_code=null where id='${id}' and origin='scheduled' and status='verified' and archive_state='present' returning *) insert into public.audit_events(actor_name,action,entity_type,entity_id,reason,after_data) select 'Local backup scheduler','Backup retention removal started','local_backup',id::text,'Scheduled archive outside retained daily/monthly/yearly periods',jsonb_build_object('replacement_id',prune_replacement_id) from changed returning entity_id;`,
          )
        )
          .toString()
          .trim();
        if (started !== id) throw Error("PRUNE_STATE_CHANGED");
      } else {
        folder = await archiveDirectory(base, b, true);
        await query(
          `update public.local_backup_runs set prune_checked_at=now() where id='${id}' and archive_state='pruning';`,
        );
      }
      // Exact canonical date/UUID directory was checked above. Never remove its date parent, base or arbitrary paths.
      await fs.rm(folder, { recursive: true, force: true });
      await query(
        `with changed as (update public.local_backup_runs set archive_state='pruned',pruned_at=now(),prune_error_code=null where id='${id}' and archive_state='pruning' returning *) insert into public.audit_events(actor_name,action,entity_type,entity_id,reason,after_data) select 'Local backup scheduler','Backup archive removed by retention','local_backup',id::text,'Verified replacement preserved; metadata and audit retained',jsonb_build_object('replacement_id',prune_replacement_id) from changed;`,
      );
      b.archive_state = "pruned";
    } catch (e) {
      const code = /^[A-Z_]+$/.test(e.message)
        ? e.message
        : "RETENTION_IO_FAILED";
      await query(
        `update public.local_backup_runs set prune_error_code='${code}',prune_checked_at=now() where id='${id}' and origin='scheduled' and archive_state<>'pruned';`,
      ).catch(() => {});
    }
  }
}
