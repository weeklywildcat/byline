<?php
/**
 * Shared helpers for bounded, private story-meta collections.
 *
 * Sources, appointments, media assignments and resource links are small lists
 * stored in one private meta row per story. Several people can edit them at the
 * same time, so every write is a compare-and-swap: read the stored value, derive
 * the next list, and write only if the row still holds exactly what was read.
 * A lost race is retried against the fresh value; if it cannot be resolved the
 * caller receives a 409 instead of silently replacing a colleague's change.
 */
if (!defined('ABSPATH')) {
    exit;
}

const BYLINE_STORY_COLLECTION_ATTEMPTS = 4;

function byline_story_uuid(): string
{
    return function_exists('wp_generate_uuid4') ? wp_generate_uuid4() : sprintf('%08x-%04x-4%03x-a%03x-%012x', random_int(0, 0xffffffff), random_int(0, 0xffff), random_int(0, 0xfff), random_int(0, 0xfff), random_int(0, 0xffffffffffff));
}

/** A canonical lower-case UUID, or an empty string. */
function byline_story_valid_uuid($value): string
{
    $value = is_string($value) ? strtolower(trim($value)) : '';
    return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value) === 1 ? $value : '';
}

function byline_story_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function byline_story_cut(string $value, int $maximum): string
{
    return function_exists('mb_substr') ? mb_substr($value, 0, $maximum) : substr($value, 0, $maximum);
}

/** Single-line plain text. */
function byline_story_line($value, int $maximum): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = function_exists('sanitize_text_field') ? sanitize_text_field((string) $value) : trim(strip_tags((string) $value));
    return byline_story_cut($text, $maximum);
}

/** Multi-line plain text; newlines survive, markup does not. */
function byline_story_paragraph($value, int $maximum): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = function_exists('sanitize_textarea_field') ? sanitize_textarea_field((string) $value) : trim(strip_tags((string) $value));
    return byline_story_cut($text, $maximum);
}

/** @return list<int> unique, positive, capped user IDs */
function byline_story_id_list($value, int $maximum): array
{
    $ids = [];
    foreach (is_array($value) ? $value : [] as $item) {
        $id = is_scalar($item) ? absint($item) : 0;
        if ($id > 0 && !in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    return array_slice($ids, 0, $maximum);
}

/** Date-only value (YYYY-MM-DD) that is also a real calendar date, or ''. */
function byline_story_date($value): string
{
    if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($value)) !== 1) {
        return '';
    }
    $value = trim($value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value ? $value : '';
}

/** Has this meta row ever been written? (An empty list still counts.) */
function byline_story_meta_exists(int $story_id, string $meta_key): bool
{
    if (function_exists('metadata_exists')) {
        return (bool) metadata_exists('post', $story_id, $meta_key);
    }
    $stored = get_post_meta($story_id, $meta_key, true);
    return $stored !== '' && $stored !== null && $stored !== false;
}

function byline_story_flush_meta_cache(int $story_id): void
{
    if (function_exists('wp_cache_delete')) {
        wp_cache_delete($story_id, 'post_meta');
    }
}

/**
 * Atomically transform one story's collection.
 *
 * `$mutate` receives the normalized current list and returns the next list or a
 * WP_Error. `$options['normalize']` cleans stored rows; `$options['initial']`
 * supplies the list to start from when the row has never been written (used to
 * materialize a projection of older data on the first intentional write).
 *
 * @param callable(array):(array|WP_Error) $mutate
 * @return array|WP_Error The stored list
 */
function byline_story_collection_update(int $story_id, string $meta_key, callable $mutate, array $options = [])
{
    $normalize = $options['normalize'] ?? static function (array $rows): array { return $rows; };
    for ($attempt = 0; $attempt < BYLINE_STORY_COLLECTION_ATTEMPTS; $attempt++) {
        if ($attempt > 0) {
            byline_story_flush_meta_cache($story_id);
        }
        $exists = byline_story_meta_exists($story_id, $meta_key);
        $previous = $exists ? get_post_meta($story_id, $meta_key, true) : null;
        if ($exists) {
            $current = $normalize(is_array($previous) ? $previous : []);
        } else {
            $current = isset($options['initial']) ? $normalize((array) $options['initial']($story_id)) : [];
        }
        $next = $mutate($current);
        if (is_wp_error($next)) {
            return $next;
        }
        $next = array_values($next);
        if ($exists && $next === $previous) {
            return $next;
        }
        if (!$exists && $next === [] && empty($options['persist_empty'])) {
            return $next;
        }
        $written = $exists
            ? update_post_meta($story_id, $meta_key, wp_slash($next), $previous)
            : add_post_meta($story_id, $meta_key, wp_slash($next), true);
        if ($written) {
            return $next;
        }
    }
    return new WP_Error('byline_story_collection_conflict', 'This story changed while you were editing. Reload it and try again.', ['status' => 409]);
}
