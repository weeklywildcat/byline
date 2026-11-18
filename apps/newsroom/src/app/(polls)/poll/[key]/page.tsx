import config from "@payload-config";
import { getPayload } from "payload";
import { PublicPollApp } from "../../../../ui/polls/public/PublicPollApp";
import { PUBLIC_POLL_KEY } from "../../../../polls/links";

/**
 * A public poll's canonical link, `/poll/<key>` (docs/wildcat-polls.md#web-link).
 * The same app, renderer and server checks as the older `/polls/s/<key>`.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function PublicPollPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const payload = await getPayload({ config });
  return <PublicPollApp api={payload.config.routes.api} pollKey={PUBLIC_POLL_KEY.test(key) ? key : ""} />;
}
