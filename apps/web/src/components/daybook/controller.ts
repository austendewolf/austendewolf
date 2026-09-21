import {
  calendarAction,
  closeItemAction,
  ensureDayAction,
  loadSnapshot,
  moveItemAction,
  reopenItemAction,
  reorderAction,
  respondAction,
  saveLoadAction,
  type CalendarEvent,
  type Result,
} from "@/app/daybook/actions";
import type { Day, Item } from "@/lib/daybook/store";

/**
 * The Daybook artifact's renderer, running against this site's store.
 *
 * Kept close to the artifact line for line, so its look and motion carry over
 * unchanged. What differs is the plumbing: `claude.use("db")` became the server
 * actions in `app/daybook/actions.ts`, the live snapshot became a refresh every
 * minute and on focus, and the Google Calendar connector became the gateway's
 * calendar functions called on the server.
 */

type Snapshot = { items: Record<string, Item>; days: Record<string, Day> };
type Entry = [string, Item];
type Ev = { id: string; t: string; s: number; e: number; rsvp: string; organizer: boolean; out: boolean; focus: boolean; emails: string[] };
type Held = { t: string; s: number; e: number };
type Bin = { h: number; on: Ev[]; n: number; out: boolean; hold: boolean; held: boolean; work: boolean };
type Block = { s: number; e: number };
type Shape = { S: number; E: number; now: number; open: Block[]; freeLeft: number; meetingH: number; meetingLeft: number; doubleH: number; heldLeft: number; stolen: number; held: Held[] };
type Mode = "today" | "later" | "closed" | "past";
type Drag = { id: string; row: HTMLElement; list: HTMLElement; rows: HTMLElement[]; rects: DOMRect[]; from: number; to: number; startY: number; pointerId: number };

const TZ = "America/Los_Angeles";
const OLD_DAYS = 7;
const REFRESH_MS = 60_000;
/** Three is the day's list. Closing three seals the day in the rail. */
const CAP = 3;
const FOLD_KEY = "daybook.folded";

