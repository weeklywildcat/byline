<?php

/**
 * Publication-neutral newsroom blocks.
 *
 * These blocks deliberately read the existing WordPress content contracts at
 * render time. The editor previews use the same public REST shapes, while the
 * front end keeps the source of truth in WordPress for static exports and
 * direct WordPress rendering alike.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_NEWSROOM_MAX_LIMIT = 12;
const BYLINE_NEWSROOM_EDITOR_POLL_ROUTE = '/editor/polls';

function byline_newsroom_attr_string(array $attributes, string $key, string $default = ''): string
{
    $value = $attributes[$key] ?? $default;

    return is_scalar($value) ? sanitize_text_field((string) $value) : $default;
}

function byline_newsroom_limit($value, int $default = 6): int
{
    $limit = is_numeric($value) ? (int) $value : $default;

    return max(1, min(BYLINE_NEWSROOM_MAX_LIMIT, $limit));
}

function byline_newsroom_public_url($value): string
{
    if (!is_string($value)) {
        return '';
    }

    $value = trim($value);
    if ($value === '') {
        return '';
    }

    $is_absolute = preg_match('#^https?://#i', $value) === 1;
    $is_site_relative = strpos($value, '/') === 0 && strpos($value, '//') !== 0;
    if ($is_absolute || $is_site_relative) {
        return function_exists('esc_url_raw') ? esc_url_raw($value) : esc_url($value);
    }

    return '';
}

function byline_newsroom_block_post_id($block = null): int
{
    if (is_object($block) && isset($block->context) && is_array($block->context)) {
        $post_id = absint($block->context['postId'] ?? 0);
        if ($post_id > 0) {
            return $post_id;
        }
    }

    return function_exists('get_the_ID') ? absint(get_the_ID()) : 0;
}

function byline_newsroom_post_is_public($post, string $post_type = ''): bool
{
    return $post instanceof WP_Post
        && $post->post_status === 'publish'
        && ($post_type === '' || $post->post_type === $post_type);
}

function byline_newsroom_render_heading(string $heading, string $fallback): string
{
    $heading = trim($heading) !== '' ? $heading : $fallback;

    return '<h2>' . esc_html($heading) . '</h2>';
}

function byline_newsroom_render_image(int $attachment_id, string $alt, string $class = 'featured-image'): string
{
    if ($attachment_id <= 0 || !function_exists('wwh_media_image')) {
        return '';
    }

    $image = wwh_media_image($attachment_id, 'large');
    $url = byline_newsroom_public_url($image['url'] ?? '');
    if ($url === '') {
        return '';
    }

    $alt = (string) ($image['alt'] ?? '') !== '' ? (string) $image['alt'] : $alt;
    $width = absint($image['width'] ?? 0);
    $height = absint($image['height'] ?? 0);
    $dimensions = $width > 0 ? ' width="' . esc_attr((string) $width) . '"' : '';
    $dimensions .= $height > 0 ? ' height="' . esc_attr((string) $height) . '"' : '';

    return '<figure class="' . esc_attr($class) . '"><div class="featured-image-frame"><img src="' . esc_url($url) . '" alt="' . esc_attr($alt) . '"' . $dimensions . ' loading="lazy"></div></figure>';
}

/**
 * @return array<int,WP_Post>
 */
function byline_newsroom_story_posts(array $attributes): array
{
    if (!function_exists('get_posts')) {
        return [];
    }

    $source = byline_newsroom_attr_string($attributes, 'source', 'latest');
    $limit = byline_newsroom_limit($attributes['limit'] ?? 6, 6);
    if (in_array($source, ['category', 'tag'], true) && absint($attributes['termId'] ?? 0) <= 0) {
        return [];
    }
    if ($source === 'author' && absint($attributes['authorId'] ?? 0) <= 0) {
        return [];
    }
    $args = [
        'post_type' => 'post',
        'post_status' => 'publish',
        'numberposts' => $limit,
        'posts_per_page' => $limit,
        'orderby' => 'date',
        'order' => 'DESC',
        'ignore_sticky_posts' => true,
        'no_found_rows' => true,
        'suppress_filters' => false,
    ];

    if ($source === 'category' && absint($attributes['termId'] ?? 0) > 0) {
        $args['cat'] = absint($attributes['termId']);
    } elseif ($source === 'tag' && absint($attributes['termId'] ?? 0) > 0) {
        $args['tag_id'] = absint($attributes['termId']);
    } elseif ($source === 'author' && absint($attributes['authorId'] ?? 0) > 0) {
        $args['author'] = absint($attributes['authorId']);
    } elseif ($source === 'manual') {
        $ids = is_array($attributes['postIds'] ?? null)
            ? array_values(array_filter(array_map('absint', $attributes['postIds']), static fn(int $id): bool => $id > 0))
            : [];
        if ($ids === []) {
            return [];
        }
        $args['post__in'] = array_slice($ids, 0, $limit);
        $args['orderby'] = 'post__in';
    }

    $posts = get_posts($args);

    return array_values(array_filter(is_array($posts) ? $posts : [], static fn($post): bool => byline_newsroom_post_is_public($post, 'post')));
}

function byline_newsroom_story_card(WP_Post $post, string $variant, array $attributes): string
{
    $title = get_the_title($post);
    $href = get_permalink($post);
    $show_image = ($attributes['showImage'] ?? true) !== false;
    $image = $show_image ? byline_newsroom_render_image(absint(get_post_thumbnail_id($post->ID)), $title) : '';
    $class = 'story-teaser story-teaser-' . sanitize_html_class($variant);
    if ($image === '') {
        $class .= ' story-teaser-no-image';
    }

    $show_byline = ($attributes['showByline'] ?? true) !== false;
    $show_date = ($attributes['showDate'] ?? true) !== false;
    $show_excerpt = !empty($attributes['showExcerpt']);
    $author_markup = '';
    if ($show_byline && $post->post_author > 0) {
        $author = get_userdata($post->post_author);
        if ($author instanceof WP_User) {
            $author_name = esc_html($author->display_name);
            $author_url = get_author_posts_url($author->ID, $author->user_nicename);
            $author_markup = '<a href="' . esc_url($author_url) . '">' . $author_name . '</a>';
        }
    }

    $date_markup = '';
    if ($show_date) {
        $date_text = function_exists('get_the_date') ? get_the_date('M j, Y', $post) : (string) $post->post_date;
        $date_markup = '<time datetime="' . esc_attr((string) $post->post_date_gmt) . '">' . esc_html($date_text) . '</time>';
    }

    $byline = ($author_markup !== '' || $date_markup !== '')
        ? '<div class="article-byline">' . $author_markup . $date_markup . '</div>'
        : '';
    $excerpt = $show_excerpt ? trim((string) get_the_excerpt($post)) : '';
    $excerpt_markup = $excerpt !== '' ? '<div class="story-excerpt">' . wp_kses_post($excerpt) . '</div>' : '';

    return '<article class="' . esc_attr($class) . '">' . $image
        . '<div class="story-teaser-body">' . $byline
        . '<h3><a href="' . esc_url($href) . '">' . esc_html($title) . '</a></h3>'
        . $excerpt_markup . '</div></article>';
}

