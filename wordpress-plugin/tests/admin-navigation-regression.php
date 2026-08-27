<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';
const BYLINE_REST_NAMESPACE = 'byline/v1';

$registered_menu = null;
$registered_submenus = [];
$registered_filters = [];
$test_screen = null;
$test_capabilities = [
    BYLINE_MANAGE_CAPABILITY => true,
    BYLINE_EDIT_DESIGN_CAPABILITY => true,
    BYLINE_PUBLISH_DESIGN_CAPABILITY => true,
    BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true,
    'edit_posts' => true,
];

function add_action(...$args): void {}
function add_filter(string $tag, $callback, int $priority = 10, int $accepted_args = 1): bool
{
    global $registered_filters;
    $registered_filters[$tag][] = [
        'callback' => $callback,
        'accepted_args' => $accepted_args,
    ];
    return true;
}
function remove_submenu_page(...$args): void {}
function apply_filters(string $tag, $value, ...$args)
{
    global $registered_filters;
    foreach ($registered_filters[$tag] ?? [] as $filter) {
        $filter_args = array_merge([$value], $args);
        $value = call_user_func_array(
            $filter['callback'],
            array_slice($filter_args, 0, $filter['accepted_args'])
        );
    }

    return $value;
}

function add_menu_page(...$args): string
{
    global $registered_menu;
    $registered_menu = $args;
    return 'toplevel_page_' . $args[3];
}

function add_submenu_page(...$args): string
{
    global $registered_submenus;
    $registered_submenus[] = $args;
    return 'byline_page_' . $args[4];
}

function current_user_can(string $capability): bool
{
    global $test_capabilities;
    return !empty($test_capabilities[$capability]);
}

function byline_get_publication_config(): array
{
    return ['features' => ['polls' => true, 'sports' => true, 'discord' => true]];
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function add_query_arg(array $args, string $url): string
{
    return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args);
}

function wp_unslash($value) { return $value; }
function sanitize_key(string $value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', $value) ?? ''); }
function get_current_screen() { global $test_screen; return $test_screen; }
function esc_html__($message, $domain = ''): string { return (string) $message; }
function wp_die($message): void { throw new RuntimeException((string) $message); }

require __DIR__ . '/../includes/admin/app.php';

byline_register_admin_app();

if (!is_array($registered_menu)
    || $registered_menu[1] !== 'Byline'
    || $registered_menu[2] !== BYLINE_MANAGE_CAPABILITY
    || $registered_menu[3] !== 'byline') {
    fwrite(STDERR, "Byline did not register its native top-level menu.\n");
    exit(1);
}

$submenu_by_slug = [];
foreach ($registered_submenus as $submenu) {
    $submenu_by_slug[$submenu[4]] = $submenu;
}

$expected_pages = [
    'byline',
    'byline-studio',
    'byline-publication',
    'byline-theme',
    'byline-integrations',
    'byline-settings',
    'byline-polls',
    'byline-teams',
];
foreach ($expected_pages as $page) {
    if (!isset($submenu_by_slug[$page]) || $submenu_by_slug[$page][0] !== 'byline') {
        fwrite(STDERR, "Expected native Byline submenu {$page} was not registered.\n");
        exit(1);
    }
}

$expected_capabilities = [
    'byline' => BYLINE_MANAGE_CAPABILITY,
    'byline-studio' => BYLINE_EDIT_DESIGN_CAPABILITY,
    'byline-publication' => BYLINE_MANAGE_CAPABILITY,
    'byline-theme' => BYLINE_MANAGE_CAPABILITY,
    'byline-integrations' => BYLINE_MANAGE_INTEGRATIONS_CAPABILITY,
    'byline-settings' => BYLINE_MANAGE_CAPABILITY,
    'byline-polls' => 'edit_posts',
    'byline-teams' => BYLINE_MANAGE_CAPABILITY,
];
foreach ($expected_capabilities as $page => $capability) {
    if (byline_admin_page_capability($page) !== $capability || $submenu_by_slug[$page][3] !== $capability) {
        fwrite(STDERR, "Capability mapping changed for {$page}.\n");
        exit(1);
    }
}

$urls = byline_admin_page_urls();
if (strpos($urls['publication']['branding'], 'page=byline-publication') === false
    || strpos($urls['publication']['branding'], 'tab=branding') === false
    || strpos($urls['integrations']['deployment'], 'page=byline-integrations') === false
    || strpos($urls['integrations']['deployment'], 'tab=deployment') === false
    || strpos($urls['settings']['diagnostics'], 'page=byline-settings') === false
    || strpos($urls['settings']['diagnostics'], 'tab=diagnostics') === false
    || strpos($urls['studioRevisions'], 'page=byline-studio') === false
    || strpos($urls['studioRevisions'], 'view=revisions') === false) {
    fwrite(STDERR, "Native Byline page URLs did not preserve deep-linkable tabs/views.\n");
    exit(1);
}

$legacy_urls = byline_admin_legacy_hash_urls($urls);
if ($legacy_urls['/publication/branding'] !== $urls['publication']['branding']
    || $legacy_urls['/design/revisions'] !== $urls['studioRevisions']
    || $legacy_urls['/advanced/diagnostics'] !== $urls['settings']['diagnostics']) {
    fwrite(STDERR, "Legacy hash routes no longer translate to their native destinations.\n");
    exit(1);
}

$_GET = [];
$test_screen = (object) ['id' => 'plugins', 'post_type' => null];
try {
    $unrelated_parent_file = byline_admin_parent_file(null);
    $unrelated_submenu_file = byline_admin_submenu_file(null);
    $filtered_parent_file = apply_filters('parent_file', null);
    $filtered_submenu_file = apply_filters('submenu_file', null, 'plugins.php');
} catch (Throwable $exception) {
    fwrite(STDERR, "Nullable WordPress admin filter arguments must not throw on plugins.php.\n");
    exit(1);
}
if ($unrelated_parent_file !== null
    || $unrelated_submenu_file !== null
    || $filtered_parent_file !== null
    || $filtered_submenu_file !== null) {
    fwrite(STDERR, "Unrelated WordPress admin filters did not preserve null values.\n");
    exit(1);
}

$_GET = ['page' => 'byline-publication', 'tab' => 'branding'];
if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== 'byline-publication') {
    fwrite(STDERR, "Publication tabs did not preserve native Byline menu highlighting.\n");
    exit(1);
}

