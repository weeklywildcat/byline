import { InnerBlocks, InspectorControls, RichText, useBlockProps } from "@wordpress/block-editor";
import { PanelBody, SelectControl } from "@wordpress/components";
import { registerBlockType } from "@wordpress/blocks";
import { __ } from "@wordpress/i18n";

import metadata from "./block.json";
import "./style.css";

const ALLOWED_BLOCKS = [
  "core/paragraph",
  "core/heading",
  "core/image",
  "core/gallery",
  "core/list",
  "core/quote",
  "core/pullquote",
  "core/group",
  "core/columns",
  "core/buttons",
  "core/button",
  "core/separator",
  "core/spacer",
  "core/embed",
  "core/table"
];

const TEMPLATE = [["core/paragraph", { placeholder: __("Add section content…", "weekly-wildcat-headless") }]];

const HEADING_LEVEL_OPTIONS = [2, 3, 4].map((level) => ({
  label: `H${level}`,
  value: String(level)
}));

function headingTag(level: unknown): "h2" | "h3" | "h4" {
  return level === 3 ? "h3" : level === 4 ? "h4" : "h2";
}

function PageSectionEdit({ attributes, setAttributes }: any) {
  const tagName = headingTag(attributes.headingLevel);
  const blockProps = useBlockProps({ className: attributes.className });

  return (
    <>
      <InspectorControls>
        <PanelBody title={__("Page section", "weekly-wildcat-headless")} initialOpen>
          <SelectControl
            __nextHasNoMarginBottom
            label={__("Heading level", "weekly-wildcat-headless")}
            help={__("Use H2 for a top-level page section. Use H3 or H4 only when this section is nested under another heading.", "weekly-wildcat-headless")}
            value={String(attributes.headingLevel || 2)}
            options={HEADING_LEVEL_OPTIONS}
            onChange={(value: string) => setAttributes({ headingLevel: Number.parseInt(value, 10) || 2 })}
          />
        </PanelBody>
      </InspectorControls>

      <section {...blockProps}>
        <RichText
          tagName={tagName}
          className="wp-block-heading"
          value={attributes.heading}
          allowedFormats={[]}
          placeholder={__("Section heading", "weekly-wildcat-headless")}
          onChange={(heading: string) => setAttributes({ heading })}
        />
        <div className="wp-block-byline-page-section__body">
          <InnerBlocks allowedBlocks={ALLOWED_BLOCKS} template={TEMPLATE} templateLock={false} />
        </div>
      </section>
    </>
  );
}

function PageSectionSave({ attributes }: any) {
  const tagName = headingTag(attributes.headingLevel);
  const blockProps = useBlockProps.save({ className: attributes.className });

  return (
    <section {...blockProps}>
      <RichText.Content tagName={tagName} className="wp-block-heading" value={attributes.heading} />
      <div className="wp-block-byline-page-section__body">
        <InnerBlocks.Content />
      </div>
    </section>
  );
}

registerBlockType(metadata as any, {
  edit: PageSectionEdit,
  save: PageSectionSave
});