function byline_newsroom_render_stories(array $attributes = [], string $content = '', $block = null): string
{
    $layout = byline_newsroom_attr_string($attributes, 'layout', 'grid');
    if (!in_array($layout, ['grid', 'list', 'featured'], true)) {
        $layout = 'grid';
    }
    $posts = byline_newsroom_story_posts($attributes);
    $heading = byline_newsroom_attr_string($attributes, 'heading', 'Stories');
    $wrapper = $layout === 'list' ? 'byline-newsroom-stories-list' : ($layout === 'featured' ? 'byline-newsroom-stories-featured-list' : 'byline-newsroom-stories-grid');

    if ($posts === []) {
        return '<section class="byline-newsroom-stories byline-newsroom-stories-layout-' . esc_attr($layout) . '">' . byline_newsroom_render_heading($heading, 'Stories') . '<p class="byline-newsroom-empty">No published stories match these settings.</p></section>';
    }

    $cards = [];
    foreach ($posts as $index => $post) {
        $variant = $layout === 'list' ? 'list' : ($layout === 'featured' && $index === 0 ? 'lead' : 'standard');
        $cards[] = byline_newsroom_story_card($post, $variant, $attributes);
    }

    return '<section class="byline-newsroom-stories byline-newsroom-stories-layout-' . esc_attr($layout) . '">' . byline_newsroom_render_heading($heading, 'Stories') . '<div class="' . esc_attr($wrapper) . '">' . implode('', $cards) . '</div></section>';
}

/**
 * @return array<int,array<string,mixed>>
 */
function byline_newsroom_public_people(): array
{
    if (!function_exists('get_users')) {
        return [];
    }

    $people = [];
    $users = get_users(['orderby' => 'display_name', 'order' => 'ASC', 'fields' => 'all']);
    foreach (is_array($users) ? $users : [] as $user) {
        if (!$user instanceof WP_User) {
            continue;
        }
        if (function_exists('wwh_author_visible_in_directory') && !wwh_author_visible_in_directory((int) $user->ID)) {
            continue;
        }

        $profile = function_exists('wwh_rest_author_profile') ? wwh_rest_author_profile(['id' => (int) $user->ID]) : [];
        $description = get_user_meta((int) $user->ID, 'description', true);
        $people[] = [
            'id' => (int) $user->ID,
            'name' => (string) $user->display_name,
            'description' => is_scalar($description) ? (string) $description : '',
            'link' => get_author_posts_url((int) $user->ID, $user->user_nicename),
            'role' => is_array($profile) ? (string) ($profile['role'] ?? '') : '',
            'profilePhoto' => is_array($profile['profilePhoto'] ?? null) ? $profile['profilePhoto'] : [],
            'socials' => is_array($profile['socials'] ?? null) ? $profile['socials'] : [],
        ];
    }

    return $people;
}

function byline_newsroom_person_card(array $person, array $attributes): string
{
    $show_photo = ($attributes['showPhoto'] ?? true) !== false;
    $show_role = ($attributes['showRole'] ?? true) !== false;
    $show_bio = ($attributes['showBio'] ?? true) !== false;
    $show_socials = !empty($attributes['showSocials']);
    $name = (string) ($person['name'] ?? '');
    $parts = array_values(array_filter(preg_split('/\s+/', trim($name)) ?: []));
    $initials = strtoupper(substr((string) ($parts[0] ?? 'P'), 0, 1) . substr((string) ($parts[1] ?? ''), 0, 1));
    $photo = is_array($person['profilePhoto'] ?? null) ? $person['profilePhoto'] : [];
    $photo_url = byline_newsroom_public_url($photo['url'] ?? '');
    $media = $show_photo
        ? ($photo_url !== '' ? '<img class="byline-person-photo" src="' . esc_url($photo_url) . '" alt="' . esc_attr((string) ($photo['alt'] ?? $name)) . '" width="' . esc_attr((string) max(1, absint($photo['width'] ?? 120))) . '" height="' . esc_attr((string) max(1, absint($photo['height'] ?? 120))) . '" loading="lazy">' : '<span class="byline-person-initials" aria-hidden="true">' . esc_html($initials ?: 'P') . '</span>')
        : '';
    $role = $show_role && (string) ($person['role'] ?? '') !== '' ? '<p class="byline-person-role">' . esc_html((string) $person['role']) . '</p>' : '';
    $bio = $show_bio && (string) ($person['description'] ?? '') !== '' ? '<p class="byline-person-bio">' . wp_kses_post((string) $person['description']) . '</p>' : '';
    $socials = '';
    if ($show_socials && is_array($person['socials'] ?? null)) {
        $links = [];
        foreach (array_slice($person['socials'], 0, 5, true) as $service => $value) {
            if (!is_string($value) || trim($value) === '') {
                continue;
            }
            $href = strpos($value, '@') !== false && strpos($value, '://') === false ? 'mailto:' . sanitize_email($value) : byline_newsroom_public_url($value);
            if ($href === '') {
                continue;
            }
            $links[] = '<a href="' . esc_url($href) . '">' . esc_html(ucwords(str_replace(['_', '-'], ' ', (string) $service))) . '</a>';
        }
        if ($links !== []) {
            $socials = '<p class="byline-person-socials">' . implode(' ', $links) . '</p>';
        }
    }

    return '<article class="byline-person-card"><a class="byline-person-card-link" href="' . esc_url((string) ($person['link'] ?? '#')) . '">' . $media . '<div><h3 class="byline-person-name">' . esc_html($name) . '</h3>' . $role . $bio . $socials . '</div></a></article>';
}

function byline_newsroom_render_people(array $attributes = [], string $content = '', $block = null): string
{
    $people = byline_newsroom_public_people();
    $role_filter = strtolower(trim(byline_newsroom_attr_string($attributes, 'roleFilter')));
    $selected_ids = is_array($attributes['selectedIds'] ?? null)
        ? array_values(array_filter(array_map('absint', $attributes['selectedIds']), static fn(int $id): bool => $id > 0))
        : [];
    $source = byline_newsroom_attr_string($attributes, 'source', 'all');
    $filtered = array_values(array_filter($people, static function (array $person) use ($role_filter, $source, $selected_ids): bool {
        if ($source === 'selected' && !in_array((int) ($person['id'] ?? 0), $selected_ids, true)) {
            return false;
        }
        return $role_filter === '' || strpos(strtolower((string) ($person['role'] ?? '')), $role_filter) !== false;
    }));
    if ($source === 'selected' && $selected_ids !== []) {
        usort($filtered, static fn(array $left, array $right): int => array_search((int) $left['id'], $selected_ids, true) <=> array_search((int) $right['id'], $selected_ids, true));
    }

    $heading = byline_newsroom_attr_string($attributes, 'heading', 'People');
    $layout = byline_newsroom_attr_string($attributes, 'layout', 'portrait-grid');
    if (!in_array($layout, ['portrait-grid', 'compact-list'], true)) {
        $layout = 'portrait-grid';
    }
    if ($filtered === []) {
        return '<section class="byline-people byline-people-layout-' . esc_attr($layout) . '">' . byline_newsroom_render_heading($heading, 'People') . '<p class="byline-people-empty">No public people match these settings.</p></section>';
    }

    $cards = array_map(static fn(array $person): string => byline_newsroom_person_card($person, $attributes), $filtered);

    return '<section class="byline-people byline-people-layout-' . esc_attr($layout) . '">' . byline_newsroom_render_heading($heading, 'People') . '<div class="byline-people-grid">' . implode('', $cards) . '</div></section>';
}

/**
 * @return array<int,array<string,mixed>>
 */
