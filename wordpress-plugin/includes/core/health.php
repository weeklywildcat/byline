<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_HEALTH_STATUS_GOOD = 'good';
const BYLINE_HEALTH_STATUS_RECOMMENDED = 'recommended';
const BYLINE_HEALTH_STATUS_CRITICAL = 'critical';

/**
 * Build one stable, presentation-independent health record. Overview,
 * Diagnostics, and Site Health all consume these same records.
 *
 * @return array<string,mixed>
 */
function byline_health_check(
    string $id,
    string $label,
    string $status,
    string $summary,
    string $description,
    string $remediation_url = '',
    string $technical_detail = ''
): array {
    if (!in_array($status, [BYLINE_HEALTH_STATUS_GOOD, BYLINE_HEALTH_STATUS_RECOMMENDED, BYLINE_HEALTH_STATUS_CRITICAL], true)) {
        $status = BYLINE_HEALTH_STATUS_CRITICAL;
    }

    return [
        'id' => sanitize_key($id),
        'label' => $label,
        'status' => $status,
        'severity' => $status === BYLINE_HEALTH_STATUS_GOOD ? 'none' : $status,
        'summary' => $summary,
        'description' => $description,
        'remediationUrl' => $remediation_url,
        'technicalDetail' => $technical_detail,
    ];
}

function byline_health_admin_url(string $page, array $args = []): string
{
    if (function_exists('byline_admin_page_url')) {
        return byline_admin_page_url($page, $args);
    }

    return function_exists('admin_url') ? admin_url('admin.php?page=' . rawurlencode($page)) : '';
}

function byline_health_role_has_capability($role, string $capability): bool
{
    if (!is_object($role)) {
        return false;
    }

    if (method_exists($role, 'has_cap')) {
        return (bool) $role->has_cap($capability);
    }

    return !empty($role->capabilities[$capability]);
}

function byline_health_http_url($value): bool
{
    if (function_exists('byline_publication_is_http_url')) {
        return byline_publication_is_http_url($value);
    }

    if (!is_string($value) || !function_exists('wp_parse_url')) {
        return false;
    }

    $scheme = strtolower((string) wp_parse_url($value, PHP_URL_SCHEME));
    return in_array($scheme, ['http', 'https'], true)
        && (string) wp_parse_url($value, PHP_URL_HOST) !== '';
}

function byline_health_poll_table_exists(): bool
{
    if (!function_exists('byline_poll_votes_table_exists')) {
        return false;
    }

    try {
        return byline_poll_votes_table_exists();
    } catch (Throwable $exception) {
        return false;
    }
}

function byline_health_poll_secret_source(): string
{
    if (!function_exists('byline_poll_signing_secret_source')) {
        return 'missing';
    }

    try {
        return (string) byline_poll_signing_secret_source();
    } catch (Throwable $exception) {
        return 'unavailable';
    }
}

/**
 * @return array<string,bool>
 */
function byline_expected_admin_asset_presence(): array
{
    $plugin_root = dirname(__DIR__, 2);
    $files = [
        'adminScript' => $plugin_root . '/build/index.js',
        'assetManifest' => $plugin_root . '/build/index.asset.php',
        'vendorStyles' => $plugin_root . '/build/index.css',
        'adminStyles' => $plugin_root . '/build/style-index.css',
        // The block-editor workflow entry. Without it a production install opens
        // the post editor with no editorial workflow control at all.
        'editorialWorkflowScript' => $plugin_root . '/build/editorial-workflow.js',
        'editorialWorkflowManifest' => $plugin_root . '/build/editorial-workflow.asset.php',
        'editorialWorkflowStyles' => $plugin_root . '/build/editorial-workflow.css',
        // Normal Pages use a small native document-settings entry plus the
        // metadata-driven page-section block entry.
        'pageEditorScript' => $plugin_root . '/build/page-editor.js',
        'pageEditorManifest' => $plugin_root . '/build/page-editor.asset.php',
        'pageSectionBlockScript' => $plugin_root . '/build/blocks/page-section/index.js',
        'pageSectionBlockMetadata' => $plugin_root . '/build/blocks/page-section/block.json',
        'pageSectionBlockRender' => $plugin_root . '/build/blocks/page-section/render.php',
        'pageSectionBlockStyles' => $plugin_root . '/build/blocks/page-section/style-index.css',
    ];
    $presence = [];
    foreach ($files as $name => $path) {
        $presence[$name] = is_readable($path);
    }

    return $presence;
}

