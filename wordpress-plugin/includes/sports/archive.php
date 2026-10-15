<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_SPORTS_ARCHIVE_VERSION = 1;
const BYLINE_SPORTS_ARCHIVE_VERSION_OPTION = 'byline_sports_archive_version';
const BYLINE_SPORTS_ARCHIVE_KEY_META = '_byline_sports_archive_key';
const BYLINE_SPORTS_ARCHIVE_ROUTES_META = '_byline_sports_archive_routes';
const BYLINE_SPORTS_ARCHIVE_LOCK_OPTION = 'byline_sports_archive_lock';

/** Retain legacy storage and public readers without retaining an editor. */
function byline_sports_archive_capabilities(): array
{
    return array_fill_keys([
        'edit_post', 'delete_post', 'edit_posts', 'edit_others_posts', 'publish_posts',
        'read_private_posts', 'delete_posts', 'delete_private_posts', 'delete_published_posts',
        'delete_others_posts', 'edit_private_posts', 'edit_published_posts', 'create_posts',
    ], 'do_not_allow');
}

function byline_sports_archive_block(string $name, string $html): string
{
    return '<!-- wp:' . $name . ' -->' . $html . '<!-- /wp:' . $name . ' -->';
}

function byline_sports_archive_heading(string $text, int $level = 2, string $id = ''): string
{
    $html = '<h' . $level . ' class="wp-block-heading"' . ($id !== '' ? ' id="' . esc_attr($id) . '"' : '') . '>' . esc_html($text) . '</h' . $level . '>';
    $attrs = ['level' => $level];
    if ($id !== '') {
        $attrs['anchor'] = $id;
    }
    return '<!-- wp:heading ' . wp_json_encode($attrs) . ' -->' . $html . '<!-- /wp:heading -->';
}

function byline_sports_archive_table(array $headings, array $rows): string
{
    $html = '<figure class="wp-block-table"><table><thead><tr>';
    foreach ($headings as $heading) {
        $html .= '<th>' . esc_html($heading) . '</th>';
    }
    $html .= '</tr></thead><tbody>';
    foreach ($rows as $row) {
        $html .= '<tr>';
        foreach ($row as $cell) {
            $html .= '<td>' . esc_html((string) $cell) . '</td>';
        }
        $html .= '</tr>';
    }
    return '<!-- wp:table {"hasFixedLayout":false} -->' . $html . '</tbody></table></figure><!-- /wp:table -->';
}

function byline_sports_archive_paragraph(string $text): string
{
    return byline_sports_archive_block('paragraph', '<p>' . esc_html($text) . '</p>');
}

function byline_sports_archive_link(string $url, string $label): string
{
    $url = esc_url($url);
    return $url === '' ? '' : byline_sports_archive_block('paragraph', '<p><a href="' . $url . '">' . esc_html($label) . '</a></p>');
}

/** Only published, unprotected source records may be copied to public Pages. */
function byline_sports_archive_sources(string $post_type): array
{
    return array_values(array_filter(get_posts([
        'post_type' => $post_type, 'post_status' => 'publish', 'posts_per_page' => -1,
        'orderby' => 'ID', 'order' => 'ASC', 'no_found_rows' => true,
    ]), static fn($post): bool => $post instanceof WP_Post
        && $post->post_status === 'publish' && empty($post->post_password)));
}

function byline_sports_archive_sport_key(string $sport): string
{
    $slug = sanitize_title($sport);
    if ($slug === 'index') return 'sport-index';
    return preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug) ? $slug : 'sport-' . substr(sha1($sport), 0, 12);
}

