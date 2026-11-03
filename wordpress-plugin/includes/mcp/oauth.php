<?php
namespace Byline\Mcp;

use BylineMcpVendor\League\OAuth2\Server as OAuth;
use BylineMcpVendor\League\OAuth2\Server\Entities as E;
use BylineMcpVendor\League\OAuth2\Server\Repositories as R;
use BylineMcpVendor\Lcobucci\JWT\Configuration;
use BylineMcpVendor\Lcobucci\JWT\Signer\Key\InMemory;
use BylineMcpVendor\Lcobucci\JWT\Signer\Rsa\Sha256;

final class Client implements E\ClientEntityInterface
{
    use E\Traits\EntityTrait, E\Traits\ClientTrait;
    public function __construct(string $id, array $data) { $this->setIdentifier($id); $this->name=$data['client_name']; $this->redirectUri=$data['redirect_uris']; $this->isConfidential=false; }
}
final class Scope implements E\ScopeEntityInterface
{
    use E\Traits\EntityTrait;
    public function __construct() { $this->setIdentifier('byline'); }
    public function jsonSerialize(): string { return $this->getIdentifier(); }
}
final class User implements E\UserEntityInterface
{
    use E\Traits\EntityTrait;
    public function __construct(int $id) { $this->setIdentifier((string)$id); }
}
final class Code implements E\AuthCodeEntityInterface { use E\Traits\EntityTrait, E\Traits\TokenEntityTrait, E\Traits\AuthCodeTrait; }
final class Refresh implements E\RefreshTokenEntityInterface { use E\Traits\EntityTrait, E\Traits\RefreshTokenTrait; }
final class Token implements E\AccessTokenEntityInterface
{
    use E\Traits\EntityTrait, E\Traits\TokenEntityTrait;
    private OAuth\CryptKeyInterface $key;
    public function setPrivateKey(OAuth\CryptKeyInterface $key): void { $this->key=$key; }
    public function toString(): string
    {
        $jwt=Configuration::forAsymmetricSigner(new Sha256(),InMemory::plainText($this->key->getKeyContents()),InMemory::plainText('unused'));
        return $jwt->builder()->issuedBy(issuer())->permittedFor(endpoint())->identifiedBy($this->getIdentifier())
            ->issuedAt(new \DateTimeImmutable())->canOnlyBeUsedAfter(new \DateTimeImmutable())->expiresAt($this->getExpiryDateTime())
            ->relatedTo($this->getUserIdentifier())->withClaim('client_id',$this->getClient()->getIdentifier())->withClaim('scopes',$this->getScopes())
            ->getToken($jwt->signer(),$jwt->signingKey())->toString();
    }
}
final class Clients implements R\ClientRepositoryInterface
{
    public function getClientEntity(string $id): ?E\ClientEntityInterface { $data=Store::get('client',$id); return $data ? new Client($id,$data) : null; }
    public function validateClient(string $id, ?string $secret, ?string $grant): bool { return $this->getClientEntity($id)!==null && in_array($grant,['authorization_code','refresh_token'],true) && ($secret===null || $secret===''); }
}
final class Scopes implements R\ScopeRepositoryInterface
{
    public function getScopeEntityByIdentifier(string $identifier): ?E\ScopeEntityInterface { return $identifier==='byline' ? new Scope() : null; }
    public function finalizeScopes(array $scopes,string $grant,E\ClientEntityInterface $client,?string $user=null,?string $code=null): array
    {
        if (!$user || !allowedUser((int)$user)) { throw OAuth\Exception\OAuthServerException::accessDenied(); }
        return [new Scope()];
    }
}
final class Codes implements R\AuthCodeRepositoryInterface
{
    public function getNewAuthCode(): E\AuthCodeEntityInterface { return new Code(); }
    public function persistNewAuthCode(E\AuthCodeEntityInterface $code): void
    {
        $grant=wp_generate_uuid4(); $actor=(int)$code->getUserIdentifier(); $client=$code->getClient();
        Store::put('grant',$grant,['id'=>$grant,'client'=>$client->getIdentifier(),'name'=>$client->getName(),'createdAt'=>time()],time()+30*DAY_IN_SECONDS,$actor,$grant);
        Store::put('code',$code->getIdentifier(),['grant'=>$grant],$code->getExpiryDateTime()->getTimestamp(),$actor,$grant);
    }
    public function revokeAuthCode(string $id): void { Store::remove('code',$id); }
    public function isAuthCodeRevoked(string $id): bool { return !Store::active('code',$id); }
}
final class Tokens implements R\AccessTokenRepositoryInterface
{
    public function getNewToken(E\ClientEntityInterface $client,array $scopes,?string $user=null): E\AccessTokenEntityInterface
    {
        $token=new Token(); $token->setClient($client); if ($user!==null) { $token->setUserIdentifier($user); } foreach ($scopes as $scope) { $token->addScope($scope); } return $token;
    }
    public function persistNewAccessToken(E\AccessTokenEntityInterface $token): void
    {
        if (!Store::get('grant',Store::$grant)) { throw OAuth\Exception\OAuthServerException::accessDenied(); }
        Store::put('access',$token->getIdentifier(),['grant'=>Store::$grant,'client'=>$token->getClient()->getIdentifier()],$token->getExpiryDateTime()->getTimestamp(),(int)$token->getUserIdentifier(),Store::$grant);
    }
    public function revokeAccessToken(string $id): void { Store::remove('access',$id); }
    public function isAccessTokenRevoked(string $id): bool { return !Store::active('access',$id); }
}
final class Refreshes implements R\RefreshTokenRepositoryInterface
{
    public function getNewRefreshToken(): ?E\RefreshTokenEntityInterface { return new Refresh(); }
    public function persistNewRefreshToken(E\RefreshTokenEntityInterface $token): void
    {
        $access=$token->getAccessToken();
        Store::put('refresh',$token->getIdentifier(),['grant'=>Store::$grant,'client'=>$access->getClient()->getIdentifier()],$token->getExpiryDateTime()->getTimestamp(),(int)$access->getUserIdentifier(),Store::$grant);
    }
    public function revokeRefreshToken(string $id): void { Store::remove('refresh',$id); }
    public function isRefreshTokenRevoked(string $id): bool { return !Store::active('refresh',$id); }
}
function allowedUser(int $id): bool
{
    $user=get_user_by('id',$id);
    return $user && empty($user->spam) && empty($user->deleted) && user_can($user,'edit_posts') && apply_filters('byline_mcp_user_allowed',true,$user);
}
/** Use the library's authenticated decoder, never a second token format. */
function decodeOpaque(string $opaque): array
{
    $decoder=new class {
        use \BylineMcpVendor\League\OAuth2\Server\CryptTrait;
        public function decode(string $token,string $key): array
        {
            $this->setEncryptionKey($key);
            return json_decode($this->decrypt($token),true,32,JSON_THROW_ON_ERROR);
        }
    };
    return $decoder->decode($opaque,Store::keys()['encryption']);
}
function authorizationServer(): OAuth\AuthorizationServer
{
    $keys=Store::keys();
    $server=new OAuth\AuthorizationServer(new Clients(),new Tokens(),new Scopes(),new OAuth\CryptKey($keys['private'],null,false),$keys['encryption']);
    $code=new OAuth\Grant\AuthCodeGrant(new Codes(),new Refreshes(),new \DateInterval('PT5M'));
    $code->setRefreshTokenTTL(new \DateInterval('P30D'));
    $refresh=new OAuth\Grant\RefreshTokenGrant(new Refreshes()); $refresh->setRefreshTokenTTL(new \DateInterval('P30D'));
    $server->enableGrantType($code,new \DateInterval('PT15M')); $server->enableGrantType($refresh,new \DateInterval('PT15M'));
    $server->setDefaultScope('byline');
    return $server;
}
function authenticatedRequest($request)
{
    $keys=Store::keys();
    $server=new OAuth\ResourceServer(new Tokens(),new OAuth\CryptKey($keys['public'],null,false));
    $request=$server->validateAuthenticatedRequest($request);
    // The library checks signature, time and revocation; bind issuer/resource too.
    $jwt=(new \BylineMcpVendor\Lcobucci\JWT\Token\Parser(new \BylineMcpVendor\Lcobucci\JWT\Encoding\JoseEncoder()))->parse(preg_replace('/^Bearer\s+/i','',$request->getHeaderLine('Authorization')));
    if ($jwt->claims()->get('iss')!==issuer() || $jwt->claims()->get('aud')!==[endpoint()] || !in_array('byline',$request->getAttribute('oauth_scopes',[]),true) || !allowedUser((int)$request->getAttribute('oauth_user_id'))) { throw OAuth\Exception\OAuthServerException::accessDenied(); }
    $row=Store::get('access',(string)$request->getAttribute('oauth_access_token_id'));
    if (!$row || $jwt->claims()->get('client_id')!==$row['client']) { throw OAuth\Exception\OAuthServerException::accessDenied(); }
    return $request->withAttribute('oauth_client_id',$row['client']);
}
