<?php

/**
 * Poll content model, option identity, lifecycle, schedule, active selection,
 * capabilities, and result privacy.
 */

require __DIR__ . '/helpers/poll-test-harness.php';

global $wpdb, $byline_test_post_types, $byline_test_capabilities, $byline_test_features;

// ---------------------------------------------------------------------------
// Content type and capability model
// ---------------------------------------------------------------------------

byline_register_poll_post_type();
$definition = $byline_test_post_types[BYLINE_POLL_POST_TYPE] ?? null;

byline_test_assert(is_array($definition), 'The byline_poll post type must be registered.');
byline_test_assert($definition['capability_type'] === ['byline_poll', 'byline_polls'], 'Polls must map their own capability family.');
byline_test_assert($definition['map_meta_cap'] === true, 'Polls must map meta capabilities so per-poll checks work.');
byline_test_assert($definition['show_in_rest'] === false, 'Polls must not expose the native REST controller.');
byline_test_assert($definition['public'] === false, 'Polls must not be a public WordPress route.');
byline_test_assert($definition['menu_position'] === 28, 'Polls must keep menu position 28.');
byline_test_assert($definition['show_in_menu'] === true, 'Polls must show a menu while the feature is enabled.');
byline_test_assert($definition['capabilities']['create_posts'] === 'edit_byline_polls', 'Creating a poll must use the poll capability family.');

$byline_test_features = ['polls' => false];
byline_register_poll_post_type();
byline_test_assert(
    ($byline_test_post_types[BYLINE_POLL_POST_TYPE]['show_in_menu'] ?? true) === false,
    'Disabling the polls feature must hide the Polls menu.'
);
$byline_test_features = ['polls' => true];
byline_register_poll_post_type();

byline_test_assert(
    strpos(implode(',', byline_poll_capabilities()), 'manage_options') === false,
    'Poll management must never require manage_options.'
);

byline_poll_add_role_capabilities();
$administrator = get_role('administrator');
$editor = get_role('editor');
$author = get_role('author');

foreach (byline_poll_capabilities() as $capability) {
    byline_test_assert(!empty($administrator->capabilities[$capability]), "Administrators need {$capability}.");
    byline_test_assert(!empty($editor->capabilities[$capability]), "Editors need {$capability}.");
}
byline_test_assert(!empty($author->capabilities['publish_byline_polls']), 'Authors may publish their own polls.');
byline_test_assert(empty($author->capabilities['edit_others_byline_polls']), 'Authors must not edit other people\'s polls.');
byline_test_assert(empty($author->capabilities['delete_others_byline_polls']), 'Authors must not delete other people\'s polls.');
byline_test_assert(
    byline_poll_destructive_capability() === 'delete_others_byline_polls',
    'Destroying vote history must require the stronger poll capability.'
);

// ---------------------------------------------------------------------------
// Stable option identity
// ---------------------------------------------------------------------------

$post_id = byline_test_create_poll('What should we cover next?', ['More school news', 'More sports coverage', 'More student features']);
$poll_id = byline_poll_public_id($post_id);
$original = byline_poll_options($post_id);

byline_test_assert(count($original) === 3, 'A poll keeps every submitted answer.');
byline_test_assert(strpos($poll_id, 'poll_') === 0, 'Poll ids are opaque and prefixed.');
foreach ($original as $option) {
    byline_test_assert(strpos($option['id'], 'opt_') === 0, 'Answer ids are opaque and prefixed.');
    byline_test_assert(
        stripos($option['id'], substr(preg_replace('/[^a-z]/i', '', $option['label']), 0, 6)) === false,
        'Answer ids must not be derived from labels.'
    );
}
byline_test_assert(byline_poll_public_id($post_id) === $poll_id, 'A poll id never changes once minted.');

// Rewording keeps ids.
$renamed = byline_poll_set_options($post_id, [
    ['id' => $original[0]['id'], 'label' => 'Even more school news', 'position' => 0],
    ['id' => $original[1]['id'], 'label' => $original[1]['label'], 'position' => 1],
    ['id' => $original[2]['id'], 'label' => $original[2]['label'], 'position' => 2],
]);
byline_test_assert($renamed[0]['id'] === $original[0]['id'], 'Editing a label must not change its answer id.');
byline_test_assert($renamed[0]['label'] === 'Even more school news', 'Editing a label must persist.');

