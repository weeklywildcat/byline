import { Button, Notice, SelectControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import type { ContentHealthIssue, ContentHealthResponse, ContentHealthSeverity, OptionalResource } from "./planning-model";
import { PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, ViewHeader } from "./planning-ui";

export type ContentHealthProps = {
  resource: OptionalResource<ContentHealthResponse>;
  onRetry?: () => void;
  onRecheck?: (issueId?: string) => Promise<unknown> | void;
};

const severityOptions = [
  { label: __("All severities", "weekly-wildcat-headless"), value: "all" },
  { label: __("Errors", "weekly-wildcat-headless"), value: "error" },
  { label: __("Warnings", "weekly-wildcat-headless"), value: "warning" },
  { label: __("Info", "weekly-wildcat-headless"), value: "info" }
] as const;

function severityTone(severity: ContentHealthSeverity): "error" | "warning" | "info" {
  return severity;
}

function issueLabel(issue: ContentHealthIssue): string {
  return issue.problem.trim() || issue.type || __("Content issue", "weekly-wildcat-headless");
}

export function ContentHealth({ resource, onRetry, onRecheck }: ContentHealthProps) {
  const [severity, setSeverity] = useState<ContentHealthSeverity | "all">("all");
  const [type, setType] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = resource.data;
  const types = useMemo(() => Array.from(new Set((data?.issues || []).map((issue) => issue.type).filter(Boolean))).sort(), [data?.issues]);
  const issues = useMemo(
    () => (data?.issues || []).filter((issue) => (severity === "all" || issue.severity === severity) && (type === "all" || issue.type === type)),
    [data?.issues, severity, type]
  );

  const recheck = (issueId?: string) => {
    if (!onRecheck) return;
    setBusyId(issueId || "all");
    setActionError(null);
    void Promise.resolve(onRecheck(issueId))
      .catch((error: unknown) => setActionError(error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : __("The health check could not be started.", "weekly-wildcat-headless")))
      .finally(() => setBusyId(null));
  };

  if (!data && !resource.available) {
    return (
      <PlanningUnavailable
        label={__("Content Health", "weekly-wildcat-headless")}
        message={resource.error || __("Content Health is unavailable right now.", "weekly-wildcat-headless")}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return <PlanningEmpty label={__("Content Health", "weekly-wildcat-headless")} instructions={__("No content health data is available yet.", "weekly-wildcat-headless")} />;
  }

  return (
    <section className="byline-planning-content-health" aria-labelledby="byline-planning-content-health-heading">
      <ViewHeader
        title={__("Content Health", "weekly-wildcat-headless")}
        description={__("Review cached content checks and fix editorial problems without crawling remote sites during page render.", "weekly-wildcat-headless")}
        actions={<Button variant="secondary" onClick={() => recheck()} disabled={!onRecheck || busyId !== null}>{busyId === "all" ? __("Checking…", "weekly-wildcat-headless") : __("Run checks", "weekly-wildcat-headless")}</Button>}
      />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}
      {!data.scannerAvailable ? <Notice status="info" isDismissible={false}>{__("The background scanner is not available. Cached results may be stale; editorial publishing remains independent of Content Health.", "weekly-wildcat-headless")}</Notice> : null}
      {actionError ? <PlanningNotice>{actionError}</PlanningNotice> : null}
      <div className="byline-planning-filter-grid">
        <SelectControl __nextHasNoMarginBottom label={__("Severity", "weekly-wildcat-headless")} value={severity} options={severityOptions as unknown as Array<{ label: string; value: string }>} onChange={(value: string) => setSeverity(value as ContentHealthSeverity | "all")} />
        <SelectControl __nextHasNoMarginBottom label={__("Issue type", "weekly-wildcat-headless")} value={type} options={[{ label: __("All issue types", "weekly-wildcat-headless"), value: "all" }, ...types.map((item) => ({ label: item, value: item }))]} onChange={setType} />
      </div>
      {data.lastRunAt ? <p className="byline-planning-help">{__("Last checked", "weekly-wildcat-headless")} <time dateTime={data.lastRunAt}>{new Date(data.lastRunAt).toLocaleString()}</time></p> : null}
      {!issues.length ? <PlanningEmpty label={__("Content health issues", "weekly-wildcat-headless")} instructions={data.issues.length ? __("No issues match these filters.", "weekly-wildcat-headless") : __("No cached content health issues were returned.", "weekly-wildcat-headless")} /> : (
        <ul className="byline-planning-health-list" aria-label={__("Content health issues", "weekly-wildcat-headless")}>
          {issues.map((issue) => (
            <li className={`byline-planning-health-item byline-planning-health-item-${issue.severity}`} key={issue.id}>
              <PlanningStatusBadge label={issue.severity} tone={severityTone(issue.severity)} />
              <div className="byline-planning-health-copy">
                <strong>{issueLabel(issue)}</strong>
                {issue.story ? <a href={issue.story.editUrl}>{issue.story.title}</a> : null}
                {issue.lastCheckedAt ? <time dateTime={issue.lastCheckedAt}>{new Date(issue.lastCheckedAt).toLocaleString()}</time> : null}
              </div>
              <div className="byline-planning-inline-actions">
                {issue.fixUrl ? <Button variant="secondary" href={issue.fixUrl}>{__("Fix", "weekly-wildcat-headless")}</Button> : null}
                {onRecheck ? <Button variant="tertiary" disabled={busyId !== null} onClick={() => recheck(issue.id)}>{busyId === issue.id ? __("Checking…", "weekly-wildcat-headless") : __("Recheck", "weekly-wildcat-headless")}</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
