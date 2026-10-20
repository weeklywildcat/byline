<?php
/**
 * Story Workspace, reporting plan and production assignments against real
 * WordPress (REST, roles, capabilities, post meta, attachments).
 *
 * Run in the disposable wp-env site:
 *   wp-env run cli wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/story-workspace.php
 */
if (!defined('ABSPATH')) { exit; }
require_once ABSPATH . 'wp-admin/includes/user.php';

$checks = 0;
$cleanup = ['posts' => [], 'users' => []];
$original_timezone = get_option('timezone_string');
$assert = static function ($condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    $checks++;
};
$call = static function (string $path, string $method = 'GET', array $body = []): WP_REST_Response {
    $parts = explode('?', $path, 2);
    $request = new WP_REST_Request($method, '/byline/v1' . $parts[0]);
    if (isset($parts[1])) { parse_str($parts[1], $query); $request->set_query_params($query); }
    if ($body !== []) { $request->set_header('content-type', 'application/json'); $request->set_body(wp_json_encode($body)); }
    return rest_do_request($request);
};
$make_user = static function (string $role, string $name) use (&$cleanup): int {
    $id = wp_insert_user(['user_login' => 'sw-' . $role . '-' . wp_generate_uuid4(), 'user_pass' => wp_generate_password(32, true, true), 'role' => $role, 'display_name' => $name]);
    if (is_wp_error($id)) { throw new RuntimeException('Could not create test user.'); }
    $cleanup['users'][] = $id;
    return $id;
};

