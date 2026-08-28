<?php

/** Protected REST views for Content Health. */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('byline_content_health_scan_batch')) {
    require_once __DIR__ . '/checks.php';
    require_once __DIR__ . '/scanner.php';
}

function byline_content_health_rest_param($request, string $key, $default = null)
{
    if (is_object($request) && method_exists($request, 'get_param')) {
        $value = $request->get_param($key);
        return $value === null ? $default : $value;
    }
    return $default;
}

function byline_content_health_rest_post_id($request): int
{
    return absint(byline_content_health_rest_param($request, 'id', 0));
}

function byline_content_health_rest_requested_post_id($request): int
{
    $post_id = absint(byline_content_health_rest_param($request, 'postId', 0));
    if ($post_id > 0) {
        return $post_id;
    }

    return byline_content_health_rest_post_id($request);
}

function byline_content_health_can_manage_all(): bool
{
    return current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline');
}

function byline_content_health_user_can_view_story(int $post_id): bool
{
    if ($post_id <= 0 || !function_exists('get_post')) {
        return false;
    }

    $post = get_post($post_id);
    if (!is_object($post) || (($post->post_type ?? 'post') !== 'post')) {
        return false;
    }

    if (byline_content_health_can_manage_all()) {
        return true;
    }

    try {
        return (bool) current_user_can('edit_post', $post_id);
    } catch (Throwable $exception) {
        return false;
    }
}

function byline_content_health_can_view($request = null): bool
{
    $post_id = byline_content_health_rest_requested_post_id($request);
    if ($post_id > 0) {
        return byline_content_health_user_can_view_story($post_id);
    }

    return byline_content_health_can_manage_all()
        || current_user_can('edit_posts');
}

function byline_content_health_user_can_edit_story(int $post_id): bool
{
    return byline_content_health_user_can_view_story($post_id);
}

function byline_content_health_can_edit_story($request): bool
{
    $post_id = byline_content_health_rest_requested_post_id($request);
    return byline_content_health_user_can_edit_story($post_id);
}

function byline_content_health_filter_issues(array $issues, string $issue_type = '', string $severity = ''): array
{
    $issue_type = sanitize_key($issue_type);
    $severity = sanitize_key($severity);
    if ($issue_type === '' && $severity === '') {
        return $issues;
    }
    return array_values(array_filter($issues, static function ($issue) use ($issue_type, $severity): bool {
        if (!is_array($issue)) {
            return false;
        }
        if ($issue_type !== '' && sanitize_key((string) ($issue['id'] ?? '')) !== $issue_type) {
            return false;
        }
        return $severity === '' || sanitize_key((string) ($issue['severity'] ?? '')) === $severity;
    }));
}

/** @return array<string,mixed> */
function byline_content_health_rest_issue(array $issue): array
{
    $post_id = absint($issue['postId'] ?? $issue['objectId'] ?? 0);
    $raw_severity = sanitize_key((string) ($issue['severity'] ?? 'warning'));
    $severity = $raw_severity === 'error' ? 'error' : ($raw_severity === 'info' || $raw_severity === 'good' ? 'info' : 'warning');
    $story = null;
    $post = $post_id > 0 && function_exists('get_post') ? get_post($post_id) : null;
    if (is_object($post) && (($post->post_type ?? 'post') === 'post') && $post_id > 0) {
        $story = [
            'id' => $post_id,
            'title' => sanitize_text_field((string) ($post->post_title ?? 'Story')),
            'editUrl' => function_exists('get_edit_post_link') ? esc_url_raw((string) get_edit_post_link($post_id, '')) : '',
        ];
    }

    return [
        'id' => sanitize_key((string) ($issue['id'] ?? 'content-issue')),
        'type' => sanitize_key((string) ($issue['type'] ?? $issue['id'] ?? 'content')),
        'severity' => $severity,
        'problem' => byline_content_health_text($issue['problem'] ?? $issue['message'] ?? $issue['label'] ?? 'Content issue', 500),
        'story' => $story,
        'lastCheckedAt' => (string) ($issue['lastCheckedAt'] ?? $issue['checkedAt'] ?? ''),
        'fixUrl' => !empty($issue['fixUrl']) ? esc_url_raw((string) $issue['fixUrl']) : ($story['editUrl'] ?? null),
    ];
}

/** @param array<int,array<string,mixed>> $issues */
function byline_content_health_rest_issues(array $issues): array
{
    $result = [];
    foreach ($issues as $issue) {
        if (!is_array($issue)) {
            continue;
        }
        $post_id = absint($issue['postId'] ?? $issue['objectId'] ?? 0);
        if ($post_id > 0 && !byline_content_health_user_can_view_story($post_id)) {
            continue;
        }
        $result[] = byline_content_health_rest_issue($issue);
    }

    return $result;
}

