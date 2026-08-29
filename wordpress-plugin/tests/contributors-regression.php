<?php

/**
 * Regression coverage for the ordered contributors/guest domain.
 *
 * This is intentionally a small WordPress-shaped harness, matching the
 * repository's standalone PHP regression style. It exercises storage and
 * projection rules without requiring a database-backed WordPress install.
 */

define('ABSPATH', __DIR__ . '/../');

const BYLINE_TEST_CURRENT_USER = 1;

$byline_contributor_test_posts = [];
$byline_contributor_test_meta = [];
$byline_contributor_test_users = [];
$byline_contributor_test_user_meta = [];
$byline_contributor_test_post_types = [];
$byline_contributor_test_post_meta = [];
$byline_contributor_test_capabilities = [];
$byline_contributor_test_next_post_id = 100;

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
    private string $code;
    private string $message;
    private array $data;

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

    public function get_error_data()
    {
        return $this->data;
    }
}

function contributors_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function contributors_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        contributors_test_fail($message);
    }
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function __(string $text, string $domain = ''): string { return $text; }
function register_post_type(string $post_type, array $args): void
{
    global $byline_contributor_test_post_types;
    $byline_contributor_test_post_types[$post_type] = $args;
}
function register_post_meta(string $post_type, string $key, array $args): void
{
    global $byline_contributor_test_post_meta;
    $byline_contributor_test_post_meta[$post_type][$key] = $args;
}
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
function wp_unslash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function get_current_user_id(): int { return BYLINE_TEST_CURRENT_USER; }

function current_user_can(string $capability, ...$args): bool
{
    global $byline_contributor_test_capabilities;
    if ($capability === 'edit_post' || $capability === 'delete_post') {
        $post_id = absint($args[0] ?? 0);
        return !empty($byline_contributor_test_capabilities[$capability][$post_id]);
    }

    return !empty($byline_contributor_test_capabilities[$capability]);
}

function user_can($user, string $capability, ...$args): bool
{
    global $byline_contributor_test_capabilities;
    $user_id = is_object($user) ? absint($user->ID ?? 0) : absint($user);
    if ($capability === 'edit_post' || $capability === 'delete_post') {
        $post_id = absint($args[0] ?? 0);
        return !empty($byline_contributor_test_capabilities['user:' . $user_id . ':' . $capability][$post_id]);
    }

    return !empty($byline_contributor_test_capabilities['user:' . $user_id . ':' . $capability]);
}

