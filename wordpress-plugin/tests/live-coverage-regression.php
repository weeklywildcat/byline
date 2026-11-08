<?php

// Live coverage: plain text becomes a small fixed set of HTML, updates are
// private child posts listed newest first, start/end/resume record times, only
// one update carries the key points, and the public projection exists only for
// a published story that has been live. Ending keeps every update.
define('ABSPATH', __DIR__ . '/../');
const BYLINE_REST_NAMESPACE = 'byline/v1';

#[AllowDynamicProperties]
class WP_Post { public function __construct(array $fields) { foreach ($fields as $key => $value) $this->$key = $value; } }
class WP_Error { public $code; public function __construct($code = '', $message = '', $data = []) { $this->code = $code; } }

$live_posts = [
    10 => new WP_Post(['ID' => 10, 'post_type' => 'post', 'post_status' => 'publish', 'post_parent' => 0]),
    11 => new WP_Post(['ID' => 11, 'post_type' => 'post', 'post_status' => 'draft', 'post_parent' => 0]),
];
$live_meta = [];
$live_actions = [];
$live_clock = strtotime('2026-11-02T18:00:00Z');

function add_action(string $hook, $callback): void {}
function do_action(string $hook, ...$args): void { global $live_actions; $live_actions[] = [$hook, $args[1] ?? null]; }
function current_user_can(...$args): bool { return true; }
function absint($value): int { return max(0, (int) abs((int) $value)); }
function sanitize_text_field(string $value): string { return trim(strip_tags($value)); }
function sanitize_textarea_field(string $value): string { return trim(strip_tags($value)); }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function get_post($id) { global $live_posts; return $live_posts[(int) $id] ?? null; }
function get_post_meta(int $id, string $key, bool $single = false) { global $live_meta; return $live_meta[$id][$key] ?? ''; }
function update_post_meta(int $id, string $key, $value): void { global $live_meta; $live_meta[$id][$key] = $value; }
function delete_post_meta(int $id, string $key): void { global $live_meta; unset($live_meta[$id][$key]); }
function get_the_author_meta(string $field, int $user_id): string { return $user_id === 3 ? 'Ana Reporter' : ''; }
function byline_project_user_contributor(int $user_id): ?array { return $user_id === 3 ? ['slug' => 'ana-reporter', 'role' => 'Sports editor', 'imageId' => 77] : null; }
function wwh_media_image(int $id, string $size): array { return $id === 77 && $size === 'thumbnail' ? ['url' => 'https://cms.example/ana-150.jpg', 'width' => 150, 'height' => 150] : []; }
function wp_insert_post(array $data, bool $wp_error = false)
{
    global $live_posts, $live_clock;
    $id = max(array_keys($live_posts)) + 1;
    $live_clock += 60;
    $live_posts[$id] = new WP_Post($data + ['ID' => $id, 'post_date_gmt' => gmdate('Y-m-d H:i:s', $live_clock), 'post_modified_gmt' => gmdate('Y-m-d H:i:s', $live_clock)]);
    return $id;
}
function wp_update_post(array $data): void { global $live_posts; foreach ($data as $key => $value) if ($key !== 'ID') $live_posts[$data['ID']]->$key = $value; }
function wp_delete_post(int $id, bool $force = false): bool { global $live_posts; unset($live_posts[$id]); return true; }
function get_posts(array $args): array
{
    global $live_posts;
    return array_values(array_filter($live_posts, static fn($post) => $post->post_type === $args['post_type'] && (int) $post->post_parent === (int) $args['post_parent']));
}

function live_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

require __DIR__ . '/../includes/editorial/live-coverage.php';

// Plain text to HTML: paragraphs, line breaks, bullet lists and links; nothing else.
live_assert(
    byline_live_update_html("Doors open at 6.\nBring ID.\n\n- Gate A\n- Gate B\n\nScores: https://example.com/live.") === '<p>Doors open at 6.<br>Bring ID.</p><ul><li>Gate A</li><li>Gate B</li></ul><p>Scores: <a href="https://example.com/live" rel="noopener">https://example.com/live</a>.</p>',
    'Plain text must become paragraphs, a list and a link with trailing punctuation outside it.'
);
live_assert(strpos(byline_live_update_html('<b>x</b> "quote" <script>'), '<b>') === false, 'Markup typed by an editor must be escaped.');
live_assert(byline_live_update_html('a "b" & c') === '<p>a &quot;b&quot; &amp; c</p>', 'Text is escaped.');

