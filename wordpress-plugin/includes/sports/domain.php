<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Shared sports relationship and season helpers.
 *
 * The WordPress post types and legacy metadata remain the storage contract.
 * This file is deliberately an adapter around that contract so admin screens,
 * REST responses, and migrations all agree about Team + Season relationships.
 */

if (!defined('BYLINE_SPORTS_SEASON_START_MONTH')) {
    define('BYLINE_SPORTS_SEASON_START_MONTH', 7);
}

function byline_sports_normalize_season($value): string
{
    $source = is_scalar($value) ? (string) $value : '';
    $source = function_exists('sanitize_text_field') ? sanitize_text_field($source) : trim($source);
    $source = trim($source);

    if (preg_match('/^(\d{4})\s*[-\/]\s*(\d{2}|\d{4})$/', $source, $matches) !== 1) {
        return '';
    }

    $start_year = (int) $matches[1];
    $end_value = $matches[2];
    $end_year = $start_year + 1;

    if ($start_year < 1900 || $start_year > 2200) {
        return '';
    }

    if (strlen($end_value) === 4) {
        if ((int) $end_value !== $end_year) {
            return '';
        }
    } elseif ((int) $end_value !== $end_year % 100) {
        return '';
    }

    return sprintf('%04d-%02d', $start_year, $end_year % 100);
}

/**
 * Return the legacy storage spellings that can represent one canonical
 * school year. Reads accept these aliases so older rosters continue to work
 * until an editor saves them back in the canonical YYYY-YY form.
 */
function byline_sports_season_storage_values($season): array
{
    $normalized = byline_sports_normalize_season($season);

    if ($normalized === '') {
        return [];
    }

    $start_year = (int) substr($normalized, 0, 4);
    $end_year = $start_year + 1;

    return array_values(array_unique([
        $normalized,
        sprintf('%04d-%04d', $start_year, $end_year),
        sprintf('%04d/%04d', $start_year, $end_year),
        sprintf('%04d/%02d', $start_year, $end_year % 100),
    ]));
}

function byline_sports_timezone(): DateTimeZone
{
    if (function_exists('wp_timezone')) {
        return wp_timezone();
    }

    return new DateTimeZone('UTC');
}

function byline_sports_date_for_value($value): ?DateTimeImmutable
{
    if ($value instanceof DateTimeImmutable) {
        return $value->setTimezone(byline_sports_timezone());
    }

    if ($value instanceof DateTimeInterface) {
        return (new DateTimeImmutable('@' . $value->getTimestamp()))->setTimezone(byline_sports_timezone());
    }

    $source = is_scalar($value) ? trim((string) $value) : '';

    if ($source === '') {
        return null;
    }

    $timezone = byline_sports_timezone();
    $formats = [
        '!Y-m-d\\TH:i',
        '!Y-m-d\\TH:i:s',
        '!Y-m-d',
        '!m/d/Y g:i A',
        '!m/d/Y H:i',
        '!m/d/Y',
        '!n/j/Y g:i A',
        '!n/j/Y H:i',
        '!n/j/Y',
    ];

    foreach ($formats as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $source, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

        if ($date instanceof DateTimeImmutable && !$has_errors) {
            return $date;
        }
    }

    // ISO values from REST fixtures may include an offset. Convert those to
    // the publication timezone before deriving the school year.
    try {
        $date = new DateTimeImmutable($source, $timezone);
        return $date->setTimezone($timezone);
    } catch (Exception $exception) {
        return null;
    }
}

function byline_sports_season_for_date($value): string
{
    $date = byline_sports_date_for_value($value);

    if (!$date) {
        return '';
    }

    $year = (int) $date->format('Y');
    $month = (int) $date->format('n');
    $start_year = $month >= BYLINE_SPORTS_SEASON_START_MONTH ? $year : $year - 1;

    return sprintf('%04d-%02d', $start_year, ($start_year + 1) % 100);
}

function byline_sports_current_season(?int $timestamp = null): string
{
    $timestamp = $timestamp === null ? time() : $timestamp;
    $date = function_exists('wp_date')
        ? wp_date('Y-m-d', $timestamp, byline_sports_timezone())
        : (new DateTimeImmutable('@' . $timestamp))->setTimezone(byline_sports_timezone())->format('Y-m-d');

    return byline_sports_season_for_date($date);
}