function byline_health_registered_route(string $route): ?bool
{
    if (!function_exists('rest_get_server')) {
        return null;
    }

    try {
        $server = rest_get_server();
        if (!is_object($server) || !method_exists($server, 'get_routes')) {
            return null;
        }
        $routes = $server->get_routes();
    } catch (Throwable $exception) {
        return null;
    }

    return is_array($routes) && isset($routes[$route]);
}

/**
 * The route check is registration-only. It never performs an HTTP loopback,
 * so a private CMS or an unavailable public frontend is not confused with a
 * missing REST callback.
 */
function byline_health_route_check(): array
{
    $expected = [
        '/byline/v1/capabilities/protocol',
        '/byline/v1/publication',
        '/byline/v1/designs',
        '/byline/v1/admin/diagnostics',
        '/byline/v1/admin/health',
    ];
    $missing = [];
    $unknown = false;
    foreach ($expected as $route) {
        $registered = byline_health_registered_route($route);
        if ($registered === null) {
            $unknown = true;
        } elseif (!$registered) {
            $missing[] = $route;
        }
    }

    if ($unknown && $missing === []) {
        return byline_health_check(
            'rest_routes',
            'REST API',
            BYLINE_HEALTH_STATUS_RECOMMENDED,
            'REST route registration could not be inspected in this request.',
            'Byline could not inspect the local WordPress REST route registry. This does not test whether a remote frontend can reach the CMS.',
            byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
            'route_registry_unavailable'
        );
    }

    if ($missing !== []) {
        return byline_health_check(
            'rest_routes',
            'REST API',
            BYLINE_HEALTH_STATUS_CRITICAL,
            'One or more required REST routes are not registered.',
            'Byline cannot serve the local API contract until its expected routes are registered.',
            byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
            'missing_routes=' . implode(',', $missing)
        );
    }

    return byline_health_check(
        'rest_routes',
        'REST API',
        BYLINE_HEALTH_STATUS_GOOD,
        'Required REST routes are registered.',
        'The Byline protocol, publication, design, diagnostics, and health routes are registered with WordPress.',
        '',
        'registered_routes=' . count($expected)
    );
}

