<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Installation and upgrade coordination for Byline.
 *
 * WordPress only calls an activation hook when a plugin is activated. Files can
 * also be replaced by an updater, network activation can skip a site's
 * activation callback, and WP-CLI does not run admin_init. Keeping the steps
 * independent lets each request repair exactly the resource it needs without
 * rerunning unrelated migrations.
 */
const BYLINE_CORE_SCHEMA_VERSION_OPTION = 'byline_core_schema_version';
const BYLINE_CORE_SCHEMA_VERSION = 1;
const BYLINE_INTERNAL_SECRETS_VERSION_OPTION = 'byline_internal_secrets_version';
const BYLINE_INTERNAL_SECRETS_VERSION = 1;
const BYLINE_UPGRADE_FAILURE_OPTION = 'byline_upgrade_failure';
const BYLINE_UPGRADE_LAST_SUCCESS_OPTION = 'byline_upgrade_last_success';
const BYLINE_REWRITE_FLUSH_NEEDED_OPTION = 'byline_rewrite_flush_needed';
const BYLINE_REWRITE_VERSION_OPTION = 'byline_rewrite_version';
const BYLINE_REWRITE_VERSION = 1;

/**
 * @return array<string,array<string,mixed>>
 */
function byline_upgrade_steps(): array
{
    return [
        'core' => [
            'label' => 'core configuration',
            'option' => BYLINE_CORE_SCHEMA_VERSION_OPTION,
            'version' => BYLINE_CORE_SCHEMA_VERSION,
            'callback' => 'byline_upgrade_core',
        ],
        'capabilities' => [
            'label' => 'administrator capabilities',
            'option' => BYLINE_CAPABILITIES_VERSION_OPTION,
            'version' => BYLINE_CAPABILITIES_VERSION,
            'callback' => 'byline_upgrade_capabilities',
        ],
        'polls' => [
            'label' => 'poll database schema',
            'option' => BYLINE_POLL_SCHEMA_VERSION_OPTION,
            'version' => BYLINE_POLL_SCHEMA_VERSION,
            'callback' => 'byline_upgrade_polls',
        ],
        'secrets' => [
            'label' => 'internal secrets',
            'option' => BYLINE_INTERNAL_SECRETS_VERSION_OPTION,
            'version' => BYLINE_INTERNAL_SECRETS_VERSION,
            'callback' => 'byline_upgrade_secrets',
        ],
        'sports' => [
            'label' => 'sports configuration',
            'option' => BYLINE_SPORTS_TEAMS_MIGRATION_OPTION,
            'version' => BYLINE_SPORTS_TEAMS_MIGRATION_VERSION,
            'callback' => 'byline_upgrade_sports',
        ],
        'rosterIdentities' => [
            'label' => 'roster identities',
            'option' => BYLINE_ROSTER_IDENTITIES_VERSION_OPTION,
            'version' => BYLINE_ROSTER_IDENTITIES_VERSION,
            'callback' => 'byline_upgrade_roster_identities',
        ],
        'pages' => [
            'label' => 'publication pages',
            'option' => BYLINE_WEEKLY_PAGE_MIGRATION_OPTION,
            'version' => BYLINE_WEEKLY_PAGE_MIGRATION_VERSION,
            'callback' => 'byline_upgrade_pages',
        ],
    ];
}

function byline_upgrade_core(): bool
{
    byline_seed_publication_config();

    return get_option(BYLINE_PUBLICATION_OPTION, null) !== null
        && get_option(BYLINE_PUBLICATION_REVISION_OPTION, null) !== null;
}

function byline_upgrade_capabilities(): bool
{
    if (!function_exists('byline_add_administrator_capabilities')) {
        return false;
    }

    return byline_add_administrator_capabilities();
}

function byline_upgrade_polls(): bool
{
    return function_exists('byline_poll_ensure_schema') && byline_poll_ensure_schema();
}

function byline_upgrade_secrets(): bool
{
    if (!function_exists('byline_poll_signing_secret') || !function_exists('byline_poll_signing_secret_source')) {
        return false;
    }

    byline_poll_signing_secret();

    return byline_poll_signing_secret_source() !== 'missing';
}

