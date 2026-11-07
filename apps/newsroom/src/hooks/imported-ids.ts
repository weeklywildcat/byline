import type { CollectionBeforeValidateHook } from "payload";

/**
 * The Postgres adapter runs with `allowIDOnCreate` so the WordPress import can
 * keep story, media and people IDs (custom presentations are keyed by story
 * ID). Nobody else may choose an ID: an `id` on create is dropped unless the
 * Local API call carries `context.bylineImport`, which REST/GraphQL clients
 * cannot set.
 */
export const dropClientIds: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation !== "create" || !data || !("id" in data)) return data;
  if (req.context?.bylineImport === true) return data;
  const { id: _ignored, ...rest } = data;
  return rest;
};
