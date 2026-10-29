<?php
/**
 * Plugin Name: Byline
 * Description: Publishing tools and integrations for the Weekly Wildcat newsroom.
 * Version: 0.3.61
 * Requires PHP: 7.4
 * Author: Byline Contributors
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/core/compatibility.php';
require_once __DIR__ . '/includes/core/protocol.php';
require_once __DIR__ . '/includes/author/social-links.php';
require_once __DIR__ . '/includes/core/capabilities.php';
require_once __DIR__ . '/includes/publication/config.php';
require_once __DIR__ . '/includes/design/post-type.php';
require_once __DIR__ . '/includes/core/diagnostics.php';
require_once __DIR__ . '/includes/content/pages.php';
require_once __DIR__ . '/includes/content/page-blocks.php';
require_once __DIR__ . '/includes/content/editor-canvas.php';
require_once __DIR__ . '/includes/admin/app.php';
require_once __DIR__ . '/includes/admin/presence.php';

// Editorial workflow is a first-class Byline domain. Integrations consume it;
// none of them owns it.
require_once __DIR__ . '/includes/editorial/workflow.php';
require_once __DIR__ . '/includes/editorial/planning.php';
require_once __DIR__ . '/includes/editorial/tasks.php';
require_once __DIR__ . '/includes/editorial/media.php';
require_once __DIR__ . '/includes/editorial/coverage.php';
require_once __DIR__ . '/includes/editorial/corrections.php';
require_once __DIR__ . '/includes/editorial/feedback.php';
require_once __DIR__ . '/includes/editorial/contributors.php';
require_once __DIR__ . '/includes/editorial/readiness.php';
require_once __DIR__ . '/includes/editorial/activity.php';
require_once __DIR__ . '/includes/editorial/presets.php';
require_once __DIR__ . '/includes/editorial/preview.php';
require_once __DIR__ . '/includes/editorial/rest.php';
require_once __DIR__ . '/includes/editorial/articles.php';
require_once __DIR__ . '/includes/editorial/remote-access.php';
require_once __DIR__ . '/includes/mcp/bootstrap.php';
require_once __DIR__ . '/includes/editorial/quick-view.php';
require_once __DIR__ . '/includes/editorial/admin.php';
require_once __DIR__ . '/includes/editorial/guests-admin.php';

// Polls are WordPress-native content with their own vote table. WordPress is
// the only datastore for poll definitions, lifecycle, and votes.
require_once __DIR__ . '/includes/polls/schema.php';
require_once __DIR__ . '/includes/polls/votes.php';
require_once __DIR__ . '/includes/polls/voter.php';
require_once __DIR__ . '/includes/polls/post-type.php';
require_once __DIR__ . '/includes/polls/model.php';
require_once __DIR__ . '/includes/polls/rest.php';
require_once __DIR__ . '/includes/polls/editorial-rest.php';
require_once __DIR__ . '/includes/polls/admin.php';
require_once __DIR__ . '/includes/polls/migration.php';
require_once __DIR__ . '/includes/polls/cli.php';

function wwh_auth_cookie_expiration(int $length, int $user_id, bool $remember): int
{
    return DAY_IN_SECONDS;
}
add_filter('auth_cookie_expiration', 'wwh_auth_cookie_expiration', 10, 3);

function wwh_redirect_cms_frontend(): void
{
    if (
        is_admin()
        || wp_doing_ajax()
        || wp_is_json_request()
        || (is_user_logged_in() && is_preview())
    ) {
        return;
    }

    if (is_user_logged_in() && is_front_page()) {
        wp_safe_redirect(admin_url());
        exit;
    }

    if (is_user_logged_in()) {
        wp_redirect(byline_get_publication_config()['urls']['publicSite'] . '/', 302, 'Byline');
        exit;
    }

    wp_safe_redirect(wp_login_url(admin_url()));
    exit;
}
add_action('template_redirect', 'wwh_redirect_cms_frontend', 1);

const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game';
const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster';
const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event';
const WWH_REST_NAMESPACE = 'weekly-wildcat/v1';
const WWH_CLOUDFLARE_DEPLOY_HOOK_OPTION = 'wwh_cloudflare_deploy_hook_url';
const WWH_CLOUDFLARE_DEPLOY_LAST_TRIGGERED_OPTION = 'wwh_cloudflare_deploy_last_triggered_at';
const WWH_CLOUDFLARE_DEPLOY_LAST_STATUS_OPTION = 'wwh_cloudflare_deploy_last_status';
const WWH_CLOUDFLARE_DEPLOY_EVENT = 'wwh_trigger_cloudflare_deploy';
const WWH_UNSPLASH_ACCESS_KEY_OPTION = 'wwh_unsplash_access_key';
const WWH_SPORTS_TEAM_SETTINGS_OPTION = 'wwh_sports_team_settings';
// Stores only the selected Sports Game post ID for the automatic article game card.
const WWH_PRIMARY_GAME_META = 'weekly_wildcat_primary_game_id';

require_once __DIR__ . '/includes/sports/teams.php';
require_once __DIR__ . '/includes/sports/domain.php';
require_once __DIR__ . '/includes/core/jobs.php';
require_once __DIR__ . '/includes/publication/build-snapshot.php';
require_once __DIR__ . '/includes/publication/public-revisions.php';
require_once __DIR__ . '/includes/integrations/deployment.php';
// Notifications use the durable job runner and only resolve private story
// data at delivery time after rechecking the recipient's capabilities.
require_once __DIR__ . '/includes/editorial/notifications.php';

/** Replace the WordPress mark with the configured publication identity. */
function wwh_login_logo_styles(): void
{
    $publication = byline_get_publication_config();
    $logo_url = byline_publication_absolute_url((string) ($publication['branding']['logo']['url'] ?? ''));
    if ($logo_url === '') {
        return;
    }
    ?>
    <style>
        #login h1 a,
        .login h1 a {
            background-image: url('<?php echo esc_url($logo_url); ?>');
            background-position: center;
            background-size: contain;
            height: 102px;
            width: 320px;
        }
    </style>
    <?php
}
add_action('login_enqueue_scripts', 'wwh_login_logo_styles');

function wwh_login_logo_url(): string
{
    return byline_get_publication_config()['urls']['publicSite'];
}
add_filter('login_headerurl', 'wwh_login_logo_url');

function wwh_login_logo_text(): string
{
    return byline_get_publication_config()['identity']['name'];
}
add_filter('login_headertext', 'wwh_login_logo_text');

function wwh_login_site_html_link(string $link): string
{
    $publication = byline_get_publication_config();
    return sprintf(
        '<a href="%s">&larr; Go to %s</a>',
        esc_url(rtrim($publication['urls']['publicSite'], '/') . '/'),
        esc_html($publication['identity']['shortName'])
    );
}
add_filter('login_site_html_link', 'wwh_login_site_html_link');

function wwh_unsplash_access_key(): string
{
    if (defined('WWH_UNSPLASH_ACCESS_KEY')) {
        $value = constant('WWH_UNSPLASH_ACCESS_KEY');
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }
    }

    $value = getenv('WWH_UNSPLASH_ACCESS_KEY');
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    return trim((string) get_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, ''));
}

function wwh_unsplash_photo_cache_key(string $photo_id): string
{
    return 'wwh_unsplash_photo_' . md5($photo_id);
}

function wwh_unsplash_photo(string $photo_id): array
{
    $cache_key = wwh_unsplash_photo_cache_key($photo_id);
    $cached = get_transient($cache_key);
    if (is_array($cached)) {
        return $cached;
    }

    $access_key = wwh_unsplash_access_key();
    if ($access_key === '') {
        return [];
    }

    $response = wp_remote_get(
        'https://api.unsplash.com/photos/' . rawurlencode($photo_id),
        [
            'timeout' => 10,
            'headers' => [
                'Authorization' => 'Client-ID ' . $access_key,
                'Accept-Version' => 'v1',
            ],
        ]
    );
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        set_transient($cache_key, [], 15 * MINUTE_IN_SECONDS);
        return [];
    }

    $photo = json_decode(wp_remote_retrieve_body($response), true);
    $image_url = is_array($photo) ? ($photo['urls']['raw'] ?? '') : '';
    $photographer = is_array($photo) ? ($photo['user']['name'] ?? '') : '';
    $photographer_url = is_array($photo) ? ($photo['user']['links']['html'] ?? '') : '';
    $photo_url = is_array($photo) ? ($photo['links']['html'] ?? '') : '';
    if (!is_string($image_url) || !is_string($photographer) || !is_string($photographer_url) || !is_string($photo_url)
        || $image_url === '' || $photographer === '' || $photographer_url === '' || $photo_url === '') {
        set_transient($cache_key, [], 15 * MINUTE_IN_SECONDS);
        return [];
    }

    $result = [
        'imageUrl' => add_query_arg(['w' => 2400, 'q' => 85, 'fit' => 'max'], $image_url),
        'photographer' => $photographer,
        'photographerUrl' => add_query_arg(['utm_source' => 'weekly_wildcat_cms', 'utm_medium' => 'referral'], $photographer_url),
        'photoUrl' => add_query_arg(['utm_source' => 'weekly_wildcat_cms', 'utm_medium' => 'referral'], $photo_url),
    ];
    set_transient($cache_key, $result, 7 * DAY_IN_SECONDS);
    return $result;
}

function wwh_unsplash_login_photos(): array
{
    $cached = get_transient('wwh_unsplash_login_photos');
    if (is_array($cached)) {
        return $cached;
    }

    $access_key = wwh_unsplash_access_key();
    if ($access_key === '') {
        return [];
    }

    $photos_by_id = [];
    for ($batch = 0; $batch < 3; $batch++) {
        $url = add_query_arg(
            [
                'orientation' => 'landscape',
                'content_filter' => 'high',
                'count' => 30,
            ],
            'https://api.unsplash.com/photos/random'
        );
        $response = wp_remote_get(
            $url,
            [
                'timeout' => 10,
                'headers' => [
                    'Authorization' => 'Client-ID ' . $access_key,
                    'Accept-Version' => 'v1',
                ],
            ]
        );
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            continue;
        }

        $results = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($results)) {
            continue;
        }

        foreach ($results as $photo) {
            $photo_id = $photo['id'] ?? '';
            $image_url = $photo['urls']['raw'] ?? '';
            $photographer = $photo['user']['name'] ?? '';
            $photographer_url = $photo['user']['links']['html'] ?? '';
            $photo_url = $photo['links']['html'] ?? '';
            if (!is_string($image_url) || !is_string($photographer) || !is_string($photographer_url) || !is_string($photo_url)
                || $image_url === '' || $photographer === '' || $photographer_url === '' || $photo_url === '') {
                continue;
            }

            if (!is_string($photo_id) || $photo_id === '') {
                $photo_id = md5($image_url);
            }

            $photos_by_id[$photo_id] = [
                'imageUrl' => add_query_arg(['w' => 2400, 'q' => 85, 'fit' => 'max'], $image_url),
                'photographer' => $photographer,
                'photographerUrl' => add_query_arg(['utm_source' => 'weekly_wildcat_cms', 'utm_medium' => 'referral'], $photographer_url),
                'photoUrl' => add_query_arg(['utm_source' => 'weekly_wildcat_cms', 'utm_medium' => 'referral'], $photo_url),
            ];
        }
    }

    $photos = array_values($photos_by_id);
    set_transient('wwh_unsplash_login_photos', $photos, $photos === [] ? 15 * MINUTE_IN_SECONDS : HOUR_IN_SECONDS);
    return $photos;
}

function wwh_unsplash_login_photo(): array
{
    static $selected = null;
    if (is_array($selected)) {
        return $selected;
    }

    $photos = wwh_unsplash_login_photos();
    $selected = $photos === [] ? [] : $photos[array_rand($photos)];
    return $selected;
}

function wwh_login_background_styles(): void
{
    $photo = wwh_unsplash_login_photo();
    if ($photo === []) {
        return;
    }
    ?>
    <style>
        body.login {
            background-color: #202124;
            background-image: linear-gradient(rgba(0, 0, 0, .42), rgba(0, 0, 0, .58)), url('<?php echo esc_url($photo['imageUrl']); ?>');
            background-position: center;
            background-repeat: no-repeat;
            background-size: cover;
            min-height: 100vh;
        }
        body.login #login {
            background: rgba(255, 255, 255, .96);
            border: 1px solid rgba(255, 255, 255, .45);
            border-radius: 16px;
            box-shadow: 0 24px 70px rgba(0, 0, 0, .34);
            box-sizing: border-box;
            left: 50%;
            margin: 0;
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            padding: 28px 30px 30px;
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%);
            width: min(380px, calc(100% - 32px));
        }
        body.login #login h1 a { max-width: 100%; }
        .wwh-unsplash-credit {
            background: rgba(0, 0, 0, .48);
            border-radius: 4px;
            bottom: 12px;
            color: rgba(255, 255, 255, .86);
            font-size: 11px;
            padding: 5px 8px;
            position: fixed;
            right: 12px;
            z-index: 10;
        }
        .wwh-unsplash-credit a { color: #fff; }
    </style>
    <?php
}
add_action('login_enqueue_scripts', 'wwh_login_background_styles');

function wwh_login_background_credit(): void
{
    $photo = wwh_unsplash_login_photo();
    if ($photo === []) {
        return;
    }

    printf(
        '<div class="wwh-unsplash-credit">Photo by <a href="%s" target="_blank" rel="noopener noreferrer">%s</a> on <a href="%s" target="_blank" rel="noopener noreferrer">Unsplash</a></div>',
        esc_url($photo['photographerUrl']),
        esc_html($photo['photographer']),
        esc_url($photo['photoUrl'])
    );
}
add_action('login_footer', 'wwh_login_background_credit');

function wwh_google_login_redirect_uri(): string
{
    return admin_url('admin-post.php?action=wwh_google_login_callback');
}

function wwh_google_client_id(): string
{
    $value = defined('BYLINE_GOOGLE_CLIENT_ID')
        ? constant('BYLINE_GOOGLE_CLIENT_ID')
        : getenv('BYLINE_GOOGLE_CLIENT_ID');
    if (!is_string($value) || trim($value) === '') {
        $value = defined('WWH_GOOGLE_CLIENT_ID') ? constant('WWH_GOOGLE_CLIENT_ID') : getenv('WWH_GOOGLE_CLIENT_ID');
    }

    return is_string($value) ? trim($value) : '';
}

function wwh_google_client_secret(): string
{
    $value = defined('BYLINE_GOOGLE_CLIENT_SECRET')
        ? constant('BYLINE_GOOGLE_CLIENT_SECRET')
        : getenv('BYLINE_GOOGLE_CLIENT_SECRET');
    if (!is_string($value) || trim($value) === '') {
        $value = defined('WWH_GOOGLE_CLIENT_SECRET') ? constant('WWH_GOOGLE_CLIENT_SECRET') : getenv('WWH_GOOGLE_CLIENT_SECRET');
    }

    return is_string($value) ? trim($value) : '';
}

