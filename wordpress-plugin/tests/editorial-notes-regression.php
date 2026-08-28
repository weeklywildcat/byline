<?php

/**
 * Regression coverage for the optional WordPress Core Notes enhancement.
 *
 * Notes are Core comments with comment_type=note.  Byline only detects the
 * documented editor support and comment-type signal; it does not call private
 * Note helpers or create a parallel data store.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'draft';
}

class WP_User {}
class WP_Error {}
class WP_REST_Request {}
class WP_REST_Response {}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_post_type(...$args): void {}
function register_post_meta(...$args): void {}
function register_rest_field(...$args): void {}
function register_rest_route(...$args): void {}
function __return_true(): bool { return true; }
function __($text, $domain = ''): string { return (string) $text; }
function sanitize_key($value): string
{
    return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value));
}
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_title($value): string { return sanitize_key(str_replace(' ', '-', (string) $value)); }
function esc_url_raw($url, $protocols = []): string { return (string) $url; }
function absint($value): int { return abs((int) $value); }
function rest_authorization_required_code(): int { return 403; }
function rest_ensure_response($value) { return $value; }
function get_post($post_id) { return null; }
function get_post_meta($post_id, $key, $single = false) { return $single ? '' : []; }
function get_user_by($field, $value) { return false; }
function get_users($args = []) { return []; }
function current_user_can($capability, ...$args): bool { return true; }
function user_can($user, $capability, ...$args): bool { return true; }
function get_current_user_id(): int { return 1; }
function get_all_post_type_supports(string $post_type): array
{
    global $notes_test_supports;
    return $notes_test_supports;
}
function get_comments(array $args = []): array
{
    global $notes_test_comments;
    return $notes_test_comments;
}
function is_avatar_comment_type($comment_type): bool
{
    global $notes_test_core_signal;
    return $notes_test_core_signal && $comment_type === 'note';
}
function get_edit_post_link(int $post_id, string $context = 'display'): string
{
    global $notes_test_edit_url;
    return $notes_test_edit_url;
}

$notes_test_supports = ['editor' => [['notes' => true]]];
$notes_test_comments = [];
$notes_test_core_signal = true;
$notes_test_edit_url = 'https://cms.example.test/wp-admin/post.php?post=42&action=edit';

require __DIR__ . '/../includes/editorial/rest.php';

function notes_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$available = byline_editorial_rest_notes_support(42);
notes_test_assert($available['available'] === true, 'Notes should be available when Core exposes editor notes support.');
notes_test_assert(strpos($available['url'], 'post=42') !== false, 'Notes should open the current post editor.');
notes_test_assert(strpos($available['url'], '#wp-notes') === false, 'Notes should not use the old generic post.php anchor.');
notes_test_assert($available['message'] === '', 'Available Notes should not report an unsupported message.');

$notes_test_core_signal = false;
$unsupported = byline_editorial_rest_notes_support(42);
notes_test_assert($unsupported['available'] === false, 'Notes should be disabled when the Core note signal is unavailable.');
notes_test_assert($unsupported['url'] === '', 'Unsupported Notes must not emit a misleading editor target.');
notes_test_assert($unsupported['message'] !== '', 'Unsupported Notes should explain the progressive enhancement state.');

$notes_test_core_signal = true;
$notes_test_supports = [];
$no_editor_support = byline_editorial_rest_notes_support(42);
notes_test_assert($no_editor_support['available'] === false, 'Notes should be disabled when the post editor has no Notes support.');

echo "WordPress Core Notes feature detection regression passed.\n";
