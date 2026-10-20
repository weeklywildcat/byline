<?php
/** Private, manually supplied story links. Never fetch the remote resource. */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_RESOURCES_META = '_byline_story_resources';

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
    return ['label' => $label, 'url' => $url, 'kind' => $kind];
}

function byline_get_story_resources(int $story_id): array
{
    if (!current_user_can('edit_post', $story_id)) {
        return [];
    }
    $stored = get_post_meta($story_id, BYLINE_STORY_RESOURCES_META, true);
    $links = [];
    foreach (is_array($stored) ? array_slice($stored, 0, 24) : [] as $row) {
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

function byline_editorial_rest_resource(WP_REST_Request $request)
{
    $story_id = absint($request->get_param('id'));
    $permission = byline_editorial_rest_permission($request);
    if ($permission !== true) {
        return $permission;
    }
    $remove_id = (string) $request->get_param('resource');
    $link = $remove_id === '' ? byline_story_resource_input(byline_editorial_rest_body($request)) : null;
    if (is_wp_error($link)) {
        return $link;
    }
    $new_id = $link ? wp_generate_uuid4() : '';
    // Compare-and-swap keeps two editors adding/removing links from replacing
    // each other's lists. The field is private even on published stories.
    for ($attempt = 0; $attempt < 3; $attempt++) {
        $previous = get_post_meta($story_id, BYLINE_STORY_RESOURCES_META, true);
        $links = byline_get_story_resources($story_id);
        if ($link && count($links) >= 24) {
            return new WP_Error('byline_resource_limit', 'A story can have up to 24 resource links.', ['status' => 400]);
        }
        if ($link) {
            $links[] = ['id' => $new_id] + $link;
        } else {
            $links = array_values(array_filter($links, static function ($row) use ($remove_id) { return $row['id'] !== $remove_id; }));
        }
        if ($links === $previous || ($previous === ''
            ? add_post_meta($story_id, BYLINE_STORY_RESOURCES_META, wp_slash($links), true)
            : update_post_meta($story_id, BYLINE_STORY_RESOURCES_META, wp_slash($links), $previous))) {
            return rest_ensure_response(['resources' => $links]);
        }
    }
    return new WP_Error('byline_resource_conflict', 'The links changed. Reload the story and try again.', ['status' => 409]);
}

add_action('init', static function (): void {
    register_post_meta('post', BYLINE_STORY_RESOURCES_META, [
        'type' => 'array', 'single' => true, 'show_in_rest' => false,
        'auth_callback' => static function ($allowed, $key, $post_id): bool { return current_user_can('edit_post', (int) $post_id); },
    ]);
});
add_action('rest_api_init', static function (): void {
    foreach (['/resources', '/resources/(?P<resource>[a-z0-9-]+)'] as $suffix) {
        register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/stories/(?P<id>\d+)' . $suffix, [
            'methods' => strpos($suffix, '?P<resource>') !== false ? WP_REST_Server::DELETABLE : WP_REST_Server::CREATABLE,
            'callback' => 'byline_editorial_rest_resource',
            'permission_callback' => 'byline_editorial_rest_permission',
        ]);
    }
});
