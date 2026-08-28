<?php

/**
 * Structured newsroom media requests.
 *
 * `_wwh_story_visuals` remains the legacy free-text field. A structured request
 * is an additive canonical record; reads expose the legacy note as a fallback
 * and writes never delete or overwrite that installed-site value.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_EDITORIAL_MEDIA_REQUEST_META')) {
    define('BYLINE_EDITORIAL_MEDIA_REQUEST_META', '_byline_story_visual_request_v1');
}

if (!defined('BYLINE_EDITORIAL_MEDIA_TYPES')) {
    define('BYLINE_EDITORIAL_MEDIA_TYPES', ['none', 'photo', 'gallery', 'graphic', 'video', 'other']);
}

if (!defined('BYLINE_EDITORIAL_MEDIA_STATUSES')) {
    define('BYLINE_EDITORIAL_MEDIA_STATUSES', ['needed', 'assigned', 'in-progress', 'uploaded', 'selected', 'done']);
}

function byline_editorial_media_request_default(): array
{
    return [
        'type' => 'none',
        'status' => 'needed',
        'assigneeId' => 0,
        'dueAt' => '',
        'notes' => '',
        'attachmentIds' => [],
    ];
}

function byline_editorial_media_request_is_structured(int $post_id): bool
{
    if (function_exists('metadata_exists')) {
        return (bool) metadata_exists('post', $post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META);
    }

    $stored = get_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    return is_array($stored) && $stored !== [];
}

function byline_editorial_media_request_trim(string $value, int $max_length = 4000): string
{
    $value = sanitize_textarea_field($value);

    return function_exists('mb_substr') ? mb_substr($value, 0, $max_length) : substr($value, 0, $max_length);
}

function byline_editorial_media_attachment_ids($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $ids = [];
    foreach ($value as $attachment_id) {
        $attachment_id = absint($attachment_id);
        if ($attachment_id <= 0 || in_array($attachment_id, $ids, true)) {
            continue;
        }

        $attachment = function_exists('get_post') ? get_post($attachment_id) : null;
        if ($attachment instanceof WP_Post && $attachment->post_type !== 'attachment') {
            continue;
        }

        if (function_exists('get_post_type') && get_post_type($attachment_id) !== 'attachment') {
            continue;
        }

        $ids[] = $attachment_id;
    }

    return $ids;
}

/**
 * Sanitise a request without trusting serialized input or arbitrary attachment
 * metadata. Validation that needs to return a useful error is performed by the
 * write helper after this normalization.
 */
function byline_editorial_sanitize_media_request($value): array
{
    if (is_string($value) && function_exists('json_decode')) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }

    $value = is_array($value) ? $value : [];
    $default = byline_editorial_media_request_default();
    $type = sanitize_key((string) ($value['type'] ?? $default['type']));
    $status = sanitize_key((string) ($value['status'] ?? $default['status']));

    if (!in_array($type, BYLINE_EDITORIAL_MEDIA_TYPES, true)) {
        $type = 'other';
    }
    if (!in_array($status, BYLINE_EDITORIAL_MEDIA_STATUSES, true)) {
        $status = 'needed';
    }

    $due_at = '';
    if (array_key_exists('dueAt', $value)) {
        $due_at = function_exists('byline_editorial_normalize_datetime')
            ? byline_editorial_normalize_datetime($value['dueAt'])
            : (is_scalar($value['dueAt']) ? sanitize_text_field((string) $value['dueAt']) : '');
    } elseif (array_key_exists('dueDate', $value)) {
        $due_at = function_exists('byline_editorial_normalize_datetime')
            ? byline_editorial_normalize_datetime($value['dueDate'])
            : (is_scalar($value['dueDate']) ? sanitize_text_field((string) $value['dueDate']) : '');
    }

    $notes = $value['notes'] ?? '';
    $notes = is_scalar($notes) ? byline_editorial_media_request_trim((string) $notes) : '';
    $attachment_value = $value['attachmentIds'] ?? ($value['linkedAttachmentIds'] ?? ($value['attachments'] ?? []));

    return [
        'type' => $type,
        'status' => $status,
        'assigneeId' => absint($value['assigneeId'] ?? $value['assignee'] ?? 0),
        'dueAt' => $due_at,
        'notes' => $notes,
        'attachmentIds' => byline_editorial_media_attachment_ids($attachment_value),
    ];
}

