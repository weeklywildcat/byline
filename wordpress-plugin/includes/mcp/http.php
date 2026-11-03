<?php
namespace Byline\Mcp;

use BylineMcpVendor\Nyholm\Psr7\Response;
use BylineMcpVendor\Nyholm\Psr7\ServerRequest;
use BylineMcpVendor\League\OAuth2\Server\Exception\OAuthServerException;

function issuer(): string { return untrailingslashit(home_url('/')); }
function endpoint(): string { return byline_mcp_endpoint(); }
function json(array $data,int $status=200): Response { return new Response($status,['Content-Type'=>'application/json'],wp_json_encode($data)); }
function metadataPath(): string { return issuer().'/.well-known/oauth-protected-resource/mcp'; }
function authMetadata(): array
{
    return ['issuer'=>issuer(),'authorization_endpoint'=>endpoint().'/authorize','token_endpoint'=>endpoint().'/token','registration_endpoint'=>endpoint().'/register','revocation_endpoint'=>endpoint().'/revoke',
        'response_types_supported'=>['code'],'grant_types_supported'=>['authorization_code','refresh_token'],'code_challenge_methods_supported'=>['S256'],'token_endpoint_auth_methods_supported'=>['none'],
        'scopes_supported'=>['byline'],'resource_indicators_supported'=>true];
}
function secure(): bool
{
    return wp_parse_url(issuer(),PHP_URL_SCHEME)==='https' || (wp_get_environment_type()==='local' && in_array(wp_parse_url(issuer(),PHP_URL_HOST),['localhost','127.0.0.1','[::1]'],true));
}
function dispatch($request)
{
    Store::$grant='';
    if (!secure()) { return json(['error'=>'HTTPS is required.'],503); }
    if (strtolower($request->getUri()->getAuthority())!==strtolower((string)wp_parse_url(issuer(),PHP_URL_HOST).(wp_parse_url(issuer(),PHP_URL_PORT)?':'.wp_parse_url(issuer(),PHP_URL_PORT):''))) { return json(['error'=>'Invalid host.'],421); }
    $origin=$request->getHeaderLine('Origin');
    if ($origin!=='' && !in_array($origin,apply_filters('byline_mcp_allowed_origins',[issuer()]),true)) { return json(['error'=>'Invalid origin.'],403); }
    $path=$request->getUri()->getPath(); $base=wp_parse_url(issuer(),PHP_URL_PATH)??''; $relative=substr($path,strlen($base)); $method=$request->getMethod();
    if ($relative==='/.well-known/oauth-protected-resource/mcp' && $method==='GET') { return json(['resource'=>endpoint(),'authorization_servers'=>[issuer()],'scopes_supported'=>['byline'],'resource_name'=>'Byline newsroom']); }
    if ($relative==='/.well-known/oauth-authorization-server' && $method==='GET') { return json(authMetadata()); }
    if ($method==='OPTIONS') {
        $response=new Response(204,['Allow'=>'GET, POST, OPTIONS','Access-Control-Allow-Methods'=>'GET, POST, OPTIONS','Access-Control-Allow-Headers'=>'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept','Access-Control-Expose-Headers'=>'WWW-Authenticate, MCP-Session-Id','Vary'=>'Origin']);
        return $origin!=='' ? $response->withHeader('Access-Control-Allow-Origin',$origin) : $response;
    }
    Store::install();
    if (!wp_next_scheduled('byline_mcp_cleanup')) { wp_schedule_event(time()+3600,'hourly','byline_mcp_cleanup'); }
    $network=hash_hmac('sha256',(string)($_SERVER['REMOTE_ADDR']??'unknown'),wp_salt('nonce'));
    if ($relative!=='/mcp' && !Store::rate('auth:'.$network,30)) { return json(['error'=>'rate_limited'],429)->withHeader('Retry-After','60'); }
    try {
        if ($relative==='/mcp/register' && $method==='POST') { return registerClient($request); }
        if ($relative==='/mcp/authorize' && in_array($method,['GET','POST'],true)) { return authorize($request); }
        if ($relative==='/mcp/token' && $method==='POST') {
            $body=(array)$request->getParsedBody();
            if (isset($body['resource']) && $body['resource']!==endpoint()) { return json(['error'=>'invalid_target'],400); }
            $opaque=$body['code']??$body['refresh_token']??'';
            if (!is_string($opaque) || $opaque==='') { return json(['error'=>'invalid_request'],400); }
            // Lock the authenticated identifier, not an encoding of its ciphertext.
            // Equivalent ciphertext representations must share the same replay fence.
            try { $decoded=decodeOpaque($opaque); }
            catch (\Throwable $e) { return json(['error'=>'invalid_grant'],400); }
            $kind=($body['grant_type']??'')==='authorization_code'?'auth_code_id':'refresh_token_id';
            $identifier=$decoded[$kind]??null;
            if (!is_string($identifier) || $identifier==='') { return json(['error'=>'invalid_grant'],400); }
            $lock=Store::lock($kind.':'.$identifier); if ($lock===null) { return json(['error'=>'invalid_grant'],400); }
            try { return authorizationServer()->respondToAccessTokenRequest($request,new Response()); }
            finally { Store::remove('lock',$lock); }
        }
        if ($relative==='/mcp/revoke' && $method==='POST') { return revoke($request); }
        if ($relative!=='/mcp') { return json(['error'=>'not_found'],404); }
        // Never accept WordPress login cookies as MCP authorization.
        try { $authenticated=authenticatedRequest($request); }
        catch (\Throwable $e) { return json(['error'=>'unauthenticated'],401)->withHeader('WWW-Authenticate','Bearer resource_metadata="'.metadataPath().'"'); }
        $actor=(int)$authenticated->getAttribute('oauth_user_id'); $grant=Store::$grant;
        if (!Store::rate('connection:'.$grant,120)) { return json(['error'=>'rate_limited'],429)->withHeader('Retry-After','60'); }
        $previous=get_current_user_id(); wp_set_current_user($actor);
        try { return mcp($authenticated,$grant,wp_generate_uuid4()); }
        finally { wp_set_current_user($previous); }
    } catch (OAuthServerException $e) {
        // Library messages and exceptions can contain request values; emit only standard error identifiers.
        return json(['error'=>$e->getErrorType()],$e->getHttpStatusCode());
    } catch (\Throwable $e) { return json(['error'=>'temporarily_unavailable'],503); }
}
function registerClient($request): Response
{
    $data=(array)$request->getParsedBody();
    if (!isset($data['redirect_uris']) || !is_array($data['redirect_uris']) || count($data['redirect_uris'])<1 || count($data['redirect_uris'])>10
        || ($data['token_endpoint_auth_method']??'none')!=='none'
        || !is_array($data['grant_types']??[]) || !is_array($data['response_types']??[])
        || array_diff($data['grant_types']??['authorization_code','refresh_token'],['authorization_code','refresh_token'])
        || ($data['response_types']??['code'])!==['code']) { return json(['error'=>'invalid_client_metadata'],400); }
    foreach ($data['redirect_uris'] as $uri) {
        if (!is_string($uri) || strlen($uri)>2048 || preg_match('/[\x00-\x20\x7f]/',$uri)) { return json(['error'=>'invalid_redirect_uri'],400); }
        $parts=wp_parse_url($uri);
        if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment']) || !in_array($parts['scheme']??'',['https','http'],true)
            || (($parts['scheme']??'')==='http' && !in_array($parts['host'],['127.0.0.1','[::1]','localhost'],true))) { return json(['error'=>'invalid_redirect_uri'],400); }
    }
    if (isset($data['client_name']) && !is_string($data['client_name'])) { return json(['error'=>'invalid_client_metadata'],400); }
    $id=wp_generate_uuid4();
    $client=['client_id'=>$id,'client_name'=>sanitize_text_field(substr($data['client_name']??'MCP client',0,120)),'redirect_uris'=>$data['redirect_uris'],'token_endpoint_auth_method'=>'none','grant_types'=>['authorization_code','refresh_token'],'response_types'=>['code'],'client_id_issued_at'=>time()];
    Store::put('client',$id,$client,time()+90*DAY_IN_SECONDS);
    return json($client,201);
}
function authorize($request): Response
{
    $params=$request->getQueryParams();
    if (($params['resource']??endpoint())!==endpoint()) { return json(['error'=>'invalid_target'],400); }
    if (($params['code_challenge_method']??'')!=='S256' || !is_string($params['code_challenge']??null) || !preg_match('/^[A-Za-z0-9_-]{43}$/',$params['code_challenge'])) { return json(['error'=>'invalid_request'],400); }
    $server=authorizationServer(); $authorization=$server->validateAuthorizationRequest($request);
    if (!is_user_logged_in()) { return new Response(302,['Location'=>wp_login_url(endpoint().'/authorize?'.http_build_query($params,'','&',PHP_QUERY_RFC3986))]); }
    if (!allowedUser(get_current_user_id())) { return json(['error'=>'access_denied'],403); }
    $nonceAction='byline_mcp_authorize:'.hash('sha256',wp_json_encode($params));
    if ($request->getMethod()==='POST') {
        $body=(array)$request->getParsedBody();
        if (!wp_verify_nonce($body['_wpnonce']??'',$nonceAction)) { return json(['error'=>'invalid_request'],403); }
        $authorization->setUser(new User(get_current_user_id()));
        $authorization->setAuthorizationApproved(($body['decision']??'')==='approve');
        try { return $server->completeAuthorizationRequest($authorization,new Response()); }
        catch (OAuthServerException $e) {
            if (($body['decision']??'')==='deny' && $e->getErrorType()==='access_denied') { return $e->generateHttpResponse(new Response()); }
            throw $e;
        }
    }
    $client=$authorization->getClient(); $redirect=$authorization->getRedirectUri();
    $html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Byline</title></head><body><main><h1>Connect to Byline</h1><p><strong>'.esc_html($client->getName()).'</strong> is asking to read and manage newsroom work using your WordPress permissions.</p><p>Client names are self-reported. Approve only a connection you started.</p><p>Return address: <code>'.esc_html($redirect).'</code></p><p>Connecting as '.esc_html(wp_get_current_user()->display_name).'. You can revoke access from your WordPress profile.</p><form method="post">'.wp_nonce_field($nonceAction,'_wpnonce',false,false).'<button name="decision" value="approve">Connect Byline</button> <button name="decision" value="deny">Cancel</button></form></main></body></html>';
    return new Response(200,['Content-Type'=>'text/html; charset=utf-8','Content-Security-Policy'=>"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"],$html);
}
function revoke($request): Response
{
    // League decrypts and validates refresh tokens; revocation supports either token type without exposing plaintext.
    $body=(array)$request->getParsedBody(); $opaque=$body['token']??'';
    if (!is_string($opaque) || $opaque==='') { return json(['error'=>'invalid_request'],400); }
    Store::keys(); $grant='';
    try {
        if (($body['token_type_hint']??'')==='refresh_token' || !str_contains($opaque,'.')) {
            $decoded=decodeOpaque($opaque);
            $row=Store::get('refresh',(string)($decoded['refresh_token_id']??''));
            if ($row && ($body['client_id']??'')===$row['client']) { $grant=$row['grant']; }
        } else {
            $valid=authenticatedRequest($request->withHeader('Authorization','Bearer '.$opaque));
            if (($body['client_id']??'')===$valid->getAttribute('oauth_client_id')) { $grant=Store::$grant; }
        }
    } catch (\Throwable $e) { /* RFC 7009 does not reveal whether a token existed. */ }
    // Storage failures must report unavailability instead of claiming revocation.
    if ($grant!=='') { Store::revoke($grant); }
    return new Response(200);
}
function serve(): void
{
    nocache_headers(); header('Referrer-Policy: no-referrer'); header('X-Content-Type-Options: nosniff'); header('X-Frame-Options: DENY');
    try {
        $method=strtoupper($_SERVER['REQUEST_METHOD']??'GET'); $limit=strtok($_SERVER['REQUEST_URI']??'','?')===wp_parse_url(endpoint(),PHP_URL_PATH)?1024*1024:16384;
        if ((int)($_SERVER['CONTENT_LENGTH']??0)>$limit) { $response=json(['error'=>'request_too_large'],413); }
        else {
            $stream=fopen('php://input','rb'); $raw=stream_get_contents($stream,$limit+1); fclose($stream);
            if (strlen($raw)>$limit) { $response=json(['error'=>'request_too_large'],413); }
            else {
                $headers=function_exists('getallheaders')?getallheaders():[];
                if (!isset($headers['Authorization']) && isset($_SERVER['HTTP_AUTHORIZATION'])) { $headers['Authorization']=$_SERVER['HTTP_AUTHORIZATION']; }
                $request=new ServerRequest($method,($_SERVER['HTTPS']??'')==='on'?'https://'.($_SERVER['HTTP_HOST']??'').($_SERVER['REQUEST_URI']??'/'):'http://'.($_SERVER['HTTP_HOST']??'').($_SERVER['REQUEST_URI']??'/'),$headers,$raw);
                $request=$request->withQueryParams(wp_unslash($_GET));
                $type=strtolower(explode(';',$request->getHeaderLine('Content-Type'))[0]);
                if ($type==='application/json' && $raw!=='') { $parsed=json_decode($raw,true,64,JSON_THROW_ON_ERROR); $request=$request->withParsedBody(is_array($parsed)?$parsed:[]); }
                elseif ($type==='application/x-www-form-urlencoded') { parse_str($raw,$parsed); $request=$request->withParsedBody($parsed); }
                $response=dispatch($request);
            }
        }
    } catch (\JsonException $e) { $response=json(['error'=>'invalid_request'],400); }
    catch (\Throwable $e) { $response=json(['error'=>'temporarily_unavailable'],503); }
    status_header($response->getStatusCode());
    foreach ($response->getHeaders() as $name=>$values) { foreach ($values as $value) { header($name.': '.$value,false); } }
    echo (string)$response->getBody(); exit;
}
