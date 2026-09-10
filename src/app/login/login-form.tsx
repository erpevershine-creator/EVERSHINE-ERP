"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkLoginApproval, login, type LoginState } from "./actions";

const initialLoginState: LoginState = { status: "idle", message: "" };

export function LoginForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(login, initialLoginState);
  const [approvalState, setApprovalState] = useState<LoginState>(initialLoginState);

  useEffect(() => {
    if (state.status === "success") {
      router.replace("/dashboard");
      router.refresh();
    }
  }, [router, state.status]);

  useEffect(() => {
    if (state.status !== "pending") return;
    let stopped = false;
    const poll = async () => {
      const next = await checkLoginApproval();
      if (stopped) return;
      setApprovalState(next);
      if (next.status === "success") {
        router.replace("/dashboard");
        router.refresh();
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
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
      {(state.status === "error" || approvalState.status === "error") ? (
        <p className="field-error" role="alert">
          {approvalState.status === "error" ? approvalState.message : state.message}
        </p>
      ) : null}
      {state.status === "pending" && approvalState.status !== "error" ? <p role="status">{approvalState.message || state.message}</p> : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
