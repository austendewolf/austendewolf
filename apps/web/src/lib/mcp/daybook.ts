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
  priority: { type: ["integer", "null"], description: "Lower is more urgent. Steps of 10." },
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
      "Read the Daybook. With no date, returns open items, most urgent first; closed_since adds items " +
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
      "Show Austen his Daybook as an interactive list in the chat: today's items and later, with Done, " +
      "Later, Today and Drop on each row. Use when he asks to see or work his list. Later shows as a " +
      "count unless later is true; pass it only when he asks for later or the whole list. To read the " +
      "list for your own reasoning, call daybook_list instead.",
    inputSchema: {
      type: "object",
      properties: {
        later: { type: "boolean", default: false, description: "Include the later items, not only their count" },
      },
    },
    ui: { resourceUri: DAYBOOK_VIEW_URI, visibility: ["model", "app"] },
    run: async (a) => {
      const all = await listItems();
      const later = all.filter((i) => i.horizon !== "today");
      const showLater = a.later === true;
      return {
        today: todayPT(),
        writable: WRITES_ALLOWED,
        later_shown: showLater,
        later_count: later.length,
        items: showLater ? all : all.filter((i) => i.horizon === "today"),
      };
    },
  },
  {
    name: "daybook_move",
    description: "Move a Daybook item between today and later, keeping that day's focus list in step.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, horizon: { type: "string", enum: ["today", "later"] } },
      required: ["id", "horizon"],
    },
    // The view's Today and Later buttons. The model already has daybook_upsert.
    ui: { visibility: ["app"] },
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
