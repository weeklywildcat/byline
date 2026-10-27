<?php
/** Collection public projection and non-destructive legacy migration. */
define('ABSPATH', __DIR__ . '/../');
const BYLINE_COLLECTION_POST_TYPE = 'byline_collection';
$posts = []; $meta = []; $edges = []; $options = []; $can_publish = true; $edge_failure = false;
class WP_Post {
    public $ID = 0; public $post_type = 'post'; public $post_status = 'publish'; public $post_title = ''; public $post_name = ''; public $post_content = ''; public $post_author = 7; public $post_password = ''; public $meta_input = [];
    public function __construct(array $values) { foreach ($values as $key => $value) $this->$key = $value; }
}
class WP_Error { public $message; public function __construct($code, $message, $data = []) { $this->message = $message; } }
function check(bool $pass, string $message): void { if (!$pass) { fwrite(STDERR, $message . "\n"); exit(1); } }
function add_action(...$args): void {}
function sanitize_key($v): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $v)); }
function sanitize_text_field($v): string { return trim(strip_tags((string) $v)); }
function sanitize_textarea_field($v): string { return sanitize_text_field($v); }
function sanitize_title($v): string { return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $v)), '-'); }
function wp_kses_post($v): string { return strip_tags((string) $v, '<p><strong><em><a>'); }
function absint($v): int { return abs((int) $v); }
function wp_slash($v) { return $v; }
function esc_url_raw($v): string { return (string) $v; }
function rest_sanitize_boolean($v): bool { return filter_var($v, FILTER_VALIDATE_BOOLEAN); }
function is_wp_error($v): bool { return $v instanceof WP_Error; }
function current_user_can($cap, ...$args): bool { global $can_publish; return $cap !== 'publish_posts' || $can_publish; }
function get_post($id) { global $posts; return $posts[$id] ?? null; }
function get_post_type($id): string { return get_post($id)->post_type ?? ''; }
function get_userdata($id) { return $id ? (object) ['ID' => $id] : false; }
function get_post_meta($id, $key, $single = true) { global $meta; return $meta[$id][$key] ?? ''; }
function update_post_meta($id, $key, $value): bool { global $meta; $meta[$id][$key] = $value; return true; }
function get_post_thumbnail_id($id): int { return (int) get_post_meta($id, '_thumbnail_id'); }
function wp_get_attachment_image_url($id, $size) { return 'https://public.test/photo.jpg'; }
function wp_attachment_is_image($id): bool { return get_post_type($id) === 'attachment'; }
function get_permalink($id): string { return 'https://public.test/stories/' . $id; }
function get_the_excerpt($post): string { return 'Public excerpt'; }
function add_option($key, $value, ...$args): bool { global $options; if (isset($options[$key])) return false; $options[$key] = $value; return true; }
function get_option($key, $default = null) { global $options; return $options[$key] ?? $default; }
function delete_option($key): bool { global $options; unset($options[$key]); return true; }
function wp_insert_post($input, $error = false) {
    global $posts, $meta;
    $id = count($posts) + 1000;
    $posts[$id] = new WP_Post(['ID' => $id] + $input);
    foreach ($input['meta_input'] ?? [] as $key => $value) $meta[$id][$key] = $value;
    return $id;
}
function get_posts($query): array {
    global $posts;
    $result = [];
    foreach ($posts as $id => $post) {
        if (isset($query['post_type']) && $query['post_type'] !== $post->post_type) continue;
        if (isset($query['post_status']) && $query['post_status'] !== 'any' && !in_array($post->post_status, (array) $query['post_status'], true)) continue;
        if (isset($query['name']) && $query['name'] !== $post->post_name) continue;
        if (isset($query['meta_key']) && get_post_meta($id, $query['meta_key']) === '') continue;
        if (isset($query['meta_value']) && get_post_meta($id, $query['meta_key']) != $query['meta_value']) continue;
        $result[] = ($query['fields'] ?? '') === 'ids' ? $id : $post;
    }
    return ($query['numberposts'] ?? -1) === -1 ? $result : array_slice($result, 0, $query['numberposts']);
}
function byline_relation_ids($owner, $relation): array { global $edges; return $edges[$owner][$relation] ?? []; }
function byline_relation_set($owner, $relation, $target, $linked): bool {
    global $edges, $edge_failure;
    if ($edge_failure) return false;
    $ids = byline_relation_ids($owner, $relation);
    $edges[$owner][$relation] = $linked ? array_values(array_unique([...$ids, $target])) : array_values(array_diff($ids, [$target]));
    return true;
}
function byline_collection_post($id): ?WP_Post { $post = get_post($id); return $post && $post->post_type === BYLINE_COLLECTION_POST_TYPE && $post->post_status === 'private' ? $post : null; }
function byline_collection_error($message, $status = 400) { return new WP_Error('collection', $message, ['status' => $status]); }
require __DIR__ . '/../includes/editorial/coverage.php';
require __DIR__ . '/../includes/editorial/collection-public.php';
$posts[1] = new WP_Post(['ID' => 1, 'post_title' => 'Public story']);
$posts[2] = new WP_Post(['ID' => 2, 'post_title' => 'PRIVATE DRAFT', 'post_status' => 'draft']);
$posts[3] = new WP_Post(['ID' => 3, 'post_title' => 'Second public story']);
$posts[4] = new WP_Post(['ID' => 4, 'post_title' => 'PASSWORD PROTECTED', 'post_password' => 'secret']);
$posts[5] = new WP_Post(['ID' => 5, 'post_title' => 'Artwork', 'post_type' => 'attachment', 'post_status' => 'inherit']);
$posts[10] = new WP_Post(['ID' => 10, 'post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_title' => "Election night", 'post_name' => 'election-night']);
$meta[10] = [BYLINE_COVERAGE_DESCRIPTION_META => 'A public dek', BYLINE_COVERAGE_OVERVIEW_META => '<p>Public context</p>', BYLINE_COVERAGE_PUBLIC_META => true, BYLINE_COVERAGE_STATUS_META => 'past', BYLINE_COVERAGE_STAFF_META => [7, 9], BYLINE_COVERAGE_STORIES_META => [3, 2, 1, 4], BYLINE_COVERAGE_START_META => '2026-10-01T12:00:00Z', BYLINE_COVERAGE_END_META => '2026-10-02T13:00:00Z', '_thumbnail_id' => 5];
// A superficially identical existing Collection must never be heuristically merged.
$posts[11] = new WP_Post(['ID' => 11, 'post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'post_title' => 'Election night']);
$edges[11]['story'] = [1, 2, 3];
$edge_failure = true;
check(!byline_migrate_coverage_to_collections(), 'A partial edge failure was reported as a successful migration.');
$partial = byline_collection_for_legacy_coverage(10);
check($partial > 11, 'Migration reused an unrelated Collection by name.');
$edge_failure = false;
check(byline_migrate_coverage_to_collections(), 'Interrupted migration could not resume.');
check(byline_collection_for_legacy_coverage(10) === $partial, 'Retry created another Collection after partial insertion.');
$count = count($posts);
check(byline_migrate_coverage_to_collections() && count($posts) === $count, 'Migration was not idempotent.');
check(get_post(10)->post_type === BYLINE_COVERAGE_POST_TYPE, 'Migration destroyed the legacy source record.');
check(byline_relation_ids($partial, 'story') === [3, 2, 1, 4] && byline_relation_ids($partial, 'member') === [7, 9], 'Migration lost story or staff relationships.');
check(byline_relation_ids(11, 'story') === [1, 2, 3], 'Migration changed another editorial project.');
check(get_post_meta($partial, '_byline_collection_status') === 'wrapping-up', 'Legacy status was translated incorrectly.');
$p = byline_collection_public_settings($partial);
check($p['artworkAttachmentId'] === 5 && $p['publicDescription'] === 'A public dek' && $p['publicOverview'] === '<p>Public context</p>', 'Migration lost public metadata.');
$public = byline_get_public_coverage_by_slug('election-night');
check($public && $public['slug'] === 'election-night' && $public['startAt'] === '2026-10-01T12:00:00Z' && $public['status'] === 'past', 'Existing coverage URL or dates changed.');
check(array_column($public['stories'], 'id') === [3, 1], 'Unpublished/password-protected stories leaked, or story order changed.');
foreach (['brief', 'staffIds', 'members', 'storyIds', 'interviews', 'tasks', 'resources', 'activity'] as $key) check(!isset($public[$key]), 'Private Collection data leaked: ' . $key);
$p['publicTitle'] = 'Public election guide'; $p['featuredStoryId'] = 1; $p['storyOrder'] = [3, 1, 2, 4];
$next = byline_collection_public_input($p, $partial);
check(!is_wp_error($next), 'Valid public ordering was rejected.');
update_post_meta($partial, BYLINE_COLLECTION_PUBLIC_META, $next);
$public = byline_get_public_coverage_by_slug('election-night');
check(array_column($public['stories'], 'id') === [1, 3] && $public['title'] === 'Public election guide', 'Featured story or public title did not persist.');
check(get_post($partial)->post_title === 'Election night', 'Public wording overwrote the internal name.');
check(is_wp_error(byline_collection_public_input(['featuredStoryId' => 999], $partial)), 'An unrelated featured story was accepted.');
check(is_wp_error(byline_collection_public_input(['storyOrder' => [999]], $partial)), 'Unrelated ordering IDs were accepted.');
$p['publicEnabled'] = false;
update_post_meta($partial, BYLINE_COLLECTION_PUBLIC_META, byline_collection_public_input($p, $partial));
check(byline_get_public_coverage_by_slug('election-night') === null && byline_list_public_coverages() === [], 'Disabling public coverage left the page public.');
$can_publish = false;
check(is_wp_error(byline_collection_public_input(['publicEnabled' => true], $partial)), 'Public settings bypassed publish capability.');
echo "Collection public coverage and legacy migration regression passed.\n";
