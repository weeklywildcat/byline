import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("Nova component composition policy", () => {
  it("uses the richer Avatar composition for dense people", () => {
    const source = read("admin-ui/components/people-avatars.tsx");
    expect(source).toContain("AvatarGroup");
    expect(source).toContain("AvatarGroupCount");
    expect(source).toContain("PeopleHoverCard");
    expect(read("workspace/ReportingPlan.tsx")).toContain("PeopleHoverCard");
  });

  it("uses the complete Attachment composition for production files", () => {
    const source = read("workspace/MediaDialog.tsx");
    expect(source).toContain("AttachmentGroup");
    expect(source).toContain("AttachmentTrigger");
    expect(source).toContain('orientation={image ? "vertical" : "horizontal"}');
  });

  it("uses ScrollArea where Nova owns long overlay content", () => {
    expect(read("workspace/dialog-shell.tsx")).toContain("<ScrollArea");
    expect(read("story/StoryPeek.tsx")).toContain("<ScrollArea");
    expect(read("home/HomeApp.tsx")).toContain("<ScrollArea");
  });

  it("uses Drawer on phones and Dialog on larger screens for workspace forms", () => {
    const source = read("workspace/dialog-shell.tsx");
    expect(source).toContain('useMediaQuery("(max-width: 639px)")');
    expect(source).toContain("<Drawer");
    expect(source).toContain("<Dialog");
  });

  it("uses semantic compositions for complex controls and recovery", () => {
    expect(read("planning/StoryFilters.tsx")).toContain("<PopoverHeader>");
    expect(read("planning/Performance.tsx")).toContain("<AlertAction>");
    expect(read("planning/StoryCalendar.tsx")).toContain("<Tooltip>");
    expect(read("planning/StoryActionsMenu.tsx")).toContain("<Tooltip>");
  });

  it("migrates the legacy admin shell onto Nova primitives", () => {
    const source = read("index.tsx");
    expect(source).toContain("<AdminRoot");
    expect(source).toContain("<SidebarProvider");
    expect(source).toContain("<AspectRatio");
    expect(source).toContain("<CodeBlock");
    expect(source).not.toContain('from "@wordpress/components"');
  });

  it("uses NativeSelect and Switch for simple legacy settings controls", () => {
    const source = read("admin-ui/components/legacy-control-adapters.tsx");
    expect(source).toContain("<NativeSelect");
    expect(source).toContain("<Switch");
    expect(source).toContain("<InputGroup");
  });

  it("uses appropriate shadcn components in newsletters and Doctor", () => {
    const list = read("newsletters/NewsletterList.tsx");
    expect(list).toContain("<Table");
    expect(list).toContain("<Pagination");
    expect(list).toContain("<ItemGroup");

    const editor = read("newsletters/NewsletterEditor.tsx");
    expect(editor).toContain("<AlertDialog");
    expect(editor).toContain("<Accordion");
    expect(editor).not.toContain("window.confirm");

    const doctor = read("doctor/DoctorApp.tsx");
    expect(doctor).toContain("<Progress");
    expect(doctor).toContain("<Accordion");
    expect(doctor).toContain("<CodeBlock");
    expect(doctor).toContain("<AlertAction");
  });
});
