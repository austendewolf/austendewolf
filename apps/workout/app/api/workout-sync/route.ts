import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { workouts } from "@awd/db";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";
import { authorizeMcp } from "@/lib/mcp-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workout-sync?id=<workoutId>
 * Returns the stored data JSON for that id, or {} if not found.
 *
 * POST /api/workout-sync?id=<workoutId>
 * Body: arbitrary JSON object. Upserts the row keyed on id.
 * Returns { ok: true }.
 */

/**
 * Either a signed-in owner session or the static MCP token gets in.
 *
 * The browser holds a Supabase access token, which expires hourly and gets
 * refreshed for it. Nothing off-device can do that. A phone automation posting
 * an Apple Health workout, or a script posting a Garmin activity, has nowhere
 * to run a refresh and nobody to prompt for a login, so it holds the same
 * static token the MCP endpoint already accepts. The read path and the write
 * path now agree on who the owner is.
 */
async function requireOwner(req: NextRequest): Promise<NextResponse | null> {
  if (await authorizeMcp(req)) return null;
  const auth = await requireUser(req);
  return auth instanceof NextResponse ? auth : null;
}

function badId(id: string | null): id is null {
  if (!id) return true;
  return !/^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

export async function GET(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (badId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  try {
    const rows = await getDb()
      .select({ data: workouts.data })
      .from(workouts)
      .where(eq(workouts.id, id))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({});
    }
    return NextResponse.json(rows[0].data ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireOwner(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (badId(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "object_required" }, { status: 400 });
  }

  try {
    await getDb()
      .insert(workouts)
      .values({ id, data: body, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: workouts.id,
        set: { data: body, updatedAt: new Date() },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
