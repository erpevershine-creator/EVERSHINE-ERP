"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalReview, validatePassword } from "@/lib/policy";

export type OwnerSetupState = {
  status: "idle" | "error" | "success";
  message: string;
  recoveryCode?: string;
};


const photoExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function validPhotoSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (type === "image/png") {
    return (
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      )
    );
  }
  if (type === "image/webp") {
    return (
      bytes.length >= 12 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawTextValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function createRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const value = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
  return `EVR-${value.match(/.{1,4}/g)!.join("-")}`;
}

async function localSetupAllowed() {
  const requestHeaders = await headers();
  return isLocalReview(
    process.env.NODE_ENV,
    process.env.EVERSHINE_LOCAL_REVIEW,
    requestHeaders.get("host") ?? "",
  );
}

export async function setupOwner(
  _previous: OwnerSetupState,
  formData: FormData,
): Promise<OwnerSetupState> {
  if (!(await localSetupAllowed())) {
    return {
      status: "error",
      message: "Owner setup is available only on localhost.",
    };
  }

  const employeeName = textValue(formData, "employeeName");
  const department = textValue(formData, "department");
  const username = textValue(formData, "username").toLowerCase();
  const password = rawTextValue(formData, "password");
  const confirmPassword = rawTextValue(formData, "confirmPassword");
  const contact = textValue(formData, "contact");
  const photo = formData.get("photo");

  if (
    !employeeName ||
    !department ||
    !username ||
    !password ||
    !confirmPassword ||
    !contact
  ) {
    return { status: "error", message: "Complete every required field." };
  }
  if (
    employeeName.length > 120 ||
    department.length > 120 ||
    contact.length > 120
  ) {
    return { status: "error", message: "One or more details are too long." };
  }
  if (!/^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$/i.test(username)) {
    return {
      status: "error",
      message: "Use the company-approved Gmail username.",
    };
  }
  if (!validatePassword(password)) {
    return {
      status: "error",
      message:
        "Password needs at least 8 characters, one uppercase letter and one number.",
    };
  }
  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "Password confirmation does not match.",
    };
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return { status: "error", message: "Select a profile photo." };
  }
  if (photo.size > 2 * 1024 * 1024 || !photoExtensions[photo.type]) {
    return {
      status: "error",
      message: "Use a JPEG, PNG or WebP photo up to 2 MB.",
    };
  }
  const photoBytes = Buffer.from(await photo.arrayBuffer());
  if (!validPhotoSignature(photo.type, photoBytes)) {
    return {
      status: "error",
      message: "The selected file is not a valid profile image.",
    };
  }

  const admin = createAdminClient();
  const { data: existingOwner, error: existingOwnerError } = await admin
    .from("profiles")
    .select("id")
    .eq("erp_role", "owner")
    .neq("status", "inactive")
    .maybeSingle();

  if (existingOwnerError) {
    return {
      status: "error",
      message: "Owner setup status could not be verified.",
    };
  }
  if (existingOwner) {
    return { status: "error", message: "Owner setup is already complete." };
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: username,
      password,
      email_confirm: true,
      app_metadata: { evershine_role: "owner" },
      user_metadata: { employee_name: employeeName, department, contact },
    });

  if (createError || !created.user) {
    return {
      status: "error",
      message: createError?.message.toLowerCase().includes("already")
        ? "This username already has an Auth account."
        : "The Owner Auth account could not be created.",
    };
  }

  const ownerId = created.user.id;
  const extension = photoExtensions[photo.type];
  const avatarPath = `${ownerId}/${randomUUID()}.${extension}`;
  let photoUploaded = false;
  let databaseCommitted = false;

  try {
    const { error: uploadError } = await admin.storage
      .from("profile-photos")
      .upload(avatarPath, photoBytes, {
        contentType: photo.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw new Error("PROFILE_PHOTO_UPLOAD_FAILED");
    photoUploaded = true;

    const recoveryCode = createRecoveryCode();
    const recoveryHash = createHash("sha256")
      .update(recoveryCode, "utf8")
      .digest("hex");
    const { error: provisionError } = await admin.rpc(
      "provision_initial_owner",
      {
        p_owner_id: ownerId,
        p_employee_name: employeeName,
        p_department: department,
        p_username: username,
        p_contact: contact,
        p_avatar_path: avatarPath,
        p_recovery_code_hash_hex: recoveryHash,
      },
    );

    if (provisionError) {
      const { data: committedProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("id", ownerId)
        .maybeSingle();
      if (!committedProfile)
        throw new Error("OWNER_PROFILE_TRANSACTION_FAILED");
    }
    databaseCommitted = true;

    return {
      status: "success",
      message: "Owner account is ready.",
      recoveryCode,
    };
  } catch {
    if (!databaseCommitted) {
      if (photoUploaded) {
        await admin.storage.from("profile-photos").remove([avatarPath]);
      }
      await admin.auth.admin.deleteUser(ownerId);
    }
    return {
      status: "error",
      message:
        "Setup could not finish. No Owner profile was activated; try again.",
    };
  }
}
