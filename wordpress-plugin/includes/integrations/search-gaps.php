<?php

/**
 * Anonymous aggregate storage for public zero-result searches.
 *
 * This is deliberately separate from the article/search index.  The table
 * stores only a normalized query, UTC day, result bucket, and an aggregate
 * counter; no cookie, user, IP, or user-agent value ever reaches storage.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_SEARCH_GAPS_TABLE_SUFFIX = 'byline_search_gaps';
const BYLINE_SEARCH_GAPS_SCHEMA_VERSION_OPTION = 'byline_search_gaps_schema_version';
const BYLINE_SEARCH_GAPS_SCHEMA_VERSION = 1;
const BYLINE_SEARCH_GAPS_RETENTION_DAYS = 90;
const BYLINE_SEARCH_GAPS_CLEANUP_HOOK = 'byline_search_gaps_cleanup';

function byline_search_gaps_table(): string
{
    global $wpdb;

    return isset($wpdb->prefix) ? $wpdb->prefix . BYLINE_SEARCH_GAPS_TABLE_SUFFIX : BYLINE_SEARCH_GAPS_TABLE_SUFFIX;
}

function byline_search_gaps_table_sql(): string
{
    global $wpdb;

    $charset_collate = isset($wpdb) && is_object($wpdb) && method_exists($wpdb, 'get_charset_collate')
        ? $wpdb->get_charset_collate()
        : '';

    return "CREATE TABLE " . byline_search_gaps_table() . " (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    query varchar(120) NOT NULL,
    query_hash char(64) NOT NULL,
    day date NOT NULL,
    result_bucket varchar(16) NOT NULL,
    aggregate_count bigint(20) unsigned NOT NULL DEFAULT 0,
    updated_at datetime NOT NULL,
    PRIMARY KEY  (id),
    UNIQUE KEY query_day_bucket (query_hash,day,result_bucket),
    KEY day (day),
    KEY aggregate_count (aggregate_count)
) {$charset_collate}";
}

function byline_search_gaps_table_exists(): bool
{
    global $wpdb;

    if (!isset($wpdb) || !is_object($wpdb) || !method_exists($wpdb, 'get_var')) {
        return false;
    }

    $table = byline_search_gaps_table();
    if (method_exists($wpdb, 'prepare')) {
        return (string) $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
    }

    $escaped_table = function_exists('esc_sql') ? esc_sql($table) : addslashes($table);
    return (string) $wpdb->get_var("SHOW TABLES LIKE '" . $escaped_table . "'") === $table;
}

function byline_search_gaps_install_schema(): bool
{
    if (!function_exists('dbDelta')) {
        if (defined('ABSPATH') && file_exists(ABSPATH . 'wp-admin/includes/upgrade.php')) {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        }
    }

    if (!function_exists('dbDelta') || !byline_search_gaps_table_sql()) {
        return false;
    }

    dbDelta(byline_search_gaps_table_sql());
    if (!byline_search_gaps_table_exists()) {
        return false;
    }

    update_option(BYLINE_SEARCH_GAPS_SCHEMA_VERSION_OPTION, BYLINE_SEARCH_GAPS_SCHEMA_VERSION, false);
    return (int) get_option(BYLINE_SEARCH_GAPS_SCHEMA_VERSION_OPTION, 0) >= BYLINE_SEARCH_GAPS_SCHEMA_VERSION;
}

function byline_search_gaps_ensure_schema(): bool
{
    if ((int) get_option(BYLINE_SEARCH_GAPS_SCHEMA_VERSION_OPTION, 0) < BYLINE_SEARCH_GAPS_SCHEMA_VERSION
        || !byline_search_gaps_table_exists()) {
        return byline_search_gaps_install_schema();
    }

    return true;
}

function byline_search_gaps_normalize_query($value): string
{
    if (!is_scalar($value)) {
        return '';
    }

    $query = function_exists('sanitize_text_field') ? sanitize_text_field((string) $value) : trim(strip_tags((string) $value));
    $query = preg_replace('/\s+/u', ' ', trim($query)) ?: '';
    if (function_exists('mb_strtolower')) {
        $query = mb_strtolower($query, 'UTF-8');
    } else {
        $query = strtolower($query);
    }

    if ($query === '' || strlen($query) > 120 || preg_match('/(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:$|\s)/', $query) === 1) {
        return '';
    }

    return $query;
}

function byline_search_gaps_result_bucket($value): string
{
    $bucket = sanitize_key((string) $value);
    return $bucket === '0' ? '0' : '';
}

function byline_search_gaps_allowed_origin(string $origin): string
{
    $origin = trim($origin);
    if ($origin === '') {
        return '';
    }

    if (function_exists('byline_feedback_allowed_cors_origin')) {
        return (string) byline_feedback_allowed_cors_origin($origin);
    }

    $configured = function_exists('byline_get_publication_config')
        ? (string) (byline_get_publication_config()['urls']['publicSite'] ?? '')
        : '';
    $configured = rtrim($configured, '/');
    if ($configured !== '' && rtrim($origin, '/') === $configured) {
        return $configured;
    }

    // Local development is explicit and limited to loopback origins.
    if (defined('WP_DEBUG') && WP_DEBUG && preg_match('#^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$#i', $origin) === 1) {
        return rtrim($origin, '/');
    }

    return '';
}

function byline_search_gaps_record(array $event): bool
{
    $query = byline_search_gaps_normalize_query($event['query'] ?? '');
    $bucket = byline_search_gaps_result_bucket($event['resultCountBucket'] ?? '');
    if ($query === '' || $bucket === '') {
        return false;
    }

    global $wpdb;
    if (!isset($wpdb) || !is_object($wpdb)) {
        return false;
    }
    if (!byline_search_gaps_table_exists() || !method_exists($wpdb, 'query') || !method_exists($wpdb, 'prepare')) {
        return false;
    }

    $now = gmdate('Y-m-d H:i:s');
    $day = gmdate('Y-m-d');
    $hash = hash('sha256', $query);
    $sql = "INSERT INTO " . byline_search_gaps_table() . " (query,query_hash,day,result_bucket,aggregate_count,updated_at)
        VALUES (%s,%s,%s,%s,1,%s)
        ON DUPLICATE KEY UPDATE aggregate_count = aggregate_count + 1, updated_at = VALUES(updated_at)";

    return (bool) $wpdb->query($wpdb->prepare($sql, $query, $hash, $day, $bucket, $now));
}

/** @return array<int,array{query:string,count:int}> */
function byline_search_gaps_top(int $limit = 20): array
{
    global $wpdb;
    $limit = max(1, min(100, $limit));
    if (!isset($wpdb) || !is_object($wpdb) || !method_exists($wpdb, 'get_results') || !byline_search_gaps_table_exists()) {
        return [];
    }

    $day_seconds = defined('DAY_IN_SECONDS') ? DAY_IN_SECONDS : 86400;
    $cutoff = gmdate('Y-m-d', time() - (BYLINE_SEARCH_GAPS_RETENTION_DAYS * $day_seconds));
    if (method_exists($wpdb, 'prepare')) {
        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT query, aggregate_count FROM ' . byline_search_gaps_table() . ' WHERE day >= %s AND result_bucket = %s ORDER BY aggregate_count DESC, query ASC LIMIT %d',
            $cutoff,
            '0',
            $limit
        ), defined('ARRAY_A') ? ARRAY_A : 'ARRAY_A');
    } else {
        $rows = [];
    }

    $result = [];
    foreach (is_array($rows) ? $rows : [] as $row) {
        if (!is_array($row)) {
            continue;
        }
        $query = byline_search_gaps_normalize_query($row['query'] ?? '');
        $count = absint($row['aggregate_count'] ?? 0);
        if ($query !== '' && $count > 0) {
            $result[] = ['query' => $query, 'count' => $count];
        }
    }

    return $result;
}

