<?php

/**
 * Live coverage for a developing story (NYT-style live pages).
 *
 * A story is marked live, then gets short timestamped updates. Each update is a
 * private child post (`byline_live_update`) like a correction, so posting one
 * never saves or locks the article, and publishing it rebuilds the static page
 * through the normal public-revision lifecycle. Ending coverage only records
 * the end time: every update stays on the story permanently.
 *
 * Updates are written as plain text in the editor. Paragraphs, "- " bullet
 * lists and bare links are turned into a small, fixed set of HTML here, so the
 * public projection never carries editor-supplied markup.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_LIVE_UPDATE_POST_TYPE = 'byline_live_update';
const BYLINE_LIVE_STATUS_META = '_byline_live_status';
const BYLINE_LIVE_STARTED_AT_META = '_byline_live_started_at';
const BYLINE_LIVE_ENDED_AT_META = '_byline_live_ended_at';
const BYLINE_LIVE_UPDATE_PINNED_META = '_byline_live_update_pinned';
const BYLINE_LIVE_UPDATE_IMAGE_META = '_byline_live_update_image_id';
const BYLINE_LIVE_STATUSES = ['live', 'ended'];
const BYLINE_LIVE_UPDATE_TEXT_MAX = 5000;
const BYLINE_LIVE_UPDATE_TITLE_MAX = 160;

function byline_live_status_value($value): string
{
    return is_string($value) && in_array($value, BYLINE_LIVE_STATUSES, true) ? $value : '';
}

function byline_live_datetime($value): string
{
    $value = trim((string) $value);
    if ($value === '' || !preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i', $value)) return '';
    try {
        $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
        $errors = DateTimeImmutable::getLastErrors();
        if ($errors && ($errors['warning_count'] || $errors['error_count'])) return '';
    } catch (Exception $exception) {
        return '';
    }
    return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
}

function byline_live_update_text($value): string
{
    $value = str_replace(["\r\n", "\r"], "\n", (string) $value);
    $value = function_exists('sanitize_textarea_field') ? sanitize_textarea_field($value) : trim(strip_tags($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, BYLINE_LIVE_UPDATE_TEXT_MAX) : substr($value, 0, BYLINE_LIVE_UPDATE_TEXT_MAX);
}

function byline_live_update_title($value): string
{
    $value = function_exists('sanitize_text_field') ? sanitize_text_field((string) $value) : trim(strip_tags((string) $value));
    return function_exists('mb_substr') ? mb_substr($value, 0, BYLINE_LIVE_UPDATE_TITLE_MAX) : substr($value, 0, BYLINE_LIVE_UPDATE_TITLE_MAX);
}

/** Escapes a line and links bare http(s) URLs, leaving trailing punctuation outside the link. */
function byline_live_update_inline(string $line): string
{
    $parts = preg_split('~(https?://[^\s<>"]+)~i', $line, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$line];
    $html = '';
    foreach ($parts as $index => $part) {
        if ($index % 2 === 0) {
            $html .= htmlspecialchars($part, ENT_QUOTES, 'UTF-8');
            continue;
        }
        $trailing = '';
        if (preg_match('~[.,;:!?)\]]+$~', $part, $match)) {
            $trailing = $match[0];
            $part = substr($part, 0, -strlen($trailing));
        }
        $url = htmlspecialchars($part, ENT_QUOTES, 'UTF-8');
        $html .= '<a href="' . $url . '" rel="noopener">' . $url . '</a>' . htmlspecialchars($trailing, ENT_QUOTES, 'UTF-8');
    }
    return $html;
}

/**
 * Plain text to the update's public HTML: blank lines separate paragraphs, a
 * block whose lines all start with "- " or "* " is a bullet list, and single
 * line breaks inside a paragraph are kept.
 */
function byline_live_update_html(string $text): string
{
    $html = '';
    foreach (preg_split("~\n\s*\n~", trim($text)) ?: [] as $block) {
        $lines = array_values(array_filter(array_map('trim', explode("\n", $block)), static fn($line) => $line !== ''));
        if (!$lines) continue;
        $is_list = count(array_filter($lines, static fn($line) => preg_match('~^[-*]\s+~', $line) === 1)) === count($lines);
        if ($is_list) {
            $items = array_map(static fn($line) => '<li>' . byline_live_update_inline((string) preg_replace('~^[-*]\s+~', '', $line)) . '</li>', $lines);
            $html .= '<ul>' . implode('', $items) . '</ul>';
        } else {
            $html .= '<p>' . implode('<br>', array_map('byline_live_update_inline', $lines)) . '</p>';
        }
    }
    return $html;
}

