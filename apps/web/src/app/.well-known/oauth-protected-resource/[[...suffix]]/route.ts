import { protectedResourceMetadata, resourceSuffix } from "@/lib/mcp/connector";

export const runtime = "nodejs";
// Read from the environment per request. A statically rendered answer would bake
// in whatever the build machine happened to have.
export const dynamic = "force-dynamic";

/**
 * Where a client learns which authorization server guards this endpoint.
 *
 * RFC 9728, served at both shapes from one file: the bare well-known path, and
 * the same path with the resource's own path inserted after it, which is the one
 * clients try first when the resource URL has a path. Anything else 404s rather
 * than claiming to describe a resource this server does not serve.
 *
 * Deliberately public. It names no secret, and a client that cannot read it
 * cannot find the sign-in at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ suffix?: string[] }> },
) {
  const { suffix } = await params;
  const asked = (suffix ?? []).join("/");
  if (asked && asked !== resourceSuffix()) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(protectedResourceMetadata());
}