function byline_health_publication_checks(array $publication): array
{
    $checks = [];
    $raw = get_option(BYLINE_PUBLICATION_OPTION, null);
    $validation = true;
    if (is_array($raw) && function_exists('byline_validate_publication_config')) {
        try {
            $validation = byline_validate_publication_config($raw);
        } catch (Throwable $exception) {
            $validation = false;
        }
    }
    $config_ready = is_array($raw)
        && (int) ($raw['schemaVersion'] ?? 0) === BYLINE_PUBLICATION_SCHEMA_VERSION
        && $validation === true;
    $validation_code = $validation instanceof WP_Error
        ? sanitize_key($validation->get_error_code())
        : ($validation === false ? 'byline_publication_validation_failed' : '');

    $checks[] = byline_health_check(
        'publication_config',
        'Publication configuration',
        $config_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $config_ready ? 'Publication configuration is readable.' : 'Publication configuration is missing, invalid, or uses an unsupported schema.',
        $config_ready ? 'Byline can read the stored publication document.' : 'The stored publication document cannot be trusted by the public build until it is repaired.',
        byline_health_admin_url('byline-publication', ['tab' => 'identity']),
        'stored_schema=' . (is_array($raw) ? (int) ($raw['schemaVersion'] ?? 0) : 0) . ($validation_code !== '' ? ';code=' . $validation_code : '')
    );

    $identity_ready = trim((string) ($publication['identity']['name'] ?? '')) !== ''
        && trim((string) ($publication['identity']['shortName'] ?? '')) !== ''
        && trim((string) ($publication['identity']['description'] ?? '')) !== '';
    $checks[] = byline_health_check(
        'publication_identity',
        'Publication identity',
        $identity_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $identity_ready ? 'Publication identity is configured.' : 'Publication identity is incomplete.',
        'The publication name, short name, and description are used by the CMS and public site.',
        byline_health_admin_url('byline-publication', ['tab' => 'identity']),
        'identity_fields=' . ($identity_ready ? 'complete' : 'incomplete')
    );

    $urls_ready = byline_health_http_url($publication['urls']['publicSite'] ?? null)
        && byline_health_http_url($publication['urls']['cms'] ?? null);
    $checks[] = byline_health_check(
        'publication_urls',
        'Publication URLs',
        $urls_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $urls_ready ? 'Public and CMS URLs are valid.' : 'Public or CMS URL needs attention.',
        'Both URLs must use an http or https scheme and include a host so builds and administrator links resolve correctly.',
        byline_health_admin_url('byline-publication', ['tab' => 'identity']),
        'public_url=' . ($urls_ready ? 'valid' : 'invalid') . ';cms_url=' . ($urls_ready ? 'valid' : 'invalid')
    );

    $theme = (string) ($publication['appearance']['theme'] ?? '');
    $themes = function_exists('byline_publication_theme_ids') ? byline_publication_theme_ids() : [];
    $theme_ready = $theme !== '' && ($themes === [] || in_array($theme, $themes, true));
    $checks[] = byline_health_check(
        'theme',
        'Active theme',
        $theme_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $theme_ready ? 'A supported Byline theme is active.' : 'The active Byline theme is missing or unsupported.',
        'The selected theme must be available to the frontend and Studio.',
        byline_health_admin_url('byline-theme'),
        'theme=' . sanitize_key($theme)
    );

    $branding_ready = trim((string) ($publication['branding']['masthead']['url'] ?? '')) !== ''
        || trim((string) ($publication['branding']['logo']['url'] ?? '')) !== '';
    $checks[] = byline_health_check(
        'branding',
        'Branding',
        $branding_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_RECOMMENDED,
        $branding_ready ? 'Publication branding is configured.' : 'Publication logo or masthead has not been configured.',
        'A logo or masthead is recommended so administrator and public fallback surfaces identify the publication.',
        byline_health_admin_url('byline-publication', ['tab' => 'branding']),
        'logo_or_masthead=' . ($branding_ready ? 'present' : 'missing')
    );

    return $checks;
}

function byline_health_homepage_design_check(): array
{
    if (!function_exists('byline_get_design_post') || !function_exists('get_post')) {
        return byline_health_check(
            'homepage_design',
            'Homepage design',
            BYLINE_HEALTH_STATUS_RECOMMENDED,
            'Homepage design could not be inspected in this request.',
            'Open Studio to inspect or publish the homepage design.',
            byline_health_admin_url('byline-studio'),
            'design_storage_unavailable'
        );
    }

    $post = byline_get_design_post('home');
    if (!$post || !is_object($post) || (string) ($post->post_status ?? '') !== 'publish') {
        return byline_health_check(
            'homepage_design',
            'Homepage design',
            BYLINE_HEALTH_STATUS_RECOMMENDED,
            'No homepage design has been published.',
            'The public site will not have a managed homepage layout until Studio publishes one.',
            byline_health_admin_url('byline-studio'),
            'published_home_design=false'
        );
    }

    $document = json_decode((string) ($post->post_content ?? ''), true);
    if (!is_array($document)) {
        return byline_health_check(
            'homepage_design',
            'Homepage design',
            BYLINE_HEALTH_STATUS_CRITICAL,
            'The published homepage design is unreadable.',
            'Studio must repair and republish the homepage design before the public build can safely use it.',
            byline_health_admin_url('byline-studio'),
            'published_home_design=json_invalid'
        );
    }

    if (function_exists('byline_validate_design_document')) {
        try {
            $validation = byline_validate_design_document($document, 'home');
        } catch (Throwable $exception) {
            return byline_health_check(
                'homepage_design',
                'Homepage design',
                BYLINE_HEALTH_STATUS_CRITICAL,
                'The published homepage design could not be validated.',
                'Studio must repair and republish the homepage design before the public build can safely use it.',
                byline_health_admin_url('byline-studio'),
                'published_home_design=validation_exception'
            );
        }
        if ($validation instanceof WP_Error) {
            return byline_health_check(
                'homepage_design',
                'Homepage design',
                BYLINE_HEALTH_STATUS_CRITICAL,
                'The published homepage design failed validation.',
                'Studio must repair and republish the homepage design before the public build can safely use it.',
                byline_health_admin_url('byline-studio'),
                'published_home_design=invalid;code=' . sanitize_key($validation->get_error_code())
            );
        }
    }

    return byline_health_check(
        'homepage_design',
        'Homepage design',
        BYLINE_HEALTH_STATUS_GOOD,
        'A readable homepage design is published.',
        'The published homepage document passed Byline storage validation.',
        '',
        'published_home_design=true;schema=' . (int) ($document['schemaVersion'] ?? 0)
    );
}

