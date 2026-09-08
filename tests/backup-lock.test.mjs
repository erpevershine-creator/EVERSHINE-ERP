import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { acquireBackupLock } from "../scripts/backup-lock.mjs";
test(
  "Windows worker lock excludes competitors and is recoverable after holder loss",
  { skip: process.platform !== "win32" },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "erp-lock-test-")),
      file = path.join(dir, "worker.lock");
    let first,
      third,
      lost = false;
    try {
      first = await acquireBackupLock(file, () => {
        lost = true;
      });
      assert.ok(first);
      assert.equal(await acquireBackupLock(file), null);
      const closed = once(first.process, "close");
      first.process.kill();
      await closed;
      assert.equal(lost, true);
      third = await acquireBackupLock(file);
      assert.ok(third);
      const released = once(third.process, "close");
      third.release();
      await released;
      third = null;
    } finally {
      if (third) {
        const done = once(third.process, "close");
        third.release();
        await done;
      }
      if (first && first.process.exitCode === null) first.release();
      await unlink(file).catch(() => {});
      await rmdir(dir);
    }
  },
);
