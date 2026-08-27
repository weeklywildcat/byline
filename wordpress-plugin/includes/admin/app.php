<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_ADMIN_PAGE = 'byline';
const BYLINE_ADMIN_STUDIO_PAGE = 'byline-studio';
const BYLINE_ADMIN_PUBLICATION_PAGE = 'byline-publication';
const BYLINE_ADMIN_THEME_PAGE = 'byline-theme';
const BYLINE_ADMIN_INTEGRATIONS_PAGE = 'byline-integrations';
const BYLINE_ADMIN_SETTINGS_PAGE = 'byline-settings';
const BYLINE_ADMIN_POLLS_PAGE = 'byline-polls';
// Retained only so bookmarked links to the former Byline-owned Teams screen
// can be translated to their canonical Sports destination.
const BYLINE_ADMIN_LEGACY_TEAMS_PAGE = 'byline-teams';

/**
 * Sports content and utility screens hang off the Sports Games post type,
 * which is now its own top-level menu. Kept as a function because the post
 * type constant is defined after this file is loaded.
 */
function byline_sports_menu_parent(): string
{
    return 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE;
}

function byline_sports_team_settings_url(): string
{
    return admin_url(byline_sports_menu_parent() . '&page=wwh-sports-team-settings');
}

/**
 * Polls are a real post type now, so the Polls destination is its native list
 * table. Kept as a function for the same reason as the sports parent: the post
 * type constant is defined after this file is loaded.
 */
function byline_admin_polls_url(): string
{
    return admin_url('edit.php?post_type=' . BYLINE_POLL_POST_TYPE);
}

/**
 * Return the capability for a Byline page. This is also used by the page
 * callback so a hidden menu entry can never become an authorization check.
 */
function byline_admin_page_capability(string $page): string
{
    $capabilities = [
        BYLINE_ADMIN_PAGE => BYLINE_MANAGE_CAPABILITY,
        BYLINE_ADMIN_STUDIO_PAGE => BYLINE_EDIT_DESIGN_CAPABILITY,
        BYLINE_ADMIN_PUBLICATION_PAGE => BYLINE_MANAGE_CAPABILITY,
        BYLINE_ADMIN_THEME_PAGE => BYLINE_MANAGE_CAPABILITY,
        BYLINE_ADMIN_INTEGRATIONS_PAGE => BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
        BYLINE_ADMIN_SETTINGS_PAGE => BYLINE_MANAGE_CAPABILITY,
        // Retained for the redirect below; polls themselves use their own
        // mapped capability family, not a generic post capability.
        BYLINE_ADMIN_POLLS_PAGE => 'edit_byline_polls',
    ];

    return $capabilities[$page] ?? BYLINE_MANAGE_CAPABILITY;
}

function byline_admin_feature_enabled(string $feature): bool
{
    $publication = byline_get_publication_config();
    return !empty($publication['features'][$feature]);
}

/**
 * Byline's own top-level menu is publication/platform configuration only.
 * Newsroom workflows (Studio, Sports, Polls, Events) are first-class WordPress
 * menus of their own and are deliberately not listed here.
 */
function byline_admin_page_definitions(): array
{
    $pages = [
        BYLINE_ADMIN_PAGE => [
            'page_title' => 'Byline Overview',
            // WordPress already owns a top-level "Dashboard"; this one is an
            // overview of the publication, not a second dashboard.
            'menu_title' => 'Overview',
            'capability' => BYLINE_MANAGE_CAPABILITY,
            'callback' => 'byline_render_admin_app',
        ],
        BYLINE_ADMIN_PUBLICATION_PAGE => [
            'page_title' => 'Publication',
            'menu_title' => 'Publication',
            'capability' => BYLINE_MANAGE_CAPABILITY,
            'callback' => 'byline_render_admin_app',
        ],
        BYLINE_ADMIN_THEME_PAGE => [
            'page_title' => 'Theme',
            'menu_title' => 'Theme',
            // Byline themes are publication design-system configuration, not
            // WordPress PHP themes, so they stay out of Appearance.
            // Theme writes are part of the publication REST document, whose
            // existing write capability is manage_byline.
            'capability' => BYLINE_MANAGE_CAPABILITY,
            'callback' => 'byline_render_admin_app',
        ],
        BYLINE_ADMIN_INTEGRATIONS_PAGE => [
            'page_title' => 'Integrations',
            'menu_title' => 'Integrations',
            'capability' => BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
            'callback' => 'byline_render_admin_app',
        ],
        BYLINE_ADMIN_SETTINGS_PAGE => [
            'page_title' => 'Settings',
            'menu_title' => 'Settings',
            'capability' => BYLINE_MANAGE_CAPABILITY,
            'callback' => 'byline_render_admin_app',
        ],
    ];

    return apply_filters('byline_admin_page_definitions', $pages);
}