function byline_search_gaps_cleanup(): void
{
    global $wpdb;
    if (!isset($wpdb) || !is_object($wpdb) || !method_exists($wpdb, 'query') || !method_exists($wpdb, 'prepare') || !byline_search_gaps_table_exists()) {
        return;
    }

    $day_seconds = defined('DAY_IN_SECONDS') ? DAY_IN_SECONDS : 86400;
    $cutoff = gmdate('Y-m-d', time() - (BYLINE_SEARCH_GAPS_RETENTION_DAYS * $day_seconds));
    $wpdb->query($wpdb->prepare('DELETE FROM ' . byline_search_gaps_table() . ' WHERE day < %s', $cutoff));
}

function byline_search_gaps_register_cron(): void
{
    if (!function_exists('wp_next_scheduled') || !function_exists('wp_schedule_event')) {
        return;
    }
    if (!wp_next_scheduled(BYLINE_SEARCH_GAPS_CLEANUP_HOOK)) {
        wp_schedule_event(time() + (defined('DAY_IN_SECONDS') ? DAY_IN_SECONDS : 86400), 'daily', BYLINE_SEARCH_GAPS_CLEANUP_HOOK);
    }
}

function byline_search_gaps_request_origin($request): string
{
    return is_object($request) && method_exists($request, 'get_header') ? (string) $request->get_header('origin') : '';
}

function byline_search_gaps_permission($request)
{
    $origin = byline_search_gaps_request_origin($request);
    if ($origin !== '' && byline_search_gaps_allowed_origin($origin) === '') {
        return new WP_Error('byline_search_gaps_origin_not_allowed', 'Search metrics are not accepted from this site.', ['status' => 403]);
    }
    return true;
}

function byline_search_gaps_rest_options($request = null): WP_REST_Response
{
    return new WP_REST_Response(null, 204);
}

function byline_search_gaps_rest_record($request = null): WP_REST_Response
{
    $body = is_object($request) && method_exists($request, 'get_json_params') ? $request->get_json_params() : [];
    $stored = is_array($body) ? byline_search_gaps_record($body) : false;
    // Do not disclose whether a query was rejected or whether storage is
    // currently installed; public search must remain unaffected either way.
    return rest_ensure_response(['accepted' => $stored]);
}

function byline_search_gaps_rest_cors($served, $result, $request, $server)
{
    if (!is_object($request) || !method_exists($request, 'get_route') || strpos((string) $request->get_route(), '/byline/v1/search-gaps') === false) {
        return $served;
    }

    $origin = byline_search_gaps_request_origin($request);
    $allowed = byline_search_gaps_allowed_origin($origin);
    if ($allowed !== '' && !headers_sent()) {
        header('Access-Control-Allow-Origin: ' . $allowed);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
    }
    return $served;
}

function byline_register_search_gaps_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }

    register_rest_route('byline/v1', '/search-gaps', [
        [
            'methods' => 'OPTIONS',
            'callback' => 'byline_search_gaps_rest_options',
            'permission_callback' => 'byline_search_gaps_permission',
        ],
        [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'byline_search_gaps_rest_record',
            'permission_callback' => 'byline_search_gaps_permission',
        ],
    ]);
}

function byline_register_search_gaps_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('init', 'byline_search_gaps_register_cron');
        add_action(BYLINE_SEARCH_GAPS_CLEANUP_HOOK, 'byline_search_gaps_cleanup');
        add_action('rest_api_init', 'byline_register_search_gaps_routes');
    }
    if (function_exists('add_filter')) {
        add_filter('rest_pre_serve_request', 'byline_search_gaps_rest_cors', 10, 4);
    }
}
