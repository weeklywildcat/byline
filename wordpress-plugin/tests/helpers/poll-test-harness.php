<?php

/**
 * Minimal WordPress test double for the Byline poll modules.
 *
 * The poll regression suites run as plain PHP scripts, like the rest of this
 * plugin's harness. This file provides just enough WordPress: an in-memory post
 * and option store, an in-memory implementation of the poll vote table, and the
 * handful of helpers the poll code calls.
 *
 * Included from tests/*.php; the runner only executes tests/*.php directly, so
 * this file is linted but never run on its own.
 */

if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/../../');
}

if (!defined('ARRAY_A')) {
    define('ARRAY_A', 'ARRAY_A');
}

// Deterministic secret so signature and voter-key expectations are stable.
if (!defined('BYLINE_POLL_COOKIE_SECRET')) {
    define('BYLINE_POLL_COOKIE_SECRET', 'byline-poll-test-secret');
}

const BYLINE_REST_NAMESPACE = 'byline/v1';

$byline_test_options = [];
$byline_test_transients = [];
$byline_test_posts = [];
$byline_test_meta = [];
$byline_test_next_post_id = 100;
$byline_test_post_types = [];
$byline_test_rest_routes = [];
$byline_test_actions = [];
$byline_test_filters = [];
$byline_test_capabilities = ['edit_byline_polls' => true, 'edit_byline_poll' => true];
$byline_test_current_user_id = 7;
$byline_test_features = ['polls' => true];
$byline_test_roles = [];
$byline_test_notices = [];
$byline_test_redirects = [];

function byline_test_fail(string $message): void
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function byline_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        byline_test_fail('FAILED: ' . $message);
    }
}

// ---------------------------------------------------------------------------
// WordPress classes
// ---------------------------------------------------------------------------

class WP_Post
{
    public $ID = 0;
    public $post_type = 'post';
    public $post_status = 'publish';
    public $post_title = '';
    public $post_author = 0;
    public $post_date = '';
    public $post_date_gmt = '';
    public $post_modified = '';
    public $post_modified_gmt = '';

