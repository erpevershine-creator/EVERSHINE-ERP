"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type LoginState = {
  status: "idle" | "error" | "success";
  message: string;
};
export const initialLoginState: LoginState = { status: "idle", message: "" };

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const usernameValue = formData.get("username");
  const passwordValue = formData.get("password");
  const username =
    typeof usernameValue === "string" ? usernameValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!username || !password) {
    return {
      status: "error",
      message: "Enter your username and ERP password.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: username,
    password,
  });
  if (error || !data.user) {
    return {
      status: "error",
      message: "Username or ERP password is incorrect.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .single();
  if (profileError || profile?.status !== "active") {
    await supabase.auth.signOut();
    return { status: "error", message: "This ERP account is not active." };
  }

  return { status: "success", message: "Signed in." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
