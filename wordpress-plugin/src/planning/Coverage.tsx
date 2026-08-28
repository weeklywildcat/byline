import { Button, SelectControl, TextControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import {
  exactPlanningDate,
  type CoverageItem,
  type CoverageResponse,
  type OptionalResource,
  type PlanningStory
} from "./planning-model";
import { PlanningDateValue, PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, ViewHeader } from "./planning-ui";

export type CoverageProps = {
  resource: OptionalResource<CoverageResponse>;
  stories: PlanningStory[];
  onRetry?: () => void;
  onOpenStory?: (story: PlanningStory) => void;
  onCreateCoverage?: (input: Record<string, unknown>) => Promise<unknown>;
  onAddStory?: (coverageId: number, storyId: number) => Promise<unknown>;
  onRemoveStory?: (coverageId: number, storyId: number) => Promise<unknown>;
  onCreateStory?: (coverageId: number, title: string) => Promise<unknown>;
};

type CoverageFilter = "all" | "active" | "upcoming" | "past";

function statusTone(status: CoverageItem["status"]): "neutral" | "success" | "warning" | "info" {
  if (status === "active") return "success";
  if (status === "upcoming") return "info";
  if (status === "past" || status === "archived") return "neutral";
  return "warning";
}
function visibleCoverage(item: CoverageItem, filter: CoverageFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return item.status === "active";
  if (filter === "upcoming") return item.status === "upcoming";
  return item.status === "past" || item.status === "archived";
}

function CoverageCard({
  item,
  stories,
  canManage,
  onOpenStory,
  onAddStory,
  onRemoveStory,
  onCreateStory
}: {
  item: CoverageItem;
  stories: PlanningStory[];
  canManage: boolean;
  onOpenStory?: (story: PlanningStory) => void;
  onAddStory?: (coverageId: number, storyId: number) => Promise<unknown>;
  onRemoveStory?: (coverageId: number, storyId: number) => Promise<unknown>;
  onCreateStory?: (coverageId: number, title: string) => Promise<unknown>;
}) {
  const [selectedStory, setSelectedStory] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const linkedIds = new Set((item.stories || []).map((story) => story.id));
  const availableStories = stories.filter((story) => !linkedIds.has(story.id));

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
    } catch (reason) {
      setMessage(reason && typeof reason === "object" && "message" in reason ? String((reason as { message: unknown }).message) : __("Coverage could not be updated.", "weekly-wildcat-headless"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="byline-planning-coverage-card">
      <div className="byline-planning-coverage-heading">
        {item.artwork?.url ? <img src={item.artwork.url} alt={item.artwork.alt || ""} width={item.artwork.width || undefined} height={item.artwork.height || undefined} /> : null}
        <div>
          <h3>{item.title}</h3>
          <p className="byline-planning-muted">/{item.slug}</p>
          <PlanningStatusBadge label={item.status} tone={statusTone(item.status)} />
        </div>
      </div>
      {item.shortDescription ? <p>{item.shortDescription}</p> : null}
      <dl className="byline-planning-coverage-meta">
        <div><dt>{__("Date range", "weekly-wildcat-headless")}</dt><dd><PlanningDateValue value={item.startAt} empty={__("No start", "weekly-wildcat-headless")} />{item.endAt ? <> – <PlanningDateValue value={item.endAt} empty={__("No end", "weekly-wildcat-headless")} /></> : null}</dd></div>
        <div><dt>{__("Stories", "weekly-wildcat-headless")}</dt><dd>{item.storyCount}</dd></div>
        <div><dt>{__("Planned stories", "weekly-wildcat-headless")}</dt><dd>{item.plannedStoryCount}</dd></div>
        <div><dt>{__("Public landing page", "weekly-wildcat-headless")}</dt><dd>{item.publicLandingEnabled ? __("Enabled", "weekly-wildcat-headless") : __("Private", "weekly-wildcat-headless")}</dd></div>
      </dl>
      {item.staff.length ? <p className="byline-planning-coverage-staff">{__("Staff", "weekly-wildcat-headless")}: {item.staff.map((person) => person.name).join(", ")}</p> : null}

      <div className="byline-planning-coverage-stories">
        <h4>{__("Linked stories", "weekly-wildcat-headless")}</h4>
        {item.stories?.length ? (
          <ul>
            {item.stories.map((story) => (
              <li key={story.id}>
                {onOpenStory ? <button type="button" className="byline-planning-link-button" onClick={() => {
                  const full = stories.find((candidate) => candidate.id === story.id);
                  if (full) onOpenStory(full);
                }}>{story.title}</button> : <a href={story.editUrl}>{story.title}</a>}
                {story.isPublished ? <PlanningStatusBadge label={__("Published", "weekly-wildcat-headless")} tone="success" /> : <PlanningStatusBadge label={__("Planned", "weekly-wildcat-headless")} tone="warning" />}
                {canManage && onRemoveStory ? <Button variant="tertiary" isDestructive onClick={() => {
                  if (window.confirm(__("Remove this story from the coverage?", "weekly-wildcat-headless"))) void run(() => onRemoveStory(item.id, story.id), __("Story removed from coverage.", "weekly-wildcat-headless"));
                }}>{__("Remove", "weekly-wildcat-headless")}</Button> : null}
              </li>
            ))}
          </ul>
        ) : <p className="byline-planning-muted">{__("No stories linked yet.", "weekly-wildcat-headless")}</p>}
      </div>

      {canManage && (onAddStory || onCreateStory) ? (
        <div className="byline-planning-coverage-actions">
          {onAddStory ? (
            <div className="byline-planning-inline-action">
              <SelectControl __nextHasNoMarginBottom label={__("Add an existing story", "weekly-wildcat-headless")} value={selectedStory} options={[{ label: __("Choose a story…", "weekly-wildcat-headless"), value: "" }, ...availableStories.map((story) => ({ label: story.title, value: String(story.id) }))]} disabled={!availableStories.length || busy} onChange={setSelectedStory} />
              <Button variant="secondary" disabled={!selectedStory || busy} onClick={() => void run(() => onAddStory(item.id, Number(selectedStory)), __("Story added to coverage.", "weekly-wildcat-headless"))}>{__("Add story", "weekly-wildcat-headless")}</Button>
            </div>
          ) : null}
          {onCreateStory ? (
            <div className="byline-planning-inline-action">
              <TextControl __nextHasNoMarginBottom label={__("Quick-create a story", "weekly-wildcat-headless")} value={newTitle} disabled={busy} onChange={setNewTitle} />
              <Button variant="secondary" disabled={!newTitle.trim() || busy} onClick={() => void run(() => onCreateStory(item.id, newTitle.trim()).then(() => setNewTitle("")), __("Story created for coverage.", "weekly-wildcat-headless"))}>{__("Create story", "weekly-wildcat-headless")}</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <PlanningNotice status={message.includes("could not") ? "error" : "success"}>{message}</PlanningNotice> : null}
    </article>
  );
}

export function Coverage({
  resource,
  stories,
  onRetry,
  onOpenStory,
  onCreateCoverage,
  onAddStory,
  onRemoveStory,
  onCreateStory
}: CoverageProps) {
  const [filter, setFilter] = useState<CoverageFilter>("active");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const data = resource.data;
  const canManage = data?.capabilities?.canManageCoverage !== false;
  const visible = useMemo(() => (data?.coverage || []).filter((item) => visibleCoverage(item, filter)), [data?.coverage, filter]);

  if (!data && !resource.available) return <PlanningUnavailable label={__("Coverage", "weekly-wildcat-headless")} message={resource.error || __("Coverage data is unavailable right now.", "weekly-wildcat-headless")} onRetry={onRetry} />;
  if (!data) return <PlanningEmpty label={__("Coverage", "weekly-wildcat-headless")} instructions={__("No coverage data is available.", "weekly-wildcat-headless")} />;

  const create = async () => {
    if (!onCreateCoverage || !newTitle.trim()) return;
    setCreating(true);
    try {
      await onCreateCoverage({ title: newTitle.trim() });
      setNewTitle("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="byline-planning-coverage" aria-labelledby="byline-planning-coverage-heading">
      <ViewHeader title={__("Coverage", "weekly-wildcat-headless")} description={__("Organize stories around a public-safe coverage identity, without reducing coverage to a free-form tag.", "weekly-wildcat-headless")} />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}
      <div className="byline-planning-filter-grid">
        <SelectControl __nextHasNoMarginBottom label={__("Coverage status", "weekly-wildcat-headless")} value={filter} options={[{ label: __("Active", "weekly-wildcat-headless"), value: "active" }, { label: __("Upcoming", "weekly-wildcat-headless"), value: "upcoming" }, { label: __("Past", "weekly-wildcat-headless"), value: "past" }, { label: __("All", "weekly-wildcat-headless"), value: "all" }]} onChange={(value: string) => setFilter((value as CoverageFilter) || "active")} />
      </div>
      {canManage && onCreateCoverage ? (
        <div className="byline-planning-create-row">
          <TextControl __nextHasNoMarginBottom label={__("New coverage title", "weekly-wildcat-headless")} value={newTitle} onChange={setNewTitle} />
          <Button variant="primary" disabled={!newTitle.trim() || creating} onClick={() => void create()}>{creating ? __("Creating…", "weekly-wildcat-headless") : __("Create coverage", "weekly-wildcat-headless")}</Button>
        </div>
      ) : null}
      {!visible.length ? <PlanningEmpty label={__("Coverage list", "weekly-wildcat-headless")} instructions={data.coverage.length ? __("No coverage matches this status filter.", "weekly-wildcat-headless") : __("Create a coverage package when a group of stories needs a shared identity.", "weekly-wildcat-headless")} /> : (
        <div className="byline-planning-coverage-list">
          {visible.map((item) => <CoverageCard key={item.id} item={item} stories={stories} canManage={canManage} onOpenStory={onOpenStory} onAddStory={onAddStory} onRemoveStory={onRemoveStory} onCreateStory={onCreateStory} />)}
        </div>
      )}
    </section>
  );
}
