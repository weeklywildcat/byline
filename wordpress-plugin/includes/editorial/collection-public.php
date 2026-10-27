<?php
/** Optional public presentation. Collection edges remain the sole story membership. */
if (!defined('ABSPATH')) { exit; }

const BYLINE_COLLECTION_COVERAGE_MIGRATION_OPTION = 'byline_collection_coverage_migration';
const BYLINE_COLLECTION_COVERAGE_MIGRATION_VERSION = 1;
const BYLINE_COLLECTION_PUBLIC_META = '_byline_collection_public';
const BYLINE_COLLECTION_LEGACY_COVERAGE_META = '_byline_collection_legacy_coverage_id';

function byline_collection_public_settings(int $id): array
{
    $stored = get_post_meta($id, BYLINE_COLLECTION_PUBLIC_META, true);
    return array_merge([
        'publicEnabled' => false, 'publicTitle' => '', 'publicSlug' => '',
        'publicDescription' => '', 'publicOverview' => '', 'artworkAttachmentId' => 0,
        'featuredStoryId' => 0, 'storyOrder' => [],
    ], is_array($stored) ? $stored : []);
}

/** Validate before the ordinary Collection write, including publication capability. */
function byline_collection_public_input($input, int $id)
{
    if (!is_array($input)) { return byline_collection_error('Use valid public coverage settings.'); }
    if (!current_user_can('publish_posts')) { return byline_collection_error('You cannot change public coverage.', 403); }
    foreach (['publicTitle', 'publicSlug', 'publicDescription', 'publicOverview', 'artworkAttachmentId', 'featuredStoryId', 'publicEnabled'] as $key) {
        if (isset($input[$key]) && !is_scalar($input[$key])) { return byline_collection_error('Use valid public coverage fields.'); }
    }
    $next = array_merge(byline_collection_public_settings($id), $input);
    $next = [
        'publicEnabled' => rest_sanitize_boolean($next['publicEnabled']),
        'publicTitle' => byline_sanitize_coverage_text($next['publicTitle'], 240),
        'publicSlug' => substr(sanitize_title((string) $next['publicSlug']), 0, 200),
        'publicDescription' => byline_sanitize_coverage_text($next['publicDescription'], 320),
        'publicOverview' => byline_sanitize_coverage_rich_text($next['publicOverview']),
        'artworkAttachmentId' => absint($next['artworkAttachmentId']),
        'featuredStoryId' => absint($next['featuredStoryId']),
        'storyOrder' => byline_sanitize_coverage_ids($next['storyOrder']),
    ];
    if ($next['publicEnabled'] && (!$next['publicTitle'] || !$next['publicSlug'])) {
        return byline_collection_error('Add a public title and URL slug before publishing coverage.');
    }
    if ($next['publicSlug']) {
        $matches = get_posts(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'numberposts' => -1,
            'meta_key' => BYLINE_COLLECTION_PUBLIC_META]);
        foreach ($matches as $match) {
            if ((int) $match->ID !== $id && byline_collection_public_settings((int) $match->ID)['publicSlug'] === $next['publicSlug']) {
                return byline_collection_error('That public coverage slug is already in use.', 409);
            }
        }
        // Reserve legacy URLs even while an interrupted migration is retried.
        $legacy = get_posts(['post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_status' => 'any', 'name' => $next['publicSlug'], 'numberposts' => 1]);
        if ($legacy && byline_collection_for_legacy_coverage((int) $legacy[0]->ID) !== $id) {
            return byline_collection_error('That slug belongs to legacy coverage.', 409);
        }
    }
    $stories = $id ? byline_relation_ids($id, 'story') : [];
    if (array_diff($next['storyOrder'], $stories) || ($next['featuredStoryId'] && !in_array($next['featuredStoryId'], $stories, true))) {
        return byline_collection_error('Choose stories belonging to this Collection.');
    }
    if ($next['artworkAttachmentId']) {
        $attachment = get_post($next['artworkAttachmentId']);
        if (!$attachment || $attachment->post_type !== 'attachment' || !wp_attachment_is_image($attachment->ID) || !current_user_can('edit_post', $attachment->ID)) {
            return byline_collection_error('Choose an accessible image from the Media Library.', 403);
        }
    }
    return $next;
}

function byline_collection_for_legacy_coverage(int $legacy_id): int
{
    $ids = get_posts(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'any', 'numberposts' => 1,
        'fields' => 'ids', 'meta_key' => BYLINE_COLLECTION_LEGACY_COVERAGE_META, 'meta_value' => $legacy_id]);
    return $ids ? (int) $ids[0] : 0;
}

