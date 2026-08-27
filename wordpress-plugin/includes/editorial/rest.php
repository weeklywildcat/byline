<?php

/**
 * The editor-facing transport for the Byline editorial workflow.
 *
 * Workflow values are internal newsroom information: who is editing a story, when
 * it is due, and what pictures it still needs. They are deliberately not exposed
 * through post meta in the public REST schema. This dedicated namespace requires
 * `edit_post` on the story for every request, so an anonymous reader of the
 * public API can never see an assignment or a deadline.
 *
 * One GET returns everything the block-editor sidebar needs — state, labels, the
 * assignable editors, and the current user's capabilities — so the sidebar never
 * polls and never walks the user table itself.
 */

if (!defined('ABSPATH')) {
    exit;
}

function byline_editorial_rest_permission(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $post = $post_id ? get_post($post_id) : null;

    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }

    if (!current_user_can('edit_post', $post_id)) {
        return new WP_Error(
            'byline_editorial_forbidden',
            'You are not allowed to view this story\'s editorial workflow.',
            ['status' => rest_authorization_required_code()]
        );
    }

    return true;
}

/**
 * The status vocabulary, in newsroom order, with the derived publication state
 * marked so the client never offers it as a choice.
 */
function byline_editorial_rest_statuses(): array
{
    $statuses = [];

    foreach (byline_editorial_workflow_statuses() as $id => $definition) {
        $statuses[] = [
            'id' => $id,
            'label' => (string) $definition['label'],
            'group' => (string) $definition['group'],
            'selectable' => in_array($id, byline_editorial_selectable_status_ids(), true),
        ];
    }

    return $statuses;
}

function byline_editorial_rest_payload(int $post_id): array
{
    $state = byline_get_editorial_story_state($post_id);
    $can_assign = byline_editorial_can_assign($post_id);
    $post = get_post($post_id);
    $author = $post instanceof WP_Post ? get_user_by('id', (int) $post->post_author) : false;

    return [
        'story' => $state,
        'statuses' => byline_editorial_rest_statuses(),
        'capabilities' => [
            'changeStatus' => byline_editorial_can_change_status($post_id),
            'assign' => $can_assign,
        ],
        // The writer is the WordPress post author and stays that way. It is
        // reported for context only; the sidebar never writes it.
        'writer' => $author instanceof WP_User
            ? ['id' => (int) $author->ID, 'name' => (string) $author->display_name]
            : null,
        // Only an editor may assign, so only an editor receives the roster.
        'editors' => $can_assign ? byline_editorial_assignable_editors() : [],
        'discord' => ['threadId' => byline_editorial_rest_discord_thread($post_id)],
    ];
}

/**
 * The Discord thread is presented as read-only context. The workflow domain does
 * not depend on the integration, so the value is read straight from meta and the
 * absence of the integration simply reports "not linked".
 */
function byline_editorial_rest_discord_thread(int $post_id): string
{
    if (!defined('WWH_DISCORD_THREAD_META')) {
        return '';
    }

    $thread_id = get_post_meta($post_id, WWH_DISCORD_THREAD_META, true);

    return is_string($thread_id) ? $thread_id : '';
}

function byline_editorial_rest_get_story(WP_REST_Request $request)
{
    return rest_ensure_response(byline_editorial_rest_payload(absint($request->get_param('id'))));
}

function byline_editorial_rest_update_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $body = $request->get_json_params();
    $body = is_array($body) ? $body : [];
    $changes = [];

    // Only keys the request actually sent are applied, so a partial update never
    // clears a field the client did not know about.
    foreach (['status', 'editorId', 'deadline', 'visuals'] as $field) {
        if (array_key_exists($field, $body)) {
            $changes[$field] = $body[$field];
        }
    }

    if ($changes === []) {
        return new WP_Error('byline_editorial_empty_update', 'No editorial workflow changes were supplied.', ['status' => 400]);
    }

    $result = byline_update_editorial_story_state($post_id, $changes);

    if (is_wp_error($result)) {
        return $result;
    }

    return rest_ensure_response(byline_editorial_rest_payload($post_id));
}

function byline_editorial_register_rest_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_editorial_rest_get_story',
            'permission_callback' => 'byline_editorial_rest_permission',
            'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
        ],
        [
            'methods' => 'POST',
            'callback' => 'byline_editorial_rest_update_story',
            'permission_callback' => 'byline_editorial_rest_permission',
            'args' => ['id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint']],
        ],
    ]);
}
add_action('rest_api_init', 'byline_editorial_register_rest_routes');
