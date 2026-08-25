<?php

if (!defined('ABSPATH')) {
    exit;
}

const WWH_DISCORD_USER_ID_META = '_wwh_discord_user_id';
const WWH_DISCORD_USERNAME_META = '_wwh_discord_username';
const WWH_STORY_STATUS_META = '_wwh_story_status';
const WWH_STORY_EDITOR_META = '_wwh_story_editor_user_id';
const WWH_STORY_DEADLINE_META = '_wwh_story_deadline';
const WWH_STORY_VISUALS_META = '_wwh_story_visuals';
const WWH_DISCORD_THREAD_META = '_wwh_discord_thread_id';
const WWH_DISCORD_CARD_META = '_wwh_discord_card_message_id';
const WWH_DISCORD_PUBLISH_META = '_wwh_discord_publish_message_id';
const WWH_DISCORD_ANNOUNCEMENT_META = '_wwh_discord_announcement_message_id';
const WWH_DISCORD_LAST_SYNC_META = '_wwh_discord_last_sync_at';
const WWH_DISCORD_LAST_ERROR_META = '_wwh_discord_last_sync_error';
const WWH_DISCORD_FINGERPRINT_META = '_wwh_discord_sync_fingerprint';
const WWH_DISCORD_SYNC_EVENT = 'wwh_discord_sync_story';

function wwh_discord_config(string $name): string
{
    if (defined($name) && is_string(constant($name))) {
        return trim((string) constant($name));
    }
    $value = getenv($name);
    return is_string($value) ? trim($value) : '';
}

function wwh_discord_statuses(): array
{
    return ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published'];
}

function wwh_discord_sanitize_snowflake($value): string
{
    $value = trim((string) $value);
    return preg_match('/^[1-9][0-9]{16,21}$/', $value) === 1 ? $value : '';
}

function wwh_discord_sanitize_status($value): string
{
    $status = sanitize_key((string) $value);
    return in_array($status, wwh_discord_statuses(), true) ? $status : 'pitch';
}

