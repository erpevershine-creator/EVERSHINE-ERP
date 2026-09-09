import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  combineBackupKey,
  createShareEnvelope,
  parseShareEnvelope,
  splitBackupKey,
} from "../scripts/offsite-key-shares.mjs";

test("two independent shares reconstruct the archive key and neither share is the key", () => {
  const key = Buffer.from(randomBytes(32));
  const { main, recovery } = splitBackupKey(key);
  assert.notDeepEqual(main, key);
  assert.notDeepEqual(recovery, key);
  assert.deepEqual(combineBackupKey(main, recovery), key);
  key.fill(0);
  main.fill(0);
  recovery.fill(0);
});

test("share envelopes bind backup, purpose and checksum", () => {
  const share = Buffer.alloc(32, 7);
  const manifestSha256 = createHash("sha256").update("manifest").digest("hex");
  const encoded = createShareEnvelope({
    backupId: "11111111-1111-4111-8111-111111111111",
    manifestSha256,
    purpose: "recovery",
    share,
  });
  const decoded = parseShareEnvelope(encoded, {
    backupId: "11111111-1111-4111-8111-111111111111",
    manifestSha256,
    purpose: "recovery",
  });
  assert.deepEqual(decoded.share, share);
  assert.throws(
    () => parseShareEnvelope(encoded, { purpose: "backup" }),
    /BACKUP_SHARE_INVALID/,
  );
  const corrupt = Buffer.from(encoded);
  corrupt[corrupt.length - 4] ^= 1;
  assert.throws(() => parseShareEnvelope(corrupt), /BACKUP_SHARE_INVALID/);
});
