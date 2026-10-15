<?php

if (!defined('ABSPATH')) {
    exit;
}

const WWH_ROSTER_TEAM_META = '_ww_roster_team_key';
const WWH_ROSTER_SEASON_META = '_ww_roster_season';
const WWH_ROSTER_PLAYERS_META = '_ww_roster_players';
const WWH_ROSTER_STAFF_META = '_ww_roster_staff';
const BYLINE_ROSTER_IDENTITIES_VERSION_OPTION = 'byline_roster_identities_version';
const BYLINE_ROSTER_IDENTITIES_VERSION = 1;

function wwh_register_sports_roster_post_type(): void
{
    register_post_type(
        WWH_SPORTS_ROSTER_POST_TYPE,
        [
            'labels' => [
                'name' => 'Team Rosters',
                'singular_name' => 'Team Roster',
                'add_new_item' => 'Add Team Roster',
                'edit_item' => 'Edit Team Roster',
                'new_item' => 'New Team Roster',
                'view_item' => 'View Team Roster',
                'search_items' => 'Search Team Rosters',
                'not_found' => 'No team rosters yet. Add a roster.',
                'not_found_in_trash' => 'No team rosters in the trash.',
                'menu_name' => 'Rosters',
                'all_items' => 'Rosters',
            ],
            'public' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'capabilities' => byline_sports_archive_capabilities(),
            'map_meta_cap' => false,
            'show_in_rest' => false,
            'supports' => [],
            'capability_type' => 'post',
        ]
    );
}
add_action('init', 'wwh_register_sports_roster_post_type');