function byline_newsroom_sports_games(array $attributes): array
{
    if (!function_exists('get_posts') || !function_exists('wwh_format_sports_game')) {
        return [];
    }

    $team_key = byline_newsroom_attr_string($attributes, 'teamKey');
    $season = byline_newsroom_attr_string($attributes, 'season');
    if ($season !== '' && function_exists('byline_sports_normalize_season')) {
        $season = byline_sports_normalize_season($season);
        if ($season === '') {
            return [];
        }
    }
    $post_type = defined('WWH_SPORTS_GAME_POST_TYPE') ? WWH_SPORTS_GAME_POST_TYPE : 'ww_sports_game';
    $args = [
        'post_type' => $post_type,
        'post_status' => 'publish',
        'numberposts' => 100,
        'posts_per_page' => 100,
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'ASC',
        'no_found_rows' => true,
        'suppress_filters' => false,
    ];
    if ($team_key !== '') {
        $args['meta_query'] = [['key' => '_ww_sport_key', 'value' => sanitize_key($team_key)]];
    }
    if ($season !== '' && function_exists('byline_sports_game_ids_for_season')) {
        $ids = byline_sports_game_ids_for_season($season, $team_key, true);
        $args['post__in'] = $ids !== [] ? $ids : [0];
    }

    $games = [];
    foreach (get_posts($args) as $post) {
        if (!byline_newsroom_post_is_public($post, $post_type)) {
            continue;
        }
        $games[] = wwh_format_sports_game($post);
    }

    return $games;
}

function byline_newsroom_render_sports_game(array $game): string
{
    $scoreboard = is_array($game['display']['scoreboard'] ?? null) ? $game['display']['scoreboard'] : [];
    $team = is_array($scoreboard['team'] ?? null) ? $scoreboard['team'] : (is_array($scoreboard['wildcats'] ?? null) ? $scoreboard['wildcats'] : []);
    $opponent = is_array($scoreboard['opponent'] ?? null) ? $scoreboard['opponent'] : [];
    $has_score = ($team['score'] ?? null) !== null && ($opponent['score'] ?? null) !== null;
    $link = function_exists('wwh_game_center_url') ? wwh_game_center_url(absint($game['id'] ?? 0)) : '';
    $score = $has_score ? '<p class="byline-sports-game-score">' . esc_html((string) ($team['label'] ?? 'Team')) . ' ' . esc_html((string) $team['score']) . ' · ' . esc_html((string) ($opponent['label'] ?? $game['opponent'] ?? 'Opponent')) . ' ' . esc_html((string) $opponent['score']) . '</p>' : '';
    $location = trim((string) (($game['display']['location'] ?? '') ?: ($game['locationName'] ?? $game['locationAddress'] ?? '')));
    $location_markup = $location !== '' ? '<p class="byline-sports-game-location">' . esc_html($location) . '</p>' : '';
    $link_markup = $link !== '' ? '<a class="byline-sports-game-link" href="' . esc_url($link) . '">View Game Center</a>' : '';

    return '<li class="byline-sports-game"><div class="byline-sports-game-meta"><time datetime="' . esc_attr((string) ($game['startDate'] ?? '')) . '">' . esc_html((string) (($game['display']['date'] ?? '') ?: ($game['startDate'] ?? 'Date pending'))) . '</time><strong>' . esc_html((string) (($game['display']['status'] ?? '') ?: ($game['status'] ?? 'Status pending'))) . '</strong></div><p class="byline-sports-game-matchup">' . esc_html((string) (($game['display']['matchup'] ?? '') ?: ($game['title'] ?? 'Game'))) . '</p>' . $score . $location_markup . $link_markup . '</li>';
}

function byline_newsroom_render_sports_schedule(array $attributes = [], string $content = '', $block = null): string
{
    $display = byline_newsroom_attr_string($attributes, 'display', 'both');
    if (!in_array($display, ['upcoming', 'recent', 'both'], true)) {
        $display = 'both';
    }
    $games = byline_newsroom_sports_games($attributes);
    $upcoming = array_values(array_filter($games, static fn(array $game): bool => (string) ($game['status'] ?? '') === 'upcoming'));
    $recent = array_values(array_filter($games, static fn(array $game): bool => (string) ($game['status'] ?? '') !== 'upcoming'));
    usort($upcoming, static fn(array $left, array $right): int => strcmp((string) ($left['startDate'] ?? ''), (string) ($right['startDate'] ?? '')));
    usort($recent, static fn(array $left, array $right): int => strcmp((string) ($right['startDate'] ?? ''), (string) ($left['startDate'] ?? '')));
    $upcoming = array_slice($upcoming, 0, byline_newsroom_limit($attributes['upcomingLimit'] ?? 3, 3));
    $recent = array_slice($recent, 0, byline_newsroom_limit($attributes['recentLimit'] ?? 3, 3));
    $visible = ($display === 'upcoming' ? $upcoming : ($display === 'recent' ? $recent : array_merge($upcoming, $recent)));
    $heading = byline_newsroom_attr_string($attributes, 'heading', 'Sports Schedule');
    if ($visible === []) {
        return !empty($attributes['hideWhenEmpty']) ? '' : '<section class="byline-sports-schedule">' . byline_newsroom_render_heading($heading, 'Sports Schedule') . '<p class="byline-sports-empty">No games found for this team and season.</p></section>';
    }

    $sections = [];
    if ($display !== 'recent' && $upcoming !== []) {
        $sections[] = '<section class="byline-sports-schedule-section"><h3>Upcoming</h3><ul class="byline-sports-game-list">' . implode('', array_map('byline_newsroom_render_sports_game', $upcoming)) . '</ul></section>';
    }
    if ($display !== 'upcoming' && $recent !== []) {
        $sections[] = '<section class="byline-sports-schedule-section"><h3>Recent results</h3><ul class="byline-sports-game-list">' . implode('', array_map('byline_newsroom_render_sports_game', $recent)) . '</ul></section>';
    }

    return '<section class="byline-sports-schedule">' . byline_newsroom_render_heading($heading, 'Sports Schedule') . '<div class="byline-sports-schedule-sections">' . implode('', $sections) . '</div></section>';
}

/**
 * @return array<int,array<string,mixed>>
 */
function byline_newsroom_events(array $attributes): array
{
    if (!function_exists('get_posts') || !function_exists('wwh_format_school_event')) {
        return [];
    }

    $post_type = defined('WWH_SCHOOL_EVENT_POST_TYPE') ? WWH_SCHOOL_EVENT_POST_TYPE : 'ww_school_event';
    $event_type = byline_newsroom_attr_string($attributes, 'eventType');
    $posts = get_posts([
        'post_type' => $post_type,
        'post_status' => 'publish',
        'numberposts' => 100,
        'posts_per_page' => 100,
        'orderby' => 'meta_value',
        'meta_key' => '_ww_event_start_datetime',
        'order' => 'ASC',
        'no_found_rows' => true,
        'suppress_filters' => false,
    ]);
    $now = new DateTimeImmutable('now', function_exists('wp_timezone') ? wp_timezone() : new DateTimeZone('UTC'));
    $events = [];
    foreach ($posts as $post) {
        if (!byline_newsroom_post_is_public($post, $post_type)) {
            continue;
        }
        $event = wwh_format_school_event($post);
        if ($event_type !== '' && (string) ($event['eventType'] ?? '') !== $event_type) {
            continue;
        }
        $start = function_exists('wwh_parse_local_datetime') ? wwh_parse_local_datetime((string) ($event['startDate'] ?? '')) : null;
        $is_all_day_today = !empty($event['allDay']) && $start instanceof DateTimeImmutable && $start->format('Y-m-d') === $now->format('Y-m-d');
        if (!$start || ($start < $now && !$is_all_day_today)) {
            continue;
        }
        $events[] = $event;
    }

    usort($events, static fn(array $left, array $right): int => strcmp((string) ($left['startDate'] ?? ''), (string) ($right['startDate'] ?? '')));

    return array_slice($events, 0, byline_newsroom_limit($attributes['limit'] ?? 5, 5));
}

