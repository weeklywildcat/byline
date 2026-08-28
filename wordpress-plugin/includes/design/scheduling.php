<?php

if (!defined('ABSPATH')) {
    exit;
}

// WordPress post types are limited to 20 characters. The short internal job
// type keeps the full design snapshot in a normal WordPress post while
// remaining invisible to readers, REST discovery, and the admin menu.
const BYLINE_DESIGN_SCHEDULE_POST_TYPE = 'byline_design_job';
const BYLINE_DESIGN_SCHEDULE_TEMPLATE_META = '_byline_design_job_template';
const BYLINE_DESIGN_SCHEDULE_BASE_REVISION_META = '_byline_design_job_base_revision';
const BYLINE_DESIGN_SCHEDULED_AT_META = '_byline_design_job_scheduled_at';
const BYLINE_DESIGN_SCHEDULED_BY_META = '_byline_design_job_scheduled_by';
const BYLINE_DESIGN_SCHEDULE_STATUS_META = '_byline_design_job_status';
const BYLINE_DESIGN_SCHEDULE_EXECUTION_META = '_byline_design_job_execution';
const BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META = '_byline_design_job_idempotency';
const BYLINE_DESIGN_SCHEDULE_RESULT_REVISION_META = '_byline_design_job_result_revision';
const BYLINE_DESIGN_SCHEDULE_ERROR_META = '_byline_design_job_error';
const BYLINE_DESIGN_SCHEDULE_LOCK_META = '_byline_design_job_lock';
const BYLINE_DESIGN_SCHEDULE_CRON_HOOK = 'byline_execute_scheduled_design';
const BYLINE_DESIGN_SCHEDULE_SNAPSHOT_VERSION = 1;
const BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS = 900;
const BYLINE_DESIGN_SCHEDULE_DEPLOYMENT_LOCK_SECONDS = 300;

const BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED = 'scheduled';
const BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING = 'processing';
const BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED = 'published';
const BYLINE_DESIGN_SCHEDULE_STATUS_CONFLICT = 'conflict';
const BYLINE_DESIGN_SCHEDULE_STATUS_FAILED = 'failed';
const BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED = 'cancelled';

function byline_design_schedule_statuses(): array
{
    return [
        BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED,
        BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING,
        BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED,
        BYLINE_DESIGN_SCHEDULE_STATUS_CONFLICT,
        BYLINE_DESIGN_SCHEDULE_STATUS_FAILED,
        BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED,
    ];
}

function byline_register_design_schedule_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_DESIGN_SCHEDULE_POST_TYPE, [
        'labels' => ['name' => __('Scheduled Byline Designs', 'weekly-wildcat-headless')],
        'public' => false,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title', 'editor', 'author'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'byline_register_design_schedule_post_type');

function byline_design_schedule_normalize_datetime($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return '';
    }

    $value = trim($value);
    // Accept an absolute calendar value only. Relative strings and server
    // timezone parsing make a schedule move depending on which cron worker
    // happens to receive it.
    if (!preg_match('/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i', $value)) {
        return '';
    }

    $has_timezone = preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/i', $value) === 1;
    try {
        $timezone = function_exists('wp_timezone') ? wp_timezone() : new DateTimeZone('UTC');
        $date = $has_timezone ? new DateTimeImmutable($value) : new DateTimeImmutable($value, $timezone);
        $timestamp = $date->getTimestamp();
    } catch (Throwable $error) {
        return '';
    }

    return gmdate(DATE_ATOM, $timestamp);
}

function byline_design_schedule_timestamp($value): int
{
    $normalized = byline_design_schedule_normalize_datetime($value);
    if ($normalized === '') {
        return 0;
    }

    $timestamp = strtotime($normalized);
    return $timestamp === false ? 0 : (int) $timestamp;
}

function byline_design_schedule_error(string $code, string $message, int $status = 400): WP_Error
{
    return new WP_Error($code, __($message, 'weekly-wildcat-headless'), ['status' => $status]);
}

function byline_design_schedule_encode($value): string
{
    $encoded = function_exists('wp_json_encode') ? wp_json_encode($value) : json_encode($value);
    return is_string($encoded) ? $encoded : '';
}

