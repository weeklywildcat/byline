<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';
const BYLINE_POLL_POST_TYPE = 'byline_poll';
const BYLINE_REST_NAMESPACE = 'byline/v1';

$registered_menus = [];
$registered_submenus = [];
$registered_filters = [];
$registered_actions = [];
$test_screen = null;
$test_features = ['polls' => true, 'sports' => true, 'events' => true, 'discord' => true];
$test_capabilities = [
    BYLINE_MANAGE_CAPABILITY => true,
    BYLINE_EDIT_DESIGN_CAPABILITY => true,
    BYLINE_PUBLISH_DESIGN_CAPABILITY => true,
    BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true,
    'edit_posts' => true,
    'edit_others_posts' => true,
];
$redirected_to = null;
$test_roles = ['administrator'];
$test_network_admin = false;
$test_user_admin = false;

function fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function add_action(string $tag = '', $callback = null, ...$rest): void
{
    global $registered_actions;
    $registered_actions[$tag][] = $callback;
}
function add_filter(string $tag, $callback, int $priority = 10, int $accepted_args = 1): bool
{
    global $registered_filters;
    $registered_filters[$tag][] = [
        'callback' => $callback,
        'accepted_args' => $accepted_args,
    ];
    return true;
}
function remove_submenu_page(string $parent, string $slug): void
{
    global $registered_submenus;
    $registered_submenus = array_values(array_filter($registered_submenus, static function (array $submenu) use ($parent, $slug): bool {
        return $submenu[0] !== $parent || $submenu[4] !== $slug;
    }));
}
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
    global $registered_menus;
    $registered_menus[$args[3]] = $args;
    return 'toplevel_page_' . $args[3];
}

function add_submenu_page(...$args): string
{
    global $registered_submenus;
    $position = $args[6] ?? null;
    if (is_int($position)) {
        array_splice($registered_submenus, $position, 0, [$args]);
    } else {
        $registered_submenus[] = $args;
    }
    return 'byline_page_' . $args[4];
}

function current_user_can(string $capability): bool
{
    global $test_capabilities;
    return !empty($test_capabilities[$capability]);
}

function wp_get_current_user()
{
    global $test_roles;
    return (object) ['roles' => $test_roles];
}
function is_network_admin(): bool { return $GLOBALS['test_network_admin']; }
function is_user_admin(): bool { return $GLOBALS['test_user_admin']; }
function remove_menu_page(string $slug): void
{
    unset($GLOBALS['registered_menus'][$slug]);
}

function byline_get_publication_config(): array
{
    global $test_features;
    return ['features' => $test_features];
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function add_query_arg(array $args, string $url): string
{
    return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args);
}