/** @return array{status:string,startedAt:string,endedAt:string} */
function byline_live_story_state(int $story_id): array
{
    return [
        'status' => byline_live_status_value(get_post_meta($story_id, BYLINE_LIVE_STATUS_META, true)),
        'startedAt' => byline_live_datetime(get_post_meta($story_id, BYLINE_LIVE_STARTED_AT_META, true)),
        'endedAt' => byline_live_datetime(get_post_meta($story_id, BYLINE_LIVE_ENDED_AT_META, true)),
    ];
}

function byline_live_story(int $story_id): ?WP_Post
{
    $story = get_post($story_id);
    return $story instanceof WP_Post && $story->post_type === 'post' ? $story : null;
}

function byline_live_update_story(int $update_id): ?WP_Post
{
    $update = get_post($update_id);
    if (!$update instanceof WP_Post || $update->post_type !== BYLINE_LIVE_UPDATE_POST_TYPE) return null;
    return byline_live_story(absint($update->post_parent ?? 0));
}

function byline_live_author_name(int $user_id): string
{
    if ($user_id <= 0 || !function_exists('get_the_author_meta')) return '';
    return function_exists('sanitize_text_field') ? sanitize_text_field((string) get_the_author_meta('display_name', $user_id)) : (string) get_the_author_meta('display_name', $user_id);
}

/**
 * The public face of an update's author for the NYT-style update header: the
 * profile slug, role and headshot from the same allowlisted projection as
 * article bylines. Empty when the author has no public profile.
 */
function byline_live_author_profile(int $user_id): array
{
    $contributor = $user_id > 0 && function_exists('byline_project_user_contributor') ? byline_project_user_contributor($user_id) : null;
    if (!$contributor || ($contributor['slug'] ?? '') === '') return [];
    $profile = ['authorSlug' => (string) $contributor['slug']];
    if (($contributor['role'] ?? '') !== '') $profile['authorRole'] = (string) $contributor['role'];
    $image_id = (int) ($contributor['imageId'] ?? 0);
    $photo = $image_id > 0 && function_exists('wwh_media_image') ? wwh_media_image($image_id, 'thumbnail') : [];
    if (($photo['url'] ?? '') !== '') {
        $profile['authorPhoto'] = ['url' => (string) $photo['url'], 'width' => $photo['width'] ?? null, 'height' => $photo['height'] ?? null];
    }
    return $profile;
}

/** The update's photo with alt text and credit, or null. */
function byline_live_update_image(int $attachment_id): ?array
{
    if ($attachment_id <= 0 || !function_exists('wwh_media_image')) return null;
    $image = wwh_media_image($attachment_id, 'large');
    if (($image['url'] ?? '') === '') return null;
    $credit = function_exists('byline_photo_credit_for_attachment') ? byline_photo_credit_for_attachment($attachment_id) : '';
    return [
        'id' => $attachment_id,
        'url' => (string) $image['url'],
        'alt' => (string) ($image['alt'] ?? ''),
        'width' => $image['width'] ?? null,
        'height' => $image['height'] ?? null,
    ] + ($credit !== '' ? ['credit' => $credit] : []);
}

/** @return array<string,mixed> */
function byline_get_live_update(int $update_id): array
{
    $update = get_post($update_id);
    $story = byline_live_update_story($update_id);
    if (!$update instanceof WP_Post || !$story instanceof WP_Post) return [];
    $text = byline_live_update_text($update->post_content ?? '');
    return [
        'id' => (int) $update->ID,
        'storyId' => (int) $story->ID,
        'title' => byline_live_update_title($update->post_title ?? ''),
        'text' => $text,
        'html' => byline_live_update_html($text),
        'date' => byline_live_datetime($update->post_date_gmt ?? ''),
        'modified' => byline_live_datetime($update->post_modified_gmt ?? $update->post_date_gmt ?? ''),
        'pinned' => (bool) get_post_meta($update_id, BYLINE_LIVE_UPDATE_PINNED_META, true),
        'imageId' => absint(get_post_meta($update_id, BYLINE_LIVE_UPDATE_IMAGE_META, true)),
        'authorId' => absint($update->post_author ?? 0),
        'author' => byline_live_author_name(absint($update->post_author ?? 0)),
    ];
}

