<?php
/** Bounded, authorized projections of canonical newsroom records for Home. */
if (!defined('ABSPATH')) {
    exit;
}

function byline_home_is_mine(array $story, int $user_id): bool
{
    return byline_editorial_story_involves_user($story, $user_id);
}

/** Candidate prefilter only; object permissions and contributor identity follow. */
function byline_home_personal_where(string $where, $query): string
{
    $user_id = absint($query->get('byline_home_user'));
    if (!$user_id) {
        return $where;
    }
    global $wpdb;
    return $where . $wpdb->prepare(
        " AND ({$wpdb->posts}.post_author = %d OR EXISTS (SELECT 1 FROM {$wpdb->postmeta} hm WHERE hm.post_id = {$wpdb->posts}.ID AND ((hm.meta_key = %s AND hm.meta_value = %s) OR (hm.meta_key = %s AND hm.meta_value LIKE %s) OR (hm.meta_key IN (%s, %s) AND hm.meta_value LIKE %s) OR (hm.meta_key IN (%s, %s) AND hm.meta_value LIKE %s))))",
        $user_id, BYLINE_EDITORIAL_EDITOR_META, (string) $user_id,
        BYLINE_STORY_CONTRIBUTORS_META, '%' . $wpdb->esc_like('i:' . $user_id . ';') . '%',
        BYLINE_EDITORIAL_MEDIA_REQUEST_META, BYLINE_MEDIA_ASSIGNMENTS_META, '%' . $wpdb->esc_like('"assigneeId";i:' . $user_id . ';') . '%',
        BYLINE_STORY_SOURCES_META, BYLINE_STORY_APPOINTMENTS_META, '%' . $wpdb->esc_like('i:' . $user_id . ';') . '%'
    );
}
add_action('init', static function (): void {
    add_filter('posts_where', 'byline_home_personal_where', 10, 2);
});

function byline_home_posts(array $args = []): array
{
    return get_posts(array_merge([
        'post_type' => 'post', 'post_status' => ['draft', 'pending', 'future', 'private'],
        'posts_per_page' => 120, 'orderby' => 'modified', 'order' => 'DESC',
        'suppress_filters' => false, 'no_found_rows' => true,
    ], $args));
}

function byline_home_story_rows(int $user_id, bool $editor): array
{
    $posts = byline_home_posts(['byline_home_user' => $user_id]);
    if ($editor) {
        // Include older deadlines/review work even when a busy newsroom has
        // more recently modified drafts than the bounded personal collection.
        $posts = array_merge($posts,
            byline_home_posts(['meta_key' => BYLINE_EDITORIAL_DEADLINE_META, 'meta_value' => '', 'meta_compare' => '!=', 'orderby' => 'meta_value', 'order' => 'ASC', 'posts_per_page' => 80]),
            byline_home_posts(['meta_key' => BYLINE_EDITORIAL_PLANNED_PUBLISH_META, 'meta_value' => '', 'meta_compare' => '!=', 'orderby' => 'meta_value', 'order' => 'ASC', 'posts_per_page' => 40]),
            byline_home_posts(['post_status' => 'future', 'orderby' => 'date', 'order' => 'ASC', 'posts_per_page' => 40]),
            byline_home_posts(['meta_key' => BYLINE_EDITORIAL_STATUS_META, 'meta_value' => 'ready', 'posts_per_page' => 40]),
            byline_home_posts(['meta_key' => BYLINE_EDITORIAL_MEDIA_REQUEST_META, 'posts_per_page' => 80]),
            byline_home_posts(['meta_key' => BYLINE_MEDIA_ASSIGNMENTS_META, 'posts_per_page' => 80]),
            byline_home_posts(['meta_key' => BYLINE_STORY_APPOINTMENTS_META, 'posts_per_page' => 80])
        );
    }
    $visible = [];
    foreach ($posts as $post) {
        if (byline_story_context_can_view((int) $post->ID, $user_id)
            && byline_get_editorial_story_state((int) $post->ID)['status'] !== 'dropped') {
            $visible[(int) $post->ID] = $post;
        }
    }
    $counts = byline_task_counts_for_stories(array_keys($visible), $user_id);
    if (function_exists('byline_notes_prime_thread_counts')) {
        byline_notes_prime_thread_counts(array_keys($visible), $user_id);
    }
    $rows = [];
    foreach ($visible as $id => $post) {
        $row = byline_editorial_planning_story_summary($id, $user_id, $counts, true);
        if ($row !== [] && ($editor || byline_home_is_mine($row, $user_id)
            || in_array($user_id, (array) ($row['media']['assigneeIds'] ?? []), true) || byline_story_reporting_involves_user($id, $user_id))) {
            $rows[] = $row;
        }
    }
    return $rows;
}

