# daybook

A photograph of a handwritten page goes in, and a short list of actions comes
out. The plugin carries one skill, `notebook`, which reads the marks on the
page, rewrites each line as something you could start, checks it against the
list you already have, and writes only what you approve. Your open Google Tasks
come in with the page, including anything someone assigned you in a Doc or a
Chat space.

## Why it exists

Paper is good for thinking and bad for remembering. A digital list is the
reverse. This moves items from the first to the second once a day and never the
other way, so a flushed page owes you nothing and can be recycled.

Three rules do most of the work:

- **Today holds three items.** A fourth arrives only by swapping one out.
- **Every item names a verb, an object, a cue and a person.** "The vendor" is a
  topic. "Ask Sam to take the vendor contract, Thursday morning" is an action.
  A written item stops nagging only once it says when and where.
- **Nothing files.** No folders, tags or projects, because search is cheaper.

The skill states the evidence behind each rule, so a later session does not
relax them by feel.

## Install

    claude plugin marketplace add austendewolf/austendewolf
    claude plugin install daybook@austendewolf

Then send a photo of a page, or say "flush my notebook".

## What it needs

The skill reads and writes through five tools that your own MCP server
provides: `daybook_list`, `daybook_find_trigger`, `daybook_upsert`,
`daybook_close` and `daybook_set_day`. This plugin ships no server, no
endpoint and no credentials, so point those tool names at whatever store you
keep. Mine lives on austendewolf.com behind its own authentication.

Google Tasks comes in through `tasks_list_tasklists` and `tasks_list`. The
Tasks API leaves out anything assigned to you in a Doc or a Chat space unless
the list call sets `showAssigned`, so your server has to set it.

The confirmation step renders `skills/notebook/widget.html` through a widget
tool. Without one, the same proposal reads fine as a table in the transcript.

## What it does not do

Nothing runs on a server and nothing calls a model through an API key. The
reading and the judgment both happen in a Claude session you are already
paying for.

Nothing writes back to paper, and no item is written to the store before you
approve the line.

## Notation

`skills/notebook/SKILL.md` carries the full procedure. The marks it reads:

| Mark | Meaning |
|---|---|
| Dot | An open task |
| Cross through | No longer open |
| Forward arrow | Moved to a later day |
| Lightning bolt | A reflection, never a task |
| `[Name]` or `(Name)` | Who you were talking to |

Names in the examples are placeholders.
