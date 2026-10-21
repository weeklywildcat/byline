<?php

/**
 * Regression coverage for the WordPress Core Notes adapter.
 *
 * Notes are Core comments with comment_type=note. Byline only reads them with
 * the documented get_comments() API, only for people who may edit the story, and
 * never copies them anywhere. tests/integration/article-notes.php runs the same
 * rules against real Core; this file pins the adapter's own behaviour with a
 * deliberately small fake of get_comments() so every query it makes can be
 * inspected.
 */

define('ABSPATH', __DIR__ . '/../');
define('BYLINE_REST_NAMESPACE', 'byline/v1');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
}

class WP_User {}
class WP_Error
{
    public $code;
    public $data;
    public function __construct($code = '', $message = '', $data = null) { $this->code = $code; $this->data = $data; }
}
class WP_REST_Request
{
    public $params = [];
    public function __construct(array $params = []) { $this->params = $params; }
    public function get_param($key) { return $this->params[$key] ?? null; }
}
class WP_REST_Response {}
class WP_REST_Server { const READABLE = 'GET'; }

$notes_test_routes = [];
$notes_test_writes = [];
$notes_test_queries = [];

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_post_type(...$args): void {}
function register_post_meta(...$args): void {}
function register_rest_field(...$args): void {}
function register_rest_route($namespace, $route, $args = []): void
{
    global $notes_test_routes;
    $notes_test_routes[$route] = $args;
}
function __return_true(): bool { return true; }
function __($text, $domain = ''): string { return (string) $text; }
function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_title($value): string { return sanitize_key(str_replace(' ', '-', (string) $value)); }
function wp_strip_all_tags($text): string
{
    $text = preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $text);
    return trim(strip_tags($text));
}
function esc_url_raw($url, $protocols = []): string { return (string) $url; }
function absint($value): int { return abs((int) $value); }
function rest_authorization_required_code(): int { return 403; }
function rest_ensure_response($value) { return $value; }
function get_post($post_id)
{
    global $notes_test_posts;
    return $notes_test_posts[(int) $post_id] ?? null;
}
function get_post_type($post_id) { return get_post($post_id) ? 'post' : false; }
function get_post_meta($post_id, $key, $single = false) { return $single ? '' : []; }
function get_user_by($field, $value) { return false; }
function get_users($args = []) { return []; }
function current_user_can($capability, ...$args): bool { return true; }
function user_can($user, $capability, ...$args): bool
{
    global $notes_test_editors;
    if ($capability === 'edit_post') {
        return in_array((int) $user, $notes_test_editors[(int) ($args[0] ?? 0)] ?? [], true);
    }
    return true;
}
function get_current_user_id(): int
{
    global $notes_test_user;
    return $notes_test_user;
}
function get_all_post_type_supports(string $post_type): array
{
    global $notes_test_supports;
    return $notes_test_supports;
}
function is_avatar_comment_type($comment_type): bool
{
    global $notes_test_core_signal;
    return $notes_test_core_signal && $comment_type === 'note';
}
function get_edit_post_link(int $post_id, string $context = 'display'): string
{
    global $notes_test_edit_url;
    return sprintf($notes_test_edit_url, $post_id);
}
// Any attempt to persist Note data anywhere else is a failure.
function update_post_meta(...$args): bool { global $notes_test_writes; $notes_test_writes[] = 'update_post_meta'; return true; }
function add_post_meta(...$args): bool { global $notes_test_writes; $notes_test_writes[] = 'add_post_meta'; return true; }
function update_option(...$args): bool { global $notes_test_writes; $notes_test_writes[] = 'update_option'; return true; }
function wp_insert_comment(...$args): int { global $notes_test_writes; $notes_test_writes[] = 'wp_insert_comment'; return 1; }
function wp_insert_post(...$args): int { global $notes_test_writes; $notes_test_writes[] = 'wp_insert_post'; return 1; }

/** A minimal comment row. */
function notes_test_comment(int $id, int $post, int $parent, string $approved, string $content, string $type = 'note', string $date = '2026-10-21 12:00:00', int $user = 7): object
{
    return (object) [
        'comment_ID' => $id, 'comment_post_ID' => $post, 'comment_parent' => $parent, 'comment_approved' => $approved,
        'comment_content' => $content, 'comment_type' => $type, 'comment_date_gmt' => $date, 'user_id' => $user,
        'comment_author' => 'Caroline Elrod',
    ];
}

