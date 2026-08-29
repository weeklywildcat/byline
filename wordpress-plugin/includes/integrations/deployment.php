<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_DEPLOYMENT_PROVIDER_OPTION = 'byline_deployment_provider';
const BYLINE_DEPLOYMENT_HOOK_OPTION = 'byline_deployment_hook_url';
const BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION = 'byline_deployment_last_triggered_at';
const BYLINE_DEPLOYMENT_LAST_STATUS_OPTION = 'byline_deployment_last_status';
const BYLINE_DEPLOYMENT_EVENT = 'byline_trigger_deployment';
/**
 * The newest public revision that still has to reach the live site.
 *
 * This is recorded before anything is scheduled and independently of whether a
 * deploy hook exists, so publishing a story always leaves durable evidence of
 * the revision the website owes. Without it, an unconfigured install would lose
 * the expected revision entirely and a merely reachable old manifest could be
 * mistaken for a live one.
 */
const BYLINE_DEPLOYMENT_EXPECTED_REVISION_OPTION = 'byline_deployment_expected_revision';
/** Counts manual retries so each one gets its own durable, idempotent job. */
const BYLINE_DEPLOYMENT_MANUAL_RETRY_OPTION = 'byline_deployment_manual_retry_count';

if (!defined('BYLINE_DEPLOYMENT_JOB_TYPE')) {
    define('BYLINE_DEPLOYMENT_JOB_TYPE', 'deployment');
}
if (!defined('BYLINE_DEPLOYMENT_JOB_OPTION')) {
    define('BYLINE_DEPLOYMENT_JOB_OPTION', 'byline_deployment_job_id');
}

function byline_deployment_providers(): array
{
    return apply_filters('byline_deployment_providers', [
        'generic-hook' => [
            'id' => 'generic-hook',
            'label' => 'Generic Deploy Hook',
            'description' => 'POST an HTTPS hook to trigger a static-site build.',
            'method' => 'POST',
            'presets' => ['Cloudflare', 'Netlify', 'Vercel', 'GitHub Actions'],
        ],
    ]);
}

function byline_deployment_provider_id(): string
{
    $provider = sanitize_key((string) get_option(BYLINE_DEPLOYMENT_PROVIDER_OPTION, 'generic-hook'));
    return isset(byline_deployment_providers()[$provider]) ? $provider : 'generic-hook';
}

function byline_deployment_hook_url(): string
{
    $url = trim((string) get_option(BYLINE_DEPLOYMENT_HOOK_OPTION, ''));
    if ($url === '' && defined('WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION')) {
        $url = trim((string) get_option(WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION, ''));
    }
    return $url;
}

function byline_validate_deployment_hook_url($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $url = esc_url_raw(trim($value), ['https']);
    return $url !== '' && wp_parse_url($url, PHP_URL_SCHEME) === 'https' ? $url : '';
}

function byline_deployment_last_triggered(): int
{
    $value = get_option(BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION, '');
    if ($value === '' && defined('WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION')) {
        $value = get_option(WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION, 0);
    }
    return absint($value);
}

function byline_deployment_last_status(): string
{
    $value = (string) get_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, '');
    if ($value === '' && defined('WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION')) {
        $value = (string) get_option(WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION, '');
    }
    return $value;
}

function byline_deployment_job_internal(): ?array
{
    if (!function_exists('byline_job_internal')) {
        return null;
    }

    $job_id = (int) get_option(BYLINE_DEPLOYMENT_JOB_OPTION, 0);
    if ($job_id > 0) {
        $job = byline_job_internal($job_id);
        if ($job && $job['type'] === BYLINE_DEPLOYMENT_JOB_TYPE) {
            return $job;
        }
    }

    if (function_exists('byline_job_posts')) {
        foreach (byline_job_posts(['posts_per_page' => -1, 'orderby' => 'ID', 'order' => 'DESC']) as $post) {
            $job = byline_job_internal((int) ($post->ID ?? 0));
            if ($job && $job['type'] === BYLINE_DEPLOYMENT_JOB_TYPE) {
                return $job;
            }
        }
    }
    return null;
}

function byline_deployment_job_status(): string
{
    $job = byline_deployment_job_internal();
    return $job ? (string) $job['status'] : '';
}

