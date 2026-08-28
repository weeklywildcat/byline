<?php

/**
 * Lightweight lifecycle harness for the independent Byline upgrade steps.
 *
 * This intentionally uses a tiny WordPress-shaped option/role harness so it
 * can run in CI without requiring a database server. The production code still
 * runs through WordPress activation/admin_init; this proves the state machine
 * does not rely on either one being the only path.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;

$byline_upgrade_test_options = [];
$byline_upgrade_test_roles = ['administrator' => null];
$byline_upgrade_test_poll_table = false;
$byline_upgrade_test_poll_should_succeed = true;
$byline_upgrade_test_secret_available = false;
$byline_upgrade_test_dbdelta_calls = 0;
$byline_upgrade_test_rewrite_flushes = 0;

class WP_Error
{
    private string $code;

    public function __construct(string $code = '')
    {
        $this->code = $code;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }
}

class WP_Role
{
    public array $capabilities = [];

    public function add_cap(string $capability): void
    {
        $this->capabilities[$capability] = true;
    }

    public function has_cap(string $capability): bool
    {
        return !empty($this->capabilities[$capability]);
    }
}

function byline_upgrade_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function add_action(...$args): void
{
}

function apply_filters(string $name, $value, ...$args)
{
    return $value;
}

function get_option(string $key, $default = false)
{
    global $byline_upgrade_test_options;
    return array_key_exists($key, $byline_upgrade_test_options) ? $byline_upgrade_test_options[$key] : $default;
}

function add_option(string $key, $value, string $deprecated = '', $autoload = 'yes'): bool
{
    global $byline_upgrade_test_options;
    if (array_key_exists($key, $byline_upgrade_test_options)) {
        return false;
    }
    $byline_upgrade_test_options[$key] = $value;
    return true;
}

function update_option(string $key, $value, $autoload = null): bool
{
    global $byline_upgrade_test_options;
    $byline_upgrade_test_options[$key] = $value;
    return true;
}

function delete_option(string $key): bool
{
    global $byline_upgrade_test_options;
    unset($byline_upgrade_test_options[$key]);
    return true;
}

function get_role(string $role_name): ?WP_Role
{
    global $byline_upgrade_test_roles;
    if ($role_name !== 'administrator') {
        return null;
    }
    if (!$byline_upgrade_test_roles[$role_name] instanceof WP_Role) {
        $byline_upgrade_test_roles[$role_name] = new WP_Role();
    }
    return $byline_upgrade_test_roles[$role_name];
}

function byline_poll_add_role_capabilities(): void
{
    get_role('administrator')->add_cap('edit_byline_polls');
}

function byline_poll_votes_table_exists(): bool
{
    global $byline_upgrade_test_poll_table;
    return $byline_upgrade_test_poll_table;
}

function byline_poll_ensure_schema(): bool
{
    global $byline_upgrade_test_poll_table, $byline_upgrade_test_poll_should_succeed, $byline_upgrade_test_dbdelta_calls;
    $byline_upgrade_test_dbdelta_calls++;
    if ($byline_upgrade_test_poll_should_succeed) {
        $byline_upgrade_test_poll_table = true;
    }
    return $byline_upgrade_test_poll_table;
}

function byline_poll_signing_secret_source(): string
{
    global $byline_upgrade_test_secret_available;
    return $byline_upgrade_test_secret_available ? 'generated' : 'missing';
}

function byline_poll_signing_secret(): string
{
    global $byline_upgrade_test_secret_available;
    $byline_upgrade_test_secret_available = true;
    return 'test-only-secret-not-emitted';
}

function byline_migrate_sports_teams(): bool
{
    if (get_option(BYLINE_SPORTS_TEAMS_OPTION, null) === null) {
        update_option(BYLINE_SPORTS_TEAMS_OPTION, [], false);
    }
    update_option(BYLINE_SPORTS_TEAMS_MIGRATION_OPTION, BYLINE_SPORTS_TEAMS_MIGRATION_VERSION, false);
    return true;
}

function byline_migrate_roster_identities(): bool
{
    return true;
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
    return new DateTimeZone('America/New_York');
}

function get_bloginfo(string $field): string
{
    return $field === 'name' ? 'Example Gazette' : 'Independent community journalism.';
}

function home_url(string $path = ''): string
{
    return 'https://cms.example.test' . $path;
}

function wp_parse_url(string $url, int $component = -1)
{
    return parse_url($url, $component);
}

function untrailingslashit(string $value): string
{
    return rtrim($value, '/');
}

function sanitize_text_field($value): string
{
    return trim(strip_tags((string) $value));
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_title(string $value): string
{
    return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $value)), '-');
}

function esc_url_raw(string $value, array $protocols = []): string
{
    if (filter_var($value, FILTER_VALIDATE_URL) === false) {
        return '';
    }
    $scheme = parse_url($value, PHP_URL_SCHEME);
    return $protocols === [] || in_array($scheme, $protocols, true) ? $value : '';
}

function flush_rewrite_rules(bool $hard = true): void
{
    global $byline_upgrade_test_rewrite_flushes;
    $byline_upgrade_test_rewrite_flushes++;
}

function wp_clear_scheduled_hook(string $hook): void
{
}

require __DIR__ . '/../includes/core/compatibility.php';
require __DIR__ . '/../includes/core/capabilities.php';
require __DIR__ . '/../includes/publication/config.php';

const BYLINE_POLL_SCHEMA_VERSION_OPTION = 'byline_poll_schema_version';
const BYLINE_POLL_SCHEMA_VERSION = 1;
const BYLINE_SPORTS_TEAMS_OPTION = 'byline_sports_teams';
const BYLINE_SPORTS_TEAMS_MIGRATION_OPTION = 'byline_sports_teams_migration_version';
const BYLINE_SPORTS_TEAMS_MIGRATION_VERSION = 1;
const BYLINE_ROSTER_IDENTITIES_VERSION_OPTION = 'byline_roster_identities_version';
const BYLINE_ROSTER_IDENTITIES_VERSION = 1;
const BYLINE_WEEKLY_PAGE_MIGRATION_OPTION = 'byline_weekly_page_migration_version';
const BYLINE_WEEKLY_PAGE_MIGRATION_VERSION = 2;

require __DIR__ . '/../includes/core/upgrade.php';

// Fresh install: every independent resource runs once and the resulting
// markers make a second coordinator pass a no-op.
$first = byline_maybe_upgrade(true);
byline_upgrade_test_assert($first['failed'] === [], 'Fresh installation should complete without failed upgrade steps.');
byline_upgrade_test_assert(count($first['ran']) === 7, 'Fresh installation should run all seven independent steps.');
byline_upgrade_test_assert(get_option(BYLINE_PUBLICATION_OPTION, null) !== null, 'Fresh installation should seed publication configuration.');
byline_upgrade_test_assert(get_option(BYLINE_PUBLICATION_REVISION_OPTION, null) === 1, 'Fresh installation should establish the publication revision marker.');
byline_upgrade_test_assert(get_option(BYLINE_CORE_SCHEMA_VERSION_OPTION, 0) === BYLINE_CORE_SCHEMA_VERSION, 'Core schema marker was not recorded.');
byline_upgrade_test_assert(get_option(BYLINE_CAPABILITIES_VERSION_OPTION, 0) === BYLINE_CAPABILITIES_VERSION, 'Capability marker was not recorded.');
byline_upgrade_test_assert(get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) === BYLINE_POLL_SCHEMA_VERSION, 'Poll schema marker was not recorded.');
byline_upgrade_test_assert(byline_poll_votes_table_exists(), 'Fresh installation should make poll storage observable.');
byline_upgrade_test_assert(byline_poll_signing_secret_source() === 'generated', 'Fresh installation should initialize the signing-secret source.');
byline_upgrade_test_assert(get_option(BYLINE_SPORTS_TEAMS_OPTION, null) === [], 'Generic publications should not receive sample sports data.');
byline_upgrade_test_assert(get_role('administrator')->has_cap(BYLINE_MANAGE_CAPABILITY), 'Administrators should receive Byline management capability.');

$second = byline_maybe_upgrade(true);
byline_upgrade_test_assert($second['failed'] === [] && $second['ran'] === [], 'A repeated upgrade pass should be idempotent.');
byline_upgrade_test_assert($byline_upgrade_test_dbdelta_calls === 1, 'Poll DDL must not run again once the table and marker are current.');

// Existing values survive a code-default change or a repair pass.
$existing_publication = get_option(BYLINE_PUBLICATION_OPTION);
$existing_publication['identity']['name'] = 'Existing Gazette';
update_option(BYLINE_PUBLICATION_OPTION, $existing_publication, false);
update_option(BYLINE_PUBLICATION_REVISION_OPTION, 47, false);
update_option(BYLINE_CORE_SCHEMA_VERSION_OPTION, 0, false);
byline_maybe_upgrade(true);
byline_upgrade_test_assert(get_option(BYLINE_PUBLICATION_OPTION)['identity']['name'] === 'Existing Gazette', 'Upgrade must preserve an existing publication configuration.');
byline_upgrade_test_assert(get_option(BYLINE_PUBLICATION_REVISION_OPTION) === 47, 'Upgrade must preserve an existing publication revision.');

// Failed work leaves its previous marker intact, records a safe operator-facing
// message, and succeeds on a later retry without needing reactivation.
$byline_upgrade_test_poll_should_succeed = false;
$byline_upgrade_test_poll_table = false;
update_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0, false);
$failed = byline_maybe_upgrade(true);
byline_upgrade_test_assert(in_array('polls', $failed['failed'], true), 'A failed poll upgrade should be reported as failed.');
byline_upgrade_test_assert((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) === 0, 'A failed poll upgrade must not advance its schema marker.');
$failure = byline_upgrade_failure();
byline_upgrade_test_assert(($failure['message'] ?? '') === 'Poll database schema could not be upgraded.', 'Failed upgrades need a safe actionable message.');
byline_upgrade_test_assert(strpos(json_encode($failure), 'CREATE TABLE') === false, 'Failed upgrade details must not expose raw SQL.');

$byline_upgrade_test_poll_should_succeed = true;
$retried = byline_maybe_upgrade(true);
byline_upgrade_test_assert($retried['failed'] === [], 'A failed upgrade should be retryable on a later admin request.');
byline_upgrade_test_assert((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) === BYLINE_POLL_SCHEMA_VERSION, 'A successful retry should advance the poll marker.');
byline_upgrade_test_assert(byline_upgrade_failure() === [], 'A successful retry should clear the recorded failure.');

byline_activate_plugin();
byline_upgrade_test_assert((int) get_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION, 0) === 1, 'Activation should defer rewrite flushing until post-type registration.');
byline_maybe_flush_rewrite_rules();
byline_upgrade_test_assert($byline_upgrade_test_rewrite_flushes === 1, 'Rewrite rules should flush once when activation marked them pending.');
byline_upgrade_test_assert((int) get_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION, 0) === 0, 'Successful rewrite flushing should clear the pending marker.');

echo "Byline upgrade coordinator regression passed.\n";
