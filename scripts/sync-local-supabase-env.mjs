import { execFileSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "node_modules", "supabase", "dist", "supabase.js");

const output = execFileSync(process.execPath, [cli, "status", "-o", "env"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

const values = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) continue;
  const value = match[2].trim().replace(/^"|"$/g, "");
  values.set(match[1], value);
}

const apiUrl = values.get("API_URL");
const publishableKey = values.get("PUBLISHABLE_KEY") ?? values.get("ANON_KEY");
const secretKey = values.get("SECRET_KEY") ?? values.get("SERVICE_ROLE_KEY");

if (!apiUrl || !publishableKey || !secretKey) {
  throw new Error(
    "The local Supabase stack did not return the required API keys.",
  );
}

const environment = [
  "# Generated from this project's local Supabase stack. Do not commit.",
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `SUPABASE_SECRET_KEY=${secretKey}`,
  "EVERSHINE_AUTH_REQUIRED=1",
  "",
].join("\n");

const target = path.join(root, ".env.local");
writeFileSync(target, environment, { encoding: "utf8", mode: 0o600 });
try {
  chmodSync(target, 0o600);
} catch {
  // Windows ACLs remain authoritative when POSIX modes are unavailable.
}
console.log(
  "Wrote local Supabase settings to .env.local without printing secrets.",
);
