<?php
/**
 * Read-only adapter around WordPress Core Notes.
 *
 * Core Notes are comments with `comment_type = 'note'`. WordPress and Gutenberg
 * own their creation, replies, mentions, resolution and email; Byline only
 * reads them through `get_comments()` to tell an editor where unresolved copy
 * feedback exists. Nothing here copies a Note into post meta, a task, an
 * activity record or any other store, and nothing here writes a Note.
 *
 * Open threads are top-level Notes with comment status `hold`; resolved threads
 * are top-level Notes with status `approve` (that is exactly what the editor
 * writes when somebody resolves or reopens a thread). Only top-level Notes
 * (`comment_parent = 0`) are counted so a thread with five replies is one
 * thread. Anchors, selected text and block coordinates are never read: they are
 * private editor state that Gutenberg alone interprets.
 *
 * Visibility follows WordPress' article boundary, `edit_post` on that story. It
 * deliberately does NOT follow `byline_story_context()`, which also admits
 * photographers, interviewers and task assignees who may see planning context
 * but are not entitled to copy-editing discussion. A viewer who cannot edit the
 * story receives no counts, names, times or excerpts: the summary is `null`.
 */
if (!defined('ABSPATH')) {
    exit;
}

/** The Core comment type. Every Notes query in Byline states it explicitly. */
const BYLINE_NOTES_COMMENT_TYPE = 'note';

/** Open threads shown in the Story Workspace preview. */
const BYLINE_NOTES_PREVIEW_LIMIT = 3;
const BYLINE_NOTES_EXCERPT_LENGTH = 160;

/**
 * Is the Core Notes feature usable for this story, and where does the editor live?
 *
 * Feature detection only; there is no WordPress version check. Core registers
 * Notes support as an `editor` sub-feature of the post type and makes `note`
 * an avatar comment type, and a site can still opt a post type out.
 *
 * @return array{available:bool,url:string,message:string}
 */
function byline_notes_support(int $post_id = 0): array
{
    $editor_supports_notes = false;
    if ($post_id > 0 && function_exists('get_all_post_type_supports')) {
        $post_type = function_exists('get_post_type') ? get_post_type($post_id) : '';
        $supports = get_all_post_type_supports(is_string($post_type) && $post_type !== '' ? $post_type : 'post');
        $editor = is_array($supports['editor'] ?? null) ? $supports['editor'] : [];
        foreach ($editor as $feature) {
            if (is_array($feature) && !empty($feature['notes'])) {
                $editor_supports_notes = true;
                break;
            }
        }
    }

    // is_avatar_comment_type() is a public Core function; 'note' became one of
    // its types with the Core Notes feature, so it is a useful API signal.
    $core_notes_api = function_exists('get_comments')
        && function_exists('is_avatar_comment_type')
        && is_avatar_comment_type(BYLINE_NOTES_COMMENT_TYPE);
    $edit_url = $post_id > 0 && function_exists('get_edit_post_link')
        ? (string) get_edit_post_link($post_id, 'raw')
        : '';
    $available = $editor_supports_notes && $core_notes_api && $edit_url !== '';

    return [
        'available' => $available,
        // The ordinary post editor. WordPress documents no URL that opens the
        // Notes panel directly, so none is invented here.
        'url' => $available ? esc_url_raw($edit_url) : '',
        'message' => $available ? '' : 'Notes are not available for this story in the current WordPress editor.',
    ];
}

/** May this user see Note data for this story? `edit_post` on that story, nothing broader. */
function byline_notes_user_can_view(int $story_id, ?int $user_id = null): bool
{
    $post = $story_id > 0 ? get_post($story_id) : null;
    if (!is_object($post) || (string) ($post->post_type ?? '') !== 'post') {
        return false;
    }
    $user_id = $user_id !== null ? absint($user_id) : (function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0);
    if ($user_id <= 0) {
        return false;
    }

    return function_exists('user_can') && (bool) user_can($user_id, 'edit_post', (int) $post->ID);
}

/**
 * Base arguments for every Notes query. `type` is always explicit: Core
 * excludes Notes from ordinary comment queries unless it is requested, and
 * Byline never asks for ordinary reader comments here.
 *
 * @return array<string,mixed>
 */
function byline_notes_query_args(array $args): array
{
    return array_merge([
        'update_comment_meta_cache' => false,
        'update_comment_post_cache' => false,
    ], $args, ['type' => BYLINE_NOTES_COMMENT_TYPE]);
}

/** Per-request memo of thread counts, keyed by story id. Flushed when any comment changes. */
function byline_notes_count_cache(?array $store = null, bool $reset = false): array
{
    static $cache = [];
    if ($reset) {
        $cache = [];
    }
    if ($store !== null) {
        $cache = $store + $cache;
    }

    return $cache;
}

