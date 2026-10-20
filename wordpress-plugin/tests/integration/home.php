<?php
/** Run with wp eval-file in the disposable wp-env installation. */
if (!defined('ABSPATH')) { exit; }
require_once ABSPATH . 'wp-admin/includes/user.php';
$ids = [];
$task_ids = [];
$user_ids = [];
$checks = 0;
$assert = static function ($condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    $checks++;
};
$request = static function (string $path, string $method = 'GET', array $body = []): WP_REST_Response {
    $parts = explode('?', $path, 2);
    $request = new WP_REST_Request($method, '/byline/v1' . $parts[0]);
    if (isset($parts[1])) {
        parse_str($parts[1], $query);
        $request->set_query_params($query);
    }
    if ($body !== []) {
        $request->set_header('content-type', 'application/json');
        $request->set_body(wp_json_encode($body));
    }
    return rest_do_request($request);
};
try {
    foreach (['editor', 'author', 'subscriber'] as $role) {
        $id = wp_insert_user(['user_login' => 'home-' . $role . '-' . wp_generate_uuid4(), 'user_pass' => wp_generate_password(32, true, true), 'role' => $role, 'display_name' => 'Home ' . ucfirst($role)]);
        $assert(!is_wp_error($id), 'Could not create Home test account.');
        $user_ids[$role] = $id;
    }
    wp_set_current_user($user_ids['author']);
    $created = $request('/editorial/stories', 'POST', ['title' => "Writer's real draft"]);
    $assert($created->get_status() === 201, 'Quick creation must create a real draft for an author.');
    $id = $created->get_data()['story']['id'];
    $ids[] = $id;
    $assert(get_post($id)->post_status === 'draft' && (int) get_post($id)->post_author === $user_ids['author'], 'Draft ownership/status is canonical WordPress data.');
    $assert(get_post($id)->post_title === "Writer's real draft", 'WordPress slashing must preserve apostrophes.');
    $task = byline_create_task(['title' => 'Writer interview', 'storyId' => $id, 'assigneeId' => $user_ids['author'], 'priority' => 'high']);
    $task_ids[] = $task['id'];
    $other_task = byline_create_task(['title' => 'Unassigned work', 'storyId' => $id, 'priority' => 'normal']);
    $task_ids[] = $other_task['id'];
    $home = $request('/editorial/home')->get_data();
    $assert(array_column($home['tasks'], 'id') === [$task['id']], 'My work must include only the authenticated user\'s open tasks.');
    $assert(!$home['capabilities']['review'], 'Authors must not receive the editorial review queue capability.');
    $assert(in_array($id, array_column($home['stories'], 'id'), true), 'Legacy primary-author membership must work.');
    $done = $request('/editorial/tasks/' . $task['id'], 'POST', ['state' => 'completed']);
    $assert($done->get_status() === 200 && $request('/editorial/home')->get_data()['tasks'] === [], 'Completion must persist through the canonical task endpoint.');
    $link = $request('/editorial/stories/' . $id . '/resources', 'POST', ['label' => 'Private notes', 'url' => 'https://docs.google.com/document/d/private-home-notes/edit']);
    $assert($link->get_status() === 200 && $link->get_data()['resources'][0]['kind'] === 'Google Doc', 'Authorized links must be sanitized/classified.');
    $peek = $request('/editorial/stories/' . $id . '/quick-view')->get_data();
    $assert(count($peek['homeContext']['resources']) === 1 && count($peek['tasks']['tasks']) === 2, 'Story Peek must project canonical links and tasks.');
    $assert(!isset($peek['homeContext']['story']['content']), 'Story Peek must never return article bodies.');
    $assert($request('/editorial/stories/' . $id . '/resources', 'POST', ['label' => 'Bad', 'url' => 'javascript:alert(1)'])->get_status() === 400, 'Unsafe resource URLs must be rejected by real REST.');
    wp_set_current_user($user_ids['editor']);
    $editor_story = $request('/editorial/stories', 'POST', ['title' => 'Editor co-written story'])->get_data()['story']['id'];
    $ids[] = $editor_story;
    byline_set_story_contributors($id, [['type' => 'user', 'id' => $user_ids['author']], ['type' => 'user', 'id' => $user_ids['editor']]]);
    $editor_home = $request('/editorial/home')->get_data();
    $assert($editor_home['capabilities']['review'], 'Editors must receive review capability.');
    $row = byline_editorial_planning_story_summary($id, $user_ids['editor']);
    $assert(byline_home_is_mine($row, $user_ids['editor']), 'Co-writer membership must use canonical contributors.');
    $assert(!byline_home_is_mine(['bylines' => [['type' => 'guest', 'id' => $user_ids['editor']]]], $user_ids['editor']), 'A guest ID must not impersonate user membership.');
    wp_set_current_user($user_ids['author']);
    $assert($request('/editorial/stories/' . $editor_story . '/quick-view')->get_status() === 403, 'An author cannot inspect another writer\'s private story.');
    $assert($request('/editorial/stories/' . $editor_story . '/resources', 'POST', ['label' => 'Forbidden', 'url' => 'https://example.org'])->get_status() === 403, 'Resource writes must check edit_post.');
    $assert(!in_array($editor_story, array_column($request('/editorial/home')->get_data()['stories'], 'id'), true), 'Home must filter unauthorized stories.');
    wp_set_current_user($user_ids['subscriber']);
    $assert($request('/editorial/home')->get_status() === 403 && $request('/editorial/stories', 'POST', ['title' => 'Forbidden'])->get_status() === 403, 'Read-only accounts cannot read newsroom work or create drafts.');
    wp_set_current_user($user_ids['editor']);
    wp_update_post(['ID' => $id, 'post_status' => 'publish']);
    wp_set_current_user(0);
    foreach (['/editorial/home', '/editorial/home/search?query=Writer'] as $path) {
        $assert($request($path)->get_status() === 401, 'Anonymous Home/search reads must fail closed.');
    }
    $public = rest_do_request(new WP_REST_Request('GET', '/wp/v2/posts/' . $id));
    $assert($public->get_status() === 200 && strpos(wp_json_encode($public->get_data()), 'private-home-notes') === false, 'Private resource links must not appear in public post REST.');
    $assert(get_registered_meta_keys('post', 'post')[BYLINE_STORY_RESOURCES_META]['show_in_rest'] === false, 'Resource meta must be registered private.');
    echo 'Byline Home WordPress integration passed (' . $checks . " checks).\n";
} finally {
    wp_set_current_user(1);
    foreach ($task_ids as $id) { wp_delete_post($id, true); }
    foreach ($ids as $id) { wp_delete_post($id, true); }
    foreach ($user_ids as $id) { wp_delete_user($id, 1); }
}
