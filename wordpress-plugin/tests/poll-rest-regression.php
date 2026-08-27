<?php

/**
 * Public poll REST behavior: routes, voting, duplicate protection, cookie
 * compatibility, caching, throttling, and the feature flag.
 */

require __DIR__ . '/helpers/poll-test-harness.php';

global $wpdb, $byline_test_rest_routes, $byline_test_features, $byline_test_posts;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

byline_register_poll_post_type();
byline_register_poll_routes();

foreach ([
    'byline/v1/polls/active' => WP_REST_Server::READABLE,
    'byline/v1/polls/vote' => WP_REST_Server::CREATABLE,
] as $route => $method) {
    byline_test_assert(isset($byline_test_rest_routes[$route]), "Route {$route} must be registered.");
    byline_test_assert($byline_test_rest_routes[$route]['methods'] === $method, "Route {$route} must use {$method}.");
    byline_test_assert(
        $byline_test_rest_routes[$route]['permission_callback'] === '__return_true',
        "Route {$route} must stay reachable without a WordPress login."
    );
}
byline_test_assert(
    isset($byline_test_rest_routes['byline/v1/polls/(?P<id>[A-Za-z0-9_-]{1,64})/results']),
    'The public results route must be registered with a bounded id pattern.'
);

// ---------------------------------------------------------------------------
// Active poll
// ---------------------------------------------------------------------------

$post_id = byline_test_create_poll('What should we cover next?', ['More school news', 'More sports coverage'], BYLINE_POLL_STATUS_OPEN, '', '', '2026-08-20 00:00:00');
$record = byline_poll_record(get_post($post_id));
$poll_id = $record['id'];
$options = $record['options'];

$response = byline_poll_rest_get_active(new WP_REST_Request());
byline_test_assert($response->get_status() === 200, 'An open poll is served with 200.');
byline_test_assert($response->get_headers()['Cache-Control'] === ['no-store'], 'The active poll response must be no-store.');
$body = $response->get_data();
byline_test_assert($body['id'] === $poll_id, 'The active poll reports its stable id.');
byline_test_assert($body['question'] === 'What should we cover next?', 'The active poll reports its question.');
byline_test_assert(count($body['options']) === 2, 'The active poll reports its answers.');
byline_test_assert($body['totalVotes'] === 0, 'A fresh poll reports no votes.');
byline_test_assert(array_keys($body) === ['id', 'question', 'options', 'totalVotes', 'resultsAvailable'], 'The public poll shape is the documented contract.');

$byline_test_features = ['polls' => false];
$disabled = byline_poll_rest_get_active(new WP_REST_Request());
byline_test_assert($disabled->get_status() === 404, 'A disabled polls module returns a safe no-poll response.');
byline_test_assert($disabled->get_data()['error'] === BYLINE_POLL_ERROR_NO_ACTIVE_POLL, 'The disabled response reuses the no-poll message.');
byline_test_assert($disabled->get_headers()['Cache-Control'] === ['no-store'], 'Even the empty response is no-store.');

$vote_disabled = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($vote_disabled->get_status() === 404, 'A disabled polls module must not accept votes.');
byline_test_assert($wpdb->rows === [], 'No vote is stored while polls are disabled.');
$byline_test_features = ['polls' => true];

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$vote = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($vote->get_status() === 200, 'A valid vote succeeds.');
byline_test_assert(byline_poll_vote_total($poll_id) === 1, 'The vote count increments immediately.');
byline_test_assert($vote->get_data()['resultsAvailable'] === false, 'A single vote is below the public threshold.');
byline_test_assert($vote->get_data()['totalVotes'] === 0, 'The voter is not handed the running total of a low-response poll.');
byline_test_assert($vote->get_headers()['Cache-Control'] === ['no-store'], 'A vote response is no-store.');
byline_test_assert(count($wpdb->rows) === 1, 'Exactly one vote row is written.');

$stored = $wpdb->rows[0];
byline_test_assert($stored['poll_id'] === $poll_id, 'The vote row references the stable poll id.');
byline_test_assert($stored['option_id'] === $options[0]['id'], 'The vote row references the stable answer id.');
byline_test_assert($stored['created_at'] !== '', 'The vote row is timestamped.');
byline_test_assert(array_keys($stored) === ['poll_id', 'option_id', 'voter_key', 'created_at', 'id'], 'Nothing beyond the documented columns is written.');

