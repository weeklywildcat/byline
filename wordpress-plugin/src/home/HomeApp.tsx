import { Button, Card, CardBody, Notice, Spinner } from "@wordpress/components";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import { normalizeBylineError } from "@byline/admin-runtime";

import {
  exactPlanningDate,
  relativePlanningDate,
  type PlanningStory
} from "../planning/planning-model";
import type { HomeFetchers } from "./home-api";
import { PresetsPanel } from "./PresetsPanel";
import {
  doctorHealthStatus,
  homeAttentionItems,
  homeComingUp,
  homeFailureMessage,
  homeRecentlyPublished,
  homeYourStories,
  type HomeActivityRecord,
  type HomeData,
  type HomeAttentionSeverity,
  type HomeHealthStatus,
  type HomeResourceState
} from "./home-model";

export type HomeAppProps = {
  fetchers: HomeFetchers;
  currentUserId?: number | null;
  actionUrls?: {
    dashboard?: string;
    planning?: string;
    contentHealth?: string;
    feedback?: string;
    deployment?: string;
    doctor?: string;
  };
};

function emptyResource<T>(available = false): HomeResourceState<T> {
  return { data: null, error: null, available };
}

function emptyData(fetchers: HomeFetchers): HomeData {
  return {
    planning: emptyResource(Boolean(fetchers.getPlanning)),
    health: emptyResource(Boolean(fetchers.getHealth)),
    contentHealth: emptyResource(Boolean(fetchers.getContentHealth)),
    feedback: emptyResource(Boolean(fetchers.getFeedback)),
    deployment: emptyResource(Boolean(fetchers.getDeployment)),
    activity: emptyResource(Boolean(fetchers.getActivity))
  };
}

/** One safe error boundary, shared with every other Byline admin surface. */
function requestError(error: unknown, fallback: string): string {
  return normalizeBylineError(error, { message: fallback }).message;
}

async function loadResource<T>(fetcher: (() => Promise<T>) | undefined, label: string): Promise<HomeResourceState<T>> {
  if (!fetcher) return emptyResource(false);
  try {
    return { data: await fetcher(), error: null, available: true };
  } catch (error) {
    return { data: null, error: requestError(error, `${label} could not be loaded.`), available: true };
  }
}

function StatusMark({ status }: { status: HomeHealthStatus | HomeAttentionSeverity | "info" }) {
  const label = status === "critical" ? "Needs attention" : status === "recommended" || status === "warning" ? "Recommended" : status === "good" ? "Good" : "Info";
  return <span className={`byline-home-status-mark byline-home-status-${status}`} aria-label={label}>{status === "critical" || status === "recommended" || status === "warning" ? "!" : status === "good" ? "✓" : "•"}</span>;
}

function StoryLink({ story, showDate = false }: { story: PlanningStory; showDate?: boolean }) {
  const date = story.deadline ? relativePlanningDate(story.deadline) : "";
  return (
    <li className="byline-home-story-item">
      <a href={story.editUrl || undefined}>{story.title || __("Untitled story", "weekly-wildcat-headless")}</a>
      <span className="byline-home-story-meta">
        {story.workflow.label}
        {showDate && date ? ` · ${date}` : ""}
        {showDate && story.deadline ? <span className="byline-home-sr-only">{` (${exactPlanningDate(story.deadline)})`}</span> : null}
      </span>
    </li>
  );
}

function EmptyList({ children }: { children: string }) {
  return <p className="byline-home-muted">{children}</p>;
}

function activityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || __("Unknown time", "weekly-wildcat-headless");
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ActivityList({ records }: { records: HomeActivityRecord[] }) {
  if (!records.length) return <EmptyList>{__("No newsroom activity has been recorded yet.", "weekly-wildcat-headless")}</EmptyList>;
  return (
    <ul className="byline-home-activity-list">
      {records.slice(0, 12).map((item) => (
        <li key={String(item.id)}>
          <span className="byline-home-activity-mark" aria-hidden="true">•</span>
          <div>
            <strong>{item.summary}</strong>
            <small>
              {item.story?.title ? `${item.story.title} · ` : ""}
              {item.actor?.name ? `${item.actor.name} · ` : ""}
              <time dateTime={item.occurredAt}>{activityTime(item.occurredAt)}</time>
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}

function FailureList({ data, actionUrls }: { data: HomeData; actionUrls: HomeAppProps["actionUrls"] }) {
  const failures = [
    { resource: data.contentHealth, label: __("Content Health", "weekly-wildcat-headless"), href: actionUrls?.contentHealth },
    { resource: data.feedback, label: __("Reader feedback", "weekly-wildcat-headless"), href: actionUrls?.feedback },
    { resource: data.deployment, label: __("Website publishing", "weekly-wildcat-headless"), href: actionUrls?.deployment },
    { resource: data.health, label: __("Byline checks", "weekly-wildcat-headless"), href: actionUrls?.doctor },
    { resource: data.activity, label: __("Newsroom activity", "weekly-wildcat-headless"), href: actionUrls?.dashboard }
  ].filter((item) => item.resource.error);

  if (!failures.length) return null;
  return (
    <section className="byline-home-failures" aria-labelledby="byline-home-failures-heading">
      <h2 id="byline-home-failures-heading">{__("Some services need attention", "weekly-wildcat-headless")}</h2>
      {failures.map((failure) => (
        <Notice key={failure.label} status="warning" isDismissible={false}>
          <strong>{failure.label}</strong>{" "}{homeFailureMessage(failure.resource, failure.label)}
          {failure.href ? <>{" "}<a href={failure.href}>{__("Open", "weekly-wildcat-headless")}</a></> : null}
        </Notice>
      ))}
    </section>
  );
}

function AttentionList({ data, actionUrls, onRetryDeployment, retrying }: { data: HomeData; actionUrls: HomeAppProps["actionUrls"]; onRetryDeployment?: () => void; retrying?: boolean }) {
  const items = useMemo(() => homeAttentionItems(data), [data]);
  if (!items.length) {
    return (
      <div className="byline-home-all-clear" role="status">
        <StatusMark status="good" />
        <div>
          <strong>{__("Everything is on track", "weekly-wildcat-headless")}</strong>
          <p>{__("No overdue stories, review requests, or integration failures were found in your view.", "weekly-wildcat-headless")}</p>
        </div>
      </div>
    );
  }

  const hrefFor = (item: (typeof items)[number]) => item.href || (item.source === "deployment" ? actionUrls?.deployment : item.source === "content-health" ? actionUrls?.contentHealth : item.source === "feedback" ? actionUrls?.feedback : item.source === "health" ? actionUrls?.doctor : undefined);
  return (
    <ul className="byline-home-attention-list">
      {items.map((item) => {
        const href = hrefFor(item);
        return (
          <li key={item.id}>
            <StatusMark status={item.severity} />
            <span className="byline-home-attention-copy">
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            {item.id === "deployment-failed" && onRetryDeployment ? (
              <Button variant="link" isBusy={retrying} disabled={retrying} onClick={onRetryDeployment}>{retrying ? __("Retrying…", "weekly-wildcat-headless") : __("Retry", "weekly-wildcat-headless")}</Button>
            ) : href ? <a href={href}>{__("Open", "weekly-wildcat-headless")}</a> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="byline-home-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function HomeStatus({ status, doctorUrl }: { status: ReturnType<typeof doctorHealthStatus>; doctorUrl?: string }) {
  const text = status === "good"
    ? __("Everything looks good", "weekly-wildcat-headless")
    : status === "critical"
      ? __("Byline needs attention", "weekly-wildcat-headless")
      : status === "recommended"
        ? __("A few setup checks need review", "weekly-wildcat-headless")
        : __("Byline checks are unavailable", "weekly-wildcat-headless");
  return (
    <div className="byline-home-health-summary">
      <StatusMark status={status === "unknown" ? "info" : status} />
      <div>
        <strong>{text}</strong>
        {doctorUrl ? <a href={doctorUrl}>{__("Open Byline Doctor", "weekly-wildcat-headless")}</a> : null}
      </div>
    </div>
  );
}

export function HomeApp({ fetchers, currentUserId, actionUrls }: HomeAppProps) {
  const [data, setData] = useState<HomeData>(() => emptyData(fetchers));
  const [loading, setLoading] = useState(true);
  const [retryingDeployment, setRetryingDeployment] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [planning, health, contentHealth, feedback, deployment, activity] = await Promise.all([
      loadResource(fetchers.getPlanning, "Stories"),
      loadResource(fetchers.getHealth, "Byline checks"),
      loadResource(fetchers.getContentHealth, "Content Health"),
      loadResource(fetchers.getFeedback, "Reader feedback"),
      loadResource(fetchers.getDeployment, "Website publishing"),
      loadResource(fetchers.getActivity, "Newsroom activity")
    ]);
    setData({ planning, health, contentHealth, feedback, deployment, activity });
    if (planning.error) setLoadError(planning.error);
    setLoading(false);
  }, [fetchers]);

  useEffect(() => {
    void load();
  }, [load]);

  const retryDeployment = useCallback(async () => {
    if (!fetchers.retryDeployment || retryingDeployment) return;
    setRetryingDeployment(true);
    try {
      const deployment = await fetchers.retryDeployment();
      setData((current) => ({ ...current, deployment: { data: deployment, error: null, available: true } }));
      setLoadError(null);
    } catch (error) {
      const message = requestError(error, "Website publishing could not be retried.");
      setData((current) => ({ ...current, deployment: { data: null, error: message, available: true } }));
      setLoadError(message);
    } finally {
      setRetryingDeployment(false);
    }
  }, [fetchers.retryDeployment, retryingDeployment]);

  const stories = data.planning.data?.stories || [];
  const resolvedUserId = currentUserId ?? data.planning.data?.currentUser?.id ?? null;
  const comingUp = useMemo(() => homeComingUp(stories), [stories]);
  const yourStories = useMemo(() => homeYourStories(stories, resolvedUserId), [resolvedUserId, stories]);
  const recentlyPublished = useMemo(() => homeRecentlyPublished(stories), [stories]);
  const healthStatus = doctorHealthStatus(data.health.data);

  return (
    <div className="byline-home-app">
      <header className="byline-home-header">
        <div>
          <p className="byline-home-eyebrow">{__("Newsroom workspace", "weekly-wildcat-headless")}</p>
          <h1>{__("Today", "weekly-wildcat-headless")}</h1>
          <p>{__("The next useful thing to do, at a glance.", "weekly-wildcat-headless")}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? __("Refreshing…", "weekly-wildcat-headless") : __("Refresh", "weekly-wildcat-headless")}</Button>
      </header>

      {loadError && !data.planning.data ? <Notice status="warning" isDismissible={false}>{__("Stories are temporarily unavailable. Other Byline checks are still shown below.", "weekly-wildcat-headless")}{" "}<Button variant="link" onClick={() => void load()}>{__("Try again", "weekly-wildcat-headless")}</Button></Notice> : null}

      {!data.planning.available ? <Notice status="info" isDismissible={false}>{__("Story work is not available for this role. Byline checks and integrations you can access are shown below.", "weekly-wildcat-headless")}</Notice> : null}

      <section className="byline-home-primary-grid">
        <Card className="byline-home-attention-card">
          <CardBody>
            <div className="byline-home-section-heading">
              <div>
                <p className="byline-home-eyebrow">{__("Prioritized for you", "weekly-wildcat-headless")}</p>
                <h2>{__("Needs your attention", "weekly-wildcat-headless")}</h2>
              </div>
              {loading ? <Spinner /> : null}
            </div>
            <AttentionList data={data} actionUrls={actionUrls} onRetryDeployment={fetchers.retryDeployment ? () => void retryDeployment() : undefined} retrying={retryingDeployment} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="byline-home-eyebrow">{__("System", "weekly-wildcat-headless")}</p>
            <h2>{__("Byline status", "weekly-wildcat-headless")}</h2>
            <HomeStatus status={healthStatus} doctorUrl={actionUrls?.doctor} />
            {data.deployment.data?.pending ? <p className="byline-home-muted">{__("Website update is queued.", "weekly-wildcat-headless")}</p> : null}
          </CardBody>
        </Card>
      </section>

      <section className="byline-home-section" aria-labelledby="byline-home-coming-up-heading">
        <div className="byline-home-section-heading">
          <div>
            <p className="byline-home-eyebrow">{__("Plan ahead", "weekly-wildcat-headless")}</p>
            <h2 id="byline-home-coming-up-heading">{__("Coming up", "weekly-wildcat-headless")}</h2>
          </div>
          {actionUrls?.planning ? <a href={actionUrls.planning}>{__("Open Stories", "weekly-wildcat-headless")}</a> : null}
        </div>
        {data.planning.available ? (
          <div className="byline-home-metrics">
            <Metric value={comingUp.dueToday} label={__("stories due today", "weekly-wildcat-headless")} />
            <Metric value={comingUp.scheduledToday} label={__("posts scheduled today", "weekly-wildcat-headless")} />
            <Metric value={comingUp.plannedSoon} label={__("planned this week", "weekly-wildcat-headless")} />
          </div>
        ) : <p className="byline-home-muted">{__("Story planning is unavailable for this role.", "weekly-wildcat-headless")}</p>}
      </section>

      <section className="byline-home-lists-grid">
        <Card>
          <CardBody>
            <div className="byline-home-section-heading"><h2>{__("Your work", "weekly-wildcat-headless")}</h2>{actionUrls?.planning ? <a href={actionUrls.planning}>{__("View all", "weekly-wildcat-headless")}</a> : null}</div>
            {data.planning.available ? (yourStories.length ? <ul className="byline-home-story-list">{yourStories.map((story) => <StoryLink key={story.id} story={story} showDate />)}</ul> : <EmptyList>{resolvedUserId ? __("No assigned stories are visible yet.", "weekly-wildcat-headless") : __("Your assigned stories will appear here.", "weekly-wildcat-headless")}</EmptyList>) : <EmptyList>{__("Story work is not available for this role.", "weekly-wildcat-headless")}</EmptyList>}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="byline-home-section-heading"><h2>{__("Recently published", "weekly-wildcat-headless")}</h2>{actionUrls?.planning ? <a href={actionUrls.planning}>{__("Open Stories", "weekly-wildcat-headless")}</a> : null}</div>
            {data.planning.available ? (recentlyPublished.length ? <ul className="byline-home-story-list">{recentlyPublished.map((story) => <StoryLink key={story.id} story={story} />)}</ul> : <EmptyList>{__("No recently published stories are visible yet.", "weekly-wildcat-headless")}</EmptyList>) : <EmptyList>{__("Story work is not available for this role.", "weekly-wildcat-headless")}</EmptyList>}
          </CardBody>
        </Card>
      </section>

      {data.activity.available ? (
        <section className="byline-home-section" aria-labelledby="byline-home-activity-heading">
          <Card>
            <CardBody>
              <div className="byline-home-section-heading">
                <div>
                  <p className="byline-home-eyebrow">{__("What happened", "weekly-wildcat-headless")}</p>
                  <h2 id="byline-home-activity-heading">{__("Recent newsroom activity", "weekly-wildcat-headless")}</h2>
                </div>
              </div>
              {data.activity.error ? <Notice status="warning" isDismissible={false}>{data.activity.error}{" "}<Button variant="link" onClick={() => void load()}>{__("Try again", "weekly-wildcat-headless")}</Button></Notice> : <ActivityList records={data.activity.data?.activity || data.activity.data?.items || []} />}
            </CardBody>
          </Card>
        </section>
      ) : null}

      {fetchers.getPresets ? <PresetsPanel fetchers={fetchers} canEdit={Boolean(actionUrls?.dashboard)} /> : null}

      <FailureList data={data} actionUrls={actionUrls} />
      <p className="byline-home-status-line" role="status" aria-live="polite">
        {loading ? __("Refreshing newsroom data…", "weekly-wildcat-headless") : data.planning.error ? __("Home is showing available checks while Stories reconnects.", "weekly-wildcat-headless") : __("Home is up to date.", "weekly-wildcat-headless")}
      </p>
    </div>
  );
}
