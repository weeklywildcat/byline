# Admin navigation

WordPress owns the sidebar. Byline does not add a second global navigation shell inside its React screens.

## Destinations

- Posts, Media, Pages, and Users remain native WordPress screens.
- Byline is the first sidebar menu, above Dashboard. It contains Home, Today, Stories, Calendar, Media Desk, Coverage, Performance, Content Health, Feedback, and Settings, in that order. The Planning destinations retain their existing `admin.php?page=byline-planning&tab=...` URLs; Planning no longer has a separate top-level menu.
- Polls is a native post type with its own capability family and menu.
- School Events retains its native post type, editor, and menu when enabled.
- Newsletters provides Issues and Settings when the module is enabled.
- Settings contains publication, integration, access, API, compatibility, and diagnostics sections. Former Publication, Integrations, and Byline Doctor links resolve to the corresponding Settings section.

The Studio, Theme, and custom Sports menus have been removed. Historical games and rosters are converted to normal Pages, grouped by sport and season. There are no Games, Teams, Rosters, schedule imports/exports, or bulk reset screens. See [sports archive](sports-archive.md).

## Permissions

The combined Byline menu is visible to users who can edit posts, manage Byline, or manage its integrations. Planning destinations require `edit_posts`; Feedback follows the protected feedback REST capability. Home requires `manage_byline`; writers entering its URL are redirected to Today. Settings remains restricted to publication or integration managers, and individual sections retain their own permissions. Polls uses its mapped poll capabilities. Every callback checks its capability independently of whether a menu item is visible.

Byline's top-level entry resolves to a capability the current user actually holds. An integration manager lands in Settings; a writer lands in Today. Retired design capabilities alone grant no admin destination.

Archived sports post types remain registered privately with `show_ui` and `show_in_rest` disabled and editing/deletion capabilities set to `do_not_allow`. Normal archive Pages use the ordinary Page editor for corrections. Public sports REST read aliases remain available for existing article embeds and data consumers.

## URLs and compatibility

| Destination | URL |
| --- | --- |
| Home | `admin.php?page=byline` |
| Today | `admin.php?page=byline-planning&tab=today` |
| Publication | `admin.php?page=byline-publication&tab=identity` |
| Integrations | `admin.php?page=byline-integrations&tab=deployment` |
| Settings | `admin.php?page=byline-settings&tab=access` |
| Doctor | `admin.php?page=byline-settings&tab=diagnostics` |
| Polls | `edit.php?post_type=byline_poll` |
| Events | `edit.php?post_type=ww_school_event` |
| Sports archive Pages | `edit.php?post_type=page&s=Sports+Archive` |

Former Byline-owned Polls links redirect to the native Polls list. Former Teams links open the archive Pages list. The old hash parser translates known bookmarks to current native screens; retired Studio destinations resolve to Home. Current screens do not use hash state for navigation.

`parent_file` and `submenu_file` keep Byline open and highlight the selected Planning destination or Settings entry, including direct story-workspace links. Unrelated WordPress screens, including those passing `null`, retain their existing values. Feature flags gate optional workflows without changing stored content or legacy identifiers.

Run `npm run test:php` for callback registration, navigation, capability, archive-conversion, and WordPress smoke regressions.
