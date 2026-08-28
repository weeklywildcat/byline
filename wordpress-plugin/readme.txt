=== Byline ===
Contributors: weeklywildcat
Tags: newsroom, editorial, journalism, headless, student-journalism
Requires at least: 6.6
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.2.11
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
