<?php

/**
 * Small, private editorial notifications backed by durable Byline jobs.
 *
 * Notification payloads contain only stable object references and a dedupe
 * token. Titles, links, and recipient addresses are resolved at delivery time
 * after the recipient's current WordPress capabilities are checked again.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE = 'editorial-notification';
const BYLINE_EDITORIAL_NOTIFICATION_DIGEST_HOOK = 'byline_editorial_notification_due_digest';
const BYLINE_EDITORIAL_NOTIFICATION_PREFS_META = '_byline_editorial_notification_preferences';

/** @return array<string,bool> */
function byline_editorial_notification_preference_defaults(): array
{
    return [
        'storyAssignments' => true,
        'readyForReview' => true,
        'mediaAssignments' => true,
        'highPriorityTasks' => true,
        'publishingFailures' => true,
        'storyReturned' => true,
        'dueDigest' => true,
    ];
}

/** @return array<string,bool> */
function byline_editorial_notification_preferences(int $user_id): array
{
    $defaults = byline_editorial_notification_preference_defaults();
    $stored = function_exists('get_user_meta')
        ? get_user_meta(absint($user_id), BYLINE_EDITORIAL_NOTIFICATION_PREFS_META, true)
        : [];
    $stored = is_array($stored) ? $stored : [];

    $preferences = [];
    foreach ($defaults as $key => $default) {
        $preferences[$key] = array_key_exists($key, $stored) ? !empty($stored[$key]) : $default;
    }

    return $preferences;
}

function byline_editorial_notification_preference_for_event(string $event): string
{
    $map = [
        'story-assignment' => 'storyAssignments',
        'ready-for-review' => 'readyForReview',
        'media-assignment' => 'mediaAssignments',
        'high-priority-task' => 'highPriorityTasks',
        'publishing-failure' => 'publishingFailures',
        'story-returned' => 'storyReturned',
        'due-digest' => 'dueDigest',
    ];

    return $map[$event] ?? '';
}

function byline_editorial_notification_is_enabled(int $user_id, string $event): bool
{
    $preference = byline_editorial_notification_preference_for_event($event);
    if ($preference === '') {
        return false;
    }

    $preferences = byline_editorial_notification_preferences($user_id);
    return !empty($preferences[$preference]);
}

function byline_editorial_notification_current_user_id(): int
{
    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

function byline_editorial_notification_safe_text($value, int $maximum = 240): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $text = function_exists('sanitize_text_field')
        ? sanitize_text_field((string) $value)
        : trim(strip_tags((string) $value));

    return function_exists('mb_substr') ? mb_substr($text, 0, $maximum) : substr($text, 0, $maximum);
}

function byline_editorial_notification_error(string $code, string $message, bool $retryable = false)
{
    return new WP_Error($code, $message, ['status' => 500, 'retryable' => $retryable]);
}

function byline_editorial_notification_dedupe_token($value): string
{
    $value = byline_editorial_notification_safe_text($value, 120);
    $value = preg_replace('/[^a-zA-Z0-9._:-]/', '-', $value);
    return is_string($value) && $value !== '' ? $value : 'stable';
}

/** @return array<string,string> */
function byline_editorial_notification_visible_preference_labels(int $user_id): array
{
    if ($user_id <= 0 || !function_exists('user_can')) {
        return [];
    }

    $can_edit_newsroom = user_can($user_id, 'edit_posts')
        || user_can($user_id, 'edit_others_posts')
        || user_can($user_id, 'manage_byline');
    if (!$can_edit_newsroom) {
        return [];
    }

    $labels = [
        'storyAssignments' => 'Story assignments',
        'readyForReview' => 'Stories ready for review',
        'storyReturned' => 'Stories returned from review',
        'mediaAssignments' => 'Media assignments',
        'highPriorityTasks' => 'High-priority task assignments',
        'dueDigest' => 'Daily due/overdue task reminder',
    ];
    if (user_can($user_id, 'edit_others_posts') || user_can($user_id, 'manage_byline')) {
        $labels['publishingFailures'] = 'Public-site publication failures';
    }

    return $labels;
}

/**
 * Queue one private notification. Hook callers intentionally ignore failures
 * so email infrastructure can never block an editorial mutation.
 *
 * @return array|WP_Error|null
 */
