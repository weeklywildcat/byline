<?php

/**
 * "How we reported this": a short, reader-facing note about how a story was
 * reported (who was interviewed, what records were read, why it was written).
 *
 * One plain-text post meta value, edited in the block editor's panel of the
 * same name and published in the existing `byline` post settings (and the
 * build snapshot). Blank lines separate paragraphs; no markup is stored.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_REPORTING_NOTE_META = 'byline_reporting_note';
const BYLINE_STORY_REPORTING_NOTE_MAX_LENGTH = 1500;

function byline_story_reporting_note_value($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = function_exists('sanitize_textarea_field') ? sanitize_textarea_field($value) : trim(strip_tags($value));
    // At most one blank line between paragraphs.
    $value = trim((string) preg_replace("/\n{3,}/", "\n\n", $value));

    return function_exists('mb_substr')
        ? mb_substr($value, 0, BYLINE_STORY_REPORTING_NOTE_MAX_LENGTH)
        : substr($value, 0, BYLINE_STORY_REPORTING_NOTE_MAX_LENGTH);
}

function byline_story_reporting_note(int $post_id): string
{
    return byline_story_reporting_note_value(get_post_meta($post_id, BYLINE_STORY_REPORTING_NOTE_META, true));
}

/** Paragraphs as the article renders them (the preview shares the public model). */
function byline_story_reporting_note_paragraphs(string $note): array
{
    return array_values(array_filter(array_map('trim', preg_split("/\n\s*\n/", $note) ?: []), 'strlen'));
}

function byline_register_story_reporting_note_meta(): void
{
    register_post_meta('post', BYLINE_STORY_REPORTING_NOTE_META, [
        'single' => true,
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'byline_story_reporting_note_value',
        'show_in_rest' => ['schema' => ['type' => 'string', 'default' => '']],
        'auth_callback' => static fn() => current_user_can('edit_posts'),
    ]);
}
add_action('init', 'byline_register_story_reporting_note_meta');
