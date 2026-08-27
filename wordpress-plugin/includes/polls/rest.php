<?php

/**
 * Public poll REST API.
 *
 * These are the canonical Byline poll endpoints and the only place poll state
 * is served or mutated for anonymous visitors. The publication's edge proxy
 * forwards /api/polls/* here; no browser needs to reach the CMS directly.
 */

if (!defined('ABSPATH')) {
    exit;
}

// User-facing messages are a preserved contract with the existing frontend.
const BYLINE_POLL_ERROR_NO_ACTIVE_POLL = 'No active poll is available.';
const BYLINE_POLL_ERROR_CHOOSE_OPTION = 'Choose a poll option before voting.';
const BYLINE_POLL_ERROR_NOT_OPEN = 'Poll is not open.';
const BYLINE_POLL_ERROR_WRONG_POLL = 'That answer does not belong to this poll.';
const BYLINE_POLL_ERROR_ALREADY_VOTED = 'Already voted.';
const BYLINE_POLL_ERROR_NOT_CONFIGURED = 'Poll voting is not configured yet.';
const BYLINE_POLL_ERROR_THROTTLED = 'Too many poll requests. Try again shortly.';

const BYLINE_POLL_MAX_REQUEST_BYTES = 2048;
const BYLINE_POLL_RATE_LIMIT_WINDOW = 60;
const BYLINE_POLL_RATE_LIMIT_MAX = 12;

/**
 * Emit poll cookies as separate Set-Cookie headers, and record what was issued.
 *
 * They deliberately do not go through WP_REST_Response::header(): that method
 * comma-joins a repeated header, which is right for most headers and wrong for
 * Set-Cookie, where two cookies would reach the browser as one malformed value.
 * The publication's edge proxy reads these and re-emits them for the public
 * domain, so each one has to be its own header.
 *
 * Passing an array records and sends that set; passing nothing returns the set
 * the current request issued, which is what lets callers and tests observe the
 * cookies without them ever being serialised into a response body.
 *
 * @param array<int,string>|null $cookies
 * @return array<int,string>
 */
function byline_poll_issued_cookies(?array $cookies = null): array
{
    static $issued = [];

    if ($cookies === null) {
        return $issued;
    }

    $issued = $cookies;

    if (!headers_sent()) {
        foreach ($cookies as $cookie) {
            header('Set-Cookie: ' . $cookie, false);
        }
    }

    return $issued;
}

/**
 * Poll responses are live state and must never be cached by the edge, the
 * browser, or anything between them.
 *
 * @param array<string,mixed> $body
 * @param array<int,string> $cookies
 */
function byline_poll_rest_response(array $body, int $status = 200, array $cookies = []): WP_REST_Response
{
    $response = new WP_REST_Response($body, $status);
    $response->header('Cache-Control', 'no-store');
    byline_poll_issued_cookies($cookies);

    return $response;
}

/**
 * @param array<string,mixed>|null $poll
 * @param array<int,string> $cookies
 */
function byline_poll_rest_error(string $message, int $status, ?array $poll = null, array $cookies = []): WP_REST_Response
{
    $body = ['error' => $message];
    if ($poll !== null) {
        $body['poll'] = $poll;
    }

    return byline_poll_rest_response($body, $status, $cookies);
}

/**
 * Client bucket for short-window throttling.
 *
 * The address is never stored: it is HMAC'd with the site's poll secret and the
 * digest lives only in a 60-second transient. Behind a proxy the forwarded
 * address is used only when the deployment declares the proxy trustworthy,
 * because otherwise a client could spoof its own bucket.
 */
function byline_poll_client_bucket(WP_REST_Request $request): string
{
    $address = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';

    if (defined('BYLINE_POLL_TRUSTED_PROXY') && constant('BYLINE_POLL_TRUSTED_PROXY')) {
        foreach (['cf-connecting-ip', 'x-forwarded-for'] as $header) {
            $forwarded = (string) $request->get_header($header);
            if ($forwarded !== '') {
                $address = trim(explode(',', $forwarded)[0]);
                break;
            }
        }
    }

    return substr(hash_hmac('sha256', $address, byline_poll_signing_secret()), 0, 32);
}

function byline_poll_rate_limit_exceeded(WP_REST_Request $request): bool
{
    $key = 'byline_poll_rl_' . byline_poll_client_bucket($request);
    $attempts = (int) get_transient($key);

    if ($attempts >= BYLINE_POLL_RATE_LIMIT_MAX) {
        return true;
    }

    set_transient($key, $attempts + 1, BYLINE_POLL_RATE_LIMIT_WINDOW);

    return false;
}

