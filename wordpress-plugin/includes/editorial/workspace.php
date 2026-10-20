<?php
/**
 * Story Workspace: one protected read model and the reporting/production routes.
 *
 * `GET /editorial/stories/<id>/workspace` returns everything the full workspace
 * and Home's Story Peek need in one request, built from bounded aggregates over
 * the existing domains (workflow, contributors, tasks, media, resources,
 * activity) plus the reporting plan. It never contains the article body. Each
 * optional section is isolated: a failure in one reports under `errors` and
 * leaves the rest of the payload intact.
 *
 * Viewing is granted by `byline_story_context()`; changing canonical story
 * fields still requires the stronger capability each field has always needed.
 */
if (!defined('ABSPATH')) {
    exit;
}

/** @return list<array{id:int,name:string}> */
function byline_workspace_people(array $ids): array
{
    $people = [];
    foreach (array_values(array_unique(array_map('absint', $ids))) as $id) {
        $person = function_exists('byline_editorial_rest_user_person') ? byline_editorial_rest_user_person($id) : null;
        if ($person !== null) {
            $people[] = ['id' => $person['id'], 'name' => $person['name']];
        }
    }
    return $people;
}

/**
 * The reporting plan as one viewer may see it. A participant who holds only
 * assigned work sees only the records assigned to them.
 *
 * @return array{sources:list<array<string,mixed>>,appointments:list<array<string,mixed>>,summary:array<string,mixed>}
 */
function byline_workspace_reporting(int $story_id, array $access): array
{
    $mine = static function (array $record) use ($access): bool {
        return $access['manage'] || in_array($access['user'], $record['assigneeIds'], true);
    };
    $sources = array_values(array_filter(byline_story_sources($story_id), $mine));
    $labels = array_column($sources, 'label', 'id');
    $appointments = array_values(array_filter(byline_story_appointment_sort(byline_story_appointments($story_id)), $mine));
    return [
        'sources' => array_map(static function (array $source): array {
            return $source + ['assignees' => byline_workspace_people($source['assigneeIds'])];
        }, $sources),
        'appointments' => array_map(static function (array $appointment) use ($labels): array {
            return $appointment + ['assignees' => byline_workspace_people($appointment['assigneeIds']), 'sourceLabel' => $appointment['sourceId'] !== null ? ($labels[$appointment['sourceId']] ?? null) : null];
        }, $appointments),
        'summary' => $access['manage'] ? byline_story_reporting_summary($story_id) : [
            'sources' => count($sources), 'interviewed' => 0, 'needsScheduling' => 0, 'toSchedule' => 0, 'nextAppointment' => null,
        ],
    ];
}

/** Story tasks, read without the editor-level task gate. Context was already checked. */
function byline_workspace_tasks(int $story_id, array $access): array
{
    $posts = get_posts([
        'post_type' => BYLINE_TASK_POST_TYPE, 'post_status' => 'private', 'post_parent' => $story_id,
        'posts_per_page' => 100, 'orderby' => 'menu_order date', 'order' => 'ASC', 'no_found_rows' => true,
    ]);
    $tasks = [];
    foreach ($posts as $post) {
        $task = byline_get_task((int) $post->ID);
        if ($task !== [] && ($access['manage'] || $task['assigneeId'] === $access['user'])) {
            $tasks[] = byline_editorial_rest_task_item($task);
        }
    }
    return $tasks;
}

function byline_workspace_media(int $story_id, array $access): array
{
    return array_values(array_filter(
        array_map(static function (array $assignment): array {
            return $assignment + ['assignee' => byline_editorial_rest_user_person($assignment['assigneeId'])];
        }, byline_get_story_media_assignments($story_id)),
        static function (array $assignment) use ($access): bool { return $access['manage'] || $assignment['assigneeId'] === $access['user']; }
    ));
}

function byline_workspace_activity(int $story_id): array
{
    $items = [];
    foreach (byline_activity_raw_records($story_id) as $record) {
        $items[] = byline_activity_safe_projection($record);
        if (count($items) === 10) {
            break;
        }
    }
    return array_values(array_filter($items));
}

/** @return array<string,bool|string> */
function byline_workspace_capabilities(array $access): array
{
    return [
        'role' => $access['manage'] ? 'manager' : 'participant',
        'editArticle' => $access['edit'],
        'changeStatus' => $access['edit'],
        'assign' => $access['editOthers'],
        'editContributors' => $access['edit'],
        'editBrief' => $access['manage'],
        'manageReporting' => $access['manage'],
        'addSource' => $access['manage'],
        'addAppointment' => true,
        'manageMedia' => $access['manage'],
        'assignMedia' => $access['editOthers'],
        'addTask' => $access['edit'],
        'manageResources' => $access['manage'],
        'review' => $access['editOthers'],
    ];
}

