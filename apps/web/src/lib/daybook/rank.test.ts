/**
 * The rank rules, pinned. Run with `pnpm --filter web test`.
 *
 * Each case is a failure the old hand-numbered order produced on 10/01: an
 * undated note above a deadline that passed, a reply someone was waiting on
 * under a project with a lower number, a month-old idea sitting mid-list.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BAND, compare, place, ranked, type Rankable } from "./rank";

const TODAY = "2026-10-01"; // a Thursday

function item(over: Partial<Rankable> & { id: string }): Rankable {
  return {
    due: null,
    pressure: null,
    size: null,
    priority: null,
    first_seen: TODAY,
    updated_at: `${TODAY} 16:00:00+00`,
    person: null,
    ...over,
  };
}

test("a passed date beats everything, and says how long ago", () => {
  assert.deepEqual(place(item({ id: "a", due: "2026-09-25" }), TODAY), { band: BAND.overdue, reason: "due 6 days ago" });
  assert.equal(place(item({ id: "b", due: "2026-09-30" }), TODAY).reason, "due yesterday");
});

test("due today outranks someone waiting, and a meeting says so", () => {
  assert.equal(place(item({ id: "a", due: TODAY }), TODAY).band, BAND.today);
  assert.equal(place(item({ id: "a", due: TODAY, pressure: "meeting" }), TODAY).reason, "meeting today");
});

test("someone waiting names them, ahead of a date later this week", () => {
  const p = place(item({ id: "a", pressure: "waiting", person: "patrick.smith@hover.to", due: "2026-10-05" }), TODAY);
  assert.deepEqual(p, { band: BAND.waiting, reason: "Patrick is waiting" });
});

test("this week names the day", () => {
  assert.deepEqual(place(item({ id: "a", due: "2026-10-02" }), TODAY), { band: BAND.week, reason: "due tomorrow" });
  assert.deepEqual(place(item({ id: "a", due: "2026-10-05", pressure: "meeting" }), TODAY), { band: BAND.week, reason: "meeting Monday" });
  assert.equal(place(item({ id: "a", due: "2026-10-09" }), TODAY).band, BAND.rest);
});

test("quick items sit above the rest and carry their age", () => {
  assert.deepEqual(place(item({ id: "a", size: "quick", first_seen: "2026-09-26" }), TODAY), { band: BAND.quick, reason: "quick, 5 days old" });
});

test("an undated item untouched for a month goes stale; a touched or dated one does not", () => {
  const old = { first_seen: "2026-08-01", updated_at: "2026-08-15 18:00:00+00" };
  assert.equal(place(item({ id: "a", ...old }), TODAY).band, BAND.stale);
  assert.equal(place(item({ id: "b", ...old, updated_at: "2026-09-20 18:00:00+00" }), TODAY).band, BAND.rest);
  assert.equal(place(item({ id: "c", ...old, due: "2026-11-01" }), TODAY).band, BAND.rest);
});

test("hand order cannot lift an undated item over a passed deadline", () => {
  const note = item({ id: "note", priority: 10 });
  const late = item({ id: "late", priority: 900, due: "2026-09-29" });
  assert.ok(compare(late, note, TODAY) < 0);
});

test("inside a dated band the soonest date leads; elsewhere hand order leads", () => {
  const a = item({ id: "a", due: "2026-09-20", priority: 50 });
  const b = item({ id: "b", due: "2026-09-28", priority: 10 });
  assert.deepEqual(ranked([b, a], TODAY).map((i) => i.id), ["a", "b"]);

  const c = item({ id: "c", size: "quick", priority: 30 });
  const d = item({ id: "d", size: "quick", priority: 20 });
  assert.deepEqual(ranked([c, d], TODAY).map((i) => i.id), ["d", "c"]);
});

test("ranked returns the whole list in band order with reasons attached", () => {
  const out = ranked(
    [
      item({ id: "rest" }),
      item({ id: "quick", size: "quick" }),
      item({ id: "wait", pressure: "waiting" }),
      item({ id: "over", due: "2026-09-30" }),
      item({ id: "today", due: TODAY }),
      item({ id: "week", due: "2026-10-03" }),
    ],
    TODAY,
  );
  assert.deepEqual(out.map((i) => i.id), ["over", "today", "wait", "week", "quick", "rest"]);
  assert.equal(out[0].reason, "due yesterday");
});