/**
 * Byline is configuration, so its top-level entry is visible to a user who can
 * administer the publication or its integrations. Being able to edit posts or
 * design pages is deliberately not enough. Individual submenu registrations
 * still carry their own minimum capability and every callback checks it again.
 */
function byline_admin_menu_capability(): string
{
    foreach ([
        BYLINE_MANAGE_CAPABILITY,
        BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
    ] as $capability) {
        if (current_user_can($capability)) {
            return $capability;
        }
    }

    return BYLINE_MANAGE_CAPABILITY;
}

/**
 * Menu positions.
 *
 * Core content menus occupy 5 (Posts) through 25 (Comments), and the first
 * separator sits at 59. Byline's newsroom workflows therefore claim 26-29 so
 * they read as a continuation of the content block without displacing core.
 *
 * Byline configuration sits at 100, below the last core separator (99), which
 * places it after Settings (80) in the administration block.
 */
const BYLINE_MENU_POSITION_STUDIO = 26;
const BYLINE_MENU_POSITION_SPORTS = 27;
// Claimed by the byline_poll post type's own top-level menu.
const BYLINE_MENU_POSITION_POLLS = 28;
const BYLINE_MENU_POSITION_EVENTS = 29;
const BYLINE_MENU_POSITION_CONFIG = 100;

function byline_register_admin_app(): void
{
    // Studio is a design workflow, not publication configuration.
    add_menu_page(
        'Byline Studio',
        'Studio',
        BYLINE_EDIT_DESIGN_CAPABILITY,
        BYLINE_ADMIN_STUDIO_PAGE,
        'byline_render_admin_app',
        'dashicons-art',
        BYLINE_MENU_POSITION_STUDIO
    );

    add_menu_page(
        'Byline',
        'Byline',
        byline_admin_menu_capability(),
        BYLINE_ADMIN_PAGE,
        'byline_render_admin_app',
        'dashicons-welcome-write-blog',
        BYLINE_MENU_POSITION_CONFIG
    );

    foreach (byline_admin_page_definitions() as $slug => $page) {
        add_submenu_page(
            BYLINE_ADMIN_PAGE,
            $page['page_title'],
            $page['menu_title'],
            $page['capability'],
            $slug,
            $page['callback']
        );
    }
}
add_action('admin_menu', 'byline_register_admin_app');

/**
 * The Sports team screen was previously duplicated as a Byline-owned page.
 * Sports now owns it outright, so translate the retired URL instead of
 * maintaining a second copy of the screen.
 */
function byline_admin_redirect_legacy_pages(): void
{
    if (wp_doing_ajax() || byline_admin_current_page() !== BYLINE_ADMIN_LEGACY_TEAMS_PAGE) {
        return;
    }

    wp_safe_redirect(byline_sports_team_settings_url());
    exit;
}
add_action('admin_init', 'byline_admin_redirect_legacy_pages');

function byline_admin_page_url(string $page, array $args = []): string
{
    return add_query_arg(array_merge(['page' => $page], $args), admin_url('admin.php'));
}