function byline_upgrade_sports(): bool
{
    if (!function_exists('byline_migrate_sports_teams')) {
        return false;
    }

    return byline_migrate_sports_teams();
}

function byline_upgrade_roster_identities(): bool
{
    return function_exists('byline_migrate_roster_identities')
        && byline_migrate_roster_identities();
}

function byline_upgrade_pages(): bool
{
    // The controlled page seed is intentionally only for the historical
    // Weekly Wildcat installation. Generic publications must not receive
    // sample editorial content as a side effect of activation.
    if (!byline_is_legacy_weekly_wildcat_installation()) {
        return true;
    }

    if (!function_exists('byline_migrate_weekly_wildcat_pages')) {
        return false;
    }

    return byline_migrate_weekly_wildcat_pages()
        && (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0) >= BYLINE_WEEKLY_PAGE_MIGRATION_VERSION;
}

function byline_upgrade_failure_message(string $step): string
{
    $messages = [
        'core' => 'Byline core configuration could not be upgraded.',
        'capabilities' => 'Byline administrator capabilities could not be installed.',
        'polls' => 'Poll database schema could not be upgraded.',
        'secrets' => 'Byline internal secrets could not be initialized.',
        'sports' => 'Sports configuration could not be upgraded.',
        'rosterIdentities' => 'Roster row identities could not be upgraded.',
        'pages' => 'Publication pages could not be migrated.',
    ];

    return $messages[$step] ?? 'A Byline upgrade step could not be completed.';
}

function byline_record_upgrade_failure(string $step, string $code = 'byline_upgrade_failed'): void
{
    $previous = byline_upgrade_failure();
    $now = time();
    $failure = [
        'step' => sanitize_key($step),
        'code' => sanitize_key($code),
        'message' => byline_upgrade_failure_message($step),
        'lastAttempt' => $now,
    ];

    if (isset($previous['lastLogged']) && is_numeric($previous['lastLogged'])) {
        $failure['lastLogged'] = (int) $previous['lastLogged'];
    }

    update_option(BYLINE_UPGRADE_FAILURE_OPTION, $failure, false);

    // A broken database permission should be visible in the server log, but a
    // persistent failure must not flood it on every administrator request.
    $last_logged = (int) ($previous['lastLogged'] ?? 0);
    if ($last_logged === 0 || $now - $last_logged >= 3600 || ($previous['code'] ?? '') !== $failure['code']) {
        $failure['lastLogged'] = $now;
        update_option(BYLINE_UPGRADE_FAILURE_OPTION, $failure, false);
        error_log('Byline: ' . $failure['message'] . ' (' . $failure['code'] . ').');
    }
}

/**
 * @return array<string,mixed>
 */
function byline_upgrade_failure(): array
{
    $failure = get_option(BYLINE_UPGRADE_FAILURE_OPTION, []);

    return is_array($failure) ? $failure : [];
}

function byline_render_upgrade_failure_notice(): void
{
    if (!function_exists('current_user_can')
        || !current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_options')) {
        return;
    }

    $failure = byline_upgrade_failure();
    if ($failure === []) {
        return;
    }

    $diagnostics_url = function_exists('byline_admin_page_url')
        ? byline_admin_page_url('byline-settings', ['tab' => 'diagnostics'])
        : '';
    echo '<div class="notice notice-error"><p>' . esc_html((string) ($failure['message'] ?? 'A Byline upgrade step could not be completed.'));
    if ($diagnostics_url !== '') {
        echo ' <a href="' . esc_url($diagnostics_url) . '">' . esc_html__('View Byline Diagnostics', 'weekly-wildcat-headless') . '</a>';
    }
    echo '</p></div>';
}
add_action('admin_notices', 'byline_render_upgrade_failure_notice', 20);

/**
 * A resource check is deliberately read-only. It allows a dropped table or a
 * missing option to be repaired from a normal admin request while keeping DDL
 * out of public REST traffic.
 */
