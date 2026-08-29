<?php
/**
 * Plugin Name: Byline E2E manifest fixture
 *
 * Test-only WordPress environment support. The production diagnostic uses
 * wp_safe_remote_get(), which correctly rejects loopback/private addresses;
 * this fixture preempts one reserved test hostname at the HTTP API boundary so
 * the browser test can control a real manifest response without weakening
 * production URL safety.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_E2E_MANIFEST_REVISION_OPTION = 'byline_e2e_manifest_revision';
const BYLINE_E2E_MANIFEST_REQUESTS_OPTION = 'byline_e2e_manifest_requests';
const BYLINE_E2E_MANIFEST_HOST = 'byline-e2e.invalid';

function byline_e2e_manifest_fixture_response(string $url)
{
    $parsed = wp_parse_url($url);
    if (!is_array($parsed)
        || strtolower((string) ($parsed['host'] ?? '')) !== BYLINE_E2E_MANIFEST_HOST
        || (string) ($parsed['path'] ?? '') !== '/_byline/manifest.json') {
        return false;
    }

    $requests = absint(get_option(BYLINE_E2E_MANIFEST_REQUESTS_OPTION, 0)) + 1;
    update_option(BYLINE_E2E_MANIFEST_REQUESTS_OPTION, $requests, false);
    $revision = max(0, absint(get_option(BYLINE_E2E_MANIFEST_REVISION_OPTION, 0)));

    return [
        'headers' => ['content-type' => 'application/json'],
        'body' => wp_json_encode([
            'protocolVersion' => 1,
            'frontendVersion' => 'byline-e2e',
            'publicationRevision' => $revision,
            'contentRevision' => $revision,
            'designRevisions' => [],
        ]),
        'response' => ['code' => 200, 'message' => 'OK'],
        'cookies' => [],
        'filename' => null,
    ];
}

add_filter('pre_http_request', static function ($preempt, array $parsed_args, string $url) {
    $fixture = byline_e2e_manifest_fixture_response($url);
    return $fixture === false ? $preempt : $fixture;
}, 10, 3);

function byline_e2e_manifest_fixture_state(): array
{
    return [
        'revision' => max(0, absint(get_option(BYLINE_E2E_MANIFEST_REVISION_OPTION, 0))),
        'requests' => max(0, absint(get_option(BYLINE_E2E_MANIFEST_REQUESTS_OPTION, 0))),
    ];
}

function byline_e2e_manifest_fixture_update(WP_REST_Request $request)
{
    $body = $request->get_json_params();
    $revision = max(0, absint(is_array($body) ? ($body['revision'] ?? 0) : 0));
    update_option(BYLINE_E2E_MANIFEST_REVISION_OPTION, $revision, false);
    if (is_array($body) && !empty($body['resetRequests'])) {
        update_option(BYLINE_E2E_MANIFEST_REQUESTS_OPTION, 0, false);
    }

    return rest_ensure_response(byline_e2e_manifest_fixture_state());
}

function byline_e2e_manifest_fixture_read()
{
    return rest_ensure_response(byline_e2e_manifest_fixture_state());
}

add_action('rest_api_init', static function (): void {
    register_rest_route('byline/v1', '/e2e/manifest', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_e2e_manifest_fixture_read',
            'permission_callback' => static fn() => current_user_can('manage_options'),
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_e2e_manifest_fixture_update',
            'permission_callback' => static fn() => current_user_can('manage_options'),
        ],
    ]);
});
