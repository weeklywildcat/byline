<?php

/**
 * Internal Coverage objects and their public-safe projection.
 *
 * Coverage is newsroom planning data, not a taxonomy.  The post type is kept
 * out of the public WordPress REST/schema surfaces and the public helpers below
 * deliberately construct a new allow-list projection.  In particular, staff,
 * workflow metadata, deadlines, and unpublished story titles never cross that
 * boundary.
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

/** @return array<string,string> */
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

/**
 * Store dates in an unambiguous UTC representation.  Date-only values are
 * accepted for the planning calendar and become midnight UTC; ISO values are
 * converted when the site has the normal WordPress timezone helpers.
 */
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

/** @return array<int,int> */
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

/**
 * WP serialises array meta.  This reader also accepts the occasional scalar
 * legacy value so a malformed record cannot make Planning fatal.
 *
 * @return array<int,int>
 */
function byline_coverage_meta_ids(int $post_id, string $key): array
{
    $value = get_post_meta($post_id, $key, true);

    if (is_string($value) && $value !== '' && function_exists('maybe_unserialize')) {
        $value = maybe_unserialize($value);
    }

    return byline_sanitize_coverage_ids($value);
}

/** @return array<int,int> */
function byline_get_coverage_story_ids(int $coverage_id): array
{
    return byline_coverage_meta_ids($coverage_id, BYLINE_COVERAGE_STORIES_META);
}

/** @return array<int,int> */
function byline_get_story_coverage_ids(int $story_id): array
{
    return byline_coverage_meta_ids($story_id, BYLINE_STORY_COVERAGE_META);
}

function byline_coverage_is_story(int $post_id): bool
{
    $post = get_post($post_id);

    return $post instanceof WP_Post && $post->post_type === 'post';
}

function byline_coverage_exists(int $coverage_id): bool
{
    $coverage = get_post($coverage_id);

    return $coverage instanceof WP_Post && $coverage->post_type === BYLINE_COVERAGE_POST_TYPE;
}

/**
 * Replace a Coverage's linked story list.  Invalid/non-story IDs are ignored;
 * relationships are never allowed to point at arbitrary post types.
 */
function byline_set_coverage_story_ids(int $coverage_id, array $story_ids): array
{
    if (!byline_coverage_exists($coverage_id)) {
        return [];
    }

    $valid = [];
    foreach (byline_sanitize_coverage_ids($story_ids) as $story_id) {
        if (byline_coverage_is_story($story_id)) {
            $valid[] = $story_id;
        }
    }

    update_post_meta($coverage_id, BYLINE_COVERAGE_STORIES_META, $valid);

    // Keep the story-facing convenience index in sync.  Coverage remains the
    // canonical relationship owner; this index only makes story lookups cheap.
    $existing_coverage_ids = get_posts([
        'post_type' => BYLINE_COVERAGE_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => -1,
        'numberposts' => -1,
    ]);
    foreach (is_array($existing_coverage_ids) ? $existing_coverage_ids : [] as $coverage) {
        if (!$coverage instanceof WP_Post) {
            continue;
        }

        $linked = byline_get_coverage_story_ids((int) $coverage->ID);
        if ((int) $coverage->ID === $coverage_id) {
            $linked = $valid;
        }

        foreach ($linked as $story_id) {
            $story_coverages = byline_get_story_coverage_ids($story_id);
            if ((int) $coverage->ID === $coverage_id && !in_array($coverage_id, $story_coverages, true)) {
                $story_coverages[] = $coverage_id;
            }
            if ((int) $coverage->ID !== $coverage_id && !in_array($coverage_id, $story_coverages, true)) {
                continue;
            }
            update_post_meta($story_id, BYLINE_STORY_COVERAGE_META, byline_sanitize_coverage_ids($story_coverages));
        }
    }

    // Remove this coverage from stories no longer linked.  This is a bounded
    // relationship cleanup and does not touch any other coverage membership.
    $story_candidates = get_posts([
        'post_type' => 'post',
        'post_status' => 'any',
        'posts_per_page' => -1,
        'numberposts' => -1,
    ]);
    foreach (is_array($story_candidates) ? $story_candidates : [] as $story) {
        if (!$story instanceof WP_Post) {
            continue;
        }
        $story_id = (int) $story->ID;
        $story_coverages = byline_get_story_coverage_ids($story_id);
        if (in_array($story_id, $valid, true)) {
            if (!in_array($coverage_id, $story_coverages, true)) {
                $story_coverages[] = $coverage_id;
            }
        } elseif (in_array($coverage_id, $story_coverages, true)) {
            $story_coverages = array_values(array_diff($story_coverages, [$coverage_id]));
        }
        update_post_meta($story_id, BYLINE_STORY_COVERAGE_META, byline_sanitize_coverage_ids($story_coverages));
    }

    return $valid;
}

