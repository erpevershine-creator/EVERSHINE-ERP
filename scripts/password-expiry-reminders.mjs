import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (url !== "http://127.0.0.1:55321") throw Error("LOCAL_SUPABASE_ONLY");
if (!secret) throw Error("LOCAL_SUPABASE_SECRET_REQUIRED");

const db = createClient(url, secret, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const { data, error } = await db.rpc("run_password_expiry_reminders");
if (error) throw Error("PASSWORD_EXPIRY_REMINDER_RUN_FAILED");
if (!Number.isInteger(data) || data < 0) throw Error("INVALID_REMINDER_RESULT");
console.log(`Password expiry reminders delivered: ${data}`);
