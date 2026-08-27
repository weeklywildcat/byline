<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_SPORTS_TEAMS_OPTION = 'byline_sports_teams';
const BYLINE_SPORTS_TEAMS_MIGRATION_OPTION = 'byline_sports_teams_migration_version';
const BYLINE_SPORTS_TEAMS_MIGRATION_VERSION = 1;

/**
 * The immutable compatibility seed. These keys are referenced by existing game
 * and roster metadata, so migrations copy them without renaming them.
 */
function byline_weekly_wildcat_sports_team_seed(): array
{
    return [
        'baseball-varsity' => ['sport' => 'Baseball', 'level' => 'Varsity', 'shortName' => 'Baseball', 'displayName' => 'Baseball - Varsity'],
        'baseball-jv' => ['sport' => 'Baseball', 'level' => 'JV', 'shortName' => 'Baseball', 'displayName' => 'Baseball - JV'],
        'baseball-c-team' => ['sport' => 'Baseball', 'level' => 'C-Team', 'shortName' => 'Baseball', 'displayName' => 'Baseball - C-Team'],
        'boys-basketball-varsity' => ['sport' => 'Boys Basketball', 'level' => 'Varsity', 'shortName' => 'Boys', 'displayName' => 'Boys Basketball - Varsity'],
        'boys-basketball-jv' => ['sport' => 'Boys Basketball', 'level' => 'JV', 'shortName' => 'Boys', 'displayName' => 'Boys Basketball - JV'],
        'boys-soccer' => ['sport' => 'Boys Soccer', 'level' => 'Varsity', 'shortName' => 'Boys', 'displayName' => 'Boys Soccer'],
        'boys-soccer-jv' => ['sport' => 'Boys Soccer', 'level' => 'JV', 'shortName' => 'Boys', 'displayName' => 'Boys Soccer - JV'],
        'cheer-competition' => ['sport' => 'Cheer', 'level' => 'Competition', 'shortName' => 'Cheer', 'displayName' => 'Cheer - Competition'],
        'cheer-sideline' => ['sport' => 'Cheer', 'level' => 'Sideline', 'shortName' => 'Cheer', 'displayName' => 'Cheer - Sideline'],
        'cross-country' => ['sport' => 'Cross Country', 'level' => 'Varsity', 'shortName' => 'Cross Country', 'displayName' => 'Cross Country'],
        'football-varsity' => ['sport' => 'Football', 'level' => 'Varsity', 'shortName' => 'Football', 'displayName' => 'Football - Varsity'],
        'football-jv' => ['sport' => 'Football', 'level' => 'JV', 'shortName' => 'Football', 'displayName' => 'Football - JV'],
        'girls-basketball-varsity' => ['sport' => 'Girls Basketball', 'level' => 'Varsity', 'shortName' => 'Girls', 'displayName' => 'Girls Basketball - Varsity'],
        'girls-basketball-jv' => ['sport' => 'Girls Basketball', 'level' => 'JV', 'shortName' => 'Girls', 'displayName' => 'Girls Basketball - JV'],
        'girls-soccer' => ['sport' => 'Girls Soccer', 'level' => 'Varsity', 'shortName' => 'Girls', 'displayName' => 'Girls Soccer'],
        'girls-soccer-jv' => ['sport' => 'Girls Soccer', 'level' => 'JV', 'shortName' => 'Girls', 'displayName' => 'Girls Soccer - JV'],
        'golf' => ['sport' => 'Golf', 'level' => 'Varsity', 'shortName' => 'Golf', 'displayName' => 'Golf'],
        'softball-jv' => ['sport' => 'Softball', 'level' => 'JV', 'shortName' => 'Softball', 'displayName' => 'Softball - JV'],
        'softball-varsity' => ['sport' => 'Softball', 'level' => 'Varsity', 'shortName' => 'Softball', 'displayName' => 'Softball - Varsity'],
        'track-and-field' => ['sport' => 'Track and Field', 'level' => 'Varsity', 'shortName' => 'Track and Field', 'displayName' => 'Track and Field'],
        'volleyball-varsity' => ['sport' => 'Volleyball', 'level' => 'Varsity', 'shortName' => 'Volleyball', 'displayName' => 'Volleyball - Varsity'],
        'volleyball-jv' => ['sport' => 'Volleyball', 'level' => 'JV', 'shortName' => 'Volleyball', 'displayName' => 'Volleyball - JV'],
        'wrestling' => ['sport' => 'Wrestling', 'level' => 'Varsity', 'shortName' => 'Wrestling', 'displayName' => 'Wrestling'],
    ];
}

function byline_sanitize_team_key($value): string
{
    $source = is_scalar($value) ? (string) $value : '';
    $key = function_exists('sanitize_key')
        ? sanitize_key($source)
        : strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', $source));
    return preg_match('/^[a-z0-9][a-z0-9_-]{0,79}$/', $key) === 1 ? $key : '';
}