function byline_editorial_notification_enqueue(
    string $event,
    int $recipient_id,
    int $story_id = 0,
    int $task_id = 0,
    string $dedupe_token = '',
    int $actor_id = 0
)
{
    $recipient_id = absint($recipient_id);
    $story_id = absint($story_id);
    $task_id = absint($task_id);
    $preference = byline_editorial_notification_preference_for_event($event);

    if ($recipient_id <= 0 || $preference === '' || !function_exists('byline_create_job')) {
        return null;
    }
    if (!byline_editorial_notification_is_enabled($recipient_id, $event)) {
        return null;
    }

    $payload = [
        'event' => $event,
        'recipientId' => $recipient_id,
    ];
    if ($story_id > 0) {
        $payload['storyId'] = $story_id;
    }
    if ($task_id > 0) {
        $payload['taskId'] = $task_id;
    }
    if ($dedupe_token !== '') {
        $payload['dedupeToken'] = byline_editorial_notification_dedupe_token($dedupe_token);
    }

    $target = $task_id > 0 ? 'task-' . $task_id : ($story_id > 0 ? 'story-' . $story_id : 'global');
    $idempotency = implode(':', [
        BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE,
        $event,
        $recipient_id,
        $target,
        byline_editorial_notification_dedupe_token($dedupe_token),
    ]);

    return byline_create_job(BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE, $payload, [
        'idempotencyKey' => $idempotency,
        'actorId' => absint($actor_id),
        'maxAttempts' => 3,
        'retryDelay' => 300,
    ]);
}

function byline_editorial_notification_story_can_be_viewed(int $user_id, int $story_id): bool
{
    if ($user_id <= 0 || $story_id <= 0 || !function_exists('user_can')) {
        return false;
    }

    $story = function_exists('get_post') ? get_post($story_id) : null;
    return $story instanceof WP_Post
        && (string) ($story->post_type ?? '') === 'post'
        && user_can($user_id, 'edit_post', $story_id);
}

function byline_editorial_notification_task_can_be_viewed(int $user_id, int $task_id, int $story_id): bool
{
    if ($user_id <= 0 || $task_id <= 0) {
        return false;
    }
    if (function_exists('byline_task_can_view')) {
        return (bool) byline_task_can_view($task_id, $user_id);
    }

    return byline_editorial_notification_story_can_be_viewed($user_id, $story_id);
}

/**
 * Delivery-time authorization is deliberately stricter than queue-time
 * authorization. Revoked editors receive neither content nor an error email.
 */
function byline_editorial_notification_can_deliver(int $user_id, array $payload): bool
{
    $event = (string) ($payload['event'] ?? '');
    if (!byline_editorial_notification_is_enabled($user_id, $event)) {
        return false;
    }

    $story_id = absint($payload['storyId'] ?? 0);
    $task_id = absint($payload['taskId'] ?? 0);
    if ($task_id > 0) {
        return byline_editorial_notification_task_can_be_viewed($user_id, $task_id, $story_id);
    }
    if ($story_id > 0) {
        return byline_editorial_notification_story_can_be_viewed($user_id, $story_id);
    }

    return function_exists('user_can')
        && (user_can($user_id, 'edit_others_posts') || user_can($user_id, 'manage_byline'));
}

function byline_editorial_notification_story_title(int $story_id): string
{
    $story = function_exists('get_post') ? get_post($story_id) : null;
    if (!$story instanceof WP_Post || (string) ($story->post_type ?? '') !== 'post') {
        return '';
    }

    $title = function_exists('get_the_title') ? get_the_title($story) : (string) ($story->post_title ?? '');
    return byline_editorial_notification_safe_text($title, 180);
}

function byline_editorial_notification_story_link(int $story_id): string
{
    if ($story_id <= 0) {
        return '';
    }
    if (function_exists('get_edit_post_link')) {
        $link = get_edit_post_link($story_id, 'raw');
        if (is_string($link) && $link !== '') {
            return $link;
        }
    }
    if (function_exists('admin_url')) {
        return admin_url('post.php?post=' . $story_id . '&action=edit');
    }
    return '';
}

