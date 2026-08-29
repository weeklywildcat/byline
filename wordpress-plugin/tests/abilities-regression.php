<?php

/**
 * Focused coverage for the optional WordPress Abilities adapter.
 *
 * The supported-path stubs below capture registration metadata and domain calls
 * without requiring a WordPress database. The legacy probe runs in a separate
 * PHP process because PHP cannot undefine the supported API stubs once loaded.
 */

define('ABSPATH', __DIR__ . '/../');

$byline_abilities_test_actions = [];
$byline_abilities_test_categories = [];
$byline_abilities_test_registrations = [];
$byline_abilities_test_capabilities = [
    'edit_posts' => true,
    'edit_others_posts' => false,
];
$byline_abilities_test_editable_posts = [42 => true];
$byline_abilities_test_user_id = 7;
$byline_abilities_test_posts = [];
$byline_abilities_test_calls = [];
$byline_abilities_test_domain_error = null;
$byline_abilities_test_throw = false;

class WP_Error
{
    private string $error_code;
    private string $error_message;
    private array $error_data;

    public function __construct(string $code = '', string $message = '', array $data = [])
    {
        $this->error_code = $code;
        $this->error_message = $message;
        $this->error_data = $data;
    }

    public function get_error_code(): string
    {
        return $this->error_code;
    }

    public function get_error_message(): string
    {
        return $this->error_message;
    }

    public function get_error_data()
    {
        return $this->error_data;
    }
}

class WP_Post
{
    public int $ID = 0;
    public string $post_type = 'post';
}

function abilities_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function __(string $text, string $domain = ''): string
{
    return $text;
}

function absint($value): int
{
    return abs((int) $value);
}

function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void
{
    global $byline_abilities_test_actions;
    $byline_abilities_test_actions[$hook][] = $callback;
}

function wp_register_ability_category(string $slug, array $args)
{
    global $byline_abilities_test_categories;
    $byline_abilities_test_categories[$slug] = $args;
    return true;
}

function wp_register_ability(string $name, array $args)
{
    global $byline_abilities_test_registrations;
    $byline_abilities_test_registrations[$name] = $args;
    return true;
}

function get_current_user_id(): int
{
    global $byline_abilities_test_user_id;
    return $byline_abilities_test_user_id;
}

function current_user_can(string $capability, ...$args): bool
{
    global $byline_abilities_test_capabilities, $byline_abilities_test_editable_posts;
    if ($capability === 'edit_post') {
        return !empty($byline_abilities_test_editable_posts[(int) ($args[0] ?? 0)]);
    }

    return !empty($byline_abilities_test_capabilities[$capability]);
}

function get_post(int $post_id)
{
    global $byline_abilities_test_posts;
    return $byline_abilities_test_posts[$post_id] ?? null;
}

function byline_editorial_can_view_planning_story(int $post_id, ?int $user_id = null): bool
{
    return current_user_can('edit_post', $post_id);
}

function byline_editorial_can_change_status(int $post_id, ?int $user_id = null): bool
{
    return current_user_can('edit_post', $post_id);
}

function byline_editorial_status_ids(): array
{
    return ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published'];
}

function byline_editorial_selectable_status_ids(): array
{
    return ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped'];
}

function byline_task_priorities(): array
{
    return ['low', 'normal', 'high', 'urgent'];
}

function byline_task_can_assign(int $task_id, int $assignee_id, ?int $user_id = null): bool
{
    global $byline_abilities_test_capabilities, $byline_abilities_test_user_id;
    return $assignee_id <= 0
        || $assignee_id === $byline_abilities_test_user_id
        || !empty($byline_abilities_test_capabilities['edit_others_posts']);
}

function byline_editorial_get_planning_collection(array $filters = [], ?int $user_id = null): array
{
    global $byline_abilities_test_calls, $byline_abilities_test_domain_error, $byline_abilities_test_throw;
    if ($byline_abilities_test_throw) {
        throw new RuntimeException('secret implementation detail');
    }
    if ($byline_abilities_test_domain_error instanceof WP_Error) {
        return $byline_abilities_test_domain_error;
    }
    $byline_abilities_test_calls[] = ['list', $filters, $user_id];

    return [
        'items' => [],
        'count' => 0,
        'hasMore' => false,
        'filters' => $filters,
    ];
}

