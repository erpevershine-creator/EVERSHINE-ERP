"use server";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeLegalName,
  validateSupplierPackage,
  type SupplierPackageInput,
} from "@/lib/suppliers";
import type { SupplierRecord, SupplierRevision } from "@/features/suppliers";

export async function getSuppliers(): Promise<SupplierRecord[]> {
  await requireAccess("suppliers");
  const db = await createClient();
  const records: SupplierRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from("suppliers")
      .select(
        "id,supplier_code,city,status,edit_version,active_package_id,created_at,created_by",
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 99);
    if (error) throw new Error("Supplier list could not be loaded.");
    if (!data.length) break;
    const all: SupplierRevision[] = [];
    for (let part = 0; ; part += 500) {
      const result = await db
        .from("supplier_packages")
        .select(
          "id,supplier_id,revision,payload,status,reason,request_id,created_by,created_at",
        )
        .in(
          "supplier_id",
          data.map((s) => s.id),
        )
        .order("revision", { ascending: false })
        .order("id")
        .range(part, part + 499);
      if (result.error)
        throw new Error("Supplier history could not be loaded.");
      all.push(...(result.data as SupplierRevision[]));
      if (result.data.length < 500) break;
    }
    for (const s of data) {
      const history = all.filter((p) => p.supplier_id === s.id);
      const effective =
        history.find((p) => p.id === s.active_package_id) ?? history[0];
      if (!effective)
        throw new Error(
          "Supplier has no package; administrator reconciliation is required.",
        );
      const status =
        s.status === "pending_approval"
          ? "Pending"
          : s.status === "active"
            ? "Active"
            : s.status === "rejected"
              ? "Rejected"
              : "Draft";
      records.push({
        ...effective.payload,
        id: s.id,
        code: s.supplier_code,
        normalizedLegalName: normalizeLegalName(effective.payload.legalName),
        status,
        createdAt: s.created_at,
        version: s.edit_version,
        history,
        createdBy: s.created_by,
      });
    }
    if (data.length < 100) break;
  }
  return records;
}

export async function saveSupplier(input: {
  id: string | null;
  expected: number;
  payload: SupplierPackageInput;
  reason: string;
  submit: boolean;
  token: string;
}) {
  await requireAccess("suppliers");
  if (input.submit) {
    const check = validateSupplierPackage(input.payload);
    if (!check.valid) return { error: check.errors.join(" ") };
  }
  const db = await createClient();
  const { data, error } = await db.rpc("save_supplier_package", {
    p_id: input.id,
    p_expected: input.expected,
    p_payload: input.payload,
    p_reason: input.reason,
    p_submit: input.submit,
    p_token: input.token,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "A Supplier name or city code already exists. Reload and check the city/name."
          : error.message,
    };
  revalidatePath("/suppliers");
  revalidatePath("/approvals");
  revalidatePath("/notifications");
  return {
    data: data as {
      id: string;
      code: string;
      version: number;
      requestId: number | null;
    },
  };
}

export async function decideSupplier(form: FormData) {
  await requireAccess("suppliers");
  const db = await createClient();
  const { error } = await db.rpc("decide_supplier_package", {
    p_request: Number(form.get("id")),
    p_decision: String(form.get("decision")),
    p_reason: String(form.get("reason") ?? ""),
  });
  if (error) return { status: "error" as const, message: error.message };
  revalidatePath("/suppliers");
  revalidatePath("/approvals");
  revalidatePath("/notifications");
  return { status: "success" as const, message: "Supplier decision recorded." };
}
