<?php
/** Durable published-artifact snapshots and bounded, resumable full scans. */
if (!defined('ABSPATH')) { exit; }
if (!function_exists('byline_content_health_check_story')) { require_once __DIR__ . '/checks.php'; }
const BYLINE_CONTENT_HEALTH_SCAN_HOOK = 'byline_content_health_scan';
const BYLINE_CONTENT_HEALTH_CONTINUE_HOOK = 'byline_content_health_continue';
const BYLINE_CONTENT_HEALTH_SCAN_CURSOR_OPTION = 'byline_content_health_scan_cursor';
const BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE = 1;
const BYLINE_CONTENT_HEALTH_SCAN_STATE = 'byline_content_health_full_scan';
const BYLINE_CONTENT_HEALTH_SNAPSHOT = '_byline_content_health_snapshot';
const BYLINE_CONTENT_HEALTH_IGNORED = '_byline_content_health_ignored';

function byline_content_health_definitions(): array
{
    return [
        'featured-image' => ['title' => 'Featured image missing', 'category' => 'images-accessibility', 'severity' => 'warning',
            'explanation' => 'This published story has no featured image.', 'why' => 'A featured image helps readers recognize the story in listings and shared links.', 'action' => 'Choose a featured image.'],
        'featured-image-alt' => ['title' => 'Missing alt text', 'category' => 'images-accessibility', 'severity' => 'warning',
            'explanation' => 'The featured image has no alt text.', 'why' => 'Readers using screen readers may not receive an equivalent description of the image.', 'action' => 'Add a useful description in the Media Library.'],
        'image-credit' => ['title' => 'Missing image credit', 'category' => 'images-accessibility', 'severity' => 'warning',
            'explanation' => 'The featured image has no credit.', 'why' => 'Credits identify the creator and explain where an image came from.', 'action' => 'Add the image credit or confirm the publication default.'],
        'broken-link' => ['title' => 'Broken links', 'category' => 'links', 'severity' => 'error',
            'explanation' => 'A link could not be reached during the latest check.', 'why' => 'Readers may be unable to reach the source or supporting information.', 'action' => 'Check the URL and update or remove the link if needed.'],
    ];
}
function byline_content_health_scan_limit($value): int { return 1; }
function byline_content_health_scan_cursor($value): int { return absint($value); }

/** Resolution history is capped; ignores are separate and survive resolution. */
function byline_content_health_store_story(array $payload): bool
{
    $id = absint($payload['postId'] ?? 0);
    if (!$id) { return false; }
    $previous = byline_content_health_cached_story($id) ?? [];
    $before = [];
    foreach ($previous['issues'] ?? [] as $issue) { $before[$issue['id']] = $issue; }
    $history = (array) ($previous['resolved'] ?? []);
    $active = [];
    foreach ($payload['issues'] ?? [] as $issue) {
        if (in_array($issue['severity'] ?? '', ['good', 'pass'], true)) { continue; }
        $key = $issue['id'];
        $issue['state'] = isset($before[$key]) ? 'existing' : (isset($history[$key]) ? 'regressed' : 'new');
        $issue['firstSeenAt'] = $before[$key]['firstSeenAt'] ?? $payload['checkedAt'];
        $active[$key] = $issue;
        unset($history[$key]);
    }
    foreach ($before as $key => $issue) {
        if (!isset($active[$key])) { unset($history[$key]); $history[$key] = $payload['checkedAt']; }
    }
    $payload['issues'] = array_values($active);
    $payload['resolved'] = array_slice($history, -200, null, true);
    // Serialize through wp_slash so URL/backslash data survives WP meta APIs.
    if ($previous === $payload) { return true; }
    return (bool) update_post_meta($id, BYLINE_CONTENT_HEALTH_SNAPSHOT, wp_slash($payload));
}
function byline_content_health_scan_story(int $post_id, bool $refresh = true): array
{
    if (!$refresh && ($cached = byline_content_health_cached_story($post_id))) { return $cached; }
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'post' || $post->post_status !== 'publish') {
        throw new RuntimeException('Only published stories can be scanned.');
    }
    $payload = byline_content_health_check_story($post_id, ['checkLinks' => true, 'refresh' => $refresh]);
    if (!byline_content_health_store_story($payload)) { throw new RuntimeException('The scan result could not be saved.'); }
    return byline_content_health_cached_story($post_id) ?? $payload;
}

