import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { newsroomUser } from "../../../../access/user";
import { loadPreviewPublication } from "../../../../preview/publication";
import { StoryPreview } from "../../../../preview/StoryPreview";

/**
 * Payload Live Preview's page for a Story. Static and Story-less by design:
 * which Story it shows arrives in Payload's own form-state messages, which the
 * official `useLivePreview` receives in the browser.
 *
 * It is private on its own, not because it lives near the admin: it needs a
 * valid newsroom session (a signed-out visitor gets a message and no
 * content), every population request runs the normal Story access control as
 * that user, and it is never cached or indexed (headers in next.config.mjs).
 * There is no preview secret and a Story ID is not authorization.
 */
export const dynamic = "force-dynamic";

export default async function StoryPreviewPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  const signedIn = newsroomUser(user) !== null;
  return (
    <StoryPreview
      signedIn={signedIn}
      publication={await loadPreviewPublication(payload)}
      fixtures={process.env.BYLINE_STORY_PRESENTATION_FIXTURES === "1" && process.env.NODE_ENV !== "production"}
    />
  );
}
