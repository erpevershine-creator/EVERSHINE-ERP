"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clipboard, ImagePlus, KeyRound } from "lucide-react";
import { setupOwner, type OwnerSetupState } from "./actions";

const initialOwnerSetupState: OwnerSetupState = { status: "idle", message: "" };

export function OwnerSetupForm() {
  const [state, action, pending] = useActionState(
    setupOwner,
    initialOwnerSetupState,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  if (state.status === "success" && state.recoveryCode) {
    return (
      <section className="setup-success" aria-live="polite">
        <Check size={24} />
        <h1>Owner account is ready</h1>
        <p>
          Save this emergency recovery code now. It will not be shown again.
        </p>
        <code>{state.recoveryCode}</code>
        <div className="setup-actions">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(state.recoveryCode!);
              setCopied(true);
            }}
          >
            <Clipboard size={15} /> {copied ? "Copied" : "Copy code"}
          </button>
          <Link href="/login" replace className="button primary">
            Continue to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form action={action} className="owner-setup-form">
      <div className="setup-photo">
        <label htmlFor="owner-photo">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected Owner profile preview" />
          ) : (
            <span>
              <ImagePlus size={21} /> Profile photo
            </span>
          )}
        </label>
        <input
          id="owner-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(event) => {
            if (previewRef.current) URL.revokeObjectURL(previewRef.current);
            const file = event.target.files?.[0];
            const next = file ? URL.createObjectURL(file) : null;
            previewRef.current = next;
            setPreview(next);
          }}
        />
        <small>JPEG, PNG or WebP · max 2 MB</small>
      </div>

      <div className="setup-grid">
        <label>
          Employee name
          <input
            name="employeeName"
            autoComplete="name"
            maxLength={120}
            required
          />
        </label>
        <label>
          Department
          <input name="department" maxLength={120} required />
        </label>
        <label>
          Position
          <input value="Owner" readOnly aria-readonly="true" />
        </label>
        <label>
          ERP role
          <input value="Owner" readOnly aria-readonly="true" />
        </label>
        <label>
          Gmail username
          <input
            name="username"
            type="email"
            placeholder="name@gmail.com"
            autoComplete="username"
            inputMode="email"
            required
          />
        </label>
        <label>
          Contact
          <input name="contact" autoComplete="tel" maxLength={120} required />
        </label>
        <label>
          ERP password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
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
      </div>

      <p className="setup-password-rule">
        <KeyRound size={14} /> Minimum 8 characters with one uppercase letter
        and one number.
      </p>
      {state.status === "error" ? (
        <p className="field-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="setup-submit">
        <span>
          Creates the only Owner account and closes this setup permanently.
        </span>
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Creating Owner…" : "Create Owner account"}
        </button>
      </div>
    </form>
  );
}
