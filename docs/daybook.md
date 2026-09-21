# Daybook on austendewolf.com

Drafted 09/15/2026, phases 1 to 4 shipped 09/21/2026. The repository is public, so this plan names no list contents.

## Goal

The daily list lives in one place that austendewolf.com owns. The page, the morning run, any Claude session and the paper notebook all read and write that one store.

## Today

The list lives in one store. The `daybook` schema is live on the site's database, the four tools answer on the gateway, and the page renders at `/daybook` behind the owner gate. The claude.ai artifact was seeded across on 09/21/2026 and is no longer written; it stays readable for a week and then gets deleted.

`digest_item` in `~/team-scorecard/scorecard.db` keeps only the kinds the store does not own, and `digest_observation` stays there for the scorecard trends.

## Target

**Storage.** A `daybook` Postgres schema goes in the site's existing database, owned by its own `daybook_app` role, following the `workout` schema pattern in `packages/db/src/workout.ts`.

| Table | Holds |
|---|---|
| `items` | id, title, kind, status (open, closed, dropped), horizon (today, later), due, priority, ranked_by_hand, person, link, source, first_seen, closed_on, updated_at |
| `days` | date, focus ids, added ids, closed ids, load |
| `captures` | one row per notebook scan: Drive file id, page date, processed_at, the transcribed lines and the item each one touched |

**Rules the store enforces.** Settled 09/16/2026 from the evidence review, and they outrank convenience:

- Today holds three items. A fourth arrives only by swapping one out, and the swap is Austen's call.
- Every item reads as something he could start: a verb, a time or a trigger, and a person or place. Bare topics get rewritten on the way in, and he approves the wording.
- An item open and untouched for 14 days is offered for dropping, all of them in one prompt.
- No folders, tags or projects. Search finds it.
- The weekly review compares the plan against the stored days, never against recollection.

**Page.** `/daybook` sits behind the existing owner-only gate in `proxy.ts`. It ports the artifact UI as it stands: rail, today and later lists, drag to reorder, close and drop, meeting conflicts.

**Look.** Every surface on this domain owns its own visual world, and only authentication and the domain are shared: the landing page is a blueprint, the workout app is its own thing, and the daybook is a third. The daybook's palette is the hover-ped matrix theme, whose seed green the artifact already used, ported as a token block of `light-dark()` pairs with the six derived accents written out because the seed does not change. This is the first surface on the site that follows the operating system's light or dark setting; `data-theme` on the page container overrides it. Giving the site shell a real light mode is separate work and still undone.

## Capture surfaces

**Google Tasks** reaches the gateway as `tasks_list`, `tasks_list_tasklists` and `tasks_complete`, on the `tasks` scope. Tasks exposes no created date, so an undated task is dated from the dated heading above it in the source Doc, which the task's `links` array names. This replaced a Chrome scrape that could not run in a scheduled session at all.

**Slack Later** is still unbuilt, and it is the only capture surface left. Reminders work on the public API through `reminders.list`. Saved items do not: `stars.list` was deprecated for this and returns nothing saved through Later, and no public Later API exists. The only route is `saved.list`, the internal web client endpoint, which Austen chose on 09/21/2026 knowing it is unsupported.

Its contract, confirmed from rusq/slackdump PR 738: form-encoded POST to the workspace host's `/api/saved.list`, authenticated by an `xoxc-` web client token plus the `d` cookie, both of which come from a signed-in browser and both of which expire on their own schedule. Params are `token`, `limit`, `filter`, `include_tombstones=true` and `cursor`; `filter` accepts exactly `saved`, `completed` or `archived`, and both `all` and the empty string are rejected. The caller pages through `response_metadata.next_cursor` until it comes back empty. Each item gives a channel id and a timestamp but never the message text, so resolve it through `conversations.history` with `latest` and `oldest` set to that timestamp and `inclusive=true`, which works on a normal user token.

Because those credentials die and a 7:30am run cannot re-extract them, an auth failure degrades that one source with a clear re-capture message and the digest continues. It never fails the run.

**Tools.** The MCP gateway (`apps/web/src/app/api/mcp/route.ts`) gains these:

- `daybook_list` returns open items, or one day.
- `daybook_upsert` adds or edits items, pinned by `updated_at`.
- `daybook_close` closes or drops an item with a date.
- `daybook_set_day` writes focus, added and closed for a date.
- `calendar_respond` accepts or declines an event on either account. The conflict picker needs it and the gateway lacks it today.

The morning skill writes through these instead of the artifact database, and any session can add an item with one call.

**Notebook.** Austen scans each page with the Google Drive app into a `Notebook` folder. The morning run finds unprocessed scans, reads them with the notation rules (dot is open, cross-through is closed, arrow is moved, bolt is skipped, `[name]` is the person), writes items through the tools and logs the scan in `captures`. A later phase moves this into a server job, so a scan lands on the page within minutes.

## Phases

1. **Done 09/21.** Schema, role and migration on the site's database, seeded once from the artifact.
2. **Done 09/21.** The four gateway tools plus `calendar_respond`, and Google Tasks alongside them.
3. **Done 09/21.** The `/daybook` page, ported from the artifact, with both themes.
4. **Done 09/21.** The morning skill and the scheduled task write through the tools. The artifact goes read-only for a week, then gets deleted.
5. Slack Later and reminders as a capture surface.
6. Process notebook scans in the morning run.
7. Process scans on the server with the site's own Anthropic key.

## Decided

- **The notebook flows one way.** Austen writes on paper, photographs the page, and the items land here rewritten as actions he approves. Nothing writes back to paper, and a flushed page stops being a list he owes anything to. The `notebook` skill holds the procedure and the notation.
- **Hover content is fine here.** Austen decided on 09/15/2026 that full item titles, including people decisions, live in this database. It is his personal list and the page sits behind authentication.

## Open decisions

- **Apple Notes and Apple Reminders.** Neither has a server-side API, so nothing can read them without a device running a shortcut. They stay out of the store until Austen says what he uses them for.
- Capturing a Slack session is unresolved. No `xoxc` token or `d` cookie exists on this machine, in the keychain or the profile, so phase 5 needs both taken once from a signed-in browser into a `slack_credentials` table in the same schema. `mcp_accounts` is shaped for Google OAuth and Slack does not fit it.
- **Scan transcription key.** The last phase needs an Anthropic key that belongs to this site, and borrowing another project's key is out.
