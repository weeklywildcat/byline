import { CodeChallengeMethod } from "google-auth-library";
import type { Endpoint } from "payload";
import { parseCookies } from "payload/shared";
import { GOOGLE_CALLBACK, GOOGLE_START, googleConfig, newsroomReturnTo } from "./config";
import { googleClient, verifyGoogleCode } from "./google-identity";
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

export const googleEndpoints: Endpoint[] = [
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
