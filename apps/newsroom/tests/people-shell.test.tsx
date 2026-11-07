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
const { NewsroomPeopleScreen } = await import(
  "../src/ui/people/NewsroomPeopleScreen"
);
const { NAVIGATION, navigationFor, CREATE_ACTIONS, locationFor } = await import(
  "../src/domain/navigation"
);
const props = (role: string, enabled = true) =>
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
    searchParams: {},
  }) as never;
const child = (view: ReactElement) =>
  (view.props as { children: ReactElement }).children;
describe("People custom-view authorization and navigation", () => {
  it("places People after Collections only for editor+ and leaves global Create alone", () => {
    expect(NAVIGATION.at(-2)?.key).toBe("collections");
    expect(NAVIGATION.at(-1)?.key).toBe("people");
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
  it("uses the same screen for self-profile and refuses disabled accounts", () => {
    const profile = child(BylineProfile(props("staff")));
    expect(profile.type).toBe(NewsroomPeopleScreen);
    expect(profile.props).toEqual({ self: true });
    expect(child(BylineProfile(props("staff", false))).type).not.toBe(
      NewsroomPeopleScreen,
    );
  });
});
