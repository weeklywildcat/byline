<?php

define('ABSPATH', __DIR__ . '/../');
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const BYLINE_REST_NAMESPACE = 'byline/v1';
const WWH_REST_NAMESPACE = 'weekly-wildcat/v1';

$sports_options = [];
$legacy_install = false;

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_post_type(...$args): void {}
function register_post_meta(...$args): void {}
function register_rest_route(...$args): void {}
function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}
function sanitize_text_field($value): string
{
    return trim(strip_tags((string) $value));
}
function sanitize_title($value): string
{
    return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', (string) $value)), '-');
}
function absint($value): int
{
    return abs((int) $value);
}
function get_post_type(int $post_id): string
{
    return $post_id === 42 ? 'attachment' : '';
}
function wp_attachment_is_image(int $post_id): bool
{
    return $post_id === 42;
}
function get_option(string $key, $default = false)
{
    global $sports_options;
    return array_key_exists($key, $sports_options) ? $sports_options[$key] : $default;
}
function update_option(string $key, $value, bool $autoload = false): bool
{
    global $sports_options;
    $sports_options[$key] = $value;
    return true;
}
function byline_is_legacy_weekly_wildcat_installation(): bool
{
    global $legacy_install;
    return $legacy_install;
}
function wwh_sanitize_sport_key($value): string
{
    return sanitize_key($value);
}
function wwh_sports_team_options(): array
{
    return byline_get_sports_teams();
}
function wp_generate_uuid4(): string
{
    static $sequence = 0;
    $sequence++;
    return sprintf('00000000-0000-4000-8000-%012d', $sequence);
}

require __DIR__ . '/../includes/sports/teams.php';
require __DIR__ . '/../includes/sports/domain.php';
require __DIR__ . '/../includes/sports-rosters.php';

function sports_cohesion_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

if (byline_migrate_sports_teams() !== true || byline_get_sports_teams() !== []) {
    sports_cohesion_fail('A generic Byline sports registry should start empty and migrate successfully.');
}

byline_replace_sports_teams([
    ['key' => 'football-varsity', 'sport' => 'Football', 'level' => 'Varsity', 'displayName' => 'Football Varsity', 'slug' => 'football-varsity'],
    ['key' => 'football-jv', 'sport' => 'Football', 'level' => 'JV', 'displayName' => 'Football JV', 'slug' => 'football-jv'],
]);

$renamed = byline_replace_sports_teams([
    ['key' => 'football-varsity', 'sport' => 'Football', 'level' => 'Varsity', 'displayName' => 'Football First Team', 'slug' => 'football-varsity'],
]);

if (($renamed['football-varsity']['displayName'] ?? '') !== 'Football First Team'
    || ($renamed['football-jv']['active'] ?? true) !== false
    || byline_get_sports_team('football-varsity')['key'] !== 'football-varsity') {
    sports_cohesion_fail('Team display-name changes must preserve stable keys, and omitted teams must remain inactive history.');
}

$slug_errors = byline_validate_sports_teams([
    ['key' => 'girls-soccer', 'sport' => 'Soccer', 'displayName' => 'Girls Soccer', 'slug' => 'soccer'],
    ['key' => 'boys-soccer', 'sport' => 'Soccer', 'displayName' => 'Boys Soccer', 'slug' => 'soccer'],
]);

if ($slug_errors === []) {
    sports_cohesion_fail('Duplicate public team slugs must be rejected before they can collide in the archive.');
}

if (byline_sports_normalize_season('2026/2027') !== '2026-27'
    || byline_sports_season_storage_values('2026/2027') !== ['2026-27', '2026-2027', '2026/2027', '2026/27']
    || byline_sports_normalize_season('2026-28') !== ''
    || byline_sports_season_for_date('2026-06-30T23:59') !== '2025-26'
    || byline_sports_season_for_date('2026-07-01T00:00') !== '2026-27') {
    sports_cohesion_fail('Sports seasons must use one canonical school-year format and one date boundary.');
}

$players = wwh_sanitize_roster_players([
    ['id' => 'ath_returning', 'name' => 'Jordan Lee', 'number' => '7'],
    ['id' => 'ath_returning', 'name' => 'Jordan Lee', 'number' => '21'],
    ['name' => 'Jordan Lee', 'number' => '30'],
]);

