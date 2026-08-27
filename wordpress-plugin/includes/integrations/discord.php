<?php

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_DISCORD_API_BASE = 'https://discord.com/api/v10';
const BYLINE_DISCORD_DIRECTORY_TRANSIENT = 'byline_discord_directory';
const BYLINE_DISCORD_HEALTH_TRANSIENT = 'byline_discord_bot_health';
const BYLINE_DISCORD_FORUM_CHANNEL_TYPE = 15;

/**
 * Every Discord connection value Byline manages, in the order the settings
 * screen presents them. WordPress owns each value; the environment variables
 * listed here remain a fallback so an installation configured before the
 * settings screen existed keeps working untouched.
 */
function byline_discord_settings_map(): array
{
    return [
        'clientId' => ['option' => 'byline_discord_client_id', 'env' => ['WWH_DISCORD_CLIENT_ID', 'DISCORD_CLIENT_ID'], 'type' => 'snowflake'],
        'botToken' => ['option' => 'byline_discord_bot_token', 'env' => ['DISCORD_TOKEN', 'WWH_DISCORD_BOT_TOKEN'], 'type' => 'secret'],
        'clientSecret' => ['option' => 'byline_discord_client_secret', 'env' => ['WWH_DISCORD_CLIENT_SECRET'], 'type' => 'secret'],
        'guildId' => ['option' => 'byline_discord_guild_id', 'env' => ['WWH_DISCORD_GUILD_ID'], 'type' => 'snowflake'],
        'storyboardChannelId' => ['option' => 'byline_discord_storyboard_channel_id', 'env' => ['WWH_DISCORD_STORYBOARD_CHANNEL_ID'], 'type' => 'snowflake'],
        'announcementsChannelId' => ['option' => 'byline_discord_announcements_channel_id', 'env' => ['WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID'], 'type' => 'snowflake'],
        'staffRoleId' => ['option' => 'byline_discord_staff_role_id', 'env' => ['WWH_DISCORD_STAFF_ROLE_ID'], 'type' => 'snowflake'],
        'botUrl' => ['option' => 'byline_discord_bot_url', 'env' => ['WWH_DISCORD_BOT_URL'], 'type' => 'url'],
        'announcePublished' => ['option' => 'byline_discord_announce_published', 'env' => ['WWH_PUBLICATION_ANNOUNCEMENTS'], 'type' => 'bool', 'default' => '1'],
        'reconcileMinutes' => ['option' => 'byline_discord_reconcile_minutes', 'env' => ['WWH_RECONCILE_INTERVAL_MS'], 'type' => 'minutes', 'default' => '5'],
    ];
}

function byline_discord_secret_keys(): array
{
    return ['botToken', 'clientSecret'];
}

/**
 * The offered reconciliation intervals, plus whatever interval the
 * installation already inherited from its environment so that value stays
 * selectable instead of being rejected on the next save.
 */
function byline_discord_reconcile_choices(): array
{
    $choices = [1, 5, 10, 15, 30, 60];
    $current = (int) byline_discord_setting('reconcileMinutes');
    if ($current > 0 && !in_array($current, $choices, true)) {
        $choices[] = $current;
        sort($choices);
    }
    return $choices;
}

function byline_discord_environment_value(string $key): string
{
    $field = byline_discord_settings_map()[$key] ?? null;
    if (!$field) {
        return '';
    }
    foreach ($field['env'] as $name) {
        $value = wwh_discord_config($name);
        if ($value !== '') {
            return $field['type'] === 'minutes' ? (string) byline_discord_minutes_from_ms($value) : $value;
        }
    }
    return '';
}

function byline_discord_minutes_from_ms($value): int
{
    $minutes = (int) round(((float) $value) / 60000);
    return $minutes > 0 ? $minutes : 5;
}

/**
 * Resolves one connection value: the WordPress option wins, the environment
 * fills the gap, and the documented default closes it.
 */
function byline_discord_setting(string $key): string
{
    $field = byline_discord_settings_map()[$key] ?? null;
    if (!$field) {
        return '';
    }
    $stored = get_option($field['option'], null);
    if (is_string($stored) && trim($stored) !== '') {
        return trim($stored);
    }
    if ($field['type'] === 'bool' && ($stored === '0' || $stored === 0 || $stored === false)) {
        return '0';
    }
    $environment = byline_discord_environment_value($key);
    if ($environment !== '') {
        return $field['type'] === 'bool' ? ($environment === 'false' || $environment === '0' ? '0' : '1') : $environment;
    }
    return (string) ($field['default'] ?? '');
}