function byline_design_schedule_idempotency_key(
    string $template,
    $document,
    int $base_revision,
    string $scheduled_at,
    int $scheduled_by
): string {
    return hash('sha256', $template . "\n" . $base_revision . "\n" . $scheduled_at . "\n" . $scheduled_by . "\n" . byline_design_schedule_encode($document));
}

/**
 * Validates the schedule envelope without changing it.
 *
 * Storage accepts a schema-v1 document during the migration window and also
 * accepts a v2 document carrying legacy blocks. The publish guard is applied
 * separately at execution, so scheduling never destroys an existing design or
 * its future block data.
 */
function byline_validate_design_schedule_snapshot($snapshot, string $expected_template = '')
{
    if (!is_array($snapshot)) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design snapshot is malformed.');
    }

    $template = is_string($snapshot['template'] ?? null) ? $snapshot['template'] : '';
    if ($expected_template !== '' && $template !== $expected_template) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design template does not match the route.');
    }
    if ($template === '' || !byline_is_design_template($template)) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design template is invalid.');
    }
    if (!array_key_exists('document', $snapshot) || !is_array($snapshot['document'])) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design document is missing.');
    }

    $validation = byline_validate_design_document($snapshot['document'], $template);
    if (is_wp_error($validation)) {
        return $validation;
    }

    if (!is_int($snapshot['baseLiveRevision'] ?? null) || $snapshot['baseLiveRevision'] < 0) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design base revision is invalid.');
    }
    if (byline_design_schedule_normalize_datetime($snapshot['scheduledAt'] ?? '') === '') {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design time is invalid.');
    }
    if (!is_int($snapshot['scheduledBy'] ?? null) || $snapshot['scheduledBy'] <= 0) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design author is invalid.');
    }

    if (isset($snapshot['status'])
        && (!is_string($snapshot['status']) || !in_array($snapshot['status'], byline_design_schedule_statuses(), true))) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design status is invalid.');
    }

    if (isset($snapshot['execution']) && !is_array($snapshot['execution'])) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design execution state is invalid.');
    }

    return true;
}

function byline_design_schedule_post(int $schedule_id): ?WP_Post
{
    if ($schedule_id <= 0 || !function_exists('get_post')) {
        return null;
    }

    $post = get_post($schedule_id);
    if (!$post instanceof WP_Post) {
        return null;
    }
    if (isset($post->post_type) && $post->post_type !== BYLINE_DESIGN_SCHEDULE_POST_TYPE) {
        return null;
    }

    return $post;
}

function byline_design_schedule_execution_from_meta(int $schedule_id): array
{
    $encoded = get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_EXECUTION_META, true);
    if (is_array($encoded)) {
        return $encoded;
    }
    if (!is_string($encoded) || trim($encoded) === '') {
        return [];
    }

    $execution = json_decode($encoded, true);
    return is_array($execution) ? $execution : [];
}

function byline_design_schedule_mark_invalid_storage(int $schedule_id, string $message): void
{
    // A corrupt private record must never be turned into a due schedule by a
    // reader. Mark it for an authorized operator and make every read fail
    // closed; the immutable document is not repaired or replaced here.
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, $message);
}

/**
 * Reads one schedule. The post content is the immutable snapshot; all values
 * after it are mutable execution metadata kept in post meta.
 */
