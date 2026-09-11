import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readGoogleSecret } from "./google-secret-store.mjs";
import {
  createShareEnvelope,
  parseShareEnvelope,
  combineBackupKey,
  splitBackupKey,
} from "./offsite-key-shares.mjs";
import {
  downloadVerifiedFile,
  ensureDestination,
  ensureFolder,
  uploadVerifiedFile,
} from "./google-drive-files.mjs";
import { backupGoogleAccount, recoveryGoogleAccount } from "./google-drive-oauth.mjs";
import { decryptStream, validBackupId, verifyManifest } from "./backup-crypto.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveRoot = path.join(root, ".runtime", "backups");
const receiptRoot = path.join(root, ".runtime", "offsite");

function command(args, input, exe = "powershell.exe") {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", () => reject(Error("COMMAND_START_FAILED")));
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(Error("COMMAND_FAILED")),
    );
    child.stdin.end(input);
  });
}

async function getLocalKey() {
  const raw = await command([
    "-NoProfile",
    "-NonInteractive",
    "-File",
    path.join(root, "scripts/backup-key.ps1"),
  ]);
  const key = Buffer.from(raw.toString().trim(), "base64");
  if (key.length !== 32) throw Error("KEY_UNAVAILABLE");
  return key;
}

async function findArchive(id) {
  validBackupId(id);
  const dates = await fs.readdir(archiveRoot, { withFileTypes: true });
  const candidates = [];
  for (const date of dates) {
    if (!date.isDirectory() || !/^\d{2}-\d{2}-\d{4}$/.test(date.name)) continue;
    const folder = path.join(archiveRoot, date.name, id);
    try {
      const manifestBytes = await fs.readFile(path.join(folder, "manifest.json"));
      const manifest = JSON.parse(manifestBytes.toString("utf8"));
      if (manifest.manifest?.id === id) candidates.push({ folder, manifest });
    } catch {
      // Ignore unrelated or incomplete archive directories.
    }
  }
  if (candidates.length !== 1) throw Error("ARCHIVE_NOT_UNIQUE");
  return candidates[0];
}

async function readConnection(name) {
  return readGoogleSecret(name);
}

