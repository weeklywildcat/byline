<?php

/**
 * Bounded content-health checks for one story and one URL.
 *
 * This service diagnoses content; it never rewrites it.  Remote requests are
 * opt-in for a story check, use WordPress's safe HTTP API, and are cached per
 * normalized URL.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_CONTENT_HEALTH_CACHE_PREFIX')) {
    define('BYLINE_CONTENT_HEALTH_CACHE_PREFIX', 'byline_content_health_url_');
}
if (!defined('BYLINE_CONTENT_HEALTH_STORY_CACHE_PREFIX')) {
    define('BYLINE_CONTENT_HEALTH_STORY_CACHE_PREFIX', 'byline_content_health_story_');
}
if (!defined('BYLINE_CONTENT_HEALTH_URL_CACHE_TTL')) {
    define('BYLINE_CONTENT_HEALTH_URL_CACHE_TTL', 3600);
}
if (!defined('BYLINE_CONTENT_HEALTH_STORY_CACHE_TTL')) {
    define('BYLINE_CONTENT_HEALTH_STORY_CACHE_TTL', 21600);
}
if (!defined('BYLINE_CONTENT_HEALTH_MAX_URL_LENGTH')) {
    define('BYLINE_CONTENT_HEALTH_MAX_URL_LENGTH', 2048);
}
if (!defined('BYLINE_CONTENT_HEALTH_MAX_LINKS')) {
    define('BYLINE_CONTENT_HEALTH_MAX_LINKS', 25);
}

function byline_content_health_text($value, int $maximum = 320): string
{
    $value = is_scalar($value) ? (string) $value : '';
    $value = function_exists('sanitize_text_field') ? sanitize_text_field($value) : trim(strip_tags($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_content_health_error(string $code, string $message)
{
    if (class_exists('WP_Error')) {
        return new WP_Error($code, $message, ['status' => 400]);
    }
    return false;
}

function byline_content_health_ends_with(string $value, string $suffix): bool
{
    return $suffix === '' || substr($value, -strlen($suffix)) === $suffix;
}

function byline_content_health_private_ip(string $host): bool
{
    if (filter_var($host, FILTER_VALIDATE_IP) === false) {
        return false;
    }
    return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
}

function byline_content_health_private_host(string $host): bool
{
    $host = strtolower(rtrim(trim($host), '.'));
    if (strlen($host) > 1 && $host[0] === '[' && substr($host, -1) === ']') {
        $host = substr($host, 1, -1);
    }
    if ($host === '') {
        return true;
    }
    if (in_array($host, ['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback', 'metadata', 'metadata.google.internal', 'instance-data'], true)
        || byline_content_health_ends_with($host, '.localhost')
        || byline_content_health_ends_with($host, '.local')
        || byline_content_health_ends_with($host, '.internal')) {
        return true;
    }
    if (byline_content_health_private_ip($host)) {
        return true;
    }
    // Check both address families when DNS is available.  A failed lookup is
    // not itself a content error; WordPress safe HTTP will report it later.
    if (function_exists('gethostbynamel')) {
        $addresses = @gethostbynamel($host);
        if (is_array($addresses)) {
            foreach ($addresses as $address) {
                if (byline_content_health_private_ip((string) $address)) {
                    return true;
                }
            }
        }
    }
    if (function_exists('dns_get_record') && defined('DNS_AAAA')) {
        $records = @dns_get_record($host, DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                if (byline_content_health_private_ip((string) ($record['ipv6'] ?? ''))) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Return a normalized URL or a WP_Error.  Only ordinary HTTP(S) URLs on
 * public hosts are eligible for a remote check; credentials, unusual ports,
 * local names, and private/reserved address ranges are rejected.
 */
function byline_content_health_validate_url($value)
{
    $url = is_string($value) ? trim($value) : '';
    if ($url === '' || strlen($url) > BYLINE_CONTENT_HEALTH_MAX_URL_LENGTH) {
        return byline_content_health_error('byline_content_health_invalid_url', 'The link is too long or is not a valid URL.');
    }
    $parts = function_exists('wp_parse_url') ? wp_parse_url($url) : parse_url($url);
    if (!is_array($parts)) {
        return byline_content_health_error('byline_content_health_invalid_url', 'The link is not a valid URL.');
    }
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower(rtrim((string) ($parts['host'] ?? ''), '.'));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) {
        return byline_content_health_error('byline_content_health_unsafe_url', 'Only public HTTP(S) links can be checked.');
    }
    if (isset($parts['port']) && !in_array((int) $parts['port'], [80, 443], true)) {
        return byline_content_health_error('byline_content_health_unsafe_url', 'Links with non-standard ports cannot be checked.');
    }
    if (byline_content_health_private_host($host)) {
        return byline_content_health_error('byline_content_health_unsafe_url', 'Links to local or private network addresses cannot be checked.');
    }
    if (function_exists('esc_url_raw')) {
        $escaped = esc_url_raw($url, ['http', 'https']);
        if (!is_string($escaped) || $escaped === '') {
            return byline_content_health_error('byline_content_health_invalid_url', 'The link is not a valid URL.');
        }
        $url = $escaped;
    }
    return $url;
}

