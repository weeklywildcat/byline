<?php

/**
 * A grouped editorial update must never leave half of itself behind.
 *
 * The story workflow, the planned publication target, the media request,
 * coverage membership, and contributors live in unrelated WordPress storage.
 * They cannot be wrapped in a real transaction, so this exercises the contract
 * the REST layer actually promises instead:
 *
 *  - when a later write fails, the earlier writes are undone and the editorial
 *    revision does not move, so the client's revision stays authoritative;
 *  - when a restore itself fails, the revision moves and the client is told to
 *    reload rather than being left believing the old revision still holds.
 */

define('ABSPATH', __DIR__ . '/../');
define('BYLINE_REST_NAMESPACE', 'byline/v1');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_title = 'A story';
    public $post_author = 1;
    public $post_name = 'a-story';
    public $post_content = '';
    public $post_excerpt = '';
    public $post_parent = 0;
    public $post_date = '2026-08-28 12:00:00';
    public $post_date_gmt = '2026-08-28 16:00:00';
    public $post_modified = '2026-08-28 12:00:00';
    public $post_modified_gmt = '2026-08-28 16:00:00';

    public function __construct(array $data = [])
    {
        foreach ($data as $key => $value) {
            $this->$key = $value;
        }
    }
}

class WP_User
{
    public $ID = 1;
    public $display_name = 'Test User';

    public function __construct(int $id = 1)
    {
        $this->ID = $id;
        $this->display_name = 'User ' . $id;
    }
}

class WP_Error
{
    private string $code;
    private string $message;
    private array $data;

    public function __construct(string $code = '', string $message = '', array $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string { return $this->code; }
    public function get_error_message(): string { return $this->message; }
    public function get_error_data() { return $this->data; }
}

class WP_REST_Response
{
    public $data;
    public function __construct($data) { $this->data = $data; }
}

class WP_REST_Request
{
    private array $params;
    private array $body;

    public function __construct(array $params = [], array $body = [])
    {
        $this->params = $params;
        $this->body = $body;
    }

    public function get_param($key) { return $this->params[$key] ?? null; }
    public function get_json_params() { return $this->body; }
    public function get_params(): array { return array_merge($this->params, $this->body); }
    public function get_header($key) { return ''; }
    public function get_route(): string { return ''; }
}

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const CREATABLE = 'POST';
    public const EDITABLE = 'POST,PUT,PATCH';
}

$grouped_posts = [];
$grouped_meta = [];
$grouped_users = [];
$grouped_actions = [];

function grouped_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function grouped_assert(bool $condition, string $message): void
{
    if (!$condition) {
        grouped_test_fail($message);
    }
}

function add_action(string $tag, $callback = null, ...$args): void
{
    global $grouped_actions;
    if ($callback !== null) {
        $grouped_actions[$tag][] = $callback;
    }
}
function add_filter(...$args): void {}
function apply_filters(string $tag, $value, ...$args) { return $value; }
function do_action(string $tag, ...$args): void
{
    global $grouped_actions;
    foreach ($grouped_actions[$tag] ?? [] as $callback) {
        if (is_callable($callback)) {
            call_user_func_array($callback, $args);
        }
    }
}
function register_post_type(...$args): void {}
function register_post_meta(...$args): bool { return true; }
function register_rest_route(...$args): void {}
function register_rest_field(...$args): void {}
function __return_true(): bool { return true; }

