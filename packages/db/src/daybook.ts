import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The Daybook: Austen's daily list.
 *
 * Its own Postgres schema for the same reason `workout` has one. The
 * `daybook_app` role owns it and nothing else, so the page and the MCP tools
 * that read and write the list reach it through a connection that cannot see
 * `public`, and `awd_app` cannot see this. The role and its ownership are set
 * by `roles/daybook.sql`, which drizzle-kit does not generate.
 *
 * Single-tenant on purpose: there is no `user_id`. It is one person's list.
 */
export const daybookSchema = pgSchema("daybook");

/**
 * One open loop.
 *
 * `id` is text rather than a uuid because items arrive already keyed by the
 * morning run (`<kind>:<owner>:<slug>`), and keeping that key is what lets a
 * rerun update an item instead of duplicating it.
 *
 * `updated_at` is read back as the exact Postgres string rather than a JS Date.
 * It is the version a writer pins to, and a Date would drop the microseconds
 * and never match again.
 */
export const daybookItems = daybookSchema.table(
  "items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    // task, reply, decision, skip-level. Open-ended, so not a check.
    kind: text("kind").default("task").notNull(),
    status: text("status").default("open").notNull(),
    horizon: text("horizon").default("later").notNull(),
    /** Lower is more urgent. Null sorts last. */
    priority: integer("priority"),
    /** The date he last dragged this row. The morning run keeps these in his order. */
    rankedByHand: date("ranked_by_hand"),
    /**
     * When it is owed, when anyone said. Null is the normal case: most of the
     * list has no date and sorts under "no date yet" rather than under a
     * deadline someone invented for it.
     */
    due: date("due"),
    /** An email, matched against meeting attendees. */
    person: text("person"),
    link: text("link"),
    source: text("source"),
    firstSeen: date("first_seen").notNull(),
    closedOn: date("closed_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("items_status_check", sql`${t.status} in ('open', 'closed', 'dropped')`),
    check("items_horizon_check", sql`${t.horizon} in ('today', 'later')`),
    index("items_open_idx").on(t.status, t.horizon, t.priority),
    index("items_closed_on_idx").on(t.closedOn),
  ],
);

/**
 * What one date's list held.
 *
 * Arrays of item ids rather than a join table: a day is written whole by the
 * morning run and read whole by the page, and the order of `focus` is the order
 * the list was in. No foreign key, so a day keeps its record if an id is ever
 * rewritten.
 */
export const daybookDays = daybookSchema.table("days", {
  date: date("date").primaryKey(),
  focus: text("focus").array().default(sql`'{}'::text[]`).notNull(),
  added: text("added").array().default(sql`'{}'::text[]`).notNull(),
  closed: text("closed").array().default(sql`'{}'::text[]`).notNull(),
  /**
   * Meeting load the page recorded, plus `cal`: the day's drawn shape, kept so
   * an earlier date redraws what that day actually looked like instead of
   * today's calendar.
   */
  load: jsonb("load").$type<{
    meetings_h: number;
    double_h: number;
    items_today: number;
    cal?: {
      ev: Array<{ t: string; s: number; e: number }>;
      out: Array<{ s: number; e: number }>;
      held: Array<{ t: string; s: number; e: number }>;
    };
  }>(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
});

/**
 * What made an item show up, on whatever surface it came from.
 *
 * The list has many front doors: a chat session, a flagged email, a calendar
 * invite, a Slack save, a Google Task, a notebook page. They are triggers, and
 * several of them routinely point at one thing he has to do. A meeting gets
 * booked, the invite arrives by mail, someone chases it in Slack, and all three
 * are the same action. So a trigger attaches to an item rather than being one,
 * and an item carries as many as it collects.
 *
 * `(surface, account, external_id)` is unique, and that is the duplicate guard
 * that does not depend on judgment: one Gmail message, one calendar event, one
 * task id can attach exactly once no matter how many runs see it. Judgment only
 * decides WHICH item it attaches to, and being wrong there is a re-parent,
 * which is cheap. Being wrong the other way produces two rows meaning one
 * thing, which is the failure this table exists to prevent.
 *
 * `title` keeps what the trigger itself said, because the item's title gets
 * rewritten as an action and the original wording is what makes a later match
 * checkable.
 */
export const daybookTriggers = daybookSchema.table(
  "triggers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => daybookItems.id, { onDelete: "cascade", onUpdate: "cascade" }),
    /** mail, calendar, slack, tasks, chat, notebook. Open-ended, so not a check. */
    surface: text("surface").notNull(),
    /**
     * work or personal, where the surface has accounts. Empty rather than null,
     * because Postgres counts nulls as distinct and a nullable column here
     * would let the same message attach twice.
     */
    account: text("account").default("").notNull(),
    /** The id on that surface: a Gmail message id, an event id, a task id, a Slack ts. */
    externalId: text("external_id").notNull(),
    link: text("link"),
    /** What the trigger said, before the item's title was rewritten as an action. */
    title: text("title"),
    seenAt: timestamp("seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("triggers_external_key").on(t.surface, t.account, t.externalId),
    index("triggers_item_idx").on(t.itemId),
    index("triggers_surface_idx").on(t.surface, t.seenAt),
  ],
);

/**
 * One scanned notebook page, and what reading it changed.
 *
 * Keyed by the Drive file so a scan is never processed twice. `lines` keeps the
 * transcription next to the item each line touched, which is the audit trail
 * when a read goes wrong.
 */
export const daybookCaptures = daybookSchema.table(
  "captures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driveFileId: text("drive_file_id").notNull().unique(),
    pageDate: date("page_date"),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    lines: jsonb("lines")
      .$type<Array<{ text: string; mark?: string; item_id?: string | null; action?: string }>>()
      .default([])
      .notNull(),
  },
  (t) => [index("captures_page_date_idx").on(t.pageDate)],
);

export type DaybookItem = typeof daybookItems.$inferSelect;
export type NewDaybookItem = typeof daybookItems.$inferInsert;
export type DaybookDay = typeof daybookDays.$inferSelect;
export type DaybookCapture = typeof daybookCaptures.$inferSelect;
export type DaybookTrigger = typeof daybookTriggers.$inferSelect;
export type NewDaybookTrigger = typeof daybookTriggers.$inferInsert;
