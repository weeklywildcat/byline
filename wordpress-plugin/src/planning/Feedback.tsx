import { Button, SelectControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import {
  exactPlanningDate,
  type FeedbackItem,
  type FeedbackResponse,
  type FeedbackStatus,
  type OptionalResource
} from "./planning-model";
import { PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, ViewHeader } from "./planning-ui";

export type FeedbackProps = {
  resource: OptionalResource<FeedbackResponse>;
  onRetry?: () => void;
  onUpdateStatus?: (feedbackId: number, status: FeedbackStatus) => Promise<unknown>;
  onCreateCorrection?: (feedbackId: number, input?: { text?: string; type?: string }) => Promise<unknown>;
  onOpenStory?: (storyId: number) => void;
};

const STATUS_OPTIONS: Array<{ value: FeedbackStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" }
];

function statusTone(status: FeedbackStatus): "neutral" | "success" | "warning" | "error" {
  if (status === "new") return "warning";
  if (status === "reviewed") return "neutral";
  if (status === "closed") return "success";
  return "error";
}

function FeedbackCard({
  item,
  onUpdateStatus,
  onCreateCorrection,
  onOpenStory
}: {
  item: FeedbackItem;
  onUpdateStatus?: (feedbackId: number, status: FeedbackStatus) => Promise<unknown>;
  onCreateCorrection?: (feedbackId: number, input?: { text?: string; type?: string }) => Promise<unknown>;
  onOpenStory?: (storyId: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const runStatus = async (status: FeedbackStatus) => {
    if (!onUpdateStatus) return;
    setBusy(true);
    setMessage(null);
    try {
      await onUpdateStatus(item.id, status);
      setMessage(__("Feedback status updated.", "weekly-wildcat-headless"));
    } catch (reason) {
      setMessage(reason && typeof reason === "object" && "message" in reason ? String((reason as { message: unknown }).message) : __("Feedback status could not be updated.", "weekly-wildcat-headless"));
    } finally {
      setBusy(false);
    }
  };

  const convertToCorrection = async () => {
    if (!onCreateCorrection) return;
    setBusy(true);
    setMessage(null);
    try {
      await onCreateCorrection(item.id, { text: item.message, type: "correction" });
      setMessage(__("Draft correction created. Review it before publishing.", "weekly-wildcat-headless"));
    } catch (reason) {
      setMessage(reason && typeof reason === "object" && "message" in reason ? String((reason as { message: unknown }).message) : __("A draft correction could not be created.", "weekly-wildcat-headless"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="byline-planning-feedback-card" aria-busy={busy}>
      <div className="byline-planning-feedback-heading">
        <div>
          <p className="byline-planning-feedback-type">{item.type}</p>
          <time dateTime={item.createdAt} title={exactPlanningDate(item.createdAt)}>{exactPlanningDate(item.createdAt) || __("Unknown date", "weekly-wildcat-headless")}</time>
        </div>
        <PlanningStatusBadge label={STATUS_OPTIONS.find((status) => status.value === item.status)?.label || item.status} tone={statusTone(item.status)} />
      </div>
      <p className="byline-planning-feedback-message">{item.message}</p>
      {item.name || item.email ? <p className="byline-planning-feedback-contact">{item.name || __("Reader", "weekly-wildcat-headless")}{item.email ? <> · <a href={`mailto:${encodeURIComponent(item.email)}`}>{item.email}</a></> : null}</p> : null}
      {item.story ? (
        <p className="byline-planning-feedback-story">
          {onOpenStory ? <button type="button" className="byline-planning-link-button" onClick={() => onOpenStory(item.story!.id)}>{item.story.title}</button> : <a href={item.story.editUrl || item.story.url}>{item.story.title}</a>}
        </p>
      ) : <p className="byline-planning-muted">{__("Not linked to a story", "weekly-wildcat-headless")}</p>}
      <div className="byline-planning-feedback-actions">
        <SelectControl __nextHasNoMarginBottom label={__("Feedback status", "weekly-wildcat-headless")} hideLabelFromVision value={item.status} options={STATUS_OPTIONS} disabled={!onUpdateStatus || busy} onChange={(value: string) => void runStatus(value as FeedbackStatus)} />
        {item.type === "correction" && item.story && onCreateCorrection ? <Button variant="secondary" disabled={busy} onClick={() => void convertToCorrection()}>{__("Create draft correction", "weekly-wildcat-headless")}</Button> : null}
      </div>
      {message ? <PlanningNotice status={message.includes("could not") ? "error" : "success"}>{message}</PlanningNotice> : null}
    </article>
  );
}

export function Feedback({ resource, onRetry, onUpdateStatus, onCreateCorrection, onOpenStory }: FeedbackProps) {
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const data = resource.data;
  const visible = useMemo(() => (data?.feedback || []).filter((item) => filter === "all" || item.status === filter), [data?.feedback, filter]);

  if (!data && !resource.available) return <PlanningUnavailable label={__("Feedback", "weekly-wildcat-headless")} message={resource.error || __("Reader feedback is unavailable right now.", "weekly-wildcat-headless")} onRetry={onRetry} />;
  if (!data) return <PlanningEmpty label={__("Feedback", "weekly-wildcat-headless")} instructions={__("No reader feedback data is available.", "weekly-wildcat-headless")} />;

  return (
    <section className="byline-planning-feedback" aria-labelledby="byline-planning-feedback-heading">
      <ViewHeader title={__("Feedback", "weekly-wildcat-headless")} description={__("Review reader notes privately. Converting feedback creates a draft correction for an editor to verify; it never publishes reader wording automatically.", "weekly-wildcat-headless")} />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}
      <div className="byline-planning-filter-grid">
        <SelectControl __nextHasNoMarginBottom label={__("Feedback status", "weekly-wildcat-headless")} value={filter} options={[{ label: __("New", "weekly-wildcat-headless"), value: "new" }, ...STATUS_OPTIONS.filter((status) => status.value !== "new"), { label: __("All feedback", "weekly-wildcat-headless"), value: "all" }]} onChange={(value: string) => setFilter(value as FeedbackStatus | "all")} />
      </div>
      {!visible.length ? <PlanningEmpty label={__("Feedback queue", "weekly-wildcat-headless")} instructions={data.feedback.length ? __("No feedback matches this status filter.", "weekly-wildcat-headless") : __("No reader feedback has been submitted.", "weekly-wildcat-headless")} /> : (
        <div className="byline-planning-feedback-list">
          {visible.map((item) => <FeedbackCard key={item.id} item={item} onUpdateStatus={onUpdateStatus} onCreateCorrection={onCreateCorrection} onOpenStory={onOpenStory} />)}
        </div>
      )}
    </section>
  );
}