function byline_get_design_schedule(int $schedule_id): ?array
{
    $post = byline_design_schedule_post($schedule_id);
    if (!$post) {
        return null;
    }

    $stored = json_decode((string) $post->post_content, true);
    if (!is_array($stored)
        || (int) ($stored['snapshotVersion'] ?? 0) !== BYLINE_DESIGN_SCHEDULE_SNAPSHOT_VERSION
        || !is_array($stored['snapshot'] ?? null)) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design snapshot is malformed or uses an unsupported version.');
        return null;
    }

    $snapshot = $stored['snapshot'];
    $snapshot_validation = byline_validate_design_schedule_snapshot($snapshot);
    if (is_wp_error($snapshot_validation)) {
        byline_design_schedule_mark_invalid_storage($schedule_id, $snapshot_validation->get_error_message());
        return null;
    }

    $document = $snapshot['document'];
    // The document/template/user are read from the immutable envelope. Timing
    // and base revision are operational fields so reschedule/rebase can update
    // them without ever replacing the document payload.
    $template = (string) $snapshot['template'];
    $scheduled_at = (string) get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULED_AT_META, true);
    if ($scheduled_at === '') {
        $scheduled_at = (string) ($snapshot['scheduledAt'] ?? '');
    }
    $scheduled_by = (int) ($snapshot['scheduledBy'] ?? 0);
    if ($scheduled_by <= 0) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design author is invalid.');
        return null;
    }
    $status = (string) get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, true);
    if (!in_array($status, byline_design_schedule_statuses(), true)) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design status is invalid.');
        return null;
    }
    $execution = byline_design_schedule_execution_from_meta($schedule_id);
    if (!array_key_exists('attempts', $execution)
        || !array_key_exists('idempotencyKey', $execution)
        || !array_key_exists('startedAt', $execution)
        || !array_key_exists('completedAt', $execution)
        || !array_key_exists('deploymentTriggered', $execution)
        || !is_int($execution['attempts'])
        || $execution['attempts'] < 0
        || !is_string($execution['idempotencyKey'])
        || trim($execution['idempotencyKey']) === ''
        || !($execution['startedAt'] === null || is_string($execution['startedAt']))
        || !($execution['completedAt'] === null || is_string($execution['completedAt']))
        || !is_bool($execution['deploymentTriggered'])) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design execution state is invalid.');
        return null;
    }
    $idempotency_key = (string) get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META, true);
    if ($idempotency_key === '' && isset($execution['idempotencyKey'])) {
        $idempotency_key = (string) $execution['idempotencyKey'];
    }
    if ($idempotency_key === '' || $idempotency_key !== (string) $execution['idempotencyKey']) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design idempotency state is invalid.');
        return null;
    }
    $base_revision_meta = get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_BASE_REVISION_META, true);
    if ($base_revision_meta === '') {
        $base_revision = (int) $snapshot['baseLiveRevision'];
    } elseif (is_int($base_revision_meta)) {
        $base_revision = $base_revision_meta;
    } elseif (is_string($base_revision_meta) && preg_match('/^\d+$/', $base_revision_meta)) {
        $base_revision = (int) $base_revision_meta;
    } else {
        $base_revision = -1;
    }
    if ($base_revision < 0) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design base revision is invalid.');
        return null;
    }
    if (byline_design_schedule_normalize_datetime($scheduled_at) === '') {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design time is invalid.');
        return null;
    }
    $result_revision = get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_RESULT_REVISION_META, true);
    if ($result_revision !== ''
        && $result_revision !== null
        && !is_int($result_revision)
        && !(is_string($result_revision) && preg_match('/^\d+$/', $result_revision))) {
        byline_design_schedule_mark_invalid_storage($schedule_id, 'The scheduled design result revision is invalid.');
        return null;
    }
    $error = (string) get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, true);

    return [
        'id' => $schedule_id,
        'template' => $template,
        'document' => $document,
        'baseLiveRevision' => $base_revision,
        'scheduledAt' => $scheduled_at,
        'scheduledBy' => $scheduled_by,
        'status' => $status,
        'execution' => $execution,
        'idempotencyKey' => $idempotency_key,
        'resultingRevision' => $result_revision === '' ? null : (int) $result_revision,
        'error' => $error !== '' ? $error : null,
        'snapshotHash' => hash('sha256', byline_design_schedule_encode($document)),
    ];
}

function byline_design_schedule_write_execution(int $schedule_id, array $execution): void
{
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_EXECUTION_META, byline_design_schedule_encode($execution));
}

function byline_design_schedule_set_status(int $schedule_id, string $status, ?string $error = null): void
{
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, $status);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, $error ?? '');
}

/**
 * Keeps one cron event per schedule. WordPress cron is best-effort, so a
 * failed queue operation is returned to the caller instead of being hidden by
 * a record that claims it is scheduled.
 */
