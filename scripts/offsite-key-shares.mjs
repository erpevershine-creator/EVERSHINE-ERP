import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { validBackupId } from "./backup-crypto.mjs";

export const keyShareBytes = 32;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function splitBackupKey(key, random = randomBytes) {
  if (!Buffer.isBuffer(key) || key.length !== keyShareBytes)
    throw Error("BACKUP_KEY_INVALID");
  const main = Buffer.from(random(keyShareBytes));
  if (main.length !== keyShareBytes) throw Error("BACKUP_SHARE_INVALID");
  const recovery = Buffer.alloc(keyShareBytes);
  for (let i = 0; i < keyShareBytes; i++) recovery[i] = key[i] ^ main[i];
  return { main, recovery };
}

export function combineBackupKey(main, recovery) {
  if (
    !Buffer.isBuffer(main) ||
    !Buffer.isBuffer(recovery) ||
    main.length !== keyShareBytes ||
    recovery.length !== keyShareBytes
  )
    throw Error("BACKUP_SHARE_INVALID");
  const key = Buffer.alloc(keyShareBytes);
  for (let i = 0; i < keyShareBytes; i++) key[i] = main[i] ^ recovery[i];
  return key;
}

export function createShareEnvelope({
  backupId,
  manifestSha256,
  purpose,
  share,
  createdAt = new Date().toISOString(),
}) {
  validBackupId(backupId);
  if (
    !/^[a-f0-9]{64}$/.test(manifestSha256 ?? "") ||
    !["backup", "recovery"].includes(purpose) ||
    !Buffer.isBuffer(share) ||
    share.length !== keyShareBytes
  )
    throw Error("BACKUP_SHARE_INVALID");
  return Buffer.from(
    JSON.stringify({
      format: 1,
      scheme: "xor-2-of-2",
      backupId,
      manifestSha256,
      purpose,
      createdAt,
      shareSha256: digest(share),
      share: share.toString("base64url"),
    }) + "\n",
    "utf8",
  );
}

export function parseShareEnvelope(input, expected = {}) {
  let value;
  try {
    value = JSON.parse(Buffer.from(input).toString("utf8"));
  } catch {
    throw Error("BACKUP_SHARE_INVALID");
  }
  if (
    value?.format !== 1 ||
    value.scheme !== "xor-2-of-2" ||
    !["backup", "recovery"].includes(value.purpose) ||
    (expected.backupId && value.backupId !== expected.backupId) ||
    (expected.manifestSha256 && value.manifestSha256 !== expected.manifestSha256) ||
    (expected.purpose && value.purpose !== expected.purpose) ||
    typeof value.share !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value.share)
  )
    throw Error("BACKUP_SHARE_INVALID");
  const share = Buffer.from(value.share, "base64url");
  const actual = Buffer.from(digest(share), "hex");
  const claimed = Buffer.from(value.shareSha256 ?? "", "hex");
  if (
    share.length !== keyShareBytes ||
    claimed.length !== actual.length ||
    !timingSafeEqual(actual, claimed)
  )
    throw Error("BACKUP_SHARE_INVALID");
  return { ...value, share };
}