function wp_doing_ajax(): bool { return false; }
function wp_unslash($value) { return $value; }
function sanitize_key(string $value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', $value) ?? ''); }
function get_current_screen() { global $test_screen; return $test_screen; }
function esc_html__($message, $domain = ''): string { return (string) $message; }
function wp_die($message): void { throw new RuntimeException((string) $message); }
function wp_safe_redirect(string $location): void
{
    global $redirected_to;
    $redirected_to = $location;
    throw new RuntimeException('redirect:' . $location);
}

require __DIR__ . '/../includes/admin/app.php';

function reset_menu_state(): void
{
    global $registered_menus, $registered_submenus;
    $registered_menus = [];
    $registered_submenus = [];
}

function submenus_by_parent(): array
{
    global $registered_submenus;
    $map = [];
    foreach ($registered_submenus as $submenu) {
        $map[$submenu[0]][$submenu[4]] = $submenu;
    }
    return $map;
}

// ---------------------------------------------------------------------------
// Menu architecture: one Byline menu above Dashboard, with protected Settings.
// ---------------------------------------------------------------------------

byline_register_admin_app();

$expected_top_level = [
    'byline' => ['title' => 'Byline', 'capability' => BYLINE_MANAGE_CAPABILITY, 'position' => 1],
];
foreach ($expected_top_level as $slug => $expected) {
    if (!isset($registered_menus[$slug])) {
        fail("Expected top-level menu {$slug} was not registered.");
    }
    $menu = $registered_menus[$slug];
    if ($menu[1] !== $expected['title']) {
        fail("Top-level menu {$slug} should be titled {$expected['title']}, got {$menu[1]}.");
    }
    if ($menu[2] !== $expected['capability']) {
        fail("Top-level menu {$slug} should require {$expected['capability']}.");
    }
    if ($menu[6] !== $expected['position']) {
        fail("Top-level menu {$slug} should sit at position {$expected['position']}.");
    }
}

// Planning destinations are native Byline children, with no separate parent.
if (isset($registered_menus['byline-planning'])) {
    fail('Planning must be a child of Byline rather than a separate top-level menu.');
}
$by_parent = submenus_by_parent();
$planning_children = array_filter($by_parent['byline'] ?? [], static function (array $submenu): bool {
    return $submenu[4] !== 'byline' && $submenu[4] !== 'byline-settings';
});
$expected_planning = [
    'byline-planning' => ['Today', 'edit_posts'],
    'admin.php?page=byline-planning&tab=stories' => ['Stories', 'edit_posts'],
    'admin.php?page=byline-planning&tab=calendar' => ['Calendar', 'edit_posts'],
    'admin.php?page=byline-planning&tab=media' => ['Media Desk', 'edit_posts'],
    'admin.php?page=byline-planning&tab=coverage' => ['Coverage', 'edit_posts'],
    'admin.php?page=byline-planning&tab=performance' => ['Performance', 'edit_posts'],
    'admin.php?page=byline-planning&tab=content-health' => ['Content Health', 'edit_posts'],
    'admin.php?page=byline-planning&tab=feedback' => ['Feedback', 'edit_others_posts'],
];
foreach ($expected_planning as $slug => [$title, $capability]) {
    if (!isset($planning_children[$slug])) {
        fail("Planning should expose {$title} as a native submenu entry ({$slug}).");
    }
    if ($planning_children[$slug][2] !== $title) {
        fail("Planning child {$slug} should be titled {$title}, got {$planning_children[$slug][2]}.");
    }
    if ($planning_children[$slug][3] !== $capability) {
        fail("Planning child {$slug} should require {$capability}, got {$planning_children[$slug][3]}.");
    }
}
if (count($planning_children) !== count($expected_planning)) {
    fail('Planning gained or lost a destination.');
}
// Today must register the Planning page now that it is no longer top-level.
// Other destinations are deep links to that same registered callback.
foreach ($planning_children as $slug => $submenu) {
    $expected_callback = $slug === 'byline-planning' ? 'byline_render_admin_app' : '';
    if (($submenu[5] ?? '') !== $expected_callback) {
        fail("Planning child {$slug} has the wrong callback registration.");
    }
}

// Byline keeps Home first, the Planning destinations next, and Settings last.
$byline_children = $by_parent['byline'] ?? [];
$expected_children = [
    'byline' => ['Home', BYLINE_MANAGE_CAPABILITY],
] + $expected_planning + [
    'byline-settings' => ['Settings', BYLINE_MANAGE_CAPABILITY],
];
foreach ($expected_children as $slug => [$title, $capability]) {
    if (!isset($byline_children[$slug])) {
        fail("Byline should own the {$slug} screen.");
    }
    if ($byline_children[$slug][2] !== $title) {
        fail("Byline child {$slug} should be titled {$title}, got {$byline_children[$slug][2]}.");
    }
    if ($byline_children[$slug][3] !== $capability || (strpos($slug, 'admin.php?') !== 0 && byline_admin_page_capability($slug) !== $capability)) {
        fail("Capability mapping changed for {$slug}.");
    }
}

if ($byline_children['byline'][2] === 'Dashboard') {
    fail('The Byline Dashboard child should have been renamed to Home.');
}

// Publication, Integrations, and Doctor are sections of Settings rather than
// permanent WordPress sidebar entries.
foreach (['byline-publication', 'byline-integrations', byline_admin_doctor_menu_slug()] as $fragmented) {
    if (isset($byline_children[$fragmented])) {
        fail("Byline should not expose the fragmented {$fragmented} settings destination.");
    }
}

// Byline must no longer own workflow screens.
foreach (['byline-studio', 'byline-polls', 'byline-teams'] as $moved) {
    if (isset($byline_children[$moved])) {
        fail("Byline should no longer contain {$moved} after the IA refactor.");
    }
}
if (array_keys($byline_children) !== array_keys($expected_children)) {
    fail('Byline must list Home, Planning destinations, and Settings in that order.');
}

// ---------------------------------------------------------------------------
// Feature flags gate the workflow menus.
// ---------------------------------------------------------------------------

reset_menu_state();
$test_features = ['polls' => false, 'sports' => false, 'events' => false];
byline_register_admin_app();
if (isset($registered_menus['byline-studio']) || !isset($registered_menus['byline'])) {
    fail('Studio must stay removed and Byline must remain registered.');
}

// Polls are now the byline_poll post type, whose own registration gates the
// Polls menu on the feature flag. Byline must not add a second Polls screen.
// See tests/poll-storage-regression.php for the post type's menu gating.
$test_features = ['polls' => true, 'sports' => true, 'events' => true, 'discord' => true];
reset_menu_state();
byline_register_admin_app();
if (isset($registered_menus['byline-polls'])) {
    fail('Polls belong to the byline_poll post type, not a Byline placeholder menu.');
}
foreach ($registered_submenus as $submenu) {
    if (($submenu[4] ?? '') === 'byline-polls') {
        fail('Polls must not be re-registered as a Byline submenu.');
    }
}
if (strpos(byline_admin_polls_url(), 'post_type=' . BYLINE_POLL_POST_TYPE) === false) {
    fail('The Polls destination must be the native byline_poll list table.');
}

$test_features = ['polls' => true, 'sports' => true, 'events' => true, 'discord' => true];

// ---------------------------------------------------------------------------
// Capability-driven visibility. Menu visibility is never authorization.
// ---------------------------------------------------------------------------

$test_capabilities = ['edit_posts' => true];
if (byline_admin_menu_capability() !== 'edit_posts') {
    fail('A reporter must see the combined Byline menu.');
}
if (byline_admin_page_capability('byline-settings') === 'edit_posts') {
    fail('Seeing the Byline menu must not grant a reporter access to Settings.');
}
if (strpos(byline_admin_user_landing_url(), 'page=byline-planning') === false || strpos(byline_admin_user_landing_url(), 'tab=today') === false) {
    fail('An editor landing on Byline must be sent to the Today surface.');
}
// Feedback stayed an editor surface. add_submenu_page takes one capability, so
// the registration resolves the one this user actually holds; a reporter who
// can only edit their own posts is filtered out exactly as before.
if (byline_admin_feedback_capability() !== BYLINE_MANAGE_CAPABILITY) {
    fail('A user without edit_others_posts must fall back to the Byline management capability for Feedback.');
}
reset_menu_state();
byline_register_admin_app();
$reporter_planning = submenus_by_parent()['byline'] ?? [];
if (($reporter_planning['admin.php?page=byline-planning&tab=feedback'][3] ?? '') !== BYLINE_MANAGE_CAPABILITY) {
    fail('Feedback must not become visible to a reporter who can only edit their own posts.');
}
if (isset($reporter_planning['byline'])) {
    fail('A reporter must not see a duplicate Byline parent entry above Today.');
}
if (!isset($reporter_planning['admin.php?page=byline-planning&tab=stories'])) {
    fail('A reporter must still reach Stories from the Planning menu.');
}
$test_capabilities = ['edit_posts' => true, 'edit_others_posts' => true];
if (byline_admin_feedback_capability() !== 'edit_others_posts') {
    fail('An editor who can edit other people\'s posts must see Feedback under that capability.');
}

$test_capabilities = [BYLINE_EDIT_DESIGN_CAPABILITY => true];
if (byline_admin_menu_capability() === BYLINE_EDIT_DESIGN_CAPABILITY) {
    fail('Design capability alone must not surface the Byline configuration menu.');
}
$test_capabilities = [BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true];
if (byline_admin_menu_capability() !== BYLINE_MANAGE_INTEGRATIONS_CAPABILITY) {
    fail('An integrations manager should still reach the Byline menu.');
}
if (strpos(byline_admin_user_landing_url(), 'page=byline-settings') === false
    || strpos(byline_admin_user_landing_url(), 'tab=deployment') === false) {
    fail('An integrations manager should land inside the unified Settings screen.');
}
$test_capabilities = [
    BYLINE_MANAGE_CAPABILITY => true,
    BYLINE_EDIT_DESIGN_CAPABILITY => true,
    BYLINE_PUBLISH_DESIGN_CAPABILITY => true,
    BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true,
    'edit_posts' => true,
    'edit_others_posts' => true,
];

// ---------------------------------------------------------------------------
// URLs stay canonical.
// ---------------------------------------------------------------------------

$urls = byline_admin_page_urls();
if (strpos($urls['planning']['today'], 'page=byline-planning') === false
    || strpos($urls['planning']['today'], 'tab=today') === false
    || strpos($urls['publication']['branding'], 'page=byline-settings') === false
    || strpos($urls['publication']['branding'], 'tab=branding') === false
    || strpos($urls['integrations']['analytics'], 'page=byline-settings') === false
    || strpos($urls['integrations']['analytics'], 'tab=analytics') === false
    || strpos($urls['integrations']['deployment'], 'page=byline-settings') === false
    || strpos($urls['integrations']['deployment'], 'tab=deployment') === false
    || strpos($urls['newsletters']['settings'], 'page=byline-settings') === false
    || strpos($urls['newsletters']['settings'], 'tab=newsletter') === false
    || strpos($urls['settings']['diagnostics'], 'page=byline-settings') === false
    || strpos($urls['settings']['diagnostics'], 'tab=diagnostics') === false) {
    fail('Byline configuration URLs must resolve to deep-linkable unified Settings sections.');
}

$native = byline_admin_native_urls();
if (isset($native['games']) || isset($native['rosters']) || isset($native['sportsImport']) || isset($native['sportsExport'])
    || strpos($native['teams'], 'post_type=page') === false
    || strpos($native['events'], 'post_type=' . WWH_SCHOOL_EVENT_POST_TYPE) === false) {
    fail('Sports editing destinations must be removed; legacy Teams links should lead to archive Pages.');
}

$legacy_urls = byline_admin_legacy_hash_urls($urls);
if (($legacy_urls['/home'] ?? '') !== $urls['planning']['today']
    || ($legacy_urls['/planning/today'] ?? '') !== $urls['planning']['today']
    || $legacy_urls['/publication/branding'] !== $urls['publication']['branding']
    || $legacy_urls['/integrations/analytics'] !== $urls['integrations']['analytics']
    || $legacy_urls['/newsletters/settings'] !== $urls['newsletters']['settings']
    || $legacy_urls['/content/polls'] !== $urls['polls']
    || $legacy_urls['/content/teams'] !== $urls['teams']
    || $legacy_urls['/advanced/diagnostics'] !== $urls['settings']['diagnostics']) {
    fail('Legacy hash routes no longer translate to their native destinations.');
}

// The retired Byline-owned Teams page redirects rather than duplicating a screen.
$_GET = ['page' => 'byline-teams'];
$redirected_to = null;
try {
    byline_admin_redirect_legacy_pages();
} catch (RuntimeException $exception) {
    // wp_safe_redirect throws in this harness.
}
if (!is_string($redirected_to) || strpos($redirected_to, 'post_type=page') === false || strpos($redirected_to, 'page=byline-teams') !== false) {
    fail('The retired byline-teams URL must redirect to native archive Pages.');
}

$_GET = ['page' => 'byline-publication', 'tab' => 'branding'];
$redirected_to = null;
try {
    byline_admin_redirect_legacy_pages();
} catch (RuntimeException $exception) {
    // wp_safe_redirect throws in this harness.
}
if (!is_string($redirected_to) || strpos($redirected_to, 'page=byline-settings') === false || strpos($redirected_to, 'tab=branding') === false) {
    fail('The former Publication screen must redirect into unified Settings.');
}

$_GET = ['page' => 'byline-integrations', 'tab' => 'deployment'];
$redirected_to = null;
try {
    byline_admin_redirect_legacy_pages();
} catch (RuntimeException $exception) {
}
if (!is_string($redirected_to) || strpos($redirected_to, 'page=byline-settings') === false || strpos($redirected_to, 'tab=deployment') === false) {
    fail('The former Integrations screen must redirect into unified Settings.');
}

$_GET = ['page' => 'byline-newsletters', 'tab' => 'settings'];
$redirected_to = null;
try {
    byline_admin_redirect_legacy_pages();
} catch (RuntimeException $exception) {
}
if (!is_string($redirected_to) || strpos($redirected_to, 'tab=newsletter') === false) {
    fail('Newsletter provider settings must redirect into unified Settings.');
}

$_GET = ['page' => 'wwh-settings'];
$redirected_to = null;
try {
    byline_admin_redirect_legacy_pages();
} catch (RuntimeException $exception) {
}
if (!is_string($redirected_to) || strpos($redirected_to, 'tab=login') === false) {
    fail('The retired native Byline settings page must redirect to Login screen settings.');
}

// ---------------------------------------------------------------------------
// Active menu highlighting.
// ---------------------------------------------------------------------------

$_GET = [];
$test_screen = null;

// Unrelated core screens must be handed back untouched, including nulls.
foreach ([
    ['id' => 'plugins', 'post_type' => null],
    ['id' => 'users', 'post_type' => null],
    ['id' => 'edit-post', 'post_type' => 'post'],
    ['id' => 'options-general', 'post_type' => null],
] as $screen_data) {
    $test_screen = (object) $screen_data;
    try {
        $parent_null = byline_admin_parent_file(null);
        $submenu_null = byline_admin_submenu_file(null);
        $parent_filtered = apply_filters('parent_file', null);
        $submenu_filtered = apply_filters('submenu_file', null, 'plugins.php');
    } catch (Throwable $exception) {
        fail("Nullable WordPress admin filter arguments must not throw on {$screen_data['id']}.");
    }
    if ($parent_null !== null || $submenu_null !== null || $parent_filtered !== null || $submenu_filtered !== null) {
        fail("Byline admin filters altered null state on the unrelated screen {$screen_data['id']}.");
    }

    // Non-null unrelated values must also survive untouched.
    if (byline_admin_parent_file('edit.php') !== 'edit.php'
        || byline_admin_submenu_file('edit.php?post_type=page') !== 'edit.php?post_type=page') {
        fail("Byline admin filters altered unrelated parent/submenu state on {$screen_data['id']}.");
    }
}

// Home and every settings section keep the Byline menu open. Settings has a
// single WordPress submenu entry; its local rail owns section navigation.
foreach (['byline', 'byline-settings'] as $config_page) {
    $_GET = ['page' => $config_page];
    $test_screen = (object) ['id' => 'byline_page_' . $config_page, 'post_type' => null];
    if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== $config_page) {
        fail("Byline configuration screen {$config_page} lost its native highlighting.");
    }
}