    public function __construct(array $data = [])
    {
        foreach ($data as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

class WP_Error
{
    private $code;
    private $message;
    private $data;

    public function __construct($code = '', $message = '', $data = null)
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code()
    {
        return $this->code;
    }

    public function get_error_message()
    {
        return $this->message;
    }
}

class WP_Role
{
    public $name;
    public $capabilities = [];

    public function __construct(string $name)
    {
        $this->name = $name;
    }

    public function add_cap(string $capability): void
    {
        $this->capabilities[$capability] = true;
    }
}

class WP_REST_Server
{
    public const READABLE = 'GET';
    public const CREATABLE = 'POST';
    public const EDITABLE = 'PUT';
}

class WP_REST_Response
{
    private $data;
    private $status;
    private $headers = [];

    public function __construct($data = null, int $status = 200)
    {
        $this->data = $data;
        $this->status = $status;
    }

    public function header(string $key, string $value, bool $replace = true): void
    {
        if ($replace) {
            $this->headers[$key] = [$value];
            return;
        }

        $this->headers[$key][] = $value;
    }

    public function get_data()
    {
        return $this->data;
    }

    public function get_status(): int
    {
        return $this->status;
    }

    public function get_headers(): array
    {
        return $this->headers;
    }

}

class WP_REST_Request implements ArrayAccess
{
    private $params;
    private $headers;
    private $body;

    public function __construct(array $params = [], array $headers = [], string $body = '')
    {
        $this->params = $params;
        $this->headers = array_change_key_case($headers, CASE_LOWER);
        $this->body = $body;
    }

    public function get_param(string $key)
    {
        return $this->params[$key] ?? null;
    }

    public function get_header(string $key): string
    {
        return (string) ($this->headers[strtolower($key)] ?? '');
    }

    public function get_body(): string
    {
        return $this->body;
    }

    #[\ReturnTypeWillChange]
    public function offsetExists($offset)
    {
        return isset($this->params[$offset]);
    }

    #[\ReturnTypeWillChange]
    public function offsetGet($offset)
    {
        return $this->params[$offset] ?? null;
    }

    #[\ReturnTypeWillChange]
    public function offsetSet($offset, $value)
    {
        $this->params[$offset] = $value;
    }

    #[\ReturnTypeWillChange]
    public function offsetUnset($offset)
    {
        unset($this->params[$offset]);
    }
}

/**
 * Prepared statement stand-in. Returning a structured object rather than an
 * interpolated string keeps the fake database honest about which values were
 * bound instead of re-parsing quoted SQL.
 */
class Byline_Test_Query
{
    public $sql;
    public $args;

    public function __construct(string $sql, array $args)
    {
        $this->sql = $sql;
        $this->args = $args;
    }
}

/**
 * In-memory stand-in for the poll vote table, including its unique
 * (poll_id, voter_key) constraint and MySQL's duplicate-key error number.
 */
class Byline_Test_WPDB
{
    public $prefix = 'wp_';
    public $last_error = '';
    public $dbh = null;
    public $rows = [];
    public $next_id = 1;
    public $installed = false;
    public $suppressed = false;
    public $insert_failure = null;
    public $insert_calls = 0;

    public function get_charset_collate(): string
    {
        return 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci';
    }

    public function suppress_errors($suppress = true)
    {
        $previous = $this->suppressed;
        $this->suppressed = (bool) $suppress;

        return $previous;
    }

    public function prepare(string $sql, ...$args)
    {
        return new Byline_Test_Query($sql, $args);
    }

    public function insert(string $table, array $data, array $formats = [])
    {
        $this->insert_calls++;
        $this->last_error = '';

        if ($this->insert_failure !== null) {
            $this->last_error = $this->insert_failure;
            return false;
        }

        foreach ($this->rows as $row) {
            if ($row['poll_id'] === $data['poll_id'] && $row['voter_key'] === $data['voter_key']) {
                $this->last_error = "Duplicate entry '" . $data['poll_id'] . '-' . $data['voter_key'] . "' for key 'poll_voter'";
                return false;
            }
        }

        $data['id'] = $this->next_id++;
        $this->rows[] = $data;

        return 1;
    }

    public function delete(string $table, array $where, array $formats = [])
    {
        $before = count($this->rows);
        $this->rows = array_values(array_filter($this->rows, static function (array $row) use ($where): bool {
            foreach ($where as $column => $value) {
                if (($row[$column] ?? null) !== $value) {
                    return true;
                }
            }

            return false;
        }));

        return $before - count($this->rows);
    }

    public function get_var($query)
    {
        $sql = $query instanceof Byline_Test_Query ? $query->sql : (string) $query;
        $args = $query instanceof Byline_Test_Query ? $query->args : [];

        if (strpos($sql, 'SHOW TABLES LIKE') !== false) {
            return $this->installed ? (string) ($args[0] ?? '') : null;
        }

        if (strpos($sql, 'COUNT(*)') !== false && strpos($sql, 'option_id = %s') !== false) {
            return (string) count($this->matching((string) $args[0], (string) $args[1]));
        }

        if (strpos($sql, 'COUNT(*)') !== false) {
            return (string) count($this->matching((string) $args[0]));
        }

        return null;
    }

    public function get_results($query, $output = ARRAY_A)
    {
        $sql = $query instanceof Byline_Test_Query ? $query->sql : (string) $query;
        $args = $query instanceof Byline_Test_Query ? $query->args : [];

        if (strpos($sql, 'GROUP BY option_id') !== false) {
            $counts = [];
            foreach ($this->matching((string) $args[0]) as $row) {
                $counts[$row['option_id']] = ($counts[$row['option_id']] ?? 0) + 1;
            }

            $results = [];
            foreach ($counts as $option_id => $votes) {
                $results[] = ['option_id' => $option_id, 'votes' => $votes];
            }

            return $results;
        }

        if (strpos($sql, 'GROUP BY poll_id') !== false) {
            $counts = [];
            foreach ($this->rows as $row) {
                $counts[$row['poll_id']] = ($counts[$row['poll_id']] ?? 0) + 1;
            }

            $results = [];
            foreach ($counts as $poll_id => $votes) {
                $results[] = ['poll_id' => $poll_id, 'votes' => $votes];
            }

            return $results;
        }

        return [];
    }

    private function matching(string $poll_id, ?string $option_id = null): array
    {
        return array_values(array_filter($this->rows, static function (array $row) use ($poll_id, $option_id): bool {
            return $row['poll_id'] === $poll_id && ($option_id === null || $row['option_id'] === $option_id);
        }));
    }
}

$wpdb = new Byline_Test_WPDB();

// ---------------------------------------------------------------------------
// WordPress functions
// ---------------------------------------------------------------------------

function add_action(string $tag = '', $callback = null, ...$rest): void
{
    global $byline_test_actions;
    $byline_test_actions[$tag][] = $callback;
}

function add_filter(string $tag, $callback, int $priority = 10, int $accepted = 1): bool
{
    global $byline_test_filters;
    $byline_test_filters[$tag][] = $callback;

    return true;
}

function apply_filters(string $tag, $value, ...$args)
{
    global $byline_test_filters;
    foreach ($byline_test_filters[$tag] ?? [] as $callback) {
        $value = call_user_func_array($callback, array_merge([$value], $args));
    }

    return $value;
}

function do_action(string $tag, ...$args): void
{
    global $byline_test_actions;
    foreach ($byline_test_actions[$tag] ?? [] as $callback) {
        call_user_func_array($callback, $args);
    }
}

function register_post_type(string $type, array $args = []): void
{
    global $byline_test_post_types;
    $byline_test_post_types[$type] = $args;
}

function register_rest_route(string $namespace, string $route, array $definition): void
{
    global $byline_test_rest_routes;
    $byline_test_rest_routes[$namespace . $route] = $definition;
}

function get_option(string $option, $default = false)
{
    global $byline_test_options;

    return array_key_exists($option, $byline_test_options) ? $byline_test_options[$option] : $default;
}

function update_option(string $option, $value, $autoload = null): bool
{
    global $byline_test_options;
    $byline_test_options[$option] = $value;

    return true;
}

function add_option(string $option, $value = '', $deprecated = '', $autoload = null): bool
{
    global $byline_test_options;
    if (array_key_exists($option, $byline_test_options)) {
        return false;
    }

    $byline_test_options[$option] = $value;

    return true;
}

function delete_option(string $option): bool
{
    global $byline_test_options;
    unset($byline_test_options[$option]);

    return true;
}

function get_transient(string $key)
{
    global $byline_test_transients;

    return $byline_test_transients[$key] ?? false;
}

function set_transient(string $key, $value, int $expiration = 0): bool
{
    global $byline_test_transients;
    $byline_test_transients[$key] = $value;

    return true;
}

function delete_transient(string $key): bool
{
    global $byline_test_transients;
    unset($byline_test_transients[$key]);

    return true;
}

function get_post_meta(int $post_id, string $key = '', bool $single = false)
{
    global $byline_test_meta;
    $value = $byline_test_meta[$post_id][$key] ?? '';

    return $single ? $value : ($value === '' ? [] : [$value]);
}

function update_post_meta(int $post_id, string $key, $value): bool
{
    global $byline_test_meta;
    $byline_test_meta[$post_id][$key] = $value;

    return true;
}

function delete_post_meta(int $post_id, string $key): bool
{
    global $byline_test_meta;
    unset($byline_test_meta[$post_id][$key]);

    return true;
}

function get_post($post_id = null)
{
    global $byline_test_posts;
    $post_id = (int) ($post_id instanceof WP_Post ? $post_id->ID : $post_id);

    return $byline_test_posts[$post_id] ?? null;
}

function get_post_field(string $field, $post_id)
{
    $post = get_post($post_id);

    return $post instanceof WP_Post ? ($post->{$field} ?? '') : '';
}

function wp_insert_post(array $data, bool $wp_error = false)
{
    global $byline_test_posts, $byline_test_next_post_id;

    $id = $byline_test_next_post_id++;
    $created = $data['post_date_gmt'] ?? gmdate('Y-m-d H:i:s');
    $byline_test_posts[$id] = new WP_Post([
        'ID' => $id,
        'post_type' => $data['post_type'] ?? 'post',
        'post_status' => $data['post_status'] ?? 'publish',
        'post_title' => $data['post_title'] ?? '',
        'post_author' => (int) ($data['post_author'] ?? 0),
        'post_date' => $data['post_date'] ?? $created,
        'post_date_gmt' => $created,
        'post_modified' => $created,
        'post_modified_gmt' => $created,
    ]);

    return $id;
}

function wp_update_post(array $data, bool $wp_error = false)
{
    global $byline_test_posts;
    $id = (int) ($data['ID'] ?? 0);

    if (!isset($byline_test_posts[$id])) {
        return $wp_error ? new WP_Error('invalid_post', 'Unknown post.') : 0;
    }

    foreach ($data as $key => $value) {
        if ($key === 'ID') {
            continue;
        }

        $byline_test_posts[$id]->{$key} = $value;
    }

    return $id;
}

function wp_delete_post(int $post_id, bool $force = false)
{
    global $byline_test_posts;
    do_action('before_delete_post', $post_id);
    unset($byline_test_posts[$post_id]);

    return true;
}

function get_posts(array $args = []): array
{
    global $byline_test_posts, $byline_test_meta;

    $limit = (int) ($args['numberposts'] ?? $args['posts_per_page'] ?? 5);
    $status = $args['post_status'] ?? 'publish';
    $matches = [];

    foreach ($byline_test_posts as $post) {
        if (isset($args['post_type']) && $post->post_type !== $args['post_type']) {
            continue;
        }

        if ($status !== 'any' && !in_array($post->post_status, (array) $status, true)) {
            continue;
        }

        if ($status === 'any' && $post->post_status === 'trash') {
            continue;
        }

        if (isset($args['meta_key'])) {
            $value = $byline_test_meta[$post->ID][$args['meta_key']] ?? null;
            if ($value !== ($args['meta_value'] ?? null)) {
                continue;
            }
        }

        $matches[] = $post;
    }

    usort($matches, static function (WP_Post $left, WP_Post $right): int {
        return strcmp((string) $right->post_date_gmt, (string) $left->post_date_gmt);
    });

    return $limit > 0 ? array_slice($matches, 0, $limit) : $matches;
}

function get_date_from_gmt(string $gmt, string $format = 'Y-m-d H:i:s'): string
{
    try {
        $date = new DateTimeImmutable($gmt, new DateTimeZone('UTC'));
    } catch (Exception $exception) {
        return $gmt;
    }

    return $date->setTimezone(wp_timezone())->format($format);
}

function wp_timezone(): DateTimeZone
{
    return new DateTimeZone('America/New_York');
}

function wp_is_post_revision($post_id)
{
    return false;
}

function sanitize_text_field($value): string
{
    return trim(preg_replace('/\s+/', ' ', strip_tags((string) $value)) ?? '');
}

function sanitize_key($value): string
{
    return strtolower(preg_replace('/[^a-z0-9_-]/i', '', (string) $value) ?? '');
}

function esc_html($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function esc_attr($value): string
{
    return esc_html($value);
}

function esc_url($value): string
{
    return (string) $value;
}

function esc_url_raw($value, array $protocols = []): string
{
    return (string) $value;
}

function wp_kses_post($value): string
{
    return (string) $value;
}

function __($text, $domain = ''): string
{
    return (string) $text;
}

function esc_html__($text, $domain = ''): string
{
    return esc_html($text);
}

function esc_attr__($text, $domain = ''): string
{
    return esc_attr($text);
}

function checked($checked, $current = true, bool $echo = true): string
{
    $result = (string) $checked === (string) $current ? "checked='checked'" : '';
    if ($echo) {
        echo $result;
    }

    return $result;
}

function number_format_i18n($number, int $decimals = 0): string
{
    return number_format((float) $number, $decimals);
}

function wp_slash($value)
{
    return $value;
}

function wp_unslash($value)
{
    return $value;
}

function wp_json_encode($value)
{
    return json_encode($value);
}

function is_wp_error($value): bool
{
    return $value instanceof WP_Error;
}

function rest_ensure_response($value)
{
    return $value;
}

function current_user_can(string $capability, ...$args): bool
{
    global $byline_test_capabilities;

    return !empty($byline_test_capabilities[$capability]);
}

function get_current_user_id(): int
{
    global $byline_test_current_user_id;

    return $byline_test_current_user_id;
}

function get_role(string $name)
{
    global $byline_test_roles;

    if (!isset($byline_test_roles[$name])) {
        $byline_test_roles[$name] = new WP_Role($name);
    }

    return $byline_test_roles[$name];
}

function admin_url(string $path = ''): string
{
    return 'https://cms.example.test/wp-admin/' . $path;
}

function add_query_arg(array $args, string $url): string
{
    return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($args);
}

function wp_nonce_url(string $url, string $action): string
{
    return add_query_arg(['_wpnonce' => 'nonce-' . $action], $url);
}

function wp_nonce_field(string $action, string $name = '_wpnonce', bool $referer = true, bool $echo = true): string
{
    $field = '<input type="hidden" name="' . esc_attr($name) . '" value="nonce-' . esc_attr($action) . '" />';
    if ($echo) {
        echo $field;
    }

    return $field;
}

function wp_verify_nonce($nonce, $action = -1)
{
    return $nonce === 'nonce-' . $action ? 1 : false;
}

function check_admin_referer($action = -1, string $query_arg = '_wpnonce')
{
    $nonce = $_REQUEST[$query_arg] ?? '';
    if (!wp_verify_nonce($nonce, $action)) {
        throw new RuntimeException('nonce-failure:' . $action);
    }

    return 1;
}

function wp_die($message = '', $title = '', $args = [])
{
    throw new RuntimeException('wp_die:' . (string) $message);
}

function wp_safe_redirect(string $location, int $status = 302): void
{
    global $byline_test_redirects;
    $byline_test_redirects[] = $location;

    throw new RuntimeException('redirect:' . $location);
}

function wp_doing_ajax(): bool
{
    return false;
}

function nocache_headers(): void
{
}

function get_edit_post_link($post_id, string $context = 'display')
{
    return 'https://cms.example.test/wp-admin/post.php?post=' . (int) $post_id . '&action=edit';
}

function add_meta_box(...$args): void
{
}

function dbDelta($queries, bool $execute = true): array
{
    global $wpdb;
    $wpdb->installed = true;

    return [];
}

function byline_get_publication_config(): array
{
    global $byline_test_features;

    return ['features' => $byline_test_features];
}

// ---------------------------------------------------------------------------
// Poll modules under test
// ---------------------------------------------------------------------------

require __DIR__ . '/../../includes/polls/schema.php';
require __DIR__ . '/../../includes/polls/votes.php';
require __DIR__ . '/../../includes/polls/voter.php';
require __DIR__ . '/../../includes/polls/post-type.php';
require __DIR__ . '/../../includes/polls/model.php';
require __DIR__ . '/../../includes/polls/rest.php';
require __DIR__ . '/../../includes/polls/migration.php';

byline_poll_install_schema();

/**
 * Create a poll the way the editor would, returning its post id.
 *
 * @param array<int,string> $labels
 */
function byline_test_create_poll(
    string $question,
    array $labels,
    string $status = BYLINE_POLL_STATUS_OPEN,
    string $opens_at = '',
    string $closes_at = '',
    string $created_at = '',
    string $post_status = 'publish',
    ?string $poll_id = null
): int {
    $post_id = wp_insert_post([
        'post_type' => BYLINE_POLL_POST_TYPE,
        'post_status' => $post_status,
        'post_title' => $question,
        'post_author' => 7,
        'post_date_gmt' => $created_at !== '' ? $created_at : gmdate('Y-m-d H:i:s'),
    ]);

    if ($poll_id !== null) {
        update_post_meta($post_id, BYLINE_POLL_ID_META, $poll_id);
    }

    byline_poll_public_id($post_id);
    byline_poll_set_options($post_id, array_map(static function (string $label, int $index): array {
        return ['label' => $label, 'position' => $index];
    }, $labels, array_keys($labels)));
    byline_poll_set_status($post_id, $status);
    byline_poll_set_schedule($post_id, $opens_at, $closes_at);

    return $post_id;
}

function byline_test_vote_request(string $poll_id, string $option_id, string $cookie = ''): WP_REST_Request
{
    $body = json_encode(['pollId' => $poll_id, 'optionId' => $option_id]);

    return new WP_REST_Request(
        ['pollId' => $poll_id, 'optionId' => $option_id],
        $cookie !== '' ? ['Cookie' => $cookie, 'Content-Type' => 'application/json'] : ['Content-Type' => 'application/json'],
        (string) $body
    );
}

function byline_test_reset_rate_limit(): void
{
    global $byline_test_transients;
    foreach (array_keys($byline_test_transients) as $key) {
        if (strpos($key, 'byline_poll_rl_') === 0) {
            unset($byline_test_transients[$key]);
        }
    }
}
