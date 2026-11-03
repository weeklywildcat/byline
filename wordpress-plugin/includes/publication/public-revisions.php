<?php
/** Public artifact mutation audit. Editorial notes/tasks/jobs never enter here. */
if (!defined('ABSPATH')) { exit; }

function byline_begin_public_write(): void
{
    if (isset($GLOBALS['byline_snapshot_writer'])) return;
    if (!byline_snapshot_database_lock(true, 30)) throw new RuntimeException('Public content is busy preparing a build snapshot; retry this save.');
    $key = 'byline_snapshot_writer_' . bin2hex(random_bytes(12));
    add_option($key, time(), '', false);
    $GLOBALS['byline_snapshot_writer'] = $key;
}

function byline_public_mutation(string $reason): void
{
    byline_begin_public_write();
    // Advance immediately for race detection, but enqueue only once after all
    // Gutenberg/REST metadata and relationships in this request have settled.
    $revision = byline_bump_public_content_revision();
    if (function_exists('byline_deployment_record_expected_revision')) byline_deployment_record_expected_revision($revision);
    $GLOBALS['byline_public_mutation_reason'] = $reason;
}

function byline_flush_public_mutations(): void
{
    if (isset($GLOBALS['byline_snapshot_writer'])) {
        delete_option($GLOBALS['byline_snapshot_writer']);
        unset($GLOBALS['byline_snapshot_writer']);
        byline_snapshot_database_lock(false);
    }
    if (!isset($GLOBALS['byline_public_mutation_reason'])) return;
    $reason = $GLOBALS['byline_public_mutation_reason'];
    unset($GLOBALS['byline_public_mutation_reason']);
    byline_schedule_deployment($reason, true, byline_bump_public_content_revision());
}
add_action('shutdown', 'byline_flush_public_mutations', PHP_INT_MAX);
// Mark a public writer before Core changes the row. The shared lock
// prevents a generator from accepting an in-flight REST/Gutenberg save even
// when the writer is paused between content and metadata updates.
add_filter('wp_insert_post_data', static function ($data, $postarr): array {
    $old = !empty($postarr['ID']) ? get_post((int) $postarr['ID']) : null;
    if (byline_snapshot_public_type((string) ($data['post_type'] ?? '')) && (($data['post_status'] ?? '') === 'publish' || ($old instanceof WP_Post && $old->post_status === 'publish'))) byline_public_mutation('public-content');
    if ($old instanceof WP_Post && $old->post_type === 'byline_collection' && $old->post_status !== ($data['post_status'] ?? '') && !empty(byline_collection_public_settings((int) $old->ID)['publicEnabled'])) byline_public_mutation('public-coverage');
    return $data;
}, 20, 2);

function byline_snapshot_public_type(string $type): bool
{
    return in_array($type, ['post', 'page', 'byline_guest', 'byline_coverage', 'byline_correction', 'ww_school_event'], true);
}

function byline_revision_on_status($new_status, $old_status, $post): void
{
    if (!$post instanceof WP_Post || !byline_snapshot_public_type($post->post_type) || ($new_status !== 'publish' && $old_status !== 'publish')) return;
    if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) return;
    byline_public_mutation('public-content');
}
add_action('transition_post_status', 'byline_revision_on_status', 20, 3);

function byline_snapshot_attachment_is_used(int $id): bool
{
    global $wpdb;
    foreach (get_posts(['post_type' => 'byline_collection', 'post_status' => 'private', 'numberposts' => -1, 'fields' => 'ids', 'meta_key' => '_byline_collection_public']) as $collection) {
        $presentation = get_post_meta($collection, '_byline_collection_public', true);
        if (is_array($presentation) && !empty($presentation['publicEnabled']) && (int) ($presentation['artworkAttachmentId'] ?? 0) === $id) return true;
    }
    $url = wp_get_attachment_url($id);
    if ($url && strpos(wp_json_encode(byline_get_publication_config()), (string) $url) !== false) return true;
    $like_id = 'wp-image-' . $id . '([^0-9]|$)';
    $like_json = '"(id|mediaId|imageId)"[[:space:]]*:[[:space:]]*' . $id . '([^0-9]|$)';
    $like_url = $url ? '%' . $wpdb->esc_like((string) $url) . '%' : '%__byline_no_attachment_source__%';
    $public_types = ['post', 'page', 'byline_coverage', 'byline_guest'];
    $types = "'" . implode("','", $public_types) . "'";
    $used = $wpdb->get_var($wpdb->prepare("SELECT p.ID FROM {$wpdb->posts} p LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID WHERE p.post_status = 'publish' AND p.post_type IN ($types) AND ((m.meta_key IN ('_thumbnail_id','_byline_guest_image_id') AND m.meta_value = %s) OR p.post_content REGEXP %s OR p.post_content REGEXP %s OR p.post_content LIKE %s) LIMIT 1", (string) $id, $like_id, $like_json, $like_url));
    if ($used) return true;
    return (bool) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = '_ww_author_photo_id' AND meta_value = %s LIMIT 1", (string) $id));
}

