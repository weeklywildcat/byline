<?php

/**
 * Route-level regression coverage for the grouped newsroom editorial API.
 *
 * This test intentionally captures registration rather than booting a full
 * WordPress HTTP server. It verifies the contract most likely to fail silently:
 * every named callback/permission handler exists, every private route has a
 * permission callback, and the public routes are limited to safe projections or
 * the bounded feedback write.
 */

define('ABSPATH', __DIR__ . '/../');
define('BYLINE_REST_NAMESPACE', 'byline/v1');

class WP_Post {}
class WP_User {}
class WP_Error {}
class WP_REST_Response {}

class WP_REST_Request
{
    public function get_param($key) { return null; }
    public function get_json_params() { return []; }
    public function get_params(): array { return []; }
    public function get_header($key) { return ''; }
    public function get_route(): string { return ''; }
}

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const CREATABLE = 'POST';
    public const EDITABLE = 'POST,PUT,PATCH';
}

$editorial_rest_test_routes = [];
$editorial_rest_test_fields = [];
$editorial_rest_test_user_meta = [
    7 => ['_ww_author_photo_id' => 101],
];

function absint($value): int { return abs((int) $value); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function esc_url_raw($value, $protocols = null): string
{
    $url = (string) $value;
    return preg_match('#^https?://#', $url) ? $url : '';
}
function get_user_meta(int $user_id, string $key, bool $single = false)
{
    global $editorial_rest_test_user_meta;
    return $editorial_rest_test_user_meta[$user_id][$key] ?? '';
}
function wp_get_attachment_image_url(int $attachment_id, string $size = 'thumbnail')
{
    $urls = [
        101 => 'https://images.example.test/author.jpg',
        102 => 'https://images.example.test/contributor.jpg',
    ];
    return $urls[$attachment_id] ?? false;
}

function add_action(...$args): void {}
function add_filter(...$args): void {}
function register_post_type(...$args): void {}
function register_post_meta(...$args): void {}
function register_rest_route($namespace, $route, $args, $override = false): void
{
    global $editorial_rest_test_routes;
    $editorial_rest_test_routes[(string) $namespace . (string) $route] = $args;
}
function register_rest_field($object_type, $attribute, $args): void
{
    global $editorial_rest_test_fields;
    $editorial_rest_test_fields[(string) $object_type . ':' . (string) $attribute] = $args;
}
function __return_true(): bool { return true; }

require __DIR__ . '/../includes/editorial/workflow.php';
require __DIR__ . '/../includes/editorial/rest.php';

function editorial_rest_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function editorial_rest_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        editorial_rest_test_fail($message);
    }
}

editorial_rest_test_assert(function_exists('byline_editorial_register_extended_rest_routes'), 'The grouped editorial route registrar is undefined.');
byline_editorial_register_extended_rest_routes();
byline_editorial_register_rest_routes();

