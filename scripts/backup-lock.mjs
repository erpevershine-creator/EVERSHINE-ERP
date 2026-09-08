import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("./backup-lock.ps1", import.meta.url));
export async function acquireBackupLock(
  lockPath,
  onLost = () => process.exit(1),
) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-File", script, "-LockPath", lockPath],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let acquired = false,
      released = false,
      settled = false,
      text = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("BACKUP_LOCK_TIMEOUT"));
    }, 15000);
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("BACKUP_LOCK_UNAVAILABLE"));
    });
    child.stdout.on("data", (b) => {
      text += b.toString();
      if (settled) return;
      if (text.includes("LOCKED")) {
        clearTimeout(timer);
        acquired = true;
        settled = true;
        resolve({
          release() {
            released = true;
            child.stdin.end();
          },
          process: child,
        });
      } else if (text.includes("BUSY")) {
        clearTimeout(timer);
        settled = true;
        child.stdin.end();
        resolve(null);
      }
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (acquired && !released) onLost();
      else if (!settled) reject(Error("BACKUP_LOCK_UNAVAILABLE"));
    });
  });
}
