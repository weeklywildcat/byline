<?php

/**
 * Normalized, cached analytics reads for optional providers.
 *
 * Analytics is advisory.  A missing provider, stale cache, or provider error
 * yields a safe state object and never prevents an editor from loading or
 * saving a story.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('DAY_IN_SECONDS')) {
    define('DAY_IN_SECONDS', 86400);
}

if (!function_exists('byline_integration_remote_json')) {
    require_once __DIR__ . '/http.php';
}

if (!defined('BYLINE_ANALYTICS_SETTINGS_OPTION')) {
    define('BYLINE_ANALYTICS_SETTINGS_OPTION', 'byline_analytics_settings_v1');
}
if (!defined('BYLINE_ANALYTICS_TEST_OPTION')) {
    define('BYLINE_ANALYTICS_TEST_OPTION', 'byline_analytics_last_test_v1');
}
if (!defined('BYLINE_ANALYTICS_CACHE_PREFIX')) {
    define('BYLINE_ANALYTICS_CACHE_PREFIX', 'byline_analytics_cache_');
}
if (!defined('BYLINE_ANALYTICS_CACHE_TTL')) {
    define('BYLINE_ANALYTICS_CACHE_TTL', 300);
}

function byline_analytics_text($value, int $maximum = 240): string
{
    $value = is_scalar($value) ? (string) $value : '';
    $value = function_exists('sanitize_text_field') ? sanitize_text_field($value) : trim(strip_tags($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_analytics_provider_definitions(): array
{
    $definitions = [
        'none' => [
            'id' => 'none',
            'label' => 'Not connected',
            'description' => 'No remote analytics provider is configured.',
            'capabilities' => [],
            'fields' => [],
        ],
        'plausible' => [
            'id' => 'plausible',
            'label' => 'Plausible',
            'description' => 'Plausible Stats API v2 aggregate, trend, story, source, and bounded realtime reads.',
            'capabilities' => [
                'aggregate' => true,
                'trend' => true,
                'story' => true,
                'sources' => true,
                'realtime' => true,
            ],
            'fields' => [
                'apiKey' => ['label' => 'API key', 'type' => 'password', 'secret' => true],
                'siteId' => ['label' => 'Site ID or domain', 'type' => 'text'],
            ],
        ],
        'cloudflare' => [
            'id' => 'cloudflare',
            'label' => 'Cloudflare Analytics',
            'description' => 'Cloudflare Analytics GraphQL request, visit, byte, trend, and story-path reads.',
            // Cloudflare's httpRequestsAdaptiveGroups dataset does not expose
            // a unique-visitor/pageview equivalent.  Those metrics are not
            // advertised and are never synthesized from request counts.
            'capabilities' => ['aggregate' => true, 'trend' => true, 'story' => true],
            'fields' => [
                'apiToken' => ['label' => 'API token', 'type' => 'password', 'secret' => true],
                'zoneTag' => ['label' => 'Zone tag', 'type' => 'text'],
                'hostname' => ['label' => 'Hostname (optional)', 'type' => 'text'],
            ],
        ],
    ];
    if (function_exists('apply_filters')) {
        $filtered = apply_filters('byline_analytics_provider_definitions', $definitions);
        if (is_array($filtered)) {
            $definitions = $filtered;
        }
    }
    return $definitions;
}

function byline_analytics_provider_alias(string $provider): string
{
    $provider = strtolower(trim($provider));
    $aliases = ['cf' => 'cloudflare', 'cloudflare-graphql' => 'cloudflare', 'plausible-v2' => 'plausible'];
    return $aliases[$provider] ?? $provider;
}

function byline_analytics_environment_value(array $names): string
{
    foreach ($names as $name) {
        $value = getenv($name);
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }
    }
    return '';
}

function byline_analytics_raw_settings(): array
{
    $stored = get_option(BYLINE_ANALYTICS_SETTINGS_OPTION, []);
    $stored = is_array($stored) ? $stored : [];
    $settings = [
        'provider' => byline_analytics_provider_alias((string) ($stored['provider'] ?? '')),
        'plausible' => is_array($stored['plausible'] ?? null) ? $stored['plausible'] : [],
        'cloudflare' => is_array($stored['cloudflare'] ?? null) ? $stored['cloudflare'] : [],
    ];
    $plausible_key = trim((string) ($settings['plausible']['apiKey'] ?? ''));
    $plausible_site = trim((string) ($settings['plausible']['siteId'] ?? ''));
    $cloudflare_key = trim((string) ($settings['cloudflare']['apiToken'] ?? ''));
    $cloudflare_zone = trim((string) ($settings['cloudflare']['zoneTag'] ?? ''));
    if ($plausible_key === '') {
        $plausible_key = byline_analytics_environment_value(['BYLINE_PLAUSIBLE_API_KEY', 'PLAUSIBLE_API_KEY']);
        if ($plausible_key !== '') {
            $settings['plausible']['apiKey'] = $plausible_key;
        }
    }
    if ($plausible_site === '') {
        $plausible_site = byline_analytics_environment_value(['BYLINE_PLAUSIBLE_SITE_ID', 'PLAUSIBLE_SITE_ID', 'PLAUSIBLE_DOMAIN']);
        if ($plausible_site !== '') {
            $settings['plausible']['siteId'] = $plausible_site;
        }
    }
    if ($cloudflare_key === '') {
        $cloudflare_key = byline_analytics_environment_value(['BYLINE_CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CF_API_TOKEN']);
        if ($cloudflare_key !== '') {
            $settings['cloudflare']['apiToken'] = $cloudflare_key;
        }
    }
    if ($cloudflare_zone === '') {
        $cloudflare_zone = byline_analytics_environment_value(['BYLINE_CLOUDFLARE_ZONE_TAG', 'CLOUDFLARE_ZONE_TAG', 'CF_ZONE_TAG']);
        if ($cloudflare_zone !== '') {
            $settings['cloudflare']['zoneTag'] = $cloudflare_zone;
        }
    }
    if ($settings['provider'] === '' || !isset(byline_analytics_provider_definitions()[$settings['provider']])) {
        if ($plausible_key !== '' && $plausible_site !== '') {
            $settings['provider'] = 'plausible';
        } elseif ($cloudflare_key !== '' && $cloudflare_zone !== '') {
            $settings['provider'] = 'cloudflare';
        } else {
            $settings['provider'] = 'none';
        }
    }
    return $settings;
}

function byline_analytics_error(string $code, string $message)
{
    if (class_exists('WP_Error')) {
        return new WP_Error($code, $message, ['status' => 400]);
    }
    return ['error' => $code, 'message' => $message];
}

function byline_analytics_normalize_settings(array $input, array $previous = [])
{
    $previous = $previous !== [] ? $previous : byline_analytics_raw_settings();
    $provider = byline_analytics_provider_alias((string) ($input['provider'] ?? $previous['provider'] ?? 'none'));
    $definitions = byline_analytics_provider_definitions();
    if (!isset($definitions[$provider])) {
        return byline_analytics_error('byline_unknown_analytics_provider', 'Select a supported analytics provider.');
    }
    $result = [
        'provider' => $provider,
        'plausible' => is_array($previous['plausible'] ?? null) ? $previous['plausible'] : [],
        'cloudflare' => is_array($previous['cloudflare'] ?? null) ? $previous['cloudflare'] : [],
    ];
    $input_settings = is_array($input['settings'] ?? null) ? $input['settings'] : $input;
    $clear = is_array($input['clearSecrets'] ?? null) ? $input['clearSecrets'] : [];
    foreach (['plausible', 'cloudflare'] as $section) {
        if (!is_array($input_settings[$section] ?? null)) {
            continue;
        }
        foreach ($input_settings[$section] as $field => $value) {
            if (!is_string($field) || !in_array($field, ['apiKey', 'apiToken', 'siteId', 'zoneTag', 'hostname'], true)) {
                continue;
            }
            $is_secret = in_array($field, ['apiKey', 'apiToken'], true);
            if ($is_secret && in_array($section . '.' . $field, $clear, true)) {
                $result[$section][$field] = '';
            } elseif ($is_secret && (!is_scalar($value) || trim((string) $value) === '')) {
                // Blank password inputs mean "keep the configured secret".
            } elseif (is_scalar($value)) {
                $result[$section][$field] = byline_analytics_text($value, 256);
            }
        }
    }
    $result['plausible']['siteId'] = byline_analytics_text($result['plausible']['siteId'] ?? '', 256);
    $zone_tag = (string) ($result['cloudflare']['zoneTag'] ?? '');
    if ($zone_tag !== '' && preg_match('/^[A-Za-z0-9_-]{8,128}$/', $zone_tag) !== 1) {
        return byline_analytics_error('byline_invalid_cloudflare_zone', 'Enter a valid Cloudflare zone tag.');
    }
    $result['cloudflare']['zoneTag'] = $zone_tag;
    $result['cloudflare']['hostname'] = byline_analytics_text($result['cloudflare']['hostname'] ?? '', 255);
    return $result;
}

function byline_analytics_provider_configured(string $provider, array $settings): bool
{
    if ($provider === 'plausible') {
        return trim((string) ($settings['plausible']['apiKey'] ?? '')) !== '' && trim((string) ($settings['plausible']['siteId'] ?? '')) !== '';
    }
    if ($provider === 'cloudflare') {
        return trim((string) ($settings['cloudflare']['apiToken'] ?? '')) !== '' && trim((string) ($settings['cloudflare']['zoneTag'] ?? '')) !== '';
    }
    return false;
}

function byline_analytics_masked_identifier(string $provider, array $config): string
{
    if ($provider === 'plausible') {
        return byline_analytics_text($config['siteId'] ?? '', 180);
    }
    if ($provider === 'cloudflare') {
        return byline_analytics_text($config['zoneTag'] ?? '', 128);
    }
    return '';
}

function byline_analytics_settings_payload(): array
{
    $settings = byline_analytics_raw_settings();
    $last_test = get_option(BYLINE_ANALYTICS_TEST_OPTION, []);
    $providers = [];
    foreach (byline_analytics_provider_definitions() as $provider => $definition) {
        $config = is_array($settings[$provider] ?? null) ? $settings[$provider] : [];
        $fields = [];
        foreach ((array) ($definition['fields'] ?? []) as $field_id => $field) {
            if (!is_array($field)) {
                continue;
            }
            $item = ['id' => $field_id, 'label' => (string) ($field['label'] ?? $field_id), 'type' => (string) ($field['type'] ?? 'text')];
            if (!empty($field['secret'])) {
                $item['secret'] = true;
                $item['configured'] = trim((string) ($config[$field_id] ?? '')) !== '';
                $item['value'] = '';
            } else {
                $item['value'] = byline_analytics_text($config[$field_id] ?? '', 256);
            }
            $fields[] = $item;
        }
        $status = $provider === 'none' ? 'unavailable' : (byline_analytics_provider_configured($provider, $settings) ? 'unknown' : 'unknown');
        if (is_array($last_test) && ($last_test['provider'] ?? '') === $provider) {
            $status = !empty($last_test['ok']) ? 'connected' : 'disconnected';
        }
        $providers[] = [
            'id' => $provider,
            'label' => (string) ($definition['label'] ?? $provider),
            'description' => (string) ($definition['description'] ?? ''),
            'configured' => byline_analytics_provider_configured($provider, $settings),
            'maskedIdentifier' => byline_analytics_masked_identifier($provider, $config),
            'connectionStatus' => $status,
            'capabilities' => is_array($definition['capabilities'] ?? null) ? $definition['capabilities'] : [],
            'fields' => $fields,
            'lastTestedAt' => is_array($last_test) && ($last_test['provider'] ?? '') === $provider ? (string) ($last_test['testedAt'] ?? '') : null,
        ];
    }
    return [
        'provider' => $settings['provider'],
        'configured' => byline_analytics_provider_configured($settings['provider'], $settings),
        'providers' => $providers,
    ];
}

function byline_analytics_update_settings(array $payload)
{
    $next = byline_analytics_normalize_settings($payload, byline_analytics_raw_settings());
    if (function_exists('is_wp_error') && is_wp_error($next)) {
        return $next;
    }
    if (!is_array($next)) {
        return byline_analytics_error('byline_invalid_analytics_settings', 'Analytics settings could not be saved.');
    }
    update_option(BYLINE_ANALYTICS_SETTINGS_OPTION, $next, false);
    return byline_analytics_settings_payload();
}

function byline_analytics_date_range($value): array
{
    $now = time();
    if (is_string($value)) {
        $value = trim($value);
    }
    $allowed = ['24h' => 86400, '7d' => 7 * DAY_IN_SECONDS, '30d' => 30 * DAY_IN_SECONDS, '90d' => 90 * DAY_IN_SECONDS];
    if (is_string($value) && isset($allowed[$value])) {
        return [$value, gmdate('Y-m-d\TH:i:s\Z', $now - $allowed[$value]), gmdate('Y-m-d\TH:i:s\Z', $now)];
    }
    if (is_array($value) && count($value) === 2) {
        $start = strtotime((string) $value[0]);
        $end = strtotime((string) $value[1]);
        if ($start !== false && $end !== false && $end >= $start && ($end - $start) <= 90 * DAY_IN_SECONDS && $end <= $now + 300) {
            return ['custom', gmdate('Y-m-d\TH:i:s\Z', $start), gmdate('Y-m-d\TH:i:s\Z', min($end, $now))];
        }
    }
    return ['7d', gmdate('Y-m-d\TH:i:s\Z', $now - 7 * DAY_IN_SECONDS), gmdate('Y-m-d\TH:i:s\Z', $now)];
}

function byline_analytics_story_path($value = '', int $post_id = 0): string
{
    $value = is_string($value) ? trim($value) : '';
    if ($value === '' && $post_id > 0 && function_exists('get_permalink')) {
        $value = (string) get_permalink($post_id);
    }
    if ($value === '') {
        return '';
    }
    $parsed = function_exists('wp_parse_url') ? wp_parse_url($value) : parse_url($value);
    if (is_array($parsed) && isset($parsed['path'])) {
        $value = (string) $parsed['path'];
    }
    $value = rawurldecode($value);
    $value = preg_replace('/[^\x20-\x7E]/', '', $value);
    if ($value === '' || $value[0] !== '/') {
        $value = '/' . ltrim($value, '/');
    }
    return function_exists('mb_substr') ? mb_substr($value, 0, 512) : substr($value, 0, 512);
}

function byline_analytics_cache_key(string $provider, array $query, array $settings = []): string
{
    $safe_query = $query;
    unset($safe_query['apiKey'], $safe_query['apiToken']);
    $identity = $provider === 'plausible'
        ? (string) ($settings['plausible']['siteId'] ?? '')
        : (string) ($settings['cloudflare']['zoneTag'] ?? '');
    return BYLINE_ANALYTICS_CACHE_PREFIX . substr(hash('sha256', $provider . '|' . $identity . '|' . (function_exists('wp_json_encode') ? wp_json_encode($safe_query) : json_encode($safe_query))), 0, 32);
}

function byline_analytics_empty_state(string $provider, bool $configured = false): array
{
    return [
        'provider' => $provider,
        'configured' => $configured,
        'available' => false,
        'cached' => false,
        'fetchedAt' => null,
        'dateRange' => '7d',
        'metrics' => [],
        'trend' => [],
        'sources' => [],
        'story' => [],
        'unavailable' => [],
        'error' => '',
    ];
}

function byline_analytics_numeric($value)
{
    return is_int($value) || is_float($value) || (is_string($value) && is_numeric($value)) ? (float) $value : null;
}

function byline_analytics_plausible(array $query, array $settings): array
{
    $config = $settings['plausible'];
    $view = sanitize_key((string) ($query['view'] ?? 'aggregate'));
    $range = byline_analytics_date_range($query['dateRange'] ?? '7d');
    $metrics = ['visitors', 'pageviews', 'visits'];
    $body = [
        'site_id' => (string) $config['siteId'],
        'date_range' => $view === 'realtime' ? ['now-5m', 'now'] : ($range[0] === 'custom' ? [$range[1], $range[2]] : $range[0]),
        'metrics' => $metrics,
    ];
    if ($view === 'trend') {
        $body['dimensions'] = ['time'];
    } elseif ($view === 'sources') {
        $body['dimensions'] = ['visit:source'];
    } elseif ($view === 'story') {
        $body['dimensions'] = ['event:page'];
        $path = byline_analytics_story_path($query['path'] ?? '', absint($query['postId'] ?? 0));
        if ($path !== '') {
            $body['filters'] = [['is', 'event:page', [$path]]];
        }
    } elseif ($view === 'realtime') {
        $body['metrics'] = ['visitors'];
    } else {
        $view = 'aggregate';
    }
    $result = byline_integration_remote_json('POST', 'https://plausible.io/api/v2/query', [
        'headers' => [
            'Authorization' => 'Bearer ' . (string) $config['apiKey'],
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ],
        'body' => function_exists('wp_json_encode') ? wp_json_encode($body) : json_encode($body),
        'timeout' => 10,
        'redirection' => 0,
    ]);
    $state = byline_analytics_empty_state('plausible', true);
    $state['dateRange'] = $range[0];
    $state['unavailable'] = [];
    if (empty($result['ok'])) {
        $state['error'] = (string) ($result['error'] ?? 'Analytics provider unavailable.');
        return $state;
    }
    $rows = $result['data']['results'] ?? [];
    if (!is_array($rows)) {
        $rows = [];
    }
    $state['available'] = true;
    $state['fetchedAt'] = gmdate('c');
    $metric_names = $body['metrics'];
    if ($view === 'aggregate' || $view === 'realtime') {
        $metrics_out = [];
        $row = is_array($rows[0] ?? null) ? $rows[0] : [];
        foreach ($metric_names as $index => $name) {
            $value = byline_analytics_numeric($row['metrics'][$index] ?? null);
            if ($value !== null) {
                $metrics_out[$name] = $value;
            }
        }
        $state['metrics'] = $metrics_out;
    } else {
        $target = $view === 'trend' ? 'trend' : ($view === 'sources' ? 'sources' : 'story');
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $dimensions = is_array($row['dimensions'] ?? null) ? $row['dimensions'] : [];
            $label = byline_analytics_text($dimensions[0] ?? '', 200);
            if ($label === '') {
                continue;
            }
            $values = ['label' => $label];
            foreach ($metric_names as $index => $name) {
                $value = byline_analytics_numeric($row['metrics'][$index] ?? null);
                if ($value !== null) {
                    $values[$name] = $value;
                }
            }
            $state[$target][] = $values;
        }
    }
    return $state;
}

function byline_analytics_cloudflare_query(array $query, array $settings): array
{
    $config = $settings['cloudflare'];
    $view = sanitize_key((string) ($query['view'] ?? 'aggregate'));
    $range = byline_analytics_date_range($query['dateRange'] ?? '7d');
    $path = $view === 'story' ? byline_analytics_story_path($query['path'] ?? '', absint($query['postId'] ?? 0)) : '';
    $graphql = 'query BylineTraffic($zoneTag: string!, $start: Time!, $end: Time!) { viewer { zones(filter: { zoneTag: $zoneTag }) { httpRequestsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end, requestSource: "eyeball" }, orderBy: [datetimeHour_ASC]) { count sum { visits edgeResponseBytes } dimensions { datetimeHour clientRequestPath } } } } }';
    $result = byline_integration_remote_json('POST', 'https://api.cloudflare.com/client/v4/graphql', [
        'headers' => [
            'Authorization' => 'Bearer ' . (string) $config['apiToken'],
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ],
        'body' => function_exists('wp_json_encode') ? wp_json_encode([
            'query' => $graphql,
            'variables' => ['zoneTag' => (string) $config['zoneTag'], 'start' => $range[1], 'end' => $range[2]],
        ]) : json_encode([
            'query' => $graphql,
            'variables' => ['zoneTag' => (string) $config['zoneTag'], 'start' => $range[1], 'end' => $range[2]],
        ]),
        'timeout' => 10,
        'redirection' => 0,
    ]);
    $state = byline_analytics_empty_state('cloudflare', true);
    $state['dateRange'] = $range[0];
    $state['unavailable'] = ['visitors', 'pageviews', 'sources', 'realtime'];
    if (empty($result['ok'])) {
        $state['error'] = (string) ($result['error'] ?? 'Analytics provider unavailable.');
        return $state;
    }
    if (is_array($result['data']['errors'] ?? null) && $result['data']['errors'] !== []) {
        $state['error'] = 'Cloudflare returned an analytics query error.';
        return $state;
    }
    $zones = $result['data']['data']['viewer']['zones'] ?? [];
    $rows = is_array($zones[0]['httpRequestsAdaptiveGroups'] ?? null) ? $zones[0]['httpRequestsAdaptiveGroups'] : [];
    $state['available'] = true;
    $state['fetchedAt'] = gmdate('c');
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $dimensions = is_array($row['dimensions'] ?? null) ? $row['dimensions'] : [];
        if ($path !== '' && (string) ($dimensions['clientRequestPath'] ?? '') !== $path) {
            continue;
        }
        $metrics = [];
        foreach (['requests' => $row['count'] ?? null, 'visits' => $row['sum']['visits'] ?? null, 'bytes' => $row['sum']['edgeResponseBytes'] ?? null] as $name => $value) {
            $value = byline_analytics_numeric($value);
            if ($value !== null) {
                $metrics[$name] = $value;
            }
        }
        if ($view === 'aggregate' || $view === 'story') {
            foreach ($metrics as $name => $value) {
                $state['metrics'][$name] = (float) ($state['metrics'][$name] ?? 0) + $value;
            }
        }
        if ($view === 'trend') {
            $state['trend'][] = array_merge(['label' => byline_analytics_text($dimensions['datetimeHour'] ?? '', 80)], $metrics);
        }
    }
    if ($view === 'story' && $path !== '') {
        $state['story'] = ['path' => $path, 'metrics' => $state['metrics']];
    }
    return $state;
}

function byline_analytics_query(array $query = [], bool $refresh = false): array
{
    $settings = byline_analytics_raw_settings();
    $provider = $settings['provider'];
    $configured = byline_analytics_provider_configured($provider, $settings);
    if ($provider === 'none' || !$configured) {
        return byline_analytics_empty_state($provider, $configured);
    }
    $query['view'] = sanitize_key((string) ($query['view'] ?? 'aggregate'));
    if (!in_array($query['view'], ['aggregate', 'trend', 'sources', 'story', 'realtime'], true)) {
        $query['view'] = 'aggregate';
    }
    $definitions = byline_analytics_provider_definitions();
    if (empty($definitions[$provider]['capabilities'][$query['view']])) {
        $state = byline_analytics_empty_state($provider, true);
        $state['unavailable'] = [$query['view']];
        $state['error'] = 'This analytics view is not supported by the configured provider.';
        return $state;
    }
    $cache_key = byline_analytics_cache_key($provider, $query, $settings);
    if (!$refresh) {
        $cached = get_transient($cache_key);
        if (is_array($cached)) {
            $cached['cached'] = true;
            return $cached;
        }
    }
    try {
        $state = $provider === 'plausible'
            ? byline_analytics_plausible($query, $settings)
            : byline_analytics_cloudflare_query($query, $settings);
    } catch (Throwable $exception) {
        $state = byline_analytics_empty_state($provider, true);
        $state['error'] = 'Analytics provider unavailable.';
    }
    $state['cached'] = false;
    set_transient($cache_key, $state, !empty($state['available']) ? BYLINE_ANALYTICS_CACHE_TTL : 30);
    return $state;
}

function byline_analytics_test_connection(?string $provider = null): array
{
    $settings = byline_analytics_raw_settings();
    $provider = $provider !== null ? byline_analytics_provider_alias($provider) : $settings['provider'];
    if (!isset(byline_analytics_provider_definitions()[$provider])) {
        return ['ok' => false, 'provider' => $provider, 'error' => 'Select a supported analytics provider.'];
    }
    if ($provider === 'none' || !byline_analytics_provider_configured($provider, $settings)) {
        $result = ['ok' => false, 'provider' => $provider, 'error' => 'Complete the analytics settings before testing the connection.'];
    } else {
        $result = byline_analytics_query(['view' => 'aggregate', 'dateRange' => '24h'], true);
        $result = ['ok' => !empty($result['available']), 'provider' => $provider, 'error' => (string) ($result['error'] ?? '')];
    }
    update_option(BYLINE_ANALYTICS_TEST_OPTION, ['provider' => $provider, 'ok' => !empty($result['ok']), 'testedAt' => gmdate('c')], false);
    return $result;
}

function byline_analytics_can_manage(): bool
{
    return current_user_can(defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations');
}

function byline_analytics_request_json($request): array
{
    if (is_object($request) && method_exists($request, 'get_json_params')) {
        $params = $request->get_json_params();
        return is_array($params) ? $params : [];
    }
    return [];
}

function byline_analytics_rest_settings($request = null)
{
    $payload = byline_analytics_request_json($request);
    return $payload === [] ? rest_ensure_response(byline_analytics_settings_payload()) : byline_analytics_update_settings($payload);
}

function byline_analytics_rest_test($request = null): WP_REST_Response
{
    $payload = byline_analytics_request_json($request);
    $provider = isset($payload['provider']) ? (string) $payload['provider'] : null;
    return rest_ensure_response(byline_analytics_test_connection($provider));
}

function byline_analytics_rest_metrics($request = null): WP_REST_Response
{
    $query = [];
    if (is_object($request) && method_exists($request, 'get_param')) {
        foreach (['view', 'dateRange', 'path', 'postId'] as $key) {
            $value = $request->get_param($key);
            if ($value !== null) {
                $query[$key] = $value;
            }
        }
    }
    return rest_ensure_response(byline_analytics_query($query, false));
}

/**
 * Return the deliberately small, provider-neutral shape consumed by Planning.
 * The provider query remains the source of truth; this adapter only labels
 * metrics that the configured provider actually supports and never turns an
 * unavailable metric into a fabricated zero.
 */
