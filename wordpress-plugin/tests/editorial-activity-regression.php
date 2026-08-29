<?php

/**
 * Standalone regression coverage for the private newsroom activity domain.
 *
 * This harness intentionally models only the WordPress primitives needed by
 * activity.php. It exercises storage, retention, projections, sanitization,
 * and the semantic hooks without requiring a WordPress database.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_parent = 0;
    public $post_author = 0;
    public $post_title = '';
    public $post_content = '';
    public $post_date_gmt = '2026-08-28 16:00:00';
    public $post_date = '2026-08-28 16:00:00';

    public function __construct(array $data = [])
    {
        foreach ($data as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

class WP_User
{
    public $ID = 0;
    public $display_name = '';
    public $user_email = '';
}

class WP_Error
{
    public $code;
    public $message;
    public $data;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

$activity_test_posts = [];
$activity_test_meta = [];
$activity_test_next_id = 1;
$activity_test_current_user = 2;
$activity_test_users = [
    1 => ['name' => 'Managing Editor', 'editor' => true],
    2 => ['name' => 'Writer', 'editor' => false],
    3 => ['name' => 'Other Writer', 'editor' => false],
];
$activity_test_actions = [];
$activity_test_filters = [];
$activity_test_post_types = [];
$activity_test_registered_meta = [];
$activity_test_fired = [];
$activity_test_options = [];

function activity_test_fail(string $message): void
{
    fwrite(STDERR, 'FAILED: ' . $message . "\n");
    exit(1);
}

function activity_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        activity_test_fail($message);
    }
}

function add_action($tag, $callback = null, $priority = 10, $accepted_args = 1): void
{
    global $activity_test_actions;
    $activity_test_actions[$tag][] = [
        'callback' => $callback,
        'accepted_args' => $accepted_args,
    ];
}

function do_action($tag, ...$args): void
{
    global $activity_test_actions, $activity_test_fired;
    $activity_test_fired[] = $tag;
    foreach ($activity_test_actions[$tag] ?? [] as $hook) {
        $callback_args = array_slice($args, 0, (int) $hook['accepted_args']);
        call_user_func_array($hook['callback'], $callback_args);
    }
}

function add_filter($tag, $callback = null, $priority = 10, $accepted_args = 1): void
{
    global $activity_test_filters;
    $activity_test_filters[$tag][] = [
        'callback' => $callback,
        'accepted_args' => $accepted_args,
    ];
}

function apply_filters($tag, $value, ...$args)
{
    global $activity_test_filters;
    foreach ($activity_test_filters[$tag] ?? [] as $filter) {
        $filter_args = array_merge([$value], $args);
        $value = call_user_func_array($filter['callback'], array_slice($filter_args, 0, (int) $filter['accepted_args']));
    }

    return $value;
}

function register_post_type(string $post_type, array $args = []): void
{
    global $activity_test_post_types;
    $activity_test_post_types[$post_type] = $args;
}

function register_post_meta(string $post_type, string $key, array $args = []): bool
{
    global $activity_test_registered_meta;
    $activity_test_registered_meta[$post_type][$key] = $args;
    return true;
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_text_field($value): string
{
    return trim((string) preg_replace('/\s+/', ' ', strip_tags((string) $value)));
}

function absint($value): int
{
    return abs((int) $value);
}

function get_current_user_id(): int
{
    global $activity_test_current_user;
    return $activity_test_current_user;
}

function get_option(string $key, $default = false)
{
    global $activity_test_options;
    return array_key_exists($key, $activity_test_options) ? $activity_test_options[$key] : $default;
}

function update_option(string $key, $value, $autoload = null): bool
{
    global $activity_test_options;
    $activity_test_options[$key] = $value;
    return true;
}

function activity_test_can(int $user_id, string $capability, ...$args): bool
{
    global $activity_test_users, $activity_test_posts;
    if (!isset($activity_test_users[$user_id])) {
        return false;
    }
    if ($capability === 'edit_posts') {
        return true;
    }
    if ($capability === 'edit_others_posts' || $capability === 'manage_byline') {
        return !empty($activity_test_users[$user_id]['editor']);
    }
    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);
        $post = $activity_test_posts[$post_id] ?? null;
        return $post instanceof WP_Post
            && ((int) $post->post_author === $user_id || !empty($activity_test_users[$user_id]['editor']));
    }

    return false;
}

function current_user_can(string $capability, ...$args): bool
{
    return activity_test_can(get_current_user_id(), $capability, ...$args);
}

function user_can($user, string $capability, ...$args): bool
{
    return activity_test_can(absint($user), $capability, ...$args);
}

function get_user_by(string $field, $value)
{
    global $activity_test_users;
    $user_id = absint($value);
    if (!isset($activity_test_users[$user_id])) {
        return false;
    }

    $user = new WP_User();
    $user->ID = $user_id;
    $user->display_name = $activity_test_users[$user_id]['name'];
    $user->user_email = 'private-' . $user_id . '@example.test';
    return $user;
}

function get_post($post_id)
{
    global $activity_test_posts;
    return $activity_test_posts[absint($post_id)] ?? null;
}

function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $activity_test_meta;
    $exists = isset($activity_test_meta[$post_id]) && array_key_exists($key, $activity_test_meta[$post_id]);
    if (!$exists) {
        return $single ? '' : [];
    }

    return $single ? $activity_test_meta[$post_id][$key] : [$activity_test_meta[$post_id][$key]];
}

function update_post_meta(int $post_id, string $key, $value): bool
{
    global $activity_test_meta;
    $activity_test_meta[$post_id][$key] = $value;
    return true;
}

function delete_post_meta(int $post_id, string $key): bool
{
    global $activity_test_meta;
    unset($activity_test_meta[$post_id][$key]);
    return true;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $activity_test_posts, $activity_test_next_id;
    $id = $activity_test_next_id++;
    $date = (string) ($data['post_date_gmt'] ?? '2026-08-28 16:00:00');
    $activity_test_posts[$id] = new WP_Post(array_merge([
        'ID' => $id,
        'post_type' => 'post',
        'post_status' => 'draft',
        'post_parent' => 0,
        'post_author' => 0,
        'post_title' => '',
        'post_content' => '',
        'post_date_gmt' => $date,
        'post_date' => $date,
    ], $data));

    // Core's modern post-created hook is enough to exercise the adapter.
    do_action('wp_after_insert_post', $id, $activity_test_posts[$id], false, null);

    return $id;
}

function wp_delete_post(int $post_id, bool $force = false): bool
{
    global $activity_test_posts, $activity_test_meta;
    if (!isset($activity_test_posts[$post_id])) {
        return false;
    }
    unset($activity_test_posts[$post_id], $activity_test_meta[$post_id]);
    return true;
}

function get_posts(array $args = []): array
{
    global $activity_test_posts;
    $posts = [];
    foreach ($activity_test_posts as $post) {
        if (isset($args['post_type']) && $post->post_type !== $args['post_type']) {
            continue;
        }
        if (isset($args['post_status']) && $args['post_status'] !== 'any'
            && !in_array($post->post_status, (array) $args['post_status'], true)) {
            continue;
        }
        if (isset($args['post_parent']) && (int) $post->post_parent !== absint($args['post_parent'])) {
            continue;
        }
        $posts[] = $post;
    }
    usort($posts, static function (WP_Post $left, WP_Post $right): int {
        return strcmp((string) $right->post_date_gmt, (string) $left->post_date_gmt);
    });

    $limit = (int) ($args['posts_per_page'] ?? $args['numberposts'] ?? -1);
    return $limit > 0 ? array_slice($posts, 0, $limit) : $posts;
}

function wp_generate_uuid4(): string
{
    global $activity_test_next_id;
    return 'activity-' . $activity_test_next_id;
}

add_filter('byline_editorial_activity_now', static function (): string {
    return '2026-08-28T16:00:00Z';
});

require __DIR__ . '/../includes/editorial/activity.php';

activity_test_assert(isset($activity_test_actions['wp_after_insert_post']), 'Story creation hook was not registered.');
activity_test_assert(isset($activity_test_actions['transition_post_status']), 'Story publication hook was not registered.');
activity_test_assert(isset($activity_test_actions['byline_editorial_story_updated']), 'Workflow adapter hook was not registered.');
activity_test_assert(isset($activity_test_actions['byline_editorial_media_request_updated']), 'Media adapter hook was not registered.');
activity_test_assert(isset($activity_test_actions['byline_story_contributors_updated']), 'Contributor adapter hook was not registered.');

$story_id = wp_insert_post([
    'post_type' => 'post',
    'post_status' => 'draft',
    'post_author' => 2,
    'post_title' => 'Campus budget meeting',
]);

$story_activity = byline_list_story_activity($story_id, ['limit' => 10], 2);
activity_test_assert(count($story_activity) === 1 && $story_activity[0]['action'] === 'story_created', 'A created story did not receive one local audit record.');
activity_test_assert($story_activity[0]['actor']['name'] === 'Writer', 'Activity projection did not resolve a safe actor name.');
activity_test_assert(!array_key_exists('user_email', $story_activity[0]) && !array_key_exists('post_content', $story_activity[0]), 'Activity projection exposed private user or post fields.');

$private_view = byline_list_story_activity($story_id, [], 3);
activity_test_assert($private_view === [], 'A writer without story access could view private story activity.');
$activity_test_current_user = 2;
activity_test_assert(byline_list_newsroom_activity([], 2) === [], 'A story writer could view the newsroom-wide activity stream.');
$activity_test_current_user = 1;

$safe_record = byline_record_activity($story_id, 'workflow_changed', [
    'summary' => '<b>Stage changed</b> token=super-secret password=hunter2',
    'to' => 'editing',
    'editorId' => 2,
    'objectId' => 44,
    'note' => 'typed keystrokes must not persist',
    'user_email' => 'writer@example.test',
], 2);
activity_test_assert($safe_record['action'] === 'workflow_changed', 'A valid workflow activity was not stored.');
activity_test_assert($safe_record['context']['to'] === 'editing' && $safe_record['context']['editorId'] === 2, 'Allowlisted activity context was not retained.');
activity_test_assert(!isset($safe_record['context']['note']) && !isset($safe_record['context']['user_email']), 'Arbitrary or private context entered the audit record.');
activity_test_assert(strpos(serialize($activity_test_meta), 'super-secret') === false, 'A credential-shaped activity value was retained.');
activity_test_assert(strpos(serialize($activity_test_meta), 'hunter2') === false, 'A password-shaped activity value was retained.');
activity_test_assert(strpos(serialize($activity_test_meta), 'writer@example.test') === false, 'An email address entered activity storage.');

$action_first = byline_record_editorial_activity('media_changed', $story_id, [
    'status' => 'needed',
    'type' => 'photo',
], 2);
activity_test_assert($action_first['action'] === 'media_changed', 'The action-first compatibility helper did not store an event.');

$story = get_post($story_id);
$story->post_status = 'publish';
do_action('transition_post_status', 'publish', 'draft', $story);
$published = byline_list_story_activity($story_id, ['types' => ['story_published']], 2);
activity_test_assert(count($published) === 1, 'Publishing a story did not record its lifecycle event.');

do_action('byline_editorial_build_live', 19, ['publicationRevision' => 19]);
do_action('byline_editorial_build_live', 19, ['publicationRevision' => 19]);
$live_activity = byline_list_newsroom_activity(['types' => ['build_live'], 'limit' => 10], 1);
activity_test_assert(count($live_activity) === 1 && ($live_activity[0]['context']['revision'] ?? 0) === 19, 'A live manifest observation was not recorded exactly once per revision.');
activity_test_assert(($activity_test_options[BYLINE_ACTIVITY_LAST_LIVE_REVISION_OPTION] ?? 0) === 19, 'Live manifest activity did not persist its idempotency revision.');

$manager_activity = byline_list_newsroom_activity(['limit' => 20], 1);
activity_test_assert(count($manager_activity) >= 4, 'A newsroom manager could not read recent activity across story scope.');

for ($index = 0; $index < 55; $index++) {
    byline_record_activity($story_id, 'task_completed', ['taskId' => $index + 1], 2);
}
$bounded = byline_list_story_activity($story_id, ['limit' => 100], 2);
activity_test_assert(count($bounded) === BYLINE_ACTIVITY_MAX_PER_STORY, 'Story activity exceeded the bounded per-story retention count.');
activity_test_assert($bounded[0]['context']['taskId'] === 55, 'Activity was not ordered newest first after pruning.');

$old = byline_record_activity($story_id, 'task_deleted', [
    'taskId' => 999,
    'occurredAt' => '2020-01-01T00:00:00Z',
], 2);
activity_test_assert($old === [], 'An expired activity record should not be returned as stored.');
$after_expiry = byline_list_story_activity($story_id, ['limit' => 100], 2);
foreach ($after_expiry as $record) {
    activity_test_assert(($record['context']['taskId'] ?? 0) !== 999, 'Expired activity survived retention pruning.');
}

byline_activity_register_post_type();
byline_activity_register_meta();
activity_test_assert(($activity_test_post_types[BYLINE_ACTIVITY_POST_TYPE]['public'] ?? true) === false, 'Activity CPT is publicly queryable.');
activity_test_assert(($activity_test_post_types[BYLINE_ACTIVITY_POST_TYPE]['show_in_rest'] ?? true) === false, 'Activity CPT is exposed through generic REST.');
foreach ($activity_test_registered_meta[BYLINE_ACTIVITY_POST_TYPE] as $definition) {
    activity_test_assert(($definition['show_in_rest'] ?? true) === false, 'Activity metadata is exposed through generic REST.');
}

echo "Editorial activity regression passed.\n";
