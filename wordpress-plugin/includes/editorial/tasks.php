<?php

/**
 * Lightweight private newsroom tasks.
 *
 * Tasks are WordPress posts so they participate in the normal backup, revision
 * and deletion lifecycle without creating a second editorial datastore.  The
 * post type is hidden from public queries and all reads/writes go through the
 * capability helpers below.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_TASK_POST_TYPE = 'byline_task';
const BYLINE_TASK_STATE_META = '_byline_task_state';
const BYLINE_TASK_ASSIGNEE_META = '_byline_task_assignee_id';
const BYLINE_TASK_DUE_AT_META = '_byline_task_due_at';
const BYLINE_TASK_PRIORITY_META = '_byline_task_priority';
const BYLINE_TASK_COVERAGE_META = '_byline_task_coverage_id';
const BYLINE_TASK_COMPLETED_AT_META = '_byline_task_completed_at';
const BYLINE_TASK_ORDER_META = '_byline_task_order';
const BYLINE_TASK_CREATOR_META = '_byline_task_creator_id';

function byline_task_states(): array
{
    return ['open', 'completed'];
}

function byline_task_priorities(): array
{
    return ['low', 'normal', 'high', 'urgent'];
}

function byline_task_text($value, int $maximum = 240): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = function_exists('sanitize_text_field')
        ? sanitize_text_field((string) $value)
        : trim(strip_tags((string) $value));

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_task_datetime($value): string
{
    if (function_exists('byline_editorial_normalize_datetime')) {
        return byline_editorial_normalize_datetime($value);
    }

    if (!is_scalar($value) || trim((string) $value) === '') {
        return '';
    }

    try {
        return (new DateTimeImmutable((string) $value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\\TH:i:s\\Z');
    } catch (Exception $exception) {
        return '';
    }
}

function byline_task_current_user_id(?int $user_id = null): int
{
    if ($user_id !== null) {
        return absint($user_id);
    }

    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

function byline_task_user_can(int $user_id, string $capability, ...$args): bool
{
    if ($user_id > 0 && function_exists('user_can')) {
        return (bool) user_can($user_id, $capability, ...$args);
    }

    return function_exists('current_user_can') && (bool) current_user_can($capability, ...$args);
}

function byline_task_post(int $task_id): ?WP_Post
{
    $post = get_post(absint($task_id));

    return $post instanceof WP_Post && $post->post_type === BYLINE_TASK_POST_TYPE ? $post : null;
}

function byline_task_story_id(int $task_id): int
{
    $task = byline_task_post($task_id);
    if (!$task instanceof WP_Post) {
        return 0;
    }

    $parent = absint($task->post_parent ?? 0);
    if ($parent > 0) {
        return $parent;
    }

    return absint(get_post_meta($task_id, '_byline_task_story_id', true));
}

function byline_task_coverage_id(int $task_id): int
{
    return absint(get_post_meta($task_id, BYLINE_TASK_COVERAGE_META, true));
}

function byline_task_can_view(int $task_id, ?int $user_id = null): bool
{
    $task = byline_task_post($task_id);
    if (!$task instanceof WP_Post) {
        return false;
    }

    $user_id = byline_task_current_user_id($user_id);
    $story_id = byline_task_story_id($task_id);

    // A linked task follows the linked story's object capability.  Unlinked
    // newsroom work is deliberately editor-level so it cannot become a side
    // channel for private assignments.
    if ($story_id > 0) {
        $story = function_exists('get_post') ? get_post($story_id) : null;
        if (!$story instanceof WP_Post || $story->post_type !== 'post') {
            return false;
        }
        return byline_task_user_can($user_id, 'edit_post', $story_id);
    }

    return byline_task_user_can($user_id, 'edit_others_posts');
}

function byline_task_can_assign(int $task_id, int $assignee_id, ?int $user_id = null): bool
{
    if ($assignee_id <= 0) {
        return true;
    }

    $user_id = byline_task_current_user_id($user_id);
    if ($user_id > 0 && $assignee_id === $user_id) {
        return true;
    }

    return byline_task_user_can($user_id, 'edit_others_posts');
}

function byline_task_next_order(int $story_id = 0, int $coverage_id = 0): int
{
    $highest = 0;
    $tasks = function_exists('get_posts') ? get_posts([
        'post_type' => BYLINE_TASK_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => 200,
        'no_found_rows' => true,
    ]) : [];

    foreach (is_array($tasks) ? $tasks : [] as $task) {
        if (!$task instanceof WP_Post) {
            continue;
        }
        if (byline_task_story_id((int) $task->ID) !== $story_id || byline_task_coverage_id((int) $task->ID) !== $coverage_id) {
            continue;
        }
        $highest = max($highest, absint(get_post_meta((int) $task->ID, BYLINE_TASK_ORDER_META, true)));
    }

    return $highest + 1;
}

/** @return array<string,mixed> */
function byline_get_task(int $task_id): array
{
    $task = byline_task_post($task_id);
    if (!$task instanceof WP_Post) {
        return [];
    }

    $state = sanitize_key((string) get_post_meta($task_id, BYLINE_TASK_STATE_META, true));
    if (!in_array($state, byline_task_states(), true)) {
        $state = 'open';
    }

    $priority = sanitize_key((string) get_post_meta($task_id, BYLINE_TASK_PRIORITY_META, true));
    if (!in_array($priority, byline_task_priorities(), true)) {
        $priority = 'normal';
    }

    return [
        'id' => (int) $task->ID,
        'title' => byline_task_text($task->post_title ?? '', 240),
        'state' => $state,
        'status' => $state,
        'assigneeId' => absint(get_post_meta($task_id, BYLINE_TASK_ASSIGNEE_META, true)),
        'dueAt' => byline_task_datetime(get_post_meta($task_id, BYLINE_TASK_DUE_AT_META, true)),
        'priority' => $priority,
        'storyId' => byline_task_story_id($task_id),
        'coverageId' => byline_task_coverage_id($task_id),
        'creatorId' => absint(get_post_meta($task_id, BYLINE_TASK_CREATOR_META, true)) ?: absint($task->post_author ?? 0),
        'completedAt' => byline_task_datetime(get_post_meta($task_id, BYLINE_TASK_COMPLETED_AT_META, true)),
        'order' => absint(get_post_meta($task_id, BYLINE_TASK_ORDER_META, true)),
        'createdAt' => (string) ($task->post_date_gmt ?? $task->post_date ?? ''),
        'modifiedAt' => (string) ($task->post_modified_gmt ?? $task->post_modified ?? ''),
    ];
}

