<?php
/** PHP 7.4-safe loader; the optional MCP runtime needs PHP 8.2 and OpenSSL. */
if (!defined('ABSPATH')) { exit; }

function byline_mcp_available(): bool
{
    return PHP_VERSION_ID >= 80200 && extension_loaded('openssl') && file_exists(__DIR__ . '/../../build/mcp/vendor/autoload.php');
}
function byline_mcp_endpoint(): string { return untrailingslashit(home_url('/mcp')); }
function byline_mcp_is_path(string $path): bool
{
    $base = untrailingslashit((string) wp_parse_url(home_url('/'), PHP_URL_PATH));
    return $path === $base . '/mcp' || strpos($path, $base . '/mcp/') === 0
        || $path === $base . '/.well-known/oauth-authorization-server'
        || $path === $base . '/.well-known/oauth-protected-resource/mcp';
}
function byline_mcp_load(): bool
{
    if (!byline_mcp_available()) { return false; }
    require_once __DIR__ . '/../../build/mcp/vendor/autoload.php';
    require_once __DIR__ . '/storage.php';
    require_once __DIR__ . '/oauth.php';
    require_once __DIR__ . '/tools.php';
    require_once __DIR__ . '/server.php';
    require_once __DIR__ . '/http.php';
    return true;
}
add_action('parse_request', static function (): void {
    $path = (string) wp_parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (!byline_mcp_is_path($path)) { return; }
    // Runs before the normal CMS frontend login redirect. No rewrite flush needed.
    if (!byline_mcp_load()) { status_header(503); nocache_headers(); header('Content-Type: application/json'); echo wp_json_encode(['error'=>'MCP requires PHP 8.2+, OpenSSL and the complete Byline release ZIP.']); exit; }
    \Byline\Mcp\serve();
}, 0);
add_action('byline_mcp_cleanup', static function (): void { if (byline_mcp_load()) { \Byline\Mcp\Store::cleanup(); } });
add_action('after_password_reset', static function ($user): void { if (byline_mcp_load() && get_option('byline_mcp_schema')) { \Byline\Mcp\Store::revokeActor((int)$user->ID); } });
add_action('deleted_user', static function ($id): void { if (byline_mcp_load() && get_option('byline_mcp_schema')) { \Byline\Mcp\Store::revokeActor((int)$id); } });
add_action('show_user_profile', 'byline_mcp_profile');
function byline_mcp_profile($user): void
{
    if ((int)$user->ID !== get_current_user_id() || !current_user_can('edit_posts')) { return; }
    echo '<h2>Byline MCP</h2><p>Connect your AI client to <code>' . esc_html(byline_mcp_endpoint()) . '</code> using OAuth and your WordPress account.</p>';
    if (!byline_mcp_load()) { echo '<p>MCP needs PHP 8.2+, OpenSSL and the complete Byline plugin release.</p>'; return; }
    \Byline\Mcp\Store::install();
    global $wpdb;
    $rows = $wpdb->get_col($wpdb->prepare('SELECT payload FROM ' . \Byline\Mcp\Store::table() . " WHERE kind='grant' AND actor=%d AND expires>%d ORDER BY expires DESC LIMIT 100", get_current_user_id(), time()));
    foreach ($rows as $raw) {
        $grant = json_decode($raw, true);
        $url = wp_nonce_url(add_query_arg(['action'=>'byline_mcp_disconnect','grant'=>$grant['id']],admin_url('admin-post.php')),'byline_mcp_disconnect:' . $grant['id']);
        echo '<p>' . esc_html($grant['name']) . ' — <a href="' . esc_url($url) . '">Disconnect</a></p>';
    }
}
add_action('admin_post_byline_mcp_disconnect', static function (): void {
    $grant = sanitize_text_field(wp_unslash($_GET['grant'] ?? ''));
    check_admin_referer('byline_mcp_disconnect:' . $grant);
    if (!byline_mcp_load() || !get_option('byline_mcp_schema')) { wp_die('MCP is unavailable.'); }
    global $wpdb;
    $actor = (int)$wpdb->get_var($wpdb->prepare('SELECT actor FROM ' . \Byline\Mcp\Store::table() . ' WHERE id=%s', \Byline\Mcp\Store::key('grant',$grant)));
    if ($actor !== get_current_user_id() || !$actor) { wp_die('You cannot disconnect this connection.', '', ['response'=>403]); }
    \Byline\Mcp\Store::revoke($grant);
    wp_safe_redirect(admin_url('profile.php')); exit;
});