function byline_workspace_payload(int $story_id, array $access): array
{
    $errors = [];
    $read = static function (string $section, callable $fetch, $fallback) use (&$errors) {
        try {
            return $fetch();
        } catch (Throwable $error) {
            // Never expose exception messages or partial private projections.
            $errors[$section] = 'This part of the story could not be loaded. Try again.';
            return $fallback;
        }
    };
    $user_id = $access['user'];
    $story = byline_editorial_planning_story_summary($story_id, $user_id, null, true);
    $state = byline_get_editorial_story_state($story_id);
    $reporting = $read('reporting', static function () use ($story_id, $access): array { return byline_workspace_reporting($story_id, $access); }, ['sources' => [], 'appointments' => [], 'summary' => null]);
    $contributors = $read('contributors', static function () use ($story_id): array {
        $payload = byline_editorial_rest_story_contributors_payload($story_id);
        foreach (['contributors', 'available'] as $field) {
            $payload[$field] = array_map(static function ($person): array {
                return array_merge($person, ['kind' => $person['kind'] ?? $person['type'] ?? 'user']);
            }, $payload[$field]);
        }
        return $payload;
    }, ['storyId' => $story_id, 'contributors' => [], 'available' => [], 'canEdit' => false, 'canCreateGuests' => false]);

    $people = $access['manage']
        ? byline_editorial_rest_task_people()
        : array_values(array_filter([byline_editorial_rest_user_person($user_id)]));

    $story_row = byline_editorial_rest_planning_story($story);
    // A participant sees roll-ups of only the records they hold.
    $story_row['reporting'] = $reporting['summary'];
    if (!$access['manage']) {
        $story_row['mediaSummary'] = null;
        $story_row['visual'] = ['type' => 'none', 'status' => 'needed', 'label' => 'Needed', 'notes' => '', 'legacyNotes' => '', 'attachmentIds' => []];
    }
    return [
        'story' => $story_row,
        'revision' => absint($state['revision'] ?? 0),
        'timezone' => byline_editorial_planning_timezone()->getName(),
        'now' => byline_story_now(),
        'currentUser' => byline_editorial_rest_user_person($user_id),
        'brief' => $read('brief', static function () use ($story_id): string { return byline_get_story_brief($story_id); }, ''),
        'sections' => array_map(static function ($term): string { return $term->name; }, wp_get_post_categories($story_id, ['fields' => 'all'])),
        'contributors' => $contributors,
        'statuses' => byline_editorial_rest_statuses(),
        'tasks' => $read('tasks', static function () use ($story_id, $access): array { return byline_workspace_tasks($story_id, $access); }, []),
        'sources' => $reporting['sources'],
        'appointments' => $reporting['appointments'],
        'reporting' => $reporting['summary'],
        'mediaAssignments' => $read('media', static function () use ($story_id, $access): array { return byline_workspace_media($story_id, $access); }, []),
        'resources' => $read('resources', static function () use ($story_id): array { return byline_get_story_resources($story_id); }, []),
        // The audit trail names other people's work; participants who hold only an
        // assignment do not receive it.
        'activity' => $access['manage'] ? $read('activity', static function () use ($story_id): array { return byline_workspace_activity($story_id); }, []) : [],
        'previewUrl' => $access['edit'] ? esc_url_raw((string) get_preview_post_link($story_id)) : '',
        'people' => $people,
        'capabilities' => byline_workspace_capabilities($access),
        'errors' => (object) $errors,
    ];
}

function byline_editorial_rest_workspace(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    return rest_ensure_response(byline_workspace_payload($story_id, byline_story_context($story_id)));
}

/* -------------------------------------------------- mutation routes */

function byline_workspace_reporting_response(int $story_id, array $extra = []): WP_REST_Response
{
    return rest_ensure_response($extra + byline_workspace_reporting($story_id, byline_story_context($story_id)));
}

function byline_editorial_rest_save_brief(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    if (!byline_story_context($story_id)['manage']) {
        return new WP_Error('byline_brief_forbidden', 'You cannot edit this story\'s brief.', ['status' => rest_authorization_required_code()]);
    }
    $body = byline_editorial_rest_body($request);
    $expected = isset($body['expectedBrief']) && is_string($body['expectedBrief']) ? $body['expectedBrief'] : null;
    $saved = byline_set_story_brief($story_id, $body['brief'] ?? null, $expected);
    return is_wp_error($saved) ? $saved : rest_ensure_response(['brief' => $saved]);
}

function byline_editorial_rest_save_source(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $existing = (string) $request->get_param('source');
    $result = byline_story_source_save($story_id, byline_editorial_rest_body($request), $existing);
    if (is_wp_error($result)) {
        return $result;
    }
    $response = byline_workspace_reporting_response($story_id, ['sourceId' => $result['source']['id']]);
    if ($existing === '') {
        $response->set_status(201);
    }
    return $response;
}