function byline_notes_flush_count_cache(): void
{
    byline_notes_count_cache(null, true);
}
foreach (['wp_insert_comment', 'edit_comment', 'transition_comment_status', 'deleted_comment', 'trashed_comment', 'untrashed_comment', 'spammed_comment', 'unspammed_comment'] as $byline_notes_hook) {
    add_action($byline_notes_hook, 'byline_notes_flush_count_cache');
}
unset($byline_notes_hook);

/**
 * Open and resolved thread counts for many stories with ONE comments query.
 *
 * Only top-level Notes are read; no reply and no Note body is ever needed for a
 * count. Results are memoised for the request so a Planning page does not
 * query once per row. Callers must already have checked `edit_post`.
 *
 * @param list<int> $story_ids
 * @return array<int,array{open:int,resolved:int}>
 */
function byline_notes_thread_counts(array $story_ids): array
{
    $story_ids = array_values(array_unique(array_filter(array_map('absint', $story_ids))));
    $known = byline_notes_count_cache();
    $missing = array_values(array_filter($story_ids, static function (int $id) use ($known): bool { return !isset($known[$id]); }));

    if ($missing !== [] && function_exists('get_comments')) {
        $fresh = [];
        foreach ($missing as $id) {
            $fresh[$id] = ['open' => 0, 'resolved' => 0];
        }
        $threads = get_comments(byline_notes_query_args([
            'post__in' => $missing,
            'parent' => 0,
            'status' => ['hold', 'approve'],
            'orderby' => 'none',
        ]));
        foreach ((array) $threads as $thread) {
            if (!is_object($thread) || (string) $thread->comment_type !== BYLINE_NOTES_COMMENT_TYPE || (int) $thread->comment_parent !== 0) {
                continue;
            }
            $post_id = (int) $thread->comment_post_ID;
            if (!isset($fresh[$post_id])) {
                continue;
            }
            // '0' is hold (open); '1' is approved (resolved).
            $fresh[$post_id][(string) $thread->comment_approved === '0' ? 'open' : 'resolved']++;
        }
        byline_notes_count_cache($fresh);
        $known = byline_notes_count_cache();
    }

    $counts = [];
    foreach ($story_ids as $id) {
        $counts[$id] = $known[$id] ?? ['open' => 0, 'resolved' => 0];
    }

    return $counts;
}

/**
 * Warm the count memo for a page of stories the viewer can already edit.
 *
 * @param list<int> $story_ids
 */
function byline_notes_prime_thread_counts(array $story_ids, ?int $user_id = null): void
{
    $editable = array_values(array_filter(array_map('absint', $story_ids), static function (int $id) use ($user_id): bool {
        return $id > 0 && byline_notes_user_can_view($id, $user_id);
    }));
    if ($editable !== [] && byline_notes_support($editable[0])['available']) {
        byline_notes_thread_counts($editable);
    }
}

/**
 * The small private summary carried by Planning rows and the Story Workspace.
 *
 * Returns `null` unless the viewer may edit the story, so a participant who
 * can see the workspace but not the article learns nothing about its Notes.
 *
 * @return array{available:bool,canView:bool,openCount:int,resolvedCount:int,editUrl:string}|null
 */
function byline_notes_summary(int $story_id, ?int $user_id = null): ?array
{
    if (!byline_notes_user_can_view($story_id, $user_id)) {
        return null;
    }
    $support = byline_notes_support($story_id);
    if (!$support['available']) {
        return ['available' => false, 'canView' => true, 'openCount' => 0, 'resolvedCount' => 0, 'editUrl' => ''];
    }
    $counts = byline_notes_thread_counts([$story_id])[$story_id] ?? ['open' => 0, 'resolved' => 0];

    return [
        'available' => true,
        'canView' => true,
        'openCount' => $counts['open'],
        'resolvedCount' => $counts['resolved'],
        'editUrl' => $support['url'],
    ];
}

/**
 * A short plain-text excerpt of a Note for compact cards. Core keeps the rich
 * content; Byline never renders or stores it.
 */
function byline_notes_excerpt(string $content, int $length = BYLINE_NOTES_EXCERPT_LENGTH): string
{
    $text = function_exists('wp_strip_all_tags') ? wp_strip_all_tags($content) : strip_tags($content);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    // Entities such as &lt;b&gt; decode to markup-looking text; strip once more.
    $text = function_exists('wp_strip_all_tags') ? wp_strip_all_tags($text) : strip_tags($text);
    $text = (string) preg_replace('/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{2028}\x{2029}\x{FEFF}]+/u', ' ', $text);
    $text = trim((string) preg_replace('/\s+/u', ' ', $text));
    if ($text === '') {
        return '';
    }
    if (function_exists('mb_strlen') && mb_strlen($text) > $length) {
        return rtrim((string) mb_substr($text, 0, $length - 1)) . '…';
    }

    return $text;
}

