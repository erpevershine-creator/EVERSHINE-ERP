import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { retryOneOffsite } from "../scripts/offsite-retry.mjs";

test("offsite retry persists backoff across restarts, limits work and redacts provider errors", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "erp-offsite-retry-"));
  const id = randomUUID(), other = randomUUID();
  let calls = 0;
  const candidates = [{ id }, { id: other }];
  const fail = async () => { calls++; throw Error("private provider response"); };
  try {
    const a = await retryOneOffsite({ root, candidates, publish: fail, now: 100 });
    assert.equal(a.code, "OFFSITE_BACKUP_FAILED");
    assert.equal(calls, 1);
    const b = await retryOneOffsite({ root, candidates: [{ id }], publish: fail, now: 101 });
    assert.equal(b.status, "idle");
    assert.equal(calls, 1);
    const state = await fs.readFile(path.join(root, ".runtime/offsite/retry", id + ".json"), "utf8");
    assert.equal(state.includes("private provider"), false);
    const done = await retryOneOffsite({ root, candidates: [{ id }], now: 1800100,
      publish: async () => {
        const receipt = { status: "verified", backupId: id };
        await fs.writeFile(path.join(root, ".runtime/offsite", id + ".json"), JSON.stringify(receipt));
        return receipt;
      } });
    assert.equal(done.status, "verified");
    assert.equal((await retryOneOffsite({ root, candidates: [{ id }], publish: fail, now: 9999999 })).status, "idle");
    assert.equal(calls, 1);
  } finally {
    assert.ok(root.startsWith(path.join(os.tmpdir(), "erp-offsite-retry-")));
    await fs.rm(root, { recursive: true, force: true });
  }
});
