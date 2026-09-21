import { pgSchema, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

/**
 * austendewolf.com's own two schemas.
 *
 * `gateway` holds what the MCP server at mcp.austendewolf.com needs to answer a
 * call: the Google accounts it acts as, and the other servers it fronts. `site`
 * holds what the public pages collect. Both are owned by `awd_app`, because one
 * process serves both and a second role would buy nothing.
 *
 * These lived in `public` until 09/21/2026, which left the gateway's tables in
 * the schema every other role falls back to while `workout` and `daybook` each
 * had their own. `roles/awd.sql` sets the ownership; drizzle-kit does not.
 */
export const gatewaySchema = pgSchema("gateway");
export const siteSchema = pgSchema("site");

export const messages = siteSchema.table("messages", {
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
export const mcpAccounts = gatewaySchema.table("accounts", {
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

/**
 * Other MCP servers this one fronts.
 *
 * A row, not a config file. The gateway this replaces declared its upstreams in
 * `gateway.config.json`, which made every new connection a deploy. Connecting
 * something is the whole point of a gateway, so it belongs in the dashboard and
 * therefore in a table.
 *
 * `headers` carries whatever the upstream authenticates with and is never
 * returned to a browser, the same rule the account credentials follow.
 */
export const mcpUpstreams = gatewaySchema.table("upstreams", {
  // Also the tool prefix: this upstream's tools appear as `<name>.<tool>`.
  name: text("name").primaryKey(),
  url: text("url").notNull(),
  headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
  /** Only these tool names are exposed. Wins over `deny`. */
  allow: text("allow").array(),
  /** These tool names are hidden. */
  deny: text("deny").array(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type McpUpstream = typeof mcpUpstreams.$inferSelect;
export type NewMcpUpstream = typeof mcpUpstreams.$inferInsert;
