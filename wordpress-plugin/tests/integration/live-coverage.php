<?php
/** Run in disposable wp-env: real REST permissions, persistent updates and public projections. */
if (!defined('ABSPATH')) exit;
require_once ABSPATH . 'wp-admin/includes/user.php';
$checks = 0;
$posts = [];
$users = [];
$assert = static function ($condition, string $message) use (&$checks): void {
    if (!$condition) throw new RuntimeException($message);
    $checks++;
};
$rest = static function (string $method, string $path, array $body = []): WP_REST_Response {
    $request = new WP_REST_Request($method, '/byline/v1' . $path);
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode($body));
    return rest_do_request($request);
};
try {
    foreach (['editor', 'author', 'subscriber'] as $role) {
        $id = wp_insert_user(['user_login' => 'live-' . wp_generate_uuid4(), 'user_pass' => wp_generate_password(), 'role' => $role, 'display_name' => 'Live ' . $role]);
        if (is_wp_error($id)) throw new RuntimeException($id->get_error_message());
        $users[$role] = $id;
    }
    wp_set_current_user($users['editor']);
    $story = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Live coverage test', 'post_author' => $users['author']]);
    $posts[] = $story;
    $path = '/editorial/stories/' . $story . '/live';
    $assert($rest('POST', $path, ['action' => 'start'])->get_status() === 200, 'Editor can start coverage.');
    $text = "A path C:\\news and a quote \"here\".\n\n- One\n- Two\n\nhttps://example.test/?a=1&b=2 <script>alert(1)</script>";
    $created = $rest('POST', $path . '/updates', ['title' => 'First', 'text' => $text, 'pinned' => true]);
    $assert($created->get_status() === 200, 'Editor can publish an update.');
    $update = $created->get_data(); $posts[] = $update['id'];
    $assert($update['author'] === 'Live editor', 'Each update carries its own author.');
    $assert(strpos($update['text'], 'C:\\news') !== false, 'WordPress slashing preserves backslashes.');
    $assert(strpos($update['html'], '<script>') === false && strpos($update['html'], '<ul>') !== false, 'Only safe fixed-tag markup is exposed.');
    wp_set_current_user($users['author']);
    $second = $rest('POST', $path . '/updates', ['text' => 'Second author', 'pinned' => true])->get_data(); $posts[] = $second['id'];
    $assert($second['author'] === 'Live author' && !get_post_meta($update['id'], BYLINE_LIVE_UPDATE_PINNED_META, true), 'Authors can publish on their story and pinning is unique.');
    $edited = $rest('POST', $path . '/updates/' . $update['id'], ['text' => 'Edited C:\\news'])->get_data();
    $assert($edited['text'] === 'Edited C:\\news', 'Editing also preserves literal backslashes.');
    $preview = byline_editorial_preview_presentation($story);
    $assert(count($preview['live']['updates']) === 2 && $preview['live']['keyPoints']['id'] === $second['id'] && $preview['update'] === null, 'Preview keeps the complete pinned timeline and suppresses the generic update notice.');
    $editor_user = get_user_by('id', $users['editor']);
    $editor_user->add_cap('publish_posts', false);
    wp_set_current_user($users['editor']);
    $assert($rest('POST', $path . '/updates', ['text' => 'Cannot publish'])->get_status() === 403 && $rest('GET', $path)->get_status() === 200, 'Story access alone does not grant public publishing rights.');
    $editor_user->remove_cap('publish_posts');
    wp_set_current_user($users['subscriber']);
    $assert($rest('GET', $path)->get_status() === 403, 'A subscriber cannot read editorial payloads.');
    $assert($rest('POST', $path . '/updates', ['text' => 'Forbidden'])->get_status() === 403, 'A subscriber cannot publish.');
    wp_set_current_user(0);
    $assert($rest('POST', $path, ['action' => 'end'])->get_status() === 401, 'Anonymous callers cannot mutate coverage.');
    $public = $rest('GET', '/live/' . $story);
    $assert($public->get_status() === 200 && $public->get_headers()['Cache-Control'] === 'no-store', 'Anonymous public reads are uncached.');
    $payload = $public->get_data();
    $assert(count($payload['updates']) === 2 && !isset($payload['updates'][0]['text']) && !isset($payload['updates'][0]['authorId']), 'Public data drops private editor fields.');
    wp_set_current_user($users['editor']);
    foreach (['draft', 'private'] as $status) {
        $posts[] = wp_insert_post(['post_type' => BYLINE_LIVE_UPDATE_POST_TYPE, 'post_status' => $status, 'post_parent' => $story, 'post_content' => 'SECRET_' . $status]);
    }
    $assert(count(byline_public_live_coverage($story)['updates']) === 2, 'Draft and private children never enter the public feed.');
    $rest('POST', $path, ['action' => 'end']);
    $assert(byline_public_live_coverage($story)['status'] === 'ended' && count(byline_public_live_coverage($story)['updates']) === 2, 'Ending preserves the permanent archive.');
    wp_update_post(['ID' => $story, 'post_password' => 'secret']);
    wp_set_current_user(0);
    $assert($rest('GET', '/live/' . $story)->get_status() === 404, 'Password-protected parents expose no updates.');
    wp_set_current_user($users['editor']);
    wp_update_post(['ID' => $story, 'post_password' => '', 'post_status' => 'draft']);
    wp_set_current_user(0);
    $assert($rest('GET', '/live/' . $story)->get_status() === 404, 'Unpublishing hides all updates.');
    echo "Live coverage integration passed ({$checks} checks).\n";
} finally {
    wp_set_current_user(1);
    foreach (array_reverse($posts) as $id) wp_delete_post($id, true);
    foreach ($users as $id) wp_delete_user($id);
}
