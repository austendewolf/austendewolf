"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // If email confirmation is on, the session is null until they confirm.
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    await sb.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user: session?.user ?? null, session, loading, signIn, signUp, signOut }),
    [session, loading, signIn, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Wrapper around fetch that always attaches the current Supabase access
 * token. The SDK already refreshes the token on its own; we just read
 * whatever's current at call time. Used for every workout-app API call.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Email + password sign-in screen. Stays on the workout app's own page
 * (no OAuth redirect). Supports sign-up with a flip toggle.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>
        LOADING…
      </div>
    );
  }
  if (!user) return <SignInForm />;
  return <>{children}</>;
}

function SignInForm() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmHint, setConfirmHint] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmHint(false);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password);
        if (error) setError(error);
      } else {
        const { error, needsConfirmation } = await signUp(email.trim(), password);
        if (error) setError(error);
        else if (needsConfirmation) setConfirmHint(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: "var(--text)", textAlign: "center" }}>
          Workout
        </div>
        <div style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", textAlign: "center" }}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle()}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}>Password</span>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle()}
          />
        </label>

        {error && (
          <div style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 6, padding: "8px 10px", fontFamily: "monospace", wordBreak: "break-word" }}>
            {error}
          </div>
        )}

        {confirmHint && (
          <div style={{ fontSize: 11, color: "var(--accent)", background: "var(--done-bg)", border: "1px solid var(--done-border)", borderRadius: 6, padding: "8px 10px", fontFamily: "monospace" }}>
            Check your email to confirm the account.
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !email || !password}
          style={{
            background: "var(--text)",
            color: "var(--bg)",
            border: "none",
            borderRadius: 10,
            padding: "13px 14px",
            fontSize: 12,
            fontFamily: "monospace",
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setConfirmHint(false);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: 2,
            textTransform: "uppercase",
            padding: 4,
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have one? Sign in"}
        </button>
      </form>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 15,
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    padding: "12px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    WebkitAppearance: "none",
  };
}

export function userInitials(user: User | null): string {
  if (!user) return "?";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  const email = user.email ?? "";
  const local = email.split("@")[0] ?? "";
  // Try splitting on common separators in the local part.
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}
