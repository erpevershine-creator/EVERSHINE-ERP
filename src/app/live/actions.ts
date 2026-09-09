"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allows, requireAccess } from "@/lib/access";
import { validatePassword } from "@/lib/policy";

export type Result = { status: "idle" | "error" | "success"; message: string };
function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function refresh() {
  revalidatePath("/", "layout");
}
function failure(message: string): Result {
  return { status: "error", message };
}

export async function createAccount(
  _previous: Result,
  form: FormData,
): Promise<Result> {
  const access = await requireAccess("accounts");
  if (
    !["owner", "admin"].includes(access.role) ||
    !allows(access, "Account Management", "create")
  )
    return failure("Account creation is outside your permissions.");
  const name = value(form, "employeeName"),
    department = value(form, "department"),
    contact = value(form, "contact"),
    username = value(form, "username").toLowerCase();
  const role = value(form, "role"),
    companyPosition = value(form, "companyPosition");
  const password = String(form.get("password") ?? ""),
    confirm = String(form.get("confirmPassword") ?? "");
  if (
    [name, department, contact, companyPosition].some(
      (v) => !v || v.length > 120,
    ) ||
    !/^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$/.test(username)
  )
    return failure(
      "Complete the account details with a company-approved Gmail username.",
    );
  if (
    !validatePassword(password) ||
    password.length > 128 ||
    password !== confirm
  )
    return failure(
      "Passwords must match and contain 8–128 characters, one uppercase letter and one number.",
    );
  if (
    !["admin", "sales", "delivery", "finance", "inventory"].includes(role) ||
    (role === "admin" && access.role !== "owner")
  )
    return failure("Only Owner can appoint an Admin.");
  const photo = form.get("photo");
  if (
    !(photo instanceof File) ||
    !photo.size ||
    photo.size > 2097152 ||
    !["image/jpeg", "image/png", "image/webp"].includes(photo.type)
  )
    return failure("Select a JPEG, PNG or WebP photo up to 2 MB.");
  const bytes = Buffer.from(await photo.arrayBuffer());
  const valid =
    photo.type === "image/jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : photo.type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) return failure("The photo file is invalid.");
  const db = await createClient();
  const { data: pos } = await db
    .from("positions")
    .select("id,is_owner_position,is_active")
    .eq("erp_role_code", role)
    .maybeSingle();
  if (!pos || pos.is_owner_position || !pos.is_active)
    return failure("Select an available ERP role.");
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: username,
    password,
    email_confirm: true,
    app_metadata: { provisioned_by: access.id },
  });
  if (error || !created.user)
    return failure(
      "Account could not be created. Check whether the username already exists.",
    );
  const id = created.user.id;
  const ext =
    photo.type === "image/jpeg"
      ? "jpg"
      : photo.type === "image/png"
        ? "png"
        : "webp";
  const path = `${id}/${randomUUID()}.${ext}`;
  try {
    const upload = await admin.storage
      .from("profile-photos")
      .upload(path, bytes, { contentType: photo.type, upsert: false });
    if (upload.error) throw new Error("Photo upload failed");
    const provision = await db.rpc("provision_employee", {
      p_id: id,
      p_company_position: companyPosition,
      p_name: name,
      p_department: department,
      p_role: role,
      p_username: username,
      p_contact: contact,
      p_avatar: path,
    });
    if (provision.error) throw new Error("Provisioning failed");
  } catch {
    // Confirm the transaction outcome before compensating a possibly committed account.
    const check = await admin
      .from("profiles")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (check.error)
      return failure(
        "Provisioning outcome needs administrator review. Do not create a duplicate account.",
      );
    if (!check.data) {
      await admin.storage.from("profile-photos").remove([path]);
      await admin.auth.admin.deleteUser(id);
      return failure(
        "Account was not activated. Check ERP role permissions and retry.",
      );
    }
  }
  refresh();
  return {
    status: "success",
    message:
      "Account created. The employee can sign in with the assigned ERP password.",
  };
}

