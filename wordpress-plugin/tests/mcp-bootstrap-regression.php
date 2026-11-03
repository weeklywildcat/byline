<?php
/** The optional modern runtime must not make ordinary PHP 7.4 plugin loads fail. */
define('ABSPATH', __DIR__ . '/');
$hooks = [];
function add_action($name, $callback, $priority = 10, $args = 1) { global $hooks; $hooks[$name][] = [$callback, $priority]; }
function home_url($path = '') { return 'https://cms.example.test' . $path; }
function untrailingslashit($value) { return rtrim($value, '/'); }
function wp_parse_url($url, $part = -1) { return parse_url($url, $part); }
require dirname(__DIR__) . '/includes/mcp/bootstrap.php';
foreach (['/mcp','/mcp/authorize','/mcp/token','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource/mcp'] as $path) {
    if (!byline_mcp_is_path($path)) { throw new RuntimeException('Missing plugin MCP path: ' . $path); }
}
foreach (['/','/wp-admin/','/wp-json/byline/v1/editorial/home','/mcps','/mcp-other'] as $path) {
    if (byline_mcp_is_path($path)) { throw new RuntimeException('MCP intercepted a different CMS route.'); }
}
if (byline_mcp_endpoint() !== 'https://cms.example.test/mcp' || $hooks['parse_request'][0][1] !== 0) { throw new RuntimeException('CMS endpoint or redirect ordering changed.'); }
if (PHP_VERSION_ID < 80200 && (byline_mcp_available() || byline_mcp_load())) { throw new RuntimeException('Unsupported PHP attempted to load the modern runtime.'); }
echo "MCP loader and route compatibility checks passed.\n";