/**
 * Every update for a story, newest first. The child query is re-checked in PHP
 * so a query filter can never attach another story's update.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_list_live_updates(int $story_id): array
{
    if (!byline_live_story($story_id) || !function_exists('get_posts')) return [];
    $records = get_posts([
        'post_type' => BYLINE_LIVE_UPDATE_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $story_id,
        'posts_per_page' => -1,
        'numberposts' => -1,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    ]);
    $updates = [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post || $record->post_type !== BYLINE_LIVE_UPDATE_POST_TYPE || $record->post_status !== 'publish' || !empty($record->post_password) || (int) ($record->post_parent ?? 0) !== $story_id) continue;
        $item = byline_get_live_update((int) $record->ID);
        if ($item !== [] && ($item['text'] !== '' || $item['title'] !== '' || $item['imageId'] > 0)) $updates[] = $item;
    }
    usort($updates, static fn($a, $b) => strcmp((string) $b['date'], (string) $a['date']) ?: $b['id'] <=> $a['id']);
    return $updates;
}

/**
 * The public shape for the static site and the build snapshot: null unless the
 * story is published and has ever been live. Editor-only fields (raw text,
 * author IDs) are dropped.
 */
function byline_public_live_coverage(int $story_id): ?array
{
    $story = byline_live_story($story_id);
    $state = byline_live_story_state($story_id);
    if (!$story || $story->post_status !== 'publish' || !empty($story->post_password) || $state['status'] === '') return null;
    $updates = array_map(static function (array $update): array {
        $image = byline_live_update_image((int) $update['imageId']);
        return [
            'id' => (int) $update['id'],
            'title' => (string) $update['title'],
            'html' => (string) $update['html'],
            'date' => (string) $update['date'],
            'modified' => (string) $update['modified'],
            'pinned' => (bool) $update['pinned'],
            'author' => (string) $update['author'],
        ] + byline_live_author_profile((int) $update['authorId']) + ($image ? ['image' => $image] : []);
    }, byline_list_live_updates($story_id));
    return $state + ['updates' => $updates];
}

/** What the editor's Live coverage panel loads. */
function byline_live_coverage_editor_payload(int $story_id): array
{
    $state = byline_live_story_state($story_id);
    return ['storyId' => $story_id] + $state + ['updates' => byline_list_live_updates($story_id)];
}

/** @return array<string,mixed>|WP_Error */
function byline_set_live_status(int $story_id, string $action)
{
    if (!byline_live_story($story_id)) return new WP_Error('byline_live_story_not_found', 'The story could not be found.', ['status' => 404]);
    $state = byline_live_story_state($story_id);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    if ($action === 'start' || $action === 'resume') {
        update_post_meta($story_id, BYLINE_LIVE_STATUS_META, 'live');
        if ($state['startedAt'] === '') update_post_meta($story_id, BYLINE_LIVE_STARTED_AT_META, $now);
        delete_post_meta($story_id, BYLINE_LIVE_ENDED_AT_META);
    } elseif ($action === 'end') {
        if ($state['status'] !== 'live') return new WP_Error('byline_live_not_live', 'This story is not live.', ['status' => 400]);
        update_post_meta($story_id, BYLINE_LIVE_STATUS_META, 'ended');
        update_post_meta($story_id, BYLINE_LIVE_ENDED_AT_META, $now);
    } else {
        return new WP_Error('byline_live_unknown_action', 'Use start, end or resume.', ['status' => 400]);
    }
    if (function_exists('do_action')) do_action('byline_editorial_live_changed', $story_id, $action);
    return byline_live_coverage_editor_payload($story_id);
}

/** Only one update carries the key points at a time. */
function byline_live_unpin_others(int $story_id, int $keep_id): void
{
    foreach (byline_list_live_updates($story_id) as $update) {
        if ($update['id'] !== $keep_id && $update['pinned']) delete_post_meta((int) $update['id'], BYLINE_LIVE_UPDATE_PINNED_META);
    }
}

