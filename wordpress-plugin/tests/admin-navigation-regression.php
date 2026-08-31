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
    global $registered_menus;
    $registered_menus[$args[3]] = $args;
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
// Menu architecture: newsroom workflows are top-level, Byline is configuration.
// ---------------------------------------------------------------------------

byline_register_admin_app();

$expected_top_level = [
    'byline-planning' => ['title' => 'Planning', 'capability' => 'edit_posts', 'position' => 26],
    'byline-studio' => ['title' => 'Studio', 'capability' => BYLINE_EDIT_DESIGN_CAPABILITY, 'position' => 27],
    'byline' => ['title' => 'Byline', 'capability' => BYLINE_MANAGE_CAPABILITY, 'position' => 100],
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

// Studio must not be labelled "Byline Studio" in the sidebar.
if ($registered_menus['byline-studio'][1] === 'Byline Studio') {
    fail('Studio should read as "Studio" in the sidebar.');
}
if ($registered_menus['byline-studio'][0] !== 'Byline Studio') {
    fail('The Studio screen title should still read "Byline Studio".');
}

// Planning owns its destinations as native submenu entries, so the sidebar is
// the only persistent navigation a user has to learn.
$by_parent = submenus_by_parent();
$planning_children = $by_parent['byline-planning'] ?? [];
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
// The landing child reuses the parent slug, which is how WordPress is told not
// to add a duplicate "Planning > Planning" entry above it.
if (array_key_first($planning_children) !== 'byline-planning') {
    fail('The Planning landing entry must reuse the parent slug so WordPress does not duplicate it.');
}
// Planning destinations are deep links into the already registered page, so
// they must not register a second render callback.
foreach ($planning_children as $slug => $submenu) {
    if (($submenu[5] ?? '') !== '') {
        fail("Planning child {$slug} must not register its own callback.");
    }
}

// Byline configuration children.
$byline_children = $by_parent['byline'] ?? [];
$expected_children = [
    'byline' => ['Home', BYLINE_MANAGE_CAPABILITY],
    'byline-publication' => ['Publication', BYLINE_MANAGE_CAPABILITY],
    'byline-theme' => ['Theme', BYLINE_MANAGE_CAPABILITY],
    'byline-integrations' => ['Integrations', BYLINE_MANAGE_INTEGRATIONS_CAPABILITY],
    'byline-settings' => ['Settings', BYLINE_MANAGE_CAPABILITY],
];
foreach ($expected_children as $slug => [$title, $capability]) {
    if (!isset($byline_children[$slug])) {
        fail("Byline should still own the {$slug} configuration screen.");
    }
    if ($byline_children[$slug][2] !== $title) {
        fail("Byline child {$slug} should be titled {$title}, got {$byline_children[$slug][2]}.");
    }
    if ($byline_children[$slug][3] !== $capability || byline_admin_page_capability($slug) !== $capability) {
        fail("Capability mapping changed for {$slug}.");
    }
}

// The Byline configuration landing child is now Home.
if ($byline_children['byline'][2] === 'Dashboard') {
    fail('The Byline Dashboard child should have been renamed to Home.');
}

// Byline Doctor keeps its name and its own entry, pointing at the unchanged
// diagnostics URL rather than a new page slug.
$doctor_slug = 'admin.php?page=byline-settings&tab=diagnostics';
if (!isset($byline_children[$doctor_slug])) {
    fail('Byline Doctor must be reachable from the Byline menu.');
}
if ($byline_children[$doctor_slug][2] !== 'Byline Doctor') {
    fail('Byline Doctor must keep its name in the sidebar.');
}
if ($byline_children[$doctor_slug][3] !== BYLINE_MANAGE_CAPABILITY
    || byline_admin_doctor_menu_slug() !== $doctor_slug) {
    fail('Byline Doctor must carry the Settings capability and the canonical diagnostics URL.');
}
if (($byline_children[$doctor_slug][5] ?? '') !== '') {
    fail('Byline Doctor is a deep link into Settings and must not register a second callback.');
}

// Byline must no longer own workflow screens.
foreach (['byline-studio', 'byline-polls', 'byline-teams'] as $moved) {
    if (isset($byline_children[$moved])) {
        fail("Byline should no longer contain {$moved} after the IA refactor.");
    }
}
if (count($byline_children) !== count($expected_children) + 1) {
    fail('Byline gained an unexpected configuration child.');
}

// ---------------------------------------------------------------------------
// Feature flags gate the workflow menus.
// ---------------------------------------------------------------------------

reset_menu_state();
$test_features = ['polls' => false, 'sports' => false, 'events' => false];
byline_register_admin_app();
if (!isset($registered_menus['byline-studio']) || !isset($registered_menus['byline'])) {
    fail('Studio and Byline must remain registered regardless of optional features.');
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
if (byline_admin_menu_capability() === 'edit_posts') {
    fail('A reporter who can only edit posts must not surface the Byline configuration menu.');
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
$reporter_planning = submenus_by_parent()['byline-planning'] ?? [];
if (($reporter_planning['admin.php?page=byline-planning&tab=feedback'][3] ?? '') !== BYLINE_MANAGE_CAPABILITY) {
    fail('Feedback must not become visible to a reporter who can only edit their own posts.');
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
    || strpos($urls['publication']['branding'], 'page=byline-publication') === false
    || strpos($urls['publication']['branding'], 'tab=branding') === false
    || strpos($urls['integrations']['deployment'], 'page=byline-integrations') === false
    || strpos($urls['integrations']['deployment'], 'tab=deployment') === false
    || strpos($urls['settings']['diagnostics'], 'page=byline-settings') === false
    || strpos($urls['settings']['diagnostics'], 'tab=diagnostics') === false
    || strpos($urls['studio'], 'page=byline-studio') === false
    || strpos($urls['studioRevisions'], 'page=byline-studio') === false
    || strpos($urls['studioRevisions'], 'view=revisions') === false) {
    fail('Native Byline page URLs did not preserve deep-linkable tabs/views.');
}

$native = byline_admin_native_urls();
if (strpos($native['games'], 'post_type=' . WWH_SPORTS_GAME_POST_TYPE) === false
    || strpos($native['rosters'], 'post_type=' . WWH_SPORTS_ROSTER_POST_TYPE) === false
    || strpos($native['events'], 'post_type=' . WWH_SCHOOL_EVENT_POST_TYPE) === false) {
    fail('Native CPT URLs must not change when their parent menu changes.');
}
if (strpos($native['teams'], 'page=wwh-sports-team-settings') === false
    || strpos($native['teams'], 'post_type=' . WWH_SPORTS_GAME_POST_TYPE) === false) {
    fail('Teams should resolve to the native Sports team settings screen.');
}
if (strpos($native['sportsImport'], 'page=wwh-sports-import') === false
    || strpos($native['sportsExport'], 'page=wwh-sports-export') === false) {
    fail('Sports import/export URLs are missing from the admin bridge.');
}

$legacy_urls = byline_admin_legacy_hash_urls($urls);
if (($legacy_urls['/home'] ?? '') !== $urls['planning']['today']
    || ($legacy_urls['/planning/today'] ?? '') !== $urls['planning']['today']
    || $legacy_urls['/publication/branding'] !== $urls['publication']['branding']
    || $legacy_urls['/design/revisions'] !== $urls['studioRevisions']
    || $legacy_urls['/design/studio'] !== $urls['studio']
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
if (!is_string($redirected_to) || strpos($redirected_to, 'page=wwh-sports-team-settings') === false || strpos($redirected_to, 'page=byline-teams') !== false) {
    fail('The retired byline-teams URL must redirect to the Sports team screen.');
}

$_GET = ['page' => 'byline-publication'];
$redirected_to = null;
byline_admin_redirect_legacy_pages();
if ($redirected_to !== null) {
    fail('The legacy redirect must not fire on current Byline screens.');
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

// Byline configuration screens highlight Byline plus their own child.
foreach (['byline', 'byline-publication', 'byline-theme', 'byline-integrations', 'byline-settings'] as $config_page) {
    $_GET = ['page' => $config_page];
    $test_screen = (object) ['id' => 'byline_page_' . $config_page, 'post_type' => null];
    if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== $config_page) {
        fail("Byline configuration screen {$config_page} lost its native highlighting.");
    }
}

$_GET = ['page' => 'byline-integrations', 'tab' => 'discord'];
if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== 'byline-integrations') {
    fail('Byline > Integrations > Discord must highlight the Integrations child.');
}

// Diagnostics is Byline Doctor's own entry, not a view of Settings.
$_GET = ['page' => 'byline-settings', 'tab' => 'diagnostics'];
if (byline_admin_parent_file('') !== 'byline' || byline_admin_submenu_file('') !== $doctor_slug) {
    fail('The diagnostics URL must highlight Byline Doctor.');
}
foreach (['access', 'api', 'compatibility', ''] as $settings_tab) {
    $_GET = $settings_tab === '' ? ['page' => 'byline-settings'] : ['page' => 'byline-settings', 'tab' => $settings_tab];
    if (byline_admin_submenu_file('') !== 'byline-settings') {
        fail('Settings tabs other than diagnostics must keep highlighting Settings.');
    }
}

// Every Planning destination highlights itself, on a direct link or a refresh.
$_GET = ['page' => 'byline-planning'];
$test_screen = (object) ['id' => 'toplevel_page_byline-planning', 'post_type' => null];
if (byline_admin_parent_file('byline-planning') !== 'byline-planning' || byline_admin_submenu_file('') !== 'byline-planning') {
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
    if (byline_admin_parent_file('byline-planning') !== 'byline-planning') {
        fail("Planning tab {$planning_tab} must keep the Planning menu open.");
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

// Studio and Polls are their own top-level menus, so Byline must not claim them.
foreach (['byline-studio', 'byline-polls'] as $workflow_page) {
    $_GET = ['page' => $workflow_page];
    $test_screen = (object) ['id' => 'toplevel_page_' . $workflow_page, 'post_type' => null];
    if (byline_admin_parent_file('') === 'byline' || byline_admin_submenu_file('') === 'byline') {
        fail("{$workflow_page} must not highlight the Byline configuration menu.");
    }
}

// Studio revisions keep Studio active.
$_GET = ['page' => 'byline-studio', 'view' => 'revisions'];
$test_screen = (object) ['id' => 'toplevel_page_byline-studio', 'post_type' => null];
if (byline_admin_parent_file('byline-studio') !== 'byline-studio') {
    fail('Studio revisions must keep the Studio menu active.');
}

// Sports content screens.
$_GET = [];
$test_screen = (object) ['id' => 'edit-' . WWH_SPORTS_GAME_POST_TYPE, 'post_type' => WWH_SPORTS_GAME_POST_TYPE];
if (byline_admin_parent_file('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE) !== 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE) {
    fail('Games must stay under the native Sports parent.');
}

$test_screen = (object) ['id' => 'edit-' . WWH_SPORTS_ROSTER_POST_TYPE, 'post_type' => WWH_SPORTS_ROSTER_POST_TYPE];
if (byline_admin_parent_file('edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE) !== 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE
    || byline_admin_submenu_file('') !== 'edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE) {
    fail('Rosters must highlight Sports > Rosters.');
}

// Each sports utility highlights itself, not the Games list.
foreach ([
    'wwh-sports-import',
    'wwh-sports-export',
    'wwh-sports-roster-import',
    'wwh-sports-team-settings',
] as $utility) {
    $test_screen = (object) ['id' => WWH_SPORTS_GAME_POST_TYPE . '_page_' . $utility, 'post_type' => WWH_SPORTS_GAME_POST_TYPE];
    if (byline_admin_parent_file('') !== 'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE) {
        fail("Sports utility {$utility} must sit under the Sports parent.");
    }
    if (byline_admin_submenu_file('') !== $utility) {
        fail("Sports utility {$utility} must highlight its own submenu entry, not the Games list.");
    }
}

// With sports disabled there is no Sports menu, so the filters stay out of it.
$test_features = ['polls' => true, 'sports' => false, 'events' => false];
$test_screen = (object) ['id' => 'edit-' . WWH_SPORTS_ROSTER_POST_TYPE, 'post_type' => WWH_SPORTS_ROSTER_POST_TYPE];
if (byline_admin_parent_file('edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE) !== 'edit.php?post_type=' . WWH_SPORTS_ROSTER_POST_TYPE) {
    fail('Rosters must not be pointed at a Sports menu that is not registered.');
}
if (byline_admin_parent_file(null) !== null) {
    fail('Disabled sports must still preserve null parent state.');
}
$test_features = ['polls' => true, 'sports' => true, 'events' => true, 'discord' => true];

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
    fail('Studio must reject a user without the design capability even though it is top-level.');
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

$_GET = ['page' => 'byline-publication'];
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
    fail('The duplicate Byline sidebar/hash shell regressed.');
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

// Sports and Events own their top-level menus, gated on their feature flags.
if (!preg_match("/'show_in_menu'\\s*=>\\s*byline_admin_feature_enabled\\('sports'\\)/", $game_source)
    || !preg_match("/'menu_position'\\s*=>\\s*BYLINE_MENU_POSITION_SPORTS/", $game_source)) {
    fail('The Sports Games post type must own a feature-gated top-level Sports menu.');
}
if (!preg_match("/'show_in_menu'\\s*=>\\s*byline_admin_feature_enabled\\('events'\\)/", $game_source)
    || !preg_match("/'menu_position'\\s*=>\\s*BYLINE_MENU_POSITION_EVENTS/", $game_source)) {
    fail('The School Event post type must own a feature-gated top-level Events menu.');
}
if (!preg_match("/'show_in_menu'\\s*=>\\s*byline_admin_feature_enabled\\('sports'\\)\\s*\\?\\s*byline_sports_menu_parent\\(\\)\\s*:\\s*false/", $roster_source)) {
    fail('Rosters must be registered beneath the Sports menu and hidden when sports is off.');
}

// Sports utility screens must not register when the feature is disabled.
if (!preg_match("/if \\(!byline_admin_feature_enabled\\('sports'\\)\\)/", $game_source)
    || !preg_match("/if \\(!byline_admin_feature_enabled\\('sports'\\)\\)/", $roster_source)) {
    fail('Sports utility submenus must be gated on the sports feature.');
}

// The sidebar labels the workflow, not the implementation owner.
if (strpos($game_source, "'menu_name' => 'Sports'") === false
    || strpos($game_source, "'all_items' => 'Games'") === false
    || strpos($roster_source, "'menu_name' => 'Rosters'") === false) {
    fail('Sports menu labels should read as the newsroom workflow.');
}

// Menu section headings must not be faked by mutating core menu globals.
if (preg_match("/\\\$GLOBALS\\[['\"]menu['\"]\\]/", $app_source)
    || preg_match("/global\\s+\\\$submenu\\s*;/", $app_source)) {
    fail('Byline must not manipulate WordPress menu globals to build sections.');
}

echo "Byline admin navigation regression passed.\n";
