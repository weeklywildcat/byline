<?php
/**
 * Sources, appointments, brief and story-context access, against an in-memory
 * post-meta store. Real REST, database and capability behaviour is covered by
 * tests/integration/story-workspace.php in wp-env.
 */
define('ABSPATH', __DIR__ . '/../');

class WP_Error {
    public $code;
    public $message;
    public $data;
    public function __construct($code = '', $message = '', $data = []) { $this->code = $code; $this->message = $message; $this->data = $data; }
    public function get_error_code(): string { return $this->code; }
    public function get_error_data() { return $this->data; }
}
class WP_Post { public $ID; public $post_type; public $post_status; public $post_author; public function __construct($ID, $post_type = 'post', $post_status = 'draft', $post_author = 0) { $this->ID = $ID; $this->post_type = $post_type; $this->post_status = $post_status; $this->post_author = $post_author; } }
class WP_User { public $ID; public $display_name; public function __construct($ID, $display_name) { $this->ID = $ID; $this->display_name = $display_name; } }
class WP_REST_Request {}

$GLOBALS['meta'] = [];
$GLOBALS['actions'] = [];
$GLOBALS['fired'] = [];
$GLOBALS['hooks'] = [];
$GLOBALS['users'] = [1 => 'Gibson Bell', 2 => 'Caroline Elrod', 3 => 'Maycie Photo', 4 => 'Outsider', 5 => 'Editor Eve', 6 => 'Sub Scriber', 7 => 'Extra One', 8 => 'Extra Two'];
// user => capabilities. edit_post is per story: $GLOBALS['edit_post'][user] = [story ids].
$GLOBALS['caps'] = [1 => ['edit_posts'], 2 => ['edit_posts'], 3 => ['edit_posts'], 4 => ['edit_posts'], 5 => ['edit_posts', 'edit_others_posts'], 6 => [], 7 => ['edit_posts'], 8 => ['edit_posts']];
$GLOBALS['edit_post'] = [1 => [10], 5 => [10]];
$GLOBALS['contributors'] = [10 => [2]];
$GLOBALS['task_assignees'] = [10 => [3]];
$GLOBALS['race'] = null;

function add_action($hook, $callback, ...$args): void { $GLOBALS['hooks'][$hook][] = $callback; }
function do_action($hook, ...$args): void { $GLOBALS['fired'][] = [$hook, $args]; }
function register_post_meta($type, $key, $args): void { $GLOBALS['registered'][$key] = $args; }
function sanitize_text_field($v): string { return trim(preg_replace('/\s+/', ' ', strip_tags((string) $v))); }
function sanitize_textarea_field($v): string { return trim(strip_tags((string) $v)); }
function sanitize_key($v): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $v)); }
function absint($v): int { return abs((int) $v); }
function is_wp_error($v): bool { return $v instanceof WP_Error; }
function wp_slash($v) { return $v; }
function wp_cache_delete(...$args): bool { return true; }
function wp_generate_uuid4(): string { return sprintf('%08x-%04x-4%03x-a%03x-%012x', mt_rand(), mt_rand(0, 0xffff), mt_rand(0, 0xfff), mt_rand(0, 0xfff), mt_rand()); }
function wp_timezone() { return new DateTimeZone('America/New_York'); }
function get_current_user_id(): int { return $GLOBALS['current'] ?? 0; }
function get_user_by($field, $id) { return isset($GLOBALS['users'][$id]) ? new WP_User($id, $GLOBALS['users'][$id]) : false; }
function get_post($id) { return in_array($id, [10, 11], true) ? new WP_Post($id) : null; }
function user_can($user, $cap, ...$args): bool {
    if ($cap === 'edit_post') { return in_array((int) ($args[0] ?? 0), $GLOBALS['edit_post'][$user] ?? [], true); }
    return in_array($cap, $GLOBALS['caps'][$user] ?? [], true);
}
function get_posts($args) { return in_array((int) ($args['meta_query'][0]['value'] ?? 0), $GLOBALS['task_assignees'][$args['post_parent'] ?? 0] ?? [], true) ? [1] : []; }
function byline_get_story_contributor_entries($story_id, $fallback = true): array { return array_map(function ($id) { return ['type' => 'user', 'id' => $id]; }, $GLOBALS['contributors'][$story_id] ?? []); }
function byline_get_editorial_editor_id($story_id): int { return 0; }
const BYLINE_TASK_POST_TYPE = 'byline_task';
const BYLINE_TASK_ASSIGNEE_META = '_byline_task_assignee_id';

