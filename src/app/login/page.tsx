import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { ThemeControl } from "@/components/theme";
export default function LoginPage() {
  return (
    <main className="login-layout">
      <div className="login-brand">
        <span className="brand-mark">E</span>
        <div>
          EVERSHINE<span>Enterprise resource planning</span>
        </div>
      </div>
      <div className="login-theme">
        <ThemeControl />
      </div>
      <section className="login-card">
        <LockKeyhole size={23} className="muted" />
        <h1>Welcome back</h1>
        <p className="muted">Sign in with your company-assigned account.</p>
        <label>
          Email address
          <input
            type="email"
            placeholder="name@gmail.com"
            autoComplete="off"
            disabled
          />
        </label>
        <label>
          ERP password
          <input
            type="password"
            placeholder="Password"
            autoComplete="off"
            disabled
          />
        </label>
        <button className="primary" disabled>
          Sign in
        </button>
        <div className="login-preview">
          <span className="eyebrow">MILESTONE 1</span>
          <p>
            Account sign-in is not connected yet. Review the foundation with
            sample records.
          </p>
          <Link href="/dashboard" className="button">
            Open local preview <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <small className="login-footer">
        EVERSHINE ERP 2.1 · Local foundation
      </small>
    </main>
  );
}