/** The durably recorded revision the public site still owes, if any. */
function byline_deployment_recorded_expected_revision(): int
{
    return max(0, absint(get_option(BYLINE_DEPLOYMENT_EXPECTED_REVISION_OPTION, 0)));
}

/**
 * Record a public revision that needs deploying. Monotonic on purpose: a later
 * change never lowers the bar the live manifest has to clear.
 */
function byline_deployment_record_expected_revision(int $revision): int
{
    $revision = max(0, $revision);
    $recorded = byline_deployment_recorded_expected_revision();
    if ($revision > $recorded) {
        update_option(BYLINE_DEPLOYMENT_EXPECTED_REVISION_OPTION, $revision, false);
        return $revision;
    }
    return $recorded;
}

function byline_deployment_expected_revision(): int
{
    $job = byline_deployment_job_internal();
    $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
    return max(
        byline_deployment_recorded_expected_revision(),
        max(0, (int) ($payload['expectedRevision'] ?? 0))
    );
}

function byline_deployment_actor_id(): int
{
    return function_exists('get_current_user_id') ? max(0, (int) get_current_user_id()) : 0;
}

function byline_deployment_cron_event_timestamp(): int
{
    $timestamp = function_exists('wp_next_scheduled') ? wp_next_scheduled(BYLINE_DEPLOYMENT_EVENT) : 0;
    if (!$timestamp && defined('WWH_CLOUDFLARE_DEPLOY_EVENT') && function_exists('wp_next_scheduled')) {
        $timestamp = wp_next_scheduled(WWH_CLOUDFLARE_DEPLOY_EVENT);
    }
    return $timestamp ? (int) $timestamp : 0;
}

function byline_deployment_pending_timestamp(): int
{
    $timestamp = byline_deployment_cron_event_timestamp();
    if ($timestamp > 0) {
        return $timestamp;
    }

    $job = byline_deployment_job_internal();
    if ($job && in_array($job['status'], ['queued', 'running', 'retry_waiting'], true)) {
        return (int) ($job['nextAttemptAt'] ?: $job['dueAt'] ?: time());
    }
    return 0;
}

function byline_deployment_lifecycle_status(array $deployment, array $manifest = []): string
{
    $expected = max(0, (int) ($deployment['expectedRevision'] ?? byline_deployment_expected_revision()));
    $manifest_revision = max(0, (int) ($manifest['publicationRevision'] ?? $manifest['contentRevision'] ?? 0));
    $manifest_reachable = !empty($manifest['reachable']);
    if ($expected > 0 && $manifest_reachable && $manifest_revision >= $expected) {
        return 'live';
    }

    // A public change with nowhere to deploy it is a configuration gap, not a
    // build failure and certainly not a live site. Saying so keeps the recorded
    // revision visible and gives the operator the one action that helps.
    $configured = array_key_exists('configured', $deployment)
        ? !empty($deployment['configured'])
        : byline_deployment_hook_url() !== '';
    if (!$configured && $expected > 0) {
        return 'needs_configuration';
    }

    $job_status = (string) ($deployment['jobStatus'] ?? byline_deployment_job_status());
    if ($job_status === 'running') {
        return 'building';
    }
    if ($job_status === 'failed') {
        return 'failed';
    }
    if (in_array($job_status, ['queued', 'retry_waiting'], true) || !empty($deployment['pending'])) {
        return 'queued';
    }

    // A successful hook request only means that the external build was
    // requested. Until the public manifest proves the expected revision, the
    // honest state is unknown rather than live.
    return 'unknown';
}

function byline_deployment_status(): array
{
    $provider = byline_deployment_providers()[byline_deployment_provider_id()];
    $job = byline_deployment_job_internal();
    $job_public = function_exists('byline_job_public_record') ? byline_job_public_record($job) : null;
    $status = [
        'provider' => $provider['id'],
        'providerLabel' => $provider['label'],
        'configured' => byline_deployment_hook_url() !== '',
        'method' => 'POST',
        'lastTriggeredAt' => byline_deployment_last_triggered() > 0
            ? wp_date('M j, Y g:i A T', byline_deployment_last_triggered(), wp_timezone())
            : 'Never',
        'lastStatus' => byline_deployment_last_status() !== '' ? byline_deployment_last_status() : 'Not triggered yet',
        'pending' => byline_deployment_pending_timestamp() > 0,
    ];
    $status['jobId'] = is_array($job_public) ? $job_public['jobId'] : null;
    $status['jobStatus'] = is_array($job_public) ? $job_public['status'] : null;
    $status['expectedRevision'] = byline_deployment_expected_revision();
    $status['publicRevision'] = function_exists('byline_public_content_revision') ? byline_public_content_revision() : 0;
    $status['contentRevision'] = $status['publicRevision'];
    $status['lastError'] = is_array($job_public) ? (string) ($job_public['lastError'] ?? '') : '';
    $status['nextAttemptAt'] = is_array($job_public) ? ($job_public['nextAttemptAt'] ?? null) : null;
    $status['lifecycle'] = byline_deployment_lifecycle_status($status);
    return $status;
}

