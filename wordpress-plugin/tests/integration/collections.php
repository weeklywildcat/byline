<?php
/** Real database + REST regression. wp-env run cli wp eval-file this file. */
if (!defined('ABSPATH')) { exit; }
require_once ABSPATH . 'wp-admin/includes/user.php';
$created = []; $users = []; $checks = 0;
$assert = static function ($value, string $message) use (&$checks): void { if (!$value) { throw new RuntimeException($message); } $checks++; };
$request = static function ($path, $method = 'GET', $body = []) {
    $r = new WP_REST_Request($method, '/byline/v1/editorial/' . $path);
    if ($body) { $r->set_header('content-type', 'application/json'); $r->set_body(wp_json_encode($body)); }
    return rest_do_request($r);
};
try {
    foreach (['editor', 'author', 'subscriber'] as $role) { $users[$role] = wp_insert_user(['user_login' => 'collections-' . $role . '-' . wp_generate_uuid4(), 'user_pass' => wp_generate_password(), 'role' => $role]); }
    wp_set_current_user($users['editor']);
    $c = $request('collections', 'POST', ['name' => "Reporter's championship", 'type' => 'event', 'startDate' => '2026-10-24', 'endDate' => '2026-10-25']);
    $assert($c->get_status() === 200, 'Create Collection: ' . wp_json_encode($c->get_data()));
    $c = $c->get_data(); $id = $c['id']; $created[] = $id;
    $assert($c['lead']['id'] === $users['editor'] && $c['status'] === 'planning', 'Creation defaults');
    $assert($c['name'] === "Reporter's championship", 'Apostrophes must survive WordPress slashing');
    $other = $request('collections', 'POST', ['name' => 'Band season'])->get_data(); $created[] = $other['id'];
    foreach ([['status' => 'bogus'], ['type' => []], ['name' => ''], ['startDate' => 'not a date'], ['endDate' => '2020-01-01']] as $bad) {
        $assert($request("collections/$id", 'POST', $bad)->get_status() === 400, 'Invalid Collection fields must fail before writes');
    }
    $assert($request("collections/$id", 'POST', ['status' => 'active', 'brief' => "Director's notes\nKey angle: community"])->get_status() === 200, 'Update Collection');
    $assert($request("collections/$id", 'POST', ['brief' => 'Latest plan', 'expectedBrief' => "Director's notes\nKey angle: community"])->get_status() === 200, 'Brief compare-and-swap succeeds');
    $assert($request("collections/$id", 'POST', ['brief' => 'Stale plan', 'expectedBrief' => 'Old brief'])->get_status() === 409, 'Stale brief does not overwrite reporting');
    $assert($request("collections/$id")->get_data()['collection']['brief'] === 'Latest plan', 'Conflict preserves saved brief');
    $stories = [];
    for ($i = 0; $i < 2; $i++) {
        $story = $request("collections/$id/stories", 'POST', ['title' => "Championship story $i"]);
        $assert($story->get_status() === 201, 'Create story within Collection: ' . wp_json_encode($story->get_data()));
        $stories[] = $story->get_data()['story']['id']; $created[] = end($stories);
    }
    foreach ($stories as $story) { $assert(in_array($story, byline_relation_ids($id, 'story'), true), 'New stories are linked'); }
    $assert($request("collections/{$other['id']}/links/story/{$stories[0]}", 'POST')->get_status() === 200, 'One story can belong to another Collection');
    $assert(count(byline_relation_ids($stories[0], 'story', true)) === 2, 'Multi-Collection membership is normalized');
    $request("collections/$id/links/story/{$stories[0]}", 'POST');
    $assert(count(byline_relation_ids($id, 'story')) === 2, 'Duplicate links are idempotent');
    $interview = $request("collections/$id/interviews", 'POST', ['interviewee' => "Band director", 'scheduledAt' => '2026-10-24T09:00', 'notes' => 'INTERNAL NOTES', 'privateContact' => 'PRIVATE CONTACT', 'followUps' => 'Confirm scores']);
    $assert($interview->get_status() === 200, 'Create Interview');
    $interview = $interview->get_data(); $iid = $interview['id']; $created[] = $iid; $created[] = $interview['sourceId'];
    $assert($request("collections/$id/interviews/$iid", 'POST', ['scheduleMode' => 'window', 'windowStart' => '2026-10-23', 'windowEnd' => '2026-10-25'])->get_status() === 200, 'Interview uses canonical fuzzy date validation');
    $schedule = byline_collection_schedule('2026-10-01', '2026-10-31', $id);
    $assert(count($schedule['appointments']) === 0 && count($schedule['needsScheduling']) === 1, 'Fuzzy interviews never acquire invented times');
    $assert(!array_key_exists('notes', $schedule['needsScheduling'][0]) && !array_key_exists('privateContact', $schedule['needsScheduling'][0]), 'Calendar projection excludes reporting and contact details');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['scheduledAt' => '2026-10-24T09:00'])->get_data()['scheduleMode'] === 'exact', 'Exact scheduling replaces a fuzzy window');
    $assert(count(byline_collection_schedule('2026-10-01', '2026-10-31', $id)['appointments']) === 1, 'Calendar includes one shared interview, independent of linked story count');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['expectedUpdatedAt' => 'stale', 'notes' => 'Stale'])->get_status() === 409, 'Stale interview edit rejected');
    $assert($interview['storyIds'] === [], 'Interviews can exist without stories');
    $assert($interview['scheduledAt'] === byline_editorial_normalize_datetime('2026-10-24T09:00'), 'Interview times use site timezone');
    foreach ($stories as $story) { $assert($request("collections/$id/interviews/$iid/links/interview-story/$story", 'POST')->get_status() === 200, 'Interview can link independent stories'); }
    $assert(count(byline_interview_item($iid)['storyIds']) === 2, 'One Interview has many stories');
    $assert(count($request("stories/{$stories[0]}/collections")->get_data()['interviews']) === 1, 'Story context only includes explicit links');
    $unlinked = $request("collections/$id/interviews", 'POST', ['interviewee' => 'Student interview'])->get_data(); $created[] = $unlinked['id']; $created[] = $unlinked['sourceId'];
    $ctx = $request("stories/{$stories[0]}/collections")->get_data();
    $assert(count($ctx['interviews']) === 1 && count($ctx['availableInterviews']) === 1, 'Add from Collection supplies other reporting without injection');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['status' => 'completed'])->get_data()['completedAt'] !== '', 'Completion records canonical timestamp');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['status' => []])->get_status() === 400, 'Invalid Interview enum rejected');
    $resource = $request("collections/$id/resources", 'POST', ['label' => "Director's recording", 'url' => 'https://example.org/private-recording']);
    $assert($resource->get_status() === 200, 'Shared resource created');
    $resource = $resource->get_data(); $rid = $resource['id']; $created[] = $rid;
    $assert($request("collections/$id/interviews/$iid/links/recording/$rid", 'POST')->get_status() === 200, 'Recording references resource identity');
    $assert($request("collections/{$other['id']}/links/resource/$rid", 'POST')->get_status() === 200, 'Resource reused without copying');
    $assert($request("collections/$id/resources/$rid/links/resource-story/{$stories[0]}", 'POST')->get_status() === 200, 'Resource references story');
    $assert($request("stories/{$stories[0]}/collections")->get_data()['resources'][0]['id'] === $rid, 'Story sees same resource identity');
    $task = $request('tasks', 'POST', ['title' => 'Verify final scores', 'collectionId' => $id]);
    $assert($task->get_status() === 200, 'Collection task uses canonical task service');
    $task = $task->get_data(); $created[] = $task['id'];
    $assert(count($request("collections/$id")->get_data()['tasks']) === 1, 'Collection task filter applied in database');
    $assert($request("tasks/{$task['id']}", 'POST', ['state' => 'completed'])->get_data()['state'] === 'completed', 'Existing task completion works');
    $assert($request("collections/$id")->get_data()['collection']['openTaskCount'] === 0, 'Task summaries factual');
    $assert($request("collections/$id/links/member/{$users['author']}", 'POST')->get_status() === 200, 'Add member');
    wp_set_current_user($users['author']);
    $assert(byline_collection_can_edit($id), 'Collection member can coordinate reporting');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['notes' => 'Team reporting'])->get_status() === 200, 'Member can edit Interview');
    $assert($request("collections/{$other['id']}", 'POST', ['status' => 'active'])->get_status() === 403, 'Nonmember cannot change another Collection');
    $assert(!isset($request("collections/{$other['id']}")->get_data()['collection']['privateContact']), 'Collection summaries omit contacts');
    wp_set_current_user($users['editor']);
    $request("collections/$id/links/member/{$users['author']}", 'DELETE');
    wp_set_current_user($users['author']);
    $assert(!array_key_exists('privateContact', byline_interview_item($iid)), 'Observer cannot read private source contact');
    $assert($request("collections/$id/interviews/$iid", 'POST', ['privateContact' => 'Forbidden'])->get_status() === 403, 'Contact write permission');
    $assert($request("collections/$id/links/story/{$stories[0]}", 'DELETE')->get_status() === 403, 'Unauthorized relationship changes denied');
    $assert($request("stories/{$stories[0]}/collections")->get_status() === 403, 'Story context checks object-level edit capability');
    wp_set_current_user($users['subscriber']);
    $assert($request('collections')->get_status() === 403, 'Subscribers denied');
    wp_set_current_user($users['editor']);
    $assert($request("collections/$id/links/story/{$stories[0]}", 'DELETE')->get_status() === 200, 'Remove story membership');
    $assert(count(byline_relation_ids($stories[0], 'story', true)) === 1, 'Removal preserves other Collections');
    $assert($request("collections/$id", 'POST', ['status' => 'archived'])->get_data()['archived'] === true, 'Archive');
    $assert($request("collections/$id", 'POST', ['status' => 'planning'])->get_data()['archived'] === false, 'Restore / Undo archive');
    wp_update_post(['ID' => $stories[0], 'post_status' => 'publish']);
    wp_set_current_user(0);
    foreach (['collections', "collections/$id", "collections/$id/interviews/$iid", "stories/{$stories[0]}/collections", 'collections/story-options'] as $route) {
        $assert(in_array($request($route)->get_status(), [401, 404], true), 'Internal read fails closed: ' . $route);
    }
    foreach ([BYLINE_COLLECTION_POST_TYPE, BYLINE_INTERVIEW_POST_TYPE, BYLINE_SOURCE_POST_TYPE, BYLINE_RESOURCE_POST_TYPE] as $type) {
        $obj = get_post_type_object($type);
        $assert(!$obj->public && !$obj->publicly_queryable && !$obj->show_in_rest, 'Private CPTs have no public route');
    }
    $public = rest_do_request(new WP_REST_Request('GET', '/wp/v2/posts/' . $stories[0]));
    $encoded = wp_json_encode($public->get_data());
    $assert($public->get_status() === 200, 'Published story still public');
    foreach (['INTERNAL NOTES', 'PRIVATE CONTACT', 'private-recording', 'Confirm scores', 'Team reporting'] as $secret) { $assert(strpos($encoded, $secret) === false, 'No internal reporting in public post REST'); }
    echo "Collections WordPress integration passed ($checks checks).\n";
} finally {
    wp_set_current_user(1);
    foreach (array_reverse($created) as $id) { wp_delete_post($id, true); }
    foreach ($users as $id) { wp_delete_user($id, 1); }
}
