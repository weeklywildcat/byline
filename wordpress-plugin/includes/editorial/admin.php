<?php

/**
 * WordPress admin surfaces for the Byline editorial workflow.
 *
 * The block editor gets a dedicated, small React entry (see
 * `src/editorial-workflow.tsx`). Everything here is the WordPress-side glue: the
 * asset registration for that entry, a compact classic-editor fallback for
 * installations that are not running Gutenberg, and workflow visibility in the
 * Posts list.
 *
 * The classic metabox and the block-editor sidebar are mutually exclusive. An
 * editor must never be shown two controls for the same value.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITORIAL_WORKFLOW_HANDLE = 'byline-editorial-workflow';

/**
 * True on the post editor for a normal article. Workflow belongs to stories, so
 * pages, polls, games, rosters, and events are all excluded.
 */
function byline_editorial_is_post_editor_screen($screen = null): bool
{
    $screen = $screen instanceof WP_Screen ? $screen : (function_exists('get_current_screen') ? get_current_screen() : null);

    return $screen instanceof WP_Screen && $screen->base === 'post' && $screen->post_type === 'post';
}

/**
 * Whether the current post editor is Gutenberg. Older WordPress builds and sites
 * running the Classic Editor plugin answer false and keep the metabox.
 */
function byline_editorial_screen_uses_block_editor($screen = null): bool
{
    $screen = $screen instanceof WP_Screen ? $screen : (function_exists('get_current_screen') ? get_current_screen() : null);

    return $screen instanceof WP_Screen && method_exists($screen, 'is_block_editor') && $screen->is_block_editor();
}

// --- block editor ----------------------------------------------------------

/**
 * Loads the dedicated workflow entry, and only that entry. The Byline Studio
 * bundle is a platform application and has no business in a post editor.
 */
function byline_editorial_enqueue_editor_assets(string $hook): void
{
    if (!in_array($hook, ['post.php', 'post-new.php'], true)) {
        return;
    }

    $screen = get_current_screen();

    if (!byline_editorial_is_post_editor_screen($screen) || !byline_editorial_screen_uses_block_editor($screen)) {
        return;
    }

    $plugin_file = dirname(__DIR__, 2) . '/weekly-wildcat-headless.php';
    $asset_file = dirname(__DIR__, 2) . '/build/editorial-workflow.asset.php';
    $script_file = dirname(__DIR__, 2) . '/build/editorial-workflow.js';

    if (!file_exists($asset_file) || !file_exists($script_file)) {
        return;
    }

    $asset = include $asset_file;
    $dependencies = is_array($asset) && is_array($asset['dependencies'] ?? null) ? $asset['dependencies'] : [];
    $version = is_array($asset) && is_string($asset['version'] ?? null) ? $asset['version'] : (string) filemtime($script_file);

    wp_enqueue_script(
        BYLINE_EDITORIAL_WORKFLOW_HANDLE,
        plugins_url('build/editorial-workflow.js', $plugin_file),
        $dependencies,
        $version,
        true
    );

    $style_file = dirname(__DIR__, 2) . '/build/editorial-workflow.css';

    if (file_exists($style_file)) {
        wp_enqueue_style(
            BYLINE_EDITORIAL_WORKFLOW_HANDLE,
            plugins_url('build/editorial-workflow.css', $plugin_file),
            [],
            (string) filemtime($style_file)
        );
    }

    wp_set_script_translations(BYLINE_EDITORIAL_WORKFLOW_HANDLE, 'weekly-wildcat-headless');

    // The editor uses this only as a launch target. The preview page performs
    // its own post-level capability check and reads no draft data in public.
    wp_localize_script(BYLINE_EDITORIAL_WORKFLOW_HANDLE, 'bylineEditorialWorkflow', [
        'previewUrl' => function_exists('byline_editorial_preview_page_url')
            ? byline_editorial_preview_page_url()
            : admin_url('admin.php?page=byline-article-preview'),
    ]);
}
add_action('admin_enqueue_scripts', 'byline_editorial_enqueue_editor_assets');

// --- classic fallback ------------------------------------------------------

/**
 * The classic metabox exists only where Gutenberg does not. It carries no
 * publication branding: editorial workflow is Byline platform functionality and
 * a publication's name must not rename a core control.
 */
function byline_editorial_register_meta_box(): void
{
    if (byline_editorial_screen_uses_block_editor()) {
        return;
    }

    add_meta_box(
        'byline-editorial-workflow',
        'Byline Workflow',
        'byline_editorial_render_meta_box',
        'post',
        'side',
        'default'
    );
}
add_action('add_meta_boxes_post', 'byline_editorial_register_meta_box');

