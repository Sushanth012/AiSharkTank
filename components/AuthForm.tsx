"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!supabase) {
      router.push("/dashboard");
      return;
    }

    setLoading(true);
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email if confirmation is enabled.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="grid" onSubmit={submit}>
      <div className="auth-tabs" aria-label="Authentication mode">
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
        <button
          type="button"
          className={mode === "signin" ? "active" : ""}
          aria-pressed={mode === "signin"}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
      </div>

      {!supabase ? (
        <div className="callout">
          Supabase keys are not configured yet. Local demo mode is enabled so you can review
          the MVP UI before connecting production auth.
        </div>
      ) : null}

      {error ? <div className="error" role="alert">{error}</div> : null}
      {message ? <div className="success" role="status">{message}</div> : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <button className="button primary full" disabled={loading} type="submit">
        <LogIn size={18} aria-hidden="true" />
        {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