/**
 * Enqueue or coalesce the durable deployment job for one expected revision.
 *
 * Returns the job id, or 0 when durable storage is unavailable or refused the
 * record. Never sends a hook request itself: execution belongs to the job
 * runner so cron, WP-CLI, and REST all share one lifecycle.
 */
function byline_deployment_enqueue_job(string $reason, int $expected_revision, int $due_at, string $idempotency_key = ''): int
{
    if (!function_exists('byline_create_job') || !function_exists('byline_job_update_payload')) {
        return 0;
    }

    $payload = [
        'reason' => $reason,
        'expectedRevision' => $expected_revision,
        'requestedAt' => gmdate(DATE_ATOM),
        'reasons' => [$reason],
    ];
    $job = byline_deployment_job_internal();
    $job_id = 0;

    if ($job && in_array($job['status'], ['queued', 'retry_waiting'], true)) {
        $old_payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
        $payload['reasons'] = array_values(array_unique(array_filter(array_merge(
            (array) ($old_payload['reasons'] ?? []),
            [(string) ($old_payload['reason'] ?? ''), $reason]
        ))));
        $payload['expectedRevision'] = max($expected_revision, (int) ($old_payload['expectedRevision'] ?? 0));
        $updated = byline_job_update_payload((int) $job['id'], $payload, [
            'idempotencyKey' => $idempotency_key !== '' ? $idempotency_key : 'deployment:' . $payload['expectedRevision'],
            'dueAt' => $due_at,
        ]);
        if (!(function_exists('is_wp_error') && is_wp_error($updated))) {
            $job_id = (int) $job['id'];
        }
    }

    if ($job_id <= 0) {
        $created = byline_create_job(BYLINE_DEPLOYMENT_JOB_TYPE, $payload, [
            'idempotencyKey' => $idempotency_key !== '' ? $idempotency_key : 'deployment:' . $expected_revision,
            'dueAt' => $due_at,
            'maxAttempts' => 3,
            'retryDelay' => 60,
        ]);
        if (function_exists('is_wp_error') && is_wp_error($created)) {
            error_log('Byline: durable deploy job could not be stored.');
            return 0;
        }
        $job_id = (int) ($created['id'] ?? 0);
    }

    if ($job_id > 0) {
        update_option(BYLINE_DEPLOYMENT_JOB_OPTION, $job_id, false);
    }
    return $job_id;
}

function byline_schedule_deployment(string $reason = 'content', bool $revision_already_recorded = false, ?int $expected_revision = null, array $options = []): void
{
    if ($expected_revision === null && function_exists('byline_public_content_revision')) {
        $expected_revision = $revision_already_recorded
            ? byline_public_content_revision()
            : byline_bump_public_content_revision();
    }
    $expected_revision = max(0, (int) $expected_revision);
    $reason = sanitize_key($reason) ?: 'content';

    // Record the debt before anything else. The public artifact has already
    // changed at this point, so this evidence has to survive an unconfigured
    // deployment, a failed job insert, and a restart.
    byline_deployment_record_expected_revision($expected_revision);

    if (byline_deployment_hook_url() === '') {
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Not configured', false);
        return;
    }

    $due_at = isset($options['dueAt'])
        ? max(time(), (int) $options['dueAt'])
        : time() + 60;
    $idempotency_key = isset($options['idempotencyKey']) ? (string) $options['idempotencyKey'] : '';

    if (function_exists('byline_create_job') && function_exists('byline_job_update_payload')) {
        $job_id = byline_deployment_enqueue_job($reason, $expected_revision, $due_at, $idempotency_key);
        if ($job_id <= 0) {
            return;
        }
        if (function_exists('wp_schedule_single_event') && byline_deployment_cron_event_timestamp() <= 0) {
            $scheduled = wp_schedule_single_event($due_at, BYLINE_DEPLOYMENT_EVENT, [$job_id]);
        } else {
            $scheduled = true;
        }
    } else {
        if (byline_deployment_cron_event_timestamp() > 0) {
            return;
        }
        $scheduled = wp_schedule_single_event($due_at, BYLINE_DEPLOYMENT_EVENT, [$reason]);
    }
    if (!$scheduled) {
        error_log('Byline: deploy-hook trigger could not be scheduled.');
    }
}