function wwh_discord_sanitize_deadline($value): string
{
    $value = trim((string) $value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value ? $value : '';
}

function wwh_discord_register_meta(): void
{
    $string_meta = [
        WWH_STORY_STATUS_META => 'wwh_discord_sanitize_status',
        WWH_STORY_DEADLINE_META => 'wwh_discord_sanitize_deadline',
        WWH_STORY_VISUALS_META => 'sanitize_textarea_field',
        WWH_DISCORD_THREAD_META => 'wwh_discord_sanitize_snowflake',
        WWH_DISCORD_CARD_META => 'wwh_discord_sanitize_snowflake',
        WWH_DISCORD_PUBLISH_META => 'wwh_discord_sanitize_snowflake',
        WWH_DISCORD_ANNOUNCEMENT_META => 'wwh_discord_sanitize_snowflake',
        WWH_DISCORD_LAST_SYNC_META => 'sanitize_text_field',
        WWH_DISCORD_LAST_ERROR_META => 'sanitize_text_field',
    ];
    foreach ($string_meta as $key => $sanitize) {
        register_post_meta('post', $key, [
            'single' => true,
            'type' => 'string',
            'sanitize_callback' => $sanitize,
            'show_in_rest' => false,
            'auth_callback' => static fn() => current_user_can('edit_posts'),
        ]);
    }
    register_post_meta('post', WWH_STORY_EDITOR_META, [
        'single' => true,
        'type' => 'integer',
        'sanitize_callback' => 'absint',
        'show_in_rest' => false,
        'auth_callback' => static fn() => current_user_can('edit_others_posts'),
    ]);
    foreach ([WWH_DISCORD_USER_ID_META => 'wwh_discord_sanitize_snowflake', WWH_DISCORD_USERNAME_META => 'sanitize_text_field'] as $key => $sanitize) {
        register_user_meta('', $key, [
            'single' => true,
            'type' => 'string',
            'sanitize_callback' => $sanitize,
            'show_in_rest' => false,
            'auth_callback' => static fn() => current_user_can('edit_user', get_current_user_id()),
        ]);
    }
}
add_action('init', 'wwh_discord_register_meta');

function wwh_discord_signature_payload(string $timestamp, string $method, string $path, string $body): string
{
    return $timestamp . "\n" . strtoupper($method) . "\n" . $path . "\n" . $body;
}

function wwh_discord_sign(string $timestamp, string $method, string $path, string $body, string $secret): string
{
    return hash_hmac('sha256', wwh_discord_signature_payload($timestamp, $method, $path, $body), $secret);
}

function wwh_discord_verify_signature_values(string $timestamp, string $signature, string $method, string $path, string $body, string $secret, ?int $now = null): bool
{
    if ($secret === '' || preg_match('/^[0-9]{10}$/', $timestamp) !== 1 || preg_match('/^[a-f0-9]{64}$/i', $signature) !== 1) {
        return false;
    }
    $now = $now ?? time();
    if (abs($now - (int) $timestamp) > 300) {
        return false;
    }
    return hash_equals(wwh_discord_sign($timestamp, $method, $path, $body, $secret), strtolower($signature));
}

function wwh_discord_rest_permission(WP_REST_Request $request)
{
    $valid = wwh_discord_verify_signature_values(
        (string) $request->get_header('x-wwh-timestamp'),
        (string) $request->get_header('x-wwh-signature'),
        $request->get_method(),
        $request->get_route(),
        $request->get_body(),
        wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET')
    );
    return $valid ? true : new WP_Error('wwh_discord_unauthorized', 'Invalid or stale bridge signature.', ['status' => 401]);
}

function wwh_discord_story(int $post_id): array
{
    $post = get_post($post_id);
    if (!$post instanceof WP_Post || $post->post_type !== 'post') {
        return [];
    }
    $writer = get_user_by('id', (int) $post->post_author);
    $editor_id = absint(get_post_meta($post_id, WWH_STORY_EDITOR_META, true));
    $editor = $editor_id ? get_user_by('id', $editor_id) : false;
    $categories = get_the_category($post_id);
    $featured_id = get_post_thumbnail_id($post_id);
    $status = $post->post_status === 'publish' ? 'published' : wwh_discord_sanitize_status(get_post_meta($post_id, WWH_STORY_STATUS_META, true) ?: 'pitch');
    return [
        'id' => $post_id,
        'title' => get_the_title($post_id),
        'status' => $status,
        'postStatus' => $post->post_status,
        'writer' => wwh_discord_user_summary($writer),
        'editor' => wwh_discord_user_summary($editor),
        'deadline' => wwh_discord_sanitize_deadline(get_post_meta($post_id, WWH_STORY_DEADLINE_META, true)),
        'section' => $categories ? (string) $categories[0]->name : '',
        'visuals' => sanitize_textarea_field((string) get_post_meta($post_id, WWH_STORY_VISUALS_META, true)),
        'wordpressUrl' => get_edit_post_link($post_id, 'raw') ?: admin_url('post.php?post=' . $post_id . '&action=edit'),
        'publicUrl' => $post->post_status === 'publish' ? get_permalink($post_id) : '',
        'featuredImageUrl' => $featured_id ? (wp_get_attachment_image_url($featured_id, 'large') ?: '') : '',
        'discord' => [
            'threadId' => (string) get_post_meta($post_id, WWH_DISCORD_THREAD_META, true),
            'cardMessageId' => (string) get_post_meta($post_id, WWH_DISCORD_CARD_META, true),
            'publishMessageId' => (string) get_post_meta($post_id, WWH_DISCORD_PUBLISH_META, true),
            'announcementMessageId' => (string) get_post_meta($post_id, WWH_DISCORD_ANNOUNCEMENT_META, true),
        ],
        'updatedAt' => get_post_modified_time(DATE_ATOM, true, $post_id),
    ];
}

function wwh_discord_user_summary($user): ?array
{
    if (!$user instanceof WP_User) {
        return null;
    }
    return [
        'id' => (int) $user->ID,
        'name' => $user->display_name,
        'discordUserId' => (string) get_user_meta($user->ID, WWH_DISCORD_USER_ID_META, true),
    ];
}

function wwh_discord_find_post_by_thread(string $thread_id): int
{
    $thread_id = wwh_discord_sanitize_snowflake($thread_id);
    if ($thread_id === '') {
        return 0;
    }
    $posts = get_posts(['post_type' => 'post', 'post_status' => 'any', 'fields' => 'ids', 'numberposts' => 1, 'meta_key' => WWH_DISCORD_THREAD_META, 'meta_value' => $thread_id]);
    return $posts ? absint($posts[0]) : 0;
}

function wwh_discord_actor(string $discord_id)
{
    $discord_id = wwh_discord_sanitize_snowflake($discord_id);
    if ($discord_id === '') {
        return new WP_Error('wwh_account_unlinked', "This Discord account isn't connected to a Weekly Wildcat account yet.", ['status' => 403]);
    }
    $users = get_users(['meta_key' => WWH_DISCORD_USER_ID_META, 'meta_value' => $discord_id, 'number' => 1]);
    return $users && $users[0] instanceof WP_User ? $users[0] : new WP_Error('wwh_account_unlinked', "This Discord account isn't connected to a Weekly Wildcat account yet.", ['status' => 403]);
}

function wwh_discord_capability(WP_User $user, string $capability, int $post_id = 0): bool
{
    return user_can($user, $capability, ...($post_id ? [$post_id] : []));
}

function wwh_discord_rest_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    if (!$post_id) {
        $post_id = wwh_discord_find_post_by_thread((string) $request->get_param('threadId'));
    }
    if ($request->get_param('actorDiscordUserId')) {
        $actor = wwh_discord_actor((string) $request->get_param('actorDiscordUserId'));
        if (is_wp_error($actor)) return $actor;
        if (!$post_id || !wwh_discord_capability($actor, 'edit_post', $post_id)) return new WP_Error('wwh_forbidden', 'Your Weekly Wildcat account cannot view this story.', ['status' => 403]);
    }
    $story = wwh_discord_story($post_id);
    return $story ? rest_ensure_response($story) : new WP_Error('wwh_story_not_found', 'This thread is not linked to a WordPress story.', ['status' => 404]);
}