function byline_discord_setting_source(string $key): string
{
    $field = byline_discord_settings_map()[$key] ?? null;
    if (!$field) {
        return 'unset';
    }
    $stored = get_option($field['option'], null);
    if ((is_string($stored) && trim($stored) !== '') || ($field['type'] === 'bool' && ($stored === '0' || $stored === 0))) {
        return 'wordpress';
    }
    return byline_discord_environment_value($key) !== '' ? 'environment' : 'unset';
}

function byline_discord_enabled(): bool
{
    return byline_discord_setting('botToken') !== '' || byline_discord_setting('botUrl') !== '';
}

function byline_discord_validate_bot_url($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $url = esc_url_raw(trim($value), ['https', 'http']);
    if ($url === '') {
        return '';
    }
    $scheme = wp_parse_url($url, PHP_URL_SCHEME);
    $host = (string) wp_parse_url($url, PHP_URL_HOST);
    $local = in_array($host, ['localhost', '127.0.0.1', 'discord-bot', 'bot'], true);
    if ($scheme === 'https' || ($scheme === 'http' && $local)) {
        return untrailingslashit($url);
    }
    return '';
}

// --- Discord API ------------------------------------------------------------

function byline_discord_api_get(string $path)
{
    $token = byline_discord_setting('botToken');
    if ($token === '') {
        return new WP_Error('byline_discord_no_token', 'Add a bot token before Byline can reach Discord.');
    }
    $response = wp_remote_get(BYLINE_DISCORD_API_BASE . $path, [
        'timeout' => 10,
        'redirection' => 0,
        'headers' => ['Authorization' => 'Bot ' . $token, 'User-Agent' => 'Byline (https://github.com/, 1.0)'],
    ]);
    if (is_wp_error($response)) {
        return new WP_Error('byline_discord_unreachable', 'Byline could not reach the Discord API.');
    }
    $code = (int) wp_remote_retrieve_response_code($response);
    $body = json_decode((string) wp_remote_retrieve_body($response), true);
    if ($code === 401) {
        return new WP_Error('byline_discord_unauthorized', 'Discord rejected the bot token.');
    }
    if ($code === 403) {
        return new WP_Error('byline_discord_forbidden', 'The bot lacks access to that Discord resource.');
    }
    if ($code === 429) {
        return new WP_Error('byline_discord_rate_limited', 'Discord is rate limiting Byline. Try again shortly.');
    }
    if ($code < 200 || $code >= 300 || !is_array($body)) {
        $message = is_array($body) && isset($body['message']) ? (string) $body['message'] : sprintf('Discord returned HTTP %d.', $code);
        return new WP_Error('byline_discord_error', $message);
    }
    return $body;
}

function byline_discord_directory_cache_key(): string
{
    return BYLINE_DISCORD_DIRECTORY_TRANSIENT . '_' . substr(hash('sha256', byline_discord_setting('botToken') . '|' . byline_discord_setting('guildId')), 0, 20);
}

function byline_discord_flush_caches(): void
{
    delete_transient(byline_discord_directory_cache_key());
    delete_transient(BYLINE_DISCORD_HEALTH_TRANSIENT);
}

function byline_discord_named_list(array $items): array
{
    return array_values(array_map(static function (array $item): array {
        return ['id' => (string) ($item['id'] ?? ''), 'name' => (string) ($item['name'] ?? '')];
    }, $items));
}

/**
 * The servers, channels, and roles the saved bot token can actually see. This
 * is what turns the settings screen's pickers into real choices instead of
 * hand-copied Snowflake IDs.
 */