foreach (['identity', 'branding', 'newsletter', 'analytics', 'discord', 'deployment', 'login', 'access', 'api', 'compatibility', 'diagnostics', ''] as $settings_tab) {
    $_GET = $settings_tab === '' ? ['page' => 'byline-settings'] : ['page' => 'byline-settings', 'tab' => $settings_tab];
    if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== 'byline-settings') {
        fail("Unified Settings tab {$settings_tab} must highlight the single Settings child.");
    }
}

// Every Planning destination highlights itself, on a direct link or a refresh.
$_GET = ['page' => 'byline-planning'];
$test_screen = (object) ['id' => 'byline_page_byline-planning', 'post_type' => null];
if (byline_admin_parent_file('byline-planning') !== 'byline' || byline_admin_submenu_file('') !== 'byline-planning') {
    fail('Planning without a tab must highlight its landing entry.');
}
foreach ([
    'today' => 'byline-planning',
    'stories' => 'admin.php?page=byline-planning&tab=stories',
    'calendar' => 'admin.php?page=byline-planning&tab=calendar',
    'media' => 'admin.php?page=byline-planning&tab=media',
    'coverage' => 'admin.php?page=byline-planning&tab=coverage',
    'performance' => 'admin.php?page=byline-planning&tab=performance',
    'content-health' => 'admin.php?page=byline-planning&tab=content-health',
    'feedback' => 'admin.php?page=byline-planning&tab=feedback',
] as $planning_tab => $expected_submenu) {
    $_GET = ['page' => 'byline-planning', 'tab' => $planning_tab];
    if (byline_admin_parent_file('byline-planning') !== 'byline') {
        fail("Planning tab {$planning_tab} must keep the Byline menu open.");
    }
    if (byline_admin_submenu_file('') !== $expected_submenu) {
        fail("Planning tab {$planning_tab} must highlight its own sidebar entry.");
    }
}

