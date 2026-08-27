<?php

/**
 * WordPress-shaped smoke harness for Byline admin hooks.
 *
 * CI does not ship a WordPress database, so this keeps the relevant core hook
 * contracts (including nullable parent_file/submenu_file values) while loading
 * the production admin app. A full WordPress install can run the same checks
 * through the normal admin request path; this harness catches the type errors
 * that previously took down wp-admin before a browser test could start.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';
const BYLINE_POLL_POST_TYPE = 'byline_poll';

$byline_smoke_actions = [];
$byline_smoke_filters = [];
$byline_smoke_menus = [];
$byline_smoke_submenus = [];
$byline_smoke_screen = null;
$byline_smoke_capabilities = [
    BYLINE_MANAGE_CAPABILITY => true,
    BYLINE_EDIT_DESIGN_CAPABILITY => true,
    BYLINE_PUBLISH_DESIGN_CAPABILITY => true,
    BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true,
    'edit_posts' => true,
];
$byline_smoke_features = ['sports' => true, 'events' => true, 'polls' => true, 'discord' => true];

function byline_smoke_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function add_action(string $tag = '', $callback = null, ...$args): void
{
    global $byline_smoke_actions;
    $byline_smoke_actions[$tag][] = $callback;
}

function add_filter(string $tag = '', $callback = null, ...$args): bool
{
    global $byline_smoke_filters;
    $byline_smoke_filters[$tag][] = $callback;
    return true;
}

function apply_filters(string $tag, $value, ...$args)
{
    return $value;
}

function add_menu_page(...$args): string
{
    global $byline_smoke_menus;
    $byline_smoke_menus[$args[3]] = $args;
    return 'toplevel_page_' . $args[3];
}

function add_submenu_page(...$args): string
{
    global $byline_smoke_submenus;
    $byline_smoke_submenus[$args[4]] = $args;
    return 'byline_page_' . $args[4];
}

function remove_submenu_page(...$args): void
{
}

function current_user_can(string $capability): bool
{
    global $byline_smoke_capabilities;
    return !empty($byline_smoke_capabilities[$capability]);
}

function byline_get_publication_config(): array
{
    global $byline_smoke_features;
    return ['features' => $byline_smoke_features];
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function add_query_arg(array $args, string $url): string
{
    return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args);
}

function wp_doing_ajax(): bool
{
    return false;
}

function wp_unslash($value)
{
    return $value;
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function get_current_screen()
{
    global $byline_smoke_screen;
    return $byline_smoke_screen;
}

function esc_html__($value, $domain = ''): string
{
    return (string) $value;
}

function wp_die($message): void
{
    throw new RuntimeException((string) $message);
}

function wp_safe_redirect(string $location): void
{
    throw new RuntimeException('redirect:' . $location);
}

require __DIR__ . '/../includes/admin/app.php';

byline_register_admin_app();
foreach (['byline-studio', 'byline'] as $slug) {
    if (!isset($byline_smoke_menus[$slug])) {
        byline_smoke_fail("Smoke harness did not register {$slug}.");
    }
}
foreach (['byline', 'byline-publication', 'byline-theme', 'byline-integrations', 'byline-settings'] as $slug) {
    if (!isset($byline_smoke_submenus[$slug])) {
        byline_smoke_fail("Smoke harness did not register {$slug}.");
    }
}

// Core screens that pass null through WordPress's menu filters must remain
// untouched and must never cause a strict-string TypeError.
foreach ([
    ['id' => 'wp-admin', 'post_type' => null],
    ['id' => 'plugins', 'post_type' => null],
    ['id' => 'edit-post', 'post_type' => 'post'],
    ['id' => 'users', 'post_type' => null],
] as $screen_data) {
    $byline_smoke_screen = (object) $screen_data;
    try {
        if (byline_admin_parent_file(null) !== null || byline_admin_submenu_file(null) !== null) {
            byline_smoke_fail("Unrelated screen {$screen_data['id']} changed nullable menu state.");
        }
        if (byline_admin_parent_file('core.php') !== 'core.php' || byline_admin_submenu_file('profile.php') !== 'profile.php') {
            byline_smoke_fail("Unrelated screen {$screen_data['id']} changed non-null menu state.");
        }
    } catch (Throwable $exception) {
        byline_smoke_fail("Nullable menu filters threw on {$screen_data['id']}.");
    }
}

// Representative native and Byline-owned screens are all safe to resolve.
$screens = [
    ['page' => 'byline-studio', 'screen' => ['id' => 'toplevel_page_byline-studio', 'post_type' => null]],
    ['page' => '', 'screen' => ['id' => 'edit-' . WWH_SPORTS_GAME_POST_TYPE, 'post_type' => WWH_SPORTS_GAME_POST_TYPE]],
    ['page' => '', 'screen' => ['id' => WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-team-settings', 'post_type' => WWH_SPORTS_GAME_POST_TYPE]],
    ['page' => '', 'screen' => ['id' => 'edit-' . WWH_SPORTS_ROSTER_POST_TYPE, 'post_type' => WWH_SPORTS_ROSTER_POST_TYPE]],
    ['page' => '', 'screen' => ['id' => 'edit-' . BYLINE_POLL_POST_TYPE, 'post_type' => BYLINE_POLL_POST_TYPE]],
    ['page' => '', 'screen' => ['id' => 'edit-' . WWH_SCHOOL_EVENT_POST_TYPE, 'post_type' => WWH_SCHOOL_EVENT_POST_TYPE]],
    ['page' => 'byline', 'screen' => ['id' => 'byline_page_byline', 'post_type' => null]],
    ['page' => 'byline-publication', 'screen' => ['id' => 'byline_page_byline-publication', 'post_type' => null]],
    ['page' => 'byline-theme', 'screen' => ['id' => 'byline_page_byline-theme', 'post_type' => null]],
    ['page' => 'byline-settings', 'screen' => ['id' => 'byline_page_byline-settings', 'post_type' => null]],
];

foreach ($screens as $screen_case) {
    $_GET = $screen_case['page'] === '' ? [] : ['page' => $screen_case['page']];
    $byline_smoke_screen = (object) $screen_case['screen'];
    try {
        byline_admin_parent_file(null);
        byline_admin_submenu_file(null);
    } catch (Throwable $exception) {
        byline_smoke_fail("Representative screen {$screen_case['screen']['id']} threw in the admin menu hooks.");
    }
}

// Direct callbacks still enforce their capabilities independently of menu
// visibility, and an authorized configuration screen gets a React mount.
$_GET = ['page' => 'byline-publication'];
$byline_smoke_capabilities = [];
try {
    byline_render_admin_app();
    byline_smoke_fail('Unauthorized Publication screen was rendered.');
} catch (RuntimeException $exception) {
}

$byline_smoke_capabilities = [BYLINE_MANAGE_CAPABILITY => true];
ob_start();
byline_render_admin_app();
$rendered = (string) ob_get_clean();
if (strpos($rendered, 'id="byline-admin-root"') === false) {
    byline_smoke_fail('Authorized Publication screen did not render its application mount.');
}

echo "Byline WordPress admin smoke regression passed.\n";