function byline_add_story_to_coverage(int $coverage_id, int $story_id)
{
    if (!byline_coverage_exists($coverage_id) || !byline_coverage_is_story($story_id)) {
        return new WP_Error('byline_invalid_coverage_relationship', 'Select an existing coverage and story.', ['status' => 400]);
    }

    $story_ids = byline_get_coverage_story_ids($coverage_id);
    $story_ids[] = $story_id;

    return byline_set_coverage_story_ids($coverage_id, $story_ids);
}

function byline_remove_story_from_coverage(int $coverage_id, int $story_id)
{
    if (!byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }

    return byline_set_coverage_story_ids($coverage_id, array_values(array_diff(byline_get_coverage_story_ids($coverage_id), [$story_id])));
}

/**
 * Story-facing relationship adapter used by the protected editorial API. The
 * Coverage object remains the canonical owner of the linked-story list, while
 * the story meta is a synchronised lookup index for Planning and editor views.
 *
 * @return array<int,int>|WP_Error
 */
function byline_set_story_coverage_ids(int $story_id, array $coverage_ids)
{
    if (!byline_coverage_is_story($story_id)) {
        return new WP_Error('byline_story_not_found', 'The story could not be found.', ['status' => 404]);
    }
    if (!current_user_can('edit_post', $story_id)) {
        return new WP_Error('byline_coverage_forbidden', "You are not allowed to change this story's coverage.", ['status' => 403]);
    }

    $requested = byline_sanitize_coverage_ids($coverage_ids);
    $valid = [];
    foreach ($requested as $coverage_id) {
        if (!byline_coverage_exists($coverage_id)) {
            return new WP_Error('byline_coverage_not_found', 'One of the selected coverage objects does not exist.', ['status' => 404]);
        }
        $valid[] = $coverage_id;
    }

    $current = byline_get_story_coverage_ids($story_id);
    foreach (array_unique(array_merge($current, $valid)) as $coverage_id) {
        $stories = byline_get_coverage_story_ids($coverage_id);
        if (in_array($coverage_id, $valid, true)) {
            if (!in_array($story_id, $stories, true)) {
                $stories[] = $story_id;
            }
        } else {
            $stories = array_values(array_diff($stories, [$story_id]));
        }
        update_post_meta($coverage_id, BYLINE_COVERAGE_STORIES_META, byline_sanitize_coverage_ids($stories));
    }
    update_post_meta($story_id, BYLINE_STORY_COVERAGE_META, $valid);

    return $valid;
}