// An unknown tab falls back to the landing entry rather than highlighting
// nothing, matching how the screen itself normalizes the tab.
$_GET = ['page' => 'byline-planning', 'tab' => 'not-a-tab'];
if (byline_admin_submenu_file('') !== 'byline-planning') {
    fail('An unknown Planning tab must fall back to the Planning landing entry.');
}
$_GET = ['page' => 'byline-planning', 'tab' => 'stories', 'view' => 'list'];
if (byline_admin_submenu_file('') !== 'admin.php?page=byline-planning&tab=stories') {
    fail('A Stories view deep link must still highlight Stories.');
}

$_GET = ['page' => 'byline-planning', 'story' => '42'];
if (byline_admin_parent_file('') !== 'byline'
    || byline_admin_submenu_file('') !== 'admin.php?page=byline-planning&tab=stories') {
    fail('An open story workspace must highlight Stories under Byline.');
}

// Polls and retired Studio URLs must not activate the Byline configuration menu.
foreach (['byline-studio', 'byline-polls'] as $workflow_page) {
    $_GET = ['page' => $workflow_page];
    $test_screen = (object) ['id' => 'toplevel_page_' . $workflow_page, 'post_type' => null];
    if (byline_admin_parent_file('') === 'byline' || byline_admin_submenu_file('') === 'byline') {
        fail("{$workflow_page} must not highlight the Byline configuration menu.");
    }
}

