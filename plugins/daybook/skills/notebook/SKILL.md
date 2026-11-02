---
name: notebook
description: Turn a photo of Austen's handwritten daily notebook page, and the Google Tasks people assign him in Docs and Chat, into Daybook items written as actions, enforce the three-item cap on today, and expire stale items. Use whenever he sends a picture of a notebook page, says "here's yesterday's page", "flush my notebook", "capture this page", "pull my Google Tasks", or asks to reconcile the written list with the digital one.
---

# Notebook intake

Austen keeps one handwritten page per day and a digital Daybook. The paper is where he thinks. The Daybook is the only authoritative list. This skill moves items from the first to the second once a day and never the other way.

Google Tasks is the second way in. Whatever someone assigns him in a Doc or a Chat space lands there, and every flush carries the open ones across with the page.

## Why the rules below are shaped this way

Settled from the evidence review on 09/16/2026, kept here so a later session does not relax them by feel:

- Handwriting beats typing for learning failed to replicate twice, so the notebook earns its place on composition, not memory. It never has to be authoritative, and nothing is lost by flushing it.
- Self-generated wording is retained better than the same wording read. Austen edits every item before it lands. Wording written entirely by Claude is worth less to him even when it is more accurate.
- A written item removes the nagging only when it names when, where or with whom. Listing options does nothing. This is the single highest-value step in the flush.
- Cycle time rises with work in progress, and 53% of real tasks finish in the week they were planned for, with a 1.7x mean overrun. Three on today, never five.
- Filing costs about three times what searching costs with the same hit rate. No folders, tags or projects.
- A list that mixes things to do with things to know stops working as either, which is the core of GTD's clarify step. A thought never gets an invented verb or owner to pass as a task.
- A note written as a complete claim can be checked and found again, where a topic cannot (Matuschak's evergreen notes, Bullet Journal's short objective sentences). Clinical SOAP notes keep what a person said apart from what the writer concluded, so a later reader can tell a report from a judgment. Decisions get their own type because a decision journal pays off only when the decisions are read back against how they turned out.

## Reading the page

One page per day, headed like `14 | Monday, September 14, 2026`.

| Mark | Meaning | What it does |
|---|---|---|
| Dot | Open task | Becomes a Daybook item |
| Straight cross through | No longer open | Closes the matching item. Never claim it was completed |
| Forward arrow | Moved to a later day | Stays open, horizon `later` |
| Lightning bolt | Reflection, information or a decision | Becomes a note or a decision, never a task |
| `[Name]` in brackets | Who he was talking to | Always the person, even when the text reads like a topic |
| `(Name)` in parentheses | The same thing as brackets | He uses both forms interchangeably; do not read parentheses as an aside |

Indented sub-bullets belong to the line above them and usually become one item, not several.

An undated page, including a loose sheet, takes the last date written on the pages uploaded with it. He uploads pages newest first, so the first photo is the latest page and the dated header it follows sits on a later photo. Do not ask him for the date.

Never invent a line. When handwriting is genuinely unreadable, quote the characters you can make out and ask. A wrong item costs more than a missing one because it sits in the list looking real.

## Reading Google Tasks

Every flush reads his open Google Tasks on the work account alongside the page, and a flush with no page reads them alone. Most of them are assignments: someone put his name on a checklist line in a 1:1 doc, a set of meeting notes or a plan, or assigned him a task in a Chat space.

- Read every list, with `tasks_list_tasklists` and then `tasks_list` on each, and read them once more with `show_completed` to catch the ones finished somewhere else.
- An assigned task carries an `assignment` naming the Doc or space it came from, with a link to the assignment itself. That link goes on the item, because it opens the exact line he has to act on.
- A task is a trigger, with `surface: "tasks"`, the account and the task id. Run `daybook_find_trigger` on it before anything else. An attached task is already on the list and gets no row. A task that comes back empty takes the same three passes as a dot.
- People often assign him something in a Doc that is already on the list. That task attaches as a Duplicate or an Augments, and a page line about the same thing merges with it in step 2.
- A completed task attached to an open item closes that item on the date Tasks gives, as a Closing row.
- Tasks records no created date. Date an undated task from the dated heading above it in the source Doc, and use the Doc's last edit when it has no headings.
- The flush never completes or deletes a Google Task. Completing an assigned task ticks its box in the source Doc, where everyone reading the Doc sees it, so that happens only when he asks, through `tasks_complete`. Deleting one deletes the assignment in the Doc as well.

