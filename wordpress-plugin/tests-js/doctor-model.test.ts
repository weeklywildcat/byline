import { describe, expect, it } from "vitest";

import {
  doctorCheckAction,
  doctorChecks,
  doctorDeploymentNeedsAttention,
  doctorSetupSteps,
  doctorStatus,
  doctorStatusHeading
} from "../src/doctor/doctor-model";
import type { DoctorDiagnostics } from "../src/doctor/doctor-model";

function diagnostics(overrides: Partial<DoctorDiagnostics> = {}): DoctorDiagnostics {
  return {
    healthSummary: { status: "recommended", good: 1, recommended: 1, critical: 0 },
    healthChecks: [
      { id: "theme", label: "Theme", status: "good", summary: "Ready" },
      { id: "capabilities", label: "Capabilities", status: "critical", summary: "Missing capability" },
      { id: "rewrite_rules", label: "Rewrite rules", status: "recommended", summary: "Refresh needed" },
      { id: "publication_identity", label: "Publication identity", status: "good", summary: "Ready" }
    ],
    deployment: { configured: true, pending: false, lastStatus: "HTTP 200" },
    ...overrides
  };
}

describe("Byline Doctor model", () => {
  it("puts critical checks first and maps only safe repair actions", () => {
    const checks = doctorChecks(diagnostics());
    expect(checks.map((check) => check.id)).toEqual(["capabilities", "rewrite_rules", "publication_identity", "theme"]);
    expect(doctorCheckAction(checks[0])).toBe("repair-capabilities");
    expect(doctorCheckAction(checks[1])).toBe("refresh-rewrite-rules");
    expect(doctorCheckAction({ id: "theme", status: "good" })).toBeUndefined();
  });

  it("separates setup steps from operational problems and reports the worst state", () => {
    const current = diagnostics();
    expect(doctorSetupSteps(current).map((check) => check.id)).toEqual(["publication_identity", "theme"]);
    expect(doctorStatus(current)).toBe("critical");
    expect(doctorStatusHeading("critical")).toBe("Byline needs attention");
    expect(doctorDeploymentNeedsAttention(current)).toBe(false);
    expect(doctorDeploymentNeedsAttention({ deployment: { pending: false, lastStatus: "Request failed" } })).toBe(true);
  });

  it("does not treat a reachable stale manifest as healthy", () => {
    const stale = diagnostics({
      healthSummary: { status: "good", good: 4, recommended: 0, critical: 0 },
      healthChecks: [],
      publicManifest: {
        reachable: true,
        lifecycle: "unknown",
        expectedRevision: 12,
        publicationRevision: 11
      }
    });
    expect(doctorStatus(stale)).toBe("recommended");
  });
});
