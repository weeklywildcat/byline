<?php

/**
 * First-class video stories: an ordinary post whose story format is "video"
 * and which has one primary YouTube video. It stays a normal post, so authors,
 * sections, Collections, search, previews and scheduling are unchanged.
 *
 * The writer stores two plain post meta values: the format and the pasted
 * YouTube URL. Everything else (title, description, thumbnail, upload date,
 * duration) is looked up here when the URL changes and cached in a protected
 * meta value, so the public build never calls YouTube. A failed lookup never
 * blocks saving; the public site falls back to the story's own fields.
 *
 * A YouTube embed in an ordinary article's body is not a video story.
 * The URL parser mirrors packages/core/src/story-video.ts.
 */

if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_FORMAT_META = 'byline_story_format';
const BYLINE_STORY_VIDEO_URL_META = 'byline_primary_video_url';
const BYLINE_STORY_VIDEO_DETAILS_META = '_byline_primary_video';
const BYLINE_STORY_FORMATS = ['standard', 'video'];
const BYLINE_STORY_VIDEO_URL_MAX_LENGTH = 500;
const BYLINE_STORY_VIDEO_DESCRIPTION_MAX_LENGTH = 5000;
const BYLINE_STORY_VIDEO_LOOKUP_TIMEOUT = 5;

function byline_story_format_value($value): string
{
    return is_string($value) && in_array($value, BYLINE_STORY_FORMATS, true) ? $value : 'standard';
}

function byline_youtube_is_video_id($value): bool
{
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{11}$/', $value) === 1;
}

/** The video ID from a watch, youtu.be, Shorts, embed or live URL; null for anything else. */
function byline_youtube_video_id($input): ?string
{
    if (!is_string($input)) {
        return null;
    }
    $input = trim($input);
    if ($input === '' || strlen($input) > 2048 || preg_match('/\s/', $input)) {
        return null;
    }
    if (!preg_match('~^[a-z][a-z\d+.-]*://~i', $input)) {
        $input = 'https://' . $input;
    }
    $parts = parse_url($input);
    if (!is_array($parts) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])
        || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)) {
        return null;
    }
    $host = strtolower((string) $parts['host']);
    $segments = array_values(array_filter(explode('/', (string) ($parts['path'] ?? '')), 'strlen'));
    $candidate = null;
    if ($host === 'youtu.be' || $host === 'www.youtu.be') {
        $candidate = count($segments) === 1 ? $segments[0] : null;
    } elseif (in_array($host, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'], true)) {
        if (count($segments) === 1 && $segments[0] === 'watch') {
            parse_str((string) ($parts['query'] ?? ''), $query);
            $candidate = isset($query['v']) && is_string($query['v']) ? $query['v'] : null;
        } elseif (count($segments) === 2 && in_array($segments[0], ['shorts', 'embed', 'live', 'v', 'e'], true)) {
            $candidate = $segments[1];
        }
    }

    return byline_youtube_is_video_id($candidate) ? $candidate : null;
}

function byline_youtube_watch_url(string $video_id): string
{
    return 'https://www.youtube.com/watch?v=' . $video_id;
}

function byline_youtube_embed_url(string $video_id): string
{
    return 'https://www.youtube.com/embed/' . $video_id;
}

function byline_youtube_default_thumbnail_url(string $video_id): string
{
    return 'https://i.ytimg.com/vi/' . $video_id . '/hqdefault.jpg';
}

/**
 * A valid YouTube URL is stored as its canonical watch URL. Anything else is
 * kept as typed (plain text) so the writer can correct it, and readiness flags it.
 */
function byline_story_video_url_value($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $video_id = byline_youtube_video_id($value);
    if ($video_id !== null) {
        return byline_youtube_watch_url($video_id);
    }
    $value = function_exists('sanitize_text_field') ? sanitize_text_field($value) : trim(strip_tags($value));

    return function_exists('mb_substr') ? mb_substr($value, 0, BYLINE_STORY_VIDEO_URL_MAX_LENGTH) : substr($value, 0, BYLINE_STORY_VIDEO_URL_MAX_LENGTH);
}

function byline_story_format(int $post_id): string
{
    return byline_story_format_value(get_post_meta($post_id, BYLINE_STORY_FORMAT_META, true));
}

