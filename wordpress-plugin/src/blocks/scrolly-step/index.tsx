import { InnerBlocks, useBlockProps } from '@wordpress/block-editor';
import { StoryTextControl } from '../story/fields';
import { registerBlockType } from '@wordpress/blocks';
import { StoryMedia } from '../story/media';
import { ScrollyStepSave } from './save';
import metadata from './block.json';
import './style.css';
export const STEP_CONTENT = ['core/heading','core/paragraph','core/list','core/quote'];
function Edit({ attributes: a, setAttributes }: any) {
  return <section {...useBlockProps({ className: 'byline-scrolly-step' })}>
    <StoryMedia label="step image" image={a.image} onChange={(image) => setAttributes({ image })} />
    <StoryTextControl label="Step image caption" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
    <InnerBlocks allowedBlocks={STEP_CONTENT} template={[["core/heading", { level: 2, placeholder: 'Step heading…' }], ["core/paragraph", { placeholder: 'Continue the reporting…' }]]} />
  </section>;
}
registerBlockType(metadata as any, { edit: Edit, save: ScrollyStepSave as any });