function byline_editorial_notification_task_title(int $task_id): string
{
    if (function_exists('byline_get_task')) {
        $task = byline_get_task($task_id);
        return is_array($task) ? byline_editorial_notification_safe_text($task['title'] ?? '', 180) : '';
    }

    return '';
}

/** @return array<int,array<string,mixed>> */
function byline_editorial_notification_due_tasks(int $user_id): array
{
    if (!function_exists('get_posts') || !function_exists('byline_get_task')) {
        return [];
    }

    $now = function_exists('current_time') ? (int) current_time('timestamp', true) : time();
    $cutoff = $now + 86400;
    $posts = get_posts([
        'post_type' => defined('BYLINE_TASK_POST_TYPE') ? BYLINE_TASK_POST_TYPE : 'byline_task',
        'post_status' => 'private',
        'posts_per_page' => 200,
        'no_found_rows' => true,
    ]);
    $due = [];

    foreach (is_array($posts) ? $posts : [] as $post) {
        $task_id = absint(is_object($post) ? ($post->ID ?? 0) : 0);
        if ($task_id <= 0) {
            continue;
        }
        $task = byline_get_task($task_id);
        if (!is_array($task) || (string) ($task['state'] ?? '') !== 'open' || absint($task['assigneeId'] ?? 0) !== $user_id) {
            continue;
        }
        $due_at = strtotime((string) ($task['dueAt'] ?? ''));
        if ($due_at === false || $due_at > $cutoff || !byline_editorial_notification_task_can_be_viewed($user_id, $task_id, absint($task['storyId'] ?? 0))) {
            continue;
        }
        $task['_dueTimestamp'] = (int) $due_at;
        $due[] = $task;
    }

    usort($due, static function (array $left, array $right): int {
        return ((int) ($left['_dueTimestamp'] ?? 0)) <=> ((int) ($right['_dueTimestamp'] ?? 0));
    });

    return $due;
}

/** @return array{subject:string,body:string}|WP_Error */
function byline_editorial_notification_message(array $payload, WP_User $recipient)
{
    $event = (string) ($payload['event'] ?? '');
    $story_id = absint($payload['storyId'] ?? 0);
    $task_id = absint($payload['taskId'] ?? 0);
    $name = byline_editorial_notification_safe_text($recipient->display_name ?? '', 80);
    $greeting = $name !== '' ? "Hi {$name},\n\n" : '';

    if ($event === 'due-digest') {
        $tasks = byline_editorial_notification_due_tasks((int) $recipient->ID);
        if ($tasks === []) {
            return new WP_Error('byline_notification_empty_digest', 'There are no current due tasks.', ['status' => 200, 'skip' => true]);
        }
        $lines = [];
        foreach (array_slice($tasks, 0, 20) as $task) {
            $title = byline_editorial_notification_safe_text($task['title'] ?? 'Untitled task', 180);
            $story_title = byline_editorial_notification_story_title(absint($task['storyId'] ?? 0));
            $due_at = strtotime((string) ($task['dueAt'] ?? ''));
            $when = $due_at !== false && $due_at < time() ? 'overdue' : 'due soon';
            $suffix = $story_title !== '' ? ' — ' . $story_title : '';
            $lines[] = '- ' . $title . $suffix . ' (' . $when . ')';
        }
        $body = $greeting . 'You have ' . count($tasks) . " open Byline task(s) that are due soon or overdue.\n\n"
            . implode("\n", $lines) . "\n\nOpen Byline to review your work.\n";
        return ['subject' => 'Byline due-task reminder', 'body' => $body];
    }

    $story_title = $story_id > 0 ? byline_editorial_notification_story_title($story_id) : '';
    $story_link = $story_id > 0 ? byline_editorial_notification_story_link($story_id) : '';
    $task_title = $task_id > 0 ? byline_editorial_notification_task_title($task_id) : '';
    $subject = 'Byline editorial notification';
    $body = $greeting;

    switch ($event) {
        case 'story-assignment':
            $subject = 'Byline: story assigned to you';
            $body .= 'A story has been assigned to you' . ($story_title !== '' ? ': ' . $story_title : '.') . "\n";
            break;
        case 'ready-for-review':
            $subject = 'Byline: story ready for review';
            $body .= 'A story is ready for review' . ($story_title !== '' ? ': ' . $story_title : '.') . "\n";
            break;
        case 'media-assignment':
            $subject = 'Byline: media work assigned';
            $body .= 'Media work has been assigned to you' . ($story_title !== '' ? ' for ' . $story_title : '.') . "\n";
            break;
        case 'high-priority-task':
            $subject = 'Byline: high-priority task assigned';
            $body .= 'A high-priority task has been assigned to you' . ($task_title !== '' ? ': ' . $task_title : '.') . "\n";
            if ($story_title !== '') {
                $body .= 'Story: ' . $story_title . "\n";
            }
            break;
        case 'publishing-failure':
            $subject = 'Byline: publication needs attention';
            $body .= "A public-site publication attempt needs attention. Open Byline to review deployment status.\n";
            break;
        case 'story-returned':
            $subject = 'Byline: story returned for revision';
            $body .= 'A story was returned from review' . ($story_title !== '' ? ': ' . $story_title : '.') . "\n";
            break;
        default:
            return new WP_Error('byline_notification_invalid_event', 'The notification event is invalid.', ['status' => 400, 'retryable' => false]);
    }

    if ($story_link !== '') {
        $body .= "\nOpen story in WordPress: " . byline_editorial_notification_safe_text($story_link, 500) . "\n";
    } elseif ($event === 'publishing-failure' && function_exists('admin_url')) {
        $body .= "\nOpen Byline Home: " . byline_editorial_notification_safe_text(admin_url(), 500) . "\n";
    }

    return ['subject' => $subject, 'body' => $body];
}

