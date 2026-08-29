<?php

if (!defined('ABSPATH')) {
    exit;
}

function byline_public_manifest_diagnostic(): array
{
    $public_site = (string) (byline_get_publication_config()['urls']['publicSite'] ?? '');
    $expected_revision = function_exists('byline_deployment_expected_revision')
        ? byline_deployment_expected_revision()
        : 0;
    if ($public_site === '' || !function_exists('wp_safe_remote_get')) {
        $diagnostic = [
            'reachable' => false,
            'status' => 'Not configured',
            'publicationRevision' => 0,
            'contentRevision' => 0,
            'expectedRevision' => $expected_revision,
        ];
        $diagnostic['lifecycle'] = function_exists('byline_deployment_lifecycle_status')
            ? byline_deployment_lifecycle_status($diagnostic, $diagnostic)
            : 'unknown';
        return $diagnostic;
    }

    $url = rtrim($public_site, '/') . '/_byline/manifest.json';
    try {
        $response = wp_safe_remote_get($url, [
        'timeout' => 3,
        'redirection' => 2,
        'headers' => ['User-Agent' => 'Byline diagnostics'],
        ]);
    } catch (Throwable $exception) {
        $diagnostic = [
            'reachable' => false,
            'status' => 'Request failed',
            'publicationRevision' => 0,
            'contentRevision' => 0,
            'expectedRevision' => $expected_revision,
        ];
        $diagnostic['lifecycle'] = function_exists('byline_deployment_lifecycle_status')
            ? byline_deployment_lifecycle_status($diagnostic, $diagnostic)
            : 'unknown';
        return $diagnostic;
    }
    if (is_wp_error($response)) {
        $diagnostic = [
            'reachable' => false,
            'status' => 'Request failed',
            'publicationRevision' => 0,
            'contentRevision' => 0,
            'expectedRevision' => $expected_revision,
        ];
        $diagnostic['lifecycle'] = function_exists('byline_deployment_lifecycle_status')
            ? byline_deployment_lifecycle_status($diagnostic, $diagnostic)
            : 'unknown';
        return $diagnostic;
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $manifest = json_decode((string) wp_remote_retrieve_body($response), true);
    $design_revisions = [];
    if (is_array($manifest) && is_array($manifest['designRevisions'] ?? null)) {
        foreach ($manifest['designRevisions'] as $template => $revision) {
            if (!is_scalar($template) || !is_scalar($revision)) {
                continue;
            }
            // Section templates contain a colon (section:slug), which
            // sanitize_key() would remove and make impossible to match to the
            // frontend manifest. Validate the known template grammar without
            // changing the key we compare.
            $template = strtolower(trim((string) $template));
            if (preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?$/', $template) !== 1
                || (function_exists('byline_is_design_template') && !byline_is_design_template($template))) {
                continue;
            }
            $design_revisions[$template] = absint($revision);
        }
    }

    $diagnostic = [
        'reachable' => $code >= 200 && $code < 300 && is_array($manifest),
        'status' => 'HTTP ' . $code,
        'protocolVersion' => is_array($manifest) ? (int) ($manifest['protocolVersion'] ?? 0) : 0,
        'frontendVersion' => is_array($manifest) ? sanitize_text_field((string) ($manifest['frontendVersion'] ?? '')) : '',
        'publicationRevision' => is_array($manifest) ? (int) ($manifest['publicationRevision'] ?? $manifest['contentRevision'] ?? 0) : 0,
        'designRevisions' => $design_revisions,
    ];
    $diagnostic['contentRevision'] = $diagnostic['publicationRevision'];
    $diagnostic['expectedRevision'] = $expected_revision;
    $diagnostic['lifecycle'] = function_exists('byline_deployment_lifecycle_status')
        ? byline_deployment_lifecycle_status($diagnostic, $diagnostic)
        : 'unknown';
    if ($diagnostic['lifecycle'] === 'live'
        && (int) ($diagnostic['expectedRevision'] ?? 0) > 0
        && function_exists('do_action')) {
        // This is an observation of the public manifest, not a claim made by
        // the hook request. Activity handlers dedupe the revision.
        do_action('byline_editorial_build_live', (int) $diagnostic['expectedRevision'], $diagnostic);
    }
    return $diagnostic;
}

function byline_design_migration_count(): int
{
    $posts = get_posts([
        'post_type' => BYLINE_DESIGN_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'fields' => 'ids',
    ]);
    $count = 0;
    foreach ($posts as $post_id) {
        $document = json_decode((string) get_post_field('post_content', $post_id), true);
        if (!is_array($document) || (int) ($document['schemaVersion'] ?? 0) !== BYLINE_DESIGN_SCHEMA_VERSION) {
            $count++;
        }
    }
    return $count;
}

/**
 * Return only non-secret operational facts. This is deliberately separate
 * from the public publication document because integrations can contain
 * credentials that must never be copied into support output.
 */
function byline_diagnostics_safe_runtime(): array
{
    $table_presence = [];
    if (function_exists('byline_poll_votes_table_exists')) {
        $table_presence['pollVotes'] = byline_poll_votes_table_exists();
    }

    $asset_presence = function_exists('byline_expected_admin_asset_presence')
        ? byline_expected_admin_asset_presence()
        : [];

    $route_presence = [];
    if (function_exists('byline_health_registered_route')) {
        foreach ([
            'protocol' => '/byline/v1/capabilities/protocol',
            'publication' => '/byline/v1/publication',
            'designs' => '/byline/v1/designs',
            'diagnostics' => '/byline/v1/admin/diagnostics',
            'health' => '/byline/v1/admin/health',
            'jobs' => '/byline/v1/admin/jobs',
            // Registration only. The editorial routes carry private newsroom
            // information, so diagnostics reports whether they exist and never
            // what they contain.
            'editorialWorkflow' => '/byline/v1/editorial/stories/(?P<id>\d+)',
        ] as $name => $route) {
            $registered = byline_health_registered_route($route);
            $route_presence[$name] = $registered === null ? null : $registered;
        }
    }

    $cron_available = function_exists('wp_schedule_single_event') && function_exists('wp_next_scheduled')
        && !(defined('DISABLE_WP_CRON') && DISABLE_WP_CRON);

    return [
        'siteUrl' => function_exists('site_url') ? site_url('/') : '',
        'homeUrl' => function_exists('home_url') ? home_url('/') : '',
        'phpVersion' => PHP_VERSION,
        'assetPresence' => $asset_presence,
        'tablePresence' => $table_presence,
        'routePresence' => $route_presence,
        'cronAvailable' => $cron_available,
        'schemaVersions' => [
            'core' => defined('BYLINE_CORE_SCHEMA_VERSION_OPTION') ? (int) get_option(BYLINE_CORE_SCHEMA_VERSION_OPTION, 0) : null,
            'capabilities' => defined('BYLINE_CAPABILITIES_VERSION_OPTION') ? (int) get_option(BYLINE_CAPABILITIES_VERSION_OPTION, 0) : null,
            'polls' => defined('BYLINE_POLL_SCHEMA_VERSION_OPTION') ? (int) get_option(BYLINE_POLL_SCHEMA_VERSION_OPTION, 0) : null,
            'sports' => defined('BYLINE_SPORTS_TEAMS_MIGRATION_OPTION') ? (int) get_option(BYLINE_SPORTS_TEAMS_MIGRATION_OPTION, 0) : null,
            'pages' => defined('BYLINE_WEEKLY_PAGE_MIGRATION_OPTION') ? (int) get_option(BYLINE_WEEKLY_PAGE_MIGRATION_OPTION, 0) : null,
        ],
    ];
}

/**
 * Stable, copyable support text. Keep field ordering explicit so two reports
 * for the same site state are comparable in an issue or support thread.
 */
function byline_diagnostics_support_report(array $diagnostics): string
{
    $lines = [
        'Byline diagnostics',
        '==================',
        'Byline version: ' . (string) ($diagnostics['pluginVersion'] ?? 'unknown'),
        'WordPress version: ' . (string) ($diagnostics['wordpressVersion'] ?? 'unknown'),
        'PHP version: ' . (string) ($diagnostics['phpVersion'] ?? 'unknown'),
        'Site URL: ' . (string) ($diagnostics['siteUrl'] ?? ''),
        'Home URL: ' . (string) ($diagnostics['homeUrl'] ?? ''),
        'Active theme: ' . (string) (($diagnostics['theme']['id'] ?? '') ?: 'unknown'),
        'Enabled modules: ' . (implode(', ', (array) ($diagnostics['enabledModules'] ?? [])) ?: 'None'),
        '',
        'Schema versions:',
    ];

    foreach ((array) ($diagnostics['schemaVersions'] ?? []) as $name => $version) {
        $lines[] = '  ' . $name . ': ' . ($version === null ? 'unknown' : (string) $version);
    }

    $lines[] = '';
    $lines[] = 'Runtime availability:';
    foreach ((array) ($diagnostics['assetPresence'] ?? []) as $name => $present) {
        $lines[] = '  asset.' . $name . ': ' . ($present ? 'present' : 'missing');
    }
    foreach ((array) ($diagnostics['tablePresence'] ?? []) as $name => $present) {
        $lines[] = '  table.' . $name . ': ' . ($present ? 'present' : 'missing');
    }
    foreach ((array) ($diagnostics['routePresence'] ?? []) as $name => $present) {
        $lines[] = '  route.' . $name . ': ' . ($present === null ? 'unknown' : ($present ? 'registered' : 'missing'));
    }
    $lines[] = '  cron: ' . (!empty($diagnostics['cronAvailable']) ? 'available' : 'unavailable');

    $lines[] = '';
    $lines[] = 'Health checks:';
    foreach ((array) ($diagnostics['healthChecks'] ?? []) as $check) {
        if (!is_array($check)) {
            continue;
        }
        $lines[] = '  [' . strtoupper((string) ($check['status'] ?? 'unknown')) . '] ' . (string) ($check['label'] ?? 'Byline check') . ': ' . (string) ($check['summary'] ?? '');
    }

    if (is_array($diagnostics['sports'] ?? null)) {
        $sports = $diagnostics['sports'];
        $counts = is_array($sports['counts'] ?? null) ? $sports['counts'] : [];
        $lines[] = '  [' . strtoupper((string) ($sports['status'] ?? 'unknown')) . '] Sports integrity: ' . (string) ($sports['currentSeason'] ?? 'unknown') . ' · ' . (int) ($counts['error'] ?? 0) . ' errors, ' . (int) ($counts['recommended'] ?? 0) . ' recommendations';
    }

    $lines[] = '';
    $lines[] = 'External public manifest: ' . (string) (($diagnostics['publicManifest']['status'] ?? 'Unknown'));
    if (is_array($diagnostics['jobs'] ?? null)) {
        $jobs = $diagnostics['jobs'];
        $cron = is_array($jobs['cronHealth'] ?? null) ? $jobs['cronHealth'] : [];
        $lines[] = 'Byline jobs: ' . (string) ($cron['overdueCount'] ?? 0) . ' overdue; cron ' . (string) ($cron['status'] ?? 'unknown');
    }
    $lines[] = 'Last deployment: ' . (string) (($diagnostics['deployment']['lastStatus'] ?? 'Unknown'));
    $lines[] = '';
    $lines[] = 'This report intentionally excludes passwords, tokens, secrets, hook URLs, auth headers, and private integration configuration.';

    return implode("\n", $lines);
}

function byline_diagnostics_payload(): array
{
    $publication = byline_get_publication_config();
    $deployment = function_exists('byline_deployment_status')
        ? byline_deployment_status()
        : [
            'provider' => 'generic-hook',
            'providerLabel' => 'Generic Deploy Hook',
            'configured' => function_exists('wwh_cloudflare_deploy_hook_url') && wwh_cloudflare_deploy_hook_url() !== '',
            'lastTriggeredAt' => function_exists('wwh_cloudflare_deploy_last_trigger_time_label') ? wwh_cloudflare_deploy_last_trigger_time_label() : 'Never',
            'lastStatus' => function_exists('wwh_cloudflare_deploy_last_status_label') ? wwh_cloudflare_deploy_last_status_label() : 'Not triggered yet',
            'pending' => defined('WWH_CLOUDFLARE_DEPLOY_EVENT') && wp_next_scheduled(WWH_CLOUDFLARE_DEPLOY_EVENT) ? true : false,
        ];

    $runtime = byline_diagnostics_safe_runtime();
    $page_migration = function_exists('byline_get_weekly_page_migration_report')
        ? byline_get_weekly_page_migration_report()
        : ['legacyPages' => [], 'correctionFailures' => []];
    $health_checks = function_exists('byline_get_health_checks') ? byline_get_health_checks() : [];
    $rest_health = $runtime['routePresence'] === []
        || (!in_array(false, array_values($runtime['routePresence']), true)
            && !in_array(null, array_values($runtime['routePresence']), true));
    $payload = [
        'pluginVersion' => BYLINE_PLUGIN_VERSION,
        'protocolVersion' => BYLINE_PROTOCOL_VERSION,
        'publicationSchemaVersion' => BYLINE_PUBLICATION_SCHEMA_VERSION,
        'designSchemaVersion' => BYLINE_DESIGN_SCHEMA_VERSION,
        'themeApiVersion' => BYLINE_THEME_API_VERSION,
        'wordpressVersion' => get_bloginfo('version'),
        'phpVersion' => PHP_VERSION,
        'siteUrl' => $runtime['siteUrl'],
        'homeUrl' => $runtime['homeUrl'],
        'theme' => ['id' => $publication['appearance']['theme'], 'version' => 1, 'compatible' => true],
        'enabledModules' => array_keys(array_filter($publication['features'])),
        'deployment' => $deployment,
        'publicManifest' => byline_public_manifest_diagnostic(),
        'restHealth' => $rest_health,
        'designsNeedingMigration' => byline_design_migration_count(),
        'polls' => function_exists('byline_poll_diagnostics') ? byline_poll_diagnostics() : null,
        'schemaVersions' => $runtime['schemaVersions'],
        'pageMigration' => $page_migration,
        'assetPresence' => $runtime['assetPresence'],
        'tablePresence' => $runtime['tablePresence'],
        'routePresence' => $runtime['routePresence'],
        'cronAvailable' => $runtime['cronAvailable'],
        'jobs' => function_exists('byline_jobs_diagnostics') ? byline_jobs_diagnostics() : null,
        'healthChecks' => $health_checks,
        'sports' => function_exists('byline_sports_health') ? byline_sports_health() : null,
    ];

    $payload['healthSummary'] = function_exists('byline_health_summary')
        ? byline_health_summary($health_checks)
        : ['status' => 'unknown', 'good' => 0, 'recommended' => 0, 'critical' => 0];
    $payload['supportReport'] = byline_diagnostics_support_report($payload);

    return $payload;
}

function byline_diagnostics_action_value($request): string
{
    if (is_object($request) && method_exists($request, 'get_json_params')) {
        $body = $request->get_json_params();
        if (is_array($body) && isset($body['action']) && is_scalar($body['action'])) {
            return sanitize_key((string) $body['action']);
        }
    }

    if (is_object($request) && method_exists($request, 'get_param')) {
        $value = $request->get_param('action');
        return is_scalar($value) ? sanitize_key((string) $value) : '';
    }

    return '';
}

/**
 * Run only explicitly allow-listed, administrator-triggered diagnostics work.
 * Every repair is idempotent or read-only. The explicit deployment test may
 * send one authorized external request. None of these actions changes
 * publication content.
 *
 * @return array{ok:bool,message:string}
 */
function byline_diagnostics_run_action(string $action): array
{
    $action = sanitize_key($action);

    if ($action === 'health') {
        return ['ok' => true, 'message' => 'Byline checks completed.'];
    }

    if ($action === 'run-jobs') {
        if (!function_exists('byline_jobs_run_due')) {
            return ['ok' => false, 'message' => 'The Byline job runner is not available in this install.'];
        }
        try {
            $results = byline_jobs_run_due(10, null, 'doctor');
        } catch (Throwable $exception) {
            return ['ok' => false, 'message' => 'Scheduled Byline work could not be run. Check the job diagnostics and try again.'];
        }

        return [
            'ok' => true,
            'message' => sprintf('Scheduled Byline work checked; %d job%s ran.', count(is_array($results) ? $results : []), count(is_array($results) ? $results : []) === 1 ? '' : 's'),
        ];
    }

    if ($action === 'test-public-manifest') {
        $manifest = byline_public_manifest_diagnostic();
        return [
            'ok' => !empty($manifest['reachable']),
            'message' => !empty($manifest['reachable'])
                ? 'The public manifest responded successfully.'
                : 'The public manifest could not be verified.',
        ];
    }

    if ($action === 'repair-capabilities') {
        if (!function_exists('byline_add_administrator_capabilities')) {
            return ['ok' => false, 'message' => 'Byline capability repair is not available in this install.'];
        }
        try {
            $repaired = byline_add_administrator_capabilities();
        } catch (Throwable $exception) {
            $repaired = false;
        }

        return [
            'ok' => $repaired === true,
            'message' => $repaired === true
                ? 'Byline capabilities were checked and repaired if needed.'
                : 'Byline capabilities could not be repaired. Check database permissions and try again.',
        ];
    }

    if ($action === 'refresh-rewrite-rules') {
        if (!function_exists('flush_rewrite_rules')) {
            return ['ok' => false, 'message' => 'WordPress rewrite rules could not be refreshed in this request.'];
        }
        try {
            flush_rewrite_rules(false);
            if (defined('BYLINE_REWRITE_VERSION_OPTION') && defined('BYLINE_REWRITE_VERSION')) {
                update_option(BYLINE_REWRITE_VERSION_OPTION, BYLINE_REWRITE_VERSION, false);
            }
            if (defined('BYLINE_REWRITE_FLUSH_NEEDED_OPTION')) {
                delete_option(BYLINE_REWRITE_FLUSH_NEEDED_OPTION);
            }
        } catch (Throwable $exception) {
            return ['ok' => false, 'message' => 'WordPress rewrite rules could not be refreshed. Try again or ask an administrator to check the site.'];
        }

        return ['ok' => true, 'message' => 'WordPress rewrite rules were refreshed.'];
    }

    if ($action === 'retry-migration') {
        if (!function_exists('byline_maybe_upgrade')) {
            return ['ok' => false, 'message' => 'Byline setup repair is not available in this install.'];
        }
        try {
            $result = byline_maybe_upgrade(true);
        } catch (Throwable $exception) {
            $result = ['failed' => ['unknown']];
        }
        $failed = is_array($result) && is_array($result['failed'] ?? null) ? $result['failed'] : ['unknown'];

        return [
            'ok' => $failed === [],
            'message' => $failed === []
                ? 'Byline setup checks completed.'
                : 'Some Byline setup steps still need attention. No publication content was reset.',
        ];
    }

    if ($action === 'test-deploy-hook') {
        if (!function_exists('byline_trigger_deployment')) {
            return ['ok' => false, 'message' => 'Deployment testing is not available in this install.'];
        }
        try {
            byline_trigger_deployment('doctor');
            $status = function_exists('byline_deployment_status') ? byline_deployment_status() : [];
        } catch (Throwable $exception) {
            return ['ok' => false, 'message' => 'The deploy hook test failed before a response was recorded.'];
        }
        $last_status = (string) ($status['lastStatus'] ?? '');
        $ok = preg_match('/^HTTP 2\d\d$/', $last_status) === 1;

        return [
            'ok' => $ok,
            'message' => $ok
                ? 'The deploy hook responded successfully.'
                : 'The deploy hook did not respond successfully. Check deployment settings and try again.',
        ];
    }

    return ['ok' => false, 'message' => 'That Byline Doctor action is not available.'];
}

function byline_diagnostics_action_permission($request)
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        return new WP_Error('byline_diagnostics_forbidden', 'You are not allowed to run Byline Doctor actions.', ['status' => 403]);
    }

    $integration_capability = defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY')
        ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY
        : 'manage_byline_integrations';
    if (byline_diagnostics_action_value($request) === 'test-deploy-hook'
        && !current_user_can($integration_capability)) {
        return new WP_Error('byline_diagnostics_deployment_forbidden', 'You are not allowed to test the deployment hook.', ['status' => 403]);
    }

    return true;
}

function byline_diagnostics_action_route($request)
{
    $action = byline_diagnostics_action_value($request);
    $result = byline_diagnostics_run_action($action);
    $payload = byline_diagnostics_payload();
    $payload['action'] = $action;
    $payload['actionResult'] = $result;

    return rest_ensure_response($payload);
}

function byline_register_diagnostics_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/diagnostics', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => static fn() => rest_ensure_response(byline_diagnostics_payload()),
            'permission_callback' => static fn() => current_user_can(BYLINE_MANAGE_CAPABILITY),
        ],
        [
            'methods' => defined('WP_REST_Server::CREATABLE') ? WP_REST_Server::CREATABLE : 'POST',
            'callback' => 'byline_diagnostics_action_route',
            'permission_callback' => 'byline_diagnostics_action_permission',
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_diagnostics_route');