// Cookies.
$cookies = byline_poll_issued_cookies();
byline_test_assert(count($cookies) === 2, 'A first-time voter receives the voter cookie and the voted marker.');
byline_test_assert(
    !isset($vote->get_headers()['Set-Cookie']),
    'Poll cookies must not be routed through WP_REST_Response::header(), which comma-joins a repeated header and would emit two cookies as one malformed value.'
);
byline_test_assert(
    strpos(implode('|', $cookies), ', ') === false,
    'Each poll cookie must be its own Set-Cookie value.'
);
$voter_cookie = $cookies[0];
$voted_cookie = $cookies[1];

byline_test_assert(strpos($voter_cookie, 'ww_voter_id=') === 0, 'The voter cookie keeps its public name.');
byline_test_assert(strpos($voter_cookie, 'HttpOnly') !== false, 'The voter cookie stays HttpOnly.');
byline_test_assert(strpos($voter_cookie, 'Secure') !== false, 'The voter cookie stays Secure.');
byline_test_assert(strpos($voter_cookie, 'SameSite=Lax') !== false, 'The voter cookie stays SameSite=Lax.');
byline_test_assert(strpos($voter_cookie, 'Path=/') !== false, 'The voter cookie is site-wide.');
byline_test_assert(stripos($voter_cookie, 'Domain=') === false, 'Poll cookies must be host-agnostic so the edge proxy can emit them.');

byline_test_assert(strpos($voted_cookie, 'ww_poll_voted_' . $poll_id . '=true') === 0, 'The voted marker keeps its public name and value.');
byline_test_assert(strpos($voted_cookie, 'HttpOnly') === false, 'The voted marker must stay readable by the poll widget.');
byline_test_assert(strpos($voted_cookie, 'SameSite=Lax') !== false, 'The voted marker stays SameSite=Lax.');
byline_test_assert(stripos($voted_cookie, 'Domain=') === false, 'The voted marker is host-agnostic too.');

// The raw voter id is never stored.
preg_match('/^ww_voter_id=([^;]+)/', $voter_cookie, $matches);
$signed = rawurldecode($matches[1]);
$raw_voter_id = explode('.', $signed)[0];
byline_test_assert($raw_voter_id !== '', 'The issued cookie carries a voter id.');
byline_test_assert($stored['voter_key'] !== $raw_voter_id, 'The stored key is not the voter id.');
byline_test_assert(strpos((string) json_encode($wpdb->rows), $raw_voter_id) === false, 'The raw voter id must never reach storage.');
byline_test_assert(strpos((string) json_encode($vote->get_data()), $stored['voter_key']) === false, 'The voter key must never reach a public response.');

// ---------------------------------------------------------------------------
// Duplicate protection
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$duplicate = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[1]['id'], 'ww_voter_id=' . rawurlencode($signed)));
byline_test_assert($duplicate->get_status() === 409, 'A returning voter receives a deterministic 409.');
byline_test_assert($duplicate->get_data()['error'] === BYLINE_POLL_ERROR_ALREADY_VOTED, 'The duplicate message is preserved.');
byline_test_assert(isset($duplicate->get_data()['poll']), 'A duplicate response still returns current poll state.');
byline_test_assert(byline_poll_vote_total($poll_id) === 1, 'A duplicate vote does not inflate the total.');
byline_test_assert(count($wpdb->rows) === 1, 'A duplicate vote writes no row.');
byline_test_assert(count(byline_poll_issued_cookies()) === 1, 'A recognised voter is not issued a second voter cookie.');
byline_test_assert(strpos(byline_poll_issued_cookies()[0], 'ww_poll_voted_') === 0, 'A duplicate still marks the browser as having voted.');

// A tampered signature is rejected and the visitor is treated as new.
byline_test_reset_rate_limit();
$forged = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[1]['id'], 'ww_voter_id=' . rawurlencode($raw_voter_id . '.forged-signature')));
byline_test_assert($forged->get_status() === 200, 'A forged cookie does not block voting; it is simply not trusted.');
byline_test_assert(count(byline_poll_issued_cookies()) === 2, 'A forged cookie is replaced with a freshly signed one.');
byline_test_assert(count($wpdb->rows) === 2, 'The untrusted visitor is counted as a new voter.');