function byline_content_health_summary(int $post_id = 0, string $issue_type = '', string $severity = ''): array
{
    $items = [];
    $scanned = 0;
    if ($post_id > 0) {
        if (!byline_content_health_user_can_view_story($post_id)) {
            return [];
        }
        $payload = byline_content_health_cached_story($post_id);
        if (!is_array($payload)) {
            // Page-load reads deliberately perform only local metadata checks.
            $payload = byline_content_health_check_story($post_id, ['checkLinks' => false]);
        }
        $issues = byline_content_health_filter_issues((array) ($payload['issues'] ?? []), $issue_type, $severity);
        return [
            'postId' => $post_id,
            'scanned' => 1,
            'issues' => byline_content_health_rest_issues($issues),
            'checkedAt' => (string) ($payload['checkedAt'] ?? ''),
            'lastRunAt' => (string) ($payload['checkedAt'] ?? ''),
            'scannerAvailable' => true,
            'remoteLinksChecked' => !empty($payload['remoteLinksChecked']),
            'cached' => byline_content_health_cached_story($post_id) !== null,
        ];
    }
    if (function_exists('get_posts')) {
        try {
            $posts = get_posts([
                'post_type' => 'post',
                'post_status' => 'publish',
                'posts_per_page' => 25,
                'fields' => 'ids',
                'orderby' => 'modified',
                'order' => 'DESC',
                'no_found_rows' => true,
                'ignore_sticky_posts' => true,
            ]);
        } catch (Throwable $exception) {
            $posts = [];
        }
        foreach (is_array($posts) ? $posts : [] as $id) {
            $id = absint($id);
            if ($id <= 0 || !byline_content_health_user_can_edit_story($id)) {
                continue;
            }
            $payload = byline_content_health_cached_story($id);
            if (!is_array($payload)) {
                // No remote requests are made for uncached stories in this
                // collection endpoint. Manual recheck or cron owns that work.
                $payload = byline_content_health_check_story($id, ['checkLinks' => false]);
            }
            $issues = byline_content_health_filter_issues((array) ($payload['issues'] ?? []), $issue_type, $severity);
            foreach ($issues as $issue) {
                if (!is_array($issue)) {
                    continue;
                }
                $issue['postId'] = $id;
                $items[] = $issue;
            }
            $scanned++;
        }
    }
    $warnings = 0;
    $errors = 0;
    foreach ($items as $issue) {
        if (($issue['severity'] ?? '') === 'warning') {
            $warnings++;
        } elseif (($issue['severity'] ?? '') === 'error') {
            $errors++;
        }
    }
    return [
        'postId' => 0,
        'scanned' => $scanned,
        'issues' => byline_content_health_rest_issues(array_slice($items, 0, 100)),
        'counts' => ['warning' => $warnings, 'error' => $errors, 'total' => count($items)],
        'lastRunAt' => null,
        'scannerAvailable' => true,
        'remoteLinksChecked' => false,
        'cached' => false,
    ];
}

function byline_content_health_rest_summary($request)
{
    $post_id = byline_content_health_rest_requested_post_id($request);
    if ($post_id > 0 && !byline_content_health_user_can_view_story($post_id)) {
        return new WP_Error('byline_content_health_forbidden', 'You are not allowed to view health for that story.', ['status' => rest_authorization_required_code()]);
    }
    return rest_ensure_response(byline_content_health_summary(
        $post_id,
        (string) byline_content_health_rest_param($request, 'issueType', ''),
        (string) byline_content_health_rest_param($request, 'severity', '')
    ));
}

function byline_content_health_rest_recheck($request)
{
    if (!byline_content_health_can_edit_story($request)) {
        return new WP_Error('byline_content_health_forbidden', 'You are not allowed to recheck that story.', ['status' => rest_authorization_required_code()]);
    }
    $payload = byline_content_health_scan_story(byline_content_health_rest_requested_post_id($request), true);
    if (is_array($payload) && isset($payload['issues']) && is_array($payload['issues'])) {
        $payload['issues'] = byline_content_health_rest_issues($payload['issues']);
        $payload['lastRunAt'] = $payload['checkedAt'] ?? null;
        $payload['scannerAvailable'] = true;
    }
    return rest_ensure_response($payload);
}

function byline_content_health_rest_scan($request)
{
    $limit = byline_content_health_scan_limit(byline_content_health_rest_param($request, 'limit', BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE));
    $cursor = byline_content_health_scan_cursor(byline_content_health_rest_param($request, 'cursor', get_option(BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION, 0)));
    return rest_ensure_response(byline_content_health_scan_batch($limit, $cursor));
}

function byline_content_health_readiness_records(array $records, int $post_id): array
{
    $cached = byline_content_health_cached_story($post_id);
    if (!is_array($cached)) {
        return $records;
    }
    foreach ((array) ($cached['issues'] ?? []) as $issue) {
        if (!is_array($issue) || ($issue['severity'] ?? '') !== 'error') {
            continue;
        }
        $records[] = [
            'severity' => 'error',
            'message' => byline_content_health_text($issue['message'] ?? 'A cached content-health issue needs attention.', 500),
        ];
    }
    return $records;
}

function byline_register_content_health_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }
    register_rest_route('byline/v1', '/admin/content-health', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_content_health_rest_summary',
        'permission_callback' => 'byline_content_health_can_view',
    ]);
    register_rest_route('byline/v1', '/admin/content-health/recheck/(?P<id>\d+)', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_content_health_rest_recheck',
        'permission_callback' => 'byline_content_health_can_edit_story',
    ]);
    // Planning uses the resource id in the path. Keep this alias alongside the
    // explicit recheck route so clients do not need to know the storage shape.
    register_rest_route('byline/v1', '/admin/content-health/(?P<id>\d+)/recheck', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_content_health_rest_recheck',
        'permission_callback' => 'byline_content_health_can_edit_story',
    ]);
    register_rest_route('byline/v1', '/admin/content-health/scan', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_content_health_rest_scan',
        'permission_callback' => static function (): bool {
            return current_user_can(defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations')
                || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline');
        },
    ]);
    register_rest_route('byline/v1', '/admin/content-health/story/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_content_health_rest_summary',
        'permission_callback' => 'byline_content_health_can_edit_story',
    ]);
}

function byline_register_content_health_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('rest_api_init', 'byline_register_content_health_routes');
        byline_register_content_health_scanner_hooks();
    }
    if (function_exists('add_filter')) {
        add_filter('byline_story_readiness_health', 'byline_content_health_readiness_records', 10, 2);
    }
}
