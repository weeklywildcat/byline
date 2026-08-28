<?php

/**
 * Standalone regression coverage for the private newsletter issue workflow.
 *
 * This deliberately models only the WordPress APIs used by the integration so
 * provider lifecycle and privacy behavior can be tested without a database or
 * external credentials.
 */

define('ABSPATH', __DIR__ . '/../');
const BYLINE_MANAGE_INTEGRATIONS_CAPABILITY = 'manage_byline_integrations';

$options = [];
$post_meta = [];
$posts = [];
$routes = [];
$actions = [];
$remote_requests = [];
$remote_campaigns = 0;
$current_user = 7;

class WP_Error
{
    public $code;
    public $message;
    public $data;

    public function __construct($code = '', $message = '', $data = [])
    {
        $this->code = $code;
        $this->message = $message;
        $this->data = $data;
    }

    public function get_error_code(): string
    {
        return (string) $this->code;
    }
}

class WP_REST_Server
{
    const READABLE = 'GET';
    const CREATABLE = 'POST';
    const EDITABLE = 'PUT';
}

class WP_Post
{
    public $ID;
    public $post_type = 'post';
    public $post_status = 'publish';
    public $post_title = '';
    public $post_excerpt = '';
    public $post_author = 7;
}

class NewsletterRegressionRequest
{
    public function __construct(private array $params) {}
    public function get_json_params(): array { return $this->params; }
    public function get_params(): array { return $this->params; }
    public function get_param(string $key) { return $this->params[$key] ?? null; }
}

function newsletter_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

function is_wp_error($value): bool { return $value instanceof WP_Error; }
function add_action(string $hook, $callback, int $priority = 10, int $accepted_args = 1): void { global $actions; $actions[$hook][] = $callback; }
function register_rest_route(string $namespace, string $route, $definition): void { global $routes; $routes[$namespace . $route] = $definition; }
function register_post_type(string $type, array $args = []): void { global $registered_post_type; $registered_post_type = [$type, $args]; }
function register_post_meta(string $type, string $key, array $args = []): void {}
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_email($value): string { return filter_var((string) $value, FILTER_SANITIZE_EMAIL); }
function is_email($value) { return filter_var((string) $value, FILTER_VALIDATE_EMAIL) !== false ? (string) $value : false; }
function esc_url_raw($url, array $protocols = []): string
{
    if (!is_string($url) || filter_var($url, FILTER_VALIDATE_URL) === false) return '';
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    return $protocols === [] || in_array($scheme, $protocols, true) ? $url : '';
}
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function absint($value): int { return abs((int) $value); }
function wp_json_encode($value): string { return json_encode($value); }
function rest_ensure_response($value) { return $value; }
function get_option(string $key, $default = false) { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }
function update_option(string $key, $value, $autoload = false): bool { global $options; $options[$key] = $value; return true; }
function get_post_meta(int $post_id, string $key, $single = false) { global $post_meta; return $post_meta[$post_id][$key] ?? ($single ? '' : []); }
function update_post_meta(int $post_id, string $key, $value): bool { global $post_meta; $post_meta[$post_id][$key] = $value; return true; }
function delete_post_meta(int $post_id, string $key): bool { global $post_meta; unset($post_meta[$post_id][$key]); return true; }
function get_post(int $post_id) { global $posts; return $posts[$post_id] ?? null; }
function get_post_type(int $post_id): string { $post = get_post($post_id); return $post ? (string) $post->post_type : ''; }
function get_permalink(int $post_id): string { return 'https://example.test/stories/' . $post_id . '/'; }
function get_the_title(int $post_id): string { $post = get_post($post_id); return $post ? (string) $post->post_title : ''; }
function get_the_excerpt(int $post_id): string { $post = get_post($post_id); return $post ? (string) $post->post_excerpt : ''; }
function get_bloginfo(string $show = ''): string { return $show === 'name' ? 'Example Newsroom' : ''; }
function get_current_user_id(): int { global $current_user; return $current_user; }
function current_user_can(string $capability, ...$args): bool { return $capability === BYLINE_MANAGE_INTEGRATIONS_CAPABILITY; }
function wp_timezone(): DateTimeZone { return new DateTimeZone('UTC'); }
function wp_timezone_string(): string { return 'UTC'; }
function wp_insert_post(array $data, bool $wp_error = false)
{
    global $posts;
    $id = $posts === [] ? 100 : max(array_keys($posts)) + 1;
    $post = new WP_Post();
    $post->ID = $id;
    $post->post_type = (string) ($data['post_type'] ?? 'post');
    $post->post_status = (string) ($data['post_status'] ?? 'draft');
    $post->post_title = (string) ($data['post_title'] ?? '');
    $post->post_author = absint($data['post_author'] ?? 0);
    $posts[$id] = $post;
    return $id;
}
function wp_update_post(array $data, bool $wp_error = false)
{
    $post = get_post(absint($data['ID'] ?? 0));
    if (!$post) return 0;
    if (array_key_exists('post_title', $data)) $post->post_title = (string) $data['post_title'];
    return $post->ID;
}
function wp_delete_post(int $post_id, bool $force = false)
{
    global $posts, $post_meta;
    if (!isset($posts[$post_id])) return false;
    unset($posts[$post_id], $post_meta[$post_id]);
    return true;
}
function get_posts(array $args = []): array
{
    global $posts;
    $result = [];
    foreach ($posts as $post) {
        $types = (array) ($args['post_type'] ?? 'post');
        if (!in_array($post->post_type, $types, true)) continue;
        if (isset($args['s']) && $args['s'] !== '' && stripos($post->post_title, (string) $args['s']) === false) continue;
        $result[] = $post;
    }
    return $result;
}