function byline_google_hosted_domain(): string
{
    $value = defined('BYLINE_GOOGLE_HOSTED_DOMAIN')
        ? constant('BYLINE_GOOGLE_HOSTED_DOMAIN')
        : getenv('BYLINE_GOOGLE_HOSTED_DOMAIN');
    if (!is_string($value) || trim($value) === '') {
        $value = defined('WWH_GOOGLE_HOSTED_DOMAIN') ? constant('WWH_GOOGLE_HOSTED_DOMAIN') : getenv('WWH_GOOGLE_HOSTED_DOMAIN');
    }
    if (is_string($value) && trim($value) !== '') {
        $domain = strtolower(trim($value));
        return preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $domain) === 1 ? $domain : '';
    }
    return !function_exists('home_url') || byline_is_legacy_weekly_wildcat_installation() ? 'weeklywildcat.com' : '';
}

function wwh_google_login_is_configured(): bool
{
    return wwh_google_client_id() !== '' && wwh_google_client_secret() !== '' && byline_google_hosted_domain() !== '';
}

function wwh_google_login_configuration_notice(): void
{
    if (!current_user_can('manage_options') || wwh_google_login_is_configured()) {
        return;
    }

    $missing = [];
    if (wwh_google_client_id() === '') {
        $missing[] = 'BYLINE_GOOGLE_CLIENT_ID';
    }
    if (wwh_google_client_secret() === '') {
        $missing[] = 'BYLINE_GOOGLE_CLIENT_SECRET';
    }
    if (byline_google_hosted_domain() === '') {
        $missing[] = 'BYLINE_GOOGLE_HOSTED_DOMAIN';
    }

    printf(
        '<div class="notice notice-error"><p><strong>%s Google sign-in is not configured.</strong> Set the missing environment variable%s: <code>%s</code>. Legacy <code>WWH_*</code> credential aliases remain supported.</p></div>',
        esc_html(byline_get_publication_config()['identity']['shortName']),
        count($missing) === 1 ? '' : 's',
        esc_html(implode(', ', $missing))
    );
}
add_action('admin_notices', 'wwh_google_login_configuration_notice');

function wwh_google_login_button(string $message): string
{
    if (!wwh_google_login_is_configured()) {
        return $message;
    }

    $login_url = add_query_arg(
        'action',
        'wwh_google_login_start',
        admin_url('admin-post.php')
    );
    $button_image_url = plugin_dir_url(__FILE__) . 'assets/google-signin-light.png';

    $button = sprintf(
        '<div class="wwh-google-login"><a class="wwh-google-signin-button" href="%s"><img src="%s" alt="Sign in with Google" width="360" height="80"></a><span>Use your @%s account.</span><button type="button" class="wwh-password-login-toggle" aria-expanded="false">Use a password or reset it</button></div>',
        esc_url($login_url),
        esc_url($button_image_url),
        esc_html(byline_google_hosted_domain())
    );

    return $message . $button;
}
add_filter('login_message', 'wwh_google_login_button');

function wwh_google_login_styles(): void
{
    if (!wwh_google_login_is_configured()) {
        return;
    }
    ?>
    <style>
        .wwh-google-login {
            align-items: center;
            display: flex;
            flex-direction: column;
            margin: 0 0 20px;
            text-align: center;
            width: 100%;
        }
        .wwh-google-signin-button {
            border-radius: 4px;
            display: block;
            flex: 0 0 auto;
            height: 40px;
            margin: 0;
            transition: box-shadow .15s ease;
            width: 180px;
        }
        .wwh-google-signin-button:hover,
        .wwh-google-signin-button:focus { box-shadow: 0 1px 3px 1px rgba(60, 64, 67, .3); }
        .wwh-google-signin-button:focus { outline: 2px solid #1a73e8; outline-offset: 2px; }
        .wwh-google-signin-button img { display: block; height: 40px; width: 180px; }
        .wwh-google-login span { color: #646970; display: block; font-size: 12px; margin-top: 8px; }
        .wwh-password-login-toggle {
            background: none;
            border: 0;
            color: #50575e;
            cursor: pointer;
            font-size: 12px;
            margin-top: 12px;
            padding: 0;
            text-decoration: underline;
        }
        .wwh-password-login-toggle:hover,
        .wwh-password-login-toggle:focus { color: #135e96; }
        body.wwh-google-primary #loginform,
        body.wwh-google-primary #lostpasswordform,
        body.wwh-google-primary #resetpassform,
        body.wwh-google-primary #nav { display: none; }
    </style>
    <?php
}
add_action('login_enqueue_scripts', 'wwh_google_login_styles');

function wwh_google_login_toggle_script(): void
{
    if (!wwh_google_login_is_configured()) {
        return;
    }
    ?>
    <script>
        document.addEventListener('DOMContentLoaded', function () {
            var toggle = document.querySelector('.wwh-password-login-toggle');
            var form = document.querySelector('#loginform, #lostpasswordform, #resetpassform');

            if (!toggle || !form) {
                return;
            }

            if (!document.getElementById('login_error')) {
                document.body.classList.add('wwh-google-primary');
            } else {
                toggle.hidden = true;
                return;
            }

            toggle.addEventListener('click', function () {
                document.body.classList.remove('wwh-google-primary');
                toggle.setAttribute('aria-expanded', 'true');
                toggle.hidden = true;

                var firstField = form.querySelector('input:not([type="hidden"])');
                if (firstField) {
                    firstField.focus();
                }
            });
        });
    </script>
    <?php
}
add_action('login_footer', 'wwh_google_login_toggle_script');

function wwh_google_login_fail(string $message): void
{
    wp_die(
        esc_html($message),
        esc_html__('Google sign-in failed', 'weekly-wildcat-headless'),
        ['response' => 403, 'back_link' => true]
    );
}

function wwh_google_login_start(): void
{
    if (!wwh_google_login_is_configured()) {
        wwh_google_login_fail('Google sign-in is not configured.');
    }

    $google_client_id = wwh_google_client_id();
    $state = wp_generate_password(48, false, false);
    $nonce = wp_generate_password(48, false, false);
    set_transient('wwh_google_login_' . hash('sha256', $state), ['nonce' => $nonce], 10 * MINUTE_IN_SECONDS);

    $authorization_url = add_query_arg(
        [
            'client_id' => $google_client_id,
            'redirect_uri' => wwh_google_login_redirect_uri(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'nonce' => $nonce,
            'hd' => byline_google_hosted_domain(),
            'prompt' => 'select_account',
        ],
        'https://accounts.google.com/o/oauth2/v2/auth'
    );

    wp_redirect($authorization_url);
    exit;
}
add_action('admin_post_nopriv_wwh_google_login_start', 'wwh_google_login_start');

function wwh_google_base64url_decode(string $value): string
{
    $remainder = strlen($value) % 4;
    if ($remainder !== 0) {
        $value .= str_repeat('=', 4 - $remainder);
    }

    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    return is_string($decoded) ? $decoded : '';
}

function wwh_google_id_token_claims(string $id_token, string $expected_nonce): array
{
    $google_client_id = wwh_google_client_id();
    if ($google_client_id === '') {
        return [];
    }

    $parts = explode('.', $id_token);
    if (count($parts) !== 3) {
        return [];
    }

    $header = json_decode(wwh_google_base64url_decode($parts[0]), true);
    $claims = json_decode(wwh_google_base64url_decode($parts[1]), true);
    $signature = wwh_google_base64url_decode($parts[2]);
    if (!is_array($header) || !is_array($claims) || ($header['alg'] ?? '') !== 'RS256' || empty($header['kid']) || $signature === '') {
        return [];
    }

    $certificates = get_transient('wwh_google_signing_certificates');
    if (!is_array($certificates) || empty($certificates)) {
        $response = wp_remote_get('https://www.googleapis.com/oauth2/v1/certs', ['timeout' => 10]);
        if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
            return [];
        }

        $certificates = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($certificates)) {
            return [];
        }

        set_transient('wwh_google_signing_certificates', $certificates, HOUR_IN_SECONDS);
    }

    $certificate = $certificates[$header['kid']] ?? '';
    if (!is_string($certificate) || $certificate === '' || !function_exists('openssl_verify')) {
        return [];
    }

    $verified = openssl_verify($parts[0] . '.' . $parts[1], $signature, $certificate, OPENSSL_ALGO_SHA256);
    if ($verified !== 1) {
        return [];
    }

    $issuer = $claims['iss'] ?? '';
    $valid_issuer = $issuer === 'https://accounts.google.com' || $issuer === 'accounts.google.com';
    $audience = $claims['aud'] ?? '';
    $valid_audience = is_array($audience)
        ? in_array($google_client_id, $audience, true)
        : hash_equals($google_client_id, (string) $audience);
    $valid_authorized_party = !is_array($audience)
        || hash_equals($google_client_id, (string) ($claims['azp'] ?? ''));

    if (
        !$valid_issuer
        || !$valid_audience
        || !$valid_authorized_party
        || (int) ($claims['exp'] ?? 0) < time()
        || !hash_equals($expected_nonce, (string) ($claims['nonce'] ?? ''))
        || !hash_equals(byline_google_hosted_domain(), strtolower((string) ($claims['hd'] ?? '')))
        || ($claims['email_verified'] ?? false) !== true
        || empty($claims['sub'])
        || empty($claims['email'])
    ) {
        return [];
    }

    return $claims;
}

function wwh_google_login_callback(): void
{
    if (!wwh_google_login_is_configured()) {
        wwh_google_login_fail('Google sign-in is not configured.');
    }

    $google_client_id = wwh_google_client_id();
    $google_client_secret = wwh_google_client_secret();
    $state = isset($_GET['state']) ? sanitize_text_field(wp_unslash($_GET['state'])) : '';
    $code = isset($_GET['code']) ? sanitize_text_field(wp_unslash($_GET['code'])) : '';
    $transient_key = 'wwh_google_login_' . hash('sha256', $state);
    $login_attempt = $state !== '' ? get_transient($transient_key) : false;
    delete_transient($transient_key);

    if ($code === '' || !is_array($login_attempt) || empty($login_attempt['nonce'])) {
        wwh_google_login_fail('The Google sign-in request expired or was invalid. Please try again.');
    }

    $response = wp_remote_post(
        'https://oauth2.googleapis.com/token',
        [
            'timeout' => 15,
            'body' => [
                'code' => $code,
                'client_id' => $google_client_id,
                'client_secret' => $google_client_secret,
                'redirect_uri' => wwh_google_login_redirect_uri(),
                'grant_type' => 'authorization_code',
            ],
        ]
    );

    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        wwh_google_login_fail('Google could not complete the sign-in request.');
    }

    $token_response = json_decode(wp_remote_retrieve_body($response), true);
    $id_token = is_array($token_response) ? (string) ($token_response['id_token'] ?? '') : '';
    $claims = wwh_google_id_token_claims($id_token, (string) $login_attempt['nonce']);
    if (empty($claims)) {
        wwh_google_login_fail('Google returned an invalid identity.');
    }

    $email = strtolower(sanitize_email((string) $claims['email']));
    $user = get_user_by('email', $email);
    if (!$user instanceof WP_User) {
        wwh_google_login_fail('No existing WordPress user matches this publication account.');
    }

    $google_subject = (string) $claims['sub'];
    $saved_subject = (string) get_user_meta($user->ID, '_wwh_google_subject', true);
    if ($saved_subject !== '' && !hash_equals($saved_subject, $google_subject)) {
        wwh_google_login_fail('This WordPress user is linked to a different Google account.');
    }
    if ($saved_subject === '') {
        update_user_meta($user->ID, '_wwh_google_subject', $google_subject);
    }

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, false, is_ssl());
    do_action('wp_login', $user->user_login, $user);
    wp_safe_redirect(admin_url());
    exit;
}
add_action('admin_post_nopriv_wwh_google_login_callback', 'wwh_google_login_callback');

function wwh_author_social_fields(): array
{
    return [
        'website' => 'Website',
        'email' => 'Email',
        'instagram' => 'Instagram',
        'tiktok' => 'TikTok',
        'linkedin' => 'LinkedIn',
        'x' => 'X',
    ];
}

function wwh_image_credit_fields(): array
{
    return [
        'creator' => 'Image Creator',
        'credit_text' => 'Credit Text',
        'copyright_notice' => 'Copyright Notice',
        'license_url' => 'License URL',
        'acquire_license_url' => 'Acquire License URL',
    ];
}

function wwh_string_ends_with(string $value, string $suffix): bool
{
    return $suffix === '' || substr($value, -strlen($suffix)) === $suffix;
}

function wwh_sports_game_status_options(): array
{
    return [
        'upcoming' => 'Upcoming',
        'final' => 'Final',
        'postponed' => 'Postponed',
        'canceled' => 'Canceled',
        'forfeit' => 'Forfeit',
        'tie' => 'Tie',
    ];
}

function wwh_sports_game_status_values(): array
{
    return array_keys(wwh_sports_game_status_options());
}

function wwh_sports_game_status_shows_score(string $status): bool
{
    return in_array($status, ['final', 'tie'], true);
}

function wwh_register_update_checker(): void
{
    $update_checker_path = __DIR__ . '/plugin-update-checker/plugin-update-checker.php';

    if (!is_readable($update_checker_path)) {
        return;
    }

    require_once $update_checker_path;

    $update_checker = \YahnisElsts\PluginUpdateChecker\v5\PucFactory::buildUpdateChecker(
        'https://github.com/weeklywildcat/byline/',
        __FILE__,
        'weekly-wildcat-headless'
    );

    $update_checker->getVcsApi()->enableReleaseAssets(
        '/^weekly-wildcat-headless\.zip$/i',
        \YahnisElsts\PluginUpdateChecker\v5p7\Vcs\Api::REQUIRE_RELEASE_ASSETS
    );
}
wwh_register_update_checker();

function wwh_register_settings(): void
{
    register_setting(
        'wwh_settings',
        WWH_UNSPLASH_ACCESS_KEY_OPTION,
        [
            'type' => 'string',
            'sanitize_callback' => 'wwh_sanitize_unsplash_access_key',
            'default' => '',
            'show_in_rest' => false,
        ]
    );

    register_setting(
        'wwh_settings',
        BYLINE_DEPLOYMENT_HOOK_OPTION,
        [
            'type' => 'string',
            'sanitize_callback' => 'byline_sanitize_deployment_hook_url_setting',
            'default' => '',
            'show_in_rest' => false,
        ]
    );

    add_settings_section(
        'wwh_login_background_section',
        'Login Background',
        '__return_false',
        'wwh-settings'
    );

    add_settings_field(
        WWH_UNSPLASH_ACCESS_KEY_OPTION,
        'Unsplash Access Key',
        'wwh_render_unsplash_access_key_field',
        'wwh-settings',
        'wwh_login_background_section'
    );

    add_settings_section(
        'byline_deployment_section',
        'Deployment',
        '__return_false',
        'wwh-settings'
    );

    add_settings_field(
        BYLINE_DEPLOYMENT_HOOK_OPTION,
        'Generic Deploy Hook URL',
        'wwh_render_cloudflare_deploy_hook_field',
        'wwh-settings',
        'byline_deployment_section'
    );
}
add_action('admin_init', 'wwh_register_settings');

