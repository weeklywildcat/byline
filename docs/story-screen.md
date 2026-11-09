# The Story screen

The default Story is the workspace itself. There is no tab bar. Opening a Story opens the Story; everything else is a focused mode, a Sheet or a Popover. Code: `apps/newsroom/src/ui/story/` (`StoryScreen`, `StoryHeader`) and `packages/newsroom-screens/src/story-context/`.

## What the Story contains

Story header, the article editor, the lifecycle and one primary next action, Story Context, the Angle, a Reporting summary, contextual Media, an optional Checklist, and review feedback when there is some.

## Header {#header}

The header holds the lifecycle stage, writers and deadline, and **one** primary lifecycle action for this reader right now: Accept pitch, Start drafting, Submit for review, Resubmit, Review submitted version, or Publish. Occasional things live in the overflow menu (**More story actions**: Story details, View history, Put on hold, Drop, and, before Ready, Publish now without review) and in Story details.

A labelled **Reporting** button is always visible. It is the way into full Reporting and is deliberately not hidden in a menu. **Preview** is beside it.

Publication actions (Schedule, Unpublish, Move to trash) are separate from the lifecycle and stay reachable in every stage for anyone who may publish.

## Focused modes

| URL | Mode |
| --- | --- |
| (none) | The Story |
| `?view=reporting` | Full Reporting: sources, appointments, capture, material, recordings, notes, links, files and photos, transcripts, verified quotes, ground rules, search |
| `?view=history` | Versions, restore, public notices, corrections |
| `?view=review` | The submitted version, for someone with a review to do |

Each has a **Back to story**, works with the browser's Back and Forward, and never unmounts the article editor: it is hidden while a focused mode is open and restored at the same place, so edits made just before leaving are saved and the Lexical state is never lost.

### Legacy URLs

Old links keep working. `?tab=reporting` and `?tab=history` open those modes; `?tab=plan` and `?tab=write` open the Story (Plan no longer exists: its parts live in Story Context and Reporting, and an old Plan link opens the Story with its context showing). `?appointment=<id>` and `?transcript=<id>` open Reporting on that record. The `tab` parameter is dropped as soon as you move. An ordinary Story link never picks a mode from the lifecycle.

## Story Context {#context}

A rail beside the article when the Story container is at least 1180px wide; the same content in a right **Sheet**, opened from **Story context**, when it isn't. It shows people, the Angle, Up Next (from [Story Attention](story-lifecycle.md#attention)), Reporting at a glance, contextual Media and the review state. The Angle is edited inline and saved.

## Checklist {#checklist}

Optional, and only shown when a Story has one. Checklist items are tasks on the Story; checking one off is a single click and counts toward Story Attention (`checklist-due`) when overdue.

## Peek {#peek}

Opening a Story from the Board or a list can preview it first. Peek is deliberately light: identity and stage, writers, editor and deadline (editable where the reader is allowed), **Next** from Story Attention, **Preview** when the Story has a public URL, and **Open story**. It has no Tasks, Production, Reporting, Files or Activity: those belong on the Story.

## Board

The Stories Board has one column per lifecycle stage (On Hold and Dropped are columns too; empty ones collapse). Cards can be dragged, and always have a **Move to** menu so dragging is never required. Staff are not offered Review or Ready. A card shows its one main signal.

## Forms inside the Story

The Story screen renders inside Payload's document form, so a native `<form>` submit would be caught by it and reload the Story. Inline composers (note, link, transcript, review reply) use `InlineForm`: explicit `type="button"` saves, Enter saves single-line fields, Cmd/Ctrl+Enter saves multi-line ones, Escape cancels. Dialogs and Sheets that portal out of the document form may use a normal form.
