import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("presence toolbar presentation", () => {
  it("uses a plain active AvatarBadge and icons only for away/offline", () => {
    const source = read("src/presence/PresencePanel.tsx");
    expect(source).toContain('import { Clock3, Minus, Users } from "lucide-react"');
    expect(source).toContain("<AvatarBadge");
    expect(source).toContain("{badgeIcon(person.status)}</AvatarBadge>");
    expect(source).toContain('status === "active"');
    expect(source).not.toContain("<Check");
    expect(source).toContain("<Clock3");
    expect(source).toContain("<Minus");
  });

  it("keeps the WordPress toolbar group compact without using the 24px sm avatar", () => {
    const source = read("src/presence/PresencePanel.tsx");
    expect(source).toContain("online.slice(0, 3)");
    expect(source).toContain('toolbar ? "size-7"');
    expect(source).toContain('className="size-7 bg-neutral-700');
    expect(source).toContain('aria-expanded:bg-transparent');
    expect(source).toContain('hover:bg-transparent');
    expect(source).not.toContain("online.slice(0, 4)");
  });

  it("reasserts 28px avatar geometry against WordPress admin-bar resets and leaves badges unclipped", () => {
    const php = read("includes/admin/presence.php");
    expect(php).toContain("height:28px;");
    expect(php).toContain("flex:0 0 28px;");
    expect(php).toContain("overflow:visible;");
    expect(php).toContain("background:transparent !important;");
    expect(php).toContain('button[aria-expanded="true"]');
    expect(php).toContain("width:10px;");
    expect(php).toContain('[data-slot="avatar-badge"] > svg');
    expect(php).toContain("width:6px;");
  });
});
