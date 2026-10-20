<?php

/**
 * One protected aggregate for Story Quick View.
 *
 * Planning collections stay small. This response is requested only after an
 * editor opens a story and reuses the existing editorial bootstrap/domain
 * helpers instead of making the modal walk six unrelated endpoints.
 */

if (!defined('ABSPATH')) {
    exit;
}

function byline_editorial_rest_story_quick_view(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $user_id = function_exists('byline_editorial_rest_current_user_id')
        ? byline_editorial_rest_current_user_id()
        : 0;
    $payload = byline_editorial_rest_bootstrap_payload($story_id);

    $payload['tasks'] = function_exists('byline_get_story_tasks') && function_exists('byline_editorial_rest_task_payload')
        ? byline_editorial_rest_task_payload(byline_get_story_tasks($story_id, $user_id), $story_id)
        : ['storyId' => $story_id, 'tasks' => [], 'people' => [], 'capabilities' => []];
    $payload['media'] = function_exists('byline_get_editorial_media_request')
        ? byline_get_editorial_media_request($story_id, $user_id)
        : [];
    $payload['corrections'] = function_exists('byline_editorial_rest_story_correction_payload')
        ? byline_editorial_rest_story_correction_payload($story_id)
        : [];
    $payload['activity'] = function_exists('byline_get_story_activity')
        ? ['storyId' => $story_id, 'activity' => byline_get_story_activity($story_id, ['limit' => 8])]
        : ['storyId' => $story_id, 'activity' => []];

    return rest_ensure_response($payload);
}

function byline_editorial_register_quick_view_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/quick-view', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_editorial_rest_story_quick_view',
        'permission_callback' => 'byline_editorial_rest_permission',
        'args' => [
            'id' => [
                'type' => 'integer',
                'required' => true,
                'sanitize_callback' => 'absint',
            ],
        ],
    ]);
}
add_action('rest_api_init', 'byline_editorial_register_quick_view_route');
