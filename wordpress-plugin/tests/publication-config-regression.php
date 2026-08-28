<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;

class WP_Error
{
    private string $code;

    public function __construct(string $code, string $message = '', array $data = [])
    {
        $this->code = $code;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }
}

require __DIR__ . '/../includes/core/compatibility.php';

$registered_routes = [];
$can_manage_byline = false;
$test_home_url = 'https://cms.weeklywildcat.com';

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'PUT';
}

function add_action(...$args): void
{
}

function __($message, $domain = ''): string
{
    return (string) $message;
}

function register_rest_route(string $namespace, string $route, array $definition): void
{
    global $registered_routes;
    $registered_routes[$namespace . $route] = $definition;
}

function current_user_can(string $capability): bool
{
    global $can_manage_byline;
    return $capability === BYLINE_MANAGE_CAPABILITY && $can_manage_byline;
}

function get_locale(): string
{
    return 'en_US';
}

function wp_timezone_string(): string
{
    return 'America/New_York';
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('UTC');
}

function home_url(string $path = ''): string
{
    global $test_home_url;
    return $test_home_url . $path;
}

function wp_parse_url(string $url, int $component = -1) { return parse_url($url, $component); }
function get_bloginfo(string $field): string { return $field === 'name' ? 'Example Gazette' : 'Local student journalism.'; }

function untrailingslashit(string $value): string
{
    return rtrim($value, '/');
}

function sanitize_text_field(string $value): string
{
    return trim(strip_tags($value));
}

function sanitize_key(string $value): string
{
    return strtolower(preg_replace('/[^a-z0-9_-]/i', '', $value) ?? '');
}

function sanitize_title(string $value): string
{
    return trim(strtolower(preg_replace('/[^a-z0-9]+/i', '-', $value) ?? ''), '-');
}

function esc_url_raw(string $value, array $protocols = []): string
{
    if (filter_var($value, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = parse_url($value, PHP_URL_SCHEME);
    return $protocols === [] || in_array($scheme, $protocols, true) ? $value : '';
}

require __DIR__ . '/../includes/publication/config.php';

$defaults = byline_default_publication_config();
if ($defaults['identity']['name'] !== 'Weekly Wildcat'
    || $defaults['locale'] !== 'en-US'
    || $defaults['timezone'] !== 'America/New_York'
    || $defaults['appearance']['theme'] !== 'weekly-wildcat') {
    fwrite(STDERR, "Weekly Wildcat publication defaults changed unexpectedly.\n");
    exit(1);
}

$test_home_url = 'https://cms.example.test';
$generic_defaults = byline_default_publication_config();
if ($generic_defaults['identity']['name'] !== 'Example Gazette'
    || $generic_defaults['appearance']['theme'] !== 'byline-modern'
    || $generic_defaults['navigation'] !== []
    || $generic_defaults['features']['sports'] !== false
    || strpos(json_encode($generic_defaults), 'Weekly Wildcat') !== false) {
    fwrite(STDERR, "A new Byline installation inherited Weekly Wildcat identity.\n");
    exit(1);
}
$test_home_url = 'https://cms.weeklywildcat.com';

$normalized = byline_normalize_publication_config([
    'schemaVersion' => 1,
    'identity' => [
        'name' => '<strong>North Star News</strong>',
        'shortName' => 'North Star',
        'description' => 'Independent student reporting.',
        'organizationName' => 'North Star Academy',
    ],
    'locale' => 'fr_CA',
    'timezone' => 'Europe/Paris',
    'urls' => ['publicSite' => 'javascript:alert(1)', 'cms' => 'https://cms.example.test/'],
    'appearance' => [
        'theme' => 'North Star!',
        'tokenOverrides' => [
            'accent' => '#008b95',
            'background' => 'url(https://tracker.example.test/pixel)',
            'fontBody' => 'Arial; background: red',
            'evil' => '<script>alert(1)</script>',
        ],
    ],
    'sections' => [
        ['name' => '<b>Campus Life</b>', 'slug' => 'Campus Life', 'description' => '<em>Student news</em>', 'active' => true],
        ['name' => '', 'slug' => 'invalid'],
    ],
    'navigation' => [
        ['label' => '<b>Campus</b>', 'url' => '/campus/', 'locations' => ['header', 'footer', 'evil'], 'group' => 'Sections'],
        ['label' => 'Unsafe', 'url' => 'javascript:alert(1)'],
    ],
    'social' => [
        ['service' => 'Blue Sky', 'label' => 'Bluesky', 'url' => 'https://bsky.app/profile/example.test'],
    ],
    'features' => ['sports' => false, 'events' => 'false', 'unknown' => true],
    'deployHookUrl' => 'https://secret.example.test/hook',
]);

if ($normalized['identity']['name'] !== 'North Star News'
    || $normalized['locale'] !== 'fr-CA'
    || $normalized['timezone'] !== 'Europe/Paris'
    || $normalized['urls']['publicSite'] !== $defaults['urls']['publicSite']
    || $normalized['appearance']['theme'] !== 'weekly-wildcat'
    || $normalized['appearance']['tokenOverrides'] !== ['accent' => '#008b95']
    || $normalized['sections'] !== [['name' => 'Campus Life', 'slug' => 'campus-life', 'description' => 'Student news', 'active' => true]]
    || $normalized['navigation'] !== [['label' => 'Campus', 'url' => '/campus/', 'locations' => ['header', 'footer'], 'group' => 'Sections']]
    || $normalized['social'][0]['service'] !== 'bluesky'
    || $normalized['features']['sports'] !== false
    || $normalized['features']['events'] !== false
    || array_key_exists('unknown', $normalized['features'])
    || array_key_exists('deployHookUrl', $normalized)) {
    fwrite(STDERR, "Publication normalization did not enforce the public schema.\n");
    exit(1);
}

$retained_feature_data = byline_normalize_publication_config([
    'sections' => [
        ['name' => 'Sports', 'slug' => 'sports', 'description' => '', 'active' => true],
    ],
    'navigation' => [
        ['label' => 'Sports', 'url' => '/sports/', 'locations' => ['header'], 'feature' => 'sports'],
    ],
    'features' => ['sports' => false],
]);
if ($retained_feature_data['features']['sports'] !== false
    || $retained_feature_data['sections'][0]['slug'] !== 'sports'
    || $retained_feature_data['navigation'][0]['url'] !== '/sports/'
    || $retained_feature_data['navigation'][0]['feature'] !== 'sports') {
    fwrite(STDERR, "Disabling a feature must retain its stored sections and navigation data.\n");
    exit(1);
}

$invalid = $defaults;
$invalid['urls']['publicSite'] = 'javascript:alert(1)';
$invalid_result = byline_validate_publication_config($invalid);
if (!$invalid_result instanceof WP_Error
    || $invalid_result->get_error_code() !== 'byline_invalid_publication_config') {
    fwrite(STDERR, "Invalid publication data did not return the stable validation error code.\n");
    exit(1);
}

byline_register_publication_routes();
$route = $registered_routes['byline/v1/publication'] ?? null;
if (!is_array($route) || count($route) !== 2) {
    fwrite(STDERR, "Publication REST routes were not registered.\n");
    exit(1);
}

$put_permission = $route[1]['permission_callback'];
if ($put_permission() !== false) {
    fwrite(STDERR, "Publication writes must reject users without manage_byline.\n");
    exit(1);
}
$can_manage_byline = true;
if ($put_permission() !== true) {
    fwrite(STDERR, "Publication writes must allow users with manage_byline.\n");
    exit(1);
}

echo "Byline publication configuration regression passed.\n";