function byline_editorial_notification_run_job(array $job)
{
    $payload = is_array($job['payload'] ?? null) ? $job['payload'] : [];
    $recipient_id = absint($payload['recipientId'] ?? 0);
    if ($recipient_id <= 0 || !function_exists('get_user_by')) {
        return ['skipped' => true, 'reason' => 'invalid-recipient'];
    }

    $recipient = get_user_by('id', $recipient_id);
    if (!$recipient instanceof WP_User || !byline_editorial_notification_can_deliver($recipient_id, $payload)) {
        return ['skipped' => true, 'reason' => 'permission-or-preference'];
    }

    $message = byline_editorial_notification_message($payload, $recipient);
    if (is_wp_error($message)) {
        $error_data = method_exists($message, 'get_error_data') ? $message->get_error_data() : [];
        return is_array($error_data) && !empty($error_data['skip'])
            ? ['skipped' => true, 'reason' => 'empty-digest']
            : $message;
    }
    $email = function_exists('sanitize_email') ? sanitize_email((string) ($recipient->user_email ?? '')) : (string) ($recipient->user_email ?? '');
    if ($email === '' || (function_exists('is_email') && !is_email($email))) {
        return byline_editorial_notification_error('byline_notification_invalid_email', 'The recipient email address is invalid.', false);
    }
    if (!function_exists('wp_mail')) {
        return byline_editorial_notification_error('byline_notification_mail_unavailable', 'The notification service is unavailable.', true);
    }

    try {
        if (!wp_mail($email, $message['subject'], $message['body'])) {
            return byline_editorial_notification_error('byline_notification_delivery_failed', 'The notification could not be delivered.', true);
        }
    } catch (Throwable $exception) {
        return byline_editorial_notification_error('byline_notification_delivery_failed', 'The notification could not be delivered.', true);
    }

    return ['delivered' => true];
}

function byline_editorial_notification_queue_due_digest(): void
{
    if (!function_exists('get_users')) {
        return;
    }

    $users = get_users(['number' => 200, 'fields' => 'ID']);
    $now = function_exists('current_time') ? (int) current_time('timestamp', true) : time();
    $bucket = gmdate('Y-m-d', $now);
    foreach (is_array($users) ? $users : [] as $user) {
        $user_id = absint(is_object($user) ? ($user->ID ?? 0) : $user);
        if ($user_id <= 0 || !byline_editorial_notification_is_enabled($user_id, 'due-digest')) {
            continue;
        }
        if (byline_editorial_notification_due_tasks($user_id) === []) {
            continue;
        }
        byline_editorial_notification_enqueue('due-digest', $user_id, 0, 0, $bucket);
    }
}