/**
 * Honours the get_comments() arguments Byline uses. Like Core 6.9+, it leaves
 * Notes out of any query that does not ask for the 'note' type.
 */
function get_comments(array $args = []): array
{
    global $notes_test_comments, $notes_test_queries;
    $notes_test_queries[] = $args;
    $statuses = isset($args['status']) ? (array) $args['status'] : ['approve'];
    $map = ['hold' => '0', 'approve' => '1'];
    $rows = [];
    foreach ($notes_test_comments as $row) {
        $type = $args['type'] ?? 'comment';
        if ($row->comment_type !== $type) {
            continue;
        }
        $approved = array_map(static function ($status) use ($map) { return $map[$status] ?? $status; }, $statuses);
        if (!in_array((string) $row->comment_approved, $approved, true)) {
            continue;
        }
        if (isset($args['parent']) && (int) $row->comment_parent !== (int) $args['parent']) {
            continue;
        }
        if (isset($args['parent__in']) && !in_array((int) $row->comment_parent, array_map('intval', $args['parent__in']), true)) {
            continue;
        }
        if (isset($args['post_id']) && (int) $row->comment_post_ID !== (int) $args['post_id']) {
            continue;
        }
        if (isset($args['post__in']) && !in_array((int) $row->comment_post_ID, array_map('intval', $args['post__in']), true)) {
            continue;
        }
        $rows[] = $row;
    }
    if (($args['orderby'] ?? '') === 'comment_date_gmt') {
        usort($rows, static function ($a, $b) use ($args): int {
            $order = strcmp($a->comment_date_gmt, $b->comment_date_gmt);
            return ($args['order'] ?? 'DESC') === 'ASC' ? $order : -$order;
        });
    }
    return isset($args['number']) ? array_slice($rows, 0, (int) $args['number']) : $rows;
}

$notes_test_supports = ['editor' => [['notes' => true]]];
$notes_test_comments = [];
$notes_test_core_signal = true;
$notes_test_edit_url = 'https://cms.example.test/wp-admin/post.php?post=%d&action=edit';
$notes_test_user = 1;
$notes_test_editors = [42 => [1], 43 => [1]];
$notes_test_posts = [];
foreach ([42, 43, 44] as $notes_test_post_id) {
    $notes_test_post = new WP_Post();
    $notes_test_post->ID = $notes_test_post_id;
    $notes_test_posts[$notes_test_post_id] = $notes_test_post;
}

require __DIR__ . '/../includes/editorial/rest.php';

function notes_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function notes_test_reset(): void
{
    global $notes_test_queries;
    $notes_test_queries = [];
    byline_notes_flush_count_cache();
}

/* ------------------------------------------------ feature detection */

$available = byline_editorial_rest_notes_support(42);
notes_test_assert($available['available'] === true, 'Notes should be available when Core exposes editor notes support.');
notes_test_assert(strpos($available['url'], 'post=42') !== false, 'Notes should open the current post editor.');
notes_test_assert(strpos($available['url'], '#') === false, 'The editor URL must not carry an invented anchor such as #wp-notes.');
notes_test_assert($available['message'] === '', 'Available Notes should not report an unsupported message.');
notes_test_assert($available === byline_notes_support(42), 'The sidebar helper and the adapter must agree.');

$notes_test_core_signal = false;
$unsupported = byline_editorial_rest_notes_support(42);
notes_test_assert($unsupported['available'] === false, 'Notes should be disabled when the Core note signal is unavailable.');
notes_test_assert($unsupported['url'] === '', 'Unsupported Notes must not emit a misleading editor target.');
notes_test_assert($unsupported['message'] !== '', 'Unsupported Notes should explain the progressive enhancement state.');
$notes_test_core_signal = true;