function wwh_discord_rest_create_story(WP_REST_Request $request)
{
    $data = $request->get_json_params();
    $thread_id = wwh_discord_sanitize_snowflake($data['threadId'] ?? '');
    if ($thread_id === '') return new WP_Error('wwh_invalid_thread', 'A valid Discord thread is required.', ['status' => 400]);
    $actor = wwh_discord_actor((string) ($data['actorDiscordUserId'] ?? ''));
    if (is_wp_error($actor)) {
        return $actor;
    }
    if (!wwh_discord_capability($actor, 'edit_posts')) {
        return new WP_Error('wwh_forbidden', 'Your Weekly Wildcat account cannot create stories.', ['status' => 403]);
    }
    $existing_id = wwh_discord_find_post_by_thread($thread_id);
    if ($existing_id) {
        return rest_ensure_response(['created' => false, 'story' => wwh_discord_story($existing_id)]);
    }
    $lock_key = 'wwh_discord_create_' . hash('sha256', $thread_id);
    $lock_acquired = add_option($lock_key, time(), '', false);
    if (!$lock_acquired && absint(get_option($lock_key, 0)) < time() - 60) {
        delete_option($lock_key);
        $lock_acquired = add_option($lock_key, time(), '', false);
    }
    if (!$lock_acquired) return new WP_Error('wwh_create_in_progress', 'This pitch is already being promoted. Please try again.', ['status' => 409]);
    $existing_id = wwh_discord_find_post_by_thread($thread_id);
    if ($existing_id) {
        delete_option($lock_key);
        return rest_ensure_response(['created' => false, 'story' => wwh_discord_story($existing_id)]);
    }
    $request_id = sanitize_key((string) $request->get_header('x-wwh-request-id'));
    if ($request_id !== '') {
        $prior_id = absint(get_transient('wwh_discord_request_' . $request_id));
        if ($prior_id) {
            delete_option($lock_key);
            return rest_ensure_response(['created' => false, 'story' => wwh_discord_story($prior_id)]);
        }
    }
    $post_id = wp_insert_post([
        'post_type' => 'post',
        'post_status' => 'draft',
        'post_title' => sanitize_text_field((string) ($data['title'] ?? 'Untitled story')),
        'post_author' => (int) $actor->ID,
    ], true);
    if (is_wp_error($post_id)) {
        delete_option($lock_key);
        return $post_id;
    }
    update_post_meta($post_id, WWH_DISCORD_THREAD_META, $thread_id);
    update_post_meta($post_id, WWH_STORY_STATUS_META, 'pitch');
    if ($request_id !== '') {
        set_transient('wwh_discord_request_' . $request_id, $post_id, DAY_IN_SECONDS);
    }
    delete_option($lock_key);
    return new WP_REST_Response(['created' => true, 'story' => wwh_discord_story($post_id)], 201);
}

function wwh_discord_rest_update_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $story = wwh_discord_story($post_id);
    if (!$story) {
        return new WP_Error('wwh_story_not_found', 'Story not found.', ['status' => 404]);
    }
    $data = $request->get_json_params();
    $operation = sanitize_key((string) ($data['operation'] ?? ''));
    if ($operation === 'discord-sync') {
        if (isset($data['title'])) {
            $title = sanitize_text_field((string) $data['title']);
            if ($title !== '' && $title !== $story['title']) {
                wp_update_post(['ID' => $post_id, 'post_title' => $title]);
            }
        }
        if (isset($data['status'])) {
            $status = wwh_discord_sanitize_status($data['status']);
            if ($status !== 'published' && $status !== $story['status']) {
                update_post_meta($post_id, WWH_STORY_STATUS_META, $status);
            }
        }
        return rest_ensure_response(wwh_discord_story($post_id));
    }
    $actor = wwh_discord_actor((string) ($data['actorDiscordUserId'] ?? ''));
    if (is_wp_error($actor)) {
        return $actor;
    }
    $editor_operations = ['assign', 'deadline', 'unlink'];
    $capability = in_array($operation, $editor_operations, true) ? 'edit_others_posts' : 'edit_post';
    if (!wwh_discord_capability($actor, $capability, $post_id)) {
        return new WP_Error('wwh_forbidden', 'Your Weekly Wildcat account cannot make that change.', ['status' => 403]);
    }
    if ($operation === 'status') {
        $status = wwh_discord_sanitize_status($data['status'] ?? '');
        if ($status === 'published') {
            return new WP_Error('wwh_invalid_status', 'Published follows the WordPress publication state.', ['status' => 400]);
        }
        update_post_meta($post_id, WWH_STORY_STATUS_META, $status);
    } elseif ($operation === 'headline') {
        wp_update_post(['ID' => $post_id, 'post_title' => sanitize_text_field((string) ($data['title'] ?? ''))]);
    } elseif ($operation === 'deadline') {
        $deadline = wwh_discord_sanitize_deadline($data['deadline'] ?? '');
        if ($deadline === '') {
            return new WP_Error('wwh_invalid_deadline', 'Use a valid date in YYYY-MM-DD format.', ['status' => 400]);
        }
        update_post_meta($post_id, WWH_STORY_DEADLINE_META, $deadline);
    } elseif ($operation === 'assign') {
        $target = wwh_discord_actor((string) ($data['targetDiscordUserId'] ?? ''));
        if (is_wp_error($target)) {
            return $target;
        }
        if (($data['role'] ?? '') === 'writer') {
            wp_update_post(['ID' => $post_id, 'post_author' => (int) $target->ID]);
            if ($story['status'] === 'pitch') {
                update_post_meta($post_id, WWH_STORY_STATUS_META, 'assigned');
            }
        } elseif (($data['role'] ?? '') === 'editor') {
            update_post_meta($post_id, WWH_STORY_EDITOR_META, (int) $target->ID);
        } else {
            return new WP_Error('wwh_invalid_role', 'Role must be writer or editor.', ['status' => 400]);
        }
    } else {
        return new WP_Error('wwh_invalid_operation', 'Unsupported story operation.', ['status' => 400]);
    }
    wwh_discord_queue_story($post_id);
    return rest_ensure_response(wwh_discord_story($post_id));
}