function byline_health_capabilities_check(): array
{
    $role = function_exists('get_role') ? get_role('administrator') : null;
    $missing = [];
    foreach (function_exists('byline_capabilities') ? byline_capabilities() : [] as $capability) {
        if (!byline_health_role_has_capability($role, $capability)) {
            $missing[] = $capability;
        }
    }

    return byline_health_check(
        'capabilities',
        'Capabilities',
        $missing === [] ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $missing === [] ? 'Byline capabilities are installed.' : 'One or more Byline capabilities are missing.',
        $missing === [] ? 'Administrator and newsroom access capabilities are available.' : 'The upgrade coordinator will retry the capability installation on a later admin request.',
        byline_health_admin_url('byline-settings', ['tab' => 'access']),
        'missing=' . implode(',', $missing)
    );
}

function byline_health_rewrite_check(): array
{
    $pending = defined('BYLINE_REWRITE_FLUSH_NEEDED_OPTION')
        && (int) get_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION, 0) === 1;
    $version = defined('BYLINE_REWRITE_VERSION_OPTION')
        ? (int) get_option(BYLINE_REWRITE_VERSION_OPTION, 0)
        : 0;
    $target = defined('BYLINE_REWRITE_VERSION') ? BYLINE_REWRITE_VERSION : 1;

    return byline_health_check(
        'rewrite_rules',
        'Rewrite rules',
        $pending ? BYLINE_HEALTH_STATUS_CRITICAL : BYLINE_HEALTH_STATUS_GOOD,
        $pending ? 'Rewrite rules are waiting to be refreshed.' : 'Rewrite rules are current.',
        $pending ? 'Byline will refresh WordPress rewrite rules during the next administrator request.' : 'Byline has no pending rewrite-rule refresh.',
        $pending ? byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']) : '',
        'pending=' . ($pending ? 'true' : 'false') . ';version=' . $version . ';target=' . $target
    );
}