function byline_design_schedule_queue(int $schedule_id, int $timestamp)
{
    if ($timestamp <= 0 || !function_exists('wp_schedule_single_event')) {
        return true;
    }

    if (function_exists('wp_clear_scheduled_hook')) {
        wp_clear_scheduled_hook(BYLINE_DESIGN_SCHEDULE_CRON_HOOK, [$schedule_id]);
    }
    if (!wp_schedule_single_event($timestamp, BYLINE_DESIGN_SCHEDULE_CRON_HOOK, [$schedule_id])) {
        return byline_design_schedule_error('byline_design_schedule_queue_failed', 'The scheduled design was stored but could not be queued for WordPress cron.', 500);
    }

    return true;
}

function byline_design_schedule_find_by_idempotency_key(string $idempotency_key): ?array
{
    if ($idempotency_key === '' || !function_exists('get_posts')) {
        return null;
    }

    $posts = get_posts([
        'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => 1,
        'meta_key' => BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META,
        'meta_value' => $idempotency_key,
    ]);
    if (!is_array($posts) || !isset($posts[0]) || !$posts[0] instanceof WP_Post) {
        return null;
    }

    return byline_get_design_schedule((int) $posts[0]->ID);
}

function byline_design_schedule_idempotency_matches(
    array $existing,
    string $template,
    $document,
    int $base_revision,
    string $scheduled_at,
    int $scheduled_by
): bool {
    return $existing['template'] === $template
        && (int) $existing['baseLiveRevision'] === $base_revision
        && (string) $existing['scheduledAt'] === $scheduled_at
        && (int) $existing['scheduledBy'] === $scheduled_by
        && (string) ($existing['snapshotHash'] ?? '') === hash('sha256', byline_design_schedule_encode($document));
}

/**
 * Creates an immutable schedule record and one due cron event.
 */
function byline_create_design_schedule(
    string $template,
    $document,
    int $base_revision,
    string $scheduled_at,
    int $scheduled_by,
    string $idempotency_key = ''
) {
    $normalized_at = byline_design_schedule_normalize_datetime($scheduled_at);
    $snapshot = [
        'template' => $template,
        'document' => $document,
        'baseLiveRevision' => $base_revision,
        'scheduledAt' => $normalized_at,
        'scheduledBy' => $scheduled_by,
        'status' => BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED,
    ];
    $validation = byline_validate_design_schedule_snapshot($snapshot, $template);
    if (is_wp_error($validation)) {
        return $validation;
    }

    $idempotency_key = trim($idempotency_key);
    if ($idempotency_key === '') {
        $idempotency_key = byline_design_schedule_idempotency_key(
            $template,
            $document,
            $base_revision,
            $normalized_at,
            $scheduled_by
        );
    }
    if (strlen($idempotency_key) > 128) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The schedule idempotency key is too long.');
    }

    $existing = byline_design_schedule_find_by_idempotency_key($idempotency_key);
    if ($existing) {
        if (!byline_design_schedule_idempotency_matches(
            $existing,
            $template,
            $document,
            $base_revision,
            $normalized_at,
            $scheduled_by
        )) {
            return byline_design_schedule_error('byline_design_schedule_idempotency_conflict', 'The idempotency key is already bound to a different design schedule.', 409);
        }
        return $existing;
    }

    $live_revision = byline_design_revision(byline_get_design_post($template));
    $conflict = byline_design_conflict($base_revision, $live_revision);
    if ($conflict) {
        return $conflict;
    }

    $content = byline_design_schedule_encode([
        'snapshotVersion' => BYLINE_DESIGN_SCHEDULE_SNAPSHOT_VERSION,
        'snapshot' => $snapshot,
    ]);
    if ($content === '') {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design snapshot could not be encoded.');
    }

    $post_data = [
        'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
        'post_status' => 'private',
        'post_title' => 'Scheduled Byline design: ' . $template,
        'post_content' => $content,
        'post_author' => $scheduled_by,
    ];
    $post_id = wp_insert_post(function_exists('wp_slash') ? wp_slash($post_data) : $post_data, true);
    if (is_wp_error($post_id)) {
        return $post_id;
    }
    if ((int) $post_id <= 0) {
        return byline_design_schedule_error('byline_design_schedule_failed', 'The scheduled design could not be stored.', 500);
    }

    $post_id = (int) $post_id;
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_TEMPLATE_META, $template);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_BASE_REVISION_META, $base_revision);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULED_AT_META, $normalized_at);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULED_BY_META, $scheduled_by);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META, $idempotency_key);
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_RESULT_REVISION_META, '');
    update_post_meta($post_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, '');
    byline_design_schedule_write_execution($post_id, [
        'attempts' => 0,
        'idempotencyKey' => $idempotency_key,
        'startedAt' => null,
        'completedAt' => null,
        'deploymentTriggered' => false,
    ]);

    $queued = byline_design_schedule_queue($post_id, byline_design_schedule_timestamp($normalized_at));
    if (is_wp_error($queued)) {
        byline_design_schedule_set_status($post_id, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED, $queued->get_error_message());
        return $queued;
    }

    $record = byline_get_design_schedule($post_id);
    return $record ?: $snapshot + ['id' => $post_id, 'idempotencyKey' => $idempotency_key];
}