function byline_poll_rest_get_active(WP_REST_Request $request)
{
    $record = byline_poll_active_record();

    if ($record === null) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NO_ACTIVE_POLL, 404);
    }

    // Only checked once a poll is actually active, so the common "no poll" path
    // costs nothing. Reporting the misconfiguration beats serving a poll whose
    // totals cannot be read.
    if (!byline_poll_votes_table_exists()) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_CONFIGURED, 500);
    }

    return byline_poll_rest_response(byline_poll_public_payload($record));
}

function byline_poll_rest_get_results(WP_REST_Request $request)
{
    if (!byline_poll_feature_enabled()) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NO_ACTIVE_POLL, 404);
    }

    $post = byline_poll_find_post_by_public_id((string) $request['id']);
    if (!$post instanceof WP_Post || $post->post_status !== 'publish') {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NO_ACTIVE_POLL, 404);
    }

    $record = byline_poll_record($post);
    if ($record['status'] === BYLINE_POLL_STATUS_DRAFT) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NO_ACTIVE_POLL, 404);
    }

    if (!byline_poll_votes_table_exists()) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_CONFIGURED, 500);
    }

    $payload = byline_poll_public_payload($record);
    $payload['status'] = $record['status'];

    return byline_poll_rest_response($payload);
}

/**
 * Record one anonymous vote.
 *
 * Nothing here trusts the client: the poll must exist, the voting window is
 * evaluated server-side, the answer must belong to that poll, and duplicate
 * protection is the table's unique key rather than a prior read.
 */
function byline_poll_rest_vote(WP_REST_Request $request)
{
    if (!byline_poll_feature_enabled()) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_OPEN, 404);
    }

    if (strlen((string) $request->get_body()) > BYLINE_POLL_MAX_REQUEST_BYTES) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_CHOOSE_OPTION, 400);
    }

    $poll_id = byline_poll_sanitize_public_id($request->get_param('pollId'));
    $option_id = byline_poll_sanitize_public_id($request->get_param('optionId'));

    if ($poll_id === '' || $option_id === '') {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_CHOOSE_OPTION, 400);
    }

    if (byline_poll_rate_limit_exceeded($request)) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_THROTTLED, 429);
    }

    $secret = byline_poll_signing_secret();
    if ($secret === '' || !byline_poll_votes_table_exists()) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_CONFIGURED, 500);
    }

    $post = byline_poll_find_post_by_public_id($poll_id);
    if (!$post instanceof WP_Post) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_OPEN, 404);
    }

    $record = byline_poll_record($post);
    if (!byline_poll_record_is_open($record)) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_OPEN, 404);
    }

    if (!in_array($option_id, array_column($record['options'], 'id'), true)) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_WRONG_POLL, 400);
    }

    $cookies = [];
    $voter_id = byline_poll_read_signed_voter_id($request->get_header('cookie'), $secret);
    if ($voter_id === null) {
        $voter_id = byline_poll_create_voter_id();
        $cookies[] = byline_poll_voter_cookie(byline_poll_sign_voter_id($voter_id, $secret));
    }

    $result = byline_poll_insert_vote($poll_id, $option_id, byline_poll_voter_key($voter_id, $secret));

    if ($result === BYLINE_POLL_VOTE_FAILED) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_NOT_CONFIGURED, 500, null, $cookies);
    }

    $cookies[] = byline_poll_voted_cookie($poll_id);
    $payload = byline_poll_public_payload($record);

    if ($result === BYLINE_POLL_VOTE_DUPLICATE) {
        return byline_poll_rest_error(BYLINE_POLL_ERROR_ALREADY_VOTED, 409, $payload, $cookies);
    }

    return byline_poll_rest_response($payload, 200, $cookies);
}

function byline_register_poll_routes(): void
{
    register_rest_route(BYLINE_REST_NAMESPACE, '/polls/active', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_poll_rest_get_active',
        'permission_callback' => '__return_true',
    ]);

    // No 'args' schema: WordPress's own validation error shape would replace the
    // poll error messages the publication depends on. The callback validates and
    // reports every case itself.
    register_rest_route(BYLINE_REST_NAMESPACE, '/polls/vote', [
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'byline_poll_rest_vote',
        'permission_callback' => '__return_true',
    ]);

    register_rest_route(BYLINE_REST_NAMESPACE, '/polls/(?P<id>[A-Za-z0-9_-]{1,64})/results', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'byline_poll_rest_get_results',
        'permission_callback' => '__return_true',
    ]);
}
add_action('rest_api_init', 'byline_register_poll_routes');
