import { NextResponse, type NextRequest } from "next/server";
import { asc, like } from "drizzle-orm";
import { workouts } from "@awd/db";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workouts-on-date?date=YYYY-MM-DD
 *
 * Returns every workouts-table row whose id starts with the given date.
 * Used by Day view to surface imported (Garmin) activities and any
 * program-day rows side by side.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !ISO.test(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  try {
    const rows = await getDb()
      .select({ id: workouts.id, data: workouts.data })
      .from(workouts)
      .where(like(workouts.id, `${date}-%`))
      .orderBy(asc(workouts.id));
    return NextResponse.json({ workouts: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