function byline_design_schedule_release_lock(int $schedule_id): void
{
    if (function_exists('delete_post_meta')) {
        delete_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META);
    } else {
        update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META, '');
    }
}

function byline_design_schedule_claim(int $schedule_id): bool
{
    $existing = get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META, true);
    $now = time();
    if (is_string($existing) && $existing !== '') {
        $lock = json_decode($existing, true);
        $locked_at = is_array($lock) ? (int) ($lock['at'] ?? 0) : (int) $existing;
        if ($locked_at > 0 && $locked_at + BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS > $now) {
            return false;
        }
        byline_design_schedule_release_lock($schedule_id);
    }

    $token = byline_design_schedule_encode(['token' => hash('sha256', uniqid('', true)), 'at' => $now]);
    if (function_exists('add_post_meta')) {
        if (!add_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META, $token, true)) {
            return false;
        }
        return true;
    }

    // Test doubles and unusually old WP hosts may not expose add_post_meta.
    // Status remains the second guard, and writing the token still makes the
    // lock visible to a later retry.
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META, $token);
    return true;
}

function byline_design_schedule_mark_failure(int $schedule_id, WP_Error $error): WP_Error
{
    $execution = byline_design_schedule_execution_from_meta($schedule_id);
    $execution['completedAt'] = gmdate(DATE_ATOM);
    byline_design_schedule_write_execution($schedule_id, $execution);
    byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED, $error->get_error_message());
    byline_design_schedule_release_lock($schedule_id);
    return $error;
}

function byline_design_schedule_mark_conflict(int $schedule_id, WP_Error $error): WP_Error
{
    $execution = byline_design_schedule_execution_from_meta($schedule_id);
    $execution['completedAt'] = gmdate(DATE_ATOM);
    byline_design_schedule_write_execution($schedule_id, $execution);
    byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_CONFLICT, $error->get_error_message());
    byline_design_schedule_release_lock($schedule_id);
    return $error;
}

function byline_design_schedule_can_publish(int $scheduled_by): bool
{
    if (function_exists('user_can')) {
        return $scheduled_by > 0 && user_can($scheduled_by, BYLINE_PUBLISH_DESIGN_CAPABILITY);
    }

    // The real WordPress runtime has user_can(). This fallback keeps the pure
    // PHP regression harness usable without inventing a second permission
    // system; REST creation is still capability-gated.
    return true;
}

