import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { atLeast, newsroomUser } from "../../../../access/user";
import { FrontPagePreview } from "../../../../front-page/FrontPagePreview";

/**
 * The Front Page Desk's preview frame: the real homepage renderer
 * (`HomepagePackages`) fed by the one canonical resolver, with the real
 * publication stylesheets (this route group's layout), at the viewport width
 * the desk's Desktop/Mobile toggle gives the frame. Editors only; never
 * cached or indexed (next.config.mjs headers for /preview).
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Homepage preview", robots: { index: false, follow: false } };

export default async function FrontPagePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  const account = newsroomUser(user);
  if (!atLeast(account, "editor")) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Only editors can preview homepage changes.</main>;
  const params = await searchParams;
  const view = params.view === "live" ? "live" : "pending";
  return <FrontPagePreview payload={payload} view={view} />;
}
