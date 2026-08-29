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

/**
 * Expose only the small, private locator vocabulary understood by the editor
 * bridge. Cached issue data may come from older plugin versions, so malformed
 * or unknown targets are ignored and the legacy fixUrl remains usable.
 *
 * @return array<string,mixed>|null
 */
function byline_content_health_rest_fix_target(array $issue): ?array
{
    $data = is_array($issue['data'] ?? null) ? $issue['data'] : [];
    $target = $issue['fixTarget'] ?? ($data['fixTarget'] ?? null);
    if (!is_array($target) || !isset($target['kind'])) {
        return null;
    }

    $kind = sanitize_key((string) $target['kind']);
    if ($kind === 'featured-image') {
        return ['kind' => 'featured-image'];
    }

    if ($kind === 'story-sidebar') {
        $panel = sanitize_key((string) ($target['panel'] ?? ''));
        if (!in_array($panel, ['tasks', 'visuals', 'contributors', 'workflow'], true)) {
            return null;
        }
        return ['kind' => 'story-sidebar', 'panel' => $panel];
    }

    if ($kind === 'block') {
        $raw_path = $target['blockPath'] ?? null;
        if (!is_array($raw_path) || count($raw_path) < 1 || count($raw_path) > 32) {
            return null;
        }
        $block_path = [];
        foreach ($raw_path as $index) {
            if (is_int($index)) {
                $path_index = $index;
            } elseif (is_string($index) && preg_match('/^(0|[1-9][0-9]*)$/', $index)) {
                $path_index = (int) $index;
            } else {
                return null;
            }
            if ($path_index < 0 || $path_index > 10000) {
                return null;
            }
            $block_path[] = $path_index;
        }

        $result = ['kind' => 'block', 'blockPath' => $block_path];
        if (isset($target['blockName'])) {
            $block_name = (string) $target['blockName'];
            if (strlen($block_name) > 120 || !preg_match('/^[a-z0-9-]+\/[a-z0-9-]+$/i', $block_name)) {
                return null;
            }
            $result['blockName'] = $block_name;
        }
        if (isset($target['attribute'])) {
            $attribute = (string) $target['attribute'];
            if (strlen($attribute) > 128 || !preg_match('/^[A-Za-z][A-Za-z0-9_.-]*$/', $attribute)) {
                return null;
            }
            $result['attribute'] = $attribute;
        }
        if (isset($target['valueFingerprint'])) {
            $fingerprint = strtolower((string) $target['valueFingerprint']);
            if (!preg_match('/^[a-f0-9]{8,64}$/', $fingerprint)) {
                return null;
            }
            $result['valueFingerprint'] = $fingerprint;
        }
        return $result;
    }

    if ($kind === 'settings') {
        $url = trim((string) ($target['url'] ?? ''));
        if ($url === '' || !function_exists('admin_url') || !function_exists('esc_url_raw')) {
            return null;
        }
        $safe_url = esc_url_raw($url, ['http', 'https']);
        $safe_admin = esc_url_raw((string) admin_url('/'), ['http', 'https']);
        $url_parts = function_exists('wp_parse_url') ? wp_parse_url($safe_url) : parse_url($safe_url);
        $admin_parts = function_exists('wp_parse_url') ? wp_parse_url($safe_admin) : parse_url($safe_admin);
        if (!is_array($url_parts) || !is_array($admin_parts) || $safe_url === '' || $safe_admin === '') {
            return null;
        }
        foreach (['scheme', 'host', 'port'] as $component) {
            if (strtolower((string) ($url_parts[$component] ?? '')) !== strtolower((string) ($admin_parts[$component] ?? ''))) {
                return null;
            }
        }
        $admin_path = rtrim((string) ($admin_parts['path'] ?? ''), '/');
        $url_path = (string) ($url_parts['path'] ?? '');
        if ($admin_path === '' || ($url_path !== $admin_path && strpos($url_path, $admin_path . '/') !== 0)) {
            return null;
        }
        return ['kind' => 'settings', 'url' => $safe_url];
    }

    return null;
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

    $result = [
        'id' => sanitize_key((string) ($issue['id'] ?? 'content-issue')),
        'type' => sanitize_key((string) ($issue['type'] ?? $issue['id'] ?? 'content')),
        'severity' => $severity,
        'problem' => byline_content_health_text($issue['problem'] ?? $issue['message'] ?? $issue['label'] ?? 'Content issue', 500),
        'story' => $story,
        'lastCheckedAt' => (string) ($issue['lastCheckedAt'] ?? $issue['checkedAt'] ?? ''),
        'fixUrl' => !empty($issue['fixUrl']) ? esc_url_raw((string) $issue['fixUrl']) : ($story['editUrl'] ?? null),
    ];
    $fix_target = $story !== null ? byline_content_health_rest_fix_target($issue) : null;
    if ($fix_target !== null) {
        $result['fixTarget'] = $fix_target;
    }
    return $result;
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

/**
 * Add the small editor-side navigation bridge only to an authenticated post
 * editor. It resolves a saved structural locator to the current runtime
 * clientId, but never accepts or stores that clientId in a REST payload.
 */
function byline_content_health_enqueue_editor_navigation(string $hook): void
{
    if (!in_array($hook, ['post.php', 'post-new.php'], true)
        || !function_exists('get_current_screen')
        || !function_exists('wp_script_is')
        || !function_exists('wp_add_inline_script')) {
        return;
    }

    $screen = get_current_screen();
    if (!is_object($screen)
        || ($screen->base ?? '') !== 'post'
        || ($screen->post_type ?? '') !== 'post'
        || !method_exists($screen, 'is_block_editor')
        || !$screen->is_block_editor()) {
        return;
    }

    $handle = '';
    foreach (['enqueued', 'registered'] as $state) {
        foreach (['wp-edit-post', 'byline-editorial-workflow'] as $candidate) {
            if (wp_script_is($candidate, $state)) {
                $handle = $candidate;
                break 2;
            }
        }
    }
    if ($handle === '') {
        return;
    }

    static $added = false;
    if ($added) {
        return;
    }
    $added = true;

    $messages = [
        'stale' => function_exists('__')
            ? __('This Content Health location may have moved. The story was opened normally; review it and recheck Content Health when ready.', 'weekly-wildcat-headless')
            : 'This Content Health location may have moved. The story was opened normally; review it and recheck Content Health when ready.',
    ];
    $messages_json = function_exists('wp_json_encode') ? wp_json_encode($messages) : json_encode($messages);
    if (!is_string($messages_json) || $messages_json === '') {
        return;
    }

    $script = <<<'BYLINE_CONTENT_HEALTH_NAVIGATION'
(function (window) {
    'use strict';

    var targetParam = 'byline_content_health_target';
    var search = new URLSearchParams(window.location.search);
    var encodedTarget = search.get(targetParam);
    if (!encodedTarget) return;

    search.delete(targetParam);
    var cleanUrl = window.location.pathname + (search.toString() ? '?' + search.toString() : '') + window.location.hash;
    try {
        if (window.history && window.history.replaceState) window.history.replaceState({}, document.title, cleanUrl);
    } catch (error) {
        // A history API failure does not make editor navigation unsafe.
    }

    var messages = __BYLINE_CONTENT_HEALTH_MESSAGES__;
    var target;
    try {
        target = JSON.parse(encodedTarget);
    } catch (error) {
        target = null;
    }

    function notifyStale() {
        var dispatch = window.wp && window.wp.data && window.wp.data.dispatch;
        var notices = typeof dispatch === 'function' ? dispatch('core/notices') : null;
        if (notices && typeof notices.createNotice === 'function') {
            notices.createNotice('warning', messages.stale, { isDismissible: true });
        } else if (window.wp && window.wp.a11y && typeof window.wp.a11y.speak === 'function') {
            window.wp.a11y.speak(messages.stale, 'assertive');
        }
    }

    function validTarget(value) {
        if (!value || typeof value !== 'object' || Object.prototype.hasOwnProperty.call(value, 'clientId')) return false;
        if (value.kind === 'featured-image') return true;
        if (value.kind === 'story-sidebar') {
            var storyKeys = Object.keys(value);
            return storyKeys.length === 2
                && storyKeys.indexOf('kind') !== -1
                && storyKeys.indexOf('panel') !== -1
                && ['tasks', 'visuals', 'contributors', 'workflow'].indexOf(value.panel) !== -1;
        }
        if (value.kind !== 'block' || !Array.isArray(value.blockPath) || value.blockPath.length < 1 || value.blockPath.length > 32) return false;
        if (value.blockPath.some(function (index) { return !Number.isInteger(index) || index < 0 || index > 10000; })) return false;
        if (value.blockName !== undefined && (typeof value.blockName !== 'string' || value.blockName.length > 120 || !/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(value.blockName))) return false;
        if (value.attribute !== undefined && (typeof value.attribute !== 'string' || value.attribute.length > 128 || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value.attribute))) return false;
        if (value.valueFingerprint !== undefined && (typeof value.valueFingerprint !== 'string' || value.valueFingerprint.length > 64 || !/^[a-f0-9]{8,64}$/i.test(value.valueFingerprint))) return false;
        return true;
    }

    function blockAtPath(blocks, path) {
        var current = blocks;
        var block = null;
        for (var index = 0; index < path.length; index += 1) {
            var position = path[index];
            if (!Array.isArray(current) || position < 0 || position >= current.length) return null;
            block = current[position];
            current = Array.isArray(block && block.innerBlocks) ? block.innerBlocks : [];
        }
        return block;
    }

    function attributeValue(block, attribute) {
        if (!attribute || !block || !block.attributes) return null;
        var value = block.attributes;
        var parts = attribute.split('.');
        for (var index = 0; index < parts.length; index += 1) {
            if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, parts[index])) return null;
            value = value[parts[index]];
        }
        return typeof value === 'string' ? value : null;
    }

    function fingerprint(value) {
        if (!window.crypto || !window.crypto.subtle || typeof window.TextEncoder !== 'function') return Promise.resolve(null);
        return window.crypto.subtle.digest('SHA-256', new window.TextEncoder().encode(value)).then(function (digest) {
            return Array.prototype.slice.call(new Uint8Array(digest), 0, 8).map(function (byte) {
                return byte.toString(16).padStart(2, '0');
            }).join('');
        }).catch(function () {
            return null;
        });
    }

    function matchesBlock(block) {
        if (!block || (target.blockName && block.name !== target.blockName)) return Promise.resolve(false);
        if (!target.valueFingerprint) return Promise.resolve(true);
        var value = attributeValue(block, target.attribute);
        if (value === null) return Promise.resolve(false);
        return fingerprint(value).then(function (actual) {
            // Structural/name matching remains a safe fallback on older or
            // non-secure admin origins where SubtleCrypto is unavailable.
            return actual === null || actual.toLowerCase() === target.valueFingerprint.toLowerCase();
        });
    }

    function navigate() {
        var data = window.wp && window.wp.data;
        if (!data || typeof data.select !== 'function' || typeof data.dispatch !== 'function') return Promise.resolve(null);

        if (target.kind === 'block') {
            var blockEditor = data.select('core/block-editor');
            var blocks = blockEditor && typeof blockEditor.getBlocks === 'function' ? blockEditor.getBlocks() : null;
            if (!Array.isArray(blocks)) return Promise.resolve(null);
            var block = blockAtPath(blocks, target.blockPath);
            if (!block) return Promise.resolve(false);
            return matchesBlock(block).then(function (matches) {
                if (!matches || typeof block.clientId !== 'string' || block.clientId === '') return false;
                var actions = data.dispatch('core/block-editor');
                if (!actions || typeof actions.selectBlock !== 'function') return null;
                actions.selectBlock(block.clientId);
                if (typeof actions.scrollIntoView === 'function') actions.scrollIntoView(block.clientId);
                return true;
            });
        }

        var editorActions = data.dispatch('core/edit-post');
        if (!editorActions || typeof editorActions.openGeneralSidebar !== 'function') return Promise.resolve(null);
        if (target.kind === 'featured-image') {
            editorActions.openGeneralSidebar('edit-post/document');
            return Promise.resolve(true);
        }
        if (target.kind === 'story-sidebar') {
            // The Story bundle owns the sidebar and PanelBody state. Publish a
            // closed command vocabulary instead of reaching into Gutenberg's
            // DOM or trying to infer panel markup from this transport bridge.
            var navigation = window.bylineStorySidebarNavigation;
            // A plugin bundle/load-order mismatch should still leave the user
            // at the safe Story sidebar rather than turning a valid edit link
            // into a stale-target warning. The Story bundle will consume the
            // panel command when it is available.
            if (!navigation || typeof navigation.publish !== 'function') {
                var pendingNavigation = navigation && typeof navigation === 'object' && !Array.isArray(navigation)
                    ? navigation
                    : {};
                pendingNavigation.pending = { panel: target.panel };
                window.bylineStorySidebarNavigation = pendingNavigation;
                editorActions.openGeneralSidebar('byline-editorial-workflow/byline-editorial-workflow-sidebar');
                return Promise.resolve(true);
            }
            return Promise.resolve(navigation.publish({ panel: target.panel }) ? true : null);
        }
        return Promise.resolve(false);
    }

    function start() {
        if (!validTarget(target)) {
            notifyStale();
            return;
        }
        var attempts = 0;
        var finished = false;
        function attempt() {
            if (finished) return;
            attempts += 1;
            navigate().then(function (result) {
                if (finished) return;
                if (result === true) {
                    finished = true;
                    return;
                }
                if (attempts >= 30) {
                    finished = true;
                    notifyStale();
                    return;
                }
                window.setTimeout(attempt, 100);
            }).catch(function () {
                if (finished) return;
                if (attempts >= 30) {
                    finished = true;
                    notifyStale();
                } else {
                    window.setTimeout(attempt, 100);
                }
            });
        }
        attempt();
    }

    if (window.wp && typeof window.wp.domReady === 'function') {
        window.wp.domReady(start);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}(window));
BYLINE_CONTENT_HEALTH_NAVIGATION;
    $script = str_replace('__BYLINE_CONTENT_HEALTH_MESSAGES__', $messages_json, $script);
    wp_add_inline_script($handle, $script, 'after');
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
        add_action('admin_enqueue_scripts', 'byline_content_health_enqueue_editor_navigation', 100);
        byline_register_content_health_scanner_hooks();
    }
    if (function_exists('add_filter')) {
        add_filter('byline_story_readiness_health', 'byline_content_health_readiness_records', 10, 2);
    }
}