function byline_design_schedule_trigger_deployment_once(int $schedule_id): bool
{
    $record = byline_get_design_schedule($schedule_id);
    if (!$record) {
        return false;
    }
    $execution = $record['execution'];
    if (!empty($execution['deploymentTriggered'])) {
        return false;
    }

    $lock_key = BYLINE_DESIGN_SCHEDULE_LOCK_META . '_deployment';
    $lock = get_post_meta($schedule_id, $lock_key, true);
    if ($lock !== '' && $lock !== null) {
        $decoded_lock = is_string($lock) ? json_decode($lock, true) : null;
        $locked_at = is_array($decoded_lock) ? (int) ($decoded_lock['at'] ?? 0) : (int) $lock;
        if ($locked_at > 0 && $locked_at + BYLINE_DESIGN_SCHEDULE_DEPLOYMENT_LOCK_SECONDS > time()) {
            return false;
        }
        // A crashed worker must not permanently suppress the deployment. An
        // expired/malformed marker is recoverable and may be claimed again.
        if (function_exists('delete_post_meta')) {
            delete_post_meta($schedule_id, $lock_key);
        } else {
            update_post_meta($schedule_id, $lock_key, '');
        }
    }
    $deployment_lock = byline_design_schedule_encode([
        'token' => hash('sha256', uniqid('', true)),
        'at' => time(),
    ]);
    if (function_exists('add_post_meta')) {
        if (!add_post_meta($schedule_id, $lock_key, $deployment_lock, true)) {
            return false;
        }
    } else {
        // The real WordPress path has add_post_meta() and gets an atomic
        // unique claim. This fallback still leaves an expiring marker rather
        // than a permanent suppression if a minimal host crashes.
        update_post_meta($schedule_id, $lock_key, $deployment_lock);
    }

    try {
        byline_trigger_design_deployment(
            (string) $record['template'],
            (int) ($record['resultingRevision'] ?? 0),
            'scheduled'
        );
    } catch (Throwable $error) {
        if (function_exists('delete_post_meta')) {
            delete_post_meta($schedule_id, $lock_key);
        } else {
            update_post_meta($schedule_id, $lock_key, '');
        }
        return false;
    }

    $execution['deploymentTriggered'] = true;
    byline_design_schedule_write_execution($schedule_id, $execution);
    if (function_exists('delete_post_meta')) {
        delete_post_meta($schedule_id, $lock_key);
    } else {
        update_post_meta($schedule_id, $lock_key, '');
    }

    return true;
}

function byline_design_schedule_reschedule(int $schedule_id, string $scheduled_at)
{
    $record = byline_get_design_schedule($schedule_id);
    if (!$record) {
        return byline_design_schedule_error('byline_unknown_design_schedule', 'Unknown scheduled design.', 404);
    }
    if (in_array($record['status'], [BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED, BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED], true)) {
        return byline_design_schedule_error('byline_design_schedule_terminal', 'This scheduled design can no longer be changed.', 409);
    }
    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING) {
        return byline_design_schedule_error('byline_design_schedule_processing', 'This scheduled design is currently being published and cannot be rescheduled.', 409);
    }

    $normalized_at = byline_design_schedule_normalize_datetime($scheduled_at);
    if ($normalized_at === '') {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The scheduled design time is invalid.');
    }
    $key = byline_design_schedule_idempotency_key(
        $record['template'],
        $record['document'],
        (int) $record['baseLiveRevision'],
        $normalized_at,
        (int) $record['scheduledBy']
    );
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULED_AT_META, $normalized_at);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META, $key);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, '');
    $execution = $record['execution'];
    $execution['idempotencyKey'] = $key;
    $execution['startedAt'] = null;
    $execution['completedAt'] = null;
    $execution['deploymentTriggered'] = false;
    byline_design_schedule_write_execution($schedule_id, $execution);
    byline_design_schedule_release_lock($schedule_id);

    $queued = byline_design_schedule_queue($schedule_id, byline_design_schedule_timestamp($normalized_at));
    if (is_wp_error($queued)) {
        byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED, $queued->get_error_message());
        return $queued;
    }

    return byline_get_design_schedule($schedule_id);
}

