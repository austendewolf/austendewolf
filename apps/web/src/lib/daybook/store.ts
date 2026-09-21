import {
  createDb,
  daybookDays,
  daybookItems,
  type DaybookDay,
  type DaybookItem,
} from "@awd/db";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";

/**
 * The Daybook's reads and writes, shared by the page and the MCP tools.
 *
 * One module so the two surfaces cannot disagree about what closing an item
 * does to its day. Everything crosses the boundary in the artifact's own
 * snake_case shape, which is also what the morning run already speaks.
 *
 * The connection is `daybook_app`, not the site's `awd_app`: it is the only
 * role with rights in the daybook schema, and it has none anywhere else.
 */

declare global {
  var __daybookDb: ReturnType<typeof createDb> | undefined;
}

/** Lazy, so a build with no database configured still succeeds. */
function getDb() {
  if (global.__daybookDb) return global.__daybookDb;
  const url = process.env.DAYBOOK_DATABASE_URL;
  if (!url) throw new Error("DAYBOOK_DATABASE_URL is not set");
  global.__daybookDb = createDb(url);
  return global.__daybookDb;
}

export const TZ = "America/Los_Angeles";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Status = "open" | "closed" | "dropped";
export type Horizon = "today" | "later";

export interface Item {
  id: string;
  title: string;
  kind: string;
  status: Status;
  horizon: Horizon;
  priority: number | null;
  ranked_by_hand: string | null;
  person: string | null;
  link: string | null;
  source: string | null;
  first_seen: string;
  closed_on: string | null;
  updated_at: string;
}

export interface Day {
  date: string;
  focus: string[];
  added: string[];
  closed: string[];
  load: { meetings_h: number; double_h: number; items_today: number } | null;
  updated_at: string;
}

/** A write lost a race: someone changed the item after the caller read it. */
export class Conflict extends Error {
  constructor(readonly conflicts: Array<{ id: string; current_updated_at: string | null }>) {
    super(
      `conflict: ${conflicts
        .map((c) => (c.current_updated_at ? `${c.id} is now at ${c.current_updated_at}` : `${c.id} does not exist`))
        .join("; ")}. Read again and redo the write.`,
    );
    this.name = "Conflict";
  }
}

export function todayPT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function assertDate(value: unknown, field = "date"): string {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
  return value;
}

const toItem = (r: DaybookItem): Item => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  status: r.status as Status,
  horizon: r.horizon as Horizon,
  priority: r.priority,
  ranked_by_hand: r.rankedByHand,
  person: r.person,
  link: r.link,
  source: r.source,
  first_seen: r.firstSeen,
  closed_on: r.closedOn,
  updated_at: r.updatedAt,
});

const toDay = (r: DaybookDay): Day => ({
  date: r.date,
  focus: r.focus,
  added: r.added,
  closed: r.closed,
  load: r.load ?? null,
  updated_at: r.updatedAt,
});

const byPriority = [sql`${daybookItems.priority} asc nulls last`, asc(daybookItems.firstSeen)];

/* ---------- reads ---------- */

/** Open items, most urgent first. `closedSince` adds whatever was closed or dropped on or after it. */
export async function listItems(options: { closedSince?: string; all?: boolean } = {}): Promise<Item[]> {
  const db = getDb();
  const where = options.all
    ? undefined
    : options.closedSince
      ? or(eq(daybookItems.status, "open"), gte(daybookItems.closedOn, options.closedSince))
      : eq(daybookItems.status, "open");
  const rows = await db.select().from(daybookItems).where(where).orderBy(...byPriority);
  return rows.map(toItem);
}

export async function listDays(): Promise<Day[]> {
  const rows = await getDb().select().from(daybookDays).orderBy(asc(daybookDays.date));
  return rows.map(toDay);
}

/** One date, with every item it names or that closed on it. */
export async function getDay(date: string): Promise<{ day: Day | null; items: Item[] }> {
  const db = getDb();
  const [row] = await db.select().from(daybookDays).where(eq(daybookDays.date, date));
  const day = row ? toDay(row) : null;
  const ids = day ? Array.from(new Set([...day.focus, ...day.added, ...day.closed])) : [];
  const rows = await db
    .select()
    .from(daybookItems)
    .where(
      ids.length
        ? or(inArray(daybookItems.id, ids), eq(daybookItems.closedOn, date))
        : eq(daybookItems.closedOn, date),
    )
    .orderBy(...byPriority);
  return { day, items: rows.map(toItem) };
}

/* ---------- item writes ---------- */

const EDITABLE = [
  "title",
  "kind",
  "status",
  "horizon",
  "priority",
  "ranked_by_hand",
  "person",
  "link",
  "source",
  "first_seen",
  "closed_on",
] as const;
type Editable = (typeof EDITABLE)[number];
export type ItemInput = { id: string; updated_at?: string } & Partial<Pick<Item, Editable>>;

