import { signOut } from "@/app/login/actions";

/**
 * Sign-out as a form rather than a link.
 *
 * A GET request that destroys a session can be fired by anything that renders a
 * URL — a prefetch, a link scanner, an image tag on another site — so it goes
 * through a POST-backed server action instead.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action={signOut} className={className}>
      <button
        type="submit"
        className="border border-border/60 px-4 py-2 text-sm hover:border-accent transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
