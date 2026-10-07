#!/usr/bin/env python3
"""Force the notebook check when a photo arrives.

WHY THIS EXISTS

On 09/21/2026 four photos of notebook pages came in. The `notebook` skill's
description already says to use it "whenever a picture of a notebook page
arrives", and it was ignored anyway: sixteen items went straight into the Daybook
as bare restatements, without the draft-and-correct step the skill requires and
without the cue each item is supposed to carry. Better prose in the description
would not have caught that, the same way a written rule never caught the reply
length before tone.py started counting words.

WHAT IT CAN AND CANNOT DO

A hook cannot see inside a JPEG, so it cannot decide whether a photo is a day
page, a whiteboard or a screenshot. It does not try. It detects that an image
arrived and hands the judgment back as a check that has to be answered out
loud before anything is written, which is the part that was skipped.

HOW IT DETECTS AN IMAGE

Attachments land in ~/.claude/uploads/<session_id>/ and the UserPromptSubmit
payload carries the session id. A time window was the obvious test and the
wrong one: a turn that runs eleven minutes puts the photo outside any window
short enough to be meaningful. So the hook instead remembers the newest image
it has already announced for that session and fires when a newer one appears.
That fires once per drop no matter how long the turn takes, and never repeats
on the follow-up messages about the same photos.
"""

import json
import os
import sys

UPLOADS = os.path.expanduser("~/.claude/uploads")
SEEN = os.path.expanduser("~/.local/state/daybook/seen")
SUFFIXES = (".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif")

NOTICE = """An image came in with this message. Before reading it for anything
else, decide whether it is a page from the handwritten notebook:

  A day page has a dated heading like `14 | Monday, September 14, 2026` and
  carries the marks: dots, straight cross-throughs, forward arrows, lightning
  bolts, and names in brackets or parentheses.

  A whiteboard photo, a screenshot, a diagram, a document, or handwriting with
  no dated heading is not a day page. Read it normally and ignore the rest of
  this notice.

If it is a day page, invoke the `daybook:capture` skill with the Skill tool and follow
it. Do not parse the page from memory of the notation, and do not write
anything to the Daybook before the writer has seen and corrected the drafted lines.
"""


def newest_image(session_id: str) -> float:
    """Timestamp of the most recent image in this session's uploads, or 0."""
    folder = os.path.join(UPLOADS, session_id)
    try:
        names = os.listdir(folder)
    except OSError:
        return 0.0
    newest = 0.0
    for name in names:
        if not name.lower().endswith(SUFFIXES):
            continue
        try:
            newest = max(newest, os.path.getmtime(os.path.join(folder, name)))
        except OSError:
            continue
    return newest


def unseen(session_id: str, stamp: float) -> bool:
    """True the first time this stamp is offered for this session."""
    if stamp <= 0:
        return False
    marker = os.path.join(SEEN, session_id)
    try:
        with open(marker) as fh:
            if float(fh.read().strip() or 0) >= stamp:
                return False
    except (OSError, ValueError):
        pass
    try:
        os.makedirs(SEEN, exist_ok=True)
        with open(marker, "w") as fh:
            fh.write(repr(stamp))
    except OSError:
        pass
    return True


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0
    if payload.get("hook_event_name") != "UserPromptSubmit":
        return 0
    session_id = str(payload.get("session_id") or "")
    if session_id and unseen(session_id, newest_image(session_id)):
        print(NOTICE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