// Crossing the threshold releases the total and the per-answer split together.
byline_test_reset_rate_limit();
for ($filler = 0; $filler < BYLINE_POLL_MIN_RESULTS_VOTES; $filler++) {
    byline_poll_insert_vote($poll_id, $options[0]['id'], 'threshold-voter-' . $filler);
}
$released = byline_poll_rest_get_active(new WP_REST_Request());
byline_test_assert($released->get_data()['resultsAvailable'] === true, 'Reaching the threshold releases results.');
byline_test_assert($released->get_data()['totalVotes'] === byline_poll_vote_total($poll_id), 'Released results report the true total.');
byline_test_assert($released->get_data()['options'][0]['votes'] > 0, 'Released results report per-answer counts.');
$wpdb->rows = array_slice($wpdb->rows, 0, 2);

// ---------------------------------------------------------------------------
// Optional proxy trust boundary
// ---------------------------------------------------------------------------

// Unset by default: poll routes stay reachable without any proxy credential.
byline_test_assert(byline_poll_proxy_secret() === '', 'No proxy secret is configured by default.');
byline_test_assert(byline_poll_check_proxy_trust(new WP_REST_Request()) === true, 'Without a configured secret every client is accepted.');

define('BYLINE_POLL_PROXY_SECRET', 'proxy-shared-secret');

byline_test_reset_rate_limit();
$anonymous = byline_poll_rest_get_active(new WP_REST_Request());
byline_test_assert($anonymous->get_status() === 403, 'With a proxy secret set, an arbitrary public client is refused.');
byline_test_assert($anonymous->get_data()['error'] === BYLINE_POLL_ERROR_UNTRUSTED_CLIENT, 'The refusal message names the client, not the secret.');
byline_test_assert(
    strpos((string) json_encode($anonymous->get_data()), 'proxy-shared-secret') === false,
    'A refusal must never echo the proxy secret.'
);

$wrong = byline_poll_rest_get_active(new WP_REST_Request([], ['X-Byline-Poll-Proxy' => 'guessed']));
byline_test_assert($wrong->get_status() === 403, 'A wrong proxy credential is refused.');

$trusted_request = new WP_REST_Request([], ['X-Byline-Poll-Proxy' => 'proxy-shared-secret']);
byline_test_assert(byline_poll_rest_get_active($trusted_request)->get_status() === 200, 'The publication proxy is accepted.');

byline_test_reset_rate_limit();
$untrusted_vote = byline_poll_rest_vote(new WP_REST_Request(
    ['pollId' => $poll_id, 'optionId' => $options[0]['id']],
    ['Content-Type' => 'application/json'],
    (string) json_encode(['pollId' => $poll_id, 'optionId' => $options[0]['id']])
));
byline_test_assert($untrusted_vote->get_status() === 403, 'The vote route is behind the same boundary.');
byline_test_assert(count($wpdb->rows) === 2, 'A refused client writes no vote.');

$untrusted_results = byline_poll_rest_get_results(new WP_REST_Request(['id' => $poll_id]));
byline_test_assert($untrusted_results->get_status() === 403, 'The results route is behind the same boundary.');

byline_test_assert(
    byline_poll_rest_get_results(new WP_REST_Request(['id' => $poll_id], ['X-Byline-Poll-Proxy' => 'proxy-shared-secret']))->get_status() === 200,
    'A trusted caller still reads results.'
);

// From here on every case speaks through the trusted proxy; the harness adds
// the credential to its request builders once the secret is configured.

// ---------------------------------------------------------------------------
// Cookie compatibility with the retired Worker implementation
// ---------------------------------------------------------------------------

$legacy_signed = 'LegacyVoter-000000000000000.gK8nnp2quXnTBE0-ZPN90GKx05G8wVk47fR0GrZuUdc';
$legacy_voter_key = '0ZtYMhz_g4Q9DFkprjzF61ldOqq36LaEiwJx5dmAICg';

