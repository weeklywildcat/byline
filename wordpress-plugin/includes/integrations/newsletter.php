<?php

/**
 * Provider-neutral newsletter connection state.
 *
 * This module owns connection settings and small provider operations only. It
 * intentionally does not pretend that every provider can create, schedule,
 * or report on a newsletter issue. Those capabilities belong to a separate
 * issue workflow and are advertised here only when a provider operation is
 * actually implemented.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('byline_integration_remote_json')) {
    require_once __DIR__ . '/http.php';
}

if (!defined('BYLINE_NEWSLETTER_SETTINGS_OPTION')) {
    define('BYLINE_NEWSLETTER_SETTINGS_OPTION', 'byline_newsletter_settings_v1');
}
if (!defined('BYLINE_NEWSLETTER_TEST_OPTION')) {
    define('BYLINE_NEWSLETTER_TEST_OPTION', 'byline_newsletter_last_test_v1');
}
if (!defined('BYLINE_NEWSLETTER_ISSUE_POST_TYPE')) {
    define('BYLINE_NEWSLETTER_ISSUE_POST_TYPE', 'byline_newsletter');
}
if (!defined('BYLINE_NEWSLETTER_ISSUE_META')) {
    define('BYLINE_NEWSLETTER_ISSUE_META', '_byline_newsletter_issue_v1');
}

function byline_newsletter_text($value, int $maximum = 240): string
{
    $value = is_scalar($value) ? (string) $value : '';
    $value = function_exists('sanitize_text_field') ? sanitize_text_field($value) : trim(strip_tags($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_newsletter_provider_definitions(): array
{
    $definitions = [
        'none' => [
            'id' => 'none',
            'label' => 'Not connected',
            'description' => 'Keep newsletter signup and delivery disconnected until a provider is configured.',
            'capabilities' => [],
            'fields' => [],
        ],
        'kit' => [
            'id' => 'kit',
            'label' => 'Kit',
            'description' => 'Kit API v4 subscriber and form operations.',
            'capabilities' => ['signup' => true, 'audienceDiscovery' => true, 'connectionTest' => true],
            'fields' => [
                'apiKey' => ['label' => 'API key', 'type' => 'password', 'secret' => true],
                'formId' => ['label' => 'Form ID', 'type' => 'text'],
                'formUid' => ['label' => 'Public embed UID', 'type' => 'text'],
                'embedUrl' => ['label' => 'Public embed URL', 'type' => 'url'],
                'embedScriptUrl' => ['label' => 'Public embed script URL', 'type' => 'url'],
            ],
        ],
        'mailchimp' => [
            'id' => 'mailchimp',
            'label' => 'Mailchimp',
            'description' => 'Mailchimp Marketing API v3 audience and member operations.',
            'capabilities' => ['signup' => true, 'audienceDiscovery' => true, 'connectionTest' => true, 'sendTest' => true, 'immediateSend' => true, 'remoteScheduling' => true],
            'fields' => [
                'apiKey' => ['label' => 'API key', 'type' => 'password', 'secret' => true],
                'serverPrefix' => ['label' => 'Server prefix', 'type' => 'text'],
                'audienceId' => ['label' => 'Audience ID', 'type' => 'text'],
                'testRecipient' => ['label' => 'Test recipient', 'type' => 'email'],
            ],
        ],
        'buttondown' => [
            'id' => 'buttondown',
            'label' => 'Buttondown',
            'description' => 'Buttondown API v1 subscriber operations.',
            'capabilities' => ['signup' => true, 'audienceDiscovery' => true, 'connectionTest' => true],
            'fields' => [
                'apiKey' => ['label' => 'API key', 'type' => 'password', 'secret' => true],
                'newsletterId' => ['label' => 'Newsletter ID', 'type' => 'text'],
            ],
        ],
        'webhook' => [
            'id' => 'webhook',
            'label' => 'Generic signup webhook',
            'description' => 'POST bounded signup and newsletter delivery payloads to an HTTPS webhook.',
            'capabilities' => ['signup' => true, 'sendTest' => true, 'immediateSend' => true],
            'fields' => [
                'webhookUrl' => ['label' => 'Webhook URL', 'type' => 'url', 'secret' => true],
                'authToken' => ['label' => 'Bearer token', 'type' => 'password', 'secret' => true],
                'testRecipient' => ['label' => 'Test recipient', 'type' => 'email'],
            ],
        ],
        'signup-link' => [
            'id' => 'signup-link',
            'label' => 'External signup link',
            'description' => 'Send readers to a provider-hosted signup form.',
            'capabilities' => ['signup' => true],
            'fields' => [
                'signupUrl' => ['label' => 'Signup URL', 'type' => 'url'],
            ],
        ],
    ];

    if (function_exists('apply_filters')) {
        $filtered = apply_filters('byline_newsletter_provider_definitions', $definitions);
        if (is_array($filtered)) {
            $definitions = $filtered;
        }
    }

    return $definitions;
}

function byline_newsletter_provider_alias(string $provider): string
{
    $provider = strtolower(trim($provider));
    $aliases = [
        'generic-webhook' => 'webhook',
        'webhook-api' => 'webhook',
        'external' => 'signup-link',
        'signup_link' => 'signup-link',
        'kit-v4' => 'kit',
    ];
    return $aliases[$provider] ?? $provider;
}

function byline_newsletter_legacy_value(array $options, array $keys, array $environment_keys = []): string
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $options) && is_scalar($options[$key]) && trim((string) $options[$key]) !== '') {
            return trim((string) $options[$key]);
        }
    }
    foreach ($environment_keys as $key) {
        $value = getenv($key);
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }
    }
    return '';
}

function byline_newsletter_raw_settings(): array
{
    $stored = get_option(BYLINE_NEWSLETTER_SETTINGS_OPTION, []);
    $stored = is_array($stored) ? $stored : [];
    $options = [
        'wwh_kit_api_key' => get_option('wwh_kit_api_key', ''),
        'wwh_kit_form_id' => get_option('wwh_kit_form_id', ''),
        'byline_kit_api_key' => get_option('byline_kit_api_key', ''),
        'byline_kit_form_id' => get_option('byline_kit_form_id', ''),
        'kit_api_key' => get_option('kit_api_key', ''),
        'kit_form_id' => get_option('kit_form_id', ''),
    ];
    $legacy_key = byline_newsletter_legacy_value($options, ['wwh_kit_api_key', 'byline_kit_api_key', 'kit_api_key'], ['WWH_KIT_API_KEY', 'KIT_API_KEY']);
    $legacy_form = byline_newsletter_legacy_value($options, ['wwh_kit_form_id', 'byline_kit_form_id', 'kit_form_id'], ['WWH_KIT_FORM_ID', 'KIT_FORM_ID']);

    $settings = [
        'provider' => byline_newsletter_provider_alias((string) ($stored['provider'] ?? '')),
        'kit' => is_array($stored['kit'] ?? null) ? $stored['kit'] : [],
        'mailchimp' => is_array($stored['mailchimp'] ?? null) ? $stored['mailchimp'] : [],
        'buttondown' => is_array($stored['buttondown'] ?? null) ? $stored['buttondown'] : [],
        'webhook' => is_array($stored['webhook'] ?? null) ? $stored['webhook'] : [],
        'signup-link' => is_array($stored['signup-link'] ?? null) ? $stored['signup-link'] : [],
    ];

    // An explicit canonical provider, including "none", wins.  Legacy Kit
    // values are only inferred when no canonical provider was saved.
    if ($settings['provider'] === '' || !isset(byline_newsletter_provider_definitions()[$settings['provider']])) {
        $settings['provider'] = $legacy_key !== '' || $legacy_form !== '' ? 'kit' : 'none';
    }
    if ($legacy_key !== '' && trim((string) ($settings['kit']['apiKey'] ?? '')) === '') {
        $settings['kit']['apiKey'] = $legacy_key;
    }
    if ($legacy_form !== '' && trim((string) ($settings['kit']['formId'] ?? '')) === '') {
        $settings['kit']['formId'] = $legacy_form;
    }

    return $settings;
}

function byline_newsletter_secret_fields(): array
{
    return ['apiKey', 'authToken', 'webhookUrl'];
}

function byline_newsletter_secret_present(array $settings, string $provider, string $field): bool
{
    return trim((string) ($settings[$provider][$field] ?? '')) !== '';
}

function byline_newsletter_valid_email($email): string
{
    $email = is_string($email) ? trim($email) : '';
    if (function_exists('sanitize_email')) {
        $email = sanitize_email($email);
    }
    if (function_exists('is_email')) {
        return is_email($email) ? $email : '';
    }
    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false ? $email : '';
}

function byline_newsletter_valid_public_url($value): string
{
    if (!function_exists('byline_integration_safe_https_url')) {
        return '';
    }
    return byline_integration_safe_https_url($value);
}

function byline_newsletter_normalize_settings(array $input, array $previous = [], bool $allow_secret_retention = true)
{
    $previous = $previous !== [] ? $previous : byline_newsletter_raw_settings();
    $provider = byline_newsletter_provider_alias((string) ($input['provider'] ?? $previous['provider'] ?? 'none'));
    $definitions = byline_newsletter_provider_definitions();
    if (!isset($definitions[$provider])) {
        return byline_newsletter_error('byline_unknown_newsletter_provider', 'Select a supported newsletter provider.');
    }

    $result = [
        'provider' => $provider,
        'kit' => is_array($previous['kit'] ?? null) ? $previous['kit'] : [],
        'mailchimp' => is_array($previous['mailchimp'] ?? null) ? $previous['mailchimp'] : [],
        'buttondown' => is_array($previous['buttondown'] ?? null) ? $previous['buttondown'] : [],
        'webhook' => is_array($previous['webhook'] ?? null) ? $previous['webhook'] : [],
        'signup-link' => is_array($previous['signup-link'] ?? null) ? $previous['signup-link'] : [],
    ];
    $input_settings = is_array($input['settings'] ?? null) ? $input['settings'] : $input;
    $clear = is_array($input['clearSecrets'] ?? null) ? $input['clearSecrets'] : [];

    foreach (array_keys($result) as $section) {
        if ($section === 'provider' || !is_array($input_settings[$section] ?? null)) {
            continue;
        }
        foreach ($input_settings[$section] as $field => $value) {
            if (!is_string($field)) {
                continue;
            }
            if (in_array($field, ['apiKey', 'authToken', 'webhookUrl'], true)) {
                if (in_array($section . '.' . $field, $clear, true) || in_array($field, $clear, true) && $section === $provider) {
                    $result[$section][$field] = '';
                } elseif ($allow_secret_retention && (!is_scalar($value) || trim((string) $value) === '')) {
                    // Empty secret fields leave the working credential alone.
                } else {
                    $result[$section][$field] = trim((string) $value);
                }
                continue;
            }
            if (!is_scalar($value)) {
                continue;
            }
            $result[$section][$field] = byline_newsletter_text($value, 512);
        }
    }

    $result['kit']['formId'] = preg_match('/^\d{1,32}$/', (string) ($result['kit']['formId'] ?? '')) === 1
        ? (string) $result['kit']['formId']
        : '';
    foreach (['formUid', 'embedUrl', 'embedScriptUrl'] as $field) {
        if (trim((string) ($result['kit'][$field] ?? '')) !== '') {
            $result['kit'][$field] = $field === 'formUid'
                ? byline_newsletter_text($result['kit'][$field], 128)
                : byline_newsletter_valid_public_url($result['kit'][$field]);
        }
    }
    $result['mailchimp']['serverPrefix'] = strtolower(trim((string) ($result['mailchimp']['serverPrefix'] ?? '')));
    if ($result['mailchimp']['serverPrefix'] !== '' && preg_match('/^[a-z0-9-]{1,32}$/', $result['mailchimp']['serverPrefix']) !== 1) {
        return byline_newsletter_error('byline_invalid_mailchimp_server', 'Enter the Mailchimp server prefix from the API key.');
    }
    foreach (['audienceId'] as $field) {
        $result['mailchimp'][$field] = preg_match('/^[A-Za-z0-9_-]{1,128}$/', (string) ($result['mailchimp'][$field] ?? '')) === 1
            ? (string) $result['mailchimp'][$field]
            : '';
    }
    $result['mailchimp']['testRecipient'] = byline_newsletter_valid_email($result['mailchimp']['testRecipient'] ?? '');
    $result['buttondown']['newsletterId'] = preg_match('/^[A-Za-z0-9_-]{1,128}$/', (string) ($result['buttondown']['newsletterId'] ?? '')) === 1
        ? (string) $result['buttondown']['newsletterId']
        : '';
    if (trim((string) ($result['webhook']['webhookUrl'] ?? '')) !== '') {
        $result['webhook']['webhookUrl'] = byline_newsletter_valid_public_url($result['webhook']['webhookUrl']);
        if ($result['webhook']['webhookUrl'] === '') {
            return byline_newsletter_error('byline_invalid_newsletter_webhook', 'Webhook URLs must be HTTPS and must not target local or private hosts.');
        }
    }
    if (trim((string) ($result['signup-link']['signupUrl'] ?? '')) !== '') {
        $result['signup-link']['signupUrl'] = byline_newsletter_valid_public_url($result['signup-link']['signupUrl']);
        if ($result['signup-link']['signupUrl'] === '') {
            return byline_newsletter_error('byline_invalid_newsletter_signup_url', 'Signup URLs must be valid HTTPS URLs.');
        }
    }

    return $result;
}

function byline_newsletter_error(string $code, string $message)
{
    if (class_exists('WP_Error')) {
        return new WP_Error($code, $message, ['status' => 400]);
    }
    return ['error' => $code, 'message' => $message];
}

function byline_newsletter_provider_configured(string $provider, array $settings): bool
{
    $config = is_array($settings[$provider] ?? null) ? $settings[$provider] : [];
    switch ($provider) {
        case 'kit':
            return trim((string) ($config['apiKey'] ?? '')) !== '' && trim((string) ($config['formId'] ?? '')) !== '';
        case 'mailchimp':
            return trim((string) ($config['apiKey'] ?? '')) !== ''
                && trim((string) ($config['serverPrefix'] ?? '')) !== ''
                && trim((string) ($config['audienceId'] ?? '')) !== '';
        case 'buttondown':
            return trim((string) ($config['apiKey'] ?? '')) !== '';
        case 'webhook':
            return trim((string) ($config['webhookUrl'] ?? '')) !== '';
        case 'signup-link':
            return trim((string) ($config['signupUrl'] ?? '')) !== '';
        default:
            return false;
    }
}

function byline_newsletter_provider_connection_ready(string $provider, array $settings): bool
{
    $config = is_array($settings[$provider] ?? null) ? $settings[$provider] : [];
    switch ($provider) {
        case 'kit':
            return trim((string) ($config['apiKey'] ?? '')) !== '';
        case 'mailchimp':
            return trim((string) ($config['apiKey'] ?? '')) !== '' && trim((string) ($config['serverPrefix'] ?? '')) !== '';
        case 'buttondown':
            return trim((string) ($config['apiKey'] ?? '')) !== '';
        default:
            return byline_newsletter_provider_configured($provider, $settings);
    }
}

function byline_newsletter_masked_identifier(string $provider, array $config): string
{
    switch ($provider) {
        case 'kit':
            return trim((string) ($config['formId'] ?? '')) !== '' ? 'Form ' . byline_newsletter_text($config['formId'], 32) : '';
        case 'mailchimp':
            $server = trim((string) ($config['serverPrefix'] ?? ''));
            $audience = trim((string) ($config['audienceId'] ?? ''));
            return $server !== '' && $audience !== '' ? $server . ' / ' . byline_integration_mask_secret($audience, 4) : $server;
        case 'buttondown':
            return byline_newsletter_text($config['newsletterId'] ?? '', 64);
        case 'webhook':
            return byline_integration_mask_url($config['webhookUrl'] ?? '');
        case 'signup-link':
            return byline_integration_mask_url($config['signupUrl'] ?? '');
        default:
            return '';
    }
}

function byline_newsletter_connection_status(string $provider, array $settings): string
{
    if ($provider === 'none' || !byline_newsletter_provider_configured($provider, $settings)) {
        return $provider === 'none' ? 'unavailable' : 'unknown';
    }
    $test = get_option(BYLINE_NEWSLETTER_TEST_OPTION, []);
    if (is_array($test) && ($test['provider'] ?? '') === $provider) {
        return !empty($test['ok']) ? 'connected' : 'disconnected';
    }
    return 'unknown';
}

function byline_newsletter_provider_payload(string $provider, array $settings): array
{
    $definitions = byline_newsletter_provider_definitions();
    $definition = $definitions[$provider] ?? $definitions['none'];
    $config = is_array($settings[$provider] ?? null) ? $settings[$provider] : [];
    $fields = [];
    foreach ((array) ($definition['fields'] ?? []) as $field_id => $field) {
        if (!is_array($field)) {
            continue;
        }
        $item = [
            'id' => $field_id,
            'label' => (string) ($field['label'] ?? $field_id),
            'type' => (string) ($field['type'] ?? 'text'),
        ];
        if (!empty($field['secret'])) {
            $item['secret'] = true;
            $item['configured'] = byline_newsletter_secret_present($settings, $provider, $field_id);
            $item['value'] = '';
        } else {
            $item['value'] = byline_newsletter_text($config[$field_id] ?? '', 512);
        }
        $fields[] = $item;
    }

    $test = get_option(BYLINE_NEWSLETTER_TEST_OPTION, []);
    return [
        'id' => $provider,
        'label' => (string) ($definition['label'] ?? $provider),
        'description' => (string) ($definition['description'] ?? ''),
        'configured' => byline_newsletter_provider_configured($provider, $settings),
        'maskedIdentifier' => byline_newsletter_masked_identifier($provider, $config),
        'connectionStatus' => byline_newsletter_connection_status($provider, $settings),
        'capabilities' => is_array($definition['capabilities'] ?? null) ? $definition['capabilities'] : [],
        'fields' => $fields,
        'setupMessage' => $provider === 'none' ? 'Connect a provider to enable newsletter signup.' : null,
        'lastTestedAt' => is_array($test) && ($test['provider'] ?? '') === $provider ? (string) ($test['testedAt'] ?? '') : null,
    ];
}

function byline_newsletter_public_config(): array
{
    $settings = byline_newsletter_raw_settings();
    $provider = $settings['provider'];
    $features = function_exists('byline_get_publication_config') ? (array) byline_get_publication_config()['features'] : [];
    $enabled = !array_key_exists('newsletter', $features) || !empty($features['newsletter']);
    $public = [
        'enabled' => $enabled,
        'provider' => $provider,
        'signupUrl' => '',
        'embedUrl' => '',
        'embedScriptUrl' => '',
        'formUid' => '',
    ];

    if ($provider === 'signup-link') {
        $public['signupUrl'] = byline_newsletter_valid_public_url($settings['signup-link']['signupUrl'] ?? '');
    } elseif ($provider === 'kit') {
        $public['embedUrl'] = byline_newsletter_valid_public_url($settings['kit']['embedUrl'] ?? '');
        $public['embedScriptUrl'] = byline_newsletter_valid_public_url($settings['kit']['embedScriptUrl'] ?? '');
        $public['formUid'] = byline_newsletter_text($settings['kit']['formUid'] ?? '', 128);
    }

    // The old Weekly Wildcat embed is an intentionally public form asset. It
    // is a compatibility fallback only for the legacy hostname; generic
    // publications never inherit this account or form UID.
    $legacy = function_exists('byline_is_legacy_weekly_wildcat_installation')
        && byline_is_legacy_weekly_wildcat_installation();
    if ($legacy && ($provider === 'none'
        || (trim((string) ($settings['kit']['formUid'] ?? '')) === '' && trim((string) ($settings['kit']['embedScriptUrl'] ?? '')) === ''))) {
        $public['provider'] = 'kit';
        $public['embedScriptUrl'] = 'https://weekly-wildcat.kit.com/d1eb6ce2f7/index.js';
        $public['formUid'] = 'd1eb6ce2f7';
    }

    return $public;
}

function byline_newsletter_settings_payload(): array
{
    $settings = byline_newsletter_raw_settings();
    $providers = [];
    foreach (array_keys(byline_newsletter_provider_definitions()) as $provider) {
        $providers[] = byline_newsletter_provider_payload($provider, $settings);
    }
    return [
        'provider' => $settings['provider'],
        'configured' => byline_newsletter_provider_configured($settings['provider'], $settings),
        'providers' => $providers,
        'public' => byline_newsletter_public_config(),
    ];
}

function byline_newsletter_update_settings(array $payload)
{
    $previous = byline_newsletter_raw_settings();
    $next = byline_newsletter_normalize_settings($payload, $previous, true);
    if (function_exists('is_wp_error') && is_wp_error($next)) {
        return $next;
    }
    if (!is_array($next)) {
        return byline_newsletter_error('byline_invalid_newsletter_settings', 'Newsletter settings could not be saved.');
    }
    update_option(BYLINE_NEWSLETTER_SETTINGS_OPTION, $next, false);
    return byline_newsletter_settings_payload();
}

function byline_newsletter_provider_request(string $provider, string $method, string $path, array $headers = [], array $body = [], ?array $provided_settings = null): array
{
    $settings = $provided_settings !== null ? $provided_settings : byline_newsletter_raw_settings();
    $config = is_array($settings[$provider] ?? null) ? $settings[$provider] : [];
    $url = '';
    $request_headers = array_merge(['Accept' => 'application/json'], $headers);
    $args = ['headers' => $request_headers, 'timeout' => 10, 'redirection' => 0];
    if ($body !== []) {
        $args['headers']['Content-Type'] = 'application/json';
        $args['body'] = function_exists('wp_json_encode') ? wp_json_encode($body) : json_encode($body);
    }

    if ($provider === 'kit') {
        $url = 'https://api.kit.com/v4' . $path;
        $url = byline_integration_safe_https_url($url, ['api.kit.com']);
        $request_headers['X-Kit-Api-Key'] = (string) ($config['apiKey'] ?? '');
    } elseif ($provider === 'mailchimp') {
        $server = strtolower((string) ($config['serverPrefix'] ?? ''));
        $url = 'https://' . $server . '.api.mailchimp.com/3.0' . $path;
        $url = byline_integration_safe_https_url($url, [$server . '.api.mailchimp.com']);
        $request_headers['Authorization'] = 'Basic ' . base64_encode('byline:' . (string) ($config['apiKey'] ?? ''));
    } elseif ($provider === 'buttondown') {
        $url = 'https://api.buttondown.com/v1' . $path;
        $url = byline_integration_safe_https_url($url, ['api.buttondown.com']);
        $request_headers['Authorization'] = 'Token ' . (string) ($config['apiKey'] ?? '');
    }
    if ($url === '') {
        return ['ok' => false, 'code' => 0, 'data' => [], 'error' => 'The provider is not configured for this operation.'];
    }
    $args['headers'] = $request_headers;
    return byline_integration_remote_json($method, $url, $args);
}

function byline_newsletter_test_connection(?string $provider = null, ?array $provided_settings = null): array
{
    $settings = $provided_settings !== null ? $provided_settings : byline_newsletter_raw_settings();
    $provider = $provider !== null ? byline_newsletter_provider_alias($provider) : $settings['provider'];
    $definitions = byline_newsletter_provider_definitions();
    if (!isset($definitions[$provider])) {
        return ['ok' => false, 'provider' => $provider, 'error' => 'Select a supported newsletter provider.'];
    }
    if (empty($definitions[$provider]['capabilities']['connectionTest'])) {
        $result = ['ok' => false, 'provider' => $provider, 'error' => 'This provider does not expose a safe connection test.'];
    } elseif (!byline_newsletter_provider_connection_ready($provider, $settings)) {
        $result = ['ok' => false, 'provider' => $provider, 'error' => 'Complete the provider settings before testing the connection.'];
    } elseif ($provider === 'kit') {
        $result = byline_newsletter_provider_request('kit', 'GET', '/account', [], [], $settings);
        $result['provider'] = $provider;
    } elseif ($provider === 'mailchimp') {
        $result = byline_newsletter_provider_request('mailchimp', 'GET', '/', [], [], $settings);
        $result['provider'] = $provider;
    } else {
        $result = byline_newsletter_provider_request('buttondown', 'GET', '/newsletters', [], [], $settings);
        $result['provider'] = $provider;
    }

    if ($provided_settings === null) {
        update_option(BYLINE_NEWSLETTER_TEST_OPTION, [
            'provider' => $provider,
            'ok' => !empty($result['ok']),
            'testedAt' => gmdate('c'),
        ], false);
    }
    return [
        'ok' => !empty($result['ok']),
        'provider' => $provider,
        'code' => (int) ($result['code'] ?? 0),
        'error' => (string) ($result['error'] ?? ''),
    ];
}

function byline_newsletter_list_audiences(?string $provider = null): array
{
    $settings = byline_newsletter_raw_settings();
    $provider = $provider !== null ? byline_newsletter_provider_alias($provider) : $settings['provider'];
    $definitions = byline_newsletter_provider_definitions();
    if (!isset($definitions[$provider]) || empty($definitions[$provider]['capabilities']['audienceDiscovery'])) {
        return ['ok' => false, 'provider' => $provider, 'audiences' => [], 'error' => 'Audience discovery is not supported by this provider.'];
    }
    if (!byline_newsletter_provider_connection_ready($provider, $settings)) {
        return ['ok' => false, 'provider' => $provider, 'audiences' => [], 'error' => 'Complete the provider settings before loading audiences.'];
    }
    if ($provider === 'kit') {
        $response = byline_newsletter_provider_request('kit', 'GET', '/forms?per_page=1000');
        $items = $response['data']['forms'] ?? [];
    } elseif ($provider === 'mailchimp') {
        $response = byline_newsletter_provider_request('mailchimp', 'GET', '/lists?count=1000');
        $items = $response['data']['lists'] ?? [];
    } else {
        $response = byline_newsletter_provider_request('buttondown', 'GET', '/newsletters');
        $items = $response['data']['results'] ?? ($response['data']['newsletters'] ?? []);
    }
    $audiences = [];
    if (is_array($items)) {
        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['id'])) {
                continue;
            }
            $audience = [
                'id' => byline_newsletter_text($item['id'], 128),
                'name' => byline_newsletter_text($item['name'] ?? ($item['title'] ?? ''), 200),
            ];
            if ($provider === 'kit') {
                $audience['uid'] = byline_newsletter_text($item['uid'] ?? '', 128);
                $audience['embedUrl'] = byline_newsletter_valid_public_url($item['embed_url'] ?? '');
            }
            if ($audience['id'] !== '') {
                $audiences[] = $audience;
            }
        }
    }
    return [
        'ok' => !empty($response['ok']),
        'provider' => $provider,
        'audiences' => $audiences,
        'error' => (string) ($response['error'] ?? ''),
    ];
}

function byline_newsletter_subscribe($email, string $first_name = '', string $referrer = ''): array
{
    $email = byline_newsletter_valid_email($email);
    if ($email === '') {
        return ['ok' => false, 'error' => 'Enter a valid email address.'];
    }
    $settings = byline_newsletter_raw_settings();
    $provider = $settings['provider'];
    if ($provider === 'signup-link') {
        return ['ok' => false, 'provider' => $provider, 'error' => 'This provider requires the public signup link.'];
    }
    if (!in_array($provider, ['kit', 'mailchimp', 'buttondown', 'webhook'], true)
        || !byline_newsletter_provider_configured($provider, $settings)) {
        return ['ok' => false, 'provider' => $provider, 'error' => 'Newsletter signup is not configured.'];
    }

    $first_name = byline_newsletter_text($first_name, 120);
    $referrer = byline_newsletter_valid_public_url($referrer);
    if ($provider === 'kit') {
        $form_id = preg_replace('/[^0-9]/', '', (string) ($settings['kit']['formId'] ?? ''));
        $result = byline_newsletter_provider_request('kit', 'POST', '/forms/' . $form_id . '/subscribers', [], array_filter([
            'email_address' => $email,
            'referrer' => $referrer,
        ], static function ($value): bool { return $value !== ''; }));
    } elseif ($provider === 'mailchimp') {
        $hash = md5(strtolower($email));
        $body = ['email_address' => $email, 'status_if_new' => 'pending', 'status' => 'pending'];
        if ($first_name !== '') {
            $body['merge_fields'] = ['FNAME' => $first_name];
        }
        $result = byline_newsletter_provider_request('mailchimp', 'PUT', '/lists/' . rawurlencode((string) $settings['mailchimp']['audienceId']) . '/members/' . $hash, [], $body);
    } elseif ($provider === 'buttondown') {
        // The verified v1 subscriber contract requires email_address. Keep
        // optional editorial names out until a provider-supported field is
        // explicitly configured rather than guessing at metadata schema.
        $result = byline_newsletter_provider_request('buttondown', 'POST', '/subscribers', [], ['email_address' => $email]);
    } else {
        $config = $settings['webhook'];
        $url = byline_integration_safe_https_url($config['webhookUrl'] ?? '');
        if ($url === '') {
            return ['ok' => false, 'provider' => $provider, 'error' => 'The signup webhook is not a safe HTTPS URL.'];
        }
        $headers = ['Content-Type' => 'application/json'];
        if (trim((string) ($config['authToken'] ?? '')) !== '') {
            $headers['Authorization'] = 'Bearer ' . (string) $config['authToken'];
        }
        $result = byline_integration_remote_json('POST', $url, [
            'headers' => $headers,
            'body' => function_exists('wp_json_encode') ? wp_json_encode(array_filter([
                'email' => $email,
                'firstName' => $first_name,
                'referrer' => $referrer,
            ], static function ($value): bool { return $value !== ''; })) : json_encode(['email' => $email, 'firstName' => $first_name, 'referrer' => $referrer]),
            'timeout' => 10,
            'redirection' => 0,
        ]);
    }

    return [
        'ok' => !empty($result['ok']),
        'provider' => $provider,
        'code' => (int) ($result['code'] ?? 0),
        'error' => (string) ($result['error'] ?? ''),
        'externalId' => is_scalar($result['data']['id'] ?? null) ? byline_newsletter_text($result['data']['id'], 128) : '',
    ];
}

function byline_newsletter_issue_statuses(): array
{
    return ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'];
}

function byline_newsletter_issue_defaults(): array
{
    $now = gmdate('c');
    return [
        'title' => '',
        'subject' => '',
        'preheader' => '',
        'audience' => '',
        'leadStoryId' => null,
        'additionalStoryIds' => [],
        'sectionHeadings' => [],
        'intro' => '',
        'outro' => '',
        'providerId' => null,
        'status' => 'draft',
        'scheduledAt' => null,
        'sentAt' => null,
        'providerExternalId' => null,
        'htmlSnapshot' => null,
        'plaintextSnapshot' => null,
        'deliveryStats' => null,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
}

function byline_newsletter_issue_error(string $code, string $message, int $status = 400)
{
    if (class_exists('WP_Error')) {
        return new WP_Error($code, $message, ['status' => $status]);
    }
    return ['error' => $code, 'message' => $message, 'status' => $status];
}

function byline_newsletter_issue_id($value): int
{
    return max(0, (int) $value);
}

function byline_newsletter_issue_post($issue_id)
{
    $issue_id = byline_newsletter_issue_id($issue_id);
    if ($issue_id <= 0 || !function_exists('get_post')) {
        return null;
    }
    $post = get_post($issue_id);
    if (!$post) {
        return null;
    }
    $type = function_exists('get_post_type') ? get_post_type($issue_id) : ($post->post_type ?? '');
    return $type === BYLINE_NEWSLETTER_ISSUE_POST_TYPE ? $post : null;
}

function byline_newsletter_issue_record($issue_id): ?array
{
    $post = byline_newsletter_issue_post($issue_id);
    if (!$post) {
        return null;
    }
    $stored = function_exists('get_post_meta') ? get_post_meta((int) $post->ID, BYLINE_NEWSLETTER_ISSUE_META, true) : [];
    $stored = is_array($stored) ? $stored : [];
    $record = array_merge(byline_newsletter_issue_defaults(), $stored);
    $record['id'] = (int) $post->ID;
    return $record;
}

function byline_newsletter_issue_scalar($value, int $maximum = 512): string
{
    if (!is_scalar($value)) {
        return '';
    }
    if (function_exists('sanitize_textarea_field')) {
        $value = sanitize_textarea_field((string) $value);
    } elseif (function_exists('sanitize_text_field')) {
        $value = sanitize_text_field((string) $value);
    } else {
        $value = trim(strip_tags((string) $value));
    }
    return byline_newsletter_text($value, $maximum);
}

function byline_newsletter_issue_story_ids(array $value): array
{
    $ids = [];
    foreach ($value as $item) {
        $id = byline_newsletter_issue_id($item);
        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return $ids;
}

function byline_newsletter_issue_datetime($value, bool $future_only = false): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $value = trim($value);
    try {
        $timezone = function_exists('wp_timezone')
            ? wp_timezone()
            : new DateTimeZone(function_exists('wp_timezone_string') && wp_timezone_string() ? wp_timezone_string() : 'UTC');
        $date = new DateTimeImmutable($value, $timezone);
        if (strpos($value, 'T') !== false && !preg_match('/(?:Z|[+-]\d{2}:?\d{2})$/', $value)) {
            $date = $date->setTimezone($timezone);
        }
        $date = $date->setTimezone(new DateTimeZone('UTC'));
        if ($future_only && $date->getTimestamp() <= time()) {
            return null;
        }
        return $date->format('Y-m-d\TH:i:s\Z');
    } catch (Throwable $exception) {
        return null;
    }
}

function byline_newsletter_issue_normalize(array $input, ?array $existing = null): array
{
    $record = $existing !== null ? array_merge(byline_newsletter_issue_defaults(), $existing) : byline_newsletter_issue_defaults();
    foreach (['title', 'subject', 'preheader', 'audience', 'intro', 'outro'] as $field) {
        if (array_key_exists($field, $input)) {
            $record[$field] = byline_newsletter_issue_scalar($input[$field], $field === 'intro' || $field === 'outro' ? 5000 : 512);
        }
    }
    if (array_key_exists('sectionHeadings', $input) && is_array($input['sectionHeadings'])) {
        $record['sectionHeadings'] = [];
        foreach ($input['sectionHeadings'] as $heading) {
            $heading = byline_newsletter_issue_scalar($heading, 240);
            if ($heading !== '') {
                $record['sectionHeadings'][] = $heading;
            }
        }
    }
    if (array_key_exists('leadStoryId', $input)) {
        $lead = byline_newsletter_issue_id($input['leadStoryId']);
        $record['leadStoryId'] = $lead > 0 ? $lead : null;
    }
    if (array_key_exists('additionalStoryIds', $input) && is_array($input['additionalStoryIds'])) {
        $record['additionalStoryIds'] = byline_newsletter_issue_story_ids($input['additionalStoryIds']);
    }
    $record['additionalStoryIds'] = array_values(array_filter(
        byline_newsletter_issue_story_ids((array) $record['additionalStoryIds']),
        static function (int $id) use ($record): bool { return $id !== (int) ($record['leadStoryId'] ?? 0); }
    ));
    if (array_key_exists('providerId', $input)) {
        $provider = byline_newsletter_provider_alias((string) $input['providerId']);
        $record['providerId'] = isset(byline_newsletter_provider_definitions()[$provider]) && $provider !== 'none' ? $provider : null;
    }
    if (array_key_exists('scheduledAt', $input)) {
        $record['scheduledAt'] = byline_newsletter_issue_datetime($input['scheduledAt']);
    }
    if (($record['title'] ?? '') === '' && ($record['subject'] ?? '') !== '') {
        $record['title'] = $record['subject'];
    }
    if (($record['subject'] ?? '') === '' && ($record['title'] ?? '') !== '') {
        $record['subject'] = $record['title'];
    }
    $record['status'] = in_array($record['status'] ?? 'draft', byline_newsletter_issue_statuses(), true)
        ? $record['status']
        : 'draft';
    return $record;
}

function byline_newsletter_issue_ordered_story_ids(array $record): array
{
    $ids = [];
    if ((int) ($record['leadStoryId'] ?? 0) > 0) {
        $ids[] = (int) $record['leadStoryId'];
    }
    foreach ((array) ($record['additionalStoryIds'] ?? []) as $id) {
        $id = byline_newsletter_issue_id($id);
        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return $ids;
}

function byline_newsletter_issue_story($story_id): ?array
{
    $story_id = byline_newsletter_issue_id($story_id);
    $post = function_exists('get_post') ? get_post($story_id) : null;
    if (!$post || ($post->post_type ?? 'post') !== 'post') {
        return null;
    }
    $title = function_exists('get_the_title') ? get_the_title($story_id) : ($post->post_title ?? '');
    $excerpt = function_exists('get_the_excerpt') ? get_the_excerpt($story_id) : ($post->post_excerpt ?? '');
    $url = function_exists('get_permalink') ? get_permalink($story_id) : '';
    return [
        'id' => $story_id,
        'title' => byline_newsletter_issue_scalar($title, 500),
        'excerpt' => byline_newsletter_issue_scalar($excerpt, 1200),
        'url' => byline_newsletter_valid_public_url($url),
    ];
}

function byline_newsletter_issue_stories(array $record, bool $require_all = false)
{
    $stories = [];
    foreach (byline_newsletter_issue_ordered_story_ids($record) as $story_id) {
        $story = byline_newsletter_issue_story($story_id);
        if (!$story) {
            if ($require_all) {
                return byline_newsletter_issue_error('byline_newsletter_story_missing', 'One of the selected stories is no longer available.', 404);
            }
            continue;
        }
        $stories[] = $story;
    }
    return $stories;
}

function byline_newsletter_issue_html_escape(string $value): string
{
    return function_exists('esc_html') ? esc_html($value) : htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function byline_newsletter_issue_render(array $record)
{
    $stories = byline_newsletter_issue_stories($record, true);
    if (function_exists('is_wp_error') && is_wp_error($stories)) {
        return $stories;
    }
    if (!is_array($stories)) {
        return byline_newsletter_issue_error('byline_newsletter_render_failed', 'The newsletter stories could not be rendered.');
    }
    $title = byline_newsletter_issue_html_escape((string) ($record['title'] ?? ''));
    $subject = byline_newsletter_issue_html_escape((string) ($record['subject'] ?? ''));
    $preheader = byline_newsletter_issue_html_escape((string) ($record['preheader'] ?? ''));
    $intro = byline_newsletter_issue_html_escape((string) ($record['intro'] ?? ''));
    $outro = byline_newsletter_issue_html_escape((string) ($record['outro'] ?? ''));
    $plain = [];
    if ($title !== '') $plain[] = (string) ($record['title'] ?? '');
    if (($record['intro'] ?? '') !== '') $plain[] = (string) $record['intro'];
    $html = '<!doctype html><html><body><main><h1>' . $title . '</h1>';
    if ($preheader !== '') $html .= '<p class="preheader">' . $preheader . '</p>';
    if ($intro !== '') $html .= '<p>' . nl2br($intro) . '</p>';
    foreach ($stories as $index => $story) {
        $heading = (string) (($record['sectionHeadings'] ?? [])[$index] ?? '');
        if ($heading !== '') {
            $html .= '<h2>' . byline_newsletter_issue_html_escape($heading) . '</h2>';
            $plain[] = $heading;
        }
        $story_title = (string) ($story['title'] ?? '');
        $story_excerpt = (string) ($story['excerpt'] ?? '');
        $story_url = (string) ($story['url'] ?? '');
        $html .= '<article><h2>' . byline_newsletter_issue_html_escape($story_title) . '</h2>';
        if ($story_excerpt !== '') $html .= '<p>' . nl2br(byline_newsletter_issue_html_escape($story_excerpt)) . '</p>';
        if ($story_url !== '') $html .= '<p><a href="' . byline_newsletter_issue_html_escape($story_url) . '">Read the full story</a></p>';
        $html .= '</article>';
        $plain[] = $story_title;
        if ($story_excerpt !== '') $plain[] = $story_excerpt;
        if ($story_url !== '') $plain[] = $story_url;
    }
    if ($outro !== '') {
        $html .= '<p>' . nl2br($outro) . '</p>';
        $plain[] = (string) $record['outro'];
    }
    $html .= '</main></body></html>';
    return ['html' => $html, 'plaintext' => implode("\n\n", array_filter($plain, static function ($value): bool { return trim((string) $value) !== ''; }))];
}

function byline_newsletter_issue_save_record(int $issue_id, array $record): array
{
    $record['updatedAt'] = gmdate('c');
    if (!function_exists('update_post_meta')) {
        return $record;
    }
    update_post_meta($issue_id, BYLINE_NEWSLETTER_ISSUE_META, $record);
    if (function_exists('wp_update_post')) {
        wp_update_post(['ID' => $issue_id, 'post_title' => (string) ($record['title'] ?? '')]);
    }
    return $record;
}

function byline_newsletter_issue_payload(int $issue_id, bool $include_stories = true): array
{
    $record = byline_newsletter_issue_record($issue_id) ?: byline_newsletter_issue_defaults();
    $record['id'] = $issue_id;
    $payload = $record;
    if ($include_stories) {
        $stories = byline_newsletter_issue_stories($record, false);
        $payload['stories'] = is_array($stories) ? $stories : [];
    }
    return $payload;
}

function byline_newsletter_issue_provider(array $record): string
{
    $provider = byline_newsletter_provider_alias((string) ($record['providerId'] ?? ''));
    if ($provider === '' || $provider === 'none') {
        $provider = (string) byline_newsletter_raw_settings()['provider'];
    }
    return byline_newsletter_provider_alias($provider);
}

function byline_newsletter_issue_provider_configured(array $record, string $provider, array $settings): bool
{
    return isset(byline_newsletter_provider_definitions()[$provider])
        && byline_newsletter_provider_configured($provider, $settings);
}

function byline_newsletter_issue_sender_details(): array
{
    $name = function_exists('get_bloginfo') ? get_bloginfo('name') : 'Byline';
    $email = function_exists('get_option') ? get_option('admin_email', '') : '';
    return [
        'from_name' => byline_newsletter_issue_scalar($name, 100) ?: 'Byline',
        'reply_to' => byline_newsletter_valid_email($email) ?: 'no-reply@example.invalid',
    ];
}

function byline_newsletter_mailchimp_campaign(array $record, array $snapshot, array $settings, ?string $existing_id = null)
{
    $config = is_array($settings['mailchimp'] ?? null) ? $settings['mailchimp'] : [];
    $campaign_id = $existing_id ? byline_newsletter_text($existing_id, 128) : '';
    $audience_id = trim((string) ($record['audience'] ?? '')) !== '' ? trim((string) $record['audience']) : (string) ($config['audienceId'] ?? '');
    if ($audience_id === '') {
        return byline_newsletter_issue_error('byline_newsletter_audience_required', 'Choose a Mailchimp audience before delivering the issue.');
    }
    if ($campaign_id === '') {
        $sender = byline_newsletter_issue_sender_details();
        $created = byline_newsletter_provider_request('mailchimp', 'POST', '/campaigns', [], [
            'type' => 'regular',
            'recipients' => ['list_id' => $audience_id],
            'settings' => [
                'subject_line' => (string) ($record['subject'] ?? ''),
                'preview_text' => (string) ($record['preheader'] ?? ''),
                'title' => (string) ($record['title'] ?? ''),
                'from_name' => $sender['from_name'],
                'reply_to' => $sender['reply_to'],
            ],
        ]);
        if (empty($created['ok'])) {
            return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($created['error'] ?? 'Mailchimp did not accept the campaign.'));
        }
        $campaign_id = is_scalar($created['data']['id'] ?? null) ? byline_newsletter_text($created['data']['id'], 128) : '';
        if ($campaign_id === '') {
            return byline_newsletter_issue_error('byline_newsletter_provider_error', 'Mailchimp did not return a campaign reference.');
        }
    }
    $content = byline_newsletter_provider_request('mailchimp', 'PUT', '/campaigns/' . rawurlencode($campaign_id) . '/content', [], [
        'html' => (string) ($snapshot['html'] ?? ''),
        'plain_text' => (string) ($snapshot['plaintext'] ?? ''),
    ]);
    if (empty($content['ok'])) {
        return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($content['error'] ?? 'Mailchimp did not accept the campaign content.'));
    }
    return $campaign_id;
}

function byline_newsletter_webhook_request(array $record, array $snapshot, bool $test = false): array
{
    $settings = byline_newsletter_raw_settings();
    $config = is_array($settings['webhook'] ?? null) ? $settings['webhook'] : [];
    $url = byline_integration_safe_https_url($config['webhookUrl'] ?? '');
    if ($url === '') {
        return ['ok' => false, 'code' => 0, 'data' => [], 'error' => 'The newsletter webhook is not a safe HTTPS URL.'];
    }
    $headers = ['Content-Type' => 'application/json', 'Accept' => 'application/json'];
    if (trim((string) ($config['authToken'] ?? '')) !== '') {
        $headers['Authorization'] = 'Bearer ' . (string) $config['authToken'];
    }
    $body = [
        'test' => $test,
        'issue' => [
            'id' => (int) ($record['id'] ?? 0),
            'title' => (string) ($record['title'] ?? ''),
            'subject' => (string) ($record['subject'] ?? ''),
            'preheader' => (string) ($record['preheader'] ?? ''),
            'audience' => (string) ($record['audience'] ?? ''),
            'html' => (string) ($snapshot['html'] ?? ''),
            'plaintext' => (string) ($snapshot['plaintext'] ?? ''),
        ],
    ];
    return byline_integration_remote_json('POST', $url, [
        'headers' => $headers,
        'body' => function_exists('wp_json_encode') ? wp_json_encode($body) : json_encode($body),
        'timeout' => 10,
        'redirection' => 0,
    ]);
}

function byline_newsletter_issue_snapshot(array $record)
{
    $snapshot = byline_newsletter_issue_render($record);
    if (function_exists('is_wp_error') && is_wp_error($snapshot)) {
        return $snapshot;
    }
    if (!is_array($snapshot) || trim((string) ($snapshot['html'] ?? '')) === '') {
        return byline_newsletter_issue_error('byline_newsletter_render_failed', 'The newsletter snapshot could not be created.');
    }
    return $snapshot;
}

function byline_newsletter_issue_create_or_update(array $input, ?int $issue_id = null)
{
    $existing = $issue_id ? byline_newsletter_issue_record($issue_id) : null;
    if ($issue_id && $existing === null) {
        return byline_newsletter_issue_error('byline_newsletter_not_found', 'Newsletter issue not found.', 404);
    }
    if ($existing !== null && in_array($existing['status'], ['sending', 'sent'], true)) {
        return byline_newsletter_issue_error('byline_newsletter_immutable', 'A sending or sent issue cannot be edited.');
    }
    $record = byline_newsletter_issue_normalize($input, $existing);
    if (($record['title'] ?? '') === '' || ($record['subject'] ?? '') === '') {
        return byline_newsletter_issue_error('byline_newsletter_fields_required', 'A title and subject are required.');
    }
    $stories = byline_newsletter_issue_stories($record, true);
    if (function_exists('is_wp_error') && is_wp_error($stories)) {
        return $stories;
    }
    if ($existing === null) {
        if (!function_exists('wp_insert_post')) {
            return byline_newsletter_issue_error('byline_newsletter_storage_unavailable', 'Newsletter issue storage is unavailable.', 500);
        }
        $new_id = wp_insert_post([
            'post_type' => BYLINE_NEWSLETTER_ISSUE_POST_TYPE,
            'post_status' => 'private',
            'post_title' => (string) $record['title'],
            'post_author' => function_exists('get_current_user_id') ? get_current_user_id() : 0,
        ], true);
        if (function_exists('is_wp_error') && is_wp_error($new_id)) {
            return $new_id;
        }
        $issue_id = byline_newsletter_issue_id($new_id);
        if ($issue_id <= 0) {
            return byline_newsletter_issue_error('byline_newsletter_storage_failed', 'Newsletter issue could not be created.', 500);
        }
    }
    $record = byline_newsletter_issue_save_record((int) $issue_id, $record);
    return byline_newsletter_issue_payload((int) $issue_id, true);
}

function byline_newsletter_issue_list(array $params = []): array
{
    $status = byline_newsletter_issue_scalar($params['status'] ?? '', 32);
    $search = byline_newsletter_issue_scalar($params['search'] ?? '', 200);
    $page = max(1, (int) ($params['page'] ?? 1));
    $per_page = min(100, max(1, (int) ($params['per_page'] ?? 20)));
    $query = [
        'post_type' => BYLINE_NEWSLETTER_ISSUE_POST_TYPE,
        'post_status' => ['private', 'draft', 'publish'],
        'posts_per_page' => 200,
        'orderby' => 'date',
        'order' => 'DESC',
    ];
    if ($search !== '') $query['s'] = $search;
    $posts = function_exists('get_posts') ? get_posts($query) : [];
    $items = [];
    foreach ((array) $posts as $post) {
        $id = byline_newsletter_issue_id(is_object($post) ? ($post->ID ?? 0) : $post);
        $record = $id ? byline_newsletter_issue_record($id) : null;
        if (!$record || ($status !== '' && $record['status'] !== $status)) continue;
        $items[] = byline_newsletter_issue_payload($id, false);
    }
    $total = count($items);
    $items = array_slice($items, ($page - 1) * $per_page, $per_page);
    return ['items' => $items, 'newsletters' => $items, 'total' => $total, 'providers' => byline_newsletter_settings_payload()['providers']];
}

function byline_newsletter_issue_add_story(int $issue_id, int $story_id, string $placement)
{
    $record = byline_newsletter_issue_record($issue_id);
    if (!$record) return byline_newsletter_issue_error('byline_newsletter_not_found', 'Newsletter issue not found.', 404);
    if (in_array($record['status'], ['sending', 'sent'], true)) return byline_newsletter_issue_error('byline_newsletter_immutable', 'A sending or sent issue cannot be edited.');
    if (!byline_newsletter_issue_story($story_id)) return byline_newsletter_issue_error('byline_newsletter_story_missing', 'The selected story is not available.', 404);
    if ($placement === 'lead') {
        $record['leadStoryId'] = $story_id;
        $record['additionalStoryIds'] = array_values(array_filter((array) $record['additionalStoryIds'], static function ($id) use ($story_id): bool { return (int) $id !== $story_id; }));
    } else {
        if ((int) $record['leadStoryId'] !== $story_id && !in_array($story_id, (array) $record['additionalStoryIds'], true)) $record['additionalStoryIds'][] = $story_id;
    }
    byline_newsletter_issue_save_record($issue_id, $record);
    return byline_newsletter_issue_payload($issue_id, true);
}

function byline_newsletter_issue_action(int $issue_id, string $action, array $params = [])
{
    $record = byline_newsletter_issue_record($issue_id);
    if (!$record) return byline_newsletter_issue_error('byline_newsletter_not_found', 'Newsletter issue not found.', 404);
    $provider = byline_newsletter_issue_provider($record);
    $settings = byline_newsletter_raw_settings();
    $definitions = byline_newsletter_provider_definitions();
    $capability = ['send-test' => 'sendTest', 'send' => 'immediateSend', 'schedule' => 'remoteScheduling'][$action] ?? '';
    if ($action !== 'cancel' && (!$capability || empty($definitions[$provider]['capabilities'][$capability]))) return byline_newsletter_issue_error('byline_newsletter_capability_unavailable', 'This provider does not support that newsletter action.');
    if (!byline_newsletter_issue_provider_configured($record, $provider, $settings)) return byline_newsletter_issue_error('byline_newsletter_provider_unconfigured', 'Complete the selected provider settings before delivering this issue.');
    if ($action === 'cancel') {
        if ($record['status'] === 'cancelled') return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'The newsletter schedule was already cancelled.', 'idempotent' => true];
        if ($record['status'] !== 'scheduled') return byline_newsletter_issue_error('byline_newsletter_invalid_transition', 'Only scheduled newsletters can be cancelled.');
        if ($provider === 'mailchimp' && !empty($record['providerExternalId'])) {
            $remote = byline_newsletter_provider_request('mailchimp', 'POST', '/campaigns/' . rawurlencode((string) $record['providerExternalId']) . '/actions/unschedule');
            if (empty($remote['ok'])) return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($remote['error'] ?? 'The provider did not cancel the scheduled campaign.'));
        }
        $record['status'] = 'cancelled';
        byline_newsletter_issue_save_record($issue_id, $record);
        return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter schedule cancelled.'];
    }
    if ($action === 'send-test') {
        if (in_array($record['status'], ['sending', 'sent'], true)) return byline_newsletter_issue_error('byline_newsletter_immutable', 'A sending or sent issue cannot receive a test send.');
        $snapshot = byline_newsletter_issue_snapshot($record);
        if (function_exists('is_wp_error') && is_wp_error($snapshot)) return $snapshot;
        if ($provider === 'mailchimp') {
            $campaign_id = byline_newsletter_mailchimp_campaign($record, $snapshot, $settings, (string) ($record['providerExternalId'] ?? ''));
            if (function_exists('is_wp_error') && is_wp_error($campaign_id)) return $campaign_id;
            $recipient = byline_newsletter_valid_email($params['recipient'] ?? ($settings['mailchimp']['testRecipient'] ?? ''));
            if ($recipient === '') return byline_newsletter_issue_error('byline_newsletter_recipient_required', 'Enter a valid test recipient for Mailchimp.');
            $remote = byline_newsletter_provider_request('mailchimp', 'POST', '/campaigns/' . rawurlencode((string) $campaign_id) . '/actions/test', [], ['test_emails' => [$recipient], 'send_type' => 'html']);
            if (empty($remote['ok'])) return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($remote['error'] ?? 'Mailchimp did not accept the test send.'));
            $record['providerExternalId'] = $campaign_id;
            $record['htmlSnapshot'] = $snapshot['html'];
            $record['plaintextSnapshot'] = $snapshot['plaintext'];
            byline_newsletter_issue_save_record($issue_id, $record);
        } else {
            $remote = byline_newsletter_webhook_request(array_merge($record, ['id' => $issue_id]), $snapshot, true);
            if (empty($remote['ok'])) return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($remote['error'] ?? 'The newsletter webhook did not accept the test send.'));
        }
        return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter test send accepted. The issue remains unsent.'];
    }
    if ($action === 'schedule') {
        if ($record['status'] === 'scheduled') return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter was already scheduled.', 'idempotent' => true];
        if (!in_array($record['status'], ['draft', 'failed', 'cancelled'], true)) return byline_newsletter_issue_error('byline_newsletter_invalid_transition', 'Only draft, failed, or cancelled newsletters can be scheduled.');
        $scheduled = byline_newsletter_issue_datetime($params['scheduledAt'] ?? $record['scheduledAt'], true);
        if (!$scheduled) return byline_newsletter_issue_error('byline_newsletter_invalid_schedule', 'Choose a valid future scheduled time.');
        $snapshot = byline_newsletter_issue_snapshot($record);
        if (function_exists('is_wp_error') && is_wp_error($snapshot)) return $snapshot;
        if ($provider !== 'mailchimp') return byline_newsletter_issue_error('byline_newsletter_capability_unavailable', 'Only Mailchimp remote scheduling is supported.');
        $campaign_id = byline_newsletter_mailchimp_campaign($record, $snapshot, $settings, (string) ($record['providerExternalId'] ?? ''));
        if (function_exists('is_wp_error') && is_wp_error($campaign_id)) return $campaign_id;
        $remote = byline_newsletter_provider_request('mailchimp', 'POST', '/campaigns/' . rawurlencode((string) $campaign_id) . '/actions/schedule', [], ['schedule_time' => $scheduled]);
        if (empty($remote['ok'])) return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($remote['error'] ?? 'Mailchimp did not accept the schedule.'));
        $record['providerExternalId'] = $campaign_id;
        $record['scheduledAt'] = $scheduled;
        $record['status'] = 'scheduled';
        $record['htmlSnapshot'] = $snapshot['html'];
        $record['plaintextSnapshot'] = $snapshot['plaintext'];
        byline_newsletter_issue_save_record($issue_id, $record);
        return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter scheduled.'];
    }
    if ($action === 'send') {
        if ($record['status'] === 'sent') return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter was already sent.', 'idempotent' => true];
        if ($record['status'] === 'sending') return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter delivery is already in progress.', 'idempotent' => true];
        if (!in_array($record['status'], ['draft', 'failed', 'cancelled'], true)) return byline_newsletter_issue_error('byline_newsletter_invalid_transition', 'This newsletter cannot be sent from its current state.');
        $snapshot = byline_newsletter_issue_snapshot($record);
        if (function_exists('is_wp_error') && is_wp_error($snapshot)) return $snapshot;
        $record['status'] = 'sending';
        $record['htmlSnapshot'] = $snapshot['html'];
        $record['plaintextSnapshot'] = $snapshot['plaintext'];
        byline_newsletter_issue_save_record($issue_id, $record);
        if ($provider === 'mailchimp') {
            $campaign_id = byline_newsletter_mailchimp_campaign($record, $snapshot, $settings, (string) ($record['providerExternalId'] ?? ''));
            if (function_exists('is_wp_error') && is_wp_error($campaign_id)) {
                $record['status'] = 'failed'; byline_newsletter_issue_save_record($issue_id, $record); return $campaign_id;
            }
            $remote = byline_newsletter_provider_request('mailchimp', 'POST', '/campaigns/' . rawurlencode((string) $campaign_id) . '/actions/send');
            $record['providerExternalId'] = $campaign_id;
        } else {
            $remote = byline_newsletter_webhook_request(array_merge($record, ['id' => $issue_id]), $snapshot, false);
        }
        if (empty($remote['ok'])) {
            $record['status'] = 'failed';
            byline_newsletter_issue_save_record($issue_id, $record);
            return byline_newsletter_issue_error('byline_newsletter_provider_error', (string) ($remote['error'] ?? 'The newsletter provider did not accept delivery.'));
        }
        $record['status'] = 'sent';
        $record['sentAt'] = gmdate('c');
        byline_newsletter_issue_save_record($issue_id, $record);
        return ['newsletter' => byline_newsletter_issue_payload($issue_id), 'message' => 'Newsletter sent.'];
    }
    return byline_newsletter_issue_error('byline_newsletter_unknown_action', 'Unknown newsletter action.');
}

function byline_newsletter_register_issue_post_type(): void
{
    if (!function_exists('register_post_type')) return;
    register_post_type(BYLINE_NEWSLETTER_ISSUE_POST_TYPE, [
        'labels' => ['name' => 'Newsletters', 'singular_name' => 'Newsletter'],
        'public' => false,
        'publicly_queryable' => false,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title'],
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ]);
}

function byline_newsletter_rest_issue_request($request): array
{
    $params = byline_newsletter_request_json($request);
    if (is_object($request) && method_exists($request, 'get_params')) {
        $route_params = $request->get_params();
        if (is_array($route_params)) $params = array_merge($route_params, $params);
    }
    return $params;
}

function byline_newsletter_rest_list($request = null)
{
    return rest_ensure_response(byline_newsletter_issue_list(is_object($request) && method_exists($request, 'get_params') ? (array) $request->get_params() : []));
}

function byline_newsletter_rest_get($request = null)
{
    $params = byline_newsletter_rest_issue_request($request);
    $id = byline_newsletter_issue_id($params['id'] ?? 0);
    $record = byline_newsletter_issue_record($id);
    if (!$record) return byline_newsletter_issue_error('byline_newsletter_not_found', 'Newsletter issue not found.', 404);
    return rest_ensure_response(['newsletter' => byline_newsletter_issue_payload($id, false), 'stories' => byline_newsletter_issue_payload($id, true)['stories'], 'providers' => byline_newsletter_settings_payload()['providers']]);
}

function byline_newsletter_rest_save($request = null)
{
    $params = byline_newsletter_rest_issue_request($request);
    $id = byline_newsletter_issue_id($params['id'] ?? 0);
    return rest_ensure_response(byline_newsletter_issue_create_or_update($params, $id > 0 ? $id : null));
}

function byline_newsletter_rest_delete($request = null)
{
    $params = byline_newsletter_rest_issue_request($request);
    $id = byline_newsletter_issue_id($params['id'] ?? 0);
    $record = byline_newsletter_issue_record($id);
    if (!$record) return byline_newsletter_issue_error('byline_newsletter_not_found', 'Newsletter issue not found.', 404);
    if (in_array($record['status'], ['sending', 'sent'], true)) return byline_newsletter_issue_error('byline_newsletter_immutable', 'A sending or sent issue cannot be deleted.');
    if (!function_exists('wp_delete_post') || !wp_delete_post($id, true)) return byline_newsletter_issue_error('byline_newsletter_delete_failed', 'Newsletter issue could not be deleted.', 500);
    return rest_ensure_response(['deleted' => true, 'id' => $id]);
}

function byline_newsletter_rest_add_story($request = null)
{
    $params = byline_newsletter_rest_issue_request($request);
    return rest_ensure_response(byline_newsletter_issue_add_story(
        byline_newsletter_issue_id($params['id'] ?? 0),
        byline_newsletter_issue_id($params['storyId'] ?? 0),
        in_array(($params['placement'] ?? 'additional'), ['lead', 'additional'], true) ? (string) $params['placement'] : 'additional'
    ));
}

function byline_newsletter_rest_action($request = null, string $action = '')
{
    $params = byline_newsletter_rest_issue_request($request);
    return rest_ensure_response(byline_newsletter_issue_action(byline_newsletter_issue_id($params['id'] ?? 0), $action, $params));
}

function byline_newsletter_can_manage(): bool
{
    return current_user_can(defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations');
}

/**
 * Issue editing is newsroom work; provider credentials and audience discovery
 * remain integration administration. Keeping these permissions separate lets
 * an editor prepare and review an issue without granting access to secrets.
 */
