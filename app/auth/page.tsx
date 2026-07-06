import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";

export default function AuthPage() {
  return (
    <AppShell>
      <section className="auth-card panel">
        <div className="section-title" style={{ display: "block" }}>
          <p className="eyebrow">Secure account</p>
          <h1>Start your pitch workspace</h1>
          <p>Sign in or create an account to save reports and manage uploads.</p>
        </div>
        <AuthForm />
      </section>
    </AppShell>
  );
}