function wp_remote_retrieve_response_code($response): int { return (int) ($response['response']['code'] ?? 0); }
function wp_remote_retrieve_body($response): string { return (string) ($response['body'] ?? ''); }
function wp_safe_remote_request(string $url, array $args = [])
{
    global $remote_requests, $remote_campaigns;
    $remote_requests[] = ['url' => $url, 'args' => $args];
    $method = strtoupper((string) ($args['method'] ?? 'GET'));
    if (strpos($url, '.api.mailchimp.com/3.0/campaigns') !== false && $method === 'POST' && substr($url, -10) === '/campaigns') {
        $remote_campaigns++;
        return ['response' => ['code' => 200], 'body' => json_encode(['id' => 'campaign-' . $remote_campaigns])];
    }
    if (strpos($url, '.api.mailchimp.com/3.0') !== false) {
        return ['response' => ['code' => 200], 'body' => json_encode(['id' => 'ok'])];
    }
    if (strpos($url, 'webhook.example.test') !== false) {
        return ['response' => ['code' => 202], 'body' => json_encode(['accepted' => true])];
    }
    return ['response' => ['code' => 200], 'body' => json_encode([])];
}

require __DIR__ . '/../includes/integrations/http.php';
require __DIR__ . '/../includes/integrations/newsletter.php';

$posts[7] = (object) ['ID' => 7, 'post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Campus update', 'post_excerpt' => 'A useful reported update.'];
$posts[8] = (object) ['ID' => 8, 'post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Sports desk', 'post_excerpt' => 'A second story.'];
$options[BYLINE_NEWSLETTER_SETTINGS_OPTION] = [
    'provider' => 'mailchimp',
    'mailchimp' => [
        'apiKey' => 'mailchimp-secret',
        'serverPrefix' => 'us1',
        'audienceId' => 'audience-1',
        'testRecipient' => 'test@example.test',
    ],
];

$definitions = byline_newsletter_provider_definitions();
newsletter_assert(!empty($definitions['mailchimp']['capabilities']['sendTest']), 'Mailchimp did not advertise test send support.');
newsletter_assert(!empty($definitions['mailchimp']['capabilities']['immediateSend']), 'Mailchimp did not advertise immediate send support.');
newsletter_assert(!empty($definitions['mailchimp']['capabilities']['remoteScheduling']), 'Mailchimp did not advertise remote scheduling support.');
newsletter_assert(empty($definitions['kit']['capabilities']['sendTest']), 'Kit advertised an unsupported issue test send.');
newsletter_assert(empty($definitions['buttondown']['capabilities']['immediateSend']), 'Buttondown advertised an unsupported issue send.');
newsletter_assert(empty($definitions['signup-link']['capabilities']['immediateSend']), 'Signup-link advertised an unsupported issue send.');

