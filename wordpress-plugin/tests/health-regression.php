<?php

/**
 * Health model, Site Health adapter, and support-report redaction checks.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_PUBLICATION_OPTION = 'byline_publication_config_v1';
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;
const BYLINE_CORE_SCHEMA_VERSION_OPTION = 'byline_core_schema_version';
const BYLINE_CORE_SCHEMA_VERSION = 1;
const BYLINE_CAPABILITIES_VERSION_OPTION = 'byline_capabilities_version';
const BYLINE_CAPABILITIES_VERSION = 2;
const BYLINE_POLL_SCHEMA_VERSION_OPTION = 'byline_poll_schema_version';
const BYLINE_POLL_SCHEMA_VERSION = 1;
const BYLINE_SPORTS_TEAMS_OPTION = 'byline_sports_teams';
const BYLINE_SPORTS_TEAMS_MIGRATION_OPTION = 'byline_sports_teams_migration_version';
const BYLINE_WEEKLY_PAGE_MIGRATION_OPTION = 'byline_weekly_page_migration_version';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_DESIGN_POST_TYPE = 'byline_design';
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';

$byline_health_test_options = [
    BYLINE_CORE_SCHEMA_VERSION_OPTION => BYLINE_CORE_SCHEMA_VERSION,
    BYLINE_CAPABILITIES_VERSION_OPTION => BYLINE_CAPABILITIES_VERSION,
    BYLINE_POLL_SCHEMA_VERSION_OPTION => BYLINE_POLL_SCHEMA_VERSION,
    BYLINE_SPORTS_TEAMS_OPTION => [],
    BYLINE_SPORTS_TEAMS_MIGRATION_OPTION => 1,
    BYLINE_WEEKLY_PAGE_MIGRATION_OPTION => 1,
    BYLINE_PUBLICATION_OPTION => [],
];
$byline_health_test_features = [
    'polls' => false,
    'sports' => false,
    'events' => false,
    'newsletter' => false,
    'discord' => false,
];
$byline_health_test_publication = [
    'schemaVersion' => 1,
    'identity' => [
        'name' => 'Example Gazette',
        'shortName' => 'Gazette',
        'description' => 'Independent community journalism.',
    ],
    'urls' => [
        'publicSite' => 'https://example.test',
        'cms' => 'https://cms.example.test',
    ],
    'branding' => [
        'masthead' => ['url' => 'https://example.test/masthead.svg'],
        'logo' => ['url' => 'https://example.test/logo.svg'],
    ],
    'appearance' => ['theme' => 'byline-modern'],
    'features' => [],
];
$byline_health_test_poll_table = true;
$byline_health_test_secret = 'generated';
$byline_health_test_routes = [
    '/byline/v1/capabilities/protocol' => true,
    '/byline/v1/publication' => true,
    '/byline/v1/designs' => true,
    '/byline/v1/admin/diagnostics' => true,
    '/byline/v1/admin/health' => true,
];
$byline_health_test_design = (object) [
    'post_status' => 'publish',
    'post_content' => '{"schemaVersion":1}',
];
$byline_health_test_options[BYLINE_PUBLICATION_OPTION] = $byline_health_test_publication;

class WP_Error
{
    private string $code;

    public function __construct(string $code = 'test_error')
    {
        $this->code = $code;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }
}

class BylineHealthTestRole
{
    public array $capabilities = [
        'manage_byline' => true,
        'edit_byline_design' => true,
        'publish_byline_design' => true,
        'manage_byline_integrations' => true,
    ];

    public function has_cap(string $capability): bool
    {
        return !empty($this->capabilities[$capability]);
    }
}

class BylineHealthTestRestServer
{
    public function get_routes(): array
    {
        global $byline_health_test_routes;
        return array_fill_keys(array_keys(array_filter($byline_health_test_routes)), []);
    }
}

function byline_health_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function add_action(...$args): void
{
}

function add_filter(...$args): void
{
}

function apply_filters(string $name, $value, ...$args)
{
    return $value;
}

function register_rest_route(...$args): void
{
}

function rest_ensure_response($value)
{
    return $value;
}

function get_option(string $key, $default = false)
{
    global $byline_health_test_options;
    return array_key_exists($key, $byline_health_test_options) ? $byline_health_test_options[$key] : $default;
}

function byline_get_publication_config(): array
{
    global $byline_health_test_publication, $byline_health_test_features;
    $publication = $byline_health_test_publication;
    $publication['features'] = $byline_health_test_features;
    return $publication;
}

function byline_publication_theme_ids(): array
{
    return ['byline-editorial', 'byline-magazine', 'byline-modern', 'weekly-wildcat'];
}

function byline_capabilities(): array
{
    return ['manage_byline', 'edit_byline_design', 'publish_byline_design', 'manage_byline_integrations'];
}

function get_role(string $name): ?BylineHealthTestRole
{
    return $name === 'administrator' ? new BylineHealthTestRole() : null;
}

function byline_poll_votes_table_exists(): bool
{
    global $byline_health_test_poll_table;
    return $byline_health_test_poll_table;
}

function byline_poll_signing_secret_source(): string
{
    global $byline_health_test_secret;
    return $byline_health_test_secret;
}

function post_type_exists(string $post_type): bool
{
    return in_array($post_type, [WWH_SPORTS_GAME_POST_TYPE, WWH_SPORTS_ROSTER_POST_TYPE, WWH_SCHOOL_EVENT_POST_TYPE], true);
}

function rest_get_server(): BylineHealthTestRestServer
{
    return new BylineHealthTestRestServer();
}

function byline_get_design_post(string $template)
{
    global $byline_health_test_design;
    return $byline_health_test_design;
}

function get_post($post_id)
{
    return $post_id;
}

function byline_validate_design_document(array $document, string $template)
{
    return true;
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function wp_parse_url(string $url, int $component = -1)
{
    return parse_url($url, $component);
}

function esc_url_raw(string $value, array $protocols = []): string
{
    if (filter_var($value, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = parse_url($value, PHP_URL_SCHEME);
    return $protocols === [] || in_array($scheme, $protocols, true) ? $value : '';
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function esc_url(string $value): string
{
    return $value;
}

function esc_html($value): string
{
    return (string) $value;
}

function esc_html__($value, $domain = ''): string
{
    return (string) $value;
}

require __DIR__ . '/../includes/core/health.php';
require __DIR__ . '/../includes/core/diagnostics.php';

$healthy_checks = byline_get_health_checks();
$asset_checks = array_values(array_filter($healthy_checks, static fn(array $check): bool => $check['id'] === 'plugin_assets'));
$asset_presence = byline_expected_admin_asset_presence();
$expected_asset_status = in_array(false, $asset_presence, true)
    ? BYLINE_HEALTH_STATUS_CRITICAL
    : BYLINE_HEALTH_STATUS_GOOD;
byline_health_test_assert(
    ($asset_checks[0]['status'] ?? '') === $expected_asset_status,
    'Plugin asset health should reflect whether compiled assets exist in the current environment.'
);

$healthy_non_asset_checks = array_values(array_filter($healthy_checks, static fn(array $check): bool => $check['id'] !== 'plugin_assets'));
$healthy_summary = byline_health_summary($healthy_non_asset_checks);
byline_health_test_assert($healthy_summary['status'] === BYLINE_HEALTH_STATUS_GOOD, 'A healthy installation should report an all-good health summary.');
byline_health_test_assert(($healthy_summary['critical'] ?? 0) === 0, 'A healthy installation should have no critical checks.');
byline_health_test_assert(!array_filter($healthy_checks, static fn(array $check): bool => $check['id'] === 'poll_storage'), 'Disabled Polls must not report missing vote storage.');

// Missing storage and a stale marker are distinct operator-visible failures.
$byline_health_test_features['polls'] = true;
$byline_health_test_poll_table = false;
$byline_health_test_secret = 'missing';
$byline_health_test_options[BYLINE_POLL_SCHEMA_VERSION_OPTION] = 0;
$poll_checks = byline_get_health_checks();
$poll_by_id = array_column($poll_checks, null, 'id');
byline_health_test_assert(($poll_by_id['poll_storage']['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL, 'Missing poll storage should be critical.');
byline_health_test_assert(($poll_by_id['poll_secret']['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL, 'Missing poll signing secret should be critical.');
byline_health_test_assert(byline_health_summary($poll_checks)['status'] === BYLINE_HEALTH_STATUS_CRITICAL, 'Poll failures should make the overall health summary critical.');

$byline_health_test_poll_table = true;
$byline_health_test_secret = 'generated';
$stale_checks = byline_get_health_checks();
$stale_by_id = array_column($stale_checks, null, 'id');
byline_health_test_assert(($stale_by_id['poll_storage']['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL, 'A stale poll schema marker should remain visible even when the table exists.');

// An invalid stored publication document is diagnosed without changing it.
$invalid_publication = $byline_health_test_publication;
$invalid_publication['identity']['name'] = '';
$invalid_publication['urls']['publicSite'] = 'javascript:invalid';
$byline_health_test_options[BYLINE_PUBLICATION_OPTION] = ['schemaVersion' => 99];
$invalid_checks = byline_health_publication_checks($invalid_publication);
$invalid_by_id = array_column($invalid_checks, null, 'id');
byline_health_test_assert(($invalid_by_id['publication_config']['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL, 'An unsupported publication schema should be critical.');
byline_health_test_assert(($invalid_by_id['publication_identity']['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL, 'An incomplete publication identity should be critical.');

$site_health = byline_site_health_test();
byline_health_test_assert(isset($site_health['status'], $site_health['description'], $site_health['actions']), 'Site Health should expose a native direct test result.');

$secret = 'known-secret-value-that-must-not-appear';
$report_input = [
    'pluginVersion' => '0.2.8',
    'wordpressVersion' => '6.8',
    'phpVersion' => '8.5.9',
    'siteUrl' => 'https://example.test',
    'homeUrl' => 'https://example.test',
    'theme' => ['id' => 'byline-modern'],
    'enabledModules' => ['events'],
    'schemaVersions' => ['core' => 1, 'polls' => 0],
    'assetPresence' => ['adminScript' => true],
    'tablePresence' => ['pollVotes' => false],
    'routePresence' => ['health' => true],
    'cronAvailable' => true,
    'healthChecks' => [['status' => 'critical', 'label' => 'Poll database', 'summary' => 'Missing']],
    'deployment' => ['lastStatus' => 'Not triggered yet', 'hookUrl' => 'https://private.example.test/' . $secret],
    'privateSecret' => $secret,
];
$report = byline_diagnostics_support_report($report_input);
$report_again = byline_diagnostics_support_report($report_input);
byline_health_test_assert(strpos($report, $secret) === false, 'Support reports must redact secrets and private hook URLs.');
byline_health_test_assert(strpos($report, 'Schema versions:') !== false && strpos($report, 'Health checks:') !== false, 'Support reports should include deterministic operational sections.');
byline_health_test_assert($report === $report_again, 'Support reports should be deterministic for the same site state.');

echo "Byline health regression passed.\n";
