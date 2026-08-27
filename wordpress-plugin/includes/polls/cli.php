<?php

/**
 * WP-CLI entry points for poll storage and the one-time D1 migration.
 *
 * The commands are thin wrappers: all behavior lives in migration.php and
 * schema.php so it stays testable without WP-CLI.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('WP_CLI') || !WP_CLI) {
    return;
}

class Byline_Poll_CLI_Command
{
    /**
     * Create or update the poll vote table.
     *
     * Useful on multisite, where plugin activation only reaches one site.
     */
    public function install_schema($args, $assoc_args)
    {
        if (!byline_poll_ensure_schema()) {
            WP_CLI::error('The poll vote table could not be created.');
        }

        WP_CLI::success('Poll vote storage is installed at ' . byline_poll_votes_table() . '.');
    }

    /**
     * Report whether a poll signing secret is configured, and from where.
     *
     * Never prints the secret.
     */
    public function secret($args, $assoc_args)
    {
        WP_CLI::line('Poll signing secret source: ' . byline_poll_signing_secret_source());
    }

    /**
     * Import a poll migration artifact exported from Cloudflare D1.
     *
     * ## OPTIONS
     *
     * <file>
     * : Path to the JSON artifact.
     *
     * [--dry-run]
     * : Report what would be imported without writing.
     *
     * [--votes-only]
     * : Import vote rows only, leaving every poll question, answer, schedule,
     * and status exactly as WordPress holds it. Use this for the final delta
     * after a cutover write freeze.
     *
     * [--allow-generated-secret]
     * : Import vote history even though WordPress is using an automatically
     * generated poll signing secret. Only for a site with no voter continuity
     * to preserve; existing visitors will be able to vote again.
     */
    public function import($args, $assoc_args)
    {
        $artifact = $this->read_artifact($args[0] ?? '');
        $dry_run = !empty($assoc_args['dry-run']);

        // admin_init has not run under WP-CLI, so storage is guaranteed before
        // any poll data is touched rather than assumed to already exist.
        if (!$dry_run) {
            $this->ensure_schema();
        }

        $report = byline_poll_import_artifact($artifact, [
            'dry_run' => $dry_run,
            'votes_only' => !empty($assoc_args['votes-only']),
            'allow_generated_secret' => !empty($assoc_args['allow-generated-secret']),
        ]);

        if (is_wp_error($report)) {
            WP_CLI::error($report->get_error_message());
        }

        WP_CLI::line(sprintf(
            'polls created %d, updated %d, unchanged %d, failed %d',
            $report['polls']['created'],
            $report['polls']['updated'],
            $report['polls']['unchanged'],
            $report['polls']['failed']
        ));
        WP_CLI::line(sprintf(
            'votes inserted %d, already present %d, skipped %d, failed %d',
            $report['votes']['inserted'],
            $report['votes']['duplicates'],
            $report['votes']['skipped'],
            $report['votes']['failed']
        ));

        foreach (byline_poll_migration_report_lines($report) as $line) {
            WP_CLI::line($line);
        }

        if (empty($report['matches'])) {
            WP_CLI::warning('Source and destination counts do not match yet. Re-run verification before retiring the source database.');
            return;
        }

        WP_CLI::success('Poll migration counts match.');
    }

    /**
     * Compare a poll migration artifact against current WordPress storage.
     *
     * ## OPTIONS
     *
     * <file>
     * : Path to the JSON artifact.
     */
    public function verify($args, $assoc_args)
    {
        $artifact = $this->read_artifact($args[0] ?? '');
        $this->ensure_schema();
        $report = byline_poll_verify_artifact($artifact);

        if (is_wp_error($report)) {
            WP_CLI::error($report->get_error_message());
        }

        foreach (byline_poll_migration_report_lines($report) as $line) {
            WP_CLI::line($line);
        }

        if (empty($report['matches'])) {
            WP_CLI::error('Poll migration verification failed.');
        }

        WP_CLI::success('Poll migration verification passed.');
    }

    private function ensure_schema(): void
    {
        if (!byline_poll_ensure_schema()) {
            WP_CLI::error('The poll vote table is missing and could not be created. Run `wp byline polls install-schema` and check database privileges.');
        }
    }

    private function read_artifact(string $path): array
    {
        if ($path === '' || !is_readable($path)) {
            WP_CLI::error('Provide a readable poll migration artifact path.');
        }

        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            WP_CLI::error('The poll migration artifact is not valid JSON.');
        }

        return $decoded;
    }
}

WP_CLI::add_command('byline polls', 'Byline_Poll_CLI_Command');