$issue = byline_newsletter_issue_create_or_update([
    'title' => 'Friday briefing',
    'subject' => 'The Friday briefing',
    'preheader' => 'The latest from campus',
    'audience' => 'audience-1',
    'providerId' => 'mailchimp',
    'leadStoryId' => 7,
    'additionalStoryIds' => [8, 8],
    'sectionHeadings' => ['Top stories'],
    'intro' => 'Hello readers',
    'outro' => 'See you next week',
]);
newsletter_assert(is_array($issue) && ($issue['id'] ?? 0) > 0, 'A private newsletter issue was not created.');
$issue_id = (int) $issue['id'];
newsletter_assert(($issue['additionalStoryIds'] ?? []) === [8], 'Story attachments were not normalized and deduplicated.');
newsletter_assert(($posts[$issue_id]->post_type ?? '') === BYLINE_NEWSLETTER_ISSUE_POST_TYPE, 'Newsletter issue did not use the private WordPress post type.');
$invalid_attachment = byline_newsletter_issue_create_or_update(['title' => 'Broken issue', 'subject' => 'Broken issue', 'providerId' => 'mailchimp', 'leadStoryId' => 999]);
newsletter_assert(is_wp_error($invalid_attachment) && $invalid_attachment->get_error_code() === 'byline_newsletter_story_missing', 'Saving a stale story attachment was accepted.');

$added = byline_newsletter_issue_add_story($issue_id, 7, 'additional');
newsletter_assert(($added['additionalStoryIds'] ?? []) === [8], 'Adding an already-selected lead story was not idempotent.');
$missing = byline_newsletter_issue_add_story($issue_id, 999, 'additional');
newsletter_assert(is_wp_error($missing) && $missing->get_error_code() === 'byline_newsletter_story_missing', 'Missing story attachment was accepted.');

$test_send = byline_newsletter_issue_action($issue_id, 'send-test', ['recipient' => 'preview@example.test']);
newsletter_assert(is_array($test_send) && !empty($test_send['newsletter']), 'Mailchimp test send did not return the issue.');
$after_test = byline_newsletter_issue_record($issue_id);
newsletter_assert($after_test['status'] === 'draft' && $after_test['providerExternalId'] === 'campaign-1', 'Test send changed status or failed to retain the reusable campaign id.');
newsletter_assert(strpos((string) $after_test['htmlSnapshot'], 'Campus update') !== false, 'Test send did not retain the rendered HTML snapshot.');

$sent = byline_newsletter_issue_action($issue_id, 'send');
newsletter_assert(($sent['newsletter']['status'] ?? '') === 'sent', 'Mailchimp immediate send did not transition to sent.');
$request_count = count($remote_requests);
$repeat = byline_newsletter_issue_action($issue_id, 'send');
newsletter_assert(!empty($repeat['idempotent']) && count($remote_requests) === $request_count, 'Repeated send was not idempotent.');

$scheduled_issue = byline_newsletter_issue_create_or_update([
    'title' => 'Scheduled briefing',
    'subject' => 'Scheduled briefing',
    'providerId' => 'mailchimp',
    'audience' => 'audience-1',
    'leadStoryId' => 7,
]);
$scheduled_id = (int) $scheduled_issue['id'];
$scheduled = byline_newsletter_issue_action($scheduled_id, 'schedule', ['scheduledAt' => gmdate('c', time() + 3600)]);
newsletter_assert(($scheduled['newsletter']['status'] ?? '') === 'scheduled', 'Mailchimp schedule did not transition to scheduled.');
$schedule_repeat = byline_newsletter_issue_action($scheduled_id, 'schedule', ['scheduledAt' => gmdate('c', time() + 7200)]);
newsletter_assert(!empty($schedule_repeat['idempotent']), 'Repeated scheduling was not idempotent.');
$cancelled = byline_newsletter_issue_action($scheduled_id, 'cancel');
newsletter_assert(($cancelled['newsletter']['status'] ?? '') === 'cancelled', 'Mailchimp schedule cancellation did not transition to cancelled.');
$cancel_repeat = byline_newsletter_issue_action($scheduled_id, 'cancel');
newsletter_assert(!empty($cancel_repeat['idempotent']), 'Repeated schedule cancellation was not idempotent.');