function byline_newsroom_render_event(array $event): string
{
    $href = byline_newsroom_public_url($event['externalUrl'] ?? '');
    $title = esc_html((string) ($event['title'] ?? 'Event'));
    $title_markup = $href !== '' ? '<a href="' . esc_url($href) . '">' . $title . '</a>' : $title;
    $type = (string) ($event['eventType'] ?? '') !== '' ? '<p class="byline-event-type">' . esc_html((string) $event['eventType']) . '</p>' : '';
    $location = (string) ($event['location'] ?? '') !== '' ? '<p class="byline-event-location">' . esc_html((string) $event['location']) . '</p>' : '';
    $description = (string) ($event['description'] ?? '') !== '' ? '<p class="byline-event-description">' . wp_kses_post((string) $event['description']) . '</p>' : '';

    return '<li class="byline-event"><div class="byline-event-date"><time datetime="' . esc_attr((string) ($event['startDate'] ?? '')) . '">' . esc_html((string) ($event['display']['date'] ?? '')) . '</time>' . ((string) ($event['display']['time'] ?? '') !== '' ? '<span>' . esc_html((string) $event['display']['time']) . '</span>' : '') . '</div><div class="byline-event-content"><h3 class="byline-event-title">' . $title_markup . '</h3>' . $type . $location . $description . '</div></li>';
}

function byline_newsroom_render_events(array $attributes = [], string $content = '', $block = null): string
{
    $events = byline_newsroom_events($attributes);
    if ($events === [] && !empty($attributes['hideWhenEmpty'])) {
        return '';
    }
    $heading = byline_newsroom_attr_string($attributes, 'heading', 'Events');
    if ($events === []) {
        return '<section class="byline-events">' . byline_newsroom_render_heading($heading, 'Events') . '<p class="byline-events-empty">No upcoming events match these settings.</p></section>';
    }

    return '<section class="byline-events">' . byline_newsroom_render_heading($heading, 'Events') . '<ul class="byline-event-list">' . implode('', array_map('byline_newsroom_render_event', $events)) . '</ul></section>';
}

function byline_newsroom_poll_for_attributes(array $attributes): ?array
{
    if (!function_exists('byline_poll_record')) {
        return null;
    }
    $source = byline_newsroom_attr_string($attributes, 'source', 'active');
    $post = null;
    if ($source === 'active') {
        $record = function_exists('byline_poll_active_record') ? byline_poll_active_record() : null;
        return is_array($record) ? $record : null;
    }

    $identifier = byline_newsroom_attr_string($attributes, 'pollId');
    if ($identifier !== '' && function_exists('byline_poll_find_post_by_public_id')) {
        $post = byline_poll_find_post_by_public_id($identifier);
    }
    if (!$post instanceof WP_Post && absint($identifier) > 0 && function_exists('get_post')) {
        $candidate = get_post(absint($identifier));
        $post = $candidate instanceof WP_Post ? $candidate : null;
    }
    if (!$post instanceof WP_Post || $post->post_status !== 'publish' || (defined('BYLINE_POLL_POST_TYPE') && $post->post_type !== BYLINE_POLL_POST_TYPE)) {
        return null;
    }

    $record = byline_poll_record($post);

    return ($record['status'] ?? '') !== (defined('BYLINE_POLL_STATUS_DRAFT') ? BYLINE_POLL_STATUS_DRAFT : 'draft') && !empty($record['options']) ? $record : null;
}

function byline_newsroom_poll_payload(array $record): array
{
    if (function_exists('byline_poll_votes_table_exists') && byline_poll_votes_table_exists() && function_exists('byline_poll_public_payload')) {
        $payload = byline_poll_public_payload($record);
    } else {
        $payload = [
            'id' => (string) ($record['id'] ?? ''),
            'question' => (string) ($record['question'] ?? ''),
            'options' => [],
            'totalVotes' => 0,
            'resultsAvailable' => false,
        ];
        foreach ($record['options'] ?? [] as $option) {
            $payload['options'][] = ['id' => (string) ($option['id'] ?? ''), 'label' => (string) ($option['label'] ?? ''), 'votes' => 0];
        }
    }
    $payload['votingOpen'] = function_exists('byline_poll_record_is_open') ? byline_poll_record_is_open($record) : false;

    return $payload;
}

function byline_newsroom_render_poll_results(array $payload): string
{
    if (empty($payload['resultsAvailable'])) {
        return '<p class="byline-poll-note" aria-live="polite">Thanks for your response. We use this to improve our coverage.</p>';
    }

    $total = max(0, (int) ($payload['totalVotes'] ?? 0));
    $items = [];
    foreach ($payload['options'] ?? [] as $option) {
        $votes = max(0, (int) ($option['votes'] ?? 0));
        $percent = $total > 0 ? (int) round(($votes / $total) * 100) : 0;
        $items[] = '<div class="byline-poll-result"><div class="byline-poll-result-label"><span>' . esc_html((string) ($option['label'] ?? '')) . '</span><strong>' . esc_html((string) $percent) . '%</strong></div><span class="byline-poll-result-bar" aria-hidden="true"><span style="width:' . esc_attr((string) $percent) . '%"></span></span></div>';
    }

    return '<div class="byline-poll-results" aria-live="polite">' . implode('', $items) . '</div>';
}

function byline_newsroom_render_poll(array $attributes = [], string $content = '', $block = null): string
{
    $record = byline_newsroom_poll_for_attributes($attributes);
    if ($record === null) {
        return '<p class="byline-poll-empty">No poll is available right now.</p>';
    }
    $payload = byline_newsroom_poll_payload($record);
    $heading = byline_newsroom_attr_string($attributes, 'heading', 'Your Opinion');
    $id = sanitize_html_class('byline-poll-' . (string) ($payload['id'] ?? wp_unique_id()));
    $question = esc_html((string) ($payload['question'] ?? ''));
    $options = [];
    foreach ($payload['options'] ?? [] as $option) {
        $option_id = sanitize_html_class((string) ($option['id'] ?? ''));
        if ($option_id === '') {
            continue;
        }
        $options[] = '<label class="byline-poll-option"><input type="radio" name="' . esc_attr($id . '-option') . '" value="' . esc_attr($option_id) . '"><span>' . esc_html((string) ($option['label'] ?? '')) . '</span></label>';
    }
    $open = !empty($payload['votingOpen']);
    $form = $open && $options !== []
        ? '<form class="byline-poll-form" data-byline-poll-form><div class="byline-poll-options">' . implode('', $options) . '</div><button class="byline-poll-submit" type="submit">Vote</button></form>'
        : byline_newsroom_render_poll_results($payload);
    $json_flags = defined('JSON_HEX_TAG') ? JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT : 0;

    return '<section id="' . esc_attr($id) . '" class="byline-poll-block" data-byline-poll-id="' . esc_attr((string) ($payload['id'] ?? '')) . '" aria-labelledby="' . esc_attr($id . '-heading') . '">' . '<h2 id="' . esc_attr($id . '-heading') . '">' . esc_html($heading) . '</h2><p class="byline-poll-question">' . $question . '</p>' . $form . '<script type="application/json" class="byline-poll-data">' . wp_json_encode($payload, $json_flags) . '</script></section>';
}

