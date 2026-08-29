<?php

/**
 * Proves editorial notifications use the real durable job implementation.
 *
 * This keeps the WordPress surface small, but includes core/jobs.php and
 * editorial/notifications.php rather than replacing either implementation
 * with a test double.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public $ID = 0;
    public $post_type = '';
    public $post_status = 'private';
    public $post_title = '';
    public $post_content = '';
    public $post_author = 0;
    public $post_date_gmt = '1970-01-01 00:16:40';

    public function __construct(int $id, array $data = [])
    {
        $this->ID = $id;
        $this->post_type = (string) ($data['post_type'] ?? 'post');
        $this->post_status = (string) ($data['post_status'] ?? 'private');
        $this->post_title = (string) ($data['post_title'] ?? 'Assigned story');
        $this->post_content = (string) ($data['post_content'] ?? '');
        $this->post_author = (int) ($data['post_author'] ?? 0);
        $this->post_date_gmt = (string) ($data['post_date_gmt'] ?? '1970-01-01 00:16:40');
    }
}

class WP_User
{
    public $ID = 0;
    public $display_name = '';
    public $user_email = '';
}

class WP_Error
{
    private $code;
    private $message;
    private $data;

    public function __construct(string $code = '', string $message = '', array $data = [])
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

    public function get_error_data(): array
    {
        return $this->data;
    }
}

$notification_job_test_now = 1000;
$notification_job_test_next_id = 0;
$notification_job_test_posts = [];
$notification_job_test_meta = [];
$notification_job_test_users = [
    2 => ['name' => 'Writer', 'email' => 'writer@example.test', 'canEdit' => true],
];
$notification_job_test_mail = [];
$notification_job_test_scheduled = [];

function notification_jobs_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAILED: {$message}\n");
        exit(1);
    }
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_post_type(...$args): void {}
function register_rest_route(...$args): void {}
function absint($value): int { return abs((int) $value); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function wp_json_encode($value, int $flags = 0): string { return (string) json_encode($value, $flags); }
function wp_slash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function current_time(string $type, bool $gmt = false): int
{
    global $notification_job_test_now;
    return $notification_job_test_now;
}
function get_current_user_id(): int { return 1; }
function wp_generate_uuid4(): string { static $counter = 0; return 'notification-job-lease-' . (++$counter); }

function get_option(string $key, $default = false)
{
    static $options = [];
    return array_key_exists($key, $options) ? $options[$key] : $default;
}

function update_option(string $key, $value, bool $autoload = false): bool
{
    static $options = [];
    $options[$key] = $value;
    return true;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $notification_job_test_next_id, $notification_job_test_posts, $notification_job_test_now;
    $id = ++$notification_job_test_next_id;
    $notification_job_test_posts[$id] = new WP_Post($id, array_merge($data, [
        'post_date_gmt' => gmdate('Y-m-d H:i:s', $notification_job_test_now),
    ]));
    return $id;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    global $notification_job_test_posts;
    $id = (int) ($data['ID'] ?? 0);
    if (!isset($notification_job_test_posts[$id])) {
        return new WP_Error('missing_post', 'Missing post.');
    }
    if (array_key_exists('post_content', $data)) {
        $notification_job_test_posts[$id]->post_content = (string) $data['post_content'];
    }
    return $id;
}

function get_post(int $id)
{
    global $notification_job_test_posts;
    if (isset($notification_job_test_posts[$id])) {
        return $notification_job_test_posts[$id];
    }
    return $id === 42 ? new WP_Post(42, ['post_type' => 'post', 'post_title' => 'Assigned story']) : null;
}

function get_posts(array $args = []): array
{
    global $notification_job_test_posts, $notification_job_test_meta;
    $posts = array_values($notification_job_test_posts);
    if (isset($args['post_type'])) {
        $posts = array_values(array_filter($posts, static function (WP_Post $post) use ($args): bool {
            return $post->post_type === (string) $args['post_type'];
        }));
    }
    if (isset($args['meta_key'])) {
        $posts = array_values(array_filter($posts, static function (WP_Post $post) use ($args, $notification_job_test_meta): bool {
            return (string) ($notification_job_test_meta[$post->ID][$args['meta_key']] ?? '') === (string) ($args['meta_value'] ?? '');
        }));
    }
    usort($posts, static function (WP_Post $left, WP_Post $right): int {
        return $left->ID <=> $right->ID;
    });
    return $posts;
}

function get_post_meta(int $id, string $key, bool $single = false)
{
    global $notification_job_test_meta;
    return $notification_job_test_meta[$id][$key] ?? '';
}

function update_post_meta(int $id, string $key, $value): bool
{
    global $notification_job_test_meta;
    $notification_job_test_meta[$id][$key] = $value;
    return true;
}

function add_post_meta(int $id, string $key, $value, bool $unique = false): bool
{
    global $notification_job_test_meta;
    if ($unique && array_key_exists($key, $notification_job_test_meta[$id] ?? [])) {
        return false;
    }
    $notification_job_test_meta[$id][$key] = $value;
    return true;
}

function delete_post_meta(int $id, string $key): bool
{
    global $notification_job_test_meta;
    unset($notification_job_test_meta[$id][$key]);
    return true;
}

function wp_schedule_single_event(int $timestamp, string $hook, array $args = []): bool
{
    global $notification_job_test_scheduled;
    $notification_job_test_scheduled[] = ['timestamp' => $timestamp, 'hook' => $hook, 'args' => $args];
    return true;
}

function wp_next_scheduled(string $hook, array $args = [])
{
    global $notification_job_test_scheduled;
    foreach ($notification_job_test_scheduled as $event) {
        if ($event['hook'] === $hook && ($args === [] || $event['args'] === $args)) {
            return $event['timestamp'];
        }
    }
    return false;
}

function wp_clear_scheduled_hook(string $hook, array $args = []): void
{
    global $notification_job_test_scheduled;
    $notification_job_test_scheduled = array_values(array_filter($notification_job_test_scheduled, static function (array $event) use ($hook, $args): bool {
        return $event['hook'] !== $hook || ($args !== [] && $event['args'] !== $args);
    }));
}

function get_user_meta(int $user_id, string $key, bool $single = false)
{
    return '';
}

function get_user_by(string $field, $value)
{
    global $notification_job_test_users;
    $user_id = absint($value);
    if (!isset($notification_job_test_users[$user_id])) {
        return false;
    }
    $user = new WP_User();
    $user->ID = $user_id;
    $user->display_name = $notification_job_test_users[$user_id]['name'];
    $user->user_email = $notification_job_test_users[$user_id]['email'];
    return $user;
}

function user_can(int $user_id, string $capability, ...$args): bool
{
    global $notification_job_test_users;
    $user = $notification_job_test_users[$user_id] ?? [];
    if ($capability === 'edit_post') {
        return !empty($user['canEdit']) && (int) ($args[0] ?? 0) === 42;
    }
    return $capability === 'edit_posts' && !empty($user['canEdit']);
}

function get_the_title(WP_Post $post): string { return $post->post_title; }
function get_edit_post_link(int $post_id, string $context = 'display'): string { return 'https://cms.example.test/post.php?post=' . $post_id; }
function sanitize_email(string $email): string { return trim($email); }
function is_email(string $email): bool { return strpos($email, '@') !== false; }
function wp_mail(string $to, string $subject, string $body): bool
{
    global $notification_job_test_mail;
    $notification_job_test_mail[] = compact('to', 'subject', 'body');
    return true;
}

require __DIR__ . '/../includes/core/jobs.php';

notification_jobs_test_assert(
    (new ReflectionFunction('byline_create_job'))->getFileName() === realpath(__DIR__ . '/../includes/core/jobs.php'),
    'The enqueue API must come from the real core durable job runner.'
);

require __DIR__ . '/../includes/editorial/notifications.php';

notification_jobs_test_assert(
    isset($GLOBALS['byline_job_handlers'][BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE])
        && (new ReflectionFunction($GLOBALS['byline_job_handlers'][BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE]))->getFileName() === realpath(__DIR__ . '/../includes/editorial/notifications.php'),
    'The notification handler must register with the real durable job runner.'
);

$first = byline_editorial_notification_enqueue('story-assignment', 2, 42, 0, 'revision-7', 1);
notification_jobs_test_assert(is_array($first) && $first['status'] === 'queued', 'Notification enqueue should create a queued durable job.');

$internal = byline_job_internal((int) $first['id']);
notification_jobs_test_assert(
    is_array($internal)
        && $internal['type'] === BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE
        && $internal['payload']['recipientId'] === 2
        && $internal['payload']['storyId'] === 42
        && !isset($internal['payload']['title'])
        && $internal['idempotencyKey'] === 'editorial-notification:story-assignment:2:story-42:revision-7',
    'The real job record should retain the reference-only notification payload and idempotency key.'
);

$same = byline_editorial_notification_enqueue('story-assignment', 2, 42, 0, 'revision-7', 1);
notification_jobs_test_assert(
    is_array($same) && $same['id'] === $first['id'] && !empty($same['idempotent']) && count($notification_job_test_posts) === 1,
    'Repeated notification enqueue should dedupe through durable storage, not an in-memory notification double.'
);

$completed = byline_job_run((int) $first['id'], 1000, 'notification-regression');
notification_jobs_test_assert(
    is_array($completed) && $completed['status'] === 'succeeded' && $completed['attempts'] === 1,
    'The real durable runner should claim and complete the notification job.'
);
notification_jobs_test_assert(
    count($notification_job_test_mail) === 1
        && $notification_job_test_mail[0]['to'] === 'writer@example.test'
        && $notification_job_test_mail[0]['subject'] === 'Byline: story assigned to you'
        && strpos($notification_job_test_mail[0]['body'], 'Assigned story') !== false,
    'A completed durable notification job should deliver one email through the real handler.'
);

$stored = byline_job_internal((int) $first['id']);
notification_jobs_test_assert(
    is_array($stored) && $stored['status'] === 'succeeded' && $stored['completedAt'] === 1000,
    'Durable completion metadata should be persisted on the job record.'
);

echo "Editorial notifications durable jobs regression passed.\n";
