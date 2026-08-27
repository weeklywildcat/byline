<?php

/**
 * Targeted coverage for the Sports Teams fatal and the one-team management
 * contract. This stays WordPress-light so it can run in the repository PHP
 * gate while exercising the same storage adapters used by the plugin.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const WWH_SPORTS_TEAM_SETTINGS_OPTION = 'wwh_sports_team_settings';

$team_options = [];

class WP_Error
{
    private $code;
    private $message;

    public function __construct(string $code, string $message)
    {
        $this->code = $code;
        $this->message = $message;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }

    public function get_error_message(): string
    {
        return $this->message;
    }
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

function teams_regression_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function add_action(...$args): void {}
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_title($value): string { return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', (string) $value)), '-'); }
function sanitize_hex_color($value): string
{
    $value = trim((string) $value);
    return preg_match('/^#[0-9a-f]{6}$/i', $value) === 1 ? strtolower($value) : '';
}
function absint($value): int { return abs((int) $value); }
function wp_unslash($value) { return $value; }
function get_option(string $key, $default = false)
{
    global $team_options;
    return array_key_exists($key, $team_options) ? $team_options[$key] : $default;
}
function update_option(string $key, $value, bool $autoload = false): bool
{
    global $team_options;
    $team_options[$key] = $value;
    return true;
}
function byline_is_legacy_weekly_wildcat_installation(): bool { return false; }
function wp_attachment_is_image(int $attachment_id): bool { return $attachment_id === 42; }
function wwh_sports_team_settings(): array
{
    $settings = get_option(WWH_SPORTS_TEAM_SETTINGS_OPTION, []);
    return is_array($settings) ? $settings : [];
}

require __DIR__ . '/../includes/sports/teams.php';

// Reproduce the exact pre-fix condition without keeping the retired constant
// name as a production/test symbol. On PHP 8 this is the confirmed fatal.
$_GET = ['page' => 'wwh-sports-team-settings'];
$deleted_constant = 'BYLINE_ADMIN_' . 'TEAMS_PAGE';
$fatal_message = '';
try {
    $fatal_probe = '$_teams_fatal_probe = isset($_GET["page"]) && sanitize_key((string) wp_unslash($_GET["page"])) === ' . $deleted_constant . ' ? "byline" : "legacy";';
    eval($fatal_probe);
} catch (Throwable $exception) {
    $fatal_message = $exception->getMessage();
}
if (strpos($fatal_message, 'Undefined constant') === false || strpos($fatal_message, $deleted_constant) === false) {
    teams_regression_fail('The regression harness no longer reproduces the confirmed deleted-constant fatal.');
}

$main_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($main_source)) {
    teams_regression_fail('Could not read the Teams production entrypoint.');
}
if (strpos($main_source, $deleted_constant) !== false) {
    teams_regression_fail('The retired Teams constant was reintroduced into the production entrypoint.');
}
$deleted_destination_state = 'byline_admin_' . 'destination';
if (strpos($main_source, $deleted_destination_state) !== false) {
    teams_regression_fail('The obsolete Teams destination hidden state was reintroduced.');
}
$index_start = strpos($main_source, 'function wwh_render_sports_team_index_table');
$index_end = strpos($main_source, 'function wwh_render_sports_team_add_form', $index_start === false ? 0 : $index_start);
$index_source = $index_start !== false && $index_end !== false ? substr($main_source, $index_start, $index_end - $index_start) : '';
if (strpos($main_source, 'byline_sports_team_settings_url()') === false
    || strpos($main_source, 'function wwh_render_sports_team_index_table') === false
    || strpos($main_source, 'function wwh_render_sports_team_add_form') === false
    || strpos($main_source, 'name="identity[') === false
    || strpos($main_source, 'name="presentation[') === false
    || strpos($main_source, 'name="teams[') !== false
    || strpos($index_source, 'wwh_render_team_media_field') !== false
    || strpos($index_source, 'wwh_media_image') !== false) {
    teams_regression_fail('The Teams renderer does not have the focused index/detail/create structure.');
}

$valid_teams = [
    'football-varsity' => ['key' => 'football-varsity', 'sport' => 'Football', 'level' => 'Varsity', 'displayName' => 'Football - Varsity', 'slug' => 'football-varsity'],
    'football-jv' => ['key' => 'football-jv', 'sport' => 'Football', 'level' => 'JV', 'displayName' => 'Football - JV', 'slug' => 'football-jv'],
];
$team_options = [
    BYLINE_SPORTS_TEAMS_OPTION => $valid_teams + [
        'broken-record' => null,
        'broken-identity' => ['key' => 'broken-identity', 'sport' => '', 'displayName' => ''],
    ],
    WWH_SPORTS_TEAM_SETTINGS_OPTION => [
        'football-varsity' => ['headerImageId' => 999, 'headerFocalX' => 'not-a-number', 'headerFocalY' => 50],
        'unknown-team' => null,
    ],
];
$raw_before_view = serialize($team_options);
$visible = byline_get_sports_teams();
$issues = byline_sports_team_integrity_records();
$issue_codes = array_column($issues, 'code');
if (!isset($visible['football-varsity'])
    || isset($visible['broken-record'])
    || !in_array('malformed_team_record', $issue_codes, true)
    || !in_array('malformed_team_identity', $issue_codes, true)
    || !in_array('invalid_team_attachment', $issue_codes, true)
    || !in_array('malformed_team_focal_point', $issue_codes, true)
    || serialize($team_options) !== $raw_before_view) {
    teams_regression_fail('Malformed historical identity/media data was not safely readable and diagnosable without a write.');
}

$team_with_invalid_media = byline_get_sports_team('football-varsity');
if (!is_array($team_with_invalid_media)
    || ($team_with_invalid_media['headerImageId'] ?? 0) !== 999
    || ($team_with_invalid_media['headerFocalPoint']['x'] ?? 0) !== 50.0) {
    teams_regression_fail('Invalid media or focal-point data was not normalized safely for the detail view.');
}

// Per-team identity writes preserve unrelated records and the stable key.
$unrelated_raw = ['key' => 'football-jv', 'sport' => 'Football', 'level' => 'JV', 'displayName' => 'Football - JV', 'slug' => 'football-jv', 'legacyField' => 'preserve-me'];
$team_options = [
    BYLINE_SPORTS_TEAMS_OPTION => [
        'football-varsity' => $valid_teams['football-varsity'],
        'football-jv' => $unrelated_raw,
        'legacy-bad' => 'keep-this-record-for-diagnostics',
    ],
    WWH_SPORTS_TEAM_SETTINGS_OPTION => [
        'football-varsity' => ['headerImageId' => 42, 'headerFocalX' => 25, 'headerFocalY' => 75, 'logoId' => 42, 'accentColor' => '#123456'],
    ],
];
$updated = byline_update_sports_team('football-varsity', ['displayName' => 'Football First Team', 'slug' => 'football-first-team']);
if (is_wp_error($updated)
    || ($updated['key'] ?? '') !== 'football-varsity'
    || ($updated['displayName'] ?? '') !== 'Football First Team'
    || ($team_options[BYLINE_SPORTS_TEAMS_OPTION]['football-jv'] ?? null) !== $unrelated_raw
    || ($team_options[BYLINE_SPORTS_TEAMS_OPTION]['legacy-bad'] ?? null) !== 'keep-this-record-for-diagnostics') {
    teams_regression_fail('Updating one team rewrote its stable key or unrelated historical registry records.');
}

$presentation = byline_update_sports_team_presentation('football-varsity', ['headerImageId' => 42, 'headerFocalX' => 12.5, 'headerFocalY' => 87.5, 'logoId' => 42, 'accentColor' => '#abcdef']);
if (is_wp_error($presentation)
    || ($team_options[WWH_SPORTS_TEAM_SETTINGS_OPTION]['football-varsity']['headerImageId'] ?? 0) !== 42
    || ($team_options[WWH_SPORTS_TEAM_SETTINGS_OPTION]['football-varsity']['headerFocalX'] ?? 0) !== 12.5
    || ($team_options[WWH_SPORTS_TEAM_SETTINGS_OPTION]['football-varsity']['logoId'] ?? 0) !== 42
    || ($team_options[WWH_SPORTS_TEAM_SETTINGS_OPTION]['football-varsity']['accentColor'] ?? '') !== '#abcdef') {
    teams_regression_fail('Selected-team branding, focal point, or accent color did not persist.');
}

$duplicate_key = byline_create_sports_team(['key' => 'football-varsity', 'sport' => 'Football', 'displayName' => 'Duplicate', 'slug' => 'duplicate']);
$duplicate_slug = byline_create_sports_team(['key' => 'new-football', 'sport' => 'Football', 'displayName' => 'Another Team', 'slug' => 'football-first-team']);
$missing_fields = byline_create_sports_team(['key' => 'new-team', 'sport' => '', 'displayName' => '', 'slug' => 'new-team']);
if (!is_wp_error($duplicate_key) || strpos($duplicate_key->get_error_message(), 'key "football-varsity"') === false
    || !is_wp_error($duplicate_slug) || strpos($duplicate_slug->get_error_message(), 'public slug "football-first-team"') === false
    || !is_wp_error($missing_fields) || strpos($missing_fields->get_error_message(), 'Sport is required.') === false || strpos($missing_fields->get_error_message(), 'Display name is required.') === false) {
    teams_regression_fail('Team creation validation did not reject duplicate or incomplete input locally.');
}

$created = byline_create_sports_team(['key' => 'volleyball-varsity', 'sport' => 'Volleyball', 'level' => 'Varsity', 'displayName' => 'Volleyball - Varsity', 'slug' => 'volleyball-varsity']);
if (is_wp_error($created) || ($created['key'] ?? '') !== 'volleyball-varsity') {
    teams_regression_fail('A valid team could not be created without branding.');
}
$archived = byline_set_sports_team_active('volleyball-varsity', false);
if (is_wp_error($archived) || !empty($archived['active']) || empty(byline_get_sports_team('volleyball-varsity'))) {
    teams_regression_fail('Archiving removed or failed to resolve the historical team.');
}

echo "Teams fatal and focused workflow regression passed.\n";
