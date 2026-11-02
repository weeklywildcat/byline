/** Actual HTTP/browser-cookie OAuth and SDK test against disposable wp-env only. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Client, StreamableHTTPClientTransport, auth, type OAuthClientProvider } from "@modelcontextprotocol/client";
const base=process.env.WP_BASE_URL??"http://localhost:8888";
assert.match(base,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/,"Only disposable loopback WordPress may be used");
const cookies=new Map<string,string>();
async function browser(path:string,init:RequestInit={}) {
  const response=await fetch(base+path,{...init,redirect:"manual",headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join("; "),...init.headers}});
  for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(";");const at=pair.indexOf("=");cookies.set(pair.slice(0,at),pair.slice(at+1));}
  return response;
}
async function post(path:string,body:Record<string,unknown>,json=false){return browser(path,{method:"POST",headers:{"Content-Type":json?"application/json":"application/x-www-form-urlencoded"},body:json?JSON.stringify(body):new URLSearchParams(body as Record<string,string>).toString()});}
const anonymous=await fetch(base+"/mcp");assert.equal(anonymous.status,401);assert.match(anonymous.headers.get("www-authenticate")??"",/resource_metadata/);
assert.equal((await fetch(base+"/.well-known/oauth-authorization-server")).status,200);
await browser("/wp-login.php");
const login=await post("/wp-login.php",{log:"admin",pwd:"password","wp-submit":"Log In",redirect_to:base+"/wp-admin/",testcookie:"1"});assert.equal(login.status,302,"Local fixture administrator login");
const registered=await post("/mcp/register",{client_name:"Plugin HTTP smoke test",redirect_uris:["http://127.0.0.1:9922/callback"],token_endpoint_auth_method:"none"},true);assert.equal(registered.status,201);
const registration=await registered.json() as {client_id:string};
const verifier=randomBytes(32).toString("base64url");
const query=new URLSearchParams({response_type:"code",client_id:registration.client_id,redirect_uri:"http://127.0.0.1:9922/callback",state:"local-browser-state",resource:base+"/mcp",scope:"byline",code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"});
const consent=await browser("/mcp/authorize?"+query);assert.equal(consent.status,200);
const nonce=(await consent.text()).match(/name="_wpnonce" value="([^"]+)"/)?.[1];assert.ok(nonce,"Browser consent nonce");
const approved=await post("/mcp/authorize?"+query,{decision:"approve",_wpnonce:nonce});assert.equal(approved.status,302);
const callback=new URL(approved.headers.get("location")!);assert.equal(callback.searchParams.get("state"),"local-browser-state");
const tokenResponse=await post("/mcp/token",{grant_type:"authorization_code",client_id:registration.client_id,redirect_uri:"http://127.0.0.1:9922/callback",code:callback.searchParams.get("code")!,code_verifier:verifier,resource:base+"/mcp"});assert.equal(tokenResponse.status,200);
const tokens=await tokenResponse.json() as {access_token:string;refresh_token:string};
let checks=8;
for(const version of ["2026-07-28","2025-11-25"] as const){
 const client=new Client({name:"byline-plugin-test",version:"1.0"},{versionNegotiation:{mode:version==="2026-07-28"?{pin:version}:"legacy"}});
 const transport=new StreamableHTTPClientTransport(new URL(base+"/mcp"),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}});
 try{
  await client.connect(transport);
  const tools=await client.listTools();assert.ok(tools.tools.length>=70);
  assert.equal(tools.tools.find(t=>t.name==="article.publish")?.annotations?.destructiveHint,true);
  const result=await client.callTool({name:"byline.capabilities",arguments:{}});assert.equal((result.structuredContent as {ok:boolean}).ok,true);
  const today=await client.callTool({name:"newsroom.today",arguments:{}});assert.equal((today.structuredContent as {ok:boolean}).ok,true);
  assert.equal((await client.listResourceTemplates()).resourceTemplates.length,3);
  assert.equal((await client.listResources()).resources.length,1);
  const resource=await client.readResource({uri:"byline://newsroom/today"});assert.equal(resource.contents.length,1);
  assert.equal((await client.listPrompts()).prompts.length,1);
  assert.equal((await client.getPrompt({name:"daily-newsroom-review"})).messages.length,1);
  checks+=9;
 }finally{await client.close();}
}
const revoked=await post("/mcp/revoke",{client_id:registration.client_id,token:tokens.refresh_token,token_type_hint:"refresh_token"});assert.equal(revoked.status,200);
assert.equal((await fetch(base+"/mcp",{headers:{Authorization:`Bearer ${tokens.access_token}`}})).status,401);
// Let the actual SDK discover metadata, register a client and perform PKCE/token exchange too.
let info: Awaited<ReturnType<OAuthClientProvider["clientInformation"]>>;
let saved: Awaited<ReturnType<OAuthClientProvider["tokens"]>>;
let authorizationUrl: URL | undefined;
let savedVerifier="";
let discovery: Awaited<ReturnType<NonNullable<OAuthClientProvider["discoveryState"]>>>;
const provider: OAuthClientProvider={
 redirectUrl:"http://127.0.0.1:9922/callback",
 clientMetadata:{client_name:"SDK OAuth test",redirect_uris:["http://127.0.0.1:9922/callback"],token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]},
 state:()=>"sdk-browser-state",clientInformation:()=>info,saveClientInformation:value=>{info=value;},
 tokens:()=>saved,saveTokens:value=>{saved=value;},
 redirectToAuthorization:url=>{authorizationUrl=url;},saveCodeVerifier:value=>{savedVerifier=value;},codeVerifier:()=>savedVerifier,
 discoveryState:()=>discovery,saveDiscoveryState:value=>{discovery=value;},
};
assert.equal(await auth(provider,{serverUrl:base+"/mcp"}),"REDIRECT");
assert.ok(authorizationUrl);
const sdkConsent=await browser(authorizationUrl.pathname+authorizationUrl.search);assert.equal(sdkConsent.status,200);
const sdkNonce=(await sdkConsent.text()).match(/name="_wpnonce" value="([^"]+)"/)?.[1];assert.ok(sdkNonce);
const sdkApproved=await post(authorizationUrl.pathname+authorizationUrl.search,{decision:"approve",_wpnonce:sdkNonce});assert.equal(sdkApproved.status,302);
const sdkCallback=new URL(sdkApproved.headers.get("location")!);assert.equal(sdkCallback.searchParams.get("state"),"sdk-browser-state");
assert.equal(await auth(provider,{serverUrl:base+"/mcp",authorizationCode:sdkCallback.searchParams.get("code")!}),"AUTHORIZED");
assert.ok(saved?.access_token);
assert.equal(await auth(provider,{serverUrl:base+"/mcp"}),"AUTHORIZED","SDK refreshes its own tokens");
const sdkRevocation=await post("/mcp/revoke",{client_id:info!.client_id,token:saved!.refresh_token!,token_type_hint:"refresh_token"});assert.equal(sdkRevocation.status,200);
console.log(`Plugin HTTP OAuth and real SDK clients: ${checks+11} checks passed.`);
