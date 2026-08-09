import { NextResponse, type NextRequest } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { workouts } from "@awd/db";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/workout-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns per-workout aggregates for all rows whose id (format
 * "<YYYY-MM-DD>-<dayId>") falls in the inclusive date range. Used by
 * Month / Year heatmap views and percentile-bucket calculations.
 *
 * Response: { workouts: Array<{ id, date, dayId, volume, setsDone, setsTotal }> }
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

type RawSet = { weight?: string | number; reps?: string | number; done?: boolean };
type RawData = Record<string, RawSet[]>;

function summarize(data: unknown): { volume: number; setsDone: number; setsTotal: number } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { volume: 0, setsDone: 0, setsTotal: 0 };
  }
  let volume = 0;
  let setsDone = 0;
  let setsTotal = 0;
  for (const sets of Object.values(data as RawData)) {
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      setsTotal += 1;
      if (!s?.done) continue;
      setsDone += 1;
      const w = typeof s.weight === "number" ? s.weight : parseFloat(String(s.weight ?? 0));
      const r = typeof s.reps === "number" ? s.reps : parseFloat(String(s.reps ?? 0));
      if (Number.isFinite(w) && Number.isFinite(r)) volume += w * r;
    }
  }
  return { volume, setsDone, setsTotal };
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !ISO.test(from) || !to || !ISO.test(to)) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  // id lexicographic ordering on "YYYY-MM-DD-..." matches date ordering.
  // Use string upper bound that includes all dayId suffixes for `to`.
  const lower = from;
  const upper = `${to}-￿`;

  try {
    const rows = await getDb()
      .select({ id: workouts.id, data: workouts.data })
      .from(workouts)
      .where(and(gte(workouts.id, lower), lte(workouts.id, upper)));
    // Named `summaries` rather than `workouts`: that identifier is now the
    // table itself, imported above and used by the query two lines up.
    const summaries = rows.map((row) => {
      const m = row.id.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      const date = m?.[1] ?? "";
      const dayId = m?.[2] ?? "";
      const { volume, setsDone, setsTotal } = summarize(row.data);
      return { id: row.id, date, dayId, volume, setsDone, setsTotal };
    });
    return NextResponse.json({ workouts: summaries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
