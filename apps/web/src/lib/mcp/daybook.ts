import {
  assertDate,
  closeItem,
  getDay,
  listItems,
  setDay,
  todayPT,
  upsertItems,
  type ItemInput,
} from "@/lib/daybook/store";
import type { ToolDefinition } from "./google";

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
  person: { type: ["string", "null"], description: "Email, matched against meeting attendees" },
  link: { type: ["string", "null"] },
  source: { type: ["string", "null"] },
  first_seen: date,
  closed_on: { type: ["string", "null"] },
};

export const DAYBOOK_TOOLS: ToolDefinition[] = [
  {
    name: "daybook_list",
    description:
      "Read the Daybook. With no date, returns open items, most urgent first; closed_since adds items " +
      "closed or dropped on or after that date, and all returns every item. With a date, returns that " +
      "day's focus, added and closed lists plus every item they name or that closed that day.",
    inputSchema: {
      type: "object",
      properties: {
        date,
        closed_since: date,
        all: { type: "boolean", default: false },
      },
    },
    run: async (a) => {
      if (a.date !== undefined) return getDay(assertDate(a.date));
      return {
        today: todayPT(),
        items: await listItems({
          closedSince: a.closed_since === undefined ? undefined : assertDate(a.closed_since, "closed_since"),
          all: Boolean(a.all),
        }),
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
      return { items: await upsertItems(a.items as ItemInput[]) };
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
