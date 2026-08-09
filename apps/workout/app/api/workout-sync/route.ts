import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { workouts } from "@awd/db";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";

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

function badId(id: string | null): id is null {
  if (!id) return true;
  return !/^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

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
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

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