function byline_analytics_rest_performance($request = null): WP_REST_Response
{
    $query = ['view' => 'aggregate'];
    if (is_object($request) && method_exists($request, 'get_param')) {
        foreach (['dateRange', 'path', 'postId'] as $key) {
            $value = $request->get_param($key);
            if ($value !== null) {
                $query[$key] = $value;
            }
        }
    }

    $state = byline_analytics_query($query, false);
    $provider_id = byline_analytics_provider_alias((string) ($state['provider'] ?? 'none'));
    $definitions = byline_analytics_provider_definitions();
    $definition = is_array($definitions[$provider_id] ?? null) ? $definitions[$provider_id] : [];
    $configured = !empty($state['configured']);
    $values = is_array($state['metrics'] ?? null) ? $state['metrics'] : [];

    $supported = $provider_id === 'plausible'
        ? ['visitors', 'pageviews', 'visits']
        : ($provider_id === 'cloudflare' ? ['requests', 'visits', 'bytes'] : []);
    $labels = [
        'visitors' => ['Visitors', 'Unique visitors reported by the analytics provider.'],
        'pageviews' => ['Pageviews', 'Pageviews reported by the analytics provider.'],
        'visits' => ['Visits', 'Visits reported by the analytics provider.'],
        'requests' => ['Requests', 'Eyeball requests reported by Cloudflare.'],
        'bytes' => ['Bytes served', 'Response bytes reported by Cloudflare.'],
    ];
    $metrics = [];
    foreach (array_keys($labels) as $metric_id) {
        $is_supported = $configured && in_array($metric_id, $supported, true);
        $value = array_key_exists($metric_id, $values) ? $values[$metric_id] : null;
        $formatted = is_numeric($value)
            ? (function_exists('number_format_i18n') ? number_format_i18n((float) $value) : number_format((float) $value))
            : null;
        $metrics[] = [
            'id' => $metric_id,
            'label' => $labels[$metric_id][0],
            'value' => is_numeric($value) ? (float) $value : null,
            'formatted' => $formatted,
            'supported' => $is_supported,
            'description' => $labels[$metric_id][1],
        ];
    }

    $search_gaps = function_exists('byline_search_gaps_top') ? byline_search_gaps_top(20) : [];

    return rest_ensure_response([
        'provider' => [
            'id' => $provider_id,
            'label' => (string) ($definition['label'] ?? ($provider_id === 'none' ? 'Not connected' : $provider_id)),
            'configured' => $configured,
        ],
        'metrics' => $metrics,
        'topStories' => [],
        'sources' => [],
        'newsletter' => [],
        'searchGaps' => $search_gaps,
        'available' => !empty($state['available']),
        'error' => (string) ($state['error'] ?? ''),
        'fetchedAt' => $state['fetchedAt'] ?? null,
    ]);
}

