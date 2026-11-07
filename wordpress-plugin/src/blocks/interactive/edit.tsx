import { BlockControls, InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { Button, FormFileUpload, Notice, PanelBody, Placeholder, ToolbarButton, ToolbarGroup } from '@wordpress/components';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import {
  INTERACTIVE_MAX_BYTES,
  INTERACTIVE_SANDBOX,
  decodeInteractiveDocument,
  encodeInteractiveDocument,
  interactiveFileProblem,
  interactiveMessageHeight,
  interactiveSrcdoc,
  type InteractiveFileProblem
} from '@byline/ui/interactive';
import { StoryCaption } from '../story/fields';
import { HeightChoice } from '../visualization/setup';

const ACCEPT = '.html,.htm,text/html';
const PROBLEMS: Record<InteractiveFileProblem | 'unreadable', string> = {
  empty: 'That file is empty.',
  'too-large': `That file is larger than ${INTERACTIVE_MAX_BYTES / 1024} KB. Load big libraries from a CDN instead of pasting them into the file.`,
  'not-html': 'That does not look like an HTML file. Upload the single .html file the interactive was built as.',
  unreadable: 'That file could not be read.'
};

const canAdd = () => Boolean((window as { bylineInteractive?: { canAdd?: boolean } }).bylineInteractive?.canAdd);

/** Reads one chosen file and returns the attributes to store, or the reason it was refused. */
async function readUpload(files: FileList | null): Promise<{ document: string; fileName: string } | { problem: string }> {
  const file = files?.[0];
  if (!file) return { problem: PROBLEMS.unreadable };
  if (file.size > INTERACTIVE_MAX_BYTES) return { problem: PROBLEMS['too-large'] };
  try {
    const html = await file.text();
    const problem = interactiveFileProblem(html);
    return problem ? { problem: PROBLEMS[problem] } : { document: encodeInteractiveDocument(html), fileName: file.name };
  } catch {
    return { problem: PROBLEMS.unreadable };
  }
}

/** The interactive itself, in the same sandbox readers get, at the height it reports. */
function Preview({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const view = frame.current?.ownerDocument.defaultView;
    if (!view) return;
    const listen = (event: MessageEvent) => {
      if (event.origin !== 'null' || event.source !== frame.current?.contentWindow) return;
      const next = interactiveMessageHeight(event.data);
      if (next !== null) setHeight(next);
    };
    view.addEventListener('message', listen);
    return () => view.removeEventListener('message', listen);
  }, []);
  const srcDoc = useMemo(() => interactiveSrcdoc(html), [html]);
  return <iframe ref={frame} className="byline-interactive-frame" title={title || 'Interactive'} sandbox={INTERACTIVE_SANDBOX} referrerPolicy="no-referrer" srcDoc={srcDoc} style={height ? { height } : undefined} />;
}

export function Edit({ attributes: a, setAttributes, isSelected }: any) {
  const [problem, setProblem] = useState('');
  const html = useMemo(() => (a.document ? decodeInteractiveDocument(a.document) : null), [a.document]);
  const editable = canAdd();
  const blockProps = useBlockProps({ className: 'byline-interactive', 'data-height': a.heightPreset });
  const upload = async (files: FileList | null) => {
    const result = await readUpload(files);
    if ('problem' in result) setProblem(result.problem);
    else { setProblem(''); setAttributes(result); }
  };
  const chooser = (label: string) => (
    <FormFileUpload accept={ACCEPT} onChange={(event: { currentTarget: HTMLInputElement }) => upload(event.currentTarget.files)}
      render={({ openFileDialog }: { openFileDialog: () => void }) => <Button variant="primary" onClick={openFileDialog}>{label}</Button>} />
  );

  if (!html) {
    return <div {...blockProps}>
      <Placeholder icon="editor-code" label="Interactive" className="byline-interactive-upload"
        instructions={editable
          ? 'Upload the single .html file for a small interactive: a chart, calculator, quiz, map or data explorer. It runs in its own sandboxed frame, cut off from the article and from WordPress.'
          : 'Only editors can add an interactive. Ask an editor to upload the file.'}>
        {editable && chooser('Upload HTML file')}
        {problem && <Notice status="error" isDismissible={false}>{problem}</Notice>}
      </Placeholder>
    </div>;
  }

  const missing = [!a.title.trim() && 'a title', !a.description.trim() && 'a description'].filter(Boolean);
  return <figure {...blockProps}>
    {editable && <BlockControls group="block">
      <ToolbarGroup>
        <FormFileUpload accept={ACCEPT} onChange={(event: { currentTarget: HTMLInputElement }) => upload(event.currentTarget.files)}
          render={({ openFileDialog }: { openFileDialog: () => void }) => <ToolbarButton onClick={openFileDialog}>Replace file</ToolbarButton>} />
        <ToolbarButton isDestructive onClick={() => setAttributes({ document: '', fileName: '' })}>Remove file</ToolbarButton>
      </ToolbarGroup>
    </BlockControls>}
    <InspectorControls><PanelBody title="Interactive" initialOpen>
      <p className="byline-interactive-file"><strong>{a.fileName || 'interactive.html'}</strong> · {Math.ceil(new TextEncoder().encode(html).length / 1024)} KB</p>
      <p className="byline-viz-help">It runs in a sandboxed frame: it cannot read or change the article, use cookies or storage, open windows or submit forms. Handle input with JavaScript events.</p>
      <HeightChoice value={a.heightPreset} onChange={(heightPreset) => setAttributes({ heightPreset })}
        help="The frame starts at this height so the page does not jump, then takes the height the interactive needs." />
    </PanelBody></InspectorControls>

    <StoryCaption singleLine className="byline-interactive-title byline-viz-field" label="Title" value={a.title} placeholder="Say what readers can do: Find your lunch wave" onChange={(title) => setAttributes({ title })} />
    <StoryCaption className="byline-interactive-description byline-viz-field" label="Description" value={a.description} placeholder="Describe what it shows and what someone who cannot use it should know" onChange={(description) => setAttributes({ description })} />
    <Preview html={html} title={a.title} />
    {(isSelected || a.credit) && <figcaption>
      <p className="byline-viz-line photo-credit"><span aria-hidden="true">Credit:</span><StoryCaption singleLine className="byline-viz-field" label="Credit" value={a.credit} placeholder="Who made this interactive" onChange={(credit) => setAttributes({ credit })} /></p>
    </figcaption>}
    {problem && <Notice status="error" isDismissible={false}>{problem}</Notice>}
    {missing.length > 0 && <Notice status="warning" isDismissible={false}>Add {missing.join(' and ')}. Readers rely on them, and the interactive is not published without them.</Notice>}
  </figure>;
}
