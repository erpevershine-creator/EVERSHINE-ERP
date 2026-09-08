import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform, Writable } from "node:stream";
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validBackupId(id) {
  if (!uuidPattern.test(id)) throw Error("INVALID_BACKUP_ID");
  return id;
}
export function signManifest(value, key) {
  return createHmac("sha256", key).update(JSON.stringify(value)).digest("hex");
}
export function verifyManifest(value, signature, key) {
  const expected = Buffer.from(signManifest(value, key), "hex");
  const given = Buffer.from(signature ?? "", "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    throw Error("MANIFEST_AUTH_FAILED");
}
export async function encryptStream(input, file, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _, done) {
      bytes += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(
    input,
    meter,
    cipher,
    createWriteStream(file, { flags: "wx", mode: 0o600 }),
  );
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    sha256: hash.digest("hex"),
    bytes,
  };
}
export async function decryptStream(file, meta, key, output) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(meta.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(meta.tag, "hex"));
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _, done) {
      bytes += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(
    createReadStream(file),
    decipher,
    meter,
    output ??
      new Writable({
        write(_chunk, _enc, done) {
          done();
        },
      }),
  );
  if (bytes !== meta.bytes || hash.digest("hex") !== meta.sha256)
    throw Error("ARCHIVE_HASH_MISMATCH");
}