/**
 * The one manual-retry path shared by REST, WP-CLI, and the admin UI.
 *
 * A retry always participates in the durable job lifecycle: it requeues the
 * failed or cancelled job where one exists, and otherwise creates a tracked job
 * for the revision the site still owes. Repeated calls are idempotent because
 * an already queued or running job is reported back untouched instead of
 * producing a second deploy request.
 */
function byline_retry_deployment(string $reason = 'manual'): array
{
    $reason = sanitize_key($reason) ?: 'manual';
    $expected_revision = byline_deployment_expected_revision();

    if (byline_deployment_hook_url() === '') {
        // Keep the recorded revision; there is simply nowhere to send it yet.
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Not configured', false);
        return byline_deployment_status();
    }

    if (!function_exists('byline_create_job')) {
        // A pre-jobs installation keeps its established direct behavior.
        byline_trigger_deployment($reason);
        return byline_deployment_status();
    }

    $job = byline_deployment_job_internal();
    $actor_id = byline_deployment_actor_id();

    if ($job && in_array($job['status'], ['queued', 'running'], true)) {
        // Already tracked and on its way. A second click must not deploy twice.
        if ($job['status'] === 'queued'
            && $expected_revision > (int) (($job['payload']['expectedRevision'] ?? 0))) {
            byline_deployment_enqueue_job($reason, $expected_revision, time());
        }
        return byline_deployment_status();
    }

    if ($job
        && in_array($job['status'], ['failed', 'cancelled', 'retry_waiting'], true)
        && function_exists('byline_retry_job')) {
        $retried = byline_retry_job((int) $job['id'], $actor_id);
        if (is_array($retried)) {
            update_option(BYLINE_DEPLOYMENT_JOB_OPTION, (int) $job['id'], false);
            // The requeued job keeps its attempts, actor, and timestamps; only
            // the revision it must satisfy is refreshed when content moved on.
            if ($expected_revision > (int) (($job['payload']['expectedRevision'] ?? 0))) {
                byline_deployment_enqueue_job($reason, $expected_revision, time());
            } elseif (function_exists('wp_schedule_single_event') && byline_deployment_cron_event_timestamp() <= 0) {
                wp_schedule_single_event(time(), BYLINE_DEPLOYMENT_EVENT, [(int) $job['id']]);
            }
            return byline_deployment_status();
        }
    }

    // No reusable job: the previous one already succeeded, or none was ever
    // stored. Track this retry as its own durable job so its attempts, actor,
    // and errors stay coherent instead of vanishing into an untracked request.
    $retry_count = max(0, absint(get_option(BYLINE_DEPLOYMENT_MANUAL_RETRY_OPTION, 0))) + 1;
    update_option(BYLINE_DEPLOYMENT_MANUAL_RETRY_OPTION, $retry_count, false);
    byline_schedule_deployment($reason, true, $expected_revision, [
        'dueAt' => time(),
        'idempotencyKey' => 'deployment:' . $expected_revision . ':manual-' . $retry_count,
    ]);
    return byline_deployment_status();
}

