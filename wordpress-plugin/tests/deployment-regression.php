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

require __DIR__ . '/../includes/integrations/deployment.php';

if (byline_deployment_hook_url() !== $options[WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION]) {
    fwrite(STDERR, "The generic deployment provider did not retain the legacy hook alias.\n");
    exit(1);
}

byline_schedule_deployment('content');
$first_schedule = $scheduled[BYLINE_DEPLOYMENT_EVENT] ?? 0;
byline_schedule_deployment('content-again');
if ($first_schedule <= time() || count($scheduled) !== 1) {
    fwrite(STDERR, "Deployment changes were not coalesced into one delayed trigger.\n");
    exit(1);
}

$status = byline_deployment_status();
if (!$status['configured'] || strpos(json_encode($status), 'legacy-secret-hook') !== false) {
    fwrite(STDERR, "Deployment status must report configuration without exposing the private URL.\n");
    exit(1);
}

byline_trigger_deployment('test');
if ($post_count !== 1 || byline_deployment_last_status() !== 'HTTP 202') {
    fwrite(STDERR, "The generic provider did not POST the configured hook and record its response.\n");
    exit(1);
}

$stale_lifecycle = byline_deployment_lifecycle_status(
    ['configured' => true, 'expectedRevision' => 9, 'jobStatus' => null, 'pending' => false],
    ['reachable' => false, 'publicationRevision' => 0]
);
if ($stale_lifecycle !== 'queued') {
    fwrite(STDERR, "A recorded public revision without a live manifest must remain queued.\n");
    exit(1);
}

byline_register_deployment_routes();
$route = $routes['byline/v1/admin/deployment'] ?? null;
if (!is_array($route) || $route[0]['permission_callback']() !== false) {
    fwrite(STDERR, "Deployment REST settings must be capability protected.\n");
    exit(1);
}
$can_manage = true;
if ($route[0]['permission_callback']() !== true) {
    fwrite(STDERR, "Authorized integration managers must be able to read deployment status.\n");
    exit(1);
}

$options[BYLINE_DEPLOYMENT_PROVIDER_OPTION] = 'generic-hook';
$options[BYLINE_DEPLOYMENT_HOOK_OPTION] = 'https://working.example.test/hook';
$invalid_update = byline_rest_update_deployment(new WP_REST_Request([
    'provider' => 'generic-hook',
    'hookUrl' => 'http://not-allowed.example.test/hook',
]));
if (!is_wp_error($invalid_update)
    || $options[BYLINE_DEPLOYMENT_PROVIDER_OPTION] !== 'generic-hook'
    || $options[BYLINE_DEPLOYMENT_HOOK_OPTION] !== 'https://working.example.test/hook') {
    fwrite(STDERR, "An invalid deploy-hook edit must not partially replace working configuration.\n");
    exit(1);
}

echo "Byline deployment regression passed.\n";
