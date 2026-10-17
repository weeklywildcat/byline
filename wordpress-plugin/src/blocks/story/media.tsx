import { MediaUpload, MediaUploadCheck } from '@wordpress/block-editor';
import { Button, TextControl } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import { useRef, useEffect, useState } from '@wordpress/element';
import { imageFromMedia, type StoryImage } from './models';

/** Native WP attachments remain canonical; the serialized snapshot serves the
 * static site and uses the same attribution resolver as the article adapter. */
export function StoryMedia({ image, onChange, label }: { image?: StoryImage; onChange: (image: StoryImage) => void; label: string }) {
  const selection = useRef(0);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <div className="byline-story-media-editor">
    <MediaUploadCheck><MediaUpload allowedTypes={['image']} value={image?.id} onSelect={async (media: any) => {
      const current = ++selection.current;
      onChange(imageFromMedia(media)); setError('');
      if (!media.id) return;
      try {
        const attachment = await apiFetch({ path: `/wp/v2/media/${media.id}?context=edit` });
        if (mounted.current && current === selection.current) onChange(imageFromMedia(attachment));
      } catch { if (mounted.current) setError('Attachment selected. Reopen the media library to refresh its credit and responsive sizes.'); }
    }} render={({ open }: any) => <Button variant="secondary" onClick={open}>{image?.url ? `Replace ${label}` : `Choose ${label}`}</Button>} /></MediaUploadCheck>
    {image?.url && <>
      <img src={image.url} alt={image.alt} style={{ maxHeight: 260, maxWidth: '100%', width: 'auto', height: 'auto' }} />
      <TextControl __nextHasNoMarginBottom label={`${label} alt text`} help="Describe the image for readers who cannot see it. Captions and credits are separate." value={image.alt} onChange={(alt: string) => { selection.current++; onChange({ ...image, alt }); }} />
      {image.credit && <p>Photo: {image.credit}</p>}
      <Button variant="tertiary" isDestructive onClick={() => { selection.current++; onChange({ url: '', alt: '' }); }}>Remove {label}</Button>
    </>}
    {error && <p role="status">{error}</p>}
  </div>;
}