function byline_newsroom_game_score_game_ids(int $post_id): array
{
    if ($post_id <= 0 || !function_exists('get_post') || !function_exists('parse_blocks')) {
        return [];
    }
    $post = get_post($post_id);
    if (!$post instanceof WP_Post) {
        return [];
    }
    $blocks = parse_blocks((string) $post->post_content);
    $ids = [];
    $walk = static function (array $nodes) use (&$walk, &$ids, $post_id): void {
        foreach ($nodes as $node) {
            if (!is_array($node)) {
                continue;
            }
            if (($node['blockName'] ?? '') === 'byline/game-score') {
                $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                if (($attrs['source'] ?? 'primary') === 'primary') {
                    $game_id = defined('WWH_PRIMARY_GAME_META') ? absint(get_post_meta($post_id, WWH_PRIMARY_GAME_META, true)) : 0;
                } else {
                    $game_id = absint($attrs['gameId'] ?? 0);
                }
                if ($game_id > 0) {
                    $ids[$game_id] = true;
                }
            }
            if (is_array($node['innerBlocks'] ?? null)) {
                $walk($node['innerBlocks']);
            }
        }
    };
    $walk(is_array($blocks) ? $blocks : []);

    return array_map('absint', array_keys($ids));
}

function byline_newsroom_render_game_score(array $attributes = [], string $content = '', $block = null): string
{
    if (!function_exists('get_post') || !function_exists('wwh_format_sports_game')) {
        return '';
    }
    $post_id = byline_newsroom_block_post_id($block);
    $source = byline_newsroom_attr_string($attributes, 'source', 'primary');
    $game_id = $source === 'manual'
        ? absint($attributes['gameId'] ?? 0)
        : (defined('WWH_PRIMARY_GAME_META') ? absint(get_post_meta($post_id, WWH_PRIMARY_GAME_META, true)) : 0);
    $game_post = $game_id > 0 ? get_post($game_id) : null;
    $post_type = defined('WWH_SPORTS_GAME_POST_TYPE') ? WWH_SPORTS_GAME_POST_TYPE : 'ww_sports_game';
    if (!$game_post instanceof WP_Post || $game_post->post_type !== $post_type || $game_post->post_status !== 'publish') {
        return '';
    }

    $game = wwh_format_sports_game($game_post);
    $board = is_array($game['display']['scoreboard'] ?? null) ? $game['display']['scoreboard'] : [];
    $team = is_array($board['team'] ?? null) ? $board['team'] : (is_array($board['wildcats'] ?? null) ? $board['wildcats'] : []);
    $opponent = is_array($board['opponent'] ?? null) ? $board['opponent'] : [];
    $has_score = ($team['score'] ?? null) !== null && ($opponent['score'] ?? null) !== null;
    $status = (string) (($game['display']['status'] ?? '') ?: ($game['status'] ?? 'Status pending'));
    $team_label = (string) (($team['label'] ?? '') ?: ($game['teamLabel'] ?? 'Team'));
    $opponent_label = (string) (($opponent['label'] ?? '') ?: ($game['opponent'] ?? 'Opponent'));
    $show_logos = ($attributes['showLogos'] ?? true) !== false;
    $show_details = ($attributes['showDetails'] ?? true) !== false;
    $show_link = ($attributes['showLink'] ?? true) !== false;
    $logo = is_array($game['team']['logo'] ?? null) ? $game['team']['logo'] : [];
    $logo_url = $show_logos ? byline_newsroom_public_url($logo['url'] ?? '') : '';
    $logo_markup = $logo_url !== '' ? '<img class="byline-game-score-team-logo" src="' . esc_url($logo_url) . '" alt="' . esc_attr((string) ($logo['alt'] ?? $team_label)) . '" width="32" height="32">' : '';
    $score_markup = $has_score ? (string) $team['score'] : '<span class="byline-game-score-team-score-pending">—</span>';
    $opponent_score_markup = $has_score ? (string) $opponent['score'] : '<span class="byline-game-score-team-score-pending">—</span>';
    $details = '';
    if ($show_details) {
        $date = (string) (($game['display']['date'] ?? '') ?: ($game['startDate'] ?? 'Date pending'));
        $location = (string) (($game['display']['location'] ?? '') ?: ($game['locationName'] ?? $game['locationAddress'] ?? ''));
        $details = '<p class="byline-game-score-details"><span>' . esc_html($date) . '</span>' . ($location !== '' ? '<span>' . esc_html($location) . '</span>' : '') . '</p>';
    }
    $link = function_exists('wwh_game_center_url') ? wwh_game_center_url($game_id) : '';
    $link_markup = $show_link && $link !== '' ? '<a class="byline-game-score-link" href="' . esc_url($link) . '">View Game Center</a>' : '';
    $aria = $has_score ? sprintf('%s %s, %s %s', $team_label, (string) $team['score'], $opponent_label, (string) $opponent['score']) : $team_label . ' versus ' . $opponent_label;

    return '<aside class="byline-game-score" data-byline-game-score-id="' . esc_attr((string) $game_id) . '" aria-label="' . esc_attr($aria) . '"><p class="byline-game-score-meta"><span class="byline-game-score-status">' . esc_html($status) . '</span><span>' . esc_html((string) (($game['display']['sportLevel'] ?? '') ?: ($game['sportLabel'] ?? 'Sports'))) . '</span></p><div class="byline-game-score-rows" role="group" aria-label="' . esc_attr($aria) . '"><div class="byline-game-score-team">' . $logo_markup . '<span class="byline-game-score-team-name">' . esc_html($team_label) . '</span><span class="byline-game-score-team-score">' . $score_markup . '</span></div><div class="byline-game-score-team"><span class="byline-game-score-team-name">' . esc_html($opponent_label) . '</span><span class="byline-game-score-team-score">' . $opponent_score_markup . '</span></div></div>' . $details . $link_markup . '</aside>';
}

function byline_newsroom_register_block_types(): void
{
    if (!function_exists('register_block_type')) {
        return;
    }
    $root = dirname(__DIR__, 2) . '/build/blocks';
    $dynamic = [
        'stories' => 'byline_newsroom_render_stories',
        'people' => 'byline_newsroom_render_people',
        'sports-schedule' => 'byline_newsroom_render_sports_schedule',
        'events' => 'byline_newsroom_render_events',
        'poll' => 'byline_newsroom_render_poll',
        'game-score' => 'byline_newsroom_render_game_score',
    ];
    foreach ($dynamic as $slug => $callback) {
        register_block_type($root . '/' . $slug, ['render_callback' => $callback]);
    }
    register_block_type($root . '/correction-notice');
}
add_action('init', 'byline_newsroom_register_block_types', 30);

function byline_newsroom_enqueue_shared_assets(): void
{
    if (!function_exists('wp_enqueue_style')) {
        return;
    }
    $root = dirname(__DIR__, 2);
    $file = $root . '/build/blocks/stories/style-index.css';
    if (!file_exists($file)) {
        return;
    }
    wp_enqueue_style('byline-newsroom-blocks', plugins_url('build/blocks/stories/style-index.css', $root . '/weekly-wildcat-headless.php'), [], (string) filemtime($file));
}
add_action('enqueue_block_assets', 'byline_newsroom_enqueue_shared_assets', 30);

