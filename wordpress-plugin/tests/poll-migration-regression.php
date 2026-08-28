<?php

/**
 * One-time D1 -> WordPress poll migration: identifier preservation, counts,
 * idempotency, and the verification report.
 */

require __DIR__ . '/helpers/poll-test-harness.php';

global $wpdb, $byline_test_posts;

byline_register_poll_post_type();

$artifact = json_decode((string) file_get_contents(__DIR__ . '/fixtures/d1-polls-export.json'), true);
byline_test_assert(is_array($artifact), 'The D1 fixture must be readable.');

// ---------------------------------------------------------------------------
// Artifact validation
// ---------------------------------------------------------------------------

byline_test_assert(
    is_wp_error(byline_poll_normalize_import_artifact('not an object')),
    'A non-object artifact is rejected.'
);
byline_test_assert(
    is_wp_error(byline_poll_normalize_import_artifact(['schemaVersion' => 99, 'polls' => [], 'options' => [], 'votes' => []])),
    'An unsupported artifact schema version is rejected.'
);
byline_test_assert(
    is_wp_error(byline_poll_normalize_import_artifact(['schemaVersion' => 1, 'polls' => []])),
    'An artifact missing a relation is rejected.'
);

$normalized = byline_poll_normalize_import_artifact($artifact);
byline_test_assert(!is_wp_error($normalized), 'The fixture normalises cleanly.');
byline_test_assert(array_keys($normalized['polls']) === ['website-coverage', 'spirit-week', 'fall-sport'], 'Poll ids survive normalisation verbatim.');
byline_test_assert(
    array_column($normalized['polls']['website-coverage']['options'], 'id') === ['news', 'sports', 'features'],
    'Answer ids and their order survive normalisation verbatim.'
);
byline_test_assert($normalized['unreferenced'] === 2, 'Votes that cannot be represented are reported, not orphaned.');
byline_test_assert(count($normalized['votes']) === 6, 'Only referentially sound votes are imported.');

// ---------------------------------------------------------------------------
// Dry run writes nothing
// ---------------------------------------------------------------------------

$dry = byline_poll_import_artifact($artifact, ['dry_run' => true]);
byline_test_assert(!is_wp_error($dry), 'A dry run succeeds.');
byline_test_assert($dry['dryRun'] === true, 'A dry run reports itself.');
byline_test_assert($dry['polls']['created'] === 3, 'A dry run reports the polls it would create.');
byline_test_assert($byline_test_posts === [], 'A dry run creates no posts.');
byline_test_assert($wpdb->rows === [], 'A dry run writes no votes.');

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

$report = byline_poll_import_artifact($artifact);
byline_test_assert(!is_wp_error($report), 'The import succeeds.');
byline_test_assert($report['polls']['created'] === 3, 'Every poll is created.');
byline_test_assert($report['polls']['failed'] === 0, 'No poll fails to import.');
byline_test_assert($report['options']['imported'] === 7, 'Every answer belonging to an imported poll is created.');
byline_test_assert($report['votes']['inserted'] === 6, 'Every sound vote is inserted.');
byline_test_assert($report['votes']['duplicates'] === 0, 'A first import finds no duplicates.');
byline_test_assert($report['votes']['skipped'] === 2, 'Unrepresentable votes are reported as skipped.');
byline_test_assert($report['votes']['failed'] === 0, 'No vote insert fails.');
byline_test_assert($report['matches'] === true, 'Source and destination counts match after import.');

// Poll ids are preserved, so existing cookies and vote rows keep resolving.
$coverage = byline_poll_find_post_by_public_id('website-coverage');
byline_test_assert($coverage instanceof WP_Post, 'The legacy poll id resolves to a WordPress poll.');
byline_test_assert(byline_poll_public_id((int) $coverage->ID) === 'website-coverage', 'The legacy poll id is stored verbatim.');

$record = byline_poll_record($coverage);
byline_test_assert($record['question'] === 'What should Weekly Wildcat cover more of next?', 'The question is preserved.');
byline_test_assert($record['status'] === BYLINE_POLL_STATUS_OPEN, 'An open D1 poll stays open.');
byline_test_assert(array_column($record['options'], 'id') === ['news', 'sports', 'features'], 'Legacy answer ids are preserved in order.');
byline_test_assert(array_column($record['options'], 'label') === ['More school news', 'More sports coverage', 'More student features'], 'Answer labels are preserved.');
byline_test_assert($record['createdAt'] === '2026-08-01 09:00:00', 'The creation timestamp is preserved.');
byline_test_assert($coverage->post_status === 'publish', 'An open poll becomes a published post.');

$spirit = byline_poll_record(byline_poll_find_post_by_public_id('spirit-week'));
byline_test_assert($spirit['status'] === BYLINE_POLL_STATUS_CLOSED, 'A closed D1 poll stays closed.');
byline_test_assert($spirit['opensAt'] === '2026-08-10 00:00:00', 'An ISO-8601 opening time is preserved as UTC.');
byline_test_assert($spirit['closesAt'] === '2026-08-17 00:00:00', 'A closing time is preserved as UTC.');

$fall = byline_poll_find_post_by_public_id('fall-sport');
byline_test_assert($fall->post_status === 'draft', 'A drafted D1 poll becomes a WordPress draft.');
byline_test_assert(byline_poll_status((int) $fall->ID) === BYLINE_POLL_STATUS_DRAFT, 'A drafted D1 poll is not open to voting.');

