import { BlockControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';
import { ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { copy, insertAfter, trash } from '@wordpress/icons';
import { useStepOperations } from '../scrolly/operations';
import { StoryCaption } from '../story/fields';
import { StoryImageInspector, StoryImagePlaceholder, StoryImageToolbar, useStoryImage } from '../story/media';
import { deprecated } from './deprecated';
import { ScrollyStepSave } from './save';
import { STEP_CONTENT, STEP_TEMPLATE } from './template';
import metadata from './block.json';
import './style.css';

const TEXT = 'weekly-wildcat-headless';

function Edit({ clientId, attributes: a, setAttributes }: any) {
  const onImage = useCallback((image: any) => setAttributes({ image }), [setAttributes]);
  const { select, setAlt, remove, credit, problem } = useStoryImage(a.image, onImage);
  const { root, index, count } = useSelect((store) => {
    const editor = store('core/block-editor') as any;
    const parent = editor.getBlockRootClientId(clientId);
    return { root: parent as string | undefined, index: editor.getBlockIndex(clientId) as number, count: editor.getBlockCount(parent) as number };
  }, [clientId]);
  const operations = useStepOperations(root);
  const hasPhoto = Boolean(a.image?.url);

  const blockProps = useBlockProps({ className: 'byline-scrolly-step-editor' });
  const textProps = useInnerBlocksProps({ className: 'byline-scrolly-text' }, { allowedBlocks: STEP_CONTENT, template: STEP_TEMPLATE });
  return <section {...blockProps}>
    <StoryImageToolbar image={a.image} name={__('Replace photograph', TEXT)} onSelect={select} onRemove={remove} />
    <StoryImageInspector title={__('Step photograph', TEXT)} image={a.image} credit={credit} problem={problem} onAlt={setAlt} />
    <BlockControls group="block">
      <ToolbarGroup>
        <ToolbarButton icon={insertAfter} label={__('Add step after this one', TEXT)} onClick={() => operations.add(clientId)} />
        <ToolbarButton icon={copy} label={__('Duplicate step', TEXT)} onClick={() => operations.duplicate(clientId)} />
        <ToolbarButton icon={trash} label={__('Remove step', TEXT)} onClick={() => operations.remove(clientId)} />
      </ToolbarGroup>
    </BlockControls>
    <div className="byline-kicker byline-scrolly-step-number">{sprintf(__('Step %1$d of %2$d', TEXT), index + 1, count)}{hasPhoto ? '' : ` · ${__('Text only', TEXT)}`}</div>
    <div className="byline-scrolly-step-layout">
      <figure className="byline-scrolly-media">
        {hasPhoto ? <>
          <img src={a.image.url} alt={a.image.alt || ''} width={a.image.width} height={a.image.height} />
          <figcaption>
            <StoryCaption label={__('Photograph caption', TEXT)} placeholder={__('Caption: what the photograph shows', TEXT)} value={a.caption} onChange={(caption) => setAttributes({ caption })} />
            {credit ? <p className="photo-credit">{sprintf(__('Photo: %s', TEXT), credit)}</p> : null}
          </figcaption>
          {problem === 'missing' ? <div className="byline-scrolly-warning" role="alert">{__('This photograph is no longer in the media library. Replace it before publishing.', TEXT)}</div> : null}
        </> : <>
          <StoryImagePlaceholder title={__('Photograph for this step', TEXT)} onSelect={select} />
          <div className="byline-scrolly-step-hint">{__('Optional. Leave it empty for a text-only step: the stage keeps the previous photograph.', TEXT)}</div>
        </>}
      </figure>
      <div {...textProps} />
    </div>
  </section>;
}

registerBlockType(metadata as any, { edit: Edit, save: ScrollyStepSave as any, deprecated: deprecated as any });
