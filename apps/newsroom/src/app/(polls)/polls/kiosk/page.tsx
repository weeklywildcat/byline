import config from "@payload-config";
import { getPayload } from "payload";
import { KioskApp } from "../../../../ui/polls/kiosk/KioskApp";

/**
 * Kiosk mode. The page itself holds nothing: the client asks the kiosk API,
 * which accepts only this device's kiosk credential (an httpOnly cookie).
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Wildcat Polls" };

export default async function KioskPage() {
  const payload = await getPayload({ config });
  const { routes, admin } = payload.config;
  return <KioskApp api={routes.api} loginHref={`${routes.admin}${admin.routes.login}?redirect=${encodeURIComponent(`${routes.admin}/polls?view=fieldwork`)}`} />;
}
