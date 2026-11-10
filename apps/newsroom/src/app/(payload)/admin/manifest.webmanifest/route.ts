import { webAppManifest } from "../../../../newsroom/web-app-manifest";

/** Public on purpose: the browser fetches it without credentials, and it holds nothing private. */
export function GET() {
  return new Response(JSON.stringify(webAppManifest()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}
