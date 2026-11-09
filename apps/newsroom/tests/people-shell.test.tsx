import { type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@payloadcms/ui", () => ({
  Gutter: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@payloadcms/next/templates", () => ({
  DefaultTemplate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../src/ui/people/NewsroomPeopleScreen", () => ({
  NewsroomPeopleScreen: () => null,
}));
const { BylinePeople } = await import("../src/components/BylinePeople");
const { BylineProfile } = await import("../src/components/BylineProfile");
const { RolesScreen } = await import("../src/ui/roles/RolesScreen");
const { WorkloadScreen } = await import("../src/ui/roles/WorkloadScreen");
const { BylineWorkflows } = await import("../src/components/BylineWorkflows");
const { WorkflowScreen } = await import("../src/ui/roles/WorkflowScreen");
const { NewsroomPeopleScreen } = await import(
  "../src/ui/people/NewsroomPeopleScreen"
);
const { NAVIGATION, navigationFor, CREATE_ACTIONS, locationFor, activeNavKey } = await import(
  "../src/domain/navigation"
);
const props = (role: string, enabled = true, searchParams: Record<string, string> = {}) =>
  ({
    initPageResult: {
      req: {
        user: { id: 7, role, enabled, collection: "users", linkedPerson: 12 },
        payload: {},
        i18n: {},
      },
      permissions: {},
      visibleEntities: {},
    },
    params: {},
    searchParams,
  }) as never;
const child = (view: ReactElement) =>
  (view.props as { children: ReactElement }).children;
describe("People custom-view authorization and navigation", () => {
  it("places People after Collections only for editor+ and leaves global Create alone", () => {
    const main = NAVIGATION.filter((item) => !item.group);
    expect(main.at(-2)?.key).toBe("collections");
    expect(main.at(-1)?.key).toBe("people");
    expect(navigationFor("staff").some((item) => item.key === "people")).toBe(
      false,
    );
    expect(
      navigationFor("editor").find((item) => item.key === "people")?.path,
    ).toBe("/people");
    expect(
      CREATE_ACTIONS.some((action) => String(action.kind) === "person"),
    ).toBe(false);
    expect(locationFor("/admin/profile", "/admin")).toEqual([
      { label: "My profile" },
    ]);
  });
  it("checks People access in the server view before mounting the client screen", () => {
    expect(child(BylinePeople(props("editor"))).type).toBe(
      NewsroomPeopleScreen,
    );
    expect(child(BylinePeople(props("administrator"))).type).toBe(
      NewsroomPeopleScreen,
    );
    expect(child(BylinePeople(props("staff"))).type).not.toBe(
      NewsroomPeopleScreen,
    );
    expect(child(BylinePeople(props("editor", false))).type).not.toBe(
      NewsroomPeopleScreen,
    );
  });
  it("serves Roles, Workload and Review workflows to editors only, beside People", () => {
    expect(child(BylinePeople(props("editor", true, { view: "roles" }))).type).toBe(RolesScreen);
    expect(child(BylinePeople(props("editor", true, { view: "workload" }))).type).toBe(WorkloadScreen);
    expect(child(BylinePeople(props("editor", true, { view: "other" }))).type).toBe(NewsroomPeopleScreen);
    expect(child(BylinePeople(props("staff", true, { view: "roles" }))).type).not.toBe(RolesScreen);
    expect(child(BylineWorkflows(props("editor"))).type).toBe(WorkflowScreen);
    expect(child(BylineWorkflows(props("staff"))).type).not.toBe(WorkflowScreen);
    expect(activeNavKey(NAVIGATION, "/admin/review-workflows", "/admin")).toBe("people");
    expect(locationFor("/admin/review-workflows", "/admin")).toEqual([{ label: "People", path: "/people" }, { label: "Review workflows" }]);
  });
  it("uses the same screen for self-profile and refuses disabled accounts", () => {
    const profile = child(BylineProfile(props("staff")));
    expect(profile.type).toBe(NewsroomPeopleScreen);
    expect(profile.props).toEqual({ self: true });
    expect(child(BylineProfile(props("staff", false))).type).not.toBe(
      NewsroomPeopleScreen,
    );
  });
});
