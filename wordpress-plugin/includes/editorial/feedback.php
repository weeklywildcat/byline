<?php

/**
 * Private reader feedback storage and abuse/privacy helpers.
 *
 * The public endpoint should call byline_submit_reader_feedback() and pass the
 * request origin/IP.  The latter is used only to derive a salted transient key;
 * it is never written to the feedback post or retained as editorial data.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_FEEDBACK_POST_TYPE = 'byline_feedback';
const BYLINE_FEEDBACK_TYPE_META = '_byline_feedback_type';
const BYLINE_FEEDBACK_MESSAGE_META = '_byline_feedback_message';
const BYLINE_FEEDBACK_NAME_META = '_byline_feedback_name';
const BYLINE_FEEDBACK_EMAIL_META = '_byline_feedback_email';
const BYLINE_FEEDBACK_STATUS_META = '_byline_feedback_status';
const BYLINE_FEEDBACK_STORY_META = '_byline_feedback_story_id';
const BYLINE_FEEDBACK_RATE_PREFIX = 'byline_feedback_rl_';
const BYLINE_FEEDBACK_RATE_LIMIT = 5;
const BYLINE_FEEDBACK_RATE_WINDOW = 3600;

/** @return array<string,string> */
function byline_feedback_types(): array
{
    return [
        'correction' => 'Correction',
        'tip' => 'Tip',
        'general' => 'General feedback',
    ];
}

/** @return array<string,string> */
function byline_feedback_statuses(): array
{
    return [
        'new' => 'New',
        'reviewed' => 'Reviewed',
        'closed' => 'Closed',
        'spam' => 'Spam',
    ];
}

function byline_sanitize_feedback_type($value): string
{
    $type = sanitize_key((string) $value);

    return array_key_exists($type, byline_feedback_types()) ? $type : 'general';
}

function byline_sanitize_feedback_status($value): string
{
    $status = sanitize_key((string) $value);

    return array_key_exists($status, byline_feedback_statuses()) ? $status : 'new';
}

function byline_sanitize_feedback_message($value): string
{
    $value = function_exists('sanitize_textarea_field')
        ? sanitize_textarea_field((string) $value)
        : sanitize_text_field((string) $value);

    return function_exists('mb_substr') ? mb_substr($value, 0, 5000) : substr($value, 0, 5000);
}

function byline_sanitize_feedback_name($value): string
{
    $value = sanitize_text_field((string) $value);

    return function_exists('mb_substr') ? mb_substr($value, 0, 120) : substr($value, 0, 120);
}

function byline_sanitize_feedback_email($value): string
{
    $value = trim((string) $value);
    if ($value === '' || strlen($value) > 320 || !filter_var($value, FILTER_VALIDATE_EMAIL)) {
        return '';
    }

    return function_exists('sanitize_email') ? sanitize_email($value) : strtolower($value);
}

function byline_feedback_post_is_public_story(int $story_id): bool
{
    $story = get_post($story_id);

    return $story instanceof WP_Post && $story->post_type === 'post' && $story->post_status === 'publish';
}

/** @return array<string,mixed> */
function byline_sanitize_feedback_input(array $input): array
{
    return [
        'storyId' => absint($input['storyId'] ?? $input['postId'] ?? 0),
        'type' => byline_sanitize_feedback_type($input['type'] ?? 'general'),
        'message' => byline_sanitize_feedback_message($input['message'] ?? ''),
        'name' => byline_sanitize_feedback_name($input['name'] ?? ''),
        'email' => byline_sanitize_feedback_email($input['email'] ?? ''),
        'honeypot' => trim((string) ($input['website'] ?? $input['url'] ?? $input['honeypot'] ?? '')),
    ];
}

