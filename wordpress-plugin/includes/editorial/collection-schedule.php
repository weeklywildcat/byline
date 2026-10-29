<?php
/** Note-free projections into the existing Calendar and Home schedule contracts. */
if (!defined('ABSPATH')) { exit; }
function byline_collection_schedule(string $from, string $to, int $collection_id = 0, ?int $user_id = null): array
{
    $user_id = $user_id ?? get_current_user_id();
    $out = ['appointments' => [], 'needsScheduling' => []];
    if ($collection_id && !byline_collection_can_view($collection_id, $user_id)) { return $out; }
    $args = ['post_type' => BYLINE_INTERVIEW_POST_TYPE, 'post_status' => 'private', 'posts_per_page' => 200, 'orderby' => 'modified', 'order' => 'DESC'];
    if ($collection_id) { $args['post_parent'] = $collection_id; }
    foreach (get_posts($args) as $post) {
        $cid = (int) $post->post_parent;
        if (!byline_collection_can_view($cid, $user_id)) { continue; }
        $id = (int) $post->ID;
        $get = static function ($field) use ($id): string { return (string) get_post_meta($id, '_byline_interview_' . $field, true); };
        $status = $get('status') ?: 'planned';
        if ($status === 'cancelled') { continue; }
        $mode = $get('scheduleMode') ?: ($get('scheduledAt') ? 'exact' : 'unscheduled');
        $item = ['id' => 'collection-interview-' . $id, 'title' => $post->post_title, 'kind' => 'interview',
            'status' => in_array($status, ['completed', 'follow-up'], true) ? 'completed' : ($status === 'scheduled' ? 'confirmed' : 'planned'),
            'scheduleMode' => $mode, 'startAt' => $get('scheduledAt') ?: null, 'endAt' => $get('endAt') ?: null,
            'windowStart' => $get('windowStart') ?: null, 'windowEnd' => $get('windowEnd') ?: null,
            'location' => $get('location'), 'assigneeIds' => byline_relation_ids($id, 'interviewer'),
            'assignees' => byline_collection_people(byline_relation_ids($id, 'interviewer')),
            'sourceId' => null, 'sourceLabel' => $post->post_title, 'storyId' => 0, 'storyTitle' => get_the_title($cid),
            'collectionId' => $cid, 'interviewId' => $id];
        if ($mode === 'exact' && $item['startAt']) {
            $day = byline_story_site_day($item['startAt']);
            $end = $item['endAt'] ? byline_story_site_day($item['endAt']) : $day;
            if ($day <= $to && max($day, $end) >= $from) { $out['appointments'][] = $item; }
        } elseif ($item['status'] !== 'completed') { $out['needsScheduling'][] = $item; }
    }
    return $out;
}
function byline_collection_story_appointments(int $collection_id, int $limit = 0): array
{
    $result = [];
    $story_ids = byline_collection_story_ids($collection_id);
    if ($limit > 0) { $story_ids = array_slice($story_ids,0,$limit); }
    foreach ($story_ids as $story) {
        $access = byline_story_context($story);
        foreach (byline_story_appointments($story) as $appointment) {
            if (!$access['manage'] && !in_array($access['user'], $appointment['assigneeIds'], true)) { continue; }
            $result[] = array_diff_key($appointment, ['notes' => 1, 'createdAt' => 1, 'updatedAt' => 1]) + ['storyId' => $story, 'storyTitle' => get_the_title($story)];
        }
    }
    return $result;
}
