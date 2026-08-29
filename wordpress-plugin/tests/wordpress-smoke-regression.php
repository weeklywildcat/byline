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
const BYLINE_PLUGIN_VERSION = '0.0.0-smoke';
const BYLINE_REST_NAMESPACE = 'byline/v1';
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
$byline_smoke_posts = [];
$byline_smoke_meta = [];
$byline_smoke_meta_boxes = [];
$byline_smoke_scripts = [];
$byline_smoke_fired_actions = [];

class WP_Post
{
    public int $ID = 0;
    public int $post_author = 1;
    public string $post_type = 'post';
    public string $post_status = 'draft';
    public string $post_title = '';
}

class WP_User
{
    public int $ID = 1;
    public string $display_name = 'Smoke User';
}

class WP_Error
{
    private string $code;
    public function __construct(string $code = '', string $message = '', array $data = [])
    {
        $this->code = $code;
    }
    public function get_error_code(): string
    {
        return $this->code;
    }
}

class WP_Screen
{
    public string $id = '';
    public string $base = '';
    public ?string $post_type = null;
    private bool $block_editor = false;
    public function __construct(string $id, string $base, ?string $post_type, bool $block_editor)
    {
        $this->id = $id;
        $this->base = $base;
        $this->post_type = $post_type;
        $this->block_editor = $block_editor;
    }
    public function is_block_editor(): bool
    {
        return $this->block_editor;
    }
}

class WP_Query
{
    private array $vars;
    public array $applied = [];
    public function __construct(array $vars) { $this->vars = $vars; }
    public function is_main_query(): bool { return true; }
    public function get(string $key) { return $this->vars[$key] ?? ''; }
    public function set(string $key, $value): void { $this->applied[$key] = $value; }
}

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

function do_action(string $tag, ...$args): void
{
    global $byline_smoke_fired_actions;
    $byline_smoke_fired_actions[] = $tag;
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

function current_user_can(string $capability, ...$args): bool
{
    global $byline_smoke_capabilities;
    return !empty($byline_smoke_capabilities[$capability]);
}

function user_can($user, string $capability, ...$args): bool
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

function esc_attr($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES);
}

function esc_html($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES);
}

function esc_textarea($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES);
}

function selected($haystack, $current, $echo = true): string
{
    return (string) $haystack === (string) $current ? ' selected' : '';
}

function absint($value): int
{
    return abs((int) $value);
}

function is_admin(): bool
{
    return true;
}

function is_wp_error($thing): bool
{
    return $thing instanceof WP_Error;
}

function sanitize_text_field($value): string
{
    return trim(strip_tags((string) $value));
}

function sanitize_textarea_field($value): string
{
    return trim(strip_tags((string) $value));
}

function register_post_meta(...$args): bool
{
    return true;
}

function register_rest_route(...$args): void
{
}

function rest_authorization_required_code(): int
{
    return 401;
}

function get_post($id)
{
    global $byline_smoke_posts;
    return $byline_smoke_posts[$id] ?? null;
}

function get_user_by($field, $value)
{
    $user = new WP_User();
    $user->ID = (int) $value;
    $user->display_name = 'User ' . (int) $value;
    return $user;
}

function get_users(array $args = []): array
{
    return [(object) ['ID' => 7, 'display_name' => 'Jane Smith']];
}

function get_post_meta($post_id, $key, $single = false)
{
    global $byline_smoke_meta;
    return $byline_smoke_meta[$post_id][$key] ?? '';
}

function update_post_meta($post_id, $key, $value): void
{
    global $byline_smoke_meta;
    $byline_smoke_meta[$post_id][$key] = $value;
}

function delete_post_meta($post_id, $key): void
{
    global $byline_smoke_meta;
    unset($byline_smoke_meta[$post_id][$key]);
}

function add_meta_box($id, $title, $callback, $screen = null, $context = 'advanced', $priority = 'default'): void
{
    global $byline_smoke_meta_boxes;
    $byline_smoke_meta_boxes[$id] = ['title' => $title, 'callback' => $callback];
}

function wp_nonce_field(...$args): void
{
}

function wp_verify_nonce(...$args): bool
{
    return true;
}

function wp_is_post_autosave($id): bool
{
    return false;
}

function wp_is_post_revision($id): bool
{
    return false;
}

function plugins_url(string $path, string $plugin): string
{
    return 'https://cms.example.test/wp-content/plugins/byline/' . $path;
}

function wp_enqueue_script(string $handle, string $src = '', array $deps = [], $ver = false, $in_footer = false): void
{
    global $byline_smoke_scripts;
    $byline_smoke_scripts[$handle] = $deps;
}

function wp_localize_script(string $handle, string $object_name, array $data): bool
{
    return true;
}

function wp_enqueue_style(string $handle, $src = '', array $deps = [], $ver = false): void
{
}

function wp_register_style(string $handle, $src = false, array $deps = [], $ver = false): void
{
}

function wp_add_inline_style(string $handle, string $css): void
{
}

function wp_set_script_translations(...$args): void
{
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

// --- editorial workflow -----------------------------------------------------
//
// Loading and driving the editorial surfaces here is what catches the class of
// failure this harness exists for: an undefined constant, a wrong hook
// signature, or a TypeError that would take down wp-admin before any browser
// test could start.
// The earlier capability checks leave the harness user unprivileged; editorial
// workflow is exercised as a user who can edit stories and assign them.
$byline_smoke_capabilities = ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true];

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/editorial/rest.php';
require __DIR__ . '/../includes/editorial/admin.php';

