<?php

define('ABSPATH', __DIR__ . '/../');
const BYLINE_DESIGN_SCHEMA_VERSION = 1;
const BYLINE_REST_NAMESPACE = 'byline/v1';
const BYLINE_MANAGE_CAPABILITY = 'manage_byline';
const BYLINE_EDIT_DESIGN_CAPABILITY = 'edit_byline_design';
const BYLINE_PUBLISH_DESIGN_CAPABILITY = 'publish_byline_design';

$design_post = null;
$post_meta = [];
$user_meta = [];
$revisions = [];
$next_revision_id = 100;

class WP_Error
{
    public string $code; public string $message; public array $data;
    public function __construct(string $code, string $message, array $data = []) { $this->code = $code; $this->message = $message; $this->data = $data; }
}
class WP_Post
{
    public int $ID;
    public string $post_content = '';
    public string $post_author = '1';
    public string $post_modified_gmt = '2026-08-25 12:00:00';
    public int $post_parent = 0;
}
class WP_REST_Response { public $data; public function __construct($data) { $this->data = $data; } }
class WP_REST_Request implements ArrayAccess
{
    private array $route; private array $json;
    public function __construct(array $route, array $json = []) { $this->route = $route; $this->json = $json; }
    public function get_json_params(): array { return $this->json; }
    public function offsetExists($offset): bool { return isset($this->route[$offset]); }
    public function offsetGet($offset) { return $this->route[$offset] ?? null; }
    public function offsetSet($offset, $value): void { $this->route[$offset] = $value; }
    public function offsetUnset($offset): void { unset($this->route[$offset]); }
}

function add_action(...$args): void {}
function __(string $message, string $domain = ''): string { return $message; }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function wp_json_encode($value) { return json_encode($value); }
function wp_slash($value) { return $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function rest_ensure_response($data): WP_REST_Response { return new WP_REST_Response($data); }
function register_rest_route(...$args): void {}
function current_user_can(string $capability): bool { return true; }
function get_current_user_id(): int { return 7; }
function byline_get_publication_config(): array { return ['appearance' => ['theme' => 'byline-modern'], 'features' => ['sports' => true, 'events' => true, 'polls' => true, 'newsletter' => true]]; }
function byline_protocol_manifest(): array { return []; }
function byline_publication_response(): array { return []; }
function wwh_schedule_cloudflare_deploy(): void {}
function get_posts(array $args): array { global $design_post; return $design_post instanceof WP_Post ? [$design_post] : []; }
function get_post_meta(int $post_id, string $key, bool $single = false) { global $post_meta; return $post_meta[$post_id][$key] ?? ''; }
function update_post_meta(int $post_id, string $key, $value): void { global $post_meta; $post_meta[$post_id][$key] = $value; }
function get_post_modified_time(string $format, bool $gmt, WP_Post $post): string { return '2026-08-25T12:00:00+00:00'; }
function get_user_meta(int $user_id, string $key, bool $single = false) { global $user_meta; return $user_meta[$user_id][$key] ?? ''; }
function update_user_meta(int $user_id, string $key, $value): void { global $user_meta; $user_meta[$user_id][$key] = $value; }
function delete_user_meta(int $user_id, string $key): void { global $user_meta; unset($user_meta[$user_id][$key]); }
function wp_insert_post(array $data, bool $wp_error = false) { global $design_post; $design_post = new WP_Post(); $design_post->ID = 55; $design_post->post_content = $data['post_content']; return 55; }
function wp_update_post(array $data, bool $wp_error = false) { global $design_post; $design_post->post_content = $data['post_content']; return $design_post->ID; }
function wp_save_post_revision(int $post_id): int { global $design_post, $revisions, $next_revision_id; $revision = clone $design_post; $revision->ID = $next_revision_id++; $revision->post_parent = $post_id; $revisions[$revision->ID] = $revision; return $revision->ID; }
function wp_get_post_revision(int $revision_id) { global $revisions; return $revisions[$revision_id] ?? null; }
function wp_get_post_revisions(int $post_id, array $args = []): array { global $revisions; return $revisions; }
function mysql_to_rfc3339(string $value): string { return '2026-08-25T12:00:00+00:00'; }

require __DIR__ . '/../includes/design/schema.php';
require __DIR__ . '/../includes/design/post-type.php';
require __DIR__ . '/../includes/design/rest.php';

$document = byline_default_design_document('home');
$document['layout']['content'][0]['props']['title'] = 'Private autosave';
$autosave_response = byline_rest_autosave_design(new WP_REST_Request(
    ['template' => 'home'],
    ['document' => $document, 'baseRevisionId' => 0]
));
if (!$autosave_response instanceof WP_REST_Response || byline_published_design('home')['revision'] !== 0 || $design_post !== null) {
    fwrite(STDERR, "A design autosave changed the public design or created a published record.\n");
    exit(1);
}

$publish_response = byline_rest_publish_design(new WP_REST_Request(
    ['template' => 'home'],
    ['document' => $document, 'baseRevisionId' => 0]
));
if (!$publish_response instanceof WP_REST_Response || $publish_response->data['revision'] !== 1 || get_user_meta(7, byline_design_autosave_key('home'), true) !== '') {
    fwrite(STDERR, "Publishing did not promote the validated design, increment its revision, and clear the user's autosave.\n");
    exit(1);
}

$v2_with_legacy = [
    'schemaVersion' => 2,
    'template' => 'home',
    'theme' => 'byline-modern',
    'packages' => [[
        'id' => 'home-lead',
        'type' => 'lead-package',
        'props' => [],
    ]],
    'legacy' => [
        'schemaVersion' => 1,
        'editor' => ['engine' => 'puck', 'version' => '0.23.0'],
        'unconvertedBlocks' => [['type' => 'custom-extension', 'props' => ['enabled' => true]]],
    ],
];
$guarded_publish = byline_rest_publish_design(new WP_REST_Request(
    ['template' => 'home'],
    ['document' => $v2_with_legacy, 'baseRevisionId' => 1]
));
if (!$guarded_publish instanceof WP_Error || $guarded_publish->code !== 'byline_unconverted_design_blocks' || byline_published_design('home')['revision'] !== 1) {
    fwrite(STDERR, "A schema 2 design with preserved legacy blocks was allowed to publish.\n");
    exit(1);
}

$stale = byline_rest_autosave_design(new WP_REST_Request(
    ['template' => 'home'],
    ['document' => $document, 'baseRevisionId' => 0]
));
if (!$stale instanceof WP_Error || $stale->code !== 'byline_design_conflict' || ($stale->data['status'] ?? 0) !== 409) {
    fwrite(STDERR, "A stale autosave was not rejected with an optimistic-lock conflict.\n");
    exit(1);
}

$published_before_restore = byline_published_design('home');
$revision_id = array_key_first($revisions);
$restore = byline_rest_restore_design_revision(new WP_REST_Request(['template' => 'home', 'revision' => $revision_id]));
if (!$restore instanceof WP_REST_Response || !isset($restore->data['restoredFromRevisionId']) || byline_published_design('home') !== $published_before_restore) {
    fwrite(STDERR, "Restoring a revision must create an editable autosave without immediately changing the public design.\n");
    exit(1);
}

echo "Byline design storage regression passed.\n";
