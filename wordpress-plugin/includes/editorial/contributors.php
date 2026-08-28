<?php

/**
 * Ordered Byline contributors and guest-contributor domain.
 *
 * WordPress users remain the canonical primary author through post_author. The
 * optional story meta below stores an ordered list of additional/selected
 * contributors without changing that legacy field. A list written by the
 * editor may include the primary user at any position; old stories with no
 * list continue to resolve to post_author.
 *
 * Guest records are intentionally not public WordPress content. Public callers
 * must use the projection helpers in this file, which return only fields that
 * were explicitly intended for publication and never include account emails,
 * passwords, or other WP_User internals.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_GUEST_POST_TYPE = 'byline_guest';
const BYLINE_STORY_CONTRIBUTORS_META = '_byline_story_contributors';

const BYLINE_GUEST_DISPLAY_NAME_META = '_byline_guest_display_name';
const BYLINE_GUEST_ROLE_META = '_byline_guest_role';
const BYLINE_GUEST_BIO_META = '_byline_guest_bio';
const BYLINE_GUEST_IMAGE_ID_META = '_byline_guest_image_id';
const BYLINE_GUEST_LINKS_META = '_byline_guest_public_links';

const BYLINE_CONTRIBUTOR_MAX_PER_STORY = 32;
const BYLINE_GUEST_MAX_PUBLIC_LINKS = 8;

/**
 * Register guests as an internal WordPress-native record type.
 *
 * `public` and `show_in_rest` are both false: a guest name or bio must not
 * become anonymously enumerable through Core's post controller. The Byline
 * public REST layer can expose an explicitly projected record when it is wired
 * by the integration layer.
 */
function byline_register_guest_contributor_post_type(): void
{
    register_post_type(BYLINE_GUEST_POST_TYPE, [
        'labels' => [
            'name' => __('Guest Contributors', 'weekly-wildcat-headless'),
            'singular_name' => __('Guest Contributor', 'weekly-wildcat-headless'),
            'menu_name' => __('Guest Contributors', 'weekly-wildcat-headless'),
            'add_new_item' => __('Add Guest Contributor', 'weekly-wildcat-headless'),
            'edit_item' => __('Edit Guest Contributor', 'weekly-wildcat-headless'),
            'new_item' => __('New Guest Contributor', 'weekly-wildcat-headless'),
            'view_item' => __('View Guest Contributor', 'weekly-wildcat-headless'),
            'search_items' => __('Search Guest Contributors', 'weekly-wildcat-headless'),
            'not_found' => __('No guest contributors found.', 'weekly-wildcat-headless'),
            'not_found_in_trash' => __('No guest contributors in the trash.', 'weekly-wildcat-headless'),
            'all_items' => __('Guest Contributors', 'weekly-wildcat-headless'),
        ],
        'public' => false,
        'publicly_queryable' => false,
        'show_ui' => true,
        'show_in_menu' => false,
        'show_in_nav_menus' => false,
        'show_in_admin_bar' => false,
        'show_in_rest' => false,
        'rewrite' => false,
        'query_var' => false,
        'has_archive' => false,
        'hierarchical' => false,
        'supports' => ['title', 'author'],
        // Use Core's post capabilities so WordPress 6.6 installations do not
        // need a capability migration just to create a guest record.
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'byline_register_guest_contributor_post_type');

/**
 * Safely turn a scalar value into a bounded plain-text value.
 */
function byline_guest_sanitize_text($value, int $max_length = 240): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = sanitize_text_field((string) $value);

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $max_length);
    }

    return substr($value, 0, $max_length);
}

function byline_guest_sanitize_bio($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    // A plain-text bio is enough for a byline and avoids an untrusted HTML
    // surface in public author cards. Preserve line breaks where Core offers
    // its textarea sanitizer.
    $bio = function_exists('sanitize_textarea_field')
        ? sanitize_textarea_field((string) $value)
        : byline_guest_sanitize_text($value, 1000);

    if (function_exists('mb_substr')) {
        return mb_substr($bio, 0, 1000);
    }

    return substr($bio, 0, 1000);
}