function byline_content_health_display_url(string $url): string
{
    $parts = function_exists('wp_parse_url') ? wp_parse_url($url) : parse_url($url);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }
    $display = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
    if (!empty($parts['port'])) {
        $display .= ':' . absint($parts['port']);
    }
    $display .= (string) ($parts['path'] ?? '');
    return byline_content_health_text($display, 512);
}

function byline_content_health_url_cache_key(string $url): string
{
    return BYLINE_CONTENT_HEALTH_CACHE_PREFIX . substr(hash('sha256', $url), 0, 40);
}

function byline_content_health_check_url($value, bool $refresh = false): array
{
    $url = byline_content_health_validate_url($value);
    if (function_exists('is_wp_error') && is_wp_error($url)) {
        return [
            'ok' => false,
            'severity' => 'error',
            'status' => 0,
            'url' => byline_content_health_display_url((string) $value),
            'message' => 'The link is unsafe or invalid and was not requested.',
            'checkedAt' => gmdate('c'),
            'cached' => false,
        ];
    }
    if (!is_string($url) || $url === '') {
        return [
            'ok' => false,
            'severity' => 'error',
            'status' => 0,
            'url' => '',
            'message' => 'The link is unsafe or invalid and was not requested.',
            'checkedAt' => gmdate('c'),
            'cached' => false,
        ];
    }
    $key = byline_content_health_url_cache_key($url);
    if (!$refresh && function_exists('get_transient')) {
        $cached = get_transient($key);
        if (is_array($cached)) {
            $cached['cached'] = true;
            return $cached;
        }
    }
    $result = [
        'ok' => false,
        'severity' => 'error',
        'status' => 0,
        'url' => byline_content_health_display_url($url),
        'message' => 'The link could not be checked.',
        'checkedAt' => gmdate('c'),
        'cached' => false,
    ];
    if (!function_exists('wp_safe_remote_get')) {
        $result['message'] = 'WordPress safe HTTP is unavailable; the link was not requested.';
    } else {
        try {
            $response = wp_safe_remote_get($url, [
                'timeout' => 4,
                'redirection' => 2,
                'limit_response_size' => 65536,
                'reject_unsafe_urls' => true,
                'stream' => false,
                'headers' => ['User-Agent' => 'Byline Content Health'],
            ]);
            if (function_exists('is_wp_error') && is_wp_error($response)) {
                $result['message'] = 'The link could not be reached.';
            } else {
                $code = function_exists('wp_remote_retrieve_response_code')
                    ? (int) wp_remote_retrieve_response_code($response)
                    : (int) ($response['response']['code'] ?? $response['code'] ?? 0);
                $result['status'] = $code;
                if ($code >= 200 && $code < 400) {
                    $result['ok'] = true;
                    $result['severity'] = 'good';
                    $result['message'] = 'The link responded successfully.';
                } elseif ($code > 0) {
                    $result['message'] = 'The link returned an HTTP error.';
                }
            }
        } catch (Throwable $exception) {
            $result['message'] = 'The link could not be reached.';
        }
    }
    if (function_exists('set_transient')) {
        set_transient($key, $result, BYLINE_CONTENT_HEALTH_URL_CACHE_TTL);
    }
    return $result;
}

function byline_content_health_story_cache_key(int $post_id): string
{
    return BYLINE_CONTENT_HEALTH_STORY_CACHE_PREFIX . absint($post_id);
}

function byline_content_health_featured_image_id(int $post_id): int
{
    if (function_exists('get_post_thumbnail_id')) {
        return absint(get_post_thumbnail_id($post_id));
    }
    return function_exists('get_post_meta') ? absint(get_post_meta($post_id, '_thumbnail_id', true)) : 0;
}

function byline_content_health_image_alt(int $attachment_id): string
{
    if ($attachment_id <= 0) {
        return '';
    }
    if (function_exists('wp_get_attachment_image_alt')) {
        $alt = wp_get_attachment_image_alt($attachment_id);
        if (is_string($alt) && trim($alt) !== '') {
            return trim($alt);
        }
    }
    return function_exists('get_post_meta') ? trim((string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true)) : '';
}

function byline_content_health_image_credit(int $attachment_id): string
{
    if ($attachment_id <= 0 || !function_exists('get_post_meta')) {
        return '';
    }
    if (function_exists('wwh_image_meta_value')) {
        $credit = wwh_image_meta_value($attachment_id, 'credit_text');
        if (is_string($credit) && trim($credit) !== '') {
            return trim($credit);
        }
    }
    foreach (['_ww_image_credit_text', '_byline_image_credit_text', '_byline_story_image_credit', '_ww_image_creator'] as $key) {
        $credit = trim((string) get_post_meta($attachment_id, $key, true));
        if ($credit !== '') {
            return $credit;
        }
    }
    return '';
}

