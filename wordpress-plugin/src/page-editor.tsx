import { PluginDocumentSettingPanel } from "@wordpress/edit-post";
import { SelectControl, TextControl } from "@wordpress/components";
import { useDispatch, useSelect } from "@wordpress/data";
import { __ } from "@wordpress/i18n";
import { registerPlugin } from "@wordpress/plugins";

const PLUGIN_NAME = "byline-page-settings";
const EYEBROW_META_KEY = "_byline_page_eyebrow";
const INDEXING_META_KEY = "_byline_page_indexing";

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
      <SelectControl
        __nextHasNoMarginBottom
        label={__("Search engines", "weekly-wildcat-headless")}
        help={__("Public pages are listed in the sitemap. Hidden pages stay published but ask search engines to skip them. Internal pages are not published on the public site at all.", "weekly-wildcat-headless")}
        value={(meta[INDEXING_META_KEY] || "public") as "public" | "noindex" | "internal"}
        options={[
          { label: __("Public: include in search", "weekly-wildcat-headless"), value: "public" },
          { label: __("Hidden: published, but not in search", "weekly-wildcat-headless"), value: "noindex" },
          { label: __("Internal: not on the public site", "weekly-wildcat-headless"), value: "internal" }
        ]}
        onChange={(value) => editPost?.({ meta: { ...meta, [INDEXING_META_KEY]: value } })}
      />
    </PluginDocumentSettingPanel>
  );
}

registerPlugin(PLUGIN_NAME, { render: BylinePageSettings });