function byline_admin_page_urls(): array
{
    return [
        'dashboard' => byline_admin_page_url(BYLINE_ADMIN_PAGE),
        'studio' => byline_admin_page_url(BYLINE_ADMIN_STUDIO_PAGE),
        'studioRevisions' => byline_admin_page_url(BYLINE_ADMIN_STUDIO_PAGE, ['view' => 'revisions']),
        'theme' => byline_admin_page_url(BYLINE_ADMIN_THEME_PAGE),
        'publication' => [
            'identity' => byline_admin_page_url(BYLINE_ADMIN_PUBLICATION_PAGE, ['tab' => 'identity']),
            'branding' => byline_admin_page_url(BYLINE_ADMIN_PUBLICATION_PAGE, ['tab' => 'branding']),
            'navigation' => byline_admin_page_url(BYLINE_ADMIN_PUBLICATION_PAGE, ['tab' => 'navigation']),
            'social' => byline_admin_page_url(BYLINE_ADMIN_PUBLICATION_PAGE, ['tab' => 'social']),
        ],
        'integrations' => [
            'discord' => byline_admin_page_url(BYLINE_ADMIN_INTEGRATIONS_PAGE, ['tab' => 'discord']),
            'deployment' => byline_admin_page_url(BYLINE_ADMIN_INTEGRATIONS_PAGE, ['tab' => 'deployment']),
        ],
        'settings' => [
            'access' => byline_admin_page_url(BYLINE_ADMIN_SETTINGS_PAGE, ['tab' => 'access']),
            'api' => byline_admin_page_url(BYLINE_ADMIN_SETTINGS_PAGE, ['tab' => 'api']),
            'compatibility' => byline_admin_page_url(BYLINE_ADMIN_SETTINGS_PAGE, ['tab' => 'compatibility']),
            'diagnostics' => byline_admin_page_url(BYLINE_ADMIN_SETTINGS_PAGE, ['tab' => 'diagnostics']),
        ],
        'polls' => byline_admin_polls_url(),
        'teams' => byline_sports_team_settings_url(),
    ];
}

function byline_admin_native_urls(): array
{
    return [
        // Authors intentionally remain in the native Users screen.
        'authors' => admin_url('users.php'),
        'teams' => byline_sports_team_settings_url(),
        'legacyTeams' => byline_admin_page_url(BYLINE_ADMIN_LEGACY_TEAMS_PAGE),
        'polls' => byline_admin_polls_url(),
        'legacyPolls' => byline_admin_page_url(BYLINE_ADMIN_POLLS_PAGE),
        'games' => admin_url(byline_sports_menu_parent()),
        'sportsImport' => admin_url(byline_sports_menu_parent() . '&page=wwh-sports-import'),
        'sportsExport' => admin_url(byline_sports_menu_parent() . '&page=wwh-sports-export'),
        'rosters' => admin_url('edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE),
        'events' => admin_url('edit.php?post_type=' . WWH_SCHOOL_EVENT_POST_TYPE),
        'legacySettings' => admin_url('options-general.php?page=wwh-settings'),
    ];
}

function byline_admin_legacy_hash_urls(array $page_urls): array
{
    return [
        '/dashboard' => $page_urls['dashboard'],
        '/publication/identity' => $page_urls['publication']['identity'],
        '/publication/branding' => $page_urls['publication']['branding'],
        '/publication/navigation' => $page_urls['publication']['navigation'],
        '/publication/social' => $page_urls['publication']['social'],
        '/design/theme' => $page_urls['theme'],
        '/design/studio' => $page_urls['studio'],
        '/design/revisions' => $page_urls['studioRevisions'],
        '/content/polls' => $page_urls['polls'],
        '/content/teams' => $page_urls['teams'],
        '/sports/teams' => $page_urls['teams'],
        '/integrations/discord' => $page_urls['integrations']['discord'],
        '/integrations/deployment' => $page_urls['integrations']['deployment'],
        '/advanced/access' => $page_urls['settings']['access'],
        '/advanced/api' => $page_urls['settings']['api'],
        '/advanced/compatibility' => $page_urls['settings']['compatibility'],
        '/advanced/diagnostics' => $page_urls['settings']['diagnostics'],
    ];
}

function byline_admin_current_page(): string
{
    return byline_admin_query_key('page');
}

function byline_admin_query_key(string $key): string
{
    if (!isset($_GET[$key]) || !is_scalar($_GET[$key])) {
        return '';
    }

    return sanitize_key((string) wp_unslash((string) $_GET[$key]));
}

function byline_admin_user_landing_url(): string
{
    if (current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        return byline_admin_page_url(BYLINE_ADMIN_PAGE);
    }

    if (current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY)) {
        return byline_admin_page_url(BYLINE_ADMIN_STUDIO_PAGE);
    }

    if (current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY)) {
        return byline_admin_page_url(BYLINE_ADMIN_INTEGRATIONS_PAGE);
    }

    if (current_user_can('edit_byline_polls') && byline_admin_feature_enabled('polls')) {
        return byline_admin_polls_url();
    }

    if (current_user_can('edit_posts') && byline_admin_feature_enabled('sports')) {
        return byline_admin_native_urls()['games'];
    }

    return '';
}