/** @return array<string,mixed>|WP_Error */
function byline_create_live_update(int $story_id, array $input, int $user_id)
{
    if (!byline_live_story($story_id)) return new WP_Error('byline_live_story_not_found', 'The story could not be found.', ['status' => 404]);
    $title = byline_live_update_title($input['title'] ?? '');
    $text = byline_live_update_text($input['text'] ?? '');
    $image_id = absint($input['imageId'] ?? 0);
    if ($text === '' && $title === '' && $image_id === 0) {
        return new WP_Error('byline_live_update_empty', 'Write the update before posting.', ['status' => 400]);
    }
    $post_id = wp_insert_post([
        'post_type' => BYLINE_LIVE_UPDATE_POST_TYPE,
        'post_status' => 'publish',
        'post_parent' => $story_id,
        'post_author' => $user_id,
        'post_title' => function_exists('wp_slash') ? wp_slash($title) : $title,
        'post_content' => function_exists('wp_slash') ? wp_slash($text) : $text,
    ], true);
    if (is_wp_error($post_id)) return $post_id;
    $post_id = absint($post_id);
    if ($image_id > 0) update_post_meta($post_id, BYLINE_LIVE_UPDATE_IMAGE_META, $image_id);
    if (!empty($input['pinned'])) {
        update_post_meta($post_id, BYLINE_LIVE_UPDATE_PINNED_META, 1);
        byline_live_unpin_others($story_id, $post_id);
    }
    $update = byline_get_live_update($post_id);
    if (function_exists('do_action')) do_action('byline_editorial_live_changed', $story_id, 'update-created', $update);
    return $update;
}

/** @return array<string,mixed>|WP_Error */
function byline_update_live_update(int $story_id, int $update_id, array $input)
{
    $existing = byline_get_live_update($update_id);
    if ($existing === [] || (int) $existing['storyId'] !== $story_id) {
        return new WP_Error('byline_live_update_not_found', 'The update could not be found.', ['status' => 404]);
    }
    $title = array_key_exists('title', $input) ? byline_live_update_title($input['title']) : $existing['title'];
    $text = array_key_exists('text', $input) ? byline_live_update_text($input['text']) : $existing['text'];
    $image_id = array_key_exists('imageId', $input) ? absint($input['imageId']) : (int) $existing['imageId'];
    if ($text === '' && $title === '' && $image_id === 0) {
        return new WP_Error('byline_live_update_empty', 'An update cannot be empty. Delete it instead.', ['status' => 400]);
    }
    $result = wp_update_post(['ID' => $update_id, 'post_title' => function_exists('wp_slash') ? wp_slash($title) : $title, 'post_content' => function_exists('wp_slash') ? wp_slash($text) : $text], true);
    if (is_wp_error($result)) return $result;
    if ($image_id > 0) update_post_meta($update_id, BYLINE_LIVE_UPDATE_IMAGE_META, $image_id);
    else delete_post_meta($update_id, BYLINE_LIVE_UPDATE_IMAGE_META);
    if (array_key_exists('pinned', $input)) {
        if (!empty($input['pinned'])) {
            update_post_meta($update_id, BYLINE_LIVE_UPDATE_PINNED_META, 1);
            byline_live_unpin_others($story_id, $update_id);
        } else {
            delete_post_meta($update_id, BYLINE_LIVE_UPDATE_PINNED_META);
        }
    }
    $update = byline_get_live_update($update_id);
    if (function_exists('do_action')) do_action('byline_editorial_live_changed', $story_id, 'update-edited', $update);
    return $update;
}

function byline_delete_live_update(int $story_id, int $update_id): bool
{
    $existing = byline_get_live_update($update_id);
    if ($existing === [] || (int) $existing['storyId'] !== $story_id) return false;
    $deleted = function_exists('wp_delete_post') && (bool) wp_delete_post($update_id, true);
    if ($deleted && function_exists('do_action')) do_action('byline_editorial_live_changed', $story_id, 'update-deleted', $existing);
    return $deleted;
}

function byline_live_register_post_type(): void
{
    if (!function_exists('register_post_type')) return;
    register_post_type(BYLINE_LIVE_UPDATE_POST_TYPE, [
        'labels' => ['name' => 'Live updates', 'singular_name' => 'Live update'],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title', 'editor', 'author', 'revisions'],
        'map_meta_cap' => true,
        'capability_type' => 'post',
    ]);
}
add_action('init', 'byline_live_register_post_type');