function byline_content_health_issue(string $id, string $severity, string $label, string $message, int $post_id, string $fix_url = '', array $data = []): array
{
    $severity = in_array($severity, ['good', 'warning', 'error'], true) ? $severity : 'warning';
    return [
        'id' => sanitize_key($id),
        'severity' => $severity,
        'label' => byline_content_health_text($label, 120),
        'message' => byline_content_health_text($message, 500),
        'objectType' => 'post',
        'objectId' => $post_id,
        'checkedAt' => gmdate('c'),
        'fixUrl' => $fix_url !== '' ? byline_content_health_text($fix_url, 512) : '',
        'data' => $data,
    ];
}

function byline_content_health_extract_links(string $content): array
{
    $content = function_exists('mb_substr') ? mb_substr($content, 0, 100000) : substr($content, 0, 100000);
    $urls = function_exists('wp_extract_urls') ? wp_extract_urls($content) : [];
    if (!is_array($urls) || $urls === []) {
        preg_match_all('#https?://[^\s"\'<>]+#i', $content, $matches);
        $urls = $matches[0] ?? [];
    }
    $result = [];
    foreach ($urls as $url) {
        $url = rtrim((string) $url, '.,;:!?)]}');
        if ($url === '' || in_array($url, $result, true)) {
            continue;
        }
        $result[] = $url;
        if (count($result) >= BYLINE_CONTENT_HEALTH_MAX_LINKS) {
            break;
        }
    }
    return $result;
}

function byline_content_health_story_results(int $post_id, array $options = []): array
{
    $post = function_exists('get_post') ? get_post($post_id) : null;
    if (!is_object($post)) {
        return [byline_content_health_issue('story-not-found', 'error', 'Story', 'This story could not be found.', $post_id)];
    }
    $fix_url = function_exists('get_edit_post_link') ? (string) get_edit_post_link($post_id, 'raw') : '';
    $checks = [];
    $featured_id = byline_content_health_featured_image_id($post_id);
    $checks[] = $featured_id > 0
        ? byline_content_health_issue('featured-image', 'good', 'Featured image', 'A featured image is selected.', $post_id, $fix_url, ['attachmentId' => $featured_id])
        : byline_content_health_issue('featured-image', 'warning', 'Featured image', 'This published story has no featured image.', $post_id, $fix_url);
    if ($featured_id > 0) {
        $checks[] = byline_content_health_image_alt($featured_id) !== ''
            ? byline_content_health_issue('featured-image-alt', 'good', 'Featured image alt text', 'The featured image has alt text.', $post_id, $fix_url)
            : byline_content_health_issue('featured-image-alt', 'warning', 'Featured image alt text', 'Add descriptive alt text for the featured image.', $post_id, $fix_url, ['attachmentId' => $featured_id]);
        $checks[] = byline_content_health_image_credit($featured_id) !== ''
            ? byline_content_health_issue('image-credit', 'good', 'Image credit', 'The featured image has a credit.', $post_id, $fix_url)
            : byline_content_health_issue('image-credit', 'warning', 'Image credit', 'Add a credit or confirm the publication-wide default.', $post_id, $fix_url, ['attachmentId' => $featured_id]);
    } else {
        $checks[] = byline_content_health_issue('featured-image-alt', 'warning', 'Featured image alt text', 'Alt text can be checked after a featured image is selected.', $post_id, $fix_url);
        $checks[] = byline_content_health_issue('image-credit', 'warning', 'Image credit', 'A credit can be checked after a featured image is selected.', $post_id, $fix_url);
    }

    $content = (string) ($post->post_content ?? '');
    $links_checked = 0;
    if (!empty($options['checkLinks'])) {
        foreach (byline_content_health_extract_links($content) as $url) {
            $link = byline_content_health_check_url($url, !empty($options['refresh']));
            $links_checked++;
            $safe_url = byline_content_health_display_url((string) $url);
            $checks[] = byline_content_health_issue(
                'link-' . substr(hash('sha256', (string) $url), 0, 12),
                !empty($link['ok']) ? 'good' : 'error',
                'Link health',
                (string) ($link['message'] ?? 'The link could not be checked.'),
                $post_id,
                $fix_url,
                ['url' => $safe_url, 'status' => (int) ($link['status'] ?? 0), 'cached' => !empty($link['cached'])]
            );
        }
    }
    if ($links_checked === 0) {
        $checks[] = byline_content_health_issue('links', 'good', 'Links', empty($options['checkLinks']) ? 'Link checks are deferred until a manual or scheduled scan.' : 'No links were found to check.', $post_id, $fix_url);
    }
    return $checks;
}

function byline_content_health_check_story(int $post_id, array $options = []): array
{
    $results = byline_content_health_story_results($post_id, $options);
    $payload = [
        'postId' => $post_id,
        'checkedAt' => gmdate('c'),
        'remoteLinksChecked' => !empty($options['checkLinks']),
        'issues' => $results,
    ];
    return $payload;
}

function byline_content_health_cached_story(int $post_id): ?array
{
    if (!function_exists('get_transient')) {
        return null;
    }
    $cached = get_transient(byline_content_health_story_cache_key($post_id));
    return is_array($cached) ? $cached : null;
}
