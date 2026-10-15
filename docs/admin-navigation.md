# Admin navigation

WordPress owns the sidebar. Byline does not add a second global navigation shell inside its React screens.

## Destinations

- Posts, Media, Pages, and Users remain native WordPress screens.
- Planning is the newsroom workflow menu. Today, Stories, Calendar, Media Desk, Coverage, Performance, Content Health, and Feedback are native submenu links to `admin.php?page=byline-planning&tab=...`.
- Polls is a native post type with its own capability family and menu.
- School Events retains its native post type, editor, and menu when enabled.
- Newsletters provides Issues and Settings when the module is enabled.
- Byline contains Home, Publication, Integrations, Settings, and Byline Doctor. Doctor is the diagnostics tab of Settings, with its own sidebar link.

The Studio, Theme, and custom Sports menus have been removed. Historical games and rosters are converted to normal Pages, grouped by sport and season. There are no Games, Teams, Rosters, schedule imports/exports, or bulk reset screens. See [sports archive](sports-archive.md).

## Permissions

Planning requires `edit_posts`; Feedback follows the protected feedback REST capability. Publication and Settings require `manage_byline`. Integrations requires `manage_byline_integrations`. Polls uses its mapped poll capabilities. Every callback checks its capability independently of whether a menu item is visible.

Byline's top-level configuration entry resolves to the capability the current user actually holds. An integration manager lands in Integrations; a writer lands in Planning. Retired design capabilities alone grant no admin destination.

Archived sports post types remain registered privately with `show_ui` and `show_in_rest` disabled and editing/deletion capabilities set to `do_not_allow`. Normal archive Pages use the ordinary Page editor for corrections. Public sports REST read aliases remain available for existing article embeds and data consumers.

## URLs and compatibility

| Destination | URL |
| --- | --- |
| Home | `admin.php?page=byline` |
| Planning | `admin.php?page=byline-planning&tab=today` |
| Publication | `admin.php?page=byline-publication&tab=identity` |
| Integrations | `admin.php?page=byline-integrations&tab=deployment` |
| Settings | `admin.php?page=byline-settings&tab=access` |
| Doctor | `admin.php?page=byline-settings&tab=diagnostics` |
| Polls | `edit.php?post_type=byline_poll` |
| Events | `edit.php?post_type=ww_school_event` |
| Sports archive Pages | `edit.php?post_type=page&s=Sports+Archive` |

Former Byline-owned Polls links redirect to the native Polls list. Former Teams links open the archive Pages list. The old hash parser translates known bookmarks to current native screens; retired Studio destinations resolve to Home. Current screens do not use hash state for navigation.

`parent_file` and `submenu_file` keep Planning, Doctor, and configuration highlighting consistent. Unrelated WordPress screens, including those passing `null`, retain their existing values. Feature flags gate optional workflows without changing stored content or legacy identifiers.

Run `npm run test:php` for callback registration, navigation, capability, archive-conversion, and WordPress smoke regressions.