function byline_editorial_rest_delete_source(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $result = byline_story_source_delete($story_id, (string) $request->get_param('source'));
    return is_wp_error($result) ? $result : byline_workspace_reporting_response($story_id);
}

function byline_editorial_rest_save_appointment(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $existing = (string) $request->get_param('appointment');
    $result = byline_story_appointment_save($story_id, byline_editorial_rest_body($request), $existing);
    if (is_wp_error($result)) {
        return $result;
    }
    $response = byline_workspace_reporting_response($story_id, ['appointmentId' => $result['appointment']['id']]);
    if ($existing === '') {
        $response->set_status(201);
    }
    return $response;
}

function byline_editorial_rest_delete_appointment(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $result = byline_story_appointment_delete($story_id, (string) $request->get_param('appointment'));
    return is_wp_error($result) ? $result : byline_workspace_reporting_response($story_id);
}

function byline_editorial_rest_media_assignments_response(int $story_id, array $extra = []): WP_REST_Response
{
    return rest_ensure_response($extra + ['mediaAssignments' => byline_workspace_media($story_id, byline_story_context($story_id))]);
}

function byline_editorial_rest_save_media_assignment(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $existing = (string) $request->get_param('assignment');
    $result = byline_media_assignment_save($story_id, byline_editorial_rest_body($request), $existing);
    if (is_wp_error($result)) {
        return $result;
    }
    $response = byline_editorial_rest_media_assignments_response($story_id, ['assignmentId' => $result['assignment']['id']]);
    if ($existing === '') {
        $response->set_status(201);
    }
    return $response;
}

function byline_editorial_rest_delete_media_assignment(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $result = byline_media_assignment_delete($story_id, (string) $request->get_param('assignment'));
    return is_wp_error($result) ? $result : byline_editorial_rest_media_assignments_response($story_id);
}

/* ------------------------------------------------------ schedule feed */

/**
 * Lightweight, note-free events for the Planning Calendar and Home. Exact
 * appointments carry a time; target windows and unscheduled appointments are
 * returned separately so no view invents a date for them.
 *
 * @return array<string,list<array<string,mixed>>>
 */
function byline_workspace_schedule(string $from, string $to, bool $include_tasks, ?int $user_id = null): array
{
    $user_id = $user_id ?? get_current_user_id();
    $out = ['appointments' => [], 'needsScheduling' => [], 'mediaDeadlines' => [], 'taskDeadlines' => []];
    $stories = get_posts([
        'post_type' => 'post', 'post_status' => ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => 200, 'orderby' => 'modified', 'order' => 'DESC', 'no_found_rows' => true,
        'meta_query' => ['relation' => 'OR',
            ['key' => BYLINE_STORY_APPOINTMENTS_META, 'compare' => 'EXISTS'],
            ['key' => BYLINE_MEDIA_ASSIGNMENTS_META, 'compare' => 'EXISTS'],
            ['key' => BYLINE_EDITORIAL_MEDIA_REQUEST_META, 'compare' => 'EXISTS'],
        ],
    ]);
    foreach ($stories as $post) {
        $access = byline_story_context((int) $post->ID, $user_id);
        if (!$access['view']) {
            continue;
        }
        $title = (string) get_the_title((int) $post->ID);
        $labels = array_column(byline_story_sources((int) $post->ID), 'label', 'id');
        foreach (byline_story_appointments((int) $post->ID) as $appointment) {
            if ($appointment['status'] === 'cancelled' || (!$access['manage'] && !in_array($access['user'], $appointment['assigneeIds'], true))) {
                continue;
            }
            $item = array_diff_key($appointment, ['notes' => 1, 'createdAt' => 1, 'updatedAt' => 1]) + [
                'storyId' => (int) $post->ID, 'storyTitle' => $title,
                'assignees' => byline_workspace_people($appointment['assigneeIds']),
                'sourceLabel' => $appointment['sourceId'] !== null ? ($labels[$appointment['sourceId']] ?? null) : null,
            ];
            if ($appointment['scheduleMode'] === 'exact') {
                $day = byline_story_site_day((string) $appointment['startAt']);
                $end_day = $appointment['endAt'] ? byline_story_site_day((string) $appointment['endAt']) : $day;
                if ($day <= $to && max($day, $end_day) >= $from) {
                    $out['appointments'][] = $item;
                }
            } elseif (byline_appointment_is_open($appointment)) {
                $out['needsScheduling'][] = $item;
            }
        }
        foreach (byline_media_assignments_stored((int) $post->ID) as $assignment) {
            if ($assignment['status'] === 'done' || $assignment['dueAt'] === '' || (!$access['manage'] && $assignment['assigneeId'] !== $access['user'])) {
                continue;
            }
            $day = byline_story_site_day($assignment['dueAt']);
            if ($day >= $from && $day <= $to) {
                $out['mediaDeadlines'][] = ['id' => $assignment['id'], 'storyId' => (int) $post->ID, 'storyTitle' => $title, 'title' => $assignment['title'],
                    'type' => $assignment['type'], 'status' => $assignment['status'], 'dueAt' => $assignment['dueAt'], 'assignee' => byline_editorial_rest_user_person($assignment['assigneeId'])];
            }
        }
    }
    if ($include_tasks) {
        foreach (byline_list_tasks(['state' => 'open', 'limit' => 200], $user_id) as $task) {
            $day = $task['dueAt'] !== '' ? byline_story_site_day($task['dueAt']) : '';
            if ($day !== '' && $day >= $from && $day <= $to) {
                $out['taskDeadlines'][] = ['id' => $task['id'], 'storyId' => $task['storyId'] ?: null, 'storyTitle' => $task['storyId'] ? (string) get_the_title($task['storyId']) : '', 'title' => $task['title'], 'dueAt' => $task['dueAt'], 'assignee' => byline_editorial_rest_user_person($task['assigneeId'])];
            }
        }
    }
    foreach (['appointments' => 'startAt', 'mediaDeadlines' => 'dueAt', 'taskDeadlines' => 'dueAt'] as $key => $field) {
        usort($out[$key], static function (array $a, array $b) use ($field): int { return [$a[$field], (string) $a['id']] <=> [$b[$field], (string) $b['id']]; });
    }
    usort($out['needsScheduling'], static function (array $a, array $b): int {
        return [$a['windowStart'] ?? '9999', $a['id']] <=> [$b['windowStart'] ?? '9999', $b['id']];
    });
    return $out;
}