try {
    update_option('timezone_string', 'America/New_York');
    $editor = $make_user('editor', 'Gibson Bell');
    $writer = $make_user('author', 'Caroline Elrod');       // co-writer; does not own the post
    $photog = $make_user('author', 'Maycie Photographer');  // holds only a production assignment
    $stranger = $make_user('author', 'Unrelated Author');
    $reader = $make_user('subscriber', 'Reader');

    wp_set_current_user($editor);
    $story = (int) $call('/editorial/stories', 'POST', ['title' => 'Canteen could return to Ninety Six High School'])->get_data()['story']['id'];
    $cleanup['posts'][] = $story;
    byline_set_story_contributors($story, [['type' => 'user', 'id' => $writer], ['type' => 'user', 'id' => $editor]]);
    wp_update_post(['ID' => $story, 'post_content' => 'SECRET ARTICLE BODY must never appear in the workspace payload.']);

    /* ---- creation response is the workspace read model, with a deep link */
    $created = $call('/editorial/stories', 'POST', ['title' => 'Templated story', 'preset' => 'news']);
    $cleanup['posts'][] = (int) $created->get_data()['story']['id'];
    $assert($created->get_status() === 201 && strpos($created->get_data()['workspaceUrl'], 'page=byline-planning&story=') !== false, 'Story creation opens the workspace.');
    $assert($created->get_data()['template']['tasks'] === 3 && count($created->get_data()['tasks']) === 3, 'The News template seeds three starter tasks.');
    $assert($created->get_data()['sources'] === [] && $created->get_data()['appointments'] === [], 'Templates never invent sources or appointments.');
    $assert($created->get_data()['story']['workflow']['id'] === 'reporting', 'The template sets the workflow stage.');
    $photo_story = $call('/editorial/stories', 'POST', ['title' => 'Photo templated', 'preset' => 'photo-story']);
    $cleanup['posts'][] = (int) $photo_story->get_data()['story']['id'];
    $assert(count($photo_story->get_data()['mediaAssignments']) === 1 && $photo_story->get_data()['mediaAssignments'][0]['type'] === 'photo', 'Photo story seeds a production assignment.');
    $assert($call('/editorial/stories', 'POST', ['title' => 'Bad', 'preset' => 'nope'])->get_status() === 400, 'An unknown template is rejected.');
    $assert($call('/editorial/stories', 'POST', ['title' => 'Plain'])->get_status() === 201, 'A template is optional.');

    /* ---- brief */
    $brief = 'Report why canteen stopped, what rules apply, and what would be needed to bring it back.';
    $assert($call("/editorial/stories/$story/brief", 'POST', ['brief' => $brief])->get_data()['brief'] === $brief, 'The brief saves.');
    $assert($call("/editorial/stories/$story/brief", 'POST', ['brief' => 'x', 'expectedBrief' => 'stale'])->get_status() === 409, 'A stale brief returns a conflict.');

    /* ---- reporting plan over REST */
    $r = $call("/editorial/stories/$story/sources", 'POST', ['label' => 'Mrs. Hamby', 'role' => 'Principal', 'status' => 'scheduled', 'assigneeIds' => [$editor], 'notes' => 'PRIVATE source note']);
    $assert($r->get_status() === 201, 'Creating a source returns 201.');
    $hamby = $r->get_data()['sourceId'];
    $local = $call("/editorial/stories/$story/sources", 'POST', ['label' => 'Local reporter', 'organization' => 'Index-Journal', 'status' => 'needs-scheduling', 'assigneeIds' => [$editor]])->get_data()['sourceId'];
    $call("/editorial/stories/$story/sources", 'POST', ['label' => 'Mr. Sprowl', 'role' => 'Cafeteria', 'status' => 'interviewed', 'assigneeIds' => [$writer]]);
    $exact = $call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Interview Mrs. Hamby', 'kind' => 'interview', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => '2026-10-27T10:15', 'endAt' => '2026-10-27T10:35', 'location' => 'Main office', 'assigneeIds' => [$editor], 'sourceId' => $hamby]);
    $assert($exact->get_status() === 201, 'Creating an appointment returns 201: ' . wp_json_encode($exact->get_data()));
    $exact_id = $exact->get_data()['appointmentId'];
    $fuzzy = $call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Interview local reporter', 'kind' => 'interview', 'scheduleMode' => 'window', 'windowStart' => '2026-10-26', 'windowEnd' => '2026-10-30', 'assigneeIds' => [$editor], 'sourceId' => $local]);
    $fuzzy_id = $fuzzy->get_data()['appointmentId'];
    $stored = byline_story_appointments($story);
    $by_id = array_column($stored, null, 'id');
    $assert($by_id[$exact_id]['startAt'] === '2026-10-27T14:15:00Z', 'Exact times are stored as UTC from the site timezone.');
    $assert($by_id[$fuzzy_id]['startAt'] === null && $by_id[$fuzzy_id]['windowStart'] === '2026-10-26', 'A target window stores no fabricated time.');
    $assert($call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Bad', 'scheduleMode' => 'exact', 'startAt' => '2026-10-27T11:00', 'endAt' => '2026-10-27T10:00'])->get_status() === 400, 'End before start is rejected over REST.');

    /* ---- workspace read model */
    $workspace = $call("/editorial/stories/$story/workspace");
    $data = $workspace->get_data();
    $assert($workspace->get_status() === 200, 'The workspace loads for the editor.');
    foreach (['story', 'brief', 'sections', 'contributors', 'statuses', 'tasks', 'sources', 'appointments', 'mediaAssignments', 'resources', 'activity', 'previewUrl', 'people', 'capabilities'] as $key) {
        $assert(array_key_exists($key, $data), "The workspace payload includes $key.");
    }
    $assert(strpos(wp_json_encode($data), 'SECRET ARTICLE BODY') === false && !isset($data['story']['content']), 'The workspace never includes the article body.');
    $assert(count($data['sources']) === 3 && count($data['appointments']) === 2 && $data['reporting']['interviewed'] === 1, 'Reporting appears with its summary.');
    $assert($data['capabilities']['role'] === 'manager' && $data['capabilities']['assign'] === true, 'An editor gets manager capabilities.');
    $assert($data['reporting']['nextAppointment']['id'] !== null, 'The summary names the next appointment.');
    $planning = $call('/editorial/planning')->get_data();
    $row = array_values(array_filter($planning['stories'], static function ($s) use ($story) { return $s['id'] === $story; }))[0];
    $assert($row['reporting']['sources'] === 3 && strpos(wp_json_encode($row), 'PRIVATE source note') === false && strpos(wp_json_encode($row), 'Main office') === false, 'The Planning list carries counts, never notes or locations.');

    /* ---- context access */
    wp_set_current_user($writer);
    $assert($call("/editorial/stories/$story/workspace")->get_status() === 200, 'A co-writer without edit_post can open their story\'s workspace.');
    $writer_data = $call("/editorial/stories/$story/workspace")->get_data();
    $assert($writer_data['capabilities']['role'] === 'manager' && $writer_data['capabilities']['editArticle'] === false && $writer_data['capabilities']['assign'] === false, 'They manage reporting but not canonical fields.');
    $assert($call("/editorial/stories/$story/sources", 'POST', ['label' => 'Added by co-writer'])->get_status() === 201, 'A co-writer can add a source.');
    $assert($call("/editorial/stories/$story", 'POST', ['status' => 'writing'])->get_status() === 403, 'But cannot change canonical workflow through the story route.');
    wp_set_current_user($stranger);
    $assert($call("/editorial/stories/$story/workspace")->get_status() === 403 && $call("/editorial/stories/$story/sources", 'POST', ['label' => 'x'])->get_status() === 403, 'An unrelated contributor cannot read or change the story context.');
    wp_set_current_user($reader);
    $assert($call("/editorial/stories/$story/workspace")->get_status() === 403, 'A subscriber cannot read newsroom context.');
    wp_set_current_user(0);
    $assert($call("/editorial/stories/$story/workspace")->get_status() === 401, 'Anonymous requests fail closed.');

    /* ---- media assignments: legacy projection, then v2 */
    wp_set_current_user($editor);
    $legacy_story = (int) $call('/editorial/stories', 'POST', ['title' => 'Legacy visual story'])->get_data()['story']['id'];
    $cleanup['posts'][] = $legacy_story;
    $attachment = wp_insert_attachment(['post_mime_type' => 'image/jpeg', 'post_title' => 'Cafeteria', 'post_status' => 'inherit'], '', $legacy_story);
    $cleanup['posts'][] = $attachment;
    update_post_meta($attachment, '_wp_attachment_image_alt', 'A cafeteria');
    update_post_meta($attachment, '_ww_image_creator', 'Maycie');
    update_post_meta($attachment, '_ww_image_copyright_notice', 'Weekly Wildcat');
    $legacy_request = ['type' => 'photo', 'status' => 'assigned', 'assigneeId' => $photog, 'dueAt' => '2026-10-28T17:00:00Z', 'notes' => 'Legacy note', 'attachmentIds' => [$attachment]];
    update_post_meta($legacy_story, BYLINE_EDITORIAL_MEDIA_REQUEST_META, $legacy_request);
    $legacy_snapshot = get_post_meta($legacy_story, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true);
    $projected = $call("/editorial/stories/$legacy_story/workspace")->get_data()['mediaAssignments'];
    $assert(count($projected) === 1 && $projected[0]['id'] === 'legacy-v1' && $projected[0]['isLegacy'] === true && $projected[0]['assigneeId'] === $photog && $projected[0]['attachmentIds'] === [$attachment], 'The installed request projects as one assignment.');
    $assert($projected[0]['mediaReadiness']['missingAltIds'] === [] && $projected[0]['mediaReadiness']['ready'] === true, 'Projection keeps readiness (alt, credit, rights).');
    $assert(!byline_media_assignments_materialized($legacy_story), 'Reads never migrate data.');
    $added = $call("/editorial/stories/$legacy_story/media-assignments", 'POST', ['title' => 'Competitive-food timeline', 'type' => 'graphic', 'assigneeId' => $editor, 'dueAt' => '2026-10-29T17:00']);
    $assert($added->get_status() === 201, 'A second assignment can be added: ' . wp_json_encode($added->get_data()));
    $all = $call("/editorial/stories/$legacy_story/workspace")->get_data()['mediaAssignments'];
    $assert(count($all) === 2 && byline_media_assignments_materialized($legacy_story), 'The first v2 mutation materializes the projection.');
    $assert($all[0]['id'] === 'legacy-v1' && $all[0]['assigneeId'] === $photog && $all[0]['status'] === 'assigned' && $all[0]['attachmentIds'] === [$attachment] && $all[1]['type'] === 'graphic', 'The projected state survives and the new assignment is independent.');
    $assert(get_post_meta($legacy_story, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true) === $legacy_snapshot, 'The installed v1 value is untouched.');
    $assert($all[1]['status'] === 'assigned' && $all[1]['dueAt'] === '2026-10-29T21:00:00Z', 'Assignee and due date are per assignment.');
    $assert($call("/editorial/stories/$legacy_story/media")->get_data()['type'] === 'photo', 'The original single-request endpoint still answers (primary assignment).');
    $call("/editorial/stories/$legacy_story/media", 'POST', ['notes' => 'Updated via the old endpoint']);
    $assert(byline_media_assignments_stored($legacy_story)[0]['notes'] === 'Updated via the old endpoint' && get_post_meta($legacy_story, BYLINE_EDITORIAL_MEDIA_REQUEST_META, true) === $legacy_snapshot, 'Old clients write the primary assignment; v1 stays untouched.');
    $assert($call("/editorial/stories/$legacy_story/media-assignments/" . $all[1]['id'], 'POST', ['status' => 'done'])->get_status() === 400, 'Completing an assignment without files is refused, as before.');
    wp_set_current_user($photog);
    $assert($call("/editorial/stories/$legacy_story/workspace")->get_status() === 200, 'The assigned photographer can open the story context.');
    $photog_data = $call("/editorial/stories/$legacy_story/workspace")->get_data();
    $assert($photog_data['capabilities']['role'] === 'participant' && count($photog_data['mediaAssignments']) === 1 && $photog_data['mediaAssignments'][0]['id'] === 'legacy-v1', 'They see only their own assignment.');
    $progress = $call("/editorial/stories/$legacy_story/media-assignments/legacy-v1", 'POST', ['status' => 'in-progress']);
    $assert($progress->get_status() === 200, 'They can update the status of their own assignment: ' . wp_json_encode($progress->get_data()));
    $assert($call("/editorial/stories/$legacy_story/media-assignments/legacy-v1", 'POST', ['assigneeId' => $stranger])->get_status() === 403 && $call("/editorial/stories/$legacy_story/media-assignments/legacy-v1", 'POST', ['dueAt' => '2027-01-01'])->get_status() === 403, 'But not reassign or reschedule it.');
    $assert($call("/editorial/stories/$legacy_story", 'POST', ['status' => 'writing'])->get_status() === 403 && $call("/editorial/stories/$legacy_story/contributors", 'POST', ['contributors' => []])->get_status() === 403, 'And not change workflow or writers.');
    $assert($call("/editorial/stories/$legacy_story/sources", 'POST', ['label' => 'x'])->get_status() === 403 && $call("/editorial/stories/$legacy_story/media-assignments", 'POST', ['title' => 'x', 'type' => 'photo'])->get_status() === 403, 'Nor add sources or assignments.');
    $assert(strpos(wp_json_encode($photog_data), 'Competitive-food') === false, 'Other people\'s assignments are not disclosed.');

    /* ---- resources */
    wp_set_current_user($editor);
    $doc = $call("/editorial/stories/$story/resources", 'POST', ['label' => 'Working draft', 'url' => 'https://docs.google.com/document/d/abc/edit', 'purpose' => 'draft']);
    $assert($doc->get_data()['resources'][0]['purpose'] === 'draft' && $doc->get_data()['resources'][0]['kind'] === 'Google Doc', 'Purpose is stored and Google recognition is unchanged.');
    update_post_meta($story, BYLINE_STORY_RESOURCES_META, array_merge(get_post_meta($story, BYLINE_STORY_RESOURCES_META, true), [['id' => 'old-link-1', 'label' => 'Old link', 'url' => 'https://example.org/policy']]));
    $links = $call("/editorial/stories/$story/workspace")->get_data()['resources'];
    $assert(array_column($links, 'purpose', 'id')['old-link-1'] === 'other', 'Links stored before purposes existed read as other.');
    $assert($call("/editorial/stories/$story/resources/old-link-1", 'POST', ['label' => 'Old link', 'url' => 'https://example.org/policy', 'purpose' => 'research'])->get_data()['resources'][1]['purpose'] === 'research', 'A link\'s purpose can be set later.');
    $assert($call("/editorial/stories/$story/resources", 'POST', ['label' => 'Bad', 'url' => 'https://example.org', 'purpose' => 'secrets'])->get_status() === 400, 'Unknown purposes are rejected.');

    /* ---- schedule feed */
    $feed = $call('/editorial/schedule?from=2026-10-26&to=2026-11-01')->get_data();
    $ours = static function (array $rows) use ($story) { return array_values(array_filter($rows, static function ($r) use ($story) { return $r['storyId'] === $story; })); };
    $mine_exact = $ours($feed['appointments']);
    $assert(count($mine_exact) === 1 && $mine_exact[0]['title'] === 'Interview Mrs. Hamby' && byline_story_site_day($mine_exact[0]['startAt']) === '2026-10-27', 'An exact appointment lands on its site-local day.');
    $mine_fuzzy = $ours($feed['needsScheduling']);
    $assert(count($mine_fuzzy) >= 1 && $mine_fuzzy[0]['windowStart'] === '2026-10-26' && $mine_fuzzy[0]['startAt'] === null, 'A target window is listed under needs scheduling, with no time.');
    $assert(strpos(wp_json_encode($feed), 'PRIVATE source note') === false, 'The schedule feed carries no notes.');
    $assert($call('/editorial/schedule?from=2026-01-01&to=2027-12-31')->get_status() === 400, 'The schedule range is bounded.');

    /* ---- home */
    $home = $call('/editorial/home')->get_data();
    $home_mine = array_values(array_filter($home['appointments'], static function ($a) use ($story) { return $a['storyId'] === $story; }));
    $assert(array_key_exists('appointments', $home) && count($home_mine) === 2, 'Home carries the editor\'s open appointments.');
    $fuzzy_row = array_values(array_filter($home_mine, static function ($a) { return $a['scheduleMode'] === 'window'; }))[0];
    $assert($fuzzy_row['startAt'] === null && $fuzzy_row['windowStart'] === '2026-10-26', 'Home receives the target window, not a fake date.');

    /* ---- delete semantics */
    $call("/editorial/stories/$story/sources/$local", 'DELETE');
    $after = array_column(byline_story_appointments($story), null, 'id');
    $assert(isset($after[$fuzzy_id]) && $after[$fuzzy_id]['sourceId'] === null, 'Removing a source keeps its appointment and clears the link.');
    $task = byline_create_task(['title' => 'Interview three students', 'storyId' => $story, 'assigneeId' => $editor]);
    $call("/editorial/stories/$story/appointments/$exact_id", 'DELETE');
    $assert(isset(array_column(byline_story_sources($story), null, 'id')[$hamby]) && byline_get_task($task['id'])['state'] === 'open', 'Removing an appointment keeps its source and tasks.');

    /* ---- activity is human, bounded and content-free */
    $summaries = array_column($call("/editorial/stories/$story/activity")->get_data()['activity'], 'summary');
    $assert(count(array_filter($summaries, static function ($s) { return strpos($s, 'Gibson Bell added a source') === 0; })) > 0, 'Activity uses human summaries.');
    $assert(strpos(wp_json_encode($summaries), 'PRIVATE source note') === false, 'Activity never records source notes.');

    /* ---- notifications: assigned, cancelled, moved; never chatter */
    $payloads = static function () {
        $found = [];
        foreach (byline_list_jobs(['limit' => 100]) as $job) {
            $internal = byline_job_internal((int) $job['id']);
            if (($internal['type'] ?? '') === BYLINE_EDITORIAL_NOTIFICATION_JOB_TYPE) { $found[] = $internal['payload']; }
        }
        return $found;
    };
    $appointment_jobs = static function (int $recipient, string $change = '') use ($payloads) {
        return array_values(array_filter($payloads(), static function ($p) use ($recipient, $change) {
            return ($p['event'] ?? '') === 'appointment-update' && ($p['recipientId'] ?? 0) === $recipient && ($change === '' || ($p['change'] ?? '') === $change);
        }));
    };
    wp_set_current_user($editor);
    $notified = $call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Interview Mr. Sprowl', 'kind' => 'interview', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => '2026-10-28T09:00', 'location' => 'Cafeteria', 'assigneeIds' => [$writer, $editor]])->get_data()['appointmentId'];
    $assert(count($appointment_jobs($writer, 'assigned')) === 1 && $appointment_jobs($editor) === [], 'A new assignee is notified once; the actor never is.');
    $job_json = wp_json_encode($payloads());
    $assert(strpos($job_json, 'Sprowl') === false && strpos($job_json, 'Cafeteria') === false, 'Queued notifications carry opaque references, not titles or places.');
    $call("/editorial/stories/$story/appointments/$notified", 'POST', ['notes' => 'Bring the recorder']);
    $call("/editorial/stories/$story/sources", 'POST', ['label' => 'Noise', 'status' => 'contacted', 'assigneeIds' => [$writer]]);
    $assert(count($appointment_jobs($writer)) === 1, 'Notes and source status changes send no email.');
    $call("/editorial/stories/$story/appointments/$notified", 'POST', ['startAt' => '2026-10-28T11:30', 'endAt' => '2026-10-28T12:00']);
    $assert(count($appointment_jobs($writer, 'changed')) === 1, 'Moving a scheduled appointment notifies its assignee.');
    $call("/editorial/stories/$story/appointments/$notified", 'POST', ['status' => 'cancelled']);
    $assert(count($appointment_jobs($writer, 'cancelled')) === 1, 'Cancelling notifies its assignee.');
    $recipient = get_user_by('id', $writer);
    $message = byline_editorial_notification_message(['event' => 'appointment-update', 'storyId' => $story, 'appointmentId' => $notified, 'change' => 'cancelled'], $recipient);
    $assert(is_array($message) && strpos($message['body'], 'Interview Mr. Sprowl') !== false, 'Delivery resolves the title at send time.');
    update_user_meta($writer, BYLINE_EDITORIAL_NOTIFICATION_PREFS_META, ['appointments' => false] + byline_editorial_notification_preference_defaults());
    $before_jobs = count($appointment_jobs($writer));
    $call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Quiet one', 'scheduleMode' => 'unscheduled', 'assigneeIds' => [$writer]]);
    $assert(count($appointment_jobs($writer)) === $before_jobs, 'The appointment preference is respected.');
    delete_user_meta($writer, BYLINE_EDITORIAL_NOTIFICATION_PREFS_META);
    // The due-work digest names confirmed appointments within a day, never target windows.
    $soon = gmdate('Y-m-d\TH:i:s\Z', time() + 4 * 3600);
    $call("/editorial/stories/$story/appointments", 'POST', ['title' => 'Interview tonight', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => $soon, 'assigneeIds' => [$writer]]);
    $digest = byline_editorial_notification_due_items($writer);
    $assert(count(array_filter($digest, static function ($item) { return $item['kind'] === 'appointment' && $item['appointment']['title'] === 'Interview tonight'; })) === 1, 'The digest includes a confirmed appointment in the next day.');
    $assert(count(array_filter($digest, static function ($item) { return $item['kind'] === 'appointment' && $item['appointment']['scheduleMode'] !== 'exact'; })) === 0, 'The digest never includes a target window.');

    /* ---- production assignment notifications + media desk rows */
    wp_set_current_user($editor);
    $media_story = (int) $call('/editorial/stories', 'POST', ['title' => 'Media desk story'])->get_data()['story']['id'];
    $cleanup['posts'][] = $media_story;
    $call("/editorial/stories/$media_story/media-assignments", 'POST', ['title' => 'Cafeteria photos', 'type' => 'photo', 'assigneeId' => $photog, 'dueAt' => '2026-10-28T17:00']);
    $call("/editorial/stories/$media_story/media-assignments", 'POST', ['title' => 'Reaction clips', 'type' => 'video', 'dueAt' => '2026-10-30T17:00']);
    $desk = $call('/editorial/media')->get_data();
    $mine = array_values(array_filter($desk['assignments'], static function ($row) use ($media_story) { return $row['story']['id'] === $media_story; }));
    $assert(count($mine) === 2 && array_column($mine, 'title') === ['Cafeteria photos', 'Reaction clips'], 'The Media Desk lists one row per production assignment, soonest due first.');
    $assert(count(array_filter($payloads(), static function ($p) use ($photog, $media_story) { return ($p['event'] ?? '') === 'media-assignment' && ($p['recipientId'] ?? 0) === $photog && ($p['storyId'] ?? 0) === $media_story; })) === 1, 'A newly assigned photographer is notified once.');
    $filtered = $call('/editorial/media?type=video')->get_data()['assignments'];
    $assert(count(array_filter($filtered, static function ($row) { return $row['type'] !== 'video'; })) === 0, 'Media Desk type filtering works per assignment.');
    $feed = $call('/editorial/schedule?from=2026-10-26&to=2026-11-01')->get_data();
    $assert(count(array_filter($feed['mediaDeadlines'], static function ($d) { return $d['title'] === 'Cafeteria photos'; })) === 1, 'Production due dates appear in the schedule feed.');
    wp_set_current_user($photog);
    $own_rows = $call('/editorial/media')->get_data()['assignments'];
    $assert(count($own_rows) === 2 && count(array_filter($own_rows, static function ($row) use ($photog) { return $row['assignee']['id'] === $photog; })) === 2, 'A participant sees only their own rows in the Media Desk.');
    wp_set_current_user($editor);

    /* ---- nothing is public */
    wp_set_current_user(0);
    wp_update_post(['ID' => $story, 'post_status' => 'publish']);
    $public = rest_do_request(new WP_REST_Request('GET', '/wp/v2/posts/' . $story));
    $json = wp_json_encode($public->get_data());
    foreach (['Mrs. Hamby', 'PRIVATE source note', 'Main office', 'Report why canteen stopped', 'docs.google.com'] as $needle) {
        $assert(strpos($json, $needle) === false, "Public post REST never contains private newsroom data ($needle).");
    }
    $registered = get_registered_meta_keys('post', 'post');
    foreach ([BYLINE_STORY_BRIEF_META, BYLINE_STORY_SOURCES_META, BYLINE_STORY_APPOINTMENTS_META, BYLINE_MEDIA_ASSIGNMENTS_META, BYLINE_STORY_RESOURCES_META] as $key) {
        $assert(isset($registered[$key]) && $registered[$key]['show_in_rest'] === false, "$key is registered private.");
    }
    echo 'Story Workspace WordPress integration passed (' . $checks . " checks).\n";
} finally {
    foreach ($cleanup['posts'] as $id) { wp_delete_post($id, true); }
    foreach (get_posts(['post_type' => BYLINE_TASK_POST_TYPE, 'post_status' => 'any', 'posts_per_page' => -1, 'fields' => 'ids']) as $id) { wp_delete_post($id, true); }
    foreach ($cleanup['users'] as $id) { wp_delete_user($id); }
    update_option('timezone_string', $original_timezone);
}
