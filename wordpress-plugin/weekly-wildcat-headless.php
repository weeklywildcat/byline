<?php
/**
 * Plugin Name: Byline
 * Description: Open-source publishing tools, design management, and integrations for student newsrooms.
 * Version: 0.2.13
 * Requires PHP: 7.4
 * Author: Byline Contributors
 * License: GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/core/compatibility.php';
require_once __DIR__ . '/includes/core/protocol.php';
require_once __DIR__ . '/includes/core/capabilities.php';
require_once __DIR__ . '/includes/publication/config.php';
require_once __DIR__ . '/includes/design/schema.php';
require_once __DIR__ . '/includes/design/post-type.php';
require_once __DIR__ . '/includes/design/rest.php';
require_once __DIR__ . '/includes/core/diagnostics.php';
require_once __DIR__ . '/includes/content/pages.php';
require_once __DIR__ . '/includes/content/page-blocks.php';
require_once __DIR__ . '/includes/admin/app.php';

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
require_once __DIR__ . '/includes/editorial/admin.php';

// Design publication is shared by the immediate REST action and the
// idempotent scheduled executor. Loading the helper before the REST routes
// keeps both paths on the same validation/locking implementation.
require_once __DIR__ . '/includes/design/publishing.php';
require_once __DIR__ . '/includes/design/scheduling.php';

// Polls are WordPress-native content with their own vote table. WordPress is
// the only datastore for poll definitions, lifecycle, and votes.
require_once __DIR__ . '/includes/polls/schema.php';
require_once __DIR__ . '/includes/polls/votes.php';
require_once __DIR__ . '/includes/polls/voter.php';
require_once __DIR__ . '/includes/polls/post-type.php';
require_once __DIR__ . '/includes/polls/model.php';
require_once __DIR__ . '/includes/polls/rest.php';
require_once __DIR__ . '/includes/polls/admin.php';
require_once __DIR__ . '/includes/polls/migration.php';
require_once __DIR__ . '/includes/polls/cli.php';

const WWH_CONTRIBUTOR_COOKIE = 'wwh_contributor_seen';

function wwh_auth_cookie_expiration(int $length, int $user_id, bool $remember): int
{
    return DAY_IN_SECONDS;
}
add_filter('auth_cookie_expiration', 'wwh_auth_cookie_expiration', 10, 3);

function wwh_contributor_cookie_value(int $issued_at): string
{
    return $issued_at . '.' . hash_hmac('sha256', (string) $issued_at, wp_salt('auth'));
}

function wwh_mark_successful_contributor_login(string $user_login, WP_User $user): void
{
    $issued_at = time();
    $value = wwh_contributor_cookie_value($issued_at);
    setcookie(
        WWH_CONTRIBUTOR_COOKIE,
        $value,
        [
            'expires' => $issued_at + YEAR_IN_SECONDS,
            'path' => COOKIEPATH ?: '/',
            'domain' => COOKIE_DOMAIN,
            'secure' => is_ssl(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );
    $_COOKIE[WWH_CONTRIBUTOR_COOKIE] = $value;
}
add_action('wp_login', 'wwh_mark_successful_contributor_login', 10, 2);

function wwh_has_contributor_cookie(): bool
{
    $value = isset($_COOKIE[WWH_CONTRIBUTOR_COOKIE])
        ? sanitize_text_field(wp_unslash($_COOKIE[WWH_CONTRIBUTOR_COOKIE]))
        : '';
    if ($value === '' || preg_match('/^(\d+)\.([a-f0-9]{64})$/', $value, $matches) !== 1) {
        return false;
    }

    $issued_at = (int) $matches[1];
    if ($issued_at <= 0 || $issued_at > time() + MINUTE_IN_SECONDS || $issued_at < time() - YEAR_IN_SECONDS) {
        return false;
    }

    $expected = wwh_contributor_cookie_value($issued_at);
    return hash_equals($expected, $value);
}

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

    if (wwh_has_contributor_cookie()) {
        wp_safe_redirect(wp_login_url(admin_url()));
        exit;
    }

    wwh_render_cms_redirect_page();
    exit;
}
add_action('template_redirect', 'wwh_redirect_cms_frontend', 1);

function wwh_render_cms_redirect_page(): void
{
    $publication = byline_get_publication_config();
    $public_url = rtrim($publication['urls']['publicSite'], '/') . '/';
    $login_url = wp_login_url(admin_url());
    $logo_url = byline_publication_absolute_url($publication['branding']['masthead']['url']);
    $photo = wwh_unsplash_photo('ZeGQ22v9Zhk');

    status_header(200);
    nocache_headers();
    header('X-Robots-Tag: noindex, nofollow', true);
    ?>
    <!doctype html>
    <html <?php language_attributes(); ?>>
    <head>
        <meta charset="<?php bloginfo('charset'); ?>">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta http-equiv="refresh" content="5;url=<?php echo esc_url($public_url); ?>">
        <title><?php echo esc_html($publication['identity']['name']); ?> CMS</title>
        <style>
            * { box-sizing: border-box; }
            body {
                align-items: center;
                background-color: #27272a;
                <?php if ($photo !== []) : ?>
                background-image: linear-gradient(rgba(0, 0, 0, .42), rgba(0, 0, 0, .58)), url('<?php echo esc_url($photo['imageUrl']); ?>');
                background-position: center;
                background-repeat: no-repeat;
                background-size: cover;
                <?php endif; ?>
                color: #18181b;
                display: flex;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                justify-content: center;
                margin: 0;
                min-height: 100vh;
                padding: 24px;
            }
            main {
                background: #fff;
                border: 1px solid #e4e4e7;
                border-radius: 16px;
                box-shadow: 0 20px 55px rgba(24, 24, 27, .1);
                max-width: 520px;
                padding: 38px;
                text-align: center;
                width: 100%;
            }
            .logo { display: block; height: auto; margin: 0 auto 28px; max-width: 260px; width: 100%; }
            h1 { font-size: 25px; line-height: 1.25; margin: 0 0 10px; }
            p { color: #52525b; font-size: 15px; line-height: 1.5; margin: 0 0 24px; }
            .countdown { color: #18181b; font-weight: 600; }
            .login-link {
                background: #18181b;
                border-radius: 7px;
                color: #fff;
                display: inline-block;
                font-size: 15px;
                font-weight: 600;
                padding: 12px 18px;
                text-decoration: none;
            }
            .login-link:hover, .login-link:focus { background: #3f3f46; }
            .photo-credit {
                background: rgba(0, 0, 0, .48);
                border-radius: 4px;
                bottom: 12px;
                color: rgba(255, 255, 255, .86);
                font-size: 11px;
                padding: 5px 8px;
                position: fixed;
                right: 12px;
            }
            .photo-credit a { color: #fff; }
            @media (max-width: 520px) { main { padding: 30px 22px; } }
        </style>
    </head>
    <body>
        <main>
            <img class="logo" src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr($publication['branding']['masthead']['alt']); ?>">
            <h1>This site is for contributors only</h1>
            <p class="countdown" aria-live="polite">Redirecting in <span id="wwh-countdown">5</span> seconds</p>
            <a class="login-link" href="<?php echo esc_url($login_url); ?>">Contributor sign in</a>
        </main>
        <?php if ($photo !== []) : ?>
            <div class="photo-credit">Photo by <a href="<?php echo esc_url($photo['photographerUrl']); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html($photo['photographer']); ?></a> on <a href="<?php echo esc_url($photo['photoUrl']); ?>" target="_blank" rel="noopener noreferrer">Unsplash</a></div>
        <?php endif; ?>
        <script>
            (function () {
                var remaining = 5;
                var output = document.getElementById('wwh-countdown');
                var timer = window.setInterval(function () {
                    remaining -= 1;
                    output.textContent = String(Math.max(remaining, 0));
                    if (remaining <= 0) {
                        window.clearInterval(timer);
                        window.location.replace(<?php echo wp_json_encode($public_url); ?>);
                    }
                }, 1000);
            }());
        </script>
    </body>
    </html>
    <?php
}

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
require_once __DIR__ . '/includes/integrations/deployment.php';

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

function wwh_render_team_media_field(string $team_key, string $field, string $label, int $attachment_id, array $focal_point = []): void
{
    $image = wwh_media_image($attachment_id, $field === 'logoId' ? 'medium' : 'large');
    $image_url = is_array($image) && is_scalar($image['url'] ?? null) ? (string) $image['url'] : '';
    $field_id = 'wwh_team_' . sanitize_key($team_key) . '_' . sanitize_key($field);
    $is_header_image = $field === 'headerImageId';
    $focal_x = wwh_normalize_focal_coordinate($focal_point['x'] ?? 50);
    $focal_y = wwh_normalize_focal_coordinate($focal_point['y'] ?? 50);

    ?>
    <fieldset class="wwh-team-media-field <?php echo $is_header_image ? 'wwh-team-header-media-field' : ''; ?>">
        <legend><?php echo esc_html($label); ?></legend>
        <input type="hidden" id="<?php echo esc_attr($field_id); ?>" name="presentation[<?php echo esc_attr($field); ?>]" value="<?php echo esc_attr((string) $attachment_id); ?>">
        <?php if ($is_header_image) : ?>
            <button
                type="button"
                class="wwh-team-focal-preview"
                aria-label="Set header image focal point. Use arrow keys for precise positioning."
                aria-describedby="<?php echo esc_attr($field_id); ?>_focal_help"
                <?php echo $image_url === '' ? 'hidden' : ''; ?>
            >
                <img class="wwh-team-media-preview" src="<?php echo esc_url($image_url); ?>" alt="">
                <i class="wwh-team-focal-marker" style="left: <?php echo esc_attr((string) $focal_x); ?>%; top: <?php echo esc_attr((string) $focal_y); ?>%;" aria-hidden="true"></i>
            </button>
            <input class="wwh-team-focal-x" type="hidden" name="presentation[headerFocalX]" value="<?php echo esc_attr((string) $focal_x); ?>">
            <input class="wwh-team-focal-y" type="hidden" name="presentation[headerFocalY]" value="<?php echo esc_attr((string) $focal_y); ?>">
            <div class="wwh-team-focal-controls" <?php echo $image_url === '' ? 'hidden' : ''; ?>>
                <output class="wwh-team-focal-output"><?php echo esc_html(sprintf('%s%% horizontal · %s%% vertical', $focal_x, $focal_y)); ?></output>
                <button type="button" class="button-link wwh-team-focal-center">Center</button>
            </div>
            <p class="description wwh-team-focal-help" id="<?php echo esc_attr($field_id); ?>_focal_help" <?php echo $image_url === '' ? 'hidden' : ''; ?>>Click the image to keep that point visible when the header is cropped. Arrow keys move the focal point.</p>
        <?php else : ?>
            <img class="wwh-team-media-preview wwh-team-logo-preview" src="<?php echo esc_url($image_url); ?>" alt="" <?php echo $image_url === '' ? 'hidden' : ''; ?>>
        <?php endif; ?>
        <p>
            <button type="button" class="button wwh-team-media-select" aria-label="Select <?php echo esc_attr(strtolower($label)); ?>" data-title="<?php echo esc_attr('Select ' . strtolower($label)); ?>" data-button-text="Use image">Select</button>
            <button type="button" class="button wwh-team-media-remove" aria-label="Remove <?php echo esc_attr(strtolower($label)); ?>" <?php echo $image_url === '' ? 'hidden' : ''; ?>>Remove</button>
        </p>
    </fieldset>
    <?php
}

function wwh_sports_team_settings_url(string $team_key = ''): string
{
    $url = byline_sports_team_settings_url();

    return $team_key !== '' ? add_query_arg(['team' => sanitize_key($team_key)], $url) : $url;
}

function wwh_sports_team_add_url(): string
{
    return add_query_arg(['add' => '1'], byline_sports_team_settings_url());
}

function wwh_render_sports_team_identity_section(string $team_key, array $team): void
{
    $identity_id = 'wwh-team-identity-' . sanitize_key($team_key);
    ?>
    <section class="wwh-team-identity-section" aria-labelledby="<?php echo esc_attr($identity_id); ?>">
        <h3 id="<?php echo esc_attr($identity_id); ?>">Identity</h3>
        <p class="description">The stable key is permanent once games, rosters, or coverage reference it.</p>
        <div class="wwh-team-identity-fields">
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_display">Display name
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_display" type="text" name="identity[displayName]" value="<?php echo esc_attr((string) ($team['displayName'] ?? $team['label'] ?? '')); ?>" required>
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_short">Short name
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_short" type="text" name="identity[shortName]" value="<?php echo esc_attr((string) ($team['shortName'] ?? $team['teamLabel'] ?? '')); ?>">
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_scoreboard">Scoreboard name
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_scoreboard" type="text" name="identity[scoreboardName]" value="<?php echo esc_attr((string) ($team['scoreboardName'] ?? $team['shortName'] ?? $team['teamLabel'] ?? '')); ?>">
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_sport">Sport
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_sport" type="text" name="identity[sport]" value="<?php echo esc_attr((string) ($team['sport'] ?? '')); ?>" required>
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_level">Level
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_level" type="text" name="identity[level]" value="<?php echo esc_attr((string) ($team['level'] ?? '')); ?>">
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_division">Gender / division
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_division" type="text" name="identity[genderDivision]" value="<?php echo esc_attr((string) ($team['genderDivision'] ?? '')); ?>">
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_slug">Public slug
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_slug" type="text" name="identity[slug]" value="<?php echo esc_attr((string) ($team['slug'] ?? $team_key)); ?>" required>
            </label>
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_stable_key">Stable key
                <input class="widefat" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_stable_key" type="text" value="<?php echo esc_attr($team_key); ?>" readonly aria-describedby="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_stable_key_help">
                <span id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_stable_key_help" class="description">Keys cannot be changed after creation.</span>
            </label>
        </div>
        <p class="wwh-team-status-control">
            <label for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_active"><input id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_active" type="checkbox" name="identity[active]" value="1" <?php checked(!empty($team['active'])); ?>> Active</label>
            <span class="description">Archive a team instead of deleting it. Historical games, rosters, coverage, and public routes stay resolvable.</span>
        </p>
    </section>
    <?php
}

function wwh_render_sports_team_branding_section(string $team_key, array $team, array $settings): void
{
    $team_settings = is_array($settings[$team_key] ?? null) ? $settings[$team_key] : [];
    $header_id = byline_sports_team_attachment_id($team_settings['headerImageId'] ?? $team['headerImageId'] ?? 0);
    $logo_id = byline_sports_team_attachment_id($team_settings['logoId'] ?? $team['logoId'] ?? 0);
    $accent_source = $team_settings['accentColor'] ?? $team['accentColor'] ?? '';
    $accent_color = sanitize_hex_color(is_scalar($accent_source) ? (string) $accent_source : '') ?: '';
    $header_focal_point = [
        'x' => wwh_normalize_focal_coordinate($team_settings['headerFocalX'] ?? ($team['headerFocalPoint']['x'] ?? 50)),
        'y' => wwh_normalize_focal_coordinate($team_settings['headerFocalY'] ?? ($team['headerFocalPoint']['y'] ?? 50)),
    ];
    ?>
    <section class="wwh-team-branding-section" aria-labelledby="wwh-team-branding-heading-<?php echo esc_attr(sanitize_key($team_key)); ?>">
        <h3 id="wwh-team-branding-heading-<?php echo esc_attr(sanitize_key($team_key)); ?>">Branding</h3>
        <p class="description">Branding is stored separately for compatibility with the existing media records. Removing an image does not remove the attachment from WordPress.</p>
        <div class="wwh-team-media-fields">
            <?php wwh_render_team_media_field($team_key, 'headerImageId', 'Header Image', $header_id, $header_focal_point); ?>
            <?php wwh_render_team_media_field($team_key, 'logoId', 'Logo / Mark', $logo_id); ?>
        </div>
        <label class="wwh-team-accent-field" for="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_accent">
            <span>Accent Color</span>
            <input type="text" id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_accent" name="presentation[accentColor]" value="<?php echo esc_attr($accent_color); ?>" placeholder="#7b1f2a" pattern="#[0-9a-fA-F]{6}" aria-describedby="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_accent_help">
            <span id="wwh_team_<?php echo esc_attr(sanitize_key($team_key)); ?>_accent_help" class="description">Use a six-digit hexadecimal color, such as #7b1f2a.</span>
        </label>
    </section>
    <?php
}

function wwh_render_sports_team_settings_card(string $team_key, array $team, array $settings): void
{
    $section = isset($_GET['section']) && is_scalar($_GET['section']) ? sanitize_key((string) wp_unslash($_GET['section'])) : '';
    $identity_open = $section === '' || $section === 'identity';
    $branding_open = $section === 'branding';
    ?>
    <div class="wwh-team-settings-card wwh-team-settings-detail-card">
        <details id="wwh-team-identity" class="wwh-team-settings-section" <?php echo $identity_open ? 'open' : ''; ?>>
            <summary><span class="wwh-team-settings-section-title">Identity</span><span class="description">Names, classification, slug, and status</span></summary>
            <?php wwh_render_sports_team_identity_section($team_key, $team); ?>
        </details>
        <details id="wwh-team-branding" class="wwh-team-settings-section" <?php echo $branding_open ? 'open' : ''; ?>>
            <summary><span class="wwh-team-settings-section-title">Branding</span><span class="description">Logo, header image, focal point, and accent</span></summary>
            <?php wwh_render_sports_team_branding_section($team_key, $team, $settings); ?>
        </details>
    </div>
    <?php
}

function wwh_sports_team_index_game_label(array $candidate, bool $result = false): string
{
    $post = $candidate['post'] ?? null;
    $opponent = is_scalar($candidate['opponent'] ?? null) ? (string) $candidate['opponent'] : '';
    $start = is_scalar($candidate['startDate'] ?? null) ? (string) $candidate['startDate'] : '';
    $status = is_scalar($candidate['status'] ?? null) ? (string) $candidate['status'] : '';
    $wildcats_score = $candidate['wildcatsScore'] ?? null;
    $opponent_score = $candidate['opponentScore'] ?? null;

    if ($post instanceof WP_Post) {
        $opponent = byline_sports_post_meta_value((int) $post->ID, '_ww_opponent', 'Opponent');
        $start = byline_sports_post_meta_value((int) $post->ID, '_ww_start_datetime');
        $status = is_scalar($candidate['status'] ?? null) ? (string) $candidate['status'] : byline_sports_post_meta_value((int) $post->ID, '_ww_game_status', 'upcoming');
        $wildcats_score = byline_sports_post_meta_value((int) $post->ID, '_ww_wildcats_score');
        $opponent_score = byline_sports_post_meta_value((int) $post->ID, '_ww_opponent_score');
    }

    $date = $start !== '' && function_exists('wwh_format_date_text') ? wwh_format_date_text($start) : ($start !== '' ? $start : 'Date pending');
    $opponent = $opponent !== '' ? $opponent : 'Opponent pending';
    if ($result && $wildcats_score !== null && $wildcats_score !== '' && $opponent_score !== null && $opponent_score !== '') {
        $outcome = (int) $wildcats_score > (int) $opponent_score ? 'W' : ((int) $wildcats_score < (int) $opponent_score ? 'L' : 'T');
        return sprintf('%s %s-%s vs. %s', $outcome, $wildcats_score, $opponent_score, $opponent);
    }

    return $result ? 'Result pending vs. ' . $opponent : $date . ' · vs. ' . $opponent;
}

function wwh_render_sports_team_index_table(array $teams, array $summaries, string $current_season): void
{
    if ($teams === []) {
        return;
    }
    ?>
    <div class="wwh-sports-team-table-wrap">
        <table class="widefat striped wwh-sports-team-table">
            <caption class="screen-reader-text">Sports teams and current-season relationship summaries</caption>
            <thead><tr><th scope="col">Team</th><th scope="col">Sport · level</th><th scope="col">Season</th><th scope="col">Roster</th><th scope="col">Games</th><th scope="col">Next game</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>
            <?php foreach ($teams as $team_key => $team) : ?>
                <?php
                $summary = is_array($summaries[$team_key] ?? null) ? $summaries[$team_key] : [];
                $season = (string) ($summary['currentSeason'] ?? $current_season);
                $roster_count = (int) ($summary['publishedRosterCounts'][$season] ?? 0);
                $athlete_count = (int) ($summary['publishedAthletesBySeason'][$season] ?? 0);
                $game_count = (int) ($summary['publishedGamesBySeason'][$season] ?? $summary['gamesBySeason'][$season] ?? 0);
                $has_roster = $roster_count > 0;
                $display_name = (string) ($team['displayName'] ?? $team['label'] ?? $team_key);
                $sport_level = trim(implode(' · ', array_filter([(string) ($team['sport'] ?? ''), (string) ($team['level'] ?? '')])));
                ?>
                <tr>
                    <td><strong><a href="<?php echo esc_url(wwh_sports_team_settings_url((string) $team_key)); ?>"><?php echo esc_html($display_name); ?></a></strong><br><code><?php echo esc_html((string) $team_key); ?></code></td>
                    <td><?php echo esc_html($sport_level !== '' ? $sport_level : 'Classification pending'); ?></td>
                    <td><?php echo esc_html($season !== '' ? $season : '—'); ?></td>
                    <td><?php echo esc_html($has_roster ? $athlete_count . ' ' . ($athlete_count === 1 ? 'athlete' : 'athletes') : 'Not added'); ?></td>
                    <td><a href="<?php echo esc_url(byline_sports_admin_games_url((string) $team_key, $season)); ?>"><?php echo esc_html((string) $game_count); ?></a></td>
                    <td><?php echo $summary['nextGame'] ? esc_html(wwh_sports_team_index_game_label($summary['nextGame'])) : 'Not scheduled'; ?></td>
                    <td><span class="wwh-sports-team-state <?php echo !empty($team['active']) ? 'is-active' : 'is-inactive'; ?>"><?php echo !empty($team['active']) ? 'Active' : 'Inactive / archived'; ?></span></td>
                    <td class="wwh-sports-actions">
                        <a href="<?php echo esc_url(wwh_sports_team_settings_url((string) $team_key)); ?>">Manage</a>
                        · <a href="<?php echo esc_url(byline_sports_admin_games_url((string) $team_key, $season)); ?>">Games</a>
                        · <a href="<?php echo esc_url($has_roster ? byline_sports_admin_rosters_url((string) $team_key, $season) : byline_sports_admin_new_roster_url((string) $team_key, $season)); ?>"><?php echo $has_roster ? 'Roster' : 'Add roster'; ?></a>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php
}

function wwh_render_sports_team_add_form(): void
{
    ?>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wwh-sports-team-form wwh-sports-team-create-form">
        <?php wp_nonce_field('wwh_create_sports_team', 'wwh_create_sports_team_nonce'); ?>
        <input type="hidden" name="action" value="wwh_create_sports_team">
        <section class="wwh-team-create-card" aria-labelledby="wwh-team-create-heading">
            <h2 id="wwh-team-create-heading">Team identity</h2>
            <p class="description">Create the team first. Branding, rosters, games, and coverage can be added after the identity exists.</p>
            <div class="wwh-team-create-fields">
                <label for="byline_new_team_sport">Sport
                    <input class="regular-text" id="byline_new_team_sport" name="team[sport]" placeholder="Football" required>
                </label>
                <label for="byline_new_team_level">Level
                    <input class="regular-text" id="byline_new_team_level" name="team[level]" placeholder="Varsity">
                </label>
                <label for="byline_new_team_division">Gender / division <span class="description">Optional</span>
                    <input class="regular-text" id="byline_new_team_division" name="team[genderDivision]">
                </label>
                <label for="byline_new_team_display">Display name
                    <input class="regular-text" id="byline_new_team_display" name="team[displayName]" placeholder="Football - Varsity" required>
                </label>
                <label for="byline_new_team_short">Short name
                    <input class="regular-text" id="byline_new_team_short" name="team[shortName]" placeholder="Football">
                </label>
                <label for="byline_new_team_scoreboard">Scoreboard name
                    <input class="regular-text" id="byline_new_team_scoreboard" name="team[scoreboardName]" placeholder="Wildcats">
                </label>
                <label for="byline_new_team_key">Stable key
                    <input class="regular-text" id="byline_new_team_key" name="team[key]" placeholder="football-varsity" required aria-describedby="byline_new_team_key_help">
                    <span id="byline_new_team_key_help" class="description">Permanent once referenced by a game, roster, or article. It must be unique, including inactive teams.</span>
                </label>
                <label for="byline_new_team_slug">Public slug
                    <input class="regular-text" id="byline_new_team_slug" name="team[slug]" placeholder="football-varsity" required aria-describedby="byline_new_team_slug_help">
                    <span id="byline_new_team_slug_help" class="description">Must be unique, including inactive teams.</span>
                </label>
            </div>
            <p class="submit"><button type="submit" class="button button-primary">Create team</button> <a class="button" href="<?php echo esc_url(byline_sports_team_settings_url()); ?>">Cancel</a></p>
        </section>
    </form>
    <script>
    document.addEventListener('DOMContentLoaded', function () {
        var sport = document.getElementById('byline_new_team_sport');
        var level = document.getElementById('byline_new_team_level');
        var display = document.getElementById('byline_new_team_display');
        var shortName = document.getElementById('byline_new_team_short');
        var stableKey = document.getElementById('byline_new_team_key');
        var slug = document.getElementById('byline_new_team_slug');
        if (!sport || !level || !display || !shortName || !stableKey || !slug) return;
        function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
        function suggestion(field, value) {
            if (!field.dataset.edited || field.value === field.dataset.suggestion || field.value === '') {
                field.value = value;
                field.dataset.suggestion = value;
            }
        }
        [display, shortName, stableKey, slug].forEach(function (field) {
            field.addEventListener('input', function () { field.dataset.edited = '1'; });
        });
        function updateSuggestions() {
            var sportValue = sport.value.trim();
            var levelValue = level.value.trim();
            var displayValue = sportValue + (levelValue ? ' - ' + levelValue : '');
            var keyValue = slugify(displayValue);
            suggestion(display, displayValue);
            suggestion(shortName, sportValue);
            suggestion(stableKey, keyValue);
            suggestion(slug, keyValue);
        }
        sport.addEventListener('input', updateSuggestions);
        level.addEventListener('input', updateSuggestions);
    });
    </script>
    <?php
}

function wwh_render_sports_team_settings_page(): void
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage sports team settings.', 'weekly-wildcat-headless'));
    }

    $teams = wwh_sports_team_options();
    $selected_team_key = isset($_GET['team']) && is_scalar($_GET['team']) ? wwh_sanitize_sport_key(sanitize_text_field(wp_unslash((string) $_GET['team']))) : '';
    $is_add = $selected_team_key === '' && isset($_GET['add']) && is_scalar($_GET['add']) && !empty($_GET['add']);
    $selected_team = $selected_team_key !== '' && isset($teams[$selected_team_key]) ? byline_get_sports_team($selected_team_key) : null;
    $summaries = !$is_add && function_exists('byline_sports_team_summary_rows') ? byline_sports_team_summary_rows() : [];
    $overview_url = function_exists('wwh_sports_overview_page_url') ? wwh_sports_overview_page_url() : admin_url('edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE . '&page=wwh-sports-overview');
    $current_season = function_exists('byline_sports_current_season') ? byline_sports_current_season() : '';
    $search = isset($_GET['s']) && is_scalar($_GET['s']) ? trim(sanitize_text_field(wp_unslash((string) $_GET['s']))) : '';
    $status_filter = isset($_GET['status']) && is_scalar($_GET['status']) ? sanitize_key((string) wp_unslash($_GET['status'])) : 'all';
    $status_filter = in_array($status_filter, ['all', 'active', 'inactive'], true) ? $status_filter : 'all';
    $team_error = isset($_GET['team_error']) && is_scalar($_GET['team_error']) ? sanitize_text_field(wp_unslash((string) $_GET['team_error'])) : '';
    $integrity_issues = !$selected_team && !$is_add && function_exists('byline_sports_team_integrity_records') ? byline_sports_team_integrity_records() : [];
    ?>
    <div class="wrap wwh-sports-team-settings-page">
        <p class="wwh-sports-breadcrumb"><a href="<?php echo esc_url($overview_url); ?>">&larr; Sports Overview</a> <span aria-hidden="true">/</span> <a href="<?php echo esc_url(wwh_sports_team_settings_url()); ?>">Teams</a></p>
        <div class="wwh-sports-team-page-heading">
            <div>
                <h1><?php echo $is_add ? 'Add Team' : ($selected_team ? esc_html((string) ($selected_team['displayName'] ?? $selected_team['label'] ?? $selected_team_key)) : 'Teams'); ?></h1>
                <?php if ($selected_team) : ?><p class="description"><?php echo esc_html((string) ($selected_team['sport'] ?? '')); ?><?php if (!empty($selected_team['level'])) : ?> · <?php echo esc_html((string) $selected_team['level']); ?><?php endif; ?> · <span class="wwh-sports-team-state <?php echo !empty($selected_team['active']) ? 'is-active' : 'is-inactive'; ?>"><?php echo !empty($selected_team['active']) ? 'Active' : 'Inactive / archived'; ?></span></p><?php endif; ?>
            </div>
            <?php if (!$is_add && !$selected_team) : ?><a class="button button-primary" href="<?php echo esc_url(wwh_sports_team_add_url()); ?>">Add Team</a><?php endif; ?>
        </div>

        <?php if ($team_error !== '') : ?><div class="notice notice-error is-dismissible" role="alert"><p><?php echo esc_html($team_error); ?></p></div><?php endif; ?>
        <?php if (isset($_GET['created'])) : ?><div class="notice notice-success is-dismissible" role="status"><p>Team created. You can now add branding, a roster, and games.</p></div><?php elseif (isset($_GET['archived'])) : ?><div class="notice notice-success is-dismissible" role="status"><p>Team archived. Historical relationships remain available.</p></div><?php elseif (isset($_GET['updated'])) : ?><div class="notice notice-success is-dismissible" role="status"><p>Team updated.</p></div><?php endif; ?>

        <?php if ($is_add) : ?>
            <p class="wwh-sports-back-link"><a href="<?php echo esc_url(wwh_sports_team_settings_url()); ?>">&larr; All teams</a></p>
            <?php wwh_render_sports_team_add_form(); ?>
        <?php elseif ($selected_team) : ?>
            <?php
            $summary = is_array($summaries[$selected_team_key] ?? null) ? $summaries[$selected_team_key] : [];
            $available_seasons = is_array($summary['seasons'] ?? null) ? array_values(array_unique(array_filter(array_map('strval', $summary['seasons'])))) : [];
            if ($current_season !== '' && !in_array($current_season, $available_seasons, true)) {
                array_unshift($available_seasons, $current_season);
            }
            rsort($available_seasons, SORT_STRING);
            $requested_season = isset($_GET['season']) && is_scalar($_GET['season']) ? byline_sports_normalize_season((string) wp_unslash($_GET['season'])) : '';
            $team_season = $requested_season !== '' && in_array($requested_season, $available_seasons, true) ? $requested_season : ($current_season !== '' ? $current_season : ($available_seasons[0] ?? ''));
            $context = function_exists('byline_sports_team_context') ? byline_sports_team_context($selected_team_key, $team_season) : [];
            $context = is_array($context) ? $context : [];
            $season_games = is_array($context['games'] ?? null) ? $context['games'] : [];
            $completed_statuses = ['final', 'forfeit', 'tie'];
            $completed_games = count(array_filter($season_games, static fn($game): bool => is_array($game) && in_array((string) ($game['status'] ?? ''), $completed_statuses, true)));
            $game_count = (int) ($summary['publishedGamesBySeason'][$team_season] ?? $summary['gamesBySeason'][$team_season] ?? 0);
            $roster_count = (int) ($summary['publishedRosterCounts'][$team_season] ?? 0);
            $athlete_count = (int) ($summary['publishedAthletesBySeason'][$team_season] ?? 0);
            $roster_url = $roster_count > 0 ? byline_sports_admin_rosters_url($selected_team_key, $team_season) : byline_sports_admin_new_roster_url($selected_team_key, $team_season);
            $coverage = is_array($context['linkedCoverage'] ?? null) ? $context['linkedCoverage'] : [];
            $team_public_url = byline_sports_public_team_url($selected_team, $team_season);
            ?>
            <p class="wwh-sports-back-link"><a href="<?php echo esc_url(wwh_sports_team_settings_url()); ?>">&larr; All teams</a></p>
            <?php if (empty($selected_team['active'])) : ?><div class="notice notice-info" role="status"><p><strong>Archived team:</strong> this team is hidden from normal current-team workflows, but games, rosters, coverage, and historical public routes remain resolvable.</p></div><?php endif; ?>
            <nav class="wwh-team-section-nav" aria-label="Team management sections"><a href="#wwh-team-overview">Overview</a><a href="#wwh-team-identity">Identity</a><a href="#wwh-team-branding">Branding</a><a href="#wwh-team-related">Related content</a></nav>

            <section id="wwh-team-overview" class="wwh-team-overview" aria-labelledby="wwh-team-overview-heading">
                <div class="wwh-sports-section-heading"><div><h2 id="wwh-team-overview-heading">Overview</h2><p class="description">Relationship summary for <?php echo esc_html($team_season !== '' ? $team_season : 'the current season'); ?>.</p></div><?php if ($available_seasons !== []) : ?><form method="get" action="<?php echo esc_url(admin_url('edit.php')); ?>" class="wwh-team-season-form"><input type="hidden" name="post_type" value="<?php echo esc_attr(WWH_SPORTS_GAME_POST_TYPE); ?>"><input type="hidden" name="page" value="wwh-sports-team-settings"><input type="hidden" name="team" value="<?php echo esc_attr($selected_team_key); ?>"><label for="wwh-team-season">Season</label><select id="wwh-team-season" name="season"><?php foreach ($available_seasons as $available_season) : ?><option value="<?php echo esc_attr($available_season); ?>" <?php selected($available_season, $team_season); ?>><?php echo esc_html($available_season); ?></option><?php endforeach; ?></select><button type="submit" class="button">View season</button></form><?php endif; ?></div>
                <div class="wwh-team-overview-grid">
                    <section class="wwh-team-overview-card"><h3>Roster</h3><strong><?php echo esc_html($roster_count > 0 ? $athlete_count . ' ' . ($athlete_count === 1 ? 'athlete' : 'athletes') : 'Not added'); ?></strong><p><a href="<?php echo esc_url($roster_url); ?>"><?php echo $roster_count > 0 ? 'Edit roster' : 'Add roster'; ?> <span aria-hidden="true">&rarr;</span></a></p></section>
                    <section class="wwh-team-overview-card"><h3>Games</h3><strong><?php echo esc_html($game_count . ' scheduled · ' . $completed_games . ' completed'); ?></strong><p><a href="<?php echo esc_url(byline_sports_admin_games_url($selected_team_key, $team_season)); ?>">View <?php echo esc_html($team_season); ?> games <span aria-hidden="true">&rarr;</span></a> · <a href="<?php echo esc_url(byline_sports_admin_new_game_url($selected_team_key, $team_season)); ?>">Add game</a></p></section>
                    <section class="wwh-team-overview-card"><h3>Recent result</h3><strong><?php echo !empty($context['previousGame']) ? esc_html(wwh_sports_team_index_game_label($context['previousGame'], true)) : 'No completed result'; ?></strong><p><?php echo !empty($context['previousGame']) ? esc_html($team_season) : 'Results appear here after a final game is recorded.'; ?></p></section>
                    <section class="wwh-team-overview-card"><h3>Next game</h3><strong><?php echo !empty($context['nextGame']) ? esc_html(wwh_sports_team_index_game_label($context['nextGame'])) : 'Not scheduled'; ?></strong><p><?php echo !empty($context['nextGame']) ? esc_html($team_season) : 'Add a game to build the schedule.'; ?></p></section>
                    <section id="wwh-team-related" class="wwh-team-overview-card"><h3>Linked coverage</h3><strong><?php echo esc_html(count($coverage) . ' ' . (count($coverage) === 1 ? 'story' : 'stories')); ?></strong><p><?php echo $coverage !== [] ? 'Recent articles linked to this team’s games are listed below.' : 'Link a game from an article to surface coverage here.'; ?></p></section>
                    <section class="wwh-team-overview-card"><h3>Public page</h3><strong><?php echo $team_public_url !== '' ? 'Published route available' : 'Route pending'; ?></strong><p><?php if ($team_public_url !== '') : ?><a href="<?php echo esc_url($team_public_url); ?>" target="_blank" rel="noopener">View public page <span aria-hidden="true">&rarr;</span></a><?php else : ?>Set a valid public slug in Identity.<?php endif; ?></p></section>
                </div>
            </section>

            <?php if ($coverage !== []) : ?><section class="wwh-sports-context-coverage" aria-labelledby="wwh-team-coverage-heading"><h2 id="wwh-team-coverage-heading">Recent linked coverage</h2><ul><?php foreach ($coverage as $coverage_item) : ?><li><a href="<?php echo esc_url((string) ($coverage_item['editUrl'] ?? $coverage_item['url'] ?? '')); ?>"><?php echo esc_html((string) ($coverage_item['title'] ?? 'Untitled story')); ?></a></li><?php endforeach; ?></ul></section><?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="wwh-sports-team-form wwh-sports-team-edit-form" onsubmit="var active=this.querySelector('input[name=\'identity[active]\']'); return !active || active.checked || window.confirm('Archive this team? Historical games, rosters, coverage, and public routes will be preserved.');">
                <?php wp_nonce_field('wwh_update_sports_team', 'wwh_update_sports_team_nonce'); ?>
                <input type="hidden" name="action" value="wwh_update_sports_team">
                <input type="hidden" name="team_key" value="<?php echo esc_attr($selected_team_key); ?>">
                <div class="wwh-team-settings-grid"><?php wwh_render_sports_team_settings_card($selected_team_key, $selected_team, wwh_sports_team_settings()); ?></div>
                <p class="submit"><button type="submit" class="button button-primary">Save team</button> <a class="button" href="<?php echo esc_url(wwh_sports_team_settings_url()); ?>">Back to teams</a></p>
            </form>
        <?php else : ?>
            <?php
            $filtered_teams = [];
            foreach ($teams as $team_key => $team) {
                $haystack = strtolower(implode(' ', array_map(static fn($value): string => is_scalar($value) ? (string) $value : '', [$team_key, $team['displayName'] ?? '', $team['sport'] ?? '', $team['level'] ?? '', $team['genderDivision'] ?? ''])));
                if ($search !== '' && strpos($haystack, strtolower($search)) === false) {
                    continue;
                }
                if ($status_filter === 'active' && empty($team['active'])) {
                    continue;
                }
                if ($status_filter === 'inactive' && !empty($team['active'])) {
                    continue;
                }
                $filtered_teams[$team_key] = $team;
            }
            $active_teams = array_filter($filtered_teams, static fn(array $team): bool => !empty($team['active']));
            $inactive_teams = array_filter($filtered_teams, static fn(array $team): bool => empty($team['active']));
            uasort($active_teams, static fn(array $left, array $right): int => strcasecmp((string) ($left['displayName'] ?? ''), (string) ($right['displayName'] ?? '')));
            uasort($inactive_teams, static fn(array $left, array $right): int => strcasecmp((string) ($left['displayName'] ?? ''), (string) ($right['displayName'] ?? '')));
            ?>
            <p class="description">Search and manage one team at a time. Games, rosters, relationships, and media are summarized here; detailed editors load only after you choose a team.</p>
            <?php if ($integrity_issues !== []) : ?><div class="notice notice-warning" role="status"><p><strong>Some historical team records need review.</strong> The valid records remain available below; review Sports health diagnostics before repairing malformed data.</p></div><?php endif; ?>
            <form method="get" action="<?php echo esc_url(admin_url('edit.php')); ?>" class="wwh-sports-team-filters"><input type="hidden" name="post_type" value="<?php echo esc_attr(WWH_SPORTS_GAME_POST_TYPE); ?>"><input type="hidden" name="page" value="wwh-sports-team-settings"><label for="wwh-sports-team-search">Search teams</label><input type="search" id="wwh-sports-team-search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Search by name, sport, level, or key"><label for="wwh-sports-team-status">Show</label><select id="wwh-sports-team-status" name="status"><option value="all" <?php selected($status_filter, 'all'); ?>>Active and inactive</option><option value="active" <?php selected($status_filter, 'active'); ?>>Active only</option><option value="inactive" <?php selected($status_filter, 'inactive'); ?>>Inactive only</option></select><button type="submit" class="button">Filter</button><?php if ($search !== '' || $status_filter !== 'all') : ?><a class="button-link" href="<?php echo esc_url(wwh_sports_team_settings_url()); ?>">Clear</a><?php endif; ?></form>
            <section class="wwh-sports-team-list" aria-labelledby="wwh-sports-team-active-heading"><div class="wwh-sports-section-heading"><h2 id="wwh-sports-team-active-heading">Active</h2><span class="description"><?php echo esc_html(count($active_teams) . ' ' . (count($active_teams) === 1 ? 'team' : 'teams')); ?></span></div><?php if ($active_teams === []) : ?><div class="notice notice-info inline"><p>No active teams match this filter.</p></div><?php else : ?><?php wwh_render_sports_team_index_table($active_teams, $summaries, $current_season); ?><?php endif; ?></section>
            <section class="wwh-sports-team-list" aria-labelledby="wwh-sports-team-inactive-heading"><details <?php echo $status_filter === 'inactive' ? 'open' : ''; ?>><summary><span class="wwh-team-settings-section-title" id="wwh-sports-team-inactive-heading">Inactive / archived</span><span class="description"><?php echo esc_html(count($inactive_teams) . ' ' . (count($inactive_teams) === 1 ? 'archived team' : 'archived teams')); ?></span></summary><?php if ($inactive_teams === []) : ?><p class="description">No inactive teams match this filter.</p><?php else : ?><?php wwh_render_sports_team_index_table($inactive_teams, $summaries, $current_season); ?><?php endif; ?></details></section>
            <?php if ($integrity_issues !== [] && function_exists('byline_admin_page_urls')) : ?><p class="description"><a href="<?php echo esc_url(byline_admin_page_urls()['settings']['diagnostics']); ?>">Review Sports health diagnostics &rarr;</a></p><?php endif; ?>
        <?php endif; ?>
    </div>
    <?php
}

function wwh_sports_team_post_array(string $key): array
{
    return isset($_POST[$key]) && is_array($_POST[$key]) ? wp_unslash($_POST[$key]) : [];
}

function wwh_sports_team_redirect(array $args = [], string $team_key = ''): void
{
    $url = byline_sports_team_settings_url();
    $team_key = sanitize_key($team_key);
    if ($team_key !== '') {
        $url = add_query_arg(['team' => $team_key], $url);
    }
    wp_safe_redirect(add_query_arg($args, $url));
    exit;
}

function wwh_sports_team_result_error($result): string
{
    if (is_wp_error($result)) {
        return $result->get_error_message();
    }

    return 'The team could not be saved. Please review the fields and try again.';
}

function wwh_sports_team_update_from_request(string $team_key, array $identity, array $presentation)
{
    $identity_changes = [];
    foreach (['sport', 'displayName', 'shortName', 'scoreboardName', 'level', 'genderDivision', 'slug'] as $field) {
        if (array_key_exists($field, $identity)) {
            $identity_changes[$field] = $identity[$field];
        }
    }
    // An unchecked checkbox is intentionally submitted as false by omission.
    $identity_changes['active'] = !empty($identity['active']);
    $result = byline_update_sports_team($team_key, $identity_changes);
    if (is_wp_error($result)) {
        return $result;
    }

    if ($presentation !== []) {
        $result = byline_update_sports_team_presentation($team_key, $presentation);
        if (is_wp_error($result)) {
            return $result;
        }
    }

    return byline_get_sports_team($team_key);
}

function wwh_update_sports_team(): void
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage sports team settings.', 'weekly-wildcat-headless'));
    }
    check_admin_referer('wwh_update_sports_team', 'wwh_update_sports_team_nonce');

    $team_key = isset($_POST['team_key']) && is_scalar($_POST['team_key']) ? sanitize_key((string) wp_unslash($_POST['team_key'])) : '';
    $before = byline_get_sports_team($team_key);
    $result = wwh_sports_team_update_from_request($team_key, wwh_sports_team_post_array('identity'), wwh_sports_team_post_array('presentation'));
    if (is_wp_error($result)) {
        wwh_sports_team_redirect(['team_error' => $result->get_error_message(), 'section' => 'identity'], $team_key);
    }

    wwh_schedule_cloudflare_deploy();
    wwh_sports_team_redirect(['updated' => 'true'] + (is_array($before) && !empty($before['active']) && empty($result['active']) ? ['archived' => 'true'] : []), $team_key);
}

function wwh_create_sports_team(): void
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage sports team settings.', 'weekly-wildcat-headless'));
    }
    check_admin_referer('wwh_create_sports_team', 'wwh_create_sports_team_nonce');

    $result = byline_create_sports_team(wwh_sports_team_post_array('team'));
    if (is_wp_error($result)) {
        wwh_sports_team_redirect(['add' => '1', 'team_error' => $result->get_error_message()]);
    }

    wwh_schedule_cloudflare_deploy();
    wwh_sports_team_redirect(['created' => 'true'], (string) ($result['key'] ?? ''));
}

/**
 * Compatibility endpoint for old bookmarked forms. New UI never submits the
 * registry as a collection, but old POSTs are reduced to one deliberate
 * create/update operation so they cannot reintroduce bulk browser state.
 */
