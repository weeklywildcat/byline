=== Byline ===
Contributors: weeklywildcat
Tags: newsroom, editorial, journalism, headless, student-journalism
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.2.15
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Open-source publishing tools, design management, and integrations for student newsrooms.

== Description ==

Byline turns WordPress into the control plane for a student newsroom. WordPress
stays canonical for stories, people, pages, sports, events, polls, publication
settings, and designs; the public site is built separately as a static export.

Byline adds an editorial workflow that is deliberately separate from the
WordPress publication state, a Studio for homepage design, sports and events
modules, native polls, and an optional Discord newsroom integration.

== Changelog ==

= 0.2.15 =

**Makes the WordPress sidebar the only place you navigate Byline.**

* Removes the Byline header that repeated the sidebar as HOME, WORK, DESK,
  INSIGHTS, DESIGN, and SETTINGS groups, leaving one persistent navigation
  beneath WordPress's own admin chrome.
* Adds Planning's destinations - Today, Stories, Calendar, Media Desk,
  Coverage, Performance, Content Health, and Feedback - and Byline Doctor as
  native sidebar entries, each highlighting itself on direct links, refresh,
  and browser back.
* Keeps local tabs only for views of a screen: Stories keeps Board, List, and
  Calendar, and Settings keeps Access, API, and Compatibility.
* Serves author profile photos at full size instead of the medium size.

= 0.2.14 =

**Makes the newsroom admin reliable end to end: safe, reversible actions,
durable notifications, and a preview that matches the published site.**

* Adds durable editorial notifications with transition context, plus due-date
  reminders that fail locally instead of breaking the surrounding screen.
* Adds a protected, theme-aware article preview that shares the public article
  presentation renderer, so preview matches the published page.
* Connects Media Desk attachment controls with deterministic REST
  reconciliation, and protects featured images during media unlink.
* Adds a Planning story quick view and precise navigation from Content Health
  fixes to the exact story panel.
* Tracks deployment revisions durably, honors exact deployment state on the
  dashboard and in the editor status, and surfaces and explains stale public
  revisions in Home and Doctor.
* Makes admin actions safe and reversible by serializing editorial workflow
  mutations and rolling back grouped updates on failure.
* Adds an optional WordPress Abilities adapter and makes plugin archives
  reproducible.
* Adds a getting started guide, static deployment provider recipes, and
  editorial collaboration ownership docs.

= 0.2.13 =

**Adds the newsroom OS planning, coverage, and distribution surfaces, and
hardens their permissions.**

* Adds Planning Board, List, and Calendar views with saved views, plus Media
  Desk, Coverage, Feedback, Performance, Content Health, and a command palette,
  all behind protected REST contracts.
* Adds editorial workflow panels for tasks, readiness, contributors and guest
  bylines, corrections, distribution, and reader feedback.
* Adds public Coverage and Corrections routes and a static-export-safe search
  with facets, typo-tolerant matching, URL state, and safe highlighting.
* Adds newsletter issues with provider adapters, immutable snapshots,
  scheduling and idempotency, and privacy-safe integration boundaries.
* Adds Studio design scheduling with conflict, rebase, and cancel flows, diff
  review, and Coverage-aware preview resolution.
* Hardens newsroom permissions with object-level filtering, publisher-only
  delivery, and private feedback and guest controls.
* Preserves locally voted poll answers during full migrations and reports the
  retained answers.
* Sports now picks the nearest and latest dated game even when TBA or unsorted
  records come first, and bulk schedule and roster imports are restricted to
  editors or Byline managers.
* Restores the attachment image-credit REST callback.
* Discord tells you when a storyboard thread has no WordPress article yet and
  offers to create one, instead of showing an ambiguous permission error.
* The rule above the site footer now uses the publication's accent token
  instead of a fixed rainbow gradient.

= 0.2.12 =

**Restores normal-page design parity, expands the newsroom block library, and
makes Studio a real homepage editor.**

* Page Sections now save only their attributes and normal InnerBlocks; the
  section wrapper is server-rendered by WordPress so Gutenberg has one stable
  serialization contract.
* Existing #53-migrated Pages are repaired structurally without replacing
  editor-authored content, and top-level page actions use an editable Core
  Buttons style.
* Shared Page CSS restores the pre-Gutenberg section rhythm, featured callout
  treatment, and outlined page actions in both the editor and public export.
* Adds server-rendered newsroom blocks for stories, people, sports schedules,
  game scores, events, polls, and correction notices, with matching Page
  patterns and shared block styles.
* Studio now resolves the whole homepage document once per change through a
  single shared resolver, so packages no longer repeat articles or render
  sections the public site does not, and the editor uses the full-width admin
  canvas instead of the ordinary wp-admin content column.
* Rewrites the shared deck and blurb text helpers without backtracking regular
  expressions, so long publication excerpts no longer degrade quadratically.

