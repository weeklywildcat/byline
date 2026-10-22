import { describe, expect, it, vi } from "vitest";
import { StoryTitleButton } from "../src/story/story-parts";

/**
 * A StoryHoverCard wraps the title and, while its preview is open, hands the
 * button an onClick of its own. That used to replace the one that opens Story
 * Peek, so clicking a title the cursor had rested on did nothing.
 */
describe("StoryTitleButton", () => {
  const story = { id: 7, title: "Canteen could return" };
  // The component is a plain function without hooks, so its element can be inspected and driven directly.
  const render = (props: Record<string, unknown> = {}, onOpen = vi.fn()) => (StoryTitleButton as unknown as (p: unknown) => { props: { onClick: (event: unknown) => void; className: string; "data-story-title"?: string } })({ story, onOpen, ...props });

  it("opens Peek for its story", () => {
    const onOpen = vi.fn();
    render({}, onOpen).props.onClick({});
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("still opens Peek, and runs the click handler a wrapping hover card injects", () => {
    const onOpen = vi.fn();
    const injected = vi.fn();
    const event = { type: "click" };
    render({ onClick: injected }, onOpen).props.onClick(event);
    expect(injected).toHaveBeenCalledWith(event);
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("keeps the other props a trigger passes", () => {
    expect(render({ "data-story-title": "7", className: "text-sm" }).props).toMatchObject({ "data-story-title": "7" });
    expect(render({ className: "text-sm" }).props.className).toContain("text-sm");
  });
});
