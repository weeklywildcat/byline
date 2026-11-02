<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION = 'wwh_cloudflare_deploy_hook_url';
const WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION = 'wwh_cloudflare_deploy_last_triggered_at';
const WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION = 'wwh_cloudflare_deploy_last_status';
const WWH_CLOUDFLARE_DEPLOY_EVENT = 'wwh_trigger_cloudflare_deploy';

$options = [WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION => 'https://api.cloudflare.com/legacy-secret-hook'];
$scheduled = [];
$routes = [];
$can_manage = false;
$post_count = 0;

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'PUT';
    public const CREATABLE = 'POST';
}
class WP_Error
{
    public string $code;

    public function __construct(string $code = '')
    {
        $this->code = $code;
    }
}
class WP_REST_Request
{
    private array $params;

    public function __construct(array $params = [])
    {
        $this->params = $params;
    }

    public function get_json_params(): array
    {
        return $this->params;
    }
}
class WP_REST_Response { public $data; public function __construct($data) { $this->data = $data; } }

function add_action(...$args): void {}
function apply_filters(string $name, $value) { return $value; }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function esc_url_raw(string $url, array $protocols = []): string { return filter_var($url, FILTER_VALIDATE_URL) && in_array(parse_url($url, PHP_URL_SCHEME), $protocols, true) ? $url : ''; }
function wp_parse_url(string $url, int $component = -1) { return parse_url($url, $component); }
function absint($value): int { return abs((int) $value); }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, bool $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function wp_next_scheduled(string $hook) { global $scheduled; return $scheduled[$hook] ?? false; }
function wp_schedule_single_event(int $timestamp, string $hook, array $args = []): bool { global $scheduled; $scheduled[$hook] = $timestamp; return true; }
function wp_clear_scheduled_hook(string $hook): void { global $scheduled; unset($scheduled[$hook]); }
function wp_timezone(): DateTimeZone { return new DateTimeZone('UTC'); }
function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string { return gmdate($format, $timestamp); }
function wp_safe_remote_post(string $url, array $args): array { global $post_count; $post_count++; return ['response' => ['code' => 202]]; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function wp_remote_retrieve_response_code(array $response): int { return (int) ($response['response']['code'] ?? 0); }
function current_user_can(string $capability): bool { global $can_manage; return $capability === BYLINE_MANAGE_INTEGRATIONS_CAPABILITY && $can_manage; }
function rest_ensure_response($data): WP_REST_Response { return new WP_REST_Response($data); }
function register_rest_route(string $namespace, string $route, array $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
// A stub job store: one deployment job whose payload and due time we can inspect.
$jobs = [];
function byline_job_internal(int $id): ?array { global $jobs; return $jobs[$id] ?? null; }
function byline_create_job(string $type, array $payload, array $options = []) { global $jobs; $id = count($jobs) + 1; $jobs[$id] = ['id' => $id, 'type' => $type, 'status' => 'queued', 'payload' => $payload, 'dueAt' => $options['dueAt'] ?? time()]; return $jobs[$id]; }
function byline_job_update_payload(int $id, array $payload, array $options = []) { global $jobs; $jobs[$id]['payload'] = $payload; $jobs[$id]['dueAt'] = $options['dueAt'] ?? $jobs[$id]['dueAt']; return true; }

require __DIR__ . '/../includes/integrations/deployment.php';

function defer_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

// The first save queues a deploy 60 seconds out.
$job_id = byline_deployment_enqueue_job('content', 1, time() + 60);
defer_assert($job_id === 1 && $jobs[1]['dueAt'] === time() + 60, 'The first save queues a deploy one minute out.');

// A save 30 seconds later still pushes it back (the normal debounce)...
$jobs[1]['payload']['firstQueuedAt'] = time() - 30;
byline_deployment_enqueue_job('content', 2, time() + 60);
defer_assert($jobs[1]['dueAt'] === time() + 60 && $jobs[1]['payload']['expectedRevision'] === 2, 'A later save still coalesces into the queued deploy.');

// ...but a steady stream cannot push it past the first request + the cap.
$jobs[1]['payload']['firstQueuedAt'] = time() - 100;
byline_deployment_enqueue_job('live-update', 3, time() + 60);
defer_assert($jobs[1]['dueAt'] === time() - 100 + BYLINE_DEPLOYMENT_MAX_DEFER, 'Coalescing must not defer a deploy beyond the cap.');
$jobs[1]['payload']['firstQueuedAt'] = time() - 500;
byline_deployment_enqueue_job('live-update', 4, time() + 60);
defer_assert($jobs[1]['dueAt'] === time() && $jobs[1]['payload']['firstQueuedAt'] === time() - 500, 'A deploy already past the cap runs now and keeps its first-queued time.');

echo "Deployment max-defer regression passed.\n";