function byline_newsletter_can_edit_issues(): bool
{
    return current_user_can('edit_posts');
}

function byline_newsletter_request_json($request): array
{
    if (is_object($request) && method_exists($request, 'get_json_params')) {
        $params = $request->get_json_params();
        return is_array($params) ? $params : [];
    }
    return [];
}

function byline_newsletter_rest_settings($request = null)
{
    if ($request === null || !byline_newsletter_request_json($request)) {
        return rest_ensure_response(byline_newsletter_settings_payload());
    }
    return byline_newsletter_update_settings(byline_newsletter_request_json($request));
}

function byline_newsletter_rest_test($request = null): WP_REST_Response
{
    $params = byline_newsletter_request_json($request);
    $provider = isset($params['provider']) ? byline_newsletter_provider_alias((string) $params['provider']) : null;
    $provided_settings = null;
    if ($provider !== null && is_array($params['settings'] ?? null)) {
        $candidate = byline_newsletter_normalize_settings(['provider' => $provider, $provider => $params['settings']], byline_newsletter_raw_settings(), true);
        if (!(function_exists('is_wp_error') && is_wp_error($candidate)) && is_array($candidate)) {
            $provided_settings = $candidate;
        }
    }
    return rest_ensure_response(byline_newsletter_test_connection($provider, $provided_settings));
}