function byline_editorial_notification_schedule_digest(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_schedule_event')) {
        return;
    }
    if (!wp_next_scheduled(BYLINE_EDITORIAL_NOTIFICATION_DIGEST_HOOK)) {
        wp_schedule_event(time() + 300, 'daily', BYLINE_EDITORIAL_NOTIFICATION_DIGEST_HOOK);
    }
}

function byline_editorial_notification_on_story_updated(int $post_id, array $state, array $changes, array $previous_state = []): void
{
    $actor_id = byline_editorial_notification_current_user_id();
    $revision = (string) absint($state['revision'] ?? 0);
    if (array_key_exists('editorId', $changes)) {
        $recipient_id = absint($state['editorId'] ?? 0);
        if ($recipient_id > 0 && $recipient_id !== $actor_id) {
            byline_editorial_notification_enqueue('story-assignment', $recipient_id, $post_id, 0, $revision, $actor_id);
        }
    }
    if ((string) ($changes['status'] ?? '') === 'ready' && $post_id > 0) {
        $recipient_id = absint($state['editorId'] ?? 0);
        if ($recipient_id > 0 && $recipient_id !== $actor_id) {
            byline_editorial_notification_enqueue('ready-for-review', $recipient_id, $post_id, 0, $revision, $actor_id);
        }
    }

    $previous_status = sanitize_key((string) ($previous_state['storedStatus'] ?? ''));
    $next_status = sanitize_key((string) ($changes['status'] ?? ''));
    if ($previous_status !== 'ready' || $next_status === '' || $next_status === 'ready') {
        return;
    }

    $story = function_exists('get_post') ? get_post($post_id) : null;
    $recipient_id = $story instanceof WP_Post ? absint($story->post_author ?? 0) : 0;
    if ($recipient_id > 0 && $recipient_id !== $actor_id) {
        byline_editorial_notification_enqueue('story-returned', $recipient_id, $post_id, 0, $revision, $actor_id);
    }
}

function byline_editorial_notification_on_media_updated(int $post_id, $result, int $actor_id, array $context = []): void
{
    if (!is_array($result)) {
        return;
    }
    $recipient_id = absint($result['assigneeId'] ?? 0);
    $previous = is_array($context['previousRequest'] ?? null) ? $context['previousRequest'] : [];
    $previous_recipient_id = absint($previous['assigneeId'] ?? 0);
    if ($recipient_id <= 0 || $recipient_id === $previous_recipient_id || $recipient_id === absint($actor_id)) {
        return;
    }
    $modified_at = byline_editorial_notification_safe_text($result['modifiedAt'] ?? '', 80);
    $token = $modified_at !== ''
        ? 'assignee-' . $recipient_id . '-revision-' . byline_editorial_notification_dedupe_token($modified_at)
        : 'from-' . $previous_recipient_id . '-to-' . $recipient_id . '-status-' . byline_editorial_notification_dedupe_token($result['status'] ?? 'needed');
    byline_editorial_notification_enqueue('media-assignment', $recipient_id, $post_id, 0, $token, absint($actor_id));
}

function byline_editorial_notification_on_task_changed(int $task_id, $task, string $operation, array $changes = []): void
{
    if (!is_array($task) || !in_array($operation, ['created', 'changed'], true)) {
        return;
    }
    if ($operation === 'changed' && !array_key_exists('assigneeId', $changes) && !array_key_exists('assignee', $changes) && !array_key_exists('priority', $changes)) {
        return;
    }
    $priority = sanitize_key((string) ($task['priority'] ?? 'normal'));
    $recipient_id = absint($task['assigneeId'] ?? 0);
    $actor_id = byline_editorial_notification_current_user_id();
    if ($recipient_id <= 0 || $recipient_id === $actor_id || !in_array($priority, ['high', 'urgent'], true)) {
        return;
    }
    $token = (string) ($task['modifiedAt'] ?? $operation) . '-' . $recipient_id . '-' . $priority;
    byline_editorial_notification_enqueue(
        'high-priority-task',
        $recipient_id,
        absint($task['storyId'] ?? 0),
        $task_id,
        $token,
        $actor_id
    );
}

