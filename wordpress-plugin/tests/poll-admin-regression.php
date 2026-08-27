<?php

/**
 * Polls admin workflow: list columns, row actions, editor saves, option delete
 * safety, CSV export, and the guarded destructive reset.
 */

require __DIR__ . '/helpers/poll-test-harness.php';

const BYLINE_ADMIN_POLLS_PAGE = 'byline-polls';

$byline_test_admin_page = '';

function byline_admin_current_page(): string
{
    global $byline_test_admin_page;

    return $byline_test_admin_page;
}

require __DIR__ . '/../includes/polls/admin.php';

global $wpdb, $byline_test_capabilities, $byline_test_features, $byline_test_filters, $byline_test_redirects, $byline_test_transients;

byline_register_poll_post_type();

$post_id = byline_test_create_poll('What should we cover next?', ['More school news', 'More sports coverage', 'More student features']);
$post = get_post($post_id);
$record = byline_poll_record($post);
$poll_id = $record['id'];
$options = $record['options'];

// ---------------------------------------------------------------------------
// List table
// ---------------------------------------------------------------------------

$columns = byline_poll_admin_columns(['cb' => '', 'title' => 'Title', 'author' => 'Author', 'date' => 'Date']);
byline_test_assert($columns['title'] === 'Question', 'The title column reads as the poll question.');
byline_test_assert(isset($columns['byline_poll_status'], $columns['byline_poll_votes']), 'Status and Votes are first-class columns.');
byline_test_assert(array_key_last($columns) === 'date', 'Date stays the last column.');

byline_poll_insert_vote($poll_id, $options[0]['id'], 'list-voter-1');
byline_poll_insert_vote($poll_id, $options[1]['id'], 'list-voter-2');

ob_start();
byline_poll_admin_column('byline_poll_status', $post_id);
$status_cell = ob_get_clean();
byline_test_assert($status_cell === 'Open', 'The Status column shows the domain status.');

ob_start();
byline_poll_admin_column('byline_poll_votes', $post_id);
$votes_cell = ob_get_clean();
byline_test_assert($votes_cell === '2', 'The Votes column shows the recorded total.');

ob_start();
byline_poll_admin_column('byline_poll_window', $post_id);
$window_cell = ob_get_clean();
byline_test_assert(strpos($window_cell, 'Immediately') !== false, 'An unscheduled poll reads as opening immediately.');
byline_test_assert(strpos($window_cell, 'No close date') !== false, 'A poll with no closing time says so.');

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

$actions = byline_poll_row_actions(['edit' => 'Edit'], $post);
byline_test_assert(isset($actions['edit']), 'Native row actions are preserved.');
byline_test_assert(isset($actions['byline_poll_close']), 'An open poll offers Close.');
byline_test_assert(!isset($actions['byline_poll_open']), 'An open poll does not also offer Open.');
byline_test_assert(isset($actions['byline_poll_duplicate']), 'Polls can be duplicated.');
byline_test_assert(isset($actions['byline_poll_export']), 'Results can be exported from the row.');
byline_test_assert(strpos($actions['byline_poll_close'], '_wpnonce=') !== false, 'Row actions are nonce protected.');

byline_poll_set_status($post_id, BYLINE_POLL_STATUS_CLOSED);
$closed_actions = byline_poll_row_actions([], get_post($post_id));
byline_test_assert(strpos($closed_actions['byline_poll_open'], 'status=open') !== false, 'A closed poll offers Reopen.');
byline_test_assert(strpos($closed_actions['byline_poll_open'], 'Reopen') !== false, 'The reopen action is labelled Reopen.');
byline_test_assert(!isset($closed_actions['byline_poll_close']), 'A closed poll does not offer Close.');
byline_poll_set_status($post_id, BYLINE_POLL_STATUS_OPEN);

