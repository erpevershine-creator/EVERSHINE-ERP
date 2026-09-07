import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ThemeControl } from "@/components/theme";
import { createAdminClient } from "@/lib/supabase/admin";
import { OwnerSetupForm } from "./owner-setup-form";

export const dynamic = "force-dynamic";

export default async function OwnerSetupPage() {
  const admin = createAdminClient();
  const { data: owner, error } = await admin
    .from("profiles")
    .select("id")
    .eq("erp_role", "owner")
    .neq("status", "inactive")
    .maybeSingle();

  if (error) throw new Error("Owner setup status could not be verified.");
  if (owner) redirect("/login");

  return (
    <main className="setup-layout">
      <div className="login-brand">
        <span className="brand-mark">E</span>
        <div>
          EVERSHINE<span>Enterprise resource planning</span>
        </div>
      </div>
      <div className="login-theme">
        <ThemeControl />
      </div>
      <section className="setup-card">
        <header>
          <ShieldCheck size={22} />
          <div>
            <span className="eyebrow">LOCAL ONE-TIME SETUP</span>
            <h1>Create the Owner account</h1>
            <p>
              Enter the company-approved details privately on this computer.
            </p>
          </div>
        </header>
        <OwnerSetupForm />
      </section>
      <small className="login-footer">
        EVERSHINE ERP 2.1 · Local secure setup
      </small>
    </main>
  );
}