function byline_guest_sanitize_slug($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $value = (string) $value;
    if (function_exists('sanitize_title')) {
        return sanitize_title($value);
    }

    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/i', '-', $value);

    return trim((string) $value, '-');
}

/**
 * Only explicitly public links are retained. In particular, a link labelled
 * "email" is not accepted as a special/private account field; a `mailto:` URL
 * may be supplied only when the editor intentionally chooses to publish it.
 *
 * @param mixed $value
 * @return array<int,array{label:string,url:string}>
 */
function byline_guest_sanitize_links($value): array
{
    if (is_string($value)) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($value)) {
        return [];
    }

    $links = [];
    $seen = [];

    // Accepting a keyed map makes the helper pleasant for REST clients while
    // storing one stable list shape in post meta.
    $is_list = array_keys($value) === range(0, count($value) - 1);
    if (!$is_list) {
        $mapped = [];
        foreach ($value as $label => $url) {
            $mapped[] = ['label' => $label, 'url' => $url];
        }
        $value = $mapped;
    }

    foreach (array_slice($value, 0, BYLINE_GUEST_MAX_PUBLIC_LINKS) as $link) {
        if (is_string($link)) {
            $link = ['url' => $link];
        }

        if (!is_array($link)) {
            continue;
        }

        $url = is_scalar($link['url'] ?? null) ? (string) $link['url'] : '';
        $url = function_exists('esc_url_raw')
            ? esc_url_raw($url, ['http', 'https', 'mailto'])
            : '';
        if ($url === '') {
            continue;
        }

        $label_source = $link['label'] ?? ($link['service'] ?? '');
        $label = byline_guest_sanitize_text($label_source, 60);
        if ($label === '') {
            $label = 'Link';
        }

        $dedupe_key = strtolower($url);
        if (isset($seen[$dedupe_key])) {
            continue;
        }

        $seen[$dedupe_key] = true;
        $links[] = ['label' => $label, 'url' => $url];
    }

    return $links;
}

function byline_guest_sanitize_image_id($value): int
{
    $image_id = absint($value);
    if ($image_id <= 0) {
        return 0;
    }

    if (function_exists('get_post_type') && get_post_type($image_id) !== 'attachment') {
        return 0;
    }

    if (function_exists('wp_attachment_is_image') && !wp_attachment_is_image($image_id)) {
        return 0;
    }

    return $image_id;
}

/**
 * Normalise the stored typed-reference list without making a write.
 *
 * @param mixed $value
 * @return array<int,array{type:string,id:int}>
 */
function byline_sanitize_story_contributors($value): array
{
    if (is_string($value)) {
        $decoded = json_decode($value, true);
        $value = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($value)) {
        return [];
    }

    $contributors = [];
    $seen = [];

    foreach (array_slice($value, 0, BYLINE_CONTRIBUTOR_MAX_PER_STORY) as $row) {
        if (!is_array($row)) {
            continue;
        }

        $type = sanitize_key((string) ($row['type'] ?? ($row['kind'] ?? '')));
        $id = absint($row['id'] ?? 0);

        // Be liberal when reading client payloads, but always store the one
        // canonical shape. This also supports {userId: 4}/{guestId: 9} from
        // early editor clients without making the persisted contract diverge.
        if ($type === '' && isset($row['userId'])) {
            $type = 'user';
            $id = absint($row['userId']);
        } elseif ($type === '' && isset($row['guestId'])) {
            $type = 'guest';
            $id = absint($row['guestId']);
        }

        if (!in_array($type, ['user', 'guest'], true) || $id <= 0) {
            continue;
        }

        $key = $type . ':' . $id;
        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $contributors[] = ['type' => $type, 'id' => $id];
    }

    return $contributors;
}

