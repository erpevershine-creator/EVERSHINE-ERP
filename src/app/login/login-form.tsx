"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, type LoginState } from "./actions";

const initialLoginState: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(login, initialLoginState);

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form action={action} className="login-form">
      <label>
        Gmail username
        <input
          name="username"
          type="email"
          placeholder="name@gmail.com"
          autoComplete="username"
          required
        />
      </label>
      <label>
        ERP password
        <input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.status === "error" ? (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
