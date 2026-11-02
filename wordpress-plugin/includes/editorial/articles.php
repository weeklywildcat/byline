<?php
/** Protected article operations for remote clients. WordPress remains the content authority. */
if (!defined('ABSPATH')) { exit; }

function byline_article_error(string $code, string $message, int $status = 400, array $extra = []): WP_Error
{
    return new WP_Error('byline_article_' . $code, $message, ['status' => $status] + $extra);
}
function byline_article_permission(WP_REST_Request $request)
{
    $id = absint($request['id']);
    $post = get_post($id);
    return $post instanceof WP_Post && $post->post_type === 'post' && current_user_can('edit_post', $id);
}
/** Includes raw block markup and publication/term/media state, so same-second edits conflict too. */
function byline_article_version(int $id): string
{
    $p = get_post($id);
    return hash('sha256', wp_json_encode([$p->post_title, $p->post_content, $p->post_excerpt, $p->post_status,
        $p->post_date, $p->post_date_gmt, $p->post_modified_gmt, get_post_thumbnail_id($id),
        wp_get_post_categories($id), wp_get_post_tags($id, ['fields' => 'ids']),
        array_keys(wp_get_post_revisions($id, ['posts_per_page' => 1, 'check_enabled' => false]))]));
}
function byline_article_read(int $id, bool $body = false): array
{
    $p = get_post($id);
    $out = ['id' => $id, 'title' => $p->post_title, 'excerpt' => $p->post_excerpt, 'wordpressStatus' => $p->post_status,
        'modifiedAt' => $p->post_modified_gmt . 'Z', 'version' => byline_article_version($id),
        'scheduledAt' => $p->post_status === 'future' ? str_replace(' ', 'T', $p->post_date_gmt) . 'Z' : null,
        'sectionIds' => wp_get_post_categories($id), 'tagIds' => wp_get_post_tags($id, ['fields' => 'ids']),
        'featuredMediaId' => (int) get_post_thumbnail_id($id), 'editUrl' => get_edit_post_link($id, ''),
        'canPublish' => current_user_can('publish_posts'), 'canTrash' => current_user_can('delete_post', $id)];
    if ($body) { $out['blockMarkup'] = $p->post_content; }
    return $out;
}
function byline_article_rest_get(WP_REST_Request $request)
{
    return rest_ensure_response(byline_article_read(absint($request['id']), $request->get_param('includeBody') === 'true'));
}
function byline_article_rest_mutate(WP_REST_Request $request)
{
    $id = absint($request['id']); $action = (string) $request['action'];
    $input = byline_editorial_rest_body($request);
    $expected = $input['expectedVersion'] ?? '';
    if (!is_string($expected) || !preg_match('/^[a-f0-9]{64}$/', $expected)) { return byline_article_error('version_required', 'Read the article and supply its current version.'); }
    if (!function_exists('wp_check_post_lock')) { require_once ABSPATH . 'wp-admin/includes/post.php'; }
    if (wp_check_post_lock($id)) { return byline_article_error('locked', 'This article is open in another editor.', 409); }
    $current = byline_article_version($id);
    if (!hash_equals($current, $expected)) { return byline_article_error('conflict', 'The article changed. Read it before saving.', 409, ['current' => ['version' => $current]]); }
    $p = get_post($id); $changes = ['ID' => $id];
    // Native controller performs sanitization, term, media, content and publication capability checks.
    $native = new WP_REST_Request('POST', '/wp/v2/posts/' . $id);
    switch ($action) {
        case 'draft':
            if (!in_array($p->post_status, ['draft', 'pending'], true)) { return byline_article_error('not_draft', 'Only draft or pending articles may have their body replaced.'); }
            if (!is_string($input['blockMarkup'] ?? null) || strlen($input['blockMarkup']) > 524288) { return byline_article_error('invalid_body', 'Supply block markup up to 512 KiB.'); }
            $changes = ['content' => $input['blockMarkup']];
            break;
        case 'title':
            if (!is_string($input['title'] ?? null) || trim($input['title']) === '' || strlen($input['title']) > 960) { return byline_article_error('invalid_title', 'Supply a non-empty title up to 240 characters.'); }
            $changes = ['title' => $input['title']]; break;
        case 'excerpt':
            if (!is_string($input['excerpt'] ?? null) || strlen($input['excerpt']) > 16000) { return byline_article_error('invalid_excerpt', 'Supply an excerpt up to 4,000 characters.'); }
            $changes = ['excerpt' => $input['excerpt']]; break;
        case 'terms':
            $changes = [];
            foreach (['sectionIds' => 'categories', 'tagIds' => 'tags'] as $field => $native_field) {
                if (array_key_exists($field, $input)) {
                    if (!is_array($input[$field]) || count($input[$field]) > 30 || array_filter($input[$field], static function ($v) { return !is_int($v) || $v < 1; })) { return byline_article_error('invalid_terms', 'Supply up to 30 existing term IDs.'); }
                    $changes[$native_field] = $input[$field];
                }
            }
            if (!$changes) { return byline_article_error('empty_terms', 'Supply sections or tags.'); }
            break;
        case 'featured-media': $changes = ['featured_media' => absint($input['mediaId'] ?? 0)]; break;
        case 'schedule':
            if (!in_array($p->post_status,['draft','pending','future'],true)) { return byline_article_error('invalid_state','Only draft, pending or already scheduled articles can be scheduled. Unpublish explicitly first.',409); }
            if (!current_user_can('publish_posts')) { return byline_article_error('forbidden', 'You cannot schedule articles.', 403); }
            $at = byline_editorial_normalize_datetime($input['publishAt'] ?? '');
            if (!$at || strtotime($at) <= time() + 60) { return byline_article_error('invalid_schedule', 'Choose an explicit publication time at least one minute in the future.'); }
            $changes = ['status' => 'future', 'date_gmt' => substr($at, 0, 19)]; break;
        case 'publish':
            if (!current_user_can('publish_posts')) { return byline_article_error('forbidden', 'You cannot publish articles.', 403); }
            if ($p->post_status === 'trash') { return byline_article_error('invalid_state','Restore this article to draft before publishing.',409); }
            if ($p->post_status === 'publish') { return rest_ensure_response(byline_article_read($id)); }
            $changes = ['status' => 'publish'];
            if (in_array($p->post_status,['draft','pending','future'],true)) { $changes['date_gmt'] = gmdate('Y-m-d\TH:i:s'); }
            break;
        case 'unpublish':
            if (!current_user_can('publish_posts') || !in_array($p->post_status, ['publish', 'private'], true)) { return byline_article_error('forbidden', 'You cannot unpublish this article.', 403); }
            $changes = ['status' => 'draft']; break;
        case 'unschedule':
            if (!current_user_can('publish_posts') || $p->post_status !== 'future') { return byline_article_error('invalid_schedule', 'This article cannot be unscheduled.', 403); }
            $changes = ['status' => 'draft']; break;
        case 'trash':
            if (!current_user_can('delete_post', $id)) { return byline_article_error('forbidden', 'You cannot trash this article.', 403); }
            if (!defined('EMPTY_TRASH_DAYS') || EMPTY_TRASH_DAYS < 1) { return byline_article_error('trash_disabled', 'Trash is disabled; permanent deletion is not exposed.', 409); }
            $native = new WP_REST_Request('DELETE', '/wp/v2/posts/' . $id); $changes = ['force' => false]; break;
        case 'restore':
            if ($p->post_status !== 'trash' || !current_user_can('delete_post', $id)) { return byline_article_error('forbidden', 'You cannot restore this article.', 403); }
            // Restoring always returns a draft; it cannot silently republish.
            $changes = ['status' => 'draft']; break;
        default: return byline_article_error('unsupported', 'This article action is unavailable.', 404);
    }
    foreach ($changes as $key => $value) { $native->set_param($key, $value); }
    $result = rest_do_request($native);
    if ($result->is_error()) { return $result; }
    return rest_ensure_response(byline_article_read($id));
}
add_action('rest_api_init', static function (): void {
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/articles/(?P<id>\d+)', ['methods' => 'GET', 'callback' => 'byline_article_rest_get', 'permission_callback' => 'byline_article_permission']);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/articles/(?P<id>\d+)/(?P<action>draft|title|excerpt|terms|featured-media|schedule|unschedule|publish|unpublish|trash|restore)', ['methods' => 'POST', 'callback' => 'byline_article_rest_mutate', 'permission_callback' => 'byline_article_permission']);
});
