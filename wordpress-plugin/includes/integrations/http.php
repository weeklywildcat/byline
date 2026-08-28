<?php

/**
 * Small, private helpers shared by optional integrations.
 *
 * These helpers deliberately return normalized arrays instead of throwing
 * provider-specific exceptions.  Optional services must be able to fail
 * without taking down an editorial request, and request/response bodies are
 * never included in the returned error strings.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_INTEGRATION_MAX_RESPONSE_BYTES')) {
    define('BYLINE_INTEGRATION_MAX_RESPONSE_BYTES', 131072);
}

if (!defined('BYLINE_INTEGRATION_MAX_URL_LENGTH')) {
    define('BYLINE_INTEGRATION_MAX_URL_LENGTH', 2048);
}

function byline_integration_mask_secret($value, int $visible = 4): string
{
    $value = is_scalar($value) ? trim((string) $value) : '';
    if ($value === '') {
        return '';
    }

    $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($length <= $visible) {
        return str_repeat('•', max(4, $length));
    }

    $prefix = function_exists('mb_substr') ? mb_substr($value, 0, $visible) : substr($value, 0, $visible);
    return $prefix . str_repeat('•', 4);
}

function byline_integration_mask_url($value): string
{
    $value = is_string($value) ? trim($value) : '';
    if ($value === '' || !function_exists('wp_parse_url')) {
        return '';
    }

    $parts = wp_parse_url($value);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $masked = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
    if (isset($parts['port'])) {
        $masked .= ':' . absint($parts['port']);
    }
    $path = isset($parts['path']) ? (string) $parts['path'] : '';
    if ($path !== '') {
        $masked .= '/' . ltrim($path, '/');
    }

    // Queries and fragments may contain bearer tokens.  Never echo them in
    // an admin response, log line, or diagnostics payload.
    return function_exists('untrailingslashit') ? untrailingslashit($masked) : rtrim($masked, '/');
}

function byline_integration_private_ip($host): bool
{
    $host = trim((string) $host);
    if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) === false) {
        return false;
    }

    $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
    return filter_var($host, FILTER_VALIDATE_IP, $flags) === false;
}

function byline_integration_resolves_to_private_ip(string $host): bool
{
    $host = trim(strtolower($host));
    if ($host === '') {
        return true;
    }

    $blocked_names = [
        'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
        'metadata.google.internal', 'metadata', 'instance-data',
    ];
    if (in_array($host, $blocked_names, true)
        || substr($host, -10) === '.localhost'
        || substr($host, -6) === '.local'
        || substr($host, -9) === '.internal') {
        return true;
    }

    if (byline_integration_private_ip($host)) {
        return true;
    }

    // DNS lookups are only an additional guard.  WordPress's safe HTTP API
    // remains the final request gate, because a DNS answer can change after
    // this validation step.
    if (function_exists('gethostbynamel')) {
        $addresses = @gethostbynamel($host);
        if (is_array($addresses)) {
            foreach ($addresses as $address) {
                if (byline_integration_private_ip($address)) {
                    return true;
                }
            }
        }
    }
    if (function_exists('dns_get_record') && defined('DNS_AAAA')) {
        $records = @dns_get_record($host, DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                if (byline_integration_private_ip($record['ipv6'] ?? '')) {
                    return true;
                }
            }
        }
    }

    return false;
}

/**
 * Validate an outbound HTTPS URL.  $allowed_hosts is used for fixed official
 * provider endpoints; an empty list means a user-configured webhook and
 * therefore applies the stricter local/private-network checks.
 */
function byline_integration_safe_https_url($value, array $allowed_hosts = []): string
{
    $url = is_string($value) ? trim($value) : '';
    if ($url === '' || strlen($url) > BYLINE_INTEGRATION_MAX_URL_LENGTH) {
        return '';
    }

    $parts = function_exists('wp_parse_url') ? wp_parse_url($url) : parse_url($url);
    if (!is_array($parts)
        || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
        || trim((string) ($parts['host'] ?? '')) === ''
        || isset($parts['user'])
        || isset($parts['pass'])) {
        return '';
    }

    $host = strtolower(rtrim((string) $parts['host'], '.'));
    if (isset($parts['port']) && (int) $parts['port'] !== 443) {
        return '';
    }

    if ($allowed_hosts !== []) {
        $normalized_hosts = array_map(static function ($candidate): string {
            return strtolower(rtrim(trim((string) $candidate), '.'));
        }, $allowed_hosts);
        if (!in_array($host, $normalized_hosts, true)) {
            return '';
        }
    } elseif (byline_integration_resolves_to_private_ip($host)) {
        return '';
    }

    // esc_url_raw strips malformed control characters and unsupported URL
    // forms when WordPress is available.  Keep the fallback useful in small
    // standalone test harnesses.
    if (function_exists('esc_url_raw')) {
        $escaped = esc_url_raw($url, ['https']);
        if (!is_string($escaped) || $escaped === '') {
            return '';
        }
        $url = $escaped;
    }

    return $url;
}