// Events are their own top-level menu, so Byline must not claim them.
$test_screen = (object) ['id' => 'edit-' . WWH_SCHOOL_EVENT_POST_TYPE, 'post_type' => WWH_SCHOOL_EVENT_POST_TYPE];
if (byline_admin_parent_file('edit.php?post_type=' . WWH_SCHOOL_EVENT_POST_TYPE) !== 'edit.php?post_type=' . WWH_SCHOOL_EVENT_POST_TYPE) {
    fail('Events must own their native top-level menu rather than reporting to Byline.');
}

// ---------------------------------------------------------------------------
// Callbacks authorize independently of menu visibility.
// ---------------------------------------------------------------------------

$_GET = ['page' => 'byline-publication'];
$test_screen = null;
$test_capabilities = [];
$callback_rejected = false;
try {
    byline_render_admin_app();
} catch (RuntimeException $exception) {
    $callback_rejected = true;
}
if (!$callback_rejected) {
    fail('The native page callback did not independently enforce its capability.');
}

$_GET = ['page' => 'byline-studio'];
$test_capabilities = ['edit_posts' => true];
$studio_rejected = false;
try {
    byline_render_admin_app();
} catch (RuntimeException $exception) {
    $studio_rejected = true;
}
if (!$studio_rejected) {
    fail('A retired Studio URL must not authorize users with only edit_posts.');
}