function metadata_exists($type, $id, $key): bool { return array_key_exists($key, $GLOBALS['meta'][$id] ?? []); }
function get_post_meta($id, $key, $single = false) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function add_post_meta($id, $key, $value, $unique = false): bool {
    if ($unique && metadata_exists('post', $id, $key)) { return false; }
    $GLOBALS['meta'][$id][$key] = $value;
    return true;
}
/** Compare-and-swap like WordPress: a given previous value must equal the stored one. A configured race changes the row first. */
function update_post_meta($id, $key, $value, $previous = '') {
    if ($GLOBALS['race'] !== null && $GLOBALS['race']['key'] === $key) {
        $race = &$GLOBALS['race'];
        if ($race['times'] > 0) {
            $race['times']--;
            $GLOBALS['meta'][$id][$key] = ($race['mutate'])($GLOBALS['meta'][$id][$key] ?? []);
        }
    }
    if ($previous !== '' && $previous !== null && ($GLOBALS['meta'][$id][$key] ?? null) !== $previous) { return false; }
    $GLOBALS['meta'][$id][$key] = $value;
    return true;
}
function delete_post_meta($id, $key, $value = ''): bool {
    if ($value !== '' && ($GLOBALS['meta'][$id][$key] ?? null) !== $value) { return false; }
    unset($GLOBALS['meta'][$id][$key]);
    return true;
}
function rest_authorization_required_code(): int { return 403; }

require __DIR__ . '/../includes/editorial/collections.php';
require __DIR__ . '/../includes/editorial/planning.php';
require __DIR__ . '/../includes/editorial/story-context.php';
require __DIR__ . '/../includes/editorial/reporting.php';
foreach ($GLOBALS['hooks']['init'] ?? [] as $callback) { $callback(); }

$checks = 0;
function check($condition, string $message): void {
    global $checks;
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
    $checks++;
}
function code($value): string { return $value instanceof WP_Error ? $value->code : ''; }
function status($value): int { return $value instanceof WP_Error ? (int) ($value->data['status'] ?? 0) : 0; }
function as_user(int $id): void { $GLOBALS['current'] = $id; }

as_user(1); // Gibson: edits story 10.

/* ---------------------------------------------------------------- privacy */
foreach ([BYLINE_STORY_BRIEF_META, BYLINE_STORY_SOURCES_META, BYLINE_STORY_APPOINTMENTS_META] as $key) {
    check(($GLOBALS['registered'][$key]['show_in_rest'] ?? true) === false, "$key must never be exposed through public REST meta.");
}

/* ------------------------------------------------------------------ brief */
check(byline_get_story_brief(10) === '', 'A new story has no brief.');
check(byline_set_story_brief(10, "<b>Focus</b> on why canteen stopped.\nSecond line") === "Focus on why canteen stopped.\nSecond line", 'The brief is private plain text with line breaks.');
check(code(byline_set_story_brief(10, str_repeat('x', BYLINE_STORY_BRIEF_MAX + 1))) === 'byline_brief_too_long', 'An over-long brief is rejected.');
check(code(byline_set_story_brief(10, 'Newer', 'a stale copy')) === 'byline_brief_conflict' && status(byline_set_story_brief(10, 'Newer', 'stale')) === 409, 'A stale brief edit returns a conflict.');
check(byline_set_story_brief(10, '') === '' && !metadata_exists('post', 10, BYLINE_STORY_BRIEF_META), 'Clearing the brief removes it.');

