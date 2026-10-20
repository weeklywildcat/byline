<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_PRESENCE_META = '_byline_presence';
const BYLINE_PRESENCE_ACTIVE_SECONDS = 90;
const BYLINE_PRESENCE_AWAY_SECONDS = 300;
const BYLINE_PRESENCE_RECENT_SECONDS = 86400;

/**
 * Presence is intentionally a newsroom-only admin feature. Contributors have
 * edit_posts, so this includes the people who can actually work in Byline
 * without exposing staff activity to public visitors or subscriber accounts.
 */
function byline_presence_available(): bool
{
    return is_admin() && is_user_logged_in() && current_user_can('edit_posts');
}

function byline_presence_text($value, int $max_length = 120): string
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

/**
 * Accept only the small server-generated location shape echoed by the client.
 * Never store arbitrary admin query strings: a same-admin-origin URL is the
 * only href that may survive the heartbeat round trip.
 */
function byline_presence_sanitize_location($value): array
{
    if (!is_array($value)) {
        return [];
    }

    $location = [
        'kind' => sanitize_key((string) ($value['kind'] ?? 'screen')) ?: 'screen',
        'label' => byline_presence_text($value['label'] ?? '', 120),
    ];

    $detail = byline_presence_text($value['detail'] ?? '', 120);
    if ($detail !== '') {
        $location['detail'] = $detail;
    }

    $story_id = absint($value['storyId'] ?? 0);
    if ($story_id > 0) {
        $location['storyId'] = $story_id;
    }

    $href = is_scalar($value['href'] ?? null) ? esc_url_raw((string) $value['href']) : '';
    $admin_base = rtrim(admin_url(), '/') . '/';
    if ($href !== '' && $admin_base !== '' && strpos($href, $admin_base) === 0) {
        $location['href'] = $href;
    }

    if ($location['label'] === '') {
        $location['label'] = 'WordPress admin';
    }

    return $location;
}

function byline_presence_session_id($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    return substr((string) preg_replace('/[^A-Za-z0-9_-]/', '', (string) $value), 0, 64);
}

/**
 * Build a safe, human-readable current location before the page leaves PHP.
 * The browser echoes this object back with heartbeats; no raw window.location
 * value or nonce-bearing query string is ever persisted.
 */