function wwh_save_sports_team_settings(): void
{
    if (!current_user_can(BYLINE_MANAGE_CAPABILITY)) {
        wp_die(esc_html__('Sorry, you are not allowed to manage sports team settings.', 'weekly-wildcat-headless'));
    }

    check_admin_referer('wwh_save_sports_team_settings', 'wwh_sports_team_settings_nonce');

    $raw_new_team = wwh_sports_team_post_array('newTeam');
    $new_key = $raw_new_team['key'] ?? '';
    $new_display_name = $raw_new_team['displayName'] ?? '';
    $has_new_team = (is_scalar($new_key) && trim((string) $new_key) !== '')
        || (is_scalar($new_display_name) && trim((string) $new_display_name) !== '');
    if ($has_new_team) {
        $result = byline_create_sports_team($raw_new_team);
        if (is_wp_error($result)) {
            wwh_sports_team_redirect(['add' => '1', 'team_error' => $result->get_error_message()]);
        }
        wwh_schedule_cloudflare_deploy();
        wwh_sports_team_redirect(['created' => 'true'], (string) ($result['key'] ?? ''));
    }

    $raw_teams = isset($_POST['teams']) && is_array($_POST['teams']) ? wp_unslash($_POST['teams']) : [];
    $context_key = isset($_POST['team_context_key']) && is_scalar($_POST['team_context_key']) ? sanitize_key((string) wp_unslash($_POST['team_context_key'])) : '';
    if ($context_key === '' && count($raw_teams) === 1) {
        $context_key = sanitize_key((string) array_key_first($raw_teams));
    }
    $raw_team = is_array($raw_teams[$context_key] ?? null) ? $raw_teams[$context_key] : [];
    if ($context_key === '' || $raw_team === []) {
        wwh_sports_team_redirect(['team_error' => 'Select a team before saving.']);
    }

    $identity = $raw_team;
    $presentation = [];
    foreach (['headerImageId', 'logoId', 'accentColor', 'headerFocalX', 'headerFocalY'] as $field) {
        if (array_key_exists($field, $raw_team)) {
            $presentation[$field] = $raw_team[$field];
        }
    }
    $result = wwh_sports_team_update_from_request($context_key, $identity, $presentation);
    if (is_wp_error($result)) {
        wwh_sports_team_redirect(['team_error' => wwh_sports_team_result_error($result)], $context_key);
    }
    wwh_schedule_cloudflare_deploy();
    wwh_sports_team_redirect(['updated' => 'true'], $context_key);
}

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
            'show_ui' => true,
            'show_in_menu' => byline_admin_feature_enabled('sports'),
            'menu_position' => BYLINE_MENU_POSITION_SPORTS,
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
    $asset_path = __DIR__ . '/assets/game-linking.js';
    $version = file_exists($asset_path) ? (string) filemtime($asset_path) : '0.1.16';

    wp_register_script(
        'wwh-game-linking-editor',
        plugins_url('assets/game-linking.js', __FILE__),
        [
            'wp-api-fetch',
            'wp-block-editor',
            'wp-blocks',
            'wp-components',
            'wp-core-data',
            'wp-data',
            'wp-edit-post',
            'wp-element',
            'wp-i18n',
            'wp-plugins',
        ],
        $version,
        true
    );

    wp_localize_script(
        'wwh-game-linking-editor',
        'wwhGameLinking',
        [
            'primaryGameMetaKey' => WWH_PRIMARY_GAME_META,
            'restNamespace' => WWH_REST_NAMESPACE,
        ]
    );

    register_block_type('weekly-wildcat/game-embed', [
        'api_version' => 2,
        'title' => 'Byline Game Embed',
        'category' => 'widgets',
        'icon' => 'awards',
        'description' => 'Embed a live Byline sports game card by storing only the selected game ID.',
        'editor_script' => 'wwh-game-linking-editor',
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

function wwh_register_legacy_settings_page(): void
{
    add_options_page(
        'Byline Legacy Integration Settings',
        'Byline Legacy Settings',
        'manage_options',
        'wwh-settings',
        'wwh_render_settings_page'
    );
}

function wwh_register_admin_pages(): void
{
    // Without the Sports feature there is no Sports menu to hang these on.
    // Callbacks keep their own capability checks regardless.
    if (!byline_admin_feature_enabled('sports')) {
        wwh_register_legacy_settings_page();
        return;
    }

    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Sports Overview',
        'Overview',
        'edit_posts',
        'wwh-sports-overview',
        'wwh_render_sports_overview_page'
    );

    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Import Sports Games',
        'Import',
        'edit_others_posts',
        'wwh-sports-import',
        'wwh_render_sports_import_page'
    );

    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Export Sports Games',
        'Export',
        'edit_posts',
        'wwh-sports-export',
        'wwh_render_sports_export_page'
    );

    add_submenu_page(
        'edit.php?post_type=' . WWH_SPORTS_GAME_POST_TYPE,
        'Sports Team Settings',
        'Teams',
        BYLINE_MANAGE_CAPABILITY,
        'wwh-sports-team-settings',
        'wwh_render_sports_team_settings_page'
    );

    wwh_register_legacy_settings_page();
}
add_action('admin_menu', 'wwh_register_admin_pages');
add_action('admin_post_wwh_export_sports_games', 'wwh_export_sports_games');
add_action('admin_post_wwh_update_sports_team', 'wwh_update_sports_team');
add_action('admin_post_wwh_create_sports_team', 'wwh_create_sports_team');
add_action('admin_post_wwh_save_sports_team_settings', 'wwh_save_sports_team_settings');

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
add_action('transition_post_status', 'wwh_maybe_schedule_cloudflare_deploy_for_transition', 10, 3);