function wwh_sanitize_unsplash_access_key($value): string
{
    $current = (string) get_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, '');
    delete_transient('wwh_unsplash_login_photos');
    delete_transient(wwh_unsplash_photo_cache_key('ZeGQ22v9Zhk'));

    if (!current_user_can('manage_options')) {
        return $current;
    }

    if (isset($_POST['wwh_unsplash_access_key_clear'])) {
        return '';
    }

    if (!is_string($value) || trim($value) === '') {
        return $current;
    }

    $value = trim($value);
    if (strlen($value) < 20 || strlen($value) > 100 || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
        add_settings_error(
            WWH_UNSPLASH_ACCESS_KEY_OPTION,
            'wwh_unsplash_access_key_invalid',
            'Enter a valid Unsplash access key.',
            'error'
        );
        return $current;
    }

    return $value;
}

function byline_media_settings_payload(): array
{
    $saved_key = trim((string) get_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, ''));
    $external_key = '';

    if (defined('WWH_UNSPLASH_ACCESS_KEY') && is_string(constant('WWH_UNSPLASH_ACCESS_KEY'))) {
        $external_key = trim((string) constant('WWH_UNSPLASH_ACCESS_KEY'));
    }
    if ($external_key === '') {
        $environment_key = getenv('WWH_UNSPLASH_ACCESS_KEY');
        $external_key = is_string($environment_key) ? trim($environment_key) : '';
    }

    return [
        'provider' => 'unsplash',
        'configured' => $external_key !== '' || $saved_key !== '',
        'savedKeyConfigured' => $saved_key !== '',
        'managedExternally' => $external_key !== '',
        'source' => $external_key !== '' ? 'environment' : ($saved_key !== '' ? 'wordpress' : 'none'),
    ];
}

function byline_media_settings_rest($request = null)
{
    $method = is_object($request) && method_exists($request, 'get_method')
        ? strtoupper((string) $request->get_method())
        : 'GET';

    if ($method !== 'GET') {
        $params = is_object($request) && method_exists($request, 'get_json_params')
            ? $request->get_json_params()
            : [];
        $params = is_array($params) ? $params : [];
        $clear = !empty($params['clearUnsplashKey']);
        $value = is_scalar($params['unsplashKey'] ?? null) ? trim((string) $params['unsplashKey']) : '';

        if ($clear) {
            update_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, '', false);
        } elseif ($value !== '') {
            if (strlen($value) < 20 || strlen($value) > 100 || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
                return new WP_Error(
                    'byline_invalid_unsplash_access_key',
                    'Enter a valid Unsplash access key.',
                    ['status' => 400]
                );
            }
            update_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, $value, false);
        }

        delete_transient('wwh_unsplash_login_photos');
        delete_transient(wwh_unsplash_photo_cache_key('ZeGQ22v9Zhk'));
    }

    return rest_ensure_response(byline_media_settings_payload());
}

function byline_register_media_settings_route(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/admin/media-settings', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'byline_media_settings_rest',
            'permission_callback' => static function (): bool {
                return current_user_can(BYLINE_MANAGE_CAPABILITY);
            },
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'byline_media_settings_rest',
            'permission_callback' => static function (): bool {
                return current_user_can(BYLINE_MANAGE_CAPABILITY);
            },
        ],
    ]);
}
add_action('rest_api_init', 'byline_register_media_settings_route');

function wwh_render_unsplash_access_key_field(): void
{
    $saved_key = (string) get_option(WWH_UNSPLASH_ACCESS_KEY_OPTION, '');
    $external_key = '';
    if (defined('WWH_UNSPLASH_ACCESS_KEY') && is_string(constant('WWH_UNSPLASH_ACCESS_KEY'))) {
        $external_key = trim((string) constant('WWH_UNSPLASH_ACCESS_KEY'));
    }
    if ($external_key === '') {
        $environment_key = getenv('WWH_UNSPLASH_ACCESS_KEY');
        $external_key = is_string($environment_key) ? trim($environment_key) : '';
    }
    $has_saved_key = $saved_key !== '';

    ?>
    <input
        type="password"
        id="<?php echo esc_attr(WWH_UNSPLASH_ACCESS_KEY_OPTION); ?>"
        name="<?php echo esc_attr(WWH_UNSPLASH_ACCESS_KEY_OPTION); ?>"
        value=""
        class="regular-text"
        autocomplete="new-password"
        placeholder="<?php echo esc_attr($has_saved_key ? 'Saved. Enter a new key to replace it.' : 'Unsplash access key'); ?>"
    >
    <p class="description">
        <?php
        echo esc_html(
            $external_key !== ''
                ? 'A constant or Docker environment variable is active and overrides a saved key.'
                : ($has_saved_key
                    ? 'An access key is saved. Leave this blank to keep it unchanged.'
                    : 'Used only by WordPress to load rotating login backgrounds from the Unsplash Wallpapers topic.')
        );
        ?>
    </p>
    <?php if ($has_saved_key) : ?>
        <label>
            <input type="checkbox" name="wwh_unsplash_access_key_clear" value="1">
            Remove the saved Unsplash access key
        </label>
    <?php endif; ?>
    <?php
}

function wwh_sanitize_cloudflare_deploy_hook_url($value): string
{
    return byline_sanitize_deployment_hook_url_setting($value);
}

function byline_sanitize_deployment_hook_url_setting($value): string
{
    if (!current_user_can('manage_options')) {
        return byline_deployment_hook_url();
    }

    if (isset($_POST['byline_deployment_hook_clear']) || isset($_POST['wwh_cloudflare_deploy_hook_clear'])) {
        return '';
    }

    if (!is_string($value)) {
        return byline_deployment_hook_url();
    }

    $value = trim($value);

    if ($value === '') {
        return byline_deployment_hook_url();
    }

    $url = byline_validate_deployment_hook_url($value);

    if ($url === '') {
        add_settings_error(
            BYLINE_DEPLOYMENT_HOOK_OPTION,
            'byline_deployment_hook_invalid',
            'Enter a valid HTTPS deploy hook URL.',
            'error'
        );

        return byline_deployment_hook_url();
    }

    return $url;
}

function wwh_render_cloudflare_deploy_hook_field(): void
{
    $has_url = wwh_cloudflare_deploy_hook_url() !== '';

    ?>
    <input
        type="password"
        id="<?php echo esc_attr(BYLINE_DEPLOYMENT_HOOK_OPTION); ?>"
        name="<?php echo esc_attr(BYLINE_DEPLOYMENT_HOOK_OPTION); ?>"
        value=""
        class="regular-text"
        autocomplete="new-password"
        placeholder="<?php echo esc_attr($has_url ? 'Saved. Enter a new URL to replace it.' : 'https://...'); ?>"
    >
    <p class="description">
        <?php echo esc_html($has_url ? 'A deploy hook URL is saved. Leave this blank to keep it unchanged.' : 'Paste a private HTTPS build hook from Cloudflare, Netlify, Vercel, GitHub Actions, or another provider.'); ?>
    </p>
    <?php if ($has_url) : ?>
        <label>
            <input type="checkbox" name="byline_deployment_hook_clear" value="1">
            Remove the saved deploy hook URL
        </label>
    <?php endif; ?>
    <?php
}

function wwh_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('Sorry, you are not allowed to manage these settings.', 'weekly-wildcat-headless'));
    }

    ?>
    <div class="wrap wwh-settings-page">
        <h1>Byline Legacy Integration Settings</h1>
        <form method="post" action="options.php">
            <?php
            settings_fields('wwh_settings');
            do_settings_sections('wwh-settings');
            submit_button('Save Settings');
            ?>
        </form>

        <h2>Deployment Status</h2>
        <table class="widefat striped" role="presentation">
            <tbody>
                <tr>
                    <th scope="row">Last trigger time</th>
                    <td><?php echo esc_html(wwh_cloudflare_deploy_last_trigger_time_label()); ?></td>
                </tr>
                <tr>
                    <th scope="row">Last response status</th>
                    <td><?php echo esc_html(wwh_cloudflare_deploy_last_status_label()); ?></td>
                </tr>
                <tr>
                    <th scope="row">Pending trigger</th>
                    <td><?php echo esc_html(wwh_cloudflare_deploy_pending_label()); ?></td>
                </tr>
            </tbody>
        </table>
        <?php do_action('wwh_settings_page_after'); ?>
    </div>
    <?php
}

/**
 * Compatibility endpoint for old bookmarked forms. New UI never submits the
 * registry as a collection, but old POSTs are reduced to one deliberate
 * create/update operation so they cannot reintroduce bulk browser state.
 */

function wwh_cloudflare_deploy_hook_url(): string
{
    return byline_deployment_hook_url();
}

function wwh_cloudflare_deploy_last_trigger_time_label(): string
{
    $timestamp = byline_deployment_last_triggered();

    if ($timestamp <= 0) {
        return 'Never';
    }

    return wp_date('M j, Y g:i A T', $timestamp, wp_timezone());
}

function wwh_cloudflare_deploy_last_status_label(): string
{
    $status = byline_deployment_last_status();

    return $status !== '' ? $status : 'Not triggered yet';
}

function wwh_cloudflare_deploy_pending_label(): string
{
    $timestamp = byline_deployment_pending_timestamp();

    if (!$timestamp) {
        return 'No';
    }

    return 'Scheduled for ' . wp_date('M j, Y g:i A T', (int) $timestamp, wp_timezone());
}

function wwh_sports_team_settings(): array
{
    $settings = get_option(WWH_SPORTS_TEAM_SETTINGS_OPTION, []);

    return is_array($settings) ? $settings : [];
}

function wwh_normalize_focal_coordinate($value): float
{
    if (!is_numeric($value)) {
        return 50.0;
    }

    return round(max(0.0, min(100.0, (float) $value)), 2);
}

function wwh_sports_team_setting(string $team_key, string $field): string
{
    $settings = wwh_sports_team_settings();
    $team_settings = is_array($settings[$team_key] ?? null) ? $settings[$team_key] : [];
    $value = $team_settings[$field] ?? '';

    return is_scalar($value) ? (string) $value : '';
}

function wwh_media_image(int $attachment_id, string $size = 'large'): array
{
    if ($attachment_id <= 0) {
        return [
            'id' => 0,
            'url' => '',
            'alt' => '',
            'width' => null,
            'height' => null,
        ];
    }

    $image = wp_get_attachment_image_src($attachment_id, $size);
    $full_image = wp_get_attachment_image_src($attachment_id, 'full');
    $source = is_array($image) && isset($image[0]) && is_scalar($image[0])
        ? $image
        : (is_array($full_image) && isset($full_image[0]) && is_scalar($full_image[0]) ? $full_image : []);

    if ($source === []) {
        return [
            'id' => 0,
            'url' => '',
            'alt' => '',
            'width' => null,
            'height' => null,
        ];
    }

    $alt = get_post_meta($attachment_id, '_wp_attachment_image_alt', true);

    return [
        'id' => $attachment_id,
        'url' => esc_url_raw((string) $source[0]),
        'alt' => is_scalar($alt) ? (string) $alt : '',
        'width' => isset($source[1]) ? absint($source[1]) : null,
        'height' => isset($source[2]) ? absint($source[2]) : null,
    ];
}

function wwh_sports_team_options(): array
{
    return byline_get_sports_teams();
}

/**
 * Bulk schedule and roster operations can replace or trash many records at
 * once, so authors must not be able to reach them with edit_posts alone.
 * Keep the Byline manager capability as an escape hatch for custom newsroom
 * roles that do not inherit the built-in WordPress editor role.
 */
function wwh_can_manage_bulk_sports_data(): bool
{
    return current_user_can('edit_others_posts')
        || (defined('BYLINE_MANAGE_CAPABILITY') && current_user_can(BYLINE_MANAGE_CAPABILITY));
}

function wwh_infer_sport_key(string $sport, string $level): string
{
    $sport = strtolower(trim($sport));
    $level = strtolower(trim($level));

    foreach (wwh_sports_team_options() as $key => $option) {
        if (strtolower($option['sport']) === $sport && strtolower($option['level']) === $level) {
            return $key;
        }
    }

    foreach (wwh_sports_team_options() as $key => $option) {
        if (strtolower($option['sport']) === $sport) {
            return $key;
        }
    }

    return '';
}

function wwh_register_post_types(): void
{
    register_post_type(
        WWH_SPORTS_GAME_POST_TYPE,
        [
            'labels' => [
                'name' => 'Sports Games',
                'singular_name' => 'Sports Game',
                'add_new_item' => 'Add New Sports Game',
                'edit_item' => 'Edit Sports Game',
                'new_item' => 'New Sports Game',
                'view_item' => 'View Sports Game',
                'search_items' => 'Search Sports Games',
                'not_found' => 'No games yet. Import a schedule or add a game.',
                'not_found_in_trash' => 'No games in the trash.',
                // The post type owns the top-level Sports menu, so the menu
                // name is the workflow and "all items" is the Games list.
                'menu_name' => 'Sports',
                'all_items' => 'Games',
            ],
            'public' => false,
            'show_ui' => false,
            'show_in_menu' => false,
            'capabilities' => byline_sports_archive_capabilities(),
            'map_meta_cap' => false,
            'show_in_rest' => false,
            'menu_icon' => 'dashicons-awards',
            'supports' => ['title'],
            'capability_type' => 'post',
        ]
    );

    register_post_type(
        WWH_SCHOOL_EVENT_POST_TYPE,
        [
            'labels' => [
                'name' => 'School Events',
                'singular_name' => 'School Event',
                'add_new_item' => 'Add New School Event',
                'edit_item' => 'Edit School Event',
                'new_item' => 'New School Event',
                'view_item' => 'View School Event',
                'search_items' => 'Search School Events',
                'not_found' => 'No school events yet. Add an event.',
                'not_found_in_trash' => 'No school events in the trash.',
                'menu_name' => 'Events',
                'all_items' => 'All Events',
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => byline_admin_feature_enabled('events'),
            'menu_position' => BYLINE_MENU_POSITION_EVENTS,
            'show_in_rest' => false,
            'menu_icon' => 'dashicons-calendar-alt',
            'supports' => ['title'],
            'capability_type' => 'post',
        ]
    );
}
add_action('init', 'wwh_register_post_types');

function wwh_register_post_meta(): void
{
    register_post_meta(
        'post',
        WWH_PRIMARY_GAME_META,
        [
            'single' => true,
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'show_in_rest' => true,
            'auth_callback' => static fn() => current_user_can('edit_posts'),
        ]
    );

    $sports_keys = [
        '_ww_sport_key',
        '_ww_sport',
        '_ww_level',
        '_ww_team_label',
        '_ww_opponent',
        '_ww_site',
        '_ww_location',
        '_ww_location_name',
        '_ww_location_address',
        '_ww_location_latitude',
        '_ww_location_longitude',
        '_ww_location_apple_maps_id',
        '_ww_start_datetime',
        '_ww_game_status',
        '_ww_wildcats_score',
        '_ww_opponent_score',
        '_ww_recap_url',
        '_ww_notes',
        '_ww_import_key',
        '_ww_import_season',
        '_ww_import_date',
        '_ww_import_time',
        '_ww_import_game_type',
    ];

    foreach ($sports_keys as $key) {
        register_post_meta(
            WWH_SPORTS_GAME_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }

    $event_keys = [
        '_ww_event_type',
        '_ww_event_start_datetime',
        '_ww_event_end_datetime',
        '_ww_event_all_day',
        '_ww_event_location',
        '_ww_event_description',
        '_ww_event_external_url',
        '_ww_event_status',
    ];

    foreach ($event_keys as $key) {
        register_post_meta(
            WWH_SCHOOL_EVENT_POST_TYPE,
            $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('edit_posts'),
            ]
        );
    }
}
add_action('init', 'wwh_register_post_meta');

function wwh_register_game_embed_block(): void
{
    register_block_type('weekly-wildcat/game-embed', [
        'api_version' => 2,
        'title' => 'Byline Game Embed',
        'category' => 'widgets',
        'icon' => 'awards',
        'description' => 'Historical sports game card.',
        'supports' => ['inserter' => false],
        'render_callback' => 'wwh_render_game_embed_block',
        'attributes' => [
            // The block stores only the existing Sports Game ID; all display data is looked up when rendered.
            'gameId' => [
                'type' => 'integer',
                'default' => 0,
            ],
            'display' => [
                'type' => 'string',
                'default' => 'full',
            ],
        ],
    ]);
}
add_action('init', 'wwh_register_game_embed_block');

function wwh_cloudflare_deploy_post_types(): array
{
    $post_types = ['post', 'page', WWH_SPORTS_GAME_POST_TYPE, WWH_SCHOOL_EVENT_POST_TYPE];

    foreach (get_post_types(['public' => true], 'names') as $post_type) {
        if ($post_type !== 'attachment') {
            $post_types[] = $post_type;
        }
    }

    $post_types = array_values(array_unique($post_types));

    $post_types = apply_filters('byline_deployment_post_types', $post_types);
    return apply_filters('wwh_cloudflare_deploy_post_types', $post_types);
}

function wwh_is_cloudflare_deploy_content_post(WP_Post $post): bool
{
    if ($post->post_type === 'attachment') {
        return false;
    }

    if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) {
        return false;
    }

    return in_array($post->post_type, wwh_cloudflare_deploy_post_types(), true);
}