function byline_analytics_performance_post_id($request): int
{
    if (is_object($request) && method_exists($request, 'get_param')) {
        return absint($request->get_param('postId'));
    }

    return 0;
}

function byline_analytics_performance_path($request): string
{
    if (is_object($request) && method_exists($request, 'get_param')) {
        $path = $request->get_param('path');
        return is_scalar($path) ? trim((string) $path) : '';
    }

    return '';
}

function byline_analytics_can_view_performance($request = null): bool
{
    $can_manage = byline_analytics_can_manage();
    if (!$can_manage && !current_user_can('edit_posts')) {
        return false;
    }

    $post_id = byline_analytics_performance_post_id($request);
    $path = byline_analytics_performance_path($request);
    if ($post_id > 0) {
        $post = function_exists('get_post') ? get_post($post_id) : null;
        if (!is_object($post) || (($post->post_type ?? 'post') !== 'post') || (($post->post_status ?? '') !== 'publish')) {
            return false;
        }

        return $can_manage || (bool) current_user_can('edit_post', $post_id);
    }

    // A bare path cannot establish that the corresponding article is public.
    // Story-scoped analytics must carry a published post ID so private and draft
    // URLs cannot be used as a side channel through the aggregate endpoint.
    return $path === '';
}

function byline_register_analytics_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }
    register_rest_route('byline/v1', '/admin/analytics', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_analytics_rest_settings',
            'permission_callback' => 'byline_analytics_can_manage',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_analytics_rest_settings',
            'permission_callback' => 'byline_analytics_can_manage',
        ],
    ]);
    register_rest_route('byline/v1', '/admin/analytics/test', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_analytics_rest_test',
        'permission_callback' => 'byline_analytics_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/analytics/metrics', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_analytics_rest_metrics',
        'permission_callback' => 'byline_analytics_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/analytics/performance', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_analytics_rest_performance',
        'permission_callback' => 'byline_analytics_can_view_performance',
    ]);
}

function byline_register_analytics_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('rest_api_init', 'byline_register_analytics_routes');
    }
}
