import type { CollectionAfterChangeHook } from "payload";

/** Replaced in the Distribution slice. */
export const seedDistributionAfterStoryChange: CollectionAfterChangeHook = ({ doc }) => doc;
