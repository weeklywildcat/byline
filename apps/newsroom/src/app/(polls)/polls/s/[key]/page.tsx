import config from "@payload-config";
import { getPayload } from "payload";
import { PublicPollApp } from "../../../../../ui/polls/public/PublicPollApp";
import { PUBLIC_POLL_KEY } from "../../../../../polls/links";

/**
 * The first public-link address, kept working for links already shared. It
 * renders exactly what `/poll/<key>` renders; new links use that address.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function LegacyPublicPollPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const payload = await getPayload({ config });
  return <PublicPollApp api={payload.config.routes.api} pollKey={PUBLIC_POLL_KEY.test(key) ? key : ""} />;
}