function wwh_discord_rest_link_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    if (!wwh_discord_story($post_id)) {
        return new WP_Error('wwh_story_not_found', 'Story not found.', ['status' => 404]);
    }
    $data = $request->get_json_params();
    foreach ([
        'threadId' => WWH_DISCORD_THREAD_META,
        'cardMessageId' => WWH_DISCORD_CARD_META,
        'publishMessageId' => WWH_DISCORD_PUBLISH_META,
        'announcementMessageId' => WWH_DISCORD_ANNOUNCEMENT_META,
    ] as $field => $meta) {
        if (array_key_exists($field, $data)) {
            $value = wwh_discord_sanitize_snowflake($data[$field]);
            $value === '' ? delete_post_meta($post_id, $meta) : update_post_meta($post_id, $meta, $value);
        }
    }
    update_post_meta($post_id, WWH_DISCORD_LAST_SYNC_META, gmdate(DATE_ATOM));
    delete_post_meta($post_id, WWH_DISCORD_LAST_ERROR_META);
    return rest_ensure_response(wwh_discord_story($post_id));
}

function wwh_discord_rest_unlink_story(WP_REST_Request $request)
{
    $post_id = absint($request->get_param('id'));
    $data = $request->get_json_params();
    $actor = wwh_discord_actor((string) ($data['actorDiscordUserId'] ?? ''));
    if (is_wp_error($actor) || !$post_id || !wwh_discord_capability($actor, 'edit_others_posts', $post_id)) {
        return is_wp_error($actor) ? $actor : new WP_Error('wwh_forbidden', 'Only an editor can unlink stories.', ['status' => 403]);
    }
    foreach ([WWH_DISCORD_THREAD_META, WWH_DISCORD_CARD_META, WWH_DISCORD_PUBLISH_META, WWH_DISCORD_ANNOUNCEMENT_META] as $meta) {
        delete_post_meta($post_id, $meta);
    }
    return rest_ensure_response(['unlinked' => true]);
}

function wwh_discord_rest_resolve_user(WP_REST_Request $request)
{
    $user = wwh_discord_actor((string) $request->get_param('discordId'));
    if (is_wp_error($user)) {
        return $user;
    }
    return rest_ensure_response(['user' => wwh_discord_user_summary($user), 'capabilities' => [
        'editPosts' => wwh_discord_capability($user, 'edit_posts'),
        'editOthersPosts' => wwh_discord_capability($user, 'edit_others_posts'),
        'publishPosts' => wwh_discord_capability($user, 'publish_posts'),
        'manageOptions' => wwh_discord_capability($user, 'manage_options'),
    ]]);
}