function byline_newsletter_rest_audiences($request = null): WP_REST_Response
{
    $provider = null;
    if (is_object($request) && method_exists($request, 'get_param')) {
        $value = $request->get_param('provider');
        $provider = is_string($value) ? $value : null;
    }
    return rest_ensure_response(byline_newsletter_list_audiences($provider));
}

function byline_newsletter_rest_provider_list(): WP_REST_Response
{
    $payload = byline_newsletter_settings_payload();
    return rest_ensure_response(['providers' => $payload['providers']]);
}

function byline_newsletter_rest_provider_settings($request = null)
{
    $provider = is_object($request) && method_exists($request, 'get_param')
        ? byline_newsletter_provider_alias((string) $request->get_param('provider'))
        : '';
    $params = byline_newsletter_request_json($request);
    if ($provider === '' || !isset(byline_newsletter_provider_definitions()[$provider])) {
        return byline_newsletter_error('byline_unknown_newsletter_provider', 'Select a supported newsletter provider.');
    }
    $payload = ['provider' => $provider, $provider => $params];
    $saved = byline_newsletter_update_settings($payload);
    if (function_exists('is_wp_error') && is_wp_error($saved)) {
        return $saved;
    }
    $provider_payload = byline_newsletter_provider_payload($provider, byline_newsletter_raw_settings());
    return rest_ensure_response(['provider' => $provider_payload, 'message' => 'Provider settings saved.']);
}