function byline_sports_team_key($value): string
{
    return function_exists('byline_sanitize_team_key') ? byline_sanitize_team_key($value) : sanitize_key((string) $value);
}

function byline_sports_team_label(string $team_key): string
{
    $team = function_exists('byline_get_sports_team') ? byline_get_sports_team($team_key) : null;

    if (is_array($team)) {
        return (string) ($team['displayName'] ?? $team['label'] ?? $team_key);
    }

    return $team_key;
}

function byline_sports_public_team_url($team, string $season = ''): string
{
    if (is_array($team)) {
        $team_data = $team;
    } else {
        $team_data = function_exists('byline_get_sports_team')
            ? byline_get_sports_team((string) $team)
            : null;
    }

    if (!is_array($team_data)) {
        return '';
    }

    $slug = sanitize_title((string) ($team_data['slug'] ?? $team_data['key'] ?? ''));

    if ($slug === '') {
        return '';
    }

    $publication_config = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $configured_public_site = is_array($publication_config) && isset($publication_config['urls']['publicSite'])
        ? $publication_config['urls']['publicSite']
        : '';
    $base = untrailingslashit((string) (function_exists('wwh_public_site_url')
        ? wwh_public_site_url()
        : $configured_public_site));
    $url = $base . '/sports/' . rawurlencode($slug) . '/';
    $normalized_season = byline_sports_normalize_season($season);

    return $normalized_season !== '' ? $url . rawurlencode($normalized_season) . '/' : $url;
}

function byline_sports_admin_games_url(string $team_key = '', string $season = ''): string
{
    $args = ['post_type' => WWH_SPORTS_GAME_POST_TYPE];

    if ($team_key !== '') {
        $args['wwh_sport_key'] = $team_key;
    }

    if ($season !== '') {
        $args['wwh_season'] = byline_sports_normalize_season($season);
    }

    return add_query_arg($args, admin_url('edit.php'));
}

function byline_sports_admin_new_game_url(string $team_key = '', string $season = ''): string
{
    $args = ['post_type' => WWH_SPORTS_GAME_POST_TYPE];

    if ($team_key !== '') {
        $args['wwh_sport_key'] = $team_key;
    }

    if ($season !== '') {
        $args['wwh_season'] = byline_sports_normalize_season($season);
    }

    return add_query_arg($args, admin_url('post-new.php'));
}

function byline_sports_admin_rosters_url(string $team_key = '', string $season = '', string $status = ''): string
{
    $args = ['post_type' => WWH_SPORTS_ROSTER_POST_TYPE];

    if ($team_key !== '') {
        $args['wwh_roster_team_key'] = $team_key;
    }

    if ($season !== '') {
        $args['wwh_roster_season'] = byline_sports_normalize_season($season);
    }

    if ($status !== '') {
        $args['wwh_roster_status'] = sanitize_key($status);
    }

    return add_query_arg($args, admin_url('edit.php'));
}

function byline_sports_admin_new_roster_url(string $team_key = '', string $season = ''): string
{
    $args = ['post_type' => WWH_SPORTS_ROSTER_POST_TYPE];

    if ($team_key !== '') {
        $args['wwh_roster_team_key'] = $team_key;
    }

    if ($season !== '') {
        $args['wwh_roster_season'] = byline_sports_normalize_season($season);
    }

    return add_query_arg($args, admin_url('post-new.php'));
}

function byline_sports_snapshot(bool $refresh = false): array
{
    static $snapshot = null;

    if ($snapshot !== null && !$refresh) {
        return $snapshot;
    }

    $game_posts = [];
    $roster_posts = [];

    if (function_exists('get_posts')) {
        $game_posts = get_posts([
            'post_type' => WWH_SPORTS_GAME_POST_TYPE,
            'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
            'posts_per_page' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
        ]);
        $roster_posts = get_posts([
            'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
            'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
            'posts_per_page' => -1,
            'orderby' => 'ID',
            'order' => 'ASC',
            'no_found_rows' => true,
        ]);
    }

    $snapshot = [
        'teams' => function_exists('byline_get_sports_teams') ? byline_get_sports_teams() : [],
        'games' => array_values(array_filter($game_posts, static fn($post): bool => $post instanceof WP_Post)),
        'rosters' => array_values(array_filter($roster_posts, static fn($post): bool => $post instanceof WP_Post)),
        'currentSeason' => byline_sports_current_season(),
    ];

    return $snapshot;
}

