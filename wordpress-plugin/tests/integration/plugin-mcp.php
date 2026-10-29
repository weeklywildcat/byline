<?php
/** Execute only against disposable wp-env. Exercises the packaged PHP runtime. */
if (!defined('ABSPATH') || wp_get_environment_type()!=='local') { throw new RuntimeException('Disposable local WordPress required.'); }
require_once ABSPATH.'wp-admin/includes/user.php';
if (!byline_mcp_load()) { throw new RuntimeException('Bundled MCP runtime missing.'); }
use Byline\Mcp\Store;
use Byline\Mcp\Tools;
use BylineMcpVendor\Nyholm\Psr7\ServerRequest;
$checks=0; $posts=[]; $users=[]; $previous=get_current_user_id();
$assert=static function($ok,string $label) use (&$checks): void { if (!$ok) { throw new RuntimeException($label); } $checks++; };
$dispatch=static function(string $path,string $method='GET',array $body=[],array $query=[],array $headers=[]) {
    $request=new ServerRequest($method,home_url($path),$headers,wp_json_encode($body));
    return Byline\Mcp\dispatch($request->withQueryParams($query)->withParsedBody($body));
};
try {
    Store::install();
    $editor=wp_insert_user(['user_login'=>'mcp-editor-'.wp_generate_uuid4(),'user_pass'=>'local-disposable-password','role'=>'editor']); $users[]=$editor;
    $writer=wp_insert_user(['user_login'=>'mcp-writer-'.wp_generate_uuid4(),'user_pass'=>'local-disposable-password','role'=>'contributor']); $users[]=$writer;
    $assert(!is_wp_error($editor)&&!is_wp_error($writer),'Test users created');
    wp_set_current_user($editor);
    $grant=wp_generate_uuid4(); Store::put('grant',$grant,['id'=>$grant],time()+3600,$editor,$grant);
    $call=static function(string $name,array $args=[]) use ($grant): array {
        $runner=new Tools(Byline\Mcp\definition($name),'local-test-request',$grant);
        $result=$runner->call($args);
        if ($result->isError && ($result->structuredContent->error['code']??'')==='internal_error') {
            $run=new ReflectionMethod($runner,'run');
            try { $raw=$run->invoke($runner,$name,Byline\Mcp\defaults($args,Byline\Mcp\definition($name)['inputSchema'])); Byline\Mcp\project($raw,Byline\Mcp\definition($name)['dataSchema']); }
            catch(Throwable $e) { throw new RuntimeException($name.' failed in '.basename($e->getFile()).':'.$e->getLine().' ('.get_class($e).')'); }
        }
        return json_decode(wp_json_encode($result->structuredContent),true);
    };
    $assert(count(Byline\Mcp\catalog()['tools'])===82,'All semantic tools packaged');
    $created=$call('story.create',['title'=>'Plugin MCP test','brief'=>'PRIVATE PLUGIN BRIEF','idempotencyKey'=>'local-story-'.wp_generate_uuid4()]);
    $assert($created['ok'],'Story create through PHP adapter: '.($created['error']['code']??''));
    $id=$created['data']['story']['id']; $posts[]=$id;
    $read=$call('story.get',['storyId'=>$id]); $assert($read['ok'] && $read['data']['brief']==='PRIVATE PLUGIN BRIEF','Story workspace projection');
    $updated=$call('story.update_planning',['storyId'=>$id,'expectedRevision'=>$read['data']['revision'],'changes'=>['status'=>'reporting']]);
    $assert($updated['ok'],'Nested planning arguments validated');
    $stale=$call('story.update_planning',['storyId'=>$id,'expectedRevision'=>$read['data']['revision'],'changes'=>['status'=>'writing']]);
    $assert(!$stale['ok'] && $stale['error']['code']==='conflict','Stale revisions rejected');
    $task=$call('task.create',['storyId'=>$id,'title'=>'Local adapter task','idempotencyKey'=>'local-task-'.wp_generate_uuid4()]);
    $assert($task['ok'],'Task created through local REST'); $posts[]=$task['data']['id'];
    $done=$call('task.complete',['taskId'=>$task['data']['id'],'expectedVersion'=>$task['data']['version']]); $assert($done['ok']&&$done['data']['state']==='completed','Task lifecycle');
    $source=$call('source.create',['storyId'=>$id,'label'=>'Interview target','idempotencyKey'=>'local-source-'.wp_generate_uuid4()]); $assert($source['ok'],'Source adapter');
    $appointment=$call('appointment.create',['storyId'=>$id,'title'=>'Interview','idempotencyKey'=>'local-appointment-'.wp_generate_uuid4()]); $assert($appointment['ok'],'Appointment adapter');
    $production=$call('production.create',['storyId'=>$id,'title'=>'Photo','type'=>'photo','idempotencyKey'=>'local-production-'.wp_generate_uuid4()]); $assert($production['ok'],'Production adapter');
    $sourceItem=$source['data']['sources'][0];
    $sourceEdit=$call('source.update',['storyId'=>$id,'sourceId'=>$sourceItem['id'],'expectedUpdatedAt'=>$sourceItem['updatedAt'],'changes'=>['status'=>'contacted']]); $assert($sourceEdit['ok'],'Source update concurrency fields');
    $appointmentItem=$appointment['data']['appointments'][0];
    $scheduled=$call('appointment.schedule',['storyId'=>$id,'appointmentId'=>$appointmentItem['id'],'expectedUpdatedAt'=>$appointmentItem['updatedAt'],'startAt'=>'2026-12-04T15:30:00-05:00']); $assert($scheduled['ok'],'Exact appointment adapter');
    $collection=$call('collection.create',['name'=>'Plugin MCP collection','idempotencyKey'=>'local-collection-'.wp_generate_uuid4()]); $assert($collection['ok'],'Collection create projection'); $collectionId=$collection['data']['id']; $posts[]=$collectionId;
    $membership=$call('collection.add_stories',['collectionId'=>$collectionId,'storyIds'=>[$id],'dryRun'=>true]); $assert($membership['ok']&&$membership['data']['succeeded']===1,'Collection dry run');
    $membership=$call('collection.add_stories',['collectionId'=>$collectionId,'storyIds'=>[$id]]); $assert($membership['ok']&&$membership['data']['succeeded']===1,'Collection membership adapter');
    $interview=$call('interview.create',['collectionId'=>$collectionId,'interviewee'=>'Test interviewee','idempotencyKey'=>'local-interview-'.wp_generate_uuid4()]); $assert($interview['ok'],'Shared interview adapter'); $posts[]=$interview['data']['id'];
    $detail=$call('collection.get',['collectionId'=>$collectionId]); $assert($detail['ok'],'Bounded collection aggregate');
    $links=$call('resources.list',['storyId'=>$id]);
    $link=$call('resource.add',['storyId'=>$id,'label'=>'Working draft','url'=>'https://docs.example.test/draft','purpose'=>'draft','expectedVersion'=>$links['data']['resourcesVersion'],'idempotencyKey'=>'local-link-'.wp_generate_uuid4()]); $assert($link['ok'],'Versioned private link adapter');
    $removed=$call('resource.remove',['storyId'=>$id,'resourceId'=>$link['data']['resources'][0]['id'],'expectedVersion'=>$link['data']['resourcesVersion']]); $assert($removed['ok']&&count($removed['data']['resources'])===0,'Private link removal preserves target document');
    $article=$call('article.get',['storyId'=>$id]); $assert($article['ok']&&!isset($article['data']['blockMarkup']),'Article body excluded by default');
    $title=$call('story.set_title',['storyId'=>$id,'expectedVersion'=>$article['data']['version'],'title'=>'Updated plugin MCP test']); $assert($title['ok'],'Article version forwarded');
    $draft=$call('article.update_draft',['storyId'=>$id,'expectedVersion'=>$title['data']['version'],'blockMarkup'=>'<!-- wp:paragraph --><p>Local draft</p><!-- /wp:paragraph -->','confirm'=>true]); $assert($draft['ok'],'Explicit Gutenberg replacement');
    $sessionId=BylineMcpVendor\Symfony\Component\Uid\Uuid::v4();
    $sessions=new Byline\Mcp\Sessions($grant); $sessions->write($sessionId,wp_json_encode(['initialized'=>true,'private_payload'=>'PRIVATE RECORD DO NOT STORE']));
    $assert(strpos($sessions->read($sessionId),'PRIVATE RECORD')===false,'Compatibility sessions never cache newsroom records');
    foreach (['newsroom.today','newsroom.summary','staff.list','collections.list','presets.list','sections.list','system.status'] as $tool) { $r=$call($tool); $assert($r['ok'],'Read adapter '.$tool.': '.($r['error']['code']??'')); }
    $invalid=$call('task.create',['storyId'=>$id,'collectionId'=>1,'title'=>'Invalid','idempotencyKey'=>'invalid-local-key-1234']); $assert(!$invalid['ok']&&$invalid['error']['code']==='validation_error','Task target XOR');
    $extra=$call('story.get',['storyId'=>$id,'username'=>'admin']); $assert(!$extra['ok'],'Unknown input fields rejected');
    wp_set_current_user($writer); $denied=$call('article.get',['storyId'=>$id]); $assert(!$denied['ok']&&$denied['error']['code']==='forbidden','Real writer permissions retained');
    $assert($dispatch('/mcp')->getStatusCode()===401,'WordPress login cookie alone cannot authenticate MCP');
    $assert($dispatch('/mcp','POST',[],[],['Origin'=>'https://evil.example'])->getStatusCode()===403,'Foreign browser origin rejected');
    $assert($dispatch('/.well-known/oauth-protected-resource/mcp')->getStatusCode()===200,'Resource discovery');
    $bad=$dispatch('/mcp/register','POST',['redirect_uris'=>['https://valid.example/callback#bad']]); $assert($bad->getStatusCode()===400,'Redirect fragments rejected');
    $client=$dispatch('/mcp/register','POST',['redirect_uris'=>['http://127.0.0.1:9922/callback'],'client_name'=>'Local MCP test']);
    $assert($client->getStatusCode()===201,'Public OAuth registration'); $client=json_decode((string)$client->getBody(),true);
    wp_set_current_user($editor);
    $verifier=str_repeat('a',43); $query=['response_type'=>'code','client_id'=>$client['client_id'],'redirect_uri'=>$client['redirect_uris'][0],'state'=>'browser-state','scope'=>'byline','resource'=>byline_mcp_endpoint(),'code_challenge'=>rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'='),'code_challenge_method'=>'S256'];
    $consent=$dispatch('/mcp/authorize','GET',[],$query); $assert($consent->getStatusCode()===200 && strpos((string)$consent->getBody(),'Connect Byline')!==false,'WordPress consent page');
    $badNonce=$dispatch('/mcp/authorize','POST',['decision'=>'approve','_wpnonce'=>'bad'],$query); $assert($badNonce->getStatusCode()===403,'Consent CSRF protection');
    $nonce=wp_create_nonce('byline_mcp_authorize:'.hash('sha256',wp_json_encode($query)));
    $approved=$dispatch('/mcp/authorize','POST',['decision'=>'approve','_wpnonce'=>$nonce],$query); $assert($approved->getStatusCode()===302,'Consent issues authorization code');
    parse_str(wp_parse_url($approved->getHeaderLine('Location'),PHP_URL_QUERY),$returned); $assert($returned['state']==='browser-state','OAuth state preserved');
    $body=['grant_type'=>'authorization_code','client_id'=>$client['client_id'],'redirect_uri'=>$client['redirect_uris'][0],'code'=>$returned['code'],'code_verifier'=>str_repeat('b',43),'resource'=>byline_mcp_endpoint()];
    $wrong=$dispatch('/mcp/token','POST',$body); $assert($wrong->getStatusCode()===400,'Wrong PKCE verifier refused');
    $body['code_verifier']=$verifier; $exchange=$dispatch('/mcp/token','POST',$body); $assert($exchange->getStatusCode()===200,'Code exchange through maintained OAuth library');
    $tokens=json_decode((string)$exchange->getBody(),true); $assert(isset($tokens['access_token'],$tokens['refresh_token']),'Access and refresh issued');
    $assert($dispatch('/mcp/token','POST',$body)->getStatusCode()===400,'Code replay refused');
    $auth=Byline\Mcp\authenticatedRequest((new ServerRequest('POST',byline_mcp_endpoint()))->withHeader('Authorization','Bearer '.$tokens['access_token']));
    $assert((int)$auth->getAttribute('oauth_user_id')===$editor && $auth->getAttribute('oauth_client_id')===$client['client_id'],'Token bound to WordPress actor, resource and client');
    $refresh=['grant_type'=>'refresh_token','client_id'=>$client['client_id'],'refresh_token'=>$tokens['refresh_token'],'resource'=>byline_mcp_endpoint()];
    $rotated=$dispatch('/mcp/token','POST',$refresh); $assert($rotated->getStatusCode()===200,'Refresh rotation');
    $assert($dispatch('/mcp/token','POST',$refresh)->getStatusCode()===400,'Refresh replay refused');
    $new=json_decode((string)$rotated->getBody(),true); $revoked=$dispatch('/mcp/revoke','POST',['token'=>$new['refresh_token'],'token_type_hint'=>'refresh_token','client_id'=>$client['client_id']]); $assert($revoked->getStatusCode()===200,'Connection revoked');
    $after=$dispatch('/mcp','POST',[],[],['Authorization'=>'Bearer '.$new['access_token']]); $assert($after->getStatusCode()===401,'Revocation immediately invalidates access');
    echo 'Plugin-hosted MCP integration: '.$checks." checks passed.\n";
} finally {
    foreach ($posts as $post) { wp_delete_post($post,true); }
    foreach ($users as $user) { if (is_int($user)) { Store::revokeActor($user); wp_delete_user($user); } }
    wp_set_current_user($previous);
}
