import config from "@payload-config";
import { getPayload } from "payload";
import { PublicPollApp } from "../../../../../ui/polls/public/PublicPollApp";

/** A public poll link: anonymous, and only for a poll an editor opened to the public. */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function PublicPollPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const payload = await getPayload({ config });
  return <PublicPollApp api={payload.config.routes.api} pollKey={/^[A-Za-z0-9]{8,40}$/.test(key) ? key : ""} />;
}