/**
 * Compact private relationship data for Planning/editor surfaces. This helper
 * intentionally omits staff records and story bodies; callers already have a
 * post-level capability check before requesting it.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_get_story_coverage_summary(int $story_id, ?int $user_id = null): array
{
    if (!byline_coverage_is_story($story_id)) {
        return [];
    }
    $allowed = $user_id === null
        ? current_user_can('edit_post', $story_id)
        : (function_exists('user_can') ? user_can($user_id, 'edit_post', $story_id) : false);
    if (!$allowed) {
        return [];
    }

    $summary = [];
    foreach (byline_get_story_coverage_ids($story_id) as $coverage_id) {
        $coverage = byline_get_coverage($coverage_id);
        if ($coverage === []) {
            continue;
        }
        $summary[] = [
            'id' => (int) $coverage['id'],
            'title' => (string) $coverage['title'],
            'slug' => (string) $coverage['slug'],
            'description' => (string) $coverage['description'],
            'status' => (string) $coverage['status'],
            'public' => !empty($coverage['public']),
            'startAt' => (string) $coverage['startAt'],
            'endAt' => (string) $coverage['endAt'],
            'storyCount' => count(byline_get_coverage_story_ids($coverage_id)),
        ];
    }

    return $summary;
}

function byline_story_has_coverage(int $story_id, $coverage): bool
{
    $coverage_ids = byline_get_story_coverage_ids($story_id);
    if (is_numeric($coverage)) {
        return in_array(absint($coverage), $coverage_ids, true);
    }

    $slug = sanitize_title((string) $coverage);
    foreach ($coverage_ids as $coverage_id) {
        $record = byline_get_coverage($coverage_id);
        if ($record !== [] && (string) $record['slug'] === $slug) {
            return true;
        }
    }

    return false;
}

/** @return array<string,mixed> */
function byline_sanitize_coverage_input(array $input, array $existing = []): array
{
    $result = [
        'title' => byline_sanitize_coverage_text($input['title'] ?? ($existing['title'] ?? ''), 200),
        'slug' => sanitize_title((string) ($input['slug'] ?? ($existing['slug'] ?? ''))),
        'description' => byline_sanitize_coverage_text($input['description'] ?? ($existing['description'] ?? ''), 320),
        'overview' => byline_sanitize_coverage_rich_text($input['overview'] ?? ($existing['overview'] ?? ''), 10000),
        'startAt' => byline_sanitize_coverage_datetime($input['startAt'] ?? ($existing['startAt'] ?? '')),
        'endAt' => byline_sanitize_coverage_datetime($input['endAt'] ?? ($existing['endAt'] ?? '')),
        'status' => byline_sanitize_coverage_status($input['status'] ?? ($existing['status'] ?? 'upcoming')),
        'public' => !empty($input['public'] ?? ($existing['public'] ?? false)),
        'staffIds' => byline_sanitize_coverage_ids($input['staffIds'] ?? ($existing['staffIds'] ?? [])),
        'storyIds' => byline_sanitize_coverage_ids($input['storyIds'] ?? ($existing['storyIds'] ?? [])),
    ];

    if ($result['title'] === '') {
        $result['title'] = 'Untitled coverage';
    }
    if ($result['slug'] === '') {
        $result['slug'] = sanitize_title($result['title']);
    }

    if ($result['startAt'] !== '' && $result['endAt'] !== '' && strcmp($result['endAt'], $result['startAt']) < 0) {
        $result['endAt'] = '';
    }

    return $result;
}

/** @return array<string,mixed> */
function byline_get_coverage(int $coverage_id): array
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

function byline_coverage_can_edit(int $coverage_id = 0): bool
{
    if ($coverage_id > 0) {
        return current_user_can('edit_post', $coverage_id);
    }

    return current_user_can('edit_posts');
}

/** @return array<string,mixed>|WP_Error */
function byline_create_coverage(array $input, ?int $author_id = null)
{
    if (!byline_coverage_can_edit()) {
        return new WP_Error('byline_coverage_forbidden', 'You are not allowed to create coverage.', ['status' => 403]);
    }

    $data = byline_sanitize_coverage_input($input);
    if (!empty($data['public']) && !current_user_can('publish_posts')) {
        return new WP_Error('byline_coverage_forbidden_publish', 'You are not allowed to publish coverage.', ['status' => 403]);
    }
    $post_data = [
        'post_type' => BYLINE_COVERAGE_POST_TYPE,
        'post_status' => 'publish',
        'post_title' => $data['title'],
        'post_name' => $data['slug'],
        'post_content' => $data['overview'],
        'post_author' => $author_id !== null ? absint($author_id) : (function_exists('get_current_user_id') ? get_current_user_id() : 0),
    ];
    $coverage_id = wp_insert_post($post_data, true);
    if (is_wp_error($coverage_id)) {
        return $coverage_id;
    }
    $coverage_id = absint($coverage_id);
    if ($coverage_id <= 0) {
        return new WP_Error('byline_coverage_save_failed', 'Coverage could not be saved.', ['status' => 500]);
    }

    byline_update_coverage_meta($coverage_id, $data);

    return byline_get_coverage($coverage_id);
}