function absint($value): int { return abs((int) $value); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function esc_url_raw($url, array $protocols = []): string { return (string) $url; }
function wp_json_encode($value, int $flags = 0): string { return (string) json_encode($value, $flags); }
function is_wp_error($thing): bool { return $thing instanceof WP_Error; }
function rest_ensure_response($value) { return $value instanceof WP_REST_Response ? $value : new WP_REST_Response($value); }
function rest_authorization_required_code(): int { return 401; }
function wp_strip_all_tags($value): string { return strip_tags((string) $value); }
function current_time(string $type, bool $gmt = false) { return $type === 'timestamp' ? 1000 : gmdate('Y-m-d H:i:s'); }
function get_current_user_id(): int { return 1; }
function current_user_can(string $capability, ...$args): bool { return true; }
function user_can($user, string $capability, ...$args): bool { return true; }
function get_edit_post_link($id, string $context = 'display'): string { return 'https://example.test/wp-admin/post.php?post=' . (int) $id; }
function get_permalink($id) { return 'https://example.test/story'; }
function get_the_title($id): string { global $grouped_posts; return (string) ($grouped_posts[(int) $id]->post_title ?? ''); }
function get_the_excerpt($id): string { return ''; }
function get_post($id)
{
    global $grouped_posts;
    return $grouped_posts[(int) $id] ?? null;
}
function get_post_type($id) { global $grouped_posts; return $grouped_posts[(int) $id]->post_type ?? ''; }
function get_posts(array $args = []): array { return []; }
function get_users(array $args = []): array { return []; }
function get_user_by($field, $value)
{
    global $grouped_users;
    return isset($grouped_users[(int) $value]) ? new WP_User((int) $value) : false;
}
function get_post_meta($post_id, $key, $single = false)
{
    global $grouped_meta;
    return $grouped_meta[(int) $post_id][$key] ?? '';
}
function update_post_meta($post_id, $key, $value): bool
{
    global $grouped_meta;
    $grouped_meta[(int) $post_id][$key] = $value;
    return true;
}
function delete_post_meta($post_id, $key): bool
{
    global $grouped_meta;
    unset($grouped_meta[(int) $post_id][$key]);
    return true;
}
function metadata_exists(string $type, $post_id, string $key): bool
{
    global $grouped_meta;
    return array_key_exists($key, $grouped_meta[(int) $post_id] ?? []);
}
function get_all_post_type_supports($type): array { return []; }
function is_avatar_comment_type($type): bool { return false; }
function get_comments(array $args = []): array { return []; }
function wp_get_attachment_image_url($id, $size = '') { return ''; }
function wp_attachment_is_image($id): bool { return true; }
function get_post_thumbnail_id($id): int { return 0; }
function get_the_category($id): array { return []; }
function get_option(string $key, $default = false) { return $default; }
function update_option(string $key, $value, bool $autoload = false): bool { return true; }
function wp_timezone(): DateTimeZone { return new DateTimeZone('UTC'); }
function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string { return gmdate($format, $timestamp); }

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/editorial/rest.php';

$story = new WP_Post(['ID' => 10, 'post_type' => 'post', 'post_author' => 1]);
$coverage = new WP_Post(['ID' => 20, 'post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_title' => 'Election night']);
$replacement_coverage = new WP_Post(['ID' => 21, 'post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_title' => 'Budget']);
$grouped_posts = [10 => $story, 20 => $coverage, 21 => $replacement_coverage];
$grouped_users = [1 => true, 4 => true];

byline_set_editorial_status(10, 'writing');
byline_set_editorial_deadline(10, '2026-09-10');
byline_bump_editorial_revision(10);
$baseline_revision = byline_get_editorial_revision(10);
grouped_assert($baseline_revision === 1, 'The baseline editorial revision was not recorded.');

// --- a good grouped update still applies everything and bumps once ----------

$response = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], [
    'status' => 'editing',
    'coverageIds' => [20],
    'expectedRevision' => $baseline_revision,
]));
grouped_assert(!is_wp_error($response), 'A valid grouped update was rejected.');
grouped_assert(byline_get_editorial_status(10) === 'editing', 'The grouped update did not apply the workflow stage.');
grouped_assert(byline_get_story_coverage_ids(10) === [20], 'The grouped update did not apply coverage membership.');
grouped_assert(byline_get_editorial_revision(10) === $baseline_revision + 1, 'A successful grouped update must bump the editorial revision exactly once.');

$revision_before_failure = byline_get_editorial_revision(10);

// --- a later write that fails must undo the earlier ones ---------------------

// A colleague deletes the coverage object in the moment between validation and
// the coverage write. The workflow stage has already been stored by then.
$grouped_actions['byline_editorial_story_updated'][] = static function (int $post_id) {
    global $grouped_posts;
    unset($grouped_posts[21]);
};

$failed = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], [
    'status' => 'ready',
    'deadline' => '2026-10-01',
    'coverageIds' => [21],
    'expectedRevision' => $revision_before_failure,
]));

