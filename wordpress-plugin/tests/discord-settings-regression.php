<?php

define('ABSPATH', __DIR__ . '/../');
define('MINUTE_IN_SECONDS', 60);
const BYLINE_REST_NAMESPACE = 'byline/v1';
const WWH_REST_NAMESPACE = 'weekly-wildcat/v1';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';

$options = [];
$transients = [];
$routes = [];
$requests = [];
$responses = [];
$can_manage = false;

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'PUT';
    public const CREATABLE = 'POST';
}
class WP_REST_Request
{
    private array $params;
    private array $json;
    public function __construct(array $json = [], array $params = []) { $this->json = $json; $this->params = $params; }
    public function get_json_params() { return $this->json; }
    public function get_param(string $key) { return $this->params[$key] ?? null; }
}
class WP_REST_Response { public $data; public function __construct($data) { $this->data = $data; } }
class WP_Error
{
    public string $code;
    public string $message;
    public function __construct(string $code = '', string $message = '', array $data = []) { $this->code = $code; $this->message = $message; }
    public function get_error_message(): string { return $this->message; }
}

function add_action(...$args): void {}
function register_rest_route(string $namespace, string $route, array $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function rest_ensure_response($data): WP_REST_Response { return new WP_REST_Response($data); }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function current_user_can(string $capability): bool { global $can_manage; return $capability === BYLINE_MANAGE_INTEGRATIONS_CAPABILITY && $can_manage; }
function absint($value): int { return abs((int) $value); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function untrailingslashit($value): string { return rtrim((string) $value, '/\\'); }
function esc_url_raw(string $url, array $protocols = []): string { return filter_var($url, FILTER_VALIDATE_URL) && in_array(parse_url($url, PHP_URL_SCHEME), $protocols, true) ? $url : ''; }
function wp_parse_url(string $url, int $component = -1) { return parse_url($url, $component); }
function wp_json_encode($value): string { return json_encode($value); }
function wp_generate_uuid4(): string { return '00000000-0000-4000-8000-000000000000'; }
function wp_timezone(): DateTimeZone { return new DateTimeZone('UTC'); }
function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string { return gmdate($format, $timestamp); }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, bool $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function get_transient(string $key) { global $transients; return $transients[$key] ?? false; }
function set_transient(string $key, $value, int $ttl): bool { global $transients; $transients[$key] = $value; return true; }
function delete_transient(string $key): bool { global $transients; unset($transients[$key]); return true; }
function byline_get_publication_config(): array { return ['identity' => ['name' => 'The Harbor Light', 'shortName' => 'Harbor Light']]; }
function byline_publication_name(): string { return 'Harbor Light'; }

function byline_test_respond(string $url) { global $responses; return $responses[$url] ?? new WP_Error('http_request_failed', 'Connection refused.'); }
function wp_remote_get(string $url, array $args = []) { global $requests; $requests[] = ['GET', $url]; return byline_test_respond($url); }
function wp_remote_post(string $url, array $args = []) { global $requests; $requests[] = ['POST', $url, $args['body'] ?? '']; return byline_test_respond($url); }
function wp_remote_retrieve_response_code($response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_remote_retrieve_body($response): string { return (string) ($response['body'] ?? ''); }

require __DIR__ . '/../includes/core/compatibility.php';
require __DIR__ . '/../includes/discord-integration.php';
require __DIR__ . '/../includes/integrations/discord.php';

function byline_test_fail(string $message): void { fwrite(STDERR, $message . "\n"); exit(1); }
function byline_test_json(array $body, int $code = 200): array { return ['response' => ['code' => $code], 'body' => json_encode($body)]; }

// The environment keeps configuring an installation that never opens the screen.
putenv('BYLINE_DISCORD_GUILD_ID=12345678901234568');
putenv('DISCORD_TOKEN=environment-token');
putenv('WWH_RECONCILE_INTERVAL_MS=900000');
if (byline_discord_setting('guildId') !== '12345678901234568' || byline_discord_setting_source('guildId') !== 'environment') {
    byline_test_fail('An environment-configured server was not resolved as a fallback.');
}
if (byline_discord_setting('reconcileMinutes') !== '15') {
    byline_test_fail('The legacy reconciliation interval was not converted to whole minutes.');
}
if (byline_discord_setting('announcePublished') !== '1') {
    byline_test_fail('Published-story announcements should default to enabled.');
}
putenv('WWH_RECONCILE_INTERVAL_MS=120000');
if (byline_discord_setting('reconcileMinutes') !== '2' || !in_array(2, byline_discord_reconcile_choices(), true)) {
    byline_test_fail('An inherited reconciliation interval must remain selectable.');
}
putenv('WWH_RECONCILE_INTERVAL_MS=900000');

// Saving through the screen takes precedence over the environment.
$saved = byline_rest_update_discord(new WP_REST_Request([
    'guildId' => '99345678901234568',
    'storyboardChannelId' => '99345678901234569',
    'announcementsChannelId' => '99345678901234570',
    'staffRoleId' => '',
    'botToken' => 'wordpress-token',
    'botUrl' => 'https://bot.harbor-light.test/',
    'announcePublished' => false,
    'reconcileMinutes' => 5,
]));
if ($saved instanceof WP_Error) {
    byline_test_fail('Valid Discord settings were rejected: ' . $saved->get_error_message());
}
if (byline_discord_setting('guildId') !== '99345678901234568' || byline_discord_setting_source('guildId') !== 'wordpress') {
    byline_test_fail('WordPress-managed settings must win over the environment.');
}
if (byline_discord_setting('botToken') !== 'wordpress-token' || byline_discord_setting('botUrl') !== 'https://bot.harbor-light.test') {
    byline_test_fail('The bot token and bot URL were not stored as entered.');
}
if (byline_discord_setting('announcePublished') !== '0') {
    byline_test_fail('Turning off announcements must survive an environment default of on.');
}

// Secrets never travel back to the browser.
$payload = $saved->data;
if (strpos(json_encode($payload), 'wordpress-token') !== false) {
    byline_test_fail('The Discord settings response exposed a stored secret.');
}
if ($payload['settings']['secrets']['botToken'] !== true || $payload['settings']['secrets']['clientSecret'] !== false) {
    byline_test_fail('Stored secrets must be reported as booleans only.');
}

// Blank secrets keep the stored value; an explicit clear removes it.
byline_rest_update_discord(new WP_REST_Request(['botToken' => '']));
if (byline_discord_setting('botToken') !== 'wordpress-token') {
    byline_test_fail('An empty secret field must leave the stored token untouched.');
}

if (!(byline_rest_update_discord(new WP_REST_Request(['guildId' => 'not-a-snowflake'])) instanceof WP_Error)) {
    byline_test_fail('A malformed Discord ID must be rejected.');
}
if (!(byline_rest_update_discord(new WP_REST_Request(['botUrl' => 'http://bot.example.com'])) instanceof WP_Error)) {
    byline_test_fail('A plain-HTTP bot URL outside localhost must be rejected.');
}
if (byline_discord_validate_bot_url('http://localhost:3000') !== 'http://localhost:3000') {
    byline_test_fail('A local development bot URL must remain usable.');
}
if (!(byline_rest_update_discord(new WP_REST_Request(['reconcileMinutes' => 7])) instanceof WP_Error)) {
    byline_test_fail('An unoffered reconciliation interval must be rejected.');
}

// WordPress answers the status questions itself while the bot is not running.
$responses['https://discord.com/api/v10/users/@me/guilds'] = byline_test_json([['id' => '99345678901234568', 'name' => 'Harbor Light']]);
$responses['https://discord.com/api/v10/guilds/99345678901234568/channels'] = byline_test_json([
    ['id' => '99345678901234569', 'name' => 'story-board', 'type' => 15],
    ['id' => '99345678901234570', 'name' => 'announcements', 'type' => 0],
]);
$responses['https://discord.com/api/v10/guilds/99345678901234568/roles'] = byline_test_json([
    ['id' => '99345678901234571', 'name' => '@everyone'],
    ['id' => '99345678901234572', 'name' => 'Staff'],
]);
$status = byline_discord_status(true);
if ($status['botConnected'] || $status['source'] !== 'wordpress') {
    byline_test_fail('An unreachable bot must be reported as disconnected.');
}
if (!$status['discordConnected'] || !$status['guildFound'] || !$status['storyboardFound'] || !$status['announcementsFound']) {
    byline_test_fail('WordPress must verify the server and channels when the bot is offline.');
}
$directory = byline_discord_directory();
if (count($directory['forums']) !== 1 || count($directory['textChannels']) !== 1 || count($directory['roles']) !== 1) {
    byline_test_fail('The directory must separate forum channels, text channels, and mentionable roles.');
}

// A running bot is authoritative about what it can see.
$responses['https://bot.harbor-light.test/healthz'] = byline_test_json([
    'discordConnected' => true, 'guildFound' => true, 'storyboardFound' => true, 'announcementsFound' => false,
    'lastSuccessfulReconciliation' => '2026-08-27T14:30:00Z', 'message' => 'Ready',
]);
$status = byline_discord_status(true);
if (!$status['botConnected'] || $status['source'] !== 'bot' || $status['announcementsFound']) {
    byline_test_fail('The running bot must be the authority for the status panel.');
}
if ($status['lastSyncAt'] === 'Never') {
    byline_test_fail('A reported reconciliation time must reach the status panel.');
}

// The bot reads its connection settings from WordPress.
$config = byline_rest_discord_bot_config()->data;
if ($config['discordToken'] !== 'wordpress-token' || $config['guildId'] !== '99345678901234568'
    || $config['reconcileIntervalMs'] !== 300000 || $config['publicationAnnouncements'] !== false
    || $config['publicationShortName'] !== 'Harbor Light') {
    byline_test_fail('The bot configuration endpoint did not return the WordPress-managed settings.');
}

byline_register_discord_routes();
$route = $routes['byline/v1/admin/discord'] ?? null;
if (!is_array($route) || $route[0]['permission_callback']() !== false || $route[1]['permission_callback']() !== false) {
    byline_test_fail('Discord settings must be capability protected.');
}
$can_manage = true;
if ($route[0]['permission_callback']() !== true) {
    byline_test_fail('Authorized integration managers must be able to read the Discord settings.');
}
if (($routes['byline/v1/discord/config']['permission_callback'] ?? '') !== 'wwh_discord_rest_permission') {
    byline_test_fail('The bot configuration route must stay behind the signed bridge.');
}

putenv('BYLINE_DISCORD_GUILD_ID');
putenv('DISCORD_TOKEN');
putenv('WWH_RECONCILE_INTERVAL_MS');

echo "Byline Discord settings regression passed.\n";