function byline_design_schedule_rebase(int $schedule_id, int $base_revision)
{
    $record = byline_get_design_schedule($schedule_id);
    if (!$record) {
        return byline_design_schedule_error('byline_unknown_design_schedule', 'Unknown scheduled design.', 404);
    }
    if ($base_revision < 0) {
        return byline_design_schedule_error('byline_invalid_design_schedule', 'The base design revision is invalid.');
    }
    if (in_array($record['status'], [BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED, BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED], true)) {
        return byline_design_schedule_error('byline_design_schedule_terminal', 'This scheduled design can no longer be changed.', 409);
    }
    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING) {
        return byline_design_schedule_error('byline_design_schedule_processing', 'This scheduled design is currently being published and cannot be rebased.', 409);
    }

    $live_revision = byline_design_revision(byline_get_design_post($record['template']));
    $conflict = byline_design_conflict($base_revision, $live_revision);
    if ($conflict) {
        return $conflict;
    }

    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_BASE_REVISION_META, $base_revision);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_META, BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_ERROR_META, '');
    $key = byline_design_schedule_idempotency_key(
        $record['template'],
        $record['document'],
        $base_revision,
        (string) $record['scheduledAt'],
        (int) $record['scheduledBy']
    );
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_IDEMPOTENCY_META, $key);
    $execution = $record['execution'];
    $execution['idempotencyKey'] = $key;
    $execution['startedAt'] = null;
    $execution['completedAt'] = null;
    $execution['deploymentTriggered'] = false;
    byline_design_schedule_write_execution($schedule_id, $execution);
    byline_design_schedule_release_lock($schedule_id);

    // A conflict is found after the original due event has fired. Rebase is an
    // explicit reconfirmation, so it must enqueue a fresh event for the same
    // immutable document; otherwise the schedule would be left stranded in
    // "scheduled" forever.
    $queued = byline_design_schedule_queue($schedule_id, byline_design_schedule_timestamp((string) $record['scheduledAt']));
    if (is_wp_error($queued)) {
        byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED, $queued->get_error_message());
        return $queued;
    }

    return byline_get_design_schedule($schedule_id);
}

function byline_cancel_design_schedule(int $schedule_id)
{
    $record = byline_get_design_schedule($schedule_id);
    if (!$record) {
        return byline_design_schedule_error('byline_unknown_design_schedule', 'Unknown scheduled design.', 404);
    }
    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED) {
        return byline_design_schedule_error('byline_design_schedule_terminal', 'A published design schedule cannot be cancelled.', 409);
    }
    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING) {
        return byline_design_schedule_error('byline_design_schedule_processing', 'This scheduled design is currently being published and cannot be cancelled.', 409);
    }

    byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED);
    byline_design_schedule_release_lock($schedule_id);
    return byline_get_design_schedule($schedule_id);
}

/**
 * Executes one due schedule. Terminal records and an in-flight record claimed
 * by another worker are safe no-ops.
 */
