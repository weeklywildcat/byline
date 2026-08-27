# Byline admin navigation

Byline's WordPress admin uses native `wp-admin` navigation for major
destinations. React remains the rendering layer for the application pages, but
it no longer owns primary navigation or route state.

## Final menu structure

The plugin registers one top-level menu with `add_menu_page()` and its
application pages with `add_submenu_page()`:

| Menu item | Destination | Capability |
| --- | --- | --- |
| Dashboard | `admin.php?page=byline` | `manage_byline` |
| Studio | `admin.php?page=byline-studio` | `edit_byline_design` |
| Publication | `admin.php?page=byline-publication` | `manage_byline` |
| Theme | `admin.php?page=byline-theme` | `manage_byline` |
| Integrations | `admin.php?page=byline-integrations` | `manage_byline_integrations` |
| Settings | `admin.php?page=byline-settings` | `manage_byline` |
| Polls (when enabled) | `admin.php?page=byline-polls` | `edit_posts` |
| Teams (when sports is enabled) | `admin.php?page=byline-teams` | `manage_byline` |

Games, Rosters, and Events use native WordPress post-type management screens
and are registered beneath the Byline menu with `show_in_menu => 'byline'`.
Authors remain in the native Users screen. Game import/export and roster
import/export remain native WordPress admin utility pages.

## Local tabs and views

Related settings use stable query-string state:

- Publication: `tab=identity`, `branding`, `navigation`, or `social`
- Integrations: `tab=discord` or `deployment`; the Discord tab is where the
  connection is configured, and it appears only while the Discord module is
  enabled
- Settings: `tab=access`, `api`, `compatibility`, or `diagnostics`
- Studio: `view=revisions` for Revisions; the default view is the editor

Each page renders one `h1`, WordPress-compatible notices, and standard `.wrap`
spacing. Local tabs use WordPress's `nav-tab` pattern and do not replace the
WordPress sidebar.

## Legacy links and active state

Bookmarked hash routes on the former `admin.php?page=byline#/...` SPA are
translated once in the browser to their corresponding native page URL. Hash
state is not used for ongoing navigation. Unknown legacy hashes fall back to
the Dashboard.

The old Team Settings URL and the legacy `wwh-settings` options page remain
callable for compatibility. Their visible menu placement is no longer used as
the primary Byline navigation. `parent_file` and `submenu_file` filters keep
native Byline highlighting correct for Byline-owned CPTs and their utility
screens.

## Capabilities and editor tooling

Menu capabilities are deliberately split across the existing Byline
capabilities. Page callbacks independently check the same capability, and REST
permissions remain unchanged. The top-level menu uses the first capability the
current user can exercise so a design-only or integration-only user can still
reach an allowed page; the Dashboard callback redirects such users to their
allowed landing page.

The implementation uses mature WordPress admin APIs (`add_menu_page`,
`add_submenu_page`, `show_in_menu`, and admin parent/submenu filters). It does
not depend on an experimental WordPress admin router or arbitrary DOM removal
of WordPress chrome. Studio keeps its deliberate Puck workspace, adds a clear
Back to Byline link, and uses its existing panel toggles; on narrow screens
the toolbar wraps instead of introducing a second navigation sidebar.
