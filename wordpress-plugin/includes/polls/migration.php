<?php

/**
 * One-time import of poll data exported from the retired Cloudflare D1
 * database.
 *
 * The plugin never talks to Cloudflare. It consumes a plain JSON artifact whose
 * rows mirror the old D1 schema, which keeps the deployment-only export tooling
 * (and any Cloudflare credentials it needs) outside the shipped plugin.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_MIGRATION_SCHEMA_VERSION = 1;

/**
 * Accept either the D1 column names or their camelCase equivalents.
 *
 * @param array<string,mixed> $row
 * @param array<int,string> $keys
 * @return mixed
 */
function byline_poll_migration_field(array $row, array $keys, $default = '')
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $row) && $row[$key] !== null) {
            return $row[$key];
        }
    }

    return $default;
}

/**
 * Validate and normalise a migration artifact into the three D1 relations.
 *
 * @param mixed $artifact
 * @return array<string,mixed>|WP_Error
 */
function byline_poll_normalize_import_artifact($artifact)
{
    if (!is_array($artifact)) {
        return new WP_Error('byline_poll_invalid_artifact', 'The poll migration artifact must be a JSON object.');
    }

    $version = (int) byline_poll_migration_field($artifact, ['schemaVersion', 'schema_version'], BYLINE_POLL_MIGRATION_SCHEMA_VERSION);
    if ($version !== BYLINE_POLL_MIGRATION_SCHEMA_VERSION) {
        return new WP_Error('byline_poll_unsupported_artifact', 'Unsupported poll migration artifact schema version ' . $version . '.');
    }

    foreach (['polls', 'options', 'votes'] as $relation) {
        if (!isset($artifact[$relation]) || !is_array($artifact[$relation])) {
            return new WP_Error('byline_poll_invalid_artifact', 'The poll migration artifact is missing the ' . $relation . ' relation.');
        }
    }

    $polls = [];
    foreach ($artifact['polls'] as $row) {
        if (!is_array($row)) {
            continue;
        }

        $id = byline_poll_sanitize_public_id(byline_poll_migration_field($row, ['id', 'poll_id', 'pollId']));
        $question = sanitize_text_field((string) byline_poll_migration_field($row, ['question']));
        if ($id === '' || $question === '') {
            continue;
        }

        $polls[$id] = [
            'id' => $id,
            'question' => byline_poll_truncate($question, BYLINE_POLL_MAX_QUESTION),
            'status' => byline_poll_sanitize_status((string) byline_poll_migration_field($row, ['status'], BYLINE_POLL_STATUS_DRAFT)),
            'opensAt' => byline_poll_normalize_utc_datetime((string) byline_poll_migration_field($row, ['opens_at', 'opensAt'])),
            'closesAt' => byline_poll_normalize_utc_datetime((string) byline_poll_migration_field($row, ['closes_at', 'closesAt'])),
            'createdAt' => byline_poll_normalize_utc_datetime((string) byline_poll_migration_field($row, ['created_at', 'createdAt'])),
            'options' => [],
        ];
    }

    $option_rows = [];
    foreach ($artifact['options'] as $row) {
        if (!is_array($row)) {
            continue;
        }

        $id = byline_poll_sanitize_public_id(byline_poll_migration_field($row, ['id', 'option_id', 'optionId']));
        $poll_id = byline_poll_sanitize_public_id(byline_poll_migration_field($row, ['poll_id', 'pollId']));
        $label = sanitize_text_field((string) byline_poll_migration_field($row, ['label']));
        if ($id === '' || $poll_id === '' || $label === '' || !isset($polls[$poll_id])) {
            continue;
        }

        $option_rows[] = [
            'id' => $id,
            'poll_id' => $poll_id,
            'label' => byline_poll_truncate($label, BYLINE_POLL_MAX_OPTION_LABEL),
            'position' => (int) byline_poll_migration_field($row, ['position'], 0),
        ];
    }

    usort($option_rows, static function (array $left, array $right): int {
        return $left['position'] <=> $right['position'];
    });

    foreach ($option_rows as $option) {
        $polls[$option['poll_id']]['options'][] = [
            'id' => $option['id'],
            'label' => $option['label'],
            'position' => $option['position'],
        ];
    }

    // Referential correctness is enforced here rather than by foreign keys.
    // A vote whose poll or answer is not in the artifact cannot be represented
    // without orphaning it, so it is dropped and reported rather than imported.
    $option_index = [];
    foreach ($polls as $poll_id => $poll) {
        $option_index[$poll_id] = array_column($poll['options'], 'id');
    }

    $votes = [];
    $unreferenced = 0;
    $notes = [];

    foreach ($artifact['votes'] as $row) {
        if (!is_array($row)) {
            continue;
        }

        $poll_id = byline_poll_sanitize_public_id(byline_poll_migration_field($row, ['poll_id', 'pollId']));
        $option_id = byline_poll_sanitize_public_id(byline_poll_migration_field($row, ['option_id', 'optionId']));
        $voter_key = (string) byline_poll_migration_field($row, ['voter_key', 'voterKey']);
        if ($poll_id === '' || $option_id === '' || $voter_key === '' || strlen($voter_key) > 64) {
            $unreferenced++;
            $notes[] = 'Dropped a vote row with missing or oversized identifiers.';
            continue;
        }

        if (!isset($option_index[$poll_id]) || !in_array($option_id, $option_index[$poll_id], true)) {
            $unreferenced++;
            $notes[] = 'Dropped a vote for unknown poll/answer ' . $poll_id . '/' . $option_id . '.';
            continue;
        }

        $votes[] = [
            'poll_id' => $poll_id,
            'option_id' => $option_id,
            'voter_key' => $voter_key,
            'created_at' => byline_poll_normalize_utc_datetime((string) byline_poll_migration_field($row, ['created_at', 'createdAt'])),
        ];
    }

    return [
        'polls' => $polls,
        'votes' => $votes,
        'unreferenced' => $unreferenced,
        'notes' => array_values(array_unique($notes)),
    ];
}

