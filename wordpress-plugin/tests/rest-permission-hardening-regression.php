<?php

/**
 * Focused REST permission regression coverage for newsroom collections and
 * story-scoped projections. This uses a small WordPress-shaped harness so the
 * permission boundaries can run without a WordPress database.
 */

define('ABSPATH', __DIR__ . '/../');
define('BYLINE_REST_NAMESPACE', 'byline/v1');
define('BYLINE_MANAGE_CAPABILITY', 'manage_byline');
define('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY', 'manage_byline_integrations');

class WP_Post
{
    public $ID = 0;
    public $post_author = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_title = '';
    public $post_parent = 0;
    public $post_content = '';
    public $post_date_gmt = '';
    public $post_modified_gmt = '';
}

class WP_User
{
    public $ID = 0;
    public $display_name = '';
}

class WP_Error
{
    public $code;
    public $message;
    public $data;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string
    {
        return (string) $this->code;
    }
}

class WP_REST_Response
{
    public $data;
    public $status;

    public function __construct($data = null, $status = 200)
    {
        $this->data = $data;
        $this->status = $status;
    }

    public function get_data()
    {
        return $this->data;
    }
}

class WP_REST_Request
{
    private $params;
    private $json;
    private $headers;
    private $route;

    public function __construct(array $params = [], array $json = [], array $headers = [], string $route = '')
    {
        $this->params = $params;
        $this->json = $json;
        $this->headers = $headers;
        $this->route = $route;
    }

    public function get_param($key)
    {
        return $this->params[$key] ?? null;
    }

    public function get_params(): array
    {
        return $this->params;
    }

    public function get_json_params(): array
    {
        return $this->json;
    }

    public function get_url_params(): array
    {
        return $this->params;
    }

    public function get_header($key): string
    {
        $key = strtolower((string) $key);
        foreach ($this->headers as $name => $value) {
            if (strtolower((string) $name) === $key) {
                return (string) $value;
            }
        }

        return '';
    }

    public function get_route(): string
    {
        return $this->route;
    }
}

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const CREATABLE = 'POST';
    public const EDITABLE = 'POST,PUT,PATCH';
}

$rest_permission_posts = [];
$rest_permission_meta = [];
$rest_permission_options = [];
$rest_permission_transients = [];
$rest_permission_users = [
    1 => ['name' => 'Editor', 'editor' => true],
    2 => ['name' => 'Contributor', 'editor' => false],
    3 => ['name' => 'Other contributor', 'editor' => false],
];
$rest_permission_current_user = 2;
$rest_permission_routes = [];
$rest_permission_actions = [];

function rest_permission_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function rest_permission_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        rest_permission_test_fail($message);
    }
}

function add_action(string $hook, $callback = null, ...$args): void
{
    global $rest_permission_actions;
    $rest_permission_actions[$hook][] = $callback;
}

function add_filter(string $hook, $callback = null, ...$args): void {}
function do_action(string $hook, ...$args): void {}
function apply_filters(string $hook, $value, ...$args) { return $value; }
function register_post_type(string $post_type, array $args = []): void {}
function register_post_meta(string $post_type, string $key, array $args = []): bool { return true; }
function register_rest_field($object_type, $attribute, $args): void {}
function __return_true(): bool { return true; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function rest_authorization_required_code(): int { return 403; }
function rest_ensure_response($value) { return $value instanceof WP_REST_Response ? $value : new WP_REST_Response($value); }

function register_rest_route(string $namespace, string $route, $definition, $override = false): void
{
    global $rest_permission_routes;
    $rest_permission_routes[$namespace . $route] = $definition;
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_title($value): string
{
    return trim(sanitize_key(str_replace(' ', '-', (string) $value)), '-');
}

function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_email($value): string { return strtolower(trim((string) $value)); }
function wp_strip_all_tags($value): string { return trim(strip_tags((string) $value)); }
function strip_shortcodes($value): string { return (string) $value; }
function esc_url_raw($url, array $protocols = []): string { return is_scalar($url) ? (string) $url : ''; }
function esc_url($url): string { return esc_url_raw($url); }
function absint($value): int { return abs((int) $value); }
function wp_json_encode($value): string { return (string) json_encode($value); }
function wp_parse_url($url, $component = -1) { return parse_url((string) $url, $component); }
function wp_timezone(): DateTimeZone { return new DateTimeZone('America/New_York'); }
function wp_timezone_string(): string { return 'America/New_York'; }
function current_time($type = 'mysql', $gmt = false) { return $type === 'timestamp' ? time() : gmdate('Y-m-d H:i:s'); }
function admin_url($path = ''): string { return 'https://cms.example.test/wp-admin/' . ltrim((string) $path, '/'); }
function home_url($path = ''): string { return 'https://public.example.test/' . ltrim((string) $path, '/'); }
function get_current_user_id(): int
{
    global $rest_permission_current_user;
    return (int) $rest_permission_current_user;
}

function is_user_logged_in(): bool { return get_current_user_id() > 0; }

function rest_permission_test_user_can(int $user_id, string $capability, ...$args): bool
{
    global $rest_permission_posts, $rest_permission_users;
    $profile = $rest_permission_users[$user_id] ?? null;
    if (!is_array($profile)) {
        return false;
    }
    if ($capability === 'edit_posts') {
        return true;
    }
    if (in_array($capability, ['edit_others_posts', 'manage_options', 'manage_byline', 'manage_byline_integrations', 'publish_posts'], true)) {
        return !empty($profile['editor']);
    }
    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);
        $post = $rest_permission_posts[$post_id] ?? null;
        return $post instanceof WP_Post
            && $post->post_type === 'post'
            && ((int) $post->post_author === $user_id || !empty($profile['editor']));
    }

    return false;
}

