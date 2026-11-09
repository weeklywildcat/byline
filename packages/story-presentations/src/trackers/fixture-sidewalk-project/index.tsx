import type { RepositoryTracker } from "../types";
import { SIDEWALK_PROJECT, type SidewalkPhase } from "./data";

const STATUS: Record<SidewalkPhase["status"], string> = { done: "Done", underway: "Underway", planned: "Planned" };

/**
 * The fixture tracker: an ordered list of project phases, complete without
 * script. `client.ts` adds a "Show only what is left" filter.
 */
export function FixtureSidewalkProject({ title }: { title: string; description: string }) {
  const done = SIDEWALK_PROJECT.phases.filter((phase) => phase.status === "done").length;
  return (
    <div className="tracker-fixture-sidewalk-project" data-fixture-tracker="sidewalk">
      <p className="tracker-fixture-sidewalk-project-progress">
        <strong>{done} of {SIDEWALK_PROJECT.phases.length} phases done</strong> · Updated <time dateTime={SIDEWALK_PROJECT.updated}>Oct. 20, 2025</time>
      </p>
      <ol aria-label={`${title}: phases`}>
        {SIDEWALK_PROJECT.phases.map((phase) => (
          <li key={phase.id} data-status={phase.status}>
            <span className="tracker-fixture-sidewalk-project-status">{STATUS[phase.status]}</span>
            <span className="tracker-fixture-sidewalk-project-name">{phase.name}</span>
            <span className="tracker-fixture-sidewalk-project-detail">{phase.detail}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const FIXTURE_SIDEWALK_PROJECT: RepositoryTracker = {
  key: "fixture-sidewalk-project",
  name: "Main Street sidewalk project (fixture)",
  description: "Which phases of the Main Street sidewalk project are done, underway or planned.",
  Fallback: FixtureSidewalkProject,
  client: true,
  styles: true
};
