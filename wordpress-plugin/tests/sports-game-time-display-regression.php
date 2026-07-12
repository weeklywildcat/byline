<?php

define('ABSPATH', __DIR__ . '/../');
define('WP_PLUGIN_DIR', dirname(__DIR__));
define('WPMU_PLUGIN_DIR', dirname(__DIR__));
define('WP_DEBUG', false);

function add_action(...$args): void
{
}

function add_filter(...$args): void
{
}

function apply_filters(string $hook_name, $value, ...$args)
{
    return $value;
}

function did_action(string $hook_name): int
{
    return 0;
}

function register_deactivation_hook(...$args): void
{
}

function wp_parse_url(string $url, int $component = -1)
{
    return $component === -1 ? parse_url($url) : parse_url($url, $component);
}

function plugin_basename(string $file): string
{
    return basename($file);
}

function wp_next_scheduled(...$args)
{
    return false;
}

function wp_schedule_event(...$args): bool
{
    return true;
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('America/New_York');
}

function wp_date(string $format, int $timestamp, ?DateTimeZone $timezone = null): string
{
    return (new DateTimeImmutable('@' . $timestamp))
        ->setTimezone($timezone ?? wp_timezone())
        ->format($format);
}

function sanitize_text_field($value): string
{
    return trim(strip_tags((string) $value));
}

function absint($maybeint): int
{
    return abs((int) $maybeint);
}

require __DIR__ . '/../weekly-wildcat-headless.php';

$date = wwh_format_date_text('2026-04-24T18:00');
$time = wwh_format_time_text('2026-04-24T18:00', '', false);

if ($date !== 'Apr 24, 2026 6:00 PM') {
    fwrite(STDERR, sprintf("Expected date text to stay local, got: %s\n", $date));
    exit(1);
}

if ($time !== '6:00 PM') {
    fwrite(STDERR, sprintf("Expected time text to stay local, got: %s\n", $time));
    exit(1);
}

if (wwh_import_status('forfeit', '', '', '') !== 'forfeit') {
    fwrite(STDERR, "Expected imported forfeit results to save as forfeit status.\n");
    exit(1);
}

if (wwh_effective_game_status('forfeit', '2026-04-24T18:00') !== 'forfeit') {
    fwrite(STDERR, "Expected forfeit status to remain stable after the game start time.\n");
    exit(1);
}

if (wwh_export_result('forfeit', '', '') !== 'Forfeit') {
    fwrite(STDERR, "Expected exported forfeit games to round-trip through the Result column.\n");
    exit(1);
}

if (wwh_normalize_focal_coordinate(-12) !== 0.0
    || wwh_normalize_focal_coordinate(112) !== 100.0
    || wwh_normalize_focal_coordinate('not-a-number') !== 50.0
    || wwh_normalize_focal_coordinate('37.456') !== 37.46) {
    fwrite(STDERR, "Expected sports team focal coordinates to be normalized to percentages.\n");
    exit(1);
}

if (wwh_sanitize_roster_season('2025-26') !== '2025-26'
    || wwh_sanitize_roster_season('2025-27') !== ''
    || wwh_sanitize_roster_season('2025') !== '') {
    fwrite(STDERR, "Expected roster seasons to use the YYYY-YY school-year format.\n");
    exit(1);
}

$players = wwh_sanitize_roster_players([
    ['name' => '  Avery Smith  ', 'number' => '00', 'position' => 'Goalkeeper', 'grade' => '11'],
    ['name' => '', 'number' => '12'],
]);

if (count($players) !== 1 || $players[0]['name'] !== 'Avery Smith' || $players[0]['number'] !== '00') {
    fwrite(STDERR, "Expected roster player rows to be sanitized without losing jersey formatting.\n");
    exit(1);
}

$parsed_roster = wwh_parse_sports_roster_csv(implode("\n", [
    'team_key,season,row_type,name,number,position,grade,role,sort_order',
    'girls-soccer,2025-26,athlete,Second Player,8,Midfielder,10,,2',
    'girls-soccer,2025-26,athlete,First Player,1,Goalkeeper,11,,1',
    'girls-soccer,2025-26,staff,Jordan Coach,,,,Head Coach,1',
]));
$roster_group = $parsed_roster['groups']['girls-soccer|2025-26'] ?? null;

if ($parsed_roster['errors'] !== []
    || !is_array($roster_group)
    || $roster_group['players'][0]['name'] !== 'First Player'
    || $roster_group['staff'][0]['role'] !== 'Head Coach') {
    fwrite(STDERR, "Expected roster CSV rows to validate, group, and preserve explicit order.\n");
    exit(1);
}

if (!in_array(WWH_SPORTS_ROSTER_POST_TYPE, wwh_roster_cloudflare_post_types(['post']), true)) {
    fwrite(STDERR, "Expected published roster changes to participate in Cloudflare deploy triggers.\n");
    exit(1);
}

if (wwh_import_status('tie', '', '', '') !== 'tie') {
    fwrite(STDERR, "Expected imported tie results to save as tie status.\n");
    exit(1);
}

if (wwh_import_status('', '7', '7', '') !== 'tie') {
    fwrite(STDERR, "Expected equal imported scores to save as tie status.\n");
    exit(1);
}

if (wwh_effective_game_status('tie', '2026-04-24T18:00') !== 'tie') {
    fwrite(STDERR, "Expected tie status to remain stable after the game start time.\n");
    exit(1);
}

if (wwh_export_result('tie', '', '') !== 'T') {
    fwrite(STDERR, "Expected exported tie games to round-trip through the Result column.\n");
    exit(1);
}

echo "Sports game local time display regression passed.\n";
