import config from "@payload-config";
import { getPayload } from "payload";
import { PAIR_PATH } from "../../../../polls/links";
import { KioskApp } from "../../../../ui/polls/kiosk/KioskApp";

/**
 * Kiosk mode. The page itself holds nothing: the client asks the kiosk API,
 * which accepts only this device's kiosk credential (an httpOnly cookie).
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function KioskPage() {
  const payload = await getPayload({ config });
  return <KioskApp api={payload.config.routes.api} pairHref={PAIR_PATH} />;
}