function byline_discord_directory(bool $refresh = false): array
{
    $empty = ['available' => false, 'error' => '', 'guilds' => [], 'forums' => [], 'textChannels' => [], 'roles' => []];
    if (byline_discord_setting('botToken') === '') {
        $empty['error'] = 'Add a bot token to load servers, channels, and roles.';
        return $empty;
    }
    $key = byline_discord_directory_cache_key();
    if (!$refresh) {
        $cached = get_transient($key);
        if (is_array($cached)) {
            return $cached;
        }
    }
    $guilds = byline_discord_api_get('/users/@me/guilds');
    if (is_wp_error($guilds)) {
        $empty['error'] = $guilds->get_error_message();
        set_transient($key, $empty, MINUTE_IN_SECONDS);
        return $empty;
    }
    $directory = array_merge($empty, ['available' => true, 'guilds' => byline_discord_named_list($guilds)]);
    $guild_id = byline_discord_setting('guildId');
    if ($guild_id !== '') {
        $channels = byline_discord_api_get('/guilds/' . $guild_id . '/channels');
        if (is_wp_error($channels)) {
            $directory['error'] = $channels->get_error_message();
        } else {
            $directory['forums'] = byline_discord_named_list(array_filter($channels, static function ($channel): bool {
                return is_array($channel) && (int) ($channel['type'] ?? -1) === BYLINE_DISCORD_FORUM_CHANNEL_TYPE;
            }));
            $directory['textChannels'] = byline_discord_named_list(array_filter($channels, static function ($channel): bool {
                return is_array($channel) && in_array((int) ($channel['type'] ?? -1), [0, 5], true);
            }));
        }
        $roles = byline_discord_api_get('/guilds/' . $guild_id . '/roles');
        if (!is_wp_error($roles)) {
            $directory['roles'] = byline_discord_named_list(array_filter($roles, static function ($role): bool {
                return is_array($role) && ($role['name'] ?? '') !== '@everyone';
            }));
        }
    }
    set_transient($key, $directory, 5 * MINUTE_IN_SECONDS);
    return $directory;
}

function byline_discord_directory_has(array $list, string $id): bool
{
    if ($id === '') {
        return false;
    }
    foreach ($list as $item) {
        if (($item['id'] ?? '') === $id) {
            return true;
        }
    }
    return false;
}

// --- Bot process ------------------------------------------------------------

function byline_discord_bot_health(bool $refresh = false): array
{
    $url = byline_discord_setting('botUrl');
    if ($url === '') {
        return ['reachable' => false, 'error' => 'No bot URL is configured.', 'health' => []];
    }
    if (!$refresh) {
        $cached = get_transient(BYLINE_DISCORD_HEALTH_TRANSIENT);
        if (is_array($cached)) {
            return $cached;
        }
    }
    $response = wp_remote_get($url . '/healthz', ['timeout' => 5, 'redirection' => 0]);
    if (is_wp_error($response)) {
        $result = ['reachable' => false, 'error' => $response->get_error_message(), 'health' => []];
    } else {
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $result = is_array($body)
            ? ['reachable' => true, 'error' => '', 'health' => $body]
            : ['reachable' => false, 'error' => 'The bot did not return a health report.', 'health' => []];
    }
    set_transient(BYLINE_DISCORD_HEALTH_TRANSIENT, $result, 30);
    return $result;
}

function byline_discord_bot_request(string $path, array $data = []): array
{
    $url = byline_discord_setting('botUrl');
    $secret = wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET');
    if ($url === '' || $secret === '') {
        return ['ok' => false, 'error' => 'Set a bot URL and a bridge secret before asking the bot to run.'];
    }
    $body = wp_json_encode($data);
    $timestamp = (string) time();
    $signature = wwh_discord_sign($timestamp, 'POST', $path, $body, $secret);
    $response = wp_remote_post($url . $path, ['timeout' => 15, 'redirection' => 0, 'headers' => [
        'Content-Type' => 'application/json',
        'X-Byline-Timestamp' => $timestamp,
        'X-Byline-Signature' => $signature,
        'X-WWH-Timestamp' => $timestamp,
        'X-WWH-Signature' => $signature,
        'X-Byline-Request-Id' => wp_generate_uuid4(),
    ], 'body' => $body]);
    if (is_wp_error($response)) {
        return ['ok' => false, 'error' => $response->get_error_message()];
    }
    $code = (int) wp_remote_retrieve_response_code($response);
    $payload = json_decode((string) wp_remote_retrieve_body($response), true);
    if ($code < 200 || $code >= 300) {
        $message = is_array($payload) && isset($payload['error']) ? (string) $payload['error'] : sprintf('The bot returned HTTP %d.', $code);
        return ['ok' => false, 'error' => $message];
    }
    return ['ok' => true, 'error' => '', 'body' => is_array($payload) ? $payload : []];
}