function wwh_maybe_schedule_cloudflare_deploy_for_delete(int $post_id): void
{
    $post = get_post($post_id);

    if (!$post instanceof WP_Post || $post->post_status !== 'publish' || !wwh_is_cloudflare_deploy_content_post($post)) {
        return;
    }

    wwh_schedule_cloudflare_deploy();
}
add_action('before_delete_post', 'wwh_maybe_schedule_cloudflare_deploy_for_delete');

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

function wwh_sports_game_admin_columns(array $columns): array
{
    return [
        'cb' => $columns['cb'] ?? '<input type="checkbox">',
        'title' => 'Game',
        'wwh_sport' => 'Team',
        'wwh_opponent' => 'Opponent',
        'wwh_start' => 'Date / Time',
        'wwh_season' => 'Season',
        'wwh_site' => 'Site',
        'wwh_location' => 'Location',
        'wwh_status' => 'Status',
        'wwh_score' => 'Score',
        'wwh_recap' => 'Recap',
    ];
}
add_filter('manage_' . WWH_SPORTS_GAME_POST_TYPE . '_posts_columns', 'wwh_sports_game_admin_columns');

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
    if (get_post_type($post_id) === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_render_sports_game_admin_column($column, $post_id);
        return;
    }

    if (get_post_type($post_id) === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_column($column, $post_id);
    }
}
add_action('manage_' . WWH_SPORTS_GAME_POST_TYPE . '_posts_custom_column', 'wwh_render_admin_column', 10, 2);
add_action('manage_' . WWH_SCHOOL_EVENT_POST_TYPE . '_posts_custom_column', 'wwh_render_admin_column', 10, 2);

