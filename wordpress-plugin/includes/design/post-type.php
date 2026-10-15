<?php

if (!defined('ABSPATH')) {
    exit;
}

// Historical designs remain registered privately. Do not migrate or delete stored records.
const BYLINE_DESIGN_POST_TYPE = 'byline_design';
const BYLINE_DESIGN_TEMPLATE_META = '_byline_template';
const BYLINE_DESIGN_REVISION_META = '_byline_published_revision';

function byline_register_design_post_type(): void
{
    register_post_type(BYLINE_DESIGN_POST_TYPE, [
        'labels' => ['name' => __('Byline Designs', 'weekly-wildcat-headless')],
        'public' => false,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title', 'editor', 'revisions', 'author'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}
add_action('init', 'byline_register_design_post_type');