function byline_home_permission(): bool
{
    return current_user_can('edit_posts');
}

function byline_home_activity(int $user_id): array
{
    $items = [];
    // The existing activity store and projection enforce object visibility.
    // This also gives writers their permitted story activity without granting
    // access to the editorial-only newsroom activity endpoint.
    foreach (byline_activity_raw_records() as $record) {
        $projected = byline_project_activity($record, $user_id);
        if ($projected !== []) {
            $items[] = $projected;
        }
        if (count($items) === 10) {
            break;
        }
    }
    return $items;
}

function byline_editorial_rest_home(WP_REST_Request $request)
{
    if (!byline_home_permission()) {
        return new WP_Error('byline_home_forbidden', 'You are not allowed to view newsroom work.', ['status' => rest_authorization_required_code()]);
    }
    $user_id = get_current_user_id();
    $editor = current_user_can('edit_others_posts');
    $errors = [];
    $read = static function (string $section, callable $fetch) use (&$errors): array {
        try {
            return $fetch();
        } catch (Throwable $error) {
            // Never expose exception messages or partial private projections.
            $errors[$section] = 'This newsroom service could not be loaded. Try again.';
            return [];
        }
    };
    $rows = $read('stories', static function () use ($user_id, $editor): array { return byline_home_story_rows($user_id, $editor); });
    $tasks = $read('tasks', static function () use ($user_id): array {
        return array_map('byline_editorial_rest_task_item', byline_list_tasks(['assigneeId' => $user_id, 'state' => 'open', 'limit' => 200], $user_id));
    });
    // Tasks can refer to a visible story that is outside the active story set.
    $known = array_column($rows, 'id');
    foreach ($tasks as $task) {
        $id = (int) ($task['storyId'] ?? 0);
        if ($id > 0 && !in_array($id, $known, true)) {
            $row = byline_editorial_planning_story_summary($id, $user_id, [], true);
            if ($row !== []) {
                $rows[] = $row;
                $known[] = $id;
            }
        }
    }
    $media = $read('visualWork', static function () use ($rows, $user_id, $editor): array {
        $items = [];
        foreach ($rows as $row) {
            foreach (byline_media_assignments_stored((int) $row['id']) as $assignment) {
                if ($assignment['status'] === 'done' || (!$editor && $assignment['assigneeId'] !== $user_id)) {
                    continue;
                }
                $items[] = [
                    'id' => $assignment['id'], 'story' => ['id' => $row['id'], 'title' => $row['title'], 'editUrl' => $row['editUrl']],
                    'title' => $assignment['title'], 'type' => $assignment['type'], 'status' => $assignment['status'],
                    'assignee' => byline_editorial_rest_user_person($assignment['assigneeId']),
                    'dueAt' => $assignment['dueAt'] ?: null, 'notes' => $assignment['notes'], 'attachmentIds' => $assignment['attachmentIds'],
                ];
            }
        }
        return array_slice($items, 0, 100);
    });
    $appointments = $read('appointments', static function () use ($rows, $user_id): array { return byline_home_appointments($rows, $user_id); });
    return rest_ensure_response([
        'currentUser' => byline_editorial_rest_user_person($user_id),
        'people' => $editor ? byline_editorial_rest_task_people() : [array_merge(byline_editorial_rest_user_person($user_id), ['kind' => 'user'])],
        'timezone' => byline_editorial_planning_timezone()->getName(),
        'now' => gmdate('Y-m-d\TH:i:s\Z'),
        'capabilities' => ['review' => $editor, 'createStory' => current_user_can(get_post_type_object('post')->cap->create_posts), 'uploadMedia' => current_user_can('upload_files')],
        'stories' => array_map('byline_editorial_rest_planning_story', $rows),
        'tasks' => $tasks, 'visualWork' => $media, 'appointments' => $appointments,
        'activity' => $read('activity', static function () use ($user_id): array { return byline_home_activity($user_id); }),
        'errors' => (object) $errors,
        'limits' => ['stories' => 600, 'tasks' => 200, 'visualWork' => 100, 'appointments' => 100, 'activity' => 10],
    ]);
}

/**
 * The current user's open appointments on the visible story set. Exact times
 * come with their instant; target windows and unscheduled appointments are sent
 * as they are, never converted to a date, so Home decides what is relevant.
 *
 * @return list<array<string,mixed>>
 */