function byline_story_video_url(int $post_id): string
{
    return byline_story_video_url_value(get_post_meta($post_id, BYLINE_STORY_VIDEO_URL_META, true));
}

/** The stored lookup for the story's current video, or [] when it is missing or describes another video. */
function byline_story_video_details(int $post_id, string $video_id): array
{
    $details = get_post_meta($post_id, BYLINE_STORY_VIDEO_DETAILS_META, true);

    return is_array($details) && ($details['videoId'] ?? '') === $video_id ? $details : [];
}

/**
 * The published primary video, or null unless the story is a video story with
 * a valid YouTube video. A thumbnail is always present: YouTube serves the
 * default one for every public video.
 */
function byline_public_primary_video(int $post_id): ?array
{
    if (byline_story_format($post_id) !== 'video') {
        return null;
    }
    $video_id = byline_youtube_video_id(byline_story_video_url($post_id));
    if ($video_id === null) {
        return null;
    }
    $details = byline_story_video_details($post_id, $video_id);
    $video = [
        'provider' => 'youtube',
        'videoId' => $video_id,
        'url' => byline_youtube_watch_url($video_id),
        'thumbnailUrl' => byline_youtube_default_thumbnail_url($video_id),
    ];
    foreach (['title', 'description', 'thumbnailUrl', 'uploadDate', 'duration'] as $field) {
        if (isset($details[$field]) && is_string($details[$field]) && $details[$field] !== '') {
            $video[$field] = $details[$field];
        }
    }

    return $video;
}

/** "4:13" or "1:02:05" for an ISO 8601 duration; null when unknown or zero. Mirrors formatVideoDuration(). */
function byline_youtube_duration_label($duration): ?string
{
    if (!is_string($duration) || !preg_match('/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/', $duration, $match) || substr($duration, -1) === 'T') {
        return null;
    }
    $total = (int) ($match[1] ?? 0) * 86400 + (int) ($match[2] ?? 0) * 3600 + (int) ($match[3] ?? 0) * 60 + (int) ($match[4] ?? 0);
    if ($total <= 0) {
        return null;
    }
    $hours = intdiv($total, 3600);
    $minutes = intdiv($total % 3600, 60);
    $seconds = str_pad((string) ($total % 60), 2, '0', STR_PAD_LEFT);

    return $hours > 0 ? $hours . ':' . str_pad((string) $minutes, 2, '0', STR_PAD_LEFT) . ':' . $seconds : $minutes . ':' . $seconds;
}

/**
 * The article view's player (`ArticleVideoView`) for Preview as Byline, or null
 * for an article. Same embed URL and title rule as the public site.
 */
function byline_story_video_article_view(int $post_id, string $headline): ?array
{
    $video = byline_public_primary_video($post_id);
    if ($video === null) {
        return null;
    }

    return [
        'videoId' => $video['videoId'],
        'embedUrl' => byline_youtube_embed_url($video['videoId']),
        'title' => ($video['title'] ?? '') !== '' ? $video['title'] : $headline,
        'duration' => byline_youtube_duration_label($video['duration'] ?? null),
    ];
}

/** A card's Video label (`StoryVideoBadgeView`), or null for an article. */
function byline_story_video_badge(int $post_id): ?array
{
    $video = byline_public_primary_video($post_id);

    return $video === null ? null : ['duration' => byline_youtube_duration_label($video['duration'] ?? null)];
}

/** What the Story Workspace shows and edits. */
function byline_story_video_settings(int $post_id): array
{
    $url = byline_story_video_url($post_id);
    $video_id = byline_youtube_video_id($url);
    $details = $video_id !== null ? byline_story_video_details($post_id, $video_id) : [];

    return [
        'format' => byline_story_format($post_id),
        'videoUrl' => $url,
        'video' => $video_id === null ? null : [
            'videoId' => $video_id,
            'title' => is_string($details['title'] ?? null) ? $details['title'] : '',
            'thumbnailUrl' => is_string($details['thumbnailUrl'] ?? null) && $details['thumbnailUrl'] !== '' ? $details['thumbnailUrl'] : byline_youtube_default_thumbnail_url($video_id),
            'duration' => is_string($details['duration'] ?? null) ? $details['duration'] : '',
        ],
    ];
}

/**
 * Saves the format and/or URL. Returns the settings as stored. Each value is
 * sanitized by its registered meta callback.
 */
