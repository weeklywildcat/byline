<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_PLUGIN_VERSION = '0.2.7';
const BYLINE_PROTOCOL_VERSION = 1;
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;
const BYLINE_DESIGN_SCHEMA_VERSION = 1;
const BYLINE_THEME_API_VERSION = 1;
const BYLINE_DESIGN_POST_TYPE = 'byline_design';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const WWH_CLOUDFLARE_DEPLOY_EVENT = 'wwh_trigger_cloudflare_deploy';

class WP_Error {}
class WP_REST_Server { public const READABLE = 'GET'; }

function add_action(...$args): void {}
function register_rest_route(...$args): void {}
function current_user_can(...$args): bool { return true; }
function rest_ensure_response($value) { return $value; }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function wp_safe_remote_get(...$args) { return ['code' => 200, 'body' => '{"protocolVersion":1,"frontendVersion":"0.1.0","publicationRevision":9}']; }
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

require __DIR__ . '/../includes/core/diagnostics.php';

$diagnostics = byline_diagnostics_payload();
$serialized = json_encode($diagnostics);
if (!is_string($serialized)
    || strpos($serialized, 'secret.example.test') !== false
    || strpos($serialized, 'deployHook') !== false
    || $diagnostics['deployment']['configured'] !== true
    || $diagnostics['publicManifest']['reachable'] !== true) {
    fwrite(STDERR, "Diagnostics exposed secrets or omitted safe health information.\n");
    exit(1);
}

echo "Byline diagnostics regression passed.\n";
