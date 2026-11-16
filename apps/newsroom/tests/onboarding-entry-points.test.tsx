// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeopleApi } from "@byline/newsroom-screens/people/people-api";
import type { PersonDetail } from "@byline/newsroom-screens/people/people-model";

const env = vi.hoisted(() => ({ toasts: [] as string[], preferences: new Map<string, unknown>() }));

vi.mock("sonner", () => ({ Toaster: () => null, toast: Object.assign(() => {}, { success: (text: string) => env.toasts.push(text), error: () => {}, loading: () => 0, dismiss: () => {} }) }));
vi.mock("@payloadcms/ui", () => ({
  useAuth: () => ({ user: { id: 7, collection: "users", role: "staff", enabled: true, name: "Maycie Hart", linkedPerson: null } }),
  useConfig: () => ({ config: { routes: { admin: "/admin", api: "/api" } } }),
  usePreferences: () => ({ getPreference: async (key: string) => env.preferences.get(key), setPreference: async (key: string, value: unknown) => void env.preferences.set(key, value) }),
  useRouteTransition: () => ({ startRouteTransition: (run: () => void) => run() })
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/people", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, prefetch: () => {} }) }));

const { PersonAccessPanel } = await import("../src/ui/people/PersonAccessPanel");
const { NavUser } = await import("../src/ui/shell/NavUser");
const { OnboardingProvider } = await import("../src/ui/onboarding/OnboardingProvider");
const { SidebarProvider } = await import("@byline/newsroom-ui/ui/sidebar");
const { AdminRoot } = await import("@byline/newsroom-ui/components/admin-root");
const { WELCOME_ONBOARDING_PREFERENCE } = await import("../src/ui/onboarding/tour-preferences");

let root: Root | null = null;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
async function render(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await act(tick);
}
const buttonNamed = (name: string) => Array.from(document.querySelectorAll<HTMLElement>("button, [role=menuitem]")).find((b) => b.textContent?.trim() === name);
const click = (element: Element | undefined) => act(async () => { (element as HTMLElement).click(); await tick(); });

function detail(access: PersonDetail["access"]): PersonDetail {
  return {
    person: { id: 41, name: "Maycie Hart", slug: "maycie-hart", newsroomRole: "Reporter", status: "active", directoryVisible: true, hasProfilePage: true } as PersonDetail["person"],
    capabilities: { manageAccess: true } as PersonDetail["capabilities"],
    access,
    usage: { total: 0, stories: [] }
  };
}
const ACCESS = { id: 9, email: "maycie@example.test", role: "staff" as const, enabled: true, googleConnected: false, revision: "2026-11-01T00:00:00.000Z" };

beforeEach(() => {
  env.toasts = [];
  env.preferences.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("People → Newsroom access → Restart welcome tour", () => {
  const api = (restart = vi.fn(async () => detail({ ...ACCESS, revision: "2026-11-13T00:00:00.000Z" }))) => ({ restartOnboarding: restart } as unknown as PeopleApi);

  it("confirms in the person's own name, then asks the server and says it will show again", async () => {
    const people = api();
    const saved = vi.fn();
    await render(<AdminRoot><PersonAccessPanel api={people} detail={detail(ACCESS)} onSaved={saved} /></AdminRoot>);
    await click(buttonNamed("Restart welcome tour"));
    expect(document.body.textContent).toContain("Restart welcome tour for Maycie?");
    expect(document.body.textContent).toContain("The welcome introduction will appear the next time Maycie opens or reloads Byline. Their account, profile and work won’t be changed.");
    expect(buttonNamed("Cancel")).toBeTruthy();
    await click(buttonNamed("Restart tour"));
    expect(people.restartOnboarding).toHaveBeenCalledWith(41);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ access: expect.objectContaining({ revision: "2026-11-13T00:00:00.000Z" }) }));
    expect(env.toasts).toEqual(["Welcome tour will show again."]);
  });

  it("is not offered without newsroom access, or while access is disabled", async () => {
    await render(<AdminRoot><PersonAccessPanel api={api()} detail={detail(null)} onSaved={() => {}} /></AdminRoot>);
    expect(buttonNamed("Restart welcome tour")).toBeUndefined();
    await act(async () => root!.render(<AdminRoot><PersonAccessPanel api={api()} detail={detail({ ...ACCESS, enabled: false })} onSaved={() => {}} /></AdminRoot>));
    expect(buttonNamed("Restart welcome tour")).toBeUndefined();
  });
});

describe("Account menu → Take the Byline tour", () => {
  it("sits with Keyboard shortcuts, away from Sign out, and replays the welcome", async () => {
    env.preferences.set(WELCOME_ONBOARDING_PREFERENCE, { schema: 1, status: "completed", finishedAt: "2026-11-01T00:00:00.000Z", acknowledgedRequestAt: null });
    await render(
      <SidebarProvider>
        <OnboardingProvider>
          <AdminRoot><NavUser user={{ name: "Maycie Hart", subtitle: "Staff", avatarUrl: null }} systemHref={null} logoutUrl="/api/users/logout" loginHref="/admin/login" /></AdminRoot>
        </OnboardingProvider>
      </SidebarProvider>
    );
    expect(document.querySelector("[data-byline-welcome]")).toBeNull();
    const trigger = document.querySelector<HTMLElement>("[aria-label='Account: Maycie Hart']")!;
    await act(async () => {
      trigger.click();
      await tick();
    });
    const items = Array.from(document.querySelectorAll("[role=menuitem]")).map((item) => item.textContent?.trim());
    const tour = items.indexOf("Take the Byline tour");
    expect(tour).toBeGreaterThan(-1);
    expect(items[tour - 1]).toMatch(/^Keyboard shortcuts/);
    expect(items.at(-1)).toBe("Sign out");
    // A separator always stands between the tour and Sign out.
    const ordered = Array.from(document.querySelectorAll("[role=menuitem], [role=separator]")).map((node) => node.getAttribute("role") === "separator" ? "—" : node.textContent?.trim());
    const between = ordered.slice(ordered.indexOf("Take the Byline tour") + 1, ordered.indexOf("Sign out"));
    expect(between).toContain("—");
    await click(buttonNamed("Take the Byline tour"));
    await act(tick);
    expect(document.body.textContent).toContain("Welcome back, Maycie.");
  });
});
