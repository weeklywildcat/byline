import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { newsroomUser } from "../../../../access/user";
import { DataProjectPreview } from "../../../../preview/DataProjectPreview";

/**
 * The Data project preview frame: the same `DataProjectView` and
 * presentation components as the static page, with either the newsroom's
 * working data or exactly the published releases (`?data=`). Private on its
 * own: it needs a signed-in newsroom account, reads the project and its rows
 * as that account, and is never cached or indexed (next.config.mjs headers
 * for /preview).
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Data preview", robots: { index: false, follow: false } };

export default async function DataPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!newsroomUser(user)) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Sign in to the newsroom to preview Data projects.</main>;
  const params = await searchParams;
  const id = Number(params.project);
  if (!Number.isSafeInteger(id) || id <= 0) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Choose a project to preview.</main>;
  return <DataProjectPreview payload={payload} user={user} projectId={id} source={params.data === "published" ? "published" : "working"} embed={params.embed === "1"} />;
}
