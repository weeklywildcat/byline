# The Story screen

A Story has two workspaces, **Plan** and **Write**, as tabs under the Story header. Plan is where a story is prepared, reported and coordinated; Write is the article. They are places to work, not lifecycle stages: moving between them never submits, publishes or changes the Story's stage. Review, History and a Transcript are focused views with a way back, never tabs.

Code: `apps/newsroom/src/ui/story/` (`StoryScreen`, `StoryHeader`, `PlanWorkspace`, `WriteTab`, `story-view.ts`), `apps/newsroom/src/ui/reporting/` (the Reporting notebook, `ReportingReference`) and `packages/newsroom-screens/src/story-context/` (`StoryPlan`, `StoryContext`).

## Header {#header}

The same compact header sits over Plan and Write. The top bar's breadcrumb says where you are: **Stories › the Story's headline** (live as you type, "Untitled story" until it has one); in a focused view the view's name is added and the headline is the way back.

The header holds the lifecycle stage, writers, editor and deadline, the save status, and **one** primary action for this reader right now: Accept pitch, Start drafting, Submit for review, Resubmit, Review submitted version, or Publish. Whose move it is in review ("Waiting for Copy desk", "Changes requested") is a labelled link that opens Review; when a review exists and there is no other status, a **Review** link does the same.

**Right-click the stage** (the colored badge) for the moves available to you: the primary action, then Put on hold and Drop, or Resume. Editors also get **Move to stage** (the editor override; it closes any open review, History records it, and the toast has Undo). The badge is tinted by stage; the stage is always written out.