function byline_feedback_secret(): string
{
    foreach (['AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT'] as $constant) {
        if (defined($constant) && (string) constant($constant) !== '') {
            return (string) constant($constant);
        }
    }
    if (function_exists('wp_salt')) {
        $salt = wp_salt('auth');
        if (is_string($salt) && $salt !== '') {
            return $salt;
        }
    }

    // This is a last-resort per-install process secret.  It is never persisted
    // as reader data and is preferable to putting a raw address in a transient.
    static $fallback = null;
    if ($fallback === null) {
        $fallback = function_exists('wp_generate_password')
            ? wp_generate_password(64, true, true)
            : hash('sha256', __FILE__ . '|' . PHP_VERSION);
    }

    return (string) $fallback;
}

function byline_feedback_rate_key(string $ip): string
{
    $ip = trim($ip);
    if ($ip === '') {
        return '';
    }

    return BYLINE_FEEDBACK_RATE_PREFIX . hash_hmac('sha256', $ip, byline_feedback_secret());
}

function byline_feedback_rate_limited(string $ip, int $limit = BYLINE_FEEDBACK_RATE_LIMIT, int $window = BYLINE_FEEDBACK_RATE_WINDOW): bool
{
    $key = byline_feedback_rate_key($ip);
    if ($key === '') {
        return false;
    }

    $count = get_transient($key);
    $count = is_numeric($count) ? (int) $count : 0;
    if ($count >= max(1, $limit)) {
        return true;
    }

    set_transient($key, $count + 1, max(1, $window));

    return false;
}

function byline_feedback_request_ip(): string
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
}

function byline_feedback_normalize_origin(string $origin): string
{
    $origin = trim($origin);
    if ($origin === '' || !preg_match('#^https?://#i', $origin)) {
        return '';
    }

    $parts = function_exists('wp_parse_url') ? wp_parse_url($origin) : parse_url($origin);
    if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])
        || isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/'
        || isset($parts['query']) || isset($parts['fragment']) || isset($parts['user']) || isset($parts['pass'])) {
        return '';
    }
    $scheme = strtolower((string) $parts['scheme']);
    $host = strtolower((string) $parts['host']);
    $port = isset($parts['port']) ? ':' . absint($parts['port']) : '';

    return $scheme . '://' . $host . $port;
}

function byline_feedback_configured_public_origin(): string
{
    $config = function_exists('byline_get_publication_config') ? byline_get_publication_config() : [];
    $configured = is_array($config) && is_array($config['urls'] ?? null) ? (string) ($config['urls']['publicSite'] ?? '') : '';
    if ($configured === '' && function_exists('home_url')) {
        $configured = (string) home_url('/');
    }

    return byline_feedback_normalize_origin($configured);
}

function byline_feedback_is_development_environment(): bool
{
    if (function_exists('wp_get_environment_type')) {
        return in_array(wp_get_environment_type(), ['local', 'development'], true);
    }

    return defined('WP_ENVIRONMENT_TYPE') && in_array((string) constant('WP_ENVIRONMENT_TYPE'), ['local', 'development'], true);
}

function byline_feedback_allowed_cors_origin(string $origin): string
{
    $normalized = byline_feedback_normalize_origin($origin);
    if ($normalized === '') {
        return '';
    }

    if ($normalized === byline_feedback_configured_public_origin()) {
        return $normalized;
    }

    // Local development is explicit and bounded to loopback hosts; production
    // never accepts a wildcard or arbitrary Origin.
    if (byline_feedback_is_development_environment()
        && preg_match('#^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$#i', $normalized) === 1) {
        return $normalized;
    }

    return '';
}

/** @return array<string,string> */
function byline_feedback_cors_headers(string $origin): array
{
    $allowed = byline_feedback_allowed_cors_origin($origin);
    if ($allowed === '') {
        return [];
    }

    return [
        'Access-Control-Allow-Origin' => $allowed,
        'Access-Control-Allow-Methods' => 'POST, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type',
        'Vary' => 'Origin',
    ];
}

