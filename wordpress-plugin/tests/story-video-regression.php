<?php

define('ABSPATH', __DIR__ . '/../');

$registered = [];
$actions = [];
$meta = [];
$remote_calls = [];
$remote_responses = [];

class WP_Post
{
    public $ID;
    public $post_type = 'post';
    public function __construct(int $id) { $this->ID = $id; }
}
class WP_Error {}

function add_action(string $hook, $callback, int $priority = 10, int $args = 1): void
{
    global $actions;
    $actions[$hook][] = $callback;
}
function current_user_can(string $capability): bool { return true; }
function register_post_meta(string $post_type, string $key, array $args): bool
{
    global $registered;
    $registered[$post_type][$key] = $args;
    return true;
}
function get_post_meta(int $post_id, string $key, bool $single = false)
{
    global $meta;
    return $meta[$post_id][$key] ?? '';
}
function update_post_meta(int $post_id, string $key, $value): bool
{
    global $meta;
    $meta[$post_id][$key] = $value;
    byline_story_video_meta_changed(0, $post_id, $key);
    return true;
}
function delete_post_meta(int $post_id, string $key): bool
{
    global $meta;
    unset($meta[$post_id][$key]);
    return true;
}
function sanitize_text_field($value): string { return trim(strip_tags((string) $value)); }
function sanitize_textarea_field($value): string { return trim(strip_tags((string) $value)); }
function esc_url_raw($value, $protocols = null): string { return (string) $value; }
function is_wp_error($value): bool { return $value instanceof WP_Error; }
function wp_remote_get(string $url, array $args = [])
{
    global $remote_calls, $remote_responses;
    $remote_calls[] = $url;
    foreach ($remote_responses as $prefix => $response) {
        if (strpos($url, $prefix) === 0) {
            return $response;
        }
    }
    return new WP_Error();
}
function wp_remote_retrieve_response_code($response): int { return (int) ($response['code'] ?? 0); }
function wp_remote_retrieve_body($response): string { return (string) ($response['body'] ?? ''); }

require __DIR__ . '/../includes/content/story-video.php';

function story_video_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "Story video regression failed: {$message}\n");
        exit(1);
    }
}

$id = 'dQw4w9WgXcQ';

// URL parsing mirrors packages/core/src/story-video.ts.
foreach ([
    "https://www.youtube.com/watch?v={$id}",
    "https://youtube.com/watch?v={$id}&t=42s",
    "https://m.youtube.com/watch?feature=share&v={$id}",
    "youtube.com/watch?v={$id}",
    "https://youtu.be/{$id}",
    "https://youtu.be/{$id}?si=abc",
    "https://www.youtube.com/shorts/{$id}",
    "https://www.youtube.com/embed/{$id}?start=3",
    "https://www.youtube-nocookie.com/embed/{$id}",
    "https://www.youtube.com/live/{$id}",
] as $url) {
    story_video_assert(byline_youtube_video_id($url) === $id, "{$url} should parse");
}
foreach ([
    '', $id, 'not a url', 'https://vimeo.com/123', 'https://www.youtube.com/watch?v=short',
    "https://youtube.com.evil.example/watch?v={$id}", "https://user:pass@www.youtube.com/watch?v={$id}",
    "<iframe src=\"https://www.youtube.com/embed/{$id}\"></iframe>", "https://www.youtube.com/playlist?list=PL1234567890", null, 7,
] as $bad) {
    story_video_assert(byline_youtube_video_id($bad) === null, 'an invalid value should not parse: ' . var_export($bad, true));
}

// Values: a valid link is stored canonically; anything else stays as typed, without markup.
story_video_assert(byline_story_format_value('video') === 'video' && byline_story_format_value('Video') === 'standard' && byline_story_format_value(null) === 'standard', 'format normalization');
story_video_assert(byline_story_video_url_value("https://youtu.be/{$id}?si=share") === "https://www.youtube.com/watch?v={$id}", 'a valid link is stored as the watch URL');
story_video_assert(byline_story_video_url_value('<b>vimeo.com/1</b>') === 'vimeo.com/1', 'an invalid link is kept as plain text');
story_video_assert(byline_story_video_url_value(['x']) === '', 'non-strings are empty');

// Projection: only a video story with a valid video publishes `video`.
story_video_assert(byline_public_primary_video(1) === null, 'a story with no meta is not a video story');
$meta[2] = [BYLINE_STORY_VIDEO_URL_META => "https://www.youtube.com/watch?v={$id}"];
story_video_assert(byline_public_primary_video(2) === null, 'a URL without the Video format is not a video story');
$meta[3] = [BYLINE_STORY_FORMAT_META => 'video', BYLINE_STORY_VIDEO_URL_META => 'not a video'];
story_video_assert(byline_public_primary_video(3) === null, 'an invalid URL publishes no video');
$meta[4] = [BYLINE_STORY_FORMAT_META => 'video', BYLINE_STORY_VIDEO_URL_META => "https://www.youtube.com/watch?v={$id}"];
story_video_assert(byline_public_primary_video(4) === [
    'provider' => 'youtube', 'videoId' => $id, 'url' => "https://www.youtube.com/watch?v={$id}", 'thumbnailUrl' => "https://i.ytimg.com/vi/{$id}/hqdefault.jpg",
], 'a video without details still has YouTube\'s default thumbnail');
$meta[4][BYLINE_STORY_VIDEO_DETAILS_META] = ['videoId' => 'aaaaaaaaaaa', 'title' => 'A different video'];
story_video_assert(!isset(byline_public_primary_video(4)['title']), 'details cached for another video are ignored');

