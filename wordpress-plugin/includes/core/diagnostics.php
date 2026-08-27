<?php

if (!defined('ABSPATH')) {
    exit;
}

function byline_public_manifest_diagnostic(): array
{
    $public_site = (string) (byline_get_publication_config()['urls']['publicSite'] ?? '');
    if ($public_site === '' || !function_exists('wp_safe_remote_get')) {
        return ['reachable' => false, 'status' => 'Not configured'];
    }

    $url = rtrim($public_site, '/') . '/_byline/manifest.json';
    try {
        $response = wp_safe_remote_get($url, [
        'timeout' => 3,
        'redirection' => 2,
        'headers' => ['User-Agent' => 'Byline diagnostics'],
        ]);
    } catch (Throwable $exception) {
        return ['reachable' => false, 'status' => 'Request failed'];
    }
    if (is_wp_error($response)) {
        return ['reachable' => false, 'status' => 'Request failed'];
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $manifest = json_decode((string) wp_remote_retrieve_body($response), true);
    return [
        'reachable' => $code >= 200 && $code < 300 && is_array($manifest),
        'status' => 'HTTP ' . $code,
        'protocolVersion' => is_array($manifest) ? (int) ($manifest['protocolVersion'] ?? 0) : 0,
        'frontendVersion' => is_array($manifest) ? sanitize_text_field((string) ($manifest['frontendVersion'] ?? '')) : '',
        'publicationRevision' => is_array($manifest) ? (int) ($manifest['publicationRevision'] ?? 0) : 0,
    ];
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
        'assetPresence' => $runtime['assetPresence'],
        'tablePresence' => $runtime['tablePresence'],
        'routePresence' => $runtime['routePresence'],
        'cronAvailable' => $runtime['cronAvailable'],
        'healthChecks' => $health_checks,
        'sports' => function_exists('byline_sports_health') ? byline_sports_health() : null,
    ];

    $payload['healthSummary'] = function_exists('byline_health_summary')
        ? byline_health_summary($health_checks)
        : ['status' => 'unknown', 'good' => 0, 'recommended' => 0, 'critical' => 0];
    $payload['supportReport'] = byline_diagnostics_support_report($payload);

    return $payload;
}

function byline_register_diagnostics_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/diagnostics', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => static fn() => rest_ensure_response(byline_diagnostics_payload()),
        'permission_callback' => static fn() => current_user_can(BYLINE_MANAGE_CAPABILITY),
    ]);
}
add_action('rest_api_init', 'byline_register_diagnostics_route');
