<?php

/**
 * Standalone regression coverage for the editable workflow/setup presets.
 *
 * Presets are metadata seeds, not article templates. The harness verifies that
 * only the allowlisted configuration survives storage and that contextual IDs
 * and per-story overrides are merged without overwriting one another.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Error
{
    public $code;
    public $message;
    public $data;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string
    {
        return (string) $this->code;
    }
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

$preset_test_options = [];
$preset_test_users = [
    1 => ['manage' => true, 'edit' => true],
    2 => ['manage' => false, 'edit' => true],
    3 => ['manage' => false, 'edit' => false],
];

function preset_test_fail(string $message): void
{
    fwrite(STDERR, 'FAILED: ' . $message . "\n");
    exit(1);
}

function preset_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        preset_test_fail($message);
    }
}

function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}

function sanitize_text_field($value): string
{
    return trim((string) preg_replace('/\s+/', ' ', strip_tags((string) $value)));
}

function absint($value): int
{
    return abs((int) $value);
}

function get_option(string $key, $default = false)
{
    global $preset_test_options;
    return array_key_exists($key, $preset_test_options) ? $preset_test_options[$key] : $default;
}

function update_option(string $key, $value): bool
{
    global $preset_test_options;
    $preset_test_options[$key] = $value;
    return true;
}

function get_current_user_id(): int
{
    return 1;
}

function current_user_can(string $capability, ...$args): bool
{
    global $preset_test_users;
    $profile = $preset_test_users[get_current_user_id()] ?? [];
    return $capability === 'manage_options'
        ? !empty($profile['manage'])
        : ($capability === 'edit_posts' && !empty($profile['edit']));
}

function user_can($user, string $capability, ...$args): bool
{
    global $preset_test_users;
    $profile = $preset_test_users[absint($user)] ?? [];
    if ($capability === 'manage_options' || $capability === 'manage_byline') {
        return !empty($profile['manage']);
    }
    return $capability === 'edit_posts' && !empty($profile['edit']);
}

require __DIR__ . '/../includes/editorial/presets.php';

$types = byline_editorial_preset_types();
preset_test_assert($types === ['news', 'sports-recap', 'opinion', 'photo-story', 'breaking'], 'Preset identities changed unexpectedly.');
preset_test_assert(byline_editorial_normalize_preset_type('sports') === 'sports-recap', 'Sports compatibility alias was not normalized.');
preset_test_assert(byline_editorial_normalize_preset_type('photo') === 'photo-story', 'Photo compatibility alias was not normalized.');

$presets = byline_get_editorial_presets();
preset_test_assert(count($presets) === 5, 'The built-in preset set is not bounded to the five newsroom presets.');
preset_test_assert($presets['news']['section'] === 'news', 'News did not default to the News section.');
preset_test_assert($presets['sports-recap']['associations']['gameId'] === 0, 'Sports recap did not expose a contextual game association slot.');
preset_test_assert($presets['sports-recap']['readiness']['required'] === ['headline', 'writer', 'section', 'game'], 'Sports recap did not require game context.');
preset_test_assert($presets['opinion']['readiness']['required'][3] === 'contributor-profile', 'Opinion did not include contributor/profile readiness.');
preset_test_assert($presets['photo-story']['media']['mode'] === 'visual-first', 'Photo story did not default to visual-first media work.');
preset_test_assert($presets['breaking']['tasks'][0]['when'] === 'missing-noncritical', 'Breaking did not encode a follow-up for missing noncritical work.');

$serialized_defaults = serialize($presets);
foreach (['post_title', 'post_content', 'articleBody', 'body', 'fake prose'] as $forbidden) {
    preset_test_assert(stripos($serialized_defaults, $forbidden) === false, 'Preset data contains article-template content: ' . $forbidden);
}

preset_test_assert(byline_editorial_presets_can_use(2), 'A post editor could not use a preset.');
preset_test_assert(!byline_editorial_presets_can_edit(2), 'A normal post editor could edit presets.');
preset_test_assert(byline_editorial_presets_can_edit(1), 'A newsroom manager could not edit presets.');

$updated = byline_update_editorial_preset('news', [
    'label' => '<strong>Campus News</strong>',
    'section' => 'campus',
    'workflow' => ['deadlineOffsetDays' => 5],
    'media' => ['mode' => 'required'],
    'unknown' => 'discard me',
    'title' => 'Do not create a story title',
    'content' => 'Do not create article content',
], 1);
preset_test_assert(is_array($updated), 'A manager could not update a preset.');
preset_test_assert($updated['label'] === 'Campus News' && $updated['section'] === 'campus', 'Preset text/section overrides were not sanitized.');
preset_test_assert($updated['workflow']['status'] === 'reporting' && $updated['workflow']['deadlineOffsetDays'] === 5, 'Updating one workflow field discarded another default.');
preset_test_assert($updated['media']['mode'] === 'required', 'Media override was not retained.');
preset_test_assert(!isset($preset_test_options[BYLINE_EDITORIAL_PRESETS_OPTION]['presets']['news']['title']), 'Unknown preset fields were persisted.');
preset_test_assert(!isset($preset_test_options[BYLINE_EDITORIAL_PRESETS_OPTION]['presets']['news']['content']), 'Article content was persisted as a preset field.');

$updated_again = byline_update_editorial_preset('news', [
    'readiness' => ['recommended' => ['image-alt', 'not-a-check']],
], 1);
preset_test_assert(is_array($updated_again), 'A second partial preset update failed.');
preset_test_assert($updated_again['section'] === 'campus' && $updated_again['workflow']['deadlineOffsetDays'] === 5, 'A partial update discarded earlier user overrides.');
preset_test_assert($updated_again['readiness']['recommended'] === ['image-alt'], 'Readiness fields were not allowlisted.');
preset_test_assert((int) $preset_test_options[BYLINE_EDITORIAL_PRESETS_REVISION_OPTION] === 2, 'Preset revisions did not advance with edits.');

$forbidden_update = byline_update_editorial_preset('news', ['section' => 'private'], 2);
preset_test_assert($forbidden_update instanceof WP_Error && $forbidden_update->get_error_code() === 'byline_preset_forbidden', 'An unprivileged user edited a preset.');
$unknown_update = byline_update_editorial_preset('not-real', ['section' => 'x'], 1);
preset_test_assert($unknown_update instanceof WP_Error && $unknown_update->get_error_code() === 'byline_unknown_preset', 'An unknown preset identity was accepted.');

$sports_seed = byline_apply_editorial_preset('sports', [
    'associations' => [
        'gameId' => 42,
        'teamIds' => [7, 8, 8],
    ],
    'overrides' => [
        'media' => ['requireAltText' => false],
        'section' => 'special-sports',
    ],
], [
    'readiness' => ['recommended' => ['score', 'not-a-check']],
]);
preset_test_assert($sports_seed['id'] === 'sports-recap', 'Applying an alias did not return the canonical preset identity.');
preset_test_assert($sports_seed['section'] === 'special-sports', 'Per-story preset override did not win over the default.');
preset_test_assert($sports_seed['associations']['gameId'] === 42 && $sports_seed['associations']['teamIds'] === [7, 8], 'Contextual game/team associations were not preserved and deduplicated.');
preset_test_assert($sports_seed['media']['mode'] === 'requested' && $sports_seed['media']['requireAltText'] === false, 'A per-story media override discarded useful preset context.');
preset_test_assert($sports_seed['readiness']['recommended'] === ['score'], 'Per-story readiness overrides were not sanitized.');
preset_test_assert($preset_test_options[BYLINE_EDITORIAL_PRESETS_OPTION]['presets']['news']['section'] === 'campus', 'Applying a preset unexpectedly persisted a story override.');

$reset = byline_reset_editorial_preset('news', 1);
preset_test_assert(is_array($reset) && $reset['section'] === 'news' && $reset['workflow']['deadlineOffsetDays'] === 3, 'Reset did not restore code-owned defaults.');

echo "Editorial presets regression passed.\n";
