"use server";
import {
  planBackupRetention,
  type RetentionBackup,
} from "@/lib/backup-retention";
import path from "node:path";
import { spawn } from "node:child_process";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAccess, allows } from "@/lib/access";
import { isLocalReview } from "@/lib/policy";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/app/live/actions";
export async function createLocalBackup(
  _previous: Result,
  form: FormData,
): Promise<Result> {
  const access = await requireAccess("backups");
  const host = (await headers()).get("host") ?? "";
  if (
    !isLocalReview(
      process.env.NODE_ENV,
      process.env.EVERSHINE_LOCAL_REVIEW,
      host,
    ) ||
    process.platform !== "win32" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55321"
  )
    return {
      status: "error",
      message:
        "This backup runner is available only on the configured local computer.",
    };
  if (
    !["owner", "admin"].includes(access.role) ||
    !allows(access, "Backup & Restore", "create")
  )
    return {
      status: "error",
      message: "Backup creation is outside your permissions.",
    };
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason || reason.length > 1000)
    return { status: "error", message: "Enter a backup reason." };
  const db = await createClient();
  const { data: id, error } = await db.rpc("request_local_backup", {
    p_reason: reason,
  });
  if (error)
    return {
      status: "error",
      message:
        "Backup could not start. Check that no other backup is pending and that you still have permission.",
    };
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(process.cwd(), "scripts/local-backup.mjs"), "run", id],
        {
          cwd: process.cwd(),
          detached: true,
          windowsHide: true,
          stdio: "ignore",
        },
      );
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch {
    await db.rpc("fail_queued_local_backup", { p_id: id });
    revalidatePath("/backups");
    return {
      status: "error",
      message: "The local backup worker could not start.",
    };
  }
  revalidatePath("/backups");
  return {
    status: "success",
    message: "Backup started. Verification progress appears below.",
  };
}

export async function reviewBackupRetention() {
  const access = await requireAccess("backups");
  if (!["owner", "admin"].includes(access.role))
    throw Error("Backup review is outside your permissions.");
  const db = await createClient();
  const rows: RetentionBackup[] = [];
  // Read every page for the calculation; never silently plan from the 50-row screen list.
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await db
      .from("local_backup_runs")
      .select("id,origin,status,created_at,archive_state,prune_replacement_id")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (error) throw Error("Retention review could not be loaded.");
    rows.push(...data);
    if (data.length < 1000) {
      const plan = planBackupRetention(rows);
      return {
        total: plan.length,
        keep: plan.filter((r) => r.decision === "keep").length,
        candidates: plan.filter((r) => r.decision === "candidate").length,
        removed: plan.filter((r) => r.decision === "removed").length,
        rows: plan.slice(0, 200),
      };
    }
  }
  throw Error(
    "Backup history requires a larger review; no partial plan is shown.",
  );
}
