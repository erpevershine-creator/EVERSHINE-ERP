import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { secretCodec } from "../scripts/google-secret-store.mjs";
import { createShareEnvelope, parseShareEnvelope, splitBackupKey, combineBackupKey } from "../scripts/offsite-key-shares.mjs";
import { validBackupId } from "../scripts/backup-crypto.mjs";

// Persist encrypted, immutable bytes BEFORE either account receives a share.
// An interrupted or concurrent publisher must reuse exactly the same envelope.
export async function getSharePlan({ directory, backupId, manifestSha256, key, codec = secretCodec }) {
  validBackupId(backupId);
  if (!/^[a-f0-9]{64}$/.test(manifestSha256) || !Buffer.isBuffer(key) || key.length !== 32)
    throw Error("BACKUP_SHARE_INVALID");
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, backupId + ".dpapi");
  async function load() {
    const raw = await codec("Unprotect", await fs.readFile(file));
    try {
      const saved = JSON.parse(raw.toString("utf8"));
      const main = Buffer.from(saved.main, "base64");
      const recovery = Buffer.from(saved.recovery, "base64");
      const expected = { backupId, manifestSha256 };
      const a = parseShareEnvelope(main, { ...expected, purpose: "backup" });
      const b = parseShareEnvelope(recovery, { ...expected, purpose: "recovery" });
      const recovered = combineBackupKey(a.share, b.share);
      try {
        if (!timingSafeEqual(recovered, key)) throw Error("BACKUP_SHARE_KEY_MISMATCH");
      } finally { recovered.fill(0); a.share.fill(0); b.share.fill(0); }
      return { main, recovery };
    } finally { raw.fill(0); }
  }
  try { return await load(); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const shares = splitBackupKey(key);
  const common = { backupId, manifestSha256, createdAt: new Date().toISOString() };
  const raw = Buffer.from(JSON.stringify({
    main: createShareEnvelope({ ...common, purpose: "backup", share: shares.main }).toString("base64"),
    recovery: createShareEnvelope({ ...common, purpose: "recovery", share: shares.recovery }).toString("base64"),
  }));
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const encrypted = await codec("Protect", raw);
    await fs.writeFile(temp, encrypted, { flag: "wx", mode: 0o600 });
    // Hard-link is an atomic create-if-absent: never overwrite another publisher.
    try { await fs.link(temp, file); } catch (error) { if (error.code !== "EEXIST") throw error; }
  } finally {
    raw.fill(0); shares.main.fill(0); shares.recovery.fill(0);
    await fs.unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  return load();
}
