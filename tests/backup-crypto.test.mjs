import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import {
  encryptStream,
  decryptStream,
  signManifest,
  verifyManifest,
  validBackupId,
} from "../scripts/backup-crypto.mjs";
test("encrypted archive restores exactly and rejects corruption, wrong keys and false metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "erp-crypto-"));
  try {
    const file = path.join(dir, "data.enc"),
      key = randomBytes(32),
      original = Buffer.concat([
        Buffer.from("Private test data"),
        randomBytes(200000),
      ]);
    const meta = await encryptStream(Readable.from([original]), file, key);
    const encrypted = await readFile(file);
    assert.equal(encrypted.includes(Buffer.from("Private test data")), false);
    const chunks = [];
    await decryptStream(
      file,
      meta,
      key,
      new Writable({
        write(b, _, done) {
          chunks.push(b);
          done();
        },
      }),
    );
    assert.deepEqual(Buffer.concat(chunks), original);
    await assert.rejects(decryptStream(file, meta, randomBytes(32)));
    await assert.rejects(
      decryptStream(file, { ...meta, sha256: "0".repeat(64) }, key),
      /ARCHIVE_HASH_MISMATCH/,
    );
    await assert.rejects(
      decryptStream(file, { ...meta, bytes: meta.bytes + 1 }, key),
      /ARCHIVE_HASH_MISMATCH/,
    );
    encrypted[20] ^= 1;
    await writeFile(file, encrypted);
    await assert.rejects(decryptStream(file, meta, key));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("signed manifest rejects changed metadata and malformed signatures", () => {
  const key = randomBytes(32),
    manifest = {
      id: "test",
      tables: [{ rows: 3 }],
      artifacts: { database: { bytes: 42 } },
    };
  const signature = signManifest(manifest, key);
  verifyManifest(manifest, signature, key);
  assert.throws(
    () =>
      verifyManifest({ ...manifest, tables: [{ rows: 4 }] }, signature, key),
    /MANIFEST_AUTH_FAILED/,
  );
  assert.throws(
    () => verifyManifest(manifest, "xx", key),
    /MANIFEST_AUTH_FAILED/,
  );
  assert.throws(
    () => verifyManifest(manifest, signature, randomBytes(32)),
    /MANIFEST_AUTH_FAILED/,
  );
});
test("backup identifiers cannot escape the fixed archive directory", () => {
  assert.equal(
    validBackupId("87add17a-32e4-402e-93ff-50aed8d759eb"),
    "87add17a-32e4-402e-93ff-50aed8d759eb",
  );
  for (const value of [
    "../backup",
    "C:\\data",
    "x;drop table",
    "",
    "87add17a-32e4-402e-93ff-50aed8d759eb/..",
  ])
    assert.throws(() => validBackupId(value), /INVALID_BACKUP_ID/);
});
