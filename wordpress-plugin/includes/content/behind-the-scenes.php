<?php

if (!defined('ABSPATH')) {
    exit;
}

/** Native posts use this category; publication and authoring stay unchanged. */
function byline_ensure_behind_the_scenes_category(): void
{
    if (!current_user_can('manage_categories')) {
        return;
    }

    // Keep the term ID and slug so article assignments and permalinks survive.
    $existing = get_term_by('slug', 'behind-the-scenes', 'category');
    if ($existing) {
        if ($existing->name === 'Behind the Scenes') {
            wp_update_term($existing->term_id, 'category', [
                'name' => 'Off Deadline',
                'description' => 'Stories behind the stories',
            ]);
        }
        return;
    }

    wp_insert_term('Off Deadline', 'category', [
        'slug' => 'behind-the-scenes',
        'description' => 'Stories behind the stories',
    ]);
}
add_action('admin_init', 'byline_ensure_behind_the_scenes_category');