// Vote rows are preserved exactly.
byline_test_assert(count($wpdb->rows) === 6, 'Every imported vote is one row.');
byline_test_assert(byline_poll_vote_total('website-coverage') === 4, 'Per-poll totals are preserved.');
byline_test_assert(byline_poll_vote_total('spirit-week') === 2, 'Per-poll totals are preserved for every poll.');
byline_test_assert(byline_poll_option_vote_count('website-coverage', 'sports') === 2, 'Per-answer totals are preserved.');

$preserved = null;
foreach ($wpdb->rows as $row) {
    if ($row['voter_key'] === '0ZtYMhz_g4Q9DFkprjzF61ldOqq36LaEiwJx5dmAICg') {
        $preserved = $row;
    }
}
byline_test_assert(is_array($preserved), 'Voter keys are preserved verbatim so returning voters stay recognised.');
byline_test_assert($preserved['created_at'] === '2026-08-02 10:00:00', 'Vote timestamps are preserved.');
byline_test_assert($preserved['poll_id'] === 'website-coverage' && $preserved['option_id'] === 'news', 'A vote keeps its poll and answer.');

// The same voter key may appear in two different polls.
$shared = array_values(array_filter($wpdb->rows, static function (array $row): bool {
    return $row['voter_key'] === 'voter-key-two';
}));
byline_test_assert(count($shared) === 2, 'A voter who answered two polls keeps both votes.');

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

$verification = byline_poll_verify_artifact($artifact);
byline_test_assert($verification['matches'] === true, 'Verification passes after a clean import.');
byline_test_assert($verification['source']['polls'] === 3 && $verification['destination']['polls'] === 3, 'Poll counts are compared.');
byline_test_assert($verification['source']['options'] === 7 && $verification['destination']['options'] === 7, 'Answer counts are compared.');
byline_test_assert($verification['source']['votes'] === 6 && $verification['destination']['votes'] === 6, 'Vote counts are compared.');
byline_test_assert($verification['source']['votesByPoll']['website-coverage'] === 4, 'Per-poll totals are part of verification.');
byline_test_assert($verification['unreferenced'] === 2, 'Verification still reports what the source could not represent.');

$lines = byline_poll_migration_report_lines($verification);
byline_test_assert(strpos(implode("\n", $lines), 'MISMATCH') === false, 'A passing verification reports no mismatch.');
byline_test_assert(strpos(implode("\n", $lines), 'poll website-coverage') !== false, 'The report lists per-poll totals.');

// A missing vote is detected.
array_pop($wpdb->rows);
$short = byline_poll_verify_artifact($artifact);
byline_test_assert($short['matches'] === false, 'A missing vote fails verification.');
byline_test_assert(strpos(implode("\n", byline_poll_migration_report_lines($short)), 'MISMATCH') !== false, 'The report names the mismatch.');

// ---------------------------------------------------------------------------
// Reruns are safe
// ---------------------------------------------------------------------------

$rerun = byline_poll_import_artifact($artifact);
byline_test_assert($rerun['polls']['created'] === 0, 'A rerun creates no additional polls.');
byline_test_assert($rerun['polls']['updated'] === 3, 'A rerun updates the polls it already imported.');
byline_test_assert($rerun['votes']['inserted'] === 1, 'A rerun re-inserts only the vote that was missing.');
byline_test_assert($rerun['votes']['duplicates'] === 5, 'Votes already present are recognised, not re-counted.');
byline_test_assert($rerun['matches'] === true, 'A rerun restores matching counts.');

$twice = byline_poll_import_artifact($artifact);
byline_test_assert($twice['votes']['inserted'] === 0, 'A third import inserts nothing.');
byline_test_assert($twice['votes']['duplicates'] === 6, 'Every vote is already present.');
byline_test_assert(byline_poll_vote_total('website-coverage') === 4, 'Repeated imports cannot inflate a poll total.');
byline_test_assert(count($wpdb->rows) === 6, 'Repeated imports cannot duplicate vote rows.');
byline_test_assert(
    count(get_posts(['post_type' => BYLINE_POLL_POST_TYPE, 'post_status' => 'any', 'numberposts' => 0])) === 3,
    'Repeated imports cannot duplicate poll posts.'
);

// An edited answer label is refreshed without disturbing identity or votes.
byline_test_assert(
    array_column(byline_poll_options((int) $coverage->ID), 'id') === ['news', 'sports', 'features'],
    'Answer ids stay stable across reruns.'
);

// A full repair import must not erase an answer that was added locally and has
// already received a vote after the export was generated.
$live_option_id = 'local-live';
$live_options = byline_poll_options((int) $coverage->ID);
$live_options[] = ['id' => $live_option_id, 'label' => 'Local answer', 'position' => count($live_options)];
byline_poll_set_options((int) $coverage->ID, $live_options);
byline_test_assert(
    byline_poll_insert_vote('website-coverage', $live_option_id, 'post-export-voter') === BYLINE_POLL_VOTE_INSERTED,
    'A locally added answer can receive a vote.'
);

$repair = byline_poll_import_artifact($artifact);
$repair_ids = array_column(byline_poll_options((int) $coverage->ID), 'id');
byline_test_assert(in_array($live_option_id, $repair_ids, true), 'A full import retains a locally voted answer.');
byline_test_assert(byline_poll_option_vote_count('website-coverage', $live_option_id) === 1, 'A full import does not orphan a locally voted answer.');
byline_test_assert(
    strpos(implode("\n", $repair['errors']), 'retained answer(s) with existing votes') !== false,
    'A retained voted answer is surfaced in the migration report.'
);

echo "Byline poll migration regression passed.\n";
