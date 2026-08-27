# Byline admin navigation

Byline's WordPress admin uses native `wp-admin` navigation. React remains the
rendering layer for Byline's own configuration screens, but it does not own
primary navigation or route state, and native post-type screens stay native.

## The organising principle

The WordPress sidebar expresses the user's **job**, not which plugin implements
a feature. "Implemented by Byline" does not mean "appears underneath Byline".

- Content and workflow concepts become first-class WordPress menus.
- Publication and platform configuration lives under `Byline`.

This mirrors how WordPress itself separates daily content work (Posts, Media,
Pages, Comments) from site administration (Appearance, Plugins, Users, Tools,
Settings).

## Final sidebar structure

```
Dashboard
Posts
Media
Pages
Comments
Studio                        26
Sports                        27
  Games / Add Game
  Rosters
  Import
  Export
  Teams
  Roster Import / Export
Polls                         28   (only when the polls feature is enabled)
  Polls / Add Poll
Events                        29   (only when the events feature is enabled)
--------------------------------   WordPress's administration boundary
Appearance
Plugins
Users
Tools
Settings
Byline                        100
  Overview
  Publication
  Theme
  Integrations
  Settings
```

### Menu positions

Core content menus occupy 5 (Posts) through 25 (Comments), and the first core
separator sits at 59. Byline's workflow menus therefore claim 26-29, reading as
a continuation of the content block without displacing core items. WordPress
advances to the next free slot when another plugin already holds a position, so
nothing here depends on exact numbering.

Byline configuration sits at 100, below the last core separator (99), which
places it after Settings (80) in the administration block.

## Capabilities

Each top-level menu carries its own minimum capability. Menu visibility is
never authorization: every page callback re-checks the same capability, and
REST permissions are unchanged.

| Menu | Capability |
| --- | --- |
| Studio | `edit_byline_design` |
| Sports | post-type capabilities (`edit_posts`); utilities keep their own |
| Polls | poll capabilities (`edit_byline_polls`, `publish_byline_polls`, ...) |
| Events | post-type capabilities (`edit_posts`) |
| Byline | `manage_byline`, or `manage_byline_integrations` |

Being able to edit posts is deliberately **not** enough to see the Byline
configuration menu, and being able to administer Byline does not by itself
grant Studio. This supports role shapes like a writer who sees only Posts,
Media, and Polls, or a design editor who sees Studio but no configuration.

## Screens and URLs

Canonical URLs are unchanged by the reparenting. Navigation hierarchy and URL
ownership are independent.

| Screen | URL |
| --- | --- |
| Studio | `admin.php?page=byline-studio` (`view=revisions` for Revisions) |
| Polls | `edit.php?post_type=byline_poll` |
| Byline Overview | `admin.php?page=byline` |
| Publication | `admin.php?page=byline-publication` |
| Theme | `admin.php?page=byline-theme` |
| Integrations | `admin.php?page=byline-integrations` |
| Settings | `admin.php?page=byline-settings` |
| Games | `edit.php?post_type=ww_sports_game` |
| Rosters | `edit.php?post_type=ww_sports_roster` |
| Events | `edit.php?post_type=ww_school_event` |
| Teams | `edit.php?post_type=ww_sports_game&page=wwh-sports-team-settings` |

`Overview` replaces the former Byline child named `Dashboard`, because
WordPress already owns a top-level Dashboard. The page renders the same
component.

Sports has no separate `Settings` child: the existing team management screen
*is* the sports settings screen, so it appears once, as `Teams`. No empty
screens were added to round out the outline.

## Menu ownership

The Sports Games post type owns the top-level `Sports` menu directly
(`show_in_menu => true` with a tuned `menu_name`/`all_items`), so clicking
`Sports` lands on the Games list rather than a synthetic dashboard. Rosters
attach with `show_in_menu => 'edit.php?post_type=ww_sports_game'`, and the
import/export/team utilities were already registered against that parent.
School Events own a top-level `Events` menu the same way, and the Byline Poll
post type owns `Polls`.

`Polls` was an informational screen before polls became WordPress content. The
retired `admin.php?page=byline-polls` URL now redirects to the poll list table
rather than duplicating a screen, exactly as the retired Byline-owned Teams page
redirects to Sports.

Authors intentionally remain in the native Users screen; Byline does not add an
Authors menu.

Themes stay under Byline rather than Appearance: Byline themes are publication
frontend design-system configuration, not WordPress PHP themes.

## Feature flags

`Sports`, `Polls`, and `Events` register only when the publication enables the
matching feature, and their utility submenus are gated the same way, so no dead
entries remain when a module is off. Capability checks are enforced separately
from feature flags.

## Legacy links and active state

Bookmarked hash routes from the former `admin.php?page=byline#/...` SPA are
translated once in the browser to their native page URL. The retired
`admin.php?page=byline-teams` URL redirects on `admin_init` to the canonical
Sports team screen rather than keeping a second copy of that screen alive. The
legacy `wwh-settings` options page remains callable.

`parent_file` and `submenu_file` filters keep highlighting correct for Rosters
and the sports utility screens; everything else highlights natively. Each
sports utility highlights **its own** entry rather than the Games list.

Both filters take and return nullable values. WordPress legitimately passes
`null` for `submenu_file` on many core screens, and a non-nullable signature
here caused the 0.2.5 production fatal. The regression suite asserts that both
filters accept `null` and hand unrelated screens — `plugins.php`, `users.php`,
`edit.php`, `options-general.php` — back exactly as they arrived.

## Constraints observed

The implementation uses only mature WordPress admin APIs (`add_menu_page`,
`add_submenu_page`, `register_post_type( ... show_in_menu ... )`, and admin
parent/submenu filters). It does not fabricate labelled sidebar sections,
mutate `$GLOBALS['menu']`, inject separator labels, rearrange the sidebar with
JavaScript, or style wp-admin navigation. Because the menus are native,
WordPress manages responsive collapse on narrow screens; there is no custom
Byline sidebar or second navigation shell.
