<?php
/**
 * Core Notes in Byline against real WordPress: roles, REST, the `edit_post`
 * boundary, public projections and the activity log.
 *
 * Notes are created exactly as Gutenberg creates them (the Core comments REST
 * controller, type=note, status hold for open and approved for resolved), so
 * this exercises the installed Core rather than a fake.
 *
 * Run in the disposable wp-env site:
 *   wp-env run cli wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/article-notes.php
 */
if (!defined('ABSPATH')) { exit; }
require_once ABSPATH . 'wp-admin/includes/user.php';

$checks = 0;
$cleanup = ['posts' => [], 'users' => [], 'comments' => []];
$assert = static function ($condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    $checks++;
};
$byline = static function (string $path, array $query = []): WP_REST_Response {
    $request = new WP_REST_Request('GET', '/byline/v1' . $path);
    $request->set_query_params($query);
    return rest_do_request($request);
};
$core = static function (string $method, string $path, array $params = []): WP_REST_Response {
    $request = new WP_REST_Request($method, $path);
    foreach ($params as $key => $value) { $request->set_param($key, $value); }
    return rest_do_request($request);
};
$make_user = static function (string $role, string $name) use (&$cleanup): int {
    $id = wp_insert_user(['user_login' => 'notes-' . $role . '-' . wp_generate_uuid4(), 'user_pass' => wp_generate_password(32, true, true), 'role' => $role, 'display_name' => $name, 'user_email' => 'notes-' . wp_generate_uuid4() . '@example.test']);
    if (is_wp_error($id)) { throw new RuntimeException('Could not create test user.'); }
    $cleanup['users'][] = $id;
    return $id;
};
// What the block editor does: a Note is an ordinary Core comment of type note.
$add_note = static function (int $post, string $content, int $parent = 0, string $status = 'hold') use ($core, $assert): int {
    $response = $core('POST', '/wp/v2/comments', ['post' => $post, 'content' => $content, 'type' => 'note', 'status' => $status, 'parent' => $parent]);
    $assert($response->get_status() === 201, 'Core accepts the Note: ' . wp_json_encode($response->get_data()));
    return (int) $response->get_data()['id'];
};
// Resolving is how Gutenberg does it: approve the thread and add a text-less marker reply.
$resolve = static function (int $post, int $thread) use ($core, $assert): void {
    $assert($core('POST', '/wp/v2/comments/' . $thread, ['status' => 'approved'])->get_status() === 200, 'Core resolves the thread.');
    $assert($core('POST', '/wp/v2/comments', ['post' => $post, 'content' => '', 'type' => 'note', 'status' => 'approved', 'parent' => $thread, 'meta' => ['_wp_note_status' => 'resolved']])->get_status() === 201, 'Core stores the resolution marker.');
};