/** @return array<string,mixed>|WP_Error */
function byline_submit_reader_feedback(array $input, ?string $ip = null, ?string $origin = null)
{
    $data = byline_sanitize_feedback_input($input);
    if ($data['honeypot'] !== '') {
        return new WP_Error('byline_feedback_spam', 'This submission could not be accepted.', ['status' => 400]);
    }
    if ($data['message'] === '') {
        return new WP_Error('byline_feedback_empty_message', 'Add a message before sending.', ['status' => 400]);
    }
    if (!byline_feedback_post_is_public_story((int) $data['storyId'])) {
        return new WP_Error('byline_feedback_story_not_found', 'That article is not available for feedback.', ['status' => 404]);
    }
    if ($origin !== null && byline_feedback_allowed_cors_origin($origin) === '') {
        return new WP_Error('byline_feedback_origin_not_allowed', 'This feedback form is not available from that site.', ['status' => 403]);
    }
    $ip = $ip ?? byline_feedback_request_ip();
    if (byline_feedback_rate_limited($ip)) {
        return new WP_Error('byline_feedback_rate_limited', 'Please wait before sending more feedback.', ['status' => 429]);
    }

    $post_id = wp_insert_post([
        'post_type' => BYLINE_FEEDBACK_POST_TYPE,
        'post_status' => 'private',
        'post_parent' => (int) $data['storyId'],
        'post_title' => sprintf('Reader feedback: %s', byline_feedback_types()[$data['type']]),
        'post_content' => '',
        'post_author' => 0,
    ], true);
    if (is_wp_error($post_id)) {
        return $post_id;
    }
    $post_id = absint($post_id);
    if ($post_id <= 0) {
        return new WP_Error('byline_feedback_save_failed', 'The feedback could not be saved.', ['status' => 500]);
    }

    update_post_meta($post_id, BYLINE_FEEDBACK_TYPE_META, $data['type']);
    update_post_meta($post_id, BYLINE_FEEDBACK_MESSAGE_META, $data['message']);
    if ($data['name'] !== '') {
        update_post_meta($post_id, BYLINE_FEEDBACK_NAME_META, $data['name']);
    }
    if ($data['email'] !== '') {
        update_post_meta($post_id, BYLINE_FEEDBACK_EMAIL_META, $data['email']);
    }
    update_post_meta($post_id, BYLINE_FEEDBACK_STATUS_META, 'new');
    update_post_meta($post_id, BYLINE_FEEDBACK_STORY_META, (int) $data['storyId']);

    return byline_get_feedback($post_id);
}

/** @return array<string,mixed> */
function byline_get_feedback(int $feedback_id): array
{
    $feedback = get_post($feedback_id);
    if (!$feedback instanceof WP_Post || $feedback->post_type !== BYLINE_FEEDBACK_POST_TYPE) {
        return [];
    }

    return [
        'id' => (int) $feedback->ID,
        'storyId' => absint($feedback->post_parent ?? get_post_meta($feedback_id, BYLINE_FEEDBACK_STORY_META, true)),
        'type' => byline_sanitize_feedback_type(get_post_meta($feedback_id, BYLINE_FEEDBACK_TYPE_META, true)),
        'message' => byline_sanitize_feedback_message(get_post_meta($feedback_id, BYLINE_FEEDBACK_MESSAGE_META, true)),
        'name' => byline_sanitize_feedback_name(get_post_meta($feedback_id, BYLINE_FEEDBACK_NAME_META, true)),
        'email' => byline_sanitize_feedback_email(get_post_meta($feedback_id, BYLINE_FEEDBACK_EMAIL_META, true)),
        'status' => byline_sanitize_feedback_status(get_post_meta($feedback_id, BYLINE_FEEDBACK_STATUS_META, true)),
        'createdAt' => (string) ($feedback->post_date_gmt ?? $feedback->post_date ?? ''),
    ];
}

