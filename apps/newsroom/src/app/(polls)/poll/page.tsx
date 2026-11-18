import config from "@payload-config";
import { getPayload } from "payload";
import { PairingApp } from "../../../ui/polls/kiosk/PairingApp";

/**
 * `/poll`: where a polling device is paired (docs/wildcat-polls.md#pairing-a-device).
 * Anonymous: the device types the short code an interviewer prepared in Poll
 * Studio and receives a kiosk credential for that one session. No Byline
 * sign-in happens here, and nothing about the newsroom is rendered.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function PairPage() {
  const payload = await getPayload({ config });
  return <PairingApp api={payload.config.routes.api} />;
}