function byline_presence_current_location(): array
{
    $page = function_exists('byline_admin_current_page') ? byline_admin_current_page() : '';
    $story_id = function_exists('byline_admin_workspace_story_id') ? byline_admin_workspace_story_id() : 0;

    if ($story_id > 0) {
        $title = function_exists('get_the_title') ? byline_presence_text(get_the_title($story_id), 120) : '';
        return [
            'kind' => 'story',
            'label' => $title !== '' ? $title : 'Story workspace',
            'detail' => 'Story workspace',
            'storyId' => $story_id,
            'href' => function_exists('byline_admin_page_url')
                ? byline_admin_page_url(BYLINE_ADMIN_PLANNING_PAGE, ['tab' => 'stories', 'story' => $story_id])
                : admin_url('admin.php?page=byline-planning&tab=stories&story=' . $story_id),
        ];
    }

    if ($page === BYLINE_ADMIN_PLANNING_PAGE && function_exists('byline_admin_planning_menu_items')) {
        $tab = function_exists('byline_admin_query_key') ? byline_admin_query_key('tab') : '';
        $tab = $tab !== '' ? $tab : 'today';
        $items = byline_admin_planning_menu_items();
        $label = isset($items[$tab]) ? (string) $items[$tab] : 'Planning';
        return [
            'kind' => 'planning',
            'label' => $label,
            'detail' => 'Planning',
            'href' => function_exists('byline_admin_page_url')
                ? byline_admin_page_url(BYLINE_ADMIN_PLANNING_PAGE, ['tab' => $tab])
                : admin_url('admin.php?page=byline-planning&tab=' . rawurlencode($tab)),
        ];
    }

    if ($page === BYLINE_ADMIN_PAGE) {
        return ['kind' => 'byline', 'label' => 'Today', 'detail' => 'Byline', 'href' => byline_admin_page_url(BYLINE_ADMIN_PAGE)];
    }
    if ($page === BYLINE_ADMIN_SETTINGS_PAGE) {
        return ['kind' => 'settings', 'label' => 'Settings', 'detail' => 'Byline', 'href' => byline_admin_page_url(BYLINE_ADMIN_SETTINGS_PAGE)];
    }
    if ($page === BYLINE_ADMIN_NEWSLETTERS_PAGE) {
        return ['kind' => 'newsletters', 'label' => 'Newsletters', 'detail' => 'Byline', 'href' => byline_admin_page_url(BYLINE_ADMIN_NEWSLETTERS_PAGE)];
    }

    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    $base = is_object($screen) && isset($screen->base) ? (string) $screen->base : '';
    $post_type = is_object($screen) && isset($screen->post_type) ? (string) $screen->post_type : '';

    if ($base === 'post') {
        $post_id = isset($_GET['post']) && is_scalar($_GET['post']) ? absint(wp_unslash($_GET['post'])) : 0;
        $type = $post_type !== '' && function_exists('get_post_type_object') ? get_post_type_object($post_type) : null;
        $singular = is_object($type) && isset($type->labels->singular_name) ? (string) $type->labels->singular_name : ($post_type === 'page' ? 'Page' : 'Article');
        $title = $post_id > 0 && function_exists('get_the_title') ? byline_presence_text(get_the_title($post_id), 120) : '';
        $href = $post_id > 0 && function_exists('get_edit_post_link') ? (string) get_edit_post_link($post_id, 'raw') : '';
        return array_filter([
            'kind' => 'editor',
            'label' => $title !== '' ? $title : 'New ' . strtolower($singular),
            'detail' => 'Editing ' . strtolower($singular),
            'href' => $href,
        ]);
    }

    if ($base === 'edit' && $post_type !== '' && function_exists('get_post_type_object')) {
        $type = get_post_type_object($post_type);
        $label = is_object($type) && isset($type->labels->name) ? (string) $type->labels->name : 'Content';
        return ['kind' => 'content', 'label' => byline_presence_text($label, 120), 'detail' => 'WordPress'];
    }

    $screen_labels = [
        'dashboard' => 'Dashboard',
        'upload' => 'Media Library',
        'media' => 'Media',
        'users' => 'Users',
        'user-edit' => 'User profile',
        'profile' => 'Profile',
        'comments' => 'Comments',
        'plugins' => 'Plugins',
        'themes' => 'Themes',
    ];
    if (isset($screen_labels[$base])) {
        return ['kind' => 'screen', 'label' => $screen_labels[$base], 'detail' => 'WordPress'];
    }

    $title = function_exists('get_admin_page_title') ? byline_presence_text(wp_strip_all_tags((string) get_admin_page_title()), 120) : '';
    return ['kind' => 'screen', 'label' => $title !== '' ? $title : 'WordPress admin', 'detail' => 'WordPress'];
}

function byline_presence_status(array $record, ?int $now = null): string
{
    $now = $now ?? time();
    $last_seen = absint($record['lastSeen'] ?? 0);
    if ($last_seen <= 0) {
        return 'offline';
    }

    $age = max(0, $now - $last_seen);
    $state = ($record['state'] ?? '') === 'away' ? 'away' : 'active';
    if ($state === 'active' && $age <= BYLINE_PRESENCE_ACTIVE_SECONDS) {
        return 'active';
    }
    if ($age <= BYLINE_PRESENCE_AWAY_SECONDS) {
        return 'away';
    }

    return 'offline';
}

/**
 * Write one tab's heartbeat without letting a hidden/idle tab overwrite a
 * different tab that is still actively being used.
 */
