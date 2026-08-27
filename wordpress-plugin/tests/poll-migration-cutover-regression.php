<?php

/**
 * Cutover safety.
 *
 * Two properties are proved here:
 *
 *  1. A migration run from WP-CLI guarantees poll storage before it touches poll
 *     data, because WP-CLI never fires admin_init. Public poll requests still
 *     never run DDL.
 *  2. The final vote delta must land before the Worker switches to WordPress. A
 *     voter whose last old-datastore vote is only in the delta can otherwise vote
 *     a second time in the window between the switch and the delta import.
 */

// Freshly deployed plugin files: no activation hook and no admin request have
// run, so nothing has created the vote table yet.
define('BYLINE_POLL_TEST_NO_SCHEMA', true);

require __DIR__ . '/helpers/poll-test-harness.php';

global $wpdb, $byline_test_options, $byline_test_dbdelta_calls;

byline_register_poll_post_type();

$artifact = json_decode((string) file_get_contents(__DIR__ . '/fixtures/d1-polls-export.json'), true);

// ---------------------------------------------------------------------------
// Fresh files, no admin request, then `wp byline polls import`
// ---------------------------------------------------------------------------

byline_test_assert($wpdb->installed === false, 'The vote table does not exist before installation.');
byline_test_assert((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) === 0, 'No schema version is recorded yet.');
byline_test_assert($byline_test_dbdelta_calls === 0, 'Nothing has run DDL yet.');

// A public request must never be the thing that creates the table.
$public = byline_poll_rest_get_active(new WP_REST_Request());
byline_test_assert($public->get_status() === 404, 'A public read on an uninstalled site is answered safely.');
byline_test_assert($byline_test_dbdelta_calls === 0, 'A public poll request must never run DDL.');
byline_test_assert($wpdb->installed === false, 'A public poll request must not create the vote table.');

// The central upgrade coordinator owns admin_init in the full plugin bootstrap;
// this poll module must not register a second DDL path of its own. WP-CLI
// import/verify explicitly ensure storage before touching vote rows.
byline_test_assert(
    !isset($byline_test_actions['admin_init']) || !in_array('byline_poll_maybe_upgrade_schema', $byline_test_actions['admin_init'], true),
    'The poll module must not own a second admin_init schema migration hook.'
);

$report = byline_poll_import_artifact($artifact);
byline_test_assert(!is_wp_error($report), 'Importing on a fresh install succeeds without an admin request.');
byline_test_assert($byline_test_dbdelta_calls === 1, 'The importer installed the schema exactly once.');
byline_test_assert($wpdb->installed === true, 'The vote table exists after the import.');
byline_test_assert(
    $wpdb->inserted_without_table === false,
    'No vote row was written before the vote table existed; the schema is guaranteed before poll data is touched.'
);
byline_test_assert((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) === BYLINE_POLL_SCHEMA_VERSION, 'The schema version is recorded.');
byline_test_assert($report['votes']['inserted'] === 6, 'The initial import lands every sound vote.');
byline_test_assert($report['matches'] === true, 'The initial import verifies.');

// Verification is a privileged command too, and equally must not assume the
// table already exists.
$wpdb->installed = false;
$byline_test_dbdelta_calls = 0;
$verification = byline_poll_verify_artifact($artifact);
byline_test_assert(!is_wp_error($verification), 'Verification recreates missing storage rather than failing on a query.');
byline_test_assert($byline_test_dbdelta_calls === 1, 'Verification guaranteed the schema once.');

// Re-import so the destination is whole again after that storage reset.
byline_poll_import_artifact($artifact);
byline_test_assert(byline_poll_vote_total('website-coverage') === 4, 'The destination is restored.');
byline_test_assert(byline_poll_verify_artifact($artifact)['matches'] === true, 'Verification passes again.');

// ---------------------------------------------------------------------------
// The delta must land before the Worker switches over
// ---------------------------------------------------------------------------

