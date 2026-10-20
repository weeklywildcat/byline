<?php
/** Private, manually supplied story links. Never fetch the remote resource. */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_RESOURCES_META = '_byline_story_resources';
const BYLINE_STORY_RESOURCES_MAX = 24;

/** What a link is for. Optional; older links without one read as `other`. */
function byline_story_resource_purposes(): array
{
    return ['draft', 'interview-notes', 'transcript', 'research', 'data', 'folder', 'other'];
}

function byline_story_resource_purpose($value): string
{
    $purpose = is_string($value) ? sanitize_key($value) : '';
    return in_array($purpose, byline_story_resource_purposes(), true) ? $purpose : 'other';
}

function byline_story_resource_input(array $input)
{
    $label = byline_task_text($input['label'] ?? '', 120);
    $raw = is_string($input['url'] ?? null) ? trim($input['url']) : '';
    $parts = wp_parse_url($raw);
    if ($label === '' || strlen($raw) > 2048 || !is_array($parts)
        || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])
        || preg_match('/[\x00-\x20\x7f]/', $raw)) {
        return new WP_Error('byline_invalid_resource', 'Add a label and a valid HTTP or HTTPS link without embedded credentials.', ['status' => 400]);
    }
    $url = esc_url_raw($raw, ['http', 'https']);
    if ($url === '') {
        return new WP_Error('byline_invalid_resource', 'This link could not be saved.', ['status' => 400]);
    }
    $host = strtolower($parts['host']);
    $path = $parts['path'] ?? '/';
    $kind = 'External link';
    foreach ([
        ['docs.google.com', '/document/', 'Google Doc'],
        ['docs.google.com', '/spreadsheets/', 'Google Sheet'],
        ['docs.google.com', '/presentation/', 'Google Slides'],
        ['drive.google.com', '/drive/folders/', 'Drive folder'],
        ['drive.google.com', '/file/', 'Drive file'],
    ] as [$domain, $prefix, $label_kind]) {
        if ($host === $domain && strpos($path, $prefix) === 0) {
            $kind = $label_kind;
            break;
        }
    }
    if (isset($input['purpose']) && $input['purpose'] !== '' && $input['purpose'] !== null
        && (!is_string($input['purpose']) || !in_array(sanitize_key($input['purpose']), byline_story_resource_purposes(), true))) {
        return new WP_Error('byline_invalid_resource_purpose', 'Choose a valid link purpose.', ['status' => 400]);
    }
    return ['label' => $label, 'url' => $url, 'kind' => $kind, 'purpose' => byline_story_resource_purpose($input['purpose'] ?? 'other')];
}

/** @return list<array<string,string>> */
function byline_story_resources_normalize(array $rows): array
{
    $links = [];
    foreach (array_slice($rows, 0, BYLINE_STORY_RESOURCES_MAX) as $row) {
        if (!is_array($row) || empty($row['id'])) {
            continue;
        }
        $link = byline_story_resource_input($row);
        if (!is_wp_error($link)) {
            $links[] = ['id' => sanitize_key($row['id'])] + $link;
        }
    }
    return $links;
}

/** Private links are visible to anyone who can see the story's workspace context. */
function byline_story_resources_can_view(int $story_id): bool
{
    return function_exists('byline_story_context_can_view')
        ? byline_story_context_can_view($story_id)
        : current_user_can('edit_post', $story_id);
}

/** Adding or removing links needs a hand in the story, not merely a view of it. */
function byline_story_resources_can_manage(int $story_id): bool
{
    return function_exists('byline_story_context')
        ? byline_story_context($story_id)['manage']
        : current_user_can('edit_post', $story_id);
}

function byline_get_story_resources(int $story_id): array
{
    if (!byline_story_resources_can_view($story_id)) {
        return [];
    }
    $stored = get_post_meta($story_id, BYLINE_STORY_RESOURCES_META, true);
    return byline_story_resources_normalize(is_array($stored) ? $stored : []);
}

function byline_editorial_rest_resource(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    if (!byline_story_resources_can_manage($story_id)) {
        return new WP_Error('byline_resource_forbidden', 'You cannot change this story\'s links.', ['status' => rest_authorization_required_code()]);
    }
    $resource_id = (string) $request->get_param('resource');
    $method = strtoupper($request->get_method());
    $body = byline_editorial_rest_body($request);
    $link = $method === 'DELETE' ? null : byline_story_resource_input($body);
    if (is_wp_error($link)) {
        return $link;
    }
    $new_id = byline_story_uuid();
    // Compare-and-swap keeps two editors adding/removing links from replacing
    // each other's lists. The field is private even on published stories.
    $stored = byline_story_collection_update($story_id, BYLINE_STORY_RESOURCES_META, static function (array $links) use ($link, $resource_id, $method, $new_id) {
        if ($method === 'DELETE') {
            return array_values(array_filter($links, static function ($row) use ($resource_id) { return $row['id'] !== $resource_id; }));
        }
        if ($resource_id !== '') {
            foreach ($links as $index => $row) {
                if ($row['id'] === $resource_id) {
                    $links[$index] = ['id' => $resource_id] + $link;
                    return $links;
                }
            }
            return new WP_Error('byline_resource_not_found', 'That link is no longer on this story.', ['status' => 404]);
        }
        if (count($links) >= BYLINE_STORY_RESOURCES_MAX) {
            return new WP_Error('byline_resource_limit', 'A story can have up to ' . BYLINE_STORY_RESOURCES_MAX . ' resource links.', ['status' => 400]);
        }
        $links[] = ['id' => $new_id] + $link;
        return $links;
    }, ['normalize' => 'byline_story_resources_normalize']);
    if (is_wp_error($stored)) {
        return $stored->get_error_code() === 'byline_story_collection_conflict'
            ? new WP_Error('byline_resource_conflict', 'The links changed. Reload the story and try again.', ['status' => 409])
            : $stored;
    }
    return rest_ensure_response(['resources' => $stored]);
}

add_action('init', static function (): void {
    register_post_meta('post', BYLINE_STORY_RESOURCES_META, [
        'type' => 'array', 'single' => true, 'show_in_rest' => false,
        'auth_callback' => static function ($allowed, $key, $post_id): bool { return current_user_can('edit_post', (int) $post_id); },
    ]);
});
add_action('rest_api_init', static function (): void {
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/resources', [
        'methods' => WP_REST_Server::CREATABLE, 'callback' => 'byline_editorial_rest_resource', 'permission_callback' => 'byline_story_context_rest_permission',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)/resources/(?P<resource>[a-z0-9-]+)', [
        ['methods' => WP_REST_Server::DELETABLE, 'callback' => 'byline_editorial_rest_resource', 'permission_callback' => 'byline_story_context_rest_permission'],
        ['methods' => WP_REST_Server::EDITABLE, 'callback' => 'byline_editorial_rest_resource', 'permission_callback' => 'byline_story_context_rest_permission'],
    ]);
});
