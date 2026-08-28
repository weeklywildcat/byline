<?php

/**
 * Search-gap regression coverage: normalization/privacy, aggregate writes,
 * retention wiring, authorized reads, and exact-origin public ingestion.
 */

define('ABSPATH', __DIR__ . '/../');
define('DAY_IN_SECONDS', 86400);
define('ARRAY_A', 'ARRAY_A');
define('WP_DEBUG', true);

$options = [];
$routes = [];
$actions = [];
$filters = [];
$queries = [];
$can_edit = false;

class WP_Error
{
    public $code;
    public $message;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
    }
}

class WP_REST_Response
{
    public $data;
    public $status;

    public function __construct($data = null, $status = 200)
    {
        $this->data = $data;
        $this->status = $status;
    }
}

class WP_REST_Server
{
    const CREATABLE = 'POST';
}

class SearchGapDb
{
    public string $prefix = 'wp_';
    public array $rows = [
        ['query' => 'football', 'aggregate_count' => 8],
        ['query' => 'budget', 'aggregate_count' => 3],
    ];

    public function get_charset_collate(): string { return ''; }
    public function prepare(string $query, ...$args): string { return $query . '|' . implode('|', array_map('strval', $args)); }
    public function get_var(string $query): string { return 'wp_byline_search_gaps'; }
    public function query(string $query): bool { global $queries; $queries[] = $query; return true; }
    public function get_results(string $query, $format = null): array { global $queries; $queries[] = $query; return $this->rows; }
}

$wpdb = new SearchGapDb();

function search_gap_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function absint($value): int { return abs((int) $value); }
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$hook][] = $callback; }
function add_filter(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $filters; $filters[$hook][] = $callback; }
function register_rest_route(string $namespace, string $route, $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function esc_url_raw($value, array $protocols = []): string { return is_string($value) ? $value : ''; }
function rest_ensure_response($value) { return $value; }
function byline_get_publication_config(): array { return ['urls' => ['publicSite' => 'https://news.example.test']]; }
function wp_get_environment_type(): string { return 'development'; }

require __DIR__ . '/../includes/integrations/search-gaps.php';

search_gap_assert(byline_search_gaps_normalize_query('  Foo   BAR  ') === 'foo bar', 'Search-gap queries were not normalized consistently.');
search_gap_assert(byline_search_gaps_normalize_query('reader@example.test') === '', 'An email-looking search query was stored.');
search_gap_assert(byline_search_gaps_result_bucket('0') === '0' && byline_search_gaps_result_bucket('10') === '', 'Non-zero result buckets were accepted by the public zero-result endpoint.');
search_gap_assert(stripos(byline_search_gaps_table_sql(), 'ip') === false && stripos(byline_search_gaps_table_sql(), 'user_agent') === false, 'Search-gap schema contains a reader identifier.');
search_gap_assert(byline_search_gaps_record(['query' => 'Foo BAR', 'resultCountBucket' => '0']), 'Aggregate search-gap event was not stored.');
search_gap_assert(count($queries) === 1 && strpos($queries[0], 'aggregate_count') !== false, 'Search-gap writes did not use the aggregate upsert path.');

$top = byline_search_gaps_top(10);
search_gap_assert($top[0]['query'] === 'football' && $top[0]['count'] === 8, 'Authorized search-gap reads were not normalized.');
byline_search_gaps_cleanup();
search_gap_assert(count($queries) === 3 && strpos($queries[2], 'DELETE FROM') !== false, 'Search-gap cleanup did not use the bounded retention query.');

$allowed_request = new class {
    public function get_header(string $name): string { return $name === 'origin' ? 'https://news.example.test' : ''; }
};
$blocked_request = new class {
    public function get_header(string $name): string { return $name === 'origin' ? 'https://evil.example.test' : ''; }
};
search_gap_assert(byline_search_gaps_permission($allowed_request) === true, 'The configured public origin was rejected.');
search_gap_assert(byline_search_gaps_permission($blocked_request) instanceof WP_Error, 'An unrelated origin was allowed to write search metrics.');

byline_register_search_gaps_hooks();
byline_register_search_gaps_routes();
search_gap_assert(isset($actions['rest_api_init'], $actions[BYLINE_SEARCH_GAPS_CLEANUP_HOOK]), 'Search-gap hooks were not registered.');
search_gap_assert(isset($routes['byline/v1/search-gaps']), 'The public search-gap route was not registered.');

echo "Byline search-gap regression passed.\n";