function byline_render_admin_app(): void
{
    $page = byline_admin_current_page() ?: BYLINE_ADMIN_PAGE;
    $capability = byline_admin_page_capability($page);

    // The top-level menu can be visible to a design/integration/content editor
    // even when the Dashboard itself is not available to that user.
    if ($page === BYLINE_ADMIN_PAGE && !current_user_can($capability)) {
        $landing_url = byline_admin_user_landing_url();
        if ($landing_url !== '') {
            wp_safe_redirect($landing_url);
            exit;
        }
    }

    if (!current_user_can($capability)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage this Byline screen.', 'weekly-wildcat-headless'));
    }

    echo '<div class="wrap"><div id="byline-admin-root"></div></div>';
}

function byline_enqueue_admin_app(string $hook_suffix): void
{
    $page = byline_admin_current_page();
    $app_pages = [
        BYLINE_ADMIN_PAGE,
        BYLINE_ADMIN_STUDIO_PAGE,
        BYLINE_ADMIN_PUBLICATION_PAGE,
        BYLINE_ADMIN_THEME_PAGE,
        BYLINE_ADMIN_INTEGRATIONS_PAGE,
        BYLINE_ADMIN_SETTINGS_PAGE,
    ];

    if (!in_array($page, $app_pages, true)) {
        return;
    }

    wp_enqueue_media();

    $asset_file = __DIR__ . '/../../build/index.asset.php';
    $script_file = __DIR__ . '/../../build/index.js';
    if (!is_readable($asset_file) || !is_readable($script_file)) {
        add_action('admin_notices', static function (): void {
            echo '<div class="notice notice-error"><p>' . esc_html__('Byline admin assets are missing. Install a release build or run the admin asset build.', 'weekly-wildcat-headless') . '</p></div>';
        });
        return;
    }

    $asset = require $asset_file;
    $dependencies = is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_string($asset['version'] ?? null) ? $asset['version'] : BYLINE_PLUGIN_VERSION;

    wp_enqueue_script(
        'byline-admin',
        plugins_url('build/index.js', dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
        $dependencies,
        $version,
        true
    );

    foreach ([
        'byline-admin-vendor' => 'index.css',
        'byline-admin' => 'style-index.css',
    ] as $style_handle => $style_name) {
        $style_file = __DIR__ . '/../../build/' . $style_name;
        if (!is_readable($style_file)) {
            continue;
        }

        wp_enqueue_style(
            $style_handle,
            plugins_url('build/' . $style_name, dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
            ['wp-components'],
            $version
        );
    }

    $page_urls = byline_admin_page_urls();
    $publication = byline_get_publication_config();
    wp_localize_script('byline-admin', 'bylineAdmin', [
        'page' => $page,
        'tab' => byline_admin_query_key('tab'),
        'view' => byline_admin_query_key('view'),
        'restPath' => '/' . BYLINE_REST_NAMESPACE . '/capabilities/protocol',
        'publicationPath' => '/' . BYLINE_REST_NAMESPACE . '/publication',
        'diagnosticsPath' => '/' . BYLINE_REST_NAMESPACE . '/admin/diagnostics',
        'deploymentPath' => '/' . BYLINE_REST_NAMESPACE . '/admin/deployment',
        'discordPath' => '/' . BYLINE_REST_NAMESPACE . '/admin/discord',
        'nonce' => wp_create_nonce('wp_rest'),
        'pluginVersion' => BYLINE_PLUGIN_VERSION,
        'previewStylesheetUrl' => plugins_url('build/index.css', dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
        'capabilities' => [
            'manage' => current_user_can(BYLINE_MANAGE_CAPABILITY),
            'editDesign' => current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY),
            'publishDesign' => current_user_can(BYLINE_PUBLISH_DESIGN_CAPABILITY),
            'manageIntegrations' => current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY),
        ],
        'features' => $publication['features'],
        'themeIds' => byline_publication_theme_ids(),
        'urls' => $page_urls,
        'legacyRoutes' => byline_admin_legacy_hash_urls($page_urls),
        'nativeUrls' => byline_admin_native_urls(),
    ]);

    add_filter('admin_body_class', static function (string $classes) use ($page): string {
        $classes .= ' byline-admin-page';
        if ($page === BYLINE_ADMIN_STUDIO_PAGE) {
            $classes .= ' byline-studio-admin-page';
        }
        return $classes;
    });
}
add_action('admin_enqueue_scripts', 'byline_enqueue_admin_app');

/**
 * Screens that belong to the Byline configuration menu.
 */
function byline_admin_config_pages(): array
{
    return [
        BYLINE_ADMIN_PAGE,
        BYLINE_ADMIN_PUBLICATION_PAGE,
        BYLINE_ADMIN_THEME_PAGE,
        BYLINE_ADMIN_INTEGRATIONS_PAGE,
        BYLINE_ADMIN_SETTINGS_PAGE,
    ];
}

/**
 * Sports utility screens registered against the Sports Games post type. Each
 * one highlights itself rather than the Games list.
 */
function byline_sports_utility_pages(): array
{
    return [
        'wwh-sports-import',
        'wwh-sports-export',
        'wwh-sports-roster-import',
        'wwh-sports-team-settings',
    ];
}

/**
 * Resolve the Sports utility page slug for the current screen, if any.
 *
 * WordPress screen ids for these submenus are prefixed with the parent post
 * type, e.g. ww_sports_game_page_wwh-sports-import.
 */
function byline_sports_utility_page_for_screen(?object $screen): string
{
    if (!$screen || !isset($screen->id) || !is_string($screen->id)) {
        return '';
    }

    foreach (byline_sports_utility_pages() as $page) {
        if ($screen->id === WWH_SPORTS_GAME_POST_TYPE . '_page_' . $page) {
            return $page;
        }
    }

    return '';
}

/**
 * WordPress passes null for these filters on plenty of core screens, so both
 * the parameter and the return type must stay nullable and unrelated screens
 * must be handed back exactly what they came in with.
 */
function byline_admin_parent_file(?string $parent_file): ?string
{
    if (in_array(byline_admin_current_page(), byline_admin_config_pages(), true)) {
        return BYLINE_ADMIN_PAGE;
    }

    $screen = get_current_screen();
    if (!$screen) {
        return $parent_file;
    }

    if (!byline_admin_feature_enabled('sports')) {
        return $parent_file;
    }

    // Rosters live under Sports even though they are their own post type.
    if (isset($screen->post_type) && $screen->post_type === WWH_SPORTS_ROSTER_POST_TYPE) {
        return byline_sports_menu_parent();
    }

    if (byline_sports_utility_page_for_screen($screen) !== '') {
        return byline_sports_menu_parent();
    }

    return $parent_file;
}
add_filter('parent_file', 'byline_admin_parent_file');

function byline_admin_submenu_file(?string $submenu_file): ?string
{
    $page = byline_admin_current_page();
    if (in_array($page, byline_admin_config_pages(), true)) {
        return $page;
    }

    $screen = get_current_screen();
    if (!$screen) {
        return $submenu_file;
    }

    if (isset($screen->post_type) && $screen->post_type === WWH_SPORTS_ROSTER_POST_TYPE) {
        return 'edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE;
    }

    // Each utility screen highlights its own entry, not the Games list.
    $utility_page = byline_sports_utility_page_for_screen($screen);
    if ($utility_page !== '') {
        return $utility_page;
    }

    return $submenu_file;
}
add_filter('submenu_file', 'byline_admin_submenu_file');