/** @return array<string,mixed>|WP_Error */
function byline_update_coverage(int $coverage_id, array $input)
{
    if (!byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_coverage_not_found', 'The coverage could not be found.', ['status' => 404]);
    }
    if (!byline_coverage_can_edit($coverage_id)) {
        return new WP_Error('byline_coverage_forbidden', 'You are not allowed to edit this coverage.', ['status' => 403]);
    }

    $existing = byline_get_coverage($coverage_id);
    $data = byline_sanitize_coverage_input($input, $existing);
    if (array_key_exists('public', $input)
        && (bool) $data['public'] !== (bool) $existing['public']
        && !current_user_can('publish_posts')) {
        return new WP_Error('byline_coverage_forbidden_publish', 'You are not allowed to change public coverage.', ['status' => 403]);
    }
    $post_data = ['ID' => $coverage_id];
    if (array_key_exists('title', $input)) {
        $post_data['post_title'] = $data['title'];
    }
    if (array_key_exists('slug', $input)) {
        $post_data['post_name'] = $data['slug'];
    }
    if (array_key_exists('overview', $input)) {
        $post_data['post_content'] = $data['overview'];
    }
    if (count($post_data) > 1) {
        $updated = wp_update_post($post_data, true);
        if (is_wp_error($updated)) {
            return $updated;
        }
    }

    byline_update_coverage_meta($coverage_id, $data, $input);

    return byline_get_coverage($coverage_id);
}

function byline_update_coverage_meta(int $coverage_id, array $data, ?array $changed = null): void
{
    $changed = $changed ?? $data;
    $map = [
        'description' => BYLINE_COVERAGE_DESCRIPTION_META,
        'overview' => BYLINE_COVERAGE_OVERVIEW_META,
        'startAt' => BYLINE_COVERAGE_START_META,
        'endAt' => BYLINE_COVERAGE_END_META,
        'status' => BYLINE_COVERAGE_STATUS_META,
        'public' => BYLINE_COVERAGE_PUBLIC_META,
        'staffIds' => BYLINE_COVERAGE_STAFF_META,
    ];
    foreach ($map as $field => $key) {
        if (!array_key_exists($field, $changed)) {
            continue;
        }
        $value = $data[$field];
        if ($value === '' || $value === [] || $value === false) {
            delete_post_meta($coverage_id, $key);
            continue;
        }
        update_post_meta($coverage_id, $key, $value);
    }

    if (array_key_exists('storyIds', $changed)) {
        byline_set_coverage_story_ids($coverage_id, $data['storyIds']);
    }
}

/**
 * Returns only stories safe for a public page.  Publication state is checked
 * twice (at query and projection time) because filters or malformed records can
 * otherwise make a private title slip into a collection response.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_get_public_coverage_stories(int $coverage_id): array
{
    $coverage = byline_get_coverage($coverage_id);
    if ($coverage === [] || !$coverage['public'] || $coverage['postStatus'] !== 'publish') {
        return [];
    }

    $public = [];
    foreach ($coverage['storyIds'] as $story_id) {
        $story = get_post($story_id);
        if (!$story instanceof WP_Post || $story->post_type !== 'post' || $story->post_status !== 'publish') {
            continue;
        }

        $public[] = byline_public_story_projection($story);
    }

    return array_values(array_filter($public, static fn($story): bool => is_array($story)));
}

/** @return array<string,mixed>|null */
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

/** @return array<string,mixed>|null */
function byline_get_public_coverage(int $coverage_id): ?array
{
    $coverage = byline_get_coverage($coverage_id);
    if ($coverage === [] || !$coverage['public'] || $coverage['postStatus'] !== 'publish') {
        return null;
    }

    $post = get_post($coverage_id);
    if (!$post instanceof WP_Post) {
        return null;
    }

    return [
        'id' => (int) $post->ID,
        'slug' => (string) ($post->post_name ?? ''),
        'title' => sanitize_text_field((string) $post->post_title),
        'description' => sanitize_text_field((string) $coverage['description']),
        'overview' => $coverage['overview'],
        'startAt' => $coverage['startAt'],
        'endAt' => $coverage['endAt'],
        'status' => $coverage['status'],
        'artwork' => byline_coverage_public_artwork($coverage_id),
        'stories' => byline_get_public_coverage_stories($coverage_id),
    ];
}