// Reordering keeps ids and renumbers positions.
$reordered = byline_poll_set_options($post_id, [
    ['id' => $original[2]['id'], 'label' => $original[2]['label'], 'position' => 0],
    ['id' => $original[0]['id'], 'label' => 'Even more school news', 'position' => 1],
    ['id' => $original[1]['id'], 'label' => $original[1]['label'], 'position' => 2],
]);
byline_test_assert(array_column($reordered, 'id') === [$original[2]['id'], $original[0]['id'], $original[1]['id']], 'Reordering must preserve answer ids.');
byline_test_assert(array_column($reordered, 'position') === [0, 1, 2], 'Positions are renumbered contiguously.');

// ---------------------------------------------------------------------------
// Removing an answer that already has votes
// ---------------------------------------------------------------------------

byline_test_assert(
    byline_poll_insert_vote($poll_id, $original[1]['id'], 'voter-key-1') === BYLINE_POLL_VOTE_INSERTED,
    'A first vote is recorded.'
);

$merge = byline_poll_merge_options($poll_id, byline_poll_options($post_id), [
    ['id' => $original[2]['id'], 'label' => $original[2]['label'], 'position' => 0],
    ['id' => $original[0]['id'], 'label' => 'Even more school news', 'position' => 1],
]);
byline_test_assert(in_array($original[1]['id'], array_column($merge['options'], 'id'), true), 'An answer with votes must survive a removal attempt.');
byline_test_assert($merge['blocked'] !== [], 'A blocked removal must be reported to the editor.');

$merge_free = byline_poll_merge_options($poll_id, byline_poll_options($post_id), [
    ['id' => $original[1]['id'], 'label' => $original[1]['label'], 'position' => 0],
    ['id' => $original[0]['id'], 'label' => 'Even more school news', 'position' => 1],
]);
byline_test_assert(
    !in_array($original[2]['id'], array_column($merge_free['options'], 'id'), true),
    'An answer with no votes may be removed.'
);
byline_test_assert($merge_free['blocked'] === [], 'Removing a vote-free answer is not reported as blocked.');

// Vote rows are never remapped onto another answer.
byline_test_assert(byline_poll_option_vote_count($poll_id, $original[1]['id']) === 1, 'Votes stay attached to their own answer id.');

// ---------------------------------------------------------------------------
// Lifecycle and schedule
// ---------------------------------------------------------------------------

$draft_post = byline_test_create_poll('Drafted', ['Yes', 'No'], BYLINE_POLL_STATUS_OPEN, '', '', '', 'draft');
byline_test_assert(byline_poll_status($draft_post) === BYLINE_POLL_STATUS_DRAFT, 'An unpublished poll can never report itself open.');

wp_update_post(['ID' => $draft_post, 'post_status' => 'publish']);
byline_test_assert(byline_poll_status($draft_post) === BYLINE_POLL_STATUS_OPEN, 'Publishing restores the stored voting state.');

byline_poll_set_status($draft_post, BYLINE_POLL_STATUS_CLOSED);
byline_test_assert(byline_poll_status($draft_post) === BYLINE_POLL_STATUS_CLOSED, 'A poll can be closed.');
byline_poll_set_status($draft_post, BYLINE_POLL_STATUS_OPEN);
byline_test_assert(byline_poll_status($draft_post) === BYLINE_POLL_STATUS_OPEN, 'A closed poll can be reopened.');
byline_poll_set_status($draft_post, 'nonsense');
byline_test_assert(byline_poll_status($draft_post) === BYLINE_POLL_STATUS_DRAFT, 'An unknown voting state falls back to draft.');

$schedule = byline_poll_set_schedule($draft_post, '2026-09-01T12:30:00Z', '2026-09-08 00:00:00');
byline_test_assert($schedule['opensAt'] === '2026-09-01 12:30:00', 'ISO-8601 schedules normalise to UTC MySQL datetimes.');
byline_test_assert($schedule['closesAt'] === '2026-09-08 00:00:00', 'MySQL datetimes are kept as UTC.');
byline_test_assert(byline_poll_set_schedule($draft_post, '', '')['opensAt'] === '', 'An empty schedule stays empty.');

