import { PasskeyManager } from "@/components/passkey-manager";
import { PasswordForm } from "@/components/password-form";
import { getViewer } from "@/lib/mcp/owner";

// The page covers both routes in, so it is named for what it settles rather
// than for the password half. The path stays, since recovery links point at it.
export const metadata = { title: "Sign-in — Austen DeWolf" };
export const runtime = "nodejs";

export default async function PasswordPage() {
  const viewer = await getViewer();

  if (!viewer.isOwner) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Sign-in</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in first. A one-time link works if you have neither a passkey nor
          a password yet, which is what this page is for.
        </p>
        <a
          href="/login?next=%2Faccount%2Fpassword"
          className="mt-8 inline-block border border-border/60 px-4 py-2 text-sm hover:border-accent"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Sign-in</h1>
      <p className="mt-2 text-sm text-muted-foreground">{viewer.email}</p>

      <div className="mt-8">
        <PasskeyManager />
      </div>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-sm font-medium">Password</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          The fallback for a device that has no passkey on it.
        </p>
        <div className="mt-4">
          <PasswordForm />
        </div>
      </div>
    </div>
  );
}