grouped_assert(is_wp_error($failed), 'A grouped update whose coverage write failed must report an error.');
grouped_assert($failed->get_error_code() === 'byline_coverage_not_found', 'The original, user-readable failure should be preserved when the rollback succeeds. Got: ' . $failed->get_error_code());
grouped_assert(byline_get_editorial_status(10) === 'editing', 'A failed grouped update left the workflow stage changed.');
grouped_assert(byline_get_editorial_deadline(10) === '2026-09-10', 'A failed grouped update left the deadline changed.');
grouped_assert(byline_get_story_coverage_ids(10) === [20], 'A failed grouped update left coverage membership changed.');
grouped_assert(byline_get_editorial_revision(10) === $revision_before_failure, 'A fully rolled-back update must not move the editorial revision.');
grouped_assert(strpos($failed->get_error_message(), 'SQL') === false && strpos($failed->get_error_message(), 'stack') === false, 'The grouped update error exposed backend detail.');

// The client's revision is still authoritative, so its next optimistic write
// succeeds instead of hitting a phantom conflict.
$grouped_actions['byline_editorial_story_updated'] = [];
$grouped_posts[21] = $replacement_coverage;
$after_rollback = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], [
    'status' => 'ready',
    'expectedRevision' => $revision_before_failure,
]));
grouped_assert(!is_wp_error($after_rollback), 'The revision the client held was not still authoritative after a rolled-back failure.');
grouped_assert(byline_get_editorial_status(10) === 'ready', 'The retry after a rolled-back failure did not apply.');

// --- an un-undoable partial write must move the revision and say so ---------

$revision_before_partial = byline_get_editorial_revision(10);

// Coverage 20 disappears the moment the coverage write completes: the
// contributor write then fails, and the coverage restore cannot succeed either.
$grouped_actions['byline_editorial_coverage_changed'][] = static function (int $story_id) {
    global $grouped_posts, $grouped_users;
    unset($grouped_posts[20], $grouped_users[4]);
};

$partial = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], [
    'coverageIds' => [21],
    'contributors' => [['type' => 'user', 'id' => 4]],
    'expectedRevision' => $revision_before_partial,
]));

grouped_assert(is_wp_error($partial), 'An un-undoable partial write must not be reported as success.');
grouped_assert($partial->get_error_code() === 'byline_editorial_partial_update', 'An un-undoable partial write must report the partial-update state. Got: ' . $partial->get_error_code());
$partial_data = $partial->get_error_data();
grouped_assert((int) ($partial_data['status'] ?? 0) === 409, 'A partial write must be reported as a conflict the client has to reconcile.');
grouped_assert(byline_get_editorial_revision(10) > $revision_before_partial, 'Server state changed, so the editorial revision must move with it.');
grouped_assert((int) ($partial_data['currentRevision'] ?? 0) === byline_get_editorial_revision(10), 'The partial-update error must carry the revision the client has to reload to.');

// The client's old revision is no longer authoritative, and says so clearly.
$stale = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], [
    'status' => 'editing',
    'expectedRevision' => $revision_before_partial,
]));
grouped_assert(is_wp_error($stale) && $stale->get_error_code() === 'byline_editorial_conflict', 'A stale revision after a partial write must produce a clear conflict.');

// --- legacy callers that omit expectedRevision still work --------------------

$grouped_actions['byline_editorial_coverage_changed'] = [];
$legacy = byline_editorial_rest_update_story(new WP_REST_Request(['id' => 10], ['status' => 'writing']));
grouped_assert(!is_wp_error($legacy), 'A legacy caller without expectedRevision was rejected.');
grouped_assert(byline_get_editorial_status(10) === 'writing', 'A legacy grouped update did not apply.');

// --- Discord capability projection ------------------------------------------

$discord = byline_editorial_rest_discord_context(10);
grouped_assert(array_key_exists('configured', $discord) && array_key_exists('canCreateThread', $discord), 'The Discord projection must expose configuration and capability, not just a thread id.');
grouped_assert($discord['configured'] === false && $discord['threadId'] === '' && $discord['threadUrl'] === '', 'An unconfigured Discord integration must report itself as unconfigured.');
grouped_assert(json_encode($discord) !== false && strpos((string) json_encode($discord), 'token') === false, 'The Discord projection must never carry credentials.');

$bootstrap = byline_editorial_rest_bootstrap_payload(10);
grouped_assert(is_array($bootstrap['discord'] ?? null) && array_key_exists('configured', $bootstrap['discord']), 'The protected bootstrap must expose Discord configuration state.');

echo "Editorial grouped update rollback regression passed.\n";
