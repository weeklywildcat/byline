<?php

/**
 * Optional adapter for WordPress's native Abilities API.
 *
 * The Abilities API was introduced after Byline's minimum supported WordPress
 * version. This file therefore contains no unconditional calls to the API: on
 * older WordPress versions it defines the adapter but registers no hooks.
 * Abilities remain private/internal by default and call Byline domain helpers
 * directly rather than going through a REST callback.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_ABILITIES_CATEGORY = 'byline-editorial';

function byline_abilities_api_available(): bool
{
    return function_exists('add_action')
        && function_exists('wp_register_ability_category')
        && function_exists('wp_register_ability');
}

function byline_ability_text(string $text): string
{
    return function_exists('__') ? (string) __($text, 'weekly-wildcat-headless') : $text;
}

function byline_ability_error(string $code, string $message, int $status = 500)
{
    return new WP_Error($code, $message, ['status' => $status]);
}

/**
 * Convert unexpected domain failures into a stable error without exposing
 * exception messages, stack traces, or integration configuration.
 *
 * @param callable $operation
 * @return mixed|WP_Error
 */
function byline_ability_run(callable $operation)
{
    try {
        return $operation();
    } catch (Throwable $exception) {
        return byline_ability_error(
            'byline_ability_execution_failed',
            byline_ability_text('The Byline operation could not be completed.'),
            500
        );
    }
}

/**
 * @param callable $check
 * @return bool|WP_Error
 */
function byline_ability_permission(callable $check)
{
    try {
        return $check();
    } catch (Throwable $exception) {
        return byline_ability_error(
            'byline_ability_permission_failed',
            byline_ability_text('The Byline permission check could not be completed.'),
            500
        );
    }
}

function byline_ability_input($input): array
{
    return is_array($input) ? $input : [];
}

function byline_ability_post_id($input): int
{
    $input = byline_ability_input($input);

    $raw_id = $input['postId'] ?? ($input['storyId'] ?? 0);

    return function_exists('absint') ? absint($raw_id) : max(0, (int) $raw_id);
}

