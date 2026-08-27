<?php

/**
 * The canonical editorial workflow domain.
 *
 * Editorial workflow and WordPress publication state are separate concepts, the
 * storage keys are existing installed-site data, and the capability split
 * between "can edit this story" and "can assign it" is load-bearing for every
 * surface that consumes the domain. All three are asserted here.
 */

define('ABSPATH', __DIR__ . '/../');

class WP_Post { public int $ID = 0; public int $post_author = 1; public string $post_type = 'post'; public string $post_status = 'draft'; public string $post_title = ''; }
class WP_User { public int $ID = 1; public string $display_name = 'Test User'; }
class WP_Error
{
    public string $code;
    public string $message;
    public array $data;
    public function __construct(string $code = '', string $message = '', array $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }
    public function get_error_code(): string { return $this->code; }
    public function get_error_message(): string { return $this->message; }
}

$byline_posts = [];
$byline_meta = [];
$byline_users = [];
$byline_registered_meta = [];
$byline_actions = [];
// Role -> capability map, mirroring the WordPress defaults the domain relies on.
$byline_roles = [
    'administrator' => ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true],
    'editor' => ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => true],
    'author' => ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => false],
    'contributor' => ['edit_posts' => true, 'edit_post' => true, 'edit_others_posts' => false],
];
$byline_current_role = 'administrator';

function byline_test_fail(string $message): void { fwrite(STDERR, $message . "\n"); exit(1); }

