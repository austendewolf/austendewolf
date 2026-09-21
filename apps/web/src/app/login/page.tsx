import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { PasskeyButton } from "@/components/passkey-button";
import { getViewer } from "@/lib/mcp/owner";

export const metadata = {
  title: "Sign in — Austen DeWolf",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const viewer = await getViewer();

  // Nothing to do here while a valid session already exists.
  if (viewer.isOwner) redirect(safeNext(next));

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>

      {error && (
        <p
          className="mt-6 border border-destructive/60 px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="mt-8 space-y-6">
        {/* The passkey comes first because it is the route that should be used. */}
        <PasskeyButton next={safeNext(next)} />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border/50" />
          or
          <span className="h-px flex-1 bg-border/50" />
        </div>

        <LoginForm next={safeNext(next)} />
      </div>
    </div>
  );
}

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