function byline_integration_request_args(array $args = []): array
{
    $timeout = isset($args['timeout']) ? (int) $args['timeout'] : 10;
    $timeout = max(1, min(15, $timeout));
    $redirection = isset($args['redirection']) ? (int) $args['redirection'] : 0;
    $redirection = max(0, min(2, $redirection));

    $headers = is_array($args['headers'] ?? null) ? $args['headers'] : [];
    if (!isset($headers['User-Agent'])) {
        $headers['User-Agent'] = 'Byline optional integration';
    }

    $args['headers'] = $headers;
    $args['timeout'] = $timeout;
    $args['redirection'] = $redirection;
    $args['limit_response_size'] = min(
        BYLINE_INTEGRATION_MAX_RESPONSE_BYTES,
        max(1024, (int) ($args['limit_response_size'] ?? BYLINE_INTEGRATION_MAX_RESPONSE_BYTES))
    );
    $args['blocking'] = true;
    $args['reject_unsafe_urls'] = true;

    return $args;
}

function byline_integration_remote_request(string $method, string $url, array $args = [])
{
    $method = strtoupper($method);
    $args = byline_integration_request_args($args);
    $args['method'] = $method;

    $function = null;
    if (function_exists('wp_safe_remote_request')) {
        $function = 'wp_safe_remote_request';
    } elseif ($method === 'GET' && function_exists('wp_safe_remote_get')) {
        $function = 'wp_safe_remote_get';
        unset($args['method']);
    } elseif ($method === 'POST' && function_exists('wp_safe_remote_post')) {
        $function = 'wp_safe_remote_post';
        unset($args['method']);
    } elseif (function_exists('wp_remote_request')) {
        $function = 'wp_remote_request';
    }

    if ($function === null) {
        return ['ok' => false, 'response' => null, 'error' => 'WordPress HTTP is unavailable.'];
    }

    try {
        $response = $function($url, $args);
    } catch (Throwable $exception) {
        return ['ok' => false, 'response' => null, 'error' => 'The optional service could not be reached.'];
    }

    if (function_exists('is_wp_error') && is_wp_error($response)) {
        return ['ok' => false, 'response' => null, 'error' => 'The optional service could not be reached.'];
    }

    return ['ok' => true, 'response' => $response, 'error' => ''];
}

function byline_integration_response_code($response): int
{
    if (function_exists('wp_remote_retrieve_response_code')) {
        return (int) wp_remote_retrieve_response_code($response);
    }
    if (is_array($response)) {
        return (int) ($response['response']['code'] ?? $response['code'] ?? 0);
    }
    return 0;
}

function byline_integration_response_body($response): string
{
    if (function_exists('wp_remote_retrieve_body')) {
        return (string) wp_remote_retrieve_body($response);
    }
    if (is_array($response)) {
        return (string) ($response['body'] ?? '');
    }
    return '';
}

/** @return array{ok:bool,code:int,data:array,error:string} */
function byline_integration_remote_json(string $method, string $url, array $args = []): array
{
    $request = byline_integration_remote_request($method, $url, $args);
    if (empty($request['ok'])) {
        return ['ok' => false, 'code' => 0, 'data' => [], 'error' => (string) ($request['error'] ?? 'The optional service could not be reached.')];
    }

    $code = byline_integration_response_code($request['response']);
    $body = byline_integration_response_body($request['response']);
    $data = json_decode($body, true);
    if ($code < 200 || $code >= 300) {
        return [
            'ok' => false,
            'code' => $code,
            'data' => is_array($data) ? $data : [],
            'error' => $code > 0 ? sprintf('The optional service returned HTTP %d.', $code) : 'The optional service returned no HTTP status.',
        ];
    }

    return [
        'ok' => true,
        'code' => $code,
        'data' => is_array($data) ? $data : [],
        'error' => '',
    ];
}
