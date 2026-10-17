import { InnerBlocks, InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { PanelBody, SelectControl } from '@wordpress/components';
import { registerBlockType } from '@wordpress/blocks';
import { ScrollySave } from './save';
import metadata from './block.json';
import './style.css';
export const SCROLLY_CHILDREN = ['byline/scrolly-step'];
function Edit({ attributes, setAttributes }: any) {
  return <div {...useBlockProps({ className: 'byline-scrolly-editor' })}>
    <InspectorControls><PanelBody title="Story images"><SelectControl __nextHasNoMarginBottom label="Stage image fit" value={attributes.fit} options={[{ label: 'Show complete image', value: 'contain' }, { label: 'Fill stage (crop)', value: 'cover' }]} onChange={(fit: string) => setAttributes({ fit })} /></PanelBody></InspectorControls>
    <p>Scrollytelling · Add an image and reporting to each step. Reorder steps in List View. Phones and reduced-motion readers see the complete linear story.</p>
    <InnerBlocks allowedBlocks={SCROLLY_CHILDREN} template={[["byline/scrolly-step"], ["byline/scrolly-step"]]} renderAppender={InnerBlocks.ButtonBlockAppender} />
  </div>;
}
registerBlockType(metadata as any, { edit: Edit, save: ScrollySave as any });