function byline_content_health_schedule_continuation(): void
{
    if (!wp_next_scheduled(BYLINE_CONTENT_HEALTH_CONTINUE_HOOK)) { wp_schedule_single_event(time() + 15, BYLINE_CONTENT_HEALTH_CONTINUE_HOOK); }
}

/** A high-water ID bounds a generation; new publications join the next scan. */
function byline_content_health_start_scan(): array
{
    if (!add_option('byline_content_health_start_lock', time(), '', false)) {
        if ((int) get_option('byline_content_health_start_lock') < time() - 60) { delete_option('byline_content_health_start_lock'); }
        byline_content_health_schedule_continuation();
        return (array) get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, []);
    }
    try { return byline_content_health_initialize_scan(); }
    finally { delete_option('byline_content_health_start_lock'); }
}
function byline_content_health_initialize_scan(): array
{
    $state = (array) get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, []);
    if (!empty($state['running'])) { byline_content_health_schedule_continuation(); return $state; }
    global $wpdb;
    $upper = (int) $wpdb->get_var("SELECT MAX(ID) FROM {$wpdb->posts} WHERE post_type = 'post' AND post_status = 'publish'");
    $total = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'post' AND post_status = 'publish' AND ID <= %d", $upper));
    $state = ['running' => true, 'cursor' => 0, 'upperId' => $upper, 'total' => $total, 'checked' => 0, 'failed' => 0,
        'startedAt' => gmdate('c'), 'lastFullScanAt' => $state['lastFullScanAt'] ?? null];
    update_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, $state, false);
    byline_content_health_schedule_continuation();
    return $state;
}

/** One worker advances the cursor at a time. Never hold a browser request open for a full site. */
function byline_content_health_scan_batch($limit = BYLINE_CONTENT_HEALTH_SCAN_BATCH_SIZE, $cursor = 0): array
{
    $state = (array) get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, []);
    if (empty($state['running'])) { return $state; }
    if (!add_option('byline_content_health_worker_lock', time(), '', false)) {
        if ((int) get_option('byline_content_health_worker_lock') < time() - 600) { delete_option('byline_content_health_worker_lock'); }
        byline_content_health_schedule_continuation();
        return $state;
    }
    try {
        global $wpdb;
        $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE post_type = 'post' AND post_status = 'publish' AND ID > %d AND ID <= %d ORDER BY ID ASC LIMIT %d", (int) $state['cursor'], (int) $state['upperId'], byline_content_health_scan_limit($limit)));
        foreach ($ids as $id) {
            try { byline_content_health_scan_story((int) $id); $state['checked']++; }
            catch (Throwable $error) { $state['failed']++; }
            $state['cursor'] = (int) $id;
        }
        if (count($ids) < byline_content_health_scan_limit($limit)) {
            $state['running'] = false;
            $state['finishedAt'] = gmdate('c');
            $state['total'] = $state['checked'] + $state['failed'];
            if (!$state['failed']) { $state['lastFullScanAt'] = $state['finishedAt']; }
        }
        update_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, $state, false);
        if ($state['running']) { byline_content_health_schedule_continuation(); }
        return $state;
    } finally { delete_option('byline_content_health_worker_lock'); }
}
function byline_content_health_cron_callback(): void
{
    byline_content_health_start_scan();
    byline_content_health_scan_batch();
}
function byline_content_health_register_cron(): void
{
    if (!wp_next_scheduled(BYLINE_CONTENT_HEALTH_SCAN_HOOK)) { wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', BYLINE_CONTENT_HEALTH_SCAN_HOOK); }
    $state = (array) get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, []);
    if (!empty($state['running'])) { byline_content_health_schedule_continuation(); }
}
function byline_register_content_health_scanner_hooks(): void
{
    add_action(BYLINE_CONTENT_HEALTH_SCAN_HOOK, 'byline_content_health_cron_callback');
    add_action(BYLINE_CONTENT_HEALTH_CONTINUE_HOOK, 'byline_content_health_scan_batch');
    add_action('init', 'byline_content_health_register_cron');
}
