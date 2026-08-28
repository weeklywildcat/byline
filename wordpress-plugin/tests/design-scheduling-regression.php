<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_DESIGN_SCHEMA_VERSION = 1;
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';

$posts = [];
$post_meta = [];
$user_meta = [];
$scheduled_events = [];
$next_post_id = 100;
$deployments = 0;
$registered_types = [];
$routes = [];

class WP_Error
{
    public string $code;
    public string $message;
    public array $data;

    public function __construct(string $code, string $message, array $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string
    {
        return $this->code;
    }

    public function get_error_message(): string
    {
        return $this->message;
    }
}

class WP_Post
{
    public int $ID;
    public string $post_type = '';
    public string $post_status = 'private';
    public string $post_content = '';
    public string $post_title = '';
    public int $post_author = 0;
    public int $post_parent = 0;
    public string $post_modified_gmt = '2026-08-28 00:00:00';
}

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const EDITABLE = 'PUT';
    public const DELETABLE = 'DELETE';
    public const CREATABLE = 'POST';
}

class WP_REST_Response
{
    public $data;

    public function __construct($data)
    {
        $this->data = $data;
    }
}

class WP_REST_Request implements ArrayAccess
{
    public function offsetExists($offset): bool { return false; }
    public function offsetGet($offset) { return null; }
    public function offsetSet($offset, $value): void {}
    public function offsetUnset($offset): void {}
    public function get_json_params(): array { return []; }
}

