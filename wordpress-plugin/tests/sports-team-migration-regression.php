<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';

$options = [];
$routes = [];
$legacy_install = true;
$can_manage = false;

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'PUT';
}

class WP_REST_Response
{
    public $data;

    public function __construct($data)
    {
        $this->data = $data;
    }
}

function add_action(...$args): void {}
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_title($value): string { return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', (string) $value)), '-'); }
function byline_is_legacy_weekly_wildcat_installation(): bool { global $legacy_install; return $legacy_install; }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, bool $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function current_user_can(string $capability): bool { global $can_manage; return $capability === BYLINE_MANAGE_CAPABILITY && $can_manage; }
function rest_ensure_response($data): WP_REST_Response { return new WP_REST_Response($data); }
function register_rest_route(string $namespace, string $route, array $definition): void { global $routes; $routes[$namespace . $route] = $definition; }

require __DIR__ . '/../includes/sports/teams.php';

byline_migrate_sports_teams();
$weekly = byline_get_sports_teams();
if (count($weekly) !== 23 || !isset($weekly['girls-soccer']) || $weekly['girls-soccer']['key'] !== 'girls-soccer') {
    fwrite(STDERR, "Legacy sports-team migration did not preserve the controlled team keys.\n");
    exit(1);
}

$options = [];
$legacy_install = false;
byline_migrate_sports_teams();
if (byline_get_sports_teams() !== []) {
    fwrite(STDERR, "A new generic Byline installation must not inherit Weekly Wildcat teams.\n");
    exit(1);
}

byline_register_sports_team_routes();
$route = $routes['byline/v1/sports/teams'] ?? null;
if (!is_array($route) || count($route) !== 1 || $route[0]['methods'] !== WP_REST_Server::READABLE) {
    fwrite(STDERR, "Historical team REST reads must remain available without any write route.\n");
    exit(1);
}

echo "Byline sports team migration regression passed.\n";
