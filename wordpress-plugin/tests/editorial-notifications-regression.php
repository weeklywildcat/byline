<?php

/**
 * Focused regression coverage for private editorial notification behavior.
 *
 * This deliberately uses small WordPress doubles so delivery, dedupe, and
 * authorization semantics can run in the repository PHP regression loop.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_title = '';
    public $post_author = 0;
    public $post_parent = 0;

    public function __construct(int $id, string $title = 'Assigned story', int $author = 1)
    {
        $this->ID = $id;
        $this->post_title = $title;
        $this->post_author = $author;
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
    public $data;

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

$notification_test_users = [
    1 => ['name' => 'Editor', 'email' => 'editor@example.test', 'canEdit' => true, 'canManage' => true],
    2 => ['name' => 'Writer', 'email' => 'writer@example.test', 'canEdit' => true, 'canManage' => false],
];
$notification_test_posts = [
    10 => new WP_Post(10, 'Tomorrow story', 1),
    11 => new WP_Post(11, 'Overdue story', 1),
    20 => new WP_Post(20),
];
$notification_test_posts[20]->post_type = 'byline_task';
$notification_test_posts[20]->post_parent = 10;
$notification_test_story_states = [
    10 => ['editorId' => 2, 'deadline' => gmdate('Y-m-d', time() + 86400), 'isPublished' => false, 'postStatus' => 'draft'],
    11 => ['editorId' => 2, 'deadline' => gmdate('Y-m-d', time() - 86400), 'isPublished' => false, 'postStatus' => 'draft'],
];
$notification_test_meta = [];
$notification_test_actions = [];
$notification_test_jobs = [];
$notification_test_job_by_key = [];
$notification_test_handlers = [];
$notification_test_mail_calls = [];
$notification_test_mail_result = true;
$notification_test_current_user = 1;

function notification_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAILED: {$message}\n");
        exit(1);
    }
}

function add_action($tag, $callback = null, $priority = 10, $accepted_args = 1): void
{
    global $notification_test_actions;
    $notification_test_actions[$tag][] = ['callback' => $callback, 'accepted_args' => $accepted_args];
}

function do_action(string $tag, ...$args): void
{
    global $notification_test_actions;
    foreach ($notification_test_actions[$tag] ?? [] as $action) {
        call_user_func_array($action['callback'], array_slice($args, 0, (int) $action['accepted_args']));
    }
}

function byline_register_job_handler(string $type, callable $handler): bool
{
    global $notification_test_handlers;
    $notification_test_handlers[$type] = $handler;
    return true;
}

function byline_create_job(string $type, array $payload, array $args = [])
{
    global $notification_test_jobs, $notification_test_job_by_key;
    $key = (string) ($args['idempotencyKey'] ?? '');
    if (isset($notification_test_job_by_key[$key])) {
        $existing = $notification_test_jobs[$notification_test_job_by_key[$key]];
        $existing['idempotent'] = true;
        return $existing;
    }
    $id = count($notification_test_jobs) + 1;
    $job = ['id' => $id, 'type' => $type, 'payload' => $payload, 'idempotencyKey' => $key];
    $notification_test_jobs[$id] = $job;
    $notification_test_job_by_key[$key] = $id;
    return $job;
}

function get_user_meta(int $user_id, string $key, bool $single = false)
{
    global $notification_test_meta;
    return $notification_test_meta[$user_id][$key] ?? ($single ? '' : []);
}

function update_user_meta(int $user_id, string $key, $value): bool
{
    global $notification_test_meta;
    $notification_test_meta[$user_id][$key] = $value;
    return true;
}

function get_current_user_id(): int
{
    global $notification_test_current_user;
    return $notification_test_current_user;
}

function user_can(int $user_id, string $capability, ...$args): bool
{
    global $notification_test_users;
    $user = $notification_test_users[$user_id] ?? [];
    if ($capability === 'edit_post') {
        return !empty($user['canEdit']) && in_array((int) ($args[0] ?? 0), [10, 11], true);
    }
    if ($capability === 'edit_posts') {
        return !empty($user['canEdit']);
    }
    if ($capability === 'edit_others_posts' || $capability === 'manage_byline') {
        return !empty($user['canManage']);
    }
    if ($capability === 'edit_user') {
        return isset($notification_test_users[$user_id]);
    }
    return false;
}

function current_user_can(string $capability, ...$args): bool
{
    return user_can(get_current_user_id(), $capability, ...$args);
}

function get_user_by(string $field, $value)
{
    global $notification_test_users;
    $id = absint($value);
    if (!isset($notification_test_users[$id])) {
        return false;
    }
    $user = new WP_User();
    $user->ID = $id;
    $user->display_name = $notification_test_users[$id]['name'];
    $user->user_email = $notification_test_users[$id]['email'];
    return $user;
}

function get_post(int $post_id)
{
    global $notification_test_posts;
    return $notification_test_posts[$post_id] ?? null;
}

function get_users(array $args = []): array
{
    return [1, 2];
}

function get_posts(array $args = []): array
{
    global $notification_test_posts;
    $post_type = (string) ($args['post_type'] ?? '');
    return array_values(array_filter($notification_test_posts, static function (WP_Post $post) use ($post_type): bool {
        return $post_type === '' || $post->post_type === $post_type;
    }));
}

function byline_get_editorial_story_state(int $post_id): array
{
    global $notification_test_story_states;
    return $notification_test_story_states[$post_id] ?? [];
}

function byline_get_task(int $task_id): array
{
    return $task_id === 20 ? [
        'id' => 20,
        'title' => 'Verify the game time',
        'state' => 'open',
        'assigneeId' => 2,
        'storyId' => 10,
        'priority' => 'high',
        'dueAt' => gmdate('Y-m-d\\TH:i:s\\Z', time() + 3600),
        'modifiedAt' => '2026-08-29T12:00:00Z',
    ] : [];
}

function get_the_title(WP_Post $post): string
{
    return $post->post_title;
}

function get_edit_post_link(int $post_id, string $context = 'display'): string
{
    return 'https://cms.example.test/wp-admin/post.php?post=' . $post_id . '&action=edit';
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . ltrim($path, '/');
}

function absint($value): int { return abs((int) $value); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function current_time(string $type, bool $gmt = false): int { return time(); }
function wp_mail(string $to, string $subject, string $body): bool
{
    global $notification_test_mail_calls, $notification_test_mail_result;
    $notification_test_mail_calls[] = compact('to', 'subject', 'body');
    return $notification_test_mail_result;
}
function sanitize_email(string $email): string { return trim($email); }
function is_email(string $email): bool { return strpos($email, '@') !== false; }

require __DIR__ . '/../includes/editorial/notifications.php';

notification_test_assert(isset($notification_test_handlers[BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE]), 'The notification job handler should register with the durable job runner.');
notification_test_assert(isset($notification_test_actions['show_user_profile']) && isset($notification_test_actions['personal_options_update']), 'Preferences should use native WordPress profile hooks.');
$writer_labels = byline_editorial_notification_visible_preference_labels(2);
notification_test_assert(isset($writer_labels['storyAssignments']) && isset($writer_labels['storyReturned']) && !isset($writer_labels['publishingFailures']), 'Profile preferences should be limited to the writer\'s capabilities.');

// Disabled preferences are checked before queueing and therefore cannot leave
// a dormant email job behind.
update_user_meta(2, BYLINE_EDITORIAL_NOTIFICATION_PREFS_META, ['storyAssignments' => false]);
$disabled = byline_editorial_notification_enqueue('story-assignment', 2, 10, 0, 'revision-1', 1);
notification_test_assert($disabled === null && count($notification_test_jobs) === 0, 'A disabled preference should suppress queueing.');

// Re-enable the event and enqueue it twice. The same idempotency key must
// return the existing job, while the payload remains reference-only.
update_user_meta(2, BYLINE_EDITORIAL_NOTIFICATION_PREFS_META, ['storyAssignments' => true]);
$first = byline_editorial_notification_enqueue('story-assignment', 2, 10, 0, 'revision-1', 1);
$same = byline_editorial_notification_enqueue('story-assignment', 2, 10, 0, 'revision-1', 1);
notification_test_assert(is_array($first) && is_array($same) && $first['id'] === $same['id'] && !empty($same['idempotent']), 'Repeated event delivery should be deduped by the durable job key.');
notification_test_assert(!isset($first['payload']['title']) && !isset($first['payload']['email']), 'Notification payloads must not contain private content or addresses.');

// Queue-time permission is not enough: revoke the story capability before
// delivery and confirm that no mail is sent and the job is safely skipped.
$notification_test_users[2]['canEdit'] = false;
$handler = $notification_test_handlers[BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE];
$revoked = $handler(['payload' => $first['payload']]);
notification_test_assert(is_array($revoked) && !empty($revoked['skipped']) && $notification_test_mail_calls === [], 'A revoked story editor should be skipped at delivery time.');

// A delivery failure returns a retryable error; the durable runner owns the
// attempt count and backoff rather than the notification domain.
$notification_test_users[2]['canEdit'] = true;
$notification_test_mail_result = false;
$failed = $handler(['payload' => $first['payload']]);
notification_test_assert($failed instanceof WP_Error && $failed->get_error_code() === 'byline_notification_delivery_failed', 'Mail failure should return a safe delivery error.');
notification_test_assert(!empty($failed->get_error_data()['retryable']), 'Mail failure should be marked retryable for durable job backoff.');
notification_test_assert(count($notification_test_mail_calls) === 1, 'A failed delivery should make one mail attempt.');

// Assignment hooks enqueue the assignee, but never put the story title into
// the job payload.
$notification_test_mail_result = true;
$notification_test_current_user = 1;
do_action('byline_editorial_story_updated', 10, ['editorId' => 2, 'revision' => 2], ['editorId' => 2]);
notification_test_assert(count($notification_test_jobs) === 2, 'A story assignment hook should enqueue one notification.');
notification_test_assert(($notification_test_jobs[2]['payload']['storyId'] ?? 0) === 10 && !isset($notification_test_jobs[2]['payload']['title']), 'Assignment jobs should reference the story without copying private content.');

// A review return uses the transition context supplied by the workflow domain
// and notifies the story author without treating every stage move as a return.
$notification_test_posts[10]->post_author = 2;
do_action('byline_editorial_story_updated', 10, ['editorId' => 2, 'revision' => 3], ['status' => 'editing'], ['storedStatus' => 'ready']);
notification_test_assert(count($notification_test_jobs) === 3 && ($notification_test_jobs[3]['payload']['event'] ?? '') === 'story-returned', 'A story returned from review should notify its author.');

// Media and task notifications are emitted only for assignment changes, not
// for ordinary status/title updates that would otherwise create noise.
$before_media = count($notification_test_jobs);
byline_editorial_notification_on_media_updated(10, ['assigneeId' => 2, 'status' => 'assigned', 'modifiedAt' => '2026-08-29T12:01:00Z'], 1, ['previousRequest' => ['assigneeId' => 0]]);
notification_test_assert(count($notification_test_jobs) === $before_media + 1, 'A newly assigned media request should enqueue one notification.');
byline_editorial_notification_on_media_updated(10, ['assigneeId' => 2, 'status' => 'uploaded', 'modifiedAt' => '2026-08-29T12:02:00Z'], 1, ['previousRequest' => ['assigneeId' => 2]]);
notification_test_assert(count($notification_test_jobs) === $before_media + 1, 'A media status change should not enqueue an assignment notification.');

$before_task = count($notification_test_jobs);
byline_editorial_notification_on_task_changed(20, byline_get_task(20), 'changed', ['title' => 'Updated title']);
notification_test_assert(count($notification_test_jobs) === $before_task, 'An ordinary task edit should not notify the assignee.');
byline_editorial_notification_on_task_changed(20, byline_get_task(20), 'changed', ['assigneeId' => 2]);
notification_test_assert(count($notification_test_jobs) === $before_task + 1, 'A high-priority task assignment should notify the assignee.');

// The daily digest is one coalesced durable job per recipient/day, even when
// cron invokes the queue callback more than once. It includes both assigned
// story deadlines and assigned tasks.
$before_digest = count($notification_test_jobs);
byline_editorial_notification_queue_due_digest();
$digest = end($notification_test_jobs);
byline_editorial_notification_queue_due_digest();
$digest_again = end($notification_test_jobs);
notification_test_assert(count($notification_test_jobs) === $before_digest + 1 && is_array($digest) && is_array($digest_again) && $digest['id'] === $digest_again['id'] && ($digest['payload']['event'] ?? '') === 'due-digest', 'Due-task digests should be coalesced by recipient and day.');

$mail_before_digest = count($notification_test_mail_calls);
$notification_test_users[2]['canEdit'] = false;
$revoked_digest = $handler(['payload' => $digest['payload']]);
notification_test_assert(is_array($revoked_digest) && !empty($revoked_digest['skipped']) && count($notification_test_mail_calls) === $mail_before_digest, 'A due digest must be skipped when the recipient loses story/task access before delivery.');

$notification_test_users[2]['canEdit'] = true;
$delivered_digest = $handler(['payload' => $digest['payload']]);
$digest_mail = end($notification_test_mail_calls);
notification_test_assert(is_array($delivered_digest) && !empty($delivered_digest['delivered']), 'A due digest with assigned story and task work should deliver.');
notification_test_assert(($digest_mail['subject'] ?? '') === 'Byline due-work reminder' && strpos($digest_mail['body'] ?? '', 'Tomorrow story') !== false && strpos($digest_mail['body'] ?? '', 'Overdue story') !== false && strpos($digest_mail['body'] ?? '', 'overdue') !== false && strpos($digest_mail['body'] ?? '', 'due tomorrow') !== false, 'The daily digest should describe tomorrow and overdue story deadlines alongside task work.');

echo "Editorial notifications regression passed.\n";
