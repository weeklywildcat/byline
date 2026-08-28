import { __unstableGetInnerBlocksProps } from "@wordpress/blocks";

export const InnerBlocks: any = () => null;
InnerBlocks.Content = () => __unstableGetInnerBlocksProps().children;

export const InspectorControls = () => null;
export const RichText: any = Object.assign(() => null, { Content: () => null });
export const useBlockProps: any = Object.assign(() => ({}), { save: () => ({}) });
