import { Button, Card, CardBody, Notice, Spinner } from "@wordpress/components";
import { useCallback, useEffect, useMemo, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";

import type {
  DoctorActionId,
  DoctorActionResponse,
  DoctorCheck,
  DoctorDiagnostics
} from "./doctor-model";
import {
  doctorDeploymentNeedsAttention,
  doctorManifestNeedsAttention,
  doctorProblemChecks,
  doctorSetupSteps,
  doctorStatus,
  doctorStatusHeading
} from "./doctor-model";

export type DoctorFetchers = {
  getDiagnostics: () => Promise<DoctorDiagnostics>;
  runAction?: (action: DoctorActionId) => Promise<DoctorActionResponse>;
};

export type DoctorAppProps = {
  fetchers: DoctorFetchers;
  urls?: {
    deployment?: string;
    publication?: string;
    branding?: string;
    theme?: string;
    studio?: string;
    doctor?: string;
  };
  canManageIntegrations?: boolean;
};

function actionLabel(action: DoctorActionId): string {
  switch (action) {
    case "repair-capabilities": return __("Repair capabilities", "weekly-wildcat-headless");
    case "refresh-rewrite-rules": return __("Refresh rewrite rules", "weekly-wildcat-headless");
    case "retry-migration": return __("Retry setup", "weekly-wildcat-headless");
    case "test-public-manifest": return __("Test public site", "weekly-wildcat-headless");
    case "test-deploy-hook": return __("Test deploy hook", "weekly-wildcat-headless");
    case "run-jobs": return __("Run due work", "weekly-wildcat-headless");
    case "health": return __("Run checks", "weekly-wildcat-headless");
  }
}

function checkAction(check: DoctorCheck): DoctorActionId | undefined {
  if (check.action) return check.action;
  if (check.id === "public_manifest") return "test-public-manifest";
  return undefined;
}

function Mark({ status }: { status: string }) {
  const normalized = status === "critical" ? "critical" : status === "recommended" ? "recommended" : "good";
  return <span className={`byline-doctor-mark byline-doctor-mark-${normalized}`} aria-label={normalized === "good" ? __("Good", "weekly-wildcat-headless") : normalized === "critical" ? __("Needs attention", "weekly-wildcat-headless") : __("Recommended", "weekly-wildcat-headless")}>{normalized === "good" ? "✓" : "!"}</span>;
}

function CheckRow({ check, onAction, busyAction }: { check: DoctorCheck; onAction: (action: DoctorActionId) => void; busyAction: DoctorActionId | null }) {
  const action = checkAction(check);
  return (
    <li className={`byline-doctor-check byline-doctor-check-${check.status}`}>
      <Mark status={check.status} />
      <div className="byline-doctor-check-copy">
        <strong>{check.label}</strong>
        <span>{check.summary}</span>
        {check.description ? <small>{check.description}</small> : null}
      </div>
      <div className="byline-doctor-check-actions">
        {action ? <Button variant="secondary" isBusy={busyAction === action} disabled={Boolean(busyAction)} onClick={() => onAction(action)}>{actionLabel(action)}</Button> : null}
        {check.remediationUrl ? <a href={check.remediationUrl}>{__("Open settings", "weekly-wildcat-headless")}</a> : null}
      </div>
    </li>
  );
}

function ActionFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Notice status="error" isDismissible={false}>{message}{" "}<Button variant="link" onClick={onRetry}>{__("Try again", "weekly-wildcat-headless")}</Button></Notice>;
}

