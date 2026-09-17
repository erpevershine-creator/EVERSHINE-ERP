import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validBackupId } from "../scripts/backup-crypto.mjs";

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function save(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(data), { flag: "wx", mode: 0o600 });
  await fs.rename(temp, file);
}

// The local backup worker MUST hold its existing exclusive Windows lock.
// Persist the next attempt before network I/O, including crash/timeout cases.
export async function retryOneOffsite({ root, candidates, publish, now = Date.now() }) {
  const directory = path.join(root, ".runtime", "offsite");
  for (const candidate of candidates) {
    const id = validBackupId(candidate.id);
    const receipt = await readJson(path.join(directory, id + ".json"));
    if (receipt?.status === "verified" && receipt.backupId === id) continue;
    const stateFile = path.join(directory, "retry", id + ".json");
    const prior = await readJson(stateFile);
    if (prior && (!Number.isFinite(prior.nextAttemptAt) || prior.backupId !== id))
      throw Error("OFFSITE_RETRY_STATE_INVALID");
    if (prior?.nextAttemptAt > now) continue;
    const state = { backupId: id, attemptedAt: now, nextAttemptAt: now + 30 * 60 * 1000, status: "pending" };
    await save(stateFile, state);
    try {
      const receipt = await publish(id);
      if (receipt?.status !== "verified" || receipt.backupId !== id)
        throw Error("OFFSITE_RECEIPT_INVALID");
      await save(stateFile, { ...state, status: "verified" });
      return { backupId: id, status: "verified" };
    } catch (error) {
      const code = /^[A-Z_]+$/.test(error.message) ? error.message : "OFFSITE_BACKUP_FAILED";
      await save(stateFile, { ...state, code });
      return { backupId: id, status: "pending", code };
    }
  }
  return { status: "idle" };
}