function add_action(...$args): void {}
function register_post_type(string $type, array $args): void { global $registered_types; $registered_types[$type] = $args; }
function register_rest_route(...$args): void { global $routes; $routes[$args[1]] = $args[2]; }
function __($message, string $domain = ''): string { return (string) $message; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function rest_ensure_response($value): WP_REST_Response { return new WP_REST_Response($value); }
function wp_json_encode($value) { return json_encode($value); }
function wp_slash($value) { return $value; }
function get_current_user_id(): int { return 7; }
function current_user_can(string $capability): bool { return true; }
function user_can(int $user_id, string $capability): bool { return true; }
function byline_get_publication_config(): array { return ['appearance' => ['theme' => 'weekly-wildcat'], 'features' => []]; }
function byline_protocol_manifest(): array { return []; }
function byline_publication_response(): array { return []; }
function wwh_schedule_cloudflare_deploy(): void { global $deployments; $deployments++; }
function mysql_to_rfc3339(string $value): string { return '2026-08-28T00:00:00+00:00'; }
function get_post(int $post_id) { global $posts; return $posts[$post_id] ?? null; }
function get_post_meta(int $post_id, string $key, bool $single = false) { global $post_meta; return $post_meta[$post_id][$key] ?? ''; }
function update_post_meta(int $post_id, string $key, $value): void { global $post_meta; $post_meta[$post_id][$key] = $value; }
function add_post_meta(int $post_id, string $key, $value, bool $unique = false): bool
{
    global $post_meta;
    if ($unique && array_key_exists($key, $post_meta[$post_id] ?? [])) return false;
    $post_meta[$post_id][$key] = $value;
    return true;
}
function delete_post_meta(int $post_id, string $key): void { global $post_meta; unset($post_meta[$post_id][$key]); }
function get_user_meta(int $user_id, string $key, bool $single = false) { global $user_meta; return $user_meta[$user_id][$key] ?? ''; }
function update_user_meta(int $user_id, string $key, $value): void { global $user_meta; $user_meta[$user_id][$key] = $value; }
function delete_user_meta(int $user_id, string $key): void { global $user_meta; unset($user_meta[$user_id][$key]); }
function wp_insert_post(array $data, bool $wp_error = false)
{
    global $posts, $next_post_id;
    $post = new WP_Post();
    $post->ID = $next_post_id++;
    $post->post_type = (string) ($data['post_type'] ?? 'post');
    $post->post_status = (string) ($data['post_status'] ?? 'draft');
    $post->post_content = (string) ($data['post_content'] ?? '');
    $post->post_title = (string) ($data['post_title'] ?? '');
    $post->post_author = (int) ($data['post_author'] ?? 0);
    $posts[$post->ID] = $post;
    return $post->ID;
}
function wp_update_post(array $data, bool $wp_error = false)
{
    global $posts;
    $post = $posts[(int) ($data['ID'] ?? 0)] ?? null;
    if (!$post) return new WP_Error('missing_post', 'Missing post.');
    if (array_key_exists('post_content', $data)) $post->post_content = (string) $data['post_content'];
    if (array_key_exists('post_author', $data)) $post->post_author = (int) $data['post_author'];
    return $post->ID;
}
function wp_save_post_revision(int $post_id): int { return $post_id + 10000; }
function wp_schedule_single_event(int $timestamp, string $hook, array $args = []): bool
{
    global $scheduled_events;
    $scheduled_events[] = ['timestamp' => $timestamp, 'hook' => $hook, 'args' => $args];
    return true;
}
function get_post_modified_time(string $format, bool $gmt, WP_Post $post): string { return '2026-08-28T00:00:00+00:00'; }
function get_posts(array $args = []): array
{
    global $posts;
    $found = [];
    foreach ($posts as $post) {
        if (isset($args['post_type']) && $post->post_type !== $args['post_type']) continue;
        if (isset($args['meta_key']) && (string) get_post_meta($post->ID, $args['meta_key'], true) !== (string) ($args['meta_value'] ?? '')) continue;
        $found[] = $post;
    }
    usort($found, static fn(WP_Post $left, WP_Post $right): int => $left->ID <=> $right->ID);
    return array_slice($found, 0, (int) ($args['posts_per_page'] ?? 100));
}

require __DIR__ . '/../includes/design/schema.php';
require __DIR__ . '/../includes/design/post-type.php';
require __DIR__ . '/../includes/design/publishing.php';
require __DIR__ . '/../includes/design/scheduling.php';
require __DIR__ . '/../includes/design/rest.php';

byline_register_design_routes();
$schedule_route = $routes['/admin/design/(?P<template>[a-z0-9:-]+)/schedule'] ?? null;
if (!is_array($schedule_route)
    || ($schedule_route['permission_callback'] ?? null) instanceof Closure === false
    || ($schedule_route['callback'] ?? null) !== 'byline_rest_create_design_schedule') {
    fwrite(STDERR, "The design schedule route was not protected by the publish-design capability.\n");
    exit(1);
}

byline_register_design_schedule_post_type();
if (!isset($registered_types[BYLINE_DESIGN_SCHEDULE_POST_TYPE])
    || $registered_types[BYLINE_DESIGN_SCHEDULE_POST_TYPE]['public'] !== false
    || $registered_types[BYLINE_DESIGN_SCHEDULE_POST_TYPE]['show_in_rest'] !== false) {
    fwrite(STDERR, "The scheduled design CPT was not registered as private storage.\n");
    exit(1);
}

$document = [
    'schemaVersion' => 2,
    'template' => 'home',
    'theme' => 'weekly-wildcat',
    'packages' => [[
        'id' => 'home-special-coverage',
        'type' => 'special-coverage-package',
        'props' => ['source' => ['type' => 'coverage', 'coverageId' => 42]],
    ]],
];

$schedule = byline_create_design_schedule('home', $document, 0, '2026-08-28T00:00:00Z', 7, 'fixed-schedule-key');
if (is_wp_error($schedule)
    || $schedule['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED
    || $schedule['baseLiveRevision'] !== 0
    || $schedule['idempotencyKey'] !== 'fixed-schedule-key'
    || count($scheduled_events) !== 1
    || byline_get_design_post('home') !== null) {
    fwrite(STDERR, "Creating a design schedule did not preserve an immutable, unpublished snapshot.\n");
    exit(1);
}

$schedule_id = (int) $schedule['id'];
$stored_snapshot = get_post($schedule_id)->post_content;
$rescheduled = byline_design_schedule_reschedule($schedule_id, '2026-08-29T00:00:00Z');
if (is_wp_error($rescheduled)
    || $rescheduled['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED
    || $rescheduled['scheduledAt'] !== '2026-08-29T00:00:00+00:00'
    || get_post($schedule_id)->post_content !== $stored_snapshot) {
    fwrite(STDERR, "Rescheduling changed the immutable document snapshot or failed to update timing.\n");
    exit(1);
}

$published = byline_publish_design_document('home', $document, 0, 7, 'immediate', false);
if (is_wp_error($published) || $published['revision'] !== 1) {
    fwrite(STDERR, "The canonical design publish helper did not establish the live revision.\n");
    exit(1);
}

$stale_create = byline_create_design_schedule('home', $document, 0, '2026-08-30T00:00:00Z', 7, 'stale-key');
if (!is_wp_error($stale_create) || $stale_create->get_error_code() !== 'byline_design_conflict') {
    fwrite(STDERR, "A stale base revision was allowed to create a design schedule.\n");
    exit(1);
}

$due = byline_create_design_schedule('home', $document, 1, '2026-08-28T00:00:00Z', 7, 'due-key');
if (is_wp_error($due)) {
    fwrite(STDERR, "A schedule based on the current live revision could not be created.\n");
    exit(1);
}
$deployments = 0;
$executed = byline_execute_design_schedule((int) $due['id'], strtotime('2026-08-29T00:00:00Z'));
if (is_wp_error($executed)
    || $executed['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED
    || $executed['resultingRevision'] !== 2
    || $deployments !== 1) {
    fwrite(STDERR, "A due design schedule did not publish and trigger deployment exactly once.\n");
    exit(1);
}

$retry = byline_execute_design_schedule((int) $due['id'], strtotime('2026-08-29T00:00:00Z'));
if (is_wp_error($retry) || $retry['resultingRevision'] !== 2 || $deployments !== 1 || byline_design_revision(byline_get_design_post('home')) !== 2) {
    fwrite(STDERR, "Retrying a published design schedule was not idempotent.\n");
    exit(1);
}

$conflict_schedule = byline_create_design_schedule('home', $document, 2, '2026-08-28T00:00:00Z', 7, 'conflict-key');
$another_document = $document;
$another_document['packages'][0]['props']['heading'] = 'New live heading';
$another_publish = byline_publish_design_document('home', $another_document, 2, 7, 'immediate', false);
if (is_wp_error($conflict_schedule) || is_wp_error($another_publish)) {
    fwrite(STDERR, "The conflict execution fixture could not be prepared.\n");
    exit(1);
}
$conflict_result = byline_execute_design_schedule((int) $conflict_schedule['id'], strtotime('2026-08-29T00:00:00Z'));
if (!is_wp_error($conflict_result)
    || $conflict_result->get_error_code() !== 'byline_design_conflict'
    || byline_get_design_schedule((int) $conflict_schedule['id'])['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_CONFLICT) {
    fwrite(STDERR, "A changed live base revision did not move the schedule to conflict.\n");
    exit(1);
}

$rebased = byline_design_schedule_rebase((int) $conflict_schedule['id'], 3);
if (is_wp_error($rebased) || $rebased['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_SCHEDULED || $rebased['baseLiveRevision'] !== 3) {
    fwrite(STDERR, "An explicit schedule rebase did not clear the conflict with a new base revision.\n");
    exit(1);
}

$rebased_execution = byline_execute_design_schedule((int) $conflict_schedule['id'], strtotime('2026-08-29T00:00:00Z'));
if (is_wp_error($rebased_execution)
    || $rebased_execution['status'] !== BYLINE_DESIGN_SCHEDULE_STATUS_PUBLISHED
    || $rebased_execution['resultingRevision'] !== 4
    || $deployments !== 2) {
    fwrite(STDERR, "A rebased schedule was not re-queued and published exactly once.\n");
    exit(1);
}

$rebased_retry = byline_execute_design_schedule((int) $conflict_schedule['id'], strtotime('2026-08-29T00:00:00Z'));
if (is_wp_error($rebased_retry) || $rebased_retry['resultingRevision'] !== 4 || $deployments !== 2) {
    fwrite(STDERR, "Retrying a rebased schedule was not idempotent.\n");
    exit(1);
}

$invalid_id = $next_post_id++;
$invalid_post = new WP_Post();
$invalid_post->ID = $invalid_id;
$invalid_post->post_type = BYLINE_DESIGN_SCHEDULE_POST_TYPE;
$invalid_post->post_content = '{"snapshotVersion":999}';
$posts[$invalid_id] = $invalid_post;
if (byline_get_design_schedule($invalid_id) !== null
    || ($post_meta[$invalid_id][BYLINE_DESIGN_SCHEDULE_STATUS_META] ?? '') !== BYLINE_DESIGN_SCHEDULE_STATUS_FAILED) {
    fwrite(STDERR, "Malformed stored schedule data was not failed closed.\n");
    exit(1);
}

echo "Byline design scheduling regression passed.\n";