// One more voter answered the old datastore after the initial export. Their
// voter_key exists only in the final delta.
$late_voter_id = 'LateVoter-00000000000000000';
$late_voter_key = byline_poll_voter_key($late_voter_id, byline_poll_signing_secret());
$late_cookie = 'ww_voter_id=' . rawurlencode(byline_poll_sign_voter_id($late_voter_id, byline_poll_signing_secret()));

$delta = $artifact;
$delta['votes'][] = [
    'id' => 'v-late',
    'poll_id' => 'website-coverage',
    'option_id' => 'news',
    'voter_key' => $late_voter_key,
    'created_at' => '2026-08-27 11:59:00',
];

byline_test_assert(byline_poll_vote_total('website-coverage') === 4, 'The late vote is not in WordPress yet.');

// Switching the Worker before importing the delta is exactly the race: the
// voter is unknown to WordPress and is accepted a second time.
byline_test_reset_rate_limit();
$premature = byline_poll_rest_vote(byline_test_vote_request('website-coverage', 'sports', $late_cookie));
byline_test_assert($premature->get_status() === 200, 'Before the delta lands, WordPress cannot recognise the late voter.');
byline_test_assert(byline_poll_vote_total('website-coverage') === 5, 'That is the double vote the documented order must prevent.');

// The delta would then have been quietly absorbed as a duplicate, hiding it.
$absorbed = byline_poll_import_artifact($delta, ['votes_only' => true]);
byline_test_assert($absorbed['votes']['duplicates'] >= 1, 'A late delta import is absorbed as a duplicate, so the double vote leaves no trace in the counts.');

// Rewind to the state just after the initial import and do it in the correct
// order: freeze old writes, export the delta, import it, and only then switch.
$wpdb->rows = array_values(array_filter($wpdb->rows, static function (array $row) use ($late_voter_key): bool {
    return $row['voter_key'] !== $late_voter_key;
}));
byline_test_assert(byline_poll_vote_total('website-coverage') === 4, 'Rewound to the post-initial-import state.');

$handoff = byline_poll_import_artifact($delta, ['votes_only' => true]);
byline_test_assert(!is_wp_error($handoff), 'The votes-only delta import succeeds.');
byline_test_assert($handoff['votesOnly'] === true, 'The report records that it ran votes-only.');
byline_test_assert($handoff['votes']['inserted'] === 1, 'Only the late vote is new.');
byline_test_assert($handoff['votes']['duplicates'] === 6, 'Everything already imported is recognised.');
byline_test_assert(byline_poll_vote_total('website-coverage') === 5, 'The late vote is now in WordPress.');

// Now the Worker switches over. The same voter cannot slip a second vote in.
byline_test_reset_rate_limit();
$after_handoff = byline_poll_rest_vote(byline_test_vote_request('website-coverage', 'sports', $late_cookie));
byline_test_assert($after_handoff->get_status() === 409, 'After the delta lands the late voter is recognised.');
byline_test_assert($after_handoff->get_data()['error'] === BYLINE_POLL_ERROR_ALREADY_VOTED, 'They are told they already voted.');
byline_test_assert(byline_poll_vote_total('website-coverage') === 5, 'No second vote can slip in before the handoff completes.');

// ---------------------------------------------------------------------------
// A votes-only delta never rewrites editorial state
// ---------------------------------------------------------------------------

// This is why the write freeze must not be `UPDATE polls SET status='closed'`:
// a status mutated to freeze writes would otherwise be imported as the poll's
// final state. Votes-only mode cannot carry it across at all.
$coverage = byline_poll_find_post_by_public_id('website-coverage');
byline_poll_set_status((int) $coverage->ID, BYLINE_POLL_STATUS_OPEN);
$edited = byline_poll_set_options((int) $coverage->ID, [
    ['id' => 'news', 'label' => 'Rewritten in WordPress after the export', 'position' => 0],
    ['id' => 'sports', 'label' => 'More sports coverage', 'position' => 1],
    ['id' => 'features', 'label' => 'More student features', 'position' => 2],
]);

