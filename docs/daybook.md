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
| `triggers` | one row per thing that pointed at an item: surface, account, the id on that surface, link, what it originally said, when it was seen |
| `captures` | one row per notebook scan: Drive file id, page date, processed_at, the transcribed lines and the item each one touched |

**Every surface is a front door, and several of them point at one thing.** Austen can add an item from a chat session, a flagged email, a calendar invite, a Slack save, a Google Task or a notebook page. A meeting gets booked, the invite arrives by mail, someone chases it in Slack, and all three are the same action. So a trigger attaches to an item rather than being one, and an item carries as many as it collects.

That splits the duplicate problem in two. The surface, the account and the id on that surface are unique together, which is the guard that does not depend on judgment: one message, one event, one task id attaches exactly once however many runs see it. Judgment decides only which item it attaches to, and being wrong there is a re-parent, which is cheap. Being wrong the other way produces two rows meaning one thing, which is the failure the table exists to prevent.

The rule for the run: read the list with its triggers, ask whether this thing is already attached, and only spend judgment on what comes back empty. Two things are the same item when acting on one satisfies the other, which makes a reply on a captured thread the same item even under a changed subject, and makes two different asks in one thread two items. A close but uncertain match goes to Austen rather than being guessed.

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

**Mail** is a capture surface on both accounts, decided 09/21/2026, with two routes.

The flag is the one Austen drives. He flags in his mail client, which maps to Gmail's `STARRED` label over IMAP, so `is:starred` reads exactly what he marked, and a flagged message means a thing he owes someone.

A flag is a trigger rather than a row, in the sense the storage section gives that word. The run asks whether the message is already attached, and otherwise resolves it three ways: it matches an open item, so the trigger attaches there and nothing new is written; it matches a closed or dropped item, so that item reopens because the thing came back; or nothing matches, so a new item goes on carrying the message as its first trigger.

Then the run clears `STARRED` and `INBOX` on that message, which is the whole reason the route works: he stopped flagging because the pile grew and nothing drained it, and now the flag reads as "I saw this, it is on the list, get it out of my inbox". A flag is never consumed before the item it resolved to exists and holds the link. The backlog on the first run gets offered rather than imported, because some of it is months dead.

The proposal pass covers what he did not flag. The run reads the unread inbox it already reads, decides which messages are really his, and offers each as an item in the same confirmation block as its proposed actions; only a yes writes it. An offer clears three bars first: the thing needs him rather than anyone else, it is still undone when checked against the underlying object rather than the unread flag, and it is not already on the list.

Items from either route carry the account and the message link, so the row opens the thread it came from.

**Slack Later** is still unbuilt, and it is the only capture surface left. Reminders work on the public API through `reminders.list`. Saved items do not: `stars.list` was deprecated for this and returns nothing saved through Later, and no public Later API exists. The only route is `saved.list`, the internal web client endpoint, which Austen chose on 09/21/2026 knowing it is unsupported.

Its contract, confirmed from rusq/slackdump PR 738: form-encoded POST to the workspace host's `/api/saved.list`, authenticated by an `xoxc-` web client token plus the `d` cookie, both of which come from a signed-in browser and both of which expire on their own schedule. Params are `token`, `limit`, `filter`, `include_tombstones=true` and `cursor`; `filter` accepts exactly `saved`, `completed` or `archived`, and both `all` and the empty string are rejected. The caller pages through `response_metadata.next_cursor` until it comes back empty. Each item gives a channel id and a timestamp but never the message text, so resolve it through `conversations.history` with `latest` and `oldest` set to that timestamp and `inclusive=true`, which works on a normal user token.

Because those credentials die and a 7:30am run cannot re-extract them, an auth failure degrades that one source with a clear re-capture message and the digest continues. It never fails the run.

**Tools.** The MCP gateway (`apps/web/src/app/api/mcp/route.ts`) gains these:

- `daybook_list` returns open items, or one day, each with the triggers attached to it.
- `daybook_upsert` adds or edits items, pinned by `updated_at`, and attaches triggers to them.
- `daybook_find_trigger` answers whether one thing on a surface is already on the list.
- `daybook_close` closes or drops an item with a date.
- `daybook_set_day` writes focus, added and closed for a date.
- `calendar_respond` accepts or declines an event on either account. The conflict picker needs it and the gateway lacks it today.

The morning skill writes through these instead of the artifact database, and any session can add an item with one call.

