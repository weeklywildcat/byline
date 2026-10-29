<?php
if (!defined('ABSPATH')) { exit; }

function byline_collections_permission(): bool { return current_user_can('edit_posts'); }
function byline_collection_rest_list(WP_REST_Request $request)
{
    $page = max(1, absint($request->get_param('page') ?? 1));
    $query = new WP_Query(['post_type' => BYLINE_COLLECTION_POST_TYPE, 'post_status' => 'private', 'posts_per_page' => 100,
        'paged' => $page, 'orderby' => 'modified', 'order' => 'DESC', 's' => byline_task_text($request->get_param('search') ?? '', 100)]);
    return rest_ensure_response(['collections' => array_map(static function ($p) { $item = byline_collection_item((int) $p->ID); $item['storyIdsTruncated'] = count($item['storyIds']) > 100; $item['storyIds'] = array_slice($item['storyIds'],0,100); return $item; }, $query->posts),
        'total' => (int) $query->found_posts, 'pages' => (int) $query->max_num_pages,
        'people' => array_map(static function ($person) { return $person + ['imageUrl' => $person['avatarUrl'] ?? '']; }, byline_editorial_rest_task_people()), 'timezone' => byline_editorial_planning_timezone()->getName(),
        'canCreate' => current_user_can('edit_others_posts')]);
}
function byline_collection_rest_detail(WP_REST_Request $request)
{
    $id = absint($request['id']);
    if (!byline_collection_can_view($id)) { return byline_collection_error('Collection not found.', 404); }
    $work = [];
    $story_ids = byline_collection_story_ids($id);
    foreach (array_slice($story_ids,0,50) as $story_id) {
        $access = byline_story_context($story_id);
        $work[] = ['storyId'=>$story_id,'tasks'=>byline_workspace_tasks($story_id,$access),'production'=>byline_workspace_media($story_id,$access)] + byline_workspace_reporting($story_id,$access);
    }
    $collection = byline_collection_item($id);
    $collection['storyIds'] = array_slice($story_ids,0,100);
    $collection['storyIdsTruncated'] = count($story_ids)>100;
    $interview_ids = byline_collection_child_ids($id,BYLINE_INTERVIEW_POST_TYPE);
    return rest_ensure_response(['storyLimit'=>100,'hasMoreStories'=>count($story_ids)>100,'interviewLimit'=>100,'hasMoreInterviews'=>count($interview_ids)>100,'work'=>$work,'workLimit'=>50,'hasMoreWork'=>count($story_ids)>50,'collection' => $collection, 'appointments' => byline_collection_story_appointments($id),
        'stories' => array_map(static function ($story) { return byline_collection_story_row($story); }, array_slice($story_ids,0,100)),
        'interviews' => array_map('byline_interview_item', array_slice($interview_ids,0,100)),
        'tasks' => array_map('byline_editorial_rest_task_item', byline_list_tasks(['collectionId' => $id, 'limit' => 200])),
        'resources' => array_values(array_filter(array_map('byline_collection_resource_item', array_slice(byline_relation_ids($id, 'resource'),0,100)))),
        'activity' => byline_collection_activity_items($id)]);
}
function byline_collection_rest_create_story(WP_REST_Request $request)
{
    $id = absint($request['id']);
    if (!byline_collection_can_edit($id)) { return byline_collection_error('You cannot create a story here.', 403); }
    $created = byline_editorial_rest_create_story($request);
    if (is_wp_error($created)) { return $created; }
    $data = $created->get_data();
    $story = (int) $data['story']['id'];
    if (!byline_relation_set($id, 'story', $story, true)) {
        wp_delete_post($story, true);
        return byline_collection_error('The story could not be linked. Try again.', 500);
    }
    byline_collection_activity($id, 'collection_story_added');
    return $created;
}
function byline_collection_rest_resource_options(WP_REST_Request $request)
{
    $posts = get_posts(['post_type' => BYLINE_RESOURCE_POST_TYPE, 'post_status' => 'private', 'posts_per_page' => 100,
        's' => byline_task_text($request->get_param('search') ?? '', 100), 'orderby' => 'modified', 'order' => 'DESC']);
    $resources = [];
    foreach ($posts as $post) {
        foreach (byline_relation_ids((int) $post->ID, 'resource', true) as $collection) {
            if (byline_collection_can_view($collection)) { $resources[] = byline_collection_resource_item((int) $post->ID); break; }
        }
    }
    return rest_ensure_response(['resources' => $resources]);
}
function byline_collection_rest_story_options(WP_REST_Request $request)
{
    $posts = get_posts(['post_type' => 'post', 'post_status' => ['draft', 'pending', 'future', 'publish', 'private'],
        'posts_per_page' => 100, 's' => byline_task_text($request->get_param('search') ?? '', 100), 'orderby' => 'modified', 'order' => 'DESC']);
    $stories = [];
    foreach ($posts as $post) {
        if (!byline_story_context_can_view((int) $post->ID)) { continue; }
        $story = byline_collection_story_row((int) $post->ID);
        $story['sections'] = wp_get_post_categories((int) $post->ID, ['fields' => 'names']);
        $stories[] = $story;
    }
    return rest_ensure_response(['stories' => $stories]);
}
function byline_collection_rest_save(WP_REST_Request $request)
{
    $result = byline_collection_save(byline_editorial_rest_body($request), absint($request['id'] ?? 0));
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}
function byline_collection_rest_interview(WP_REST_Request $request)
{
    $result = byline_interview_save(absint($request['id']), byline_editorial_rest_body($request), absint($request['interview'] ?? 0));
    return is_wp_error($result) ? $result : rest_ensure_response($result);
}
function byline_collection_rest_relationship(WP_REST_Request $request)
{
    $id = absint($request['id']); $target = absint($request['target']); $kind = (string) $request['kind'];
    if (!byline_collection_can_edit($id)) { return byline_collection_error('You cannot change this Collection.', 403); }
    $owner = $id;
    if (!empty($request['interview'])) {
        $owner = absint($request['interview']);
        $interview = byline_interview_item($owner);
        if (!$interview || $interview['collectionId'] !== $id) { return byline_collection_error('Interview not found.', 404); }
    }
    $resource_owner = absint($request['resource'] ?? 0);
    if ($resource_owner) {
        if ($kind !== 'resource-story' || !in_array($resource_owner, byline_relation_ids($id, 'resource'), true)) { return byline_collection_error('Resource not found.', 404); }
        $owner = $resource_owner;
    }
    if (in_array($kind, ['story', 'interview-story', 'resource-story'], true)) {
        $post = get_post($target);
        if (!$post || $post->post_type !== 'post' || !byline_story_context($target)['manage']) { return byline_collection_error('You cannot link this story.', 403); }
        if ($request->get_method() !== 'DELETE' && in_array($kind, ['interview-story', 'resource-story'], true) && !in_array($target, byline_relation_ids($id, 'story'), true)) { return byline_collection_error('Add the story to this Collection before linking its interview.'); }
    } elseif (in_array($kind, ['member', 'interviewer'], true)) {
        if (!user_can($target, 'edit_posts')) { return byline_collection_error('Choose a newsroom user.'); }
    } elseif (in_array($kind, ['resource', 'recording'], true)) {
        if (!byline_collection_post($target, BYLINE_RESOURCE_POST_TYPE)) { return byline_collection_error('Resource not found.', 404); }
        // IDs are not authorization: only reuse resources already in a visible collection.
        $visible = false;
        foreach (byline_relation_ids($target, 'resource', true) as $collection) {
            if (byline_collection_can_view($collection)) { $visible = true; break; }
        }
        if (!$visible) { return byline_collection_error('You cannot use this resource.', 403); }
    } else { return byline_collection_error('Unknown relationship.'); }
    if (($owner === $id && !in_array($kind, ['story', 'member', 'resource'], true)) || ($owner !== $id && !in_array($kind, ['interview-story', 'interviewer', 'recording', 'resource-story'], true))) { return byline_collection_error('Invalid relationship owner.'); }
    $linked = $request->get_method() !== 'DELETE';
    $before = in_array($target, byline_relation_ids($owner, $kind), true);
    if (!byline_relation_set($owner, $kind, $target, $linked)) { return byline_collection_error('The relationship could not be saved.', 500); }
    if ($before !== $linked) { byline_collection_activity($id, $kind === 'member' ? 'collection_member_changed' : ($kind === 'story' ? ($linked ? 'collection_story_added' : 'collection_story_removed') : 'collection_relationship_changed')); }
    return rest_ensure_response(['linked' => $linked]);
}
function byline_collection_rest_resource(WP_REST_Request $request)
{
    $id = absint($request['id']);
    if (!byline_collection_can_edit($id)) { return byline_collection_error('You cannot add resources here.', 403); }
    $input = byline_editorial_rest_body($request);
    $attachment = absint($input['attachmentId'] ?? 0);
    if ($attachment) {
        $post = get_post($attachment);
        if (!$post || $post->post_type !== 'attachment' || !current_user_can('edit_post', $attachment)) { return byline_collection_error('Choose an accessible Media Library attachment.', 403); }
        $input['url'] = wp_get_attachment_url($attachment);
        $input['label'] = $input['label'] ?? $post->post_title;
    }
    $link = byline_story_resource_input($input);
    if (is_wp_error($link)) { return $link; }
    $resource = wp_insert_post(wp_slash(['post_type' => BYLINE_RESOURCE_POST_TYPE, 'post_status' => 'private', 'post_title' => $link['label']]), true);
    if (is_wp_error($resource)) { return $resource; }
    foreach (['url' => $link['url'], 'kind' => $attachment ? 'Media Library' : $link['kind'], 'attachment' => $attachment] as $key => $value) { update_post_meta($resource, '_byline_resource_' . $key, wp_slash($value)); }
    if (!byline_relation_set($id, 'resource', $resource, true)) { wp_delete_post($resource, true); return byline_collection_error('The resource could not be linked.', 500); }
    byline_collection_activity($id, 'collection_resource_added');
    return rest_ensure_response(byline_collection_resource_item($resource));
}
function byline_collection_rest_story_context(WP_REST_Request $request)
{
    $story = absint($request['id']);
    if (!byline_story_context_can_view($story) || get_post_type($story) !== 'post') { return byline_collection_error('You cannot access this story.', 403); }
    $collections = array_values(array_filter(array_map('byline_collection_item', byline_relation_ids($story, 'story', true))));
    $interviews = array_values(array_filter(array_map('byline_interview_item', byline_relation_ids($story, 'interview-story', true))));
    $available = [];
    foreach ($collections as $collection) {
        foreach (byline_collection_child_ids($collection['id'], BYLINE_INTERVIEW_POST_TYPE) as $interview) {
            if (!in_array($story, byline_relation_ids($interview, 'interview-story'), true)) { $available[] = byline_interview_item($interview); }
        }
    }
    return rest_ensure_response(['canManage' => byline_story_context($story)['manage'], 'collections' => $collections, 'interviews' => $interviews, 'availableInterviews' => $available,
        'resources' => array_values(array_filter(array_map('byline_collection_resource_item', byline_relation_ids($story, 'resource-story', true))))]);
}
add_action('rest_api_init', static function (): void {
    $register = static function ($path, $methods, $callback): void {
        register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/' . $path, ['methods' => $methods, 'callback' => $callback, 'permission_callback' => 'byline_collections_permission']);
    };
    $register('collections/resource-options', 'GET', 'byline_collection_rest_resource_options');
    $register('collections/story-options', 'GET', 'byline_collection_rest_story_options');
    $register('collections', 'GET', 'byline_collection_rest_list');
    $register('collections', 'POST', 'byline_collection_rest_save');
    $register('collections/(?P<id>\d+)', 'GET', 'byline_collection_rest_detail');
    $register('collections/(?P<id>\d+)', 'POST', 'byline_collection_rest_save');
    $register('collections/(?P<id>\d+)/stories', 'POST', 'byline_collection_rest_create_story');
    $register('collections/(?P<id>\d+)/interviews/(?P<interview>\d+)', 'GET', static function (WP_REST_Request $request) {
        $item = byline_interview_item(absint($request['interview']));
        return $item && $item['collectionId'] === absint($request['id']) ? rest_ensure_response($item) : byline_collection_error('Interview not found.',404);
    });
    $register('collections/(?P<id>\d+)/interviews', 'POST', 'byline_collection_rest_interview');
    $register('collections/(?P<id>\d+)/interviews/(?P<interview>\d+)', 'POST', 'byline_collection_rest_interview');
    $register('collections/(?P<id>\d+)/links/(?P<kind>story|member|resource)/(?P<target>\d+)', 'POST,DELETE', 'byline_collection_rest_relationship');
    $register('collections/(?P<id>\d+)/interviews/(?P<interview>\d+)/links/(?P<kind>interview-story|interviewer|recording)/(?P<target>\d+)', 'POST,DELETE', 'byline_collection_rest_relationship');
    $register('collections/(?P<id>\d+)/resources/(?P<resource>\d+)/links/(?P<kind>resource-story)/(?P<target>\d+)', 'POST,DELETE', 'byline_collection_rest_relationship');
    $register('collections/(?P<id>\d+)/resources', 'POST', 'byline_collection_rest_resource');
    $register('stories/(?P<id>\d+)/collections', 'GET', 'byline_collection_rest_story_context');
});