function byline_editorial_media_request_legacy_notes(int $post_id): string
{
    if (function_exists('byline_get_editorial_visuals')) {
        return byline_get_editorial_visuals($post_id);
    }

    return sanitize_textarea_field((string) get_post_meta($post_id, '_wwh_story_visuals', true));
}

/**
 * Return the structured record plus an explicit legacy marker. The legacy note
 * is used as the visible notes fallback until an editor intentionally saves a
 * structured request.
 */
function byline_get_editorial_media_request(int $post_id): array
{
    $stored = get_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    $structured = byline_editorial_media_request_is_structured($post_id);
    $request = byline_editorial_sanitize_media_request($stored);
    $legacy_notes = byline_editorial_media_request_legacy_notes($post_id);

    if (!$structured) {
        $request['notes'] = $legacy_notes;
    }

    $request['legacyNotes'] = $legacy_notes;
    $request['isLegacy'] = !$structured;

    return $request;
}

function byline_editorial_media_assignee_can_be_set(int $story_id, int $assignee_id, ?int $user_id = null): bool
{
    if ($assignee_id <= 0) {
        return true;
    }

    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);
    if ($user_id > 0 && $assignee_id === $user_id) {
        return true;
    }

    if ($user_id > 0 && function_exists('byline_editorial_user_can')) {
        return byline_editorial_user_can($user_id, 'edit_others_posts');
    }

    return function_exists('current_user_can') && current_user_can('edit_others_posts');
}

function byline_editorial_media_attachment_is_allowed(int $attachment_id, int $story_id = 0): bool
{
    if ($attachment_id <= 0) {
        return false;
    }

    $attachment = function_exists('get_post') ? get_post($attachment_id) : null;
    if ($attachment instanceof WP_Post && $attachment->post_type !== 'attachment') {
        return false;
    }
    if (function_exists('get_post_type') && get_post_type($attachment_id) !== 'attachment') {
        return false;
    }

    // A media item can safely be reused by multiple stories. There is no
    // reverse single-story pointer to overwrite here.
    return true;
}

/**
 * Persist a request privately. A writer can update the request on a story they
 * can edit, while assigning another person remains an editor-level operation.
 * Legacy free-text visuals are deliberately untouched.
 */
function byline_set_editorial_media_request(int $post_id, array $value, ?int $user_id = null)
{
    $post_id = absint($post_id);
    $post = get_post($post_id);
    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);

    $can_edit = $user_id > 0 && function_exists('byline_editorial_user_can')
        ? byline_editorial_user_can($user_id, 'edit_post', $post_id)
        : (function_exists('current_user_can') && current_user_can('edit_post', $post_id));

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return new WP_Error('byline_editorial_media_unknown_story', 'This story does not exist.', ['status' => 404]);
    }
    if (!$can_edit) {
        return new WP_Error('byline_editorial_media_forbidden', 'You are not allowed to edit this story\'s media request.', ['status' => 403]);
    }

    $request = byline_editorial_sanitize_media_request($value);
    if ($request['assigneeId'] > 0) {
        if (!get_user_by('id', $request['assigneeId'])) {
            return new WP_Error('byline_editorial_media_unknown_assignee', 'That media assignee does not exist.', ['status' => 400]);
        }
        if (!byline_editorial_media_assignee_can_be_set($post_id, $request['assigneeId'], $user_id)) {
            return new WP_Error('byline_editorial_media_assignment_forbidden', 'Only an editor can assign media work to another user.', ['status' => 403]);
        }
    }

    foreach ($request['attachmentIds'] as $attachment_id) {
        if (!byline_editorial_media_attachment_is_allowed((int) $attachment_id, $post_id)) {
            return new WP_Error('byline_editorial_media_invalid_attachment', 'One of the selected media items is not a WordPress attachment.', ['status' => 400]);
        }
    }

    update_post_meta($post_id, BYLINE_EDITORIAL_MEDIA_REQUEST_META, $request);
    $result = byline_get_editorial_media_request($post_id);
    do_action('byline_editorial_media_request_updated', $post_id, $result, $user_id);

    return $result;
}

