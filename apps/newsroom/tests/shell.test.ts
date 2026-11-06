import { readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// The shell's server components are tested by calling them; Payload's admin UI
// (which imports CSS) is irrelevant here and replaced with pass-throughs.
vi.mock("@payloadcms/ui", () => ({
  Gutter: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: null }),
  useConfig: () => ({ config: { routes: { admin: "/admin", api: "/api" } } })
}));
vi.mock("@payloadcms/next/templates", () => ({ DefaultTemplate: ({ children }: { children: ReactNode }) => children }));

const { BylineNav } = await import("../src/ui/shell/BylineNav");
const { BylineSidebar } = await import("../src/ui/shell/BylineSidebar");
const { SystemAdministration } = await import("../src/components/SystemAdministration");
const { SystemAdministrationScreen } = await import("../src/ui/system/SystemAdministrationScreen");
const { initials } = await import("../src/ui/shell/NavUser");

const src = (relative: string) => readFileSync(path.resolve(__dirname, "../src", relative), "utf8");
const screens = (relative: string) => readFileSync(path.resolve(__dirname, "../../../packages/newsroom-screens/src", relative), "utf8");

const payload = { config: { routes: { admin: "/admin", api: "/api" } }, findByID: vi.fn() };
const account = (role: string, extra: Record<string, unknown> = {}) => ({ id: 7, collection: "users", role, enabled: true, name: "Gibson Bell", linkedPerson: null, ...extra });

type SidebarProps = Parameters<typeof BylineSidebar>[0];
async function sidebarFor(user: unknown): Promise<SidebarProps | null> {
  const element = (await BylineNav({ user, payload } as never)) as ReactElement<SidebarProps> | null;
  if (!element) return null;
  expect(element.type).toBe(BylineSidebar);
  return element.props;
}

describe("Byline sidebar (admin.components.Nav)", () => {
  it("gives staff only Byline destinations and no System administration", async () => {
    const props = (await sidebarFor(account("staff")))!;
    expect(props.items.map((item) => item.key)).toEqual(["home", "stories", "calendar"]);
    expect(props.items.every((item) => !item.href.includes("/collections/"))).toBe(true);
    expect(props.systemHref).toBeNull();
    expect(props.user).toEqual({ name: "Gibson Bell", subtitle: "Staff", avatarUrl: null });
  });

  it("keeps System administration from editors too", async () => {
    expect((await sidebarFor(account("editor")))!.systemHref).toBeNull();
  });

  it("gives administrators System administration in the account menu, not raw collections in the navigation", async () => {
    const props = (await sidebarFor(account("administrator")))!;
    expect(props.systemHref).toBe("/admin/system");
    expect(props.items.every((item) => !item.href.includes("/collections/"))).toBe(true);
    expect(props.logoutUrl).toBe("/api/users/logout");
    expect(props.loginHref).toBe("/admin/login");
  });

  it("renders nothing for a disabled or missing account", async () => {
    expect(await sidebarFor(account("administrator", { enabled: false }))).toBeNull();
    expect(await sidebarFor(null)).toBeNull();
  });

  it("shows the linked person's newsroom title and portrait, read as the user", async () => {
    payload.findByID.mockResolvedValueOnce({ newsroomRole: " Editor in Chief ", portrait: { id: 4, url: "/api/media/file/gb.jpg", mimeType: "image/jpeg" } });
    const props = (await sidebarFor(account("editor", { linkedPerson: 12 })))!;
    expect(payload.findByID).toHaveBeenLastCalledWith(expect.objectContaining({ collection: "people", id: 12, overrideAccess: false }));
    expect(props.user).toEqual({ name: "Gibson Bell", subtitle: "Editor in Chief", avatarUrl: "/api/media/file/gb.jpg" });
  });

  it("falls back to the account role when the person cannot be read", async () => {
    payload.findByID.mockRejectedValueOnce(new Error("Forbidden"));
    expect((await sidebarFor(account("editor", { linkedPerson: 12 })))!.user.subtitle).toBe("Editor");
  });

  it("uses initials when there is no portrait", () => {
    expect(initials("Gibson Bell")).toBe("GB");
    expect(initials("Cher")).toBe("C");
    expect(initials("  ")).toBe("?");
  });
});

