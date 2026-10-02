---
name: day-list
description: Draw Austen's Daybook day list in Claude Code and apply what he presses on it. Use whenever he asks to see or work his list, says "my list", "day list", "what's on today", "what's on my plate", "show my daybook" or "show later", when he says "next" or "work the list", and whenever a message arrives that starts "Daybook changes:" or reads "Daybook: show later.", because those come from the widget this skill draws.
---

# Day list

The Daybook's server builds the day list, and this skill carries it to the screen and applies what comes back. Every session draws the same list with the same controls, because none of them writes the layout.

## Drawing it

1. Call `daybook_widget`. Pass `later: true` only when he asks for later or the whole list, or when the message that asked for this draw said to show later.
2. Load visualize's `read_me` once, if this session has not.
3. Pass everything below the result's `---` line to `show_widget` unchanged, with the title and loading message the result names. Never write the page or edit it. The layout lives in `plugins/daybook/ui/daybook.js`, which the page loads, and a change to the look goes there.
4. Write nothing after the widget. It is the whole answer, and a summary of it makes him read the list twice.

Claude chat draws the site's own view of the list through `daybook_show`, where each press applies at once. Use that tool there, and this skill only in Claude Code.

## Applying what he presses

Presses collect in the widget until he presses apply, which sends one message:

    Daybook changes: done <id>; later <id>; today <id>; drop <id>.

Apply every change in one pass, in the order given:

| Change | Call |
|---|---|
| `done <id>` | `daybook_close {id}` |
| `drop <id>` | `daybook_close {id, status: "dropped"}` |
| `later <id>` | `daybook_move {id, horizon: "later"}` |
| `today <id>` | `daybook_move {id, horizon: "today"}` |

Then draw the list again. A message that ends "Then show later." or reads "Daybook: show later." draws it with `later: true`.

When a call fails, apply the rest anyway, draw the list again, and name the change that failed in one line before the widget.

**Today holds three.** When the changes leave more than three on today, name the extras in one line and let him pick which come off. Claude never picks.

## Working it with "next"

"Next" or "work the list" walks the ranked list one item at a time, so he answers instead of choosing. Call `daybook_list` and take the first open item, skipping notes and undated decisions the way the widget does. Today's items come first, then later in the order the server returned.

Show one item in four lines: the title, its `reason`, the draft in `prep` as a quote block if there is one, and the five answers. No preamble.

    send · edit · skip · later · drop

| Answer | Does |
|---|---|
| send | Carry out the draft below, set `prep.sent` to `unchanged` or `edited` through `daybook_upsert`, close the item with `daybook_close`, and show the next one |
| edit | Take his rewrite or his note on the draft, redraft, and show the same item again |
| skip | Show the next item and change nothing. A skipped item comes back at the top of the next "next" |
| later | `daybook_move` to later, then the next item |
| drop | `daybook_close` with status `dropped`, then the next item |

What send carries out depends on the draft's shape. Each one is his yes acting, so do exactly the draft and nothing beyond it:

| Shape | Send does |
|---|---|
| `message`, Slack | `slack_send_message_draft` to the channel and thread in `target`, so it sits in his Slack drafts for the last look. Say where it landed |
| `message`, mail | A Gmail draft reply on the thread in `target`. Say it is in Drafts |
| `comments` | `drive_add_comment` once per numbered line, on the doc in `target` |
| `hold` | `create_event` with the start, end, attendees and title in the draft |
| `outline` | `drive_create_doc` with the body, then put the doc's link on the item and set `size: session`. The item stays open, because the document is the work |

An item with no draft gets done, later, drop or skip, and a one-line offer to draft it now when its size is quick.

Stop when he says stop, when three items have closed today, or when the list runs out. Then draw the day list once, through Drawing it above.

## Reading it without drawing it

To reason about the list, answer a question about it, or check it before adding anything, call `daybook_list`. It returns every field and the triggers on each item, and it draws nothing.