function byline_ability_current_user_id(): int
{
    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

function byline_ability_story_exists(int $post_id): bool
{
    if ($post_id <= 0 || !function_exists('get_post')) {
        return false;
    }

    $post = get_post($post_id);

    return is_object($post)
        && (!class_exists('WP_Post') || $post instanceof WP_Post)
        && (string) ($post->post_type ?? '') === 'post';
}

/**
 * Reuse the editorial domain's object-level permission boundary.
 *
 * @return true|WP_Error
 */
function byline_ability_story_access($input, string $operation = 'view')
{
    $post_id = byline_ability_post_id($input);
    if ($post_id <= 0) {
        return byline_ability_error(
            'byline_ability_invalid_story',
            byline_ability_text('A valid story is required.'),
            400
        );
    }

    if (!byline_ability_story_exists($post_id)) {
        return byline_ability_error(
            'byline_ability_story_not_found',
            byline_ability_text('This story does not exist.'),
            404
        );
    }

    $user_id = byline_ability_current_user_id();
    $actor = $user_id > 0 ? $user_id : null;
    if ($operation === 'move' && function_exists('byline_editorial_can_change_status')) {
        $allowed = byline_editorial_can_change_status($post_id, $actor);
    } elseif (function_exists('byline_editorial_can_view_planning_story')) {
        $allowed = byline_editorial_can_view_planning_story($post_id, $actor);
    } else {
        $allowed = function_exists('current_user_can') && current_user_can('edit_post', $post_id);
    }

    if (!$allowed) {
        return byline_ability_error(
            'byline_ability_forbidden',
            byline_ability_text('You are not allowed to use this story ability.'),
            403
        );
    }

    return true;
}

function byline_ability_can_get_my_stories($input)
{
    return byline_ability_permission(static function () {
        if (!function_exists('current_user_can') || !current_user_can('edit_posts')) {
            return byline_ability_error(
                'byline_ability_forbidden',
                byline_ability_text('You are not allowed to view newsroom stories.'),
                403
            );
        }

        return true;
    });
}

function byline_ability_can_get_story($input)
{
    return byline_ability_permission(static function () use ($input) {
        return byline_ability_story_access($input, 'view');
    });
}

function byline_ability_can_move_story($input)
{
    return byline_ability_permission(static function () use ($input) {
        $access = byline_ability_story_access($input, 'move');
        if ($access !== true) {
            return $access;
        }

        $input = byline_ability_input($input);
        if (array_key_exists('expectedRevision', $input)
            && (array_key_exists('editorId', $input) || array_key_exists('deadline', $input))) {
            return byline_ability_error(
                'byline_ability_invalid_input',
                byline_ability_text('Story movement accepts only a workflow status and revision.'),
                400
            );
        }

        return true;
    });
}

function byline_ability_can_create_task($input)
{
    return byline_ability_permission(static function () use ($input) {
        $access = byline_ability_story_access($input, 'view');
        if ($access !== true) {
            return $access;
        }

        $input = byline_ability_input($input);
        $assignee_id = absint($input['assigneeId'] ?? 0);
        if ($assignee_id > 0 && function_exists('byline_task_can_assign')) {
            $user_id = byline_ability_current_user_id();
            $actor = $user_id > 0 ? $user_id : null;
            if (!byline_task_can_assign(0, $assignee_id, $actor)) {
                return byline_ability_error(
                    'byline_ability_forbidden_assignment',
                    byline_ability_text('Only an editor can assign a task to another user.'),
                    403
                );
            }
        }

        return true;
    });
}

function byline_ability_can_check_readiness($input)
{
    return byline_ability_permission(static function () use ($input) {
        return byline_ability_story_access($input, 'view');
    });
}

/** @return array<string,mixed>|WP_Error */
function byline_ability_get_my_stories($input = [])
{
    return byline_ability_run(static function () use ($input) {
        if (!function_exists('byline_editorial_get_planning_collection')) {
            return byline_ability_error(
                'byline_ability_unavailable',
                byline_ability_text('Planning data is unavailable.'),
                500
            );
        }

        $input = byline_ability_input($input);
        $filters = [];
        foreach (['status', 'query', 'limit', 'offset', 'overdue', 'needsReview'] as $key) {
            if (array_key_exists($key, $input)) {
                $filters[$key] = $input[$key];
            }
        }
        // The ability is intentionally scoped to the current WordPress user;
        // callers cannot turn it into a newsroom-wide private data export.
        $filters['mine'] = true;
        $user_id = byline_ability_current_user_id();

        return byline_editorial_get_planning_collection($filters, $user_id > 0 ? $user_id : null);
    });
}

/** @return array<string,mixed>|WP_Error */
function byline_ability_get_story($input = [])
{
    return byline_ability_run(static function () use ($input) {
        $access = byline_ability_story_access($input, 'view');
        if ($access !== true) {
            return $access;
        }
        if (!function_exists('byline_get_editorial_story_state')) {
            return byline_ability_error(
                'byline_ability_unavailable',
                byline_ability_text('Story workflow data is unavailable.'),
                500
            );
        }

        return byline_get_editorial_story_state(byline_ability_post_id($input));
    });
}

/** @return array<string,mixed>|WP_Error */
function byline_ability_move_story($input = [])
{
    return byline_ability_run(static function () use ($input) {
        $access = byline_ability_can_move_story($input);
        if ($access !== true) {
            return $access;
        }

        $input = byline_ability_input($input);
        if (!array_key_exists('status', $input) || !array_key_exists('expectedRevision', $input)) {
            return byline_ability_error(
                'byline_ability_invalid_input',
                byline_ability_text('A workflow status and expected story revision are required.'),
                400
            );
        }
        if (!is_scalar($input['status'])
            || (!is_int($input['expectedRevision']) && !is_numeric($input['expectedRevision']))
            || (int) $input['expectedRevision'] < 0) {
            return byline_ability_error(
                'byline_ability_invalid_input',
                byline_ability_text('The workflow status or story revision is invalid.'),
                400
            );
        }
        if (!function_exists('byline_update_editorial_story_state')) {
            return byline_ability_error(
                'byline_ability_unavailable',
                byline_ability_text('Story workflow updates are unavailable.'),
                500
            );
        }

        return byline_update_editorial_story_state(
            byline_ability_post_id($input),
            [
                'status' => (string) $input['status'],
                'expectedRevision' => (int) $input['expectedRevision'],
            ],
            byline_ability_current_user_id() > 0 ? byline_ability_current_user_id() : null
        );
    });
}

/** @return array<string,mixed>|WP_Error */
function byline_ability_create_task($input = [])
{
    return byline_ability_run(static function () use ($input) {
        $access = byline_ability_can_create_task($input);
        if ($access !== true) {
            return $access;
        }
        if (!function_exists('byline_create_task')) {
            return byline_ability_error(
                'byline_ability_unavailable',
                byline_ability_text('Task creation is unavailable.'),
                500
            );
        }

        return byline_create_task(
            byline_ability_input($input),
            byline_ability_current_user_id() > 0 ? byline_ability_current_user_id() : null
        );
    });
}

/** @return array<string,mixed>|WP_Error */
function byline_ability_check_readiness($input = [])
{
    return byline_ability_run(static function () use ($input) {
        $access = byline_ability_can_check_readiness($input);
        if ($access !== true) {
            return $access;
        }
        if (!function_exists('byline_get_story_readiness')) {
            return byline_ability_error(
                'byline_ability_unavailable',
                byline_ability_text('Story readiness data is unavailable.'),
                500
            );
        }

        return byline_get_story_readiness(byline_ability_post_id($input));
    });
}

function byline_ability_story_id_input_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'postId' => [
                'type' => 'integer',
                'minimum' => 1,
                'description' => byline_ability_text('The WordPress story ID.'),
            ],
        ],
        'required' => ['postId'],
        'additionalProperties' => false,
    ];
}