function byline_task_validate_links(int $story_id, int $coverage_id): ?WP_Error
{
    if ($story_id > 0) {
        $story = get_post($story_id);
        if (!$story instanceof WP_Post || $story->post_type !== 'post') {
            return new WP_Error('byline_task_invalid_story', 'Choose an existing story for this task.', ['status' => 400]);
        }
    }

    if ($coverage_id > 0 && function_exists('byline_coverage_exists') && !byline_coverage_exists($coverage_id)) {
        return new WP_Error('byline_task_invalid_coverage', 'Choose an existing coverage for this task.', ['status' => 400]);
    }

    return null;
}

/** @return array<string,mixed>|WP_Error */
function byline_create_task(array $input, ?int $user_id = null)
{
    $user_id = byline_task_current_user_id($user_id);
    $story_id = absint($input['storyId'] ?? $input['postId'] ?? 0);
    $coverage_id = absint($input['coverageId'] ?? 0);
    $link_error = byline_task_validate_links($story_id, $coverage_id);
    if ($link_error instanceof WP_Error) {
        return $link_error;
    }

    $can_create = $story_id > 0
        ? byline_task_user_can($user_id, 'edit_post', $story_id)
        : byline_task_user_can($user_id, 'edit_others_posts');
    if (!$can_create) {
        return new WP_Error('byline_task_forbidden', 'You are not allowed to create this task.', ['status' => 403]);
    }

    $title = byline_task_text($input['title'] ?? '', 240);
    if ($title === '') {
        return new WP_Error('byline_task_invalid_title', 'A task needs a title.', ['status' => 400]);
    }

    $assignee_id = absint($input['assigneeId'] ?? $input['assignee'] ?? 0);
    if ($assignee_id > 0 && !get_user_by('id', $assignee_id)) {
        return new WP_Error('byline_task_unknown_assignee', 'That task assignee does not exist.', ['status' => 400]);
    }
    if (!byline_task_can_assign(0, $assignee_id, $user_id)) {
        return new WP_Error('byline_task_assignment_forbidden', 'Only an editor can assign work to another user.', ['status' => 403]);
    }

    $due_at = byline_task_datetime($input['dueAt'] ?? $input['dueDate'] ?? '');
    if (($input['dueAt'] ?? $input['dueDate'] ?? '') !== '' && $due_at === '') {
        return new WP_Error('byline_task_invalid_due_at', 'Use a valid task due date/time.', ['status' => 400]);
    }

    $priority = sanitize_key((string) ($input['priority'] ?? 'normal'));
    if (!in_array($priority, byline_task_priorities(), true)) {
        return new WP_Error('byline_task_invalid_priority', 'Choose a valid task priority.', ['status' => 400]);
    }

    if (!function_exists('wp_insert_post')) {
        return new WP_Error('byline_task_unavailable', 'Task storage is unavailable.', ['status' => 500]);
    }

    $task_id = wp_insert_post([
        'post_type' => BYLINE_TASK_POST_TYPE,
        'post_status' => 'private',
        'post_title' => $title,
        'post_parent' => $story_id,
        'post_author' => $user_id,
    ], true);
    if (is_wp_error($task_id)) {
        return $task_id;
    }
    $task_id = absint($task_id);
    if ($task_id <= 0) {
        return new WP_Error('byline_task_save_failed', 'The task could not be saved.', ['status' => 500]);
    }

    update_post_meta($task_id, BYLINE_TASK_STATE_META, 'open');
    update_post_meta($task_id, BYLINE_TASK_ASSIGNEE_META, $assignee_id);
    update_post_meta($task_id, BYLINE_TASK_DUE_AT_META, $due_at);
    update_post_meta($task_id, BYLINE_TASK_PRIORITY_META, $priority);
    update_post_meta($task_id, BYLINE_TASK_COVERAGE_META, $coverage_id);
    update_post_meta($task_id, BYLINE_TASK_CREATOR_META, $user_id);
    update_post_meta($task_id, BYLINE_TASK_ORDER_META, byline_task_next_order($story_id, $coverage_id));

    $task = byline_get_task($task_id);
    if (function_exists('do_action')) {
        do_action('byline_editorial_task_changed', $task_id, $task, 'created', $input);
    }

    return $task;
}