function byline_editorial_set_media_request_attachments(int $post_id, array $attachment_ids, bool $replace = true, ?int $user_id = null)
{
    $current = byline_get_editorial_media_request($post_id);
    $ids = $replace ? $attachment_ids : array_merge((array) ($current['attachmentIds'] ?? []), $attachment_ids);
    $current['attachmentIds'] = $ids;
    unset($current['legacyNotes'], $current['isLegacy']);

    return byline_set_editorial_media_request($post_id, $current, $user_id);
}

function byline_editorial_set_media_request_featured_image(int $post_id, int $attachment_id, ?int $user_id = null)
{
    $request = byline_get_editorial_media_request($post_id);
    if (!in_array($attachment_id, (array) ($request['attachmentIds'] ?? []), true)) {
        return new WP_Error('byline_editorial_media_not_linked', 'Select the attachment for this story before making it featured.', ['status' => 400]);
    }
    if (function_exists('wp_attachment_is_image') && !wp_attachment_is_image($attachment_id)) {
        return new WP_Error('byline_editorial_media_not_image', 'Only an image attachment can be featured.', ['status' => 400]);
    }

    $user_id = function_exists('byline_editorial_planning_current_user_id')
        ? byline_editorial_planning_current_user_id($user_id)
        : absint($user_id);
    $allowed = $user_id > 0 && function_exists('byline_editorial_user_can')
        ? byline_editorial_user_can($user_id, 'edit_post', $post_id)
        : (function_exists('current_user_can') && current_user_can('edit_post', $post_id));
    if (!$allowed) {
        return new WP_Error('byline_editorial_media_forbidden', 'You are not allowed to change this story.', ['status' => 403]);
    }
    if (!function_exists('set_post_thumbnail') || !set_post_thumbnail($post_id, $attachment_id)) {
        return new WP_Error('byline_editorial_media_featured_failed', 'WordPress could not set that image as featured.', ['status' => 500]);
    }

    return byline_get_editorial_media_request($post_id);
}

function byline_editorial_media_request_needs_work(int $post_id): bool
{
    $request = byline_get_editorial_media_request($post_id);
    return ($request['type'] ?? 'none') !== 'none' && ($request['status'] ?? 'needed') !== 'done';
}