/** @return array<int,array<string,mixed>> */
function byline_list_feedback(array $args = []): array
{
    $query = [
        'post_type' => BYLINE_FEEDBACK_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => min(100, max(1, absint($args['limit'] ?? 50))),
        'numberposts' => min(100, max(1, absint($args['limit'] ?? 50))),
        'orderby' => 'date',
        'order' => 'DESC',
    ];
    if (isset($args['storyId'])) {
        $query['post_parent'] = absint($args['storyId']);
    }
    $records = get_posts($query);
    $result = [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post || $record->post_type !== BYLINE_FEEDBACK_POST_TYPE) {
            continue;
        }
        $item = byline_get_feedback((int) $record->ID);
        if ($item === []) {
            continue;
        }
        if (isset($args['status']) && $item['status'] !== byline_sanitize_feedback_status($args['status'])) {
            continue;
        }
        $result[] = $item;
    }

    return $result;
}

function byline_update_feedback_status(int $feedback_id, string $status): bool
{
    $feedback = byline_get_feedback($feedback_id);
    if ($feedback === [] || !current_user_can('edit_posts')) {
        return false;
    }
    update_post_meta($feedback_id, BYLINE_FEEDBACK_STATUS_META, byline_sanitize_feedback_status($status));

    return true;
}

/**
 * Return a prefilled draft for the correction editor.  It does not create or
 * publish anything; the editor must explicitly submit edited text through the
 * structured correction API.
 *
 * @return array<string,mixed>|WP_Error
 */
function byline_feedback_correction_draft(int $feedback_id)
{
    $feedback = byline_get_feedback($feedback_id);
    if ($feedback === [] || !current_user_can('edit_posts')) {
        return new WP_Error('byline_feedback_forbidden', 'You are not allowed to use this feedback.', ['status' => 403]);
    }
    if ($feedback['status'] === 'spam') {
        return new WP_Error('byline_feedback_spam', 'Spam feedback cannot become a correction.', ['status' => 400]);
    }

    return [
        'storyId' => (int) $feedback['storyId'],
        'type' => 'correction',
        'text' => (string) $feedback['message'],
        'feedbackId' => (int) $feedback['id'],
    ];
}

/** @return array<string,mixed>|WP_Error */
function byline_create_correction_from_feedback(int $feedback_id, string $edited_text, ?int $user_id = null)
{
    $draft = byline_feedback_correction_draft($feedback_id);
    if (is_wp_error($draft)) {
        return $draft;
    }
    if (trim($edited_text) === '') {
        return new WP_Error('byline_feedback_empty_correction', 'Edit the correction text before saving.', ['status' => 400]);
    }
    if (!function_exists('byline_create_correction')) {
        return new WP_Error('byline_correction_unavailable', 'Structured corrections are not available.', ['status' => 500]);
    }

    $result = byline_create_correction((int) $draft['storyId'], ['type' => 'correction', 'text' => $edited_text], $user_id);
    if (is_wp_error($result)) {
        return $result;
    }
    byline_update_feedback_status($feedback_id, 'reviewed');

    return $result;
}

/** @return array<string,mixed> */
function byline_feedback_personal_data_exporter(string $email_address, int $page = 1, int $number = 100): array
{
    $number = max(1, min(100, $number));
    $records = get_posts([
        'post_type' => BYLINE_FEEDBACK_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => $number,
        'numberposts' => $number,
        'paged' => max(1, $page),
        'meta_key' => BYLINE_FEEDBACK_EMAIL_META,
        'meta_value' => byline_sanitize_feedback_email($email_address),
    ]);
    $data = [];
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post) {
            continue;
        }
        $item = byline_get_feedback((int) $record->ID);
        if ($item === []) {
            continue;
        }
        $data[] = [
            'group_id' => 'byline-feedback',
            'group_label' => 'Byline reader feedback',
            'item_id' => 'feedback-' . (int) $item['id'],
            'data' => [
                ['name' => 'Article ID', 'value' => (string) $item['storyId']],
                ['name' => 'Type', 'value' => (string) $item['type']],
                ['name' => 'Message', 'value' => (string) $item['message']],
                ['name' => 'Name', 'value' => (string) $item['name']],
                ['name' => 'Email', 'value' => (string) $item['email']],
            ],
        ];
    }

    return ['data' => $data, 'done' => count($records) < $number];
}