function byline_sports_post_meta_value(int $post_id, string $key, string $default = ''): string
{
    if (function_exists('wwh_meta_value')) {
        return wwh_meta_value($post_id, $key, $default);
    }

    $value = function_exists('get_post_meta') ? get_post_meta($post_id, $key, true) : '';

    return is_scalar($value) && (string) $value !== '' ? (string) $value : $default;
}

function byline_sports_game_season_from_post(WP_Post $post): string
{
    $explicit = byline_sports_normalize_season(byline_sports_post_meta_value($post->ID, '_ww_import_season'));

    if ($explicit !== '') {
        return $explicit;
    }

    return byline_sports_season_for_date(byline_sports_post_meta_value($post->ID, '_ww_start_datetime'));
}

function byline_sports_roster_season_from_post(WP_Post $post): string
{
    return byline_sports_normalize_season(byline_sports_post_meta_value($post->ID, WWH_ROSTER_SEASON_META));
}

function byline_sports_game_team_key_from_post(WP_Post $post): string
{
    return byline_sports_team_key(byline_sports_post_meta_value($post->ID, '_ww_sport_key'));
}

function byline_sports_roster_team_key_from_post(WP_Post $post): string
{
    return byline_sports_team_key(byline_sports_post_meta_value($post->ID, WWH_ROSTER_TEAM_META));
}

function byline_sports_post_timestamp(WP_Post $post, string $meta_key): int
{
    $value = byline_sports_post_meta_value($post->ID, $meta_key);

    if ($value === '') {
        return 0;
    }

    $date = byline_sports_date_for_value($value);

    return $date ? $date->getTimestamp() : 0;
}

function byline_sports_team_seasons(string $team_key = '', bool $published_only = false): array
{
    $team_key = byline_sports_team_key($team_key);
    $snapshot = byline_sports_snapshot();
    $seasons = [];

    foreach ($snapshot['games'] as $post) {
        if ($published_only && !byline_sports_post_is_published($post)) {
            continue;
        }
        $post_team_key = byline_sports_game_team_key_from_post($post);
        if ($team_key !== '' && $post_team_key !== $team_key) {
            continue;
        }

        $season = byline_sports_game_season_from_post($post);
        if ($season !== '') {
            $seasons[$season] = true;
        }
    }

    foreach ($snapshot['rosters'] as $post) {
        if ($published_only && !byline_sports_post_is_published($post)) {
            continue;
        }
        $post_team_key = byline_sports_roster_team_key_from_post($post);
        if ($team_key !== '' && $post_team_key !== $team_key) {
            continue;
        }

        $season = byline_sports_roster_season_from_post($post);
        if ($season !== '') {
            $seasons[$season] = true;
        }
    }

    $values = array_keys($seasons);
    rsort($values, SORT_STRING);

    return $values;
}

function byline_sports_available_seasons(bool $published_only = false): array
{
    return byline_sports_team_seasons('', $published_only);
}

