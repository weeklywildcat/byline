import { InspectorControls, RichText, useBlockProps } from "@wordpress/block-editor";
import { PanelBody, SelectControl, TextControl } from "@wordpress/components";
import { date } from "@wordpress/date";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";
import { useEffect } from "@wordpress/element";

import metadata from "./block.json";
import "./style.css";

const typeOptions = [
  { label: __("Correction", "weekly-wildcat-headless"), value: "correction" },
  { label: __("Clarification", "weekly-wildcat-headless"), value: "clarification" },
  { label: __("Editor's note", "weekly-wildcat-headless"), value: "editors-note" }
];

function CorrectionNoticeEdit({ attributes, setAttributes }: any) {
  const blockProps = useBlockProps({ className: "byline-correction-notice byline-newsroom-block-editor" });

  useEffect(() => {
    if (!attributes.date) {
      setAttributes({ date: date("Y-m-d") });
    }
  }, [attributes.date, setAttributes]);

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Correction notice", "weekly-wildcat-headless")} initialOpen>
          <SelectControl __nextHasNoMarginBottom label={__("Notice type", "weekly-wildcat-headless")} value={attributes.type || "correction"} options={typeOptions} onChange={(type: string) => setAttributes({ type })} />
          <TextControl __nextHasNoMarginBottom label={__("Date", "weekly-wildcat-headless")} help={__("Use the publication date format YYYY-MM-DD. This is stored in the post content, not as poll or workflow data.", "weekly-wildcat-headless")} value={attributes.date || ""} placeholder="YYYY-MM-DD" onChange={(date: string) => setAttributes({ date })} />
        </PanelBody>
      </InspectorControls>
      <aside {...blockProps}>
        <p className="byline-correction-notice-label">{typeOptions.find((option) => option.value === attributes.type)?.label || __("Correction", "weekly-wildcat-headless")}</p>
        <RichText
          tagName="p"
          className="byline-correction-notice-body"
          value={attributes.notice || ""}
          placeholder={__("Explain clearly what changed…", "weekly-wildcat-headless")}
          allowedFormats={[]}
          onChange={(notice: string) => setAttributes({ notice })}
        />
        {attributes.date ? <time dateTime={attributes.date}>{attributes.date}</time> : <span className="byline-correction-date-placeholder">{__("Add a date in the block settings.", "weekly-wildcat-headless")}</span>}
      </aside>
    </>
  );
}

function CorrectionNoticeSave({ attributes }: any) {
  const blockProps = useBlockProps.save({
    className: `byline-correction-notice byline-correction-notice-${attributes.type || "correction"}`,
    "data-correction-type": attributes.type || "correction"
  });

  return (
    <aside {...blockProps}>
      <p className="byline-correction-notice-label">{typeOptions.find((option) => option.value === attributes.type)?.label || __("Correction", "weekly-wildcat-headless")}</p>
      <RichText.Content tagName="p" className="byline-correction-notice-body" value={attributes.notice || ""} />
      {attributes.date ? <time dateTime={attributes.date}>{attributes.date}</time> : null}
    </aside>
  );
}

registerBlockType(metadata as any, { edit: CorrectionNoticeEdit, save: CorrectionNoticeSave });
