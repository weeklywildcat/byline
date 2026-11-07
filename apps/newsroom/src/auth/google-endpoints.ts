import { CodeChallengeMethod } from "google-auth-library";
import type { Endpoint } from "payload";
import { parseCookies } from "payload/shared";
import { GOOGLE_BUTTON, GOOGLE_CALLBACK, GOOGLE_CREDENTIAL, GOOGLE_START, googleConfig, newsroomReturnTo } from "./config";
import { googleClient, verifyGoogleCode, verifyGoogleCredential } from "./google-identity";
import { beginGoogleRoundTrip, googleCookie, googleCookieName, readGoogleRoundTrip } from "./google-round-trip";
import { createGoogleSession } from "./google-session";

function redirect(location: string, ...cookies: string[]) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function buttonResponse(status: number, body: object, ...cookies: string[]) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

// GIS popup callbacks submit from the newsroom page itself. Require that
// origin for both steps and bind the signed credential to this browser.
function buttonConfig(api: string, origin: string | null) {
  const config = googleConfig(api);
  return config && origin === new URL(config.callback).origin ? config : null;
}

const buttonSecret = (secret: string) => `byline-google-button:${secret}`;

export const googleEndpoints: Endpoint[] = [
  {
    path: GOOGLE_BUTTON,
    method: "post",
    handler: req => {
      const { routes } = req.payload.config;
      const config = buttonConfig(routes.api, req.headers.get("origin"));
      if (!config) return buttonResponse(403, {});
      const returnTo = newsroomReturnTo(req.searchParams.get("returnTo"), routes.admin);
      const trip = beginGoogleRoundTrip(returnTo, buttonSecret(req.payload.secret));
      return buttonResponse(200, { state: trip.state, nonce: trip.nonce }, googleCookie(config.secure, trip.value, "button"));
    },
  },
  {
    path: GOOGLE_CREDENTIAL,
    method: "post",
    handler: async req => {
      const { routes } = req.payload.config;
      const config = buttonConfig(routes.api, req.headers.get("origin"));
      if (!config || req.headers.get("content-type") !== "application/json") return buttonResponse(403, {});
      const cookie = parseCookies(req.headers).get(googleCookieName(config.secure, "button"));
      const clear = googleCookie(config.secure, undefined, "button");
      const failure = () => buttonResponse(401, {}, clear);
      if (!cookie) return failure();
      try {
        const data = await req.json?.();
        if (typeof data?.credential !== "string" || data.credential.length > 8192 || typeof data.state !== "string") return failure();
        const trip = readGoogleRoundTrip(cookie, data.state, buttonSecret(req.payload.secret));
        if (!trip) return failure();
        const identity = await verifyGoogleCredential(config, data.credential, trip.nonce);
        if (!identity) return failure();
        const session = await createGoogleSession(req, identity);
        if (!session) return failure();
        return buttonResponse(200, { returnTo: newsroomReturnTo(trip.returnTo, routes.admin) }, clear, session);
      } catch {
        // Neither malformed credentials nor verification failures belong in logs.
        return failure();
      }
    },
  },
  {
    path: GOOGLE_START,
    method: "get",
    handler: req => {
      const { routes, admin } = req.payload.config;
      const failure = `${routes.admin}${admin.routes.login}?google=failed`;
      const config = googleConfig(routes.api);
      if (!config) return redirect(failure);
      try {
        const returnTo = newsroomReturnTo(req.searchParams.get("returnTo"), routes.admin);
        const trip = beginGoogleRoundTrip(returnTo, req.payload.secret);
        const url = googleClient(config).generateAuthUrl({
          response_type: "code",
          scope: ["openid", "email", "profile"],
          hd: config.hostedDomain,
          state: trip.state,
          nonce: trip.nonce,
          code_challenge: trip.challenge,
          code_challenge_method: CodeChallengeMethod.S256,
        });
        return redirect(url, googleCookie(config.secure, trip.value));
      } catch {
        return redirect(failure, googleCookie(config.secure));
      }
    },
  },
  {
    path: GOOGLE_CALLBACK,
    method: "get",
    handler: async req => {
      const { routes, admin } = req.payload.config;
      const failure = `${routes.admin}${admin.routes.login}?google=failed`;
      const config = googleConfig(routes.api);
      if (!config) return redirect(failure);
      const clear = googleCookie(config.secure);
      const query = req.searchParams;
      const trip = readGoogleRoundTrip(parseCookies(req.headers).get(googleCookieName(config.secure)), query.get("state"), req.payload.secret);
      const code = query.get("code");
      if (!trip || !code || code.length > 2048 || query.has("error") ||
          query.getAll("state").length !== 1 || query.getAll("code").length !== 1) return redirect(failure, clear);
      try {
        const identity = await verifyGoogleCode(config, code, trip.verifier, trip.nonce);
        if (!identity) return redirect(failure, clear);
        const session = await createGoogleSession(req, identity);
        if (!session) return redirect(failure, clear);
        return redirect(newsroomReturnTo(trip.returnTo, routes.admin), clear, session);
      } catch {
        // Provider errors can contain the code, token or client credentials.
        return redirect(failure, clear);
      }
    },
  },
];
