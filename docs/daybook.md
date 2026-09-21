# Daybook on austendewolf.com

This is a draft from 09/15/2026. The repository is public, so this plan names no list contents.

## Goal

The daily list lives in one place that austendewolf.com owns. The page, the morning run, any Claude session and the paper notebook all read and write that one store.

## Today

The list has two copies, and they reconcile only when the morning run fires:

- The Daybook artifact's own database on claude.ai (`items`, `days`) holds what the page reads and writes.
- `digest_item` in `~/team-scorecard/scorecard.db` on the Mac holds the open loops the morning run remembers.

A change on the page reaches the local copy the next morning. An item added by any other session has to be written to both by hand.

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

**Tools.** The MCP gateway (`apps/web/src/app/api/mcp/route.ts`) gains these:

- `daybook_list` returns open items, or one day.
- `daybook_upsert` adds or edits items, pinned by `updated_at`.
- `daybook_close` closes or drops an item with a date.
- `daybook_set_day` writes focus, added and closed for a date.
- `calendar_respond` accepts or declines an event on either account. The conflict picker needs it and the gateway lacks it today.

The morning skill writes through these instead of the artifact database, and any session can add an item with one call.

**Notebook.** Austen scans each page with the Google Drive app into a `Notebook` folder. The morning run finds unprocessed scans, reads them with the notation rules (dot is open, cross-through is closed, arrow is moved, bolt is skipped, `[name]` is the person), writes items through the tools and logs the scan in `captures`. A later phase moves this into a server job, so a scan lands on the page within minutes.

## Phases

1. Add the schema, role and migration, then copy the artifact database's `items` and `days` once.
2. Add the gateway tools, plus `calendar_respond`.
3. Build the `/daybook` page, ported from the artifact.
4. Switch the morning skill to the tools. `digest_item` stops carrying the kinds `items` now owns, and `digest_observation` stays local for the scorecard trends. The artifact goes read-only for a week, then gets deleted.
5. Process notebook scans in the morning run.
6. Process scans on the server with the site's own Anthropic key.

## Decided

- **The notebook flows one way.** Austen writes on paper, photographs the page, and the items land here rewritten as actions he approves. Nothing writes back to paper, and a flushed page stops being a list he owes anything to. The `notebook` skill holds the procedure and the notation.
- **Hover content is fine here.** Austen decided on 09/15/2026 that full item titles, including people decisions, live in this database. It is his personal list and the page sits behind authentication.

## Open decisions

- **Apple Notes and Apple Reminders.** Neither has a server-side API, so nothing can read them without a device running a shortcut. They stay out of the store until Austen says what he uses them for.
- **Scan transcription key.** Phase 6 needs an Anthropic key that belongs to this site, and borrowing another project's key is out.
