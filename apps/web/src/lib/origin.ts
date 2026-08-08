/**
 * The origin a browser actually reached this site on.
 *
 * `new URL(request.url).origin` cannot be used for this. Under
 * `output: "standalone"` the server is a long-running Node process bound to
 * 0.0.0.0:8080, and that bind address is what ends up in `request.url` — so a
 * redirect built from it sends the browser to https://0.0.0.0:8080, which is
 * nowhere. The public host only exists in the proxy's headers.
 *
 * Deriving it per request rather than reading a fixed environment value keeps a
 * link requested from localhost returning to localhost, and one requested from
 * a preview deployment returning to that deployment.
 */
export function originFrom(headers: Headers): string {
  // Chained proxies append rather than replace, so these can be comma lists and
  // the first entry is the one the browser saw.
  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host") ?? "localhost:3100";
  const proto = first(headers.get("x-forwarded-proto")) ?? (isLocal(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const first = (value: string | null) => value?.split(",")[0]?.trim() || null;

const isLocal = (host: string) => host.startsWith("localhost") || host.startsWith("127.0.0.1");