function wwh_render_sports_game_admin_column(string $column, int $post_id): void
{
    if ($column === 'wwh_sport') {
        $sport_key = wwh_meta_value($post_id, '_ww_sport_key');
        $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
        $label = $sport_option['label'] ?? wwh_meta_value($post_id, '_ww_sport', '—');
        if ($sport_key !== '') {
            printf('<a href="%s">%s</a>', esc_url(wwh_sports_team_settings_url($sport_key)), esc_html($label));
        } else {
            echo esc_html($label);
        }
        return;
    }

    if ($column === 'wwh_opponent') {
        echo esc_html(wwh_meta_value($post_id, '_ww_opponent', '—'));
        return;
    }

    if ($column === 'wwh_start') {
        echo esc_html(wwh_admin_datetime_label(wwh_meta_value($post_id, '_ww_start_datetime')));
        return;
    }

    if ($column === 'wwh_season') {
        $start = wwh_meta_value($post_id, '_ww_start_datetime');
        echo esc_html(wwh_sports_game_season($post_id, $start) ?: '—');
        return;
    }

    if ($column === 'wwh_site') {
        echo esc_html(wwh_label_from_value(wwh_meta_value($post_id, '_ww_site', 'home')));
        return;
    }

    if ($column === 'wwh_location') {
        echo esc_html(wwh_meta_value($post_id, '_ww_location_name', wwh_meta_value($post_id, '_ww_location', '—')));
        return;
    }

    if ($column === 'wwh_status') {
        echo esc_html(wwh_label_from_value(wwh_effective_game_status(wwh_meta_value($post_id, '_ww_game_status', 'upcoming'), wwh_meta_value($post_id, '_ww_start_datetime'))));
        return;
    }

    if ($column === 'wwh_score') {
        $wildcats_score = wwh_meta_value($post_id, '_ww_wildcats_score');
        $opponent_score = wwh_meta_value($post_id, '_ww_opponent_score');
        echo esc_html($wildcats_score !== '' && $opponent_score !== '' ? sprintf('%s-%s', $wildcats_score, $opponent_score) : '—');
        return;
    }

    if ($column === 'wwh_recap') {
        $coverage = function_exists('byline_sports_linked_coverage') ? byline_sports_linked_coverage($post_id, 1) : [];
        if ($coverage !== []) {
            printf('<a href="%s">%s</a>', esc_url((string) ($coverage[0]['editUrl'] ?? '')), esc_html((string) ($coverage[0]['title'] ?? 'View recap')));
        } else {
            $recap_url = wwh_meta_value($post_id, '_ww_recap_url');
            echo $recap_url !== '' ? '<a href="' . esc_url($recap_url) . '">External recap</a>' : '—';
        }
    }
}

function wwh_sports_game_row_actions(array $actions, WP_Post $post): array
{
    if ($post->post_type !== WWH_SPORTS_GAME_POST_TYPE) {
        return $actions;
    }

    $team_key = wwh_sanitize_sport_key(wwh_meta_value($post->ID, '_ww_sport_key'));
    $season = wwh_sports_game_season($post->ID, wwh_meta_value($post->ID, '_ww_start_datetime'));
    if ($team_key !== '') {
        $actions['view_team'] = sprintf('<a href="%s">View Team</a>', esc_url(wwh_sports_team_settings_url($team_key)));
        $actions['view_schedule'] = sprintf('<a href="%s">View Schedule</a>', esc_url(byline_sports_admin_games_url($team_key, $season)));
    }
    $coverage = function_exists('byline_sports_linked_coverage') ? byline_sports_linked_coverage($post->ID, 1) : [];
    if ($coverage !== []) {
        $actions['recap'] = sprintf('<a href="%s">View Recap</a>', esc_url((string) ($coverage[0]['editUrl'] ?? '')));
    } else {
        $recap_url = wwh_meta_value($post->ID, '_ww_recap_url');
        if ($recap_url !== '') {
            $actions['recap'] = sprintf('<a href="%s" target="_blank" rel="noopener">External Recap</a>', esc_url($recap_url));
        }
    }

    return $actions;
}
add_filter('post_row_actions', 'wwh_sports_game_row_actions', 10, 2);

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
add_filter('manage_edit-' . WWH_SPORTS_GAME_POST_TYPE . '_sortable_columns', 'wwh_sortable_admin_columns');
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
    if ($post_type === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_render_sports_game_admin_filters();
        return;
    }

    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_render_school_event_admin_filters();
    }
}
add_action('restrict_manage_posts', 'wwh_render_admin_filters');

function wwh_render_sports_game_admin_filters(): void
{
    $sport_key = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_sport_key'));
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_game_status'), wwh_sports_game_status_values(), '');
    $site = wwh_sanitize_choice(wwh_admin_filter_value('wwh_site'), ['home', 'away', 'neutral'], '');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_date_state'), ['known', 'unknown'], '');
    $season = wwh_normalize_sports_season_value(wwh_admin_filter_value('wwh_season'));

    echo '<select name="wwh_sport_key">';
    echo '<option value="">All sports / teams</option>';
    foreach (wwh_sports_team_options() as $key => $option) {
        printf(
            '<option value="%s"%s>%s</option>',
            esc_attr($key),
            selected($sport_key, $key, false),
            esc_html($option['label'])
        );
    }
    echo '</select>';

    wwh_admin_filter_select('wwh_game_status', $status, 'All statuses', wwh_sports_game_status_options());

    $season_options = [];
    foreach (byline_sports_available_seasons() as $available_season) {
        $season_options[$available_season] = $available_season;
    }
    wwh_admin_filter_select('wwh_season', $season, 'All seasons', $season_options);

    wwh_admin_filter_select('wwh_site', $site, 'All sites', [
        'home' => 'Home',
        'away' => 'Away',
        'neutral' => 'Neutral',
    ]);

    wwh_admin_filter_select('wwh_date_state', $date_state, 'Any date/time', [
        'known' => 'Known date/time',
        'unknown' => 'Unknown date/time',
    ]);
}

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

    if ($post_type === WWH_SPORTS_GAME_POST_TYPE) {
        wwh_filter_sports_game_admin_posts($query);
        return;
    }

    if ($post_type === WWH_SCHOOL_EVENT_POST_TYPE) {
        wwh_filter_school_event_admin_posts($query);
    }
}
add_action('pre_get_posts', 'wwh_filter_admin_posts');

function wwh_filter_sports_game_admin_posts(WP_Query $query): void
{
    $meta_query = wwh_admin_meta_query($query);
    $sport_key = wwh_sanitize_sport_key(wwh_admin_filter_value('wwh_sport_key'));
    $status = wwh_sanitize_choice(wwh_admin_filter_value('wwh_game_status'), wwh_sports_game_status_values(), '');
    $site = wwh_sanitize_choice(wwh_admin_filter_value('wwh_site'), ['home', 'away', 'neutral'], '');
    $date_state = wwh_sanitize_choice(wwh_admin_filter_value('wwh_date_state'), ['known', 'unknown'], '');
    $season = wwh_normalize_sports_season_value(wwh_admin_filter_value('wwh_season'));

    if ($sport_key !== '') {
        $meta_query[] = ['key' => '_ww_sport_key', 'value' => $sport_key];
    }

    if ($status !== '') {
        $meta_query[] = ['key' => '_ww_game_status', 'value' => $status];
    }

    if ($site !== '') {
        $meta_query[] = ['key' => '_ww_site', 'value' => $site];
    }

    wwh_add_date_state_meta_query($meta_query, '_ww_start_datetime', $date_state);
    wwh_apply_admin_meta_query($query, $meta_query);

    if ($season !== '') {
        $season_ids = byline_sports_game_ids_for_season($season, '', false);
        $existing_ids = $query->get('post__in');
        if (is_array($existing_ids) && $existing_ids !== []) {
            $season_ids = array_values(array_intersect(array_map('absint', $existing_ids), $season_ids));
        }
        $query->set('post__in', $season_ids !== [] ? $season_ids : [0]);
    }

    $orderby = (string) $query->get('orderby');

    if ($orderby === 'wwh_sport') {
        wwh_set_admin_meta_sort($query, '_ww_sport', 'meta_value');
    } elseif ($orderby === 'wwh_opponent') {
        wwh_set_admin_meta_sort($query, '_ww_opponent', 'meta_value');
    } elseif ($orderby === 'wwh_start') {
        wwh_set_admin_meta_sort($query, '_ww_start_datetime', 'meta_value');
    } elseif ($orderby === 'wwh_status') {
        wwh_set_admin_meta_sort($query, '_ww_game_status', 'meta_value');
    }
}

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
        'wwh_sports_game_details',
        'Game Details',
        'wwh_render_sports_game_meta_box',
        WWH_SPORTS_GAME_POST_TYPE,
        'normal',
        'high'
    );

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