function wwh_register_sports_roster_meta(): void
{
    foreach ([WWH_ROSTER_TEAM_META, WWH_ROSTER_SEASON_META] as $key) {
        register_post_meta(
            WWH_SPORTS_ROSTER_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }

    foreach ([WWH_ROSTER_PLAYERS_META, WWH_ROSTER_STAFF_META] as $key) {
        register_post_meta(
            WWH_SPORTS_ROSTER_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'array',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }
}
add_action('init', 'wwh_register_sports_roster_meta');

function wwh_sanitize_roster_season($value): string
{
    return function_exists('byline_sports_normalize_season')
        ? byline_sports_normalize_season($value)
        : '';
}

function wwh_new_roster_row_id(string $prefix): string
{
    if (function_exists('wp_generate_uuid4')) {
        $uuid = preg_replace('/[^a-f0-9]/i', '', wp_generate_uuid4());
        if (is_string($uuid) && $uuid !== '') {
            return $prefix . '_' . strtolower(substr($uuid, 0, 16));
        }
    }

    return $prefix . '_' . substr(md5(uniqid('byline-roster-', true)), 0, 16);
}

function wwh_new_roster_athlete_id(): string
{
    return wwh_new_roster_row_id('ath');
}

function wwh_new_roster_staff_id(): string
{
    return wwh_new_roster_row_id('staff');
}

function wwh_validate_roster_row_id($value, string $prefix): string
{
    $id = sanitize_key(is_scalar($value) ? (string) $value : '');

    return preg_match('/^' . preg_quote($prefix, '/') . '_[a-z0-9][a-z0-9_-]{0,63}$/', $id) === 1 ? $id : '';
}

function wwh_sanitize_roster_athlete_id($value): string
{
    return wwh_validate_roster_row_id($value, 'ath');
}

function wwh_sanitize_roster_staff_id($value): string
{
    return wwh_validate_roster_row_id($value, 'staff');
}

function wwh_valid_local_roster_image_id($value): int
{
    $image_id = absint($value);
    if ($image_id <= 0 || !function_exists('get_post_type') || get_post_type($image_id) !== 'attachment') {
        return 0;
    }

    if (function_exists('wp_attachment_is_image') && !wp_attachment_is_image($image_id)) {
        return 0;
    }

    return $image_id;
}

function wwh_sanitize_roster_players($rows, bool $generate_ids = true): array
{
    if (!is_array($rows)) {
        return [];
    }

    $players = [];
    $used_ids = [];

    foreach (array_slice($rows, 0, 200) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $name = sanitize_text_field((string) ($row['name'] ?? ''));

        if ($name === '') {
            continue;
        }

        $athlete_id = wwh_sanitize_roster_athlete_id($row['id'] ?? $row['row_id'] ?? '');
        if ($athlete_id === '' || isset($used_ids[$athlete_id])) {
            $athlete_id = $generate_ids ? wwh_new_roster_athlete_id() : '';
        }
        if ($athlete_id !== '') {
            $used_ids[$athlete_id] = true;
        }

        $players[] = [
            'id' => $athlete_id,
            'name' => $name,
            'number' => sanitize_text_field((string) ($row['number'] ?? '')),
            'position' => sanitize_text_field((string) ($row['position'] ?? '')),
            'grade' => sanitize_text_field((string) ($row['grade'] ?? '')),
        ];
    }

    return $players;
}

function wwh_sanitize_roster_staff($rows, bool $generate_ids = true): array
{
    if (!is_array($rows)) {
        return [];
    }

    $staff = [];
    $used_ids = [];

    foreach (array_slice($rows, 0, 100) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $name = sanitize_text_field((string) ($row['name'] ?? ''));

        if ($name === '') {
            continue;
        }

        $staff_id = wwh_sanitize_roster_staff_id($row['id'] ?? $row['row_id'] ?? '');
        if ($staff_id === '' || isset($used_ids[$staff_id])) {
            $staff_id = $generate_ids ? wwh_new_roster_staff_id() : '';
        }
        if ($staff_id !== '') {
            $used_ids[$staff_id] = true;
        }

        $staff[] = [
            'id' => $staff_id,
            'name' => $name,
            'role' => sanitize_text_field((string) ($row['role'] ?? '')),
            'imageId' => wwh_valid_local_roster_image_id($row['imageId'] ?? $row['image_id'] ?? 0),
        ];
    }

    return $staff;
}

function wwh_roster_rows(int $post_id, string $meta_key): array
{
    $rows = get_post_meta($post_id, $meta_key, true);

    if ($meta_key === WWH_ROSTER_PLAYERS_META) {
        return wwh_sanitize_roster_players($rows, false);
    }

    return wwh_sanitize_roster_staff($rows, false);
}

/**
 * Persist opaque row identities once during an administrative upgrade. Public
 * rendering stays read-only and never creates a different identity per request.
 */
function byline_migrate_roster_identities(): bool
{
    if (!function_exists('get_posts') || !function_exists('update_post_meta')) {
        return false;
    }

    $post_ids = get_posts([
        'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
    ]);

    foreach ($post_ids as $post_id) {
        $post_id = absint($post_id);
        if ($post_id <= 0) {
            continue;
        }
        $players = get_post_meta($post_id, WWH_ROSTER_PLAYERS_META, true);
        $staff = get_post_meta($post_id, WWH_ROSTER_STAFF_META, true);
        update_post_meta($post_id, WWH_ROSTER_PLAYERS_META, wwh_sanitize_roster_players($players, true));
        update_post_meta($post_id, WWH_ROSTER_STAFF_META, wwh_sanitize_roster_staff($staff, true));
    }

    return true;
}

function wwh_roster_title(string $team_key, string $season): string
{
    $team = wwh_sports_team_options()[$team_key] ?? null;
    $team_label = is_array($team) ? (string) ($team['label'] ?? $team_key) : $team_key;

    return trim($team_label . ($season !== '' ? ' — ' . $season : '') . ' Roster');
}

function wwh_find_sports_roster(string $team_key, string $season, int $exclude_id = 0, array $statuses = ['publish', 'draft', 'pending', 'private', 'future']): int
{
    $ids = wwh_find_sports_roster_ids($team_key, $season, $exclude_id, $statuses);

    return $ids[0] ?? 0;
}

/**
 * Return every matching roster in status priority order. Callers that need to
 * enforce the one-published-roster rule can inspect the complete set instead
 * of accidentally selecting one duplicate.
 */
function wwh_find_sports_roster_ids(string $team_key, string $season, int $exclude_id = 0, array $statuses = ['publish', 'draft', 'pending', 'private', 'future']): array
{
    $team_key = wwh_sanitize_sport_key($team_key);
    $season = wwh_sanitize_roster_season($season);
    if ($team_key === '' || $season === '') {
        return [];
    }

    $ids = [];
    foreach ($statuses as $status) {
        $posts = get_posts([
            'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
            'post_status' => $status,
            'posts_per_page' => -1,
            'fields' => 'ids',
            'orderby' => 'ID',
            'order' => 'ASC',
            'post__not_in' => $exclude_id > 0 ? [$exclude_id] : [],
            'meta_query' => [
                'relation' => 'AND',
                ['key' => WWH_ROSTER_TEAM_META, 'value' => $team_key],
                [
                    'key' => WWH_ROSTER_SEASON_META,
                    'value' => function_exists('byline_sports_season_storage_values')
                        ? byline_sports_season_storage_values($season)
                        : [$season],
                    'compare' => 'IN',
                ],
            ],
        ]);
        foreach ($posts as $post_id) {
            $post_id = absint($post_id);
            if ($post_id > 0 && !in_array($post_id, $ids, true)) {
                $ids[] = $post_id;
            }
        }
    }

    return $ids;
}

function wwh_roster_cloudflare_post_types(array $post_types): array
{
    $post_types[] = WWH_SPORTS_ROSTER_POST_TYPE;

    return array_values(array_unique($post_types));
}
add_filter('wwh_cloudflare_deploy_post_types', 'wwh_roster_cloudflare_post_types');

function wwh_register_sports_roster_rest_route(): void
{
    $definition = [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_rosters',
        'permission_callback' => '__return_true',
        'args' => [
            'teamKey' => ['type' => 'string', 'sanitize_callback' => 'sanitize_key'],
            'season' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
            'per_page' => ['type' => 'integer', 'default' => 100, 'sanitize_callback' => 'absint'],
            'page' => ['type' => 'integer', 'default' => 1, 'sanitize_callback' => 'absint'],
        ],
    ];
    register_rest_route(WWH_REST_NAMESPACE, '/sports-rosters', $definition);
    register_rest_route(BYLINE_REST_NAMESPACE, '/sports/rosters', $definition);
}
add_action('rest_api_init', 'wwh_register_sports_roster_rest_route');

function wwh_format_sports_roster(WP_Post $post): array
{
    $team_key = wwh_sanitize_sport_key(wwh_meta_value($post->ID, WWH_ROSTER_TEAM_META));
    $team = function_exists('byline_get_sports_team') ? byline_get_sports_team($team_key) : null;
    $team = is_array($team) ? $team : (wwh_sports_team_options()[$team_key] ?? []);
    $season = wwh_sanitize_roster_season(wwh_meta_value($post->ID, WWH_ROSTER_SEASON_META));
    $formatted_team = function_exists('wwh_format_sports_team') ? wwh_format_sports_team($team_key, $team) : $team;

    $staff = array_map(static function (array $member): array {
        $image_id = wwh_valid_local_roster_image_id($member['imageId'] ?? 0);
        $image = $image_id > 0 && function_exists('wwh_media_image') ? wwh_media_image($image_id, 'medium') : [];

        return [
            'id' => (string) ($member['id'] ?? ''),
            'name' => (string) ($member['name'] ?? ''),
            'role' => (string) ($member['role'] ?? ''),
            'imageId' => $image_id,
            'image' => $image_id > 0 && !empty($image['url']) ? $image : null,
        ];
    }, wwh_roster_rows($post->ID, WWH_ROSTER_STAFF_META));

    return [
        'id' => (int) $post->ID,
        'teamKey' => $team_key,
        'teamSlug' => (string) ($team['slug'] ?? $team_key),
        'season' => $season,
        'status' => (string) $post->post_status,
        'team' => $formatted_team,
        'players' => wwh_roster_rows($post->ID, WWH_ROSTER_PLAYERS_META),
        'staff' => $staff,
    ];
}

function wwh_rest_sports_rosters(WP_REST_Request $request): WP_REST_Response
{
    $team_key_raw = (string) $request->get_param('teamKey');
    $team_key = wwh_sanitize_sport_key($team_key_raw);
    $season_raw = (string) $request->get_param('season');
    $season = $season_raw !== '' ? wwh_sanitize_roster_season($season_raw) : '';
    $per_page = max(1, min(100, absint($request->get_param('per_page') ?: 100)));
    $page = max(1, absint($request->get_param('page') ?: 1));
    $meta_query = [];

    if (($team_key_raw !== '' && $team_key === '') || ($season_raw !== '' && $season === '')) {
        $response = rest_ensure_response([]);
        $response->header('X-WP-Total', '0');
        $response->header('X-WP-TotalPages', '0');
        return $response;
    }

    if ($team_key !== '') {
        $meta_query[] = ['key' => WWH_ROSTER_TEAM_META, 'value' => $team_key];
    }

    if ($season !== '') {
        $meta_query[] = [
            'key' => WWH_ROSTER_SEASON_META,
            'value' => function_exists('byline_sports_season_storage_values')
                ? byline_sports_season_storage_values($season)
                : [$season],
            'compare' => 'IN',
        ];
    }

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'orderby' => 'title',
        'order' => 'ASC',
        'meta_query' => $meta_query,
    ]);
    $data = array_map('wwh_format_sports_roster', $query->posts);
    $response = rest_ensure_response($data);
    $response->header('X-WP-Total', (string) $query->found_posts);
    $response->header('X-WP-TotalPages', (string) $query->max_num_pages);
    wp_reset_postdata();

    return $response;
}
