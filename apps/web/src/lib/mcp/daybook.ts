import {
  assertDate,
  attachTrigger,
  closeItem,
  findTrigger,
  getDay,
  listItems,
  moveItem,
  setDay,
  todayPT,
  triggersFor,
  upsertItems,
  type ItemInput,
  type TriggerInput,
} from "@/lib/daybook/store";
import type { ToolDefinition } from "./google";
import { DAYBOOK_VIEW_URI } from "./views/daybook";

/**
 * The Daybook over MCP.
 *
 * The same store the /daybook page writes, so a session that adds an item here
 * sees it on the page on the next refresh, and the morning run needs no second
 * copy to reconcile. Dates are Pacific calendar dates, `YYYY-MM-DD`.
 */

const WRITES_ALLOWED = (process.env.MCP_ALLOW_WRITES ?? "1") !== "0";

function requireWrites(tool: string): void {
  if (!WRITES_ALLOWED) {
    throw new Error(`'${tool}' writes, and this server is running read-only.`);
  }
}

const date = { type: "string", description: "YYYY-MM-DD, Pacific" };
const ids = { type: "array", items: { type: "string" } };

/**
 * What the day list draws. Notes and recorded decisions never become tasks, so
 * they stay on the page and the list only counts them. A decision with a
 * priority is still something to decide, and it stays.
 */
async function dayList(showLater: boolean) {
  const open = await listItems();
  const actions = open.filter((i) => i.kind !== "note" && !(i.kind === "decision" && i.priority === null));
  const today = actions.filter((i) => i.horizon === "today");
  return {
    today: todayPT(),
    writable: WRITES_ALLOWED,
    later_shown: showLater,
    later_count: actions.length - today.length,
    notes_count: open.length - actions.length,
    items: showLater ? actions : today,
  };
}

/** JSON that can sit inside a script element: nothing in it closes the tag or ends a line. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/[<\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/**
 * The day list as a page for visualize's show_widget, which is how Claude Code
 * draws it: that host cannot draw this server's MCP Apps view. The module loads
 * from jsDelivr at the commit this server was deployed from, so the widget and
 * the view's inline copy are always the same file.
 */
async function widgetPage(showLater: boolean) {
  const data = await dayList(showLater);
  // Already in rank order. The widget keeps that order and prints `reason` where it used to print a number.
  const items = data.items.map(({ id, title, horizon, priority, due, person, link, source, band, reason, prep }) => ({
    id,
    title,
    horizon,
    priority,
    due,
    person,
    link,
    source,
    band,
    reason,
    prep: prep ? prep.shape : null,
  }));
  const mount = `daybook-${Math.random().toString(36).slice(2, 8)}`;
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ?? "main";
  const src = `https://cdn.jsdelivr.net/gh/austendewolf/austendewolf@${commit}/plugins/daybook/ui/daybook.js`;
  const onToday = items.filter((i) => i.horizon === "today").length;
  const job = `(window.DAYBOOK=window.DAYBOOK||[]).push(["list","${mount}",${scriptJson({ ...data, items })},{"mode":"message"}]);`;
  // A module the host blocks or never fetches would otherwise leave the widget blank.
  const fallback = `setTimeout(function(){var e=document.getElementById("${mount}");if(e&&!window.Daybook)e.textContent="The day list did not draw, because its module never arrived from jsDelivr."},10000);`;
  return [
    `<h2 class="sr-only">Daybook day list: ${onToday} on today and ${data.later_count} on later, with done, later, today and drop controls that collect until apply sends them in one message.</h2>`,
    `<div id="${mount}"></div>`,
    `<script src="${src}"></script>`,
    `<script>${job}${fallback}</script>`,
  ].join("\n");
}

const WIDGET_GUIDE = [
  "Pass everything below the line to visualize's show_widget unchanged, as widget_code, with title daybook_day_list " +
    'and loading_messages ["Opening the daybook"]. Call its read_me first if this session has not. Write nothing after the widget.',
  "",
  'Presses in the widget collect until its apply pill sends them as one message, "Daybook changes: done <id>; later <id>; ' +
    'today <id>; drop <id>." Apply every change in one pass, then call daybook_widget again and draw the new page:',
  "- done <id>: daybook_close {id}",
  '- drop <id>: daybook_close {id, status: "dropped"}',
  '- later <id>: daybook_move {id, horizon: "later"}',
  '- today <id>: daybook_move {id, horizon: "today"}',
  'A message ending "Then show later." or reading "Daybook: show later." asks for the next draw with later: true.',
  "Today holds three. If the changes leave more than three on it, name them in one line and let Austen pick what comes off.",
  "",
  "---",
].join("\n");

