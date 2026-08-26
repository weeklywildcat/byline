<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_DEPLOYMENT_PROVIDER_OPTION = 'byline_deployment_provider';
const BYLINE_DEPLOYMENT_HOOK_OPTION = 'byline_deployment_hook_url';
const BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION = 'byline_deployment_last_triggered_at';
const BYLINE_DEPLOYMENT_LAST_STATUS_OPTION = 'byline_deployment_last_status';
const BYLINE_DEPLOYMENT_EVENT = 'byline_trigger_deployment';

function byline_deployment_providers(): array
{
    return apply_filters('byline_deployment_providers', [
        'generic-hook' => [
            'id' => 'generic-hook',
            'label' => 'Generic Deploy Hook',
            'description' => 'POST an HTTPS hook to trigger a static-site build.',
            'method' => 'POST',
            'presets' => ['Cloudflare', 'Netlify', 'Vercel', 'GitHub Actions'],
        ],
    ]);
}

function byline_deployment_provider_id(): string
{
    $provider = sanitize_key((string) get_option(BYLINE_DEPLOYMENT_PROVIDER_OPTION, 'generic-hook'));
    return isset(byline_deployment_providers()[$provider]) ? $provider : 'generic-hook';
}

function byline_deployment_hook_url(): string
{
    $url = trim((string) get_option(BYLINE_DEPLOYMENT_HOOK_OPTION, ''));
    if ($url === '' && defined('WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION')) {
        $url = trim((string) get_option(WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION, ''));
    }
    return $url;
}

function byline_validate_deployment_hook_url($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $url = esc_url_raw(trim($value), ['https']);
    return $url !== '' && wp_parse_url($url, PHP_URL_SCHEME) === 'https' ? $url : '';
}

function byline_deployment_last_triggered(): int
{
    $value = get_option(BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION, '');
    if ($value === '' && defined('WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION')) {
        $value = get_option(WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION, 0);
    }
    return absint($value);
}

function byline_deployment_last_status(): string
{
    $value = (string) get_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, '');
    if ($value === '' && defined('WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION')) {
        $value = (string) get_option(WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION, '');
    }
    return $value;
}

function byline_deployment_pending_timestamp(): int
{
    $timestamp = wp_next_scheduled(BYLINE_DEPLOYMENT_EVENT);
    if (!$timestamp && defined('WWH_CLOUDFLARE_DEPLOY_EVENT')) {
        $timestamp = wp_next_scheduled(WWH_CLOUDFLARE_DEPLOY_EVENT);
    }
    return $timestamp ? (int) $timestamp : 0;
}

function byline_deployment_status(): array
{
    $provider = byline_deployment_providers()[byline_deployment_provider_id()];
    return [
        'provider' => $provider['id'],
        'providerLabel' => $provider['label'],
        'configured' => byline_deployment_hook_url() !== '',
        'method' => 'POST',
        'lastTriggeredAt' => byline_deployment_last_triggered() > 0
            ? wp_date('M j, Y g:i A T', byline_deployment_last_triggered(), wp_timezone())
            : 'Never',
        'lastStatus' => byline_deployment_last_status() !== '' ? byline_deployment_last_status() : 'Not triggered yet',
        'pending' => byline_deployment_pending_timestamp() > 0,
    ];
}

function byline_schedule_deployment(string $reason = 'content'): void
{
    if (byline_deployment_hook_url() === '' || byline_deployment_pending_timestamp() > 0) {
        return;
    }

    $scheduled = wp_schedule_single_event(time() + 60, BYLINE_DEPLOYMENT_EVENT, [$reason]);
    if (!$scheduled) {
        error_log('Byline: deploy-hook trigger could not be scheduled.');
    }
}

function byline_trigger_deployment(string $reason = 'scheduled'): void
{
    $url = byline_deployment_hook_url();
    if ($url === '') {
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Not configured', false);
        return;
    }

    $response = wp_safe_remote_post($url, [
        'blocking' => true,
        'headers' => [
            'User-Agent' => 'Byline',
            'X-Byline-Reason' => sanitize_key($reason),
        ],
        'redirection' => 0,
        'timeout' => 10,
    ]);
    update_option(BYLINE_DEPLOYMENT_LAST_TRIGGERED_OPTION, (string) time(), false);

    if (is_wp_error($response)) {
        update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, 'Request failed', false);
        error_log('Byline: deploy-hook request failed.');
        return;
    }

    $code = (int) wp_remote_retrieve_response_code($response);
    $status = $code > 0 ? sprintf('HTTP %d', $code) : 'No HTTP status';
    update_option(BYLINE_DEPLOYMENT_LAST_STATUS_OPTION, $status, false);
    if ($code < 200 || $code >= 300) {
        error_log(sprintf('Byline: deploy hook returned HTTP %d.', $code));
    }
}
add_action(BYLINE_DEPLOYMENT_EVENT, 'byline_trigger_deployment', 10, 1);

function byline_clear_scheduled_deployment(): void
{
    wp_clear_scheduled_hook(BYLINE_DEPLOYMENT_EVENT);
}

function byline_can_manage_deployment(): bool
{
    return current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY);
}

function byline_rest_get_deployment(): WP_REST_Response
{
    return rest_ensure_response(byline_deployment_status());
}

function byline_rest_update_deployment(WP_REST_Request $request)
{
    $payload = $request->get_json_params();
    $provider = sanitize_key((string) ($payload['provider'] ?? byline_deployment_provider_id()));
    if (!isset(byline_deployment_providers()[$provider])) {
        return new WP_Error('byline_unknown_deployment_provider', 'Select an installed deployment provider.', ['status' => 400]);
    }
    update_option(BYLINE_DEPLOYMENT_PROVIDER_OPTION, $provider, false);

    if (!empty($payload['clearHook'])) {
        update_option(BYLINE_DEPLOYMENT_HOOK_OPTION, '', false);
        if (defined('WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION')) {
            update_option(WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION, '', false);
        }
    } elseif (array_key_exists('hookUrl', $payload) && trim((string) $payload['hookUrl']) !== '') {
        $url = byline_validate_deployment_hook_url($payload['hookUrl']);
        if ($url === '') {
            return new WP_Error('byline_invalid_deployment_hook', 'Enter a valid HTTPS deploy-hook URL.', ['status' => 400]);
        }
        update_option(BYLINE_DEPLOYMENT_HOOK_OPTION, $url, false);
    }

    return rest_ensure_response(byline_deployment_status());
}

function byline_rest_trigger_deployment(): WP_REST_Response
{
    byline_trigger_deployment('manual');
    return rest_ensure_response(byline_deployment_status());
}

function byline_register_deployment_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/deployment', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_rest_get_deployment',
            'permission_callback' => 'byline_can_manage_deployment',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_rest_update_deployment',
            'permission_callback' => 'byline_can_manage_deployment',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/deployment/trigger', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_trigger_deployment',
        'permission_callback' => 'byline_can_manage_deployment',
    ]);
}
add_action('rest_api_init', 'byline_register_deployment_routes');
