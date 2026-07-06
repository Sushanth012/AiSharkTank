import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <ChartNoAxesCombined size={19} aria-hidden="true" />
          </span>
          <span>AI Shark Tank</span>
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          <Link className="nav-link" href="/dashboard">
            Dashboard
          </Link>
          <Link className="nav-link" href="/new">
            New Pitch
          </Link>
          <Link className="nav-link" href="/auth">
            Account
          </Link>
        </nav>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