/**
 * Return the private Media Desk collection. Legacy visual notes are included as
 * `isLegacy` rows so an upgrade never makes an existing request disappear. The
 * collection is capability-filtered per story because edit_posts alone is not
 * enough to read another author's private planning data.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_list_editorial_media_requests(array $filters = [], ?int $user_id = null): array
{
    $limit = min(200, max(1, absint($filters['limit'] ?? 100)));
    $args = [
        'post_type' => 'post',
        'post_status' => ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => $limit,
        'numberposts' => $limit,
        'orderby' => 'modified',
        'order' => 'DESC',
        'no_found_rows' => true,
        'meta_query' => [
            'relation' => 'OR',
            ['key' => BYLINE_EDITORIAL_MEDIA_REQUEST_META, 'compare' => 'EXISTS'],
            ['key' => '_wwh_story_visuals', 'value' => '', 'compare' => '!='],
        ],
    ];

    if (!empty($filters['storyId'])) {
        $args['p'] = absint($filters['storyId']);
    }

    $posts = function_exists('get_posts') ? get_posts($args) : [];
    $items = [];
    $status_filter = isset($filters['status']) ? sanitize_key((string) $filters['status']) : '';
    $type_filter = isset($filters['type']) ? sanitize_key((string) $filters['type']) : '';
    $assignee_filter = isset($filters['assigneeId']) ? absint($filters['assigneeId']) : 0;
    $due_from = isset($filters['dueFrom']) && function_exists('byline_editorial_normalize_datetime')
        ? byline_editorial_normalize_datetime($filters['dueFrom'])
        : '';
    $due_to = isset($filters['dueTo']) && function_exists('byline_editorial_normalize_datetime')
        ? byline_editorial_normalize_datetime($filters['dueTo'])
        : '';

    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post || !function_exists('byline_editorial_can_view_planning_story')
            || !byline_editorial_can_view_planning_story((int) $post->ID, $user_id)) {
            continue;
        }

        $request = byline_get_editorial_media_request((int) $post->ID);
        if ($request['isLegacy'] && $request['type'] === 'none' && $request['notes'] === '') {
            continue;
        }
        if ($status_filter !== '' && $request['status'] !== $status_filter) {
            continue;
        }
        if ($type_filter !== '' && $request['type'] !== $type_filter) {
            continue;
        }
        if ($assignee_filter > 0 && absint($request['assigneeId']) !== $assignee_filter) {
            continue;
        }
        if ($due_from !== '' && ($request['dueAt'] === '' || $request['dueAt'] < $due_from)) {
            continue;
        }
        if ($due_to !== '' && ($request['dueAt'] === '' || $request['dueAt'] > $due_to)) {
            continue;
        }

        $featured_id = function_exists('get_post_thumbnail_id') ? absint(get_post_thumbnail_id((int) $post->ID)) : 0;
        $items[] = [
            'storyId' => (int) $post->ID,
            'title' => function_exists('get_the_title') ? (string) get_the_title((int) $post->ID) : (string) ($post->post_title ?? ''),
            'editUrl' => function_exists('get_edit_post_link') ? (string) get_edit_post_link((int) $post->ID, '') : '',
            'wordpressStatus' => (string) $post->post_status,
            'request' => $request,
            'featuredImage' => [
                'attachmentId' => $featured_id,
                'isLinked' => $featured_id > 0 && in_array($featured_id, (array) ($request['attachmentIds'] ?? []), true),
            ],
        ];
    }

    usort($items, static function (array $left, array $right): int {
        $left_due = (string) ($left['request']['dueAt'] ?? '');
        $right_due = (string) ($right['request']['dueAt'] ?? '');
        if ($left_due === '' && $right_due !== '') {
            return 1;
        }
        if ($left_due !== '' && $right_due === '') {
            return -1;
        }
        if ($left_due !== $right_due) {
            return strcmp($left_due, $right_due);
        }

        return ((int) $right['storyId']) <=> ((int) $left['storyId']);
    });

    return $items;
}

function byline_get_editorial_media_requests($filters = [], ?int $user_id = null): array
{
    // Some older integration code uses the plural provider as a per-story
    // lookup. Keep that call shape compatible while the REST collection accepts
    // a filter array.
    if (is_numeric($filters) && !is_array($filters)) {
        return [byline_get_editorial_media_request(absint($filters))];
    }

    $filters = is_array($filters) ? $filters : [];
    return byline_list_editorial_media_requests($filters, $user_id);
}

function byline_list_media_requests(array $filters = [], ?int $user_id = null): array
{
    return byline_list_editorial_media_requests($filters, $user_id);
}

function byline_editorial_register_media_meta(): void
{
    register_post_meta('post', BYLINE_EDITORIAL_MEDIA_REQUEST_META, [
        'single' => true,
        'type' => 'object',
        'sanitize_callback' => 'byline_editorial_sanitize_media_request',
        'show_in_rest' => false,
        'auth_callback' => static function (): bool {
            return current_user_can('edit_posts');
        },
    ]);
}
add_action('init', 'byline_editorial_register_media_meta');