function byline_ability_story_state_output_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'postId' => ['type' => 'integer'],
            'status' => ['type' => 'string'],
            'storedStatus' => ['type' => 'string'],
            'isPublished' => ['type' => 'boolean'],
            'postStatus' => ['type' => 'string'],
            'revision' => ['type' => 'integer'],
            'editorId' => ['type' => 'integer'],
            'deadline' => ['type' => 'string'],
            'visuals' => ['type' => 'string'],
        ],
        'required' => [
            'postId',
            'status',
            'storedStatus',
            'isPublished',
            'postStatus',
            'revision',
            'editorId',
            'deadline',
            'visuals',
        ],
        'additionalProperties' => false,
    ];
}

function byline_ability_planning_input_schema(): array
{
    $statuses = function_exists('byline_editorial_status_ids')
        ? byline_editorial_status_ids()
        : ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published'];

    return [
        'type' => 'object',
        'properties' => [
            'status' => ['type' => 'string', 'enum' => array_values($statuses)],
            'query' => ['type' => 'string', 'maxLength' => 120],
            'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50],
            'offset' => ['type' => 'integer', 'minimum' => 0],
            'overdue' => ['type' => 'boolean'],
            'needsReview' => ['type' => 'boolean'],
        ],
        'additionalProperties' => false,
    ];
}

function byline_ability_planning_output_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'items' => ['type' => 'array', 'items' => ['type' => 'object']],
            'count' => ['type' => 'integer'],
            'hasMore' => ['type' => 'boolean'],
            'filters' => ['type' => 'object'],
        ],
        'required' => ['items', 'count', 'hasMore', 'filters'],
        'additionalProperties' => false,
    ];
}

function byline_ability_move_input_schema(): array
{
    $statuses = function_exists('byline_editorial_selectable_status_ids')
        ? byline_editorial_selectable_status_ids()
        : ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped'];

    return [
        'type' => 'object',
        'properties' => [
            'postId' => ['type' => 'integer', 'minimum' => 1],
            'status' => ['type' => 'string', 'enum' => array_values($statuses)],
            'expectedRevision' => ['type' => 'integer', 'minimum' => 0],
        ],
        'required' => ['postId', 'status', 'expectedRevision'],
        'additionalProperties' => false,
    ];
}

function byline_ability_task_input_schema(): array
{
    $priorities = function_exists('byline_task_priorities')
        ? byline_task_priorities()
        : ['low', 'normal', 'high', 'urgent'];

    return [
        'type' => 'object',
        'properties' => [
            'storyId' => ['type' => 'integer', 'minimum' => 1],
            'title' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 240],
            'assigneeId' => ['type' => 'integer', 'minimum' => 0],
            'dueAt' => ['type' => 'string', 'maxLength' => 64],
            'priority' => ['type' => 'string', 'enum' => array_values($priorities)],
            'coverageId' => ['type' => 'integer', 'minimum' => 0],
        ],
        'required' => ['storyId', 'title'],
        'additionalProperties' => false,
    ];
}

function byline_ability_task_output_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'id' => ['type' => 'integer'],
            'title' => ['type' => 'string'],
            'state' => ['type' => 'string'],
            'status' => ['type' => 'string'],
            'assigneeId' => ['type' => 'integer'],
            'dueAt' => ['type' => 'string'],
            'priority' => ['type' => 'string'],
            'storyId' => ['type' => 'integer'],
            'coverageId' => ['type' => 'integer'],
            'creatorId' => ['type' => 'integer'],
            'completedAt' => ['type' => 'string'],
            'order' => ['type' => 'integer'],
            'createdAt' => ['type' => 'string'],
            'modifiedAt' => ['type' => 'string'],
        ],
        'required' => [
            'id',
            'title',
            'state',
            'status',
            'assigneeId',
            'dueAt',
            'priority',
            'storyId',
            'coverageId',
            'creatorId',
            'completedAt',
            'order',
            'createdAt',
            'modifiedAt',
        ],
        'additionalProperties' => false,
    ];
}

