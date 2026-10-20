import { BlockControls, InspectorControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { Button, PanelBody, Path, SVG, ToolbarButton } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { plus } from '@wordpress/icons';
import { StoryBoard } from './board';
import { FitChoice } from './fit';
import { useStepOperations, useStorySteps } from './operations';
import { ReaderPreview } from './preview';
import { ScrollySave } from './save';
import metadata from './block.json';
import './style.css';

const TEXT = 'weekly-wildcat-headless';
export const SCROLLY_CHILDREN = ['byline/scrolly-step'];

/** A tall stage beside lines of text: the picture that stays while the reporting scrolls. */
const icon = <SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><Path d="M4 4.5h9v15H4v-15Zm1.5 1.5v12h6V6h-6ZM15.5 7H20V8.5h-4.5V7Zm0 3.5H20V12h-4.5v-1.5Zm0 3.5H19v1.5h-3.5V14Z" /></SVG>;

function Edit({ clientId, attributes, setAttributes }: any) {
  const [announcement, announce] = useState('');
  const { steps, activeId, activeIndex } = useStorySteps(clientId);
  const operations = useStepOperations(clientId, announce);
  const fit = attributes.fit === 'cover' ? 'cover' : 'contain';
  const blockProps = useBlockProps({ className: 'byline-scrolly-editor' });
  const innerBlocksProps = useInnerBlocksProps({ className: 'byline-scrolly-steps' }, {
    allowedBlocks: SCROLLY_CHILDREN,
    template: [['byline/scrolly-step'], ['byline/scrolly-step']],
    renderAppender: () => <Button className="byline-scrolly-add" variant="secondary" icon={plus} onClick={() => operations.add()}>{__('Add step', TEXT)}</Button>
  });
  return <div {...blockProps}>
    <InspectorControls>
      <PanelBody title={__('Photographs', TEXT)} initialOpen>
        <FitChoice value={fit} onChange={(next) => setAttributes({ fit: next })} />
      </PanelBody>
    </InspectorControls>
    <BlockControls group="block"><ToolbarButton icon={plus} label={__('Add step', TEXT)} onClick={() => operations.add(activeId)} /></BlockControls>
    <StoryBoard steps={steps} activeId={activeId} operations={operations} announcement={announcement} />
    <ReaderPreview steps={steps} activeIndex={activeIndex} fit={fit} onStep={(index) => operations.choose(steps[index].clientId)} />
    <div {...innerBlocksProps} />
  </div>;
}

registerBlockType(metadata as any, { icon, edit: Edit, save: ScrollySave as any });
