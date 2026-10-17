<?php
/** Run with wp eval-file after plugin activation; uses actual Core controllers. */
function byline_snapshot_integration_assert($condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
wp_set_current_user(1);
$secret = 'BYLINE_SNAPSHOT_PRIVATE_' . wp_generate_password(12, false);
$story_id = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Snapshot regression story', 'post_content' => '<p>Canonical public body.</p>', 'post_excerpt' => 'Public excerpt.']);
$draft_id = wp_insert_post(['post_type' => 'post', 'post_status' => 'draft', 'post_title' => $secret, 'post_content' => $secret]);
$protected_id = wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_password' => 'protected', 'post_title' => $secret, 'post_content' => $secret]);
$internal_id = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => $secret, 'post_content' => $secret]);
update_post_meta($internal_id, BYLINE_PAGE_INDEXING_META, 'internal');
update_post_meta($story_id, '_byline_editorial_note', $secret);
update_post_meta($story_id, '_byline_story_visual_request_v1', $secret);
update_option('byline_deployment_hook_url', 'https://example.invalid/' . $secret, false);
$category = wp_insert_term('Snapshot public category ' . uniqid(), 'category');
$tag = wp_insert_term('Snapshot public tag ' . uniqid(), 'post_tag');
wp_set_post_terms($story_id, [(int) $category['term_id']], 'category');
wp_set_post_terms($story_id, [(int) $tag['term_id']], 'post_tag');
$page_id = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Snapshot public Page', 'post_content' => '<p>Public Page body.</p>']);
$guest_id = wp_insert_post(['post_type' => BYLINE_GUEST_POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Snapshot public guest']);
update_post_meta($guest_id, BYLINE_GUEST_PROFILE_PAGE_META, '1');
update_post_meta($guest_id, '_byline_private_notes', $secret);
byline_set_story_contributors($story_id, [['type' => 'guest', 'id' => $guest_id], ['type' => 'user', 'id' => 1]], 1);
$coverage_id = wp_insert_post(['post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Snapshot public coverage']);
update_post_meta($coverage_id, BYLINE_COVERAGE_PUBLIC_META, '1');
update_post_meta($coverage_id, '_byline_private_notes', $secret);
byline_set_coverage_story_ids($coverage_id, [$story_id, $draft_id, $protected_id]);
$correction = byline_create_correction($story_id, ['type' => 'correction', 'text' => 'A public correction.'], 1);
byline_snapshot_integration_assert(!is_wp_error($correction), 'Canonical public correction should be created.');
$event_id = wp_insert_post(['post_type' => WWH_SCHOOL_EVENT_POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Snapshot public event']);
update_post_meta($event_id, '_ww_event_start_datetime', '2030-01-01T10:00');
$media_id = wp_insert_attachment(['post_status' => 'inherit', 'post_title' => 'Snapshot public image', 'post_mime_type' => 'image/png', 'guid' => 'https://example.invalid/wp-content/uploads/snapshot-fixture.png'], false, $story_id);
update_post_meta($story_id, '_thumbnail_id', $media_id);
register_rest_field('post', 'snapshot_private_field_test', ['get_callback' => static fn() => $secret, 'schema' => ['type' => 'string', 'context' => ['view']]]);
$private_media_id = wp_insert_attachment(['post_status' => 'inherit', 'post_title' => $secret, 'post_mime_type' => 'image/png', 'guid' => 'https://example.invalid/private-photo.png'], false, $draft_id);
add_shortcode('snapshot_private_context_test', static fn() => current_user_can('manage_options') ? $secret : 'Public anonymous shortcode output.');
wp_update_post(['ID' => $story_id, 'post_content' => '<p>Public body.</p>[snapshot_private_context_test]<!-- wp:paragraph {"id":' . $private_media_id . '} --><p>Public.</p><!-- /wp:paragraph -->']);
$revision = byline_public_content_revision();
$busy = byline_prepare_build_snapshot();
byline_snapshot_integration_assert(is_wp_error($busy), 'A multi-step active writer must block preparation.');
byline_flush_public_mutations();
// Avoid dispatching a real hook. This test only exercises the local public
// snapshot plus the existing transport's HTTP interception boundary.
$requests = 0;
add_filter('pre_http_request', static function ($preempt, $args, $url) use (&$requests) {
    $requests++;
    return ['headers' => [], 'body' => '', 'response' => ['code' => 200, 'message' => 'OK'], 'cookies' => []];
}, 99, 3);
$first = byline_prepare_build_snapshot();
byline_snapshot_integration_assert(!is_wp_error($first), 'Snapshot should prepare: ' . (is_wp_error($first) ? $first->get_error_message() : ''));
byline_snapshot_integration_assert($requests === 0, 'Preparation must not issue HTTP to WordPress or any service.');
$location = byline_build_snapshot_location();
$file = $location['path'] . '/' . basename($first['url']);
$json = file_get_contents($file);
$data = json_decode($json, true);
byline_snapshot_integration_assert(strpos($json, $secret) === false, 'No draft, password content, internal Page, notes, visual request or hook secret may leak.');
byline_snapshot_integration_assert(hash('sha256', $json) === $first['digest'] && strlen($json) === $first['bytes'], 'Artifact bytes and digest must match discovery metadata.');
byline_snapshot_integration_assert(in_array($story_id, array_column($data['datasets']['posts'], 'id'), true), 'Public story must be included.');
foreach (['posts', 'authors', 'guests', 'categories', 'tags', 'pages', 'corrections', 'coverages', 'schoolEvents', 'attachments'] as $dataset) byline_snapshot_integration_assert(count($data['datasets'][$dataset]) > 0, 'Real Core serialization must populate ' . $dataset);
$collection = array_values(array_filter($data['datasets']['coverages'], static fn($item) => $item['id'] === $coverage_id))[0];
byline_snapshot_integration_assert(array_column($collection['stories'], 'id') === [$story_id], 'Coverage must not leak draft/password-protected stories.');

byline_snapshot_integration_assert(get_current_user_id() === 1, 'Anonymous serialization must restore the caller context.');
$second = byline_prepare_build_snapshot();
byline_snapshot_integration_assert($first === $second, 'Preparation should cheaply reuse a valid artifact.');
$before_recovery = byline_public_content_revision();
add_option('byline_snapshot_writer_orphan_regression', time(), '', false);
$recovered = byline_prepare_build_snapshot();
byline_snapshot_integration_assert(!is_wp_error($recovered) && $recovered['revision'] > $before_recovery, 'An interrupted writer must recover under a new revision once the DB lock proves it inactive.');
$first = $recovered;

// Force a true revision change while the canonical serializer is gathering data.
$race = static function ($content) { byline_bump_public_content_revision(); return $content; };
byline_bump_public_content_revision();
add_filter('the_content', $race, 999);
$failed = byline_prepare_build_snapshot();
remove_filter('the_content', $race, 999);
byline_snapshot_integration_assert(is_wp_error($failed), 'A generation race must fail closed.');
byline_snapshot_integration_assert(get_option(BYLINE_BUILD_SNAPSHOT_OPTION)['digest'] === $first['digest'], 'A race must not promote the pointer.');
$before = $requests;
add_filter('the_content', $race, 999);
$result = byline_send_deployment_request('snapshot-regression', byline_public_content_revision());
remove_filter('the_content', $race, 999);
byline_snapshot_integration_assert(is_wp_error($result) && $requests === $before, 'Snapshot failure must prevent deployment HTTP.');
// Public mutations advance revisions; draft and editorial-only changes do not.
$baseline = byline_public_content_revision();
update_post_meta($story_id, '_byline_editorial_note', $secret . ' updated');
wp_update_post(['ID' => $draft_id, 'post_content' => $secret . ' draft update']);
byline_snapshot_integration_assert(byline_public_content_revision() === $baseline, 'Draft/editorial-only mutations must not advance public revision.');
update_post_meta($story_id, BYLINE_STORY_CONTRIBUTORS_META, [['type' => 'user', 'id' => 1]]);
byline_snapshot_integration_assert(byline_public_content_revision() > $baseline, 'Public contributor changes must advance revision.');
unset($GLOBALS['wp_rest_additional_fields']['post']['snapshot_private_field_test']);
wp_delete_term((int) $category['term_id'], 'category');
wp_delete_term((int) $tag['term_id'], 'post_tag');
wp_delete_attachment($media_id, true);
wp_delete_attachment($private_media_id, true);
remove_shortcode('snapshot_private_context_test');
foreach ([$story_id, $draft_id, $protected_id, $internal_id, $page_id, $guest_id, $coverage_id, (int) $correction['id'], $event_id] as $id) wp_delete_post($id, true);
update_option('byline_deployment_hook_url', '', false);
byline_flush_public_mutations();
echo "Build snapshot Core integration: public serialization, privacy, idempotence, active writers, revision races and deployment gate passed.\n";
