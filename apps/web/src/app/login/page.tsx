import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "Sign in — Austen DeWolf",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This site is private. Sign-in is limited to its owner.
      </p>
      {error && (
        <p className="mt-6 rounded-sm border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
