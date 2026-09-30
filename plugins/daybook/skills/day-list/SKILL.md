---
name: day-list
description: Draw Austen's Daybook day list in Claude Code and apply what he presses on it. Use whenever he asks to see or work his list, says "my list", "day list", "what's on today", "what's on my plate", "show my daybook" or "show later", and whenever a message arrives that starts "Daybook changes:" or reads "Daybook: show later.", because those come from the widget this skill draws.
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

## Reading it without drawing it

To reason about the list, answer a question about it, or check it before adding anything, call `daybook_list`. It returns every field and the triggers on each item, and it draws nothing.