function byline_sports_archive_groups(): array
{
    $teams = byline_get_sports_teams();
    $groups = [];
    foreach ([WWH_SPORTS_GAME_POST_TYPE => 'games', WWH_SPORTS_ROSTER_POST_TYPE => 'rosters'] as $post_type => $kind) {
        foreach (byline_sports_archive_sources($post_type) as $post) {
            $team_key = (string) get_post_meta($post->ID, $kind === 'games' ? '_ww_sport_key' : WWH_ROSTER_TEAM_META, true);
            $team = $teams[$team_key] ?? [];
            $sport = trim((string) ($team['sport'] ?? get_post_meta($post->ID, '_ww_sport', true))) ?: 'Other Sports';
            $sport_slug = byline_sports_archive_sport_key($sport);
            $season = $kind === 'games' ? byline_sports_game_season_from_post($post) : byline_sports_roster_season_from_post($post);
            $season = $season ?: 'undated';
            $level = (string) ($team['displayName'] ?? $team['label'] ?? '');
            if ($level === '') {
                $level = trim($sport . ' ' . (string) get_post_meta($post->ID, '_ww_level', true));
                if ($team === [] && $team_key !== '') $level = $team_key;
            }
            $groups[$sport_slug]['sport'] = $sport;
            $groups[$sport_slug]['seasons'][$season][$team_key ?: 'unassigned']['label'] = $level;
            $groups[$sport_slug]['seasons'][$season][$team_key ?: 'unassigned'][$kind][] = $post;
            $team_slug = sanitize_title((string) ($team['slug'] ?? $team_key));
            if ($team_slug !== '') {
                $groups[$sport_slug]['routes']['/sports/' . $team_slug . '/'] = '';
                if ($season !== 'undated') {
                    $groups[$sport_slug]['routes']['/sports/' . $team_slug . '/' . $season . '/'] = 'season-' . $season;
                }
            }
        }
    }
    ksort($groups, SORT_NATURAL | SORT_FLAG_CASE);
    return $groups;
}

function byline_sports_archive_game_content(WP_Post $post): string
{
    $meta = static fn(string $key): string => (string) get_post_meta($post->ID, $key, true);
    $start = $meta('_ww_start_datetime');
    $status = $meta('_ww_game_status') ?: 'upcoming';
    $heading = ($start !== '' ? wwh_format_date_text($start) . ' — ' : 'Date TBA — ') . ($meta('_ww_opponent') ?: get_the_title($post));
    $content = byline_sports_archive_heading($heading, 4, 'game-' . $post->ID);
    $details = [wwh_label_from_value($status), $start !== '' ? wwh_format_time_text($start, '', false) : 'Time TBA', wwh_label_from_value($meta('_ww_site'))];
    $location = $meta('_ww_location_name') ?: $meta('_ww_location');
    $address = $meta('_ww_location_address');
    if ($location !== '') $details[] = $location;
    if ($address !== '' && $address !== $location) $details[] = $address;
    $content .= byline_sports_archive_paragraph(implode(' · ', array_filter($details)));
    if (wwh_sports_game_status_shows_score($status) && $meta('_ww_wildcats_score') !== '' && $meta('_ww_opponent_score') !== '') {
        $content .= byline_sports_archive_paragraph(byline_get_publication_config()['identity']['shortName'] . ' ' . $meta('_ww_wildcats_score') . ' — ' . ($meta('_ww_opponent') ?: 'Opponent') . ' ' . $meta('_ww_opponent_score'));
    }
    if ($meta('_ww_notes') !== '') $content .= byline_sports_archive_paragraph($meta('_ww_notes'));
    $content .= byline_sports_archive_link($meta('_ww_recap_url'), 'Read the recap');
    // Do not truncate linked coverage or expose unpublished/password-protected stories.
    foreach (get_posts([
        'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => -1,
        'meta_key' => WWH_PRIMARY_GAME_META, 'meta_value' => $post->ID, 'orderby' => 'date', 'order' => 'ASC',
    ]) as $story) {
        if ($story instanceof WP_Post && $story->post_status === 'publish' && empty($story->post_password)) {
            $content .= byline_sports_archive_link(get_permalink($story), get_the_title($story));
        }
    }
    return $content;
}

function byline_sports_archive_roster_content(WP_Post $post): string
{
    $content = byline_sports_archive_heading(get_the_title($post) ?: 'Roster', 4, 'roster-' . $post->ID);
    $players = get_post_meta($post->ID, WWH_ROSTER_PLAYERS_META, true);
    $staff = get_post_meta($post->ID, WWH_ROSTER_STAFF_META, true);
    $rows = [];
    foreach (is_array($players) ? $players : [] as $player) {
        if (!is_array($player)) continue;
        $rows[] = [$player['number'] ?? '', $player['name'] ?? '', $player['position'] ?? '', $player['grade'] ?? ''];
    }
    if ($rows !== []) $content .= byline_sports_archive_table(['Number', 'Name', 'Position', 'Grade'], $rows);
    $rows = [];
    foreach (is_array($staff) ? $staff : [] as $member) {
        if (!is_array($member)) continue;
        $rows[] = [$member['name'] ?? '', $member['role'] ?? ''];
    }
    if ($rows !== []) $content .= byline_sports_archive_table(['Staff', 'Role'], $rows);
    return $content;
}

