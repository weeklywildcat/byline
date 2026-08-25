<?php

define('ABSPATH', __DIR__ . '/../');
define('MINUTE_IN_SECONDS', 60);
class WP_Post { public int $ID = 0; public int $post_author = 1; public string $post_type = 'post'; public string $post_status = 'draft'; public string $post_title = ''; }
class WP_User { public int $ID = 1; }
$wwh_test_posts = [];
$wwh_test_autosave = false;
$wwh_test_revision = false;
$wwh_test_scheduled = 0;
$wwh_test_meta = [];
function add_action(...$args): void {}
function register_post_meta(...$args): void {}
function register_user_meta(...$args): void {}
function register_rest_route(...$args): void {}
function sanitize_key($value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return sanitize_text_field($value); }
function current_user_can(...$args): bool { return true; }
function get_current_user_id(): int { return 1; }
function absint($value): int { return abs((int) $value); }
function wp_is_post_autosave($id): bool { global $wwh_test_autosave; return $wwh_test_autosave; }
function wp_is_post_revision($id): bool { global $wwh_test_revision; return $wwh_test_revision; }
function wp_strip_all_tags($value): string { return strip_tags((string) $value); }
function get_post($id) { global $wwh_test_posts; return $wwh_test_posts[$id] ?? null; }
function wp_next_scheduled(...$args): bool { return false; }
function wp_schedule_single_event(...$args): bool { global $wwh_test_scheduled; $wwh_test_scheduled++; return true; }
function user_can($user, $capability, ...$args): bool { return $capability === 'edit_posts'; }
function update_post_meta($post_id, $key, $value): void { global $wwh_test_meta; $wwh_test_meta[$post_id][$key] = $value; }
function delete_post_meta(...$args): void {}
function get_post_meta($post_id, $key, $single = false) { global $wwh_test_meta; return $wwh_test_meta[$post_id][$key] ?? ''; }
function wp_get_post_categories($post_id): array { return []; }
function wp_json_encode($value): string { return json_encode($value); }
require __DIR__ . '/../includes/discord-integration.php';

$now = 1800000000;
$timestamp = (string) $now;
$signature = wwh_discord_sign($timestamp, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret');
if (!wwh_discord_verify_signature_values($timestamp, $signature, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret', $now)) { fwrite(STDERR, "Valid bridge signature rejected.\n"); exit(1); }
if (wwh_discord_verify_signature_values((string) ($now - 301), $signature, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret', $now)) { fwrite(STDERR, "Stale bridge signature accepted.\n"); exit(1); }
if (wwh_discord_sanitize_snowflake('12345678901234567') !== '12345678901234567' || wwh_discord_sanitize_snowflake('not-an-id') !== '') { fwrite(STDERR, "Snowflake sanitization failed.\n"); exit(1); }
if (wwh_discord_sanitize_deadline('2026-02-28') !== '2026-02-28' || wwh_discord_sanitize_deadline('2026-02-30') !== '') { fwrite(STDERR, "Deadline sanitization failed.\n"); exit(1); }
if (wwh_discord_sanitize_status('editing') !== 'editing' || wwh_discord_sanitize_status('published-by-user') !== 'pitch') { fwrite(STDERR, "Workflow sanitization failed.\n"); exit(1); }
$post = new WP_Post(); $post->ID = 10; $post->post_title = 'Meaningful pitch'; $wwh_test_posts[10] = $post;
wwh_discord_queue_story(10, $post);
if ($wwh_test_scheduled !== 1) { fwrite(STDERR, "Meaningful story did not queue Discord sync.\n"); exit(1); }
$wwh_test_autosave = true; wwh_discord_queue_story(10, $post); $wwh_test_autosave = false;
$wwh_test_revision = true; wwh_discord_queue_story(10, $post); $wwh_test_revision = false;
$empty = new WP_Post(); $empty->ID = 11; $empty->post_title = '  '; wwh_discord_queue_story(11, $empty);
if ($wwh_test_scheduled !== 1) { fwrite(STDERR, "Autosaves, revisions, or placeholders queued Discord work.\n"); exit(1); }
$user = new WP_User();
if (!wwh_discord_capability($user, 'edit_posts') || wwh_discord_capability($user, 'manage_options')) { fwrite(STDERR, "Capability enforcement failed.\n"); exit(1); }
$post->post_status = 'publish';
wwh_discord_run_story_sync(10);
if (empty($wwh_test_meta[10][WWH_DISCORD_LAST_ERROR_META])) { fwrite(STDERR, "Unavailable bot failure was not recorded safely.\n"); exit(1); }
echo "Discord integration regression passed.\n";