function add_action(string $tag, $callback = null, ...$args): void { global $byline_actions; $byline_actions[$tag][] = $callback; }
function do_action(string $tag, ...$args): void {}
function register_post_meta($post_type, $key, array $args): bool { global $byline_registered_meta; $byline_registered_meta[$key] = $args; return true; }
function sanitize_key($value): string { return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function absint($value): int { return abs((int) $value); }
function current_user_can(string $capability, ...$args): bool { global $byline_roles, $byline_current_role; return !empty($byline_roles[$byline_current_role][$capability]); }
function user_can($user, string $capability, ...$args): bool { global $byline_roles; $role = is_int($user) || ctype_digit((string) $user) ? ($GLOBALS['byline_users'][(int) $user] ?? 'administrator') : 'administrator'; return !empty($byline_roles[$role][$capability]); }
function get_post($id) { global $byline_posts; return $byline_posts[$id] ?? null; }
function get_user_by($field, $value) { global $byline_users; if (!isset($byline_users[(int) $value])) { return false; } $user = new WP_User(); $user->ID = (int) $value; $user->display_name = 'User ' . (int) $value; return $user; }
function get_users(array $args = []): array { return []; }
function update_post_meta($post_id, $key, $value): void { global $byline_meta; $byline_meta[$post_id][$key] = $value; }
function delete_post_meta($post_id, $key): void { global $byline_meta; unset($byline_meta[$post_id][$key]); }
function get_post_meta($post_id, $key, $single = false) { global $byline_meta; return $byline_meta[$post_id][$key] ?? ''; }
function is_wp_error($thing): bool { return $thing instanceof WP_Error; }

require __DIR__ . '/../includes/editorial/workflow.php';

// --- storage compatibility --------------------------------------------------

// Installed sites already hold these values. Byline naming must point at the
// existing identifiers so there is exactly one source of truth per field.
if (BYLINE_EDITORIAL_STATUS_META !== '_wwh_story_status'
    || BYLINE_EDITORIAL_EDITOR_META !== '_wwh_story_editor_user_id'
    || BYLINE_EDITORIAL_DEADLINE_META !== '_wwh_story_deadline'
    || BYLINE_EDITORIAL_VISUALS_META !== '_wwh_story_visuals') {
    byline_test_fail('Editorial workflow storage keys drifted away from the installed-site metadata.');
}

// --- vocabulary -------------------------------------------------------------

if (byline_editorial_status_ids() !== ['pitch', 'assigned', 'reporting', 'writing', 'editing', 'ready', 'on-hold', 'dropped', 'published']) {
    byline_test_fail('The canonical workflow status identifiers changed.');
}
if (in_array('published', byline_editorial_selectable_status_ids(), true)) {
    byline_test_fail('Published was offered as a selectable editorial status.');
}
if (byline_editorial_status_label('ready') !== 'Ready for Review' || byline_editorial_status_label('on-hold') !== 'On Hold') {
    byline_test_fail('Workflow labels changed unexpectedly.');
}
foreach (byline_editorial_status_ids() as $status) {
    if (byline_editorial_sanitize_status($status) !== $status) {
        byline_test_fail("Supported status {$status} did not survive sanitization.");
    }
}
// An unrecognised value falls back deliberately rather than throwing: a story
// with corrupt metadata still has to open.
if (byline_editorial_sanitize_status('not-a-stage') !== 'pitch' || byline_editorial_sanitize_status('') !== 'pitch') {
    byline_test_fail('An invalid workflow status was not rejected in favour of the default.');
}

// --- defaults ---------------------------------------------------------------

$post = new WP_Post();
$post->ID = 1;
$post->post_title = 'A story';
$byline_posts[1] = $post;
$byline_users = [7 => 'editor', 9 => 'author'];

// Reading a story that predates the workflow must not write anything.
if (byline_get_editorial_status(1) !== 'pitch') { byline_test_fail('Missing workflow metadata did not default to pitch.'); }
if (isset($byline_meta[1][BYLINE_EDITORIAL_STATUS_META])) { byline_test_fail('Reading a default status wrote metadata to the database.'); }

// --- publication state is derived -------------------------------------------

byline_set_editorial_status(1, 'editing');
if (byline_get_effective_editorial_status(1) !== 'editing') { byline_test_fail('A draft did not report its stored workflow stage.'); }

$post->post_status = 'publish';
if (byline_get_effective_editorial_status(1) !== 'published') { byline_test_fail('A published story did not report the derived Published state.'); }
if (byline_get_editorial_status(1) !== 'editing') { byline_test_fail('Publishing destroyed the stored workflow stage.'); }
if (byline_set_editorial_status(1, 'published')) { byline_test_fail('Published was accepted as a manual workflow status.'); }
if (byline_get_editorial_status(1) !== 'editing') { byline_test_fail('A rejected Published write still mutated the stored stage.'); }

$post->post_status = 'draft';
if (byline_get_effective_editorial_status(1) !== 'editing') { byline_test_fail('Unpublishing did not recover the previous workflow stage.'); }

// A legacy row that stored "published" is treated as unset progress rather than
// stranding the story on a stage it can never leave.
update_post_meta(1, BYLINE_EDITORIAL_STATUS_META, 'published');
if (byline_get_editorial_status(1) !== 'pitch') { byline_test_fail('Legacy stored "published" metadata was not normalised.'); }
byline_set_editorial_status(1, 'writing');

// --- round-trips ------------------------------------------------------------

byline_set_editorial_editor_id(1, 7);
if (byline_get_editorial_editor_id(1) !== 7) { byline_test_fail('Editor assignment did not round-trip.'); }
byline_set_editorial_editor_id(1, 0);
if (byline_get_editorial_editor_id(1) !== 0 || isset($byline_meta[1][BYLINE_EDITORIAL_EDITOR_META])) {
    byline_test_fail('Clearing the editor assignment left metadata behind.');
}
byline_set_editorial_editor_id(1, 7);

if (byline_editorial_sanitize_deadline('2026-09-01') !== '2026-09-01') { byline_test_fail('A valid deadline was rejected.'); }
foreach (['2026-02-30', '01/09/2026', '2026-9-1', 'tomorrow', ''] as $bad) {
    if (byline_editorial_sanitize_deadline($bad) !== '') { byline_test_fail("Deadline '{$bad}' was not normalised away."); }
}
byline_set_editorial_deadline(1, '2026-09-01');
if (byline_get_editorial_deadline(1) !== '2026-09-01') { byline_test_fail('Deadline did not round-trip.'); }

byline_set_editorial_visuals(1, "  <b>Need</b> a vertical photo  ");
if (byline_get_editorial_visuals(1) !== 'Need a vertical photo') { byline_test_fail('Visual needs were not sanitised.'); }

$state = byline_get_editorial_story_state(1);
if ($state['status'] !== 'writing' || $state['editorId'] !== 7 || $state['deadline'] !== '2026-09-01' || $state['isPublished']) {
    byline_test_fail('The aggregate story state did not report the stored values.');
}

// --- capabilities -----------------------------------------------------------

// Anyone who can edit the story owns its stage and its visual needs.
$byline_current_role = 'author';
$result = byline_update_editorial_story_state(1, ['status' => 'reporting']);
if (is_wp_error($result) || byline_get_editorial_status(1) !== 'reporting') {
    byline_test_fail('An author could not change the workflow stage of a story they can edit.');
}
$result = byline_update_editorial_story_state(1, ['visuals' => 'Mugshot from yearbook']);
if (is_wp_error($result)) { byline_test_fail('An author could not record visual needs.'); }

// Assignment is an editor's decision.
foreach (['author', 'contributor'] as $role) {
    $byline_current_role = $role;
    foreach ([['editorId' => 9], ['deadline' => '2026-10-01']] as $change) {
        $denied = byline_update_editorial_story_state(1, $change);
        if (!is_wp_error($denied) || $denied->get_error_code() !== 'byline_editorial_forbidden_assignment') {
            byline_test_fail("A {$role} was allowed to change an assignment or deadline.");
        }
    }
}
if (byline_get_editorial_editor_id(1) !== 7 || byline_get_editorial_deadline(1) !== '2026-09-01') {
    byline_test_fail('A refused assignment change still mutated stored state.');
}

foreach (['administrator', 'editor'] as $role) {
    $byline_current_role = $role;
    $allowed = byline_update_editorial_story_state(1, ['editorId' => 9, 'deadline' => '2026-10-01']);
    if (is_wp_error($allowed)) { byline_test_fail("An {$role} could not assign an editor or a deadline."); }
}
if (byline_get_editorial_editor_id(1) !== 9 || byline_get_editorial_deadline(1) !== '2026-10-01') {
    byline_test_fail('An authorised assignment change was not persisted.');
}

$byline_current_role = 'administrator';

// --- update guards ----------------------------------------------------------

$rejected = byline_update_editorial_story_state(1, ['status' => 'published']);
if (!is_wp_error($rejected) || $rejected->get_error_code() !== 'byline_editorial_derived_status') {
    byline_test_fail('A manual Published mutation was not refused.');
}
$rejected = byline_update_editorial_story_state(1, ['status' => 'nonsense']);
if (!is_wp_error($rejected) || $rejected->get_error_code() !== 'byline_editorial_invalid_status') {
    byline_test_fail('An unrecognised status was not refused.');
}
$rejected = byline_update_editorial_story_state(1, ['deadline' => '2026-02-30']);
if (!is_wp_error($rejected) || $rejected->get_error_code() !== 'byline_editorial_invalid_deadline') {
    byline_test_fail('An impossible deadline was not refused.');
}
$rejected = byline_update_editorial_story_state(1, ['editorId' => 4242]);
if (!is_wp_error($rejected) || $rejected->get_error_code() !== 'byline_editorial_unknown_editor') {
    byline_test_fail('An unknown editor account was accepted.');
}
$rejected = byline_update_editorial_story_state(999, ['status' => 'writing']);
if (!is_wp_error($rejected) || $rejected->get_error_code() !== 'byline_editorial_unknown_story') {
    byline_test_fail('A missing story was not refused.');
}

// A partial update leaves untouched fields alone: a caller that only knows
// about the stage must never clear an assignment.
$before = byline_get_editorial_story_state(1);
byline_update_editorial_story_state(1, ['status' => 'ready']);
$after = byline_get_editorial_story_state(1);
if ($after['editorId'] !== $before['editorId'] || $after['deadline'] !== $before['deadline'] || $after['visuals'] !== $before['visuals']) {
    byline_test_fail('A partial workflow update cleared fields it did not mention.');
}

// Clearing a deadline is an explicit empty string, not an omission.
byline_update_editorial_story_state(1, ['deadline' => '']);
if (byline_get_editorial_deadline(1) !== '') { byline_test_fail('An explicit empty deadline did not clear the value.'); }

// --- privacy ----------------------------------------------------------------

byline_editorial_register_meta();
foreach ([BYLINE_EDITORIAL_STATUS_META, BYLINE_EDITORIAL_EDITOR_META, BYLINE_EDITORIAL_DEADLINE_META, BYLINE_EDITORIAL_VISUALS_META] as $key) {
    if (!isset($byline_registered_meta[$key])) { byline_test_fail("Workflow meta {$key} was not registered with WordPress."); }
    if (!empty($byline_registered_meta[$key]['show_in_rest'])) {
        byline_test_fail("Workflow meta {$key} is exposed through the public REST schema.");
    }
    if (!isset($byline_registered_meta[$key]['sanitize_callback'], $byline_registered_meta[$key]['auth_callback'])) {
        byline_test_fail("Workflow meta {$key} is missing sanitisation or authorisation.");
    }
}

echo "Byline editorial workflow regression passed.\n";
