import type { PayloadRequest } from "payload";
import { distributionSettingsFrom, type DistributionSettings } from "./model";

/** The publication's Distribution settings (the private `distribution-settings` Global), read as the system. */
export async function readDistributionSettings(req: PayloadRequest): Promise<DistributionSettings> {
  const raw = await req.payload.findGlobal({ slug: "distribution-settings", depth: 0, overrideAccess: true, req }).catch(() => null);
  return distributionSettingsFrom(raw);
}
