<?php

define('ABSPATH', __DIR__ . '/../');

$registered = [];
$meta = [];

function add_action(...$args): void {}
function current_user_can(string $capability): bool { return true; }
function register_post_meta(string $post_type, string $key, array $args): bool
{
    global $registered;
    $registered[$post_type][$key] = $args;
    return true;
}
function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $meta;
    return $meta[$post_id][$key] ?? '';
}

require __DIR__ . '/../includes/content/story-presentation.php';

function story_presentation_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "Story presentation regression failed: {$message}\n");
        exit(1);
    }
}

// Normalization: only the known values survive; everything else is the default.
story_presentation_assert(byline_story_presentation_value('immersive') === 'immersive', 'immersive should be accepted');
story_presentation_assert(byline_story_presentation_value('standard') === 'standard', 'standard should be accepted');
foreach (['', 'Immersive', 'custom', null, 7, ['immersive']] as $bad) {
    story_presentation_assert(byline_story_presentation_value($bad) === 'standard', 'unknown presentation should read as standard');
}
story_presentation_assert(byline_story_immersive_alignment_value('center') === 'center', 'center should be accepted');
story_presentation_assert(byline_story_immersive_alignment_value('bottom-left') === 'bottom-left', 'bottom-left should be accepted');
foreach (['', 'left', 'top', null, 0, ['center']] as $bad) {
    story_presentation_assert(byline_story_immersive_alignment_value($bad) === 'bottom-left', 'unknown alignment should read as bottom-left');
}

// A story that predates the setting has no meta at all.
story_presentation_assert(byline_story_presentation_settings(1) === ['presentation' => 'standard', 'immersiveAlignment' => 'bottom-left'], 'a story with no meta must be standard, bottom-left');
$meta[2] = [BYLINE_STORY_PRESENTATION_META => 'immersive', BYLINE_STORY_IMMERSIVE_ALIGNMENT_META => 'center'];
story_presentation_assert(byline_story_presentation_settings(2) === ['presentation' => 'immersive', 'immersiveAlignment' => 'center'], 'saved choices must be returned');
$meta[3] = [BYLINE_STORY_PRESENTATION_META => 'bogus', BYLINE_STORY_IMMERSIVE_ALIGNMENT_META => 'right'];
story_presentation_assert(byline_story_presentation_settings(3) === ['presentation' => 'standard', 'immersiveAlignment' => 'bottom-left'], 'corrupt stored values must fall back to the defaults');

// Meta registration: posts only, REST-visible with an enum schema, sanitized, edit-capability gated.
byline_register_story_presentation_meta();
story_presentation_assert(array_keys($registered) === ['post'], 'meta must be registered for posts only');
story_presentation_assert(array_keys($registered['post']) === ['byline_story_presentation', 'byline_story_immersive_alignment'], 'exactly the two meta keys must be registered');
$presentation = $registered['post']['byline_story_presentation'];
$alignment = $registered['post']['byline_story_immersive_alignment'];
story_presentation_assert($presentation['single'] === true && $presentation['type'] === 'string' && $presentation['default'] === 'standard', 'presentation meta shape');
story_presentation_assert($alignment['single'] === true && $alignment['type'] === 'string' && $alignment['default'] === 'bottom-left', 'alignment meta shape');
story_presentation_assert($presentation['show_in_rest']['schema']['enum'] === ['standard', 'immersive'], 'presentation REST enum');
story_presentation_assert($alignment['show_in_rest']['schema']['enum'] === ['bottom-left', 'center'], 'alignment REST enum');
story_presentation_assert(($presentation['sanitize_callback'])('bogus') === 'standard' && ($alignment['sanitize_callback'])('bogus') === 'bottom-left', 'sanitizers must coerce unknown input');
story_presentation_assert(($presentation['auth_callback'])() === true, 'editors may set the presentation');

echo "Story presentation regression passed.\n";
