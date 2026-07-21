import { loadProgram, loadSchedule } from "@/lib/program";
import { getSql } from "@/lib/db";
import type { Day } from "@/app/program";
import type { Week } from "@/app/week-schedule";
import EmbedWeekClient from "./embed-week-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Embeddable week view. Renders inside an iframe on other surfaces
 * (Claude chat, etc.) via a permissive frame-ancestors CSP set in
 * next.config.mjs. Single-tenant for now, matching lib/program.ts.
 */
export default async function EmbedWeekPage() {
  const [program, schedule, logged] = await Promise.all([
    loadProgram(),
    loadSchedule(),
    loadLoggedIds(),
  ]);

  const today = todayIsoLocal();
  const week = pickWeek(schedule, today);

  return (
    <EmbedWeekClient
      program={program}
      week={week}
      todayIso={today}
      loggedIds={logged}
    />
  );
}

async function loadLoggedIds(): Promise<Set<string>> {
  try {
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`SELECT id FROM workouts`;
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pickWeek(schedule: Week[], today: string): Week | null {
  if (schedule.length === 0) return null;
  // Prefer the week containing today; otherwise the next upcoming week;
  // otherwise the most recent past week.
  for (const w of schedule) {
    if (w.days.some((d) => d.date === today)) return w;
  }
  const upcoming = schedule.find((w) => w.days.some((d) => d.date >= today));
  if (upcoming) return upcoming;
  return schedule[schedule.length - 1];
}
