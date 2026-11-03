<?php

define('ABSPATH', __DIR__ . '/../');

$registered = [];
$meta = [];

function add_action(...$args): void {}
function current_user_can(string $capability): bool { return true; }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
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

require __DIR__ . '/../includes/content/reporting-note.php';

function reporting_note_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "Reporting note regression failed: {$message}\n");
        exit(1);
    }
}

// Plain text only, with paragraphs kept and runs of blank lines collapsed.
reporting_note_assert(byline_story_reporting_note_value("We interviewed <b>14</b> students.\r\n\r\n\r\n\r\nWe read the budget.  ") === "We interviewed 14 students.\n\nWe read the budget.", 'markup should be stripped and paragraphs normalized');
foreach ([null, 7, ['note'], false] as $bad) {
    reporting_note_assert(byline_story_reporting_note_value($bad) === '', 'a non-string note should read as empty');
}
// Over-long notes are trimmed, never rejected, so saving a story cannot fail on it.
reporting_note_assert(strlen(byline_story_reporting_note_value(str_repeat('a', 2000))) === BYLINE_STORY_REPORTING_NOTE_MAX_LENGTH, 'a long note should be trimmed to the limit');

reporting_note_assert(byline_story_reporting_note_paragraphs("One.\n\n  Two.  \n\n") === ['One.', 'Two.'], 'paragraphs should split on blank lines');
reporting_note_assert(byline_story_reporting_note_paragraphs('') === [], 'an empty note has no paragraphs');

$meta[5][BYLINE_STORY_REPORTING_NOTE_META] = "  How we did it.  ";
reporting_note_assert(byline_story_reporting_note(5) === 'How we did it.', 'stored notes should be read through the sanitizer');
reporting_note_assert(byline_story_reporting_note(6) === '', 'a story without a note reads as empty');

byline_register_story_reporting_note_meta();
$args = $registered['post'][BYLINE_STORY_REPORTING_NOTE_META] ?? null;
reporting_note_assert(is_array($args), 'the note should be registered as post meta');
reporting_note_assert($args['single'] === true && $args['type'] === 'string' && $args['default'] === '', 'the note is a single string defaulting to empty');
reporting_note_assert($args['sanitize_callback'] === 'byline_story_reporting_note_value', 'the note should be sanitized on save');
reporting_note_assert(!isset($args['show_in_rest']['schema']['maxLength']), 'REST must not reject a long note; the sanitizer trims it');
reporting_note_assert(($args['auth_callback'])() === true, 'editors should be able to write the note');

echo "Reporting note regression passed.\n";