function byline_guest_contributor_post(int $guest_id): ?WP_Post
{
    $guest_id = absint($guest_id);
    if ($guest_id <= 0 || !function_exists('get_post')) {
        return null;
    }

    $post = get_post($guest_id);

    return $post instanceof WP_Post && $post->post_type === BYLINE_GUEST_POST_TYPE ? $post : null;
}

function byline_guest_is_public(int $guest_id): bool
{
    $post = byline_guest_contributor_post($guest_id);

    return $post instanceof WP_Post && $post->post_status === 'publish';
}

/**
 * Return the guest slug records that would collide with a public slug.
 *
 * User nicenames live in a separate table from post slugs, so Core's normal
 * `wp_unique_post_slug()` does not protect this namespace. We check both
 * namespaces before creating/updating a guest record.
 *
 * @return array<int,array{type:string,id:int,slug:string}>
 */
function byline_guest_slug_conflicts(string $slug, int $exclude_guest_id = 0): array
{
    $slug = byline_guest_sanitize_slug($slug);
    if ($slug === '') {
        return [];
    }

    $conflicts = [];

    if (function_exists('get_user_by')) {
        $user = get_user_by('slug', $slug);
        if ($user instanceof WP_User) {
            $conflicts[] = ['type' => 'user', 'id' => (int) $user->ID, 'slug' => $slug];
        }
    }

    if (function_exists('get_posts')) {
        $posts = get_posts([
            'post_type' => BYLINE_GUEST_POST_TYPE,
            'post_status' => 'any',
            'name' => $slug,
            'posts_per_page' => 20,
            'no_found_rows' => true,
        ]);

        foreach (is_array($posts) ? $posts : [] as $post) {
            $post_id = is_object($post) ? absint($post->ID ?? 0) : absint($post['ID'] ?? 0);
            $post_slug = is_object($post) ? (string) ($post->post_name ?? '') : (string) ($post['post_name'] ?? '');
            if ($post_id <= 0 || $post_id === $exclude_guest_id || byline_guest_sanitize_slug($post_slug) !== $slug) {
                continue;
            }

            $conflicts[] = ['type' => 'guest', 'id' => $post_id, 'slug' => $slug];
        }
    }

    return $conflicts;
}

function byline_guest_slug_is_available(string $slug, int $exclude_guest_id = 0): bool
{
    return byline_guest_sanitize_slug($slug) !== '' && byline_guest_slug_conflicts($slug, $exclude_guest_id) === [];
}

function byline_guest_public_slug(int $guest_id): string
{
    $post = byline_guest_contributor_post($guest_id);
    if (!$post instanceof WP_Post) {
        return '';
    }

    $slug = byline_guest_sanitize_slug((string) $post->post_name);
    if ($slug !== '') {
        return $slug;
    }

    return byline_guest_sanitize_slug((string) $post->post_title);
}

/**
 * Fetch a guest record in the public-safe domain shape.
 *
 * Draft/trashed records can still be fetched by an authorised editor through
 * the internal REST layer, but `byline_get_public_guest_contributor()` filters
 * them before a public response is made.
 */
function byline_get_guest_contributor(int $guest_id): ?array
{
    $post = byline_guest_contributor_post($guest_id);
    if (!$post instanceof WP_Post) {
        return null;
    }

    $display_name = byline_guest_sanitize_text(get_post_meta($guest_id, BYLINE_GUEST_DISPLAY_NAME_META, true), 120);
    if ($display_name === '') {
        $display_name = byline_guest_sanitize_text($post->post_title, 120);
    }

    if ($display_name === '') {
        return null;
    }

    return [
        'type' => 'guest',
        'id' => $guest_id,
        'name' => $display_name,
        'displayName' => $display_name,
        'slug' => byline_guest_public_slug($guest_id),
        'role' => byline_guest_sanitize_text(get_post_meta($guest_id, BYLINE_GUEST_ROLE_META, true), 120),
        'bio' => byline_guest_sanitize_bio(get_post_meta($guest_id, BYLINE_GUEST_BIO_META, true)),
        'imageId' => byline_guest_sanitize_image_id(get_post_meta($guest_id, BYLINE_GUEST_IMAGE_ID_META, true)),
        'links' => byline_guest_sanitize_links(get_post_meta($guest_id, BYLINE_GUEST_LINKS_META, true)),
    ];
}

