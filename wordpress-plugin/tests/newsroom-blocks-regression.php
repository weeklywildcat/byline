<?php

define('ABSPATH', __DIR__ . '/../');
define('WWH_SPORTS_GAME_POST_TYPE', 'ww_sports_game');
define('WWH_SCHOOL_EVENT_POST_TYPE', 'ww_school_event');
define('WWH_PRIMARY_GAME_META', 'weekly_wildcat_primary_game_id');
define('BYLINE_POLL_POST_TYPE', 'byline_poll');
define('BYLINE_POLL_STATUS_DRAFT', 'draft');
define('BYLINE_POLL_STATUS_OPEN', 'open');
define('BYLINE_POLL_STATUS_CLOSED', 'closed');

class WP_Post
{
    public $ID;
    public $post_type;
    public $post_status;
    public $post_author;
    public $post_name;
    public $post_title;
    public $post_content;
    public $post_date;
    public $post_date_gmt;
    public $post_modified_gmt;

    public function __construct(array $values)
    {
        foreach ($values as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

class WP_User
{
    public $ID;
    public $display_name;
    public $user_nicename;
    public $user_url;

    public function __construct(array $values)
    {
        foreach ($values as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

class WP_REST_Response
{
    public $data;

    public function __construct($data)
    {
        $this->data = $data;
    }
}

$newsroom_test = [
    'posts' => [],
    'meta' => [],
    'users' => [],
    'blocks' => [],
    'styles' => [],
    'bindings' => [],
    'routes' => [],
    'patterns' => [],
    'queries' => [],
    'current_post_id' => 101,
    'poll_record' => null,
];

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_block_type($path, $args = []): void { global $newsroom_test; $newsroom_test['blocks'][(string) $path] = $args; }
function register_block_style($name, $style): void { global $newsroom_test; $newsroom_test['styles'][$name][] = $style; }
function register_block_bindings_source($name, $args): void { global $newsroom_test; $newsroom_test['bindings'][$name] = $args; }
function register_rest_route($namespace, $route, $args): void { global $newsroom_test; $newsroom_test['routes'][$namespace . $route] = $args; }
function register_block_pattern($name, $args): void { global $newsroom_test; $newsroom_test['patterns'][$name] = $args; }
function current_user_can($capability, $post_id = null): bool { return $capability === 'edit_posts' || $capability === 'edit_byline_poll' || $capability === 'edit_post'; }
function rest_ensure_response($data) { return new WP_REST_Response($data); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_key($value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_html_class($value): string { return sanitize_key($value); }
function absint($value): int { return max(0, (int) abs((int) $value)); }
function esc_attr($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_url($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_url_raw($value): string { return (string) $value; }
function sanitize_email($value): string { return filter_var((string) $value, FILTER_SANITIZE_EMAIL); }
function wp_kses_post($value): string { return (string) $value; }
function wp_json_encode($value, $flags = 0): string { return (string) json_encode($value, $flags); }
function wp_timezone(): DateTimeZone { return new DateTimeZone('America/New_York'); }
function get_block_wrapper_attributes(): string { return 'class="wp-block-byline-page-section"'; }
function wp_unique_id($prefix = ''): string { static $id = 0; $id++; return $prefix . $id; }
function plugins_url($path, $plugin = ''): string { return '/plugins/' . ltrim((string) $path, '/'); }
function get_the_ID(): int { global $newsroom_test; return (int) $newsroom_test['current_post_id']; }
function get_option($name, $default = null) { return $default; }
function get_post($id) { global $newsroom_test; foreach ($newsroom_test['posts'] as $post) if ((int) $post->ID === (int) $id) return $post; return null; }
function get_post_meta($post_id, $key, $single = false) { global $newsroom_test; return $newsroom_test['meta'][(int) $post_id][$key] ?? ($single ? '' : []); }
function get_user_meta($user_id, $key, $single = false) { global $newsroom_test; return $newsroom_test['meta']['user_' . (int) $user_id][$key] ?? ($single ? '' : []); }
function get_users($args = []) { global $newsroom_test; return array_values($newsroom_test['users']); }
function get_userdata($id) { global $newsroom_test; return $newsroom_test['users'][(int) $id] ?? null; }
function get_author_posts_url($id, $slug = ''): string { return '/author/' . ($slug ?: (int) $id) . '/'; }
function get_the_title($post): string { return $post instanceof WP_Post ? (string) $post->post_title : ''; }
function get_permalink($post): string { return '/story/' . (($post instanceof WP_Post) ? $post->post_name : '') . '/'; }
function get_post_thumbnail_id($post_id): int { global $newsroom_test; return absint($newsroom_test['meta'][(int) $post_id]['thumbnail_id'] ?? 0); }
function get_the_date($format, $post): string { return $post instanceof WP_Post ? date('M j, Y', strtotime((string) $post->post_date)) : ''; }
function get_the_excerpt($post): string { return $post instanceof WP_Post ? (string) ($post->post_excerpt ?? '') : ''; }
function wwh_media_image($id, $size = 'large'): array { return ['id' => (int) $id, 'url' => '/media/' . (int) $id . '.jpg', 'alt' => 'Image ' . (int) $id, 'width' => 800, 'height' => 500]; }
function wwh_author_visible_in_directory($id): bool { return (int) $id !== 99; }
function wwh_rest_author_profile(array $user): array { $id = (int) ($user['id'] ?? 0); return ['role' => (string) get_user_meta($id, '_ww_author_role', true), 'profilePhoto' => [], 'socials' => $id === 11 ? ['twitter' => 'https://social.example/alex'] : []]; }
function wwh_game_center_url($id): string { return '/sports/schedule/#game-' . (int) $id; }
function wwh_meta_value($post_id, $key, $default = '') { global $newsroom_test; $value = $newsroom_test['meta'][(int) $post_id][$key] ?? $default; return is_scalar($value) && (string) $value !== '' ? (string) $value : $default; }
function byline_sports_normalize_season($value): string { return (string) $value; }
function byline_sports_current_season($timestamp = null): string { return '2026-27'; }
function byline_sports_team_seasons($team = '', $published = false): array { return ['2026-27']; }
function byline_sports_game_ids_for_season($season, $team = '', $published = true): array
{
    global $newsroom_test;
    $ids = [];
    foreach ($newsroom_test['posts'] as $post) {
        if (!$post instanceof WP_Post || $post->post_type !== WWH_SPORTS_GAME_POST_TYPE) {
            continue;
        }
        if ($published && $post->post_status !== 'publish') {
            continue;
        }
        if ($team !== '' && wwh_meta_value($post->ID, '_ww_sport_key') !== sanitize_key($team)) {
            continue;
        }
        if (wwh_meta_value($post->ID, '_ww_import_season') === (string) $season) {
            $ids[] = (int) $post->ID;
        }
    }
    return $ids;
}
function byline_get_publication_config(): array { return ['identity' => ['name' => 'Example Publication', 'shortName' => 'Example'], 'urls' => ['publicSite' => 'https://example.test', 'contact' => '/contact/'], 'branding' => ['masthead' => ['url' => '/masthead.svg', 'alt' => 'Example']]]; }
function byline_publication_absolute_url($url): string { return strpos((string) $url, 'http') === 0 ? (string) $url : 'https://example.test/' . ltrim((string) $url, '/'); }
function byline_poll_record(WP_Post $post): array { global $newsroom_test; return is_array($newsroom_test['poll_record']) ? $newsroom_test['poll_record'] : []; }
function byline_poll_active_record() { global $newsroom_test; return $newsroom_test['poll_record']; }
function byline_poll_find_post_by_public_id($id) { return get_post(301); }
function byline_poll_votes_table_exists(): bool { return false; }
function byline_poll_record_is_open(array $record): bool { return true; }
function newsroom_test_parse_block_sequence(string $content, int &$offset, ?string $closing_name = null, ?int &$closing_position = null): array
{
    $blocks = [];
    $length = strlen($content);
    while ($offset < $length && preg_match('/<!--\s*(\/?)wp:([^\s>]+)(.*?)-->/s', $content, $match, PREG_OFFSET_CAPTURE, $offset) === 1) {
        $full = (string) $match[0][0];
        $position = (int) $match[0][1];
        $offset = $position + strlen($full);
        $is_closing = (string) $match[1][0] === '/';
        $name = (string) $match[2][0];
        $tail = trim((string) $match[3][0]);
        if ($is_closing) {
            if ($closing_name === $name) {
                $closing_position = $position;
                return $blocks;
            }
            continue;
        }

        $self_closing = substr($tail, -1) === '/';
        if ($self_closing) {
            $tail = trim(substr($tail, 0, -1));
        }
        $attrs = $tail !== '' ? json_decode($tail, true) : [];
        $block_name = strpos($name, '/') === false ? 'core/' . $name : $name;
        $block = [
            'blockName' => $block_name,
            'attrs' => is_array($attrs) ? $attrs : [],
            'innerBlocks' => [],
            'innerHTML' => '',
            'innerContent' => [],
            '_test_start' => $position,
            '_test_end' => $offset,
        ];
        if (!$self_closing) {
            $inner_start = $offset;
            $child_closing_position = null;
            $block['innerBlocks'] = newsroom_test_parse_block_sequence($content, $offset, $name, $child_closing_position);
            $inner_end = $child_closing_position === null ? $offset : $child_closing_position;
            $cursor = $inner_start;
            foreach ($block['innerBlocks'] as $child) {
                $child_start = (int) ($child['_test_start'] ?? $cursor);
                $child_end = (int) ($child['_test_end'] ?? $child_start);
                if ($child_start > $cursor) {
                    $block['innerContent'][] = substr($content, $cursor, $child_start - $cursor);
                }
                $block['innerContent'][] = null;
                $cursor = $child_end;
            }
            if ($cursor < $inner_end) {
                $block['innerContent'][] = substr($content, $cursor, $inner_end - $cursor);
            }
            $block['innerHTML'] = implode('', array_filter($block['innerContent'], 'is_string'));
            $block['_test_end'] = $offset;
        }
        $blocks[] = $block;
    }

    return $blocks;
}

function parse_blocks($content): array
{
    if ($content === 'manual') {
        return [['blockName' => 'byline/game-score', 'attrs' => ['source' => 'manual', 'gameId' => 202], 'innerBlocks' => []]];
    }
    if ($content === '') {
        return [];
    }

    $offset = 0;
    return newsroom_test_parse_block_sequence((string) $content, $offset);
}

function serialize_blocks(array $blocks): string
{
    return implode("\n", array_map('byline_serialize_page_block', $blocks));
}

function get_posts($args = []): array
{
    global $newsroom_test;
    $newsroom_test['queries'][] = $args;
    $posts = array_values(array_filter($newsroom_test['posts'], static function (WP_Post $post) use ($args): bool {
        if (isset($args['post_type']) && $post->post_type !== $args['post_type']) return false;
        if (isset($args['post_status']) && is_string($args['post_status']) && $post->post_status !== $args['post_status']) return false;
        if (isset($args['post_status']) && is_array($args['post_status']) && !in_array($post->post_status, $args['post_status'], true)) return false;
        if (isset($args['post__in']) && !in_array((int) $post->ID, array_map('intval', $args['post__in']), true)) return false;
        if (isset($args['author']) && (int) $post->post_author !== (int) $args['author']) return false;
        if (isset($args['cat']) && (int) $args['cat'] !== 7) return false;
        foreach (($args['meta_query'] ?? []) as $clause) {
            if (!is_array($clause) || !isset($clause['key'])) continue;
            $actual = (string) wwh_meta_value($post->ID, (string) $clause['key']);
            $expected = (string) ($clause['value'] ?? '');
            $compare = strtoupper((string) ($clause['compare'] ?? '='));
            if ($compare === '>=' && $actual < $expected) return false;
            if ($compare === '>' && $actual <= $expected) return false;
            if ($compare === '<=' && $actual > $expected) return false;
            if ($compare === '<' && $actual >= $expected) return false;
            if ($compare === '=' && $actual !== $expected) return false;
        }
        return true;
    }));
    if (($args['orderby'] ?? '') === 'post__in' && isset($args['post__in'])) {
        $order = array_map('intval', $args['post__in']);
        usort($posts, static fn(WP_Post $left, WP_Post $right): int => array_search((int) $left->ID, $order, true) <=> array_search((int) $right->ID, $order, true));
    } elseif (($args['orderby'] ?? '') === 'meta_value' && isset($args['meta_key'])) {
        $meta_key = (string) $args['meta_key'];
        $direction = strtoupper((string) ($args['order'] ?? 'ASC')) === 'DESC' ? -1 : 1;
        usort($posts, static fn(WP_Post $left, WP_Post $right): int => $direction * strcmp((string) wwh_meta_value($left->ID, $meta_key), (string) wwh_meta_value($right->ID, $meta_key)));
    } else {
        usort($posts, static fn(WP_Post $left, WP_Post $right): int => strcmp((string) $right->post_date, (string) $left->post_date));
    }
    $limit = isset($args['numberposts']) && (int) $args['numberposts'] > 0 ? (int) $args['numberposts'] : null;
    return $limit ? array_slice($posts, 0, $limit) : $posts;
}
function wwh_format_sports_game(WP_Post $post): array
{
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
    $status = wwh_meta_value($post->ID, '_ww_game_status', 'upcoming');
    $wildcats = wwh_meta_value($post->ID, '_ww_wildcats_score');
    $opponent = wwh_meta_value($post->ID, '_ww_opponent_score');
    $show = in_array($status, ['final', 'tie', 'forfeit'], true) && $wildcats !== '' && $opponent !== '';
    $opponent_name = wwh_meta_value($post->ID, '_ww_opponent');
    return ['id' => $post->ID, 'title' => $post->post_title, 'opponent' => $opponent_name, 'teamLabel' => 'Team', 'sportLabel' => 'Sport', 'status' => $status, 'startDate' => $start, 'locationName' => wwh_meta_value($post->ID, '_ww_location_name'), 'recapUrl' => '', 'display' => ['matchup' => 'Team vs. ' . $opponent_name, 'date' => $start, 'location' => wwh_meta_value($post->ID, '_ww_location_name'), 'status' => ucfirst($status), 'score' => $show ? $wildcats . '–' . $opponent : null, 'sportLevel' => 'Sport', 'scoreboard' => ['team' => ['label' => 'Team', 'score' => $show ? (int) $wildcats : null], 'opponent' => ['label' => $opponent_name, 'score' => $show ? (int) $opponent : null]]], 'team' => ['logo' => ['url' => '', 'alt' => '']]];
}
function wwh_format_school_event(WP_Post $post): array { $start = wwh_meta_value($post->ID, '_ww_event_start_datetime'); return ['id' => $post->ID, 'title' => $post->post_title, 'eventType' => wwh_meta_value($post->ID, '_ww_event_type'), 'startDate' => $start, 'endDate' => '', 'allDay' => wwh_meta_value($post->ID, '_ww_event_all_day') === '1', 'location' => wwh_meta_value($post->ID, '_ww_event_location'), 'description' => '', 'externalUrl' => '', 'display' => ['date' => $start, 'time' => '7:00 PM', 'status' => 'Scheduled']]; }
function wwh_parse_local_datetime(string $value): ?DateTimeImmutable { $date = DateTimeImmutable::createFromFormat('!Y-m-d\\TH:i', $value, wp_timezone()); return $date instanceof DateTimeImmutable ? $date : null; }

$newsroom_test['users'] = [
    11 => new WP_User(['ID' => 11, 'display_name' => 'Alex Reporter', 'user_nicename' => 'alex-reporter']),
    12 => new WP_User(['ID' => 12, 'display_name' => 'Sam Editor', 'user_nicename' => 'sam-editor']),
    99 => new WP_User(['ID' => 99, 'display_name' => 'Hidden User', 'user_nicename' => 'hidden-user']),
];
$newsroom_test['meta']['user_11']['_ww_author_role'] = 'Editor';
$newsroom_test['meta']['user_12']['_ww_author_role'] = 'Reporter';
$newsroom_test['posts'] = [
    new WP_Post(['ID' => 101, 'post_type' => 'post', 'post_status' => 'publish', 'post_author' => 11, 'post_name' => 'first-story', 'post_title' => 'First Story', 'post_content' => '<!-- wp:byline/game-score {"source":"primary"} /-->', 'post_date' => '2026-08-20 12:00:00', 'post_date_gmt' => '2026-08-20 16:00:00']),
    new WP_Post(['ID' => 102, 'post_type' => 'post', 'post_status' => 'publish', 'post_author' => 12, 'post_name' => 'second-story', 'post_title' => 'Second Story', 'post_content' => '', 'post_date' => '2026-08-21 12:00:00', 'post_date_gmt' => '2026-08-21 16:00:00']),
    new WP_Post(['ID' => 103, 'post_type' => 'post', 'post_status' => 'draft', 'post_author' => 11, 'post_name' => 'draft-story', 'post_title' => 'Draft Story', 'post_content' => '', 'post_date' => '2026-08-22 12:00:00', 'post_date_gmt' => '2026-08-22 16:00:00']),
    new WP_Post(['ID' => 201, 'post_type' => 'ww_sports_game', 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'final-game', 'post_title' => 'Final Game', 'post_content' => '', 'post_date' => '2026-08-20 12:00:00', 'post_date_gmt' => '2026-08-20 16:00:00']),
    new WP_Post(['ID' => 202, 'post_type' => 'ww_sports_game', 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'upcoming-game', 'post_title' => 'Upcoming Game', 'post_content' => '', 'post_date' => '2026-08-21 12:00:00', 'post_date_gmt' => '2026-08-21 16:00:00']),
    new WP_Post(['ID' => 250, 'post_type' => 'ww_school_event', 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'event', 'post_title' => 'Community Forum', 'post_content' => '', 'post_date' => '2026-08-21 12:00:00', 'post_date_gmt' => '2026-08-21 16:00:00']),
    new WP_Post(['ID' => 301, 'post_type' => 'byline_poll', 'post_status' => 'publish', 'post_author' => 11, 'post_name' => 'poll', 'post_title' => 'What should we cover?', 'post_content' => '', 'post_date' => '2026-08-21 12:00:00', 'post_date_gmt' => '2026-08-21 16:00:00']),
];
$newsroom_test['meta'][201] = ['_ww_start_datetime' => '2026-08-20T19:00', '_ww_import_season' => '2026-27', '_ww_game_status' => 'final', '_ww_wildcats_score' => '3', '_ww_opponent_score' => '1', '_ww_opponent' => 'Rivals', '_ww_sport_key' => 'varsity'];
$newsroom_test['meta'][202] = ['_ww_start_datetime' => '2099-09-20T19:00', '_ww_import_season' => '2026-27', '_ww_game_status' => 'upcoming', '_ww_opponent' => 'Future Academy', '_ww_sport_key' => 'varsity'];
$newsroom_test['meta'][250] = ['_ww_event_start_datetime' => '2099-09-21T19:00', '_ww_event_type' => 'community', '_ww_event_location' => 'Library'];
$newsroom_test['meta'][101][WWH_PRIMARY_GAME_META] = 201;
$newsroom_test['poll_record'] = ['id' => 'poll_test', 'postId' => 301, 'question' => 'What should we cover?', 'status' => 'open', 'options' => [['id' => 'news', 'label' => 'News'], ['id' => 'sports', 'label' => 'Sports']]];

require __DIR__ . '/../includes/content/newsroom-blocks.php';

function newsroom_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function newsroom_assert_no_nested_anchors(string $html, string $message): void
{
    if (preg_match_all('/<a\b[^>]*>.*?<\/a>/is', $html, $matches) === false) {
        newsroom_assert(false, $message);
    }
    foreach ($matches[0] as $anchor) {
        newsroom_assert(preg_match('/<a\b/i', substr($anchor, strpos($anchor, '>') + 1)) !== 1, $message);
    }
}

byline_newsroom_register_block_types();
newsroom_assert(count($newsroom_test['blocks']) === 7, 'All seven newsroom blocks should be registered.');
newsroom_assert(count(array_filter(array_keys($newsroom_test['blocks']), static fn(string $path): bool => strpos($path, '/blocks/') !== false)) === 7, 'Newsroom block registration should be metadata-driven.');

byline_newsroom_register_core_styles();
$style_names = array_merge(...array_values($newsroom_test['styles']));
foreach (['byline-editorial-callout', 'byline-soft-callout', 'byline-rule-top', 'byline-primary', 'byline-outline', 'byline-text-link', 'byline-standard-cta', 'byline-compact', 'byline-editorial-quote', 'byline-source-quote', 'byline-feature-quote', 'byline-editorial-rule', 'byline-heavy-rule', 'byline-faq', 'byline-editorial', 'byline-feature', 'byline-news-grid', 'byline-feature-grid', 'byline-resource-list', 'byline-link-list'] as $name) {
    newsroom_assert(in_array($name, array_column($style_names, 'name'), true), "Missing reusable Core style {$name}.");
}

byline_newsroom_register_bindings();
newsroom_assert(isset($newsroom_test['bindings']['byline/publication']), 'The publication binding source should be feature-detected and registered.');
newsroom_assert(byline_newsroom_publication_binding_value(['key' => 'shortName']) === 'Example', 'Publication bindings should expose canonical identity data.');
newsroom_assert(byline_newsroom_publication_binding_value(['key' => 'privateOption']) === '', 'Publication bindings must reject unknown keys.');

byline_newsroom_register_editor_routes();
newsroom_assert(isset($newsroom_test['routes']['byline/v1/editor/polls']), 'The editor poll picker route should be registered.');
newsroom_assert($newsroom_test['routes']['byline/v1/editor/polls']['permission_callback']() === true, 'The editor poll picker route should be capability-protected.');

byline_newsroom_register_patterns();
foreach (['byline/information-page', 'byline/about-mission-page', 'byline/policy-standards-page', 'byline/join-recruiting-page', 'byline/contact-feedback-page', 'byline/leadership-page', 'byline/staff-directory', 'byline/special-coverage', 'byline/sports-coverage', 'byline/event-campaign', 'byline/photo-led-page', 'byline/resource-page', 'byline/faq-page', 'byline/two-column-image-text', 'byline/featured-cta', 'byline/fact-box', 'byline/key-numbers', 'byline/quote-callout', 'byline/related-resources', 'byline/corrections-feedback-cta', 'byline/sports-game-recap', 'byline/sports-game-preview', 'byline/correction-notice'] as $name) {
    newsroom_assert(isset($newsroom_test['patterns'][$name]), "Missing newsroom pattern {$name}.");
}
foreach ($newsroom_test['patterns'] as $name => $pattern) {
    newsroom_assert(stripos($pattern['content'] ?? '', 'newsletter') === false, "Pattern {$name} must not introduce a newsletter system.");
    newsroom_assert(strpos($pattern['content'] ?? '', 'Weekly Wildcat') === false && strpos($pattern['content'] ?? '', 'Ninety Six') === false, "Pattern {$name} must remain publication-neutral.");
}
newsroom_assert(substr_count($newsroom_test['patterns']['byline/information-page']['content'], '<!-- wp:byline/page-section') === 4, 'The information starter should use four canonical Page Sections.');
foreach (['byline/information-page', 'byline/about-mission-page', 'byline/policy-standards-page', 'byline/join-recruiting-page', 'byline/contact-feedback-page', 'byline/leadership-page', 'byline/staff-directory', 'byline/special-coverage', 'byline/sports-coverage', 'byline/event-campaign', 'byline/photo-led-page', 'byline/resource-page', 'byline/faq-page', 'byline/two-column-image-text', 'byline/featured-cta', 'byline/fact-box', 'byline/key-numbers', 'byline/quote-callout', 'byline/related-resources', 'byline/corrections-feedback-cta'] as $name) {
    $content = (string) $newsroom_test['patterns'][$name]['content'];
    newsroom_assert(strpos($content, '<section') === false, "Page pattern {$name} must not persist a Page Section wrapper.");
    foreach (parse_blocks($content) as $block) {
        if (($block['blockName'] ?? '') !== 'byline/page-section') {
            continue;
        }
        newsroom_assert(($block['innerHTML'] ?? '') === '', "Page pattern {$name} must use the dynamic Page Section save contract.");
        newsroom_assert(count($block['innerContent'] ?? []) === count($block['innerBlocks'] ?? []), "Page pattern {$name} must persist normal InnerBlocks.");
    }
}
newsroom_assert(strpos($newsroom_test['patterns']['byline/faq-page']['content'], '<details class="wp-block-details') !== false, 'The FAQ starter should serialize valid Core Details markup.');
newsroom_assert(strpos($newsroom_test['patterns']['byline/faq-page']['content'], '<p>Add a concise answer.</p>') !== false, 'Details content should be a nested paragraph block.');
newsroom_assert(strpos($newsroom_test['patterns']['byline/faq-page']['content'], '<summary>Question</summary><!-- wp:paragraph -->') !== false, 'Details should serialize its answer as a canonical child block.');
newsroom_assert(strpos($newsroom_test['patterns']['byline/photo-led-page']['content'], 'src=""') === false, 'Image placeholders must not serialize an empty src attribute.');
newsroom_assert(strpos($newsroom_test['patterns']['byline/resource-page']['content'], '<!-- wp:list-item -->') !== false, 'Lists should use canonical Core List Item blocks.');
newsroom_assert(strpos($newsroom_test['patterns']['byline/quote-callout']['content'], '<blockquote class="wp-block-quote is-style-byline-editorial-quote"><!-- wp:paragraph -->') !== false, 'Quotes should use a nested Core Paragraph block.');
$contact_pattern = (string) $newsroom_test['patterns']['byline/contact-feedback-page']['content'];
newsroom_assert(strpos($contact_pattern, 'Contact this publication with a question, tip, correction, or feedback.') !== false, 'Contact copy must remain a complete editable sentence.');
$binding_position = strpos($contact_pattern, '"source":"byline');
$name_position = strpos($contact_pattern, '<p>Publication name</p>');
newsroom_assert($binding_position !== false && $name_position !== false && $binding_position < $name_position, 'Publication binding must target a paragraph whose entire value is the publication name.');

$information_blocks = parse_blocks((string) $newsroom_test['patterns']['byline/information-page']['content']);
$information_round_trip = implode("\n", array_map('byline_serialize_page_block', $information_blocks));
$reopened_information = parse_blocks($information_round_trip);
foreach (parse_blocks($information_round_trip) as $block) {
    if (($block['blockName'] ?? '') === 'byline/page-section') {
        newsroom_assert(($block['innerHTML'] ?? '') === '', 'A reopened newsroom Page Section must remain dynamic.');
    }
}
$reopened_section = $reopened_information[0] ?? [];
$attributes = is_array($reopened_section['attrs'] ?? null) ? $reopened_section['attrs'] : [];
$content = '<p>Reopened child content.</p>';
ob_start();
include __DIR__ . '/../src/blocks/page-section/render.php';
$reopened_render = (string) ob_get_clean();
newsroom_assert(strpos($reopened_render, '<section class="wp-block-byline-page-section">') !== false, 'A reopened newsroom Page Section must use the server renderer.');
newsroom_assert(strpos($reopened_render, '<h2 class="wp-block-heading">Information</h2>') !== false && strpos($reopened_render, '<div class="wp-block-byline-page-section__body"><p>Reopened child content.</p></div>') !== false, 'A reopened newsroom Page Section must render its heading and child content through the canonical wrapper.');

$stories = byline_newsroom_render_stories(['source' => 'manual', 'postIds' => [102, 103, 101], 'limit' => 3, 'layout' => 'list']);
newsroom_assert(strpos($stories, 'Second Story') !== false && strpos($stories, 'First Story') !== false, 'Stories should render selected published posts.');
newsroom_assert(strpos($stories, 'Draft Story') === false, 'Stories must never render draft posts.');
newsroom_assert(strpos($stories, 'story-teaser-list') !== false, 'Stories should render the requested list layout.');

$people = byline_newsroom_render_people(['source' => 'all', 'roleFilter' => 'editor', 'layout' => 'portrait-grid']);
newsroom_assert(strpos($people, 'Sam Editor') === false && strpos($people, 'Alex Reporter') !== false, 'People should filter against canonical public profile roles.');
newsroom_assert(strpos($people, 'Hidden User') === false, 'People must exclude profiles hidden from the public directory.');
$people_with_socials = byline_newsroom_render_people(['source' => 'all', 'roleFilter' => 'editor', 'layout' => 'portrait-grid', 'showSocials' => true]);
newsroom_assert_no_nested_anchors($people_with_socials, 'People cards must not nest social anchors inside the profile anchor.');
newsroom_assert(strpos($people_with_socials, 'byline-person-socials') !== false && strpos($people_with_socials, 'social.example') !== false, 'People cards should render social links as sibling actions.');

$schedule = byline_newsroom_render_sports_schedule(['teamKey' => 'varsity', 'display' => 'both', 'upcomingLimit' => 2, 'recentLimit' => 2]);
newsroom_assert(strpos($schedule, 'Future Academy') !== false && strpos($schedule, 'Rivals') !== false, 'Sports Schedule should render canonical upcoming and recent games.');
newsroom_assert(strpos($schedule, '3') !== false && strpos($schedule, '1') !== false, 'Sports Schedule should render canonical final scores.');

for ($index = 0; $index < 300; $index++) {
    $id = 5000 + $index;
    $newsroom_test['posts'][] = new WP_Post(['ID' => $id, 'post_type' => WWH_SPORTS_GAME_POST_TYPE, 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'historical-game-' . $id, 'post_title' => 'Historical Game ' . $id, 'post_content' => '', 'post_date' => '2020-01-01 12:00:00', 'post_date_gmt' => '2020-01-01 16:00:00']);
    $newsroom_test['meta'][$id] = ['_ww_start_datetime' => '2020-01-01T12:00', '_ww_import_season' => '2020-21', '_ww_game_status' => 'final', '_ww_sport_key' => 'varsity'];
}
$scaled_schedule = byline_newsroom_render_sports_schedule(['teamKey' => 'varsity', 'display' => 'both', 'upcomingLimit' => 2, 'recentLimit' => 2]);
newsroom_assert(strpos($scaled_schedule, 'Future Academy') !== false && strpos($scaled_schedule, 'Rivals') !== false, 'Sports Schedule must not lose current games behind a long historical schedule.');
$sports_queries = array_values(array_filter($newsroom_test['queries'], static fn(array $query): bool => ($query['post_type'] ?? '') === WWH_SPORTS_GAME_POST_TYPE));
$last_sports_query = $sports_queries[count($sports_queries) - 1] ?? [];
newsroom_assert((int) ($last_sports_query['numberposts'] ?? 0) === -1, 'Sports Schedule must not use a bounded pre-split game query.');
newsroom_assert(in_array(201, array_map('intval', $last_sports_query['post__in'] ?? []), true) && in_array(202, array_map('intval', $last_sports_query['post__in'] ?? []), true), 'Sports Schedule should use canonical season game IDs.');

$events = byline_newsroom_render_events(['limit' => 3, 'eventType' => 'community']);
newsroom_assert(strpos($events, 'Community Forum') !== false && strpos($events, 'Library') !== false, 'Events should render future canonical events in site time.');

for ($index = 0; $index < 300; $index++) {
    $id = 6000 + $index;
    $newsroom_test['posts'][] = new WP_Post(['ID' => $id, 'post_type' => WWH_SCHOOL_EVENT_POST_TYPE, 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'historical-event-' . $id, 'post_title' => 'Historical Event ' . $id, 'post_content' => '', 'post_date' => '2020-01-01 12:00:00', 'post_date_gmt' => '2020-01-01 16:00:00']);
    $newsroom_test['meta'][$id] = ['_ww_event_start_datetime' => '2020-01-01T12:00', '_ww_event_type' => 'community'];
}
for ($index = 0; $index < 5; $index++) {
    $id = 6400 + $index;
    $start = sprintf('2099-09-%02dT19:00', 1 + $index);
    $newsroom_test['posts'][] = new WP_Post(['ID' => $id, 'post_type' => WWH_SCHOOL_EVENT_POST_TYPE, 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'future-event-' . $id, 'post_title' => 'Future Event ' . $id, 'post_content' => '', 'post_date' => '2099-01-01 12:00:00', 'post_date_gmt' => '2099-01-01 16:00:00']);
    $newsroom_test['meta'][$id] = ['_ww_event_start_datetime' => $start, '_ww_event_type' => 'community'];
}
$today = (new DateTimeImmutable('today', wp_timezone()))->format('Y-m-d');
$today_id = 6500;
$newsroom_test['posts'][] = new WP_Post(['ID' => $today_id, 'post_type' => WWH_SCHOOL_EVENT_POST_TYPE, 'post_status' => 'publish', 'post_author' => 0, 'post_name' => 'all-day-today', 'post_title' => 'All Day Today', 'post_content' => '', 'post_date' => $today . ' 08:00:00', 'post_date_gmt' => $today . ' 12:00:00']);
$newsroom_test['meta'][$today_id] = ['_ww_event_start_datetime' => $today . 'T00:00', '_ww_event_type' => 'community', '_ww_event_all_day' => '1'];
$scaled_events = byline_newsroom_render_events(['limit' => 5, 'eventType' => 'community']);
newsroom_assert(strpos($scaled_events, 'Future Event 6400') !== false, 'Events must retain future events after more than 100 historical events.');
newsroom_assert(strpos($scaled_events, 'All Day Today') !== false, 'Events must preserve all-day-today behavior.');
$event_queries = array_values(array_filter($newsroom_test['queries'], static fn(array $query): bool => ($query['post_type'] ?? '') === WWH_SCHOOL_EVENT_POST_TYPE));
$last_event_query = $event_queries[count($event_queries) - 1] ?? [];
newsroom_assert((int) ($last_event_query['numberposts'] ?? 0) === -1, 'Events must apply the visible limit after a relevant future-range query.');
newsroom_assert(isset($last_event_query['meta_query'][0]['compare']) && $last_event_query['meta_query'][0]['compare'] === '>=', 'Events must query from the canonical future date boundary.');

$game_score = byline_newsroom_render_game_score(['source' => 'primary'], '', (object) ['context' => ['postId' => 101]]);
newsroom_assert(strpos($game_score, 'data-byline-game-score-id="201"') !== false, 'Game Score should follow the article Primary Game.');
newsroom_assert(strpos($game_score, '3') !== false && strpos($game_score, '1') !== false, 'Game Score should use canonical scores.');
newsroom_assert(byline_newsroom_game_score_game_ids(101) === [201], 'Structured Game Score detection should resolve Primary Game IDs.');
$newsroom_test['posts'][0]->post_content = 'manual';
newsroom_assert(byline_newsroom_game_score_game_ids(101) === [202], 'Structured Game Score detection should resolve manual game IDs.');
$newsroom_test['posts'][0]->post_content = '<!-- wp:byline/game-score {"source":"primary"} /-->';

$poll = byline_newsroom_render_poll(['source' => 'active', 'heading' => 'Reader question']);
newsroom_assert(strpos($poll, 'Reader question') !== false && strpos($poll, 'byline-poll-data') !== false, 'Poll should render a public-safe server payload.');
newsroom_assert(strpos($poll, 'News') !== false && strpos($poll, 'Sports') !== false, 'Poll should render canonical options without a second datastore.');

echo "Byline newsroom block regression passed.\n";