function wwh_maybe_schedule_cloudflare_deploy_for_transition(string $new_status, string $old_status, WP_Post $post): void
{
    if (!wwh_is_cloudflare_deploy_content_post($post)) {
        return;
    }

    if ($new_status === 'publish' && $old_status !== 'publish') {
        wwh_schedule_cloudflare_deploy();
        return;
    }

    if ($new_status === 'publish' && $old_status === 'publish') {
        wwh_schedule_cloudflare_deploy();
        return;
    }

    if ($old_status === 'publish' && $new_status !== 'publish') {
        wwh_schedule_cloudflare_deploy();
    }
}
// Public mutation hooks are centralized in publication/public-revisions.php.

function wwh_maybe_schedule_cloudflare_deploy_for_delete(int $post_id): void
{
    $post = get_post($post_id);

    if (!$post instanceof WP_Post || $post->post_status !== 'publish' || !wwh_is_cloudflare_deploy_content_post($post)) {
        return;
    }

    wwh_schedule_cloudflare_deploy();
}
// Public deletion is tracked by the canonical revision hooks.

function wwh_schedule_cloudflare_deploy(): void
{
    byline_schedule_deployment('legacy-alias');
}

function wwh_trigger_cloudflare_deploy(): void
{
    byline_trigger_deployment('legacy-event');
}
add_action(WWH_CLOUDFLARE_DEPLOY_EVENT, 'wwh_trigger_cloudflare_deploy');

function wwh_clear_scheduled_cloudflare_deploy(): void
{
    wp_clear_scheduled_hook(WWH_CLOUDFLARE_DEPLOY_EVENT);
    byline_clear_scheduled_deployment();
}

function wwh_school_event_admin_columns(array $columns): array
{
    return [
        'cb' => $columns['cb'] ?? '<input type="checkbox">',
        'title' => 'Event',
        'wwh_event_type' => 'Type',
        'wwh_event_start' => 'Start',
        'wwh_event_end' => 'End',
        'wwh_event_location' => 'Location',
        'wwh_event_status' => 'Status',
    ];
}
add_filter('manage_' . WWH_SCHOOL_EVENT_POST_TYPE . '_posts_columns', 'wwh_school_event_admin_columns');

function wwh_render_admin_column(string $column, int $post_id): void
{
    if (get_post_type($post_id) === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_column($column, $post_id);
    }
}
add_action('manage_' . WWH_SCHOOL_EVENT_POST_TYPE . '_posts_custom_column', 'wwh_render_admin_column', 10, 2);

function wwh_render_school_event_admin_column(string $column, int $post_id): void
{
    if ($column === 'wwh_event_type') {
        echo esc_html(wwh_meta_value($post_id, '_ww_event_type', '—'));
        return;
    }

    if ($column === 'wwh_event_start') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_event_start_datetime')));
        return;
    }

    if ($column === 'wwh_event_end') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_event_end_datetime')));
        return;
    }

    if ($column === 'wwh_event_location') {
        echo esc_html(wwh_meta_value($post_id, '_ww_event_location', '—'));
        return;
    }

    if ($column === 'wwh_event_status') {
        echo esc_html(wwh_label_from_value(wwh_meta_value($post_id, '_ww_event_status', 'scheduled')));
    }
}

function wwh_admin_datetime_label(string $value): string
{
    return $value !== '' ? wwh_format_date_text($value) : 'Unknown';
}

function wwh_sortable_admin_columns(array $columns): array
{
    $screen = get_current_screen();

    if ($screen && $screen->post_type === WWH_SPORTS_GAME_POST_TYPE) {
        $columns['wwh_sport'] = 'wwh_sport';
        $columns['wwh_opponent'] = 'wwh_opponent';
        $columns['wwh_start'] = 'wwh_start';
        $columns['wwh_season'] = 'wwh_season';
        $columns['wwh_status'] = 'wwh_status';
    }

    if ($screen && $screen->post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        $columns['wwh_event_type'] = 'wwh_event_type';
        $columns['wwh_event_start'] = 'wwh_event_start';
        $columns['wwh_event_status'] = 'wwh_event_status';
    }

    return $columns;
}
add_filter('manage_edit-' . WWH_SCHOOL_EVENT_POST_TYPE . '_sortable_columns', 'wwh_sortable_admin_columns');

function wwh_admin_filter_value(string $key): string
{
    if (!isset($_GET[$key])) {
        return '';
    }

    return sanitize_text_field(wp_unslash($_GET[$key]));
}

function wwh_render_admin_filters(string $post_type): void
{
    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_filters();
    }
}
add_action('restrict_manage_posts', 'wwh_render_admin_filters');

function wwh_render_school_event_admin_filters(): void
{
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_status'), ['scheduled', 'canceled'], '');
    $event_type = wwh_admin_filter_value('wwh_event_type');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_date_state'), ['known', 'unknown'], '');
    $event_type_options = [];

    foreach (wwh_distinct_meta_values(WWH_SCHOOL_EVENT_POST_TYPE, '_ww_event_type') as $value) {
        $event_type_options[$value] = $value;
    }

    wwh_admin_filter_select('wwh_event_status', $status, 'All statuses', [
        'scheduled' => 'Scheduled',
        'canceled' => 'Canceled',
    ]);
    wwh_admin_filter_select('wwh_event_type', $event_type, 'All event types', $event_type_options);
    wwh_admin_filter_select('wwh_event_date_state', $date_state, 'Any date/time', [
        'known' => 'Known date/time',
        'unknown' => 'Unknown date/time',
    ]);
}

function wwh_admin_filter_select(string $name, string $value, string $all_label, array $options): void
{
    printf('<select name="%s">', esc_attr($name));
    printf('<option value="">%s</option>', esc_html($all_label));

    foreach ($options as $option_value => $option_label) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr((string) $option_value),
            selected($value, (string) $option_value, false),
            esc_html((string) $option_label)
        );
    }

    echo '</select>';
}

function wwh_distinct_meta_values(string $post_type, string $meta_key): array
{
    global $wpdb;

    $values = $wpdb->get_col(
        $wpdb->prepare(
            "SELECT DISTINCT pm.meta_value
            FROM {$wpdb->postmeta} pm
            INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
            WHERE p.post_type = %s
                AND pm.meta_key = %s
                AND pm.meta_value != ''
            ORDER BY pm.meta_value ASC",
            $post_type,
            $meta_key
        )
    );

    return array_values(array_filter(array_map('sanitize_text_field', $values ?: [])));
}

function wwh_filter_admin_posts(WP_Query $query): void
{
    global $pagenow;

    if (!is_admin() || $pagenow !== 'edit.php' || !$query->is_main_query()) {
        return;
    }

    $post_type = $query->get('post_type');

    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_filter_school_event_admin_posts($query);
    }
}
add_action('pre_get_posts', 'wwh_filter_admin_posts');

function wwh_filter_school_event_admin_posts(WP_Query $query): void
{
    $meta_query = wwh_admin_meta_query($query);
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_status'), ['scheduled', 'canceled'], '');
    $event_type = wwh_admin_filter_value('wwh_event_type');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_event_date_state'), ['known', 'unknown'], '');

    if ($status !== '') {
        $meta_query[] = ['key' => '_ww_event_status', 'value' => $status];
    }

    if ($event_type !== '') {
        $meta_query[] = ['key' => '_ww_event_type', 'value' => $event_type];
    }

    wwh_add_date_state_meta_query($meta_query, '_ww_event_start_datetime', $date_state);
    wwh_apply_admin_meta_query($query, $meta_query);

    $orderby = (string) $query->get('orderby');

    if ($orderby === 'wwh_event_type') {
        wwh_set_admin_meta_sort($query, '_ww_event_type', 'meta_value');
    } elseif ($orderby === 'wwh_event_start') {
        wwh_set_admin_meta_sort($query, '_ww_event_start_datetime', 'meta_value');
    } elseif ($orderby === 'wwh_event_status') {
        wwh_set_admin_meta_sort($query, '_ww_event_status', 'meta_value');
    }
}

function wwh_admin_meta_query(WP_Query $query): array
{
    $meta_query = $query->get('meta_query');

    return is_array($meta_query) ? $meta_query : [];
}

function wwh_apply_admin_meta_query(WP_Query $query, array $meta_query): void
{
    if ($meta_query !== []) {
        $query->set('meta_query', $meta_query);
    }
}

function wwh_add_date_state_meta_query(array &$meta_query, string $meta_key, string $date_state): void
{
    if ($date_state === 'known') {
        $meta_query[] = [
            'key' => $meta_key,
            'value' => '',
            'compare' => '!=',
        ];
        return;
    }

    if ($date_state === 'unknown') {
        $meta_query[] = [
            'relation' => 'OR',
            [
                'key' => $meta_key,
                'compare' => 'NOT EXISTS',
            ],
            [
                'key' => $meta_key,
                'value' => '',
                'compare' => '=',
            ],
        ];
    }
}

function wwh_set_admin_meta_sort(WP_Query $query, string $meta_key, string $orderby): void
{
    $query->set('meta_key', $meta_key);
    $query->set('orderby', $orderby);
}

function wwh_register_attachment_meta(): void
{
    foreach (array_keys(wwh_image_credit_fields()) as $key) {
        register_post_meta(
            'attachment',
            '_ww_image_' . $key,
            [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'auth_callback' => static fn() => current_user_can('upload_files'),
            ]
        );
    }
}
add_action('init', 'wwh_register_attachment_meta');

function wwh_add_meta_boxes(): void
{
    add_meta_box(
        'wwh_school_event_details',
        'Event Details',
        'wwh_render_school_event_meta_box',
        WWH_SCHOOL_EVENT_POST_TYPE,
        'normal',
        'high'
    );
}
add_action('add_meta_boxes', 'wwh_add_meta_boxes');

function wwh_meta_value(int $post_id, string $key, string $default = ''): string
{
    $value = get_post_meta($post_id, $key, true);

    return is_string($value) && $value !== '' ? $value : $default;
}

function wwh_field(string $label, string $name, string $value, string $type = 'text', array $attributes = []): void
{
    $attribute_html = '';

    foreach ($attributes as $key => $attribute_value) {
        $attribute_html .= sprintf(' %s="%s"', esc_attr($key), esc_attr((string) $attribute_value));
    }

    printf(
        '<p class="wwh-field"><label><span>%s</span><input type="%s" name="%s" value="%s"%s></label></p>',
        esc_html($label),
        esc_attr($type),
        esc_attr($name),
        esc_attr($value),
        $attribute_html
    );
}

function wwh_textarea(string $label, string $name, string $value): void
{
    printf(
        '<p class="wwh-field"><label><span>%s</span><textarea name="%s" rows="4">%s</textarea></label></p>',
        esc_html($label),
        esc_attr($name),
        esc_textarea($value)
    );
}

function wwh_select(string $label, string $name, string $value, array $options): void
{
    printf('<p class="wwh-field"><label><span>%s</span><select name="%s">', esc_html($label), esc_attr($name));

    foreach ($options as $option_value => $option_label) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr((string) $option_value),
            selected($value, (string) $option_value, false),
            esc_html((string) $option_label)
        );
    }

    echo '</select></label></p>';
}

function wwh_render_school_event_meta_box(WP_Post $post): void
{
    wp_nonce_field('wwh_save_school_event', 'wwh_school_event_nonce');

    echo '<div class="wwh-fields">';
    wwh_field('Event Type', 'ww_event_type', wwh_meta_value($post->ID, '_ww_event_type'), 'text', ['placeholder' => 'Academic']);
    wwh_field('Start Date / Time', 'ww_event_start_datetime', wwh_meta_value($post->ID, '_ww_event_start_datetime'), 'datetime-local');
    wwh_field('End Date / Time', 'ww_event_end_datetime', wwh_meta_value($post->ID, '_ww_event_end_datetime'), 'datetime-local');
    printf(
        '<p class="wwh-field wwh-checkbox"><label><input type="checkbox" name="ww_event_all_day" value="1"%s> <span>All-day event</span></label></p>',
        checked(wwh_meta_value($post->ID, '_ww_event_all_day'), '1', false)
    );
    wwh_field('Location', 'ww_event_location', wwh_meta_value($post->ID, '_ww_event_location'));
    wwh_textarea('Description', 'ww_event_description', wwh_meta_value($post->ID, '_ww_event_description'));
    wwh_field('External URL', 'ww_event_external_url', wwh_meta_value($post->ID, '_ww_event_external_url'), 'url');
    wwh_select('Status', 'ww_event_status', wwh_meta_value($post->ID, '_ww_event_status', 'scheduled'), [
        'scheduled' => 'Scheduled',
        'canceled' => 'Canceled',
    ]);
    echo '</div>';
}