/** @return array<string,mixed> */
function byline_feedback_personal_data_eraser(string $email_address, int $page = 1, int $number = 100): array
{
    $number = max(1, min(100, $number));
    $records = get_posts([
        'post_type' => BYLINE_FEEDBACK_POST_TYPE,
        'post_status' => 'private',
        'posts_per_page' => $number,
        'numberposts' => $number,
        'paged' => max(1, $page),
        'meta_key' => BYLINE_FEEDBACK_EMAIL_META,
        'meta_value' => byline_sanitize_feedback_email($email_address),
    ]);
    $items_removed = 0;
    foreach (is_array($records) ? $records : [] as $record) {
        if (!$record instanceof WP_Post) {
            continue;
        }
        // The message may itself contain personal data, so erase the whole
        // private submission rather than retaining an orphaned transcript.
        if (function_exists('wp_delete_post') && wp_delete_post((int) $record->ID, true)) {
            $items_removed++;
        }
    }

    return [
        'items_removed' => $items_removed > 0,
        'items_retained' => false,
        'messages' => [],
        'done' => count($records) < $number,
    ];
}

function byline_feedback_register_privacy_hooks(): void
{
    if (function_exists('add_filter')) {
        add_filter('wp_privacy_personal_data_exporters', static function (array $exporters): array {
            $exporters['byline-feedback'] = [
                'exporter_friendly_name' => 'Byline reader feedback',
                'callback' => 'byline_feedback_personal_data_exporter',
            ];
            return $exporters;
        });
        add_filter('wp_privacy_personal_data_erasers', static function (array $erasers): array {
            $erasers['byline-feedback'] = [
                'eraser_friendly_name' => 'Byline reader feedback',
                'callback' => 'byline_feedback_personal_data_eraser',
            ];
            return $erasers;
        });
    }
}
add_action('init', 'byline_feedback_register_privacy_hooks');

function byline_feedback_register_post_type(): void
{
    if (!function_exists('register_post_type')) {
        return;
    }

    register_post_type(BYLINE_FEEDBACK_POST_TYPE, [
        'labels' => ['name' => 'Reader feedback', 'singular_name' => 'Reader feedback'],
        'public' => false,
        'publicly_queryable' => false,
        'exclude_from_search' => true,
        'show_ui' => false,
        'show_in_rest' => false,
        'supports' => ['title'],
        'map_meta_cap' => true,
        'capability_type' => 'post',
    ]);
}
add_action('init', 'byline_feedback_register_post_type');

function byline_feedback_register_meta(): void
{
    if (!function_exists('register_post_meta')) {
        return;
    }

    foreach ([
        BYLINE_FEEDBACK_TYPE_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_feedback_type'],
        BYLINE_FEEDBACK_MESSAGE_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_feedback_message'],
        BYLINE_FEEDBACK_NAME_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_feedback_name'],
        BYLINE_FEEDBACK_EMAIL_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_feedback_email'],
        BYLINE_FEEDBACK_STATUS_META => ['type' => 'string', 'sanitize_callback' => 'byline_sanitize_feedback_status'],
        BYLINE_FEEDBACK_STORY_META => ['type' => 'integer', 'sanitize_callback' => 'absint'],
    ] as $key => $definition) {
        register_post_meta(BYLINE_FEEDBACK_POST_TYPE, $key, [
            'single' => true,
            'type' => $definition['type'],
            'sanitize_callback' => $definition['sanitize_callback'],
            'show_in_rest' => false,
            'auth_callback' => static function (): bool {
                return current_user_can('edit_posts');
            },
        ]);
    }
}
add_action('init', 'byline_feedback_register_meta');
