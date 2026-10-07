# The daybook inside Claude

Asking for the day list in any Claude app should draw one list, with one set of
controls, in the look the notebook sync settled into on 09/29/2026. The
`daybook` plugin carries only the sync today, and three things draw the
daybook, each its own way: the site's MCP Apps view in
`apps/web/src/lib/mcp/views/daybook.ts`, a day-list widget each Claude Code
session redraws by hand from a memory note, and the sync review in
`plugins/daybook/skills/capture/widget.html`.

This plan builds the rest of the plugin: a `day-list` skill, one drawing module
that every surface loads, and a server tool that hands Claude the finished page.

## The sync widget sets the look

The sync review took eleven versions against real notebook pages to settle, so
the day list copies it. It keeps:

- the token block: green, amber, blue and grey in `light-dark()` pairs, a 13px
  body, and monospace for dates, headers and controls
- the header: the title, the date in green monospace, and a legend of the marks
  at the right
- section headers in green monospace capitals behind a middle dot, with a count;
  Today reads "N of 3", green at three and the gap color above it
- the row grid: a 28px round tinted icon, the title at 13.5px, a muted meta line,
  and the controls at the right edge
- the notebook's marks as icons: a filled dot for an open action, drawn in CSS,
  an arrow for moved to later, an X for done, and a straight line for dropped
- due dates written in full with the distance in parentheses, amber inside two
  days and the gap color once overdue
- controls built as spans with a role, because the host restyles `<button>`

The day list departs from the sync in its controls. Pills take the checkbox's
place: `later` and `done` on a Today row, `drop` and `today` on a Later row,
with the primary one at the right. Titles are not editable in place, the icon
opens no menu, and the person shows by name on the meta line. It has no apply
pill either, since each press acts at once.

Later stays folded behind "show all N". Notes and recorded decisions stay off
the day list, since they never become tasks, and a footer link to the page
counts them.

## Claude Code draws a widget, Claude chat draws the site's view

| | Site's view (MCP App) | Skill widget (`show_widget`) |
|---|---|---|
| Claude Code, desktop Code tab | Draws nothing, for the reasons below | Draws today |
| Claude chat | Should draw, and step 9 checks it | Not needed there |
| A press | Calls the server from inside the view | Fills the compose box with every press so far, and Claude applies them once he sends it |
| Each draw | Costs nothing, because the host fetches the page | Claude writes a short page out again |

The desktop app's code, read on 09/30/2026, blocks the site's view in the Code
tab twice. It draws views from servers configured in Claude Code only while an
Anthropic feature flag is on, and the flag is off here. With the flag on, it
still refuses every tool call such a view makes.

In the Code tab a widget's message lands in the compose box instead of
sending, and each one replaces what the box held (desktop app code, read on
10/07/2026). The host also drops a message silently when it saw its own click
or keypress in the 5.25 seconds before the press. So each press writes one
message carrying every press so far, its row reads "in message", and Austen
sends the lot with return, which costs one model turn. Presses there collected behind an apply pill until
09/30/2026, when that step moved to the sync alone, where Claude proposes
changes from a page and Austen confirms them. A press on the list is already
his decision. In Claude chat the view calls the server itself, so each press
applies at once there too.

## The module comes first, since every surface draws from it

1. **Lift the look into one module.** `plugins/daybook/ui/daybook.js` holds the
   tokens, rows, date text and controls, with an entry point for the day list
   and one for the sync. In `call` mode a press goes through the host's
   `tools/call` at once. In `message` mode each press goes out as its own
   message through `sendPrompt` or `ui/message`. A fixture page draws both entry points
   from sample data, so a change can be checked in a browser in both themes
   before it ships.
2. **Push, then prove the widget host loads it.** Pushing `main` also publishes
   the commit that adds both plugins, still unpushed on 09/30/2026. Draw a
   widget that loads the module from `cdn.jsdelivr.net/gh/` at the pushed
   commit. The host allows scripts from that domain and swaps some libraries for
   its own copies, so confirm this file arrives untouched. If it does not, the
   skill carries the whole page as a template, the way the sync does now, and
   every draw writes more.
3. **Add `daybook_widget` to the server.** It returns the page: today's items cut
   to the fields a row draws, the Later count or Later itself when asked, the
   note count, and one script tag at the deployed commit, which Railway passes
   in as `RAILWAY_GIT_COMMIT_SHA`. Its result text lists the message each
   control sends and the tool call it maps to. `daybook_move` becomes visible to
   the model, so the skill moves items the same way the view does.
4. **Add the `day-list` skill.** Whenever the list comes up in Claude Code, it
   calls `daybook_widget`, passes the page to `show_widget` unchanged, and writes
   nothing after it. When a press's message arrives, it applies that change
   through `daybook_close` or `daybook_move` and writes nothing, since the
   widget already shows it. The notebook skill's step 7, picking today's three, draws this widget
   with Later open. A skill's description sits in every Claude Code session from
   the start, while a connector's tool descriptions arrive only after a tool
   search, which is how sessions ended up drawing their own. `daybook_show`'s
   description says it is for Claude chat.
5. **Redraw the site's view from the module.** A script copies the module into
   `views/` as a string, and a test fails when the copy drifts.
6. **Move the sync onto the module.** Its template shrinks to the rows and a
   script tag, so a sync draws faster and the two widgets share every rule. The
   skill names the module by a git tag, since a commit cannot carry its own
   hash.
7. **Retire the copies.** Delete the memory note that describes the look.
   Update `docs/daybook.md` and the plugin README.
8. **Ship.** Push, deploy the site, bump the plugin to 0.3.0, and run
   `claude plugin update daybook@austendewolf`.
9. **Check every place.** Draw the list in the desktop Code tab, a Code session
   opened from the phone, and Claude chat on web and phone. Screenshot each,
   then press every control on a scratch item and drop it.

## Two changes could retire the widget

- **The flag turns on.** The Code tab can then draw the site's view, with its
  presses in `message` mode. If that holds, `daybook_widget` and the skill's
  drawing half go.
- **A connector route, untested.** For claude.ai connectors on the account the
  desktop app signs into, the app reads views and passes their tool calls
  through with no flag. This app signs into a work account, where a personal
  connector needs that organization's approval first, so nobody has tried it.
