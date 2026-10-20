import metadata from "./block.json";
import { TimelineSave } from "./save";

/** Until 0.3.24 a new Timeline started with two sample events that were saved as real content. */
const SAMPLE_EVENTS = [
  { label: "Earlier", title: "How it began", body: "Add the context behind this event." },
  { label: "Now", title: "What happened next", body: "Explain the next development." }
];

export const deprecated = [{
  attributes: { items: { ...metadata.attributes.items, default: SAMPLE_EVENTS } },
  supports: metadata.supports,
  save: TimelineSave,
  migrate: (attributes: unknown) => attributes
}];