function byline_get_editorial_story_state(int $post_id): array
{
    global $byline_abilities_test_calls, $byline_abilities_test_domain_error, $byline_abilities_test_throw;
    if ($byline_abilities_test_throw) {
        throw new RuntimeException('secret implementation detail');
    }
    if ($byline_abilities_test_domain_error instanceof WP_Error) {
        return $byline_abilities_test_domain_error;
    }
    $byline_abilities_test_calls[] = ['get', $post_id];

    return [
        'postId' => $post_id,
        'status' => 'writing',
        'storedStatus' => 'writing',
        'isPublished' => false,
        'postStatus' => 'draft',
        'revision' => 4,
        'editorId' => 7,
        'deadline' => '',
        'visuals' => '',
    ];
}

function byline_update_editorial_story_state(int $post_id, array $changes, ?int $user_id = null)
{
    global $byline_abilities_test_calls, $byline_abilities_test_domain_error, $byline_abilities_test_throw;
    if ($byline_abilities_test_throw) {
        throw new RuntimeException('secret implementation detail');
    }
    if ($byline_abilities_test_domain_error instanceof WP_Error) {
        return $byline_abilities_test_domain_error;
    }
    $byline_abilities_test_calls[] = ['move', $post_id, $changes, $user_id];

    return [
        'postId' => $post_id,
        'status' => (string) ($changes['status'] ?? 'writing'),
        'storedStatus' => (string) ($changes['status'] ?? 'writing'),
        'isPublished' => false,
        'postStatus' => 'draft',
        'revision' => ((int) ($changes['expectedRevision'] ?? 0)) + 1,
        'editorId' => 7,
        'deadline' => '',
        'visuals' => '',
    ];
}

function byline_create_task(array $input, ?int $user_id = null)
{
    global $byline_abilities_test_calls, $byline_abilities_test_domain_error, $byline_abilities_test_throw;
    if ($byline_abilities_test_throw) {
        throw new RuntimeException('secret implementation detail');
    }
    if ($byline_abilities_test_domain_error instanceof WP_Error) {
        return $byline_abilities_test_domain_error;
    }
    $byline_abilities_test_calls[] = ['task', $input, $user_id];

    return [
        'id' => 91,
        'title' => (string) ($input['title'] ?? ''),
        'state' => 'open',
        'status' => 'open',
        'assigneeId' => (int) ($input['assigneeId'] ?? 0),
        'dueAt' => (string) ($input['dueAt'] ?? ''),
        'priority' => (string) ($input['priority'] ?? 'normal'),
        'storyId' => (int) ($input['storyId'] ?? 0),
        'coverageId' => (int) ($input['coverageId'] ?? 0),
        'creatorId' => $user_id ?? 0,
        'completedAt' => '',
        'order' => 1,
        'createdAt' => '2026-08-29 00:00:00',
        'modifiedAt' => '2026-08-29 00:00:00',
    ];
}

function byline_get_story_readiness(int $post_id, array $context = []): array
{
    global $byline_abilities_test_calls, $byline_abilities_test_domain_error, $byline_abilities_test_throw;
    if ($byline_abilities_test_throw) {
        throw new RuntimeException('secret implementation detail');
    }
    if ($byline_abilities_test_domain_error instanceof WP_Error) {
        return $byline_abilities_test_domain_error;
    }
    $byline_abilities_test_calls[] = ['readiness', $post_id];

    return [
        'storyId' => $post_id,
        'checks' => [],
        'passed' => 1,
        'warnings' => 0,
        'errors' => 0,
        'total' => 1,
        'ready' => true,
        'canPublish' => true,
    ];
}

$story = new WP_Post();
$story->ID = 42;
$byline_abilities_test_posts[42] = $story;

require __DIR__ . '/../includes/integrations/abilities.php';

abilities_assert(byline_abilities_api_available(), 'The supported Abilities API was not detected.');
byline_register_abilities_hooks();
abilities_assert(isset($byline_abilities_test_actions['wp_abilities_api_categories_init']), 'The category hook was not registered.');
abilities_assert(isset($byline_abilities_test_actions['wp_abilities_api_init']), 'The ability hook was not registered.');

call_user_func($byline_abilities_test_actions['wp_abilities_api_categories_init'][0]);
call_user_func($byline_abilities_test_actions['wp_abilities_api_init'][0]);

