// Loaded only by the Playwright web server. Stub Google's wire responses, not
// Byline's verifier: the actual library must check an RSA-signed ID token.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";

const privateKey = process.env.BYLINE_LOGIN_TEST_SIGNING_KEY
  ? createPrivateKey(process.env.BYLINE_LOGIN_TEST_SIGNING_KEY)
  : generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const publicKey = createPublicKey(privateKey);
const kid = "byline-playwright-key";
const audience = "byline-test.apps.googleusercontent.com";
const originalFetch = globalThis.fetch;
const base64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.href === "https://oauth2.googleapis.com/token") {
    const request = new Request(input, init);
    const data = new URLSearchParams(await request.text());
    const { nonce, challenge, mode } = JSON.parse(Buffer.from(data.get("code"), "base64url"));
    const proof = createHash("sha256").update(data.get("code_verifier")).digest("base64url");
    if (proof !== challenge || data.get("client_id") !== audience ||
        data.get("client_secret") !== "fixture-google-secret" ||
        data.get("redirect_uri") !== "http://localhost:3013/api/byline/auth/google/callback" ||
        data.get("grant_type") !== "authorization_code") return Response.json({}, { status: 400 });
    if (mode === "invalid-client") return Response.json({ error: "invalid_client" }, { status: 401 });
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: mode === "issuer" ? "https://example.test" : "https://accounts.google.com",
      aud: mode === "audience" ? "wrong-audience" : audience,
      exp: mode === "expired" ? now - 5 : now + 120,
      iat: now - 15,
      hd: mode === "domain" ? "example.test" : "weeklywildcat.com",
      email_verified: mode !== "unverified",
      email: ({
        unknown: "uninvited@weeklywildcat.com", disabled: "disabled@weeklywildcat.com",
        bound: "other@weeklywildcat.com",
      })[mode] ?? "Staff@WeeklyWildcat.com",
      sub: mode === "malformed-subject" ? "" : mode === "takeover" || mode === "unknown" || mode === "disabled" ?
        `${mode}-subject` : "staff-subject",
      nonce: mode === "nonce" ? "wrong-nonce" : nonce,
    };
    const jwt = `${base64({ alg: "RS256", kid })}.${base64(claims)}`;
    const signature = mode === "signature" ? Buffer.alloc(256) : sign("sha256", Buffer.from(jwt), privateKey);
    return Response.json({ id_token: `${jwt}.${signature.toString("base64url")}` });
  }
  if (url.origin === "https://www.googleapis.com" && /\/oauth2\/v[13]\/certs/.test(url.pathname)) {
    const certs = url.pathname.includes("/v3/") ? { keys: [{ ...publicKey.export({ format: "jwk" }), kid }] } :
      { [kid]: publicKey.export({ format: "pem", type: "spki" }).toString() };
    return Response.json(certs, { headers: { "Cache-Control": "public, max-age=3600" } });
  }
  if (url.origin === "https://api.unsplash.com") {
    const headers = new Headers(init?.headers);
    if (process.env.BYLINE_LOGIN_TEST_PHOTOS !== "success" ||
        headers.get("authorization") !== "Client-ID fixture-unsplash-private-key" ||
        url.searchParams.get("orientation") !== "landscape" ||
        url.searchParams.get("content_filter") !== "high") return Response.json({}, { status: 429 });
    return Response.json([{
      width: 2400, height: 1400,
      urls: { regular: "https://images.unsplash.com/photo-byline-fixture" },
      user: { name: "Test Photographer", links: { html: "https://unsplash.com/@fixture" } },
      links: { html: "https://unsplash.com/photos/fixture" },
    }]);
  }
  return originalFetch(input, init);
};
