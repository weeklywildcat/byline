<?php
/** Shared protected integration primitives. No public REST fields or settings writers. */
if (!defined('ABSPATH')) { exit; }

function byline_remote_access(): array
{
    $capabilities = [];
    foreach (['edit_posts', 'edit_others_posts', 'publish_posts', 'manage_byline', 'manage_byline_integrations', 'edit_byline_polls'] as $cap) { $capabilities[$cap] = current_user_can($cap); }
    $capabilities['canManagePresets'] = byline_editorial_presets_can_edit();
    $capabilities['canManageFeedback'] = current_user_can('edit_others_posts') || current_user_can('manage_byline');
    $capabilities['canTriggerDeployment'] = byline_can_manage_deployment();
    $capabilities['canReadPolls'] = byline_poll_feature_enabled() && current_user_can('edit_byline_polls');
    return ['user' => byline_editorial_rest_user_person(get_current_user_id()), 'timezone' => byline_editorial_planning_timezone()->getName(),
        'version' => BYLINE_PLUGIN_VERSION, 'capabilities' => $capabilities];
}
function byline_remote_staff(WP_REST_Request $request)
{
    $id = absint($request['id'] ?? 0);
    $query = ['capability' => 'edit_posts', 'number' => min(100, max(1, absint($request->get_param('limit') ?? 50))), 'offset' => min(10000, absint($request->get_param('offset') ?? 0)), 'orderby' => 'display_name', 'order' => 'ASC'];
    if ($id) { $query['include'] = [$id]; }
    $search = byline_task_text($request->get_param('query') ?? '', 100);
    if ($search !== '') { $query['search'] = '*' . $search . '*'; $query['search_columns'] = ['display_name']; }
    $people = array_values(array_filter(array_map(static function ($u) { return byline_editorial_rest_user_person((int) $u->ID); }, get_users($query))));
    return rest_ensure_response(['staff' => $people, 'limit' => $query['number'], 'offset' => $query['offset']]);
}
/** A stable token for task fields, including metadata writes that don't touch post_modified. */
function byline_task_version(int $id): string { return hash('sha256', wp_json_encode(byline_get_task($id))); }
function byline_resources_version(int $id): string { return hash('sha256', wp_json_encode(byline_get_story_resources($id))); }
function byline_collection_version(int $id): string
{
    $p = get_post($id);
    return hash('sha256', wp_json_encode([$p->post_title, $p->post_content, get_post_meta($id, '_byline_collection_brief', true),
        get_post_meta($id, '_byline_collection_type', true), get_post_meta($id, '_byline_collection_status', true),
        get_post_meta($id, '_byline_collection_lead', true), get_post_meta($id, '_byline_collection_start', true), get_post_meta($id, '_byline_collection_end', true)]));
}
function byline_remote_request(string $method, string $route, array $data = []): WP_REST_Response
{
    $request = new WP_REST_Request($method, '/' . BYLINE_REST_NAMESPACE . $route);
    $request->set_header('Content-Type', 'application/json');
    $request->set_body(wp_json_encode($data));
    return rest_do_request($request);
}
/** Create a real draft, then explicitly report every setup operation. Failed setup never loses an idea. */
function byline_remote_create_plan(WP_REST_Request $request)
{
    $input = byline_editorial_rest_body($request);
    if (array_diff(array_keys($input), ['title','preset','planning','brief','tasks','production','collectionId'])) { return new WP_Error('byline_invalid_plan', 'Unknown planning field.', ['status' => 400]); }
    foreach (['tasks' => 20, 'production' => BYLINE_MEDIA_ASSIGNMENTS_MAX] as $key => $limit) {
        if (isset($input[$key]) && (!is_array($input[$key]) || count($input[$key]) > $limit)) { return new WP_Error('byline_invalid_plan', 'The starter work exceeds its limit.', ['status' => 400]); }
    }
    $created = byline_remote_request('POST', '/editorial/stories', array_intersect_key($input, array_flip(['title','preset'])));
    if ($created->is_error()) { return $created; }
    $created_data = $created->get_data();
    $id = (int) $created_data['story']['id']; $results = [];
    if (!empty($input['preset'])) { $ok = empty($created_data['template']['errors']); $results[] = ['operation'=>'preset','ok'=>$ok,'status'=>$ok?200:500]; }
    $apply = static function (string $operation, string $route, array $data) use (&$results): void {
        $response = byline_remote_request('POST', $route, $data);
        $results[] = ['operation' => $operation, 'ok' => !$response->is_error(), 'status' => $response->get_status()];
    };
    if (isset($input['planning']) && is_array($input['planning'])) { $apply('planning', '/editorial/stories/' . $id, $input['planning']); }
    if (array_key_exists('brief', $input)) { $apply('brief', '/editorial/stories/' . $id . '/brief', ['brief' => $input['brief']]); }
    foreach ($input['tasks'] ?? [] as $index => $task) { $apply('task:' . $index, '/editorial/stories/' . $id . '/tasks', (array) $task); }
    foreach ($input['production'] ?? [] as $index => $assignment) { $apply('production:' . $index, '/editorial/stories/' . $id . '/media-assignments', (array) $assignment); }
    if (!empty($input['collectionId'])) { $apply('collection', '/editorial/collections/' . absint($input['collectionId']) . '/links/story/' . $id, []); }
    $payload = byline_workspace_payload($id, byline_story_context($id));
    $payload['setup'] = $results; $payload['workspaceUrl'] = byline_story_workspace_url($id);
    return new WP_REST_Response($payload, 201);
}
function byline_remote_system(): array
{
    $out = ['version' => BYLINE_PLUGIN_VERSION, 'timezone' => byline_editorial_planning_timezone()->getName()];
    if (byline_can_manage_deployment()) {
        $status = byline_deployment_status();
        // Do not forward arbitrary diagnostic messages, URLs, integration configuration or job payloads.
        $out['deployment'] = array_intersect_key($status, array_flip(['configured','state','status','lastTriggeredAt','lastSuccessAt','lastSuccessfulAt','expectedRevision','liveRevision','jobStatus','publicRevision','pending']));
    }
    return $out;
}
add_action('rest_api_init', static function (): void {
    $permission = static function (): bool { return current_user_can('edit_posts'); };
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/terms/(?P<taxonomy>category|post_tag)', ['methods'=>'GET', 'permission_callback'=>$permission, 'callback'=>static function (WP_REST_Request $request) {
        $terms = get_terms(['taxonomy'=>(string) $request['taxonomy'], 'hide_empty'=>false, 'number'=>min(100,max(1,absint($request->get_param('limit') ?? 50))), 'offset'=>min(10000,absint($request->get_param('offset') ?? 0)), 'search'=>byline_task_text($request->get_param('query') ?? '',100)]);
        if (is_wp_error($terms)) { return $terms; }
        return rest_ensure_response(['terms'=>array_map(static function ($term) { return ['id'=>(int)$term->term_id,'name'=>$term->name,'slug'=>$term->slug]; },$terms)]);
    }]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/access', ['methods'=>'GET','callback'=>static function () { return rest_ensure_response(byline_remote_access()); },'permission_callback'=>$permission]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/staff', ['methods'=>'GET','callback'=>'byline_remote_staff','permission_callback'=>$permission]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/staff/(?P<id>\d+)', ['methods'=>'GET','callback'=>'byline_remote_staff','permission_callback'=>$permission]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/system', ['methods'=>'GET','callback'=>static function () { return rest_ensure_response(byline_remote_system()); },'permission_callback'=>$permission]);
    register_rest_route(BYLINE_REST_NAMESPACE, '/editorial/story-plans', ['methods'=>'POST','callback'=>'byline_remote_create_plan','permission_callback'=>'byline_home_create_permission']);
});
/** Dispatch extension: runs AFTER the route's ordinary permission callback. */
function byline_remote_dispatch($override, WP_REST_Request $request, string $route, array $handler)
{
    if ($override !== null || strpos($route, '/' . BYLINE_REST_NAMESPACE . '/') !== 0 || in_array($request->get_method(), ['GET','HEAD','OPTIONS'], true)) { return $override; }
    $tool = (string) $request->get_header('X-Byline-MCP-Tool');
    $key = (string) $request->get_header('Idempotency-Key');
    $expected = (string) $request->get_header('If-Match');
    $lock = ''; $receipt = ''; $claimed = false;
    $actual = $request->get_route();
    // Conditional writes are optional for existing UI clients, required by MCP tool schemas.
    $version = null;
    if (preg_match('~/editorial/tasks/(\d+)$~', $actual, $m)) { $version = byline_task_version((int) $m[1]); $lock = 'task:' . $m[1]; }
    elseif (preg_match('~/editorial/collections/(\d+)$~', $actual, $m)) { if (!byline_collection_can_edit((int)$m[1])) { return byline_collection_error('You cannot edit this Collection.',403); } $version = byline_collection_version((int) $m[1]); $lock = 'collection:' . $m[1]; }
    elseif (preg_match('~/editorial/stories/(\d+)/resources(?:/[a-z0-9-]+)?$~', $actual, $m)) { if (!byline_story_resources_can_manage((int)$m[1])) { return new WP_Error('byline_resource_forbidden','You cannot change these links.',['status'=>403]); } $version = byline_resources_version((int) $m[1]); $lock = 'resources:' . $m[1]; }
    elseif (preg_match('~/editorial/articles/(\d+)/~', $actual, $m)) { $lock = 'article:' . $m[1]; }
    $fingerprint = hash('sha256', $request->get_method() . $actual . $request->get_body());
    if ($key !== '') {
        if (!preg_match('/^[a-zA-Z0-9_-]{16,128}$/', $key)) { return new WP_Error('byline_idempotency_invalid', 'Use an opaque idempotency key of 16 to 128 characters.', ['status'=>400]); }
        $receipt = '_byline_receipt_' . hash('sha256', get_current_user_id() . ':' . $key);
        $previous = get_option($receipt);
        if ($previous) {
            if (($previous['fingerprint'] ?? '') !== $fingerprint || empty($previous['readRoute'])) { return new WP_Error('byline_idempotency_conflict', 'This request key is already used or its outcome is uncertain. Inspect the original work.', ['status'=>409]); }
            // Re-read through current object permissions. Receipts never cache private payloads.
            $replay_request = new WP_REST_Request('GET', $previous['readRoute']);
            $replay_request->set_query_params(['bounded'=>'1']);
            $replay = rest_do_request($replay_request);
            if ($replay->is_error()) { return $replay; }
            $data = $replay->get_data();
            foreach ($previous['ids'] ?? [] as $field => $value) {
                $list = ['sourceId'=>'sources','appointmentId'=>'appointments','assignmentId'=>'mediaAssignments'][$field] ?? '';
                if ($list && !in_array($value,array_column($data[$list] ?? [],'id'),true)) { return new WP_Error('byline_replay_forbidden','This record is unavailable.',['status'=>403]); }
                $data[$field] = $value;
            }
            if (isset($previous['setup'])) { $data['setup'] = $previous['setup']; }
            $data['replayed'] = true; $replay->set_data($data); return $replay;
        }
        $claimed = add_option($receipt, ['fingerprint'=>$fingerprint, 'createdAt'=>time()], '', false);
        if (!$claimed) { return new WP_Error('byline_idempotency_pending', 'The original request is still being processed.', ['status'=>409]); }
    }
    if (preg_match('~/editorial/presets/([a-z0-9-]+)(?:/reset)?$~', $actual)) {
        $lock = 'presets';
        $body = byline_editorial_rest_body($request);
        if (isset($body['expectedRevision']) && (int)$body['expectedRevision'] !== byline_editorial_presets_revision()) { return new WP_Error('byline_preset_conflict','The templates changed. Read them again.',['status'=>409]); }
    }
    if (preg_match('~/editorial/stories/(\d+)$~', $actual, $m)) { $lock = 'planning:' . $m[1]; }
    if (preg_match('~/editorial/collections/(\d+)/interviews/(\d+)$~', $actual, $m)) { $lock = 'interview:' . $m[2]; }
    if ($expected !== '' && ($version === null || !hash_equals($version, trim($expected, '"')))) { if ($claimed) { delete_option($receipt); } return new WP_Error('byline_remote_conflict', 'The object changed. Read it again.', ['status'=>409,'current'=>['version'=>$version]]); }
    $lock_key = $lock !== '' ? '_byline_remote_lock_' . hash('sha256', $lock) : '';
    if ($lock_key && !add_option($lock_key, time(), '', false)) {
        if ($claimed) { delete_option($receipt); }
        return new WP_Error('byline_remote_busy', 'Another remote write is in progress. Read the object again.', ['status'=>409]);
    }
    $prior = $GLOBALS['byline_remote_activity_context'] ?? null;
    if (preg_match('/^[a-z][a-z0-9_.]{1,79}$/', $tool)) {
        $request_id = (string) $request->get_header('X-Byline-Request-Id');
        $GLOBALS['byline_remote_activity_context'] = ['source'=>'mcp','mcpTool'=>$tool,'requestId'=>preg_match('/^[a-zA-Z0-9-]{1,80}$/', $request_id) ? $request_id : ''];
    }
    try {
        if ($lock === 'presets' && isset($body['expectedRevision']) && (int)$body['expectedRevision'] !== byline_editorial_presets_revision()) { return new WP_Error('byline_preset_conflict','The templates changed. Read them again.',['status'=>409]); }
        // Recheck after acquiring the lock; two remote writes cannot both pass the same token.
        if ($expected !== '' && $version !== null) {
            if (strpos($lock, 'task:') === 0) { $now = byline_task_version((int) substr($lock, 5)); }
            elseif (strpos($lock, 'collection:') === 0) { $now = byline_collection_version((int) substr($lock, 11)); }
            else { $now = byline_resources_version((int) substr($lock, 10)); }
            if (!hash_equals($now, trim($expected, '"'))) { if ($claimed) { delete_option($receipt); } return new WP_Error('byline_remote_conflict', 'The object changed. Read it again.', ['status'=>409,'current'=>['version'=>$now]]); }
        }
        $result = rest_ensure_response(call_user_func($handler['callback'], $request));
        if ($claimed && !is_wp_error($result) && $result->get_status() < 400) {
            $data = $result->get_data(); $read_route = ''; $ids = [];
            if (preg_match('~/editorial/(?:stories|story-plans)$~', $actual)) { $read_route = '/byline/v1/editorial/stories/' . absint($data['story']['id'] ?? 0) . '/workspace'; }
            elseif (preg_match('~/editorial/tasks$~', $actual)) { $read_route = '/byline/v1/editorial/tasks/' . absint($data['id'] ?? 0); }
            elseif (preg_match('~/editorial/collections$~', $actual)) { $read_route = '/byline/v1/editorial/collections/' . absint($data['id'] ?? 0); }
            elseif (preg_match('~/editorial/collections/(\d+)/interviews$~', $actual, $m)) { $read_route = '/byline/v1/editorial/collections/' . $m[1] . '/interviews/' . absint($data['id'] ?? 0); }
            elseif (preg_match('~/editorial/stories/(\d+)/(sources|appointments|media-assignments|resources|tasks)$~', $actual, $m)) {
                $read_route = '/byline/v1/editorial/stories/' . $m[1] . '/workspace';
                $ids = array_intersect_key($data, array_flip(['sourceId','appointmentId','assignmentId']));
            }
            // An unknown create remains pending; it is never executed twice automatically.
            if ($read_route) { update_option($receipt, ['fingerprint'=>$fingerprint,'createdAt'=>time(),'readRoute'=>$read_route,'ids'=>$ids,'setup'=>$data['setup'] ?? null], false); wp_schedule_single_event(time()+30*DAY_IN_SECONDS, 'byline_remote_expire_receipt', [$receipt]); }
        } elseif ($claimed && (is_wp_error($result) || $result->get_status() >= 400)) {
            // Keep uncertain outcomes fenced: a callback can fail after creating a record.
        }
        return $result;
    } finally {
        $GLOBALS['byline_remote_activity_context'] = $prior;
        if ($lock_key) { delete_option($lock_key); }
    }
}
add_filter('rest_dispatch_request', 'byline_remote_dispatch', 10, 4);
add_action('byline_remote_expire_receipt', static function (string $key): void { if (strpos($key, '_byline_receipt_') === 0) { delete_option($key); } });
