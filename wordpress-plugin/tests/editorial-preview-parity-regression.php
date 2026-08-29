<?php

/**
 * Execute the authenticated preview adapter against a WordPress-shaped fixture.
 *
 * The public adapter receives the same fields from the WordPress REST contract;
 * this fixture makes the semantic contract explicit without requiring a live
 * WordPress database.  In particular, related ranking and image attribution
 * are assertions about the adapter's output, not source-code snapshots.
 */

define('ABSPATH', __DIR__ . '/../');
define('HOUR_IN_SECONDS', 3600);

class WP_Post
{
    public $ID;
    public $post_type = 'post';
    public $post_status = 'draft';
    public $post_author = 0;
    public $post_name = '';
    public $post_title = '';
    public $post_content = '';
    public $post_excerpt = '';
    public $post_date = '';
    public $post_modified = '';
    public $post_date_gmt = '';
    public $post_modified_gmt = '';

    public function __construct(array $values = [])
    {
        foreach ($values as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

class WP_Term
{
    public $term_id;
    public $name;
    public $slug;

    public function __construct(array $values = [])
    {
        foreach ($values as $key => $value) {
            $this->{$key} = $value;
        }
    }
}

$preview_parity = [
    'posts' => [],
    'categories' => [],
    'tags' => [],
    'meta' => [],
    'contributors' => [],
    'profiles' => [],
    'corrections' => [],
    'media' => [],
    'creditCalls' => 0,
];

function preview_parity_fail(string $message): void
{
    fwrite(STDERR, 'FAILED: ' . $message . "\n");
    exit(1);
}

function preview_parity_assert(bool $condition, string $message): void
{
    if (!$condition) {
        preview_parity_fail($message);
    }
}

function add_action(...$args): void {}
function add_submenu_page(...$args): void {}
function absint($value): int { return max(0, abs((int) $value)); }
function sanitize_key($value): string { return strtolower((string) preg_replace('/[^a-z0-9_-]/i', '', (string) $value)); }
function sanitize_title($value): string
{
    $value = strtolower(trim((string) $value));
    $value = preg_replace('/[^a-z0-9]+/i', '-', $value);

    return trim((string) $value, '-');
}
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function esc_url_raw($value, $protocols = []): string { return (string) $value; }
function wp_kses_post($value): string { return (string) $value; }
function wp_timezone(): DateTimeZone { return new DateTimeZone('America/New_York'); }
function wp_date($format, $timestamp, $timezone = null): string { return date((string) $format, (int) $timestamp); }
function esc_html($value): string { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
function get_option($name, $default = null) { return $default; }
function apply_filters($tag, $value) { return $value; }
function get_the_title($post): string { return $post instanceof WP_Post ? (string) $post->post_title : ''; }
function get_permalink($post): string { return '/story/' . ($post instanceof WP_Post ? $post->post_name : '') . '/'; }
function get_the_excerpt($post): string { return $post instanceof WP_Post ? (string) $post->post_excerpt : ''; }

function get_post($post_id)
{
    global $preview_parity;

    $post_id = absint($post_id);
    return $preview_parity['posts'][$post_id] ?? null;
}

function get_posts($args = []): array
{
    global $preview_parity;

    $posts = array_values($preview_parity['posts']);
    if (($args['post_type'] ?? '') === 'post') {
        $posts = array_values(array_filter($posts, static fn($post): bool => $post instanceof WP_Post && $post->post_type === 'post'));
    }
    if (($args['post_status'] ?? '') !== '' && ($args['post_status'] ?? '') !== 'any') {
        $posts = array_values(array_filter($posts, static fn(WP_Post $post): bool => $post->post_status === $args['post_status']));
    }
    usort($posts, static fn(WP_Post $left, WP_Post $right): int => strcmp((string) $right->post_date, (string) $left->post_date));

    return $posts;
}

function get_post_meta($post_id, $key, $single = false)
{
    global $preview_parity;

    return $preview_parity['meta'][absint($post_id)][$key] ?? ($single ? '' : []);
}

function get_user_meta($user_id, $key, $single = false)
{
    global $preview_parity;

    return $preview_parity['meta']['user_' . absint($user_id)][$key] ?? ($single ? '' : []);
}

function get_the_category($post_id = 0): array
{
    global $preview_parity;

    return $preview_parity['categories'][absint($post_id)] ?? [];
}

function get_the_tags($post_id = 0): array
{
    global $preview_parity;

    return $preview_parity['tags'][absint($post_id)] ?? [];
}

function get_post_thumbnail_id($post_id): int
{
    return absint(get_post_meta($post_id, '_thumbnail_id', true));
}

function wp_get_attachment_image_url($attachment_id, $size = 'full')
{
    global $preview_parity;

    return $preview_parity['media'][absint($attachment_id)]['url'] ?? '';
}

function wp_get_attachment_metadata($attachment_id): array
{
    global $preview_parity;

    return $preview_parity['media'][absint($attachment_id)]['metadata'] ?? [];
}

function wp_get_attachment_image_alt($attachment_id): string
{
    global $preview_parity;

    return (string) ($preview_parity['media'][absint($attachment_id)]['alt'] ?? '');
}

function wp_get_attachment_caption($attachment_id): string
{
    global $preview_parity;

    return (string) ($preview_parity['media'][absint($attachment_id)]['caption'] ?? '');
}

function wp_get_attachment_image_srcset($attachment_id, $size = 'full')
{
    global $preview_parity;

    return $preview_parity['media'][absint($attachment_id)]['srcset'] ?? false;
}

function byline_editorial_media_attachment_meta_value(int $attachment_id, string $field): string
{
    global $preview_parity;

    if ($field === 'creditText') {
        $preview_parity['creditCalls']++;
        return (string) ($preview_parity['media'][$attachment_id]['canonicalCredit'] ?? '');
    }

    return '';
}

function byline_get_publication_config(): array
{
    return [
        'identity' => ['shortName' => 'Weekly Wildcat'],
        'urls' => ['publicSite' => 'https://example.test', 'contact' => '/contact/'],
    ];
}

function byline_get_story_contributors(int $post_id): array
{
    global $preview_parity;

    return $preview_parity['contributors'][$post_id] ?? [];
}

function wwh_rest_author_profile(array $user): array
{
    global $preview_parity;

    return $preview_parity['profiles'][absint($user['id'] ?? 0)] ?? [];
}

function get_author_posts_url($user_id, $slug = ''): string
{
    return '/author/' . ($slug !== '' ? $slug : absint($user_id)) . '/';
}

function byline_list_corrections(int $post_id, bool $public_only = false): array
{
    global $preview_parity;

    return $preview_parity['corrections'][$post_id] ?? [];
}

function byline_correction_types(): array
{
    return [
        'correction' => 'Correction',
        'clarification' => 'Clarification',
        'editors-note' => "Editor's note",
        'substantive-update' => 'Substantive update',
    ];
}

$category = static fn(int $id, string $name, string $slug): WP_Term => new WP_Term(['term_id' => $id, 'name' => $name, 'slug' => $slug]);
$tag = static fn(int $id, string $name, string $slug): WP_Term => new WP_Term(['term_id' => $id, 'name' => $name, 'slug' => $slug]);

$preview_parity['posts'] = [
    100 => new WP_Post([
        'ID' => 100,
        'post_status' => 'publish',
        'post_author' => 7,
        'post_name' => 'parity-story',
        'post_title' => 'Parity <em>Story</em>',
        'post_content' => '<p>A saved body for parity.</p>',
        'post_excerpt' => '<p>A saved excerpt.</p>',
        'post_date' => '2026-08-20 09:00:00',
        'post_modified' => '2026-08-22 09:00:00',
        'post_date_gmt' => '2026-08-20 13:00:00',
        'post_modified_gmt' => '2026-08-22 13:00:00',
    ]),
    101 => new WP_Post(['ID' => 101, 'post_status' => 'publish', 'post_author' => 7, 'post_name' => 'related-one', 'post_title' => 'Related one', 'post_excerpt' => '<p>One.</p>', 'post_date' => '2026-08-25 09:00:00']),
    102 => new WP_Post(['ID' => 102, 'post_status' => 'publish', 'post_author' => 9, 'post_name' => 'related-two', 'post_title' => 'Related two', 'post_excerpt' => '<p>Two.</p>', 'post_date' => '2026-08-24 09:00:00']),
    103 => new WP_Post(['ID' => 103, 'post_status' => 'publish', 'post_author' => 8, 'post_name' => 'guest-story', 'post_title' => 'Guest story', 'post_excerpt' => '<p>Guest.</p>', 'post_date' => '2026-08-26 09:00:00']),
    104 => new WP_Post(['ID' => 104, 'post_status' => 'publish', 'post_author' => 7, 'post_name' => 'related-latest', 'post_title' => 'Related latest', 'post_excerpt' => '<p>Latest.</p>', 'post_date' => '2026-08-27 09:00:00']),
    105 => new WP_Post(['ID' => 105, 'post_status' => 'publish', 'post_author' => 7, 'post_name' => 'author-story', 'post_title' => 'Author story', 'post_excerpt' => '<p>Author.</p>', 'post_date' => '2026-08-23 09:00:00']),
    107 => new WP_Post([
        'ID' => 107,
        'post_status' => 'publish',
        'post_author' => 9,
        'post_name' => 'correction-story',
        'post_title' => 'Correction story',
        'post_content' => '<p>Correction body.</p><aside class="byline-correction-notice"><p class="byline-correction-notice-body">The legacy notice.</p><time datetime="2026-08-27T09:00:00"></time></aside>',
        'post_excerpt' => '<p>Correction.</p>',
        'post_date' => '2026-08-18 09:00:00',
        'post_modified' => '2026-08-20 09:00:00',
    ]),
    108 => new WP_Post([
        'ID' => 108,
        'post_status' => 'publish',
        'post_author' => 9,
        'post_name' => 'editorial-tag-story',
        'post_title' => 'Editorial tag story',
        'post_content' => '<p>Editorial tag.</p>',
        'post_excerpt' => '<p>Editorial.</p>',
        'post_date' => '2026-08-17 09:00:00',
    ]),
];

$news = $category(1, 'News', 'news');
$uncategorized = $category(2, 'Uncategorized', 'uncategorized');
$sports = $category(3, 'Sports', 'sports');
$arts = $category(4, 'Arts', 'arts');
$corrections = $category(5, 'Corrections', 'corrections');
$features = $category(6, 'Features', 'features');
$preview_parity['categories'] = [
    100 => [$uncategorized, $news],
    101 => [$news],
    102 => [$news],
    103 => [$sports],
    104 => [$news],
    105 => [$arts],
    107 => [$corrections],
    108 => [$features],
];

$preview_parity['tags'] = [
    100 => [$tag(10, 'Athlete of the Week', 'athlete-of-the-week'), $tag(11, 'Sport: Basketball', 'sport-basketball'), $tag(12, 'Campus', 'campus')],
    101 => [$tag(12, 'Campus', 'campus')],
    104 => [$tag(12, 'Campus', 'campus')],
    108 => [$tag(10, 'Athlete of the Week', 'athlete-of-the-week')],
];

$preview_parity['meta'] = [
    100 => ['_thumbnail_id' => 500],
    101 => ['_thumbnail_id' => 0],
    104 => ['_thumbnail_id' => 0],
    103 => ['_thumbnail_id' => 0],
    105 => ['_thumbnail_id' => 0],
];
$preview_parity['contributors'] = [
    100 => [
        ['type' => 'user', 'id' => 7, 'name' => 'Alex Rivera', 'slug' => 'alex-rivera', 'bio' => 'Reporter bio', 'imageId' => 600],
        ['type' => 'guest', 'id' => 44, 'name' => 'Jordan Guest', 'slug' => 'jordan-guest', 'role' => 'Community contributor', 'bio' => 'Guest bio', 'imageId' => 601, 'links' => [['label' => 'Email', 'url' => 'mailto:private@example.test']]],
    ],
    101 => [['type' => 'user', 'id' => 7, 'name' => 'Alex Rivera', 'slug' => 'alex-rivera', 'bio' => 'Reporter bio']],
    102 => [['type' => 'user', 'id' => 9, 'name' => 'Other Writer', 'slug' => 'other-writer', 'bio' => 'Other bio']],
    103 => [['type' => 'guest', 'id' => 44, 'name' => 'Jordan Guest', 'slug' => 'jordan-guest', 'role' => 'Community contributor', 'bio' => 'Guest bio']],
    104 => [['type' => 'user', 'id' => 7, 'name' => 'Alex Rivera', 'slug' => 'alex-rivera', 'bio' => 'Reporter bio']],
    105 => [['type' => 'user', 'id' => 7, 'name' => 'Alex Rivera', 'slug' => 'alex-rivera', 'bio' => 'Reporter bio']],
    107 => [['type' => 'user', 'id' => 9, 'name' => 'Other Writer', 'slug' => 'other-writer', 'bio' => 'Other bio']],
    108 => [['type' => 'user', 'id' => 9, 'name' => 'Other Writer', 'slug' => 'other-writer', 'bio' => 'Other bio']],
];
$preview_parity['profiles'] = [
    7 => [
        'role' => 'Editor',
        'founder' => true,
        'profilePhoto' => ['id' => 600],
        'socials' => ['email' => 'alex@example.test'],
    ],
    9 => ['role' => 'Writer', 'founder' => false, 'profilePhoto' => [], 'socials' => []],
];
$preview_parity['corrections'][107] = [
    ['id' => 701, 'type' => 'clarification', 'recordedAt' => '2026-08-28T09:00:00Z', 'text' => 'We clarified the record.'],
];
$preview_parity['corrections'][100] = [
    ['id' => 701, 'type' => 'clarification', 'recordedAt' => '2026-08-28T09:00:00Z', 'text' => 'We clarified the record.'],
];
$preview_parity['media'] = [
    500 => [
        'url' => 'https://cms.example.test/uploads/hero.jpg',
        'alt' => 'Hero alt',
        'srcset' => 'https://cms.example.test/uploads/hero-800.jpg 800w, https://cms.example.test/uploads/hero.jpg 1600w',
        'caption' => '<p>Hero caption <strong>HTML</strong>.</p>',
        'canonicalCredit' => 'Canonical Photographer',
        'metadata' => ['width' => 1600, 'height' => 900, 'image_meta' => ['caption' => 'Fallback caption', 'credit' => 'Wrong fallback']],
    ],
    600 => ['url' => 'https://cms.example.test/uploads/alex.jpg', 'alt' => 'Alex', 'metadata' => ['width' => 132, 'height' => 132]],
    601 => ['url' => 'https://cms.example.test/uploads/jordan.jpg', 'alt' => 'Jordan', 'metadata' => ['width' => 132, 'height' => 132]],
];

require __DIR__ . '/../includes/editorial/preview.php';

$snapshot_path = dirname(__DIR__, 2) . '/tests/fixtures/article-presentation-parity.json';
$snapshot = is_readable($snapshot_path)
    ? json_decode((string) file_get_contents($snapshot_path), true)
    : null;
preview_parity_assert(is_array($snapshot['story'] ?? null), 'The public and preview adapters must use the shared parity snapshot.');
$expected = $snapshot['story'];

$presentation = byline_editorial_preview_presentation(100);
preview_parity_assert($presentation['id'] === $expected['id'], 'The preview adapter changed the story ID.');
preview_parity_assert($presentation['title'] === $expected['title'], 'Preview title did not match the public plain-text title.');
preview_parity_assert($presentation['titleHtml'] === $expected['titleHtml'], 'Preview title HTML did not preserve the rendered title.');
preview_parity_assert($presentation['excerptHtml'] === $expected['excerptHtml'], 'Preview excerpt did not use the saved rendered excerpt.');
preview_parity_assert(strpos($presentation['contentHtml'], $expected['contentIncludes']) !== false, 'Preview body did not use the saved rendered content.');
preview_parity_assert($presentation['category'] === $expected['category'], 'Preview selected the wrong visible category.');
preview_parity_assert($presentation['athleteMeta'] === ['Athlete of the Week', 'Basketball'], 'Preview athlete metadata drifted from the public tag rules.');
preview_parity_assert($presentation['publishedAt'] === '2026-08-20 09:00:00', 'Preview used GMT instead of the public post date field.');
preview_parity_assert($presentation['modifiedAt'] === null, 'Preview did not suppress the generic update state when a correction is present.');
preview_parity_assert($presentation['readingTime'] === '1 min read', 'Preview reading time did not use the public content fallback rule.');
preview_parity_assert($presentation['topics'] === $expected['topics'], 'Preview topics did not exclude editorial flag tags while retaining public topics.');

$contributors = $presentation['contributors'];
preview_parity_assert(array_column($contributors, 'name') === array_column($expected['contributors'], 'name'), 'Preview changed effective contributor order.');
preview_parity_assert($contributors[0]['role'] === $expected['contributors'][0]['role'] && $contributors[0]['bio'] === $expected['contributors'][0]['bio'], 'Preview lost the canonical user role or bio.');
preview_parity_assert($contributors[0]['founder'] === $expected['contributors'][0]['founder'], 'Preview lost the canonical founder flag.');
preview_parity_assert($contributors[0]['contactHref'] === $expected['contributors'][0]['contactHref'], 'Preview did not project the canonical user contact link.');
preview_parity_assert($contributors[1]['contactHref'] === $expected['contributors'][1]['contactHref'], 'Preview exposed a private guest email link.');
preview_parity_assert(array_column($contributors[0]['coverage'], 'label') === $expected['contributors'][0]['coverage'], 'Preview coverage areas did not use the public count/order rule.');
preview_parity_assert($contributors[0]['coverage'] === $contributors[1]['coverage'], 'Preview did not apply the same effective coverage areas to every contributor.');

$normalized_contributors = array_map(static function (array $contributor): array {
    $photo = is_array($contributor['photo'] ?? null) ? $contributor['photo'] : [];
    $path = parse_url((string) ($photo['src'] ?? ''), PHP_URL_PATH);

    return [
        'id' => (string) ($contributor['id'] ?? ''),
        'name' => (string) ($contributor['name'] ?? ''),
        'role' => (string) ($contributor['role'] ?? ''),
        'bio' => (string) ($contributor['bio'] ?? ''),
        'founder' => (bool) ($contributor['founder'] ?? false),
        'contactHref' => (string) ($contributor['contactHref'] ?? ''),
        'photo' => $photo === [] ? null : [
            'path' => is_string($path) ? $path : '',
            'alt' => (string) ($photo['alt'] ?? ''),
        ],
        'coverage' => array_values(array_column((array) ($contributor['coverage'] ?? []), 'label')),
    ];
}, $contributors);
preview_parity_assert($normalized_contributors === $expected['contributors'], 'Preview contributor metadata did not match the shared public presentation contract.');

preview_parity_assert(parse_url($presentation['image']['src'], PHP_URL_PATH) === $expected['featuredImage']['path'], 'Preview featured image source drifted.');
preview_parity_assert($presentation['image']['alt'] === $expected['featuredImage']['alt'], 'Preview featured image alt text drifted.');
preview_parity_assert($presentation['image']['captionHtml'] === $expected['featuredImage']['captionHtml'], 'Preview featured image caption drifted.');
preview_parity_assert($presentation['image']['fallbackCaption'] === $expected['featuredImage']['fallbackCaption'], 'Preview lost the canonical fallback caption.');
preview_parity_assert($presentation['image']['credit'] === $expected['featuredImage']['credit'], 'Preview did not use the canonical image credit helper.');
preview_parity_assert($preview_parity['creditCalls'] > 0, 'Preview never called the canonical media credit helper.');

preview_parity_assert(array_column($presentation['relatedStories'], 'id') === $expected['relatedIds'], 'Preview related story IDs/order drifted from shared category/tag scoring.');
preview_parity_assert(array_column($presentation['moreByAuthorStories'], 'id') === $expected['moreByAuthorIds'], 'Preview more-by-author did not use effective multi-contributor membership.');
preview_parity_assert($presentation['athleteMeta'] === $expected['athleteMeta'], 'Preview athlete metadata drifted from the shared public contract.');
preview_parity_assert($presentation['publishedLabel'] === $expected['publishedDateLabel'], 'Preview publication date label drifted from the public locale rule.');
preview_parity_assert($presentation['update'] === $expected['update'], 'Preview update state drifted from the public correction-aware rule.');
preview_parity_assert($presentation['readingTime'] === $expected['readingTime'], 'Preview reading time drifted from the public word-count rule.');
preview_parity_assert($presentation['publication'] === $expected['publication'], 'Preview publication links drifted from the shared contract.');
preview_parity_assert(byline_editorial_preview_correction_type('editors-note') === 'editor-note', 'Preview correction aliases did not normalize like the public adapter.');
preview_parity_assert(byline_editorial_preview_athlete_meta(new WP_Post(['ID' => 109, 'post_title' => 'Athlete of the Month: Taylor'])) === [], 'Preview inferred athlete metadata from a title without the public athlete tag.');

$correction_presentation = byline_editorial_preview_presentation(107);
preview_parity_assert(count($correction_presentation['corrections']) === 1, 'Preview did not filter legacy notices and retain the structured correction.');
preview_parity_assert($correction_presentation['corrections'][0]['label'] === 'Clarification', 'Preview correction label drifted.');
preview_parity_assert($correction_presentation['update'] === null, 'A legacy or structured correction must suppress the generic update notice.');

$fallback_topics = byline_editorial_preview_presentation(108);
preview_parity_assert($fallback_topics['topics'] === [['id' => 'category-6', 'name' => 'Features']], 'Preview did not fall back to visible categories when only editorial tags exist.');
preview_parity_assert(byline_editorial_preview_reading_time('', '<p>Deck only.</p>') === '1 min read', 'Preview excerpt-only reading time fallback drifted.');

echo "Editorial preview parity regression checks passed.\n";