/** @return array<string,mixed>|WP_Error */
function byline_update_task(int $task_id, array $input, ?int $user_id = null)
{
    $task = byline_task_post($task_id);
    if (!$task instanceof WP_Post) {
        return new WP_Error('byline_task_not_found', 'That task does not exist.', ['status' => 404]);
    }
    $user_id = byline_task_current_user_id($user_id);
    if (!byline_task_can_view($task_id, $user_id)) {
        return new WP_Error('byline_task_forbidden', 'You are not allowed to edit this task.', ['status' => 403]);
    }

    if (array_key_exists('title', $input)) {
        $title = byline_task_text($input['title'], 240);
        if ($title === '') {
            return new WP_Error('byline_task_invalid_title', 'A task needs a title.', ['status' => 400]);
        }
        if (function_exists('wp_update_post')) {
            $updated = wp_update_post(['ID' => $task_id, 'post_title' => $title], true);
            if (is_wp_error($updated)) {
                return $updated;
            }
        }
    }

    if (array_key_exists('assigneeId', $input) || array_key_exists('assignee', $input)) {
        $assignee_id = absint($input['assigneeId'] ?? $input['assignee'] ?? 0);
        if ($assignee_id > 0 && !get_user_by('id', $assignee_id)) {
            return new WP_Error('byline_task_unknown_assignee', 'That task assignee does not exist.', ['status' => 400]);
        }
        if (!byline_task_can_assign($task_id, $assignee_id, $user_id)) {
            return new WP_Error('byline_task_assignment_forbidden', 'Only an editor can assign work to another user.', ['status' => 403]);
        }
        if ($assignee_id > 0) {
            update_post_meta($task_id, BYLINE_TASK_ASSIGNEE_META, $assignee_id);
        } else {
            delete_post_meta($task_id, BYLINE_TASK_ASSIGNEE_META);
        }
    }

    if (array_key_exists('dueAt', $input) || array_key_exists('dueDate', $input)) {
        $raw_due_at = $input['dueAt'] ?? $input['dueDate'];
        $due_at = byline_task_datetime($raw_due_at);
        if ($raw_due_at !== '' && $due_at === '') {
            return new WP_Error('byline_task_invalid_due_at', 'Use a valid task due date/time.', ['status' => 400]);
        }
        if ($due_at === '') {
            delete_post_meta($task_id, BYLINE_TASK_DUE_AT_META);
        } else {
            update_post_meta($task_id, BYLINE_TASK_DUE_AT_META, $due_at);
        }
    }

    if (array_key_exists('priority', $input)) {
        $priority = sanitize_key((string) $input['priority']);
        if (!in_array($priority, byline_task_priorities(), true)) {
            return new WP_Error('byline_task_invalid_priority', 'Choose a valid task priority.', ['status' => 400]);
        }
        update_post_meta($task_id, BYLINE_TASK_PRIORITY_META, $priority);
    }

    if (array_key_exists('order', $input)) {
        update_post_meta($task_id, BYLINE_TASK_ORDER_META, max(1, absint($input['order'])));
    }

    if (array_key_exists('state', $input) || array_key_exists('status', $input)) {
        $state = sanitize_key((string) ($input['state'] ?? $input['status']));
        if (!in_array($state, byline_task_states(), true)) {
            return new WP_Error('byline_task_invalid_state', 'Choose open or completed.', ['status' => 400]);
        }
        update_post_meta($task_id, BYLINE_TASK_STATE_META, $state);
        if ($state === 'completed') {
            update_post_meta($task_id, BYLINE_TASK_COMPLETED_AT_META, gmdate('Y-m-d\\TH:i:s\\Z'));
        } else {
            delete_post_meta($task_id, BYLINE_TASK_COMPLETED_AT_META);
        }
    }

    $task = byline_get_task($task_id);
    if (function_exists('do_action')) {
        $operation = (($task['state'] ?? '') === 'completed') ? 'completed' : 'changed';
        do_action('byline_editorial_task_changed', $task_id, $task, $operation, $input);
    }

    return $task;
}