byline_test_assert(
    byline_poll_read_signed_voter_id('ww_voter_id=' . rawurlencode($legacy_signed), BYLINE_POLL_COOKIE_SECRET) === 'LegacyVoter-000000000000000',
    'A cookie signed by the retired Worker must still validate.'
);
byline_test_assert(
    byline_poll_voter_key('LegacyVoter-000000000000000', BYLINE_POLL_COOKIE_SECRET) === $legacy_voter_key,
    'Voter keys must derive identically to the retired implementation.'
);
byline_test_assert(
    byline_poll_read_signed_voter_id('ww_voter_id=' . rawurlencode($legacy_signed), 'a-different-secret') === null,
    'A cookie signed with another secret must not validate.'
);
byline_test_assert(
    byline_poll_read_signed_voter_id('ww_voter_id=a.b.c', BYLINE_POLL_COOKIE_SECRET) === null,
    'A malformed voter cookie is rejected.'
);

// A visitor whose migrated vote already exists is recognised, not double counted.
byline_test_reset_rate_limit();
$wpdb->rows = [];
byline_poll_insert_vote($poll_id, $options[0]['id'], $legacy_voter_key, '2026-08-21 10:00:00');
$returning = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[1]['id'], 'ww_voter_id=' . rawurlencode($legacy_signed)));
byline_test_assert($returning->get_status() === 409, 'A migrated voter is still recognised after the cutover.');
byline_test_assert(count($wpdb->rows) === 1, 'A migrated voter cannot vote a second time.');

// ---------------------------------------------------------------------------
// Rejected votes
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$wpdb->rows = [];

foreach ([
    ['', $options[0]['id'], 400, BYLINE_POLL_ERROR_CHOOSE_OPTION, 'a missing poll id'],
    [$poll_id, '', 400, BYLINE_POLL_ERROR_CHOOSE_OPTION, 'a missing answer id'],
    ['unknown-poll', $options[0]['id'], 404, BYLINE_POLL_ERROR_NOT_OPEN, 'an unknown poll'],
    [$poll_id, 'opt_not_here', 400, BYLINE_POLL_ERROR_WRONG_POLL, 'an answer from another poll'],
] as [$submitted_poll, $submitted_option, $status, $message, $description]) {
    byline_test_reset_rate_limit();
    $rejected = byline_poll_rest_vote(byline_test_vote_request($submitted_poll, $submitted_option));
    byline_test_assert($rejected->get_status() === $status, "Voting with {$description} must return {$status}.");
    byline_test_assert($rejected->get_data()['error'] === $message, "The message for {$description} is preserved.");
}
byline_test_assert($wpdb->rows === [], 'A rejected vote never writes a row.');

// Closed and scheduled polls are refused server-side.
byline_poll_set_status($post_id, BYLINE_POLL_STATUS_CLOSED);
byline_test_reset_rate_limit();
$closed = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($closed->get_status() === 404 && $closed->get_data()['error'] === BYLINE_POLL_ERROR_NOT_OPEN, 'A closed poll refuses votes.');

byline_poll_set_status($post_id, BYLINE_POLL_STATUS_OPEN);
byline_poll_set_schedule($post_id, '2099-01-01 00:00:00', '');
byline_test_reset_rate_limit();
$future = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($future->get_status() === 404, 'A scheduled poll refuses votes before it opens.');

byline_poll_set_schedule($post_id, '', '2000-01-01 00:00:00');
byline_test_reset_rate_limit();
$expired = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($expired->get_status() === 404, 'An expired poll refuses votes.');
byline_poll_set_schedule($post_id, '', '');
byline_test_assert($wpdb->rows === [], 'No out-of-window vote is stored.');

// Oversized payloads are refused before any lookup.
byline_test_reset_rate_limit();
$oversized = byline_poll_rest_vote(new WP_REST_Request(
    ['pollId' => $poll_id, 'optionId' => $options[0]['id']],
    byline_test_proxy_headers(['Content-Type' => 'application/json']),
    str_repeat('x', BYLINE_POLL_MAX_REQUEST_BYTES + 1)
));
byline_test_assert($oversized->get_status() === 400, 'An oversized vote body is refused.');

