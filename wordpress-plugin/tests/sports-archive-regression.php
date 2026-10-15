<?php
/** Exercise the real one-time conversion without a WordPress installation. */
define('ABSPATH', __DIR__ . '/../');
const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_ROSTER_TEAM_META = '_ww_roster_team_key';
const WWH_ROSTER_SEASON_META = '_ww_roster_season';
const WWH_ROSTER_PLAYERS_META = '_ww_roster_players';
const WWH_ROSTER_STAFF_META = '_ww_roster_staff';
const WWH_PRIMARY_GAME_META = 'weekly_wildcat_primary_game_id';
const BYLINE_PAGE_EYEBROW_META = '_byline_page_eyebrow';
class WP_Post { public $ID; public $post_type; public $post_status = 'publish'; public $post_password = ''; public $post_name = ''; public $post_title = ''; public $post_content = ''; public $post_excerpt = ''; }
class WP_Error { public $code; public function __construct($code, $message) { $this->code = $code; } }
$posts = []; $meta = []; $options = []; $fail_insert = ''; $fail_meta_once = false; $deployments = 0;
function is_wp_error($v): bool { return $v instanceof WP_Error; }
function esc_html($v): string { return htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8'); }
function esc_attr($v): string { return esc_html($v); }
function esc_url($v): string { return preg_match('~^(?:https?://|/|#)~', (string) $v) ? esc_attr($v) : ''; }
function wp_json_encode($v): string { return json_encode($v); }
function wp_slash($v) { return $v; }
function sanitize_title($v): string { return trim(strtolower(preg_replace('/[^a-z0-9]+/i', '-', $v)), '-'); }
function get_option($key, $default = false) { global $options; return $options[$key] ?? $default; }
function update_option($key, $value, ...$args): bool { global $options; $options[$key] = $value; return true; }
function add_option($key, $value, ...$args): bool { global $options; if (array_key_exists($key, $options)) return false; $options[$key] = $value; return true; }
function delete_option($key): void { global $options; unset($options[$key]); }
function wp_cache_delete(...$args): void {}
$wpdb = new class {
    public $options = 'wp_options';
    public function delete($table, $where): void {
        global $options;
        if ((string) get_option($where['option_name']) === $where['option_value']) unset($options[$where['option_name']]);
    }
};
function get_post_meta($id, $key, $single = true) { global $meta; return $meta[$id][$key] ?? ''; }
function update_post_meta($id, $key, $value): bool { global $meta; $meta[$id][$key] = $value; return true; }
function get_post($id) { global $posts; return $posts[$id] ?? null; }
function get_the_title($post): string { return $post->post_title; }
function get_permalink($post): string { return '/story-' . $post->ID . '/'; }
function get_posts(array $args): array {
    global $posts;
    $found = array_values(array_filter($posts, static function ($p) use ($args) {
        return $p->post_type === $args['post_type']
            && (($args['post_status'] ?? '') === 'any' || (is_array($args['post_status']) ? in_array($p->post_status, $args['post_status'], true) : $p->post_status === $args['post_status']))
            && (!isset($args['meta_key']) || (string) get_post_meta($p->ID, $args['meta_key']) === (string) $args['meta_value']);
    }));
    return ($args['posts_per_page'] ?? -1) > 0 ? array_slice($found, 0, $args['posts_per_page']) : $found;
}
function wp_insert_post(array $input, bool $error) {
    global $posts, $meta, $fail_insert, $fail_meta_once;
    if ($fail_insert === $input['post_name']) return new WP_Error('insert_failed', 'Simulated failure');
    $post = new WP_Post(); $post->ID = max(array_keys($posts) ?: [0]) + 1;
    foreach ($input as $key => $value) if ($key !== 'meta_input') $post->$key = $value;
    $slug = $post->post_name; $suffix = 2;
    while (array_filter($posts, static fn($p): bool => $p->post_name === $post->post_name)) $post->post_name = $slug . '-' . $suffix++;
    $posts[$post->ID] = $post;
    if ($fail_meta_once) $fail_meta_once = false; else $meta[$post->ID] = $input['meta_input'];
    return $post->ID;
}
function byline_get_sports_teams(): array { return [
    'football-varsity' => ['sport' => 'Football', 'displayName' => 'Football Varsity', 'slug' => 'football-varsity'],
    'football-jv' => ['sport' => 'Football', 'displayName' => 'Football JV', 'slug' => 'football-jv'],
]; }
function byline_sports_game_season_from_post($p): string { return get_post_meta($p->ID, '_ww_import_season'); }
function byline_sports_roster_season_from_post($p): string { return get_post_meta($p->ID, WWH_ROSTER_SEASON_META); }
function wwh_format_date_text($v): string { return substr($v, 0, 10); }
function wwh_format_time_text($v, ...$args): string { return substr($v, 11); }
function wwh_label_from_value($v): string { return ucfirst($v); }
function wwh_sports_game_status_shows_score($v): bool { return in_array($v, ['final', 'tie'], true); }
function byline_get_publication_config(): array { return ['identity' => ['shortName' => 'Wildcats']]; }
function byline_schedule_deployment(...$args): void { global $deployments; $deployments++; }
function archive_assert(bool $condition, string $message): void { if (!$condition) { fwrite(STDERR, $message . "\n"); exit(1); } }
function source(int $id, string $type, array $values, string $status = 'publish'): WP_Post {
    global $posts, $meta;
    $p = new WP_Post(); $p->ID = $id; $p->post_type = $type; $p->post_title = 'Record ' . $id; $p->post_status = $status;
    $posts[$id] = $p; $meta[$id] = $values; return $p;
}
require __DIR__ . '/../includes/sports/archive.php';

$base = ['_ww_sport_key' => 'football-varsity', '_ww_import_season' => '2025-26', '_ww_opponent' => 'Academy', '_ww_game_status' => 'final', '_ww_start_datetime' => '2025-09-01T19:30:00', '_ww_wildcats_score' => '0', '_ww_opponent_score' => '7'];
source(1, WWH_SPORTS_GAME_POST_TYPE, $base);
source(2, WWH_SPORTS_GAME_POST_TYPE, array_merge($base, ['_ww_sport_key' => 'football-jv', '_ww_start_datetime' => '', '_ww_game_status' => 'canceled', '_ww_notes' => '<script>alert(1)</script>', '_ww_recap_url' => 'javascript:alert(1)']));
source(3, WWH_SPORTS_GAME_POST_TYPE, array_merge($base, ['_ww_import_season' => '2024-25', '_ww_game_status' => 'forfeit']));
source(4, WWH_SPORTS_GAME_POST_TYPE, array_merge($base, ['_ww_opponent' => 'PRIVATE']), 'private');
source(5, WWH_SPORTS_GAME_POST_TYPE, array_merge($base, ['_ww_opponent' => 'DRAFT']), 'draft');
source(6, WWH_SPORTS_GAME_POST_TYPE, array_merge($base, ['_ww_opponent' => 'PASSWORD']))->post_password = 'hidden';
source(7, WWH_SPORTS_ROSTER_POST_TYPE, [WWH_ROSTER_TEAM_META => 'football-varsity', WWH_ROSTER_SEASON_META => '2025-26', WWH_ROSTER_PLAYERS_META => [['name' => "O'Neil", 'number' => '0', 'position' => 'QB', 'grade' => '12']], WWH_ROSTER_STAFF_META => [['name' => 'Coach', 'role' => 'Head coach']]]);
source(8, WWH_SPORTS_ROSTER_POST_TYPE, [WWH_ROSTER_TEAM_META => 'football-varsity', WWH_ROSTER_SEASON_META => '2025-26', WWH_ROSTER_PLAYERS_META => [['name' => 'Second roster']]]);
source(9, WWH_SPORTS_ROSTER_POST_TYPE, [WWH_ROSTER_TEAM_META => 'orphan-team', WWH_ROSTER_PLAYERS_META => [['name' => 'Orphan player']]]);
source(10, 'post', [WWH_PRIMARY_GAME_META => 1]);
source(11, 'post', [WWH_PRIMARY_GAME_META => 1], 'draft')->post_title = 'HIDDEN STORY';
$editor = source(12, 'page', []); $editor->post_name = 'sports-archive-football'; $editor->post_content = 'Editor-owned page';
$original = serialize(array_slice($posts, 0, 11, true));
$original_meta = $meta;
// A half-written insert and an interrupted run must be recoverable without duplicates.
$fail_meta_once = true;
archive_assert(is_wp_error(byline_migrate_sports_archive()), 'An incomplete insert must fail conversion.');
archive_assert(get_option(BYLINE_SPORTS_ARCHIVE_VERSION_OPTION, 0) === 0, 'Failed conversion must not advance its version marker.');
$fail_insert = 'sports-archive-other-sports';
archive_assert(is_wp_error(byline_migrate_sports_archive()), 'Partial conversion should report its failure.');
$fail_insert = '';
archive_assert(byline_migrate_sports_archive() === true, 'Conversion should recover and finish.');
$pages = get_posts(['post_type' => 'page', 'post_status' => 'publish']);
archive_assert(count($pages) === 4, 'Expected one pre-existing Page, one index, and two sport Pages without duplicates.');
$archive = array_values(array_filter($pages, static fn($p): bool => get_post_meta($p->ID, BYLINE_SPORTS_ARCHIVE_KEY_META) === 'football'))[0];
$html = $archive->post_content;
foreach (['Football Varsity', 'Football JV', 'season-2025-26', 'season-2024-25', 'Wildcats 0', 'game-1', 'Date TBA', 'Canceled', 'Forfeit', 'QB', 'Head coach', 'Second roster', '/story-10/'] as $needle) archive_assert(strpos($html, $needle) !== false, 'Archive lost ' . $needle);
foreach (['PRIVATE', 'DRAFT', 'PASSWORD', 'HIDDEN STORY', '<script>', 'javascript:'] as $needle) archive_assert(strpos($html, $needle) === false, 'Archive exposed unsafe/unpublished content: ' . $needle);
archive_assert(strpos($html, 'season-2025-26', strpos($html, '<h2')) < strpos($html, 'season-2024-25', strpos($html, '<h2')), 'Newest season should appear first.');
archive_assert($editor->post_content === 'Editor-owned page' && $archive->post_name === 'sports-archive-football-2', 'Existing Pages must never be overwritten and actual unique slugs must be retained.');
archive_assert(serialize(array_slice($posts, 0, 11, true)) === $original, 'Conversion changed source posts.');
foreach ($original_meta as $id => $values) archive_assert($meta[$id] === $values, 'Conversion changed source metadata.');
$routes = byline_sports_archive_page_metadata($archive->ID)['sportsArchive']['routes'];
archive_assert((array) $routes === ['/sports/football-varsity/' => '', '/sports/football-varsity/2025-26/' => 'season-2025-26', '/sports/football-jv/' => '', '/sports/football-jv/2025-26/' => 'season-2025-26', '/sports/football-varsity/2024-25/' => 'season-2024-25'], 'Historical aliases must point at their archive season.');
$export_pages = [];
foreach ($pages as $page) {
    if ($page === $editor) continue;
    $export_pages[] = [
        'id' => $page->ID + 9000, 'slug' => $page->post_name,
        'date' => '2026-10-15T12:00:00', 'modified' => '2026-10-15T12:00:00',
        'title' => ['rendered' => $page->post_title], 'excerpt' => ['rendered' => $page->post_excerpt],
        'content' => ['rendered' => $page->post_content], 'bylinePage' => byline_sports_archive_page_metadata($page->ID),
    ];
}
$archive->post_content = 'An editor corrected the archive';
archive_assert(byline_migrate_sports_archive() === true && $archive->post_content === 'An editor corrected the archive' && count(get_posts(['post_type' => 'page', 'post_status' => 'publish'])) === 4 && $deployments === 1, 'Completed conversion must be a no-op, preserving later Page edits.');
$options[BYLINE_SPORTS_ARCHIVE_VERSION_OPTION] = 0;
$archive->post_status = 'trash';
archive_assert(is_wp_error(byline_migrate_sports_archive()), 'A trashed migration Page must require restoration, not be recreated.');
$archive->post_status = 'publish';
$options[BYLINE_SPORTS_ARCHIVE_LOCK_OPTION] = time();
archive_assert(is_wp_error(byline_migrate_sports_archive()), 'Concurrent conversions must not write duplicate Pages.');
$options[BYLINE_SPORTS_ARCHIVE_LOCK_OPTION] = time() - 1000;
archive_assert(byline_migrate_sports_archive() === true && count(get_posts(['post_type' => 'page', 'post_status' => 'publish'])) === 4, 'A stale lock should recover without duplicating or overwriting archive Pages.');
archive_assert(byline_sports_archive_game_url(1) === '/sports-archive-football-2/#game-1', 'Existing game cards should link directly to the actual archive Page.');
archive_assert(count(array_unique(byline_sports_archive_capabilities())) === 1 && byline_sports_archive_capabilities()['edit_post'] === 'do_not_allow', 'Retained sports CPTs must deny editing.');
echo in_array('--export-pages', $argv, true) ? json_encode($export_pages, JSON_PRETTY_PRINT) : "Sports archive conversion regression passed.\n";