function wwh_render_sports_game_meta_box(WP_Post $post): void
{
    wp_nonce_field('wwh_save_sports_game', 'wwh_sports_game_nonce');
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_key = $sport_key !== '' ? $sport_key : wwh_infer_sport_key(wwh_meta_value($post->ID, '_ww_sport'), wwh_meta_value($post->ID, '_ww_level'));
    if ($sport_key === '' && isset($_GET['wwh_sport_key'])) {
        $sport_key = wwh_sanitize_sport_key(sanitize_text_field(wp_unslash($_GET['wwh_sport_key'])));
    }
    $context_season = wwh_sports_game_season($post->ID, wwh_meta_value($post->ID, '_ww_start_datetime'));
    if ($context_season === '' && isset($_GET['wwh_season'])) {
        $context_season = wwh_normalize_sports_season_value(sanitize_text_field(wp_unslash($_GET['wwh_season'])));
    }
    $team_options = ['' => 'Select a sport / team'];

    foreach (wwh_sports_team_options() as $key => $option) {
        $team_options[$key] = $option['label'];
    }

    echo '<div class="wwh-fields">';
    wwh_select('Sport / Team', 'ww_sport_key', $sport_key, $team_options);
    if ($sport_key !== '') {
        $team = wwh_sports_team_options()[$sport_key] ?? [];
        $team_label = (string) ($team['displayName'] ?? $team['label'] ?? $sport_key);
        $public_url = function_exists('byline_sports_public_team_url') ? byline_sports_public_team_url($sport_key, $context_season) : '';
        $summary = function_exists('byline_sports_team_summary') ? byline_sports_team_summary($sport_key) : [];
        $roster_count = (int) ($summary['publishedRosterCounts'][$context_season] ?? 0);
        $athlete_count = (int) ($summary['publishedAthletesBySeason'][$context_season] ?? 0);
        $roster_url = $roster_count > 0
            ? byline_sports_admin_rosters_url($sport_key, $context_season)
            : byline_sports_admin_new_roster_url($sport_key, $context_season);
        echo '<div class="wwh-sports-context wwh-game-team-context">';
        printf('<p><strong>Team:</strong> %s%s</p>', esc_html($team_label), $context_season !== '' ? ' · ' . esc_html($context_season) : '');
        if (($team['active'] ?? true) === false) {
            echo '<p class="notice inline notice-info"><strong>Historical team:</strong> this team is inactive, but its games remain connected for archive history.</p>';
        }
        echo '<p class="description">';
        printf('<a href="%s">View team schedule</a>', esc_url(byline_sports_admin_games_url($sport_key, $context_season)));
        printf(' · <a href="%s">%s</a>', esc_url($roster_url), $roster_count > 0 ? esc_html('View roster (' . $athlete_count . ' athletes)') : esc_html('Add roster'));
        if ($public_url !== '') {
            printf(' · <a href="%s" target="_blank" rel="noopener">Public team page</a>', esc_url($public_url));
        }
        echo '</p>';
        $linked_coverage = function_exists('byline_sports_linked_coverage') ? byline_sports_linked_coverage((int) $post->ID, 3) : [];
        if ($linked_coverage !== []) {
            echo '<p><strong>Linked coverage:</strong></p><ul class="wwh-sports-linked-coverage">';
            foreach ($linked_coverage as $coverage) {
                $coverage_url = (string) ($coverage['editUrl'] ?? $coverage['url'] ?? '');
                printf(
                    '<li><a href="%s">%s</a></li>',
                    esc_url($coverage_url),
                    esc_html((string) ($coverage['title'] ?? 'Untitled story'))
                );
            }
            echo '</ul>';
        } elseif (wwh_meta_value($post->ID, '_ww_recap_url') !== '') {
            printf(
                '<p><strong>External recap:</strong> <a href="%s" target="_blank" rel="noopener">View recap</a></p>',
                esc_url(wwh_meta_value($post->ID, '_ww_recap_url'))
            );
        } else {
            echo '<p class="description">No article is linked to this game yet. Link the game from the article editor when a recap is published.</p>';
        }
        echo '</div>';
    }
    wwh_field('Opponent', 'ww_opponent', wwh_meta_value($post->ID, '_ww_opponent'));
    wwh_select('Home / Away / Neutral', 'ww_site', wwh_meta_value($post->ID, '_ww_site', 'home'), [
        'home' => 'Home',
        'away' => 'Away',
        'neutral' => 'Neutral',
    ]);
    wwh_field('Location Name', 'ww_location_name', wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location')));
    wwh_field('Location Address', 'ww_location_address', wwh_meta_value($post->ID, '_ww_location_address'), 'text', ['placeholder' => byline_get_publication_config()['location']['address']]);
    wwh_field('Latitude', 'ww_location_latitude', wwh_meta_value($post->ID, '_ww_location_latitude'), 'text', ['inputmode' => 'decimal', 'placeholder' => '34.1750']);
    wwh_field('Longitude', 'ww_location_longitude', wwh_meta_value($post->ID, '_ww_location_longitude'), 'text', ['inputmode' => 'decimal', 'placeholder' => '-82.0240']);
    wwh_field('Apple Maps Place ID', 'ww_location_apple_maps_id', wwh_meta_value($post->ID, '_ww_location_apple_maps_id'));
    wwh_field('Start Date / Time', 'ww_start_datetime', wwh_meta_value($post->ID, '_ww_start_datetime'), 'datetime-local');
    wwh_select('Status', 'ww_game_status', wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), wwh_sports_game_status_options());
    wwh_field('Publication Team Score', 'ww_wildcats_score', wwh_meta_value($post->ID, '_ww_wildcats_score'), 'number', ['min' => '0']);
    wwh_field('Opponent Score', 'ww_opponent_score', wwh_meta_value($post->ID, '_ww_opponent_score'), 'number', ['min' => '0']);
    wwh_field('Recap URL', 'ww_recap_url', wwh_meta_value($post->ID, '_ww_recap_url'), 'url');
    wwh_textarea('Notes', 'ww_notes', wwh_meta_value($post->ID, '_ww_notes'));
    echo '</div>';
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

function wwh_save_sports_game(int $post_id): void
{
    if (!wwh_can_save_post($post_id, 'wwh_sports_game_nonce', 'wwh_save_sports_game')) {
        return;
    }

    $sport_key = wwh_sanitize_sport_key(wwh_request_value('ww_sport_key'));
    $sport_option = $sport_key !== '' ? wwh_sports_team_options()[$sport_key] : null;
    $start_datetime = wwh_sanitize_datetime(wwh_request_value('ww_start_datetime'));
    $existing_season = wwh_meta_value($post_id, '_ww_import_season');
    // Manual edits do not expose a separate season field: a readable date is
    // authoritative and must cross the July boundary consistently with the
    // importer and public archive. Preserve an imported season only for TBA
    // games that have no date from which to derive one.
    $season = $start_datetime !== ''
        ? byline_sports_season_for_date($start_datetime)
        : byline_sports_normalize_season($existing_season);

    wwh_update_meta($post_id, '_ww_sport_key', $sport_key);
    wwh_update_meta($post_id, '_ww_sport', $sport_option['sport'] ?? '');
    wwh_update_meta($post_id, '_ww_level', $sport_option['level'] ?? '');
    wwh_update_meta($post_id, '_ww_team_label', $sport_option['teamLabel'] ?? '');
    wwh_update_meta($post_id, '_ww_opponent', wwh_request_value('ww_opponent'));
    wwh_update_meta($post_id, '_ww_site', wwh_sanitize_choice(wwh_request_value('ww_site'), ['home', 'away', 'neutral'], 'home'));
    wwh_update_meta($post_id, '_ww_location_name', wwh_request_value('ww_location_name'));
    wwh_update_meta($post_id, '_ww_location', wwh_request_value('ww_location_name'));
    wwh_update_meta($post_id, '_ww_location_address', wwh_request_value('ww_location_address'));
    wwh_update_meta($post_id, '_ww_location_latitude', wwh_sanitize_coordinate(wwh_request_value('ww_location_latitude'), -90, 90));
    wwh_update_meta($post_id, '_ww_location_longitude', wwh_sanitize_coordinate(wwh_request_value('ww_location_longitude'), -180, 180));
    wwh_update_meta($post_id, '_ww_location_apple_maps_id', wwh_request_value('ww_location_apple_maps_id'));
    wwh_update_meta($post_id, '_ww_start_datetime', $start_datetime);
    // `_ww_import_season` is the legacy storage slot, but its value is now
    // kept canonical so manual date edits and imports use the same school year.
    wwh_update_meta($post_id, '_ww_import_season', $season);
    wwh_update_meta($post_id, '_ww_game_status', wwh_sanitize_choice(wwh_request_value('ww_game_status'), wwh_sports_game_status_values(), 'upcoming'));
    wwh_update_score_meta($post_id, '_ww_wildcats_score', wwh_request_value('ww_wildcats_score'));
    wwh_update_score_meta($post_id, '_ww_opponent_score', wwh_request_value('ww_opponent_score'));
    wwh_update_meta($post_id, '_ww_recap_url', esc_url_raw(wwh_request_value('ww_recap_url')));
    wwh_update_meta($post_id, '_ww_notes', wwh_request_textarea('ww_notes'));
}
add_action('save_post_' . WWH_SPORTS_GAME_POST_TYPE, 'wwh_save_sports_game');

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

function wwh_render_sports_import_page(): void
{
    if (!wwh_can_manage_bulk_sports_data()) {
        wp_die(esc_html__('Sorry, you are not allowed to import sports games.', 'weekly-wildcat-headless'));
    }

    $result = null;
    $preview = null;
    $reset_result = null;
    $selected_sport_key = isset($_GET['ww_sport_key']) ? wwh_sanitize_sport_key(sanitize_text_field(wp_unslash((string) $_GET['ww_sport_key']))) : '';
    $import_data = '';

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['wwh_sports_import_action'])) {
        $action = sanitize_text_field(wp_unslash((string) $_POST['wwh_sports_import_action']));

        if ($action === 'reset') {
            check_admin_referer('wwh_reset_sports_games', 'wwh_sports_reset_nonce');
            $reset_result = wwh_reset_sports_games();
        } else {
            check_admin_referer('wwh_import_sports_games', 'wwh_sports_import_nonce');

            $selected_sport_key = wwh_sanitize_sport_key(wwh_request_value('ww_sport_key'));
            $import_data = isset($_POST['wwh_import_data']) ? (string) wp_unslash($_POST['wwh_import_data']) : '';

            if (trim($import_data) === '' && isset($_FILES['wwh_import_file']['tmp_name'], $_FILES['wwh_import_file']['error']) && $_FILES['wwh_import_file']['error'] === UPLOAD_ERR_OK) {
                $uploaded = file_get_contents((string) $_FILES['wwh_import_file']['tmp_name']);
                $import_data = is_string($uploaded) ? $uploaded : '';
            }

            $preview = wwh_preview_sports_games($selected_sport_key, $import_data);

            if ($action === 'commit') {
                if (!isset($_POST['wwh_import_confirm'])) {
                    $preview['errors'][] = 'Review the dry-run preview and confirm the import before saving games.';
                } elseif ($preview['valid'] > 0) {
                    $result = wwh_import_sports_games($selected_sport_key, $import_data);
                    $preview = null;
                    $import_data = '';
                }
            }
        }
    }

    $team_options = ['' => 'Select a sport / team'];

    foreach (wwh_sports_team_options() as $key => $option) {
        $team_options[$key] = $option['label'];
    }

    ?>
    <div class="wrap wwh-import-page">
        <h1>Import Sports Games</h1>
        <?php if (is_array($result)) : ?>
            <div class="notice <?php echo $result['errors'] === [] ? 'notice-success' : 'notice-warning'; ?> is-dismissible">
                <p>
                    <strong><?php echo esc_html(sprintf('Imported %d games and updated %d games.', $result['created'], $result['updated'])); ?></strong>
                    <?php if ($result['skipped'] > 0) : ?>
                        <?php echo esc_html(sprintf('Skipped %d rows.', $result['skipped'])); ?>
                    <?php endif; ?>
                </p>
                <?php if ($result['errors'] !== []) : ?>
                    <ul>
                        <?php foreach ($result['errors'] as $error) : ?>
                            <li><?php echo esc_html($error); ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        <?php endif; ?>
        <?php if (is_array($preview)) : ?>
            <div class="notice <?php echo $preview['errors'] === [] ? 'notice-info' : 'notice-warning'; ?>">
                <p><strong><?php echo esc_html(sprintf('Dry run: %d rows checked, %d ready to save (%d new, %d updates).', $preview['rows'], $preview['valid'], $preview['new'], $preview['updates'])); ?></strong></p>
                <?php if ($preview['skipped'] > 0) : ?><p><?php echo esc_html(sprintf('%d rows will be skipped.', $preview['skipped'])); ?></p><?php endif; ?>
                <?php if ($preview['errors'] !== []) : ?><ul><?php foreach ($preview['errors'] as $error) : ?><li><?php echo esc_html($error); ?></li><?php endforeach; ?></ul><?php endif; ?>
            </div>
            <?php if ($preview['preview'] !== []) : ?>
                <table class="widefat striped wwh-sports-import-preview">
                    <thead><tr><th>Row</th><th>Action</th><th>Season</th><th>Date / time</th><th>Opponent</th><th>Status</th></tr></thead>
                    <tbody><?php foreach ($preview['preview'] as $row) : ?>
                        <tr>
                            <td><?php echo esc_html((string) $row['line']); ?></td>
                            <td><?php echo esc_html($row['mode'] === 'created' ? 'New game' : 'Update #' . $row['postId']); ?></td>
                            <td><?php echo esc_html($row['season']); ?></td>
                            <td><?php echo esc_html(trim($row['date'] . ' ' . $row['time']) ?: 'TBA'); ?></td>
                            <td><?php echo esc_html($row['opponent']); ?></td>
                            <td><?php echo esc_html(wwh_label_from_value($row['status'])); ?></td>
                        </tr>
                    <?php endforeach; ?></tbody>
                </table>
                <?php if ($preview['valid'] > 0) : ?>
                    <form method="post" class="wwh-sports-import-confirm">
                        <?php wp_nonce_field('wwh_import_sports_games', 'wwh_sports_import_nonce'); ?>
                        <input type="hidden" name="wwh_sports_import_action" value="commit">
                        <input type="hidden" name="ww_sport_key" value="<?php echo esc_attr($selected_sport_key); ?>">
                        <textarea name="wwh_import_data" hidden><?php echo esc_textarea($import_data); ?></textarea>
                        <label><input type="checkbox" name="wwh_import_confirm" value="1" required> Save the valid rows shown above; invalid rows remain skipped.</label>
                        <?php submit_button('Commit Import', 'primary', 'submit', false); ?>
                    </form>
                <?php endif; ?>
            <?php endif; ?>
        <?php endif; ?>
        <?php if (is_array($reset_result)) : ?>
            <div class="notice <?php echo $reset_result['errors'] === [] ? 'notice-success' : 'notice-warning'; ?> is-dismissible">
                <p>
                    <strong><?php echo esc_html(sprintf('Moved %d sports games to Trash.', $reset_result['trashed'])); ?></strong>
                </p>
                <?php if ($reset_result['errors'] !== []) : ?>
                    <ul>
                        <?php foreach ($reset_result['errors'] as $error) : ?>
                            <li><?php echo esc_html($error); ?></li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('wwh_import_sports_games', 'wwh_sports_import_nonce'); ?>
            <input type="hidden" name="wwh_sports_import_action" value="preview">

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="ww_sport_key">Sport / Team</label></th>
                    <td>
                        <select id="ww_sport_key" name="ww_sport_key" required>
                            <?php foreach ($team_options as $option_value => $option_label) : ?>
                                <option value="<?php echo esc_attr((string) $option_value); ?>" <?php selected($selected_sport_key, (string) $option_value); ?>>
                                    <?php echo esc_html((string) $option_label); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description">Every imported row will use this sport/team.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wwh_import_file">Upload CSV or TSV</label></th>
                    <td>
                        <input type="file" id="wwh_import_file" name="wwh_import_file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain">
                        <p class="description">You can upload a spreadsheet export, or paste rows below.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="wwh_import_data">Paste Data</label></th>
                    <td>
                        <textarea id="wwh_import_data" name="wwh_import_data" rows="12" class="large-text code" placeholder="Season	Date	Time	Site	Opponent	Result	Team Score	Opponent Score	Game Type	Watch Replay"><?php echo esc_textarea($import_data); ?></textarea>
                        <p class="description">Expected columns: Season, Date, Time, Site, Opponent, Result, Team Score, Opponent Score, Game Type, Watch Replay. The legacy “Ninety Six Score” heading is still accepted.</p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Preview Import'); ?>
        </form>

        <hr>

        <h2>Reset Sports Games</h2>
        <p>Move every sports game record to Trash so the schedule database can be rebuilt from a clean import. This does not permanently delete trashed posts.</p>
        <form method="post">
            <?php wp_nonce_field('wwh_reset_sports_games', 'wwh_sports_reset_nonce'); ?>
            <input type="hidden" name="wwh_sports_import_action" value="reset">
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="wwh_reset_confirm">Confirm reset</label></th>
                    <td>
                        <input id="wwh_reset_confirm" name="wwh_reset_confirm" type="text" class="regular-text" autocomplete="off">
                        <p class="description">Type <code>TRASH GAMES</code> to move all sports games to Trash.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Move All Sports Games to Trash', 'delete'); ?>
        </form>
    </div>
    <?php
}

function wwh_reset_sports_games(): array
{
    $result = [
        'trashed' => 0,
        'errors' => [],
    ];

    if (!wwh_can_manage_bulk_sports_data()) {
        $result['errors'][] = 'You are not allowed to reset sports games.';
        return $result;
    }

    $confirmation = isset($_POST['wwh_reset_confirm']) ? sanitize_text_field(wp_unslash((string) $_POST['wwh_reset_confirm'])) : '';

    if ($confirmation !== 'TRASH GAMES') {
        $result['errors'][] = 'Type TRASH GAMES to confirm the reset.';
        return $result;
    }

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
    ]);

    foreach ($query->posts as $post_id) {
        $trashed = wp_trash_post(absint($post_id));

        if ($trashed) {
            $result['trashed']++;
        } else {
            $result['errors'][] = sprintf('Could not trash sports game post ID %d.', absint($post_id));
        }
    }

    wp_reset_postdata();

    return $result;
}

function wwh_render_sports_export_page(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to export sports games.', 'weekly-wildcat-headless'));
    }

    $export_url = wp_nonce_url(
        admin_url('admin-post.php?action=wwh_export_sports_games'),
        'wwh_export_sports_games',
        'wwh_sports_export_nonce'
    );

    ?>
    <div class="wrap wwh-export-page">
        <h1>Export Sports Games</h1>
        <p>Download every sports game as a CSV file. The first columns match the importer format so the file can be edited and imported again.</p>
        <p>
            <a class="button button-primary" href="<?php echo esc_url($export_url); ?>">Download All Games CSV</a>
        </p>
    </div>
    <?php
}