$_GET = ['page' => 'byline-polls'];
$test_features = ['polls' => false, 'sports' => true];
$test_capabilities = ['edit_posts' => true];
$polls_rejected = false;
try {
    byline_render_admin_app();
} catch (RuntimeException $exception) {
    $polls_rejected = true;
}
if (!$polls_rejected) {
    fail('Polls must reject requests when the polls feature is disabled.');
}
$test_features = ['polls' => true, 'sports' => true, 'events' => true, 'discord' => true];

$_GET = ['page' => 'byline-settings', 'tab' => 'branding'];
$test_capabilities = [BYLINE_MANAGE_CAPABILITY => true];
ob_start();
byline_render_admin_app();
$rendered_root = (string) ob_get_clean();
if (strpos($rendered_root, 'id="byline-admin-root"') === false) {
    fail('An authorized native Byline page did not render its React mount.');
}

// ---------------------------------------------------------------------------
// Source-level guarantees: native menu ownership, no custom sidebar shell.
// ---------------------------------------------------------------------------

$index_source = file_get_contents(__DIR__ . '/../src/index.tsx');
$style_source = file_get_contents(__DIR__ . '/../src/style.css');
$game_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
$roster_source = file_get_contents(__DIR__ . '/../includes/sports-rosters.php');
$app_source = file_get_contents(__DIR__ . '/../includes/admin/app.php');

