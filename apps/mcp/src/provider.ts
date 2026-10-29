import {
  OAuthAuthorizationServer,
  OAuthError,
} from "@cloudflare/workers-oauth-provider";
import { configuration } from "./config";
import type { Env } from "./types";
export function authorizationServer(env: Env): OAuthAuthorizationServer<Env> {
  const config = configuration(env);
  return new OAuthAuthorizationServer<Env>({
    issuer: config.issuer,
    resources: [config.resource],
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["byline"],
    accessTokenTTL: 900,
    refreshTokenTTL: 30 * 86400,
    tokenExchangeCallback: async ({ props, grantId, env }) => {
      if (
        !props ||
        typeof props.connectionId !== "string" ||
        !(await env.CONNECTIONS.get(
          env.CONNECTIONS.idFromName(props.connectionId),
        ).bindGrant(grantId))
      )
        throw new OAuthError("invalid_grant", {
          description: "Reconnect Byline.",
        });
    },
    // Never log the library's description, request, headers or cause.
    onError: ({ code, status }) => {
      console.log(JSON.stringify({ event: "oauth_error", code, status }));
    },
  });
}
