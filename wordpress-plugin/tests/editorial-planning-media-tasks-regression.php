<?php

/**
 * Standalone regression coverage for the private Planning, Media Desk, and
 * newsroom task domains. This intentionally uses a small WordPress-shaped
 * harness so it can run in CI without a WordPress database.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public int $ID = 0;
    public int $post_author = 1;
    public string $post_type = 'post';
    public string $post_status = 'draft';
    public string $post_title = '';
    public int $post_parent = 0;
    public int $menu_order = 0;
    public string $post_date_gmt = '';
    public string $post_modified_gmt = '';
}

class WP_User
{
    public int $ID = 0;
    public string $display_name = '';
}

class WP_Error
{
    public string $code;
    public string $message;
    public array $data;

    public function __construct(string $code = '', string $message = '', array $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }
}

$editorial_test_posts = [];
$editorial_test_meta = [];
$editorial_test_user_meta = [];
$editorial_test_users = [
    1 => ['name' => 'Editor', 'editor' => true, 'read_media' => true],
    2 => ['name' => 'Writer', 'editor' => false, 'read_media' => true],
    3 => ['name' => 'Second Writer', 'editor' => false, 'read_media' => true],
];
$editorial_test_current_user = 2;
$editorial_test_thumbnails = [];
$editorial_test_actions = [];
$editorial_test_registered_types = [];
$editorial_test_registered_meta = [];

function editorial_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function editorial_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        editorial_test_fail($message);
    }
}

function add_action(string $tag, $callback = null, ...$args): void
{
    global $editorial_test_actions;
    $editorial_test_actions[$tag][] = $callback;
}

function do_action(string $tag, ...$args): void
{
    global $editorial_test_actions;
    $editorial_test_actions['fired'][] = $tag;
}

function register_post_type(string $post_type, array $args = []): void
{
    global $editorial_test_registered_types;
    $editorial_test_registered_types[$post_type] = $args;
}

function register_post_meta(string $post_type, string $key, array $args = []): bool
{
    global $editorial_test_registered_meta;
    $editorial_test_registered_meta[$post_type][$key] = $args;
    return true;
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_text_field($value): string
{
    return trim(strip_tags((string) $value));
}

function sanitize_textarea_field($value): string
{
    return trim(strip_tags((string) $value));
}

function absint($value): int
{
    return abs((int) $value);
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('America/New_York');
}

function wp_timezone_string(): string
{
    return 'America/New_York';
}

function get_current_user_id(): int
{
    global $editorial_test_current_user;
    return $editorial_test_current_user;
}

function current_user_can(string $capability, ...$args): bool
{
    global $editorial_test_current_user;
    return editorial_test_user_can($editorial_test_current_user, $capability, ...$args);
}

function user_can($user, string $capability, ...$args): bool
{
    return editorial_test_user_can(absint($user), $capability, ...$args);
}

function editorial_test_user_can(int $user_id, string $capability, ...$args): bool
{
    global $editorial_test_users, $editorial_test_posts;
    $profile = $editorial_test_users[$user_id] ?? null;
    if (!$profile) {
        return false;
    }
    if ($capability === 'edit_posts') {
        return true;
    }
    if ($capability === 'edit_others_posts' || $capability === 'manage_options') {
        return !empty($profile['editor']);
    }
    if ($capability === 'edit_post') {
        $post_id = absint($args[0] ?? 0);
        $post = $editorial_test_posts[$post_id] ?? null;
        if ($post instanceof WP_Post && $post->post_type === 'attachment') {
            return !empty($profile['editor']) && !empty($profile['read_media']);
        }
        return $post instanceof WP_Post && ((int) $post->post_author === $user_id || !empty($profile['editor']));
    }
    if ($capability === 'read_post') {
        $post_id = absint($args[0] ?? 0);
        $post = $editorial_test_posts[$post_id] ?? null;
        return $post instanceof WP_Post && ($post->post_type !== 'attachment' || !empty($profile['read_media']));
    }
    return false;
}

function get_post($post_id)
{
    global $editorial_test_posts;
    return $editorial_test_posts[absint($post_id)] ?? null;
}

function get_post_type($post_id): string
{
    $post = get_post($post_id);
    return $post instanceof WP_Post ? $post->post_type : '';
}

function get_user_by(string $field, $value)
{
    global $editorial_test_users;
    $id = absint($value);
    if (!isset($editorial_test_users[$id])) {
        return false;
    }
    $user = new WP_User();
    $user->ID = $id;
    $user->display_name = $editorial_test_users[$id]['name'];
    return $user;
}

function get_user_meta(int $user_id, string $key, bool $single = false)
{
    global $editorial_test_user_meta;
    return $editorial_test_user_meta[$user_id][$key] ?? ($single ? '' : []);
}

function update_user_meta(int $user_id, string $key, $value): void
{
    global $editorial_test_user_meta;
    $editorial_test_user_meta[$user_id][$key] = $value;
}

function delete_user_meta(int $user_id, string $key): void
{
    global $editorial_test_user_meta;
    unset($editorial_test_user_meta[$user_id][$key]);
}

function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $editorial_test_meta;
    return $editorial_test_meta[$post_id][$key] ?? ($single ? '' : []);
}

function metadata_exists(string $type, int $object_id, string $key): bool
{
    global $editorial_test_meta;
    return isset($editorial_test_meta[$object_id]) && array_key_exists($key, $editorial_test_meta[$object_id]);
}

function update_post_meta(int $post_id, string $key, $value): void
{
    global $editorial_test_meta;
    $editorial_test_meta[$post_id][$key] = $value;
}

function delete_post_meta(int $post_id, string $key): void
{
    global $editorial_test_meta;
    unset($editorial_test_meta[$post_id][$key]);
}

function has_post_thumbnail(int $post_id): bool
{
    global $editorial_test_thumbnails;
    return !empty($editorial_test_thumbnails[$post_id]);
}

function get_post_thumbnail_id(int $post_id): int
{
    global $editorial_test_thumbnails;
    return absint($editorial_test_thumbnails[$post_id] ?? 0);
}

function wp_attachment_is_image(int $attachment_id): bool
{
    return $attachment_id === 100;
}

function wp_get_attachment_image_alt(int $attachment_id): string
{
    return (string) get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
}

function wp_get_attachment_metadata(int $attachment_id): array
{
    return (array) get_post_meta($attachment_id, '_wp_attachment_metadata', true);
}

function wp_get_attachment_url(int $attachment_id): string
{
    return 'https://media.example.test/' . $attachment_id . '.jpg';
}

function wp_get_attachment_image_src(int $attachment_id, string $size): array
{
    return ['https://media.example.test/' . $attachment_id . '-' . $size . '.jpg', 640, 360, true];
}

function set_post_thumbnail(int $post_id, int $attachment_id): bool
{
    global $editorial_test_thumbnails;
    $editorial_test_thumbnails[$post_id] = $attachment_id;
    return true;
}

function delete_post_thumbnail(int $post_id): bool
{
    global $editorial_test_thumbnails;
    unset($editorial_test_thumbnails[$post_id]);
    return true;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $editorial_test_posts;
    $id = $editorial_test_posts === [] ? 1 : max(array_keys($editorial_test_posts)) + 1;
    $post = new WP_Post();
    $post->ID = $id;
    $post->post_type = (string) ($data['post_type'] ?? 'post');
    $post->post_status = (string) ($data['post_status'] ?? 'draft');
    $post->post_title = (string) ($data['post_title'] ?? '');
    $post->post_author = absint($data['post_author'] ?? get_current_user_id());
    $post->menu_order = absint($data['menu_order'] ?? 0);
    $post->post_parent = absint($data['post_parent'] ?? 0);
    $editorial_test_posts[$id] = $post;
    return $id;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    $post = get_post(absint($data['ID'] ?? 0));
    if (!$post instanceof WP_Post) {
        return 0;
    }
    if (array_key_exists('post_title', $data)) {
        $post->post_title = (string) $data['post_title'];
    }
    return $post->ID;
}

function wp_delete_post(int $post_id, bool $force = false)
{
    global $editorial_test_posts;
    if (!isset($editorial_test_posts[$post_id])) {
        return false;
    }
    unset($editorial_test_posts[$post_id]);
    return (object) ['ID' => $post_id];
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

function current_time(string $type, bool $gmt = false): string
{
    return $type === 'Y-m-d' ? gmdate('Y-m-d') : gmdate('Y-m-d H:i:s');
}

function get_the_title(int $post_id): string
{
    $post = get_post($post_id);
    return $post instanceof WP_Post ? $post->post_title : '';
}

function get_edit_post_link(int $post_id, string $context = ''): string
{
    return 'https://cms.example.test/wp-admin/post.php?post=' . $post_id . '&action=edit';
}

function editorial_test_compare_meta(int $post_id, array $clause): bool
{
    if (isset($clause['relation'])) {
        $relation = strtoupper((string) $clause['relation']);
        $results = [];
        foreach ($clause as $key => $nested) {
            if ($key === 'relation' || !is_array($nested)) {
                continue;
            }
            $results[] = editorial_test_compare_meta($post_id, $nested);
        }
        return $relation === 'OR' ? in_array(true, $results, true) : !in_array(false, $results, true);
    }
    $key = (string) ($clause['key'] ?? '');
    $exists = metadata_exists('post', $post_id, $key);
    $actual = (string) get_post_meta($post_id, $key, true);
    $value = (string) ($clause['value'] ?? '');
    $compare = strtoupper((string) ($clause['compare'] ?? '='));
    if ($compare === 'NOT EXISTS') {
        return !$exists;
    }
    if (!$exists) {
        return false;
    }
    switch ($compare) {
        case '=':
            return $actual === $value;
        case '<':
            return $actual < $value;
        case '<=':
            return $actual <= $value;
        case '>=':
            return $actual >= $value;
        case 'LIKE':
            return strpos($actual, $value) !== false;
        default:
            return true;
    }
}

function get_posts(array $args = []): array
{
    global $editorial_test_posts;
    $posts = [];
    $types = (array) ($args['post_type'] ?? 'post');
    $statuses = (array) ($args['post_status'] ?? []);
    foreach ($editorial_test_posts as $post) {
        if (!in_array($post->post_type, $types, true)) {
            continue;
        }
        if ($statuses !== [] && !in_array($post->post_status, $statuses, true)) {
            continue;
        }
        if (isset($args['author']) && (int) $post->post_author !== absint($args['author'])) {
            continue;
        }
        if (isset($args['post_parent']) && (int) ($post->post_parent ?? 0) !== absint($args['post_parent'])) {
            continue;
        }
        $matches = true;
        foreach ((array) ($args['meta_query'] ?? []) as $key => $clause) {
            if ($key === 'relation' || !is_array($clause) || !editorial_test_compare_meta($post->ID, $clause)) {
                if ($key !== 'relation' && is_array($clause)) {
                    $matches = false;
                    break;
                }
            }
        }
        if ($matches) {
            $posts[] = $post;
        }
    }
    return array_slice($posts, absint($args['offset'] ?? 0), absint($args['posts_per_page'] ?? 200));
}

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/editorial/planning.php';
require __DIR__ . '/../includes/editorial/media.php';
require __DIR__ . '/../includes/editorial/readiness.php';
require __DIR__ . '/../includes/editorial/tasks.php';

$story = new WP_Post();
$story->ID = 10;
$story->post_author = 2;
$story->post_title = 'A planning story';
$story->post_status = 'draft';
$story->post_date_gmt = '2026-08-20 12:00:00';
$story->post_modified_gmt = '2026-08-28 12:00:00';
$editorial_test_posts[10] = $story;
$other_story = new WP_Post();
$other_story->ID = 11;
$other_story->post_author = 3;
$other_story->post_title = 'Private other story';
$editorial_test_posts[11] = $other_story;
$attachment = new WP_Post();
$attachment->ID = 100;
$attachment->post_type = 'attachment';
$editorial_test_posts[100] = $attachment;
$editorial_test_meta[10]['_wwh_story_visuals'] = "Need crowd photo <script>alert(1)</script>";

// Planning target is canonical UTC metadata and does not mutate post_date.
$before_date = $story->post_date_gmt;
byline_set_editorial_planned_publish_at(10, '2026-08-29T09:00');
editorial_test_assert(byline_get_editorial_planned_publish_at(10) === '2026-08-29T13:00:00Z', 'Planned publication did not normalize in the site timezone.');
editorial_test_assert($story->post_date_gmt === $before_date, 'Planned publication mutated the WordPress post date.');

// Collection data is capability-filtered; the writer cannot receive another
// author's private planning row even when the query can find it.
byline_set_editorial_status(10, 'reporting');
$planning = byline_editorial_get_planning_collection(['limit' => 20], 2);
editorial_test_assert(count($planning['items']) === 1 && $planning['items'][0]['id'] === 10, 'Planning collection leaked or omitted an editable story.');
$planning_other = byline_editorial_get_planning_collection([], 3);
editorial_test_assert(count($planning_other['items']) === 1 && $planning_other['items'][0]['id'] === 11, 'Planning permission filtering did not follow post ownership.');

// Saved views are isolated to the current account.
$view = byline_editorial_save_saved_view(['name' => 'Mine', 'filters' => ['mine' => true]], 2);
editorial_test_assert(is_array($view) && $view['name'] === 'Mine', 'Could not save a personal Planning view.');
$editorial_test_current_user = 3;
editorial_test_assert(byline_editorial_get_saved_views() === [], 'Saved views leaked between user accounts.');
editorial_test_assert(byline_editorial_update_saved_view($view['id'], ['name' => 'Stolen']) instanceof WP_Error, 'A user could update another account\'s saved view.');
$editorial_test_current_user = 2;
editorial_test_assert(byline_editorial_update_saved_view($view['id'], ['name' => 'Updated'], 2)['name'] === 'Updated', 'A user could not update their own saved view.');
editorial_test_assert(byline_editorial_delete_saved_view($view['id'], 2), 'A user could not delete their own saved view.');

// Structured media preserves the legacy note and sanitizes the structured one.
$media = byline_get_editorial_media_request(10);
editorial_test_assert($media['isLegacy'] === true && strpos($media['notes'], '<script>') === false, 'Legacy visual notes were not safely exposed as a fallback.');
$assigned = byline_set_editorial_media_request(10, ['type' => 'photo', 'assigneeId' => 2], 2);
editorial_test_assert(is_array($assigned) && $assigned['status'] === 'assigned', 'Assigning a media request did not reconcile it to assigned.');
$media = byline_set_editorial_media_request(10, [
    'type' => 'photo',
    'status' => 'needed',
    'assigneeId' => 2,
    'dueAt' => '2026-08-30T10:00',
    'notes' => 'Use <b>the field</b>',
    'attachmentIds' => [100, 100],
], 2);
editorial_test_assert(is_array($media) && $media['attachmentIds'] === [100] && $media['status'] === 'uploaded' && strpos($media['notes'], '<b>') === false, 'Structured media request did not sanitize, deduplicate, or reconcile linked attachments.');
editorial_test_assert(get_post_meta(10, '_wwh_story_visuals', true) !== '', 'Structured media editing destroyed the legacy visual-needs field.');
editorial_test_assert(byline_set_editorial_media_request(10, ['status' => 'in-progress'], 2)['attachmentIds'] === [100], 'A partial media update discarded linked attachments.');
$before_invalid_media = get_post_meta(10, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
$invalid_media = byline_set_editorial_media_request(10, ['attachmentIds' => [999, 10]], 2);
editorial_test_assert(is_wp_error($invalid_media) && $invalid_media->code === 'byline_editorial_media_invalid_attachment', 'Invalid or non-attachment media IDs were accepted.');
editorial_test_assert(get_post_meta(10, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true) === $before_invalid_media, 'An invalid media update partially changed the request.');
$invalid_reconciliation = byline_editorial_reconcile_media_request_status(10, ['type' => 'photo', 'status' => 'needed', 'attachmentIds' => [999]], ['userId' => 2]);
editorial_test_assert(is_wp_error($invalid_reconciliation) && $invalid_reconciliation->code === 'byline_editorial_media_invalid_attachment', 'The central media status reconciler silently discarded an invalid attachment.');

$non_image_attachment = new WP_Post();
$non_image_attachment->ID = 101;
$non_image_attachment->post_type = 'attachment';
$non_image_attachment->post_title = 'Scoreboard video';
$editorial_test_posts[101] = $non_image_attachment;
$linked_extra = byline_editorial_link_media_request_attachment(10, 101, 2);
editorial_test_assert(is_array($linked_extra) && $linked_extra['attachmentIds'] === [100, 101] && $linked_extra['status'] === 'uploaded', 'Linking a second Media Library item did not reconcile the request to uploaded.');
$unlinked_extra = byline_editorial_unlink_media_request_attachment(10, 101, 2);
editorial_test_assert(is_array($unlinked_extra) && $unlinked_extra['attachmentIds'] === [100], 'Unlinking one media item removed the wrong attachments.');
editorial_test_assert(byline_set_editorial_media_request(10, ['type' => 'photo', 'assigneeId' => 3], 2) instanceof WP_Error, 'A writer could assign media work to another user.');
$editorial_test_current_user = 1;
editorial_test_assert(is_array(byline_set_editorial_media_request(10, ['type' => 'photo', 'status' => 'selected', 'assigneeId' => 3, 'attachmentIds' => [100]], 1)), 'An editor could not assign structured media work.');
editorial_test_assert(!is_wp_error(byline_editorial_set_media_request_featured_image(10, 100, 1)) && get_post_thumbnail_id(10) === 100 && byline_get_editorial_media_request(10)['status'] === 'selected', 'A linked media item could not become the featured image or selected state.');
editorial_test_assert(is_array(byline_editorial_complete_media_request(10, 1)) && byline_get_editorial_media_request(10)['status'] === 'done', 'Explicit media completion did not persist the done state.');

$readiness_before_metadata = byline_get_story_readiness(10);
$readiness_media = [];
foreach ($readiness_before_metadata['checks'] as $check) {
    $readiness_media[$check['id']] = $check;
}
editorial_test_assert($readiness_media['visual-requirement']['status'] === 'pass', 'A completed media request did not satisfy visual readiness.');
editorial_test_assert($readiness_media['media-attachment-alt']['status'] === 'warning' && $readiness_media['media-attachment-credit']['status'] === 'warning' && $readiness_media['media-attachment-rights']['status'] === 'warning', 'Media readiness did not surface missing attachment metadata.');
update_post_meta(100, '_wp_attachment_image_alt', 'Students at the field');
update_post_meta(100, '_ww_image_credit_text', 'Newsroom photo');
update_post_meta(100, '_ww_image_copyright_notice', '© Byline');
$readiness_after_metadata = byline_get_editorial_media_request(10);
editorial_test_assert($readiness_after_metadata['mediaReadiness']['ready'] === true, 'Media readiness did not reuse the canonical attachment credit, alt, and rights fields.');
$stored_media = get_post_meta(10, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
$corrupt_media = $stored_media;
$corrupt_media['attachmentIds'] = [100, 999];
update_post_meta(10, BYLINE_EDITORIAL_MEDIA_REQUEST_META, $corrupt_media);
$invalid_readiness = byline_get_story_readiness(10);
$invalid_readiness_by_id = [];
foreach ($invalid_readiness['checks'] as $check) {
    $invalid_readiness_by_id[$check['id']] = $check;
}
editorial_test_assert($invalid_readiness_by_id['media-invalid-attachment']['status'] === 'warning' && $invalid_readiness_by_id['visual-requirement']['status'] === 'warning', 'Readiness did not detect an invalid attachment left in stored media state.');
update_post_meta(10, BYLINE_EDITORIAL_MEDIA_REQUEST_META, $stored_media);

$unlinked_featured = byline_editorial_unlink_media_request_attachment(10, 100, 1);
editorial_test_assert(is_array($unlinked_featured) && $unlinked_featured['attachmentIds'] === [] && $unlinked_featured['status'] === 'assigned' && get_post_thumbnail_id(10) === 0, 'Unlinking the featured attachment did not clear the thumbnail or reopen the request.');
$linked_non_image = byline_editorial_link_media_request_attachment(10, 101, 1);
editorial_test_assert(is_array($linked_non_image) && byline_editorial_set_media_request_featured_image(10, 101, 1) instanceof WP_Error, 'A non-image attachment could be featured.');
byline_editorial_unlink_media_request_attachment(10, 101, 1);
$editorial_test_current_user = 3;
editorial_test_assert(byline_set_editorial_media_request(10, ['attachmentIds' => [100]], 3) instanceof WP_Error, 'A user without story edit capability could change media links.');
$editorial_test_users[3]['read_media'] = false;
editorial_test_assert(!byline_editorial_media_attachment_is_allowed(100, 10, 3), 'A user without normal attachment read capability could link Media Library content.');
$editorial_test_users[3]['read_media'] = true;
$editorial_test_current_user = 2;

// Linked tasks follow story capabilities; unlinked newsroom work and cross-user
// assignment remain editor-only.
$editorial_test_current_user = 2;
$task = byline_create_task([
    'title' => 'Check the scoreboard <script>',
    'storyId' => 10,
    'assigneeId' => 2,
    'priority' => 'high',
    'dueAt' => '2026-08-31T12:00',
    'order' => 4,
], 2);
editorial_test_assert(is_array($task) && strpos($task['title'], '<script>') === false && $task['storyId'] === 10, 'A linked newsroom task was not stored safely.');
editorial_test_assert(byline_create_task(['title' => 'Unlinked'], 2) instanceof WP_Error, 'A writer could create an unlinked newsroom task.');
editorial_test_assert(byline_update_task($task['id'], ['assigneeId' => 3], 2) instanceof WP_Error, 'A writer could reassign a task to another user.');
editorial_test_assert(byline_complete_task($task['id'], 2)['state'] === 'completed', 'A writer could not complete a task linked to their story.');
editorial_test_assert(byline_complete_task($task['id'], 2)['state'] === 'completed', 'Completing a task was not idempotent.');
editorial_test_assert(byline_reopen_task($task['id'], 2)['state'] === 'open', 'A completed task could not be reopened.');
editorial_test_assert(byline_task_count_for_story(10, 2) === 1, 'Open task count was incorrect.');
$editorial_test_current_user = 3;
editorial_test_assert(!byline_task_can_view($task['id'], 3), 'A user without story access could view the linked task.');
$editorial_test_current_user = 1;
editorial_test_assert(is_array(byline_create_task(['title' => 'Newsroom-wide', 'priority' => 'urgent'], 1)), 'An editor could not create an unlinked task.');
editorial_test_assert(byline_delete_task($task['id'], 1) === true, 'An editor could not delete a task.');

// Internal registration is private and hidden from native/public REST surfaces.
byline_task_register_post_type();
byline_task_register_meta();
editorial_test_assert(($editorial_test_registered_types[BYLINE_TASK_POST_TYPE]['public'] ?? true) === false, 'Task CPT is publicly queryable.');
foreach ($editorial_test_registered_meta[BYLINE_TASK_POST_TYPE] as $args) {
    editorial_test_assert(($args['show_in_rest'] ?? true) === false, 'Task metadata became visible through native REST.');
}

echo "Editorial planning/media/tasks regression passed.\n";