function wwh_discord_rest_stories(WP_REST_Request $request)
{
    $scope = sanitize_key((string) $request->get_param('scope'));
    $args = ['post_type' => 'post', 'post_status' => ['draft', 'pending', 'future', 'publish'], 'posts_per_page' => 100, 'orderby' => 'modified', 'order' => 'DESC'];
    $actor = null;
    if ($request->get_param('actorDiscordUserId')) {
        $actor = wwh_discord_actor((string) $request->get_param('actorDiscordUserId'));
        if (is_wp_error($actor)) {
            return $actor;
        }
        if (!wwh_discord_capability($actor, 'edit_posts')) {
            return new WP_Error('wwh_forbidden', 'Your Weekly Wildcat account cannot view newsroom assignments.', ['status' => 403]);
        }
    }
    if ($scope === 'editing') {
        $args['meta_query'] = [['key' => WWH_STORY_STATUS_META, 'value' => 'editing']];
    } elseif (in_array($scope, ['today', 'tomorrow', 'this-week', 'overdue'], true)) {
        [$start, $end] = wwh_discord_due_range($scope);
        $args['meta_query'] = [['key' => WWH_STORY_DEADLINE_META, 'value' => [$start, $end], 'compare' => 'BETWEEN', 'type' => 'DATE']];
    }
    $stories = array_values(array_filter(array_map(static fn($post) => wwh_discord_story((int) $post->ID), get_posts($args)), static function ($story) use ($scope, $actor): bool {
        if (!$story || $story['status'] === 'dropped') return false;
        if ($scope === 'mine' && $actor instanceof WP_User && $story['writer']['id'] !== (int) $actor->ID && ($story['editor']['id'] ?? 0) !== (int) $actor->ID) return false;
        if ($scope === 'active') return $story['postStatus'] !== 'publish' || $story['discord']['threadId'] !== '' || get_post_meta($story['id'], WWH_DISCORD_FINGERPRINT_META, true) !== '';
        if (in_array($scope, ['mine', 'editing', 'today', 'tomorrow', 'this-week', 'overdue'], true)) return $story['status'] !== 'published';
        return true;
    }));
    return rest_ensure_response(['stories' => $stories]);
}

function wwh_discord_due_range(string $scope): array
{
    $today = new DateTimeImmutable('today', wp_timezone());
    if ($scope === 'today') return [$today->format('Y-m-d'), $today->format('Y-m-d')];
    if ($scope === 'tomorrow') { $day = $today->modify('+1 day'); return [$day->format('Y-m-d'), $day->format('Y-m-d')]; }
    if ($scope === 'overdue') return ['1970-01-01', $today->modify('-1 day')->format('Y-m-d')];
    return [$today->format('Y-m-d'), $today->modify('sunday this week')->format('Y-m-d')];
}

