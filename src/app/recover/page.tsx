import { RecoveryForm } from "./recovery-form";
export const dynamic = "force-dynamic";
export default function RecoveryPage() {
  return (
    <main className="login-layout">
      <section className="login-card">
        <h1>Owner recovery</h1>
        <p className="muted">
          Use the Emergency Recovery Code saved during Owner setup.
        </p>
        <RecoveryForm />
      </section>
    </main>
  );
}
