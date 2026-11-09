import type { DestinationKind } from "./destinations";

/**
 * The automated-delivery boundary (docs/distribution.md#adapters). An adapter
 * would post, schedule or read back delivery state for one destination; it
 * reports a delivery failure through `markDistributionFailed` (server.ts),
 * which makes the item Failed and notifies its owner and the editors.
 *
 * No destination is automated yet: Instagram and Facebook are copy, open and
 * paste-the-permalink; the newsletter, School TVs, Discord and YouTube are
 * recorded by hand. A destination without an adapter is manual, and the
 * Distribution workflow is complete without one. Add an adapter here only
 * with a real provider integration (its credentials stay in the environment,
 * never in Distribution records or settings).
 */
export type DistributionAdapter = {
  destination: DestinationKind;
  capabilities: { publish: boolean; schedule: boolean; fetchStatus: boolean };
};

const ADAPTERS: Partial<Record<DestinationKind, DistributionAdapter>> = {};

export function adapterFor(kind: DestinationKind): DistributionAdapter | null {
  return ADAPTERS[kind] ?? null;
}