// A local wall-clock entry is converted, not compared against UTC directly.
byline_test_assert(
    byline_poll_local_input_to_utc('2026-09-01T08:30') === '2026-09-01 12:30:00',
    'Editor input in site time converts to UTC (America/New_York, DST).'
);
byline_test_assert(
    byline_poll_utc_to_local_input('2026-09-01 12:30:00') === '2026-09-01T08:30',
    'Stored UTC renders back into the editor as site time.'
);
byline_test_assert(byline_poll_normalize_utc_datetime('0000-00-00 00:00:00') === '', 'A zero datetime is treated as unset.');
byline_test_assert(byline_poll_normalize_utc_datetime('not a date') === '', 'Unparseable schedules are discarded, not guessed.');

// ---------------------------------------------------------------------------
// Voting window
// ---------------------------------------------------------------------------

$now = '2026-09-01 12:00:00';
$window = ['status' => BYLINE_POLL_STATUS_OPEN, 'opensAt' => '', 'closesAt' => '', 'createdAt' => $now];

byline_test_assert(byline_poll_record_is_open($window, $now), 'An open poll with no window is open.');
byline_test_assert(byline_poll_record_is_open(array_merge($window, ['opensAt' => $now]), $now), 'opens_at is inclusive.');
byline_test_assert(!byline_poll_record_is_open(array_merge($window, ['opensAt' => '2026-09-01 12:00:01']), $now), 'A future poll is not open yet.');
byline_test_assert(!byline_poll_record_is_open(array_merge($window, ['closesAt' => $now]), $now), 'closes_at is exclusive.');
byline_test_assert(byline_poll_record_is_open(array_merge($window, ['closesAt' => '2026-09-01 12:00:01']), $now), 'A poll is open up to its closing instant.');
byline_test_assert(!byline_poll_record_is_open(array_merge($window, ['status' => BYLINE_POLL_STATUS_CLOSED]), $now), 'A closed poll is never open.');

// ---------------------------------------------------------------------------
// Active poll selection
// ---------------------------------------------------------------------------

global $byline_test_posts;
$byline_test_posts = [];

$older = byline_test_create_poll('Older open poll', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '', '', '2026-08-01 00:00:00');
$newer = byline_test_create_poll('Newer open poll', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '', '', '2026-08-20 00:00:00');
byline_test_create_poll('Drafted poll', ['A', 'B'], BYLINE_POLL_STATUS_DRAFT, '', '', '2026-08-25 00:00:00');
byline_test_create_poll('WordPress draft', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '', '', '2026-08-26 00:00:00', 'draft');
byline_test_create_poll('Scheduled poll', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '2027-01-01 00:00:00', '', '2026-08-27 00:00:00');
byline_test_create_poll('Expired poll', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '', '2026-08-02 00:00:00', '2026-08-28 00:00:00');
byline_test_create_poll('Open poll with no answers', [], BYLINE_POLL_STATUS_OPEN, '', '', '2026-08-29 00:00:00');

$active = byline_poll_active_record('2026-09-01 12:00:00');
byline_test_assert($active !== null, 'An open, in-window poll must be selected.');
byline_test_assert($active['postId'] === $newer, 'The newest applicable poll wins.');
byline_test_assert($active['question'] === 'Newer open poll', 'The selected poll carries its question.');

// A newly scheduled poll takes over once its window opens.
$scheduled = byline_test_create_poll('Scheduled takeover', ['A', 'B'], BYLINE_POLL_STATUS_OPEN, '2026-09-05 00:00:00', '', '2026-08-10 00:00:00');
byline_test_assert(byline_poll_active_record('2026-09-01 12:00:00')['postId'] === $newer, 'A scheduled poll waits for its opening time.');
byline_test_assert(byline_poll_active_record('2026-09-06 12:00:00')['postId'] === $scheduled, 'Ordering uses the opening time when one is set.');

// Feature flag.
$byline_test_features = ['polls' => false];
byline_test_assert(byline_poll_active_record('2026-09-01 12:00:00') === null, 'A disabled polls module reports no active poll.');
$byline_test_features = ['polls' => true];

// Only the newest poll is offered; nothing returns a list.
byline_test_assert(is_array(byline_poll_active_record('2026-09-01 12:00:00')), 'Active selection returns a single poll record.');

// ---------------------------------------------------------------------------
// Result privacy
// ---------------------------------------------------------------------------

$wpdb->rows = [];
$record = byline_poll_record(get_post($older));
$options = $record['options'];

