"use server";
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
  // A process interruption leaves the durable operation running and access fenced.
  // Never automatically clear this fence on a timer or on an ambiguous response.
  let definitiveFailure = false;
  try {
    const update = await admin.auth.admin.updateUserById(op.owner, {
      password,
    });
    if (update.error) {
      if (!update.error.status || update.error.status >= 500)
        return {
          status: "error",
          message:
            "Auth could not confirm the password update. Recovery stays locked for local administrator reconciliation.",
        };
      definitiveFailure = true;
    }
  } catch {
    return {
      status: "error",
      message:
        "Recovery was interrupted. Account access stays closed until the local operation is reconciled.",
    };
  }
  const finish = await admin.rpc("finish_owner_recovery", {
    p_operation: op.operation,
    p_success: !definitiveFailure,
  });
  if (finish.error)
    return {
      status: "error",
      message:
        "Recovery completion could not be confirmed. Try signing in; if access is still unavailable, request local administrator review.",
    };
  if (definitiveFailure)
    return {
      status: "error",
      message:
        "Auth rejected the password change. Account access stays closed; retry with the recovery code and a valid new password.",
    };
  const db = await createClient();
  await db.auth.signOut({ scope: "local" });
  return {
    status: "success",
    message:
      "Password changed. Sign in again. All previous Owner sessions are no longer authorized; history is preserved.",
  };
}