## The flush

0. Read the whole Daybook first, with `daybook_list` (`all: true`, triggers on), and keep it in hand for the rest of the flush. Every line on the page gets judged against this list, and a stale read produces the duplicate rows this skill exists to prevent. Every match against it goes through `daybook_find_trigger` before judgment: it is cheaper and more reliable, so spend judgment only on what comes back empty.
1. Read every mark on the page. A crossed line that matches an open item gets closed on the day of the page, because he did it and the list never caught up. Arrows stay open in `later`. Then read his Google Tasks, under the rules in Reading Google Tasks.
2. Consolidate like lines before refining any of them. Two lines about the same thing, whether on one page, across several uploaded pages, or on a page and in Google Tasks, become one item. The same person plus the same object is the usual sign, like "Robin role" and "one pager for Robin". Merge them, keep the most specific wording from each, and name the merge in step 5 so he can split it back.
3. Take each dot, and each task the trigger check left unattached, through the same three passes, one line at a time, and in this order: pull context, refine the action, then reconcile it against the Daybook. Reconciling last matters, because a line matches an existing item on its refined shape (verb, object, person), and the raw page wording is too thin to match on. A notebook line is the thinnest version of the thing, and each surface holds a different missing piece:

| Surface | What it supplies | When to check it |
|---|---|---|
| Calendar | The meeting the line came out of, who was there, and the next meeting where it gets done | Every line, no exceptions. Search the page's date for the meeting that produced it, then forward for the next time those people meet |
| 1:1 doc in Drive | The substance, the decisions already taken, and a link | Every line naming someone he meets with |
| Slack | What was actually asked, a permalink to reply in, and whether it already got answered | Every line naming a person or a topic someone raised. Search from the page's date forward |
| Jira | The ticket key, the current status, the assignee | Lines naming a ticket, a board or a piece of delivery |
| Drive planning docs | The numbers and the framing he is expected to bring | Lines about a plan, a budget or a quarter |
| The Doc a task was assigned in | The words around the assignment, the heading that dates it, and whether the line is already ticked | Every Google Task |

Check them before drafting, not after, and put the link on the item so he does not hunt for it. When a surface says something the paper does not, the surface wins.

**Check whether it is already resolved.** While the context is open, look for evidence the thing happened after the page was written: his Slack reply in the thread, the ticket moved or closed, a doc comment resolved, a meeting held with the thing on its agenda. Keep the permalink, because the reconciliation below needs it as evidence. Never call something done on a guess. An open item for something already done costs him a follow-up he did not need to send. Two gaps came from skipping this: a line that read as a short follow-up turned out to be a week of work that only the 1:1 doc described, and nine items sat with an empty due date while their meetings were on the calendar the whole time.

**Reconcile the refined line against the Daybook.** With the context pulled and the action written to the shape below, place the line in exactly one of four outcomes. Compare on the refined shape, verb plus object plus person, and treat the same person and the same object as a match even when the verbs differ, because "Ask Sam about the vendor contract" and "Send Sam the vendor contract" are one piece of work at two stages. Run `daybook_find_trigger` on the meeting, message or ticket the context turned up before judging by hand.

| Outcome | Test | What gets written |
|---|---|---|
| New | No open or recently closed item shares the object and person | One new item, with the context links as its source |
| Duplicate | An open item already says the same thing, as well or better | No new row. Attach a `notebook` trigger to the existing item so the page is on record, and leave the title alone |
| Augments | An open item covers the same work and the page or the context adds something it lacks: a cue, a date, a name, a link, a sharper object, or a next step the old wording did not reach | Edit the existing item in place, carrying its `updated_at`. Keep its id and priority, and tighten the title only where the new material is more specific. Attach the `notebook` trigger |
| Done | The resolution check found clear evidence it happened | Closed on the day the evidence says, with the permalink as source. When it also matches an open item, close that item, on the same date and with the same evidence, and write no second row. Two rows for one finished thing is the worst outcome on this table |