if (!is_string($index_source) || !is_string($style_source) || !is_string($game_source)
    || !is_string($roster_source) || !is_string($app_source)) {
    fail('Could not read plugin sources for the navigation regression.');
}

if (strpos($index_source, 'byline-admin-sidebar') !== false
    || strpos($index_source, 'byline-admin-nav') !== false
    || strpos($index_source, 'hashchange') !== false
    || strpos($style_source, 'byline-admin-sidebar') !== false
    || strpos($style_source, 'byline-admin-nav') !== false) {
    fail('The duplicate global Byline sidebar/hash shell regressed.');
}
if (strpos($index_source, 'byline-settings-rail') === false) {
    fail('The unified Settings screen must own a local settings rail.');
}
if (strpos($game_source, "add_options_page(\n        'Byline Legacy Integration Settings'") !== false
    || strpos($game_source, "'Byline Legacy Settings'") !== false) {
    fail('The legacy WordPress Settings menu entry must stay retired.');
}

// The custom global header that repeated the sidebar as HOME/WORK/DESK/
// INSIGHTS/DESIGN/SETTINGS groups is gone, and so is the code behind it.
$home_style_source = file_get_contents(__DIR__ . '/../src/home/style.css');
$navigation_model_source = file_get_contents(__DIR__ . '/../src/home/navigation-model.ts');
if (!is_string($home_style_source) || !is_string($navigation_model_source)) {
    fail('Could not read the Byline home sources for the navigation regression.');
}
if (file_exists(__DIR__ . '/../src/home/AdminNavigation.tsx')) {
    fail('The custom Byline mega-navigation component is back.');
}
foreach ([
    'index.tsx' => $index_source,
    'src/home/style.css' => $home_style_source,
    'src/home/navigation-model.ts' => $navigation_model_source,
] as $label => $source) {
    if (strpos($source, 'byline-primary-nav') !== false
        || strpos($source, 'AdminNavigation') !== false
        || strpos($source, 'buildAdminNavigation') !== false) {
        fail("A second persistent Byline navigation layer regressed in {$label}.");
    }
}

// No CPT may report to the Byline configuration menu any more.
if (preg_match("/'show_in_menu'\\s*=>\\s*'byline'/", $game_source)
    || preg_match("/'show_in_menu'\\s*=>\\s*'byline'/", $roster_source)) {
    fail('Sports/Events post types must no longer be registered under the Byline menu.');
}

