import { Button, Notice } from "@wordpress/components";
import { __ } from "@wordpress/i18n";

import type { OptionalResource, PerformanceMetric, PerformanceResponse } from "./planning-model";
import { PlanningEmpty, PlanningNotice, PlanningStatusBadge, PlanningUnavailable, ViewHeader } from "./planning-ui";

export type PerformanceProps = {
  resource: OptionalResource<PerformanceResponse>;
  onRetry?: () => void;
};

function metricValue(metric: PerformanceMetric): string {
  if (!metric.supported) return __("Unavailable from this provider", "weekly-wildcat-headless");
  if (metric.formatted) return metric.formatted;
  if (metric.value === null || metric.value === undefined || metric.value === "") return __("No data yet", "weekly-wildcat-headless");
  return String(metric.value);
}

function metricTone(metric: PerformanceMetric): "neutral" | "success" | "warning" {
  if (!metric.supported) return "warning";
  return metric.value === null || metric.value === undefined ? "warning" : "success";
}

export function Performance({ resource, onRetry }: PerformanceProps) {
  const data = resource.data;

  if (!data && !resource.available) {
    return (
      <PlanningUnavailable
        label={__("Performance", "weekly-wildcat-headless")}
        message={resource.error || __("Performance data is unavailable right now.", "weekly-wildcat-headless")}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return <PlanningEmpty label={__("Performance", "weekly-wildcat-headless")} instructions={__("No performance data is available yet.", "weekly-wildcat-headless")} />;
  }

  const supportedMetrics = data.metrics.filter((metric) => metric.supported);

  return (
    <section className="byline-planning-performance" aria-labelledby="byline-planning-performance-heading">
      <ViewHeader
        title={__("Performance", "weekly-wildcat-headless")}
        description={__("Use the configured analytics provider to spot stories taking off and decide what deserves editorial attention.", "weekly-wildcat-headless")}
        actions={onRetry ? <Button variant="secondary" onClick={onRetry}>{__("Refresh", "weekly-wildcat-headless")}</Button> : undefined}
      />
      {resource.error ? <PlanningNotice status="warning">{resource.error}</PlanningNotice> : null}

      {!data.provider?.configured ? (
        <Notice status="info" isDismissible={false}>
          {__("No analytics provider is configured. Configure one in Byline Integrations to see supported newsroom metrics; editorial work remains available.", "weekly-wildcat-headless")}
        </Notice>
      ) : (
        <p className="byline-planning-provider-line">
          <PlanningStatusBadge label={data.provider.label} tone="success" />
          <span>{__("Provider connected; only metrics supplied by it are shown.", "weekly-wildcat-headless")}</span>
        </p>
      )}

      {supportedMetrics.length ? (
        <div className="byline-planning-metric-grid" aria-label={__("Supported performance metrics", "weekly-wildcat-headless")}>
          {supportedMetrics.map((metric) => (
            <article className="byline-planning-metric-card" key={metric.id}>
              <span className="byline-planning-metric-label">{metric.label}</span>
              <strong>{metricValue(metric)}</strong>
              {metric.description ? <p>{metric.description}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <PlanningEmpty label={__("Supported metrics", "weekly-wildcat-headless")} instructions={__("This provider has not returned any supported metrics for the selected range.", "weekly-wildcat-headless")} />
      )}

      {data.topStories?.length ? (
        <section className="byline-planning-performance-section" aria-labelledby="byline-planning-top-stories-heading">
          <h3 id="byline-planning-top-stories-heading">{__("Top stories", "weekly-wildcat-headless")}</h3>
          <ol className="byline-planning-performance-list">
            {data.topStories.map((entry) => (
              <li key={entry.story.id}>
                <a href={entry.story.editUrl}>{entry.story.title}</a>
                {typeof entry.views === "number" ? <span>{entry.views.toLocaleString()} {__("views", "weekly-wildcat-headless")}</span> : null}
                {typeof entry.trend === "number" ? <span className={entry.trend >= 0 ? "byline-planning-trend-up" : "byline-planning-trend-down"}>{entry.trend >= 0 ? "↑" : "↓"} {Math.abs(entry.trend)}%</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {data.sources?.length ? (
        <section className="byline-planning-performance-section" aria-labelledby="byline-planning-sources-heading">
          <h3 id="byline-planning-sources-heading">{__("Top sources", "weekly-wildcat-headless")}</h3>
          <ul className="byline-planning-source-list">
            {data.sources.map((source) => (
              <li key={source.label}>
                <span>{source.label}</span>
                <span>{source.value.toLocaleString()}{typeof source.percentage === "number" ? ` · ${source.percentage}%` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.newsletter?.length ? (
        <section className="byline-planning-performance-section" aria-labelledby="byline-planning-newsletter-performance-heading">
          <h3 id="byline-planning-newsletter-performance-heading">{__("Newsletter performance", "weekly-wildcat-headless")}</h3>
          <ul className="byline-planning-inline-list">
            {data.newsletter.map((metric) => (
              <li key={metric.label}>
                <span>{metric.label}</span>
                <span>{metric.supported ? String(metric.value ?? __("No data", "weekly-wildcat-headless")) : __("Unavailable", "weekly-wildcat-headless")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.searchGaps?.length ? (
        <section className="byline-planning-performance-section" aria-labelledby="byline-planning-search-gaps-heading">
          <h3 id="byline-planning-search-gaps-heading">{__("Search gaps", "weekly-wildcat-headless")}</h3>
          <p>{__("Aggregated zero-result searches can guide coverage. No reader identifiers are shown here.", "weekly-wildcat-headless")}</p>
          <ul className="byline-planning-inline-list">
            {data.searchGaps.map((gap) => <li key={gap.query}><span>{gap.query}</span><span>{gap.count.toLocaleString()}</span></li>)}
          </ul>
        </section>
      ) : null}

      {data.metrics.some((metric) => metricTone(metric) === "warning") ? (
        <p className="byline-planning-help">{__("Unsupported provider metrics are omitted rather than represented as fabricated zeroes.", "weekly-wildcat-headless")}</p>
      ) : null}
    </section>
  );
}
