<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Compact newsroom widgets for the native WordPress Dashboard. These are
 * deliberately server-rendered and capability-filtered: internal assignments,
 * deadlines, and visual notes never travel through a public endpoint.
 */
function byline_dashboard_visible_story(WP_Post $post): bool
{
    if (!current_user_can('edit_post', $post->ID)) {
        return false;
    }

    if (current_user_can('edit_others_posts')) {
        return true;
    }

    return (int) $post->post_author === get_current_user_id()
        || function_exists('byline_get_editorial_editor_id') && byline_get_editorial_editor_id($post->ID) === get_current_user_id();
}

function byline_dashboard_story_posts(array $args = [], bool $mine = false): array
{
    $posts = get_posts(array_merge([
        'post_type' => 'post',
        'post_status' => ['draft', 'pending', 'future'],
        'posts_per_page' => 30,
        'orderby' => 'modified',
        'order' => 'DESC',
    ], $args));

    return array_values(array_filter($posts, static function ($post) use ($mine): bool {
        if (!$post instanceof WP_Post || !byline_dashboard_visible_story($post)) {
            return false;
        }
        if (!$mine) {
            return true;
        }

        return (int) $post->post_author === get_current_user_id()
            || function_exists('byline_get_editorial_editor_id') && byline_get_editorial_editor_id($post->ID) === get_current_user_id();
    }));
}

function byline_dashboard_story_link(WP_Post $post): string
{
    $title = get_the_title($post) ?: __('Untitled story', 'weekly-wildcat-headless');
    $url = get_edit_post_link($post->ID);
    return $url
        ? '<a href="' . esc_url($url) . '">' . esc_html($title) . '</a>'
        : esc_html($title);
}

function byline_dashboard_render_story_list(array $posts, string $empty): void
{
    if ($posts === []) {
        echo '<p class="byline-dashboard-empty">' . esc_html($empty) . '</p>';
        return;
    }

    echo '<ul class="byline-dashboard-list">';
    foreach (array_slice($posts, 0, 5) as $post) {
        if (!$post instanceof WP_Post) {
            continue;
        }
        $status = function_exists('byline_get_effective_editorial_status')
            ? byline_editorial_status_label(byline_get_effective_editorial_status($post->ID))
            : ucfirst((string) $post->post_status);
        echo '<li><span>' . byline_dashboard_story_link($post) . '</span><small>' . esc_html($status) . '</small></li>';
    }
    echo '</ul>';
}

function byline_dashboard_my_stories(): void
{
    byline_dashboard_render_story_list(
        byline_dashboard_story_posts([], true),
        __('No active stories are assigned to you.', 'weekly-wildcat-headless')
    );
}

function byline_dashboard_needs_review(): void
{
    $posts = byline_dashboard_story_posts([
        'meta_key' => defined('BYLINE_EDITORIAL_STATUS_META') ? BYLINE_EDITORIAL_STATUS_META : '_wwh_story_status',
        'meta_value' => 'ready',
    ]);
    byline_dashboard_render_story_list($posts, __('Nothing is waiting for review.', 'weekly-wildcat-headless'));
}

function byline_dashboard_deadlines(): void
{
    $posts = byline_dashboard_story_posts(['posts_per_page' => 100]);
    $today = current_time('Y-m-d');
    $dated = [];
    foreach ($posts as $post) {
        $deadline = function_exists('byline_get_editorial_deadline')
            ? byline_get_editorial_deadline($post->ID)
            : (string) get_post_meta($post->ID, '_wwh_story_deadline', true);
        if ($deadline !== '') {
            $dated[] = ['post' => $post, 'deadline' => $deadline];
        }
    }
    usort($dated, static fn(array $left, array $right): int => strcmp($left['deadline'], $right['deadline']));
    if ($dated === []) {
        echo '<p class="byline-dashboard-empty">' . esc_html__('No active deadlines.', 'weekly-wildcat-headless') . '</p>';
        return;
    }
    echo '<ul class="byline-dashboard-list">';
    foreach (array_slice($dated, 0, 5) as $entry) {
        $label = $entry['deadline'] < $today ? __('Overdue', 'weekly-wildcat-headless') : ($entry['deadline'] === $today ? __('Due today', 'weekly-wildcat-headless') : $entry['deadline']);
        echo '<li><span>' . byline_dashboard_story_link($entry['post']) . '</span><small>' . esc_html($label) . '</small></li>';
    }
    echo '</ul>';
}

function byline_dashboard_scheduled(): void
{
    $posts = byline_dashboard_story_posts([
        'post_status' => 'future',
        'orderby' => 'date',
        'order' => 'ASC',
    ]);
    byline_dashboard_render_story_list($posts, __('No stories are scheduled soon.', 'weekly-wildcat-headless'));
}

function byline_dashboard_recently_published(): void
{
    $posts = get_posts([
        'post_type' => 'post',
        'post_status' => 'publish',
        'posts_per_page' => 5,
        'orderby' => 'date',
        'order' => 'DESC',
    ]);
    byline_dashboard_render_story_list(
        array_values(array_filter($posts, static fn($post): bool => $post instanceof WP_Post && byline_dashboard_visible_story($post))),
        __('No recent published stories.', 'weekly-wildcat-headless')
    );
}