$_GET = [];
$test_screen = (object) ['id' => 'edit-' . WWH_SPORTS_GAME_POST_TYPE, 'post_type' => WWH_SPORTS_GAME_POST_TYPE];
if (byline_admin_parent_file('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE) !== 'byline'
    || byline_admin_submenu_file('') !== 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE) {
    fwrite(STDERR, "Native sports content did not preserve the Byline parent/highlight state.\n");
    exit(1);
}

$_GET = ['page' => 'byline-publication'];
$test_capabilities = [];
$callback_rejected = false;
try {
    byline_render_admin_app();
} catch (RuntimeException $exception) {
    $callback_rejected = true;
}
if (!$callback_rejected) {
    fwrite(STDERR, "The native page callback did not independently enforce its capability.\n");
    exit(1);
}

$test_capabilities = [BYLINE_MANAGE_CAPABILITY => true];
ob_start();
byline_render_admin_app();
$rendered_root = (string) ob_get_clean();
if (strpos($rendered_root, 'id="byline-admin-root"') === false) {
    fwrite(STDERR, "An authorized native Byline page did not render its React mount.\n");
    exit(1);
}

$index_source = file_get_contents(__DIR__ . '/../src/index.tsx');
$style_source = file_get_contents(__DIR__ . '/../src/style.css');
$game_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
$roster_source = file_get_contents(__DIR__ . '/../includes/sports-rosters.php');
if (!is_string($index_source)
    || !is_string($style_source)
    || !is_string($game_source)
    || !is_string($roster_source)
    || strpos($index_source, 'byline-admin-sidebar') !== false
    || strpos($index_source, 'byline-admin-nav') !== false
    || strpos($index_source, 'hashchange') !== false
    || strpos($style_source, 'byline-admin-sidebar') !== false
    || strpos($style_source, 'byline-admin-nav') !== false
    || preg_match_all("/'show_in_menu'\\s*=>\\s*'byline'/", $game_source, $game_matches) !== 2
    || preg_match("/'show_in_menu'\\s*=>\\s*'byline'/", $roster_source) !== 1) {
    fwrite(STDERR, "The duplicate Byline sidebar/hash shell or native CPT placement regressed.\n");
    exit(1);
}

$test_capabilities = [BYLINE_EDIT_DESIGN_CAPABILITY => true];
if (byline_admin_menu_capability() !== BYLINE_EDIT_DESIGN_CAPABILITY) {
    fwrite(STDERR, "The top-level menu did not preserve the fine-grained design capability.\n");
    exit(1);
}

echo "Byline admin navigation regression passed.\n";