function byline_set_story_video_settings(int $post_id, array $input): array
{
    if (array_key_exists('format', $input)) {
        update_post_meta($post_id, BYLINE_STORY_FORMAT_META, byline_story_format_value($input['format']));
    }
    if (array_key_exists('videoUrl', $input)) {
        $url = byline_story_video_url_value($input['videoUrl']);
        if ($url === '') {
            delete_post_meta($post_id, BYLINE_STORY_VIDEO_URL_META);
        } else {
            update_post_meta($post_id, BYLINE_STORY_VIDEO_URL_META, $url);
        }
    }

    return byline_story_video_settings($post_id);
}

/* ------------------------------------------------------------ YouTube lookup */

/** A YouTube Data API key from a constant or the environment; filterable. Empty means oEmbed only. */
function byline_youtube_api_key(): string
{
    $key = '';
    foreach (['BYLINE_YOUTUBE_API_KEY', 'YOUTUBE_API_KEY'] as $name) {
        if (defined($name) && is_string(constant($name)) && trim((string) constant($name)) !== '') {
            $key = trim((string) constant($name));
            break;
        }
        $value = getenv($name);
        if (is_string($value) && trim($value) !== '') {
            $key = trim($value);
            break;
        }
    }

    return function_exists('apply_filters') ? (string) apply_filters('byline_youtube_api_key', $key) : $key;
}

function byline_youtube_remote_json(string $url): ?array
{
    if (!function_exists('wp_remote_get')) {
        return null;
    }
    $response = wp_remote_get($url, ['timeout' => BYLINE_STORY_VIDEO_LOOKUP_TIMEOUT, 'redirection' => 2, 'limit_response_size' => 262144]);
    if (is_wp_error($response) || (int) wp_remote_retrieve_response_code($response) !== 200) {
        return null;
    }
    $data = json_decode((string) wp_remote_retrieve_body($response), true);

    return is_array($data) ? $data : null;
}