function wwh_discord_register_rest_routes(): void
{
    $permission = 'wwh_discord_rest_permission';
    register_rest_route(WWH_REST_NAMESPACE, '/discord/story', ['methods' => 'GET', 'callback' => 'wwh_discord_rest_story', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/stories', ['methods' => 'GET', 'callback' => 'wwh_discord_rest_stories', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/stories', ['methods' => 'POST', 'callback' => 'wwh_discord_rest_create_story', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/stories/(?P<id>\d+)', ['methods' => 'PATCH', 'callback' => 'wwh_discord_rest_update_story', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/stories/(?P<id>\d+)/link', ['methods' => 'POST', 'callback' => 'wwh_discord_rest_link_story', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/stories/(?P<id>\d+)/link', ['methods' => 'DELETE', 'callback' => 'wwh_discord_rest_unlink_story', 'permission_callback' => $permission]);
    register_rest_route(WWH_REST_NAMESPACE, '/discord/users/(?P<discordId>\d+)', ['methods' => 'GET', 'callback' => 'wwh_discord_rest_resolve_user', 'permission_callback' => $permission]);
}
add_action('rest_api_init', 'wwh_discord_register_rest_routes');

function wwh_discord_register_story_box(): void
{
    add_meta_box('wwh-discord-story', 'Weekly Wildcat Workflow', 'wwh_discord_render_story_box', 'post', 'side', 'default');
}
add_action('add_meta_boxes_post', 'wwh_discord_register_story_box');

function wwh_discord_render_story_box(WP_Post $post): void
{
    wp_nonce_field('wwh_discord_save_story', 'wwh_discord_story_nonce');
    $status = $post->post_status === 'publish' ? 'published' : wwh_discord_sanitize_status(get_post_meta($post->ID, WWH_STORY_STATUS_META, true) ?: 'pitch');
    $labels = ['pitch' => 'Pitch', 'assigned' => 'Assigned', 'reporting' => 'Reporting', 'writing' => 'Writing', 'editing' => 'Editing', 'ready' => 'Ready', 'on-hold' => 'On hold', 'dropped' => 'Dropped', 'published' => 'Published'];
    $editor_id = absint(get_post_meta($post->ID, WWH_STORY_EDITOR_META, true));
    echo '<p><label for="wwh_story_status"><strong>Workflow status</strong></label><br><select id="wwh_story_status" name="wwh_story_status" class="widefat" ' . ($status === 'published' ? 'disabled' : '') . '>';
    foreach ($labels as $value => $label) {
        if ($value !== 'published' || $status === 'published') echo '<option value="' . esc_attr($value) . '" ' . selected($status, $value, false) . '>' . esc_html($label) . '</option>';
    }
    echo '</select></p><p><label for="wwh_story_editor"><strong>Editor</strong></label><br><select id="wwh_story_editor" name="wwh_story_editor" class="widefat"><option value="0">Unassigned</option>';
    foreach (get_users(['capability' => 'edit_posts', 'orderby' => 'display_name']) as $editor) echo '<option value="' . esc_attr((string) $editor->ID) . '" ' . selected($editor_id, $editor->ID, false) . '>' . esc_html($editor->display_name) . '</option>';
    echo '</select></p><p><label for="wwh_story_deadline"><strong>Deadline</strong></label><br><input class="widefat" type="date" id="wwh_story_deadline" name="wwh_story_deadline" value="' . esc_attr((string) get_post_meta($post->ID, WWH_STORY_DEADLINE_META, true)) . '"></p>';
    echo '<p><label for="wwh_story_visuals"><strong>Visual needs</strong></label><br><textarea class="widefat" rows="3" id="wwh_story_visuals" name="wwh_story_visuals">' . esc_textarea((string) get_post_meta($post->ID, WWH_STORY_VISUALS_META, true)) . '</textarea></p>';
    $thread_id = (string) get_post_meta($post->ID, WWH_DISCORD_THREAD_META, true);
    echo '<p class="description">' . esc_html($thread_id ? 'Linked Discord thread: ' . $thread_id : 'Discord thread will be created asynchronously after save.') . '</p>';
}

function wwh_discord_save_story_box(int $post_id): void
{
    if (!isset($_POST['wwh_discord_story_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['wwh_discord_story_nonce'])), 'wwh_discord_save_story') || !current_user_can('edit_post', $post_id) || wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) return;
    $post = get_post($post_id);
    if ($post instanceof WP_Post && $post->post_status !== 'publish') update_post_meta($post_id, WWH_STORY_STATUS_META, wwh_discord_sanitize_status(wp_unslash($_POST['wwh_story_status'] ?? 'pitch')));
    if (current_user_can('edit_others_posts')) {
        $editor_id = absint($_POST['wwh_story_editor'] ?? 0);
        $editor_id ? update_post_meta($post_id, WWH_STORY_EDITOR_META, $editor_id) : delete_post_meta($post_id, WWH_STORY_EDITOR_META);
        $deadline = wwh_discord_sanitize_deadline(wp_unslash($_POST['wwh_story_deadline'] ?? ''));
        $deadline ? update_post_meta($post_id, WWH_STORY_DEADLINE_META, $deadline) : delete_post_meta($post_id, WWH_STORY_DEADLINE_META);
    }
    $visuals = sanitize_textarea_field(wp_unslash($_POST['wwh_story_visuals'] ?? ''));
    $visuals !== '' ? update_post_meta($post_id, WWH_STORY_VISUALS_META, $visuals) : delete_post_meta($post_id, WWH_STORY_VISUALS_META);
}
add_action('save_post_post', 'wwh_discord_save_story_box', 15);

function wwh_discord_meaningful_story(int $post_id, $post = null): bool
{
    $post = $post instanceof WP_Post ? $post : get_post($post_id);
    return $post instanceof WP_Post && $post->post_type === 'post' && !in_array($post->post_status, ['auto-draft', 'trash', 'inherit'], true) && trim(wp_strip_all_tags($post->post_title)) !== '';
}

function wwh_discord_story_fingerprint(int $post_id, WP_Post $post): string
{
    return hash('sha256', wp_json_encode([
        $post->post_title, $post->post_status, (int) $post->post_author, wp_get_post_categories($post_id),
        get_post_meta($post_id, WWH_STORY_STATUS_META, true), get_post_meta($post_id, WWH_STORY_EDITOR_META, true),
        get_post_meta($post_id, WWH_STORY_DEADLINE_META, true), get_post_meta($post_id, WWH_STORY_VISUALS_META, true),
    ]));
}

function wwh_discord_queue_story(int $post_id, $post = null, bool $update = false): void
{
    if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id) || !wwh_discord_meaningful_story($post_id, $post)) {
        return;
    }
    $post = $post instanceof WP_Post ? $post : get_post($post_id);
    $fingerprint = wwh_discord_story_fingerprint($post_id, $post);
    if ($fingerprint === (string) get_post_meta($post_id, WWH_DISCORD_FINGERPRINT_META, true)) return;
    if (wp_next_scheduled(WWH_DISCORD_SYNC_EVENT, [$post_id])) {
        update_post_meta($post_id, WWH_DISCORD_FINGERPRINT_META, $fingerprint);
        return;
    }
    if (wp_schedule_single_event(time() + 5, WWH_DISCORD_SYNC_EVENT, [$post_id])) update_post_meta($post_id, WWH_DISCORD_FINGERPRINT_META, $fingerprint);
}
add_action('save_post_post', 'wwh_discord_queue_story', 20, 3);

function wwh_discord_http(string $path, array $data): array
{
    $base = untrailingslashit(wwh_discord_config('WWH_DISCORD_BOT_URL'));
    $secret = wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET');
    if ($base === '' || $secret === '') {
        return ['ok' => false, 'error' => 'Discord bridge is not configured.'];
    }
    $body = wp_json_encode($data);
    $timestamp = (string) time();
    $response = wp_remote_post($base . $path, ['timeout' => 5, 'headers' => [
        'Content-Type' => 'application/json',
        'X-WWH-Timestamp' => $timestamp,
        'X-WWH-Signature' => wwh_discord_sign($timestamp, 'POST', $path, $body, $secret),
        'X-WWH-Request-Id' => wp_generate_uuid4(),
    ], 'body' => $body]);
    if (is_wp_error($response)) return ['ok' => false, 'error' => $response->get_error_message()];
    $code = wp_remote_retrieve_response_code($response);
    return ['ok' => $code >= 200 && $code < 300, 'status' => $code, 'body' => json_decode(wp_remote_retrieve_body($response), true)];
}

function wwh_discord_run_story_sync(int $post_id): void
{
    if (!wwh_discord_meaningful_story($post_id)) return;
    $result = wwh_discord_http('/sync', ['storyId' => $post_id]);
    if ($result['ok']) {
        update_post_meta($post_id, WWH_DISCORD_LAST_SYNC_META, gmdate(DATE_ATOM));
        delete_post_meta($post_id, WWH_DISCORD_LAST_ERROR_META);
    } else {
        update_post_meta($post_id, WWH_DISCORD_LAST_ERROR_META, sanitize_text_field((string) ($result['error'] ?? ('HTTP ' . ($result['status'] ?? 0)))));
    }
}
add_action(WWH_DISCORD_SYNC_EVENT, 'wwh_discord_run_story_sync');

function wwh_discord_oauth_state(int $user_id): string
{
    $state = bin2hex(random_bytes(32));
    set_transient('wwh_discord_oauth_' . hash('sha256', $state), $user_id, 10 * MINUTE_IN_SECONDS);
    return $state;
}

function wwh_discord_oauth_redirect_uri(): string
{
    return admin_url('admin-post.php?action=wwh_discord_oauth_callback');
}

function wwh_discord_connect(): void
{
    if (!is_user_logged_in()) auth_redirect();
    check_admin_referer('wwh_discord_connect');
    $client_id = wwh_discord_config('WWH_DISCORD_CLIENT_ID');
    if ($client_id === '') wp_die('Discord OAuth is not configured.');
    wp_redirect(add_query_arg(['client_id' => $client_id, 'response_type' => 'code', 'redirect_uri' => wwh_discord_oauth_redirect_uri(), 'scope' => 'identify', 'state' => wwh_discord_oauth_state(get_current_user_id()), 'prompt' => 'consent'], 'https://discord.com/oauth2/authorize'));
    exit;
}
add_action('admin_post_wwh_discord_connect', 'wwh_discord_connect');

function wwh_discord_oauth_callback(): void
{
    if (!is_user_logged_in()) auth_redirect();
    $state = sanitize_text_field(wp_unslash($_GET['state'] ?? ''));
    $key = 'wwh_discord_oauth_' . hash('sha256', $state);
    $user_id = absint(get_transient($key));
    delete_transient($key);
    if (!$user_id || $user_id !== get_current_user_id()) wp_die('Invalid or expired Discord connection request.');
    $response = wp_remote_post('https://discord.com/api/v10/oauth2/token', ['timeout' => 10, 'body' => [
        'client_id' => wwh_discord_config('WWH_DISCORD_CLIENT_ID'), 'client_secret' => wwh_discord_config('WWH_DISCORD_CLIENT_SECRET'),
        'grant_type' => 'authorization_code', 'code' => sanitize_text_field(wp_unslash($_GET['code'] ?? '')), 'redirect_uri' => wwh_discord_oauth_redirect_uri(),
    ]]);
    $token = is_wp_error($response) ? [] : json_decode(wp_remote_retrieve_body($response), true);
    if (empty($token['access_token'])) wp_die('Discord account connection failed. Please try again.');
    $identity = wp_remote_get('https://discord.com/api/v10/users/@me', ['timeout' => 10, 'headers' => ['Authorization' => 'Bearer ' . $token['access_token']]]);
    $discord = is_wp_error($identity) ? [] : json_decode(wp_remote_retrieve_body($identity), true);
    $discord_id = wwh_discord_sanitize_snowflake($discord['id'] ?? '');
    if ($discord_id === '') wp_die('Discord returned an invalid account.');
    $duplicates = get_users(['meta_key' => WWH_DISCORD_USER_ID_META, 'meta_value' => $discord_id, 'exclude' => [$user_id], 'number' => 1]);
    if ($duplicates) wp_die('That Discord account is already connected to another Weekly Wildcat account.');
    update_user_meta($user_id, WWH_DISCORD_USER_ID_META, $discord_id);
    update_user_meta($user_id, WWH_DISCORD_USERNAME_META, sanitize_text_field((string) ($discord['global_name'] ?? $discord['username'] ?? 'Discord user')));
    wp_safe_redirect(admin_url('profile.php?wwh_discord=connected'));
    exit;
}
add_action('admin_post_wwh_discord_oauth_callback', 'wwh_discord_oauth_callback');

function wwh_discord_disconnect(): void
{
    if (!is_user_logged_in()) auth_redirect();
    check_admin_referer('wwh_discord_disconnect');
    delete_user_meta(get_current_user_id(), WWH_DISCORD_USER_ID_META);
    delete_user_meta(get_current_user_id(), WWH_DISCORD_USERNAME_META);
    wp_safe_redirect(admin_url('profile.php?wwh_discord=disconnected'));
    exit;
}
add_action('admin_post_wwh_discord_disconnect', 'wwh_discord_disconnect');

function wwh_discord_profile(WP_User $user): void
{
    if ((int) $user->ID !== get_current_user_id()) return;
    $discord_id = (string) get_user_meta($user->ID, WWH_DISCORD_USER_ID_META, true);
    $username = (string) get_user_meta($user->ID, WWH_DISCORD_USERNAME_META, true);
    echo '<h2>Discord</h2><table class="form-table" role="presentation"><tr><th>Weekly Wildcat Discord</th><td>';
    if ($discord_id !== '') {
        echo '<p>Connected as <strong>' . esc_html($username ?: $discord_id) . '</strong></p><a class="button" href="' . esc_url(wp_nonce_url(admin_url('admin-post.php?action=wwh_discord_disconnect'), 'wwh_discord_disconnect')) . '">Disconnect Discord</a>';
    } else {
        echo '<a class="button button-primary" href="' . esc_url(wp_nonce_url(admin_url('admin-post.php?action=wwh_discord_connect'), 'wwh_discord_connect')) . '">Connect Discord</a><p class="description">Uses Discord identity only; no server-member or message access is requested.</p>';
    }
    echo '</td></tr></table>';
}
add_action('show_user_profile', 'wwh_discord_profile', 20);
add_action('edit_user_profile', 'wwh_discord_profile', 20);

function wwh_discord_admin_status(): void
{
    if (!current_user_can('manage_options')) return;
    $configured = wwh_discord_config('WWH_DISCORD_BOT_URL') !== '' && wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET') !== '';
    echo '<h2>Discord</h2><table class="widefat striped" role="presentation"><tbody><tr><th>Bridge configuration</th><td>' . esc_html($configured ? 'Configured' : 'Not configured') . '</td></tr>';
    if ($configured) {
        $health = wp_remote_get(untrailingslashit(wwh_discord_config('WWH_DISCORD_BOT_URL')) . '/healthz', ['timeout' => 3]);
        $body = is_wp_error($health) ? [] : json_decode(wp_remote_retrieve_body($health), true);
        echo '<tr><th>Wildcat connected</th><td>' . esc_html(!empty($body['discordConnected']) ? 'Yes' : 'No') . '</td></tr>';
        echo '<tr><th>Server connected</th><td>' . esc_html(!empty($body['guildFound']) ? 'Yes' : 'No') . '</td></tr>';
        echo '<tr><th>Storyboard connected</th><td>' . esc_html(!empty($body['storyboardFound']) ? 'Yes' : 'No') . '</td></tr>';
        echo '<tr><th>Announcements connected</th><td>' . esc_html(!empty($body['announcementsFound']) ? 'Yes' : 'No') . '</td></tr>';
        echo '<tr><th>Last successful sync</th><td>' . esc_html((string) ($body['lastSuccessfulReconciliation'] ?? 'Not yet')) . '</td></tr><tr><th>Status</th><td>' . esc_html(is_wp_error($health) ? $health->get_error_message() : (string) ($body['message'] ?? 'Available')) . '</td></tr>';
    }
    echo '</tbody></table><h3>Post to Discord</h3><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="wwh_discord_announce">';
    wp_nonce_field('wwh_discord_announce');
    echo '<p><label>Title<br><input class="regular-text" name="title" maxlength="100" required></label></p><p><label>Message<br><textarea class="large-text" rows="4" name="message" maxlength="1800" required></textarea></label></p><p><label><input type="checkbox" name="mention_staff" value="1"> Mention the configured staff role</label></p>';
    submit_button('Post announcement', 'secondary');
    echo '</form>';
}
add_action('wwh_settings_page_after', 'wwh_discord_admin_status');

function wwh_discord_admin_announce(): void
{
    if (!current_user_can('publish_posts')) wp_die('You are not allowed to post announcements.');
    check_admin_referer('wwh_discord_announce');
    $title = sanitize_text_field(wp_unslash($_POST['title'] ?? ''));
    $message = sanitize_textarea_field(wp_unslash($_POST['message'] ?? ''));
    if ($title === '' || $message === '') wp_die('Title and message are required.');
    $result = wwh_discord_http('/announce', ['title' => $title, 'message' => $message, 'mentionStaff' => isset($_POST['mention_staff'])]);
    $status = $result['ok'] ? 'posted' : 'failed';
    wp_safe_redirect(add_query_arg('wwh_discord_announcement', $status, admin_url('options-general.php?page=wwh-settings')));
    exit;
}
add_action('admin_post_wwh_discord_announce', 'wwh_discord_admin_announce');