function byline_presence_touch(int $user_id, string $state, array $location, string $session_id, ?int $now = null): array
{
    $user_id = absint($user_id);
    if ($user_id <= 0) {
        return [];
    }

    $now = $now ?? time();
    $state = $state === 'away' ? 'away' : 'active';
    $session_id = byline_presence_session_id($session_id);
    $location = byline_presence_sanitize_location($location);
    $existing = get_user_meta($user_id, BYLINE_PRESENCE_META, true);
    $existing = is_array($existing) ? $existing : [];

    $existing_seen = absint($existing['lastSeen'] ?? 0);
    $existing_session = byline_presence_session_id($existing['sessionId'] ?? '');
    if (
        $state === 'away'
        && ($existing['state'] ?? '') === 'active'
        && $existing_session !== ''
        && $existing_session !== $session_id
        && $existing_seen >= ($now - BYLINE_PRESENCE_ACTIVE_SECONDS)
    ) {
        return $existing;
    }

    $record = [
        'lastSeen' => $now,
        'state' => $state,
        'sessionId' => $session_id,
        'location' => $location,
    ];
    update_user_meta($user_id, BYLINE_PRESENCE_META, $record);

    return $record;
}

function byline_presence_avatar_url(int $user_id): string
{
    if (function_exists('byline_editorial_rest_user_person')) {
        $person = byline_editorial_rest_user_person($user_id);
        if (is_array($person) && is_scalar($person['avatarUrl'] ?? null)) {
            $url = esc_url_raw((string) $person['avatarUrl']);
            if ($url !== '') {
                return $url;
            }
        }
    }

    if (function_exists('get_avatar_url')) {
        $avatar = get_avatar_url($user_id, ['size' => 96]);
        return is_string($avatar) ? esc_url_raw($avatar) : '';
    }

    return '';
}

function byline_presence_person($user, ?int $now = null): ?array
{
    if (!$user instanceof WP_User || !user_can($user, 'edit_posts')) {
        return null;
    }

    $now = $now ?? time();
    $record = get_user_meta((int) $user->ID, BYLINE_PRESENCE_META, true);
    $record = is_array($record) ? $record : [];
    $last_seen = absint($record['lastSeen'] ?? 0);
    $status = byline_presence_status($record, $now);
    $location = is_array($record['location'] ?? null) ? byline_presence_sanitize_location($record['location']) : [];

    return [
        'id' => (int) $user->ID,
        'name' => byline_presence_text($user->display_name, 120),
        'avatarUrl' => byline_presence_avatar_url((int) $user->ID),
        'status' => $status,
        'lastSeen' => $last_seen > 0 ? $last_seen : null,
        'location' => $status !== 'offline' && $location ? $location : null,
        'current' => (int) $user->ID === get_current_user_id(),
    ];
}

/** @return array<int,array<string,mixed>> */
function byline_presence_people(?int $now = null): array
{
    $now = $now ?? time();
    $users = get_users([
        'capability' => 'edit_posts',
        'number' => 100,
        'orderby' => 'display_name',
        'order' => 'ASC',
    ]);
    $people = [];
    foreach ($users as $user) {
        $person = byline_presence_person($user, $now);
        if ($person !== null) {
            $people[] = $person;
        }
    }

    $rank = ['active' => 0, 'away' => 1, 'offline' => 2];
    usort($people, static function (array $a, array $b) use ($rank): int {
        $status = ($rank[$a['status']] ?? 9) <=> ($rank[$b['status']] ?? 9);
        if ($status !== 0) {
            return $status;
        }
        $seen = (int) ($b['lastSeen'] ?? 0) <=> (int) ($a['lastSeen'] ?? 0);
        return $seen !== 0 ? $seen : strcasecmp((string) $a['name'], (string) $b['name']);
    });

    return $people;
}

function byline_presence_heartbeat_received(array $response, array $data, string $screen_id = ''): array
{
    if (!byline_presence_available() || !is_array($data['bylinePresence'] ?? null)) {
        return $response;
    }

    $payload = $data['bylinePresence'];
    $state = ($payload['state'] ?? '') === 'away' ? 'away' : 'active';
    $session_id = byline_presence_session_id($payload['sessionId'] ?? '');
    $location = byline_presence_sanitize_location($payload['location'] ?? []);
    $now = time();

    byline_presence_touch(get_current_user_id(), $state, $location, $session_id, $now);
    $response['bylinePresence'] = [
        'serverTime' => $now,
        'people' => byline_presence_people($now),
    ];

    return $response;
}
add_filter('heartbeat_received', 'byline_presence_heartbeat_received', 10, 3);