async function publish(id) {
  const archive = await findArchive(id);
  const saved = archive.manifest;
  if (!saved.manifest || saved.manifest.id !== id || !saved.signature)
    throw Error("ARCHIVE_INVALID");
  const key = await getLocalKey();
  try {
    verifyManifest(saved.manifest, saved.signature, key);
    const client = await readGoogleSecret("client");
    const mainConnection = await readConnection("connection");
    const recoveryConnection = await readConnection("recovery-connection");
    const mainContext = {
      client,
      connection: mainConnection,
      purpose: "backup",
    };
    const recoveryContext = {
      client,
      connection: recoveryConnection,
      purpose: "recovery",
    };
    const mainDestination = await ensureDestination(mainContext);
    const recoveryDestination = await ensureDestination(recoveryContext);
    const backupFolder = await ensureFolder({
      ...mainContext,
      parentId: mainDestination.folderId,
      name: id,
      role: "backup-run",
    });
    const recoveryFolder = await ensureFolder({
      ...recoveryContext,
      parentId: recoveryDestination.folderId,
      name: id,
      role: "recovery-key-run",
    });
    const uploaded = [];
    const manifestBytes = Buffer.from(JSON.stringify(saved, null, 2) + "\n");
    uploaded.push(
      await uploadVerifiedFile({
        ...mainContext,
        parentId: backupFolder.id,
        name: "manifest.json",
        mimeType: "application/json",
        content: manifestBytes,
        backupId: id,
        role: "archive-manifest",
      }),
    );
    for (const name of Object.keys(saved.manifest.artifacts).sort()) {
      const artifact = path.join(archive.folder, name + ".enc");
      const content = await fs.readFile(artifact);
      uploaded.push(
        await uploadVerifiedFile({
          ...mainContext,
          parentId: backupFolder.id,
          name: name + ".enc",
          content,
          backupId: id,
          role: "archive-artifact-" + name,
        }),
      );
    }
    const { main, recovery } = splitBackupKey(key);
    const common = {
      backupId: id,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    };
    const mainShare = createShareEnvelope({ ...common, purpose: "backup", share: main });
    const recoveryShare = createShareEnvelope({
      ...common,
      purpose: "recovery",
      share: recovery,
    });
    const mainKeyFile = await uploadVerifiedFile({
      ...mainContext,
      parentId: backupFolder.id,
      name: "main-key-share.json",
      mimeType: "application/json",
      content: mainShare,
      backupId: id,
      role: "main-key-share",
    });
    const recoveryKeyFile = await uploadVerifiedFile({
      ...recoveryContext,
      parentId: recoveryFolder.id,
      name: "recovery-key-share.json",
      mimeType: "application/json",
      content: recoveryShare,
      backupId: id,
      role: "recovery-key-share",
    });
    const receipt = {
      format: 1,
      status: "verified",
      backupId: id,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      mainAccount: backupGoogleAccount,
      recoveryAccount: recoveryGoogleAccount,
      mainFolderId: backupFolder.id,
      recoveryFolderId: recoveryFolder.id,
      archiveFiles: uploaded.map(({ id: fileId, name, sha256 }) => ({ fileId, name, sha256 })),
      keyShareFiles: {
        main: { fileId: mainKeyFile.id, sha256: mainKeyFile.sha256 },
        recovery: { fileId: recoveryKeyFile.id, sha256: recoveryKeyFile.sha256 },
      },
      verifiedAt: new Date().toISOString(),
    };
    await fs.mkdir(receiptRoot, { recursive: true });
    const temp = path.join(receiptRoot, id + ".tmp");
    await fs.writeFile(temp, JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await fs.rename(temp, path.join(receiptRoot, id + ".json"));
    return receipt;
  } finally {
    key.fill(0);
  }
}

async function verifyOffsite(id) {
  validBackupId(id);
  const receipt = JSON.parse(
    await fs.readFile(path.join(receiptRoot, id + ".json"), "utf8"),
  );
  if (receipt.status !== "verified" || receipt.backupId !== id)
    throw Error("OFFSITE_RECEIPT_INVALID");
  const client = await readGoogleSecret("client");
  const mainConnection = await readConnection("connection");
  const recoveryConnection = await readConnection("recovery-connection");
  const mainContext = { client, connection: mainConnection, purpose: "backup" };
  const recoveryContext = {
    client,
    connection: recoveryConnection,
    purpose: "recovery",
  };
  const manifestFile = receipt.archiveFiles.find(
    (file) => file.name === "manifest.json",
  );
  const mainShareFile = receipt.keyShareFiles?.main;
  const recoveryShareFile = receipt.keyShareFiles?.recovery;
  if (!manifestFile || !mainShareFile || !recoveryShareFile)
    throw Error("OFFSITE_RECEIPT_INVALID");
  const manifestDownload = await downloadVerifiedFile(
    { ...mainContext, fileId: manifestFile.fileId, sha256: manifestFile.sha256 },
  );
  const saved = JSON.parse(manifestDownload.content.toString("utf8"));
  const mainShareDownload = await downloadVerifiedFile({
    ...mainContext,
    fileId: mainShareFile.fileId,
    sha256: mainShareFile.sha256,
  });
  const recoveryShareDownload = await downloadVerifiedFile({
    ...recoveryContext,
    fileId: recoveryShareFile.fileId,
    sha256: recoveryShareFile.sha256,
  });
  const expected = {
    backupId: id,
    manifestSha256: receipt.manifestSha256,
  };
  const mainShare = parseShareEnvelope(mainShareDownload.content, {
    ...expected,
    purpose: "backup",
  });
  const recoveryShare = parseShareEnvelope(recoveryShareDownload.content, {
    ...expected,
    purpose: "recovery",
  });
  const key = combineBackupKey(mainShare.share, recoveryShare.share);
  const temp = await fs.mkdtemp(path.join(receiptRoot, "verify-"));
  try {
    verifyManifest(saved.manifest, saved.signature, key);
    if (createHash("sha256").update(manifestDownload.content).digest("hex") !== receipt.manifestSha256)
      throw Error("OFFSITE_MANIFEST_MISMATCH");
    for (const file of receipt.archiveFiles) {
      if (file.name === "manifest.json") continue;
      const logicalName = file.name.replace(/\.enc$/, "");
      const metadata = saved.manifest.artifacts?.[logicalName];
      if (!metadata || !file.name.endsWith(".enc"))
        throw Error("OFFSITE_MANIFEST_MISMATCH");
      const downloaded = await downloadVerifiedFile({
        ...mainContext,
        fileId: file.fileId,
        sha256: file.sha256,
      });
      const localFile = path.join(temp, file.name);
      await fs.writeFile(localFile, downloaded.content, { flag: "wx", mode: 0o600 });
      await decryptStream(localFile, metadata, key);
    }
    return {
      status: "verified",
      backupId: id,
      archiveFiles: receipt.archiveFiles.length - 1,
      keyShares: 2,
      tables: saved.manifest.tables.length,
      storageFiles: saved.manifest.storageFiles,
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    key.fill(0);
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== "win32" || !["publish", "verify"].includes(process.argv[2]))
    throw Error("USE_PUBLISH_OR_VERIFY_ON_WINDOWS");
  const id = validBackupId(process.argv[3] ?? "");
  console.log(JSON.stringify(await (process.argv[2] === "publish" ? publish(id) : verifyOffsite(id))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      /^[A-Z_]+$/.test(error.message) ? error.message : "OFFSITE_BACKUP_FAILED",
    );
    process.exitCode = 1;
  });

export { findArchive, publish, verifyOffsite };