function byline_upgrade_step_needs_run(string $step_id, array $step): bool
{
    if ((int) get_option($step['option'], 0) < (int) $step['version']) {
        return true;
    }

    if ($step_id === 'core') {
        return get_option(BYLINE_PUBLICATION_OPTION, null) === null
            || get_option(BYLINE_PUBLICATION_REVISION_OPTION, null) === null;
    }

    if ($step_id === 'capabilities') {
        return function_exists('byline_administrator_capabilities_ready')
            && !byline_administrator_capabilities_ready();
    }

    if ($step_id === 'polls') {
        return function_exists('byline_poll_votes_table_exists') && !byline_poll_votes_table_exists();
    }

    if ($step_id === 'sports') {
        return get_option(BYLINE_SPORTS_TEAMS_OPTION, null) === null;
    }

    if ($step_id === 'secrets') {
        return function_exists('byline_poll_signing_secret_source')
            && byline_poll_signing_secret_source() === 'missing';
    }

    return false;
}

/**
 * Run all pending independent steps. This function is safe to call repeatedly
 * and is intentionally only hooked to admin_init and activation; public REST
 * requests must never become an implicit schema migration mechanism.
 *
 * @return array<string,array<int,string>>
 */
function byline_maybe_upgrade(bool $force = false): array
{
    static $ran = false;

    if ($ran && !$force) {
        return ['ran' => [], 'skipped' => [], 'failed' => []];
    }
    $ran = true;

    $result = ['ran' => [], 'skipped' => [], 'failed' => []];
    foreach (byline_upgrade_steps() as $step_id => $step) {
        if (!byline_upgrade_step_needs_run($step_id, $step)) {
            $result['skipped'][] = $step_id;
            continue;
        }

        try {
            $step_result = call_user_func($step['callback']);
        } catch (Throwable $exception) {
            byline_record_upgrade_failure($step_id, 'byline_upgrade_exception');
            $result['failed'][] = $step_id;
            continue;
        }

        if ($step_result instanceof WP_Error) {
            byline_record_upgrade_failure($step_id, $step_result->get_error_code() ?: 'byline_upgrade_failed');
            $result['failed'][] = $step_id;
            continue;
        }

        if ($step_result !== true) {
            byline_record_upgrade_failure($step_id);
            $result['failed'][] = $step_id;
            continue;
        }

        update_option($step['option'], (int) $step['version'], false);
        if ((int) get_option($step['option'], 0) < (int) $step['version']) {
            byline_record_upgrade_failure($step_id, 'byline_upgrade_marker_failed');
            $result['failed'][] = $step_id;
            continue;
        }

        $result['ran'][] = $step_id;
    }

    if ($result['failed'] === []) {
        delete_option(BYLINE_UPGRADE_FAILURE_OPTION);
        update_option(BYLINE_UPGRADE_LAST_SUCCESS_OPTION, time(), false);
    }

    return $result;
}
add_action('admin_init', 'byline_maybe_upgrade', 1);

function byline_mark_rewrite_flush_needed(): void
{
    update_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION, 1, false);
}

function byline_maybe_flush_rewrite_rules(): void
{
    if ((int) get_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION, 0) !== 1
        || !function_exists('flush_rewrite_rules')) {
        return;
    }

    // A pending refresh is administrative lifecycle work. Never turn an
    // anonymous frontend request into an expensive rewrite flush or a retry
    // loop after an activation/update.
    if (function_exists('is_admin') && !is_admin()) {
        return;
    }
    if (function_exists('wp_doing_ajax') && wp_doing_ajax()) {
        return;
    }

    // init has already registered Byline's post types at this priority.
    try {
        flush_rewrite_rules(false);
    } catch (Throwable $exception) {
        return;
    }
    update_option(BYLINE_REWRITE_VERSION_OPTION, BYLINE_REWRITE_VERSION, false);
    delete_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION);
}
add_action('init', 'byline_maybe_flush_rewrite_rules', 99);

function byline_activate_plugin(): void
{
    byline_maybe_upgrade(true);
    byline_mark_rewrite_flush_needed();
}

function byline_deactivate_plugin(): void
{
    if (function_exists('byline_clear_scheduled_deployment')) {
        byline_clear_scheduled_deployment();
    }
    if (defined('WWH_CLOUDFLARE_DEPLOY_EVENT') && function_exists('wp_clear_scheduled_hook')) {
        wp_clear_scheduled_hook(WWH_CLOUDFLARE_DEPLOY_EVENT);
    }
}