function byline_presence_add_toolbar_mount($wp_admin_bar): void
{
    if (!byline_presence_available() || !is_object($wp_admin_bar) || !method_exists($wp_admin_bar, 'add_node')) {
        return;
    }

    $wp_admin_bar->add_node([
        'id' => 'byline-presence',
        'parent' => 'top-secondary',
        'title' => '<span id="byline-presence-root" class="byline-ui-root byline-presence-toolbar-root"><span class="screen-reader-text">' . esc_html__('Newsroom presence', 'weekly-wildcat-headless') . '</span></span>',
        'meta' => [
            'class' => 'byline-presence-admin-bar',
            'title' => __('Newsroom presence', 'weekly-wildcat-headless'),
        ],
    ]);
}
add_action('admin_bar_menu', 'byline_presence_add_toolbar_mount', 5);

function byline_enqueue_presence(): void
{
    if (!byline_presence_available()) {
        return;
    }

    $asset_file = __DIR__ . '/../../build/presence.asset.php';
    $script_file = __DIR__ . '/../../build/presence.js';
    if (!is_readable($asset_file) || !is_readable($script_file)) {
        return;
    }

    $asset = require $asset_file;
    $dependencies = is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $dependencies[] = 'heartbeat';
    $dependencies = array_values(array_unique($dependencies));
    $version = is_string($asset['version'] ?? null) ? $asset['version'] : BYLINE_PLUGIN_VERSION;

    wp_enqueue_script('heartbeat');
    wp_enqueue_script(
        'byline-presence',
        plugins_url('build/presence.js', dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
        $dependencies,
        $version,
        true
    );

    foreach (['presence.css', 'style-presence.css'] as $index => $style_name) {
        $style_file = __DIR__ . '/../../build/' . $style_name;
        if (!is_readable($style_file)) {
            continue;
        }
        wp_enqueue_style(
            'byline-presence-ui' . ($index ? '-extra' : ''),
            plugins_url('build/' . $style_name, dirname(__DIR__, 2) . '/weekly-wildcat-headless.php'),
            [],
            $version
        );
    }

    // Only the WordPress-owned outer toolbar item needs unscoped CSS. All
    // actual presence UI remains inside the shadcn `.byline-ui-root` boundary.
    wp_register_style('byline-presence-toolbar', false, [], $version);
    wp_enqueue_style('byline-presence-toolbar');
    wp_add_inline_style('byline-presence-toolbar', '
#wpadminbar #wp-admin-bar-byline-presence > .ab-item { display:flex; align-items:center; height:32px; padding:0 5px; }
#wpadminbar #wp-admin-bar-byline-presence .byline-presence-toolbar-root { display:flex; align-items:center; height:32px; line-height:1.5; }
#wpadminbar #wp-admin-bar-byline-presence .byline-presence-toolbar-root button { color:inherit; }
@media screen and (max-width:782px) { #wpadminbar #wp-admin-bar-byline-presence > .ab-item { height:46px; } #wpadminbar #wp-admin-bar-byline-presence .byline-presence-toolbar-root { height:46px; } }
    ');

    $location = byline_presence_current_location();
    $now = time();
    byline_presence_touch(get_current_user_id(), 'active', $location, 'bootstrap', $now);
    $config = [
        'location' => $location,
        'recentSeconds' => BYLINE_PRESENCE_RECENT_SECONDS,
        'initial' => [
            'serverTime' => $now,
            'people' => byline_presence_people($now),
        ],
    ];
    wp_add_inline_script('byline-presence', 'window.bylinePresence = ' . wp_json_encode($config) . ';', 'before');
}
add_action('admin_enqueue_scripts', 'byline_enqueue_presence', 20);
