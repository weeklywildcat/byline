<?php
/**
 * Who may see and who may change the private newsroom context around a story.
 *
 * WordPress `edit_post` is too narrow for real newsroom participation: a
 * co-writer who is not the post author, a photographer holding a media
 * assignment, or a reporter holding an interview all need to see the story's
 * context. Viewing context never grants write access to canonical story fields;
 * each mutation helper keeps its own, stronger rule.
 */
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Describe one user's relationship to a story. Pure reads; no side effects.
 *
 * @return array{
 *   exists:bool, user:int, view:bool, edit:bool, editOthers:bool, contributor:bool,
 *   editor:bool, taskAssignee:bool, mediaAssignee:bool, reportingAssignee:bool,
 *   manage:bool, assignedOnly:bool
 * }
 */
function byline_story_context(int $story_id, ?int $user_id = null): array
{
    $none = ['exists' => false, 'user' => 0, 'view' => false, 'edit' => false, 'editOthers' => false, 'contributor' => false,
        'editor' => false, 'taskAssignee' => false, 'mediaAssignee' => false, 'reportingAssignee' => false,
        'manage' => false, 'assignedOnly' => false];
    $post = get_post(absint($story_id));
    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return $none;
    }
    $user_id = $user_id !== null ? absint($user_id) : (function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0);
    $none['exists'] = true;
    $none['user'] = $user_id;
    if ($user_id <= 0 || !user_can($user_id, 'edit_posts')) {
        return $none;
    }

    $context = $none;
    $context['edit'] = (bool) user_can($user_id, 'edit_post', $post->ID);
    $context['editOthers'] = (bool) user_can($user_id, 'edit_others_posts');
    $context['editor'] = function_exists('byline_get_editorial_editor_id') && byline_get_editorial_editor_id($post->ID) === $user_id;
    if (function_exists('byline_get_story_contributor_entries')) {
        foreach (byline_get_story_contributor_entries($post->ID, true) as $reference) {
            if (($reference['type'] ?? 'user') === 'user' && absint($reference['id'] ?? 0) === $user_id) {
                $context['contributor'] = true;
                break;
            }
        }
    }
    // Assignments only matter when nothing stronger already grants viewing.
    $strong = $context['edit'] || $context['contributor'] || $context['editor'];
    if (!$strong) {
        $context['taskAssignee'] = byline_story_context_has_task($post->ID, $user_id);
        $context['mediaAssignee'] = function_exists('byline_media_assignments_involve_user') && byline_media_assignments_involve_user($post->ID, $user_id);
        $context['reportingAssignee'] = function_exists('byline_story_reporting_involves_user') && byline_story_reporting_involves_user($post->ID, $user_id);
    }
    $context['manage'] = $strong;
    $context['assignedOnly'] = !$strong && ($context['taskAssignee'] || $context['mediaAssignee'] || $context['reportingAssignee']);
    $context['view'] = $context['manage'] || $context['assignedOnly'];

    return $context;
}

function byline_story_context_has_task(int $story_id, int $user_id): bool
{
    if (!defined('BYLINE_TASK_POST_TYPE')) {
        return false;
    }
    foreach ([['post_parent' => $story_id], ['meta_key' => '_byline_task_story_id', 'meta_value' => (string) $story_id]] as $scope) {
        $found = get_posts(array_merge([
            'post_type' => BYLINE_TASK_POST_TYPE, 'post_status' => 'private', 'posts_per_page' => 1, 'fields' => 'ids',
            'no_found_rows' => true, 'suppress_filters' => true,
            'meta_query' => [['key' => BYLINE_TASK_ASSIGNEE_META, 'value' => (string) $user_id, 'compare' => '=']],
        ], $scope));
        if ($found) {
            return true;
        }
    }
    return false;
}

/** May this user see the story's private workspace context? */
function byline_story_context_can_view(int $story_id, ?int $user_id = null): bool
{
    return byline_story_context($story_id, $user_id)['view'];
}

/** REST permission callback for read-only story context routes. */
function byline_story_context_rest_permission(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $context = byline_story_context($story_id);
    if (!$context['exists']) {
        return new WP_Error('byline_editorial_unknown_story', 'This story does not exist.', ['status' => 404]);
    }
    if (!$context['view']) {
        return new WP_Error('byline_story_context_forbidden', 'You are not part of this story.', ['status' => rest_authorization_required_code()]);
    }
    return true;
}

/** A user who can be given reporting/production work. */
function byline_story_assignable_user(int $user_id): bool
{
    return $user_id > 0 && get_user_by('id', $user_id) instanceof WP_User && user_can($user_id, 'edit_posts');
}

/**
 * Validate a list of assignees against the actor's authority. Story managers may
 * assign any staff member; participants who only hold assigned work may assign
 * only themselves (and keep whoever is already assigned).
 *
 * @param list<int> $requested
 * @param list<int> $existing
 * @return list<int>|WP_Error
 */
function byline_story_validate_assignees(array $requested, array $existing, array $access, int $maximum)
{
    $requested = array_slice(array_values(array_unique(array_map('absint', $requested))), 0, $maximum);
    foreach ($requested as $id) {
        if (!byline_story_assignable_user($id)) {
            return new WP_Error('byline_unknown_assignee', 'One of the selected people cannot be assigned work.', ['status' => 400]);
        }
        if (!$access['manage'] && $id !== $access['user'] && !in_array($id, $existing, true)) {
            return new WP_Error('byline_assignment_forbidden', 'You can assign this work only to yourself.', ['status' => 403]);
        }
    }
    return $requested;
}