function byline_complete_task(int $task_id, ?int $user_id = null)
{
    return byline_update_task($task_id, ['state' => 'completed'], $user_id);
}

function byline_reopen_task(int $task_id, ?int $user_id = null)
{
    return byline_update_task($task_id, ['state' => 'open'], $user_id);
}

function byline_delete_task(int $task_id, ?int $user_id = null)
{
    $task = byline_get_task($task_id);
    if ($task === []) {
        return new WP_Error('byline_task_not_found', 'That task does not exist.', ['status' => 404]);
    }
    if (!byline_task_can_view($task_id, $user_id)) {
        return new WP_Error('byline_task_forbidden', 'You are not allowed to delete this task.', ['status' => 403]);
    }

    $deleted = function_exists('wp_delete_post') && wp_delete_post($task_id, true);
    if ($deleted && function_exists('do_action')) {
        do_action('byline_editorial_task_changed', $task_id, $task, 'deleted');
    }

    return $deleted
        ? true
        : new WP_Error('byline_task_delete_failed', 'The task could not be deleted.', ['status' => 500]);
}

/** @return array<int,array<string,mixed>> */
function byline_list_tasks(array $filters = [], ?int $user_id = null): array
{
    $args = [
        'post_type' => BYLINE_TASK_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => min(200, max(1, absint($filters['limit'] ?? 100))),
        'orderby' => 'menu_order date',
        'order' => 'ASC',
        'no_found_rows' => true,
    ];
    if (!empty($filters['storyId'])) {
        $args['post_parent'] = absint($filters['storyId']);
    }
    $posts = function_exists('get_posts') ? get_posts($args) : [];
    $result = [];
    foreach (is_array($posts) ? $posts : [] as $post) {
        if (!$post instanceof WP_Post || !byline_task_can_view((int) $post->ID, $user_id)) {
            continue;
        }
        $task = byline_get_task((int) $post->ID);
        if ($task === []) {
            continue;
        }
        if (!empty($filters['coverageId']) && (int) $task['coverageId'] !== absint($filters['coverageId'])) {
            continue;
        }
        if (!empty($filters['assigneeId']) && (int) $task['assigneeId'] !== absint($filters['assigneeId'])) {
            continue;
        }
        if (!empty($filters['state']) && $task['state'] !== sanitize_key((string) $filters['state'])) {
            continue;
        }
        $result[] = $task;
    }

    return $result;
}

