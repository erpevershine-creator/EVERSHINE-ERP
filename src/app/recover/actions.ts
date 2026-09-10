"use server";
import { completeGovernedPasswordChange } from "@/lib/governed-password";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validatePassword } from "@/lib/policy";
import type { Result } from "@/app/live/actions";

export async function recoverOwner(
  _previous: Result,
  form: FormData,
): Promise<Result> {
  const username = String(form.get("username") ?? "")
    .trim()
    .toLowerCase();
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase();
  const password = String(form.get("password") ?? "");
  if (
    !validatePassword(password) ||
    password.length > 128 ||
    password !== form.get("confirmPassword")
  )
    return {
      status: "error",
      message:
        "Passwords must match and contain 8–128 characters, one uppercase letter and one number.",
    };
  const admin = createAdminClient();
  const { data: op, error } = await admin.rpc("begin_owner_recovery", {
    p_username: username,
    p_hash: createHash("sha256").update(code).digest("hex"),
  });
  if (error || !op)
    return {
      status: "error",
      message: "Recovery service is unavailable. Please retry.",
    };
  if (op.error) return { status: "error", message: op.error };
  const outcome = await completeGovernedPasswordChange({
    update: () => admin.auth.admin.updateUserById(op.owner, {
      password,
      app_metadata: { erp_password_operation: op.operation },
    }),
    receipt: async () => admin.rpc("password_provider_applied", { p_operation: op.operation }),
    finish: async success => admin.rpc("finish_owner_recovery", { p_operation: op.operation, p_success: success }),
  });
  if (outcome !== "completed") return {
    status: "error",
    message: outcome === "failed"
      ? "Auth rejected the password change. Retry with the recovery code and a valid password; access stays closed."
      : "Recovery completion is not confirmed. Retry here with your recovery code; access remains closed and older attempts cannot overwrite the retry.",
  };
  const db = await createClient();
  await db.auth.signOut({ scope: "local" });
  return {
    status: "success",
    message:
      "Password changed. Sign in again. All previous Owner sessions are no longer authorized; history is preserved.",
  };
}
