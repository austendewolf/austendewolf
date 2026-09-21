#!/usr/bin/env node
/**
 * Copy an export of the Daybook artifact's database into the daybook schema.
 *
 * The export is one JSON file per document, as the artifact's `read_db` writes
 * them with `out_dir`: `<dir>/items/<id>.json` and `<dir>/days/<date>.json`.
 * The item id is the file name, because the document body does not carry it.
 *
 * The directory is an argument and never a path in this repository: the export
 * is the list itself, and this repository is public.
 *
 *   DAYBOOK_DATABASE_URL=... node packages/db/seed-daybook.mjs /path/to/export
 *
 * Upserts, so a rerun refreshes rows rather than duplicating them. Everything
 * lands in one transaction or nothing does.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import postgres from "postgres";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: seed-daybook.mjs <export-dir>");
  process.exit(1);
}
const url = process.env.DAYBOOK_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DAYBOOK_DATABASE_URL is not set");
  process.exit(1);
}

function documents(sub) {
  const path = join(dir, sub);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(readFileSync(join(path, f), "utf8"));
      // Tolerate either the bare document or one wrapped with its metadata.
      const data = raw && typeof raw.data === "object" && raw.data !== null ? raw.data : raw;
      return { id: basename(f, ".json"), data };
    });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v) => (typeof v === "string" && DATE.test(v) ? v : null);
const textOrNull = (v) => (typeof v === "string" && v.length ? v : null);
const intOrNull = (v) => (Number.isInteger(v) ? v : null);
const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

const items = documents("items");
const days = documents("days");
const sql = postgres(url, { prepare: false, max: 1 });

try {
  await sql.begin(async (tx) => {
    for (const { id, data: d } of items) {
      if (!d.title || !dateOrNull(d.first_seen)) {
        throw new Error(`item ${id} has no title or first_seen`);
      }
      const row = {
        id,
        title: String(d.title),
        kind: textOrNull(d.kind) ?? "task",
        status: ["open", "closed", "dropped"].includes(d.status) ? d.status : "open",
        horizon: d.horizon === "today" ? "today" : "later",
        priority: intOrNull(d.priority),
        ranked_by_hand: dateOrNull(d.ranked_by_hand),
        person: textOrNull(d.person),
        link: textOrNull(d.link),
        source: textOrNull(d.source),
        first_seen: d.first_seen,
        closed_on: dateOrNull(d.closed_on),
      };
      await tx`
        INSERT INTO daybook.items ${tx(row)}
        ON CONFLICT (id) DO UPDATE SET
          title = excluded.title, kind = excluded.kind, status = excluded.status,
          horizon = excluded.horizon, priority = excluded.priority,
          ranked_by_hand = excluded.ranked_by_hand, person = excluded.person,
          link = excluded.link, source = excluded.source,
          first_seen = excluded.first_seen, closed_on = excluded.closed_on,
          updated_at = now()`;
    }

    for (const { id, data: d } of days) {
      const date = dateOrNull(d.date) ?? dateOrNull(id);
      if (!date) throw new Error(`day ${id} has no date`);
      const load = d.load && typeof d.load === "object" ? d.load : null;
      await tx`
        INSERT INTO daybook.days (date, focus, added, closed, load)
        VALUES (${date}, ${ids(d.focus)}, ${ids(d.added)}, ${ids(d.closed)}, ${load ? tx.json(load) : null})
        ON CONFLICT (date) DO UPDATE SET
          focus = excluded.focus, added = excluded.added, closed = excluded.closed,
          load = excluded.load, updated_at = now()`;
    }
  });

  const [{ n_items, n_days }] = await sql`
    SELECT (SELECT count(*)::int FROM daybook.items) AS n_items,
           (SELECT count(*)::int FROM daybook.days) AS n_days`;
  console.log(`read ${items.length} items and ${days.length} days`);
  console.log(`daybook.items: ${n_items} rows, daybook.days: ${n_days} rows`);
} finally {
  await sql.end();
}