$frozen_source = $delta;
$frozen_source['polls'][0]['status'] = 'closed';
$frozen_source['polls'][0]['question'] = 'A question the freeze mutated';

$safe = byline_poll_import_artifact($frozen_source, ['votes_only' => true]);
byline_test_assert(!is_wp_error($safe), 'A votes-only import of a mutated source succeeds.');
byline_test_assert($safe['polls']['unchanged'] === 3, 'Every poll is reported as untouched.');
byline_test_assert($safe['polls']['created'] === 0 && $safe['polls']['updated'] === 0, 'No poll is created or rewritten.');
byline_test_assert(byline_poll_status((int) $coverage->ID) === BYLINE_POLL_STATUS_OPEN, 'A status mutated at the source cannot become the live poll status.');
byline_test_assert(get_post((int) $coverage->ID)->post_title === 'What should Weekly Wildcat cover more of next?', 'The live question is not rewritten.');
byline_test_assert(byline_poll_options((int) $coverage->ID)[0]['label'] === 'Rewritten in WordPress after the export', 'Editorial answer wording survives a delta import.');

// A full (non votes-only) import would have carried that mutation across, which
// is the failure mode the documented order avoids.
$unsafe = byline_poll_import_artifact($frozen_source);
byline_test_assert(byline_poll_status((int) $coverage->ID) === BYLINE_POLL_STATUS_CLOSED, 'A full import does adopt the source status, which is why the final delta is votes-only.');
byline_poll_set_status((int) $coverage->ID, BYLINE_POLL_STATUS_OPEN);
byline_poll_set_options((int) $coverage->ID, $edited);

// ---------------------------------------------------------------------------
// Votes-only mode refuses to resurrect what WordPress no longer holds
// ---------------------------------------------------------------------------

$orphan_source = $delta;
$orphan_source['votes'] = [[
    'id' => 'v-removed',
    'poll_id' => 'website-coverage',
    'option_id' => 'features',
    'voter_key' => 'voter-for-a-removed-answer',
    'created_at' => '2026-08-27 12:00:00',
]];

// The editor removed that answer in WordPress after the export.
byline_poll_set_options((int) $coverage->ID, [
    ['id' => 'news', 'label' => 'Rewritten in WordPress after the export', 'position' => 0],
    ['id' => 'sports', 'label' => 'More sports coverage', 'position' => 1],
]);

$orphaned = byline_poll_import_artifact($orphan_source, ['votes_only' => true]);
byline_test_assert($orphaned['votes']['inserted'] === 0, 'A delta vote for a removed answer is not inserted.');
byline_test_assert($orphaned['votes']['skipped'] === 1, 'It is reported as skipped.');
byline_test_assert(
    strpos(implode("\n", $orphaned['errors']), 'WordPress no longer holds') !== false,
    'The operator is told which delta votes could not be placed.'
);

// A poll that does not exist in WordPress at all is reported, not created.
$unknown_source = $delta;
$unknown_source['polls'] = [[
    'id' => 'never-imported',
    'question' => 'A poll only the source has',
    'status' => 'open',
    'created_at' => '2026-08-27 12:00:00',
]];
$unknown_source['options'] = [['id' => 'a', 'poll_id' => 'never-imported', 'label' => 'A', 'position' => 0]];
$unknown_source['votes'] = [[
    'id' => 'v-unknown',
    'poll_id' => 'never-imported',
    'option_id' => 'a',
    'voter_key' => 'voter-unknown',
    'created_at' => '2026-08-27 12:00:00',
]];

$unknown = byline_poll_import_artifact($unknown_source, ['votes_only' => true]);
byline_test_assert($unknown['polls']['failed'] === 1, 'A votes-only import will not create a poll it was told to leave alone.');
byline_test_assert($unknown['votes']['inserted'] === 0, 'Its votes are not inserted.');
byline_test_assert(byline_poll_find_post_by_public_id('never-imported') === null, 'No poll was created.');

echo "Byline poll cutover regression passed.\n";
