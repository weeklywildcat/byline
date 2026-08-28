<?php

/**
 * Focused Coverage hardening regression coverage.  The harness models
 * object-level edit capabilities, canonical Coverage ownership, and meta
 * writes closely enough to catch projection leaks and relationship scans.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_title = '';
    public $post_name = '';
    public $post_content = '';
    public $post_excerpt = '';
    public $post_author = 0;

    public function __construct(array $data = [])
    {
        foreach ($data as $key => $value) {
            $this->{$key} = $value;
        }
    }
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

    public function get_error_code(): string
    {
        return (string) $this->code;
    }
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

$byline_coverage_test_posts = [];
$byline_coverage_test_meta = [];
$byline_coverage_test_updates = [];
$byline_coverage_test_get_posts_calls = 0;
$byline_coverage_test_current_user = 7;
$byline_coverage_test_capabilities = [
    'global' => [
        'edit_posts' => true,
        'publish_posts' => true,
    ],
    'users' => [
        7 => ['edit_post' => [101 => true, 102 => false, 103 => false, 201 => true]],
        17 => ['edit_post' => [101 => true, 102 => false, 103 => false, 201 => true]],
    ],
];

function byline_coverage_test_fail(string $message): void
{
    fwrite(STDERR, 'FAILED: ' . $message . "\n");
    exit(1);
}

function byline_coverage_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        byline_coverage_test_fail($message);
    }
}

function add_action(string $tag, $callback = null, ...$args): void
{
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_text_field($value): string
{
    return trim(preg_replace('/\s+/', ' ', strip_tags((string) $value)) ?? '');
}

function sanitize_textarea_field($value): string
{
    return trim(strip_tags((string) $value));
}

function wp_kses_post($value): string
{
    return strip_tags((string) $value, '<p><strong><em><a><ul><ol><li>');
}

function sanitize_title(string $value): string
{
    return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $value)), '-');
}

function absint($value): int
{
    return abs((int) $value);
}

function esc_url_raw($value, array $protocols = []): string
{
    return (string) $value;
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('UTC');
}

function get_post($post_id = null)
{
    global $byline_coverage_test_posts;
    $id = $post_id instanceof WP_Post ? (int) $post_id->ID : absint($post_id);

    return $byline_coverage_test_posts[$id] ?? null;
}

function get_post_meta(int $post_id, string $key = '', bool $single = false)
{
    global $byline_coverage_test_meta;
    $value = array_key_exists($post_id, $byline_coverage_test_meta)
        && array_key_exists($key, $byline_coverage_test_meta[$post_id])
        ? $byline_coverage_test_meta[$post_id][$key]
        : '';

    return $single ? $value : ($value === '' ? [] : [$value]);
}

function update_post_meta(int $post_id, string $key, $value): bool
{
    global $byline_coverage_test_meta, $byline_coverage_test_updates;
    $byline_coverage_test_updates[] = ['postId' => $post_id, 'key' => $key, 'value' => $value];
    $byline_coverage_test_meta[$post_id][$key] = $value;

    return true;
}

function delete_post_meta(int $post_id, string $key): bool
{
    global $byline_coverage_test_meta;
    unset($byline_coverage_test_meta[$post_id][$key]);

    return true;
}

function get_posts(array $args = []): array
{
    global $byline_coverage_test_get_posts_calls;
    $byline_coverage_test_get_posts_calls++;

    return [];
}

function current_user_can(string $capability, ...$args): bool
{
    global $byline_coverage_test_current_user, $byline_coverage_test_capabilities;

    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);

        return !empty($byline_coverage_test_capabilities['users'][$byline_coverage_test_current_user]['edit_post'][$post_id]);
    }

    return !empty($byline_coverage_test_capabilities['global'][$capability]);
}

function user_can($user, string $capability, ...$args): bool
{
    global $byline_coverage_test_capabilities;

    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);

        return !empty($byline_coverage_test_capabilities['users'][absint($user)]['edit_post'][$post_id]);
    }

    return !empty($byline_coverage_test_capabilities['global'][$capability]);
}

function get_permalink(int $post_id): string
{
    return 'https://news.example.test/story/' . $post_id . '/';
}

function get_the_excerpt($post): string
{
    return $post instanceof WP_Post ? (string) $post->post_excerpt : '';
}

function byline_coverage_test_add_post(int $post_id, string $post_type, string $status, string $title): void
{
    global $byline_coverage_test_posts;
    $byline_coverage_test_posts[$post_id] = new WP_Post([
        'ID' => $post_id,
        'post_type' => $post_type,
        'post_status' => $status,
        'post_title' => $title,
        'post_name' => sanitize_title($title),
        'post_excerpt' => 'Excerpt for ' . $title,
    ]);
}

function byline_coverage_test_set_meta(int $post_id, string $key, $value): void
{
    global $byline_coverage_test_meta;
    $byline_coverage_test_meta[$post_id][$key] = $value;
}

function byline_coverage_test_reset_observations(): void
{
    global $byline_coverage_test_updates, $byline_coverage_test_get_posts_calls;
    $byline_coverage_test_updates = [];
    $byline_coverage_test_get_posts_calls = 0;
}

function byline_coverage_test_update_exists(int $post_id, string $key): bool
{
    global $byline_coverage_test_updates;
    foreach ($byline_coverage_test_updates as $update) {
        if ($update['postId'] === $post_id && $update['key'] === $key) {
            return true;
        }
    }

    return false;
}

require __DIR__ . '/../includes/editorial/coverage.php';

byline_coverage_test_add_post(201, BYLINE_COVERAGE_POST_TYPE, 'publish', 'Election Coverage');
byline_coverage_test_add_post(202, BYLINE_COVERAGE_POST_TYPE, 'publish', 'Campus Coverage');
byline_coverage_test_add_post(101, 'post', 'publish', 'Visible Story');
byline_coverage_test_add_post(102, 'post', 'draft', 'Hidden Story');
byline_coverage_test_add_post(103, 'post', 'publish', 'Unreadable Story');

byline_coverage_test_set_meta(201, BYLINE_COVERAGE_STORIES_META, [101, 102, 103]);
byline_coverage_test_set_meta(201, BYLINE_COVERAGE_PUBLIC_META, true);
byline_coverage_test_set_meta(202, BYLINE_COVERAGE_STORIES_META, [101, 103]);
byline_coverage_test_set_meta(101, BYLINE_STORY_COVERAGE_META, [201, 202]);
byline_coverage_test_set_meta(102, BYLINE_STORY_COVERAGE_META, [201]);
byline_coverage_test_set_meta(103, BYLINE_STORY_COVERAGE_META, [202]);

$private_coverage = byline_get_coverage(201);
byline_coverage_test_assert($private_coverage['storyIds'] === [101], 'Private Coverage omitted object-level story filtering.');
byline_coverage_test_assert(byline_get_coverage_record(201)['storyIds'] === [101, 102, 103], 'Canonical Coverage ownership was not preserved in the raw record.');

$user_projection = byline_get_coverage(201, 17);
byline_coverage_test_assert($user_projection['storyIds'] === [101], 'Explicit-user Coverage projection ignored edit_post on linked stories.');

$nested_summary = byline_get_story_coverage_summary(101, 17);
byline_coverage_test_assert(count($nested_summary) === 2, 'The planned story did not retain its visible Coverage relationships.');
foreach ($nested_summary as $summary_item) {
    byline_coverage_test_assert($summary_item['storyCount'] === 1, 'Nested planned/story Coverage count leaked an inaccessible linked story.');
}
byline_coverage_test_assert(byline_get_story_coverage_summary(102, 17) === [], 'A user without edit_post received a story Coverage summary.');

$public_coverage = byline_get_public_coverage(201);
byline_coverage_test_assert(is_array($public_coverage), 'Public Coverage became unavailable after private projection hardening.');
byline_coverage_test_assert(count($public_coverage['stories']) === 2, 'Public Coverage no longer includes publishable stories independent of editorial capability.');
byline_coverage_test_assert($public_coverage['stories'][0]['id'] === 101 && $public_coverage['stories'][1]['id'] === 103, 'Public Coverage story ordering or publication filtering changed.');

byline_coverage_test_set_meta(201, BYLINE_COVERAGE_STORIES_META, [101, 102]);
byline_coverage_test_set_meta(101, BYLINE_STORY_COVERAGE_META, [201, 202]);
byline_coverage_test_set_meta(102, BYLINE_STORY_COVERAGE_META, [201]);
byline_coverage_test_set_meta(103, BYLINE_STORY_COVERAGE_META, [202]);
byline_coverage_test_reset_observations();

$replaced = byline_set_coverage_story_ids(201, [101, 103, 103, 999, 202]);
byline_coverage_test_assert($replaced === [101, 103], 'Coverage replace did not preserve duplicate, nonexistent, and non-story semantics.');
byline_coverage_test_assert(byline_get_coverage_story_ids(201) === [101, 103], 'Coverage did not remain the canonical relationship owner after replace.');
byline_coverage_test_assert(byline_get_story_coverage_ids(101) === [201, 202], 'An unchanged story reverse index was rewritten or changed.');
byline_coverage_test_assert(byline_get_story_coverage_ids(102) === [], 'Removed Coverage membership remained in the story reverse index.');
byline_coverage_test_assert(byline_get_story_coverage_ids(103) === [202, 201], 'Added Coverage membership was not synchronized to the story reverse index.');
byline_coverage_test_assert(count($byline_coverage_test_updates) === 3, 'Coverage replace touched records outside the changed Coverage/stories.');
byline_coverage_test_assert(byline_coverage_test_update_exists(201, BYLINE_COVERAGE_STORIES_META), 'Changed Coverage metadata was not written.');
byline_coverage_test_assert(byline_coverage_test_update_exists(102, BYLINE_STORY_COVERAGE_META), 'Removed story metadata was not written.');
byline_coverage_test_assert(byline_coverage_test_update_exists(103, BYLINE_STORY_COVERAGE_META), 'Added story metadata was not written.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Coverage replace performed a site-wide get_posts scan.');

byline_coverage_test_reset_observations();
$same = byline_set_coverage_story_ids(201, [101, 103, 103]);
byline_coverage_test_assert($same === [101, 103], 'Duplicate Coverage replace changed the normalized result.');
byline_coverage_test_assert($byline_coverage_test_updates === [], 'A no-op Coverage replace rewrote unchanged metadata.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'A no-op Coverage replace performed a site-wide get_posts scan.');

byline_coverage_test_reset_observations();
$duplicate_add = byline_add_story_to_coverage(201, 101);
byline_coverage_test_assert($duplicate_add === [101, 103], 'Duplicate quick-add did not preserve idempotent semantics.');
byline_coverage_test_assert($byline_coverage_test_updates === [], 'Duplicate quick-add rewrote unchanged relationships.');

byline_coverage_test_reset_observations();
$removed = byline_remove_story_from_coverage(201, 101);
byline_coverage_test_assert($removed === [103], 'Quick-remove returned the wrong canonical Coverage list.');
byline_coverage_test_assert(byline_get_story_coverage_ids(101) === [202], 'Quick-remove left a stale story reverse index.');
byline_coverage_test_assert(count($byline_coverage_test_updates) === 2, 'Quick-remove did not limit writes to the changed Coverage and story.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Quick-remove performed a site-wide get_posts scan.');

byline_coverage_test_reset_observations();
$added_back = byline_add_story_to_coverage(201, 101);
byline_coverage_test_assert($added_back === [103, 101], 'Quick-add did not append a new story with the legacy ordering.');
byline_coverage_test_assert(byline_get_story_coverage_ids(101) === [202, 201], 'Quick-add did not synchronize the story reverse index.');
byline_coverage_test_assert(count($byline_coverage_test_updates) === 2, 'Quick-add touched records outside the changed Coverage and story.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Quick-add performed a site-wide get_posts scan.');

byline_coverage_test_reset_observations();
$nonexistent_coverage = byline_set_story_coverage_ids(101, [202, 999]);
byline_coverage_test_assert(is_wp_error($nonexistent_coverage) && $nonexistent_coverage->get_error_code() === 'byline_coverage_not_found', 'Story replace changed nonexistent-Coverage error semantics.');
byline_coverage_test_assert($byline_coverage_test_updates === [], 'A nonexistent Coverage request performed partial relationship writes.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Story replace performed a site-wide get_posts scan while validating nonexistent Coverage.');

byline_coverage_test_reset_observations();
$story_noop = byline_set_story_coverage_ids(101, [202, 201]);
byline_coverage_test_assert($story_noop === [202, 201], 'Story replace did not preserve reverse-index ordering.');
byline_coverage_test_assert($byline_coverage_test_updates === [], 'A no-op story replace rewrote unchanged Coverage/stories.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'A no-op story replace performed a site-wide get_posts scan.');

byline_coverage_test_reset_observations();
$story_removed = byline_set_story_coverage_ids(101, [202]);
byline_coverage_test_assert($story_removed === [202], 'Story replace did not remove the requested Coverage.');
byline_coverage_test_assert(byline_get_coverage_story_ids(201) === [103], 'Story replace did not update canonical Coverage ownership.');
byline_coverage_test_assert(byline_get_story_coverage_ids(101) === [202], 'Story replace did not update the story reverse index.');
byline_coverage_test_assert(count($byline_coverage_test_updates) === 2, 'Story replace removal touched records outside the changed Coverage/story pair.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Story replace removal performed a site-wide get_posts scan.');

byline_coverage_test_set_meta(201, BYLINE_COVERAGE_STORIES_META, [103]);
byline_coverage_test_set_meta(101, BYLINE_STORY_COVERAGE_META, [201]);
byline_coverage_test_assert(byline_get_story_coverage_summary(101, 17) === [], 'A stale reverse index was treated as canonical Coverage ownership.');
byline_coverage_test_reset_observations();
$stale_canonical = byline_set_story_coverage_ids(101, [201]);
byline_coverage_test_assert($stale_canonical === [201], 'Story replace did not accept an existing requested Coverage.');
byline_coverage_test_assert(byline_get_coverage_story_ids(201) === [103], 'An unchanged story membership was allowed to rewrite canonical Coverage ownership.');
byline_coverage_test_assert(byline_get_story_coverage_ids(101) === [201], 'Stale canonical repair rewrote an unchanged story reverse index.');
byline_coverage_test_assert($byline_coverage_test_updates === [], 'An unchanged story membership touched a Coverage outside the set difference.');
byline_coverage_test_assert($byline_coverage_test_get_posts_calls === 0, 'Stale canonical repair performed a site-wide get_posts scan.');

fwrite(STDOUT, "Coverage hardening regression tests passed.\n");