function byline_health_optional_module_checks(array $features): array
{
    $checks = [];

    if (!empty($features['polls'])) {
        $storage_ready = byline_health_poll_table_exists()
            && (int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) >= BYLINE_POLL_SCHEMA_VERSION;
        $checks[] = byline_health_check(
            'poll_storage',
            'Poll database',
            $storage_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
            $storage_ready ? 'Poll vote storage is ready.' : 'Poll vote storage is missing or out of date.',
            'Poll definitions remain WordPress content; vote history requires the dedicated Byline table.',
            byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
            'table=' . ($storage_ready ? 'present' : 'missing') . ';schema=' . (int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0)
        );

        $secret_source = byline_health_poll_secret_source();
        $secret_ready = $secret_source !== 'missing';
        $checks[] = byline_health_check(
            'poll_secret',
            'Poll signing secret',
            $secret_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
            $secret_ready ? 'Poll signing secret is available.' : 'Poll signing secret is missing.',
            'The secret is required to preserve anonymous voter identity and is never displayed in diagnostics.',
            byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
            'source=' . sanitize_key($secret_source)
        );
    }

    if (!empty($features['sports'])) {
        $games_ready = function_exists('post_type_exists')
            ? post_type_exists(WWH_SPORTS_GAME_POST_TYPE) && post_type_exists(WWH_SPORTS_ROSTER_POST_TYPE)
            : true;
        $teams_configured = get_option(BYLINE_SPORTS_TEAMS_OPTION, null) !== null;
        $checks[] = byline_health_check(
            'sports',
            'Sports module',
            !$games_ready ? BYLINE_HEALTH_STATUS_CRITICAL : ($teams_configured ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_RECOMMENDED),
            !$games_ready ? 'Sports content types are not registered.' : ($teams_configured ? 'Sports content is ready.' : 'Sports teams have not been configured.'),
            'Games, teams, and rosters use the existing WordPress content model and stable team keys.',
            byline_health_admin_url('byline-publication', ['tab' => 'navigation']),
            'post_types=' . ($games_ready ? 'ready' : 'missing') . ';teams=' . ($teams_configured ? 'present' : 'missing')
        );

        if (function_exists('byline_sports_health')) {
            try {
                $sports_health = byline_sports_health();
            } catch (Throwable $exception) {
                $sports_health = [
                    'counts' => ['error' => 1, 'recommended' => 0],
                    'status' => 'attention',
                ];
            }
            $counts = is_array($sports_health['counts'] ?? null) ? $sports_health['counts'] : [];
            $errors = (int) ($counts['error'] ?? 0);
            $recommendations = (int) ($counts['recommended'] ?? 0);
            $integrity_status = $errors > 0
                ? BYLINE_HEALTH_STATUS_CRITICAL
                : ($recommendations > 0 ? BYLINE_HEALTH_STATUS_RECOMMENDED : BYLINE_HEALTH_STATUS_GOOD);
            $integrity_url = function_exists('wwh_sports_overview_page_url')
                ? wwh_sports_overview_page_url()
                : byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']);
            $checks[] = byline_health_check(
                'sports_integrity',
                'Sports integrity',
                $integrity_status,
                $errors > 0 ? 'Sports relationships need repair.' : ($recommendations > 0 ? 'Sports data has recommendations.' : 'Sports relationships are healthy.'),
                'Team references, school-year values, published roster uniqueness, linked game stories, and current-season readiness are checked together.',
                $integrity_url,
                'current_season=' . sanitize_key((string) ($sports_health['currentSeason'] ?? '')) . ';errors=' . $errors . ';recommended=' . $recommendations
            );
        }
    }

    if (!empty($features['events'])) {
        $events_ready = function_exists('post_type_exists') ? post_type_exists(WWH_SCHOOL_EVENT_POST_TYPE) : true;
        $checks[] = byline_health_check(
            'events',
            'Events module',
            $events_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
            $events_ready ? 'Events content is ready.' : 'The Events content type is not registered.',
            'School events use the existing WordPress content model and public route.',
            byline_health_admin_url('byline-publication', ['tab' => 'navigation']),
            'post_type=' . ($events_ready ? 'registered' : 'missing')
        );
    }

    return $checks;
}

