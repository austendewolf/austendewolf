import { checkAccount, getAccount, listAccounts, removeAccount } from "./accounts";
import { ALL_SCOPES, DEFAULT_SCOPES, authorizeUrl, oauthConfigured, revoke } from "./oauth";
import type { ToolDefinition } from "./google";

/**
 * Managing the server's own connections, over MCP.
 *
 * The /mcp page does this in a browser; these tools do the parts that do not
 * need one. Connecting is the exception: OAuth consent is a human at Google by
 * design, so the best a tool can do is mint the URL and hand it back. Nothing
 * here can grant access on its own.
 */

const WRITES_ALLOWED = (process.env.MCP_ALLOW_WRITES ?? "1") !== "0";

/**
 * Revoking credentials is held behind its own flag, off by default.
 *
 * The bearer token is meant to buy "act as these accounts", not "take these
 * accounts away". Leaving removal off keeps a leaked token from being able to
 * lock the owner out, which is the one thing here that cannot be undone from
 * this side. The /mcp page, which is behind a real sign-in, can still do it.
 */
const REMOVAL_ALLOWED = (process.env.MCP_ALLOW_ACCOUNT_REMOVAL ?? "0") === "1";

export const ADMIN_TOOLS: ToolDefinition[] = [
  {
    name: "accounts_list",
    description:
      "List the Google accounts this server can act as, with their granted scopes and whether " +
      "credentials still work. Call this when a tool fails with an auth error, to see whether the " +
      "account is missing a scope or needs reconnecting.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const accounts = await listAccounts();
      const health = await Promise.all(accounts.map((a) => checkAccount(a.name)));
      return {
        oauthConfigured: oauthConfigured(),
        accounts: accounts.map((a, i) => ({
          name: a.name,
          email: a.email,
          scopes: a.scopes.map((s) => s.split("/auth/").pop() ?? s),
          healthy: health[i].healthy,
          error: health[i].error ?? undefined,
          connectedAt: a.updatedAt,
        })),
      };
    },
  },
  {
    name: "accounts_connect_url",
    description:
      "Mint a Google authorization URL for an account and return it to open in a browser. " +
      "Consent happens at Google, so this grants nothing by itself. Use it to add an account or to " +
      "widen an existing one's scopes; reconnecting keeps current scopes unless you pass more.",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Account handle, e.g. 'work'. Letters, digits, - and _ only.",
        },
        scopes: {
          type: "array",
          items: { type: "string" },
          description:
            "Full scope URLs to request. Omitted means the account's current scopes, or the " +
            "defaults for a new account. Existing scopes are always kept.",
        },
      },
      required: ["account"],
    },
    run: async (a) => {
      const name = String(a.account).trim().toLowerCase();
      if (!/^[a-z0-9_-]+$/.test(name)) {
        throw new Error("account name must use letters, digits, - or _");
      }
      const requested = (a.scopes as string[] | undefined) ?? [];
      const unknown = requested.filter((s) => !ALL_SCOPES.includes(s));
      if (unknown.length) throw new Error(`unknown scope(s): ${unknown.join(", ")}`);

      const existing = await getAccount(name);
      // Union, never a narrowing: re-consent should not silently drop access.
      const scopes = Array.from(
        new Set([...(existing?.scopes ?? (requested.length ? [] : DEFAULT_SCOPES)), ...requested]),
      );
      return {
        account: name,
        isNew: !existing,
        requesting: scopes.map((s) => s.split("/auth/").pop() ?? s),
        url: authorizeUrl(name, scopes),
        note: "Open this in a browser and complete Google's consent screen. The link expires in 10 minutes.",
      };
    },
  },
  {
    name: "accounts_disconnect",
    description:
      "Revoke an account's Google credentials and forget them. Destructive and not undoable: " +
      "restoring access needs a full re-consent. Disabled unless MCP_ALLOW_ACCOUNT_REMOVAL=1; " +
      "otherwise remove accounts from the /mcp page. Pass confirm set to the account name to proceed.",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string" },
        confirm: {
          type: "string",
          description: "Must equal the account name. Guards against an accidental call.",
        },
      },
      required: ["account", "confirm"],
    },
    run: async (a) => {
      if (!WRITES_ALLOWED) throw new Error("'accounts_disconnect' writes, and this server is read-only.");
      if (!REMOVAL_ALLOWED) {
        throw new Error(
          "removing accounts over MCP is disabled. Disconnect from https://austendewolf.com/mcp, " +
            "or set MCP_ALLOW_ACCOUNT_REMOVAL=1 to allow it here.",
        );
      }
      const name = String(a.account).trim();
      if (String(a.confirm) !== name) {
        throw new Error(`confirm must equal the account name; expected ${JSON.stringify(name)}`);
      }
      const existing = await getAccount(name);
      if (!existing) throw new Error(`no account named '${name}'`);
      // Revoke at Google first: forgetting locally without revoking would leave
      // a live grant behind with no way left to reach it.
      const revoked = existing.refreshToken ? await revoke(existing.refreshToken) : false;
      const removed = await removeAccount(name);
      return { account: name, revokedAtGoogle: revoked, removedLocally: removed };
    },
  },
];
