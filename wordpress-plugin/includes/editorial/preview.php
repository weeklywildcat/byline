<?php

/**
 * Authenticated article preview.
 *
 * Preview is deliberately an admin page, not a public REST or front-end draft
 * route. The current editor's `edit_post` capability is the boundary for every
 * read, and the page never calls publication/deployment code.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_PREVIEW_PAGE = 'byline-article-preview';
const BYLINE_EDITORIAL_PREVIEW_HANDLE = 'byline-article-preview';

function byline_editorial_preview_post_id(): int
{
    $value = isset($_GET['post']) && is_scalar($_GET['post']) ? wp_unslash($_GET['post']) : 0;

    return absint($value);
}

function byline_editorial_preview_can_view(int $post_id): bool
{
    $post = get_post($post_id);

    return $post instanceof WP_Post
        && $post->post_type === 'post'
        && current_user_can('edit_post', $post_id);
}

function byline_editorial_preview_public_url(string $value, string $fallback = ''): string
{
    $value = trim($value);
    if ($value === '') {
        return $fallback;
    }

    $relative = strpos($value, '/') === 0 && strpos($value, '//') !== 0;
    $absolute = preg_match('#^https?://#i', $value) === 1;

    return ($relative || $absolute) ? (string) esc_url_raw($value) : $fallback;
}

function byline_editorial_preview_plain_text(string $value): string
{
    $value = preg_replace('/<[^>]*>/u', ' ', $value) ?? $value;
    $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

    return trim($value);
}

function byline_editorial_preview_date_label(string $value): string
{
    if ($value === '') {
        return '';
    }

    // The public adapter formats the calendar date in the publication locale,
    // not a time-zone-adjusted instant. Parse the date portion in UTC so the
    // two adapters cannot disagree around midnight or on a multilingual site.
    $date = substr($value, 0, 10);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1) {
        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }
        $date = gmdate('Y-m-d', $timestamp);
    }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1) {
        return $value;
    }

    $date_time = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);
    if (!$date_time instanceof DateTimeImmutable || $has_errors) {
        return $value;
    }

    $publication = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $locale = is_array($publication['locale'] ?? null) ? '' : (string) ($publication['locale'] ?? 'en-US');
    if ($locale !== '' && class_exists('IntlDateFormatter')) {
        $formatter = new IntlDateFormatter(
            $locale,
            IntlDateFormatter::LONG,
            IntlDateFormatter::NONE,
            'UTC',
            IntlDateFormatter::GREGORIAN
        );
        $formatted = $formatter->format($date_time);
        if (is_string($formatted) && $formatted !== '') {
            return $formatted;
        }
    }

    return function_exists('wp_date')
        ? wp_date('F j, Y', $date_time->getTimestamp(), new DateTimeZone('UTC'))
        : $date_time->format('F j, Y');
}

/** @return array<string,mixed>|null */
function byline_editorial_preview_image(int $attachment_id, string $sizes = '(max-width: 900px) 100vw, 900px', bool $include_attribution = true): ?array
{
    if ($attachment_id <= 0 || !function_exists('wp_get_attachment_image_url')) {
        return null;
    }

    $src = wp_get_attachment_image_url($attachment_id, 'full');
    if (!is_string($src) || $src === '') {
        return null;
    }

    $metadata = function_exists('wp_get_attachment_metadata') ? wp_get_attachment_metadata($attachment_id) : [];
    $width = is_array($metadata) ? absint($metadata['width'] ?? 0) : 0;
    $height = is_array($metadata) ? absint($metadata['height'] ?? 0) : 0;
    $alt = function_exists('wp_get_attachment_image_alt')
        ? (string) wp_get_attachment_image_alt($attachment_id)
        : (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
    if (trim($alt) === '' && function_exists('get_post')) {
        $attachment = get_post($attachment_id);
        if ($attachment instanceof WP_Post) {
            $alt = (string) ($attachment->post_title ?? '');
        }
    }
    $srcset = function_exists('wp_get_attachment_image_srcset') ? wp_get_attachment_image_srcset($attachment_id, 'full') : false;
    $image = [
        'src' => (string) esc_url_raw($src),
        'srcSet' => is_string($srcset) ? $srcset : '',
        'sizes' => $sizes,
        'alt' => byline_editorial_preview_plain_text($alt),
        'width' => $width > 0 ? $width : null,
        'height' => $height > 0 ? $height : null,
    ];

    if (!$include_attribution) {
        return $image;
    }

    $caption = function_exists('wp_get_attachment_caption') ? (string) wp_get_attachment_caption($attachment_id) : '';
    $fallback_caption = is_array($metadata) && is_array($metadata['image_meta'] ?? null)
        ? byline_editorial_preview_plain_text((string) ($metadata['image_meta']['caption'] ?? ''))
        : '';
    $credit = function_exists('byline_editorial_media_attachment_meta_value')
        ? byline_editorial_media_attachment_meta_value($attachment_id, 'creditText')
        : (function_exists('wwh_image_meta_value') ? wwh_image_meta_value($attachment_id, 'credit_text') : '');

    if (trim($caption) !== '') {
        $image['captionHtml'] = wp_kses_post($caption);
    }
    if ($fallback_caption !== '') {
        $image['fallbackCaption'] = $fallback_caption;
    }
    if (trim($credit) !== '') {
        $image['credit'] = byline_editorial_preview_plain_text($credit);
    }

    return $image;
}

/** @return array<string,mixed> */
function byline_editorial_preview_author_profile(int $user_id): array
{
    if ($user_id > 0 && function_exists('wwh_rest_author_profile')) {
        $profile = wwh_rest_author_profile(['id' => $user_id]);

        return is_array($profile) ? $profile : [];
    }

    return [
        'role' => function_exists('get_user_meta') ? (string) get_user_meta($user_id, '_ww_author_role', true) : '',
        'founder' => function_exists('get_user_meta') && (string) get_user_meta($user_id, '_ww_author_founder', true) === '1',
        'profilePhoto' => [],
        'socials' => [],
    ];
}

/** @param array<int,array<string,mixed>> $coverage */
function byline_editorial_preview_contributor(array $contributor, int $index, array $coverage = []): array
{
    $id = absint($contributor['id'] ?? 0);
    $type = sanitize_key((string) ($contributor['type'] ?? 'user'));
    $name = byline_editorial_preview_plain_text((string) ($contributor['name'] ?? $contributor['displayName'] ?? 'Contributor'));
    $slug = sanitize_title((string) ($contributor['slug'] ?? $name));
    $profile = $type === 'user' ? byline_editorial_preview_author_profile($id) : [];
    $href = $type === 'user' && $id > 0 && function_exists('get_author_posts_url')
        ? get_author_posts_url($id, $slug)
        : byline_editorial_preview_public_url('/author/' . $slug . '/', '/authors/');
    $photo_id = absint($contributor['imageId'] ?? 0);
    if ($photo_id <= 0 && is_array($profile['profilePhoto'] ?? null)) {
        $photo_id = absint($profile['profilePhoto']['id'] ?? 0);
    }

    $role = $type === 'guest'
        ? byline_editorial_preview_plain_text((string) ($contributor['role'] ?? ''))
        : byline_editorial_preview_plain_text((string) ($profile['role'] ?? $contributor['role'] ?? ''));
    if ($role === '' && $type === 'guest') {
        $role = 'Guest contributor';
    }
    if ($role === '' && $type !== 'guest' && !array_key_exists('role', $profile)) {
        $role = 'Writer';
    }

    $bio = byline_editorial_preview_plain_text((string) ($contributor['bio'] ?? $contributor['description'] ?? ''));
    $publication = byline_get_publication_config();
    $short_name = byline_editorial_preview_plain_text((string) ($publication['identity']['shortName'] ?? 'Byline'));
    if ($bio === '') {
        $bio = 'Stories reported by the ' . $short_name . ' newsroom.';
    }

    $contact = '';
    // Public guest links deliberately exclude email. Match that privacy
    // boundary even when an older guest record contains a mailto link.
    if ($type === 'user') {
        $socials = is_array($profile['socials'] ?? null) ? $profile['socials'] : [];
        $email = is_scalar($socials['email'] ?? null) ? trim((string) $socials['email']) : '';
        if ($email !== '') {
            $contact = preg_match('#^mailto:#i', $email) === 1 ? $email : 'mailto:' . $email;
        }
    }

    return [
        'id' => $type . '-' . ($id > 0 ? (string) $id : (string) $index) . '-' . $slug,
        'name' => $name !== '' ? $name : 'Contributor',
        'href' => (string) esc_url_raw($href),
        'role' => $role,
        'bio' => $bio,
        'photo' => byline_editorial_preview_image($photo_id, '132px', false),
        'founder' => $type === 'user' && !empty($profile['founder']),
        'contactHref' => $contact,
        'coverage' => $coverage,
    ];
}

/** @return WP_Term|null */
function byline_editorial_preview_primary_category(WP_Post $post): ?WP_Term
{
    $categories = function_exists('get_the_category') ? get_the_category($post->ID) : [];
    foreach (is_array($categories) ? $categories : [] as $category) {
        if ($category instanceof WP_Term && sanitize_title((string) ($category->slug ?? '')) !== 'uncategorized') {
            return $category;
        }
    }

    return null;
}

function byline_editorial_preview_is_visible_post(WP_Post $post): bool
{
    $slug = sanitize_title((string) ($post->post_name ?? ''));
    $title = strtolower(byline_editorial_preview_plain_text((string) ($post->post_title ?? '')));

    return $post->post_type === 'post'
        && $post->post_status === 'publish'
        && $slug !== 'hello-world'
        && $title !== 'hey there!'
        && byline_editorial_preview_primary_category($post) instanceof WP_Term;
}

/** @return array<int,WP_Post> */
function byline_editorial_preview_public_posts(): array
{
    if (!function_exists('get_posts')) {
        return [];
    }

    $posts = get_posts([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'numberposts' => -1,
        'orderby' => 'date',
        'order' => 'DESC',
        'ignore_sticky_posts' => true,
        'no_found_rows' => true,
        'suppress_filters' => false,
    ]);

    return array_values(array_filter(is_array($posts) ? $posts : [], static function ($post): bool {
        return $post instanceof WP_Post && byline_editorial_preview_is_visible_post($post);
    }));
}

function byline_editorial_preview_contributor_identity(array $contributor): string
{
    $type = sanitize_key((string) ($contributor['type'] ?? 'user'));
    $id = absint($contributor['id'] ?? 0);
    $slug = sanitize_title((string) ($contributor['slug'] ?? ''));

    return $type . ':' . $id . ':' . $slug;
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_preview_story_contributors(int $post_id): array
{
    if (function_exists('byline_get_story_contributors')) {
        $contributors = byline_get_story_contributors($post_id);

        return array_values(array_filter(is_array($contributors) ? $contributors : [], 'is_array'));
    }

    $post = get_post($post_id);
    if ($post instanceof WP_Post && absint($post->post_author ?? 0) > 0 && function_exists('byline_project_user_contributor')) {
        $fallback = byline_project_user_contributor(absint($post->post_author));

        return is_array($fallback) ? [$fallback] : [];
    }

    return [];
}

function byline_editorial_preview_post_has_contributor(WP_Post $post, array $target): bool
{
    $target_type = sanitize_key((string) ($target['type'] ?? 'user'));
    $target_id = absint($target['id'] ?? 0);
    $target_slug = sanitize_title((string) ($target['slug'] ?? ''));
    foreach (byline_editorial_preview_story_contributors((int) $post->ID) as $candidate) {
        if (sanitize_key((string) ($candidate['type'] ?? 'user')) !== $target_type) {
            continue;
        }
        if (absint($candidate['id'] ?? 0) === $target_id) {
            return true;
        }
        if ($target_type === 'guest' && $target_slug !== '' && sanitize_title((string) ($candidate['slug'] ?? '')) === $target_slug) {
            return true;
        }
    }

    return false;
}

/** @param array<int,array<string,mixed>> $contributors @param array<int,WP_Post> $posts */
function byline_editorial_preview_coverage_areas(array $contributors, array $posts): array
{
    $counts = [];
    foreach ($posts as $post) {
        if (!$post instanceof WP_Post || !byline_editorial_preview_is_visible_post($post)) {
            continue;
        }
        $matches = false;
        foreach ($contributors as $contributor) {
            if (byline_editorial_preview_post_has_contributor($post, $contributor)) {
                $matches = true;
                break;
            }
        }
        if (!$matches) {
            continue;
        }
        $category = byline_editorial_preview_primary_category($post);
        if (!$category instanceof WP_Term) {
            continue;
        }
        $slug = sanitize_title((string) ($category->slug ?? ''));
        if ($slug === '') {
            continue;
        }
        if (!isset($counts[$slug])) {
            $counts[$slug] = ['category' => $category, 'count' => 0];
        }
        $counts[$slug]['count']++;
    }

    uasort($counts, static function (array $left, array $right): int {
        $count_comparison = (int) $right['count'] <=> (int) $left['count'];
        if ($count_comparison !== 0) {
            return $count_comparison;
        }

        return strcasecmp(
            byline_editorial_preview_plain_text((string) ($left['category']->name ?? '')),
            byline_editorial_preview_plain_text((string) ($right['category']->name ?? ''))
        );
    });

    $areas = [];
    foreach (array_slice(array_values($counts), 0, 3) as $entry) {
        $category = $entry['category'];
        $slug = sanitize_title((string) ($category->slug ?? ''));
        $areas[] = [
            'label' => byline_editorial_preview_plain_text((string) ($category->name ?? '')),
            'href' => '/category/' . $slug . '/',
        ];
    }

    return $areas;
}

/** @return array<string,mixed> */
function byline_editorial_preview_story_card(WP_Post $post): array
{
    $category = byline_editorial_preview_primary_category($post);
    $date = (string) ($post->post_date ?? '');

    return [
        'id' => (int) $post->ID,
        'title' => byline_editorial_preview_plain_text((string) ($post->post_title ?? '')),
        'href' => (string) esc_url_raw(get_permalink($post)),
        'excerptHtml' => trim(wp_kses_post((string) get_the_excerpt($post))),
        'image' => byline_editorial_preview_image(absint(get_post_thumbnail_id($post->ID)), '92px'),
        'category' => $category instanceof WP_Term ? byline_editorial_preview_plain_text((string) ($category->name ?? '')) : null,
        'date' => $date,
        'dateLabel' => byline_editorial_preview_date_label($date),
    ];
}

/** @return array<int,WP_Term> */
function byline_editorial_preview_tags(WP_Post $post): array
{
    $tags = function_exists('get_the_tags') ? get_the_tags($post->ID) : [];

    return array_values(array_filter(is_array($tags) ? $tags : [], static fn($tag): bool => $tag instanceof WP_Term));
}

/** @return array<int,array{slug:string,id:int}> */
function byline_editorial_preview_term_keys(WP_Post $post, string $taxonomy): array
{
    $terms = $taxonomy === 'post_tag'
        ? byline_editorial_preview_tags($post)
        : (function_exists('get_the_category') ? get_the_category($post->ID) : []);

    return array_values(array_map(static function (WP_Term $term): array {
        return [
            'slug' => sanitize_title((string) ($term->slug ?? '')),
            'id' => absint($term->term_id ?? 0),
        ];
    }, array_filter(is_array($terms) ? $terms : [], static fn($term): bool => $term instanceof WP_Term)));
}

/** @param array<int,WP_Post>|null $visible_posts @return array<int,array<string,mixed>> */
function byline_editorial_preview_related_stories(WP_Post $post, ?array $visible_posts = null): array
{
    $visible_posts = $visible_posts ?? byline_editorial_preview_public_posts();
    $category_slugs = array_fill_keys(array_column(byline_editorial_preview_term_keys($post, 'category'), 'slug'), true);
    $tag_slugs = array_fill_keys(array_column(byline_editorial_preview_term_keys($post, 'post_tag'), 'slug'), true);
    $scored = [];

    foreach (array_values($visible_posts) as $index => $candidate) {
        if (!$candidate instanceof WP_Post || (int) $candidate->ID === (int) $post->ID) {
            continue;
        }
        $category_overlap = 0;
        foreach (byline_editorial_preview_term_keys($candidate, 'category') as $term) {
            $category_overlap += isset($category_slugs[$term['slug']]) ? 1 : 0;
        }
        $tag_overlap = 0;
        foreach (byline_editorial_preview_term_keys($candidate, 'post_tag') as $term) {
            $tag_overlap += isset($tag_slugs[$term['slug']]) ? 1 : 0;
        }
        $score = $category_overlap + ($tag_overlap * 2);
        if ($score <= 0) {
            continue;
        }
        $scored[] = [
            'post' => $candidate,
            'score' => $score,
            'index' => $index,
            'timestamp' => strtotime((string) ($candidate->post_date ?? '')) ?: 0,
        ];
    }

    usort($scored, static function (array $left, array $right): int {
        return ((int) $right['score'] <=> (int) $left['score'])
            ?: ((int) $right['timestamp'] <=> (int) $left['timestamp'])
            ?: ((int) $left['index'] <=> (int) $right['index']);
    });

    return array_values(array_map(static fn(array $entry): array => byline_editorial_preview_story_card($entry['post']), array_slice($scored, 0, 3)));
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_preview_legacy_corrections(string $content): array
{
    $corrections = [];
    $matches = [];
    preg_match_all('/<aside\b[^>]*class\s*=\s*["\'][^"\']*byline-correction-notice[^"\']*["\'][^>]*>[\s\S]*?<\/aside>/i', $content, $matches);
    foreach ($matches[0] ?? [] as $index => $block) {
        $body = '';
        $body_match = [];
        if (preg_match('/class\s*=\s*["\'][^"\']*byline-correction-notice-body[^"\']*["\'][^>]*>([\s\S]*?)<\/p>/i', $block, $body_match) === 1) {
            $body = byline_editorial_preview_plain_text((string) ($body_match[1] ?? ''));
        }
        if ($body === '') {
            continue;
        }
        $date = '';
        if (preg_match('/<time\b[^>]*datetime\s*=\s*["\']([^"\']+)["\'][^>]*>/i', $block, $date_match) === 1) {
            $date = trim((string) ($date_match[1] ?? ''));
        }
        $type = 'correction';
        if (preg_match('/data-correction-type\s*=\s*["\']([^"\']+)["\']/i', $block, $type_match) === 1) {
            $type = byline_editorial_preview_correction_type((string) ($type_match[1] ?? 'correction'));
        }
        $corrections[] = [
            'id' => 'legacy-' . (int) $index,
            'type' => $type,
            'date' => $date,
            'text' => $body,
            'legacy' => true,
        ];
    }

    return $corrections;
}

function byline_editorial_preview_correction_type(string $value): string
{
    $normalized = strtolower(str_replace(['_', ' '], '-', sanitize_key($value)));
    if ($normalized === 'clarification') {
        return 'clarification';
    }
    if (in_array($normalized, ['editor-note', 'editors-note', 'note'], true)) {
        return 'editor-note';
    }
    if (in_array($normalized, ['substantive-update', 'substantive', 'update'], true)) {
        return 'substantive-update';
    }

    return 'correction';
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_preview_public_corrections(int $post_id, string $content): array
{
    $corrections = byline_editorial_preview_legacy_corrections($content);
    $keys = [];
    foreach ($corrections as $correction) {
        $keys[] = strtolower((string) ($correction['type'] ?? 'correction')) . '|' . (string) ($correction['date'] ?? '') . '|' . preg_replace('/\s+/u', ' ', strtolower((string) ($correction['text'] ?? '')));
    }

    $structured = function_exists('byline_list_corrections') ? byline_list_corrections($post_id, false) : [];
    foreach (is_array($structured) ? $structured : [] as $correction) {
        if (!is_array($correction)) {
            continue;
        }
        $text = byline_editorial_preview_plain_text((string) ($correction['text'] ?? ''));
        if ($text === '') {
            continue;
        }
        $type = byline_editorial_preview_correction_type((string) ($correction['type'] ?? 'correction'));
        $date = (string) ($correction['recordedAt'] ?? $correction['date'] ?? '');
        $key = strtolower($type) . '|' . $date . '|' . preg_replace('/\s+/u', ' ', strtolower($text));
        if (in_array($key, $keys, true)) {
            continue;
        }
        $keys[] = $key;
        $corrections[] = [
            'id' => (string) absint($correction['id'] ?? 0),
            'type' => $type,
            'date' => $date,
            'text' => $text,
            'legacy' => false,
        ];
    }

    return $corrections;
}

/** @return array<int,array{id:int,name:string,slug:string,taxonomy:string}> */
function byline_editorial_preview_public_topic_terms(WP_Post $post): array
{
    $terms = [];
    foreach (byline_editorial_preview_tags($post) as $term) {
        $slug = sanitize_title((string) ($term->slug ?? ''));
        if ($slug === '' || in_array($slug, ['special-coverage', 'athlete-of-the-week', 'athlete-of-the-month'], true)) {
            continue;
        }
        $terms[] = [
            'id' => absint($term->term_id ?? 0),
            'name' => byline_editorial_preview_plain_text((string) ($term->name ?? '')),
            'slug' => $slug,
            'taxonomy' => 'post_tag',
        ];
    }
    if ($terms !== []) {
        return $terms;
    }

    foreach (function_exists('get_the_category') ? (array) get_the_category($post->ID) : [] as $term) {
        if (!$term instanceof WP_Term || sanitize_title((string) ($term->slug ?? '')) === 'uncategorized') {
            continue;
        }
        $terms[] = [
            'id' => absint($term->term_id ?? 0),
            'name' => byline_editorial_preview_plain_text((string) ($term->name ?? '')),
            'slug' => sanitize_title((string) ($term->slug ?? '')),
            'taxonomy' => 'category',
        ];
    }

    return $terms;
}

/** @return array<int,string> */
function byline_editorial_preview_athlete_meta(WP_Post $post): array
{
    $tags = byline_editorial_preview_tags($post);
    $tag_slugs = array_map(static fn(WP_Term $term): string => sanitize_title((string) ($term->slug ?? '')), $tags);
    $is_week = in_array('athlete-of-the-week', $tag_slugs, true);
    $is_month = in_array('athlete-of-the-month', $tag_slugs, true);
    $is_athlete = $is_week || $is_month;
    if (!$is_athlete) {
        return [];
    }

    $meta = [$is_week ? 'Athlete of the Week' : 'Athlete of the Month'];
    $topic_terms = [];
    foreach ($tags as $term) {
        $slug = sanitize_title((string) ($term->slug ?? ''));
        if (in_array($slug, ['special-coverage', 'athlete-of-the-week', 'athlete-of-the-month'], true)) {
            continue;
        }
        $topic_terms[] = [
            'name' => byline_editorial_preview_plain_text((string) ($term->name ?? '')),
            'slug' => $slug,
        ];
    }
    $sport = '';
    foreach ($topic_terms as $term) {
        if (strpos((string) $term['slug'], 'sport-') === 0 || preg_match('/^sport\s*:/i', (string) $term['name']) === 1) {
            $sport = (string) $term['name'];
            break;
        }
    }
    if ($sport === '' && $topic_terms !== []) {
        $sport = (string) $topic_terms[0]['name'];
    }
    $sport = preg_replace('/^sport\s*:\s*/i', '', byline_editorial_preview_plain_text($sport)) ?? '';
    if ($sport !== '') {
        $meta[] = $sport;
    }

    return $meta;
}

function byline_editorial_preview_reading_time(string $content, string $excerpt): string
{
    $source = $content !== '' ? $content : $excerpt;
    $plain = byline_editorial_preview_plain_text($source);
    if ($plain === '') {
        return '1 min read';
    }
    $words = preg_split('/\s+/u', $plain, -1, PREG_SPLIT_NO_EMPTY);

    return max(1, (int) ceil(count(is_array($words) ? $words : []) / 225)) . ' min read';
}

/** @return array<string,mixed> */
function byline_editorial_preview_presentation(int $post_id): array
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post) {
        return [];
    }

    $publication = byline_get_publication_config();
    $title_html = function_exists('get_the_title') ? (string) get_the_title($post) : (string) ($post->post_title ?? '');
    $title_html = wp_kses_post($title_html);
    $title = byline_editorial_preview_plain_text($title_html);
    $published_at = (string) ($post->post_date ?? '');
    $modified_at = (string) ($post->post_modified ?? '');
    $published_timestamp = strtotime($published_at);
    $modified_timestamp = strtotime($modified_at);
    $has_update = $published_timestamp !== false
        && $modified_timestamp !== false
        && $modified_timestamp - $published_timestamp > (defined('HOUR_IN_SECONDS') ? HOUR_IN_SECONDS : 3600);
    $content = trim(wp_kses_post(apply_filters('the_content', (string) $post->post_content)));
    $excerpt = trim(wp_kses_post((string) get_the_excerpt($post)));
    $all_posts = byline_editorial_preview_public_posts();
    $contributors = byline_editorial_preview_story_contributors($post_id);
    $coverage = byline_editorial_preview_coverage_areas($contributors, $all_posts);
    $contributor_views = [];
    foreach ($contributors as $index => $contributor) {
        $contributor_views[] = byline_editorial_preview_contributor($contributor, (int) $index, $coverage);
    }

    $category = byline_editorial_preview_primary_category($post);
    $category_view = $category instanceof WP_Term ? [
        'label' => byline_editorial_preview_plain_text((string) ($category->name ?? '')),
        'href' => byline_editorial_preview_public_url('/category/' . sanitize_title((string) ($category->slug ?? '')) . '/', '/'),
    ] : null;

    $topic_terms = byline_editorial_preview_public_topic_terms($post);
    $topics = array_values(array_map(static fn(array $term): array => [
        'id' => (string) $term['taxonomy'] . '-' . (int) $term['id'],
        'name' => (string) $term['name'],
    ], $topic_terms));

    $public_corrections = byline_editorial_preview_public_corrections($post_id, $content);
    $corrections = [];
    $labels = function_exists('byline_correction_types') ? byline_correction_types() : [];
    foreach ($public_corrections as $correction) {
        if (!empty($correction['legacy'])) {
            continue;
        }
        $type = byline_editorial_preview_correction_type((string) ($correction['type'] ?? 'correction'));
        $date = (string) ($correction['date'] ?? '');
        $label = $type === 'editor-note'
            ? byline_editorial_preview_plain_text((string) ($labels['editors-note'] ?? 'Editor’s note'))
            : byline_editorial_preview_plain_text((string) ($labels[$type] ?? 'Correction'));
        $corrections[] = [
            'id' => (string) ($correction['id'] ?? '0'),
            'label' => $label,
            'date' => $date !== '' ? $date : null,
            'dateLabel' => $date !== '' ? byline_editorial_preview_date_label($date) : null,
            'text' => byline_editorial_preview_plain_text((string) ($correction['text'] ?? '')),
        ];
    }

    $updated = $has_update && $public_corrections === [];
    $related = byline_editorial_preview_related_stories($post, $all_posts);
    $related_ids = [];
    foreach ($related as $story) {
        $related_id = absint($story['id'] ?? 0);
        if ($related_id > 0) {
            $related_ids[$related_id] = true;
        }
    }
    $author_posts = array_values(array_filter($all_posts, static function (WP_Post $candidate) use ($post_id, $contributors, $related_ids): bool {
        if ((int) $candidate->ID === $post_id || isset($related_ids[(int) $candidate->ID])) {
            return false;
        }
        foreach ($contributors as $contributor) {
            if (byline_editorial_preview_post_has_contributor($candidate, $contributor)) {
                return true;
            }
        }

        return false;
    }));
    $author_posts = array_slice($author_posts, 0, 3);
    $more_by_author = array_values(array_map('byline_editorial_preview_story_card', $author_posts));
    $short_name = byline_editorial_preview_plain_text((string) ($publication['identity']['shortName'] ?? 'Byline'));

    return [
        'id' => $post_id,
        'url' => (string) esc_url_raw(get_permalink($post)),
        'title' => $title,
        'titleHtml' => $title_html,
        'excerptHtml' => $excerpt,
        'contentHtml' => $content,
        'category' => $category_view,
        'athleteMeta' => byline_editorial_preview_athlete_meta($post),
        'contributors' => $contributor_views,
        'fallbackByline' => $short_name . ' Staff',
        'publishedAt' => $published_at,
        'publishedLabel' => byline_editorial_preview_date_label($published_at),
        'modifiedAt' => $updated ? $modified_at : null,
        'modifiedLabel' => $updated ? byline_editorial_preview_date_label($modified_at) : null,
        'readingTime' => byline_editorial_preview_reading_time($content, $excerpt),
        'image' => byline_editorial_preview_image(absint(get_post_thumbnail_id($post_id))),
        'corrections' => $corrections,
        'topics' => $topics,
        'update' => $updated ? [
            'modifiedAt' => $modified_at,
            'label' => 'This story was updated after initial publication on ' . byline_editorial_preview_date_label($modified_at) . '.',
        ] : null,
        'relatedStories' => $related,
        'moreByAuthorStories' => $more_by_author,
        'publication' => [
            'shortName' => $short_name,
            'contactHref' => byline_editorial_preview_public_url((string) ($publication['urls']['contact'] ?? '/contact/'), '/contact/'),
        ],
    ];
}

function byline_register_editorial_preview_page(): void
{
    // A null parent intentionally creates an admin page with no visible menu
    // item. Preview is launched from the editor and remains capability-gated.
    add_submenu_page(
        null,
        'Preview as Byline',
        'Preview as Byline',
        'edit_posts',
        BYLINE_EDITORIAL_PREVIEW_PAGE,
        'byline_editorial_render_preview_page'
    );
}
add_action('admin_menu', 'byline_register_editorial_preview_page');

function byline_editorial_preview_page_url(int $post_id = 0): string
{
    $args = ['page' => BYLINE_EDITORIAL_PREVIEW_PAGE];
    if ($post_id > 0) {
        $args['post'] = $post_id;
    }

    return add_query_arg($args, admin_url('admin.php'));
}

function byline_editorial_render_preview_page(): void
{
    $post_id = byline_editorial_preview_post_id();
    if (!byline_editorial_preview_can_view($post_id)) {
        wp_die(esc_html__('Sorry, you are not allowed to preview this story.', 'weekly-wildcat-headless'));
    }

    $model = byline_editorial_preview_presentation($post_id);
    if ($model === []) {
        wp_die(esc_html__('This story could not be loaded for preview.', 'weekly-wildcat-headless'));
    }

    echo '<div class="wrap byline-article-preview-page">';
    echo '<h1>' . esc_html__('Preview as Byline', 'weekly-wildcat-headless') . '</h1>';
    echo '<p>' . esc_html__('This private preview uses the latest saved WordPress content. Interactive public actions are disabled.', 'weekly-wildcat-headless') . '</p>';
    echo '<div id="byline-article-preview-root"></div>';
    echo '</div>';
}

function byline_editorial_preview_enqueue_assets(string $hook): void
{
    if (!isset($_GET['page']) || !is_scalar($_GET['page']) || sanitize_key((string) wp_unslash($_GET['page'])) !== BYLINE_EDITORIAL_PREVIEW_PAGE) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $asset_file = dirname(__DIR__, 2) . '/build/article-preview.asset.php';
    $script_file = dirname(__DIR__, 2) . '/build/article-preview.js';
    if (!is_readable($asset_file) || !is_readable($script_file)) {
        return;
    }

    $asset = include $asset_file;
    $dependencies = is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_string($asset['version'] ?? null) ? $asset['version'] : (string) filemtime($script_file);
    wp_enqueue_script(
        BYLINE_EDITORIAL_PREVIEW_HANDLE,
        plugins_url('build/article-preview.js', $plugin_file),
        $dependencies,
        $version,
        true
    );

    $style_file = dirname(__DIR__, 2) . '/build/article-preview.css';
    if (is_readable($style_file)) {
        wp_enqueue_style(
            BYLINE_EDITORIAL_PREVIEW_HANDLE,
            plugins_url('build/article-preview.css', $plugin_file),
            [],
            (string) filemtime($style_file)
        );
    }

    $post_id = byline_editorial_preview_post_id();
    $publication = byline_get_publication_config();
    $appearance = is_array($publication['appearance'] ?? null) ? $publication['appearance'] : [];
    $theme_id = sanitize_key((string) ($appearance['theme'] ?? 'byline-modern'));
    $theme_ids = function_exists('byline_publication_theme_ids') ? byline_publication_theme_ids() : [];
    if ($theme_ids !== [] && !in_array($theme_id, $theme_ids, true)) {
        $theme_id = 'byline-modern';
    }
    $token_overrides = is_array($appearance['tokenOverrides'] ?? null) ? $appearance['tokenOverrides'] : [];
    wp_localize_script(BYLINE_EDITORIAL_PREVIEW_HANDLE, 'bylineArticlePreview', [
        'model' => byline_editorial_preview_can_view($post_id) ? byline_editorial_preview_presentation($post_id) : null,
        'stylesheetUrl' => plugins_url('build/article-preview.css', $plugin_file),
        'themeId' => $theme_id,
        'tokenOverrides' => $token_overrides,
        'postId' => $post_id,
    ]);
}
add_action('admin_enqueue_scripts', 'byline_editorial_preview_enqueue_assets', 20);

function byline_editorial_preview_noindex(): void
{
    if (isset($_GET['page']) && is_scalar($_GET['page']) && sanitize_key((string) wp_unslash($_GET['page'])) === BYLINE_EDITORIAL_PREVIEW_PAGE) {
        echo '<meta name="robots" content="noindex, nofollow">';
    }
}
add_action('admin_head', 'byline_editorial_preview_noindex');
