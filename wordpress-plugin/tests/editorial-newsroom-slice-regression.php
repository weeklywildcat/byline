<?php

/**
 * Focused regression coverage for the Coverage, readiness, corrections, and
 * reader-feedback editorial domains.  This is a deliberately small WordPress
 * double: the production modules must remain useful without a second database
 * or a public REST representation of private editorial data.
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
    public $post_parent = 0;
    public $post_date = '2026-08-28 12:00:00';
    public $post_date_gmt = '2026-08-28 16:00:00';
    public $post_modified = '2026-08-28 12:00:00';
    public $post_modified_gmt = '2026-08-28 16:00:00';

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

$byline_slice_posts = [];
$byline_slice_meta = [];
$byline_slice_transients = [];
$byline_slice_next_id = 100;
$byline_slice_post_types = [];
$byline_slice_registered_meta = [];
$byline_slice_actions = [];
$byline_slice_filters = [];
$byline_slice_capabilities = ['edit_posts' => true, 'edit_post' => true, 'publish_posts' => true];
$byline_slice_users = [7 => 'editor', 9 => 'editor'];
$byline_slice_categories = [];
$byline_slice_thumbnails = [];

function byline_slice_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function byline_slice_assert(bool $condition, string $message): void
{
    if (!$condition) {
        byline_slice_fail('FAILED: ' . $message);
    }
}

function add_action(string $tag, $callback = null, ...$args): void
{
    global $byline_slice_actions;
    $byline_slice_actions[$tag][] = $callback;
}

function add_filter(string $tag, $callback = null, ...$args): void
{
    global $byline_slice_filters;
    $byline_slice_filters[$tag][] = $callback;
}

function apply_filters(string $tag, $value, ...$args)
{
    global $byline_slice_filters;
    foreach ($byline_slice_filters[$tag] ?? [] as $callback) {
        $value = call_user_func_array($callback, array_merge([$value], $args));
    }

    return $value;
}

function register_post_type(string $post_type, array $args = []): void
{
    global $byline_slice_post_types;
    $byline_slice_post_types[$post_type] = $args;
}

function register_post_meta(string $post_type, string $key, array $args = []): void
{
    global $byline_slice_registered_meta;
    $byline_slice_registered_meta[$post_type][$key] = $args;
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

function sanitize_email($value): string
{
    return strtolower(trim((string) $value));
}

function sanitize_title(string $value): string
{
    return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $value)), '-');
}

function wp_kses_post($value): string
{
    return strip_tags((string) $value, '<p><strong><em><a><ul><ol><li>');
}

function wp_strip_all_tags($value): string
{
    return trim(strip_tags((string) $value));
}

function strip_shortcodes($value): string
{
    return preg_replace('/\[[^\]]+\]/', '', (string) $value) ?? (string) $value;
}

function absint($value): int
{
    return abs((int) $value);
}

function esc_url_raw($value, array $protocols = []): string
{
    $value = (string) $value;
    if ($value === '' || filter_var($value, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

    return $protocols === [] || in_array($scheme, $protocols, true) ? $value : '';
}

function wp_parse_url(string $url, int $component = -1)
{
    return parse_url($url, $component);
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('America/New_York');
}

function wp_get_environment_type(): string
{
    return 'production';
}

function home_url(string $path = ''): string
{
    return 'https://news.example.test' . $path;
}

function byline_get_publication_config(): array
{
    return ['urls' => ['publicSite' => 'https://news.example.test']];
}

function current_user_can(string $capability, ...$args): bool
{
    global $byline_slice_capabilities;

    return !empty($byline_slice_capabilities[$capability]);
}

function user_can($user, string $capability, ...$args): bool
{
    return current_user_can($capability, ...$args);
}

function get_current_user_id(): int
{
    return 7;
}

function get_user_by(string $field, $value)
{
    global $byline_slice_users;
    $id = absint($value);
    if (!isset($byline_slice_users[$id])) {
        return false;
    }
    $user = new WP_User();
    $user->ID = $id;
    $user->display_name = 'User ' . $id;

    return $user;
}

function get_post($post_id = null)
{
    global $byline_slice_posts;
    $id = $post_id instanceof WP_Post ? (int) $post_id->ID : absint($post_id);

    return $byline_slice_posts[$id] ?? null;
}

function get_post_meta(int $post_id, string $key = '', bool $single = false)
{
    global $byline_slice_meta;
    $value = $byline_slice_meta[$post_id][$key] ?? '';

    return $single ? $value : ($value === '' ? [] : [$value]);
}

function update_post_meta(int $post_id, string $key, $value): bool
{
    global $byline_slice_meta;
    $byline_slice_meta[$post_id][$key] = $value;

    return true;
}

function delete_post_meta(int $post_id, string $key): bool
{
    global $byline_slice_meta;
    unset($byline_slice_meta[$post_id][$key]);

    return true;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $byline_slice_posts, $byline_slice_next_id;
    $id = $byline_slice_next_id++;
    $date = (string) ($data['post_date_gmt'] ?? '2026-08-28 16:00:00');
    $byline_slice_posts[$id] = new WP_Post(array_merge([
        'ID' => $id,
        'post_type' => 'post',
        'post_status' => 'publish',
        'post_title' => '',
        'post_name' => '',
        'post_content' => '',
        'post_excerpt' => '',
        'post_author' => 0,
        'post_parent' => 0,
        'post_date_gmt' => $date,
        'post_modified_gmt' => $date,
    ], $data));
    if ($byline_slice_posts[$id]->post_name === '') {
        $byline_slice_posts[$id]->post_name = sanitize_title((string) $byline_slice_posts[$id]->post_title);
    }

    return $id;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    $id = absint($data['ID'] ?? 0);
    $post = get_post($id);
    if (!$post instanceof WP_Post) {
        return $wp_error ? new WP_Error('invalid_post', 'Missing post.') : 0;
    }
    foreach ($data as $key => $value) {
        if ($key !== 'ID') {
            $post->{$key} = $value;
        }
    }

    return $id;
}

function wp_delete_post(int $post_id, bool $force = false): bool
{
    global $byline_slice_posts;
    unset($byline_slice_posts[$post_id]);

    return true;
}

function get_posts(array $args = []): array
{
    global $byline_slice_posts, $byline_slice_meta;
    $result = [];
    foreach ($byline_slice_posts as $post) {
        if (isset($args['post_type']) && $post->post_type !== $args['post_type']) {
            continue;
        }
        $status = $args['post_status'] ?? 'publish';
        if ($status !== 'any' && !in_array($post->post_status, (array) $status, true)) {
            continue;
        }
        if (isset($args['post_parent']) && (int) $post->post_parent !== absint($args['post_parent'])) {
            continue;
        }
        if (isset($args['meta_key']) && ($byline_slice_meta[$post->ID][$args['meta_key']] ?? null) !== ($args['meta_value'] ?? null)) {
            continue;
        }
        $result[] = $post;
    }
    usort($result, static fn(WP_Post $left, WP_Post $right): int => strcmp((string) $right->post_date_gmt, (string) $left->post_date_gmt));
    $limit = (int) ($args['posts_per_page'] ?? $args['numberposts'] ?? -1);

    return $limit > 0 ? array_slice($result, 0, $limit) : $result;
}

function set_transient(string $key, $value, int $expiration = 0): bool
{
    global $byline_slice_transients;
    $byline_slice_transients[$key] = $value;

    return true;
}

function get_transient(string $key)
{
    global $byline_slice_transients;

    return $byline_slice_transients[$key] ?? false;
}

function delete_transient(string $key): bool
{
    global $byline_slice_transients;
    unset($byline_slice_transients[$key]);

    return true;
}

function get_permalink(int $post_id): string
{
    return 'https://news.example.test/story/' . (int) $post_id . '/';
}

function get_the_excerpt($post): string
{
    return $post instanceof WP_Post ? (string) $post->post_excerpt : '';
}

function get_the_category(int $post_id): array
{
    global $byline_slice_categories;

    return $byline_slice_categories[$post_id] ?? [];
}

function get_post_thumbnail_id(int $post_id): int
{
    global $byline_slice_thumbnails;

    return absint($byline_slice_thumbnails[$post_id] ?? 0);
}

function wp_get_attachment_image_alt(int $attachment_id): string
{
    return (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
}

function wp_get_attachment_metadata(int $attachment_id): array
{
    return (array) get_post_meta($attachment_id, '_wp_attachment_metadata', true);
}

function byline_get_effective_editorial_status(int $post_id): string
{
    $post = get_post($post_id);

    return $post instanceof WP_Post && $post->post_status === 'publish' ? 'published' : 'ready';
}

function byline_get_editorial_visuals(int $post_id): string
{
    return (string) get_post_meta($post_id, '_wwh_story_visuals', true);
}

require __DIR__ . '/../includes/editorial/coverage.php';
require __DIR__ . '/../includes/editorial/corrections.php';
require __DIR__ . '/../includes/editorial/readiness.php';
require __DIR__ . '/../includes/editorial/feedback.php';

foreach (['byline_coverage_register_post_type', 'byline_correction_register_post_type', 'byline_feedback_register_post_type'] as $registration) {
    $registration();
}
byline_coverage_register_meta();
byline_correction_register_meta();
byline_feedback_register_meta();
byline_feedback_register_privacy_hooks();

byline_slice_assert(isset($byline_slice_post_types[BYLINE_COVERAGE_POST_TYPE]) && $byline_slice_post_types[BYLINE_COVERAGE_POST_TYPE]['public'] === false, 'Coverage is not a private internal CPT.');
byline_slice_assert(isset($byline_slice_post_types[BYLINE_CORRECTION_POST_TYPE]) && $byline_slice_post_types[BYLINE_CORRECTION_POST_TYPE]['show_in_rest'] === false, 'Corrections are not hidden from generic REST.');
byline_slice_assert(isset($byline_slice_post_types[BYLINE_FEEDBACK_POST_TYPE]) && $byline_slice_post_types[BYLINE_FEEDBACK_POST_TYPE]['show_in_rest'] === false, 'Feedback is not hidden from generic REST.');
foreach ($byline_slice_registered_meta as $type => $meta) {
    foreach ($meta as $key => $definition) {
        byline_slice_assert(empty($definition['show_in_rest']), "Private meta {$type}/{$key} leaked into REST.");
    }
}

$story = wp_insert_post([
    'post_type' => 'post',
    'post_status' => 'publish',
    'post_title' => 'Public Story',
    'post_content' => 'This is a meaningful story body with enough text.',
    'post_excerpt' => 'A useful deck.',
    'post_author' => 7,
    'post_name' => 'public-story',
]);
$draft = wp_insert_post([
    'post_type' => 'post',
    'post_status' => 'draft',
    'post_title' => 'Private Pitch',
    'post_content' => 'Private newsroom copy.',
    'post_author' => 7,
    'post_name' => 'private-pitch',
]);

$coverage_result = byline_create_coverage([
    'title' => '<b>Election</b> coverage',
    'description' => 'A public guide.',
    'overview' => '<p>Safe overview <script>alert(1)</script></p>',
    'startAt' => '2026-09-01',
    'endAt' => '2026-09-10',
    'status' => 'active',
    'public' => true,
    'staffIds' => [9],
    'storyIds' => [$story, $draft],
]);
byline_slice_assert(!is_wp_error($coverage_result), 'Coverage could not be created.');
$coverage_id = (int) $coverage_result['id'];
$public_coverage = byline_get_public_coverage($coverage_id);
byline_slice_assert(is_array($public_coverage), 'Public coverage projection was unavailable.');
byline_slice_assert(count($public_coverage['stories']) === 1 && $public_coverage['stories'][0]['title'] === 'Public Story', 'Unpublished story data leaked into public Coverage.');
byline_slice_assert(!array_key_exists('staffIds', $public_coverage) && !array_key_exists('storyIds', $public_coverage), 'Private Coverage fields leaked into public projection.');
byline_slice_assert(strpos($public_coverage['overview'], '<script') === false, 'Coverage overview retained executable markup.');
byline_slice_assert(in_array($coverage_id, byline_get_story_coverage_ids($story), true), 'Story-facing Coverage index was not maintained.');
byline_update_coverage($coverage_id, ['storyIds' => [$story]]);
byline_slice_assert(!in_array($coverage_id, byline_get_story_coverage_ids($draft), true), 'Removing a Coverage story left a stale relationship.');

$correction = byline_create_correction($story, ['type' => 'clarification', 'text' => '<strong>We clarified</strong> the vote count.'], 7);
byline_slice_assert(!is_wp_error($correction), 'Structured correction could not be created.');
$public_corrections = byline_get_public_corrections($story);
byline_slice_assert(count($public_corrections) === 1 && $public_corrections[0]['type'] === 'clarification', 'Structured correction was not publicly projected.');
byline_slice_assert(strpos($public_corrections[0]['text'], '<strong>') === false && !array_key_exists('recordedBy', $public_corrections[0]), 'Correction projection leaked HTML or the recording user.');

$readiness_without_image = byline_get_story_readiness($story);
$readiness_by_id = [];
foreach ($readiness_without_image['checks'] as $check) {
    $readiness_by_id[$check['id']] = $check;
}
byline_slice_assert($readiness_without_image['errors'] === 0, 'A publishable story was blocked by an advisory readiness warning.');
byline_slice_assert($readiness_by_id['featured-image']['status'] === 'warning', 'Missing featured image did not produce a warning.');

$attachment = wp_insert_post(['post_type' => 'attachment', 'post_status' => 'inherit', 'post_title' => 'Hero image']);
update_post_meta($attachment, '_wp_attachment_image_alt', 'Students at the meeting');
update_post_meta($attachment, '_ww_image_credit_text', 'Newsroom photo');
$byline_slice_thumbnails[$story] = $attachment;
$byline_slice_categories[$story] = [(object) ['term_id' => 1, 'name' => 'News']];
$readiness_with_image = byline_get_story_readiness($story);
$readiness_by_id = [];
foreach ($readiness_with_image['checks'] as $check) {
    $readiness_by_id[$check['id']] = $check;
}
byline_slice_assert($readiness_with_image['errors'] === 0, 'A good story failed readiness.');
byline_slice_assert($readiness_by_id['featured-image-alt']['status'] === 'pass' && $readiness_by_id['image-credit']['status'] === 'pass', 'Image alt or credit readiness did not detect existing metadata.');

$honeypot = byline_submit_reader_feedback(['storyId' => $story, 'message' => 'Bot', 'honeypot' => 'filled'], '203.0.113.10', 'https://news.example.test');
byline_slice_assert(is_wp_error($honeypot) && $honeypot->get_error_code() === 'byline_feedback_spam', 'Feedback honeypot was accepted.');
$bad_origin = byline_submit_reader_feedback(['storyId' => $story, 'message' => 'A note'], '203.0.113.11', 'https://evil.example.test');
byline_slice_assert(is_wp_error($bad_origin) && $bad_origin->get_error_code() === 'byline_feedback_origin_not_allowed', 'Feedback accepted a non-configured Origin.');
byline_slice_assert(byline_feedback_allowed_cors_origin('https://news.example.test/') === 'https://news.example.test', 'Configured CORS origin was not normalized.');
byline_slice_assert(byline_feedback_allowed_cors_origin('https://evil.example.test') === '', 'CORS helper allowed an arbitrary origin.');

$feedback = byline_submit_reader_feedback([
    'storyId' => $story,
    'type' => 'correction',
    'message' => '<b>Please check</b> the score.',
    'name' => '<i>Reader</i>',
    'email' => 'reader@example.test',
], '203.0.113.12', 'https://news.example.test');
byline_slice_assert(!is_wp_error($feedback), 'Valid reader feedback could not be stored.');
$feedback_id = (int) $feedback['id'];
byline_slice_assert(get_post($feedback_id)->post_status === 'private', 'Feedback was not stored privately.');
byline_slice_assert($feedback['message'] === 'Please check the score.' && $feedback['name'] === 'Reader', 'Feedback input was not strictly sanitized.');
global $byline_slice_meta, $byline_slice_transients;
byline_slice_assert(strpos(serialize($byline_slice_meta), '203.0.113.12') === false, 'Raw IP was retained in feedback metadata.');
foreach (array_keys($byline_slice_transients) as $key) {
    byline_slice_assert(strpos($key, '203.0.113.12') === false, 'Raw IP was retained in a rate-limit key.');
}

$draft_from_feedback = byline_feedback_correction_draft($feedback_id);
byline_slice_assert(!is_wp_error($draft_from_feedback) && $draft_from_feedback['text'] === 'Please check the score.', 'Feedback did not produce an editable correction draft.');
$converted = byline_create_correction_from_feedback($feedback_id, 'We corrected the final score.', 7);
byline_slice_assert(!is_wp_error($converted) && $converted['text'] === 'We corrected the final score.', 'Edited feedback did not become a structured correction.');
byline_slice_assert(byline_get_feedback($feedback_id)['status'] === 'reviewed', 'Converted feedback was not marked reviewed.');

$rate_ip = '203.0.113.99';
for ($index = 0; $index < BYLINE_FEEDBACK_RATE_LIMIT; $index++) {
    byline_slice_assert(!byline_feedback_rate_limited($rate_ip), 'Feedback rate limiter rejected an allowed request.');
}
byline_slice_assert(byline_feedback_rate_limited($rate_ip), 'Feedback rate limiter did not reject the sixth request.');

$exporters = apply_filters('wp_privacy_personal_data_exporters', []);
$erasers = apply_filters('wp_privacy_personal_data_erasers', []);
byline_slice_assert(isset($exporters['byline-feedback'], $erasers['byline-feedback']), 'Feedback privacy hooks were not registered.');

echo "Byline newsroom editorial slice regression passed.\n";
