<?php

define('ABSPATH', __DIR__ . '/../');
define('OBJECT', 'OBJECT');

$page_options = [];
$page_posts = [];
$page_meta = [];

class WP_Error {}

function add_action(...$args): void {}
function register_rest_field(...$args): void {}
function byline_is_legacy_weekly_wildcat_installation(): bool { return true; }
function get_option($key, $fallback = false) { global $page_options; return $page_options[$key] ?? $fallback; }
function update_option($key, $value, ...$args): void { global $page_options; $page_options[$key] = $value; }
function sanitize_title($value): string { return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', (string) $value), '-')); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function byline_sanitize_public_url($value, string $fallback = ''): string { return is_string($value) && strpos($value, '/') === 0 ? $value : $fallback; }
function esc_url($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES); }
function wp_kses_post($value): string { return (string) $value; }
function wp_slash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function get_page_by_path($slug, ...$args) { global $page_posts; return $page_posts[$slug] ?? null; }
function wp_insert_post($post, $wp_error = false) {
    global $page_posts;
    $id = count($page_posts) + 1;
    $post['ID'] = $id;
    $page_posts[$post['post_name']] = $post;
    return $id;
}
function update_post_meta($post_id, $key, $value): void { global $page_meta; $page_meta[$post_id][$key] = $value; }
function get_post_meta(...$args) { return ''; }

require __DIR__ . '/../includes/content/pages.php';

$seed = byline_weekly_page_seed();
if (count($seed) !== 9) {
    fwrite(STDERR, "The Weekly Wildcat page migration seed is incomplete.\n");
    exit(1);
}

byline_migrate_weekly_wildcat_pages();
if (count($page_posts) !== 9 || (int) ($page_options[BYLINE_WEEKLY_PAGE_MIGRATION_OPTION] ?? 0) !== 1) {
    fwrite(STDERR, "The controlled page migration did not create all missing pages.\n");
    exit(1);
}

$about = $page_posts['about'] ?? null;
if (!is_array($about)
    || $about['post_status'] !== 'publish'
    || strpos($about['post_content'], 'What We Do') === false
    || strpos($about['post_content'], '/authors/') === false) {
    fwrite(STDERR, "The migrated About page did not preserve its content and actions.\n");
    exit(1);
}

byline_migrate_weekly_wildcat_pages();
if (count($page_posts) !== 9) {
    fwrite(STDERR, "The page migration created duplicates on a second run.\n");
    exit(1);
}

echo "Byline page migration regression passed.\n";