function byline_sports_archive_sport_content(array $group): string
{
    $content = byline_sports_archive_paragraph('Historical records preserved from the sports database. This is a fixed archive, not a live schedule.');
    $seasons = $group['seasons'];
    krsort($seasons, SORT_NATURAL);
    foreach (array_keys($seasons) as $season) {
        $content .= byline_sports_archive_link('#season-' . $season, $season === 'undated' ? 'Undated records' : $season);
    }
    foreach ($seasons as $season => $teams) {
        $content .= byline_sports_archive_heading($season === 'undated' ? 'Undated records' : $season, 2, 'season-' . $season);
        uasort($teams, static fn(array $a, array $b): int => strcasecmp($a['label'], $b['label']));
        foreach ($teams as $team) {
            $content .= byline_sports_archive_heading($team['label'], 3);
            $games = $team['games'] ?? [];
            usort($games, static function (WP_Post $a, WP_Post $b): int {
                $left = (string) get_post_meta($a->ID, '_ww_start_datetime', true);
                $right = (string) get_post_meta($b->ID, '_ww_start_datetime', true);
                return strcmp($left ?: '9999', $right ?: '9999') ?: ($a->ID <=> $b->ID);
            });
            foreach ($games as $game) $content .= byline_sports_archive_game_content($game);
            foreach ($team['rosters'] ?? [] as $roster) $content .= byline_sports_archive_roster_content($roster);
        }
    }
    return $content;
}