/**
 * Refuse to import vote history under a signing secret that cannot possibly be
 * the one those votes were derived from.
 *
 * A voter_key is a one-way function of the secret. If WordPress is running on
 * the automatically generated fallback secret, every imported key is guaranteed
 * not to match what returning visitors present, so their cookies silently stop
 * working and they can vote a second time. That is a known-invalid state and is
 * blocked rather than documented against.
 *
 * The importer cannot prove that an explicitly supplied secret is the
 * historically correct one; it only rules out the case it can be certain about.
 * The secret itself is never included in the message.
 *
 * @param array<string,mixed> $normalized
 * @param array<string,mixed> $options
 * @return true|WP_Error
 */
function byline_poll_migration_secret_guard(array $normalized, array $options = [])
{
    if ($normalized['votes'] === [] || !empty($options['allow_generated_secret'])) {
        return true;
    }

    $source = byline_poll_signing_secret_source();
    if ($source !== 'generated' && $source !== 'missing') {
        return true;
    }

    return new WP_Error(
        'byline_poll_provisional_secret',
        'This artifact contains ' . count($normalized['votes']) . ' vote(s), but WordPress is using an automatically generated poll signing secret. '
        . 'Imported voter keys would never match the cookies existing visitors hold, so they could all vote again. '
        . 'Set the previous poll signing secret in wp-config.php before importing: '
        . "define( 'BYLINE_POLL_COOKIE_SECRET', '...' ); "
        . 'Confirm it with `wp byline polls secret`. '
        . 'If this site has no voter continuity to preserve, re-run with --allow-generated-secret.'
    );
}

/**
 * Source-side counts, used for the verification report.
 *
 * @param array<string,mixed> $normalized
 * @return array<string,mixed>
 */
function byline_poll_migration_source_counts(array $normalized): array
{
    $options = 0;
    $votes_by_poll = [];

    foreach ($normalized['polls'] as $poll_id => $poll) {
        $options += count($poll['options']);
        $votes_by_poll[$poll_id] = 0;
    }

    foreach ($normalized['votes'] as $vote) {
        $votes_by_poll[$vote['poll_id']] = ($votes_by_poll[$vote['poll_id']] ?? 0) + 1;
    }

    return [
        'polls' => count($normalized['polls']),
        'options' => $options,
        'votes' => count($normalized['votes']),
        'votesByPoll' => $votes_by_poll,
    ];
}

/**
 * Destination-side counts for the same set of poll ids.
 *
 * @param array<string,mixed> $normalized
 * @return array<string,mixed>
 */
function byline_poll_migration_destination_counts(array $normalized): array
{
    $polls = 0;
    $options = 0;
    $votes = 0;
    $votes_by_poll = [];

    foreach (array_keys($normalized['polls']) as $poll_id) {
        $post = byline_poll_find_post_by_public_id((string) $poll_id);
        $poll_votes = byline_poll_vote_total((string) $poll_id);
        $votes_by_poll[$poll_id] = $poll_votes;
        $votes += $poll_votes;

        if ($post instanceof WP_Post) {
            $polls++;
            $options += count(byline_poll_options((int) $post->ID));
        }
    }

    return [
        'polls' => $polls,
        'options' => $options,
        'votes' => $votes,
        'votesByPoll' => $votes_by_poll,
    ];
}

