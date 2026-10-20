<?php
/**
 * Seeds a realistic newsroom for Planning visual QA: 19 stories across the
 * workflow (Pitch 2, Assigned 3, Reporting 5, Writing 4, Editing 2, Ready 1,
 * On Hold 2) with multiple writers, a five-writer story, an unassigned story,
 * overdue and undated stories, photo assignments, tasks, a story scheduled in
 * WordPress, exact appointments and fuzzy ones that still need scheduling.
 *
 * Everything goes through the plugin's own REST handlers as an administrator,
 * so validation and activity are the real ones. Dates are relative to today in
 * the WordPress site timezone. Re-running adds nothing: stories are found by
 * title first.
 *
 *   wp-env run cli --config=.wp-env.json wp eval-file wp-content/plugins/wordpress-plugin/tests/fixtures/seed-planning-newsroom.php
 */
if (!defined('ABSPATH')) {
    exit;
}

wp_set_current_user(1);
$zone = wp_timezone();
$today = new DateTimeImmutable('today', $zone);
$day = static fn (int $offset): string => $today->modify(($offset >= 0 ? '+' : '') . $offset . ' days')->format('Y-m-d');
$monday = $today->modify('monday this week');
$week = static fn (int $offset): string => $monday->modify('+' . $offset . ' days')->format('Y-m-d');

$rest = static function (string $method, string $route, array $data = []) {
    $request = new WP_REST_Request($method, $route);
    $request->set_header('content-type', 'application/json');
    $request->set_body(wp_json_encode($data));
    foreach ($data as $key => $value) {
        $request->set_param($key, $value);
    }
    $response = rest_do_request($request);
    if ($response->is_error()) {
        $error = $response->as_error();
        throw new RuntimeException($route . ': ' . $error->get_error_message());
    }
    return $response->get_data();
};

$people = [
    'gibson' => ['Gibson Bell', 'editor'],
    'caroline' => ['Caroline Elrod', 'author'],
    'maycie' => ['Maycie Photographer', 'author'],
    'mia' => ['Mia Parker', 'author'],
    'noah' => ['Noah Quinn', 'author'],
    'ava' => ['Ava Torres', 'author'],
];
$ids = [];
foreach ($people as $key => [$name, $role]) {
    $login = 'qa-' . $key;
    $user = get_user_by('login', $login);
    $ids[$key] = $user ? (int) $user->ID : (int) wp_insert_user(['user_login' => $login, 'user_pass' => wp_generate_password(24), 'user_email' => $login . '@example.test', 'display_name' => $name, 'role' => $role]);
}

// title, stage, writers, editor, deadline day offset, planned offset, tasks, photo [assignee, status, due offset], extras
$stories = [
    ['Why students want later start times', 'pitch', ['caroline'], null, null, null, 0, null],
    ['Senior parking lottery proposal', 'pitch', [], null, null, null, 0, null],
    ['Spring musical casting announced', 'assigned', ['mia'], 'gibson', 3, 6, 1, null],
    ['New bus routes confuse freshmen', 'assigned', ['noah'], 'gibson', -2, 4, 0, null],
    ['Library adds late hours', 'assigned', ['ava'], null, 5, 8, 0, null],
    ['Canteen could return to Ninety Six High School', 'reporting', ['caroline', 'gibson'], 'gibson', 1, 4, 3, ['maycie', 'assigned', 2], 'canteen'],
    ['Cafeteria prices rise again', 'reporting', ['mia'], 'gibson', 2, 5, 1, null],
    ['Homecoming court voting opens', 'reporting', ['caroline', 'mia', 'noah', 'ava', 'gibson'], 'gibson', 4, 5, 2, null, 'homecoming'],
    ['Teacher of the year profile', 'reporting', ['ava'], null, null, null, 0, null],
    ['Robotics team heads to state', 'reporting', ['noah'], 'gibson', -1, 3, 0, ['maycie', 'needed', 2], 'robotics'],
    ['Football season recap', 'writing', ['gibson'], 'gibson', 1, 3, 2, null],
    ['Lockers to be replaced over winter break', 'writing', ['caroline'], 'gibson', 6, 9, 0, null],
    ['Student art on display downtown', 'writing', ['mia'], 'gibson', 3, 7, 0, ['maycie', 'assigned', 3]],
    ["Debate team's undefeated streak", 'writing', ['noah', 'ava'], null, null, null, 0, null],
    ['What the budget vote means for us', 'editing', ['gibson', 'caroline'], 'gibson', 0, 2, 0, null],
    ['Class of 2027 college night', 'editing', ['mia'], 'gibson', 2, 4, 0, null],
    ['Winter concert preview', 'ready', ['ava'], 'gibson', 3, 6, 0, null, 'scheduled'],
    ['Cross country coach retires', 'on-hold', ['noah'], 'gibson', null, null, 0, null],
    ['Mascot redesign debate', 'on-hold', ['caroline'], null, null, null, 0, null],
];