$secret = 'NOTE_SECRET_' . wp_generate_password(10, false);
try {
    $editor = $make_user('editor', 'Gibson Bell');
    $owner = $make_user('author', 'Caroline Elrod');       // owns the story, so may edit it
    $photog = $make_user('author', 'Maycie Photographer'); // sees context through an assignment only
    $stranger = $make_user('author', 'Unrelated Author');
    $reader = $make_user('subscriber', 'Reader');

    wp_set_current_user($editor);
    $story = wp_insert_post(['post_type' => 'post', 'post_status' => 'draft', 'post_title' => 'Canteen could return', 'post_author' => $owner, 'post_content' => '<p>Body text.</p>']);
    $cleanup['posts'][] = $story;
    $other = wp_insert_post(['post_type' => 'post', 'post_status' => 'draft', 'post_title' => 'A story with no notes', 'post_author' => $owner]);
    $cleanup['posts'][] = $other;
    $assert(byline_notes_support($story)['available'] === true, 'This Core supports Notes on posts.');

    $first = $add_note($story, '<p>Can we <strong>verify</strong> when this actually happened? ' . $secret . '</p>');
    $second = $add_note($story, '<p>This number needs a source.</p>');
    $reply_a = $add_note($story, '<p>Checking with the principal.</p>', $first);
    $reply_b = $add_note($story, '<p>Confirmed: October.</p>', $first);
    $resolved = $add_note($story, '<p>Fix the typo in the headline.</p>');
    $resolve($story, $resolved);
    $cleanup['comments'] = [$first, $second, $reply_a, $reply_b, $resolved];
    // An ordinary reader comment and a pingback must never count as Notes.
    $reader_comment = wp_insert_comment(['comment_post_ID' => $story, 'comment_content' => 'READER_COMMENT_' . $secret, 'comment_author' => 'Reader', 'comment_approved' => 0, 'comment_type' => 'comment']);
    $assert(is_int($reader_comment) || is_numeric($reader_comment), 'A reader comment can exist beside Notes.');
    byline_notes_flush_count_cache();

    /* ---- the editor sees thread counts, not reply counts */
    $summary = byline_notes_summary($story, $editor);
    $assert($summary['available'] && $summary['canView'] && $summary['openCount'] === 2 && $summary['resolvedCount'] === 1, 'Two open threads and one resolved, regardless of replies: ' . wp_json_encode($summary));
    $assert(strpos($summary['editUrl'], 'post=' . $story) !== false && strpos($summary['editUrl'], '#') === false, 'The summary links to the ordinary editor URL.');
    $assert(byline_notes_summary($other, $editor)['openCount'] === 0, 'A story without Notes has no open threads.');

    $response = $byline("/editorial/stories/$story/notes");
    $data = $response->get_data();
    $assert($response->get_status() === 200 && $data['summary']['openCount'] === 2, 'The Notes endpoint answers for an editor.');
    $assert(count($data['open']) === 2, 'Only the two open threads are previewed.');
    $by_id = array_column($data['open'], null, 'id');
    $assert(isset($by_id[$first], $by_id[$second]) && !isset($by_id[$resolved]), 'Open previews are the open top-level threads.');
    $assert($by_id[$first]['replyCount'] === 2 && $by_id[$second]['replyCount'] === 0, 'Reply counts are per thread.');
    $assert(strpos($by_id[$first]['excerpt'], 'Can we verify when this actually happened?') === 0 && strpos($by_id[$first]['excerpt'], '<') === false, 'The excerpt is plain text.');
    $assert($by_id[$first]['author']['name'] === 'Gibson Bell', 'The author is the WordPress user.');
    $assert(strpos(wp_json_encode($data), 'READER_COMMENT_') === false, 'Reader comments are not Notes.');
    $assert(strpos(wp_json_encode($data), 'Body text') === false, 'The article body is never part of the Notes response.');

    /* ---- the story owner (edit_post) may read; a stranger and a reader may not */
    wp_set_current_user($owner);
    $assert($byline("/editorial/stories/$story/notes")->get_status() === 200, 'A writer who can edit the story may read its Notes.');
    foreach ([['a different author', $stranger], ['a subscriber', $reader], ['the photographer', $photog]] as [$label, $user]) {
        wp_set_current_user($user);
        $denied = $byline("/editorial/stories/$story/notes");
        $assert($denied->get_status() === 403, "Notes are refused to $label without edit_post.");
        $assert(strpos(wp_json_encode($denied->get_data()), $secret) === false, "The refusal for $label carries no Note data.");
        $assert(byline_notes_summary($story, $user) === null, "The summary for $label is null.");
    }
    wp_set_current_user(0);
    $anonymous = $byline("/editorial/stories/$story/notes");
    $assert(in_array($anonymous->get_status(), [401, 403], true) && strpos(wp_json_encode($anonymous->get_data()), $secret) === false, 'Anonymous requests are refused.');

    /* ---- a Story Workspace participant cannot infer anything about Notes */
    wp_set_current_user($editor);
    $media_request = new WP_REST_Request('POST', "/byline/v1/editorial/stories/$story/media-assignments");
    $media_request->set_header('content-type', 'application/json');
    $media_request->set_body(wp_json_encode(['title' => 'Canteen photos', 'type' => 'photo', 'assigneeId' => $photog, 'dueAt' => '2026-10-28T17:00']));
    $assert(in_array(rest_do_request($media_request)->get_status(), [200, 201], true), 'The photographer is assigned production work.');

    wp_set_current_user($editor);
    $editor_workspace = $byline("/editorial/stories/$story/workspace")->get_data();
    $assert($editor_workspace['story']['notes']['openCount'] === 2 && $editor_workspace['story']['notes']['resolvedCount'] === 1, 'The editor workspace carries the thread summary.');
    $assert(strpos(wp_json_encode($editor_workspace), $secret) === false, 'The workspace aggregate never carries Note text.');
    $assert(!array_key_exists('open', $editor_workspace['story']['notes']), 'The workspace aggregate carries no previews.');

    wp_set_current_user($photog);
    $participant = $byline("/editorial/stories/$story/workspace");
    $assert($participant->get_status() === 200 && $participant->get_data()['capabilities']['role'] === 'participant', 'The photographer can open the workspace as a participant.');
    $assert(!user_can($photog, 'edit_post', $story), 'The photographer cannot edit the article.');
    $assert($participant->get_data()['story']['notes'] === null, 'The participant workspace has no Notes at all.');
    $participant_json = wp_json_encode($participant->get_data());
    foreach ([$secret, 'resolvedCount', 'Can we verify'] as $needle) {
        $assert(strpos($participant_json, $needle) === false, "The participant workspace does not leak $needle.");
    }
    $home = $byline('/editorial/home');
    if ($home->get_status() === 200) {
        foreach ($home->get_data()['stories'] ?? [] as $row) {
            if ((int) $row['id'] === $story) { $assert($row['notes'] === null, 'Home rows for a participant carry no Notes.'); }
        }
        $assert(strpos(wp_json_encode($home->get_data()), $secret) === false, 'Home never carries Note text.');
    }

    /* ---- Planning rows carry counts for editors only, in one batched read */
    wp_set_current_user($editor);
    $planning = $byline('/editorial/planning');
    $assert($planning->get_status() === 200, 'Planning loads.');
    $rows = array_column($planning->get_data()['stories'], null, 'id');
    $assert($rows[$story]['notes']['openCount'] === 2 && $rows[$other]['notes']['openCount'] === 0, 'Planning rows carry open thread counts.');
    $assert(strpos(wp_json_encode($planning->get_data()), $secret) === false, 'Planning never carries Note text.');
    wp_set_current_user($owner);
    $owner_rows = array_column($byline('/editorial/planning')->get_data()['stories'], null, 'id');
    $assert(isset($owner_rows[$story]) && $owner_rows[$story]['notes']['openCount'] === 2, 'A writer who can edit the story sees its count in Planning.');

    /* ---- Core still keeps Notes out of every ordinary and public surface */
    $ordinary = get_comments(['post_id' => $story, 'status' => 'all']);
    $assert(count($ordinary) === 1 && $ordinary[0]->comment_type === 'comment', 'Ordinary comment queries never return Notes.');
    $assert(count(get_comments(['post_id' => $story, 'type' => 'note', 'status' => 'all'])) >= 5, 'Notes are returned when the type is requested explicitly.');
    wp_update_post(['ID' => $story, 'post_status' => 'publish']);
    wp_set_current_user(0);
    $public_comments = $core('GET', '/wp/v2/comments', ['post' => $story]);
    $assert(strpos(wp_json_encode($public_comments->get_data()), $secret) === false, 'The public comments REST route exposes no Notes.');
    $note_listing = $core('GET', '/wp/v2/comments', ['post' => $story, 'type' => 'note']);
    $assert(in_array($note_listing->get_status(), [401, 403], true) && strpos(wp_json_encode($note_listing->get_data()), $secret) === false, 'An anonymous visitor cannot list Notes.');
    $public_post = $core('GET', '/wp/v2/posts/' . $story);
    $assert($public_post->get_status() === 200 && strpos(wp_json_encode($public_post->get_data()), $secret) === false && !isset($public_post->get_data()['notes']), 'The public post projection exposes no Notes.');
    $assert((int) get_comments_number($story) === 0, 'Notes do not inflate the public comment count.');
    wp_set_current_user($editor);
    byline_flush_public_mutations();
    $requests = 0;
    add_filter('pre_http_request', static function () use (&$requests) { $requests++; return ['headers' => [], 'body' => '', 'response' => ['code' => 200, 'message' => 'OK'], 'cookies' => []]; }, 99, 3);
    $snapshot = byline_prepare_build_snapshot();
    $assert(!is_wp_error($snapshot), 'The public snapshot prepares: ' . (is_wp_error($snapshot) ? $snapshot->get_error_message() : ''));
    $location = byline_build_snapshot_location();
    $json = (string) file_get_contents($location['path'] . '/' . basename($snapshot['url']));
    $assert($json !== '' && strpos($json, $secret) === false && strpos($json, 'READER_COMMENT_') === false, 'The public build snapshot contains no Note or comment text.');

    /* ---- Byline never copies a Note */
    $activity = wp_json_encode(byline_activity_raw_records($story));
    $assert(strpos($activity, $secret) === false, 'Notes are not copied into activity records.');
    $meta = wp_json_encode(get_post_meta($story));
    $assert(strpos($meta, $secret) === false, 'Notes are not copied into post meta.');
    $assert(strpos(wp_json_encode(get_posts(['post_type' => 'any', 'post_status' => 'any', 'posts_per_page' => -1, 'fields' => 'all', 's' => $secret])), $secret) === false, 'Notes are not copied into any post.');
    $routes = rest_get_server()->get_routes();
    $notes_route = $routes['/byline/v1/editorial/stories/(?P<id>\d+)/notes'] ?? [];
    $assert(count($notes_route) === 1 && array_keys($notes_route[0]['methods']) === ['GET'], 'The Notes route is read-only.');

    /* ---- Core Notes disabled for the post type degrades quietly */
    remove_post_type_support('post', 'editor');
    add_post_type_support('post', 'editor', ['notes' => false]);
    byline_notes_flush_count_cache();
    $off = byline_notes_summary($story, $editor);
    $assert($off['available'] === false && $off['openCount'] === 0 && $off['editUrl'] === '', 'A post type without Notes support reports nothing and links nowhere.');
    wp_set_current_user($editor);
    $assert($byline("/editorial/stories/$story/notes")->get_data()['open'] === [], 'Without Notes support no previews are returned.');
    remove_post_type_support('post', 'editor');
    add_post_type_support('post', 'editor', ['notes' => true]);

    echo "Article Notes integration checks passed ($checks).\n";
} finally {
    foreach ($cleanup['comments'] as $id) { wp_delete_comment((int) $id, true); }
    foreach ($cleanup['posts'] as $id) { wp_delete_post($id, true); }
    foreach ($cleanup['users'] as $id) { wp_delete_user($id); }
}
