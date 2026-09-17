"use server";
import { completeGovernedPasswordChange } from "@/lib/governed-password";
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

export async function getPermanentHandoverOptions(source: string) {
  const access=await requireAccess("accounts");
  if(!allows(access,"Account Management","handover")) throw Error("Handover authority required");
  const db=await createClient();
  const [people,work]=await Promise.all([
    db.from("profiles").select("id,employee_name,erp_role,version").eq("status","active").neq("erp_role","owner").neq("id",source).order("employee_name").limit(1001),
    db.from("approval_requests").select("id,reason,module").eq("requester_id",source).eq("status","pending").gt("deadline_at",new Date().toISOString()).order("id").limit(101),
  ]);
  if(people.error||work.error||people.data.length>1000||work.data.length>100) throw Error("Handover list unavailable or exceeds review limit");
  return {people:people.data,items:work.data};
}

export async function requestPermanentHandover(form: FormData): Promise<Result> {
  await requireAccess("accounts");
  const db=await createClient();
  const {error}=await db.rpc("request_permanent_handover",{
    p_source:value(form,"source"),p_successor:value(form,"successor"),
    p_source_version:Number(value(form,"sourceVersion")),p_successor_version:Number(value(form,"successorVersion")),
    p_items:form.getAll("item").map(Number),p_reason:value(form,"reason"),
  });
  if(error) return failure("Handover was not requested. Reload and check account status, selected responsibilities and your scope.");
  refresh();
  return {status:"success",message:"Permanent handover sent to Owner for merged permission review."};
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

export async function changeAccountPassword(form: FormData): Promise<Result> {
  const access = await requireAccess("accounts");
  if (!allows(access, "Account Management", "change_password"))
    return failure("Password changes are outside your permissions.");
  const target = value(form, "id");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirmPassword") ?? "");
  const reason = value(form, "reason");
  if (!target || !validatePassword(password) || password.length > 128 || password !== confirm)
    return failure("Passwords must match and contain 8–128 characters, one uppercase letter and one number.");
  if (!reason) return failure("Reason is required.");
  const db = await createClient();
  const prepared = await db.rpc("prepare_password_change", {
    p_target: target,
    p_reason: reason,
  });
  if (prepared.error || !prepared.data?.operation || !prepared.data?.target)
    return failure("Password change was rejected. Check account authority and current status.");
  const operation = prepared.data.operation as string;
  const admin = createAdminClient();
  const outcome = await completeGovernedPasswordChange({
    update: () => admin.auth.admin.updateUserById(prepared.data.target as string, {
      password,
      app_metadata: { erp_password_operation: operation },
    }),
    receipt: async () => admin.rpc("password_provider_applied", { p_operation: operation }),
    finish: async success => admin.rpc("finish_password_change", { p_operation: operation, p_success: success }),
  });
  if (outcome !== "completed")
    return failure(outcome === "failed"
      ? "Auth rejected the password change. Access remains closed; an authorized administrator can retry."
      : "Completion is not confirmed. Access remains closed; retry through this governed form. Owner can use emergency recovery.");
  refresh();
  return { status: "success", message: "Password changed. All previous sessions were logged out." };
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
export async function revisePermissionDraft(form: FormData): Promise<Result> {
  await requireAccess("approvals");
  const db = await createClient();
  try {
    const { error } = await db.rpc("revise_permission_draft", {
      p_request: Number(value(form, "id")),
      p_expected: Number(value(form, "version")),
      p_pages: JSON.parse(value(form, "pages")),
      p_actions: JSON.parse(value(form, "actions")),
      p_accounts: form.getAll("accounts"),
      p_reason: value(form, "reason"),
    });
    if (error)
      return failure(
        "Draft was not saved. Reload it and check the selected access, accounts and reason.",
      );
  } catch {
    return failure("Invalid permission Draft.");
  }
  refresh();
  return { status: "success", message: "Draft revised. Review it, then submit for approval." };
}

export async function copyExpiredPermissionRequest(form: FormData): Promise<Result> {
  await requireAccess("approvals");
  const db = await createClient();
  const { error } = await db.rpc("copy_expired_permission_request", {
    p_source: Number(value(form, "id")),
    p_reason: value(form, "reason"),
  });
  if (error)
    return failure("Expired request was not copied. Check authority, scope and reason.");
  refresh();
  return { status: "success", message: "A linked Draft was created for review." };
}
export async function decideRequest(form: FormData): Promise<Result> {
  await requireAccess("approvals");
  const db = await createClient();
  const submit = value(form, "decision") === "submit";
  const requestType = value(form, "requestType");
  if (requestType === "permanent_handover") {
    const {data,error}=await db.rpc("decide_permanent_handover",{p_request:Number(value(form,"id")),p_approve:value(form,"decision")==="approve",p_reason:value(form,"reason")});
    if(error) return failure("Handover decision rejected. Owner review and unchanged accounts/responsibilities are required.");
    refresh();
    return {status:"success",message:`Handover ${data}.`};
  }
  if (requestType === "profile_change") {
    const { data, error } = await db.rpc("decide_profile_change", {
      p_request: Number(value(form, "id")),
      p_approve: value(form, "decision") === "approve",
      p_reason: value(form, "reason"),
    });
    if (error) return failure("Profile decision rejected. Check authority, reason and whether the profile changed.");
    return executeProfileResult(data);
  }
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

type ProfileExecution = { status: string; operation?: string; target?: string; username?: string };
async function executeProfileResult(result: ProfileExecution): Promise<Result> {
  if (result.status === "provider_pending") {
    if (!result.operation || !result.target || !result.username) return failure("Profile execution is incomplete.");
    const admin = createAdminClient();
    try {
      await admin.auth.admin.updateUserById(result.target, {
        email: result.username, email_confirm: true,
        app_metadata: { erp_profile_operation: result.operation },
      });
    } catch { /* Committed receipt determines the outcome after a lost response. */ }
    const proof = await admin.rpc("profile_provider_applied", { p_operation: result.operation });
    refresh();
    if (proof.error || proof.data !== true)
      return failure("Profile application is not confirmed. The original approver can retry this exact approved request.");
  }
  refresh();
  return { status: "success", message: result.status === "rejected" ? "Profile request rejected." : result.status === "expired" ? "Request expired without changing the profile." : "Approved profile changes applied." };
}

export async function retryProfileChange(form: FormData): Promise<Result> {
  await requireAccess("approvals");
  const db = await createClient();
  const { data, error } = await db.rpc("retry_profile_change", {
    p_request: Number(value(form, "id")), p_reason: value(form, "reason"),
  });
  if (error) return failure("Retry rejected. The original approver must have current authority and the profile must still match the approved snapshot.");
  return executeProfileResult(data);
}

export async function requestProfileChange(form: FormData): Promise<Result> {
  const access = await requireAccess("accounts");
  if (!["owner", "admin"].includes(access.role) || !allows(access, "Account Management", "edit"))
    return failure("Profile editing is outside your permissions.");
  const target = value(form, "id");
  if (!/^[0-9a-f-]{36}$/.test(target)) return failure("Invalid account.");
  const proposed: Record<string, string> = Object.fromEntries(
    ["employeeName", "companyPosition", "department", "contact", "username", "erpRole"].map(key => [key, value(form, key)]),
  );
  const db = await createClient();
  const scope = await db.rpc("check_profile_edit", { p_target: target, p_expected: Number(value(form,"version")), p_role: proposed.erpRole });
  if (scope.error || scope.data !== true) return failure("Account is unavailable or outside your editing authority.");
  const photo = form.get("photo");
  if (photo instanceof File && photo.size) {
    if (photo.size > 2097152 || !["image/jpeg", "image/png", "image/webp"].includes(photo.type))
      return failure("Select a JPEG, PNG or WebP photo up to 2 MB.");
    const bytes = Buffer.from(await photo.arrayBuffer());
    const valid = photo.type === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))
      : photo.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
    if (!valid) return failure("The photo file is invalid.");
    const ext = photo.type === "image/jpeg" ? "jpg" : photo.type === "image/png" ? "png" : "webp";
    proposed.avatar = `${target}/${randomUUID()}.${ext}`;
    const upload = await createAdminClient().storage.from("profile-photos").upload(proposed.avatar, bytes, { contentType: photo.type, upsert: false });
    if (upload.error) return failure("Photo could not be uploaded.");
  }
  const { error } = await db.rpc("request_profile_change", {
    p_target: target, p_expected: Number(value(form,"version")), p_proposed: proposed, p_reason: value(form,"reason"),
  });
  if (error) return failure("Profile request rejected. Reload and check the fields, role authority and reason.");
  refresh();
  return { status: "success", message: "Profile change sent to Approval Center. The current account remains unchanged until applied." };
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