function byline_send_deployment_request(string $reason = 'scheduled', int $expected_revision = 0, string $idempotency_key = '')
{
    $url = byline_deployment_hook_url();
    if ($url === '') {
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Not configured', false);
        return new WP_Error('byline_deployment_not_configured', 'Deployment is not configured.', ['retryable' => false]);
    }

    $headers = [
        'User-Agent' => 'Byline',
        'X-Byline-Reason' => sanitize_key($reason),
    ];
    if ($idempotency_key !== '') {
        $headers['X-Byline-Idempotency'] = byline_job_idempotency_value($idempotency_key);
    }
    if ($expected_revision > 0) {
        $headers['X-Byline-Expected-Revision'] = (string) $expected_revision;
    }
    try {
        $response = wp_safe_remote_post($url, [
            'blocking' => true,
            'headers' => $headers,
            'redirection' => 0,
            'timeout' => 10,
        ]);
    } catch (Throwable $exception) {
        update_option(BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION, (string) time(), false);
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Request failed', false);
        return new WP_Error('byline_deployment_request_failed', 'The deployment request failed.', ['retryable' => true]);
    }
    update_option(BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION, (string) time(), false);

    if (is_wp_error($response)) {
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Request failed', false);
        return new WP_Error('byline_deployment_request_failed', 'The deployment request failed.', ['retryable' => true]);
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $status = $code > 0 ? sprintf('HTTP %d', $code) : 'No HTTP status';
    update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, $status, false);
    if ($code < 200 || $code >= 300) {
        return new WP_Error(
            'byline_deployment_http_failure',
            'The deployment hook returned an unsuccessful response.',
            ['retryable' => $code === 0 || $code === 408 || $code === 425 || $code === 429 || $code >= 500, 'httpStatus' => $code]
        );
    }
    return ['ok' => true, 'status' => $status, 'expectedRevision' => $expected_revision];
}

function byline_execute_deployment_job(array $job)
{
    $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
    $reason = (string) ($payload['reason'] ?? 'scheduled');
    $expected_revision = (int) ($payload['expectedRevision'] ?? 0);
    if (function_exists('do_action')) {
        do_action('byline_editorial_build_started', $expected_revision, $reason);
    }

    $result = byline_send_deployment_request(
        $reason,
        $expected_revision,
        (string) ($job['idempotencyKey'] ?? '')
    );
    if (is_wp_error($result) && function_exists('do_action')) {
        do_action('byline_editorial_build_failed', $reason, $result);
    }

    return $result;
}

/**
 * Published content is the deployable public artifact. Queue its build from
 * WordPress's status transition hook so Gutenberg, imports, and other writers
 * share the same durable lifecycle as settings and design changes.
 */
function byline_schedule_story_deployment_on_status($new_status, $old_status, $post): void
{
    if (!is_object($post) || (string) ($post->post_type ?? '') !== 'post' || (string) $new_status !== 'publish') {
        return;
    }
    if (function_exists('wp_is_post_revision') && wp_is_post_revision((int) ($post->ID ?? 0))) {
        return;
    }
    if (function_exists('wp_is_post_autosave') && wp_is_post_autosave((int) ($post->ID ?? 0))) {
        return;
    }

    byline_schedule_deployment('story-published');
}

add_action('transition_post_status', 'byline_schedule_story_deployment_on_status', 20, 3);

function byline_process_deployment_event($job_id = 0): void
{
    $legacy_reason = is_string($job_id) ? sanitize_key($job_id) : 'scheduled';
    $job_id = is_numeric($job_id) ? (int) $job_id : 0;
    if ($job_id <= 0) {
        $job = byline_deployment_job_internal();
        $job_id = $job ? (int) $job['id'] : 0;
    }
    if ($job_id > 0 && function_exists('byline_job_run') && function_exists('byline_job_internal')) {
        $job = byline_job_internal($job_id);
        if ($job && $job['type'] === BYLINE_DEPLOYMENT_JOB_TYPE) {
            byline_job_run($job_id, null, 'wp-cron');
            return;
        }
    }
    byline_trigger_deployment($legacy_reason !== '' ? $legacy_reason : 'scheduled');
}

function byline_trigger_deployment(string $reason = 'scheduled'): void
{
    // A pre-adapter legacy event may still fire after an upgrade. If it points
    // at a durable deployment job, process that job so the old event cannot
    // leave the new record queued or perform an untracked request.
    if ($reason === 'legacy-event' && function_exists('byline_job_run')) {
        $job = byline_deployment_job_internal();
        if ($job && in_array($job['status'], ['queued', 'retry_waiting'], true)) {
            byline_job_run((int) $job['id'], null, 'legacy-cron');
            return;
        }
        if ($job) {
            // The durable wake or modern event may already have processed the
            // request. Never send a second untracked hook request from the
            // compatibility event.
            return;
        }
    }
    $result = byline_send_deployment_request($reason, 0);
    if (is_wp_error($result)) {
        error_log('Byline: deploy-hook request failed.');
        return;
    }
    if (is_array($result) && isset($result['status']) && strpos((string) $result['status'], 'HTTP 2') !== 0) {
        error_log('Byline: deploy hook returned an unsuccessful response.');
    }
}
add_action(BYLINE_DEPLOYMENT_EVENT, 'byline_process_deployment_event', 10, 1);