function byline_newsroom_register_core_styles(): void
{
    if (!function_exists('register_block_style')) {
        return;
    }
    $styles = [
        'core/group' => [
            ['name' => 'byline-editorial-callout', 'label' => 'Editorial Callout'],
            ['name' => 'byline-soft-callout', 'label' => 'Soft Callout'],
            ['name' => 'byline-rule-top', 'label' => 'Rule Top'],
        ],
        'core/button' => [
            ['name' => 'byline-primary', 'label' => 'Primary'],
            ['name' => 'byline-outline', 'label' => 'Outline'],
            ['name' => 'byline-text-link', 'label' => 'Text Link'],
        ],
        'core/buttons' => [
            ['name' => 'byline-standard-cta', 'label' => 'Standard CTA'],
            ['name' => 'byline-compact', 'label' => 'Compact'],
        ],
        'core/quote' => [
            ['name' => 'byline-editorial-quote', 'label' => 'Editorial Quote'],
            ['name' => 'byline-source-quote', 'label' => 'Source Quote'],
        ],
        'core/pullquote' => [['name' => 'byline-feature-quote', 'label' => 'Feature Quote']],
        'core/separator' => [
            ['name' => 'byline-editorial-rule', 'label' => 'Editorial Rule'],
            ['name' => 'byline-heavy-rule', 'label' => 'Heavy Rule'],
        ],
        'core/details' => [['name' => 'byline-faq', 'label' => 'FAQ']],
        'core/table' => [
            ['name' => 'byline-editorial', 'label' => 'Editorial'],
            ['name' => 'byline-compact', 'label' => 'Compact'],
        ],
        'core/image' => [
            ['name' => 'byline-editorial', 'label' => 'Editorial'],
            ['name' => 'byline-feature', 'label' => 'Feature'],
        ],
        'core/gallery' => [
            ['name' => 'byline-news-grid', 'label' => 'News Grid'],
            ['name' => 'byline-feature-grid', 'label' => 'Feature Grid'],
        ],
        'core/list' => [
            ['name' => 'byline-resource-list', 'label' => 'Resource List'],
            ['name' => 'byline-link-list', 'label' => 'Link List'],
        ],
    ];
    foreach ($styles as $block => $definitions) {
        foreach ($definitions as $definition) {
            register_block_style($block, $definition);
        }
    }
}
add_action('init', 'byline_newsroom_register_core_styles', 31);

function byline_newsroom_publication_binding_value(array $source_args, $block_instance = null, string $attribute_name = ''): string
{
    $key = (string) ($source_args['key'] ?? '');
    $publication = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $identity = is_array($publication['identity'] ?? null) ? $publication['identity'] : [];
    $urls = is_array($publication['urls'] ?? null) ? $publication['urls'] : [];
    $masthead = is_array($publication['branding']['masthead'] ?? null) ? $publication['branding']['masthead'] : [];
    $values = [
        'name' => (string) ($identity['name'] ?? ''),
        'shortName' => (string) ($identity['shortName'] ?? ''),
        'publicSiteUrl' => function_exists('byline_publication_absolute_url') ? byline_publication_absolute_url((string) ($urls['publicSite'] ?? '')) : (string) ($urls['publicSite'] ?? ''),
        'mastheadUrl' => function_exists('byline_publication_absolute_url') ? byline_publication_absolute_url((string) ($masthead['url'] ?? '')) : (string) ($masthead['url'] ?? ''),
        'mastheadAlt' => (string) ($masthead['alt'] ?? $identity['name'] ?? ''),
        'contactUrl' => function_exists('byline_publication_absolute_url') ? byline_publication_absolute_url((string) ($urls['contact'] ?? '/contact/')) : (string) ($urls['contact'] ?? '/contact/'),
    ];

    return isset($values[$key]) && is_scalar($values[$key]) ? (string) $values[$key] : '';
}

function byline_newsroom_register_bindings(): void
{
    if (!function_exists('register_block_bindings_source')) {
        return;
    }
    register_block_bindings_source('byline/publication', [
        'label' => 'Publication',
        'get_value_callback' => 'byline_newsroom_publication_binding_value',
    ]);
}
add_action('init', 'byline_newsroom_register_bindings', 32);

function byline_newsroom_editor_poll_payload(array $record): array
{
    $options = [];
    foreach ($record['options'] ?? [] as $option) {
        $options[] = ['id' => (string) ($option['id'] ?? ''), 'label' => (string) ($option['label'] ?? '')];
    }

    return [
        'id' => (string) ($record['id'] ?? ''),
        'postId' => absint($record['postId'] ?? 0),
        'question' => (string) ($record['question'] ?? ''),
        'status' => (string) ($record['status'] ?? ''),
        'options' => $options,
    ];
}

function byline_newsroom_editor_polls(WP_REST_Request $request): WP_REST_Response
{
    $limit = max(1, min(50, absint($request->get_param('per_page') ?: 50)));
    $posts = function_exists('get_posts') ? get_posts([
        'post_type' => defined('BYLINE_POLL_POST_TYPE') ? BYLINE_POLL_POST_TYPE : 'byline_poll',
        'post_status' => ['publish', 'draft', 'pending', 'private'],
        'numberposts' => $limit,
        'orderby' => 'date',
        'order' => 'DESC',
        'suppress_filters' => false,
    ]) : [];
    $polls = [];
    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post || (function_exists('current_user_can') && !current_user_can('edit_post', $post->ID))) {
            continue;
        }
        $polls[] = byline_newsroom_editor_poll_payload(byline_poll_record($post));
    }
    $active = function_exists('byline_poll_active_record') ? byline_poll_active_record() : null;

    return rest_ensure_response(['polls' => $polls, 'active' => is_array($active) ? byline_newsroom_editor_poll_payload($active) : null]);
}

function byline_newsroom_editor_poll_permission(): bool
{
    return current_user_can('edit_posts') || current_user_can('edit_byline_poll');
}

function byline_newsroom_register_editor_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }
    register_rest_route('byline/v1', BYLINE_NEWSROOM_EDITOR_POLL_ROUTE, [
        'methods' => defined('WP_REST_Server::READABLE') ? WP_REST_Server::READABLE : 'GET',
        'callback' => 'byline_newsroom_editor_polls',
        'permission_callback' => 'byline_newsroom_editor_poll_permission',
    ]);
}
add_action('rest_api_init', 'byline_newsroom_register_editor_routes', 20);

function byline_newsroom_block_markup(string $name, array $attributes = [], string $content = ''): string
{
    $json = $attributes !== [] ? ' ' . wp_json_encode($attributes) : '';

    return '<!-- wp:' . $name . $json . ' -->' . $content . '<!-- /wp:' . $name . ' -->';
}

function byline_newsroom_paragraph(string $text, array $attributes = []): string
{
    return byline_newsroom_block_markup('core/paragraph', $attributes, '<p>' . wp_kses_post($text) . '</p>');
}

function byline_newsroom_heading(string $text, int $level = 2): string
{
    $level = in_array($level, [2, 3, 4], true) ? $level : 2;

    return byline_newsroom_block_markup('core/heading', ['level' => $level], '<h' . $level . ' class="wp-block-heading">' . esc_html($text) . '</h' . $level . '>');
}

function byline_newsroom_button(string $text, string $url = '/'): string
{
    $url = function_exists('byline_sanitize_public_url') ? byline_sanitize_public_url($url) : $url;
    $html = '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="' . esc_url($url ?: '/') . '">' . esc_html($text) . '</a></div>';

    return byline_newsroom_block_markup('core/button', ['url' => $url ?: '/'], $html);
}

function byline_newsroom_group(string $content, array $attributes = []): string
{
    $class_name = trim((string) ($attributes['className'] ?? ''));
    $classes = trim('wp-block-group ' . $class_name);

    return byline_newsroom_block_markup('core/group', $attributes, '<div class="' . esc_attr($classes) . '">' . $content . '</div>');
}

