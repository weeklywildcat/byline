# Admin navigation

WordPress owns the sidebar. Byline does not add a second global navigation shell inside its React screens.

## Destinations

- Posts, Media, Pages, and Users remain native WordPress screens.
- Byline is the first sidebar menu, above Dashboard. It contains Home, Today, Stories, Calendar, Media Desk, Collections, Content Health, Feedback, and Settings, in that order. The Planning destinations retain their existing `admin.php?page=byline-planning&tab=...` URLs; Planning no longer has a separate top-level menu. Old Coverage bookmarks resolve to Collections; Performance bookmarks resolve to Today. Public `/coverage/` routes are unchanged.
- Polls is a native post type with its own capability family and menu.
- School Events retains its native post type, editor, and menu when enabled.
- Newsletters provides Issues when the module is enabled and the user has publishing or editorial permissions. Provider settings live in Byline Settings.
- Settings contains publication, integration, access, API, compatibility, and diagnostics sections. Former Publication, Integrations, and Byline Doctor links resolve to the corresponding Settings section.

The Studio, Theme, and custom Sports menus have been removed. Historical games and rosters are converted to normal Pages, grouped by sport and season. There are no Games, Teams, Rosters, schedule imports/exports, or bulk reset screens. See [sports archive](sports-archive.md).

## Permissions

The combined Byline menu is visible to users who can edit posts, manage Byline, or manage its integrations. Planning destinations require `edit_posts`; Feedback follows the protected feedback REST capability. Home requires `manage_byline`; writers entering its URL are redirected to Today. Settings remains restricted to publication or integration managers, and individual sections retain their own permissions. Polls uses its mapped poll capabilities. Every callback checks its capability independently of whether a menu item is visible.

Byline's top-level entry resolves to a capability the current user actually holds. An integration manager lands in Settings; a writer lands in Today. Retired design capabilities alone grant no admin destination.

Contributors use Today instead of the native WordPress Dashboard: its sidebar entry is hidden and Dashboard visits, including the default post-login landing, redirect to Today. Other admin screens remain available under their existing permissions. Users who also hold editorial, WordPress administration, or Byline management privileges keep Dashboard; network and user administration are unaffected.

Newsletter issues require `publish_posts` or `edit_others_posts` across the sidebar, direct screen URLs, command palette, and REST API. Contributors cannot list, read, create, update, delete, or deliver newsletter issues, including drafts they previously owned. Authors with publishing access and editors retain issue access; provider settings still require `manage_byline_integrations`.

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


## Payload migration: People and My profile

The private Payload newsroom has its own single Nova shell; the WordPress
navigation above remains unchanged while WordPress is production authority.
People follows Collections in the editor/administrator primary navigation at
`/admin/people`; ordinary Staff accounts do not see or list that directory.
Selected People use `?person=<id>` with URL-based list views and Back/Forward.
People always keeps the normal global sidebar.

Enabled accounts with a valid linked Person get **My profile** at
`/admin/profile` in NavUser. It is the same Person editor with actual self-service
capabilities. Unlinked accounts get an explanation on direct visits. Raw People
and sign-in Accounts stay administrator-only System administration fallbacks.
New person belongs on People, never global Create. Account menu navigation and
sign-out respect the shell's unsaved-work guard. See [People workspace](people-workspace.md).


## Payload migration: sidebar compositions

The Payload newsroom has one sidebar whose composition follows the screen
(`ShellComposition` in `apps/newsroom/src/ui/shell/layout.tsx`); each workspace
has its own measured breakpoint and, below it, keeps the ordinary 256px sidebar
and offers its context in a sheet:

- `default`: the ordinary sidebar.
- `story-workspace`: a saved story's screen: icon rail plus the Story switcher.
- `stories-workspace`: Stories: icon rail plus Views, Stages and Writers with
  counts (300px, from 1340px). See [Stories and Planning UI](stories-planning-ui.md).
- `calendar-workspace`: the Calendar: icon rail plus its controls.
- `media-workspace`: Media: icon rail plus the Media navigator.
- `collection-workspace`: an open Collection: icon rail plus the switcher.


## Payload migration: Publish group and Field Mode

Editors' primary navigation has a **Publish** group for the desks that
coordinate many Stories: **Front Page** (`/admin/front-page`, see
[front page](front-page.md)) and **Content Health** (moved there from the
account menu). Ordinary Story-level work (Reporting, the Story's Front page
status and Feature action) stays on the Story itself. There is no Studio.

**Field Mode** (`/admin/field`, see [Field Mode](field-mode.md)) is a separate,
reporter-oriented entry in the account menu and ⌘K, with its own small shell.
Reporting is not a global destination: it is the Story screen's Reporting tab.
