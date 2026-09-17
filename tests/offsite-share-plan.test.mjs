import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { getSharePlan } from "../scripts/offsite-share-plan.mjs";

test("concurrent and restarted publishers reuse immutable DPAPI share envelopes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "erp-share-plan-"));
  const key = randomBytes(32);
  const args = { directory, backupId: randomUUID(), manifestSha256: "a".repeat(64), key };
  try {
    const [a, b] = await Promise.all([getSharePlan(args), getSharePlan(args)]);
    assert.deepEqual(a, b);
    assert.deepEqual(await getSharePlan(args), a);
    const disk = await fs.readFile(path.join(directory, args.backupId + ".dpapi"));
    assert.equal(disk.includes(a.main), false);
    assert.equal(disk.includes(a.recovery), false);
    await assert.rejects(getSharePlan({ ...args, manifestSha256: "b".repeat(64) }));
    await assert.rejects(getSharePlan({ ...args, key: randomBytes(32) }), /BACKUP_SHARE_KEY_MISMATCH/);
    assert.deepEqual(await getSharePlan(args), a);
    assert.equal((await fs.readdir(directory)).length, 1);
  } finally {
    key.fill(0);
    // Exact mkdtemp child, never a computed external archive path.
    await fs.rm(directory, { recursive: true, force: true });
  }
});