if (count($players) !== 3
    || $players[0]['id'] !== 'ath_returning'
    || $players[1]['id'] === 'ath_returning'
    || count(array_unique(array_column($players, 'name'))) !== 1) {
    sports_cohesion_fail('Roster athletes need stable opaque IDs while allowing duplicate display names.');
}

$staff = wwh_sanitize_roster_staff([
    ['id' => 'staff_returning', 'name' => 'Alex Coach', 'role' => 'Head Coach', 'imageId' => 42],
    ['id' => 'staff_returning', 'name' => 'Alex Coach', 'role' => 'Assistant Coach', 'imageId' => 999],
]);

if (count($staff) !== 2
    || $staff[0]['id'] !== 'staff_returning'
    || $staff[1]['id'] === 'staff_returning'
    || $staff[0]['imageId'] !== 42
    || $staff[1]['imageId'] !== 0) {
    sports_cohesion_fail('Roster staff need stable opaque IDs and validated local attachment IDs.');
}

$legacy_read = wwh_sanitize_roster_staff([['name' => 'Legacy Coach', 'role' => 'Coach']], false);
if (($legacy_read[0]['id'] ?? 'unexpected') !== '') {
    sports_cohesion_fail('Read-only roster normalization must not generate random identities.');
}

$next_game = byline_sports_next_game([
    ['id' => 1, 'status' => 'upcoming', 'startDate' => ''],
    ['id' => 2, 'status' => 'upcoming', 'startDate' => '2026-09-03T19:00'],
    ['id' => 3, 'status' => 'upcoming', 'startDate' => '2026-09-02T19:00'],
]);
$previous_game = byline_sports_previous_game([
    ['id' => 4, 'status' => 'final', 'startDate' => ''],
    ['id' => 5, 'status' => 'final', 'startDate' => '2026-08-20T19:00'],
    ['id' => 6, 'status' => 'tie', 'startDate' => '2026-08-21T19:00'],
]);
if (($next_game['id'] ?? 0) !== 3 || ($previous_game['id'] ?? 0) !== 6) {
    sports_cohesion_fail('Sports context must choose the nearest dated upcoming game and latest dated result even when TBA or input order comes first.');
}

$valid_csv = wwh_parse_sports_roster_csv(implode("\n", [
    'team_key,team_name,season,row_type,athlete_id,name,number,position,grade,role,sort_order',
    'football-varsity,Football First Team,2026/2027,athlete,ath_returning,Jordan Lee,7,QB,12,,2',
    'football-varsity,Football First Team,2026/2027,athlete,ath_second,Jordan Lee,21,WR,10,,1',
]));

if ($valid_csv['errors'] !== []
    || ($valid_csv['groups']['football-varsity|2026-27']['players'][0]['id'] ?? '') !== 'ath_second') {
    sports_cohesion_fail('Roster CSV import must normalize seasons, preserve IDs, and preserve explicit order.');
}

$staff_csv = wwh_parse_sports_roster_csv(implode("\n", [
    'team_key,season,row_type,row_id,name,role,image_id,sort_order',
    'football-varsity,2026-27,staff,staff_returning,Alex Coach,Head Coach,42,1',
    'football-varsity,2026-27,staff,staff_returning,Jordan Manager,Student Manager,999,2',
]));
$staff_rows = $staff_csv['groups']['football-varsity|2026-27']['staff'] ?? [];
if ($staff_csv['errors'] !== []
    || count($staff_csv['warnings']) !== 2
    || ($staff_rows[0]['id'] ?? '') !== 'staff_returning'
    || ($staff_rows[1]['id'] ?? '') === 'staff_returning'
    || ($staff_rows[0]['imageId'] ?? 0) !== 42
    || ($staff_rows[1]['imageId'] ?? 1) !== 0) {
    sports_cohesion_fail('Roster CSV must preserve staff IDs/photos and deliberately warn when regenerating invalid values.');
}

$unknown_csv = wwh_parse_sports_roster_csv(implode("\n", [
    'team_key,season,row_type,name',
    'made-up-team,2026-27,athlete,Unknown Team Player',
]));

if ($unknown_csv['errors'] === []) {
    sports_cohesion_fail('Roster imports must fail clearly for unknown team keys instead of guessing or creating teams.');
}

echo "Sports cohesion regression passed.\n";
