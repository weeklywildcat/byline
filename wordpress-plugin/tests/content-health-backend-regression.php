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
function get_transient(string $key) { global $transients; return $transients[$key] ?? false; }
function set_transient(string $key, $value, int $expiration = 0): bool { global $transients; $transients[$key] = $value; return true; }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function get_posts(array $query = []): array { global $posts, $last_query; $last_query = $query; return array_slice(array_keys($posts), (int) ($query['offset'] ?? 0), (int) ($query['posts_per_page'] ?? 10)); }
function wp_remote_retrieve_response_code($response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_safe_remote_get(string $url, array $args = [])
{
    global $remote_count, $remote_code, $last_remote;
    $remote_count++;
    $last_remote = ['url' => $url, 'args' => $args];
    return ['response' => ['code' => $remote_code], 'body' => ''];
}
function current_user_can(string $capability, ...$args): bool { global $can_manage; return $can_manage; }
function register_rest_route(string $namespace, string $route, $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function rest_ensure_response($value) { return $value; }
function wp_schedule_event(int $timestamp, string $recurrence, string $hook): bool { global $options; $options['scheduled:' . $hook] = $timestamp; return true; }
function wp_next_scheduled(string $hook) { global $options; return $options['scheduled:' . $hook] ?? false; }

$posts[5] = (object) ['ID' => 5, 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'A link https://public.example.test/story.'];
$posts[6] = (object) ['ID' => 6, 'post_status' => 'publish', 'post_type' => 'post', 'post_content' => 'No external links.'];

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
health_assert($remote_count === 2, 'A normal story check unexpectedly made a remote link request.');
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
byline_register_content_health_routes();
$summary_route = $routes['byline/v1/admin/content-health'] ?? null;
$recheck_route = $routes['byline/v1/admin/content-health/recheck/(?P<id>\\d+)'] ?? null;
health_assert(is_array($summary_route) && $summary_route['permission_callback']() === false, 'Content-health summary route was not capability protected.');
health_assert(is_array($recheck_route) && $recheck_route['permission_callback']((object) ['get_param' => static function () {}]) === false, 'Content-health recheck route was not protected.');

echo "Byline content-health backend regression passed.\n";