function wwh_export_sports_games(): void
{
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Sorry, you are not allowed to export sports games.', 'weekly-wildcat-headless'));
    }

    check_admin_referer('wwh_export_sports_games', 'wwh_sports_export_nonce');

    $filename = sanitize_title(byline_get_publication_config()['identity']['shortName']) . '-sports-games-' . wp_date('Y-m-d') . '.csv';

    nocache_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'w');

    if (!$output) {
        exit;
    }

    fputcsv($output, wwh_sports_export_columns());

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private', 'future'],
        'posts_per_page' => -1,
        'orderby' => 'title',
        'order' => 'ASC',
        'no_found_rows' => true,
    ]);

    foreach ($query->posts as $post) {
        fputcsv($output, wwh_sports_export_row($post));
    }

    wp_reset_postdata();
    fclose($output);
    exit;
}

function wwh_sports_export_columns(): array
{
    return [
        'Season',
        'Date',
        'Time',
        'Site',
        'Opponent',
        'Result',
        'Team Score',
        'Opponent Score',
        'Game Type',
        'Watch Replay',
        'Sport Key',
        'Sport / Team',
        'Status',
        'Location Name',
        'Location Address',
        'Recap URL',
        'Notes',
        'Post ID',
        'Post Status',
    ];
}

function wwh_sports_export_row(WP_Post $post): array
{
    $sport_key = wwh_meta_value($post->ID, '_ww_sport_key');
    $sport_option = array_key_exists($sport_key, wwh_sports_team_options()) ? wwh_sports_team_options()[$sport_key] : null;
    $start = wwh_meta_value($post->ID, '_ww_start_datetime');
    $date_time = wwh_export_date_time($post->ID, $start);
    $wildcats_score = wwh_meta_value($post->ID, '_ww_wildcats_score');
    $opponent_score = wwh_meta_value($post->ID, '_ww_opponent_score');
    $recap_url = wwh_meta_value($post->ID, '_ww_recap_url');
    $status = wwh_effective_game_status(wwh_meta_value($post->ID, '_ww_game_status', 'upcoming'), $start);

    return [
        wwh_sports_game_season($post->ID, $start),
        $date_time['date'],
        $date_time['time'],
        wwh_label_from_value(wwh_meta_value($post->ID, '_ww_site', 'home')),
        wwh_meta_value($post->ID, '_ww_opponent'),
        wwh_export_result($status, $wildcats_score, $opponent_score),
        $wildcats_score,
        $opponent_score,
        wwh_meta_value($post->ID, '_ww_import_game_type'),
        $recap_url !== '' ? $recap_url : wwh_export_note_value(wwh_meta_value($post->ID, '_ww_notes'), 'Watch replay'),
        $sport_key,
        $sport_option['label'] ?? wwh_meta_value($post->ID, '_ww_sport'),
        wwh_label_from_value($status),
        wwh_meta_value($post->ID, '_ww_location_name', wwh_meta_value($post->ID, '_ww_location')),
        wwh_meta_value($post->ID, '_ww_location_address'),
        $recap_url,
        wwh_meta_value($post->ID, '_ww_notes'),
        (string) $post->ID,
        $post->post_status,
    ];
}

function wwh_export_date_time(int $post_id, string $start): array
{
    if ($start === '') {
        return [
            'date' => wwh_meta_value($post_id, '_ww_import_date', 'TBA'),
            'time' => wwh_meta_value($post_id, '_ww_import_time', 'TBA'),
        ];
    }

    $timestamp = strtotime(str_replace('T', ' ', $start));

    if (!$timestamp) {
        return [
            'date' => $start,
            'time' => '',
        ];
    }

    return [
        'date' => wp_date('Y-m-d', $timestamp, wp_timezone()),
        'time' => wp_date('g:i A', $timestamp, wp_timezone()),
    ];
}

function wwh_export_result(string $status, string $wildcats_score, string $opponent_score): string
{
    if ($status === 'forfeit') {
        return 'Forfeit';
    }

    if ($status === 'tie') {
        return 'T';
    }

    if (!wwh_sports_game_status_shows_score($status) || $wildcats_score === '' || $opponent_score === '') {
        return '';
    }

    $wildcats_score = absint($wildcats_score);
    $opponent_score = absint($opponent_score);

    if ($wildcats_score > $opponent_score) {
        return 'W';
    }

    if ($wildcats_score < $opponent_score) {
        return 'L';
    }

    return 'T';
}

function wwh_export_note_value(string $notes, string $label): string
{
    foreach (preg_split('/\r\n|\r|\n/', $notes) ?: [] as $line) {
        $prefix = $label . ':';

        if (stripos((string) $line, $prefix) === 0) {
            return trim(substr((string) $line, strlen($prefix)));
        }
    }

    return '';
}

function wwh_import_sports_games(string $sport_key, string $raw_data): array
{
    $result = [
        'created' => 0,
        'updated' => 0,
        'skipped' => 0,
        'errors' => [],
    ];

    if (!wwh_can_manage_bulk_sports_data()) {
        $result['errors'][] = 'You are not allowed to import sports games.';
        return $result;
    }

    if ($sport_key === '') {
        $result['errors'][] = 'Choose a sport/team before importing.';
        return $result;
    }

    $parsed = wwh_parse_sports_import_rows($raw_data);

    if ($parsed['errors'] !== []) {
        $result['errors'] = array_merge($result['errors'], $parsed['errors']);
        return $result;
    }

    foreach ($parsed['rows'] as $index => $row) {
        $line_number = $index + 2;
        $imported = wwh_import_sports_game_row($sport_key, $row);

        if (is_wp_error($imported)) {
            $result['skipped']++;
            $result['errors'][] = sprintf('Row %d skipped: %s', $line_number, $imported->get_error_message());
            continue;
        }

        $result[$imported]++;
    }

    return $result;
}

function wwh_parse_sports_import_rows(string $raw_data): array
{
    $raw_data = trim($raw_data);

    if ($raw_data === '') {
        return [
            'rows' => [],
            'errors' => ['Paste schedule data or upload a CSV/TSV file.'],
        ];
    }

    $lines = preg_split('/\r\n|\r|\n/', $raw_data);

    if (!is_array($lines) || count($lines) < 2) {
        return [
            'rows' => [],
            'errors' => ['The import needs a header row and at least one game row.'],
        ];
    }

    $header_line = array_shift($lines);
    $delimiter = wwh_import_delimiter((string) $header_line);
    $headers = str_getcsv((string) $header_line, $delimiter);
    $header_map = wwh_import_header_map($headers);
    $missing = [];

    foreach (['date', 'opponent'] as $required_header) {
        if (!array_key_exists($required_header, $header_map)) {
            $missing[] = $required_header === 'date' ? 'Date' : 'Opponent';
        }
    }

    if ($missing !== []) {
        return [
            'rows' => [],
            'errors' => [sprintf('Missing required column: %s.', implode(', ', $missing))],
        ];
    }

    $rows = [];

    foreach ($lines as $line) {
        if (trim((string) $line) === '') {
            continue;
        }

        $columns = str_getcsv((string) $line, $delimiter);
        $rows[] = [
            'season' => wwh_import_cell($columns, $header_map, 'season'),
            'date' => wwh_import_cell($columns, $header_map, 'date'),
            'time' => wwh_import_cell($columns, $header_map, 'time'),
            'site' => wwh_import_cell($columns, $header_map, 'site'),
            'opponent' => wwh_import_cell($columns, $header_map, 'opponent'),
            'result' => wwh_import_cell($columns, $header_map, 'result'),
            'wildcats_score' => wwh_import_cell($columns, $header_map, 'teamscore') !== ''
                ? wwh_import_cell($columns, $header_map, 'teamscore')
                : wwh_import_cell($columns, $header_map, 'ninetysixscore'),
            'opponent_score' => wwh_import_cell($columns, $header_map, 'opponentscore'),
            'game_type' => wwh_import_cell($columns, $header_map, 'gametype'),
            'watch_replay' => wwh_import_cell($columns, $header_map, 'watchreplay'),
            'sport_key' => wwh_import_cell($columns, $header_map, 'sportkey'),
            'sport_team' => wwh_import_cell($columns, $header_map, 'sportteam'),
        ];
    }

    return [
        'rows' => $rows,
        'errors' => [],
    ];
}

function wwh_import_delimiter(string $header_line): string
{
    return substr_count($header_line, "\t") >= substr_count($header_line, ',') ? "\t" : ',';
}

function wwh_import_header_map(array $headers): array
{
    $map = [];

    foreach ($headers as $index => $header) {
        $header = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header);
        $normalized = strtolower(trim((string) $header));
        $normalized = preg_replace('/[^a-z0-9]+/', '', $normalized);

        if (is_string($normalized) && $normalized !== '') {
            $map[$normalized] = $index;
        }
    }

    return $map;
}

function wwh_import_cell(array $columns, array $header_map, string $header): string
{
    if (!array_key_exists($header, $header_map)) {
        return '';
    }

    $index = $header_map[$header];

    return isset($columns[$index]) ? sanitize_text_field((string) $columns[$index]) : '';
}

function wwh_prepare_sports_game_import_row(string $sport_key, array $row)
{
    $sport_options = wwh_sports_team_options();
    $sport_option = $sport_options[$sport_key] ?? null;
    if (!is_array($sport_option)) {
        return new WP_Error('wwh_import_unknown_sport_key', 'The import must resolve every game to a configured team.');
    }

    $row = array_merge([
        'season' => '',
        'date' => '',
        'time' => '',
        'site' => '',
        'opponent' => '',
        'result' => '',
        'wildcats_score' => '',
        'opponent_score' => '',
        'game_type' => '',
        'watch_replay' => '',
        'sport_key' => '',
        'sport_team' => '',
    ], $row);
    $row_sport_key = wwh_import_row_sport_key($row);

    if (is_wp_error($row_sport_key)) {
        return $row_sport_key;
    }

    if ($row_sport_key !== '' && $row_sport_key !== $sport_key) {
        $row_sport_option = $sport_options[$row_sport_key] ?? null;
        return new WP_Error(
            'wwh_import_sport_key_mismatch',
            sprintf(
                'The row is marked as %s, but the import is set to %s. Choose the matching sport/team or remove the mismatched row.',
                $row_sport_option['label'] ?? $row_sport_key,
                $sport_option['label']
            )
        );
    }

    $opponent = trim((string) $row['opponent']);
    $start_unknown = wwh_import_has_unknown_datetime((string) $row['date'], (string) $row['time']);
    $start_datetime = wwh_import_datetime((string) $row['date'], (string) $row['time']);

    if ($opponent === '') {
        return new WP_Error('wwh_import_missing_opponent', 'Opponent is required.');
    }

    if (!$start_unknown && $start_datetime === '') {
        return new WP_Error('wwh_import_invalid_date', 'Date or time could not be read.');
    }

    $raw_season = trim((string) $row['season']);
    if ($raw_season !== '' && byline_sports_normalize_season($raw_season) === '') {
        return new WP_Error('wwh_import_invalid_season', 'Season must use the YYYY-YY school-year format.');
    }

    $resolved_season = byline_sports_resolve_game_season($start_datetime, $raw_season);
    if ($resolved_season === '') {
        return new WP_Error('wwh_import_missing_season', 'Season is required when a game has no readable date.');
    }
    if ($start_datetime !== '' && $raw_season !== '' && byline_sports_season_for_date($start_datetime) !== $resolved_season) {
        return new WP_Error('wwh_import_season_mismatch', 'The supplied season does not match the game date; use the canonical school year for that date.');
    }
    $row['season'] = $resolved_season;

    $site = wwh_import_site((string) $row['site']);
    $wildcats_score = wwh_import_score((string) $row['wildcats_score']);
    $opponent_score = wwh_import_score((string) $row['opponent_score']);
    $status = wwh_import_status((string) $row['result'], $wildcats_score, $opponent_score, $start_datetime);
    $recap_url = wwh_import_recap_url((string) $row['watch_replay']);
    $notes = wwh_import_notes($row, $recap_url);
    $import_key = wwh_import_row_key($row);
    $post_id = wwh_find_existing_sports_game($sport_key, $row, $start_datetime, $opponent);

    return [
        'row' => $row,
        'sport_key' => $sport_key,
        'sport_option' => $sport_option,
        'opponent' => $opponent,
        'start_datetime' => $start_datetime,
        'site' => $site,
        'wildcats_score' => $wildcats_score,
        'opponent_score' => $opponent_score,
        'status' => $status,
        'recap_url' => $recap_url,
        'notes' => $notes,
        'import_key' => $import_key,
        'post_id' => $post_id,
        'mode' => $post_id > 0 ? 'updated' : 'created',
    ];
}

function wwh_import_sports_game_row(string $sport_key, array $row)
{
    $prepared = wwh_prepare_sports_game_import_row($sport_key, $row);
    if (is_wp_error($prepared)) {
        return $prepared;
    }

    $sport_option = $prepared['sport_option'];
    $post_data = [
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => 'publish',
        'post_title' => wwh_import_game_title($sport_option['sport'], $prepared['site'], $prepared['opponent']),
    ];

    if ($prepared['post_id'] > 0) {
        $post_data['ID'] = $prepared['post_id'];
    }

    $saved_post_id = $prepared['post_id'] > 0
        ? wp_update_post($post_data, true)
        : wp_insert_post($post_data, true);

    if (is_wp_error($saved_post_id)) {
        return $saved_post_id;
    }

    $saved_post_id = absint($saved_post_id);
    $row = $prepared['row'];
    wwh_update_meta($saved_post_id, '_ww_sport_key', $prepared['sport_key']);
    wwh_update_meta($saved_post_id, '_ww_sport', $sport_option['sport']);
    wwh_update_meta($saved_post_id, '_ww_level', $sport_option['level']);
    wwh_update_meta($saved_post_id, '_ww_team_label', $sport_option['teamLabel']);
    wwh_update_meta($saved_post_id, '_ww_opponent', $prepared['opponent']);
    wwh_update_meta($saved_post_id, '_ww_site', $prepared['site']);
    wwh_update_meta($saved_post_id, '_ww_start_datetime', $prepared['start_datetime']);
    wwh_update_meta($saved_post_id, '_ww_game_status', $prepared['status']);
    wwh_update_score_meta($saved_post_id, '_ww_wildcats_score', $prepared['wildcats_score']);
    wwh_update_score_meta($saved_post_id, '_ww_opponent_score', $prepared['opponent_score']);
    wwh_update_meta($saved_post_id, '_ww_recap_url', $prepared['recap_url']);
    wwh_update_meta($saved_post_id, '_ww_notes', $prepared['notes']);
    wwh_update_meta($saved_post_id, '_ww_import_key', $prepared['import_key']);
    wwh_update_meta($saved_post_id, '_ww_import_season', (string) $row['season']);
    wwh_update_meta($saved_post_id, '_ww_import_date', (string) $row['date']);
    wwh_update_meta($saved_post_id, '_ww_import_time', (string) $row['time']);
    wwh_update_meta($saved_post_id, '_ww_import_game_type', (string) $row['game_type']);

    return $prepared['mode'];
}

/**
 * Validate and classify an import without creating or updating any posts.
 * The returned preview is intentionally made from the same preparer used by
 * the commit path, so a confirmation cannot silently change the result.
 */
function wwh_preview_sports_games(string $sport_key, string $raw_data): array
{
    $preview = [
        'rows' => 0,
        'valid' => 0,
        'validRows' => 0,
        'new' => 0,
        'updates' => 0,
        'created' => 0,
        'updated' => 0,
        'skipped' => 0,
        'errors' => [],
        'preview' => [],
        'prepared' => [],
    ];

    if ($sport_key === '') {
        $preview['errors'][] = 'Choose a sport/team before importing.';
        return $preview;
    }

    $parsed = wwh_parse_sports_import_rows($raw_data);
    $preview['rows'] = count($parsed['rows']);
    if ($parsed['errors'] !== []) {
        $preview['errors'] = array_merge($preview['errors'], $parsed['errors']);
        return $preview;
    }

    foreach ($parsed['rows'] as $index => $row) {
        $prepared = wwh_prepare_sports_game_import_row($sport_key, $row);
        if (is_wp_error($prepared)) {
            $preview['skipped']++;
            $preview['errors'][] = sprintf('Row %d skipped: %s', $index + 2, $prepared->get_error_message());
            continue;
        }

        $preview['valid']++;
        $preview['validRows']++;
        $mode = $prepared['mode'];
        $preview[$mode === 'created' ? 'new' : 'updates']++;
        $preview[$mode]++;
        $preview['preview'][] = [
            'line' => $index + 2,
            'mode' => $mode,
            'postId' => (int) $prepared['post_id'],
            'season' => (string) $prepared['row']['season'],
            'date' => (string) $prepared['row']['date'],
            'time' => (string) $prepared['row']['time'],
            'opponent' => (string) $prepared['opponent'],
            'status' => (string) $prepared['status'],
        ];
        $preview['prepared'][] = $prepared;
    }

    return $preview;
}