describe("System administration view", () => {
  const view = (user: unknown) => {
    const req = { user, i18n: {}, payload };
    const element = SystemAdministration({ initPageResult: { req, locale: undefined, permissions: {}, visibleEntities: {} }, params: {}, searchParams: {} } as never) as ReactElement<{ children: ReactElement }>;
    return element.props.children;
  };

  it("lists the raw collection screens for administrators", () => {
    const screen = view(account("administrator")) as ReactElement<{ links: { href: string }[] }>;
    expect(screen.type).toBe(SystemAdministrationScreen);
    expect(screen.props.links.map((link) => link.href)).toContain("/admin/collections/stories");
  });

  it("refuses staff and editors on the server", () => {
    for (const role of ["staff", "editor"]) {
      const content = view(account(role));
      expect(isValidElement(content) && content.type === SystemAdministrationScreen).toBe(false);
    }
  });
});

describe("Byline shell composition", () => {
  it("is the shadcn Sidebar application shell, not a hand-built nav", () => {
    expect(src("ui/shell/BylineSidebar.tsx")).toContain('<Sidebar collapsible="icon"');
    expect(src("ui/shell/DefaultSidebar.tsx")).toContain("<SidebarRail />");
    for (const file of ["ui/shell/BylineSidebar.tsx", "ui/shell/DefaultSidebar.tsx", "ui/shell/BylineIconRail.tsx", "ui/shell/StoryWorkspaceSidebar.tsx"]) {
      const sidebar = src(file);
      expect(sidebar).not.toContain("buttonVariants");
      // Nothing a writer can see names Payload or offers raw administration.
      const code = sidebar.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code).not.toMatch(/Administration|Payload/);
    }
  });

  it("keeps every collapsed control named: tooltips on destinations, Create and the account", () => {
    expect(src("ui/shell/DefaultSidebar.tsx")).toContain("tooltip={item.label}");
    expect(src("ui/shell/DefaultSidebar.tsx")).toContain("aria-current={active ? \"page\" : undefined}");
    const create = src("ui/shell/CreateMenu.tsx");
    // The collapsed "+" is named, and in the Story workspace's rail its tooltip is always on.
    expect(create).toContain('tooltip={compact ? { children: "Create", hidden: false } : "Create"} aria-label="Create"');
    expect(create).toContain('aria-label="More to create"');
    expect(src("ui/shell/NavUser.tsx")).toContain("aria-label={`Account: ${user.name}`}");
  });

  it("mounts the shell through Payload's extension points and keeps the Story document root", () => {
    const config = src("payload.config.ts");
    expect(config).toContain('providers: ["/ui/shell/BylineShellProvider#BylineShellProvider"]');
    expect(config).toContain('Nav: "/ui/shell/BylineNav#BylineNav"');
    expect(config).toContain('header: ["/ui/shell/BylineAppHeader#BylineAppHeader"]');
    expect(config).not.toMatch(/views:\s*{[^}]*edit/);
    expect(src("ui/story/StoryScreen.tsx")).toContain("onSubmit={keepSubmitsInByline}");
  });

  it("creates through the shared Home dialogs, mounted once, and opens new stories on the Byline Story screen", () => {
    const create = src("ui/shell/create.tsx");
    expect(create).toContain("<HomeCreate ");
    expect(create).toContain("<ShellLayer active={request !== null}>");
    expect(create).toContain("created.workspaceUrl || routes.story(created.story.id)");
    expect(create).not.toContain("collections/stories/create");
    // No second copy of the shared creation dialogs or screens in the newsroom.
    for (const file of ["ui/shell/create.tsx", "ui/shell/search.tsx", "ui/home/NewsroomHome.tsx"]) {
      expect(src(file)).not.toMatch(/export (function|const) (StoryCreateDialog|TaskCreateDialog|HomeCommands)\b/);
    }
  });

  it("lets Home defer Create, Search and toasts to the shell instead of repeating them", () => {
    expect(src("ui/home/NewsroomHome.tsx")).toContain("shell={shell}");
    const home = screens("home/HomeApp.tsx");
    expect(home).toContain("{shell ? null : <div className=\"flex items-center gap-2\">");
    expect(home).toContain("{shell ? null : <>");
    expect(home).toContain("<AdminRoot toaster={!props.shell}>");
    expect(home).toContain('shell.openCreate("task", { storyId })');
    // WordPress (no shell) keeps its own New story, Search and dialogs.
    expect(home).toContain("New story</Button>");
    expect(home).toContain("<HomeCommands ");
    expect(home).toContain("<HomeCreate ");
  });

  it("does not claim ⌘B, which is Bold in the article editor", () => {
    expect(src("ui/shell/shell-config.ts")).toContain('SIDEBAR_SHORTCUT = "\\\\"');
  });
});