function byline_get_public_guest_contributor(int $guest_id): ?array
{
    if (!byline_guest_is_public($guest_id)) {
        return null;
    }

    return byline_get_guest_contributor($guest_id);
}

function byline_guest_public_url($value, array $protocols = ['http', 'https']): string
{
    if (!function_exists('esc_url_raw')) {
        return '';
    }

    return (string) esc_url_raw((string) $value, $protocols);
}

/**
 * Read the existing Byline/legacy user profile fields without copying private
 * account data into the contributor projection. Email is deliberately not a
 * supported key here even though the legacy profile editor has an email field.
 */
function byline_project_user_contributor(int $user_id): ?array
{
    if ($user_id <= 0 || !function_exists('get_user_by')) {
        return null;
    }

    $user = get_user_by('id', $user_id);
    if (!$user instanceof WP_User) {
        return null;
    }

    $name = byline_guest_sanitize_text($user->display_name ?? '', 120);
    if ($name === '') {
        return null;
    }

    $slug = byline_guest_sanitize_slug($user->user_nicename ?? '');
    if ($slug === '') {
        $slug = byline_guest_sanitize_slug($name);
    }

    $role = '';
    $bio = '';
    $image_id = 0;
    $links = [];

    if (function_exists('get_user_meta')) {
        $role = byline_guest_sanitize_text(get_user_meta($user_id, '_ww_author_role', true), 120);
        $bio = byline_guest_sanitize_bio(get_user_meta($user_id, 'description', true));
        $image_id = byline_guest_sanitize_image_id(get_user_meta($user_id, '_ww_author_photo_id', true));

        // These are publication-facing profile links. The legacy email field
        // is intentionally omitted from this allow-list.
        foreach (['website', 'instagram', 'tiktok', 'linkedin', 'x'] as $key) {
            $url = byline_guest_public_url(get_user_meta($user_id, '_ww_author_social_' . $key, true));
            if ($url !== '') {
                $links[$key] = $url;
            }
        }
    }

    $link = function_exists('get_author_posts_url')
        ? (string) get_author_posts_url($user_id, $slug)
        : '';

    return [
        'type' => 'user',
        'id' => $user_id,
        'name' => $name,
        'displayName' => $name,
        'slug' => $slug,
        'url' => byline_guest_public_url($user->user_url ?? ''),
        'link' => $link,
        'role' => $role,
        'bio' => $bio,
        'imageId' => $image_id,
        'links' => $links,
    ];
}

function byline_project_public_contributor(array $reference): ?array
{
    $type = (string) ($reference['type'] ?? '');
    $id = absint($reference['id'] ?? 0);

    if ($type === 'user') {
        return byline_project_user_contributor($id);
    }

    if ($type === 'guest') {
        return byline_get_public_guest_contributor($id);
    }

    return null;
}

function byline_story_contributor_reference_exists(array $reference): bool
{
    $type = (string) ($reference['type'] ?? '');
    $id = absint($reference['id'] ?? 0);

    if ($id <= 0) {
        return false;
    }

    if ($type === 'user') {
        return function_exists('get_user_by') && get_user_by('id', $id) instanceof WP_User;
    }

    if ($type === 'guest') {
        return byline_guest_contributor_post($id) instanceof WP_Post;
    }

    return false;
}

/**
 * Keep post_author represented whenever an explicit list is written. It can
 * still appear after a guest/user entry, which lets the editor reorder the
 * complete byline while making it impossible to accidentally erase the legacy
 * primary author identity.
 *
 * @param array<int,array{type:string,id:int}> $contributors
 * @return array<int,array{type:string,id:int}>
 */
