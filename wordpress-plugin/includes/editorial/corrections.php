<?php

/**
 * Structured correction and update records.
 *
 * A correction is stored as a private, WordPress-native child post.  Its public
 * projection contains only the stable record ID, kind, date, and explanatory
 * text.  The recording user and all other editorial fields remain internal.
 * Existing Correction Notice blocks are intentionally untouched.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_CORRECTION_POST_TYPE = 'byline_correction';
const BYLINE_CORRECTION_TYPE_META = '_byline_correction_type';
const BYLINE_CORRECTION_TEXT_META = '_byline_correction_text';
const BYLINE_CORRECTION_RECORDED_AT_META = '_byline_correction_recorded_at';
const BYLINE_CORRECTION_UPDATED_AT_META = '_byline_correction_updated_at';

/** @return array<string,string> */
function byline_correction_types(): array
{
    return [
        'correction' => 'Correction',
        'clarification' => 'Clarification',
        'editors-note' => "Editor's note",
        'substantive-update' => 'Substantive update',
    ];
}

function byline_sanitize_correction_type($value): string
{
    $type = sanitize_key((string) $value);

    return array_key_exists($type, byline_correction_types()) ? $type : 'correction';
}

function byline_sanitize_correction_text($value, int $maximum = 4000): string
{
    // Corrections are explanatory newsroom copy, not an HTML injection point.
    $value = function_exists('sanitize_textarea_field')
        ? sanitize_textarea_field((string) $value)
        : sanitize_text_field((string) $value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_sanitize_correction_datetime($value): string
{
    $value = trim((string) $value);
    if ($value === '') {
        return '';
    }

    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return '';
    }

    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function byline_correction_story(int $correction_id): ?WP_Post
{
    $correction = get_post($correction_id);
    if (!$correction instanceof WP_Post || $correction->post_type !== BYLINE_CORRECTION_POST_TYPE) {
        return null;
    }

    $story_id = absint($correction->post_parent ?? get_post_meta($correction_id, '_byline_correction_story_id', true));
    $story = get_post($story_id);

    return $story instanceof WP_Post && $story->post_type === 'post' ? $story : null;
}

function byline_correction_can_edit_story(int $story_id, ?int $user_id = null): bool
{
    return $user_id === null
        ? current_user_can('edit_post', $story_id)
        : user_can($user_id, 'edit_post', $story_id);
}

/** @return array<string,mixed> */
function byline_get_correction(int $correction_id): array
{
    $correction = get_post($correction_id);
    $story = $correction instanceof WP_Post ? byline_correction_story($correction_id) : null;
    if (!$correction instanceof WP_Post || $correction->post_type !== BYLINE_CORRECTION_POST_TYPE || !$story instanceof WP_Post) {
        return [];
    }

    $recorded_at = byline_sanitize_correction_datetime(get_post_meta($correction_id, BYLINE_CORRECTION_RECORDED_AT_META, true));
    if ($recorded_at === '') {
        $recorded_at = byline_sanitize_correction_datetime($correction->post_date_gmt ?? '');
    }

    $updated_at = byline_sanitize_correction_datetime(get_post_meta($correction_id, BYLINE_CORRECTION_UPDATED_AT_META, true));
    if ($updated_at === '') {
        $updated_at = byline_sanitize_correction_datetime($correction->post_modified_gmt ?? $correction->post_date_gmt ?? '');
    }

    return [
        'id' => (int) $correction->ID,
        'storyId' => (int) $story->ID,
        'type' => byline_sanitize_correction_type(get_post_meta($correction_id, BYLINE_CORRECTION_TYPE_META, true)),
        'text' => byline_sanitize_correction_text(get_post_meta($correction_id, BYLINE_CORRECTION_TEXT_META, true)),
        'recordedAt' => $recorded_at,
        'updatedAt' => $updated_at,
        // Kept only for protected editor surfaces; public projection drops it.
        'recordedBy' => absint($correction->post_author ?? 0),
        'postStatus' => (string) ($correction->post_status ?? ''),
    ];
}

/**
 * Read all structured records for a story.  The child-post query is filtered
 * again in PHP because custom query filters must never be able to associate a
 * record with a different story by accident.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_list_corrections(int $story_id, bool $public_only = false): array
{
    $story = get_post($story_id);
    if (!$story instanceof WP_Post || $story->post_type !== 'post') {
        return [];
    }
    if ($public_only && $story->post_status !== 'publish') {
        return [];
    }
    if (!function_exists('get_posts')) {
        return [];
    }

    $records = get_posts([
        'post_type' => BYLINE_CORRECTION_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $story_id,
        'posts_per_page' => 100,
        'numberposts' => 100,
        'orderby' => 'date',
        'order' => 'ASC',
    ]);
    $result = [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post || (int) ($record->post_parent ?? 0) !== $story_id) {
            continue;
        }
        $item = byline_get_correction((int) $record->ID);
        if ($item === []) {
            continue;
        }
        if ($public_only && ((string) ($record->post_status ?? '') !== 'publish' || $item['text'] === '')) {
            continue;
        }
        $result[] = $item;
    }

    return $result;
}

/**
 * Count private correction records without loading their explanatory text.
 * Bootstrap responses use this bounded query so the full correction collection
 * remains lazy until an editor opens its panel.
 */
function byline_count_corrections(int $story_id): int
{
    $story = get_post($story_id);
    if (!$story instanceof WP_Post || $story->post_type !== 'post' || !function_exists('get_posts')) {
        return 0;
    }

    $records = get_posts([
        'post_type' => BYLINE_CORRECTION_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $story_id,
        'posts_per_page' => 100,
        'numberposts' => 100,
        'fields' => 'ids',
        'no_found_rows' => true,
    ]);
    $count = 0;
    foreach (is_array($records) ? $records : [] as $record) {
        if (is_scalar($record)) {
            $count++;
        } elseif ($record instanceof WP_Post && (int) ($record->post_parent ?? 0) === $story_id) {
            $count++;
        }
    }

    return $count;
}

/** @return array<int,array<string,mixed>> */
function byline_get_public_corrections(int $story_id): array
{
    $records = byline_list_corrections($story_id, true);

    return array_map(static function (array $record): array {
        return [
            'id' => (int) $record['id'],
            'type' => (string) $record['type'],
            'text' => (string) $record['text'],
            'date' => (string) $record['recordedAt'],
        ];
    }, $records);
}

/**
 * Public transparency-log projection. The query is bounded and every record is
 * checked against its published parent story before any title or URL is added.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_list_public_corrections(array $args = []): array
{
    $limit = min(100, max(1, absint($args['limit'] ?? 50)));
    if (!function_exists('get_posts')) {
        return [];
    }

    $records = get_posts([
        'post_type' => BYLINE_CORRECTION_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]);
    $result = [];

    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post || $record->post_type !== BYLINE_CORRECTION_POST_TYPE) {
            continue;
        }

        $correction = byline_get_correction((int) $record->ID);
        $story = byline_correction_story((int) $record->ID);
        if ($correction === [] || !$story instanceof WP_Post || $story->post_status !== 'publish' || $correction['text'] === '') {
            continue;
        }

        $item = [
            'id' => (int) $correction['id'],
            'storyId' => (int) $story->ID,
            'type' => (string) $correction['type'],
            'text' => (string) $correction['text'],
            'date' => (string) $correction['recordedAt'],
            'story' => [
                'id' => (int) $story->ID,
                'title' => sanitize_text_field((string) ($story->post_title ?? '')),
                'url' => function_exists('get_permalink') ? esc_url_raw((string) get_permalink((int) $story->ID)) : '',
                'slug' => sanitize_title((string) ($story->post_name ?? '')),
            ],
        ];
        $result[] = $item;
    }

    return $result;
}

/** @return array<string,mixed>|WP_Error */
function byline_create_correction(int $story_id, array $input, ?int $user_id = null)
{
    $story = get_post($story_id);
    if (!$story instanceof WP_Post || $story->post_type !== 'post') {
        return new WP_Error('byline_correction_story_not_found', 'The story could not be found.', ['status' => 404]);
    }
    if (!byline_correction_can_edit_story($story_id, $user_id)) {
        return new WP_Error('byline_correction_forbidden', 'You are not allowed to record an update for this story.', ['status' => 403]);
    }

    $type = byline_sanitize_correction_type($input['type'] ?? 'correction');
    $text = byline_sanitize_correction_text($input['text'] ?? '');
    if ($text === '') {
        return new WP_Error('byline_correction_empty_text', 'Add the public explanation before saving.', ['status' => 400]);
    }

    $recorded_at = byline_sanitize_correction_datetime($input['recordedAt'] ?? '');
    if ($recorded_at === '') {
        $recorded_at = gmdate('Y-m-d\TH:i:s\Z');
    }
    $recorded_by = $user_id !== null ? absint($user_id) : (function_exists('get_current_user_id') ? get_current_user_id() : 0);
    $post_id = wp_insert_post([
        'post_type' => BYLINE_CORRECTION_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $story_id,
        'post_author' => $recorded_by,
        'post_title' => byline_correction_types()[$type],
        'post_content' => '',
    ], true);
    if (is_wp_error($post_id)) {
        return $post_id;
    }
    $post_id = absint($post_id);
    if ($post_id <= 0) {
        return new WP_Error('byline_correction_save_failed', 'The correction could not be saved.', ['status' => 500]);
    }

    update_post_meta($post_id, BYLINE_CORRECTION_TYPE_META, $type);
    update_post_meta($post_id, BYLINE_CORRECTION_TEXT_META, $text);
    update_post_meta($post_id, BYLINE_CORRECTION_RECORDED_AT_META, $recorded_at);
    update_post_meta($post_id, BYLINE_CORRECTION_UPDATED_AT_META, $recorded_at);

    $correction = byline_get_correction($post_id);
    if (function_exists('do_action')) {
        do_action('byline_editorial_correction_changed', $post_id, $correction, 'created');
    }

    return $correction;
}

/** @return array<string,mixed>|WP_Error */
function byline_update_correction(int $correction_id, array $input, ?int $user_id = null)
{
    $existing = byline_get_correction($correction_id);
    if ($existing === []) {
        return new WP_Error('byline_correction_not_found', 'The correction could not be found.', ['status' => 404]);
    }
    if (!byline_correction_can_edit_story((int) $existing['storyId'], $user_id)) {
        return new WP_Error('byline_correction_forbidden', 'You are not allowed to edit this update.', ['status' => 403]);
    }

    if (array_key_exists('type', $input)) {
        update_post_meta($correction_id, BYLINE_CORRECTION_TYPE_META, byline_sanitize_correction_type($input['type']));
    }
    if (array_key_exists('text', $input)) {
        $text = byline_sanitize_correction_text($input['text']);
        if ($text === '') {
            return new WP_Error('byline_correction_empty_text', 'Add the public explanation before saving.', ['status' => 400]);
        }
        update_post_meta($correction_id, BYLINE_CORRECTION_TEXT_META, $text);
    }
    update_post_meta($correction_id, BYLINE_CORRECTION_UPDATED_AT_META, gmdate('Y-m-d\TH:i:s\Z'));

    if (function_exists('wp_update_post')) {
        wp_update_post(['ID' => $correction_id]);
    }

    $correction = byline_get_correction($correction_id);
    if (function_exists('do_action')) {
        do_action('byline_editorial_correction_changed', $correction_id, $correction, 'edited');
    }

    return $correction;
}

function byline_delete_correction(int $correction_id, ?int $user_id = null): bool
{
    $existing = byline_get_correction($correction_id);
    if ($existing === [] || !byline_correction_can_edit_story((int) $existing['storyId'], $user_id)) {
        return false;
    }

    $deleted = function_exists('wp_delete_post') ? (bool) wp_delete_post($correction_id, true) : false;
    if ($deleted && function_exists('do_action')) {
        do_action('byline_editorial_correction_changed', $correction_id, $existing, 'deleted');
    }

    return $deleted;
}

function byline_correction_register_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_CORRECTION_POST_TYPE, [
        'labels' => ['name' => 'Corrections', 'singular_name' => 'Correction'],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title', 'author', 'revisions'],
        'map_meta_cap' => true,
        'capability_type' => 'post',
    ]);
}
add_action('init', 'byline_correction_register_post_type');

function byline_correction_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }

    foreach ([
        BYLINE_CORRECTION_TYPE_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_correction_type'],
        BYLINE_CORRECTION_TEXT_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_correction_text'],
        BYLINE_CORRECTION_RECORDED_AT_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_correction_datetime'],
        BYLINE_CORRECTION_UPDATED_AT_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_correction_datetime'],
    ] as $key => $definition) {
        register_post_meta(BYLINE_CORRECTION_POST_TYPE, $key, [
            'single' => true,
            'type' => $definition['type'],
            'sanitize_callback' => $definition['sanitize_callback'],
            'show_in_rest' => false,
            'auth_callback' => static function (): bool {
                return current_user_can('edit_posts');
            },
        ]);
    }
}
add_action('init', 'byline_correction_register_meta');
