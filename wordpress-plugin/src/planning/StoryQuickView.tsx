import { Button, Modal, Notice, SelectControl, Spinner, TextControl } from "@wordpress/components";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";
import { __, sprintf } from "@wordpress/i18n";

import { describeEditorialError } from "../editorial/editorial-model";
import type { PlanningFetchers } from "./planning-api";
import {
  mergeMediaAttachmentIds,
  relativePlanningDate,
  type PlanningPerson,
  type PlanningStory,
  type PlanningWorkflowStatus
} from "./planning-model";
import { normalizeStoryQuickView, type QuickViewTask, type StoryQuickViewData } from "./quick-view-model";
import { PlanningDateValue, PlanningStatusBadge } from "./planning-ui";
import "./story-quick-view.css";

export type StoryQuickViewProps = {
  story: PlanningStory;
  statuses: PlanningWorkflowStatus[];
  fetchers: PlanningFetchers;
  onClose: () => void;
  onMoveStory?: (story: PlanningStory, status: string) => Promise<void> | void;
  onUpdateStory?: (storyId: number, changes: Record<string, unknown>) => Promise<void> | void;
};

const PRIORITY_ORDER: Record<QuickViewTask["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function storyPreviewUrl(story: PlanningStory): string {
  try {
    const editUrl = new URL(story.editUrl, window.location.href);
    const adminRoot = editUrl.pathname.match(/^(.*\/wp-admin)\//)?.[1];
    editUrl.pathname = `${adminRoot || "/wp-admin"}/admin.php`;
    editUrl.search = "";
    editUrl.searchParams.set("page", "byline-article-preview");
    editUrl.searchParams.set("post", String(story.id));
    return editUrl.toString();
  } catch {
    return story.editUrl;
  }
}

function personOptions(people: PlanningPerson[]) {
  return [
    { label: __("Unassigned", "weekly-wildcat-headless"), value: "" },
    ...people.map((person) => ({ label: person.name, value: String(person.id) }))
  ];
}

function wordPressStateLabel(story: PlanningStory): string {
  if (story.wordpressState.isPublished) return __("Published", "weekly-wildcat-headless");
  if (story.wordpressState.isScheduled) return __("Scheduled", "weekly-wildcat-headless");
  return story.wordpressState.label || __("Draft", "weekly-wildcat-headless");
}

function taskLabel(task: QuickViewTask): string {
  const priority = task.priority === "normal" ? "" : ` · ${task.priority}`;
  const due = task.dueAt ? ` · ${relativePlanningDate(task.dueAt)}` : "";
  return `${task.title}${priority}${due}`;
}

function StoryQuickViewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="byline-story-quick-view-section" aria-labelledby={`byline-quick-view-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <h2 id={`byline-quick-view-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{title}</h2>
      {children}
    </section>
  );
}