const triggerProperties = {
  surface: { type: "string", description: "mail, calendar, slack, tasks, chat, notebook" },
  external_id: {
    type: "string",
    description: "The id on that surface: a Gmail message id, an event id, a task id, a Slack ts.",
  },
  account: { type: "string", description: "work or personal, where the surface has accounts" },
  link: { type: ["string", "null"] },
  title: { type: ["string", "null"], description: "What the trigger itself said, before rewriting" },
};

const itemProperties = {
  id: { type: "string", description: "Stable key, e.g. action:austen:<slug>" },
  updated_at: {
    type: "string",
    description: "The updated_at this item was read at. Required to edit an existing item; omit to create one.",
  },
  title: { type: "string" },
  kind: { type: "string", description: "task, reply, decision, skip-level" },
  status: { type: "string", enum: ["open", "closed", "dropped"] },
  horizon: { type: "string", enum: ["today", "later"] },
  priority: {
    type: ["integer", "null"],
    description:
      "Hand order inside a band only; lower sorts first. Rank comes from due, pressure and size, so leave " +
      "this alone and set those instead.",
  },
  pressure: {
    type: ["string", "null"],
    enum: ["waiting", "meeting", "deadline", "none", null],
    description:
      "What happens if he does nothing. waiting: a named person is blocked on him (set person). meeting: " +
      "a meeting needs it done first (set due to the meeting date). deadline: a date passes (set due). " +
      "none: nothing happens. Set it on every new item.",
  },
  size: {
    type: ["string", "null"],
    enum: ["quick", "session", "project", null],
    description:
      "quick: under fifteen minutes, one reply or one approval. session: one sitting. project: several " +
      "sittings or other people. Set it on every new item.",
  },
  prep: {
    type: ["object", "null"],
    description:
      "A draft written ahead so the item finishes in one approval. Never sent by anything but his yes. " +
      "Null clears it.",
    properties: {
      shape: { type: "string", enum: ["message", "comments", "hold", "outline"] },
      target: { type: ["string", "null"], description: "Where it goes: a channel or thread, a mail thread, a doc, a calendar" },
      body: { type: "string", description: "The draft, in his voice. Comments go one per line, numbered." },
      start: { type: ["string", "null"], description: "For a hold: ISO start" },
      end: { type: ["string", "null"], description: "For a hold: ISO end" },
      attendees: { type: ["array", "null"], items: { type: "string" } },
      sent: {
        type: ["string", "null"],
        enum: ["unchanged", "edited", null],
        description: "Set when he approves the draft: unchanged if it went out as written, edited if he rewrote it",
      },
    },
    required: ["shape", "body"],
  },
  ranked_by_hand: { type: ["string", "null"], description: "Date he last dragged it. Do not change hand-ranked order." },
  due: {
    type: ["string", "null"],
    description: "YYYY-MM-DD, when it is owed. Leave it null unless someone actually named a date.",
  },
  person: { type: ["string", "null"], description: "Email, matched against meeting attendees" },
  link: { type: ["string", "null"] },
  source: { type: ["string", "null"] },
  first_seen: date,
  closed_on: { type: ["string", "null"] },
  triggers: {
    type: "array",
    description:
      "What pointed at this item. Attach one instead of writing a second item when a flagged mail, " +
      "an invite, a saved Slack message or a task turns out to be a thing already on the list.",
    items: {
      type: "object",
      properties: triggerProperties,
      required: ["surface", "external_id"],
    },
  },
};