function byline_newsletter_rest_provider_test($request = null): WP_REST_Response
{
    $provider = is_object($request) && method_exists($request, 'get_param')
        ? byline_newsletter_provider_alias((string) $request->get_param('provider'))
        : null;
    $params = byline_newsletter_request_json($request);
    $provided_settings = null;
    if ($provider !== null && is_array($params)) {
        $candidate = byline_newsletter_normalize_settings(['provider' => $provider, $provider => $params], byline_newsletter_raw_settings(), true);
        if (!(function_exists('is_wp_error') && is_wp_error($candidate)) && is_array($candidate)) {
            $provided_settings = $candidate;
        }
    }
    $result = byline_newsletter_test_connection($provider, $provided_settings);
    $safe_settings = $provided_settings !== null ? $provided_settings : byline_newsletter_raw_settings();
    return rest_ensure_response([
        'provider' => byline_newsletter_provider_payload((string) ($provider ?? 'none'), $safe_settings),
        'message' => !empty($result['ok']) ? 'Connection test succeeded.' : ((string) ($result['error'] ?? 'Connection test failed.')),
    ]);
}

function byline_register_newsletter_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }
    $settings = [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_newsletter_rest_settings',
            'permission_callback' => 'byline_newsletter_can_manage',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_newsletter_rest_settings',
            'permission_callback' => 'byline_newsletter_can_manage',
        ],
    ];
    register_rest_route('byline/v1', '/admin/newsletter', $settings);
    // The plural path matches the existing admin app's localized base while
    // the singular route stays useful to local integrations that only need
    // provider settings.
    register_rest_route('byline/v1', '/admin/newsletters/provider', $settings);
    register_rest_route('byline/v1', '/admin/newsletters/providers', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_newsletter_rest_provider_list',
        'permission_callback' => 'byline_newsletter_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/newsletters/providers/(?P<provider>[a-z0-9_-]+)/settings', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_newsletter_rest_provider_settings',
        'permission_callback' => 'byline_newsletter_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/newsletters/providers/(?P<provider>[a-z0-9_-]+)/test', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_newsletter_rest_provider_test',
        'permission_callback' => 'byline_newsletter_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/newsletter/test', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_newsletter_rest_test',
        'permission_callback' => 'byline_newsletter_can_manage',
    ]);
    register_rest_route('byline/v1', '/admin/newsletter/audiences', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_newsletter_rest_audiences',
        'permission_callback' => 'byline_newsletter_can_manage',
    ]);

    $issue_read = [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_newsletter_rest_list',
        'permission_callback' => 'byline_newsletter_can_edit_issues',
    ];
    $issue_create = [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_newsletter_rest_save',
        'permission_callback' => 'byline_newsletter_can_edit_issues',
    ];
    register_rest_route('byline/v1', '/admin/newsletters', [$issue_read, $issue_create]);
    register_rest_route('byline/v1', '/admin/newsletters/(?P<id>\d+)', [
        array_merge($issue_read, ['callback' => 'byline_newsletter_rest_get']),
        $issue_create,
        [
            'methods' => 'DELETE',
            'callback' => 'byline_newsletter_rest_delete',
            'permission_callback' => 'byline_newsletter_can_edit_issues',
        ],
    ]);
    register_rest_route('byline/v1', '/admin/newsletters/(?P<id>\d+)/stories', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_newsletter_rest_add_story',
        'permission_callback' => 'byline_newsletter_can_edit_issues',
    ]);
    foreach (['send-test', 'send', 'schedule', 'cancel'] as $action) {
        register_rest_route('byline/v1', '/admin/newsletters/(?P<id>\d+)/' . $action, [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => static function ($request) use ($action) {
                return byline_newsletter_rest_action($request, $action);
            },
            'permission_callback' => 'byline_newsletter_can_edit_issues',
        ]);
    }
}

function byline_register_newsletter_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('init', 'byline_newsletter_register_issue_post_type');
        add_action('rest_api_init', 'byline_register_newsletter_routes');
    }
}
