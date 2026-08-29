<?php

/**
 * Focused Content Health regression coverage: URL safety, bounded HTTP,
 * caching, local image checks, incremental scans, and protected routes.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const HOUR_IN_SECONDS = 3600;

$posts = [];
$post_meta = [];
$transients = [];
$options = [];
$routes = [];
$actions = [];
$can_manage = false;
$capabilities = [];
$capability_checks = [];
$remote_count = 0;
$remote_code = 200;
$last_remote = null;
$last_query = [];

class WP_Error
{
    public $code;
    public $message;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
    }
}

class WP_REST_Server
{
    const READABLE = 'GET';
    const CREATABLE = 'POST';
}

class HealthTestRequest
{
    /** @var array<string,mixed> */
    private $params;

    /** @param array<string,mixed> $params */
    public function __construct(array $params)
    {
        $this->params = $params;
    }

    public function get_param(string $key)
    {
        return $this->params[$key] ?? null;
    }
}

function health_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function is_wp_error($value): bool { return $value instanceof WP_Error; }
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$hook][] = $callback; }
function do_action(string $hook, ...$args): void { global $actions; foreach (($actions[$hook] ?? []) as $callback) { if (is_callable($callback)) { call_user_func_array($callback, $args); } } }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function esc_url_raw($url, array $protocols = []): string
{
    if (!is_string($url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    return $protocols === [] || in_array($scheme, $protocols, true) ? $url : '';
}
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function absint($value): int { return abs((int) $value); }
function get_post_meta(int $post_id, string $key, $single = false) { global $post_meta; return $post_meta[$post_id][$key] ?? ($single ? '' : []); }
function get_post_thumbnail_id(int $post_id): int { return absint(get_post_meta($post_id, '_thumbnail_id', true)); }
function get_post(int $post_id) { global $posts; return $posts[$post_id] ?? null; }
function get_edit_post_link(int $post_id, string $context = 'display'): string { return 'https://cms.example.test/wp-admin/post.php?post=' . $post_id . '&action=edit'; }
function parse_blocks(string $content): array
{
    if (strpos($content, 'https://public.example.test/story') === false) {
        return [];
    }
    return [[
        'blockName' => 'core/group',
        'attrs' => [],
        'innerBlocks' => [[
            'blockName' => 'core/paragraph',
            'attrs' => ['content' => 'A link https://public.example.test/story.'],
            'innerBlocks' => [],
            'innerHTML' => '<p>A link <a href="https://public.example.test/story">story</a>.</p>',
        ]],
        'innerHTML' => '<div><p>A link <a href="https://public.example.test/story">story</a>.</p></div>',
    ]];
}
function get_transient(string $key) { global $transients; return $transients[$key] ?? false; }
function set_transient(string $key, $value, int $expiration = 0): bool { global $transients; $transients[$key] = $value; return true; }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function get_posts(array $query = []): array
{
    global $posts, $last_query;
    $last_query = $query;
    $ids = array_keys($posts);
    if (isset($query['post_type'])) {
        $post_types = array_map('strval', (array) $query['post_type']);
        $ids = array_values(array_filter($ids, static function ($id) use ($posts, $post_types): bool {
            return in_array((string) ($posts[$id]->post_type ?? ''), $post_types, true);
        }));
    }
    if (isset($query['post_status'])) {
        $post_statuses = array_map('strval', (array) $query['post_status']);
        $ids = array_values(array_filter($ids, static function ($id) use ($posts, $post_statuses): bool {
            return in_array((string) ($posts[$id]->post_status ?? ''), $post_statuses, true);
        }));
    }
    return array_slice($ids, (int) ($query['offset'] ?? 0), (int) ($query['posts_per_page'] ?? 10));
}
function wp_remote_retrieve_response_code($response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_safe_remote_get(string $url, array $args = [])
{
    global $remote_count, $remote_code, $last_remote;
    $remote_count++;
    $last_remote = ['url' => $url, 'args' => $args];
    return ['response' => ['code' => $remote_code], 'body' => ''];
}
function current_user_can(string $capability, ...$args): bool
{
    global $can_manage, $capabilities, $capability_checks;
    $capability_checks[] = [$capability, $args];
    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);
        return array_key_exists($post_id, $capabilities['edit_post'] ?? [])
            ? (bool) $capabilities['edit_post'][$post_id]
            : false;
    }
    if (array_key_exists($capability, $capabilities)) {
        return (bool) $capabilities[$capability];
    }
    return $can_manage;
}
function register_rest_route(string $namespace, string $route, $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function rest_ensure_response($value) { return $value; }
function wp_schedule_event(int $timestamp, string $recurrence, string $hook): bool { global $options; $options['scheduled:' . $hook] = $timestamp; return true; }
function wp_next_scheduled(string $hook) { global $options; return $options['scheduled:' . $hook] ?? false; }

$posts[5] = (object) ['ID' => 5, 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'A link https://public.example.test/story.'];
$posts[6] = (object) ['ID' => 6, 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'No external links.'];
$posts[7] = (object) ['ID' => 7, 'post_status' => 'draft', 'post_type' => 'post', 'post_title' => 'Private draft story', 'post_content' => 'Private newsroom work.'];
$posts[8] = (object) ['ID' => 8, 'post_status' => 'private', 'post_type' => 'post', 'post_title' => 'Private story', 'post_content' => 'Private newsroom work.'];

require __DIR__ . '/../includes/content-health/checks.php';
require __DIR__ . '/../includes/content-health/scanner.php';
require __DIR__ . '/../includes/content-health/rest.php';

foreach (['http://127.0.0.1/admin', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://localhost/', 'https://user:pass@example.com/private', 'https://example.com:8443/path'] as $unsafe) {
    health_assert(is_wp_error(byline_content_health_validate_url($unsafe)), 'Unsafe content-health URL was accepted: ' . $unsafe);
}
health_assert(is_string(byline_content_health_validate_url('https://public.example.test/story')) || byline_content_health_validate_url('https://public.example.test/story') === '', 'URL validator returned an unexpected type.');

$remote_count = 0;
$remote_code = 200;
$link = byline_content_health_check_url('https://public.example.test/story');
health_assert($link['ok'] === true && $link['severity'] === 'good', 'A successful bounded link check was not reported as good.');
health_assert($remote_count === 1, 'A valid link was not checked exactly once.');
health_assert(($last_remote['args']['timeout'] ?? 99) <= 4 && ($last_remote['args']['redirection'] ?? 99) <= 2 && ($last_remote['args']['limit_response_size'] ?? 0) <= 65536, 'Content-health HTTP bounds were not enforced.');
$cached_link = byline_content_health_check_url('https://public.example.test/story');
health_assert($cached_link['cached'] === true && $remote_count === 1, 'A checked URL was not served from its transient cache.');
$remote_code = 503;
$failed_link = byline_content_health_check_url('https://public.example.test/failing', true);
health_assert($failed_link['severity'] === 'error' && $failed_link['status'] === 503, 'An external HTTP failure was not normalized as an error.');

$health = byline_content_health_check_story(5, ['checkLinks' => false]);
$ids = array_column($health['issues'], 'id');
health_assert(in_array('featured-image', $ids, true) && in_array('image-credit', $ids, true), 'Missing featured-image/content-credit checks were not returned.');
foreach ($health['issues'] as $issue) {
    if (in_array($issue['id'], ['featured-image', 'featured-image-alt', 'image-credit'], true)) {
        health_assert(($issue['fixTarget']['kind'] ?? '') === 'featured-image', 'Featured-image issues did not receive a structured featured-image target.');
        health_assert(!isset($issue['fixTarget']['clientId']), 'A featured-image target unexpectedly exposed a clientId.');
    }
}
health_assert($remote_count === 2, 'A normal story check unexpectedly made a remote link request.');
$link_health = byline_content_health_check_story(5, ['checkLinks' => true]);
$link_issue = null;
foreach ($link_health['issues'] as $issue) {
    if (strpos((string) ($issue['id'] ?? ''), 'link-') === 0) {
        $link_issue = $issue;
        break;
    }
}
health_assert(is_array($link_issue), 'The link-health regression fixture did not produce a link issue.');
health_assert(($link_issue['fixTarget']['kind'] ?? '') === 'block', 'A link issue did not receive a block locator.');
health_assert(($link_issue['fixTarget']['blockPath'] ?? []) === [0, 0], 'The link locator did not preserve the saved nested block path.');
health_assert(($link_issue['fixTarget']['blockName'] ?? '') === 'core/paragraph', 'The link locator did not preserve the block name.');
health_assert(!isset($link_issue['fixTarget']['clientId']), 'A link locator unexpectedly exposed a clientId.');
$projected_link_issue = byline_content_health_rest_issue(array_merge($link_issue, ['postId' => 5]));
health_assert(($projected_link_issue['fixTarget']['blockPath'] ?? []) === [0, 0], 'The private REST projection dropped the structured block locator.');
health_assert(!isset($projected_link_issue['fixTarget']['clientId']), 'The private REST projection exposed a clientId.');
health_assert(($projected_link_issue['fixUrl'] ?? '') === $link_issue['fixUrl'], 'The private REST projection changed the legacy fixUrl.');
$sanitized_target = byline_content_health_rest_fix_target([
    'fixTarget' => [
        'kind' => 'block',
        'blockPath' => ['0', '0'],
        'blockName' => 'core/paragraph',
        'clientId' => 'session-only',
    ],
]);
health_assert(($sanitized_target['blockPath'] ?? []) === [0, 0] && !isset($sanitized_target['clientId']), 'The REST locator sanitizer did not discard an ephemeral clientId.');
$post_meta[6]['_thumbnail_id'] = 44;
$post_meta[44]['_wp_attachment_image_alt'] = '';
$post_meta[44]['_ww_image_credit_text'] = '';
$image_health = byline_content_health_check_story(6, ['checkLinks' => false]);
$image_by_id = [];
foreach ($image_health['issues'] as $issue) {
    $image_by_id[$issue['id']] = $issue['severity'];
}
health_assert(($image_by_id['featured-image-alt'] ?? '') === 'warning' && ($image_by_id['image-credit'] ?? '') === 'warning', 'Missing alt/credit metadata was not detected.');
$post_meta[44]['_wp_attachment_image_alt'] = 'A described photo';
$post_meta[44]['_ww_image_credit_text'] = 'Campus photo';
$image_health_good = byline_content_health_check_story(6, ['checkLinks' => false]);
$good_by_id = [];
foreach ($image_health_good['issues'] as $issue) {
    $good_by_id[$issue['id']] = $issue['severity'];
}
health_assert(($good_by_id['featured-image-alt'] ?? '') === 'good' && ($good_by_id['image-credit'] ?? '') === 'good', 'Valid alt/credit metadata did not pass.');

$remote_before_summary = $remote_count;
byline_content_health_summary();
health_assert($remote_count === $remote_before_summary, 'Content-health summary performed remote link checks on page load.');
$remote_code = 200;
$checked_story = byline_content_health_scan_story(5, true);
health_assert(isset($transients[byline_content_health_story_cache_key(5)]) && $checked_story['remoteLinksChecked'] === true, 'Manual story recheck did not store a bounded scan result.');
$scan = byline_content_health_scan_batch(100, 0);
health_assert(($last_query['posts_per_page'] ?? 100) <= 25 && $scan['scanned'] <= 25, 'Content-health scanner exceeded the bounded batch size.');

byline_register_content_health_hooks();
health_assert(isset($actions['rest_api_init']) && isset($actions[BYLINE_CONTENT_HEALTH_SCAN_HOOK]), 'Content-health registration hooks were not explicit and discoverable.');
health_assert(isset($actions['admin_enqueue_scripts']) && in_array('byline_content_health_enqueue_editor_navigation', $actions['admin_enqueue_scripts'], true), 'Content-health editor navigation was not registered on the admin enqueue hook.');
byline_register_content_health_routes();
$summary_route = $routes['byline/v1/admin/content-health'] ?? null;
$recheck_route = $routes['byline/v1/admin/content-health/recheck/(?P<id>\\d+)'] ?? null;
health_assert(is_array($summary_route) && $summary_route['permission_callback']() === false, 'Content-health summary route was not capability protected.');

// Collection access must not substitute for the object-level edit_post check.
// Keep the actor an ordinary edit_posts newsroom user; a true management
// capability intentionally grants the broader all-stories view.
$can_manage = false;
$capabilities['edit_post'] = [5 => true, 6 => true, 7 => false, 8 => false];
$collection = byline_content_health_summary();
$collection_story_ids = [];
foreach ($collection['issues'] as $issue) {
    if (is_array($issue) && isset($issue['story']['id'])) {
        $collection_story_ids[] = (int) $issue['story']['id'];
        health_assert(strpos((string) ($issue['story']['title'] ?? ''), 'Private') === false, 'Content-health collection leaked a private story title.');
        health_assert(strpos((string) ($issue['story']['editUrl'] ?? ''), 'post=7') === false && strpos((string) ($issue['story']['editUrl'] ?? ''), 'post=8') === false, 'Content-health collection leaked a private story edit URL.');
    }
}
health_assert(!in_array(7, $collection_story_ids, true) && !in_array(8, $collection_story_ids, true), 'Content-health collection returned a draft or private story.');
health_assert(is_array($recheck_route) && $recheck_route['permission_callback'](new HealthTestRequest(['id' => 7])) === false, 'Content-health recheck allowed an uneditable draft through collection access.');
health_assert(is_array($recheck_route) && $recheck_route['permission_callback'](new HealthTestRequest(['id' => 5])) === true, 'Content-health recheck denied an editable story.');
$story_route = $routes['byline/v1/admin/content-health/story/(?P<id>\\d+)'] ?? null;
health_assert(is_array($story_route) && $story_route['permission_callback'](new HealthTestRequest(['id' => 7])) === false, 'Content-health story summary allowed an uneditable draft through collection access.');
health_assert(is_array($story_route) && $story_route['permission_callback'](new HealthTestRequest(['id' => 5])) === true, 'Content-health story summary denied an editable story.');
health_assert(!empty(array_filter($capability_checks, static function (array $check): bool {
    return $check[0] === 'edit_post' && ($check[1][0] ?? 0) === 7;
})), 'Content-health story permissions did not evaluate edit_post for the requested story.');

echo "Byline content-health backend regression passed.\n";
