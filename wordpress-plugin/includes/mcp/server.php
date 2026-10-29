<?php
namespace Byline\Mcp;

use BylineMcpVendor\Mcp\Server;
use BylineMcpVendor\Mcp\Schema\Tool;
use BylineMcpVendor\Mcp\Schema\Content\TextResourceContents;
use BylineMcpVendor\Mcp\Schema\Result\ReadResourceResult;
use BylineMcpVendor\Mcp\Server\Transport\StreamableHttpTransport;
use BylineMcpVendor\Mcp\Server\Transport\Http\Middleware\CorsMiddleware;
use BylineMcpVendor\Mcp\Server\Transport\Http\Middleware\DnsRebindingProtectionMiddleware;
use BylineMcpVendor\Symfony\Component\Uid\Uuid;

/** Legacy-client handshake metadata only, scoped to the OAuth grant; no newsroom data. */
final class Sessions implements \BylineMcpVendor\Mcp\Server\Session\SessionStoreInterface
{
    public function __construct(private string $grant) {}
    public function exists(Uuid $id): bool { return Store::get('session',$this->grant.':'.$id)!==null; }
    public function read(Uuid $id): string|false { $row=Store::get('session',$this->grant.':'.$id); return $row['data']??false; }
    public function write(Uuid $id,string $data): bool
    {
        // Never persist tool results, token objects or client-supplied request metadata.
        $state=json_decode($data,true,32,JSON_THROW_ON_ERROR);
        $data=wp_json_encode(array_intersect_key($state,array_flip(['initialized','client_info','client_capabilities','protocol_version','log_level'])));
        if (strlen($data)>16384) { return false; }
        $key=$this->grant.':'.$id;
        global $wpdb;
        $table=Store::table(); $payload=wp_json_encode(['data'=>$data]);
        return $wpdb->query($wpdb->prepare("INSERT INTO $table (id,kind,grant_ref,payload,expires) VALUES (%s,'session',%s,%s,%d) ON DUPLICATE KEY UPDATE payload=VALUES(payload),expires=VALUES(expires)",Store::key('session',$key),$this->grant,$payload,time()+3600))!==false;
    }
    public function destroy(Uuid $id): bool { Store::remove('session',$this->grant.':'.$id); return true; }
    public function gc(): array { return []; }
}
function definition(string $name): array
{
    foreach (catalog()['tools'] as $tool) { if ($tool['name']===$name) { return $tool; } }
    throw new ToolError('not_found');
}
function resource(string $uri,string $tool,array $args,string $id,string $grant): ReadResourceResult
{
    $result=(new Tools(definition($tool),$id,$grant))->call($args);
    return new ReadResourceResult([new TextResourceContents($uri,'application/json',wp_json_encode($result->structuredContent))]);
}
function mcp($request,string $grant,string $id)
{
    $access=byline_remote_access();
    $builder=Server::builder()->setServerInfo('byline',BYLINE_PLUGIN_VERSION)->setInstructions(catalog()['instructions'])->setSession(new Sessions($grant));
    foreach (catalog()['tools'] as $tool) {
        if (!empty($tool['capability']) && empty($access['capabilities'][$tool['capability']])) { continue; }
        $builder->add(Tool::fromArray($tool),new Tools($tool,$id,$grant));
    }
    $builder->addResource(fn()=>resource('byline://newsroom/today','newsroom.today',[],$id,$grant),'byline://newsroom/today','today',mimeType:'application/json');
    foreach (['story'=>['story.get','storyId'],'collection'=>['collection.get','collectionId'],'staff'=>['staff.get','staffId']] as $kind=>[$tool,$arg]) {
        $builder->addResourceTemplate(function (string $uri,string $recordId) use ($tool,$arg,$id,$grant) { return resource($uri,$tool,[$arg=>ctype_digit($recordId)?(int)$recordId:0],$id,$grant); },'byline://'.$kind.'/{recordId}',$kind,mimeType:'application/json');
    }
    $builder->addPrompt(fn()=>[['role'=>'user','content'=>['type'=>'text','text'=>'Use newsroom.today and newsroom.summary to review today’s authorized work. Distinguish factual deadlines and blockers from inferences. Report sampling and section errors. Suggest actions without changing records.']]],'daily-newsroom-review',description:'Review daily work without changing records.');
    $factory=new \BylineMcpVendor\Nyholm\Psr7\Factory\Psr17Factory();
    $origins=apply_filters('byline_mcp_allowed_origins',[issuer()]);
    $middleware=[new CorsMiddleware(allowedOrigins:$origins),new DnsRebindingProtectionMiddleware(allowedHosts:[wp_parse_url(home_url('/'),PHP_URL_HOST)],allowedOrigins:$origins)];
    $transport=new StreamableHttpTransport($request,$factory,$factory,middleware:$middleware,maxBodyBytes:1024*1024);
    return $builder->build()->run($transport);
}
