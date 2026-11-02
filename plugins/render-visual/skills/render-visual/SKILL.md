---
name: render-visual
description: Render a table, org chart, matrix, roster, comparison grid, or any other data-dense visual as a real image (PNG) or PDF, using HTML and headless Chrome. Use whenever the user asks for a diagram, chart, table, or org structure "as an image", "as a PDF", "screenshot it", "make me a visual", or reacts to an ASCII draft by asking for something better looking. Also use when producing a visual they will paste into Slack, a Google Doc, a deck, or send to someone. NOT for ASCII they want inline in chat, and NOT for an inline widget when they only want to look at something quickly in the conversation.
---

The pipeline is HTML in, trimmed 2x PNG or landscape PDF out, and the same markup feeds both.

## The loop

1. **Write a Python generator, not raw HTML.** Data lives in a module the generator imports, so a name change regenerates every artifact. Never hand-maintain the same roster in two files.
2. **Iterate in the inline widget first** (`mcp__visualize__show_widget`) when the layout is still being decided. It renders in the conversation with no file round-trip.
3. **Render to a file** with `scripts/shot.sh` once the layout is settled.
4. **Send it** with `SendUserFile`, `display: "render"` for a PNG, `display: "attach"` for a PDF.

## Rendering

```bash
${CLAUDE_PLUGIN_ROOT}/skills/render-visual/scripts/shot.sh table.html out.png            # 1700x1400 default
${CLAUDE_PLUGIN_ROOT}/skills/render-visual/scripts/shot.sh table.html out.png 2200 1600  # wider
${CLAUDE_PLUGIN_ROOT}/skills/render-visual/scripts/shot.sh table.html out.pdf            # Letter landscape
```

PNG captures at 2x, trims to the real content, then pads with the page background. The window size only needs to be large enough; trimming handles the rest, so never spend a round trip guessing height.

## Style

Use `references/theme.css`. It is a midnight treatment: `#0F0F16` ground, white headings, muted row labels, amber for a funded requisition or a highlighted cell, red for an unstaffed gap, dim grey for not-applicable-by-design.

Conventions that have come up and stuck:

- **Functional teams are columns.** When a table mixes attributes and cross-cutting rows, teams run across the top and attributes down the side. Keep every table in a document oriented the same way.
- **Headcount counts a funded requisition, never an unstaffed slot.**
- **Angle brackets carry status.** `<Hiring> (L4M)` for a funded req with its level in parens. `<Unstaffed>` for a gap with nothing behind it. `(c)` after a name for a contractor.
- **A legend line at the foot** explaining what the colours mean, in prose, not a swatch key.

## Watch for

- **White text on a transparent panel disappears.** If a container uses `fill:none` or no background, anything in `--ink` or `--white` vanishes against the page. Give every panel a real background.
- **Chrome prints backgrounds only with `print-color-adjust: exact`.** It is already in the theme; do not drop it when writing a page from scratch.
- **Keep a heading with its table** using `section { break-inside: avoid; }`, or a PDF will orphan the heading at the bottom of a page.
- **`magick` is ImageMagick 7.** `convert` also exists but is the deprecated v6 entry point.
- **Never use a heredoc in a Bash call.** It hangs. Write the file with the Write tool, then run it.

## Verify before sending

Read the rendered PNG back with the Read tool and actually look at it. Missing text, clipped columns, and mis-shaded cells are common and invisible from the source. For a PDF, read the pages.
