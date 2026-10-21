<?php
/**
 * How often the block editor autosaves a story.
 *
 * WordPress Notes are saved the instant they are added, but the anchor that
 * ties a Note to selected text or a block lives in the post content and only
 * persists when the post saves. A shorter autosave interval keeps the two close
 * together, like a shared document. This only changes the editor's own
 * `autosaveInterval` setting for stories; WordPress still performs the autosave,
 * and real-time collaboration is untouched.
 */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_EDITOR_AUTOSAVE_SECONDS = 30;

/** Seconds between autosaves in the story editor, never below 10 or above 300. */
function byline_editor_autosave_interval(): int
{
    $seconds = (int) apply_filters('byline_editor_autosave_interval', BYLINE_EDITOR_AUTOSAVE_SECONDS);

    return max(10, min(300, $seconds));
}

/**
 * @param array<string,mixed> $settings
 * @param object              $context  WP_Block_Editor_Context
 * @return array<string,mixed>
 */
function byline_editor_settings_autosave(array $settings, $context): array
{
    $post = is_object($context) && isset($context->post) ? $context->post : null;
    if (is_object($post) && (string) ($post->post_type ?? '') === 'post') {
        $settings['autosaveInterval'] = byline_editor_autosave_interval();
    }

    return $settings;
}
add_filter('block_editor_settings_all', 'byline_editor_settings_autosave', 10, 2);