$options[BYLINE_NEWSLETTER_SETTINGS_OPTION] = [
    'provider' => 'webhook',
    'webhook' => ['webhookUrl' => 'https://webhook.example.test/newsletter', 'authToken' => 'webhook-secret'],
];
$webhook_issue = byline_newsletter_issue_create_or_update([
    'title' => 'Webhook briefing',
    'subject' => 'Webhook briefing',
    'providerId' => 'webhook',
    'leadStoryId' => 8,
]);
$webhook_id = (int) $webhook_issue['id'];
$webhook_test = byline_newsletter_issue_action($webhook_id, 'send-test');
newsletter_assert(is_array($webhook_test) && !empty($webhook_test['newsletter']), 'Webhook test send failed.');
$webhook_sent = byline_newsletter_issue_action($webhook_id, 'send');
newsletter_assert(($webhook_sent['newsletter']['status'] ?? '') === 'sent', 'Webhook immediate send failed.');
$last_request = $remote_requests[count($remote_requests) - 1] ?? [];
newsletter_assert(($last_request['args']['headers']['Authorization'] ?? '') === 'Bearer webhook-secret', 'Webhook authorization header was not sent.');
newsletter_assert(strpos(json_encode($webhook_sent), 'webhook-secret') === false, 'Webhook secret leaked into the REST result.');

$options[BYLINE_NEWSLETTER_SETTINGS_OPTION] = ['provider' => 'kit', 'kit' => ['apiKey' => 'kit-secret', 'formId' => '123']];
$kit_issue = byline_newsletter_issue_create_or_update(['title' => 'Kit issue', 'subject' => 'Kit issue', 'providerId' => 'kit', 'leadStoryId' => 7]);
$kit_result = byline_newsletter_issue_action((int) $kit_issue['id'], 'send');
newsletter_assert(is_wp_error($kit_result) && $kit_result->get_error_code() === 'byline_newsletter_capability_unavailable', 'Kit delivery was not rejected as unsupported.');

byline_register_newsletter_hooks();
newsletter_assert(isset($actions['init']) && in_array('byline_newsletter_register_issue_post_type', $actions['init'], true), 'Private issue CPT registration was not hooked to init.');
byline_register_newsletter_routes();
foreach ([
    'byline/v1/admin/newsletters',
    'byline/v1/admin/newsletters/(?P<id>\\d+)',
    'byline/v1/admin/newsletters/(?P<id>\\d+)/stories',
    'byline/v1/admin/newsletters/(?P<id>\\d+)/send-test',
    'byline/v1/admin/newsletters/(?P<id>\\d+)/send',
    'byline/v1/admin/newsletters/(?P<id>\\d+)/schedule',
    'byline/v1/admin/newsletters/(?P<id>\\d+)/cancel',
] as $route) {
    newsletter_assert(isset($routes[$route]), 'Missing protected newsletter route: ' . $route);
}
newsletter_assert(($routes['byline/v1/admin/newsletters']['0']['permission_callback'] ?? null) === 'byline_newsletter_can_edit_issues', 'Newsletter issue route was not capability protected.');

$list = byline_newsletter_issue_list(['status' => 'sent']);
newsletter_assert(($list['total'] ?? 0) >= 1 && isset($list['items'][0]['htmlSnapshot']), 'Issue list did not return normalized private issue records.');
$deleted = byline_newsletter_rest_delete(new NewsletterRegressionRequest(['id' => $kit_issue['id']]));
newsletter_assert(!empty($deleted['deleted']) && byline_newsletter_issue_record((int) $kit_issue['id']) === null, 'Draft issue deletion did not remove the WordPress-backed record.');

echo "Byline newsletter issues backend regression passed.\n";
