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
        if ($issue_type !== '' && sanitize_key((string) ($issue['checkId'] ?? $issue['type'] ?? $issue['id'] ?? '')) !== $issue_type) {
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
        'checkId' => sanitize_key((string) ($issue['checkId'] ?? $issue['type'] ?? $issue['id'] ?? 'content')),
        'category' => sanitize_key((string) ($issue['category'] ?? 'images-accessibility')),
        'state' => (string) ($issue['state'] ?? 'existing'),
        'ignored' => $issue['ignored'] ?? null,
        'data' => ['url' => (string) ($issue['data']['url'] ?? '')],
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
        if (in_array($issue['severity'] ?? '', ['good', 'pass'], true)) { continue; }
        $result[] = byline_content_health_rest_issue($issue);
    }

    return $result;
}

/** Read durable results only; loading this queue never performs HTTP checks. */
function byline_content_health_summary(int $post_id = 0, string $issue_type = '', string $severity = ''): array
{
    $ids = $post_id ? [$post_id] : get_posts(['post_type' => 'post', 'post_status' => 'publish', 'numberposts' => -1, 'fields' => 'ids', 'orderby' => 'ID', 'order' => 'ASC']);
    $items = []; $ignored_items = []; $stories = []; $checked = 0; $eligible = 0; $outdated = false;
    $disabled = (array) get_option('byline_content_health_disabled_checks', []);
    foreach ($ids as $id) {
        $id = (int) $id;
        if (!byline_content_health_user_can_view_story($id)) { continue; }
        $post = get_post($id);
        if (!$post || $post->post_type !== 'post' || $post->post_status !== 'publish') { continue; }
        $eligible++;
        $snapshot = byline_content_health_cached_story($id);
        if (!$snapshot) { continue; }
        $checked++;
        if (strtotime((string) ($post->post_modified_gmt ?? '')) > strtotime($snapshot['checkedAt'])) { $outdated = true; }
        $ignores = (array) get_post_meta($id, BYLINE_CONTENT_HEALTH_IGNORED, true);
        $active = []; $observed_types = [];
        foreach (byline_content_health_filter_issues((array) ($snapshot['issues'] ?? []), $issue_type, $severity) as $issue) {
            if (in_array($issue['severity'] ?? '', ['good', 'pass'], true)) { continue; }
            $type = (string) ($issue['checkId'] ?? $issue['type'] ?? '');
            $observed_types[] = $type;
            $issue['postId'] = $id;
            if (isset($ignores[$type]) || isset($disabled[$type])) {
                $issue['ignored'] = $ignores[$type] ?? $disabled[$type];
                $issue['ignored']['scope'] = isset($disabled[$type]) ? 'global' : 'story';
                $ignored_items[] = $issue;
            } else { $items[] = $issue; $active[] = $issue; }
        }
        foreach ($ignores as $type => $audit) {
            if (in_array($type, $observed_types, true) || !is_array($audit)) { continue; }
            $definition = byline_content_health_definitions()[$type] ?? null;
            if (!$definition) { continue; }
            $ignored_issue = ['id' => $id . '-ignored-' . $type, 'checkId' => $type, 'type' => $type,
                'category' => $definition['category'], 'severity' => $definition['severity'], 'state' => 'existing',
                'message' => $definition['title'] . ' — ignored for this story; no current occurrence.',
                'postId' => $id, 'checkedAt' => $snapshot['checkedAt'], 'ignored' => $audit + ['scope' => 'story']];
            if (byline_content_health_filter_issues([$ignored_issue], $issue_type, $severity)) { $ignored_items[] = $ignored_issue; }
        }
        $stories[] = ['id' => $id, 'title' => (string) $post->post_title, 'editUrl' => (string) get_edit_post_link($id, ''),
            'lastCheckedAt' => $snapshot['checkedAt'], 'issueCount' => count($active)];
    }
    $state = (array) get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, []);
    return [
        'postId' => $post_id, 'scanned' => $checked, 'eligible' => $eligible,
        'issues' => byline_content_health_rest_issues($items), 'ignored' => byline_content_health_rest_issues($ignored_items),
        'stories' => $stories, 'definitions' => byline_content_health_definitions(),
        'scan' => $state, 'lastRunAt' => $state['lastFullScanAt'] ?? null,
        'stale' => $outdated || $checked < $eligible || empty($state['lastFullScanAt']) || !empty($state['failed']) || strtotime($state['lastFullScanAt']) < time() - DAY_IN_SECONDS,
        'canScan' => byline_content_health_can_scan(), 'canManageChecks' => byline_content_health_can_manage_all(),
        'disabledChecks' => $disabled, 'scannerAvailable' => function_exists('wp_schedule_single_event'),
    ];
}

