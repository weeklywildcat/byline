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

function byline_sports_team_attachment_id($value): int
{
    if (!is_scalar($value)) {
        return 0;
    }

    return function_exists('absint') ? absint($value) : abs((int) $value);
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

    $active_value = $team['active'] ?? true;
    $active = !array_key_exists('active', $team)
        || (is_scalar($active_value) && filter_var($active_value, FILTER_VALIDATE_BOOLEAN));

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
    $header_id = byline_sports_team_attachment_id($presentation['headerImageId'] ?? 0);
    $logo_id = byline_sports_team_attachment_id($presentation['logoId'] ?? 0);
    $accent_source = $presentation['accentColor'] ?? '';
    $accent_source = is_scalar($accent_source) ? (string) $accent_source : '';
    $accent = function_exists('sanitize_hex_color')
        ? (sanitize_hex_color($accent_source) ?: '')
        : $accent_source;

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
 * Return an error object without making callers know whether they are running
 * inside WordPress or a small storage harness.
 */
function byline_sports_team_error(string $code, string $message)
{
    return new WP_Error($code, $message);
}

function byline_sports_team_option_name(): string
{
    return defined('WWH_SPORTS_TEAM_SETTINGS_OPTION')
        ? (string) constant('WWH_SPORTS_TEAM_SETTINGS_OPTION')
        : 'wwh_sports_team_settings';
}

/**
 * Read the raw registry without normalizing or writing it. This is used by
 * per-team writes so malformed records belonging to other teams are not
 * silently discarded as a side effect of editing one valid team.
 */
function byline_sports_raw_team_registry()
{
    if (!function_exists('get_option')) {
        return [];
    }

    return get_option(BYLINE_SPORTS_TEAMS_OPTION, []);
}

function byline_sports_team_storage_keys(): array
{
    $stored = byline_sports_raw_team_registry();
    if (!is_array($stored)) {
        return [];
    }

    $keys = [];
    foreach ($stored as $stored_key => $team) {
        $fallback_key = is_string($stored_key) ? $stored_key : '';
        $keys[] = byline_sanitize_team_key($fallback_key);
        if (is_array($team)) {
            $keys[] = byline_sanitize_team_key($team['key'] ?? $team['id'] ?? $fallback_key);
        }
    }

    return array_values(array_unique(array_filter($keys)));
}

function byline_sports_team_raw_slug_conflicts(string $slug, string $exclude_key = ''): array
{
    $slug = sanitize_title($slug);
    $exclude_key = byline_sanitize_team_key($exclude_key);
    if ($slug === '') {
        return [];
    }

    $conflicts = [];
    $stored = byline_sports_raw_team_registry();
    if (!is_array($stored)) {
        return [];
    }

    foreach ($stored as $stored_key => $team) {
        if (!is_array($team)) {
            continue;
        }
        $key = byline_sanitize_team_key($team['key'] ?? $team['id'] ?? (is_string($stored_key) ? $stored_key : ''));
        if ($key === '' || $key === $exclude_key) {
            continue;
        }
        $slug_value = $team['slug'] ?? $key;
        $team_slug = sanitize_title(is_scalar($slug_value) ? (string) $slug_value : '');
        if ($team_slug === $slug) {
            $conflicts[] = $key;
        }
    }

    return array_values(array_unique($conflicts));
}

function byline_validate_sports_team_input(array $input, string $exclude_key = ''): array
{
    $errors = [];
    $exclude_key = byline_sanitize_team_key($exclude_key);
    $team = byline_sanitize_sports_team($input, $exclude_key);
    $key = byline_sanitize_team_key($input['key'] ?? $exclude_key);
    $sport = byline_sanitize_team_text($input['sport'] ?? '');
    $display_name = byline_sanitize_team_text($input['displayName'] ?? $input['label'] ?? '');
    $slug_value = $input['slug'] ?? $key;
    $slug = sanitize_title(is_scalar($slug_value) ? (string) $slug_value : '');

    if ($key === '') {
        $errors[] = 'A stable key is required and may contain only lowercase letters, numbers, hyphens, and underscores.';
    }
    if ($sport === '') {
        $errors[] = 'Sport is required.';
    }
    if ($display_name === '') {
        $errors[] = 'Display name is required.';
    }

    if ($key !== '' && in_array($key, byline_sports_team_storage_keys(), true) && $key !== $exclude_key) {
        $errors[] = sprintf('A team with the key "%s" already exists.', $key);
    }

    if ($team === []) {
        return array_values(array_unique($errors));
    }

    if ($slug === '') {
        $errors[] = 'Public slug is required.';
    } else {
        $conflicts = byline_sports_team_raw_slug_conflicts($slug, $exclude_key);
        if ($conflicts !== []) {
            $errors[] = sprintf('The public slug "%s" is already used by another team.', $slug);
        }
    }

    return array_values(array_unique($errors));
}

function byline_sports_team_write_entity(array $entity, string $target_key): array
{
    $stored = byline_sports_raw_team_registry();
    if (!is_array($stored)) {
        $stored = [];
    }

    $target_key = byline_sanitize_team_key($target_key);
    $replaced = false;
    $updated = [];

    foreach ($stored as $stored_key => $record) {
        $fallback_key = is_string($stored_key) ? $stored_key : '';
        $record_key = is_array($record)
            ? byline_sanitize_team_key($record['key'] ?? $record['id'] ?? $fallback_key)
            : byline_sanitize_team_key($fallback_key);

        if (!$replaced && $record_key === $target_key) {
            $updated[$stored_key] = $entity;
            $replaced = true;
            continue;
        }

        // Keep unrelated legacy records byte-for-byte as they were stored.
        $updated[$stored_key] = $record;
    }

    if (!$replaced) {
        $updated[$target_key] = $entity;
    }

    update_option(BYLINE_SPORTS_TEAMS_OPTION, $updated, false);

    return byline_get_sports_teams();
}

/**
 * Update one identity record in place. The stable key is never taken from the
 * submitted fields, and unrelated (including malformed) registry records are
 * not rebuilt from browser state.
 */
function byline_update_sports_team(string $team_key, array $changes)
{
    $team_key = byline_sanitize_team_key($team_key);
    $existing = byline_get_sports_team($team_key);
    if ($team_key === '' || !is_array($existing)) {
        return byline_sports_team_error('byline_team_not_found', 'The selected team could not be found.');
    }

    $input = $existing;
    $input['key'] = $team_key;
    foreach (['sport', 'displayName', 'shortName', 'scoreboardName', 'level', 'genderDivision', 'slug', 'active'] as $field) {
        if (array_key_exists($field, $changes)) {
            $input[$field] = $changes[$field];
        }
    }

    $errors = byline_validate_sports_team_input($input, $team_key);
    if ($errors !== []) {
        return byline_sports_team_error('byline_invalid_team', implode(' ', $errors));
    }

    $entity = byline_sanitize_sports_team($input, $team_key);
    byline_sports_team_write_entity($entity, $team_key);

    return byline_get_sports_team($team_key);
}

/**
 * Create an identity record without requiring branding. Slug and key checks
 * include inactive historical records so an archive can never be shadowed.
 */
function byline_create_sports_team(array $input)
{
    $errors = byline_validate_sports_team_input($input);
    if ($errors !== []) {
        return byline_sports_team_error('byline_invalid_team', implode(' ', $errors));
    }

    $entity = byline_sanitize_sports_team(array_merge($input, ['active' => true]));
    if ($entity === []) {
        return byline_sports_team_error('byline_invalid_team', 'The team identity could not be saved.');
    }

    byline_sports_team_write_entity($entity, $entity['key']);

    return byline_get_sports_team($entity['key']);
}

function byline_set_sports_team_active(string $team_key, bool $active)
{
    return byline_update_sports_team($team_key, ['active' => $active]);
}

/**
 * Update only the selected team's compatibility presentation record. Omitted
 * fields stay untouched, which preserves legacy attachment IDs and focal
 * coordinates when an identity-only edit is submitted.
 */
function byline_update_sports_team_presentation(string $team_key, array $changes)
{
    $team_key = byline_sanitize_team_key($team_key);
    if ($team_key === '' || !is_array(byline_get_sports_team($team_key))) {
        return byline_sports_team_error('byline_team_not_found', 'The selected team could not be found.');
    }

    $settings = get_option(byline_sports_team_option_name(), []);
    if (!is_array($settings)) {
        $settings = [];
    }
    $current = is_array($settings[$team_key] ?? null) ? $settings[$team_key] : [];

    if (array_key_exists('headerImageId', $changes)) {
        $header_id = byline_sports_team_attachment_id($changes['headerImageId']);
        if ($header_id > 0) {
            $current['headerImageId'] = $header_id;
            $current['headerFocalX'] = function_exists('wwh_normalize_focal_coordinate')
                ? wwh_normalize_focal_coordinate($changes['headerFocalX'] ?? ($current['headerFocalX'] ?? 50))
                : (float) ($changes['headerFocalX'] ?? ($current['headerFocalX'] ?? 50));
            $current['headerFocalY'] = function_exists('wwh_normalize_focal_coordinate')
                ? wwh_normalize_focal_coordinate($changes['headerFocalY'] ?? ($current['headerFocalY'] ?? 50))
                : (float) ($changes['headerFocalY'] ?? ($current['headerFocalY'] ?? 50));
        } else {
            unset($current['headerImageId'], $current['headerFocalX'], $current['headerFocalY']);
        }
    }

    if (array_key_exists('logoId', $changes)) {
        $logo_id = byline_sports_team_attachment_id($changes['logoId']);
        if ($logo_id > 0) {
            $current['logoId'] = $logo_id;
        } else {
            unset($current['logoId']);
        }
    }

    if (array_key_exists('accentColor', $changes)) {
        $accent_source = $changes['accentColor'];
        $accent = sanitize_hex_color(is_scalar($accent_source) ? (string) $accent_source : '');
        if ($accent) {
            $current['accentColor'] = $accent;
        } else {
            unset($current['accentColor']);
        }
    }

    if ($current === []) {
        unset($settings[$team_key]);
    } else {
        $settings[$team_key] = $current;
    }
    update_option(byline_sports_team_option_name(), $settings, false);

    return byline_get_sports_team($team_key);
}

/**
 * Surface malformed raw identity/presentation data to Sports health without
 * changing it. The normal list may omit an unrecoverable record, but viewing
 * the list never becomes a migration or destructive cleanup operation.
 */
function byline_sports_team_integrity_records(): array
{
    $issues = [];
    $stored = byline_sports_raw_team_registry();

    if ($stored !== [] && !is_array($stored)) {
        $issues[] = [
            'code' => 'malformed_team_registry',
            'severity' => 'error',
            'message' => 'The sports team registry is not an array and needs deliberate repair.',
            'source' => BYLINE_SPORTS_TEAMS_OPTION,
        ];
        return $issues;
    }

    $seen_keys = [];
    foreach ((array) $stored as $stored_key => $record) {
        $fallback_key = is_string($stored_key) ? $stored_key : '';
        if (!is_array($record)) {
            $issues[] = [
                'code' => 'malformed_team_record',
                'severity' => 'error',
                'message' => sprintf('A sports team registry record (%s) is not an array.', $fallback_key !== '' ? $fallback_key : 'unknown key'),
                'teamKey' => $fallback_key,
                'source' => BYLINE_SPORTS_TEAMS_OPTION,
            ];
            continue;
        }

        $key = byline_sanitize_team_key($record['key'] ?? $record['id'] ?? $fallback_key);
        $clean = byline_sanitize_sports_team($record, $fallback_key);
        if ($key !== '' && isset($seen_keys[$key])) {
            $issues[] = [
                'code' => 'duplicate_team_key',
                'severity' => 'error',
                'message' => sprintf('More than one sports team record resolves to the stable key "%s".', $key),
                'teamKey' => $key,
                'source' => BYLINE_SPORTS_TEAMS_OPTION,
            ];
        }
        if ($key !== '') {
            $seen_keys[$key] = true;
        }
        if ($clean === []) {
            $issues[] = [
                'code' => 'malformed_team_identity',
                'severity' => 'error',
                'message' => sprintf('Sports team record "%s" is missing a usable stable key, sport, or display name.', $key !== '' ? $key : ($fallback_key !== '' ? $fallback_key : 'unknown')),
                'teamKey' => $key !== '' ? $key : $fallback_key,
                'source' => BYLINE_SPORTS_TEAMS_OPTION,
            ];
        }
    }

    $presentation = function_exists('get_option') ? get_option(byline_sports_team_option_name(), []) : [];
    if ($presentation !== [] && !is_array($presentation)) {
        $issues[] = [
            'code' => 'malformed_team_presentation',
            'severity' => 'error',
            'message' => 'The legacy sports team branding settings are not an array and need deliberate repair.',
            'source' => byline_sports_team_option_name(),
        ];
        return $issues;
    }

    $known_teams = byline_get_sports_teams();
    foreach ((array) $presentation as $team_key => $values) {
        $team_key = byline_sanitize_team_key($team_key);
        if (!is_array($values)) {
            $issues[] = [
                'code' => 'malformed_team_presentation_record',
                'severity' => 'error',
                'message' => sprintf('Branding settings for team "%s" are not an array.', $team_key !== '' ? $team_key : 'unknown'),
                'teamKey' => $team_key,
                'source' => byline_sports_team_option_name(),
            ];
            continue;
        }
        if ($team_key === '' || !isset($known_teams[$team_key])) {
            $issues[] = [
                'code' => 'unknown_team_presentation',
                'severity' => 'warning',
                'message' => sprintf('Branding settings reference an unknown or malformed team "%s".', $team_key !== '' ? $team_key : 'unknown'),
                'teamKey' => $team_key,
                'source' => byline_sports_team_option_name(),
            ];
        }
        foreach (['headerImageId', 'logoId'] as $media_field) {
            $media_id = byline_sports_team_attachment_id($values[$media_field] ?? 0);
            if ($media_id > 0 && function_exists('wp_attachment_is_image') && !wp_attachment_is_image($media_id)) {
                $issues[] = [
                    'code' => 'invalid_team_attachment',
                    'severity' => 'warning',
                    'message' => sprintf('Team "%s" references a missing or non-image %s attachment (%d).', $team_key !== '' ? $team_key : 'unknown', $media_field === 'logoId' ? 'logo' : 'header', $media_id),
                    'teamKey' => $team_key,
                    'attachmentId' => $media_id,
                    'source' => byline_sports_team_option_name(),
                ];
            }
        }
        foreach (['headerFocalX', 'headerFocalY'] as $focal_field) {
            if (array_key_exists($focal_field, $values) && !is_numeric($values[$focal_field])) {
                $issues[] = [
                    'code' => 'malformed_team_focal_point',
                    'severity' => 'warning',
                    'message' => sprintf('Team "%s" has a malformed %s focal-point value; the editor will use the safe center fallback.', $team_key !== '' ? $team_key : 'unknown', $focal_field),
                    'teamKey' => $team_key,
                    'source' => byline_sports_team_option_name(),
                ];
            }
        }
    }

    return $issues;
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