/* ---------------------------------------------------------------- sources */
$created = byline_story_source_save(10, ['label' => '  <i>Mrs. Hamby</i> ', 'role' => 'Principal', 'organization' => 'Ninety Six High', 'status' => 'scheduled', 'assigneeIds' => [1], 'notes' => '<script>x</script>Prefers mornings']);
check(!is_wp_error($created), 'Creating a source succeeds: ' . code($created));
$hamby = $created['source'];
check(byline_story_valid_uuid($hamby['id']) !== '' && $hamby['label'] === 'Mrs. Hamby' && $hamby['notes'] === 'xPrefers mornings', 'Source text is sanitized and gets a UUID.');
check(!array_key_exists('phone', $hamby) && !array_key_exists('email', $hamby), 'No CRM contact fields exist.');
check(code(byline_story_source_save(10, ['label' => '   '])) === 'byline_source_label_required', 'A source label is required.');
check(!is_wp_error(byline_story_source_save(10, ['label' => 'Local reporter', 'status' => 'needs-scheduling', 'assigneeIds' => [1]])), 'A source need not be a named person and may omit role and organization.');
check(code(byline_story_source_save(10, ['label' => 'X', 'status' => 'published'])) === 'byline_source_invalid_status', 'Source status uses its own vocabulary, not the workflow.');
$many = byline_story_source_save(10, ['label' => 'Crowded', 'assigneeIds' => [1, 2, 3, 7, 8]]);
check(count($many['source']['assigneeIds']) === BYLINE_STORY_REPORTING_ASSIGNEES_MAX, 'Assignees are limited to four.');
check(code(byline_story_source_save(10, ['label' => 'Ghost', 'assigneeIds' => [99]])) === 'byline_unknown_assignee', 'An unknown assignee is rejected.');
check(code(byline_story_source_save(10, ['label' => 'Subscriber', 'assigneeIds' => [6]])) === 'byline_unknown_assignee', 'An account that cannot edit posts cannot hold reporting work.');
$updated = byline_story_source_save(10, ['status' => 'interviewed'], $hamby['id']);
check($updated['source']['id'] === $hamby['id'] && $updated['source']['label'] === 'Mrs. Hamby' && $updated['source']['status'] === 'interviewed', 'A partial update keeps the ID and untouched fields.');
check(code(byline_story_source_save(10, ['status' => 'planned', 'expectedUpdatedAt' => '2000-01-01T00:00:00Z'], $hamby['id'])) === 'byline_stale_record', 'Editing a stale source is a conflict, not an overwrite.');
check(code(byline_story_source_save(10, ['label' => 'Nope'], byline_story_uuid())) === 'byline_source_not_found', 'Unknown source IDs 404.');
check(count(byline_story_sources(10)) === 3, 'Sources persist.');
for ($i = count(byline_story_sources(10)); $i < BYLINE_STORY_SOURCES_MAX; $i++) { byline_story_source_save(10, ['label' => "Filler $i"]); }
check(code(byline_story_source_save(10, ['label' => 'One too many'])) === 'byline_source_limit', 'A story holds at most 30 sources.');

