import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
export async function secretCodec(operation, input) {
  if (
    process.platform !== "win32" ||
    !["Protect", "Unprotect"].includes(operation) ||
    input.length > 65536
  )
    throw Error("GOOGLE_SECRET_STORE_FAILED");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        fileURLToPath(new URL("./google-secret-codec.ps1", import.meta.url)),
        operation,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 131072) child.kill();
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("GOOGLE_SECRET_STORE_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || size > 131072)
        reject(Error("GOOGLE_SECRET_STORE_FAILED"));
      else
        resolve(Buffer.from(Buffer.concat(chunks).toString().trim(), "base64"));
    });
    child.stdin.end(input.toString("base64"));
  });
}
function filename(name) {
  if (
    ![
      "client",
      "connection",
      "recovery-connection",
      "destination",
      "recovery-destination",
    ].includes(name) ||
    !process.env.LOCALAPPDATA
  )
    throw Error("GOOGLE_SECRET_STORE_FAILED");
  return path.join(
    process.env.LOCALAPPDATA,
    "EVERSHINE-ERP",
    "google-" + name + ".dpapi",
  );
}
export async function readGoogleSecret(name) {
  const raw = await secretCodec("Unprotect", await fs.readFile(filename(name)));
  try {
    return JSON.parse(raw.toString("utf8"));
  } finally {
    raw.fill(0);
  }
}
export async function writeGoogleSecret(name, value) {
  const raw = Buffer.from(JSON.stringify(value));
  let protectedBytes;
  try {
    protectedBytes = await secretCodec("Protect", raw);
  } finally {
    raw.fill(0);
  }
  const file = filename(name),
    temp = file + "." + randomUUID() + ".tmp";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, protectedBytes, { flag: "wx", mode: 0o600 });
  try {
    await fs.rename(temp, file);
  } catch {
    await fs.unlink(temp).catch(() => {});
    throw Error("GOOGLE_SECRET_STORE_FAILED");
  }
}
