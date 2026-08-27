<?php

/**
 * Byline poll vote storage schema.
 *
 * Poll definitions are WordPress content (see post-type.php); individual votes
 * are high-volume transactional rows and therefore live in a dedicated table
 * rather than in posts or postmeta.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_POLL_VOTES_TABLE_SUFFIX = 'byline_poll_votes';
const BYLINE_POLL_SCHEMA_VERSION_OPTION = 'byline_poll_schema_version';
const BYLINE_POLL_SCHEMA_VERSION = 1;

/**
 * Vote rows are scoped to the site, matching the poll posts that own them, so
 * the table follows $wpdb->prefix rather than the network base prefix.
 */
function byline_poll_votes_table(): string
{
    global $wpdb;

    return $wpdb->prefix . BYLINE_POLL_VOTES_TABLE_SUFFIX;
}

/**
 * dbDelta-compatible schema.
 *
 * UNIQUE (poll_id, voter_key) is the authoritative duplicate-vote guard; the
 * application never decides duplication with a read-then-write. Column widths
 * keep the unique key inside the smallest historical InnoDB index limit
 * (2 x 64 x 4 bytes = 512, under 767) so it also installs on older hosts.
 *
 * Foreign keys are deliberately omitted: MyISAM tables, mixed engines, and
 * managed hosts make them unreliable in WordPress. Referential correctness is
 * enforced in application code instead.
 */
function byline_poll_votes_table_sql(): string
{
    global $wpdb;

    $table = byline_poll_votes_table();
    $charset_collate = method_exists($wpdb, 'get_charset_collate') ? $wpdb->get_charset_collate() : '';

    return "CREATE TABLE {$table} (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    poll_id varchar(64) NOT NULL,
    option_id varchar(64) NOT NULL,
    voter_key varchar(64) NOT NULL,
    created_at datetime NOT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY poll_voter (poll_id,voter_key),
    KEY poll (poll_id),
    KEY poll_option (poll_id,option_id)
) {$charset_collate}";
}

function byline_poll_votes_table_exists(): bool
{
    global $wpdb;

    $table = byline_poll_votes_table();

    return (string) $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
}

function byline_poll_install_schema(): void
{
    if (!function_exists('dbDelta')) {
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    }

    dbDelta(byline_poll_votes_table_sql());
    update_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, BYLINE_POLL_SCHEMA_VERSION, false);
}

/**
 * Schema installation happens on activation and on the first admin request
 * after an upgrade. It deliberately never runs from a public poll request:
 * anonymous traffic must not be able to trigger DDL.
 *
 * The stored version is the only thing checked, so a routine admin request costs
 * one option read rather than a SHOW TABLES. That also covers the cases
 * activation hooks miss, such as a per-site install under network activation:
 * those sites have no stored version yet. A table dropped out from under a
 * current version is surfaced by the Polls screens and repaired with
 * `wp byline polls install-schema`.
 */
function byline_poll_maybe_upgrade_schema(): void
{
    if ((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) >= BYLINE_POLL_SCHEMA_VERSION) {
        return;
    }

    byline_poll_install_schema();
}

/**
 * Guarantee poll storage before a privileged caller touches poll data.
 *
 * WP-CLI does not fire admin_init, so a migration run against freshly deployed
 * plugin files cannot assume the upgrade path has happened yet. Unlike
 * byline_poll_maybe_upgrade_schema() this also confirms the table itself is
 * present, because a migration is exactly the moment to find out that it is not.
 *
 * Only ever called from CLI and activation. Public poll requests never reach it,
 * so anonymous traffic still cannot trigger DDL.
 */
function byline_poll_ensure_schema(): bool
{
    if ((int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) < BYLINE_POLL_SCHEMA_VERSION
        || !byline_poll_votes_table_exists()) {
        byline_poll_install_schema();
    }

    return byline_poll_votes_table_exists();
}
add_action('admin_init', 'byline_poll_maybe_upgrade_schema');

/**
 * Operator-facing poll storage health.
 *
 * Reports whether storage and a signing secret exist and where the secret was
 * configured from. It never includes the secret itself, and it never includes
 * voter keys.
 *
 * @return array<string,mixed>
 */
function byline_poll_diagnostics(): array
{
    $ready = byline_poll_votes_table_exists();

    return [
        'storageReady' => $ready,
        'schemaVersion' => (int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0),
        'secretSource' => byline_poll_signing_secret_source(),
        'recordedVotes' => $ready ? array_sum(byline_poll_all_vote_totals()) : 0,
    ];
}