/* ------------------------------------------------- compare-and-swap races */
// Make room first so the limit does not mask the race.
byline_story_source_delete(10, byline_story_sources(10)[5]['id']);
byline_story_source_delete(10, byline_story_sources(10)[5]['id']);
$before = count(byline_story_sources(10));
$GLOBALS['race'] = ['key' => BYLINE_STORY_SOURCES_META, 'times' => 1, 'mutate' => function ($rows) {
    // A colleague adds a source between our read and our write.
    $rows[] = ['id' => byline_story_uuid(), 'label' => 'Colleague source', 'role' => '', 'organization' => '', 'status' => 'planned', 'assigneeIds' => [], 'notes' => '', 'createdAt' => '', 'updatedAt' => ''];
    return $rows;
}];
$raced = byline_story_source_save(10, ['label' => 'My concurrent source']);
$labels = array_column(byline_story_sources(10), 'label');
check(!is_wp_error($raced) && in_array('Colleague source', $labels, true) && in_array('My concurrent source', $labels, true) && count($labels) === $before + 2, 'A lost write is retried on the fresh list; neither person\'s source is lost.');
byline_story_source_delete(10, byline_story_sources(10)[5]['id']);
$GLOBALS['race'] = ['key' => BYLINE_STORY_SOURCES_META, 'times' => 99, 'mutate' => function ($rows) { $rows[0]['notes'] = 'churn ' . mt_rand(); return $rows; }];
check(status(byline_story_source_save(10, ['label' => 'Never lands'])) === 409, 'Unresolvable contention returns 409 instead of silently overwriting.');
$GLOBALS['race'] = null;

/* ------------------------------------------------------------ appointments */
$unscheduled = byline_story_appointment_save(10, ['title' => 'Interview local reporter', 'kind' => 'interview', 'assigneeIds' => [1]]);
check(!is_wp_error($unscheduled) && $unscheduled['appointment']['scheduleMode'] === 'unscheduled' && $unscheduled['appointment']['startAt'] === null && $unscheduled['appointment']['windowStart'] === null, 'An unscheduled appointment needs no window and no time.');
$window = byline_story_appointment_save(10, ['scheduleMode' => 'window', 'windowStart' => '2026-10-26', 'windowEnd' => '2026-10-30'], $unscheduled['appointment']['id']);
check($window['appointment']['windowStart'] === '2026-10-26' && $window['appointment']['windowEnd'] === '2026-10-30' && $window['appointment']['startAt'] === null, 'A target window is date-only and creates no timestamp.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'window'])) === 'byline_appointment_window_start_required', 'A window needs a start date.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'window', 'windowStart' => '2026-10-30', 'windowEnd' => '2026-10-26'])) === 'byline_appointment_window_order', 'A window cannot end before it starts.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'window', 'windowStart' => '2026-02-31'])) === 'byline_invalid_date', 'An impossible calendar date is rejected.');
check(!is_wp_error(byline_story_appointment_save(10, ['title' => 'One day', 'scheduleMode' => 'window', 'windowStart' => '2026-10-28'])) , 'A window end is optional.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'exact'])) === 'byline_appointment_start_required', 'Exact mode requires a start.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'exact', 'startAt' => '2026-10-27T11:00', 'endAt' => '2026-10-27T10:00'])) === 'byline_appointment_time_order', 'An exact end cannot precede its start.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad', 'scheduleMode' => 'exact', 'startAt' => 'tomorrow-ish'])) === 'byline_invalid_datetime', 'Free-form times are not guessed.');