function byline_story_contributors_preserve_primary(int $post_id, array $contributors): array
{
    if (!function_exists('get_post')) {
        return $contributors;
    }

    $post = get_post($post_id);
    $primary_id = $post instanceof WP_Post ? absint($post->post_author) : 0;
    if ($primary_id <= 0 || !byline_story_contributor_reference_exists(['type' => 'user', 'id' => $primary_id])) {
        return $contributors;
    }

    foreach ($contributors as $reference) {
        if (($reference['type'] ?? '') === 'user' && absint($reference['id'] ?? 0) === $primary_id) {
            return $contributors;
        }
    }

    array_unshift($contributors, ['type' => 'user', 'id' => $primary_id]);

    return array_slice($contributors, 0, BYLINE_CONTRIBUTOR_MAX_PER_STORY);
}

/**
 * Read ordered refs. This function never writes on read, so legacy posts and
 * malformed historical records remain recoverable and diagnosable.
 *
 * @return array<int,array{type:string,id:int}>
 */
function byline_get_story_contributor_entries(int $post_id, bool $include_primary_fallback = true): array
{
    $post_id = absint($post_id);
    if ($post_id <= 0) {
        return [];
    }

    $stored = function_exists('get_post_meta')
        ? get_post_meta($post_id, BYLINE_STORY_CONTRIBUTORS_META, true)
        : [];
    $contributors = byline_sanitize_story_contributors($stored);

    // Drop references that no longer resolve. We do not delete them from meta
    // here; an editor can inspect and repair a stale list through REST.
    $contributors = array_values(array_filter(
        $contributors,
        'byline_story_contributor_reference_exists'
    ));

    if ($contributors !== []) {
        return byline_story_contributors_preserve_primary($post_id, $contributors);
    }

    if (!$include_primary_fallback || !function_exists('get_post')) {
        return [];
    }

    $post = get_post($post_id);
    $primary_id = $post instanceof WP_Post ? absint($post->post_author) : 0;

    return $primary_id > 0 && byline_story_contributor_reference_exists(['type' => 'user', 'id' => $primary_id])
        ? [['type' => 'user', 'id' => $primary_id]]
        : [];
}

/**
 * Public-safe contributor objects in persisted order.
 *
 * @return array<int,array<string,mixed>>
 */
function byline_get_story_contributors(int $post_id): array
{
    $contributors = [];

    foreach (byline_get_story_contributor_entries($post_id, true) as $reference) {
        $projected = byline_project_public_contributor($reference);
        if ($projected !== null) {
            $contributors[] = $projected;
        }
    }

    return $contributors;
}

/** Compatibility/readability alias for frontend and REST adapters. */
function byline_get_post_contributors(int $post_id): array
{
    return byline_get_story_contributors($post_id);
}

function byline_get_public_story_contributors(int $post_id): array
{
    $post = function_exists('get_post') ? get_post($post_id) : null;
    if (!$post instanceof WP_Post || $post->post_type !== 'post' || $post->post_status !== 'publish') {
        return [];
    }

    return byline_get_story_contributors($post_id);
}

function byline_story_contributors_can_edit(int $post_id, ?int $user_id = null): bool
{
    if ($user_id === null) {
        return current_user_can('edit_post', $post_id);
    }

    return user_can($user_id, 'edit_post', $post_id);
}

function byline_guest_can_create(?int $user_id = null): bool
{
    if ($user_id === null) {
        return current_user_can('edit_posts') || current_user_can('manage_byline');
    }

    return user_can($user_id, 'edit_posts') || user_can($user_id, 'manage_byline');
}

function byline_guest_can_edit(int $guest_id, ?int $user_id = null): bool
{
    if ($user_id === null) {
        return current_user_can('manage_byline') || current_user_can('edit_post', $guest_id);
    }

    return user_can($user_id, 'manage_byline') || user_can($user_id, 'edit_post', $guest_id);
}

