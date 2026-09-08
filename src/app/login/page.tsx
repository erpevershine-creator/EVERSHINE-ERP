import Link from "next/link";
import { getAccess } from "@/lib/access";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { ThemeControl } from "@/components/theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const admin = createAdminClient();
  const { data: owner, error: ownerError } = await admin
    .from("profiles")
    .select("id")
    .eq("erp_role", "owner")
    .neq("status", "inactive")
    .maybeSingle();
  if (ownerError) throw new Error("Owner setup status could not be verified.");
  if (!owner) redirect("/setup/owner");

  const access = await getAccess();
  if (access) redirect("/dashboard");

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
        <LoginForm />
        <Link href="/recover">Owner emergency recovery</Link>
      </section>
      <small className="login-footer">
        EVERSHINE ERP 2.1 · Local authentication
      </small>
    </main>
  );
}