/** Validate caller input and translate it to column names. Unknown fields are ignored. */
function columnsOf(input: Partial<Pick<Item, Editable>>) {
  const out: Partial<typeof daybookItems.$inferInsert> = {};
  const nullableText = (v: unknown, f: string) => {
    if (v === null || v === "") return null;
    if (typeof v !== "string") throw new Error(`${f} must be a string or null`);
    return v;
  };
  const nullableDate = (v: unknown, f: string) => (v === null ? null : assertDate(v, f));
  for (const key of EDITABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case "title":
        if (typeof v !== "string" || !v.trim()) throw new Error("title must be a non-empty string");
        out.title = v;
        break;
      case "kind":
        if (typeof v !== "string" || !v) throw new Error("kind must be a non-empty string");
        out.kind = v;
        break;
      case "status":
        if (v !== "open" && v !== "closed" && v !== "dropped") throw new Error("status must be open, closed or dropped");
        out.status = v;
        break;
      case "horizon":
        if (v !== "today" && v !== "later") throw new Error("horizon must be today or later");
        out.horizon = v;
        break;
      case "priority":
        if (v !== null && !Number.isInteger(v)) throw new Error("priority must be an integer or null");
        out.priority = v as number | null;
        break;
      case "ranked_by_hand":
        out.rankedByHand = nullableDate(v, key);
        break;
      case "first_seen":
        out.firstSeen = assertDate(v, key);
        break;
      case "closed_on":
        out.closedOn = nullableDate(v, key);
        break;
      case "person":
      case "link":
      case "source":
        out[key] = nullableText(v, key);
        break;
    }
  }
  return out;
}

/**
 * Add or edit items, all or nothing.
 *
 * An edit to an item that exists must carry the `updated_at` it was read at,
 * and fails if the row has moved since. A new item carries no `updated_at`,
 * and needs a title. Omitted fields keep their current value on an edit and
 * take the schema default on a create, with `first_seen` defaulting to today.
 */
export async function upsertItems(inputs: ItemInput[]): Promise<Item[]> {
  if (!inputs.length) return [];
  const seen = new Set<string>();
  for (const input of inputs) {
    if (typeof input.id !== "string" || !input.id) throw new Error("every item needs an id");
    if (seen.has(input.id)) throw new Error(`item ${input.id} appears twice`);
    seen.add(input.id);
  }
  return getDb().transaction(async (tx) => {
    const ids = inputs.map((i) => i.id);
    const current = new Map(
      (await tx.select().from(daybookItems).where(inArray(daybookItems.id, ids)).for("update")).map((r) => [r.id, r]),
    );
    const conflicts = inputs.flatMap((input): Conflict["conflicts"] => {
      const row = current.get(input.id);
      if (row && input.updated_at !== row.updatedAt) return [{ id: input.id, current_updated_at: row.updatedAt }];
      if (!row && input.updated_at !== undefined) return [{ id: input.id, current_updated_at: null }];
      return [];
    });
    if (conflicts.length) throw new Conflict(conflicts);

    const out: Item[] = [];
    for (const input of inputs) {
      const cols = columnsOf(input);
      if (current.has(input.id)) {
        const [row] = await tx
          .update(daybookItems)
          .set({ ...cols, updatedAt: sql`now()` })
          .where(eq(daybookItems.id, input.id))
          .returning();
        out.push(toItem(row));
      } else {
        if (!cols.title) throw new Error(`new item ${input.id} needs a title`);
        const [row] = await tx
          .insert(daybookItems)
          .values({ ...cols, id: input.id, title: cols.title, firstSeen: cols.firstSeen ?? todayPT() })
          .returning();
        out.push(toItem(row));
      }
    }
    return out;
  });
}

/**
 * Unpinned field edits, for the page.
 *
 * The page writes one field at a time and last writer wins per field, which is
 * how the artifact behaved. Pinning belongs to callers that read a batch and
 * write it back later.
 */
export async function patchItems(patches: Record<string, Partial<Pick<Item, Editable>>>): Promise<Item[]> {
  const entries = Object.entries(patches);
  if (!entries.length) return [];
  return getDb().transaction(async (tx) => {
    const out: Item[] = [];
    for (const [id, patch] of entries) {
      const [row] = await tx
        .update(daybookItems)
        .set({ ...columnsOf(patch), updatedAt: sql`now()` })
        .where(eq(daybookItems.id, id))
        .returning();
      if (!row) throw new Error(`no item ${id}`);
      out.push(toItem(row));
    }
    return out;
  });
}

/* ---------- day writes ---------- */

type DayArray = "focus" | "added" | "closed";
const column = { focus: daybookDays.focus, added: daybookDays.added, closed: daybookDays.closed };

/** Append an id to one of a day's lists, once, creating the day if it has no row. */
function addTo(tx: Tx, date: string, list: DayArray, id: string) {
  const col = column[list];
  return tx
    .insert(daybookDays)
    .values({ date, [list]: [id] })
    .onConflictDoUpdate({
      target: daybookDays.date,
      set: {
        [list]: sql`case when ${id} = any(${col}) then ${col} else array_append(${col}, ${id}) end`,
        updatedAt: sql`now()`,
      },
    });
}

