# The Story screen

The default Story is the workspace itself. There is no tab bar. Opening a Story opens the Story; everything else is a focused mode, a Sheet or a Popover. Code: `apps/newsroom/src/ui/story/` (`StoryScreen`, `StoryHeader`) and `packages/newsroom-screens/src/story-context/`.

## What the Story contains

Story header, the article editor, the lifecycle and one primary next action, Story Context, the Angle, a Reporting summary, contextual Media, an optional Checklist, and review feedback when there is some.

## Header {#header}

The top bar's breadcrumb says where you are: **Stories › the Story's headline** (live as you type, "Untitled story" until it has one). Stories is a link to the list. In a focused mode the mode's name is added (**Stories › headline › Reporting**) and the headline is the way back to the Story. The Story screen publishes this while it is open; nothing is saved.

The header holds the lifecycle stage, writers and deadline, and **one** primary lifecycle action for this reader right now: Accept pitch, Start drafting, Submit for review, Resubmit, Review submitted version, or Publish.

**Right-click the stage** (the colored badge and status beside it) for the moves available to you: the primary action (Accept pitch, Start drafting, Submit for review…), then Put on hold and Drop, or Resume. They are the same actions as the header button and the overflow menu, which remain the keyboard and touch route. Editors also get **Move to stage**: jump straight to Pitch, Reporting, Drafting, Review or Ready without stepping through the ones between. That is the same editor override as Change stage in Story details: it closes any open review, History records it, and the toast has an Undo. The badge is tinted by stage (Pitch violet, Reporting blue, Drafting amber, Review indigo, Ready green, On Hold gray, Dropped red); the stage is always written out, color is a second cue. Staff still cannot force Review or Ready.

A labelled **Reporting** button is always visible. It is the way into full Reporting and is deliberately not hidden in a menu. Everything else lives in **one** overflow menu (**More story actions**), never a row of buttons or a second menu: Preview (Payload's Live Preview), Story context when it isn't a rail, Story details, View history, Open in Field Mode, Put on hold, Drop, and, before Ready, Publish now without review.

Publication actions (Schedule, Unpublish, Move to trash) are separate from the lifecycle, stay reachable in every stage for anyone who may publish, and are the last group in that same menu.

**Story mode** (Standard / Live) is a property of the Story, a row beside Section and Story type in the article's properties, not a bar above the headline. Only editors can change it.

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

## Legacy Story view {#legacy-layout}

An opt-in for people who want the older arrangement while they get used to the new one. It is off by default. **Legacy Story view** is a checkbox in the account menu (next to Field Mode) and applies to that account everywhere.

Only the arrangement changes. The header, article, lifecycle, review and publishing are the same; staff still cannot force Review or Ready from it. The same header sits over **Write / Plan / Production / History** tabs, with no Story Context rail or Sheet:

- **Write** is the article. It stays mounted and is only hidden behind the other tabs, so the editor is never remounted by switching tabs or turning the view on or off.
- **Plan** is the Brief, Reporting plan and Tasks beside Details, Resources, Notes and Activity. **Production** is Media & Production. **History** is the version history. These are the same shared sections Story Context and Reporting are built from.
- **Reporting** and **Review** are not tabs: the header's Reporting button and Review action still open the focused modes with Back to story, and the Reporting-intent links (`?appointment=`, `?transcript=`) still land in Reporting.
- **View history** in the overflow menu, `?view=history` and `?tab=history` open the History tab; `?tab=plan` and `?tab=production` open those tabs. Review feedback shows above the tabs.

The choice is stored in Payload Preferences under `byline:story:layout:v1`, per user, like Stories saved views: no Users field, migration or endpoint. It is meant as a transition aid, not a second supported design: new Story features land in the default layout first.

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
