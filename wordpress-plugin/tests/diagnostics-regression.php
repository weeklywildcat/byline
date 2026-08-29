<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_PLUGIN_VERSION = '0.2.8';
const BYLINE_PROTOCOL_VERSION = 1;
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;
const BYLINE_DESIGN_SCHEMA_VERSION = 1;
const BYLINE_THEME_API_VERSION = 1;
const BYLINE_DESIGN_POST_TYPE = 'byline_design';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const WWH_CLOUDFLARE_DEPLOY_EVENT = 'wwh_trigger_cloudflare_deploy';

class WP_Error
{
    public function __construct(...$args) {}
}
class WP_REST_Server { public const READABLE = 'GET'; public const CREATABLE = 'POST'; }
class WP_REST_Request
{
    private array $body;
    public function __construct(array $body) { $this->body = $body; }
    public function get_json_params(): array { return $this->body; }
    public function get_param(string $key) { return $this->body[$key] ?? null; }
}

function add_action(...$args): void {}
function register_rest_route(...$args): void { global $registered_routes; $registered_routes[] = $args; }
function current_user_can(...$args): bool { global $diagnostics_capabilities; return !empty($diagnostics_capabilities[(string) ($args[0] ?? '')]); }
function rest_ensure_response($value) { return $value; }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function byline_is_design_template(string $template): bool { return in_array($template, ['home', 'section:news'], true); }
function absint($value): int { return abs((int) $value); }
function wp_safe_remote_get(...$args) { return ['code' => 200, 'body' => '{"protocolVersion":1,"frontendVersion":"0.1.0","publicationRevision":9,"designRevisions":{"home":12,"section:news":13,"unknown":99}}']; }
function wp_remote_retrieve_response_code($response): int { return (int) $response['code']; }
function wp_remote_retrieve_body($response): string { return (string) $response['body']; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function get_posts(...$args): array { return []; }
function get_post_field(...$args): string { return ''; }
function get_bloginfo($field): string { return $field === 'version' ? '6.8' : ''; }
function wp_next_scheduled(...$args) { return false; }
function wwh_cloudflare_deploy_hook_url(): string { return 'https://secret.example.test/deploy'; }
function wwh_cloudflare_deploy_last_trigger_time_label(): string { return 'Aug 25, 2026'; }
function wwh_cloudflare_deploy_last_status_label(): string { return 'HTTP 200'; }
function byline_get_publication_config(): array {
    return [
        'urls' => ['publicSite' => 'https://publication.example.test'],
        'appearance' => ['theme' => 'byline-modern'],
        'features' => ['sports' => false, 'newsletter' => true],
    ];
}

$diagnostics_capabilities = [
    BYLINE_MANAGE_CAPABILITY => true,
    BYLINE_MANAGE_INTEGRATIONS_CAPABILITY => true,
];
$registered_routes = [];

require __DIR__ . '/../includes/core/diagnostics.php';

$diagnostics = byline_diagnostics_payload();
$serialized = json_encode($diagnostics);
if (!is_string($serialized)
    || strpos($serialized, 'secret.example.test') !== false
    || strpos($serialized, 'deployHook') !== false
    || $diagnostics['deployment']['configured'] !== true
    || $diagnostics['publicManifest']['reachable'] !== true
    || !isset($diagnostics['publicManifest']['designRevisions'])
    || $diagnostics['publicManifest']['designRevisions'] !== ['home' => 12, 'section:news' => 13]) {
    fwrite(STDERR, "Diagnostics exposed secrets or omitted safe health information.\n");
    exit(1);
}

$health_action = byline_diagnostics_run_action('health');
if (empty($health_action['ok']) || strpos($health_action['message'], 'completed') === false) {
    fwrite(STDERR, "The read-only Doctor health action did not complete.\n");
    exit(1);
}

$manifest_action = byline_diagnostics_run_action('test-public-manifest');
if (empty($manifest_action['ok'])) {
    fwrite(STDERR, "The public-manifest Doctor action did not use the safe diagnostic contract.\n");
    exit(1);
}

$unknown_action = byline_diagnostics_run_action('delete-publication');
if (!empty($unknown_action['ok'])) {
    fwrite(STDERR, "An unknown Doctor action was accepted.\n");
    exit(1);
}

$request = new WP_REST_Request(['action' => 'test-public-manifest']);
if (byline_diagnostics_action_permission($request) !== true) {
    fwrite(STDERR, "An authorized Doctor action was rejected.\n");
    exit(1);
}
$diagnostics_capabilities[BYLINE_MANAGE_CAPABILITY] = false;
if (!(byline_diagnostics_action_permission($request) instanceof WP_Error)) {
    fwrite(STDERR, "Unauthorized users could run a Doctor action.\n");
    exit(1);
}
$diagnostics_capabilities[BYLINE_MANAGE_CAPABILITY] = true;
$diagnostics_capabilities[BYLINE_MANAGE_INTEGRATIONS_CAPABILITY] = false;
if (!(byline_diagnostics_action_permission(new WP_REST_Request(['action' => 'test-deploy-hook'])) instanceof WP_Error)) {
    fwrite(STDERR, "Deployment Doctor action bypassed its integration capability gate.\n");
    exit(1);
}
$diagnostics_capabilities[BYLINE_MANAGE_INTEGRATIONS_CAPABILITY] = true;

byline_register_diagnostics_route();
$route = $registered_routes[0] ?? null;
if (!is_array($route) || count($route) !== 3 || !is_array($route[2] ?? null) || count($route[2]) !== 2) {
    fwrite(STDERR, "Diagnostics did not register readable and action routes together.\n");
    exit(1);
}
$route_methods = array_column($route[2], 'methods');
if (!in_array(WP_REST_Server::READABLE, $route_methods, true) || !in_array(WP_REST_Server::CREATABLE, $route_methods, true)) {
    fwrite(STDERR, "Diagnostics route methods are incomplete.\n");
    exit(1);
}

$action_payload = byline_diagnostics_action_route(new WP_REST_Request(['action' => 'health']));
if (($action_payload['action'] ?? '') !== 'health' || empty($action_payload['actionResult']['ok'])) {
    fwrite(STDERR, "Doctor action response did not include a refreshed safe payload.\n");
    exit(1);
}

echo "Byline diagnostics regression passed.\n";