function byline_editorial_render_meta_box(WP_Post $post): void
{
    wp_nonce_field('byline_editorial_save_workflow', 'byline_editorial_workflow_nonce');

    $state = byline_get_editorial_story_state($post->ID);
    $can_assign = byline_editorial_can_assign($post->ID);
    $published = $state['isPublished'];

    echo '<p><label for="byline_editorial_status"><strong>Workflow status</strong></label><br>';

    if ($published) {
        echo '<span class="byline-editorial-derived-status">' . esc_html(byline_editorial_status_label($state['status'])) . '</span>';
        echo '<br><span class="description">Published follows the WordPress publication state.</span>';
    } else {
        echo '<select id="byline_editorial_status" name="byline_editorial_status" class="widefat">';

        foreach (byline_editorial_selectable_status_ids() as $status) {
            printf(
                '<option value="%s"%s>%s</option>',
                esc_attr($status),
                selected($state['storedStatus'], $status, false),
                esc_html(byline_editorial_status_label($status))
            );
        }

        echo '</select>';
    }

    echo '</p>';

    if ($can_assign) {
        echo '<p><label for="byline_editorial_editor"><strong>Editor</strong></label><br>';
        echo '<select id="byline_editorial_editor" name="byline_editorial_editor" class="widefat"><option value="0">Unassigned</option>';

        foreach (byline_editorial_assignable_editors() as $editor) {
            printf(
                '<option value="%s"%s>%s</option>',
                esc_attr((string) $editor['id']),
                selected($state['editorId'], $editor['id'], false),
                esc_html($editor['name'])
            );
        }

        echo '</select></p>';
        printf(
            '<p><label for="byline_editorial_deadline"><strong>Deadline</strong></label><br><input class="widefat" type="date" id="byline_editorial_deadline" name="byline_editorial_deadline" value="%s"></p>',
            esc_attr($state['deadline'])
        );
    } elseif ($state['editorId'] > 0 || $state['deadline'] !== '') {
        $editor = get_user_by('id', $state['editorId']);
        echo '<p><strong>Editor</strong><br>' . esc_html($editor instanceof WP_User ? $editor->display_name : 'Unassigned') . '</p>';

        if ($state['deadline'] !== '') {
            echo '<p><strong>Deadline</strong><br>' . esc_html($state['deadline']) . '</p>';
        }
    }

    printf(
        '<p><label for="byline_editorial_visuals"><strong>Visual needs</strong></label><br><textarea class="widefat" rows="3" id="byline_editorial_visuals" name="byline_editorial_visuals">%s</textarea></p>',
        esc_textarea($state['visuals'])
    );

    $thread_id = byline_editorial_rest_discord_thread($post->ID);
    echo '<p class="description">' . esc_html($thread_id !== '' ? 'Discord thread linked.' : 'Not linked to a Discord thread yet.') . '</p>';
}

function byline_editorial_save_meta_box(int $post_id): void
{
    if (!isset($_POST['byline_editorial_workflow_nonce'])
        || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['byline_editorial_workflow_nonce'])), 'byline_editorial_save_workflow')
        || wp_is_post_autosave($post_id)
        || wp_is_post_revision($post_id)) {
        return;
    }

    $changes = [];
    $post = get_post($post_id);

    // A published story has no status control to submit, so nothing is written
    // and the pre-publication stage survives untouched.
    if ($post instanceof WP_Post && $post->post_status !== 'publish' && isset($_POST['byline_editorial_status'])) {
        $changes['status'] = sanitize_key(wp_unslash($_POST['byline_editorial_status']));
    }

    if (byline_editorial_can_assign($post_id)) {
        if (isset($_POST['byline_editorial_editor'])) {
            $changes['editorId'] = absint($_POST['byline_editorial_editor']);
        }

        if (isset($_POST['byline_editorial_deadline'])) {
            $changes['deadline'] = sanitize_text_field(wp_unslash($_POST['byline_editorial_deadline']));
        }
    }

    if (isset($_POST['byline_editorial_visuals'])) {
        $changes['visuals'] = wp_unslash($_POST['byline_editorial_visuals']);
    }

    if ($changes === []) {
        return;
    }

    byline_update_editorial_story_state($post_id, $changes);
}
add_action('save_post_post', 'byline_editorial_save_meta_box', 15);

// --- posts list ------------------------------------------------------------

const BYLINE_EDITORIAL_LIST_COLUMN = 'byline_workflow';
const BYLINE_EDITORIAL_LIST_FILTER = 'byline_workflow_status';

/**
 * @param array<string, string> $columns
 * @return array<string, string>
 */
function byline_editorial_posts_columns(array $columns): array
{
    $reordered = [];

    // Sits just before the date so WordPress's own status/date reporting keeps
    // its usual position and meaning.
    foreach ($columns as $key => $label) {
        if ($key === 'date') {
            $reordered[BYLINE_EDITORIAL_LIST_COLUMN] = 'Workflow';
        }

        $reordered[$key] = $label;
    }

    if (!isset($reordered[BYLINE_EDITORIAL_LIST_COLUMN])) {
        $reordered[BYLINE_EDITORIAL_LIST_COLUMN] = 'Workflow';
    }

    return $reordered;
}
add_filter('manage_post_posts_columns', 'byline_editorial_posts_columns');

