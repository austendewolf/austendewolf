# render-visual

A table, roster, matrix or org chart written as HTML comes back as a trimmed
2x PNG or a Letter-landscape PDF, rendered by headless Chrome. The same markup
feeds both, so a page you iterated on inline renders to a file without a
rewrite.

## Install

    claude plugin marketplace add austendewolf/austendewolf
    claude plugin install render-visual@austendewolf

Then ask for a diagram, chart or table "as an image" or "as a PDF".

## What it needs

Google Chrome at its default macOS path and ImageMagick 7 (`magick`) on the
PATH. The script is `skills/render-visual/scripts/shot.sh`:

    shot.sh table.html out.png            # 1700x1400 window, trimmed to content
    shot.sh table.html out.png 2200 1600  # wider window
    shot.sh table.html out.pdf            # Letter landscape

## What it ships

`references/theme.css` is a dark treatment with amber, red and grey cell
states and `print-color-adjust: exact` already set, so Chrome prints the
backgrounds. `SKILL.md` holds the working loop and the rendering traps that
cost a round trip when missed: white text on a transparent panel, headings
orphaned from their table in a PDF, and heredocs in shell calls.