function wwh_import_datetime(string $date, string $time): string
{
    $date = trim($date);
    $time = trim($time);

    if (wwh_import_has_unknown_datetime($date, $time)) {
        return '';
    }

    $value = trim($date . ' ' . $time);
    $timezone = wp_timezone();
    $formats = [
        'Y-m-d g:i A',
        'Y-m-d h:i A',
        'Y-m-d H:i',
        'Y-m-d',
        'm/d/Y g:i A',
        'm/d/Y h:i A',
        'm/d/Y H:i',
        'm/d/Y',
        'n/j/Y g:i A',
        'n/j/Y h:i A',
        'n/j/Y H:i',
        'n/j/Y',
    ];

    foreach ($formats as $format) {
        $datetime = DateTimeImmutable::createFromFormat('!' . $format, $value, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

        if ($datetime instanceof DateTimeImmutable && !$has_errors) {
            return $datetime->format('Y-m-d\TH:i');
        }
    }

    $timestamp = strtotime($value);

    return $timestamp ? wp_date('Y-m-d\TH:i', $timestamp, $timezone) : '';
}

function wwh_import_has_unknown_datetime(string $date, string $time): bool
{
    $date = trim($date);
    $time = trim($time);

    return $date === '' || $time === '' || wwh_import_is_unknown_value($date) || wwh_import_is_unknown_value($time);
}

function wwh_import_is_unknown_value(string $value): bool
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '', $value);

    return in_array($value, ['', 'tba', 'tbd', 'unknown', 'na', 'none', 'tobeannounced', 'tobedetermined'], true);
}

function wwh_import_site(string $site): string
{
    $site = strtolower(trim($site));

    if (in_array($site, ['away', 'a'], true)) {
        return 'away';
    }

    if (in_array($site, ['neutral', 'n'], true)) {
        return 'neutral';
    }

    return 'home';
}

function wwh_import_score(string $score): string
{
    $score = trim($score);

    if ($score === '' || $score === '-') {
        return '';
    }

    return is_numeric($score) ? (string) max(0, absint($score)) : '';
}

function wwh_import_status(string $result, string $wildcats_score, string $opponent_score, string $start_datetime): string
{
    $result = strtolower(trim($result));

    if (in_array($result, ['postponed', 'ppd'], true)) {
        return 'postponed';
    }

    if (in_array($result, ['canceled', 'cancelled'], true)) {
        return 'canceled';
    }

    if (in_array($result, ['forfeit', 'forfeited', 'ff'], true)) {
        return 'forfeit';
    }

    if (in_array($result, ['t', 'tie'], true)) {
        return 'tie';
    }

    if (in_array($result, ['w', 'win', 'l', 'loss'], true)) {
        return 'final';
    }

    if ($wildcats_score !== '' && $opponent_score !== '') {
        return absint($wildcats_score) === absint($opponent_score) ? 'tie' : 'final';
    }

    return wwh_effective_game_status('upcoming', $start_datetime);
}

function wwh_import_recap_url(string $watch_replay): string
{
    $watch_replay = trim($watch_replay);

    return filter_var($watch_replay, FILTER_VALIDATE_URL) ? esc_url_raw($watch_replay) : '';
}

function wwh_import_notes(array $row, string $recap_url): string
{
    $notes = [];

    if (wwh_import_has_unknown_datetime((string) $row['date'], (string) $row['time'])) {
        $date = trim((string) $row['date']);
        $time = trim((string) $row['time']);
        $parts = [];

        if ($date !== '') {
            $parts[] = 'Date: ' . $date;
        }

        if ($time !== '') {
            $parts[] = 'Time: ' . $time;
        }

        $notes[] = 'Date/time: ' . ($parts !== [] ? implode('; ', $parts) : 'TBA');
    }

    if ((string) $row['season'] !== '') {
        $notes[] = 'Season: ' . (string) $row['season'];
    }

    if ((string) $row['game_type'] !== '') {
        $notes[] = 'Game type: ' . (string) $row['game_type'];
    }

    if ((string) $row['watch_replay'] !== '' && $recap_url === '') {
        $notes[] = 'Watch replay: ' . (string) $row['watch_replay'];
    }

    return implode("\n", $notes);
}

function wwh_import_row_sport_key(array $row)
{
    $raw_sport_key = trim((string) ($row['sport_key'] ?? ''));

    if ($raw_sport_key !== '') {
        $sport_key = wwh_sanitize_sport_key(strtolower($raw_sport_key));

        if ($sport_key === '' || !array_key_exists($sport_key, wwh_sports_team_options())) {
            return new WP_Error(
                'wwh_import_unknown_sport_key',
                sprintf('The row uses an unknown Sport Key: %s; choose a configured team.', $raw_sport_key)
            );
        }

        return $sport_key;
    }

    $sport_team = trim((string) ($row['sport_team'] ?? ''));

    if ($sport_team === '') {
        return '';
    }

    $sport_team_normalized = wwh_normalize_import_sport_label($sport_team);

    foreach (wwh_sports_team_options() as $key => $option) {
        $labels = [
            $key,
            (string) ($option['label'] ?? ''),
            trim(implode(' ', array_filter([(string) ($option['sport'] ?? ''), (string) ($option['level'] ?? '')]))),
        ];

        foreach ($labels as $label) {
            if ($label !== '' && wwh_normalize_import_sport_label($label) === $sport_team_normalized) {
                return $key;
            }
        }
    }

    return new WP_Error(
        'wwh_import_unknown_sport_team',
        sprintf('The row uses an unknown Sport / Team value: %s.', $sport_team)
    );
}

function wwh_normalize_import_sport_label(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '', $value);

    return is_string($value) ? $value : '';
}

function wwh_import_row_key(array $row): string
{
    $parts = [
        (string) $row['season'],
        (string) $row['date'],
        (string) $row['time'],
        (string) $row['site'],
        (string) $row['opponent'],
        (string) $row['game_type'],
    ];

    return md5(implode('|', array_map('wwh_normalize_import_key_part', $parts)));
}

function wwh_normalize_import_key_part(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/\s+/', ' ', $value);

    return is_string($value) ? $value : '';
}