function byline_sports_team_summary_rows(bool $refresh = false): array
{
    static $cached_summaries = null;

    if ($cached_summaries !== null && !$refresh) {
        return $cached_summaries;
    }

    $snapshot = byline_sports_snapshot($refresh);
    $now = time();
    $summaries = [];

    foreach ($snapshot['teams'] as $key => $team) {
        $summaries[$key] = [
            'teamKey' => $key,
            'team' => $team,
            'currentSeason' => $snapshot['currentSeason'],
            'seasons' => [],
            'games' => 0,
            'gamesBySeason' => [],
            'publishedGames' => 0,
            'rosters' => 0,
            'rostersBySeason' => [],
            'publishedGamesBySeason' => [],
            'publishedRosterCounts' => [],
            'publishedRostersBySeason' => [],
            'publishedAthletesBySeason' => [],
            'publishedStaffBySeason' => [],
            'athletesBySeason' => [],
            'staffBySeason' => [],
            'duplicatePublishedRosters' => [],
            'nextGame' => null,
            'lastResult' => null,
        ];
    }

    foreach ($snapshot['games'] as $post) {
        $team_key = byline_sports_game_team_key_from_post($post);
        $season = byline_sports_game_season_from_post($post);

        if ($team_key === '' || $season === '' || !isset($summaries[$team_key])) {
            continue;
        }

        $summaries[$team_key]['games']++;
        $summaries[$team_key]['gamesBySeason'][$season] = ($summaries[$team_key]['gamesBySeason'][$season] ?? 0) + 1;
        $summaries[$team_key]['seasons'][$season] = true;

        if ($post->post_status === 'publish') {
            $summaries[$team_key]['publishedGames']++;
            $summaries[$team_key]['publishedGamesBySeason'][$season] = ($summaries[$team_key]['publishedGamesBySeason'][$season] ?? 0) + 1;
        }

        $timestamp = byline_sports_post_timestamp($post, '_ww_start_datetime');
        $status = byline_sports_post_meta_value($post->ID, '_ww_game_status', 'upcoming');
        $status = function_exists('wwh_effective_game_status')
            ? wwh_effective_game_status($status, byline_sports_post_meta_value($post->ID, '_ww_start_datetime'))
            : $status;
        $candidate = [
            'id' => (int) $post->ID,
            'season' => $season,
            'timestamp' => $timestamp,
            'status' => $status,
            'post' => $post,
        ];

        if ($post->post_status === 'publish' && $timestamp > $now && $status === 'upcoming'
            && ($summaries[$team_key]['nextGame'] === null || $timestamp < $summaries[$team_key]['nextGame']['timestamp'])) {
            $summaries[$team_key]['nextGame'] = $candidate;
        }

        if ($post->post_status === 'publish' && $timestamp > 0 && $timestamp <= $now
            && in_array($status, ['final', 'forfeit', 'tie'], true)
            && ($summaries[$team_key]['lastResult'] === null || $timestamp > $summaries[$team_key]['lastResult']['timestamp'])) {
            $summaries[$team_key]['lastResult'] = $candidate;
        }
    }

    foreach ($snapshot['rosters'] as $post) {
        $team_key = byline_sports_roster_team_key_from_post($post);
        $season = byline_sports_roster_season_from_post($post);

        if ($team_key === '' || $season === '' || !isset($summaries[$team_key])) {
            continue;
        }

        $summaries[$team_key]['rosters']++;
        $summaries[$team_key]['rostersBySeason'][$season] = ($summaries[$team_key]['rostersBySeason'][$season] ?? 0) + 1;
        $summaries[$team_key]['seasons'][$season] = true;

        $players = function_exists('wwh_roster_rows') ? wwh_roster_rows((int) $post->ID, WWH_ROSTER_PLAYERS_META) : [];
        $staff = function_exists('wwh_roster_rows') ? wwh_roster_rows((int) $post->ID, WWH_ROSTER_STAFF_META) : [];
        $summaries[$team_key]['athletesBySeason'][$season] = max(
            (int) ($summaries[$team_key]['athletesBySeason'][$season] ?? 0),
            count($players)
        );
        $summaries[$team_key]['staffBySeason'][$season] = max(
            (int) ($summaries[$team_key]['staffBySeason'][$season] ?? 0),
            count($staff)
        );

        if ($post->post_status === 'publish') {
            $summaries[$team_key]['publishedRostersBySeason'][$season][] = [
                'id' => (int) $post->ID,
                'post' => $post,
                'athletes' => count($players),
                'staff' => count($staff),
            ];
            $summaries[$team_key]['publishedRosterCounts'][$season] = ($summaries[$team_key]['publishedRosterCounts'][$season] ?? 0) + 1;
            $summaries[$team_key]['publishedAthletesBySeason'][$season] = max(
                (int) ($summaries[$team_key]['publishedAthletesBySeason'][$season] ?? 0),
                count($players)
            );
            $summaries[$team_key]['publishedStaffBySeason'][$season] = max(
                (int) ($summaries[$team_key]['publishedStaffBySeason'][$season] ?? 0),
                count($staff)
            );
        }
    }

    foreach ($summaries as &$summary) {
        $summary['seasons'] = array_keys($summary['seasons']);
        rsort($summary['seasons'], SORT_STRING);
        foreach ($summary['publishedRostersBySeason'] as $season => $rosters) {
            if (count($rosters) > 1) {
                $summary['duplicatePublishedRosters'][$season] = $rosters;
            }
        }
        unset($summary['publishedRostersBySeason']);
    }
    unset($summary);

    $cached_summaries = $summaries;

    return $cached_summaries;
}

function byline_sports_team_summary(string $team_key): ?array
{
    $team_key = byline_sports_team_key($team_key);
    $summaries = byline_sports_team_summary_rows();

    return $summaries[$team_key] ?? null;
}