function byline_youtube_text($value, int $maximum): string
{
    $value = is_string($value) ? $value : '';
    $value = function_exists('sanitize_textarea_field') ? sanitize_textarea_field($value) : trim(strip_tags($value));

    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

function byline_youtube_https_url($value): string
{
    if (!is_string($value) || stripos($value, 'https://') !== 0) {
        return '';
    }

    return function_exists('esc_url_raw') ? (string) esc_url_raw($value, ['https']) : $value;
}

/** Normalizes a YouTube Data API `videos` item. */
function byline_youtube_details_from_api(string $video_id, array $item): array
{
    $snippet = is_array($item['snippet'] ?? null) ? $item['snippet'] : [];
    $thumbnails = is_array($snippet['thumbnails'] ?? null) ? $snippet['thumbnails'] : [];
    $thumbnail = '';
    foreach (['maxres', 'standard', 'high', 'medium', 'default'] as $size) {
        $thumbnail = byline_youtube_https_url($thumbnails[$size]['url'] ?? '');
        if ($thumbnail !== '') {
            break;
        }
    }
    $published = is_string($snippet['publishedAt'] ?? null) ? $snippet['publishedAt'] : '';
    $published_time = $published !== '' ? strtotime($published) : false;
    $duration = is_string($item['contentDetails']['duration'] ?? null) ? $item['contentDetails']['duration'] : '';

    return array_filter([
        'videoId' => $video_id,
        'title' => byline_youtube_text($snippet['title'] ?? '', 300),
        'description' => byline_youtube_text($snippet['description'] ?? '', BYLINE_STORY_VIDEO_DESCRIPTION_MAX_LENGTH),
        'thumbnailUrl' => $thumbnail,
        'uploadDate' => $published_time ? gmdate('Y-m-d\TH:i:s\Z', $published_time) : '',
        // Live streams report P0D; a zero or malformed duration is omitted, never invented.
        'duration' => preg_match('/^P(?:\d+D)?T(?:\d+H)?(?:\d+M)?(?:\d+S)?$/', $duration) && preg_match('/[1-9]/', $duration) ? $duration : '',
        'source' => 'youtube-data-api',
    ], 'strlen');
}

/** Title and thumbnail from YouTube's keyless oEmbed endpoint. */
function byline_youtube_details_from_oembed(string $video_id, array $data): array
{
    return array_filter([
        'videoId' => $video_id,
        'title' => byline_youtube_text($data['title'] ?? '', 300),
        'thumbnailUrl' => byline_youtube_https_url($data['thumbnail_url'] ?? ''),
        'source' => 'youtube-oembed',
    ], 'strlen');
}

/**
 * Looks the story's video up on YouTube and caches what it finds. Returns
 * whether anything was stored. Never throws and never blocks a save.
 */
function byline_story_video_refresh_details(int $post_id): bool
{
    $video_id = byline_youtube_video_id(byline_story_video_url($post_id));
    if ($video_id === null) {
        return false;
    }
    $details = null;
    $key = byline_youtube_api_key();
    if ($key !== '') {
        $data = byline_youtube_remote_json('https://www.googleapis.com/youtube/v3/videos?' . http_build_query(['part' => 'snippet,contentDetails', 'id' => $video_id, 'key' => $key]));
        $item = is_array($data['items'][0] ?? null) ? $data['items'][0] : null;
        if ($item !== null && ($item['id'] ?? '') === $video_id) {
            $details = byline_youtube_details_from_api($video_id, $item);
        }
    }
    if ($details === null) {
        $data = byline_youtube_remote_json('https://www.youtube.com/oembed?' . http_build_query(['url' => byline_youtube_watch_url($video_id), 'format' => 'json']));
        if ($data !== null) {
            $details = byline_youtube_details_from_oembed($video_id, $data);
        }
    }
    if ($details === null) {
        return false;
    }
    $details['fetchedAt'] = gmdate('Y-m-d\TH:i:s\Z');
    update_post_meta($post_id, BYLINE_STORY_VIDEO_DETAILS_META, $details);

    return true;
}

/** A new URL is looked up at once; a published video story without details is retried. */
function byline_story_video_meta_changed($meta_id, $post_id, $meta_key): void
{
    if (in_array($meta_key, [BYLINE_STORY_VIDEO_URL_META, BYLINE_STORY_FORMAT_META], true) && byline_story_format((int) $post_id) === 'video') {
        $video_id = byline_youtube_video_id(byline_story_video_url((int) $post_id));
        if ($video_id !== null && byline_story_video_details((int) $post_id, $video_id) === []) {
            byline_story_video_refresh_details((int) $post_id);
        }
    }
}

function byline_story_video_on_publish($new_status, $old_status, $post): void
{
    if ($new_status !== 'publish' || !$post instanceof WP_Post || $post->post_type !== 'post' || byline_story_format((int) $post->ID) !== 'video') {
        return;
    }
    $video_id = byline_youtube_video_id(byline_story_video_url((int) $post->ID));
    if ($video_id !== null && byline_story_video_details((int) $post->ID, $video_id) === []) {
        byline_story_video_refresh_details((int) $post->ID);
    }
}

function byline_register_story_video_meta(): void
{
    register_post_meta('post', BYLINE_STORY_FORMAT_META, [
        'single' => true,
        'type' => 'string',
        'default' => 'standard',
        'sanitize_callback' => 'byline_story_format_value',
        'show_in_rest' => ['schema' => ['type' => 'string', 'enum' => BYLINE_STORY_FORMATS, 'default' => 'standard']],
        'auth_callback' => static fn() => current_user_can('edit_posts'),
    ]);
    register_post_meta('post', BYLINE_STORY_VIDEO_URL_META, [
        'single' => true,
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'byline_story_video_url_value',
        'show_in_rest' => ['schema' => ['type' => 'string', 'default' => '']],
        'auth_callback' => static fn() => current_user_can('edit_posts'),
    ]);
}
/**
 * Byline's Format (Article or Video) is the only format a post has. A theme's
 * core post formats do nothing on the headless site and would show writers a
 * second, different "Format" control in the editor. Stored values are kept.
 */
function byline_story_video_remove_core_post_formats(): void
{
    remove_post_type_support('post', 'post-formats');
}

add_action('init', 'byline_register_story_video_meta');
add_action('init', 'byline_story_video_remove_core_post_formats', 20);
add_action('added_post_meta', 'byline_story_video_meta_changed', 10, 3);
add_action('updated_post_meta', 'byline_story_video_meta_changed', 10, 3);
add_action('transition_post_status', 'byline_story_video_on_publish', 10, 3);