function QuickViewTasks({ data, story, fetchers, reload }: { data: StoryQuickViewData; story: PlanningStory; fetchers: PlanningFetchers; reload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openTasks = useMemo(
    () => data.tasks.filter((task) => task.state === "open").sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]).slice(0, 8),
    [data.tasks]
  );

  const run = async (id: string, operation: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await operation();
      await reload();
    } catch (reason) {
      setError(describeEditorialError(reason, __("The task could not be updated.", "weekly-wildcat-headless")));
    } finally {
      setBusyId(null);
    }
  };

  const addTask = () => {
    if (!fetchers.createStoryTask || !title.trim()) return;
    void run("new", () => fetchers.createStoryTask!(story.id, {
      title: title.trim(),
      priority: "normal",
      storyId: story.id
    }).then(() => setTitle("")));
  };

  const toggleTask = (task: QuickViewTask) => {
    if (!fetchers.updateTask) return;
    void run(String(task.id), () => fetchers.updateTask!(task.id, { state: task.state === "completed" ? "open" : "completed" }));
  };

  return (
    <>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      <p className="byline-story-quick-view-count">
        {sprintf(/* translators: %d: open task count. */ __("%d open tasks", "weekly-wildcat-headless"), story.openTaskCount)}
      </p>
      {openTasks.length ? (
        <ul className="byline-story-quick-view-task-list">
          {openTasks.map((task) => (
            <li key={String(task.id)}>
              <span>
                <strong>{task.title}</strong>
                <small>{taskLabel(task).slice(task.title.length)}</small>
              </span>
              <Button variant="tertiary" disabled={!data.capabilities.canEditTasks || busyId === String(task.id) || !fetchers.updateTask} onClick={() => toggleTask(task)}>
                {busyId === String(task.id) ? __("Saving…", "weekly-wildcat-headless") : __("Complete", "weekly-wildcat-headless")}
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="byline-planning-muted">{__("No open tasks.", "weekly-wildcat-headless")}</p>}
      {fetchers.createStoryTask ? (
        <div className="byline-story-quick-view-add-task">
          <TextControl __nextHasNoMarginBottom label={__("Add a task", "weekly-wildcat-headless")} value={title} onChange={setTitle} placeholder={__("Next small piece of work", "weekly-wildcat-headless")} disabled={!data.capabilities.canEditTasks || busyId !== null} />
          <Button variant="secondary" disabled={!data.capabilities.canEditTasks || !title.trim() || busyId !== null} onClick={addTask}>{__("Add task", "weekly-wildcat-headless")}</Button>
        </div>
      ) : null}
      {data.tasks.length > openTasks.length && openTasks.length > 0 ? <p className="byline-planning-help">{__("Showing the highest-priority open tasks.", "weekly-wildcat-headless")}</p> : null}
    </>
  );
}

function QuickViewVisual({ data, story, fetchers, reload }: { data: StoryQuickViewData; story: PlanningStory; fetchers: PlanningFetchers; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const media = data.media;

  const update = async (changes: Record<string, unknown>) => {
    if (!fetchers.updateMediaRequest) return;
    setBusy(true);
    setError(null);
    try {
      await fetchers.updateMediaRequest(story.id, changes);
      await reload();
    } catch (reason) {
      setError(describeEditorialError(reason, __("The visual request could not be updated.", "weekly-wildcat-headless")));
    } finally {
      setBusy(false);
    }
  };

  const chooseMedia = () => {
    if (!window.wp?.media || !fetchers.updateMediaRequest || busy) return;
    const frame = window.wp.media({
      title: __("Link WordPress media", "weekly-wildcat-headless"),
      button: { text: __("Link selected media", "weekly-wildcat-headless") },
      multiple: true
    });
    frame.on("select", () => {
      const selection = frame.state().get("selection") as unknown as { toJSON?: () => unknown };
      const selected = typeof selection.toJSON === "function" ? selection.toJSON() : [];
      void update({ attachmentIds: mergeMediaAttachmentIds(media.attachmentIds, selected) });
    });
    frame.open();
  };

  return (
    <>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      <dl className="byline-story-quick-view-meta">
        <div><dt>{__("Request", "weekly-wildcat-headless")}</dt><dd>{media.type} · {media.status}</dd></div>
        <div><dt>{__("Attachments", "weekly-wildcat-headless")}</dt><dd>{media.attachmentIds.length || __("None linked", "weekly-wildcat-headless")}</dd></div>
        <div><dt>{__("Metadata", "weekly-wildcat-headless")}</dt><dd>{media.readiness?.ready ? __("Ready", "weekly-wildcat-headless") : __("Needs review", "weekly-wildcat-headless")}</dd></div>
      </dl>
      {media.label || media.notes ? <p>{media.label || media.notes}</p> : null}
      {media.attachments.length ? (
        <ul className="byline-story-quick-view-media-list">
          {media.attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" width={56} height={42} /> : null}
              <span>{attachment.title || sprintf(/* translators: %d: attachment id. */ __("Media %d", "weekly-wildcat-headless"), attachment.id)}</span>
              {attachment.isImage && media.featuredAttachmentId === attachment.id ? <PlanningStatusBadge label={__("Featured", "weekly-wildcat-headless")} tone="success" /> : null}
              {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer">{__("Preview", "weekly-wildcat-headless")}</a> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {media.readiness && (media.readiness.missingAltIds.length || media.readiness.missingCreditIds.length || media.readiness.missingRightsIds.length) ? (
        <p className="byline-story-quick-view-warning">{__("Linked media still needs alt text, credit, or rights information.", "weekly-wildcat-headless")}</p>
      ) : null}
      <Button variant="secondary" disabled={!data.capabilities.canManageMedia || busy || !fetchers.updateMediaRequest || !window.wp?.media} onClick={chooseMedia}>{__("Link from Media Library", "weekly-wildcat-headless")}</Button>
    </>
  );
}

export function StoryQuickView({ story, statuses, fetchers, onClose, onMoveStory, onUpdateStory }: StoryQuickViewProps) {
  const [data, setData] = useState<StoryQuickViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(story.deadline || "");

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const payload = fetchers.getStoryQuickView ? await fetchers.getStoryQuickView(story.id) : {};
      setData(normalizeStoryQuickView(payload, story));
    } catch (reason) {
      setLoadError(describeEditorialError(reason, __("Story details are unavailable right now.", "weekly-wildcat-headless")));
    } finally {
      setIsLoading(false);
    }
  }, [fetchers, story]);

  useEffect(() => {
    setDeadline(story.deadline || "");
    void load();
  }, [load, story.deadline]);

  const statusesForView = data?.statuses.length ? data.statuses : statuses;
  const editorPeople = data?.editors || [];
  const saveStory = async (changes: Record<string, unknown>, action: string) => {
    if (!onUpdateStory) return;
    setBusyAction(action);
    setActionError(null);
    try {
      await onUpdateStory(story.id, changes);
      await load();
    } catch (reason) {
      setActionError(describeEditorialError(reason, __("The story could not be updated.", "weekly-wildcat-headless")));
    } finally {
      setBusyAction(null);
    }
  };

  const move = (status: string) => {
    if (!onMoveStory || status === story.workflow.id) return;
    setBusyAction("status");
    setActionError(null);
    Promise.resolve(onMoveStory(story, status))
      .then(() => load())
      .catch((reason) => setActionError(describeEditorialError(reason, __("The workflow stage could not be updated.", "weekly-wildcat-headless"))))
      .finally(() => setBusyAction(null));
  };

  const taskData = data || normalizeStoryQuickView({}, story);

  return (
    <Modal title={story.title || __("Story Quick View", "weekly-wildcat-headless")} onRequestClose={onClose} className="byline-story-quick-view-modal">
      <div className="byline-story-quick-view">
        <header className="byline-story-quick-view-header">
          <p className="byline-planning-eyebrow">{__("Story Quick View", "weekly-wildcat-headless")}</p>
          <div className="byline-story-quick-view-header-row">
            <PlanningStatusBadge label={story.workflow.label} tone={story.workflow.id === "ready" ? "info" : "neutral"} />
            <span className="byline-story-quick-view-state">{wordPressStateLabel(story)}</span>
          </div>
          <dl className="byline-story-quick-view-meta">
            <div><dt>{__("Writer", "weekly-wildcat-headless")}</dt><dd>{story.writer?.name || __("Unassigned", "weekly-wildcat-headless")}</dd></div>
            <div><dt>{__("Editor", "weekly-wildcat-headless")}</dt><dd>{story.editor?.name || __("Unassigned", "weekly-wildcat-headless")}</dd></div>
            <div><dt>{__("Deadline", "weekly-wildcat-headless")}</dt><dd><PlanningDateValue value={story.deadline} relative empty={__("No deadline", "weekly-wildcat-headless")} /></dd></div>
            <div><dt>{__("Planned publication", "weekly-wildcat-headless")}</dt><dd><PlanningDateValue value={story.plannedPublication} empty={__("Not planned", "weekly-wildcat-headless")} /></dd></div>
          </dl>
        </header>

        {loadError ? <Notice status="warning" isDismissible={false}>{loadError}<Button variant="link" onClick={() => void load()}>{__("Retry", "weekly-wildcat-headless")}</Button></Notice> : null}
        {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}
        {isLoading ? <div className="byline-story-quick-view-loading"><Spinner /><span>{__("Loading story details…", "weekly-wildcat-headless")}</span></div> : null}

        <StoryQuickViewSection title={__("Actions", "weekly-wildcat-headless")}>
          <div className="byline-story-quick-view-actions">
            <Button variant="primary" href={story.editUrl}>{__("Open article", "weekly-wildcat-headless")}</Button>
            <Button variant="secondary" href={storyPreviewUrl(story)} target="_blank" rel="noreferrer">{__("Preview as Byline", "weekly-wildcat-headless")}</Button>
          </div>
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Move stage", "weekly-wildcat-headless")}
            value={story.workflow.id}
            options={statusesForView.filter((status) => status.selectable && status.group !== "derived").map((status) => ({ label: status.label, value: status.id }))}
            disabled={busyAction !== null || story.wordpressState.isPublished || !taskData.capabilities.changeStatus || !onMoveStory}
            onChange={move}
          />
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Assigned editor", "weekly-wildcat-headless")}
            value={story.editor ? String(story.editor.id) : ""}
            options={personOptions(editorPeople)}
            disabled={busyAction !== null || !taskData.capabilities.assign || !onUpdateStory}
            onChange={(value) => void saveStory({ editorId: value ? Number(value) : 0 }, "editor")}
          />
          <TextControl
            __nextHasNoMarginBottom
            type="date"
            label={__("Deadline", "weekly-wildcat-headless")}
            value={deadline}
            disabled={busyAction !== null || !taskData.capabilities.assign || !taskData.capabilities.changeDeadline || !onUpdateStory}
            onChange={setDeadline}
            onBlur={() => {
              if (deadline !== (story.deadline || "")) void saveStory({ deadline: deadline || null }, "deadline");
            }}
          />
        </StoryQuickViewSection>

        <StoryQuickViewSection title={__("Tasks", "weekly-wildcat-headless")}>
          <QuickViewTasks data={taskData} story={story} fetchers={fetchers} reload={load} />
        </StoryQuickViewSection>

        <StoryQuickViewSection title={__("Visuals", "weekly-wildcat-headless")}>
          <QuickViewVisual data={taskData} story={story} fetchers={fetchers} reload={load} />
        </StoryQuickViewSection>

        <StoryQuickViewSection title={__("Readiness", "weekly-wildcat-headless")}>
          {taskData.readiness ? (
            <div className="byline-story-quick-view-readiness" aria-label={__("Readiness summary", "weekly-wildcat-headless")}>
              <PlanningStatusBadge label={`${taskData.readiness.errors} ${__("errors", "weekly-wildcat-headless")}`} tone={taskData.readiness.errors ? "error" : "success"} />
              <PlanningStatusBadge label={`${taskData.readiness.warnings} ${__("warnings", "weekly-wildcat-headless")}`} tone={taskData.readiness.warnings ? "warning" : "success"} />
              <PlanningStatusBadge label={`${taskData.readiness.passed} ${__("passed", "weekly-wildcat-headless")}`} tone="success" />
            </div>
          ) : <p className="byline-planning-muted">{__("Readiness is not available in this install.", "weekly-wildcat-headless")}</p>}
        </StoryQuickViewSection>

        <StoryQuickViewSection title={__("Discussion", "weekly-wildcat-headless")}>
          {taskData.discord.threadUrl ? <a href={taskData.discord.threadUrl} target="_blank" rel="noreferrer">{__("Open Discord thread", "weekly-wildcat-headless")}</a> : <p>{taskData.discord.configured ? __("Discord is connected, but this story has no linked thread yet.", "weekly-wildcat-headless") : __("Discord is not configured. The story remains usable without it.", "weekly-wildcat-headless")}</p>}
        </StoryQuickViewSection>

        <StoryQuickViewSection title={__("Recent activity", "weekly-wildcat-headless")}>
          {taskData.activity.length ? (
            <ul className="byline-story-quick-view-activity">
              {taskData.activity.slice(0, 8).map((item) => <li key={String(item.id)}><span>{item.summary}</span><small>{item.actor?.name ? `${item.actor.name} · ` : ""}{item.occurredAt}</small></li>)}
            </ul>
          ) : <p className="byline-planning-muted">{__("No recent story activity.", "weekly-wildcat-headless")}</p>}
        </StoryQuickViewSection>

        {taskData.correctionsCount > 0 ? <p className="byline-story-quick-view-footnote">{sprintf(/* translators: %d: correction count. */ __("%d public correction records are attached to this story.", "weekly-wildcat-headless"), taskData.correctionsCount)}</p> : null}
      </div>
    </Modal>
  );
}