function byline_sports_post_is_published(WP_Post $post): bool
{
    return $post->post_status === 'publish';
}

function byline_sports_team_context(string $team_key, string $season = ''): ?array
{
    $team_key = byline_sports_team_key($team_key);
    $team = function_exists('byline_get_sports_team') ? byline_get_sports_team($team_key) : null;

    if (!is_array($team)) {
        return null;
    }

    $normalized_season = byline_sports_normalize_season($season);
    $summary = byline_sports_team_summary($team_key);
    $available_seasons = byline_sports_team_seasons($team_key, true);

    if ($normalized_season === '') {
        $normalized_season = $available_seasons[0] ?? byline_sports_current_season();
    }

    $games = [];
    $roster = null;
    $roster_ids = [];
    $snapshot = byline_sports_snapshot();

    foreach ($snapshot['games'] as $post) {
        if (!byline_sports_post_is_published($post)
            || byline_sports_game_team_key_from_post($post) !== $team_key
            || byline_sports_game_season_from_post($post) !== $normalized_season) {
            continue;
        }

        if (function_exists('wwh_format_sports_game')) {
            $games[] = wwh_format_sports_game($post);
        }
    }

    usort($games, static function (array $left, array $right): int {
        return strcmp((string) ($left['startDate'] ?? ''), (string) ($right['startDate'] ?? ''));
    });

    foreach ($snapshot['rosters'] as $post) {
        if ($post->post_status !== 'publish'
            || byline_sports_roster_team_key_from_post($post) !== $team_key
            || byline_sports_roster_season_from_post($post) !== $normalized_season) {
            continue;
        }

        $roster_ids[] = (int) $post->ID;
    }

    if (count($roster_ids) === 1 && function_exists('wwh_format_sports_roster')) {
        $roster_post = get_post($roster_ids[0]);
        if ($roster_post instanceof WP_Post) {
            $roster = wwh_format_sports_roster($roster_post);
        }
    }

    return [
        'team' => function_exists('wwh_format_sports_team')
            ? wwh_format_sports_team($team_key, $team)
            : $team,
        'teamKey' => $team_key,
        'season' => $normalized_season,
        'availableSeasons' => $available_seasons,
        'roster' => $roster,
        'rosterIds' => $roster_ids,
        'games' => $games,
        'previousGame' => byline_sports_previous_game($games),
        'nextGame' => byline_sports_next_game($games),
        'linkedCoverage' => byline_sports_recent_coverage($team_key, $normalized_season),
        'summary' => $summary,
    ];
}

function byline_sports_next_game(array $games): ?array
{
    $next = null;

    foreach ($games as $game) {
        if (!is_array($game) || ($game['status'] ?? '') !== 'upcoming') {
            continue;
        }

        if ($next === null) {
            $next = $game;
            continue;
        }

        $candidate_timestamp = byline_sports_game_timestamp($game);
        $next_timestamp = byline_sports_game_timestamp($next);

        // TBA games are valid upcoming games, but an unknown date must not sort
        // ahead of a dated game merely because an empty string compares first.
        if ($candidate_timestamp > 0 && ($next_timestamp === 0 || $candidate_timestamp < $next_timestamp)) {
            $next = $game;
        }
    }

    return $next;
}

function byline_sports_previous_game(array $games): ?array
{
    $previous = null;

    foreach ($games as $game) {
        if (!is_array($game) || !in_array(($game['status'] ?? ''), ['final', 'forfeit', 'tie'], true)) {
            continue;
        }

        if ($previous === null) {
            $previous = $game;
            continue;
        }

        $candidate_timestamp = byline_sports_game_timestamp($game);
        $previous_timestamp = byline_sports_game_timestamp($previous);

        // Prefer the latest dated result; an undated historical result is only
        // a fallback when no completed game has a readable start time.
        if ($candidate_timestamp > 0 && ($previous_timestamp === 0 || $candidate_timestamp > $previous_timestamp)) {
            $previous = $game;
        }
    }

    return $previous;
}

function byline_sports_game_timestamp(array $game): int
{
    $date = byline_sports_date_for_value($game['startDate'] ?? '');

    return $date ? $date->getTimestamp() : 0;
}

