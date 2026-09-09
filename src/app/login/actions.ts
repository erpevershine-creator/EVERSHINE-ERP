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

  if (!username || username.length > 254 || !password || password.length > 128) {
    return {
      status: "error",
      message: "Enter your username and ERP password.",
    };
  }

  const admin = createAdminClient();
  const reservation = await admin.rpc("reserve_login_attempt", {
    p_username: username,
  });
  if (reservation.error || !reservation.data)
    return {
      status: "error",
      message: reservation.error
        ? "Sign-in service is unavailable. Please retry shortly."
        : "Too many login attempts. Please try again later.",
    };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: username,
    password,
  });
  if (error || !data.user) {
    await admin.rpc("complete_login_attempt", {
      p_ticket: reservation.data,
      p_outcome:
        error?.code === "invalid_credentials"
          ? "invalid_credentials"
          : "service_failure",
    });
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
  const attempt = await admin.rpc("complete_login_attempt", {
    p_ticket: reservation.data,
    p_outcome: "success",
    p_session: typeof sessionId === "string" ? sessionId : null,
  });
  if (attempt.error || attempt.data !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "Sign-in could not be recorded. Please retry.",
    };
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