function byline_editorial_notification_on_build_failed(string $reason, $result): void
{
    if (!function_exists('get_users')) {
        return;
    }
    $bucket = gmdate('Y-m-d-H-i');
    $users = get_users(['number' => 200, 'fields' => 'ID']);
    $actor_id = byline_editorial_notification_current_user_id();
    foreach (is_array($users) ? $users : [] as $user) {
        $recipient_id = absint(is_object($user) ? ($user->ID ?? 0) : $user);
        if ($recipient_id <= 0 || $recipient_id === $actor_id || !function_exists('user_can')) {
            continue;
        }
        if (!user_can($recipient_id, 'edit_others_posts') && !user_can($recipient_id, 'manage_byline')) {
            continue;
        }
        byline_editorial_notification_enqueue('publishing-failure', $recipient_id, 0, 0, $bucket, $actor_id);
    }
}

/**
 * Preferences live on the native WordPress profile screen. They are not
 * exposed through the editorial REST surface or a separate Byline screen.
 */
function byline_editorial_notification_profile_fields(WP_User $user): void
{
    $preferences = byline_editorial_notification_preferences((int) $user->ID);
    $labels = byline_editorial_notification_visible_preference_labels((int) $user->ID);
    if ($labels === []) {
        return;
    }
    if (function_exists('wp_nonce_field')) {
        wp_nonce_field('byline_editorial_notification_preferences', 'byline_editorial_notification_nonce');
    }
    ?>
    <h2><?php echo esc_html('Byline notifications'); ?></h2>
    <p><?php echo esc_html('Choose which private editorial notifications Byline may send to your WordPress email address.'); ?></p>
    <table class="form-table" role="presentation">
        <tbody>
            <?php foreach ($labels as $key => $label) : ?>
                <tr>
                    <th scope="row"><?php echo esc_html($label); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="byline_editorial_notification_preferences[<?php echo esc_attr($key); ?>]" value="1" <?php checked(!empty($preferences[$key])); ?> />
                            <?php echo esc_html('Email me about this event'); ?>
                        </label>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

function byline_editorial_notification_save_profile(int $user_id): void
{
    $user_id = absint($user_id);
    if ($user_id <= 0 || !function_exists('current_user_can') || !current_user_can('edit_user', $user_id)) {
        return;
    }
    if (function_exists('wp_verify_nonce')) {
        $nonce = isset($_POST['byline_editorial_notification_nonce'])
            ? sanitize_text_field(wp_unslash($_POST['byline_editorial_notification_nonce']))
            : '';
        if (!wp_verify_nonce($nonce, 'byline_editorial_notification_preferences')) {
            return;
        }
    }
    if (!function_exists('update_user_meta')) {
        return;
    }

    $submitted = isset($_POST['byline_editorial_notification_preferences']) && is_array($_POST['byline_editorial_notification_preferences'])
        ? $_POST['byline_editorial_notification_preferences']
        : [];
    $preferences = [];
    foreach (byline_editorial_notification_preference_defaults() as $key => $default) {
        $preferences[$key] = !empty($submitted[$key]);
    }
    update_user_meta($user_id, BYLINE_EDITORIAL_NOTIFICATION_PREFS_META, $preferences);
}

if (function_exists('byline_register_job_handler')) {
    byline_register_job_handler(BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE, 'byline_editorial_notification_run_job');
}
if (function_exists('add_action')) {
    add_action('init', 'byline_editorial_notification_schedule_digest', 30);
    add_action(BYLINE_EDITORIAL_NOTIFICATION_DIGEST_HOOK, 'byline_editorial_notification_queue_due_digest');
    add_action('byline_editorial_story_updated', 'byline_editorial_notification_on_story_updated', 10, 4);
    add_action('byline_editorial_media_request_updated', 'byline_editorial_notification_on_media_updated', 10, 4);
    add_action('byline_editorial_task_changed', 'byline_editorial_notification_on_task_changed', 10, 4);
    add_action('byline_editorial_build_failed', 'byline_editorial_notification_on_build_failed', 10, 2);
    add_action('show_user_profile', 'byline_editorial_notification_profile_fields');
    add_action('edit_user_profile', 'byline_editorial_notification_profile_fields');
    add_action('personal_options_update', 'byline_editorial_notification_save_profile');
    add_action('edit_user_profile_update', 'byline_editorial_notification_save_profile');
}