function current_user_can(string $capability, ...$args): bool
{
    return rest_permission_test_user_can(get_current_user_id(), $capability, ...$args);
}

function user_can($user, string $capability, ...$args): bool
{
    $user_id = $user instanceof WP_User ? (int) $user->ID : absint($user);
    return rest_permission_test_user_can($user_id, $capability, ...$args);
}

function get_post($post_id)
{
    global $rest_permission_posts;
    return $rest_permission_posts[absint($post_id)] ?? null;
}

function get_post_type($post_id): string
{
    $post = get_post($post_id);
    return $post instanceof WP_Post ? (string) $post->post_type : '';
}

function get_post_field(string $field, int $post_id, $context = 'display')
{
    $post = get_post($post_id);
    return $post instanceof WP_Post ? ($post->{$field} ?? '') : '';
}

function get_user_by(string $field, $value)
{
    global $rest_permission_users;
    $user_id = absint($value);
    if (!isset($rest_permission_users[$user_id])) {
        return false;
    }
    $user = new WP_User();
    $user->ID = $user_id;
    $user->display_name = (string) $rest_permission_users[$user_id]['name'];
    return $user;
}

function get_users(array $args = []): array
{
    global $rest_permission_users;
    $users = [];
    foreach (array_keys($rest_permission_users) as $user_id) {
        $user = get_user_by('id', $user_id);
        if ($user instanceof WP_User) {
            $users[] = $user;
        }
    }
    return $users;
}

function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $rest_permission_meta;
    if (!array_key_exists($key, $rest_permission_meta[$post_id] ?? [])) {
        return $single ? '' : [];
    }
    $value = $rest_permission_meta[$post_id][$key];
    return $single ? $value : (is_array($value) ? $value : [$value]);
}

function metadata_exists(string $type, int $object_id, string $key): bool
{
    global $rest_permission_meta;
    return array_key_exists($key, $rest_permission_meta[$object_id] ?? []);
}

function update_post_meta(int $post_id, string $key, $value): void
{
    global $rest_permission_meta;
    $rest_permission_meta[$post_id][$key] = $value;
}

function delete_post_meta(int $post_id, string $key): void
{
    global $rest_permission_meta;
    unset($rest_permission_meta[$post_id][$key]);
}

function get_the_title(int $post_id): string
{
    $post = get_post($post_id);
    return $post instanceof WP_Post ? (string) $post->post_title : '';
}

function get_the_excerpt(int $post_id): string { return get_the_title($post_id); }
function get_permalink(int $post_id): string { return 'https://public.example.test/story/' . $post_id; }
function get_edit_post_link(int $post_id, string $context = 'display'): string { return admin_url('post.php?post=' . $post_id . '&action=edit'); }
function get_post_thumbnail_id(int $post_id): int { return absint(get_post_meta($post_id, '_thumbnail_id', true)); }
function has_post_thumbnail(int $post_id): bool { return get_post_thumbnail_id($post_id) > 0; }
function wp_attachment_is_image(int $attachment_id): bool { return $attachment_id > 0; }
function get_all_post_type_supports(string $post_type): array { return []; }
function is_avatar_comment_type($type): bool { return false; }
function get_comments(array $args = []): array { return []; }
function wp_get_environment_type(): string { return 'production'; }

