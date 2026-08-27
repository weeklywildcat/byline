<?php

/**
 * The Byline poll content type.
 *
 * A poll is editorial content, so it is a normal WordPress post type with its
 * own capability family. Votes are not posts and are not postmeta; see
 * schema.php.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_POST_TYPE = 'byline_poll';

// The stable public poll id. Generated once, never rewritten, and preserved by
// the D1 import so existing cookies and vote rows keep resolving.
const BYLINE_POLL_ID_META = '_byline_poll_id';
const BYLINE_POLL_OPTIONS_META = '_byline_poll_options';
const BYLINE_POLL_STATUS_META = '_byline_poll_status';
const BYLINE_POLL_OPENS_AT_META = '_byline_poll_opens_at';
const BYLINE_POLL_CLOSES_AT_META = '_byline_poll_closes_at';

const BYLINE_POLL_STATUS_DRAFT = 'draft';
const BYLINE_POLL_STATUS_OPEN = 'open';
const BYLINE_POLL_STATUS_CLOSED = 'closed';

/**
 * Public results stay aggregate-only until enough people have answered. The
 * threshold is enforced by the REST layer, not just by the widget.
 */
const BYLINE_POLL_MIN_RESULTS_VOTES = 5;

const BYLINE_POLL_MENU_POSITION = 28;

/**
 * Poll management is newsroom work, not site administration, so polls get a
 * mapped capability family instead of reusing manage_options.
 *
 * @return array<int,string>
 */
function byline_poll_capabilities(): array
{
    return [
        'edit_byline_poll',
        'read_byline_poll',
        'delete_byline_poll',
        'edit_byline_polls',
        'edit_others_byline_polls',
        'publish_byline_polls',
        'read_private_byline_polls',
        'delete_byline_polls',
        'delete_private_byline_polls',
        'delete_published_byline_polls',
        'delete_others_byline_polls',
        'edit_private_byline_polls',
        'edit_published_byline_polls',
    ];
}

/**
 * Capability granted to each role on activation/upgrade.
 *
 * Administrators and editors run polls outright. Authors may create, publish,
 * and delete their own polls; map_meta_cap keeps them out of other people's.
 * Nothing here requires manage_options.
 *
 * @return array<string,array<int,string>>
 */
function byline_poll_role_capabilities(): array
{
    $full = byline_poll_capabilities();
    $own = [
        'edit_byline_poll',
        'read_byline_poll',
        'delete_byline_poll',
        'edit_byline_polls',
        'publish_byline_polls',
        'delete_byline_polls',
        'delete_published_byline_polls',
        'edit_published_byline_polls',
    ];

    return [
        'administrator' => $full,
        'editor' => $full,
        'author' => $own,
    ];
}

/**
 * Capability required to inspect or export a poll's results, and the stronger
 * one required to destroy vote history.
 */
function byline_poll_results_capability(): string
{
    return 'edit_byline_polls';
}

function byline_poll_destructive_capability(): string
{
    return 'delete_others_byline_polls';
}

function byline_poll_feature_enabled(): bool
{
    $publication = byline_get_publication_config();

    return !empty($publication['features']['polls']);
}

function byline_poll_post_type_labels(): array
{
    return [
        'name' => __('Polls', 'weekly-wildcat-headless'),
        'singular_name' => __('Poll', 'weekly-wildcat-headless'),
        'menu_name' => __('Polls', 'weekly-wildcat-headless'),
        'add_new' => __('Add Poll', 'weekly-wildcat-headless'),
        'add_new_item' => __('Add Poll', 'weekly-wildcat-headless'),
        'edit_item' => __('Edit Poll', 'weekly-wildcat-headless'),
        'new_item' => __('New Poll', 'weekly-wildcat-headless'),
        'view_item' => __('View Poll', 'weekly-wildcat-headless'),
        'search_items' => __('Search Polls', 'weekly-wildcat-headless'),
        'not_found' => __('No polls yet.', 'weekly-wildcat-headless'),
        'not_found_in_trash' => __('No polls in the trash.', 'weekly-wildcat-headless'),
        'all_items' => __('Polls', 'weekly-wildcat-headless'),
    ];
}

/**
 * Polls are not a public WordPress route: the publication is a static site and
 * poll state is served through byline/v1. show_in_rest stays false so the
 * native controller never exposes poll meta or accepts native writes.
 *
 * The Polls menu is the post type's own top-level menu, gated by the
 * publication polls feature exactly as the previous informational screen was.
 */
function byline_register_poll_post_type(): void
{
    $enabled = byline_poll_feature_enabled();

    register_post_type(BYLINE_POLL_POST_TYPE, [
        'labels' => byline_poll_post_type_labels(),
        'public' => false,
        'publicly_queryable' => false,
        'show_ui' => $enabled,
        'show_in_menu' => $enabled,
        'show_in_nav_menus' => false,
        'show_in_admin_bar' => $enabled,
        'show_in_rest' => false,
        'menu_position' => BYLINE_POLL_MENU_POSITION,
        'menu_icon' => 'dashicons-chart-bar',
        'hierarchical' => false,
        'has_archive' => false,
        'rewrite' => false,
        'query_var' => false,
        'supports' => ['title', 'author'],
        'capability_type' => ['byline_poll', 'byline_polls'],
        'capabilities' => ['create_posts' => 'edit_byline_polls'],
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'byline_register_poll_post_type');

function byline_poll_add_role_capabilities(): void
{
    foreach (byline_poll_role_capabilities() as $role_name => $capabilities) {
        $role = get_role($role_name);
        if (!$role instanceof WP_Role) {
            continue;
        }

        foreach ($capabilities as $capability) {
            $role->add_cap($capability);
        }
    }
}