// Never live: no public projection.
live_assert(byline_public_live_coverage(10) === null, 'A story that was never live has no live coverage.');
live_assert(is_wp_error(byline_set_live_status(10, 'end')), 'A story that is not live cannot be ended.');

// Start, post, pin.
$started = byline_set_live_status(10, 'start');
live_assert($started['status'] === 'live' && $started['startedAt'] !== '' && $started['endedAt'] === '', 'Starting records the start time.');
$first = byline_create_live_update(10, ['title' => 'Kickoff', 'text' => 'We are underway.'], 3);
$key_points = byline_create_live_update(10, ['text' => "- Game starts at 7\n- Parking is full", 'pinned' => true], 3);
$second = byline_create_live_update(10, ['text' => 'Touchdown!', 'pinned' => true], 3);
live_assert(is_wp_error(byline_create_live_update(10, ['text' => '  '], 3)), 'An empty update is refused.');
live_assert(!get_post_meta($key_points['id'], BYLINE_LIVE_UPDATE_PINNED_META, true) && get_post_meta($second['id'], BYLINE_LIVE_UPDATE_PINNED_META, true), 'Pinning an update unpins the previous key points.');

$public = byline_public_live_coverage(10);
live_assert(array_column($public['updates'], 'id') === [$second['id'], $key_points['id'], $first['id']], 'Updates are listed newest first.');
live_assert($public['updates'][2]['title'] === 'Kickoff' && $public['updates'][2]['author'] === 'Ana Reporter', 'Updates carry their headline and author name.');
live_assert(!array_key_exists('text', $public['updates'][0]) && !array_key_exists('authorId', $public['updates'][0]), 'The public projection drops editor-only fields.');
live_assert(($public['updates'][0]['authorSlug'] ?? '') === 'ana-reporter' && ($public['updates'][0]['authorRole'] ?? '') === 'Sports editor' && ($public['updates'][0]['authorPhoto']['url'] ?? '') === 'https://cms.example/ana-150.jpg', 'Updates carry their author\'s profile slug, role and headshot.');
live_assert(byline_live_author_profile(99) === [], 'An author without a public profile adds nothing.');
live_assert(byline_public_live_coverage(11) === null, 'A draft story publishes no live coverage.');

// Edit and delete stay scoped to the story.
live_assert(is_wp_error(byline_update_live_update(11, $first['id'], ['text' => 'x'])), 'An update cannot be edited through another story.');
$edited = byline_update_live_update(10, $first['id'], ['text' => 'We are underway at the stadium.']);
live_assert($edited['html'] === '<p>We are underway at the stadium.</p>', 'Editing rebuilds the HTML.');
live_assert(byline_delete_live_update(10, $key_points['id']) && count(byline_public_live_coverage(10)['updates']) === 2, 'Deleting removes the update.');

// Ending keeps every update and records the end; resuming clears it.
$ended = byline_set_live_status(10, 'end');
live_assert($ended['status'] === 'ended' && $ended['endedAt'] !== '' && count($ended['updates']) === 2, 'Ending records the end time and keeps every update.');
live_assert(byline_public_live_coverage(10)['status'] === 'ended', 'Ended coverage stays public.');
$resumed = byline_set_live_status(10, 'resume');
live_assert($resumed['status'] === 'live' && $resumed['endedAt'] === '' && $resumed['startedAt'] === $started['startedAt'], 'Resuming keeps the original start time.');
live_assert(in_array(['byline_editorial_live_changed', 'end'], $live_actions, true), 'Changes are reported for the activity log.');

// Publishing an update or changing live state rebuilds the site, and the snapshot carries it.
$revisions = file_get_contents(__DIR__ . '/../includes/publication/public-revisions.php');
live_assert(strpos($revisions, "'byline_live_update'") !== false, 'Live updates must be a public type that triggers a rebuild.');
foreach (['_byline_live_status', '_byline_live_started_at', '_byline_live_ended_at', '_byline_live_update_pinned', '_byline_live_update_image_id'] as $key) {
    live_assert(strpos($revisions, "'{$key}'") !== false, "{$key} must trigger a rebuild.");
}
$snapshot = file_get_contents(__DIR__ . '/../includes/publication/build-snapshot.php');
live_assert(strpos($snapshot, "\$result['live'] = \$live") !== false, 'The build snapshot must carry live coverage on the post.');

echo "Live coverage regression passed.\n";