function wwh_normalize_import_date_key(string $value): string
{
    $value = trim($value);

    if ($value === '' || wwh_import_is_unknown_value($value)) {
        return '';
    }

    $timezone = wp_timezone();
    $formats = ['Y-m-d', 'm/d/Y', 'n/j/Y', 'm/d/y', 'n/j/y'];

    foreach ($formats as $format) {
        $date = DateTimeImmutable::createFromFormat('!' . $format, $value, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

        if ($date instanceof DateTimeImmutable && !$has_errors) {
            return $date->format('Y-m-d');
        }
    }

    $timestamp = strtotime($value);

    return $timestamp ? wp_date('Y-m-d', $timestamp, $timezone) : wwh_normalize_import_key_part($value);
}

function wwh_normalize_import_time_key(string $value): string
{
    $value = trim($value);

    if ($value === '' || wwh_import_is_unknown_value($value)) {
        return '';
    }

    $timezone = wp_timezone();
    $formats = ['g:i A', 'h:i A', 'g:iA', 'h:iA', 'H:i'];

    foreach ($formats as $format) {
        $time = DateTimeImmutable::createFromFormat('!' . $format, $value, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        $has_errors = is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0);

        if ($time instanceof DateTimeImmutable && !$has_errors) {
            return $time->format('H:i');
        }
    }

    $timestamp = strtotime($value);

    return $timestamp ? wp_date('H:i', $timestamp, $timezone) : wwh_normalize_import_key_part($value);
}

function wwh_existing_sports_game_identity_matches(int $post_id, array $row, string $start_datetime, string $opponent): bool
{
    $existing_start_datetime = wwh_meta_value($post_id, '_ww_start_datetime');
    $existing_date = wwh_meta_value($post_id, '_ww_import_date');
    $existing_time = wwh_meta_value($post_id, '_ww_import_time');

    if ($existing_date === '' && $existing_start_datetime !== '') {
        $existing_date = substr($existing_start_datetime, 0, 10);
    }

    if ($existing_time === '' && $existing_start_datetime !== '') {
        $existing_time = substr($existing_start_datetime, 11, 5);
    }

    $row_time = (string) $row['time'];
    $row_has_time = !wwh_import_is_unknown_value($row_time);
    $existing_has_time = !wwh_import_is_unknown_value($existing_time);

    $existing_season = wwh_sports_game_season($post_id, $existing_start_datetime);
    $row_season = byline_sports_normalize_season((string) ($row['season'] ?? ''));
    if ($existing_season === '' || $row_season === '' || $existing_season !== $row_season) {
        return false;
    }

    if (wwh_normalize_import_date_key($existing_date) !== wwh_normalize_import_date_key((string) $row['date'])) {
        return false;
    }

    if (wwh_normalize_import_key_part(wwh_meta_value($post_id, '_ww_opponent')) !== wwh_normalize_import_key_part($opponent)) {
        return false;
    }

    if (($row_has_time || $existing_has_time) && wwh_normalize_import_time_key($existing_time) !== wwh_normalize_import_time_key($row_time)) {
        return false;
    }

    return $start_datetime === '' || $existing_start_datetime === '' || $existing_start_datetime === $start_datetime;
}

function wwh_find_existing_sports_game(string $sport_key, array $row, string $start_datetime, string $opponent): int
{
    $meta_query = [
        [
            'key' => '_ww_sport_key',
            'value' => $sport_key,
        ],
    ];

    $query = new WP_Query([
        'post_type' => WWH_SPORTS_GAME_POST_TYPE,
        'post_status' => ['publish', 'draft', 'pending', 'private'],
        'posts_per_page' => -1,
        'fields' => 'ids',
        'no_found_rows' => true,
        'meta_query' => $meta_query,
    ]);

    foreach ($query->posts as $post_id) {
        $post_id = absint($post_id);

        if (wwh_existing_sports_game_identity_matches($post_id, $row, $start_datetime, $opponent)) {
            wp_reset_postdata();
            return $post_id;
        }
    }

    wp_reset_postdata();

    return 0;
}

function wwh_import_game_title(string $sport, string $site, string $opponent): string
{
    $preposition = $site === 'away' ? 'at' : 'vs.';

    return trim(sprintf('%s %s %s', $sport, $preposition, $opponent));
}

function wwh_author_meta_value(int $user_id, string $key, string $default = ''): string
{
    $value = get_user_meta($user_id, $key, true);

    return is_string($value) && $value !== '' ? $value : $default;
}

function wwh_author_profile_photo(int $attachment_id): array
{
    return wwh_media_image($attachment_id, 'medium');
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

    ?>
    <h2><?php echo esc_html(byline_get_publication_config()['identity']['shortName']); ?> Profile</h2>
    <table class="form-table wwh-author-profile" role="presentation">
        <tr>
            <th><label for="ww_author_role">Role</label></th>
            <td><input type="text" class="regular-text" id="ww_author_role" name="ww_author_role" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_role')); ?>"></td>
        </tr>
        <tr>
            <th><label for="ww_author_pronouns">Pronouns</label></th>
            <td><input type="text" class="regular-text" id="ww_author_pronouns" name="ww_author_pronouns" value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_pronouns')); ?>"></td>
        </tr>
        <tr>
            <th><label for="ww_author_photo_id">Profile Photo</label></th>
            <td>
                <input type="hidden" id="ww_author_photo_id" name="ww_author_photo_id" value="<?php echo esc_attr((string) $photo_id); ?>">
                <img class="wwh-author-photo-preview" src="<?php echo esc_url($photo['url']); ?>" alt="" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>
                <p>
                    <button type="button" class="button wwh-author-photo-select">Select Profile Photo</button>
                    <button type="button" class="button wwh-author-photo-remove" <?php echo $photo['url'] === '' ? 'hidden' : ''; ?>>Remove Photo</button>
                </p>
                <p class="description">Use a WordPress Media Library image instead of Gravatar.</p>
            </td>
        </tr>
        <tr>
            <th>Founder Badge</th>
            <td>
                <label>
                    <input type="checkbox" name="ww_author_founder" value="1" <?php checked(wwh_author_meta_value($user->ID, '_ww_author_founder'), '1'); ?>>
                    Show Founder badge on this author profile
                </label>
            </td>
        </tr>
        <tr>
            <th>Author Directory</th>
            <td>
                <label>
                    <input type="checkbox" name="ww_author_show_in_directory" value="1" <?php checked(wwh_author_visible_in_directory($user->ID)); ?>>
                    Show in author directory
                </label>
                <p class="description">Enabled by default so new contributors can appear before their first story is published.</p>
            </td>
        </tr>
        <?php foreach (wwh_author_social_fields() as $key => $label) : ?>
            <tr>
                <th><label for="ww_author_social_<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
                <td>
                    <input
                        type="<?php echo $key === 'email' ? 'email' : 'url'; ?>"
                        class="regular-text"
                        id="ww_author_social_<?php echo esc_attr($key); ?>"
                        name="ww_author_social_<?php echo esc_attr($key); ?>"
                        value="<?php echo esc_attr(wwh_author_meta_value($user->ID, '_ww_author_social_' . $key)); ?>"
                    >
                </td>
            </tr>
        <?php endforeach; ?>
    </table>
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
    wwh_update_user_meta($user_id, '_ww_author_pronouns', wwh_request_value('ww_author_pronouns'));
    wwh_update_user_meta($user_id, '_ww_author_founder', isset($_POST['ww_author_founder']) ? '1' : '');
    update_user_meta($user_id, '_ww_author_show_in_directory', isset($_POST['ww_author_show_in_directory']) ? '1' : '0');

    $photo_id = isset($_POST['ww_author_photo_id']) ? absint($_POST['ww_author_photo_id']) : 0;
    wwh_update_user_meta($user_id, '_ww_author_photo_id', $photo_id > 0 ? (string) $photo_id : '');

    foreach (wwh_author_social_fields() as $key => $_label) {
        $field = 'ww_author_social_' . $key;
        $value = $key === 'email' ? sanitize_email(wwh_request_value($field)) : esc_url_raw(wwh_request_value($field));
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
    $is_team_settings_page = $hook === WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-team-settings';
    $is_team_detail_page = $is_team_settings_page
        && isset($_GET['team'])
        && is_scalar($_GET['team'])
        && sanitize_key((string) wp_unslash($_GET['team'])) !== '';
    if (!in_array($hook, ['profile.php', 'user-edit.php'], true) && !$is_team_detail_page) {
        return;
    }

    wp_enqueue_media();
    wp_add_inline_script(
        'jquery-core',
        "document.addEventListener('click',function(event){var selectButton=event.target.closest('.wwh-author-photo-select');var removeButton=event.target.closest('.wwh-author-photo-remove');var teamSelectButton=event.target.closest('.wwh-team-media-select');var teamRemoveButton=event.target.closest('.wwh-team-media-remove');if(selectButton){event.preventDefault();var wrap=selectButton.closest('td');var input=wrap.querySelector('#ww_author_photo_id');var preview=wrap.querySelector('.wwh-author-photo-preview');var remove=wrap.querySelector('.wwh-author-photo-remove');var frame=wp.media({title:'Select author profile photo',button:{text:'Use this photo'},multiple:false});frame.on('select',function(){var attachment=frame.state().get('selection').first().toJSON();input.value=attachment.id;preview.src=(attachment.sizes&&attachment.sizes.medium?attachment.sizes.medium.url:attachment.url);preview.hidden=false;remove.hidden=false;});frame.open();}if(removeButton){event.preventDefault();var removeWrap=removeButton.closest('td');removeWrap.querySelector('#ww_author_photo_id').value='';var removePreview=removeWrap.querySelector('.wwh-author-photo-preview');removePreview.removeAttribute('src');removePreview.hidden=true;removeButton.hidden=true;}if(teamSelectButton){event.preventDefault();var teamWrap=teamSelectButton.closest('.wwh-team-media-field');var teamInput=teamWrap.querySelector('input[type=\"hidden\"]');var teamPreview=teamWrap.querySelector('.wwh-team-media-preview');var teamRemove=teamWrap.querySelector('.wwh-team-media-remove');var teamFrame=wp.media({title:teamSelectButton.dataset.title||'Select team image',button:{text:teamSelectButton.dataset.buttonText||'Use image'},multiple:false});teamFrame.on('select',function(){var attachment=teamFrame.state().get('selection').first().toJSON();teamInput.value=attachment.id;teamPreview.src=(attachment.sizes&&attachment.sizes.medium_large?attachment.sizes.medium_large.url:(attachment.sizes&&attachment.sizes.large?attachment.sizes.large.url:attachment.url));teamPreview.hidden=false;teamRemove.hidden=false;var focalPreview=teamWrap.querySelector('.wwh-team-focal-preview');var focalControls=teamWrap.querySelector('.wwh-team-focal-controls');var focalHelp=teamWrap.querySelector('.wwh-team-focal-help');if(focalPreview){focalPreview.hidden=false;}if(focalControls){focalControls.hidden=false;}if(focalHelp){focalHelp.hidden=false;}});teamFrame.open();}if(teamRemoveButton){event.preventDefault();var teamRemoveWrap=teamRemoveButton.closest('.wwh-team-media-field');teamRemoveWrap.querySelector('input[type=\"hidden\"]').value='';var teamRemovePreview=teamRemoveWrap.querySelector('.wwh-team-media-preview');teamRemovePreview.removeAttribute('src');teamRemovePreview.hidden=true;teamRemoveButton.hidden=true;var focalPreview=teamRemoveWrap.querySelector('.wwh-team-focal-preview');var focalControls=teamRemoveWrap.querySelector('.wwh-team-focal-controls');var focalHelp=teamRemoveWrap.querySelector('.wwh-team-focal-help');if(focalPreview){focalPreview.hidden=true;}if(focalControls){focalControls.hidden=true;}if(focalHelp){focalHelp.hidden=true;}}});"
    );
    wp_add_inline_script(
        'jquery-core',
        <<<'JS'
document.addEventListener('DOMContentLoaded', function () {
    function updateFocalPoint(field, x, y) {
        var normalizedX = Math.max(0, Math.min(100, Math.round(x * 100) / 100));
        var normalizedY = Math.max(0, Math.min(100, Math.round(y * 100) / 100));
        var xInput = field.querySelector('.wwh-team-focal-x');
        var yInput = field.querySelector('.wwh-team-focal-y');
        var marker = field.querySelector('.wwh-team-focal-marker');
        var output = field.querySelector('.wwh-team-focal-output');

        xInput.value = normalizedX;
        yInput.value = normalizedY;
        marker.style.left = normalizedX + '%';
        marker.style.top = normalizedY + '%';
        output.textContent = normalizedX + '% horizontal · ' + normalizedY + '% vertical';
    }

    document.addEventListener('click', function (event) {
        var preview = event.target.closest('.wwh-team-focal-preview');
        var centerButton = event.target.closest('.wwh-team-focal-center');

        if (preview && event.detail !== 0) {
            event.preventDefault();
            var rect = preview.getBoundingClientRect();
            updateFocalPoint(
                preview.closest('.wwh-team-media-field'),
                ((event.clientX - rect.left) / rect.width) * 100,
                ((event.clientY - rect.top) / rect.height) * 100
            );
        }

        if (centerButton) {
            event.preventDefault();
            updateFocalPoint(centerButton.closest('.wwh-team-media-field'), 50, 50);
        }
    });

    document.addEventListener('keydown', function (event) {
        var preview = event.target.closest('.wwh-team-focal-preview');

        if (!preview || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        var field = preview.closest('.wwh-team-media-field');
        var x = parseFloat(field.querySelector('.wwh-team-focal-x').value) || 50;
        var y = parseFloat(field.querySelector('.wwh-team-focal-y').value) || 50;
        var step = event.shiftKey ? 5 : 1;

        if (event.key === 'ArrowLeft') x -= step;
        if (event.key === 'ArrowRight') x += step;
        if (event.key === 'ArrowUp') y -= step;
        if (event.key === 'ArrowDown') y += step;
        updateFocalPoint(field, x, y);
    });
});
JS
    );
}
add_action('admin_enqueue_scripts', 'wwh_enqueue_author_profile_assets');

function wwh_admin_styles(): void
{
    $screen = get_current_screen();
    $is_overview_page = $screen && $screen->id === WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-overview';
    $is_import_page = $screen && $screen->id === WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-import';
    $is_team_settings_page = $screen && $screen->id === WWH_SPORTS_GAME_POST_TYPE . '_page_wwh-sports-team-settings';

    if (!$screen || (!$is_overview_page && !$is_import_page && !$is_team_settings_page && !in_array($screen->post_type, ['post', WWH_SPORTS_GAME_POST_TYPE, WWH_SPORTS_ROSTER_POST_TYPE, WWH_SCHOOL_EVENT_POST_TYPE], true) && !in_array($screen->id, ['profile', 'user-edit'], true))) {
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
        .wwh-author-photo-preview { background: #f0f0f1; display: block; height: 96px; margin-bottom: 10px; object-fit: cover; width: 96px; }
        .wwh-import-page textarea.code { min-height: 240px; white-space: pre; }
        .wwh-import-page select { min-width: 260px; }
        .wwh-import-page .notice ul { list-style: disc; margin-left: 20px; }
        .wwh-sports-overview-header, .wwh-sports-section-heading, .wwh-team-settings-card-heading { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; }
        .wwh-sports-team-page-heading { align-items: flex-start; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; }
        .wwh-sports-team-page-heading h1 { margin-bottom: 4px; }
        .wwh-team-section-nav { display: flex; flex-wrap: wrap; gap: 14px; margin: 18px 0; }
        .wwh-team-section-nav a { font-weight: 600; }
        .wwh-sports-team-filters { align-items: end; background: #fff; border: 1px solid #dcdcde; display: flex; flex-wrap: wrap; gap: 8px 10px; margin: 18px 0; padding: 12px; }
        .wwh-sports-team-filters label { font-weight: 600; }
        .wwh-sports-team-filters input[type="search"] { min-width: 280px; }
        .wwh-sports-team-filters .button-link { align-self: center; }
        .wwh-sports-overview-header { background: #fff; border: 1px solid #dcdcde; margin: 20px 0; padding: 16px; }
        .wwh-sports-overview-eyebrow { color: #646970; display: block; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
        .wwh-sports-quick-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .wwh-sports-overview-section, .wwh-sports-team-list, .wwh-add-sports-team { margin-top: 24px; }
        .wwh-sports-overview-section h2, .wwh-sports-section-heading h2 { margin-bottom: 10px; }
        .wwh-sports-team-table-wrap { overflow-x: auto; }
        .wwh-sports-team-table { min-width: 760px; }
        .wwh-sports-team-table code { color: #646970; font-size: 11px; }
        .wwh-sports-actions { white-space: nowrap; }
        .wwh-sports-missing { color: #b32d2e; font-weight: 600; }
        .wwh-sports-team-state { border-radius: 999px; display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 8px; white-space: nowrap; }
        .wwh-sports-team-state.is-active { background: #edfaef; color: #176b2c; }
        .wwh-sports-team-state.is-inactive { background: #f0f0f1; color: #646970; }
        .wwh-sports-attention-list { display: grid; gap: 8px; list-style: none; margin: 0; }
        .wwh-sports-attention-list li { background: #fff; border-left: 4px solid #dba617; padding: 10px 12px; }
        .wwh-sports-attention-list .wwh-sports-attention-error { border-left-color: #d63638; }
        .wwh-sports-attention-list .wwh-sports-attention-recommended { border-left-color: #dba617; }
        .wwh-sports-archived-team-list { columns: 2; margin-left: 20px; }
        .wwh-sports-context { background: #f6f7f7; border: 1px solid #dcdcde; margin: 16px 0; padding: 12px 14px; }
        .wwh-sports-context p { margin: 4px 0 8px; }
        .wwh-sports-context .notice { margin: 8px 0; }
        .wwh-sports-breadcrumb, .wwh-sports-back-link { margin-bottom: 8px; }
        .wwh-sports-import-preview { margin: 16px 0; }
        .wwh-sports-import-confirm { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0; }
        .wwh-team-settings-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
        .wwh-team-settings-card { background: #fff; border: 1px solid #dcdcde; display: grid; gap: 12px; padding: 14px; }
        .wwh-team-settings-card h2 { font-size: 16px; margin: 0; }
        .wwh-team-settings-card .description { margin: 0; }
        .wwh-team-settings-section { border-top: 1px solid #dcdcde; padding-top: 12px; }
        .wwh-team-settings-section:first-child { border-top: 0; padding-top: 0; }
        .wwh-team-settings-section > summary { align-items: baseline; cursor: pointer; display: flex; flex-wrap: wrap; gap: 10px; list-style-position: outside; padding: 4px 0; }
        .wwh-team-settings-section > summary::marker { color: #646970; }
        .wwh-team-settings-section-title { font-size: 16px; font-weight: 600; }
        .wwh-team-settings-section > section { margin-top: 14px; }
        .wwh-team-identity-section h3, .wwh-team-branding-section h3 { font-size: 14px; margin: 0 0 6px; }
        .wwh-team-status-control { align-items: baseline; display: flex; flex-wrap: wrap; gap: 10px; }
        .wwh-team-status-control label { font-weight: 600; }
        .wwh-team-media-fields { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .wwh-team-media-field { border: 0; margin: 0; min-width: 0; padding: 0; }
        .wwh-team-media-field legend, .wwh-team-accent-field > span:first-child { display: block; font-weight: 600; margin-bottom: 6px; }
        .wwh-team-media-preview { background: #f0f0f1; display: block; height: 92px; margin-bottom: 8px; object-fit: cover; width: 100%; }
        .wwh-team-logo-preview { object-fit: contain; }
        .wwh-team-focal-preview { background: #f0f0f1; border: 0; cursor: crosshair; display: block; margin: 0 0 8px; padding: 0; position: relative; width: 100%; }
        .wwh-team-focal-preview:focus { box-shadow: 0 0 0 2px #2271b1; outline: 2px solid transparent; }
        .wwh-team-focal-preview .wwh-team-media-preview { margin: 0; pointer-events: none; }
        .wwh-team-focal-marker { background: #fff; border: 2px solid #1d2327; border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,.8); height: 14px; pointer-events: none; position: absolute; transform: translate(-50%, -50%); width: 14px; }
        .wwh-team-focal-marker::before, .wwh-team-focal-marker::after { background: #1d2327; content: ""; left: 50%; position: absolute; top: 50%; transform: translate(-50%, -50%); }
        .wwh-team-focal-marker::before { height: 2px; width: 22px; }
        .wwh-team-focal-marker::after { height: 22px; width: 2px; }
        .wwh-team-focal-controls { align-items: center; display: flex; flex-wrap: wrap; font-size: 12px; gap: 8px; justify-content: space-between; }
        .wwh-team-focal-output { color: #50575e; }
        .wwh-team-focal-help { margin-top: 6px !important; }
        .wwh-team-accent-field { display: block; }
        .wwh-team-accent-field input { display: block; max-width: 140px; width: 100%; }
        .wwh-team-accent-field .description { display: block; margin-top: 4px; }
        .wwh-team-overview { margin-top: 22px; }
        .wwh-team-overview-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 12px; }
        .wwh-team-overview-card { background: #fff; border: 1px solid #dcdcde; min-height: 120px; padding: 14px; }
        .wwh-team-overview-card h3 { font-size: 13px; margin: 0 0 8px; }
        .wwh-team-overview-card strong { display: block; font-size: 16px; line-height: 1.35; }
        .wwh-team-overview-card p { margin: 8px 0 0; }
        .wwh-team-season-form { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
        .wwh-team-season-form label { font-weight: 600; }
        .wwh-team-create-card { background: #fff; border: 1px solid #dcdcde; margin-top: 18px; max-width: 900px; padding: 18px; }
        .wwh-team-create-card h2 { margin-top: 0; }
        .wwh-team-create-fields { display: grid; gap: 14px 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .wwh-team-create-fields label { display: block; font-weight: 600; }
        .wwh-team-create-fields label .description { font-weight: 400; }
        .wwh-team-create-fields input { display: block; margin-top: 5px; max-width: 100%; width: 100%; }
        .wwh-team-create-fields .description { display: block; margin-top: 4px; }
        .wwh-game-picker { display: grid; gap: 10px; }
        .wwh-game-picker-label, .wwh-game-picker-error { margin: 0; }
        .wwh-game-picker-label { color: #50575e; }
        .wwh-game-picker-error { color: #b32d2e; }
        .wwh-game-picker-preview, .wwh-game-picker-result { border: 1px solid #dcdcde; display: grid; gap: 4px; padding: 10px; text-align: left; width: 100%; }
        .wwh-game-picker-preview { background: #f6f7f7; }
        .wwh-game-picker-preview strong, .wwh-game-picker-result strong { color: #1d2327; line-height: 1.2; }
        .wwh-game-picker-preview span, .wwh-game-picker-result span { color: #646970; display: block; font-size: 12px; line-height: 1.25; white-space: normal; }
        .wwh-game-picker-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .wwh-game-picker-results { display: grid; gap: 8px; max-height: 320px; overflow: auto; }
        @media (max-width: 1100px) { .wwh-team-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 782px) { .wwh-fields, .wwh-team-settings-grid, .wwh-team-media-fields, .wwh-team-create-fields, .wwh-team-overview-grid { grid-template-columns: 1fr; } .wwh-sports-team-filters input[type="search"] { min-width: 0; width: 100%; } .wwh-sports-archived-team-list { columns: 1; } .wwh-sports-actions { white-space: normal; } }
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

    register_rest_field('attachment', 'weeklyWildcatImage', [
        'get_callback' => 'wwh_rest_image_credit',
        'schema' => [
            'description' => 'Byline image credit and license metadata (legacy field name retained).',
            'type' => 'object',
            'context' => ['view', 'edit'],
        ],
    ]);
    register_rest_field('attachment', 'bylineImage', [
        'get_callback' => 'wwh_rest_image_credit',
        'schema' => ['description' => 'Byline image credit and license metadata.', 'type' => 'object', 'context' => ['view', 'edit']],
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
    ];
}

function wwh_rest_image_credit(array $attachment): array
{
    $attachment_id = isset($attachment['id']) ? absint($attachment['id']) : 0;

    return [
        'creator' => wwh_image_meta_value($attachment_id, 'creator'),
        'creditText' => wwh_image_meta_value($attachment_id, 'credit_text'),
        'copyrightNotice' => wwh_image_meta_value($attachment_id, 'copyright_notice'),
        'licenseUrl' => wwh_image_meta_value($attachment_id, 'license_url'),
        'acquireLicensePage' => wwh_image_meta_value($attachment_id, 'acquire_license_url'),
    ];
}

function wwh_rest_author_profile(array $user): array
{
    $user_id = isset($user['id']) ? absint($user['id']) : 0;
    $photo_id = absint(get_user_meta($user_id, '_ww_author_photo_id', true));
    $socials = [];

    foreach (wwh_author_social_fields() as $key => $_label) {
        $socials[$key] = wwh_author_meta_value($user_id, '_ww_author_social_' . $key);
    }

    return [
        'pronouns' => wwh_author_meta_value($user_id, '_ww_author_pronouns'),
        'role' => wwh_author_meta_value($user_id, '_ww_author_role'),
        'founder' => wwh_author_meta_value($user_id, '_ww_author_founder') === '1',
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
    return wwh_public_site_url() . '/sports/schedule/#game-' . absint($game_id);
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

        <a class="article-game-link" href="<?php echo esc_url($game_url); ?>">View Game Center &rarr;</a>
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
require_once __DIR__ . '/includes/sports/admin.php';
require_once __DIR__ . '/includes/content/newsroom-blocks.php';
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
