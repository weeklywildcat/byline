<?php

/**
 * Capability matrix regression for Byline menus, direct screens, and REST
 * writes. The production code uses capabilities rather than role names; the
 * role labels below are representative user profiles for the harness.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;
const BYLINE_POLL_POST_TYPE = 'byline_poll';
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';

$byline_matrix_role = '';
$byline_matrix_capabilities = [];
$byline_matrix_features = ['sports' => true, 'events' => true, 'polls' => true, 'discord' => true];
$byline_matrix_menus = [];
$byline_matrix_submenus = [];
$byline_matrix_routes = [];

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'POST';
    public const CREATABLE = 'POST';
    public const DELETABLE = 'DELETE';
}

function byline_matrix_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function byline_matrix_assert(bool $condition, string $message): void
{
    if (!$condition) {
        byline_matrix_fail($message);
    }
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function apply_filters(string $tag, $value, ...$args) { return $value; }
function wp_doing_ajax(): bool { return false; }
function wp_unslash($value) { return $value; }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function esc_html__($value, $domain = ''): string { return (string) $value; }

function add_menu_page(...$args): string
{
    global $byline_matrix_menus;
    $byline_matrix_menus[$args[3]] = $args;
    return 'toplevel_page_' . $args[3];
}

function add_submenu_page(...$args): string
{
    global $byline_matrix_submenus;
    $byline_matrix_submenus[$args[4]] = $args;
    return 'byline_page_' . $args[4];
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function add_query_arg(array $args, string $url): string
{
    return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args);
}

function current_user_can(string $capability): bool
{
    global $byline_matrix_capabilities;
    return !empty($byline_matrix_capabilities[$capability]);
}

function get_option(string $key, $default = false)
{
    global $byline_matrix_features;
    return $key === 'byline_publication_config_v1'
        ? ['schemaVersion' => BYLINE_PUBLICATION_SCHEMA_VERSION, 'features' => $byline_matrix_features]
        : $default;
}

function get_locale(): string { return 'en_US'; }
function wp_timezone_string(): string { return 'America/New_York'; }
function wp_timezone(): DateTimeZone { return new DateTimeZone('America/New_York'); }
function get_bloginfo(string $field): string { return $field === 'name' ? 'Example Gazette' : 'Independent community journalism.'; }
function home_url(string $path = ''): string { return 'https://cms.example.test' . $path; }
function wp_parse_url(string $url, int $component = -1) { return parse_url($url, $component); }
function untrailingslashit(string $value): string { return rtrim($value, '/'); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_title(string $value): string { return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $value)), '-'); }
function esc_url_raw(string $value, array $protocols = []): string
{
    if ($value === '') return '';
    if (filter_var($value, FILTER_VALIDATE_URL) === false) return '';
    $scheme = parse_url($value, PHP_URL_SCHEME);
    return $protocols === [] || in_array($scheme, $protocols, true) ? $value : '';
}

function get_current_screen()
{
    return null;
}

function wp_die($message): void
{
    throw new RuntimeException('die:' . (string) $message);
}

function wp_safe_redirect(string $location): void
{
    throw new RuntimeException('redirect:' . $location);
}

function register_rest_route(string $namespace, string $route, $args): void
{
    global $byline_matrix_routes;
    $byline_matrix_routes[$route] = $args;
}

require __DIR__ . '/../includes/admin/app.php';
require __DIR__ . '/../includes/core/compatibility.php';
require __DIR__ . '/../includes/publication/config.php';
require __DIR__ . '/../includes/design/rest.php';
require __DIR__ . '/../includes/integrations/deployment.php';
require __DIR__ . '/../includes/sports/teams.php';

byline_register_admin_app();
byline_register_publication_routes();
byline_register_design_routes();
byline_register_deployment_routes();
byline_register_sports_team_routes();

function byline_matrix_set_role(string $role, array $capabilities): void
{
    global $byline_matrix_role, $byline_matrix_capabilities;
    $byline_matrix_role = $role;
    $byline_matrix_capabilities = array_fill_keys($capabilities, true);
}

function byline_matrix_expect_mount(string $page): void
{
    $_GET = ['page' => $page];
    ob_start();
    try {
        byline_render_admin_app();
        $output = (string) ob_get_clean();
    } catch (Throwable $exception) {
        ob_end_clean();
        byline_matrix_fail("{$GLOBALS['byline_matrix_role']} could not open {$page}: {$exception->getMessage()}");
    }
    byline_matrix_assert(strpos($output, 'id="byline-admin-root"') !== false, "{$GLOBALS['byline_matrix_role']} did not receive the {$page} screen.");
}

function byline_matrix_expect_redirect(string $page, string $destination): void
{
    $_GET = ['page' => $page];
    try {
        byline_render_admin_app();
        byline_matrix_fail("{$GLOBALS['byline_matrix_role']} should not render {$page}.");
    } catch (RuntimeException $exception) {
        $message = $exception->getMessage();
        byline_matrix_assert(strpos($message, 'redirect:') === 0, "{$GLOBALS['byline_matrix_role']} should be redirected from {$page}.");
        byline_matrix_assert(strpos($message, $destination) !== false, "{$GLOBALS['byline_matrix_role']} was redirected from {$page} to the wrong destination.");
    }
}

function byline_matrix_expect_denied(string $page): void
{
    $_GET = ['page' => $page];
    try {
        byline_render_admin_app();
        byline_matrix_fail("{$GLOBALS['byline_matrix_role']} should be denied {$page}.");
    } catch (RuntimeException $exception) {
        byline_matrix_assert(strpos($exception->getMessage(), 'die:') === 0, "{$GLOBALS['byline_matrix_role']} got the wrong response for denied {$page}.");
    }
}

$profiles = [
    'administrator' => [
        BYLINE_MANAGE_CAPABILITY,
        BYLINE_EDIT_DESIGN_CAPABILITY,
        BYLINE_PUBLISH_DESIGN_CAPABILITY,
        BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
        'edit_posts', 'edit_byline_polls', 'publish_byline_polls',
    ],
    'editor' => ['edit_posts', 'edit_byline_polls', 'publish_byline_polls'],
    'author' => ['edit_posts', 'edit_byline_polls', 'publish_byline_polls'],
    'design-only' => [BYLINE_EDIT_DESIGN_CAPABILITY, BYLINE_PUBLISH_DESIGN_CAPABILITY],
    'sports-content-editor' => ['edit_posts'],
    'poll-editor' => ['edit_byline_polls', 'publish_byline_polls'],
    'integration-manager' => [BYLINE_MANAGE_INTEGRATIONS_CAPABILITY],
];

$expected_menus = [
    'administrator' => ['byline-studio', 'byline'],
    'editor' => [],
    'author' => [],
    'design-only' => ['byline-studio'],
    'sports-content-editor' => [],
    'poll-editor' => [],
    'integration-manager' => ['byline'],
];

foreach ($profiles as $role => $capabilities) {
    byline_matrix_set_role($role, $capabilities);
    byline_register_admin_app();
    foreach (['byline-studio', 'byline'] as $menu_slug) {
        $menu = $byline_matrix_menus[$menu_slug] ?? null;
        $visible = is_array($menu) && current_user_can((string) $menu[2]);
        byline_matrix_assert($visible === in_array($menu_slug, $expected_menus[$role], true), "Menu visibility for {$role} and {$menu_slug} does not match capabilities.");
    }
}

// Direct screen access follows the same capability model as menu visibility.
byline_matrix_set_role('administrator', $profiles['administrator']);
foreach (['byline', 'byline-studio', 'byline-publication', 'byline-theme', 'byline-integrations', 'byline-settings'] as $page) {
    byline_matrix_expect_mount($page);
}

byline_matrix_set_role('design-only', $profiles['design-only']);
byline_matrix_expect_mount('byline-studio');
byline_matrix_expect_redirect('byline', 'page=byline-studio');
byline_matrix_expect_denied('byline-publication');

byline_matrix_set_role('integration-manager', $profiles['integration-manager']);
byline_matrix_expect_mount('byline-integrations');
byline_matrix_expect_redirect('byline', 'page=byline-integrations');
byline_matrix_expect_denied('byline-publication');

byline_matrix_set_role('sports-content-editor', $profiles['sports-content-editor']);
byline_matrix_expect_redirect('byline', 'post_type=' . WWH_SPORTS_GAME_POST_TYPE);
byline_matrix_expect_denied('byline-settings');

foreach (['editor', 'author', 'poll-editor'] as $role) {
    byline_matrix_set_role($role, $profiles[$role]);
    byline_matrix_expect_redirect('byline', 'post_type=' . BYLINE_POLL_POST_TYPE);
    byline_matrix_expect_denied('byline-settings');
}

// REST write permissions are checked independently of menu visibility.
$route_permissions = [
    'publication' => $byline_matrix_routes['/publication'][1]['permission_callback'],
    'designAutosave' => $byline_matrix_routes['/admin/design/(?P<template>[a-z0-9:-]+)/autosave'][0]['permission_callback'],
    // Discarding a draft is an editing capability, never a publishing one.
    'designAutosaveDelete' => $byline_matrix_routes['/admin/design/(?P<template>[a-z0-9:-]+)/autosave'][1]['permission_callback'],
    'designPublish' => $byline_matrix_routes['/admin/design/(?P<template>[a-z0-9:-]+)/publish']['permission_callback'],
    'deployment' => $byline_matrix_routes['/admin/deployment'][1]['permission_callback'],
    'sportsTeams' => $byline_matrix_routes['/sports/teams'][1]['permission_callback'],
];

$expected_permissions = [
    'administrator' => [true, true, true, true, true, true],
    'editor' => [false, false, false, false, false, false],
    'author' => [false, false, false, false, false, false],
    'design-only' => [false, true, true, true, false, false],
    'sports-content-editor' => [false, false, false, false, false, false],
    'poll-editor' => [false, false, false, false, false, false],
    'integration-manager' => [false, false, false, false, true, false],
];

foreach ($expected_permissions as $role => $expected) {
    byline_matrix_set_role($role, $profiles[$role]);
    $actual = array_values(array_map(static fn($permission): bool => (bool) call_user_func($permission), $route_permissions));
    byline_matrix_assert($actual === $expected, "REST write permissions for {$role} do not match the expected capability matrix.");
}

echo "Byline capability matrix regression passed.\n";
