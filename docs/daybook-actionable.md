# Daybook: rank it right, then work it down

Drafted 10/01/2026. Follows `daybook.md`, which built the store and the page. The repository is public, so this plan names no list contents.

## Goal

The list ranks itself from facts the store holds, says why each item sits where it does, and arrives with the quick ones already drafted. Austen works the top of the list in one pass instead of picking items off one at a time.

## Where it stands on 10/01/2026

Eighty items are open. Fifty-five carry no due date, seventeen carry no priority, seven are past due, and twelve have been open more than two weeks. Two of the three items on today were pinned to meetings that had already happened by the afternoon, and one had been due six days earlier.

Priority today is one integer. The morning run assigns it by judgment from a ranking rule in the morning skill, the notebook skill picks a number "between neighbours" at intake, and a drag on the page overrides both. Three problems follow:

- **Nothing records why.** A number says where an item sits and nothing about what put it there, so a wrong rank cannot be checked and a right one cannot be trusted.
- **The rule lives in three places.** The morning skill, the notebook skill and the page controller each sort differently, and only the morning run applies the full rule, once a day.
- **Pre-work dies with the session.** The morning run spawns task chips for things Claude could draft, and the chip is gone when the session is. Nothing lands on the item.

## Target

**Rank is derived, and the reason travels with it.** Three facts rank an item, and the store holds all three:

| Field | Values | What it answers |
|---|---|---|
| `due` | date, already present | When the work is needed. Set only from a forcing function. |
| `pressure` | `waiting`, `meeting`, `deadline`, `none` | What happens if he does nothing. Someone is blocked, a meeting needs him to walk in holding it, a date passes, or nothing. |
| `size` | `quick`, `session`, `project` | Under fifteen minutes, one sitting, or several. |

The server computes the order from those three plus age, and every surface sorts by it. The rule lives once, in `apps/web/src/lib/daybook/rank.ts`, which the store and the page both import. Bands, first match wins:

1. Overdue, soonest date first
2. Due today. Meeting prep lands here, because a meeting cue sets `due` to the meeting date
3. Someone waiting on him, named from `person`
4. Due within seven days
5. Quick, with any date beyond the week or none
6. Everything else by hand order, then date, then age
7. Undated, open thirty days and untouched for thirty, which are drop candidates

`priority` stays as the hand order inside a band. A drag moves an item only among rows in its group, which is its band and, in the three dated bands, its date. It cannot lift an undated quick item above an overdue one, because that is the move that put a six-day-old deadline under two meeting notes.

**Each row shows its reason.** The page and the widget draw one short clause: "due yesterday", "meeting today", "Patrick is waiting", "quick, 12 days old", "41 days, no motion". When the reason is wrong, he fixes the fact rather than the number.

**Intake asks the two new questions.** The notebook sync and the morning run set `pressure` and `size` on the way in, the same way they set `due`, and show them in the sync widget where he edits the wording. A row with `size` unknown defaults to `session` and `pressure` to `none`, so an unlabelled item sinks rather than floats.

**Quick wins arrive drafted.** A `prep` column holds a draft for an item, written by the morning run for every `quick` item in the top ten and for any `session` item whose shape is a message or a document comment. The draft is one of four shapes:

| Shape | Draft held | Approval does |
|---|---|---|
| Message | Slack or mail text in his voice | Posts a Slack draft or opens the mail thread with the text, then closes the item |
| Comments | Numbered comments against a document | Writes them with `drive_add_comment`, then closes |
| Hold | A calendar block with attendees and a title | Creates the event, then closes |
| Outline | Section headings and the first paragraph of a document | Creates the Doc, links it on the item, moves the item to `session` |

The run writes prep through `daybook_upsert` with a `prep_at` timestamp, so a draft older than the item's last edit is stale and gets redrawn. Prep never sends anything. He does.

**"Next" works the list.** A `next` command in the day-list skill pops the top ranked item, shows its reason and its draft, and takes one of five answers: send, edit, skip, later, drop. Send performs the approval column above. Skip moves to the next item without changing rank. The command keeps going until he stops or today's three are closed. Claude chat gets the same loop through `daybook_show`, where each press applies at once.