function byline_newsroom_page_section(string $heading, string $content = '', bool $featured = false): string
{
    $attributes = ['heading' => $heading];
    $classes = 'wp-block-byline-page-section';
    if ($featured) {
        $attributes['className'] = 'is-style-featured';
        $classes .= ' is-style-featured';
    }

    $html = '<section class="' . esc_attr($classes) . '"><h2 class="wp-block-heading">' . esc_html($heading) . '</h2><div class="wp-block-byline-page-section__body">' . $content . '</div></section>';

    return byline_newsroom_block_markup('byline/page-section', $attributes, $html);
}

function byline_newsroom_buttons(string $content, array $attributes = []): string
{
    $class_name = trim((string) ($attributes['className'] ?? ''));
    $classes = trim('wp-block-buttons ' . $class_name);

    return byline_newsroom_block_markup('core/buttons', $attributes, '<div class="' . esc_attr($classes) . '">' . $content . '</div>');
}

function byline_newsroom_columns(string $content): string
{
    return byline_newsroom_block_markup('core/columns', [], '<div class="wp-block-columns">' . $content . '</div>');
}

function byline_newsroom_column(string $content): string
{
    return byline_newsroom_block_markup('core/column', [], '<div class="wp-block-column">' . $content . '</div>');
}

function byline_newsroom_page_pattern(string $title, string $description, string $content): array
{
    return [
        'title' => $title,
        'description' => $description,
        'content' => $content,
        'categories' => ['byline'],
        'postTypes' => ['page'],
        'keywords' => ['page', 'publication', 'editorial'],
        'inserter' => true,
    ];
}

function byline_newsroom_post_pattern(string $title, string $description, string $content): array
{
    return [
        'title' => $title,
        'description' => $description,
        'content' => $content,
        'categories' => ['byline'],
        'postTypes' => ['post'],
        'keywords' => ['post', 'story', 'editorial'],
        'inserter' => true,
    ];
}

