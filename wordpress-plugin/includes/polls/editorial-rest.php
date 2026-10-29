<?php
/** Protected aggregate poll reads; public voting and voter identity remain separate. */
if (!defined('ABSPATH')) { exit; }
function byline_poll_editorial_permission(WP_REST_Request $request): bool
{
    if (!byline_poll_feature_enabled() || !current_user_can('edit_byline_polls')) { return false; }
    $id = absint($request['id'] ?? 0);
    return !$id || (get_post_type($id) === BYLINE_POLL_POST_TYPE && current_user_can('edit_byline_poll', $id));
}
function byline_poll_editorial_read(WP_REST_Request $request)
{
    $id = absint($request['id'] ?? 0);
    if ($id) {
        $record = byline_poll_record(get_post($id));
        return rest_ensure_response($request->get_param('results') === 'true' ? byline_poll_admin_results($record) : $record);
    }
    $polls = [];
    foreach (get_posts(['post_type'=>BYLINE_POLL_POST_TYPE,'post_status'=>['draft','pending','publish','private'],'posts_per_page'=>min(100,max(1,absint($request->get_param('limit') ?? 50))),'offset'=>min(10000,absint($request->get_param('offset') ?? 0)),'orderby'=>'modified','order'=>'DESC']) as $post) {
        if (current_user_can('edit_byline_poll',(int)$post->ID)) { $polls[] = byline_poll_record($post); }
    }
    return rest_ensure_response(['polls'=>$polls]);
}
add_action('rest_api_init',static function ():void {
    foreach (['/editorial/polls','/editorial/polls/(?P<id>\d+)'] as $path) {
        register_rest_route(BYLINE_REST_NAMESPACE,$path,['methods'=>'GET','callback'=>'byline_poll_editorial_read','permission_callback'=>'byline_poll_editorial_permission']);
    }
});