$byline_test_capabilities = [];
byline_test_assert(byline_poll_row_actions(['edit' => 'Edit'], $post) === ['edit' => 'Edit'], 'A user without poll capabilities sees no poll actions.');
$byline_test_capabilities = ['edit_byline_poll' => true];
byline_test_assert(!isset(byline_poll_row_actions([], $post)['byline_poll_export']), 'Export needs the results capability.');
byline_test_assert(isset(byline_poll_row_actions([], $post)['byline_poll_duplicate']), 'Editing a poll is enough to duplicate it.');
$byline_test_capabilities = ['edit_byline_polls' => true, 'edit_byline_poll' => true, 'edit_others_byline_polls' => true];

// ---------------------------------------------------------------------------
// Editor saves
// ---------------------------------------------------------------------------

$_POST = [
    'byline_poll_nonce' => 'wrong-nonce',
    'byline_poll_status' => 'closed',
    'byline_poll_options' => [['id' => $options[0]['id'], 'label' => 'Tampered', 'position' => 0]],
];
byline_poll_save_post($post_id, get_post($post_id));
byline_test_assert(byline_poll_status($post_id) === BYLINE_POLL_STATUS_OPEN, 'A save without a valid nonce changes nothing.');
byline_test_assert(byline_poll_options($post_id)[0]['label'] === 'More school news', 'A save without a valid nonce leaves answers alone.');

$nonce = 'nonce-byline_poll_save_' . $post_id;
$_POST = [
    'byline_poll_nonce' => $nonce,
    'byline_poll_status' => 'closed',
    'byline_poll_opens_at' => '2026-09-01T08:30',
    'byline_poll_closes_at' => '',
    'byline_poll_options' => [
        ['id' => $options[1]['id'], 'label' => 'More sports coverage', 'position' => 0],
        ['id' => $options[0]['id'], 'label' => 'School news, expanded', 'position' => 1],
        ['id' => '', 'label' => 'Arts and culture', 'position' => 2],
        ['id' => '', 'label' => '', 'position' => 3],
    ],
];
$byline_test_capabilities['edit_byline_poll'] = false;
byline_poll_save_post($post_id, get_post($post_id));
byline_test_assert(byline_poll_status($post_id) === BYLINE_POLL_STATUS_OPEN, 'A user who cannot edit this poll cannot save it.');
$byline_test_capabilities['edit_byline_poll'] = true;

byline_poll_save_post($post_id, get_post($post_id));
$saved = byline_poll_options($post_id);

byline_test_assert(byline_poll_status($post_id) === BYLINE_POLL_STATUS_CLOSED, 'The editor can close a poll.');
byline_test_assert(byline_poll_schedule($post_id)['opensAt'] === '2026-09-01 12:30:00', 'The opening time is stored as UTC.');
byline_test_assert(byline_poll_schedule($post_id)['closesAt'] === '', 'An empty closing time means no closing time.');
byline_test_assert($saved[0]['id'] === $options[1]['id'], 'Reordering through the editor preserves answer ids.');
byline_test_assert($saved[1]['label'] === 'School news, expanded', 'Rewording through the editor persists.');
byline_test_assert($saved[1]['id'] === $options[0]['id'], 'Rewording through the editor preserves the answer id.');
byline_test_assert(count($saved) === 3, 'A blank row adds an answer, an empty row is ignored, and a vote-free answer left out is removed.');
byline_test_assert(
    !in_array($options[2]['id'], array_column($saved, 'id'), true),
    'An answer with no votes that the editor left out is removed.'
);
byline_test_assert($saved[2]['label'] === 'Arts and culture', 'The new answer keeps its submitted label.');
byline_test_assert(strpos($saved[2]['id'], 'opt_') === 0, 'A new answer receives a generated id.');

// Removing an answer that has votes is refused and reported.
$_POST['byline_poll_options'] = [['id' => $options[2]['id'], 'label' => 'More student features', 'position' => 0]];
$byline_test_transients = [];
byline_poll_save_post($post_id, get_post($post_id));
$after_removal = array_column(byline_poll_options($post_id), 'id');

