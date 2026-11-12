import type { ComponentType } from "react";
import type { BylineSiteEntry } from "@byline/site-contract";
import SpikeCounter from "./interactives/spike-counter";

// Shared by web and preview: components with their own lazy loaders.
export const interactives: BylineSiteEntry<ComponentType>[] = [
  {
    id: "spike-counter",
    Component: SpikeCounter,
    styles: () => import("./interactives/spike-counter/styles.css"),
    client: () => import("./interactives/spike-counter/client")
  }
];