function get_posts(array $query = []): array
{
    global $rest_permission_posts;
    $posts = array_values($rest_permission_posts);
    if (isset($query['p'])) {
        $requested = absint($query['p']);
        $posts = array_values(array_filter($posts, static function ($post) use ($requested): bool {
            return $post instanceof WP_Post && (int) $post->ID === $requested;
        }));
    }
    if (isset($query['post_type'])) {
        $types = array_map('strval', (array) $query['post_type']);
        $posts = array_values(array_filter($posts, static function ($post) use ($types): bool {
            return $post instanceof WP_Post && in_array((string) $post->post_type, $types, true);
        }));
    }
    if (isset($query['post_status'])) {
        $statuses = array_map('strval', (array) $query['post_status']);
        $posts = array_values(array_filter($posts, static function ($post) use ($statuses): bool {
            return $post instanceof WP_Post && in_array((string) $post->post_status, $statuses, true);
        }));
    }
    if (isset($query['post_parent'])) {
        $parent = absint($query['post_parent']);
        $posts = array_values(array_filter($posts, static function ($post) use ($parent): bool {
            return $post instanceof WP_Post && absint($post->post_parent) === $parent;
        }));
    }
    usort($posts, static function ($left, $right): int {
        return ((int) ($right->ID ?? 0)) <=> ((int) ($left->ID ?? 0));
    });
    $limit = absint($query['posts_per_page'] ?? $query['numberposts'] ?? 10);
    $limit = $limit > 0 ? $limit : 10;
    $posts = array_slice($posts, absint($query['offset'] ?? 0), $limit);
    if (($query['fields'] ?? '') === 'ids') {
        return array_values(array_map(static function ($post): int { return (int) $post->ID; }, $posts));
    }
    return $posts;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $rest_permission_posts;
    $id = $rest_permission_posts === [] ? 1 : max(array_keys($rest_permission_posts)) + 1;
    $post = new WP_Post();
    $post->ID = $id;
    foreach ($data as $key => $value) {
        if (property_exists($post, $key)) {
            $post->{$key} = $value;
        }
    }
    $rest_permission_posts[$id] = $post;
    return $id;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    $post_id = absint($data['ID'] ?? 0);
    $post = get_post($post_id);
    if (!$post instanceof WP_Post) {
        return $wp_error ? new WP_Error('not_found', 'Not found') : 0;
    }
    foreach ($data as $key => $value) {
        if ($key !== 'ID' && property_exists($post, $key)) {
            $post->{$key} = $value;
        }
    }
    return $post_id;
}

function wp_delete_post(int $post_id, bool $force_delete = false) { return get_post($post_id); }
function get_option(string $key, $default = false) { global $rest_permission_options; return $rest_permission_options[$key] ?? $default; }
function update_option(string $key, $value, $autoload = false): bool { global $rest_permission_options; $rest_permission_options[$key] = $value; return true; }
function get_transient(string $key) { global $rest_permission_transients; return $rest_permission_transients[$key] ?? false; }
function set_transient(string $key, $value, int $expiration = 0): bool { global $rest_permission_transients; $rest_permission_transients[$key] = $value; return true; }
function delete_transient(string $key): bool { global $rest_permission_transients; unset($rest_permission_transients[$key]); return true; }
function wp_generate_uuid4(): string { return '00000000-0000-4000-8000-000000000001'; }

require __DIR__ . '/../includes/editorial/rest.php';
require __DIR__ . '/../includes/content-health/rest.php';
require __DIR__ . '/../includes/integrations/distribution.php';
require __DIR__ . '/../includes/integrations/analytics.php';

function rest_permission_test_add_post(int $id, string $type, string $status, int $author, string $title, int $parent = 0): void
{
    global $rest_permission_posts;
    $post = new WP_Post();
    $post->ID = $id;
    $post->post_type = $type;
    $post->post_status = $status;
    $post->post_author = $author;
    $post->post_title = $title;
    $post->post_parent = $parent;
    $post->post_date_gmt = '2026-08-20 12:00:00';
    $post->post_modified_gmt = '2026-08-21 12:00:00';
    $rest_permission_posts[$id] = $post;
}