/** Reuse only migration-owned pages; never overwrite editor-authored content. */
function byline_sports_archive_ensure_page(string $key, string $title, string $content, array $routes)
{
    $marker = '<!-- byline-sports-archive:' . $key . ' -->';
    $content = $marker . $content;
    $existing = get_posts([
        'post_type' => 'page', 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash'], 'posts_per_page' => 1,
        'meta_key' => BYLINE_SPORTS_ARCHIVE_KEY_META, 'meta_value' => $key,
    ]);
    // Recover an interrupted insert even if its metadata write failed. The
    // marker is generated by this migration, never inferred from a Page title.
    if ($existing === []) {
        foreach (get_posts(['post_type' => 'page', 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash'], 'posts_per_page' => -1]) as $candidate) {
            if ($candidate instanceof WP_Post && strpos($candidate->post_content, $marker) === 0) {
                update_post_meta($candidate->ID, BYLINE_SPORTS_ARCHIVE_KEY_META, $key);
                update_post_meta($candidate->ID, BYLINE_SPORTS_ARCHIVE_ROUTES_META, $routes);
                $existing = [$candidate];
                break;
            }
        }
    }
    if ($existing !== []) {
        $post = $existing[0];
        return $post instanceof WP_Post && $post->post_status === 'publish' && empty($post->post_password)
            && get_post_meta($post->ID, BYLINE_SPORTS_ARCHIVE_KEY_META, true) === $key
            && is_array(get_post_meta($post->ID, BYLINE_SPORTS_ARCHIVE_ROUTES_META, true))
            ? $post : new WP_Error('byline_archive_page_unpublished', 'Restore or publish the existing sports archive Page before retrying.');
    }
    $id = wp_insert_post(wp_slash([
        'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $title,
        'post_name' => $key === 'index' ? 'sports-archive' : 'sports-archive-' . $key,
        'post_content' => $content,
        'post_excerpt' => $key === 'index' ? 'Historical schedules, results, and rosters organized by sport.' : $title . ': historical schedules, results, and rosters.',
        'meta_input' => [BYLINE_SPORTS_ARCHIVE_KEY_META => $key, BYLINE_SPORTS_ARCHIVE_ROUTES_META => $routes, BYLINE_PAGE_EYEBROW_META => 'Sports Archive'],
    ]), true);
    if (is_wp_error($id)) return $id;
    $post = get_post($id);
    if (!$post instanceof WP_Post || $post->post_status !== 'publish'
        || get_post_meta($id, BYLINE_SPORTS_ARCHIVE_KEY_META, true) !== $key
        || get_post_meta($id, BYLINE_SPORTS_ARCHIVE_ROUTES_META, true) !== $routes) {
        return new WP_Error('byline_archive_page_failed', 'The sports archive Page could not be saved completely.');
    }
    return $post;
}

/** Release only this request's lock, including after an expired owner resumes. */
function byline_sports_archive_release_lock(int $owner): void
{
    global $wpdb;
    $wpdb->delete($wpdb->options, ['option_name' => BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, 'option_value' => (string) $owner]);
    wp_cache_delete(BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, 'options');
}

/** Direct links from old article cards to the preserved game in its normal Page. */
function byline_sports_archive_game_url(int $post_id): string
{
    $team_key = (string) get_post_meta($post_id, '_ww_sport_key', true);
    $team = byline_get_sports_teams()[$team_key] ?? [];
    $sport = trim((string) ($team['sport'] ?? get_post_meta($post_id, '_ww_sport', true))) ?: 'Other Sports';
    $key = byline_sports_archive_sport_key($sport);
    $pages = get_posts([
        'post_type' => 'page', 'post_status' => 'publish', 'posts_per_page' => 1,
        'meta_key' => BYLINE_SPORTS_ARCHIVE_KEY_META, 'meta_value' => $key,
    ]);
    return isset($pages[0]) && $pages[0] instanceof WP_Post ? '/' . $pages[0]->post_name . '/#game-' . $post_id : '';
}

/** Runs once through the normal activation/admin upgrade coordinator. */
function byline_migrate_sports_archive()
{
    if ((int) get_option(BYLINE_SPORTS_ARCHIVE_VERSION_OPTION, 0) >= BYLINE_SPORTS_ARCHIVE_VERSION) return true;
    $lock = get_option(BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, null);
    if (is_numeric($lock) && (int) $lock < time() - 900) {
        global $wpdb;
        // Compare-and-delete prevents a stale request from releasing another owner's lock.
        $wpdb->delete($wpdb->options, ['option_name' => BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, 'option_value' => (string) $lock]);
        wp_cache_delete(BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, 'options');
    }
    $owner = time();
    if (!add_option(BYLINE_SPORTS_ARCHIVE_LOCK_OPTION, $owner, '', false)) {
        return new WP_Error('byline_archive_locked', 'Sports archive conversion is already running. Retry shortly.');
    }
    try {
        $groups = byline_sports_archive_groups();
        $index = byline_sports_archive_paragraph('Historical schedules, results, and rosters, organized by sport and season. These records are a fixed archive; follow current sports reporting for new coverage.');
        $index .= byline_sports_archive_link('/category/sports/', 'Current sports coverage');
        foreach ($groups as $key => $group) {
            $page = byline_sports_archive_ensure_page($key, $group['sport'] . ' Archive', byline_sports_archive_sport_content($group), $group['routes'] ?? []);
            if (is_wp_error($page)) return $page;
            $index .= byline_sports_archive_heading($group['sport']);
            $index .= byline_sports_archive_link('/' . $page->post_name . '/', 'View ' . $group['sport'] . ' records');
        }
        if ($groups === []) $index .= byline_sports_archive_paragraph('No published sports records were available at conversion.');
        $page = byline_sports_archive_ensure_page('index', 'Sports Archive', $index, ['/sports/' => '', '/sports/schedule/' => '']);
        if (is_wp_error($page)) return $page;
        update_option(BYLINE_SPORTS_ARCHIVE_VERSION_OPTION, BYLINE_SPORTS_ARCHIVE_VERSION, false);
        if ((int) get_option(BYLINE_SPORTS_ARCHIVE_VERSION_OPTION, 0) !== BYLINE_SPORTS_ARCHIVE_VERSION) return false;
        if (function_exists('byline_schedule_deployment')) byline_schedule_deployment('sports-archive');
        return true;
    } finally {
        byline_sports_archive_release_lock($owner);
    }
}

/** Public routing metadata contains only validated historical paths and anchors. */
function byline_sports_archive_page_metadata(int $post_id): array
{
    $key = get_post_meta($post_id, BYLINE_SPORTS_ARCHIVE_KEY_META, true);
    if (!is_string($key) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $key)) return [];
    $stored = get_post_meta($post_id, BYLINE_SPORTS_ARCHIVE_ROUTES_META, true);
    $routes = [];
    foreach (is_array($stored) ? $stored : [] as $path => $anchor) {
        if (is_string($path) && preg_match('~^/sports/(?:[a-z0-9-]+/){0,2}$~', $path)
            && is_string($anchor) && ($anchor === '' || preg_match('/^season-(?:\d{4}-\d{2}|undated)$/', $anchor))) {
            $routes[$path] = $anchor;
        }
    }
    return ['sportsArchive' => ['key' => $key, 'routes' => (object) $routes]];
}