= 0.2.11 =

**Adds native WordPress Pages and polishes editorial workflow navigation.**

* Published WordPress Pages are now the canonical source for normal-page routes,
  metadata, and sitemap entries.
* Adds the `byline/page-section` Gutenberg block, generic Page patterns, native
  excerpts, eyebrow metadata, and a Page editor settings panel.
* Existing Weekly Wildcat seed pages migrate safely to block markup, with health
  diagnostics and hash-gated migration to protect manually edited pages.
* Page and block styles are shared between the WordPress editor and public export.
* The editorial workflow editor now uses the WordPress list icon in the sidebar
  and More menu.

= 0.2.10 =

**Fixes homepage designs that could not be published.**

* A homepage saved by an older version of Byline could hold sections that
  version had no way to convert. Those sections were kept safe but were never
  reconsidered afterwards, so Studio went on reporting unconverted blocks and
  kept Publish disabled even once a later Byline understood every one of them.
* Studio now reconverts those preserved sections when it opens a design, puts
  them back in their original order, and tells you what it recovered. Publish
  becomes available again as soon as nothing is left unconverted.
* Recovery reaches recovered autosaves as well as published designs, so an
  affected homepage repairs itself on the next open. There is no need to delete
  a draft, rebuild the page, or remove sections by hand.
* Reopening a repaired design does not duplicate anything.
* Sections Byline genuinely cannot convert yet are still preserved untouched,
  and the notice now names them.

= 0.2.9 =

**Editorial workflow is now a first-class Byline domain.**

* Editorial workflow moved out of the Discord integration into its own domain.
  Discord is now a consumer of it rather than its owner, so an unreachable bot
  can no longer block saving a draft, changing a status, or publishing.
* The block editor gains a native Workflow sidebar and a Workflow row in the
  document Summary panel, next to — and distinct from — the WordPress
  publication status. It replaces the old publication-named workflow metabox.
* Workflow status, assigned editor, deadline, and visual needs are managed in
  one place. Anyone who can edit a story can move it through the workflow and
  record its visual needs; assigning an editor or setting a deadline requires
  the edit_others_posts capability.
* "Published" now follows the WordPress publication state instead of being
  selectable, and the stage a story was on beforehand is kept, so unpublishing
  recovers it rather than inventing a new one.
* The Posts list gains a Workflow column and a workflow filter.
* Sites not running the block editor keep a compact Byline Workflow metabox.
  The sidebar and the metabox are never both shown.
* Workflow values are internal newsroom information and are never exposed in a
  public REST response.
* Existing workflow data is preserved. Discord keeps the same status
  identifiers, slash commands, and Forum workflow tags.

**Removed: per-story presentation overrides.**

* The per-post Custom Article Hero has been removed. Every article now uses the
  standard article header, and the featured image remains the article's
  principal image. Existing hero settings are ignored; no content is changed.
* The per-post homepage opinion lead treatment has been removed. An individual
  article no longer changes the homepage's presentation. The Opinion package is
  unaffected and continues to render normally.
* Homepage designs saved while these settings existed continue to load.

== Upgrade Notice ==

= 0.2.15 =
Byline's admin navigation is now the WordPress sidebar alone. Every screen keeps
its existing URL, so bookmarks and deep links still work, and capabilities,
roles, and stored data are unchanged. Nothing needs reconfiguring after
updating.

= 0.2.14 =
Editorial notifications and deployment revisions are now stored durably, so the
dashboard, Home, and Doctor report the real published state and flag stale
public revisions after updating. Article preview is new and restricted to users
who can edit the story. Existing workflow, media, poll, and design data is
preserved.

= 0.2.13 =
Adds the newsroom planning, coverage, newsletter, and design-scheduling
surfaces. New capabilities are granted to existing editor and Byline manager
roles, so review who can publish newsletters and manage guest contributors
after updating. Existing workflow, poll, and design data is preserved.

= 0.2.12 =
Existing Page Sections are repaired automatically on the next administrator
request. Review the affected Pages after updating; malformed content is left
untouched and reported in Byline diagnostics. Studio recomputes homepage
previews with a shared document resolver, so open a homepage design once after
updating to confirm its packages look as expected.

= 0.2.11 =
Normal-page routes now come from published WordPress Pages. Existing seeded
pages migrate safely to the new block-based Page editor; review them in Pages
after updating. The editorial workflow editor also has an updated list icon.

= 0.2.10 =
Repairs homepage designs that were stuck with Publish disabled because sections
preserved by an older Byline were never reconverted. Affected homepages recover
themselves the next time Studio opens them, in their original order.

= 0.2.9 =
Editorial workflow is now a native block-editor sidebar and no longer lives in
the Discord integration; existing workflow data and Discord commands are
preserved. The per-story Custom Article Hero and homepage opinion lead
treatment are removed — affected articles now use the standard layouts.
