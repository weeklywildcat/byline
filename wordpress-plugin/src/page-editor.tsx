import { PluginDocumentSettingPanel } from "@wordpress/edit-post";
import { TextControl } from "@wordpress/components";
import { useDispatch, useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import { registerPlugin } from "@wordpress/plugins";

const PLUGIN_NAME = "byline-page-settings";
const EYEBROW_META_KEY = "_byline_page_eyebrow";

function BylinePageSettings() {
  const { postType, meta } = useSelect((select: any) => {
    const editor = select("core/editor");
    return {
      postType: editor?.getCurrentPostType?.() as string,
      meta: (editor?.getEditedPostAttribute?.("meta") || {}) as Record<string, string>
    };
  }, []);
  const { editPost } = useDispatch("core/editor") as {
    editPost?: (attributes: Record<string, unknown>) => void;
  };

  if (postType !== "page") return null;

  return (
    <PluginDocumentSettingPanel
      name={PLUGIN_NAME}
      title={__("Byline Page", "weekly-wildcat-headless")}
      initialOpen
    >
      <TextControl
        __nextHasNoMarginBottom
        label={__("Eyebrow", "weekly-wildcat-headless")}
        help={__("Small label shown above the page title.", "weekly-wildcat-headless")}
        value={meta[EYEBROW_META_KEY] || ""}
        onChange={(value: string) => editPost?.({ meta: { ...meta, [EYEBROW_META_KEY]: value } })}
      />
    </PluginDocumentSettingPanel>
  );
}

registerPlugin(PLUGIN_NAME, { render: BylinePageSettings });
