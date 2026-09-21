"use server";

import {
  assertDate,
  closeItem,
  ensureDay,
  moveItem,
  patchItems,
  reopenItem,
  setDay,
  snapshot,
  TZ,
  type Day,
  type Item,
} from "@/lib/daybook/store";
import { ReauthRequired } from "@/lib/mcp/accounts";
import { listCalendarEvents, respondToEvent } from "@/lib/mcp/google";
import { requireOwner } from "@/lib/mcp/owner";

/**
 * Everything the Daybook page does to the list and the calendar.
 *
 * Server actions are reachable by a direct POST, so each one asserts the owner
 * before touching anything, the same way the account page's actions do. An
 * expected failure comes back as a code rather than a throw, because a thrown
 * error reaches a production client with its message stripped, and the page
 * words its own banner from the code.
 */

/** Which connected Google account the page reads meetings from and answers them as. */
const ACCOUNT = process.env.DAYBOOK_CALENDAR_ACCOUNT ?? "work";

export type Result<T> = { ok: true; data: T } | { ok: false; code: string };

/** The fields of a Google event the page reads. Everything else stays on the server. */
export interface CalendarEvent {
  id: string;
  summary?: string;
  status?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { self?: boolean };
  attendees?: Array<{ email?: string; self?: boolean; responseStatus?: string }>;
}

function codeOf(err: unknown): string {
  if (err instanceof ReauthRequired) return "reauth";
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("unknown account")) return "not_connected";
  if (message.startsWith("Google API error 429")) return "rate_limited";
  if (/^Google API error 4\d\d/.test(message) || message.startsWith("You organize") || message.includes("guest list")) {
    return "refused";
  }
  return "unavailable";
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  await requireOwner();
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error("daybook:", err);
    return { ok: false, code: codeOf(err) };
  }
}

const idOf = (value: unknown) => {
  if (typeof value !== "string" || !value) throw new Error("id must be a non-empty string");
  return value;
};

export async function loadSnapshot(): Promise<Result<{ items: Record<string, Item>; days: Record<string, Day> }>> {
  return attempt(() => snapshot());
}

export async function ensureDayAction(date: string): Promise<Result<Day | null>> {
  return attempt(() => ensureDay(assertDate(date)));
}

export async function closeItemAction(
  id: string,
  status: "closed" | "dropped",
  date: string,
): Promise<Result<{ item: Item; day: Day | null }>> {
  return attempt(() => {
    if (status !== "closed" && status !== "dropped") throw new Error("status must be closed or dropped");
    return closeItem(idOf(id), status, assertDate(date));
  });
}

export async function reopenItemAction(id: string, date: string): Promise<Result<{ item: Item; day: Day | null }>> {
  return attempt(() => reopenItem(idOf(id), assertDate(date)));
}

export async function moveItemAction(
  id: string,
  horizon: "today" | "later",
  date: string,
): Promise<Result<{ item: Item; day: Day | null }>> {
  return attempt(() => {
    if (horizon !== "today" && horizon !== "later") throw new Error("horizon must be today or later");
    return moveItem(idOf(id), horizon, assertDate(date));
  });
}

/** New priorities from a drag. The row he moved is stamped `ranked_by_hand`. */
export async function reorderAction(
  updates: Record<string, number>,
  movedId: string,
  date: string,
): Promise<Result<Item[]>> {
  return attempt(() => {
    const on = assertDate(date);
    const patches: Record<string, Partial<Item>> = {};
    for (const [id, priority] of Object.entries(updates)) {
      patches[id] = id === movedId ? { priority, ranked_by_hand: on } : { priority };
    }
    return patchItems(patches);
  });
}

export async function saveLoadAction(date: string, load: NonNullable<Day["load"]>): Promise<Result<Day>> {
  return attempt(() => {
    const numbers = [load?.meetings_h, load?.double_h, load?.items_today];
    if (numbers.some((n) => typeof n !== "number" || !Number.isFinite(n))) throw new Error("load must be numbers");
    return setDay(assertDate(date), {
      load: { meetings_h: load.meetings_h, double_h: load.double_h, items_today: load.items_today },
    });
  });
}

/** The UTC offset Pacific time has on a date, e.g. `-07:00`. */
function offsetFor(date: string): string {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).format(
    new Date(date + "T12:00:00Z"),
  );
  const m = s.match(/GMT([+-]\d+)/);
  const h = m ? +m[1] : -8;
  return (h < 0 ? "-" : "+") + String(Math.abs(h)).padStart(2, "0") + ":00";
}

export async function calendarAction(date: string): Promise<Result<{ events: CalendarEvent[] }>> {
  return attempt(async () => {
    const on = assertDate(date);
    const off = offsetFor(on);
    const raw = await listCalendarEvents(ACCOUNT, {
      timeMin: `${on}T00:00:00${off}`,
      timeMax: `${on}T23:59:59${off}`,
      maxResults: 100,
    });
    const events = raw.map((e) => {
      const ev = e as unknown as CalendarEvent;
      return {
        id: ev.id,
        summary: ev.summary,
        status: ev.status,
        eventType: ev.eventType,
        start: ev.start,
        end: ev.end,
        organizer: { self: Boolean(ev.organizer?.self) },
        attendees: (ev.attendees ?? []).map((a) => ({
          email: a.email,
          self: a.self,
          responseStatus: a.responseStatus,
        })),
      };
    });
    return { events };
  });
}

export async function respondAction(
  eventId: string,
  response: "accepted" | "declined",
): Promise<Result<{ changed: boolean }>> {
  return attempt(async () => {
    if (response !== "accepted" && response !== "declined") throw new Error("response must be accepted or declined");
    const r = await respondToEvent(ACCOUNT, idOf(eventId), response);
    return { changed: r.changed };
  });
}
