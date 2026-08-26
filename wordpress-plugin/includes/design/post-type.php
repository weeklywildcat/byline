<?php

if (!defined('ABSPATH')) {
    exit;
}

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

function byline_get_design_post(string $template): ?WP_Post
{
    $posts = get_posts([
        'post_type' => BYLINE_DESIGN_POST_TYPE,
        'post_status' => 'any',
        'posts_per_page' => 1,
        'meta_key' => BYLINE_DESIGN_TEMPLATE_META,
        'meta_value' => $template,
        'orderby' => 'ID',
        'order' => 'ASC',
    ]);
    return isset($posts[0]) && $posts[0] instanceof WP_Post ? $posts[0] : null;
}

function byline_design_revision(?WP_Post $post): int
{
    return $post ? max(0, (int) get_post_meta($post->ID, BYLINE_DESIGN_REVISION_META, true)) : 0;
}

function byline_published_design(string $template): array
{
    $post = byline_get_design_post($template);
    if (!$post) {
        return ['document' => byline_default_design_document($template), 'revision' => 0, 'modifiedAt' => null];
    }

    $document = json_decode($post->post_content, true);
    if (!is_array($document)) {
        $document = byline_default_design_document($template);
    }

    return [
        'document' => $document,
        'revision' => byline_design_revision($post),
        'modifiedAt' => get_post_modified_time(DATE_ATOM, true, $post),
    ];
}

function byline_design_autosave_key(string $template): string
{
    return 'byline_design_autosave_' . md5($template);
}