function byline_sanitize_team_text($value, int $maximum = 120): string
{
    $text = sanitize_text_field(is_scalar($value) ? (string) $value : '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $maximum) : substr($text, 0, $maximum);
}

function byline_sanitize_sports_team(array $team, string $fallback_key = ''): array
{
    $key = byline_sanitize_team_key($team['key'] ?? $team['id'] ?? $fallback_key);
    $sport = byline_sanitize_team_text($team['sport'] ?? '');
    $display_name = byline_sanitize_team_text($team['displayName'] ?? $team['label'] ?? '');
    $short_name = byline_sanitize_team_text($team['shortName'] ?? $team['teamLabel'] ?? '', 60);
    $scoreboard_name = byline_sanitize_team_text($team['scoreboardName'] ?? '', 60);
    $level = byline_sanitize_team_text($team['level'] ?? '', 60);
    $division = byline_sanitize_team_text($team['genderDivision'] ?? $team['division'] ?? '', 60);
    $slug_source = byline_sanitize_team_text($team['slug'] ?? $key, 100);
    $slug = function_exists('sanitize_title') ? sanitize_title($slug_source) : trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $slug_source)), '-');

    if ($key === '' || $sport === '' || $display_name === '') {
        return [];
    }

    if ($short_name === '') {
        $short_name = $sport;
    }
    if ($scoreboard_name === '') {
        $scoreboard_name = $short_name;
    }

    if ($slug === '') {
        $slug = str_replace('_', '-', $key);
    }

    $active = !array_key_exists('active', $team) || filter_var($team['active'], FILTER_VALIDATE_BOOLEAN);

    return [
        'key' => $key,
        'sport' => $sport,
        'displayName' => $display_name,
        'shortName' => $short_name,
        'scoreboardName' => $scoreboard_name,
        'level' => $level,
        'genderDivision' => $division,
        'slug' => $slug,
        'active' => $active,
        // Legacy aliases remain part of the old REST/storage adapter.
        'teamLabel' => $short_name,
        'label' => $display_name,
    ];
}

function byline_normalize_sports_teams(array $teams): array
{
    $normalized = [];

    foreach ($teams as $stored_key => $team) {
        if (!is_array($team)) {
            continue;
        }

        $fallback_key = is_string($stored_key) ? $stored_key : '';
        $clean = byline_sanitize_sports_team($team, $fallback_key);
        if ($clean === []) {
            continue;
        }

        $normalized[$clean['key']] = $clean;
    }

    return $normalized;
}

function byline_sports_team_seed_normalized(): array
{
    $teams = byline_normalize_sports_teams(byline_weekly_wildcat_sports_team_seed());
    foreach ($teams as &$team) {
        $team['scoreboardName'] = 'Wildcats';
    }
    unset($team);
    return $teams;
}

function byline_migrate_sports_teams(): bool
{
    if (!function_exists('get_option') || !function_exists('update_option')) {
        return false;
    }

    $stored = get_option(BYLINE_SPORTS_TEAMS_OPTION, null);
    if ($stored === null) {
        $stored = byline_is_legacy_weekly_wildcat_installation()
            ? byline_sports_team_seed_normalized()
            : [];
        update_option(BYLINE_SPORTS_TEAMS_OPTION, $stored, false);
    }

    if ((int) get_option(BYLINE_SPORTS_TEAMS_MIGRATION_OPTION, 0) < BYLINE_SPORTS_TEAMS_MIGRATION_VERSION) {
        update_option(BYLINE_SPORTS_TEAMS_MIGRATION_OPTION, BYLINE_SPORTS_TEAMS_MIGRATION_VERSION, false);
    }

    return (int) get_option(BYLINE_SPORTS_TEAMS_MIGRATION_OPTION, 0) >= BYLINE_SPORTS_TEAMS_MIGRATION_VERSION;
}

function byline_get_sports_teams(): array
{
    if (!function_exists('get_option')) {
        return byline_sports_team_seed_normalized();
    }

    $stored = get_option(BYLINE_SPORTS_TEAMS_OPTION, null);
    if ($stored === null) {
        return byline_is_legacy_weekly_wildcat_installation() ? byline_sports_team_seed_normalized() : [];
    }

    return is_array($stored) ? byline_normalize_sports_teams($stored) : [];
}

/**
 * Return one coherent team entity for callers. Presentation values continue
 * to read from the legacy settings option when it exists, but callers never
 * need to know that identity and media have different compatibility stores.
 */
