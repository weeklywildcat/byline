<?php

/**
 * Migration secret fail-safe.
 *
 * A voter_key is a one-way function of the poll signing secret. Importing vote
 * history while WordPress runs on its automatically generated fallback secret is
 * guaranteed to produce keys that never match the cookies existing visitors
 * hold, so every one of them could vote again. That case is refused rather than
 * merely documented.
 */

// No signing secret is configured anywhere for this suite.
define('BYLINE_POLL_TEST_WITHOUT_SECRET', true);

require __DIR__ . '/helpers/poll-test-harness.php';

global $wpdb, $byline_test_posts;

byline_register_poll_post_type();

byline_test_assert(!defined('BYLINE_POLL_COOKIE_SECRET'), 'This suite must run with no configured secret.');
byline_test_assert(
    in_array(byline_poll_signing_secret_source(), ['missing', 'generated'], true),
    'This suite needs the fallback secret path; unset POLL_COOKIE_SECRET / VOTER_COOKIE_SECRET in the environment.'
);

$artifact = json_decode((string) file_get_contents(__DIR__ . '/fixtures/d1-polls-export.json'), true);

// ---------------------------------------------------------------------------
// Refused before a secret has even been generated
// ---------------------------------------------------------------------------

byline_test_assert(byline_poll_signing_secret_source() === 'missing', 'No secret has been generated yet.');

$refused = byline_poll_import_artifact($artifact);
byline_test_assert(is_wp_error($refused), 'Importing vote history without a configured secret is refused.');
byline_test_assert($refused->get_error_code() === 'byline_poll_provisional_secret', 'The refusal has its own error code.');
byline_test_assert($byline_test_posts === [], 'Nothing was written.');
byline_test_assert($wpdb->rows === [], 'No vote was written.');

// ---------------------------------------------------------------------------
// Refused once the fallback secret exists, with a message an operator can act on
// ---------------------------------------------------------------------------

$generated = byline_poll_signing_secret();
byline_test_assert($generated !== '', 'A fallback secret is generated on demand.');
byline_test_assert(byline_poll_signing_secret_source() === 'generated', 'Its source is reported as generated.');

$refused = byline_poll_import_artifact($artifact);
byline_test_assert(is_wp_error($refused), 'Importing vote history under the generated secret is refused.');

$message = $refused->get_error_message();
byline_test_assert(strpos($message, 'BYLINE_POLL_COOKIE_SECRET') !== false, 'The message names the constant to set.');
byline_test_assert(strpos($message, 'wp byline polls secret') !== false, 'The message says how to confirm the change.');
byline_test_assert(strpos($message, '--allow-generated-secret') !== false, 'The message names the deliberate override.');
byline_test_assert(strpos($message, '6 vote') !== false, 'The message says how much history is at stake.');
byline_test_assert(strpos($message, $generated) === false, 'The message must never contain the secret.');
byline_test_assert(strpos($message, 'automatically generated') !== false, 'The message explains why it refused.');
byline_test_assert($wpdb->rows === [], 'A refused import writes nothing.');
byline_test_assert($byline_test_posts === [], 'A refused import creates no polls.');

// ---------------------------------------------------------------------------
// A dry run is read-only, so it is allowed and still reports the problem
// ---------------------------------------------------------------------------

$dry = byline_poll_import_artifact($artifact, ['dry_run' => true]);
byline_test_assert(!is_wp_error($dry), 'A dry run is permitted so counts can be checked before configuring the secret.');
byline_test_assert($dry['polls']['created'] === 3, 'The dry run still reports what would be imported.');
byline_test_assert(
    strpos(implode("\n", $dry['errors']), 'automatically generated') !== false,
    'The dry run warns that a real import would be refused.'
);
byline_test_assert($wpdb->rows === [] && $byline_test_posts === [], 'The dry run wrote nothing.');

// ---------------------------------------------------------------------------
// An artifact with no vote history has no continuity to lose
// ---------------------------------------------------------------------------

$definitions_only = $artifact;
$definitions_only['votes'] = [];

$allowed = byline_poll_import_artifact($definitions_only);
byline_test_assert(!is_wp_error($allowed), 'Importing poll definitions alone is not blocked.');
byline_test_assert($allowed['polls']['created'] === 3, 'The polls are created.');
byline_test_assert($allowed['votes']['inserted'] === 0, 'There were no votes to import.');
byline_test_assert(byline_poll_find_post_by_public_id('website-coverage') instanceof WP_Post, 'Poll ids are still preserved.');

// ---------------------------------------------------------------------------
// A votes-only delta is all history, so it is refused too
// ---------------------------------------------------------------------------

byline_test_assert(
    is_wp_error(byline_poll_import_artifact($artifact, ['votes_only' => true])),
    'A votes-only delta is refused under the generated secret as well.'
);
byline_test_assert($wpdb->rows === [], 'Still nothing written.');

// ---------------------------------------------------------------------------
// The deliberate override, for a site with no voter continuity to preserve
// ---------------------------------------------------------------------------

$overridden = byline_poll_import_artifact($artifact, ['allow_generated_secret' => true]);
byline_test_assert(!is_wp_error($overridden), 'An explicit override imports anyway.');
byline_test_assert($overridden['votes']['inserted'] === 6, 'The override imports the full history.');
byline_test_assert($overridden['matches'] === true, 'The override still verifies.');

// ---------------------------------------------------------------------------
// The guard itself only rules out the case it can be certain about
// ---------------------------------------------------------------------------

$normalized = byline_poll_normalize_import_artifact($artifact);
byline_test_assert(
    is_wp_error(byline_poll_migration_secret_guard($normalized)),
    'The guard refuses a generated secret.'
);
byline_test_assert(
    byline_poll_migration_secret_guard(['votes' => []]) === true,
    'The guard has nothing to protect when there are no votes.'
);
byline_test_assert(
    byline_poll_migration_secret_guard($normalized, ['allow_generated_secret' => true]) === true,
    'The guard yields to an explicit override.'
);

echo "Byline poll migration secret regression passed.\n";