Partial evidence resolves to Augments, with the source saying what moved, never to Done. When a line matches an item that already closed, it is a duplicate of a closed item and gets no row at all; name it in the Closing section as already done, so he sees why it vanished.

4. Write each surviving new dot as an action, to the shape below.
5. Read the proposal back as a widget and let him confirm it line by line. Render it with the `visualize` MCP (`show_widget`) from `widget.html` in this skill's folder: read the file, replace `__PAGE_DATES__` with the page dates, like "09/28 and 09/29", and `__ROWS__` with the rows as a JavaScript array shaped as in Flush rows below, and pass the result through unchanged. Never write the layout fresh, because improvised layouts drifted from flush to flush and he could not read them. The layout lives in `plugins/daybook/ui/daybook.js`, the module the day list draws from too, and the template loads it at a git tag. When he asks for a layout change, change the module, tag the commit, and point the template at the new tag.

   Group the rows by thread, one section per thread, each headed with a plain name for the work they share, like "Q4 roadmap" or "Hiring". Rows that share a person and an object, or that feed the same next step, belong in one thread. Lines with no thread go in a last section called "Other". A row from Google Tasks joins its thread like any page line, and its margin note names the Doc or space it was assigned in. Inside a thread, actions come first, then notes and decisions, then closings. A blocker needs no type of its own: it is a Heard note in the same thread as the action it gates, and that action's due date falls after it. Each kind of row shows the following:
   - **Actions**: each refined action with its priority, cue and link. An Augments row shows the new title with the words it adds tinted, and the item's current title underneath, so he can see the edit before it lands. Every action carries its due date as data, and the widget spells it out in full with the distance in parentheses. A Duplicate row shows the page line and the item it folds into, with nothing to edit.
   - **Notes**: each lightning bolt, plus any line whose wording turned out to be a thought, written to the note shape below. A note lands in the Daybook as `kind: note` and a decision as `kind: decision`, so both stay searchable, and neither becomes a task. The widget marks new actions with a dot, matching the dot on the page, notes with a bolt and decisions with a gavel, both amber.
   - **Closing**: crosses, plus lines the resolution check found done, each with its evidence link. A Done row that also closes an open item names that item, because one Keep there closes two things.

   Clicking a row's icon opens a menu that changes its type, because the mark on the page is sometimes wrong. Retyping has to change the sentence, so write each row's other shapes up front in its `as` field: every note and decision carries a `new` version written to the action shape below, with its own priority and due date, every action carries a `note` version as one plain sentence, and every Closing row that could still be open carries a `new` version. The widget swaps the matching version in when he retypes. A line with no honest action behind it, like a note about how he slept, gets no `new` version, and a retype flags it for rewording.

   Every row gets a square checkbox, checked by default. A green check means the line goes into the Daybook, and an empty box means it stays out. Mark merges on the row itself. One submit button sends the whole decision back through `sendPrompt`, with skipped ids and any rewording he typed into a row, as `Notebook flush confirmed for <dates>. Dropped: <ids>. Changed: <entries>. Keep everything else as proposed.` A changed entry reads `id: text` when he reworded it, and `id (note to new, p20, due 2026-10-05): text` when he retyped it. Nothing is written to the Daybook before that submit arrives. When he answers in text instead, take "skip 3, 7" or a reworded line the same way.
6. Write only what he kept, each row as the type he left it on, in one `daybook_upsert` batch: new actions, notes and decisions as new items, Augments as edits carrying `updated_at`, Duplicates as a trigger on the existing item, and closures through `daybook_close` on the evidence date. Every item carries a trigger for where it came from: `notebook` for a page line, `tasks` with the account and task id for a Google Task, and both when the two merged. Skipped lines get no row at all, because a skipped line means no. A skipped Augments leaves the existing item exactly as it was.
7. Draw the day list with Later open, through the `day-list` skill, and ask him to pick today's three on it. Claude never picks them.
8. Tell him the page is flushed. He can recycle it.

## The shape of an item

The paper carries topics. The Daybook carries actions, and the rewrite between them is the whole job. Four parts, and a line missing any of them goes back for it rather than landing bare:

| Part | Rule | Why |
|---|---|---|
| Verb | The first word of the line, with no exceptions, and physical | Someone watching has to be able to say whether it happened. Send, ask, book, write, review, call. Never think, decide, discuss, explore or consider. The line reads as an order to himself, so nothing gets in front of the verb |
| Object | The specific thing, not the subject area | "The vendor contract", never "the vendor" |
| Cue | A time, a place, or a standing meeting, and it trails the line | A written item stops nagging only once it says when and where. "Thursday morning" and "at your next 1:1 with Sam" both work; "soon" does not. It goes last so the verb keeps the front |
| Person | One name, his or someone else's | Two names in one line means two items, or one item whose owner is not settled |

So "vendor contract" becomes "Ask Sam to take the vendor contract, Thursday morning."

A line whose real content is a judgment still gets a physical verb: "decide whether agreements come back" becomes "ask Robin and Jesse in the leads channel whether agreements without estimates come back". The decision is the outcome. The action is the asking.

**A cue that names a meeting resolves to a date.** "At your next 1:1 with his manager" sits on his calendar with a real start time, so look it up, write the date into the line, and set `due` to it. A cue that stays vague leaves `due` empty and the item drifts. Look up the event even when the paper says only a person's name, because a 1:1 is the usual place a line like that gets done.

**Every item carries a priority.** The list is one ordered sequence, so a new item takes a number that places it against what is already open rather than landing at the end. Pick the number from the items it sits between, and say the number out loud in step 5 so he can move it.

## The shape of a note

A note is one complete sentence. Its subject is whoever holds the idea, and its verb says how they hold it:

| Shape | Pattern | Example | Kind |
|---|---|---|---|
| Heard | [Name] said, wants or found X | Sam said the vendor contract renews in March | `note` |
| Thought | You think, wonder or feel X | You think the second interview should run without the hiring manager | `note` |
| Decided | [Who] decided X | You and Sam decided the pilot ends Friday | `decision` |

One idea goes in each note. Two people saying two things become two notes. A note gives no orders and holds no "should" that is really a task; when a next action hides inside it, that action becomes its own row and the note keeps the rest.

**The wording decides between a task and a note, and nothing gets invented to make a task.** A view, an open question, a position, or something someone else wants is a thought, even when an action could be built from it. Never supply a guessed owner, a verb or a meeting to turn one into a todo. The page mark comes first: a dot whose wording holds no action goes in as a note, flagged so he can move it back with the type menu.

## Flush rows

`__ROWS__` in `widget.html` is a JavaScript array. A section header is a one-element array naming its thread, like `["Hiring"]`, with `["Other"]` last. Every other entry is a row:

| Field | Holds |
|---|---|
| `id` | A stable slug, which the submit message names |
| `k` | `new` for an open action, `edit` for a change to an open item, `note` for something heard or thought, `decision` for something decided, `done` for something that already happened |
| `t` | The proposed text, which he can edit in place |
| `p` | The priority number |
| `due` | A date or a local time, `2026-10-05` or `2026-10-05T13:30`, which the widget writes out in full with the distance in parentheses |
| `m` | Anything else for the muted line: what merged, where the evidence came from |
| `old` | On an edit row, the item's current title. The widget tints the words the edit adds and shows this underneath |
| `f` | Something he must check, in the gap color |
| `l` | The evidence permalink |
| `as` | The line rewritten for the other types, keyed by type: `{new: {t, p, due, f}, note: "...", decision: "...", done: "..."}`. A string stands for `t` alone |

Every row needs `id`, `k` and `t`, and the widget draws nothing but an error when a row's `k` is anything else. A retype with no version in `as` keeps the text and flags it for rewording.

## Standing rules on the list itself

**Three on today.** A fourth item arrives only by swapping one out. When he asks for a fourth anyway, name which one is coming off and let him choose.

**Nothing files.** No folders, tags or projects. Search finds it.

**Items expire.** Anything open and untouched for 14 days gets offered for dropping in one line at the next flush or morning run, listed together rather than one prompt each. Dropping is a normal outcome and needs no justification.

**The weekly review reads the record.** On Monday, compare what he planned against what actually closed, from the stored days, not from recollection. Reviews only carry their effect when the objective record is in front of the person.