/**
 * Validate and persist a complete ordered story contributor list.
 *
 * @param array<int,mixed> $contributors
 * @return array<int,array{type:string,id:int}|WP_Error>|WP_Error
 */
function byline_set_story_contributors(int $post_id, array $contributors, ?int $user_id = null)
{
    $post_id = absint($post_id);
    if (!function_exists('get_post') || !(get_post($post_id) instanceof WP_Post) || get_post($post_id)->post_type !== 'post') {
        return new WP_Error('byline_unknown_story', 'This story does not exist.', ['status' => 404]);
    }

    if (!byline_story_contributors_can_edit($post_id, $user_id)) {
        return new WP_Error('byline_contributors_forbidden', 'You cannot edit this story\'s contributors.', ['status' => 403]);
    }

    $normalised = byline_sanitize_story_contributors($contributors);
    if (count($normalised) !== count($contributors)) {
        return new WP_Error('byline_invalid_contributors', 'Every contributor must reference one existing user or guest contributor.', ['status' => 400]);
    }

    foreach ($normalised as $reference) {
        if (!byline_story_contributor_reference_exists($reference)) {
            return new WP_Error('byline_unknown_contributor', 'One of the selected contributors no longer exists.', ['status' => 400]);
        }
    }

    $normalised = byline_story_contributors_preserve_primary($post_id, $normalised);

    if ($normalised === []) {
        delete_post_meta($post_id, BYLINE_STORY_CONTRIBUTORS_META);
    } else {
        update_post_meta($post_id, BYLINE_STORY_CONTRIBUTORS_META, $normalised);
    }

    do_action('byline_story_contributors_updated', $post_id, $normalised, $user_id);

    return $normalised;
}

/** Compatibility alias used by editorial REST adapters. */
function byline_update_story_contributors(int $post_id, array $contributors, ?int $user_id = null)
{
    return byline_set_story_contributors($post_id, $contributors, $user_id);
}

function byline_contributors_meta_auth_callback($allowed, string $meta_key, int $object_id, int $user_id = 0): bool
{
    return byline_story_contributors_can_edit($object_id, $user_id > 0 ? $user_id : null);
}

function byline_guest_meta_auth_callback($allowed, string $meta_key, int $object_id, int $user_id = 0): bool
{
    return byline_guest_can_edit($object_id, $user_id > 0 ? $user_id : null);
}

function byline_register_contributor_meta(): void
{
    register_post_meta('post', BYLINE_STORY_CONTRIBUTORS_META, [
        'single' => true,
        'type' => 'array',
        'sanitize_callback' => 'byline_sanitize_story_contributors',
        'show_in_rest' => false,
        'auth_callback' => 'byline_contributors_meta_auth_callback',
    ]);

    foreach ([
        BYLINE_GUEST_DISPLAY_NAME_META => ['type' => 'string', 'sanitize_callback' => 'byline_guest_sanitize_text'],
        BYLINE_GUEST_ROLE_META => ['type' => 'string', 'sanitize_callback' => 'byline_guest_sanitize_text'],
        BYLINE_GUEST_BIO_META => ['type' => 'string', 'sanitize_callback' => 'byline_guest_sanitize_bio'],
        BYLINE_GUEST_IMAGE_ID_META => ['type' => 'integer', 'sanitize_callback' => 'byline_guest_sanitize_image_id'],
        BYLINE_GUEST_LINKS_META => ['type' => 'array', 'sanitize_callback' => 'byline_guest_sanitize_links'],
    ] as $key => $definition) {
        register_post_meta(BYLINE_GUEST_POST_TYPE, $key, [
            'single' => true,
            'type' => $definition['type'],
            'sanitize_callback' => $definition['sanitize_callback'],
            'show_in_rest' => false,
            'auth_callback' => 'byline_guest_meta_auth_callback',
        ]);
    }
}
add_action('init', 'byline_register_contributor_meta');