// Absurd identifiers never reach storage.
byline_test_reset_rate_limit();
$long = byline_poll_rest_vote(byline_test_vote_request(str_repeat('a', 65), $options[0]['id']));
byline_test_assert($long->get_status() === 400, 'An over-long poll id is refused.');

// ---------------------------------------------------------------------------
// Throttling
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$statuses = [];
for ($attempt = 0; $attempt <= BYLINE_POLL_RATE_LIMIT_MAX; $attempt++) {
    $statuses[] = byline_poll_rest_vote(byline_test_vote_request('unknown-poll', $options[0]['id']))->get_status();
}
byline_test_assert($statuses[0] === 404, 'The first attempt is evaluated normally.');
byline_test_assert(end($statuses) === 429, 'A burst of vote attempts is throttled.');

global $byline_test_transients;
$bucket_keys = array_values(array_filter(array_keys($byline_test_transients), static function (string $key): bool {
    return strpos($key, 'byline_poll_rl_') === 0;
}));
byline_test_assert(count($bucket_keys) === 1, 'Throttling uses one bucket per client.');
byline_test_assert(
    strpos($bucket_keys[0], (string) ($_SERVER['REMOTE_ADDR'] ?? 'no-address')) === false,
    'The throttle bucket must not contain a raw address.'
);

// ---------------------------------------------------------------------------
// Results endpoint
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$wpdb->rows = [];
byline_poll_insert_vote($poll_id, $options[0]['id'], 'results-voter-1');

$results = byline_poll_rest_get_results(byline_test_proxy_request(['id' => $poll_id]));
byline_test_assert($results->get_status() === 200, 'Published poll results are public.');
byline_test_assert($results->get_data()['resultsAvailable'] === false, 'The results route applies the same suppression.');
byline_test_assert(array_sum(array_column($results->get_data()['options'], 'votes')) === 0, 'Suppressed results expose no per-answer counts.');
byline_test_assert($results->get_data()['status'] === BYLINE_POLL_STATUS_OPEN, 'The results route reports the poll lifecycle state.');
byline_test_assert($results->get_headers()['Cache-Control'] === ['no-store'], 'Results are no-store.');

byline_test_assert(
    byline_poll_rest_get_results(byline_test_proxy_request(['id' => 'unknown-poll']))->get_status() === 404,
    'An unknown poll has no public results.'
);

$drafted = byline_test_create_poll('Drafted', ['A', 'B'], BYLINE_POLL_STATUS_DRAFT);
byline_test_assert(
    byline_poll_rest_get_results(byline_test_proxy_request(['id' => byline_poll_public_id($drafted)]))->get_status() === 404,
    'A drafted poll exposes no public results.'
);

// ---------------------------------------------------------------------------
// Misconfiguration is reported, not silently mis-accepted
// ---------------------------------------------------------------------------

byline_test_reset_rate_limit();
$wpdb->installed = false;
$unconfigured = byline_poll_rest_vote(byline_test_vote_request($poll_id, $options[0]['id']));
byline_test_assert($unconfigured->get_status() === 500, 'Missing vote storage is a server error, not a silent success.');
byline_test_assert($unconfigured->get_data()['error'] === BYLINE_POLL_ERROR_NOT_CONFIGURED, 'The unconfigured message is preserved.');

$unreadable = byline_poll_rest_get_active(byline_test_proxy_request());
byline_test_assert($unreadable->get_status() === 500, 'Serving a poll whose totals cannot be read is reported, not attempted.');
byline_test_assert($unreadable->get_data()['error'] === BYLINE_POLL_ERROR_NOT_CONFIGURED, 'The active-poll route reports the same misconfiguration.');

$unreadable_results = byline_poll_rest_get_results(byline_test_proxy_request(['id' => $poll_id]));
byline_test_assert($unreadable_results->get_status() === 500, 'The results route reports missing storage rather than querying it.');

// An answer can never look vote-free just because storage is unavailable, so a
// destructive removal cannot slip through during a broken deployment.
$merge = byline_poll_merge_options($poll_id, byline_poll_options($post_id), []);
byline_test_assert($merge['options'] === [], 'With no vote table there are genuinely no votes to protect.');

$wpdb->installed = true;

echo "Byline poll REST regression passed.\n";
