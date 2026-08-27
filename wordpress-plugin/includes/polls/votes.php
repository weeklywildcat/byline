<?php

/**
 * Vote reads and writes against the dedicated Byline poll vote table.
 *
 * Every statement in this file is parameterised through $wpdb->prepare and no
 * caller outside it builds poll SQL.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_VOTE_INSERTED = 'inserted';
const BYLINE_POLL_VOTE_DUPLICATE = 'duplicate';
const BYLINE_POLL_VOTE_FAILED = 'failed';

/**
 * MySQL duplicate-key error number. Used in preference to matching error text
 * so an unrelated constraint or connection failure is never reported to a
 * voter as "already voted".
 */
const BYLINE_POLL_MYSQL_DUPLICATE_ENTRY = 1062;

/**
 * Decide whether the last $wpdb failure was a unique-key violation.
 *
 * The driver error number is authoritative when it is reachable; the textual
 * fallback is deliberately narrow (an explicit 1062 or a "Duplicate entry"
 * prefix) rather than the historical "anything mentioning a constraint".
 */
function byline_poll_last_error_is_duplicate(): bool
{
    global $wpdb;

    $handle = isset($wpdb->dbh) ? $wpdb->dbh : null;
    if ($handle instanceof mysqli) {
        $errno = 0;
        try {
            $errno = (int) mysqli_errno($handle);
        } catch (Throwable $exception) {
            $errno = 0;
        }

        if ($errno > 0) {
            return $errno === BYLINE_POLL_MYSQL_DUPLICATE_ENTRY;
        }
    }

    $error = isset($wpdb->last_error) ? (string) $wpdb->last_error : '';
    if ($error === '') {
        return false;
    }

    return stripos($error, 'Duplicate entry') !== false
        || strpos($error, (string) BYLINE_POLL_MYSQL_DUPLICATE_ENTRY) === 0;
}

/**
 * Record one vote.
 *
 * The insert is attempted unconditionally: the UNIQUE (poll_id, voter_key)
 * index decides whether this voter has already answered, so two concurrent
 * requests cannot both succeed.
 */
function byline_poll_insert_vote(string $poll_id, string $option_id, string $voter_key, ?string $created_at = null): string
{
    global $wpdb;

    $suppressed = $wpdb->suppress_errors(true);
    $inserted = $wpdb->insert(
        byline_poll_votes_table(),
        [
            'poll_id' => $poll_id,
            'option_id' => $option_id,
            'voter_key' => $voter_key,
            'created_at' => $created_at !== null && $created_at !== '' ? $created_at : byline_poll_now_utc(),
        ],
        ['%s', '%s', '%s', '%s']
    );
    $duplicate = $inserted ? false : byline_poll_last_error_is_duplicate();
    $wpdb->suppress_errors($suppressed);

    if ($inserted) {
        return BYLINE_POLL_VOTE_INSERTED;
    }

    return $duplicate ? BYLINE_POLL_VOTE_DUPLICATE : BYLINE_POLL_VOTE_FAILED;
}

function byline_poll_vote_total(string $poll_id): int
{
    global $wpdb;

    return (int) $wpdb->get_var(
        $wpdb->prepare('SELECT COUNT(*) FROM ' . byline_poll_votes_table() . ' WHERE poll_id = %s', $poll_id)
    );
}

/**
 * @return array<string,int> option id => vote count
 */
function byline_poll_option_vote_counts(string $poll_id): array
{
    global $wpdb;

    $rows = $wpdb->get_results(
        $wpdb->prepare(
            'SELECT option_id, COUNT(*) AS votes FROM ' . byline_poll_votes_table() . ' WHERE poll_id = %s GROUP BY option_id',
            $poll_id
        ),
        ARRAY_A
    );

    $counts = [];
    foreach (is_array($rows) ? $rows : [] as $row) {
        $counts[(string) ($row['option_id'] ?? '')] = (int) ($row['votes'] ?? 0);
    }

    return $counts;
}

function byline_poll_option_vote_count(string $poll_id, string $option_id): int
{
    global $wpdb;

    return (int) $wpdb->get_var(
        $wpdb->prepare(
            'SELECT COUNT(*) FROM ' . byline_poll_votes_table() . ' WHERE poll_id = %s AND option_id = %s',
            $poll_id,
            $option_id
        )
    );
}

/**
 * Vote totals for every poll that has at least one vote, for the admin list
 * table. One query rather than one per row.
 *
 * @return array<string,int>
 */
function byline_poll_all_vote_totals(): array
{
    global $wpdb;

    $rows = $wpdb->get_results(
        'SELECT poll_id, COUNT(*) AS votes FROM ' . byline_poll_votes_table() . ' GROUP BY poll_id',
        ARRAY_A
    );

    $totals = [];
    foreach (is_array($rows) ? $rows : [] as $row) {
        $totals[(string) ($row['poll_id'] ?? '')] = (int) ($row['votes'] ?? 0);
    }

    return $totals;
}

/**
 * Permanently remove a poll's vote history. Only reachable from the deliberate
 * "reset votes" action and from permanently deleting the poll itself.
 */
function byline_poll_delete_votes(string $poll_id): int
{
    global $wpdb;

    $deleted = $wpdb->delete(byline_poll_votes_table(), ['poll_id' => $poll_id], ['%s']);

    return is_numeric($deleted) ? (int) $deleted : 0;
}

function byline_poll_now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}