rest_permission_test_add_post(10, 'post', 'publish', 2, 'Contributor story');
rest_permission_test_add_post(11, 'post', 'publish', 3, 'Other contributor story');
rest_permission_test_add_post(12, 'post', 'draft', 3, 'Private draft story');
rest_permission_test_add_post(100, 'attachment', 'inherit', 1, 'Photo');
rest_permission_test_add_post(101, BYLINE_TASK_POST_TYPE, 'private', 2, 'Task on contributor story', 10);
rest_permission_test_add_post(102, BYLINE_TASK_POST_TYPE, 'private', 3, 'Task on another story', 11);
rest_permission_test_add_post(201, BYLINE_FEEDBACK_POST_TYPE, 'private', 0, 'Feedback on contributor story', 10);
rest_permission_test_add_post(202, BYLINE_FEEDBACK_POST_TYPE, 'private', 0, 'Feedback on another story', 11);

update_post_meta(10, '_wwh_story_visuals', 'Need a photo');
update_post_meta(11, '_wwh_story_visuals', 'Need a graphic');
update_post_meta(101, BYLINE_TASK_STATE_META, 'open');
update_post_meta(102, BYLINE_TASK_STATE_META, 'open');
update_post_meta(201, BYLINE_FEEDBACK_TYPE_META, 'correction');
update_post_meta(201, BYLINE_FEEDBACK_MESSAGE_META, 'Check the spelling.');
update_post_meta(201, BYLINE_FEEDBACK_STATUS_META, 'new');
update_post_meta(201, BYLINE_FEEDBACK_STORY_META, 10);
update_post_meta(202, BYLINE_FEEDBACK_TYPE_META, 'tip');
update_post_meta(202, BYLINE_FEEDBACK_MESSAGE_META, 'A private newsroom tip.');
update_post_meta(202, BYLINE_FEEDBACK_STATUS_META, 'new');
update_post_meta(202, BYLINE_FEEDBACK_STORY_META, 11);

update_post_meta(101, BYLINE_TASK_ASSIGNEE_META, 2);
update_post_meta(102, BYLINE_TASK_ASSIGNEE_META, 3);

$rest_permission_transients[byline_content_health_story_cache_key(10)] = [
    'issues' => [['id' => 'headline', 'type' => 'headline', 'severity' => 'warning', 'problem' => 'Review the headline.', 'checkedAt' => '2026-08-22T12:00:00Z']],
    'checkedAt' => '2026-08-22T12:00:00Z',
    'remoteLinksChecked' => false,
];
$rest_permission_transients[byline_content_health_story_cache_key(11)] = [
    'issues' => [['id' => 'private-copy', 'type' => 'copy', 'severity' => 'error', 'problem' => 'Private story issue.', 'checkedAt' => '2026-08-22T12:00:00Z']],
    'checkedAt' => '2026-08-22T12:00:00Z',
    'remoteLinksChecked' => false,
];

function byline_get_publication_config(): array
{
    return ['urls' => ['publicSite' => 'https://public.example.test']];
}

function rest_permission_test_route(string $route, string $method): array
{
    global $rest_permission_routes;
    $definition = $rest_permission_routes[BYLINE_REST_NAMESPACE . $route] ?? null;
    rest_permission_test_assert($definition !== null, 'Missing route ' . $route . '.');
    $definitions = isset($definition[0]) && is_array($definition[0]) ? $definition : [$definition];
    foreach ($definitions as $item) {
        $methods = (string) ($item['methods'] ?? '');
        if ($methods === $method || strpos($methods, $method) !== false) {
            return $item;
        }
    }
    rest_permission_test_fail('Missing method ' . $method . ' for route ' . $route . '.');
}

function rest_permission_test_data($response)
{
    return $response instanceof WP_REST_Response ? $response->get_data() : $response;
}

byline_editorial_register_extended_rest_routes();
byline_register_content_health_routes();
byline_register_distribution_routes();
byline_register_analytics_routes();

