"use client";
import Link from "next/link";
import { useActionState } from "react";
import { recoverOwner } from "./actions";
import type { Result } from "@/app/live/actions";
const initial: Result = { status: "idle", message: "" };
export function RecoveryForm() {
  const [state, action, pending] = useActionState(recoverOwner, initial);
  if (state.status === "success")
    return (
      <>
        <p role="status">{state.message}</p>
        <Link href="/login">Return to sign in</Link>
      </>
    );
  return (
    <form action={action} className="login-form">
      <label>
        Owner Gmail username
        <input name="username" type="email" autoComplete="username" required />
      </label>
      <label>
        Emergency Recovery Code
        <input
          name="code"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label>
        New ERP password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </label>
      {state.message && (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending ? "Recovering…" : "Recover Owner account"}
      </button>
      <Link href="/login">Return to sign in</Link>
    </form>
  );
}
