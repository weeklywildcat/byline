<?php

if (!defined('ABSPATH')) {
    exit;
}

// These are public compatibility versions, not storage migration flags.
// Legacy WWH identifiers remain the installed storage/update contract.
const BYLINE_PROTOCOL_VERSION = 1;
const BYLINE_PLUGIN_VERSION = '0.3.18';
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;

// Retained as a protocol compatibility field for older static builds.
const BYLINE_DESIGN_ADVERTISED_SCHEMA_VERSION = 1;

// Retained under the historical name for the storage validator and the existing
// regression harnesses; both refer to the advertised version above.
const BYLINE_DESIGN_SCHEMA_VERSION = BYLINE_DESIGN_ADVERTISED_SCHEMA_VERSION;
const BYLINE_THEME_API_VERSION = 1;
const BYLINE_REST_NAMESPACE = 'byline/v1';

function byline_protocol_manifest(): array
{
    return [
        'protocolVersion' => BYLINE_PROTOCOL_VERSION,
        'pluginVersion' => BYLINE_PLUGIN_VERSION,
        'publicationSchemaVersion' => BYLINE_PUBLICATION_SCHEMA_VERSION,
        'designSchemaVersion' => BYLINE_DESIGN_ADVERTISED_SCHEMA_VERSION,
        'themeApiVersion' => BYLINE_THEME_API_VERSION,
    ];
}

function byline_register_protocol_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/capabilities/protocol', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => static fn() => rest_ensure_response(byline_protocol_manifest()),
        'permission_callback' => '__return_true',
    ]);
}
add_action('rest_api_init', 'byline_register_protocol_route');