// YouTube Data API: the full set, stored once, never fetched again for the same video.
$remote_responses = [
    'https://www.googleapis.com/youtube/v3/videos' => ['code' => 200, 'body' => json_encode(['items' => [[
        'id' => $id,
        'snippet' => [
            'title' => 'Homecoming in 90 seconds',
            'description' => "From the pep rally\nto the parade.",
            'publishedAt' => '2026-10-14T20:00:00Z',
            'thumbnails' => ['high' => ['url' => "https://i.ytimg.com/vi/{$id}/hqdefault.jpg"], 'maxres' => ['url' => "https://i.ytimg.com/vi/{$id}/maxresdefault.jpg"]],
        ],
        'contentDetails' => ['duration' => 'PT1M32S'],
    ]]])],
];
putenv('BYLINE_YOUTUBE_API_KEY=test-key');
$meta[5] = [BYLINE_STORY_FORMAT_META => 'video'];
update_post_meta(5, BYLINE_STORY_VIDEO_URL_META, byline_story_video_url_value("https://youtu.be/{$id}"));
$video = byline_public_primary_video(5);
story_video_assert(count($remote_calls) === 1 && strpos($remote_calls[0], 'part=snippet%2CcontentDetails') !== false, 'the Data API is asked once');
story_video_assert($video['title'] === 'Homecoming in 90 seconds' && $video['thumbnailUrl'] === "https://i.ytimg.com/vi/{$id}/maxresdefault.jpg"
    && $video['uploadDate'] === '2026-10-14T20:00:00Z' && $video['duration'] === 'PT1M32S' && $video['description'] === "From the pep rally\nto the parade.", 'API details are published');
update_post_meta(5, BYLINE_STORY_FORMAT_META, 'video');
story_video_assert(count($remote_calls) === 1, 'cached details are not fetched again');
story_video_assert(!isset(byline_youtube_details_from_api($id, ['snippet' => [], 'contentDetails' => ['duration' => 'P0D']])['duration']), 'a zero (live) duration is omitted');

// Without a key (or when the API fails), oEmbed supplies the title and thumbnail.
putenv('BYLINE_YOUTUBE_API_KEY');
$remote_calls = [];
$remote_responses = ['https://www.youtube.com/oembed' => ['code' => 200, 'body' => json_encode(['title' => 'Pep rally', 'thumbnail_url' => "https://i.ytimg.com/vi/{$id}/hqdefault.jpg"])]];
$meta[6] = [BYLINE_STORY_FORMAT_META => 'video'];
update_post_meta(6, BYLINE_STORY_VIDEO_URL_META, "https://www.youtube.com/watch?v={$id}");
story_video_assert(count($remote_calls) === 1 && strpos($remote_calls[0], 'https://www.youtube.com/oembed?') === 0, 'oEmbed is the keyless lookup');
story_video_assert(byline_public_primary_video(6)['title'] === 'Pep rally' && !isset(byline_public_primary_video(6)['duration']), 'oEmbed details never invent a duration');

// A failed lookup stores nothing and does not interrupt the save.
$remote_responses = [];
$meta[7] = [BYLINE_STORY_FORMAT_META => 'video'];
update_post_meta(7, BYLINE_STORY_VIDEO_URL_META, "https://www.youtube.com/shorts/{$id}");
story_video_assert(!isset($meta[7][BYLINE_STORY_VIDEO_DETAILS_META]) && byline_public_primary_video(7)['videoId'] === $id, 'a failed lookup still publishes the video');
$remote_calls = [];
update_post_meta(8, BYLINE_STORY_VIDEO_URL_META, "https://www.youtube.com/watch?v={$id}");
story_video_assert($remote_calls === [], 'an article\'s URL is not looked up until it is a video story');

// The Story Workspace save and its view.
$saved = byline_set_story_video_settings(9, ['format' => 'video', 'videoUrl' => "youtu.be/{$id}", 'ignored' => 'x']);
story_video_assert($saved['format'] === 'video' && $saved['videoUrl'] === "https://www.youtube.com/watch?v={$id}" && $saved['video']['videoId'] === $id, 'workspace save stores both values');
$cleared = byline_set_story_video_settings(9, ['videoUrl' => '']);
story_video_assert($cleared['videoUrl'] === '' && $cleared['video'] === null && $cleared['format'] === 'video', 'clearing the URL keeps the format');

// Preview models.
story_video_assert(byline_youtube_duration_label('PT1M32S') === '1:32' && byline_youtube_duration_label('PT1H2M5S') === '1:02:05' && byline_youtube_duration_label('P0D') === null, 'duration labels');
$view = byline_story_video_article_view(5, 'Headline');
story_video_assert($view === ['videoId' => $id, 'embedUrl' => "https://www.youtube.com/embed/{$id}", 'title' => 'Homecoming in 90 seconds', 'duration' => '1:32'], 'preview player uses the one embed URL');
story_video_assert(byline_story_video_article_view(1, 'Headline') === null && byline_story_video_badge(1) === null, 'an article has no player or badge');

// Registration: two REST-visible post meta values; the cached details stay private.
byline_register_story_video_meta();
story_video_assert(array_keys($registered['post']) === [BYLINE_STORY_FORMAT_META, BYLINE_STORY_VIDEO_URL_META], 'exactly the format and URL are registered');
story_video_assert($registered['post'][BYLINE_STORY_FORMAT_META]['show_in_rest']['schema']['enum'] === ['standard', 'video'], 'format REST enum');
story_video_assert($registered['post'][BYLINE_STORY_FORMAT_META]['default'] === 'standard', 'format defaults to standard');
story_video_assert(strpos(BYLINE_STORY_VIDEO_DETAILS_META, '_') === 0, 'cached details are protected meta');
story_video_assert(isset($actions['updated_post_meta'], $actions['added_post_meta'], $actions['transition_post_status']), 'lookup hooks are registered');

fwrite(STDOUT, "Story video regression passed.\n");
