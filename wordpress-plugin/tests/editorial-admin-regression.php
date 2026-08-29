<?php

/**
 * The WordPress admin surfaces for editorial workflow.
 *
 * Three things must hold and are easy to break silently:
 *  - the block editor gets the dedicated small bundle and nothing else, and only
 *    on a story;
 *  - the classic metabox and the Gutenberg sidebar are never both present;
 *  - the Posts list column and filter read the canonical status, including the
 *    default that stories predating the workflow have no metadata for.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_PLUGIN_VERSION = '0.0.0-test';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const WWH_DISCORD_THREAD_META = '_wwh_discord_thread_id';

class WP_Post { public int $ID = 0; public int $post_author = 1; public string $post_type = 'post'; public string $post_status = 'draft'; public string $post_title = ''; }
class WP_User { public int $ID = 1; public string $display_name = 'Test User'; }
class WP_Error { public string $code; public function __construct(string $code = '', string $message = '', array $data = []) { $this->code = $code; } }
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
    public function is_block_editor(): bool { return $this->block_editor; }
}
class WP_Query
{
    private array $vars;
    private bool $main;
    public array $applied = [];
    public function __construct(array $vars, bool $main = true) { $this->vars = $vars; $this->main = $main; }
    public function is_main_query(): bool { return $this->main; }
    public function get(string $key) { return $this->vars[$key] ?? ''; }
    public function set(string $key, $value): void { $this->vars[$key] = $value; $this->applied[$key] = $value; }
}

$byline_posts = [];
$byline_meta = [];
$byline_screen = null;
$byline_meta_boxes = [];
$byline_enqueued_scripts = [];
$byline_localized_scripts = [];
$byline_enqueued_styles = [];
$byline_capabilities = ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true];
$byline_meta_queries = 0;

function byline_test_fail(string $message): void { fwrite(STDERR, $message . "\n"); exit(1); }

function add_action(...$args): void {}
function add_filter(...$args): void {}
function do_action(...$args): void {}
function register_post_meta(...$args): bool { return true; }
function register_rest_route(...$args): void {}
function sanitize_key($value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function esc_attr($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_textarea($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_url($value): string { return (string) $value; }
function selected($haystack, $current, $echo = true): string { return (string) $haystack === (string) $current ? ' selected' : ''; }
function absint($value): int { return abs((int) $value); }
function is_admin(): bool { return true; }
function current_user_can(string $capability, ...$args): bool { global $byline_capabilities; return !empty($byline_capabilities[$capability]); }
function user_can($user, string $capability, ...$args): bool { global $byline_capabilities; return !empty($byline_capabilities[$capability]); }
function get_current_screen() { global $byline_screen; return $byline_screen; }
function get_post($id) { global $byline_posts; return $byline_posts[$id] ?? null; }
function get_user_by($field, $value) { $user = new WP_User(); $user->ID = (int) $value; $user->display_name = 'User ' . (int) $value; return $user; }
function byline_discord_setting(string $key): string { return $key === 'guildId' ? '12345678901234567' : ''; }
function get_users(array $args = []): array { return [(object) ['ID' => 7, 'display_name' => 'Jane Smith']]; }
function update_post_meta($post_id, $key, $value): void { global $byline_meta; $byline_meta[$post_id][$key] = $value; }
function delete_post_meta($post_id, $key): void { global $byline_meta; unset($byline_meta[$post_id][$key]); }
function get_post_meta($post_id, $key, $single = false) { global $byline_meta, $byline_meta_queries; $byline_meta_queries++; return $byline_meta[$post_id][$key] ?? ''; }
function is_wp_error($thing): bool { return $thing instanceof WP_Error; }
function add_meta_box($id, $title, $callback, $screen = null, $context = 'advanced', $priority = 'default'): void { global $byline_meta_boxes; $byline_meta_boxes[$id] = ['title' => $title, 'callback' => $callback]; }
function wp_nonce_field(...$args): void {}
function wp_verify_nonce(...$args): bool { return true; }
function wp_unslash($value) { return $value; }
function wp_is_post_autosave($id): bool { return false; }
function wp_is_post_revision($id): bool { return false; }
function plugins_url(string $path, string $plugin): string { return 'https://example.test/wp-content/plugins/byline/' . $path; }
function wp_enqueue_script(string $handle, string $src = '', array $deps = [], $ver = false, $in_footer = false): void { global $byline_enqueued_scripts; $byline_enqueued_scripts[$handle] = ['src' => $src, 'deps' => $deps]; }
function wp_enqueue_style(string $handle, $src = '', array $deps = [], $ver = false): void { global $byline_enqueued_styles; $byline_enqueued_styles[$handle] = $src; }
function wp_register_style(string $handle, $src = false, array $deps = [], $ver = false): void {}
function wp_add_inline_style(string $handle, string $css): void {}
function wp_set_script_translations(...$args): void {}
function wp_localize_script(string $handle, string $object_name, array $data): bool { global $byline_localized_scripts; $byline_localized_scripts[$handle][$object_name] = $data; return true; }
function admin_url(string $path = ''): string { return 'https://example.test/wp-admin/' . ltrim($path, '/'); }
function rest_authorization_required_code(): int { return 401; }

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/editorial/rest.php';
require __DIR__ . '/../includes/editorial/admin.php';

$post = new WP_Post();
$post->ID = 5;
$post->post_title = 'A story';
$byline_posts[5] = $post;

// --- editor assets ----------------------------------------------------------

$build_available = file_exists(__DIR__ . '/../build/editorial-workflow.js')
    && file_exists(__DIR__ . '/../build/editorial-workflow.asset.php');

// The bundle loads only on the block editor for a story, and never on the other
// Byline post types or on Byline's own admin screens.
$screen_cases = [
    ['screen' => new WP_Screen('post', 'post', 'post', true), 'hook' => 'post.php', 'expected' => true],
    ['screen' => new WP_Screen('post', 'post', 'post', true), 'hook' => 'post-new.php', 'expected' => true],
    ['screen' => new WP_Screen('post', 'post', 'post', false), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('page', 'post', 'page', true), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('byline_poll', 'post', 'byline_poll', true), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('ww_sports_game', 'post', 'ww_sports_game', true), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('ww_sports_roster', 'post', 'ww_sports_roster', true), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('ww_school_event', 'post', 'ww_school_event', true), 'hook' => 'post.php', 'expected' => false],
    ['screen' => new WP_Screen('edit-post', 'edit', 'post', false), 'hook' => 'edit.php', 'expected' => false],
    ['screen' => new WP_Screen('upload', 'upload', 'attachment', false), 'hook' => 'upload.php', 'expected' => false],
    ['screen' => new WP_Screen('toplevel_page_byline-studio', 'toplevel_page', null, false), 'hook' => 'toplevel_page_byline-studio', 'expected' => false],
];

foreach ($screen_cases as $case) {
    $byline_screen = $case['screen'];
    $byline_enqueued_scripts = [];
    byline_editorial_enqueue_editor_assets($case['hook']);
    $loaded = isset($byline_enqueued_scripts[BYLINE_EDITORIAL_WORKFLOW_HANDLE]);
    $want = $case['expected'] && $build_available;

    if ($loaded !== $want) {
        byline_test_fail("Workflow editor assets were mis-targeted on {$case['screen']->id} / {$case['hook']}.");
    }
    if ($loaded && count($byline_enqueued_scripts) !== 1) {
        byline_test_fail('The post editor received more than the dedicated workflow bundle.');
    }
}

if ($build_available) {
    $byline_screen = new WP_Screen('post', 'post', 'post', true);
    $byline_enqueued_scripts = [];
    byline_editorial_enqueue_editor_assets('post.php');
    $deps = $byline_enqueued_scripts[BYLINE_EDITORIAL_WORKFLOW_HANDLE]['deps'];

    // WordPress must supply React and the editor packages; the plugin must not
    // ship its own copies into the post editor.
    foreach (['wp-plugins', 'wp-editor', 'wp-element', 'wp-data', 'wp-components', 'wp-api-fetch'] as $required) {
        if (!in_array($required, $deps, true)) {
            byline_test_fail("The workflow bundle does not declare the WordPress dependency {$required}.");
        }
    }
    foreach ($deps as $dependency) {
        if ($dependency === 'react' || $dependency === 'react-dom') {
            byline_test_fail('The workflow bundle bundles React instead of using the WordPress-provided copy.');
        }
    }
    if (($byline_localized_scripts[BYLINE_EDITORIAL_WORKFLOW_HANDLE]['bylineEditorialWorkflow']['previewUrl'] ?? '') === '') {
        byline_test_fail('The workflow bundle did not receive a private preview launch URL.');
    }
}

// --- classic fallback -------------------------------------------------------

// Gutenberg gets the sidebar. Registering the metabox as well would put two
// controls for the same value on one screen.
$byline_screen = new WP_Screen('post', 'post', 'post', true);
$byline_meta_boxes = [];
byline_editorial_register_meta_box();
if ($byline_meta_boxes !== []) { byline_test_fail('The classic workflow metabox was registered inside the block editor.'); }

$byline_screen = new WP_Screen('post', 'post', 'post', false);
$byline_meta_boxes = [];
byline_editorial_register_meta_box();
if (!isset($byline_meta_boxes['byline-editorial-workflow'])) {
    byline_test_fail('The classic editor lost its workflow fallback.');
}
// Workflow is platform functionality; a publication's name must not rename it.
if ($byline_meta_boxes['byline-editorial-workflow']['title'] !== 'Byline Workflow') {
    byline_test_fail('The classic workflow metabox is not generically named.');
}

// The fallback renders the selectable stages and never offers Published.
ob_start();
byline_editorial_render_meta_box($post);
$markup = (string) ob_get_clean();
foreach (byline_editorial_selectable_status_ids() as $status) {
    if (strpos($markup, 'value="' . $status . '"') === false) {
        byline_test_fail("The classic fallback omitted the {$status} stage.");
    }
}
if (strpos($markup, 'value="published"') !== false) {
    byline_test_fail('The classic fallback offered Published as a selectable stage.');
}

// An author sees the assignment fields read-only rather than editable.
$byline_capabilities = ['edit_posts' => true, 'edit_post' => true];
ob_start();
byline_editorial_render_meta_box($post);
$author_markup = (string) ob_get_clean();
if (strpos($author_markup, 'name="byline_editorial_editor"') !== false
    || strpos($author_markup, 'name="byline_editorial_deadline"') !== false) {
    byline_test_fail('An author was shown editable assignment controls.');
}
if (strpos($author_markup, 'name="byline_editorial_status"') === false) {
    byline_test_fail('An author lost the workflow stage control for a story they can edit.');
}

// A submitted assignment from an unauthorised user is refused, not applied.
$_POST = [
    'byline_editorial_workflow_nonce' => 'nonce',
    'byline_editorial_status' => 'reporting',
    'byline_editorial_editor' => '7',
    'byline_editorial_deadline' => '2026-12-01',
    'byline_editorial_visuals' => 'Scoreboard photo',
];
byline_editorial_save_meta_box(5);
if (byline_get_editorial_editor_id(5) !== 0 || byline_get_editorial_deadline(5) !== '') {
    byline_test_fail('An unauthorised classic save applied an assignment.');
}
if (byline_get_editorial_status(5) !== 'reporting' || byline_get_editorial_visuals(5) !== 'Scoreboard photo') {
    byline_test_fail('An authorised classic save did not persist the stage or visual needs.');
}

$byline_capabilities = ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true];
byline_editorial_save_meta_box(5);
if (byline_get_editorial_editor_id(5) !== 7 || byline_get_editorial_deadline(5) !== '2026-12-01') {
    byline_test_fail('An editor could not save an assignment through the classic fallback.');
}

// Publishing removes the stage control, so a save must not disturb the stored
// stage that a later unpublish has to recover.
$post->post_status = 'publish';
unset($_POST['byline_editorial_status']);
byline_editorial_save_meta_box(5);
if (byline_get_editorial_status(5) !== 'reporting') {
    byline_test_fail('Saving a published story destroyed its stored workflow stage.');
}
$post->post_status = 'draft';
$_POST = [];

// --- posts list -------------------------------------------------------------

$columns = byline_editorial_posts_columns(['cb' => '', 'title' => 'Title', 'author' => 'Author', 'date' => 'Date']);
if (!isset($columns[BYLINE_EDITORIAL_LIST_COLUMN]) || $columns[BYLINE_EDITORIAL_LIST_COLUMN] !== 'Workflow') {
    byline_test_fail('The Posts list lost the Workflow column.');
}
if (array_keys($columns) !== ['cb', 'title', 'author', BYLINE_EDITORIAL_LIST_COLUMN, 'date']) {
    byline_test_fail('The Workflow column displaced WordPress\'s own Date column.');
}

// The column costs a bounded number of primed meta reads per row, not a query
// storm: one status read plus the cached post lookup.
$byline_meta_queries = 0;
ob_start();
byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 5);
$column = (string) ob_get_clean();
if ($byline_meta_queries > 2) { byline_test_fail('The Workflow column reads more metadata than it needs per row.'); }
// The label is always present: colour is supplemental, never the only signal.
if (strpos($column, 'Reporting') === false) { byline_test_fail('The Workflow column did not print its status label.'); }

ob_start();
byline_editorial_render_posts_column('title', 5);
if (ob_get_clean() !== '') { byline_test_fail('The Workflow column rendered into an unrelated column.'); }

$post->post_status = 'publish';
ob_start();
byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 5);
if (strpos((string) ob_get_clean(), 'Published') === false) {
    byline_test_fail('A published story did not show its effective Published workflow state.');
}
$post->post_status = 'draft';

// A story with no metadata at all still reports a label rather than a blank.
ob_start();
byline_editorial_render_posts_column(BYLINE_EDITORIAL_LIST_COLUMN, 4242);
if (strpos((string) ob_get_clean(), 'Pitch') === false) {
    byline_test_fail('A story with no workflow metadata rendered an empty column.');
}

// --- posts list filter ------------------------------------------------------

$_GET = [BYLINE_EDITORIAL_LIST_FILTER => 'editing'];
$query = new WP_Query(['post_type' => 'post']);
byline_editorial_filter_posts_query($query);
if (!isset($query->applied['meta_query'])) { byline_test_fail('The workflow filter did not constrain the Posts query.'); }
$clause = $query->applied['meta_query'][0];
if (($clause['key'] ?? '') !== BYLINE_EDITORIAL_STATUS_META || ($clause['value'] ?? '') !== 'editing') {
    byline_test_fail('The workflow filter built the wrong meta comparison.');
}

// Pitch must also match stories that predate the workflow and have no metadata.
$_GET = [BYLINE_EDITORIAL_LIST_FILTER => 'pitch'];
$query = new WP_Query(['post_type' => 'post']);
byline_editorial_filter_posts_query($query);
$clause = $query->applied['meta_query'][0];
if (($clause['relation'] ?? '') !== 'OR') { byline_test_fail('The Pitch filter did not account for absent metadata.'); }
$comparisons = array_column(array_filter($clause, 'is_array'), 'compare');
if (!in_array('NOT EXISTS', $comparisons, true)) {
    byline_test_fail('The Pitch filter would hide every story that predates the workflow.');
}

// Unrelated admin queries are left untouched.
foreach ([
    ['get' => [BYLINE_EDITORIAL_LIST_FILTER => 'editing'], 'vars' => ['post_type' => 'page'], 'main' => true],
    ['get' => [BYLINE_EDITORIAL_LIST_FILTER => 'editing'], 'vars' => ['post_type' => 'post'], 'main' => false],
    ['get' => [BYLINE_EDITORIAL_LIST_FILTER => 'published'], 'vars' => ['post_type' => 'post'], 'main' => true],
    ['get' => [BYLINE_EDITORIAL_LIST_FILTER => 'not-a-stage'], 'vars' => ['post_type' => 'post'], 'main' => true],
    ['get' => [], 'vars' => ['post_type' => 'post'], 'main' => true],
] as $case) {
    $_GET = $case['get'];
    $query = new WP_Query($case['vars'], $case['main']);
    byline_editorial_filter_posts_query($query);
    if ($query->applied !== []) { byline_test_fail('The workflow filter altered a query it does not own.'); }
}

// An existing meta query is extended, never replaced.
$_GET = [BYLINE_EDITORIAL_LIST_FILTER => 'ready'];
$query = new WP_Query(['post_type' => 'post', 'meta_query' => [['key' => '_something_else', 'value' => '1']]]);
byline_editorial_filter_posts_query($query);
if (count($query->applied['meta_query']) !== 2) {
    byline_test_fail('The workflow filter discarded an existing meta query.');
}
$_GET = [];

// --- REST privacy -----------------------------------------------------------

$payload = byline_editorial_rest_payload(5);
if (!isset($payload['story'], $payload['statuses'], $payload['capabilities'], $payload['editors'])) {
    byline_test_fail('The editorial REST payload lost part of its contract.');
}
if ($payload['capabilities']['assign'] !== true || $payload['editors'] === []) {
    byline_test_fail('An editor did not receive the assignable roster.');
}
$byline_meta[5][WWH_DISCORD_THREAD_META] = '98765432109876543';
$payload = byline_editorial_rest_payload(5);
if (($payload['discord']['threadUrl'] ?? '') !== 'https://discord.com/channels/12345678901234567/98765432109876543') {
    byline_test_fail('The editorial payload did not provide the canonical Discord thread URL.');
}
// Only an editor may assign, so only an editor receives the roster.
$byline_capabilities = ['edit_posts' => true, 'edit_post' => true];
$payload = byline_editorial_rest_payload(5);
if ($payload['capabilities']['assign'] !== false || $payload['editors'] !== []) {
    byline_test_fail('An unauthorised user was handed the assignable editor roster.');
}

echo "Byline editorial admin regression passed.\n";