byline_test_assert(in_array($options[0]['id'], $after_removal, true), 'An answer with votes survives removal.');
byline_test_assert(in_array($options[1]['id'], $after_removal, true), 'Every answer with votes survives removal.');
$notice = $byline_test_transients[BYLINE_POLL_NOTICE_TRANSIENT_PREFIX . get_current_user_id()] ?? null;
byline_test_assert(is_array($notice) && $notice['type'] === 'warning', 'A blocked removal raises a warning notice.');
byline_test_assert(strpos($notice['message'], 'More sports coverage') !== false, 'The notice names the answers it kept.');
byline_test_assert(byline_poll_option_vote_count($poll_id, $options[0]['id']) === 1, 'Blocked removals leave vote history intact.');

$_POST = [];

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

$csv = byline_poll_results_csv(byline_poll_admin_results(byline_poll_record(get_post($post_id))));
$lines = array_values(array_filter(explode("\n", trim($csv))));

byline_test_assert($lines[0] === 'option,label,votes,percentage', 'The CSV header is the documented contract.');
byline_test_assert(count($lines) === count(byline_poll_options($post_id)) + 1, 'The CSV has one row per answer.');
byline_test_assert(strpos($csv, 'list-voter-1') === false, 'The CSV must never contain voter keys.');
byline_test_assert(strpos($csv, '50') !== false, 'The CSV reports percentages.');

$byline_test_capabilities = ['edit_byline_poll' => true];
$_REQUEST = ['poll' => $post_id, '_wpnonce' => 'nonce-byline_poll_export_' . $post_id];
try {
    byline_poll_handle_export_action();
    byline_test_fail('Exporting without the results capability must be refused.');
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'wp_die:') === 0, 'An unauthorized export is refused.');
}

// ---------------------------------------------------------------------------
// Status action
// ---------------------------------------------------------------------------

$byline_test_capabilities = ['edit_byline_poll' => true, 'edit_byline_polls' => true, 'edit_others_byline_polls' => true, 'delete_others_byline_polls' => true];
$_REQUEST = ['poll' => $post_id, 'status' => 'open', '_wpnonce' => 'nonce-byline_poll_status_' . $post_id];
try {
    byline_poll_handle_status_action();
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'redirect:') === 0, 'A status change redirects back to the list.');
}
byline_test_assert(byline_poll_status($post_id) === BYLINE_POLL_STATUS_OPEN, 'The Open row action opens the poll.');

$_REQUEST = ['poll' => $post_id, 'status' => 'open', '_wpnonce' => 'forged'];
try {
    byline_poll_handle_status_action();
    byline_test_fail('A status change without a valid nonce must be refused.');
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'nonce-failure:') === 0, 'A forged nonce is refused.');
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

$_REQUEST = ['poll' => $post_id, '_wpnonce' => 'nonce-byline_poll_duplicate_' . $post_id];
try {
    byline_poll_handle_duplicate_action();
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'redirect:') === 0, 'Duplicating redirects into the new poll.');
}

$duplicate = null;
foreach (get_posts(['post_type' => BYLINE_POLL_POST_TYPE, 'post_status' => 'any', 'numberposts' => 0]) as $candidate) {
    if (strpos((string) $candidate->post_title, '(copy)') !== false) {
        $duplicate = $candidate;
    }
}
byline_test_assert($duplicate instanceof WP_Post, 'Duplicating creates a new poll.');
byline_test_assert($duplicate->post_status === 'draft', 'A duplicate starts as a WordPress draft.');
byline_test_assert(byline_poll_status((int) $duplicate->ID) === BYLINE_POLL_STATUS_DRAFT, 'A duplicate starts closed to voting.');
byline_test_assert(byline_poll_public_id((int) $duplicate->ID) !== $poll_id, 'A duplicate mints its own poll id.');
byline_test_assert(
    array_intersect(array_column(byline_poll_options((int) $duplicate->ID), 'id'), array_column(byline_poll_options($post_id), 'id')) === [],
    'A duplicate mints fresh answer ids so it cannot inherit vote history.'
);
byline_test_assert(
    array_column(byline_poll_options((int) $duplicate->ID), 'label') === array_column(byline_poll_options($post_id), 'label'),
    'A duplicate copies the answer wording.'
);
byline_test_assert(byline_poll_vote_total(byline_poll_public_id((int) $duplicate->ID)) === 0, 'A duplicate starts with no votes.');