**Notebook.** Austen scans each page with the Google Drive app into a `Notebook` folder. The morning run finds unprocessed scans, reads them with the notation rules (dot is open, cross-through is closed, arrow is moved, bolt is skipped, `[name]` is the person), writes items through the tools and logs the scan in `captures`. A later phase moves this into a server job, so a scan lands on the page within minutes.

## UI parity with the artifact

The page was ported from an earlier draft of the artifact rather than the version running today, so six things are missing. The artifact's source is kept at `docs/daybook-artifact.html`, because the artifact gets deleted and that file becomes the only reference.

**Due dates.** Items carry no due date at all, which is the only gap that needs a schema change: a nullable `due` date on `items`, its own migration applied by hand, then through the store's mapper and input type, the tool schema, and the page as a chip on the row. Everything else below is drawing.

**The chart.** The page draws a filled load curve with tick marks for double-booked quarter hours. The artifact draws the meetings themselves as named blocks, stacked into lanes when they overlap, with the title clipped to the block's width. It also draws the focus time he held in green and anything booked over it in blue, and reports how much of that held time survived. That distinction is the point of the chart: someone else's time reads blue and his own reads green.

**Later gets buckets.** Later is one flat list today. The artifact sorts it into overdue, due today, this week, dated beyond this week, and no date yet, which is what makes the due column worth having.

**Sections fold.** Today and Later each collapse to a one-line summary, remembered in the browser rather than the database, since it is a per-viewer preference.

**The day seals.** Three closed items turns the rail green, matching the three-item rule the store already enforces.

**A past day replays its own chart.** The artifact saves the day's calendar shape alongside the day record, so opening an earlier date redraws what that day actually looked like. The saved shape has to reach the `days` row for this to work.

**"Work on" does not port.** The artifact's brief asks a model in the browser what to do next. That is judgment, and judgment belongs to Claude under the rule above, so the page drops it rather than putting a key in the browser. Asking a session for the same brief costs nothing and reads better.

## Phases

1. **Done 09/21.** Schema, role and migration on the site's database, seeded once from the artifact.
2. **Done 09/21.** The four gateway tools plus `calendar_respond`, and Google Tasks alongside them.
3. **Done 09/21.** The `/daybook` page, ported from the artifact, with both themes.
4. **Done 09/21.** The morning skill and the scheduled task write through the tools. The artifact goes read-only for a week, then gets deleted.
5. Due dates: the column, the migration, the store, the tools, the chip on the row.
6. The chart redrawn as named meeting blocks in lanes, with held focus time and what was booked over it.
7. Later bucketed by due date; Today and Later fold; the rail seals at three closed.
8. Save the day's calendar shape so an earlier date replays its own chart. The artifact gets deleted once this lands.
9. Slack Later and reminders as a capture surface, read in the session rather than by the server.
10. Process notebook scans in the morning run.
11. Process scans on the server with the site's own Anthropic key.

## Decided

- **Claude is the hub, the site is the backing layer.** Settled 09/21/2026. The site owns state and the cheap facts: the list, the triggers, and the lookup that answers whether a message is already attached. Claude owns judgment: deciding two things are the same action, and rewriting a topic into something Austen could start. Judgment needs a model, and his Claude subscription already pays for one, so anything that would put a model on the server sits on the wrong side of this line and costs money per token instead.

  The rule that follows: a credential belongs on the server only when it buys an unattended read that the site itself can act on. Google clears that bar, because mail, calendar, Drive and Tasks all feed scheduled work. Slack does not, because its token and cookie expire on a schedule nobody controls and a 7:30am run cannot re-take them. Slack stays in the session.

- **The notebook flows one way.** Austen writes on paper, photographs the page, and the items land here rewritten as actions he approves. Nothing writes back to paper, and a flushed page stops being a list he owes anything to. The `notebook` skill holds the procedure and the notation.
- **Hover content is fine here.** Austen decided on 09/15/2026 that full item titles, including people decisions, live in this database. It is his personal list and the page sits behind authentication.

## Open decisions

- **Apple Notes and Apple Reminders.** Neither has a server-side API, so nothing can read them without a device running a shortcut. They stay out of the store until Austen says what he uses them for.
- Where the Slack web token lives is unresolved. No `xoxc` token or `d` cookie exists on this machine, in the keychain or the profile, so phase 5 needs both taken once from a signed-in browser. Because Slack reads happen in the session rather than on the server, the keychain is the likelier home and `mcp_accounts` stays Google-only.
- **Scan transcription key.** The last phase needs an Anthropic key that belongs to this site, and borrowing another project's key is out.
