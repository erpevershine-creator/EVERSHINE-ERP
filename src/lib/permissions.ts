import { createClient } from "@/lib/supabase/server";

export const SUPPLIER_PERMISSIONS = {
  VIEW: "supplier.read",
  CREATE: "supplier.create",
  UPDATE: "supplier.update",
  APPROVE: "supplier.approve",
  DELETE: "supplier.delete",
} as const;

export type SupplierPermission =
  (typeof SUPPLIER_PERMISSIONS)[keyof typeof SUPPLIER_PERMISSIONS];

export async function requirePermission(permission: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error("Authentication required");

  const { data } = await supabase
    .from("user_roles")
    .select("role_id, roles(role_permissions(permissions(key)))")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!JSON.stringify(data ?? {}).includes(permission)) {
    throw new Error("Permission denied");
  }

  return user;
}
