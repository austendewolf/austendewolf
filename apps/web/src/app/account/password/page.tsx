import { PasswordForm } from "@/components/password-form";
import { getViewer } from "@/lib/mcp/owner";

export const metadata = { title: "Password — Austen DeWolf" };
export const runtime = "nodejs";

export default async function PasswordPage() {
  const viewer = await getViewer();

  if (!viewer.isOwner) {
    return (
      <div className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Password</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in first. A one-time link works if you do not have a password yet
          — that is the point of this page.
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
      <h1 className="text-3xl font-bold tracking-tight">Password</h1>
      <p className="mt-2 text-sm text-muted-foreground">{viewer.email}</p>

      <div className="mt-8">
        <PasswordForm />
      </div>
    </div>
  );
}
