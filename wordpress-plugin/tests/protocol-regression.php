<?php

define('ABSPATH', __DIR__ . '/../');

function add_action(...$args): void
{
}

function register_rest_route(...$args): void
{
}

require __DIR__ . '/../includes/core/protocol.php';

$manifest = byline_protocol_manifest();
$expected_keys = [
    'protocolVersion',
    'pluginVersion',
    'publicationSchemaVersion',
    'designSchemaVersion',
    'themeApiVersion',
];

if (array_keys($manifest) !== $expected_keys) {
    fwrite(STDERR, "Protocol manifest contains unexpected public fields.\n");
    exit(1);
}

if ($manifest['protocolVersion'] !== 1
    || $manifest['publicationSchemaVersion'] !== 1
    || $manifest['designSchemaVersion'] !== 1
    || $manifest['themeApiVersion'] !== 1) {
    fwrite(STDERR, "Protocol versions changed without updating the compatibility regression.\n");
    exit(1);
}

$plugin_source = file_get_contents(__DIR__ . '/../weekly-wildcat-headless.php');
if (!is_string($plugin_source)
    || preg_match('/^[[:space:]]*\* Version:[[:space:]]*([^\s]+)/m', $plugin_source, $matches) !== 1
    || $matches[1] !== BYLINE_PLUGIN_VERSION) {
    fwrite(STDERR, "Protocol plugin version does not match the installed entrypoint header.\n");
    exit(1);
}

if (defined('WWH_REST_NAMESPACE')) {
    fwrite(STDERR, "Protocol regression must not depend on the legacy namespace being loaded.\n");
    exit(1);
}

echo "Byline protocol regression passed.\n";