function byline_sports_linked_coverage_for_games(array $game_ids, int $per_game_limit = 6): array
{
    static $coverage_index = null;
    $game_ids = array_values(array_unique(array_filter(array_map('absint', $game_ids))));
    if ($game_ids === [] || !function_exists('get_posts') || !defined('WWH_PRIMARY_GAME_META')) {
        return [];
    }

    if ($coverage_index === null) {
        $query_game_ids = $game_ids;
        $snapshot = byline_sports_snapshot();
        foreach ($snapshot['games'] as $game) {
            if ($game instanceof WP_Post) {
                $query_game_ids[] = (int) $game->ID;
            }
        }
        $query_game_ids = array_values(array_unique(array_filter(array_map('absint', $query_game_ids))));
        $coverage_index = [];

        if ($query_game_ids !== []) {
            $posts = get_posts([
                'post_type' => 'post',
                'post_status' => 'publish',
                'posts_per_page' => -1,
                'orderby' => 'date',
                'order' => 'DESC',
                'meta_query' => [
                    ['key' => WWH_PRIMARY_GAME_META, 'value' => $query_game_ids, 'compare' => 'IN', 'type' => 'NUMERIC'],
                ],
            ]);

            foreach ($posts as $post) {
                if (!$post instanceof WP_Post) {
                    continue;
                }
                $game_id = absint(get_post_meta($post->ID, WWH_PRIMARY_GAME_META, true));
                if (!in_array($game_id, $query_game_ids, true)) {
                    continue;
                }
                $coverage_index[$game_id][] = byline_sports_format_coverage_post($post);
            }
        }
    }

    $per_game_limit = max(1, min(20, $per_game_limit));
    $coverage_by_game = [];
    foreach ($game_ids as $game_id) {
        if (isset($coverage_index[$game_id])) {
            $coverage_by_game[$game_id] = array_slice($coverage_index[$game_id], 0, $per_game_limit);
        }
    }

    return $coverage_by_game;
}

function byline_sports_linked_coverage(int $game_id, int $limit = 6): array
{
    $coverage = byline_sports_linked_coverage_for_games([$game_id], $limit);

    return $coverage[$game_id] ?? [];
}

function byline_sports_format_coverage_post(WP_Post $post): array
{
    return [
        'id' => (int) $post->ID,
        'title' => get_the_title($post),
        'editUrl' => admin_url('post.php?post=' . (int) $post->ID . '&action=edit'),
        'url' => get_permalink($post),
        'date' => (string) $post->post_date,
    ];
}

function byline_sports_recent_coverage(string $team_key, string $season = '', int $limit = 6): array
{
    $game_ids = [];
    $snapshot = byline_sports_snapshot();
    $season = byline_sports_normalize_season($season);

    foreach ($snapshot['games'] as $post) {
        if ($post->post_status !== 'publish' || byline_sports_game_team_key_from_post($post) !== $team_key) {
            continue;
        }
        if ($season !== '' && byline_sports_game_season_from_post($post) !== $season) {
            continue;
        }
        $game_ids[] = (int) $post->ID;
    }

    if ($game_ids === []) {
        return [];
    }

    $coverage = [];
    $coverage_by_game = byline_sports_linked_coverage_for_games($game_ids, $limit);
    foreach ($coverage_by_game as $game_posts) {
        foreach ($game_posts as $post) {
            $coverage[$post['id']] = $post;
        }
    }

    $coverage = array_values($coverage);
    usort($coverage, static fn(array $left, array $right): int => strcmp((string) ($right['date'] ?? ''), (string) ($left['date'] ?? '')));

    return array_slice($coverage, 0, max(1, min(20, $limit)));
}

function byline_sports_game_ids_for_season(string $season, string $team_key = '', bool $published_only = true): array
{
    $season = byline_sports_normalize_season($season);
    $team_key = byline_sports_team_key($team_key);
    if ($season === '') {
        return [];
    }

    $ids = [];
    foreach (byline_sports_snapshot()['games'] as $post) {
        if ($published_only && $post->post_status !== 'publish') {
            continue;
        }
        if ($team_key !== '' && byline_sports_game_team_key_from_post($post) !== $team_key) {
            continue;
        }
        if (byline_sports_game_season_from_post($post) === $season) {
            $ids[] = (int) $post->ID;
        }
    }

    return $ids;
}