abilities_assert(isset($byline_abilities_test_categories[BYLINE_ABILITIES_CATEGORY]), 'The Byline ability category was not registered.');
$expected_names = [
    'byline/get-my-stories',
    'byline/get-story',
    'byline/move-story',
    'byline/create-task',
    'byline/check-readiness',
];
abilities_assert(array_keys($byline_abilities_test_registrations) === $expected_names, 'The expected small internal ability set was not registered.');

foreach ($byline_abilities_test_registrations as $name => $definition) {
    abilities_assert(is_string($definition['execute_callback'] ?? null) && function_exists($definition['execute_callback']), "{$name} has no executable callback.");
    abilities_assert(is_string($definition['permission_callback'] ?? null) && function_exists($definition['permission_callback']), "{$name} has no permission callback.");
    abilities_assert(($definition['category'] ?? '') === BYLINE_ABILITIES_CATEGORY, "{$name} uses the wrong category.");
    abilities_assert(is_array($definition['input_schema'] ?? null) && ($definition['input_schema']['type'] ?? '') === 'object', "{$name} is missing a typed input schema.");
    abilities_assert(is_array($definition['output_schema'] ?? null) && ($definition['output_schema']['type'] ?? '') === 'object', "{$name} is missing a typed output schema.");
    abilities_assert(($definition['meta']['public'] ?? null) === false, "{$name} was made public.");
    abilities_assert(($definition['meta']['show_in_rest'] ?? null) === false, "{$name} was exposed through REST.");
    foreach (['readonly', 'destructive', 'idempotent'] as $annotation) {
        abilities_assert(array_key_exists($annotation, $definition['meta']['annotations'] ?? []), "{$name} is missing its {$annotation} annotation.");
    }
    abilities_assert(($definition['input_schema']['additionalProperties'] ?? null) === false, "{$name} accepts undeclared input properties.");
}

$move_definition = $byline_abilities_test_registrations['byline/move-story'];
abilities_assert(($move_definition['input_schema']['required'] ?? []) === ['postId', 'status', 'expectedRevision'], 'Move-story does not require an optimistic revision.');
abilities_assert(!in_array('published', $move_definition['input_schema']['properties']['status']['enum'] ?? [], true), 'Move-story exposed the derived published status as selectable.');
$task_definition = $byline_abilities_test_registrations['byline/create-task'];
abilities_assert(($task_definition['input_schema']['required'] ?? []) === ['storyId', 'title'], 'Create-task does not require a linked story and title.');
abilities_assert(($task_definition['output_schema']['properties']['id']['type'] ?? '') === 'integer', 'Create-task output is not typed.');
$readiness_definition = $byline_abilities_test_registrations['byline/check-readiness'];
abilities_assert(($readiness_definition['output_schema']['properties']['ready']['type'] ?? '') === 'boolean', 'Readiness output does not type its ready flag.');

$get_story_permission = $byline_abilities_test_registrations['byline/get-story']['permission_callback'];
abilities_assert(call_user_func($get_story_permission, ['postId' => 42]) === true, 'An editor could not read an editable story.');
$byline_abilities_test_editable_posts[42] = false;
$denied = call_user_func($get_story_permission, ['postId' => 42]);
abilities_assert($denied instanceof WP_Error && $denied->get_error_code() === 'byline_ability_forbidden', 'Story permission did not reject an uneditable story safely.');
$byline_abilities_test_editable_posts[42] = true;

$create_task_permission = $byline_abilities_test_registrations['byline/create-task']['permission_callback'];
$byline_abilities_test_capabilities['edit_others_posts'] = false;
$assignment_denied = call_user_func($create_task_permission, ['storyId' => 42, 'title' => 'Task', 'assigneeId' => 9]);
abilities_assert($assignment_denied instanceof WP_Error && $assignment_denied->get_error_code() === 'byline_ability_forbidden_assignment', 'Task assignment permission was not enforced.');
$byline_abilities_test_capabilities['edit_others_posts'] = true;
abilities_assert(call_user_func($create_task_permission, ['storyId' => 42, 'title' => 'Task', 'assigneeId' => 9]) === true, 'An editor could not assign a task.');

$get_my_stories = $byline_abilities_test_registrations['byline/get-my-stories']['execute_callback'];
$planning = call_user_func($get_my_stories, ['limit' => 10]);
abilities_assert(is_array($planning) && !empty($planning['filters']['mine']), 'Get-my-stories did not force current-user scoping.');
abilities_assert(($byline_abilities_test_calls[0][0] ?? '') === 'list', 'Get-my-stories did not call the planning domain operation.');

