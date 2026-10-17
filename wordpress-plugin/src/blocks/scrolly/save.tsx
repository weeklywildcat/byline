import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
export function ScrollySave({ attributes }: any) {
  return <section {...useBlockProps.save({ className: 'byline-scrolly' })} data-fit={attributes.fit} aria-label="Visual story"><InnerBlocks.Content /></section>;
}