export function DoctorApp({ fetchers, urls, canManageIntegrations = false }: DoctorAppProps) {
  const [diagnostics, setDiagnostics] = useState<DoctorDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<DoctorActionId | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDiagnostics(await fetchers.getDiagnostics());
    } catch {
      setError(__("Byline Doctor could not collect checks. Try again.", "weekly-wildcat-headless"));
    } finally {
      setLoading(false);
    }
  }, [fetchers]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(async (action: DoctorActionId) => {
    setBusyAction(action);
    setActionMessage("");
    setError("");
    try {
      if (fetchers.runAction) {
        const result = await fetchers.runAction(action);
        setDiagnostics(result);
        if (result.actionResult && !result.actionResult.ok) {
          setError(result.actionResult.message || __("Byline could not complete that check. Your publication was not changed.", "weekly-wildcat-headless"));
          setActionMessage("");
        } else {
          setActionMessage(result.actionResult?.message || __("Checks completed.", "weekly-wildcat-headless"));
        }
      } else {
        await load();
        setActionMessage(__("Checks completed.", "weekly-wildcat-headless"));
      }
    } catch {
      setError(__("Byline could not complete that check. Your publication was not changed.", "weekly-wildcat-headless"));
    } finally {
      setBusyAction(null);
    }
  }, [fetchers.runAction, load]);

  const status = doctorStatus(diagnostics);
  const problems = useMemo(() => doctorProblemChecks(diagnostics), [diagnostics]);
  const setupSteps = useMemo(() => doctorSetupSteps(diagnostics), [diagnostics]);
  const allChecks = useMemo(() => diagnostics?.healthChecks || [], [diagnostics]);
  const deploymentAttention = doctorDeploymentNeedsAttention(diagnostics);
  const manifestAttention = doctorManifestNeedsAttention(diagnostics);
  const jobs = diagnostics?.jobs?.cronHealth;
  const jobsNeedAttention = Boolean(jobs && (jobs.status === "critical" || jobs.status === "recommended" || Number(diagnostics?.jobs?.overdueCount || 0) > 0));
  const supportReport = diagnostics?.supportReport || "";

  const copyReport = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(supportReport);
      } else {
        const report = document.getElementById("byline-doctor-support-report") as HTMLTextAreaElement | null;
        report?.focus();
        report?.select();
        document.execCommand("copy");
      }
      setCopied(true);
    } catch {
      setError(__("The report is ready below, but your browser could not copy it automatically.", "weekly-wildcat-headless"));
    }
  };

  return (
    <div className="byline-doctor-app">
      <header className="byline-doctor-header">
        <div>
          <p className="byline-doctor-eyebrow">{__("Setup & health", "weekly-wildcat-headless")}</p>
          <h1>{__("Byline Doctor", "weekly-wildcat-headless")}</h1>
          <p>{__("Find problems, test the connection, and repair safe installation issues.", "weekly-wildcat-headless")}</p>
        </div>
        <Button variant="secondary" onClick={() => void runAction("health")} disabled={Boolean(busyAction)}>{busyAction === "health" ? __("Checking…", "weekly-wildcat-headless") : __("Test again", "weekly-wildcat-headless")}</Button>
      </header>

      {error ? <ActionFailure message={error} onRetry={() => void load()} /> : null}
      {actionMessage ? <Notice status="success" isDismissible={false}>{actionMessage}</Notice> : null}

      <Card className={`byline-doctor-status-card byline-doctor-status-${status}`}>
        <CardBody>
          <div className="byline-doctor-status-heading">
            <div>
              <p className="byline-doctor-eyebrow">{__("Current result", "weekly-wildcat-headless")}</p>
              <h2>{doctorStatusHeading(status)}</h2>
            </div>
            {loading ? <Spinner /> : null}
          </div>
          <p>{status === "good" ? __("Byline is ready for newsroom work.", "weekly-wildcat-headless") : status === "unknown" ? __("Run the checks to see what needs attention.", "weekly-wildcat-headless") : __("The issues below are prioritized. Safe repair actions never reset your publication or content.", "weekly-wildcat-headless")}</p>
        </CardBody>
      </Card>

      {deploymentAttention ? (
        <Card className="byline-doctor-problem-card">
          <CardBody>
            <h2>{__("Website publishing needs attention", "weekly-wildcat-headless")}</h2>
            <p>{__("The last deployment request failed. WordPress content is safe; test the deploy hook or open deployment settings.", "weekly-wildcat-headless")}</p>
            <div className="byline-doctor-action-row">
              {canManageIntegrations ? <Button variant="secondary" isBusy={busyAction === "test-deploy-hook"} disabled={Boolean(busyAction)} onClick={() => void runAction("test-deploy-hook")}>{__("Test deploy hook", "weekly-wildcat-headless")}</Button> : null}
              {urls?.deployment ? <Button variant="link" href={urls.deployment}>{__("Open deployment settings", "weekly-wildcat-headless")}</Button> : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {manifestAttention ? (
        <Card className="byline-doctor-problem-card">
          <CardBody>
            <h2>{__("Public site needs attention", "weekly-wildcat-headless")}</h2>
            <p>{__("The public manifest could not be verified. WordPress remains available while you test the public site again.", "weekly-wildcat-headless")}</p>
            <Button variant="secondary" isBusy={busyAction === "test-public-manifest"} disabled={Boolean(busyAction)} onClick={() => void runAction("test-public-manifest")}>{__("Test public site", "weekly-wildcat-headless")}</Button>
          </CardBody>
        </Card>
      ) : null}

      {jobs ? (
        <Card className={`byline-doctor-job-card${jobsNeedAttention ? " byline-doctor-problem-card" : ""}`}>
          <CardBody>
            <h2>{__("Scheduled work", "weekly-wildcat-headless")}</h2>
            <p>{jobs.message || __("Byline background work is scheduled through WordPress.", "weekly-wildcat-headless")}</p>
            {jobs.cronDisabled ? <p>{__("WordPress cron is disabled. Use the authenticated catch-up action or the WP-CLI runner.", "weekly-wildcat-headless")}</p> : jobs.trafficDriven ? <p>{__("This site is relying on traffic-triggered WP-Cron; scheduled work can run late when traffic is low.", "weekly-wildcat-headless")}</p> : null}
            {jobsNeedAttention ? <Button variant="secondary" isBusy={busyAction === "run-jobs"} disabled={Boolean(busyAction)} onClick={() => void runAction("run-jobs")}>{__("Run due work", "weekly-wildcat-headless")}</Button> : null}
          </CardBody>
        </Card>
      ) : null}

      {problems.length ? (
        <Card className="byline-doctor-problems-card">
          <CardBody>
            <div className="byline-doctor-section-heading">
              <div>
                <p className="byline-doctor-eyebrow">{__("Problem first", "weekly-wildcat-headless")}</p>
                <h2>{__("Needs attention", "weekly-wildcat-headless")}</h2>
              </div>
              <span>{problems.length}</span>
            </div>
            <ul className="byline-doctor-check-list">
              {problems.map((check) => <CheckRow key={check.id} check={check} onAction={(action) => void runAction(action)} busyAction={busyAction} />)}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card className="byline-doctor-setup-card">
        <CardBody>
          <div className="byline-doctor-section-heading">
            <div>
              <p className="byline-doctor-eyebrow">{__("Guided setup", "weekly-wildcat-headless")}</p>
              <h2>{__("Setup checks", "weekly-wildcat-headless")}</h2>
            </div>
            <Button variant="secondary" isBusy={busyAction === "health"} disabled={Boolean(busyAction)} onClick={() => void runAction("health")}>{__("Run setup checks", "weekly-wildcat-headless")}</Button>
          </div>
          <p>{__("Run these checks again at any time. They inspect your existing publication and do not reset it.", "weekly-wildcat-headless")}</p>
          {setupSteps.length ? (
            <ol className="byline-doctor-setup-list">
              {setupSteps.map((check) => (
                <li key={check.id}>
                  <Mark status={check.status} />
                  <span><strong>{check.label}</strong><small>{check.summary}</small></span>
                  {check.status !== "good" && check.remediationUrl ? <a href={check.remediationUrl}>{__("Open", "weekly-wildcat-headless")}</a> : null}
                </li>
              ))}
            </ol>
          ) : <p className="byline-doctor-muted">{__("Run the checks to show setup progress.", "weekly-wildcat-headless")}</p>}
        </CardBody>
      </Card>

      {allChecks.length && !problems.length ? (
        <p className="byline-doctor-all-clear" role="status">{__("Everything looks good. No repair is needed.", "weekly-wildcat-headless")}</p>
      ) : null}

      {allChecks.length ? (
        <details className="byline-doctor-all-checks">
          <summary>{__("Show all checks", "weekly-wildcat-headless")}</summary>
          <ul className="byline-doctor-check-list">
            {allChecks.map((check) => <CheckRow key={check.id} check={{ ...check, action: undefined }} onAction={(action) => void runAction(action)} busyAction={busyAction} />)}
          </ul>
        </details>
      ) : null}

      {supportReport ? (
        <Card className="byline-doctor-report-card">
          <CardBody>
            <div className="byline-doctor-section-heading"><div><p className="byline-doctor-eyebrow">{__("Support", "weekly-wildcat-headless")}</p><h2>{__("Safe support report", "weekly-wildcat-headless")}</h2></div></div>
            <p>{__("This report excludes credentials, tokens, hook URLs, and private integration settings.", "weekly-wildcat-headless")}</p>
            <label htmlFor="byline-doctor-support-report" className="byline-doctor-report-label">{__("Copy this report for support", "weekly-wildcat-headless")}</label>
            <textarea id="byline-doctor-support-report" className="byline-doctor-report" readOnly value={supportReport} rows={12} />
            <div className="byline-doctor-action-row">
              <Button variant="secondary" onClick={() => void copyReport()}>{__("Copy support report", "weekly-wildcat-headless")}</Button>
              {copied ? <span role="status">{__("Copied.", "weekly-wildcat-headless")}</span> : null}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