// --- Status -----------------------------------------------------------------

function byline_discord_last_sync_label($value): string
{
    if (!is_string($value) || trim($value) === '') {
        return 'Never';
    }
    $timestamp = strtotime($value);
    return $timestamp ? wp_date('M j, Y g:i A T', $timestamp, wp_timezone()) : 'Never';
}

/**
 * The status panel. The running bot is authoritative about what it can see;
 * when it is not running WordPress answers the same questions itself through
 * the Discord API so the screen is still useful during first-time setup.
 */
function byline_discord_status(bool $refresh = false): array
{
    $bot = byline_discord_bot_health($refresh);
    $health = $bot['health'];
    $directory = byline_discord_directory($refresh);
    $status = [
        'botConnected' => (bool) $bot['reachable'],
        'discordConnected' => $bot['reachable'] ? !empty($health['discordConnected']) : $directory['available'],
        'guildFound' => $bot['reachable'] ? !empty($health['guildFound']) : byline_discord_directory_has($directory['guilds'], byline_discord_setting('guildId')),
        'storyboardFound' => $bot['reachable'] ? !empty($health['storyboardFound']) : byline_discord_directory_has($directory['forums'], byline_discord_setting('storyboardChannelId')),
        'announcementsFound' => $bot['reachable'] ? !empty($health['announcementsFound']) : byline_discord_directory_has($directory['textChannels'], byline_discord_setting('announcementsChannelId')),
        'lastSyncAt' => byline_discord_last_sync_label($health['lastSuccessfulReconciliation'] ?? ''),
        'source' => $bot['reachable'] ? 'bot' : 'wordpress',
        'message' => '',
    ];
    if ($bot['reachable']) {
        $status['message'] = (string) ($health['message'] ?? 'Ready');
    } elseif ($bot['error'] !== '') {
        $status['message'] = $bot['error'];
    } elseif ($directory['error'] !== '') {
        $status['message'] = $directory['error'];
    } else {
        $status['message'] = 'Checked from WordPress. The bot is not running yet.';
    }
    return $status;
}

function byline_discord_settings_payload(): array
{
    $values = [];
    foreach (array_keys(byline_discord_settings_map()) as $key) {
        if (in_array($key, byline_discord_secret_keys(), true)) {
            continue;
        }
        $values[$key] = byline_discord_setting($key);
    }
    $values['announcePublished'] = byline_discord_setting('announcePublished') === '1';
    $values['reconcileMinutes'] = (int) byline_discord_setting('reconcileMinutes');
    $sources = [];
    foreach (array_keys(byline_discord_settings_map()) as $key) {
        $sources[$key] = byline_discord_setting_source($key);
    }
    return [
        'values' => $values,
        'sources' => $sources,
        'secrets' => [
            'botToken' => byline_discord_setting('botToken') !== '',
            'clientSecret' => byline_discord_setting('clientSecret') !== '',
        ],
        'bridgeSecretConfigured' => wwh_discord_config('WWH_DISCORD_BRIDGE_SECRET') !== '',
        'reconcileChoices' => byline_discord_reconcile_choices(),
    ];
}

function byline_discord_admin_payload(bool $refresh = false): array
{
    return [
        'settings' => byline_discord_settings_payload(),
        'status' => byline_discord_status($refresh),
        'directory' => byline_discord_directory($refresh),
    ];
}

// --- REST -------------------------------------------------------------------

function byline_can_manage_discord(): bool
{
    return current_user_can(BYLINE_MANAGE_INTEGRATIONS_CAPABILITY);
}

function byline_rest_get_discord(WP_REST_Request $request): WP_REST_Response
{
    return rest_ensure_response(byline_discord_admin_payload((bool) $request->get_param('refresh')));
}

function byline_discord_store(string $key, string $value): void
{
    $option = byline_discord_settings_map()[$key]['option'];
    update_option($option, $value, false);
}

