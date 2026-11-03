<?php
/** Actual WordPress meta, REST capabilities, keyset scanning and durable triage. */
$checks = 0; $created = [];
$assert = static function ($condition, string $message) use (&$checks): void { $checks++; if (!$condition) { throw new RuntimeException($message); } };
$request = static function (string $path, string $method = 'GET', array $body = []) {
    $request = new WP_REST_Request($method, '/byline/v1/admin/content-health' . $path);
    if ($body) { $request->set_header('Content-Type', 'application/json'); $request->set_body(wp_json_encode($body)); }
    return rest_do_request($request);
};
$prior = get_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, null);
$disabled = get_option('byline_content_health_disabled_checks', null);
$code = 404;
$http = static function ($preempt, $args, $url) use (&$code) {
    return ['headers' => [], 'body' => '', 'response' => ['code' => $code, 'message' => 'Fixture'], 'cookies' => []];
};
add_filter('pre_http_request', $http, 99, 3);
try {
    wp_set_current_user(1);
    delete_option('byline_content_health_disabled_checks');
    $story = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Health regression published', 'post_content' => '<!-- wp:paragraph --><p><a href="https://public.example.test/missing-a">A</a> <a href="https://public.example.test/missing-b">B</a></p><!-- /wp:paragraph -->']);
    $created[] = $story;
    $first = $request("/story/$story/recheck", 'POST');
    $assert($first->get_status() === 200, 'Numeric story recheck succeeds');
    $issues = $first->get_data()['issues'];
    $assert(count(array_filter($issues, static fn($issue) => $issue['checkId'] === 'broken-link')) === 2, 'Broken URLs share a stable check key');
    $assert(!in_array('featured-image-alt', array_column($issues, 'checkId'), true) && !in_array('image-credit', array_column($issues, 'checkId'), true), 'Missing image suppresses dependent findings');
    $assert(count(array_unique(array_column($issues, 'id'))) === 3, 'Occurrences remain independently identifiable');
    $assert(array_unique(array_column($issues, 'state')) === ['new'], 'First durable findings are new');
    $assert(isset($issues[1]['fixTarget']['blockPath']), 'Broken link retains its Gutenberg block target');
    $second = $request("/story/$story/recheck", 'POST')->get_data();
    $assert(array_unique(array_column($second['issues'], 'state')) === ['existing'], 'Consecutive scan recognizes existing findings');
    $code = 200;
    $resolved = $request("/story/$story/recheck", 'POST')->get_data();
    $assert(count($resolved['issues']) === 1, 'Successful URLs disappear from the active queue');
    $code = 404;
    $regressed = $request("/story/$story/recheck", 'POST')->get_data();
    $assert(count(array_filter($regressed['issues'], static fn($issue) => $issue['state'] === 'regressed')) === 2, 'Resolved links later reappear as regressed');
    $ignored = $request('/disposition', 'POST', ['postId' => $story, 'checkId' => 'broken-link', 'reason' => "Editor's intentional archive"]);
    $assert($ignored->get_status() === 200, 'Ignore check for one story');
    $triage = $request("/story/$story")->get_data();
    $assert(count($triage['issues']) === 1 && count($triage['ignored']) === 2, 'Ignored occurrences leave active totals');
    $assert($triage['ignored'][0]['ignored']['by'] === 1 && $triage['ignored'][0]['ignored']['reason'] === "Editor's intentional archive", 'Ignore attribution/reason survives WordPress slashing');
    $code = 200;
    $request("/story/$story/recheck", 'POST');
    $assert(count($request("/story/$story")->get_data()['ignored']) === 1, 'Resolved ignored checks remain restorable');
    $request('/disposition', 'POST', ['postId' => $story, 'checkId' => 'broken-link', 'restore' => true]);
    $assert(count($request("/story/$story")->get_data()['ignored']) === 0, 'Restore clears the separate ignore state');
    $request('/disposition', 'POST', ['checkId' => 'featured-image', 'scope' => 'global']);
    $assert(count($request("/story/$story")->get_data()['issues']) === 0, 'Disabled checks leave active totals');
    $request('/disposition', 'POST', ['checkId' => 'featured-image', 'scope' => 'global', 'restore' => true]);
    $assert(count($request("/story/$story")->get_data()['issues']) === 1, 'Managers can enable a disabled check');
    for ($i = 0; $i < 32; $i++) { $created[] = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Health full-scan fixture ' . $i]); }
    delete_option(BYLINE_CONTENT_HEALTH_SCAN_STATE);
    $start = $request('/scan', 'POST');
    $assert($start->get_status() === 200 && $start->get_data()['checked'] === 0 && $start->get_data()['total'] > 25, 'Run scan initiates an honest complete generation');
    $generation = $start->get_data();
    $assert($request('/scan', 'POST')->get_data() === $generation, 'Run scan resumes instead of restarting progress');
    for ($i = 0; $i <= $generation['total'] + 1; $i++) { $progress = byline_content_health_scan_batch(); if (!$progress['running']) { break; } }
    $assert(!$progress['running'] && $progress['checked'] === $generation['total'] && $progress['failed'] === 0, 'Real keyset scan covers every published story past 25');
    $assert(!empty($progress['lastFullScanAt']), 'Only completed generations receive a full-scan timestamp');
    foreach ($created as $id) { $assert(is_array(get_post_meta($id, BYLINE_CONTENT_HEALTH_SNAPSHOT, true)), 'Each story has a durable snapshot'); }
    $summary = $request('')->get_data();
    $assert($summary['scanned'] >= count($created), 'Global summary includes all stored snapshots');
    wp_set_current_user(0);
    $assert(in_array($request('')->get_status(), [401, 403], true), 'Anonymous users cannot read maintenance findings');
    $assert(in_array($request('/scan', 'POST')->get_status(), [401, 403], true), 'Anonymous users cannot start scans');
    echo "Content Health WordPress integration passed ($checks checks).\n";
} finally {
    wp_set_current_user(1);
    remove_filter('pre_http_request', $http, 99);
    foreach ($created as $id) { wp_delete_post($id, true); }
    if ($prior === null) { delete_option(BYLINE_CONTENT_HEALTH_SCAN_STATE); } else { update_option(BYLINE_CONTENT_HEALTH_SCAN_STATE, $prior, false); }
    if ($disabled === null) { delete_option('byline_content_health_disabled_checks'); } else { update_option('byline_content_health_disabled_checks', $disabled, false); }
}
