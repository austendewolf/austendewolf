#!/usr/bin/env bash
# Render an HTML file to a trimmed 2x PNG, and optionally a PDF.
#
#   shot.sh <input.html> <output.png> [width] [height]
#   shot.sh <input.html> <output.pdf> [--landscape|--portrait]
#
# PNG: captures at 2x, trims to content, then pads with the page background so
# you never have to guess the window height.
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }

IN="${1:?usage: shot.sh <input.html> <output.(png|pdf)> [width] [height]}"
OUT="${2:?missing output path}"
ABS="$(cd "$(dirname "$IN")" && pwd)/$(basename "$IN")"

# Background colour for the trim padding, read from the page if it declares one.
BG="$(grep -oE '(background|--bg) *: *#[0-9A-Fa-f]{3,8}' "$IN" | head -1 | grep -oE '#[0-9A-Fa-f]{3,8}' || true)"
BG="${BG:-#FFFFFF}"

case "$OUT" in
  *.pdf)
    ORIENT="${3:---landscape}"
    [ "$ORIENT" = "--portrait" ] && SIZE="" || SIZE="--landscape"
    "$CHROME" --headless --disable-gpu --no-pdf-header-footer \
      --print-to-pdf="$OUT" "file://$ABS" >/dev/null 2>&1
    echo "wrote $OUT"
    ;;
  *)
    W="${3:-1700}"
    H="${4:-1400}"
    TMP="$(mktemp -t shot).png"
    "$CHROME" --headless --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=2 --window-size="$W,$H" \
      --screenshot="$TMP" "file://$ABS" >/dev/null 2>&1
    magick "$TMP" -trim +repage -bordercolor "$BG" -border 24 "$OUT"
    rm -f "$TMP"
    echo "wrote $OUT  $(magick identify -format '%wx%h' "$OUT")"
    ;;
esac
