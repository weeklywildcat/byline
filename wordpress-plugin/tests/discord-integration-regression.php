<?php

define('ABSPATH', __DIR__ . '/../');
define('MINUTE_IN_SECONDS', 60);
require __DIR__ . '/../includes/core/compatibility.php';
class WP_Post { public int $ID = 0; public int $post_author = 1; public string $post_type = 'post'; public string $post_status = 'draft'; public string $post_title = ''; }
class WP_User { public int $ID = 1; public string $display_name = 'Test User'; }
$wwh_test_posts = [];
$wwh_test_autosave = false;
$wwh_test_revision = false;
$wwh_test_scheduled = 0;
$wwh_test_meta = [];
$wwh_registered_user_meta = [];
$wwh_registered_post_meta = [];
$wwh_test_capabilities = ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true];
function add_action(...$args): void {}
function do_action(...$args): void {}
function register_post_meta($post_type, $key, array $args): bool { global $wwh_registered_post_meta; $wwh_registered_post_meta[$key] = $args; return true; }
function register_meta($object_type, $key, array $args): bool { global $wwh_registered_user_meta; if ($object_type === 'user') { $wwh_registered_user_meta[$key] = $args; } return true; }
function register_rest_route(...$args): void {}
function sanitize_key($value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return sanitize_text_field($value); }
function current_user_can(...$args): bool { global $wwh_test_capabilities; return !empty($wwh_test_capabilities[$args[0] ?? '']); }
function get_current_user_id(): int { return 1; }
function absint($value): int { return abs((int) $value); }
function wp_is_post_autosave($id): bool { global $wwh_test_autosave; return $wwh_test_autosave; }
function wp_is_post_revision($id): bool { global $wwh_test_revision; return $wwh_test_revision; }
function wp_strip_all_tags($value): string { return strip_tags((string) $value); }
function untrailingslashit($value): string { return rtrim((string) $value, '/\\'); }
function get_post($id) { global $wwh_test_posts; return $wwh_test_posts[$id] ?? null; }
function get_user_by($field, $value) { global $wwh_test_posts; $user = new WP_User(); $user->ID = (int) $value; return $user; }
function user_can($user, $capability, ...$args): bool { global $wwh_test_capabilities; return !empty($wwh_test_capabilities[$capability]); }
function wp_next_scheduled(...$args): bool { return false; }
function wp_schedule_single_event(...$args): bool { global $wwh_test_scheduled; $wwh_test_scheduled++; return true; }
function update_post_meta($post_id, $key, $value): void { global $wwh_test_meta; $wwh_test_meta[$post_id][$key] = $value; }
function delete_post_meta($post_id, $key): void { global $wwh_test_meta; unset($wwh_test_meta[$post_id][$key]); }
function get_post_meta($post_id, $key, $single = false) { global $wwh_test_meta; return $wwh_test_meta[$post_id][$key] ?? ''; }
function wp_get_post_categories($post_id): array { return []; }
function wp_json_encode($value): string { return json_encode($value); }
function get_users(array $args = []): array { return []; }
function get_the_category($post_id): array { return []; }
function get_post_thumbnail_id($post_id): int { return 0; }
function get_the_title($post_id): string { global $wwh_test_posts; return $wwh_test_posts[$post_id]->post_title ?? ''; }
function get_edit_post_link($post_id, $context = ''): string { return 'https://example.test/wp-admin/post.php?post=' . $post_id; }
function admin_url(string $path = ''): string { return 'https://example.test/wp-admin/' . $path; }
function get_permalink($post_id): string { return 'https://example.test/story/' . $post_id . '/'; }
function wp_get_attachment_image_url(...$args): string { return ''; }
function get_post_modified_time($format, $gmt = false, $post_id = 0): string { return '2026-08-27T00:00:00+00:00'; }
function get_user_meta($user_id, $key, $single = false): string { return ''; }

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/discord-integration.php';

function wwh_test_fail(string $message): void { fwrite(STDERR, $message . "\n"); exit(1); }

// Discord registers only its own metadata now. Story status, editor, deadline,
// and visual needs belong to the editorial workflow domain.
wwh_discord_register_meta();
if (!isset($wwh_registered_user_meta[WWH_DISCORD_USER_ID_META], $wwh_registered_user_meta[WWH_DISCORD_USERNAME_META])
    || count($wwh_registered_user_meta) !== 2) {
    wwh_test_fail('Discord user metadata was not registered through the WordPress register_meta API.');
}
foreach ([BYLINE_EDITORIAL_STATUS_META, BYLINE_EDITORIAL_EDITOR_META, BYLINE_EDITORIAL_DEADLINE_META, BYLINE_EDITORIAL_VISUALS_META] as $editorial_key) {
    if (isset($wwh_registered_post_meta[$editorial_key])) {
        wwh_test_fail('Discord still registers editorial workflow metadata it no longer owns.');
    }
}

