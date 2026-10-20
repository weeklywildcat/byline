import { BlockControls, InspectorControls, MediaPlaceholder, MediaReplaceFlow } from '@wordpress/block-editor';
import apiFetch from '@wordpress/api-fetch';
import { Notice, PanelBody, TextareaControl, ToolbarButton } from '@wordpress/components';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { creditFromMedia, imageFromMedia, type StoryImage } from './models';

const TEXT = 'weekly-wildcat-headless';
const MEDIA_FIELDS = 'id,source_url,alt_text,media_details,byline_story_image';

/**
 * Photograph selection for story blocks.
 *
 * The media library stays canonical. Choosing a photograph saves a slim
 * snapshot (id, url, alt, size); the attachment is then read once more to fill
 * in anything the picker did not return. Later edits to the alt text cancel that
 * lookup so a slow response can never overwrite what the writer typed, and the
 * credit and any "this photograph was deleted" state come from the attachment
 * as it is now, not from a copy taken when the block was last saved.
 */
export function useStoryImage(image: StoryImage | undefined, onChange: (image: StoryImage) => void) {
  const selection = useRef(0);
  const mounted = useRef(true);
  const [credit, setCredit] = useState('');
  const [problem, setProblem] = useState<'' | 'missing' | 'lookup'>('');
  const id = image?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!id) { setCredit(''); setProblem(''); return; }
    let live = true;
    apiFetch<any>({ path: `/wp/v2/media/${id}?context=edit&_fields=${MEDIA_FIELDS}` })
      .then((media) => { if (live) { setCredit(creditFromMedia(media)); setProblem(''); } })
      .catch((error: any) => { if (live) setProblem(error?.data?.status === 404 || error?.code === 'rest_post_invalid_id' ? 'missing' : 'lookup'); });
    return () => { live = false; };
  }, [id]);

  const select = useCallback((media: any) => {
    const current = ++selection.current;
    onChange(imageFromMedia(media));
    setProblem('');
    if (!media?.id) return;
    apiFetch<any>({ path: `/wp/v2/media/${media.id}?context=edit&_fields=${MEDIA_FIELDS}` })
      .then((attachment) => {
        if (!mounted.current || current !== selection.current) return;
        onChange(imageFromMedia(attachment));
        setCredit(creditFromMedia(attachment));
      })
      .catch(() => { if (mounted.current) setProblem('lookup'); });
  }, [onChange]);

  const setAlt = useCallback((alt: string) => { selection.current++; if (image) onChange({ ...image, alt }); }, [image, onChange]);
  const remove = useCallback(() => { selection.current++; setCredit(''); setProblem(''); onChange({ url: '', alt: '' }); }, [onChange]);
  return { select, setAlt, remove, credit, problem };
}

/** The empty state: Gutenberg's own upload / library / drag-and-drop placeholder. */
export function StoryImagePlaceholder({ title, instructions, onSelect, icon = 'format-image' }: { title: string; instructions?: string; onSelect: (media: any) => void; icon?: string }) {
  return <MediaPlaceholder icon={icon} labels={{ title, instructions: instructions || __('Upload a photograph, choose one from the media library, or drop one here.', TEXT) }} allowedTypes={['image']} accept="image/*" multiple={false} onSelect={onSelect} />;
}

/** Block toolbar actions for a photograph: replace it (Gutenberg's own flow) or remove it. */
export function StoryImageToolbar({ image, name, onSelect, onRemove }: { image?: StoryImage; name?: string; onSelect: (media: any) => void; onRemove?: () => void }) {
  if (!image?.url) return null;
  return <BlockControls group="other">
    <MediaReplaceFlow mediaId={image.id} mediaURL={image.url} allowedTypes={['image']} accept="image/*" name={name || __('Replace photograph', TEXT)} onSelect={onSelect} />
    {onRemove ? <ToolbarButton onClick={onRemove}>{__('Remove', TEXT)}</ToolbarButton> : null}
  </BlockControls>;
}

/** Sidebar panel for one photograph: alt text, the credit WordPress will print, and anything wrong with the attachment. */
export function StoryImageInspector({ title = __('Photograph', TEXT), image, credit, problem, onAlt }: { title?: string; image?: StoryImage; credit?: string; problem?: '' | 'missing' | 'lookup'; onAlt: (alt: string) => void }) {
  if (!image?.url) return null;
  return <InspectorControls><PanelBody title={title} initialOpen>
    <TextareaControl __nextHasNoMarginBottom label={__('Alternative text', TEXT)} help={__('Describe what is in the photograph for readers who cannot see it. The caption and credit are separate.', TEXT)} value={image.alt || ''} rows={3} onChange={onAlt} />
    {!image.alt ? <Notice status="warning" isDismissible={false}>{__('No alternative text yet. Screen-reader users will not know what this photograph shows.', TEXT)}</Notice> : null}
    <p className="byline-story-image-credit">{credit ? `${__('Credit:', TEXT)} ${credit}` : __('No credit is set for this photograph in the media library.', TEXT)}</p>
    {problem === 'missing' ? <Notice status="error" isDismissible={false}>{__('This photograph is no longer in the media library. Replace it before publishing.', TEXT)}</Notice> : null}
    {problem === 'lookup' ? <Notice status="warning" isDismissible={false}>{__('Could not check this photograph in the media library. Its credit may be out of date.', TEXT)}</Notice> : null}
  </PanelBody></InspectorControls>;
}

export { StoryMedia } from './legacy-media';