function byline_execute_design_schedule(int $schedule_id, ?int $now = null)
{
    $record = byline_get_design_schedule($schedule_id);
    if (!$record) {
        return byline_design_schedule_error('byline_unknown_design_schedule', 'Unknown scheduled design.', 404);
    }

    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED) {
        if (empty($record['execution']['deploymentTriggered'])) {
            byline_design_schedule_trigger_deployment_once($schedule_id);
        }
        return byline_get_design_schedule($schedule_id);
    }
    if (in_array($record['status'], [BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED, BYLINE_DESIGN_SCHEDULE_STATUS_CONFLICT, BYLINE_DESIGN_SCHEDULE_STATUS_FAILED], true)) {
        return $record;
    }

    $now = $now ?? time();
    if (byline_design_schedule_timestamp($record['scheduledAt']) > $now) {
        return $record;
    }

    // Recover a request that crashed after the live post was written but before
    // the schedule metadata was committed. The live marker is authoritative for
    // this one idempotent scheduled execution.
    if ($record['status'] === BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING) {
        $live = byline_get_design_post($record['template']);
        $live_key = $live ? (string) get_post_meta($live->ID, BYLINE_DESIGN_PUBLISH_IDEMPOTENCY_META, true) : '';
        if ($live_key !== '' && $live_key === $record['idempotencyKey']) {
            $execution = $record['execution'];
            $execution['completedAt'] = gmdate(DATE_ATOM);
            byline_design_schedule_write_execution($schedule_id, $execution);
            update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_RESULT_REVISION_META, byline_design_revision($live));
            byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED);
            byline_design_schedule_release_lock($schedule_id);
            byline_design_schedule_trigger_deployment_once($schedule_id);
            return byline_get_design_schedule($schedule_id);
        }

        $started = byline_design_schedule_timestamp($record['execution']['startedAt'] ?? '');
        if ($started > 0 && $started + BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS > $now) {
            return $record;
        }
        byline_design_schedule_release_lock($schedule_id);
        byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED);
        $record = byline_get_design_schedule($schedule_id);
    }

    if (!$record || $record['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED || !byline_design_schedule_claim($schedule_id)) {
        return byline_get_design_schedule($schedule_id) ?: $record;
    }

    $execution = $record['execution'];
    $execution['attempts'] = ((int) ($execution['attempts'] ?? 0)) + 1;
    $execution['startedAt'] = gmdate(DATE_ATOM);
    $execution['completedAt'] = null;
    $execution['idempotencyKey'] = $record['idempotencyKey'];
    byline_design_schedule_write_execution($schedule_id, $execution);
    byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING);

    $snapshot = [
        'template' => $record['template'],
        'document' => $record['document'],
        'baseLiveRevision' => (int) $record['baseLiveRevision'],
        'scheduledAt' => $record['scheduledAt'],
        'scheduledBy' => (int) $record['scheduledBy'],
        'status' => BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING,
        'execution' => $execution,
    ];
    $validation = byline_validate_design_schedule_snapshot($snapshot, $record['template']);
    if (is_wp_error($validation)) {
        return byline_design_schedule_mark_failure($schedule_id, $validation);
    }
    if (byline_design_has_unconverted_blocks($record['document'])) {
        return byline_design_schedule_mark_failure(
            $schedule_id,
            byline_design_schedule_error('byline_unconverted_design_blocks', 'The scheduled design still contains unconverted legacy blocks.', 409)
        );
    }
    if (!byline_design_schedule_can_publish((int) $record['scheduledBy'])) {
        return byline_design_schedule_mark_failure(
            $schedule_id,
            byline_design_schedule_error('byline_design_schedule_capability', 'The scheduling user can no longer publish designs.', 403)
        );
    }

    $live_revision = byline_design_revision(byline_get_design_post($record['template']));
    $conflict = byline_design_conflict((int) $record['baseLiveRevision'], $live_revision);
    if ($conflict) {
        return byline_design_schedule_mark_conflict($schedule_id, $conflict);
    }

    $published = byline_publish_design_document(
        $record['template'],
        $record['document'],
        (int) $record['baseLiveRevision'],
        (int) $record['scheduledBy'],
        'scheduled',
        false,
        $record['idempotencyKey']
    );
    if (is_wp_error($published)) {
        if ($published->get_error_code() === 'byline_design_conflict') {
            return byline_design_schedule_mark_conflict($schedule_id, $published);
        }
        return byline_design_schedule_mark_failure($schedule_id, $published);
    }

    $result_revision = (int) ($published['revision'] ?? 0);
    update_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_RESULT_REVISION_META, $result_revision);
    $execution['completedAt'] = gmdate(DATE_ATOM);
    $execution['deploymentTriggered'] = false;
    byline_design_schedule_write_execution($schedule_id, $execution);
    // Persist the terminal result before calling the deployment provider. A
    // retry can now recover the publish and use the once-only deployment lock.
    byline_design_schedule_set_status($schedule_id, BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED);
    byline_design_schedule_release_lock($schedule_id);
    byline_design_schedule_trigger_deployment_once($schedule_id);

    return byline_get_design_schedule($schedule_id);
}

function byline_execute_due_design_schedules($schedule_id = 0)
{
    if ((int) $schedule_id > 0) {
        return byline_execute_design_schedule((int) $schedule_id);
    }

    if (!function_exists('get_posts')) {
        return [];
    }
    $posts = get_posts([
        'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => 100,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);
    $results = [];
    if (!is_array($posts)) {
        return $results;
    }
    foreach ($posts as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $record = byline_get_design_schedule((int) $post->ID);
        if (!$record || !in_array($record['status'], [BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED, BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING, BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED], true)) {
            continue;
        }
        if (byline_design_schedule_timestamp($record['scheduledAt']) <= time()) {
            $results[] = byline_execute_design_schedule((int) $post->ID);
        }
    }
    return $results;
}
add_action(BYLINE_DESIGN_SCHEDULE_CRON_HOOK, 'byline_execute_due_design_schedules', 10, 1);
