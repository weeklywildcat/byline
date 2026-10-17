import { useBlockProps } from '@wordpress/block-editor';
import { Notice } from '@wordpress/components';
import { registerBlockType } from '@wordpress/blocks';
import { StoryMedia } from '../story/media';
import { StoryTextControl } from '../story/fields';
import { mismatchedRatios } from '../story/models';
import { BeforeAfterSave } from './save';
import metadata from './block.json';
import './style.css';
function Edit({ attributes: a, setAttributes }: any) {
  return <div {...useBlockProps({ className: 'byline-before-after' })}>
    <div className="byline-comparison-images">
      <div><StoryMedia label="before image" image={a.before} onChange={(before) => setAttributes({ before })} /><StoryTextControl label="Before label" value={a.beforeLabel} onChange={(beforeLabel: string) => setAttributes({ beforeLabel })} /></div>
      <div><StoryMedia label="after image" image={a.after} onChange={(after) => setAttributes({ after })} /><StoryTextControl label="After label" value={a.afterLabel} onChange={(afterLabel: string) => setAttributes({ afterLabel })} /></div>
    </div>
    {mismatchedRatios(a.before, a.after) && <Notice status="warning" isDismissible={false}>These photographs have different proportions. Similar framing works best; both complete images remain available in the fallback.</Notice>}
    {(!a.before?.url || !a.after?.url) && <p>Choose both photographs to complete this comparison.</p>}
    <StoryTextControl label="Comparison caption" value={a.caption} onChange={(caption: string) => setAttributes({ caption })} />
  </div>;
}
registerBlockType(metadata as any, { edit: Edit, save: BeforeAfterSave as any });
