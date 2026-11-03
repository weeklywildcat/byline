<?php
/** Shared reporting with separately reusable source identity and protected contacts. */
if (!defined('ABSPATH')) { exit; }

function byline_interview_item(int $id): array
{
    $post = byline_collection_post($id, BYLINE_INTERVIEW_POST_TYPE);
    if (!$post || !byline_collection_can_view((int) $post->post_parent)) { return []; }
    $collection_id = (int) $post->post_parent;
    $source_id = (int) get_post_meta($id, '_byline_interview_source', true);
    $source = byline_collection_post($source_id, BYLINE_SOURCE_POST_TYPE);
    $result = ['id' => $id, 'collectionId' => $collection_id, 'sourceId' => $source_id,
        'interviewee' => $source ? $source->post_title : $post->post_title,
        'status' => get_post_meta($id, '_byline_interview_status', true) ?: 'planned',
        'scheduleMode' => get_post_meta($id, '_byline_interview_scheduleMode', true) ?: (get_post_meta($id, '_byline_interview_scheduledAt', true) ? 'exact' : 'unscheduled'),
        'windowStart' => (string) get_post_meta($id, '_byline_interview_windowStart', true),
        'windowEnd' => (string) get_post_meta($id, '_byline_interview_windowEnd', true),
        'endAt' => (string) get_post_meta($id, '_byline_interview_endAt', true),
        'location' => (string) get_post_meta($id, '_byline_interview_location', true),
        'scheduledAt' => (string) get_post_meta($id, '_byline_interview_scheduledAt', true),
        'completedAt' => (string) get_post_meta($id, '_byline_interview_completedAt', true),
        'interviewers' => byline_collection_people(byline_relation_ids($id, 'interviewer')),
        'storyIds' => array_values(array_filter(byline_relation_ids($id, 'interview-story'), 'byline_story_context_can_view')),
        'notes' => $post->post_content,
        'followUps' => (string) get_post_meta($id, '_byline_interview_followUps', true),
        'resourceIds' => byline_relation_ids($id, 'recording'),
        'createdAt' => str_replace(' ', 'T', $post->post_date_gmt) . 'Z', 'updatedAt' => str_replace(' ', 'T', $post->post_modified_gmt) . 'Z',
        'canEdit' => byline_collection_can_edit($collection_id),
    ];
    // Do not return a contact field at all to a newsroom observer.
    if (byline_collection_can_edit($collection_id)) {
        $result['canEditContact'] = current_user_can('edit_others_posts') || ($source && (int) $source->post_author === get_current_user_id());
        $result['privateContact'] = (string) get_post_meta($source_id, '_byline_source_contact', true);
    }
    return $result;
}
function byline_interview_save(int $collection_id, array $input, int $id = 0)
{
    if (!byline_collection_can_edit($collection_id)) { return byline_collection_error('You cannot edit reporting in this Collection.', 403); }
    $old = $id ? byline_interview_item($id) : [];
    if ($id && (!$old || $old['collectionId'] !== $collection_id)) { return byline_collection_error('Interview not found.', 404); }
    if ($id && isset($input['expectedUpdatedAt']) && $input['expectedUpdatedAt'] !== $old['updatedAt']) { return byline_collection_error('This interview changed. Reload it before saving.', 409); }
    $name = byline_task_text($input['interviewee'] ?? ($old['interviewee'] ?? ''), 240);
    $status = $input['status'] ?? ($old['status'] ?? 'planned');
    if (!is_string($status) || !$name || !isset(byline_interview_statuses()[$status])) { return byline_collection_error('Add an interviewee and choose a valid status.'); }
    $mode = $input['scheduleMode'] ?? (array_key_exists('scheduledAt', $input) ? (!empty($input['scheduledAt']) ? 'exact' : 'unscheduled') : ($old['scheduleMode'] ?? 'unscheduled'));
    $timing = byline_story_appointment_build([
        'title' => $name, 'kind' => 'interview', 'status' => $status === 'cancelled' ? 'cancelled' : ($status === 'completed' ? 'completed' : 'planned'),
        'scheduleMode' => $mode, 'startAt' => $input['scheduledAt'] ?? ($old['scheduledAt'] ?? ''),
        'endAt' => $input['endAt'] ?? ($old['endAt'] ?? ''), 'windowStart' => $input['windowStart'] ?? ($old['windowStart'] ?? ''),
        'windowEnd' => $input['windowEnd'] ?? ($old['windowEnd'] ?? ''), 'location' => $input['location'] ?? ($old['location'] ?? ''),
    ], null, [], ['manage' => true, 'user' => get_current_user_id()]);
    if (is_wp_error($timing)) { return $timing; }
    $raw_completed = $input['completedAt'] ?? ($old['completedAt'] ?? '');
    $completed = $raw_completed ? byline_editorial_normalize_datetime($raw_completed) : '';
    if ($raw_completed && !$completed) { return byline_collection_error('Use a valid completed date and time.'); }
    if ($status === 'completed' && !$completed) { $completed = byline_story_now(); }
    $dates = ['scheduledAt' => $timing['startAt'] ?? '', 'completedAt' => $completed, 'scheduleMode' => $timing['scheduleMode'],
        'windowStart' => $timing['windowStart'] ?? '', 'windowEnd' => $timing['windowEnd'] ?? '', 'endAt' => $timing['endAt'] ?? '', 'location' => $timing['location']];
    $source_id = absint($input['sourceId'] ?? ($old['sourceId'] ?? 0));
    if ($source_id && !byline_collection_post($source_id, BYLINE_SOURCE_POST_TYPE)) { return byline_collection_error('Source not found.', 404); }
    // Reusing an identity never grants permission to overwrite its contacts.
    if ($source_id && $source_id !== ($old['sourceId'] ?? 0) && !current_user_can('edit_others_posts')) {
        return byline_collection_error('Only editors can reuse a source from another interview.', 403);
    }
    if (!$source_id) {
        $source_id = wp_insert_post(wp_slash(['post_type' => BYLINE_SOURCE_POST_TYPE, 'post_status' => 'private', 'post_title' => $name]), true);
        if (is_wp_error($source_id)) { return $source_id; }
    } elseif (isset($input['interviewee']) && $input['interviewee'] !== ($old['interviewee'] ?? null)) {
        // Renaming shared identities is deliberately editorial.
        if (!current_user_can('edit_others_posts')) { return byline_collection_error('Only editors can rename a source.', 403); }
        $saved = wp_update_post(wp_slash(['ID' => $source_id, 'post_title' => $name]), true);
        if (is_wp_error($saved)) { return $saved; }
    }
    if (array_key_exists('privateContact', $input)) {
        if ($id && !current_user_can('edit_others_posts') && (int) get_post($source_id)->post_author !== get_current_user_id()) {
            return byline_collection_error('Only the source creator or an editor can change contact details.', 403);
        }
        update_post_meta($source_id, '_byline_source_contact', wp_slash(byline_story_paragraph($input['privateContact'], 2000)));
    }
    $post = ['post_type' => BYLINE_INTERVIEW_POST_TYPE, 'post_status' => 'private', 'post_parent' => $collection_id,
        'post_title' => $name, 'post_content' => byline_story_paragraph($input['notes'] ?? ($old['notes'] ?? ''), 2000)];
    if ($id) {
        $post = ['ID' => $id];
        if (array_key_exists('interviewee', $input)) { $post['post_title'] = $name; }
        if (array_key_exists('notes', $input)) { $post['post_content'] = byline_story_paragraph($input['notes'], 2000); }
    }
    $saved = $id ? wp_update_post(wp_slash($post), true) : wp_insert_post(wp_slash($post), true);
    if (is_wp_error($saved)) { return $saved; }
    foreach (['source' => $source_id, 'status' => $status, 'followUps' => byline_story_paragraph($input['followUps'] ?? ($old['followUps'] ?? ''), 2000)] + $dates as $field => $value) {
        if (!$id || $field === 'source' || array_key_exists($field, $input) || ((array_key_exists('scheduleMode', $input) || array_key_exists('scheduledAt', $input)) && array_key_exists($field, $dates)) || ($field === 'completedAt' && $status === 'completed' && !$old['completedAt'])) {
            update_post_meta($saved, '_byline_interview_' . $field, wp_slash($value));
        }
    }
    if (!$id || ($old['status'] !== $status)) {
        byline_collection_activity($collection_id, !$id ? 'interview_created' : ($status === 'completed' ? 'interview_completed' : 'interview_changed'));
    }
    return byline_interview_item((int) $saved);
}
function byline_collection_resource_item(int $id): array
{
    $post = byline_collection_post($id, BYLINE_RESOURCE_POST_TYPE);
    if (!$post) { return []; }
    return ['id' => $id, 'label' => $post->post_title, 'url' => (string) get_post_meta($id, '_byline_resource_url', true),
        'kind' => (string) get_post_meta($id, '_byline_resource_kind', true), 'attachmentId' => (int) get_post_meta($id, '_byline_resource_attachment', true),
        'storyIds' => array_values(array_filter(byline_relation_ids($id, 'resource-story'), 'byline_story_context_can_view'))];
}