function byline_editorial_rest_schedule(WP_REST_Request $request)
{
    $today = byline_story_site_today();
    $from = byline_story_date((string) $request->get_param('from')) ?: gmdate('Y-m-d', strtotime($today . ' -7 days'));
    $to = byline_story_date((string) $request->get_param('to')) ?: gmdate('Y-m-d', strtotime($today . ' +60 days'));
    if ($to < $from || strtotime($to) - strtotime($from) > 124 * 86400) {
        return new WP_Error('byline_schedule_range', 'Choose a date range of up to four months.', ['status' => 400]);
    }
    $include_tasks = in_array((string) $request->get_param('includeTasks'), ['1', 'true'], true);
    return rest_ensure_response(['timezone' => byline_editorial_planning_timezone()->getName(), 'from' => $from, 'to' => $to]
        + byline_workspace_schedule($from, $to, $include_tasks));
}

add_action('rest_api_init', static function (): void {
    $story = '/editorial/stories/(?P<id>\d+)';
    $permission = 'byline_story_context_rest_permission';
    register_rest_route(BYLINE_REST_NAMESPACE, $story . '/workspace', [
        'methods' => WP_REST_Server::READABLE, 'callback' => 'byline_editorial_rest_workspace', 'permission_callback' => $permission,
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, $story . '/brief', [
        'methods' => WP_REST_Server::EDITABLE, 'callback' => 'byline_editorial_rest_save_brief', 'permission_callback' => $permission,
    ]);
    foreach ([
        'sources' => ['source', 'byline_editorial_rest_save_source', 'byline_editorial_rest_delete_source'],
        'appointments' => ['appointment', 'byline_editorial_rest_save_appointment', 'byline_editorial_rest_delete_appointment'],
        'media-assignments' => ['assignment', 'byline_editorial_rest_save_media_assignment', 'byline_editorial_rest_delete_media_assignment'],
    ] as $path => [$param, $save, $delete]) {
        register_rest_route(BYLINE_REST_NAMESPACE, $story . '/' . $path, [
            'methods' => WP_REST_Server::CREATABLE, 'callback' => $save, 'permission_callback' => $permission,
        ]);
        register_rest_route(BYLINE_REST_NAMESPACE, $story . '/' . $path . '/(?P<' . $param . '>[a-z0-9-]+)', [
            ['methods' => WP_REST_Server::EDITABLE, 'callback' => $save, 'permission_callback' => $permission],
            ['methods' => WP_REST_Server::DELETABLE, 'callback' => $delete, 'permission_callback' => $permission],
        ]);
    }
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/schedule', [
        'methods' => WP_REST_Server::READABLE, 'callback' => 'byline_editorial_rest_schedule',
        'permission_callback' => static function (): bool { return current_user_can('edit_posts'); },
    ]);
});
