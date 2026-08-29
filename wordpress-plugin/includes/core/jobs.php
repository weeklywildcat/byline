<?php

/**
 * Durable Byline job primitives.
 *
 * New jobs are stored in a private WordPress post with a versioned JSON
 * envelope and mutable execution metadata. Ordinary payloads stay immutable;
 * a queued deployment may be coalesced to the newest revision. WordPress cron
 * only carries the job ID, so an expired or missing cron event cannot lose the
 * work. Existing design schedules intentionally remain on their established
 * storage and are exposed through a read-only adapter below.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_JOB_POST_TYPE')) {
    define('BYLINE_JOB_POST_TYPE', 'byline_job');
}
if (!defined('BYLINE_JOB_SCHEMA_VERSION')) {
    define('BYLINE_JOB_SCHEMA_VERSION', 1);
}
if (!defined('BYLINE_JOB_CRON_HOOK')) {
    define('BYLINE_JOB_CRON_HOOK', 'byline_run_due_jobs');
}
if (!defined('BYLINE_JOB_WAKE_HOOK')) {
    define('BYLINE_JOB_WAKE_HOOK', 'byline_wake_job');
}
if (!defined('BYLINE_JOB_CRON_INTERVAL')) {
    define('BYLINE_JOB_CRON_INTERVAL', 300);
}
if (!defined('BYLINE_JOB_LEASE_SECONDS')) {
    define('BYLINE_JOB_LEASE_SECONDS', 300);
}
if (!defined('BYLINE_JOB_DEFAULT_MAX_ATTEMPTS')) {
    define('BYLINE_JOB_DEFAULT_MAX_ATTEMPTS', 3);
}
if (!defined('BYLINE_JOB_DEFAULT_RETRY_DELAY')) {
    define('BYLINE_JOB_DEFAULT_RETRY_DELAY', 60);
}

if (!defined('BYLINE_JOB_TYPE_META')) {
    define('BYLINE_JOB_TYPE_META', '_byline_job_type');
}
if (!defined('BYLINE_JOB_STATUS_META')) {
    define('BYLINE_JOB_STATUS_META', '_byline_job_status');
}
if (!defined('BYLINE_JOB_CREATED_AT_META')) {
    define('BYLINE_JOB_CREATED_AT_META', '_byline_job_created_at');
}
if (!defined('BYLINE_JOB_DUE_AT_META')) {
    define('BYLINE_JOB_DUE_AT_META', '_byline_job_due_at');
}
if (!defined('BYLINE_JOB_STARTED_AT_META')) {
    define('BYLINE_JOB_STARTED_AT_META', '_byline_job_started_at');
}
if (!defined('BYLINE_JOB_COMPLETED_AT_META')) {
    define('BYLINE_JOB_COMPLETED_AT_META', '_byline_job_completed_at');
}
if (!defined('BYLINE_JOB_ATTEMPTS_META')) {
    define('BYLINE_JOB_ATTEMPTS_META', '_byline_job_attempts');
}
if (!defined('BYLINE_JOB_MAX_ATTEMPTS_META')) {
    define('BYLINE_JOB_MAX_ATTEMPTS_META', '_byline_job_max_attempts');
}
if (!defined('BYLINE_JOB_RETRY_DELAY_META')) {
    define('BYLINE_JOB_RETRY_DELAY_META', '_byline_job_retry_delay');
}
if (!defined('BYLINE_JOB_LAST_ERROR_META')) {
    define('BYLINE_JOB_LAST_ERROR_META', '_byline_job_last_error');
}
if (!defined('BYLINE_JOB_NEXT_ATTEMPT_AT_META')) {
    define('BYLINE_JOB_NEXT_ATTEMPT_AT_META', '_byline_job_next_attempt_at');
}
if (!defined('BYLINE_JOB_IDEMPOTENCY_META')) {
    define('BYLINE_JOB_IDEMPOTENCY_META', '_byline_job_idempotency');
}
if (!defined('BYLINE_JOB_PAYLOAD_HASH_META')) {
    define('BYLINE_JOB_PAYLOAD_HASH_META', '_byline_job_payload_hash');
}
if (!defined('BYLINE_JOB_LEASE_META')) {
    define('BYLINE_JOB_LEASE_META', '_byline_job_lease');
}
if (!defined('BYLINE_JOB_ACTOR_META')) {
    define('BYLINE_JOB_ACTOR_META', '_byline_job_actor_id');
}
if (!defined('BYLINE_JOB_LAST_ACTOR_META')) {
    define('BYLINE_JOB_LAST_ACTOR_META', '_byline_job_last_actor_id');
}
if (!defined('BYLINE_JOB_CANCELLED_AT_META')) {
    define('BYLINE_JOB_CANCELLED_AT_META', '_byline_job_cancelled_at');
}
if (!defined('BYLINE_JOB_CANCEL_REQUESTED_META')) {
    define('BYLINE_JOB_CANCEL_REQUESTED_META', '_byline_job_cancel_requested');
}
if (!defined('BYLINE_JOB_RESULT_META')) {
    define('BYLINE_JOB_RESULT_META', '_byline_job_result');
}
if (!defined('BYLINE_JOB_UPDATED_AT_META')) {
    define('BYLINE_JOB_UPDATED_AT_META', '_byline_job_updated_at');
}
if (!defined('BYLINE_JOB_LAST_SOURCE_META')) {
    define('BYLINE_JOB_LAST_SOURCE_META', '_byline_job_last_source');
}

if (!defined('BYLINE_JOBS_LAST_RUN_OPTION')) {
    define('BYLINE_JOBS_LAST_RUN_OPTION', 'byline_jobs_last_run_at');
}
if (!defined('BYLINE_JOBS_LAST_SUCCESS_OPTION')) {
    define('BYLINE_JOBS_LAST_SUCCESS_OPTION', 'byline_jobs_last_success_at');
}
if (!defined('BYLINE_JOBS_LAST_ERROR_OPTION')) {
    define('BYLINE_JOBS_LAST_ERROR_OPTION', 'byline_jobs_last_error');
}
if (!defined('BYLINE_JOBS_LAST_SOURCE_OPTION')) {
    define('BYLINE_JOBS_LAST_SOURCE_OPTION', 'byline_jobs_last_source');
}

const BYLINE_JOB_STATUS_QUEUED = 'queued';
const BYLINE_JOB_STATUS_RUNNING = 'running';
const BYLINE_JOB_STATUS_RETRY_WAITING = 'retry_waiting';
const BYLINE_JOB_STATUS_SUCCEEDED = 'succeeded';
const BYLINE_JOB_STATUS_FAILED = 'failed';
const BYLINE_JOB_STATUS_CANCELLED = 'cancelled';

function byline_job_statuses(): array
{
    return [
        BYLINE_JOB_STATUS_QUEUED,
        BYLINE_JOB_STATUS_RUNNING,
        BYLINE_JOB_STATUS_RETRY_WAITING,
        BYLINE_JOB_STATUS_SUCCEEDED,
        BYLINE_JOB_STATUS_FAILED,
        BYLINE_JOB_STATUS_CANCELLED,
    ];
}

function byline_job_error(string $code, string $message, int $status = 400, array $extra = [])
{
    return new WP_Error($code, $message, array_merge(['status' => $status], $extra));
}

function byline_job_is_error($value): bool
{
    return (function_exists('is_wp_error') && is_wp_error($value))
        || (class_exists('WP_Error') && $value instanceof WP_Error);
}

function byline_job_now(): int
{
    if (function_exists('current_time')) {
        return max(1, (int) current_time('timestamp', true));
    }
    return max(1, time());
}

function byline_job_parse_timestamp($value, int $fallback = 0): int
{
    if (is_int($value) || (is_string($value) && preg_match('/^\d+$/', $value) === 1)) {
        return (int) $value > 0 ? (int) $value : $fallback;
    }
    if (!is_string($value) || trim($value) === '') {
        return $fallback;
    }
    $parsed = strtotime($value);
    return $parsed === false || $parsed <= 0 ? $fallback : (int) $parsed;
}

function byline_job_format_timestamp($value): ?string
{
    $timestamp = (int) $value;
    return $timestamp > 0 ? gmdate(DATE_ATOM, $timestamp) : null;
}

function byline_job_encode($value): string
{
    $encoded = function_exists('wp_json_encode')
        ? wp_json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        : json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return is_string($encoded) ? $encoded : '';
}

function byline_job_normalize_value($value)
{
    if (!is_array($value)) {
        return is_scalar($value) || $value === null ? $value : (string) $value;
    }

    $keys = array_keys($value);
    $is_list = $keys === [] || $keys === range(0, count($keys) - 1);
    if (!$is_list) {
        ksort($value, SORT_STRING);
    }
    foreach ($value as $key => $child) {
        $value[$key] = byline_job_normalize_value($child);
    }
    return $value;
}

function byline_job_payload_hash(array $payload): string
{
    $encoded = byline_job_encode(byline_job_normalize_value($payload));
    return hash('sha256', $encoded !== '' ? $encoded : serialize($payload));
}

function byline_job_safe_text($value, int $maximum = 500): string
{
    $value = is_scalar($value) ? trim((string) $value) : '';
    if (function_exists('sanitize_text_field')) {
        $value = sanitize_text_field($value);
    } else {
        $value = trim(strip_tags($value));
    }
    $value = preg_replace('/\b(?:https?|ftp):\/\/[^\s]+/i', '[redacted-url]', $value);
    $value = preg_replace('/\b((?:token|secret|password|authorization|api[_-]?key))\s*[:=]\s*[^\s,;]+/i', '$1=[redacted]', $value);
    $value = is_string($value) ? $value : '';
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_job_error_text($error): string
{
    if (byline_job_is_error($error)) {
        $message = method_exists($error, 'get_error_message') ? $error->get_error_message() : 'The job failed.';
        return byline_job_safe_text($message) ?: 'The job failed.';
    }
    if ($error instanceof Throwable) {
        return 'The job failed unexpectedly.';
    }
    return byline_job_safe_text($error) ?: 'The job failed.';
}

function byline_job_type_value(string $type): string
{
    $type = strtolower(trim($type));
    return preg_match('/^[a-z][a-z0-9_-]{0,63}$/', $type) === 1 ? $type : '';
}

function byline_job_idempotency_value($value): string
{
    $value = is_scalar($value) ? trim((string) $value) : '';
    $value = preg_replace('/[^A-Za-z0-9._:-]+/', '-', $value);
    return function_exists('mb_substr') ? mb_substr((string) $value, 0, 191) : substr((string) $value, 0, 191);
}

function byline_job_meta(int $job_id, string $key, $default = null)
{
    if (!function_exists('get_post_meta')) {
        return $default;
    }
    $value = get_post_meta($job_id, $key, true);
    return ($value === '' || $value === null) && $default !== null ? $default : $value;
}

function byline_job_meta_int(int $job_id, string $key, int $default = 0): int
{
    $value = byline_job_meta($job_id, $key, $default);
    return is_numeric($value) ? (int) $value : $default;
}

function byline_job_meta_bool(int $job_id, string $key): bool
{
    return in_array(byline_job_meta($job_id, $key, false), [true, 1, '1', 'true'], true);
}

function byline_job_meta_json(int $job_id, string $key): array
{
    $value = byline_job_meta($job_id, $key, []);
    if (is_array($value)) {
        return $value;
    }
    if (!is_string($value) || trim($value) === '') {
        return [];
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : [];
}

function byline_job_post(int $job_id)
{
    if ($job_id <= 0 || !function_exists('get_post')) {
        return null;
    }
    $post = get_post($job_id);
    return is_object($post) && (string) ($post->post_type ?? '') === BYLINE_JOB_POST_TYPE ? $post : null;
}

function byline_job_posts(array $args = []): array
{
    if (!function_exists('get_posts')) {
        return [];
    }
    $defaults = [
        'post_type' => BYLINE_JOB_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => 100,
        'orderby' => 'ID',
        'order' => 'ASC',
    ];
    $posts = get_posts(array_merge($defaults, $args));
    return is_array($posts) ? $posts : [];
}

function byline_job_internal(int $job_id): ?array
{
    $post = byline_job_post($job_id);
    if (!$post) {
        return null;
    }

    $envelope = json_decode((string) ($post->post_content ?? ''), true);
    if (!is_array($envelope)
        || (int) ($envelope['schemaVersion'] ?? 0) !== BYLINE_JOB_SCHEMA_VERSION
        || !is_array($envelope['payload'] ?? null)) {
        return null;
    }

    $type = byline_job_type_value((string) ($envelope['type'] ?? byline_job_meta($job_id, BYLINE_JOB_TYPE_META, '')));
    $status = (string) byline_job_meta($job_id, BYLINE_JOB_STATUS_META, '');
    if ($type === '' || !in_array($status, byline_job_statuses(), true)) {
        return null;
    }

    $created_at = byline_job_meta_int($job_id, BYLINE_JOB_CREATED_AT_META, 0);
    if ($created_at <= 0) {
        $created_at = byline_job_parse_timestamp((string) ($post->post_date_gmt ?? ''), byline_job_now());
    }
    $due_at = byline_job_meta_int($job_id, BYLINE_JOB_DUE_AT_META, $created_at);
    $lease = byline_job_meta_json($job_id, BYLINE_JOB_LEASE_META);
    $payload_hash = (string) byline_job_meta($job_id, BYLINE_JOB_PAYLOAD_HASH_META, (string) ($envelope['payloadHash'] ?? ''));
    $idempotency = (string) byline_job_meta($job_id, BYLINE_JOB_IDEMPOTENCY_META, (string) ($envelope['idempotencyKey'] ?? ''));

    return [
        'id' => $job_id,
        'jobId' => 'byline:' . $job_id,
        'type' => $type,
        'status' => $status,
        'payload' => $envelope['payload'],
        'payloadHash' => $payload_hash,
        'idempotencyKey' => $idempotency,
        'createdAt' => $created_at,
        'dueAt' => $due_at,
        'startedAt' => byline_job_meta_int($job_id, BYLINE_JOB_STARTED_AT_META, 0),
        'completedAt' => byline_job_meta_int($job_id, BYLINE_JOB_COMPLETED_AT_META, 0),
        'attempts' => max(0, byline_job_meta_int($job_id, BYLINE_JOB_ATTEMPTS_META, 0)),
        'maxAttempts' => max(1, byline_job_meta_int($job_id, BYLINE_JOB_MAX_ATTEMPTS_META, BYLINE_JOB_DEFAULT_MAX_ATTEMPTS)),
        'retryDelay' => max(1, byline_job_meta_int($job_id, BYLINE_JOB_RETRY_DELAY_META, BYLINE_JOB_DEFAULT_RETRY_DELAY)),
        'lastError' => byline_job_safe_text(byline_job_meta($job_id, BYLINE_JOB_LAST_ERROR_META, '')),
        'nextAttemptAt' => byline_job_meta_int($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, 0),
        'actorId' => max(0, byline_job_meta_int($job_id, BYLINE_JOB_ACTOR_META, 0)),
        'lastActorId' => max(0, byline_job_meta_int($job_id, BYLINE_JOB_LAST_ACTOR_META, 0)),
        'cancelledAt' => byline_job_meta_int($job_id, BYLINE_JOB_CANCELLED_AT_META, 0),
        'cancelRequested' => byline_job_meta_bool($job_id, BYLINE_JOB_CANCEL_REQUESTED_META),
        'lease' => $lease,
        'result' => byline_job_meta_json($job_id, BYLINE_JOB_RESULT_META),
        'updatedAt' => byline_job_meta_int($job_id, BYLINE_JOB_UPDATED_AT_META, $created_at),
        'lastSource' => byline_job_safe_text(byline_job_meta($job_id, BYLINE_JOB_LAST_SOURCE_META, ''), 80),
    ];
}

function byline_job_public_record(?array $job): ?array
{
    if (!is_array($job)) {
        return null;
    }
    $public = $job;
    foreach (['createdAt', 'dueAt', 'startedAt', 'completedAt', 'nextAttemptAt', 'cancelledAt', 'updatedAt'] as $field) {
        $public[$field] = byline_job_format_timestamp($job[$field] ?? 0);
    }
    $lease = is_array($job['lease'] ?? null) ? $job['lease'] : [];
    $public['leaseActive'] = !empty($lease['expiresAt']) && (int) $lease['expiresAt'] > byline_job_now();
    $public['leaseExpiresAt'] = byline_job_format_timestamp($lease['expiresAt'] ?? 0);
    $public['canCancel'] = in_array($job['status'], [BYLINE_JOB_STATUS_QUEUED, BYLINE_JOB_STATUS_RUNNING, BYLINE_JOB_STATUS_RETRY_WAITING], true);
    $public['canRetry'] = in_array($job['status'], [BYLINE_JOB_STATUS_FAILED, BYLINE_JOB_STATUS_CANCELLED, BYLINE_JOB_STATUS_RETRY_WAITING], true);
    unset($public['payload'], $public['lease'], $public['result']);
    return $public;
}

function byline_get_job(int $job_id): ?array
{
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_job_find_by_idempotency(string $type, string $idempotency_key): ?array
{
    if ($idempotency_key === '') {
        return null;
    }
    foreach (byline_job_posts([
        'posts_per_page' => -1,
        'meta_key' => BYLINE_JOB_IDEMPOTENCY_META,
        'meta_value' => $idempotency_key,
        'orderby' => 'ID',
        'order' => 'DESC',
    ]) as $post) {
        $job_id = (int) ($post->ID ?? 0);
        $job = byline_job_internal($job_id);
        if ($job && $job['type'] === $type && $job['idempotencyKey'] === $idempotency_key) {
            return $job;
        }
    }
    return null;
}

function byline_job_actor_id(array $args): int
{
    if (array_key_exists('actorId', $args)) {
        return max(0, (int) $args['actorId']);
    }
    return function_exists('get_current_user_id') ? max(0, (int) get_current_user_id()) : 0;
}

function byline_job_create(string $type, array $payload, array $args = [])
{
    $type = byline_job_type_value($type);
    if ($type === '') {
        return byline_job_error('byline_invalid_job_type', 'The job type is invalid.');
    }
    $payload = byline_job_normalize_value($payload);
    $payload_hash = byline_job_payload_hash($payload);
    $idempotency = byline_job_idempotency_value($args['idempotencyKey'] ?? '');
    if ($idempotency === '') {
        $idempotency = $type . ':' . $payload_hash;
    }
    $existing = byline_job_find_by_idempotency($type, $idempotency);
    if ($existing) {
        if ((string) $existing['payloadHash'] !== $payload_hash) {
            return byline_job_error(
                'byline_job_idempotency_conflict',
                'The idempotency key is already bound to a different job payload.',
                409,
                ['jobId' => $existing['jobId']]
            );
        }
        $record = byline_job_public_record($existing);
        $record['idempotent'] = true;
        return $record;
    }

    if (!function_exists('wp_insert_post') || !function_exists('update_post_meta')) {
        return byline_job_error('byline_job_storage_unavailable', 'Durable job storage is unavailable.', 500);
    }

    $now = byline_job_parse_timestamp($args['createdAt'] ?? null, byline_job_now());
    $due_at = byline_job_parse_timestamp($args['dueAt'] ?? null, $now);
    $max_attempts = min(20, max(1, (int) ($args['maxAttempts'] ?? BYLINE_JOB_DEFAULT_MAX_ATTEMPTS)));
    $retry_delay = min(86400, max(1, (int) ($args['retryDelay'] ?? BYLINE_JOB_DEFAULT_RETRY_DELAY)));
    $actor_id = byline_job_actor_id($args);
    $envelope = [
        'schemaVersion' => BYLINE_JOB_SCHEMA_VERSION,
        'type' => $type,
        'payload' => $payload,
        'payloadHash' => $payload_hash,
        'idempotencyKey' => $idempotency,
        'createdAt' => gmdate(DATE_ATOM, $now),
    ];
    $content = byline_job_encode($envelope);
    if ($content === '') {
        return byline_job_error('byline_job_encoding_failed', 'The job payload could not be encoded.', 500);
    }

    $post_data = [
        'post_type' => BYLINE_JOB_POST_TYPE,
        'post_status' => 'private',
        'post_title' => 'Byline job: ' . $type,
        'post_content' => $content,
        'post_author' => $actor_id,
    ];
    $post_id = wp_insert_post(function_exists('wp_slash') ? wp_slash($post_data) : $post_data, true);
    if (byline_job_is_error($post_id) || (int) $post_id <= 0) {
        return byline_job_is_error($post_id)
            ? $post_id
            : byline_job_error('byline_job_storage_failed', 'The job could not be stored.', 500);
    }
    $post_id = (int) $post_id;

    $meta = [
        BYLINE_JOB_TYPE_META => $type,
        BYLINE_JOB_STATUS_META => BYLINE_JOB_STATUS_QUEUED,
        BYLINE_JOB_CREATED_AT_META => $now,
        BYLINE_JOB_DUE_AT_META => $due_at,
        BYLINE_JOB_STARTED_AT_META => 0,
        BYLINE_JOB_COMPLETED_AT_META => 0,
        BYLINE_JOB_ATTEMPTS_META => 0,
        BYLINE_JOB_MAX_ATTEMPTS_META => $max_attempts,
        BYLINE_JOB_RETRY_DELAY_META => $retry_delay,
        BYLINE_JOB_LAST_ERROR_META => '',
        BYLINE_JOB_NEXT_ATTEMPT_AT_META => 0,
        BYLINE_JOB_IDEMPOTENCY_META => $idempotency,
        BYLINE_JOB_PAYLOAD_HASH_META => $payload_hash,
        BYLINE_JOB_ACTOR_META => $actor_id,
        BYLINE_JOB_LAST_ACTOR_META => $actor_id,
        BYLINE_JOB_CANCELLED_AT_META => 0,
        BYLINE_JOB_CANCEL_REQUESTED_META => false,
        BYLINE_JOB_UPDATED_AT_META => $now,
        BYLINE_JOB_LAST_SOURCE_META => '',
    ];
    foreach ($meta as $key => $value) {
        update_post_meta($post_id, $key, $value);
    }

    if (!empty($args['schedule']) || !array_key_exists('schedule', $args)) {
        byline_job_schedule_wake($post_id, $due_at);
    }
    return byline_job_public_record(byline_job_internal($post_id));
}

function byline_create_job(string $type, array $payload, array $args = [])
{
    return byline_job_create($type, $payload, $args);
}

function byline_job_update_payload(int $job_id, array $payload, array $args = [])
{
    $job = byline_job_internal($job_id);
    if (!$job) {
        return byline_job_error('byline_job_not_found', 'The job was not found.', 404);
    }
    if (!in_array($job['status'], [BYLINE_JOB_STATUS_QUEUED, BYLINE_JOB_STATUS_RETRY_WAITING], true)) {
        return byline_job_error('byline_job_not_mutable', 'Only queued jobs can update their payload.', 409);
    }
    $payload = byline_job_normalize_value($payload);
    $payload_hash = byline_job_payload_hash($payload);
    $idempotency = byline_job_idempotency_value($args['idempotencyKey'] ?? $job['idempotencyKey']);
    $existing = byline_job_find_by_idempotency($job['type'], $idempotency);
    if ($existing && (int) $existing['id'] !== $job_id) {
        return byline_job_error('byline_job_idempotency_conflict', 'The idempotency key is already bound to another job.', 409);
    }
    $post = byline_job_post($job_id);
    $envelope = [
        'schemaVersion' => BYLINE_JOB_SCHEMA_VERSION,
        'type' => $job['type'],
        'payload' => $payload,
        'payloadHash' => $payload_hash,
        'idempotencyKey' => $idempotency,
        'createdAt' => gmdate(DATE_ATOM, $job['createdAt']),
    ];
    $content = byline_job_encode($envelope);
    if (!$post || $content === '' || !function_exists('wp_update_post')) {
        return byline_job_error('byline_job_storage_failed', 'The job payload could not be updated.', 500);
    }
    $updated = wp_update_post([
        'ID' => $job_id,
        'post_content' => function_exists('wp_slash') ? wp_slash($content) : $content,
    ], true);
    if (byline_job_is_error($updated)) {
        return $updated;
    }
    update_post_meta($job_id, BYLINE_JOB_PAYLOAD_HASH_META, $payload_hash);
    update_post_meta($job_id, BYLINE_JOB_IDEMPOTENCY_META, $idempotency);
    if (array_key_exists('dueAt', $args)) {
        update_post_meta($job_id, BYLINE_JOB_DUE_AT_META, byline_job_parse_timestamp($args['dueAt'], $job['dueAt']));
    }
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, byline_job_now());
    byline_job_schedule_wake($job_id, array_key_exists('dueAt', $args) ? byline_job_parse_timestamp($args['dueAt'], byline_job_now()) : $job['dueAt']);
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_job_schedule_wake(int $job_id, ?int $timestamp = null, bool $force = false): bool
{
    if ($job_id <= 0 || !function_exists('wp_schedule_single_event')) {
        return false;
    }
    $timestamp = max(byline_job_now(), (int) ($timestamp ?: byline_job_now()));
    $existing = 0;
    if (function_exists('wp_next_scheduled')) {
        try {
            $existing = (int) wp_next_scheduled(BYLINE_JOB_WAKE_HOOK, [$job_id]);
        } catch (Throwable $exception) {
            $existing = 0;
        }
    }
    if ($existing > 0 && !$force && $existing <= $timestamp) {
        return true;
    }
    if ($existing > 0 && function_exists('wp_clear_scheduled_hook')) {
        try {
            wp_clear_scheduled_hook(BYLINE_JOB_WAKE_HOOK, [$job_id]);
        } catch (Throwable $exception) {
            wp_clear_scheduled_hook(BYLINE_JOB_WAKE_HOOK);
        }
    }
    return wp_schedule_single_event($timestamp, BYLINE_JOB_WAKE_HOOK, [$job_id]) !== false;
}

function byline_job_worker_token(): string
{
    if (function_exists('wp_generate_uuid4')) {
        return (string) wp_generate_uuid4();
    }
    return hash('sha256', uniqid('byline-job-', true) . ':' . mt_rand());
}

function byline_job_lease_matches(array $job, string $token = ''): bool
{
    if ($token === '') {
        return true;
    }
    return is_array($job['lease'] ?? null) && hash_equals((string) ($job['lease']['token'] ?? ''), $token);
}

function byline_job_release_lease(int $job_id): void
{
    if (function_exists('delete_post_meta')) {
        delete_post_meta($job_id, BYLINE_JOB_LEASE_META);
    }
}

function byline_job_clear_wake(int $job_id): void
{
    if ($job_id <= 0 || !function_exists('wp_clear_scheduled_hook')) {
        return;
    }
    try {
        wp_clear_scheduled_hook(BYLINE_JOB_WAKE_HOOK, [$job_id]);
    } catch (Throwable $exception) {
        wp_clear_scheduled_hook(BYLINE_JOB_WAKE_HOOK);
    }
}

function byline_job_claim(int $job_id, ?int $now = null): ?array
{
    $now = $now ?: byline_job_now();
    $job = byline_job_internal($job_id);
    if (!$job || in_array($job['status'], [BYLINE_JOB_STATUS_SUCCEEDED, BYLINE_JOB_STATUS_FAILED, BYLINE_JOB_STATUS_CANCELLED], true)) {
        return null;
    }

    if ($job['status'] === BYLINE_JOB_STATUS_RUNNING) {
        $expires = (int) (($job['lease']['expiresAt'] ?? 0));
        if ($job['cancelRequested']) {
            byline_job_mark_cancelled($job, $now);
            return null;
        }
        if ($expires > $now) {
            return null;
        }
        byline_job_release_lease($job_id);
        update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_QUEUED);
        update_post_meta($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, $now);
        update_post_meta($job_id, BYLINE_JOB_LAST_ERROR_META, 'Worker lease expired; retrying.');
        update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
        $job = byline_job_internal($job_id);
    }

    if (!$job || !in_array($job['status'], [BYLINE_JOB_STATUS_QUEUED, BYLINE_JOB_STATUS_RETRY_WAITING], true)) {
        return null;
    }
    if (!empty($job['lease'])) {
        $lease_expires = (int) ($job['lease']['expiresAt'] ?? 0);
        if ($lease_expires > $now) {
            return null;
        }
        byline_job_release_lease($job_id);
        $job = byline_job_internal($job_id);
        if (!$job) {
            return null;
        }
    }
    $due_at = $job['status'] === BYLINE_JOB_STATUS_RETRY_WAITING && $job['nextAttemptAt'] > 0
        ? $job['nextAttemptAt']
        : $job['dueAt'];
    if ($due_at > $now) {
        return null;
    }
    if ($job['cancelRequested']) {
        byline_job_mark_cancelled($job, $now);
        return null;
    }
    if (!function_exists('add_post_meta')) {
        return null;
    }

    $token = byline_job_worker_token();
    $lease = ['token' => $token, 'acquiredAt' => $now, 'expiresAt' => $now + BYLINE_JOB_LEASE_SECONDS];
    if (add_post_meta($job_id, BYLINE_JOB_LEASE_META, $lease, true) === false) {
        return null;
    }
    update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_RUNNING);
    update_post_meta($job_id, BYLINE_JOB_ATTEMPTS_META, $job['attempts'] + 1);
    update_post_meta($job_id, BYLINE_JOB_STARTED_AT_META, $now);
    update_post_meta($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, 0);
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
    $claimed = byline_job_internal($job_id);
    if (!$claimed) {
        byline_job_release_lease($job_id);
        return null;
    }
    $claimed['_leaseToken'] = $token;
    return $claimed;
}

function byline_job_mark_cancelled(array $job, ?int $now = null, int $actor_id = 0): ?array
{
    $now = $now ?: byline_job_now();
    $job_id = (int) $job['id'];
    update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_CANCELLED);
    update_post_meta($job_id, BYLINE_JOB_COMPLETED_AT_META, $now);
    update_post_meta($job_id, BYLINE_JOB_CANCELLED_AT_META, $now);
    update_post_meta($job_id, BYLINE_JOB_CANCEL_REQUESTED_META, false);
    if ($actor_id > 0) {
        update_post_meta($job_id, BYLINE_JOB_LAST_ACTOR_META, $actor_id);
    }
    byline_job_release_lease($job_id);
    byline_job_clear_wake($job_id);
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_job_complete(int $job_id, $result = null, string $lease_token = '', ?int $now = null): ?array
{
    $now = $now ?: byline_job_now();
    $job = byline_job_internal($job_id);
    if (!$job || $job['status'] !== BYLINE_JOB_STATUS_RUNNING || !byline_job_lease_matches($job, $lease_token)) {
        return null;
    }
    if ($job['cancelRequested']) {
        return byline_job_mark_cancelled($job, $now);
    }
    update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_SUCCEEDED);
    update_post_meta($job_id, BYLINE_JOB_COMPLETED_AT_META, $now);
    update_post_meta($job_id, BYLINE_JOB_LAST_ERROR_META, '');
    update_post_meta($job_id, BYLINE_JOB_CANCEL_REQUESTED_META, false);
    if ($result !== null) {
        update_post_meta($job_id, BYLINE_JOB_RESULT_META, is_array($result) ? $result : ['value' => byline_job_safe_text($result)]);
    } elseif (function_exists('delete_post_meta')) {
        delete_post_meta($job_id, BYLINE_JOB_RESULT_META);
    }
    byline_job_release_lease($job_id);
    byline_job_clear_wake($job_id);
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
    update_option(BYLINE_JOBS_LAST_SUCCESS_OPTION, $now, false);
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_job_retryable_error($error, ?bool $explicit): bool
{
    if ($explicit !== null) {
        return $explicit;
    }
    if (byline_job_is_error($error) && method_exists($error, 'get_error_data')) {
        $data = $error->get_error_data();
        if (is_array($data) && array_key_exists('retryable', $data)) {
            return (bool) $data['retryable'];
        }
    }
    return true;
}

function byline_job_fail(int $job_id, $error, ?bool $retryable = null, string $lease_token = '', ?int $now = null): ?array
{
    $now = $now ?: byline_job_now();
    $job = byline_job_internal($job_id);
    if (!$job || !in_array($job['status'], [BYLINE_JOB_STATUS_RUNNING, BYLINE_JOB_STATUS_QUEUED, BYLINE_JOB_STATUS_RETRY_WAITING], true) || !byline_job_lease_matches($job, $lease_token)) {
        return null;
    }
    if ($job['cancelRequested']) {
        return byline_job_mark_cancelled($job, $now);
    }
    $message = byline_job_error_text($error);
    $should_retry = byline_job_retryable_error($error, $retryable) && $job['attempts'] < $job['maxAttempts'];
    byline_job_release_lease($job_id);
    update_post_meta($job_id, BYLINE_JOB_LAST_ERROR_META, $message);
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
    if ($should_retry) {
        $delay = min(86400, $job['retryDelay'] * (2 ** max(0, $job['attempts'] - 1)));
        $next_at = $now + $delay;
        update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_RETRY_WAITING);
        update_post_meta($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, $next_at);
        byline_job_schedule_wake($job_id, $next_at);
    } else {
        update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_FAILED);
        update_post_meta($job_id, BYLINE_JOB_COMPLETED_AT_META, $now);
        update_post_meta($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, 0);
        byline_job_clear_wake($job_id);
    }
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_cancel_job(int $job_id, int $actor_id = 0, ?int $now = null): ?array
{
    $now = $now ?: byline_job_now();
    $job = byline_job_internal($job_id);
    if (!$job) {
        return null;
    }
    if (in_array($job['status'], [BYLINE_JOB_STATUS_SUCCEEDED, BYLINE_JOB_STATUS_FAILED, BYLINE_JOB_STATUS_CANCELLED], true)) {
        return byline_job_public_record($job);
    }
    if ($job['status'] === BYLINE_JOB_STATUS_RUNNING) {
        update_post_meta($job_id, BYLINE_JOB_CANCEL_REQUESTED_META, true);
        if ($actor_id > 0) {
            update_post_meta($job_id, BYLINE_JOB_LAST_ACTOR_META, $actor_id);
        }
        update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
        return byline_job_public_record(byline_job_internal($job_id));
    }
    return byline_job_mark_cancelled($job, $now, $actor_id);
}

function byline_retry_job(int $job_id, int $actor_id = 0, ?int $now = null): ?array
{
    $now = $now ?: byline_job_now();
    $job = byline_job_internal($job_id);
    if (!$job) {
        return null;
    }
    if (!in_array($job['status'], [BYLINE_JOB_STATUS_FAILED, BYLINE_JOB_STATUS_CANCELLED, BYLINE_JOB_STATUS_RETRY_WAITING], true)) {
        return byline_job_public_record($job);
    }
    update_post_meta($job_id, BYLINE_JOB_STATUS_META, BYLINE_JOB_STATUS_QUEUED);
    update_post_meta($job_id, BYLINE_JOB_COMPLETED_AT_META, 0);
    update_post_meta($job_id, BYLINE_JOB_CANCELLED_AT_META, 0);
    update_post_meta($job_id, BYLINE_JOB_CANCEL_REQUESTED_META, false);
    update_post_meta($job_id, BYLINE_JOB_NEXT_ATTEMPT_AT_META, 0);
    if ($actor_id > 0) {
        update_post_meta($job_id, BYLINE_JOB_LAST_ACTOR_META, $actor_id);
    }
    update_post_meta($job_id, BYLINE_JOB_UPDATED_AT_META, $now);
    byline_job_schedule_wake($job_id, $now, true);
    return byline_job_public_record(byline_job_internal($job_id));
}

function byline_register_job_handler(string $type, callable $handler): bool
{
    $type = byline_job_type_value($type);
    if ($type === '') {
        return false;
    }
    if (!isset($GLOBALS['byline_job_handlers']) || !is_array($GLOBALS['byline_job_handlers'])) {
        $GLOBALS['byline_job_handlers'] = [];
    }
    $GLOBALS['byline_job_handlers'][$type] = $handler;
    return true;
}

function byline_job_run(int $job_id, ?int $now = null, string $source = 'wp-cron'): ?array
{
    $claimed = byline_job_claim($job_id, $now);
    if (!$claimed) {
        return byline_get_job($job_id);
    }
    $source = byline_job_safe_text($source, 80);
    update_post_meta($job_id, BYLINE_JOB_LAST_SOURCE_META, $source);
    $handler = $GLOBALS['byline_job_handlers'][$claimed['type']] ?? null;
    if (!is_callable($handler)) {
        return byline_job_fail($job_id, 'No handler is registered for this job type.', false, (string) $claimed['_leaseToken'], $now);
    }
    try {
        $result = call_user_func($handler, $claimed);
    } catch (Throwable $exception) {
        return byline_job_fail($job_id, $exception, true, (string) $claimed['_leaseToken'], $now);
    }
    if (byline_job_is_error($result)) {
        return byline_job_fail($job_id, $result, null, (string) $claimed['_leaseToken'], $now);
    }
    if ($result === false) {
        return byline_job_fail($job_id, 'The job handler reported failure.', true, (string) $claimed['_leaseToken'], $now);
    }
    return byline_job_complete($job_id, $result === true ? null : $result, (string) $claimed['_leaseToken'], $now);
}

function byline_job_due_timestamp(array $job): int
{
    return $job['status'] === BYLINE_JOB_STATUS_RETRY_WAITING && $job['nextAttemptAt'] > 0
        ? (int) $job['nextAttemptAt']
        : (int) $job['dueAt'];
}

function byline_jobs_record_runner(string $source, int $now): void
{
    update_option(BYLINE_JOBS_LAST_RUN_OPTION, $now, false);
    update_option(BYLINE_JOBS_LAST_SOURCE_OPTION, byline_job_safe_text($source, 80), false);
}

function byline_jobs_run_due(int $limit = 10, ?int $now = null, string $source = 'wp-cron'): array
{
    $now = $now ?: byline_job_now();
    $limit = min(100, max(1, $limit));
    byline_jobs_record_runner($source, $now);
    $candidates = [];
    foreach (byline_job_posts(['posts_per_page' => -1]) as $post) {
        $job = byline_job_internal((int) ($post->ID ?? 0));
        if (!$job || !in_array($job['status'], [BYLINE_JOB_STATUS_QUEUED, BYLINE_JOB_STATUS_RETRY_WAITING, BYLINE_JOB_STATUS_RUNNING], true)) {
            continue;
        }
        $is_stale_running = $job['status'] === BYLINE_JOB_STATUS_RUNNING && (int) (($job['lease']['expiresAt'] ?? 0)) <= $now;
        if ($is_stale_running || ($job['status'] !== BYLINE_JOB_STATUS_RUNNING && byline_job_due_timestamp($job) <= $now)) {
            $candidates[] = $job;
        }
    }
    usort($candidates, static function (array $left, array $right): int {
        return byline_job_due_timestamp($left) <=> byline_job_due_timestamp($right);
    });
    $results = [];
    foreach (array_slice($candidates, 0, $limit) as $job) {
        $result = byline_job_run((int) $job['id'], $now, $source);
        if ($result) {
            $results[] = $result;
        }
    }

    // The established design scheduler remains authoritative for its own
    // snapshot and lock metadata. The common runner is only a catch-up entry
    // point for it; no design record is migrated or rewritten here.
    if (function_exists('byline_execute_due_design_schedules')) {
        try {
            byline_execute_due_design_schedules();
        } catch (Throwable $exception) {
            update_option(BYLINE_JOBS_LAST_ERROR_OPTION, byline_job_error_text($exception), false);
        }
    }
    update_option(BYLINE_JOBS_LAST_SUCCESS_OPTION, $now, false);
    return $results;
}

function byline_run_due_jobs(int $limit = 10, ?int $now = null, string $source = 'wp-cron'): array
{
    return byline_jobs_run_due($limit, $now, $source);
}

function byline_job_wake_callback($job_id = 0): void
{
    if ((int) $job_id > 0) {
        byline_job_run((int) $job_id, null, 'wp-cron');
        return;
    }
    byline_jobs_run_due(10, null, 'wp-cron');
}

function byline_jobs_cron_callback(): void
{
    byline_jobs_run_due(10, null, 'wp-cron');
}

function byline_jobs_cron_schedules(array $schedules): array
{
    $schedules['byline_five_minutes'] = [
        'interval' => BYLINE_JOB_CRON_INTERVAL,
        'display' => 'Byline every five minutes',
    ];
    return $schedules;
}

function byline_jobs_register_runtime(): void
{
    if ((defined('DISABLE_WP_CRON') && DISABLE_WP_CRON)
        || !function_exists('wp_next_scheduled')
        || !function_exists('wp_schedule_event')) {
        return;
    }
    if (!wp_next_scheduled(BYLINE_JOB_CRON_HOOK)) {
        wp_schedule_event(time() + BYLINE_JOB_CRON_INTERVAL, 'byline_five_minutes', BYLINE_JOB_CRON_HOOK);
    }
}
add_filter('cron_schedules', 'byline_jobs_cron_schedules');
add_action('init', 'byline_jobs_register_runtime', 20);
add_action(BYLINE_JOB_CRON_HOOK, 'byline_jobs_cron_callback');
add_action(BYLINE_JOB_WAKE_HOOK, 'byline_job_wake_callback', 10, 1);

function byline_register_job_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }
    register_post_type(BYLINE_JOB_POST_TYPE, [
        'public' => false,
        'show_ui' => false,
        'show_in_rest' => false,
        'exclude_from_search' => true,
        'supports' => ['title', 'editor', 'author'],
    ]);
}
add_action('init', 'byline_register_job_post_type', 9);

function byline_jobs_status_counts(int $now): array
{
    $counts = array_fill_keys(byline_job_statuses(), 0);
    $overdue = 0;
    $oldest = 0;
    foreach (byline_job_posts(['posts_per_page' => -1]) as $post) {
        $job = byline_job_internal((int) ($post->ID ?? 0));
        if (!$job) {
            continue;
        }
        $counts[$job['status']]++;
        $due = byline_job_due_timestamp($job);
        $stale_running = $job['status'] === BYLINE_JOB_STATUS_RUNNING && (int) (($job['lease']['expiresAt'] ?? 0)) <= $now;
        if ($stale_running || (($job['status'] === BYLINE_JOB_STATUS_QUEUED || $job['status'] === BYLINE_JOB_STATUS_RETRY_WAITING) && $due <= $now)) {
            $overdue++;
            $oldest = $oldest === 0 ? $due : min($oldest, $due);
        }
    }

    // Count due legacy design records without calling their reader. This keeps
    // a diagnostics request read-only even when a legacy record is malformed.
    if (function_exists('get_posts') && function_exists('get_post_meta') && defined('BYLINE_DESIGN_SCHEDULE_POST_TYPE')) {
        $design_posts = get_posts([
            'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
            'post_status' => 'any',
            'posts_per_page' => -1,
        ]);
        foreach ((array) $design_posts as $post) {
            $id = (int) ($post->ID ?? 0);
            $status = (string) get_post_meta($id, defined('BYLINE_DESIGN_SCHEDULE_STATUS_META') ? BYLINE_DESIGN_SCHEDULE_STATUS_META : '_byline_design_job_status', true);
            $scheduled_at = get_post_meta($id, defined('BYLINE_DESIGN_SCHEDULED_AT_META') ? BYLINE_DESIGN_SCHEDULED_AT_META : '_byline_design_job_scheduled_at', true);
            $due = byline_job_parse_timestamp($scheduled_at, 0);
            $scheduled = defined('BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED') ? BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED : 'scheduled';
            $processing = defined('BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING') ? BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING : 'processing';
            if (in_array($status, [$scheduled, $processing], true) && $due > 0 && $due <= $now) {
                $overdue++;
                $oldest = $oldest === 0 ? $due : min($oldest, $due);
            }
        }
    }
    return ['counts' => $counts, 'overdueCount' => $overdue, 'oldestOverdueAt' => $oldest];
}

function byline_jobs_cron_health(?int $now = null): array
{
    $now = $now ?: byline_job_now();
    $disabled = defined('DISABLE_WP_CRON') && DISABLE_WP_CRON;
    $scheduler_ready = function_exists('wp_schedule_single_event') && function_exists('wp_next_scheduled');
    $next = $scheduler_ready ? (int) wp_next_scheduled(BYLINE_JOB_CRON_HOOK) : 0;
    $last_run = (int) get_option(BYLINE_JOBS_LAST_RUN_OPTION, 0);
    $source = byline_job_safe_text(get_option(BYLINE_JOBS_LAST_SOURCE_OPTION, ''), 80);
    $summary = byline_jobs_status_counts($now);
    $overdue = (int) $summary['overdueCount'];
    $status = 'good';
    $message = 'Byline job scheduling is healthy.';
    if (!$scheduler_ready) {
        $status = 'critical';
        $message = 'The WordPress cron scheduling API is unavailable.';
    } elseif ($disabled && $overdue > 0) {
        $status = 'critical';
        $message = 'WordPress cron is disabled and queued Byline work is overdue.';
    } elseif ($overdue > 0) {
        $status = 'recommended';
        $message = 'Queued Byline work is overdue and needs a cron catch-up run.';
    } elseif ($disabled) {
        $status = 'recommended';
        $message = 'WordPress cron is disabled; an authenticated or WP-CLI runner is required.';
    } elseif ($next <= 0) {
        $status = 'recommended';
        $message = 'The recurring Byline job runner is not scheduled yet.';
    }
    return [
        'status' => $status,
        'message' => $message,
        'cronAvailable' => $scheduler_ready && !$disabled,
        'cronDisabled' => $disabled,
        'recurringEventAt' => byline_job_format_timestamp($next),
        'lastRunAt' => byline_job_format_timestamp($last_run),
        'lastSource' => $source !== '' ? $source : 'unknown',
        'overdueCount' => $overdue,
        'oldestOverdueAt' => byline_job_format_timestamp($summary['oldestOverdueAt']),
        'statusCounts' => $summary['counts'],
        'catchUpRecommended' => $overdue > 0,
        'trafficDriven' => $scheduler_ready && !$disabled && ($source === '' || $source === 'wp-cron'),
        'lastErrorPresent' => (string) get_option(BYLINE_JOBS_LAST_ERROR_OPTION, '') !== '',
    ];
}

function byline_jobs_diagnostics(): array
{
    $health = byline_jobs_cron_health();
    return [
        'schemaVersion' => BYLINE_JOB_SCHEMA_VERSION,
        'statusCounts' => $health['statusCounts'],
        'overdueCount' => $health['overdueCount'],
        'oldestOverdueAt' => $health['oldestOverdueAt'],
        'lastRunAt' => $health['lastRunAt'],
        'lastSource' => $health['lastSource'],
        'lastErrorPresent' => $health['lastErrorPresent'],
        'cronHealth' => $health,
    ];
}

function byline_job_legacy_design_status(string $status): string
{
    if ($status === (defined('BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED') ? BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED : 'scheduled')) {
        return BYLINE_JOB_STATUS_QUEUED;
    }
    if ($status === (defined('BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING') ? BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING : 'processing')) {
        return BYLINE_JOB_STATUS_RUNNING;
    }
    if ($status === (defined('BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED') ? BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED : 'published')) {
        return BYLINE_JOB_STATUS_SUCCEEDED;
    }
    if ($status === (defined('BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED') ? BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED : 'cancelled')) {
        return BYLINE_JOB_STATUS_CANCELLED;
    }
    return BYLINE_JOB_STATUS_FAILED;
}

function byline_job_from_design_schedule(int $schedule_id): ?array
{
    if ($schedule_id <= 0 || !function_exists('byline_get_design_schedule')) {
        return null;
    }
    $schedule = byline_get_design_schedule($schedule_id);
    if (!is_array($schedule)) {
        return null;
    }
    $execution = is_array($schedule['execution'] ?? null) ? $schedule['execution'] : [];
    $scheduled_at = byline_job_parse_timestamp($schedule['scheduledAt'] ?? null, 0);
    $post = function_exists('get_post') ? get_post($schedule_id) : null;
    $created_at = byline_job_parse_timestamp($post->post_date_gmt ?? null, $scheduled_at);
    $lock = [];
    if (function_exists('get_post_meta') && defined('BYLINE_DESIGN_SCHEDULE_LOCK_META')) {
        $stored_lock = get_post_meta($schedule_id, BYLINE_DESIGN_SCHEDULE_LOCK_META, true);
        $lock = is_array($stored_lock) ? $stored_lock : (is_string($stored_lock) ? (json_decode($stored_lock, true) ?: []) : []);
    }
    $lock_at = (int) ($lock['at'] ?? 0);
    $lock_seconds = defined('BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS') ? BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS : 900;
    return [
        'id' => $schedule_id,
        'jobId' => 'byline:design-schedule:' . $schedule_id,
        'type' => 'design_schedule',
        'status' => byline_job_legacy_design_status((string) ($schedule['status'] ?? 'failed')),
        'legacyStatus' => (string) ($schedule['status'] ?? 'failed'),
        'createdAt' => byline_job_format_timestamp($created_at),
        'dueAt' => byline_job_format_timestamp($scheduled_at),
        'startedAt' => byline_job_format_timestamp(byline_job_parse_timestamp($execution['startedAt'] ?? null, 0)),
        'completedAt' => byline_job_format_timestamp(byline_job_parse_timestamp($execution['completedAt'] ?? null, 0)),
        'attempts' => max(0, (int) ($execution['attempts'] ?? 0)),
        'maxAttempts' => null,
        'retryDelay' => null,
        'lastError' => byline_job_safe_text($schedule['error'] ?? ''),
        'nextAttemptAt' => null,
        'actorId' => max(0, (int) ($schedule['scheduledBy'] ?? 0)),
        'lastActorId' => max(0, (int) ($schedule['scheduledBy'] ?? 0)),
        'cancelledAt' => null,
        'cancelRequested' => false,
        'leaseActive' => $lock_at > 0 && $lock_at + $lock_seconds > byline_job_now(),
        'leaseExpiresAt' => $lock_at > 0 ? byline_job_format_timestamp($lock_at + $lock_seconds) : null,
        'canCancel' => in_array((string) ($schedule['status'] ?? ''), ['scheduled', 'processing'], true),
        'canRetry' => false,
        'idempotencyKey' => byline_job_safe_text($schedule['idempotencyKey'] ?? '', 191),
        'payloadHash' => byline_job_safe_text($schedule['snapshotHash'] ?? '', 128),
        'baseLiveRevision' => max(0, (int) ($schedule['baseLiveRevision'] ?? 0)),
        'resultingRevision' => isset($schedule['resultingRevision']) ? (int) $schedule['resultingRevision'] : null,
        'legacyStorage' => 'byline_design_schedule',
    ];
}

function byline_job_legacy_design_records(): array
{
    if (!function_exists('get_posts') || !defined('BYLINE_DESIGN_SCHEDULE_POST_TYPE')) {
        return [];
    }
    $records = [];
    foreach (get_posts([
        'post_type' => BYLINE_DESIGN_SCHEDULE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => -1,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]) as $post) {
        $record = byline_job_from_design_schedule((int) ($post->ID ?? 0));
        if ($record) {
            $records[] = $record;
        }
    }
    return $records;
}

function byline_list_jobs(array $args = []): array
{
    $limit = min(100, max(1, (int) ($args['limit'] ?? 50)));
    $records = [];
    foreach (byline_job_posts(['posts_per_page' => -1, 'orderby' => 'ID', 'order' => 'DESC']) as $post) {
        $record = byline_job_public_record(byline_job_internal((int) ($post->ID ?? 0)));
        if ($record) {
            $records[] = $record;
        }
    }
    if (!empty($args['includeLegacyDesign'])) {
        $records = array_merge($records, byline_job_legacy_design_records());
    }
    usort($records, static function (array $left, array $right): int {
        return strcmp((string) ($right['createdAt'] ?? ''), (string) ($left['createdAt'] ?? ''));
    });
    return array_slice($records, 0, $limit);
}

function byline_public_content_revision(): int
{
    $option = defined('BYLINE_PUBLICATION_REVISION_OPTION') ? BYLINE_PUBLICATION_REVISION_OPTION : 'byline_publication_revision';
    return max(0, (int) get_option($option, 0));
}

function byline_bump_public_content_revision(): int
{
    $option = defined('BYLINE_PUBLICATION_REVISION_OPTION') ? BYLINE_PUBLICATION_REVISION_OPTION : 'byline_publication_revision';
    $revision = byline_public_content_revision() + 1;
    update_option($option, $revision, false);
    return $revision;
}

function byline_can_manage_jobs(): bool
{
    $manage = defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline';
    $integrations = defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations';
    return current_user_can($manage) || current_user_can($integrations);
}

function byline_job_request_param($request, string $key, $default = null)
{
    if (is_object($request) && method_exists($request, 'get_param')) {
        $value = $request->get_param($key);
        return $value === null ? $default : $value;
    }
    if (is_array($request) && array_key_exists($key, $request)) {
        return $request[$key];
    }
    return $default;
}

function byline_rest_list_jobs(WP_REST_Request $request): WP_REST_Response
{
    return rest_ensure_response([
        'jobs' => byline_list_jobs([
            'limit' => byline_job_request_param($request, 'limit', 50),
            'includeLegacyDesign' => true,
        ]),
        'cronHealth' => byline_jobs_cron_health(),
    ]);
}

function byline_rest_get_job(WP_REST_Request $request)
{
    $job = byline_get_job((int) byline_job_request_param($request, 'id', 0));
    return $job ? rest_ensure_response($job) : byline_job_error('byline_job_not_found', 'The job was not found.', 404);
}

function byline_rest_run_jobs(WP_REST_Request $request): WP_REST_Response
{
    $id = (int) byline_job_request_param($request, 'id', 0);
    $jobs = $id > 0
        ? array_filter([byline_job_run($id, null, 'rest')])
        : byline_jobs_run_due((int) byline_job_request_param($request, 'limit', 10), null, 'rest');
    return rest_ensure_response(['jobs' => array_values($jobs), 'cronHealth' => byline_jobs_cron_health()]);
}

function byline_rest_retry_job(WP_REST_Request $request)
{
    $job = byline_retry_job((int) byline_job_request_param($request, 'id', 0), function_exists('get_current_user_id') ? (int) get_current_user_id() : 0);
    return $job ? rest_ensure_response($job) : byline_job_error('byline_job_not_found', 'The job was not found.', 404);
}

function byline_rest_cancel_job(WP_REST_Request $request)
{
    $job = byline_cancel_job((int) byline_job_request_param($request, 'id', 0), function_exists('get_current_user_id') ? (int) get_current_user_id() : 0);
    return $job ? rest_ensure_response($job) : byline_job_error('byline_job_not_found', 'The job was not found.', 404);
}

function byline_register_job_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/jobs', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_list_jobs',
        'permission_callback' => 'byline_can_manage_jobs',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/jobs/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_rest_get_job',
        'permission_callback' => 'byline_can_manage_jobs',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/jobs/run', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_run_jobs',
        'permission_callback' => 'byline_can_manage_jobs',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/jobs/(?P<id>\d+)/retry', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_retry_job',
        'permission_callback' => 'byline_can_manage_jobs',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/jobs/(?P<id>\d+)/cancel', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_cancel_job',
        'permission_callback' => 'byline_can_manage_jobs',
    ]);
}
add_action('rest_api_init', 'byline_register_job_routes');

if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
    class Byline_Jobs_CLI_Command
    {
        public function run(array $args, array $assoc_args): void
        {
            $id = isset($assoc_args['id']) ? (int) $assoc_args['id'] : 0;
            $limit = isset($assoc_args['limit']) ? (int) $assoc_args['limit'] : 10;
            $jobs = $id > 0 ? array_filter([byline_job_run($id, null, 'wp-cli')]) : byline_jobs_run_due($limit, null, 'wp-cli');
            foreach ($jobs as $job) {
                WP_CLI::line(sprintf('%s %s attempts=%d', $job['jobId'], $job['status'], (int) $job['attempts']));
            }
        }

        public function status(array $args): void
        {
            if (isset($args[0])) {
                $job = byline_get_job((int) $args[0]);
                if (!$job) {
                    WP_CLI::error('Job not found.');
                }
                WP_CLI::line(sprintf('%s %s attempts=%d', $job['jobId'], $job['status'], (int) $job['attempts']));
                return;
            }
            WP_CLI::line(byline_job_encode(byline_jobs_diagnostics()));
        }

        public function retry(array $args): void
        {
            $job = byline_retry_job((int) ($args[0] ?? 0), 0);
            if (!$job) {
                WP_CLI::error('Job not found.');
            }
            WP_CLI::line($job['jobId'] . ' ' . $job['status']);
        }

        public function cancel(array $args): void
        {
            $job = byline_cancel_job((int) ($args[0] ?? 0), 0);
            if (!$job) {
                WP_CLI::error('Job not found.');
            }
            WP_CLI::line($job['jobId'] . ' ' . $job['status']);
        }
    }
    WP_CLI::add_command('byline jobs', 'Byline_Jobs_CLI_Command');
}
