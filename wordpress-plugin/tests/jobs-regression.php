<?php

/**
 * Durable job storage, lease/retry semantics, cron health, permissions, and
 * the read-only design-schedule adapter.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const BYLINE_PUBLICATION_REVISION_OPTION = 'byline_publication_revision';
const BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED = 'scheduled';
const BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING = 'processing';
const BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED = 'published';
const BYLINE_DESIGN_SCHEDULE_STATUS_CANCELLED = 'cancelled';
const BYLINE_DESIGN_SCHEDULE_LOCK_META = '_byline_design_job_lock';
const BYLINE_DESIGN_SCHEDULE_LOCK_SECONDS = 900;

$job_test_options = [BYLINE_PUBLICATION_REVISION_OPTION => 4];
$job_test_posts = [];
$job_test_meta = [];
$job_test_scheduled = [];
$job_test_next_id = 0;
$job_test_now = 1000;
$job_test_can_manage = false;
$job_test_handler_runs = 0;
$job_test_flaky_runs = 0;
$job_test_routes = [];
$job_test_last_remote_args = [];

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const CREATABLE = 'POST';
}

class WP_Error
{
    private string $code;
    private string $message;
    private array $data;

    public function __construct(string $code = 'test_error', string $message = '', array $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }

    public function get_error_message(): string
    {
        return $this->message;
    }

    public function get_error_data()
    {
        return $this->data;
    }
}

class WP_Post
{
    public int $ID;
    public string $post_type;
    public string $post_status;
    public string $post_content;
    public string $post_date_gmt;
    public int $post_author;

    public function __construct(int $id, array $data)
    {
        $this->ID = $id;
        $this->post_type = (string) ($data['post_type'] ?? '');
        $this->post_status = (string) ($data['post_status'] ?? 'private');
        $this->post_content = (string) ($data['post_content'] ?? '');
        $this->post_date_gmt = (string) ($data['post_date_gmt'] ?? gmdate('Y-m-d H:i:s'));
        $this->post_author = (int) ($data['post_author'] ?? 0);
    }
}

class WP_REST_Response
{
    public $data;

    public function __construct($data)
    {
        $this->data = $data;
    }
}

function jobs_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function apply_filters(string $name, $value) { return $value; }
function register_post_type(...$args): void {}
function register_rest_route(string $namespace, string $route, array $definition): void
{
    global $job_test_routes;
    $job_test_routes[$namespace . $route] = $definition;
}
function rest_ensure_response($value): WP_REST_Response { return new WP_REST_Response($value); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function wp_json_encode($value, int $flags = 0): string { return (string) json_encode($value, $flags); }
function wp_slash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function absint($value): int { return abs((int) $value); }
function current_time(string $type, bool $gmt = false): int { global $job_test_now; return $job_test_now; }
function get_current_user_id(): int { return 17; }
function wp_generate_uuid4(): string { static $id = 0; $id++; return 'test-lease-' . $id; }
function get_option(string $key, $default = false) { global $job_test_options; return array_key_exists($key, $job_test_options) ? $job_test_options[$key] : $default; }
function update_option(string $key, $value, bool $autoload = false): bool { global $job_test_options; $job_test_options[$key] = $value; return true; }
function current_user_can(string $capability): bool { global $job_test_can_manage; return $job_test_can_manage && in_array($capability, [BYLINE_MANAGE_CAPABILITY, BYLINE_MANAGE_INTEGRATIONS_CAPABILITY], true); }
function wp_insert_post(array $data, bool $wp_error = false)
{
    global $job_test_posts, $job_test_next_id, $job_test_now;
    $job_test_next_id++;
    $job_test_posts[$job_test_next_id] = new WP_Post($job_test_next_id, array_merge($data, ['post_date_gmt' => gmdate('Y-m-d H:i:s', $job_test_now)]));
    return $job_test_next_id;
}
function wp_update_post(array $data, bool $wp_error = false)
{
    global $job_test_posts;
    $id = (int) ($data['ID'] ?? 0);
    if (!isset($job_test_posts[$id])) {
        return new WP_Error('missing_post', 'Missing post.');
    }
    if (array_key_exists('post_content', $data)) {
        $job_test_posts[$id]->post_content = (string) $data['post_content'];
    }
    return $id;
}
function get_post(int $id)
{
    global $job_test_posts;
    return $job_test_posts[$id] ?? null;
}
function get_posts(array $args = []): array
{
    global $job_test_posts, $job_test_meta;
    $posts = array_values($job_test_posts);
    if (isset($args['post_type'])) {
        $posts = array_values(array_filter($posts, static fn(WP_Post $post): bool => $post->post_type === $args['post_type']));
    }
    if (isset($args['meta_key'])) {
        $posts = array_values(array_filter($posts, static function (WP_Post $post) use ($args, $job_test_meta): bool {
            return array_key_exists($post->ID, $job_test_meta)
                && (string) ($job_test_meta[$post->ID][$args['meta_key']] ?? '') === (string) ($args['meta_value'] ?? '');
        }));
    }
    usort($posts, static function (WP_Post $left, WP_Post $right) use ($args): int {
        $comparison = $left->ID <=> $right->ID;
        return ($args['order'] ?? 'ASC') === 'DESC' ? -$comparison : $comparison;
    });
    if (isset($args['posts_per_page']) && (int) $args['posts_per_page'] > 0) {
        $posts = array_slice($posts, 0, (int) $args['posts_per_page']);
    }
    return $posts;
}
function get_post_meta(int $id, string $key, bool $single = false)
{
    global $job_test_meta;
    return $job_test_meta[$id][$key] ?? '';
}
function update_post_meta(int $id, string $key, $value): bool { global $job_test_meta; $job_test_meta[$id][$key] = $value; return true; }
function add_post_meta(int $id, string $key, $value, bool $unique = false): bool
{
    global $job_test_meta;
    if ($unique && array_key_exists($key, $job_test_meta[$id] ?? [])) {
        return false;
    }
    $job_test_meta[$id][$key] = $value;
    return true;
}
function delete_post_meta(int $id, string $key): bool { global $job_test_meta; unset($job_test_meta[$id][$key]); return true; }
function wp_schedule_single_event(int $timestamp, string $hook, array $args = []): bool
{
    global $job_test_scheduled;
    $job_test_scheduled[] = ['timestamp' => $timestamp, 'hook' => $hook, 'args' => $args];
    return true;
}
function wp_schedule_event(int $timestamp, string $recurrence, string $hook): bool
{
    global $job_test_scheduled;
    $job_test_scheduled[] = ['timestamp' => $timestamp, 'hook' => $hook, 'args' => [], 'recurrence' => $recurrence];
    return true;
}
function wp_next_scheduled(string $hook, array $args = [])
{
    global $job_test_scheduled;
    $events = array_values(array_filter($job_test_scheduled, static function (array $event) use ($hook, $args): bool {
        return $event['hook'] === $hook && ($args === [] || $event['args'] === $args);
    }));
    if ($events === []) {
        return false;
    }
    return min(array_column($events, 'timestamp'));
}
function wp_clear_scheduled_hook(string $hook, array $args = []): void
{
    global $job_test_scheduled;
    $job_test_scheduled = array_values(array_filter($job_test_scheduled, static function (array $event) use ($hook, $args): bool {
        return $event['hook'] !== $hook || ($args !== [] && $event['args'] !== $args);
    }));
}
function esc_url_raw(string $url, array $protocols = []): string
{
    $scheme = parse_url($url, PHP_URL_SCHEME);
    return filter_var($url, FILTER_VALIDATE_URL) && ($protocols === [] || in_array($scheme, $protocols, true)) ? $url : '';
}
function wp_parse_url(string $url, int $component = -1) { return parse_url($url, $component); }
function wp_timezone(): DateTimeZone { return new DateTimeZone('UTC'); }
function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string { return gmdate($format, $timestamp); }
function wp_safe_remote_post(string $url, array $args): array
{
    global $job_test_last_remote_args;
    $job_test_last_remote_args = $args;
    return ['response' => ['code' => 202]];
}
function wp_remote_retrieve_response_code(array $response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_safe_remote_get(string $url, array $args): array
{
    return [
        'response' => ['code' => 200],
        'body' => '{"protocolVersion":1,"publicationRevision":7,"designRevisions":{"home":4}}',
    ];
}
function wp_remote_retrieve_body(array $response): string { return (string) ($response['body'] ?? ''); }

function byline_get_design_schedule(int $schedule_id): ?array
{
    if ($schedule_id !== 901) {
        return null;
    }
    return [
        'id' => 901,
        'template' => 'home',
        'baseLiveRevision' => 3,
        'scheduledAt' => '1970-01-01T00:16:40+00:00',
        'scheduledBy' => 8,
        'status' => BYLINE_DESIGN_SCHEDULE_STATUS_PROCESSING,
        'execution' => [
            'attempts' => 2,
            'idempotencyKey' => 'design:901',
            'startedAt' => '1970-01-01T00:16:30+00:00',
            'completedAt' => null,
        ],
        'idempotencyKey' => 'design:901',
        'resultingRevision' => null,
        'error' => null,
        'snapshotHash' => str_repeat('a', 64),
    ];
}
function byline_get_publication_config(): array { return ['urls' => ['publicSite' => 'https://publication.example.test']]; }
function byline_is_design_template(string $template): bool { return $template === 'home'; }

require __DIR__ . '/../includes/core/jobs.php';

$first = byline_create_job('test', ['b' => 2, 'a' => 1], [
    'idempotencyKey' => 'test:one',
    'createdAt' => 100,
    'dueAt' => 100,
    'actorId' => 7,
    'maxAttempts' => 2,
    'retryDelay' => 10,
    'schedule' => false,
]);
jobs_test_assert(is_array($first) && $first['status'] === 'queued', 'A durable job should start queued.');
jobs_test_assert($first['attempts'] === 0 && $first['actorId'] === 7 && $first['jobId'] === 'byline:1', 'Durable job identity and initial execution metadata are unstable.');

$same = byline_create_job('test', ['a' => 1, 'b' => 2], ['idempotencyKey' => 'test:one', 'schedule' => false]);
jobs_test_assert(is_array($same) && $same['id'] === $first['id'] && !empty($same['idempotent']), 'Equivalent idempotent enqueue should return the original job.');
$conflict = byline_create_job('test', ['a' => 99], ['idempotencyKey' => 'test:one', 'schedule' => false]);
jobs_test_assert($conflict instanceof WP_Error && $conflict->get_error_code() === 'byline_job_idempotency_conflict', 'A reused idempotency key must reject a different payload.');

byline_register_job_handler('test', static function (array $job) use (&$job_test_handler_runs) {
    $job_test_handler_runs++;
    return ['handled' => true];
});
$completed = byline_job_run((int) $first['id'], 100, 'test');
jobs_test_assert(is_array($completed) && $completed['status'] === 'succeeded' && $completed['attempts'] === 1 && $completed['completedAt'] !== null, 'A claimed job should complete with timestamps and an attempt count.');
jobs_test_assert($job_test_handler_runs === 1, 'A completed job handler should run exactly once.');

$flaky = byline_create_job('flaky', ['item' => 'one'], [
    'idempotencyKey' => 'flaky:one', 'createdAt' => 100, 'dueAt' => 100,
    'maxAttempts' => 2, 'retryDelay' => 10, 'schedule' => false,
]);
byline_register_job_handler('flaky', static function (array $job) use (&$job_test_flaky_runs) {
    $job_test_flaky_runs++;
    return $job_test_flaky_runs === 1 ? new WP_Error('temporary', 'Temporary failure.', ['retryable' => true]) : true;
});
$retry_waiting = byline_job_run((int) $flaky['id'], 200, 'test');
jobs_test_assert(is_array($retry_waiting) && $retry_waiting['status'] === 'retry_waiting' && $retry_waiting['attempts'] === 1 && $retry_waiting['nextAttemptAt'] !== null, 'Retryable failures should persist retry_waiting and the next attempt time.');
$not_due = byline_job_run((int) $flaky['id'], 205, 'test');
jobs_test_assert(is_array($not_due) && $not_due['status'] === 'retry_waiting' && $job_test_flaky_runs === 1, 'A retry must not run before its backoff expires.');
$retried = byline_job_run((int) $flaky['id'], 210, 'test');
jobs_test_assert(is_array($retried) && $retried['status'] === 'succeeded' && $retried['attempts'] === 2, 'A due retry should claim and complete the same durable job.');

$cancelled = byline_create_job('cancel', ['item' => 'cancel'], ['createdAt' => 100, 'dueAt' => 100, 'schedule' => false]);
$cancelled = byline_cancel_job((int) $cancelled['id'], 17, 100);
jobs_test_assert(is_array($cancelled) && $cancelled['status'] === 'cancelled' && $cancelled['cancelledAt'] !== null, 'Queued jobs should support terminal cancellation.');
$manual_retry = byline_retry_job((int) $cancelled['id'], 17, 101);
jobs_test_assert(is_array($manual_retry) && $manual_retry['status'] === 'queued' && $manual_retry['canCancel'], 'Manual retry should requeue a cancelled job without rewriting its identity.');
byline_cancel_job((int) $manual_retry['id'], 17, 101);

$stale = byline_create_job('stale', ['item' => 'stale'], ['createdAt' => 100, 'dueAt' => 100, 'schedule' => false]);
$claimed_stale = byline_job_claim((int) $stale['id'], 100);
jobs_test_assert(is_array($claimed_stale) && $claimed_stale['status'] === 'running', 'A due job should acquire a running lease.');
byline_register_job_handler('stale', static fn(array $job): bool => true);
$recovered = byline_job_run((int) $stale['id'], 401, 'catch-up');
jobs_test_assert(is_array($recovered) && $recovered['status'] === 'succeeded' && $recovered['attempts'] === 2, 'An expired lease should be recovered by the catch-up runner.');

$overdue = byline_create_job('overdue', ['item' => 'overdue'], ['createdAt' => 100, 'dueAt' => 900, 'schedule' => false]);
wp_schedule_event(900, 'byline_five_minutes', BYLINE_JOB_CRON_HOOK);
$cron_health = byline_jobs_cron_health(1000);
jobs_test_assert($cron_health['overdueCount'] === 1 && $cron_health['catchUpRecommended'] === true && $cron_health['status'] === 'recommended', 'Cron health should identify overdue durable work and recommend catch-up.');
$revision = byline_bump_public_content_revision();
jobs_test_assert($revision === 5 && byline_public_content_revision() === 5, 'Public build revisions should advance monotonically in the existing option.');

$legacy = byline_job_from_design_schedule(901);
jobs_test_assert(is_array($legacy) && $legacy['jobId'] === 'byline:design-schedule:901' && $legacy['status'] === BYLINE_JOB_STATUS_RUNNING && $legacy['attempts'] === 2, 'The design scheduler should be exposed through a read-only durable-job adapter.');
jobs_test_assert(!isset($legacy['document']) && $legacy['legacyStorage'] === 'byline_design_schedule', 'The design adapter must not copy the immutable document or rewrite legacy storage.');

byline_register_job_routes();
jobs_test_assert(isset($job_test_routes['byline/v1/admin/jobs']) && $job_test_routes['byline/v1/admin/jobs']['permission_callback']() === false, 'Job REST routes must be capability protected.');
$job_test_can_manage = true;
jobs_test_assert($job_test_routes['byline/v1/admin/jobs']['permission_callback']() === true, 'Authorized operators should be able to use the job runner routes.');

require __DIR__ . '/../includes/integrations/deployment.php';
$job_test_options[BYLINE_DEPLOYMENT_HOOK_OPTION] = 'https://deploy.example.test/hook';
$job_test_now = 1000;
byline_schedule_deployment('content');
$deployment_job_id = (int) get_option(BYLINE_DEPLOYMENT_JOB_OPTION, 0);
jobs_test_assert($deployment_job_id > 0, 'Configured deployment should create a durable deployment job.');
$deployment_job = byline_job_internal($deployment_job_id);
jobs_test_assert(is_array($deployment_job) && $deployment_job['status'] === 'queued' && (int) ($deployment_job['payload']['expectedRevision'] ?? 0) === 6, 'Deployment jobs should record the exact public revision they request.');
byline_schedule_deployment('sports');
$coalesced_job = byline_job_internal($deployment_job_id);
jobs_test_assert(is_array($coalesced_job) && $coalesced_job['id'] === $deployment_job_id && (int) ($coalesced_job['payload']['expectedRevision'] ?? 0) === 7, 'Queued deployment requests should coalesce into one durable job at the newest revision.');
$deployment_status = byline_deployment_status();
jobs_test_assert($deployment_status['lifecycle'] === 'queued' && $deployment_status['expectedRevision'] === 7, 'Deployment status should expose a safe queued lifecycle and expected revision.');
$run_at = time() + 60;
$job_test_now = $run_at;
byline_process_deployment_event($deployment_job_id);
$deployment_done = byline_get_job($deployment_job_id);
jobs_test_assert(is_array($deployment_done) && $deployment_done['status'] === 'succeeded', 'The authenticated/cron deployment hook should complete the durable deployment job.');
jobs_test_assert(($job_test_last_remote_args['headers']['X-Byline-Expected-Revision'] ?? '') === '7' && ($job_test_last_remote_args['headers']['X-Byline-Idempotency'] ?? '') === 'deployment:7', 'Durable deployment requests should pass only safe revision and idempotency headers to the external hook.');
jobs_test_assert(byline_deployment_lifecycle_status(['expectedRevision' => 7, 'jobStatus' => 'running'], []) === 'building', 'A leased deployment job should report building.');
jobs_test_assert(byline_deployment_lifecycle_status(['expectedRevision' => 7, 'jobStatus' => 'failed'], []) === 'failed', 'A terminal deployment job should report failed.');
jobs_test_assert(byline_deployment_lifecycle_status(['expectedRevision' => 7, 'jobStatus' => 'succeeded'], []) === 'unknown', 'A completed request without a matching public manifest should report unknown.');
jobs_test_assert(byline_deployment_lifecycle_status($deployment_status, ['reachable' => true, 'publicationRevision' => 7]) === 'live', 'A public manifest at the expected revision should be reported live.');

require __DIR__ . '/../includes/core/diagnostics.php';
$manifest_diagnostic = byline_public_manifest_diagnostic();
jobs_test_assert($manifest_diagnostic['lifecycle'] === 'live' && $manifest_diagnostic['contentRevision'] === 7 && $manifest_diagnostic['expectedRevision'] === 7, 'Manifest diagnostics should prove the expected public revision before reporting live.');

echo "Byline durable jobs regression passed.\n";