function byline_task_count_for_story(int $story_id, ?int $user_id = null): int
{
    $count = 0;
    foreach (byline_list_tasks(['storyId' => $story_id, 'limit' => 200], $user_id) as $task) {
        if (($task['state'] ?? 'open') === 'open') {
            $count++;
        }
    }

    return $count;
}

function byline_get_story_tasks(int $story_id, ?int $user_id = null): array
{
    return byline_list_tasks(['storyId' => $story_id], $user_id);
}

function byline_list_story_tasks(int $story_id, ?int $user_id = null): array
{
    return byline_get_story_tasks($story_id, $user_id);
}

function byline_task_register_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_TASK_POST_TYPE, [
        'labels' => ['name' => 'Newsroom Tasks', 'singular_name' => 'Newsroom Task'],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_menu' => false,
        'show_in_rest' => false,
        'rewrite' => false,
        'query_var' => false,
        'supports' => ['title', 'author', 'page-attributes'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'byline_task_register_post_type');

function byline_task_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }

    foreach ([
        BYLINE_TASK_STATE_META => ['type' => 'string', 'sanitize_callback' => static function ($value): string {
            $state = sanitize_key((string) $value);
            return in_array($state, byline_task_states(), true) ? $state : 'open';
        }],
        BYLINE_TASK_ASSIGNEE_META => ['type' => 'integer', 'sanitize_callback' => 'absint'],
        BYLINE_TASK_DUE_AT_META => ['type' => 'string', 'sanitize_callback' => 'byline_task_datetime'],
        BYLINE_TASK_PRIORITY_META => ['type' => 'string', 'sanitize_callback' => static function ($value): string {
            $priority = sanitize_key((string) $value);
            return in_array($priority, byline_task_priorities(), true) ? $priority : 'normal';
        }],
        BYLINE_TASK_COVERAGE_META => ['type' => 'integer', 'sanitize_callback' => 'absint'],
        BYLINE_TASK_COMPLETED_AT_META => ['type' => 'string', 'sanitize_callback' => 'byline_task_datetime'],
        BYLINE_TASK_ORDER_META => ['type' => 'integer', 'sanitize_callback' => 'absint'],
        BYLINE_TASK_CREATOR_META => ['type' => 'integer', 'sanitize_callback' => 'absint'],
    ] as $key => $definition) {
        register_post_meta(BYLINE_TASK_POST_TYPE, $key, [
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
add_action('init', 'byline_task_register_meta');
