<?php
/** Real WordPress permission, concurrency, retry, publication and privacy checks for remote clients. */
if (!defined('ABSPATH')) { exit; }
require_once ABSPATH . 'wp-admin/includes/user.php';
$checks=0;$posts=[];$users=[];$fixtures=[];$old_timezone=get_option('timezone_string');
$assert=static function ($ok,string $message) use (&$checks):void {if(!$ok){throw new RuntimeException($message);} $checks++;};
$call=static function(string $path,string $method='GET',array $body=[],array $headers=[]):WP_REST_Response {
    $pieces=explode('?',$path,2);$r=new WP_REST_Request($method,'/byline/v1'.$pieces[0]);
    if(isset($pieces[1])){parse_str($pieces[1],$q);$r->set_query_params($q);}
    if($body){$r->set_header('Content-Type','application/json');$r->set_body(wp_json_encode($body));}
    foreach($headers as $k=>$v){$r->set_header($k,$v);}return rest_do_request($r);
};
$make=static function(string $role)use(&$users):int{$id=wp_insert_user(['user_login'=>'mcp-'.wp_generate_uuid4(),'user_pass'=>wp_generate_password(),'role'=>$role,'display_name'=>'MCP '.$role]);if(is_wp_error($id))throw new RuntimeException('User creation failed');$users[]=$id;return $id;};
try {
 update_option('timezone_string','America/New_York');
 $editor=$make('editor');$writer=$make('contributor');$participant=$make('author');$stranger=$make('author');
 wp_set_current_user($editor);
 $auth=$call('/editorial/access')->get_data();$assert($auth['user']['id']===$editor && $auth['capabilities']['publish_posts'],'Access uses the current user.');
 $headers=['Idempotency-Key'=>'mcp-test-'.wp_generate_uuid4(),'X-Byline-MCP-Tool'=>'story.create','X-Byline-Request-Id'=>wp_generate_uuid4()];
 $create=['title'=>'MCP integration story','preset'=>'news','planning'=>['status'=>'reporting','editorId'=>$editor,'deadline'=>'2026-11-04'],'brief'=>'PRIVATE MCP BRIEF'];
 $created=$call('/editorial/story-plans','POST',$create,$headers);$data=$created->get_data();
 $assert($created->get_status()===201,'Story plan creation: '.wp_json_encode($data));
 $id=$data['story']['id'];$posts[]=$id;$assert($data['brief']==='PRIVATE MCP BRIEF' && $data['story']['workflow']['id']==='reporting','Canonical plan setup applies.');
 $replay=$call('/editorial/story-plans','POST',$create,$headers);$assert($replay->get_data()['story']['id']===$id && $replay->get_data()['replayed'],'A repeated create returns the original story.');
 $assert($call('/editorial/story-plans','POST',['title'=>'Different intent'],$headers)->get_status()===409,'Key reuse with other input conflicts.');
 $assert($call('/editorial/stories/'.$id,'POST',['status'=>'writing','expectedRevision'=>0])->get_status()===409,'A stale editorial revision conflicts.');
 $task=$call('/editorial/tasks','POST',['storyId'=>$id,'title'=>'Interview attendees','assigneeId'=>$editor]);$t=$task->get_data();$posts[]=$t['id'];$assert($task->get_status()===200 && strlen($t['version'])===64,'Task exposes a complete version.');
 $updated=$call('/editorial/tasks/'.$t['id'],'POST',['state'=>'completed'],['If-Match'=>$t['version'],'X-Byline-MCP-Tool'=>'task.complete']);$assert($updated->get_data()['state']==='completed','Task completes through its canonical domain.');
 $assert($call('/editorial/tasks/'.$t['id'],'POST',['state'=>'open'],['If-Match'=>$t['version']])->get_status()===409,'Task metadata-only updates invalidate stale versions.');
 $source=$call('/editorial/stories/'.$id.'/sources','POST',['label'=>'Known source','assigneeIds'=>[$participant],'notes'=>'PRIVATE SOURCE'])->get_data();$sid=$source['sourceId'];$sv=$source['sources'][0]['updatedAt'];
 $assert($call('/editorial/stories/'.$id.'/sources/'.$sid,'DELETE',['expectedUpdatedAt'=>'2000-01-01T00:00:00Z'])->get_status()===409,'A stale source delete conflicts inside CAS.');
 $appointment=$call('/editorial/stories/'.$id.'/appointments','POST',['title'=>'Source interview','sourceId'=>$sid,'assigneeIds'=>[$participant],'scheduleMode'=>'window','windowStart'=>'2026-11-01','windowEnd'=>'2026-11-07'])->get_data();$aid=$appointment['appointmentId'];
 $appt=array_values(array_filter($appointment['appointments'],static function($a)use($aid){return $a['id']===$aid;}))[0];$assert($appt['startAt']===null,'Windows do not fabricate exact times.');
 $exact=$call('/editorial/stories/'.$id.'/appointments/'.$aid,'POST',['scheduleMode'=>'exact','startAt'=>'2026-11-02T15:30:00-05:00','expectedUpdatedAt'=>$appt['updatedAt']])->get_data();
 $a=array_values(array_filter($exact['appointments'],static function($a)use($aid){return $a['id']===$aid;}))[0];$assert($a['startAt']==='2026-11-02T20:30:00Z' && $a['windowStart']===null,'Exact post-DST time normalizes correctly.');
 $assignment=$call('/editorial/stories/'.$id.'/media-assignments','POST',['title'=>'Photographs','type'=>'photo','assigneeId'=>$participant])->get_data();$assert(count($assignment['mediaAssignments'])===1,'Production is a canonical assignment.');
 $v=$call('/editorial/stories/'.$id.'/workspace')->get_data()['resourcesVersion'];
 $link=$call('/editorial/stories/'.$id.'/resources','POST',['label'=>'Draft','url'=>'https://docs.google.com/document/d/test/edit','purpose'=>'draft'],['If-Match'=>$v,'Idempotency-Key'=>'link-'.wp_generate_uuid4()]);$assert($link->get_status()===200 && $link->get_data()['resources'][0]['kind']==='Google Doc','Private links use canonical recognition.');
 $assert($call('/editorial/stories/'.$id.'/resources','POST',['label'=>'Other','url'=>'https://example.com'],['If-Match'=>$v])->get_status()===409,'Stale resource versions cannot replace newer state.');
 $collection=$call('/editorial/collections','POST',['name'=>'Coverage package'])->get_data();$posts[]=$collection['id'];
 $assert($call('/editorial/collections/'.$collection['id'].'/links/story/'.$id,'POST')->get_status()===200,'Collection relationship succeeds.');
 $detail=$call('/editorial/collections/'.$collection['id'])->get_data();$assert(count($detail['stories'])===1 && count($detail['work'])===1,'Collection returns coordinated authorized work.');
 $assert($call('/editorial/collections/'.$collection['id'],'POST',['name'=>'New name'],['If-Match'=>str_repeat('0',64)])->get_status()===409,'Collection planning respects its version.');
 $article=$call('/editorial/articles/'.$id)->get_data();$assert(!isset($article['blockMarkup']),'Article body is excluded by default.');
 $markup='<!-- wp:paragraph --><p>Block markup survives.</p><!-- /wp:paragraph -->';
 $body=$call('/editorial/articles/'.$id.'/draft','POST',['blockMarkup'=>$markup,'expectedVersion'=>$article['version']]);$assert($body->get_status()===200,'Draft content saves: '.wp_json_encode($body->get_data()));
 $assert(get_post($id)->post_content===$markup,'Gutenberg markup is preserved.');
 $assert($call('/editorial/articles/'.$id.'/draft','POST',['blockMarkup'=>'stale','expectedVersion'=>$article['version']])->get_status()===409,'Stale body replacement is refused.');
 $before=$body->get_data()['version'];
 $schedule=$call('/editorial/articles/'.$id.'/schedule','POST',['publishAt'=>gmdate('Y-m-d\TH:i:s\Z',time()+86400),'expectedVersion'=>$before]);$assert($schedule->get_status()===200 && get_post_status($id)==='future','Explicit article scheduling succeeds.');
 $unscheduled=$call('/editorial/articles/'.$id.'/unschedule','POST',['expectedVersion'=>$schedule->get_data()['version']]);$assert(get_post_status($id)==='draft','Unschedule returns to draft.');
 $published=$call('/editorial/articles/'.$id.'/publish','POST',['expectedVersion'=>$unscheduled->get_data()['version']],['X-Byline-MCP-Tool'=>'article.publish','X-Byline-Request-Id'=>'integration-request']);$assert($published->get_status()===200 && get_post_status($id)==='publish','Explicit publish uses native WordPress publication.');
 $assert(byline_get_effective_editorial_status($id)==='published','Published workflow remains derived.');
 $unpublished=$call('/editorial/articles/'.$id.'/unpublish','POST',['expectedVersion'=>$published->get_data()['version']]);$assert(get_post_status($id)==='draft','Unpublish returns to draft.');
 $assert(byline_get_effective_editorial_status($id)==='reporting','Unpublish restores stored workflow.');
 // Idempotent creates return the same canonical records, including reporting/production.
 foreach ([['/editorial/tasks',['storyId'=>$id,'title'=>'Retry-safe task']],['/editorial/stories/'.$id.'/appointments',['title'=>'Retry-safe interview']],['/editorial/stories/'.$id.'/media-assignments',['title'=>'Retry-safe video','type'=>'video']],['/editorial/collections',['name'=>'Retry-safe collection']]] as $case) {
    $h=['Idempotency-Key'=>'retry-'.wp_generate_uuid4(),'X-Byline-MCP-Tool'=>'test.create'];
    $first=$call($case[0],'POST',$case[1],$h);$second=$call($case[0],'POST',$case[1],$h);
    $assert($first->get_status()<400 && $second->get_status()<400 && !empty($second->get_data()['replayed']),'Create retries re-read the original authorized object.');
    if(isset($first->get_data()['id'])){$posts[]=$first->get_data()['id'];$assert($first->get_data()['id']===($second->get_data()['id']??($second->get_data()['collection']['id']??0)),'A retry preserves the created record ID.');}
 }
 $av=$call('/editorial/articles/'.$id)->get_data()['version'];
 $trashed=$call('/editorial/articles/'.$id.'/trash','POST',['expectedVersion'=>$av]);$assert($trashed->get_status()===200 && get_post_status($id)==='trash','Trash uses the native reversible lifecycle.');
 $restored=$call('/editorial/articles/'.$id.'/restore','POST',['expectedVersion'=>$trashed->get_data()['version']]);$assert($restored->get_status()===200 && get_post_status($id)==='draft','Restore cannot silently republish.');
 // Core Application Password authentication and individual revocation.
 add_filter('wp_is_application_passwords_available','__return_true');
 add_filter('application_password_is_api_request','__return_true');
 $password=WP_Application_Passwords::create_new_application_password($writer,['name'=>'Byline MCP integration test','app_id'=>'cf2276ae-6bbb-4f7e-ae25-1b4929461791']);
 $assert(!is_wp_error($password),'A user-specific Application Password is created.');
 $authenticated=wp_authenticate_application_password(null,get_userdata($writer)->user_login,$password[0]);
 $assert($authenticated instanceof WP_User && $authenticated->ID===$writer,'Core authenticates the actual user, not a service administrator.');
 $assert(WP_Application_Passwords::delete_application_password($writer,$password[1]['uuid']),'The exact Application Password can be revoked.');
 $assert(is_wp_error(wp_authenticate_application_password(null,get_userdata($writer)->user_login,$password[0])),'Revoked credentials no longer authenticate.');
 unset($password);remove_filter('wp_is_application_passwords_available','__return_true');remove_filter('application_password_is_api_request','__return_true');
 wp_set_current_user($writer);
 $writer_post=wp_insert_post(['post_type'=>'post','post_status'=>'draft','post_title'=>'Writer draft','post_author'=>$writer]);$posts[]=$writer_post;
 $partial=$call('/editorial/story-plans','POST',['title'=>'Partial writer plan','planning'=>['editorId'=>$editor]]);$posts[]=$partial->get_data()['story']['id'];$assert($partial->get_status()===201 && !$partial->get_data()['setup'][0]['ok'],'A failed setup step is explicit and preserves the writer draft.');
 $w=$call('/editorial/articles/'.$writer_post)->get_data();$assert($call('/editorial/articles/'.$writer_post.'/publish','POST',['expectedVersion'=>$w['version']])->get_status()===403,'A contributor cannot publish their own draft.');
 $assert($call('/editorial/articles/'.$id)->get_status()===403,'Other writers cannot read the article.');
 wp_set_current_user($participant);$limited=$call('/editorial/stories/'.$id.'/workspace')->get_data();
 $assert($limited['capabilities']['role']==='participant' && count($limited['sources'])===1 && $limited['activity']===[] && $limited['story']['notes']===null,'Assigned participant filtering remains canonical.');
 $assert($call('/editorial/stories/'.$id.'/notes')->get_status()===403,'Participant cannot lazy-load Core Notes.');
 $assert($call('/editorial/stories/'.$id,'POST',['editorId'=>$participant])->get_status()===403,'Participation cannot assign an editor.');
 wp_set_current_user($stranger);$assert($call('/editorial/stories/'.$id.'/workspace')->get_status()===403,'Unrelated users cannot inspect a workspace.');
 wp_set_current_user(0);$assert($call('/editorial/access')->get_status()===401,'Anonymous connections are refused.');
 $public=rest_do_request(new WP_REST_Request('GET','/wp/v2/posts/'.$id))->get_data();$assert(strpos(wp_json_encode($public),'PRIVATE MCP BRIEF')===false && strpos(wp_json_encode($public),'PRIVATE SOURCE')===false,'No private remote context reaches native public data.');
 wp_set_current_user($editor);
 $activity=byline_get_story_activity($id,['limit'=>50]);$mcp=array_values(array_filter($activity,static function($a){return ($a['context']['source']??'')==='mcp';}));$assert(count($mcp)>0 && $mcp[0]['actor']['id']===$editor,'MCP activity retains the actual actor and source.');
 // Persist only sanitized read payloads for SDK adapter contract tests; no credentials.
 $fixtures=['workspace'=>$call('/editorial/stories/'.$id.'/workspace')->get_data(),'home'=>$call('/editorial/home')->get_data(),'planning'=>$call('/editorial/planning')->get_data(),'collection'=>$detail,'schedule'=>$call('/editorial/schedule?from=2026-10-01&to=2026-12-01&includeTasks=1')->get_data(),'notes'=>$call('/editorial/stories/'.$id.'/notes')->get_data(),'presets'=>$call('/editorial/presets')->get_data(),'feedback'=>$call('/admin/feedback')->get_data(),'health'=>$call('/admin/content-health')->get_data(),'activity'=>$call('/editorial/stories/'.$id.'/activity')->get_data()];
 file_put_contents(__DIR__.'/../.mcp-contracts.json',wp_json_encode($fixtures,JSON_PRETTY_PRINT));
 // Bounded MCP reads must not truncate existing UI clients' Collection detail.
 $large=$call('/editorial/collections','POST',['name'=>'Large MCP coverage'])->get_data();$posts[]=$large['id'];
 for($n=0;$n<101;$n++) { $story_id=wp_insert_post(['post_type'=>'post','post_status'=>'draft','post_author'=>$editor,'post_title'=>'Bounded story '.$n]);$posts[]=$story_id;byline_relation_set($large['id'],'story',$story_id,true); }
 $normal=$call('/editorial/collections/'.$large['id'])->get_data();
 $bounded=$call('/editorial/collections/'.$large['id'].'?bounded=1')->get_data();
 $assert(count($normal['stories'])===101 && count($normal['collection']['storyIds'])===101,'Existing UI detail keeps its complete Collection membership.');
 $assert(count($bounded['stories'])===100 && count($bounded['collection']['storyIds'])===100 && $bounded['hasMoreStories'] && $bounded['collection']['storyIdsTruncated'],'MCP gets explicit bounded Collection results and truncation flags.');
 echo "MCP WordPress integration passed ($checks checks).\n";
} finally {
 wp_set_current_user(1);foreach(array_reverse($posts) as $id){wp_delete_post($id,true);}foreach($users as $id){wp_delete_user($id);}update_option('timezone_string',$old_timezone);
}