function byline_revision_on_delete(int $id): void
{
    $post = get_post($id);
    if ($post instanceof WP_Post && $post->post_type === 'byline_collection' && !empty(byline_collection_public_settings($id)['publicEnabled'])) byline_public_mutation('public-coverage');
    if ($post instanceof WP_Post && (($post->post_status === 'publish' && byline_snapshot_public_type($post->post_type)) || ($post->post_type === 'attachment' && byline_snapshot_attachment_is_used($id)))) byline_public_mutation('public-delete');
}
add_action('before_delete_post', 'byline_revision_on_delete');

function byline_revision_on_post_meta($meta_id, $id, $key, $value = null): void
{
    $post = get_post((int) $id);
    if (!$post instanceof WP_Post) return;
    $key = (string) $key;
    if ($post->post_type === 'attachment') {
        if (!byline_snapshot_attachment_is_used((int) $id)) return;
        if (in_array($key, ['_wp_attachment_metadata', '_wp_attached_file', '_wp_attachment_image_alt', '_byline_story_image_credit'], true)
            || strpos($key, '_ww_image_') === 0 || strpos($key, '_byline_image_') === 0) byline_public_mutation('public-media');
        return;
    }
    if ($post->post_type === 'byline_collection') {
        $presentation = get_post_meta((int) $id, '_byline_collection_public', true);
        if ($key === '_byline_collection_public' || (!empty($presentation['publicEnabled']) && in_array($key, ['_byline_collection_start', '_byline_collection_end', '_byline_collection_status'], true))) byline_public_mutation('public-coverage');
        return;
    }
    if ($post->post_status !== 'publish' || !byline_snapshot_public_type($post->post_type)) return;
    // Only metadata read by public serializers/rendered blocks. Private notes,
    // visual requests, workflow status and editorial tasks are excluded.
    if (in_array($key, [
        '_thumbnail_id', 'weekly_wildcat_primary_game_id', '_byline_story_contributors', '_byline_story_coverage_ids', '_byline_sports_archive_key', '_byline_sports_archive_routes',
        '_byline_page_eyebrow', '_byline_page_indexing',
        '_byline_guest_display_name', '_byline_guest_role', '_byline_guest_bio', '_byline_guest_image_id', '_byline_guest_public_links', '_byline_guest_profile_page',
        '_byline_coverage_description', '_byline_coverage_overview', '_byline_coverage_start_at', '_byline_coverage_end_at', '_byline_coverage_status', '_byline_coverage_public_enabled', '_byline_coverage_story_ids',
        '_byline_correction_type', '_byline_correction_text', '_byline_correction_recorded_at',
        '_ww_event_start_datetime', '_ww_event_end_datetime', '_ww_event_all_day', '_ww_event_location', '_ww_event_description', '_ww_event_external_url', '_ww_event_status', '_ww_event_type'
    ], true)) byline_public_mutation('public-metadata');
}
foreach (['added_post_meta', 'updated_post_meta', 'deleted_post_meta'] as $hook) add_action($hook, 'byline_revision_on_post_meta', 20, 4);

function byline_revision_on_attachment($id): void { if (byline_snapshot_attachment_is_used((int) $id)) byline_public_mutation('public-media'); }
add_action('edit_attachment', 'byline_revision_on_attachment');

function byline_revision_on_user_meta($meta_id, $id, $key, $value = null): void
{
    if (in_array($key, ['description', '_ww_author_pronouns', '_ww_author_role', '_ww_author_photo_id', '_ww_author_show_in_directory'], true) || strpos((string) $key, '_ww_author_social_') === 0) byline_public_mutation('public-profile');
}
foreach (['added_user_meta', 'updated_user_meta', 'deleted_user_meta'] as $hook) add_action($hook, 'byline_revision_on_user_meta', 20, 4);
function byline_revision_on_profile($id, $old): void
{
    $user = get_user_by('id', $id);
    if ($user instanceof WP_User && ($user->display_name !== $old->display_name || $user->user_nicename !== $old->user_nicename || $user->user_url !== $old->user_url)) byline_public_mutation('public-profile');
}
add_action('profile_update', 'byline_revision_on_profile', 20, 2);
add_action('deleted_user', static function (): void { byline_public_mutation('public-profile'); });
function byline_revision_on_term($id, $tt_id, $taxonomy): void
{
    if (in_array($taxonomy, ['category', 'post_tag'], true)) byline_public_mutation('public-terms');
}
foreach (['created_term', 'edited_term', 'delete_term'] as $hook) add_action($hook, 'byline_revision_on_term', 20, 3);
add_action('set_object_terms', static function ($id, $terms, $tt_ids, $taxonomy, $append, $old_tt_ids): void {
    $post = get_post((int) $id);
    if ($post instanceof WP_Post && $post->post_status === 'publish' && $post->post_type === 'post' && in_array($taxonomy, ['category', 'post_tag'], true) && $tt_ids !== $old_tt_ids) byline_public_mutation('public-terms');
}, 20, 6);