export const DAYBOOK_TOOLS: ToolDefinition[] = [
  {
    name: "daybook_list",
    description:
      "Read the Daybook. With no date, returns open items in rank order, each with its band (1 overdue, " +
      "2 due today, 3 someone waiting, 4 due this week, 5 quick, 6 rest, 7 stale) and a reason clause " +
      "saying why it sits there. A wrong place means a wrong due, pressure or size; fix that fact rather " +
      "than the priority. closed_since adds items " +
      "closed or dropped on or after that date, and all returns every item. With a date, returns that " +
      "day's focus, added and closed lists plus every item they name or that closed that day. Each " +
      "answer also carries the triggers on those items, so read this before adding anything.",
    inputSchema: {
      type: "object",
      properties: {
        date,
        closed_since: date,
        all: { type: "boolean", default: false },
        triggers: {
          type: "boolean",
          default: true,
          description: "Include what pointed at each item, keyed by item id. Match against these before adding.",
        },
      },
    },
    run: async (a) => {
      const withTriggers = a.triggers !== false;
      if (a.date !== undefined) {
        const day = await getDay(assertDate(a.date));
        if (!withTriggers) return day;
        return { ...day, triggers: await triggersFor(day.items.map((i) => i.id)) };
      }
      const items = await listItems({
        closedSince: a.closed_since === undefined ? undefined : assertDate(a.closed_since, "closed_since"),
        all: Boolean(a.all),
      });
      return {
        today: todayPT(),
        items,
        ...(withTriggers ? { triggers: await triggersFor(items.map((i) => i.id)) } : {}),
      };
    },
  },
  {
    name: "daybook_upsert",
    description:
      "Add or edit Daybook items in one all-or-nothing batch. An edit must carry the item's updated_at " +
      "as last read; if the item changed since, nothing is written and the error names the current " +
      "updated_at, so read again and redo it. A new item omits updated_at and needs a title; first_seen " +
      "defaults to today. Fields left out of an edit keep their value.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: itemProperties, required: ["id"] },
        },
      },
      required: ["items"],
    },
    run: async (a) => {
      requireWrites("daybook_upsert");
      if (!Array.isArray(a.items)) throw new Error("items must be an array");
      const inputs = a.items as Array<ItemInput & { triggers?: TriggerInput[] }>;
      const items = await upsertItems(inputs);
      const attached = [];
      for (const input of inputs) {
        for (const t of input.triggers ?? []) attached.push(await attachTrigger(input.id, t));
      }
      return { items, ...(attached.length ? { triggers: attached } : {}) };
    },
  },
  {
    name: "daybook_find_trigger",
    description:
      "Ask whether one thing on a surface is already on the list: a mail message, a calendar event, " +
      "a Slack message, a task. Returns the item it points at, or nothing. Cheaper and more reliable " +
      "than judging, so call it first and spend judgment only on what comes back empty.",
    inputSchema: {
      type: "object",
      properties: triggerProperties,
      required: ["surface", "external_id"],
    },
    run: async (a) =>
      (await findTrigger(String(a.surface), String(a.external_id), a.account === undefined ? "" : String(a.account))) ?? {
        found: false,
      },
  },
  {
    name: "daybook_close",
    description:
      "Close or drop a Daybook item on a date (default today) and record it in that day's closed list. " +
      "Pass updated_at to fail instead of overwriting a change made since you read it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["closed", "dropped"], default: "closed" },
        date,
        updated_at: { type: "string" },
      },
      required: ["id"],
    },
    run: async (a) => {
      requireWrites("daybook_close");
      const status = a.status === undefined ? "closed" : String(a.status);
      if (status !== "closed" && status !== "dropped") throw new Error("status must be closed or dropped");
      return closeItem(
        String(a.id),
        status,
        a.date === undefined ? todayPT() : assertDate(a.date),
        a.updated_at === undefined ? undefined : String(a.updated_at),
      );
    },
  },
  {
    name: "daybook_show",
    description:
      "Show Austen his day list in Claude chat, drawn as this server's view: today's items and later, " +
      "with done, later, today and drop on each row. Claude Code draws nothing from this tool, so call " +
      "daybook_widget there instead. Later shows as a count unless later is true; pass it only when he " +
      "asks for later or the whole list. To read the list for your own reasoning, call daybook_list.",
    inputSchema: {
      type: "object",
      properties: {
        later: { type: "boolean", default: false, description: "Include the later items, not only their count" },
      },
    },
    ui: { resourceUri: DAYBOOK_VIEW_URI, visibility: ["model", "app"] },
    run: async (a) => dayList(a.later === true),
  },
  {
    name: "daybook_widget",
    description:
      "Show Austen his day list in Claude Code. Returns a page to pass unchanged to visualize's show_widget, " +
      "and says how to apply the one message its controls send. Use it whenever he asks to see or work his " +
      "list in Claude Code; Claude chat uses daybook_show. Later shows as a count unless later is true.",
    inputSchema: {
      type: "object",
      properties: {
        later: { type: "boolean", default: false, description: "Draw the later items, not only their count" },
      },
    },
    run: async (a) => `${WIDGET_GUIDE}\n${await widgetPage(a.later === true)}`,
  },
  {
    name: "daybook_move",
    description:
      "Move a Daybook item between today and later, keeping that day's focus list in step. The day " +
      "list's today and later controls land here, so apply them with this rather than daybook_upsert.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, horizon: { type: "string", enum: ["today", "later"] } },
      required: ["id", "horizon"],
    },
    run: async (a) => {
      requireWrites("daybook_move");
      const horizon = String(a.horizon);
      if (horizon !== "today" && horizon !== "later") throw new Error("horizon must be today or later");
      return moveItem(String(a.id), horizon, todayPT());
    },
  },
  {
    name: "daybook_set_day",
    description:
      "Write a day's focus (item ids on that day's list, in order), added (ids first seen that day) and " +
      "closed (ids closed that day). Each list passed replaces the stored one; lists left out are kept.",
    inputSchema: {
      type: "object",
      properties: { date, focus: ids, added: ids, closed: ids },
      required: ["date"],
    },
    run: async (a) => {
      requireWrites("daybook_set_day");
      return setDay(assertDate(a.date), {
        focus: a.focus as string[] | undefined,
        added: a.added as string[] | undefined,
        closed: a.closed as string[] | undefined,
      });
    },
  },
];