// Historical sports storage stays hidden and cannot be edited. Events remain independent.
foreach ([$game_source, $roster_source] as $source) {
    if (strpos($source, "'show_ui' => false") === false
        || strpos($source, "'capabilities' => byline_sports_archive_capabilities()") === false) {
        fail('Legacy sports post types must be retained without an editor.');
    }
}
if (!preg_match("/'show_in_menu'\\s*=>\\s*byline_admin_feature_enabled\\('events'\\)/", $game_source)) {
    fail('Events must retain their native menu.');
}
foreach (['wwh_render_sports_import_page', 'wwh_save_sports_game', 'wwh_create_sports_team'] as $removed) {
    if (strpos($game_source, 'function ' . $removed . '(') !== false) fail('Retired sports editor function remains: ' . $removed);
}

// Menu section headings must not be faked by mutating core menu globals.
if (preg_match("/\\\$GLOBALS\\[['\"]menu['\"]\\]/", $app_source)
    || preg_match("/global\\s+\\\$submenu\\s*;/", $app_source)) {
    fail('Byline must not manipulate WordPress menu globals to build sections.');
}

// Contributors land in Today, while other roles and administrative contexts
// keep Dashboard. Exercise both the sidebar action and direct Dashboard visits.
if (!in_array('byline_admin_hide_contributor_dashboard', $registered_actions['admin_menu'] ?? [], true)
    || !in_array('byline_admin_redirect_contributor_dashboard', $registered_actions['load-index.php'] ?? [], true)
    || in_array('byline_admin_redirect_contributor_dashboard', $registered_actions['admin_init'] ?? [], true)) {
    fail('Contributor Dashboard routing must be registered only on the Dashboard load hook.');
}
foreach ([
    'contributor' => [['contributor'], ['edit_posts'], false, false, true],
    'author' => [['author'], ['edit_posts', 'publish_posts'], false, false, false],
    'subscriber' => [['subscriber'], ['read'], false, false, false],
    'editor' => [['editor'], ['edit_posts', 'edit_others_posts'], false, false, false],
    'contributor-editor' => [['contributor', 'editor'], ['edit_posts', 'edit_others_posts'], false, false, false],
    'contributor-admin' => [['contributor', 'administrator'], ['edit_posts', 'manage_options'], false, false, false],
    'contributor-manager' => [['contributor'], ['edit_posts', BYLINE_MANAGE_CAPABILITY], false, false, false],
    'contributor-integrations' => [['contributor'], ['edit_posts', BYLINE_MANAGE_INTEGRATIONS_CAPABILITY], false, false, false],
    'contributor-without-stories' => [['contributor'], ['read'], false, false, false],
    'network-admin' => [['contributor'], ['edit_posts'], true, false, false],
    'user-admin' => [['contributor'], ['edit_posts'], false, true, false],
] as $profile => [$test_roles, $capabilities, $test_network_admin, $test_user_admin, $hidden]) {
    $test_capabilities = array_fill_keys($capabilities, true);
    $registered_menus = ['index.php' => [], 'edit.php' => [], 'profile.php' => []];
    byline_admin_hide_contributor_dashboard();
    if (isset($registered_menus['index.php']) === $hidden
        || !isset($registered_menus['edit.php'], $registered_menus['profile.php'])) {
        fail("Dashboard menu visibility is wrong for {$profile}, or another menu was removed.");
    }
    $redirected_to = null;
    try {
        byline_admin_redirect_contributor_dashboard();
    } catch (RuntimeException $exception) {
        if (strpos($exception->getMessage(), 'redirect:') !== 0) {
            throw $exception;
        }
    }
    $expected_redirect = $hidden ? byline_admin_page_url(BYLINE_ADMIN_PLANNING_PAGE, ['tab' => 'today']) : null;
    if ($redirected_to !== $expected_redirect) {
        fail("Dashboard redirect is wrong for {$profile}.");
    }
}

echo "Byline admin navigation regression passed.\n";