$expected_routes = [
    '/editorial/activity',
    '/editorial/stories/(?P<id>\\d+)/activity',
    '/editorial/presets',
    '/editorial/presets/(?P<type>[a-z0-9_-]+)',
    '/editorial/presets/(?P<type>[a-z0-9_-]+)/reset',
    '/editorial/presets/(?P<type>[a-z0-9_-]+)/apply',
    '/editorial/stories/(?P<id>\\d+)/bootstrap',
    '/editorial/stories/(?P<id>\\d+)',
    '/editorial/planning',
    '/editorial/saved-views',
    '/editorial/saved-views/(?P<id>[A-Za-z0-9_-]+)',
    '/editorial/planning/views',
    '/editorial/planning/views/(?P<id>[A-Za-z0-9_-]+)',
    '/editorial/stories/(?P<id>\\d+)/media',
    '/editorial/media',
    '/admin/media',
    '/admin/media/(?P<id>\\d+)',
    '/editorial/stories/(?P<id>\\d+)/media/featured',
    '/editorial/tasks',
    '/editorial/tasks/(?P<id>\\d+)',
    '/coverage',
    '/coverage/(?P<slug>[a-z0-9-]+)',
    '/corrections',
    '/admin/coverage',
    '/admin/coverage/(?P<id>\\d+)',
    '/admin/coverage/(?P<id>\\d+)/stories',
    '/admin/coverage/(?P<id>\\d+)/stories/(?P<story>\\d+)',
    '/editorial/readiness/(?P<id>\\d+)',
    '/editorial/stories/(?P<id>\\d+)/corrections',
    '/editorial/corrections/(?P<id>\\d+)',
    '/admin/editorial/corrections',
    '/admin/editorial/corrections/(?P<id>\\d+)',
    '/feedback',
    '/admin/feedback',
    '/admin/feedback/(?P<id>\\d+)',
    '/admin/feedback/(?P<id>\\d+)/correction-draft',
    '/admin/feedback/(?P<id>\\d+)/correction',
    '/editorial/stories/(?P<id>\\d+)/contributors',
    '/contributors/guests',
    '/admin/contributors/guests',
    '/admin/contributors/guests/(?P<id>\\d+)',
];

global $editorial_rest_test_routes;
foreach ($expected_routes as $route) {
    editorial_rest_test_assert(isset($editorial_rest_test_routes['byline/v1' . $route]), "Missing grouped editorial route {$route}.");
}

foreach ($editorial_rest_test_routes as $route => $definition) {
    $methods = isset($definition[0]) && is_array($definition[0]) ? $definition : [$definition];
    foreach ($methods as $method_definition) {
        if (!is_array($method_definition)) {
            editorial_rest_test_fail("Route {$route} has an invalid method definition.");
        }
        $callback = $method_definition['callback'] ?? null;
        $permission = $method_definition['permission_callback'] ?? null;
        editorial_rest_test_assert(is_callable($callback), "Route {$route} has a non-callable callback.");
        editorial_rest_test_assert(is_callable($permission), "Route {$route} has a non-callable permission callback.");
    }
}

editorial_rest_test_assert(isset($editorial_rest_test_fields['post:contributors']), 'Public contributor REST projection was not registered.');
editorial_rest_test_assert(isset($editorial_rest_test_fields['post:corrections']), 'Public correction REST projection was not registered.');

// Planning people must preserve real Byline profile photos so the shadcn
// AvatarGroup used by Board/List has an image to render.
$legacy_author = byline_editorial_rest_person(['id' => 7, 'name' => 'Primary Writer']);
editorial_rest_test_assert(($legacy_author['avatarUrl'] ?? '') === 'https://images.example.test/author.jpg', 'A writer/editor row did not resolve its stored Byline profile photo.');

$user_contributor = byline_editorial_rest_person([
    'id' => 8,
    'name' => 'Second Writer',
    'type' => 'user',
    'imageId' => 102,
]);
editorial_rest_test_assert(($user_contributor['avatarUrl'] ?? '') === 'https://images.example.test/contributor.jpg', 'A user contributor imageId did not become a Planning avatar URL.');

$guest_contributor = byline_editorial_rest_person([
    'id' => 9,
    'name' => 'Guest Photographer',
    'type' => 'guest',
    'profilePhoto' => ['url' => 'https://images.example.test/guest.jpg'],
]);
editorial_rest_test_assert(($guest_contributor['avatarUrl'] ?? '') === 'https://images.example.test/guest.jpg', 'A guest contributor profile photo did not become a Planning avatar URL.');

$no_photo = byline_editorial_rest_person(['id' => 10, 'name' => 'No Photo']);
editorial_rest_test_assert(!array_key_exists('avatarUrl', $no_photo), 'Planning must not invent a placeholder avatar when no real profile photo exists.');

echo "Grouped editorial REST regression passed (" . count($editorial_rest_test_routes) . " routes).\n";
