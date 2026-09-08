"use server";
import { createAdminClient } from "@/lib/supabase/admin";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type LoginState = {
  status: "idle" | "error" | "success";
  message: string;
};

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
    if (error?.code === "invalid_credentials") {
      await createAdminClient().rpc("record_login_attempt", {
        p_username: username,
        p_success: false,
      });
    }
    return {
      status: "error",
      message:
        error?.code === "invalid_credentials"
          ? "Username or ERP password is incorrect."
          : error?.status === 429
            ? "Too many login attempts. Please try again shortly."
            : "Sign-in service is unavailable. Please contact your administrator.",
    };
  }

  const { data: claims } = await supabase.auth.getClaims();
  const sessionId = claims?.claims?.session_id;
  if (typeof sessionId === "string") {
    const attempt = await createAdminClient().rpc("record_login_attempt", {
      p_username: username,
      p_success: true,
      p_session: sessionId,
    });
    if (attempt.error) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        status: "error",
        message: "Sign-in could not be recorded. Please retry.",
      };
    }
  }
  const { data: access, error: accessError } = await supabase.rpc("my_access");
  if (accessError || !access) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message:
        "Account access is unavailable. Contact Owner or an authorized Admin; Owner may use emergency recovery.",
    };
  }

  return { status: "success", message: "Signed in." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.rpc("end_my_session");
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
