<?php

/** Incremental, cron-friendly content-health scanning. */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('HOUR_IN_SECONDS')) {
    define('HOUR_IN_SECONDS', 3600);
}

if (!function_exists('byline_content_health_check_story')) {
    require_once __DIR__ . '/checks.php';
}

if (!defined('BYLINE_CONTENT_HEALTH_SCAN_HOOK')) {
    define('BYLINE_CONTENT_HEALTH_SCAN_HOOK', 'byline_content_health_scan');
}
if (!defined('BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION')) {
    define('BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION', 'byline_content_health_scan_cursor');
}
if (!defined('BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE')) {
    define('BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE', 10);
}

function byline_content_health_scan_limit($value): int
{
    $limit = absint($value);
    return max(1, min(25, $limit > 0 ? $limit : BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE));
}

function byline_content_health_scan_cursor($value): int
{
    return max(0, min(1000000, absint($value)));
}

function byline_content_health_store_story(array $payload): bool
{
    if (!function_exists('set_transient') || !isset($payload['postId'])) {
        return false;
    }
    return (bool) set_transient(
        byline_content_health_story_cache_key(absint($payload['postId'])),
        $payload,
        BYLINE_CONTENT_HEALTH_STORY_CACHE_TTL
    );
}

function byline_content_health_scan_batch($limit = BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE, $cursor = 0): array
{
    $limit = byline_content_health_scan_limit($limit);
    $cursor = byline_content_health_scan_cursor($cursor);
    $result = [
        'ok' => true,
        'scanned' => 0,
        'failed' => 0,
        'issues' => 0,
        'cursor' => $cursor,
        'nextCursor' => 0,
        'done' => true,
    ];
    if (!function_exists('get_posts')) {
        $result['ok'] = false;
        $result['error'] = 'WordPress content queries are unavailable.';
        return $result;
    }
    try {
        $posts = get_posts([
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => $limit,
            'offset' => $cursor,
            'orderby' => 'ID',
            'order' => 'ASC',
            'fields' => 'ids',
            'no_found_rows' => true,
            'ignore_sticky_posts' => true,
        ]);
    } catch (Throwable $exception) {
        $result['ok'] = false;
        $result['error'] = 'The content-health scan could not load stories.';
        return $result;
    }
    $posts = is_array($posts) ? $posts : [];
    foreach ($posts as $post_id) {
        $post_id = absint($post_id);
        if ($post_id <= 0) {
            continue;
        }
        try {
            $payload = byline_content_health_check_story($post_id, ['checkLinks' => true, 'refresh' => true]);
            byline_content_health_store_story($payload);
            $result['scanned']++;
            foreach ((array) ($payload['issues'] ?? []) as $issue) {
                if (is_array($issue) && in_array(($issue['severity'] ?? ''), ['warning', 'error'], true)) {
                    $result['issues']++;
                }
            }
        } catch (Throwable $exception) {
            // One malformed post must not abort the rest of the bounded batch.
            $result['failed']++;
        }
    }
    $result['nextCursor'] = count($posts) >= $limit ? $cursor + count($posts) : 0;
    $result['done'] = $result['nextCursor'] === 0;
    $result['cursor'] = $cursor;
    update_option(BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION, $result['nextCursor'], false);
    return $result;
}

function byline_content_health_scan_story(int $post_id, bool $refresh = true): array
{
    if (!$refresh) {
        $cached = byline_content_health_cached_story($post_id);
        if (is_array($cached)) {
            $cached['cached'] = true;
            return $cached;
        }
    }
    $payload = byline_content_health_check_story($post_id, ['checkLinks' => true, 'refresh' => $refresh]);
    byline_content_health_store_story($payload);
    $payload['cached'] = false;
    return $payload;
}

function byline_content_health_cron_callback(): void
{
    $cursor = (int) get_option(BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION, 0);
    byline_content_health_scan_batch(BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE, $cursor);
}

function byline_content_health_register_cron(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_schedule_event')) {
        return;
    }
    if (!wp_next_scheduled(BYLINE_CONTENT_HEALTH_SCAN_HOOK)) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', BYLINE_CONTENT_HEALTH_SCAN_HOOK);
    }
}

function byline_register_content_health_scanner_hooks(): void
{
    if (function_exists('add_action')) {
        add_action(BYLINE_CONTENT_HEALTH_SCAN_HOOK, 'byline_content_health_cron_callback');
        add_action('init', 'byline_content_health_register_cron');
    }
}