function get_post(int $post_id)
{
    global $byline_contributor_test_posts;
    return $byline_contributor_test_posts[$post_id] ?? null;
}
function get_post_type(int $post_id): string
{
    if (in_array($post_id, [7, 8], true)) {
        return 'attachment';
    }

    $post = get_post($post_id);
    return $post instanceof WP_Post ? $post->post_type : '';
}
function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $byline_contributor_test_meta;
    return $byline_contributor_test_meta[$post_id][$key] ?? '';
}
function update_post_meta(int $post_id, string $key, $value): void
{
    global $byline_contributor_test_meta;
    $byline_contributor_test_meta[$post_id][$key] = $value;
}
function delete_post_meta(int $post_id, string $key): void
{
    global $byline_contributor_test_meta;
    unset($byline_contributor_test_meta[$post_id][$key]);
}
function get_user_by(string $field, $value)
{
    global $byline_contributor_test_users;
    foreach ($byline_contributor_test_users as $user) {
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
    global $byline_contributor_test_user_meta;
    return $byline_contributor_test_user_meta[$user_id][$key] ?? '';
}
function get_author_posts_url(int $user_id, string $slug = ''): string
{
    return '/author/' . ($slug !== '' ? $slug : 'user-' . $user_id) . '/';
}
function wp_attachment_is_image(int $attachment_id): bool
{
    return in_array($attachment_id, [7, 8], true);
}

function wwh_media_image(int $attachment_id, string $size = 'large'): array
{
    return $attachment_id === 7
        ? ['id' => 7, 'url' => 'https://images.example.test/guest.jpg', 'alt' => 'Guest', 'width' => 132, 'height' => 132]
        : ['id' => 0, 'url' => '', 'alt' => '', 'width' => null, 'height' => null];
}

function get_posts(array $args = []): array
{
    global $byline_contributor_test_posts;
    $posts = [];
    foreach ($byline_contributor_test_posts as $post) {
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
    global $byline_contributor_test_posts, $byline_contributor_test_next_post_id;
    $post = new WP_Post();
    $post->ID = ++$byline_contributor_test_next_post_id;
    $post->post_type = (string) ($data['post_type'] ?? 'post');
    $post->post_status = (string) ($data['post_status'] ?? 'draft');
    $post->post_title = (string) ($data['post_title'] ?? '');
    $post->post_name = (string) ($data['post_name'] ?? '');
    $post->post_author = absint($data['post_author'] ?? 0);
    $byline_contributor_test_posts[$post->ID] = $post;
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

function wp_delete_post(int $post_id, bool $force = false): bool
{
    global $byline_contributor_test_posts;
    unset($byline_contributor_test_posts[$post_id]);
    return true;
}

function do_action(...$args): void {}

function contributors_test_add_user(int $id, string $name, string $slug, string $url = ''): WP_User
{
    global $byline_contributor_test_users;
    $user = new WP_User();
    $user->ID = $id;
    $user->display_name = $name;
    $user->user_nicename = $slug;
    $user->user_url = $url;
    $user->user_email = 'private-' . $id . '@example.test';
    $byline_contributor_test_users[$id] = $user;
    return $user;
}

function contributors_test_add_story(int $id, int $author_id, string $status = 'draft'): WP_Post
{
    global $byline_contributor_test_posts;
    $post = new WP_Post();
    $post->ID = $id;
    $post->post_type = 'post';
    $post->post_status = $status;
    $post->post_title = 'Story ' . $id;
    $post->post_name = 'story-' . $id;
    $post->post_author = $author_id;
    $byline_contributor_test_posts[$id] = $post;
    return $post;
}

require __DIR__ . '/../includes/editorial/contributors.php';

// Registration is private by default and never delegates guest data to Core's
// anonymous post/user REST controllers.
byline_register_guest_contributor_post_type();
contributors_test_assert(($byline_contributor_test_post_types[BYLINE_GUEST_POST_TYPE]['public'] ?? true) === false, 'Guest contributors must not be public post content.');
contributors_test_assert(($byline_contributor_test_post_types[BYLINE_GUEST_POST_TYPE]['publicly_queryable'] ?? true) === false, 'Guest contributors must not have public WordPress queries.');
contributors_test_assert(($byline_contributor_test_post_types[BYLINE_GUEST_POST_TYPE]['show_in_rest'] ?? true) === false, 'Guest contributors must not be exposed through Core REST.');
contributors_test_assert(($byline_contributor_test_post_types[BYLINE_GUEST_POST_TYPE]['show_in_menu'] ?? true) === false, 'Guest contributors should be managed from newsroom surfaces, not a stray top-level menu.');

byline_register_contributor_meta();
contributors_test_assert(($byline_contributor_test_post_meta['post'][BYLINE_STORY_CONTRIBUTORS_META]['show_in_rest'] ?? true) === false, 'Ordered contributor references must stay out of anonymous post REST.');
contributors_test_assert(($byline_contributor_test_post_meta[BYLINE_GUEST_POST_TYPE][BYLINE_GUEST_LINKS_META]['show_in_rest'] ?? true) === false, 'Guest profile links must stay behind the explicit projection.');
contributors_test_assert(($byline_contributor_test_post_meta[BYLINE_GUEST_POST_TYPE][BYLINE_GUEST_LINKS_META]['auth_callback'] ?? '') === 'byline_guest_meta_auth_callback', 'Guest meta needs a capability callback.');

contributors_test_add_user(1, 'Primary Writer', 'primary-writer', 'https://writer.example.test');
contributors_test_add_user(2, 'Second Writer', 'second-writer');
contributors_test_add_user(3, 'Alice User', 'alice');
$byline_contributor_test_user_meta[1] = [
    '_ww_author_role' => 'Editor',
    'description' => 'Primary bio',
    '_ww_author_photo_id' => 7,
    '_ww_author_social_website' => 'https://writer.example.test/about',
    '_ww_author_social_email' => 'private@example.test',
];
contributors_test_add_story(10, 1);

$byline_contributor_test_capabilities = [
    'edit_posts' => true,
    'edit_post' => [10 => true],
    'delete_post' => [],
    'manage_byline' => true,
    // This fixture represents the existing authorized publisher path; the
    // hardening tests separately cover managers who lack publish_posts.
    'publish_posts' => true,
    'user:1:edit_posts' => true,
    'user:1:edit_post' => [10 => true],
    'user:1:manage_byline' => true,
    'user:1:publish_posts' => true,
];

$guest = byline_create_guest_contributor([
    'name' => 'Guest <script>alert(1)</script>',
    'slug' => 'guest-contributor',
    'role' => 'Community reporter <b>role</b>',
    'bio' => "Bio <script>alert(1)</script>\nSecond line",
    'imageId' => 7,
    'publicLinks' => [
        ['label' => 'Portfolio', 'url' => 'https://guest.example.test/work'],
        ['label' => 'Bad', 'url' => 'javascript:alert(1)'],
    ],
], 1);
contributors_test_assert(!is_wp_error($guest), 'An authorized editor should be able to create a guest contributor.');
contributors_test_assert(($guest['name'] ?? '') === 'Guest alert(1)', 'Guest display names must be sanitized.');
contributors_test_assert(strpos((string) ($guest['bio'] ?? ''), '<script>') === false, 'Guest bios must not retain arbitrary HTML.');
contributors_test_assert(count($guest['links'] ?? []) === 1, 'Guest links must discard unsafe URLs.');
contributors_test_assert(($guest['imageId'] ?? 0) === 7, 'Valid guest profile images must round-trip.');
contributors_test_assert(!array_key_exists('email', $guest), 'Guest projections must not contain an email field.');

$guest_id = (int) ($guest['id'] ?? 0);
$guest_updated = byline_update_guest_contributor($guest_id, ['role' => 'Guest columnist'], 1);
contributors_test_assert(!is_wp_error($guest_updated), 'A partial guest update should succeed.');
contributors_test_assert(($guest_updated['name'] ?? '') === 'Guest alert(1)', 'Partial guest updates must preserve omitted fields.');
contributors_test_assert(($guest_updated['role'] ?? '') === 'Guest columnist', 'Guest role changes must persist.');
contributors_test_assert(count($guest_updated['links'] ?? []) === 1, 'Partial guest updates must not erase links.');

$draft_guest = byline_create_guest_contributor(['name' => 'Draft Guest', 'slug' => 'draft-guest', 'status' => 'draft'], 1);
contributors_test_assert(!is_wp_error($draft_guest), 'An authorized editor should be able to create a draft guest.');
contributors_test_assert(byline_get_public_guest_contributor((int) ($draft_guest['id'] ?? 0)) === null, 'Draft guest contributors must not enter public projections.');

$user_slug_collision = byline_create_guest_contributor(['name' => 'Another Alice', 'slug' => 'alice'], 1);
contributors_test_assert(is_wp_error($user_slug_collision) && $user_slug_collision->get_error_code() === 'byline_guest_slug_conflict', 'Guest slugs must not collide with user author slugs.');

$guest_slug_collision = byline_create_guest_contributor(['name' => 'Duplicate Guest', 'slug' => 'guest-contributor'], 1);
contributors_test_assert(is_wp_error($guest_slug_collision) && $guest_slug_collision->get_error_code() === 'byline_guest_slug_conflict', 'Guest slugs must be unique among guest records.');

// Old stories have no contributor meta and resolve to post_author without a
// migration write. New lists retain that primary user while preserving order.
$fallback = byline_get_story_contributor_entries(10);
contributors_test_assert($fallback === [['type' => 'user', 'id' => 1]], 'Old single-author stories must fall back to post_author.');
contributors_test_assert(!array_key_exists(BYLINE_STORY_CONTRIBUTORS_META, $byline_contributor_test_meta[10] ?? []), 'Reading legacy authors must not write contributor metadata.');

$explicit = byline_set_story_contributors(10, [
    ['type' => 'guest', 'id' => $guest_id],
    ['type' => 'user', 'id' => 2],
], 1);
contributors_test_assert(!is_wp_error($explicit), 'An editor should be able to save ordered story contributors.');
contributors_test_assert($explicit === [
    ['type' => 'user', 'id' => 1],
    ['type' => 'guest', 'id' => $guest_id],
    ['type' => 'user', 'id' => 2],
], 'Saving contributors must retain the primary author and deterministic order.');
contributors_test_assert($byline_contributor_test_posts[10]->post_author === 1, 'Contributor editing must never rewrite post_author.');

$ordered = byline_set_story_contributors(10, [
    ['type' => 'user', 'id' => 2],
    ['type' => 'guest', 'id' => $guest_id],
    ['type' => 'user', 'id' => 1],
], 1);
contributors_test_assert($ordered === [
    ['type' => 'user', 'id' => 2],
    ['type' => 'guest', 'id' => $guest_id],
    ['type' => 'user', 'id' => 1],
], 'An explicit contributor list must preserve editor-selected order.');

$public_contributors = byline_get_post_contributors(10);
contributors_test_assert(array_column($public_contributors, 'name') === ['Second Writer', 'Guest alert(1)', 'Primary Writer'], 'Public contributors must resolve in persisted order.');
contributors_test_assert(!array_key_exists('email', $public_contributors[0]), 'User projections must not expose account emails.');
contributors_test_assert(strpos(serialize($public_contributors), 'private@example.test') === false, 'Private user profile email data must not leak through contributors.');
contributors_test_assert(($public_contributors[1]['type'] ?? '') === 'guest', 'Guest entries must project as guest contributors.');
contributors_test_assert(($public_contributors[1]['profilePhoto']['id'] ?? 0) === 7, 'Public guest contributors must expose the canonical safe profile photo shape.');

$invalid = byline_set_story_contributors(10, [
    ['type' => 'user', 'id' => 9999],
], 1);
contributors_test_assert(is_wp_error($invalid) && $invalid->get_error_code() === 'byline_unknown_contributor', 'Unknown contributor references must be rejected.');
contributors_test_assert(byline_get_story_contributor_entries(10) === $ordered, 'A rejected contributor update must not overwrite the prior order.');

// The current user capability map still permits this call; remove it and
// verify the story-level capability is the actual gate rather than menu state.
$byline_contributor_test_capabilities['edit_post'][10] = false;
$byline_contributor_test_capabilities['user:1:edit_post'][10] = false;
$unauthorized = byline_set_story_contributors(10, [['type' => 'user', 'id' => 2]], 1);
contributors_test_assert(is_wp_error($unauthorized) && $unauthorized->get_error_code() === 'byline_contributors_forbidden', 'Users without edit_post must not update story contributors.');
$byline_contributor_test_capabilities['edit_post'][10] = true;
$byline_contributor_test_capabilities['user:1:edit_post'][10] = true;

$safe_user = byline_project_user_contributor(1);
contributors_test_assert(is_array($safe_user) && !array_key_exists('email', $safe_user), 'The user public projection must omit email even when legacy email metadata exists.');
contributors_test_assert(($safe_user['links']['website'] ?? '') === 'https://writer.example.test/about', 'Allowed public profile links should be retained.');

echo "Ordered contributors and guest model regression passed.\n";
