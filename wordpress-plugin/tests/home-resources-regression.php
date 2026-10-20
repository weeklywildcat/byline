<?php
/** Link validation and private-field registration, without a WordPress DB. */
define('ABSPATH', __DIR__ . '/../');
class WP_Error {
    public $code;
    public $message;
    public $data;
    public function __construct($code, $message, $data = []) { $this->code = $code; $this->message = $message; $this->data = $data; }
}
$home_hooks = [];
$home_meta = [];
function add_action($hook, $callback, ...$args): void { global $home_hooks; $home_hooks[$hook][] = $callback; }
function register_post_meta($type, $key, $args): void { global $home_meta; $home_meta[$key] = $args; }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function wp_parse_url($value) { return parse_url($value); }
function esc_url_raw($value, $protocols = []): string { return filter_var($value, FILTER_VALIDATE_URL) ? $value : ''; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function current_user_can($capability, ...$args): bool { return false; }
function absint($value): int { return abs((int) $value); }
function sanitize_key($value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)); }
function home_assert($condition, $message): void { if (!$condition) { fwrite(STDERR, $message . "\n"); exit(1); } }
require __DIR__ . '/../includes/editorial/tasks.php';
require __DIR__ . '/../includes/editorial/resources.php';

foreach ([
    'https://docs.google.com/document/d/a/edit' => 'Google Doc',
    'https://docs.google.com/spreadsheets/d/a' => 'Google Sheet',
    'https://docs.google.com/presentation/d/a' => 'Google Slides',
    'https://drive.google.com/drive/folders/a' => 'Drive folder',
    'https://drive.google.com/file/d/a/view' => 'Drive file',
    'https://docs.google.com.evil.example/document/d/a' => 'External link',
    'https://example.org/policy' => 'External link',
] as $url => $kind) {
    $link = byline_story_resource_input(['label' => '<b>Notes</b>', 'url' => $url, 'kind' => 'Untrusted kind']);
    home_assert(!is_wp_error($link) && $link['kind'] === $kind && $link['label'] === 'Notes', 'Link classification must use exact hosts and sanitized labels.');
}
foreach (['javascript:alert(1)', 'data:text/html,test', '//example.org', 'file:///etc/passwd', 'ftp://example.org', 'https://user:secret@example.org', "https://example.org/\r\nother", 'https://', 'not a URL'] as $url) {
    home_assert(is_wp_error(byline_story_resource_input(['label' => 'Unsafe', 'url' => $url])), 'Unsafe URL accepted: ' . parse_url($url, PHP_URL_SCHEME));
}
home_assert(is_wp_error(byline_story_resource_input(['label' => [], 'url' => 'https://example.org'])), 'Non-text labels must fail.');
home_assert(is_wp_error(byline_story_resource_input(['label' => 'Long', 'url' => 'https://example.org/' . str_repeat('a', 2048)])), 'Overlong URLs must fail.');
foreach ($home_hooks['init'] as $callback) { $callback(); }
home_assert($home_meta[BYLINE_STORY_RESOURCES_META]['show_in_rest'] === false, 'Resource links must stay out of public WordPress REST meta.');
home_assert(byline_get_story_resources(42) === [], 'Unauthorized resource reads must fail closed.');
echo "Byline Home resource privacy and validation regression passed.\n";