function byline_content_health_can_scan(): bool
{
    return byline_content_health_can_manage_all() || current_user_can('edit_others_posts');
}

/** Ignore one check for one story, or explicitly disable it publication-wide. */
function byline_content_health_rest_disposition($request)
{
    $type = sanitize_key((string) byline_content_health_rest_param($request, 'checkId', ''));
    if (!isset(byline_content_health_definitions()[$type])) { return new WP_Error('byline_health_check', 'Unknown check.', ['status' => 400]); }
    $global = byline_content_health_rest_param($request, 'scope', 'story') === 'global';
    $id = byline_content_health_rest_requested_post_id($request);
    if (($global && !byline_content_health_can_manage_all()) || (!$global && !byline_content_health_user_can_edit_story($id))) {
        return new WP_Error('byline_health_forbidden', 'You cannot change this check.', ['status' => 403]);
    }
    $restore = rest_sanitize_boolean(byline_content_health_rest_param($request, 'restore', false));
    $entry = ['by' => get_current_user_id(), 'at' => gmdate('c'), 'reason' => byline_content_health_text(byline_content_health_rest_param($request, 'reason', ''), 300)];
    $key = $global ? 'byline_content_health_disabled_checks' : BYLINE_CONTENT_HEALTH_IGNORED;
    $current = (array) ($global ? get_option($key, []) : get_post_meta($id, $key, true));
    // Compare-and-swap protects concurrent ignores from silently replacing each other.
    for ($attempt = 0; $attempt < 4; $attempt++) {
        $raw = $global ? get_option($key, null) : get_post_meta($id, $key, true);
        $current = is_array($raw) ? $raw : [];
        $next = $current;
        if ($restore) { unset($next[$type]); } else { $next[$type] = $entry; }
        if ($next === $current) { break; }
        if ($global) {
            // Global writes require a short lock because options lack meta CAS.
            if (!add_option('byline_health_disposition_lock', time(), '', false)) { return new WP_Error('byline_health_conflict', 'Another check setting is being saved. Try again.', ['status' => 409]); }
            try {
                $next = (array) get_option($key, []);
                if ($restore) { unset($next[$type]); } else { $next[$type] = $entry; }
                update_option($key, $next, false);
            } finally { delete_option('byline_health_disposition_lock'); }
            break;
        }
        $written = metadata_exists('post', $id, $key) ? update_post_meta($id, $key, wp_slash($next), $raw) : add_post_meta($id, $key, wp_slash($next), true);
        if ($written) { break; }
        wp_cache_delete($id, 'post_meta');
        if ($attempt === 3) { return new WP_Error('byline_health_conflict', 'The ignored checks changed. Try again.', ['status' => 409]); }
    }
    return rest_ensure_response(['ok' => true]);
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
    try { byline_content_health_scan_story(byline_content_health_rest_requested_post_id($request), true); }
    catch (Throwable $error) { return new WP_Error('byline_health_scan_failed', $error->getMessage(), ['status' => 500]); }
    return rest_ensure_response(byline_content_health_summary(byline_content_health_rest_requested_post_id($request)));
}

function byline_content_health_rest_scan($request)
{
    // Start or resume a generation. WP-Cron owns all bounded HTTP work.
    return rest_ensure_response(byline_content_health_start_scan());
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
    register_rest_route('byline/v1', '/admin/content-health/story/(?P<id>\d+)/recheck', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_content_health_rest_recheck',
        'permission_callback' => 'byline_content_health_can_edit_story',
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
        'permission_callback' => 'byline_content_health_can_scan',
    ]);
    register_rest_route('byline/v1', '/admin/content-health/disposition', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_content_health_rest_disposition',
        'permission_callback' => 'byline_content_health_can_view',
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
