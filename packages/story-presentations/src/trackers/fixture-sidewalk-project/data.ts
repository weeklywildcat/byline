/**
 * The fixture tracker's data: typed and versioned with the code, never in
 * Payload. A real tracker's reporter sends updates to a developer, who edits
 * this file and deploys.
 */
export type SidewalkPhase = { id: string; name: string; status: "done" | "underway" | "planned"; detail: string };

export const SIDEWALK_PROJECT = {
  updated: "2025-10-20",
  phases: [
    { id: "survey", name: "Survey and design", status: "done", detail: "Finished in March 2025." },
    { id: "north", name: "North segment, Elm to Oak", status: "done", detail: "Opened Aug. 18, 2025." },
    { id: "crossing", name: "Greenwood High crossing", status: "underway", detail: "Signals arrive in November; expected to open before winter break." },
    { id: "south", name: "South segment, Oak to Pine", status: "planned", detail: "Bids due in January 2026." },
    { id: "lighting", name: "Lighting", status: "planned", detail: "Depends on the 2026 budget." }
  ] satisfies SidewalkPhase[]
} as const;
