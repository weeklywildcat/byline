import type { HomeHealthCheck, HomeHealthPayload } from "../home/home-model";

export type DoctorDiagnostics = {
  deployment?: {
    configured?: boolean;
    lastStatus?: string;
    pending?: boolean;
  };
  publicManifest?: {
    reachable?: boolean;
    status?: string;
  };
  jobs?: {
    overdueCount?: number;
    cronHealth?: {
      status?: string;
      message?: string;
      cronDisabled?: boolean;
      trafficDriven?: boolean;
      lastRunAt?: string;
      recurringEventAt?: string;
    };
  } | null;
  healthSummary?: HomeHealthPayload["summary"];
  healthChecks?: HomeHealthCheck[];
  supportReport?: string;
};

export type DoctorActionId =
  | "health"
  | "test-public-manifest"
  | "test-deploy-hook"
  | "run-jobs"
  | "repair-capabilities"
  | "refresh-rewrite-rules"
  | "retry-migration";

export type DoctorActionResponse = DoctorDiagnostics & {
  action?: DoctorActionId;
  actionResult?: {
    ok: boolean;
    message: string;
  };
};

export type DoctorCheck = HomeHealthCheck & {
  action?: DoctorActionId;
};

const CHECK_ACTIONS: Record<string, DoctorActionId> = {
  capabilities: "repair-capabilities",
  rewrite_rules: "refresh-rewrite-rules",
  upgrade: "retry-migration",
  core_schema: "retry-migration",
  poll_storage: "retry-migration",
  poll_secret: "retry-migration",
  page_block_correction: "retry-migration",
  deployment_cron: "run-jobs"
};

export function doctorCheckAction(check: Pick<HomeHealthCheck, "id" | "status">): DoctorActionId | undefined {
  if (check.status !== "critical" && check.status !== "recommended") return undefined;
  return CHECK_ACTIONS[check.id];
}

export function doctorChecks(diagnostics: DoctorDiagnostics | null): DoctorCheck[] {
  return (diagnostics?.healthChecks || [])
    .map((check) => ({ ...check, action: doctorCheckAction(check) }))
    .sort((left, right) => {
      const rank = (status: string) => status === "critical" ? 0 : status === "recommended" ? 1 : 2;
      return rank(left.status) - rank(right.status) || left.label.localeCompare(right.label);
    });
}

export function doctorProblemChecks(diagnostics: DoctorDiagnostics | null): DoctorCheck[] {
  return doctorChecks(diagnostics).filter((check) => check.status === "critical" || check.status === "recommended");
}

export function doctorStatus(diagnostics: DoctorDiagnostics | null): "good" | "recommended" | "critical" | "unknown" {
  const explicit = diagnostics?.healthSummary?.status;
  const problems = doctorProblemChecks(diagnostics);
  if (problems.some((check) => check.status === "critical")) return "critical";
  if (problems.length) return "recommended";
  if (explicit === "good" || explicit === "recommended" || explicit === "critical") return explicit;
  return diagnostics ? "good" : "unknown";
}

export function doctorStatusHeading(status: ReturnType<typeof doctorStatus>): string {
  if (status === "good") return "Everything looks good";
  if (status === "critical") return "Byline needs attention";
  if (status === "recommended") return "A few checks need attention";
  return "Byline checks are unavailable";
}

export function doctorSetupSteps(diagnostics: DoctorDiagnostics | null): DoctorCheck[] {
  const preferred = ["publication_identity", "publication_urls", "branding", "theme", "homepage_design"];
  const checks = doctorChecks(diagnostics);
  return preferred
    .map((id) => checks.find((check) => check.id === id))
    .filter((check): check is DoctorCheck => Boolean(check));
}

export function doctorDeploymentNeedsAttention(diagnostics: DoctorDiagnostics | null): boolean {
  const deployment = diagnostics?.deployment;
  if (!deployment) return false;
  if (deployment.pending) return false;
  return /request failed|no http status|http [45]\d\d|not configured/i.test(deployment.lastStatus || "");
}

export function doctorManifestNeedsAttention(diagnostics: DoctorDiagnostics | null): boolean {
  const manifest = diagnostics?.publicManifest;
  return Boolean(manifest && !manifest.reachable);
}