$now = 1800000000;
$timestamp = (string) $now;
$signature = wwh_discord_sign($timestamp, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret');
if (!wwh_discord_verify_signature_values($timestamp, $signature, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret', $now)) { wwh_test_fail('Valid bridge signature rejected.'); }
if (wwh_discord_verify_signature_values((string) ($now - 301), $signature, 'POST', '/weekly-wildcat/v1/discord/stories', '{"title":"Pitch"}', 'secret', $now)) { wwh_test_fail('Stale bridge signature accepted.'); }
$byline_signature = wwh_discord_sign($timestamp, 'POST', '/byline/v1/discord/stories', '{"title":"Pitch"}', 'secret');
if (!wwh_discord_verify_signature_values($timestamp, $byline_signature, 'POST', '/byline/v1/discord/stories', '{"title":"Pitch"}', 'secret', $now)) { wwh_test_fail('Canonical Byline bridge route signature rejected.'); }
putenv('BYLINE_DISCORD_BRIDGE_SECRET=canonical-secret');
if (wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET') !== 'canonical-secret') { wwh_test_fail('Canonical Byline Discord configuration did not override the legacy alias.'); }
putenv('BYLINE_DISCORD_BRIDGE_SECRET');
if (wwh_discord_sanitize_snowflake('12345678901234567') !== '12345678901234567' || wwh_discord_sanitize_snowflake('not-an-id') !== '') { wwh_test_fail('Snowflake sanitization failed.'); }
if (wwh_discord_sanitize_deadline('2026-02-28') !== '2026-02-28' || wwh_discord_sanitize_deadline('2026-02-30') !== '') { wwh_test_fail('Deadline sanitization failed.'); }
if (wwh_discord_sanitize_status('editing') !== 'editing' || wwh_discord_sanitize_status('published-by-user') !== 'pitch') { wwh_test_fail('Workflow sanitization failed.'); }

// The status vocabulary Discord speaks is the canonical Byline vocabulary. Its
// identifiers are forum-tag identity and must not drift.
if (wwh_discord_statuses() !== ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published']) {
    wwh_test_fail('Discord workflow status identifiers changed.');
}
if (wwh_discord_statuses() !== byline_editorial_status_ids()) {
    wwh_test_fail('Discord no longer shares the canonical editorial status vocabulary.');
}

$post = new WP_Post(); $post->ID = 10; $post->post_title = 'Meaningful pitch'; $wwh_test_posts[10] = $post;
wwh_discord_queue_story(10, $post);
if ($wwh_test_scheduled !== 1) { wwh_test_fail('Meaningful story did not queue Discord sync.'); }
$wwh_test_autosave = true; wwh_discord_queue_story(10, $post); $wwh_test_autosave = false;
$wwh_test_revision = true; wwh_discord_queue_story(10, $post); $wwh_test_revision = false;
$empty = new WP_Post(); $empty->ID = 11; $empty->post_title = '  '; wwh_discord_queue_story(11, $empty);
if ($wwh_test_scheduled !== 1) { wwh_test_fail('Autosaves, revisions, or placeholders queued Discord work.'); }

// A Discord-created story is a WordPress draft at the first workflow stage.
byline_set_editorial_status(10, 'pitch');
if ($wwh_test_meta[10][BYLINE_EDITORIAL_STATUS_META] !== 'pitch' || $post->post_status !== 'draft') {
    wwh_test_fail('A Discord pitch did not land as a draft at the pitch stage.');
}
// Assigning a writer advances a pitch, and only a pitch.
if ($wwh_discord_story = wwh_discord_story(10)) {
    if ($wwh_discord_story['status'] !== 'pitch') { wwh_test_fail('Discord story payload lost the canonical workflow status.'); }
}
byline_set_editorial_status(10, 'assigned');
if (byline_get_editorial_status(10) !== 'assigned') { wwh_test_fail('Writer assignment did not advance the pitch.'); }

// A published story reports Published without losing the stage underneath it.
$post->post_status = 'publish';
$published_story = wwh_discord_story(10);
if ($published_story['status'] !== 'published') { wwh_test_fail('A published story was not reported as Published to Discord.'); }
if (byline_get_editorial_status(10) !== 'assigned') { wwh_test_fail('Publishing destroyed the stored workflow stage.'); }
if (byline_set_editorial_status(10, 'published')) { wwh_test_fail('A manual "published" workflow mutation was accepted.'); }
$post->post_status = 'draft';
if (wwh_discord_story(10)['status'] !== 'assigned') { wwh_test_fail('Unpublishing did not recover the stored workflow stage.'); }

// Deadlines and visual needs still round-trip through Discord's payload.
byline_set_editorial_deadline(10, '2026-09-01');
byline_set_editorial_visuals(10, 'Need a vertical photo from practice');
$story = wwh_discord_story(10);
if ($story['deadline'] !== '2026-09-01' || $story['visuals'] !== 'Need a vertical photo from practice') {
    wwh_test_fail('Discord lost the editorial deadline or visual needs.');
}

$user = new WP_User();
$wwh_test_capabilities = ['edit_posts' => true];
if (!wwh_discord_capability($user, 'edit_posts') || wwh_discord_capability($user, 'manage_options')) { wwh_test_fail('Capability enforcement failed.'); }
$wwh_test_capabilities = ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true];

$post->post_status = 'publish';
wwh_discord_run_story_sync(10);
if (empty($wwh_test_meta[10][WWH_DISCORD_LAST_ERROR_META])) { wwh_test_fail('Unavailable bot failure was not recorded safely.'); }
echo "Discord integration regression passed.\n";