$get_story = $byline_abilities_test_registrations['byline/get-story']['execute_callback'];
$story_state = call_user_func($get_story, ['postId' => 42]);
abilities_assert(is_array($story_state) && ($story_state['postId'] ?? 0) === 42, 'Get-story did not return the workflow domain state.');

$move_story = $byline_abilities_test_registrations['byline/move-story']['execute_callback'];
$moved = call_user_func($move_story, ['postId' => 42, 'status' => 'ready', 'expectedRevision' => 4]);
abilities_assert(is_array($moved) && ($moved['status'] ?? '') === 'ready', 'Move-story did not return the domain result.');
$move_call = end($byline_abilities_test_calls);
abilities_assert(($move_call[0] ?? '') === 'move' && ($move_call[2]['expectedRevision'] ?? null) === 4, 'Move-story did not pass the expected revision to the domain.');

$create_task = $byline_abilities_test_registrations['byline/create-task']['execute_callback'];
$task = call_user_func($create_task, ['storyId' => 42, 'title' => 'Review copy', 'priority' => 'high']);
abilities_assert(is_array($task) && ($task['storyId'] ?? 0) === 42, 'Create-task did not return the task domain result.');
$task_call = end($byline_abilities_test_calls);
abilities_assert(($task_call[0] ?? '') === 'task' && ($task_call[1]['title'] ?? '') === 'Review copy', 'Create-task did not call the task domain operation directly.');

$check_readiness = $byline_abilities_test_registrations['byline/check-readiness']['execute_callback'];
$readiness = call_user_func($check_readiness, ['postId' => 42]);
abilities_assert(is_array($readiness) && !empty($readiness['ready']), 'Check-readiness did not return the readiness domain result.');

$byline_abilities_test_domain_error = new WP_Error('byline_domain_failure', 'A safe domain failure.');
$domain_result = call_user_func($move_story, ['postId' => 42, 'status' => 'ready', 'expectedRevision' => 4]);
abilities_assert($domain_result === $byline_abilities_test_domain_error, 'Domain WP_Error was not returned unchanged.');
$byline_abilities_test_domain_error = null;
$byline_abilities_test_throw = true;
$unexpected_result = call_user_func($check_readiness, ['postId' => 42]);
abilities_assert($unexpected_result instanceof WP_Error && $unexpected_result->get_error_code() === 'byline_ability_execution_failed', 'Unexpected domain failures were not converted to a safe error.');
abilities_assert(strpos($unexpected_result->get_error_message(), 'secret') === false, 'Unexpected error details leaked through the ability result.');
$byline_abilities_test_throw = false;

$registration_source = file_get_contents(__DIR__ . '/../includes/integrations/registration.php');
abilities_assert(is_string($registration_source) && strpos($registration_source, "__DIR__ . '/abilities.php'") !== false, 'The optional registration seam does not load the abilities include.');
abilities_assert(strpos($registration_source, 'byline_register_abilities_hooks') !== false, 'The optional registration seam does not invoke the abilities hook registrar.');

$ability_file = realpath(__DIR__ . '/../includes/integrations/abilities.php');
$probe = 'define("ABSPATH", __DIR__); require ' . var_export($ability_file, true) . '; byline_register_abilities_hooks(); echo byline_abilities_api_available() ? "unexpected" : "ok";';
$probe_output = [];
$probe_status = 0;
exec(escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg($probe), $probe_output, $probe_status);
abilities_assert($probe_status === 0 && implode('', $probe_output) === 'ok', 'The Abilities include did not gracefully fall back without WordPress 6.9 APIs.');

// The adapter must remain separate from the existing transport and navigation
// layers so REST/Command Palette behavior cannot be replaced accidentally.
$ability_source = file_get_contents(__DIR__ . '/../includes/integrations/abilities.php');
abilities_assert(is_string($ability_source) && strpos($ability_source, 'byline_editorial_rest_') === false, 'An ability callback was implemented through a REST callback.');
abilities_assert(strpos((string) $ability_source, 'byline_command_palette') === false, 'The Abilities adapter changed Command Palette semantics.');

echo "Byline abilities regression passed.\n";