foreach ([
    'init' => 'byline_editorial_register_meta',
    'rest_api_init' => 'byline_editorial_register_rest_routes',
    'admin_enqueue_scripts' => 'byline_editorial_enqueue_editor_assets',
    'add_meta_boxes_post' => 'byline_editorial_register_meta_box',
    'save_post_post' => 'byline_editorial_save_meta_box',
    'pre_get_posts' => 'byline_editorial_filter_posts_query',
    'restrict_manage_posts' => 'byline_editorial_render_posts_filter',
] as $tag => $callback) {
    if (!in_array($callback, $byline_smoke_actions[$tag] ?? [], true)) {
        byline_smoke_fail("Editorial workflow callback {$callback} is not hooked to {$tag}.");
    }
}

$byline_smoke_story = new WP_Post();
$byline_smoke_story->ID = 4242;
$byline_smoke_story->post_title = 'Smoke story';
$byline_smoke_posts[4242] = $byline_smoke_story;

// A block editor, a classic editor, the Posts list, and unrelated Byline post
// types all have to resolve without throwing.
foreach ([
    ['hook' => 'post.php', 'screen' => new WP_Screen('post', 'post', 'post', true)],
    ['hook' => 'post-new.php', 'screen' => new WP_Screen('post', 'post', 'post', false)],
    ['hook' => 'edit.php', 'screen' => new WP_Screen('edit-post', 'edit', 'post', false)],
    ['hook' => 'post.php', 'screen' => new WP_Screen('ww_sports_game', 'post', WWH_SPORTS_GAME_POST_TYPE, true)],
    ['hook' => 'toplevel_page_byline-studio', 'screen' => new WP_Screen('toplevel_page_byline-studio', 'toplevel_page', null, false)],
] as $case) {
    $byline_smoke_screen = $case['screen'];

    try {
        byline_editorial_enqueue_editor_assets($case['hook']);
        byline_editorial_admin_styles();
        byline_editorial_register_meta_box();

        ob_start();
        byline_editorial_render_posts_filter('post');
        byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 4242);
        ob_end_clean();
    } catch (Throwable $exception) {
        byline_smoke_fail("Editorial workflow threw on {$case['screen']->id}: " . $exception->getMessage());
    }
}

// The Studio bundle must never be dragged into a post editor.
if (isset($byline_smoke_scripts['byline-admin'])) {
    byline_smoke_fail('The Byline admin application was enqueued into the post editor.');
}

// The classic metabox renders, and a representative draft saves, without a
// fatal. The block editor gets the sidebar instead, never both.
$byline_smoke_screen = new WP_Screen('post', 'post', 'post', false);
$byline_smoke_meta_boxes = [];

try {
    byline_editorial_register_meta_box();
    ob_start();
    byline_editorial_render_meta_box($byline_smoke_story);
    ob_end_clean();
} catch (Throwable $exception) {
    byline_smoke_fail('The classic workflow metabox threw: ' . $exception->getMessage());
}

if (!isset($byline_smoke_meta_boxes['byline-editorial-workflow'])) {
    byline_smoke_fail('The classic workflow metabox was not registered outside the block editor.');
}

$byline_smoke_screen = new WP_Screen('post', 'post', 'post', true);
$byline_smoke_meta_boxes = [];
byline_editorial_register_meta_box();
if ($byline_smoke_meta_boxes !== []) {
    byline_smoke_fail('The block editor was given a duplicate classic workflow metabox.');
}

$_POST = [
    'byline_editorial_workflow_nonce' => 'nonce',
    'byline_editorial_status' => 'writing',
    'byline_editorial_editor' => '7',
    'byline_editorial_deadline' => '2026-09-30',
    'byline_editorial_visuals' => 'Scoreboard photo',
];

try {
    byline_editorial_save_meta_box(4242);
} catch (Throwable $exception) {
    byline_smoke_fail('Saving a representative draft threw: ' . $exception->getMessage());
}

if (byline_get_editorial_status(4242) !== 'writing' || byline_get_editorial_editor_id(4242) !== 7) {
    byline_smoke_fail('A representative draft save did not persist its editorial workflow.');
}

// The domain announces the change; integrations subscribe. It must never call
// one, so that an unreachable service cannot block an editorial change.
if (!in_array('byline_editorial_story_updated', $byline_smoke_fired_actions, true)) {
    byline_smoke_fail('An editorial workflow change did not announce itself to integrations.');
}
$_POST = [];

// The Posts list column reports the effective status for both publication
// states, and the filter constrains only the query it owns.
ob_start();
byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 4242);
$byline_smoke_column = (string) ob_get_clean();
if (strpos($byline_smoke_column, 'Writing') === false) {
    byline_smoke_fail('The Posts list Workflow column did not render its status label.');
}

$byline_smoke_story->post_status = 'publish';
ob_start();
byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 4242);
if (strpos((string) ob_get_clean(), 'Published') === false) {
    byline_smoke_fail('A published story did not report the derived Published workflow state.');
}
$byline_smoke_story->post_status = 'draft';

$_GET = [BYLINE_EDITORIAL_LIST_FILTER => 'editing'];
$byline_smoke_query = new WP_Query(['post_type' => 'post']);
byline_editorial_filter_posts_query($byline_smoke_query);
if (!isset($byline_smoke_query->applied['meta_query'])) {
    byline_smoke_fail('The Posts list workflow filter did not constrain its own query.');
}

$byline_smoke_query = new WP_Query(['post_type' => 'page']);
byline_editorial_filter_posts_query($byline_smoke_query);
if ($byline_smoke_query->applied !== []) {
    byline_smoke_fail('The Posts list workflow filter altered an unrelated admin query.');
}
$_GET = [];

echo "Byline WordPress admin smoke regression passed.\n";