$interview = byline_story_appointment_save(10, [
    'title' => 'Interview Mrs. Hamby', 'kind' => 'interview', 'status' => 'confirmed', 'scheduleMode' => 'exact',
    'startAt' => '2026-10-27T10:15', 'endAt' => '2026-10-27T10:35', 'location' => 'Main office', 'assigneeIds' => [1], 'sourceId' => $hamby['id'], 'notes' => 'Bring recorder',
]);
$appt = $interview['appointment'];
check($appt['startAt'] === '2026-10-27T14:15:00Z' && $appt['endAt'] === '2026-10-27T14:35:00Z', 'Site-local wall times (EDT) normalize to UTC.');
check(byline_story_site_day($appt['startAt']) === '2026-10-27', 'The site timezone, not the browser, decides the calendar day.');
check($appt['windowStart'] === null && $appt['windowEnd'] === null && $appt['sourceId'] === $hamby['id'], 'Exact appointments carry no window and link a source.');
$back_to_window = byline_story_appointment_save(10, ['scheduleMode' => 'window', 'windowStart' => '2026-10-26'], $appt['id'])['appointment'];
check($back_to_window['startAt'] === null && $back_to_window['endAt'] === null && $back_to_window['windowStart'] === '2026-10-26', 'Switching back to a window leaves no stale exact timestamps.');
$exact_again = byline_story_appointment_save(10, ['scheduleMode' => 'exact', 'startAt' => '2026-10-27T10:15'], $appt['id'])['appointment'];
check($exact_again['windowStart'] === null && $exact_again['windowEnd'] === null && $exact_again['startAt'] === '2026-10-27T14:15:00Z', 'Switching to exact clears window fields.');
check(code(byline_story_appointment_save(10, ['title' => 'Bad link', 'sourceId' => byline_story_uuid()])) === 'byline_appointment_unknown_source', 'A new link to a nonexistent source is rejected.');
check(code(byline_story_appointment_save(10, ['title' => 'x', 'kind' => 'rave'])) === 'byline_appointment_invalid_kind', 'Appointment kinds are an allowlist.');
check(code(byline_story_appointment_save(10, ['title' => ''])) === 'byline_appointment_title_required', 'An appointment needs a title.');

// Deleting a source unlinks, never deletes, its appointments.
$tasks_untouched = ['sentinel'];
$deleted = byline_story_source_delete(10, $hamby['id']);
check(!is_wp_error($deleted) && !in_array($hamby['id'], array_column(byline_story_sources(10), 'id'), true), 'The source is removed.');
$after = array_column(byline_story_appointments(10), null, 'id');
check(isset($after[$appt['id']]) && $after[$appt['id']]['sourceId'] === null && $after[$appt['id']]['title'] === 'Interview Mrs. Hamby', 'The appointment survives, with its source link cleared.');
// A dangling link written by a concurrent create is hidden on read.
$GLOBALS['meta'][10][BYLINE_STORY_APPOINTMENTS_META][0]['sourceId'] = byline_story_uuid();
check(byline_story_appointments(10)[0]['sourceId'] === null, 'Appointments never report a source that no longer exists.');
// Deleting an appointment leaves the source alone.
$keep = byline_story_source_save(10, ['label' => 'Keep me'])['source'];
$linked = byline_story_appointment_save(10, ['title' => 'Call', 'sourceId' => $keep['id']])['appointment'];
byline_story_appointment_delete(10, $linked['id']);
check(in_array($keep['id'], array_column(byline_story_sources(10), 'id'), true) && !in_array($linked['id'], array_column(byline_story_appointments(10), 'id'), true), 'Deleting an appointment does not touch its source.');
check(count(array_filter($GLOBALS['fired'], function ($f) { return $f[0] === 'byline_story_appointment_changed'; })) > 0, 'Domain changes announce themselves for activity and notifications.');

/* ----------------------------------------------------------- summary data */
$summary = byline_story_reporting_summary(10);
check(isset($summary['sources'], $summary['interviewed'], $summary['needsScheduling'], $summary['nextAppointment']) && !array_key_exists('notes', (array) $summary['nextAppointment']), 'The planning summary exposes counts and a note-free next appointment.');
check(strpos(json_encode($summary), 'Bring recorder') === false && strpos(json_encode($summary), 'Prefers mornings') === false, 'Summaries never carry source or appointment notes.');

/* --------------------------------------------------------------- the stale */
$stale = byline_story_appointment_save(10, ['title' => 'Edited'], $exact_again['id']);
$again = byline_story_appointment_save(10, ['title' => 'Edited twice', 'expectedUpdatedAt' => '1999-01-01T00:00:00Z'], $exact_again['id']);
check(code($again) === 'byline_stale_record', 'A stale appointment edit is a conflict.');