function byline_notes_iso_gmt(string $gmt): ?string
{
    $time = $gmt !== '' && $gmt !== '0000-00-00 00:00:00' ? strtotime($gmt . ' UTC') : false;

    return $time === false ? null : gmdate('Y-m-d\TH:i:s\Z', $time);
}

/** @return array{id:int,name:string,avatarUrl?:string} */
function byline_notes_author(object $note): array
{
    $user_id = (int) ($note->user_id ?? 0);
    $person = $user_id > 0 && function_exists('byline_editorial_rest_user_person') ? byline_editorial_rest_user_person($user_id) : null;
    if ($person !== null) {
        return $person;
    }
    $name = trim(function_exists('sanitize_text_field') ? sanitize_text_field((string) ($note->comment_author ?? '')) : (string) ($note->comment_author ?? ''));

    return ['id' => $user_id, 'name' => $name !== '' ? $name : 'Unknown author'];
}

/**
 * The most recent open Note threads for one story, as safe previews.
 *
 * @return list<array{id:int,author:array<string,mixed>,excerpt:string,createdAt:string,updatedAt:?string,replyCount:int}>
 */
function byline_notes_open_previews(int $story_id, int $limit = BYLINE_NOTES_PREVIEW_LIMIT): array
{
    $limit = max(1, min(10, $limit));
    $threads = get_comments(byline_notes_query_args([
        'post_id' => $story_id,
        'parent' => 0,
        'status' => 'hold',
        'orderby' => 'comment_date_gmt',
        'order' => 'DESC',
        'number' => $limit,
    ]));
    $threads = array_values(array_filter((array) $threads, static function ($note): bool {
        return is_object($note) && (string) $note->comment_type === BYLINE_NOTES_COMMENT_TYPE && (int) $note->comment_parent === 0 && (string) $note->comment_approved === '0';
    }));
    if ($threads === []) {
        return [];
    }

    // Replies for the shown threads only. A resolve/reopen marker has no text,
    // so "has readable text" is what separates a reply from a status change.
    $ids = array_map(static function (object $note): int { return (int) $note->comment_ID; }, $threads);
    $replies = [];
    foreach ((array) get_comments(byline_notes_query_args([
        'post_id' => $story_id,
        'parent__in' => $ids,
        'status' => ['hold', 'approve'],
        'orderby' => 'comment_date_gmt',
        'order' => 'ASC',
        'number' => 500,
    ])) as $reply) {
        if (!is_object($reply) || (string) $reply->comment_type !== BYLINE_NOTES_COMMENT_TYPE || byline_notes_excerpt((string) $reply->comment_content, 1) === '') {
            continue;
        }
        $replies[(int) $reply->comment_parent][] = $reply;
    }

    $previews = [];
    foreach ($threads as $note) {
        $thread_replies = $replies[(int) $note->comment_ID] ?? [];
        $latest = $thread_replies === [] ? $note : $thread_replies[count($thread_replies) - 1];
        $created = byline_notes_iso_gmt((string) $note->comment_date_gmt) ?? '';
        $updated = byline_notes_iso_gmt((string) $latest->comment_date_gmt);
        $previews[] = [
            'id' => (int) $note->comment_ID,
            'author' => byline_notes_author($note),
            'excerpt' => byline_notes_excerpt((string) $note->comment_content),
            'createdAt' => $created,
            'updatedAt' => $updated !== null && $updated !== $created ? $updated : null,
            'replyCount' => count($thread_replies),
        ];
    }

    return $previews;
}

function byline_notes_rest_get(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $summary = byline_notes_summary($story_id);
    if ($summary === null) {
        // The permission callback already refused; this is defence in depth.
        return new WP_Error('byline_notes_forbidden', 'You are not allowed to view this story\'s notes.', ['status' => rest_authorization_required_code()]);
    }
    $limit = absint($request->get_param('limit'));
    $open = $summary['available'] && $summary['openCount'] > 0
        ? byline_notes_open_previews($story_id, $limit > 0 ? $limit : BYLINE_NOTES_PREVIEW_LIMIT)
        : [];

    return rest_ensure_response(['summary' => $summary, 'open' => $open]);
}

/**
 * Read-only. Creating, replying, resolving and deleting Notes belong to
 * Gutenberg and Core, so there is deliberately no write route.
 */
function byline_notes_register_rest_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/notes', [
        'methods' => WP_REST_Server::READABLE,
        // `edit_post` on this story, not the broader Story Workspace context.
        'callback' => 'byline_notes_rest_get',
        'permission_callback' => 'byline_editorial_rest_permission',
        'args' => [
            'id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint'],
            'limit' => ['type' => 'integer', 'required' => false, 'sanitize_callback' => 'absint'],
        ],
    ]);
}
add_action('rest_api_init', 'byline_notes_register_rest_routes');
