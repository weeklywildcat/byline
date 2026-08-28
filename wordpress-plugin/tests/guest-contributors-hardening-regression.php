<?php

/**
 * Focused regression coverage for guest-contributor authorization.
 *
 * The harness models the capability split that matters at the boundary:
 * Contributors can edit their own story, Editors can manage guest profiles but
 * not publish them, Publishers can do both, and Byline managers can manage
 * profiles without receiving an implicit publish grant.
 */

define('ABSPATH', __DIR__ . '/../');
define('BYLINE_MANAGE_CAPABILITY', 'manage_byline');

$byline_guest_hardening_posts = [];
$byline_guest_hardening_meta = [];
$byline_guest_hardening_users = [];
$byline_guest_hardening_user_meta = [];
$byline_guest_hardening_roles = [];
$byline_guest_hardening_object_caps = [];
$byline_guest_hardening_current_user_id = 1;
$byline_guest_hardening_next_post_id = 100;

class WP_Post
{
    public int $ID = 0;
    public string $post_type = '';
    public string $post_status = 'draft';
    public string $post_title = '';
    public string $post_name = '';
    public int $post_author = 0;
}

class WP_User
{
    public int $ID = 0;
    public string $display_name = '';
    public string $user_nicename = '';
    public string $user_url = '';
    public string $user_email = '';
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

    public function get_error_code(): string
    {
        return $this->code;
    }
}