$created = 0;
foreach ($stories as $row) {
    [$title, $stage, $writers, $editor, $deadline, $planned, $tasks, $photo] = $row;
    $extra = $row[8] ?? '';
    $existing = get_posts(['post_type' => 'post', 'post_status' => 'any', 'title' => $title, 'numberposts' => 1, 'fields' => 'ids']);
    if ($existing) {
        continue;
    }
    $post = ['post_title' => $title, 'post_status' => 'draft', 'post_type' => 'post', 'post_author' => $ids['gibson']];
    if ($extra === 'scheduled') {
        $when = $today->modify('+6 days 09:00');
        $post['post_status'] = 'future';
        $post['post_date'] = $when->format('Y-m-d H:i:s');
        $post['post_date_gmt'] = $when->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }
    $id = (int) wp_insert_post($post);
    $story = '/byline/v1/editorial/stories/' . $id;
    if ($writers) {
        $rest('POST', $story . '/contributors', ['contributors' => array_map(static fn ($w) => ['id' => $ids[$w], 'kind' => 'user'], $writers)]);
    }
    $workflow = ['status' => $stage];
    if ($editor) {
        $workflow['editorId'] = $ids[$editor];
    }
    if ($deadline !== null) {
        $workflow['deadline'] = $day($deadline);
    }
    if ($planned !== null) {
        $workflow['plannedPublishAt'] = $day($planned) . 'T12:00';
    }
    $rest('POST', $story, $workflow);
    $assignee = $ids[$writers[0] ?? 'gibson'];
    for ($i = 1; $i <= $tasks; $i++) {
        $rest('POST', $story . '/tasks', ['title' => ['Interview three students', 'Prepare questions', 'Check the numbers'][$i - 1], 'assigneeId' => $assignee, 'storyId' => $id, 'dueAt' => $day($deadline ?? 2) . 'T09:00', 'priority' => 'normal']);
    }
    if ($photo) {
        $rest('POST', $story . '/media-assignments', ['title' => 'Photos', 'type' => 'photo', 'assigneeId' => $ids[$photo[0]], 'status' => $photo[1], 'dueAt' => $day($photo[2]) . 'T17:00']);
    }
    if ($extra === 'canteen') {
        $rest('POST', $story . '/appointments', ['title' => 'Interview Mrs. Hamby', 'kind' => 'interview', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => $day(1) . 'T10:15', 'endAt' => $day(1) . 'T10:35', 'location' => 'Main office', 'assigneeIds' => [$ids['gibson']]]);
        $rest('POST', $story . '/appointments', ['title' => 'Interview local reporter', 'kind' => 'interview', 'status' => 'planned', 'scheduleMode' => 'window', 'windowStart' => $week(7), 'windowEnd' => $week(11), 'assigneeIds' => [$ids['gibson']]]);
    }
    if ($extra === 'homecoming') {
        $rest('POST', $story . '/appointments', ['title' => 'Pep rally coverage', 'kind' => 'event', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => $day(3) . 'T14:00', 'endAt' => $day(3) . 'T15:00', 'assigneeIds' => [$ids['caroline'], $ids['mia']]]);
        $rest('POST', $story . '/appointments', ['title' => 'Interview student council', 'kind' => 'interview', 'status' => 'planned', 'scheduleMode' => 'window', 'windowStart' => $week(7), 'windowEnd' => $week(9), 'assigneeIds' => [$ids['caroline']]]);
    }
    if ($extra === 'robotics') {
        $rest('POST', $story . '/appointments', ['title' => 'Interview the coach', 'kind' => 'interview', 'status' => 'confirmed', 'scheduleMode' => 'exact', 'startAt' => $day(2) . 'T16:30', 'endAt' => $day(2) . 'T17:00', 'assigneeIds' => [$ids['noah']]]);
    }
    $created++;
}

WP_CLI::success("Seeded {$created} stories (existing ones were left alone).");