function byline_health_deployment_check(): ?array
{
    if (!function_exists('byline_deployment_hook_url') || byline_deployment_hook_url() === '') {
        return null;
    }

    $cron_disabled = defined('DISABLE_WP_CRON') && DISABLE_WP_CRON;
    $scheduler_ready = function_exists('wp_schedule_single_event') && function_exists('wp_next_scheduled');
    if (function_exists('byline_jobs_cron_health')) {
        $jobs_health = byline_jobs_cron_health();
        $overdue = (int) ($jobs_health['overdueCount'] ?? 0);
        $traffic_driven = !empty($jobs_health['trafficDriven']);
        $details = 'overdue=' . $overdue
            . ';cron_disabled=' . (!empty($jobs_health['cronDisabled']) ? 'true' : 'false')
            . ';runner=' . sanitize_key((string) ($jobs_health['lastSource'] ?? 'unknown'))
            . ';traffic_driven=' . ($traffic_driven ? 'true' : 'false');

        if ($overdue > 0) {
            return byline_health_check(
                'deployment_cron',
                'Deployment scheduling',
                !empty($jobs_health['cronDisabled']) ? BYLINE_HEALTH_STATUS_CRITICAL : BYLINE_HEALTH_STATUS_RECOMMENDED,
                'Scheduled publishing may run late.',
                !empty($jobs_health['cronDisabled'])
                    ? 'WordPress cron is disabled while Byline work is overdue; run the authenticated or WP-CLI catch-up hook.'
                    : 'Byline is currently relying on traffic-triggered WP-Cron for catch-up. Run the authenticated or WP-CLI hook if this remains overdue.',
                byline_health_admin_url('byline-integrations', ['tab' => 'deployment']),
                $details
            );
        }
        if (!empty($jobs_health['cronDisabled'])) {
            return byline_health_check(
                'deployment_cron',
                'Deployment scheduling',
                BYLINE_HEALTH_STATUS_CRITICAL,
                'Deployment scheduling needs an external runner.',
                'WordPress cron is disabled; use the authenticated or WP-CLI Byline job runner for scheduled publishing.',
                byline_health_admin_url('byline-integrations', ['tab' => 'deployment']),
                $details
            );
        }
        if (($jobs_health['status'] ?? '') === 'critical' || !$scheduler_ready) {
            return byline_health_check(
                'deployment_cron',
                'Deployment scheduling',
                BYLINE_HEALTH_STATUS_CRITICAL,
                'Deployment is configured but WordPress cron is unavailable.',
                'Byline cannot coalesce content changes into a deploy request until WP-Cron is available or the deployment is triggered manually.',
                byline_health_admin_url('byline-integrations', ['tab' => 'deployment']),
                $details
            );
        }
        if (($jobs_health['status'] ?? '') === 'recommended') {
            return byline_health_check(
                'deployment_cron',
                'Deployment scheduling',
                BYLINE_HEALTH_STATUS_RECOMMENDED,
                (string) ($jobs_health['message'] ?? 'The recurring Byline job runner needs attention.'),
                'Byline uses a durable queue and can be caught up through the authenticated or WP-CLI runner.',
                byline_health_admin_url('byline-integrations', ['tab' => 'deployment']),
                $details
            );
        }
        return byline_health_check(
            'deployment_cron',
            'Deployment scheduling',
            BYLINE_HEALTH_STATUS_GOOD,
            'Deployment scheduling is available.',
            'Byline can coalesce content changes and trigger the configured deploy hook.',
            '',
            $details
        );
    }

    if ($cron_disabled || !$scheduler_ready) {
        return byline_health_check(
            'deployment_cron',
            'Deployment scheduling',
            BYLINE_HEALTH_STATUS_CRITICAL,
            'Deployment is configured but WordPress cron is unavailable.',
            'Byline cannot coalesce content changes into a deploy request until WP-Cron is available or the deployment is triggered manually.',
            byline_health_admin_url('byline-integrations', ['tab' => 'deployment']),
            'cron_disabled=' . ($cron_disabled ? 'true' : 'false') . ';scheduler_api=' . ($scheduler_ready ? 'present' : 'missing')
        );
    }

    return byline_health_check(
        'deployment_cron',
        'Deployment scheduling',
        BYLINE_HEALTH_STATUS_GOOD,
        'Deployment scheduling is available.',
        'Byline can coalesce content changes and trigger the configured deploy hook.',
        '',
        'cron_disabled=false;scheduler_api=present'
    );
}

