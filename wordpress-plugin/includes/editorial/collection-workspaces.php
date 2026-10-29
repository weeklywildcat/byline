<?php
/** Private newsroom workspaces. WordPress owns content; relationships are indexed edges. */
if (!defined('ABSPATH')) { exit; }

const BYLINE_COLLECTION_RELATIONSHIPS_SCHEMA_VERSION_OPTION = 'byline_collection_relationships_version';
const BYLINE_COLLECTION_RELATIONSHIPS_SCHEMA_VERSION = 1;
const BYLINE_COLLECTION_POST_TYPE = 'byline_collection';
const BYLINE_INTERVIEW_POST_TYPE = 'byline_interview';
const BYLINE_SOURCE_POST_TYPE = 'byline_source';
const BYLINE_RESOURCE_POST_TYPE = 'byline_resource';

function byline_collection_types(): array
{
    return ['event' => 'Event coverage', 'ongoing' => 'Ongoing coverage', 'series' => 'Series', 'project' => 'Special project', 'other' => 'Other'];
}
function byline_collection_statuses(): array
{
    return ['planning' => 'Planning', 'active' => 'Active', 'wrapping-up' => 'Wrapping up', 'archived' => 'Archived'];
}
function byline_interview_statuses(): array
{
    return ['planned' => 'Planned', 'scheduled' => 'Scheduled', 'completed' => 'Completed', 'follow-up' => 'Needs follow-up', 'cancelled' => 'Cancelled'];
}
function byline_collections_register(): void
{
    foreach ([BYLINE_COLLECTION_POST_TYPE, BYLINE_INTERVIEW_POST_TYPE, BYLINE_SOURCE_POST_TYPE, BYLINE_RESOURCE_POST_TYPE] as $type) {
        register_post_type($type, [
            'public' => false, 'publicly_queryable' => false, 'exclude_from_search' => true,
            'show_ui' => false, 'show_in_rest' => false, 'rewrite' => false, 'query_var' => false,
            'supports' => ['title', 'author'], 'capability_type' => 'post', 'map_meta_cap' => true,
        ]);
    }
 }
/** Called by the existing upgrade coordinator, including CLI/update installs. */
function byline_collection_ensure_schema(): bool
{
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = $wpdb->prefix . 'byline_relationships';
    dbDelta("CREATE TABLE $table (
        owner_id bigint(20) unsigned NOT NULL,
        relation varchar(32) NOT NULL,
        target_id bigint(20) unsigned NOT NULL,
        PRIMARY KEY  (owner_id,relation,target_id),
        KEY reverse_edge (target_id,relation,owner_id)
    ) " . $wpdb->get_charset_collate() . ';');
    return $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($table))) === $table;
}
add_action('init', 'byline_collections_register');

