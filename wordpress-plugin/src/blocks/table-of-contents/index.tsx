import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { PanelBody, SelectControl, ToggleControl } from '@wordpress/components';
import { StoryTextControl } from '../story/fields';
import { registerBlockType } from '@wordpress/blocks';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect } from '@wordpress/element';
import { headingAnchorUpdates, storyHeadings, type StoryBlock } from '../story/headings';
import metadata from './block.json';
import './style.css';
function Edit({ attributes, setAttributes }: any) {
  const blocks = useSelect((select) => (select('core/block-editor') as any).getBlocks() as StoryBlock[], []);
  const { updateBlockAttributes } = useDispatch('core/block-editor') as any;
  useEffect(() => {
    headingAnchorUpdates(blocks, attributes.maxLevel).forEach(({ clientId, anchor }) => updateBlockAttributes(clientId, { anchor }));
  }, [blocks, attributes.maxLevel, updateBlockAttributes]);
  const headings = storyHeadings(blocks, attributes.maxLevel);
  const List = attributes.ordered ? 'ol' : 'ul';
  return <>
    <InspectorControls><PanelBody title="Contents settings">
      <StoryTextControl label="Title" value={attributes.title} onChange={(title: string) => setAttributes({ title })} />
      <SelectControl __nextHasNoMarginBottom label="Include headings" value={attributes.maxLevel === 2 ? "2" : "3"} options={[{ label: 'H2 and H3', value: '3' }, { label: 'H2 only', value: '2' }]} onChange={(value: string) => setAttributes({ maxLevel: Number(value) })} />
      <ToggleControl __nextHasNoMarginBottom label="Numbered list" checked={attributes.ordered} onChange={(ordered: boolean) => setAttributes({ ordered })} />
    </PanelBody></InspectorControls>
    <nav {...useBlockProps({ className: 'byline-table-of-contents' })} aria-label={attributes.title || 'In this story'}>
      <h2>{attributes.title}</h2>
      {headings.length < 2 ? <p>Add at least two H2/H3 headings to populate In This Story. Existing heading anchors stay stable when you edit their text.</p> : <List>{headings.map((heading: any) => <li className={`byline-toc-level-${heading.level}`} key={heading.anchor}>{heading.text}</li>)}</List>}
    </nav>
  </>;
}
registerBlockType(metadata as any, { edit: Edit, save: () => null });