/** Non-destructive and resumable: a marker on insertion survives partial edge writes. */
function byline_migrate_coverage_to_collections(): bool
{
    if (!add_option('byline_coverage_migration_lock', time(), '', false)) {
        if ((int) get_option('byline_coverage_migration_lock') < time() - 300) { delete_option('byline_coverage_migration_lock'); }
        return false;
    }
    try {
        $legacy_posts = get_posts(['post_type' => BYLINE_COVERAGE_POST_TYPE, 'post_status' => 'any', 'numberposts' => -1]);
        foreach ($legacy_posts as $post) {
            $legacy_id = (int) $post->ID;
            if (get_post_meta($legacy_id, '_byline_coverage_migrated', true)) { continue; }
            $record = byline_get_coverage_record($legacy_id);
            if (!$record) { continue; }
            $id = byline_collection_for_legacy_coverage($legacy_id);
            if (!$id) {
                $id = wp_insert_post(wp_slash(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private',
                    'post_title' => $record['title'], 'post_author' => (int) $post->post_author,
                    'meta_input' => [BYLINE_COLLECTION_LEGACY_COVERAGE_META => $legacy_id]]), true);
                if (is_wp_error($id) || !$id) { return false; }
            }
            $public = [
                'publicEnabled' => $record['public'] && $record['postStatus'] === 'publish',
                'publicTitle' => $record['title'], 'publicSlug' => $record['slug'],
                'publicDescription' => $record['description'],
                'publicOverview' => $record['overview'] ?: byline_sanitize_coverage_rich_text($post->post_content),
                'artworkAttachmentId' => (int) get_post_thumbnail_id($legacy_id),
                'featuredStoryId' => 0, 'storyOrder' => $record['storyIds'],
            ];
            $status = ['upcoming' => 'planning', 'active' => 'active', 'past' => 'wrapping-up', 'archived' => 'archived'][$record['status']] ?? 'planning';
            foreach (['type' => 'project', 'status' => $status, 'lead' => (int) $post->post_author,
                'start' => $record['startAt'], 'end' => $record['endAt'], 'legacy_status' => $record['status']] as $key => $value) {
                update_post_meta($id, '_byline_collection_' . $key, $value);
                if ((string) get_post_meta($id, '_byline_collection_' . $key, true) !== (string) $value) { return false; }
            }
            update_post_meta($id, BYLINE_COLLECTION_PUBLIC_META, wp_slash($public));
            if (get_post_meta($id, BYLINE_COLLECTION_PUBLIC_META, true) !== $public) { return false; }
            foreach ($record['storyIds'] as $story) {
                if (get_post_type($story) === 'post' && !byline_relation_set($id, 'story', $story, true)) { return false; }
            }
            foreach ($record['staffIds'] as $member) {
                if (get_userdata($member) && !byline_relation_set($id, 'member', $member, true)) { return false; }
            }
            // Retain the old task source meta, but use the Collection association from now on.
            if (defined('BYLINE_TASK_POST_TYPE')) {
                foreach (get_posts(['post_type' => BYLINE_TASK_POST_TYPE, 'post_status' => 'any', 'numberposts' => -1,
                    'meta_key' => BYLINE_TASK_COVERAGE_META, 'meta_value' => $legacy_id]) as $task) {
                    if (!get_post_meta($task->ID, BYLINE_TASK_COLLECTION_META, true)) {
                        update_post_meta($task->ID, BYLINE_TASK_COLLECTION_META, (int) $id);
                        if ((int) get_post_meta($task->ID, BYLINE_TASK_COLLECTION_META, true) !== (int) $id) { return false; }
                    }
                }
            }
            update_post_meta($legacy_id, '_byline_coverage_migrated', (int) $id);
        }
        return true;
    } finally { delete_option('byline_coverage_migration_lock'); }
}

/** Public allow-list: never call the authenticated Collection detail projection. */
function byline_collection_public_coverage(int $id): ?array
{
    $post = byline_collection_post($id);
    $p = byline_collection_public_settings($id);
    if (!$post || !$p['publicEnabled'] || !$p['publicSlug']) { return null; }
    $members = byline_relation_ids($id, 'story');
    $ordered = array_values(array_unique(array_merge($p['storyOrder'], $members)));
    if ($p['featuredStoryId']) { $ordered = array_values(array_unique(array_merge([$p['featuredStoryId']], $ordered))); }
    $stories = [];
    foreach ($ordered as $story_id) {
        if (!in_array($story_id, $members, true)) { continue; }
        $story = get_post($story_id);
        // Password-protected posts are not public coverage either.
        if (!$story || !empty($story->post_password)) { continue; }
        $projection = byline_public_story_projection($story);
        if ($projection) { $stories[] = $projection; }
    }
    $attachment = (int) $p['artworkAttachmentId'];
    $url = $attachment ? wp_get_attachment_image_url($attachment, 'full') : '';
    $status = (string) get_post_meta($id, '_byline_collection_status', true);
    return [
        'id' => $id, 'slug' => $p['publicSlug'], 'title' => $p['publicTitle'],
        'description' => $p['publicDescription'], 'overview' => $p['publicOverview'],
        'startAt' => (string) get_post_meta($id, '_byline_collection_start', true),
        'endAt' => (string) get_post_meta($id, '_byline_collection_end', true),
        'status' => ['planning' => 'upcoming', 'active' => 'active', 'wrapping-up' => 'past', 'archived' => 'archived'][$status] ?? 'upcoming',
        'artwork' => $url ? ['id' => $attachment, 'url' => esc_url_raw($url), 'alt' => sanitize_text_field((string) get_post_meta($attachment, '_wp_attachment_image_alt', true))] : null,
        'stories' => $stories,
    ];
}