Everything occasional is in **one** overflow menu (**More story actions**): Preview (Payload's Live Preview), Story details, View history, Open in Field Mode, Put on hold, Drop, and, before Ready, Publish now without review. Publication actions (Schedule, Unpublish, Move to trash) are the last group and are reachable in every stage for anyone who may publish. **Move to trash** is Payload's recoverable delete, distinct from editorial Drop.

Review feedback a writer must act on sits under the header, above the tabs, in both workspaces.

## Plan | Write {#tabs}

The tabs are the newsroom UI kit's shadcn `Tabs` (Base UI underneath), line style, and follow the WAI-ARIA tabs pattern: arrow keys move between them and activate them, the active tab is the one in the tab order, each has a labelled tab panel. They stay visible and directly selectable at every width (never a dropdown). Each tab switch is a history entry, so Back and Forward move between Plan and Write.

**Write is never unmounted.** Its panel is kept mounted and only hidden while Plan or a focused view shows, so the Lexical editor keeps its unsaved changes, undo history, selection, plugins, autosave and lock. Each workspace keeps its own scroll position. Plan mounts when shown.

### Which workspace opens {#default}

| Address | Opens |
| --- | --- |
| `?view=plan`, `?view=write` | that workspace |
| `?view=plan&section=reporting` (`brief`, `todo`, `activity`) | Plan, at that section |
| `?view=review`, `?view=history` | that focused view |
| `?transcript=<id>` | the transcript, focused, over Plan |
| nothing | the Story's default |

The default, decided once per visit and never from the lifecycle: a Story with no article text yet (a new Pitch) opens **Plan**; otherwise the workspace this reader last used on this Story; otherwise **Write**. "Last used" is reader UI state in Payload Preferences (`byline:story:workspace:v1`, the most recent 100 Stories, normalized on read), like Stories saved views: no Users field, migration or endpoint.

### Older links

Every older address still lands where it meant: `?view=reporting`, `?tab=reporting`, `?appointment=<id>` and `?capture=<intent>` open Plan at Reporting (an appointment opens its dialog, a capture starts it); `?tab=plan` opens Plan; `?tab=production` opens Plan at To do, where media assignments now live; `?tab=write`, `?tab=live` and `?tab=publish` open Write; `?tab=history` opens History; `?tab=reporting&transcript=<id>` opens the transcript. Moving anywhere writes the canonical address.

## Plan {#plan}

Four sections in reading order, each in its own card (the UI kit's shadcn `Card`). **Jump to** links at the top move between them (and focus the section heading).

- **Story brief.** The **Angle and assignment** (the plan's brief: the central question, what to find out, who to talk to, open questions), edited in place and saved as a planning record. Beside it: reporters and section (editable through the same autosaving Story form as Write), anyone else working on the Story (whoever has its media, tasks or interviews), the editor, deadline and publication target (editors change them here), and a schedule if there is one. Read-only users see the existing values. Under it, what the Story is expected to deliver (its type and its media assignments: "Article · 2 photos · 1 graphic") and its background links.
- **Reporting.** The Story's reporting notebook ([reporting](reporting.md)): search, capture (note, recording, file, photo, link, transcript import), Up next, the chronological material feed, sources with ground rules, appointments, and the Story's saved quotes with whether each is verified. **Open in Field Mode** is here, labelled. A transcript opens as its own focused view with **Back to Plan**; the transcript editor is never squeezed into a column.
- **To do.** Tasks (the checklist, one click to check off), interviews and appointments still to happen, how many sources haven't been interviewed, and photos, video and graphics (media assignments, with who, when and status). Each row is the existing record and opens its existing dialog; nothing is copied into a second list.
- **Activity.** **Questions and notes** (the Story's private discussion; a note stays open until someone resolves it) and the latest **Recent changes**, with **Full history** for the audit trail.

## Write {#write}

The article: label, headline, deck, byline, section, topics, story type and **Story mode** (Standard / Live; only editors change it, and Live coverage keeps its own setup, desk and publication rules), the lead image with its caption and alt text, the body with its blocks, and the optional "How we reported this" note. Workflow forms never sit inside the article.

When the Story container is at least 1180px wide, **Story context** sits beside the article: the Angle, reporting at a glance, media and the checklist, with shortcuts into Plan. Below that width there is no rail; Plan has the same information.

### Reporting reference {#reference}

**Reporting reference**, beside the tabs in Write, opens the Story's reporting for reading while writing: a search box, saved quotes, notes, recordings and transcripts, and sources with their ground rules.

- When the Story container is at least 1000px wide it is a nonmodal pane beside the article (in the rail's place; the article keeps at least ~580px). Below that it is a Sheet with **Back to article**. Either way focus returns to the button when it closes.
- A **verified** quote can be inserted as the Reported Quote block, keeping its attribution and its link to the transcript selection. An unverified quote says **Verify before inserting** and opens its transcript; an off-the-record one cannot be inserted. Notes can be copied. A transcript opens in full in its focused view. Nothing is inserted on its own.

## Focused views

| View | Reached from | Way back |
| --- | --- | --- |
| Review | the header's Review action or status link, a notification | Back to story (a decision also returns) |
| History | overflow menu → View history | Back to Plan / Back to Write |
| Transcript | Plan's Reporting, Reporting reference | Back to Plan |

History holds versions and restore, the Front Page, Distribution and corrections, the Story's notes and its full activity. The article stays mounted underneath all of them.

## Story details

Story details (overflow menu) is the secondary place for advanced settings: stage and publication state, the editor override, **Appearance** (presentation, headline position) and **Publishing** (schedule, the public URL and its redirects, publication checks). Routine reporting and workflow never move there.

## Where things moved from {#moved}

The Story used to be one page with a Story Context rail and Reporting as a focused mode (and, optionally, a legacy Write / Plan / Production / History tab bar). The legacy view is retired; its stored preference is ignored.

| Before | Now |
| --- | --- |
| Reporting button and `?view=reporting` | Plan → Reporting |
| Story Context (rail or Sheet): Angle, reporting, media, checklist | Plan → Story brief / Reporting / To do; still a rail beside Write when wide |
| The article's Quotes Sheet | Write → Reporting reference |
| Production (media assignments) | Plan → To do |
| Lead image, captions, alt text | Write |
| Presentation, URL, publication checks | Story details → Appearance / Publishing |
| Review | the header's Review action and status link |
| Social and newsletter distribution | the Distribution Center, and History |

## Responsive {#responsive}

Layout follows the Story container's measured width, never the device. Checked at 390, 600 (a narrow iPad Split View window), 820, 1024, 1194 and 1440px: no horizontal scrolling, both tabs and the primary action on screen, touch-sized tabs, and nothing essential behind an unlabelled icon.

## Peek {#peek}

Opening a Story from the Board or a list can preview it first. Peek is deliberately light: identity and stage, writers, editor and deadline (editable where the reader is allowed), **Next** from Story Attention, **Preview** when the Story has a public URL, and **Open story**. Tasks, reporting, files and activity belong to the Story.

## Board

The Stories Board has one column per lifecycle stage (On Hold and Dropped are columns too; empty ones collapse). Cards can be dragged, and always have a **Move to** menu so dragging is never required. Staff are not offered Review or Ready. A card shows its one main signal.

## Forms inside the Story

The Story screen renders inside Payload's document form, so a native `<form>` submit would be caught by it and reload the Story. Inline composers (note, link, transcript, review reply) use `InlineForm`: explicit `type="button"` saves, Enter saves single-line fields, Cmd/Ctrl+Enter saves multi-line ones, Escape cancels. Dialogs and Sheets that portal out of the document form may use a normal form.