$notes_test_supports = [];
notes_test_assert(byline_editorial_rest_notes_support(42)['available'] === false, 'Notes should be disabled when the post editor has no Notes support.');
$notes_test_supports = ['editor' => [['notes' => false]]];
notes_test_assert(byline_notes_support(42)['available'] === false, 'A post type that opts out of Notes must be reported unavailable.');
$notes_test_supports = ['editor' => [['other' => true], ['notes' => true]]];
notes_test_assert(byline_notes_support(42)['available'] === true, 'Notes support in any editor feature entry counts, as it does in Core.');
$notes_test_supports = ['editor' => [['notes' => true]]];

/* ------------------------------------------------ thread counts */

$notes_test_comments = [
    notes_test_comment(1, 42, 0, '0', '<p>Open one</p>'),
    notes_test_comment(2, 42, 0, '0', '<p>Open two</p>'),
    notes_test_comment(3, 42, 1, '0', '<p>Reply</p>'),
    notes_test_comment(4, 42, 1, '0', '<p>Another reply</p>'),
    notes_test_comment(5, 42, 1, '1', '', 'note'),
    notes_test_comment(6, 42, 0, '1', '<p>Resolved</p>'),
    notes_test_comment(7, 42, 6, '1', ''),
    notes_test_comment(8, 43, 0, '0', '<p>Other story</p>'),
    // Ordinary reader comments must never be read as Notes.
    notes_test_comment(9, 42, 0, '0', 'Reader comment awaiting moderation', 'comment'),
    notes_test_comment(10, 42, 0, '1', 'Approved reader comment', 'comment'),
    notes_test_comment(11, 42, 0, '1', 'A pingback', 'pingback'),
];

notes_test_reset();
$summary = byline_notes_summary(42);
notes_test_assert($summary !== null && $summary['available'] === true && $summary['canView'] === true, 'An editor receives a Notes summary.');
notes_test_assert($summary['openCount'] === 2, 'Open threads are top-level held Notes; replies and reader comments must not inflate it. Got ' . $summary['openCount']);
notes_test_assert($summary['resolvedCount'] === 1, 'Resolved threads are top-level approved Notes; resolution markers and reader comments must not count. Got ' . $summary['resolvedCount']);
notes_test_assert(strpos($summary['editUrl'], 'post=42') !== false && strpos($summary['editUrl'], '#') === false, 'The summary links to the plain editor URL.');
notes_test_assert(array_keys($summary) === ['available', 'canView', 'openCount', 'resolvedCount', 'editUrl'], 'The summary exposes only counts and the editor URL.');
foreach ($notes_test_queries as $query) {
    notes_test_assert(($query['type'] ?? '') === 'note', 'Every Notes query must explicitly request type => note.');
}
notes_test_assert(count($notes_test_queries) === 1, 'A summary needs one query.');

// Counts for several stories come from one query and are memoised.
notes_test_reset();
$counts = byline_notes_thread_counts([42, 43, 44]);
notes_test_assert(count($notes_test_queries) === 1, 'Counting several stories must be one batched query, not one per story.');
notes_test_assert($counts[42] === ['open' => 2, 'resolved' => 1] && $counts[43] === ['open' => 1, 'resolved' => 0] && $counts[44] === ['open' => 0, 'resolved' => 0], 'Batched counts are per story.');
byline_notes_thread_counts([42, 43]);
byline_notes_summary(42);
notes_test_assert(count($notes_test_queries) === 1, 'Counts already read this request are not queried again.');

/* ------------------------------------------------ unsupported / disabled */

$notes_test_core_signal = false;
notes_test_reset();
$off = byline_notes_summary(42);
notes_test_assert($off === ['available' => false, 'canView' => true, 'openCount' => 0, 'resolvedCount' => 0, 'editUrl' => ''], 'Without Core Notes the summary reports no counts and no URL.');
notes_test_assert($notes_test_queries === [], 'An install without Notes must not query for them.');
$notes_test_core_signal = true;

/* ------------------------------------------------ permissions */

