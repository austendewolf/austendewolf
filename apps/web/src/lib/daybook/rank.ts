/**
 * Where an item sits in the list, and why.
 *
 * Rank comes from facts the store holds, never from a number someone picked.
 * Claude sets `due`, `pressure` and `size` with judgment when an item comes in;
 * this turns them into an order with no judgment at all. A wrong rank traces
 * back to one wrong fact, and fixing the fact fixes the rank.
 *
 * `priority` survives as hand order inside a band. A drag moves an item among
 * its neighbours in the same band and cannot lift it over a band boundary,
 * because the failure this exists to prevent is an undated note sitting above
 * a deadline that passed six days ago.
 *
 * Pure and dependency-free, so the server, the page and the tests share it.
 * `docs/daybook-actionable.md` holds the reasoning.
 */

export type Pressure = "waiting" | "meeting" | "deadline" | "none";
export type Size = "quick" | "session" | "project";

export const PRESSURES: readonly Pressure[] = ["waiting", "meeting", "deadline", "none"];
export const SIZES: readonly Size[] = ["quick", "session", "project"];

/** The fields rank reads. A full item satisfies it. */
export interface Rankable {
  id: string;
  due: string | null;
  pressure: Pressure | null;
  size: Size | null;
  priority: number | null;
  first_seen: string;
  updated_at: string;
  person?: string | null;
}

/** Lower sorts first. The numbers are stable so a stored or logged band still reads right later. */
export const BAND = {
  overdue: 1,
  today: 2,
  waiting: 3,
  week: 4,
  quick: 5,
  rest: 6,
  stale: 7,
} as const;
export type Band = (typeof BAND)[keyof typeof BAND];

/** Open this long with nothing written to it, and it is a drop candidate. */
export const STALE_DAYS = 30;
/** How far ahead "this week" reaches. */
export const WEEK_DAYS = 7;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s);

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}

/** The Pacific calendar date of a Postgres timestamp string or an ISO one. */
function dayOf(ts: string): string | null {
  if (isDay(ts.slice(0, 10))) {
    const ms = Date.parse(ts.replace(" ", "T").replace(/\+00$/, "Z"));
    if (Number.isNaN(ms)) return ts.slice(0, 10);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  }
  return null;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (d: string) => WEEKDAY[new Date(d + "T12:00:00Z").getUTCDay()];

/** The first name in an email, for a reason clause. */
function firstName(person: string | null | undefined): string {
  if (!person) return "";
  const local = person.split("@")[0].split(/[._-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : "";
}

export interface Placement {
  band: Band;
  /** A short clause saying why it sits here, or empty when nothing put it anywhere. */
  reason: string;
}

/**
 * The band an item falls in on a given Pacific date, and the clause that says why.
 *
 * Bands, first match wins:
 *   1 overdue    due before today
 *   2 today      due today
 *   3 waiting    someone is blocked on him
 *   4 week       due within the next seven days
 *   5 quick      under fifteen minutes, any date beyond the week or none
 *   6 rest       everything else, in hand order
 *   7 stale      open thirty days and untouched for thirty, a drop candidate
 *
 * A dated item never goes stale, since the date is its own clock.
 */
export function place(it: Rankable, today: string): Placement {
  const due = isDay(it.due) ? it.due : null;
  const gap = due ? daysBetween(today, due) : null;
  const who = firstName(it.person);

  if (gap !== null && gap < 0) {
    const ago = -gap;
    return { band: BAND.overdue, reason: ago === 1 ? "due yesterday" : `due ${ago} days ago` };
  }
  if (gap === 0) {
    return { band: BAND.today, reason: it.pressure === "meeting" ? "meeting today" : "due today" };
  }
  if (it.pressure === "waiting") {
    return { band: BAND.waiting, reason: who ? `${who} is waiting` : "someone is waiting" };
  }
  if (gap !== null && gap <= WEEK_DAYS) {
    const when = gap === 1 ? "tomorrow" : weekday(due!);
    return { band: BAND.week, reason: it.pressure === "meeting" ? `meeting ${when}` : `due ${when}` };
  }

  const age = daysBetween(it.first_seen, today);
  if (it.size === "quick") {
    return { band: BAND.quick, reason: age >= 2 ? `quick, ${age} days old` : "quick" };
  }

  const touched = dayOf(it.updated_at);
  const idle = touched ? daysBetween(touched, today) : 0;
  if (!due && age >= STALE_DAYS && idle >= STALE_DAYS) {
    return { band: BAND.stale, reason: `${age} days, no motion` };
  }

  if (due) return { band: BAND.rest, reason: `due ${due.slice(5).replace("-", "/")}` };
  return { band: BAND.rest, reason: it.size === "project" ? "project" : "" };
}

/**
 * The list order. Band first. Inside a band that a date drives, the soonest
 * date leads and hand order breaks ties; everywhere else hand order leads, then
 * the date, then age, oldest first.
 */
export function compare(a: Rankable, b: Rankable, today: string, pa = place(a, today), pb = place(b, today)): number {
  if (pa.band !== pb.band) return pa.band - pb.band;
  const byDue = () => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0);
  const byHand = () => (a.priority ?? Infinity) - (b.priority ?? Infinity);
  const byAge = () => a.first_seen.localeCompare(b.first_seen) || a.id.localeCompare(b.id);
  const dated = pa.band === BAND.overdue || pa.band === BAND.today || pa.band === BAND.week;
  return dated ? byDue() || byHand() || byAge() : byHand() || byDue() || byAge();
}

/** Sort a list in place by rank and return each item with its band and reason attached. */
export function ranked<T extends Rankable>(items: T[], today: string): Array<T & Placement> {
  const placed = items.map((it) => ({ it, p: place(it, today) }));
  placed.sort((x, y) => compare(x.it, y.it, today, x.p, y.p));
  return placed.map(({ it, p }) => ({ ...it, band: p.band, reason: p.reason }));
}