function byline_get_public_coverage_by_slug(string $slug): ?array
{
    $slug = sanitize_title($slug);
    if ($slug === '') {
        return null;
    }

    $posts = get_posts([
        'post_type' => BYLINE_COVERAGE_POST_TYPE,
        'post_status' => 'publish',
        'name' => $slug,
        'posts_per_page' => 1,
        'numberposts' => 1,
    ]);
    foreach (is_array($posts) ? $posts : [] as $post) {
        if ($post instanceof WP_Post && sanitize_title((string) ($post->post_name ?? '')) === $slug) {
            return byline_get_public_coverage((int) $post->ID);
        }
    }

    return null;
}

/** @return array<string,mixed>|null */
function byline_coverage_public_artwork(int $coverage_id): ?array
{
    if (!function_exists('get_post_thumbnail_id')) {
        return null;
    }

    $attachment_id = absint(get_post_thumbnail_id($coverage_id));
    if ($attachment_id <= 0) {
        return null;
    }

    $url = function_exists('wp_get_attachment_image_url') ? wp_get_attachment_image_url($attachment_id, 'full') : '';
    if (!is_string($url) || $url === '') {
        return null;
    }
    $alt = function_exists('get_post_meta') ? get_post_meta($attachment_id, '_wp_attachment_image_alt', true) : '';

    return [
        'id' => $attachment_id,
        'url' => esc_url_raw($url),
        'alt' => sanitize_text_field((string) $alt),
    ];
}

/** @return array<int,array<string,mixed>> */
function byline_list_public_coverages(array $args = []): array
{
    $query = [
        'post_type' => BYLINE_COVERAGE_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => min(100, max(1, absint($args['limit'] ?? 50))),
        'numberposts' => min(100, max(1, absint($args['limit'] ?? 50))),
        'orderby' => 'date',
        'order' => 'DESC',
    ];
    $posts = get_posts($query);
    $result = [];
    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $projection = byline_get_public_coverage((int) $post->ID);
        if ($projection === null) {
            continue;
        }
        if (isset($args['status']) && byline_sanitize_coverage_status($args['status']) !== $projection['status']) {
            continue;
        }
        $result[] = $projection;
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

function byline_coverage_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }

    foreach ([
        BYLINE_COVERAGE_DESCRIPTION_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_coverage_text'],
        BYLINE_COVERAGE_OVERVIEW_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_coverage_rich_text'],
        BYLINE_COVERAGE_START_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_coverage_datetime'],
        BYLINE_COVERAGE_END_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_coverage_datetime'],
        BYLINE_COVERAGE_STATUS_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_coverage_status'],
        BYLINE_COVERAGE_PUBLIC_META => ['type' => 'boolean', 'sanitize_callback' => static fn($value): bool => !empty($value)],
        BYLINE_COVERAGE_STAFF_META => ['type' => 'array', 'sanitize_callback' => 'byline_sanitize_coverage_ids'],
        BYLINE_COVERAGE_STORIES_META => ['type' => 'array', 'sanitize_callback' => 'byline_sanitize_coverage_ids'],
        BYLINE_STORY_COVERAGE_META => ['type' => 'array', 'sanitize_callback' => 'byline_sanitize_coverage_ids'],
    ] as $key => $definition) {
        $post_type = in_array($key, [BYLINE_COVERAGE_DESCRIPTION_META, BYLINE_COVERAGE_OVERVIEW_META, BYLINE_COVERAGE_START_META, BYLINE_COVERAGE_END_META, BYLINE_COVERAGE_STATUS_META, BYLINE_COVERAGE_PUBLIC_META, BYLINE_COVERAGE_STAFF_META, BYLINE_COVERAGE_STORIES_META], true)
            ? BYLINE_COVERAGE_POST_TYPE
            : 'post';
        register_post_meta($post_type, $key, [
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
add_action('init', 'byline_coverage_register_meta');