function byline_relation_ids(int $owner, string $relation, bool $reverse = false): array
{
    global $wpdb;
    $table = $wpdb->prefix . 'byline_relationships';
    $select = $reverse ? 'owner_id' : 'target_id';
    $where = $reverse ? 'target_id' : 'owner_id';
    return array_map('intval', $wpdb->get_col($wpdb->prepare("SELECT $select FROM $table WHERE $where = %d AND relation = %s ORDER BY $select", $owner, $relation)));
}
function byline_relation_set(int $owner, string $relation, int $target, bool $linked): bool
{
    global $wpdb;
    $table = $wpdb->prefix . 'byline_relationships';
    if ($linked) {
        $result = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table (owner_id, relation, target_id) VALUES (%d, %s, %d)", $owner, $relation, $target));
    } else {
        $result = $wpdb->delete($table, ['owner_id' => $owner, 'relation' => $relation, 'target_id' => $target], ['%d', '%s', '%d']);
    }
    return $result !== false;
}
function byline_collection_post(int $id, string $type = BYLINE_COLLECTION_POST_TYPE): ?WP_Post
{
    $post = get_post($id);
    return $post instanceof WP_Post && $post->post_type === $type && $post->post_status === 'private' ? $post : null;
}
function byline_collection_can_view(int $id, ?int $user_id = null): bool
{
    return user_can($user_id ?? get_current_user_id(), 'edit_posts') && byline_collection_post($id) !== null;
}
function byline_collection_can_edit(int $id, ?int $user_id = null): bool
{
    $user_id = $user_id ?? get_current_user_id();
    if (!byline_collection_can_view($id, $user_id)) { return false; }
    return user_can($user_id, 'edit_others_posts') || (int) get_post_meta($id, '_byline_collection_lead', true) === $user_id
        || in_array($user_id, byline_relation_ids($id, 'member'), true);
}
function byline_collection_error(string $message, int $status = 400): WP_Error
{
    return new WP_Error('byline_collection_' . $status, $message, ['status' => $status]);
}
function byline_collection_people(array $ids): array
{
    return array_values(array_filter(array_map('byline_editorial_rest_user_person', $ids)));
}
function byline_collection_story_ids(int $id): array
{
    return array_values(array_filter(byline_relation_ids($id, 'story'), static function ($story): bool {
        return byline_story_context($story)['view'] ?? false;
    }));
}
function byline_collection_story_row(int $id): array
{
    $story = byline_editorial_rest_planning_story(byline_editorial_planning_story_summary($id, null, null, true));
    $story['canEditPlanning'] = current_user_can('edit_post', $id);
    return $story;
}
function byline_collection_item(int $id): array
{
    if (!byline_collection_can_view($id)) { return []; }
    $post = byline_collection_post($id);
    $get = static function ($field) use ($id) { return (string) get_post_meta($id, '_byline_collection_' . $field, true); };
    $story_ids = byline_collection_story_ids($id);
    update_meta_cache('post', $story_ids);
    $summary = [];
    foreach ($story_ids as $story) {
        $status = byline_editorial_status_label(byline_get_effective_editorial_status($story));
        $summary[$status] = ($summary[$status] ?? 0) + 1;
    }
    $tasks = byline_list_tasks(['collectionId' => $id, 'state' => 'open', 'limit' => 200]);
    return [
        'version' => function_exists('byline_collection_version') ? byline_collection_version($id) : '',
        'id' => $id, 'name' => $post->post_title, 'brief' => metadata_exists('post', $id, '_byline_collection_brief') ? (string) get_post_meta($id, '_byline_collection_brief', true) : $post->post_content,
        'type' => $get('type') ?: 'other', 'status' => $get('status') ?: 'planning',
        'lead' => byline_editorial_rest_user_person((int) $get('lead')),
        'members' => byline_collection_people(byline_relation_ids($id, 'member')),
        'startDate' => byline_editorial_format_datetime_for_site($get('start'), 'Y-m-d'), 'endDate' => byline_editorial_format_datetime_for_site($get('end'), 'Y-m-d'), 'archived' => $get('status') === 'archived',
        'createdAt' => str_replace(' ', 'T', $post->post_date_gmt) . 'Z', 'updatedAt' => str_replace(' ', 'T', $post->post_modified_gmt) . 'Z',
        'storyIds' => $story_ids, 'storyCount' => count($story_ids), 'storySummary' => $summary,
        'interviewCount' => count(byline_collection_child_ids($id, BYLINE_INTERVIEW_POST_TYPE)), 'openTaskCount' => count($tasks),
        'canEdit' => byline_collection_can_edit($id), 'canDuplicate' => current_user_can('edit_others_posts'),
    ];
}
function byline_collection_child_ids(int $id, string $type): array
{
    return array_map('intval', get_posts(['post_type' => $type, 'post_status' => 'private', 'post_parent' => $id, 'numberposts' => -1, 'fields' => 'ids']));
}
function byline_collection_save(array $input, int $id = 0)
{
    if (!$id && !current_user_can('edit_others_posts')) { return byline_collection_error('Only editors can create Collections.', 403); }
    if ($id && !byline_collection_can_edit($id)) { return byline_collection_error('You cannot edit this Collection.', 403); }
    $old = $id ? byline_collection_item($id) : [];
    $name = byline_task_text($input['name'] ?? ($old['name'] ?? ''), 240);
    $type = $input['type'] ?? ($old['type'] ?? 'other');
    $status = $input['status'] ?? ($old['status'] ?? 'planning');
    $lead = absint($input['leadId'] ?? ($old['lead']['id'] ?? get_current_user_id()));
    if (!is_string($type) || !is_string($status) || !$name || !isset(byline_collection_types()[$type]) || !isset(byline_collection_statuses()[$status])) { return byline_collection_error('Add a name and choose a valid type and status.'); }
    if ($lead && !user_can($lead, 'edit_posts')) { return byline_collection_error('Choose a newsroom user as lead.'); }
    $dates = [];
    foreach (['startDate', 'endDate'] as $field) {
        $raw = $input[$field] ?? ($old[$field] ?? '');
        $dates[$field] = $raw === '' || $raw === null ? '' : (is_scalar($raw) ? byline_editorial_sanitize_deadline($raw) : '');
        if ($raw && !$dates[$field]) { return byline_collection_error('Use a valid Collection date.'); }
    }
    if ($dates['startDate'] && $dates['endDate'] && $dates['endDate'] < $dates['startDate']) { return byline_collection_error('The end date must follow the start date.'); }
    if ($id && array_key_exists('brief', $input)) {
        $brief = byline_story_paragraph($input['brief'], 4000);
        $previous = get_post_meta($id, '_byline_collection_brief', true);
        if (isset($input['expectedBrief']) && $input['expectedBrief'] !== $old['brief']) { return byline_collection_error('The brief changed. Reload before saving.', 409); }
        if ($brief !== $old['brief']) {
            $written = metadata_exists('post', $id, '_byline_collection_brief')
                ? update_post_meta($id, '_byline_collection_brief', wp_slash($brief), $previous)
                : add_post_meta($id, '_byline_collection_brief', wp_slash($brief), true);
            if (!$written) { return byline_collection_error('The brief changed while you were editing. Try again.', 409); }
        }
    }
    $post = ['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'post_title' => $name,
        'post_content' => byline_story_paragraph($input['brief'] ?? ($old['brief'] ?? ''), 4000)];
    if ($id) {
        $post = ['ID' => $id];
        if (array_key_exists('name', $input)) { $post['post_title'] = $name; }

    }
    $saved = $id ? wp_update_post(wp_slash($post), true) : wp_insert_post(wp_slash($post), true);
    if (is_wp_error($saved)) { return $saved; }
    foreach (['type' => $type, 'status' => $status, 'lead' => $lead, 'start' => $dates['startDate'], 'end' => $dates['endDate']] as $key => $value) {
        $input_key = ['lead' => 'leadId', 'start' => 'startDate', 'end' => 'endDate'][$key] ?? $key;
        if (!$id || array_key_exists($input_key, $input)) { update_post_meta($saved, '_byline_collection_' . $key, $value); }
    }
    $event = !$id ? 'collection_created' : (($old['status'] ?? '') !== $status ? ($status === 'archived' ? 'collection_archived' : 'collection_status_changed') : 'collection_changed');
    if (!$id || array_diff_assoc(array_intersect_key($input, array_flip(['name','type','leadId','status','startDate','endDate'])), $old)) {
        byline_collection_activity((int) $saved, $event);
    }
    return byline_collection_item((int) $saved);
}
function byline_collection_activity(int $id, string $action): void
{
    // Reuse the existing safe, bounded activity domain and its permission projection.
    $record = byline_record_activity(0, $action, ['collectionId' => $id]);
    if (!empty($record['id'])) { byline_relation_set($id, 'activity', (int) $record['id'], true); }
}
function byline_collection_activity_items(int $id): array
{
    $items = [];
    foreach (array_reverse(byline_relation_ids($id, 'activity')) as $activity_id) {
        $post = get_post($activity_id);
        if ($post && $post->post_type === BYLINE_ACTIVITY_POST_TYPE) {
            $items[] = byline_activity_safe_projection(byline_activity_raw_record($post));
        }
        if (count($items) >= 50) { break; }
    }
    return $items;
}
// Remove both directions when a referenced WordPress object is permanently removed.
add_action('deleted_post', static function (int $id): void {
    global $wpdb;
    $wpdb->query($wpdb->prepare('DELETE FROM ' . $wpdb->prefix . "byline_relationships WHERE owner_id = %d OR (target_id = %d AND relation NOT IN ('member', 'interviewer'))", $id, $id));
});

add_action('byline_editorial_task_changed', static function ($task_id, $task, $operation): void {
    $collection = (int) ($task['collectionId'] ?? 0);
    if ($collection > 0 && in_array($operation, ['created', 'completed', 'deleted'], true)) {
        byline_collection_activity($collection, 'task_' . $operation);
    }
}, 20, 3);
add_action('deleted_user', static function (int $id): void {
    global $wpdb;
    $wpdb->query($wpdb->prepare("DELETE FROM " . $wpdb->prefix . "byline_relationships WHERE target_id = %d AND relation IN ('member', 'interviewer')", $id));
});
