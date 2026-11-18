import config from "@payload-config";
import { getPayload } from "payload";
import { PairingApp } from "../../../ui/polls/kiosk/PairingApp";
import { deviceSetupSignInPath } from "../../../polls/links";

/**
 * `/poll`: the neutral setup entry for a polling device.
 *
 * A device can claim a short pairing code anonymously, or the interviewer can
 * sign in to Byline and return to Poll Studio's device-setup flow. The login
 * redirect remains inside the admin route; Poll Studio then hands the account
 * session off for the same session-scoped kiosk credential before polling.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function PairPage() {
  const payload = await getPayload({ config });
  const { routes, admin } = payload.config;
  return <PairingApp api={routes.api} signInHref={deviceSetupSignInPath(routes.admin, admin.routes.login)} />;
}