foreach (['post', 'user'] as $object_type) {
    foreach (['add', 'update', 'delete'] as $operation) {
        add_filter($operation . '_' . $object_type . '_metadata', static function ($check, $id, $key, $value) use ($object_type, $operation) {
            if ($check !== null) return $check;
            if ($operation === 'delete' && !metadata_exists($object_type, $id, $key)) return $check;
            if ($operation === 'update') {
                $old = get_metadata($object_type, $id, $key, true);
                if ((is_scalar($old) && is_scalar($value) && (string) $old === (string) $value) || maybe_serialize($old) === maybe_serialize($value)) return $check;
            }
            // Advance before the SQL write too, so even a request killed before
            // Core's post-write action cannot leave an unrevisioned mutation.
            if ($object_type === 'post') byline_revision_on_post_meta(0, $id, $key, $value);
            else byline_revision_on_user_meta(0, $id, $key, $value);
            return $check;
        }, 20, 4);
    }
}

// Core's pre-write hooks close the remaining term/profile/attachment windows.
add_filter('pre_insert_term', static function ($term, $taxonomy) {
    if (in_array($taxonomy, ['category', 'post_tag'], true)) byline_public_mutation('public-terms');
    return $term;
}, 20, 2);
add_action('edit_terms', static function ($id, $taxonomy): void {
    if (in_array($taxonomy, ['category', 'post_tag'], true)) byline_public_mutation('public-terms');
}, 20, 2);
add_action('pre_delete_term', static function ($id, $taxonomy): void {
    if (in_array($taxonomy, ['category', 'post_tag'], true)) byline_public_mutation('public-terms');
}, 20, 2);
foreach (['add_term_relationship', 'delete_term_relationships'] as $hook) {
    add_action($hook, static function ($id, $tt_ids, $taxonomy): void {
        $post = get_post((int) $id);
        if ($post instanceof WP_Post && $post->post_type === 'post' && $post->post_status === 'publish' && in_array($taxonomy, ['category', 'post_tag'], true)) byline_public_mutation('public-terms');
    }, 20, 3);
}
add_filter('wp_pre_insert_user_data', static function ($data, $update, $id) {
    $old = $id ? get_user_by('id', $id) : null;
    foreach (['display_name', 'user_nicename', 'user_url'] as $field) {
        if (!$old || ($data[$field] ?? '') !== $old->$field) { byline_public_mutation('public-profile'); break; }
    }
    return $data;
}, 20, 3);
add_action('delete_user', static function (): void { byline_public_mutation('public-profile'); });
add_filter('wp_insert_attachment_data', static function ($data, $postarr) {
    if (!empty($postarr['ID']) && byline_snapshot_attachment_is_used((int) $postarr['ID'])) byline_public_mutation('public-media');
    return $data;
}, 20, 2);
add_filter('pre_update_option_' . BYLINE_PUBLICATION_OPTION, static function ($value, $old) {
    if ($value !== $old) byline_public_mutation('publication');
    return $value;
}, 20, 2);

// Canonical rendered HTML also depends on Core configuration and renderer code.
foreach (['timezone_string', 'gmt_offset', 'permalink_structure', 'category_base', 'tag_base', 'date_format', 'time_format', 'home', 'siteurl', 'blogname', 'blogdescription'] as $option) {
    add_filter('pre_update_option_' . $option, static function ($value, $old) {
        if ($value !== $old) byline_public_mutation('public-render-settings');
        return $value;
    }, 20, 2);
}
add_action('upgrader_process_complete', static function ($upgrader, $context): void {
    if (is_array($context) && in_array($context['type'] ?? '', ['plugin', 'theme', 'core'], true)) byline_public_mutation('public-renderer');
}, 20, 2);
foreach (['activated_plugin', 'deactivated_plugin', 'switch_theme'] as $hook) add_action($hook, static function (): void { byline_public_mutation('public-renderer'); });