/**
 * Reads only the cached post row and its primed meta, so the column costs no
 * extra query per row. The status text carries the meaning; the marker is a
 * supplemental cue and never the only signal.
 */
function byline_editorial_render_posts_column(string $column, int $post_id): void
{
    if ($column !== BYLINE_EDITORIAL_LIST_COLUMN) {
        return;
    }

    $status = byline_get_effective_editorial_status($post_id);

    printf(
        '<span class="byline-workflow-flag byline-workflow-flag-%1$s"><span class="byline-workflow-flag-marker" aria-hidden="true"></span>%2$s</span>',
        esc_attr($status),
        esc_html(byline_editorial_status_label($status))
    );
}
add_action('manage_post_posts_custom_column', 'byline_editorial_render_posts_column', 10, 2);

function byline_editorial_render_posts_filter(string $post_type): void
{
    if ($post_type !== 'post') {
        return;
    }

    $selected = isset($_GET[BYLINE_EDITORIAL_LIST_FILTER])
        ? sanitize_key(wp_unslash($_GET[BYLINE_EDITORIAL_LIST_FILTER]))
        : '';

    echo '<label class="screen-reader-text" for="' . esc_attr(BYLINE_EDITORIAL_LIST_FILTER) . '">Filter by editorial workflow</label>';
    echo '<select name="' . esc_attr(BYLINE_EDITORIAL_LIST_FILTER) . '" id="' . esc_attr(BYLINE_EDITORIAL_LIST_FILTER) . '">';
    echo '<option value="">All workflow states</option>';

    foreach (byline_editorial_selectable_status_ids() as $status) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr($status),
            selected($selected, $status, false),
            esc_html(byline_editorial_status_label($status))
        );
    }

    echo '</select>';
}
add_action('restrict_manage_posts', 'byline_editorial_render_posts_filter');

/**
 * Applies the filter to the Posts list only. Stories that predate the workflow
 * carry no metadata at all, so "Pitch" has to match the absent value too — that
 * is the same default the rest of the domain reads.
 */
function byline_editorial_filter_posts_query(WP_Query $query): void
{
    if (!is_admin() || !$query->is_main_query() || $query->get('post_type') !== 'post') {
        return;
    }

    $requested = isset($_GET[BYLINE_EDITORIAL_LIST_FILTER])
        ? sanitize_key(wp_unslash($_GET[BYLINE_EDITORIAL_LIST_FILTER]))
        : '';

    if (!in_array($requested, byline_editorial_selectable_status_ids(), true)) {
        return;
    }

    $clause = $requested === BYLINE_EDITORIAL_DEFAULT_STATUS
        ? [
            'relation' => 'OR',
            ['key' => BYLINE_EDITORIAL_STATUS_META, 'compare' => 'NOT EXISTS'],
            ['key' => BYLINE_EDITORIAL_STATUS_META, 'value' => '', 'compare' => '='],
            ['key' => BYLINE_EDITORIAL_STATUS_META, 'value' => $requested, 'compare' => '='],
        ]
        : ['key' => BYLINE_EDITORIAL_STATUS_META, 'value' => $requested, 'compare' => '='];

    $existing = $query->get('meta_query');
    $meta_query = is_array($existing) && $existing !== [] ? $existing : [];
    $meta_query[] = $clause;

    $query->set('meta_query', $meta_query);
}
add_action('pre_get_posts', 'byline_editorial_filter_posts_query');

/**
 * A few lines of restrained admin CSS. The marker is decorative; the label is
 * always present, so the column stays readable without colour.
 */
function byline_editorial_admin_styles(): void
{
    $screen = get_current_screen();

    if (!$screen instanceof WP_Screen || !in_array($screen->id, ['edit-post', 'post'], true)) {
        return;
    }

    wp_register_style('byline-editorial-admin', false, [], BYLINE_PLUGIN_VERSION);
    wp_enqueue_style('byline-editorial-admin');
    wp_add_inline_style('byline-editorial-admin', '
.byline-workflow-flag{align-items:center;display:inline-flex;gap:6px;}
.byline-workflow-flag-marker{background:#8c8f94;border-radius:50%;flex:none;height:8px;width:8px;}
.byline-workflow-flag-editing .byline-workflow-flag-marker,
.byline-workflow-flag-ready .byline-workflow-flag-marker{background:#2271b1;}
.byline-workflow-flag-published .byline-workflow-flag-marker{background:#00753a;}
.byline-workflow-flag-on-hold .byline-workflow-flag-marker,
.byline-workflow-flag-dropped .byline-workflow-flag-marker{background:transparent;box-shadow:inset 0 0 0 1px #8c8f94;}
.byline-editorial-derived-status{font-weight:600;}
');
}
add_action('admin_enqueue_scripts', 'byline_editorial_admin_styles');