/** @param array<string,mixed> $input */
function byline_normalize_guest_input(array $input, string $fallback_title = ''): array
{
    $display_name = byline_guest_sanitize_text($input['displayName'] ?? $input['name'] ?? $fallback_title, 120);
    $slug = byline_guest_sanitize_slug($input['slug'] ?? '');
    if ($slug === '' && $display_name !== '') {
        $slug = byline_guest_sanitize_slug($display_name);
    }

    return [
        'displayName' => $display_name,
        'slug' => $slug,
        'role' => byline_guest_sanitize_text($input['role'] ?? $input['title'] ?? '', 120),
        'bio' => byline_guest_sanitize_bio($input['bio'] ?? $input['shortBio'] ?? ''),
        'imageId' => byline_guest_sanitize_image_id($input['imageId'] ?? $input['profileImageId'] ?? 0),
        'links' => byline_guest_sanitize_links($input['links'] ?? $input['publicLinks'] ?? []),
    ];
}

function byline_guest_store_fields(int $guest_id, array $data): void
{
    $fields = [
        'displayName' => BYLINE_GUEST_DISPLAY_NAME_META,
        'role' => BYLINE_GUEST_ROLE_META,
        'bio' => BYLINE_GUEST_BIO_META,
        'imageId' => BYLINE_GUEST_IMAGE_ID_META,
        'links' => BYLINE_GUEST_LINKS_META,
    ];

    foreach ($fields as $field => $key) {
        if (!array_key_exists($field, $data)) {
            continue;
        }

        $value = $field === 'imageId' ? absint($data[$field]) : $data[$field];
        $empty = $value === '' || $value === [] || $value === 0;
        if ($empty) {
            delete_post_meta($guest_id, $key);
        } else {
            update_post_meta($guest_id, $key, $value);
        }
    }
}

/**
 * Create a guest contributor. The default status is publish because the
 * record itself contains only explicitly public-facing profile data; callers
 * can request draft status until an editor is ready to use it publicly.
 */
function byline_create_guest_contributor(array $input, ?int $user_id = null)
{
    if (!byline_guest_can_create($user_id)) {
        return new WP_Error('byline_guest_forbidden', 'You cannot create guest contributors.', ['status' => 403]);
    }

    $data = byline_normalize_guest_input($input);
    if ($data['displayName'] === '' || $data['slug'] === '') {
        return new WP_Error('byline_guest_invalid', 'A guest contributor name is required.', ['status' => 400]);
    }

    if (!byline_guest_slug_is_available($data['slug'])) {
        return new WP_Error('byline_guest_slug_conflict', 'That guest contributor slug is already used by a user or guest contributor.', ['status' => 409]);
    }

    if (!function_exists('wp_insert_post')) {
        return new WP_Error('byline_guest_unavailable', 'Guest contributor storage is unavailable.', ['status' => 500]);
    }

    $post_author = $user_id !== null && $user_id > 0 ? $user_id : (function_exists('get_current_user_id') ? get_current_user_id() : 0);
    $status = sanitize_key((string) ($input['status'] ?? 'publish'));
    $status = in_array($status, ['draft', 'publish'], true) ? $status : 'draft';
    $guest_id = wp_insert_post([
        'post_type' => BYLINE_GUEST_POST_TYPE,
        'post_status' => $status,
        'post_title' => $data['displayName'],
        'post_name' => $data['slug'],
        'post_author' => absint($post_author),
    ], true);

    if (is_wp_error($guest_id)) {
        return $guest_id;
    }

    $guest_id = absint($guest_id);
    if ($guest_id <= 0) {
        return new WP_Error('byline_guest_create_failed', 'The guest contributor could not be created.', ['status' => 500]);
    }

    byline_guest_store_fields($guest_id, $data);

    return byline_get_guest_contributor($guest_id);
}