function byline_dashboard_site_status(): void
{
    if (!current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY)) {
        echo '<p class="byline-dashboard-empty">' . esc_html__('Site status is available to Byline managers.', 'weekly-wildcat-headless') . '</p>';
        return;
    }

    $deployment = function_exists('byline_deployment_status') ? byline_deployment_status() : [];
    $manifest = function_exists('byline_public_manifest_diagnostic') ? byline_public_manifest_diagnostic() : [];
    $last_status = (string) ($deployment['lastStatus'] ?? '');
    $failed = preg_match('/request failed|http [45]\d\d|no http status/i', $last_status) === 1;
    if ($failed) {
        $label = __('Build failed', 'weekly-wildcat-headless');
        $class = 'is-error';
    } elseif (!empty($deployment['pending'])) {
        $label = __('Building', 'weekly-wildcat-headless');
        $class = 'is-warning';
    } elseif (!empty($manifest['reachable'])) {
        $label = __('Live', 'weekly-wildcat-headless');
        $class = 'is-success';
    } else {
        $label = __('Needs attention', 'weekly-wildcat-headless');
        $class = 'is-warning';
    }
    echo '<p class="byline-dashboard-site-status ' . esc_attr($class) . '"><strong>' . esc_html($label) . '</strong></p>';
    echo '<p class="byline-dashboard-muted">' . esc_html((string) ($manifest['status'] ?? $last_status ?: __('No status reported.', 'weekly-wildcat-headless'))) . '</p>';
    echo '<p><a href="' . esc_url(byline_admin_page_url(BYLINE_ADMIN_INTEGRATIONS_PAGE, ['tab' => 'deployment'])) . '">' . esc_html__('Open Deployment', 'weekly-wildcat-headless') . '</a></p>';
}

function byline_dashboard_quick_actions(): void
{
    $actions = [];
    if (current_user_can('edit_posts')) {
        $actions[] = ['url' => admin_url('post-new.php'), 'label' => __('New story', 'weekly-wildcat-headless')];
    }
    if (current_user_can('upload_files')) {
        $actions[] = ['url' => admin_url('media-new.php'), 'label' => __('Upload photos', 'weekly-wildcat-headless')];
    }
    if (function_exists('wwh_can_manage_bulk_sports_data') && wwh_can_manage_bulk_sports_data()) {
        $actions[] = ['url' => admin_url(byline_sports_menu_parent() . '&page=wwh-sports-import'), 'label' => __('Add game', 'weekly-wildcat-headless')];
    }
    if (current_user_can(BYLINE_EDIT_DESIGN_CAPABILITY)) {
        $actions[] = ['url' => byline_admin_page_url(BYLINE_ADMIN_STUDIO_PAGE), 'label' => __('Open Studio', 'weekly-wildcat-headless')];
    }
    if ($actions === []) {
        echo '<p class="byline-dashboard-empty">' . esc_html__('No newsroom actions are available for your account.', 'weekly-wildcat-headless') . '</p>';
        return;
    }
    echo '<ul class="byline-dashboard-actions">';
    foreach ($actions as $action) {
        echo '<li><a class="button" href="' . esc_url($action['url']) . '">' . esc_html($action['label']) . '</a></li>';
    }
    echo '</ul>';
}

function byline_register_newsroom_dashboard_widgets(): void
{
    if (!current_user_can('edit_posts')) {
        return;
    }
    wp_add_dashboard_widget('byline_dashboard_my_stories', __('My stories', 'weekly-wildcat-headless'), 'byline_dashboard_my_stories');
    wp_add_dashboard_widget('byline_dashboard_needs_review', __('Needs review', 'weekly-wildcat-headless'), 'byline_dashboard_needs_review');
    wp_add_dashboard_widget('byline_dashboard_deadlines', __('Deadlines', 'weekly-wildcat-headless'), 'byline_dashboard_deadlines');
    wp_add_dashboard_widget('byline_dashboard_scheduled', __('Scheduled', 'weekly-wildcat-headless'), 'byline_dashboard_scheduled');
    wp_add_dashboard_widget('byline_dashboard_recently_published', __('Recently published', 'weekly-wildcat-headless'), 'byline_dashboard_recently_published');
    wp_add_dashboard_widget('byline_dashboard_site_status', __('Site status', 'weekly-wildcat-headless'), 'byline_dashboard_site_status');
    wp_add_dashboard_widget('byline_dashboard_quick_actions', __('Quick actions', 'weekly-wildcat-headless'), 'byline_dashboard_quick_actions');
}
add_action('wp_dashboard_setup', 'byline_register_newsroom_dashboard_widgets');

function byline_newsroom_dashboard_styles(): void
{
    if (!function_exists('get_current_screen')) {
        return;
    }
    $screen = get_current_screen();
    if (!$screen || $screen->id !== 'dashboard') {
        return;
    }
    echo '<style>.byline-dashboard-list,.byline-dashboard-actions{margin:0}.byline-dashboard-list li{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #dcdcde;padding:7px 0}.byline-dashboard-list small,.byline-dashboard-muted{color:#646970}.byline-dashboard-site-status strong{font-size:16px}.byline-dashboard-site-status.is-success strong{color:#008a20}.byline-dashboard-site-status.is-warning strong{color:#996800}.byline-dashboard-site-status.is-error strong{color:#b32d2e}.byline-dashboard-actions{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}.byline-dashboard-empty{color:#646970}</style>';
}
add_action('admin_head', 'byline_newsroom_dashboard_styles');
