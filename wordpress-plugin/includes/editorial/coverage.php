<?php

/**
 * Legacy Coverage readers for non-destructive migration. No creation/edit API.
 * Public helpers adapt /coverage responses to optional Collection presentation.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_COVERAGE_POST_TYPE = 'byline_coverage';
const BYLINE_COVERAGE_DESCRIPTION_META = '_byline_coverage_description';
const BYLINE_COVERAGE_OVERVIEW_META = '_byline_coverage_overview';
const BYLINE_COVERAGE_START_META = '_byline_coverage_start_at';
const BYLINE_COVERAGE_END_META = '_byline_coverage_end_at';
const BYLINE_COVERAGE_STATUS_META = '_byline_coverage_status';
const BYLINE_COVERAGE_PUBLIC_META = '_byline_coverage_public_enabled';
const BYLINE_COVERAGE_STAFF_META = '_byline_coverage_staff_ids';
const BYLINE_COVERAGE_STORIES_META = '_byline_coverage_story_ids';
const BYLINE_STORY_COVERAGE_META = '_byline_story_coverage_ids';

function byline_coverage_statuses(): array
{
    return [
        'upcoming' => 'Upcoming',
        'active' => 'Active',
        'past' => 'Past',
        'archived' => 'Archived',
    ];
}

function byline_sanitize_coverage_status($value): string
{
    $status = sanitize_key((string) $value);

    return array_key_exists($status, byline_coverage_statuses()) ? $status : 'upcoming';
}

function byline_sanitize_coverage_text($value, int $maximum = 240): string
{
    $value = sanitize_text_field((string) $value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_sanitize_coverage_rich_text($value, int $maximum = 10000): string
{
    $value = (string) $value;
    $value = function_exists('wp_kses_post') ? wp_kses_post($value) : sanitize_textarea_field($value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_sanitize_coverage_datetime($value): string
{
    $value = trim((string) $value);
    if ($value === '') {
        return '';
    }

    try {
        $timezone = function_exists('wp_timezone') ? wp_timezone() : new DateTimeZone('UTC');
        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1
            ? new DateTimeImmutable($value . ' 00:00:00', $timezone)
            : new DateTimeImmutable($value, $timezone);
    } catch (Exception $exception) {
        return '';
    }

    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function byline_sanitize_coverage_ids($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $ids = [];
    foreach ($value as $candidate) {
        $id = absint($candidate);
        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }

    return $ids;
}

function byline_coverage_meta_ids(int $post_id, string $key): array
{
    $value = get_post_meta($post_id, $key, true);

    if (is_string($value) && $value !== '' && function_exists('maybe_unserialize')) {
        $value = maybe_unserialize($value);
    }

    return byline_sanitize_coverage_ids($value);
}

function byline_get_coverage_story_ids(int $coverage_id): array
{
    return byline_coverage_meta_ids($coverage_id, BYLINE_COVERAGE_STORIES_META);
}

function byline_coverage_is_story(int $post_id): bool
{
    $post = get_post($post_id);

    return $post instanceof WP_Post && $post->post_type === 'post';
}

function byline_get_coverage_record(int $coverage_id): array
{
    $post = get_post($coverage_id);
    if (!$post instanceof WP_Post || $post->post_type !== BYLINE_COVERAGE_POST_TYPE) {
        return [];
    }

    return [
        'id' => (int) $post->ID,
        'title' => (string) $post->post_title,
        'slug' => (string) ($post->post_name ?? ''),
        'description' => byline_sanitize_coverage_text(get_post_meta($coverage_id, BYLINE_COVERAGE_DESCRIPTION_META, true), 320),
        'overview' => byline_sanitize_coverage_rich_text(get_post_meta($coverage_id, BYLINE_COVERAGE_OVERVIEW_META, true), 10000),
        'startAt' => byline_sanitize_coverage_datetime(get_post_meta($coverage_id, BYLINE_COVERAGE_START_META, true)),
        'endAt' => byline_sanitize_coverage_datetime(get_post_meta($coverage_id, BYLINE_COVERAGE_END_META, true)),
        'status' => byline_sanitize_coverage_status(get_post_meta($coverage_id, BYLINE_COVERAGE_STATUS_META, true)),
        'public' => (bool) get_post_meta($coverage_id, BYLINE_COVERAGE_PUBLIC_META, true),
        'staffIds' => byline_coverage_meta_ids($coverage_id, BYLINE_COVERAGE_STAFF_META),
        'storyIds' => byline_get_coverage_story_ids($coverage_id),
        'postStatus' => (string) $post->post_status,
    ];
}

function byline_public_story_projection($story): ?array
{
    if (!$story instanceof WP_Post || $story->post_type !== 'post' || $story->post_status !== 'publish') {
        return null;
    }

    $url = function_exists('get_permalink') ? get_permalink((int) $story->ID) : '';
    $excerpt = function_exists('get_the_excerpt') ? get_the_excerpt($story) : '';

    return [
        'id' => (int) $story->ID,
        'slug' => (string) ($story->post_name ?? ''),
        'title' => sanitize_text_field((string) $story->post_title),
        'url' => is_string($url) ? esc_url_raw($url) : '',
        'excerpt' => sanitize_text_field((string) $excerpt),
        'publishedAt' => (string) ($story->post_date_gmt ?? $story->post_date ?? ''),
        'modifiedAt' => (string) ($story->post_modified_gmt ?? $story->post_modified ?? ''),
    ];
}

function byline_get_public_coverage(int $coverage_id): ?array
{
    return byline_collection_public_coverage($coverage_id);
}

function byline_get_public_coverage_by_slug(string $slug): ?array
{
    $slug = sanitize_title($slug);
    if (!$slug) { return null; }
    $posts = get_posts(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'numberposts' => -1, 'meta_key' => BYLINE_COLLECTION_PUBLIC_META]);
    foreach ($posts as $post) {
        $settings = byline_collection_public_settings((int) $post->ID);
        if ($settings['publicSlug'] === $slug) { return byline_collection_public_coverage((int) $post->ID); }
    }
    return null;
}

function byline_list_public_coverages(array $args = []): array
{
    $posts = get_posts(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'numberposts' => -1,
        'meta_key' => BYLINE_COLLECTION_PUBLIC_META, 'orderby' => 'date', 'order' => 'DESC']);
    $result = [];
    foreach ($posts as $post) {
        $projection = byline_collection_public_coverage((int) $post->ID);
        if ($projection && (!isset($args['status']) || $args['status'] === $projection['status'])) { $result[] = $projection; }
        if (count($result) >= min(100, max(1, absint($args['limit'] ?? 50)))) { break; }
    }
    return $result;
}

function byline_coverage_register_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_COVERAGE_POST_TYPE, [
        'labels' => ['name' => 'Coverage', 'singular_name' => 'Coverage'],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title', 'editor', 'thumbnail', 'revisions'],
        'map_meta_cap' => true,
        'capability_type' => 'post',
    ]);
}
add_action('init', 'byline_coverage_register_post_type');