// A user who can see the story workspace but cannot edit the post learns nothing.
$notes_test_editors = [42 => [1]];
notes_test_reset();
$notes_test_user = 2;
notes_test_assert(byline_notes_summary(42) === null, 'A viewer without edit_post receives no summary at all.');
notes_test_assert(byline_notes_summary(42, 2) === null, 'The explicit-user form enforces the same boundary.');
notes_test_assert(byline_notes_summary(999) === null, 'An unknown story has no summary.');
notes_test_assert($notes_test_queries === [], 'A denied viewer must not trigger any Notes query (nothing may be inferred).');
byline_notes_prime_thread_counts([42]);
notes_test_assert($notes_test_queries === [], 'Priming skips stories the viewer cannot edit.');
$notes_test_user = 0;
notes_test_assert(byline_notes_summary(42) === null, 'An anonymous visitor receives nothing.');
$notes_test_user = 1;
notes_test_assert(byline_notes_summary(42) !== null && byline_notes_summary(42, 1) !== null, 'An editor of the story is allowed.');
notes_test_assert(byline_notes_summary(44) === null, 'An editor of other stories cannot read a story they cannot edit.');

// The REST route is read-only and rides the edit_post story permission.
byline_notes_register_rest_routes();
$route = $notes_test_routes['/editorial/stories/(?P<id>\d+)/notes'] ?? null;
notes_test_assert(is_array($route) && $route['methods'] === 'GET', 'The Notes endpoint is read-only.');
notes_test_assert($route['permission_callback'] === 'byline_editorial_rest_permission', 'The Notes endpoint must use the edit_post story permission, not the Story Workspace context.');
notes_test_assert(count($notes_test_routes) === 1, 'The adapter registers exactly one route.');
$denied = byline_notes_rest_get(new WP_REST_Request(['id' => 44]));
notes_test_assert($denied instanceof WP_Error && $denied->data['status'] === 403, 'The callback refuses a viewer who cannot edit, as defence in depth.');

/* ------------------------------------------------ previews */

$notes_test_comments = [
    notes_test_comment(20, 42, 0, '0', '<p>Oldest</p>', 'note', '2026-10-21 09:00:00'),
    notes_test_comment(21, 42, 0, '0', '<p>Can we <strong>verify</strong> when this actually happened? &amp; who said it?</p>', 'note', '2026-10-21 11:00:00'),
    notes_test_comment(22, 42, 0, '0', '<p>Newest</p>', 'note', '2026-10-21 12:00:00'),
    notes_test_comment(23, 42, 0, '0', '<p>Second oldest</p>', 'note', '2026-10-21 10:00:00'),
    notes_test_comment(24, 42, 21, '0', '<p>First reply</p>', 'note', '2026-10-21 11:30:00'),
    notes_test_comment(25, 42, 21, '0', '<p>Second reply</p>', 'note', '2026-10-21 11:45:00'),
    // A resolve/reopen marker has no text and is not a reply.
    notes_test_comment(26, 42, 21, '1', '', 'note', '2026-10-21 11:50:00'),
    notes_test_comment(27, 42, 0, '1', '<p>Resolved, never previewed</p>', 'note', '2026-10-21 12:30:00'),
    notes_test_comment(28, 42, 0, '0', 'Reader comment', 'comment', '2026-10-21 13:00:00'),
];
notes_test_reset();
$previews = byline_notes_open_previews(42);
notes_test_assert(count($previews) === 3, 'Previews are bounded to three open threads.');
notes_test_assert(array_column($previews, 'id') === [22, 21, 23], 'Previews are the most recent open threads, newest first.');
$thread = $previews[1];
notes_test_assert($thread['replyCount'] === 2, 'A text reply counts; a resolution marker does not. Got ' . $thread['replyCount']);
notes_test_assert($thread['excerpt'] === 'Can we verify when this actually happened? & who said it?', 'The excerpt is plain text. Got ' . $thread['excerpt']);
notes_test_assert($thread['createdAt'] === '2026-10-21T11:00:00Z' && $thread['updatedAt'] === '2026-10-21T11:45:00Z', 'Timestamps are UTC ISO strings; updatedAt is the latest text reply.');
notes_test_assert($previews[0]['replyCount'] === 0 && $previews[0]['updatedAt'] === null, 'A thread without replies has no separate update time.');
notes_test_assert($thread['author']['name'] === 'Caroline Elrod' && $thread['author']['id'] === 7, 'The author falls back to the stored comment author.');
notes_test_assert(array_keys($thread) === ['id', 'author', 'excerpt', 'createdAt', 'updatedAt', 'replyCount'], 'A preview exposes nothing beyond the documented fields.');
foreach ($notes_test_queries as $query) {
    notes_test_assert(($query['type'] ?? '') === 'note', 'Every preview query must explicitly request type => note.');
}
notes_test_assert(count(byline_notes_open_previews(42, 1)) === 1 && count(byline_notes_open_previews(42, 99)) === 4, 'The preview limit is clamped between one and ten.');

