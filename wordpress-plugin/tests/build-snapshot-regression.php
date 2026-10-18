<?php
/** Public schema, immutable storage and revision race regression, without HTTP. */
define('ABSPATH', __DIR__);
define('DAY_IN_SECONDS', 86400);
define('BYLINE_REST_NAMESPACE', 'byline/v1');
class WP_Error { public $code; public function __construct($code, $message = '', $data = []) { $this->code = $code; } }
class WP_Post { public $ID; public $post_status = 'publish'; public $post_password = ''; public $post_type = 'post'; public $post_name = 'public'; public $post_title = 'Public'; }
function add_action(...$args) {}
function wp_json_encode($value, $flags = 0) { return json_encode($value, $flags); }
function wp_mkdir_p($path) { return mkdir($path, 0777, true); }
function is_wp_error($value) { return $value instanceof WP_Error; }
require_once __DIR__ . '/../includes/publication/build-snapshot.php';
function snapshot_assert($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$secret = 'BYLINE_PRIVATE_SENTINEL';
$public = byline_snapshot_contributor([
    'id' => 4, 'name' => 'Public Writer', 'slug' => 'writer', 'user_email' => $secret, 'user_pass' => $secret, 'notes' => $secret, 'deployHookUrl' => $secret,
    'profilePhoto' => ['url' => 'https://cms.test/photo.jpg', 'alt' => 'Public', 'adminNonce' => $secret],
    'bylineProfile' => ['pronouns' => 'they/them', 'shortBio' => 'Reports on city hall and public records.', 'private' => $secret, 'socials' => ['website' => 'https://writer.test', 'oauthToken' => $secret]],
]);
snapshot_assert(strpos(json_encode($public), $secret) === false, 'Only explicit public contributor fields may enter the artifact.');
snapshot_assert($public['bylineProfile']['socials']['website'] === 'https://writer.test', 'Keep canonical public profile fields.');
snapshot_assert($public['bylineProfile']['shortBio'] === 'Reports on city hall and public records.', 'Keep the public short author bio in build snapshots.');
$post = new WP_Post();
snapshot_assert(byline_snapshot_public_post($post), 'Published public content is allowed.');
foreach (['draft', 'private', 'future', 'trash', 'pending'] as $status) { $post->post_status = $status; snapshot_assert(!byline_snapshot_public_post($post), 'Exclude non-public status ' . $status); }
$post->post_status = 'publish'; $post->post_password = 'protected';
snapshot_assert(!byline_snapshot_public_post($post), 'Password-protected content must never be serialized.');
$directory = sys_get_temp_dir() . '/byline-snapshot-test-' . uniqid();
$payload = ['schemaVersion' => 1, 'revision' => 8, 'generatedAt' => '2026-10-17T00:00:00Z', 'datasets' => []];
$first = byline_store_build_snapshot($payload, $directory, 'https://cms.test/uploads/build', static fn() => 8);
snapshot_assert(!is_wp_error($first), 'An unchanged revision can be published.');
$file = $directory . '/' . basename($first['url']);
snapshot_assert(hash_file('sha256', $file) === $first['digest'] && filesize($file) === $first['bytes'], 'Declared digest and size cover exact immutable bytes.');
$second = byline_store_build_snapshot($payload, $directory, 'https://cms.test/uploads/build', static fn() => 8);
snapshot_assert($first === $second && count(glob($directory . '/*.json')) === 1, 'Same revision/data is idempotent.');
$payload['revision'] = 9;
$race = byline_store_build_snapshot($payload, $directory, 'https://cms.test/uploads/build', static fn() => 10);
snapshot_assert(is_wp_error($race) && $race->code === 'byline_snapshot_revision_race', 'A revision change during generation must fail.');
snapshot_assert(count(glob($directory . '/*.json')) === 1 && count(glob($directory . '/.pending-*')) === 0, 'A race must not publish or leave a partial artifact.');
unlink($file); rmdir($directory);
echo "Byline build snapshot privacy/atomicity/race regression passed.\n";