if (function_exists('byline_register_job_handler')) {
    byline_register_job_handler(BYLINE_DEPLOYMENT_JOB_TYPE, 'byline_execute_deployment_job');
}

function byline_clear_scheduled_deployment(): void
{
    wp_clear_scheduled_hook(BYLINE_DEPLOYMENT_EVENT);
}

function byline_can_manage_deployment(): bool
{
    return current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY);
}

function byline_rest_get_deployment(): WP_REST_Response
{
    return rest_ensure_response(byline_deployment_status());
}

function byline_rest_update_deployment(WP_REST_Request $request)
{
    $payload = $request->get_json_params();
    $provider = sanitize_key((string) ($payload['provider'] ?? byline_deployment_provider_id()));
    if (!isset(byline_deployment_providers()[$provider])) {
        return new WP_Error('byline_unknown_deployment_provider', 'Select an installed deployment provider.', ['status' => 400]);
    }

    $next_hook_url = null;
    if (empty($payload['clearHook']) && array_key_exists('hookUrl', $payload) && trim((string) $payload['hookUrl']) !== '') {
        $next_hook_url = byline_validate_deployment_hook_url($payload['hookUrl']);
        if ($next_hook_url === '') {
            return new WP_Error('byline_invalid_deployment_hook', 'Enter a valid HTTPS deploy-hook URL.', ['status' => 400]);
        }
    }

    // Validate the complete request before changing the provider or clearing
    // a previously working hook. An invalid edit must never partially replace
    // good deployment configuration.
    update_option(BYLINE_DEPLOYMENT_PROVIDER_OPTION, $provider, false);

    if (!empty($payload['clearHook'])) {
        update_option(BYLINE_DEPLOYMENT_HOOK_OPTION, '', false);
        if (defined('WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION')) {
            update_option(WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION, '', false);
        }
    } elseif ($next_hook_url !== null) {
        update_option(BYLINE_DEPLOYMENT_HOOK_OPTION, $next_hook_url, false);
    }

    return rest_ensure_response(byline_deployment_status());
}

/**
 * Manual retry from the admin UI or the article's post-publish panel.
 *
 * This deliberately does not send a hook request of its own: it hands the work
 * to the durable job lifecycle so attempts, retries, timestamps, the actor, and
 * any error stay visible in one record.
 */
function byline_rest_trigger_deployment(): WP_REST_Response
{
    return rest_ensure_response(byline_retry_deployment('manual'));
}

function byline_register_deployment_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/deployment', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_rest_get_deployment',
            'permission_callback' => 'byline_can_manage_deployment',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_rest_update_deployment',
            'permission_callback' => 'byline_can_manage_deployment',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/deployment/trigger', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_trigger_deployment',
        'permission_callback' => 'byline_can_manage_deployment',
    ]);
}
add_action('rest_api_init', 'byline_register_deployment_routes');

if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
    class Byline_Deployment_CLI_Command
    {
        /** Requeue the durable deployment job, exactly as REST and cron do. */
        public function retry(array $args, array $assoc_args): void
        {
            $status = byline_retry_deployment(isset($assoc_args['reason']) ? (string) $assoc_args['reason'] : 'cli');
            WP_CLI::line(sprintf(
                'lifecycle=%s job=%s expectedRevision=%d publicRevision=%d',
                (string) ($status['lifecycle'] ?? 'unknown'),
                (string) ($status['jobId'] ?? 'none'),
                (int) ($status['expectedRevision'] ?? 0),
                (int) ($status['publicRevision'] ?? 0)
            ));
        }

        public function status(array $args): void
        {
            $status = byline_deployment_status();
            unset($status['hookUrl']);
            WP_CLI::line((string) wp_json_encode($status));
        }
    }
    WP_CLI::add_command('byline deployment', 'Byline_Deployment_CLI_Command');
}
