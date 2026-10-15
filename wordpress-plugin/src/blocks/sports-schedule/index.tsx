import { useBlockProps } from "@wordpress/block-editor";
import { registerBlockType } from "@wordpress/blocks";
import metadata from "./block.json";
import "./style.css";

// Read-only compatibility for saved content. New archives use native Page blocks.
registerBlockType(metadata.name, {
  ...metadata,
  edit() {
    return <div {...useBlockProps()}><p>Historical sports block. Sports records are preserved in the Sports Archive Pages.</p></div>;
  },
  save() { return null; }
} as any);
