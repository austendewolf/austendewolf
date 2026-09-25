# austendewolf.com

## Claude is the hub, this site is the backing layer

The site owns state and cheap facts: the daybook list, the triggers on it, and
lookups that answer a question from data. Claude owns judgment: deciding two
things are the same action, rewriting a topic into something Austen could
start, reading a scanned notebook page.

Judgment needs a model, and Austen's Claude subscription already pays for one.
So a design that puts a model on the server is on the wrong side of this line
and costs money per token instead. Propose it only when nothing else works, and
say so out loud.

A credential belongs on the server only when it buys an unattended read the
server itself can act on. Google clears that bar. Slack does not, because its
web token and cookie expire on a schedule nobody controls and a 7:30am run
cannot re-take them.

## Schemas own their roles

Each app connects as its own least-privilege Postgres role, and that role owns
its schema and nothing else: `awd_app`, `workout_app`, `daybook_app`. The
`roles/*.sql` files set this up and drizzle-kit does not generate them.

Migrations are applied by hand against production through the Supabase MCP,
with an `OWNER TO <role>` appended. This database has no drizzle bookkeeping
table, so `pnpm migrate` has never run against it.

## The MCP gateway

`mcp.austendewolf.com` is this repository, served by `apps/web`. POST goes to
the bare origin rather than `/api/mcp`. The bearer token is `MCP_TOKEN`,
exported in `~/.zshrc`.

Tools are plain objects with `name`, `description`, `inputSchema` as raw JSON
Schema, and `run`, collected into arrays and merged in `lib/mcp/registry.ts`.

`accounts_connect_url` unions with an account's existing scopes and never picks
up a newly-added default, so a new scope has to be passed explicitly.

`docs/mcp-connector-auth.md` holds the plan for putting OAuth in front of this
endpoint so claude.ai can add it as a custom connector. Read it before changing
the bearer check, `next.config.ts`'s rewrite, or anything under `/oauth`.

## The daybook

`docs/daybook.md` holds the plan and the decisions. Read it before changing
anything under `apps/web/src/app/daybook`, `lib/daybook` or `lib/mcp/daybook.ts`.

This repository is public, so nothing here or in `docs/` names list contents.