// ---------------------------------------------------------------------------
// Reset votes
// ---------------------------------------------------------------------------

byline_test_assert(byline_poll_vote_total($poll_id) === 2, 'The poll still holds its votes before a reset.');

$_REQUEST = ['poll' => $post_id, '_wpnonce' => 'nonce-byline_poll_reset_' . $post_id];
$_POST = [];
try {
    byline_poll_handle_reset_action();
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'redirect:') === 0, 'An unconfirmed reset returns to the editor.');
}
byline_test_assert(byline_poll_vote_total($poll_id) === 2, 'An unconfirmed reset deletes nothing.');

$byline_test_capabilities['delete_others_byline_polls'] = false;
$_POST = ['byline_poll_reset_confirm' => '1'];
try {
    byline_poll_handle_reset_action();
    byline_test_fail('Resetting votes without the destructive capability must be refused.');
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'wp_die:') === 0, 'An unauthorized reset is refused.');
}
byline_test_assert(byline_poll_vote_total($poll_id) === 2, 'An unauthorized reset deletes nothing.');
$byline_test_capabilities['delete_others_byline_polls'] = true;

try {
    byline_poll_handle_reset_action();
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'redirect:') === 0, 'A completed reset returns to the editor.');
}
byline_test_assert(byline_poll_vote_total($poll_id) === 0, 'A confirmed reset deletes the poll\'s votes.');

$_POST = [];
$_REQUEST = [];

// ---------------------------------------------------------------------------
// Deleting a poll takes its votes with it
// ---------------------------------------------------------------------------

byline_poll_insert_vote($poll_id, $options[0]['id'], 'delete-voter-1');
byline_test_assert(byline_poll_vote_total($poll_id) === 1, 'The poll has a vote to clean up.');
byline_poll_delete_votes_with_post($post_id);
byline_test_assert(byline_poll_vote_total($poll_id) === 0, 'Permanently deleting a poll removes its vote rows.');

// ---------------------------------------------------------------------------
// The retired informational screen redirects to the real workflow
// ---------------------------------------------------------------------------

global $byline_test_admin_page;
$byline_test_admin_page = 'byline-polls';
$byline_test_redirects = [];
try {
    byline_poll_redirect_legacy_admin_page();
    byline_test_fail('The retired Polls page must redirect.');
} catch (RuntimeException $exception) {
    byline_test_assert(
        strpos($exception->getMessage(), 'post_type=' . BYLINE_POLL_POST_TYPE) !== false,
        'The retired Polls page must land on the native Polls list.'
    );
}

$byline_test_features = ['polls' => false];
try {
    byline_poll_redirect_legacy_admin_page();
    byline_test_fail('A disabled Polls module must not open the workflow.');
} catch (RuntimeException $exception) {
    byline_test_assert(strpos($exception->getMessage(), 'wp_die:') === 0, 'A disabled Polls module refuses the screen.');
}
$byline_test_features = ['polls' => true];

$byline_test_admin_page = 'byline-publication';
$byline_test_redirects = [];
byline_poll_redirect_legacy_admin_page();
byline_test_assert($byline_test_redirects === [], 'The poll redirect must not fire on other Byline screens.');

echo "Byline poll admin regression passed.\n";
