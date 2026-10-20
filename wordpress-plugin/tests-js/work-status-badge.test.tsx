import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WorkStatusBadge,
  appointmentIntensity,
  appointmentKind,
  appointmentStatusLabel,
  mediaIntensity,
  sourceIntensity,
  workBadgeColors
} from "../src/admin-ui/components/work-status-badge";

const badge = (kind: "reporting" | "production", intensity: "action" | "active" | "settled", label: string) =>
  renderToStaticMarkup(<WorkStatusBadge kind={kind} intensity={intensity}>{label}</WorkStatusBadge>);

describe("work status color semantics", () => {
  it("keeps interview hue fixed while giving the needed state stronger emphasis", () => {
    const needed = badge("reporting", sourceIntensity("needs-scheduling"), "Interview needs scheduling");
    const scheduled = badge("reporting", sourceIntensity("scheduled"), "Interview scheduled");
    const interviewed = badge("reporting", sourceIntensity("interviewed"), "Interviewed");
    expect(needed).toContain('data-work-kind="reporting"');
    expect(needed).toContain('data-work-intensity="action"');
    expect(needed).toContain("bg-orange-700");
    expect(scheduled).toContain('data-work-kind="reporting"');
    expect(scheduled).toContain('data-work-intensity="active"');
    expect(scheduled).toContain("bg-orange-100");
    expect(interviewed).toContain("bg-orange-50");
  });

  it("uses the same progressive intensity for visual production", () => {
    expect(mediaIntensity("needed")).toBe("action");
    expect(mediaIntensity("assigned")).toBe("active");
    expect(mediaIntensity("in-progress")).toBe("active");
    expect(mediaIntensity("done")).toBe("settled");
    expect(badge("production", mediaIntensity("needed"), "Photo needed")).toContain("bg-blue-700");
    expect(badge("production", mediaIntensity("assigned"), "Photo assigned")).toContain("bg-blue-100");
  });

  it("does not mark a window as scheduled or a tentative exact time as confirmed", () => {
    const pending = { kind: "interview", status: "planned", scheduleMode: "window", startAt: null };
    const exact = { kind: "interview", status: "confirmed", scheduleMode: "exact", startAt: "2026-10-27T14:00:00Z" };
    const tentative = { ...exact, status: "tentative" };
    expect(appointmentKind(pending)).toBe("reporting");
    expect(appointmentIntensity(pending)).toBe("action");
    expect(appointmentStatusLabel(pending)).toBe("Needs scheduling");
    expect(appointmentIntensity(exact)).toBe("active");
    expect(appointmentStatusLabel(exact)).toBe("Scheduled");
    expect(appointmentIntensity(tentative)).toBe("action");
    expect(appointmentStatusLabel(tentative)).toBe("Needs confirmation");
    expect(appointmentKind({ kind: "photo" })).toBe("production");
  });

  it("uses named labels and has both dark and light theme variants", () => {
    for (const work of Object.values(workBadgeColors)) {
      expect(work.action).toContain("dark:bg-");
      expect(work.active).toContain("dark:bg-");
      expect(work.settled).toContain("dark:bg-");
    }
    const html = badge("reporting", "action", "Needs scheduling");
    expect(html).toContain("Needs scheduling");
    expect(html).toContain("text-white");
  });
});
