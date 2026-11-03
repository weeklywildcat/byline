<?php
namespace Byline\Mcp;

use BylineMcpVendor\Mcp\Schema\Result\CallToolResult;
use BylineMcpVendor\Mcp\Schema\Content\TextContent;

final class ToolError extends \RuntimeException
{
    public function __construct(public string $errorCode, public ?array $current = null) { parent::__construct($errorCode); }
    public function safe(string $id): array
    {
        $messages=['unauthenticated'=>'Reconnect Byline to continue.','forbidden'=>'Your WordPress account cannot perform this operation.',
            'not_found'=>'The requested object is unavailable.','validation_error'=>'Check the supplied fields.',
            'conflict'=>'This object changed. Read its current state before trying again.','rate_limited'=>'Too many requests. Try again shortly.',
            'unsupported'=>'This operation is unavailable on this Byline installation.','internal_error'=>'The operation could not be completed.',
            'upstream_unavailable'=>'WordPress is temporarily unavailable.'];
        $error=['code'=>$this->errorCode,'message'=>$messages[$this->errorCode]??$messages['internal_error'],'retryable'=>in_array($this->errorCode,['conflict','rate_limited','upstream_unavailable'],true),'requestId'=>$id];
        if ($this->current!==null) {
            $safe=[];
            foreach ($this->current as $key=>$value) {
                if (($key==='version' && is_string($value) && preg_match('/^[a-f0-9]{64}$/',$value)) || ($key==='revision' && is_int($value) && $value>=0) || ($key==='updatedAt' && is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/',$value))) { $safe[$key]=$value; }
            }
            if ($safe) { $error['current']=$safe; }
        }
        return $error;
    }
}
function catalog(): array
{
    static $catalog;
    return $catalog ??= json_decode(file_get_contents(__DIR__.'/catalog.json'),true,512,JSON_THROW_ON_ERROR);
}
/** Match Zod's output allow-list projection before validating the result. */
function project($value, array $schema)
{
    if (isset($schema['anyOf']) || isset($schema['oneOf'])) {
        foreach ($schema['anyOf']??$schema['oneOf'] as $branch) {
            $candidate=project($value,$branch);
            if (valid($candidate,$branch)) { return $candidate; }
        }
        return $value;
    }
    if (($schema['type']??'')==='object' && (is_array($value)||is_object($value))) {
        $out=new \stdClass(); $values=(array)$value;
        foreach ($schema['properties']??[] as $key=>$child) { if (array_key_exists($key,$values)) { $out->$key=project($values[$key],$child); } }
        if (is_array($schema['additionalProperties']??null)) {
            foreach ($values as $key=>$child) { if (!isset($schema['properties'][$key])) { $out->$key=project($child,$schema['additionalProperties']); } }
        }
        return $out;
    }
    if (($schema['type']??'')==='array' && is_array($value)) { return array_map(fn($item)=>project($item,$schema['items']??[]),$value); }
    return $value;
}
function valid($data,array $schema): bool
{
    static $validator;
    $validator ??= new \BylineMcpVendor\Opis\JsonSchema\Validator();
    $normalized=new \BylineMcpVendor\Mcp\Schema\Tool('validate',null,['type'=>'object'],null,null,outputSchema:$schema);
    return $validator->validate(schemaObjects($data,$schema),json_decode(wp_json_encode($normalized->outputSchema)))->isValid();
}
/** PHP decodes named tool arguments as arrays; preserve their JSON object shape. */
function schemaObjects($data,array $schema)
{
    if (isset($schema['anyOf']) || isset($schema['oneOf'])) {
        foreach ($schema['anyOf']??$schema['oneOf'] as $branch) {
            $candidate=schemaObjects($data,$branch);
            if (valid($candidate,$branch)) { return $candidate; }
        }
        return $data;
    }
    if (($schema['type']??'')==='object' && (is_array($data)||is_object($data))) {
        $out=new \stdClass();
        foreach ((array)$data as $key=>$value) { $out->$key=schemaObjects($value,$schema['properties'][$key]??(is_array($schema['additionalProperties']??null)?$schema['additionalProperties']:[])); }
        return $out;
    }
    if (($schema['type']??'')==='array' && is_array($data)) { return array_map(fn($v)=>schemaObjects($v,$schema['items']??[]),$data); }
    return $data;
}
function defaults(array $v,array $schema): array
{
    foreach ($schema['properties']??[] as $key=>$child) { if (!array_key_exists($key,$v) && array_key_exists('default',$child)) { $v[$key]=$child['default']; } }
    return $v;
}
function compatibilityText(string $title,$data): string
{
    $data=(array)$data;
    if (isset($data['blockMarkup'])) { return $title.': '.($data['title']??$data['id']??'')."\nVersion: ".($data['version']??'')."\n".$data['blockMarkup']; }
    $summary=array_intersect_key($data,array_flip(['id','title','name','version','revision','resourcesVersion','timezone','hasMore','hasMoreWork','hasMoreStories','hasMoreInterviews','errors','setup','revoked']));
    foreach (['story','collection','user'] as $key) { if (isset($data[$key])) { $summary[$key]=array_intersect_key((array)$data[$key],array_flip(['id','title','name','workflow','deadline','plannedPublication','version','storyCount'])); } }
    foreach ($data as $key=>$values) {
        if (is_array($values)) {
            $summary[$key.'Count']=count($values);
            $summary[$key]=array_map(static fn($item)=>(is_array($item)||is_object($item))?array_intersect_key((array)$item,array_flip(['id','title','label','name','status','state','updatedAt','version'])):$item,array_slice($values,0,5));
        }
    }
    return $title.': '.substr(wp_json_encode($summary?:$data),0,3000).'. Full records are in structuredContent.';
}
final class Tools implements \BylineMcpVendor\Mcp\Server\Handler\ToolHandlerInterface
{
    public function __construct(private array $tool, private string $requestId, private string $grant) {}
    public function execute(array $arguments, \BylineMcpVendor\Mcp\Server\ClientGateway $gateway): mixed { return $this->call($arguments); }
    public function call(array $arguments): CallToolResult
    {
        $start=microtime(true); $status='ok'; $name=$this->tool['name'];
        try {
            if (!current_user_can('edit_posts') || (!empty($this->tool['capability']) && empty(byline_remote_access()['capabilities'][$this->tool['capability']]))) { throw new ToolError('forbidden'); }
            if (!valid((object)$arguments,$this->tool['inputSchema'])) { throw new ToolError('validation_error'); }
            if ((strpos($name,'search')!==false || $name==='newsroom.summary') && !Store::rate('search:'.$this->grant,30)) { throw new ToolError('rate_limited'); }
            $v=defaults($arguments,$this->tool['inputSchema']);
            if ($name==='newsroom.schedule' && ($v['to']<$v['from'] || strtotime($v['to'])-strtotime($v['from'])>124*DAY_IN_SECONDS)) { throw new ToolError('validation_error'); }
            $data=project($this->run($name,$v),$this->tool['dataSchema']);
            if (!valid($data,$this->tool['dataSchema'])) { throw new ToolError('upstream_unavailable'); }
            $result=['ok'=>true,'data'=>$data,'requestId'=>$this->requestId];
            return new CallToolResult([new TextContent(compatibilityText($this->tool['title'],$data))],false,(object)$result);
        } catch (\Throwable $e) {
            $safe=($e instanceof ToolError ? $e : new ToolError('internal_error'))->safe($this->requestId); $status=$safe['code'];
            return new CallToolResult([new TextContent($safe['message'])],true,(object)['ok'=>false,'error'=>$safe,'requestId'=>$this->requestId]);
        } finally {
            // Opt-in structured telemetry contains no request values or newsroom text.
            do_action('byline_mcp_tool_event',['requestId'=>$this->requestId,'tool'=>$name,'actorId'=>get_current_user_id(),'latencyMs'=>(int)((microtime(true)-$start)*1000),'status'=>$status]);
        }
    }
    public function request(string $path,string $method='GET',?array $body=null,array $options=[]): array
    {
        if (!preg_match('~^/byline/v1/[a-zA-Z0-9_/?=&%.:-]+$~',$path) || str_contains($path,'..')) { throw new ToolError('internal_error'); }
        $parts=explode('?',$path,2); $request=new \WP_REST_Request($method,$parts[0]);
        if (isset($parts[1])) { parse_str($parts[1],$query); $request->set_query_params($query); }
        if ($body!==null) { $request->set_header('Content-Type','application/json'); $request->set_body(wp_json_encode((object)$body)); }
        $request->set_header('X-Byline-MCP-Tool',$this->tool['name']); $request->set_header('X-Byline-Request-Id',$this->requestId);
        foreach (['idempotencyKey'=>'Idempotency-Key','expectedVersion'=>'If-Match'] as $field=>$header) { if (isset($options[$field])) { $request->set_header($header,$options[$field]); } }
        // rest_do_request reuses this exact OAuth user and executes ordinary route permissions.
        $response=rest_do_request($request); $data=$response->get_data();
        if ($response->get_status()>=400) {
            $codes=[400=>'validation_error',401=>'unauthenticated',403=>'forbidden',404=>'not_found',409=>'conflict',412=>'conflict',429=>'rate_limited',501=>'unsupported'];
            throw new ToolError($codes[$response->get_status()]??'upstream_unavailable',is_array($data['data']['current']??null)?$data['data']['current']:null);
        }
        if (strlen(wp_json_encode($data))>4*1024*1024) { throw new ToolError('upstream_unavailable'); }
        return (array)$data;
    }
    private function get(string $path,array $v=[]): array { return $this->request('/byline/v1'.$path.($v?'?'.http_build_query($v,'','&',PHP_QUERY_RFC3986):'')); }
    private function workspace(int $id): array { return $this->get('/editorial/stories/'.$id.'/workspace'); }
    private function write(string $path,?array $body=null,array $options=[],string $method='POST'): array { return $this->request('/byline/v1'.$path,$method,$body,$options); }
    private function run(string $name,array $v): array
    {
        $story='/editorial/stories/'.($v['storyId']??0); $collection='/editorial/collections/'.($v['collectionId']??0);
        $options=array_intersect_key($v,array_flip(['idempotencyKey','expectedVersion']));
        $body=array_diff_key($v,array_flip(['storyId','collectionId','taskId','sourceId','appointmentId','assignmentId','resourceId','interviewId','presetId','feedbackId','idempotencyKey','expectedVersion']));
        switch ($name) {
            case 'byline.capabilities': return byline_remote_access();
            case 'byline.disconnect': Store::revoke($this->grant); return ['revoked'=>true];
            case 'newsroom.today': return $this->get('/editorial/home');
            case 'newsroom.schedule': $v['includeTasks']=$v['includeTasks']?1:0; return $this->get('/editorial/schedule',$v);
            case 'newsroom.search': case 'stories.search': return $this->get('/editorial/planning',$v);
            case 'newsroom.summary': return $this->summary($v);
            case 'staff.list': return $this->get('/editorial/staff',$v);
            case 'staff.get':
                $identity=$this->get('/editorial/staff/'.$v['staffId']); $limit=$v['limit']; $tasks=$this->get('/editorial/tasks',['assigneeId'=>$v['staffId'],'limit'=>$limit]);
                return ['staff'=>$identity['staff'],'writing'=>$this->get('/editorial/planning',['writer'=>$v['staffId'],'limit'=>$limit]),'editing'=>$this->get('/editorial/planning',['editor'=>$v['staffId'],'limit'=>$limit]),'tasks'=>$tasks['tasks']];
            case 'story.get': case 'sources.list': case 'appointments.list': case 'production.list': case 'resources.list': return $this->workspace($v['storyId']);
            case 'story.create': $body=$v; unset($body['idempotencyKey']); return $this->write('/editorial/story-plans',$body,$options);
            case 'story.update_planning': $this->write($story,$v['changes']+['expectedRevision'=>$v['expectedRevision']]); return $this->workspace($v['storyId']);
            case 'story.set_brief': return $this->write($story.'/brief',$body);
            case 'tasks.list': return $this->get('/editorial/tasks',$v);
            case 'task.get': return $this->get('/editorial/tasks/'.$v['taskId']);
            case 'task.create': $body=$v; unset($body['idempotencyKey']); return $this->write('/editorial/tasks',$body,$options);
            case 'task.update': return $this->write('/editorial/tasks/'.$v['taskId'],$v['changes'],$options);
            case 'task.complete': case 'task.reopen': return $this->write('/editorial/tasks/'.$v['taskId'],['state'=>$name==='task.complete'?'completed':'open'],$options);
            case 'task.delete': return $this->write('/editorial/tasks/'.$v['taskId'],null,$options,'DELETE');
            case 'collections.list': $v['bounded']=1; if (isset($v['query'])) { $v['search']=$v['query']; unset($v['query']); } return $this->get('/editorial/collections',$v);
            case 'collection.get': case 'interviews.list': return $this->get($collection,['bounded'=>1]);
            case 'collection.create': $out=$this->write('/editorial/collections',$body,$options); return $out['collection']??$out;
            case 'collection.update': return $this->write($collection,$v['changes'],$options);
            case 'collection.add_stories': case 'collection.remove_stories': return $this->bulk($name,$v);
            case 'interview.create': return $this->write($collection.'/interviews',$body,$options);
            case 'interview.update': return $this->write($collection.'/interviews/'.$v['interviewId'],$v['changes']+['expectedUpdatedAt'=>$v['expectedUpdatedAt']]);
            case 'interview.link': return $this->write($collection.'/interviews/'.$v['interviewId'].'/links/'.$v['kind'].'/'.$v['targetId'],null,[],$v['linked']?'POST':'DELETE');
            case 'presets.list': return $this->get('/editorial/presets');
            case 'preset.get': return $this->get('/editorial/presets/'.$v['presetId']);
            case 'preset.update': return $this->write('/editorial/presets/'.$v['presetId'],$body);
            case 'preset.reset': return $this->write('/editorial/presets/'.$v['presetId'].'/reset',$body);
            case 'article.get': return $this->get('/editorial/articles/'.$v['storyId'],['includeBody'=>$v['includeBody']?'true':'false']);
            case 'sections.list': return $this->get('/editorial/terms/category',$v);
            case 'tags.search': return $this->get('/editorial/terms/post_tag',$v);
            case 'notes.list': return $this->get($story.'/notes',['limit'=>$v['limit']]);
            case 'activity.story': return $this->get($story.'/activity',['limit'=>$v['limit']]);
            case 'feedback.list': return $this->get('/admin/feedback',$v);
            case 'feedback.get': return $this->get('/admin/feedback/'.$v['feedbackId']);
            case 'feedback.set_status': return $this->write('/admin/feedback/'.$v['feedbackId'],$body);
            case 'content_health.list': $v['postId']=$v['storyId']??null; unset($v['storyId']); return $this->get('/admin/content-health',$v);
            case 'content_health.recheck': return $this->write('/admin/content-health/'.$v['storyId'].'/recheck',[]);
            case 'system.status': return $this->get('/editorial/system');
            case 'deployment.trigger': return $this->write('/admin/deployment/trigger',[]);
            case 'stories.move_many': return $this->bulk($name,$v);
            case 'polls.list': return $this->get('/editorial/polls',$v);
            case 'poll.get': case 'poll.results': return $this->get('/editorial/polls/'.$v['pollId'],$name==='poll.results'?['results'=>'true']:[]);
        }
        if (str_starts_with($name,'article.') || $name==='story.set_title') {
            $action=['article.update_draft'=>'draft','story.set_title'=>'title','article.set_excerpt'=>'excerpt','article.set_terms'=>'terms','article.set_featured_media'=>'featured-media'][$name]??substr($name,8);
            $body['expectedVersion']=$v['expectedVersion'];
            return $this->write('/editorial/articles/'.$v['storyId'].'/'.$action,$body);
        }
        if (preg_match('/^(source|appointment|production)\.(create|update|delete|schedule|set_status|attach_media|remove_media)$/',$name,$m)) {
            $domain=['source'=>'sources','appointment'=>'appointments','production'=>'media-assignments'][$m[1]];
            $id=$v[['source'=>'sourceId','appointment'=>'appointmentId','production'=>'assignmentId'][$m[1]]]??null;
            if ($m[2]==='update') { $body=$v['changes']+['expectedUpdatedAt'=>$v['expectedUpdatedAt']]; }
            if ($m[2]==='schedule') { $body['scheduleMode']='exact'; }
            if (in_array($m[2],['attach_media','remove_media'],true)) {
                $records=$this->workspace($v['storyId'])['mediaAssignments']; $record=null;
                foreach ($records as $item) { if ($item['id']===$id) { $record=$item; break; } }
                if (!$record) { throw new ToolError('not_found'); }
                if ($record['updatedAt']!==$v['expectedUpdatedAt']) { throw new ToolError('conflict'); }
                $ids=$m[2]==='attach_media'?array_unique(array_merge($record['attachmentIds'],$v['mediaIds'])):array_diff($record['attachmentIds'],$v['mediaIds']);
                $body=['attachmentIds'=>array_values($ids),'expectedUpdatedAt'=>$v['expectedUpdatedAt']];
            }
            return $this->write($story.'/'.$domain.($id!==null?'/'.$id:''),$body,$options,$m[2]==='delete'?'DELETE':'POST');
        }
        if (str_starts_with($name,'resource.')) {
            $this->write($story.'/resources'.(isset($v['resourceId'])?'/'.$v['resourceId']:''),$name==='resource.remove'?null:$body,$options,$name==='resource.remove'?'DELETE':'POST');
            return $this->workspace($v['storyId']);
        }
        throw new ToolError('unsupported');
    }
    private function summary(array $v): array
    {
        $rows=$this->get('/editorial/planning',$v); $today=(new \DateTimeImmutable('now',new \DateTimeZone($rows['timezone'])))->format('Y-m-d');
        $out=['timezone'=>$rows['timezone'],'sampleSize'=>count($rows['stories']),'hasMore'=>$rows['hasMore'],'byWorkflow'=>new \stdClass(),'overdueStoryIds'=>[],'needsReviewIds'=>[],'unassignedStoryIds'=>[],'needsSchedulingIds'=>[],'productionBlockerIds'=>[]];
        foreach ($rows['stories'] as $r) {
            $w=$r['workflow']['id']; $out['byWorkflow']->$w=($out['byWorkflow']->$w??0)+1;
            if (!empty($r['deadline']) && $r['deadline']<$today && !in_array($r['wordpressState']['id']??'',['publish','trash'],true)) { $out['overdueStoryIds'][]=$r['id']; }
            if (!empty($r['needsReview'])) { $out['needsReviewIds'][]=$r['id']; }
            if (empty($r['authors'])) { $out['unassignedStoryIds'][]=$r['id']; }
            if (($r['reporting']['needsScheduling']??0)>0) { $out['needsSchedulingIds'][]=$r['id']; }
            if (($r['mediaSummary']['open']??0)>0) { $out['productionBlockerIds'][]=$r['id']; }
        }
        return $out;
    }
    private function bulk(string $name,array $v): array
    {
        $results=[]; $succeeded=0; $items=$name==='stories.move_many'?$v['items']:array_map(fn($id)=>['id'=>$id],$v['storyIds']);
        foreach ($items as $item) {
            try {
                if ($name==='stories.move_many') {
                    if ($v['dryRun']) { $w=$this->workspace($item['id']); if (empty($w['capabilities']['changeStatus'])) { throw new ToolError('forbidden'); } if ($w['revision']!==$item['expectedRevision']) { throw new ToolError('conflict'); } }
                    else { $this->write('/editorial/stories/'.$item['id'],['status'=>$item['workflow'],'expectedRevision'=>$item['expectedRevision']]); }
                } else {
                    $path='/editorial/collections/'.$v['collectionId'];
                    if ($v['dryRun']) { $c=$this->get($path,['bounded'=>1]); $w=$this->workspace($item['id']); if (empty($c['collection']['canEdit']) || ($w['capabilities']['role']??'')!=='manager') { throw new ToolError('forbidden'); } }
                    else { $this->write($path.'/links/story/'.$item['id'],null,[],$name==='collection.add_stories'?'POST':'DELETE'); }
                }
                $results[]=['id'=>$item['id'],'ok'=>true]; $succeeded++;
            } catch (\Throwable $e) { $results[]=['id'=>$item['id'],'ok'=>false,'error'=>($e instanceof ToolError?$e:new ToolError('internal_error'))->safe($this->requestId)]; }
        }
        return ['dryRun'=>$v['dryRun'],'results'=>$results,'succeeded'=>$succeeded,'failed'=>count($results)-$succeeded];
    }
}
