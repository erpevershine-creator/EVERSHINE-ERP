import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docker = process.env.DOCKER_EXE || (process.platform === "win32"
  ? path.join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin/docker.exe") : "docker");
const image = "public.ecr.aws/supabase/storage-api:v1.72.1";
const tests = ["policy.test.ts", "governed-password.test.ts", "backup-crypto.test.mjs",
  "retention.test.ts", "retention-files.test.mjs", "google-drive-oauth.test.mjs",
  "offsite-key-shares.test.mjs", "offsite-retry.test.mjs", "google-drive-files.test.mjs", "recovery-bundle.test.mjs"].map(name => `tests/${name}`);
const stage = await fs.mkdtemp(path.join(os.tmpdir(), "erp-linux-source-"));
const hashes = {};
async function copyCode(relative) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await copyCode(name);
    else if (entry.isFile() && /\.(?:mjs|ts|tsx)$/.test(name)) {
      const bytes = await fs.readFile(path.join(root, name));
      hashes[name] = createHash("sha256").update(bytes).digest("hex");
      await fs.mkdir(path.dirname(path.join(stage, name)), { recursive: true });
      await fs.writeFile(path.join(stage, name), bytes);
    }
  }
}
try {
  // Only source is mounted: no Windows profile, credentials, archives or node_modules.
  for (const dir of ["scripts", "src/lib", "tests"]) await copyCode(dir);
  await fs.writeFile(path.join(stage, "package.json"), '{"type":"module"}\n');
  const imageId = execFileSync(docker, ["image", "inspect", image, "--format", "{{.Id}}"], {encoding:"utf8",windowsHide:true}).trim();
  const args = ["run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--tmpfs", "/tmp", "-v", `${stage}:/workspace:ro`,
    "-w", "/workspace", "--entrypoint", "node", imageId];
  const node = execFileSync(docker, [...args, "--version"], {encoding:"utf8",windowsHide:true}).trim();
  let output, status = "pass";
  try { output = execFileSync(docker, [...args, "--experimental-strip-types", "--test", ...tests], {encoding:"utf8",windowsHide:true,timeout:120000}); }
  catch(error) { status = "fail"; output = `${error.stdout || ""}\n${error.stderr || ""}`; process.exitCode = 1; }
  const evidence = {status, finishedAt:new Date().toISOString(), platform:"linux",node,imageId,tests,
    boundaries:"Portable tests only; Windows DPAPI, browser, real remote destination and live restore acceptance excluded.",hashes,output};
  await fs.mkdir(path.join(root,".runtime/evidence"),{recursive:true});
  await fs.writeFile(path.join(root,".runtime/evidence/foundation-linux-check.json"),JSON.stringify(evidence,null,2));
  console.log(output);
} finally {
  if (path.dirname(stage) !== path.resolve(os.tmpdir()) || !path.basename(stage).startsWith("erp-linux-source-")) throw Error("UNSAFE_CLEANUP_PATH");
  await fs.rm(stage,{recursive:true,force:true});
}