/**
 * Import a normalised artifact.
 *
 * Reruns are safe: a poll is matched by its preserved id and updated in place,
 * answer ids are preserved verbatim, and re-importing a vote hits the unique
 * (poll_id, voter_key) key and is counted as a duplicate rather than inflating
 * a total.
 *
 * @param array<string,mixed> $artifact
 * @param array<string,mixed> $options
 * @return array<string,mixed>|WP_Error
 */
function byline_poll_import_artifact(array $artifact, array $options = [])
{
    $normalized = byline_poll_normalize_import_artifact($artifact);
    if (is_wp_error($normalized)) {
        return $normalized;
    }

    $dry_run = !empty($options['dry_run']);
    $votes_only = !empty($options['votes_only']);

    // A vote is only continuity-compatible if WordPress signs with the same
    // secret the retired Worker used, so importing history under a generated
    // fallback secret is refused rather than documented against.
    $secret_guard = byline_poll_migration_secret_guard($normalized, $options);
    if (is_wp_error($secret_guard) && !$dry_run) {
        return $secret_guard;
    }

    $report = [
        'dryRun' => $dry_run,
        'votesOnly' => $votes_only,
        'polls' => ['created' => 0, 'updated' => 0, 'failed' => 0, 'unchanged' => 0],
        'options' => ['imported' => 0],
        'votes' => [
            'inserted' => 0,
            'duplicates' => 0,
            'skipped' => (int) $normalized['unreferenced'],
            'failed' => 0,
        ],
        'errors' => $normalized['notes'],
    ];

    if (is_wp_error($secret_guard)) {
        $report['errors'][] = $secret_guard->get_error_message();
    }

    // WP-CLI does not run admin_init, so storage is guaranteed here rather than
    // assumed. A dry run stays read-only.
    if (!$dry_run && !byline_poll_ensure_schema()) {
        return new WP_Error('byline_poll_no_storage', 'The poll vote table could not be created; import aborted before touching poll data.');
    }

    foreach ($normalized['polls'] as $poll_id => $poll) {
        $existing = byline_poll_find_post_by_public_id((string) $poll_id);

        // A votes-only delta deliberately never rewrites a poll's question,
        // answers, schedule, or status. That is what makes it safe to run after
        // a cutover write freeze: nothing in the source artifact can overwrite
        // the live editorial state.
        if ($votes_only) {
            if ($existing instanceof WP_Post) {
                $report['polls']['unchanged']++;
                $report['options']['imported'] += count(byline_poll_options((int) $existing->ID));
            } else {
                $report['polls']['failed']++;
                $report['errors'][] = 'Poll ' . $poll_id . ' does not exist in WordPress; its votes were skipped.';
            }
            continue;
        }

        if ($dry_run) {
            $report['polls'][$existing instanceof WP_Post ? 'updated' : 'created']++;
            $report['options']['imported'] += count($poll['options']);
            continue;
        }

        // The D1 model had no separate publication state, so an open or closed
        // poll becomes a published post and a draft poll stays a WordPress
        // draft. The domain status meta remains authoritative either way.
        $post_data = [
            'post_type' => BYLINE_POLL_POST_TYPE,
            'post_status' => $poll['status'] === BYLINE_POLL_STATUS_DRAFT ? 'draft' : 'publish',
            'post_title' => $poll['question'],
        ];

        if ($poll['createdAt'] !== '') {
            $post_data['post_date_gmt'] = $poll['createdAt'];
            $post_data['post_date'] = get_date_from_gmt($poll['createdAt']);
        }

        if ($existing instanceof WP_Post) {
            $post_data['ID'] = (int) $existing->ID;
            $post_id = wp_update_post(wp_slash($post_data), true);
        } else {
            $post_id = wp_insert_post(wp_slash($post_data), true);
        }

        if (is_wp_error($post_id) || (int) $post_id <= 0) {
            $report['polls']['failed']++;
            $report['errors'][] = 'Could not import poll ' . $poll_id . '.';
            continue;
        }

        $post_id = (int) $post_id;
        update_post_meta($post_id, BYLINE_POLL_ID_META, $poll_id);
        byline_poll_set_options($post_id, $poll['options']);
        byline_poll_set_status($post_id, $poll['status']);
        byline_poll_set_schedule($post_id, $poll['opensAt'], $poll['closesAt']);

        $report['polls'][$existing instanceof WP_Post ? 'updated' : 'created']++;
        $report['options']['imported'] += count(byline_poll_options($post_id));
    }

    foreach ($normalized['votes'] as $vote) {
        // In votes-only mode the answer must still exist in WordPress, not just
        // in the artifact, so a delta cannot resurrect a removed answer.
        if ($votes_only) {
            $post = byline_poll_find_post_by_public_id($vote['poll_id']);
            $stored = $post instanceof WP_Post ? array_column(byline_poll_options((int) $post->ID), 'id') : [];

            if (!in_array($vote['option_id'], $stored, true)) {
                $report['votes']['skipped']++;
                $report['errors'][] = 'Skipped a delta vote for an answer WordPress no longer holds: '
                    . $vote['poll_id'] . '/' . $vote['option_id'] . '.';
                continue;
            }
        }

        if ($dry_run) {
            $report['votes']['inserted']++;
            continue;
        }

        $result = byline_poll_insert_vote(
            $vote['poll_id'],
            $vote['option_id'],
            $vote['voter_key'],
            $vote['created_at']
        );

        if ($result === BYLINE_POLL_VOTE_INSERTED) {
            $report['votes']['inserted']++;
        } elseif ($result === BYLINE_POLL_VOTE_DUPLICATE) {
            $report['votes']['duplicates']++;
        } else {
            $report['votes']['failed']++;
        }
    }

    $report['source'] = byline_poll_migration_source_counts($normalized);
    $report['destination'] = $dry_run ? $report['source'] : byline_poll_migration_destination_counts($normalized);
    $report['matches'] = byline_poll_migration_counts_match($report['source'], $report['destination']);

    return $report;
}

