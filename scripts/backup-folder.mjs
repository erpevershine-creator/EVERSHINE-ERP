import path from "node:path";
import { validBackupId } from "./backup-crypto.mjs";

export function backupRelativePath(id, createdAt) {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date(createdAt))
    .replaceAll("/", "-");
  if (!/^\d{2}-\d{2}-\d{4}$/.test(day)) throw Error("INVALID_BACKUP_DATE");
  return path.join(day, validBackupId(id));
}