function byline_get_sports_team(string $team_key): ?array
{
    $team_key = byline_sanitize_team_key($team_key);
    $teams = byline_get_sports_teams();

    if ($team_key === '' || !isset($teams[$team_key])) {
        return null;
    }

    $team = $teams[$team_key];
    $settings = function_exists('wwh_sports_team_settings') ? wwh_sports_team_settings() : [];
    $presentation = is_array($settings[$team_key] ?? null) ? $settings[$team_key] : [];
    $header_id = function_exists('absint') ? absint($presentation['headerImageId'] ?? 0) : abs((int) ($presentation['headerImageId'] ?? 0));
    $logo_id = function_exists('absint') ? absint($presentation['logoId'] ?? 0) : abs((int) ($presentation['logoId'] ?? 0));
    $accent = function_exists('sanitize_hex_color')
        ? (sanitize_hex_color((string) ($presentation['accentColor'] ?? '')) ?: '')
        : (string) ($presentation['accentColor'] ?? '');

    $team['headerImageId'] = $header_id;
    $team['logoId'] = $logo_id;
    $team['headerFocalPoint'] = [
        'x' => function_exists('wwh_normalize_focal_coordinate') ? wwh_normalize_focal_coordinate($presentation['headerFocalX'] ?? 50) : 50.0,
        'y' => function_exists('wwh_normalize_focal_coordinate') ? wwh_normalize_focal_coordinate($presentation['headerFocalY'] ?? 50) : 50.0,
    ];
    $team['accentColor'] = $accent;

    if (function_exists('wwh_media_image')) {
        $team['headerImage'] = wwh_media_image($header_id, 'large');
        $team['logo'] = wwh_media_image($logo_id, 'medium');
    }

    return $team;
}

function byline_get_sports_team_by_slug(string $slug, bool $include_inactive = true): ?array
{
    $normalized_slug = sanitize_title($slug);

    if ($normalized_slug === '') {
        return null;
    }

    foreach (byline_get_sports_teams() as $team_key => $team) {
        if (!$include_inactive && empty($team['active'])) {
            continue;
        }

        if (sanitize_title((string) ($team['slug'] ?? '')) === $normalized_slug) {
            return byline_get_sports_team($team_key);
        }
    }

    return null;
}

function byline_sports_team_slug_conflicts(array $teams): array
{
    $slugs = [];

    foreach (byline_normalize_sports_teams($teams) as $team_key => $team) {
        $slug = sanitize_title((string) ($team['slug'] ?? ''));
        if ($slug !== '') {
            $slugs[$slug][] = $team_key;
        }
    }

    return array_filter($slugs, static fn(array $keys): bool => count($keys) > 1);
}

function byline_validate_sports_teams(array $teams): array
{
    $errors = [];
    $normalized = byline_normalize_sports_teams($teams);

    if (count($normalized) !== count($teams)) {
        $errors[] = 'Every sports team requires a unique stable key, sport, and display name.';
    }

    foreach (byline_sports_team_slug_conflicts($teams) as $slug => $keys) {
        $errors[] = sprintf('The public slug "%s" is used by multiple teams: %s.', $slug, implode(', ', $keys));
    }

    return array_values(array_unique($errors));
}

/**
 * Replacing the list never destroys an established key: omitted teams are kept
 * as inactive compatibility records so existing games and rosters still resolve.
 */
function byline_replace_sports_teams(array $teams): array
{
    $replacement = byline_normalize_sports_teams($teams);
    foreach (byline_get_sports_teams() as $key => $existing) {
        if (!isset($replacement[$key])) {
            $existing['active'] = false;
            $replacement[$key] = $existing;
        }
    }

    uasort($replacement, static fn(array $left, array $right): int => strcasecmp($left['displayName'], $right['displayName']));
    update_option(BYLINE_SPORTS_TEAMS_OPTION, $replacement, false);

    return $replacement;
}

function byline_can_manage_sports_teams(): bool
{
    return current_user_can(BYLINE_MANAGE_CAPABILITY);
}

function byline_rest_sports_teams(): WP_REST_Response
{
    $teams = [];
    foreach (byline_get_sports_teams() as $key => $team) {
        $teams[] = function_exists('wwh_format_sports_team')
            ? wwh_format_sports_team($key, $team)
            : $team;
    }

    return rest_ensure_response($teams);
}

function byline_rest_update_sports_teams(WP_REST_Request $request)
{
    $payload = $request->get_json_params();
    $teams = is_array($payload['teams'] ?? null) ? $payload['teams'] : (is_array($payload) ? $payload : []);

    if (count($teams) > 100) {
        return new WP_Error('byline_too_many_teams', 'A publication may configure at most 100 sports teams.', ['status' => 400]);
    }

    foreach ($teams as $team) {
        if (!is_array($team) || byline_sanitize_sports_team($team) === []) {
            return new WP_Error('byline_invalid_team', 'Every team requires a stable key, sport, and display name.', ['status' => 400]);
        }
    }

    $validation_errors = byline_validate_sports_teams($teams);
    if ($validation_errors !== []) {
        return new WP_Error('byline_invalid_team_collection', implode(' ', $validation_errors), ['status' => 400, 'errors' => $validation_errors]);
    }

    $updated = byline_replace_sports_teams($teams);
    if (function_exists('byline_schedule_deployment')) {
        byline_schedule_deployment('sports-teams');
    } elseif (function_exists('wwh_schedule_cloudflare_deploy')) {
        wwh_schedule_cloudflare_deploy();
    }

    return rest_ensure_response(['teams' => array_values($updated)]);
}

function byline_register_sports_team_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/sports/teams', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_rest_sports_teams',
            'permission_callback' => '__return_true',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_rest_update_sports_teams',
            'permission_callback' => 'byline_can_manage_sports_teams',
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_sports_team_routes');
