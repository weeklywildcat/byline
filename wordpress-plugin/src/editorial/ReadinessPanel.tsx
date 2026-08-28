import { Button, Notice, Spinner } from "@wordpress/components";
import { useState } from "@wordpress/element";
import type { ReadinessCheck } from "./editorial-model";
import { describeEditorialError, readinessStateLabel, summarizeReadiness, type ReadinessSummary } from "./editorial-model";
import "./editorial.css";

export type ReadinessPanelProps = {
  checks: ReadinessCheck[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: unknown;
  onRefresh?: () => Promise<void> | void;
  onFix?: (check: ReadinessCheck) => Promise<void> | void;
};

export function ReadinessPanel({
  checks,
  isLoading = false,
  isRefreshing = false,
  error,
  onRefresh,
  onFix
}: ReadinessPanelProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const summary = summarizeReadiness(checks);

  const run = (operation: () => Promise<void> | void) => {
    setActionError(null);
    void Promise.resolve()
      .then(operation)
      .catch((caught: unknown) => setActionError(describeEditorialError(caught)));
  };

  return (
    <section className="byline-editorial-panel byline-editorial-readiness-panel" aria-labelledby="byline-editorial-readiness-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">Pre-publish checks</span>
          <h2 id="byline-editorial-readiness-heading">Ready to publish</h2>
        </div>
        {isLoading || isRefreshing ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)} Checks may be stale.</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}

      <ReadinessSummary summary={summary} />

      {checks.length === 0 && !isLoading ? (
        <p className="byline-editorial-empty-state">No readiness checks were returned. Try refreshing before publishing.</p>
      ) : (
        <ul className="byline-editorial-check-list" aria-label="Publication readiness checks">
          {checks.map((check) => {
            const stateLabel = readinessStateLabel(check.state);
            return (
              <li className={`byline-editorial-check byline-editorial-check-${check.state}`} key={check.id}>
                <span className="byline-editorial-check-state" aria-label={stateLabel}>{stateLabel}</span>
                <div className="byline-editorial-check-copy">
                  <strong>{check.label}</strong>
                  <span>{check.explanation}</span>
                </div>
                {check.fix ? (
                  check.fix.href ? (
                    <a className="byline-editorial-fix-link" href={check.fix.href}>{check.fix.label}</a>
                  ) : onFix ? (
                    <Button variant="link" onClick={() => run(() => onFix(check))}>{check.fix.label}</Button>
                  ) : null
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="byline-editorial-inline-actions">
        {onRefresh ? (
          <Button variant="secondary" disabled={isLoading || isRefreshing} onClick={() => run(onRefresh)}>
            Recheck readiness
          </Button>
        ) : null}
        <span className="byline-editorial-muted">
          Warnings do not block WordPress publishing; errors need attention first.
        </span>
      </div>
    </section>
  );
}

export function ReadinessSummary({ summary }: { summary: ReadinessSummary }) {
  return (
    <div className="byline-editorial-readiness-summary" aria-live="polite">
      <strong>{summary.label}</strong>
      <span>{summary.warnings} warning{summary.warnings === 1 ? "" : "s"}</span>
      <span>{summary.errors} error{summary.errors === 1 ? "" : "s"}</span>
    </div>
  );
}
