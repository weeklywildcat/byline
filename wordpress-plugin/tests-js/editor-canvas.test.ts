import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  settings: { styles: [{ css: "body { margin: 0; }" }] } as { styles: { css: string }[] } | undefined,
  postType: "post" as string | null,
  updateEditorSettings: vi.fn()
}));

vi.mock("@wordpress/data", () => ({
  select: () => ({ getEditorSettings: () => store.settings, getCurrentPostType: () => store.postType }),
  dispatch: () => ({ updateEditorSettings: store.updateEditorSettings }),
  subscribe: vi.fn()
}));

import { ensureEditorTheme } from "../src/editor-canvas/ensure-theme";
import { editorThemeCss } from "../src/editor-canvas/theme-css";

describe("editor canvas theme", () => {
  beforeEach(() => {
    store.settings = { styles: [{ css: "body { margin: 0; }" }] };
    store.postType = "post";
    store.updateEditorSettings.mockClear();
  });

  it("exposes the theme tokens on the editor canvas", () => {
    const css = editorThemeCss();
    expect(css.startsWith(".editor-styles-wrapper {")).toBe(true);
    for (const variable of ["--ink", "--accent", "--article-width", "--font-headline", "--font-serif", "--font-ui"]) {
      expect(css).toContain(`${variable}:`);
    }
  });

  it("appends the theme to the existing editor styles once", () => {
    ensureEditorTheme();
    expect(store.updateEditorSettings).toHaveBeenCalledTimes(1);
    const next = store.updateEditorSettings.mock.calls[0][0].styles as { css: string }[];
    expect(next[0].css).toBe("body { margin: 0; }");
    expect(next.at(-1)?.css).toBe(editorThemeCss());

    store.settings = { styles: next };
    ensureEditorTheme();
    expect(store.updateEditorSettings).toHaveBeenCalledTimes(1);
  });

  it("re-adds the theme if the editor resets its settings", () => {
    store.settings = { styles: [{ css: editorThemeCss() }] };
    ensureEditorTheme();
    expect(store.updateEditorSettings).not.toHaveBeenCalled();

    store.settings = { styles: [] };
    ensureEditorTheme();
    expect(store.updateEditorSettings).toHaveBeenCalledTimes(1);
  });

  it("leaves other post types and an uninitialised editor alone", () => {
    store.postType = "page";
    ensureEditorTheme();
    store.postType = "post";
    store.settings = undefined;
    ensureEditorTheme();
    expect(store.updateEditorSettings).not.toHaveBeenCalled();
  });
});
