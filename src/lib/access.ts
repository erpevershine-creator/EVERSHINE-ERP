import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Access = {
  id: string;
  employeeName: string;
  username: string;
  role: string;
  pages: Record<string, boolean>;
  actions: Record<string, string[]>;
};
export const getAccess = cache(async (): Promise<Access | null> => {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data, error } = await db.rpc("my_access");
  if (error)
    throw new Error("Account access could not be verified. Please retry.");
  return data as Access | null;
});
export async function requireAccess(page?: string) {
  const access = await getAccess();
  if (!access) redirect("/login");
  if (page && !access.pages[page])
    throw new Error("Access restricted for this account.");
  return access;
}
export function allows(access: Access, module: string, action: string) {
  return (
    access.role === "owner" ||
    Boolean(
      access.actions[module]?.includes(action) ||
        access.actions[module]?.includes("*"),
    )
  );
}
