import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/Logo";

export function AppShell({ children, variant = "marketing" }: { children: React.ReactNode; variant?: "marketing" | "workspace" }) {
  return (
    <div className={`app-shell ${variant === "workspace" ? "workspace-shell" : "marketing-shell"}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="topbar">
        <Logo />
        <nav className="nav" aria-label="Primary navigation">
          <Link className="nav-link" href="/dashboard">Workspace</Link>
          <Link className="nav-link" href="/new">New pitch</Link>
          <Link className="nav-link" href="/pricing">Pricing</Link>
          <Link className="nav-cta" href="/auth">{variant === "workspace" ? "Account" : "Enter the room"}<ArrowUpRight size={15} aria-hidden="true" /></Link>
        </nav>
      </header>
      <main className="page" id="main-content">{children}</main>
      <footer className="site-footer">
        <Logo />
        <p>Practice the pressure. Keep your equity.</p>
        <span>AI feedback for rehearsal. Not financial advice.</span>
      </footer>
    </div>
  );
}
