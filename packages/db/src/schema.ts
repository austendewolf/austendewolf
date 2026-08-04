import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/**
 * Google accounts the MCP server can act as.
 *
 * Refresh tokens live here rather than in the environment so a re-consent
 * survives a deploy. Nothing in this table is ever returned to a browser.
 */
export const mcpAccounts = pgTable("mcp_accounts", {
  // The short handle tools take, e.g. "work".
  name: text("name").primaryKey(),
  email: text("email"),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  refreshToken: text("refresh_token").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type McpAccount = typeof mcpAccounts.$inferSelect;
export type NewMcpAccount = typeof mcpAccounts.$inferInsert;