function wwh_can_save_post(int $post_id, string $nonce_name, string $nonce_action): bool
{
    if (!isset($_POST[$nonce_name]) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST[$nonce_name])), $nonce_action)) {
        return false;
    }

    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
        return false;
    }

    return current_user_can('edit_post', $post_id);
}

function wwh_request_value(string $key): string
{
    if (!isset($_POST[$key])) {
        return '';
    }

    return sanitize_text_field(wp_unslash($_POST[$key]));
}

function wwh_request_textarea(string $key): string
{
    if (!isset($_POST[$key])) {
        return '';
    }

    return sanitize_textarea_field(wp_unslash($_POST[$key]));
}

function wwh_sanitize_choice(string $value, array $allowed, string $default): string
{
    return in_array($value, $allowed, true) ? $value : $default;
}

function wwh_sanitize_datetime(string $value): string
{
    $value = str_replace(' ', 'T', sanitize_text_field($value));

    if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $value) === 1) {
        return $value;
    }

    return '';
}

function wwh_sanitize_sport_key(string $value): string
{
    return array_key_exists($value, wwh_sports_team_options()) ? $value : '';
}

function wwh_sanitize_coordinate(string $value, float $min, float $max): string
{
    $value = trim(sanitize_text_field($value));

    if ($value === '' || !is_numeric($value)) {
        return '';
    }

    $coordinate = (float) $value;

    if ($coordinate < $min || $coordinate > $max) {
        return '';
    }

    return rtrim(rtrim(sprintf('%.7F', $coordinate), '0'), '.');
}

function wwh_update_meta(int $post_id, string $key, string $value): void
{
    if ($value === '') {
        delete_post_meta($post_id, $key);
        return;
    }

    update_post_meta($post_id, $key, $value);
}

function wwh_image_meta_value(int $attachment_id, string $key): string
{
    $value = get_post_meta($attachment_id, '_ww_image_' . $key, true);

    return is_string($value) ? $value : '';
}

function wwh_attachment_fields_to_edit(array $form_fields, WP_Post $post): array
{
    foreach (wwh_image_credit_fields() as $key => $label) {
        $is_url = wwh_string_ends_with($key, '_url');
        $help = '';

        if ($key === 'credit_text') {
            $help = sprintf('Example: Photographer for %s. This appears over the image on the public site.', byline_get_publication_config()['identity']['shortName']);
        } elseif (in_array($key, ['copyright_notice', 'license_url', 'acquire_license_url'], true)) {
            $help = 'Leave blank to use the publication-wide image license default.';
        }

        $form_fields['ww_image_' . $key] = [
            'label' => $label,
            'input' => 'html',
            'html' => sprintf(
                '<input type="%s" class="text" name="attachments[%d][ww_image_%s]" value="%s">%s',
                $is_url ? 'url' : 'text',
                $post->ID,
                esc_attr($key),
                esc_attr(wwh_image_meta_value($post->ID, $key)),
                $help !== '' ? sprintf('<p class="help">%s</p>', esc_html($help)) : ''
            ),
            'helps' => $key === 'creator' ? 'Usually the photographer or organization that created the image.' : '',
        ];
    }

    return $form_fields;
}
add_filter('attachment_fields_to_edit', 'wwh_attachment_fields_to_edit', 10, 2);

function wwh_attachment_fields_to_save(array $post, array $attachment): array
{
    if (!isset($post['ID'])) {
        return $post;
    }

    $attachment_id = absint($post['ID']);

    foreach (wwh_image_credit_fields() as $key => $_label) {
        $field = 'ww_image_' . $key;
        $value = isset($attachment[$field]) ? (string) $attachment[$field] : '';
        $value = wwh_string_ends_with($key, '_url') ? esc_url_raw($value) : sanitize_text_field($value);
        wwh_update_meta($attachment_id, '_ww_image_' . $key, $value);
    }

    return $post;
}
add_filter('attachment_fields_to_save', 'wwh_attachment_fields_to_save', 10, 2);

function wwh_update_score_meta(int $post_id, string $key, string $value): void
{
    if ($value === '') {
        delete_post_meta($post_id, $key);
        return;
    }

    update_post_meta($post_id, $key, (string) max(0, absint($value)));
}

function wwh_save_school_event(int $post_id): void
{
    if (!wwh_can_save_post($post_id, 'wwh_school_event_nonce', 'wwh_save_school_event')) {
        return;
    }

    wwh_update_meta($post_id, '_ww_event_type', wwh_request_value('ww_event_type'));
    wwh_update_meta($post_id, '_ww_event_start_datetime', wwh_sanitize_datetime(wwh_request_value('ww_event_start_datetime')));
    wwh_update_meta($post_id, '_ww_event_end_datetime', wwh_sanitize_datetime(wwh_request_value('ww_event_end_datetime')));
    wwh_update_meta($post_id, '_ww_event_all_day', isset($_POST['ww_event_all_day']) ? '1' : '0');
    wwh_update_meta($post_id, '_ww_event_location', wwh_request_value('ww_event_location'));
    wwh_update_meta($post_id, '_ww_event_description', wwh_request_textarea('ww_event_description'));
    wwh_update_meta($post_id, '_ww_event_external_url', esc_url_raw(wwh_request_value('ww_event_external_url')));
    wwh_update_meta($post_id, '_ww_event_status', wwh_sanitize_choice(wwh_request_value('ww_event_status'), ['scheduled', 'canceled'], 'scheduled'));
}
add_action('save_post_' . WWH_SCHOOL_EVENT_POST_TYPE, 'wwh_save_school_event');

/**
 * Validate and classify an import without creating or updating any posts.
 * The returned preview is intentionally made from the same preparer used by
 * the commit path, so a confirmation cannot silently change the result.
 */

function wwh_author_meta_value(int $user_id, string $key, string $default = ''): string
{
    $value = get_user_meta($user_id, $key, true);

    return is_string($value) && $value !== '' ? $value : $default;
}

function wwh_author_profile_photo(int $attachment_id): array
{
    return wwh_media_image($attachment_id);
}

function wwh_author_avatar_data(array $args, $id_or_email): array
{
    if (!empty($args['force_default'])) {
        return $args;
    }

    $user = null;
    if ($id_or_email instanceof WP_User) {
        $user = $id_or_email;
    } elseif ($id_or_email instanceof WP_Comment) {
        $user = $id_or_email->user_id > 0
            ? get_user_by('id', $id_or_email->user_id)
            : get_user_by('email', $id_or_email->comment_author_email);
    } elseif ($id_or_email instanceof WP_Post) {
        $user = get_user_by('id', $id_or_email->post_author);
    } elseif (is_numeric($id_or_email)) {
        $user = get_user_by('id', absint($id_or_email));
    } elseif (is_string($id_or_email) && is_email($id_or_email)) {
        $user = get_user_by('email', $id_or_email);
    }

    if (!$user instanceof WP_User) {
        return $args;
    }

    $photo_id = absint(get_user_meta($user->ID, '_ww_author_photo_id', true));
    if ($photo_id <= 0) {
        return $args;
    }

    $size = max(1, absint($args['size'] ?? 96));
    $photo_url = wp_get_attachment_image_url($photo_id, [$size, $size]);
    if (!is_string($photo_url) || $photo_url === '') {
        return $args;
    }

    $args['url'] = $photo_url;
    $args['found_avatar'] = true;
    return $args;
}
add_filter('get_avatar_data', 'wwh_author_avatar_data', 10, 2);

function wwh_render_author_profile_fields(WP_User $user): void
{
    $photo_id = absint(get_user_meta($user->ID, '_ww_author_photo_id', true));
    $photo = wwh_author_profile_photo($photo_id);
    $social_fields = wwh_author_social_fields();
    $social_placeholders = [
        'website' => 'https://example.com',
        'email' => 'name@example.com',
        'instagram' => '@username',
        'tiktok' => '@username',
        'linkedin' => 'https://www.linkedin.com/in/username',
        'x' => '@username',
    ];
    $social_help = [
        'website' => 'Paste your website URL.',
        'email' => 'Public contact email, shown on your author page.',
        'instagram' => 'Enter @username or paste a profile URL.',
        'tiktok' => 'Enter @username or paste a profile URL.',
        'linkedin' => 'Paste your LinkedIn profile URL.',
        'x' => 'Enter @username or paste a profile URL.',
    ];
    $has_social_links = false;

    foreach (array_keys($social_fields) as $key) {
        if (wwh_author_meta_value($user->ID, '_ww_author_social_' . $key) !== '') {
            $has_social_links = true;
            break;
        }
    }

    ?>
    <section class="wwh-author-profile-editor" aria-labelledby="wwh-author-profile-heading">
        <div class="wwh-author-profile-heading">
            <div>
                <h2 id="wwh-author-profile-heading"><?php echo esc_html(byline_get_publication_config()['identity']['shortName']); ?> profile</h2>
                <p>Controls the public information shown on your author page and alongside your stories.</p>
            </div>
            <label class="wwh-author-visibility">
                <input type="checkbox" name="ww_author_show_in_directory" value="1" <?php checked(wwh_author_visible_in_directory($user->ID)); ?>>
                <span>Show in staff directory</span>
            </label>
        </div>

        <div class="wwh-author-profile-card">
            <div class="wwh-author-photo-field">
                <span class="wwh-author-field-label">Profile photo</span>
                <input type="hidden" id="ww_author_photo_id" name="ww_author_photo_id" value="<?php echo esc_attr((string) $photo_id); ?>">
                <img class="wwh-author-photo-preview" src="<?php echo esc_url($photo['url']); ?>" alt="" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>
                <div class="wwh-author-photo-actions">
                    <button type="button" class="button button-secondary wwh-author-photo-select"><?php echo $photo['url'] === '' ? 'Choose photo' : 'Change photo'; ?></button>
                    <button type="button" class="button-link-delete wwh-author-photo-remove" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>Remove</button>
                </div>
                <p class="description">Use a clear headshot. This replaces your WordPress avatar on the publication.</p>
            </div>

            <div class="wwh-author-profile-fields">
                <div class="wwh-author-field">
                    <label for="ww_author_role">Role</label>
                    <input type="text" class="regular-text" id="ww_author_role" name="ww_author_role" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_role')); ?>" placeholder="Editor-in-chief">
                </div>

                <div class="wwh-author-field">
                    <label for="ww_author_pronouns">Pronouns <span class="wwh-author-optional">Optional</span></label>
                    <input type="text" class="regular-text" id="ww_author_pronouns" name="ww_author_pronouns" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_pronouns')); ?>" placeholder="they/them">
                </div>

                <div class="wwh-author-field wwh-author-field-wide">
                    <label for="ww_author_short_bio">Short bio</label>
                    <textarea class="large-text" rows="3" id="ww_author_short_bio" name="ww_author_short_bio" aria-describedby="ww-author-short-bio-help"><?php echo esc_textarea(wwh_author_meta_value($user->ID, '_ww_author_short_bio')); ?></textarea>
                    <p class="description" id="ww-author-short-bio-help">One or two sentences shown at the end of stories and near the top of your author page.</p>
                </div>
            </div>
        </div>

        <p class="wwh-author-long-bio-note"><strong>Full bio:</strong> use the <a href="#description">Biographical Info</a> field above. It appears in the About section of your author page.</p>

        <details class="wwh-author-socials" <?php echo $has_social_links ? 'open' : ''; ?>>
            <summary>
                <span>Contact &amp; social links</span>
                <span class="wwh-author-optional">Optional</span>
            </summary>
            <div class="wwh-author-social-grid">
                <?php foreach ($social_fields as $key => $label) : ?>
                    <div class="wwh-author-field">
                        <label for="ww_author_social_<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label>
                        <input
                            type="<?php echo $key === 'email' ? 'email' : 'text'; ?>"
                            class="regular-text"
                            id="ww_author_social_<?php echo esc_attr($key); ?>"
                            name="ww_author_social_<?php echo esc_attr($key); ?>"
                            value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_social_' . $key)); ?>"
                            placeholder="<?php echo esc_attr($social_placeholders[$key]); ?>"
                            aria-describedby="ww_author_social_help_<?php echo esc_attr($key); ?>"
                        >
                        <p class="description wwh-author-social-help" id="ww_author_social_help_<?php echo esc_attr($key); ?>"><?php echo esc_html($social_help[$key]); ?></p>
                    </div>
                <?php endforeach; ?>
            </div>
        </details>
    </section>
    <?php
}
add_action('show_user_profile', 'wwh_render_author_profile_fields');
add_action('edit_user_profile', 'wwh_render_author_profile_fields');

function wwh_save_author_profile_fields(int $user_id): void
{
    if (!current_user_can('edit_user', $user_id)) {
        return;
    }

    wwh_update_user_meta($user_id, '_ww_author_role', wwh_request_value('ww_author_role'));
    wwh_update_user_meta($user_id, '_ww_author_short_bio', wwh_request_textarea('ww_author_short_bio'));
    wwh_update_user_meta($user_id, '_ww_author_pronouns', wwh_request_value('ww_author_pronouns'));
    update_user_meta($user_id, '_ww_author_show_in_directory', isset($_POST['ww_author_show_in_directory']) ? '1' : '0');

    $photo_id = isset($_POST['ww_author_photo_id']) ? absint($_POST['ww_author_photo_id']) : 0;
    wwh_update_user_meta($user_id, '_ww_author_photo_id', $photo_id > 0 ? (string) $photo_id : '');

    foreach (wwh_author_social_fields() as $key => $_label) {
        $field = 'ww_author_social_' . $key;
        $value = $key === 'email'
            ? sanitize_email(wwh_request_value($field))
            : wwh_normalize_author_social_link($key, wwh_request_value($field));
        wwh_update_user_meta($user_id, '_ww_author_social_' . $key, $value);
    }
}
add_action('personal_options_update', 'wwh_save_author_profile_fields');
add_action('edit_user_profile_update', 'wwh_save_author_profile_fields');

function wwh_author_visible_in_directory(int $user_id): bool
{
    return get_user_meta($user_id, '_ww_author_show_in_directory', true) !== '0';
}

function wwh_update_user_meta(int $user_id, string $key, string $value): void
{
    if ($value === '') {
        delete_user_meta($user_id, $key);
        return;
    }

    update_user_meta($user_id, $key, $value);
}

function wwh_enqueue_author_profile_assets(string $hook): void
{
    if (!in_array($hook, ['profile.php', 'user-edit.php'], true)) {
        return;
    }

    wp_enqueue_media();
    wp_add_inline_script('jquery-core', <<<'JS'
document.addEventListener('click', function (event) {
    var select = event.target.closest('.wwh-author-photo-select');
    var remove = event.target.closest('.wwh-author-photo-remove');
    if (select) {
        event.preventDefault();
        var wrap = select.closest('.wwh-author-photo-field');
        var frame = wp.media({ title: 'Select author profile photo', button: { text: 'Use this photo' }, multiple: false });
        frame.on('select', function () {
            var attachment = frame.state().get('selection').first().toJSON();
            wrap.querySelector('#ww_author_photo_id').value = attachment.id;
            var preview = wrap.querySelector('.wwh-author-photo-preview');
            preview.src = attachment.sizes && attachment.sizes.medium ? attachment.sizes.medium.url : attachment.url;
            preview.hidden = false;
            wrap.querySelector('.wwh-author-photo-remove').hidden = false;
        });
        frame.open();
    }
    if (remove) {
        event.preventDefault();
        var wrap = remove.closest('.wwh-author-photo-field');
        wrap.querySelector('#ww_author_photo_id').value = '';
        var preview = wrap.querySelector('.wwh-author-photo-preview');
        preview.removeAttribute('src');
        preview.hidden = true;
        remove.hidden = true;
    }
});
JS
    );
}
add_action('admin_enqueue_scripts', 'wwh_enqueue_author_profile_assets');