function removeFrom(tx: Tx, date: string, list: DayArray, id: string) {
  const col = column[list];
  return tx
    .update(daybookDays)
    .set({ [list]: sql`array_remove(${col}, ${id})`, updatedAt: sql`now()` })
    .where(eq(daybookDays.date, date));
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function dayRow(tx: Tx, date: string): Promise<Day | null> {
  const [row] = await tx.select().from(daybookDays).where(eq(daybookDays.date, date));
  return row ? toDay(row) : null;
}

/** Close or drop an item on a date, and record it in that day's `closed`. */
export async function closeItem(
  id: string,
  status: "closed" | "dropped",
  date: string,
  updatedAt?: string,
): Promise<{ item: Item; day: Day | null }> {
  return getDb().transaction(async (tx) => {
    const [cur] = await tx.select().from(daybookItems).where(eq(daybookItems.id, id)).for("update");
    if (!cur) throw new Error(`no item ${id}`);
    if (updatedAt !== undefined && updatedAt !== cur.updatedAt) {
      throw new Conflict([{ id, current_updated_at: cur.updatedAt }]);
    }
    const [row] = await tx
      .update(daybookItems)
      .set({ status, closedOn: date, updatedAt: sql`now()` })
      .where(eq(daybookItems.id, id))
      .returning();
    await addTo(tx, date, "closed", id);
    return { item: toItem(row), day: await dayRow(tx, date) };
  });
}

/** Undo a close: the item is open again and leaves that day's `closed`. */
export async function reopenItem(id: string, date: string): Promise<{ item: Item; day: Day | null }> {
  return getDb().transaction(async (tx) => {
    const [cur] = await tx.select().from(daybookItems).where(eq(daybookItems.id, id));
    if (!cur) throw new Error(`no item ${id}`);
    const [row] = await tx
      .update(daybookItems)
      .set({ status: "open", closedOn: null, updatedAt: sql`now()` })
      .where(eq(daybookItems.id, id))
      .returning();
    // The day it closed on, which is not always the day being viewed.
    for (const d of new Set([date, cur.closedOn].filter((x): x is string => Boolean(x)))) {
      await removeFrom(tx, d, "closed", id);
    }
    return { item: toItem(row), day: await dayRow(tx, date) };
  });
}

/** Move an item between today and later, keeping that day's `focus` in step. */
export async function moveItem(id: string, horizon: Horizon, date: string): Promise<{ item: Item; day: Day | null }> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(daybookItems)
      .set({ horizon, updatedAt: sql`now()` })
      .where(eq(daybookItems.id, id))
      .returning();
    if (!row) throw new Error(`no item ${id}`);
    if (horizon === "today") await addTo(tx, date, "focus", id);
    else await removeFrom(tx, date, "focus", id);
    return { item: toItem(row), day: await dayRow(tx, date) };
  });
}

/**
 * Write a day's lists. Each list given replaces the stored one; lists left out
 * keep their value, and a day with no row starts empty.
 */
export async function setDay(
  date: string,
  lists: Partial<Record<DayArray, string[]>> & { load?: Day["load"] },
): Promise<Day> {
  const set: Partial<typeof daybookDays.$inferInsert> = {};
  for (const key of ["focus", "added", "closed"] as const) {
    const v = lists[key];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`${key} must be an array of item ids`);
    set[key] = Array.from(new Set(v));
  }
  if (lists.load !== undefined) set.load = lists.load;
  const [row] = await getDb()
    .insert(daybookDays)
    .values({ date, ...set })
    .onConflictDoUpdate({ target: daybookDays.date, set: { ...set, updatedAt: sql`now()` } })
    .returning();
  return toDay(row);
}

/**
 * Start a day that has no saved list from the items already marked for today.
 * Does nothing when the day exists or there is nothing to put on it.
 */
export async function ensureDay(date: string): Promise<Day | null> {
  const db = getDb();
  const [existing] = await db.select().from(daybookDays).where(eq(daybookDays.date, date));
  if (existing) return toDay(existing);
  const open = await db
    .select({ id: daybookItems.id })
    .from(daybookItems)
    .where(and(eq(daybookItems.status, "open"), eq(daybookItems.horizon, "today")))
    .orderBy(...byPriority);
  const added = await db.select({ id: daybookItems.id }).from(daybookItems).where(eq(daybookItems.firstSeen, date));
  if (!open.length && !added.length) return null;
  const [row] = await db
    .insert(daybookDays)
    .values({ date, focus: open.map((r) => r.id), added: added.map((r) => r.id) })
    .onConflictDoNothing()
    .returning();
  return row ? toDay(row) : (await getDay(date)).day;
}

/** Every item and day, keyed the way the page holds them. */
export async function snapshot(): Promise<{ items: Record<string, Item>; days: Record<string, Day> }> {
  const [items, days] = await Promise.all([listItems({ all: true }), listDays()]);
  return {
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    days: Object.fromEntries(days.map((d) => [d.date, d])),
  };
}