**A passed cue asks within the hour.** The scheduled run checks at 12:30pm and 5:30pm PT for items whose `due` or named meeting has passed since the last check, searches Slack and mail for evidence it happened, and either closes the item with the message that settled it or puts a one-line question on the widget: happened, reschedule, or drop. This is the rule the morning skill already states for 7:30am, run twice more so a passed item never sits open overnight.

**Later gets triaged ten at a time.** Monday's run draws the ten oldest later items with their reasons and the same five controls. Twenty minutes clears a week of drift. The fourteen-day drop offer folds into this pass.

**The weekly review measures the rank.** Monday reads the stored days and reports three numbers: items closed from today's top three against items closed from elsewhere, median age at close, and drafts sent unchanged against drafts rewritten. The first says whether the rank matches what he actually does. The third says whether prep is worth its tokens. A rank that is right has most closes coming from the top.

## Phases

1. **Schema.** `pressure`, `size`, `prep`, `prep_at` on `items`, one migration, through the store mapper, the input type and the tool schema. `rank` computed in the store's read path and returned by `daybook_list` and `daybook_widget`.
2. **One sort.** The page controller, the widget module and the MCP view sort by `rank` and draw the reason clause. The band rule leaves the morning skill and the notebook skill, which now set facts and never numbers.
3. **Intake.** The notebook sync widget and the morning run's y/n block carry `pressure` and `size` on every proposed row. Backfill the eighty open items in one sitting with the same widget.
4. **Prep.** The morning run writes drafts for the top ten quick items. The widget shows a draft marker on the row.
5. **Next.** The day-list skill's `next` loop, with the four approval shapes. `daybook_show` gets the same controls.
6. **Passed-cue sweeps** at 12:30pm and 5:30pm PT as scheduled tasks.
7. **Monday triage and the three review numbers.**

Phases 1 to 3 settle priority and ship together. Phase 4 and 5 are the pre-work, and they depend on 1 because the draft has to live on the item.

## Decided

- **Facts in, rank out.** Settled 10/01/2026. Claude sets `due`, `pressure` and `size` with judgment at intake. The server turns them into a rank with no judgment at all. That keeps the rule in one place and makes a wrong rank traceable to one wrong fact.
- **A drag moves within a band.** Hand order is respected inside a band and never across one. The store already refuses a fourth item on today; this is the same kind of rule.
- **Prep is a draft on the item, never a send.** Same line as the rest of the daybook: Claude drafts, Austen sends.
- **The waiting person is `person`.** Settled 10/01/2026. No new column; `pressure: waiting` reads the name from the field that already matches meeting attendees.
- **Seven bands, simpler than first drafted.** Settled 10/01/2026. "Due this week on someone else's clock" became plain "due within seven days", and meeting prep folded into due-today, because neither distinction was something intake could set reliably.

## Open

- Where the midday and evening sweeps run. The 7:30am run is a scheduled task on this machine; two more of the same is the plain answer unless the server grows a scheduler for phase 11 of `daybook.md`.
- Whether the Outline shape is worth building in phase 4 or waits for evidence from the three message-shaped drafts.
- Whether `daybook_show` in Claude chat gets the `next` controls. Phase 5 built the loop in the Claude Code skill only.

## Status on 10/01/2026

Phases 1 to 3 are built on branch `daybook-rank`. Phases 4, 5 and 7 are written into the morning skill and the day-list skill. Migration 0007, the deploy and the phase 6 scheduled task wait on Austen's approval.

The phase 6 task, ready to create as `daybook-passed-cue-sweep` on cron `30 12,17 * * 1-5`:

> Run Austen's passed-cue sweep on the Daybook. Call `daybook_list` and take every open item due today or earlier, plus every `pressure: meeting` item whose meeting on today's work calendar has ended. Skip notes and decisions. For each, search Slack and Hover mail for its person and subject since the cue and read the thread. Evidence it was done closes it with `daybook_close`, dated to the evidence. No evidence re-cues `due` to the next real occurrence of that meeting through `daybook_upsert`, carrying `updated_at`, or leaves it overdue when there is none. Never drop an item for a passed date, and never send or post anything. Report in at most six lines, times in 12-hour PT: what closed and why, what was re-cued to when, and anything unchecked as a question: happened, reschedule, or drop.
