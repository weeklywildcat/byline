<?php

/**
 * Protected per-story distribution state.
 *
 * WordPress publication state remains authoritative.  Social actions are
 * deliberately copy-only, while Discord and newsletter delivery are
 * asynchronous integration requests identified by a stable request ID.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('BYLINE_DISTRIBUTION_META')) {
    define('BYLINE_DISTRIBUTION_META', '_byline_distribution_state_v1');
}
if (!defined('BYLINE_DISTRIBUTION_VERSION')) {
    define('BYLINE_DISTRIBUTION_VERSION', 1);
}

function byline_distribution_text($value, int $maximum = 320): string
{
    $value = is_scalar($value) ? (string) $value : '';
    $value = function_exists('sanitize_text_field') ? sanitize_text_field($value) : trim(strip_tags($value));
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_distribution_post(int $post_id)
{
    return function_exists('get_post') ? get_post($post_id) : null;
}

function byline_distribution_post_is_published(int $post_id): bool
{
    $post = byline_distribution_post($post_id);
    return is_object($post) && (string) ($post->post_status ?? '') === 'publish';
}

function byline_distribution_fix_url(int $post_id): string
{
    if (function_exists('get_edit_post_link')) {
        $url = get_edit_post_link($post_id, 'raw');
        if (is_string($url) && $url !== '') {
            return $url;
        }
    }
    if (function_exists('admin_url')) {
        return admin_url('post.php?post=' . $post_id . '&action=edit');
    }
    return '';
}

function byline_distribution_default_channel(string $channel, string $label = ''): array
{
    return [
        'channelId' => $channel,
        'label' => $label !== '' ? $label : ucfirst(str_replace(['-', '_'], ' ', $channel)),
        'status' => 'not_configured',
        'configured' => false,
        'requestId' => '',
        'userId' => 0,
        'externalId' => '',
        'externalUrl' => '',
        'distributedAt' => '',
        'lastError' => '',
        'updatedAt' => '',
    ];
}

function byline_distribution_safe_status($value): string
{
    $value = sanitize_key((string) $value);
    return in_array($value, ['not_published', 'published', 'rebuild_pending', 'live', 'build_failed', 'ready', 'not_configured', 'pending', 'sent', 'skipped', 'failed'], true)
        ? $value
        : 'not_configured';
}

function byline_distribution_read_stored_state(int $post_id): array
{
    if (!function_exists('get_post_meta')) {
        return ['version' => BYLINE_DISTRIBUTION_VERSION, 'channels' => []];
    }
    $stored = get_post_meta($post_id, BYLINE_DISTRIBUTION_META, true);
    return is_array($stored) ? $stored : ['version' => BYLINE_DISTRIBUTION_VERSION, 'channels' => []];
}

function byline_distribution_sanitize_channel(array $channel, string $channel_id, string $label = ''): array
{
    $result = byline_distribution_default_channel($channel_id, $label);
    foreach (['label', 'requestId', 'externalId', 'externalUrl', 'distributedAt', 'lastError', 'updatedAt'] as $key) {
        if (isset($channel[$key]) && is_scalar($channel[$key])) {
            $result[$key] = byline_distribution_text($channel[$key], $key === 'lastError' ? 500 : 256);
        }
    }
    $result['channelId'] = byline_distribution_text($channel['channelId'] ?? $channel_id, 80);
    $result['status'] = byline_distribution_safe_status($channel['status'] ?? 'not_configured');
    $result['configured'] = !empty($channel['configured']);
    $result['userId'] = absint($channel['userId'] ?? 0);
    return $result;
}

function byline_distribution_persist_channel(int $post_id, string $channel_id, array $channel): array
{
    $stored = byline_distribution_read_stored_state($post_id);
    $channels = is_array($stored['channels'] ?? null) ? $stored['channels'] : [];
    $channels[$channel_id] = byline_distribution_sanitize_channel($channel, $channel_id, $channel['label'] ?? '');
    $next = ['version' => BYLINE_DISTRIBUTION_VERSION, 'channels' => $channels, 'updatedAt' => gmdate('c')];
    if (function_exists('update_post_meta')) {
        update_post_meta($post_id, BYLINE_DISTRIBUTION_META, $next);
    }
    return $next;
}

function byline_distribution_publication_socials(): array
{
    $publication = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $social = is_array($publication['social'] ?? null) ? $publication['social'] : [];
    $channels = [];
    foreach ($social as $item) {
        if (!is_array($item)) {
            continue;
        }
        $service = sanitize_key((string) ($item['service'] ?? ''));
        if ($service === '' || isset($channels[$service])) {
            continue;
        }
        $channels[$service] = byline_distribution_default_channel($service, byline_distribution_text($item['label'] ?? ucfirst($service), 80));
        $channels[$service]['configured'] = true;
        $channels[$service]['status'] = 'ready';
    }
    return $channels;
}

function byline_distribution_discord_channel_id(): string
{
    $value = function_exists('get_option') ? get_option('byline_discord_distribution_channel_id', '') : '';
    if (!is_scalar($value) || trim((string) $value) === '') {
        $value = getenv('WWH_DISCORD_DISTRIBUTION_CHANNEL_ID');
    }
    $value = is_scalar($value) ? trim((string) $value) : '';
    if (function_exists('apply_filters')) {
        $value = apply_filters('byline_distribution_discord_channel_id', $value);
    }
    return preg_match('/^\d{1,32}$/', (string) $value) === 1 ? (string) $value : '';
}

function byline_distribution_channel_descriptors(int $post_id = 0): array
{
    $stored = $post_id > 0 ? byline_distribution_read_stored_state($post_id) : ['channels' => []];
    $saved = is_array($stored['channels'] ?? null) ? $stored['channels'] : [];
    $channels = [];

    $website = byline_distribution_default_channel('website', 'Website');
    $website['configured'] = true;
    $website['status'] = 'not_published';
    $post = $post_id > 0 ? byline_distribution_post($post_id) : null;
    if (is_object($post) && (string) ($post->post_status ?? '') === 'publish') {
        $website['status'] = 'published';
        $deployment = function_exists('byline_deployment_status') ? byline_deployment_status() : [];
        $manifest = function_exists('byline_public_manifest_diagnostic') ? byline_public_manifest_diagnostic() : [];
        if (!empty($deployment['pending'])) {
            $website['status'] = 'rebuild_pending';
        } elseif (preg_match('/failed|no http status|http [45]\d\d/i', (string) ($deployment['lastStatus'] ?? '')) === 1) {
            $website['status'] = 'build_failed';
        } elseif (!empty($manifest['reachable'])) {
            $website['status'] = 'live';
        }
        $website['evidence'] = [
            'wordpressStatus' => byline_distribution_text($post->post_status ?? '', 32),
            'deploymentStatus' => byline_distribution_text($deployment['lastStatus'] ?? '', 80),
            'manifestStatus' => byline_distribution_text($manifest['status'] ?? '', 80),
        ];
    }
    $channels['website'] = $website;

    $discord = byline_distribution_default_channel('discord', 'Discord');
    $discord_channel = byline_distribution_discord_channel_id();
    $discord['configured'] = $discord_channel !== '';
    $discord['status'] = $discord_channel !== '' ? 'ready' : 'not_configured';
    if ($discord_channel !== '') {
        $discord['destinationId'] = $discord_channel;
    }
    $channels['discord'] = $discord;

    $newsletter = byline_distribution_default_channel('newsletter', 'Next newsletter');
    if (function_exists('byline_newsletter_provider_configured')) {
        $newsletter_settings = function_exists('byline_newsletter_raw_settings') ? byline_newsletter_raw_settings() : [];
        $provider = (string) ($newsletter_settings['provider'] ?? 'none');
        $newsletter['configured'] = byline_newsletter_provider_configured($provider, $newsletter_settings);
        $newsletter['status'] = $newsletter['configured'] ? 'ready' : 'not_configured';
    }
    $channels['newsletter'] = $newsletter;

    foreach (byline_distribution_publication_socials() as $service => $social) {
        $channels[$service] = $social;
    }

    foreach ($channels as $channel_id => $channel) {
        if (is_array($saved[$channel_id] ?? null)) {
            $saved_channel = byline_distribution_sanitize_channel($saved[$channel_id], $channel_id, $channel['label']);
            // Website's status is derived, but preserve its evidence and
            // configured truth while allowing saved operational fields.
            $channel = array_merge($channel, $saved_channel);
            if ($channel_id === 'website') {
                $channel['status'] = $website['status'];
                $channel['configured'] = true;
            }
        }
        $channels[$channel_id] = $channel;
    }
    return $channels;
}

function byline_distribution_get_state(int $post_id): array
{
    return [
        'version' => BYLINE_DISTRIBUTION_VERSION,
        'postId' => $post_id,
        'channels' => byline_distribution_channel_descriptors($post_id),
    ];
}

function byline_distribution_public_url(int $post_id): string
{
    $url = function_exists('get_permalink') ? get_permalink($post_id) : '';
    if (!is_string($url) || $url === '') {
        return '';
    }
    return function_exists('esc_url_raw') ? esc_url_raw($url, ['http', 'https']) : $url;
}

function byline_distribution_copy_payload(int $post_id, string $channel = ''): array
{
    if (!byline_distribution_post_is_published($post_id)) {
        return ['ok' => false, 'error' => 'Copy and distribution are available after the story is published.'];
    }
    $post = byline_distribution_post($post_id);
    $headline = function_exists('get_the_title') ? get_the_title($post_id) : ($post->post_title ?? '');
    $excerpt = function_exists('get_the_excerpt') ? get_the_excerpt($post_id) : ($post->post_excerpt ?? '');
    $headline = byline_distribution_text($headline, 240);
    $excerpt = byline_distribution_text($excerpt, 500);
    $url = byline_distribution_public_url($post_id);
    $caption = $headline;
    if ($excerpt !== '') {
        $caption .= "\n\n" . $excerpt;
    }
    if ($url !== '') {
        $caption .= "\n\n" . $url;
    }
    $result = [
        'ok' => true,
        'postId' => $post_id,
        'headline' => $headline,
        'excerpt' => $excerpt,
        'caption' => $caption,
        'headlineAndUrl' => trim($headline . "\n" . $url),
        'canonicalUrl' => $url,
        'channel' => sanitize_key($channel),
        'utmUrl' => $url,
    ];
    $service = sanitize_key($channel);
    if ($url !== '' && $service !== '' && function_exists('add_query_arg')) {
        $result['utmUrl'] = add_query_arg([
            'utm_source' => $service,
            'utm_medium' => 'social',
            'utm_campaign' => 'story-distribution',
        ], $url);
    }
    return $result;
}

function byline_distribution_request_id(int $post_id, string $channel): string
{
    if (function_exists('wp_generate_uuid4')) {
        return (string) wp_generate_uuid4();
    }
    return substr(hash('sha256', $post_id . '|' . $channel . '|' . microtime(true) . '|' . mt_rand()), 0, 32);
}

function byline_distribution_current_user_id(): int
{
    return function_exists('get_current_user_id') ? absint(get_current_user_id()) : 0;
}

function byline_distribution_complete(int $post_id, string $channel_id, bool $success, string $external_id = '', string $external_url = '', string $error = ''): array
{
    $channels = byline_distribution_channel_descriptors($post_id);
    $channel = $channels[$channel_id] ?? byline_distribution_default_channel($channel_id);
    $channel['status'] = $success ? 'sent' : 'failed';
    $channel['externalId'] = byline_distribution_text($external_id, 256);
    $channel['externalUrl'] = byline_distribution_text($external_url, 512);
    $channel['lastError'] = $success ? '' : byline_distribution_text($error !== '' ? $error : 'The optional integration failed.', 500);
    $channel['distributedAt'] = $success ? gmdate('c') : (string) ($channel['distributedAt'] ?? '');
    $channel['updatedAt'] = gmdate('c');
    byline_distribution_persist_channel($post_id, $channel_id, $channel);
    return byline_distribution_get_state($post_id);
}

function byline_distribution_dispatch(string $channel_id, int $post_id, array $payload): ?array
{
    try {
        if ($channel_id === 'discord' && function_exists('do_action')) {
            do_action('byline_distribution_discord_requested', $post_id, $payload, $payload['requestId']);
        } elseif ($channel_id === 'newsletter' && function_exists('do_action')) {
            do_action('byline_distribution_newsletter_requested', $post_id, $payload, $payload['requestId']);
        }
        if (function_exists('apply_filters')) {
            $result = apply_filters('byline_distribution_' . $channel_id . '_dispatch', null, $payload);
            return is_array($result) ? $result : null;
        }
    } catch (Throwable $exception) {
        return ['ok' => false, 'error' => 'The optional distribution integration failed.'];
    }
    return null;
}

function byline_distribution_request(int $post_id, string $channel_id, array $extra = []): array
{
    $channel_id = sanitize_key($channel_id);
    $state = byline_distribution_get_state($post_id);
    $channel = $state['channels'][$channel_id] ?? null;
    if (!is_array($channel)) {
        return ['ok' => false, 'error' => 'That distribution channel is not enabled for this publication.', 'state' => $state];
    }
    if ($channel_id === 'website' || in_array($channel_id, array_keys(byline_distribution_publication_socials()), true)) {
        return ['ok' => false, 'error' => 'Use the copy-and-mark action for social channels.', 'state' => $state];
    }
    if (!byline_distribution_post_is_published($post_id)) {
        return ['ok' => false, 'error' => 'Distribution is available after the story is published.', 'state' => $state];
    }
    if (empty($channel['configured'])) {
        return ['ok' => false, 'error' => $channel_id === 'discord' ? 'Configure a dedicated Discord distribution channel first.' : 'Configure a newsletter provider first.', 'state' => $state];
    }
    if (in_array($channel['status'], ['pending', 'sent'], true) && !empty($channel['requestId'])) {
        return ['ok' => true, 'idempotent' => true, 'state' => $state];
    }
    $copy = byline_distribution_copy_payload($post_id, $channel_id);
    if (empty($copy['ok'])) {
        return ['ok' => false, 'error' => (string) ($copy['error'] ?? 'The story copy could not be prepared.'), 'state' => $state];
    }
    $request_id = byline_distribution_request_id($post_id, $channel_id);
    $payload = array_merge([
        'postId' => $post_id,
        'requestId' => $request_id,
        'idempotencyKey' => $request_id,
        'channelId' => $channel_id,
        'headline' => $copy['headline'],
        'caption' => $copy['caption'],
        'canonicalUrl' => $copy['canonicalUrl'],
        'requestedBy' => byline_distribution_current_user_id(),
    ], $extra);
    $pending = array_merge($channel, [
        'status' => 'pending',
        'requestId' => $request_id,
        'userId' => byline_distribution_current_user_id(),
        'lastError' => '',
        'updatedAt' => gmdate('c'),
    ]);
    byline_distribution_persist_channel($post_id, $channel_id, $pending);
    $dispatch = byline_distribution_dispatch($channel_id, $post_id, $payload);
    if (is_array($dispatch) && array_key_exists('ok', $dispatch)) {
        $result = byline_distribution_complete(
            $post_id,
            $channel_id,
            !empty($dispatch['ok']),
            (string) ($dispatch['externalId'] ?? ''),
            (string) ($dispatch['externalUrl'] ?? ''),
            (string) ($dispatch['error'] ?? '')
        );
        return ['ok' => !empty($dispatch['ok']), 'state' => $result, 'idempotent' => false];
    }
    return ['ok' => true, 'pending' => true, 'state' => byline_distribution_get_state($post_id), 'idempotent' => false];
}

function byline_distribution_mark_social(int $post_id, string $service, array $payload = []): array
{
    $service = sanitize_key($service);
    $available = byline_distribution_publication_socials();
    if (!isset($available[$service])) {
        return ['ok' => false, 'error' => 'That social service is not configured for this publication.', 'state' => byline_distribution_get_state($post_id)];
    }
    if (!byline_distribution_post_is_published($post_id)) {
        return ['ok' => false, 'error' => 'A story must be published before it can be marked as distributed.', 'state' => byline_distribution_get_state($post_id)];
    }
    $state = byline_distribution_get_state($post_id);
    $channel = $state['channels'][$service];
    if ($channel['status'] === 'sent') {
        return ['ok' => true, 'idempotent' => true, 'state' => $state];
    }
    $channel['status'] = 'sent';
    $channel['distributedAt'] = gmdate('c');
    $channel['userId'] = byline_distribution_current_user_id();
    $channel['updatedAt'] = gmdate('c');
    $channel['lastError'] = '';
    if (isset($payload['externalUrl']) && is_scalar($payload['externalUrl'])) {
        $channel['externalUrl'] = byline_distribution_text($payload['externalUrl'], 512);
    }
    byline_distribution_persist_channel($post_id, $service, $channel);
    return ['ok' => true, 'idempotent' => false, 'state' => byline_distribution_get_state($post_id)];
}

function byline_distribution_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }
    register_post_meta('post', BYLINE_DISTRIBUTION_META, [
        'single' => true,
        'type' => 'object',
        'show_in_rest' => false,
        'auth_callback' => static function (): bool {
            return current_user_can(defined('BYLINE_MANAGE_INTEGRATIONS_CAPABILITY') ? BYLINE_MANAGE_INTEGRATIONS_CAPABILITY : 'manage_byline_integrations');
        },
    ]);
}

function byline_distribution_request_id_from_request($request): int
{
    if (is_object($request) && method_exists($request, 'get_param')) {
        return absint($request->get_param('id'));
    }
    if (is_object($request) && method_exists($request, 'get_url_params')) {
        $params = $request->get_url_params();
        return absint($params['id'] ?? 0);
    }
    return 0;
}

function byline_distribution_rest_permission($request): bool
{
    $post_id = byline_distribution_request_id_from_request($request);
    $post = $post_id > 0 ? byline_distribution_post($post_id) : null;
    if (!is_object($post) || (($post->post_type ?? 'post') !== 'post')) {
        return false;
    }
    try {
        return (bool) current_user_can('edit_post', $post_id)
            || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline');
    } catch (Throwable $exception) {
        return false;
    }
}

function byline_distribution_rest_action_permission($request): bool
{
    $post_id = byline_distribution_request_id_from_request($request);
    $post = $post_id > 0 ? byline_distribution_post($post_id) : null;
    if (!is_object($post) || (($post->post_type ?? 'post') !== 'post')) {
        return false;
    }

    try {
        if (!current_user_can('edit_post', $post_id)) {
            return false;
        }
    } catch (Throwable $exception) {
        return false;
    }

    return current_user_can('publish_posts')
        || current_user_can('edit_others_posts')
        || current_user_can(defined('BYLINE_MANAGE_CAPABILITY') ? BYLINE_MANAGE_CAPABILITY : 'manage_byline');
}

function byline_distribution_request_params($request): array
{
    if (is_object($request) && method_exists($request, 'get_json_params')) {
        $params = $request->get_json_params();
        return is_array($params) ? $params : [];
    }
    return [];
}

function byline_distribution_rest_state($request)
{
    return rest_ensure_response(byline_distribution_get_state(byline_distribution_request_id_from_request($request)));
}

function byline_distribution_rest_copy($request)
{
    $post_id = byline_distribution_request_id_from_request($request);
    $channel = '';
    if (is_object($request) && method_exists($request, 'get_param')) {
        $channel = (string) $request->get_param('channel');
    }
    return rest_ensure_response(byline_distribution_copy_payload($post_id, $channel));
}

function byline_distribution_rest_social($request)
{
    $params = byline_distribution_request_params($request);
    $service = (string) ($params['service'] ?? ($params['channel'] ?? ''));
    return rest_ensure_response(byline_distribution_mark_social(byline_distribution_request_id_from_request($request), $service, $params));
}

function byline_distribution_rest_discord($request)
{
    return rest_ensure_response(byline_distribution_request(byline_distribution_request_id_from_request($request), 'discord'));
}

function byline_distribution_rest_newsletter($request)
{
    $params = byline_distribution_request_params($request);
    return rest_ensure_response(byline_distribution_request(byline_distribution_request_id_from_request($request), 'newsletter', [
        'newsletterId' => absint($params['newsletterId'] ?? 0),
    ]));
}

function byline_register_distribution_routes(): void
{
    if (!function_exists('register_rest_route')) {
        return;
    }
    $permission = 'byline_distribution_rest_permission';
    register_rest_route('byline/v1', '/editorial/distribution/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_distribution_rest_state',
        'permission_callback' => $permission,
    ]);
    register_rest_route('byline/v1', '/editorial/distribution/(?P<id>\d+)/copy', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_distribution_rest_copy',
        'permission_callback' => $permission,
    ]);
    register_rest_route('byline/v1', '/editorial/distribution/(?P<id>\d+)/social', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_distribution_rest_social',
        'permission_callback' => 'byline_distribution_rest_action_permission',
    ]);
    register_rest_route('byline/v1', '/editorial/distribution/(?P<id>\d+)/discord', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_distribution_rest_discord',
        'permission_callback' => 'byline_distribution_rest_action_permission',
    ]);
    register_rest_route('byline/v1', '/editorial/distribution/(?P<id>\d+)/newsletter', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_distribution_rest_newsletter',
        'permission_callback' => 'byline_distribution_rest_action_permission',
    ]);
    register_rest_route('byline/v1', '/admin/distribution/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_distribution_rest_state',
        'permission_callback' => $permission,
    ]);
}

function byline_register_distribution_hooks(): void
{
    if (function_exists('add_action')) {
        add_action('init', 'byline_distribution_register_meta');
        add_action('rest_api_init', 'byline_register_distribution_routes');
    }
}