function byline_newsroom_register_patterns(): void
{
    if (!function_exists('register_block_pattern')) {
        return;
    }
    $publication_name_binding = [
        'metadata' => [
            'bindings' => [
                'content' => [
                    'source' => 'byline/publication',
                    'args' => ['key' => 'name'],
                ],
            ],
        ],
    ];
    $patterns = [
        'byline/information-page' => byline_newsroom_page_pattern('Information Page', 'A clear page starter for public information.', byline_newsroom_page_section('Information', byline_newsroom_paragraph('Introduce the purpose of this page, then add the details readers need.')) . byline_newsroom_page_section('Details', byline_newsroom_paragraph('Add the dates, process, contacts, or supporting context that belongs here.')) . byline_newsroom_page_section('What to expect', byline_newsroom_paragraph('Describe the next steps or useful background for readers.')) . byline_newsroom_page_section('Contact', byline_newsroom_paragraph('Add a public contact route or invitation for questions.'))),
        'byline/about-mission-page' => byline_newsroom_page_pattern('About / Mission Page', 'A page starter for an organization story and mission.', byline_newsroom_page_section('About the publication', byline_newsroom_paragraph('Explain who you are, what you cover, and how your work serves readers.')) . byline_newsroom_page_section('Mission', byline_newsroom_paragraph('Add the principles that guide this publication.')) . byline_newsroom_page_section('Values', byline_newsroom_paragraph('Describe the commitments readers should expect from this newsroom.')) . byline_newsroom_page_section('Get involved', byline_newsroom_paragraph('Invite readers or contributors to take a next step.') . byline_newsroom_button('Get in touch', '/contact/'), true)),
        'byline/policy-standards-page' => byline_newsroom_page_pattern('Policy / Standards Page', 'A structured page for standards, policies, or public commitments.', byline_newsroom_page_section('Standards', byline_newsroom_paragraph('State the policy in plain language.')) . byline_newsroom_page_section('Corrections and transparency', byline_newsroom_paragraph('Explain how the newsroom handles corrections, updates, and questions.')) . byline_newsroom_page_section('Questions', byline_newsroom_paragraph('Explain how readers can ask for clarification or report a concern.'))),
        'byline/join-recruiting-page' => byline_newsroom_page_pattern('Join / Recruiting Page', 'A recruiting page with an editable call to action.', byline_newsroom_page_section('Join the newsroom', byline_newsroom_paragraph('Describe who can participate, what the work involves, and how to get started.')) . byline_newsroom_page_section('Ways to contribute', byline_newsroom_paragraph('List the roles, projects, or skills that could help this publication.')) . byline_newsroom_page_section('What you will learn', byline_newsroom_paragraph('Describe the experience and support contributors can expect.')) . byline_newsroom_page_section('Take the next step', byline_newsroom_paragraph('Add an invitation or deadline.') . byline_newsroom_button('Get in touch', '/contact/'), true)),
        'byline/contact-feedback-page' => byline_newsroom_page_pattern('Contact / Feedback Page', 'A public contact page with publication identity support.', byline_newsroom_page_section('Contact', byline_newsroom_paragraph('Contact this publication with a question, tip, correction, or feedback.', $publication_name_binding) . byline_newsroom_paragraph('Add the appropriate contact details and response expectations.')) . byline_newsroom_page_section('Feedback and corrections', byline_newsroom_paragraph('Tell readers how to report a correction or share feedback.') . byline_newsroom_button('Send feedback', '/contact/'), true)),
        'byline/leadership-page' => byline_newsroom_page_pattern('Leadership Page', 'A people-led page for leadership and governance.', byline_newsroom_page_section('Leadership', byline_newsroom_paragraph('Introduce the people responsible for this publication.')) . byline_newsroom_block_markup('byline/people', ['source' => 'selected', 'layout' => 'portrait-grid', 'showBio' => true]) . byline_newsroom_page_section('Contact leadership', byline_newsroom_paragraph('Add a public route for questions about the newsroom.') . byline_newsroom_button('Get in touch', '/contact/'), true)),
        'byline/staff-directory' => byline_newsroom_page_pattern('Staff Directory', 'A directory powered by public author profiles.', byline_newsroom_page_section('Staff', byline_newsroom_paragraph('Introduce the people who report, edit, photograph, and support this publication.')) . byline_newsroom_block_markup('byline/people', ['source' => 'all', 'layout' => 'portrait-grid', 'showPhoto' => true, 'showRole' => true, 'showBio' => true])),
        'byline/special-coverage' => byline_newsroom_page_pattern('Special Coverage', 'A story-led page starter for a continuing topic.', byline_newsroom_page_section('Special coverage', byline_newsroom_paragraph('Add a concise introduction to the reporting project.')) . byline_newsroom_block_markup('byline/stories', ['heading' => 'Latest coverage', 'source' => 'latest', 'layout' => 'featured', 'limit' => 6, 'showExcerpt' => true]) . byline_newsroom_page_section('Stay informed', byline_newsroom_paragraph('Add context, related links, or a call to follow this coverage.'))),
        'byline/sports-coverage' => byline_newsroom_page_pattern('Sports Coverage', 'A page starter combining schedule and reporting.', byline_newsroom_page_section('Sports', byline_newsroom_paragraph('Introduce the team, season, or sports project.')) . byline_newsroom_block_markup('byline/sports-schedule', ['heading' => 'Schedule and results', 'display' => 'both']) . byline_newsroom_block_markup('byline/stories', ['heading' => 'Latest sports stories', 'source' => 'latest', 'layout' => 'list', 'limit' => 6])),
        'byline/event-campaign' => byline_newsroom_page_pattern('Event / Campaign', 'A page starter for an event or public campaign.', byline_newsroom_page_section('Event or campaign', byline_newsroom_paragraph('Explain the event or campaign and why readers should care.')) . byline_newsroom_block_markup('byline/events', ['heading' => 'Upcoming dates', 'limit' => 5]) . byline_newsroom_block_markup('byline/stories', ['heading' => 'Related coverage', 'source' => 'latest', 'layout' => 'list', 'limit' => 4]) . byline_newsroom_page_section('Learn more', byline_newsroom_paragraph('Add a final invitation or public information link.') . byline_newsroom_button('Learn more', '/'), true)),
        'byline/photo-led-page' => byline_newsroom_page_pattern('Photo-led Page', 'A visual page starter using native image blocks.', byline_newsroom_page_section('Lead image', byline_newsroom_block_markup('core/image', ['sizeSlug' => 'large'], '<figure class="wp-block-image size-large"><img src="" alt="Add a lead image" /></figure>')) . byline_newsroom_page_section('The story behind the image', byline_newsroom_paragraph('Add context, captions, and reporting below the lead image.'))),
        'byline/resource-page' => byline_newsroom_page_pattern('Resource Page', 'A practical page for links and reader resources.', byline_newsroom_page_section('Resources', byline_newsroom_paragraph('Add a short explanation of how to use this resource list.') . byline_newsroom_block_markup('core/list', ['className' => 'is-style-byline-resource-list'], '<ul class="wp-block-list"><li>Add a resource link</li><li>Add another resource link</li></ul>') . byline_newsroom_button('Open a resource', '/'))),
        'byline/faq-page' => byline_newsroom_page_pattern('FAQ Page', 'A frequently asked questions page using native Details blocks.', byline_newsroom_page_section('Frequently asked questions', byline_newsroom_paragraph('Introduce the questions this page answers.')) . byline_newsroom_block_markup('core/details', ['className' => 'is-style-byline-faq'], '<details class="wp-block-details is-style-byline-faq"><summary>Question</summary><p>Add a concise answer.</p></details>') . byline_newsroom_block_markup('core/details', ['className' => 'is-style-byline-faq'], '<details class="wp-block-details is-style-byline-faq"><summary>Another question</summary><p>Add another answer.</p></details>')),
        'byline/two-column-image-text' => byline_newsroom_page_pattern('Two-column Image + Text', 'A two-column page section for visual and written content.', byline_newsroom_page_section('Image and text', byline_newsroom_columns(byline_newsroom_column(byline_newsroom_block_markup('core/image', [], '<figure class="wp-block-image"><img src="" alt="Add an image" /></figure>')) . byline_newsroom_column(byline_newsroom_heading('Add a heading', 3) . byline_newsroom_paragraph('Add supporting copy.'))))),
        'byline/featured-cta' => byline_newsroom_page_pattern('Featured CTA', 'A high-emphasis call to action.', byline_newsroom_page_section('Featured invitation', byline_newsroom_paragraph('Tell readers what to do next and why it matters.') . byline_newsroom_buttons(byline_newsroom_button('Take action'), ['className' => 'is-style-byline-standard-cta']), true)),
        'byline/fact-box' => byline_newsroom_page_pattern('Fact Box', 'A compact, scannable block for key facts.', byline_newsroom_group(byline_newsroom_heading('At a glance', 3) . byline_newsroom_block_markup('core/list', [], '<ul class="wp-block-list"><li>Add a key fact</li><li>Add a second key fact</li><li>Add a source or date</li></ul>'), ['className' => 'is-style-byline-soft-callout'])),
        'byline/key-numbers' => byline_newsroom_page_pattern('Key Numbers', 'A native columns layout for important figures.', byline_newsroom_columns(byline_newsroom_column(byline_newsroom_heading('00', 3) . byline_newsroom_paragraph('Label one')) . byline_newsroom_column(byline_newsroom_heading('00', 3) . byline_newsroom_paragraph('Label two')) . byline_newsroom_column(byline_newsroom_heading('00', 3) . byline_newsroom_paragraph('Label three')))),
        'byline/quote-callout' => byline_newsroom_page_pattern('Quote Callout', 'A quote-led callout using the native Quote block.', byline_newsroom_block_markup('core/quote', ['className' => 'is-style-byline-editorial-quote'], '<blockquote class="wp-block-quote is-style-byline-editorial-quote"><p>Add a meaningful quote.</p><cite>Source or attribution</cite></blockquote>')),
        'byline/related-resources' => byline_newsroom_page_pattern('Related Resources', 'A link list for related coverage and resources.', byline_newsroom_heading('Related resources') . byline_newsroom_block_markup('core/list', ['className' => 'is-style-byline-link-list'], '<ul class="wp-block-list"><li><a href="/">Add a related link</a></li><li><a href="/">Add another link</a></li></ul>')),
        'byline/corrections-feedback-cta' => byline_newsroom_page_pattern('Corrections & Feedback CTA', 'A transparent corrections and feedback call to action.', byline_newsroom_group(byline_newsroom_heading('See something we should fix?') . byline_newsroom_paragraph('Tell readers how to report a correction or share feedback.') . byline_newsroom_button('Contact the newsroom', '/contact/'), ['className' => 'is-style-byline-soft-callout'])),
        'byline/sports-game-recap' => byline_newsroom_post_pattern('Sports Game Recap', 'A recap starter that follows the article Primary Game.', byline_newsroom_block_markup('byline/game-score', ['source' => 'primary', 'showDetails' => true, 'showLink' => true]) . byline_newsroom_heading('What happened') . byline_newsroom_paragraph('Summarize the result, turning points, and voices from the game.') . byline_newsroom_heading('What is next') . byline_newsroom_paragraph('Add the next relevant game, practice, or story.' )),
        'byline/sports-game-preview' => byline_newsroom_post_pattern('Sports Game Preview', 'A preview starter for an article Primary Game.', byline_newsroom_block_markup('byline/game-score', ['source' => 'primary', 'showDetails' => true, 'showLink' => true]) . byline_newsroom_heading('The matchup') . byline_newsroom_paragraph('Set the scene with what readers should know before the game.') . byline_newsroom_heading('What to watch') . byline_newsroom_paragraph('Add players, trends, or context without inventing scores or live status.')),
        'byline/correction-notice' => byline_newsroom_post_pattern('Correction Notice', 'A static correction or clarification notice.', byline_newsroom_block_markup('byline/correction-notice', ['type' => 'correction', 'date' => '', 'notice' => 'Explain clearly what changed.'])),
        'byline/fact-box-post' => byline_newsroom_post_pattern('Fact Box', 'A fact box for a reported post.', byline_newsroom_group(byline_newsroom_heading('Key facts', 3) . byline_newsroom_block_markup('core/list', [], '<ul class="wp-block-list"><li>Add a verified fact</li><li>Add a source or date</li></ul>'), ['className' => 'is-style-byline-soft-callout'])),
        'byline/quote-callout-post' => byline_newsroom_post_pattern('Quote Callout', 'A quote callout for a reported post.', byline_newsroom_block_markup('core/quote', ['className' => 'is-style-byline-source-quote'], '<blockquote class="wp-block-quote is-style-byline-source-quote"><p>Add a reported quote.</p><cite>Source or attribution</cite></blockquote>')),
    ];

    foreach ($patterns as $name => $pattern) {
        register_block_pattern($name, $pattern);
    }
}
add_action('init', 'byline_newsroom_register_patterns', 33);