$response = byline_notes_rest_get(new WP_REST_Request(['id' => 42, 'limit' => 2]));
notes_test_assert($response['summary']['openCount'] === 4 && count($response['open']) === 2, 'The endpoint returns the summary and the requested number of previews.');
notes_test_assert(array_keys($response) === ['summary', 'open'], 'The endpoint returns only the summary and previews.');
$notes_test_comments = [notes_test_comment(30, 42, 0, '1', 'All resolved')];
notes_test_reset();
$empty = byline_notes_rest_get(new WP_REST_Request(['id' => 42]));
notes_test_assert($empty['open'] === [] && $empty['summary']['openCount'] === 0 && $empty['summary']['resolvedCount'] === 1, 'No open threads means no previews.');

/* ------------------------------------------------ sanitization */

$hostile = '<p onclick="x()">Fix <script>alert(1)</script>this</p><style>p{}</style><img src=x onerror=alert(2)> &lt;b&gt;bold&lt;/b&gt; &lt;script&gt;alert(3)&lt;/script&gt; ' . "\x00" . "line\n\n  break" . "\u{200B}";
$excerpt = byline_notes_excerpt($hostile);
notes_test_assert(strpos($excerpt, '<') === false && strpos($excerpt, '>') === false, 'The excerpt contains no markup. Got ' . $excerpt);
notes_test_assert(strpos($excerpt, 'alert(1)') === false && strpos($excerpt, 'p{}') === false, 'Script and style bodies are removed. Got ' . $excerpt);
notes_test_assert(preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $excerpt) === 0 && strpos($excerpt, "\n") === false, 'Control characters and line breaks are normalised. Got ' . json_encode($excerpt));
notes_test_assert(byline_notes_excerpt('   ') === '' && byline_notes_excerpt('<p></p>') === '', 'Empty content has no excerpt.');
$long = byline_notes_excerpt(str_repeat('word ', 200));
notes_test_assert(mb_strlen($long) <= 160 && mb_substr($long, -1) === '…', 'Long Notes are truncated for compact cards.');
notes_test_assert(byline_notes_excerpt('<p>Short note</p>') === 'Short note', 'Short Notes are kept whole.');

/* ------------------------------------------------ Byline stores nothing */

notes_test_assert($notes_test_writes === [], 'Reading Notes must not write post meta, options, comments or posts: ' . implode(', ', $notes_test_writes));
$source = (string) file_get_contents(__DIR__ . '/../includes/editorial/notes.php');
foreach (['update_post_meta(', 'add_post_meta(', 'update_option(', 'add_option(', 'wp_insert_comment(', 'wp_update_comment(', 'wp_delete_comment(', 'wp_set_comment_status(', 'wpdb', 'register_post_type', 'byline_record_activity', 'byline_activity_', 'byline_create_task', 'WP_REST_Server::EDITABLE', "'POST'", "'PATCH'", "'DELETE'"] as $forbidden) {
    notes_test_assert(strpos($source, $forbidden) === false, "The Notes adapter must not use $forbidden.");
}
$calls = preg_match_all('/get_comments\(byline_notes_query_args\(/', $source);
notes_test_assert($calls === 3 && preg_match_all('/get_comments\(/', preg_replace('@/\*.*?\*/@s', '', $source)) === $calls, 'Every get_comments() call goes through the helper that fixes type => note.');
$activity = (string) file_get_contents(__DIR__ . '/../includes/editorial/activity.php');
notes_test_assert(stripos($activity, 'comment') === false, 'The activity log must not record or read comments, so Notes cannot be copied into it.');

echo "WordPress Core Notes adapter regression passed.\n";
