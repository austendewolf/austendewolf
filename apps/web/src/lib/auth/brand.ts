/**
 * How this site's sign-in email should look.
 *
 * One Supabase project backs every Standard Reasoning app, and Supabase renders
 * exactly one email template per project — so the shared `send-email` hook took
 * delivery over instead. The split it defines is that the *app* owns
 * presentation and the *registry* owns identity: the palette below travels in
 * the emailed link, while who the mail comes from is keyed to `app` in the
 * hook's own registry and can never be set from here.
 *
 * That is deliberate. A crafted link can restyle one of these emails; it can
 * never re-address one.
 */

const APP_ID = "austendewolf";

/** The blueprint, as the email can render it: no textures, no filters. */
const BRAND = {
  name: "Austen DeWolf",
  blurb: "Open this on the device you want to sign in from.",
  accent: "#ffffff",
  onAccent: "#113a63",
  surface: "#113a63",
  link: "#c3d8ea",
  ink: "#e8f1f8",
  dim: "#7ea3c8",
  rule: "#3d6188",
};

/** base64url, because the value rides in a query string. */
function toBase64Url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The URL the emailed link comes back to.
 *
 * The hook appends `token_hash` and `type` to whatever is passed here, so this
 * must already carry a query string — and the route it points at has to accept
 * that pair. `brand` is stripped by the hook once it has been used to render
 * the mail, so it never shows up in the link the reader sees.
 */
export function emailRedirectTo(origin: string, next: string): string {
  const brand = toBase64Url(JSON.stringify(BRAND));
  return (
    `${origin}/auth/callback` +
    `?app=${APP_ID}` +
    `&next=${encodeURIComponent(next)}` +
    `&brand=${brand}`
  );
}
