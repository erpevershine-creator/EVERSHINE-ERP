import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { createHash, randomBytes } from "node:crypto";
import { encryptStream, signManifest } from "../scripts/backup-crypto.mjs";
import { backupRelativePath } from "../scripts/backup-folder.mjs";
import { maintainBackupRetention } from "../scripts/prune-backups.mjs";
const now = new Date("2026-09-10T00:00:00Z");
async function fixture() {
  const root = await fs.mkdtemp(path.join(tmpdir(), "erp-retention-test-")),
    key = randomBytes(32);
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    origin: "scheduled",
    status: "verified",
    created_at: `2026-09-0${i + 1}T12:00:00Z`,
    archive_state: "present",
    prune_replacement_id: null,
    prune_checked_at: null,
  }));
  const folder = (b) =>
    path.join(root, ".runtime/backups", backupRelativePath(b.id, b.created_at));
  for (const b of [rows[0], rows[7]]) {
    await fs.mkdir(folder(b), { recursive: true });
    const artifacts = {};
    for (const name of [
      "database",
      "roles",
      "storage",
      "storageIndex",
      "runtimeConfiguration",
    ])
      artifacts[name] = await encryptStream(
        Readable.from(["private synthetic fixture"]),
        path.join(folder(b), name + ".enc"),
        key,
      );
    const manifest = { id: b.id, artifacts },
      saved = { manifest, signature: signManifest(manifest, key) };
    b.manifest_sha256 = createHash("sha256")
      .update(JSON.stringify(saved))
      .digest("hex");
    await fs.writeFile(
      path.join(folder(b), "manifest.json"),
      JSON.stringify(saved),
    );
  }
  let failFinalize = false;
  const query = async (sql) => {
    if (sql.startsWith("select coalesce"))
      return Buffer.from(JSON.stringify(rows));
    const id = sql.match(/where id='([^']+)'/)?.[1],
      b = rows.find((r) => r.id === id);
    assert.ok(b);
    if (sql.includes("set archive_state='pruning'")) {
      b.archive_state = "pruning";
      b.prune_replacement_id = rows[7].id;
      return Buffer.from(b.id);
    }
    if (sql.includes("set archive_state='pruned'")) {
      if (failFinalize) {
        failFinalize = false;
        throw Error("simulated database outage");
      }
      b.archive_state = "pruned";
      return Buffer.from("");
    }
    if (sql.includes("prune_error_code=")) b.prune_error_code = "CHECK_FAILED";
    return Buffer.from("");
  };
  return {
    root,
    key,
    rows,
    folder,
    query,
    failOnce() {
      failFinalize = true;
    },
    async cleanup() {
      const resolved = await fs.realpath(root);
      if (
        !resolved.startsWith(
          path.resolve(tmpdir()) + path.sep + "erp-retention-test-",
        )
      )
        throw Error("Unsafe test cleanup");
      await fs.rm(resolved, { recursive: true });
    },
  };
}
test("retention preserves a local archive until its remote copy is verified", async () => {
  const f = await fixture();
  try {
    await maintainBackupRetention({...f,getKey:async()=>f.key,replacementId:f.rows[7].id,now,canPrune:async()=>false});
    assert.equal(f.rows[0].archive_state,"present");
    await fs.stat(f.folder(f.rows[0]));
    await maintainBackupRetention({...f,getKey:async()=>f.key,replacementId:f.rows[7].id,now,canPrune:async()=>true});
    assert.equal(f.rows[0].archive_state,"pruned");
    await assert.rejects(fs.stat(f.folder(f.rows[0])),{code:"ENOENT"});
  } finally { await f.cleanup(); }
});
test("retention validates replacement before deletion and keeps corrupt replacement fail-closed", async () => {
  const f = await fixture();
  try {
    await fs.writeFile(
      path.join(f.folder(f.rows[7]), "database.enc"),
      "corrupt",
    );
    await maintainBackupRetention({
      ...f,
      getKey: async () => f.key,
      replacementId: f.rows[7].id,
      now,
    });
    assert.equal(f.rows[0].archive_state, "present");
    await fs.stat(f.folder(f.rows[0]));
  } finally {
    await f.cleanup();
  }
});
test("interrupted archive deletion reconciles without marking a missing archive usable", async () => {
  const f = await fixture();
  try {
    f.failOnce();
    await maintainBackupRetention({
      ...f,
      getKey: async () => f.key,
      replacementId: f.rows[7].id,
      now,
    });
    assert.equal(f.rows[0].archive_state, "pruning");
    await assert.rejects(fs.stat(f.folder(f.rows[0])), { code: "ENOENT" });
    await maintainBackupRetention({ ...f, getKey: async () => f.key, now });
    assert.equal(f.rows[0].archive_state, "pruned");
    await fs.stat(f.folder(f.rows[7]));
  } finally {
    await f.cleanup();
  }
});
test("manual archive and unexpected extra files are preserved", async () => {
  const f = await fixture();
  try {
    f.rows[0].origin = "manual";
    await maintainBackupRetention({
      ...f,
      getKey: async () => f.key,
      replacementId: f.rows[7].id,
      now,
    });
    await fs.stat(f.folder(f.rows[0]));
    assert.equal(f.rows[0].archive_state, "present");
    f.rows[0].origin = "scheduled";
    await fs.writeFile(
      path.join(f.folder(f.rows[0]), "do-not-delete.txt"),
      "unrelated",
    );
    await maintainBackupRetention({
      ...f,
      getKey: async () => f.key,
      replacementId: f.rows[7].id,
      now,
    });
    assert.equal(
      await fs.readFile(
        path.join(f.folder(f.rows[0]), "do-not-delete.txt"),
        "utf8",
      ),
      "unrelated",
    );
  } finally {
    await f.cleanup();
  }
});