$planning_route = rest_permission_test_route('/editorial/planning', 'GET');
$tasks_route = rest_permission_test_route('/editorial/tasks', 'GET');
$media_route = rest_permission_test_route('/editorial/media', 'GET');
$feedback_route = rest_permission_test_route('/admin/feedback', 'GET');
$feedback_item_route = rest_permission_test_route('/admin/feedback/(?P<id>\\d+)', 'GET');
$feedback_correction_route = rest_permission_test_route('/admin/feedback/(?P<id>\\d+)/correction', 'POST');
$health_route = rest_permission_test_route('/admin/content-health', 'GET');
$health_story_route = rest_permission_test_route('/admin/content-health/story/(?P<id>\\d+)', 'GET');
$distribution_state_route = rest_permission_test_route('/editorial/distribution/(?P<id>\\d+)', 'GET');
$distribution_action_route = rest_permission_test_route('/editorial/distribution/(?P<id>\\d+)/social', 'POST');
$story_distribution_action_route = rest_permission_test_route('/editorial/stories/(?P<id>\\d+)/distribution/(?P<channelId>[a-z0-9_-]+)', 'POST');
$performance_route = rest_permission_test_route('/admin/analytics/performance', 'GET');

global $rest_permission_current_user;

// Contributor: collection access stays available, but every returned story,
// task, media request, and health issue is limited to edit_post ownership.
$rest_permission_current_user = 2;
rest_permission_test_assert(call_user_func($planning_route['permission_callback']) === true, 'Contributor lost intended Planning collection access.');
$planning_items = byline_editorial_collect_planning_stories([], 2);
rest_permission_test_assert(array_column($planning_items, 'id') === [10], 'Planning returned another writer\'s story to a contributor.');

rest_permission_test_assert(call_user_func($tasks_route['permission_callback']) === true, 'Contributor lost intended Tasks collection access.');
$task_items = byline_list_tasks([], 2);
rest_permission_test_assert(array_column($task_items, 'id') === [101], 'Tasks returned another writer\'s task to a contributor.');
$task_item_route = rest_permission_test_route('/editorial/tasks/(?P<id>\\d+)', 'GET');
$task_other_permission = call_user_func($task_item_route['permission_callback'], new WP_REST_Request(['id' => 102]));
rest_permission_test_assert($task_other_permission instanceof WP_Error, 'Contributor could open another writer\'s individual task.');

rest_permission_test_assert(call_user_func($media_route['permission_callback']) === true, 'Contributor lost intended Media collection access.');
$media_items = byline_list_editorial_media_requests([], 2);
rest_permission_test_assert(array_column($media_items, 'storyId') === [10], 'Media returned another writer\'s story request to a contributor.');
rest_permission_test_assert(call_user_func(rest_permission_test_route('/editorial/stories/(?P<id>\\d+)/media', 'GET')['permission_callback'], new WP_REST_Request(['id' => 11])) instanceof WP_Error, 'Contributor could open another writer\'s media URL.');

rest_permission_test_assert($feedback_route['permission_callback'](new WP_REST_Request()) instanceof WP_Error, 'Contributor could open the global feedback inbox.');
rest_permission_test_assert($feedback_item_route['permission_callback'](new WP_REST_Request(['id' => 202])) instanceof WP_Error, 'Contributor could open feedback for another writer\'s story.');
rest_permission_test_assert($feedback_item_route['permission_callback'](new WP_REST_Request(['id' => 201])) === true, 'Story-level feedback exception did not honor edit_post for the contributor\'s story.');
rest_permission_test_assert($feedback_correction_route['permission_callback'](new WP_REST_Request(['id' => 202])) instanceof WP_Error, 'Contributor could use a correction action for another writer\'s feedback.');
rest_permission_test_assert(array_column(byline_list_feedback([], 2), 'id') === [201], 'Feedback collection filtering did not honor the contributor\'s story capability.');

$public_feedback_permission = rest_permission_test_route('/feedback', 'POST')['permission_callback'];
rest_permission_test_assert($public_feedback_permission(new WP_REST_Request([], [], ['Origin' => 'https://public.example.test'])) === true, 'Public feedback lost anonymous allowed-origin access.');
rest_permission_test_assert($public_feedback_permission(new WP_REST_Request([], [], ['Origin' => 'https://evil.example.test'])) instanceof WP_Error, 'Public feedback accepted an untrusted origin.');