for ($index = 0; $index < BYLINE_POLL_MIN_RESULTS_VOTES - 1; $index++) {
    byline_poll_insert_vote($record['id'], $options[0]['id'], 'privacy-voter-' . $index);
}

$payload = byline_poll_public_payload($record);
byline_test_assert($payload['totalVotes'] === 4, 'The public payload reports the true response total.');
byline_test_assert($payload['resultsAvailable'] === false, 'Low-response polls report results as unavailable.');
byline_test_assert(array_sum(array_column($payload['options'], 'votes')) === 0, 'Per-answer counts are withheld below the threshold.');

byline_poll_insert_vote($record['id'], $options[1]['id'], 'privacy-voter-threshold');
$payload = byline_poll_public_payload($record);
byline_test_assert($payload['resultsAvailable'] === true, 'Reaching the threshold releases results.');
byline_test_assert($payload['options'][0]['votes'] === 4, 'Released results carry real per-answer counts.');
byline_test_assert($payload['options'][1]['votes'] === 1, 'Every answer reports its own count.');
byline_test_assert($payload['totalVotes'] === 5, 'The total matches the recorded votes.');

// Administrators see everything, including below the public threshold.
$wpdb->rows = [];
byline_poll_insert_vote($record['id'], $options[0]['id'], 'admin-voter-1');
$results = byline_poll_admin_results($record);
byline_test_assert($results['totalVotes'] === 1, 'Admin results are never suppressed.');
byline_test_assert($results['options'][0]['votes'] === 1, 'Admin results show low counts.');
byline_test_assert($results['options'][0]['percentage'] === 100.0, 'Admin results include percentages.');
byline_test_assert(strpos((string) json_encode($results), 'admin-voter-1') === false, 'Admin results must never contain voter keys.');
byline_test_assert(strpos((string) json_encode(byline_poll_public_payload($record)), 'admin-voter-1') === false, 'Public payloads must never contain voter keys.');

// ---------------------------------------------------------------------------
// Duplicate detection is the unique key, not a guessed error string
// ---------------------------------------------------------------------------

$wpdb->rows = [];
byline_test_assert(byline_poll_insert_vote('p1', 'o1', 'key-a') === BYLINE_POLL_VOTE_INSERTED, 'A new voter is inserted.');
byline_test_assert(byline_poll_insert_vote('p1', 'o2', 'key-a') === BYLINE_POLL_VOTE_DUPLICATE, 'The same voter cannot answer twice.');
byline_test_assert(byline_poll_insert_vote('p2', 'o1', 'key-a') === BYLINE_POLL_VOTE_INSERTED, 'The same voter may answer a different poll.');

$wpdb->insert_failure = 'Table \'wp_byline_poll_votes\' doesn\'t exist';
byline_test_assert(byline_poll_insert_vote('p1', 'o1', 'key-b') === BYLINE_POLL_VOTE_FAILED, 'An unrelated database failure is not a duplicate.');
$wpdb->insert_failure = 'Cannot add or update a child row: a foreign key constraint fails';
byline_test_assert(byline_poll_insert_vote('p1', 'o1', 'key-c') === BYLINE_POLL_VOTE_FAILED, 'A constraint failure that is not 1062 is not a duplicate.');
$wpdb->insert_failure = null;

// ---------------------------------------------------------------------------
// Operator diagnostics report health, never the secret
// ---------------------------------------------------------------------------

$diagnostics = byline_poll_diagnostics();
byline_test_assert($diagnostics['storageReady'] === true, 'Diagnostics report whether vote storage exists.');
byline_test_assert($diagnostics['schemaVersion'] === BYLINE_POLL_SCHEMA_VERSION, 'Diagnostics report the installed schema version.');
byline_test_assert($diagnostics['secretSource'] === 'constant:BYLINE_POLL_COOKIE_SECRET', 'Diagnostics name the secret source, not the secret.');
byline_test_assert(
    strpos((string) json_encode($diagnostics), BYLINE_POLL_COOKIE_SECRET) === false,
    'Diagnostics must never contain the poll signing secret.'
);
byline_test_assert(
    strpos((string) json_encode($diagnostics), 'key-a') === false,
    'Diagnostics must never contain voter keys.'
);
byline_test_assert(byline_poll_signing_secret() === BYLINE_POLL_COOKIE_SECRET, 'An explicit constant wins over a generated secret.');

echo "Byline poll storage regression passed.\n";