/**
 * Update only fields supplied by the caller. Empty supplied values clear the
 * corresponding public profile field; absent values stay unchanged.
 */
function byline_update_guest_contributor(int $guest_id, array $input, ?int $user_id = null)
{
    $post = byline_guest_contributor_post($guest_id);
    if (!$post instanceof WP_Post) {
        return new WP_Error('byline_guest_not_found', 'That guest contributor does not exist.', ['status' => 404]);
    }

    if (!byline_guest_can_edit($guest_id, $user_id)) {
        return new WP_Error('byline_guest_forbidden', 'You cannot edit this guest contributor.', ['status' => 403]);
    }

    $existing = byline_get_guest_contributor($guest_id) ?? [];
    $data = byline_normalize_guest_input($input, (string) ($existing['displayName'] ?? $post->post_title));
    $has_name = array_key_exists('displayName', $input) || array_key_exists('name', $input);
    $has_slug = array_key_exists('slug', $input);

    if ($has_name && $data['displayName'] === '') {
        return new WP_Error('byline_guest_invalid', 'A guest contributor name cannot be empty.', ['status' => 400]);
    }

    $requested_slug = $has_slug ? $data['slug'] : byline_guest_public_slug($guest_id);
    if ($requested_slug === '') {
        $requested_slug = byline_guest_sanitize_slug($data['displayName']);
    }
    if ($requested_slug === '' || !byline_guest_slug_is_available($requested_slug, $guest_id)) {
        return new WP_Error('byline_guest_slug_conflict', 'That guest contributor slug is already used by a user or guest contributor.', ['status' => 409]);
    }

    $post_changes = ['ID' => $guest_id];
    if ($has_name) {
        $post_changes['post_title'] = $data['displayName'];
    }
    if ($has_slug || $requested_slug !== (string) $post->post_name) {
        $post_changes['post_name'] = $requested_slug;
    }

    if (count($post_changes) > 1 && function_exists('wp_update_post')) {
        $updated = wp_update_post($post_changes, true);
        if (is_wp_error($updated)) {
            return $updated;
        }
    }

    if ($has_name) {
        update_post_meta($guest_id, BYLINE_GUEST_DISPLAY_NAME_META, $data['displayName']);
    }

    $field_input = [];
    if (array_key_exists('role', $input) || array_key_exists('title', $input)) {
        $field_input['role'] = $data['role'];
    }
    if (array_key_exists('bio', $input) || array_key_exists('shortBio', $input)) {
        $field_input['bio'] = $data['bio'];
    }
    if (array_key_exists('imageId', $input) || array_key_exists('profileImageId', $input)) {
        $field_input['imageId'] = $data['imageId'];
    }
    if (array_key_exists('links', $input) || array_key_exists('publicLinks', $input)) {
        $field_input['links'] = $data['links'];
    }
    if ($field_input !== []) {
        byline_guest_store_fields($guest_id, $field_input);
    }

    return byline_get_guest_contributor($guest_id);
}

function byline_delete_guest_contributor(int $guest_id, ?int $user_id = null, bool $force = false)
{
    if (!(byline_guest_contributor_post($guest_id) instanceof WP_Post)) {
        return new WP_Error('byline_guest_not_found', 'That guest contributor does not exist.', ['status' => 404]);
    }

    if ($user_id === null) {
        $can_delete = current_user_can('manage_byline') || current_user_can('delete_post', $guest_id);
    } else {
        $can_delete = user_can($user_id, 'manage_byline') || user_can($user_id, 'delete_post', $guest_id);
    }
    if (!$can_delete) {
        return new WP_Error('byline_guest_forbidden', 'You cannot delete this guest contributor.', ['status' => 403]);
    }

    if (!function_exists('wp_delete_post')) {
        return new WP_Error('byline_guest_unavailable', 'Guest contributor storage is unavailable.', ['status' => 500]);
    }

    return (bool) wp_delete_post($guest_id, $force);
}