rest_permission_test_assert($health_route['permission_callback'](new WP_REST_Request()) === true, 'Contributor lost intended Content Health collection access.');
$health_data = rest_permission_test_data($health_route['callback'](new WP_REST_Request()));
$health_story_ids = [];
foreach ((array) ($health_data['issues'] ?? []) as $issue) {
    if (is_array($issue) && is_array($issue['story'] ?? null)) {
        $health_story_ids[] = (int) ($issue['story']['id'] ?? 0);
    }
}
rest_permission_test_assert($health_story_ids === [10], 'Content Health leaked another writer\'s story projection.');
rest_permission_test_assert($health_story_route['permission_callback'](new WP_REST_Request(['id' => 11])) === false, 'Contributor could open another writer\'s Content Health story URL.');
rest_permission_test_assert($health_route['permission_callback'](new WP_REST_Request(['postId' => 11])) === false, 'Content Health query targeting another story bypassed the object check.');

rest_permission_test_assert($distribution_state_route['permission_callback'](new WP_REST_Request(['id' => 10])) === true, 'Contributor lost read access to an editable story distribution state.');
rest_permission_test_assert($distribution_state_route['permission_callback'](new WP_REST_Request(['id' => 11])) === false, 'Contributor could read another writer\'s distribution state.');
rest_permission_test_assert($distribution_action_route['permission_callback'](new WP_REST_Request(['id' => 10])) === false, 'Contributor could mark a public channel as distributed.');
rest_permission_test_assert($story_distribution_action_route['permission_callback'](new WP_REST_Request(['id' => 10, 'channelId' => 'discord'])) instanceof WP_Error, 'Contributor could use the story distribution send action.');

rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request()) === true, 'Contributor lost intended aggregate analytics performance access.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['postId' => 10])) === true, 'Contributor could not view analytics for an editable published story.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['postId' => 11])) === false, 'Contributor could target another writer\'s story analytics.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['postId' => 12])) === false, 'Contributor could target draft analytics.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['path' => '/private-draft'])) === false, 'Analytics accepted an unbound path that could identify private content.');

// Editor: the same routes retain newsroom-wide collection access and can open
// another writer\'s story-scoped records, while draft performance remains out
// of the analytics surface even for an editor.
$rest_permission_current_user = 1;
rest_permission_test_assert(call_user_func($planning_route['permission_callback']) === true, 'Editor lost Planning collection access.');
rest_permission_test_assert(array_column(byline_editorial_collect_planning_stories([], 1), 'id') === [12, 11, 10], 'Editor could not see the full Planning collection.');
rest_permission_test_assert(call_user_func($tasks_route['permission_callback']) === true, 'Editor lost Tasks collection access.');
rest_permission_test_assert(array_column(byline_list_tasks([], 1), 'id') === [102, 101], 'Editor could not see all linked tasks.');
rest_permission_test_assert(call_user_func($media_route['permission_callback']) === true, 'Editor lost Media collection access.');
rest_permission_test_assert(array_column(byline_list_editorial_media_requests([], 1), 'storyId') === [11, 10], 'Editor could not see all media requests.');
rest_permission_test_assert($feedback_route['permission_callback'](new WP_REST_Request()) === true, 'Editor could not open the global feedback inbox.');
rest_permission_test_assert($feedback_item_route['permission_callback'](new WP_REST_Request(['id' => 202])) === true, 'Editor could not open another writer\'s feedback.');
rest_permission_test_assert($feedback_correction_route['permission_callback'](new WP_REST_Request(['id' => 202])) === true, 'Editor could not use another writer\'s correction action.');
rest_permission_test_assert($health_story_route['permission_callback'](new WP_REST_Request(['id' => 11])) === true, 'Editor could not open another writer\'s Content Health story URL.');
rest_permission_test_assert($distribution_action_route['permission_callback'](new WP_REST_Request(['id' => 11])) === true, 'Editor could not mark a public channel as distributed.');
rest_permission_test_assert($story_distribution_action_route['permission_callback'](new WP_REST_Request(['id' => 11, 'channelId' => 'discord'])) === true, 'Editor could not use the story distribution send action.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['postId' => 11])) === true, 'Editor could not view analytics for a published story.');
rest_permission_test_assert($performance_route['permission_callback'](new WP_REST_Request(['postId' => 12])) === false, 'Analytics exposed draft targeting to an editor.');

echo "Byline REST permission hardening regression passed.\n";
