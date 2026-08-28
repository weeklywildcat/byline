<?php

/**
 * Focused coverage for optional integration state, provider privacy, and
 * idempotent distribution requests. This is a standalone WordPress-shaped
 * harness so it can run in the repository's PHP regression loop.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';
const DAY_IN_SECONDS = 86400;

$options = [];
$post_meta = [];
$posts = [];
$transients = [];
$routes = [];
$actions = [];
$filters = [];
$remote_count = 0;
$last_remote = null;
$legacy_installation = false;
$deployment_state = ['pending' => false, 'lastStatus' => 'HTTP 202'];
$manifest_state = ['reachable' => true, 'status' => 'HTTP 200'];
$can_manage = true;
$current_user = 42;
$uuid_counter = 0;

class WP_Error
{
    public $code;
    public $message;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
    }

    public function get_error_code(): string
    {
        return (string) $this->code;
    }
}

class WP_REST_Server
{
    const READABLE = 'GET';
    const EDITABLE = 'PUT';
    const CREATABLE = 'POST';
}

function integration_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function is_wp_error($value): bool { return $value instanceof WP_Error; }
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$hook][] = $callback; }
function do_action(string $hook, ...$args): void { global $actions; foreach (($actions[$hook] ?? []) as $callback) { if (is_callable($callback)) { call_user_func_array($callback, $args); } } }
function apply_filters(string $hook, $value, ...$args) { global $filters; return array_key_exists($hook, $filters) ? $filters[$hook] : $value; }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_email($value): string { return filter_var((string) $value, FILTER_SANITIZE_EMAIL); }
function is_email($value) { return filter_var((string) $value, FILTER_VALIDATE_EMAIL) !== false ? (string) $value : false; }
function esc_url_raw($url, array $protocols = []): string
{
    if (!is_string($url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    return $protocols === [] || in_array($scheme, $protocols, true) ? $url : '';
}
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function absint($value): int { return abs((int) $value); }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function get_post_meta(int $post_id, string $key, $single = false) { global $post_meta; return $post_meta[$post_id][$key] ?? ($single ? '' : []); }
function update_post_meta(int $post_id, string $key, $value): bool { global $post_meta; $post_meta[$post_id][$key] = $value; return true; }
function get_post(int $post_id) { global $posts; return $posts[$post_id] ?? null; }
function get_permalink(int $post_id): string { return 'https://example.test/story/' . $post_id . '/'; }
function get_the_title(int $post_id): string { global $posts; return (string) ($posts[$post_id]->post_title ?? ''); }
function get_the_excerpt(int $post_id): string { global $posts; return (string) ($posts[$post_id]->post_excerpt ?? ''); }
function get_current_user_id(): int { global $current_user; return $current_user; }
function wp_generate_uuid4(): string { global $uuid_counter; $uuid_counter++; return 'request-' . $uuid_counter; }
function current_user_can(string $capability, ...$args): bool { global $can_manage; return $can_manage || $capability === 'edit_posts'; }
function add_query_arg(array $args, string $url): string { return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args); }
function admin_url(string $path = ''): string { return 'https://example.test/wp-admin/' . ltrim($path, '/'); }
function wp_json_encode($value): string { return json_encode($value); }
function rest_ensure_response($value) { return $value; }
function register_rest_route(string $namespace, string $route, $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function register_post_meta(string $post_type, string $key, array $args): void { global $routes; $routes['meta:' . $post_type . ':' . $key] = $args; }
function get_transient(string $key) { global $transients; return $transients[$key] ?? false; }
function set_transient(string $key, $value, int $expiration = 0): bool { global $transients; $transients[$key] = $value; return true; }
function delete_transient(string $key): bool { global $transients; unset($transients[$key]); return true; }
function wp_remote_retrieve_response_code($response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_remote_retrieve_body($response): string { return (string) ($response['body'] ?? ''); }
function wp_safe_remote_request(string $url, array $args = [])
{
    global $remote_count, $last_remote;
    $remote_count++;
    $last_remote = ['url' => $url, 'args' => $args];
    if (strpos($url, 'api.kit.com/v4/forms?') !== false) {
        return ['response' => ['code' => 200], 'body' => json_encode(['forms' => [['id' => 123, 'name' => 'Readers', 'uid' => 'public-uid', 'embed_url' => 'https://kit.example.test/form']]])];
    }
    if (strpos($url, 'api.kit.com/v4/forms/123/subscribers') !== false) {
        return ['response' => ['code' => 201], 'body' => json_encode(['id' => 9001])];
    }
    if (strpos($url, 'api.kit.com/v4/account') !== false) {
        return ['response' => ['code' => 200], 'body' => json_encode(['id' => 1, 'name' => 'Example'])];
    }
    if (strpos($url, 'plausible.io/api/v2/query') !== false) {
        return ['response' => ['code' => 200], 'body' => json_encode(['results' => [['dimensions' => [], 'metrics' => [12, 34, 56]]]])];
    }
    if (strpos($url, 'api.cloudflare.com/client/v4/graphql') !== false) {
        return ['response' => ['code' => 200], 'body' => json_encode(['data' => ['viewer' => ['zones' => [['httpRequestsAdaptiveGroups' => [['count' => 11, 'sum' => ['visits' => 8, 'edgeResponseBytes' => 900], 'dimensions' => ['datetimeHour' => '2026-08-28T00:00:00Z', 'clientRequestPath' => '/story/7/']]]]]]]])];
    }
    return ['response' => ['code' => 200], 'body' => json_encode(['results' => []])];
}
function byline_get_publication_config(): array
{
    return [
        'features' => ['newsletter' => true],
        'social' => [['service' => 'instagram', 'label' => 'Instagram', 'url' => 'https://instagram.com/example']],
        'urls' => ['publicSite' => 'https://example.test'],
    ];
}
function byline_is_legacy_weekly_wildcat_installation(): bool { global $legacy_installation; return $legacy_installation; }
function byline_deployment_status(): array { global $deployment_state; return $deployment_state; }
function byline_public_manifest_diagnostic(): array { global $manifest_state; return $manifest_state; }

$options['byline_newsletter_settings_v1'] = [
    'provider' => 'kit',
    'kit' => ['apiKey' => 'kit-secret-value', 'formId' => '123'],
];
$posts[7] = (object) ['ID' => 7, 'post_status' => 'publish', 'post_title' => 'A reported story', 'post_excerpt' => 'A useful deck.', 'post_content' => '<p>Read more at https://example.test/related.</p>'];

require __DIR__ . '/../includes/integrations/http.php';
require __DIR__ . '/../includes/integrations/newsletter.php';
require __DIR__ . '/../includes/integrations/analytics.php';
require __DIR__ . '/../includes/integrations/distribution.php';

$newsletter_payload = byline_newsletter_settings_payload();
integration_assert($newsletter_payload['configured'] === true, 'Configured Kit state was not reported.');
integration_assert(strpos(json_encode($newsletter_payload), 'kit-secret-value') === false, 'Newsletter secrets leaked into the protected settings payload.');
integration_assert(empty($newsletter_payload['providers'][1]['capabilities']['sendTest']), 'Unsupported newsletter send-test capability was advertised.');

$before_invalid = get_option(BYLINE_NEWSLETTER_SETTINGS_OPTION);
$invalid = byline_newsletter_update_settings(['provider' => 'mailchimp', 'mailchimp' => ['serverPrefix' => 'not a server']]);
integration_assert(is_wp_error($invalid), 'Invalid newsletter settings did not return an error.');
integration_assert(get_option(BYLINE_NEWSLETTER_SETTINGS_OPTION) === $before_invalid, 'Invalid newsletter settings partially replaced a working configuration.');

$test_connection = byline_newsletter_test_connection('kit');
integration_assert($test_connection['ok'] === true && strpos($last_remote['url'], 'api.kit.com/v4/account') !== false, 'Kit connection test did not use the verified v4 account endpoint.');
integration_assert(($last_remote['args']['headers']['X-Kit-Api-Key'] ?? '') === 'kit-secret-value', 'Kit connection test did not send its protected API key through the request header.');
$audiences = byline_newsletter_list_audiences('kit');
integration_assert($audiences['ok'] === true && $audiences['audiences'][0]['id'] === '123', 'Kit form discovery did not normalize the official forms response.');
$signup = byline_newsletter_subscribe('reader@example.test', 'Reader', 'https://example.test/story/7/');
integration_assert($signup['ok'] === true && strpos($last_remote['url'], '/forms/123/subscribers') !== false, 'Kit signup did not use the official form subscriber endpoint.');

$options[BYLINE_NEWSLETTER_SETTINGS_OPTION] = [];
$options['wwh_kit_api_key'] = 'legacy-secret';
$options['wwh_kit_form_id'] = '123';
$legacy_installation = true;
$legacy_public = byline_newsletter_public_config();
integration_assert($legacy_public['provider'] === 'kit' && $legacy_public['formUid'] === 'd1eb6ce2f7', 'Legacy Weekly Wildcat Kit public fallback was not preserved.');
$legacy_installation = false;
$generic_public = byline_newsletter_public_config();
integration_assert(strpos(json_encode($generic_public), 'weekly-wildcat') === false, 'Generic publications inherited Weekly Wildcat Kit public configuration.');

$options[BYLINE_ANALYTICS_SETTINGS_OPTION] = [
    'provider' => 'plausible',
    'plausible' => ['apiKey' => 'plausible-secret', 'siteId' => 'example.test'],
];
$remote_count = 0;
$analytics = byline_analytics_query(['view' => 'aggregate', 'dateRange' => '7d'], true);
integration_assert($analytics['available'] === true && isset($analytics['metrics']['visitors']), 'Plausible metrics were not normalized.');
$count_after_first = $remote_count;
$cached_analytics = byline_analytics_query(['view' => 'aggregate', 'dateRange' => '7d'], false);
integration_assert($cached_analytics['cached'] === true && $remote_count === $count_after_first, 'Analytics results were not served from the normalized transient cache.');
integration_assert(byline_analytics_story_path('https://example.test/news/slug?utm_source=x') === '/news/slug', 'Analytics story URL normalization retained query state.');
$analytics_payload = byline_analytics_settings_payload();
integration_assert(strpos(json_encode($analytics_payload), 'plausible-secret') === false, 'Analytics credentials leaked into the settings payload.');

$options[BYLINE_ANALYTICS_SETTINGS_OPTION] = [
    'provider' => 'cloudflare',
    'cloudflare' => ['apiToken' => 'cloudflare-secret', 'zoneTag' => '0123456789abcdef'],
];
$cloudflare = byline_analytics_query(['view' => 'aggregate', 'dateRange' => '24h'], true);
integration_assert(isset($cloudflare['metrics']['requests']) && isset($cloudflare['metrics']['visits']), 'Cloudflare request/visit metrics were not normalized.');
integration_assert(!isset($cloudflare['metrics']['visitors']) && !isset($cloudflare['metrics']['pageviews']), 'Cloudflare unsupported visitor/pageview metrics were fabricated.');

$deployment_state = ['pending' => false, 'lastStatus' => 'HTTP 202'];
$manifest_state = ['reachable' => true, 'status' => 'HTTP 200'];
$options['byline_discord_distribution_channel_id'] = '123456789';
$options[BYLINE_NEWSLETTER_SETTINGS_OPTION] = ['provider' => 'signup-link', 'signup-link' => ['signupUrl' => 'https://newsletter.example.test/signup']];
$distribution = byline_distribution_get_state(7);
integration_assert(($distribution['channels']['website']['status'] ?? '') === 'live', 'Website distribution did not derive live state from the public manifest.');
integration_assert(($distribution['channels']['instagram']['status'] ?? '') === 'ready', 'Configured social channel was not exposed as copy-only ready state.');
$copy = byline_distribution_copy_payload(7, 'instagram');
integration_assert($copy['ok'] === true && strpos($copy['caption'], 'A reported story') !== false && strpos($copy['utmUrl'], 'utm_source=instagram') !== false, 'Copy-only social payload was not generated safely.');
$marked = byline_distribution_mark_social(7, 'instagram');
integration_assert(($marked['state']['channels']['instagram']['status'] ?? '') === 'sent', 'Copy-only social mark action did not persist independently.');

$filters['byline_distribution_discord_dispatch'] = null;
$discord_dispatches = 0;
add_action('byline_distribution_discord_requested', static function () use (&$discord_dispatches): void { $discord_dispatches++; });
$first_discord = byline_distribution_request(7, 'discord');
$action_count_after_first = $discord_dispatches;
$second_discord = byline_distribution_request(7, 'discord');
integration_assert($first_discord['pending'] === true && !empty($second_discord['idempotent']), 'Discord distribution request was not idempotent.');
integration_assert($discord_dispatches === $action_count_after_first && $discord_dispatches === 1, 'A duplicate Discord request dispatched twice.');
integration_assert(strpos(json_encode($first_discord), '/announce') === false, 'Public distribution was coupled to the internal announcements endpoint.');

$filters['byline_distribution_newsletter_dispatch'] = null;
$newsletter_dispatches = 0;
add_action('byline_distribution_newsletter_requested', static function () use (&$newsletter_dispatches): void { $newsletter_dispatches++; });
$first_newsletter = byline_distribution_request(7, 'newsletter', ['newsletterId' => 5]);
$second_newsletter = byline_distribution_request(7, 'newsletter', ['newsletterId' => 5]);
integration_assert($first_newsletter['pending'] === true && !empty($second_newsletter['idempotent']), 'Newsletter distribution request was not idempotent.');
$deployment_state = ['pending' => true, 'lastStatus' => 'HTTP 202'];
integration_assert(byline_distribution_get_state(7)['channels']['website']['status'] === 'rebuild_pending', 'Website rebuild-pending state was not derived from deployment state.');
$deployment_state = ['pending' => false, 'lastStatus' => 'Request failed'];
integration_assert(byline_distribution_get_state(7)['channels']['website']['status'] === 'build_failed', 'Website build-failed state was not derived from deployment state.');

require __DIR__ . '/../includes/integrations/registration.php';
byline_register_optional_backend_slice(['commands' => false]);
integration_assert(isset($actions['rest_api_init']) && count($actions['rest_api_init']) >= 4, 'Optional backend registration did not expose explicit REST hooks.');
integration_assert(isset($routes['meta:post:' . BYLINE_DISTRIBUTION_META]) || isset($actions['init']), 'Optional distribution registration did not expose a local meta hook.');

echo "Byline integrations backend regression passed.\n";
