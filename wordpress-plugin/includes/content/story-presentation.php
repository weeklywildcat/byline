<?php

/**
 * How a story is presented on the public site: the normal article, or a
 * fullscreen "Immersive" opening with the featured image.
 *
 * Two plain post meta values, edited in the block editor's Story presentation
 * panel and published in the existing `byline` post settings (and the build
 * snapshot). They choose between presentations the site's code defines; they
 * carry no design data. A story the site's developers have given a bespoke
 * presentation ignores them.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_PRESENTATION_META = 'byline_story_presentation';
const BYLINE_STORY_IMMERSIVE_ALIGNMENT_META = 'byline_story_immersive_alignment';
const BYLINE_STORY_PRESENTATIONS = ['standard', 'immersive'];
const BYLINE_STORY_IMMERSIVE_ALIGNMENTS = ['bottom-left', 'center'];

function byline_story_presentation_value($value): string
{
    return is_string($value) && in_array($value, BYLINE_STORY_PRESENTATIONS, true) ? $value : 'standard';
}

function byline_story_immersive_alignment_value($value): string
{
    return is_string($value) && in_array($value, BYLINE_STORY_IMMERSIVE_ALIGNMENTS, true) ? $value : 'bottom-left';
}

/** The two values with defaults applied; an unknown or missing value is Standard / Bottom left. */
function byline_story_presentation_settings(int $post_id): array
{
    return [
        'presentation' => byline_story_presentation_value(get_post_meta($post_id, BYLINE_STORY_PRESENTATION_META, true)),
        'immersiveAlignment' => byline_story_immersive_alignment_value(get_post_meta($post_id, BYLINE_STORY_IMMERSIVE_ALIGNMENT_META, true)),
    ];
}

function byline_register_story_presentation_meta(): void
{
    $definitions = [
        BYLINE_STORY_PRESENTATION_META => [BYLINE_STORY_PRESENTATIONS, 'standard', 'byline_story_presentation_value'],
        BYLINE_STORY_IMMERSIVE_ALIGNMENT_META => [BYLINE_STORY_IMMERSIVE_ALIGNMENTS, 'bottom-left', 'byline_story_immersive_alignment_value'],
    ];

    foreach ($definitions as $key => [$allowed, $default, $sanitize]) {
        register_post_meta('post', $key, [
            'single' => true,
            'type' => 'string',
            'default' => $default,
            'sanitize_callback' => $sanitize,
            'show_in_rest' => ['schema' => ['type' => 'string', 'enum' => $allowed, 'default' => $default]],
            'auth_callback' => static fn() => current_user_can('edit_posts'),
        ]);
    }
}
add_action('init', 'byline_register_story_presentation_meta');