/* ------------------------------------------------------------ story access */
$ctx = function (int $user, int $story = 10) { return byline_story_context($story, $user); };
check($ctx(1)['view'] && $ctx(1)['manage'] && !$ctx(1)['assignedOnly'], 'A story editor can view and manage reporting.');
check($ctx(2)['view'] && $ctx(2)['manage'] && !$ctx(2)['edit'], 'A real contributor without edit_post can view and manage reporting for their story.');
check($ctx(3)['view'] && !$ctx(3)['manage'] && $ctx(3)['assignedOnly'] && $ctx(3)['taskAssignee'], 'A photographer with only a task sees context and cannot manage the story.');
check(!$ctx(4)['view'] && !$ctx(4)['assignedOnly'], 'An unrelated contributor cannot see the story\'s private context.');
check(!$ctx(6)['view'], 'A role without edit_posts never sees newsroom context.');
check(!$ctx(1, 11)['view'] || !$ctx(4, 11)['view'], 'Context never leaks across stories.');
check(!byline_story_context(999, 1)['exists'], 'Unknown stories do not exist.');

// Contributor (not edit_post) maintains reporting.
as_user(2);
check(!is_wp_error(byline_story_source_save(10, ['label' => 'Added by co-writer'])), 'A co-writer can add a source.');
check(!is_wp_error(byline_story_appointment_save(10, ['title' => 'Co-writer interview', 'assigneeIds' => [2, 1]])), 'A co-writer can assign a colleague on their story.');
// Assigned-only participant.
$mine = byline_story_appointment_save(10, ['title' => 'Photo walk', 'kind' => 'photo', 'assigneeIds' => [3]]); // by co-writer
as_user(3);
check(code(byline_story_source_save(10, ['label' => 'Photographer source'])) === 'byline_source_forbidden', 'An assigned-only participant cannot add sources.');
check(code(byline_story_appointment_save(10, ['title' => 'For somebody else', 'assigneeIds' => [1]])) === 'byline_assignment_forbidden', 'They cannot create appointments for other people.');
check(!is_wp_error($own = byline_story_appointment_save(10, ['title' => 'My shoot', 'kind' => 'photo', 'assigneeIds' => [3]])), 'They can create an appointment for themselves.');
check(!is_wp_error(byline_story_appointment_save(10, ['status' => 'completed'], $own['appointment']['id'])), 'They can update their own appointment.');
check(code(byline_story_appointment_save(10, ['title' => 'Hijack'], $exact_again['id'])) === 'byline_appointment_forbidden', 'They cannot edit someone else\'s appointment.');
check(code(byline_story_appointment_save(10, ['assigneeIds' => [3, 1]], $own['appointment']['id'])) === 'byline_assignment_forbidden', 'They cannot hand their appointment to others.');
check(code(byline_story_appointment_delete(10, $exact_again['id'])) === 'byline_appointment_forbidden', 'They cannot delete others\' appointments.');
check(!is_wp_error(byline_story_appointment_delete(10, $own['appointment']['id'])), 'They can delete their own.');
check(code(byline_story_source_delete(10, byline_story_sources(10)[0]['id'])) === 'byline_source_forbidden', 'They cannot delete sources not assigned to them.');
as_user(4);
check(status(byline_story_source_save(10, ['label' => 'Intruder'])) === 403 && status(byline_story_appointment_save(10, ['title' => 'Intruder'])) === 403, 'An unrelated user cannot change reporting.');
check(code(byline_story_appointment_delete(10, $exact_again['id'])) === 'byline_story_context_forbidden', 'Nor delete it.');
as_user(5);
byline_story_source_delete(10, byline_story_sources(10)[6]['id']);
check(!is_wp_error(byline_story_source_save(10, ['label' => 'Editor source', 'assigneeIds' => [1, 2]])), 'An editor (edit_others_posts) can edit all reporting.');

echo "Story reporting regression passed ($checks checks).\n";
