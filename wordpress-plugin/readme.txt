=== Byline ===
Contributors: weeklywildcat
Tags: newsroom, editorial, journalism, headless, student-journalism
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.3.32
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Publishing tools and integrations for the Weekly Wildcat newsroom.

== Description ==

Byline turns WordPress into the control plane for a student newsroom. WordPress
stays canonical for stories, people, pages, sports, events, polls, publication
and settings; the public site is built separately as a static export.

Byline adds an editorial workflow that is deliberately separate from the
WordPress publication state, a fixed Weekly Wildcat homepage, sports and events
modules, native polls, and an optional Discord newsroom integration.

== Changelog ==

= 0.3.32 =

* Fix author social-link fields and public X links (#161)

= 0.3.31 =

* Move Planning to shadcn base-nova with Pragmatic DnD and Schedule-X (#163)

= 0.3.30 =

* Move Home and Story Workspace to shadcn base-nova (#160)

= 0.3.29 =

* Improve Story sidebar layout and panel navigation (#158)

= 0.3.28 =

* Redesign Byline Home with shadcn Mira (#155)

= 0.3.27 =

* Fix CI after the visual storytelling merge (#156)

= 0.3.26 =

* Visual storytelling overhaul: preview parity, photo and editor fixes, five redesigned tools (#153)

= 0.3.25 =

* Unify Byline settings into one configuration workspace (#154)

= 0.3.24 =

* Link Staff instead of Leadership in the footer (#150)

= 0.3.23 =

* Use Libre Franklin for author role (#148)

= 0.3.22 =

* Replace notification preference list with cards (#147)

= 0.3.21 =

* Add short author bios and refine article author cards (#145)

= 0.3.20 =

* Standard/Immersive story presentation option in WordPress (#142)

= 0.3.19 =

* Per-story custom presentation overrides by WordPress post ID (#141)

= 0.3.18 =

* Prepare revision-safe WordPress snapshots and reuse unchanged Astro pages (#139)

= 0.3.17 =

* Print photo credits on inline article images (#140)

= 0.3.16 =

* Add immersive newsroom storytelling tools (#135)

= 0.3.15 =

* Deliver Photo Gallery images sharply and expose full originals to the lightbox and Google (#137)

= 0.3.14 =

* Credit photos to their creator instead of the camera owner (#133)

= 0.3.13 =

* Add newsroom story presentations across editor, preview, and Astro (#132)

= 0.3.12 =

* Move the author directory to /staff/ and redirect /authors/ (#131)

= 0.3.11 =

* Set opinion headlines in Libre Caslon Condensed (#123)e

= 0.3.10 =

* Restore the article author block, without the bio (#130)

= 0.3.9 =

* Per-writer coverage, drop About the Writer, tidy article rules (#122)

= 0.3.8 =

* Pre-launch SEO hardening for the Astro site (#124)

= 0.3.7 =

* Serve sports archive redirects from _redirects (400 → 65 pages) and add wrangler previews block (#125)

= 0.3.6 =

* Fix Choose Photo on the Guest Contributors screen (#120)

= 0.3.5 =

* Fix the critical error when saving a guest, Choose Photo, and missing sidebar photos (#119)

= 0.3.4 =

* Add a Guest Contributors screen under Users with edit, delete and merge (#118)

= 0.3.3 =

* Use a bold B icon for the Story sidebar (#117)

= 0.3.2 =

* Send logged-out CMS visitors straight to the login page (#115)

= 0.3.1 =

**Adds one-off guest contributors to the Story sidebar and retires the Founder
badge.**

* Adds an "Add a new guest" form to the Authors and contributors panel in the
  Post editor. Enter a name, an optional role, and a photo from the Media
  Library to credit someone who is not on staff, such as a yearbook
  photographer, without leaving the story. The guest picker now lists existing
  guests too, and editors who cannot publish create guests as drafts that a
  publisher publishes before they appear on the site.
* Guests can be credited without a profile page, which is the default for
  one-offs. They appear by name and photo only: no author link, no entry in the
  authors directory, and no profile URL in the sitemap or article metadata.
  Guests created before this release keep their profile pages.
* Two guests with the same name now get distinct profile addresses
  automatically.
* The contributor list uses the WordPress admin font and compact icon buttons
  for reordering and removing.
* Removes the Founder badge, including the checkbox on the WordPress user
  profile. Existing saved values are left in place and are no longer used.
* Matches the editor's post title size to the smaller article headline.
* New installs default the header Sports link to the Sports category and add
  an Open Source link to the footer. Existing menus are unchanged.

= 0.3.0 =

**Keeps the Weekly Wildcat homepage in code and turns the sports records into
a fixed archive.**

* Retires Byline Studio, generic themes, and design publishing and scheduling.
  The homepage layout and the Weekly Wildcat theme now live in code. Stored
  historical designs are kept.
* Retires the Games, Teams, Rosters, import/export, reset, and game-linking
  editors. On upgrade, published sports records are converted once into
  normal WordPress Pages: an archive index and one Page per sport, grouped by
  season and team level. Source records are preserved, later Page edits are
  left alone, and existing embeds and public read aliases keep working.
* Styles the block editor for Posts like the public article: Erode headlines,
  Newsreader body text at the article width, and the site's headings, quotes,
  lists, images, and captions in Weekly Wildcat colors. Pages and the classic
  editor are unchanged.
* Widens the Story sidebar in the Post editor so the workflow, dates, and task
  controls have room. Narrow windows keep the native width.
* Article and editor previews use the refreshed Weekly Wildcat fonts.

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

= 0.3.32 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.31 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.30 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.29 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.28 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.27 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.26 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.25 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.24 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.23 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.22 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.21 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.20 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.19 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.18 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.17 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.16 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.15 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.14 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.13 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.12 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.11 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.10 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.9 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.8 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.7 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.6 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.5 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.4 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.3 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.2 =
Maintenance and feature update. Nothing needs reconfiguring after updating.

= 0.3.1 =
Adds one-off guest contributors to the Story sidebar. Nothing needs
reconfiguring: existing guests keep their profile pages, and the Founder badge
checkbox is removed from user profiles.

= 0.3.0 =
Studio and the custom sports editors are retired. After updating, open
WordPress admin once so the sports records convert to archive Pages; Byline
Doctor reports when the conversion has finished. Source records, public URLs,
and embeds are preserved.

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