function byline_sports_integrity_checks(bool $refresh = false): array
{
    $snapshot = byline_sports_snapshot($refresh);
    $teams = $snapshot['teams'];
    $issues = [];
    $published_rosters = [];
    $slugs = [];
    $game_ids = [];

    $add_issue = static function (array &$issues, string $code, string $severity, string $message, array $context = []): void {
        $issues[] = array_merge([
            'code' => $code,
            'severity' => $severity,
            'message' => $message,
        ], $context);
    };

    // Identity and branding normalization is intentionally read-only here.
    // Health must expose malformed historical options without allowing a GET
    // of the Teams screen to rewrite or discard them.
    if (function_exists('byline_sports_team_integrity_records')) {
        foreach (byline_sports_team_integrity_records() as $record_issue) {
            if (!is_array($record_issue)) {
                continue;
            }
            $context = $record_issue;
            unset($context['code'], $context['severity'], $context['message']);
            $add_issue(
                $issues,
                (string) ($record_issue['code'] ?? 'malformed_team_record'),
                (string) ($record_issue['severity'] ?? 'warning'),
                (string) ($record_issue['message'] ?? 'A sports team record needs review.'),
                $context
            );
        }
    }

    foreach ($teams as $key => $team) {
        $slug = sanitize_title((string) ($team['slug'] ?? ''));
        if ($slug !== '') {
            $slugs[$slug][] = $key;
        }
        if (trim((string) ($team['displayName'] ?? $team['label'] ?? '')) === '') {
            $add_issue($issues, 'team_missing_display_identity', 'error', 'A sports team is missing a required display identity.', ['teamKey' => $key]);
        }
        if (($team['active'] ?? true) && function_exists('byline_get_sports_team')) {
            $presentation = byline_get_sports_team((string) $key);
            if (is_array($presentation) && absint($presentation['headerImageId'] ?? 0) === 0 && absint($presentation['logoId'] ?? 0) === 0) {
                $add_issue($issues, 'team_missing_branding', 'recommended', sprintf('%s has no public branding image or logo.', byline_sports_team_label((string) $key)), ['teamKey' => (string) $key]);
            }
        }
    }

    foreach ($slugs as $slug => $keys) {
        if (count($keys) > 1) {
            $add_issue($issues, 'duplicate_public_slug', 'error', sprintf('Teams share the public slug “%s”.', $slug), ['slug' => $slug, 'teamKeys' => $keys]);
        }
    }

    foreach ($snapshot['games'] as $post) {
        $game_ids[(int) $post->ID] = true;
        $team_key = byline_sports_game_team_key_from_post($post);
        $team = $teams[$team_key] ?? null;
        if ($team_key === '' || !is_array($team)) {
            $add_issue($issues, 'orphan_game_team', 'error', sprintf('Game #%d references an unknown team key.', (int) $post->ID), ['postId' => (int) $post->ID, 'teamKey' => $team_key]);
        } elseif (($team['active'] ?? true) === false) {
            $add_issue($issues, 'inactive_team_reference', 'info', sprintf('Game #%d belongs to an inactive historical team.', (int) $post->ID), ['postId' => (int) $post->ID, 'teamKey' => $team_key]);
        }

        $explicit = byline_sports_post_meta_value($post->ID, '_ww_import_season');
        $date = byline_sports_post_meta_value($post->ID, '_ww_start_datetime');
        if ($explicit !== '' && byline_sports_normalize_season($explicit) === '') {
            $add_issue($issues, 'invalid_game_season', 'error', sprintf('Game #%d has an invalid season value.', (int) $post->ID), ['postId' => (int) $post->ID]);
        } elseif ($date !== '' && byline_sports_season_for_date($date) === '') {
            $add_issue($issues, 'invalid_game_date', 'error', sprintf('Game #%d has an invalid date/time.', (int) $post->ID), ['postId' => (int) $post->ID]);
        } elseif ($date === '' && $explicit === '') {
            $add_issue($issues, 'invalid_game_season', 'error', sprintf('Game #%d cannot resolve a season.', (int) $post->ID), ['postId' => (int) $post->ID]);
        }
    }

    foreach ($snapshot['rosters'] as $post) {
        $team_key = byline_sports_roster_team_key_from_post($post);
        $season_raw = byline_sports_post_meta_value($post->ID, WWH_ROSTER_SEASON_META);
        $season = byline_sports_normalize_season($season_raw);
        $team = $teams[$team_key] ?? null;
        if ($team_key === '' || !is_array($team)) {
            $add_issue($issues, 'orphan_roster_team', 'error', sprintf('Roster #%d references an unknown team key.', (int) $post->ID), ['postId' => (int) $post->ID, 'teamKey' => $team_key]);
        } elseif (($team['active'] ?? true) === false) {
            $add_issue($issues, 'inactive_roster_reference', 'info', sprintf('Roster #%d belongs to an inactive historical team.', (int) $post->ID), ['postId' => (int) $post->ID, 'teamKey' => $team_key]);
        }
        if ($season === '') {
            $add_issue($issues, 'invalid_roster_season', 'error', sprintf('Roster #%d has an invalid season value.', (int) $post->ID), ['postId' => (int) $post->ID, 'teamKey' => $team_key]);
        }
        if ($post->post_status === 'publish' && $team_key !== '' && $season !== '') {
            $published_rosters[$team_key . '|' . $season][] = (int) $post->ID;
        }
    }

    foreach ($published_rosters as $identity => $ids) {
        if (count($ids) > 1) {
            [$team_key, $season] = explode('|', $identity, 2);
            $add_issue($issues, 'duplicate_published_roster', 'error', sprintf('%s has %d published rosters for %s.', byline_sports_team_label($team_key), count($ids), $season), ['teamKey' => $team_key, 'season' => $season, 'postIds' => $ids]);
        }
    }

    if (function_exists('get_posts') && defined('WWH_PRIMARY_GAME_META')) {
        $linked_posts = get_posts([
            'post_type' => 'post',
            'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
            'posts_per_page' => -1,
            'meta_query' => [['key' => WWH_PRIMARY_GAME_META, 'compare' => 'EXISTS']],
        ]);
        foreach ($linked_posts as $post) {
            if (!$post instanceof WP_Post) {
                continue;
            }
            $game_id = absint(get_post_meta($post->ID, WWH_PRIMARY_GAME_META, true));
            if ($game_id > 0 && !isset($game_ids[$game_id])) {
                $add_issue($issues, 'broken_recap_reference', 'error', sprintf('Story #%d links to missing game #%d.', (int) $post->ID, $game_id), ['postId' => (int) $post->ID, 'gameId' => $game_id]);
            }
        }
    }

    $summaries = byline_sports_team_summary_rows($refresh);
    foreach ($summaries as $summary) {
        $team = $summary['team'];
        $team_key = $summary['teamKey'];
        $current_season = $summary['currentSeason'];
        if (($team['active'] ?? true) && empty($summary['publishedRosterCounts'][$current_season])) {
            if (!empty($summary['publishedGamesBySeason'][$current_season])) {
                $add_issue($issues, 'upcoming_games_without_roster', 'recommended', sprintf('%s has games but no current-season roster.', byline_sports_team_label($team_key)), ['teamKey' => $team_key, 'season' => $current_season]);
            } else {
                $add_issue($issues, 'missing_current_roster', 'recommended', sprintf('%s has no roster for %s.', byline_sports_team_label($team_key), $current_season), ['teamKey' => $team_key, 'season' => $current_season]);
            }
        }
    }

    return $issues;
}

function byline_sports_health(bool $refresh = false): array
{
    $issues = byline_sports_integrity_checks($refresh);
    $counts = ['error' => 0, 'recommended' => 0, 'info' => 0];
    foreach ($issues as $issue) {
        $severity = (string) ($issue['severity'] ?? 'info');
        if (!isset($counts[$severity])) {
            $counts[$severity] = 0;
        }
        $counts[$severity]++;
    }

    return [
        'status' => $counts['error'] > 0 ? 'attention' : 'healthy',
        'healthy' => $counts['error'] === 0,
        'currentSeason' => byline_sports_current_season(),
        'teamCount' => count(byline_get_sports_teams()),
        'activeTeamCount' => count(array_filter(byline_get_sports_teams(), static fn(array $team): bool => !empty($team['active']))),
        'counts' => $counts,
        'issues' => $issues,
    ];
}

function byline_sports_integrity_health(bool $refresh = false): array
{
    return byline_sports_health($refresh);
}

function byline_sports_resolve_game_season(string $start_datetime, string $explicit_season = ''): string
{
    $explicit = byline_sports_normalize_season($explicit_season);
    if ($explicit !== '') {
        return $explicit;
    }

    return byline_sports_season_for_date($start_datetime);
}