function byline_health_legacy_page_check(): ?array
{
    if (!function_exists('byline_get_weekly_page_migration_report')) {
        return null;
    }

    $report = byline_get_weekly_page_migration_report();
    $correction_failures = is_array($report['correctionFailures'] ?? null) ? $report['correctionFailures'] : [];
    if ($correction_failures !== []) {
        $page_labels = [];
        $first_edit_link = '';
        $page_ids = [];
        foreach ($correction_failures as $failure) {
            if (!is_array($failure)) {
                continue;
            }
            $title = sanitize_text_field((string) ($failure['title'] ?? 'Untitled page'));
            $edit_link = (string) ($failure['editLink'] ?? '');
            if ($first_edit_link === '' && $edit_link !== '') {
                $first_edit_link = $edit_link;
            }
            $page_ids[] = (int) ($failure['id'] ?? 0);
            $reason = sanitize_text_field((string) ($failure['reason'] ?? 'The Page could not be corrected safely.'));
            $page_labels[] = $edit_link !== ''
                ? '<a href="' . esc_url($edit_link) . '">' . esc_html($title) . '</a> (' . esc_html($reason) . ')'
                : esc_html($title) . ' (' . esc_html($reason) . ')';
        }

        $count = count($page_labels);
        return byline_health_check(
            'page_block_correction',
            'Page block correction',
            BYLINE_HEALTH_STATUS_CRITICAL,
            sprintf('%d Page%s could not be safely repaired from the #53 block format.', $count, $count === 1 ? '' : 's'),
            'No Page content was overwritten for the failed cases. Review the affected Page' . ($count === 1 ? '' : 's') . ' and repair the reported structural issue before rerunning the upgrade: ' . implode(', ', $page_labels) . '.',
            $first_edit_link !== '' ? $first_edit_link : byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
            'page_ids=' . implode(',', $page_ids)
        );
    }

    $legacy_pages = is_array($report['legacyPages'] ?? null) ? $report['legacyPages'] : [];
    if ($legacy_pages === []) {
        return null;
    }

    $page_labels = [];
    $first_edit_link = '';
    $page_ids = [];
    foreach ($legacy_pages as $page) {
        if (!is_array($page)) {
            continue;
        }
        $title = sanitize_text_field((string) ($page['title'] ?? 'Untitled page'));
        $edit_link = (string) ($page['editLink'] ?? '');
        if ($first_edit_link === '' && $edit_link !== '') {
            $first_edit_link = $edit_link;
        }
        $page_ids[] = (int) ($page['id'] ?? 0);
        $page_labels[] = $edit_link !== ''
            ? '<a href="' . esc_url($edit_link) . '">' . esc_html($title) . '</a>'
            : esc_html($title);
    }

    $count = count($page_labels);
    return byline_health_check(
        'legacy_page_markup',
        'Legacy page markup',
        BYLINE_HEALTH_STATUS_RECOMMENDED,
        sprintf('%d legacy Page%s still use pre-block Byline page markup.', $count, $count === 1 ? '' : 's'),
        'These pages were changed after their original seed and were not overwritten. Review the affected page' . ($count === 1 ? '' : 's') . ': ' . implode(', ', $page_labels) . '.',
        $first_edit_link,
        'page_ids=' . implode(',', $page_ids)
    );
}

/**
 * @return array<int,array<string,mixed>>
 */
function byline_get_health_checks(): array
{
    $checks = [];
    $assets = byline_expected_admin_asset_presence();
    $missing_assets = array_keys(array_filter($assets, static fn(bool $present): bool => !$present));
    $checks[] = byline_health_check(
        'plugin_assets',
        'Plugin assets',
        $missing_assets === [] ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $missing_assets === [] ? 'All required admin assets are present.' : 'Required admin assets are missing.',
        $missing_assets === [] ? 'Byline can load its compiled administrator application.' : 'Install a complete release package or rebuild the administrator assets before opening Byline.',
        byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
        'missing=' . implode(',', $missing_assets)
    );

    $upgrade_failure = function_exists('byline_upgrade_failure') ? byline_upgrade_failure() : [];
    $checks[] = byline_health_check(
        'upgrade',
        'Upgrade state',
        $upgrade_failure === [] ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $upgrade_failure === [] ? 'No failed Byline upgrade is recorded.' : (string) ($upgrade_failure['message'] ?? 'A Byline upgrade step failed.'),
        $upgrade_failure === [] ? 'Installation and upgrade coordination has no outstanding failure.' : 'Byline will retry this step on a later administrator request; no completion marker is advanced until it succeeds.',
        byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
        $upgrade_failure === [] ? '' : 'step=' . sanitize_key((string) ($upgrade_failure['step'] ?? 'unknown')) . ';code=' . sanitize_key((string) ($upgrade_failure['code'] ?? 'unknown'))
    );

    $core_ready = (int) get_option(BYLINE_CORE_SCHEMA_VERSION_OPTION, 0) >= BYLINE_CORE_SCHEMA_VERSION;
    $checks[] = byline_health_check(
        'core_schema',
        'Core schema',
        $core_ready ? BYLINE_HEALTH_STATUS_GOOD : BYLINE_HEALTH_STATUS_CRITICAL,
        $core_ready ? 'Core configuration schema is current.' : 'Core configuration schema needs to be upgraded.',
        'The next administrator request will retry the idempotent core setup coordinator.',
        byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']),
        'version=' . (int) get_option(BYLINE_CORE_SCHEMA_VERSION_OPTION, 0) . ';target=' . BYLINE_CORE_SCHEMA_VERSION
    );

    $checks[] = byline_health_capabilities_check();
    $checks[] = byline_health_rewrite_check();

    $publication = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $checks = array_merge($checks, byline_health_publication_checks($publication));
    $checks[] = byline_health_homepage_design_check();
    $checks[] = byline_health_route_check();
    $legacy_page_check = byline_health_legacy_page_check();
    if ($legacy_page_check !== null) {
        $checks[] = $legacy_page_check;
    }

    $features = is_array($publication['features'] ?? null) ? $publication['features'] : [];
    $checks = array_merge($checks, byline_health_optional_module_checks($features));
    $deployment = byline_health_deployment_check();
    if ($deployment !== null) {
        $checks[] = $deployment;
    }

    return apply_filters('byline_health_checks', $checks);
}