function wwh_admin_styles(): void
{
    $screen = get_current_screen();
    if (!$screen || (!in_array($screen->post_type, ['post', WWH_SCHOOL_EVENT_POST_TYPE], true) && !in_array($screen->id, ['profile', 'user-edit'], true))) {
        return;
    }

    echo '<style>
        .wwh-fields { display: grid; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .wwh-field { margin: 0; }
        .wwh-field label, .wwh-field span { display: block; }
        .wwh-field span { font-weight: 600; margin-bottom: 5px; }
        .wwh-field input:not([type="checkbox"]), .wwh-field select, .wwh-field textarea { max-width: 100%; width: 100%; }
        .wwh-field textarea, .wwh-checkbox { grid-column: 1 / -1; }
        .wwh-checkbox label, .wwh-checkbox span { display: inline; }
        @media (max-width: 782px) { .wwh-fields { grid-template-columns: 1fr; } }
        .wwh-author-profile-editor { margin: 32px 0 24px; max-width: 920px; }
        .wwh-author-profile-heading { align-items: end; display: flex; gap: 24px; justify-content: space-between; margin-bottom: 12px; }
        .wwh-author-profile-heading h2 { margin: 0 0 4px; }
        .wwh-author-profile-heading p { color: #646970; margin: 0; max-width: 620px; }
        .wwh-author-visibility { align-items: center; display: inline-flex; flex: 0 0 auto; font-weight: 600; gap: 6px; padding-bottom: 2px; }
        .wwh-author-profile-card { background: #fff; border: 1px solid #c3c4c7; display: grid; gap: 24px; grid-template-columns: 160px minmax(0, 1fr); padding: 20px; }
        .wwh-author-photo-field { min-width: 0; }
        .wwh-author-field-label, .wwh-author-field > label { display: block; font-weight: 600; margin-bottom: 6px; }
        .wwh-author-photo-preview { background: #f0f0f1; border-radius: 50%; display: block; height: 112px; margin: 0 0 10px; object-fit: cover; width: 112px; }
        .wwh-author-photo-actions { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
        .wwh-author-photo-field .description { margin: 10px 0 0; }
        .wwh-author-profile-fields, .wwh-author-social-grid { display: grid; gap: 16px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .wwh-author-field { min-width: 0; }
        .wwh-author-field-wide { grid-column: 1 / -1; }
        .wwh-author-field input:not([type="checkbox"]), .wwh-author-field textarea { box-sizing: border-box; max-width: none; width: 100%; }
        .wwh-author-field textarea { min-height: 88px; resize: vertical; }
        .wwh-author-optional { color: #8c8f94; font-size: 12px; font-weight: 400; }
        .wwh-author-long-bio-note { color: #646970; margin: 10px 0 0; }
        .wwh-author-socials { background: #fff; border: 1px solid #c3c4c7; margin-top: 18px; }
        .wwh-author-socials summary { align-items: center; cursor: pointer; display: flex; font-weight: 600; gap: 8px; justify-content: space-between; padding: 14px 16px; }
        .wwh-author-socials[open] summary { border-bottom: 1px solid #dcdcde; }
        .wwh-author-social-grid { padding: 18px 16px 20px; }
        .wwh-author-social-help { color: #646970; font-size: 12px; line-height: 1.4; margin: 6px 0 0; }
        .byline-notification-settings { margin: 32px 0 24px; max-width: 920px; }
        .byline-notification-heading { margin-bottom: 12px; }
        .byline-notification-heading h2 { margin: 0 0 4px; }
        .byline-notification-heading p { color: #646970; margin: 0; max-width: 620px; }
        .byline-notification-grid { border: 0; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; padding: 0; }
        .byline-notification-option { align-items: center; background: #fff; border: 1px solid #c3c4c7; box-sizing: border-box; cursor: pointer; display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr) auto; min-height: 78px; padding: 15px 16px; }
        .byline-notification-option:hover { border-color: #8c8f94; }
        .byline-notification-copy { min-width: 0; }
        .byline-notification-title { display: block; font-weight: 600; line-height: 1.35; margin-bottom: 3px; }
        .byline-notification-description { color: #646970; display: block; font-size: 13px; line-height: 1.4; }
        .byline-notification-input { height: 1px; opacity: 0; overflow: hidden; position: absolute; width: 1px; }
        .byline-notification-switch { background: #8c8f94; border-radius: 999px; box-sizing: border-box; display: block; height: 22px; position: relative; transition: background-color 120ms ease; width: 40px; }
        .byline-notification-switch::before { background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgba(0, 0, 0, .2); content: ""; height: 18px; left: 2px; position: absolute; top: 2px; transition: transform 120ms ease; width: 18px; }
        .byline-notification-input:checked + .byline-notification-switch { background: #2271b1; }
        .byline-notification-input:checked + .byline-notification-switch::before { transform: translateX(18px); }
        .byline-notification-input:focus-visible + .byline-notification-switch { outline: 2px solid #2271b1; outline-offset: 2px; }
        .byline-notification-footnote { color: #646970; font-size: 12px; margin: 10px 0 0; }
        body.profile-php .user-profile-picture, body.user-edit-php .user-profile-picture { display: none; }
        @media (max-width: 782px) {
            .wwh-author-profile-heading { align-items: start; flex-direction: column; gap: 10px; }
            .wwh-author-profile-card { grid-template-columns: 1fr; }
            .wwh-author-photo-field { display: grid; grid-template-columns: 112px minmax(0, 1fr); column-gap: 14px; }
            .wwh-author-photo-field .wwh-author-field-label { grid-column: 1 / -1; }
            .wwh-author-photo-actions, .wwh-author-photo-field .description { align-self: start; }
            .wwh-author-profile-fields, .wwh-author-social-grid, .byline-notification-grid { grid-template-columns: 1fr; }
            .wwh-author-field-wide { grid-column: auto; }
        }
    </style>';
}
add_action('admin_head', 'wwh_admin_styles');

function wwh_register_rest_routes(): void
{
    register_rest_route(WWH_REST_NAMESPACE, '/sports-games', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/search', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_search_sports_games',
        'permission_callback' => static fn() => current_user_can('edit_posts'),
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_game',
        'permission_callback' => '__return_true',
        'args' => [
            'id' => [
                'type' => 'integer',
                'required' => true,
                'sanitize_callback' => 'absint',
            ],
        ],
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/facets', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_game_facets',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/upcoming', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_upcoming_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-games/recent', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_recent_sports_games',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/sports-teams', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_teams',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/sports/teams/(?P<teamKey>[a-z0-9_-]+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_team_context',
        'permission_callback' => '__return_true',
        'args' => [
            'teamKey' => ['type' => 'string', 'required' => true, 'sanitize_callback' => 'sanitize_key'],
            'season' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
        ],
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/sports/teams/(?P<teamKey>[a-z0-9_-]+)/context', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_team_context',
        'permission_callback' => '__return_true',
        'args' => [
            'teamKey' => ['type' => 'string', 'required' => true, 'sanitize_callback' => 'sanitize_key'],
            'season' => ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field'],
        ],
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/school-events', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_school_events',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(WWH_REST_NAMESPACE, '/authors', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_authors',
        'permission_callback' => '__return_true',
    ]);

    // Canonical Byline aliases; legacy routes remain registered above for existing consumers.
    foreach ([
        '/sports/games' => 'wwh_rest_sports_games',
        '/sports/games/facets' => 'wwh_rest_sports_game_facets',
        '/sports/games/upcoming' => 'wwh_rest_upcoming_sports_games',
        '/sports/games/recent' => 'wwh_rest_recent_sports_games',
        '/events' => 'wwh_rest_school_events',
        '/authors' => 'wwh_rest_authors',
    ] as $route => $callback) {
        register_rest_route(BYLINE_REST_NAMESPACE, $route, [
            'methods' => WP_REST_Server::READABLE,
            'callback' => $callback,
            'permission_callback' => '__return_true',
        ]);
    }

    register_rest_route(BYLINE_REST_NAMESPACE, '/sports/games/(?P<id>\d+)', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'wwh_rest_sports_game',
        'permission_callback' => '__return_true',
        'args' => [
            'id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint'],
        ],
    ]);

    register_rest_field('user', 'weeklyWildcatProfile', [
        'get_callback' => 'wwh_rest_author_profile',
        'schema' => [
            'description' => 'Byline author profile fields (legacy field name retained).',
            'type' => 'object',
            'context' => ['view', 'edit'],
        ],
    ]);
    register_rest_field('user', 'bylineProfile', [
        'get_callback' => 'wwh_rest_author_profile',
        'schema' => ['description' => 'Byline author profile fields.', 'type' => 'object', 'context' => ['view', 'edit']],
    ]);

    // The static build reads a story's featured image through `_embed`, and WordPress
    // embeds linked resources with context=embed, so these fields must include it or
    // the credit silently falls back to the file's EXIF data (the camera owner).
    register_rest_field('attachment', 'weeklyWildcatImage', [
        'get_callback' => 'wwh_rest_image_credit',
        'schema' => [
            'description' => 'Byline image credit and license metadata (legacy field name retained).',
            'type' => 'object',
            'context' => ['view', 'edit', 'embed'],
        ],
    ]);
    register_rest_field('attachment', 'bylineImage', [
        'get_callback' => 'wwh_rest_image_credit',
        'schema' => ['description' => 'Byline image credit and license metadata.', 'type' => 'object', 'context' => ['view', 'edit', 'embed']],
    ]);

    register_rest_field('post', 'weeklyWildcat', [
        'get_callback' => 'wwh_rest_post_settings',
        'schema' => [
            'description' => 'Byline post display settings (legacy field name retained).',
            'type' => 'object',
            'context' => ['view', 'edit'],
            'properties' => [
                'primaryGameId' => [
                    'type' => 'integer',
                    'description' => 'Selected Sports Game post ID for the automatic article game card.',
                ],
                'gameScoreGameIds' => [
                    'type' => 'array',
                    'items' => ['type' => 'integer'],
                    'description' => 'Published game IDs rendered by structured Byline Game Score blocks in the post content.',
                ],
                'presentation' => [
                    'type' => 'string',
                    'enum' => BYLINE_STORY_PRESENTATIONS,
                    'description' => 'Story presentation: the standard article or an immersive fullscreen opening.',
                ],
                'immersiveAlignment' => [
                    'type' => 'string',
                    'enum' => BYLINE_STORY_IMMERSIVE_ALIGNMENTS,
                    'description' => 'Headline position for an immersive story.',
                ],
            ],
        ],
    ]);
    register_rest_field('post', 'byline', [
        'get_callback' => 'wwh_rest_post_settings',
        'schema' => [
            'description' => 'Byline post display settings.',
            'type' => 'object',
            'context' => ['view', 'edit'],
            'properties' => [
                'primaryGameId' => ['type' => 'integer'],
                'gameScoreGameIds' => ['type' => 'array', 'items' => ['type' => 'integer']],
                'presentation' => ['type' => 'string', 'enum' => BYLINE_STORY_PRESENTATIONS],
                'immersiveAlignment' => ['type' => 'string', 'enum' => BYLINE_STORY_IMMERSIVE_ALIGNMENTS],
            ],
        ],
    ]);
}
add_action('rest_api_init', 'wwh_register_rest_routes');

function wwh_rest_post_settings(array $post): array
{
    $post_id = isset($post['id']) ? absint($post['id']) : 0;

    return [
        'primaryGameId' => absint(get_post_meta($post_id, WWH_PRIMARY_GAME_META, true)),
        'gameScoreGameIds' => function_exists('byline_newsroom_game_score_game_ids') ? byline_newsroom_game_score_game_ids($post_id) : [],
    ] + byline_story_presentation_settings($post_id);
}

function wwh_rest_image_credit(array $attachment): array
{
    $attachment_id = isset($attachment['id']) ? absint($attachment['id']) : 0;

    $metadata = static function (string $field, string $legacy_key) use ($attachment_id): string {
        if (function_exists('byline_editorial_media_attachment_meta_value')) {
            return byline_editorial_media_attachment_meta_value($attachment_id, $field);
        }

        return wwh_image_meta_value($attachment_id, $legacy_key);
    };

    return [
        'creator' => $metadata('creator', 'creator'),
        'creditText' => $metadata('creditText', 'credit_text'),
        'copyrightNotice' => $metadata('copyrightNotice', 'copyright_notice'),
        'licenseUrl' => $metadata('licenseUrl', 'license_url'),
        'acquireLicensePage' => $metadata('acquireLicensePage', 'acquire_license_url'),
    ];
}

function wwh_rest_author_profile(array $user): array
{
    $user_id = isset($user['id']) ? absint($user['id']) : 0;
    $photo_id = absint(get_user_meta($user_id, '_ww_author_photo_id', true));
    $socials = [];

    foreach (wwh_author_social_fields() as $key => $_label) {
        $value = wwh_author_meta_value($user_id, '_ww_author_social_' . $key);
        $socials[$key] = $key === 'email' ? sanitize_email($value) : wwh_normalize_author_social_link($key, $value);
    }

    return [
        'pronouns' => wwh_author_meta_value($user_id, '_ww_author_pronouns'),
        'role' => wwh_author_meta_value($user_id, '_ww_author_role'),
        'shortBio' => wwh_author_meta_value($user_id, '_ww_author_short_bio'),
        'showInDirectory' => wwh_author_visible_in_directory($user_id),
        'profilePhoto' => wwh_author_profile_photo($photo_id),
        'socials' => $socials,
    ];
}

function wwh_rest_authors(): WP_REST_Response
{
    $users = get_users([
        'orderby' => 'display_name',
        'order' => 'ASC',
        'fields' => 'all',
    ]);
    $authors = [];

    foreach ($users as $user) {
        if (!$user instanceof WP_User || !wwh_author_visible_in_directory((int) $user->ID)) {
            continue;
        }

        $author = [
            'id' => (int) $user->ID,
            'name' => $user->display_name,
            'slug' => $user->user_nicename,
            'description' => get_user_meta((int) $user->ID, 'description', true),
            'url' => $user->user_url,
            'link' => get_author_posts_url((int) $user->ID, $user->user_nicename),
            'bylineProfile' => wwh_rest_author_profile(['id' => (int) $user->ID]),
            'weeklyWildcatProfile' => wwh_rest_author_profile(['id' => (int) $user->ID]),
        ];

        $authors[] = $author;
    }

    return rest_ensure_response($authors);
}

function wwh_rest_limit(WP_REST_Request $request): int
{
    $raw_limit = (string) $request->get_param('per_page');

    if ($raw_limit === 'all' || $raw_limit === '-1') {
        return -1;
    }

    $limit = absint($raw_limit ?: 20);

    return max(1, $limit);
}

function wwh_rest_page(WP_REST_Request $request): int
{
    return max(1, absint($request->get_param('page') ?: 1));
}

function wwh_now_local(): string
{
    return wp_date('Y-m-d\TH:i', null, wp_timezone());
}

function wwh_normalize_sports_season_value(string $value): string
{
    return byline_sports_normalize_season($value);
}

function wwh_sports_game_season(int $post_id, string $start_datetime): string
{
    return byline_sports_resolve_game_season($start_datetime, wwh_meta_value($post_id, '_ww_import_season'));
}

function wwh_sports_season_post_ids(string $season): array
{
    return byline_sports_game_ids_for_season($season);
}

function wwh_game_query_args(WP_REST_Request $request, array $overrides = []): array
{
    $args = [
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => wwh_rest_limit($request),
        'paged' => wwh_rest_page($request),
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
        'no_found_rows' => false,
    ];

    $status = sanitize_text_field((string) $request->get_param('status'));
    $raw_year = sanitize_text_field((string) $request->get_param('year'));
    $season = wwh_normalize_sports_season_value(sanitize_text_field((string) ($request->get_param('season') ?: $raw_year)));
    $year = $season === '' ? absint($raw_year) : 0;
    $sport_key = wwh_sanitize_sport_key(sanitize_text_field((string) ($request->get_param('sport_key') ?: $request->get_param('sportKey') ?: $request->get_param('teamKey'))));
    $meta_query = [];

    if ($status !== '' && in_array($status, wwh_sports_game_status_values(), true)) {
        $meta_query[] = [
            'key' => '_ww_game_status',
            'value' => $status,
        ];
    }

    if ($sport_key !== '' && array_key_exists($sport_key, wwh_sports_team_options())) {
        $meta_query[] = [
            'key' => '_ww_sport_key',
            'value' => $sport_key,
        ];
    }

    if ($season !== '') {
        $args['post__in'] = wwh_sports_season_post_ids($season) ?: [0];
    } elseif ($year >= 1900 && $year <= 2200) {
        $meta_query[] = [
            'key' => '_ww_start_datetime',
            'value' => sprintf('%04d-01-01T00:00', $year),
            'compare' => '>=',
            'type' => 'CHAR',
        ];
        $meta_query[] = [
            'key' => '_ww_start_datetime',
            'value' => sprintf('%04d-01-01T00:00', $year + 1),
            'compare' => '<',
            'type' => 'CHAR',
        ];
    }

    if (isset($overrides['meta_query'])) {
        $meta_query = array_merge($meta_query, $overrides['meta_query']);
        unset($overrides['meta_query']);
    }

    if ($meta_query !== []) {
        $args['meta_query'] = $meta_query;
    }

    return array_merge($args, $overrides);
}

function wwh_event_query_args(WP_REST_Request $request): array
{
    $args = [
        'post_type' => WWH_SCHOOL_EVENT_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => wwh_rest_limit($request),
        'paged' => wwh_rest_page($request),
        'orderby' => 'meta_value',
        'meta_key' => '_ww_event_start_datetime',
        'order' => 'ASC',
        'no_found_rows' => false,
        'meta_query' => [
            [
                'key' => '_ww_event_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '>=',
                'type' => 'CHAR',
            ],
        ],
    ];

    $status = sanitize_text_field((string) $request->get_param('status'));

    if ($status !== '' && in_array($status, ['scheduled', 'canceled'], true)) {
        $args['meta_query'][] = [
            'key' => '_ww_event_status',
            'value' => $status,
        ];
    }

    return $args;
}

function wwh_rest_sports_games(WP_REST_Request $request): WP_REST_Response
{
    return wwh_rest_query_response(new WP_Query(wwh_game_query_args($request)), 'wwh_format_sports_game');
}

function wwh_rest_sports_game(WP_REST_Request $request)
{
    $game_id = absint($request->get_param('id'));
    $post = get_post($game_id);

    if (!$post instanceof WP_Post || $post->post_type !== WWH_SPORTS_GAME_POST_TYPE || $post->post_status !== 'publish') {
        return new WP_Error('wwh_game_not_found', 'Sports game not found.', ['status' => 404]);
    }

    return rest_ensure_response(wwh_format_sports_game($post));
}

function wwh_rest_search_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $search = sanitize_text_field((string) $request->get_param('search'));
    $limit = min(25, max(1, wwh_rest_limit($request)));
    $args = [
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => $limit,
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
        'no_found_rows' => true,
    ];

    if ($search !== '') {
        // Editor search matches the stable schedule fields writers recognize without exposing private admin data.
        $args['meta_query'] = [
            'relation' => 'OR',
            [
                'key' => '_ww_sport',
                'value' => $search,
                'compare' => 'LIKE',
            ],
            [
                'key' => '_ww_level',
                'value' => $search,
                'compare' => 'LIKE',
            ],
            [
                'key' => '_ww_sport_key',
                'value' => $search,
                'compare' => 'LIKE',
            ],
            [
                'key' => '_ww_opponent',
                'value' => $search,
                'compare' => 'LIKE',
            ],
            [
                'key' => '_ww_start_datetime',
                'value' => $search,
                'compare' => 'LIKE',
            ],
            [
                'key' => '_ww_location_name',
                'value' => $search,
                'compare' => 'LIKE',
            ],
        ];
    }

    return wwh_rest_query_response(new WP_Query($args), 'wwh_format_sports_game');
}

function wwh_summary_key(string $year = 'all', string $sport = 'all'): string
{
    return $year . '::' . $sport;
}

function wwh_empty_game_summary(): array
{
    return [
        'games' => 0,
        'upcoming' => 0,
        'finals' => 0,
        'forfeits' => 0,
        'wins' => 0,
        'losses' => 0,
        'ties' => 0,
    ];
}

function wwh_add_game_to_summary(array &$summaries, string $key, string $status, ?int $wildcats_score, ?int $opponent_score): void
{
    if (!isset($summaries[$key])) {
        $summaries[$key] = wwh_empty_game_summary();
    }

    $summaries[$key]['games']++;

    if ($status === 'upcoming') {
        $summaries[$key]['upcoming']++;
    }

    if (wwh_sports_game_status_shows_score($status)) {
        $summaries[$key]['finals']++;

        if ($status === 'tie') {
            $summaries[$key]['ties']++;
        } elseif ($wildcats_score !== null && $opponent_score !== null) {
            if ($wildcats_score > $opponent_score) {
                $summaries[$key]['wins']++;
            } elseif ($wildcats_score < $opponent_score) {
                $summaries[$key]['losses']++;
            } else {
                $summaries[$key]['ties']++;
            }
        }
    }

    if ($status === 'forfeit') {
        $summaries[$key]['forfeits']++;
    }
}

function wwh_rest_sports_game_facets(): WP_REST_Response
{
    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'orderby' => 'meta_value',
        'meta_key' => '_ww_start_datetime',
        'order' => 'DESC',
    ]);
    $years = [];
    $sports = [];
    $summaries = [];

    foreach ($query->posts as $post_id) {
        $post_id = absint($post_id);
        $start = wwh_meta_value($post_id, '_ww_start_datetime');
        $year = wwh_sports_game_season($post_id, $start);
        $sport_key = wwh_meta_value($post_id, '_ww_sport_key');
        $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
        $sport_label = $sport_option['label'] ?? wwh_meta_value($post_id, '_ww_sport', $sport_key);
        $status = wwh_effective_game_status(wwh_meta_value($post_id, '_ww_game_status', 'upcoming'), $start);
        $wildcats_score_raw = wwh_meta_value($post_id, '_ww_wildcats_score');
        $opponent_score_raw = wwh_meta_value($post_id, '_ww_opponent_score');
        $show_score = wwh_sports_game_status_shows_score($status) && $wildcats_score_raw !== '' && $opponent_score_raw !== '';
        $wildcats_score = $show_score ? absint($wildcats_score_raw) : null;
        $opponent_score = $show_score ? absint($opponent_score_raw) : null;

        if ($year !== '') {
            $years[$year] = true;
        }

        if ($sport_key !== '') {
            $sports[$sport_key] = [
                'value' => $sport_key,
                'label' => $sport_label !== '' ? $sport_label : $sport_key,
            ];
        }

        foreach ([
            wwh_summary_key(),
            wwh_summary_key($year !== '' ? $year : 'all', 'all'),
            wwh_summary_key('all', $sport_key !== '' ? $sport_key : 'all'),
            wwh_summary_key($year !== '' ? $year : 'all', $sport_key !== '' ? $sport_key : 'all'),
        ] as $summary_key) {
            wwh_add_game_to_summary($summaries, $summary_key, $status, $wildcats_score, $opponent_score);
        }
    }

    // A school year is available to the public archive when it has either a
    // published game or a published roster. Keep roster-only seasons in the
    // selector even when a team has not entered a schedule yet.
    if (function_exists('byline_sports_available_seasons')) {
        foreach (byline_sports_available_seasons(true) as $available_season) {
            if ($available_season !== '') {
                $years[$available_season] = true;
            }
        }
    }

    if (function_exists('get_posts')) {
        $roster_posts = get_posts([
            'post_type' => WWH_SPORTS_ROSTER_POST_TYPE,
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'no_found_rows' => true,
        ]);
        foreach ($roster_posts as $roster_post) {
            if (!$roster_post instanceof WP_Post) {
                continue;
            }
            $roster_team_key = wwh_sanitize_sport_key(wwh_meta_value($roster_post->ID, WWH_ROSTER_TEAM_META));
            if ($roster_team_key === '') {
                continue;
            }
            $roster_team = wwh_sports_team_options()[$roster_team_key] ?? [];
            $sports[$roster_team_key] = [
                'value' => $roster_team_key,
                'label' => (string) ($roster_team['label'] ?? $roster_team_key),
            ];
        }
    }

    wp_reset_postdata();
    $year_values = array_keys($years);
    rsort($year_values, SORT_STRING);
    usort($sports, static fn(array $left, array $right): int => strcasecmp($left['label'], $right['label']));

    return rest_ensure_response([
        'years' => $year_values,
        'sports' => array_values($sports),
        'summaries' => $summaries,
        'dataUrl' => add_query_arg(['per_page' => 'all', 'page' => 1], rest_url(WWH_REST_NAMESPACE . '/sports-games')),
    ]);
}

function wwh_format_sports_team(string $team_key, array $team): array
{
    $canonical = function_exists('byline_get_sports_team') ? byline_get_sports_team($team_key) : null;
    if (is_array($canonical)) {
        $team = array_merge($team, $canonical);
    }

    $header_id = byline_sports_team_attachment_id($team['headerImageId'] ?? wwh_sports_team_setting($team_key, 'headerImageId'));
    $logo_id = byline_sports_team_attachment_id($team['logoId'] ?? wwh_sports_team_setting($team_key, 'logoId'));
    $accent_source = $team['accentColor'] ?? wwh_sports_team_setting($team_key, 'accentColor');
    $accent_color = sanitize_hex_color(is_scalar($accent_source) ? (string) $accent_source : '');
    $header_focal_x = wwh_normalize_focal_coordinate($team['headerFocalPoint']['x'] ?? wwh_sports_team_setting($team_key, 'headerFocalX'));
    $header_focal_y = wwh_normalize_focal_coordinate($team['headerFocalPoint']['y'] ?? wwh_sports_team_setting($team_key, 'headerFocalY'));
    $summary = function_exists('byline_sports_team_summary') ? byline_sports_team_summary($team_key) : null;

    $formatted = [
        'id' => $team_key,
        'key' => $team_key,
        'sport' => (string) ($team['sport'] ?? ''),
        'level' => (string) ($team['level'] ?? ''),
        'genderDivision' => (string) ($team['genderDivision'] ?? ''),
        'slug' => (string) ($team['slug'] ?? $team_key),
        'active' => (bool) ($team['active'] ?? true),
        'displayName' => (string) ($team['displayName'] ?? $team['label'] ?? $team_key),
        'shortName' => (string) ($team['shortName'] ?? $team['teamLabel'] ?? ''),
        'scoreboardName' => (string) ($team['scoreboardName'] ?? $team['shortName'] ?? $team['teamLabel'] ?? ''),
        'teamLabel' => (string) ($team['teamLabel'] ?? $team['shortName'] ?? ''),
        'label' => (string) ($team['label'] ?? $team['displayName'] ?? $team_key),
        'headerImage' => wwh_media_image($header_id, 'large'),
        'headerImageFocalPoint' => [
            'x' => $header_focal_x,
            'y' => $header_focal_y,
        ],
        'logo' => wwh_media_image($logo_id, 'medium'),
        'accentColor' => $accent_color ?: '',
    ];

    // Relationship fields are additive; the legacy response shape above is
    // intentionally retained for existing public consumers.
    $formatted['teamKey'] = $team_key;
    $formatted['currentSeason'] = function_exists('byline_sports_current_season')
        ? byline_sports_current_season()
        : '';
    $formatted['seasons'] = function_exists('byline_sports_team_seasons')
        ? byline_sports_team_seasons($team_key, true)
        : [];
    $formatted['gamesCount'] = is_array($summary) ? (int) ($summary['games'] ?? 0) : 0;
    $formatted['rosterCount'] = is_array($summary) ? (int) ($summary['rosters'] ?? 0) : 0;

    return $formatted;
}

function wwh_rest_sports_teams(): WP_REST_Response
{
    $teams = [];

    foreach (wwh_sports_team_options() as $team_key => $team) {
        $teams[] = wwh_format_sports_team($team_key, $team);
    }

    return rest_ensure_response($teams);
}

function wwh_rest_sports_team_context(WP_REST_Request $request)
{
    $team_key = wwh_sanitize_sport_key((string) $request->get_param('teamKey'));
    $season = byline_sports_normalize_season((string) $request->get_param('season'));
    $context = byline_sports_team_context($team_key, $season);

    if (!is_array($context)) {
        return new WP_Error('byline_sports_team_not_found', 'Sports team not found.', ['status' => 404]);
    }

    return rest_ensure_response($context);
}

function wwh_rest_upcoming_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $args = wwh_game_query_args($request, [
        'order' => 'ASC',
        'meta_query' => [
            [
                'key' => '_ww_game_status',
                'value' => 'upcoming',
            ],
            [
                'key' => '_ww_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '>=',
                'type' => 'CHAR',
            ],
        ],
    ]);

    return wwh_rest_query_response(new WP_Query($args), 'wwh_format_sports_game');
}

function wwh_rest_recent_sports_games(WP_REST_Request $request): WP_REST_Response
{
    $args = wwh_game_query_args($request, [
        'order' => 'DESC',
        'meta_query' => [
            [
                'key' => '_ww_start_datetime',
                'value' => wwh_now_local(),
                'compare' => '<=',
                'type' => 'CHAR',
            ],
            [
                'relation' => 'OR',
                [
                    'key' => '_ww_game_status',
                    'value' => 'final',
                ],
                [
                    'key' => '_ww_game_status',
                    'value' => 'forfeit',
                ],
                [
                    'key' => '_ww_game_status',
                    'value' => 'tie',
                ],
                [
                    'key' => '_ww_game_status',
                    'value' => 'upcoming',
                ],
            ],
        ],
    ]);

    return wwh_rest_query_response(new WP_Query($args), 'wwh_format_sports_game');
}

function wwh_rest_school_events(WP_REST_Request $request): WP_REST_Response
{
    return wwh_rest_query_response(new WP_Query(wwh_event_query_args($request)), 'wwh_format_school_event');
}

function wwh_rest_query_response(WP_Query $query, callable $formatter): WP_REST_Response
{
    $response = rest_ensure_response(wwh_map_posts($query, $formatter));

    $response->header('X-WP-Total', (string) $query->found_posts);
    $response->header('X-WP-TotalPages', (string) max(1, (int) $query->max_num_pages));

    return $response;
}

function wwh_map_posts(WP_Query $query, callable $formatter): array
{
    $items = [];

    foreach ($query->posts as $post) {
        $items[] = $formatter($post);
    }

    wp_reset_postdata();

    return $items;
}

function wwh_parse_local_datetime(string $value): ?DateTimeImmutable
{
    $value = trim($value);

    if ($value === '') {
        return null;
    }

    $datetime = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value, wp_timezone());
    $errors = DateTimeImmutable::getLastErrors();
    $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

    return $datetime instanceof DateTimeImmutable && !$has_errors ? $datetime : null;
}

function wwh_format_date_text(string $value): string
{
    if ($value === '') {
        return '';
    }

    $datetime = wwh_parse_local_datetime($value);

    return $datetime ? wp_date('M j, Y g:i A', $datetime->getTimestamp(), wp_timezone()) : $value;
}

function wwh_format_time_text(string $start, string $end, bool $all_day): string
{
    if ($all_day) {
        return 'All day';
    }

    $start_datetime = wwh_parse_local_datetime($start);
    $end_datetime = wwh_parse_local_datetime($end);

    if (!$start_datetime) {
        return '';
    }

    $start_text = wp_date('g:i A', $start_datetime->getTimestamp(), wp_timezone());

    if (!$end_datetime) {
        return $start_text;
    }

    return sprintf('%s-%s', $start_text, wp_date('g:i A', $end_datetime->getTimestamp(), wp_timezone()));
}

function wwh_label_from_value(string $value): string
{
    return ucwords(str_replace(['_', '-'], ' ', $value));
}

function wwh_effective_game_status(string $status, string $start): string
{
    $status = wwh_sanitize_choice($status, wwh_sports_game_status_values(), 'upcoming');

    if ($status === 'upcoming' && wwh_game_start_has_passed($start)) {
        return 'final';
    }

    return $status;
}

function wwh_game_start_has_passed(string $start): bool
{
    if ($start === '') {
        return false;
    }

    $start_datetime = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $start, wp_timezone());
    $errors = DateTimeImmutable::getLastErrors();
    $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

    if (!$start_datetime || $has_errors) {
        return false;
    }

    return $start_datetime < new DateTimeImmutable('now', wp_timezone());
}

function wwh_format_sports_game(WP_Post $post): array
{
    $site = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_site', 'home'), ['home', 'away', 'neutral'], 'home');
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
    $opponent = wwh_meta_value($post->ID, '_ww_opponent');
    $location_name = wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location'));
    $location_address = wwh_meta_value($post->ID, '_ww_location_address');
    $latitude = wwh_meta_value($post->ID, '_ww_location_latitude');
    $longitude = wwh_meta_value($post->ID, '_ww_location_longitude');
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
    $status = wwh_effective_game_status(wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), $start);
    $wildcats_score = wwh_meta_value($post->ID, '_ww_wildcats_score');
    $opponent_score = wwh_meta_value($post->ID, '_ww_opponent_score');
    $show_score = wwh_sports_game_status_shows_score($status) && $wildcats_score !== '' && $opponent_score !== '';
    $canonical_team = $sport_key !== '' && function_exists('byline_get_sports_team') ? byline_get_sports_team($sport_key) : null;
    $home_label = (string) ($sport_option['scoreboardName'] ?? $sport_option['shortName'] ?? byline_get_publication_config()['identity']['shortName']);
    $matchup = $opponent !== '' ? sprintf('%s %s %s', $home_label, $site === 'away' ? 'at' : 'vs.', $opponent) : get_the_title($post);
    $sport = $sport_option['sport'] ?? wwh_meta_value($post->ID, '_ww_sport');
    $level = $sport_option['level'] ?? wwh_meta_value($post->ID, '_ww_level');
    $sport_level = trim(implode(' · ', array_filter([$sport, $level])));
    $opponent_label = $opponent !== '' ? $opponent : 'Opponent';

    return [
        'id' => $post->ID,
        'archiveUrl' => function_exists('byline_sports_archive_game_url') ? byline_sports_archive_game_url((int) $post->ID) : '',
        'title' => get_the_title($post),
        'slug' => $post->post_name,
        'sportKey' => $sport_key,
        'teamKey' => $sport_key,
        'teamSlug' => is_array($canonical_team) ? (string) ($canonical_team['slug'] ?? '') : '',
        'sport' => $sport,
        'sportLabel' => $sport_option['label'] ?? wwh_meta_value($post->ID, '_ww_sport'),
        'level' => $level,
        'teamLabel' => $sport_option['teamLabel'] ?? wwh_meta_value($post->ID, '_ww_team_label'),
        'team' => $sport_option ? wwh_format_sports_team($sport_key, $sport_option) : null,
        'opponent' => $opponent,
        'site' => $site,
        'location' => $location_name,
        'locationName' => $location_name,
        'locationAddress' => $location_address,
        'latitude' => $latitude !== '' ? (float) $latitude : null,
        'longitude' => $longitude !== '' ? (float) $longitude : null,
        'appleMapsId' => wwh_meta_value($post->ID, '_ww_location_apple_maps_id'),
        'startDate' => $start,
        'season' => wwh_sports_game_season($post->ID, $start),
        'status' => $status,
        'wildcatsScore' => $show_score ? absint($wildcats_score) : null,
        'teamScore' => $show_score ? absint($wildcats_score) : null,
        'opponentScore' => $show_score ? absint($opponent_score) : null,
        'recapUrl' => wwh_meta_value($post->ID, '_ww_recap_url'),
        'recap' => wwh_meta_value($post->ID, '_ww_recap_url') !== '' ? [
            'url' => wwh_meta_value($post->ID, '_ww_recap_url'),
            'title' => 'Recap',
        ] : null,
        'notes' => wwh_meta_value($post->ID, '_ww_notes'),
        'display' => [
            'matchup' => $matchup,
            'date' => $start !== '' ? wwh_format_date_text($start) : 'TBA',
            'location' => $location_name !== '' ? $location_name : $location_address,
            'status' => wwh_label_from_value($status),
            'score' => $show_score ? sprintf('%s %d, %s %d', $home_label, absint($wildcats_score), $opponent !== '' ? $opponent : 'Opponent', absint($opponent_score)) : null,
            'sportLevel' => $sport_level,
            'scoreboard' => [
                'wildcats' => [
                    'label' => $home_label,
                    'score' => $show_score ? absint($wildcats_score) : null,
                ],
                'team' => [
                    'label' => $home_label,
                    'score' => $show_score ? absint($wildcats_score) : null,
                ],
                'opponent' => [
                    'label' => $opponent_label,
                    'score' => $show_score ? absint($opponent_score) : null,
                ],
            ],
        ],
    ];
}

function wwh_public_site_url(): string
{
    return untrailingslashit((string) apply_filters('wwh_public_site_url', byline_get_publication_config()['urls']['publicSite']));
}

function wwh_game_center_url(int $game_id): string
{
    $archive = function_exists('byline_sports_archive_game_url') ? byline_sports_archive_game_url($game_id) : '';
    return wwh_public_site_url() . ($archive !== '' ? $archive : '/sports/schedule/#game-' . absint($game_id));
}

function wwh_render_game_embed_block(array $attributes): string
{
    $game_id = absint($attributes['gameId'] ?? 0);
    $post = $game_id > 0 ? get_post($game_id) : null;

    if (!$post instanceof WP_Post || $post->post_type !== WWH_SPORTS_GAME_POST_TYPE || $post->post_status !== 'publish') {
        return '';
    }

    $display = wwh_sanitize_choice((string) ($attributes['display'] ?? 'full'), ['compact', 'full', 'score-only'], 'full');

    return wwh_render_game_card_html(wwh_format_sports_game($post), $display);
}

function wwh_render_game_card_html(array $game, string $display): string
{
    $status = (string) ($game['status'] ?? 'upcoming');
    $scoreboard = $game['display']['scoreboard'] ?? [];
    $wildcats = $scoreboard['team'] ?? $scoreboard['wildcats'] ?? ['label' => byline_get_publication_config()['identity']['shortName'], 'score' => null];
    $opponent = $scoreboard['opponent'] ?? ['label' => 'Opponent', 'score' => null];
    $wildcats_score = $wildcats['score'];
    $opponent_score = $opponent['score'];
    $has_score = wwh_sports_game_status_shows_score($status) && $wildcats_score !== null && $opponent_score !== null;
    $wildcats_won = $has_score && (int) $wildcats_score > (int) $opponent_score;
    $opponent_won = $has_score && (int) $opponent_score > (int) $wildcats_score;
    $classes = trim('article-game-card article-game-card-inline article-game-card-' . $display . ' article-game-card-' . $status);
    $date = (string) ($game['display']['date'] ?? $game['startDate'] ?? '');
    $location = (string) ($game['display']['location'] ?? $game['locationName'] ?? $game['locationAddress'] ?? '');
    $sport_level = (string) ($game['display']['sportLevel'] ?? $game['sportLabel'] ?? 'Sports');
    $status_label = (string) ($game['display']['status'] ?? wwh_label_from_value($status));
    $matchup = (string) ($game['display']['matchup'] ?? $game['title'] ?? 'Publication game');
    $game_url = wwh_game_center_url(absint($game['id'] ?? 0));

    ob_start();
    ?>
    <aside class="<?php echo esc_attr($classes); ?>" aria-label="Linked game">
        <div class="article-game-card-meta">
            <span><?php echo esc_html($sport_level); ?></span>
            <span><?php echo esc_html($status_label); ?></span>
        </div>

        <?php if ($display !== 'score-only') : ?>
            <h2><?php echo esc_html($matchup); ?></h2>
        <?php endif; ?>

        <?php if ($has_score) : ?>
            <div class="article-game-scoreboard" aria-label="<?php echo esc_attr((string) ($game['display']['score'] ?? 'Final score')); ?>">
                <div class="<?php echo esc_attr($wildcats_won ? 'article-game-team article-game-team-winner' : 'article-game-team'); ?>">
                    <span><?php echo esc_html((string) ($wildcats['label'] ?? byline_get_publication_config()['identity']['shortName'])); ?></span>
                    <strong><?php echo esc_html((string) $wildcats_score); ?></strong>
                </div>
                <div class="<?php echo esc_attr($opponent_won ? 'article-game-team article-game-team-winner' : 'article-game-team'); ?>">
                    <span><?php echo esc_html((string) ($opponent['label'] ?? 'Opponent')); ?></span>
                    <strong><?php echo esc_html((string) $opponent_score); ?></strong>
                </div>
            </div>
        <?php else : ?>
            <p class="article-game-status"><?php echo esc_html($status_label); ?></p>
        <?php endif; ?>

        <?php if ($display === 'full') : ?>
            <dl class="article-game-details">
                <?php if ($date !== '') : ?>
                    <div>
                        <dt>Date</dt>
                        <dd><?php echo esc_html($date); ?></dd>
                    </div>
                <?php endif; ?>
                <?php if ($location !== '') : ?>
                    <div>
                        <dt>Location</dt>
                        <dd><?php echo esc_html($location); ?></dd>
                    </div>
                <?php endif; ?>
            </dl>
        <?php elseif ($date !== '') : ?>
            <p class="article-game-date"><?php echo esc_html($date); ?></p>
        <?php endif; ?>

        <a class="article-game-link" href="<?php echo esc_url($game_url); ?>">View archived record &rarr;</a>
    </aside>
    <?php

    return trim((string) ob_get_clean());
}

function wwh_format_school_event(WP_Post $post): array
{
    $status = wwh_sanitize_choice(wwh_meta_value($post->ID, '_ww_event_status', 'scheduled'), ['scheduled', 'canceled'], 'scheduled');
    $start = wwh_meta_value($post->ID, '_ww_event_start_datetime');
    $end = wwh_meta_value($post->ID, '_ww_event_end_datetime');
    $all_day = wwh_meta_value($post->ID, '_ww_event_all_day') === '1';

    return [
        'id' => $post->ID,
        'title' => get_the_title($post),
        'slug' => $post->post_name,
        'eventType' => wwh_meta_value($post->ID, '_ww_event_type'),
        'startDate' => $start,
        'endDate' => $end,
        'allDay' => $all_day,
        'location' => wwh_meta_value($post->ID, '_ww_event_location'),
        'description' => wwh_meta_value($post->ID, '_ww_event_description'),
        'externalUrl' => wwh_meta_value($post->ID, '_ww_event_external_url'),
        'status' => $status,
        'display' => [
            'date' => wwh_format_date_text($start),
            'time' => wwh_format_time_text($start, $end, $all_day),
            'status' => wwh_label_from_value($status),
        ],
    ];
}

require_once __DIR__ . '/includes/sports-rosters.php';
require_once __DIR__ . '/includes/sports/archive.php';
require_once __DIR__ . '/includes/content/newsroom-blocks.php';
require_once __DIR__ . '/includes/content/gallery-media.php';
require_once __DIR__ . '/includes/content/photo-credits.php';
require_once __DIR__ . '/includes/content/story-presentation.php';
require_once __DIR__ . '/includes/discord-integration.php';
require_once __DIR__ . '/includes/integrations/discord.php';
require_once __DIR__ . '/includes/core/upgrade.php';
require_once __DIR__ . '/includes/core/health.php';
require_once __DIR__ . '/includes/admin/dashboard.php';

// Integrations, Content Health, Command Palette, and newsletter delivery are
// first-class protected WordPress services.  The registration adapter is
// loaded last so every core/editorial helper it consumes is already defined.
require_once __DIR__ . '/includes/integrations/registration.php';
byline_register_optional_backend_slice();

// One activation callback owns all first-install work. Updates are repaired by
// byline_maybe_upgrade() on admin_init, so replacing plugin files never
// requires deactivation/reactivation or visiting a particular Byline screen.
register_activation_hook(__FILE__, 'byline_activate_plugin');
register_deactivation_hook(__FILE__, 'byline_deactivate_plugin');