function byline_home_appointments(array $rows, int $user_id): array
{
    $items = [];
    foreach ($rows as $row) {
        $labels = array_column(byline_story_sources((int) $row['id']), 'label', 'id');
        foreach (byline_story_appointments((int) $row['id']) as $appointment) {
            if (!byline_appointment_is_open($appointment) || !in_array($user_id, $appointment['assigneeIds'], true)) {
                continue;
            }
            $items[] = array_diff_key($appointment, ['notes' => 1, 'createdAt' => 1, 'updatedAt' => 1, 'assigneeIds' => 1]) + [
                'storyId' => (int) $row['id'], 'storyTitle' => $row['title'],
                'sourceLabel' => $appointment['sourceId'] !== null ? ($labels[$appointment['sourceId']] ?? null) : null,
            ];
        }
    }
    return array_slice($items, 0, 100);
}

function byline_story_workspace_url(int $story_id): string
{
    return add_query_arg(['page' => 'byline-planning', 'story' => $story_id], admin_url('admin.php'));
}

function byline_home_create_permission(): bool
{
    return current_user_can(get_post_type_object('post')->cap->create_posts);
}

function byline_editorial_rest_create_story(WP_REST_Request $request)
{
    if (!byline_home_create_permission()) {
        return new WP_Error('byline_story_create_forbidden', 'You cannot create stories.', ['status' => rest_authorization_required_code()]);
    }
    $body = byline_editorial_rest_body($request);
    $title = byline_task_text($body['title'] ?? '', 240);
    if ($title === '' || array_diff(array_keys($body), ['title', 'preset']) !== []) {
        return new WP_Error('byline_story_title_required', 'Enter a story title.', ['status' => 400]);
    }
    $preset = isset($body['preset']) && is_string($body['preset']) && $body['preset'] !== '' ? byline_editorial_normalize_preset_type($body['preset']) : '';
    if (isset($body['preset']) && $body['preset'] !== '' && $preset === '') {
        return new WP_Error('byline_unknown_preset', 'That story template does not exist.', ['status' => 400]);
    }
    $id = wp_insert_post(wp_slash(['post_type' => 'post', 'post_status' => 'draft', 'post_author' => get_current_user_id(), 'post_title' => $title]), true);
    if (is_wp_error($id)) {
        return new WP_Error('byline_story_create_failed', 'The draft could not be created. Try again.', ['status' => 500]);
    }
    // The draft exists either way. A template that cannot fully apply must not
    // lose the reporter's idea, so its outcome is reported rather than fatal.
    $applied = $preset !== '' ? byline_story_apply_preset((int) $id, $preset) : ['tasks' => 0, 'mediaAssignments' => 0, 'errors' => []];
    $payload = byline_workspace_payload((int) $id, byline_story_context((int) $id));
    $payload['workspaceUrl'] = byline_story_workspace_url((int) $id);
    $payload['template'] = $applied;
    $response = rest_ensure_response($payload);
    $response->set_status(201);
    return $response;
}

function byline_editorial_rest_home_search(WP_REST_Request $request)
{
    $query = byline_task_text($request->get_param('query') ?? '', 100);
    if (strlen($query) < 2) {
        return rest_ensure_response(['stories' => []]);
    }
    $stories = [];
    foreach (byline_home_posts(['s' => $query, 'search_columns' => ['post_title'], 'posts_per_page' => 60]) as $post) {
        if (!byline_editorial_can_view_planning_story((int) $post->ID) || byline_get_editorial_status((int) $post->ID) === 'dropped') {
            continue;
        }
        $stories[] = ['id' => (int) $post->ID, 'title' => sanitize_text_field($post->post_title)];
        if (count($stories) === 20) {
            break;
        }
    }
    return rest_ensure_response(['stories' => $stories]);
}

add_action('rest_api_init', static function (): void {
    foreach (['/editorial/home' => 'byline_editorial_rest_home', '/editorial/home/search' => 'byline_editorial_rest_home_search'] as $path => $callback) {
        register_rest_route(BYLINE_REST_NAMESPACE, $path, [
            'methods' => WP_REST_Server::READABLE, 'callback' => $callback, 'permission_callback' => 'byline_home_permission',
        ]);
    }
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories', [
        'methods' => WP_REST_Server::CREATABLE, 'callback' => 'byline_editorial_rest_create_story', 'permission_callback' => 'byline_home_create_permission',
    ]);
});
