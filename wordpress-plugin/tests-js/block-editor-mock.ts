import { createRequire } from "node:module";
// The CJS build @wordpress/blocks uses, so RawHTML is recognised by its serializer.
const fromBlocks = createRequire(createRequire(import.meta.url).resolve("@wordpress/blocks"));
const { createElement, RawHTML } = fromBlocks("@wordpress/element");
import { __unstableGetBlockProps, __unstableGetInnerBlocksProps } from "@wordpress/blocks";

export const InnerBlocks: any = () => null;
InnerBlocks.Content = () => __unstableGetInnerBlocksProps().children;

export const InspectorControls = () => null;
/** RichText.Content writes the stored HTML inside its tag, as Gutenberg does. */
export const RichText: any = Object.assign(() => null, {
  Content: ({ tagName, value, className }: { tagName?: string; value?: string; className?: string }) =>
    tagName ? createElement(tagName, className ? { className } : null, createElement(RawHTML, null, value ?? "")) : createElement(RawHTML, null, value ?? "")
});
/** Mirrors Gutenberg: save props are the wrapper props, then the editor's save-time hooks run (see the legacy markup test). */
export const useBlockProps: any = Object.assign(() => ({}), { save: (props: Record<string, unknown> = {}) => __unstableGetBlockProps(props) });

export const BlockControls: any = () => null;
export const MediaPlaceholder: any = () => null;
export const MediaReplaceFlow: any = () => null;
export const MediaUpload: any = () => null;
export const MediaUploadCheck: any = () => null;
export const PlainText: any = () => null;
export const useInnerBlocksProps: any = (props: Record<string, unknown> = {}) => props;