function byline_ability_readiness_output_schema(): array
{
    return [
        'type' => 'object',
        'properties' => [
            'storyId' => ['type' => 'integer'],
            'checks' => ['type' => 'array', 'items' => ['type' => 'object']],
            'passed' => ['type' => 'integer'],
            'warnings' => ['type' => 'integer'],
            'errors' => ['type' => 'integer'],
            'total' => ['type' => 'integer'],
            'ready' => ['type' => 'boolean'],
            'canPublish' => ['type' => 'boolean'],
        ],
        'required' => ['storyId', 'checks', 'passed', 'warnings', 'errors', 'total', 'ready', 'canPublish'],
        'additionalProperties' => false,
    ];
}

function byline_ability_metadata(array $annotations): array
{
    return [
        // Keep the new contract private. `show_in_rest` is explicit for the
        // first Abilities API releases; `public` is also understood by newer
        // WordPress/MCP integrations.
        'public' => false,
        'show_in_rest' => false,
        'annotations' => array_merge([
            'readonly' => false,
            'destructive' => false,
            'idempotent' => false,
        ], $annotations),
    ];
}

/** @return array<string,array<string,mixed>> */
function byline_ability_definitions(): array
{
    return [
        'byline/get-my-stories' => [
            'label' => byline_ability_text('Get My Stories'),
            'description' => byline_ability_text('List the current WordPress user\'s editable Byline stories using the private planning model.'),
            'category' => BYLINE_ABILITIES_CATEGORY,
            'input_schema' => byline_ability_planning_input_schema(),
            'output_schema' => byline_ability_planning_output_schema(),
            'execute_callback' => 'byline_ability_get_my_stories',
            'permission_callback' => 'byline_ability_can_get_my_stories',
            'meta' => byline_ability_metadata(['readonly' => true, 'idempotent' => true]),
        ],
        'byline/get-story' => [
            'label' => byline_ability_text('Get Story Workflow'),
            'description' => byline_ability_text('Read the private workflow state for a story the current user can edit.'),
            'category' => BYLINE_ABILITIES_CATEGORY,
            'input_schema' => byline_ability_story_id_input_schema(),
            'output_schema' => byline_ability_story_state_output_schema(),
            'execute_callback' => 'byline_ability_get_story',
            'permission_callback' => 'byline_ability_can_get_story',
            'meta' => byline_ability_metadata(['readonly' => true, 'idempotent' => true]),
        ],
        'byline/move-story' => [
            'label' => byline_ability_text('Move Story'),
            'description' => byline_ability_text('Move an editable story to a selectable Byline workflow stage using its expected editorial revision.'),
            'category' => BYLINE_ABILITIES_CATEGORY,
            'input_schema' => byline_ability_move_input_schema(),
            'output_schema' => byline_ability_story_state_output_schema(),
            'execute_callback' => 'byline_ability_move_story',
            'permission_callback' => 'byline_ability_can_move_story',
            'meta' => byline_ability_metadata(['idempotent' => true]),
        ],
        'byline/create-task' => [
            'label' => byline_ability_text('Create Story Task'),
            'description' => byline_ability_text('Create a private task linked to a story the current user can edit.'),
            'category' => BYLINE_ABILITIES_CATEGORY,
            'input_schema' => byline_ability_task_input_schema(),
            'output_schema' => byline_ability_task_output_schema(),
            'execute_callback' => 'byline_ability_create_task',
            'permission_callback' => 'byline_ability_can_create_task',
            'meta' => byline_ability_metadata([]),
        ],
        'byline/check-readiness' => [
            'label' => byline_ability_text('Check Story Readiness'),
            'description' => byline_ability_text('Run Byline\'s existing readiness checks for a story the current user can edit.'),
            'category' => BYLINE_ABILITIES_CATEGORY,
            'input_schema' => byline_ability_story_id_input_schema(),
            'output_schema' => byline_ability_readiness_output_schema(),
            'execute_callback' => 'byline_ability_check_readiness',
            'permission_callback' => 'byline_ability_can_check_readiness',
            'meta' => byline_ability_metadata(['readonly' => true, 'idempotent' => true]),
        ],
    ];
}

function byline_register_ability_categories(): void
{
    if (!function_exists('wp_register_ability_category')) {
        return;
    }

    wp_register_ability_category(BYLINE_ABILITIES_CATEGORY, [
        'label' => byline_ability_text('Byline Editorial'),
        'description' => byline_ability_text('Private newsroom abilities for Byline editorial workflow.'),
        'meta' => ['public' => false],
    ]);
}

function byline_register_abilities(): void
{
    if (!byline_abilities_api_available()) {
        return;
    }

    foreach (byline_ability_definitions() as $name => $definition) {
        wp_register_ability($name, $definition);
    }
}

function byline_register_abilities_hooks(): void
{
    static $registered = false;
    if ($registered || !byline_abilities_api_available()) {
        return;
    }

    add_action('wp_abilities_api_categories_init', 'byline_register_ability_categories');
    add_action('wp_abilities_api_init', 'byline_register_abilities');
    $registered = true;
}