function byline_rest_update_discord(WP_REST_Request $request)
{
    $payload = $request->get_json_params();
    if (!is_array($payload)) {
        return new WP_Error('byline_discord_invalid_payload', 'Send the Discord settings as a JSON object.', ['status' => 400]);
    }

    foreach (['clientId', 'guildId', 'storyboardChannelId', 'announcementsChannelId', 'staffRoleId'] as $key) {
        if (!array_key_exists($key, $payload)) {
            continue;
        }
        $raw = trim((string) $payload[$key]);
        if ($raw === '') {
            byline_discord_store($key, '');
            continue;
        }
        $snowflake = wwh_discord_sanitize_snowflake($raw);
        if ($snowflake === '') {
            return new WP_Error('byline_discord_invalid_id', 'Discord IDs must be Snowflake values.', ['status' => 400]);
        }
        byline_discord_store($key, $snowflake);
    }

    if (array_key_exists('botUrl', $payload)) {
        $raw = trim((string) $payload['botUrl']);
        if ($raw === '') {
            byline_discord_store('botUrl', '');
        } else {
            $url = byline_discord_validate_bot_url($raw);
            if ($url === '') {
                return new WP_Error('byline_discord_invalid_bot_url', 'Enter an HTTPS bot URL, or an HTTP URL on localhost.', ['status' => 400]);
            }
            byline_discord_store('botUrl', $url);
        }
    }

    foreach (byline_discord_secret_keys() as $key) {
        if (!empty($payload['clear' . ucfirst($key)])) {
            byline_discord_store($key, '');
            continue;
        }
        if (array_key_exists($key, $payload) && trim((string) $payload[$key]) !== '') {
            byline_discord_store($key, trim((string) $payload[$key]));
        }
    }

    if (array_key_exists('announcePublished', $payload)) {
        byline_discord_store('announcePublished', !empty($payload['announcePublished']) ? '1' : '0');
    }

    if (array_key_exists('reconcileMinutes', $payload)) {
        $minutes = absint($payload['reconcileMinutes']);
        if (!in_array($minutes, byline_discord_reconcile_choices(), true)) {
            return new WP_Error('byline_discord_invalid_interval', 'Choose one of the offered reconciliation intervals.', ['status' => 400]);
        }
        byline_discord_store('reconcileMinutes', (string) $minutes);
    }

    byline_discord_flush_caches();
    return rest_ensure_response(byline_discord_admin_payload(true));
}

function byline_rest_test_discord(): WP_REST_Response
{
    byline_discord_flush_caches();
    return rest_ensure_response(byline_discord_admin_payload(true));
}

function byline_rest_sync_discord(): WP_REST_Response
{
    $result = byline_discord_bot_request('/reconcile');
    byline_discord_flush_caches();
    $payload = byline_discord_admin_payload(true);
    $payload['sync'] = ['ok' => $result['ok'], 'error' => $result['error']];
    return rest_ensure_response($payload);
}

/**
 * The bot fetches its connection settings from WordPress at boot. Its own
 * environment stays authoritative for the two values it needs before it can
 * ask: the WordPress URL and the shared bridge secret.
 */
function byline_rest_discord_bot_config(): WP_REST_Response
{
    return rest_ensure_response([
        'discordToken' => byline_discord_setting('botToken'),
        'discordClientId' => byline_discord_setting('clientId'),
        'guildId' => byline_discord_setting('guildId'),
        'storyboardChannelId' => byline_discord_setting('storyboardChannelId'),
        'announcementsChannelId' => byline_discord_setting('announcementsChannelId'),
        'staffRoleId' => byline_discord_setting('staffRoleId'),
        'publicationAnnouncements' => byline_discord_setting('announcePublished') === '1',
        'reconcileIntervalMs' => max(1, (int) byline_discord_setting('reconcileMinutes')) * 60000,
        'publicationName' => (string) byline_get_publication_config()['identity']['name'],
        'publicationShortName' => byline_publication_name(),
    ]);
}

function byline_register_discord_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/discord', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_rest_get_discord',
            'permission_callback' => 'byline_can_manage_discord',
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_rest_update_discord',
            'permission_callback' => 'byline_can_manage_discord',
        ],
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/discord/test', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_test_discord',
        'permission_callback' => 'byline_can_manage_discord',
    ]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/discord/sync', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_rest_sync_discord',
        'permission_callback' => 'byline_can_manage_discord',
    ]);
    foreach (array_unique([BYLINE_REST_NAMESPACE, WWH_REST_NAMESPACE]) as $namespace) {
        register_rest_route($namespace, '/discord/config', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_rest_discord_bot_config',
            'permission_callback' => 'wwh_discord_rest_permission',
        ]);
    }
}
add_action('rest_api_init', 'byline_register_discord_routes');