/**
 * @param array<string,mixed> $source
 * @param array<string,mixed> $destination
 */
function byline_poll_migration_counts_match(array $source, array $destination): bool
{
    foreach (['polls', 'options', 'votes'] as $relation) {
        if ((int) $source[$relation] !== (int) $destination[$relation]) {
            return false;
        }
    }

    foreach ($source['votesByPoll'] as $poll_id => $count) {
        if ((int) $count !== (int) ($destination['votesByPoll'][$poll_id] ?? -1)) {
            return false;
        }
    }

    return true;
}

/**
 * Compare an artifact against what WordPress now holds, without writing.
 *
 * @param array<string,mixed> $artifact
 * @return array<string,mixed>|WP_Error
 */
function byline_poll_verify_artifact(array $artifact)
{
    $normalized = byline_poll_normalize_import_artifact($artifact);
    if (is_wp_error($normalized)) {
        return $normalized;
    }

    // Verification reads the vote table, and WP-CLI has not run admin_init, so
    // the schema is guaranteed here too rather than assumed.
    if (!byline_poll_ensure_schema()) {
        return new WP_Error('byline_poll_no_storage', 'The poll vote table is missing and could not be created; nothing to verify against.');
    }

    $source = byline_poll_migration_source_counts($normalized);
    $destination = byline_poll_migration_destination_counts($normalized);

    return [
        'source' => $source,
        'destination' => $destination,
        'unreferenced' => (int) $normalized['unreferenced'],
        'errors' => $normalized['notes'],
        'matches' => byline_poll_migration_counts_match($source, $destination),
    ];
}

/**
 * @param array<string,mixed> $report
 * @return array<int,string>
 */
function byline_poll_migration_report_lines(array $report): array
{
    $lines = [];
    $source = $report['source'] ?? ['polls' => 0, 'options' => 0, 'votes' => 0, 'votesByPoll' => []];
    $destination = $report['destination'] ?? $source;

    foreach (['polls', 'options', 'votes'] as $relation) {
        $lines[] = sprintf(
            '%-8s source %6d  destination %6d  %s',
            $relation,
            (int) $source[$relation],
            (int) $destination[$relation],
            (int) $source[$relation] === (int) $destination[$relation] ? 'ok' : 'MISMATCH'
        );
    }

    foreach ($source['votesByPoll'] as $poll_id => $count) {
        $actual = (int) ($destination['votesByPoll'][$poll_id] ?? -1);
        $lines[] = sprintf(
            '  poll %-24s source %6d  destination %6d  %s',
            (string) $poll_id,
            (int) $count,
            $actual,
            (int) $count === $actual ? 'ok' : 'MISMATCH'
        );
    }

    if (!empty($report['votesOnly'])) {
        $lines[] = 'mode     votes-only (poll questions, answers, schedules, and statuses left untouched)';
    }

    foreach ((array) ($report['errors'] ?? []) as $error) {
        $lines[] = 'note: ' . (string) $error;
    }

    return $lines;
}
