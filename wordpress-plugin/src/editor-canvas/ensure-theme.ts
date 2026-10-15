import { dispatch, select } from "@wordpress/data";
import { editorThemeCss } from "./theme-css";

type EditorStyle = { css?: string };

/**
 * Add the theme variables to the editor's own style list. Settings are the only
 * route that reaches the iframed canvas with the same prefixing WordPress gives
 * theme styles; the stylesheet itself is enqueued from PHP.
 *
 * The editor can re-apply its initial settings after we run, so this keeps
 * checking and re-adds the CSS if it is missing. The check makes it a no-op once
 * the styles are in place.
 */
export function ensureEditorTheme(css: string = editorThemeCss()): void {
  const editor = select("core/editor") as {
    getEditorSettings?: () => { styles?: EditorStyle[] } | undefined;
    getCurrentPostType?: () => string | null;
  } | undefined;
  const settings = editor?.getEditorSettings?.();
  if (!settings || editor?.getCurrentPostType?.() !== "post") return;

  const styles = Array.isArray(settings.styles) ? settings.styles : [];
  if (styles.some((style) => style.css === css)) return;

  (dispatch("core/editor") as { updateEditorSettings?: (next: Record<string, unknown>) => void })
    .updateEditorSettings?.({ styles: [...styles, { css }] });
}
