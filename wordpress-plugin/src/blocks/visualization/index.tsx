import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { Notice, PanelBody, SelectControl, TextControl, TextareaControl } from '@wordpress/components';
import { registerBlockType } from '@wordpress/blocks';
import { visualizationUrl, visualizationHeights } from '@byline/ui/visualization';
import { StoryMedia } from '../story/media';
import { VisualizationSave } from './save';
import metadata from './block.json';
import './style.css';
function Edit({ attributes: a, setAttributes }: any) {
  const field = (label: string, key: string) => <TextControl __nextHasNoMarginBottom label={label} value={a[key]} onChange={(value: string) => setAttributes({ [key]: value })} />;
  const select = (label: string, key: string, values: string[]) => <SelectControl __nextHasNoMarginBottom label={label} value={a[key]} options={values.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value }))} onChange={(value: string) => setAttributes({ [key]: value })} />;
  const provider = visualizationUrl(a.embedUrl || '');
  return <div {...useBlockProps({ className: 'byline-visualization' })}>
    <InspectorControls><PanelBody title="Visualization settings">
      {select('Visualization type', 'type', ['chart','map','interactive'])}
      {select('Presentation', 'mode', ['embed','static'])}
      {select('Height', 'heightPreset', Object.keys(visualizationHeights))}
      <p>Initial target: {visualizationHeights[a.heightPreset as keyof typeof visualizationHeights] || 480}px. Supported charts resize with their content.</p>
    </PanelBody></InspectorControls>
    {field('Visualization title', 'title')}{field('Short description', 'description')}
    {a.mode === 'embed' && <>
      <TextControl __nextHasNoMarginBottom label="Embed URL" help="Datawrapper, Flourish, Google Maps embed or OpenStreetMap embed URL. Paste a URL, never iframe code." value={a.embedUrl} onChange={(embedUrl: string) => setAttributes({ embedUrl, provider: visualizationUrl(embedUrl)?.provider || '' })} />
      {a.embedUrl && !provider && <Notice status="warning" isDismissible={false}>Use an HTTPS URL from a supported provider.</Notice>}
      {provider && <p>Provider: {provider.provider}. The private preview uses the graphic fallback; public readers can load the interactive graphic.</p>}
    </>}
    <StoryMedia label={a.mode === 'static' ? 'static graphic' : 'fallback graphic'} image={a.image} onChange={(image) => setAttributes({ image })} />
    {a.mode === 'static' && !a.image?.url && <p>Select an exported chart or map from the media library.</p>}
    {field('Source', 'source')}<TextareaControl __nextHasNoMarginBottom label="Notes" value={a.notes} onChange={(notes: string) => setAttributes({ notes })} />{field('Credit', 'credit')}
  </div>;
}
registerBlockType(metadata as any, { edit: Edit, save: VisualizationSave as any });
