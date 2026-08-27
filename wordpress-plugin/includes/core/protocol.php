<?php

if (!defined('ABSPATH')) {
    exit;
}

// These are public compatibility versions, not storage migration flags.
// Legacy WWH identifiers remain the installed storage/update contract.
const BYLINE_PROTOCOL_VERSION = 1;
const BYLINE_PLUGIN_VERSION = '0.2.4';
const BYLINE_PUBLICATION_SCHEMA_VERSION = 1;

// The design schema this plugin *advertises* to frontends, which check it with
// strict equality. It is not the schema Studio writes.
//
// Studio writes schema 2 and the frontend reads 1 and 2 -- see
// BYLINE_DESIGN_WRITE_SCHEMA_VERSION / BYLINE_DESIGN_READ_SCHEMA_VERSIONS in
// packages/design. Storage accepts both (byline_validate_design_document).
// This constant only moves to 2 once every package has been extracted and
// schema 1 support is dropped, because raising it breaks every deployed
// frontend pinned to 1.
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