function byline_live_register_meta(): void
{
    if (!function_exists('register_post_meta')) return;
    $auth = static fn(): bool => current_user_can('edit_posts');
    foreach ([
        BYLINE_LIVE_STATUS_META => 'byline_live_status_value',
        BYLINE_LIVE_STARTED_AT_META => 'byline_live_datetime',
        BYLINE_LIVE_ENDED_AT_META => 'byline_live_datetime',
    ] as $key => $sanitize) {
        register_post_meta('post', $key, ['single' => true, 'type' => 'string', 'sanitize_callback' => $sanitize, 'show_in_rest' => false, 'auth_callback' => $auth]);
    }
    register_post_meta(BYLINE_LIVE_UPDATE_POST_TYPE, BYLINE_LIVE_UPDATE_PINNED_META, ['single' => true, 'type' => 'boolean', 'show_in_rest' => false, 'auth_callback' => $auth]);
    register_post_meta(BYLINE_LIVE_UPDATE_POST_TYPE, BYLINE_LIVE_UPDATE_IMAGE_META, ['single' => true, 'type' => 'integer', 'sanitize_callback' => 'absint', 'show_in_rest' => false, 'auth_callback' => $auth]);
}
add_action('init', 'byline_live_register_meta');

// --- REST (story-scoped, same permission as corrections) --------------------

function byline_live_rest_body(WP_REST_Request $request): array
{
    if (function_exists('byline_editorial_rest_body')) return byline_editorial_rest_body($request);
    $body = $request->get_json_params();
    return is_array($body) ? $body : [];
}

function byline_live_rest_get(WP_REST_Request $request)
{
    return rest_ensure_response(byline_live_coverage_editor_payload(absint($request->get_param('id'))));
}

function byline_live_rest_set_status(WP_REST_Request $request)
{
    $result = byline_set_live_status(absint($request->get_param('id')), sanitize_key((string) (byline_live_rest_body($request)['action'] ?? '')));
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_live_rest_create_update(WP_REST_Request $request)
{
    $user_id = function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
    $result = byline_create_live_update(absint($request->get_param('id')), byline_live_rest_body($request), $user_id);
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_live_rest_edit_update(WP_REST_Request $request)
{
    $result = byline_update_live_update(absint($request->get_param('id')), absint($request->get_param('updateId')), byline_live_rest_body($request));
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}

function byline_live_rest_delete_update(WP_REST_Request $request)
{
    $deleted = byline_delete_live_update(absint($request->get_param('id')), absint($request->get_param('updateId')));
    return $deleted
        ? rest_ensure_response(['deleted' => true])
        : new WP_Error('byline_live_update_not_found', 'The update could not be found.', ['status' => 404]);
}

/** Publishing into a public story requires publish rights as well as story access. */
function byline_live_rest_write_permission(WP_REST_Request $request)
{
    $permission = byline_editorial_rest_permission($request);
    if ($permission !== true) return $permission;
    $story = byline_live_story(absint($request->get_param('id')));
    if ($story && $story->post_status === 'publish' && !current_user_can('publish_posts')) {
        return new WP_Error('byline_live_forbidden', 'You are not allowed to publish live updates.', ['status' => 403]);
    }
    return true;
}

/** Public, published-only projection. The Worker builds presentation from this same snapshot shape. */
function byline_live_rest_public(WP_REST_Request $request)
{
    $live = byline_public_live_coverage(absint($request->get_param('id')));
    if (!$live) return new WP_Error('byline_live_not_found', 'Coverage not found.', ['status' => 404]);
    $response = rest_ensure_response($live);
    $response->header('Cache-Control', 'no-store');
    return $response;
}

function byline_live_register_rest_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/live/(?P<id>\\d+)', [
        'methods' => WP_REST_Server::READABLE, 'callback' => 'byline_live_rest_public', 'permission_callback' => '__return_true',
    ]);
    $permission = 'byline_live_rest_write_permission';
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/live', [
        ['methods' => WP_REST_Server::READABLE, 'callback' => 'byline_live_rest_get', 'permission_callback' => 'byline_editorial_rest_permission'],
        ['methods' => WP_REST_Server::CREATABLE, 'callback' => 'byline_live_rest_set_status', 'permission_callback' => $permission],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/live/updates', [
        ['methods' => WP_REST_Server::CREATABLE, 'callback' => 'byline_live_rest_create_update', 'permission_callback' => $permission],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/live/updates/(?P<updateId>\d+)', [
        ['methods' => WP_REST_Server::EDITABLE, 'callback' => 'byline_live_rest_edit_update', 'permission_callback' => $permission],
        ['methods' => 'DELETE', 'callback' => 'byline_live_rest_delete_update', 'permission_callback' => $permission],
    ]);
}
add_action('rest_api_init', 'byline_live_register_rest_routes');