export async function accountStatus(form: FormData): Promise<Result> {
  await requireAccess("accounts");
  const db = await createClient();
  const { error } = await db.rpc("change_account_status", {
    p_id: value(form, "id"),
    p_action: value(form, "action"),
    p_reason: value(form, "reason"),
  });
  if (error)
    return failure(
      "Account change rejected. Check authority, current status and reason.",
    );
  refresh();
  return {
    status: "success",
    message: "Account updated. Previous sessions are no longer authorized.",
  };
}
export async function savePermissionDraft(form: FormData): Promise<Result> {
  await requireAccess("permissions");
  const db = await createClient();
  try {
    const { error } = await db.rpc("draft_permission_change", {
      p_position: Number(value(form, "position")),
      p_expected: Number(value(form, "version")),
      p_pages: JSON.parse(value(form, "pages")),
      p_actions: JSON.parse(value(form, "actions")),
      p_accounts: form.getAll("accounts"),
      p_reason: value(form, "reason"),
    });
    if (error)
      return failure(
        "Draft rejected. Refresh and check selected accounts and delegated permissions.",
      );
  } catch {
    return failure("Invalid permission request.");
  }
  refresh();
  return {
    status: "success",
    message: "Draft saved. Review it in Approval Center, then submit.",
  };
}
export async function decideRequest(form: FormData): Promise<Result> {
  await requireAccess("approvals");
  const db = await createClient();
  const submit = value(form, "decision") === "submit";
  const requestType = value(form, "requestType");
  const { error } = await db.rpc(
    submit
      ? "submit_permission_change"
      : requestType === "device_login"
        ? "decide_device_login"
        : "decide_permission_change",
    submit
      ? { p_request: Number(value(form, "id")) }
      : {
          p_request: Number(value(form, "id")),
          p_approve: value(form, "decision") === "approve",
          p_reason: value(form, "reason"),
        },
  );
  if (error)
    return failure(
      "Request was not changed. Check authority and whether its ERP role or accounts changed since drafting. Only Owner may self-approve.",
    );
  refresh();
  return {
    status: "success",
    message: submit ? "Request submitted." : "Decision recorded.",
  };
}
export async function markNotificationRead(form: FormData) {
  await requireAccess("notifications");
  const db = await createClient();
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", Number(value(form, "id")));
  if (error) throw new Error("Notification could not be updated.");
  refresh();
}

export async function getAffectedAccounts(requestId: number) {
  await requireAccess("approvals");
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid request.");
  const db = await createClient();
  const rows: import("@/features/live-administration").Affected[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("approval_request_accounts")
      .select(
        "request_id,profile_id,account_name,expected_profile_version,before_pages,after_pages,before_actions,after_actions",
      )
      .eq("request_id", requestId)
      .order("profile_id")
      .range(offset, offset + 499);
    if (error)
      throw new Error("Complete account snapshot could not be loaded.");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export async function getIndividualPermissions(profileId: string) {
  const access = await requireAccess("permissions");
  if (access.role !== "owner")
    throw new Error("Only Owner can manage individual permissions.");
  const db = await createClient();
  const { data, error } = await db.rpc("get_individual_permissions", {
    p_profile: profileId,
  });
  if (error) throw new Error("Account permissions could not be loaded.");
  return data as import("@/features/individual-permissions").IndividualAccess;
}
export async function approveIndividualPermissions(
  form: FormData,
): Promise<Result> {
  const access = await requireAccess("permissions");
  if (access.role !== "owner")
    return failure("Only Owner can manage individual permissions.");
  try {
    const db = await createClient();
    const { error } = await db.rpc("approve_individual_permissions", {
      p_profile: value(form, "profile"),
      p_expected: Number(value(form, "version")),
      p_pages: JSON.parse(value(form, "pages")),
      p_actions: JSON.parse(value(form, "actions")),
      p_reason: value(form, "reason"),
    });
    if (error)
      return failure(
        "Permissions were not changed. Reload the account and check the reason and selected permissions.",
      );
  } catch {
    return failure("Invalid individual permission request.");
  }
  refresh();
  return {
    status: "success",
    message: "Individual permissions approved and saved.",
  };
}
