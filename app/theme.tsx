"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, userInitials } from "./auth";

export type Theme = "system" | "light" | "dark";
export type Accent = "lime" | "blue" | "orange";

const ACCENT_SWATCH: Record<Accent, string> = {
  lime: "#C6F135",
  blue: "#3b82f6",
  orange: "#f97316",
};

const THEME_KEY = "wl_theme";
const ACCENT_KEY = "wl_accent";
const TARGET_KEY = "wl_weekly_target";
const DEFAULT_TARGET = 4;

/**
 * Settings dropdown — theme (System / Light / Dark) + accent swatch
 * picker (Lime / Blue / Orange). Persists to localStorage; OS theme
 * changes are picked up live when theme is set to "system".
 */
export function SettingsDropdown() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [accent, setAccent] = useState<Accent>("lime");
  const [target, setTargetState] = useState<number>(DEFAULT_TARGET);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage post-mount; the inline script in layout.tsx
  // has already applied the visible state to <html>.
  useEffect(() => {
    try {
      const t = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
      const a = (localStorage.getItem(ACCENT_KEY) as Accent | null) ?? "lime";
      const rawTgt = localStorage.getItem(TARGET_KEY);
      const tgt = rawTgt ? parseInt(rawTgt, 10) : DEFAULT_TARGET;
      setTheme(t);
      setAccent(a);
      setTargetState(Number.isFinite(tgt) && tgt > 0 ? tgt : DEFAULT_TARGET);
    } catch {}
    setMounted(true);
  }, []);

  const setTarget = (n: number) => {
    const clamped = Math.max(1, Math.min(7, n));
    setTargetState(clamped);
    try {
      localStorage.setItem(TARGET_KEY, String(clamped));
      // Notify other tabs / same-tab listeners.
      window.dispatchEvent(new StorageEvent("storage", { key: TARGET_KEY, newValue: String(clamped) }));
    } catch {}
  };

  // Apply theme + accent to <html> and persist.
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const effective =
      theme === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    root.setAttribute("data-theme", effective);
    root.setAttribute("data-accent", accent);
    try {
      localStorage.setItem(THEME_KEY, theme);
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {}
  }, [theme, accent, mounted]);

  // Track OS theme changes while theme === "system".
  useEffect(() => {
    if (!mounted || theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const handle = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, [theme, mounted]);

  // Dismiss on outside click + esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 36, height: 36, background: "transparent",
          border: "1px solid var(--border)", borderRadius: 8,
          color: "var(--text)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {open && mounted && (
        <div
          role="menu"
          style={{
            position: "absolute", left: 0, top: "calc(100% + 6px)",
            minWidth: 240, background: "var(--bg-2)",
            border: "1px solid var(--border)", borderRadius: 12,
            padding: 14, zIndex: 100,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
            Theme
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 14 }}>
            {(["system", "light", "dark"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                style={{
                  padding: "8px 4px",
                  background: theme === t ? "var(--text)" : "transparent",
                  color: theme === t ? "var(--bg)" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
                  textTransform: "uppercase", cursor: "pointer", fontWeight: 700,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
            Accent
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {(Object.keys(ACCENT_SWATCH) as Accent[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                aria-label={a}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: ACCENT_SWATCH[a],
                  border: accent === a ? "2px solid var(--text)" : "2px solid var(--border)",
                  cursor: "pointer", padding: 0,
                  boxShadow: accent === a ? "0 0 0 3px var(--bg-2), 0 0 0 4px " + ACCENT_SWATCH[a] : "none",
                  transition: "box-shadow 0.15s ease",
                }}
              />
            ))}
          </div>

          <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
            Weekly target
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setTarget(target - 1)}
              aria-label="Decrease target"
              style={targetStepBtn()}
            >
              −
            </button>
            <div style={{
              flex: 1, textAlign: "center",
              fontSize: 16, fontWeight: 800, fontFamily: "monospace",
              color: "var(--text)",
            }}>
              {target}<span style={{ color: "var(--muted)", fontSize: 11, marginLeft: 4 }}>/ week</span>
            </div>
            <button
              onClick={() => setTarget(target + 1)}
              aria-label="Increase target"
              style={targetStepBtn()}
            >
              +
            </button>
          </div>

          <SignOutRow onAfter={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function SignOutRow({ onAfter }: { onAfter: () => void }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
        Signed in
      </div>
      <div style={{ fontSize: 11, color: "var(--text)", marginBottom: 10, wordBreak: "break-all", fontFamily: "monospace" }}>
        {user.email}
      </div>
      <button
        onClick={async () => {
          await signOut();
          onAfter();
        }}
        style={{
          width: "100%",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text)",
          fontSize: 10,
          fontFamily: "monospace",
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          padding: "10px 12px",
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function targetStepBtn(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 8,
    background: "transparent", border: "1px solid var(--border)",
    color: "var(--text)", cursor: "pointer",
    fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0,
  };
}

export function Header() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "44px 1fr 44px",
      alignItems: "center",
      padding: "10px 12px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg)",
      position: "sticky", top: 0, zIndex: 40,
    }}>
      <div style={{ justifySelf: "start" }}>
        <SettingsDropdown />
      </div>
      <div style={{ justifySelf: "center", fontSize: 12, fontWeight: 900, letterSpacing: 3, textTransform: "uppercase", color: "var(--text)" }}>
        Workout
      </div>
      <div style={{ justifySelf: "end" }}>
        <UserBadge />
      </div>
    </div>
  );
}

function UserBadge() {
  const { user } = useAuth();
  const initials = userInitials(user);
  return (
    <div
      aria-label={user?.email ? `Signed in as ${user.email}` : "Account"}
      title={user?.email ?? ""}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--accent)",
        color: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: 1,
      }}
    >
      {initials}
    </div>
  );
}