function byline_health_summary(array $checks): array
{
    $critical = 0;
    $recommended = 0;
    foreach ($checks as $check) {
        if (($check['status'] ?? '') === BYLINE_HEALTH_STATUS_CRITICAL) {
            $critical++;
        } elseif (($check['status'] ?? '') === BYLINE_HEALTH_STATUS_RECOMMENDED) {
            $recommended++;
        }
    }

    return [
        'status' => $critical > 0 ? BYLINE_HEALTH_STATUS_CRITICAL : ($recommended > 0 ? BYLINE_HEALTH_STATUS_RECOMMENDED : BYLINE_HEALTH_STATUS_GOOD),
        'critical' => $critical,
        'recommended' => $recommended,
        'good' => max(0, count($checks) - $critical - $recommended),
    ];
}

function byline_site_health_test(): array
{
    $checks = byline_get_health_checks();
    $summary = byline_health_summary($checks);
    $status = (string) $summary['status'];
    $messages = [
        BYLINE_HEALTH_STATUS_GOOD => 'Byline is ready.',
        BYLINE_HEALTH_STATUS_RECOMMENDED => 'Byline has setup recommendations.',
        BYLINE_HEALTH_STATUS_CRITICAL => 'Byline needs attention.',
    ];
    $actions = '';
    $diagnostics_url = byline_health_admin_url('byline-settings', ['tab' => 'diagnostics']);
    if ($diagnostics_url !== '') {
        $actions = '<p><a href="' . esc_url($diagnostics_url) . '">' . esc_html__('Open Byline Diagnostics', 'weekly-wildcat-headless') . '</a></p>';
    }

    return [
        'label' => 'Byline',
        'status' => $status,
        'badge' => [
            'label' => 'Byline',
            'color' => $status === BYLINE_HEALTH_STATUS_CRITICAL ? 'red' : ($status === BYLINE_HEALTH_STATUS_RECOMMENDED ? 'orange' : 'green'),
        ],
        'description' => '<p>' . esc_html($messages[$status]) . ' ' . esc_html(sprintf('%d checks good, %d recommended, %d critical.', $summary['good'], $summary['recommended'], $summary['critical'])) . '</p>',
        'actions' => $actions,
        'test' => 'byline',
    ];
}

function byline_register_site_health_tests(array $tests): array
{
    if (!isset($tests['direct']) || !is_array($tests['direct'])) {
        $tests['direct'] = [];
    }

    $tests['direct']['byline'] = [
        'label' => 'Byline',
        'test' => 'byline_site_health_test',
    ];

    return $tests;
}
add_filter('site_status_tests', 'byline_register_site_health_tests');

function byline_register_health_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/health', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => static function () {
            $checks = byline_get_health_checks();
            return rest_ensure_response([
                'summary' => byline_health_summary($checks),
                'checks' => $checks,
            ]);
        },
        'permission_callback' => static fn() => current_user_can(BYLINE_MANAGE_CAPABILITY),
    ]);
}
add_action('rest_api_init', 'byline_register_health_route');