function guest_hardening_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function guest_hardening_assert(bool $condition, string $message): void
{
    if (!$condition) {
        guest_hardening_fail($message);
    }
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function do_action(...$args): void {}
function __(string $text, string $domain = ''): string { return $text; }
function register_post_type(...$args): void {}
function register_post_meta(...$args): void {}
function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}
function sanitize_title($value): string
{
    return trim(strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', (string) $value)), '-');
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
function esc_url_raw(string $url, array $protocols = []): string
{
    $url = trim($url);
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    if ($url === '' || $scheme === '' || ($protocols !== [] && !in_array($scheme, $protocols, true))) {
        return '';
    }

    return $url;
}
function get_current_user_id(): int
{
    global $byline_guest_hardening_current_user_id;
    return $byline_guest_hardening_current_user_id;
}
function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

function guest_hardening_capability_user_id($user): int
{
    return is_object($user) ? absint($user->ID ?? 0) : absint($user);
}

function guest_hardening_has_capability(int $user_id, string $capability, array $args = []): bool
{
    global $byline_guest_hardening_roles, $byline_guest_hardening_object_caps;

    if (in_array($capability, ['edit_post', 'delete_post'], true)) {
        $post_id = absint($args[0] ?? 0);
        return !empty($byline_guest_hardening_object_caps[$user_id][$capability][$post_id]);
    }

    return !empty($byline_guest_hardening_roles[$user_id][$capability]);
}

function current_user_can(string $capability, ...$args): bool
{
    return guest_hardening_has_capability(get_current_user_id(), $capability, $args);
}

function user_can($user, string $capability, ...$args): bool
{
    return guest_hardening_has_capability(guest_hardening_capability_user_id($user), $capability, $args);
}

function get_post(int $post_id)
{
    global $byline_guest_hardening_posts;
    return $byline_guest_hardening_posts[$post_id] ?? null;
}

function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $byline_guest_hardening_meta;
    return $byline_guest_hardening_meta[$post_id][$key] ?? '';
}

function update_post_meta(int $post_id, string $key, $value): void
{
    global $byline_guest_hardening_meta;
    $byline_guest_hardening_meta[$post_id][$key] = $value;
}

function delete_post_meta(int $post_id, string $key): void
{
    global $byline_guest_hardening_meta;
    unset($byline_guest_hardening_meta[$post_id][$key]);
}

function get_user_by(string $field, $value)
{
    global $byline_guest_hardening_users;

    foreach ($byline_guest_hardening_users as $user) {
        if (!$user instanceof WP_User) {
            continue;
        }

        if (($field === 'id' || $field === 'ID') && $user->ID === absint($value)) {
            return $user;
        }
        if ($field === 'slug' && $user->user_nicename === sanitize_title((string) $value)) {
            return $user;
        }
    }

    return false;
}

function get_user_meta(int $user_id, string $key, bool $single = false)
{
    global $byline_guest_hardening_user_meta;
    return $byline_guest_hardening_user_meta[$user_id][$key] ?? '';
}

function get_author_posts_url(int $user_id, string $slug = ''): string
{
    return '/author/' . ($slug !== '' ? $slug : 'user-' . $user_id) . '/';
}

function get_posts(array $args = []): array
{
    global $byline_guest_hardening_posts;
    $posts = [];

    foreach ($byline_guest_hardening_posts as $post) {
        if (!$post instanceof WP_Post || $post->post_type !== ($args['post_type'] ?? $post->post_type)) {
            continue;
        }
        if (!empty($args['name']) && $post->post_name !== sanitize_title((string) $args['name'])) {
            continue;
        }
        $posts[] = $post;
    }

    return $posts;
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $byline_guest_hardening_posts, $byline_guest_hardening_next_post_id;

    $post = new WP_Post();
    $post->ID = ++$byline_guest_hardening_next_post_id;
    $post->post_type = (string) ($data['post_type'] ?? 'post');
    $post->post_status = (string) ($data['post_status'] ?? 'draft');
    $post->post_title = (string) ($data['post_title'] ?? '');
    $post->post_name = (string) ($data['post_name'] ?? '');
    $post->post_author = absint($data['post_author'] ?? 0);
    $byline_guest_hardening_posts[$post->ID] = $post;

    return $post->ID;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    $post = get_post(absint($data['ID'] ?? 0));
    if (!$post instanceof WP_Post) {
        return $wp_error ? new WP_Error('not_found', 'Post not found.') : 0;
    }

    foreach (['post_title', 'post_name', 'post_status', 'post_author'] as $field) {
        if (array_key_exists($field, $data)) {
            $post->{$field} = $field === 'post_author' ? absint($data[$field]) : (string) $data[$field];
        }
    }

    return $post->ID;
}

function guest_hardening_add_user(int $id, string $name, string $slug, string $role): WP_User
{
    global $byline_guest_hardening_users, $byline_guest_hardening_roles;

    $user = new WP_User();
    $user->ID = $id;
    $user->display_name = $name;
    $user->user_nicename = $slug;
    $user->user_email = 'private-' . $id . '@example.test';
    $byline_guest_hardening_users[$id] = $user;
    $byline_guest_hardening_roles[$id] = [
        'edit_posts' => $role !== 'viewer',
        'edit_others_posts' => in_array($role, ['editor', 'publisher'], true),
        'publish_posts' => $role === 'publisher',
        'manage_byline' => $role === 'manager',
    ];

    return $user;
}

function guest_hardening_add_story(int $id, int $author_id, string $status = 'draft'): WP_Post
{
    global $byline_guest_hardening_posts;

    $post = new WP_Post();
    $post->ID = $id;
    $post->post_type = 'post';
    $post->post_status = $status;
    $post->post_title = 'Story ' . $id;
    $post->post_name = 'story-' . $id;
    $post->post_author = $author_id;
    $byline_guest_hardening_posts[$id] = $post;

    return $post;
}

require __DIR__ . '/../includes/editorial/contributors.php';

guest_hardening_add_user(1, 'Contributing Writer', 'contributing-writer', 'contributor');
guest_hardening_add_user(2, 'Newsroom Editor', 'newsroom-editor', 'editor');
guest_hardening_add_user(3, 'Publishing Editor', 'publishing-editor', 'publisher');
guest_hardening_add_user(4, 'Byline Manager', 'byline-manager', 'manager');
guest_hardening_add_user(5, 'Slug Owner', 'slug-owner', 'publisher');
$byline_guest_hardening_user_meta[2] = [
    '_ww_author_social_email' => 'private-profile@example.test',
    'description' => 'Editor profile bio',
];
guest_hardening_add_story(10, 1);

// Contributor access is enough for a story they may edit, but not for creating
// or editing an independent guest profile.
guest_hardening_assert(!byline_guest_can_create(1), 'Contributors must not create guest profiles.');
$contributor_create = byline_create_guest_contributor([
    'name' => 'Contributor Guest',
    'slug' => 'contributor-guest',
], 1);
guest_hardening_assert(is_wp_error($contributor_create) && $contributor_create->get_error_code() === 'byline_guest_forbidden', 'Contributor guest creation must be rejected.');

guest_hardening_assert(byline_guest_can_create(2), 'Editors with edit_others_posts must manage guest profiles.');
guest_hardening_assert(byline_guest_can_create(3), 'Publishers with edit_others_posts must manage guest profiles.');
guest_hardening_assert(byline_guest_can_create(4), 'Byline managers must manage guest profiles.');

$editor_guest = byline_create_guest_contributor([
    'name' => 'Editor Guest',
    'slug' => 'editor-guest',
    'role' => 'Community reporter',
    'bio' => 'An editor-created draft profile.',
], 2);
guest_hardening_assert(!is_wp_error($editor_guest), 'An editor should be able to create a guest profile.');
$editor_guest_id = (int) ($editor_guest['id'] ?? 0);
guest_hardening_assert($editor_guest_id > 0, 'The editor guest must have an id.');
guest_hardening_assert(get_post($editor_guest_id)->post_status === 'draft', 'Guest profiles must default to draft without publish_posts.');
guest_hardening_assert(byline_get_public_guest_contributor($editor_guest_id) === null, 'Draft guest profiles must stay out of public projections.');

// The object-level edit_post capability is deliberately present for this
// Contributor, but guest-profile editing has its own stronger newsroom gate.
$byline_guest_hardening_object_caps[1]['edit_post'][$editor_guest_id] = true;
guest_hardening_assert(!byline_guest_can_edit($editor_guest_id, 1), 'Contributor edit_post access must not edit guest profiles.');
$contributor_update = byline_update_guest_contributor($editor_guest_id, ['role' => 'Unauthorized'], 1);
guest_hardening_assert(is_wp_error($contributor_update) && $contributor_update->get_error_code() === 'byline_guest_forbidden', 'Contributor guest editing must be rejected.');

$editor_update = byline_update_guest_contributor($editor_guest_id, ['bio' => 'Updated draft bio'], 2);
guest_hardening_assert(!is_wp_error($editor_update), 'An editor should be able to update a guest profile.');
guest_hardening_assert(($editor_update['role'] ?? '') === 'Community reporter', 'Partial guest updates must preserve omitted profile fields.');

$editor_publish = byline_update_guest_contributor($editor_guest_id, [
    'status' => 'publish',
    'role' => 'Should not be persisted',
], 2);
guest_hardening_assert(is_wp_error($editor_publish) && $editor_publish->get_error_code() === 'byline_guest_forbidden_publish', 'Editors without publish_posts must not publish guest profiles.');
guest_hardening_assert(get_post($editor_guest_id)->post_status === 'draft', 'A refused guest publication must leave the draft status unchanged.');
guest_hardening_assert(get_post_meta($editor_guest_id, BYLINE_GUEST_ROLE_META, true) === 'Community reporter', 'A refused publication must not partially update profile fields.');

$editor_explicit_publish = byline_create_guest_contributor([
    'name' => 'Editor Publish Attempt',
    'slug' => 'editor-publish-attempt',
    'status' => 'publish',
], 2);
guest_hardening_assert(is_wp_error($editor_explicit_publish) && $editor_explicit_publish->get_error_code() === 'byline_guest_forbidden_publish', 'Editors must not bypass publication authority with an explicit status.');

$publisher_guest = byline_create_guest_contributor([
    'name' => 'Publisher Guest',
    'slug' => 'publisher-guest',
], 3);
guest_hardening_assert(!is_wp_error($publisher_guest), 'A publisher should be able to create a guest profile.');
$publisher_guest_id = (int) ($publisher_guest['id'] ?? 0);
guest_hardening_assert(get_post($publisher_guest_id)->post_status === 'publish', 'Publishers should receive the published creation default.');
guest_hardening_assert(byline_get_public_guest_contributor($publisher_guest_id) !== null, 'Published guest profiles must be available to public projections.');

$publisher_publish = byline_update_guest_contributor($editor_guest_id, ['status' => 'publish'], 3);
guest_hardening_assert(!is_wp_error($publisher_publish), 'A publisher should be able to publish an editor-created draft.');
guest_hardening_assert(get_post($editor_guest_id)->post_status === 'publish', 'Publisher publication must persist the publish status.');

$manager_guest = byline_create_guest_contributor([
    'name' => 'Manager Guest',
    'slug' => 'manager-guest',
], 4);
guest_hardening_assert(!is_wp_error($manager_guest), 'Byline managers should be able to create guest profiles.');
$manager_guest_id = (int) ($manager_guest['id'] ?? 0);
guest_hardening_assert(get_post($manager_guest_id)->post_status === 'draft', 'Byline management must not imply publish_posts.');
$manager_publish = byline_update_guest_contributor($manager_guest_id, ['status' => 'publish'], 4);
guest_hardening_assert(is_wp_error($manager_publish) && $manager_publish->get_error_code() === 'byline_guest_forbidden_publish', 'Byline managers without publish_posts must not publish guest profiles.');

// Existing slug protections still cover both WordPress users and guest posts.
$user_slug_collision = byline_create_guest_contributor([
    'name' => 'User Slug Collision',
    'slug' => 'slug-owner',
], 3);
guest_hardening_assert(is_wp_error($user_slug_collision) && $user_slug_collision->get_error_code() === 'byline_guest_slug_conflict', 'Guest slugs must not collide with user nicenames.');
$guest_slug_collision = byline_create_guest_contributor([
    'name' => 'Guest Slug Collision',
    'slug' => 'publisher-guest',
], 3);
guest_hardening_assert(is_wp_error($guest_slug_collision) && $guest_slug_collision->get_error_code() === 'byline_guest_slug_conflict', 'Guest slugs must remain unique among guest records.');

// Story assignment remains object-level: the Contributor can attach existing
// references to their story, even though they cannot manage guest records.
$byline_guest_hardening_object_caps[1]['edit_post'][10] = true;
$story_contributors = byline_set_story_contributors(10, [
    ['type' => 'guest', 'id' => $publisher_guest_id],
    ['type' => 'user', 'id' => 2],
], 1);
guest_hardening_assert(!is_wp_error($story_contributors), 'A Contributor who can edit a story should assign existing contributors.');
guest_hardening_assert($story_contributors === [
    ['type' => 'user', 'id' => 1],
    ['type' => 'guest', 'id' => $publisher_guest_id],
    ['type' => 'user', 'id' => 2],
], 'Story contributor assignment must preserve the primary author and order.');
guest_hardening_assert(get_post(10)->post_author === 1, 'Contributor assignment must not rewrite post_author.');

$legacy_story = guest_hardening_add_story(11, 1);
guest_hardening_assert(byline_get_story_contributor_entries(11) === [['type' => 'user', 'id' => 1]], 'Legacy single-author stories must still fall back to post_author.');
guest_hardening_assert(!isset($byline_guest_hardening_meta[11][BYLINE_STORY_CONTRIBUTORS_META]), 'Legacy contributor reads must not write metadata.');

get_post(10)->post_status = 'publish';
$public_story_contributors = byline_get_public_story_contributors(10);
guest_hardening_assert(array_column($public_story_contributors, 'name') === ['Contributing Writer', 'Publisher Guest', 'Newsroom Editor'], 'Public contributors must preserve persisted order.');
guest_hardening_assert(!array_key_exists('email', $public_story_contributors[0]), 'User projections must omit account email fields.');
guest_hardening_assert(strpos(serialize($public_story_contributors), 'private-1@example.test') === false, 'User account email data must not enter public projections.');
guest_hardening_assert(strpos(serialize($public_story_contributors), 'private-profile@example.test') === false, 'Private profile email metadata must not enter public projections.');
guest_hardening_assert(!array_key_exists('email', $public_story_contributors[1]), 'Guest projections must omit email fields.');

echo "Guest contributor hardening regression passed.\n";