/* ---------- dates, all Pacific ---------- */
const partsOf = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
const todayPT = () => { const p = partsOf(new Date()); return `${p.year}-${p.month}-${p.day}`; };
const nowHourPT = () => { const p = partsOf(new Date()); return +p.hour + +p.minute / 60; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const mmdd = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
const dayLabel = (d: string) => `${new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"))} ${mmdd(d)}`;
const weekday = (d: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
const fmt = (h: number) => { let hr = Math.floor(h + 1e-9), m = Math.round((h - hr) * 60); if (m === 60) { hr++; m = 0; } return (hr % 12 || 12) + ":" + String(m).padStart(2, "0") + (hr >= 12 && hr < 24 ? "pm" : "am"); };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* When a thing is actually needed. An item with no due date is a real category, not a bug. */
function dueOf(it: Item | undefined) { return isDate(it?.due) ? it.due : null; }
/* How near the due date is. The mark and the date wear this together, so urgency
   reads from the colour of two small things rather than from a rule down the side. */
function dueState(it: Item, on: string) {
  const d = dueOf(it);
  if (!d) return { cls: "is-none", word: "no date" };
  const n = daysBetween(on, d);
  return {
    cls: n <= 0 ? "is-over" : n <= 2 ? "is-near" : "",
    word: n < 0 ? (n === -1 ? "yesterday" : `${-n} days over`) : n === 0 ? "today" : n === 1 ? "tomorrow" : mmdd(d),
  };
}

/* The notation from his paper page, one icon family, drawn on one grid. A dot is
   open, a chevron moved to a later day, a cross no longer open, a bolt a reflection. */
const MARKS: Record<string, string> = {
  dot: `<circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/>`,
  next: `<path d="M9 6l6 6-6 6"/>`,
  shut: `<path d="M18 6 6 18M6 6l12 12"/>`,
  bolt: `<path d="M13 3v7h6l-8 11v-7H5z"/>`,
};
const markIcon = (name: string) =>
  `<svg class="mark-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARKS[name]}</svg>`;

function markFor(it: Item, mode: Mode, on: string) {
  if (it.kind === "note" || it.kind === "reflection") return "bolt";
  if (mode === "closed") return "shut";
  if (mode === "past") return it.status !== "open" && it.closed_on === on ? "shut" : "dot";
  return mode === "later" ? "next" : "dot";
}

/* ---------- calendar: hints and conflicts only ---------- */
function hourOn(iso: string, date: string) { const p = partsOf(new Date(iso)); const d = `${p.year}-${p.month}-${p.day}`; return d < date ? 0 : d > date ? 24 : +p.hour + +p.minute / 60; }
// A block he holds for himself is not time someone else took. Google types it focusTime;
// the word check catches the ones he made by hand, where he is the only person on it.
const FOCUS_WORDS = /\b(dnd|do not disturb|do not schedule|ask before scheduling|focus|heads ?down|deep work|hold|block)\b/i;
function looksLikeFocus(e: CalendarEvent, others: number) {
  if (e.eventType === "focusTime") return true;
  if (!e.organizer?.self || others > 0) return false;
  return FOCUS_WORDS.test(`${e.summary || ""} ${String(e.description || "").replace(/<[^>]*>/g, " ")}`);
}
function parseEvents(events: CalendarEvent[], date: string): Ev[] {
  return events.filter((e) => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime).map((e) => {
    const att = e.attendees || [];
    const self = att.find((a) => a.self);
    const others = att.filter((a) => !a.self && !a.resource).length;
    return { id: e.id, t: e.summary || "(no title)", s: hourOn(e.start!.dateTime!, date), e: hourOn(e.end!.dateTime!, date), rsvp: self ? self.responseStatus || "needsAction" : "accepted", organizer: !!e.organizer?.self, out: e.eventType === "outOfOffice", focus: looksLikeFocus(e, others), emails: att.map((a) => a.email || "") };
  }).filter((e) => e.e > e.s && e.rsvp !== "declined").sort((a, b) => a.s - b.s);
}

/** Banner copy for a calendar failure, by the code the server action returned. */
function calendarMessage(code: string | undefined) {
  switch (code) {
    case "reauth": return "Google Calendar needs reconnecting, so meeting times and overlaps are hidden. Reconnect it on the Connections page.";
    case "not_connected": return "Google Calendar isn't connected for the Daybook, so meeting times and overlaps are hidden. Connect it on the Connections page.";
    case "rate_limited": return "Google Calendar is rate limiting requests. It will retry in a minute.";
    default: return "Google Calendar didn't respond, so meeting times may be out of date.";
  }
}

class CalendarFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Server action results, with a dropped connection read as a failure rather than a throw. */
async function settle<T>(call: Promise<Result<T>>): Promise<Result<T>> {
  try { return await call; } catch { return { ok: false, code: "unavailable" }; }
}

export function mountDaybook(els: { root: HTMLElement; days: HTMLElement; main: HTMLElement }, initial: Snapshot | null): () => void {
  const { root } = els;
  const $ = <E extends Element = HTMLElement>(sel: string) => root.querySelector<E>(sel);
  const state = {
    ready: false, writable: false,
    items: {} as Record<string, Item>, days: {} as Record<string, Day>,
    selected: "",
    events: null as Ev[] | null,   // today's meetings from the calendar, used only for hints and conflicts
    outs: [] as Ev[],
    focus: [] as Held[],           // blocks he held for himself, drawn under the meetings that took them
    folded: { today: false, later: true },   // Later starts shut; the page is for today
    calLoading: true, calError: null as string | null,
    stage: null as { key: string; keepId: string } | null, busy: false, flash: null as { ok: boolean; text: string } | null,
    pendingPrio: {} as Record<string, number>,   // priorities written locally that the server hasn't confirmed yet
  };
  let drag: Drag | null = null, holdUntil = 0, holdTimer: ReturnType<typeof setTimeout> | undefined;
  try { const v = JSON.parse(localStorage.getItem(FOLD_KEY) || "null"); if (v) state.folded = { ...state.folded, ...v }; } catch {}
  const saveFold = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify(state.folded)); } catch {} };

  /* ---------- day shape ---------- */
  const WORK_S = 8, WORK_E = 18, STEP = 0.25, MIN_BLOCK = 0.5;
  const hm = (h: number) => { const m = Math.round(h * 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""}`; };
  let bins: Bin[] = [];

  /** `atHour` is the clock the shape is read at; a past day is read at 24 so nothing is "still to come". */
  function dayShape(atHour?: number): Shape {
    const meetings = state.events || [], outs = state.outs || [], held = state.focus || [];
    let S = WORK_S, E = WORK_E;
    [...meetings, ...outs, ...held].forEach((e) => { S = Math.min(S, Math.floor(e.s)); E = Math.max(E, Math.ceil(e.e)); });
    E = Math.min(E, 24);
    const now = atHour === undefined ? nowHourPT() : atHour;
    bins = [];
    for (let h = S; h < E - 1e-9; h += STEP) {
      const on = meetings.filter((e) => e.s < h + STEP - 1e-6 && e.e > h + 1e-6);
      const out = outs.some((o) => o.s < h + STEP - 1e-6 && o.e > h + 1e-6);
      const hold = held.some((f) => f.s < h + STEP - 1e-6 && f.e > h + 1e-6);
      bins.push({ h, on, n: on.length, out, hold, held: hold && !on.length, work: h >= WORK_S && h < WORK_E });
    }
    // Open blocks: runs of quarter hours with no meeting and no time out, inside work hours or
    // inside a block he held for himself, at least 30 minutes long.
    const blocks: Block[] = []; let run: Block | null = null;
    bins.forEach((b) => {
      const free = (b.work || b.hold) && !b.n && !b.out;
      if (free) { if (!run) run = { s: b.h, e: b.h + STEP }; else run.e = b.h + STEP; }
      else if (run) { blocks.push(run); run = null; }
    });
    if (run) blocks.push(run);
    const open = blocks.filter((b) => b.e - b.s >= MIN_BLOCK - 1e-6);
    const freeLeft = open.reduce((t, b) => t + Math.max(0, b.e - Math.max(b.s, now)), 0);
    const meetingH = bins.filter((b) => b.n && b.work).length * STEP;
    const meetingLeft = bins.filter((b) => b.n && b.h >= now).length * STEP;
    const doubleH = bins.filter((b) => b.n >= 2).length * STEP;
    const heldLeft = bins.filter((b) => b.hold && !b.n && !b.out && b.h >= now - STEP).length * STEP;
    const stolen = bins.filter((b) => b.hold && b.n).length * STEP;
    return { S, E, now, open, freeLeft, meetingH, meetingLeft, doubleH, heldLeft, stolen, held };
  }

  /** The chart is drawn at the width it will occupy, so meeting names get real room. */
  const chartWidth = () => Math.max(520, Math.min(1240, Math.round(els.main.clientWidth || 680)));

  function chartSvg(d: Shape) {
    const W = chartWidth(), L = 30, R = 8, T = 18, MX = 3;
    // Lanes: one per simultaneous meeting, so a stack of three needs three rows of height.
    const lanes = Math.max(1, Math.min(MX, bins.reduce((mx, b) => Math.max(mx, b.n), 1)));
    const ROW = 26, B = T + lanes * ROW + 14;
    const X = (h: number) => L + (h - d.S) / (d.E - d.S) * (W - L - R), Y = (lane: number) => B - 14 - lane * ROW;
    let s = "";
    for (let h = Math.ceil(d.S); h <= d.E + 1e-9; h++) s += `<line class="c-grid" x1="${X(h)}" y1="${T}" x2="${X(h)}" y2="${B}"/>`;
    // Time out sits behind everything, full height.
    (state.outs || []).forEach((o) => {
      const a = Math.max(o.s, d.S), b = Math.min(o.e, d.E);
      if (b <= a) return;
      s += `<rect class="c-out" x="${X(a)}" y="${T}" width="${X(b) - X(a)}" height="${B - T}"/>`;
      if (b - a >= 1) s += `<text x="${(X(a) + X(b)) / 2}" y="${T + 13}" text-anchor="middle">out</text>`;
    });
    // Blocks he held for himself, drawn under the meetings that were booked over them.
    (d.held || []).forEach((f, i) => {
      const a = Math.max(f.s, d.S), b = Math.min(f.e, d.E);
      if (b <= a) return;
      const w = X(b) - X(a);
      s += `<rect class="c-hold" x="${X(a)}" y="${T}" width="${w}" height="${B - T}"/>`;
      const chars = Math.floor(Math.max(w - 8, 0) / 5.6);
      if (chars >= 3) s += `<clipPath id="ht${i}"><rect x="${X(a) + 4}" y="${T}" width="${Math.max(w - 8, 0)}" height="${B - T}"/></clipPath><text class="c-ok" x="${X(a) + 4}" y="${B - 4}" clip-path="url(#ht${i})">${esc(f.t)}</text>`;
    });
    // Meetings as named blocks, stacked into lanes when they overlap.
    const taken: Array<{ lane: number; s: number; e: number }> = [];
    [...(state.events || [])].sort((a, b) => a.s - b.s).forEach((m, i) => {
      const a = Math.max(m.s, d.S), b = Math.min(m.e, d.E);
      if (b <= a) return;
      let lane = 0;
      while (taken.some((t) => t.lane === lane && t.s < b - 1e-6 && t.e > a + 1e-6)) lane++;
      taken.push({ lane, s: a, e: b });
      const w = X(b) - X(a), y = Y(lane + 1), h = Y(lane) - y;
      s += `<rect class="c-meet ${lane ? "is-clash" : ""}" x="${X(a)}" y="${y}" width="${w}" height="${h}"/>`;
      const chars = Math.floor(Math.max(w - 8, 0) / 5.6);
      if (chars >= 3) s += `<clipPath id="mt${i}"><rect x="${X(a) + 4}" y="${y}" width="${Math.max(w - 8, 0)}" height="${h}"/></clipPath><text class="c-ink" x="${X(a) + 4}" y="${y + h / 2 + 4}" clip-path="url(#mt${i})">${esc(m.t)}</text>`;
    });
    // Open blocks sit on the baseline as a green bar; the part already behind you goes grey.
    d.open.forEach((b) => {
      const past = Math.min(b.e, Math.max(b.s, d.now));
      if (past > b.s) s += `<rect class="c-free is-past" x="${X(b.s)}" y="${B - 5}" width="${X(past) - X(b.s)}" height="5" rx="1.5"/>`;
      if (b.e > past) {
        s += `<rect class="c-free" x="${X(past)}" y="${B - 5}" width="${X(b.e) - X(past)}" height="5" rx="1.5"/>`;
        if (X(b.e) - X(past) > 34) s += `<text class="c-ok" x="${(X(past) + X(b.e)) / 2}" y="${B - 10}" text-anchor="middle">${hm(b.e - past)}</text>`;
      }
    });
    if (d.now > d.S && d.now < d.E) s += `<rect class="c-past" x="${L}" y="${T}" width="${X(d.now) - L}" height="${B - T}"/><line class="c-now" x1="${X(d.now)}" y1="${T - 8}" x2="${X(d.now)}" y2="${B}"/><text class="c-ink" x="${X(d.now) + 4}" y="${T - 1}">now</text>`;
    s += `<line class="c-axis" x1="${L}" y1="${B}" x2="${W - R}" y2="${B}"/>`;
    const labelY = B + 17;
    for (let h = Math.ceil(d.S); h <= d.E; h++) s += `<text x="${X(h)}" y="${labelY}" text-anchor="middle">${(h % 12 || 12) + (h >= 12 && h < 24 ? "p" : "a")}</text>`;
    return `<svg class="load" id="load" width="${W}" height="${labelY + 5}" viewBox="0 0 ${W} ${labelY + 5}" role="img" aria-label="Today's meetings, the time held for focus, and what is still open">${s}</svg>`;
  }

  // Keep a small record of the day's load so earlier days can show it.
  let lastLoad = "";
  function saveLoad(d: Shape, focusCount: number) {
    if (!state.writable || !state.events) return;
    const today = todayPT();
    const trim = (e: { t: string; s: number; e: number }) => ({ t: e.t, s: e.s, e: e.e });
    const load = {
      meetings_h: d.meetingH, double_h: d.doubleH, items_today: focusCount,
      cal: { ev: (state.events || []).map(trim), out: (state.outs || []).map((o) => ({ s: o.s, e: o.e })), held: (state.focus || []).map(trim) },
    };
    const key = JSON.stringify(load);
    if (key === lastLoad) return;
    lastLoad = key;
    settle(saveLoadAction(today, load)).then((r) => { if (r.ok) state.days[today] = r.data; });
  }
  const overlaps = (a: Ev, b: Ev) => a.s < b.e - 1e-6 && b.s < a.e - 1e-6;
  function conflicts(evs: Ev[]) {
    const seen = new Set<string>(), out: Ev[][] = [];
    evs.forEach((ev) => {
      if (seen.has(ev.id)) return;
      const c = [ev], q = [ev]; seen.add(ev.id);
      while (q.length) { const a = q.pop()!; evs.forEach((b) => { if (!seen.has(b.id) && overlaps(a, b)) { seen.add(b.id); c.push(b); q.push(b); } }); }
      if (c.length > 1 && c.some((e) => e.e > nowHourPT())) out.push(c.sort((x, y) => x.s - y.s));
    });
    return out;
  }
  function meetingFor(item: Item) {
    if (!item.person || !state.events) return null;
    const now = nowHourPT();
    return state.events.find((e) => e.e > now && e.emails.includes(item.person!)) || null;
  }

  /* ---------- views ---------- */
  function renderRail() {
    const today = todayPT();
    // Oldest first, so the strip reads as a timeline running left into the past.
    const dates = Array.from(new Set([today, ...Object.keys(state.days)])).filter((d) => d <= today).sort();
    els.days.innerHTML = dates.map((d) => {
      const doc = state.days[d];
      const closed = (doc?.closed || []).length;
      // A day is sealed once three are closed, which is the whole point of the cap.
      const full = closed >= CAP;
      const seal = `<svg class="seal" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6"/>${full ? `<path d="M4.2 7.2 6.2 9.2 9.8 4.8"/>` : ""}</svg>`;
      return `<li><button class="day ${d === today ? "is-today" : ""} ${full ? "is-full" : ""} ${d === state.selected ? "is-on" : ""}" data-day="${d}" aria-current="${d === state.selected ? "date" : "false"}" title="${dayLabel(d)}, ${full ? "closed your three" : `${closed} closed`}">${seal}<span class="wd">${d === today ? "Today" : weekday(d)}</span><span class="dd">${mmdd(d)}</span></button></li>`;
    }).join("");
    parkDay();
  }

  /*
   * The strip slides so the selected day ends at the right edge of the window,
   * which keeps the day you are reading in one place while its history runs off
   * to the left. Today selected puts today on the right and every earlier day
   * beside it, which is the shape the page opens in.
   */
  function parkDay() {
    const sel = els.days.querySelector<HTMLElement>(".day.is-on")?.parentElement;
    const vp = els.days.parentElement;
    if (!sel || !vp) return;
    els.days.style.transform = `translateX(${Math.min(0, vp.clientWidth - sel.offsetLeft - sel.offsetWidth)}px)`;
  }

  function itemRow(id: string, it: Item, on: string, mode: Mode) {
    const old = it.status === "open" && daysBetween(it.first_seen, on) > OLD_DAYS;
    const mt = mode === "today" || mode === "later" ? meetingFor(it) : null;
    const meta = [
      it.source ? (it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.source)}</a>` : `<span>${esc(it.source)}</span>`) : (it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">Open</a>` : ""),
      mt ? `<span class="when">${fmt(mt.s)}, ${esc(mt.t)}</span>` : "",
    ].join("");
    let actions = "";
    const dis = state.writable ? "" : "disabled";
    if (mode === "today") actions = `<button class="pill is-sm" data-act="done" data-id="${esc(id)}" ${dis}>Done</button><button class="pill is-sm is-quiet" data-act="later" data-id="${esc(id)}" ${dis}>Later</button>`;
    else if (mode === "later") actions = `<button class="pill is-sm" data-act="today" data-id="${esc(id)}" ${dis}>Today</button><button class="pill is-sm is-quiet" data-act="drop" data-id="${esc(id)}" ${dis}>Drop</button>`;
    else if (mode === "closed") actions = `<span class="na">${it.status === "dropped" ? "dropped" : "done"}</span><button class="pill is-sm is-quiet" data-act="undo" data-id="${esc(id)}" ${dis}>Undo</button>`;
    else if (mode === "past") {
      const st = it.status !== "open" && it.closed_on === on ? `<span class="ok">${it.status === "dropped" ? "dropped" : "closed"}</span>`
        : it.status !== "open" && it.closed_on && it.closed_on < on ? `<span class="na">closed ${mmdd(it.closed_on)}</span>`
        : it.status !== "open" && it.closed_on ? `<span class="na">carried, closed ${mmdd(it.closed_on)}</span>`
        : `<span class="gap">carried</span>`;
      actions = st;
    }
    const done = mode === "closed" || (mode === "past" && it.status !== "open" && it.closed_on === on);
    const sortable = mode === "today" || mode === "later";
    const grip = sortable ? `<button class="grip" data-id="${esc(id)}" aria-label="Reorder ${esc(it.title)}. Arrow keys move it up or down." title="Drag to reorder" ${dis}><svg viewBox="0 0 8 14" aria-hidden="true"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg></button>` : "<span></span>";
    const due = mode === "closed" ? { cls: "is-none", word: it.closed_on ? mmdd(it.closed_on) : "" } : dueState(it, on);
    const who = it.person ? esc(it.person) : "";
    return `<div class="row ${due.cls} ${old ? "is-old" : ""} ${done ? "is-done" : ""}" ${sortable ? `data-id="${esc(id)}"` : ""}>${grip}<span class="mark">${markIcon(markFor(it, mode, on))}</span><span class="due">${due.word}</span><span class="who">${who}</span><div><div class="item-t">${esc(it.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ""}</div><div class="pills">${actions}</div></div>`;
  }

  function conflictRows() {
    if (!state.events) return "";
    return conflicts(state.events).map((c) => {
      const key = c.map((e) => e.id).join("|");
      const st = state.stage && state.stage.key === key ? state.stage : null;
      const keep = st ? c.find((e) => e.id === st.keepId) : null;
      const drops = keep ? c.filter((e) => e.id !== keep.id && overlaps(e, keep)) : [];
      const theirs = drops.filter((e) => !e.organizer), mine = drops.filter((e) => e.organizer);
      const pills = c.map((e) => `<button class="pill is-sm ${keep ? (e.id === keep.id ? "is-on" : drops.includes(e) ? "is-dropped" : "") : ""}" data-keep="${esc(e.id)}" data-key="${esc(key)}" ${state.busy ? "disabled" : ""} title="${fmt(e.s)} to ${fmt(e.e)}">${esc(e.t)}</button>`).join("");
      let confirm = "";
      if (keep) {
        const accept = !keep.organizer && keep.rsvp !== "accepted";
        const label = [accept ? `Accept ${esc(keep.t)}` : "", theirs.length ? `${accept ? "decline" : "Decline"} ${theirs.map((e) => esc(e.t)).join(" and ")}` : ""].filter(Boolean).join(", ");
        confirm = `<div class="pills left">${label ? `<button class="pill is-sm is-warn" id="confirm" ${state.busy ? "disabled" : ""}>${state.busy ? "Updating…" : label}</button>` : ""}<button class="pill is-sm is-quiet" id="unstage" ${state.busy ? "disabled" : ""}>Cancel</button></div>`;
        if (mine.length) confirm += `<div class="meta"><span class="gap">You organize ${mine.map((e) => esc(e.t)).join(", ")}. Move or cancel it in Google Calendar.</span></div>`;
      }
      return `<div class="row is-old is-near"><span></span><span class="mark">${markIcon("next")}</span><span class="due">${fmt(c[0].s)}</span><span class="who"></span><div><div class="item-t">Pick one: these meetings overlap</div><div class="pills left">${pills}</div>${confirm}</div><div class="pills"><span class="gap">${keep ? "" : "pick"}</span></div></div>`;
    }).join("");
  }

  function renderMain() {
    // Hold re-renders while a row is lifted or settling, so a refresh doesn't yank the list mid-animation.
    if (drag) return;
    const wait = holdUntil - performance.now();
    if (wait > 0) { clearTimeout(holdTimer); holdTimer = setTimeout(renderMain, wait); return; }
    const on = state.selected, today = todayPT(), isToday = on === today;
    const entries = Object.entries(state.items);
    const byAge = (a: Entry, b: Entry) => (a[1].first_seen || "").localeCompare(b[1].first_seen || "");
    // Lower priority number is more urgent; unranked items fall to the bottom, oldest first.
    const byPriority = (a: Entry, b: Entry) => (a[1].priority ?? Infinity) - (b[1].priority ?? Infinity) || byAge(a, b);
    // A date someone actually named beats a rank he set by hand; undated work sorts under it.
    const byDueThenPriority = (a: Entry, b: Entry) => {
      const da = dueOf(a[1]), db = dueOf(b[1]);
      if (da && db) return da.localeCompare(db) || byPriority(a, b);
      if (da) return -1;
      if (db) return 1;
      return byPriority(a, b);
    };
    const capRow = (last: string) => `<div class="row is-cap"><span></span><span></span><span>due</span><span>who</span><span>task</span><span>${last}</span></div>`;
    // The strip above already names the day, so the page opens straight on its counts.
    let h = "";

    if (!state.ready) {
      h += `<p class="sub">Loading your items…</p>`;
      els.main.innerHTML = h; return;
    }

    if (isToday) {
      const open = entries.filter(([, it]) => it.status === "open");
      const focus = open.filter(([, it]) => it.horizon === "today").sort(byPriority);
      const later = open.filter(([, it]) => it.horizon !== "today").sort(byDueThenPriority);
      const closed = entries.filter(([, it]) => it.status !== "open" && it.closed_on === today);
      const carried = focus.filter(([, it]) => it.first_seen < today).length;
      const oldest = open.length ? Math.max(...open.map(([, it]) => daysBetween(it.first_seen, today))) : 0;
      const nConf = state.events ? conflicts(state.events).length : 0;

      h += `<p class="sub">${focus.length + nConf} for today, ${carried} carried from earlier days · ${closed.length} closed · ${later.length} later${oldest > OLD_DAYS ? ` · <span class="gap">oldest open ${oldest} days</span>` : ""}</p>`;

      let shape: Shape | null = null;
      if (state.events) {
        shape = dayShape();
        const todo = focus.length + nConf;
        // Amber when what's left can't hold today's list at 30 minutes an item.
        const tight = todo > 0 && shape.freeLeft < todo * 0.5;
        h += `<div class="stats">`
          + `<div class="stat ${tight ? "is-gap" : ""}"><b>${todo}</b><span>to close today</span></div>`
          + `<div class="stat ${tight ? "is-gap" : ""}"><b>${shape.freeLeft ? hm(shape.freeLeft) : "0m"}</b><span>open time left</span></div>`
          + `<div class="stat"><b>${hm(shape.meetingLeft)}</b><span>of meetings to go</span></div>`
          + (shape.doubleH ? `<div class="stat is-gap"><b>${hm(shape.doubleH)}</b><span>double-booked</span></div>` : "")
          + (shape.heldLeft ? `<div class="stat"><b>${hm(shape.heldLeft)}</b><span>held for focus, still yours</span></div>` : "")
          + (shape.stolen ? `<div class="stat is-gap"><b>${hm(shape.stolen)}</b><span>booked over your block</span></div>` : "")
          + `</div>`;
        h += `<div class="chart-wrap">${chartSvg(shape)}</div>`;
      } else if (state.calLoading && !state.calError) {
        h += `<p class="readout">Loading today's meetings…</p>`;
      }

      if (state.flash) h += `<div class="banner ${state.flash.ok ? "ok" : ""}">${esc(state.flash.text)}</div>`;
      if (state.calError) h += `<div class="banner">${esc(state.calError)}</div>`;

      const shutT = state.folded.today, over = focus.length > CAP;
      h += `<div class="sect is-head ${shutT ? "is-shut" : ""}" data-fold="today">Today <span class="n">${focus.length + nConf}</span>${over ? `<span class="n gap">over three</span>` : ""}${closed.length ? `<span class="n ok">${closed.length} done</span>` : ""}</div>`;
      if (shutT) {
        h += `<div class="folded"><b>${focus.length + nConf}</b> open${closed.length ? `, <b>${closed.length}</b> closed` : ""}${over ? `<span class="is-gap">over three</span>` : ""}</div>`;
      } else {
        h += `<div class="rows" data-list="today">`;
        h += conflictRows();
        h += focus.length ? focus.map(([id, it]) => itemRow(id, it, today, "today")).join("") : (nConf ? "" : `<div class="empty">Nothing picked for today. Pull something up from later.</div>`);
        // Closed work stays in today's list rather than moving to a section of its own.
        h += closed.map(([id, it]) => itemRow(id, it, today, "closed")).join("");
        h += `</div>`;
      }

      const dueSoon = later.filter(([, it]) => dueOf(it));
      const overdue = dueSoon.filter(([, it]) => daysBetween(today, dueOf(it)!) < 0).length;
      const shutL = state.folded.later;
      h += `<div class="sect is-head ${shutL ? "is-shut" : ""}" data-fold="later">Later <span class="n">${later.length}</span>${dueSoon.length ? `<span class="n ${overdue ? "gap" : ""}">${dueSoon.length} dated</span>` : ""}</div>`;
      if (shutL) {
        h += `<div class="folded"><b>${later.length}</b> waiting${overdue ? `<span class="is-gap"><b>${overdue}</b> overdue</span>` : ""}</div>`;
      } else {
        h += `<p class="note">Still open, not for today, soonest due first. Drag the handle to reorder. The morning run carries everything here forward, keeps your order, and closes what you finish in Google Tasks.</p><div class="rows" data-list="later">`;
        h += later.length ? later.map(([id, it]) => itemRow(id, it, today, "later")).join("") : `<div class="empty">Nothing waiting.</div>`;
        h += `</div>`;
      }
      els.main.innerHTML = h;
      if (shape) saveLoad(shape, focus.length + nConf);
      return;
    } else {
      const doc = state.days[on];
      const focusIds = (doc?.focus || []).filter((id) => state.items[id]);
      const addedIds = (doc?.added || []).filter((id) => state.items[id]);
      const closedIds = Array.from(new Set([...(doc?.closed || []), ...entries.filter(([, it]) => it.closed_on === on).map(([id]) => id)])).filter((id) => state.items[id]);
      const carriedOut = focusIds.filter((id) => !closedIds.includes(id)).length;
      const ld = doc?.load;
      h += `<p class="sub">${focusIds.length} on the list · ${closedIds.length} closed · ${carriedOut} carried to the next day${ld ? ` · ${hm(ld.meetings_h)} in meetings${ld.double_h ? ` · <span class="gap">${hm(ld.double_h)} double-booked</span>` : ""}` : ""}</p>`;
      // Redraw the shape that day actually had, from what the page saved then.
      if (ld?.cal?.ev) {
        const keep = { events: state.events, outs: state.outs, focus: state.focus };
        state.events = ld.cal.ev.map((e, i) => ({ ...e, id: `p${i}`, rsvp: "accepted", organizer: false, out: false, focus: false, emails: [] }));
        state.outs = (ld.cal.out || []).map((o, i) => ({ id: `po${i}`, t: "out", s: o.s, e: o.e, rsvp: "accepted", organizer: false, out: true, focus: false, emails: [] }));
        state.focus = ld.cal.held || [];
        try { h += `<div class="chart-wrap">${chartSvg(dayShape(24))}</div>`; } catch {}
        state.events = keep.events; state.outs = keep.outs; state.focus = keep.focus;
      }
      // One list, so a thing that closed that day without being picked still shows where it sat.
      const allIds = Array.from(new Set([...focusIds, ...closedIds]));
      h += `<div class="sect">On the list <span class="n">${allIds.length}</span></div><div class="rows">`;
      h += allIds.length ? capRow("outcome") + allIds.map((id) => itemRow(id, state.items[id], on, "past")).join("") : `<div class="empty">No list was saved for this day.</div>`;
      h += `</div>`;
      if (addedIds.length) h += `<div class="sect">New that day <span class="n">${addedIds.length}</span></div><div class="rows">${addedIds.map((id) => itemRow(id, state.items[id], on, "past")).join("")}</div>`;
    }
    els.main.innerHTML = h;
  }
  const render = () => { renderRail(); renderMain(); };

  /* ---------- writes ---------- */
  // A priority written locally wins over the server's copy until the server agrees with it.
  function mergeItem(item: Item) {
    const pending = state.pendingPrio[item.id];
    if (pending !== undefined) {
      if (item.priority === pending) delete state.pendingPrio[item.id];
      else item = { ...item, priority: pending };
    }
    state.items[item.id] = item;
  }

  async function act(kind: string, id: string) {
    const today = todayPT(), prev = state.items[id];
    if (!prev) return;
    state.flash = null;
    let call: Promise<Result<{ item: Item; day: Day | null }>>;
    if (kind === "done" || kind === "drop") {
      state.items[id] = { ...prev, status: kind === "done" ? "closed" : "dropped", closed_on: today };
      call = closeItemAction(id, kind === "done" ? "closed" : "dropped", today);
    } else if (kind === "undo") {
      state.items[id] = { ...prev, status: "open", closed_on: null };
      call = reopenItemAction(id, today);
    } else if (kind === "today" || kind === "later") {
      state.items[id] = { ...prev, horizon: kind };
      call = moveItemAction(id, kind, today);
    } else return;
    renderMain();
    const r = await settle(call);
    if (r.ok) { mergeItem(r.data.item); if (r.data.day) state.days[r.data.day.date] = r.data.day; render(); }
    else { state.items[id] = prev; state.flash = { ok: false, text: "That change didn't save. Check your connection and try again." }; renderMain(); }
  }

  // A new day with no saved list starts from the items already marked for today.
  async function ensureToday() {
    const today = todayPT();
    if (!state.writable || state.days[today]) return;
    const r = await settle(ensureDayAction(today));
    if (r.ok && r.data) { state.days[r.data.date] = r.data; renderRail(); }
  }

  async function refresh() {
    if (!state.writable) return;
    const r = await settle(loadSnapshot());
    if (!r.ok) return;
    state.items = {};
    Object.values(r.data.items).forEach(mergeItem);
    state.days = r.data.days;
    render();
  }

  async function loadCalendar() {
    const date = todayPT();
    const r = await settle(calendarAction(date));
    if (r.ok) {
      const all = parseEvents(r.data.events, date);
      state.events = all.filter((e) => !e.out && !e.focus);
      state.outs = all.filter((e) => e.out);
      state.focus = all.filter((e) => e.focus && !e.out).map((e) => ({ t: e.t, s: e.s, e: e.e }));
      state.calError = null;
    }
    else if (r.code === "reauth" || r.code === "not_connected") { state.events = null; state.calError = calendarMessage(r.code); }
    else state.calError = state.events ? null : calendarMessage(r.code);
    state.calLoading = false;
    if (state.selected === todayPT()) renderMain();
  }

  async function respond(eventId: string, response: "accepted" | "declined") {
    const r = await settle(respondAction(eventId, response));
    if (!r.ok) throw new CalendarFailure(r.code);
  }

  async function confirmDeclines() {
    const c = conflicts(state.events || []).find((cl) => cl.map((e) => e.id).join("|") === state.stage?.key);
    const keep = c?.find((e) => e.id === state.stage?.keepId);
    if (!c || !keep) return;
    const drops = c.filter((e) => e.id !== keep.id && overlaps(e, keep) && !e.organizer);
    const accept = !keep.organizer && keep.rsvp !== "accepted";
    state.busy = true; renderMain();
    const done: Ev[] = [];
    let accepted = false;
    try {
      if (accept) { await respond(keep.id, "accepted"); keep.rsvp = "accepted"; accepted = true; }
      for (const e of drops) { await respond(e.id, "declined"); done.push(e); }
      state.flash = { ok: true, text: [accepted ? `Accepted ${keep.t}.` : `Kept ${keep.t}.`, done.length ? `Declined ${done.map((e) => e.t).join(" and ")}.` : ""].filter(Boolean).join(" ") };
    } catch (err) {
      const soFar = [accepted ? `Accepted ${keep.t}` : "", done.length ? `declined ${done.map((e) => e.t).join(", ")}` : ""].filter(Boolean).join(" and ");
      const code = err instanceof CalendarFailure ? err.code : undefined;
      state.flash = { ok: false, text: (soFar ? `${soFar}, then stopped. ` : "Nothing changed. ") + (code === "refused" ? "Google Calendar refused the change. Try it in Google Calendar directly." : calendarMessage(code)) };
    }
    state.busy = false; state.stage = null;
    if (done.length) state.events = (state.events || []).filter((e) => !done.some((d) => d.id === e.id));
    renderMain();
    if (done.length || accepted) loadCalendar();
  }

  const onClick = (ev: MouseEvent) => {
    const target = ev.target as Element;
    const day = target.closest<HTMLElement>("[data-day]");
    if (day) { state.selected = day.dataset.day!; state.stage = null; state.flash = null; try { history.replaceState(history.state, "", "#" + state.selected); } catch {} render(); return; }
    const fold = target.closest<HTMLElement>("[data-fold]");
    if (fold) { const k = fold.dataset.fold as "today" | "later"; state.folded[k] = !state.folded[k]; saveFold(); renderMain(); return; }
    const a = target.closest<HTMLButtonElement>("[data-act]");
    if (a && !a.disabled) { act(a.dataset.act!, a.dataset.id!); return; }
    const k = target.closest<HTMLButtonElement>("[data-keep]");
    if (k && !k.disabled) { const same = state.stage?.key === k.dataset.key && state.stage?.keepId === k.dataset.keep; state.stage = same ? null : { key: k.dataset.key!, keepId: k.dataset.keep! }; renderMain(); return; }
    if (target.closest("#unstage")) { state.stage = null; renderMain(); return; }
    if (target.closest("#confirm")) confirmDeclines();
  };

  /* ---------- reorder ---------- */
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LIFT = " scale(1.015)";
  function rowRects() {
    const m = new Map<string, { top: number; lifted: boolean }>();
    root.querySelectorAll<HTMLElement>(".row[data-id]").forEach((el) => m.set(el.dataset.id!, { top: el.getBoundingClientRect().top, lifted: el.classList.contains("is-lifted") }));
    return m;
  }
  // Animate freshly rendered rows from where they were drawn before the render to where they are now.
  function flip(before: Map<string, { top: number; lifted: boolean }>, movedId: string) {
    if (reduceMotion()) return;
    const moving: Array<[HTMLElement, boolean]> = [];
    root.querySelectorAll<HTMLElement>(".row[data-id]").forEach((el) => {
      const b = before.get(el.dataset.id!);
      if (!b) return;
      const dy = b.top - el.getBoundingClientRect().top, moved = el.dataset.id === movedId;
      if (Math.abs(dy) < 0.5 && !moved) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)${moved && b.lifted ? LIFT : ""}`;
      if (moved) el.classList.add("is-settling", ...(b.lifted ? ["is-lifted"] : []));
      moving.push([el, moved]);
    });
    if (!moving.length) return;
    void document.body.offsetHeight;
    requestAnimationFrame(() => moving.forEach(([el, moved]) => {
      el.style.transition = moved ? "transform 320ms cubic-bezier(.3, 1.35, .5, 1), box-shadow 320ms ease" : "transform 240ms cubic-bezier(.2, .8, .2, 1)";
      el.style.transform = "";
      if (moved) { el.classList.remove("is-lifted"); el.classList.add("just-moved"); }
      el.addEventListener("transitionend", function done(e) {
        if (e.propertyName !== "transform") return;
        el.style.transition = ""; el.classList.remove("is-settling"); el.removeEventListener("transitionend", done);
      });
    }));
  }
  // Give the moved item a number between its new neighbours; renumber the list in steps of 10 only when there's no room.
  function priorities(ids: string[], movedId: string) {
    const it = (id: string): Partial<Item> => state.items[id] || {};
    const i = ids.indexOf(movedId);
    const prev = i > 0 ? it(ids[i - 1]) : null, next = i < ids.length - 1 ? it(ids[i + 1]) : null;
    const p = prev?.priority, n = next?.priority;
    let v: number | null = null;
    if (prev && p == null) v = null;
    else if (p != null && n != null) v = n - p >= 2 ? Math.floor((p + n) / 2) : null;
    else if (p != null) v = p + 10;
    else if (n != null) v = n - 10;
    else v = 10;
    if (v != null) return { [movedId]: v };
    const defined = ids.map((id) => it(id).priority).filter((x): x is number => x != null);
    const start = defined.length ? Math.min(...defined) : 10, out: Record<string, number> = {};
    ids.forEach((id, k) => { if (it(id).priority !== start + k * 10) out[id] = start + k * 10; });
    return out;
  }
  async function reorder(ids: string[], movedId: string, before: Map<string, { top: number; lifted: boolean }>, refocus: boolean) {
    const updates = priorities(ids, movedId), prev: Record<string, number | null> = {};
    for (const [id, v] of Object.entries(updates)) { prev[id] = state.items[id].priority; state.pendingPrio[id] = v; state.items[id] = { ...state.items[id], priority: v }; }
    state.flash = null;
    holdUntil = 0; renderMain(); flip(before, movedId);
    holdUntil = performance.now() + 360;
    if (refocus) $(`.grip[data-id="${CSS.escape(movedId)}"]`)?.focus({ preventScroll: true });
    const r = await settle(reorderAction(updates, movedId, todayPT()));
    if (r.ok) { r.data.forEach(mergeItem); return; }
    for (const [id, v] of Object.entries(prev)) { delete state.pendingPrio[id]; if (state.items[id]) state.items[id] = { ...state.items[id], priority: v }; }
    state.flash = { ok: false, text: "The new order didn't save. Check your connection and drag it again." };
    renderMain();
  }

  const onPointerDown = (ev: PointerEvent) => {
    const g = (ev.target as Element).closest<HTMLButtonElement>(".grip");
    if (!g || g.disabled || ev.button !== 0 || drag) return;
    const row = g.closest<HTMLElement>(".row")!, list = row.parentElement!;
    const rows = [...list.querySelectorAll<HTMLElement>(":scope > .row[data-id]")];
    ev.preventDefault();
    g.focus({ preventScroll: true });
    drag = { id: row.dataset.id!, row, list, rows, rects: rows.map((r) => r.getBoundingClientRect()), from: rows.indexOf(row), to: rows.indexOf(row), startY: ev.clientY, pointerId: ev.pointerId };
    try { g.setPointerCapture(ev.pointerId); } catch {}
    row.classList.add("is-lifted"); list.classList.add("is-sorting"); root.classList.add("is-dragging");
    if (!reduceMotion()) row.style.transform = "translateY(0px)" + LIFT;
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const { rows, rects, from } = drag, r0 = rects[from];
    const dy = Math.max(rects[0].top - r0.top, Math.min(rects[rects.length - 1].bottom - r0.bottom, ev.clientY - drag.startY));
    const center = r0.top + r0.height / 2 + dy;
    let to = from;
    rows.forEach((el, i) => {
      if (i === from) return;
      const mid = rects[i].top + rects[i].height / 2;
      let shift = 0;
      if (i < from && center < mid) { shift = r0.height; to--; }
      else if (i > from && center > mid) { shift = -r0.height; to++; }
      el.style.transform = shift ? `translateY(${shift}px)` : "";
    });
    drag.to = to;
    drag.row.style.transform = `translateY(${dy}px)` + (reduceMotion() ? "" : LIFT);
  };
  const endDrag = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const d = drag, ids = d.rows.map((r) => r.dataset.id!), before = rowRects();
    drag = null;
    root.classList.remove("is-dragging"); d.list.classList.remove("is-sorting");
    if (ev.type === "pointercancel" || d.to === d.from) { holdUntil = 0; renderMain(); flip(before, d.id); holdUntil = performance.now() + 360; return; }
    ids.splice(d.from, 1); ids.splice(d.to, 0, d.id);
    reorder(ids, d.id, before, true);
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    const g = (ev.target as Element).closest?.<HTMLButtonElement>(".grip");
    if (!g || g.disabled || drag || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
    ev.preventDefault();
    const row = g.closest<HTMLElement>(".row")!, ids = [...row.parentElement!.querySelectorAll<HTMLElement>(":scope > .row[data-id]")].map((r) => r.dataset.id!);
    const from = ids.indexOf(row.dataset.id!), to = from + (ev.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= ids.length) return;
    const before = rowRects();
    ids.splice(from, 1); ids.splice(to, 0, row.dataset.id!);
    reorder(ids, row.dataset.id!, before, true);
  };

  /* ---------- boot ---------- */
  const hash = (location.hash || "").slice(1);
  state.selected = /^\d{4}-\d{2}-\d{2}$/.test(hash) ? hash : todayPT();
  if (initial) {
    state.items = initial.items; state.days = initial.days; state.writable = true;
  } else {
    state.flash = { ok: false, text: "Your items didn't load. Reload the page to try again." };
  }
  state.ready = true;
  render();
  ensureToday();
  loadCalendar();

  root.addEventListener("click", onClick);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  const onFocus = () => { refresh(); loadCalendar(); };
  window.addEventListener("focus", onFocus);
  // The chart is sized in pixels, so a width change has to redraw it.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastWidth = chartWidth();
  const onResize = () => {
    clearTimeout(resizeTimer);
    // The strip parks against the window's right edge, so a narrower window moves it.
    parkDay();
    resizeTimer = setTimeout(() => { if (chartWidth() !== lastWidth) { lastWidth = chartWidth(); renderMain(); } }, 150);
  };
  window.addEventListener("resize", onResize);
  const timer = setInterval(() => { refresh(); loadCalendar(); }, REFRESH_MS);

  return () => {
    clearInterval(timer);
    clearTimeout(holdTimer);
    root.removeEventListener("click", onClick);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("resize", onResize);
    clearTimeout(resizeTimer);
    root.classList.remove("is-dragging");
  };
}
