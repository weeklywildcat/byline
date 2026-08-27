<?php

if (!defined('ABSPATH')) {
    exit;
}

function byline_public_manifest_diagnostic(): array
{
    $url = rtrim(byline_get_publication_config()['urls']['publicSite'], '/') . '/_byline/manifest.json';
    $response = wp_safe_remote_get($url, [
        'timeout' => 3,
        'redirection' => 2,
        'headers' => ['User-Agent' => 'Byline diagnostics'],
    ]);
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

    return [
        'pluginVersion' => BYLINE_PLUGIN_VERSION,
        'protocolVersion' => BYLINE_PROTOCOL_VERSION,
        'publicationSchemaVersion' => BYLINE_PUBLICATION_SCHEMA_VERSION,
        'designSchemaVersion' => BYLINE_DESIGN_SCHEMA_VERSION,
        'themeApiVersion' => BYLINE_THEME_API_VERSION,
        'wordpressVersion' => get_bloginfo('version'),
        'theme' => ['id' => $publication['appearance']['theme'], 'version' => 1, 'compatible' => true],
        'enabledModules' => array_keys(array_filter($publication['features'])),
        'deployment' => $deployment,
        'publicManifest' => byline_public_manifest_diagnostic(),
        'restHealth' => true,
        'designsNeedingMigration' => byline_design_migration_count(),
        'polls' => function_exists('byline_poll_diagnostics') ? byline_poll_diagnostics() : null,
    ];
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
